// «Прибрати й увійти» whose erase commits and whose adopting load then fails (#146): the screen of the erased notes must not stay editable, or a
// save of them would bring A's note back under B and into B's cloud. The page reloads as after a successful erase, and the core refuses the
// user's writes meanwhile (tests/syncguard.mjs 5s7). Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/erasefail.mjs"
import { launch, device, acc, signIn, signOut, choose, untilUI, until } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc } from './lib/emu.mjs';
import { typeAt, stored } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
async function untilSafe(pg, fn, arg, timeout=20000){ const t0=Date.now(); for(;;){ try{ if(await pg.evaluate(fn, arg)) return true; }catch(_){} if(Date.now()-t0>timeout) return false; await pg.waitForTimeout(150); } }

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), u2=await googleUser('sub-two','two@example.com'), C1=credential('sub-one','one@example.com'), C2=credential('sub-two','two@example.com');
const R2='env/dev/users/'+u2.uid;
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
ok('3 no request went to a real Google host ('+A.blocked.length+' blocked)', !A.blocked.length);
ok('4 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
