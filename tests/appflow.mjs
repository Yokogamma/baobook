import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const dragTo=async(x,y,tx,ty)=>{ await touch('touchStart',[{x,y}]); for(let i=1;i<=10;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x:x+(tx-x)*i/10,y:y+(ty-y)*i/10}]); } await pg.waitForTimeout(120); await touch('touchMove',[{x:tx,y:ty}]); await pg.waitForTimeout(150); await touch('touchEnd',[]); };   // контур відстає на крок: останній рух окремо, з паузою
const idbNote=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readonly').objectStore('notes').get('flow1'); t.onsuccess=()=>{ d.close(); res(t.result); }; }; }));
const tops=async()=>{ const els=await pg.locator('#sheet > .blk').all(); const out=[]; for(const e of els){ const b=await box(e); const cls=await e.getAttribute('class'); out.push({text:/is-code/.test(cls)? 'код' : /is-area/.test(cls)? 'область' : (await e.innerText()).trim().slice(0,12), ...b}); } return out; };
const txtX=async t=>(await box(pg.locator('#sheet > .blk').filter({hasText:t}).locator('.txt'))).x;
const SEED={id:'flow1',title:'',created:1,updated:Date.now(),blocks:[
  {id:'b1',fx:0.05,row:2,text:'Перший'},
  {id:'b2',fx:0.55,row:2,text:'Другий праворуч'},
  {id:'b3',fx:0.05,row:5,kind:'code',lang:'javascript',text:'const a=1;\nconst b=2;'},
  {id:'A',fx:0.55,row:5,kind:'area',cw:12,title:'Область'},
  {id:'k1',parent:'A',col:0,row:0,text:'Дитина 1'},
  {id:'k2',parent:'A',col:0,row:2,text:'Дитина 2'},
  {id:'b4',fx:0.3,row:30,text:'Четвертий далеко внизу'}]};
await pg.goto(SITE); await pg.waitForTimeout(400);
await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
SEED.updated=Date.now()+60000;
await pg.evaluate(seed=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); t.objectStore('notes').put(seed); t.oncomplete=()=>{ d.close(); res(); }; }; }), SEED);
await pg.evaluate(()=>localStorage.clear()); await pg.reload(); await pg.waitForTimeout(600);
const W=await pg.locator('#sheet').evaluate(e=>e.clientWidth);
const noOverlap=async()=>{ const t=(await tops()).filter(o=>o.w>0); for(let i=0;i<t.length;i++) for(let j=i+1;j<t.length;j++){ const a=t[i],b=t[j]; if(a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h) return false; } return true; };
// 1 вузький екран — те саме полотно: горизонталь за fx, вертикаль за рядом, стрічки немає
{ const x1=await txtX('Перший'), x2=await txtX('Другий'); const t=await tops(); const first=t.find(o=>o.text==='Перший'), second=t.find(o=>o.text==='Другий право'), four=t.find(o=>/Четвертий/.test(o.text));
  ok('1 полотно на '+W+'px: «Перший» x='+x1+', «Другий» x='+x2+' (fx 0.55 → ~'+Math.round(0.55*W)+'), обидва на ряду 2 (y '+first.y+'='+second.y+'), «Четвертий» далеко внизу (y '+four.y+'), блоки не накладаються', !(await pg.locator('#sheet').evaluate(e=>e.classList.contains('flow'))) && x2>x1+100 && Math.abs(x2-0.55*W)<=24 && first.y===second.y && four.y>=700 && await noOverlap()); }
// 2 область: діти всередині на своїх рядах
{ const area=pg.locator('.blk.is-area').first(); const kids=await area.locator('.abody > .blk').all(); const k=[]; for(const e of kids) k.push(await box(e)); k.sort((p,q)=>p.y-q.y);
  ok('2 область з двома дітьми стовпчиком через ряд', k.length===2 && k[0].x===k[1].x && (k[1].y-k[0].y)===48); }
