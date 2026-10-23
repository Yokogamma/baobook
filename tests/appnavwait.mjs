// The shell as one set per build, and a network that neither answers nor fails (a phone waking up, Wi-Fi reconnecting). Every deploy
// changes sw.js, so the worker installs the whole set of that build; nothing is written into a set afterwards. The page waits at most 5 s
// for the whole body, then the set's page answers and the update strip tells about the newer build; its files come from the same set
// (their address carries the build), and a fresh page never gets an older file. A first visit, or a set without the page, waits.
import { chromium } from 'playwright';
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS='1';   // before the launch: route() then sees the worker's own fetches (step 11)
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { until } from './lib/wait.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

const PUB=new URL('../public/', import.meta.url), rd=f=>fs.readFileSync(new URL(f, PUB),'utf8');
const HTML=rd('index.html'), SW=rd('sw.js'), SYNC=rd('sync.js'), BUILD=+/const BUILD=(\d+)/.exec(HTML)[1];
const site=await serve(); site.redirect.set('/index.html','/');
// a deploy: the page (marked t-ver), sw.js and build.json with build b, and a sync.js that says which deploy it belongs to
const deploy=(v,b)=>{ site.override.set('/index.html', HTML.replaceAll(String(BUILD), String(b)).replace('<title>','<meta name="t-ver" content="'+v+'"><title>'));
  site.override.set('/sw.js', SW.replaceAll(String(BUILD), String(b))); site.override.set('/build.json', JSON.stringify({build:b})); site.override.set('/sync.js', SYNC+'\n;window.__syncVer='+JSON.stringify(v)+';'); };
const tver=pg=>pg.evaluate(()=>(document.querySelector('meta[name="t-ver"]')||{}).content||null);
const sver=pg=>pg.evaluate(()=>window.__syncVer||null);
const strip=pg=>pg.evaluate(()=>{ const s=document.getElementById('updStrip'); return s && !s.hidden? s.textContent.replace(/\s+/g,' ').trim() : ''; });
// the set of build b as the worker installed it: which deploy its page and its sync.js belong to
const setOf=(pg,b)=>pg.evaluate(async k=>{ if(!(await caches.keys()).includes(k)) return null; const c=await caches.open(k), p=await c.match('/'), s=(await c.keys()).find(q=>/\/sync\.js\?b=/.test(q.url));
  const pv=p && (/name="t-ver" content="(\w)"/.exec(await p.text())||[])[1], sv=s && (/__syncVer="(\w)"/.exec(await (await c.match(s)).text())||[])[1]; return pv && sv? pv+sv : null; }, 'baobook-shell-'+b);

const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const errs=[];
const open=async(c,u)=>{ const pg=await (c||ctx).newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); const t=Date.now(); await pg.goto(u||site.url, {timeout:60000}); await pg.waitForSelector('#sheet'); return {pg, ms:Date.now()-t}; };

// installed with A, then B deployed and opened online: the worker installs the set of B
deploy('A', BUILD-3);
{ const {pg}=await open(); await pg.evaluate(()=>navigator.serviceWorker.ready); await pg.reload();
  deploy('B', BUILD-2); await pg.reload();
  const sb=await until(()=>setOf(pg, BUILD-2), 10000), goneA=await until(async()=>!(await pg.evaluate(()=>caches.keys())).includes('baobook-shell-'+(BUILD-3)), 15000);
  ok('1 the deploy of B installed one whole set: page and sync.js of B ('+sb+'), and the set of A is gone', sb==='BB' && goneA);
  await pg.close(); }

// C is deployed, but the server holds the page and every sync.js for 12 s
deploy('C', BUILD-1); site.delay.set('/index.html', 12000); site.delay.set('/sync.js', 12000);
{ const {pg, ms}=await open();
  ok('2 the held network: the app opens from the set in '+ms+' ms (under 9 s), as B', ms<9000 && await tver(pg)==='B');
  ok('3 its sync.js is of the same set: B ('+await sver(pg)+')', await sver(pg)==='B');
  site.delay.clear();
  const s=await until(async()=>{ const s=await strip(pg); return /версія/.test(s)? s : null; }, 25000);
  ok('4 the server knows C: the open page B shows «'+s+'»', /Доступна нова версія/.test(s||''));
  const sc=await until(()=>setOf(pg, BUILD-1), 30000), sbAfter=await setOf(pg, BUILD-2);
  ok('5 the late deploy of C arrives as a whole new set ('+sc+'); nothing was written into a set in between', sc==='CC' && (sbAfter===null || sbAfter==='BB'));
  await pg.close(); }

// the next start with a working network: C, its files of C, no strip
{ const {pg, ms}=await open(); await pg.waitForTimeout(3500);
  ok('6 a normal start: C in '+ms+' ms (under 4 s), sync.js of C, no strip', ms<4000 && await tver(pg)==='C' && await sver(pg)==='C' && await strip(pg)===''); await pg.close(); }

// the headers come at once, the body of the page stalls for 12 s: the 5 s still hold
deploy('D', BUILD); site.stall.set('/index.html', 12000);
{ const {pg, ms}=await open();
  ok('7 a body that stalls after the headers: the app opens from the set in '+ms+' ms (under 9 s), as C', ms<9000 && await tver(pg)==='C' && await sver(pg)==='C');
  site.stall.clear(); await pg.close(); }
