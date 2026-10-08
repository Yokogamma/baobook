import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, permissions:['clipboard-read','clipboard-write']});
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const paste=async(sel,text)=>pg.evaluate(([sel,text])=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); (sel? document.querySelector(sel) : document.activeElement).dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },[sel,text]);
const JS=`// Дебаунс
export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}`;
await pg.goto(SITE); await pg.waitForTimeout(400);
await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
// 1 вставка коду в щойно створений блок
await pg.mouse.click(400,300); await pg.waitForTimeout(50); await paste(null, JS); await pg.waitForTimeout(150);
const cb=pg.locator('.blk.is-code').first();
ok('1 вставка → блок коду, JavaScript, 8 рядків, замок закритий', (await cb.count())===1 && (await cb.locator('.lang').textContent())==='JavaScript' && (await cb.locator('.ln').count())===8 && await cb.locator('.cblk').evaluate(e=>e.classList.contains('locked')));
ok('1b чіп «Зробити текстом» показано', /Зробити текстом/.test(await pg.locator('.chip').textContent().catch(()=>'')));
const g=async()=>pg.evaluate(()=>{ const e=document.querySelector('.blk.is-code'); return {top:e.offsetTop,h:e.offsetHeight,left:e.offsetLeft}; });
const g1=await g(); ok('2 блок починається на ряду сітки, висота = ряди + рамка ('+g1.h+'px)', (g1.top-12)%24===0 && ((g1.h-1)%24===0 || (g1.h-2)%24===0));
// 3 клік нижче блока → текстовий блок не накладається
await pg.mouse.click(400, g1.top+g1.h+30); await pg.keyboard.type('Під кодом'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
const t1=await pg.evaluate(()=>{ const t=[...document.querySelectorAll('.blk:not(.is-code)')].pop(); return t.offsetTop; });
ok('3 текстовий блок під кодом не перетинається з ним', t1>=g1.top+g1.h);
// 4 подвійний клік у 3-й рядок → курсор у точці, авто-закриття при кліку поза блоком
{ const box=await cb.locator('.ln').nth(2).boundingBox(); const x=box.x+box.width-20, y=box.y+box.height/2;
  const want=await pg.evaluate(([x,y])=>{ const c=document.querySelector('.blk.is-code code'); const r=document.caretRangeFromPoint(x,y); let n=0; const w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())){ if(t===r.startContainer) return n+r.startOffset; n+=t.length; } return -1; },[x,y]);
  await pg.mouse.dblclick(x,y); await pg.waitForTimeout(80);
  const got=await pg.evaluate(()=>{ const s=getSelection(); return s.isCollapsed? s.anchorOffset : -2; });
  ok('4 подвійний клік: редагування, курсор у точці кліку ('+got+'='+want+')', await cb.evaluate(e=>e.querySelector('.cblk').classList.contains('editing')) && got===want);
  await pg.keyboard.type(' /* Ж */'); await pg.locator('.blk:not(.is-code) .txt').last().click(); await pg.waitForTimeout(80);
  ok('5 клік поза блоком → тільки читання, правка збережена з підсвіткою', await cb.evaluate(e=>e.querySelector('.cblk').classList.contains('locked') && e.querySelector('code').textContent.includes('/* Ж */') && e.querySelectorAll('.ln').length===8)); }
