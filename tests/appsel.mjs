import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const dragTo=async(x,y,tx,ty)=>{ await touch('touchStart',[{x,y}]); for(let i=1;i<=10;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x:x+(tx-x)*i/10,y:y+(ty-y)*i/10}]); } await pg.waitForTimeout(120); await touch('touchMove',[{x:tx,y:ty}]); await pg.waitForTimeout(150); await touch('touchEnd',[]); };   // контур відстає на крок: останній рух окремо, з паузою
const focusedTxt=()=>pg.evaluate(()=>!!document.activeElement && document.activeElement.classList.contains('txt'));
const blk=t=>pg.locator('#sheet > .blk').filter({hasText:t});
const model=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); const all=t.result.flatMap(n=>n.blocks); res(Object.fromEntries(all.map(b=>[b.text,{row:b.row,fx:+(b.fx||0).toFixed(3),parent:b.parent||null}]))); }; }; }));
const near=(a,b,d=3)=>Math.abs(a-b)<=d;
await pg.goto(new URL('../index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
// 1 утримання створює блок саме там, де палець — і по горизонталі, і по вертикалі
await hold(200,300); await pg.waitForTimeout(250); await pg.keyboard.type('Правий'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
await hold(60,500); await pg.waitForTimeout(250); await pg.keyboard.type('Лівий внизу'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
{ const a=await box(blk('Правий').locator('.txt')), b=await box(blk('Лівий внизу').locator('.txt')); const m=await model();
  ok('1 блоки стоять там, де утримували: «Правий» '+a.x+','+a.y+' (ряд '+m['Правий'].row+', fx '+m['Правий'].fx+'), «Лівий внизу» '+b.x+','+b.y+' (ряд '+m['Лівий внизу'].row+')', near(a.x,198) && near(a.y,300) && near(b.x,54) && near(b.y,492) && m['Правий'].row===12 && m['Лівий внизу'].row===20 && m['Правий'].fx>0.45 && m['Лівий внизу'].fx<0.2); }
// 2 утримання на тексті блока — режим положення без клавіатури й без системного виділення
{ const b=await box(blk('Лівий внизу').locator('.txt')); await hold(b.x+b.w/2, b.y+b.h/2); await pg.waitForTimeout(250);
  ok('2 утримання на тексті: рамка, панель стрілок, курсора й виділення немає, «+» схований', await blk('Лівий внизу').evaluate(e=>e.classList.contains('sel')) && await pg.locator('#blockbar').isVisible() && !(await focusedTxt()) && (await pg.evaluate(()=>getSelection().toString()))==='' && !(await pg.locator('#fab').isVisible())); }
// 3 → до правого краю
await tapEl(pg.locator('#blockbar [data-mv="right"]')); await pg.waitForTimeout(400);
{ const c=await box(blk('Лівий внизу').locator('.tcard')); const m=await model();
  ok('3 «→»: правий край картки біля правого поля ('+(c.x+c.w)+' з 374), ряд той самий, fx '+m['Лівий внизу'].fx, c.x+c.w<=374 && c.x+c.w>=374-24 && near(c.y,492) && m['Лівий внизу'].fx>0.5 && m['Лівий внизу'].row===20); }
// 4 ↑ впритул під блок вище, з яким є конфлікт по горизонталі
await tapEl(pg.locator('#blockbar [data-mv="up"]')); await pg.waitForTimeout(400);
{ const t=await box(blk('Лівий внизу').locator('.txt')), a=await box(blk('Правий').locator('.txt')); const m=await model();
  ok('4 «↑»: блок став одразу під «Правий» ('+t.y+' = '+(a.y+a.h)+'), ряд '+m['Лівий внизу'].row, near(t.y, a.y+a.h, 4) && m['Лівий внизу'].row===13); }
// 5 ← до лівого поля
await tapEl(pg.locator('#blockbar [data-mv="left"]')); await pg.waitForTimeout(400);
{ const t=await box(blk('Лівий внизу').locator('.txt')); const m=await model(); ok('5 «←»: текст від лівого поля ('+t.x+'), ряд той самий', near(t.x,30) && m['Лівий внизу'].row===13 && m['Лівий внизу'].fx<0.15); }
// 6 ↓ без сусіда нижче нічого не робить; з сусідом — впритул над ним
await tapEl(pg.locator('#blockbar [data-mv="down"]')); await pg.waitForTimeout(300);
{ const t=await box(blk('Лівий внизу').locator('.txt')); ok('6a «↓» без блока нижче лишає на місці ('+t.y+')', near(t.y,324)); }
await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300);
await hold(60,700); await pg.waitForTimeout(250); await pg.keyboard.type('Третій'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
{ const b=await box(blk('Лівий внизу').locator('.txt')); await hold(b.x+b.w/2, b.y+b.h/2); await pg.waitForTimeout(250); await tapEl(pg.locator('#blockbar [data-mv="down"]')); await pg.waitForTimeout(400);
  const t=await box(blk('Лівий внизу').locator('.txt')), c=await box(blk('Третій').locator('.txt')); const m=await model();
  ok('6b «↓»: блок впритул над «Третій» ('+(t.y+t.h)+' = '+c.y+'), ряд '+m['Лівий внизу'].row, near(t.y+t.h, c.y, 4) && m['Лівий внизу'].row===m['Третій'].row-1); }
// 6c «↓» без сусіда по горизонталі — під найнижчий блок
{ const g=await box(blk('Правий').locator('.grip')); await tap(g.x+g.w/2, g.y+g.h/2); await pg.waitForTimeout(300); await tapEl(pg.locator('#blockbar [data-mv="down"]')); await pg.waitForTimeout(400);
  const t=await box(blk('Правий').locator('.txt')), c=await box(blk('Третій').locator('.txt')); const m=await model();
  ok('6c «↓» без сусіда: «Правий» під найнижчим «Третій» ('+t.y+' = '+(c.y+c.h)+'), ряд '+m['Правий'].row, near(t.y, c.y+c.h, 4) && m['Правий'].row===m['Третій'].row+1); }
// 7 «Готово» знімає режим; дотик по тексту ставить курсор, як і раніше
await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(400);
ok('7a «Готово»: рамки й панелі немає, «+» повернувся', (await pg.locator('.blk.sel').count())===0 && !(await pg.locator('#blockbar').isVisible()) && await pg.locator('#fab').isVisible());
{ const a=await box(blk('Правий').locator('.txt')); await tap(a.x+a.w/2, a.y+a.h/2); await pg.waitForTimeout(300);
  ok('7b короткий дотик по тексту ставить курсор без режиму положення', await focusedTxt() && (await pg.locator('.blk.sel').count())===0); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); }
// 7c текст неактивного блока для системи невиділюваний (довге натискання — наш жест), з курсором — виділюваний; дотик по ручці — теж режим положення
{ const us=await blk('Правий').locator('.txt').evaluate(e=>getComputedStyle(e).userSelect); const a=await box(blk('Правий').locator('.txt')); await tap(a.x+a.w/2, a.y+a.h/2); await pg.waitForTimeout(250); const usF=await blk('Правий').locator('.txt').evaluate(e=>getComputedStyle(e).userSelect);
  const caretIn=await pg.evaluate(()=>{ const s=getSelection(); const n=s.anchorNode; return !!(n && (n.nodeType===1? n : n.parentElement).closest('.txt')); });
  ok('7c без курсора user-select='+us+', з курсором '+usF+', курсор поставлено в блок', us==='none' && usF==='text' && caretIn); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const g=await box(blk('Правий').locator('.grip')); await tap(g.x+g.w/2, g.y+g.h/2); await pg.waitForTimeout(300);
  ok('7d дотик по ручці ⋮⋮ вмикає режим положення, нічого не копіює', await blk('Правий').evaluate(e=>e.classList.contains('sel')) && await pg.locator('#blockbar').isVisible() && !/Скопійовано/.test(await pg.locator('#toast').innerText()));
  await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300); }
// 7e короткий блок «→»: сторінка не стає ширшою за екран; 7f дотик по аркушу знімає системне виділення слова
{ await hold(60,420); await pg.waitForTimeout(250); await pg.keyboard.type('Ок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  const g=await box(blk('Ок').locator('.grip')); await tap(g.x+g.w/2, g.y+g.h/2); await pg.waitForTimeout(300); await tapEl(pg.locator('#blockbar [data-mv="right"]')); await pg.waitForTimeout(400);
  const bb=await box(blk('Ок')); const sw=await pg.evaluate(()=>document.documentElement.scrollWidth), sheetW=await pg.locator('#sheet').evaluate(e=>e.clientWidth);
  ok('7e короткий блок «→»: правий край блока '+(bb.x+bb.w)+' ≤ '+sheetW+', сторінка не ширша за екран ('+sw+')', bb.x+bb.w<=sheetW && sw<=390); await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300); }
{ const a=await box(blk('Правий').locator('.txt')); await tap(a.x+a.w/2, a.y+a.h/2); await pg.waitForTimeout(300); await pg.keyboard.press('Shift+Home'); await pg.waitForTimeout(200); const selBefore=await pg.evaluate(()=>getSelection().toString());
  await tap(300,600); await pg.waitForTimeout(400);
  ok('7f виділили слово («'+selBefore+'»), дотик по порожньому місцю: виділення знято, панелі немає, курсора немає', selBefore.length>0 && (await pg.evaluate(()=>getSelection().toString()))==='' && !(await pg.locator('#bubble').isVisible()) && !(await focusedTxt())); }
// 7g у режимі положення видно ручку розміру, нею можна тягнути (ширина кратна клітинці), поза режимом ручки немає
{ const rzIdle=await blk('Правий').locator('.rz').evaluate(e=>({op:getComputedStyle(e).opacity, pe:getComputedStyle(e).pointerEvents}));
  const g=await box(blk('Правий').locator('.grip')); await tap(g.x+g.w/2, g.y+g.h/2); await pg.waitForTimeout(300);
  const rz=await blk('Правий').locator('.rz').evaluate(e=>{ const r=e.getBoundingClientRect(); return {op:getComputedStyle(e).opacity, pe:getComputedStyle(e).pointerEvents, x:r.left, y:r.top, w:r.width, h:r.height}; });
  const w0=(await box(blk('Правий').locator('.tcard'))).w; await dragTo(rz.x+rz.w/2, rz.y+rz.h/2, rz.x+rz.w/2+40, rz.y+rz.h/2+30); await pg.waitForTimeout(500);   // ширина не менша за мінімальну (140px), тож тягнемо вправо
  const c=await box(blk('Правий').locator('.tcard')); const m=await model(); const stillSel=await blk('Правий').evaluate(e=>e.classList.contains('sel'));
  ok('7g без режиму ручки немає (opacity '+rzIdle.op+'), у режимі є ('+rz.w+'×'+rz.h+', pointer-events '+rz.pe+'); потягнули — ширина '+w0+'→'+c.w+' (кратна 24), режим лишився', rzIdle.op==='0' && rzIdle.pe==='none' && rz.op==='1' && rz.pe==='auto' && rz.w>=28 && c.w>w0 && c.w%24===0 && m['Правий'] && stillSel);
  await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300); }
// 8 дотик по аркушу в режимі положення лише знімає його, блок не створюється
{ const b=await box(blk('Третій').locator('.txt')); await hold(b.x+b.w/2, b.y+b.h/2); await pg.waitForTimeout(250); const n=await pg.locator('#sheet > .blk').count(); await tap(300,600); await pg.waitForTimeout(300);
  ok('8 дотик по аркушу знімає режим, блоків стільки ж ('+n+')', (await pg.locator('.blk.sel').count())===0 && (await pg.locator('#sheet > .blk').count())===n); }
// 9 перенос за ручку лишається вільним
{ const g=await box(blk('Третій').locator('.grip')); await dragTo(g.x+g.w/2, g.y+g.h/2, 250, 420); await pg.waitForTimeout(500); const m=await model(); const t=await box(blk('Третій').locator('.txt'));
  ok('9 перенос за ручку: «Третій» став туди, куди принесли (ряд '+m['Третій'].row+', fx '+m['Третій'].fx+', x '+t.x+')', m['Третій'].row>=15 && m['Третій'].row<=18 && m['Третій'].fx>0.45 && t.x>200); }
// 10 після перезавантаження позиції ті самі
await pg.reload(); await pg.waitForTimeout(500);
{ const a=await box(blk('Правий').locator('.txt')), b=await box(blk('Лівий внизу').locator('.txt'));
  ok('10 після перезавантаження: «Правий» '+a.x+','+a.y+', «Лівий внизу» '+b.x+','+b.y, near(a.x,198) && near(a.y,708) && near(b.x,30) && near(b.y,660)); }
await pg.screenshot({path:OUT+'/appsel-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
