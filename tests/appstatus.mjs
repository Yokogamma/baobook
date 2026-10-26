// The «Скасувати» toast and the save status under unlucky timing: a frame that comes late after Ctrl+Z, an edit made while ✓ is
// still shown, and an older write that finishes after a newer edit. Writes are held and released by the scenario through sheetDebug.saveHold:
// the write lands in storage at once, the app hears of it when the scenario lets go (the write path goes through the sync core, not idb.put)
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
// waits for conditions, the same as ready() and until() in tests/lib/wait.mjs: the app is up (the language file applied, the list drawn, the sheet visible);
// a value polled until it is truthy or the time is up, and the check that follows still decides
async function ready(timeout=30000){ await pg.waitForSelector('html[data-ready]',{state:'attached',timeout}); await pg.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout});
  await pg.waitForFunction(()=>{ const s=document.getElementById('sheet'); return !!s && getComputedStyle(s).visibility!=='hidden'; },null,{timeout}); }
async function until(fn, timeout=5000, every=50){ const end=Date.now()+timeout; for(;;){ const v=await fn(); if(v || Date.now()>=end) return v; await new Promise(r=>setTimeout(r,every)); } }
const paste=async(sel,text)=>pg.evaluate(([sel,text])=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); (sel? document.querySelector(sel) : document.activeElement).dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },[sel,text]);
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async t=>(await idbAll()).some(n=>n.blocks.some(b=>(b.text||'')===t));
const has=async t=>(await pg.locator('.blk').filter({hasText:t}).count())>0;
const out=async()=>{ await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.activeElement && document.activeElement.blur()); };   // the caret leaves every field: a paste lands on the sheet, Ctrl+Z goes to the undo stack
const undo=pg.locator('#undo'), saved=pg.locator('#saved'), cls=()=>saved.getAttribute('class'), label=()=>saved.locator('.sl').innerText();
const settled=()=>until(async()=>!/pend/.test(await cls()));   // no edit waits for its write
// every write goes into storage at once, but the app hears the result only when the scenario calls go() on it: window.__q in start order
const holdWrites=()=>pg.evaluate(()=>{ window.__q=[]; sheetDebug.saveHold=()=>{ const w={stored:true}; const p=new Promise(res=>{ w.go=()=>res(); }); window.__q.push(w); return p; }; });   // called once the transaction has landed
const realWrites=()=>pg.evaluate(()=>{ sheetDebug.saveHold=null; });
const heldStored=k=>until(()=>pg.evaluate(k=>window.__q.length===k+1 && window.__q[k].stored,k));   // write k has started, is in storage and waits for go()

await pg.goto(SITE); await ready();
await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready();
await pg.mouse.click(400,200); await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest('#sheet .blk')),null,{timeout:5000}); await pg.keyboard.type('статус'); await out();
await until(()=>stored('статус')); await settled();

// 1 the toast that Ctrl+Z offers stays visible when the next frame comes after the 220 ms hide timer of the toast it replaces.
// A pasted block edited afterwards (as in apppaste 5): Ctrl+Z hides the toast and at once offers «… видалено»; frames are 250 ms late meanwhile
await paste('body','змінена вставка'); await until(()=>has('змінена вставка'));
await pg.locator('.blk').filter({hasText:'змінена вставка'}).locator('.txt').click(); await pg.keyboard.press('End'); await pg.keyboard.type(' і дописана'); await out();
await pg.evaluate(()=>{ const raf=window.requestAnimationFrame.bind(window), caf=window.cancelAnimationFrame.bind(window), late=new Map(); let k=0; window.__slow=true;
  window.requestAnimationFrame=cb=>{ if(!window.__slow) return raf(cb); const id=-(++k), e={}; late.set(id,e); e.t=setTimeout(()=>{ e.r=raf(ts=>{ late.delete(id); cb(ts); }); },250); return id; };
  window.cancelAnimationFrame=id=>{ const e=late.get(id); if(!e) return caf(id); clearTimeout(e.t); if(e.r) caf(e.r); late.delete(id); }; });
await pg.keyboard.press('Control+z');
const show1=await until(()=>undo.evaluate(e=>e.classList.contains('show')),3000);   // the late frame has run, so has the 220 ms timer before it
const st1=await undo.evaluate(e=>({hidden:e.hidden, msg:e.querySelector('.umsg').textContent})), vis1=await undo.isVisible();
await pg.evaluate(()=>{ window.__slow=false; });
ok('1 Ctrl+Z при кадрі, що запізнився на 250 мс: плашка «'+st1.msg+'» з .show ('+!!show1+'), не hidden ('+!st1.hidden+'), видима ('+vis1+'), блок прибрано', !!show1 && !st1.hidden && vis1 && /видалено/.test(st1.msg) && !(await has('змінена вставка')));
if(vis1) await undo.locator('.uclose').click(); else await pg.evaluate(()=>sheetDebug.dropUndo()); await until(()=>undo.evaluate(e=>e.hidden),3000); await settled();

