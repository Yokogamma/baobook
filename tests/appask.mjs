import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const NOTES=[{id:'n1',title:'',blocks:[{id:'a1',row:2,text:'перший рядок',fx:0.2},{id:'a2',row:5,text:'другий',fx:0.2},{id:'a3',row:8,text:'третій',fx:0.2}],created:1,updated:Date.now()},
  {id:'n2',title:'Друга',blocks:[{id:'c1',row:2,text:'текст другої',fx:0.2}],created:1,updated:Date.now()-60000}];
const fresh=async pg=>{ await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:NOTES}))}); await pg.waitForTimeout(800); };
const isOpen=pg=>pg.evaluate(()=>document.getElementById('ask').open);
const texts=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).sort().join('|'));
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id));
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const settle=pg=>pg.evaluate(()=>window.sheetDebug.vers.queue());
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); let natives=0; pg.on('dialog',d=>{ natives++; d.dismiss(); });
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300);
  const ask=pg.locator('#ask');

  // 1 clearing the sheet asks in our own dialog
  await pg.click('#clearBtn'); await pg.waitForTimeout(250);
  const t1=await pg.locator('#askTitle').innerText(), x1=await pg.locator('#askText').innerText(), y1=await pg.locator('#askYes').innerText(), no1=await pg.locator('#askNo').innerText(), f1=await pg.evaluate(()=>document.activeElement.id), b1=await box(ask);
  ok('1a «Очистити аркуш» opens our dialog, not the browser\'s: «'+t1+'» «'+x1+'» ['+no1+'] ['+y1+'], focus on '+f1, await isOpen(pg) && natives===0 && t1==='Очистити аркуш?' && /3 блоки/.test(x1) && y1==='Очистити' && no1==='Скасувати' && f1==='askNo');
  ok('1b the dialog is centred ('+b1.x+'+'+b1.w+' of 1280)', Math.abs(b1.x+b1.w/2-640)<=2 && b1.w<=380);
  await pg.screenshot({path:OUT+'/appask-clear.png'});
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  ok('1c Esc cancels: the dialog is closed and the blocks stay ('+await texts(pg)+')', !await isOpen(pg) && await texts(pg)==='другий|перший рядок|третій');

  // 2 the page under the dialog hears no keys; a click outside cancels
  await pg.click('#clearBtn'); await pg.waitForTimeout(250); const n0=(await items(pg)).length;
  await pg.keyboard.press('Control+Alt+n'); await pg.waitForTimeout(250);
  ok('2a Ctrl+Alt+N under the dialog makes no note ('+n0+' → '+(await items(pg)).length+'), the dialog stays', (await items(pg)).length===n0 && await isOpen(pg));
  await pg.mouse.click(20,880); await pg.waitForTimeout(250);
  ok('2b a click on the backdrop cancels, the blocks stay', !await isOpen(pg) && await texts(pg)==='другий|перший рядок|третій');

  // 3 confirming clears; «Скасувати» brings the blocks back; the state before is a version
  await pg.click('#clearBtn'); await pg.waitForTimeout(250); await pg.click('#askYes'); await pg.waitForTimeout(300); await settle(pg);
  const umsg=await pg.locator('#undo .umsg').innerText(), vers=await pg.evaluate(()=>window.sheetDebug.vers.list('n1'));
  ok('3a «Очистити» empties the sheet and shows «'+umsg+'»', (await pg.locator('#sheet .blk').count())===0 && !await isOpen(pg) && umsg==='Аркуш очищено');
  const top=vers.slice().sort((a,b)=>b.w-a.w)[0];
  ok('3b the newest version is the state before clearing ('+vers.map(v=>v.reason+':'+v.blocks.length).join(', ')+')', top && top.blocks.length===3);   // written now, or skipped when it already was the newest
  await pg.waitForTimeout(7600);
  ok('3c the toast has no timer: still shown after 7.6 s', await pg.locator('#undo').evaluate(e=>!e.hidden && e.classList.contains('show')));
  await pg.click('#undo .ubtn'); await pg.waitForTimeout(800); const back=await stored(pg,'n1');
  ok('3d «Скасувати» puts the blocks back ('+await texts(pg)+') and they are saved ('+(back? back.blocks.length : 0)+')', await texts(pg)==='другий|перший рядок|третій' && back && back.blocks.filter(d=>(d.text||'').trim()).length===3);

  // 4 deleting a note with text asks; Esc keeps it, «Видалити» deletes it with its versions
  await pg.locator('#list .item.cur .it-x').click(); await pg.waitForTimeout(300);
  const t4=await pg.locator('#askTitle').innerText(), x4=await pg.locator('#askText').innerText(), y4=await pg.locator('#askYes').innerText();
  ok('4a the delete button asks: «'+t4+'» «'+x4+'» ['+y4+']', await isOpen(pg) && natives===0 && t4==='Видалити нотатку «перший рядок»?' && /історією версій/.test(x4) && y4==='Видалити');
  await pg.screenshot({path:OUT+'/appask-delete.png'});
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  ok('4b Esc keeps the note', !await isOpen(pg) && (await items(pg)).includes('n1') && !!await stored(pg,'n1'));
  await pg.locator('#list .item.cur .it-x').click(); await pg.waitForTimeout(300); await pg.click('#askYes'); await pg.waitForTimeout(400); await settle(pg);
  ok('4c «Видалити» deletes the note, its storage and its versions', !(await items(pg)).includes('n1') && !await stored(pg,'n1') && (await pg.evaluate(()=>window.sheetDebug.vers.list('n1'))).length===0);

  // 5 an empty note goes without asking
  await pg.click('#newBtn'); await pg.waitForTimeout(300); const e5=await pg.evaluate(()=>window.sheetDebug.cur()); const c5=(await items(pg)).length;
  await pg.locator('#list .item.cur .it-x').click(); await pg.waitForTimeout(400);
  ok('5 an empty note is deleted at once, with no dialog ('+c5+' → '+(await items(pg)).length+' notes)', !await isOpen(pg) && natives===0 && !(await items(pg)).includes(e5) && !await stored(pg,e5));

  // 6 an empty note that has history still asks
  await pg.click('#newBtn'); await pg.waitForTimeout(300); const e6=await pg.evaluate(()=>window.sheetDebug.cur());
  await pg.mouse.click(500,300); await pg.keyboard.type('чернетка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700);
  await pg.click('#clearBtn'); await pg.waitForTimeout(250); await pg.click('#askYes'); await pg.waitForTimeout(500); await settle(pg);
  await pg.locator('#list .item.cur .it-x').click(); await pg.waitForTimeout(400);
  ok('6 a note emptied by clearing still has history, so deleting it asks («'+await pg.locator('#askTitle').innerText()+'»)', await isOpen(pg) && (await pg.evaluate(id=>window.sheetDebug.vers.list(id), e6)).length>0);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);

  // 7 an empty sheet has nothing to clear: no dialog
  await pg.click('#clearBtn'); await pg.waitForTimeout(300);
  ok('7 «Очистити аркуш» on an empty sheet opens nothing', !await isOpen(pg) && (await items(pg)).includes(e6));

  // 8 the clear button is a broom, the list keeps the bin
  const ic=await pg.evaluate(()=>({clear:document.querySelector('#clearBtn svg').innerHTML, bin:document.querySelector('#list .it-x svg').innerHTML}));
  ok('8 the clear button draws a broom, not the bin of the note list', ic.clear!==ic.bin && /M21 3l-7.5 7.5/.test(ic.clear));
  ok('desktop: no native dialogs ('+natives+')', natives===0);
  console.log(errs.length? errs.join('\n') : '✓ desktop: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone: the dialog is a bottom sheet, system Back cancels it ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); let natives=0; pg.on('dialog',d=>{ natives++; d.dismiss(); });
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(400);
  const viaMenu=async()=>{ await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); };
  await viaMenu(); const item=pg.locator('.amenu.hm .mi.danger'); const d9=await item.locator('svg path').first().getAttribute('d');
  ok('9a the «⋯» menu item «'+(await item.innerText()).trim()+'» draws the broom', /Очистити аркуш/.test(await item.innerText()) && d9==='M21 3l-7.5 7.5');
  await tapEl(item); await pg.waitForTimeout(300);
  const b9=await box(pg.locator('#ask')), yes=await box(pg.locator('#askYes')), no=await box(pg.locator('#askNo'));
  ok('9b a bottom sheet: '+b9.w+'×'+b9.h+' at y '+b9.y+', buttons '+no.h+'/'+yes.h+'px side by side', await isOpen(pg) && b9.w===390 && Math.abs(b9.y+b9.h-844)<=1 && no.h>=44 && yes.h>=44 && no.y===yes.y && no.x<yes.x);
  await pg.screenshot({path:OUT+'/appask-phone.png'});
  ok('9c the dialog has its own history entry ('+JSON.stringify(await pg.evaluate(()=>history.state))+')', (await pg.evaluate(()=>history.state&&history.state.nav))==='ask');
  await pg.goBack(); await pg.waitForTimeout(400);
  ok('9d system Back closes it and the blocks stay ('+await texts(pg)+')', !await isOpen(pg) && await texts(pg)==='другий|перший рядок|третій');
  await viaMenu(); await tapEl(pg.locator('.amenu.hm .mi.danger')); await pg.waitForTimeout(300); await tapEl(pg.locator('#askYes')); await pg.waitForTimeout(400);
  ok('9e «Очистити» on touch empties the sheet and offers «Скасувати»', (await pg.locator('#sheet .blk').count())===0 && !await isOpen(pg) && await pg.locator('#undo').evaluate(e=>!e.hidden));
  ok('phone: no native dialogs ('+natives+')', natives===0);
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
