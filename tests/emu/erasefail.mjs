// «Прибрати й увійти» whose erase commits and whose adopting load then fails (#146): the screen of the erased notes must not stay editable, or a
// save of them would bring A's note back under B and into B's cloud. The page reloads as after a successful erase, and the core refuses the
// user's writes meanwhile (tests/syncguard.mjs 5s7). Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/erasefail.mjs"
import { launch, device, tab, acc, signIn, signOut, choose, untilUI, until } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc } from './lib/emu.mjs';
import { typeAt, stored } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
async function untilSafe(pg, fn, arg, timeout=20000){ const t0=Date.now(); for(;;){ try{ if(await pg.evaluate(fn, arg)) return true; }catch(_){} if(Date.now()-t0>timeout) return false; await pg.waitForTimeout(150); } }

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), u2=await googleUser('sub-two','two@example.com'), C1=credential('sub-one','one@example.com'), C2=credential('sub-two','two@example.com');
const R1='env/dev/users/'+u1.uid, R2='env/dev/users/'+u2.uid;
await loadRules(rulesFor(u1.uid, u2.uid));
const env=await launch(); const A=await device(env,'A'); const T1=A.pg; let navs=0; T1.on('framenavigated',f=>{ if(f===T1.mainFrame()) navs++; });

// the device is u1's with one note; u1 signs out, u2 signs in: the dialog
await typeAt(T1, 500, 300, 'Нотатка першого'); const id1=await T1.evaluate(()=>sheetDebug.cur());
await signIn(T1, C1); await untilUI(T1, 'synced');
await signOut(T1); await until(T1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.signingOut; });
await signIn(T1, C2); await until(T1, ()=>!!sheetDebug.sync.choice());
// the first read of the store after the erase commits (the adopting load: the engine names the new epoch by then) fails
await T1.evaluate(()=>{ const ep0=sheetDebug.sync.engine().epoch; let once=true; window.__failed=false;
  sheetDebug.readGate=stores=>{ if(once && stores.length===1 && stores[0]==='sync' && sheetDebug.sync.engine().epoch!==ep0){ once=false; window.__failed=true; return Promise.reject(Object.assign(new Error('load failed'),{name:'UnknownError'})); } return null; }; });
const n0=navs; await choose(T1, 'remove');
// the user goes on typing on what the screen shows, if it stays
await T1.waitForTimeout(400); try{ await typeAt(T1, 500, 420, 'Дописано після стирання'); }catch(_){}
const back=await untilSafe(T1, ()=>{ const a=sheetDebug.sync.account(); return !!a.owner && !!a.user && a.owner.uid===a.user.uid && a.ui && a.ui.code==='synced'; }, null, 30000);
await T1.waitForTimeout(1500);
const notes=await stored(T1,'notes'), doc=await readDoc(R2+'/notes/'+id1);
ok('1 the erase committed and its adopting load failed; the page reloaded ('+(navs-n0)+' navigation), the device is u2\'s and synced', navs>n0 && back && (await acc(T1)).owner.uid===u2.uid);
ok('2 u1\'s note is neither on the device nor in u2\'s cloud', !notes.some(n=>n.id===id1 || (n.blocks||[]).some(b=>/Нотатка першого/.test(b.text||''))) && !doc);

// «Додати до хмари» whose change commits and whose adopting load fails: the page reloads as u1's device, and the other tab, typing meanwhile,
// is told of a change of owner with no erase: it takes the new owner, its text is stored, nothing is locked or unsaved
const B=await device(env,'B'); const P1=B.pg; let navB=0; P1.on('framenavigated',f=>{ if(f===P1.mainFrame()) navB++; });
await typeAt(P1, 500, 300, 'Нотатка другого'); const idB=await P1.evaluate(()=>sheetDebug.cur());
await signIn(P1, C2); await untilUI(P1, 'synced'); await signOut(P1); await until(P1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.signingOut; });
const P2=await tab(B, env); await P2.waitForTimeout(500);
await signIn(P1, C1); await until(P1, ()=>!!sheetDebug.sync.choice());
await P1.evaluate(()=>{ const ep0=sheetDebug.sync.engine().epoch; let once=true;
  sheetDebug.readGate=stores=>{ if(once && stores.length===1 && stores[0]==='sync' && sheetDebug.sync.engine().epoch!==ep0){ once=false; return Promise.reject(Object.assign(new Error('load failed'),{name:'UnknownError'})); } return null; }; });
await typeAt(P2, 500, 540, 'Друга вкладка');
const nB=navB; await choose(P1, 'add');
const backB=await untilSafe(P1, ()=>{ const a=sheetDebug.sync.account(); return !!a.owner && !!a.user && a.owner.uid===a.user.uid && a.ui && a.ui.code==='synced'; }, null, 30000);
await P2.waitForTimeout(2500);
const l2=await P2.evaluate(()=>({lock:sheetDebug.sync.locked(), unsaved:sheetDebug.sync.unsavedCount()})).catch(()=>({lock:'gone'})), n2=await stored(P1,'notes');
ok('5 «Додати» committed, its load failed: tab 1 reloaded as u1\'s device and synced ('+(navB-nB)+' navigation); B\'s note went to u1\'s cloud', navB>nB && backB && (await acc(P1)).owner.uid===u1.uid && !!(await readDoc(R1+'/notes/'+idB)));
ok('6 the other tab typing meanwhile is not locked and its text is stored (lock '+l2.lock+', unsaved '+l2.unsaved+')', !l2.lock && l2.unsaved===0 && n2.some(n=>(n.blocks||[]).some(b=>/Друга вкладка/.test(b.text||''))));
ok('3 no request went to a real Google host ('+(A.blocked.length+B.blocked.length)+' blocked)', !A.blocked.length && !B.blocked.length);
ok('4 no page errors', !A.errs.length && !B.errs.length); if(A.errs.length || B.errs.length) console.log(A.errs, B.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
