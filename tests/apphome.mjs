// Dropping a block back home: within one cell of where it came from the ghost snaps to the starting spot (a faint "home" outline
// lights up), and the drop leaves the whole layout exactly as it was, with nothing saved. The same full revert for a red drop and for
// a gesture the browser cancels (pointercancel).
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1440,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const same=(a,b)=>a.x===b.x && a.y===b.y && a.w===b.w && a.h===b.h;
const G=24;
// the ghost slides to its place (transition on left/top), so read where it is going
const ghost=()=>pg.evaluate(()=>{ const g=document.querySelector('.gbox.on'); if(!g) return null; const p=g.offsetParent.getBoundingClientRect(), c=g.offsetParent;
  return {x:Math.round(p.left+c.clientLeft+parseFloat(g.style.left)), y:Math.round(p.top+c.clientTop+parseFloat(g.style.top)), bad:g.classList.contains('bad')}; });
const homeBox=()=>pg.evaluate(()=>{ const h=document.querySelector('.hbox'); const r=h.getBoundingClientRect(); return {on:h.classList.contains('on'), hit:h.classList.contains('hit'), x:Math.round(r.left), y:Math.round(r.top)}; });
const stored=()=>pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>{ const t=q.result.transaction('notes').objectStore('notes').get('nhome'); t.onsuccess=()=>{ q.result.close(); r(JSON.stringify(t.result)); }; }; }));
const seed=async blocks=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
  await pg.evaluate(async blocks=>{ const n={id:'nhome',title:'',blocks,created:1,updated:1};
    const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(n); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current='nhome'; localStorage.setItem('sheet:settings', JSON.stringify(s)); }, blocks);
  await pg.reload(); await pg.waitForTimeout(500); };
const layout=()=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk')].map(e=>{ const r=e.getBoundingClientRect(); return [(e.classList.contains('is-area')? 'area' : e.textContent.trim().slice(0,6)).replace(/\s/g,' '), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(' '); }).sort().join(' | '));   // sorted: a dropped block is re-appended, so DOM order may change
await pg.goto(SITE); await pg.waitForTimeout(300);

// 1–3 on the sheet: block A above block B in the same column; A's fx is not on a column, as after a note made at another window width
await seed([{id:'ba',row:6,text:'блок A',fx:0.2137},{id:'bb',row:9,text:'блок B\nдругий рядок\nтретій рядок',fx:0.2}]);
{ const A=pg.locator('#sheet > .blk').filter({hasText:'блок A'}); const a0=await box(A), lay0=await layout(), s0=await stored();
  const g=await box(A.locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx+10,gy+150,{steps:12}); await pg.waitForTimeout(100);
  const away=await homeBox(), layAway=await layout();
  await pg.mouse.move(gx+20,gy-17,{steps:12}); await pg.waitForTimeout(100);   // back, less than a cell off on both axes after snapping
  const near=await homeBox(), gh=await ghost();
  ok('1 далеко від дому контур дому видно, але він не підсвічений; блок B при цьому зсунувся', away.on && !away.hit && layAway!==lay0);
  ok('1a в межах клітинки від дому контур дому підсвічений, а контур переносу стоїть рівно на початковому місці ('+gh.x+','+gh.y+' / '+near.x+','+near.y+')', near.on && near.hit && gh.x===near.x && gh.y===near.y);
  await pg.mouse.up(); await pg.waitForTimeout(800);
  const lay1=await layout(), s1=await stored(), h1=await homeBox();
  ok('2 відпустив удома: уся розкладка така сама, як до переносу'+(lay1===lay0?'':' — було «'+lay0+'», стало «'+lay1+'»'), lay1===lay0);
  ok('2a нічого не збережено (запис нотатки в IndexedDB не змінився, fx лишився 0.2137), контур дому сховано', s1===s0 && JSON.parse(s1).blocks.find(b=>b.id==='ba').fx===0.2137 && !h1.on);
  // 3 two cells off: a real move, saved
  const g2=await box(A.locator('.grip')); await pg.mouse.move(g2.x+g2.w/2,g2.y+g2.h/2); await pg.mouse.down(); await pg.mouse.move(g2.x+g2.w/2+2*G,g2.y+g2.h/2,{steps:8}); await pg.waitForTimeout(100);
  const far=await homeBox(); await pg.mouse.up(); await pg.waitForTimeout(800);
  const a3=await box(A), s3=await stored();
  ok('3 за дві клітинки від дому — звичайний перенос: дім не підсвічений, блок зсунувся на 2 клітинки, нотатку збережено', far.on && !far.hit && a3.x===a0.x+2*G && a3.y===a0.y && s3!==s0);
  // 3b a one-cell nudge that never went farther is still a move: home pulls only after the block has been farther away
  const g3=await box(A.locator('.grip')); await pg.mouse.move(g3.x+g3.w/2,g3.y+g3.h/2); await pg.mouse.down(); await pg.mouse.move(g3.x+g3.w/2-G,g3.y+g3.h/2,{steps:6}); await pg.waitForTimeout(100);
  const nudge=await homeBox(); await pg.mouse.up(); await pg.waitForTimeout(800);
  const a4=await box(A), s4=await stored();
  ok('3b зсув на одну клітинку без відходу далі — звичайний перенос: дім не підсвічений, блок на клітинку лівіше, збережено', !nudge.hit && a4.x===a3.x-G && a4.y===a3.y && s4!==s3); }

