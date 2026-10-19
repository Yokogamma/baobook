// The sign-in by redirect (SYNC-PLAN 4.12): on a touch device or in the installed app the page itself goes to the sign-in and comes back.
// Before leaving, everything typed is written and the settings carry `signin:'pending'`, so the start after the return loads the SDK and
// finishes the sign-in (getRedirectResult); the tab that left is the one that asks first should the owner differ. The Auth emulator serves
// the sign-in page itself. The return, though, needs Google's gapi script (apis.google.com) for the SDK's iframe, which this scenario refuses
// like every other Google host: so the way out and the failed way back are checked here, and the successful return on a real device, by hand
// (docs/SYNC-CHECKLIST.md). Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/redirect.mjs"
import { launch, device, acc, press, loc, settings, menu, until, noteText } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, AUTH } from './lib/emu.mjs';
import { typeAt } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com');
await loadRules(rulesFor(u1.uid));
const env=await launch(); const A=await device(env,'A');
await A.pg.evaluate(()=>{ sheetDebug.sync.signInHow='redirect'; });   // the app decides by (hover:none) and the display mode; the test names the way
await typeAt(A.pg, 500, 300, 'Перед редиректом'); const id1=await A.pg.evaluate(()=>sheetDebug.cur());

// 1. one press: the SDK loads, what is typed is written, the sign-in is marked as pending and the page leaves for the sign-in page (no second press on a phone)
await A.pg.locator('#sheet .blk').last().locator('[contenteditable="true"]').click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' і ще');   // typed and not yet written when the press comes
const leaving=A.pg.waitForURL(u=>u.href.startsWith(AUTH+'/emulator/auth/handler'), {timeout:20000}); await A.pg.evaluate(()=>{ sheetDebug.sync.press(); }); await leaving;
const handler=A.pg.url();
ok('1 the one press loaded the SDK and took the page to the emulator\'s sign-in handler for Google ('+handler.slice(0,60)+'…)', handler.startsWith(AUTH+'/emulator/auth/handler') && /providerId=google\.com/.test(handler));
await A.pg.waitForTimeout(300); const offers=await A.pg.evaluate(()=>[...document.querySelectorAll('button, [role=button], li')].map(e=>e.textContent.trim().replace(/\s+/g,' ')).filter(Boolean));
ok('1b the emulator\'s page offers the account made over REST', offers.some(t=>t.includes('one@example.com')));

// 2. the account is picked; the app comes back with the pending mark, loads the SDK at start and asks for the result, which needs Google's gapi
// script the scenario refuses: the sign-in fails with its reason, the mark is cleared, the tab knows it is the one that left, nothing typed is lost
const back=A.pg.waitForURL(u=>u.href.startsWith(env.SITE), {timeout:15000}); await A.pg.locator('text=one@example.com').first().click(); await back;
await until(A.pg, ()=>!!window.sheetDebug && !!sheetDebug.sync.account().sdk && !sheetDebug.sync.account().loading && !sheetDebug.sync.account().signingIn);
await until(A.pg, ()=>document.getElementById('toast').textContent.length>0);
const a2=await acc(A.pg), s2=await settings(A.pg), m2=await menu(A.pg), toast=await A.pg.evaluate(()=>document.getElementById('toast').textContent);
ok('2 back from the redirect: the SDK loaded at start (the mark), the result was asked and failed («'+toast+'»), the mark is cleared, the tab counts as the one that signed in, no user and no owner yet',
  a2.sdk && !a2.user && !a2.owner && s2.signin===null && a2.signedHere && toast===await loc(A.pg,'account.signInFailed',{reason:'auth/internal-error'}) && m2.signIn && m2.lbl===await loc(A.pg,'account.continue') && a2.ui.code==='none');
const t2=await noteText(A.pg, id1); ok('2b the text typed right before the press was written before leaving («'+t2+'»)', t2==='Перед редиректом і ще');
ok('3 the one request that left for a Google host is the gapi script of the redirect result ('+A.blocked.length+' blocked)', A.blocked.length===1 && /^https:\/\/apis\.google\.com\/js\/api\.js/.test(A.blocked[0])); if(A.blocked.length!==1) console.log(A.blocked);
ok('4 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
