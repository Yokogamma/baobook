// The leader tab (docs/SYNC-PLAN.md §4.10): among the tabs of one device only the holder of the Web Lock `baobook-sync:{env}` talks to the
// cloud; the others write locally and the leader sends their edits at once. A tab that closes or freezes lets the lock go, and the next tab
// continues the attempts it finds in the store: a lost confirmation is resolved by the receipt without a second write, and two runners of one
// attempt leave one commit. A change of owner made in another tab turns a tab into view-only («epoch»), with the text it could not write kept
// under the unsaved warning; so does the engine's own check and the resume check; a status from a replaced engine locks nothing. Any view-only
// mode releases the lock. Without an owner no lock is asked for.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, lead, locks, settle, stored, syncRecs, typeAt, curId, cloudWrite, connect, openNote } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300}, LOCK='baobook-sync:test';
const cloud=new TestCloud({start:Date.now()});
const commits=id=>cloud.events.filter(e=>e.t==='commit' && e.id===id).length;
const logHas=(pg,t)=>pg.evaluate(t=>sheetDebug.sync.log().some(e=>e.t===t), t);
const fire=(pg,type,onDoc)=>pg.evaluate(([type,onDoc])=>{ (onDoc? document : window).dispatchEvent(new Event(type)); }, [type,onDoc]);
const locked=pg=>pg.evaluate(()=>({strip:!document.getElementById('roStrip').hidden, msg:document.getElementById('roMsg').textContent, exp:document.getElementById('roExport').textContent, warn:!document.getElementById('saveWarn').hidden, cls:document.getElementById('app').className}));
const owner=uid=>({env:'test', uid, email:uid+'@test'});

/* ── 0. without an owner there is nothing to lead: no lock; the first connect asks for it ── */
{ const N=await newDevice(br, cloud, SITE, 'N', {ctx:CTX, connect:false}); const l0=await lead(N.pg), q0=await locks(N.pg);
  ok('0 no owner: no lock asked for, nothing held or pending', !l0.on && !l0.name && !q0.held.length && !q0.pending.length);
  await connect(N.pg,{devId:'N', devName:'Device N', pace:PACE}); const l1=await lead(N.pg), q1=await locks(N.pg);
  ok('0b after connect the tab holds '+LOCK+' and leads', l1.on && l1.held && l1.name===LOCK && q1.held.includes(LOCK) && l1.started);
  await N.close(); }

/* ── 1. two tabs of one device: the first leads, the second writes locally and the leader sends for it ── */
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}});
const a1=await lead(A.pg), q1=await locks(A.pg);
ok('1 the first tab holds the lock and leads: its engine is started', a1.on && a1.held && a1.name===LOCK && q1.held.includes(LOCK) && a1.started);
const B=await newTab(A, SITE, {connect:{pace:PACE}}); const b1=await lead(B), q2=await locks(B);
ok('1b the second tab waits in the queue: not leading, its engine not started', !b1.on && !b1.held && b1.queued && !b1.started && q2.pending.includes(LOCK) && q2.held.includes(LOCK));
await typeAt(B,500,300,'з другої вкладки'); const id=await curId(B); await settle(A.pg);
const lrevB=(await B.evaluate(()=>sheetDebug.sync.lrev()))[id];
ok('1c the follower\'s edit is stored with lrev '+lrevB+' and the leader sent it (the follower\'s engine sent nothing)', lrevB===1 && !!cloud.doc('notes',id) && cloud.doc('notes',id).blocks.some(b=>b.text==='з другої вкладки') && cloud.doc('notes',id).dev==='A' && await logHas(A.pg,'accepted') && !(await logHas(B,'accepted')));
cloudWrite(cloud,'p1',{title:'З телефону', blocks:[{id:'b',row:2,fx:0,text:'телефон'}]}); await settle(A.pg);
ok('1d a document from the phone is applied by the leader', !!(await stored(A.pg,'notes','p1')) && (await A.pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id))).includes('p1'));

