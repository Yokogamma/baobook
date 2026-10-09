import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=SITE;
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
const JS='function a(){\n  return 1;\n}\nfunction b(){\n  return 2;\n}';
/* ── телефон: перенос за шапку після утримання, шапка коду одним рядком, альтернативи в меню блока ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true,permissions:['clipboard-read','clipboard-write']}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
  const blk=t=>pg.locator('#sheet > .blk').filter({hasText:t});
  const topOf=loc=>loc.evaluate(e=>parseInt(e.style.top)||0);
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await hold(80,300); await pg.waitForTimeout(250); await pg.keyboard.type('Перший блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.hm .mi').first()); await pg.waitForTimeout(300); await pg.keyboard.type('Папка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  const area=pg.locator('#sheet > .blk.is-area').first();
  // 1 утримання за шапку (на назві, не в правці) піднімає картку; рух переносить; після відпускання область на новому місці
  { const bar=await box(area.locator('.cbar')); const t0=await topOf(area); await touch('touchStart',[{x:bar.x+30,y:bar.y+bar.h/2}]); await pg.waitForTimeout(450); const lifted=await area.evaluate(e=>e.classList.contains('lift')&&e.classList.contains('drag'));
    for(let i=1;i<=6;i++){ await pg.waitForTimeout(30); await touch('touchMove',[{x:bar.x+30,y:bar.y+bar.h/2+20*i}]); } await touch('touchEnd',[]); await pg.waitForTimeout(400); const t1=await topOf(area), cls=await area.getAttribute('class');
    ok('1 шапка області: після 450 мс картку піднято ('+lifted+'), рух переніс її ('+t0+' → '+t1+'), класи зняті ('+cls+')', lifted && t1>=t0+96 && t1<=t0+144 && !/lift|drag/.test(cls)); }
  // 2 рух по шапці без утримання — не перенос (гортання), область на місці; дотик по назві ставить курсор
  { const bar=await box(area.locator('.cbar')); const t0=await topOf(area); await touch('touchStart',[{x:bar.x+30,y:bar.y+bar.h/2}]); for(let i=1;i<=4;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x:bar.x+30,y:bar.y+bar.h/2+25*i}]); } await touch('touchEnd',[]); await pg.waitForTimeout(400); const t1=await topOf(area);
    const b2=await box(area.locator('.cbar')); await tap(b2.x+30, b2.y+b2.h/2); await pg.waitForTimeout(300); const edit=await pg.evaluate(()=>document.activeElement.classList.contains('ctitle')); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    ok('2 рух без утримання не переносить ('+t0+' = '+t1+'); дотик по назві ставить курсор ('+edit+')', t1===t0 && edit); }
  // 3 шапка блока коду одним рядком: 48px, «⋯» замість переносу й номерів; «⋯» → «Номери рядків» вмикає номери
  { await hold(80,720); await pg.waitForTimeout(250); await pg.evaluate(js=>{ const dt=new DataTransfer(); dt.setData('text/plain',js); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }, JS); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    const code=pg.locator('#sheet .blk.is-code').first(); const bar=await box(code.locator('.cbar')), tt=await box(code.locator('.ctitle')), acts=await box(code.locator('.acts'));
    const vis=await code.evaluate(e=>({more:getComputedStyle(e.querySelector('.cmore')).display, num:getComputedStyle(e.querySelector('.num')).display, wrap:getComputedStyle(e.querySelector('.wrapb')).display, copy:getComputedStyle(e.querySelector('.cb.copy span')).display}));
    await tapEl(code.locator('.cmore')); await pg.waitForTimeout(250); const items=(await pg.locator('.amenu.cm .mi').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')); await tapEl(pg.locator('.amenu.cm .mi').filter({hasText:'Номери'})); await pg.waitForTimeout(300); const num=await code.evaluate(e=>e.querySelector('.cblk').classList.contains('num'));
    ok('3 шапка коду: '+bar.h+'px, назва і кнопки в одному ряду ('+tt.y+'/'+tt.h+' і '+acts.y+'/'+acts.h+'), «⋯» '+vis.more+', номери '+vis.num+', перенос '+vis.wrap+', підпис «Копіювати» '+vis.copy+'; меню: '+items.join(' | ')+'; номери увімкнено ('+num+')', bar.h===48 && Math.abs((tt.y+tt.h/2)-(acts.y+acts.h/2))<=4 && vis.more!=='none' && vis.num==='none' && vis.wrap==='none' && vis.copy==='none' && items.length===2 && /Номери/.test(items.join(' ')) && /Перенос/.test(items.join(' ')) && num); }
  // 4 меню блока: «В область…» → список областей → блок всередині; «З області» → знову на аркуші під областю
  { await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300); await tapEl(blk('Перший').locator('.bact')); await pg.waitForTimeout(250); const items=(await pg.locator('.amenu.bm .mi').allInnerTexts()).map(t=>t.replace(/\s+/g,' '));
    await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'В область'})); await pg.waitForTimeout(300); const list=(await pg.locator('.amenu.bm .mi').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')); await tapEl(pg.locator('.amenu.bm .mi').first()); await pg.waitForTimeout(500);
    const inside=await area.locator('.abody .blk').filter({hasText:'Перший'}).count(), plaque=await pg.locator('#undo').isVisible(), msg=await pg.locator('#undo .umsg').innerText();
    const kid=area.locator('.abody .blk').filter({hasText:'Перший'}); await tapEl(kid.locator('.grip')); await pg.waitForTimeout(300); await tapEl(kid.locator('.bact')); await pg.waitForTimeout(250); const items2=(await pg.locator('.amenu.bm .mi').allInnerTexts()).map(t=>t.replace(/\s+/g,' '));
    await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'З області'})); await pg.waitForTimeout(500); const outAgain=(await blk('Перший').count())===1 && (await area.locator('.abody .blk').count())===0; const ab=await box(area), tb=await box(blk('Перший'));
    ok('4 меню блока: '+items.join(' | ')+' → області: '+list.join(' | ')+' → блок в області ('+inside+'), плашка «'+msg+'» ('+plaque+'); у блока в області: '+items2.join(' | ')+' → «З області»: знову на аркуші ('+outAgain+'), під областю ('+tb.y+' ≥ '+(ab.y+ab.h)+')', /В область/.test(items.join(' ')) && list.length===1 && /Папка/.test(list[0]) && inside===1 && plaque && /Папка/.test(msg) && /З області/.test(items2.join(' ')) && outAgain && tb && ab && tb.y>=ab.y+ab.h-4); }
  // 5 «Розмір»: «Вищий» додає два ряди мінімальної висоти, «Авто» повертає
  { await tapEl(pg.locator('#blockbar [data-mv="done"]')).catch(()=>{}); await pg.waitForTimeout(200); await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300); const h0=(await box(blk('Перший').locator('.txt'))).h;
    await tapEl(blk('Перший').locator('.bact')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Розмір'})); await pg.waitForTimeout(300); const sizes=(await pg.locator('.amenu.bm .mi').allInnerTexts()).map(t=>t.replace(/\s+/g,' ')); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Вищий'})); await pg.waitForTimeout(400); const h1=(await box(blk('Перший').locator('.txt'))).h;
    await tapEl(blk('Перший').locator('.bact')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Розмір'})); await pg.waitForTimeout(300); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Авто'})); await pg.waitForTimeout(400); const h2=(await box(blk('Перший').locator('.txt'))).h;
    const g=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g')));   // two grid rows: 48px at 16px text, 54px at a phone's 18px
    ok('5 «Розмір»: '+sizes.join(' | ')+'; «Вищий» '+h0+' → '+h1+' (two '+g+'px rows), «Авто» → '+h2, sizes.length===3 && h1===h0+2*g && h2===h0); await tapEl(pg.locator('#blockbar [data-mv="done"]')).catch(()=>{}); }
  await pg.screenshot({path:OUT+'/appcard-touch.png'});
  console.log(errs.length? errs.join('\n') : '✓ без помилок (телефон)'); if(errs.length) fails++; await ctx.close(); }
/* ── компʼютер: мишею за шапку одразу; клік по назві — правка; «⋯» коду прихований ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const topOf=loc=>loc.evaluate(e=>parseInt(e.style.top)||0);
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.mouse.move(500,260); await pg.mouse.down(); await pg.mouse.move(1000,420,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200); await pg.keyboard.type('Папка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const area=pg.locator('.blk.is-area').first(); const bar=await box(area.locator('.cbar')), tt=await box(area.locator('.ctitle')); const t0=await topOf(area);
  const ex=tt.x+tt.w+40;   // порожнє місце шапки праворуч від назви
  await pg.mouse.move(ex, bar.y+bar.h/2); await pg.mouse.down(); await pg.mouse.move(ex, bar.y+bar.h/2+150,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(400); const t1=await topOf(area);
  const b2=await box(area.locator('.ctitle')); await pg.mouse.click(b2.x+b2.w/2, b2.y+b2.h/2); await pg.waitForTimeout(200); const edit=await pg.evaluate(()=>document.activeElement.classList.contains('ctitle')); const t2=await topOf(area); await pg.keyboard.press('Escape');
  await pg.mouse.click(500,700); await pg.waitForTimeout(50); await pg.evaluate(js=>{ const dt=new DataTransfer(); dt.setData('text/plain',js); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }, JS); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const code=pg.locator('.blk.is-code').first(); const vis=await code.evaluate(e=>({more:getComputedStyle(e.querySelector('.cmore')).display, num:getComputedStyle(e.querySelector('.num')).display}));
  ok('6 компʼютер: мишею за порожнє місце шапки область перенесено ('+t0+' → '+t1+'); клік по назві — правка ('+edit+'), не перенос ('+t2+'); «⋯» коду '+vis.more+', номери '+vis.num, t1>=t0+120 && t1<=t0+168 && edit && t2===t1 && vis.more==='none' && vis.num!=='none');
  console.log(errs.length? errs.join('\n') : '✓ без помилок (компʼютер)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
