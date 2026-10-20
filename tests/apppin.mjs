// Pinned notes: the pin button of a list item, the «Закріплені» group above «Інші» (the last pinned on top; by rank in a search), the archive
// and the trash taking a note out of the group and a restore bringing it back, export and import, another tab, another device through the
// test cloud, and the header «⋯» on a phone.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { ready, armClick, clicked, until } from './lib/wait.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, typeAt, curId } from './lib/cloudpage.mjs';
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
const pinOf=(pg,id)=>pg.evaluate(id=>{ const b=document.querySelector('#list .item[data-id="'+id+'"] .it-p'); return b? {on:b.classList.contains('on'), title:b.title, pressed:b.getAttribute('aria-pressed')} : null; }, id);

/* ── desktop ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await fresh(pg); await open(pg,'n1'); await pg.waitForTimeout(300);
  const p0=await pinOf(pg,'n3');
  ok('0 an item offers «'+(p0&&p0.title)+'»; nothing pinned, no groups ('+await listText(pg)+')', p0 && p0.title==='Закріпити вгорі' && !p0.on && await listText(pg)==='n1,n2,n3');

  // 1 the pin: the oldest note goes up into «Закріплені», the rest under «Інші»; the open note stays open
  await btn(pg,'n3','.it-p'); const r1=await stored(pg,'n3'), p1=await pinOf(pg,'n3');
  ok('1a «Komax старий» pinned: '+await listText(pg), await listText(pg)==='[Закріплені],n3,[Інші],n1,n2');
  ok('1b stored with pinned, not archived; the button is pressed and offers «'+p1.title+'»; «Ключі» is still open', r1.pinned>0 && !r1.archived && !r1.deleted && p1.on && p1.pressed==='true' && p1.title==='Відкріпити' && await cur(pg)==='n1');
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
  const errs=[...A.errs, ...B.errs]; console.log(errs.length? errs.join('\n') : '✓ devices: no errors'); if(errs.length) fails++;
  await A.close(); await B.close(); }

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
