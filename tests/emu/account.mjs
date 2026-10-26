// Another account on a device with notes (SYNC-PLAN 4.11): the dialog «The notes on this device belong to A», its three answers and the
// cancel, in one tab when two are open (the Web Lock `baobook-owner-dialog`: the tab that signed in asks, the other shows «in the other tab»
// and reloads after the decision), the second tab following a sign-out, and «Прибрати нотатки з пристрою». Run from tests/rules through
// the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/account.mjs"
import { launch, device, tab, acc, signIn, signOut, choose, loc, settings, menu, untilUI, until, untilNote, listed } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc } from './lib/emu.mjs';
import { typeAt, stored, locks } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
// a wait that survives a reload of the page (the context is destroyed and made anew)
async function untilSafe(pg, fn, arg, timeout=20000){ const t0=Date.now(); for(;;){ try{ if(await pg.evaluate(fn, arg)) return true; }catch(_){} if(Date.now()-t0>timeout) return false; await pg.waitForTimeout(150); } }

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), u2=await googleUser('sub-two','two@example.com'), C1=credential('sub-one','one@example.com'), C2=credential('sub-two','two@example.com');
const R1='env/dev/users/'+u1.uid, R2='env/dev/users/'+u2.uid;
await loadRules(rulesFor(u1.uid, u2.uid));
const env=await launch(); const A=await device(env,'A'); const T1=A.pg;

// 1. the device belongs to u1 with one note in the cloud
await typeAt(T1, 500, 300, 'Нотатка першого'); const id1=await T1.evaluate(()=>sheetDebug.cur());
await signIn(T1, C1); await untilUI(T1, 'synced'); const ep1=(await acc(T1)).epoch;
ok('1 device A is u1\'s, the note is in u1\'s cloud', (await stored(T1,'sync','owner')).uid===u1.uid && !!(await readDoc(R1+'/notes/'+id1)));

// 2. u2 signs in: the dialog, then the cancel takes the sign-in back
await signOut(T1); await until(T1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.signingOut; });
await signIn(T1, C2); await until(T1, ()=>!!sheetDebug.sync.choice());
const m2=await menu(T1), a2=await acc(T1);
ok('2 u2 signed in on u1\'s device: the dialog names u1 and u2, says everything is in the cloud, offers export, «Додати до хмари», «Прибрати й увійти» and the cancel; the status is «checking», the device is still u1\'s, no cloud',
  m2.choice && m2.choice.join()==='cancel,export,add,remove' && m2.choiceTitle===await loc(T1,'account.otherTitle',{a:'one@example.com'}) && m2.choiceText.startsWith(await loc(T1,'account.otherText',{b:'two@example.com', unsynced:await loc(T1,'account.unsyncedNone')})) && a2.ui.code==='checking' && a2.owner.uid===u1.uid && !a2.cloud && a2.user.uid===u2.uid);
await choose(T1, 'cancel'); await until(T1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.signingOut && !sheetDebug.sync.choice(); });
const a2b=await acc(T1), m2b=await menu(T1);
ok('2b the cancel signs u2 out: no user, the device is still u1\'s, the menu offers the sign-in and names u1', !a2b.user && a2b.owner.uid===u1.uid && a2b.epoch===ep1 && m2b.signIn && m2b.email==='one@example.com' && a2b.ui.code==='signedOut');

// 3. an edit while signed out, then u2 again: the dialog counts it; the export; «Додати до хмари»
await typeAt(T1, 500, 420, 'Дописано без входу'); await until(T1, ()=>sheetDebug.sync.jobs().length===1);
await signIn(T1, C2); await until(T1, ()=>!!sheetDebug.sync.choice());
const m3=await menu(T1);
ok('3 the dialog counts the note that is not in the cloud', m3.choiceText.includes(await loc(T1,'account.unsyncedNotes',{n:1})));
const dl=T1.waitForEvent('download',{timeout:10000}); await choose(T1, 'export'); const file=await dl; await T1.waitForTimeout(300);
const m3b=await menu(T1), toast=await T1.evaluate(()=>document.getElementById('toast').textContent);
ok('3b the export gives the file with the history and the dialog stays open ('+file.suggestedFilename()+')', /^baobook-.*\.json$/.test(file.suggestedFilename()) && m3b.choice && m3b.choice.length===4 && toast===await loc(T1,'account.exported'));
if(!m3b.choice) console.log('  dialog gone:', JSON.stringify({choice:m3b.choice, toast, acc:await acc(T1)}));
await choose(T1, 'add'); await untilUI(T1, 'synced');
const a3=await acc(T1), own3=await stored(T1,'sync','owner'), d2=await readDoc(R2+'/notes/'+id1), d1=await readDoc(R1+'/notes/'+id1);
ok('3c «Додати до хмари two@example.com»: the device is u2\'s with a new epoch, the note went into u2\'s cloud with both blocks, u1\'s copy is untouched', own3.uid===u2.uid && own3.email==='two@example.com' && a3.epoch!==ep1 && a3.cloud && a3.cloudUid===u2.uid && d2 && d2.blocks.length===2 && d2.blocks[1].text==='Дописано без входу' && d1.rev===1 && d1.blocks.length===1);

