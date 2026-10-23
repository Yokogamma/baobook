// Subresource Integrity: the page carries the hashes of its own files (tests/hashes.mjs), so a file of another build is refused. The server
// keeps only the current files, so a deploy that lands between a fresh page and its scripts answers `sync.js?b=B` with the bytes of C: the
// browser refuses them, the page reloads once and comes back as one whole build; when the reload does not help, the update strip says the
// app did not load completely, and the page never runs a script of another build. The one reload carries ?torn=1 in its address, so pages of
// two builds in turn, or storage lost on every load, never loop. A language file of another build is refused the same way; refused again
// after the reload, the other language of the same build stands in, and a file that failed its check is never used.
// The service worker checks its set against the hashes of the page it installs: page B, scripts C and a stale build.json B are not installed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { until } from './lib/wait.mjs';
import { sri, withHashes } from './hashes.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

const PUB=new URL('../public/', import.meta.url), rd=f=>fs.readFileSync(new URL(f, PUB),'utf8');
const HTML=rd('index.html'), SW=rd('sw.js'), SYNC=rd('sync.js'), UK=rd('locales/uk.json'), EN=rd('locales/en.json'), BUILD=+/const BUILD=(\d+)/.exec(HTML)[1];
// the sync.js of deploy v notes in the tab's sessionStorage which page ran it: "BC" would be the page B running the sync.js of C
const sync=v=>SYNC+'\n;try{ sessionStorage.setItem("t-ran", (sessionStorage.getItem("t-ran")||"")+((document.querySelector(\'meta[name="t-ver"]\')||{}).content||"?")+'+JSON.stringify(v)+'+" "); }catch(_){}';
const page=(v,b)=>withHashes(HTML.replaceAll(String(BUILD), String(b)), {'sync.js':sri(sync(v))}).replace('<title>','<meta name="t-ver" content="'+v+'"><title>');
const site=await serve(); site.redirect.set('/index.html','/');
const deploy=(v,b)=>{ site.override.set('/index.html', page(v,b)); site.override.set('/sync.js', sync(v)); site.override.set('/sw.js', SW.replaceAll(String(BUILD), String(b))); site.override.set('/build.json', JSON.stringify({build:b})); };
const hits=p=>site.hits.get(p)||0;
// the page may be reloading under a check (the recovery reload): a destroyed context reads as nothing yet
const ev=(pg,f,a)=>pg.evaluate(f,a).catch(e=>{ if(/context was destroyed|navigation/i.test(e.message)) return null; throw e; });
const tver=pg=>ev(pg,()=>(document.querySelector('meta[name="t-ver"]')||{}).content||null);
const ran=async pg=>await ev(pg,()=>sessionStorage.getItem('t-ran')||'')||'';
const strip=async pg=>await ev(pg,()=>{ const s=document.getElementById('updStrip'); return s && !s.hidden? document.getElementById('updMsg').textContent : ''; })||'';
const torn=pg=>new URL(pg.url()).searchParams.has('torn');   // the mark of the one recovery reload
const setOf=(pg,b)=>pg.evaluate(async k=>{ if(!(await caches.keys()).includes(k)) return null; const c=await caches.open(k), p=await c.match('/'), s=(await c.keys()).find(q=>/\/sync\.js\?b=/.test(q.url));
  const pv=p && (/name="t-ver" content="(\w)"/.exec(await p.text())||[])[1], sv=s && (/\+"(\w)"\+" "\); \}catch/.exec(await (await c.match(s)).text())||[])[1]; return pv && sv? pv+sv : null; }, 'baobook-shell-'+b);
const errs=[]; const watch=pg=>{ pg.loads=0; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('request',r=>{ if(r.isNavigationRequest() && r.frame()===pg.mainFrame()) pg.loads++; }); return pg; };   // loads: the page's own navigations (the worker fetches the page too)

// 1. installed with A; B is deployed, and C lands while the fresh page B waits for its scripts: B never runs the sync.js of C
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}});
const aside=async f=>{ const p=await ctx.newPage(); await p.goto(site.url+'manifest.webmanifest'); try{ return await f(p); } finally{ await p.close(); } };   // a page of the origin that is not the app
deploy('A', BUILD-3);
{ const pg=watch(await ctx.newPage()); await pg.goto(site.url); await pg.waitForSelector('#sheet'); await pg.evaluate(()=>navigator.serviceWorker.ready);
  ok('1a the set of A is installed ('+await until(()=>setOf(pg, BUILD-3), 10000)+')', await setOf(pg, BUILD-3)==='AA'); await pg.close(); }
