// Storage ahead of sync (docs/SYNC-PLAN.md, PR 0): the database opens without a fixed version; data from a newer app (a larger version)
// opens view-only and nothing is written, the localStorage fallback included; another tab upgrading the database makes this one write what
// it has, then stay view-only with the unsaved part exportable; a blocked setup is view-only too; a fallback copy that differs is kept.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
const srv=await serve(); const SITE=srv.url;
srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');   // the same origin without the app, to set up its storage
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const DAY=864e5;

// everything the app keeps: every store of the database (opened without a version) and the fallback keys in localStorage
const dump=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=async()=>{ const d=r.result, out={version:d.version, stores:{}};
  for(const s of d.objectStoreNames) out.stores[s]=await new Promise(ok=>{ const q=d.transaction(s,'readonly').objectStore(s).getAll(); q.onsuccess=()=>ok(q.result); q.onerror=()=>ok(null); });
  d.close(); out.ls=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).map(k=>[k,localStorage.getItem(k)])); res(out); }; r.onerror=()=>res(null); }));
const strip=pg=>pg.locator('#roStrip .rostrip').isVisible().then(v=>v? pg.locator('#roMsg').innerText() : '');
const fresh=async ctx=>{ const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.errs=errs; return pg; };
const typeAt=async(pg,x,y,t)=>{ await pg.mouse.click(x,y); await pg.keyboard.type(t); };
const sheetText=pg=>pg.locator('#sheet').innerText();

