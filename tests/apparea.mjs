import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
await pg.goto(new URL('../public/index.html', import.meta.url).href); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
// 1 протяжка мишею → область
await pg.mouse.move(500,300); await pg.mouse.down(); await pg.mouse.move(980,460,{steps:8}); 
ok('1a під час протяжки видно рамку', (await pg.locator('.marq').count())===1);
await pg.mouse.up(); await pg.waitForTimeout(200);
const area=pg.locator('.blk.is-area').first(); const ab=await box(area.locator('.ablk'));
ok('1b область створена, розмір кратний сітці, назва у фокусі: '+JSON.stringify(ab), (await area.count())===1 && ab.w%24===0 && ab.h%24===0 && ab.w>=400 && await pg.evaluate(()=>document.activeElement.classList.contains('ctitle')));
await pg.keyboard.type('Ідеї на тиждень'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
// 2 клік усередині → дочірній блок
await pg.mouse.click(ab.x+60, ab.y+70); await pg.keyboard.type('перша ідея всередині'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
ok('2 клік в області → текстовий блок усередині області', (await area.locator('.abody .blk .txt').count())===1 && (await area.locator('.abody .blk .txt').first().textContent())==='перша ідея всередині');
// 3 другий блок біля низу → область підростає
const h0=(await box(area.locator('.ablk'))).h; await pg.mouse.click(ab.x+60, ab.y+ab.h-8); await pg.keyboard.type('друга ідея'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
const h1=(await box(area.locator('.ablk'))).h;
ok('3 блок біля нижнього краю → область підросла ('+h0+'→'+h1+')', (await area.locator('.abody .blk').count())===2 && h1>h0 && h1%24===0);
// 4 перенос області за ручку → діти їдуть разом
{ const k=await box(area.locator('.abody .blk').first()); const g=await box(area.locator('.grip').first()); await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10, g.y+12+96,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
  const k2=await box(area.locator('.abody .blk').first()); const a2=await box(area.locator('.ablk'));
  ok('4 область переїхала вниз, дочірній блок разом із нею (Δy '+(k2.y-k.y)+')', a2.y>ab.y && k2.y-k.y===a2.y-ab.y && k2.x===k.x); }
// 5 блок з аркуша → всередину області
await pg.mouse.click(400,300); await pg.keyboard.type('зовнішній'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
{ const ext=pg.locator('.blk:not(.is-area):not(.is-code)').filter({hasText:'зовнішній'}); const g=await box(ext.locator('.grip')); const a=await box(area.locator('.ablk'));
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(a.x+240, a.y+a.h-40,{steps:10}); await pg.waitForTimeout(80);
  ok('5a під час перетягування контур усередині області', await pg.evaluate(()=>document.querySelector('.gbox').closest('.abody')!==null));
  await pg.mouse.up(); await pg.waitForTimeout(600);
  ok('5b блок став дочірнім: у DOM області і з parent у моделі', (await area.locator('.abody .blk').filter({hasText:'зовнішній'}).count())===1 && (await idbAll()).some(n=>n.blocks.some(b=>/зовнішній/.test(b.text||'') && !!b.parent))); }
// 6 дочірній блок → назовні
{ const kid=area.locator('.abody .blk').filter({hasText:'друга ідея'}); const g=await box(kid.locator('.grip')); await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10, 860,{steps:10}); await pg.mouse.up(); await pg.waitForTimeout(200);
  ok('6 блок витягнуто з області на аркуш', (await area.locator('.abody .blk').filter({hasText:'друга ідея'}).count())===0 && (await pg.locator('#sheet > .blk').filter({hasText:'друга ідея'}).count())===1); }
// 7 згорнути / розгорнути
await area.locator('.fold').click(); await pg.waitForTimeout(150);
const cb=await box(area.locator('.ablk'));
ok('7a згорнуто: лише шапка, вміст схований ('+cb.h+'px)', cb.h%24===22 && cb.h<=70 && !(await area.locator('.abody').isVisible()));
await area.locator('.fold').click(); await pg.waitForTimeout(150);
ok('7b розгорнуто: вміст знову видно', await area.locator('.abody').isVisible() && (await area.locator('.abody .blk').count())===2);
// 8 колір
await area.locator('.ablk').hover(); await area.locator('.colorb').click(); await pg.waitForTimeout(100);
ok('8a палітра з 6 кольорів', (await pg.locator('.cpick button').count())===6);
await pg.locator('.cpick button[data-c="yellow"]').click(); await pg.waitForTimeout(400);
ok('8b колір застосовано і фон змінився', (await area.locator('.ablk').getAttribute('data-color'))==='yellow' && await area.locator('.ablk').evaluate(e=>getComputedStyle(e).backgroundColor!=='rgb(246, 245, 242)'));
// 9 пошук за назвою області
await pg.fill('#q','тиждень'); await pg.waitForTimeout(300); ok('9 назва області шукається', (await pg.locator('.item').count())===1); await pg.fill('#q',''); await pg.waitForTimeout(200);
// 10 перезавантаження
const before=await pg.evaluate(()=>[...document.querySelectorAll('.blk')].map(b=>({t:(b.querySelector('.txt')||b.querySelector('.ctitle')).textContent.slice(0,12), in:!!b.closest('.abody')})));
await pg.reload(); await pg.waitForTimeout(500);
const after=await pg.evaluate(()=>[...document.querySelectorAll('.blk')].map(b=>({t:(b.querySelector('.txt')||b.querySelector('.ctitle')).textContent.slice(0,12), in:!!b.closest('.abody')})));
ok('10 після перезавантаження: область, її назва, колір і вкладеність дітей збережені', JSON.stringify(before.sort((a,b)=>a.t.localeCompare(b.t)))===JSON.stringify(after.sort((a,b)=>a.t.localeCompare(b.t))) && (await pg.locator('.blk.is-area .ablk').getAttribute('data-color'))==='yellow' && (await pg.locator('.blk.is-area .ctitle').textContent())==='Ідеї на тиждень');
// 11 розгрупувати: діти лишаються на місці
{ const area2=pg.locator('.blk.is-area').first(); const kid=area2.locator('.abody .blk').first(); const kb=await box(kid); const txt=await kid.locator('.txt').textContent();
  await area2.locator('.ablk').hover(); await area2.locator('.cb.more').click(); await area2.locator('.amenu .ungroup').click(); await pg.waitForTimeout(200);
  const nb=await box(pg.locator('#sheet > .blk').filter({hasText:txt.slice(0,10)}));
  ok('11 розгрупування: області немає, блок лишився на тому ж місці (Δ '+(nb.x-kb.x)+','+(nb.y-kb.y)+')', (await pg.locator('.blk.is-area').count())===0 && Math.abs(nb.x-kb.x)<=1 && Math.abs(nb.y-kb.y)<=1); }
// 12 кнопка «Область» → нова область унизу; видалення з вмістом
await pg.locator('#areaBtn').click(); await pg.waitForTimeout(200); const a3=pg.locator('.blk.is-area').first();
ok('12a кнопка «Область» створила область і поставила курсор у назву', (await a3.count())===1 && await pg.evaluate(()=>document.activeElement.classList.contains('ctitle')));
await pg.keyboard.press('Escape'); const ab3=await box(a3.locator('.ablk')); await pg.mouse.click(ab3.x+60, ab3.y+70); await pg.keyboard.type('усередині'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
const total=await pg.locator('.blk').count(); await a3.locator('.ablk').hover(); await a3.locator('.cb.more').click(); await a3.locator('.amenu .del').click(); await pg.waitForTimeout(200);
ok('12b видалення області забирає і її вміст', (await pg.locator('.blk.is-area').count())===0 && (await pg.locator('.blk').count())===total-2);
// 13 простий клік мишею без руху → текстовий блок (через pointerup)
await pg.mouse.click(1000,700); await pg.keyboard.type('клік'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
ok('13 клік без протяжки → текстовий блок', (await pg.locator('#sheet > .blk').filter({hasText:'клік'}).count())===1);
await pg.mouse.move(10,10); await pg.evaluate(()=>window.scrollTo(0,0));
// 14 тач: тап створює блок одразу
const tctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true}); const tp=await tctx.newPage(); await tp.goto(new URL('../public/index.html', import.meta.url).href); await tp.waitForTimeout(300);
const tcdp=await tctx.newCDPSession(tp); await tp.touchscreen.tap(150,400); await tp.waitForTimeout(200); const tapMade=await tp.locator('#sheet .blk').count();
await tcdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:400}]}); await tp.waitForTimeout(650); await tcdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await tp.waitForTimeout(150);
ok('14 тач: тап нічого не створює ('+tapMade+'), утримання створює текстовий блок у фокусі', tapMade===0 && (await tp.locator('#sheet .blk').count())===1 && await tp.evaluate(()=>document.activeElement.classList.contains('txt')));
await tp.close(); await tctx.close();
// скріншот сцени для користувача
await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
await pg.mouse.move(440,180); await pg.mouse.down(); await pg.mouse.move(1000,470,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(150); await pg.keyboard.type('Запуск: що зробити до пʼятниці'); await pg.keyboard.press('Enter');
{ const a=await box(pg.locator('.blk.is-area .ablk').first()); await pg.mouse.click(a.x+60,a.y+70); await pg.keyboard.type('Зібрати відгуки з тестування'); await pg.keyboard.press('Escape'); await pg.mouse.click(a.x+60,a.y+118); await pg.keyboard.type('Оновити скріншоти в описі'); await pg.keyboard.press('Escape'); await pg.mouse.click(a.x+330,a.y+70); await pg.keyboard.type('Дедлайн: пт, 16:00'); await pg.keyboard.press('Escape');
  await pg.locator('.blk.is-area .ablk').hover(); await pg.locator('.blk.is-area .colorb').click(); await pg.locator('.cpick button[data-c="blue"]').click(); }
await pg.mouse.click(120,560); await pg.keyboard.type('Окрема думка поза областю'); await pg.keyboard.press('Escape'); await pg.mouse.move(700,700); await pg.waitForTimeout(200);
await pg.screenshot({path:OUT+'/app-area.png',clip:{x:280,y:0,width:1000,height:640}});
await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.waitForTimeout(200); await pg.screenshot({path:OUT+'/app-area-sand.png',clip:{x:280,y:0,width:1000,height:640}});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