deploy('B', BUILD-2); site.delay.set('/sync.js', 1500);
{ const pg=watch(await ctx.newPage()); const h0=hits('/index.html');
  const nav=pg.goto(site.url, {waitUntil:'commit'});
  await until(()=>hits('/index.html')>h0, 10000); deploy('C', BUILD-1);   // the page B is on its way; its sync.js is still held, and C lands
  await nav; await pg.waitForSelector('#sheet', {timeout:30000}); await pg.waitForTimeout(300);   // the server picks a body when it answers, so the held sync.js is of C
  site.delay.clear();
  const r=await ran(pg);
  ok('1b the page B refused the sync.js of C and reloaded once ('+pg.loads+' loads): the app runs as C ('+await tver(pg)+'), pages and scripts that ran: «'+r.trim()+'»', await tver(pg)==='C' && r.trim()==='CC' && pg.loads===2);
  ok('1c no strip, and the mark is out of the address after the good start ('+pg.url()+')', await strip(pg)==='' && !torn(pg));
  const sc=await until(()=>setOf(pg, BUILD-1), 30000);   // the barrier for step 4: the worker of C installs its set while the app is open
  ok('1d the worker of C installed the whole set of C ('+sc+')', sc==='CC'); await pg.close(); }

// 2. a first visit where the server keeps answering the page B with the sync.js of C (a CDN out of step): one reload, then the strip
const site2=await serve();
{ const c2=await br.newContext({...CTX}); const pg=watch(await c2.newPage());
  site2.override.set('/index.html', page('B', BUILD)); site2.override.set('/sync.js', sync('C'));
  await pg.goto(site2.url); const s=await until(async()=>{ const s=await strip(pg); return s || null; }, 10000); await pg.waitForTimeout(1500);
  const n=pg.loads;
  ok('2a the page B never runs the sync.js of C ('+JSON.stringify(await ran(pg))+'); after one reload ('+n+' loads) the strip says «'+s+'»', await ran(pg)==='' && n===2 && s==='Застосунок завантажився не повністю');
  ok('2b the app does not start half-way: no ready mark, the sheet is hidden', await pg.evaluate(()=>!document.documentElement.hasAttribute('data-ready')) && !(await pg.locator('#sheet').isVisible()));
  await Promise.all([pg.waitForEvent('load'), pg.click('#updGo')]); await pg.waitForTimeout(800);
  ok('2c «Оновити» reloads; still the same mismatch: the strip again, no loop ('+pg.loads+' loads)', pg.loads===3 && /не повністю/.test(await strip(pg)));
  site2.override.set('/sync.js', sync('B'));   // the server is whole again
  await Promise.all([pg.waitForEvent('load'), pg.click('#updGo')]); await pg.waitForSelector('#sheet');
  ok('2d the next «Оновити» starts the app as B with its own sync.js ('+(await ran(pg)).trim()+'); the mark is out of the address', (await ran(pg)).trim()==='BB' && !torn(pg));
  await c2.close(); }
// pages of two builds in turn (B, C, B, …), the sync.js of neither, and storage wiped on every load: still one reload, then the strip
{ const c2=await br.newContext({...CTX}); await c2.addInitScript(()=>{ try{ sessionStorage.clear(); }catch(_){} }); const pg=watch(await c2.newPage()); let n=0;
  await pg.route(u=>u.pathname==='/', r=>r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:page(n++%2? 'C' : 'B', BUILD+(n%2))}));
  site2.override.set('/sync.js', sync('X'));
  await pg.goto(site2.url); const s=await until(async()=>await strip(pg) || null, 10000); await pg.waitForTimeout(2500);
  ok('2e two builds in turn, storage wiped: '+pg.loads+' loads (one reload), then «'+s+'», no loop', pg.loads===2 && /не повністю/.test(s||''));
  await c2.close(); }

