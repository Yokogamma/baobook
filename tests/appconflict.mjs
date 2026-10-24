// Conflicts in the interface (docs/SYNC-PLAN.md §4.19, PR 4b), two devices over the shared test cloud. The same block edited on two offline devices:
// the device that merges has one copy, the other none; the history button reads «Історія версій · 1 конфлікт» with a badge, the list marks the note,
// the toast's «Показати» opens the copy, its row says «лише на цьому пристрої». «Відновити» puts the copy's text in the note and removes the copy, Ctrl+Z
// brings both back, also after the other device edited another block meanwhile (that edit stays); «Прибрати» removes it, «Скасувати» brings it back;
// «Прибрати конфліктні копії (2)» asks and removes both; the cloud never holds a copy. Without an owner, a note past its days in the trash with a copy
// stays, marked with the reason; its «Історія» opens read-only, removing its last copy asks with no undo, and the next look purges it. The toast shows
// only in the visible tab that has the note open; on a phone the two buttons fit the bottom sheet and the badge shows.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, settle, typeAt, curId, openNote } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const copies=pg=>pg.evaluate(()=>sheetDebug.copies());
const idb=(pg,store)=>pg.evaluate(store=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction(store,'readonly').objectStore(store).getAll(); q.onsuccess=()=>{ res(q.result); r.result.close(); }; }; }), store);
const copyRecs=async(pg,id)=>(await idb(pg,'versions')).filter(v=>v.note===id && v.reason==='copy');
const btn=pg=>pg.evaluate(()=>{ const b=document.getElementById('histBtn'), g=document.getElementById('histBadge'); return {title:b.title, aria:b.getAttribute('aria-label'), badge:g.hidden? '' : g.textContent}; });
const toastOf=pg=>pg.evaluate(()=>{ const u=document.getElementById('undo'); return !u.hidden && u.classList.contains('show')? u.querySelector('.umsg').textContent+' | '+u.querySelector('.ubtn').textContent : ''; });
const textOf=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk')].map(b=>b.innerText.split(String.fromCharCode(0x200b)).join('').trim()).join(' / '));
const editFirst=async(pg,txt)=>{ await pg.bringToFront(); await pg.locator('#sheet .blk [contenteditable="true"]').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(txt); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600); };
const seenIds=new Set(); const cloudClean=async(pg)=>{ for(const c of await (async()=>(await idb(pg,'versions')).filter(v=>v.reason==='copy'))()) seenIds.add(c.id); const sync=await idb(pg,'sync');
  return [...seenIds].every(id=>!cloud.doc('versions',id) && !sync.some(r=>r.k==='out:v:'+id || r.k==='try:v:'+id)); };
const cloud=new TestCloud({start:Date.now()});

