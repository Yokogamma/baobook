// The trash and the automatic purge on the real rules (SYNC-PLAN 4.8): a note moved to the trash gets its server date `tsrv`; with the device
// clock a month ahead the engine queues an automatic tombstone, the rules refuse it as early (their clock says the note is fresh) and the job
// waits a day; once the server date is old enough the tombstone passes and the note leaves the device. Run from tests/rules through the
// emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/trash.mjs"
import { launch, device, acc, signIn, untilUI, until } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc, seed, Ts } from './lib/emu.mjs';
import { typeAt } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const DAY=864e5;
async function docUntil(path, pred, timeout=20000){ const t0=Date.now(); for(;;){ const d=await readDoc(path); if(pred(d)) return d; if(Date.now()-t0>timeout) return d; await new Promise(r=>setTimeout(r,200)); } }

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), C1=credential('sub-one','one@example.com'), ROOT='env/dev/users/'+u1.uid;
await loadRules(rulesFor(u1.uid));
const env=await launch(); const A=await device(env,'A');
await typeAt(A.pg, 500, 300, 'Перша'); const id1=await A.pg.evaluate(()=>sheetDebug.cur()); await typeAt(A.pg, 500, 420, 'Друга, лишається');
await A.pg.evaluate(()=>{ document.getElementById('newBtn').click(); }); await A.pg.waitForTimeout(300); await typeAt(A.pg, 500, 300, 'Друга нотатка'); const id2=await A.pg.evaluate(()=>sheetDebug.cur());
await signIn(A.pg, C1); await untilUI(A.pg, 'synced');
ok('1 two notes in the cloud', !!(await readDoc(ROOT+'/notes/'+id1)) && !!(await readDoc(ROOT+'/notes/'+id2)));

// 2. the first note goes to the trash: the document gets `deleted` and the server's `tsrv`
const it=A.pg.locator('#list .item[data-id="'+id1+'"]'); await it.hover(); await it.locator('.it-x').click();
const d2=await docUntil(ROOT+'/notes/'+id1, d=>!!d && d.deleted>0); await untilUI(A.pg, 'synced');
ok('2 in the trash: deleted and a server tsrv equal to the write\'s srv', d2.deleted>0 && d2.tsrv instanceof Ts && d2.srv instanceof Ts && d2.tsrv.s===d2.srv.s && d2.tsrv.ns===d2.srv.ns && !d2.purged);

// 3. the device clock runs a month ahead: the hourly look queues an automatic tombstone, the rules refuse it as early, the job waits a day
await A.pg.evaluate(d=>{ sheetDebug.sync.clock=31*d; sheetDebug.sync.wake(); }, DAY);
await until(A.pg, id=>sheetDebug.sync.log().some(e=>e.t==='purge-early' && e.id===id), id1);
const st3=await A.pg.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return {tomb:!!(st.job && st.job.tomb && st.job.auto), wait:st.job? st.job.wait : null, tr:!!st.tr, note:!!st.note}; }, id1), d3=await readDoc(ROOT+'/notes/'+id1), a3=await acc(A.pg);
ok('3 the tombstone was refused as early: the job waits a day, no attempt stays, the note is still in the trash here and in the cloud; the status is not «sending»', st3.tomb && st3.wait>Date.now()+31*DAY && !st3.tr && st3.note && !d3.purged && d3.deleted>0 && a3.ui.code==='synced');

// 4. the month passes on the server (the date is moved back past the rules) and the day on the device: the tombstone passes, the note leaves the device
await seed(ROOT+'/notes/'+id1, {...d3, tsrv:Ts.ms(Date.now()-31*DAY)});
await A.pg.evaluate(d=>{ sheetDebug.sync.clock=33*d; sheetDebug.sync.wake(); }, DAY);
const d4=await docUntil(ROOT+'/notes/'+id1, d=>!!d && d.purged>0); await until(A.pg, async id=>!(await sheetDebug.sync.state(id)).note, id1); await untilUI(A.pg, 'synced');
const st4=await A.pg.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return {note:!!st.note, job:!!st.job, purged:!!st.purged}; }, id1);
ok('4 the tombstone is in the cloud (purged, no body) and the note is gone from the device; the second note stays', d4.purged>0 && d4.auto===true && !d4.blocks && !st4.note && !st4.job && st4.purged && !!(await readDoc(ROOT+'/notes/'+id2)) && !!(await A.pg.evaluate(async id=>(await sheetDebug.sync.state(id)).note, id2)));
ok('5 no request went to a real Google host ('+A.blocked.length+' blocked)', !A.blocked.length); if(A.blocked.length) console.log(A.blocked);
ok('6 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
