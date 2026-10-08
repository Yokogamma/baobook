import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
await pg.goto(SITE); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
const G=24, sheetLeft=(await box(pg.locator('#sheet'))).x;
const dotK=x=>(x-sheetLeft-G/2)/G;   // номер стовпчика точок для початку тексту (x у координатах вікна)
// область
await pg.mouse.move(500,400); await pg.mouse.down(); await pg.mouse.move(1000,560,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200); await pg.keyboard.press('Escape');
const area=pg.locator('.blk.is-area').first(); const card=await box(area.locator('.ablk')); const areaBlk=await box(area);
const areaK=dotK(areaBlk.x+22+8);   // стовпчик точок самої області (ліва рамка картки на 6px лівіше від нього)
// 1 мінімальний відступ зліва: клік біля лівої рамки → блок на першому стовпчику точок усередині
await pg.mouse.click(card.x+4, card.y+70); await pg.keyboard.type('край'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const t=await box(area.locator('.abody .txt').first()); const k=dotK(t.x+6);
  ok('1 блок біля лівої рамки стоїть на першому стовпчику точок усередині: '+(t.x+6-card.x)+'px від рамки, стовпчик '+k+' (область '+areaK+')', Number.isInteger(k) && k===areaK+1 && t.x+6-card.x===30); }
// 2 занос згори: область не тікає, блок заходить усередину, щойно торкається її
await pg.mouse.click(600,200); await pg.keyboard.type('зверху'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const blk=pg.locator('#sheet > .blk').filter({hasText:'зверху'}); const g=await box(blk.locator('.grip')); const a0=await box(area.locator('.ablk'));
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); let moved=false, enteredAt=null; const yStart=g.y+12, yEnd=a0.y+90;
  for(let y=yStart; y<=yEnd; y+=6){ await pg.mouse.move(g.x+10,y); const a=await box(area.locator('.ablk')); if(a.y!==a0.y) moved=true;
    if(enteredAt===null && await pg.evaluate(()=>!!document.querySelector('.gbox') && !!document.querySelector('.gbox').closest('.abody'))) enteredAt=y; }
  const gInside=await pg.evaluate(()=>!!document.querySelector('.gbox').closest('.abody')); await pg.mouse.up(); await pg.waitForTimeout(300);
  ok('2a поки блок везуть згори, область стоїть на місці (не «тікає»)', !moved);
  ok('2b контур зайшов усередину, щойно торкнувся області (курсор ще над її верхньою рамкою: '+enteredAt+' < '+a0.y+')', enteredAt!==null && enteredAt<=a0.y+2 && gInside);
  ok('2c після відпускання блок — дочірній, область там само', (await area.locator('.abody .blk').filter({hasText:'зверху'}).count())===1 && (await box(area.locator('.ablk'))).y===a0.y); }
// 3 занос збоку з малим зазором: область не тікає, блок стає в колонку 0
await pg.mouse.click(330,700); await pg.keyboard.type('зліва'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const blk=pg.locator('#sheet > .blk').filter({hasText:'зліва'}); const g=await box(blk.locator('.grip')); const a0=await box(area.locator('.ablk'));
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(a0.x-60, a0.y+130,{steps:12}); await pg.waitForTimeout(60);
  const a1=await box(area.locator('.ablk')); const inside=await pg.evaluate(()=>!!document.querySelector('.gbox').closest('.abody')); await pg.mouse.up(); await pg.waitForTimeout(300);
  const t=await box(area.locator('.abody .blk').filter({hasText:'зліва'}).locator('.txt'));
  ok('3 блок, піднесений зліва впритул: область на місці ('+a0.y+'='+a1.y+'), контур усередині, після дропу блок у колонці 0', a1.y===a0.y && inside && dotK(t.x+6)===areaK+1); }
// 4 сама область і далі виштовхує блоки, коли її тягнуть (блок, що починається не правіше за колонку області)
await pg.mouse.click(380,780); await pg.keyboard.type('під областю'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const under=pg.locator('#sheet > .blk').filter({hasText:'під областю'}); const u0=await box(under.locator('.txt')); const g=await box(area.locator('.grip').first());
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10, u0.y-40,{steps:10}); await pg.mouse.up(); await pg.waitForTimeout(300);
  const u1=await box(under.locator('.txt')); const a=await box(area.locator('.ablk'));
  ok('4 перетягнута область виштовхнула блок під собою вниз ('+u0.y+'→'+u1.y+')', u1.y>u0.y && u1.y>=a.y+a.h); }
