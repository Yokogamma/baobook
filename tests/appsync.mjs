// Sync core in the browser, part 1: storage and local writes (docs/SYNC-PLAN.md §4.3–4.4, PR 1). A v2 database from PR 0 opens as v3 with
// the `sync` store and keeps its data; with an owner every edit queues a job and without one nothing is queued; lrev grows with every
// write; the trash and restore are deltas over whatever the record holds; an edit typed while another device's change arrives keeps
// both (the editor snapshot E and merge3); an import keeps the file's `updated`; a time ahead of this device's clock shows as the
// arrival time; a note over the size limit is marked and the rest go on; cleanRich is idempotent; a far-future `updated` does not thin the history.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, connect, settle, stored, syncRecs, typeAt, openNote, curId, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url; srv.override.set('/blank.html','<!doctype html><meta charset="utf-8"><title>blank</title>');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const T0=Date.now();

/* ── 1. v2 → v3: a PR 0 database with notes and versions opens as v3 with the sync store, format 3, data intact ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(SITE+'blank.html');
  await pg.evaluate(T=>new Promise(res=>{ const r=indexedDB.open('sheet',2); r.onupgradeneeded=()=>{ const d=r.result; d.createObjectStore('notes',{keyPath:'id'}); const v=d.createObjectStore('versions',{keyPath:'id'}); v.createIndex('note_t',['note','t']); v.createIndex('t','t'); d.createObjectStore('blobs',{keyPath:['note','h']}); };
    r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','versions','blobs'],'readwrite'); t.objectStore('notes').put({id:'old1',title:'Стара',blocks:[{id:'b1',fx:0.1,row:2,text:'з версії 2'}],created:T-5*864e5,updated:T-1000});
      t.objectStore('versions').put({id:'v1',note:'old1',t:T-2000,w:T-2000,reason:'auto',title:'Стара',sig:'s',size:10,sum:{ch:0,add:1,del:0,mv:0,ttl:0},blocks:[{id:'b1',fx:0.1,row:2,h:'h1'}]}); t.objectStore('blobs').put({note:'old1',h:'h1',s:'з версії 2',r:0,z:10}); t.oncomplete=()=>{ d.close(); res(); }; }; }), T0);
  await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached'}); await pg.waitForTimeout(400);
  const ver=await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const o={version:d.version, stores:[...d.objectStoreNames]}; d.close(); res(o); }; }));
  const sync=await stored(pg,'sync'), notes=await stored(pg,'notes'), vers=await stored(pg,'versions');
  ok('1 v2 → v3: version '+ver.version+', stores '+ver.stores.join(',')+', format 3, the device record', ver.version===3 && ver.stores.includes('sync') && sync.some(r=>r.k==='format' && r.v===3) && sync.some(r=>r.k==='device' && r.id && r.name));
  ok('1b the notes and versions of v2 are intact and the note shows', notes.some(n=>n.id==='old1' && n.blocks[0].text==='з версії 2') && vers.some(v=>v.id==='v1') && (await pg.locator('#list .item').allInnerTexts()).some(t=>/Стара/.test(t)));
  ok('1c no owner: no jobs, no listener, status none', !(await syncRecs(pg,'out:')).length && (await pg.evaluate(()=>sheetDebug.sync.status.code))==='none');
  // an edit without an owner: lrev grows, no job
  await openNote(pg,'old1'); const t1=pg.locator('#sheet .blk .txt').first(); await t1.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' і правка'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const l1=await pg.evaluate(()=>sheetDebug.sync.lrev());
  ok('1d an edit without an owner: lrev 1 in meta, still no job', l1.old1===1 && !(await syncRecs(pg,'out:')).length);
  // an owner without a cloud: the queue grows with every edit, nothing is sent
  await connect(pg,{devId:'solo'}); await pg.evaluate(()=>{ sheetDebug.sync.engine().setCloud(null); });
  await t1.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' ще'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  const jobs=await syncRecs(pg,'out:n:'), l2=await pg.evaluate(()=>sheetDebug.sync.lrev());
  ok('1e an owner without a cloud: the note is queued as a local change over no base (lrev 1 with the new owner) and grew with the edit ('+l2.old1+'), owner and epoch stored', jobs.length===1 && jobs[0].k==='out:n:old1' && l2.old1===2 && (await syncRecs(pg,'owner')).length===1 && (await syncRecs(pg,'epoch')).length===1);   // lrev 1 at the binding: a document of the same id in the new owner's cloud is merged with the note, not put over it
  ok('1f no page errors', !errs.length); await ctx.close(); }

/* ── 2. two devices: the editor snapshot keeps an edit typed while another device's change arrives; field deltas; incoming records ── */
{ const cloud=new TestCloud({start:Date.now()}); const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX});
  await typeAt(A.pg,500,300,'перший блок'); await typeAt(A.pg,500,420,'другий блок'); const id=await curId(A.pg); await settle(A.pg);
  await settle(B.pg,600); await settle(B.pg); ok('2 A\'s note reached B through the cloud ('+id+', rev '+cloud.doc('notes',id).rev+')', !!(await stored(B.pg,'notes',id)) && cloud.doc('notes',id).rev>=1);
  // B changes the second block; while that change travels, A is typing into the first block
  await openNote(B.pg,id); const b2=B.pg.locator('#sheet .blk .txt').filter({hasText:'другий'}); await b2.click(); await B.pg.keyboard.press('End'); await B.pg.keyboard.type(' (B)'); await B.pg.keyboard.press('Escape'); await B.pg.waitForTimeout(600); await settle(B.pg);
  await A.pg.bringToFront(); const a1=A.pg.locator('#sheet .blk .txt').filter({hasText:'перший'}); await a1.click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' (A)');   // dirty, the autosave is 300 ms away
  await settle(A.pg,50); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(900); await settle(A.pg); await settle(A.pg,300);
  const an=await stored(A.pg,'notes',id), aText=await A.pg.locator('#sheet').innerText();
  ok('2b both edits are in A\'s record: «'+an.blocks.map(b=>b.text).join(' | ')+'»', an.blocks.some(b=>b.text==='перший блок (A)') && an.blocks.some(b=>b.text==='другий блок (B)'));
  ok('2c and on A\'s sheet after the safe point', /перший блок \(A\)/.test(aText) && /другий блок \(B\)/.test(aText));
  await settle(B.pg,600); await settle(B.pg); const bn=await stored(B.pg,'notes',id);
  ok('2d B converges to the same text', bn.blocks.some(b=>b.text==='перший блок (A)') && bn.blocks.some(b=>b.text==='другий блок (B)') && (await A.pg.evaluate(()=>sheetDebug.sync.status.code))==='synced');
  const av=(await stored(A.pg,'versions')).filter(v=>v.note===id);
  ok('2e the state before the incoming change is in A\'s history as «incoming» ('+av.map(v=>v.reason).join(',')+')', av.some(v=>v.reason==='incoming'));
  // a field delta: another device edits the text, then A trashes the note from the list; the stored record has both
  cloudWrite(cloud, id, {...cloud.doc('notes',id), blocks:cloud.doc('notes',id).blocks.map(b=>b.text.startsWith('перший')? {...b, text:'перший блок (A, phone)'} : b)}, {dev:'phone'});
  await A.pg.evaluate(()=>{ sheetDebug.sync.online(false); });   // the delivery waits: A trashes while behind
  await A.pg.locator('#list .item[data-id="'+id+'"] .it-x').click(); await A.pg.waitForTimeout(500);
  await A.pg.evaluate(()=>{ sheetDebug.sync.online(true); }); await settle(A.pg,700); await settle(A.pg); await settle(A.pg,300);
  const tn=await stored(A.pg,'notes',id);
  ok('2f the trash delta over the record that arrived meanwhile: deleted set and the phone\'s text kept', !!tn.deleted && tn.blocks.some(b=>b.text==='перший блок (A, phone)'));
  ok('2g lrev grew with every change ('+(await A.pg.evaluate(()=>sheetDebug.sync.lrev()))[id]+')', (await A.pg.evaluate(()=>sheetDebug.sync.lrev()))[id]>=4);
  // the safe point waits for the caret: a change from another device must not redraw the sheet under the typing hand
  await typeAt(A.pg,500,560,'безпечна точка'); const id2=await curId(A.pg); await settle(A.pg,300); await settle(A.pg,300);
  const f=A.pg.locator('#sheet .blk .txt').filter({hasText:'безпечна точка'}); await f.click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' (A2)'); await A.pg.waitForTimeout(900); await settle(A.pg,0);   // the autosave is done and sent; the caret stays in the block
  cloudWrite(cloud, id2, {...cloud.doc('notes',id2), title:'Назва з телефону'}, {dev:'phone'}); await settle(A.pg,400); await settle(A.pg,0);
  const focus1=await A.pg.evaluate(()=>!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sheet .blk .txt'))), pend1=await A.pg.evaluate(id=>sheetDebug.sync.pending().includes(id), id2), ttl1=await A.pg.locator('#ttl').innerText();
  await A.pg.keyboard.type(' далі'); await A.pg.waitForTimeout(700); await settle(A.pg,300); const n2=await stored(A.pg,'notes',id2);
  ok('2i an incoming title change while the caret is in a block: no redraw yet (the focus kept, the note pending, the old title shown), the text typed after it is stored together with the new title', focus1 && pend1 && ttl1!=='Назва з телефону' && n2.title==='Назва з телефону' && n2.blocks.some(b=>b.text==='безпечна точка (A2) далі'));
  await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(400);
  ok('2j the caret left: the sheet shows the phone\'s title and the typed text, nothing pending', (await A.pg.locator('#ttl').innerText())==='Назва з телефону' && /безпечна точка \(A2\) далі/.test(await A.pg.locator('#sheet').innerText()) && !(await A.pg.evaluate(id=>sheetDebug.sync.pending().includes(id), id2)));
  // a write that misses IndexedDB lands in localStorage; at the next start it moves in through the sync core: lrev, the queue, the cloud
  await A.pg.evaluate(()=>{ sheetDebug.saveGate=()=>Promise.reject(new DOMException('full','QuotaExceededError')); });
  await f.click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' FALLBACK'); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(700);
  const fbKeys=await A.pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:'))), l3=(await A.pg.evaluate(()=>sheetDebug.sync.lrev()))[id2], rev3=cloud.doc('notes',id2).rev;
  ok('2k the write missed IndexedDB and went to localStorage ('+fbKeys.length+' key); the cloud is untouched', fbKeys.length===1 && !JSON.stringify(cloud.doc('notes',id2)).includes('FALLBACK'));
  await A.pg.evaluate(()=>{ sheetDebug.saveGate=null; }); await A.pg.reload(); await A.pg.waitForSelector('html[data-ready]',{state:'attached'}); await A.pg.waitForTimeout(800);
  const after=await stored(A.pg,'notes',id2), l4=(await A.pg.evaluate(()=>sheetDebug.sync.lrev()))[id2], job2=(await syncRecs(A.pg,'out:n:')).find(r=>r.k==='out:n:'+id2), keysAfter=await A.pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')));
  ok('2l at the next start the copy moved in through the core: the record has the text, lrev grew ('+l3+' → '+l4+'), a job waits, the key is gone', !!after && after.blocks.some(b=>/FALLBACK$/.test(b.text)) && l4>l3 && !!job2 && !keysAfter.length);
  await connect(A.pg,{devId:'A'}); await settle(A.pg,400); await settle(A.pg,300);
  ok('2m connected again, the edit reached the cloud (rev '+rev3+' → '+cloud.doc('notes',id2).rev+'), the queue is empty', JSON.stringify(cloud.doc('notes',id2)).includes('FALLBACK') && cloud.doc('notes',id2).rev===rev3+1 && !(await syncRecs(A.pg,'out:n:')).length);
  ok('2h no page errors', !A.errs.length && !B.errs.length); await A.close(); await B.close(); }