/* ── 1. a new device: the database is created as v2 with its stores; an empty v1 left by someone else is completed ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await fresh(ctx);
  await pg.goto(SITE); await pg.waitForTimeout(500);
  await typeAt(pg,500,300,'нова нотатка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const d=await dump(pg);
  ok('1 a new device: database v2 with notes, versions and blobs ('+d.version+': '+Object.keys(d.stores).join(', ')+'), the note is in it', d.version===2 && ['notes','versions','blobs'].every(s=>s in d.stores) && d.stores.notes.some(n=>n.blocks.some(b=>/нова нотатка/.test(b.text))));
  ok('1b no view-only strip on a new device', !(await strip(pg)));
  await pg.goto(SITE+'blank.html'); await pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); }));
  await pg.evaluate(()=>new Promise(r=>{ const q=indexedDB.open('sheet',1); q.onsuccess=()=>{ q.result.close(); r(); }; }));   // an empty v1, no stores
  await pg.goto(SITE); await pg.waitForTimeout(500);
  await typeAt(pg,500,300,'після порожньої v1'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const d1=await dump(pg);
  ok('1c an empty v1 database gets its stores (v'+d1.version+') and the note is saved', d1.version===2 && ['notes','versions','blobs'].every(s=>s in d1.stores) && d1.stores.notes.some(n=>n.blocks.some(b=>/після порожньої v1/.test(b.text))) && !(await strip(pg)));
  ok('1d no page errors', !pg.errs.length); await ctx.close(); }

/* ── 2. rollback: data from a newer app (v3 with `sync`, keep/inline history) opens view-only, nothing at all is written ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const pg=await fresh(ctx);
  await pg.goto(SITE+'blank.html');
  const T=Date.now();
  await pg.evaluate(T=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>{ const d=r.result;
      d.createObjectStore('notes',{keyPath:'id'}); const v=d.createObjectStore('versions',{keyPath:'id'}); v.createIndex('note_t',['note','t']); v.createIndex('t','t');
      d.createObjectStore('blobs',{keyPath:['note','h']}); d.createObjectStore('sync',{keyPath:'k'}); };
    r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','versions','blobs','sync'],'readwrite');
      t.objectStore('notes').put({id:'nA',title:'Нова версія',blocks:[{id:'a1',fx:0.1,row:2,text:'текст з новішого застосунку'}],created:T-5*864e5,updated:T-1000});
      t.objectStore('notes').put({id:'nOld',title:'Давно в кошику',blocks:[{id:'o1',fx:0.1,row:2,text:'кошик понад 30 днів'}],created:T-90*864e5,updated:T-40*864e5,deleted:T-40*864e5});
      t.objectStore('versions').put({id:'vK',note:'nA',t:T-2000,w:T-2000,reason:'conflict',keep:1,inline:1,title:'Нова версія',sig:'x',size:10,sum:{ch:1,add:0,del:0,mv:0,ttl:0},blocks:[{id:'a1',fx:0.1,row:2,s:'конфліктна копія'}]});
      t.objectStore('blobs').put({note:'nA',h:'h1',s:'тіло',r:0,z:8});
      t.objectStore('sync').put({k:'format',v:3}); t.objectStore('sync').put({k:'owner',env:'app',uid:'u1'});
      t.oncomplete=()=>{ d.close(); res(); }; }; }), T);
  await pg.evaluate(T=>localStorage.setItem('sheet:note:nA', JSON.stringify({id:'nA',title:'Нова версія',blocks:[{id:'a1',fx:0.1,row:2,text:'старіша резервна копія'}],created:T-5*864e5,updated:T-60000})), T);
  const before=await dump(pg);
  await pg.goto(SITE); await pg.waitForTimeout(800);
  const msg=await strip(pg);
  ok('2 newer data: the strip says this version is older than the data ('+msg+')', /старша за ваші дані/.test(msg) && /переглядати й експортувати/.test(msg));
  ok('2b the strip has «Експорт» and «Оновити», no trash buttons', await pg.locator('#roExport').isVisible() && /^Експорт$/.test((await pg.locator('#roExport').innerText()).trim()) && await pg.locator('#roReload').isVisible() && !(await pg.locator('#roRestore').isVisible()) && !(await pg.locator('#roPurge').isVisible()));
  const items=await pg.locator('#list .item').allInnerTexts();
  ok('2c the notes show, with the differing fallback copy as its own note ('+items.length+')', items.some(t=>/Нова версія/.test(t) && !/резервна/.test(t)) && items.some(t=>/Нова версія \(резервна копія\)/.test(t)));
  ok('2d the sheet is inert and the title not editable', await pg.locator('#sheet').evaluate(e=>e.inert) && (await pg.locator('#ttl').getAttribute('contenteditable'))==='false');
  await pg.keyboard.press('Control+Alt+KeyN'); await pg.locator('#newBtn').click(); await pg.waitForTimeout(200);
  ok('2e «Нова» says it is view only', /лише перегляд/.test(await pg.locator('#toast').innerText()));
  await pg.mouse.click(500,400); await pg.keyboard.type('спроба писати'); await pg.waitForTimeout(800);
  ok('2f typing changes nothing on the sheet', !/спроба писати/.test(await sheetText(pg)));
  await pg.evaluate(()=>window.dispatchEvent(new Event('online'))); await pg.waitForTimeout(400);
  const after=await dump(pg);
  ok('2g nothing written: the database (v'+after.version+') and the fallback keys are exactly as before', JSON.stringify(after)===JSON.stringify(before));
  ok('2h the note in the trash for 40 days was not purged, the fallback key was not moved', after.stores.notes.some(n=>n.id==='nOld') && 'sheet:note:nA' in after.ls);
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#roExport').click()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  const vk=data.history && data.history.versions.find(v=>v.id==='vK');
  ok('2i export from the strip: the notes, the backup copy and the raw history with keep/inline', data.notes.some(n=>n.id==='nA') && data.notes.some(n=>n.id==='nOld') && data.notes.some(n=>/резервна копія/.test(n.title) && n.blocks.some(b=>/старіша резервна копія/.test(b.text))) && vk && vk.keep===1 && vk.inline===1 && vk.blocks[0].s==='конфліктна копія' && data.history.blobs.length===1);
  ok('2j still nothing written after the export (only the export time in settings)', JSON.stringify(await dump(pg))===JSON.stringify(before));
  ok('2k no page errors', !pg.errs.length); await ctx.close(); }

/* ── 3. another tab upgrades the database: this tab writes what it has first, then stays view-only ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const a=await fresh(ctx), b=await fresh(ctx);
  await a.goto(SITE); await a.waitForTimeout(500);
  await b.goto(SITE+'blank.html');
  await typeAt(a,500,300,'до оновлення'); // no wait: the autosave (300 ms) has not run yet
  const notes=await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>r.result.createObjectStore('sync',{keyPath:'k'});
    r.onsuccess=()=>{ const d=r.result, q=d.transaction('notes','readonly').objectStore('notes').getAll(); q.onsuccess=()=>{ d.close(); res(q.result); }; }; }));
  ok('3 the text typed just before the upgrade was written before the tab let go', notes.some(n=>n.blocks.some(x=>/до оновлення/.test(x.text))));
  await a.waitForTimeout(300);
  const msg=await strip(a);
  ok('3b the tab says Baobook was updated in another tab ('+msg+')', /оновився в іншій вкладці/.test(msg) && !/не вдалося/.test(msg));
  ok('3c with nothing unsaved the button is plain «Експорт»', /^Експорт$/.test((await a.locator('#roExport').innerText()).trim()));
  const before=await dump(a);
  await a.mouse.click(500,500); await a.keyboard.type('після оновлення'); await a.waitForTimeout(800);
  ok('3d after it, typing and saving change nothing', !/після оновлення/.test(await sheetText(a)) && JSON.stringify(await dump(a))===JSON.stringify(before));
  ok('3e no page errors', !a.errs.length); await ctx.close(); }

/* ── 3f. the same, but the last edit could not be written: the strip offers to export it ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const a=await fresh(ctx), b=await fresh(ctx);
  await a.goto(SITE); await a.waitForTimeout(500); await a.evaluate(()=>{ window.sheetDebug.failSave=true; });
  await typeAt(a,500,300,'незбережений текст'); await a.waitForTimeout(600);
  await b.goto(SITE+'blank.html');
  await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',3); r.onupgradeneeded=()=>r.result.createObjectStore('sync',{keyPath:'k'}); r.onsuccess=()=>{ r.result.close(); res(); }; }));
  await a.waitForTimeout(400);
  const msg=await strip(a);
  ok('3f the strip says the last edit could not be saved ('+msg+')', /не вдалося зберегти/.test(msg));
  ok('3g the button is «Експортувати незбережене»', /Експортувати незбережене/.test(await a.locator('#roExport').innerText()));
  const [dl]=await Promise.all([a.waitForEvent('download'), a.locator('#roExport').click()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  ok('3h the export carries the unsaved text from memory', data.notes.some(n=>n.blocks.some(x=>/незбережений текст/.test(x.text))));
  ok('3i nothing went to the localStorage fallback', !Object.keys((await dump(a)).ls).length);
  ok('3j no page errors', !a.errs.length); await ctx.close(); }

/* ── 4. a blocked setup: another connection holds an empty v1, so the stores cannot be created: view-only until a reload ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const a=await fresh(ctx), b=await fresh(ctx);
  await b.goto(SITE+'blank.html');
  await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',1); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // kept open, deaf to versionchange
  await a.goto(SITE); await a.waitForTimeout(800);
  const msg=await strip(a);
  ok('4 blocked: the strip asks to close the other tabs ('+msg+')', /Закрийте інші вкладки Baobook/.test(msg));
  await a.mouse.click(500,400); await a.keyboard.type('заблоковано'); await a.waitForTimeout(600);
  ok('4b typing changes nothing and nothing goes to the fallback', !/заблоковано/.test(await sheetText(a)) && !(await a.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')).length)));
  await b.evaluate(()=>window.__hold.close()); await a.reload(); await a.waitForTimeout(600);
  await typeAt(a,500,300,'розблоковано'); await a.keyboard.press('Escape'); await a.waitForTimeout(600);
  const d=await dump(a);
  ok('4c after the other tab lets go, a reload works as usual (v'+d.version+')', !(await strip(a)) && d.version===2 && d.stores.notes.some(n=>n.blocks.some(x=>/розблоковано/.test(x.text))));
  ok('4d no page errors', !a.errs.length); await ctx.close(); }

/* ── 5. fallback copies in the usual mode: a copy that differs is kept as a note of its own, an identical one just goes ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await fresh(ctx);
  await pg.goto(SITE); await pg.waitForTimeout(500);
  const T=Date.now();
  await pg.evaluate(T=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readwrite'), s=t.objectStore('notes');
    s.put({id:'fA',title:'Перша',blocks:[{id:'a',fx:0.1,row:2,text:'основний текст А'}],created:T-9e5,updated:T-1000});
    s.put({id:'fB',title:'Друга',blocks:[{id:'b',fx:0.1,row:2,text:'однаковий текст Б'}],created:T-9e5,updated:T-1000});
    s.put({id:'fC',title:'Третя',blocks:[{id:'c',fx:0.1,row:2,text:'старий текст В'}],created:T-9e5,updated:T-5000});
    t.oncomplete=()=>{ d.close(); res(); }; }; }), T);
  await pg.evaluate(T=>{ const put=n=>localStorage.setItem('sheet:note:'+n.id, JSON.stringify(n));
    put({id:'fA',title:'Перша',blocks:[{id:'a',fx:0.1,row:2,text:'старіша резервна А'}],created:T-9e5,updated:T-1000});   // equal time, other text
    put({id:'fB',title:'Друга',blocks:[{id:'b',fx:0.1,row:2,text:'однаковий текст Б'}],created:T-9e5,updated:T-1000});   // identical
    put({id:'fC',title:'Третя',blocks:[{id:'c',fx:0.1,row:2,text:'новіший текст В'}],created:T-9e5,updated:T-100}); }, T);   // newer
  await pg.reload(); await pg.waitForTimeout(800);
  const d=await dump(pg), byText=re=>d.stores.notes.filter(n=>n.blocks.some(b=>re.test(b.text)));
  ok('5 a copy with the same time but other text: the stored note stays and the copy becomes «Перша (резервна копія)»', byText(/основний текст А/).some(n=>n.id==='fA') && byText(/старіша резервна А/).some(n=>n.id!=='fA' && n.title==='Перша (резервна копія)'));
  ok('5b an identical copy just goes, no duplicate', byText(/однаковий текст Б/).length===1);
  ok('5c a newer copy becomes the note and the older stored one is kept as «Третя (резервна копія)»', byText(/новіший текст В/).some(n=>n.id==='fC') && byText(/старий текст В/).some(n=>n.id!=='fC' && n.title==='Третя (резервна копія)'));
  ok('5d the fallback keys are gone after the move', !Object.keys(d.ls).length);
  ok('5e no strip in the usual mode', !(await strip(pg)));
  ok('5f no page errors', !pg.errs.length); await ctx.close(); }

await br.close(); await srv.close(); process.exit(fails?1:0);
