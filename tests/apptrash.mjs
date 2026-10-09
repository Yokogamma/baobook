import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const DAY=864e5, T0=Date.now();
const NOTES=[{id:'n1',title:'Перша',blocks:[{id:'a1',row:2,text:'рядок першої',fx:0.2}],created:1,updated:T0},
  {id:'n2',title:'Друга',blocks:[{id:'b1',row:2,text:'рядок другої',fx:0.2}],created:1,updated:T0-60000},
  {id:'n3',title:'Третя',blocks:[{id:'c1',row:2,text:'рядок третьої',fx:0.2}],created:1,updated:T0-120000}];
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const fresh=async(pg,notes=NOTES)=>{ await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.setInputFiles('#importFile',file(notes)); await pg.waitForTimeout(800);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), notes.map(n=>n.id)); await pg.waitForTimeout(500); };   // the empty note of the first start goes for good
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id));
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);
const cur=pg=>pg.evaluate(()=>window.sheetDebug.cur());
const isOpen=pg=>pg.evaluate(()=>document.getElementById('ask').open);
const strip=pg=>pg.evaluate(()=>!document.getElementById('roStrip').hidden);   // its wrapper has no height, so Playwright never calls it visible
const bin=async(pg,id)=>{ const it=pg.locator('#list .item[data-id="'+id+'"]'); await it.hover(); await it.locator('.it-x').click(); await pg.waitForTimeout(400); };

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); let natives=0; pg.on('dialog',d=>{ natives++; d.dismiss(); });
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300);
  ok('0 an empty trash shows no row in the footer', await pg.locator('#trashRow').isHidden());

  // 1 the bin moves the open note to the trash: no dialog, the next note opens, the toast takes it back
  await bin(pg,'n1'); const r1=await stored(pg,'n1'), msg=await pg.locator('#undo .umsg').innerText();
  ok('1a no dialog; «Перша» left the list and is stored with deleted ('+(r1&&r1.deleted? 'yes' : 'no')+'); «Друга» is open', !await isOpen(pg) && natives===0 && !(await items(pg)).includes('n1') && r1 && r1.deleted>0 && await cur(pg)==='n2');
  ok('1b toast «'+msg+'»; the footer row says «'+(await pg.locator('#trashRow').innerText()).replace(/\s+/g,' ')+'»; storage counts '+(await pg.locator('#storInfo').innerText()).split('·')[0].trim(), msg==='Нотатку «Перша» переміщено в кошик' && /Кошик\s*1/.test(await pg.locator('#trashRow').innerText()) && /^2 нотатки/.test(await pg.locator('#storInfo').innerText()));
  await pg.screenshot({path:OUT+'/apptrash-moved.png'});
  await pg.waitForTimeout(7600);
  ok('1c the toast hides after its timer: the trash keeps the note anyway', await pg.locator('#undo').evaluate(e=>e.hidden || !e.classList.contains('show')));
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500); const r1b=await stored(pg,'n1');
  ok('1d Ctrl+Z still brings it back to the list and opens it; the trash row hides', (await items(pg)).includes('n1') && await cur(pg)==='n1' && r1b && !r1b.deleted && await pg.locator('#trashRow').isHidden());

  // 2 the trash section
  await bin(pg,'n1'); await bin(pg,'n2'); await pg.click('#trashRow'); await pg.waitForTimeout(250);
  const head=(await pg.locator('#sect').innerText()).replace(/\s+/g,' '), left=await pg.locator('#list .item .it-d').allInnerTexts();
  ok('2a the panel shows the trash: «'+head+'»; items '+(await items(pg)).join(',')+' with «'+left.join('», «')+'»', /Кошик/.test(head) && /30 днів/.test(head) && /Очистити кошик/.test(head) && (await items(pg)).join(',')==='n2,n1' && left.every(t=>t==='ще 30 днів') && await pg.locator('#trashRow').isHidden());
  await pg.fill('#q','другої'); await pg.waitForTimeout(250);
  ok('2b search in the trash filters the trash ('+(await items(pg)).join(',')+')', (await items(pg)).join(',')==='n2');
  await pg.click('#sectBack'); await pg.waitForTimeout(250); await pg.fill('#q','рядок'); await pg.waitForTimeout(250);
  ok('2c «←» goes back to the notes and clears the query; search there skips the trash ('+(await items(pg)).join(',')+')', await pg.locator('#sect').isHidden() && (await items(pg)).join(',')==='n3');
  await pg.fill('#q',''); await pg.waitForTimeout(200);

  // 3 a trashed note opens read-only
  await pg.click('#trashRow'); await pg.waitForTimeout(250); await open(pg,'n2'); await pg.waitForTimeout(400);
  const st=await pg.evaluate(()=>({inert:document.getElementById('sheet').inert, ttl:document.getElementById('ttl').contentEditable, strip:document.getElementById('roMsg').textContent, hidden:['clearBtn','areaBtn','histBtn'].filter(id=>getComputedStyle(document.getElementById(id)).display==='none')}));
  ok('3a read-only: sheet inert '+st.inert+', title editable '+st.ttl+', strip «'+st.strip+'», hidden '+st.hidden.join(','), st.inert && st.ttl==='false' && st.strip==='Нотатка в кошику, ще 30 днів' && st.hidden.length===3);
  const sb=await box(pg.locator('.rostrip')), first=await box(pg.locator('#sheet .blk').first());
  ok('3b the strip sits under the header and covers no block (strip '+sb.y+'+'+sb.h+', first block '+first.y+')', sb.y>=44 && sb.y+sb.h<=first.y);
  await pg.screenshot({path:OUT+'/apptrash-readonly.png'});
  await pg.keyboard.press('Control+Alt+h'); await pg.waitForTimeout(300); await pg.mouse.click(700,500); await pg.keyboard.type('x'); await pg.waitForTimeout(500);
  ok('3c Ctrl+Alt+H opens no history, a click and typing change nothing', await pg.locator('#hist').isHidden() && (await pg.locator('#sheet .blk').count())===1 && (await stored(pg,'n2')).blocks.length===1);

  // 4 restore from the strip: editable again, back in the list
  await pg.click('#roRestore'); await pg.waitForTimeout(400);
  ok('4 «Відновити» on the strip: editable, in the list, the trash still holds «Перша»', !(await pg.evaluate(()=>document.getElementById('sheet').inert)) && !await strip(pg) && !(await stored(pg,'n2')).deleted && (await items(pg)).join(',')==='n1');

  // 5 restore from the list item
  await pg.locator('#list .item[data-id="n1"]').hover(); await pg.locator('#list .item[data-id="n1"] .it-r').click(); await pg.waitForTimeout(400);
  ok('5 the item\'s «Відновити»: toast «'+await pg.locator('#toast').innerText()+'», the empty trash gives way to the notes', !(await stored(pg,'n1')).deleted && await pg.locator('#sect').isHidden() && (await items(pg)).includes('n1') && /відновлено/.test(await pg.locator('#toast').innerText()));

  // 6 «Очистити кошик» asks; Esc keeps, confirming removes every note there
  await open(pg,'n1'); await bin(pg,'n1'); await bin(pg,'n3'); await pg.click('#trashRow'); await pg.waitForTimeout(250); await pg.click('#trashEmpty'); await pg.waitForTimeout(250);
  const t6=await pg.locator('#askTitle').innerText(), x6=await pg.locator('#askText').innerText();
  ok('6a «Очистити кошик» asks: «'+t6+'» «'+x6+'»', await isOpen(pg) && t6==='Очистити кошик?' && /^2 нотатки зникнуть назавжди/.test(x6));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok('6b Esc keeps them', (await items(pg)).length===2);
  await pg.click('#trashEmpty'); await pg.waitForTimeout(250); await pg.click('#askYes'); await pg.waitForTimeout(500);
  ok('6c confirming removes both for good', !await stored(pg,'n1') && !await stored(pg,'n3') && await pg.locator('#sect').isHidden() && await pg.locator('#trashRow').isHidden());
  ok('desktop: no native dialogs ('+natives+')', natives===0);
  console.log(errs.length? errs.join('\n') : '✓ desktop: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── 30 days, reload, import and export ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg,[...NOTES, {id:'old',title:'Давня',blocks:[{id:'o1',row:2,text:'давно в кошику',fx:0.2}],created:1,updated:T0-40*DAY,deleted:T0-31*DAY},
    {id:'late',title:'Пізня',blocks:[{id:'l1',row:2,text:'майже',fx:0.2}],created:1,updated:T0-30*DAY,deleted:T0-29.5*DAY}]);
  ok('7a import keeps «deleted»: both are in the trash, not in the list', !(await items(pg)).includes('old') && !(await items(pg)).includes('late') && /Кошик\s*2/.test(await pg.locator('#trashRow').innerText()));
  await pg.reload(); await pg.waitForTimeout(800); await pg.click('#trashRow'); await pg.waitForTimeout(250);
  ok('7b at start a note older than 30 days is deleted for good; the other has «'+await pg.locator('#list .item[data-id="late"] .it-d').innerText()+'»', !await stored(pg,'old') && (await items(pg)).join(',')==='late' && await pg.locator('#list .item[data-id="late"] .it-d').innerText()==='ще 1 день');
  await open(pg,'late'); await pg.waitForTimeout(300); await pg.reload(); await pg.waitForTimeout(800);
  ok('7c a reload while a trashed note is open opens a note from the list ('+await cur(pg)+')', ['n1','n2','n3'].includes(await cur(pg)) && !await strip(pg));
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.evaluate(()=>{ document.getElementById('setBtn').click(); document.getElementById('exportBtn').click(); })]);
  const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8')), late=ex.notes.find(n=>n.id==='late');
  ok('8a export carries the trash with «deleted» ('+(late? late.deleted : 'none')+')', late && late.deleted===Math.round(T0-29.5*DAY) && ex.notes.length===4);
  await pg.setInputFiles('#importFile',file([{...NOTES[0], id:'late', title:'Пізня', updated:Date.now()+1000}])); await pg.waitForTimeout(800);
  ok('8b a newer copy without «deleted» (restored elsewhere) brings it back to the list', (await items(pg)).includes('late') && !(await stored(pg,'late')).deleted);
  await bin(pg,'late'); await pg.setInputFiles('#importFile',file([{...NOTES[0], id:'late', title:'Пізня', updated:T0-30*DAY}])); await pg.waitForTimeout(800);
  ok('8c an older copy leaves it in the trash', !(await items(pg)).includes('late') && (await stored(pg,'late')).deleted>0);
  console.log(errs.length? errs.join('\n') : '✓ storage: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── two tabs ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const errs=[];
  const page=async()=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await pg.goto(SITE); await pg.waitForTimeout(600); return pg; };
  const A=await page(); await fresh(A); const B=await page(); await open(A,'n1'); await open(B,'n2'); await A.waitForTimeout(300);
  await A.bringToFront(); await bin(A,'n1'); await B.waitForTimeout(400);
  ok('9a a note moved to the trash in A leaves B\'s list and shows in its trash row', !(await items(B)).includes('n1') && /Кошик\s*1/.test(await B.locator('#trashRow').innerText()));
  await A.click('#undo .ubtn'); await B.waitForTimeout(500);   // within the toast's seconds
  ok('9b undone in A, it is back in B', (await items(B)).includes('n1') && await B.locator('#trashRow').isHidden());
  await open(B,'n1'); await B.waitForTimeout(300); await A.bringToFront(); await bin(A,'n1'); await B.waitForTimeout(500);
  ok('9c B showing that note now shows it read-only, with the strip', await B.evaluate(()=>document.getElementById('sheet').inert) && await strip(B));
  console.log(errs.length? errs.join('\n') : '✓ tabs: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300);
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="n1"] .it-x').click()); await pg.waitForTimeout(400);
  await pg.click('#undo .uclose'); await pg.click('#sideBtn'); await pg.waitForTimeout(400); const rb=await box(pg.locator('#trashRow'));
  ok('10a the trash row is a 44px target ('+rb.h+')', rb.h>=44);
  await pg.click('#trashRow'); await pg.waitForTimeout(300);
  ok('10b the trash section has its own history entry', (await pg.evaluate(()=>history.state&&history.state.nav))==='trash' && await pg.locator('#sect').isVisible());
  await pg.goBack(); await pg.waitForTimeout(400);
  ok('10c system Back returns to the notes, the panel stays open', await pg.locator('#sect').isHidden() && await pg.evaluate(()=>document.getElementById('app').classList.contains('open')));
  await pg.click('#trashRow'); await pg.waitForTimeout(300); await open(pg,'n1'); await pg.waitForTimeout(500);
  const sb=await box(pg.locator('.rostrip')), fb=await box(pg.locator('#sheet .blk').first()), btn=await box(pg.locator('#roRestore')), btn2=await box(pg.locator('#roPurge'));
  ok('10d the read-only strip fits the screen ('+sb.x+'+'+sb.w+' of 390), covers no block ('+sb.y+'+'+sb.h+' vs '+fb.y+'), buttons '+btn.h+'px on one row', sb.x>=0 && sb.x+sb.w<=390 && await strip(pg) && sb.y+sb.h<=fb.y && btn.h>=40 && btn.y===btn2.y);
  await pg.screenshot({path:OUT+'/apptrash-phone.png'});
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
