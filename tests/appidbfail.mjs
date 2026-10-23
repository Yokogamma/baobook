// IndexedDB that exists but does not open (docs/IDB-FALLBACK-PLAN.md). On a device where it has worked before (sheet:settings.idbOk, or the legacy
// versSwept) a failed open is retried (300 and 900 ms after an `error` or a throw), a silent open is abandoned after 8 s with no retry behind it, and
// when every attempt fails the tab is view-only under the `storage` lock: the strip says why, with «Експорт» and «Оновити»; no note is written
// anywhere (no sheet:note: key, no empty «Без назви» stored); the storage line says the device's notes were not read; the account UI is off. A
// background probe reloads the page by itself when the storage opens again (never under a dialog or a share sheet, three times per tab session);
// a hung request's own late answer does the same. A device that never had IndexedDB keeps the localStorage mode. An owner change in another tab
// leaves the locked view as it is. The tab's own note survives the recovery.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');   // the same origin without the app, to set up a tab's storage
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const SHOTS=path.join(os.tmpdir(),'sheet-tests'); fs.mkdirSync(SHOTS,{recursive:true}); const shot=(pg,n)=>pg.screenshot({path:path.join(SHOTS,'idbfail-'+n+'.png')}).catch(()=>{});
const errs=[];

/* the wrapper of IDBFactory.prototype.open. The mode comes from sessionStorage.__idbfail (this tab) or localStorage.__idbfail (every tab of the context):
   '' passes through; 'error' returns a plain object as the request and fires its onerror ~100 ms later with the UnknownError DOMException (Chrome's
   shape, the r.onerror branch of idb.open); 'throw' throws the same out of open() (the catch branch of go()); 'once' is 'error' for one call and then
   clears itself; 'hang' returns a request whose handlers are never called, kept as window.__idbhang so the test can answer it (the deadline code only:
   a fake request is not in the browser's real connection queue, step 18 uses the real one). __idbpass lets that many calls through while a failing
   mode is set. Every call appends Date.now() to sessionStorage.__idbopens */
const WRAP=()=>{ const real=IDBFactory.prototype.open; const S=k=>{ try{ return sessionStorage.getItem(k); }catch(_){ return null; } }, L=k=>{ try{ return localStorage.getItem(k); }catch(_){ return null; } };
  const err=()=>new DOMException('Internal error opening backing store for indexedDB.open.','UnknownError');
  IDBFactory.prototype.open=function(){
    try{ const o=JSON.parse(S('__idbopens')||'[]'); o.push(Date.now()); sessionStorage.setItem('__idbopens', JSON.stringify(o)); }catch(_){}
    let mode=S('__idbfail') || L('__idbfail') || '';
    const pass=+(S('__idbpass')||0); if(mode && pass>0){ sessionStorage.setItem('__idbpass', String(pass-1)); mode=''; }
    if(mode==='once'){ if(S('__idbfail')==='once') sessionStorage.removeItem('__idbfail'); if(L('__idbfail')==='once') localStorage.removeItem('__idbfail'); mode='error'; }
    if(!mode) return real.apply(this, arguments);
    if(mode==='throw') throw err();
    const r={onsuccess:null, onerror:null, onblocked:null, onupgradeneeded:null, result:null, error:null, readyState:'pending'};
    if(mode==='hang'){ window.__idbhang=r; return r; }
    setTimeout(()=>{ r.error=err(); r.readyState='done'; if(r.onerror) r.onerror({target:r, type:'error'}); }, 100); return r; }; };
// the emulator flag goes into the settings before the first start (as tests/emu/lib/app.mjs does): FB is set on 127.0.0.1, so the account UI is real
const EMU=()=>{ try{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); if(!s.emulator){ s.emulator=true; localStorage.setItem('sheet:settings', JSON.stringify(s)); } }catch(_){} };
// a share sheet that stays open until the test settles it (a touch context, step 14)
const SHARE=()=>{ navigator.canShare=()=>true; navigator.share=()=>new Promise((res,rej)=>{ window.__idbshare={res,rej}; }); };

const external=[];   // requests that leave for another host (a Google host would be one): aborted and counted
async function context(o={}){ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true, serviceWorkers:'block', ...o});
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r=>{ external.push(r.request().url()); r.abort().catch(()=>{}); });
  await ctx.addInitScript(WRAP); await ctx.addInitScript(EMU); return ctx; }
