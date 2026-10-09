// Changing your mind mid-drag: Esc, the right button, a drop over the panel or the top bar, and leaving the tab all put the whole
// layout back (a neighbour that had been pushed down too), slide the block home and save nothing. The mouse sees an "Esc to cancel"
// hint at the home outline. A finished drag goes into Ctrl+Z quietly (no toast), and Ctrl+Z restores the neighbours as well.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const G=24;
const stored=()=>pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>{ const t=q.result.transaction('notes').objectStore('notes').get('ncancel'); t.onsuccess=()=>{ q.result.close(); r(JSON.stringify(t.result)); }; }; }));
// sorted: a dropped block is re-appended, so DOM order may change; an area is labelled by kind, its text includes its blocks
const layout=()=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk')].map(e=>{ const r=e.getBoundingClientRect(); return [(e.classList.contains('is-area')? 'area' : e.textContent.trim().slice(0,6)).replace(/\s/g,' '), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(' '); }).sort().join(' | '));
const BLOCKS=[{id:'ba',row:6,text:'блок A',fx:0.2137},{id:'bb',row:9,text:'блок B\nдругий рядок\nтретій рядок',fx:0.2},{id:'barea',row:20,text:'',fx:0.5,kind:'area',cw:20,ch:6}];
const seed=async()=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
  await pg.evaluate(async blocks=>{ const n={id:'ncancel',title:'',blocks,created:1,updated:1};
    const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='ncancel'; localStorage.setItem('sheet:settings', JSON.stringify(s)); sessionStorage.clear(); }, BLOCKS);
  await pg.reload(); await pg.waitForTimeout(500); };
const A=pg.locator('#sheet > .blk').filter({hasText:'блок A'});
// grab A and carry it down onto B, so that B is pushed down
const lift=async()=>{ const g=await box(A.locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2; await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx+G,gy+3*G+6,{steps:10}); await pg.waitForTimeout(100); return {gx,gy}; };
await pg.goto(SITE); await pg.waitForTimeout(300); await seed();
const lay0=await layout(), s0=await stored();

// 1 Esc: back home, sliding, nothing saved; the hint is shown for the mouse
{ await lift(); const moving=await layout();
  const hint=await pg.evaluate(()=>{ const l=document.querySelector('.hbox.on.kb .lbl'); return l && getComputedStyle(l).display!=='none'? l.textContent : null; });
  await pg.keyboard.press('Escape'); const sliding=await A.evaluate(e=>getComputedStyle(e).transform);
  await pg.mouse.move(700,600,{steps:4}); await pg.mouse.up(); await pg.waitForTimeout(800);
  const done=await A.evaluate(e=>getComputedStyle(e).transform);
  ok('1 підказка біля контуру дому для миші: «'+hint+'»', hint==='Esc — скасувати');
  ok('1a Esc під час переносу: блок B, якого було зсунуто, і блок A — на своїх місцях, нічого не збережено', moving!==lay0 && await layout()===lay0 && await stored()===s0);
  ok('1b блок A їде додому (transform одразу після Esc: '+sliding+', потім '+done+'), а відпускання миші після Esc нічого не робить', sliding!=='none' && done==='none'); }

// 2 the right button mid-drag cancels, and its release opens no context menu
{ await pg.evaluate(()=>{ window.__menu=0; document.addEventListener('contextmenu',e=>{ if(!e.defaultPrevented) window.__menu++; }); });
  await lift(); await pg.mouse.down({button:'right'}); await pg.waitForTimeout(50); await pg.mouse.up({button:'right'}); await pg.mouse.up(); await pg.waitForTimeout(800);
  ok('2 права кнопка під час переносу: розкладка та сама, нічого не збережено, контекстного меню немає', await layout()===lay0 && await stored()===s0 && await pg.evaluate(()=>window.__menu)===0); }

// 3 a drop over the side panel and 4 over the top bar go home
{ const sx=(await box(pg.locator('#sheet'))).x; ok('3 підготовка: бічна панель відкрита (аркуш починається з '+sx+'px)', sx>100);
  await lift(); await pg.mouse.move(sx-60,300,{steps:10}); await pg.waitForTimeout(100); const hit=await pg.evaluate(()=>document.querySelector('.hbox').classList.contains('hit'));
  await pg.mouse.up(); await pg.waitForTimeout(800);
  ok('3a над бічною панеллю контур дому підсвічений; відпустив — усе на місці, нічого не збережено', hit && await layout()===lay0 && await stored()===s0);
  await lift(); await pg.mouse.move(800,20,{steps:10}); await pg.waitForTimeout(100); await pg.mouse.up(); await pg.waitForTimeout(800);
  ok('4 відпустив над верхньою панеллю: усе на місці, нічого не збережено', await layout()===lay0 && await stored()===s0); }

// 5 leaving the tab mid-drag cancels
{ await lift();
  await pg.evaluate(()=>{ Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  await pg.waitForTimeout(400); const after=await layout();   // the block slides home first await pg.mouse.up(); await pg.waitForTimeout(800);
  ok('5 вкладку сховали під час переносу: перенос скасовано одразу, нічого не збережено', after===lay0 && await layout()===lay0 && await stored()===s0); }

// 6 a finished drag goes into Ctrl+Z quietly, and Ctrl+Z brings back the neighbour it pushed down
{ await lift(); await pg.mouse.up(); await pg.waitForTimeout(800);
  const moved=await layout(), s1=await stored(), toast=await pg.locator('#undo').isVisible();
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(800);
  ok('6 перенос збережено без плашки «Скасувати»', moved!==lay0 && s1!==s0 && !toast);
  ok('6a Ctrl+Z: обидва блоки, і зсунутий B теж, на своїх місцях', await layout()===lay0); }

// 7 Ctrl+Z after carrying a block into an area takes it out again
{ const ar=await box(pg.locator('.blk.is-area .ablk')); const g=await box(A.locator('.grip'));
  await pg.mouse.move(g.x+g.w/2,g.y+g.h/2); await pg.mouse.down(); await pg.mouse.move(ar.x+60,ar.y+70,{steps:16}); await pg.waitForTimeout(100); await pg.mouse.up(); await pg.waitForTimeout(800);
  const inArea=await pg.locator('.abody .blk').filter({hasText:'блок A'}).count();
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(800);
  ok('7 блок занесли в область, Ctrl+Z — він знову на аркуші, розкладка як на початку', inArea===1 && await pg.locator('.abody .blk').count()===0 && await layout()===lay0); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
