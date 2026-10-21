// Pinned notes: the pin button of a list item, the «Закріплені» group above «Інші» (the last pinned on top; by rank in a search), the archive
// and the trash taking a note out of the group and a restore bringing it back, export and import, another tab, another device through the
// test cloud, and the header «⋯» on a phone.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, armClick, clicked, until } from './lib/wait.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, typeAt, curId, cloudWrite } from './lib/cloudpage.mjs';
const SITE=(await serve()).url;
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
const load=async(pg,notes)=>{ await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; }); await pg.setInputFiles('#importFile',file(notes));
  await pg.waitForFunction(()=>/Імпортовано/.test(document.getElementById('toast').textContent),null,{timeout:15000}); };
const fresh=async(pg,notes=NOTES)=>{ await pg.goto(SITE); await ready(pg); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await ready(pg);
  await load(pg,notes); const ids=notes.map(n=>n.id);
  await pg.evaluate(ids=>document.querySelectorAll('#list .item').forEach(d=>{ if(!ids.includes(d.dataset.id)) d.querySelector('.it-x').click(); }), ids);
  await until(()=>pg.evaluate(ids=>[...document.querySelectorAll('#list .item')].every(d=>ids.includes(d.dataset.id)), ids)); await pg.waitForTimeout(200); };   // the empty note of the first start goes for good
