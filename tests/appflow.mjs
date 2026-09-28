import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const dragTo=async(x,y,tx,ty)=>{ await touch('touchStart',[{x,y}]); for(let i=1;i<=10;i++){ await pg.waitForTimeout(40); await touch('touchMove',[{x:x+(tx-x)*i/10,y:y+(ty-y)*i/10}]); } await pg.waitForTimeout(80); await touch('touchEnd',[]); };
const idbNote=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readonly').objectStore('notes').get('flow1'); t.onsuccess=()=>{ d.close(); res(t.result); }; }; }));
const tops=async()=>{ const els=await pg.locator('#sheet > .blk').all(); const out=[]; for(const e of els){ const b=await box(e); const cls=await e.getAttribute('class'); out.push({text:/is-code/.test(cls)? 'код' : /is-area/.test(cls)? 'область' : (await e.innerText()).trim().slice(0,12), ...b}); } return out.sort((a,b)=>a.y-b.y); };
const SEED={id:'flow1',title:'',created:1,updated:Date.now(),blocks:[
  {id:'b1',fx:0.05,row:2,text:'Перший'},
  {id:'b2',fx:0.55,row:2,text:'Другий праворуч'},
  {id:'b3',fx:0.05,row:5,kind:'code',lang:'javascript',text:'const a=1;\nconst b=2;'},
  {id:'A',fx:0.55,row:5,kind:'area',cw:12,title:'Область'},
  {id:'k1',parent:'A',col:0,row:0,text:'Дитина 1'},
  {id:'k2',parent:'A',col:0,row:2,text:'Дитина 2'},
  {id:'b4',fx:0.3,row:30,text:'Четвертий далеко внизу'}]};
await pg.goto(new URL('../index.html', import.meta.url).href); await pg.waitForTimeout(400);
await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
SEED.updated=Date.now()+60000;   // новіша за порожню нотатку, створену при першому відкритті → відкриється саме вона
await pg.evaluate(seed=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); t.objectStore('notes').put(seed); t.oncomplete=()=>{ d.close(); res(); }; }; }), SEED);
await pg.evaluate(()=>localStorage.clear()); await pg.reload(); await pg.waitForTimeout(600);   // без «поточної» нотатки відкриється найсвіжіша — засіяна
// 1 стрічка: одна колонка, порядок читання, один ряд між блоками
{ const t=await tops(); const order=t.map(o=>o.text); const sameX=t.every(o=>o.x===t[0].x); let gapsOk=true; for(let i=1;i<t.length;i++){ const gap=t[i].y-(t[i-1].y+t[i-1].h); if(gap<22||gap>48||((t[i].y-t[i-1].y)%24)!==0) gapsOk=false; }   // картки коротші за свої ряди на кілька px
  ok('1 стрічка: '+order.join(' → ')+'; лівий край однаковий, ширина на весь екран, між блоками один ряд ('+t.map(o=>o.x+'/'+o.w+'/'+o.y+'+'+o.h).join(' ')+')', await pg.locator('#sheet').evaluate(e=>e.classList.contains('flow')) && order.join('|')==='Перший|Другий право|код|область|Четвертий да' && sameX && gapsOk && t.every(o=>o.w===t[0].w) && t[0].w>300); }
// 2 область: картка на всю ширину, діти однією колонкою
{ const area=pg.locator('.blk.is-area').first(); const a=await box(area); const kids=await area.locator('.abody > .blk').all(); const k=[]; for(const e of kids) k.push(await box(e)); k.sort((p,q)=>p.y-q.y);
  ok('2 область на всю ширину, діти стовпчиком з одним рядом між ними', a.w>300 && k.length===2 && k[0].x===k[1].x && (k[1].y-(k[0].y+k[0].h))===24); }
