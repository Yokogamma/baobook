import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const swipe=async(x,y,dy)=>{ await touch('touchStart',[{x,y}]); for(let i=1;i<=6;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x,y:y+dy*i/6}]); } await touch('touchEnd',[]); };
const focusedTxt=()=>pg.evaluate(()=>!!document.activeElement && document.activeElement.classList.contains('txt'));
const nBlocks=()=>pg.locator('#sheet .blk').count();
await pg.goto(new URL('../index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
ok('0 на дотику підказка порожнього аркуша — про утримання, кнопка «+» видима', await pg.locator('.empty .big .touch').isVisible() && !(await pg.locator('.empty .big .mouse').isVisible()) && await pg.locator('#fab').isVisible());
// 1 одиночний дотик — нічого, лише підказка
await tap(150,400); await pg.waitForTimeout(250);
ok('1 одиночний дотик по порожньому місцю не створює блок і не відкриває клавіатуру; зʼявляється підказка', (await nBlocks())===0 && !(await focusedTxt()) && /Утримуйте палець/.test(await pg.locator('#toast').innerText()) && await pg.locator('#toast').evaluate(e=>e.classList.contains('show')));
// 2 утримання — блок у фокусі
await hold(150,400); await pg.waitForTimeout(150);
ok('2 утримання ~0,5 с створює блок і ставить курсор (фокус при відпусканні)', (await nBlocks())===1 && await focusedTxt());
await pg.keyboard.type('перший на телефоні'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
// 3 гортання не створює блоків
const before=await nBlocks(); await swipe(200,600,-120); await pg.waitForTimeout(700);
ok('3 жест гортання не створює блок', (await nBlocks())===before && !(await focusedTxt()));
// 4 утримали, але зрушили палець перед відпусканням — порожній блок прибирається
await touch('touchStart',[{x:150,y:560}]); await pg.waitForTimeout(650); const mid=await nBlocks(); for(let i=1;i<=4;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x:150,y:560+20*i}]); } await touch('touchEnd',[]); await pg.waitForTimeout(300);
ok('4 після утримання блок зʼявився ('+mid+'), але палець зрушили → порожній блок прибрано ('+(await nBlocks())+')', mid===before+1 && (await nBlocks())===before && !(await focusedTxt()));
// 5 кнопка «+»
const f=await box(pg.locator('#fab')); await tap(f.x+f.w/2, f.y+f.h/2); await pg.waitForTimeout(250);
{ const first=await box(pg.locator('#sheet .blk').first()); const last=await box(pg.locator('#sheet .blk').last());
  ok('5 «+» додає блок у наступний вільний ряд і ставить курсор', (await nBlocks())===before+1 && await focusedTxt() && last.y>first.y); }
await pg.keyboard.type('через плюс'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
// 6 панель відкрита — «+» схований; закрили — знову є
await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(250); const hiddenWhenOpen=!(await pg.locator('#fab').isVisible());
await tap(350,600); await pg.waitForTimeout(300);   // дотик по підкладці праворуч від панелі
ok('6 «+» ховається, поки відкрита панель нотаток, і повертається', hiddenWhenOpen && await pg.locator('#fab').isVisible());
// 7 область: дотик усередині — нічого, утримання — блок
await pg.locator('#areaBtn').tap(); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
const area=pg.locator('.blk.is-area').first(); const ab=await box(area.locator('.abody')); const inner0=await area.locator('.abody .blk').count();
await tap(ab.x+40, ab.y+30); await pg.waitForTimeout(250); const afterTap=await area.locator('.abody .blk').count();
await hold(ab.x+40, ab.y+30); await pg.waitForTimeout(200);
ok('7 в області: дотик нічого не створює ('+afterTap+'), утримання створює дочірній блок у фокусі', afterTap===inner0 && (await area.locator('.abody .blk').count())===inner0+1 && await focusedTxt());
await pg.keyboard.type('в області'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
// 8 підказка показується не більше трьох разів
await tap(300,300); await pg.waitForTimeout(100); await tap(300,300); await pg.waitForTimeout(100); await pg.evaluate(()=>document.getElementById('toast').classList.remove('show')); await tap(300,300); await pg.waitForTimeout(250);
ok('8 підказка про утримання показується щонайбільше тричі', !(await pg.locator('#toast').evaluate(e=>e.classList.contains('show'))));
// 8b довге натискання не запускає системне виділення: на аркуші user-select:none, текст блоків виділяється
{ const sheetUS=await pg.locator('#sheet').evaluate(e=>getComputedStyle(e).userSelect), idle=await pg.locator('.blk .txt').first().evaluate(e=>getComputedStyle(e).userSelect);
  const b=await box(pg.locator('.blk .txt').first()); await tap(b.x+b.w/2, b.y+b.h/2); await pg.waitForTimeout(250); const focused=await pg.locator('.blk .txt').first().evaluate(e=>getComputedStyle(e).userSelect); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  ok('8b на дотику аркуш не виділяється; текст блока системою виділяється лише з курсором у ньому (без курсора '+idle+', з курсором '+focused+')', sheetUS==='none' && idle==='none' && focused==='text'); }
// 9 після перезавантаження все на місці
await pg.reload(); await pg.waitForTimeout(500);
ok('9 після перезавантаження блоки й область збережені', (await pg.locator('.blk .txt').filter({hasText:'перший на телефоні'}).count())===1 && (await pg.locator('.blk .txt').filter({hasText:'через плюс'}).count())===1 && (await pg.locator('.blk.is-area .abody .txt').filter({hasText:'в області'}).count())===1);
await pg.screenshot({path:OUT+'/apptouch-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