// 4 a red drop and 5 a cancelled gesture also put everything back and save nothing
await seed([{id:'ba',row:6,text:'блок A',fx:0.2137},{id:'bb',row:9,text:'блок B\nдругий рядок\nтретій рядок',fx:0.2}]);
{ const A=pg.locator('#sheet > .blk').filter({hasText:'блок A'}); const lay0=await layout(), s0=await stored(); const sx=(await box(pg.locator('#sheet'))).x;
  const g=await box(A.locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  const B=await box(pg.locator('#sheet > .blk').filter({hasText:'блок B'}).locator('.txt'));
  // sideways onto B's rows, two cells left of B: no room for the minimum width, so the ghost is red
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(sx+40,gy,{steps:6}); await pg.mouse.move(sx+40,B.y+12,{steps:6}); await pg.mouse.move(gx+(B.x-2*G-g.x-g.w),B.y+12,{steps:12}); await pg.waitForTimeout(100);
  const red=(await ghost()).bad; await pg.mouse.up(); await pg.waitForTimeout(800);
  { const l=await layout(), st=await stored(); ok('4 червоний контур (збоку впритул до сусіда): після відпускання розкладка та сама, нічого не збережено'+` (red ${red}, layout ${l===lay0?'same':l}, saved ${st!==s0})`, red && l===lay0 && st===s0); }
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx+3*G,gy+150,{steps:10}); await pg.waitForTimeout(100);
  const moving=await layout();
  await A.locator('.grip').evaluate(g=>g.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true})));
  await pg.mouse.up(); await pg.waitForTimeout(800);
  { const l=await layout(), st=await stored(); ok('5 браузер скасував жест (pointercancel): розкладка та сама, нічого не збережено'+` (moving ${moving!==lay0}, layout ${l===lay0?'same':l}, saved ${st!==s0})`, moving!==lay0 && l===lay0 && st===s0); } }

// 6 inside an area: a block carried out of the area and back near its spot returns into the area exactly
await seed([{id:'barea',row:5,text:'',fx:0.09,kind:'area',cw:29,ch:12},{id:'bkid',row:2,text:'у області',parent:'barea',col:3},{id:'bkid2',row:5,text:'другий в області',parent:'barea',col:3}]);
{ const K=pg.locator('.abody .blk').filter({hasText:'у області'}); const lay0=await layout(), s0=await stored(), a0=await box(pg.locator('.blk.is-area .ablk'));
  const g=await box(K.locator('.grip')); const gx=g.x+g.w/2, gy=g.y+g.h/2;
  await pg.mouse.move(gx,gy); await pg.mouse.down(); await pg.mouse.move(gx,a0.y+a0.h+120,{steps:16}); await pg.waitForTimeout(100);
  const outside=await pg.evaluate(()=>!document.querySelector('.gbox.on').closest('.abody'));
  await pg.mouse.move(gx-14,gy+19,{steps:16}); await pg.waitForTimeout(100); const hb=await homeBox();
  await pg.mouse.up(); await pg.waitForTimeout(800);
  { const l=await layout(), st=await stored(); ok('6 блок з області винесли на аркуш і повернули біля свого місця: дім підсвічений, він знову в області там само, розкладка та сама, нічого не збережено'+` (outside ${outside}, hit ${hb.hit}, count ${await K.count()}, layout ${l===lay0?'same':lay0+' → '+l}, saved ${st!==s0})`, outside && hb.hit && (await K.count())===1 && l===lay0 && st===s0); } }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
