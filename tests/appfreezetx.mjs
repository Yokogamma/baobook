// A frozen tab must not hold the store for the others (docs/SYNC-PLAN.md §4.10): a document frozen inside an IndexedDB transaction keeps the
// stores it locked until it is thawed, so another tab of the origin (or the installed app) waits on its next write with no end. `freeze`
// aborts the transactions open through SDB (the core's, and the page's saves with an owner), and nothing new starts until `resume`: the other
// tab writes at once, the frozen one's transaction ends as `locked` (the core stops quietly), and after `resume` the store works again.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, lead, typeAt, curId } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const fire=(pg,type)=>pg.evaluate(type=>document.dispatchEvent(new Event(type)), type);
// a write over the sync store from the page itself, as another document of the origin makes one: how long it waited
const rawWrite=pg=>pg.evaluate(()=>new Promise(res=>{ const t0=Date.now(), r=indexedDB.open('sheet'); r.onsuccess=()=>{ const db=r.result, t=db.transaction('sync','readwrite'); t.objectStore('sync').put({k:'probe-freeze', at:t0}); t.oncomplete=()=>{ db.close(); res(Date.now()-t0); }; t.onerror=t.onabort=()=>{ db.close(); res(-1); }; }; r.onerror=()=>res(-1); }));

const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{pace:PACE}}); const A=D.pg; const B=await newTab(D, SITE, {connect:{pace:PACE}});
await A.bringToFront(); await A.waitForFunction(()=>sheetDebug.life().ready);

/* ── 1. control: a transaction held for 3 s in a tab that is not frozen keeps the other tab's write waiting ── */
{ const held=A.evaluate(()=>sheetDebug.sdbHold(3000)); await A.waitForTimeout(200); const w=await rawWrite(B); const r=await held;
  ok('1 control: a transaction held 3 s in a live tab makes the other tab\'s write wait ('+w+' ms), and it ends as «done»', w>=2000 && r==='done'); }

/* ── 2. the holding tab freezes: its transaction is aborted, the other tab writes at once ── */
{ const held=A.evaluate(()=>sheetDebug.sdbHold(8000)); await A.waitForTimeout(200); const open0=await A.evaluate(()=>sheetDebug.sdbOpen());
  await fire(A,'freeze'); const w=await rawWrite(B); const r=await held; const open1=await A.evaluate(()=>sheetDebug.sdbOpen());
  ok('2 freeze aborts the held transaction: the other tab writes at once ('+w+' ms), the frozen one ends as «'+r+'», nothing left open ('+open0+' → '+open1+')', w>=0 && w<1500 && r==='frozen' && open0>=1 && open1===0);
  const again=await A.evaluate(()=>sheetDebug.sdbHold(10));
  ok('2a while frozen nothing new starts: a new transaction is refused as «'+again+'»', again==='frozen'); }

/* ── 2b. Chrome's guidance: the frozen tab has closed its store connection and its channel, so a message from the other tab cannot start a read there ── */
{ const l=await A.evaluate(()=>sheetDebug.life());
  ok('2b frozen: the store connection and the channel to the other tabs are closed ('+JSON.stringify(l)+')', l.ready && !l.db && !l.tabs && l.frozen); }

/* ── 3. after resume the store works again in that tab ── */
{ await fire(A,'resume'); const r=await A.evaluate(()=>sheetDebug.sdbHold(10));
  ok('3 after resume a transaction runs to its end («'+r+'»)', r==='done');
  const l=await A.evaluate(()=>sheetDebug.life());
  ok('3b resumed: the channel is open again and the store reopened on its first use ('+JSON.stringify(l)+')', l.tabs && l.db && !l.frozen);
  ok('3a no page errors', !D.errs.length); }

/* ── 3c. an edit made in the other tab while this one was frozen is here after resume (read from the store: the channel was closed) ── */
{ await A.waitForTimeout(300); const id=await curId(A); await fire(A,'freeze'); await B.bringToFront();
  await B.evaluate(id=>{ const it=document.querySelector('#list .item[data-id="'+id+'"]'); if(it) it.click(); }, id); await B.waitForTimeout(300); await typeAt(B, 500, 420, 'поки та вкладка спала'); await B.waitForTimeout(800);
  await A.bringToFront(); await fire(A,'resume'); await A.waitForTimeout(1200);
  const seen=await A.evaluate(()=>[...document.querySelectorAll('#sheet .txt')].some(e=>/поки та вкладка спала/.test(e.textContent)));
  ok('3c the edit made in the other tab while this one was frozen is on its screen after resume', seen); }

