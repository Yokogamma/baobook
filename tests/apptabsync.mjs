import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const NOTES=[{id:'s0',title:'Спільна',blocks:[{id:'b0',row:2,text:'рядок',fx:0.2}],created:1,updated:Date.now()},
  {id:'s1',title:'Інша',blocks:[{id:'b1',row:2,text:'інший текст',fx:0.2}],created:1,updated:Date.now()-60000}];
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);
const title=pg=>pg.evaluate(()=>document.getElementById('ttl').textContent);
const text=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).join('|'));
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id+':'+d.querySelector('.it-t').textContent));
const typeTitle=async(pg,s)=>{ await pg.bringToFront(); await pg.click('#ttl'); await pg.keyboard.press('End'); await pg.keyboard.type(s); await pg.waitForTimeout(700); };
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result); }; }; }), id);
const versions=(pg,id)=>pg.evaluate(id=>window.sheetDebug.vers.list(id), id);

{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const errs=[];
  const page=async()=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept()); await pg.goto(SITE); await pg.waitForTimeout(600); return pg; };
  const A=await page();
  await A.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await A.reload(); await A.waitForTimeout(400);
  await A.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:NOTES}))}); await A.waitForTimeout(800);
  const B=await page();
  await open(A,'s0'); await open(B,'s0');

  /* ── a save in one tab reaches the other ── */
  await typeTitle(A,' А');
  ok('1 the title typed in A shows in B without a reload («'+await title(B)+'»)', await title(B)==='Спільна А');
  ok('1b B\'s list shows it too', (await items(B)).includes('s0:Спільна А'));
  await A.click('#sheet .blk .txt'); await A.keyboard.press('End'); await A.keyboard.type(' з A'); await A.waitForTimeout(700);
  ok('2 the block text typed in A is redrawn in B ('+await text(B)+')', await text(B)==='рядок з A');
  await B.bringToFront(); await open(B,'s1'); await open(B,'s0');
  ok('3 B switched to another note and back still shows A\'s copy', await title(B)==='Спільна А' && await text(B)==='рядок з A');
  await typeTitle(B,' Б'); const s=await stored(A,'s0');
  ok('4 typing in B keeps A\'s edits: stored «'+s.title+'», «'+s.blocks[0].text+'»', s.title==='Спільна А Б' && s.blocks[0].text==='рядок з A');
  ok('4b and A shows B\'s copy', await title(A)==='Спільна А Б');

  /* ── new and deleted notes ── */
  const before=(await items(B)).length; await A.bringToFront(); await A.click('#newBtn'); await A.waitForTimeout(500); const ids=await items(B);
  ok('5 a note created in A appears in B\'s list ('+before+' → '+ids.length+' notes)', ids.length===before+1);
  const fresh=await A.evaluate(()=>window.sheetDebug.cur());
  await A.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"] .it-x').click(), 's1'); await A.waitForTimeout(400);
  ok('6 a note deleted in A leaves B\'s list', !(await items(B)).some(x=>x.startsWith('s1:')) && (await items(B)).some(x=>x.startsWith(fresh+':')));
  await open(B,fresh); await A.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"] .it-x').click(), fresh); await A.waitForTimeout(400);
  ok('7 when the note B shows is deleted in A, B moves to another note ('+await title(B)+')', await B.evaluate(()=>window.sheetDebug.cur())!==fresh && !(await items(B)).some(x=>x.startsWith(fresh+':')));

  /* ── both tabs change the same note: nothing is lost silently ── */
  await open(A,'s0'); await open(B,'s0');
  await B.evaluate(()=>{ window.sheetDebug.failSave=true; }); await typeTitle(B,' 2');   // B's edit stays unwritten
  ok('8 B\'s edit is not written («'+(await stored(A,'s0')).title+'»)', (await stored(A,'s0')).title==='Спільна А Б');
  await typeTitle(A,' 1');
  const toast=await B.evaluate(()=>{ const t=document.getElementById('toast'); return t.classList.contains('show')? t.textContent : ''; });
  ok('9 B keeps its own copy («'+await title(B)+'») and says why: «'+toast+'»', await title(B)==='Спільна А Б 2' && /іншій вкладці/.test(toast));
  const conf=(await versions(B,'s0')).filter(v=>v.reason==='conflict');
  ok('10 A\'s copy goes into the history as «conflict» ('+conf.map(v=>v.title).join(', ')+')', conf.some(v=>v.title==='Спільна А Б 1'));
  await B.evaluate(()=>{ window.sheetDebug.failSave=false; }); await B.evaluate(()=>window.dispatchEvent(new Event('online'))); await B.waitForTimeout(700);
  ok('11 once B can write, its copy is stored and A takes it («'+(await stored(A,'s0')).title+'», A «'+await title(A)+'»)', (await stored(A,'s0')).title==='Спільна А Б 2' && await title(A)==='Спільна А Б 2');

  /* ── a tab that missed the messages catches up when it is shown ── */
  await B.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'), st=t.objectStore('notes'); const g=st.get('s0');
    g.onsuccess=()=>{ const n=g.result; n.title='Збоку'; n.updated=Date.now()+1000; st.put(n); }; t.oncomplete=()=>{ d.close(); res(); }; }; }));
  ok('12 a change written behind B\'s back is not shown yet', await title(B)==='Спільна А Б 2');
  await B.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await B.waitForTimeout(400);
  ok('13 shown again, B reads the storage and takes it («'+await title(B)+'»)', await title(B)==='Збоку');

  console.log(errs.length? errs.join('\n') : '✓ no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
