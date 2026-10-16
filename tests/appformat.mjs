// Storage ahead of sync (docs/SYNC-PLAN.md, PR 0): the database opens without a fixed version; data from a newer app (a larger version)
// opens view-only and nothing is written, the localStorage fallback included; another tab upgrading the database makes this one write what
// it has, then stay view-only with the unsaved part exportable; a blocked setup is view-only too; a fallback copy that differs is kept,
// moved together with its backup in one transaction, and each tab removes only its own fallback copies.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
const srv=await serve(); const SITE=srv.url;
srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');   // the same origin without the app, to set up its storage
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

// everything the app keeps: every store of the database (opened without a version) and the fallback keys in localStorage
const dump=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=async()=>{ const d=r.result, out={version:d.version, stores:{}};
  for(const s of d.objectStoreNames) out.stores[s]=await new Promise(ok=>{ const q=d.transaction(s,'readonly').objectStore(s).getAll(); q.onsuccess=()=>ok(q.result); q.onerror=()=>ok(null); });
  d.close(); out.ls=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).map(k=>[k,localStorage.getItem(k)])); res(out); }; r.onerror=()=>res(null); }));
const fbKeys=pg=>pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).map(k=>[k,localStorage.getItem(k)]));
const strip=pg=>pg.locator('#roStrip .rostrip').isVisible().then(v=>v? pg.locator('#roMsg').innerText() : '');
const fresh=async ctx=>{ const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.errs=errs; return pg; };
// the app is up: the language file is in and the list is drawn
const ready=async pg=>{ await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await pg.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout:10000}); await pg.waitForTimeout(150); };
// a click makes a block on the sheet; the text goes in only once the caret is in it (a click before the app is ready would type into the title)
// (a tab in the background takes no caret, so the page comes to the front first)
const typeAt=async(pg,x,y,t)=>{ await pg.bringToFront(); await pg.mouse.click(x,y); await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sheet .blk')),null,{timeout:3000}); await pg.keyboard.type(t); };
const tryType=async(pg,x,y,t)=>{ await pg.mouse.click(x,y); await pg.keyboard.type(t); };   // view-only: the sheet takes no caret
const go=async(pg,url)=>{ await pg.bringToFront(); await pg.goto(url); };   // a page left in the background may never finish loading
const sheetText=pg=>pg.locator('#sheet').innerText();
const has=(list,re)=>list.some(n=>re.test(JSON.stringify(n)));
// a controllable IndexedDB failure: localStorage __fail = 'all' (every write of a note) or 'backup' (only a «(резервна копія)» copy)
const FAILS=()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v){ let f=''; try{ f=localStorage.getItem('__fail')||''; }catch(_){}
  if(this.name==='notes' && (f==='all' || (f==='backup' && v && /резервна копія/.test(v.title||'')))) throw new DOMException('test failure','UnknownError');
  return put.apply(this, arguments); }; };
const bigV3=T=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>{ const d=r.result;
    d.createObjectStore('notes',{keyPath:'id'}); const v=d.createObjectStore('versions',{keyPath:'id'}); v.createIndex('note_t',['note','t']); v.createIndex('t','t');
    d.createObjectStore('blobs',{keyPath:['note','h']}); d.createObjectStore('sync',{keyPath:'k'}); };
  r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','versions','blobs','sync'],'readwrite');
    if(T){ t.objectStore('notes').put({id:'nA',title:'Нова версія',blocks:[{id:'a1',fx:0.1,row:2,text:'текст з новішого застосунку'}],created:T-5*864e5,updated:T-1000});
      t.objectStore('notes').put({id:'nOld',title:'Давно в кошику',blocks:[{id:'o1',fx:0.1,row:2,text:'кошик понад 30 днів'}],created:T-90*864e5,updated:T-40*864e5,deleted:T-40*864e5});
      t.objectStore('versions').put({id:'vK',note:'nA',t:T-2000,w:T-2000,reason:'conflict',keep:1,inline:1,title:'Нова версія',sig:'x',size:10,sum:{ch:1,add:0,del:0,mv:0,ttl:0},blocks:[{id:'a1',fx:0.1,row:2,s:'конфліктна копія'}]});
      t.objectStore('blobs').put({note:'nA',h:'h1',s:'тіло',r:0,z:8}); }
    t.objectStore('sync').put({k:'format',v:3}); t.oncomplete=()=>{ d.close(); res(); }; }; });
