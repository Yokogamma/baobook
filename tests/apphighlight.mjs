// While dragging, why blocks move: the blocks of the area under the dragged block get a dashed outline (.dz), a block pushed aside
// gets an accent outline (.shifted) and a faint outline (.trace) stays at its old place. All of it goes away on the drop.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const seed=async blocks=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
  await pg.evaluate(async blocks=>{ const n={id:'nhl',title:'',blocks,created:1,updated:1};
    const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='nhl'; localStorage.setItem('sheet:settings', JSON.stringify(s)); sessionStorage.clear(); }, blocks);
  await pg.reload(); await pg.waitForTimeout(500); };
const marks=()=>pg.evaluate(()=>({ dz:[...document.querySelectorAll('.blk.dz')].map(e=>e.textContent.trim().slice(0,12)),
  shifted:[...document.querySelectorAll('.blk.shifted')].map(e=>e.textContent.trim().slice(0,12)),
  traces:[...document.querySelectorAll('.trace')].map(t=>{ const r=t.getBoundingClientRect(); return {x:Math.round(r.left), y:Math.round(r.top), h:Math.round(r.height)}; }) }));
const dragTop=()=>pg.evaluate(()=>Math.round(document.querySelector('.blk.drag').getBoundingClientRect().top));
await pg.goto(SITE); await pg.waitForTimeout(300);

// 1–3 an area with two blocks; a block below it is carried up into the area and past the middle of the first one
await seed([{id:'barea',row:5,text:'',fx:0.09,kind:'area',cw:29,ch:16},{id:'k1',row:1,text:'перший в області\nдругий рядок\nтретій рядок\nчетвертий рядок',parent:'barea',col:1,cw:10},
  {id:'k2',row:1,text:'другий в області',parent:'barea',col:16},{id:'bnew',row:26,text:'новий блок',fx:0.107}]);
{ const k1=pg.locator('.abody .blk').filter({hasText:'перший'}); const k0=await box(k1), mid=k0.y+k0.h/2;
  const g=await box(pg.locator('#sheet > .blk').filter({hasText:'новий блок'}).locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx,gy-20,{steps:4}); await pg.waitForTimeout(80);
  const onSheet=await marks();
  let y=gy-20; while(await dragTop()>k0.y+k0.h+20){ y-=6; await pg.mouse.move(gx,y); } await pg.waitForTimeout(80);
  const inArea=await marks();
  ok('1 поки блок на аркуші, нічого не підсвічено ('+JSON.stringify(onSheet)+')', !onSheet.dz.length && !onSheet.shifted.length && !onSheet.traces.length);
  ok('1a контур у області: обидва її блоки обведено пунктиром ('+inArea.dz.join(', ')+'), ще ніхто не зсунутий', inArea.dz.length===2 && !inArea.shifted.length && !inArea.traces.length);
  while(await dragTop()>mid-30){ y-=6; await pg.mouse.move(gx,y); } await pg.waitForTimeout(150);
  const past=await marks(); await pg.screenshot({path:OUT+'/apphighlight.png'});
  const t=past.traces[0];
  ok('2 після середини перший блок зсунуто: акцентний контур на ньому ('+past.shifted.join(', ')+')', past.shifted.length===1 && past.shifted[0].startsWith('перший'));
  ok('2a на його старому місці — блідий контур ('+JSON.stringify(t)+' / блок був '+k0.x+','+k0.y+' висотою '+k0.h+')', past.traces.length===1 && t.x===k0.x && t.y===k0.y && Math.abs(t.h-k0.h)<=2);
  while(await dragTop()<mid+30){ y+=6; await pg.mouse.move(gx,y); } await pg.waitForTimeout(80);
  const back=await marks();
  ok('3 повернув нижче середини: блок на місці, ні акценту, ні блідого контуру; пунктир області лишився', !back.shifted.length && !back.traces.length && back.dz.length===2);
  while(await dragTop()>mid-30){ y-=6; await pg.mouse.move(gx,y); } await pg.waitForTimeout(80);
  await pg.mouse.up(); await pg.waitForTimeout(400);
  const dropped=await marks();
  ok('3a відпустив: жодних позначок не лишилось', !dropped.dz.length && !dropped.shifted.length && !dropped.traces.length); }

// 4 on the sheet: a block pushed down by a block carried from above gets the accent and its trace; Esc clears everything
await seed([{id:'ba',row:6,text:'блок A',fx:0.2},{id:'bb',row:9,text:'блок B\nдругий рядок\nтретій рядок\nчетвертий',fx:0.2}]);
{ const B=pg.locator('#sheet > .blk').filter({hasText:'блок B'}); const b0=await box(B);
  const g=await box(pg.locator('#sheet > .blk').filter({hasText:'блок A'}).locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx,gy+(b0.y-g.y)+6,{steps:10}); await pg.waitForTimeout(100);   // the bottom edge just inside B's first row
  const m=await marks(); const b1=await box(B);
  ok('4 на аркуші: блок B зсунуто вниз, на ньому акцент, блідий контур на старому місці, пунктиру області немає', b1.y>b0.y && m.shifted.length===1 && m.traces.length===1 && m.traces[0].y===b0.y && !m.dz.length);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); const esc=await marks(); await pg.mouse.up();
  ok('4a Esc: позначки зникли', !esc.shifted.length && !esc.traces.length && !esc.dz.length); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