// 3. a language file of another build is refused like a script. A deploy race: the first answer is of another build, the reload gets the
//    right one and its text, never the other. A server out of step for good: after the one reload the other language of the same build
//    stands in (checked the same way); with both refused, bare keys. A file that failed its check is never used: its markup could run
const FOREIGN=UK.replace(/"notes\.new": "[^"]*"/, '"notes.new": "Чужа збірка"'), EN_NEW=JSON.parse(EN)['notes.new'];
site2.override.set('/index.html', page('B', BUILD)); site2.override.set('/sync.js', sync('B'));
{ const c3=await br.newContext({...CTX}); const pg=watch(await c3.newPage()); let first=true;
  await pg.route(u=>u.pathname==='/locales/uk.json', r=>{ if(!first) return r.continue(); first=false; r.fulfill({status:200, contentType:'application/json', body:FOREIGN}); });   // only the first answer is of another build
  await pg.goto(site2.url); await pg.waitForSelector('#sheet'); await pg.waitForTimeout(500);
  const t=(await pg.locator('#newBtn').textContent()).trim();
  ok('3 a uk.json of another build is refused: one reload ('+pg.loads+' loads) brings the right one («'+t+'»), the mark is out of the address', t==='Нова' && pg.loads===2 && !torn(pg));
  await c3.close(); }
{ const c3=await br.newContext({...CTX}); const pg=watch(await c3.newPage()); site2.override.set('/locales/uk.json', FOREIGN);
  await pg.goto(site2.url); await pg.waitForSelector('#sheet'); await pg.waitForTimeout(500);
  const t=(await pg.locator('#newBtn').textContent()).trim(), lang=await ev(pg,()=>document.documentElement.lang);
  ok('3b refused again after the reload ('+pg.loads+' loads): English of the same build stands in («'+t+'», '+lang+'), the app starts, no strip', t===EN_NEW && lang==='en' && pg.loads===2 && await strip(pg)==='' && !torn(pg));
  await c3.close(); }
{ const c3=await br.newContext({...CTX}); const pg=watch(await c3.newPage()); site2.override.set('/locales/uk.json', 'null');
  site2.override.set('/locales/en.json', EN.replace(/"notes\.new": "[^"]*"/, '"notes.new": "<img src=x onerror=window.__ran=1>"'));
  await pg.goto(site2.url); await pg.waitForSelector('#sheet'); await pg.waitForTimeout(500);
  const t=(await pg.locator('#newBtn').textContent()).trim(), st=await ev(pg,()=>({ready:document.documentElement.hasAttribute('data-ready'), ran:!!window.__ran}));
  ok('3c both languages refused ('+pg.loads+' loads): bare keys («'+t+'»), the app starts ('+JSON.stringify(st)+'), nothing of the refused files runs', t==='notes.new' && pg.loads===2 && st.ready && !st.ran);
  site2.override.delete('/locales/uk.json'); site2.override.delete('/locales/en.json'); await c3.close(); }
await site2.close();

// 4. an install that receives files out of step: the page D and build.json D, but the sync.js of E. The worker of D refuses the set,
//    the set of C stays, and the next start installs the whole set of D
{ await until(()=>aside(p=>setOf(p, BUILD-1)), 15000); const sc=await aside(p=>setOf(p, BUILD-1));
  ok('4a before: the set of C is installed ('+sc+')', sc==='CC'); }
deploy('D', BUILD); site.override.set('/sync.js', sync('E'));
{ const pg=watch(await ctx.newPage()); const sw0=hits('/sw.js'), s0=hits('/sync.js'); await pg.goto(site.url);
  // the barrier: the worker of D was fetched, and the sync.js requests include its own (the page asks twice: its load and the one reload)
  const tried=await until(()=>hits('/sw.js')>sw0 && hits('/sync.js')>=s0+3, 15000);
  const ended=await until(()=>pg.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>!!r && !r.installing && !r.waiting)), 15000);
  ok('4b the worker of D tried its set and the install ended ('+(hits('/sync.js')-s0)+' sync.js requests)', !!tried && !!ended); await pg.close(); }
{ const k=await aside(p=>p.evaluate(async()=>(await caches.keys()).filter(k=>/^baobook-shell-/.test(k)))), sc=await aside(p=>setOf(p, BUILD-1));
  ok('4c no set of D with the sync.js of E ('+k.join(', ')+'); the set of C stays ('+sc+')', !k.includes('baobook-shell-'+BUILD) && sc==='CC'); }
site.override.set('/sync.js', sync('D'));
{ const pg=watch(await ctx.newPage()); await pg.goto(site.url); await pg.waitForSelector('#sheet');
  const sd=await until(()=>setOf(pg, BUILD), 30000);
  ok('4d the next start installs the whole set of D ('+sd+')', sd==='DD'); await pg.close(); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await site.close(); await br.close(); process.exit(fails?1:0);