const aside=async f=>{ const p=await ctx.newPage(); await p.goto(site.url+'manifest.webmanifest'); try{ return await f(p); } finally{ await p.close(); } };   // a page of the origin that is not the app
const shells=p=>p.evaluate(async()=>(await caches.keys()).filter(k=>/^baobook-shell-/.test(k)));
// an open page of the app lets the browser check for a new worker (it does so shortly after a navigation, and not for a page closed at once)
const installed=async(b,want)=>{ const {pg}=await open(); const s=await until(async()=>{ const s=await setOf(pg, b); return s===want? s : null; }, 30000); await pg.close(); return s; };
{ const sd=await installed(BUILD,'DD'); ok('7b the late deploy of D arrives as the whole set DD ('+sd+')', sd==='DD'); }

// a fresh page whose script is held: it waits for its own sync.js, never takes an older one from the set
deploy('E', BUILD+1); site.delay.set('/sync.js', 8000);
{ const {pg, ms}=await open();
  ok('8 the page E from the network with its sync.js held: it waits ('+ms+' ms) and runs sync.js of E ('+await sver(pg)+'), not the set\'s', await tver(pg)==='E' && await sver(pg)==='E');
  site.delay.clear(); await pg.close(); }

// the worker controls the page but its set has no page (the first visit after a cleared cache): a held network is waited for
{ const p0=await ctx.newPage(); await p0.goto(site.url+'manifest.webmanifest');
  const se=await until(async()=>{ const s=await setOf(p0, BUILD+1), k=await shells(p0); return s==='EE' && k.length===1 && s; }, 30000);   // E installed and activated: its set alone
  ok('8b the set of E is installed and alone ('+se+')', se==='EE');
  const k=await p0.evaluate(async()=>{ const k=(await caches.keys()).filter(k=>/^baobook-shell-/.test(k)); for(const x of k) await (await caches.open(x)).delete('/'); return k; }); await p0.close();
  site.delay.set('/index.html', 7000);
  const {pg, ms}=await open();
  ok('9 no page in the one set left ('+k.join(', ')+'): the controlled start waits for the held network ('+ms+' ms) and opens the app', ms>=6500 && k.length===1 && await tver(pg)==='E');
  site.delay.clear(); await pg.close(); }

// a fresh page whose file of its own build cannot be fetched (the connection drops) while the older worker still runs: the request fails,
// no file of another build stands in for it
deploy('F', BUILD+2);
{ const sf=await installed(BUILD+2,'FF'); ok('10a the set of F is installed ('+sf+')', sf==='FF'); }
deploy('G', BUILD+3); const qG='sync.js?b='+(BUILD+3); await ctx.route(u=>u.href.includes(qG), r=>r.abort('connectionreset'));
{ const n=errs.length; const {pg}=await open(); await pg.waitForTimeout(4000);   // long enough for the worker of G to try its set
  ok('10b the page G from the network with its sync.js cut off: no sync.js of F stands in ('+await sver(pg)+')', await tver(pg)==='G' && await sver(pg)===null);
  errs.splice(n); await pg.close(); }   // the page without its core throws: expected here
await ctx.unroute(u=>u.href.includes(qG));
{ const k=await aside(shells), sf=await aside(p=>setOf(p, BUILD+2));
  ok('10c the worker of G could not complete its set: none is installed, the set of F stays ('+k.join(', ')+')', !k.includes('baobook-shell-'+(BUILD+3)) && sf==='FF'); }

// a deploy lands while the worker of H is installing (its sync.js is slow): the set would mix H and I, so it is not installed
deploy('H', BUILD+4); site.delay.set('/sync.js', 3000);
{ const pg=await ctx.newPage(); const sync0=site.hits.get('/sync.js')||0, sw0=site.hits.get('/sw.js')||0; await pg.goto(site.url, {timeout:60000});
  // the barrier: the worker of H was fetched and is installing, and its sync.js request came after the page's own
  const started=await until(async()=>(site.hits.get('/sw.js')||0)>sw0 && (site.hits.get('/sync.js')||0)>=sync0+2 && await pg.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>!!(r && r.installing))), 10000);
  deploy('I', BUILD+5);   // I lands while the worker of H waits for its sync.js
  const ended=await until(()=>pg.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>!!r && !r.installing)), 15000);
  ok('11a the worker of H started its install before I landed, and the install ended', !!started && !!ended);
  site.delay.clear(); await pg.close(); }
{ const k=await aside(shells), sf=await aside(p=>setOf(p, BUILD+2));
  ok('11 a deploy during the install of H: no set of H ('+k.join(', ')+'), the set of F stays ('+sf+')', !k.includes('baobook-shell-'+(BUILD+4)) && sf==='FF'); }
{ const si=await installed(BUILD+5,'II'); ok('11b the next start installs the whole set of I ('+si+')', si==='II'); }

// a first visit has no worker and no set: it waits for the network, however long
{ const site2=await serve(); site2.delay.set('/index.html', 7000);
  const c2=await br.newContext({...CTX}); const {pg, ms}=await open(c2, site2.url);
  ok('12 a first visit waits for the held network ('+ms+' ms) and opens the app', ms>=6500 && await pg.locator('#sheet').count()===1);
  await c2.close(); await site2.close(); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
