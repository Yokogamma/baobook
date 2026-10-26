// The start's IndexedDB upgrade waits for another tab instead of locking the device (docs/IDB-BARRIER-PLAN.md §3, PR 1). After #100 raised the
// database from v3 to v4, a frozen Android tab kept its v3 connection: the upgrade request got no event at all (no `blocked`), hit the start's 8 s
// silence deadline and the device went view-only under the `storage` lock. Now the start's upgrade request has no deadline: after 3 s of silence the
// strip says another Baobook tab or the app seems to be asleep (`lock.waitSilent`), after a lasting `blocked` that one holds the storage
// (`lock.waitTab`), after 60 s it names no cause and shows «Оновити» (`lock.waitLong`), and when the holder lets go the start goes on in the same
// page, without a reload. The hang is reproduced with real IndexedDB: a holder page keeps a connection and ignores versionchange, and an init script
// withholds the `blocked` event from the app's versioned requests (the versionless open is left alone), as the Android browser did. An open later in
// the session keeps the `blocked` lock. A second tab of this code queued behind the wait waits too (the waiting tab holds the Web Lock
// baobook:idb-upgrade, IDB-BARRIER-PLAN §4.7) and goes on in the same page; no lock is left behind after two tabs start together.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');   // the same origin without the app: the holder
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const SHOTS=path.join(os.tmpdir(),'sheet-tests'); fs.mkdirSync(SHOTS,{recursive:true}); const shot=(pg,n)=>pg.screenshot({path:path.join(SHOTS,'idbwait-'+n+'.png')}).catch(()=>{});
const CUR=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8'), OLD=CUR.replace('const IDB_VER=4,','const IDB_VER=3,');
ok('0 the current code knows IndexedDB version 4; the old page is served with 3', CUR.includes('const IDB_VER=4,') && OLD!==CUR);

const SILENT=/Схоже, інша вкладка Baobook або застосунок відкриті й заснули/, HOLDS=/не відпускають сховище/, LONG=/Сховище досі не вдалося відкрити/, STORAGE=/Сховище браузера не відкрилося/, BLOCKED=/Закрийте інші вкладки Baobook/;
// every context: the versioned/versionless requests counted; with noBlocked the versioned ones never deliver `blocked` to the page (the Android hang)
async function context(noBlocked){ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, serviceWorkers:'block'});
  await ctx.addInitScript(nb=>{ const open=IDBFactory.prototype.open; window.__opens=[];
    IDBFactory.prototype.open=function(name, v){ const r=open.apply(this, arguments); if(name==='sheet') window.__opens.push(v||0);
      if(nb && v && name==='sheet'){ Object.defineProperty(r,'onblocked',{configurable:true, get(){ return null; }, set(){} }); const add=r.addEventListener; r.addEventListener=function(t,...a){ if(t==='blocked') return; return add.call(this,t,...a); }; }
      return r; }; }, !!noBlocked);
  return ctx; }
const page=async ctx=>{ const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); return p; };
const oldPage=async ctx=>{ const p=await page(ctx); await p.route(u=>{ const x=new URL(u); return x.pathname==='/' || x.pathname==='/index.html'; }, r=>r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:OLD})); return p; };
const msg=p=>p.locator('#roStrip .rostrip').isVisible().then(v=>v? p.locator('#roMsg').innerText() : '');
const waitMsg=(p,re,ms)=>until(async()=>{ const m=await msg(p); return re.test(m)? m : null; }, ms);
const btns=p=>p.evaluate(()=>Object.fromEntries(['roRestore','roPurge','roExport','roReload'].map(k=>[k, !document.getElementById(k).hidden])));
const opens=p=>p.evaluate(()=>window.__opens.slice());
const fbKeys=p=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')));
const settings=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));
const items=p=>p.locator('#list .item').allInnerTexts();
const mark=p=>p.evaluate(()=>{ window.__doc=1; return performance.timeOrigin; });   // the same document later means no reload (framenavigated also fires for replaceState)
const same=(p,t)=>p.evaluate(t=>window.__doc===1 && performance.timeOrigin===t, t).catch(()=>false);
const dbState=p=>p.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; if(!d.objectStoreNames.contains('sync')){ const v=d.version; d.close(); return res({version:v}); }
  const g=d.transaction('sync','readonly').objectStore('sync').get('format'); g.onsuccess=()=>{ const v=d.version; d.close(); res({version:v, format:g.result? g.result.v : null}); }; }; r.onerror=()=>res(null); }));
const editable=p=>p.evaluate(()=>!document.getElementById('sheet').inert && document.getElementById('ttl').contentEditable!=='false');
async function typeAt(p,x,y,text){ await p.mouse.click(x,y); await p.keyboard.type(text); await p.keyboard.press('Escape'); await p.waitForTimeout(700); }
// a device at v3 with a note (written by the page of the code before #100), then a holder at v3 that ignores versionchange
async function v3device(ctx){ const O=await oldPage(ctx); await O.goto(SITE); await ready(O); await typeAt(O,500,300,'нотатка з v3');
  ok('  the old page wrote its note into a v3 database', (await dbState(O)).version===3);
  await O.goto(SITE+'blank.html'); await O.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // onversionchange left unset: the connection stays open
  return O; }