/* ── 1. a conflict: the copy on the merging device, the badge, the mark, the toast and «Показати» ── */
{ const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX, connect:{pace:PACE}});
  await typeAt(A.pg,500,300,'спільний текст'); const id=await curId(A.pg); await settle(A.pg);
  await until(async()=>{ await settle(B.pg,100); return B.pg.evaluate(id=>!!document.querySelector('#list .item[data-id="'+id+'"]'), id); }, 8000); await openNote(B.pg,id);
  await A.pg.evaluate(()=>sheetDebug.sync.online(false)); await B.pg.evaluate(()=>sheetDebug.sync.online(false));
  await editFirst(A.pg,' з A'); await editFirst(B.pg,' з B');
  await A.pg.evaluate(()=>sheetDebug.sync.online(true)); await settle(A.pg); await B.pg.evaluate(()=>sheetDebug.sync.online(true));
  await until(async()=>{ await settle(B.pg,100); await settle(A.pg,100); const a=await copies(A.pg), b=await copies(B.pg); return (a[id]||0)+(b[id]||0)>0; }, 10000); await settle(A.pg); await settle(B.pg);
  const ca=(await copyRecs(A.pg,id)).length, cb=(await copyRecs(B.pg,id)).length, M=ca? A : B, O=ca? B : A, pg=M.pg;
  ok('1 the merging device ('+M.name+') has one copy, the other none ('+ca+'/'+cb+')', ca+cb===1);
  await pg.bringToFront(); const b1=await btn(pg);
  ok('1a the history button reads «Історія версій · 1 конфлікт» with the badge 1 ('+b1.title+')', /Історія версій · 1 конфлікт/.test(b1.title) && b1.aria===b1.title && b1.badge==='1');
  const mark=await pg.evaluate(id=>{ const it=document.querySelector('#list .item[data-id="'+id+'"]'); return it? {mark:!!it.querySelector('.cmark'), sr:[...it.querySelectorAll('.sr-only')].map(x=>x.textContent).join('|')} : null; }, id);
  ok('1b the list marks the note, with the text «є конфліктні копії» ('+JSON.stringify(mark)+')', !!mark && mark.mark && /є конфліктні копії/.test(mark.sr));
  const om=await O.pg.evaluate(id=>{ const it=document.querySelector('#list .item[data-id="'+id+'"]'); return !!(it && it.querySelector('.cmark')); }, id);
  ok('1c the other device marks nothing', !om && (await btn(O.pg)).badge==='');
  const t1=await toastOf(pg); ok('1d the toast names the other device and offers «Показати» ('+t1+')', /Конфлікт із пристроєм «Device /.test(t1) && /Показати/.test(t1));
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(500);
  const shown=await pg.evaluate(()=>({open:!document.getElementById('hist').hidden, view:sheetDebug.vers.view, take:!document.getElementById('histTake').hidden, drop:!document.getElementById('histDrop').hidden, restore:!document.getElementById('histRestore').hidden}));
  const copy=(await copyRecs(pg,id))[0], row=await pg.evaluate(v=>{ const r=document.querySelector('#histList .hv[data-id="'+v+'"]'); return r? r.innerText : ''; }, copy.id);
  ok('1e «Показати» opens «Історія» on the copy: «Відновити» and «Прибрати» in place of «Відновити цю версію» ('+JSON.stringify(shown)+')', shown.open && shown.view===copy.id && shown.take && shown.drop && !shown.restore);
  ok('1f its row: «конфліктна копія · …» and «лише на цьому пристрої»', /конфліктна копія/.test(row) && /лише на цьому пристрої/.test(row));
  ok('1g the cloud holds no copy, nothing queues it', await cloudClean(pg));