const delDb=()=>new Promise(r=>{ const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); });

/* ── 1. a new device: the database is created as v2 with its stores; an empty v1 left by someone else is completed ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await fresh(ctx);
  await go(pg,SITE); await ready(pg);
  await typeAt(pg,500,300,'нова нотатка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const d=await dump(pg);
  ok('1 a new device: database v2 with notes, versions and blobs ('+d.version+': '+Object.keys(d.stores).join(', ')+'), the note is in it', d.version===2 && ['notes','versions','blobs'].every(s=>s in d.stores) && has(d.stores.notes,/нова нотатка/));
  ok('1b no view-only strip on a new device', !(await strip(pg)));
  await go(pg,SITE+'blank.html'); await pg.evaluate(delDb);
  await pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('sheet',1); q.onsuccess=()=>{ q.result.close(); r(); }; }));   // an empty v1, no stores
  await go(pg,SITE); await ready(pg);
  await typeAt(pg,500,300,'після порожньої v1'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const d1=await dump(pg);
  ok('1c an empty v1 database gets its stores (v'+d1.version+') and the note is saved', d1.version===2 && ['notes','versions','blobs'].every(s=>s in d1.stores) && has(d1.stores.notes,/після порожньої v1/) && !(await strip(pg)));
  ok('1d no page errors', !pg.errs.length); await ctx.close(); }

/* ── 1e. two tabs start together on a new device: both get the v2 stores and both can write ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const p1=await fresh(ctx), p2=await fresh(ctx);
  await Promise.all([p1.goto(SITE,{waitUntil:'domcontentloaded'}), p2.goto(SITE,{waitUntil:'domcontentloaded'})]);   // two navigations at once may never report «load» to Playwright
  await p1.bringToFront(); await ready(p1); await p2.bringToFront(); await ready(p2); await p1.waitForTimeout(3500);   // a tab left in the background may not load; then past the wait for a blocked upgrade
  await typeAt(p1,500,300,'перша вкладка'); await p1.keyboard.press('Escape'); await p1.waitForTimeout(600);
  await typeAt(p2,500,420,'друга вкладка'); await p2.keyboard.press('Escape'); await p2.waitForTimeout(600);
  const d=await dump(p1);
  ok('1e two tabs starting together: no strip in either, v'+d.version+', both texts written', !(await strip(p1)) && !(await strip(p2)) && d.version===2 && has(d.stores.notes,/перша вкладка/) && has(d.stores.notes,/друга вкладка/) && !Object.keys(d.ls).length);
  ok('1f no page errors', !p1.errs.length && !p2.errs.length); await ctx.close(); }

/* ── 1g. the database is deleted while the app is open (site data cleared): the next save makes a new v2 and goes on ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const a=await fresh(ctx), b=await fresh(ctx);
  await go(a,SITE); await ready(a); await typeAt(a,500,300,'до видалення бази'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
  await go(b,SITE+'blank.html'); await b.evaluate(delDb);
  await typeAt(a,500,420,'після видалення бази'); await a.keyboard.press('Escape'); await a.waitForTimeout(800);
  const d=await dump(a);
  ok('1g after the database was deleted the app writes on into a new v'+d.version+', no strip', d.version===2 && has(d.stores.notes,/після видалення бази/) && !(await strip(a)));
  ok('1h no page errors', !a.errs.length); await ctx.close(); }

/* ── 2. rollback: data from a newer app (v3 with `sync`, keep/inline history) opens view-only, nothing at all is written ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const pg=await fresh(ctx);
  await go(pg,SITE+'blank.html');
  const T=Date.now();
  await pg.evaluate(bigV3, T);
  await pg.evaluate(T=>localStorage.setItem('sheet:note:nA', JSON.stringify({id:'nA',title:'Нова версія',blocks:[{id:'a1',fx:0.1,row:2,text:'старіша резервна копія'}],created:T-5*864e5,updated:T-60000})), T);
  const before=await dump(pg);
  await go(pg,SITE); await ready(pg);
  const msg=await strip(pg);
  ok('2 newer data: the strip says this version is older than the data ('+msg+')', /старша за ваші дані/.test(msg) && /переглядати й експортувати/.test(msg));
  ok('2b the strip has «Експорт» and «Оновити», no trash buttons', await pg.locator('#roExport').isVisible() && /^Експорт$/.test((await pg.locator('#roExport').innerText()).trim()) && await pg.locator('#roReload').isVisible() && !(await pg.locator('#roRestore').isVisible()) && !(await pg.locator('#roPurge').isVisible()));
  const items=await pg.locator('#list .item').allInnerTexts();
  ok('2c the notes show, with the differing fallback copy as its own note ('+items.length+')', items.some(t=>/Нова версія/.test(t) && !/резервна/.test(t)) && items.some(t=>/Нова версія \(резервна копія\)/.test(t)));
  ok('2d the sheet is inert and the title not editable', await pg.locator('#sheet').evaluate(e=>e.inert) && (await pg.locator('#ttl').getAttribute('contenteditable'))==='false');
  await pg.keyboard.press('Control+Alt+KeyN'); await pg.locator('#newBtn').click(); await pg.waitForTimeout(200);
  ok('2e «Нова» says it is view only', /лише перегляд/.test(await pg.locator('#toast').innerText()));
  await tryType(pg,500,400,'спроба писати'); await pg.waitForTimeout(800);
  ok('2f typing changes nothing on the sheet', !/спроба писати/.test(await sheetText(pg)));
  await pg.evaluate(()=>{ window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); }); await pg.waitForTimeout(500);   // back to the tab: the tab sync reads the storage
  const items2=await pg.locator('#list .item').allInnerTexts();
  ok('2g the backup copy stays after the tab comes back (the tab sync keeps notes that live only in memory)', items2.some(t=>/Нова версія \(резервна копія\)/.test(t)));
  const after=await dump(pg);
  ok('2h nothing written: the database (v'+after.version+') and the fallback keys are exactly as before', JSON.stringify(after)===JSON.stringify(before));
  ok('2i the note in the trash for 40 days was not purged, the fallback key was not moved', after.stores.notes.some(n=>n.id==='nOld') && 'sheet:note:nA' in after.ls);
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#roExport').click()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  const vk=data.history && data.history.versions.find(v=>v.id==='vK');
  ok('2j export from the strip: the notes, the backup copy and the raw history with keep/inline', data.notes.some(n=>n.id==='nA') && data.notes.some(n=>n.id==='nOld') && data.notes.some(n=>/резервна копія/.test(n.title) && n.blocks.some(b=>/старіша резервна копія/.test(b.text))) && vk && vk.keep===1 && vk.inline===1 && vk.blocks[0].s==='конфліктна копія' && data.history.blobs.length===1);
  ok('2k still nothing written after the export (only the export time in settings)', JSON.stringify(await dump(pg))===JSON.stringify(before));
  ok('2l no page errors', !pg.errs.length); await ctx.close(); }

/* ── 2m. the connection went away (the database was deleted) and a newer app made v3 meanwhile: the next save reopens, finds v3 and writes nothing ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const a=await fresh(ctx);
  await go(a,SITE); await ready(a); await typeAt(a,500,300,'до підміни'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
  await a.evaluate(delDb); await a.evaluate(bigV3, 0);   // from the same page, so the tab stays in front: an empty v3 with notes, versions, blobs, sync
  await a.mouse.click(500,420); await a.waitForTimeout(800);   // a click makes a block and a save: the save reopens the database and finds v3
  const d=await dump(a), msg=await strip(a);
  ok('2m the reopened v3 got no write and no fallback key (v'+d.version+', '+d.stores.notes.length+' notes, '+Object.keys(d.ls).length+' keys)', d.version===3 && !d.stores.notes.length && !Object.keys(d.ls).length);
  ok('2n the tab turned view-only at once and says the last edit was not saved ('+msg+')', /не вдалося зберегти/.test(msg) && await a.locator('#sheet').evaluate(e=>e.inert));
  const [dl]=await Promise.all([a.waitForEvent('download'), a.locator('#roExport').click()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  ok('2o «Експортувати незбережене» carries the notes that now live only in memory (the old database is gone)', has(data.notes,/до підміни/));
  ok('2p no page errors', !a.errs.length); await ctx.close(); }

/* ── 3. another tab upgrades the database: this tab writes what it has first, then stays view-only ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const a=await fresh(ctx), b=await fresh(ctx);
  await go(a,SITE); await ready(a);
  await go(b,SITE+'blank.html');
  await typeAt(a,500,300,'до оновлення');   // no wait: the autosave (300 ms) has not run yet
  const notes=await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>r.result.createObjectStore('sync',{keyPath:'k'});
    r.onsuccess=()=>{ const d=r.result, q=d.transaction('notes','readonly').objectStore('notes').getAll(); q.onsuccess=()=>{ d.close(); res(q.result); }; }; }));
  ok('3 the text typed just before the upgrade was written before the tab let go', has(notes,/до оновлення/));
  await a.waitForTimeout(300);
  const msg=await strip(a);
  ok('3b the tab says Baobook was updated in another tab ('+msg+')', /оновився в іншій вкладці/.test(msg) && !/не вдалося/.test(msg));
  ok('3c with nothing unsaved the button is plain «Експорт»', /^Експорт$/.test((await a.locator('#roExport').innerText()).trim()));
  const before=await dump(a);
  await tryType(a,500,500,'після оновлення'); await a.waitForTimeout(800);
  ok('3d after it, typing and saving change nothing', !/після оновлення/.test(await sheetText(a)) && JSON.stringify(await dump(a))===JSON.stringify(before));
  ok('3e no page errors', !a.errs.length); await ctx.close(); }

/* ── 3f. the same, but the last edit could not be written: the strip offers to export it ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const a=await fresh(ctx), b=await fresh(ctx);
  await go(a,SITE); await ready(a); await a.evaluate(()=>{ window.sheetDebug.failSave=true; });
  await typeAt(a,500,300,'незбережений текст'); await a.waitForTimeout(600);
  await go(b,SITE+'blank.html');
  await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>r.result.createObjectStore('sync',{keyPath:'k'}); r.onsuccess=()=>{ r.result.close(); res(); }; }));
  await a.waitForTimeout(400);
  const msg=await strip(a);
  ok('3f the strip says the last edit could not be saved ('+msg+')', /не вдалося зберегти/.test(msg));
  ok('3g the button is «Експортувати незбережене»', /Експортувати незбережене/.test(await a.locator('#roExport').innerText()));
  const [dl]=await Promise.all([a.waitForEvent('download'), a.locator('#roExport').click()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  ok('3h the export carries the unsaved text from memory', has(data.notes,/незбережений текст/));
  ok('3i nothing went to the localStorage fallback', !Object.keys((await dump(a)).ls).length);
  ok('3j no page errors', !a.errs.length); await ctx.close(); }

/* ── 4. a blocked setup: another connection holds an empty v1, so the stores cannot be created: view-only until a reload ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const a=await fresh(ctx), b=await fresh(ctx);
  await go(b,SITE+'blank.html');
  await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',1); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // kept open, deaf to versionchange
  await go(a,SITE); await ready(a); await a.waitForTimeout(3600);   // a block that lasts over 3 s
  const msg=await strip(a);
  ok('4 blocked: the strip asks to close the other tabs ('+msg+')', /Закрийте інші вкладки Baobook/.test(msg));
  await tryType(a,500,400,'заблоковано'); await a.waitForTimeout(600);
  ok('4b typing changes nothing and nothing goes to the fallback', !/заблоковано/.test(await sheetText(a)) && !(await fbKeys(a)).length);
  await b.evaluate(()=>window.__hold.close()); await a.reload(); await ready(a);
  await typeAt(a,500,300,'розблоковано'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
  const d=await dump(a);
  ok('4c after the other tab lets go, a reload works as usual (v'+d.version+')', !(await strip(a)) && d.version===2 && has(d.stores.notes,/розблоковано/));
  ok('4d no page errors', !a.errs.length); await ctx.close(); }

/* ── 5. fallback copies in the usual mode: a copy that differs is kept as a note of its own, an identical one just goes ── */
const seed=T=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readwrite'), s=t.objectStore('notes');
  s.put({id:'fA',title:'Перша',blocks:[{id:'a',fx:0.1,row:2,text:'основний текст А'}],created:T-9e5,updated:T-1000});
  s.put({id:'fB',title:'Друга',blocks:[{id:'b',fx:0.1,row:2,text:'однаковий текст Б'}],created:T-9e5,updated:T-1000});
  s.put({id:'fC',title:'Третя',blocks:[{id:'c',fx:0.1,row:2,text:'старий текст В'}],created:T-9e5,updated:T-5000});
  t.oncomplete=()=>{ d.close(); res(); }; }; });
