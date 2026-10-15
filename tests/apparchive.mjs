import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const T0=Date.now();
const NOTES=[{id:'n1',title:'Ключі',blocks:[{id:'a1',row:2,text:'сервер komax',fx:0.2}],created:1,updated:T0},
  {id:'n2',title:'Покупки',blocks:[{id:'b1',row:2,text:'молоко',fx:0.2}],created:1,updated:T0-60000},
  {id:'n3',title:'Komax старий',blocks:[{id:'c1',row:2,text:'старі ключі komax',fx:0.2}],created:1,updated:T0-120000}];
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const fresh=async(pg,notes=NOTES)=>{ await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.setInputFiles('#importFile',file(notes)); await pg.waitForTimeout(800);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), notes.map(n=>n.id)); await pg.waitForTimeout(500); };   // the empty note of the first start goes for good
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id));
const listText=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list > *')].map(d=>d.classList.contains('grp')? '['+d.textContent+']' : d.dataset.id).join(','));
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);
const cur=pg=>pg.evaluate(()=>window.sheetDebug.cur());
const strip=pg=>pg.evaluate(()=>!document.getElementById('roStrip').hidden);   // its wrapper has no height, so Playwright never calls it visible
const btn=async(pg,id,cls)=>{ const it=pg.locator('#list .item[data-id="'+id+'"]'); await it.hover(); await it.locator(cls).click(); await pg.waitForTimeout(400); };

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); let natives=0; pg.on('dialog',d=>{ natives++; d.dismiss(); });
  await fresh(pg); await open(pg,'n3'); await pg.waitForTimeout(300);
  const t0=await pg.locator('#list .item[data-id="n3"] .it-r').getAttribute('title');
  ok('0 a list item offers «'+t0+'» next to the bin; no archive row while the archive is empty', t0==='Перенести в архів' && await pg.locator('#archRow').isHidden());

  // 1 to the archive: out of the list, the next note opens, the toast takes it back
  await btn(pg,'n3','.it-r'); const r1=await stored(pg,'n3'), msg=await pg.locator('#undo .umsg').innerText();
  ok('1a «Komax старий» left the list, stored with archived; «Ключі» is open; no dialog', !(await items(pg)).includes('n3') && r1 && r1.archived>0 && !r1.deleted && await cur(pg)==='n1' && natives===0);
  ok('1b toast «'+msg+'»; row «'+(await pg.locator('#archRow').innerText()).replace(/\s+/g,' ')+'»; storage counts the archive: '+(await pg.locator('#storInfo').innerText()).split('·')[0].trim(), msg==='Нотатку «Komax старий» перенесено в архів' && /Архів\s*1/.test(await pg.locator('#archRow').innerText()) && /^3 нотатки/.test(await pg.locator('#storInfo').innerText()));
  await pg.click('#undo .ubtn'); await pg.waitForTimeout(500);
  ok('1c «Скасувати» brings it back to the list and opens it', (await items(pg)).includes('n3') && await cur(pg)==='n3' && !(await stored(pg,'n3')).archived && await pg.locator('#archRow').isHidden());
  await btn(pg,'n3','.it-r');

  // 2 search in the notes finds archived notes in their own group, below the notes
  await pg.fill('#q','komax'); await pg.waitForTimeout(250); const g=await listText(pg);
  ok('2a search «komax»: '+g, g==='n1,[В архіві],n3');
  await pg.fill('#q','молоко'); await pg.waitForTimeout(250);
  ok('2b no archived match: no group ('+await listText(pg)+')', await listText(pg)==='n2');
  await pg.fill('#q',''); await pg.waitForTimeout(200);

  // 3 the archive section; an archived note opens and edits as usual
  await pg.click('#archRow'); await pg.waitForTimeout(250); const head=(await pg.locator('#sect').innerText()).replace(/\s+/g,' ');
  ok('3a the archive section: «'+head+'», items '+(await items(pg)).join(',')+', no «Очистити кошик»', /^Архів/.test(head) && /без строку/.test(head) && (await items(pg)).join(',')==='n3' && await pg.locator('#trashEmpty').isHidden() && await pg.locator('#archRow').isHidden());
  await open(pg,'n3'); await pg.waitForTimeout(400);
  const st=await pg.evaluate(()=>({inert:document.getElementById('sheet').inert, ttl:document.getElementById('ttl').contentEditable, msg:document.getElementById('roMsg').textContent, btn:document.getElementById('roRestore').textContent, purge:document.getElementById('roPurge').hidden, hist:getComputedStyle(document.getElementById('histBtn')).display}));
  ok('3b editable (inert '+st.inert+', title '+st.ttl+'), strip «'+st.msg+'» with «'+st.btn+'» only, history button '+st.hist, !st.inert && st.ttl==='true' && st.msg==='Нотатка в архіві' && st.btn==='Повернути до нотаток' && st.purge && st.hist!=='none');
  const sb=await box(pg.locator('.rostrip')), fb=await box(pg.locator('#sheet .blk').first());
  ok('3c the strip covers no block ('+sb.y+'+'+sb.h+' vs '+fb.y+')', sb.y+sb.h<=fb.y);
  await pg.screenshot({path:OUT+'/apparchive-open.png'});
  await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' 2024'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const r3=await stored(pg,'n3');
  ok('3d an edit is saved and the note stays archived ('+r3.blocks[0].text+')', r3.blocks[0].text==='старі ключі komax 2024' && r3.archived>0 && !(await items(pg)).includes('n1'));

  // 4 the bin moves an archived note to the trash; a restore brings it back to the archive
  await btn(pg,'n3','.it-x');
  ok('4a the bin on an archived note: in the trash, out of the archive; the empty archive gives way to the notes', (await stored(pg,'n3')).deleted>0 && await pg.locator('#sect').isHidden() && /Кошик\s*1/.test(await pg.locator('#trashRow').innerText()) && await pg.locator('#archRow').isHidden());
  await pg.click('#trashRow'); await pg.waitForTimeout(250); await btn(pg,'n3','.it-r'); const r4=await stored(pg,'n3');
  ok('4b «Відновити» takes it back to the archive: «'+await pg.locator('#toast').innerText()+'»', !r4.deleted && r4.archived>0 && /Архів\s*1/.test(await pg.locator('#archRow').innerText()) && /відновлено в архів/.test(await pg.locator('#toast').innerText()));

  // 5 back to the notes from the strip and from the item
  await pg.click('#archRow'); await pg.waitForTimeout(250); await open(pg,'n3'); await pg.waitForTimeout(300); await pg.click('#roRestore'); await pg.waitForTimeout(400);
  ok('5a «Повернути до нотаток» on the strip: the note stays open, the strip goes, it is in the list', await cur(pg)==='n3' && !await strip(pg) && !(await stored(pg,'n3')).archived && await pg.locator('#sect').isHidden() && (await items(pg)).includes('n3'));
  await btn(pg,'n2','.it-r'); await pg.click('#archRow'); await pg.waitForTimeout(250); await btn(pg,'n2','.it-r');
  ok('5b the item\'s «Повернути до нотаток»: toast «'+await pg.locator('#toast').innerText()+'»', !(await stored(pg,'n2')).archived && (await items(pg)).includes('n2') && /повернуто до нотаток/.test(await pg.locator('#toast').innerText()));

  // 6 a reload keeps an open archived note open
  await btn(pg,'n1','.it-r'); await pg.click('#archRow'); await pg.waitForTimeout(250); await open(pg,'n1'); await pg.waitForTimeout(300); await pg.reload(); await pg.waitForTimeout(900);
  ok('6 after a reload the archived note is open again, with its strip ('+await cur(pg)+')', await cur(pg)==='n1' && await strip(pg));

  // 7 export and import
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.evaluate(()=>{ document.getElementById('setBtn').click(); document.getElementById('exportBtn').click(); })]);
  const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8')), x1=ex.notes.find(n=>n.id==='n1'), x2=ex.notes.find(n=>n.id==='n2');
  ok('7a export carries «archived» on the archived note only', x1 && x1.archived>0 && x2 && !('archived' in x2) && !('deleted' in x2));
  await pg.setInputFiles('#importFile',file([{...NOTES[0], updated:Date.now()+1000}])); await pg.waitForTimeout(800);
  ok('7b a newer copy without «archived» brings it back to the list', (await items(pg)).includes('n1') && !(await stored(pg,'n1')).archived);
  await pg.setInputFiles('#importFile',file([{...NOTES[1], archived:Date.now(), updated:Date.now()+2000}])); await pg.waitForTimeout(800);
  ok('7c a newer copy with «archived» moves it to the archive', !(await items(pg)).includes('n2') && (await stored(pg,'n2')).archived>0);
  ok('desktop: no native dialogs ('+natives+')', natives===0);
  console.log(errs.length? errs.join('\n') : '✓ desktop: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── two tabs ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const errs=[];
  const page=async()=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await pg.goto(SITE); await pg.waitForTimeout(600); return pg; };
  const A=await page(); await fresh(A); const B=await page(); await open(A,'n1'); await open(B,'n2'); await B.waitForTimeout(300);
  await A.bringToFront(); await btn(A,'n2','.it-r'); await B.waitForTimeout(500);
  ok('8a a note archived in A shows its strip in B, where it is open', await strip(B) && await B.evaluate(()=>document.getElementById('roMsg').textContent)==='Нотатка в архіві' && /Архів\s*1/.test(await B.locator('#archRow').innerText()));
  await A.click('#undo .ubtn'); await B.waitForTimeout(500);
  ok('8b undone in A, B drops the strip and lists it again', !await strip(B) && (await items(B)).includes('n2') && await B.locator('#archRow').isHidden());
  console.log(errs.length? errs.join('\n') : '✓ tabs: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  await fresh(pg); await open(pg,'n2'); await pg.waitForTimeout(400);
  await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250); const mi=pg.locator('.amenu.hm .mi',{hasText:'Перенести в архів'});
  ok('9a the header «⋯» has «Перенести в архів»', (await mi.count())===1);
  await tapEl(mi); await pg.waitForTimeout(500);
  ok('9b it archives the open note and opens the next one', (await stored(pg,'n2')).archived>0 && await cur(pg)!=='n2');
  await pg.click('#undo .uclose'); await pg.waitForTimeout(300); await pg.click('#sideBtn'); await pg.waitForTimeout(400); await pg.click('#archRow'); await pg.waitForTimeout(300);
  ok('9c the archive section has its own history entry', (await pg.evaluate(()=>history.state&&history.state.nav))==='section' && await pg.locator('#sect').isVisible());
  await open(pg,'n2'); await pg.waitForTimeout(500); const sb=await box(pg.locator('.rostrip')), fb=await box(pg.locator('#sheet .blk').first());
  ok('9d the archive strip is one row on a phone and covers no block ('+sb.y+'+'+sb.h+' vs '+fb.y+')', sb.h<=60 && sb.y+sb.h<=fb.y && sb.x>=0 && sb.x+sb.w<=390);
  await pg.evaluate(()=>document.getElementById('moreBtn').click()); await pg.waitForTimeout(250);
  ok('9e the header «⋯» menu opens above the strip', await pg.evaluate(()=>{ const r=document.querySelector('.rostrip').getBoundingClientRect(), e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(e && e.closest('.amenu')); }));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  await tapEl(pg.locator('#moreBtn')); await pg.waitForTimeout(250);
  ok('9f for an archived note the «⋯» offers «Повернути до нотаток»', (await pg.locator('.amenu.hm .mi',{hasText:'Повернути до нотаток'}).count())===1);
  await pg.screenshot({path:OUT+'/apparchive-phone.png'});
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
