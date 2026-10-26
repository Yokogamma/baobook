// The back/forward cache and the leader tab (docs/SYNC-PLAN.md §4.10), in a browser launched with the cache on (Playwright turns it off by
// default). A tab that holds a Web Lock cannot enter the cache, so the leader lets the lock go on pagehide and freeze: leaving the page and
// coming back through history, it is restored from the cache (pageshow with persisted) and asks for the lock again; if the browser did not
// keep it, notRestoredReasons must not name the lock. With a second tab, that one leads while the first is away, and keeps leading when the
// first comes back and waits in the queue, until it closes. A request waiting in the queue is aborted when its tab leaves, so a closing leader
// hands the lock to the next live tab, never to a page in the cache. Chromium evicts a cached page when a message arrives on its
// BroadcastChannel, so the other tabs stay quiet while the first is away.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, lead, locks } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url; srv.override.set('/p2.html','<!doctype html><title>p2</title><p>second page</p>');   // .html: the static server names the type by the extension
const exe=process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {};
const br=await chromium.launch({...exe, ignoreDefaultArgs:['--disable-back-forward-cache']});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300}, LOCK='baobook-sync:test';
const cloud=new TestCloud({start:Date.now()});
// every document of the context records its lifecycle events; a document restored from the cache keeps its array, a fresh one starts anew
const INIT=()=>{ window.__life=[]; for(const t of ['pagehide','pageshow']) addEventListener(t,e=>window.__life.push(t+(e.persisted? ':persisted' : ''))); for(const t of ['freeze','resume']) document.addEventListener(t,()=>window.__life.push(t)); };
const life=pg=>pg.evaluate(()=>window.__life.slice()).catch(()=>null);
// leave for the second page and come back through history; resolves once the app page is there again, with whether the document was restored
async function away(pg, during){ await pg.evaluate(()=>{ window.__mark=1; }); await pg.goto(SITE+'p2.html'); if(during) await during();
  await pg.evaluate(()=>history.back()); const back=await until(()=>pg.evaluate(()=>location.pathname==='/' && document.documentElement.dataset.ready!==undefined).catch(()=>false), 10000);
  const restored=await pg.evaluate(()=>window.__mark===1).catch(()=>false);
  const reasons=restored? null : await pg.evaluate(()=>{ const e=performance.getEntriesByType('navigation')[0]; const n=e && e.notRestoredReasons; return n? JSON.parse(JSON.stringify(n)) : null; }).catch(()=>null);
  return {back, restored, reasons, life:await life(pg)}; }
const noLock=r=>!JSON.stringify(r||{}).toLowerCase().includes('"lock"');

/* ── 1. one tab: the leader goes away and comes back ── */
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}, init:INIT});
ok('1 the tab leads', (await lead(A.pg)).on && (await lead(A.pg)).held);
const r1=await away(A.pg);
console.log('   1: '+(r1.restored? 'restored from the cache' : 'loaded anew; notRestoredReasons: '+JSON.stringify(r1.reasons))+'; events: '+JSON.stringify(r1.life));
ok('1b back on the app page'+(r1.restored? ', restored from the cache (pagehide:persisted, freeze, resume, pageshow:persisted)' : ', not restored: the reasons name no lock'), r1.back && (r1.restored? r1.life.includes('pagehide:persisted') && r1.life.includes('pageshow:persisted') : noLock(r1.reasons)));
const l1=await until(async()=>{ const l=await lead(A.pg); return l.on && l.held? l : null; }, 10000);
ok('1c it leads again: the lock was asked for on pageshow'+(r1.restored? '' : ' (a fresh start)'), !!l1 && (await locks(A.pg)).held.includes(LOCK));

/* ── 2. two tabs: the follower leads while the leader is away, and keeps leading when it is back ── */
const B=await newTab(A, SITE, {connect:{pace:PACE}}); ok('2 the second tab waits in the queue', (await lead(B)).queued && !(await lead(B)).on);
const r2=await away(A.pg, async()=>{ const on=await until(async()=>(await lead(B)).on, 10000); ok('2b the first tab left: the second holds the lock and leads', on && (await lead(B)).held); });
console.log('   2: '+(r2.restored? 'restored from the cache' : 'loaded anew; notRestoredReasons: '+JSON.stringify(r2.reasons))+'; events: '+JSON.stringify(r2.life));
await A.pg.waitForTimeout(500); const la=await lead(A.pg), lb=await lead(B);
ok('2c the first tab is back'+(r2.restored? ' from the cache' : ' (loaded anew)')+': it waits in the queue, the second keeps leading', r2.back && (r2.restored? r2.life.includes('pageshow:persisted') : noLock(r2.reasons)) && la.queued && !la.on && lb.on && lb.held);
await B.close(); const l2=await until(async()=>{ const l=await lead(A.pg); return l.on && l.held? l : null; }, 10000);
ok('2d the second tab closed: the first leads again', !!l2);

/* ── 3. a queued request is aborted when its tab leaves: a closing leader hands the lock to the next live tab ── */
const C=await newTab(A, SITE, {connect:{pace:PACE}}), D=await newTab(A, SITE, {connect:{pace:PACE}});
ok('3 the first tab leads, the third and the fourth wait in the queue in that order', (await lead(A.pg)).on && (await lead(C)).queued && (await lead(D)).queued && (await locks(D)).pending.filter(n=>n===LOCK).length===2);
await C.evaluate(()=>{ window.__mark=1; }); await C.goto(SITE+'p2.html'); await C.waitForTimeout(300);
ok('3b the third tab left: its request is gone from the queue', (await locks(D)).pending.filter(n=>n===LOCK).length===1);
await A.pg.close(); const dl=await until(async()=>(await lead(D)).on, 10000);
ok('3c the first tab closed: the fourth tab leads, not the page in the cache', dl && (await lead(D)).held);
await C.evaluate(()=>history.back()); await until(()=>C.evaluate(()=>location.pathname==='/' && document.documentElement.dataset.ready!==undefined).catch(()=>false), 10000); await C.waitForTimeout(500);
const r3=await C.evaluate(()=>window.__mark===1).catch(()=>false); const lc=await lead(C);
console.log('   3: the third tab '+(r3? 'restored from the cache' : 'loaded anew'));
ok('3d the third tab came back and waits in the queue behind the fourth', lc.queued && !lc.on && (await lead(D)).on);

console.log(A.errs.length? A.errs.join('\n') : '✓ no errors'); if(A.errs.length) fails++;
await A.close(); await br.close(); await srv.close(); process.exit(fails?1:0);
