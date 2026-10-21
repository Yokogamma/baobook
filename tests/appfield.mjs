// Field writes (archive, unarchive, trash, restore, pin) over a change the store lacks: the last edit of a note failed to save and lives only in
// memory, or went to a localStorage fallback key, or its write is still on its way and fails. The field write that follows goes whole, so the edit
// is in IndexedDB with the field after it (and after «Повторити» when that write fails too), and survives a reload; the leftover key goes, with no
// backup copy of the note.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, until } from './lib/wait.mjs';
const SITE=(await serve()).url;
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const T0=Date.now();
const NOTES=[{id:'n1',title:'Ключі',blocks:[{id:'a1',row:2,text:'сервер',fx:0.2}],created:1,updated:T0},
  {id:'n2',title:'Покупки',blocks:[{id:'b1',row:2,text:'молоко',fx:0.2}],created:1,updated:T0-60000},
  {id:'n3',title:'Плани',blocks:[{id:'c1',row:2,text:'відпустка',fx:0.2}],created:1,updated:T0-120000}];
const file=notes=>({name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const fresh=async()=>{ await pg.goto(SITE); await ready(pg); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready(pg);
  await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; }); await pg.setInputFiles('#importFile',file(NOTES));
  await pg.waitForFunction(()=>/Імпортовано/.test(document.getElementById('toast').textContent),null,{timeout:15000}); const ids=NOTES.map(n=>n.id);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), ids);
  await until(()=>pg.evaluate(ids=>[...document.querySelectorAll('#list .item')].every(d=>ids.includes(d.dataset.id)), ids)); await pg.waitForTimeout(200); };   // the empty note of the first start goes for good
const stored=id=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const texts=r=>r? r.blocks.map(b=>b.text).join(' | ') : '(none)';
const open=async id=>{ await pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id); await pg.waitForTimeout(300); };
const btn=async(id,cls)=>{ const it=pg.locator('#list .item[data-id="'+id+'"]'); await it.hover(); await it.locator(cls).click(); await pg.waitForTimeout(500); };
const type=async t=>{ await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(t); };
const fbKeys=()=>pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).length);
const backups=()=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].filter(d=>/резервна копія/.test(d.textContent)).length);
const warn=()=>pg.evaluate(()=>!document.getElementById('saveWarn').hidden);
// IndexedDB refuses every write (the fallback key takes it); with noLS the fallback refuses too, so the write fails and stays in memory
const idbFails=()=>pg.evaluate(()=>{ sheetDebug.saveGate=()=>Promise.reject(new DOMException('full','QuotaExceededError')); });
const noLS=()=>pg.evaluate(()=>{ window.__si=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k.startsWith('sheet:note:')) throw new DOMException('full','QuotaExceededError'); return window.__si.call(this,k,v); }; });
const healed=()=>pg.evaluate(()=>{ sheetDebug.saveGate=null; if(window.__si){ Storage.prototype.setItem=window.__si; window.__si=null; } });
const reload=async()=>{ await pg.reload(); await ready(pg); await until(async()=>!(await fbKeys())); await pg.waitForTimeout(300); };

