import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const stored=async re=>{ await pg.waitForTimeout(450); return (await idbAll()).flatMap(n=>n.blocks).find(b=>re.test(b.text||'')); };   // autosave runs 300 ms after a change
const show=s=>s==null? '—' : String(s).replace(/\n/g,'⏎');
const reset=async()=>{ await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };
const listBtns=()=>pg.evaluate(()=>[...document.querySelectorAll('#bubble [data-cmd="ul"],#bubble [data-cmd="ol"]')].filter(b=>!b.hidden).map(b=>b.dataset.cmd+(b.getAttribute('aria-pressed')==='true'? '*' : '')).join(' '));
const bubbleOn=()=>pg.locator('#bubble').isVisible();
const items=t=>t.evaluate(e=>[...e.children].map(d=>(d.getAttribute('data-l')||'-')+(d.getAttribute('data-n')||'')).join(' '));
// keyboard selection: from the start of line a to the end of line z (lines counted from 0)
const selLines=async(a,z)=>{ await pg.keyboard.press('Control+Home'); for(let i=0;i<a;i++) await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Home'); for(let i=a;i<z;i++) await pg.keyboard.press('Shift+ArrowDown'); await pg.keyboard.press('Shift+End'); await pg.waitForTimeout(150); };
const wordAt=(t,w)=>t.evaluate((e,w)=>{ const tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let n; while((n=tw.nextNode())){ const i=n.nodeValue.indexOf(w); if(i>=0){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+w.length); const b=r.getBoundingClientRect(); return {x:b.left+b.width/2, y:b.top+b.height/2}; } } return null; },w);

await reset();
await pg.mouse.click(500,300); await pg.keyboard.type('Покупки'); await pg.keyboard.press('Enter'); await pg.keyboard.type('молоко'); await pg.keyboard.press('Enter'); await pg.keyboard.type('хліб'); await pg.waitForTimeout(150);
const T=pg.locator('.blk .txt').filter({hasText:'Покупки'}).first();

// 1 a selection inside one line: the bar has no list buttons; a triple click (it takes the line break too) counts as one line
await selLines(0,0); ok('1a одна строка: панель є, кнопок списку немає ('+(await listBtns())+')', await bubbleOn() && (await listBtns())==='');
{ const p=await wordAt(T,'молоко'); await pg.mouse.click(p.x,p.y,{clickCount:3}); await pg.waitForTimeout(200);
  ok('1b потрійний клік по рядку: кнопок списку немає ('+(await listBtns())+', виділено «'+show(await pg.evaluate(()=>getSelection().toString()))+'»)', await bubbleOn() && (await listBtns())===''); }

// 2 two lines: both list buttons; the bulleted one makes both lines list lines, the selection stays
await selLines(1,2); ok('2a два рядки: кнопки списку є ('+(await listBtns())+')', (await listBtns())==='ul ol');
{ const b=await pg.locator('#bubble').boundingBox(), t=await T.boundingBox(); await pg.screenshot({path:OUT+'/applist-bubble.png', clip:{x:Math.min(b.x,t.x)-20, y:b.y-20, width:Math.max(b.width,t.width)+40, height:t.y+t.height-b.y+40}}); }
await pg.locator('#bubble [data-cmd="ul"]').click();
{ const st=await stored(/Покупки/); ok('2b маркований: html «'+show(st&&st.html)+'», текст без маркерів «'+show(st&&st.text)+'»', st && st.html==='Покупки\n<li data-l="ul">молоко</li>\n<li data-l="ul">хліб</li>' && st.text==='Покупки\nмолоко\nхліб');
  ok('2c у DOM рядок на div, кнопка натиснута, виділення лишилось: '+(await items(T))+' · '+(await listBtns()), (await items(T))==='- ul ul' && (await listBtns())==='ul* ol' && /молоко[\s\S]*хліб/.test(await pg.evaluate(()=>getSelection().toString()))); }

// 3 the numbered one switches the type; numbers come from the code, not from the text
await pg.locator('#bubble [data-cmd="ol"]').click();
{ const st=await stored(/Покупки/); ok('3 нумерований: '+(await items(T))+' · '+show(st&&st.html), (await items(T))==='- ol1 ol2' && st.html==='Покупки\n<li data-l="ol">молоко</li>\n<li data-l="ol">хліб</li>' && (await listBtns())==='ul ol*'); }

// 4 the pressed button again takes the list off
await pg.locator('#bubble [data-cmd="ol"]').click();
{ const st=await stored(/Покупки/); ok('4 повторне натискання знімає список: '+(await items(T))+' · html «'+show(st&&st.html)+'»', !st.html && st.text==='Покупки\nмолоко\nхліб' && !(await T.locator('[data-l]').count())); }

// 5 Ctrl+Shift+8, then Ctrl+Z / Ctrl+Y
await selLines(1,2); await pg.keyboard.press('Control+Shift+8'); await pg.waitForTimeout(100);
const ul2='Покупки\n<li data-l="ul">молоко</li>\n<li data-l="ul">хліб</li>';
{ const st=await stored(/Покупки/); ok('5a Ctrl+Shift+8 робить маркований список', st && st.html===ul2); }
await pg.keyboard.press('Control+z'); { const st=await stored(/Покупки/); ok('5b Ctrl+Z повертає рядки без списку («'+show(st&&st.html)+'»)', st && !st.html); }
await pg.keyboard.press('Control+y'); { const st=await stored(/Покупки/); ok('5c Ctrl+Y повертає список', st && st.html===ul2); }