// the list as text: group headers in brackets, items by id
const listText=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list > *')].map(d=>d.classList.contains('grp')? '['+d.textContent+']' : d.dataset.id).join(','));
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('notes','readonly').objectStore('notes').get(id); g.onsuccess=()=>{ d.close(); res(g.result||null); }; }; }), id);
const open=(pg,id)=>pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id);
const cur=pg=>pg.evaluate(()=>window.sheetDebug.cur());
const btn=async(pg,id,cls)=>{ const it=pg.locator('#list .item[data-id="'+id+'"]'); await it.hover(); await it.locator(cls).click(); await pg.waitForTimeout(400); };
const pinOf=(pg,id)=>pg.evaluate(id=>{ const b=document.querySelector('#list .item[data-id="'+id+'"] .it-p'); return b? {on:b.classList.contains('on'), title:b.title, label:b.getAttribute('aria-label'), pressed:b.getAttribute('aria-pressed')} : null; }, id);

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300);
  const p0=await pinOf(pg,'n3');
  ok('0 an item offers «'+(p0&&p0.title)+'»; nothing pinned, no groups ('+await listText(pg)+')', p0 && p0.title==='Закріпити вгорі' && !p0.on && await listText(pg)==='n1,n2,n3');

  // 1 the pin: the oldest note goes up into «Закріплені», the rest under «Інші»; the open note stays open
  await btn(pg,'n3','.it-p'); const r1=await stored(pg,'n3'), p1=await pinOf(pg,'n3');
  ok('1a «Komax старий» pinned: '+await listText(pg), await listText(pg)==='[Закріплені],n3,[Інші],n1,n2');
  ok('1b stored with pinned, not archived; the button is pressed, keeps its name «'+p1.label+'» and its title offers «'+p1.title+'»; «Ключі» is still open', r1.pinned>0 && !r1.archived && !r1.deleted && p1.on && p1.pressed==='true' && p1.label==='Закріпити вгорі' && p1.title==='Відкріпити' && await cur(pg)==='n1');
  await pg.locator('#list .item[data-id="n3"]').hover(); const ib=await box(pg.locator('#list .item[data-id="n3"]')), pb=await box(pg.locator('#list .item[data-id="n3"] .it-p')), rb=await box(pg.locator('#list .item[data-id="n3"] .it-r'));
  const tw=await pg.evaluate(()=>{ const t=document.querySelector('#list .item[data-id="n3"] .it-t'); return t.getBoundingClientRect().right-parseFloat(getComputedStyle(t).paddingRight); });
  ok('1c the pin sits left of the archive button, inside the item, and the title stops before it ('+pb.x+'+'+pb.w+' < '+rb.x+', text to '+Math.round(tw)+')', pb.x+pb.w<=rb.x && pb.x>=ib.x && Math.round(tw)<=pb.x);
  await btn(pg,'n2','.it-p');
  ok('1d the last pinned is on top: '+await listText(pg), await listText(pg)==='[Закріплені],n2,n3,[Інші],n1');
  await pg.screenshot({path:OUT+'/apppin-list.png'});

  // 2 a search keeps the groups, by rank inside them
  await pg.fill('#q','komax'); await pg.waitForTimeout(250);
  ok('2a search «komax»: '+await listText(pg), await listText(pg)==='[Закріплені],n3,[Інші],n1');
  await pg.fill('#q','молоко'); await pg.waitForTimeout(250);
  ok('2b only a pinned match: no «Інші» ('+await listText(pg)+')', await listText(pg)==='[Закріплені],n2');
  await pg.fill('#q',''); await pg.waitForTimeout(200);

  // 3 the archive takes a pinned note out of the group; back in the notes, it is pinned again
  await btn(pg,'n3','.it-r');
  ok('3a archived: out of the group ('+await listText(pg)+'), the record keeps pinned', await listText(pg)==='[Закріплені],n2,[Інші],n1' && (await stored(pg,'n3')).pinned>0);
  await pg.click('#archRow'); await pg.waitForTimeout(250);
  ok('3b the archive lists it with no groups and no pin button', await listText(pg)==='n3' && !(await pinOf(pg,'n3')));
  await btn(pg,'n3','.it-r'); await pg.waitForTimeout(200);
  ok('3c back to the notes: in «Закріплені» again ('+await listText(pg)+')', await listText(pg)==='[Закріплені],n2,n3,[Інші],n1');

  // 4 the trash: out of the group; a restore brings it back pinned
  await btn(pg,'n2','.it-x');
  ok('4a trashed: '+await listText(pg), await listText(pg)==='[Закріплені],n3,[Інші],n1');
  await pg.click('#trashRow'); await pg.waitForTimeout(250);
  ok('4b the trash shows it without a pin button', !(await pinOf(pg,'n2')));
  await btn(pg,'n2','.it-r'); await pg.waitForTimeout(200);
  ok('4c restored: pinned again, on top ('+await listText(pg)+')', await listText(pg)==='[Закріплені],n2,n3,[Інші],n1');

  // 5 unpin; with nothing pinned the headers go
  await btn(pg,'n2','.it-p'); const r5=await stored(pg,'n2');
  ok('5a «Покупки» unpinned: '+await listText(pg)+', the record has no pinned', await listText(pg)==='[Закріплені],n3,[Інші],n2,n1' && !('pinned' in r5));
  await btn(pg,'n3','.it-p');
  ok('5b nothing pinned: no headers ('+await listText(pg)+')', !/\[/.test(await listText(pg)) && (await listText(pg)).split(',').length===3);

  // 6 a reload keeps the pins
  await btn(pg,'n1','.it-p'); await pg.reload(); await ready(pg); await pg.waitForTimeout(300);
  ok('6 after a reload: '+await listText(pg), /^\[Закріплені\],n1,\[Інші\],/.test(await listText(pg)) && (await pinOf(pg,'n1')).on);

  // 7 export and import
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.evaluate(()=>{ document.getElementById('setBtn').click(); document.getElementById('exportBtn').click(); })]);
  const ex=JSON.parse(fs.readFileSync(await dl.path(),'utf8')), x1=ex.notes.find(n=>n.id==='n1'), x2=ex.notes.find(n=>n.id==='n2');
  ok('7a export carries «pinned» on the pinned note only', x1 && x1.pinned>0 && x2 && !('pinned' in x2));
  await load(pg,[{...NOTES[0], updated:Date.now()+1000}]);
  ok('7b a newer copy without «pinned» unpins it ('+await listText(pg)+')', !/\[/.test(await listText(pg)) && !(await stored(pg,'n1')).pinned);
  await load(pg,[{...NOTES[2], pinned:Date.now(), updated:Date.now()+2000}]);
  ok('7c a newer copy with «pinned» pins it ('+await listText(pg)+')', /^\[Закріплені\],n3,\[Інші\]/.test(await listText(pg)) && (await stored(pg,'n3')).pinned>0);

  // 7d the keyboard: Tab from the item reaches the pin first; Enter and Space toggle it, keep the focus on it and do not open the note
  await open(pg,'n1'); await pg.waitForTimeout(300); const item=pg.locator('#list .item[data-id="n2"]');
  await item.focus(); await pg.keyboard.press('Tab'); const f1=await pg.evaluate(()=>document.activeElement.className);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(400); const k1=!!(await stored(pg,'n2')).pinned, f2=await pg.evaluate(()=>document.activeElement.className+'@'+(document.activeElement.closest('.item')||{dataset:{}}).dataset.id);
  await pg.keyboard.press(' '); await pg.waitForTimeout(400);
  ok('7d Tab → «'+f1+'»; Enter pins «Покупки» (focus on '+f2+'), Space unpins it; «Ключі» stays open', f1==='it-p' && k1 && f2==='it-p on@n2' && !(await stored(pg,'n2')).pinned && await cur(pg)==='n1');

  // 7e a pin or an unpin that missed IndexedDB lands in localStorage and moves in at the next start, with no backup copy
  const fbKeys=()=>pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).length);
  const viaFallback=async(id)=>{ await pg.evaluate(()=>{ sheetDebug.saveGate=()=>Promise.reject(new DOMException('full','QuotaExceededError')); }); await btn(pg,id,'.it-p'); const k=await fbKeys();
    await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); await pg.reload(); await ready(pg); await until(async()=>!(await fbKeys())); await pg.waitForTimeout(300); return k; };
  const kp=await viaFallback('n2'), sp=await stored(pg,'n2'), lp=await listText(pg);
  const ku=await viaFallback('n2'), su=await stored(pg,'n2'), lu=await listText(pg);
  ok('7e pinned through localStorage ('+kp+' key): stored pinned after a reload ('+lp+'); unpinned the same way ('+ku+' key): stored without it ('+lu+'); no backup notes', kp===1 && sp.pinned>0 && lp.startsWith('[Закріплені],n2,') && ku===1 && !su.pinned && !lu.includes(',n2,[') && (await pg.locator('#list .item').count())===3);

  // 7e2 an edit that went to localStorage, then a pin: refused with the hint to reload (the leftover moves in at the next start); after the reload the edit is stored and the pin works
  await open(pg,'n2'); await pg.waitForTimeout(300); await pg.evaluate(()=>{ sheetDebug.saveGate=()=>Promise.reject(new DOMException('full','QuotaExceededError')); });
  await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' сир'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); const k2=await fbKeys();
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); await btn(pg,'n2','.it-p'); const t2h=await pg.locator('#toast').innerText(), p2h=await pinOf(pg,'n2');
  await pg.reload(); await ready(pg); await until(async()=>!(await fbKeys())); await pg.waitForTimeout(300); await btn(pg,'n2','.it-p'); const s2=await stored(pg,'n2');
  ok('7e2 the edit went to localStorage ('+k2+' key); the pin was refused («'+t2h+'»); after a reload: «'+s2.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s2.pinned, k2===1 && /перезавантаження/.test(t2h) && !p2h.on && s2.pinned>0 && s2.blocks.some(b=>/ сир$/.test(b.text)));
  await pg.evaluate(()=>[...document.querySelectorAll('#list .item')].filter(d=>/резервна копія/.test(d.textContent)).forEach(d=>d.querySelector('.it-x').click())); await pg.waitForTimeout(300);
  await btn(pg,'n2','.it-p');

  // 7e3 a new note whose import failed waits in memory as unsaved: a pin is refused with a hint (it would take the import's place); after «Повторити» it pins
  await pg.evaluate(()=>{ sheetDebug.failSave=true; }); await load(pg,[{id:'nx',title:'Не збережена',blocks:[{id:'x1',row:2,text:'чекає',fx:0.2}],created:1,updated:Date.now()}]);
  const w1=await pg.evaluate(()=>!document.getElementById('saveWarn').hidden); await btn(pg,'nx','.it-p'); const t1=await pg.locator('#toast').innerText(), px=await pinOf(pg,'nx');
  await pg.evaluate(()=>{ sheetDebug.failSave=false; document.getElementById('saveRetry').click(); }); await pg.waitForTimeout(500); await btn(pg,'nx','.it-p');
  await pg.reload(); await ready(pg); await pg.waitForTimeout(300); const sx=await stored(pg,'nx');
  ok('7e3 the failed import showed the warning ('+w1+'); the pin was refused: «'+t1+'»; after «Повторити» it pinned, stored after a reload ('+await listText(pg)+')', w1 && /ще не збережено/.test(t1) && !px.on && sx && sx.pinned>0 && sx.blocks.some(b=>b.text==='чекає') && (await listText(pg)).startsWith('[Закріплені],'));
  await btn(pg,'nx','.it-x');

  // 7e4 a pin of a note that is not open fails: an unpin is refused while the failed pin waits; «Повторити» stores the pin
  await open(pg,'n1'); await pg.waitForTimeout(300); await pg.evaluate(()=>{ sheetDebug.failSave=true; }); await btn(pg,'n2','.it-p'); const w4=await pg.evaluate(()=>!document.getElementById('saveWarn').hidden);
  await btn(pg,'n2','.it-p'); const t4=await pg.locator('#toast').innerText(), p4=await pinOf(pg,'n2');
  await pg.evaluate(()=>{ sheetDebug.failSave=false; document.getElementById('saveRetry').click(); }); await pg.waitForTimeout(500);
  ok('7e4 the failed pin showed the warning ('+w4+'); the unpin was refused («'+t4+'»), the note stays pinned; after «Повторити» the pin is stored ('+await listText(pg)+')', w4 && /ще не збережено/.test(t4) && p4.on && (await stored(pg,'n2')).pinned>0 && await pg.evaluate(()=>document.getElementById('saveWarn').hidden));
  await btn(pg,'n2','.it-p');

  // 7e5 a restore from the trash fails: a pin is refused until «Повторити» stores the restore; then it pins
  await btn(pg,'n2','.it-x'); await pg.click('#trashRow'); await pg.waitForTimeout(250); await pg.evaluate(()=>{ sheetDebug.failSave=true; }); await btn(pg,'n2','.it-r'); await pg.evaluate(()=>{ if(!document.getElementById('sect').hidden) document.getElementById('sectBack').click(); }); await pg.waitForTimeout(250);
  await btn(pg,'n2','.it-p'); const t5=await pg.locator('#toast').innerText(), d5=!!(await stored(pg,'n2')).deleted;
  await pg.evaluate(()=>{ sheetDebug.failSave=false; document.getElementById('saveRetry').click(); }); await pg.waitForTimeout(500); await btn(pg,'n2','.it-p'); await pg.waitForTimeout(300); const s5=await stored(pg,'n2');
  ok('7e5 the pin over a failed restore was refused («'+t5+'», still in the trash in storage: '+d5+'); after «Повторити» and a pin: deleted '+!!s5.deleted+', pinned '+!!s5.pinned, /ще не збережено/.test(t5) && d5 && !s5.deleted && s5.pinned>0 && (await listText(pg)).startsWith('[Закріплені],n2'));
  await btn(pg,'n2','.it-p');

  // 7k an edit, then a switch to another note (its write in flight) and at once a pin from the list; the earlier write fails: the pin wrote the note whole, so the edit is stored with the pin
  await open(pg,'n2'); await pg.waitForTimeout(300); await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' в польоті');
  await pg.evaluate(()=>{ let k=0; sheetDebug.saveGate=()=>++k===1? new Promise((_,no)=>setTimeout(()=>no(new DOMException('full','QuotaExceededError')),300)) : Promise.resolve(); });
  await pg.evaluate(()=>{ document.querySelector('#list .item[data-id="n1"]').click(); document.querySelector('#list .item[data-id="n2"] .it-p').click(); }); await pg.waitForTimeout(900);
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); const s7k=await stored(pg,'n2');
  ok('7k the pin made while the edit\'s write was in flight (and failed) stored both: «'+s7k.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s7k.pinned, s7k.pinned>0 && s7k.blocks.some(b=>/в польоті$/.test(b.text)));
  await pg.evaluate(()=>{ for(const k of Object.keys(localStorage)) if(k.startsWith('sheet:note:')) localStorage.removeItem(k); }); await pg.reload(); await ready(pg); await pg.waitForTimeout(300); await btn(pg,'n2','.it-p');   // the failed write's leftover can land after the pin: a reload clears it before the unpin

  // 7l a note never opened since the reload, its writes held: a pin and an unpin at once, then a pin, unpin and pin; no hint, and the last click is what is stored
  await open(pg,'n1'); await pg.reload(); await ready(pg); await pg.waitForTimeout(300); await pg.evaluate(()=>{ document.getElementById('toast').textContent=''; });
  const hold=()=>pg.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; }), letgo=()=>pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); });
  const clicks=k=>pg.evaluate(k=>{ for(let i=0;i<k;i++) document.querySelector('#list .item[data-id="n2"] .it-p').click(); }, k);
  await hold(); await clicks(2); const t7l=await pg.locator('#toast').innerText(); await letgo(); await pg.waitForTimeout(600); const a7=!!(await stored(pg,'n2')).pinned, l7=await listText(pg);
  await hold(); await clicks(3); await letgo(); await pg.waitForTimeout(600); const b7=!!(await stored(pg,'n2')).pinned;
  ok('7l two quick clicks: no hint («'+t7l+'»), stored pinned '+a7+' ('+l7+'); three: stored pinned '+b7, !/записано/.test(t7l) && !a7 && !l7.includes(',n2,[') && b7 && (await listText(pg)).startsWith('[Закріплені],n2'));
  await btn(pg,'n2','.it-p');

  // 7m typing whose autosave is held in flight, more typing, at once the pin and a switch to another note: the later typing goes in the pin's write and is stored with the pin
  await open(pg,'n2'); await pg.waitForTimeout(300); await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await hold(); await pg.keyboard.type(' 8'); await pg.waitForTimeout(500);
  await pg.keyboard.type(' 9'); await pg.evaluate(()=>{ document.querySelector('#list .item[data-id="n2"] .it-p').click(); document.querySelector('#list .item[data-id="n1"]').click(); }); await letgo(); await pg.waitForTimeout(800);
  const s7m=await stored(pg,'n2');
  ok('7m typing, a held autosave, more typing, pin and switch: stored «'+s7m.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s7m.pinned, s7m.pinned>0 && s7m.blocks.some(b=>/ 8 9$/.test(b.text)));
  await btn(pg,'n2','.it-p');
  // 7n the open note pinned and at once unpinned, the writes held: the unpin is what is stored
  await open(pg,'n2'); await pg.waitForTimeout(300); await hold(); await clicks(2); await letgo(); await pg.waitForTimeout(700);
  ok('7n pin and unpin of the open note under held writes: stored pinned '+!!(await stored(pg,'n2')).pinned+' ('+await listText(pg)+')', !(await stored(pg,'n2')).pinned && !(await listText(pg)).includes(',n2,['));

  // 7o typing in the open note and its pin (a whole write that fails), a switch, and a second click: the second write goes whole too, so the typing is stored
  await open(pg,'n2'); await pg.waitForTimeout(300); await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' 10');
  await pg.evaluate(()=>{ let k=0; sheetDebug.saveGate=()=>++k===1? new Promise((_,no)=>setTimeout(()=>no(new DOMException('full','QuotaExceededError')),300)) : Promise.resolve(); });
  await pg.evaluate(()=>{ document.querySelector('#list .item[data-id="n2"] .it-p').click(); document.querySelector('#list .item[data-id="n1"]').click(); document.querySelector('#list .item[data-id="n2"] .it-p').click(); }); await pg.waitForTimeout(900);
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); const s7o=await stored(pg,'n2');
  ok('7o the second click after a failing whole pin write stored the typing: «'+s7o.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s7o.pinned, s7o.blocks.some(b=>/ 10$/.test(b.text)) && !s7o.pinned);
  await pg.evaluate(()=>{ for(const k of Object.keys(localStorage)) if(k.startsWith('sheet:note:')) localStorage.removeItem(k); }); await pg.reload(); await ready(pg); await pg.waitForTimeout(300);

  // 7f an edit of a pinned note that missed IndexedDB: at the next start the older stored version is kept as a backup copy, and the copy is not pinned
  await open(pg,'n3'); await pg.waitForTimeout(300); await pg.evaluate(()=>{ sheetDebug.saveGate=()=>Promise.reject(new DOMException('full','QuotaExceededError')); });
  await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' нове'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700);
  await pg.evaluate(()=>{ sheetDebug.saveGate=null; }); await pg.reload(); await ready(pg); await until(async()=>!(await fbKeys())); await pg.waitForTimeout(300);
  const bk=await pg.evaluate(()=>[...document.querySelectorAll('#list .item')].filter(d=>/резервна копія/.test(d.textContent)).map(d=>d.dataset.id)), sb=bk.length? await stored(pg,bk[0]) : null;
  ok('7f the backup copy of the older version is in «Інші», not pinned ('+await listText(pg)+')', bk.length===1 && sb && !sb.pinned && (await stored(pg,'n3')).pinned>0 && (await listText(pg)).startsWith('[Закріплені],n3,[Інші],'));

  // 7g Delete on a button of the open note's item sends it to the trash, and the note that opens next is the top of the list (the pinned one), not the latest edited
  await open(pg,'n2'); await pg.waitForTimeout(300); await pg.locator('#sheet .blk .txt').first().click(); await pg.keyboard.press('End'); await pg.keyboard.type(' і хліб'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700);
  await open(pg,'n1'); await pg.waitForTimeout(300); const t3=(await stored(pg,'n3')).updated, t2=(await stored(pg,'n2')).updated;
  const at1=await pg.evaluate(()=>[...document.querySelectorAll('#list .item')].findIndex(d=>d.dataset.id==='n1'));
  await pg.locator('#list .item[data-id="n1"]').focus(); await pg.keyboard.press('Tab'); await pg.keyboard.press('Delete'); await pg.waitForTimeout(500);
  const fk=await pg.evaluate(()=>{ const a=document.activeElement, L=[...document.querySelectorAll('#list .item')]; return a && a.classList.contains('item')? L.indexOf(a)+'/'+L.length : a && a.tagName; });
  ok('7g2 the focus went to the item now in the deleted one\'s place (was '+at1+', now '+fk+')', /^(\d+)\/(\d+)$/.test(fk) && +fk.split('/')[0]===Math.min(at1, +fk.split('/')[1]-1));
  // 7h a held Delete trashes one note, not the next ones too
  const before=await pg.evaluate(()=>document.querySelectorAll('#list .item').length); await pg.keyboard.down('Delete'); await pg.keyboard.down('Delete'); await pg.keyboard.down('Delete'); await pg.keyboard.up('Delete'); await pg.waitForTimeout(600);
  ok('7h a held Delete with repeats trashed one note ('+before+' → '+await pg.evaluate(()=>document.querySelectorAll('#list .item').length)+')', await pg.evaluate(()=>document.querySelectorAll('#list .item').length)===before-1);
  // 7i a mouse click on a pin leaves no focus in the list, so the moved item does not keep its buttons shown
  const id9=await pg.evaluate(()=>document.querySelector('#list .item.pa').dataset.id); await btn(pg,id9,'.it-p'); const f9=await pg.evaluate(()=>{ const a=document.activeElement; return !!(a && document.getElementById('list').contains(a)); });
  ok('7i after a mouse click on the pin no focus is left in the list ('+f9+')', !f9);
  ok('7g Delete on the pin button trashed «Ключі»; «Komax старий» (pinned) opened rather than «Покупки» (edited later: '+(t2>t3)+')', (await stored(pg,'n1')).deleted>0 && await cur(pg)==='n3' && t2>t3);
  // 7j Enter on «Відновити» of the only note in the trash: the notes come back and the focus is on that note's item, not on its archive button
  if(await pg.locator('#trashRow').isVisible()){ await pg.click('#trashRow'); await pg.waitForTimeout(250); await pg.click('#trashEmpty'); await pg.waitForTimeout(250); await pg.click('#askYes'); await pg.waitForTimeout(500); }   // an empty trash first
  const id10=await pg.evaluate(()=>document.querySelector('#list .item.pa:not(.cur)').dataset.id); await btn(pg,id10,'.it-x'); await pg.click('#trashRow'); await pg.waitForTimeout(250);
  const trashN=await pg.evaluate(()=>document.querySelectorAll('#list .item').length); await pg.locator('#list .item[data-id="'+id10+'"]').focus(); await pg.keyboard.press('Tab'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600);
  const f10=await pg.evaluate(()=>{ const a=document.activeElement; return (a.className||a.tagName)+'@'+((a.closest&&a.closest('.item'))||{dataset:{}}).dataset.id; });
  ok('7j restored from a trash of '+trashN+' with Enter: the notes are back, the focus is on «'+f10+'»', trashN===1 && /^item/.test(f10) && f10.endsWith('@'+id10) && await pg.locator('#sect').isHidden());
  console.log(errs.length? errs.join('\n') : '✓ desktop: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── two tabs ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const errs=[];
  const page=async()=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await pg.goto(SITE); await ready(pg); return pg; };
  const A=await page(); await fresh(A); const B=await page(); await B.waitForTimeout(300);
  await A.bringToFront(); await btn(A,'n2','.it-p'); await until(async()=>(await listText(B)).startsWith('[Закріплені]'));
  ok('8a pinned in A, B shows the group: '+await listText(B), await listText(B)==='[Закріплені],n2,[Інші],n1,n3');
  await btn(A,'n2','.it-p'); await until(async()=>!(await listText(B)).includes('['));
  ok('8b unpinned in A, B drops it: '+await listText(B), await listText(B)==='n1,n2,n3' || await listText(B)==='n2,n1,n3');
  // 8c A edits a pinned note while B unpins it: A's write merges over the unpin, and its message to B carries the stored result, not A's old pin
  await btn(A,'n2','.it-p'); await until(async()=>(await listText(B)).startsWith('[Закріплені]')); await open(A,'n2'); await A.waitForTimeout(300);
  await A.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });
  await A.locator('#sheet .blk .txt').first().click(); await A.keyboard.press('End'); await A.keyboard.type(' 2%'); await A.keyboard.press('Escape'); await A.waitForTimeout(500);   // A's write waits at the gate
  await B.bringToFront(); await btn(B,'n2','.it-p'); await until(async()=>!(await stored(B,'n2')).pinned);
  await A.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await until(async()=>(await stored(A,'n2')).blocks.some(b=>/2%$/.test(b.text))); await B.waitForTimeout(800);
  const s8=await stored(B,'n2');
  ok('8c A\'s edit is stored without the pin, and B still lists it unpinned: '+await listText(B), !s8.pinned && s8.blocks.some(b=>/2%$/.test(b.text)) && !(await listText(B)).includes('['));
  await open(B,'n2'); await B.locator('#sheet .blk .txt').first().click(); await B.keyboard.press('End'); await B.keyboard.type('!'); await B.keyboard.press('Escape'); await B.waitForTimeout(800);
  ok('8d B\'s next edit does not write the pin back', !(await stored(B,'n2')).pinned && (await stored(B,'n2')).blocks.some(b=>/2%!$/.test(b.text)));
  // 8g A's write is in flight while B pins: A's write merges over the pin, and A lists the note pinned with its button pressed
  await A.bringToFront(); await open(A,'n3'); await A.waitForTimeout(300); await A.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });
  await A.locator('#sheet .blk .txt').first().click(); await A.keyboard.press('End'); await A.keyboard.type(' 3%'); await A.waitForTimeout(500);
  await B.evaluate(()=>document.querySelector('#list .item[data-id="n3"] .it-p').click()); await until(async()=>(await stored(B,'n3')).pinned>0); await A.waitForTimeout(400);
  await A.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await until(async()=>(await stored(A,'n3')).blocks.some(b=>/3%$/.test(b.text))); await A.waitForTimeout(400);
  const on8=await A.evaluate(()=>!!document.querySelector('#list .item[data-id="n3"] .it-p.on'));
  ok('8g A\'s edit and B\'s pin are both stored, and A lists the note pinned with its button pressed ('+await listText(A)+')', on8 && (await listText(A)).startsWith('[Закріплені],n3') && (await stored(A,'n3')).pinned>0 && (await stored(A,'n3')).blocks.some(b=>/3%$/.test(b.text)));
  await A.keyboard.press('Escape'); await A.waitForTimeout(500);
  ok('8h the caret left: the sheet shows the stored text, nothing is waiting', /3%/.test(await A.locator('#sheet').innerText()) && !(await A.evaluate(()=>document.getElementById('app').classList.contains('chg'))));
  // 8i A is typing (the autosave not yet run, or just run) while B unpins: A's text and B's unpin are both stored
  await A.locator('#sheet .blk .txt').first().click(); await A.keyboard.press('End'); await A.keyboard.type(' 4'); await B.evaluate(()=>document.querySelector('#list .item[data-id="n3"] .it-p').click());
  await until(async()=>!(await stored(B,'n3')).pinned); await A.waitForTimeout(300);
  await A.keyboard.press('Escape'); await A.waitForTimeout(800); const s9=await stored(A,'n3');
  ok('8i stored «'+s9.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s9.pinned+'; A lists '+await listText(A), s9.blocks.some(b=>/3% 4$/.test(b.text)) && !s9.pinned && !(await listText(A)).includes('[З'));

  // 8j a keyboard focus on an item's archive button stays there while another tab's change redraws the list
  await A.bringToFront(); await A.locator('#list .item[data-id="n2"]').focus(); await A.keyboard.press('Tab'); await A.keyboard.press('Tab'); const fa=await A.evaluate(()=>document.activeElement.className);
  await B.evaluate(()=>document.querySelector('#list .item[data-id="n1"] .it-p').click()); await until(async()=>(await listText(A)).startsWith('[Закріплені],n1')); await A.waitForTimeout(200);
  const fb=await A.evaluate(()=>{ const a=document.activeElement; return a.className+'@'+((a.closest&&a.closest('.item'))||{dataset:{}}).dataset.id; });
  ok('8j the focus on «'+fa+'» of n2 stays after B\'s pin redrew A\'s list ('+fb+')', fa==='it-r' && fb==='it-r@n2');
  await B.evaluate(()=>document.querySelector('#list .item[data-id="n1"] .it-p').click()); await until(async()=>!(await listText(A)).includes('['));

  // 8k the note holding A's keyboard focus is archived in B: A's focus goes to the item now in its place
  await A.bringToFront(); await A.locator('#list .item[data-id="n2"]').focus(); const at8=await A.evaluate(()=>[...document.querySelectorAll('#list .item')].findIndex(d=>d.dataset.id==='n2'));
  await B.evaluate(()=>document.querySelector('#list .item[data-id="n2"] .it-r').click()); await until(async()=>!(await listText(A)).includes('n2')); await A.waitForTimeout(200);
  const f8=await A.evaluate(()=>{ const a=document.activeElement, L=[...document.querySelectorAll('#list .item')]; return a && a.classList.contains('item')? L.indexOf(a)+'/'+L.length : a.tagName; });
  ok('8k n2 (item '+at8+') archived in B: A\'s focus is on item '+f8, /^\d+\/\d+$/.test(f8) && +f8.split('/')[0]===Math.min(at8, +f8.split('/')[1]-1));
  await B.evaluate(()=>{ document.getElementById('archRow').click(); }); await B.waitForTimeout(300); await B.evaluate(()=>document.querySelector('#list .item[data-id="n2"] .it-r').click()); await until(async()=>(await listText(A)).includes('n2'));

  // 8e a pin from the other tab while the caret is in A's block: A's next edit keeps the pin, and A lists the note pinned once the caret leaves
  await open(A,'n1'); await A.waitForTimeout(300); await A.bringToFront(); await A.locator('#sheet .blk .txt').first().click();
  await B.evaluate(()=>{ const it=document.querySelector('#list .item[data-id="n1"]'); it.querySelector('.it-p').click(); }); await until(async()=>(await listText(A)).startsWith('[Закріплені],n1'));
  await A.keyboard.press('End'); await A.keyboard.type(' ok'); await A.keyboard.press('Escape'); await A.waitForTimeout(700); const s8f=await stored(A,'n1');
  ok('8e A\'s next edit keeps B\'s pin ('+s8f.pinned+', «'+s8f.blocks.map(b=>b.text).join(' | ')+'»); A lists '+await listText(A), s8f.pinned>0 && s8f.blocks.some(b=>/ ok$/.test(b.text)) && (await listText(A)).startsWith('[Закріплені],n1'));
  // 8l A types in an archived note open from the archive section while B unarchives it: A's write merges, and the emptied section gives way to the notes at once
  await A.bringToFront(); await btn(A,'n3','.it-r'); await A.click('#archRow'); await A.waitForTimeout(300); await open(A,'n3'); await A.waitForTimeout(300); await A.locator('#sheet .blk .txt').first().click();
  await B.evaluate(()=>document.getElementById('archRow').click()); await B.waitForTimeout(300); await B.evaluate(()=>document.querySelector('#list .item[data-id="n3"] .it-r').click());
  await until(async()=>!(await stored(A,'n3')).archived); await A.keyboard.press('End'); await A.keyboard.type(' 8l'); await A.waitForTimeout(1000);
  const s8l=await stored(A,'n3'), sec8=await A.evaluate(()=>document.getElementById('sect').hidden), l8=await listText(A);
  ok('8l A typed in n3 from the archive while B unarchived it: stored '+(s8l.archived? 'archived' : 'unarchived')+' with «'+s8l.blocks.map(b=>b.text).join(' | ')+'»; A shows '+(sec8? 'the notes' : 'the archive')+': '+l8, !s8l.archived && s8l.blocks.some(b=>/ 8l$/.test(b.text)) && sec8 && l8.includes('n3'));
  await A.keyboard.press('Escape'); await A.waitForTimeout(500);
  console.log(errs.length? errs.join('\n') : '✓ tabs: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── two devices through the test cloud ── */
{ const cloud=new TestCloud({start:Date.now()}); const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX});
  await typeAt(A.pg,500,300,'нотатка для закріплення'); const id=await curId(A.pg); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(600); await settle(A.pg);
  await settle(B.pg,600); await settle(B.pg);
  await A.pg.bringToFront(); await btn(A.pg,id,'.it-p'); await settle(A.pg); await settle(B.pg,600); await settle(B.pg);
  const doc=cloud.doc('notes',id), sb=await stored(B.pg,id);
  ok('9a the pin reached the cloud (pinned '+(doc&&doc.pinned)+') and device B', doc && doc.pinned>0 && sb && sb.pinned===doc.pinned);
  ok('9b B lists it under «Закріплені»: '+await listText(B.pg), (await listText(B.pg)).startsWith('[Закріплені],'+id+','));
  await B.pg.bringToFront(); await btn(B.pg,id,'.it-p'); await settle(B.pg); await settle(A.pg,600); await settle(A.pg);
  ok('9c unpinned on B: gone from the cloud document and from A\'s group', !('pinned' in cloud.doc('notes',id)) && !(await stored(A.pg,id)).pinned && !(await listText(A.pg)).includes('['));
  const copies=(await A.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('versions','readonly').objectStore('versions').getAll(); g.onsuccess=()=>{ d.close(); res(g.result.filter(v=>v.reason==='copy').length); }; }; })));
  ok('9d no conflict copies ('+copies+'); status «'+await A.pg.evaluate(()=>sheetDebug.sync.status.code)+'»', copies===0 && await A.pg.evaluate(()=>sheetDebug.sync.status.code)==='synced');
  // 9e a pin from the other device while A has the caret in the note: A lists it pinned once the caret leaves, and the text is untouched
  await A.pg.bringToFront(); await A.pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"]').click(), id); await A.pg.waitForTimeout(300);
  await A.pg.locator('#sheet .blk .txt').first().click();
  await B.pg.evaluate(id=>document.querySelector('#list .item[data-id="'+id+'"] .it-p').click(), id); await settle(B.pg); await settle(A.pg,600); await settle(A.pg);
  await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(500); await settle(A.pg);
  ok('9e pinned on B while A had the caret in it: A lists '+await listText(A.pg)+', stored pinned with its text', (await listText(A.pg)).startsWith('[Закріплені],'+id) && (await stored(A.pg,id)).pinned>0 && /нотатка для закріплення/.test(await A.pg.locator('#sheet').innerText()));
  // 9f a note A opened once, then took from the cloud while not open, is pinned while A's archive and unarchive of it wait and a newer cloud edit has landed:
  // the pin merges over what A took, so the newer edit stays and there is no conflict copy
  cloudWrite(cloud,'x9',{title:'З хмари', blocks:[{id:'xb',row:2,fx:0.2,text:'x1'}]}); await settle(A.pg,600); await settle(A.pg);
  await A.pg.bringToFront(); await open(A.pg,'x9'); await A.pg.waitForTimeout(300); await open(A.pg,id); await A.pg.waitForTimeout(300);
  cloudWrite(cloud,'x9',{title:'З хмари', blocks:[{id:'xb',row:2,fx:0.2,text:'x2'}]}); await settle(A.pg,600); await settle(A.pg);
  const t9=(await stored(A.pg,'x9')).blocks[0].text;
  await A.pg.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });
  await btn(A.pg,'x9','.it-r'); await A.pg.click('#archRow'); await A.pg.waitForTimeout(300); await btn(A.pg,'x9','.it-r'); await A.pg.evaluate(()=>{ sheetDebug.saveGate=null; });
  cloudWrite(cloud,'x9',{title:'З хмари', blocks:[{id:'xb',row:2,fx:0.2,text:'x3'}]}); await settle(A.pg,600); await settle(A.pg);
  await btn(A.pg,'x9','.it-p'); await A.pg.evaluate(()=>window.__open()); await A.pg.waitForTimeout(400); await settle(A.pg); await settle(A.pg);
  const s9=await stored(A.pg,'x9'), c9=(await A.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const g=d.transaction('versions','readonly').objectStore('versions').getAll(); g.onsuccess=()=>{ d.close(); res(g.result.filter(v=>v.reason==='copy' && v.note==='x9').length); }; }; })));
  ok('9f A took «'+t9+'» from the cloud, then pinned the note under its waiting archive and unarchive: it stores «'+s9.blocks.map(b=>b.text).join(' | ')+'», pinned '+!!s9.pinned+', archived '+!!s9.archived+', '+c9+' conflict copies', t9==='x2' && s9.blocks.length===1 && s9.blocks[0].text==='x3' && s9.pinned>0 && !s9.archived && c9===0);
  const errs=[...A.errs, ...B.errs]; console.log(errs.length? errs.join('\n') : '✓ devices: no errors'); if(errs.length) fails++;
  await A.close(); await B.close(); }

