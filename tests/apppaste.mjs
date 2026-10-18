import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const paste=async(sel,text)=>pg.evaluate(([sel,text])=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); (sel? document.querySelector(sel) : document.activeElement).dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },[sel,text]);
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async(re)=>(await idbAll()).some(n=>n.blocks.some(b=>new RegExp(re).test(b.text||'')));
const undo=pg.locator('#undo'); const shown=async()=>await undo.evaluate(e=>!e.hidden && e.classList.contains('show'));
const appears=()=>until(shown);   // the toast gets .show in the next frame, which can come late on a busy machine
const has=async t=>(await pg.locator('.blk').filter({hasText:t}).count())>0, codes=()=>pg.locator('.blk.is-code').count();
const out=async()=>{ await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.activeElement && document.activeElement.blur()); await pg.waitForTimeout(50); };   // the caret leaves every field, the paste lands on the sheet
const JS=`// Debounce
export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}`;
await pg.goto(SITE); await ready(pg); await pg.waitForTimeout(400);
await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready(pg);
// the text goes in once the caret is in the new block (typed earlier, it would be lost)
await pg.mouse.click(400,200); await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest('#sheet .blk')),null,{timeout:5000}); await pg.keyboard.type('перший блок'); await out(); await pg.waitForTimeout(600);
// 1 text pasted onto the sheet: a new block, no toast; Ctrl+Z takes it away and the earlier block stays
await paste('body','вставлений текст'); await pg.waitForTimeout(700);
const made1=await has('вставлений текст'), saved1=await stored('вставлений текст'), toast1=await shown();
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(700);
ok('1 текст на аркуш → новий блок ('+made1+', збережено '+saved1+', без плашки '+!toast1+'); Ctrl+Z прибирає його ('+!(await has('вставлений текст'))+') і зі сховища, перший блок лишився', made1 && saved1 && !toast1 && !(await has('вставлений текст')) && !(await stored('вставлений текст')) && await has('перший блок'));
// 2 code pasted onto the sheet: a code block with the chip; Ctrl+Z takes it away
await paste('body',JS); await pg.waitForTimeout(300); const made2=(await codes())===1;
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
ok('2 код на аркуш → блок коду ('+made2+'); Ctrl+Z прибирає його', made2 && (await codes())===0 && await has('перший блок'));
// 3 code pasted into a block just made by a click turns it into a code block; Ctrl+Z takes it away
await pg.mouse.click(400,500); await pg.waitForTimeout(80); await paste(null,JS); await pg.waitForTimeout(300); const made3=(await codes())===1;
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
ok('3 код у щойно створений блок → блок коду ('+made3+'); Ctrl+Z прибирає його ('+(await codes())+' блоків коду), порожнього блока не лишилось', made3 && (await codes())===0 && (await pg.locator('.blk').count())===1);
// 4 two pastes go back in reverse order
await out(); await paste('body','друга вставка'); await pg.waitForTimeout(100); await paste('body','третя вставка'); await pg.waitForTimeout(100);
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); const one4=!(await has('третя вставка')) && await has('друга вставка');
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ok('4 дві вставки: перший Ctrl+Z прибирає третю ('+one4+'), другий — другу', one4 && !(await has('друга вставка')) && await has('перший блок'));
// 5 a pasted block edited afterwards: Ctrl+Z still takes it away, but with the «Скасувати» toast, and the next Ctrl+Z brings it back with the edit
await paste('body','змінена вставка'); await pg.waitForTimeout(100);
await pg.locator('.blk').filter({hasText:'змінена вставка'}).locator('.txt').click(); await pg.keyboard.press('End'); await pg.keyboard.type(' і дописана'); await out();
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300); const gone5=!(await has('змінена вставка')), toast5=await appears() && /видалено/.test(await undo.locator('.umsg').innerText());
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
ok('5 вставку дописали: Ctrl+Z прибирає її ('+gone5+') з плашкою «видалено» ('+toast5+'), наступний Ctrl+Z повертає з дописаним', gone5 && toast5 && await has('змінена вставка і дописана'));
// 6 a toast for an older action hides when a paste goes on top of the stack: its button would undo the paste, not what it says
await pg.locator('.blk').filter({hasText:'змінена вставка'}).locator('.txt').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(200);
const toast6=await appears(); await out(); await paste('body','поверх плашки'); await pg.waitForTimeout(400); const hid6=!(await shown());
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); const gone6=!(await has('поверх плашки'));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300);
ok('6 плашка про видалений блок ('+toast6+') ховається після вставки ('+hid6+'); Ctrl+Z прибирає вставку ('+gone6+'), наступний повертає видалений блок', toast6 && hid6 && gone6 && await has('змінена вставка і дописана'));
// 7 paste into a field stays in that field's own history: Ctrl+Z there undoes the text, the block stays
await pg.locator('.blk').filter({hasText:'перший блок'}).locator('.txt').click(); await pg.keyboard.press('End'); await paste(null,' + у полі'); await pg.waitForTimeout(100);
const in7=await has('перший блок + у полі'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ok('7 вставка в поле ('+in7+'): Ctrl+Z у полі скасовує лише текст, блоки на місці', in7 && !(await has('у полі')) && await has('перший блок') && await has('змінена вставка і дописана'));
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
