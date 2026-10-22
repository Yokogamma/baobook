// The app shell after a deploy. The worker's fallback for a navigation is the page last loaded online, never an older copy precached at
// install, whatever address the app was opened at. An open page older than the build on the server (a tab left open, the installed app
// kept in memory, a start from the cache while the network was down) shows «Доступна нова версія · Оновити» when it is shown again or the
// network comes back; «Оновити» reloads only once nothing is left to save. BUILD is the same in the constant, the meta tag and build.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { until } from './lib/wait.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

const PUB=new URL('../public/', import.meta.url), HTML=fs.readFileSync(new URL('index.html', PUB),'utf8');
const BUILD=+((/const BUILD=(\d+)/.exec(HTML)||[])[1]||0), META=+((/<meta name="baobook-build" content="(\d+)">/.exec(HTML)||[])[1]||-1);
const FILE=fs.existsSync(new URL('build.json', PUB))? +JSON.parse(fs.readFileSync(new URL('build.json', PUB),'utf8')).build : -2;
ok('1 the build marker is one number in the constant, the meta tag and build.json ('+[BUILD,META,FILE].join(', ')+')', BUILD>2026010100 && BUILD===META && BUILD===FILE);
const NAME=String(BUILD).replace(/^\d\d(\d\d)(\d\d)(\d\d)(\d\d)$/,(_,y,m,d,n)=>y+'.'+m+'.'+d+'.'+(+n));   // 2026102201 → 26.10.22.1

// a version of the app: the marker t-ver tells the versions apart on screen, the build number goes everywhere BUILD is
const site=await serve(); site.redirect.set('/index.html','/');   // as on Cloudflare: the app lives at /, /index.html answers 307
const ver=(v,b)=>HTML.replace('<title>','<meta name="t-ver" content="'+v+'"><title>').replace(/const BUILD=\d+/,'const BUILD='+b).replace(/(<meta name="baobook-build" content=")\d+/,'$1'+b);
const deploy=(v,b)=>{ site.override.set('/index.html', ver(v,b)); site.override.set('/build.json', JSON.stringify({build:b})); };
const tver=pg=>pg.evaluate(()=>(document.querySelector('meta[name="t-ver"]')||{}).content||null);
const strip=pg=>pg.evaluate(()=>{ const s=document.getElementById('updStrip'); return s && !s.hidden? s.textContent.replace(/\s+/g,' ').trim() : ''; });
const nudge=pg=>pg.evaluate(()=>window.dispatchEvent(new Event('online')));   // the network came back: the page asks the server for its build

const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const errs=[];
const open=async u=>{ const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await pg.goto(u||site.url); await pg.waitForSelector('#sheet'); return pg; };

// installed with build A; then B is deployed and the app opened online
deploy('A', BUILD-2);
const p1=await open(); await p1.evaluate(()=>navigator.serviceWorker.ready); await p1.reload(); await p1.waitForTimeout(400);
ok('2 the worker controls the page', await p1.evaluate(()=>!!navigator.serviceWorker.controller));
deploy('B', BUILD-1); await p1.reload(); await p1.waitForTimeout(400);
ok('3 network first: a reload shows the new deploy B ('+await tver(p1)+')', await tver(p1)==='B');
await p1.close();

// C is deployed and the app is opened at an address with a query; then the network is down at the next start
deploy('C', BUILD);
const p2=await open(site.url+'?src=home'); await p2.waitForTimeout(500);
ok('4 opened online at /?src=home: C ('+await tver(p2)+')', await tver(p2)==='C');
await p2.close();
await ctx.setOffline(true);
const p3=await open(); await p3.waitForTimeout(500);
ok('5 offline start: the fallback is C, the page last loaded online, not an older copy ('+await tver(p3)+')', await tver(p3)==='C');
await nudge(p3); await p3.waitForTimeout(800);
ok('6 offline: no strip and no error', await strip(p3)==='');
await p3.close();
const p4=await open(site.url+'index.html'); await p4.waitForTimeout(300);
ok('7 offline at /index.html: the same page C ('+await tver(p4)+')', await tver(p4)==='C');
await p4.close();
await ctx.setOffline(false);

// a page that stays open while D is deployed: it says so when the network comes back or it is shown again
const p5=await open(); await p5.waitForTimeout(500);
ok('8 the current build: no strip', await tver(p5)==='C' && await strip(p5)==='');
{ const v=await p5.evaluate(()=>document.getElementById('buildV').textContent); ok('8a the settings menu shows the build as «Версія '+NAME+'» ('+v+')', v==='Версія '+NAME); }
// a second instance while the first stays open (Android may keep the old one in memory): it is not view-only, the sheet takes typing
{ const p6=await open(); await p6.waitForTimeout(600);
  const st=await p6.evaluate(()=>({ro:!document.getElementById('roStrip').hidden, inert:document.getElementById('sheet').inert, locked:document.querySelector('.app').classList.contains('locked')}));
  ok('8b a second instance next to an open one is not locked ('+JSON.stringify(st)+')', !st.ro && !st.inert && !st.locked); await p6.close(); }
deploy('D', BUILD+1);
await nudge(p5);
const s5=await until(()=>strip(p5), 5000);
ok('9 D on the server: the open page C shows «'+s5+'»', /Доступна нова версія/.test(s5||'') && /Оновити/.test(s5||''));
ok('9b the worker never stores build.json', await p5.evaluate(async()=>{ for(const k of await caches.keys()) for(const q of await (await caches.open(k)).keys()) if(/build\.json/.test(q.url)) return false; return true; }));

// «Оновити» while a write fails: no reload until the note is saved, then the reload brings D and the text is there
await p5.evaluate(()=>{ sheetDebug.failSave=true; });
await p5.mouse.click(500,300); await p5.keyboard.type('правка перед оновленням'); await p5.waitForTimeout(700);
ok('10 the write failed: the warning shows', await p5.locator('#saveWarn').isVisible());
await p5.click('#updGo'); await p5.waitForTimeout(1500);
const s10=await strip(p5);
ok('11 «Оновити» waits while something is unsaved: still C, «'+s10+'»', await tver(p5)==='C' && /збережеться/.test(s10));
await p5.evaluate(()=>{ sheetDebug.failSave=false; });
const nav=p5.waitForEvent('framenavigated', {timeout:8000}).catch(()=>null);
await p5.evaluate(()=>document.getElementById('saveRetry').click());
await nav; await p5.waitForSelector('#sheet'); await p5.waitForTimeout(600);
ok('12 saved, then reloaded by itself: D ('+await tver(p5)+'), no strip', await tver(p5)==='D' && await strip(p5)==='');
ok('12b the text typed before the reload is there', await p5.locator('.blk .txt').filter({hasText:'правка перед оновленням'}).count()===1);

// the cache holds only this app's caches, and the shell has no separate /index.html copy to go stale
{ const r=await p5.evaluate(async()=>{ const out={}; for(const k of await caches.keys()) out[k]=(await (await caches.open(k)).keys()).map(q=>new URL(q.url).pathname+new URL(q.url).search); return out; });
  const shell=Object.keys(r).find(k=>/^baobook-shell-/.test(k));
  ok('13 one shell cache '+shell+'; its entries for the page: '+JSON.stringify((r[shell]||[]).filter(u=>/^\/(\?|index\.html|$)/.test(u))), Object.keys(r).every(k=>k.startsWith('baobook-')) && shell && !(r[shell]||[]).some(u=>/index\.html/.test(u)) && (r[shell]||[]).filter(u=>/^\/(\?|$)/.test(u)).length===1); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
