// The format barrier (docs/IDB-BARRIER-PLAN.md §4, PR 2): old tabs are stopped by the `format` record in store `sync`, not by an IndexedDB version
// upgrade that a frozen tab cannot answer. Every tab records its FORMAT at start (an ordinary write: nobody is waited for) and tells the other tabs;
// every write transaction reads the format first and, when it is above the tab's own, writes nothing, rejects with {code:'locked'} and turns the tab
// view-only («оновився в іншій вкладці»). A tab that missed the message (frozen, as here: the message is dropped by an init script) stops at its
// first write, through any path (the sync core's SDB, idb.tx, idb.run), or when it is shown again. A «newer» page is the current index.html served
// with a higher FORMAT (and, for a real upgrade, a higher IDB_VER) to that page only.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const CUR=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
const NEW5=CUR.replace('const FORMAT=4,','const FORMAT=5,'), UP5=NEW5.replace('const IDB_VER=4,','const IDB_VER=5,');
ok('0 the current code has FORMAT 4 and IDB_VER 4; the newer pages are served with FORMAT 5 (and IDB_VER 5)', NEW5!==CUR && UP5!==NEW5);

const UPDATED=/Baobook оновився в іншій вкладці/, UNSAVED=/останню правку не вдалося зберегти/, NEWER=/старша за ваші дані/, SILENT=/Схоже, інша вкладка Baobook/;
// o.drop: the `format` message never reaches the page (as a frozen tab misses it); o.noBlocked: versioned opens never deliver `blocked` (appidbwait)
async function context(){ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, serviceWorkers:'block'});
  await ctx.addInitScript(()=>{ if(!sessionStorage.getItem('__drop')) return; const BC=window.BroadcastChannel;
    window.BroadcastChannel=class extends BC{ set onmessage(f){ super.onmessage=e=>{ if(e.data && e.data.t==='format') return; f(e); }; } get onmessage(){ return super.onmessage; } }; });
  await ctx.addInitScript(()=>{ if(!sessionStorage.getItem('__noblocked')) return; const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name, v){ const r=open.apply(this, arguments); if(v && name==='sheet'){ Object.defineProperty(r,'onblocked',{configurable:true, get(){ return null; }, set(){} }); } return r; }; });
  return ctx; }
async function page(ctx, o={}){ const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
  if(o.body) await p.route(u=>{ const x=new URL(u); return x.pathname==='/' || x.pathname==='/index.html'; }, r=>r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:o.body}));
  if(o.drop || o.noBlocked){ await p.goto(SITE+'blank.html'); await p.evaluate(o=>{ if(o.drop) sessionStorage.setItem('__drop','1'); if(o.noBlocked) sessionStorage.setItem('__noblocked','1'); }, {drop:!!o.drop, noBlocked:!!o.noBlocked}); }
  if(!o.noGo){ await p.goto(SITE); await ready(p); }
  return p; }
const msg=p=>p.locator('#roStrip .rostrip').isVisible().then(v=>v? p.locator('#roMsg').innerText() : '');
const waitMsg=(p,re,ms)=>until(async()=>{ const m=await msg(p).catch(()=>''); return re.test(m)? m : null; }, ms);
const fmt=p=>p.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('sync','readonly').objectStore('sync').get('format'); g.onsuccess=()=>{ const v=d.version; d.close(); res({version:v, format:g.result? g.result.v : null}); }; }; }));
const stored=p=>p.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','versions','sync'],'readonly'); const a=t.objectStore('notes').getAll(), b=t.objectStore('versions').getAll(), c=t.objectStore('sync').getAll();
  t.oncomplete=()=>{ d.close(); res({notes:JSON.stringify(a.result), versions:b.result.length, sync:JSON.stringify(c.result.filter(x=>x.k!=='format' && !/^quota/.test(x.k)))}); }; }; }));
const state=p=>p.evaluate(()=>sheetDebug.fmt.state());
const lastBoot=p=>p.evaluate(()=>{ const all=JSON.parse(localStorage.getItem('sheet:boot')||'[]'); return all[all.length-1]||null; });
const diagDone=(p,ms,f=x=>x.other!=null)=>until(async()=>{ const r=await lastBoot(p).catch(()=>null); return r && r.x && f(r.x)? r : null; }, ms);   // the diagnosis written, with the answers it waits for
const fbKeys=p=>p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')));
const editable=p=>p.evaluate(()=>!document.getElementById('sheet').inert && document.getElementById('ttl').contentEditable!=='false');
async function typeAt(p,x,y,text){ await p.mouse.click(x,y); await p.keyboard.type(text); await p.keyboard.press('Escape'); await p.waitForTimeout(700); }