// 2 an edit made while ✓ is still shown keeps «●» past the 1.8 s after which ✓ fades, until that edit is written
await pg.locator('.blk').filter({hasText:'статус'}).locator('.txt').click(); await pg.keyboard.press('End');
await holdWrites(); await pg.keyboard.type('1'); const held2=await heldStored(0);
const r2=await pg.evaluate(async()=>{ const s=document.getElementById('saved'); window.__q[0].go(); await new Promise(r=>setTimeout(r,0)); const shown=s.className;   // the app has heard the write: ✓ and its 1.8 s timer
  window.__past=new Promise(r=>setTimeout(r,1800));   // set after the app's timer with the same delay, so it runs after it
  document.execCommand('insertText',false,'2'); return {shown, edited:s.className}; });   // the next edit right away, well inside the 1.8 s
const held2b=await heldStored(1); await pg.evaluate(()=>window.__past); const past2=await cls(), dot2=await label();
await pg.evaluate(()=>window.__q[1].go()); await until(async()=>/\bok\b/.test(await cls())); const end2=await cls();
ok('2 правка під час ✓ ('+r2.shown+' → '+r2.edited+'): після 1,8 с «●» лишається ('+past2+', «'+dot2+'»), поки запис не підтверджено ('+end2+')', held2 && held2b && /\bok\b/.test(r2.shown) && /pend/.test(r2.edited) && /pend/.test(past2) && dot2==='●' && /\bok\b/.test(end2));

// 3 an older write that finishes inside the 300 ms debounce of a newer edit shows no ✓: «●» stays until the newer write lands
await until(async()=>(await cls())==='saved',4000);   // ✓ of step 2 has faded, so its timer plays no part here
await pg.evaluate(()=>{ window.__q=[]; }); await pg.keyboard.type('3'); const held3=await heldStored(0);
await pg.evaluate(()=>{ const s=document.getElementById('saved'); document.addEventListener('input',()=>{ window.__q[0].go(); setTimeout(()=>{ window.__r3={cls:s.className, writes:window.__q.length}; },0); },{once:true}); });   // after the block's own input handler
await pg.keyboard.type('4'); const r3=await until(()=>pg.evaluate(()=>window.__r3));
const held3b=await heldStored(1); const mid3=await cls(), dot3=await label();
await pg.evaluate(()=>window.__q[1].go()); await until(async()=>/\bok\b/.test(await cls())); const end3=await cls(), ok3=await label();
await realWrites(); const saved3=await until(()=>stored('статус1234'));
ok('3 старіший запис завершився, поки новіша правка чекала ('+(r3&&r3.writes)+' запис почато): без ✓ ('+(r3&&r3.cls)+'), «●» до нового запису ('+mid3+', «'+dot3+'»), тоді «'+ok3+'» ('+end3+'), у сховищі «статус1234» ('+saved3+')',
  held3 && held3b && !!r3 && r3.writes===1 && /pend/.test(r3.cls) && !/\bok\b/.test(r3.cls) && /pend/.test(mid3) && dot3==='●' && /\bok\b/.test(end3) && ok3==='Збережено' && saved3);

// 4 an edit made with the history panel open on «Зараз», then a version picked before the autosave (in the same task): the edit is written
await settled(); await pg.click('#histBtn'); await until(()=>pg.evaluate(()=>[...document.querySelectorAll('#histList .hv')].some(d=>d.dataset.id && d.dataset.id!=='now')));
const r4=await pg.evaluate(()=>{ const t=[...document.querySelectorAll('#sheet .blk .txt')].find(e=>e.textContent.includes('статус1234')); if(!t) return null;
  t.focus(); const sel=getSelection(); sel.selectAllChildren(t); sel.collapseToEnd(); document.execCommand('insertText',false,'-після');
  const v=[...document.querySelectorAll('#histList .hv')].find(d=>d.dataset.id && d.dataset.id!=='now'); v.click(); return true; });
await pg.keyboard.press('Escape'); await until(async()=>await pg.locator('#hist').isHidden());
const shown4=await has('статус1234-після'), saved4=await until(()=>stored('статус1234-після'));
ok('4 правка при відкритій історії, потім вибір версії до автозбереження: після повернення текст на місці ('+shown4+') і записаний ('+saved4+')', !!r4 && shown4 && saved4);

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
