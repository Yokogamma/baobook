// The shared part of the appidbfail scenarios (appidbfail.mjs, appidbfail2.mjs, appidbfail3.mjs; docs/IDB-FALLBACK-PLAN.md): the server, the
// browser, the wrapper of IDBFactory.prototype.open and the helpers that read the locked page. setup(part) makes them for one scenario; the
// scenario ends with finish(). The three files were one until October 2026; they are apart so that the CI shards can run them at once.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, CTX } from './server.mjs';
import { ready, until } from './wait.mjs';

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
export const SHARE=()=>{ navigator.canShare=()=>true; navigator.share=()=>new Promise((res,rej)=>{ window.__idbshare={res,rej}; }); };

export const OPENING=/^Сховище браузера відкривається…$/, LOCKED=/^Сховище браузера не відкрилося, тож/, BACK=/^Сховище браузера знову доступне/;
export const has=(list,re)=>list.some(n=>re.test(JSON.stringify(n)));
export const flat=s=>String(s).replace(/\s+/g,' ');

// part names the scenario's screenshots ('' for appidbfail, '2', '3')
export async function setup(part=''){
  const srv=await serve(); const SITE=srv.url;
  srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');   // the same origin without the app, to set up a tab's storage
  const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
  let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
  const SHOTS=path.join(os.tmpdir(),'sheet-tests'); fs.mkdirSync(SHOTS,{recursive:true}); const shot=(pg,n)=>pg.screenshot({path:path.join(SHOTS,'idbfail'+part+'-'+n+'.png')}).catch(()=>{});
  const errs=[];
  const external=[];   // requests that leave for another host (a Google host would be one): aborted and counted
  async function context(o={}){ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true, serviceWorkers:'block', ...o});
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r=>{ external.push(r.request().url()); r.abort().catch(()=>{}); });
    await ctx.addInitScript(WRAP); await ctx.addInitScript(EMU); return ctx; }
  const fresh=async ctx=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); return pg; };
  const go=async(pg,url)=>{ await pg.bringToFront(); await pg.goto(url||SITE); };
  const roMsg=pg=>pg.evaluate(()=>{ const s=document.getElementById('roStrip'); return !s || s.hidden? '' : document.getElementById('roMsg').textContent; }).catch(()=>'');   // '' while the page navigates
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
  // one normal start on a new device: the note «перша нотатка» goes into IndexedDB and idbOk is written (step 1 of appidbfail checks that)
  const start=async pg=>{ await go(pg); await ready(pg); await typeAt(pg,500,300,'перша нотатка'); };
  // a device of its own with the marker: one normal start that stores a note and idbOk, the page closed, so the tabs a scenario opens there are
  // the only ones of the context (a channel message reaches every tab of a context, a healthy third tab would take it)
  async function device(){ const c=await context(); const p=await fresh(c); await start(p); await p.close(); return c; }
  // the end of a scenario: no page errors over the run, then the exit code
  const finish=async ctx=>{ console.log(errs.length? errs.join('\n') : '✓ 10 no page errors'); if(errs.length) fails++;
    if(ctx) await ctx.close(); await br.close(); await srv.close(); process.exit(fails?1:0); };
  return { SITE, ok, shot, errs, external, context, fresh, go, roMsg, lockMsg, setMode, opens, resetOpens, settings, fbKeys, items, sheetText, storLine,
    buttons, reloads, navWait, reload, typeAt, dbNotes, hangSuccess, hangError, download, start, device, finish };
}