// 4. a second tab of the same device: Firebase remembers u2 there, the owner is the same, it waits behind the leader and mirrors its status
const T2=await tab(A, env); await untilUI(T2, 'synced');
const a4=await acc(T2), m4=await menu(T2), lk4=await locks(T2);
ok('4 the second tab signed in on its own (the SDK at start, the user remembered), connected and waits in the queue; the status mirrors the leader', a4.user && a4.user.uid===u2.uid && a4.cloud && !a4.lead && m4.email==='two@example.com' && m4.st==='synced' && lk4.held.includes('baobook-sync:dev') && lk4.pending.includes('baobook-sync:dev'));

// 5. a sign-out in the second tab reaches the first: the leader stops, the lock goes, both are signed out
await signOut(T2); await until(T1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.cloud && !a.lead; }); await T1.waitForTimeout(200);
const a5=await acc(T1), a5b=await acc(T2), lk5=await locks(T1), s5=await settings(T1);
ok('5 after the sign-out in tab 2, tab 1 (the leader) let the cloud and the lock go; the mirror is cleared; the owner stays u2', !a5.user && !a5.cloud && !a5.lead && !a5b.user && !a5b.cloud && !lk5.held.includes('baobook-sync:dev') && s5.fbUser===null && a5.owner.uid===u2.uid && a5.ui.code==='signedOut' && a5b.ui.code==='signedOut');

// 6. u1 signs in in tab 1 and decides «Додати до хмари» at once, while tab 2 still waits its 1.5 s before asking: tab 2 must not show the stale
// question about u2 afterwards; it adopts u1 and connects
await signIn(T1, C1); await until(T1, ()=>!!sheetDebug.sync.choice()); await choose(T1, 'add'); await untilUI(T1, 'synced'); await T1.waitForTimeout(2500);
let d6=null; for(let i=0;i<60;i++){ d6=await readDoc(R1+'/notes/'+id1); if(d6 && d6.rev>=2) break; await T1.waitForTimeout(250); }
if(!(d6 && d6.rev>=2)) console.log('  T1 engine:', JSON.stringify(await T1.evaluate(async id=>({local:(await sheetDebug.sync.state(id)).note.blocks.map(b=>b.text), meta:(await sheetDebug.sync.state(id)).meta, jobs:sheetDebug.sync.jobs(), status:sheetDebug.sync.status, log:sheetDebug.sync.log().slice(-25)}), id1)), JSON.stringify({u1:d6? {rev:d6.rev, dev:d6.dev, rcpt:d6.rcpt, blocks:d6.blocks.map(b=>b.text)} : null, u2:await readDoc(R2+'/notes/'+id1).then(d=>d? {rev:d.rev, blocks:d.blocks.map(b=>b.text)} : null)}));
const a6=await acc(T2), m6=await menu(T2);
ok('6 after the fast «add» in tab 1, tab 2 shows no dialog, is u1\'s with the user u1, connected behind the leader; the note with both blocks went into u1\'s cloud', !m6.choice && !a6.dialog && !a6.otherTab && a6.owner && a6.owner.uid===u1.uid && a6.user && a6.user.uid===u1.uid && a6.cloud && !a6.lead && m6.st==='synced' && d6 && d6.blocks.length===2);
if(!(d6 && d6.blocks.length===2 && a6.cloud && m6.st==='synced')) console.log('  ', JSON.stringify({a6, m6:{choice:m6.choice, st:m6.st, title:m6.title}, d6:d6? {rev:d6.rev, blocks:d6.blocks.map(b=>b.text)} : null}));

