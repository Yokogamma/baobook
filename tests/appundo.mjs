import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); let dialogs=0; pg.on('dialog',d=>{ dialogs++; d.accept(); });
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async(re)=>(await idbAll()).some(n=>n.blocks.some(b=>new RegExp(re).test(b.text||'')||new RegExp(re).test(b.title||'')));
const undo=pg.locator('#undo'); const shown=async()=>await undo.evaluate(e=>!e.hidden && e.classList.contains('show'));
await pg.goto(SITE); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
// область із двома блоками + окремий блок на аркуші
await pg.mouse.move(500,260); await pg.mouse.down(); await pg.mouse.move(1000,420,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
await pg.keyboard.type('Паролі'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
const area=()=>pg.locator('.blk.is-area').first(); const ab=await box(area().locator('.ablk'));
await pg.mouse.click(ab.x+60, ab.y+70); await pg.keyboard.type('komax-backups'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
await pg.mouse.click(ab.x+60, ab.y+118); await pg.keyboard.type('komax-orders'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
await pg.mouse.click(500,700); await pg.keyboard.type('окремий блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
const kid=t=>pg.locator('.blk').filter({hasText:t}).locator('.txt').first();
const k1=await box(kid('komax-backups')), k2=await box(kid('komax-orders')); const color=await area().locator('.ablk').getAttribute('data-color');
ok('0 область з двома блоками, все збережено', (await area().locator('.abody .blk').count())===2 && await stored('Паролі') && await stored('komax-orders'));
// 1 меню «⋯»
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await pg.waitForTimeout(120);
const menu=area().locator('.amenu');
ok('1a «⋯» відкриває меню з двома пунктами: розгрупувати і видалити (з кількістю блоків)', (await menu.count())===1 && (await menu.locator('.mi').count())===2 && /Розгрупувати/.test(await menu.innerText()) && /Видалити область і 2 блоки/.test(await menu.innerText()) && (await area().locator('.cb.more').getAttribute('aria-expanded'))==='true');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
ok('1b Esc закриває меню', (await menu.count())===0 && (await area().locator('.cb.more').getAttribute('aria-expanded'))==='false');
await area().locator('.cb.more').click(); await pg.waitForTimeout(100); await pg.mouse.click(400,820); await pg.waitForTimeout(100);
ok('1c клік поза меню закриває його', (await menu.count())===0);
// 2 розгрупувати → плашка → правка дитини → «Скасувати» повертає область і дітей на ті самі місця
await area().locator('.cb.more').click(); await menu.locator('.ungroup').click(); await pg.waitForTimeout(250);
ok('2a область зникла без діалогу, блоки лишились на аркуші на своїх місцях', dialogs===0 && (await pg.locator('.blk.is-area').count())===0 && (await pg.locator('#sheet > .blk').filter({hasText:'komax-backups'}).count())===1 && (await box(kid('komax-backups'))).x===k1.x && (await box(kid('komax-backups'))).y===k1.y);
ok('2b плашка «Скасувати» видно, текст про розгрупування', await shown() && /розгруповано/.test(await undo.locator('.umsg').innerText()) && /Скасувати/.test(await undo.locator('.ubtn').innerText()));
{ const t=kid('komax-orders'); await t.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' 2024'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); }
await undo.locator('.ubtn').click(); await pg.waitForTimeout(400);
{ const a=pg.locator('.blk.is-area').first(); const nb=await box(a.locator('.ablk'));
  ok('2c після «Скасувати»: область повернулась (назва, колір, місце), обидва блоки всередині на тих самих місцях, правка тексту збереглась', (await a.count())===1 && (await a.locator('.ctitle').innerText())==='Паролі' && (await a.locator('.ablk').getAttribute('data-color'))===color && nb.x===ab.x && nb.y===ab.y && (await a.locator('.abody .blk').count())===2 && (await box(kid('komax-backups'))).y===k1.y && (await box(kid('komax-orders 2024'))).y===k2.y && (await box(kid('komax-orders 2024'))).x===k2.x);
  ok('2d плашка сховалась, у сховищі знову є область і вкладеність', !(await shown()) && await stored('Паролі') && (await idbAll()).some(n=>n.blocks.some(b=>/komax-orders/.test(b.text||'') && !!b.parent))); }
// 3 видалити → плашка → Ctrl+Z повертає
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await menu.locator('.del').click(); await pg.waitForTimeout(400);
ok('3a область з вмістом видалено одразу, без діалогу; у сховищі їх немає', dialogs===0 && (await pg.locator('.blk.is-area').count())===0 && (await pg.locator('.blk').filter({hasText:'komax'}).count())===0 && !(await stored('Паролі')) && !(await stored('komax-backups')));
ok('3b плашка: «Область «Паролі» видалено разом із 2 блоками»', await shown() && /«Паролі» видалено разом із 2 блоками/.test(await undo.locator('.umsg').innerText()));
await pg.mouse.click(400,820); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
{ const a=pg.locator('.blk.is-area').first(); const nb=await box(a.locator('.ablk'));
  ok('3c Ctrl+Z поза редагуванням повертає область із обома блоками на ті самі місця', (await a.count())===1 && nb.x===ab.x && nb.y===ab.y && (await a.locator('.abody .blk').count())===2 && (await box(kid('komax-backups'))).y===k1.y && (await box(kid('komax-orders 2024'))).y===k2.y && await stored('komax-backups') && !(await shown())); }
// 4 Ctrl+Z під час редагування тексту — не чіпає плашку
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await menu.locator('.del').click(); await pg.waitForTimeout(300);
await kid('окремий блок').click(); await pg.keyboard.press('End'); await pg.keyboard.type(' +'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
{ const t=(await kid('окремий блок').innerText()).split(String.fromCharCode(0x200b)).join('');
  ok('4 Ctrl+Z у текстовому блоці скасовує правку в ньому («'+t+'») і не повертає область (плашка ще висить)', t==='окремий блок' && (await pg.locator('.blk.is-area').count())===0 && await shown()); }
await pg.keyboard.press('Escape'); await undo.locator('.ubtn').click(); await pg.waitForTimeout(300);
ok('4b «Скасувати» з плашки після цього все ж повертає', (await pg.locator('.blk.is-area').count())===1 && (await area().locator('.abody .blk').count())===2);
// 5 область із блоками: плашка без таймера — через 8 с ще видно; ✕ ховає її, але стек лишається: Ctrl+Z поза полем повертає область
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await menu.locator('.del').click(); await pg.waitForTimeout(8000);
const still5=await shown(); await undo.locator('.uclose').click(); await pg.waitForTimeout(300); const hid5=!(await shown());
await pg.mouse.click(400,820); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(900);
ok('5 область із блоками: плашка без таймера ('+still5+'), ✕ сховав ('+hid5+'), Ctrl+Z після цього повернув область ('+(await pg.locator('.blk.is-area').count())+') і її збережено', still5 && hid5 && (await pg.locator('.blk.is-area').count())===1 && (await area().locator('.abody .blk').count())===2 && await stored('Паролі'));
// 6 перехід на іншу нотатку ховає плашку, стек нотатки лишається: у новій нотатці Ctrl+Z нічого не повертає, після повернення — повертає область
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await menu.locator('.del').click(); await pg.waitForTimeout(200);
await pg.locator('#newBtn').click(); await pg.waitForTimeout(300); const hidden6=!(await shown()); await pg.keyboard.press('Escape'); await pg.waitForTimeout(50); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(300); const none6=(await pg.locator('.blk').count())===0;
if(!(await pg.locator('.app').evaluate(e=>e.classList.contains('open')))) { await pg.locator('#sideBtn').click(); await pg.waitForTimeout(250); } await pg.locator('.item:not(.cur)').first().click(); await pg.waitForTimeout(400); const hidden6b=!(await shown()); await pg.keyboard.press('Escape'); await pg.waitForTimeout(50); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(600);   // на компʼютері панель нотаток зазвичай уже відкрита
ok('6 нова нотатка: плашка сховалась ('+hidden6+'), Ctrl+Z там нічого не створює ('+none6+'); після повернення плашки немає ('+hidden6b+'), Ctrl+Z повертає область ('+(await pg.locator('.blk.is-area').count())+')', hidden6 && none6 && hidden6b && (await pg.locator('.blk.is-area').count())===1 && (await area().locator('.abody .blk').count())===2);
// 7 два записи поспіль повертаються у зворотному порядку: спершу стертий блок, потім розгрупована область
await area().locator('.ablk').hover(); await area().locator('.cb.more').click(); await menu.locator('.ungroup').click(); await pg.waitForTimeout(300);
{ await kid('окремий блок').click(); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(150); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(300);
  const gone=(await pg.locator('.blk').filter({hasText:'окремий блок'}).count())===0, msg=await undo.locator('.umsg').innerText();
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400); const back1=(await pg.locator('.blk').filter({hasText:'окремий блок'}).count())===1, noArea=(await pg.locator('.blk.is-area').count())===0;
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500); const back2=(await pg.locator('.blk.is-area').count())===1 && (await area().locator('.abody .blk').count())===2;
  ok('7 стек: блок стерто ('+gone+', «'+msg+'»), перший Ctrl+Z повернув блок ('+back1+'; область ще розгрупована: '+noArea+'), другий — область із двома блоками ('+back2+')', gone && /окремий блок/.test(msg) && back1 && noArea && back2); }
// 8 не більше 20 записів на нотатку
{ const n=await pg.evaluate(()=>{ for(let i=0;i<25;i++) sheetDebug.offerUndo('запис '+i); return sheetDebug.undoCount(); }); await pg.evaluate(()=>sheetDebug.dropUndo()); ok('8 після 25 записів у стеку '+n+' (ліміт 20)', n===20); }
await pg.screenshot({path:OUT+'/appundo-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