/* ── a narrow window: the panel closes after an action, and the keyboard focus does not stay in it ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:800,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300); if(!(await pg.evaluate(()=>document.getElementById('app').classList.contains('open')))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); }
  await pg.locator('#list .item[data-id="n1"]').focus(); await pg.keyboard.press('Delete'); await pg.waitForTimeout(700);
  const st=await pg.evaluate(()=>{ const a=document.activeElement, r=document.getElementById('list').getBoundingClientRect(); return {inList:!!(a && document.getElementById('list').contains(a)), shown:r.right>0 && r.width>0}; });
  await pg.keyboard.press('Delete'); await pg.waitForTimeout(700); const gone=(await Promise.all(['n1','n2','n3'].map(id=>stored(pg,id)))).filter(n=>n && n.deleted).length;
  ok('11 at 800px: Delete trashed the open note, the panel '+(st.shown? 'stays' : 'closed')+', the focus '+(st.inList? 'is in' : 'left')+' the list, and a second Delete trashed nothing more ('+gone+' in the trash)', (st.shown || !st.inList) && gone===1);
  // 11b Enter on an item opens its note and closes the panel: the focus leaves the panel with it, so a Delete then trashes nothing
  if(!(await pg.evaluate(()=>document.getElementById('app').classList.contains('open')))){ await pg.click('#sideBtn'); await pg.waitForTimeout(400); }
  await pg.locator('#list .item[data-id="n3"]').focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  const st2=await pg.evaluate(()=>({cur:sheetDebug.cur(), open:document.getElementById('app').classList.contains('open'), inSide:document.getElementById('side').contains(document.activeElement)}));
  await pg.keyboard.press('Delete'); await pg.waitForTimeout(700); const gone2=(await Promise.all(['n1','n2','n3'].map(id=>stored(pg,id)))).filter(n=>n && n.deleted).length;
  ok('11b at 800px: Enter opened '+st2.cur+', the panel '+(st2.open? 'stays' : 'closed')+', the focus '+(st2.inSide? 'is in' : 'left')+' the panel, and a Delete trashed nothing more ('+gone2+' in the trash)', st2.cur==='n3' && (st2.open || !st2.inSide) && gone2===1);
  console.log(errs.length? errs.join('\n') : '✓ narrow: no errors'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const tap=async(x,y)=>{ await Promise.all([touch('touchStart',[{x,y}]), touch('touchEnd',[])]); };
  const tapEl=async(loc)=>{ const b=await box(loc); await tap(b.x+b.w/2, b.y+b.h/2); };
  const tapBtn=async(loc)=>{ await armClick(loc); await tapEl(loc); await clicked(pg); };
  await fresh(pg); await open(pg,'n3'); await pg.waitForTimeout(400);
  await tapBtn(pg.locator('#moreBtn')); const mi=pg.locator('.amenu.hm .mi',{hasText:'Закріпити вгорі'});
  ok('10a the header «⋯» has «Закріпити вгорі»', (await mi.count())===1);
  await tapBtn(mi); await until(async()=>((await stored(pg,'n3'))||{}).pinned>0);
  ok('10b it pins the open note: «'+await pg.locator('#toast').innerText()+'»', (await stored(pg,'n3')).pinned>0 && /закріплено вгорі/.test(await pg.locator('#toast').innerText()) && await cur(pg)==='n3');
  await pg.click('#sideBtn'); await pg.waitForTimeout(400);
  ok('10c the panel shows it under «Закріплені»: '+await listText(pg), await listText(pg)==='[Закріплені],n3,[Інші],n1,n2');
  await pg.screenshot({path:OUT+'/apppin-phone.png'});
  const cb=await box(pg.locator('#list .item[data-id="n3"] .it-p'));
  ok('10d the open note\'s pin button shows in the panel ('+cb.w+'×'+cb.h+')', cb.w>0 && await pg.locator('#list .item[data-id="n3"] .it-p').isVisible());
  await open(pg,'n3'); await pg.waitForTimeout(400); await tapBtn(pg.locator('#moreBtn')); const mu=pg.locator('.amenu.hm .mi',{hasText:'Відкріпити'});
  ok('10e for a pinned note the «⋯» offers «Відкріпити»', (await mu.count())===1);
  await tapBtn(mu); await until(async()=>!((await stored(pg,'n3'))||{}).pinned);
  ok('10f it unpins: «'+await pg.locator('#toast').innerText()+'»', /відкріплено/.test(await pg.locator('#toast').innerText()));
  console.log(errs.length? errs.join('\n') : '✓ phone: no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