// 7. both signed out; tab 2 holds an edit the storage refused (unsaved); u2 signs in in tab 1: the dialog there, «in the other tab» in tab 2;
// «Прибрати й увійти» erases the device and reloads tab 1, while tab 2 keeps its screen view-only with the unsaved text and the export
await signOut(T2); await until(T1, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.cloud && !a.lead; }); await until(T2, ()=>!sheetDebug.sync.account().user);
await T2.evaluate(()=>{ sheetDebug.failSave=true; }); await typeAt(T2, 500, 540, 'Незаписане'); await until(T2, ()=>sheetDebug.sync.unsavedCount()===1);
await signIn(T1, C2); await until(T1, ()=>!!sheetDebug.sync.choice()); await untilUI(T2, 'other');
const a7=await acc(T2), m7=await menu(T2);
ok('7 tab 1 asks (it signed in), tab 2 shows «another account — choose in the other tab» and no dialog', a7.otherTab && !a7.cloud && m7.title===await loc(T2,'sync.st.other') && !m7.choice && a7.user.uid===u2.uid);
await choose(T1, 'remove');
ok('7b tab 1 reloads as u2\'s device and u2\'s notes come down from the cloud',
  await untilSafe(T1, id=>{ const a=sheetDebug.sync.account(); return !!a.owner && !!a.user && a.owner.uid===a.user.uid && a.ui && a.ui.code==='synced' && !!document.querySelector('#list .item[data-id="'+id+'"]'); }, id1)
  && (await stored(T1,'sync','owner')).uid===u2.uid && (await acc(T1)).epoch!==ep1);
await T2.waitForTimeout(1500); const l7=await T2.evaluate(id=>({lock:sheetDebug.sync.locked(), unsaved:sheetDebug.sync.unsavedCount(), msg:document.getElementById('roMsg').textContent, listed:!!document.querySelector('#list .item[data-id="'+id+'"]'), dying:sheetDebug.sync.account().dying}), id1);
ok('7c tab 2 did not reload over its unsaved text: view-only as «epoch» with the old screen, the text under the unsaved warning, «'+l7.msg+'»', l7.lock==='epoch' && l7.unsaved===1 && !l7.dying && l7.listed && l7.msg===await loc(T2,'lock.epoch'));
const dl7=T2.waitForEvent('download',{timeout:10000}); await T2.evaluate(()=>{ document.getElementById('exportBtn').click(); }); const f7=await dl7;
ok('7d the export still works there ('+f7.suggestedFilename()+')', /^baobook-.*\.json$/.test(f7.suggestedFilename()));
await T2.evaluate(()=>{ sheetDebug.failSave=false; }); await T2.reload();
ok('7e reloaded by hand, tab 2 is u2\'s device too', await untilSafe(T2, id=>{ const a=sheetDebug.sync.account(); return !!a.owner && !!a.user && a.owner.uid===a.user.uid && !!document.querySelector('#list .item[data-id="'+id+'"]'); }, id1));
const t7=await T1.evaluate(async id=>(await sheetDebug.sync.state(id)).note.blocks.map(b=>b.text).join('|'), id1);
ok('7f the note on the device is u2\'s version («'+t7+'»), u1\'s cloud copy untouched', t7==='Нотатка першого|Дописано без входу' && (await readDoc(R1+'/notes/'+id1)).blocks.length===2);
if(t7!=='Нотатка першого|Дописано без входу') console.log('  ', JSON.stringify({u2doc:(await readDoc(R2+'/notes/'+id1)).blocks.map(b=>b.text), u1doc:(await readDoc(R1+'/notes/'+id1)).blocks.map(b=>b.text)}));

// 8. «Прибрати нотатки з пристрою»: the dialog with the export, then the device is signed out, unbound and empty; the cloud keeps everything
await T1.evaluate(()=>{ sheetDebug.sync.remove(); }); await until(T1, ()=>!!sheetDebug.sync.choice());
const m8=await menu(T1);
ok('8 the dialog of «Прибрати»: the account named, everything in the cloud, export or remove', m8.choice.join()==='cancel,export,remove' && m8.choiceTitle===await loc(T1,'account.removeTitle') && m8.choiceText.startsWith(await loc(T1,'account.removeText',{a:'two@example.com', unsynced:await loc(T1,'account.unsyncedNone')})));
await choose(T1, 'remove');
ok('8b the device is new: no owner, no user, the sign-in offered, no note of u2 on it; tab 2 reloaded too (nothing unsaved there now)',
  await untilSafe(T1, id=>{ const a=sheetDebug.sync.account(); return a.sdk===false && !a.owner && !a.user && !document.querySelector('#list .item[data-id="'+id+'"]') && document.querySelectorAll('#list .item').length===1; }, id1)
  && await untilSafe(T2, id=>{ const a=sheetDebug.sync.account(); return !a.owner && !a.user && !document.querySelector('#list .item[data-id="'+id+'"]'); }, id1)
  && (await settings(T1)).fbUser===null && !(await stored(T1,'sync','owner')) && !!(await readDoc(R2+'/notes/'+id1)));
const m8b=await menu(T1);
ok('8c the menu is back to «Увійти через Google»', m8b.signIn && !m8b.row && !m8b.remove && !m8b.sync);

ok('9 no request went to a real Google host ('+A.blocked.length+' blocked)', !A.blocked.length); if(A.blocked.length) console.log(A.blocked);
ok('10 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
