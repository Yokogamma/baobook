// Probes behind docs/LAYOUT-MODEL.md §6: they reproduce how the layout behaves today and print the numbers. Nothing is asserted,
// so this is not a CI scenario. Run from the repository root: node tests/lab/layout-probes.mjs
import { chromium } from 'playwright';
import { serve, CTX } from '../lib/server.mjs';
const srv=await serve(), SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const out=(n,v)=>console.log(n+(v===undefined? '' : ': '+(typeof v==='string'? v : JSON.stringify(v))));
const G=24;
const LONG='Довгий абзац тексту, який на широкому аркуші займає кілька рядків, а в вузькому проміжку між сусідами стає високим стовпчиком. '.repeat(3).trim();
const PHONE={viewport:{width:390,height:844},hasTouch:true,isMobile:true}, DESK={viewport:{width:1280,height:900}};

// a fresh origin state: open the site, wipe storage, reload (the stores exist again); pg.W is the sheet width (the panel may be open)
async function page(opts){ const ctx=await br.newContext({...CTX, ...opts}); const pg=await ctx.newPage(); pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  if(opts.hasTouch){ pg.cdp=await ctx.newCDPSession(pg); await pg.cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]}); }
  await pg.goto(SITE); await pg.waitForTimeout(400); pg.W=await pg.evaluate(()=>document.getElementById('sheet').clientWidth);
  await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); }));
  await pg.reload(); await pg.waitForTimeout(400); return {ctx,pg}; }
// a note straight into IndexedDB, made current, then a reload shows it. Sheet blocks may carry `col` instead of `fx`: make() accepts both
async function seed(pg, note, settings={}){
  await pg.evaluate(async ({note,settings})=>{ const db=await new Promise((r,j)=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>r(q.result); q.onerror=j; });
    await new Promise(r=>{ const tx=db.transaction('notes','readwrite'); tx.objectStore('notes').put(note); tx.oncomplete=r; }); db.close();
    const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.current=note.id; Object.assign(s,settings); localStorage.setItem('sheet:settings', JSON.stringify(s)); sessionStorage.clear(); },{note,settings});
  await pg.reload(); await pg.waitForTimeout(600); }
const stored=(pg,id)=>pg.evaluate(id=>new Promise(r=>{ const q=indexedDB.open('sheet'); q.onsuccess=()=>{ const t=q.result.transaction('notes').objectStore('notes').get(id); t.onsuccess=()=>{ q.result.close(); r(t.result); }; }; }),id);
// every block keyed by the start of its text (areas by title): position in sheet pixels, size, row on a 24px grid
const geo=pg=>pg.evaluate(()=>{ const s=document.getElementById('sheet').getBoundingClientRect(); const o={};
  for(const e of document.querySelectorAll('.blk')){ const r=e.getBoundingClientRect(); const key=e.classList.contains('is-area')? 'AREA:'+(e.querySelector('.ctitle')?.textContent||'') : (e.querySelector('.txt')?.textContent||e.textContent).trim().slice(0,10);
    const card=e.querySelector('.tcard,.ablk,.cblk'); o[key]={x:Math.round(r.left-s.left), y:Math.round(r.top-s.top), row:(Math.round(r.top-s.top)-12)/24, w:Math.round(r.width), cardW:card? Math.round(card.getBoundingClientRect().width) : null, h:Math.round(r.height), rows:Math.round(r.height/24*10)/10}; } return o; });
const find=(g,k)=>{ const e=Object.entries(g).find(([kk])=>kk.startsWith(k)); return e? e[1] : null; };
const note=(id,blocks)=>({id,title:'',created:1,updated:Date.now()+60000,blocks});
const frame=pg=>pg.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const tap=async(pg,x,y)=>{ await pg.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); await pg.waitForTimeout(60); await pg.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); };