/* ── 3. import keeps the file's updated; a future updated shows as the arrival time; the size limit; cleanRich idempotent ── */
{ const cloud=new TestCloud({start:Date.now()}); const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX});
  const fileT=Date.now()-3*864e5; await A.pg.setInputFiles('#importFile',{name:'i.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:[{id:'imp1',title:'З файлу',blocks:[{id:'x',row:2,fx:0.1,text:'імпорт'}],created:fileT-1000,updated:fileT}]}))}); await A.pg.waitForTimeout(700);
  const imp=await stored(A.pg,'notes','imp1'); ok('3 an import keeps the file\'s updated ('+imp.updated+' = '+fileT+') and the clock record did not move to it', imp.updated===fileT && !(await syncRecs(A.pg,'clock')).some(c=>c.last===fileT));
  await settle(A.pg); ok('3b the imported note was sent (a job with an owner)', cloud.doc('notes','imp1') && cloud.doc('notes','imp1').rev===1);
  // a document from another device with updated a year ahead: the list shows the arrival time, the record keeps the future time
  const future=Date.now()+365*864e5; cloudWrite(cloud, 'fut1', {title:'З майбутнього', blocks:[{id:'f',row:2,fx:0.1,text:'з майбутнього'}], created:future-10, updated:future});
  await settle(A.pg,600); await settle(A.pg); const fut=await stored(A.pg,'notes','fut1'), shown=await A.pg.locator('#list .item[data-id="fut1"] .it-d').innerText();
  ok('3c the record keeps updated a year ahead, the list shows the arrival time («'+shown+'»)', fut && fut.updated===future && /^\d{1,2}:\d{2}$/.test(shown.trim()));
  await openNote(A.pg,'fut1'); const nv=(await stored(A.pg,'versions')).filter(v=>v.note==='fut1').length; await A.pg.evaluate(()=>sheetDebug.vers.thin('fut1')); const nv2=(await stored(A.pg,'versions')).filter(v=>v.note==='fut1').length;
  ok('3d a far-future updated does not make vthin drop the history ('+nv+' → '+nv2+')', nv2===nv);
  // the size limit: a note over 960 KiB is marked, the next note goes
  await A.pg.evaluate(()=>sheetDebug.sync.engine().writeLocal('big1',(C,m,t)=>({title:'Велика',blocks:[{id:'g',row:1,fx:0,text:'я'.repeat(500*1024)}],created:t,updated:t})));
  await A.pg.evaluate(()=>sheetDebug.sync.engine().writeLocal('small1',(C,m,t)=>({title:'Мала',blocks:[{id:'s',row:1,fx:0,text:'мала'}],created:t,updated:t})));
  await A.pg.evaluate(()=>sheetDebug.sync.wake()); await settle(A.pg); await settle(A.pg,300);
  const bigState=await A.pg.evaluate(()=>sheetDebug.sync.state('big1'));
  ok('3e the big note is marked «size» and stays queued, the small one is in the cloud', bigState.meta && bigState.meta.err==='size' && !!bigState.job && !cloud.doc('notes','big1') && !!cloud.doc('notes','small1'));
  ok('3f cleanRich is idempotent on a rich sample', await A.pg.evaluate(()=>{ const h='<b>жирний</b> і <code>код</code><br>рядок <i>курсив</i>'; const c=sheetDebug.rich.cleanRich(h); return sheetDebug.rich.cleanRich(c)===c; }));
  ok('3g no page errors', !A.errs.length); await A.close(); }

await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