// 1 the open note's edit failed (IndexedDB and the fallback refused it), then the archive with the storage working again
await fresh(); await open('n2'); await idbFails(); await noLS(); await type(' сир'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const w1=await warn();
await healed(); await btn('n2','.it-r'); const a1=await stored('n2'), wa1=await warn(); await reload(); const b1=await stored('n2');
ok('1 a failed edit (⚠ '+w1+'), then the archive: stored «'+texts(a1)+'», archived '+!!(a1&&a1.archived)+', ⚠ after it '+wa1+'; after a reload «'+texts(b1)+'», archived '+!!(b1&&b1.archived),
  w1 && !wa1 && a1 && a1.archived>0 && /молоко сир$/.test(texts(a1)) && b1 && b1.archived>0 && /молоко сир$/.test(texts(b1)));

// 2 the same with the trash
await fresh(); await open('n1'); await idbFails(); await noLS(); await type(' ключ'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const w2=await warn();
await healed(); await btn('n1','.it-x'); await reload(); const b2=await stored('n1');
ok('2 a failed edit (⚠ '+w2+'), then the trash: after a reload «'+texts(b2)+'», in the trash '+!!(b2&&b2.deleted), w2 && b2 && b2.deleted>0 && /сервер ключ$/.test(texts(b2)));

// 3 the open note's edit went to localStorage, then the archive: the edit is stored with it and the leftover goes, with no backup copy after a reload
await fresh(); await open('n3'); await idbFails(); await type(' нове'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const k3=await fbKeys();
await healed(); await btn('n3','.it-r'); const a3=await stored('n3'), k3b=await fbKeys(); await reload(); const b3=await stored('n3'), c3=await backups();
ok('3 an edit in localStorage ('+k3+' key), then the archive: stored «'+texts(a3)+'», archived '+!!(a3&&a3.archived)+', keys left '+k3b+'; after a reload «'+texts(b3)+'», backup copies '+c3,
  k3===1 && a3 && a3.archived>0 && /відпустка нове$/.test(texts(a3)) && k3b===0 && b3 && b3.archived>0 && /відпустка нове$/.test(texts(b3)) && c3===0);

// 4 the same with the trash
await fresh(); await open('n2'); await idbFails(); await type(' хліб'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const k4=await fbKeys();
await healed(); await btn('n2','.it-x'); const k4b=await fbKeys(); await reload(); const b4=await stored('n2'), c4=await backups();
ok('4 an edit in localStorage ('+k4+' key), then the trash: keys left '+k4b+'; after a reload «'+texts(b4)+'», in the trash '+!!(b4&&b4.deleted)+', backup copies '+c4,
  k4===1 && k4b===0 && b4 && b4.deleted>0 && /молоко хліб$/.test(texts(b4)) && c4===0);

// 5 a note never opened: its pin went to localStorage, then the archive with IndexedDB working: both are stored
await fresh(); await open('n1'); await idbFails(); await btn('n3','.it-p'); const k5=await fbKeys(); await healed(); await btn('n3','.it-r'); const a5=await stored('n3'), k5b=await fbKeys();
await reload(); const b5=await stored('n3'), c5=await backups();
ok('5 a pin of a note not open in localStorage ('+k5+' key), then its archive: stored pinned '+!!(a5&&a5.pinned)+' and archived '+!!(a5&&a5.archived)+', keys left '+k5b+'; after a reload pinned '+!!(b5&&b5.pinned)+', archived '+!!(b5&&b5.archived)+', backup copies '+c5,
  k5===1 && a5 && a5.pinned>0 && a5.archived>0 && k5b===0 && b5 && b5.pinned>0 && b5.archived>0 && c5===0);

// 6 an edit whose write is on its way and fails, and at once the archive (a switch to another note sends the edit): the archive's write goes through, the edit is in it
await fresh(); await open('n2'); await type(' в польоті'); await pg.evaluate(()=>{ let k=0; sheetDebug.saveGate=()=>++k===1? new Promise((_,no)=>setTimeout(()=>no(new DOMException('full','QuotaExceededError')),300)) : Promise.resolve(); });
await noLS(); await pg.evaluate(()=>{ document.querySelector('#list .item[data-id="n1"]').click(); document.querySelector('#list .item[data-id="n2"] .it-r').click(); }); await pg.waitForTimeout(900);
await healed(); const a6=await stored('n2'), w6=await warn(); await reload(); const b6=await stored('n2');
ok('6 the archive while the edit\'s write was on its way (and failed): stored «'+texts(a6)+'», archived '+!!(a6&&a6.archived)+', ⚠ '+w6+'; after a reload «'+texts(b6)+'»',
  a6 && a6.archived>0 && /молоко в польоті$/.test(texts(a6)) && !w6 && b6 && /молоко в польоті$/.test(texts(b6)));

// 6b the same with both writes failing: the warning stays, «Повторити» stores the edit with the archive
await fresh(); await open('n2'); await type(' обидва'); await pg.evaluate(()=>{ sheetDebug.saveGate=()=>new Promise((_,no)=>setTimeout(()=>no(new DOMException('full','QuotaExceededError')),150)); });
await noLS(); await pg.evaluate(()=>{ document.querySelector('#list .item[data-id="n1"]').click(); document.querySelector('#list .item[data-id="n2"] .it-r').click(); }); await pg.waitForTimeout(900);
const w6b=await warn(); await healed(); await pg.click('#saveWarn'); await pg.waitForTimeout(200); await pg.click('#saveRetry'); await pg.waitForTimeout(700); const a6b=await stored('n2'), wa6b=await warn(); await reload(); const b6b=await stored('n2');
ok('6b both writes failed (⚠ '+w6b+'); «Повторити» stored «'+texts(a6b)+'», archived '+!!(a6b&&a6b.archived)+', ⚠ after it '+wa6b+'; after a reload «'+texts(b6b)+'»',
  w6b && a6b && a6b.archived>0 && /молоко обидва$/.test(texts(a6b)) && !wa6b && b6b && b6b.archived>0 && /молоко обидва$/.test(texts(b6b)));

// 7 a failed edit, the trash failing too, then the restore from the trash section with the storage working (the note is not opened): the restore stores the edit
await fresh(); await open('n1'); await idbFails(); await noLS(); await type(' назад'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); await btn('n1','.it-x'); const w7=await warn();
await healed(); await pg.click('#trashRow'); await pg.waitForTimeout(250); await btn('n1','.it-r'); await pg.waitForTimeout(300); const a7=await stored('n1'), wa7=await warn(); await reload(); const b7=await stored('n1');
ok('7 a failed edit and a failed trash (⚠ '+w7+'), then the restore from the trash: stored «'+texts(a7)+'», in the trash '+!!(a7&&a7.deleted)+', ⚠ after it '+wa7+'; after a reload «'+texts(b7)+'»',
  w7 && a7 && !a7.deleted && /сервер назад$/.test(texts(a7)) && !wa7 && b7 && !b7.deleted && /сервер назад$/.test(texts(b7)));

// 8 an archived note open, its edit failed, then «Повернути з архіву» on its strip: the edit is stored with the note back in the list
await fresh(); await btn('n3','.it-r'); await pg.click('#archRow'); await pg.waitForTimeout(250); await open('n3'); await idbFails(); await noLS(); await type(' з архіву'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const w8=await warn();
await healed(); await pg.click('#roRestore'); await pg.waitForTimeout(700); const a8=await stored('n3'); await reload(); const b8=await stored('n3');
ok('8 an archived note\'s failed edit (⚠ '+w8+'), then «Повернути»: stored «'+texts(a8)+'», archived '+!!(a8&&a8.archived)+'; after a reload «'+texts(b8)+'»',
  w8 && a8 && !a8.archived && /відпустка з архіву$/.test(texts(a8)) && b8 && !b8.archived && /відпустка з архіву$/.test(texts(b8)));

// 9 the restore from the trash of a note not open, after its trash went to localStorage: the restore is what is stored, and the key goes, so the next start
// does not bring the trash back from it (a guard: a leftover kept after the write that undid it would come back)
await fresh(); await open('n1'); await idbFails(); await btn('n2','.it-x'); const k9=await fbKeys(); await healed(); await pg.click('#trashRow'); await pg.waitForTimeout(250); await btn('n2','.it-r'); const a9=await stored('n2'), k9b=await fbKeys();
await reload(); const b9=await stored('n2'), c9=await backups();
ok('9 a trash in localStorage ('+k9+' key), then the restore: stored in the trash '+!!(a9&&a9.deleted)+' «'+texts(a9)+'», keys left '+k9b+'; after a reload in the trash '+!!(b9&&b9.deleted)+', backup copies '+c9,
  k9===1 && a9 && !a9.deleted && texts(a9)==='молоко' && k9b===0 && b9 && !b9.deleted && c9===0);

// a second tab of the same browser
const tab=async()=>{ const p=await ctx.newPage(); p.on('pageerror',e=>errs.push('PAGEERROR B '+e.message)); await p.goto(SITE); await ready(p); await p.waitForTimeout(300); return p; };
const openIn=async(p,id)=>{ await p.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id); await p.waitForTimeout(300); };

// 10 the open note's edit only in localStorage, and another tab's write of the note (its caret was in the title, so it kept its own text) reaches this tab
// meanwhile: the leftover keeps the note from being replaced, so the pin that follows stores both, and the key goes only then
await fresh(); await open('n2'); const B=await tab(); await openIn(B,'n2'); await B.evaluate(()=>document.getElementById('ttl').focus());
await pg.bringToFront(); await idbFails(); await type(' LOCALONLY'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const k10=await fbKeys(); await healed();
await B.bringToFront(); await B.evaluate(()=>{ const e=document.getElementById('ttl'); e.textContent='Покупки B'; e.dispatchEvent(new Event('input',{bubbles:true})); }); await B.waitForTimeout(800); await B.evaluate(()=>document.getElementById('ttl').blur()); await B.waitForTimeout(600);
const s10b=await stored('n2'); await pg.bringToFront(); await pg.waitForTimeout(400); await btn('n2','.it-p'); await pg.waitForTimeout(400); const a10=await stored('n2'), k10b=await fbKeys();
await B.close(); await reload(); const b10=await stored('n2'), all10=await pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.textContent).join(' | '));
ok('10 an edit in localStorage ('+k10+' key), another tab stored «'+(s10b&&s10b.title)+'» / «'+texts(s10b)+'»; the pin here stored «'+(a10&&a10.title)+'» / «'+texts(a10)+'», pinned '+!!(a10&&a10.pinned)+', keys left '+k10b+'; after a reload «'+(b10&&b10.title)+'» / «'+texts(b10)+'»',
  k10===1 && s10b && s10b.title==='Покупки B' && !/LOCALONLY/.test(texts(s10b)) && a10 && a10.pinned>0 && /LOCALONLY/.test(texts(a10)) && a10.title==='Покупки B' && k10b===0 && b10 && /LOCALONLY/.test(texts(b10)) && b10.title==='Покупки B' && b10.pinned>0);

// 11 the open note archived with its write held, while another tab moves it to the trash: the archive does not land on the trashed note, so a restore takes it back to the notes
await fresh(); await open('n3'); const B2=await tab(); await pg.bringToFront();
await pg.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; }); await btn('n3','.it-r');
await B2.bringToFront(); { const it=B2.locator('#list .item[data-id="n3"]'); await it.hover(); await it.locator('.it-x').click(); } await B2.waitForTimeout(600); const s11b=await stored('n3');
await pg.bringToFront(); await pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await pg.waitForTimeout(800); const a11=await stored('n3');
await B2.close(); await reload(); const b11=await stored('n3');
ok('11 archived here under a held write, trashed in the other tab (stored: in the trash '+!!(s11b&&s11b.deleted)+'): stored in the trash '+!!(a11&&a11.deleted)+', archived '+!!(a11&&a11.archived)+'; after a reload in the trash '+!!(b11&&b11.deleted)+', archived '+!!(b11&&b11.archived),
  s11b && s11b.deleted>0 && a11 && a11.deleted>0 && !a11.archived && b11 && b11.deleted>0 && !b11.archived && texts(b11)==='відпустка');

console.log(errs.length? errs.join('\n') : '✓ no errors'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