/* ── 1. a tab of a newer app records its format; an awake tab of this code turns view-only on the message, with no wait anywhere ── */
{ const ctx=await context(); const A=await page(ctx); await typeAt(A,500,300,'нотатка A');
  const t0=Date.now(); const N=await page(ctx,{body:NEW5}); const tN=Date.now()-t0;
  const f=await fmt(N);
  ok('1 the newer tab starts with no strip and no upgrade ('+tN+' ms, '+JSON.stringify(f)+')', !(await msg(N)) && f.version===4 && f.format===5);
  const m=await waitMsg(A, UPDATED, 3000);
  ok('1a the older tab turns view-only at once: «оновився в іншій вкладці», the sheet inert', !!m && !(await editable(A)));
  await A.locator('#newBtn').click(); await A.waitForTimeout(300);
  ok('1b «Нова» says view-only', /Зараз лише перегляд/.test(await A.locator('#toast').innerText()));
  ok('1c no page errors', !A.errs.length && !N.errs.length); await ctx.close(); }

/* ── 2. a tab that missed the message (frozen): its first save is refused inside the transaction, nothing is written, the edit stays exportable ── */
{ const ctx=await context(); const A=await page(ctx,{drop:true}); await typeAt(A,500,300,'до підняття');
  const before=await stored(A); const N=await page(ctx,{body:NEW5}); await A.waitForTimeout(800);
  ok('2 the message was dropped: the older tab is still editable', !(await msg(A)) && await editable(A));
  await typeAt(A,500,420,'після підняття'); const m=await waitMsg(A, UNSAVED, 4000); const st=await state(A);
  ok('2a its save is refused by the format guard (refused counts every transaction in flight that met the guard, each writing nothing): view-only, «останню правку не вдалося зберегти» ('+JSON.stringify(st)+')', !!m && st.lock==='updated' && st.refused>=1 && !st.db);
  ok('2b «Експортувати незбережене» is offered', /Експортувати незбережене/.test(await A.locator('#roExport').innerText()));
  const after=await stored(N);
  ok('2c nothing of the refused save is stored: the notes and the sync records are as before, no fallback key', after.notes===before.notes && after.sync===before.sync && !(await fbKeys(A)).length);
  ok('2d no page errors', !A.errs.length && !N.errs.length); await ctx.close(); }

/* ── 3. one write path per tab, each unlocked until its own write: the sync core (a named version; an import), idb.tx (an automatic version), idb.run (a delete) ── */
{ const ctx=await context(); const W=await page(ctx); await typeAt(W,500,300,'спільна нотатка'); await W.close();
  const P={core:await page(ctx,{drop:true}), imp:await page(ctx,{drop:true}), tx:await page(ctx,{drop:true}), run:await page(ctx,{drop:true})};
  const before=await stored(P.core); const N=await page(ctx,{body:NEW5}); await N.waitForTimeout(800);
  const ops={core:'named', imp:'imp', tx:'auto', run:'del'};
  for(const [k,p] of Object.entries(P)){ const s0=await state(p); const code=await p.evaluate(op=>sheetDebug.fmt.ops[op]().then(()=>'ok', e=>e && e.code), ops[k]); const s1=await state(p);
    ok('3 '+k+': unlocked before its own write ('+JSON.stringify(s0)+'), refused inside the transaction with code «locked» ('+code+'), then view-only', s0.lock===null && s0.refused===0 && code==='locked' && s1.refused===1 && s1.lock==='updated'); }
  const after=await stored(N);
  ok('3a nothing of the four writes is stored: the notes, the versions and the sync records are as before', after.notes===before.notes && after.versions===before.versions && after.sync===before.sync);
  ok('3b no page errors (vwrite\'s handlers never ran on the aborted transaction)', Object.values(P).every(p=>!p.errs.length) && !N.errs.length); await ctx.close(); }

