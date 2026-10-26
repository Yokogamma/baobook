// A frozen tab must not hold the store for the others (docs/SYNC-PLAN.md §4.10): a document frozen inside an IndexedDB transaction keeps the
// stores it locked until it is thawed, so another tab of the origin (or the installed app) waits on its next write with no end. `freeze`
// aborts the transactions open through SDB (the core's, and the page's saves with an owner), and nothing new starts until `resume`: the other
// tab writes at once, the frozen one's transaction ends as `locked` (the core stops quietly), and after `resume` the store works again.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const fire=(pg,type)=>pg.evaluate(type=>document.dispatchEvent(new Event(type)), type);
// a write over the sync store from the page itself, as another document of the origin makes one: how long it waited
const rawWrite=pg=>pg.evaluate(()=>new Promise(res=>{ const t0=Date.now(), r=indexedDB.open('sheet'); r.onsuccess=()=>{ const db=r.result, t=db.transaction('sync','readwrite'); t.objectStore('sync').put({k:'probe-freeze', at:t0}); t.oncomplete=()=>{ db.close(); res(Date.now()-t0); }; t.onerror=t.onabort=()=>{ db.close(); res(-1); }; }; r.onerror=()=>res(-1); }));

const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{pace:PACE}}); const A=D.pg; const B=await newTab(D, SITE, {connect:{pace:PACE}});
await A.bringToFront();

/* ── 1. control: a transaction held for 3 s in a tab that is not frozen keeps the other tab's write waiting ── */
{ const held=A.evaluate(()=>sheetDebug.sdbHold(3000)); await A.waitForTimeout(200); const w=await rawWrite(B); const r=await held;
  ok('1 control: a transaction held 3 s in a live tab makes the other tab\'s write wait ('+w+' ms), and it ends as «done»', w>=2000 && r==='done'); }

/* ── 2. the holding tab freezes: its transaction is aborted, the other tab writes at once ── */
{ const held=A.evaluate(()=>sheetDebug.sdbHold(8000)); await A.waitForTimeout(200); const open0=await A.evaluate(()=>sheetDebug.sdbOpen());
  await fire(A,'freeze'); const w=await rawWrite(B); const r=await held; const open1=await A.evaluate(()=>sheetDebug.sdbOpen());
  ok('2 freeze aborts the held transaction: the other tab writes at once ('+w+' ms), the frozen one ends as «'+r+'», nothing left open ('+open0+' → '+open1+')', w>=0 && w<1500 && r==='locked' && open0>=1 && open1===0);
  const again=await A.evaluate(()=>sheetDebug.sdbHold(10));
  ok('2a while frozen nothing new starts: a new transaction is refused as «'+again+'»', again==='locked'); }

/* ── 3. after resume the store works again in that tab ── */
{ await fire(A,'resume'); const r=await A.evaluate(()=>sheetDebug.sdbHold(10));
  ok('3 after resume a transaction runs to its end («'+r+'»)', r==='done');
  ok('3a no page errors', !D.errs.length); }

await D.close(); await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
