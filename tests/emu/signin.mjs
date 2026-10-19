// The sign-in (SYNC-PLAN 4.11–4.12, 4.18) through the app on the emulators: the menu before any sign-in, the first press loading the SDK, the
// sign-in binding the device to the account and sending its notes, a second device of the same account receiving them, the sign-out keeping
// the owner and the queue, a reload with the SDK loading at start, the sign-in again sending what waited. Run from tests/rules through the
// emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/signin.mjs"
import { launch, device, acc, signIn, signOut, press, loc, settings, menu, untilUI, until, untilNote, listed } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc } from './lib/emu.mjs';
import { typeAt, stored } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), C1=credential('sub-one','one@example.com'), ROOT='env/dev/users/'+u1.uid;
await loadRules(rulesFor(u1.uid));
const env=await launch(); const A=await device(env,'A');

// 1. a device with notes, before any sign-in
const a0=await acc(A.pg), m0=await menu(A.pg);
ok('1 the emulator host: the menu offers «Увійти через Google» and nothing else of the account; no status button, no SDK, no user, no owner',
  a0.fb && a0.fb.env==='dev' && a0.fb.emulator && !a0.sdk && !a0.user && !a0.owner && m0.signIn && m0.lbl===await loc(A.pg,'account.signIn') && !m0.signOut && !m0.remove && !m0.row && !m0.sync && m0.hr && a0.ui && a0.ui.code==='none');
await typeAt(A.pg, 500, 300, 'Перша нотатка'); const id1=await A.pg.evaluate(()=>sheetDebug.cur());
await typeAt(A.pg, 500, 420, 'Другий блок');

// 2. the first press loads the SDK; the next one would open the popup
await press(A.pg); await until(A.pg, ()=>sheetDebug.sync.account().sdk && !sheetDebug.sync.account().loading);
const a2=await acc(A.pg), m2=await menu(A.pg);
ok('2 the first press loads the SDK: the button says «Продовжити з Google», still no user and no owner', a2.sdk && !a2.user && !a2.owner && m2.signIn && m2.lbl===await loc(A.pg,'account.continue') && !m2.sync);

// 3. the sign-in: the access checked, the device bound, the notes sent
const uid=await signIn(A.pg, C1); await untilUI(A.pg, 'synced');
const a3=await acc(A.pg), m3=await menu(A.pg), own3=await stored(A.pg,'sync','owner'), s3=await settings(A.pg), d3=await readDoc(ROOT+'/notes/'+id1);
ok('3 signed in as u1 ('+uid+'): the device is bound to u1 in env dev, the mirror is in the settings, the cloud is connected and this tab leads', uid===u1.uid && a3.user && a3.user.uid===u1.uid && own3 && own3.uid===u1.uid && own3.env==='dev' && own3.email==='one@example.com' && s3.fbUser && s3.fbUser.uid===u1.uid && a3.cloud && a3.cloudUid===u1.uid && a3.lead && a3.probe===null);
ok('3b the note went through the rules into the emulator with both blocks', !!d3 && d3.rev===1 && d3.blocks && d3.blocks.length===2 && d3.blocks[0].text==='Перша нотатка' && d3.blocks[1].text==='Другий блок');
ok('3c the menu shows the account and «Вийти», «Прибрати…»; the status button says synced', m3.row && m3.email==='one@example.com' && m3.signOut && m3.remove && !m3.signIn && m3.sync && m3.st==='synced' && m3.title===await loc(A.pg,'sync.st.synced') && m3.state===m3.title);
const probe=await readDoc(ROOT+'/probe/'+s3.devId);
ok('3d the rules probe left nothing behind (the write was refused, as it should be)', probe===null);

// 4. a second device of the same account receives the note
const B=await device(env,'B'); await signIn(B.pg, C1); await untilUI(B.pg, 'synced'); await until(B.pg, id=>!!document.querySelector('#list .item[data-id="'+id+'"]'), id1);
const ownB=await stored(B.pg,'sync','owner');
ok('4 device B signed in as u1: bound to u1, the note came down from the cloud', ownB && ownB.uid===u1.uid && await listed(B.pg, id1) && /Перша нотатка/.test(await A.pg.evaluate(async id=>(await sheetDebug.sync.state(id)).note.blocks[0].text, id1)));

// 5. sign-out on A: the owner and the queue stay; an edit waits
await signOut(A.pg); await until(A.pg, ()=>{ const a=sheetDebug.sync.account(); return !a.user && !a.cloud && !a.signingOut; });
const a5=await acc(A.pg), m5=await menu(A.pg), s5=await settings(A.pg), own5=await stored(A.pg,'sync','owner');
ok('5 signed out: no user, no cloud, no lead, the mirror cleared; the owner stays u1, the menu offers the sign-in again and names the account the notes belong to', !a5.user && !a5.cloud && !a5.lead && s5.fbUser===null && own5 && own5.uid===u1.uid && m5.signIn && !m5.signOut && m5.remove && m5.row && m5.email==='one@example.com' && a5.ui.code==='signedOut');
await typeAt(A.pg, 500, 540, 'Поки без входу'); await until(A.pg, ()=>sheetDebug.sync.account().ui.code==='signedOut' && /1/.test(sheetDebug.sync.account().ui.text));
const m5b=await menu(A.pg), jobs5=await A.pg.evaluate(()=>sheetDebug.sync.jobs());
ok('5b the edit while signed out is queued: «Не ввійшли · 1 зміна чекає» on the status button', jobs5.length===1 && jobs5[0]===id1 && m5b.st==='off' && m5b.title===await loc(A.pg,'sync.st.signedOut',{n:1}));
const d5=await readDoc(ROOT+'/notes/'+id1);
ok('5c nothing reached the cloud meanwhile', d5.rev===1 && d5.blocks.length===2);

// 6. a reload: the SDK loads at start (the device has an owner), no user is remembered; the sign-in again sends what waited
await A.pg.reload(); await until(A.pg, ()=>{ const a=sheetDebug.sync.account(); return a.sdk && !a.loading; }); await A.pg.waitForTimeout(300);
const a6=await acc(A.pg), m6=await menu(A.pg);
ok('6 after the reload the SDK is loaded at start and no user is remembered: the sign-in button says «Продовжити з Google», the status stays signed out', a6.sdk && !a6.user && a6.owner && a6.owner.uid===u1.uid && m6.signIn && m6.lbl===await loc(A.pg,'account.continue') && a6.ui.code==='signedOut');
await signIn(A.pg, C1); await untilUI(A.pg, 'synced'); await untilNote(B.pg, id1, /Поки без входу/);
const d6=await readDoc(ROOT+'/notes/'+id1), a6b=await acc(A.pg);
ok('6b signed in again as the same owner: nothing was asked, the queued edit went up (rev 2) and device B has it', a6b.cloud && a6b.lead && d6.rev===2 && d6.blocks.length===3 && d6.blocks[2].text==='Поки без входу');

ok('7 no request went to a real Google host ('+(A.blocked.length+B.blocked.length)+' blocked)', !A.blocked.length && !B.blocked.length); if(A.blocked.length || B.blocked.length) console.log(A.blocked, B.blocked);
ok('8 no page errors', !A.errs.length && !B.errs.length); if(A.errs.length || B.errs.length) console.log(A.errs, B.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
