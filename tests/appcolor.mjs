// The colour of a note (docs/LIST-ACTIONS-PLAN.md, PR B): the palette button of a list item (in the action mode on touch, on hover on a computer)
// opens a drop-down with «Стандартний» and five colours; the context menu has the same colours in a row. The colour is a soft note field: stored,
// synced, exported and imported, kept in the archive, absent in the trash, untouched by a version restore; a pin right after it is not «busy».
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, typeAt, curId } from './lib/cloudpage.mjs';
const SITE=(await serve()).url;
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const T0=Date.now();
const NOTES=Array.from({length:12},(_,i)=>({id:'n'+(i+1), title:['Ключі','Покупки','Komax старий','Відпустка','Рецепти','Книги','Сервер','Ідеї','Спорт','Фільми','Подарунки','Ремонт'][i],
  blocks:[{id:'b'+i,row:2,text:'текст нотатки '+(i+1),fx:0.2}], created:1, updated:T0-i*60000}));
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const load=async(pg,notes)=>{ await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; }); await pg.setInputFiles('#importFile',file(notes));
  await pg.waitForFunction(()=>/Імпортовано/.test(document.getElementById('toast').textContent),null,{timeout:15000}); };
const fresh=async(pg)=>{ await pg.goto(SITE); await ready(pg); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready(pg);
  await load(pg,NOTES); const ids=NOTES.map(n=>n.id);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), ids);
  await until(()=>pg.evaluate(ids=>[...document.querySelectorAll('#list .item')].every(d=>ids.includes(d.dataset.id)), ids)); await pg.waitForTimeout(200); };
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const actsOn=pg=>pg.evaluate(()=>{ const a=document.querySelector('#list .item.amode'); return a? a.dataset.id : null; });
const item=(pg,id)=>pg.locator('#list .item[data-id="'+id+'"]');
const boxOf=async loc=>{ await loc.waitFor({state:'visible', timeout:5000}).catch(()=>{}); if(await loc.evaluate(e=>{ if(!e.classList.contains('item')) return false; const r=e.getBoundingClientRect(), L=e.closest('.list').getBoundingClientRect(); if(r.top>=L.top+40 && r.bottom<=L.bottom-90) return false; e.scrollIntoView({block:'center'}); return true; }).catch(()=>false)) await loc.page().waitForTimeout(250); const b=await loc.boundingBox(); return b && {x:b.x, y:b.y, w:b.width, h:b.height, cx:b.x+b.width/2, cy:b.y+b.height/2}; };
// the open palette as the user sees it: its box, the swatches (name, checked, the circle's box, the cell's height), where its button is
const pal=pg=>pg.evaluate(()=>{ const p=document.querySelector('.pal'); if(!p) return null; const r=p.getBoundingClientRect(), id=(document.querySelector('.it-c[aria-expanded="true"]')||{closest:()=>null}).closest('.item'), b=document.querySelector('.it-c[aria-expanded="true"]');
  return {role:p.getAttribute('role'), head:p.querySelector('.pal-h').textContent, inside:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight, top:r.top, bottom:r.bottom, btn:b && {top:b.getBoundingClientRect().top, bottom:b.getBoundingClientRect().bottom}, id:id && id.dataset.id,
    sw:[...p.querySelectorAll('[role=radio]')].map(x=>{ const c=x.querySelector('.swc').getBoundingClientRect(), xr=x.getBoundingClientRect(); return {name:x.title, on:x.getAttribute('aria-checked'), w:Math.round(c.width*10)/10, h:Math.round(c.height*10)/10, top:Math.round(xr.top), cell:Math.round(xr.height), label:getComputedStyle(x.querySelector('span')).display!=='none'}; }),
    focus:document.activeElement && p.contains(document.activeElement)? document.activeElement.title : null}; });
const round=sw=>sw.every(s=>s.w>0 && Math.abs(s.w-s.h)<0.6);
const bgOf=(pg,id)=>pg.evaluate(id=>getComputedStyle(document.querySelector('#list .item[data-id="'+id+'"]')).backgroundColor, id);
const toastText=pg=>pg.evaluate(()=>document.getElementById('toast').textContent);

