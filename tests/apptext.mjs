import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const op=async(loc)=>Number(await loc.evaluate(e=>getComputedStyle(e).opacity));
const bg=async(loc)=>loc.evaluate(e=>getComputedStyle(e).backgroundColor);
const model=async(re)=>{ for(const n of await idbAll()){ const b=n.blocks.find(b=>new RegExp(re).test(b.text||'')||new RegExp(re).test(b.title||'')); if(b) return b; } return null; };
await pg.goto(new URL('../index.html', import.meta.url).href); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
const CL=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--handle'))+2);

/* ── текстовий блок: ручка розміру ─────────────────────────────────────── */
await pg.mouse.click(500,300); await pg.keyboard.type('Довгий текст для перевірки ручки розміру текстового блока на чистому аркуші'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
const blk=pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}); const card=blk.locator('.tcard'), txt=blk.locator('.txt'), rz=blk.locator('.rz');
const c0=await box(card);
ok('1a одна лінія, картка по ширині тексту, без класу sized: '+c0.w+'×'+c0.h, c0.h===24 && c0.w>500 && !(await card.evaluate(e=>e.classList.contains('sized'))));
await pg.mouse.move(100,100); await pg.waitForTimeout(200);
const opHidden=await op(rz); await txt.hover(); await pg.waitForTimeout(200); const opShown=await op(rz);
ok('1b ручка зʼявляється при наведенні на текст ('+opHidden+'→'+opShown+')', opHidden===0 && opShown===1);
// 1c поки в блоці курсор — ручки немає навіть при наведенні; після виходу з блока знову є
await txt.click(); await pg.waitForTimeout(200); const opFocused=await op(rz); await pg.keyboard.press('Escape'); await txt.hover(); await pg.waitForTimeout(200); const opAfter=await op(rz);
ok('1c під час набору ручка схована ('+opFocused+'), після виходу з блока знову видно при наведенні ('+opAfter+')', opFocused===0 && opAfter===1);
// 2 ширина: тягнемо ручку ліворуч на ~250px
{ const r=await box(rz); const cx=r.x+r.w/2, cy=r.y+r.h/2; await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx-100,cy,{steps:5}); await pg.waitForTimeout(50);
  const mid=await box(card); const resizing=await card.evaluate(e=>e.classList.contains('resizing'));
  ok('2a під час руху: клас resizing, ширина йде за курсором (не кратна сітці: '+mid.w+')', resizing && mid.w%24!==0 && mid.w<c0.w);
  await pg.mouse.move(cx-250,cy,{steps:5}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const c1=await box(card), t1=await box(txt); const m=await model('Довгий текст');
  ok('2b після відпускання: ширина кратна сітці ('+c1.w+'), текст переніс рядки ('+t1.h+'px), cw збережено ('+(m&&m.cw)+')', c1.w%24===0 && c1.w<c0.w-200 && t1.h>=48 && m && m.cw===c1.w/24 && !m.ch && (await card.evaluate(e=>e.classList.contains('sized'))));
  ok('2c текст заповнює всю фіксовану ширину (фон при наведенні = рамка розміру)', t1.w===c1.w); }