/* P1 hysteresis: an unsized text is narrowed by the neighbours that cross its CURRENT rows, so two layouts satisfy the rules and a reload picks the other one */
{ const {ctx,pg}=await page(DESK);
  await seed(pg, note('p1',[{id:'A',col:1,row:2,text:LONG},{id:'B',col:8,row:4,text:'Бета'}]));
  out('sheet width', pg.W); const g0=await geo(pg); out('P1 loaded, B crosses the rows of A: A', find(g0,'Довгий'));
  const gb=await pg.locator('#sheet > .blk').filter({hasText:'Бета'}).locator('.grip').boundingBox();   // drag B six rows down
  await pg.mouse.move(gb.x+8,gb.y+10); await pg.mouse.down(); await pg.mouse.move(gb.x+8,gb.y+10+6*G,{steps:12}); await frame(pg); await pg.mouse.up(); await pg.waitForTimeout(500);
  const g1=await geo(pg); out('P1 B moved 6 rows down: A', find(g1,'Довгий')); out('P1 B', find(g1,'Бета'));
  await pg.reload(); await pg.waitForTimeout(600); const g2=await geo(pg); out('P1 after reload: A', find(g2,'Довгий')); out('P1 B', find(g2,'Бета'));
  out('P1 →', find(g1,'Довгий').h!==find(g2,'Довгий').h? 'HYSTERESIS: the layout differs before and after a reload' : 'same layout');
  await ctx.close(); }

/* P2 phone → desktop drift: proportional columns fold on a narrow sheet, the push lands in `row`, one keystroke saves it */
{ const B=[{id:'X',fx:0.05,row:2,text:'Лівий блок'},{id:'Y',fx:0.3,row:2,text:'Правий блок'}];
  const d=await page(DESK); await seed(d.pg, note('p2',B)); const gd=await geo(d.pg);
  out('P2 desktop (sheet '+d.pg.W+'): X row '+find(gd,'Лівий').row+' col≈'+Math.round((find(gd,'Лівий').x+18)/24)+', Y row '+find(gd,'Правий').row+' col≈'+Math.round((find(gd,'Правий').x+18)/24)); await d.ctx.close();
  const {ctx,pg}=await page(PHONE); await seed(pg, note('p2',B)); const gm=await geo(pg);
  out('P2 phone: X y '+find(gm,'Лівий').y+' x '+find(gm,'Лівий').x+', Y y '+find(gm,'Правий').y+' x '+find(gm,'Правий').x+' → '+(find(gm,'Лівий').y>find(gm,'Правий').y? 'the LEFT block went under the RIGHT one' : 'reading order kept'));
  const bx=await pg.locator('#sheet > .blk').filter({hasText:'Лівий'}).locator('.txt').boundingBox(); await tap(pg,bx.x+bx.width-4,bx.y+10); await pg.waitForTimeout(200); await pg.keyboard.type('!'); await pg.waitForTimeout(800);
  const st=await stored(pg,'p2'); out('P2 stored after one keystroke on the phone: '+st.blocks.map(b=>b.id+' row '+b.row).join(', ')+' → '+(st.blocks.some(b=>b.row!==2)? 'DRIFT: a row changed in storage; on the desktop the blocks are no longer side by side' : 'no drift'));
  await ctx.close(); }

/* P3 an area wider than the phone sheet is clamped, its child is not */
{ const {ctx,pg}=await page(PHONE);
  await seed(pg, note('p3',[{id:'A',fx:0.05,row:2,kind:'area',cw:29,title:'Широка'},{id:'k',parent:'A',col:20,row:0,text:'Дитина далеко'}]));
  const r=await pg.evaluate(()=>({sheet:document.getElementById('sheet').clientWidth, scrollW:document.documentElement.scrollWidth, card:Math.round(document.querySelector('.ablk').getBoundingClientRect().right), kid:Math.round(document.querySelector('.abody .blk').getBoundingClientRect().right)}));
  out('P3 phone, area cw 29 with a child at col 20', r); out('P3 →', r.kid>r.card? 'OVERFLOW: child right edge '+r.kid+' > area right '+r.card+(r.scrollW>r.sheet? ', the page scrolls horizontally to '+r.scrollW : '') : 'contained');
  await ctx.close(); }

