// Import used for moving notes between sites: counts only real writes, re-reads storage, applies settings into an empty app only.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=path.join(os.tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const PAGE=SITE;
const idbNotes=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const wipe=async pg=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };
const importFile=async (pg,name,data)=>{ const f=path.join(OUT,name); fs.writeFileSync(f,JSON.stringify(data)); await pg.locator('#importFile').setInputFiles(f); await pg.waitForTimeout(700); return (await pg.locator('#toast').innerText()).trim(); };
const byId=(list,ids)=>ids.map(id=>list.find(n=>n.id===id));
// silent bad write: IndexedDB reports success but stores a different version (ids starting with "ghost")
const ghostPut=()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v,...a){ if(v && typeof v.id==='string' && v.id.startsWith('ghost') && v.blocks) v={...v,updated:1}; return put.call(this,v,...a); }; };

// an old-format backup from «Чистий аркуш» with every block kind, positions, formatting and settings
const FIX=[
  {id:'mv1',title:'Переїзд',created:1700000000000,updated:1759900000000,blocks:[
    {id:'t1',row:2,text:'звичайний текст',fx:0.1},
    {id:'t2',row:4,text:'жирний і код',fx:0.1,cw:12,html:'<b>жирний</b> і <code>код</code>'},
    {id:'c1',row:7,text:'const a = 1;\nconsole.log(a);',fx:0.1,kind:'code',lang:'js',wrap:true,num:false,title:'приклад'},
    {id:'a1',row:12,text:'',fx:0.1,kind:'area',cw:20,title:'Область',color:'blue'},
    {id:'k1',row:1,text:'всередині області',parent:'a1',col:1}]},
  {id:'mv2',title:'',created:1700000000001,updated:1759900000001,blocks:[{id:'u1',row:3,text:'друга нотатка',fx:0.4}]}];
const MOVE={app:'sheet',format:1,exported:'2026-10-08T10:00:00.000Z',settings:{theme:'dark',grid:false,spell:true},notes:FIX};

let exported=null;
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900},acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.addInitScript(ghostPut);
  await pg.goto(PAGE); await wipe(pg);

  let t=await importFile(pg,'move.json',MOVE);
  ok('1 import into an empty app: 2 new, nothing failed, settings taken from the file ('+t+')', /Імпортовано: 2 нові, 0 оновлено, 0 без змін; налаштування — з файлу/.test(t) && !/не збережено/.test(t));
  const set=await pg.evaluate(()=>({theme:document.documentElement.dataset.theme, nogrid:document.getElementById('sheet').classList.contains('nogrid'), saved:JSON.parse(localStorage.getItem('sheet:settings')||'{}')}));
  ok('1b theme, grid and spelling applied and saved', set.theme==='dark' && set.nogrid && set.saved.theme==='dark' && set.saved.grid===false && set.saved.spell===true);

  await pg.reload(); await pg.waitForTimeout(600);
  const got=byId(await idbNotes(pg),['mv1','mv2']);
  ok('2 after reload the stored notes equal the file: ids, titles, block positions, kinds, formatting, times', isDeepStrictEqual(got,FIX));
  ok('2b both notes are in the list', (await pg.locator('#list .item').filter({hasText:'Переїзд'}).count())===1 && (await pg.locator('#list .item').filter({hasText:'друга нотатка'}).count())===1);

  const before=(await idbNotes(pg)).length;
  t=await importFile(pg,'move-again.json',MOVE);
  ok('3 importing the same file again: 0 new, 2 unchanged, no duplicates ('+t+')', /Імпортовано: 0 нових, 0 оновлено, 2 без змін$/.test(t) && (await idbNotes(pg)).length===before);

  t=await importFile(pg,'sand.json',{app:'baobook',format:1,settings:{theme:'sand',grid:true},notes:[{id:'mv3',title:'Ще одна',blocks:[{id:'s1',row:2,text:'третя',fx:0.2}],created:1,updated:1759900000002}]});
  ok('4 into an app that already has notes the file settings are ignored ('+t+')', /Імпортовано: 1 нова/.test(t) && !/налаштування/.test(t) && await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark');

  await pg.evaluate(()=>{ window.sheetDebug.failSave=true; });
  t=await importFile(pg,'fail.json',{app:'baobook',format:1,notes:[{id:'mv9',title:'При відмові',blocks:[{id:'f1',row:2,text:'не записалась',fx:0.2}],created:1,updated:1759900000009}]});
  ok('5 storage refuses the write: reported as not saved, not as new; warning shown ('+t+')', /Імпортовано: 0 нових.*не збережено: 1/.test(t) && await pg.locator('#saveWarn').isVisible() && !(await idbNotes(pg)).some(n=>n.id==='mv9'));
  await pg.evaluate(()=>{ window.sheetDebug.failSave=false; }); await pg.locator('#saveRetry').click(); await pg.waitForTimeout(700);
  ok('5b «Повторити» writes it after the storage recovers', (await idbNotes(pg)).some(n=>n.id==='mv9') && !(await pg.locator('#saveWarn').isVisible()));

  t=await importFile(pg,'ghost.json',{app:'baobook',format:1,notes:[{id:'ghost1',title:'Привид',blocks:[{id:'g1',row:2,text:'запис без підтвердження',fx:0.2}],created:1,updated:1759900000010}]});
  ok('6 a write that reports success but is not in storage is caught by the read-back ('+t+')', /Імпортовано: 0 нових.*не збережено: 1/.test(t) && await pg.locator('#saveWarn').isVisible() && /запис не підтвердився/.test(await pg.locator('#saveErrMsg').innerText()));

  await pg.locator('#setBtn').click(); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#exportBtn').click()]); exported=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
  ok('7 export: baobook file with the moved notes and settings', exported.app==='baobook' && isDeepStrictEqual(byId(exported.notes,['mv1','mv2']),FIX) && exported.settings.theme==='dark');
  console.log(errs.length? errs.join('\n') : '✓ no page errors (first site)'); if(errs.length) fails++; await ctx.close(); }

// another site: a fresh context has its own storage, as a new origin would
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(PAGE); await wipe(pg);
  const t=await importFile(pg,'export.json',exported);
  await pg.reload(); await pg.waitForTimeout(600);
  ok('8 the export imports on another site: same notes after reload, settings carried over ('+t+')', isDeepStrictEqual(byId(await idbNotes(pg),['mv1','mv2','mv3','mv9']),byId(exported.notes,['mv1','mv2','mv3','mv9'])) && await pg.evaluate(()=>document.documentElement.dataset.theme)==='dark');
  console.log(errs.length? errs.join('\n') : '✓ no page errors (second site)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