const seedFb=T=>{ const put=n=>localStorage.setItem('sheet:note:'+n.id, JSON.stringify(n));
  put({id:'fA',title:'Перша',blocks:[{id:'a',fx:0.1,row:2,text:'старіша резервна А'}],created:T-9e5,updated:T-1000});   // equal time, other text
  put({id:'fB',title:'Друга',blocks:[{id:'b',fx:0.1,row:2,text:'однаковий текст Б'}],created:T-9e5,updated:T-1000});   // identical
  put({id:'fC',title:'Третя',blocks:[{id:'c',fx:0.1,row:2,text:'новіший текст В'}],created:T-9e5,updated:T-100}); };   // newer
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); await ctx.addInitScript(FAILS); const pg=await fresh(ctx);
  await go(pg,SITE); await ready(pg);
  const T=Date.now(); await pg.evaluate(seed, T); await pg.evaluate(seedFb, T);
  // the backup copy cannot be written: neither copy goes in, the stored note and the fallback key stay
  await pg.evaluate(()=>localStorage.setItem('__fail','backup')); await pg.reload(); await ready(pg);
  const d0=await dump(pg), byText0=re=>d0.stores.notes.filter(n=>has([n],re));
  ok('5 the backup of the older note cannot be written: the newer copy did not replace it, the key stays for the next start', byText0(/старий текст В/).some(n=>n.id==='fC') && !byText0(/новіший текст В/).length && 'sheet:note:fC' in d0.ls && !d0.stores.notes.some(n=>/резервна/.test(n.title)));
  await pg.evaluate(()=>localStorage.removeItem('__fail')); await pg.reload(); await ready(pg);
  const d=await dump(pg), byText=re=>d.stores.notes.filter(n=>has([n],re));
  ok('5b a copy with the same time but other text: the stored note stays and the copy becomes «Перша (резервна копія)»', byText(/основний текст А/).some(n=>n.id==='fA') && byText(/старіша резервна А/).some(n=>n.id!=='fA' && n.title==='Перша (резервна копія)'));
  ok('5c an identical copy just goes, no duplicate', byText(/однаковий текст Б/).length===1);
  ok('5d a newer copy becomes the note and the older stored one is kept as «Третя (резервна копія)», in one go', byText(/новіший текст В/).some(n=>n.id==='fC') && byText(/старий текст В/).some(n=>n.id!=='fC' && n.title==='Третя (резервна копія)'));
  ok('5e the fallback keys are gone after the move', !Object.keys(d.ls).length);
  ok('5f no strip in the usual mode', !(await strip(pg)));
  ok('5g no page errors', !pg.errs.length); await ctx.close(); }