/* ── 4. coming back: a hidden tab that missed the message reads the format when it is shown, before any write ── */
{ const ctx=await context(); const A=await page(ctx,{drop:true});
  await A.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true, get:()=>true}); Object.defineProperty(document,'visibilityState',{configurable:true, get:()=>'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
  const N=await page(ctx,{body:NEW5}); await N.waitForTimeout(500);
  await A.evaluate(()=>{ delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  const m=await waitMsg(A, UPDATED, 3000); const st=await state(A);
  ok('4 shown again it turns view-only without a write ('+JSON.stringify(st)+')', !!m && st.lock==='updated' && st.refused===0);
  ok('4a no page errors', !A.errs.length); await ctx.close(); }

/* ── 5. the start records the format: a v4 database without the record gets it back; two newer tabs starting together both start ── */
{ const ctx=await context(); const A=await page(ctx); await typeAt(A,500,300,'без формату');
  await A.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('sync','readwrite'); t.objectStore('sync').delete('format'); t.oncomplete=()=>{ d.close(); res(); }; }; }));
  ok('5 the record is gone', (await fmt(A)).format===null);
  await A.reload(); await ready(A);
  ok('5a a start writes it back with no upgrade (v4, format 4)', JSON.stringify(await fmt(A))==='{"version":4,"format":4}');
  await A.close(); const [N1,N2]=await Promise.all([page(ctx,{body:NEW5, noGo:true}), page(ctx,{body:NEW5, noGo:true})]);
  await Promise.all([N1.goto(SITE), N2.goto(SITE)]); await Promise.all([ready(N1), ready(N2)]); await N1.waitForTimeout(500);
  ok('5b two newer tabs starting together: both start, editable, format 5', await editable(N1) && await editable(N2) && (await fmt(N1)).format===5 && !(await msg(N1)) && !(await msg(N2)));
  ok('5c no page errors', !N1.errs.length && !N2.errs.length); await ctx.close(); }

/* ── 6. a rollback: a database whose format is above this code's opens view-only (the `newer` rule, now without a version change) ── */
{ const ctx=await context(); const N=await page(ctx,{body:NEW5}); await typeAt(N,500,300,'нова версія'); await N.close();
  const A=await page(ctx); const m=await waitMsg(A, NEWER, 3000);
  ok('6 the current page on format 5 data is view-only: «старша за ваші дані»', !!m && !(await editable(A)) && (await fmt(A)).format===5);
  ok('6a no page errors', !A.errs.length); await ctx.close(); }

/* ── 7. a real upgrade after a raise: the format goes first (an awake tab of this code stops and closes its connection), then the upgrade waits for a
       deaf holder and goes on when it lets go ── */
{ const ctx=await context(); const A=await page(ctx); await typeAt(A,500,300,'перед оновленням');
  const H=await page(ctx,{noGo:true}); await H.goto(SITE+'blank.html'); await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // deaf to versionchange
  const N=await page(ctx,{body:UP5, noBlocked:true, noGo:true}); await N.goto(SITE);
  const ma=await waitMsg(A, UPDATED, 4000);
  ok('7 the older tab is stopped by the format before the upgrade runs, and lets its connection go', !!ma && !(await state(A)).db);
  const mn=await waitMsg(N, SILENT, 6000);
  ok('7a the newer tab waits for the deaf holder', !!mn);
  await H.evaluate(()=>window.__hold.close()); await ready(N);
  ok('7b the holder lets go: the newer tab goes on, the database at v5 with format 5, the note there', JSON.stringify(await fmt(N))==='{"version":5,"format":5}' && (await N.locator('#list .item').allInnerTexts()).some(t=>/перед оновленням/.test(t)));
  ok('7c no page errors ('+A.errs.concat(N.errs).join(' | ')+')', !A.errs.length && !N.errs.length); await ctx.close(); }

/* ── 8. a versionchange while the start's format transaction waits (here a delete; a newer app's upgrade is the same event): the connection closed by
       it is not adopted, so the start opens again and the tab writes into the new database instead of keeping a dead connection ── */
{ const ctx=await context(); const W=await page(ctx); await typeAt(W,500,300,'до видалення'); await W.close();
  const H=await page(ctx,{noGo:true}); await H.goto(SITE+'blank.html');
  await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('sync','readwrite'), s=t.objectStore('sync'); let go=true;   // a long write on `sync`: the start's format transaction queues behind it
    const spin=()=>{ if(go) s.get('spin').onsuccess=spin; }; spin(); d.onversionchange=()=>{ go=false; d.close(); }; window.__stop=()=>{ go=false; }; res(); }; }));
  const C=await page(ctx,{noGo:true});
  await C.addInitScript(()=>{ const tx=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(st, mode){ const t=tx.apply(this, arguments); if(st==='sync' && !window.__fmtTx){ window.__fmtTx=1; t.addEventListener('complete',()=>{ window.__fmtTx=2; }); } return t; }; });   // the start's format check (its first transaction on `sync` alone): created (1), done (2)
  await C.goto(SITE);
  const queued=await until(()=>C.evaluate(()=>window.__fmtTx===1).catch(()=>false), 5000); await C.waitForTimeout(300);
  ok('8 (setup) C\'s versionless open succeeded and its format transaction waits behind H\'s write', queued && await C.evaluate(()=>window.__fmtTx===1));
  await H.evaluate(()=>{ window.__del=new Promise(res=>{ const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=()=>res(); }); });   // versionchange at H and at C
  await H.evaluate(()=>window.__del); await ready(C);
  await typeAt(C,500,420,'після видалення'); await C.waitForTimeout(500);
  const saved=await C.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; if(!d.objectStoreNames.contains('notes')){ d.close(); return res(false); } const g=d.transaction('notes','readonly').objectStore('notes').getAll(); g.onsuccess=()=>{ d.close(); res(JSON.stringify(g.result).includes('після видалення')); }; }; }));
  ok('8 the start goes on after a versionchange during its format transaction: the edit is stored in the new database, no strip, no fallback key', saved && !(await msg(C)) && !(await fbKeys(C)).length);
  ok('8a no page errors', !C.errs.length); await ctx.close(); }

