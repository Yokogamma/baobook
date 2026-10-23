// IndexedDB that exists but does not open (docs/IDB-FALLBACK-PLAN.md), part 2 of 3: the recovery (the shared setup is tests/lib/idbfail.mjs). A
// background probe reloads the page by itself when the storage opens again, never under a dialog, three times per tab session and then the strip
// asks for the tap; a hung probe has no probe behind it, its late success reloads, its late error resumes the probing.
import { ready, until } from './lib/wait.mjs';
import { setup, LOCKED, BACK } from './lib/idbfail.mjs';
const { ok, shot, context, fresh, roMsg, lockMsg, setMode, opens, resetOpens, items, reloads, navWait, reload, hangSuccess, hangError, start, finish }=await setup('2');

const ctx=await context(); const pg=await fresh(ctx); await start(pg);   // the device with the marker and «перша нотатка» (step 1 of appidbfail)

/* ── 7. recovery: the probe reloads the page by itself; the lock → reload → lock loop stops at three ── */
async function recover(mode){ await setMode(pg, mode); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  const nav=navWait(pg,10000); await setMode(pg,'');   // the wait first: the probe may reload the page as soon as the mode is clear
  ok('7 '+mode+': the storage back, the page reloads by itself within 10 s', await nav); await ready(pg);
  ok('7a '+mode+': editable with the real note, sheet:idb-reloads cleared by the healthy start', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'') && (await reloads(pg))===null && !(await pg.evaluate(()=>document.getElementById('sheet').inert))); }
await recover('error'); await recover('throw');
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  const counts=[];
  for(let i=1;i<=3;i++){ const nav=navWait(pg,10000); await pg.evaluate(()=>sessionStorage.setItem('__idbpass','1')); const went=await nav;   // only the next probe passes; the reload's start fails again
    await lockMsg(pg, LOCKED, 15000); await ready(pg); counts.push((went? '' : 'no reload ')+(await reloads(pg))); }
  ok('7b three automatic reloads, each landing in the lock again, counted 1, 2, 3 ('+counts.join(', ')+')', counts.join(',')==='1,2,3');
  await pg.evaluate(()=>sessionStorage.setItem('__idbpass','1')); const m=await lockMsg(pg, BACK, 10000); const nav=navWait(pg,12000);
  ok('7c the fourth time the strip asks for the tap instead ('+(m||'').slice(0,40)+'…)', BACK.test(m||''));
  ok('7d and no reload follows in 12 s', !(await nav)); await shot(pg,'7-back');
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg);
  ok('7e «Оновити» with the storage back: editable, the counter gone', !(await roMsg(pg)) && (await reloads(pg))===null); }
/* ── 7f. no reload under an open dialog ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  await pg.evaluate(()=>document.getElementById('ask').showModal()); await setMode(pg,'');
  ok('7f the storage back under the ask dialog: no reload for 8 s', !(await navWait(pg,8000)));
  const nav=navWait(pg,4000); await pg.evaluate(()=>document.getElementById('ask').close());
  ok('7g the dialog closed: the reload follows within the 2 s recheck', await nav); await ready(pg); }

/* ── 13. a hung probe: no probe behind it; its late success reloads, its late error resumes the probing ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  const first=await until(async()=>(await opens(pg)).length===1, 7000);
  await pg.waitForTimeout(12000);
  ok('13 the first probe hangs: no further probe for 12 s ('+(await opens(pg)).length+')', first && (await opens(pg)).length===1);
  await setMode(pg,''); const nav=navWait(pg,5000); await hangSuccess(pg);
  ok('13a its late success reloads the page by itself', await nav); await ready(pg);
  await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  await until(async()=>(await opens(pg)).length===1, 7000); await pg.waitForTimeout(3500); await hangError(pg);
  const more=await until(async()=>(await opens(pg)).length>=2, 12000);
  ok('13b its late error resumes the probing: another probe within 12 s ('+(await opens(pg)).length+')', more);
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg); }

/* ── 10. no page errors over the run ── */
await finish(ctx);