const fresh=async ctx=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); return pg; };
const go=async(pg,url)=>{ await pg.bringToFront(); await pg.goto(url||SITE); };
const roMsg=pg=>pg.evaluate(()=>{ const s=document.getElementById('roStrip'); return !s || s.hidden? '' : document.getElementById('roMsg').textContent; }).catch(()=>'');   // '' while the page navigates
const OPENING=/^Сховище браузера відкривається…$/, LOCKED=/^Сховище браузера не відкрилося, тож/, BACK=/^Сховище браузера знову доступне/;
const lockMsg=(pg,re,t)=>until(async()=>{ const m=await roMsg(pg); return re.test(m)? m : null; }, t);
const setMode=(pg,m)=>pg.evaluate(m=>{ if(m) localStorage.setItem('__idbfail',m); else localStorage.removeItem('__idbfail'); }, m);
const opens=pg=>pg.evaluate(()=>JSON.parse(sessionStorage.getItem('__idbopens')||'[]'));
const resetOpens=pg=>pg.evaluate(()=>sessionStorage.removeItem('__idbopens'));
const settings=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));
const fbKeys=pg=>pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).map(k=>[k,localStorage.getItem(k)]));
const items=pg=>pg.locator('#list .item').allInnerTexts();
const sheetText=pg=>pg.locator('#sheet').innerText();
const storLine=pg=>pg.locator('#storInfo').innerText();
const buttons=pg=>pg.evaluate(()=>Object.fromEntries(['roRestore','roPurge','roExport','roReload'].map(id=>[id, !document.getElementById(id).hidden])));
const reloads=pg=>pg.evaluate(()=>sessionStorage.getItem('sheet:idb-reloads'));
// the main frame navigates within t ms (a reload the app makes by itself), or does not
const navWait=(pg,t)=>pg.waitForEvent('domcontentloaded',{timeout:t}).then(()=>true).catch(()=>false);   // a new document (an address change inside the page is no reload)
// a reload from inside the page ('clear' removes the failing mode in the same evaluate, so the probe due 5 s after a lock cannot pre-empt the
// navigation); the new document has committed when it returns, so ready() cannot see the old one
const reload=async(pg, pre)=>{ const nav=navWait(pg,8000); await pg.evaluate(pre=>{ if(pre==='clear') localStorage.removeItem('__idbfail'); setTimeout(()=>location.reload(),0); }, pre||''); await nav; };
// a click makes a block on the sheet (once the start is done: before it the sheet is inert); the text goes in once the caret is in it
const typeAt=async(pg,x,y,t)=>{ await pg.bringToFront(); await pg.waitForFunction(()=>!document.getElementById('sheet').inert,null,{timeout:10000}); await pg.mouse.click(x,y);
  try{ await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sheet .blk')),null,{timeout:3000}); }
  catch(e){ console.log('typeAt: no caret', JSON.stringify(await pg.evaluate(([x,y])=>({blk:document.querySelectorAll('#sheet .blk').length, active:document.activeElement && (document.activeElement.id||document.activeElement.className||document.activeElement.tagName), at:(el=>el && (el.id||el.className||el.tagName))(document.elementFromPoint(x,y)), inert:document.getElementById('sheet').inert, dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id), app:document.querySelector('.app').className, strip:document.getElementById('roStrip').hidden}),[x,y]).catch(()=>null))); await shot(pg,'typeAt-fail'); throw e; }
  await pg.keyboard.type(t); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); };
