// Widening an area with its corner handle pushes everything to its right on the same rows along (in a chain) instead of stopping
// at the neighbour; it stops where the pushed blocks have no room left on the sheet. Esc during the resize puts everything back and
// saves nothing; a finished resize is saved (fx of moved blocks too) and Ctrl+Z restores the layout.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
// reduced motion: pushed neighbours slide (appslide.mjs checks that), here positions are read right after each move
const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}, reducedMotion:'reduce'}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const G=24;
const frame=()=>pg.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));   // pointermove reaches the page with the next frame
const mv=async(x,y,o)=>{ await pg.mouse.move(x,y,o); await frame(); };
const stored=()=>pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>{ const t=q.result.transaction('notes').objectStore('notes').get('nrz'); t.onsuccess=()=>{ q.result.close(); r(JSON.stringify(t.result)); }; }; }));
// every block on the sheet, keyed by its id in the note: left and right edges of the block, top
const geo=()=>pg.evaluate(()=>{ const o={}; for(const e of document.querySelectorAll('#sheet > .blk')){ const r=e.getBoundingClientRect(), c=(e.querySelector('.ablk,.tcard')||e).getBoundingClientRect(); o[e.dataset.k]={l:Math.round(r.left), r:Math.round(r.right), cardR:Math.round(c.right), t:Math.round(r.top)}; } return o; });
const tag=()=>pg.evaluate(()=>{ for(const e of document.querySelectorAll('#sheet > .blk')){ const t=e.textContent; e.dataset.k= /ліва/.test(e.querySelector('.cbar')?.textContent||'')? 'L' : /права/.test(e.querySelector('.cbar')?.textContent||'')? 'R' : t.includes('праворуч')? 'T' : t.includes('нижче')? 'U' : '?'; } });
const seed=async()=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
  await pg.evaluate(async()=>{ const n={id:'nrz',title:'',created:1,updated:1,blocks:[
      {id:'aL',row:4,text:'',fx:0.05,kind:'area',title:'ліва',cw:12,ch:6},{id:'aR',row:4,text:'',fx:0.4,kind:'area',title:'права',cw:12,ch:6},
      {id:'tT',row:5,text:'текст праворуч',fx:0.75},{id:'tU',row:14,text:'блок нижче',fx:0.3}]};
    const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='nrz'; localStorage.setItem('sheet:settings', JSON.stringify(s)); });
  await pg.reload(); await pg.waitForTimeout(500); await tag(); };
// grab the left area's corner handle; returns where it was
const grab=async()=>{ const card=pg.locator('#sheet > .blk.is-area').filter({has:pg.locator('.cbar',{hasText:'ліва'})}).locator('.ablk').first(); await card.hover(); const rz=await card.locator('.rz').last().boundingBox();
  const x=rz.x+rz.width/2, y=rz.y+rz.height/2; await mv(x,y); await pg.mouse.down(); return {x,y}; };
await pg.goto(SITE); await pg.waitForTimeout(300); await seed();
const g0=await geo(), s0=await stored(); const gap=g0.R.l-g0.L.r;   // cells between the left area's card and the right area's handle

// 1 widen past the neighbour: it and the text to its right move along, the block on other rows stays
{ const h=await grab(); await mv(h.x+gap+3*G, h.y, {steps:12}); const g=await geo();
  ok('1 ліва область ширшає далі за сусідку: права область зсунулась ('+g0.R.l+' → '+g.R.l+'), картка лівої закінчується там, де починається права ('+g.L.r+' = '+g.R.l+')', g.R.l>g0.R.l && g.L.r===g.R.l && g.L.r>g0.L.r);
  ok('1a текст праворуч права область ще не дістала — він на місці ('+g.T.l+'), блок нижче теж', g.T.l===g0.T.l && g.T.l>=g.R.cardR && g.U.l===g0.U.l && g.U.t===g0.U.t);
  // 2 Esc: everything back, nothing saved, the release does nothing
  await pg.keyboard.press('Escape'); await frame(); const ge=await geo(); await pg.mouse.up(); await pg.waitForTimeout(500); const gu=await geo();
  ok('2 Esc під час зміни розміру: обидві області й текст на старих місцях, нічого не збережено', JSON.stringify(ge)===JSON.stringify(g0) && JSON.stringify(gu)===JSON.stringify(g0) && await stored()===s0); }

// 3 far to the right: it stops where the pushed blocks reach the sheet edge
{ const h=await grab(); await mv(h.x+900, h.y, {steps:20}); const g=await geo(); const sheetR=Math.round((await pg.locator('#sheet').boundingBox()).x+(await pg.locator('#sheet').boundingBox()).width);
  ok('3 тягну далеко вправо: права область штовхнула й текст ('+g0.T.l+' → '+g.T.l+', він за її карткою), розширення зупинилось у межах аркуша (текст до '+g.T.r+', аркуш до '+sheetR+')', g.T.l>g0.T.l && g.T.l>=g.R.cardR && g.T.r<=sheetR && g.R.l>g0.R.l && g.L.r===g.R.l && g.L.r<h.x+900 && g.U.l===g0.U.l);
  // 4 back a bit and release: saved, fx of the moved blocks too, the same after a reload
  await mv(h.x+gap+2*G, h.y, {steps:12}); const g1=await geo(); await pg.mouse.up(); await pg.waitForTimeout(800); const s1=await stored();
  const fx=JSON.parse(s1).blocks.find(b=>b.id==='aR').fx, fx0=JSON.parse(s0).blocks.find(b=>b.id==='aR').fx;
  ok('4 відпустив: збережено, ширина лівої й нове fx правої ('+fx0+' → '+fx.toFixed(3)+')', s1!==s0 && fx>fx0 && JSON.parse(s1).blocks.find(b=>b.id==='aL').cw>12);
  await pg.reload(); await pg.waitForTimeout(500); await tag(); const g2=await geo();
  ok('4a після перезавантаження розкладка та сама', JSON.stringify(g2)===JSON.stringify(g1));
  // 5 Ctrl+Z: back to the start
  const h2=await grab(); await mv(h2.x+G, h2.y, {steps:3}); await pg.mouse.up(); await pg.waitForTimeout(600);   // a resize in this session (the stack does not survive a reload), then Ctrl+Z
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(600); const g3=await geo();
  ok('5 Ctrl+Z повертає розкладку до цієї зміни розміру', JSON.stringify(g3)===JSON.stringify(g1)); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