/* ── 2. a leader change in the middle of an attempt: the response was lost, the tab closes, the next tab resolves the attempt by the receipt ── */
await connect(A.pg,{devId:'A', devName:'Device A', pace:{...PACE, retryMin:60000, retryMax:120000}});   // the retry after the lost response waits a minute: the attempt stays open
ok('2 reconnected with a slow retry: the first tab still leads', (await lead(A.pg)).on && (await lead(A.pg)).held);
cloud.fault('lost',{dev:'A'}); cloud.fault('delay',{dev:'A', ms:3600000});   // the response is lost and the commit stays out of the listener's sight: nothing resolves the attempt in this tab
await typeAt(A.pg,500,420,'втрачена відповідь'); const tr=await until(async()=>(await syncRecs(A.pg,'try:n:')).find(r=>r.k==='try:n:'+id), 4000);
const c1=commits(id), rev1=cloud.doc('notes',id).rev;
ok('2b the write landed ('+c1+' commits, rev '+rev1+') but the response was lost: the attempt stays in the store', !!tr && c1===2 && rev1===2 && cloud.doc('notes',id).rcpt.A===tr.op && (await A.pg.evaluate(()=>sheetDebug.sync.tries())).includes(id));
await A.pg.close(); const bl=await until(async()=>(await lead(B)).on, 5000);
ok('2c the first tab closed: the second holds the lock and leads', bl && (await lead(B)).held && (await locks(B)).held.includes(LOCK));
await B.evaluate(()=>{ sheetDebug.sync.clock=61000; }); await settle(B);   // past the minute the previous leader's backoff set
const stB=await B.evaluate(id=>sheetDebug.sync.state(id), id);
ok('2d the new leader found the attempt and resolved it by the receipt: no second write ('+commits(id)+' commits, rev '+cloud.doc('notes',id).rev+'), the attempt and the job are gone, the base is rev 2', commits(id)===2 && cloud.doc('notes',id).rev===2 && !stB.tr && !stB.job && stB.meta.base && stB.meta.base.rev===2 && await logHas(B,'accepted') && !(await logHas(B,'rejected')));
await B.evaluate(()=>{ sheetDebug.sync.clock=0; });

/* ── 3. two runners of one attempt (smoke; the deterministic version is in syncguard): the leader is held in the cloud transaction, freezes, the next tab finishes the attempt ── */
const C=await newTab(A, SITE, {connect:{pace:PACE}});
ok('3 a third tab waits in the queue behind the second', !(await lead(C)).on && (await lead(C)).queued);
let release; const held=new Promise(r=>{ release=r; }); cloud.fault('hold',{dev:'A', op:'txn', promise:held});
await typeAt(B,500,540,'два бігуни'); const trB=await until(async()=>(await syncRecs(B,'try:n:')).find(r=>r.k==='try:n:'+id), 4000);
ok('3b the second tab insured an attempt and is held inside the cloud transaction', !!trB && commits(id)===2);
await fire(B,'freeze',true); const cl=await until(async()=>(await lead(C)).on, 5000);
ok('3c a frozen leader lets the lock go: the third tab leads', cl && !(await lead(B)).on && !(await lead(B)).held);
await settle(C); const stC=await B.evaluate(id=>sheetDebug.sync.state(id), id);
ok('3d the third tab ran the same attempt to its end: one more commit (rev '+cloud.doc('notes',id).rev+'), the attempt is gone', commits(id)===3 && cloud.doc('notes',id).rev===3 && cloud.doc('notes',id).rcpt.A===trB.op && !stC.tr && !stC.job);
await fire(B,'resume',true); await B.waitForTimeout(300);
ok('3e the second tab resumed: the owner matches, so it asks again and waits in the queue', !(await lead(B)).on && (await lead(B)).queued && (await lead(C)).on);
release(); await B.waitForTimeout(600); await settle(C);
ok('3f the held transaction of the second tab wrote nothing ('+commits(id)+' commits, rev '+cloud.doc('notes',id).rev+'), its memory forgot the attempt', commits(id)===3 && cloud.doc('notes',id).rev===3 && !(await B.evaluate(()=>sheetDebug.sync.tries())).includes(id));
await C.close(); const bl2=await until(async()=>(await lead(B)).on, 5000);
ok('3g the third tab closed: the second leads again', bl2 && (await lead(B)).held);