// 3 висота: тягнемо ручку вниз на 3 ряди
{ const r=await box(rz); const cx=r.x+r.w/2, cy=r.y+r.h/2; const t0=await box(txt); await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx,cy+3*24+4,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const t1=await box(txt), c1=await box(card); const m=await model('Довгий текст');
  ok('3a мінімальна висота: '+t0.h+'→'+t1.h+'px, ch='+(m&&m.ch)+', ширина не змінилась', t1.h===t0.h+72 && m && m.ch===t1.h/24 && c1.w%24===0);
  // менше за вміст — не можна: тягнемо високо вгору
  const r2=await box(rz); await pg.mouse.move(r2.x+9,r2.y+9); await pg.mouse.down(); await pg.mouse.move(r2.x+9, r2.y-300,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const t2=await box(txt); const m2=await model('Довгий текст');
  ok('3b нижче за вміст не стискається: висота = вмісту ('+t2.h+'), ch знято', t2.h===t0.h && m2 && !m2.ch && m2.cw); }
// 4 задана висота — «резерв»: блок під ним відсувається, коли резерв росте
{ const r=await box(rz); await pg.mouse.move(r.x+9,r.y+9); await pg.mouse.down(); await pg.mouse.move(r.x+9, r.y+96,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const c=await box(card); await pg.mouse.click(c.x+20, c.y+c.h+12); await pg.keyboard.type('нижній'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  const lowB=pg.locator('#sheet > .blk').filter({hasText:'нижній'}); const low0=await box(lowB.locator('.txt'));
  const r2=await box(rz); await pg.mouse.move(r2.x+9,r2.y+9); await pg.mouse.down(); await pg.mouse.move(r2.x+9, r2.y+9+48,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const low1=await box(lowB.locator('.txt')), c2=await box(card);
  ok('4 блок одразу під резервом ('+low0.y+' = '+(c.y+c.h)+'); резерв підріс на 2 ряди → блок зсунувся вниз ('+low0.y+'→'+low1.y+')', low0.y===c.y+c.h && c2.h===c.h+48 && low1.y===low0.y+48); }
// 5 перезавантаження зберігає розмір
{ const c=await box(card), t=await box(txt); await pg.reload(); await pg.waitForTimeout(400);
  const c2=await box(pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}).locator('.tcard')), t2=await box(pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}).locator('.txt'));
  ok('5 після перезавантаження ширина й висота ті самі ('+c.w+'×'+t.h+')', c2.w===c.w && t2.h===t.h && t2.h>72); }
// 6 перенос блока: контур має фіксовану ширину
{ const b=pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}); const c=await box(b.locator('.tcard')); const g=await box(b.locator('.grip')); await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10,g.y+12+240,{steps:8}); await pg.waitForTimeout(80);
  const gb=await box(pg.locator('.gbox'));
  ok('6a під час перетягування контур такої самої ширини, як блок ('+gb.w+' = '+(c.w+CL)+')', gb.w===c.w+CL);
  await pg.mouse.up(); await pg.waitForTimeout(300);
  const c2=await box(b.locator('.tcard')); ok('6b після переносу розмір той самий', c2.w===c.w); }
// 7 подвійний клік по ручці — авто
{ const b=pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}); const r=b.locator('.rz'); await b.locator('.txt').hover(); await r.dblclick(); await pg.waitForTimeout(350);
  const c=await box(b.locator('.tcard')), t=await box(b.locator('.txt')); const m=await model('Довгий текст');
  ok('7 авто: картка знову по тексту в один рядок, cw/ch зняті', t.h===24 && c.w>500 && m && !m.cw && !m.ch && !(await b.locator('.tcard').evaluate(e=>e.classList.contains('sized')))); }
