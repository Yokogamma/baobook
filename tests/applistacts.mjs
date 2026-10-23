// List actions (docs/LIST-ACTIONS-PLAN.md, PR A): on touch a tap anywhere on an item only opens the note and a long press opens the action mode
// with 48 px buttons that show the note's state; the release of the long press presses nothing; the mode follows a pin, closes on a tap
// elsewhere, a scroll, Escape and Back; the archive and the trash; the pinned look; the hint. On a computer: the hover buttons with state and
// the right-click menu.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const SITE=(await serve()).url;
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const T0=Date.now();
const NOTES=Array.from({length:12},(_,i)=>({id:'n'+(i+1), title:['Ключі','Покупки','Komax старий','Відпустка','Рецепти','Книги','Сервер','Ідеї','Спорт','Фільми','Подарунки','Ремонт'][i],
  blocks:[{id:'b'+i,row:2,text:'текст нотатки '+(i+1),fx:0.2}], created:1, updated:T0-i*60000}));
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const fresh=async(pg)=>{ await pg.goto(SITE); await ready(pg); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready(pg);
  await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; }); await pg.setInputFiles('#importFile',file(NOTES));
  await pg.waitForFunction(()=>/Імпортовано/.test(document.getElementById('toast').textContent),null,{timeout:15000}); const ids=NOTES.map(n=>n.id);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), ids);
  await until(()=>pg.evaluate(ids=>[...document.querySelectorAll('#list .item')].every(d=>ids.includes(d.dataset.id)), ids)); await pg.waitForTimeout(200); };
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const cur=pg=>pg.evaluate(()=>window.sheetDebug.cur());
const count=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').count(); g.onsuccess=()=>{ d.close(); res(g.result); }; }; }));
const sideOpen=pg=>pg.evaluate(()=>document.getElementById('app').classList.contains('open'));
const actsOn=pg=>pg.evaluate(()=>{ const a=document.querySelector('#list .item.acts'); return a? a.dataset.id : null; });
const item=(pg,id)=>pg.locator('#list .item[data-id="'+id+'"]');
// an item's box once it is drawn (a busy machine draws the list later) and, for an item near an edge of the list, scrolled to its middle (new notes push the others down, and the panel's footer lies over the bottom of the list)
const boxOf=async loc=>{ await loc.waitFor({state:'visible', timeout:5000}).catch(()=>{}); if(await loc.evaluate(e=>{ if(!e.classList.contains('item')) return false; const r=e.getBoundingClientRect(), L=e.closest('.list').getBoundingClientRect(); if(r.top>=L.top+40 && r.bottom<=L.bottom-90) return false; e.scrollIntoView({block:'center'}); return true; }).catch(()=>false)) await loc.page().waitForTimeout(250); const b=await loc.boundingBox(); return b && {x:b.x, y:b.y, w:b.width, h:b.height, cx:b.x+b.width/2, cy:b.y+b.height/2}; };
const anyButtonShown=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item .it-p,#list .item .it-r,#list .item .it-x')].some(b=>{ const r=b.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(b).display!=='none'; }));