// what the database holds (the test's own open, with the mode clear): the notes store
const dbNotes=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const q=d.transaction('notes','readonly').objectStore('notes').getAll(); q.onsuccess=()=>{ d.close(); res(q.result); }; q.onerror=()=>{ d.close(); res(null); }; }; r.onerror=()=>res(null); }));
// the hung request answered by the test: a success with a real connection, or the UnknownError
const hangSuccess=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const h=window.__idbhang; h.result=r.result; h.readyState='done'; h.onsuccess({target:h, type:'success'}); res(true); }; r.onerror=()=>res(false); }));
const hangError=pg=>pg.evaluate(()=>{ const h=window.__idbhang; h.error=new DOMException('Internal error opening backing store for indexedDB.open.','UnknownError'); h.readyState='done'; h.onerror({target:h, type:'error'}); });
const download=async(pg, click)=>{ const [dl]=await Promise.all([pg.waitForEvent('download'), click()]); return JSON.parse(fs.readFileSync(await dl.path(),'utf8')); };
const has=(list,re)=>list.some(n=>re.test(JSON.stringify(n)));
const flat=s=>String(s).replace(/\s+/g,' ');
// a device of its own with the marker: one normal start that stores a note and idbOk, the page closed, so the tabs a scenario opens there are
// the only ones of the context (a channel message reaches every tab of a context, a healthy third tab would take it)
async function device(){ const c=await context(); const p=await fresh(c); await go(p); await ready(p); await typeAt(p,500,300,'перша нотатка'); await p.close(); return c; }

const ctx=await context(); const pg=await fresh(ctx);

/* ── 1. a normal start on a new device: the note is in IndexedDB, idbOk is written, the account UI is real ── */
await go(pg); await ready(pg);
await typeAt(pg,500,300,'перша нотатка');
{ const s=await settings(pg), n=await dbNotes(pg);
  ok('1 the first start writes idbOk ('+typeof s.idbOk+') and the note is in IndexedDB', typeof s.idbOk==='number' && s.idbOk>0 && has(n||[],/перша нотатка/) && !(await fbKeys(pg)).length);
  ok('1b the account UI is on: «Увійти через Google» in the menu', !(await pg.evaluate(()=>document.getElementById('signInBtn').hidden)) && /Увійти через Google/.test(await pg.locator('#signInLbl').innerText())); }

/* ── 2–4. every open fails (error / throw), then the mode is cleared, then it fails once ── */
async function failRun(mode){
  await setMode(pg, mode); await resetOpens(pg); external.length=0; await reload(pg);
  const m=await lockMsg(pg, LOCKED, 15000); await ready(pg); await shot(pg,'2-'+mode);
  const o=await opens(pg), b=await buttons(pg), li=await items(pg), st=await storLine(pg);
  ok('2 '+mode+': the strip says the storage did not open ('+(m||await roMsg(pg)).slice(0,40)+'…)', LOCKED.test(m||''));
  ok('2a '+mode+': three attempts, the gaps ≥ 250 and ≥ 800 ms ('+o.length+': '+o.slice(1).map((t,i)=>t-o[i]).join(', ')+')', o.length>=3 && o[1]-o[0]>=250 && o[2]-o[1]>=800);
  ok('2b '+mode+': «Експорт» and «Оновити» on the strip, the trash buttons hidden ('+JSON.stringify(b)+')', b.roExport && b.roReload && !b.roRestore && !b.roPurge && /^Експорт$/.test((await pg.locator('#roExport').innerText()).trim()));
  ok('2c '+mode+': the sheet is inert, the list shows one «Без назви»', await pg.evaluate(()=>document.getElementById('sheet').inert && document.getElementById('ttl').contentEditable==='false') && li.length===1 && /Без назви/.test(li[0]));
  ok('2d '+mode+': the storage line says the device\'s notes were not read, with no count and no «(резервне сховище)» ('+st+')', /^Сховище браузера не відкрилося, нотатки пристрою не прочитані · експорт:/.test(st) && !/нотат(ка|ки|ок) на цьому/.test(st) && !/резервне сховище/.test(st));
  const ext=external.filter(u=>!/fonts\.(googleapis|gstatic)\.com/.test(u));   // the font stylesheet is a static link of the page, not the account
  ok('2e '+mode+': the account UI is off and no request left for a Google host ('+ext.join(', ')+')', await pg.evaluate(()=>document.getElementById('signInBtn').hidden && document.getElementById('accHr').hidden && document.getElementById('syncBtn').hidden) && !ext.length);
  await pg.mouse.click(500,400); await pg.keyboard.type('нічого'); await pg.locator('#newBtn').click(); await pg.waitForTimeout(400);
  ok('2f '+mode+': typing and «Нова» change nothing, the toast says view-only', !(await pg.locator('#sheet .blk').count()) && (await items(pg)).length===1 && /Зараз лише перегляд/.test(await pg.locator('#toast').innerText()));
  ok('2g '+mode+': no sheet:note: key in localStorage', !(await fbKeys(pg)).length);
  // 3. the mode cleared and the page reloaded from the same evaluate (the probe, due 5 s after the lock, cannot pre-empt it)
  await reload(pg,'clear'); await ready(pg); await pg.waitForTimeout(300);
  const li3=await items(pg);
  ok('3 '+mode+': a normal start again shows exactly the typed note, no «Без назви», no strip, no fallback mark', li3.length===1 && /перша нотатка/.test(li3[0]) && !(await roMsg(pg)) && !/резервне/.test(await storLine(pg)) && (await dbNotes(pg)).length===1);
  // 4. one failure, then the retry succeeds
  await setMode(pg, 'once'); await resetOpens(pg); await reload(pg); await ready(pg); await pg.waitForTimeout(300);
  const o4=await opens(pg);
  ok('4 '+mode+': after one failure the retry opens the database: 2 attempts, no strip, the note shows ('+o4.length+')', o4.length===2 && !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||''));
  await typeAt(pg,500,mode==='error'? 500 : 650,'правка після повтору '+mode);   // a place on the sheet with no block yet
  ok('4a '+mode+': an edit is saved into IndexedDB', has((await dbNotes(pg))||[], new RegExp('правка після повтору '+mode)) && !(await fbKeys(pg)).length); }
