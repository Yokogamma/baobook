// Dragging a block onto a neighbour in the same column: the neighbour gives way only after the leading edge of the dragged block
// passes its middle (the top edge from below, the bottom edge from above); until then the ghost lands next to it.
// Also the regression where an area narrowed for a frame while a block was carried in, and its blocks jumped down too early.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
// reduced motion: neighbours slide (appslide.mjs checks that), here positions are read right after each move
const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}, reducedMotion:'reduce'}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
// the ghost slides to its place (transition on top), so read where it is going, not where it is in this frame
const ghost=()=>pg.evaluate(()=>{ const g=document.querySelector('.gbox.on'); if(!g) return null; const p=g.offsetParent, y=p.getBoundingClientRect().top+p.clientTop+parseFloat(g.style.top); return {y:Math.round(y), b:Math.round(y+g.offsetHeight), bad:g.classList.contains('bad'), inArea:!!g.closest('.abody')}; });
const dragTop=()=>pg.evaluate(()=>{ const d=document.querySelector('.blk.drag'); return d? Math.round(d.getBoundingClientRect().top) : null; });
const wipe=async()=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300); };
// pointermove reaches the page with the next frame: wait for it before reading positions
const mv=async(x,y,o)=>{ await pg.mouse.move(x,y,o); await pg.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); };
const G=24, EDGE=14;   // frames within half a row of the middle are skipped: the edge snaps to the grid there
await pg.goto(SITE); await pg.waitForTimeout(300); await wipe();

// 1–3 the owner's note: an area with one tall block of fixed width, a long block below the area is carried up into it
const T="New 9.x feature that size the items to fit their content height as to not have scroll bars\ncase C: `sizeToContent:false` to turn off.\ncase E: has soft maxsize `sizeToContent:3`, shrinking to smaller content as needed\nDefaulting to different initial size (see code) to show grow/shrink behavior";
await pg.evaluate(async T=>{ const n={id:'nswap',title:'',blocks:[{id:'barea',row:5,text:'',fx:0.09,kind:'area',cw:29,ch:23},{id:'bkid',row:1,text:T,parent:'barea',col:1,cw:10},{id:'bbelow',row:30,text:T,fx:0.107}],created:1,updated:Date.now()};
  const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
  await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
  const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='nswap'; localStorage.setItem('sheet:settings', JSON.stringify(s)); }, T);
await pg.reload(); await pg.waitForTimeout(500);
{ const area=pg.locator('.blk.is-area'), kid=area.locator('.abody .blk').first(); const k0=await box(kid), a0=await box(area.locator('.ablk')); const mid=k0.y+k0.h/2;
  const g=await box(pg.locator('#sheet > .blk:not(.is-area) .grip').last()); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  await mv(gx,gy); await pg.mouse.down();
  let before={frames:0, kidStill:true, ghostUnder:true, areaW:true}, after={frames:0, kidUnder:true, red:false, bad:''}, entered=false;
  for(let y=gy; y>=gy-480; y-=6){ await mv(gx,y); const top=await dragTop(), gh=await ghost(); if(!gh || !gh.inArea) continue; entered=true;
    const k=await box(kid), aw=(await box(area.locator('.ablk'))).w;
    if(top>mid+EDGE){ before.frames++; if(k.y!==k0.y) before.kidStill=false; if(gh.y<k0.y+k0.h) before.ghostUnder=false; if(aw!==a0.w) before.areaW=false; }
    else if(top<mid-EDGE){ after.frames++; if(k.y<gh.b){ after.kidUnder=false; after.bad+=` top ${top} kid ${k.y} ghost ${gh.y}-${gh.b}`; } if(gh.bad) after.red=true; } }
  ok('1 контур зайшов в область, кадрів до середини блока: '+before.frames+', після: '+after.frames, entered && before.frames>5 && after.frames>3);
  ok('1a поки верхній край не дійшов до середини блока області, той стоїть на місці, а ширина області не змінюється', before.kidStill && before.areaW);
  ok('1b до середини контур лягає під блок області', before.ghostUnder);
  ok('2 після середини блок області йде під контур, контур не червоний'+(after.bad? ':'+after.bad.slice(0,200) : '')+(after.red?' (червоний)':''), after.kidUnder && !after.red);
  // 3 back down below the middle: the block returns to its place
  let back={frames:0, home:true};
  for(let y=gy-480; y<=gy-200; y+=6){ await mv(gx,y); const top=await dragTop(); if(top>mid+EDGE){ back.frames++; const k=await box(kid); if(k.y!==k0.y) back.home=false; } }
  ok('3 повернув край нижче середини — блок області знову на своєму місці ('+back.frames+' кадрів)', back.frames>3 && back.home);
  // 3b the same after a sideways detour out of the block's column and back: it still remembers the block was approached from below
  for(let y=gy-200; y>=gy-470; y-=6) await mv(gx,y);
  for(let x=gx; x<=gx+360; x+=8) await mv(x,gy-470);
  const out=await box(kid); for(let x=gx+360; x>=gx; x-=8) await mv(x,gy-470);
  let back2={frames:0, home:true, at:''};
  for(let y=gy-470; y<=gy-200; y+=6){ await mv(gx,y); const top=await dragTop(); if(top>mid+EDGE){ back2.frames++; const k=await box(kid); if(k.y!==k0.y){ back2.home=false; back2.at=` (блок на ${k.y}, а був на ${k0.y})`; } } }
  ok('3b після відходу вбік за межі колонки ('+out.y+') і назад: нижче середини блок області знову на своєму місці'+back2.at, back2.frames>3 && back2.home);
  // drop past the middle: the block of the area is below the dropped one
  for(let y=gy-200; y>=gy-470; y-=6) await mv(gx,y);
  const gh=await ghost(); await pg.mouse.up(); await pg.waitForTimeout(300);
  const r=await area.locator('.abody .blk').evaluateAll(els=>els.map(e=>{ const q=e.getBoundingClientRect(); return {sized:!!e.querySelector('.sized'), y:Math.round(q.top), b:Math.round(q.bottom)}; }));
  const was=r.find(o=>o.sized), came=r.find(o=>!o.sized);
  ok('3a відпустив після середини: обидва блоки в області, той, що був там, — під перенесеним ('+JSON.stringify(r)+')', r.length===2 && was && came && gh && !gh.bad && was.y>=came.b); }

