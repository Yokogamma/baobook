// Neighbours making room during a drag slide instead of jumping, the dropped block settles into its place, and with reduced motion
// everything moves at once.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); }; const errs=[];
const BLOCKS=[{id:'ba',row:6,text:'блок A',fx:0.2},{id:'bb',row:9,text:'блок B\nдругий рядок\nтретій рядок\nчетвертий',fx:0.2}];
async function scene(reduced){
  const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}, reducedMotion: reduced? 'reduce' : 'no-preference'}); const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(SITE); await pg.waitForTimeout(300);
  await pg.evaluate(async blocks=>{ const n={id:'nslide',title:'',blocks,created:1,updated:1};
    const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='nslide'; localStorage.setItem('sheet:settings', JSON.stringify(s)); }, BLOCKS);
  await pg.reload(); await pg.waitForTimeout(500);
  const B=pg.locator('#sheet > .blk').filter({hasText:'блок B'}), A=pg.locator('#sheet > .blk').filter({hasText:'блок A'});
  // where B is drawn now, and where it is going (its left/top style)
  const pos=l=>l.evaluate(e=>({drawn:Math.round(e.getBoundingClientRect().top), target:Math.round(e.offsetParent.getBoundingClientRect().top+parseFloat(e.style.top)), tf:getComputedStyle(e).transform}));
  const b0=await pos(B); const g=await A.locator('.grip').boundingBox(); const gx=g.x+g.width/2, gy=g.y+g.height/2;
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx,gy+2*24,{steps:4}); await pg.waitForTimeout(150);
  await pg.mouse.move(gx,gy+3*24+6);   // A's bottom edge now just inside B's first row: B gives way
  const b1=await pos(B); await pg.waitForTimeout(350); const b2=await pos(B);
  await pg.mouse.up(); const a1=await pos(A); await pg.waitForTimeout(400); const a2=await pos(A);
  const dragging=await pg.evaluate(()=>document.getElementById('sheet').classList.contains('dragging'));
  await ctx.close(); return {b0,b1,b2,a1,a2,dragging}; }

{ const r=await scene(false);
  ok('1 сусід звільняє місце плавно: одразу після поштовху B ще між старим і новим місцем ('+r.b0.drawn+' → '+r.b1.drawn+' → '+r.b1.target+')', r.b1.target>r.b0.drawn && r.b1.drawn<r.b1.target && r.b1.drawn>=r.b0.drawn);
  ok('1a за 350 мс B на новому місці ('+r.b2.drawn+')', r.b2.drawn===r.b2.target);
  ok('2 відпущений блок A доїжджає на місце (transform одразу: '+r.a1.tf+', потім '+r.a2.tf+'), а клас .dragging знято', r.a1.tf!=='none' && r.a2.tf==='none' && !r.dragging); }
{ const r=await scene(true);
  ok('3 «зменшити рух»: B стрибає на нове місце одразу ('+r.b1.drawn+' = '+r.b1.target+')', r.b1.target>r.b0.drawn && r.b1.drawn===r.b1.target); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
