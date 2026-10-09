import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=SITE;
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
/* ── дотик ──────────────────────────────────────────────────────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true,permissions:['clipboard-read','clipboard-write']}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
  const vis=loc=>loc.isVisible(); const blk=t=>pg.locator('#sheet > .blk').filter({hasText:t});
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  // 1 шапка на дотику: чотири кнопки по 44px, рідкісні — у «⋯»; назва не зникає на 320px
  { const ids=await pg.evaluate(()=>[...document.querySelectorAll('.top .tb')].filter(b=>getComputedStyle(b).display!=='none' && !b.hidden).map(b=>b.id+':'+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height)));
    await pg.setViewportSize({width:320,height:568}); await pg.waitForTimeout(300); const ttl=await box(pg.locator('#ttl')); const tools=await box(pg.locator('.tools')); await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(300);
    ok('1 шапка: видимі '+ids.join(', ')+'; на 320px назва '+ttl.w+'px, кнопки в межах екрана ('+(tools.x+tools.w)+')', ids.join(',')==='sideBtn:44x44,viewBtn:44x44,histBtn:44x44,moreBtn:44x44' && ttl.w>=60 && tools.x+tools.w<=320); }
  // 2 меню «⋯» шапки: пʼять пунктів ≥44px (перший — «Нова область»), «Тема» перемикає тему, «Сітка» — сітку, дотик поза меню закриває
  { await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const items=await pg.locator('.amenu.hm .mi').allInnerTexts(); const hs=await pg.evaluate(()=>[...document.querySelectorAll('.amenu.hm .mi')].map(b=>Math.round(b.getBoundingClientRect().height)));
    const th0=await pg.locator('#themeBtn').getAttribute('data-th'); await tapEl(pg.locator('.amenu.hm .mi').nth(3)); await pg.waitForTimeout(250); const th1=await pg.locator('#themeBtn').getAttribute('data-th');
    ok('2a меню шапки: '+items.map(t=>t.replace(/\s+/g,' ')).join(' | ')+' (висоти '+hs.join('/')+'); «Тема» перемкнула '+th0+' → '+th1+', меню закрилось', items.length===5 && hs.every(h=>h>=44) && th0!==th1 && (await pg.locator('.amenu.hm').count())===0 && (await pg.locator('#moreBtn').getAttribute('aria-expanded'))==='false');
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.hm .mi').nth(2)); await pg.waitForTimeout(250); const nogrid=await pg.locator('#sheet').evaluate(e=>e.classList.contains('nogrid'));
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); await tap(200,500); await pg.waitForTimeout(250);
    ok('2b «Сітка» вимкнула сітку ('+nogrid+'); дотик поза меню закриває його', nogrid && (await pg.locator('.amenu.hm').count())===0); await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(200); await tapEl(pg.locator('.amenu.hm .mi').nth(2)); await pg.waitForTimeout(250); }
  // 3 «⋯» у блока: без виділення його немає; дотик по ручці → режим положення → «⋯» видно, зона 44, меню без «Виділити» (блок уже виділено): копіювати, розмір, видалити
  await hold(80,300); await pg.waitForTimeout(250); await pg.keyboard.type('Перший блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await hold(80,420); await pg.waitForTimeout(250); await pg.keyboard.type('Другий блок'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  { const bm=blk('Перший').locator('.bact'); const idle=await bm.evaluate(e=>getComputedStyle(e).display); await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300);
    const sel=await blk('Перший').evaluate(e=>e.classList.contains('sel')), op=await bm.evaluate(e=>getComputedStyle(e).opacity), r=await box(bm);
    const hit=r? await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [r.x+r.w+8, r.y-8]) : '';   // кут зони 44 за межами значка
    if(r) await tapEl(bm); await pg.waitForTimeout(250); const items=await pg.locator('.amenu.bm .mi').allInnerTexts();
    ok('3 «⋯» у блока: без виділення '+idle+'; після дотику по ручці режим положення ('+sel+'), значок '+(r? r.w+'×'+r.h : 'немає')+', прозорість '+op+', зона 44 ('+hit+'); меню: '+items.map(t=>t.replace(/\s+/g,' ')).join(' | '), idle==='none' && sel && r && r.w>=20 && parseFloat(op)>=0.9 && hit==='bact' && items.length===3 && /Копіювати/.test(items[0]) && !/Виділити/.test(items.join(' ')) && /Розмір/.test(items[1]) && /Видалити/.test(items[2])); }
  // 4 «Копіювати блок» → буфер; з курсором у тексті «⋯» теж видно, «Виділити» → режим положення; «Видалити» → плашка, «Скасувати» повертає на те саме місце
  { await pg.evaluate(()=>navigator.clipboard.writeText('')); await tapEl(pg.locator('.amenu.bm .mi').nth(0)); await pg.waitForTimeout(400);
    ok('4a «Копіювати блок»: у буфері «'+(await pg.evaluate(()=>navigator.clipboard.readText()))+'»', (await pg.evaluate(()=>navigator.clipboard.readText())).trim()==='Перший блок' && (await pg.locator('.amenu.bm').count())===0);
    await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300); const t1=await box(blk('Перший').locator('.txt')); await tap(t1.x+30, t1.y+t1.h/2); await pg.waitForTimeout(400);
    const focused=await blk('Перший').evaluate(e=>e.classList.contains('focus')), shown=await blk('Перший').locator('.bact').evaluate(e=>getComputedStyle(e).display);
    await tapEl(blk('Перший').locator('.bact')); await pg.waitForTimeout(250); const items=await pg.locator('.amenu.bm .mi').allInnerTexts(); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Виділити'})); await pg.waitForTimeout(300);
    ok('4b з курсором у тексті: фокус '+focused+', «⋯» '+shown+', меню з чотирьох пунктів ('+items.length+'); «Виділити» → рамка й панель стрілок, курсора немає', focused && shown==='flex' && items.length===4 && /Виділити/.test(items[1]) && await blk('Перший').evaluate(e=>e.classList.contains('sel')) && await vis(pg.locator('#blockbar')) && !(await pg.locator('.blk .txt').evaluateAll(a=>a.some(e=>e===document.activeElement))));
    await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(300);
    const before=await box(blk('Другий').locator('.txt')); await tapEl(blk('Другий').locator('.grip')); await pg.waitForTimeout(300); await tapEl(blk('Другий').locator('.bact')); await pg.waitForTimeout(250); await tapEl(pg.locator('.amenu.bm .mi').filter({hasText:'Видалити'})); await pg.waitForTimeout(400);
    const gone=(await blk('Другий').count())===0, plaque=await vis(pg.locator('#undo')), msg=await pg.locator('#undo .umsg').innerText();
    await tapEl(pg.locator('#undo .ubtn')); await pg.waitForTimeout(500); const after=await box(blk('Другий').locator('.txt'));
    ok('4c «Видалити»: блок зник ('+gone+'), плашка «'+msg+'»; «Скасувати» повернув на те саме місце ('+before.x+','+before.y+' → '+(after&&after.x)+','+(after&&after.y)+')', gone && plaque && /Другий блок/.test(msg) && after && after.x===before.x && after.y===before.y && (await pg.locator('#blockbar').isHidden())); }
  // 5 зона ручки ⋮⋮ 44px ліворуч і по вертикалі, не над текстом
  { const g=await box(blk('Перший').locator('.grip')); const left=await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [g.x-8, g.y+g.h/2]); const over=await pg.evaluate(([x,y])=>{ const e=document.elementFromPoint(x,y); return e? e.className : ''; }, [g.x+g.w+6, g.y+g.h/2]);
    ok('5 ручка: ліворуч від значка — ручка ('+left+'), над текстом — текст ('+over+')', left==='grip' && over==='txt'); }
  // 6 висота кнопок шапки картки коду на дотику
  { await hold(80,600); await pg.waitForTimeout(250); await pg.evaluate(()=>{ const dt=new DataTransfer(); dt.setData('text/plain','function a(){\n  return 1;\n}\nfunction b(){\n  return 2;\n}'); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }); await pg.waitForTimeout(300);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); const cbs=await pg.evaluate(()=>[...document.querySelectorAll('.cb')].map(b=>Math.round(b.getBoundingClientRect().height)).filter(h=>h>0));
    ok('6 кнопки шапки блока коду на дотику ≥44px ('+(cbs.length? cbs.join('/') : 'блок коду не створився')+')', cbs.length>0 && cbs.every(h=>h>=44)); }
  // 8 «Нова область» у меню «⋯» шапки створює область під найнижчим блоком (кнопки області в шапці на дотику немає)
  { const a0=await pg.locator('#sheet .blk.is-area').count(); await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const first=(await pg.locator('.amenu.hm .mi').first().innerText()).replace(/\s+/g,' '); await tapEl(pg.locator('.amenu.hm .mi').first()); await pg.waitForTimeout(400);
    const a1=await pg.locator('#sheet .blk.is-area').count(), ab=a1? await box(pg.locator('#sheet .blk.is-area').last().locator('.ablk')) : null, hidden=await pg.locator('#areaBtn').evaluate(e=>getComputedStyle(e).display);
    ok('8 «'+first+'» у меню шапки: областей '+a0+' → '+a1+(ab? ', ширина '+ab.w+' у межах екрана' : '')+'; кнопка області в шапці '+hidden, /Нова область/.test(first) && a1===a0+1 && ab && ab.x+ab.w<=390 && hidden==='none');
    // 8b шапка області одним рядком: порожня назва-підказка і кнопки в одному ряду; після набору назва зліва в тому ж ряду, що й кнопки, шапка 48px
    const area=pg.locator('#sheet .blk.is-area').last(), tt=area.locator('.ctitle'), acts=area.locator('.acts'), bar=area.locator('.cbar');
    const look=await pg.evaluate(()=>{ const t=document.querySelector('#sheet .blk.is-area:last-of-type .ctitle'), n=document.getElementById('ttl'); const cs=getComputedStyle(t), ns=getComputedStyle(n,'::before'); return {c:cs.color, w:cs.fontWeight, nc:ns.color, nw:ns.fontWeight}; });
    await pg.evaluate(()=>document.querySelector('#sheet .blk.is-area:last-of-type .ctitle').blur()); await pg.waitForTimeout(250); const ph0=await pg.evaluate(()=>getComputedStyle(document.querySelector('#sheet .blk.is-area:last-of-type .ctitle'),'::before').opacity); await pg.evaluate(()=>document.querySelector('#sheet .blk.is-area:last-of-type .ctitle').focus()); await pg.waitForTimeout(150);   // підказка зникає з переходом 0,12 с; назву далі набираємо, тож фокус повертаємо
    ok('8c назва області як «Без назви»: колір '+look.c+' = '+look.nc+', вага '+look.w+' = '+look.nw+'; порожня назва без курсора підказки не показує (opacity '+ph0+')', look.c===look.nc && look.w===look.nw && ph0==='0');
    const e0={t:await box(tt), a:await box(acts), b:await box(bar)}; await pg.keyboard.type('Пюпитр'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); const e1={t:await box(tt), a:await box(acts), b:await box(bar)};
    const row=(t,a)=>Math.abs((t.y+t.h/2)-(a.y+a.h/2))<=4 && t.x+t.w<=a.x+1;
    ok('8b шапка області одним рядком: порожня — назва '+e0.t.y+'/'+e0.t.h+' і кнопки '+e0.a.y+'/'+e0.a.h+' в одному ряду, шапка '+e0.b.h+'px; з назвою «Пюпитр» — назва зліва ('+e1.t.x+' < кнопки '+e1.a.x+'), ряд той самий ('+e1.t.y+'/'+e1.t.h+' і '+e1.a.y+'/'+e1.a.h+'), шапка '+e1.b.h+'px, ширина назви '+e1.t.w+' ≥ 40% ('+Math.round(e1.b.w*0.4)+')', row(e0.t,e0.a) && e0.b.h===48 && row(e1.t,e1.a) && e1.b.h===48 && e1.t.x<e1.b.x+16 && e1.t.w>=e1.b.w*0.4 && (await tt.innerText()).trim()==='Пюпитр'); }
  // 9 пересування стрілкою — тихий запис у стеку (без плашки); «Скасувати: …» у меню «⋯» шапки повертає блок на місце
  { await tapEl(blk('Перший').locator('.grip')); await pg.waitForTimeout(300); const x0=(await box(blk('Перший').locator('.txt'))).x; await tapEl(pg.locator('#blockbar [data-mv="right"]')); await pg.waitForTimeout(400); const x1=(await box(blk('Перший').locator('.txt'))).x; const quiet=await pg.locator('#undo').isHidden();
    await tapEl(pg.locator('#blockbar [data-mv="done"]')); await pg.waitForTimeout(200); await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const it=pg.locator('.amenu.hm .mi').filter({hasText:'Скасувати'}); const label=(await it.count())? (await it.first().innerText()).replace(/\s+/g,' ') : 'пункту немає'; if(await it.count()) await tapEl(it.first()); else await tap(200,500); await pg.waitForTimeout(400); const x2=(await box(blk('Перший').locator('.txt'))).x;
    await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const again=await pg.locator('.amenu.hm .mi').filter({hasText:'Скасувати'}).count(); await tap(200,500); await pg.waitForTimeout(250);
    ok('9 стрілка → пересунула блок ('+x0+' → '+x1+') без плашки ('+quiet+'); у меню шапки «'+label+'», після нього блок на місці ('+x2+'), пункт зник ('+(again===0)+')', x1>x0 && quiet && /^Скасувати: Блок «Перший блок» пересунуто/.test(label) && x2===x0 && again===0); }
  await pg.screenshot({path:OUT+'/appmenu-touch.png'});
  console.log(errs.length? errs.join('\n') : '✓ без помилок (дотик)'); if(errs.length) fails++; await ctx.close(); }
/* ── компʼютер: нічого не змінилось ───────────────────────────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.mouse.click(500,300); await pg.keyboard.type('на компʼютері'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const bm=await pg.locator('.bact').evaluate(e=>getComputedStyle(e).display), more=await pg.locator('#moreBtn').evaluate(e=>getComputedStyle(e).display), tb=await pg.locator('#gridBtn').evaluate(e=>({d:getComputedStyle(e).display, h:Math.round(e.getBoundingClientRect().height)}));
  ok('7 компʼютер: «⋯» у блока не показується ('+bm+'), «⋯» шапки теж ('+more+'), кнопки шапки звичайні ('+tb.d+', '+tb.h+'px)', bm==='none' && more==='none' && tb.d!=='none' && tb.h===28);
  console.log(errs.length? errs.join('\n') : '✓ без помилок (компʼютер)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