// 3 модель не змінюється від показу і від правки тексту
await pg.locator('.blk .txt').filter({hasText:'Перший'}).tap(); await pg.keyboard.press('End'); await pg.keyboard.type(' +'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
{ const n=await idbNote(); const same=SEED.blocks.every(sb=>{ const b=n.blocks.find(x=>x.id===sb.id); return b && b.row===sb.row && (sb.parent? b.col===sb.col && b.parent===sb.parent : Math.abs(b.fx-sb.fx)<1e-9); });
  ok('3 після правки тексту ряди й позиції всіх блоків у сховищі ті самі, що на компʼютері', same && /Перший \+/.test(n.blocks.find(b=>b.id==='b1').text)); }
// 4 утримання в проміжку між першим і другим → блок між ними; у моделі — той самий ряд, позиція між сусідами
{ const t=await tops(); const first=t[0]; await hold(200, first.y+first.h+12); await pg.waitForTimeout(200); await pg.keyboard.type('Вставлений'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const t2=await tops(); const n=await idbNote(); const nb=n.blocks.find(b=>/Вставлений/.test(b.text));
  ok('4 вставлений блок став другим у стрічці; модель: ряд 2, позиція між 0.05 і 0.55 ('+(nb&&nb.row)+', '+(nb&&nb.fx.toFixed(2))+')', t2[1].text==='Вставлений' && nb && nb.row===2 && nb.fx>0.05 && nb.fx<0.55); }
// 5 «+» додає в кінець стрічки
{ const f=await box(pg.locator('#fab')); await tap(f.x+f.w/2,f.y+f.h/2); await pg.waitForTimeout(250); await pg.keyboard.type('Останній'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const t=await tops(); const n=await idbNote(); const nb=n.blocks.find(b=>/Останній/.test(b.text));
  ok('5 «+»: блок останній у стрічці, модель — під найнижчим блоком (ряд '+(nb&&nb.row)+')', t[t.length-1].text==='Останній' && nb && nb.row===32); }
// 6 перенос за ручку: «Четвертий» на самий верх
{ const four=pg.locator('#sheet > .blk').filter({hasText:'Четвертий'}); const g=await box(four.locator('.grip')); const first=(await tops())[0];
  await dragTo(g.x+g.w/2, g.y+g.h/2, g.x+g.w/2, first.y-10); await pg.waitForTimeout(600);
  const t=await tops(); const n=await idbNote(); const nb=n.blocks.find(b=>b.id==='b4');
  ok('6 перенесений блок став першим; модель: ряд 2, позиція перед першим ('+(nb&&nb.row)+', '+(nb&&nb.fx.toFixed(3))+')', t[0].text==='Четвертий да' && nb && nb.row===2 && nb.fx<0.05); }
// 7 перенос у область: «Другий праворуч» під другу дитину
{ const two=pg.locator('#sheet > .blk').filter({hasText:'Другий'}); const g=await box(two.locator('.grip')); const area=pg.locator('.blk.is-area').first(); const a=await box(area.locator('.ablk'));
  await dragTo(g.x+g.w/2, g.y+g.h/2, a.x+a.w/2, a.y+a.h-20); await pg.waitForTimeout(600);
  const kids=await area.locator('.abody > .blk').all(); const names=[]; for(const e of kids){ names.push({t:(await e.innerText()).trim(), y:(await box(e)).y}); } names.sort((p,q)=>p.y-q.y);
  const n=await idbNote(); const nb=n.blocks.find(b=>b.id==='b2');
  ok('7 блок з аркуша заїхав в область останнім ('+names.map(o=>o.t).join(' → ')+'); модель: parent, col 0, ряд '+(nb&&nb.row), names.length===3 && names[2].t==='Другий праворуч' && nb && nb.parent==='A' && nb.col===0 && nb.row===4); }
// 8 огляд «як на компʼютері»: полотно 1024 у зменшенні, блоки в різних колонках; назад — стрічка. Кнопка показує стан (aria-pressed) і підказку, куди перемкне
{ const vb=()=>pg.locator('#viewBtn').evaluate(e=>({p:e.getAttribute('aria-pressed'), t:e.title}));
  await pg.locator('#viewBtn').tap(); await pg.waitForTimeout(400);
  const zoom=await pg.locator('#sheet').evaluate(e=>({z:getComputedStyle(e).zoom, w:e.clientWidth, ov:e.classList.contains('overview'), fl:e.classList.contains('flow')}));
  const t=await tops(); const xs=new Set(t.map(o=>o.x));
  ok('8a огляд: zoom '+zoom.z+', ширина полотна '+zoom.w+', блоки в різних колонках ('+xs.size+')', zoom.ov && !zoom.fl && parseFloat(zoom.z)<1 && zoom.w===1024 && xs.size>=2 && !(await pg.locator('#fab').isVisible()));
  { const v=await vb(); ok('8b кнопка огляду натиснута (aria-pressed '+v.p+'), підказка «'+v.t+'»', v.p==='true' && v.t==='Показати стрічкою'); }
  await pg.locator('#viewBtn').tap(); await pg.waitForTimeout(400);
  ok('8c назад у стрічку', await pg.locator('#sheet').evaluate(e=>e.classList.contains('flow') && !e.classList.contains('overview') && !e.style.zoom) && await pg.locator('#fab').isVisible());
  { const v=await vb(); ok('8d кнопка знову відпущена (aria-pressed '+v.p+'), підказка «'+v.t+'»', v.p==='false' && v.t==='Показати як на компʼютері'); } }
// 9 широкий екран → полотно; вузький → стрічка
{ await pg.setViewportSize({width:900,height:844}); await pg.waitForTimeout(400); const wide=await pg.locator('#sheet').evaluate(e=>e.classList.contains('flow')); const t=await tops(); const xs=new Set(t.map(o=>o.x));
  await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(400); const narrow=await pg.locator('#sheet').evaluate(e=>e.classList.contains('flow'));
  ok('9 на ширині 900 — полотно (колонок: '+xs.size+'), на 390 — знову стрічка', !wide && xs.size>=2 && narrow); }
// 10 після перезавантаження порядок стрічки відповідає моделі
{ await pg.reload(); await pg.waitForTimeout(600); const t=await tops();
  ok('10 після перезавантаження: '+t.map(o=>o.text).join(' → '), t.map(o=>o.text).join('|')==='Четвертий да|Перший +|Вставлений|код|область|Останній'); }
await pg.screenshot({path:OUT+'/appflow-final.png',fullPage:true});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