/* ── 1. the Android hang: a holder at v3 that never lets go, and no `blocked` ── */
{ const ctx=await context(true); const H=await v3device(ctx); const A=await page(ctx);
  ok('1 the device has used IndexedDB before (idbOk), so the code before this change would lock it', typeof (await settings(H)).idbOk==='number');
  const t0=Date.now(); await A.goto(SITE); await A.waitForSelector('html[data-ready]',{state:'attached'});
  const m0=await waitMsg(A, /Сховище браузера відкривається/, 2500);
  const m1=await waitMsg(A, SILENT, 6000), t1=Date.now(); await shot(A,'1-silent');
  ok('1a the strip says «opening» first, then that another tab seems asleep ('+((Date.now()-t0)/1000).toFixed(1)+' s)', !!m0 && !!m1);
  const b=await btns(A); ok('1b no button on the waiting strip ('+JSON.stringify(b)+')', !b.roRestore && !b.roPurge && !b.roExport && !b.roReload);
  await A.waitForTimeout(Math.max(0, 12000-(Date.now()-t0)));
  ok('1c after 12 s it still waits: no `storage` lock, nothing written to localStorage, the sheet inert', SILENT.test(await msg(A)) && !(await fbKeys(A)).length && !(await editable(A)) && !(await items(A)).length);
  ok('1d one versionless open and one upgrade request, no retry ('+JSON.stringify(await opens(A))+')', JSON.stringify(await opens(A))==='[0,4]');
  // hidden for a while and shown again: no probe, no reload, still waiting
  await A.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true, get:()=>true}); Object.defineProperty(document,'visibilityState',{configurable:true, get:()=>'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
  await A.waitForTimeout(3000);
  await A.evaluate(()=>{ delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await A.waitForTimeout(1500);
  ok('1e hidden and shown again: still waiting, no further open', SILENT.test(await msg(A)) && JSON.stringify(await opens(A))==='[0,4]');
  // the long wait: no cause named, «Оновити» shown, the request still alive
  const m2=await waitMsg(A, LONG, 75000-(Date.now()-t1)); await shot(A,'1-long');   // 60 s after the silent strip showed, with room for a slow runner
  ok('1f after 60 s the strip names no cause and offers «Оновити» ('+((Date.now()-t1)/1000).toFixed(0)+' s after the silent strip)', !!m2 && (await btns(A)).roReload && !(await btns(A)).roExport);
  const doc=await mark(A);
  await H.evaluate(()=>window.__hold.close());
  const li=await until(async()=>{ try{ const l=await items(A); return l.some(t=>/нотатка з v3/.test(t))? l : null; }catch(_){ return null; } }, 5000);   // a navigation (the code before this change reloads) is a failed check, not an abort
  ok('1g the holder lets go: the start goes on in the same page with the v3 note, no reload, no strip', !!li && await same(A,doc) && !(await msg(A)));
  const st=await dbState(A);
  ok('1h the database is v4 with format 4 ('+JSON.stringify(st)+')', st.version===4 && st.format===4);
  await typeAt(A,500,500,'після очікування');
  ok('1i the sheet is editable and the edit is stored', await editable(A) && await A.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, g=d.transaction('notes','readonly').objectStore('notes').getAll(); g.onsuccess=()=>{ d.close(); res(JSON.stringify(g.result).includes('після очікування')); }; }; })));
  ok('1j no page errors', !A.errs.length && !H.errs.length); await ctx.close(); }

/* ── 2. the same holder with `blocked` delivered; a second tab of this code queued behind the wait ── */
{ const ctx=await context(false); const H=await v3device(ctx); const A=await page(ctx);
  const t0=Date.now(); await A.goto(SITE); await A.waitForSelector('html[data-ready]',{state:'attached'});
  const m=await waitMsg(A, HOLDS, 6000); await shot(A,'2-blocked');
  ok('2 a lasting `blocked`: the strip says another tab holds the storage ('+((Date.now()-t0)/1000).toFixed(1)+' s)', !!m);
  await A.waitForTimeout(2000);
  ok('2a no `blocked` lock: still waiting', HOLDS.test(await msg(A)) && !BLOCKED.test(await msg(A)));
  ok('2a\' the waiting tab holds the upgrade lock (IDB-BARRIER-PLAN §4.7)', await A.evaluate(()=>navigator.locks.query().then(q=>q.held.some(l=>l.name==='baobook:idb-upgrade'))));
  const C=await page(ctx); await C.goto(SITE);
  await C.waitForTimeout(9000);   // past the versionless open's 8 s deadline
  const mc=await msg(C);
  ok('2b a second tab queued behind the wait waits too, not the `storage` lock ('+mc.slice(0,40)+'…)', SILENT.test(mc) && !STORAGE.test(mc));
  const docC=await mark(C), doc=await mark(A);
  await H.evaluate(()=>window.__hold.close());
  const li=await until(async()=>{ try{ const l=await items(A); return l.some(t=>/нотатка з v3/.test(t))? l : null; }catch(_){ return null; } }, 5000);
  ok('2c the holder lets go: the start goes on in the same page, no reload', !!li && await same(A,doc) && !(await msg(A)));
  const lc=await until(async()=>{ try{ const l=await items(C); return l.some(t=>/нотатка з v3/.test(t)) && !(await msg(C))? l : null; }catch(_){ return null; } }, 15000);
  ok('2d the second tab goes on too, in the same page, with no upgrade request of its own ('+JSON.stringify(await opens(C))+')', !!lc && await same(C,docC) && await editable(C) && JSON.stringify(await opens(C))==='[0]');
  ok('2f no tab holds the upgrade lock once the upgrade is done', !(await A.evaluate(()=>navigator.locks.query().then(q=>q.held.concat(q.pending).some(l=>l.name==='baobook:idb-upgrade')))));
  ok('2e no page errors', !A.errs.length && !C.errs.length); await ctx.close(); }