// 5 текстові блоки поруч: сусіда можна поставити на відстані однієї клітинки від картки блока із заданою шириною
await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
await pg.mouse.click(400,300); await pg.keyboard.type('komax-backups'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const L=pg.locator('#sheet > .blk').filter({hasText:'komax-backups'}); let tries=0, c=null; for(;tries<3;tries++){ const r=await box(L.locator('.rz')); await pg.mouse.move(r.x+9,r.y+9); await pg.waitForTimeout(120); await pg.mouse.down(); await pg.mouse.move(r.x+9+30,r.y+9,{steps:4}); await pg.mouse.up(); await pg.waitForTimeout(350);
    c=await box(L.locator('.tcard')); if(Number.isInteger(c.w/G) && await L.locator('.tcard').evaluate(e=>e.classList.contains('sized'))) break; }   // зрідка перший захват ручки не спрацьовує (ширина лишається авто) — повторюємо, кількість спроб у підписі
  const cwCells=c.w/G;
  await pg.mouse.click(400,600); await pg.keyboard.type('сусід'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  const R=pg.locator('#sheet > .blk').filter({hasText:'сусід'}); const g=await box(R.locator('.grip')); const t0=await box(R.locator('.txt'));
  // цільова позиція тексту сусіда: права рамка картки + 30px (ручка + зазор + відступ) = наступний стовпчик точок
  const targetX=c.x+c.w+30; await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10+(targetX-(t0.x+6)), c.y+12,{steps:10}); await pg.waitForTimeout(80);
  const bad=await pg.evaluate(()=>document.querySelector('.gbox').classList.contains('bad')); await pg.mouse.up(); await pg.waitForTimeout(300);
  const t1=await box(R.locator('.txt')), c1=await box(L.locator('.tcard'));
  ok('5a сусід став на тому ж рядку через одну клітинку від картки (текст за '+(t1.x+6-(c1.x+c1.w))+'px від правої рамки), ширина картки не змінилась ('+c.w+'→'+c1.w+', спроб ресайзу: '+(tries+1)+'), контур не був червоним', !bad && t1.y===c1.y && t1.x+6-(c1.x+c1.w)===30 && c1.w===c.w && Number.isInteger(cwCells));
  // ще ближче — уже накладання: блок зліва йде вниз (правило виштовхування), а не звужується
  const g2=await box(R.locator('.grip')); await pg.mouse.move(g2.x+10,g2.y+12); await pg.mouse.down(); await pg.mouse.move(g2.x+10-G, g2.y+12,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(300);
  const t2=await box(R.locator('.txt')), c2=await box(L.locator('.tcard'));
  ok('5b на клітинку ближче — блок із заданою шириною виштовхнуто вниз, ширина та сама', c2.y>c1.y && c2.w===c.w && t2.y===c1.y); }
// 6 два звичайні блоки: мінімальна відстань — 6 клітинок (мінімальна ширина 140px), а не 7
await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
await pg.mouse.click(400,300); await pg.keyboard.type('перший'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
await pg.mouse.click(400,600); await pg.keyboard.type('другий'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const A=pg.locator('#sheet > .blk').filter({hasText:'перший'}), B=pg.locator('#sheet > .blk').filter({hasText:'другий'}); const ta=await box(A.locator('.txt')); const g=await box(B.locator('.grip')); const tb=await box(B.locator('.txt'));
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10+(ta.x+6+6*G-(tb.x+6)), ta.y+12,{steps:10}); await pg.waitForTimeout(80); const bad=await pg.evaluate(()=>document.querySelector('.gbox').classList.contains('bad')); await pg.mouse.up(); await pg.waitForTimeout(300);
  const tb2=await box(B.locator('.txt')), ta2=await box(A.locator('.txt'));
  ok('6 другий блок стає за 6 клітинок від початку першого на тому ж рядку (контур не червоний, перший лишився на місці)', !bad && tb2.y===ta.y && ta2.y===ta.y && (tb2.x-ta2.x)===6*G); }
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