/* ── 9. the raise of the format fails (its transaction aborts): the newer tab never starts writing without the barrier. Once: the retry raises it
       and the start goes on. Always: the tab ends view-only (the device has used IndexedDB before), the format stays 4 and the older tab writes on ── */
const ABORT=mode=>{ const tx=IDBDatabase.prototype.transaction; let n=0;   // the start's format write aborts its transaction: the first time only, or every time
  IDBDatabase.prototype.transaction=function(st, m){ const t=tx.apply(this, arguments);
    if(st==='sync' && m==='readwrite' && (mode==='always' || n++===0)){ const os=t.objectStore.bind(t); t.objectStore=name=>{ const o=os(name), put=o.put.bind(o); o.put=v=>{ const r=put(v); if(v && v.k==='format') r.addEventListener('success',()=>{ try{ t.abort(); }catch(_){ window.__abortMissed=(window.__abortMissed||0)+1; } }); return r; }; return o; }; }
    return t; }; };
for(const mode of ['once','always']){
  const ctx=await context(); const A=await page(ctx,{drop:true}); await typeAt(A,500,300,'стара '+mode);
  const N=await page(ctx,{noGo:true}); await N.addInitScript(ABORT, mode);
  await N.route(u=>{ const x=new URL(u); return x.pathname==='/' || x.pathname==='/index.html'; }, r=>r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:NEW5}));
  await N.goto(SITE);
  if(mode==='once'){ await ready(N);
    ok('9 once: the aborted raise is retried, the newer tab starts with format 5', (await fmt(N)).format===5 && !(await msg(N)) && (await state(N)).lock===null);
    await typeAt(A,500,420,'після'); const m=await waitMsg(A, UNSAVED, 4000);
    ok('9a once: the older tab is then stopped by the guard', !!m); }
  else { const m=await waitMsg(N, /Сховище браузера не відкрилося/, 20000); const st=await state(N);
    const code=await N.evaluate(()=>sheetDebug.fmt.ops.imp().then(()=>'ok', e=>e && e.code || String(e)));
    ok('9b always: the newer tab never starts writing: view-only under the `storage` lock, its import refused ('+JSON.stringify(st)+', '+code+')', !!m && st.lock==='storage' && code!=='ok');
    await typeAt(A,500,420,'пише далі'); const f=await fmt(A);
    ok('9c always: the format stays 4 and the older tab writes on', f.format===4 && !(await msg(A))); }
  ok('9d '+mode+': no page errors ('+A.errs.concat(N.errs).join(' | ')+')', !A.errs.length && !N.errs.length); await ctx.close(); }

