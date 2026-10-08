import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=SITE;
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
/* ── телефон: системний Back ─────────────────────────────────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
  const back=async()=>{ await pg.evaluate(()=>history.back()); await pg.waitForTimeout(350); };
  const st=()=>pg.evaluate(()=>({d:sheetDebug.navDepth(), top:sheetDebug.navTop(), h:(history.state&&history.state.d)||0}));
  const sideOpen=()=>pg.locator('.app').evaluate(e=>e.classList.contains('open'));
  const blk=t=>pg.locator('#sheet > .blk').filter({hasText:t});
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  // блоки для сценаріїв
  await hold(80,300); await pg.waitForTimeout(250); await pg.keyboard.type('Перший блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  // 1 панель нотаток: відкрити → запис в історії; Back закриває; відкрити і закрити з інтерфейсу → запису немає
  { const s0=await st(); await tapEl(pg.locator('#sideBtn')); await pg.waitForTimeout(350); const s1=await st(), open1=await sideOpen(); await back(); const s2=await st(), open2=await sideOpen();
    await tapEl(pg.locator('#sideBtn')); await pg.waitForTimeout(350); await tap(380,600); await pg.waitForTimeout(400); const s3=await st(), open3=await sideOpen();   // дотик по підкладці праворуч від панелі
    ok('1 панель: до '+JSON.stringify(s0)+'; відкрито '+open1+' '+JSON.stringify(s1)+'; Back → закрито '+(!open2)+' '+JSON.stringify(s2)+'; закриття підкладкою → '+(!open3)+' '+JSON.stringify(s3), s0.d===0 && open1 && s1.d===1 && s1.top==='side' && s1.h===1 && !open2 && s2.d===0 && s2.h===0 && !open3 && s3.d===0 && s3.h===0); }
  // 2 меню «⋯» шапки: Back закриває; вибір пункту знімає запис
  { await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const s1=await st(), m1=await pg.locator('.amenu.hm').count(); await back(); const s2=await st(), m2=await pg.locator('.amenu.hm').count();
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.hm .mi').filter({hasText:'Сітка'})); await pg.waitForTimeout(400); const s3=await st(), m3=await pg.locator('.amenu.hm').count();
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.hm .mi').filter({hasText:'Сітка'})); await pg.waitForTimeout(300);
    ok('2 меню шапки: відкрито '+JSON.stringify(s1)+' ('+m1+'); Back → закрито ('+m2+') '+JSON.stringify(s2)+'; вибір пункту → '+m3+' '+JSON.stringify(s3), m1===1 && s1.top==='menu' && s1.h===1 && m2===0 && s2.d===0 && s2.h===0 && m3===0 && s3.d===0 && s3.h===0); }
  // 3 режим положення: Back виходить; «Готово» знімає запис
  { await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300); const s1=await st(), sel1=await blk('Перший').evaluate(e=>e.classList.contains('sel')); await back(); const s2=await st(), sel2=await blk('Перший').evaluate(e=>e.classList.contains('sel'));
    await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300); await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(400); const s3=await st();
    ok('3 режим положення: '+sel1+' '+JSON.stringify(s1)+'; Back → '+(!sel2)+' '+JSON.stringify(s2)+'; «Готово» → '+JSON.stringify(s3), sel1 && s1.top==='sel' && s1.h===1 && !sel2 && s2.d===0 && s2.h===0 && s3.d===0 && s3.h===0); }
  // 4 обзор «як на компʼютері»: Back вимикає
  { await tapEl(pg.locator('#viewBtn')); await pg.waitForTimeout(300); const s1=await st(), ov1=await pg.locator('#sheet').evaluate(e=>e.classList.contains('overview')); await back(); const s2=await st(), ov2=await pg.locator('#sheet').evaluate(e=>e.classList.contains('overview'));
    await tapEl(pg.locator('#viewBtn')); await pg.waitForTimeout(300); await tapEl(pg.locator('#viewBtn')); await pg.waitForTimeout(400); const s3=await st();
    ok('4 обзор: '+ov1+' '+JSON.stringify(s1)+'; Back → '+(!ov2)+' '+JSON.stringify(s2)+'; кнопкою назад → '+JSON.stringify(s3), ov1 && s1.top==='view' && s1.h===1 && !ov2 && s2.d===0 && s2.h===0 && s3.d===0 && s3.h===0); }
  // 5 маршрут: панель → пошук → прокрутка → відкрити → Back повертає панель із запитом і прокруткою → Back ховає панель → у нотатці, записів немає
  { await pg.evaluate(()=>{ for(let i=1;i<=40;i++){ const n={id:'t'+i,title:'Тест '+i,blocks:[{id:'b'+i,row:2,col:1,text:'нотатка номер '+i+(i===17? ' шукана' : '')}],created:Date.now()-i*1000,updated:Date.now()-i*1000}; sheetDebug.idb.put? 0 : 0; } });
    await pg.evaluate(seed=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); const o=t.objectStore('notes'); for(let i=1;i<=40;i++) o.put({id:'t'+i,title:'Тест '+i,blocks:[{id:'b'+i,row:2,col:1,text:'нотатка номер '+i+(i===17? ' шукана' : '')}],created:Date.now()-i*1000,updated:Date.now()-i*1000}); t.oncomplete=()=>{ d.close(); res(); }; }; })); await pg.reload(); await pg.waitForTimeout(500);
    await tapEl(pg.locator('#sideBtn')); await pg.waitForTimeout(350); await pg.fill('#q','номер'); await pg.waitForTimeout(300); const n5=await pg.locator('#list .item').count();
    await pg.locator('#list').evaluate(e=>{ e.scrollTop=600; }); await pg.waitForTimeout(100); const sc0=await pg.locator('#list').evaluate(e=>e.scrollTop);
    const it=pg.locator('#list .item').filter({hasText:'шукана'}); await it.scrollIntoViewIfNeeded(); const sc1=await pg.locator('#list').evaluate(e=>e.scrollTop); await tapEl(it); await pg.waitForTimeout(500);
    const s1=await st(), open1=await sideOpen(), opened=(await pg.locator('#sheet .blk').filter({hasText:'шукана'}).count())===1;
    await back(); const s2=await st(), open2=await sideOpen(), q2=await pg.inputValue('#q'), sc2=await pg.locator('#list').evaluate(e=>e.scrollTop), n2=await pg.locator('#list .item').count();
    await back(); const s3=await st(), open3=await sideOpen(), still=(await pg.locator('#sheet .blk').filter({hasText:'шукана'}).count())===1;
    ok('5 маршрут: результатів '+n5+', прокрутка '+sc1+'; відкрито «шукана» ('+opened+'), панель схована ('+(!open1)+') '+JSON.stringify(s1)+'; Back → панель ('+open2+'), запит «'+q2+'», прокрутка '+sc2+', результатів '+n2+' '+JSON.stringify(s2)+'; Back → панель схована ('+(!open3)+'), нотатка та сама ('+still+') '+JSON.stringify(s3), n5===40 && sc1>0 && opened && !open1 && s1.top==='note' && s1.d===2 && s1.h===2 && open2 && q2==='номер' && Math.abs(sc2-sc1)<=2 && n2===40 && s2.d===1 && s2.h===1 && !open3 && still && s3.d===0 && s3.h===0 && sc0>=0); }
  // 6 доступність: у кожної кнопки є імʼя; стрілки ходять по панелі положення; Esc виходить із режиму положення
  { const noName=await pg.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>!(b.textContent.trim()||b.getAttribute('aria-label')||b.getAttribute('title'))).map(b=>b.className||b.id).slice(0,8));
    await tapEl(blk('шукана').locator('.grip')).catch(()=>{}); await pg.waitForTimeout(300); const inSel=await pg.locator('#blockbar').isVisible();
    await pg.locator('#blockbar [data-mv="left"]').focus(); await pg.keyboard.press('ArrowRight'); const f1=await pg.evaluate(()=>document.activeElement.dataset.mv); await pg.keyboard.press('End'); const f2=await pg.evaluate(()=>document.activeElement.dataset.mv); await pg.keyboard.press('Home'); const f3=await pg.evaluate(()=>document.activeElement.dataset.mv); await pg.keyboard.press('ArrowLeft'); const f4=await pg.evaluate(()=>document.activeElement.dataset.mv);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); const left=await pg.locator('#blockbar').isHidden(), s=await st();
    ok('6 доступність: кнопок без імені '+noName.length+(noName.length? ' ('+noName.join(', ')+')' : '')+'; панель положення ('+inSel+'): → '+f1+', End '+f2+', Home '+f3+', ← '+f4+'; Esc вийшов ('+left+') '+JSON.stringify(s), noName.length===0 && inSel && f1==='up' && f2==='done' && f3==='left' && f4==='done' && left && s.d===0 && s.h===0); }
  console.log(errs.length? errs.join('\n') : '✓ без помилок (телефон)'); if(errs.length) fails++; await ctx.close(); }
/* ── компʼютер: панель не накладення, меню — так ───────────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const st=()=>pg.evaluate(()=>({d:sheetDebug.navDepth(), top:sheetDebug.navTop(), h:(history.state&&history.state.d)||0}));
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.locator('#sideBtn').click(); await pg.waitForTimeout(200); const s1=await st(); await pg.locator('#sideBtn').click(); await pg.waitForTimeout(200);
  await pg.mouse.move(500,260); await pg.mouse.down(); await pg.mouse.move(900,400,{steps:6}); await pg.mouse.up(); await pg.waitForTimeout(200); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  const area=pg.locator('.blk.is-area').first(); await area.locator('.ablk').hover(); await area.locator('.cb.more').click(); await pg.waitForTimeout(150); const s2=await st(), m2=await pg.locator('.amenu').count(); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); const s3=await st(), m3=await pg.locator('.amenu').count();
  const rm=await pg.evaluate(()=>{ const m=matchMedia('(prefers-reduced-motion: reduce)'); return m.matches; });
  ok('7 компʼютер: панель не робить записів '+JSON.stringify(s1)+'; меню області — запис '+JSON.stringify(s2)+' ('+m2+'), Esc знімає '+JSON.stringify(s3)+' ('+m3+')', s1.d===0 && s1.h===0 && s2.top==='amenu' && s2.h===1 && m2===1 && s3.d===0 && s3.h===0 && m3===0 && rm===false);
  await pg.screenshot({path:OUT+'/appnav-desktop.png'});
  console.log(errs.length? errs.join('\n') : '✓ без помилок (компʼютер)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