/* ── 5. the page's own transactions (history, the format's own reads) are under the freeze too: aborted, and none starts while frozen ── */
{ await A.bringToFront(); const held=A.evaluate(()=>sheetDebug.idbHold(8000)); await A.waitForTimeout(200);
  await fire(A,'freeze'); const w=await rawWrite(B); const r=await held; const again=await A.evaluate(()=>sheetDebug.idbHold(10));
  ok('5 a transaction of the page\'s own idb.tx held at freeze is aborted: the other tab writes at once ('+w+' ms), it ends «'+r+'», a new one is refused «'+again+'»', w>=0 && w<1500 && r==='frozen' && again==='frozen');
  await fire(A,'resume'); ok('5a after resume the page\'s own transactions run again', (await A.evaluate(()=>sheetDebug.idbHold(10)))==='done'); }

/* ── 6. an edit whose save is held when the tab freezes: its fallback copy is written before the abort, tagged with the epoch, and a new start takes it ── */
{ await A.bringToFront(); await A.click('#newBtn'); await A.waitForTimeout(300); await typeAt(A, 500, 300, 'перша версія'); await A.waitForTimeout(1500); const id=await curId(A);
  const hold=B.evaluate(()=>new Promise(done=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const db=r.result, t=db.transaction(['notes','sync'],'readwrite'), st=t.objectStore('sync'), end=Date.now()+4000; const spin=()=>{ if(Date.now()<end) st.get('x').onsuccess=spin; }; spin(); t.oncomplete=()=>{ db.close(); done(); }; }; }));
  await A.waitForTimeout(200); await A.click('#sheet .txt'); await A.keyboard.press('End'); await A.keyboard.type(' і правка'); await A.waitForTimeout(100);   // the edit is still in the editor or its save waits on the held store: both must end in a copy
  await fire(A,'freeze'); const copy=await A.evaluate(id=>{ const keys=Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:'+id+'~')); const k=keys[keys.length-1]; return k? {text:JSON.stringify(JSON.parse(localStorage.getItem(k)).blocks), tag:JSON.parse(localStorage.getItem('sheet:fbe:'+k)||'null'), epoch:sheetDebug.sync.account().epoch} : null; }, id);
  ok('6 the held edit has its fallback copy at once, with the edit and the owner\'s epoch ('+JSON.stringify(copy&&{tag:copy.tag===copy.epoch, has:/і правка/.test(copy.text)})+')', !!copy && /і правка/.test(copy.text) && copy.tag===copy.epoch);
  await hold; await A.close(); await B.waitForTimeout(300); const C=await newTab(D, SITE, {connect:{pace:PACE}}); await C.waitForTimeout(1500);
  const stored=await C.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return st && st.note? JSON.stringify(st.note.blocks) : ''; }, id);
  ok('6a the tab closed while frozen: the next start moves the copy in, the edit is in the store', /і правка/.test(stored)); await C.close(); }

/* ── 6b. a fallback copy of another epoch (written before a change of owner) neither moves into the store nor shows ── */
{ await B.evaluate(()=>{ const k='sheet:note:fz-other~T9~1'; localStorage.setItem(k, JSON.stringify({id:'fz-other', title:'Копія іншого власника', blocks:[{id:'b',row:1,fx:0,text:'чуже'}], created:Date.now(), updated:Date.now()})); localStorage.setItem('sheet:fbe:'+k, JSON.stringify('e-before')); });
  const F=await newTab(D, SITE, {connect:{pace:PACE}}); await F.waitForTimeout(1500);
  const r=await F.evaluate(async()=>({list:[...document.querySelectorAll('#list .item')].some(i=>/Копія іншого власника/.test(i.textContent)), stored:!!(await sheetDebug.sync.state('fz-other')).note, kept:!!localStorage.getItem('sheet:note:fz-other~T9~1')}));
  ok('6b a fallback copy tagged with another epoch: not in the list, not moved into the store, the key kept ('+JSON.stringify(r)+')', !r.list && !r.stored && r.kept); await F.close(); }

