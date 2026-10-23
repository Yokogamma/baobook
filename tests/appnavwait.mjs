// The shell as one set per build, and a network that neither answers nor fails (a phone waking up, Wi-Fi reconnecting). Every deploy
// changes sw.js, so the worker installs the whole set of that build; nothing is written into a set afterwards. The page waits at most 5 s
// for the whole body, then the set's page answers and the update strip tells about the newer build; its files come from the same set
// (their address carries the build), and a fresh page never gets an older file. A first visit, or a set without the page, waits.
import { chromium } from 'playwright';
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
  const sb=await until(()=>setOf(pg, BUILD-2), 10000), goneA=await until(async()=>!(await pg.evaluate(()=>caches.keys())).includes('baobook-shell-'+(BUILD-3)), 5000);
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
await until(async()=>{ const p=await ctx.newPage(); await p.goto(site.url+'manifest.webmanifest'); const r=await setOf(p, BUILD); await p.close(); return r; }, 30000);

// a fresh page whose script is held: it waits for its own sync.js, never takes an older one from the set
deploy('E', BUILD+1); site.delay.set('/sync.js', 8000);
{ const {pg, ms}=await open();
  ok('8 the page E from the network with its sync.js held: it waits ('+ms+' ms) and runs sync.js of E ('+await sver(pg)+'), not the set\'s', await tver(pg)==='E' && await sver(pg)==='E');
  site.delay.clear(); await pg.close(); }

// the worker controls the page but its set has no page (the first visit after a cleared cache): a held network is waited for
{ const p0=await ctx.newPage(); await p0.goto(site.url+'manifest.webmanifest');
  await until(async()=>(await p0.evaluate(()=>caches.keys())).filter(k=>/^baobook-shell-/.test(k)).length===1, 15000);   // E installed and activated: one set left
  const k=await p0.evaluate(async()=>{ const k=(await caches.keys()).filter(k=>/^baobook-shell-/.test(k)); for(const x of k) await (await caches.open(x)).delete('/'); return k; }); await p0.close();
  site.delay.set('/index.html', 7000);
  const {pg, ms}=await open();
  ok('9 no page in the one set left ('+k.join(', ')+'): the controlled start waits for the held network ('+ms+' ms) and opens the app', ms>=6500 && k.length===1 && await tver(pg)==='E');
  site.delay.clear(); await pg.close(); }

// a first visit has no worker and no set: it waits for the network, however long
{ const site2=await serve(); site2.delay.set('/index.html', 7000);
  const c2=await br.newContext({...CTX}); const {pg, ms}=await open(c2, site2.url);
  ok('10 a first visit waits for the held network ('+ms+' ms) and opens the app', ms>=6500 && await pg.locator('#sheet').count()===1);
  await c2.close(); await site2.close(); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