// 4–5 on the sheet, from above: a one-line block dragged down onto a four-line block
await wipe();
await pg.mouse.click(500,420); for(const [i,t] of ['перший рядок','другий рядок','третій рядок','четвертий рядок'].entries()){ if(i) await pg.keyboard.press('Enter'); await pg.keyboard.type(t); } await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
await pg.mouse.click(500,200); await pg.keyboard.type('зверху'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
{ const B=pg.locator('#sheet > .blk').filter({hasText:'четвертий'}), A=pg.locator('#sheet > .blk').filter({hasText:'зверху'}); const b0=await box(B), a0=await box(A); const mid=b0.y+b0.h/2;
  ok('4 підготовка: нижній блок — 4 рядки, верхній — 1', b0.h===4*G && a0.h===G);
  const g=await box(A.locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2; await mv(gx,gy); await pg.mouse.down();
  let early={frames:0, pushed:true}, late={frames:0, home:true, ghostUnder:true, why:''};
  for(let y=gy; y<=gy+(b0.y+b0.h-a0.y)+G; y+=4){ await mv(gx,y); const top=await dragTop(), bottom=top+a0.h, gh=await ghost(); const b=await box(B);
    if(bottom>b0.y+EDGE && bottom<mid-EDGE){ early.frames++; if(b.y<gh.b) early.pushed=false; }
    else if(bottom>mid+EDGE && top<b0.y+b0.h){ late.frames++; if(b.y!==b0.y) late.home=false; if(gh.y<b0.y+b0.h) late.ghostUnder=false; if(b.y!==b0.y||gh.y<b0.y+b0.h) late.why+=` [bottom ${bottom} B ${b.y} ghost ${gh.y}]`; } }
  ok('4a поки нижній край не дійшов до середини, нижній блок звільняє місце — йде під контур ('+early.frames+' кадрів)', early.frames>2 && early.pushed);
  ok('4b після середини нижній блок повертається на місце, а контур лягає під нього ('+late.frames+' кадрів, B '+b0.y+'-'+(b0.y+b0.h)+')'+late.why.slice(0,300), late.frames>2 && late.home && late.ghostUnder);
  await pg.mouse.up(); await pg.waitForTimeout(300);
  const a1=await box(A), b1=await box(B);
  ok('5 відпустив: нижній блок на місці, перенесений — під ним', b1.y===b0.y && a1.y>=b1.y+b1.h); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