/* ── 4. the owner changed in another tab ── */
// 4a: the engine's own check refuses a write; the text stays unsaved and the tab is view-only, the lock released
const D=await newTab(A, SITE, {connect:{pace:PACE}}); ok('4 a fourth tab waits in the queue', (await lead(D)).queued);
await D.evaluate(o=>sheetDebug.sync.engine().setOwner(o), owner('u2'));   // the store's owner changes without a word to the other tabs
await B.bringToFront(); await B.mouse.click(500,660); await B.keyboard.type('не запишеться'); await B.keyboard.press('Escape'); await B.waitForTimeout(700);
const k4=await locked(B), l4=await lead(B), bu=await B.evaluate(()=>{ const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; });
ok('4a the write was refused by the epoch check: view-only with the «epoch» strip, the text is unsaved (⚠, «Експортувати незбережене»), leaving would ask, the tab does not lead', k4.strip && /іншого облікового запису/.test(k4.msg) && k4.exp==='Експортувати незбережене' && k4.warn && bu && !l4.on && !l4.held && !l4.queued && /locked/.test(k4.cls));
const dl=await until(async()=>(await lead(D)).on, 5000);
ok('4b the lock went to the fourth tab, which leads for the new owner', dl && (await lead(D)).held && (await D.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u2');
ok('4c the text typed in the locked tab is still on its sheet', (await B.evaluate(()=>document.getElementById('sheet').innerText)).includes('не запишеться'));
// 4b: another tab reports the change («owner» message): the check locks the tab at once
const E=await newTab(A, SITE, {connect:false}); ok('4d a fifth tab opens with the stored owner and waits in the queue', (await lead(E)).queued && (await E.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u2');
await connect(D,{devId:'A', devName:'Device A', owner:owner('u3'), pace:PACE}); await E.waitForTimeout(300);
const k5=await locked(E), l5=await lead(E);
ok('4e the fourth tab changed the owner and said so: the fifth tab is view-only with the «epoch» strip, not in the queue; the fourth still leads', k5.strip && /іншого облікового запису/.test(k5.msg) && !l5.on && !l5.queued && (await lead(D)).on);
// 4c: the resume check finds another owner
const F=await newTab(A, SITE, {connect:false}); ok('4f a sixth tab waits in the queue', (await lead(F)).queued);
await D.evaluate(o=>sheetDebug.sync.engine().setOwner(o), owner('u4')); await fire(F,'resume',true); await F.waitForTimeout(300);
ok('4g resumed, the sixth tab checked the owner and is view-only', (await locked(F)).strip && !(await lead(F)).queued && !(await lead(F)).on);
// 4d: a «reload» status from an engine this tab replaced locks nothing
await D.evaluate(()=>{ window.__old=sheetDebug.sync.engine(); }); await connect(D,{devId:'A', devName:'Device A', owner:owner('u5'), pace:PACE});
await D.evaluate(()=>window.__old.writeLocal('zz',(C,m,t)=>({title:'x', blocks:[], created:t, updated:t}))); await D.waitForTimeout(200);
ok('4h the replaced engine reported «reload»: the tab stays editable and leads', !(await locked(D)).strip && (await lead(D)).on && (await lead(D)).held);

// 4e: the lock is granted to a tab that waited with the old owner, and no «owner» message reached it: the load refuses the store, the tab locks and lets the lock go
const H=await newTab(A, SITE, {connect:false}), J=await newTab(A, SITE, {connect:false});
await typeAt(H,500,780,'набрано у H під u5');
ok('4i two more tabs wait in the queue with the stored owner; one of them wrote a note locally', (await lead(H)).queued && (await lead(J)).queued && (await H.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u5' && (await stored(H,'notes')).some(n=>n.blocks.some(b=>b.text==='набрано у H під u5')));
await D.evaluate(o=>sheetDebug.sync.engine().setOwner(o), owner('u6'));   // the owner changes without a word to the other tabs
const K=await newTab(A, SITE, {connect:false}); ok('4j a tab opened after the change knows the new owner and waits last', (await K.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u6' && (await lead(K)).queued);
await D.close(); const kl=await until(async()=>(await lead(K)).on, 10000);
const k4i=await locked(H), l4i=await lead(H), k4j=await locked(J);
ok('4k the lock reached the tabs that knew the old owner first: each refused the store, locked itself as «epoch» (the engine still names u5) and let the lock go; the tab that knows the new owner leads', kl && (await lead(K)).held && k4i.strip && /іншого облікового запису/.test(k4i.msg) && !l4i.on && !l4i.held && !l4i.queued && (await H.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u5' && k4j.strip && !(await lead(J)).on);
ok('4l the locked tab still shows its note and takes no new text into the store', (await H.evaluate(()=>document.getElementById('sheet').innerText)).includes('набрано у H під u5') && (await H.evaluate(()=>document.getElementById('sheet').inert)));
// 4g: the locked tab is shown again: the storage check of pageshow/visibilitychange must not bring the new owner's data onto its screen either
await K.bringToFront(); await K.click('#ttl'); await K.keyboard.press('End'); await K.keyboard.type(' (u6)'); await K.keyboard.press('Escape'); await K.waitForTimeout(600);
const tH=await H.evaluate(()=>document.getElementById('ttl').textContent);
await H.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true})); }); await H.waitForTimeout(500);
ok('4l2 the new owner\'s tab renamed the note: the store has the new title, the locked tab shown again keeps the old one («'+tH+'») and still names u5', (await stored(H,'notes',id)).title.endsWith('(u6)') && (await H.evaluate(()=>document.getElementById('ttl').textContent))===tH && !tH.endsWith('(u6)') && (await H.evaluate(()=>sheetDebug.sync.engine().owner.uid))==='u5' && !(await lead(H)).queued);
// 4f: the lead is lost while the start is still running (the format record write is held): the start must not bring the engine up afterwards
const L=await newTab(A, SITE, {connect:{owner:owner('u6'), pace:PACE}});   // with a cloud: the engine's start writes the format record, which the gate below holds
await L.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });   // every write of L waits, the engine's start among them
const M=await newTab(A, SITE, {connect:{owner:owner('u6'), pace:PACE}});
ok('4m two tabs wait behind the leader', (await lead(L)).queued && (await lead(M)).queued);
await K.close(); await until(async()=>(await lead(L)).started, 5000);   // L got the lock: its engine is marked started and waits inside start()
ok('4n the next tab got the lock and is starting: the engine marked started, the lead not yet taken', (await lead(L)).held && (await lead(L)).started && !(await lead(L)).on);
await fire(L,'freeze',true); const ml=await until(async()=>(await lead(M)).on, 5000);
ok('4o frozen in the middle of the start: the lock went on to the last tab, which leads', ml && (await lead(M)).held && !(await lead(L)).held);
await L.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); await L.waitForTimeout(500); const lL=await lead(L);
ok('4p the held start finished: the engine did not come up (not started, not leading, no listeners), the last tab keeps leading', !lL.on && !lL.started && !lL.held && (await L.evaluate(()=>{ const S=sheetDebug.sync.engine()._S; return !S.listen.notes && !S.listen.versions; })) && (await lead(M)).on);
await fire(L,'resume',true); await L.waitForTimeout(300);
ok('4q resumed, it waits in the queue behind the leader', (await lead(L)).queued && !(await lead(L)).on && (await lead(M)).on);
// 4h: the lock comes back before the held start finished: a second start joins it, and the stale one must not stop the engine of the new one
await L.close();   // out of the queue: the next tab opened below is the one to get the lock after the leader
const N=await newTab(A, SITE, {connect:{owner:owner('u6'), pace:PACE}});
await N.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });
const O=await newTab(A, SITE, {connect:{owner:owner('u6'), pace:PACE}});
await M.close(); await until(async()=>(await lead(N)).started, 5000);
ok('4r the next tab got the lock and its start waits in the gate', (await lead(N)).held && (await lead(N)).started && !(await lead(N)).on);
await fire(N,'freeze',true); const ol=await until(async()=>(await lead(O)).on, 5000);
ok('4s frozen in the middle of the start: the last tab leads', ol && !(await lead(N)).held);
await fire(N,'resume',true); await N.waitForTimeout(300); ok('4t resumed: in the queue', (await lead(N)).queued && !(await lead(N)).on);
await O.close(); await until(async()=>(await lead(N)).held, 5000); await N.waitForTimeout(200);
ok('4u the lock is back while the first start still waits in the gate: held, the engine marked started, not leading yet', (await lead(N)).held && (await lead(N)).started && !(await lead(N)).on);
await N.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); }); const nOn=await until(async()=>(await lead(N)).on, 5000);
ok('4v both starts finished: the stale one changed nothing, the tab leads with its engine started and its listeners on', nOn && (await lead(N)).started && (await lead(N)).held && (await N.evaluate(()=>{ const S=sheetDebug.sync.engine()._S; return !!S.listen.notes && !!S.listen.versions && S.started; })));
await openNote(N,'p1'); await typeAt(N,500,420,'після двох запусків'); const sent=await until(()=>!!cloud.doc('notes','p1') && cloud.doc('notes','p1').blocks.some(b=>b.text==='після двох запусків'), 6000);
ok('4w its edit reaches the cloud', !!sent);