/* ── touch: a phone ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tapAt=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(40); await touch('touchEnd',[]); await pg.waitForTimeout(300); };
  const tap=async loc=>{ const b=await boxOf(loc); await tapAt(b.cx,b.cy); };
  const holdAt=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); await pg.waitForTimeout(250); };
  const hold=async loc=>{ const b=await boxOf(loc); await holdAt(b.cx,b.cy); };
  const panel=async()=>{ if(!(await pg.evaluate(()=>document.getElementById('app').classList.contains('open')))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); } };
  const swatchBtn=name=>pg.locator('.pal [role=radio][title="'+name+'"]');
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(400); await panel();

  // 1 the action mode has the palette first: four 48 px buttons, 12 px apart, inside the item; the palette says the colour
  const bg0=await bgOf(pg,'n3'); await hold(item(pg,'n3'));
  const geo=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n3"]'), ib=it.getBoundingClientRect(), bs=['.it-c','.it-p','.it-r','.it-x'].map(c=>it.querySelector(c).getBoundingClientRect());
    return {bs:bs.map(b=>[Math.round(b.width),Math.round(b.height)]), gaps:bs.slice(1).map((b,i)=>Math.round(b.left-bs[i].right)), inside:bs.every(b=>b.left>=ib.left && b.right<=ib.right && b.top>=ib.top && b.bottom<=ib.bottom), label:it.querySelector('.it-c').getAttribute('aria-label')}; });
  ok('1 the mode on «'+await actsOn(pg)+'» shows the palette first: '+JSON.stringify(geo), await actsOn(pg)==='n3' && geo.bs.every(([w,h])=>w>=48 && h>=48) && geo.gaps.every(g=>g>=12) && geo.inside && geo.label==='Колір: Стандартний');

  // 2 a tap on it opens the drop-down: a dialog with a 3×2 grid of round 30 px circles named under them, cells at least 44 px high, inside the screen
  await tap(item(pg,'n3').locator('.it-c')); const p1=await pal(pg);
  ok('2 the palette opens ('+(p1 && p1.head)+'): '+(p1 && p1.sw.map(s=>s.name+(s.on==='true'?'*':'')+' '+s.w+'×'+s.h).join(', ')), p1 && p1.role==='dialog' && p1.id==='n3' && p1.inside && p1.sw.length===6 && p1.sw[0].name==='Стандартний' && p1.sw[0].on==='true' && round(p1.sw) && p1.sw.every(s=>s.w>=29 && s.cell>=44 && s.label) && new Set(p1.sw.map(s=>s.top)).size===2 && await actsOn(pg)==='n3');

  // 3 choosing writes the colour; the item and the palette button wear it; the mode stays
  await tap(swatchBtn('Блакитний')); await until(async()=>((await stored(pg,'n3'))||{}).color==='blue'); await pg.waitForTimeout(150);
  const after=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n3"]'), b=it.querySelector('.it-c'); return {dc:it.dataset.color, bdc:b.dataset.color, label:b.getAttribute('aria-label'), exp:b.getAttribute('aria-expanded'), bbg:getComputedStyle(b).backgroundColor}; });
  ok('3 «Блакитний» is stored and drawn ('+JSON.stringify(after)+'), the palette closed, the mode stays on «'+await actsOn(pg)+'»', after.dc==='blue' && after.bdc==='blue' && after.label==='Колір: Блакитний' && after.exp==='false' && !(await pal(pg)) && await actsOn(pg)==='n3');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250); const bg1=await bgOf(pg,'n3');
  ok('3b at rest the coloured item has its own background ('+bg0+' → '+bg1+')', bg1!==bg0 && bg1!=='rgba(0, 0, 0, 0)');

  // 4 Back closes the palette first, then the mode
  await hold(item(pg,'n3')); await tap(item(pg,'n3').locator('.it-c')); const open4=!!(await pal(pg)); await pg.goBack(); await pg.waitForTimeout(400); const p4=!!(await pal(pg)), m4=await actsOn(pg);
  await pg.goBack(); await pg.waitForTimeout(400);
  ok('4 Back closes the palette ('+open4+' → '+p4+') and leaves the mode ('+m4+'); a second Back closes the mode ('+await actsOn(pg)+')', open4 && !p4 && m4==='n3' && await actsOn(pg)===null);

  // 5 a tap outside closes the palette and the mode
  await panel(); await hold(item(pg,'n5')); await tap(item(pg,'n5').locator('.it-c')); const open5=!!(await pal(pg)); await tapAt(200, 20); await pg.waitForTimeout(250);
  ok('5 a tap outside closes the palette ('+open5+' → '+!!(await pal(pg))+') and the mode ('+await actsOn(pg)+'); nothing is coloured', open5 && !(await pal(pg)) && await actsOn(pg)===null && !('color' in (await stored(pg,'n5'))));

  // 6 the largest interface text: the circles stay round, the names wrap under them
  await panel(); await pg.evaluate(()=>document.documentElement.style.setProperty('--k','1.6')); await pg.waitForTimeout(200);
  await hold(item(pg,'n4')); await tap(item(pg,'n4').locator('.it-c')); const p6=await pal(pg);
  ok('6 at 160% text the circles stay round ('+(p6 && p6.sw.map(s=>s.w+'×'+s.h).join(' '))+') and the palette fits', p6 && round(p6.sw) && p6.sw.every(s=>s.w>=29) && p6.inside);
  await pg.goBack(); await pg.waitForTimeout(300); await pg.goBack(); await pg.waitForTimeout(300); await pg.evaluate(()=>document.documentElement.style.removeProperty('--k')); await pg.waitForTimeout(200);

  // 7 an item near the bottom: the palette opens above its button and stays on the screen
  await panel(); await pg.evaluate(()=>{ const L=document.getElementById('list'), it=L.querySelector('.item[data-id="n12"]'); L.scrollTop=it.offsetTop+it.offsetHeight-L.clientHeight+110; }); await pg.waitForTimeout(300);
  let b12=null; await until(async()=>!!(b12=await item(pg,'n12').boundingBox())); await holdAt(b12.x+40, b12.y+b12.height/2); await tap(item(pg,'n12').locator('.it-c')); const p7=await pal(pg);   // a redraw may replace the item just as it is measured
  ok('7 near the bottom (button at '+(p7 && Math.round(p7.btn.top))+') the palette opens above it ('+(p7 && Math.round(p7.top))+'–'+(p7 && Math.round(p7.bottom))+') inside the screen', p7 && p7.inside && p7.bottom<=p7.btn.top+1);
  await pg.goBack(); await pg.waitForTimeout(300); await pg.goBack(); await pg.waitForTimeout(300);

  // 8 «Стандартний» takes the field away
  await panel(); await hold(item(pg,'n3')); await tap(item(pg,'n3').locator('.it-c')); await tap(swatchBtn('Стандартний')); await until(async()=>!('color' in (await stored(pg,'n3'))));
  ok('8 «Стандартний» removes «color» from storage; the item has no colour ('+await item(pg,'n3').getAttribute('data-color')+')', !('color' in (await stored(pg,'n3'))) && await item(pg,'n3').getAttribute('data-color')===null);
  // 8b the open note with a colour shows a press over the :hover a finger leaves behind (the same darker colour as without the hover)
  await hold(item(pg,'n1')); await tap(item(pg,'n1').locator('.it-c')); await tap(swatchBtn('Зелений')); await until(async()=>((await stored(pg,'n1'))||{}).color==='green'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').classList.add('press')); const pNo=await bgOf(pg,'n1');
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); const {root}=await cdp.send('DOM.getDocument'); const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId, selector:'#list .item[data-id="n1"]'});
  await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:['hover']}); const pHov=await bgOf(pg,'n1'); await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:[]});
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').classList.remove('press')); const rest=await bgOf(pg,'n1');
  ok('8b the open green note pressed: '+pNo+', with :hover too '+pHov+' (at rest '+rest+')', await item(pg,'n1').evaluate(e=>e.classList.contains('cur')) && pNo===pHov && pHov!==rest);
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++; await ctx.close(); }

/* ── a computer: the hover button, the keyboard, the context menu; the archive and the trash; storage, export, import, history, a pin after a colour ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}, acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(400);
  const ctxMenu=async(id, name)=>{ const b=await boxOf(item(pg,id)); await pg.mouse.click(b.x+40, b.cy, {button:'right'}); await pg.waitForTimeout(150); if(name){ await pg.click('.amenu.ctx .mi.sw1[aria-label="'+name+'"]'); await pg.waitForTimeout(150); } };

  // 9 hover: the palette is the first button, 24×24, the title gives it room
  await item(pg,'n2').hover(); await pg.waitForTimeout(100);
  const h9=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n2"]'), c=it.querySelector('.it-c').getBoundingClientRect(), p=it.querySelector('.it-p').getBoundingClientRect(), t=it.querySelector('.it-t').getBoundingClientRect(); return {w:Math.round(c.width), h:Math.round(c.height), left:c.right<=p.left, room:Math.round(t.right-parseFloat(getComputedStyle(it.querySelector('.it-t')).paddingRight))<=Math.round(c.left)+1}; });
  ok('9 on hover the palette shows 24×24 left of the pin, and the title stops before it: '+JSON.stringify(h9), h9.w===24 && h9.h===24 && h9.left && h9.room);

  // 10 a click opens one row of six round circles named by their titles; the focus is on the current colour; the arrows move, Enter chooses and the focus goes back
  await item(pg,'n2').locator('.it-c').click(); await pg.waitForTimeout(150); const p10=await pal(pg);
  ok('10 the palette: one row ('+(p10 && new Set(p10.sw.map(s=>s.top)).size)+'), names not shown ('+(p10 && p10.sw.some(s=>s.label))+'), round, the focus on «'+(p10 && p10.focus)+'»', p10 && p10.sw.length===6 && new Set(p10.sw.map(s=>s.top)).size===1 && !p10.sw.some(s=>s.label) && round(p10.sw) && p10.focus==='Стандартний' && p10.inside);
  await pg.mouse.move(700, 400); await pg.waitForTimeout(100); const kept=await pg.evaluate(()=>getComputedStyle(document.querySelector('#list .item[data-id="n2"] .it-c')).display!=='none');
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); const f10=(await pal(pg)).focus; await pg.keyboard.press('Enter');
  await until(async()=>((await stored(pg,'n2'))||{}).color==='green'); await pg.waitForTimeout(150);
  const fb=await pg.evaluate(()=>{ const a=document.activeElement; return a.className+'@'+(a.closest('.item')||{dataset:{}}).dataset.id; });
  ok('10b the buttons stay while it is open, the pointer gone ('+kept+'); → → «'+f10+'», Enter stores green, the palette closes and the focus is back on '+fb, kept && f10==='Зелений' && !(await pal(pg)) && fb==='it-c@n2' && await item(pg,'n2').getAttribute('data-color')==='green');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); const p10c=await pal(pg); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  const fe=await pg.evaluate(()=>document.activeElement.className);
  ok('10c Enter on the button opens it on «'+(p10c && p10c.focus)+'»; Escape closes it, the focus on '+fe+', the colour stays', p10c && p10c.focus==='Зелений' && !(await pal(pg)) && fe==='it-c' && (await stored(pg,'n2')).color==='green');

  // 11 the context menu: the colours in a row under «Відкрити», the current one checked; a choice stores it
  await ctxMenu('n4'); const m11=await pg.evaluate(()=>{ const m=document.querySelector('.amenu.ctx'); return {row:[...m.querySelectorAll('.mi.sw1')].map(b=>b.getAttribute('aria-label')+(b.getAttribute('aria-checked')==='true'?'*':'')), roles:[...new Set([...m.querySelectorAll('.mi.sw1')].map(b=>b.getAttribute('role')))], tops:new Set([...m.querySelectorAll('.mi.sw1')].map(b=>Math.round(b.getBoundingClientRect().top))).size}; });
  await pg.click('.amenu.ctx .mi.sw1[aria-label="Рожевий"]'); await until(async()=>((await stored(pg,'n4'))||{}).color==='pink');
  ok('11 the menu has the colours in one row ('+m11.row.join(' ')+', '+m11.roles+'); «Рожевий» is stored', m11.row.join(' ')==='Стандартний* Жовтий Зелений Блакитний Рожевий Фіолетовий' && m11.roles.join()==='menuitemradio' && m11.tops===1 && !(await pg.locator('.amenu.ctx').count()));

  // 12 the archive: the palette is there; a colour in the archive is stored with the note archived
  await item(pg,'n5').hover(); await item(pg,'n5').locator('.it-r').click(); await until(async()=>((await stored(pg,'n5'))||{}).archived>0);
  await pg.click('#archRow'); await pg.waitForTimeout(300); await item(pg,'n5').hover(); await pg.waitForTimeout(100);
  const a12=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n5"]'), c=it.querySelector('.it-c'), r=it.querySelector('.it-r'); return c && c.getBoundingClientRect().right<=r.getBoundingClientRect().left; });
  await item(pg,'n5').locator('.it-c').click(); await pg.click('.pal [role=radio][title="Фіолетовий"]'); await until(async()=>((await stored(pg,'n5'))||{}).color==='purple');
  const s12=await stored(pg,'n5');
  ok('12 in the archive the palette sits left of «Повернути» ('+a12+'); the colour is stored on the archived note ('+s12.color+', archived '+!!s12.archived+')', a12 && s12.color==='purple' && s12.archived>0 && await item(pg,'n5').getAttribute('data-color')==='purple');
  await pg.evaluate(()=>{ if(!document.getElementById('sect').hidden) document.getElementById('sectBack').click(); }); await pg.waitForTimeout(250);

  // 13 the trash: no palette, no colours in the menu; the colour is kept and comes back with a restore
  await item(pg,'n4').hover(); await item(pg,'n4').locator('.it-x').click(); await until(async()=>((await stored(pg,'n4'))||{}).deleted>0);
  await pg.click('#trashRow'); await pg.waitForTimeout(300); const t13=await item(pg,'n4').locator('.it-c').count(), dc13=await item(pg,'n4').getAttribute('data-color');
  await ctxMenu('n4'); const sw13=await pg.locator('.amenu.ctx .mi.sw1').count(); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  await item(pg,'n4').hover(); await item(pg,'n4').locator('.it-r').click(); await until(async()=>!((await stored(pg,'n4'))||{}).deleted); await pg.evaluate(()=>{ if(!document.getElementById('sect').hidden) document.getElementById('sectBack').click(); }); await pg.waitForTimeout(250);
  ok('13 in the trash: no palette button ('+t13+'), no colour drawn ('+dc13+'), no colours in the menu ('+sw13+'); restored, it is pink again ('+await item(pg,'n4').getAttribute('data-color')+')', t13===0 && dc13===null && sw13===0 && (await stored(pg,'n4')).color==='pink' && await item(pg,'n4').getAttribute('data-color')==='pink');

  // 14 a reload keeps the colours
  await pg.reload(); await ready(pg); await pg.waitForTimeout(400);
  ok('14 after a reload n2 is green ('+await item(pg,'n2').getAttribute('data-color')+'), n4 pink ('+await item(pg,'n4').getAttribute('data-color')+')', await item(pg,'n2').getAttribute('data-color')==='green' && await item(pg,'n4').getAttribute('data-color')==='pink');

  // 15 export carries the colour; an older file without it imports; a file with a colour (and an unknown one of the right format) brings it in
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.evaluate(()=>{ document.getElementById('setBtn').click(); document.getElementById('exportBtn').click(); })]);
  const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8')), x2=ex.notes.find(n=>n.id==='n2'), x1=ex.notes.find(n=>n.id==='n1');
  ok('15 export carries «color» on the coloured note only ('+(x2&&x2.color)+', n1 '+(x1 && ('color' in x1))+')', x2 && x2.color==='green' && x1 && !('color' in x1));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  await load(pg,[{id:'old1',title:'Стара',blocks:[{id:'o1',row:2,text:'старий файл',fx:0.2}],created:1,updated:T0}, {id:'n9',title:'Спорт',blocks:[{id:'b8',row:2,text:'текст нотатки 9',fx:0.2}],created:1,updated:Date.now(),color:'yellow'}, {id:'nt',title:'Нова',blocks:[{id:'t1',row:2,text:'з майбутнього',fx:0.2}],created:1,updated:T0,color:'teal'}, {id:'nb',title:'Зламана',blocks:[{id:'z1',row:2,text:'x',fx:0.2}],created:1,updated:T0,color:'Not A Colour'}]);
  await pg.waitForTimeout(300); const o=await stored(pg,'old1'), n9=await stored(pg,'n9'), nt=await stored(pg,'nt'), nb=await stored(pg,'nb');
  ok('15b an older file without «color» imports ('+!!o+', no field '+(o && !('color' in o))+'); a newer copy brings yellow ('+(n9&&n9.color)+'); «teal» is kept and drawn plain ('+(nt&&nt.color)+', '+await item(pg,'nt').getAttribute('data-color')+'); a bad colour is dropped ('+(nb && nb.color)+')',
    o && !('color' in o) && n9 && n9.color==='yellow' && await item(pg,'n9').getAttribute('data-color')==='yellow' && nt && nt.color==='teal' && await item(pg,'nt').getAttribute('data-color')===null && nb && !('color' in nb));

  // 16 a colour chosen while the open note is being edited keeps the edit
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ const t=document.querySelector('#sheet .blk .txt'); t.textContent='текст нотатки 1 правка'; t.dispatchEvent(new InputEvent('input',{bubbles:true})); });
  await ctxMenu('n1','Жовтий'); await until(async()=>((await stored(pg,'n1'))||{}).color==='yellow'); await pg.waitForTimeout(900); const s16=await stored(pg,'n1');
  ok('16 coloured while being edited: stored «'+s16.blocks[0].text+'», '+s16.color, s16.color==='yellow' && s16.blocks[0].text==='текст нотатки 1 правка');

  // 17 a pin right after a colour on a closed note pins (no «busy»), while the colour's write is still on its way
  await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=st=>st.includes('notes')? window.__gate : Promise.resolve(); });
  await ctxMenu('n7','Зелений'); await item(pg,'n7').hover(); await item(pg,'n7').locator('.it-p').click(); await pg.waitForTimeout(200); const t17=await toastText(pg);
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await until(async()=>{ const s=await stored(pg,'n7'); return s && s.color==='green' && s.pinned>0; }).catch(()=>{}); const s17=await stored(pg,'n7');
  ok('17 a pin right after a colour: no «busy» («'+t17+'»), stored green ('+s17.color+') and pinned ('+!!s17.pinned+')', !/зберігається/.test(t17) && s17.color==='green' && s17.pinned>0);

  // 17b, 17c a soft write replaced by the next one and then failed: the next write stores both fields (colour → pin, pin → colour); nothing is lost after a reload
  for(const [id, first, label] of [['n10','color','17b a colour, then a pin'], ['n11','pin','17c a pin, then a colour']]){
    await pg.evaluate(()=>{ let k=0; sheetDebug.saveGate=st=>!st.includes('notes')? Promise.resolve() : ++k===1? new Promise((_,no)=>setTimeout(()=>no(new DOMException('aborted','AbortError')),1500)) : Promise.resolve(); });   // the first write fails after the second action began
    const pin=async()=>{ await item(pg,id).hover(); await item(pg,id).locator('.it-p').click(); };
    if(first==='color'){ await ctxMenu(id,'Рожевий'); await pin(); } else { await pin(); await ctxMenu(id,'Рожевий'); }
    await pg.waitForTimeout(1900); await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); await pg.waitForTimeout(300); const sa=await stored(pg,id), warn=await pg.evaluate(()=>!document.getElementById('saveWarn').hidden);
    await pg.reload(); await ready(pg); await pg.waitForTimeout(400); const sb=await stored(pg,id);
    ok(label+', the first write failed: stored '+JSON.stringify({color:sa.color, pinned:!!sa.pinned})+' (warning '+warn+'), after a reload '+JSON.stringify({color:sb.color, pinned:!!sb.pinned, drawn:await item(pg,id).getAttribute('data-color')}),
      sa.color==='pink' && sa.pinned>0 && sb.color==='pink' && sb.pinned>0 && await item(pg,id).getAttribute('data-color')==='pink'); }

  // 17d, 17e two soft writes of the open note held back while another tab moves it where a field does not apply: each field is checked after the merge.
  // A pin, then a colour, the note archived in tab B: the archived note gets the colour but not the pin. A colour, then a pin, the note trashed in B:
  // in the trash the stored colour stays and there is no pin
  const B=await ctx.newPage(); await B.goto(pg.url()); await ready(B); await B.waitForTimeout(400);
  for(const [id, order, move, label] of [['old1', ['pin','color'], '.it-r', '17d a pin, then a colour, of the open note while tab B archives it'], ['nt', ['color','pin'], '.it-x', '17e a colour, then a pin, of the open note while tab B moves it to the trash']]){
    if(id==='nt'){ await ctxMenu(id,'Рожевий'); await until(async()=>((await stored(pg,id))||{}).color==='pink'); }
    await pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id); await until(()=>pg.evaluate(id=>sheetDebug.cur()===id, id)); await pg.waitForTimeout(300);
    await pg.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=st=>st.includes('notes')? window.__gate : Promise.resolve(); });
    for(const step of order){ if(step==='pin'){ await item(pg,id).hover(); await item(pg,id).locator('.it-p').click(); } else await ctxMenu(id,'Блакитний'); await pg.waitForTimeout(150); }
    await B.bringToFront(); await B.reload(); await ready(B); await B.waitForTimeout(400); await B.locator('#list .item[data-id="'+id+'"]').hover(); await B.locator('#list .item[data-id="'+id+'"] '+move).click();
    await until(async()=>{ const r=await stored(B,id); return r && (move==='.it-r'? r.archived>0 : r.deleted>0); }); await pg.bringToFront();
    await pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await pg.waitForTimeout(1200); const r=await stored(pg,id);
    ok(label+': stored '+JSON.stringify({archived:!!r.archived, deleted:!!r.deleted, pinned:!!r.pinned, color:r.color}),
      move==='.it-r'? (r.archived>0 && !r.pinned && r.color==='blue') : (r.deleted>0 && !r.pinned && r.color==='pink')); }
  await B.close();

  // 18 restoring a version leaves the colour as it is
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n8"]').click()); await until(()=>pg.evaluate(()=>sheetDebug.cur()==='n8'));
  await pg.evaluate(()=>sheetDebug.vers.force('auto')); await ctxMenu('n8','Блакитний'); await until(async()=>((await stored(pg,'n8'))||{}).color==='blue');
  await pg.evaluate(()=>{ const t=document.querySelector('#sheet .blk .txt'); t.textContent='після версії'; t.dispatchEvent(new InputEvent('input',{bubbles:true})); });
  await until(()=>pg.evaluate(()=>!document.getElementById('saved').classList.contains('pend')),15000); await pg.evaluate(()=>sheetDebug.vers.queue());
  await pg.click('#histBtn'); await until(()=>pg.evaluate(()=>document.querySelectorAll('#histList .hv').length>1),15000);
  await pg.click('#histList .hv:not([data-id="now"])'); await pg.waitForTimeout(250); await pg.click('#histRestore');
  await until(async()=>(await stored(pg,'n8')).blocks[0].text==='текст нотатки 8'); await pg.waitForTimeout(300); const s18=await stored(pg,'n8');
  ok('18 a version restored: the text is back («'+s18.blocks[0].text+'»), the colour stays ('+s18.color+')', s18.blocks[0].text==='текст нотатки 8' && s18.color==='blue');
  console.log(errs.length? errs.join('\n') : '✓ computer: no errors'); if(errs.length) fails++; await ctx.close(); }

/* ── two devices through the test cloud ── */
{ const cloud=new TestCloud({start:Date.now()}); const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX});
  await typeAt(A.pg,500,300,'нотатка для кольору'); const id=await curId(A.pg); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(600); await settle(A.pg);
  await settle(B.pg,600); await settle(B.pg);
  await A.pg.bringToFront(); const b=await A.pg.locator('#list .item[data-id="'+id+'"]').boundingBox(); await A.pg.mouse.click(b.x+40, b.y+b.height/2, {button:'right'}); await A.pg.waitForTimeout(150);
  await A.pg.click('.amenu.ctx .mi.sw1[aria-label="Блакитний"]'); await settle(A.pg); await settle(B.pg,600); await settle(B.pg);
  const doc=cloud.doc('notes',id), sb=await stored(B.pg,id);
  ok('19 the colour reached the cloud ('+(doc&&doc.color)+') and device B ('+(sb&&sb.color)+'), drawn there', doc && doc.color==='blue' && sb && sb.color==='blue' && await B.pg.locator('#list .item[data-id="'+id+'"]').getAttribute('data-color')==='blue');
  await B.pg.bringToFront(); const bb=await B.pg.locator('#list .item[data-id="'+id+'"]').boundingBox(); await B.pg.mouse.click(bb.x+40, bb.y+bb.height/2, {button:'right'}); await B.pg.waitForTimeout(150);
  await B.pg.click('.amenu.ctx .mi.sw1[aria-label="Стандартний"]'); await settle(B.pg); await settle(A.pg,600); await settle(A.pg);
  const copies=(await A.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('versions','readonly').objectStore('versions').getAll(); g.onsuccess=()=>{ d.close(); res(g.result.filter(v=>v.reason==='copy').length); }; }; })));
  ok('19b «Стандартний» on B: gone from the cloud document and from A ('+(await stored(A.pg,id)).color+'), no conflict copies ('+copies+')', !('color' in cloud.doc('notes',id)) && !('color' in (await stored(A.pg,id))) && copies===0);
  const errs=[...A.errs, ...B.errs]; console.log(errs.length? errs.join('\n') : '✓ devices: no errors'); if(errs.length) fails++; await A.close(); await B.close(); }

await br.close();
console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
