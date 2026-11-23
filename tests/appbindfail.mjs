// A change of owner whose follow-up fails after the commit (docs/SYNC-PLAN.md §4.11; found by the sixth independent review of #146). bindOwner
// writes the new owner (setOwner), then reads the lrev of every note (lrevOf). When that read is refused, the store already belongs to the new owner:
// the page must not stay silent and editable over it. The other tabs get the «owner» message; what is typed goes to storage and the page reloads,
// or, with a write that fails, the screen stays view-only with the export and the text on it. `afterBind` runs between the commit and the read;
// here it arms `readGate` so that every read of `sync` alone is refused, as a broken connection would refuse it.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, stored } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const okWhy=async(n,conds,more)=>{ const bad=Object.keys(conds).filter(k=>!conds[k]); ok(n, !bad.length); if(bad.length){ console.log('    failed: '+bad.join('; ')); if(more) console.log('    '+JSON.stringify(await more())); } };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const owner=uid=>({env:'test', uid, email:uid+'@test'});
const ownerOf=pg=>pg.evaluate(()=>{ const o=sheetDebug.sync.engine().owner; return o && o.uid; });
const storedOwner=async pg=>((await stored(pg,'sync')).find(r=>r.k==='owner')||{}).uid;
const state=pg=>pg.evaluate(()=>({dying:sheetDebug.sync.account().dying, lock:sheetDebug.sync.locked()||null, strip:!document.getElementById('roStrip').hidden,
  msg:document.getElementById('roMsg').textContent, exportShown:!document.getElementById('roExport').hidden}));
const storedText=async(pg,t)=>((await stored(pg,'notes'))||[]).some(n=>JSON.stringify(n.blocks||[]).includes(t));
const onScreen=(pg,t)=>pg.locator('#sheet .blk').filter({hasText:t}).count();
// the fault: after the commit, every read of `sync` alone is refused until the test disarms it
const fault=pg=>pg.evaluate(()=>{ window.__refused=0; sheetDebug.afterBind=()=>{ sheetDebug.readGate=st=>st.length===1 && st[0]==='sync'? (window.__refused++, Promise.reject(Object.assign(new Error('test: lrevOf refused'),{code:'test'}))) : null; }; });
// a keystroke into a new block of the open note, left in the editor (no Escape): the binding meets it as typed text
async function type(pg, text){ await pg.bringToFront(); await pg.mouse.click(700, 420);
  await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sheet .blk')),null,{timeout:3000}); await pg.keyboard.type(text); }
const bind=(pg,o)=>pg.evaluate(async o=>{ const r=await sheetDebug.sync.bind(o); sheetDebug.readGate=null; sheetDebug.afterBind=null; return {...r, refused:window.__refused}; }, o);

/* ── 1. the read after the commit is refused, the typed text can be written: it lands in storage, the other tab learns of the change, the page reloads ── */
{ const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{owner:owner('u7'), pace:PACE}}), P=A.pg;
  const Q=await newTab(A, SITE, {connect:false});
  ok('1 two tabs of one device, both with the owner u7', (await ownerOf(P))==='u7' && (await ownerOf(Q))==='u7');
  await type(P, 'typed before the binding'); await fault(P);
  const r=await bind(P, owner('u8')), sP=await state(P);
  const qMoved=await until(async()=>(await ownerOf(Q))==='u8', 5000);
  await okWhy('1b the binding committed u8 and its lrev read was refused ('+r.refused+' reads): the binding '+JSON.stringify({ok:r.ok, code:r.code})+', the page goes (dying), the other tab took u8', {
    'stored u8': (await storedOwner(P))==='u8', 'the read refused': r.refused>0, 'binding not ok': !r.ok, 'code moved': r.code==='moved', 'dying': sP.dying, 'not locked': !sP.lock, 'the other tab took u8': qMoved}, ()=>state(P));
  ok('1c the typed text is in storage before the reload', await storedText(P, 'typed before the binding'));
  const reloaded=await P.waitForEvent('load',{timeout:8000}).then(()=>true, ()=>false); if(reloaded) await P.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  await okWhy('1d the page reloaded with the owner u8 and the typed text', {'reloaded': reloaded, 'owner u8': reloaded && (await ownerOf(P))==='u8', 'text kept': reloaded && await storedText(P, 'typed before the binding'), 'not locked': reloaded && !(await state(P)).lock});
  ok('1e no page errors: '+(A.errs.join('; ')||'none'), !A.errs.length);
  await A.close(); }

/* ── 2. the same, and the typed text cannot be written: the screen stays as it is, view-only with the export and the text on it; the other tab learns ── */
{ const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{owner:owner('u20'), pace:PACE}}), P=D.pg;
  const Q=await newTab(D, SITE, {connect:false});
  ok('2 two tabs of one device, both with the owner u20', (await ownerOf(P))==='u20' && (await ownerOf(Q))==='u20');
  await P.evaluate(()=>{ sheetDebug.failSave=true; }); await type(P, 'cannot be written'); await fault(P);
  const r=await bind(P, owner('u21')), sP=await state(P);
  const qMoved=await until(async()=>(await ownerOf(Q))==='u21', 5000);
  await okWhy('2b the binding committed u21, its read refused, the save fails: '+JSON.stringify({ok:r.ok, code:r.code})+', the tab is view-only ('+sP.lock+'): «'+sP.msg.slice(0,60)+'…»', {
    'stored u21': (await storedOwner(P))==='u21', 'binding not ok': !r.ok, 'code moved': r.code==='moved', 'locked epoch': sP.lock==='epoch', 'strip': sP.strip, 'export offered': sP.exportShown, 'not dying': !sP.dying, 'the other tab took u21': qMoved}, ()=>state(P));
  ok('2c the text stays on screen and is not in storage', (await onScreen(P, 'cannot be written'))>0 && !(await storedText(P, 'cannot be written')));
  await P.waitForTimeout(2500);
  ok('2d the page does not reload over the unsaved text', (await onScreen(P, 'cannot be written'))>0 && (await state(P)).lock==='epoch');
  ok('2e no page errors: '+(D.errs.join('; ')||'none'), !D.errs.length);
  await D.close(); }

await br.close(); srv.close && srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\nall passed'); process.exit(fails? 1 : 0);