/* ── 6. two tabs, IndexedDB refusing writes: each tab keeps its fallback copy under its own key and removes only its own ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); await ctx.addInitScript(FAILS); const a=await fresh(ctx), b=await fresh(ctx);
  await go(a,SITE); await ready(a); await typeAt(a,500,300,'спільна нотатка'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
  await go(b,SITE); await ready(b);
  await a.evaluate(()=>localStorage.setItem('__fail','all'));
  await typeAt(a,500,420,'рядок від A'); await a.keyboard.press('Escape'); await a.waitForTimeout(700);
  ok('6 IndexedDB refused: A says «Збережено» and keeps the note under its own fallback key', /Збережено|✓/.test(await a.locator('#saved').innerText()) || !(await a.locator('#saveWarn').isVisible()));
  await typeAt(b,500,540,'рядок від B'); await b.keyboard.press('Escape'); await b.waitForTimeout(700);
  const k1=await fbKeys(a);
  ok('6b two tabs, two fallback keys of the same note ('+k1.map(x=>x[0].replace('sheet:note:','')).join(', ')+')', k1.length===2 && k1.every(([k])=>/~/.test(k)) && k1.some(([,v])=>/рядок від B/.test(v)));
  await a.evaluate(()=>localStorage.removeItem('__fail'));
  await typeAt(a,500,660,'знову A'); await a.keyboard.press('Escape'); await a.waitForTimeout(700);
  const k2=await fbKeys(a), d=await dump(a);
  ok('6c A writes to IndexedDB again and removes only its own key; B\'s copy stays', k2.length===1 && /рядок від B/.test(k2[0][1]) && has(d.stores.notes,/знову A/));
  await b.bringToFront(); await b.reload(); await ready(b); const d2=await dump(b);
  ok('6d B\'s next start moves its copy in (the note has B\'s line, no keys left)', has(d2.stores.notes,/рядок від B/) && !Object.keys(d2.ls).length);
  ok('6e no page errors', !a.errs.length && !b.errs.length); await ctx.close(); }

await br.close(); await srv.close(); process.exit(fails?1:0);
