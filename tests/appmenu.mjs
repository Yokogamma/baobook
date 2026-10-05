import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=new URL('../index.html', import.meta.url).href;
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
/* ── дотик ──────────────────────────────────────────────────────────────── */
{ const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,permissions:['clipboard-read','clipboard-write']}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
  const vis=loc=>loc.isVisible(); const blk=t=>pg.locator('#sheet > .blk').filter({hasText:t});
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  // 1 шапка на дотику: чотири кнопки по 44px, рідкісні — у «⋯»; назва не зникає на 320px
  { const ids=await pg.evaluate(()=>[...document.querySelectorAll('.top .tb')].filter(b=>getComputedStyle(b).display!=='none' && !b.hidden).map(b=>b.id+':'+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height)));
    await pg.setViewportSize({width:320,height:568}); await pg.waitForTimeout(300); const ttl=await box(pg.locator('#ttl')); const tools=await box(pg.locator('.tools')); await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(300);
    ok('1 шапка: видимі '+ids.join(', ')+'; на 320px назва '+ttl.w+'px, кнопки в межах екрана ('+(tools.x+tools.w)+')', ids.join(',')==='sideBtn:44x44,viewBtn:44x44,areaBtn:44x44,moreBtn:44x44' && ttl.w>=60 && tools.x+tools.w<=320); }
  // 2 меню «⋯» шапки: чотири пункти ≥44px, «Тема» перемикає тему, «Сітка» — сітку, дотик поза меню закриває
  { await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const items=await pg.locator('.amenu.hm .mi').allInnerTexts(); const hs=await pg.evaluate(()=>[...document.querySelectorAll('.amenu.hm .mi')].map(b=>Math.round(b.getBoundingClientRect().height)));
    const th0=await pg.locator('#themeBtn').getAttribute('data-th'); await tapEl(pg.locator('.amenu.hm .mi').nth(2)); await pg.waitForTimeout(250); const th1=await pg.locator('#themeBtn').getAttribute('data-th');
    ok('2a меню шапки: '+items.map(t=>t.replace(/\s+/g,' ')).join(' | ')+' (висоти '+hs.join('/')+'); «Тема» перемкнула '+th0+' → '+th1+', меню закрилось', items.length===4 && hs.every(h=>h>=44) && th0!==th1 && (await pg.locator('.amenu.hm').count())===0 && (await pg.locator('#moreBtn').getAttribute('aria-expanded'))==='false');
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.hm .mi').nth(1)); await pg.waitForTimeout(250); const nogrid=await pg.locator('#sheet').evaluate(e=>e.classList.contains('nogrid'));
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tap(200,500); await pg.waitForTimeout(250);
    ok('2b «Сітка» вимкнула сітку ('+nogrid+'); дотик поза меню закриває його', nogrid && (await pg.locator('.amenu.hm').count())===0); await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(200); await tapEl(pg.locator('.amenu.hm .mi').nth(1)); await pg.waitForTimeout(250); }
  // 3 «⋯» у блока: видно, зона 44, меню з трьох дій
  await hold(80,300); await pg.waitForTimeout(250); await pg.keyboard.type('Перший блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await hold(80,420); await pg.waitForTimeout(250); await pg.keyboard.type('Другий блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  { const bm=blk('Перший').locator('.bact'); const op=await bm.evaluate(e=>getComputedStyle(e).opacity); const r=await box(bm);
    const hit=await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [r.x+r.w+8, r.y-8]);   // кут зони 44 за межами значка
    await tapEl(bm); await pg.waitForTimeout(250); const items=await pg.locator('.amenu.bm .mi').allInnerTexts();
    ok('3 «⋯» у блока: прозорість '+op+', значок '+r.w+'×'+r.h+', зона 44 ('+hit+'); меню: '+items.map(t=>t.replace(/\s+/g,' ')).join(' | '), parseFloat(op)>=0.5 && r.w>=20 && hit==='bact' && items.length===3 && /Копіювати/.test(items[0]) && /Виділити/.test(items[1]) && /Видалити/.test(items[2]) && !(await pg.locator('.blk .txt').evaluateAll(a=>a.some(e=>e===document.activeElement)))); }
  // 4 «Копіювати блок» → буфер; «Виділити» → режим положення; «Видалити» → плашка, «Скасувати» повертає на те саме місце
  { await pg.evaluate(()=>navigator.clipboard.writeText('')); await tapEl(pg.locator('.amenu.bm .mi').nth(0)); await pg.waitForTimeout(400);
    ok('4a «Копіювати блок»: у буфері «'+(await pg.evaluate(()=>navigator.clipboard.readText()))+'»', (await pg.evaluate(()=>navigator.clipboard.readText())).trim()==='Перший блок' && (await pg.locator('.amenu.bm').count())===0);
    await tapEl(blk('Перший').locator('.bact')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.bm .mi').nth(1)); await pg.waitForTimeout(300);
    ok('4b «Виділити»: рамка й панель стрілок', await blk('Перший').evaluate(e=>e.classList.contains('sel')) && await vis(pg.locator('#blockbar'))); await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300);
    const before=await box(blk('Другий').locator('.txt')); await tapEl(blk('Другий').locator('.bact')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.bm .mi').nth(2)); await pg.waitForTimeout(400);
    const gone=(await blk('Другий').count())===0, plaque=await vis(pg.locator('#undo')), msg=await pg.locator('#undo .umsg').innerText();
    await tapEl(pg.locator('#undo .ubtn')); await pg.waitForTimeout(500); const after=await box(blk('Другий').locator('.txt'));
    ok('4c «Видалити»: блок зник ('+gone+'), плашка «'+msg+'»; «Скасувати» повернув на те саме місце ('+before.x+','+before.y+' → '+(after&&after.x)+','+(after&&after.y)+')', gone && plaque && /Другий блок/.test(msg) && after && after.x===before.x && after.y===before.y); }
  // 5 зона ручки ⋮⋮ 44px ліворуч і по вертикалі, не над текстом
  { const g=await box(blk('Перший').locator('.grip')); const left=await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [g.x-8, g.y+g.h/2]); const over=await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [g.x+g.w+6, g.y+g.h/2]);
    ok('5 ручка: ліворуч від значка — ручка ('+left+'), над текстом — текст ('+over+')', left==='grip' && over==='txt'); }
  // 6 висота кнопок шапки картки коду на дотику
  { await hold(80,600); await pg.waitForTimeout(250); await pg.evaluate(()=>{ const dt=new DataTransfer(); dt.setData('text/plain','function a(){\n  return 1;\n}\nfunction b(){\n  return 2;\n}'); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }); await pg.waitForTimeout(300);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); const cbs=await pg.evaluate(()=>[...document.querySelectorAll('.cb')].map(b=>Math.round(b.getBoundingClientRect().height)).filter(h=>h>0));
    ok('6 кнопки шапки блока коду на дотику ≥44px ('+(cbs.length? cbs.join('/') : 'блок коду не створився')+')', cbs.length>0 && cbs.every(h=>h>=44)); }
  await pg.screenshot({path:OUT+'/appmenu-touch.png'});
  console.log(errs.length? errs.join('\n') : '✓ без помилок (дотик)'); if(errs.length) fails++; await ctx.close(); }
/* ── компʼютер: нічого не змінилось ───────────────────────────────────── */
{ const ctx=await br.newContext({viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.mouse.click(500,300); await pg.keyboard.type('на компʼютері'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const bm=await pg.locator('.bact').evaluate(e=>getComputedStyle(e).display), more=await pg.locator('#moreBtn').evaluate(e=>getComputedStyle(e).display), tb=await pg.locator('#gridBtn').evaluate(e=>({d:getComputedStyle(e).display, h:Math.round(e.getBoundingClientRect().height)}));
  ok('7 компʼютер: «⋯» у блока не показується ('+bm+'), «⋯» шапки теж ('+more+'), кнопки шапки звичайні ('+tb.d+', '+tb.h+'px)', bm==='none' && more==='none' && tb.d!=='none' && tb.h===28);
  console.log(errs.length? errs.join('\n') : '✓ без помилок (компʼютер)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