/* ── 7. a store moved to another owner while the tab was frozen: after resume it shows nothing of that owner and turns view-only ── */
{ const E=await newTab(D, SITE, {connect:{pace:PACE}}); await E.waitForFunction(()=>sheetDebug.life().ready); await fire(E,'freeze');
  await B.evaluate(()=>new Promise(done=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const db=r.result, t=db.transaction(['notes','sync'],'readwrite'); t.objectStore('sync').put({k:'owner', env:'test', uid:'u-other', email:'other@test'}); t.objectStore('sync').put({k:'epoch', id:'e-other'}); t.objectStore('notes').put({id:'priv', title:'Приватна чужа', blocks:[{id:'b',row:1,fx:0,text:'x'}], created:Date.now(), updated:Date.now()}); t.oncomplete=()=>{ db.close(); done(); }; }; }));
  await fire(E,'resume'); await E.waitForTimeout(1500);
  const seen=await E.evaluate(()=>({list:[...document.querySelectorAll('#list .item')].some(i=>/Приватна чужа/.test(i.textContent)), lock:sheetDebug.sync.locked()}));
  ok('7 resumed over a store of another owner: not a line of it in the list, the tab is view-only as «'+seen.lock+'»', !seen.list && seen.lock==='epoch'); await E.close(); }

await D.close();

/* ── 8. a freeze before the lifecycle module has loaded still cleans up, by the same rules ── */
{ const ctx=await br.newContext({...CTX}); await ctx.route(u=>u.pathname==='/lifecycle/model.js', async r=>{ await new Promise(res=>setTimeout(res,4000)); r.continue(); });
  const { attachCloud }=await import('./lib/cloudpage.mjs'); await attachCloud(ctx, new TestCloud({start:Date.now()}), 'L'); const m=await ctx.newPage(); await m.goto(SITE); await m.waitForSelector('html[data-ready]',{state:'attached'});
  const before=await m.evaluate(()=>sheetDebug.life().ready); await fire(m,'freeze'); const l=await m.evaluate(()=>sheetDebug.life());
  ok('8 frozen before the module loaded ('+!before+'): the store connection and the channel are closed all the same ('+JSON.stringify(l)+')', !before && !l.db && !l.tabs && l.frozen);
  await fire(m,'resume'); await m.waitForFunction(()=>sheetDebug.life().ready, null, {timeout:10000});
  const evs=[['freeze',{}],['resume',{}],['pagehide',{}],['pageshow',{persisted:true}],['pageshow',{persisted:false}],['hidden',{touch:true}],['hidden',{touch:false}],['hidden',{freezeEvent:false}],['visible',{}],['hiddenLong',{touch:true, hidden:true, leads:true}],['hiddenLong',{touch:false, hidden:true, leads:true}]];
  const diff=[]; for(const [ev,x] of evs){ const r=await m.evaluate(([ev,x])=>sheetDebug.lifeRules(ev,{touch:false, freezeEvent:true, ...x}), [ev,x]); if(JSON.stringify(r.module)!==JSON.stringify(r.fallback)) diff.push(ev); }
  ok('8a the page\'s fallback rules answer every event as the module does ('+(diff.join(',')||'same')+')', !diff.length); await ctx.close(); }

/* ── 4. a phone: a hidden leader lets the lead go by itself after a while, with no other tab asking (a forgotten tab, or one frozen later,
   could never answer a request), and takes it back when shown ── */
{ const P=await newDevice(br, new TestCloud({start:Date.now()}), SITE, 'P', {ctx:{...CTX, hasTouch:true, isMobile:true}, connect:{pace:PACE}}); const A2=P.pg;
  await A2.evaluate(()=>{ sheetDebug.hiddenLeadMs=400; }); const on0=await until(async()=>(await lead(A2)).on, 5000);
  const hide=h=>A2.evaluate(h=>{ Object.defineProperty(document,'hidden',{get:()=>h, configurable:true}); Object.defineProperty(document,'visibilityState',{get:()=>h? 'hidden' : 'visible', configurable:true}); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await A2.waitForTimeout(150); const still=(await lead(A2)).on; const off=await until(async()=>!(await lead(A2)).on, 3000);
  ok('4 a hidden leader on a phone keeps the lead through the wait ('+still+'), then lets it go with nobody asking ('+!!off+')', !!on0 && still && !!off);
  await hide(false); const back=await until(async()=>(await lead(A2)).on, 5000);
  ok('4a shown again, it leads again', !!back);
  ok('4b no page errors', !P.errs.length); await P.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
