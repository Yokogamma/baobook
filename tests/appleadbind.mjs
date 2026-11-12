// A change of owner and the leader's lock in the same tab, over a real IndexedDB (docs/SYNC-PLAN.md §4.10, §4.11; the three races PR #140
// left open, tests/syncguard.mjs 5r for the core). (1) A tab binds the device to a new owner (bindOwner) and the lock it waited for is granted
// in the middle: the leader's reload() meets the owner this tab is writing and must not lock the tab as «epoch». (2) Another tab binds the store
// to a third owner between this tab's commit and the load that adopts it: the binding fails with `epoch`, the engine does not take the third
// owner, and the tab locks itself. (3) A refused engine: a read made while its lazy load is held in flight is refused as that load is, and
// hands out none of the new owner's data. `readGate` holds the engine's one-store reads of `sync` (the loads and lrevOf) while armed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, lead, stored } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const okWhy=async(n,conds,more)=>{ const bad=Object.keys(conds).filter(k=>!conds[k]); ok(n, !bad.length); if(bad.length){ console.log('    failed: '+bad.join('; ')); if(more) console.log('    '+JSON.stringify(await more())); } };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const owner=uid=>({env:'test', uid, email:uid+'@test'});
const ownerOf=pg=>pg.evaluate(()=>{ const o=sheetDebug.sync.engine().owner; return o && o.uid; });
const storedOwner=async pg=>((await stored(pg,'sync')).find(r=>r.k==='owner')||{}).uid;
const strip=pg=>pg.evaluate(()=>({strip:!document.getElementById('roStrip').hidden, msg:document.getElementById('roMsg').textContent, lock:sheetDebug.sync.locked()}));
const diag=async tabs=>{ const o={}; for(const [k,pg] of Object.entries(tabs)) o[k]=await pg.evaluate(()=>({lead:sheetDebug.sync.lead(), owner:sheetDebug.sync.engine().owner && sheetDebug.sync.engine().owner.uid, lock:sheetDebug.sync.locked(),
  status:sheetDebug.sync.status, log:sheetDebug.sync.log().slice(-6).map(e=>e.t)})).catch(e=>String(e)); return o; };
// the gate: while armed, every read of `sync` alone waits for one promise; open() lets them all go
const arm=pg=>pg.evaluate(()=>{ window.__held=0; window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.readGate=stores=>stores.length===1 && stores[0]==='sync'? (window.__held++, window.__gate) : null; });
const open=pg=>pg.evaluate(()=>{ sheetDebug.readGate=null; window.__open(); });
const held=pg=>pg.evaluate(()=>window.__held);

/* ── 1. the lock is granted while this tab binds a new owner ── */
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{owner:owner('u7'), pace:PACE}});
const Q=await newTab(A, SITE, {connect:false});
ok('1 the second tab waits in the queue with the stored owner u7', (await lead(Q)).queued && (await ownerOf(Q))==='u7');
await Q.evaluate(()=>sheetDebug.sync.engine().checkOwner());   // the engine has loaded: its setOwner opens the transaction at once
await arm(Q); await Q.evaluate(o=>{ window.__bind=sheetDebug.sync.bind(o); }, owner('u8'));
const committed=await until(async()=>(await storedOwner(Q))==='u8' && (await held(Q))>0, 5000);   // the store is u8's; the load that adopts it waits
await A.pg.close(); const granted=await until(async()=>(await lead(Q)).held, 5000);   // the lock reaches Q; its leadOn → reload() waits at the gate too
const heldN=await held(Q); await open(Q);
const bound=await Q.evaluate(()=>window.__bind), on=await until(async()=>(await lead(Q)).on, 5000), sQ=await strip(Q);
await okWhy('1b the lock came while the tab bound u8 (committed '+committed+', granted '+granted+', '+heldN+' reads held): the binding '+JSON.stringify(bound)+', the tab leads with u8 and is not locked', {
  'committed first': committed, 'granted meanwhile': granted, 'the reload waited too': heldN>=2, 'bind ok': bound && bound.ok, 'leads': on, 'names u8': (await ownerOf(Q))==='u8', 'no strip': !sQ.strip, 'no lock': !sQ.lock}, ()=>diag({Q}));

/* ── 2. another tab binds a third owner between this tab's commit and its adopt (a device of its own: each part stands alone) ── */
const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{owner:owner('u20'), pace:PACE}}), S=D.pg;
const R=await newTab(D, SITE, {connect:false});
ok('2 a second tab knows u20 and waits in the queue', (await ownerOf(R))==='u20' && (await lead(R)).queued);
await R.evaluate(()=>sheetDebug.sync.engine().checkOwner());
await arm(R); await R.evaluate(o=>{ window.__bind=sheetDebug.sync.bind(o); }, owner('u21'));
const r21=await until(async()=>(await storedOwner(R))==='u21' && (await held(R))>0, 5000);
await S.evaluate(o=>sheetDebug.sync.engine().setOwner(o), owner('u22'));   // the other tab's binding, before R's load reads the store
const s22=await storedOwner(R); await open(R);
const bR=await R.evaluate(()=>window.__bind); await until(async()=>(await strip(R)).strip, 3000); const sR=await strip(R), same=await R.evaluate(()=>sheetDebug.sync.engine().checkOwner());
await okWhy('2b R committed u21, then the other tab bound '+s22+': R\'s binding '+JSON.stringify(bR)+', its engine names '+(await ownerOf(R))+', it locks itself («epoch»), checkOwner '+same, {
  'R committed u21': r21, 'the store is u22': s22==='u22', 'bind refused': bR && !bR.ok && bR.code==='epoch', 'not u22': (await ownerOf(R))!=='u22', 'strip': sR.strip, 'lock epoch': sR.lock==='epoch', 'checkOwner false': same===false}, ()=>diag({R}));