/* ── touch: a phone ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  let natives=0; pg.on('dialog',d=>{ natives++; d.dismiss(); });
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tapAt=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(40); await touch('touchEnd',[]); await pg.waitForTimeout(300); };
  const tap=async loc=>{ const b=await boxOf(loc); await tapAt(b.cx,b.cy); };
  const holdAt=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); await pg.waitForTimeout(250); };
  const hold=async loc=>{ const b=await boxOf(loc); await holdAt(b.cx,b.cy); };
  const panel=async()=>{ if(!(await sideOpen(pg))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); } };
  const escape=async()=>{ await pg.keyboard.press('Escape'); await pg.waitForTimeout(250); };
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n3"]').click()); await pg.waitForTimeout(400); await panel();

  // 1–2 at rest: no button, and a tap at the right edge of the open note's item (where the bin was drawn) only opens it
  ok('1 at rest no item button shows, the open note\'s included', !(await anyButtonShown(pg)));
  const r3=await boxOf(item(pg,'n3')); await tapAt(r3.x+r3.w-14, r3.y+14); await pg.waitForTimeout(300); const s3=await stored(pg,'n3');
  ok('2 a tap at the right edge of the open note\'s item opens it ('+await cur(pg)+') and archives or trashes nothing', await cur(pg)==='n3' && !s3.archived && !s3.deleted && !(await sideOpen(pg)));

  // 3 a long press opens the action mode: three buttons, 48×48, 12 px apart, inside the item
  await panel(); await hold(item(pg,'n3'));
  const geo=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n3"]'), ib=it.getBoundingClientRect(), bs=['.it-p','.it-r','.it-x'].map(c=>it.querySelector(c).getBoundingClientRect());
    return {bs:bs.map(b=>[Math.round(b.width),Math.round(b.height)]), gaps:[bs[1].left-bs[0].right, bs[2].left-bs[1].right], inside:bs.every(b=>b.left>=ib.left && b.right<=ib.right && b.top>=ib.top && b.bottom<=ib.bottom)}; });
  ok('3 a long press opens the action mode on the note ('+await actsOn(pg)+'): '+JSON.stringify(geo), await actsOn(pg)==='n3' && geo.bs.every(([w,h])=>w>=48 && h>=48) && geo.gaps.every(g=>g>=12) && geo.inside);
  await escape();

  // 4 the release of a long press over where the bin appears presses nothing; a fresh tap on a button then acts
  const r2=await boxOf(item(pg,'n2')); await holdAt(r2.x+r2.w-8-24, r2.cy); const s2=await stored(pg,'n2');
  ok('4 a long press released over where the bin appears trashes nothing (deleted '+!!s2.deleted+'), the mode stays on n2', !s2.deleted && !s2.archived && !s2.pinned && await actsOn(pg)==='n2');

  // 5 the pin pins, the mode follows the note to «Закріплені», the pin shows its state with one name; a second tap unpins
  await tap(item(pg,'n2').locator('.it-p')); await until(async()=>((await stored(pg,'n2'))||{}).pinned>0);
  const pinA=await pg.evaluate(()=>{ const b=document.querySelector('#list .item[data-id="n2"] .it-p'), r=document.querySelector('#list .item[data-id="n2"] .it-r'); return {pressed:b.getAttribute('aria-pressed'), label:b.getAttribute('aria-label'), bg:getComputedStyle(b).backgroundColor, rbg:getComputedStyle(r).backgroundColor, first:document.querySelector('#list .item').dataset.id}; });
  ok('5 a tap on the pin pins n2 ('+pinA.first+' first); the mode stays on it; the pin says pressed with its one name «'+pinA.label+'» and looks pressed', (await stored(pg,'n2')).pinned>0 && await actsOn(pg)==='n2' && pinA.first==='n2' && pinA.pressed==='true' && pinA.label==='Закріпити вгорі' && pinA.bg!==pinA.rbg);
  await tap(item(pg,'n2').locator('.it-p')); await until(async()=>!((await stored(pg,'n2'))||{}).pinned);
  ok('5b a second tap unpins, the mode stays', !(await stored(pg,'n2')).pinned && await actsOn(pg)==='n2' && await item(pg,'n2').locator('.it-p').getAttribute('aria-pressed')==='false');
  await escape();

  // 6 a redraw during a long press (a pin, a sync) rebuilds the item under the finger: the gesture still ends, the release presses nothing
  const r1=await boxOf(item(pg,'n1')); await touch('touchStart',[{x:r1.x+r1.w-32, y:r1.cy}]); await pg.waitForTimeout(150); await pg.evaluate(()=>sheetDebug.relist());
  const pressed=await item(pg,'n1').evaluate(d=>d.classList.contains('press')); await pg.waitForTimeout(450); await pg.evaluate(()=>sheetDebug.relist()); await touch('touchEnd',[]); await pg.waitForTimeout(300);
  const s1=await stored(pg,'n1');
  ok('6 a redraw during the long press: the pressed look survives ('+pressed+'), the mode opens on n1 ('+await actsOn(pg)+'), the release presses nothing', pressed && await actsOn(pg)==='n1' && !s1.deleted && !s1.archived && !s1.pinned);
  await escape(); await tap(item(pg,'n4'));
  ok('6b after it a tap opens a note as usual ('+await cur(pg)+')', await cur(pg)==='n4');

  // 7 a tap on another item while a mode is open only closes the mode
  await panel(); await hold(item(pg,'n1')); await tap(item(pg,'n5'));
  ok('7 a tap on another item closes the mode and opens nothing (open: '+await cur(pg)+', mode: '+await actsOn(pg)+')', await actsOn(pg)===null && await cur(pg)==='n4' && await sideOpen(pg));
  const n0=await count(pg); await hold(item(pg,'n1')); await tap(pg.locator('#newBtn')); await pg.waitForTimeout(300);
  ok('7b a tap on «Нова» outside the list only closes the mode: no new note ('+n0+' → '+await count(pg)+'), the open note stays ('+await cur(pg)+'), mode '+await actsOn(pg), await actsOn(pg)===null && await count(pg)===n0 && await cur(pg)==='n4' && await sideOpen(pg));
  // 7c right after such a tap the keyboard still works: Enter and Space on «Нова», and Ctrl+Alt+N, each make a note
  const kbNew=async key=>{ await panel(); await hold(item(pg,'n1')); await tap(pg.locator('#newBtn')); const before=await count(pg); await pg.focus('#newBtn'); await pg.keyboard.press(key); await until(async()=>await count(pg)>before, 3000); return (await count(pg))-before; };
  const kb=[await kbNew('Enter'), await kbNew('Space'), await kbNew('Control+Alt+KeyN')];
  ok('7c right after a tap outside closed the mode, Enter, Space and Ctrl+Alt+N each make a note: '+kb.join(', '), kb.every(k=>k===1));
  // 7d a mouse press on «Нова» held 1.2 s while the mode is open only closes it; the next quick click makes a note
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n4"]').click()); await pg.waitForTimeout(400); await panel(); await hold(item(pg,'n1'));
  const nb=await boxOf(pg.locator('#newBtn')), c0=await count(pg); await pg.mouse.move(nb.cx, nb.cy); await pg.mouse.down(); await pg.waitForTimeout(1200); await pg.mouse.up(); await pg.waitForTimeout(400);
  const longClose=[await actsOn(pg), (await count(pg))-c0]; await pg.mouse.click(nb.cx, nb.cy); await until(async()=>await count(pg)>c0, 3000);
  ok('7d a mouse press held 1.2 s on «Нова» only closes the mode (mode '+longClose[0]+', new notes '+longClose[1]+'); the next click makes one ('+((await count(pg))-c0)+')', longClose[0]===null && longClose[1]===0 && (await count(pg))-c0===1);
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n4"]').click()); await pg.waitForTimeout(400); await panel();

  // 8 a scroll of the list by the user, Escape and Back close the mode; after Back the panel stays, the next Back closes it
  await hold(item(pg,'n1')); await pg.waitForTimeout(100); await pg.evaluate(()=>{ document.getElementById('list').scrollTop=120; }); await pg.waitForTimeout(250);
  const afterScroll=await actsOn(pg); await pg.evaluate(()=>{ document.getElementById('list').scrollTop=0; }); await pg.waitForTimeout(200);
  await hold(item(pg,'n1')); await escape(); const afterEsc=await actsOn(pg);
  await hold(item(pg,'n1')); await pg.goBack(); await pg.waitForTimeout(400); const afterBack=await actsOn(pg), sideAfterBack=await sideOpen(pg);
  await pg.goBack(); await pg.waitForTimeout(400);
  ok('8 a user scroll ('+afterScroll+'), Escape ('+afterEsc+') and Back ('+afterBack+') close the mode; the panel stays after Back ('+sideAfterBack+') and the next Back closes it', afterScroll===null && afterEsc===null && afterBack===null && sideAfterBack && !(await sideOpen(pg)));

  // 9 a press that moves (a scroll) or is cancelled opens nothing
  await panel(); const curBefore=await cur(pg); const b6=await boxOf(item(pg,'n6'));
  await touch('touchStart',[{x:b6.cx,y:b6.cy}]); await pg.waitForTimeout(100); await touch('touchMove',[{x:b6.cx,y:b6.cy+20}]); await pg.waitForTimeout(600); await touch('touchEnd',[]); await pg.waitForTimeout(300);
  const moved=await actsOn(pg), movedCur=await cur(pg);
  await touch('touchStart',[{x:b6.cx,y:b6.cy}]); await pg.waitForTimeout(150); await touch('touchCancel',[]); await pg.waitForTimeout(600);
  ok('9 a press that moves 20 px opens no mode ('+moved+') and no note ('+movedCur+'); a cancelled press opens nothing ('+await actsOn(pg)+')', moved===null && movedCur===curBefore && await actsOn(pg)===null && await cur(pg)===curBefore);

  // 10 archive from the mode; in the archive the way back looks pressed (no aria-pressed: a one-shot action) and returns the note
  await hold(item(pg,'n7')); await tap(item(pg,'n7').locator('.it-r')); await until(async()=>((await stored(pg,'n7'))||{}).archived>0);
  ok('10 archive from the mode: n7 stored archived, the mode is gone, the toast: «'+await pg.locator('#undo .umsg').innerText()+'»', (await stored(pg,'n7')).archived>0 && await actsOn(pg)===null && await item(pg,'n7').count()===0);
  await panel(); await pg.click('#archRow'); await pg.waitForTimeout(300); await hold(item(pg,'n7'));
  const back=await item(pg,'n7').locator('.it-r').evaluate(b=>({cls:b.classList.contains('back'), pressed:b.getAttribute('aria-pressed'), title:b.title, bg:getComputedStyle(b).backgroundColor, xbg:getComputedStyle(b.parentNode.querySelector('.it-x')).backgroundColor}));
  ok('10b in the archive the button «'+back.title+'» looks pressed and has no aria-pressed', back.cls && back.pressed===null && back.title==='Повернути до нотаток' && back.bg!==back.xbg);
  await tap(item(pg,'n7').locator('.it-r')); await until(async()=>!((await stored(pg,'n7'))||{}).archived);
  ok('10c it returns the note to the notes', !(await stored(pg,'n7')).archived);

  // 11 the trash: the mode offers «Відновити» and «Видалити назавжди», which still asks
  await panel(); await hold(item(pg,'n8')); await tap(item(pg,'n8').locator('.it-x')); await until(async()=>((await stored(pg,'n8'))||{}).deleted>0);
  await panel(); await pg.click('#trashRow'); await pg.waitForTimeout(300); await hold(item(pg,'n8'));
  const tt=await item(pg,'n8').evaluate(d=>[d.querySelector('.it-r').title, d.querySelector('.it-x').title, !!d.querySelector('.it-p')]);
  await tap(item(pg,'n8').locator('.it-x')); await until(()=>pg.evaluate(()=>document.getElementById('ask').open),3000); const asked=await pg.evaluate(()=>document.getElementById('ask').open);
  ok('11 in the trash the mode offers «'+tt[0]+'» and «'+tt[1]+'» (no pin: '+!tt[2]+'); delete forever asks ('+asked+')', tt[0]==='Відновити' && tt[1]==='Видалити назавжди' && !tt[2] && asked && natives===0);
  await tap(pg.locator('#askTitle')); const still=await pg.evaluate(()=>document.getElementById('ask').open); await pg.goBack(); await pg.waitForTimeout(400);
  const askAfterBack=await pg.evaluate(()=>document.getElementById('ask').open), s8=await stored(pg,'n8');
  ok('11b a touch on the dialog\'s text keeps it open ('+still+'), Back then closes it ('+!askAfterBack+') and deletes nothing', still && !askAfterBack && s8 && s8.deleted>0);
  await escape(); await escape();

  // 12 the pinned look: a pin mark and a background of its own
  await panel(); await pg.click('#sectBack'); await pg.waitForTimeout(300);   // from the trash back to the notes
  await hold(item(pg,'n9')); await tap(item(pg,'n9').locator('.it-p')); await until(async()=>((await stored(pg,'n9'))||{}).pinned>0); await escape();
  const look=await pg.evaluate(()=>{ const p=document.querySelector('#list .item[data-id="n9"]'), u=document.querySelector('#list .item[data-id="n10"]'), t=document.createElement('div'); t.style.background='var(--pin-bg)'; document.body.appendChild(t); const want=getComputedStyle(t).backgroundColor; t.remove(); return {want, mark:!!p.querySelector('.pmark') && getComputedStyle(p.querySelector('.pmark')).display!=='none', umark:!!u.querySelector('.pmark'), pbg:getComputedStyle(p).backgroundColor, ubg:getComputedStyle(u).backgroundColor, sr:(p.querySelector('.sr-only')||{}).textContent}; });
  ok('12 a pinned item just touched has the pin mark and its own background ('+look.pbg+', --pin-bg '+look.want+'; unpinned '+look.ubg+'); a screen reader hears «'+look.sr+'»', look.mark && !look.umark && look.pbg===look.want && look.pbg!==look.ubg && look.sr==='закріплена');
  const pad=await pg.evaluate(()=>[...document.querySelectorAll('#list .item.cur .it-t, #list .item[data-id="n9"] .it-t')].map(t=>getComputedStyle(t).paddingRight));
  ok('12b at rest the titles take the full width, the open note\'s and a touched one\'s included ('+pad.join(', ')+')', pad.length>=1 && pad.every(p=>p==='0px'));

  // 13 a long press does not open the browser's menu: contextmenu on an item is cancelled
  const b10=await boxOf(item(pg,'n10')); await touch('touchStart',[{x:b10.cx,y:b10.cy}]); await pg.waitForTimeout(600);
  const prevented=await item(pg,'n10').evaluate(d=>{ const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true}); d.dispatchEvent(e); return e.defaultPrevented; });
  await touch('touchEnd',[]); await pg.waitForTimeout(250); await escape();
  ok('13 contextmenu on an item is cancelled on touch ('+prevented+')', prevented);
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── 14 the hint: the first three taps that open a note say how to reach the actions, the fourth does not ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  await fresh(pg); const seen=[];
  for(const id of ['n1','n2','n3','n4']){ await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; });
    if(!(await sideOpen(pg))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); }
    const b=await boxOf(item(pg,id)); await touch('touchStart',[{x:b.cx,y:b.cy}]); await pg.waitForTimeout(40); await touch('touchEnd',[]); await pg.waitForTimeout(400);
    seen.push(/Утримуйте нотатку/.test(await pg.locator('#toast').innerText())); }
  ok('14 the hint on the first three taps, not on the fourth: '+seen.join(','), seen.join(',')==='true,true,true,false');
  console.log(errs.length? errs.join('\n') : '✓ hint: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── 18 a wide touch screen with a mouse: a click on the sheet that closes the action mode only closes it (no block) ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1024,height:800}, hasTouch:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(400);
  if(!(await sideOpen(pg))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); }
  const blocks=()=>pg.evaluate(()=>document.querySelectorAll('#sheet .blk').length);
  const b=await boxOf(item(pg,'n2')); await touch('touchStart',[{x:b.cx,y:b.cy}]); await pg.waitForTimeout(650); await touch('touchEnd',[]); await pg.waitForTimeout(250);
  const mode=await actsOn(pg), s=await boxOf(pg.locator('#sheet')), k0=await blocks(), x=s.x+s.w*0.6, y=s.y+Math.min(s.h-40, 420);
  await pg.mouse.click(x, y); await pg.waitForTimeout(500); const k1=await blocks(), after=await actsOn(pg);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); await pg.mouse.click(x, y); await pg.waitForTimeout(500); const k2=await blocks();
  ok('18 at 1024px on touch a mouse click on the sheet closes the mode of '+mode+' ('+after+') and makes no block ('+k0+' → '+k1+'); the next click there works as before ('+k2+')', mode==='n2' && after===null && k1===k0 && k2>k1);
  // 19 the settings or the header «⋯» opened from the keyboard while the mode is open: the mode goes first, so the settings keep their own history
  // entry (Back closes them and stays in the app) and a click on the sheet closes them
  const holdN2=async()=>{ const b=await boxOf(item(pg,'n2')); await touch('touchStart',[{x:b.cx,y:b.cy}]); await pg.waitForTimeout(650); await touch('touchEnd',[]); await pg.waitForTimeout(250); };
  const setOpen=()=>pg.evaluate(()=>!document.getElementById('setPop').hidden), inApp=()=>pg.evaluate(()=>!!document.getElementById('app'));
  await holdN2(); await pg.focus('#setBtn'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  const st1={mode:await actsOn(pg), set:await setOpen()}; await pg.goBack(); await pg.waitForTimeout(400); const st2={set:await setOpen(), app:await inApp()};
  await holdN2(); await pg.focus('#setBtn'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); await pg.mouse.click(x, y); await pg.waitForTimeout(400); const st3={set:await setOpen()};
  await holdN2(); await pg.focus('#moreBtn'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300); const st4={mode:await actsOn(pg), menu:await pg.locator('.amenu.hm').count()};
  await pg.mouse.click(x, y); await pg.waitForTimeout(400); const st5={menu:await pg.locator('.amenu.hm').count()};
  ok('19 the settings opened from the keyboard close the mode '+JSON.stringify(st1)+'; Back closes them in the app '+JSON.stringify(st2)+'; a click on the sheet closes them '+JSON.stringify(st3)+'; the header «⋯» the same '+JSON.stringify(st4)+' → '+JSON.stringify(st5),
    st1.mode===null && st1.set && !st2.set && st2.app && !st3.set && st4.mode===null && st4.menu===1 && st5.menu===0);
  console.log(errs.length? errs.join('\n') : '✓ wide touch: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── a computer: the hover buttons with state, the right-click menu ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"]').click()); await pg.waitForTimeout(400);
  await item(pg,'n2').hover(); const hb=await boxOf(item(pg,'n2').locator('.it-p')); await item(pg,'n2').locator('.it-p').click(); await until(async()=>((await stored(pg,'n2'))||{}).pinned>0);
  await item(pg,'n2').hover(); await pg.waitForTimeout(150);
  const st=await item(pg,'n2').locator('.it-p').evaluate(b=>({pressed:b.getAttribute('aria-pressed'), bg:getComputedStyle(b).backgroundColor, w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height)}));
  ok('16 hover buttons stay 24×24 ('+Math.round(hb.w)+'×'+Math.round(hb.h)+'); a pinned note\'s pin says pressed and looks pressed ('+st.bg+')', Math.round(hb.w)===24 && Math.round(hb.h)===24 && st.w===24 && st.pressed==='true' && st.bg!=='rgba(0, 0, 0, 0)');

  // 17 the right-click menu at the pointer
  const b3=await boxOf(item(pg,'n3')); await pg.mouse.click(b3.x+40, b3.cy, {button:'right'}); await pg.waitForTimeout(200);
  const m=await pg.evaluate(()=>{ const m=document.querySelector('.amenu.ctx'); if(!m) return null; const r=m.getBoundingClientRect(); return {items:[...m.querySelectorAll('.mi')].map(b=>b.textContent.trim()), pin:m.querySelector('[role=menuitemcheckbox]') && m.querySelector('[role=menuitemcheckbox]').getAttribute('aria-checked'), inside:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight, left:Math.round(r.left), focus:document.activeElement && document.activeElement.textContent.trim()}; });
  ok('17 a right click opens the menu at the pointer ('+(m&&m.left)+' near '+Math.round(b3.x+40)+'), inside the window: '+(m&&m.items.join(' | '))+'; «Закріпити вгорі» checked '+(m&&m.pin), m && m.inside && Math.abs(m.left-(b3.x+40))<=2 && m.items.join('|')==='Відкрити|Закріпити вгорі|Перенести в архів|Перемістити в кошик' && m.pin==='false' && m.focus==='Відкрити');
  await pg.keyboard.press('ArrowDown'); const f1=await pg.evaluate(()=>document.activeElement.textContent.trim()); await pg.keyboard.press('End'); const f2=await pg.evaluate(()=>document.activeElement.textContent.trim());
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); const back=await pg.evaluate(()=>({menu:!!document.querySelector('.amenu.ctx'), item:document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id}));
  ok('17b the arrows move («'+f1+'», End «'+f2+'»); Escape closes it and the focus returns to the item ('+back.item+')', f1==='Закріпити вгорі' && f2==='Перемістити в кошик' && !back.menu && back.item==='n3');
  await pg.keyboard.press('Shift+F10'); await pg.waitForTimeout(200); const kb=await pg.locator('.amenu.ctx').count();
  await pg.locator('.amenu.ctx .mi',{hasText:'Закріпити вгорі'}).click(); await until(async()=>((await stored(pg,'n3'))||{}).pinned>0); await pg.waitForTimeout(400);
  ok('17c Shift+F10 on the focused item opens it ('+kb+'); «Закріпити вгорі» pins n3 and the menu closes', kb===1 && (await stored(pg,'n3')).pinned>0 && await pg.locator('.amenu.ctx').count()===0);
  const b3b=await boxOf(item(pg,'n3')); await pg.mouse.click(b3b.x+40, b3b.cy, {button:'right'}); await pg.waitForTimeout(200);
  const checked=await pg.locator('.amenu.ctx [role=menuitemcheckbox]').getAttribute('aria-checked');
  await pg.locator('.amenu.ctx .mi',{hasText:'Перенести в архів'}).click(); await until(async()=>((await stored(pg,'n3'))||{}).archived>0); await pg.waitForTimeout(400);
  const b4=await boxOf(item(pg,'n4')); await pg.mouse.click(b4.x+40, b4.cy, {button:'right'}); await pg.waitForTimeout(200); await pg.locator('.amenu.ctx .mi',{hasText:'Відкрити'}).click(); await pg.waitForTimeout(400);
  const opened=await cur(pg);
  const b5=await boxOf(item(pg,'n5')); await pg.mouse.click(b5.x+40, b5.cy, {button:'right'}); await pg.waitForTimeout(200); await pg.locator('.amenu.ctx .mi',{hasText:'Перемістити в кошик'}).click(); await until(async()=>((await stored(pg,'n5'))||{}).deleted>0);
  ok('17d the menu shows the pin checked ('+checked+'); «Перенести в архів», «Відкрити» ('+opened+') and «Перемістити в кошик» act', checked==='true' && (await stored(pg,'n3')).archived>0 && opened==='n4' && (await stored(pg,'n5')).deleted>0);
  console.log(errs.length? errs.join('\n') : '✓ computer: no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
