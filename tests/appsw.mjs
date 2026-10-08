// Service worker over a real origin: it touches only its own caches, the app opens offline, a new deploy arrives on reload.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve } from './lib/server.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const keys=pg=>pg.evaluate(()=>caches.keys());
const controlled=pg=>pg.evaluate(()=>!!navigator.serviceWorker.controller);

const site=await serve();
const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));

// first visit without a service worker: another app on the same origin has a cache, and so does an older Baobook
site.override.set('/sw.js',null);
await pg.goto(site.url); await pg.waitForTimeout(500);
await pg.evaluate(async()=>{ await (await caches.open('other-app-cache')).put('/other.txt',new Response('kept')); await (await caches.open('baobook-shell-v0')).put('/old.txt',new Response('old')); });
ok('1 no service worker yet; seeded a foreign cache and an old Baobook cache', !(await controlled(pg)) && (await keys(pg)).includes('other-app-cache'));

site.override.delete('/sw.js');
await pg.reload(); await pg.evaluate(()=>navigator.serviceWorker.ready); await pg.reload(); await pg.waitForTimeout(500);
const k=await keys(pg);
ok('2 service worker active and controls the page', await controlled(pg));
ok('3 activate deleted only the old Baobook cache; the foreign cache is untouched ('+k.join(', ')+')', k.includes('other-app-cache') && !k.includes('baobook-shell-v0') && k.some(x=>/^baobook-shell-v\d+$/.test(x)));
ok('3b the foreign cache still holds its data', await pg.evaluate(async()=>{ const r=await (await caches.open('other-app-cache')).match('/other.txt'); return r? await r.text() : null; })==='kept');

await pg.mouse.click(500,300); await pg.keyboard.type('нотатка до відключення мережі'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);

// a new deploy: the shell is network-first, so a reload brings it at once
const html=fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8');
site.override.set('/index.html', html.replace('<title>','<meta name="build" content="update-test"><title>'));
await pg.reload(); await pg.waitForTimeout(500);
ok('4 a new deploy shows up on the next reload', await pg.locator('meta[name="build"]').count()===1);
site.override.delete('/index.html'); await pg.reload(); await pg.waitForTimeout(500);

// the server goes away: the app still opens from the cache, with its notes
await site.close();
await pg.reload(); await pg.waitForTimeout(800);
ok('5 offline: the app opens from the cache', await pg.locator('#sheet').count()===1 && await pg.locator('meta[name="build"]').count()===0);
ok('5b offline: the note is there', (await pg.locator('.blk .txt').filter({hasText:'нотатка до відключення мережі'}).count())===1);

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