/* ── 5. any view-only mode releases the lock: another tab opens the database with a newer version ── */
const G=await newTab(A, SITE, {connect:false});
await G.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet',4); r.onupgradeneeded=()=>{}; r.onsuccess=()=>{ r.result.close(); res('ok'); }; r.onblocked=()=>res('blocked'); r.onerror=()=>res('error'); }));
const gone=await until(async()=>!(await lead(N)).held && !(await locks(G)).held.includes(LOCK), 5000);
ok('5 the leader was locked out by the newer database («updated»): the lock is free, nobody leads', gone && (await locked(N)).strip && !(await lead(N)).on);

/* ── 6. a hidden leader hands the lead to a visible tab that asks: Chrome keeps the lock in a hidden tab (no freeze while it holds one) but throttles
   its timers, so the visible tab, queued for the lock, sends «lead?» when shown and the hidden leader lets go; shown again, it queues behind ── */
const QD=await newDevice(br, cloud, SITE, 'Q', {ctx:CTX, connect:{pace:PACE}}), Q=QD.pg; const R=await newTab(QD, SITE, {connect:{pace:PACE}}); await until(async()=>(await lead(Q)).on && (await lead(R)).queued, 5000);
const hide=pg=>pg.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true, get:()=>true}); Object.defineProperty(document,'visibilityState',{configurable:true, get:()=>'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
const show=pg=>pg.evaluate(()=>{ delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
await show(R); await R.waitForTimeout(400);
ok('6 a visible leader keeps the lock when another visible tab asks', (await lead(Q)).on && (await lead(Q)).held && (await lead(R)).queued && !(await lead(R)).on);
await hide(Q); await Q.waitForTimeout(300); ok('6b hidden, the leader with the freeze event keeps the lock until asked', (await lead(Q)).held);
await show(R); const handed=await until(async()=>(await lead(R)).on && !(await lead(Q)).held, 5000);
ok('6c the visible tab asked: the hidden leader let go and the visible one leads', handed && (await lead(R)).held && !(await lead(Q)).on && !(await lead(Q)).queued);
await show(Q); const back=await until(async()=>(await lead(Q)).queued, 5000);
ok('6d shown again, the former leader queues behind the visible one', back && (await lead(R)).on);
await hide(R); await show(Q); const again=await until(async()=>(await lead(Q)).on && !(await lead(R)).held, 5000);
ok('6e and takes the lead back once that one is hidden and it asks', again);
await Q.evaluate(()=>{ document.getElementById('newBtn').click(); }); await Q.waitForTimeout(300); const qid=await curId(Q); await typeAt(Q,500,300,'після передачі лідерства'); const sentQ=await until(()=>!!cloud.doc('notes',qid) && cloud.doc('notes',qid).blocks.some(b=>b.text==='після передачі лідерства'), 6000);
ok('6f its edit reaches the cloud', !!sentQ); const errsQ=QD.errs; await QD.close();

const errs=A.errs.concat(errsQ); console.log(errs.length? errs.join('\n') : '✓ no errors'); if(errs.length) fails++;
await A.close(); await br.close(); await srv.close(); process.exit(fails?1:0);
