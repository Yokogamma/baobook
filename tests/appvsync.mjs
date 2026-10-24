// Named versions through the sync core in the browser (docs/SYNC-PLAN.md §4.9, PR 4a-1). «Зафіксувати версію…» on «Зараз» and
// «Перейменувати» of a shown named version go through SYNC.versionLocal: the version reaches the shared test cloud after its note, and the
// rename changes only the name there. The IndexedDB v4 barrier: a page whose code knows only v3 (the current page served with IDB_VER 3,
// to that page only: what the barrier depends on is the version an open page knows) writes a note into v3; opening the current page upgrades the database to v4, which turns the old page view-only with
// «оновився в іншій вкладці» before the new page's sender runs; an old page opened afterwards finds v4 and opens view-only too; the old
// page's text reached storage and nothing of it is lost.
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
const cloud=new TestCloud({start:Date.now()});
const vdoc=v=>cloud.doc('versions',v);
const menu=async(pg,label)=>{ await pg.click('#histMore'); await pg.locator('.amenu .mi',{hasText:label}).click(); };
const openHist=async pg=>{ await pg.click('#histBtn'); await pg.locator('#histList .hv[data-id="now"]').waitFor(); await pg.waitForTimeout(150); };
const closeHist=async pg=>{ await pg.click('#histBtn'); await pg.waitForTimeout(100); };
const state=(pg,v)=>pg.evaluate(v=>{ const r=document.querySelector('#histList .hv[data-id="'+v+'"] .hv-st'); return r? r.textContent : ''; }, v);