/* ── 2. «Відновити» and its undo, also after the other device edited another block ── */
  const noteText=async()=>(await idb(pg,'notes')).find(n=>n.id===id).blocks.map(b=>b.text).join(' / '), before=await noteText(), copyText=copy.blocks.map(e=>e.s).join(' / ');
  await pg.click('#histTake'); await pg.waitForTimeout(700);
  const after=await textOf(pg), left=(await copyRecs(pg,id)).length;
  ok('2 «Відновити»: the note shows the copy\'s text, the copy is gone, the badge too ('+before+' → '+after+')', after===copyText && (await noteText())===copyText && copyText!==before && left===0 && (await btn(pg)).badge==='');
  await settle(pg); await until(async()=>{ await settle(O.pg,100); return (await textOf(O.pg))===after; }, 8000);
  ok('2a the restored text reached the other device', (await textOf(O.pg))===after && await cloudClean(pg));
  // the other device adds a block meanwhile; the undo keeps it
  await typeAt(O.pg,500,500,'новий блок з іншого'); await settle(O.pg); await until(async()=>{ await settle(pg,100); return /новий блок з іншого/.test(await textOf(pg)); }, 8000);
  await pg.bringToFront(); await pg.mouse.click(1000,800); await pg.keyboard.press('Escape'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(800);
  const undone=await textOf(pg);
  ok('2b Ctrl+Z: the state before comes back, the other device\'s new block stays, the copy is back ('+undone+')', (await noteText()).startsWith(before) && /новий блок з іншого/.test(undone) && (await copyRecs(pg,id)).length===1 && (await btn(pg)).badge==='1');
  await settle(pg); ok('2c the cloud still holds no copy', await cloudClean(pg));
  // undo after the toast is gone: «Відновити» again, leave the note, come back, «Скасувати: …» in the header «⋯»
  const before2=await noteText(); await pg.click('#histBtn'); await pg.waitForTimeout(400); await pg.locator('#histList .hv[data-id="'+copy.id+'"]').click(); await pg.waitForTimeout(200); await pg.click('#histTake'); await pg.waitForTimeout(700);
  const restored2=await noteText(); await pg.click('#newBtn'); await pg.waitForTimeout(400); await openNote(pg,id); await pg.waitForTimeout(300);
  await pg.evaluate(()=>document.getElementById('moreBtn').click()); const item=pg.locator('.amenu .mi',{hasText:'Скасувати:'}); const has=await item.count(); if(has) await item.first().click(); await pg.waitForTimeout(800);
  ok('2d after leaving the note and coming back, «Скасувати: …» in the header menu takes the restore back ('+restored2+' → '+(await noteText())+')', has>0 && restored2!==before2 && (await noteText())===before2 && (await copyRecs(pg,id)).length===1);

/* ── 3. «Прибрати» and «Скасувати»; «Прибрати конфліктні копії (2)» ── */
  await pg.click('#histBtn'); await pg.waitForTimeout(400); const c2=(await copyRecs(pg,id))[0]; await pg.locator('#histList .hv[data-id="'+c2.id+'"]').click(); await pg.waitForTimeout(200);
  await pg.click('#histDrop'); await pg.waitForTimeout(500);
  const t3=await toastOf(pg); ok('3 «Прибрати»: the copy is gone, the badge too, «Копію прибрано» offers the undo ('+t3+')', (await copyRecs(pg,id)).length===0 && (await btn(pg)).badge==='' && /Копію прибрано/.test(t3));
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(500);
  ok('3a «Скасувати» brings it back', (await copyRecs(pg,id)).length===1 && (await btn(pg)).badge==='1');
  // a second copy (as a second merge would leave it), then the page starts again and reads the map
  await pg.evaluate(c=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const t=r.result.transaction('versions','readwrite'); t.objectStore('versions').put({...c, id:c.id+'x', sig:c.sig+'x', t:c.t+1, w:c.w+1}); t.oncomplete=()=>{ r.result.close(); res(); }; }; }), c2);
  await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(500); await openNote(pg,id);
  ok('3b after a reload the map counts both: the badge 2', !!(await until(async()=>(await btn(pg)).badge==='2', 5000)));
  await pg.click('#histBtn'); await pg.waitForTimeout(400); await pg.click('#histMore'); const lbl=await pg.locator('.amenu .mi',{hasText:'Прибрати конфліктні копії (2)'}).count();
  await pg.locator('.amenu .mi',{hasText:'Прибрати конфліктні копії (2)'}).click(); const ask=await until(()=>pg.evaluate(()=>document.getElementById('ask').open? document.getElementById('askTitle').textContent : null), 3000); await pg.click('#askYes'); await pg.waitForTimeout(500);
  ok('3c «Прибрати конфліктні копії (2)» asks ('+ask+') and removes both', lbl===1 && /Прибрати конфліктні копії \(2\)\?/.test(ask||'') && (await copyRecs(pg,id)).length===0 && (await btn(pg)).badge==='');
  ok('3d no page errors', !A.errs.length && !B.errs.length); await A.close(); await B.close(); }

