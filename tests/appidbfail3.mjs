// IndexedDB that exists but does not open (docs/IDB-FALLBACK-PLAN.md), part 3 of 3: other tabs and devices (the shared setup is
// tests/lib/idbfail.mjs). A locked tab follows a writing tab read-only; no reload under a share sheet; an owner change in another tab leaves the
// locked view as it is; the tab's own note survives the recovery; one probe at a time whatever the visibility does, one reload after a long
// dialog; a reload count that cannot be kept counts as spent.
import { ready, until } from './lib/wait.mjs';
import { setup, SHARE, LOCKED, BACK, has, flat } from './lib/idbfail.mjs';
const { SITE, ok, context, fresh, go, roMsg, lockMsg, setMode, opens, resetOpens, settings, items, sheetText, reloads, navWait, reload, typeAt, dbNotes,
  hangSuccess, download, start, device, finish }=await setup('3');

const ctx=await context(); const pg=await fresh(ctx); await start(pg);   // the device with the marker and «перша нотатка» (step 1 of appidbfail)

/* ── 9. two tabs: one locked (its own open fails), the other writes; the locked one follows read-only ── */
{ const c=await device(); const a=await fresh(c), b=await fresh(c);
  await go(a,SITE+'blank.html'); await a.evaluate(()=>sessionStorage.setItem('__idbfail','error')); await go(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  await go(b); await ready(b); await typeAt(b,900,300,'від другої вкладки'); await b.waitForTimeout(600);   // a free cell of the sheet
  ok('9 tab B is not locked and writes', !(await roMsg(b)) && has((await dbNotes(b))||[],/від другої вкладки/));
  await a.bringToFront(); await a.waitForTimeout(300);
  ok('9a the locked tab A shows B\'s note read-only after the put message ('+flat((await items(a)).join(' | '))+')', (await items(a)).some(t=>/від другої вкладки/.test(t)) && await a.evaluate(()=>document.getElementById('sheet').inert) && LOCKED.test(await roMsg(a)));
  await c.close(); }

/* ── 14. an export in flight (the share sheet on a touch device): no reload under it ── */
{ const c3=await context({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); await c3.addInitScript(SHARE); const q=await fresh(c3);
  await go(q); await ready(q); await typeAt(q,200,300,'на телефоні');
  await setMode(q,'error'); await reload(q); await lockMsg(q, LOCKED, 15000); await ready(q);
  await q.locator('#roExport').click(); const shared=await until(()=>q.evaluate(()=>!!window.__idbshare), 3000);
  await setMode(q,'');
  ok('14 «Експорт» opened the share sheet; the storage back, no reload for 8 s under it', shared && !(await navWait(q,8000)));
  const nav=navWait(q,4000); await q.evaluate(()=>window.__idbshare.res());
  ok('14a the share done: the reload follows within the 2 s recheck', await nav); await ready(q);
  ok('14b a healthy start on the phone', !(await roMsg(q)) && /на телефоні/.test((await items(q))[0]||''));
  await c3.close(); }

/* ── 15. an owner change in another tab: the locked view stays the old owner's, no note of the new owner comes in ── */
async function ownerRun(msg, tag){ const c=await device(); const a=await fresh(c), b=await fresh(c); const T=Date.now();
  await go(a,SITE+'blank.html'); await a.evaluate(T=>{ sessionStorage.setItem('__idbfail','error'); localStorage.setItem('sheet:note:z~tabq~1', JSON.stringify({id:'z',title:'Копія власника А',blocks:[{id:'c',fx:0.1,row:2,text:'лишилося від А'}],created:T-9e5,updated:T-100})); }, T);
  await go(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  await go(b,SITE+'blank.html'); await b.evaluate(m=>{ const c=new BroadcastChannel('sheet:notes'); c.postMessage(m); c.postMessage({t:'put', n:{id:'nB1',title:'Нотатка власника Б',blocks:[{id:'d',fx:0.1,row:2,text:'від нового власника'}],created:Date.now(),updated:Date.now()}}); c.close(); }, msg);
  await a.bringToFront(); await a.waitForTimeout(600); const li=await items(a);
  const data=await download(a, ()=>a.locator('#roExport').click());
  ok('15 '+tag+': the locked tab takes nothing of the new owner; its list and export hold only its own copy ('+flat(li.join(' | '))+'; export '+data.notes.length+')', li.length===1 && /Копія власника А/.test(li[0]) && data.notes.length===1 && has(data.notes,/лишилося від А/) && LOCKED.test(await roMsg(a)));
  await c.close(); }
await ownerRun({t:'owner', by:'account', erase:true}, 'erase'); await ownerRun({t:'owner', by:'account'}, 'binding');

/* ── 16. the tab's own note across the recovery: not replaced by the temporary in-memory note ── */
{ const c=await device(); const a=await fresh(c), b=await fresh(c);
  await go(a); await ready(a); await a.locator('#newBtn').click(); await typeAt(a,500,300,'нотатка Ікс'); const X=await a.evaluate(()=>sessionStorage.getItem('sheet:tab-current'));
  await go(b); await ready(b); await b.locator('#newBtn').click(); await typeAt(b,500,300,'нотатка Ігрек'); await b.waitForTimeout(300);
  ok('16 S.current is the other tab\'s choice', (await settings(b)).current!==X && !!X);
  await a.bringToFront(); await a.evaluate(()=>sessionStorage.setItem('__idbfail','error')); await reload(a); await lockMsg(a, LOCKED, 15000); await ready(a);
  ok('16a locked: the in-memory note is shown, the tab still remembers its own note', /Без назви/.test((await items(a))[0]||'') && (await a.evaluate(()=>sessionStorage.getItem('sheet:tab-current')))===X);
  await a.evaluate(()=>sessionStorage.removeItem('__idbfail')); const nav=navWait(a,10000);
  ok('16b the recovery reloads the tab', await nav); await ready(a); await a.waitForTimeout(300);
  ok('16c and it shows its own note X, not the other tab\'s Y', /нотатка Ікс/.test(await sheetText(a)) && !/нотатка Ігрек/.test(await sheetText(a)));
  await c.close(); }

/* ── 17. one probe at a time, one reload: visibility changes during an unanswered probe, a dialog longer than several probe intervals ── */
{ await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await setMode(pg,'hang'); await resetOpens(pg);
  const first=await until(async()=>(await opens(pg)).length===1, 7000);
  await pg.evaluate(()=>{ Object.defineProperty(document,'hidden',{get:()=>!!window.__hid, configurable:true}); for(let i=0;i<3;i++){ window.__hid=true; document.dispatchEvent(new Event('visibilitychange')); window.__hid=false; document.dispatchEvent(new Event('visibilitychange')); } });
  await pg.waitForTimeout(500);
  ok('17 hidden → visible three times during an unanswered probe: still one open', first && (await opens(pg)).length===1);
  await pg.evaluate(()=>{ delete document.hidden; }); await setMode(pg,''); const nav=navWait(pg,5000); await hangSuccess(pg); await nav; await ready(pg);
  // the dialog: one successful probe, then nothing until it closes; the reload counted once
  await setMode(pg,'error'); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  await pg.evaluate(()=>document.getElementById('ask').showModal()); await setMode(pg,''); await resetOpens(pg);
  const probed=await until(async()=>(await opens(pg)).length===1, 7000); await pg.waitForTimeout(12000);
  await pg.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); }); await pg.waitForTimeout(300);
  ok('17a under the dialog one probe succeeded and no more follow in 12 s, a visibility change included ('+(await opens(pg)).length+')', probed && (await opens(pg)).length===1 && LOCKED.test(await roMsg(pg)));
  await setMode(pg,'error'); const nav2=navWait(pg,4000); await pg.evaluate(()=>document.getElementById('ask').close());
  ok('17b the dialog closed: one reload', await nav2); await lockMsg(pg, LOCKED, 15000); await ready(pg);
  ok('17c the counter moved by one, not once per answer ('+await reloads(pg)+')', (await reloads(pg))==='1');
  await setMode(pg,''); await pg.locator('#roReload').click(); await ready(pg); }

/* ── 19. a reload count that cannot be kept (sessionStorage refuses the write) counts as spent: the strip asks, no reload without a limit ── */
{ const c=await context(); await c.addInitScript(()=>{ const set=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='sheet:idb-reloads' && localStorage.getItem('__ssfail')) throw new DOMException('full','QuotaExceededError'); return set.call(this,k,v); }; });
  const p=await fresh(c); await go(p); await ready(p);
  await p.evaluate(()=>localStorage.setItem('__ssfail','1')); await setMode(p,'error'); await reload(p); await lockMsg(p, LOCKED, 15000); await ready(p);
  const nav=navWait(p,12000); await p.evaluate(()=>sessionStorage.setItem('__idbpass','1'));
  const m=await lockMsg(p, BACK, 12000), went=await nav;
  ok('19 sessionStorage refuses the count: no automatic reload, the strip asks for the tap ('+(m||'').slice(0,40)+'…)', !went && BACK.test(m||'') && (await reloads(p))===null);
  await c.close(); }

/* ── 10. no page errors over the run ── */
await finish(ctx);