await failRun('error'); await failRun('throw');

/* ── 5. a request that never answers: the waiting strip after 1 s, the lock after 8 s with one attempt, no probe; its late success reloads ── */
await setMode(pg,'hang'); await resetOpens(pg); await reload(pg);
{ const m1=await lockMsg(pg, OPENING, 3000); const b1=await buttons(pg);
  ok('5 within ~2 s the strip says the storage is opening, every button hidden ('+JSON.stringify(b1)+')', OPENING.test(m1||'') && !b1.roRestore && !b1.roPurge && !b1.roExport && !b1.roReload);
  const m2=await lockMsg(pg, LOCKED, 12000); await ready(pg); await shot(pg,'5-hang');
  ok('5a the lock within 12 s with exactly one attempt (no retry behind a silent request) ('+(await opens(pg)).length+')', LOCKED.test(m2||'') && (await opens(pg)).length===1);
  await pg.waitForTimeout(12000);
  ok('5b no probe follows a silent attempt: the count stays 1 after 12 s', (await opens(pg)).length===1);
  await setMode(pg,''); const nav=navWait(pg,5000); ok('5c the hung request answered with a real connection', await hangSuccess(pg));
  ok('5d the dead attempt\'s late success closes it and reloads the page by itself', await nav); await ready(pg);
  ok('5e the reload landed in a healthy start: editable, the note there, the reload count cleared', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'') && (await reloads(pg))===null); }

/* ── 6. the lock with copies in localStorage: shown read-only, exported, left byte for byte ── */
{ const T=Date.now(); await pg.evaluate(T=>{ localStorage.setItem('__idbfail','error');
    localStorage.setItem('sheet:note:x~tabq~1', JSON.stringify({id:'x',title:'Резервна копія',blocks:[{id:'a',fx:0.1,row:2,text:'з резервного ключа'}],created:T-9e5,updated:T-100}));
    localStorage.setItem('sheet:note:y', JSON.stringify({id:'y',title:'Плоский ключ',blocks:[{id:'b',fx:0.1,row:2,text:'з плоского ключа'}],created:T-9e5,updated:T-200})); }, T);
  const before=await fbKeys(pg); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await shot(pg,'6-copies');
  const li=await items(pg);
  ok('6 both copies show as notes ('+li.length+')', li.length===2 && li.some(t=>/Резервна копія/.test(t)) && li.some(t=>/Плоский ключ/.test(t)));
  await pg.locator('#list .item').filter({hasText:'Плоский ключ'}).click(); await pg.waitForTimeout(200);
  ok('6a a copy opens read-only', /з плоского ключа/.test(await sheetText(pg)) && await pg.evaluate(()=>document.getElementById('sheet').inert));
  const data=await download(pg, ()=>pg.locator('#roExport').click());
  ok('6b «Експорт» on the strip carries both and no history', data.notes.length===2 && has(data.notes,/з резервного ключа/) && has(data.notes,/з плоского ключа/) && !data.history);
  await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await pg.locator('#newBtn').click(); await pg.waitForTimeout(500);
  ok('6c after a tab sync and «Нова» the keys are byte for byte as seeded', JSON.stringify(await fbKeys(pg))===JSON.stringify(before));
  await pg.evaluate(()=>{ localStorage.removeItem('sheet:note:x~tabq~1'); localStorage.removeItem('sheet:note:y'); }); }