// 3 правка тексту не змінює модель
await pg.locator('.blk .txt').filter({hasText:'Перший'}).tap(); await pg.keyboard.press('End'); await pg.keyboard.type(' +'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
{ const n=await idbNote(); const chg=[]; for(const sb of SEED.blocks){ const b=n.blocks.find(x=>x.id===sb.id); if(!b){ chg.push(sb.id+':зник'); continue; } if(sb.parent){ if(b.col!==sb.col||b.parent!==sb.parent||b.row!==sb.row) chg.push(sb.id); } else { if(Math.abs(b.fx-sb.fx)>0.04) chg.push(sb.id+':fx '+b.fx.toFixed(2)); if(b.row!==sb.row && !['b3','A'].includes(sb.id)) chg.push(sb.id+':ряд '+b.row); } }
  // b3 (код на всю ширину) і A (область 12 клітинок) на 390px не вміщаються поруч — рушій виштовхує одну з них униз, це полотно, а не стрічка; решта лишається
  ok('3 після правки тексту fx (±1 клітинка) і ряди в сховищі ті самі, крім виштовхнутих коду/області'+(chg.length? ' — змінилось: '+chg.join(', ') : ''), chg.length===0 && /Перший \+/.test(n.blocks.find(b=>b.id==='b1').text)); }
// 4 утримання в порожньому місці — блок саме там (ряд 12, третина ширини)
{ const y=12+24*24; /* ряд 24: нижче коду й області, вище «Четвертого» (ряд 30) */ await hold(Math.round(0.3*W), y); await pg.waitForTimeout(250); await pg.keyboard.type('Вставлений'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const n=await idbNote(); const nb=n.blocks.find(b=>/Вставлений/.test(b.text)); const t=await box(pg.locator('#sheet > .blk').filter({hasText:'Вставлений'}).locator('.txt'));
  ok('4 утримання: блок на ряду '+(nb&&nb.row)+' із fx '+(nb&&nb.fx.toFixed(2))+' (x '+t.x+', y '+t.y+')', nb && nb.row===24 && Math.abs(nb.fx-0.3)<0.06 && Math.abs(t.y-y)<=2); }
// 5 «+» — під найнижчим блоком, від лівого поля
{ const f=await box(pg.locator('#fab')); await tap(f.x+f.w/2,f.y+f.h/2); await pg.waitForTimeout(250); await pg.keyboard.type('Останній'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const n=await idbNote(); const nb=n.blocks.find(b=>/Останній/.test(b.text)); const t=await tops();
  ok('5 «+»: блок найнижчий (ряд '+(nb&&nb.row)+'), від лівого поля (fx '+(nb&&nb.fx.toFixed(2))+')', nb && nb.row===32 && nb.fx<0.15 && t.sort((a,b)=>a.y-b.y)[t.length-1].text==='Останній'); }
// 6 перенос за ручку — куди принесли
{ await pg.evaluate(()=>window.scrollTo(0,0)); await pg.waitForTimeout(150);   // «+» підкрутив сторінку до «Останнього»; ціль переносу — у координатах вікна
  const four=pg.locator('#sheet > .blk').filter({hasText:'Четвертий'}); const g=await box(four.locator('.grip'));
  await dragTo(g.x+g.w/2, g.y+g.h/2, 200, 12+20*24); await pg.waitForTimeout(600);
  const n=await idbNote(); const nb=n.blocks.find(b=>b.id==='b4');
  ok('6 перенесений блок: ряд '+(nb&&nb.row)+', fx '+(nb&&nb.fx.toFixed(2))+' (було 30 / 0.30)', nb && nb.row>=19 && nb.row<=21 && nb.fx>0.4); }
// 7 перенос у область
{ const two=pg.locator('#sheet > .blk').filter({hasText:'Другий'}); const g=await box(two.locator('.grip')); const area=pg.locator('.blk.is-area').first(); const a=await box(area.locator('.ablk'));
  await dragTo(g.x+g.w/2, g.y+g.h/2, a.x+a.w/2, a.y+a.h-20); await pg.waitForTimeout(600);
  const n=await idbNote(); const nb=n.blocks.find(b=>b.id==='b2');
  ok('7 блок з аркуша заїхав в область (parent A, ряд '+(nb&&nb.row)+')', nb && nb.parent==='A' && (await area.locator('.abody > .blk').count())===3); }
// 8 огляд «як на компʼютері»: полотно 1024 у зменшенні; назад — полотно в ширину екрана
{ await pg.locator('#viewBtn').tap(); await pg.waitForTimeout(400);
  const z=await pg.locator('#sheet').evaluate(e=>({z:getComputedStyle(e).zoom, w:e.clientWidth, ov:e.classList.contains('overview')}));
  ok('8a огляд: zoom '+z.z+', ширина полотна '+z.w+', «+» схований', z.ov && parseFloat(z.z)<1 && z.w===1024 && !(await pg.locator('#fab').isVisible()) && (await pg.locator('#viewBtn').getAttribute('aria-pressed'))==='true');
  await pg.locator('#viewBtn').tap(); await pg.waitForTimeout(400);
  ok('8b назад: полотно в ширину екрана ('+(await pg.locator('#sheet').evaluate(e=>e.clientWidth))+'), «+» видно', await pg.locator('#sheet').evaluate(e=>!e.classList.contains('overview') && !e.style.zoom && e.clientWidth===390) && await pg.locator('#fab').isVisible() && /ширину екрана/.test(await pg.locator('#viewBtn').getAttribute('title'))===false); }
// 9 ширина вікна змінює лише масштаб по горизонталі: fx — частка ширини
{ await pg.setViewportSize({width:900,height:844}); await pg.waitForTimeout(500); const xw=await txtX('Перший');
  const W2=await pg.locator('#sheet').evaluate(e=>e.clientWidth); const ins=await txtX('Вставлений');
  await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(500); const xn=await txtX('Вставлений');
  ok('9 на 900px «Вставлений» x='+ins+' (~0.3×'+W2+'), на 390px знову x='+xn, Math.abs(ins-0.3*W2)<=30 && Math.abs(xn-0.3*W)<=30 && xw>0); }
// 10 після перезавантаження модель та сама
{ const before=await idbNote(); await pg.reload(); await pg.waitForTimeout(600); const after=await idbNote();
  ok('10 після перезавантаження позиції у сховищі ті самі ('+after.blocks.map(b=>b.row+'/'+(b.parent||(b.fx||0).toFixed(2))).join(' ')+')', JSON.stringify(before.blocks.map(b=>[b.id,b.row,b.col,b.fx,b.parent]))===JSON.stringify(after.blocks.map(b=>[b.id,b.row,b.col,b.fx,b.parent]))); }
await pg.screenshot({path:OUT+'/appflow-final.png',fullPage:true});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