/* P4 drag preview: the ghost keeps the height from the origin; at the destination the text rewraps and pushes more after the drop */
{ const {ctx,pg}=await page({...DESK, reducedMotion:'reduce'});
  await seed(pg, note('p4',[{id:'A',col:1,row:2,text:LONG},{id:'D',col:10,row:10,text:'Правий блок'},{id:'C',col:1,row:20,text:'Нижній блок'}]));
  const g0=await geo(pg); out('P4 before: A '+find(g0,'Довгий').rows+' rows, C y '+find(g0,'Нижній').y);
  const ga=await pg.locator('#sheet > .blk').filter({hasText:'Довгий'}).locator('.grip').boundingBox();
  await pg.mouse.move(ga.x+8,ga.y+10); await pg.mouse.down(); await pg.mouse.move(ga.x+8,ga.y+10+7*G,{steps:14}); await frame(pg); await pg.waitForTimeout(200);
  const mid=await pg.evaluate(()=>{ const s=document.getElementById('sheet').getBoundingClientRect(), gb=document.querySelector('.gbox.on'), c=[...document.querySelectorAll('#sheet > .blk')].find(e=>e.textContent.includes('Нижній')); return {ghostRows:Math.round(gb.offsetHeight/24), ghostBad:gb.classList.contains('bad'), cY:Math.round(c.getBoundingClientRect().top-s.top)}; });
  out('P4 during the drag (A over row 9)', mid); await pg.mouse.up(); await pg.waitForTimeout(600);
  const g1=await geo(pg); out('P4 after the drop: A '+find(g1,'Довгий').rows+' rows, '+find(g1,'Довгий').w+'px wide; C y '+find(g1,'Нижній').y);
  out('P4 →', (find(g1,'Довгий').rows>mid.ghostRows && find(g1,'Нижній').y!==mid.cY)? 'PREVIEW MISMATCH: ghost '+mid.ghostRows+' rows, dropped block '+find(g1,'Довгий').rows+' rows, C moved only after the drop' : 'preview matched');
  await ctx.close(); }

/* P6 load order: two stored blocks that collide at this width; the one later in the array stays */
for(const order of [['X','Y'],['Y','X']]){ const {ctx,pg}=await page(PHONE);
  const B={X:{id:'X',fx:0.05,row:2,text:'Ікс'},Y:{id:'Y',fx:0.3,row:2,text:'Ігрек'}}; await seed(pg, note('p6',order.map(k=>B[k]))); const g=await geo(pg);
  out('P6 stored order '+order.join(',')+': X y '+find(g,'Ікс').y+', Y y '+find(g,'Ігрек').y); await ctx.close(); }

/* P7 and P19 plastic push: a pushed block stays where it was pushed, and the gaps the user left are gone */
{ const {ctx,pg}=await page(DESK);
  await seed(pg, note('p19',[{id:'a',col:1,row:2,text:'Перший'},{id:'b',col:1,row:4,text:'Другий'},{id:'c',col:1,row:6,text:'Третій'}]));
  const rows=async()=>{ const g=await geo(pg); return ['Перший','Другий','Третій'].map(k=>find(g,k).row).join(','); };
  const r0=await rows(); await pg.locator('#sheet > .blk').filter({hasText:'Перший'}).locator('.txt').click(); await pg.keyboard.press('End');
  await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('x'); await pg.waitForTimeout(200); const r1=await rows();
  for(let i=0;i<3;i++) await pg.keyboard.press('Backspace'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); const r2=await rows();
  out('P7/P19 rows of three blocks: '+r0+' → the first grows to 3 lines: '+r1+' → back to 1 line: '+r2+' → '+(r2!==r0? 'PLASTIC: the push stays and the one-row gaps are gone' : 'restored'));
  await ctx.close(); }

/* P9 the collision threshold is 140px, not cells: at 24px text (grid 36) blocks four cells apart stand side by side, at 16px (grid 24) they collide */
for(const fs of [16,24]){ const {ctx,pg}=await page(DESK); const g=Math.round(fs*1.5);
  await seed(pg, note('p9',[{id:'L',col:1,row:2,text:'Лівий'},{id:'R',col:5,row:2,text:'Правий'}]), {textSys:false,textSheet:fs,textUi:1});
  const gg=await geo(pg); out('P9 text '+fs+'px (grid '+g+'): L y '+find(gg,'Лівий').y+', R y '+find(gg,'Правий').y+' → '+(find(gg,'Лівий').y!==find(gg,'Правий').y? 'they collide, one is pushed down' : 'side by side'));
  await ctx.close(); }