/* ── 10. the start's format check: an ordinary start reads the format and writes nothing; one that waits behind another tab's long write on `sync`
        tells so in the journal of starts: the step («читання формату сховища»), the other open tab, and that a read of another store answered ── */
{ const ctx=await context(); const H=await page(ctx); await typeAt(H,500,300,'журнал');
  const C=await page(ctx,{noGo:true});
  await C.addInitScript(()=>{ const tx=IDBDatabase.prototype.transaction; window.__rw=0; IDBDatabase.prototype.transaction=function(st, m){ if(st==='sync' && m==='readwrite') window.__rw++; return tx.apply(this, arguments); }; });
  await C.goto(SITE); await ready(C);
  ok('10 an ordinary start (format 4 stored) opens no readwrite transaction on `sync` for the format', await C.evaluate(()=>window.__rw===0));
  await C.close();
  await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('sync','readwrite'), s=t.objectStore('sync'); let go=true;   // H's long write on `sync` (a second connection of a started tab)
    const spin=()=>{ if(go) s.get('spin').onsuccess=spin; }; spin(); window.__stop=()=>{ go=false; t.oncomplete=()=>d.close(); }; res(); }; }));
  const D=await page(ctx,{noGo:true}); await D.goto(SITE);
  const rec=await diagDone(D, 10000, x=>x.other!=null && x.probe!=null && x.usage!=null && x.locks); await D.waitForTimeout(1600);   // past the 1.5 s the answers of the other tabs are counted
  Object.assign(rec.x, (await lastBoot(D)).x);
  const steps=(rec && rec.m || []).map(x=>x[0]);
  ok('10a the waiting start is past the request (db:open) and inside the format check (no db:fmt yet) ('+steps.join(',')+')', steps.includes('db:open') && !steps.includes('db:fmt'));
  ok('10b its diagnosis: the format check waits, one other open tab answered, the read of `notes` and a separate database answered quickly, the storage estimate is there ('+JSON.stringify(rec && rec.x)+')', rec && rec.x && rec.x.stage==='fmt' && rec.x.peers===1 && rec.x.probe>=0 && rec.x.probe<2000 && rec.x.other>=0 && rec.x.other<2000 && Array.isArray(rec.x.locks) && typeof rec.x.usage==='number');
  await H.evaluate(()=>window.__stop()); await ready(D);
  await D.click('#setBtn'); await D.waitForTimeout(200); const txt=await D.locator('#bootV').innerText();
  ok('10c the settings menu names the step and the diagnosis ('+txt.split('\n').slice(0,2).join(' | ')+')', /читання формату сховища/.test(txt) && /інших відкритих вкладок Baobook — 1/.test(txt));
  ok('10d no page errors', !H.errs.length && !D.errs.length); await ctx.close(); }

/* ── 10e. a start whose open request itself waits (queued behind another page's upgrade that a deaf holder blocks): the diagnosis says so ── */
{ const ctx=await context(); const W=await page(ctx); await typeAt(W,500,300,'черга'); await W.close();
  const H=await page(ctx,{noGo:true}); await H.goto(SITE+'blank.html'); await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // deaf
  const X=await page(ctx,{noGo:true}); await X.goto(SITE+'blank.html'); await X.evaluate(()=>{ indexedDB.open('sheet', 9); });   // a version change H never lets through
  const C=await page(ctx,{noGo:true}); await C.goto(SITE);
  await diagDone(C, 10000); await C.waitForTimeout(1600); const rec=await lastBoot(C);
  ok('10e the request has not answered: stage «open», a separate database opens quickly, no other started tab ('+JSON.stringify(rec && rec.x)+')', rec && rec.x && rec.x.stage==='open' && rec.x.probe===undefined && rec.x.other>=0 && rec.x.other<2000 && rec.x.peers===0);
  await ctx.close(); }

/* ── 10f. the request answers late (after the first diagnosis) and the format check then waits behind another tab's write: a second diagnosis, in the
        format check, with the probe of `notes`; the first one is kept ── */
{ const ctx=await context(); const H=await page(ctx); await typeAt(H,500,300,'пізно');
  await H.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('sync','readwrite'), s=t.objectStore('sync'); let go=true;
    const spin=()=>{ if(go) s.get('spin').onsuccess=spin; }; spin(); window.__stop=()=>{ go=false; t.oncomplete=()=>d.close(); }; res(); }; }));
  const C=await page(ctx,{noGo:true});
  await C.addInitScript(()=>{ const open=IDBFactory.prototype.open; IDBFactory.prototype.open=function(name, v){ const r=open.apply(this, arguments);   // the start's first versionless open answers 4 s late
    if(name==='sheet' && !v && !window.__late){ window.__late=1; let h=null; Object.defineProperty(r,'onsuccess',{configurable:true, get(){ return h; }, set(f){ h=f; r.addEventListener('success',e=>setTimeout(()=>f.call(r,e),4000)); }}); }
    return r; }; });
  await C.goto(SITE);
  const rec=await diagDone(C, 15000, x=>x.stage==='fmt' && x.probe!=null);
  ok('10f a late request gets a second diagnosis in its format check, with the probe, and keeps the first ('+JSON.stringify(rec && rec.x)+')', rec && rec.x.stage==='fmt' && rec.x.probe>=0 && rec.x.probe<2000 && rec.x.first && rec.x.first.stage==='open');
  await H.evaluate(()=>window.__stop()); await ready(C);
  ok('10g no page errors', !H.errs.length && !C.errs.length); await ctx.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