/* ── 4. the toast in the right tab: the merge runs in the leader, which has another note open; the second tab, with the note open, shows it ── */
{ const A=await newDevice(br, cloud, SITE, 'C', {ctx:CTX, connect:{pace:PACE}}), B=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{pace:PACE}});
  await typeAt(A.pg,500,300,'текст вкладок'); const id=await curId(A.pg); await settle(A.pg);
  await until(async()=>{ await settle(B.pg,100); return B.pg.evaluate(id=>!!document.querySelector('#list .item[data-id="'+id+'"]'), id); }, 8000); await openNote(B.pg,id);
  const T2=await newTab(A, SITE, {connect:{pace:PACE}}); await openNote(T2,id); await A.pg.bringToFront(); await A.pg.click('#newBtn'); await A.pg.waitForTimeout(300);
  ok('4 the leader has another note open', (await A.pg.evaluate(()=>sheetDebug.sync.lead().on)) && (await curId(A.pg))!==id);
  await A.pg.evaluate(()=>sheetDebug.sync.online(false)); await editFirst(T2,' з C'); await editFirst(B.pg,' з D'); await settle(B.pg);
  await A.pg.evaluate(()=>sheetDebug.sync.online(true));
  const got=await until(async()=>{ await settle(A.pg,100); return (await copyRecs(A.pg,id)).length? true : null; }, 10000);
  const tT2=await until(async()=>(await toastOf(T2))||null, 3000), tA=await toastOf(A.pg);
  ok('4a the leader merged and shows no toast; the second tab, with the note open, shows «Показати» ('+tT2+')', !!got && /Показати/.test(tT2||'') && !/Показати/.test(tA));
  await T2.waitForTimeout(4000); ok('4b it stays past 3.5 s and is reachable by Tab', /Показати/.test(await toastOf(T2)) && await T2.evaluate(()=>{ const b=document.querySelector('#undo .ubtn'); return !!b && b.tabIndex>=0 && !b.disabled; }));
  ok('4c the second tab\'s badge follows', (await btn(T2)).badge==='1');
  // a third tab with the note open when the second restores the copy: it takes the restored note
  const T3=await newTab(A, SITE, {connect:{pace:PACE}}); await openNote(T3,id); await T3.waitForTimeout(300);
  await T2.bringToFront(); await T2.locator('#undo .ubtn').click(); await T2.waitForTimeout(500); await T2.click('#histTake'); await T2.waitForTimeout(800);
  const want=await textOf(T2), got3=await until(async()=>(await textOf(T3))===want, 5000);
  ok('4e a third tab with the note open takes the restored note ('+want+')', !!got3 && (await btn(T3)).badge==='');
  // a tab that is hidden shows no toast for a new copy, but its badge follows
  await T2.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true, get:()=>true}); });
  await A.pg.evaluate(()=>sheetDebug.sync.online(false)); await editFirst(T2,' знову C'); await editFirst(B.pg,' знову D'); await settle(B.pg); await A.pg.evaluate(()=>sheetDebug.sync.online(true));
  await until(async()=>{ await settle(A.pg,100); return (await copyRecs(A.pg,id)).length? true : null; }, 10000); await T2.waitForTimeout(800);
  ok('4f the hidden tab shows no toast and its badge follows', !/Показати/.test(await toastOf(T2)) && !!(await until(async()=>(await btn(T2)).badge==='1', 3000)));
  ok('4d no page errors', !A.errs.length && !B.errs.length); await A.close(); await B.close(); }