/* ── 1. the states, a rename from another device, «Видалити версію» on every device (4a-2) ── */
{ const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX, connect:{pace:PACE}}); const pg=A.pg;
  await typeAt(pg,500,300,'текст для версії'); const id=await curId(pg); await settle(pg);
  await pg.evaluate(()=>sheetDebug.sync.online(false));
  await openHist(pg); await menu(pg,'Зафіксувати версію…'); await pg.fill('#histName','Реліз'); await pg.keyboard.press('Enter');
  const vid=await until(()=>pg.evaluate(n=>{ const r=[...document.querySelectorAll('#histList .hv.named')][0]; return r? r.dataset.id : null; }, id), 5000);
  const st0=await until(async()=>{ const t=await state(pg,vid); return /ще не надіслано/.test(t)? t : null; }, 5000);
  ok('1 offline, the named row says «ще не надіслано» ('+st0+')', !!st0 && !vdoc(vid));
  await pg.evaluate(()=>sheetDebug.sync.online(true));
  const got=await until(async()=>{ await settle(pg,100); return vdoc(vid) || null; }, 8000);
  ok('1a online it reached the cloud after the note, named «Реліз», with the body inline', !!got && got.name==='Реліз' && got.rev===1 && JSON.stringify(got.blocks).includes('текст для версії') && !!cloud.doc('notes',id));
  const st1=await until(async()=>{ const t=await state(pg,vid); return /^у хмарі$/.test(t)? t : null; }, 5000);
  ok('1b the open «Історія» turns the row to «у хмарі» by itself ('+st1+')', !!st1);
  // B: the version arrives named, with A's device
  const rB=await until(async()=>{ await settle(B.pg,100); return B.pg.evaluate(v=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction('versions','readonly').objectStore('versions').get(v); q.onsuccess=()=>{ res(q.result||null); r.result.close(); }; }; }), vid); }, 8000);
  await openNote(B.pg,id); await openHist(B.pg);
  const stB=await until(async()=>{ const t=await state(B.pg,vid); return t || null; }, 5000);
  ok('1c B holds it named «Реліз» and says «у хмарі · Device A» ('+stB+')', !!rB && rB.name==='Реліз' && stB==='у хмарі · Device A');
  await B.pg.locator('#histList .hv[data-id="'+vid+'"]').click(); await menu(B.pg,'Перейменувати версію…'); await B.pg.fill('#histName','Реліз 2'); await B.pg.keyboard.press('Enter');
  const ren=await until(async()=>{ await settle(B.pg,100); const d=vdoc(vid); return d && d.rev===2? d : null; }, 8000);
  ok('1d the rename on B is one write that changes only the name', !!ren && ren.name==='Реліз 2' && JSON.stringify(ren.blocks)===JSON.stringify(got.blocks) && ren.t===got.t);
  const kA=await until(async()=>{ await settle(pg,100); const k=await pg.evaluate(v=>{ const r=document.querySelector('#histList .hv[data-id="'+v+'"]'); return r? r.querySelector('.hv-k').textContent+' | '+((r.querySelector('.hv-st')||{}).textContent||'') : ''; }, vid); return /Реліз 2/.test(k) && /Device B/.test(k)? k : null; }, 8000);
  ok('1e A\'s open «Історія» shows the new name from B, «у хмарі · Device B» ('+kA+')', !!kA);
  const meta=await pg.evaluate(v=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction('sync','readonly').objectStore('sync').get('meta:v:'+v); q.onsuccess=()=>{ res(q.result||null); r.result.close(); }; }; }), vid);
  ok('1f A\'s record knows its cloud state: base rev 2, no job', !!meta && meta.base && meta.base.rev===2 && meta.lrev===meta.baseLrev);
  // «Видалити версію» on A: the dialog says «на всіх пристроях», the version leaves B's open «Історія»
  await pg.locator('#histList .hv[data-id="'+vid+'"]').click(); await menu(pg,'Видалити версію');
  const ask=await until(()=>pg.evaluate(()=>document.getElementById('ask').open? document.getElementById('askTitle').textContent+' | '+document.getElementById('askText').textContent : null), 3000);
  ok('1g «Видалити версію» asks «Видалити версію «Реліз 2»?» with «на всіх пристроях» ('+ask+')', /Видалити версію «Реліз 2»\?/.test(ask||'') && /на всіх пристроях/.test(ask||''));
  await pg.click('#askYes');
  const tomb=await until(async()=>{ await settle(pg,100); const d=vdoc(vid); return d && d.deleted? d : null; }, 8000);
  const gone=await until(async()=>{ await settle(B.pg,100); return B.pg.evaluate(v=>!document.querySelector('#histList .hv[data-id="'+v+'"]'), vid); }, 8000);
  ok('1h the tombstone is in the cloud, A shows «Зараз», and the row left B\'s open «Історія»', !!tomb && gone && await pg.evaluate(()=>!document.querySelector('#histList .hv.named') && document.querySelector('#histList .hv.cur').dataset.id==='now'));
  // local-only: naming an automatic version whose body is gone, and one too large for the cloud
  await closeHist(pg); await pg.evaluate(([n,big])=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const t=r.result.transaction(['versions','blobs'],'readwrite'), V=t.objectStore('versions'), t0=Date.now()-3600000;
      V.put({id:'vPart', note:n, t:t0, w:t0, reason:'auto', title:'', sig:'p', size:1, sum:{ch:1,add:0,del:0,mv:0,ttl:0}, blocks:[{id:'b1', row:1, fx:0, h:'gone-hash'}]});
      V.put({id:'vBig', note:n, t:t0+1000, w:t0+1000, reason:'auto', title:'', sig:'q', size:big.length, sum:{ch:1,add:0,del:0,mv:0,ttl:0}, blocks:[{id:'b1', row:1, fx:0, h:'big-hash'}]});
      t.objectStore('blobs').put({note:n, h:'big-hash', s:big, r:0, z:big.length}); t.oncomplete=()=>{ r.result.close(); res(); }; }; }), [id, 'я'.repeat(600000)]);
  await openHist(pg);
  for(const [v,name] of [['vPart','Неповна'],['vBig','Велика']]){ await pg.locator('#histList .hv[data-id="'+v+'"]').click(); await menu(pg,'Назвати цю версію…'); await pg.fill('#histName',name); await pg.keyboard.press('Enter'); await until(async()=>(await state(pg,v)).startsWith('лише'), 5000); }
  await settle(pg);
  const sp=await state(pg,'vPart'), sb=await state(pg,'vBig');
  ok('1i an automatic version whose body is gone, named: «лише тут: неповна»; a too large one: «лише тут: завелика»; neither is sent ('+sp+' / '+sb+')', sp==='лише тут: неповна' && sb==='лише тут: завелика' && !vdoc('vPart') && !vdoc('vBig'));
  // «Прибрати нотатки з пристрою» counts them as kept only here
  await pg.evaluate(()=>{ sheetDebug.sync.remove(); }); const txt=await until(()=>pg.evaluate(()=>document.getElementById('choice').open? document.getElementById('choiceText').textContent : null), 3000);
  await pg.evaluate(()=>sheetDebug.sync.choose('cancel'));
  ok('1j «Прибрати нотатки з пристрою» says «Лише на цьому пристрої 2 іменовані версії.» ('+txt+')', /Лише на цьому пристрої 2 іменовані версії\./.test(txt||''));
  // a second tab of A with «Історія» open: it refreshes on `ver`; a version named there (it does not lead) reaches the cloud at once (`vput`)
  const T2=await newTab(A, SITE, {connect:{pace:PACE}}); await openNote(T2,id); await openHist(T2);
  await pg.bringToFront(); await pg.locator('#histList .hv[data-id="now"]').click(); await menu(pg,'Зафіксувати версію…'); await pg.fill('#histName','З першої'); await pg.keyboard.press('Enter');
  const inT2=await until(async()=>{ await settle(pg,100); return T2.evaluate(()=>[...document.querySelectorAll('#histList .hv.named .hv-k')].some(k=>/З першої/.test(k.textContent))); }, 8000);
  ok('1k the second tab\'s open «Історія» shows the version named in the first', inT2);
  const lead2=await T2.evaluate(()=>sheetDebug.sync.lead()); await T2.bringToFront(); await T2.locator('#histList .hv[data-id="now"]').click(); await menu(T2,'Зафіксувати версію…'); await T2.fill('#histName','З другої'); await T2.keyboard.press('Enter');
  const t0=Date.now(), sent=await until(async()=>{ await settle(pg,50); return cloud.all('versions').some(d=>d.name==='З другої'); }, 8000);
  ok('1l named in the tab that does not lead ('+JSON.stringify(lead2)+'), it reaches the cloud without waiting for the minute ('+(Date.now()-t0)+' ms)', sent && Date.now()-t0<8000);
  ok('1m no page errors', !A.errs.length && !B.errs.length); await A.close(); await B.close(); }