/* ── 7. recovery: the probe reloads the page by itself; the lock → reload → lock loop stops at three ── */
async function recover(mode){ await setMode(pg, mode); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  const nav=navWait(pg,10000); await setMode(pg,'');   // the wait first: the probe may reload the page as soon as the mode is clear
  ok('7 '+mode+': the storage back, the page reloads by itself within 10 s', await nav); await ready(pg);
  ok('7a '+mode+': editable with the real note, sheet:idb-reloads cleared by the healthy start', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'') && (await reloads(pg))===null && !(await pg.evaluate(()=>document.getElementById('sheet').inert))); }
await recover('error'); await recover('throw');
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  const counts=[];
  for(let i=1;i<=3;i++){ const nav=navWait(pg,10000); await pg.evaluate(()=>sessionStorage.setItem('__idbpass','1')); const went=await nav;   // only the next probe passes; the reload's start fails again
    await lockMsg(pg, LOCKED, 15000); await ready(pg); counts.push((went? '' : 'no reload ')+(await reloads(pg))); }
  ok('7b three automatic reloads, each landing in the lock again, counted 1, 2, 3 ('+counts.join(', ')+')', counts.join(',')==='1,2,3');
  await pg.evaluate(()=>sessionStorage.setItem('__idbpass','1')); const m=await lockMsg(pg, BACK, 10000); const nav=navWait(pg,12000);
  ok('7c the fourth time the strip asks for the tap instead ('+(m||'').slice(0,40)+'…)', BACK.test(m||''));
  ok('7d and no reload follows in 12 s', !(await nav)); await shot(pg,'7-back');
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg);
  ok('7e «Оновити» with the storage back: editable, the counter gone', !(await roMsg(pg)) && (await reloads(pg))===null); }
/* ── 7f. no reload under an open dialog ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  await pg.evaluate(()=>document.getElementById('ask').showModal()); await setMode(pg,'');
  ok('7f the storage back under the ask dialog: no reload for 8 s', !(await navWait(pg,8000)));
  const nav=navWait(pg,4000); await pg.evaluate(()=>document.getElementById('ask').close());
  ok('7g the dialog closed: the reload follows within the 2 s recheck', await nav); await ready(pg); }

/* ── 8. a device that never had IndexedDB (no marker): today's localStorage mode, then the move-in and the marker ── */
{ const c2=await context(); const q=await fresh(c2); await go(q,SITE+'blank.html'); await setMode(q,'error'); await go(q); await ready(q);
  ok('8 no marker: the fallback mode, editable, «(резервне сховище)»', /резервне сховище/.test(await storLine(q)) && !(await q.evaluate(()=>document.getElementById('sheet').inert)) && !(await roMsg(q)));
  await typeAt(q,500,300,'без бази'); const k=await fbKeys(q);
  ok('8a the note goes to a plain sheet:note: key', k.length===1 && !/~/.test(k[0][0]) && /без бази/.test(k[0][1]));
  await setMode(q,''); await reload(q); await ready(q); await q.waitForTimeout(500);
  ok('8b a normal start moves it in and writes idbOk', typeof (await settings(q)).idbOk==='number' && !(await fbKeys(q)).length && has((await dbNotes(q))||[],/без бази/));
  await c2.close(); }