// 6 Enter at the end of an item makes the next one; Enter on an empty item leaves the list
await pg.keyboard.press('Control+End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('масло'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Потім');
{ const st=await stored(/Потім/); ok('6 Enter продовжує список, Enter на порожньому пункті виходить: «'+show(st&&st.html)+'»', st && st.html==='Покупки\n<li data-l="ul">молоко</li>\n<li data-l="ul">хліб</li>\n<li data-l="ul">масло</li>\nПотім' && (await items(T))==='- ul ul ul -'); }

// 7 Backspace at the start of an item takes the marker off and keeps the text; one more joins it to the line above as usual
{ const p=await wordAt(T,'хліб'); await pg.mouse.click(p.x,p.y); await pg.keyboard.press('Home'); await pg.keyboard.press('Backspace');
  const st=await stored(/Потім/); ok('7a Backspace на початку пункту знімає маркер: «'+show(st&&st.html)+'»', st && st.html==='Покупки\n<li data-l="ul">молоко</li>\nхліб\n<li data-l="ul">масло</li>\nПотім');
  await pg.keyboard.press('Backspace'); const st2=await stored(/Потім/); ok('7b другий Backspace зʼєднує з пунктом вище: «'+show(st2&&st2.html)+'»', st2 && st2.html==='Покупки\n<li data-l="ul">молокохліб</li>\n<li data-l="ul">масло</li>\nПотім');
  await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z'); const st3=await stored(/Потім/); ok('7c два Ctrl+Z повертають «хліб» пунктом', st3 && st3.html==='Покупки\n<li data-l="ul">молоко</li>\n<li data-l="ul">хліб</li>\n<li data-l="ul">масло</li>\nПотім'); }

// 8 a selection inside one list line: the buttons are there (to switch or take the list off)
{ const p=await wordAt(T,'масло'); await pg.mouse.dblclick(p.x,p.y); await pg.waitForTimeout(200); ok('8 виділення в одному пункті списку: кнопки є, «•» натиснута ('+(await listBtns())+')', (await listBtns())==='ul* ol'); }

// 9 copying: «• » in plain text, <ul> in html
await pg.keyboard.press('Control+a'); await pg.keyboard.press('Control+c'); await pg.waitForTimeout(150);
{ const c=await pg.evaluate(async()=>{ const it=(await navigator.clipboard.read())[0]; return {t:await (await it.getType('text/plain')).text(), h:it.types.includes('text/html')? await (await it.getType('text/html')).text() : ''}; });
  ok('9 копіювання: текст «'+show(c.t)+'», html зі списком', c.t==='Покупки\n• молоко\n• хліб\n• масло\nПотім' && /<ul><li>молоко<\/li><li>хліб<\/li><li>масло<\/li><\/ul>/.test(c.h)); }
await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);

// 10 after a reload: the same lines; a long item wraps under its text, not under the marker; the block stays on the grid
await pg.reload(); await pg.waitForTimeout(500);
{ const st=await stored(/Потім/); ok('10a після перезавантаження: '+(await items(T))+' · html без змін', (await items(T))==='- ul ul ul -' && st.html==='Покупки\n<li data-l="ul">молоко</li>\n<li data-l="ul">хліб</li>\n<li data-l="ul">масло</li>\nПотім'); }
await pg.mouse.click(800,560); await pg.keyboard.type('Взяти:'); await pg.keyboard.press('Enter'); await pg.keyboard.type('- спальник і килимок, краще самонадувний, бо земля холодна вночі навіть улітку'); await pg.keyboard.press('Enter'); await pg.keyboard.type('газ'); await pg.waitForTimeout(150);
{ const L=pg.locator('.blk .txt').filter({hasText:'Взяти:'}).first(); await L.evaluate(e=>{ e.closest('.blk').querySelector('.tcard').style.width='300px'; });   // narrow the card so the item wraps
  const g=await L.evaluate(e=>{ const d=e.querySelector('[data-l]'), t=[...d.childNodes].find(n=>n.nodeType===3 && /спальник/.test(n.nodeValue)), r=document.createRange(); r.selectNodeContents(t); const rs=[...r.getClientRects()], dr=d.getBoundingClientRect(), G=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g'));
    return {lines:rs.length, first:rs[0].left-dr.left, last:rs[rs.length-1].left-dr.left, G, h:e.offsetHeight, plain:e.firstElementChild.getBoundingClientRect().left-dr.left+parseFloat(getComputedStyle(e.firstElementChild).paddingLeft)}; });
  ok('10b пункт переноситься під текст: рядків '+g.lines+', відступ першого '+g.first+' і останнього '+g.last+' = крок сітки '+g.G+', висота блока '+g.h+' кратна кроку', g.lines>=2 && g.first===g.G && g.last===g.G && g.h%g.G===0);
  const st=await stored(/Взяти:/); ok('10c «- » на початку рядка робить маркований пункт: «'+show(st&&st.html)+'»', st && st.html==='Взяти:\n<li data-l="ul">спальник і килимок, краще самонадувний, бо земля холодна вночі навіть улітку</li>\n<li data-l="ul">газ</li>'); }