// 8 задана ширина — тверда: сусід, кинутий у її межі, виштовхує блок униз, а не звужує його
{ const b=pg.locator('#sheet > .blk').filter({hasText:'Довгий текст'}); const r=await box(b.locator('.rz')); await pg.mouse.move(r.x+9,r.y+9); await pg.mouse.down(); await pg.mouse.move(r.x+9-120,r.y+9,{steps:5}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const c=await box(b.locator('.tcard')); await pg.mouse.click(c.x+20, c.y+c.h+120); await pg.keyboard.type('сусід'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  const nb=pg.locator('#sheet > .blk').filter({hasText:'сусід'}); const g=await box(nb.locator('.grip')); await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10+300, c.y+12,{steps:10}); await pg.mouse.up(); await pg.waitForTimeout(400);
  const c2=await box(b.locator('.tcard')); const n=await box(nb.locator('.txt')); const m=await model('Довгий текст');
  ok('8 сусід кинуто в межі заданої ширини: ширина та сама ('+c.w+'→'+c2.w+'), блок пішов униз ('+c.y+'→'+c2.y+'), сусід на його рядку ('+n.y+')', c2.w===c.w && c2.y>c.y && n.y===c.y && m && m.cw===c.w/24); }

/* ── область: шапка без підпису, назва по центру, кнопки при наведенні ── */
await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
await pg.mouse.move(500,500); await pg.mouse.down(); await pg.mouse.move(1140,640,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
const area=pg.locator('.blk.is-area').first();
ok('9a підпису «Область» у шапці немає', (await area.locator('.akind').count())===0 && !/Область/.test(await area.locator('.cbar').innerText()));
await pg.keyboard.type('Нотатки'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); await pg.mouse.move(100,100); await pg.waitForTimeout(200);
{ const a=await box(area.locator('.ablk')); const t=await area.locator('.ctitle').evaluate(e=>{ const r=document.createRange(); r.selectNodeContents(e); const b=r.getBoundingClientRect(); return {x:b.left,w:b.width,y:b.top}; });
  const tc=t.x+t.w/2, ac=a.x+a.w/2;
  ok('9b широка область ('+a.w+'px): назва по центру шапки (центр тексту '+Math.round(tc)+' ≈ '+Math.round(ac)+')', Math.abs(tc-ac)<=3 && t.y<a.y+32); }
// вузька область — назва власним рядком, теж по центру
await pg.mouse.move(500,720); await pg.mouse.down(); await pg.mouse.move(820,860,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
await pg.keyboard.type('Вузька'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); await pg.mouse.move(100,100); await pg.waitForTimeout(200);
{ const na=pg.locator('.blk.is-area').nth(1); const a=await box(na.locator('.ablk')); const t=await na.locator('.ctitle').evaluate(e=>{ const r=document.createRange(); r.selectNodeContents(e); const b=r.getBoundingClientRect(); return {x:b.left,w:b.width,y:b.top}; });
  const tc=t.x+t.w/2, ac=a.x+a.w/2;
  ok('9c вузька область ('+a.w+'px): назва власним рядком під кнопками і по центру ('+Math.round(tc)+' ≈ '+Math.round(ac)+')', Math.abs(tc-ac)<=3 && t.y>a.y+28); }
// середня область (~500px): назва в самій шапці по центру, як у коду
await pg.mouse.move(640,160); await pg.mouse.down(); await pg.mouse.move(1140,300,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
await pg.keyboard.type('Запуск: що зробити до пʼятниці'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150); await pg.mouse.move(100,100); await pg.waitForTimeout(200);
{ const na=pg.locator('.blk.is-area').nth(2); const a=await box(na.locator('.ablk')); const t=await na.locator('.ctitle').evaluate(e=>{ const r=document.createRange(); r.selectNodeContents(e); const b=r.getBoundingClientRect(); return {x:b.left,w:b.width,y:b.top}; });
  const tc=t.x+t.w/2, ac=a.x+a.w/2;
  ok('9d середня область ('+a.w+'px): назва в шапці (Δy '+(t.y-a.y)+'), по центру картки ('+Math.round(tc)+' ≈ '+Math.round(ac)+')', Math.abs(tc-ac)<=3 && t.y<a.y+32 && a.w>420 && a.w<560); }
// 10 кнопки: приховані, при наведенні на область — видно; «⋯» замість окремих кнопок розгрупування/видалення
{ const more=area.locator('.cb.more'), col=area.locator('.cb.colorb'), fold=area.locator('.cb.fold'); const o0=[await op(more),await op(col),await op(fold)];
  await area.locator('.abody').hover({position:{x:200,y:60}}); await pg.waitForTimeout(200); const o1=[await op(more),await op(col)];
  ok('10 «⋯» і колір приховані ('+o0.slice(0,2)+'), згортання видно ('+o0[2]+'); при наведенні на область — видно ('+o1+'); окремих кнопок видалення/розгрупування у шапці немає', o0[0]===0 && o0[1]===0 && o0[2]===1 && o1[0]===1 && o1[1]===1 && (await area.locator('.cbar .ungroup, .cbar .del').count())===0); }
// 11 наведення на область не підсвічує блоки всередині
{ const a=await box(area.locator('.ablk')); await pg.mouse.click(a.x+60, a.y+70); await pg.keyboard.type('дитина'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  const kid=area.locator('.abody .blk').first(); await area.locator('.abody').hover({position:{x:a.w-60,y:a.h-70}}); await pg.waitForTimeout(200); const b0=await bg(kid.locator('.txt')); const g0=await op(kid.locator('.grip'));
  await kid.locator('.txt').hover(); await pg.waitForTimeout(200); const b1=await bg(kid.locator('.txt')); const g1=await op(kid.locator('.grip'));
  ok('11 наведення на область: дитина без фону й ручки ('+b0+', '+g0+'); наведення на дитину: фон і ручка є ('+g1+')', /rgba\(0, 0, 0, 0\)/.test(b0) && g0===0 && b1!==b0 && g1===1); }

await pg.screenshot({path:OUT+'/apptext-final.png',clip:{x:280,y:60,width:1000,height:840}});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