/* ── 9. two tabs: one locked (its own open fails), the other writes; the locked one follows read-only ── */
{ const c=await device(); const a=await fresh(c), b=await fresh(c);
  await go(a,SITE+'blank.html'); await a.evaluate(()=>sessionStorage.setItem('__idbfail','error')); await go(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  await go(b); await ready(b); await typeAt(b,900,300,'від другої вкладки'); await b.waitForTimeout(600);   // a free cell of the sheet
  ok('9 tab B is not locked and writes', !(await roMsg(b)) && has((await dbNotes(b))||[],/від другої вкладки/));
  await a.bringToFront(); await a.waitForTimeout(300);
  ok('9a the locked tab A shows B\'s note read-only after the put message ('+flat((await items(a)).join(' | '))+')', (await items(a)).some(t=>/від другої вкладки/.test(t)) && await a.evaluate(()=>document.getElementById('sheet').inert) && LOCKED.test(await roMsg(a)));
  await c.close(); }

/* ── 11. the upgrade path: a device with notes, versSwept and no idbOk (updated from the current code) locks instead of falling back ── */
{ await go(pg); await ready(pg); await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); delete s.idbOk; if(!s.versSwept) s.versSwept=Date.now(); localStorage.setItem('sheet:settings', JSON.stringify(s)); });
  await setMode(pg,'error'); await reload(pg); const m=await lockMsg(pg, LOCKED, 15000); await ready(pg);
  ok('11 versSwept alone is the marker: the storage lock, no fallback mode, no note key', LOCKED.test(m||'') && !/резервне/.test(await storLine(pg)) && !(await fbKeys(pg)).length);
  await reload(pg,'clear'); await ready(pg);
  ok('11a the next normal start writes idbOk again', typeof (await settings(pg)).idbOk==='number'); }

/* ── 12. a late error after the deadline: the queue is clear, the probing starts, the probe passes ── */
{ await setMode(pg,'hang'); await reload(pg); await lockMsg(pg, LOCKED, 12000); await ready(pg);
  await setMode(pg,''); const nav=navWait(pg,9000); await hangError(pg);
  ok('12 the hung request fails at last: the probing starts and the page reloads by itself within 9 s', await nav); await ready(pg);
  ok('12a a healthy start', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'')); }