/* ── 2g. two tabs of this code starting together on a v3 database, no holder: both start, and no upgrade lock is left behind (one release per request) ── */
{ const ctx=await context(false); const O=await v3device(ctx); await O.evaluate(()=>window.__hold.close()); await O.goto('about:blank');
  const A=await page(ctx), B=await page(ctx); await Promise.all([A.goto(SITE), B.goto(SITE)]); await Promise.all([ready(A), ready(B)]); await A.waitForTimeout(500);
  const left=await A.evaluate(()=>navigator.locks.query().then(q=>q.held.concat(q.pending).filter(l=>l.name==='baobook:idb-upgrade').length));
  ok('2g two tabs started together: both show the v3 note, no upgrade lock left ('+left+')', (await items(A)).some(t=>/нотатка з v3/.test(t)) && (await items(B)).some(t=>/нотатка з v3/.test(t)) && left===0);
  ok('2h no page errors', !A.errs.length && !B.errs.length); await ctx.close(); }

/* ── 3. a new device: the holder keeps the empty v1, no `blocked`: the start waits, never the localStorage mode ── */
{ const ctx=await context(true); const H=await page(ctx); await H.goto(SITE+'blank.html');
  await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // an empty v1, held
  const A=await page(ctx); await A.goto(SITE); await A.waitForSelector('html[data-ready]',{state:'attached'});
  const m=await waitMsg(A, SILENT, 6000); await A.waitForTimeout(7000);
  ok('3 a new device waits with the strip, past the 8 s deadline', !!m && SILENT.test(await msg(A)));
  ok('3a no localStorage mode: no note key, no «(резервне сховище)», no idbOk yet', !(await fbKeys(A)).length && !/резервне/.test(await A.locator('#storInfo').innerText().catch(()=>'')) && (await settings(A)).idbOk===undefined);
  await H.evaluate(()=>window.__hold.close()); await ready(A);
  ok('3b the holder lets go: a normal start, idbOk written, the database at v4', typeof (await settings(A)).idbOk==='number' && (await dbState(A)).version===4 && !(await msg(A)));
  ok('3c no page errors', !A.errs.length); await ctx.close(); }

/* ── 4. an open later in the session keeps today's `blocked` lock ── */
{ const ctx=await context(false); const A=await page(ctx); await A.goto(SITE); await ready(A); await typeAt(A,500,300,'до видалення');
  const H=await page(ctx); await H.goto(SITE+'blank.html');
  await H.evaluate(()=>new Promise(res=>{ const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=()=>res(); }));   // A's connection goes (idbLost: a delete)
  await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // a fresh empty v1, held
  await typeAt(A,500,400,'після видалення');   // the save reopens the database: v1, then an upgrade that the holder blocks
  const m=await waitMsg(A, BLOCKED, 8000);
  ok('4 a started page whose reopen is blocked gets the `blocked` lock as before, not the start\'s waiting strip', !!m && !HOLDS.test(m));
  await H.evaluate(()=>window.__hold.close());
  ok('4a no page errors', !A.errs.length); await ctx.close(); }

/* ── 5. the frozen variant: a page of the code before #100 frozen by the lifecycle API (desktop Chromium does not hang; a guard of that path) ── */
{ const ctx=await context(false); const O=await oldPage(ctx); await O.goto(SITE); await ready(O); await typeAt(O,500,300,'заморожена');
  const cdp=await ctx.newCDPSession(O); await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
  const A=await page(ctx); await A.goto(SITE);
  const st=await until(async()=>{ const l=await items(A).catch(()=>[]); if(l.some(t=>/заморожена/.test(t))) return 'started'; return (SILENT.test(await msg(A)) || HOLDS.test(await msg(A)))? 'waiting' : null; }, 15000);
  await cdp.send('Page.setWebLifecycleState',{state:'active'});
  const li=await until(async()=>{ const l=await items(A).catch(()=>[]); return l.some(t=>/заморожена/.test(t))? l : null; }, 15000);
  const mo=await waitMsg(O, /оновився в іншій вкладці/, 8000);
  ok('5 with a frozen old page the new one starts ('+st+') and the old one turns view-only once active', !!li && !!mo);
  ok('5a no page errors', !A.errs.length); await ctx.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