/* ── 2. the v4 barrier: an old page goes view-only before the new sender runs ── */
{ const CUR=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8'), OLD=CUR.replace('const IDB_VER=4,','const IDB_VER=3,');
  ok('2 the current code knows IndexedDB version 4; the old page is served with 3', CUR.includes('const IDB_VER=4,') && OLD!==CUR);
  const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, serviceWorkers:'block'});
  const oldPage=async()=>{ const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
    await p.route(u=>{ const x=new URL(u); return x.pathname==='/' || x.pathname==='/index.html'; }, r=>r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:OLD}));
    return p; };
  const ready=async p=>{ await p.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await p.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout:10000}); };
  const strip=p=>p.locator('#roStrip .rostrip').isVisible().then(v=>v? p.locator('#roMsg').innerText() : '');
  const ver=p=>p.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const v=r.result.version; r.result.close(); res(v); }; }));
  const O=await oldPage(); await O.goto(SITE); await ready(O);
  ok('2a the old page opened the database as v3', (await ver(O))===3);
  await typeAt(O,500,300,'стара вкладка'); await O.waitForTimeout(700);
  const N=await ctx.newPage(); N.errs=[]; N.on('pageerror',e=>N.errs.push(e.message)); await N.goto(SITE); await ready(N);
  const msg=await until(async()=>(await strip(O))||null, 5000);
  ok('2b opening the current page upgraded the database to v4 ('+(await ver(N))+')', (await ver(N))===4);
  ok('2c the old page turned view-only: «оновився в іншій вкладці» ('+msg+')', /оновився в іншій вкладці/.test(msg||''));
  ok('2d the old page\'s text is in the new page', (await N.evaluate(()=>JSON.stringify(sheetDebug.notes? sheetDebug.notes() : [...document.querySelectorAll('#list .item')].map(x=>x.textContent)))).includes('стара вкладка'));
  const O2=await oldPage(); await O2.goto(SITE); await O2.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  const msg2=await until(async()=>(await strip(O2))||null, 5000);
  ok('2e an old page opened afterwards finds v4 and opens view-only ('+msg2+')', /старша за ваші дані/.test(msg2||''));
  await typeAt(N,500,420,'нова вкладка пише'); await N.waitForTimeout(700);
  ok('2f the current page writes as usual, no strip', !(await strip(N)) && (await N.evaluate(()=>JSON.stringify([...document.querySelectorAll('#list .item')].map(x=>x.textContent)))).length>0);
  ok('2g no page errors on the new page', !N.errs.length); await ctx.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