/* ── 13. a hung probe: no probe behind it; its late success reloads, its late error resumes the probing ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  const first=await until(async()=>(await opens(pg)).length===1, 7000);
  await pg.waitForTimeout(12000);
  ok('13 the first probe hangs: no further probe for 12 s ('+(await opens(pg)).length+')', first && (await opens(pg)).length===1);
  await setMode(pg,''); const nav=navWait(pg,5000); await hangSuccess(pg);
  ok('13a its late success reloads the page by itself', await nav); await ready(pg);
  await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  await until(async()=>(await opens(pg)).length===1, 7000); await pg.waitForTimeout(3500); await hangError(pg);
  const more=await until(async()=>(await opens(pg)).length>=2, 12000);
  ok('13b its late error resumes the probing: another probe within 12 s ('+(await opens(pg)).length+')', more);
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg); }

/* ── 14. an export in flight (the share sheet on a touch device): no reload under it ── */
{ const c3=await context({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); await c3.addInitScript(SHARE); const q=await fresh(c3);
  await go(q); await ready(q); await typeAt(q,200,300,'на телефоні');
  await setMode(q,'error'); await reload(q); await lockMsg(q, LOCKED, 15000); await ready(q);
  await q.locator('#roExport').click(); const shared=await until(()=>q.evaluate(()=>!!window.__idbshare), 3000);
  await setMode(q,'');
  ok('14 «Експорт» opened the share sheet; the storage back, no reload for 8 s under it', shared && !(await navWait(q,8000)));
  const nav=navWait(q,4000); await q.evaluate(()=>window.__idbshare.res());
  ok('14a the share done: the reload follows within the 2 s recheck', await nav); await ready(q);
  ok('14b a healthy start on the phone', !(await roMsg(q)) && /на телефоні/.test((await items(q))[0]||''));
  await c3.close(); }

/* ── 15. an owner change in another tab: the locked view stays the old owner's, no note of the new owner comes in ── */
async function ownerRun(msg, tag){ const c=await device(); const a=await fresh(c), b=await fresh(c); const T=Date.now();
  await go(a,SITE+'blank.html'); await a.evaluate(T=>{ sessionStorage.setItem('__idbfail','error'); localStorage.setItem('sheet:note:z~tabq~1', JSON.stringify({id:'z',title:'Копія власника А',blocks:[{id:'c',fx:0.1,row:2,text:'лишилося від А'}],created:T-9e5,updated:T-100})); }, T);
  await go(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  await go(b,SITE+'blank.html'); await b.evaluate(m=>{ const c=new BroadcastChannel('sheet:notes'); c.postMessage(m); c.postMessage({t:'put', n:{id:'nB1',title:'Нотатка власника Б',blocks:[{id:'d',fx:0.1,row:2,text:'від нового власника'}],created:Date.now(),updated:Date.now()}}); c.close(); }, msg);
  await a.bringToFront(); await a.waitForTimeout(600); const li=await items(a);
  const data=await download(a, ()=>a.locator('#roExport').click());
  ok('15 '+tag+': the locked tab takes nothing of the new owner; its list and export hold only its own copy ('+flat(li.join(' | '))+'; export '+data.notes.length+')', li.length===1 && /Копія власника А/.test(li[0]) && data.notes.length===1 && has(data.notes,/лишилося від А/) && LOCKED.test(await roMsg(a)));
  await c.close(); }
await ownerRun({t:'owner', by:'account', erase:true}, 'erase'); await ownerRun({t:'owner', by:'account'}, 'binding');

/* ── 16. the tab's own note across the recovery: not replaced by the temporary in-memory note ── */
{ const c=await device(); const a=await fresh(c), b=await fresh(c);
  await go(a); await ready(a); await a.locator('#newBtn').click(); await typeAt(a,500,300,'нотатка Ікс'); const X=await a.evaluate(()=>sessionStorage.getItem('sheet:tab-current'));
  await go(b); await ready(b); await b.locator('#newBtn').click(); await typeAt(b,500,300,'нотатка Ігрек'); await b.waitForTimeout(300);
  ok('16 S.current is the other tab\'s choice', (await settings(b)).current!==X && !!X);
  await a.bringToFront(); await a.evaluate(()=>sessionStorage.setItem('__idbfail','error')); await reload(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  ok('16a locked: the in-memory note is shown, the tab still remembers its own note', /Без назви/.test((await items(a))[0]||'') && (await a.evaluate(()=>sessionStorage.getItem('sheet:tab-current')))===X);
  await a.evaluate(()=>sessionStorage.removeItem('__idbfail')); const nav=navWait(a,10000);
  ok('16b the recovery reloads the tab', await nav); await ready(a); await a.waitForTimeout(300);
  ok('16c and it shows its own note X, not the other tab\'s Y', /нотатка Ікс/.test(await sheetText(a)) && !/нотатка Ігрек/.test(await sheetText(a)));
  await c.close(); }

/* ── 17. one probe at a time, one reload: visibility changes during an unanswered probe, a dialog longer than several probe intervals ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  const first=await until(async()=>(await opens(pg)).length===1, 7000);
  await pg.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>!!window.__hid, configurable:true}); for(let i=0;i<3;i++){ window.__hid=true; document.dispatchEvent(new Event('visibilitychange')); window.__hid=false; document.dispatchEvent(new Event('visibilitychange')); } });
  await pg.waitForTimeout(500);
  ok('17 hidden → visible three times during an unanswered probe: still one open', first && (await opens(pg)).length===1);
  await pg.evaluate(()=>{ delete document.hidden; }); await setMode(pg,''); const nav=navWait(pg,5000); await hangSuccess(pg); await nav; await ready(pg);
  // the dialog: one successful probe, then nothing until it closes; the reload counted once
  await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  await pg.evaluate(()=>document.getElementById('ask').showModal()); await setMode(pg,''); await resetOpens(pg);
  const probed=await until(async()=>(await opens(pg)).length===1, 7000); await pg.waitForTimeout(12000);
  await pg.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); }); await pg.waitForTimeout(300);
  ok('17a under the dialog one probe succeeded and no more follow in 12 s, a visibility change included ('+(await opens(pg)).length+')', probed && (await opens(pg)).length===1 && LOCKED.test(await roMsg(pg)));
  await setMode(pg,'error'); const nav2=navWait(pg,4000); await pg.evaluate(()=>document.getElementById('ask').close());
  ok('17b the dialog closed: one reload', await nav2); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  ok('17c the counter moved by one, not once per answer ('+await reloads(pg)+')', (await reloads(pg))==='1');
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg); }

/* ── 18. the real connection queue: a versionless open behind a blocked upgrade is silent; released, the browser answers it and the tab reloads ── */
{ const d=await device(); const a=await fresh(d), b=await fresh(d), c=await fresh(d);
  await go(b,SITE+'blank.html'); await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // kept open, deaf to versionchange
  await go(c,SITE+'blank.html'); await c.evaluate(()=>{ window.__c={}; const r=indexedDB.open('sheet',5); r.onblocked=()=>{ window.__c.blocked=true; }; r.onupgradeneeded=()=>{ window.__c.upgraded=true; r.transaction.abort(); }; r.onerror=()=>{ window.__c.error=(r.error||{}).name; }; r.onsuccess=()=>{ window.__c.success=true; r.result.close(); }; });
  const blocked=await until(()=>c.evaluate(()=>!!window.__c.blocked), 3000);
  await go(a); const m1=await lockMsg(a, OPENING, 3000);
  ok('18 a versionless open queued behind a blocked upgrade: the waiting strip after 1 s', blocked && OPENING.test(m1||''));
  const m2=await lockMsg(a, LOCKED, 12000); await ready(a); await a.waitForTimeout(6000);
  ok('18a the lock after 8 s with one attempt and no probe behind the silent request ('+(await opens(a)).length+')', LOCKED.test(m2||'') && (await opens(a)).length===1);
  const nav=navWait(a,6000); await b.evaluate(()=>window.__hold.close());
  const cst=await until(()=>c.evaluate(()=>window.__c.error? window.__c : null), 5000);
  ok('18b released: the upgrade ran and aborted ('+JSON.stringify(cst)+'), the queued request answered and the tab reloaded by itself', !!(cst && cst.upgraded && cst.error==='AbortError') && await nav); await ready(a);
  ok('18c a healthy start with the note', !(await roMsg(a)) && (await items(a)).some(t=>/перша нотатка/.test(t)) && (await a.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const v=r.result.version; r.result.close(); res(v); }; })))===4);
  await d.close(); }

