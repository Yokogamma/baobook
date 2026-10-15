// Links between notes and to blocks (docs/LINKS-PLAN.md): «[[» and its picker, a link to a block, a new note from the picker, live names,
// following a link with «back» and the browser's Back, a folded area, the notes that link here, «Копіювати посилання» and pasting an address,
// the address of the open note, states of the target (trash, gone), the preview, a new tab; on touch: the link button, the picker above the bar, a tap
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
const T0=Date.now();
const NOTES=[
  {id:'n1',title:'Деплой',blocks:[{id:'a1',row:2,text:'Конфіг тут',fx:0.2},
    {id:'a2',row:5,fx:0.2,text:'Перезапуск — Сервер matamata › Після правки перезапустити',html:'Перезапуск — <a data-to="n2/t1">Сервер matamata › Після правки перезапустити</a>'},
    {id:'a3',row:8,fx:0.2,text:'Старе: Архів старий, зникле: Зникла нотатка',html:'Старе: <a data-to="n4">Архів старий</a>, зникле: <a data-to="nzzz">Зникла нотатка</a>'}],created:1,updated:T0},
  {id:'n2',title:'Сервер matamata',blocks:[{id:'c1',row:2,text:'Сертифікати оновлюються самі',fx:0.2},
    {id:'c2',row:5,fx:0.2,kind:'code',lang:'nginx',title:'baobook.conf',text:'server {\n  listen 443 ssl;\n}',wrap:false,num:false},
    {id:'ar1',row:12,fx:0.2,kind:'area',cw:14,title:'Nginx',collapsed:true,text:''},
    {id:'t1',row:0,col:0,parent:'ar1',text:'Після правки перезапустити'}],created:1,updated:T0-60000},
  {id:'n3',title:'Чекліст релізу',blocks:[{id:'d1',row:2,fx:0.2,text:'Повернутися до Деплой і відкрити PR',html:'Повернутися до <a data-to="n1">Деплой</a> і відкрити PR'}],created:1,updated:T0-120000},
  {id:'n4',title:'Архів старий',blocks:[{id:'e1',row:2,text:'старе',fx:0.2}],created:1,updated:T0-180000,deleted:T0-1000}];
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const fresh=async(pg)=>{ await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.goto(SITE); await pg.waitForTimeout(400);
  await pg.setInputFiles('#importFile',file(NOTES)); await pg.waitForTimeout(800);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), NOTES.map(n=>n.id)); await pg.waitForTimeout(500); };   // the empty note of the first start goes for good
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);
const cur=pg=>pg.evaluate(()=>window.sheetDebug.cur());
const hash=pg=>pg.evaluate(()=>location.hash);
const pick=pg=>pg.evaluate(()=>{ const p=document.querySelector('.lpick'); return p? {head:p.querySelector('.lp-h').innerText.trim(), items:[...p.querySelectorAll('.lp-i')].map(e=>e.querySelector('.lp-t').innerText.trim()), on:(p.querySelector('.lp-i.on .lp-t')||{}).innerText||''} : null; });
const chips=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .txt a.lnk')].map(a=>a.getAttribute('data-to')+'='+a.textContent+(a.classList.length>1? '['+[...a.classList].filter(c=>c!=='lnk').join(' ')+']' : '')));
const endOf=async(pg,txt)=>{ await pg.locator('#sheet .blk .txt').filter({hasText:txt}).first().click({position:{x:4,y:8}}); await pg.keyboard.press('End'); };   // at the left edge: the middle may be a link chip, and a click there follows it

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(400);

  // 1 «[[» opens the picker under the caret; Enter puts a link to the note in place of «[[…»
  await endOf(pg,'Конфіг тут'); await pg.keyboard.type(' [['); await pg.waitForTimeout(150); const p0=await pick(pg);
  ok('1a «[[» opens the picker: «'+(p0&&p0.head)+'», '+(p0? p0.items.join(' | ') : 'none')+' (no trashed note)', p0 && p0.head==='Посилання на нотатку' && p0.items.length===3 && !p0.items.some(t=>/Архів старий/.test(t)));
  await pg.keyboard.type('серв'); await pg.waitForTimeout(150); const p1=await pick(pg), pb=await box(pg.locator('.lpick')), cb=await box(pg.locator('#sheet .blk .txt').filter({hasText:'Конфіг тут'}));
  ok('1b «серв»: '+p1.items.join(' | ')+', first «'+p1.on+'»; under the text ('+pb.y+' ≥ '+(cb.y+cb.h-4)+')', p1.on==='Сервер matamata' && p1.items.at(-1)==='Створити нотатку «серв»' && pb.y>=cb.y+cb.h-4);
  await pg.screenshot({path:OUT+'/applinks-picker.png'});
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(700); let r1=await stored(pg,'n1');
  ok('1c Enter: the chip «Сервер matamata», the picker closed; stored html '+JSON.stringify(r1.blocks[0].html)+', text «'+r1.blocks[0].text+'»', (await chips(pg)).includes('n2=Сервер matamata') && !(await pick(pg)) && r1.blocks[0].html==='Конфіг тут <a data-to="n2">Сервер matamata</a> ' && r1.blocks[0].text.trim()==='Конфіг тут Сервер matamata');
  // Ctrl+Z brings «[[серв» back, Ctrl+Shift+Z the link again
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200); const u1=await pg.locator('#sheet .blk .txt').first().innerText();
  await pg.keyboard.press('Control+Shift+z'); await pg.waitForTimeout(200);
  ok('1d Ctrl+Z: «'+u1.replace(/​/g,'')+'», Ctrl+Shift+Z: the chip again', /\[\[серв$/.test(u1.replace(/​/g,'').trim()) && (await chips(pg)).includes('n2=Сервер matamata'));

  // 2 → lists the blocks of the note; typing filters them; Enter links to the block
  await pg.keyboard.press('End'); await pg.keyboard.type('[[серв'); await pg.waitForTimeout(150); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(150); const p2=await pick(pg);
  const typed=await pg.locator('#sheet .blk .txt').first().innerText();
  ok('2a →: «'+p2.head+'», '+p2.items.join(' | ')+'; the text reads «…'+typed.replace(/​/g,'').slice(-20)+'»', p2.head==='Сервер matamata' && p2.items.join('|')==='Уся нотатка|Сертифікати оновлюються самі|baobook.conf|Nginx|Після правки перезапустити' && /\[\[Сервер matamata › $/.test(typed.replace(/​/g,'')));
  await pg.keyboard.type('conf'); await pg.waitForTimeout(150); const p3=await pick(pg);
  ok('2b «conf»: '+p3.items.join(' | '), p3.items.join('|')==='baobook.conf');
  await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(150); const p4=await pick(pg);
  ok('2c ← with an empty filter goes back to the notes ('+p4.head+', «'+p4.on+'»)', p4.head==='Посилання на нотатку' && p4.on==='Сервер matamata');
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.type('conf'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  ok('2d the block link: '+(await chips(pg)).join(' · '), (await chips(pg)).includes('n2/c2=Сервер matamata › baobook.conf') && (await stored(pg,'n1')).blocks[0].html.includes('<a data-to="n2/c2">Сервер matamata › baobook.conf</a>'));

  // 3 Esc leaves the text; a new note from the picker; the note stays open
  await pg.keyboard.type('[[abc'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  const t3=await pg.locator('#sheet .blk .txt').first().innerText(), f3=await pg.evaluate(()=>!!document.activeElement.closest('.txt'));
  ok('3a Esc: the picker closed, «[[abc» stays, the caret stays in the block', !(await pick(pg)) && /\[\[abc$/.test(t3.replace(/​/g,'').trim()) && f3);
  for(let i=0;i<5;i++) await pg.keyboard.press('Backspace');
  await pg.keyboard.type('[[Відпустка 2027'); await pg.waitForTimeout(150); const p5=await pick(pg); await pg.keyboard.press('Enter'); await pg.waitForTimeout(800);
  const made=await pg.evaluate(()=>[...document.querySelectorAll('#list .item .it-t')].map(e=>e.textContent)), nid=await pg.evaluate(()=>document.querySelector('#sheet .txt a.lnk[data-to]:last-of-type').getAttribute('data-to'));
  ok('3b «Створити нотатку»: '+p5.items.join(' | ')+' → the list has «Відпустка 2027», the chip links to it, «Деплой» is still open', p5.items.join('|')==='Створити нотатку «Відпустка 2027»' && made.includes('Відпустка 2027') && (await chips(pg)).includes(nid+'=Відпустка 2027') && await cur(pg)==='n1' && (await stored(pg,nid)).title==='Відпустка 2027');

  // 4 live names: a renamed note shows its new name; the note that links to it does not change
  const before=(await stored(pg,'n1')).updated; await open(pg,'n2'); await pg.waitForTimeout(300);
  await pg.click('#ttl'); await pg.keyboard.press('Control+a'); await pg.keyboard.type('Сервер VPS'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  await open(pg,'n1'); await pg.waitForTimeout(400); const c4=await chips(pg);
  ok('4 renamed «Сервер VPS»: '+c4.slice(0,2).join(' · ')+'; «Деплой» not saved again', c4.includes('n2=Сервер VPS') && c4.includes('n2/c2=Сервер VPS › baobook.conf') && (await stored(pg,'n1')).updated===before);

  // 5 states: a note in the trash is struck through, a gone one keeps its last name; a link to a block in a folded area
  ok('5a states: '+c4.filter(c=>/n4|nzzz/.test(c)).join(' · '), c4.includes('n4=Архів старий[trash]') && c4.includes('nzzz=Зникла нотатка[gone]'));
  await pg.locator('#sheet .txt a.lnk[data-to="nzzz"]').click(); await pg.waitForTimeout(300);
  ok('5b a gone note: the toast «'+await pg.locator('#toast').innerText()+'», nothing opens', await cur(pg)==='n1' && /Нотатки немає/.test(await pg.locator('#toast').innerText()));

  // 6 hover: the preview of the target
  await pg.locator('#sheet .txt a.lnk[data-to="n2/c2"]').hover(); await pg.waitForTimeout(700); const pv=await pg.locator('.lprev').innerText();
  ok('6 the preview: «'+pv.replace(/\s+/g,' ').slice(0,90)+'…»', /Сервер VPS/.test(pv) && /listen 443/.test(pv) && /Ctrl\+клік/.test(pv));
  await pg.mouse.move(5,790); await pg.waitForTimeout(100);

  // 7 following a link: the note, the block lit, the address, «back»; back by the button and by the browser
  await pg.locator('#sheet .txt a.lnk[data-to="n2/c2"]').click(); await pg.waitForTimeout(400);
  const lit=await pg.evaluate(()=>document.querySelector('#sheet .blk.is-code .cblk').classList.contains('lflash')), bk=await pg.locator('#linkBack').innerText();
  ok('7a a click: «Сервер VPS» open, the code block lit, '+await hash(pg)+', «back» «'+bk+'», no preview left', await cur(pg)==='n2' && lit && await hash(pg)==='#n2/c2' && bk==='Деплой' && await pg.locator('.lprev').isHidden());
  await pg.screenshot({path:OUT+'/applinks-follow.png'});
  await pg.click('#linkBack'); await pg.waitForTimeout(500);
  ok('7b «back»: «Деплой» again, '+await hash(pg)+', the button hidden', await cur(pg)==='n1' && await hash(pg)==='#n1' && await pg.locator('#linkBack').isHidden());
  await pg.locator('#sheet .txt a.lnk[data-to="n2/c2"]').click(); await pg.waitForTimeout(400); await pg.goBack(); await pg.waitForTimeout(500);
  ok('7c the browser\'s Back returns to «Деплой» ('+await cur(pg)+')', await cur(pg)==='n1' && await pg.locator('#linkBack').isHidden());
  await pg.locator('#sheet .txt a.lnk[data-to="n2/t1"]').click(); await pg.waitForTimeout(500);
  const unf=await pg.evaluate(()=>({folded:document.querySelector('#sheet .ablk').classList.contains('collapsed'), lit:[...document.querySelectorAll('#sheet .txt')].find(t=>/Після правки/.test(t.textContent)).classList.contains('lflash')}));
  ok('7d a block in a folded area: the area unfolds, the block is lit', !unf.folded && unf.lit);

  // 8 the notes that link here, under the lowest block
  await open(pg,'n1'); await pg.waitForTimeout(400); const bl=await pg.locator('#sheet .blinks').innerText(), bb=await box(pg.locator('#sheet .blinks')), low=await pg.evaluate(()=>Math.max(...[...document.querySelectorAll('#sheet > .blk')].map(e=>e.getBoundingClientRect().bottom)));
  ok('8a «Деплой»: «'+bl.replace(/\s+/g,' ')+'», below the blocks ('+bb.y+' > '+Math.round(low)+')', /^Сюди посилаються · 1/.test(bl) && /Чекліст релізу/.test(bl) && /Повернутися до Деплой і відкрити PR/.test(bl.replace(/\s+/g,' ')) && bb.y>low);
  await pg.locator('#sheet .blinks .bl-i').click(); await pg.waitForTimeout(400);
  ok('8b a click opens «Чекліст релізу» at its block ('+await hash(pg)+'), «back» to «Деплой»', await cur(pg)==='n3' && await hash(pg)==='#n3/d1' && await pg.locator('#linkBack').innerText()==='Деплой');
  await open(pg,'n2'); await pg.waitForTimeout(300); const bl2=await pg.locator('#sheet .blinks').innerText();
  ok('8c «Сервер VPS» is linked from «Деплой» (the link to a block counts too): «'+bl2.replace(/\s+/g,' ').slice(0,60)+'»', /Сюди посилаються · \d/.test(bl2) && /Деплой/.test(bl2));

  // 9 «Копіювати посилання»: the right button on ⋮⋮, the code card button; the address pasted into a text becomes a link, «Залишити адресою» undoes it
  await pg.locator('#sheet .blk.is-code .grip').click({button:'right'}); await pg.waitForTimeout(250); const gm=await pg.locator('.amenu.gm .mi').allInnerTexts();
  await pg.locator('.amenu.gm .mi').filter({hasText:'Копіювати посилання'}).click(); await pg.waitForTimeout(400); const clip=await pg.evaluate(()=>navigator.clipboard.readText());
  ok('9a ⋮⋮ right button: '+gm.join(' | ')+' → «'+clip+'», toast «'+await pg.locator('#toast').innerText()+'»', gm.join('|')==='Копіювати блок|Копіювати посилання' && clip===SITE+'#n2/c2' && /Посилання скопійовано/.test(await pg.locator('#toast').innerText()));
  await pg.evaluate(()=>navigator.clipboard.writeText('')); await pg.locator('#sheet .blk.is-code .cblk').hover(); await pg.locator('#sheet .blk.is-code .linkb').click(); await pg.waitForTimeout(300);
  ok('9b the code card\'s link button copies the same', await pg.evaluate(()=>navigator.clipboard.readText())===SITE+'#n2/c2');
  await open(pg,'n3'); await pg.waitForTimeout(300); await endOf(pg,'Повернутися'); await pg.keyboard.type(' '); await pg.keyboard.press('Control+v'); await pg.waitForTimeout(700);
  const c9=await chips(pg), pc=await pg.locator('#sheet .chip').innerText();
  ok('9c the pasted address is a link: '+c9.join(' · ')+'; the hint «'+pc.replace(/\s+/g,' ')+'»', c9.includes('n2/c2=Сервер VPS › baobook.conf') && /Вставлено як посилання/.test(pc) && (await stored(pg,'n3')).blocks[0].html.includes('<a data-to="n2/c2">'));
  await pg.locator('#sheet .chip .swap').click(); await pg.waitForTimeout(700);
  ok('9d «Залишити адресою»: the address as text', !(await chips(pg)).some(c=>c.startsWith('n2/c2')) && (await stored(pg,'n3')).blocks[0].text.includes(SITE+'#n2/c2'));
  await open(pg,'n1'); await pg.waitForTimeout(300); await endOf(pg,'Конфіг тут'); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Control+c'); await pg.waitForTimeout(200);
  const html=await pg.evaluate(async()=>{ const it=(await navigator.clipboard.read())[0]; return it.types.includes('text/html')? await (await it.getType('text/html')).text() : ''; });
  ok('9e copying text with a link: text/html carries a real address ('+(html.match(/<a href="[^"]*">/)||['none'])[0]+')', html.includes('<a href="'+SITE+'#n2">'));
  await pg.keyboard.press('Escape');

  // 10 a new tab: Ctrl+click; an address with a block opens it there
  const [tab]=await Promise.all([ctx.waitForEvent('page'), pg.locator('#sheet .txt a.lnk[data-to="n2/c2"]').click({modifiers:['Control']})]); await tab.waitForTimeout(900);
  const t10=await tab.evaluate(()=>({cur:window.sheetDebug.cur(), hash:location.hash, lit:!!document.querySelector('#sheet .blk.is-code .cblk.lflash')}));
  ok('10 Ctrl+click: a new tab on «Сервер VPS» at the code block ('+t10.hash+'), this tab stays', t10.cur==='n2' && t10.hash==='#n2/c2' && t10.lit && await cur(pg)==='n1');
  await tab.close();

  // 11 the address of the open note: a reload keeps it; the header «⋯» is touch only, so no other UI is needed on a computer
  await pg.reload(); await pg.waitForTimeout(900);
  ok('11 the address names the open note ('+await hash(pg)+'), a reload opens it', await hash(pg)==='#n1' && await cur(pg)==='n1');
  ok('12 no page errors'+(errs.length? ': '+errs.join(' | ') : ''), !errs.length);
  await ctx.close(); }

/* ── touch ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(500);
  const t1=pg.locator('#sheet .blk .txt').filter({hasText:'Конфіг тут'}); const tb=await box(t1); await tap(tb.x+tb.w-4, tb.y+tb.h/2); await pg.waitForTimeout(400);
  const lb=pg.locator('#bubble [data-act="link"], #bubbleMore [data-act="link"]').first(); const lbb=await box(lb);
  ok('T1 a caret in a block: the bar has the link button '+(lbb? lbb.w+'×'+lbb.h : 'none'), lbb && lbb.w>=44 && lbb.h>=44);
  await tapEl(lb); await pg.waitForTimeout(300); const p=await pick(pg), pb=await box(pg.locator('.lpick')), bub=await box(pg.locator('#bubble')), rows=await pg.evaluate(()=>[...document.querySelectorAll('.lpick .lp-i')].map(e=>Math.round(e.getBoundingClientRect().height)));
  ok('T2 the button types «[[» and opens the picker above the bar ('+(pb.y+pb.h)+' ≤ '+bub.y+'), rows '+rows.join('/')+', keyboard focus kept', p && p.head==='Посилання на нотатку' && pb.y+pb.h<=bub.y && rows.every(h=>h>=44) && await pg.evaluate(()=>!!document.activeElement.closest('.txt')));
  await pg.screenshot({path:OUT+'/applinks-touch-picker.png'});
  const row=pg.locator('.lpick .lp-i').filter({hasText:'Сервер matamata'}); await tapEl(row.locator('.lp-x')); await pg.waitForTimeout(300); const p2=await pick(pg);
  await tapEl(pg.locator('.lpick .lp-i').filter({hasText:'baobook.conf'})); await pg.waitForTimeout(600);
  ok('T3 the arrow lists the blocks («'+p2.head+'»), a tap links to one: '+(await chips(pg)).filter(c=>c.startsWith('n2')).join(' · '), p2.head==='Сервер matamata' && (await chips(pg)).includes('n2/c2=Сервер matamata › baobook.conf'));
  await pg.evaluate(()=>{ document.activeElement.blur(); getSelection().removeAllRanges(); }); await pg.waitForTimeout(300);
  await tapEl(pg.locator('#sheet .txt a.lnk[data-to="n2/c2"]')); await pg.waitForTimeout(600);
  ok('T4 a tap on the chip follows it, without a caret: '+await cur(pg)+', «back» «'+await pg.locator('#linkBack').innerText()+'»', await cur(pg)==='n2' && !(await pg.evaluate(()=>!!document.activeElement.closest('.txt'))) && await pg.locator('#linkBack').isVisible());
  await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const hm=await pg.locator('.amenu.hm .mi').allInnerTexts(); await tapEl(pg.locator('.amenu.hm .mi').filter({hasText:'Копіювати посилання на нотатку'})); await pg.waitForTimeout(400);
  ok('T5 the header «⋯» copies the link to the note: «'+await pg.evaluate(()=>navigator.clipboard.readText())+'»', hm.some(t=>/Копіювати посилання на нотатку/.test(t)) && await pg.evaluate(()=>navigator.clipboard.readText())===SITE+'#n2');
  ok('T6 no page errors'+(errs.length? ': '+errs.join(' | ') : ''), !errs.length);
  await ctx.close(); }

await br.close();
console.log(fails? '\n'+fails+' FAILED' : '\nALL OK'); process.exit(fails? 1 : 0);