/* ── 5. without an owner: a note past its days in the trash with a copy stays, marked; read-only «Історія»; the last copy asks, no undo; then it goes ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(500);
  const old=Date.now()-31*864e5;
  await pg.evaluate(old=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const t=r.result.transaction(['notes','versions'],'readwrite');
    t.objectStore('notes').put({id:'nt1', title:'У кошику з копією', blocks:[{id:'b1',row:1,fx:0,text:'текст'}], created:old, updated:old, deleted:old});
    t.objectStore('versions').put({id:'vct', note:'nt1', t:old, w:old, reason:'copy', keep:1, inline:1, title:'У кошику з копією', sig:'c1', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'інший текст'}], size:10, updated:old, dev:'phone', dn:'Телефон'});
    t.oncomplete=()=>{ r.result.close(); res(); }; }; }), old);
  await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(800); await pg.evaluate(()=>sheetDebug.purgeOld()); await pg.waitForTimeout(500);
  const kept=(await idb(pg,'notes')).some(n=>n.id==='nt1');
  await pg.click('#trashRow'); await pg.waitForTimeout(300); const why=await pg.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="nt1"]'); return it? it.innerText : ''; });
  ok('5 the note past its 30 days stays for its copy, and the trash says why ('+why.replace(/\n/g,' | ')+')', kept && /не видаляється автоматично: є конфліктні копії/.test(why));
  await openNote(pg,'nt1'); await pg.click('#histBtn'); await pg.waitForTimeout(400); await pg.locator('#histList .hv[data-id="vct"]').click(); await pg.waitForTimeout(200);
  const ro=await pg.evaluate(()=>({take:!document.getElementById('histTake').hidden, drop:!document.getElementById('histDrop').hidden, restore:!document.getElementById('histRestore').hidden, vbtn:document.querySelectorAll('#vlayer .vbtn').length}));
  ok('5a its «Історія» opens read-only: a shown copy offers only «Прибрати» ('+JSON.stringify(ro)+')', !ro.take && ro.drop && !ro.restore && ro.vbtn===0);
  await pg.click('#histDrop'); const ask=await until(()=>pg.evaluate(()=>document.getElementById('ask').open? document.getElementById('askText').textContent : null), 3000); await pg.click('#askYes'); await pg.waitForTimeout(500);
  ok('5b removing its last copy asks first ('+ask+') and offers no undo', /буде видалено автоматично/.test(ask||'') && (await copyRecs(pg,'nt1')).length===0 && !/Скасувати/.test(await toastOf(pg)));
  await pg.evaluate(()=>sheetDebug.purgeOld()); await pg.waitForTimeout(600);
  ok('5c the next look purges the note', !(await idb(pg,'notes')).some(n=>n.id==='nt1') && !errs.length); await ctx.close(); }

/* ── 6. on a phone: the two buttons fit the bottom sheet, the badge shows ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(500);
  await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const t=r.result.transaction(['notes','versions'],'readwrite'), n=Date.now();
    t.objectStore('notes').put({id:'np', title:'Телефон', blocks:[{id:'b1',row:1,fx:0,text:'текст'}], created:n, updated:n});
    t.objectStore('versions').put({id:'vcp', note:'np', t:n, w:n, reason:'copy', keep:1, inline:1, title:'Телефон', sig:'p', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'інший'}], size:10, updated:n, dev:'pc', dn:'ПК'});
    t.oncomplete=()=>{ r.result.close(); res(); }; }; }));
  await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(800); await pg.evaluate(()=>{ const d=document.querySelector('#list .item[data-id="np"]'); if(d) d.click(); }); await pg.waitForTimeout(500);
  const badge=await until(()=>pg.evaluate(()=>{ const g=document.getElementById('histBadge'), r=g.getBoundingClientRect(); return !g.hidden && r.width>0 && r.right<=390; }), 5000);   // the map is read a moment after the start
  await pg.evaluate(()=>document.getElementById('histBtn').click()); await pg.waitForTimeout(500); await pg.evaluate(()=>document.querySelector('#histList .hv[data-id="vcp"]').click()); await pg.waitForTimeout(300);
  const fit=await pg.evaluate(()=>{ const a=document.getElementById('histTake').getBoundingClientRect(), b=document.getElementById('histDrop').getBoundingClientRect(); return {a:[a.left,a.right,a.top], b:[b.left,b.right,b.top]}; });
  ok('6 on a phone the badge shows and the two buttons sit side by side inside 390 px ('+JSON.stringify(fit)+')', badge && fit.a[0]>=0 && fit.b[1]<=390 && fit.a[1]<=fit.b[0] && Math.abs(fit.a[2]-fit.b[2])<2 && !errs.length); await ctx.close(); }

/* ── 7. leaving the note while «Відновити» is held: the undo lands on that note's stack; after the owner changed, no history opens ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(500);
  await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const t=r.result.transaction(['notes','versions'],'readwrite'), n=Date.now();
    t.objectStore('notes').put({id:'nh', title:'Затримка', blocks:[{id:'b1',row:1,fx:0,text:'як є'}], created:n, updated:n});
    t.objectStore('versions').put({id:'vch', note:'nh', t:n, w:n, reason:'copy', keep:1, inline:1, title:'Затримка', sig:'h', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'з копії'}], size:7, updated:n, dev:'pc', dn:'ПК'});
    t.oncomplete=()=>{ r.result.close(); res(); }; }; }));
  await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(800); await openNote(pg,'nh');
  await pg.click('#histBtn'); await pg.waitForTimeout(400); await pg.locator('#histList .hv[data-id="vch"]').click(); await pg.waitForTimeout(200);
  await pg.evaluate(()=>{ window.__held=new Promise(r=>{ window.__go=r; }); sheetDebug.saveGate=st=>st.includes('versions') && st.includes('notes')? window.__held : null; });
  await pg.click('#histTake'); await pg.waitForTimeout(300); await pg.click('#newBtn'); await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__go(); }); await pg.waitForTimeout(800);
  const stored=async()=>(await idb(pg,'notes')).find(n=>n.id==='nh').blocks[0].text;
  const s1=await stored(); await openNote(pg,'nh'); await pg.waitForTimeout(300); await pg.mouse.click(1000,800); await pg.keyboard.press('Escape'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(800);
  ok('7 restored while another note was open ('+s1+'); back on the note Ctrl+Z takes it back and the copy returns', s1==='з копії' && (await stored())==='як є' && (await copyRecs(pg,'nh')).length===1);
  await pg.evaluate(()=>sheetDebug.lock('epoch')); await pg.evaluate(()=>document.getElementById('histBtn').click()); await pg.waitForTimeout(400);
  ok('7a after the owner changed (the `epoch` lock) «Історія» does not open: the store is another owner\'s now', await pg.evaluate(()=>document.getElementById('hist').hidden) && !errs.length); await ctx.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