/* ── 19. a reload count that cannot be kept (sessionStorage refuses the write) counts as spent: the strip asks, no reload without a limit ── */
{ const c=await context(); await c.addInitScript(()=>{ const set=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='sheet:idb-reloads' && localStorage.getItem('__ssfail')) throw new DOMException('full','QuotaExceededError'); return set.call(this,k,v); }; });
  const p=await fresh(c); await go(p); await ready(p);
  await p.evaluate(()=>localStorage.setItem('__ssfail','1')); await setMode(p,'error'); await reload(p); await lockMsg(p, LOCKED, 15000); await ready(p);
  const nav=navWait(p,12000); await p.evaluate(()=>sessionStorage.setItem('__idbpass','1'));
  const m=await lockMsg(p, BACK, 12000), went=await nav;
  ok('19 sessionStorage refuses the count: no automatic reload, the strip asks for the tap ('+(m||'').slice(0,40)+'…)', !went && BACK.test(m||'') && (await reloads(p))===null);
  await c.close(); }

/* ── 20. a phone (390 px): the storage strip, several lines high, covers no block of the open copy ── */
{ const c=await context({viewport:{width:390,height:844}, isMobile:true, hasTouch:true}); const p=await fresh(c); await go(p); await ready(p);
  await p.evaluate(()=>localStorage.setItem('sheet:note:lay', JSON.stringify({id:'lay', title:'Копія', blocks:[{id:'l1', row:2, fx:0.1, text:'видимий рядок копії'}], created:1, updated:Date.now()})));
  await setMode(p,'error'); await reload(p); await lockMsg(p, LOCKED, 15000); await ready(p);
  await p.locator('#list .item').filter({hasText:'Копія'}).click().catch(()=>{}); await p.waitForTimeout(400);
  const g=await p.evaluate(()=>{ const s=document.querySelector('#roStrip .rostrip').getBoundingClientRect(), b=[...document.querySelectorAll('#sheet .blk')].find(x=>/видимий рядок/.test(x.textContent)); const r=b && b.getBoundingClientRect(); return {strip:Math.round(s.bottom), block:r? Math.round(r.top) : null}; });
  await shot(p,'phone-strip');
  ok('20 the strip ends above the copy\'s first block ('+JSON.stringify(g)+')', g.block!==null && g.strip<=g.block);
  await p.evaluate(()=>localStorage.removeItem('sheet:note:lay')); await c.close(); }

/* ── 10. no page errors over the run ── */
console.log(errs.length? errs.join('\n') : '✓ 10 no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); await srv.close(); process.exit(fails?1:0);