// 6 копіювати
await cb.locator('.copy').click(); await pg.waitForTimeout(150);
const clip=await pg.evaluate(()=>navigator.clipboard.readText().catch(()=>'')); ok('6 «Копіювати» кладе чистий текст у буфер', clip.includes('debounce') && clip.includes('/* Ж */') && !clip.includes('<'));
// 7 перенос і номери → перезавантаження
await cb.locator('.wrapb').click(); await cb.locator('.num').click(); await pg.waitForTimeout(400);
await pg.reload(); await pg.waitForTimeout(500);
ok('7 після перезавантаження: блок коду, підсвітка, мова, вимкнений перенос і номери збережені', (await pg.locator('.blk.is-code').count())===1 && (await pg.locator('.blk.is-code .ln').count())===8 && (await pg.locator('.blk.is-code .lang').textContent())==='JavaScript' && await pg.locator('.blk.is-code .cblk').evaluate(e=>!e.classList.contains('wrapped')&&e.classList.contains('num')&&e.classList.contains('locked')));
// 8 довгий код на порожньому місці (нічого не в фокусі) → новий блок унизу, згорнутий
const LONG=Array.from({length:22},(_,i)=>`  row_${i} = grid.rows[${i}];`).join('\n');
await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.activeElement.blur()); await paste('body', LONG); await pg.waitForTimeout(200);
const long=pg.locator('.blk.is-code').last();
ok('8 вставка без фокуса → новий блок коду внизу, згорнуто до 12 рядків + «Розгорнути · ще 10»', (await pg.locator('.blk.is-code').count())===2 && (await long.locator('.ln').count())===22 && await long.evaluate(e=>e.querySelector('.cblk').classList.contains('cut') && e.querySelector('.code').style.height==='292px') && /Розгорнути · ще 10 рядків/.test(await long.locator('.more').textContent()));
const hBefore=await long.evaluate(e=>e.offsetHeight); await long.locator('.more').click(); await pg.waitForTimeout(100);
ok('9 «Розгорнути» розгортає, блок став вищим, кнопка «Згорнути»', (await long.evaluate(e=>e.offsetHeight))>hBefore && !(await long.evaluate(e=>e.querySelector('.cblk').classList.contains('cut'))) && (await long.locator('.more').textContent())==='Згорнути');
// 10 перетягування за ручку
{ const gr=await long.locator('.grip').boundingBox(); const top0=await long.evaluate(e=>e.offsetTop);
  await pg.mouse.move(gr.x+10,gr.y+12); await pg.mouse.down(); await pg.mouse.move(gr.x+10, gr.y+12+120,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(150);
  ok('10 блок коду перетягується за ручку', (await long.evaluate(e=>e.offsetTop))>top0); }
// 11 пошук по коду
await pg.locator('#sideBtn').click().catch(()=>{}); if(!(await pg.evaluate(()=>document.getElementById('app').classList.contains('open')))) await pg.locator('#sideBtn').click();
await pg.fill('#q','grid.rows'); await pg.waitForTimeout(300);
ok('11 пошук знаходить текст блока коду з підсвіткою', (await pg.locator('.item').count())===1 && /<mark>grid.rows<\/mark>/.test(await pg.locator('.item .it-s').innerHTML()));
await pg.fill('#q',''); await pg.waitForTimeout(200);
// 12 два рядки з ознаками коду → текст + чіп «Зробити кодом» → код
await pg.mouse.click(400, 800); await pg.waitForTimeout(50); await paste(null, 'a = 1;\nb = 2;'); await pg.waitForTimeout(150);
ok('12 короткий фрагмент → текст із чіпом «Зробити кодом»', /Зробити кодом/.test(await pg.locator('.chip').textContent().catch(()=>'')));
await pg.locator('.chip .swap').click(); await pg.waitForTimeout(150);
ok('12b чіп перетворив його на блок коду', (await pg.locator('.blk.is-code').count())===3);
// 13 видалення: відкрити, стерти все, вийти
{ const c=pg.locator('.blk.is-code').last(); await c.locator('.lock').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Backspace'); await pg.locator('#ttl').click(); await pg.waitForTimeout(100);
  ok('13 порожній блок коду зникає після виходу', (await pg.locator('.blk.is-code').count())===2); }
// 14 друк у закритий блок → підказка, текст незмінний
await cb.locator('.code').click(); await pg.keyboard.type('Ы'); await pg.waitForTimeout(80);
ok('14 друк у закритий блок: підказка, текст не змінився', (await cb.locator('.hint').count())===1 && !(await cb.locator('code').textContent()).includes('Ы'));
await pg.mouse.move(10,10); await pg.evaluate(()=>window.scrollTo(0,0)); await pg.waitForTimeout(200); await pg.screenshot({path:OUT+'/app-code.png'});
await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.waitForTimeout(200); await pg.screenshot({path:OUT+'/app-code-sand.png'});
await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(400); await pg.screenshot({path:OUT+'/app-code-mobile.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
