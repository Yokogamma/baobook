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
import { newDevice, settle, typeAt, curId } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const cloud=new TestCloud({start:Date.now()});

/* ── 1. naming «Зараз» and renaming a shown named version reach the cloud ── */
{ const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}}); const pg=A.pg;
  const menu=async label=>{ await pg.click('#histMore'); await pg.locator('.amenu .mi',{hasText:label}).click(); };
  await typeAt(pg,500,300,'текст для версії'); const id=await curId(pg); await settle(pg);
  await pg.click('#histBtn'); await pg.locator('#histList .hv[data-id="now"]').waitFor();
  await menu('Зафіксувати версію…'); await pg.fill('#histName','Реліз'); await pg.keyboard.press('Enter');
  const got=await until(async()=>{ await settle(pg,100); return cloud.all('versions').find(d=>d.note===id) || null; }, 8000);
  ok('1 «Зафіксувати версію…» reached the cloud after the note, named «Реліз», with the body inline', !!got && got.name==='Реліз' && got.rev===1 && JSON.stringify(got.blocks).includes('текст для версії') && !!cloud.doc('notes',id));
  const vid=got && got.id; await pg.locator('#histList .hv[data-id="'+vid+'"]').click(); await menu('Назвати цю версію…'); await pg.fill('#histName','Реліз 2'); await pg.keyboard.press('Enter');
  const ren=await until(async()=>{ await settle(pg,100); const d=cloud.doc('versions',vid); return d && d.rev===2? d : null; }, 8000);
  ok('1a the rename of the shown named version is one write that changes only the name', !!ren && ren.name==='Реліз 2' && JSON.stringify(ren.blocks)===JSON.stringify(got.blocks) && ren.t===got.t);
  const meta=await pg.evaluate(v=>sheetDebug.sync.core && new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction('sync','readonly').objectStore('sync').get('meta:v:'+v); q.onsuccess=()=>{ res(q.result||null); r.result.close(); }; }; }), vid);
  ok('1b the local record knows its cloud state: base rev 2, no job', !!meta && meta.base && meta.base.rev===2 && meta.lrev===meta.baseLrev);
  ok('1c no page errors', !A.errs.length); await A.close(); }

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