/* ── 3. a refused engine: another tab changed the owner without a word, the engine's reload() refused the store; a read made while its next lazy load is held ── */
const T=await newTab(D, SITE, {connect:false});
await T.evaluate(()=>sheetDebug.sync.engine().checkOwner()); const tOwner=await ownerOf(T);
await S.evaluate(o=>sheetDebug.sync.engine().setOwner(o), owner('u23'));
const t0=await T.evaluate(()=>sheetDebug.sync.engine().reload().then(()=>'ok', x=>x && x.code));
await arm(T);
const r3=await T.evaluate(async()=>{ const e=sheetDebug.sync.engine();
  const first=e.copiesCount().then(()=>'ok', x=>x && x.code); const flying=e._S.loaded;
  const second=e.state('x').then(()=>'ok', x=>x && x.code), third=e.unsynced().then(()=>'ok', x=>x && x.code);
  await new Promise(r=>setTimeout(r,100)); sheetDebug.readGate=null; window.__open(); return {flying, out:[await first, await second, await third]}; });
await okWhy('3 T knew '+tOwner+', its reload() refused u23 ('+t0+'); a read made while its next lazy load is held (in flight: '+r3.flying+') is refused as the load is: '+r3.out.join(', '), {
  'reload refused': t0==='epoch', 'in flight': r3.flying, 'all refused': r3.out.every(c=>c==='epoch'), 'still not u23': (await ownerOf(T))!=='u23'}, ()=>diag({T}));

/* ── 4. the owner check (leadCheck: visible, resume, pageshow, a non-account «owner» message) made right after this tab starts to bind: it takes
   the rule of a lazy load, so the tab's own binding is «the same owner» and locks nothing (the independent review of #143 locked 6 of 8 such tabs) ── */
const G=await newDevice(br, cloud, SITE, 'G', {ctx:CTX, connect:{owner:owner('u30'), pace:PACE}});
const r4=[]; for(let i=0;i<6;i++){ const P=i? await newTab(G, SITE, {connect:false}) : G.pg;
  r4.push(await P.evaluate(async o=>{ const b=sheetDebug.sync.bind(o); await sheetDebug.sync.check(); const r=await b; return {bind:r.ok? 'ok' : r.code, lock:sheetDebug.sync.locked()||null}; }, owner('u3'+(i+1)))); }
await okWhy('4 six tabs, each binding a new owner with an owner check right behind it: '+r4.map(r=>r.bind+'/'+(r.lock||'-')).join(', '), {
  'every binding ok': r4.every(r=>r.bind==='ok'), 'no tab locked': r4.every(r=>!r.lock)});

/* ── 5. the owner check (a `resume`) made while a fresh tab's first load is held: it compares with the owner that load ends with, so the tab locks
   nothing (the second review of #143: on its head the tab locked as «epoch», the stored owner unchanged). The gate is set before the app runs ── */
await G.ctx.addInitScript(()=>{ let v; Object.defineProperty(window,'sheetDebug',{configurable:true, get(){ return v; }, set(x){ v=x; window.__held=0; window.__gate=new Promise(r=>{ window.__open=r; });
  x.readGate=st=>st.length===1 && st[0]==='sync'? (window.__held++, window.__gate) : null; }}); });
const P5=await G.ctx.newPage(); const p5errs=[]; P5.on('pageerror',e=>p5errs.push(String(e))); await P5.goto(SITE);
const held5=await until(()=>P5.evaluate(()=>window.__held>0).catch(()=>false), 10000);
await P5.evaluate(()=>{ document.dispatchEvent(new Event('resume')); }); await P5.waitForTimeout(150);
await P5.evaluate(()=>{ sheetDebug.readGate=null; window.__open(); });
await P5.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await P5.waitForTimeout(500);
const s5=await strip(P5), o5=await ownerOf(P5), st5=await storedOwner(P5);
await okWhy('5 a resume while a fresh tab\'s first load is held (held: '+held5+'): the tab names '+o5+' (the store: '+st5+'), lock '+s5.lock, {
  'the first load was held': !!held5, 'not locked': !s5.lock && !s5.strip, 'it names the stored owner': !!o5 && o5===st5}, ()=>diag({P5}));
G.errs.push(...p5errs);

const errs=[...A.errs, ...D.errs, ...G.errs]; ok('no page errors'+(errs.length? ': '+errs.join(' | ') : ''), !errs.length);
await br.close(); srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