// 11 «1. » makes a numbered list; numbers start again after an empty line; Ctrl+Z right after «- » keeps the typed characters
await pg.keyboard.press('Escape'); await pg.mouse.click(500,760); await pg.keyboard.type('1. один'); await pg.keyboard.press('Enter'); await pg.keyboard.type('два'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('1. знову');
{ const L=pg.locator('.blk .txt').filter({hasText:'один'}).first(); const st=await stored(/один/);
  ok('11a «1. » — нумерований, після порожнього рядка нумерація спочатку: '+(await items(L))+' · «'+show(st&&st.html)+'»', (await items(L))==='ol1 ol2 - ol1' && st.html==='<li data-l="ol">один</li>\n<li data-l="ol">два</li>\n\n<li data-l="ol">знову</li>' && st.text==='один\nдва\n\nзнову'); }
await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('- '); await pg.keyboard.press('Control+z');
{ const L=pg.locator('.blk .txt').filter({hasText:'один'}).first(); const st=await stored(/один/); ok('11b Ctrl+Z одразу після «- » лишає набрані символи без списку: «'+show(st&&st.text)+'» '+(await items(L)), st && st.text==='один\nдва\n\nзнову\n- ' && (await items(L))==='ol1 ol2 - ol1 -'); }
await pg.keyboard.press('Escape');

// 12 the stored format: older notes and foreign lists read correctly, our html reads back unchanged, a list line keeps formatting that spans lines
{ const r=await pg.evaluate(()=>{ const {cleanRich, linesOf, listText}=window.sheetDebug.rich, own='А\n<li data-l="ol">x <b>y</b></li>\n<li data-l="ol"></li>\n\nБ';
    return {own:cleanRich(own)===own, foreign:cleanRich('<p>заголовок</p><ol><li>раз</li><li>два</li></ol>хвіст'), old:cleanRich('a\n<b>b</b>\n\nc'), span:JSON.stringify(linesOf('<b>a\nb</b>')), text:listText(own)}; });
  ok('12a власний html читається без змін', r.own);
  ok('12b чужий <ol> стає нумерованими рядками: «'+show(r.foreign)+'»', r.foreign==='заголовок\n<li data-l="ol">раз</li>\n<li data-l="ol">два</li>\nхвіст');
  ok('12c старий html без списків не змінюється', r.old==='a\n<b>b</b>\n\nc');
  ok('12d жирний через перенос закривається й відкривається на кожному рядку: '+r.span, r.span==='[{"l":"","h":"<b>a</b>"},{"l":"","h":"<b>b</b>"}]');
  ok('12e текст для копіювання: «'+show(r.text)+'»', r.text==='А\n1. x y\n2. \n\nБ'); }
await pg.screenshot({path:OUT+'/applist-desktop.png'});

// 13 touch: the bar gets the list buttons with a selection over two lines; S and </> leave for «⋯» first
{ const tctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const tp=await tctx.newPage(); tp.on('pageerror',e=>errs.push('PAGEERROR touch '+e.message));
  const cdp=await tctx.newCDPSession(tp); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  await tp.goto(SITE); await tp.waitForTimeout(400); await tp.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await tp.reload(); await tp.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:400}]}); await tp.waitForTimeout(650); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await tp.waitForTimeout(250);
  await tp.keyboard.type('раз'); await tp.keyboard.press('Enter'); await tp.keyboard.type('два'); await tp.waitForTimeout(200);
  const btns=()=>tp.evaluate(()=>({bar:[...document.querySelectorAll('#bubble button')].filter(b=>!b.hidden && getComputedStyle(b).display!=='none').map(b=>b.dataset.cmd||b.dataset.act).join(' '), more:[...document.querySelectorAll('#bubbleMore button')].filter(b=>!b.hidden).map(b=>b.dataset.cmd||b.dataset.act).join(' ')}));
  const b1=await btns(); ok('13a курсор у звичайному рядку: панель без кнопок списку ('+b1.bar+')', !/\b(ul|ol)\b/.test(b1.bar+' '+b1.more));
  await tp.keyboard.press('Control+Home'); await tp.keyboard.press('Shift+Control+End'); await tp.waitForTimeout(250);
  const b2=await btns(); ok('13b два рядки: списки в панелі, S і </> у «⋯» ('+b2.bar+' | ⋯ '+b2.more+')', /\bul ol\b/.test(b2.bar) && /strikeThrough/.test(b2.more) && /code/.test(b2.more));
  await tp.locator('#bubble [data-cmd="ol"]').tap(); await tp.waitForTimeout(450);
  const n=await tp.locator('.blk .txt [data-l="ol"]').count(); await tp.screenshot({path:OUT+'/applist-touch.png'}); ok('13c нумерований список з панелі: пунктів '+n, n===2);
  await tctx.close(); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