/* P10 a set width near the right edge: the column is allowed when the minimum width fits; the card is drawn narrower than cw */
{ const {ctx,pg}=await page(DESK); const maxCol=Math.floor((pg.W-24-140+18)/24);
  await seed(pg, note('p10',[{id:'S',col:maxCol-4,row:2,cw:20,text:'Широкий блок із заданою шириною 20 клітинок біля правого краю'}]));
  const g=find(await geo(pg),'Широкий'), st=await stored(pg,'p10');
  out('P10 sheet '+pg.W+'px, col '+(maxCol-4)+', cw 20 (card should be '+(20*24)+'px): card '+g.cardW+'px, stored cw '+st.blocks[0].cw+' → '+(g.cardW<20*24? 'SOFT WIDTH: cw kept in the model, not honoured on screen' : 'honoured'));
  await ctx.close(); }

/* P15 narrowing an area with its handle over a child: the child is not clamped */
{ const {ctx,pg}=await page({...DESK, reducedMotion:'reduce'});
  await seed(pg, note('p15',[{id:'A',col:1,row:2,kind:'area',cw:24,title:'Область'},{id:'k',parent:'A',col:14,row:0,text:'Правий блок усередині'}]));
  const area=pg.locator('.blk.is-area'); await area.locator('.ablk').hover(); const rz=await area.locator('.ablk > .rz').boundingBox();
  await pg.mouse.move(rz.x+rz.width/2, rz.y+rz.height/2); await pg.mouse.down(); await pg.mouse.move(rz.x+rz.width/2-10*G, rz.y+rz.height/2, {steps:10}); await frame(pg); await pg.mouse.up(); await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>{ const c=document.querySelector('.ablk').getBoundingClientRect(), k=document.querySelector('.abody .blk').getBoundingClientRect(); return {cardW:Math.round(c.width), cardRight:Math.round(c.right), kidRight:Math.round(k.right)}; }); const st=await stored(pg,'p15');
  out('P15 area narrowed to cw '+st.blocks.find(b=>b.id==='A').cw+' ('+r.cardW+'px), child at col '+st.blocks.find(b=>b.id==='k').col+': child right '+r.kidRight+' vs area right '+r.cardRight+' → '+(r.kidRight>r.cardRight? 'OVERFLOW by '+(r.kidRight-r.cardRight)+'px' : 'contained'));
  await ctx.close(); }

/* P5 cost: opening a note with N blocks, and one Enter in a text block (relayout → resolve) */
for(const N of [20,60,120]){ const {ctx,pg}=await page({viewport:{width:1920,height:1080}});
  const blocks=[]; for(let i=0;i<N;i++) blocks.push({id:'b'+i,col:1+(i%7)*9,row:2+Math.floor(i/7)*4,text:'Блок '+i+' короткий текст'});
  await seed(pg, note('p5',blocks)); const t0=Date.now(); await pg.reload({waitUntil:'commit', timeout:0}); await pg.waitForFunction(n=>document.querySelectorAll('.blk').length===n, N, {timeout:300000}); const open=Date.now()-t0;
  await pg.evaluate(()=>{ window.__t=[]; document.addEventListener('input',()=>{ window.__t0=performance.now(); },true); document.addEventListener('input',()=>{ window.__t.push(performance.now()-window.__t0); }); });
  await pg.locator('#sheet > .blk').first().locator('.txt').click(); await pg.keyboard.press('End'); for(let i=0;i<4;i++){ await pg.keyboard.press('Enter'); await pg.waitForTimeout(100); }
  out('P5 N='+N+': page load until every block is placed ≈ '+open+'ms; the input handler per Enter (ms): '+(await pg.evaluate(()=>window.__t.map(x=>Math.round(x)))).join(' '));
  await ctx.close(); }

await br.close(); await srv.close();
