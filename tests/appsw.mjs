// Service worker over a real origin: it touches only its own caches, the app opens offline, a new deploy arrives on reload; requests to
// /__/ (the sign-in pages the Worker proxies, SYNC-PLAN 4.13) pass it by and are never cached; the Firebase SDK is cached when used and
// the cache survives an update of the worker.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { until } from './lib/wait.mjs';
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS='1';   // before the launch: route() then sees the fetches the service worker itself makes (the SDK step)
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const keys=pg=>pg.evaluate(()=>caches.keys());
const controlled=pg=>pg.evaluate(()=>!!navigator.serviceWorker.controller);

const site=await serve();
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));

// first visit without a service worker: another app on the same origin has a cache, and so does an older Baobook
site.override.set('/sw.js',null);
await pg.goto(site.url); await pg.waitForTimeout(500);
await pg.evaluate(async()=>{ await (await caches.open('other-app-cache')).put('/other.txt',new Response('kept')); await (await caches.open('baobook-shell-v0')).put('/old.txt',new Response('old')); });
ok('1 no service worker yet; seeded a foreign cache and an old Baobook cache', !(await controlled(pg)) && (await keys(pg)).includes('other-app-cache'));

site.override.delete('/sw.js');
await pg.reload(); await pg.evaluate(()=>navigator.serviceWorker.ready); await pg.reload(); await pg.waitForTimeout(500);
const k=await keys(pg);
ok('2 service worker active and controls the page', await controlled(pg));
ok('3 activate deleted only the old Baobook cache; the foreign cache is untouched ('+k.join(', ')+')', k.includes('other-app-cache') && !k.includes('baobook-shell-v0') && k.some(x=>/^baobook-shell-\d+$/.test(x)));
ok('3b the foreign cache still holds its data', await pg.evaluate(async()=>{ const r=await (await caches.open('other-app-cache')).match('/other.txt'); return r? await r.text() : null; })==='kept');

await pg.mouse.click(500,300); await pg.keyboard.type('нотатка до відключення мережі'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);

// a new deploy: the shell is network-first, so a reload brings it at once
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
site.override.set('/index.html', html.replace('<title>','<meta name="build" content="update-test"><title>'));
await pg.reload(); await pg.waitForTimeout(500);
ok('4 a new deploy shows up on the next reload', await pg.locator('meta[name="build"]').count()===1);
site.override.delete('/index.html'); await pg.reload(); await pg.waitForTimeout(500);

// the sign-in pages under /__/ go straight to the network (here: the server answers 404) and leave nothing in any cache
{ const r=await pg.evaluate(async()=>{ const a=await fetch('/__/auth/iframe?apiKey=k'); const b=await fetch('/__/auth/handler',{method:'POST', body:'x=1'}); return [a.status, b.status]; });
  const cached=await pg.evaluate(async()=>{ const out=[]; for(const k of await caches.keys()){ for(const q of await (await caches.open(k)).keys()) if(/\/__\//.test(q.url)) out.push(k+' '+q.url); } return out; });
  ok('6 /__/auth/* passes the worker by (the server\'s 404 comes through, '+r.join('/')+') and nothing under /__/ is cached', r[0]===404 && r[1]===404 && cached.length===0 && await controlled(pg)); }

// the Firebase SDK (www.gstatic.com/firebasejs/<version>/…): a module fetched through the worker lands in baobook-sdk and comes from there next time
let sdkHits=0; const SDK_URL='https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
await ctx.route('https://www.gstatic.com/firebasejs/**', r=>{ sdkHits++; r.fulfill({status:200, contentType:'text/javascript', headers:{'access-control-allow-origin':'*'}, body:'export const sdk="stub";'}); });
{ const v=await pg.evaluate(u=>import(u).then(m=>m.sdk), SDK_URL);
  const keys=await pg.evaluate(async()=>(await (await caches.open('baobook-sdk')).keys()).map(q=>q.url));
  ok('7 the SDK module loads through the worker ('+sdkHits+' network fetch) and is stored in baobook-sdk', v==='stub' && sdkHits===1 && keys.includes(SDK_URL));
  await pg.reload(); await pg.waitForTimeout(300);
  const v2=await pg.evaluate(u=>import(u).then(m=>m.sdk), SDK_URL);
  ok('7b after a reload the module comes from the cache: still '+sdkHits+' network fetch', v2==='stub' && sdkHits===1); }

// an update of the worker (the next version of sw.js on the server): the old shell goes, the SDK and font caches stay
{ const sw=fs.readFileSync(new URL('../public/sw.js', import.meta.url),'utf8'); const OLD='baobook-shell-'+/const BUILD=(\d+)/.exec(sw)[1]; site.override.set('/sw.js', sw.replace(/const BUILD=\d+/,'const BUILD=99'));
  await pg.evaluate(async()=>{ const reg=await navigator.serviceWorker.getRegistration(); await reg.update(); });
  const k2=await until(async()=>{ const k=await keys(pg); return k.includes('baobook-shell-99') && !k.includes(OLD)? k : null; }, 10000) || await keys(pg);
  ok('8 after the update the shell is 99, the old shell is gone and baobook-sdk is kept ('+k2.join(', ')+')', k2.includes('baobook-shell-99') && !k2.includes(OLD) && k2.includes('baobook-sdk') && k2.includes('other-app-cache'));
  await pg.reload(); await pg.waitForTimeout(500); }

// the server goes away: the app still opens from the cache, with its notes
await site.close();
await pg.reload(); await pg.waitForTimeout(800);
ok('5 offline: the app opens from the cache', await pg.locator('#sheet').count()===1 && await pg.locator('meta[name="build"]').count()===0);
ok('5b offline: the note is there', (await pg.locator('.blk .txt').filter({hasText:'нотатка до відключення мережі'}).count())===1);

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
