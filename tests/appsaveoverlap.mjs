// Two writes of the same note on their way at once (slow storage: a write takes longer than the 300 ms autosave delay plus the next edit). The older
// write's result lands while the newer one is still on its way, and the editor snapshot (ESNAP, the base the newer write merges over) must follow it:
// otherwise the newer write merges over the snapshot of a write before both, and what the older write added and the newer one took away again (a block
// made, then deleted) reads as another side's change and comes back, in the store and on the screen. One device on the test cloud, as a real one is.
// (1) both writes held by saveGate and released together: both transactions are made in one turn, so IndexedDB itself queues the second behind the
// first, and the first one's result (microtasks after its commit) must reach the snapshot before the second one's first request (a later task);
// (2) slow storage, every write delayed in the order it began (no gate held, as a slow IndexedDB on Android does); (3) the same with a text edited
// twice: the stored text is the last one and no conflict copy is made. Cases 2 and 3 check first that the writes did overlap (the older one not landed
// when the newer one began), so a slow machine cannot pass them vacuously
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, stored, typeAt, curId, settle } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const okWhy=(n,conds)=>{ const bad=Object.keys(conds).filter(k=>!conds[k]); ok(n, !bad.length); if(bad.length) console.log('    failed: '+bad.join('; ')); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{owner:{env:'test', uid:'u1', email:'u1@test'}, pace:PACE}}), pg=A.pg;
const screen=()=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(e=>e.textContent));
const record=async id=>((await stored(pg,'notes'))||[]).find(r=>r.id===id);
const texts=r=>r? r.blocks.map(b=>b.text) : null;
const copies=async id=>((await stored(pg,'versions'))||[]).filter(v=>v.note===id && v.reason==='copy').length;
const fresh=async()=>{ await pg.evaluate(()=>{ sheetDebug.saveGate=null; document.getElementById('newBtn').click(); }); await pg.waitForTimeout(400); return curId(pg); };
// into the text of the block that shows `text`: the caret in it, then the keys
const into=async(text, ...keys)=>{ const bb=await pg.locator('#sheet .blk .txt', {hasText:text}).boundingBox(); await pg.mouse.click(bb.x+10, bb.y+bb.height/2); await pg.waitForTimeout(150);
  for(const k of keys) if(k.type!=null) await pg.keyboard.type(k.type); else await pg.keyboard.press(k); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600); };
const del=text=>into(text, 'Control+a', 'Delete', 'Backspace');   // the text emptied, then Backspace on the empty block drops it
// slow storage: every write that touches notes takes 2.5 s, in the order the writes began (the store queues them; nothing overtakes another);
// __pend.n counts the writes waiting (a counter of its own for each slow(): a write of an earlier gate cannot touch the next one's), drained() waits until
// none is left and the engine is idle (no fixed wait), the gate cleared in the same turn as the last check
const slow=()=>pg.evaluate(()=>{ let q=Promise.resolve(); const c=window.__pend={n:0}; sheetDebug.saveGate=st=>{ if(!st.includes('notes')) return Promise.resolve(); c.n++;
  return q=q.then(()=>new Promise(r=>setTimeout(r,2500))).then(()=>{ c.n--; }); }; });
const pending=()=>pg.evaluate(()=>window.__pend.n);
const drained=async()=>{ await pg.waitForFunction(()=>{ if(window.__pend.n) return false; sheetDebug.saveGate=null; return true; }, null, {timeout:30000}); await settle(pg, 600); };
const ids=new Set();

/* ── 1. a block added and deleted, both writes held by the gate and released together ── */
{ const id=await fresh(); ids.add(id); await typeAt(pg, 400, 300, 'перший'); await pg.waitForTimeout(400);
  await pg.evaluate(()=>{ window.__wg=new Promise(r=>{ window.__wopen=r; }); sheetDebug.saveGate=()=>window.__wg; });
  await typeAt(pg, 400, 500, 'видалити'); await del('видалити'); const before=await screen();
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__wopen(); }); await settle(pg, 600);
  const r=await record(id), s=await screen();
  okWhy('1 a block added, then deleted while its write was held: the record '+JSON.stringify(texts(r))+', the screen '+JSON.stringify(s), {
    'gone from the screen before the release': before.length===1, 'not stored': JSON.stringify(texts(r))==='["перший"]', 'not on the screen': JSON.stringify(s)==='["перший"]'}); }

/* ── 2. slow storage, no gate held: the deletion's write begins while the write that added the block is still on its way ── */
{ const id=await fresh(); ids.add(id); await typeAt(pg, 400, 300, 'перший'); await pg.waitForTimeout(400);
  await slow();
  await typeAt(pg, 400, 500, 'видалити'); await del('видалити'); const mid=texts(await record(id)), waiting=await pending(); await drained();
  const r=await record(id), s=await screen();
  okWhy('2 slow storage, the block deleted while the write that added it was on its way ('+waiting+' writes waiting, the record then '+JSON.stringify(mid)+'): the record '+JSON.stringify(texts(r))+', the screen '+JSON.stringify(s), {
    'the writes overlapped': waiting>=2 && JSON.stringify(mid)==='["перший"]', 'not stored': JSON.stringify(texts(r))==='["перший"]', 'not on the screen': JSON.stringify(s)==='["перший"]'}); }

/* ── 3. a text edited twice on slow storage: the last text is stored, no conflict copy ── */
{ const id=await fresh(); ids.add(id); await typeAt(pg, 400, 300, 'перший'); await pg.waitForTimeout(400);
  await slow();
  await into('перший', 'Control+a', {type:'другий'}); await into('другий', 'Control+a', {type:'третій'}); const mid=texts(await record(id)), waiting=await pending(); await drained();
  const r=await record(id), s=await screen(), c=await copies(id);
  okWhy('3 a text changed twice on slow storage ('+waiting+' writes waiting, the record then '+JSON.stringify(mid)+'): the record '+JSON.stringify(texts(r))+', the screen '+JSON.stringify(s)+', '+c+' conflict copies', {
    'the writes overlapped': waiting>=2 && JSON.stringify(mid)==='["перший"]', 'the last text stored': JSON.stringify(texts(r))==='["третій"]', 'on the screen': JSON.stringify(s)==='["третій"]', 'no conflict copy': c===0}); }

ok('no page errors'+(A.errs.length? ': '+A.errs.join(' | ') : ''), !A.errs.length);
await br.close(); srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
