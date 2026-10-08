import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const focusedTxt=()=>pg.evaluate(()=>!!document.activeElement && document.activeElement.classList.contains('txt'));
const focusedText=()=>pg.evaluate(()=>document.activeElement && document.activeElement.classList.contains('txt')? document.activeElement.textContent.replace(/​/g,'') : null);
const vis=loc=>loc.isVisible();
const bubbleBtns=()=>pg.evaluate(()=>[...document.querySelectorAll('#bubble button')].filter(b=>getComputedStyle(b).display!=='none' && !b.hidden).map(b=>b.dataset.cmd||b.dataset.act));
const moreBtns=()=>pg.evaluate(()=>[...document.querySelectorAll('#bubbleMore button')].map(b=>b.dataset.cmd||b.dataset.act));
await pg.goto(new URL('../public/index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
ok('0 viewport без interactive-widget: клавіатура не стискає сторінку, нижні панелі — від visualViewport', !/interactive-widget/.test(await pg.locator('meta[name="viewport"]').getAttribute('content')) && /viewport-fit=cover/.test(await pg.locator('meta[name="viewport"]').getAttribute('content')));
// 1 курсор у блоці: «+» схований, панель видно з самим курсором — «Готово», «Блок», без «Копіювати»; кнопки 44 px; панель при низу вікна
await hold(150,400); await pg.waitForTimeout(250); await pg.keyboard.type('перший'); await pg.waitForTimeout(200);
{ const btns=await bubbleBtns(); const bb=await box(pg.locator('#bubble')); const sizes=[]; for(const sel of ['[data-cmd="bold"]','[data-act="done"]','[data-act="new"]']){ sizes.push(await box(pg.locator('#bubble '+sel))); }
  ok('1 курсор у блоці: «+» схований, панель ('+btns.join(' ')+') при низу вікна ('+(bb.y+bb.h)+'/844), кнопки ≥44 px ('+sizes.map(s=>s.w+'×'+s.h).join(', ')+')', await focusedTxt() && !(await vis(pg.locator('#fab'))) && btns.join(' ')==='bold italic underline strikeThrough code new done' && Math.abs(bb.y+bb.h-844)<=1 && sizes.every(s=>s.w>=44 && s.h>=44) && !(await vis(pg.locator('#bubble [data-act="copy"]')))); }
// 2 форматування зберігає виділення, набір триває
await pg.keyboard.press('Shift+Home'); await pg.waitForTimeout(150); const selBefore=await pg.evaluate(()=>getSelection().toString());
await tapEl(pg.locator('#bubble [data-cmd="bold"]')); await pg.waitForTimeout(200); const selAfter=await pg.evaluate(()=>getSelection().toString());
await pg.keyboard.press('End'); await pg.keyboard.type(' далі'); await pg.waitForTimeout(150);
ok('2 жирний із панелі: виділення те саме («'+selBefore+'» → «'+selAfter+'»), <b> застосовано, набір триває', selBefore==='перший' && selAfter==='перший' && (await pg.locator('.blk .txt b').count())===1 && (await focusedText())==='перший далі');
// 3 плашка «Скасувати» стоїть над панеллю, «+» лишається схованим
await pg.evaluate(()=>sheetDebug.offerUndo('тестова плашка')); await pg.waitForTimeout(350);
{ const u=await box(pg.locator('#undo')), bb=await box(pg.locator('#bubble'));
  ok('3 плашка над панеллю (низ '+(u.y+u.h)+' ≤ верх панелі '+bb.y+'), «+» схований', u.y+u.h<=bb.y && !(await vis(pg.locator('#fab'))));
  await pg.evaluate(()=>sheetDebug.dropUndo()); await pg.waitForTimeout(500); ok('3b після плашки «+» не зʼявляється, поки курсор у полі', !(await vis(pg.locator('#fab')))); }
// 4 «Блок» створює блок одразу під поточним і ставить курсор
await tapEl(pg.locator('#bubble [data-act="new"]')); await pg.waitForTimeout(300);
{ const n=await pg.locator('#sheet .blk').count(); const first=await box(pg.locator('#sheet .blk').first()), last=await box(pg.locator('#sheet .blk').last()); await pg.keyboard.type('другий'); await pg.waitForTimeout(150);
  ok('4 «Блок»: другий блок під першим ('+first.y+' → '+last.y+'), курсор у ньому, набір іде в нього', n===2 && last.y>first.y && (await focusedText())==='другий'); }
// 5 «Готово» закриває редагування, «+» повертається
await tapEl(pg.locator('#bubble [data-act="done"]')); await pg.waitForTimeout(450);
ok('5 «Готово»: фокус знято, панель схована, «+» видно', !(await focusedTxt()) && !(await vis(pg.locator('#bubble'))) && await vis(pg.locator('#fab')));
// 6 вузький екран 320: молодші кнопки йдуть у «⋯» над панеллю; назад на 390 — усі в ряду
await pg.setViewportSize({width:320,height:568}); await pg.waitForTimeout(300);
await pg.locator('.blk .txt').filter({hasText:'другий'}).tap(); await pg.waitForTimeout(300);
{ const main=await bubbleBtns(), more=await moreBtns(); const bb=await box(pg.locator('#bubble')); const right=await pg.evaluate(()=>Math.max(...[...document.querySelectorAll('#bubble button')].filter(b=>getComputedStyle(b).display!=='none'&&!b.hidden).map(b=>b.getBoundingClientRect().right)));
  ok('6a 320 px: у ряду '+main.join(' ')+', у «⋯» '+more.join(' ')+', ряд не ширший за екран ('+right+')', await focusedTxt() && main.includes('more') && !main.includes('strikeThrough') && more.includes('strikeThrough') && more.includes('code') && right<=320 && bb.w<=320);
  await tapEl(pg.locator('#bubble .more')); await pg.waitForTimeout(250); const mb=await box(pg.locator('#bubbleMore')); const bb2=await box(pg.locator('#bubble')); const sb=await box(pg.locator('#bubbleMore [data-cmd="strikeThrough"]'));
  ok('6b «⋯» відкриває ряд над панеллю (низ '+(mb&&mb.y+mb.h)+' ≤ верх '+bb2.y+'), кнопки ≥44', mb && mb.y+mb.h<=bb2.y && sb.w>=44 && sb.h>=44 && (await pg.locator('#bubble .more').getAttribute('aria-expanded'))==='true');
  await tapEl(pg.locator('#bubbleMore [data-cmd="strikeThrough"]')); await pg.waitForTimeout(150); }
await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(300);
{ const main=await bubbleBtns(), more=await moreBtns(); ok('7 знову 390 px: усі кнопки в ряду ('+main.join(' ')+'), «⋯» схований', main.join(' ')==='bold italic underline strikeThrough code new done' && more.length===0 && !(await vis(pg.locator('#bubbleMore')))); }
// 8 «клавіатура»: вікно нижче — панель при новому низу, плашка над нею
await pg.setViewportSize({width:390,height:420}); await pg.waitForTimeout(300); await pg.evaluate(()=>sheetDebug.offerUndo('ще плашка')); await pg.waitForTimeout(350);
{ const bb=await box(pg.locator('#bubble')), u=await box(pg.locator('#undo'));
  ok('8 низьке вікно 420: панель при низу ('+(bb.y+bb.h)+'), плашка над нею ('+(u.y+u.h)+' ≤ '+bb.y+')', await focusedTxt() && Math.abs(bb.y+bb.h-420)<=1 && u.y+u.h<=bb.y); await pg.evaluate(()=>sheetDebug.dropUndo()); }
// 8b аркуш не ужимається до вікна з «клавіатурою» під час набору і знову на все вікно після її зникнення
await pg.keyboard.press('End'); await pg.keyboard.type(' ще'); await pg.waitForTimeout(300); const hKb=await pg.locator('#sheet').evaluate(e=>e.offsetHeight);
await pg.setViewportSize({width:390,height:844}); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500); const hBack=await pg.locator('#sheet').evaluate(e=>e.offsetHeight);
await pg.setViewportSize({width:390,height:420}); await pg.waitForTimeout(400); const hNoFocus=await pg.locator('#sheet').evaluate(e=>e.offsetHeight);
await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(400); const hFull=await pg.locator('#sheet').evaluate(e=>e.offsetHeight);
ok('8b висота аркуша: з курсором у вікні 420 — '+hKb+' (не менше 844), після повернення — '+hBack+'; без курсора у 420 — '+hNoFocus+', знову 844 — '+hFull, hKb>=844 && hBack>=844 && hNoFocus>=420 && hFull>=844);
// 9 збережено
await pg.reload(); await pg.waitForTimeout(500);
{ const texts=await pg.locator('.blk .txt').allInnerTexts(); ok('9 після перезавантаження обидва блоки на місці ('+texts.map(t=>t.replace(/\u200b/g,'')).join(' | ')+')', (await pg.locator('.blk .txt').filter({hasText:'перший далі'}).count())===1 && (await pg.locator('.blk .txt').filter({hasText:'другий'}).count())===1); }
// 10 довга нотатка: курсор не ховається під ряд «⋯», плашку «Скасувати» і «клавіатуру»
const SEED={id:'tall1',title:'',created:1,updated:Date.now()+60000,blocks:Array.from({length:30},(_,i)=>({id:'t'+i,fx:0.05,row:2+i*2,text:'Рядок '+(i+1)}))};
await pg.evaluate(seed=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); t.objectStore('notes').put(seed); t.oncomplete=()=>{ d.close(); res(); }; }; }), SEED);
await pg.evaluate(()=>localStorage.clear()); await pg.setViewportSize({width:320,height:568}); await pg.reload(); await pg.waitForTimeout(600);
const caretBottom=()=>pg.evaluate(()=>{ const s=getSelection(); if(!s||!s.rangeCount) return null; let r=s.getRangeAt(0).getBoundingClientRect(); if(!r.height){ const n=s.focusNode, el=n&&(n.nodeType===1? n : n.parentElement); r=el.getBoundingClientRect(); } return Math.round(r.bottom); });
const pinAboveBar=()=>pg.evaluate(()=>{ const r=document.activeElement.getBoundingClientRect(), bar=document.getElementById('bubble').getBoundingClientRect(); window.scrollBy(0, r.bottom-(bar.top-2)); });
await pg.locator('.blk .txt').filter({hasText:'Рядок 30'}).tap(); await pg.waitForTimeout(300); await pinAboveBar(); await pg.waitForTimeout(100);
{ const before=await caretBottom(), barTop=(await box(pg.locator('#bubble'))).y; await tapEl(pg.locator('#bubble .more')); await pg.waitForTimeout(300); const after=await caretBottom(), mb=await box(pg.locator('#bubbleMore'));
  ok('10a відкрили «⋯»: курсор був над панеллю ('+before+' ≤ '+barTop+'), після появи ряду лишився над ним ('+after+' ≤ '+mb.y+')', await focusedTxt() && before<=barTop && mb && after<=mb.y);
  await tapEl(pg.locator('#bubble .more')); await pg.waitForTimeout(200); }
await pinAboveBar(); await pg.waitForTimeout(100);
{ await pg.evaluate(()=>sheetDebug.offerUndo('довга плашка')); await pg.waitForTimeout(350); const after=await caretBottom(), u=await box(pg.locator('#undo'));
  ok('10b плашка «Скасувати»: курсор над нею ('+after+' ≤ '+u.y+')', u && after<=u.y); await pg.evaluate(()=>sheetDebug.dropUndo()); await pg.waitForTimeout(300); }
await pinAboveBar(); await pg.waitForTimeout(100); await pg.setViewportSize({width:320,height:300}); await pg.waitForTimeout(400);
{ const after=await caretBottom(), bb=await box(pg.locator('#bubble')); ok('10c «клавіатура» (вікно 300): курсор підкрутило над панель ('+after+' ≤ '+bb.y+')', await focusedTxt() && bb && after<=bb.y && Math.abs(bb.y+bb.h-300)<=1); }
await pg.screenshot({path:OUT+'/appkb-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
