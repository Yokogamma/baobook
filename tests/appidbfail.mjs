// IndexedDB that exists but does not open (docs/IDB-FALLBACK-PLAN.md), part 1 of 3 (the shared setup is tests/lib/idbfail.mjs; the recovery is in
// appidbfail2, the other tabs and devices in appidbfail3). On a device where it has worked before (sheet:settings.idbOk, or the legacy versSwept)
// a failed open is retried (300 and 900 ms after an `error` or a throw), a silent open is abandoned after 8 s with no retry behind it, and when
// every attempt fails the tab is view-only under the `storage` lock: the strip says why, with «Експорт» and «Оновити»; no note is written anywhere
// (no sheet:note: key, no empty «Без назви» stored); the storage line says the device's notes were not read; the account UI is off. A hung
// request's own late answer reloads the page. A device that never had IndexedDB keeps the localStorage mode. A versionless open queued behind a
// blocked upgrade in the browser's real connection queue is silent too, and answered once the upgrade is released.
import { ready, until } from './lib/wait.mjs';
import { setup, OPENING, LOCKED, has } from './lib/idbfail.mjs';
const { SITE, ok, shot, external, context, fresh, go, roMsg, lockMsg, setMode, opens, resetOpens, settings, fbKeys, items, sheetText, storLine, buttons,
  reloads, navWait, reload, typeAt, dbNotes, hangSuccess, hangError, download, device, finish }=await setup('');

const ctx=await context(); const pg=await fresh(ctx);

/* ── 1. a normal start on a new device: the note is in IndexedDB, idbOk is written, the account UI is real ── */
await go(pg); await ready(pg);
await typeAt(pg,500,300,'перша нотатка');
{ const s=await settings(pg), n=await dbNotes(pg);
  ok('1 the first start writes idbOk ('+typeof s.idbOk+') and the note is in IndexedDB', typeof s.idbOk==='number' && s.idbOk>0 && has(n||[],/перша нотатка/) && !(await fbKeys(pg)).length);
  ok('1b the account UI is on: «Увійти через Google» in the menu', !(await pg.evaluate(()=>document.getElementById('signInBtn').hidden)) && /Увійти через Google/.test(await pg.locator('#signInLbl').innerText())); }

/* ── 2–4. every open fails (error / throw), then the mode is cleared, then it fails once ── */
async function failRun(mode){
  await setMode(pg, mode); await resetOpens(pg); external.length=0; await reload(pg);
  const m=await lockMsg(pg, LOCKED, 15000); await ready(pg); await shot(pg,'2-'+mode);
  const o=await opens(pg), b=await buttons(pg), li=await items(pg), st=await storLine(pg);
  ok('2 '+mode+': the strip says the storage did not open ('+(m||await roMsg(pg)).slice(0,40)+'…)', LOCKED.test(m||''));
  ok('2a '+mode+': three attempts, the gaps ≥ 250 and ≥ 800 ms ('+o.length+': '+o.slice(1).map((t,i)=>t-o[i]).join(', ')+')', o.length>=3 && o[1]-o[0]>=250 && o[2]-o[1]>=800);
  ok('2b '+mode+': «Експорт» and «Оновити» on the strip, the trash buttons hidden ('+JSON.stringify(b)+')', b.roExport && b.roReload && !b.roRestore && !b.roPurge && /^Експорт$/.test((await pg.locator('#roExport').innerText()).trim()));
  ok('2c '+mode+': the sheet is inert, the list shows one «Без назви»', await pg.evaluate(()=>document.getElementById('sheet').inert && document.getElementById('ttl').contentEditable==='false') && li.length===1 && /Без назви/.test(li[0]));
  ok('2d '+mode+': the storage line says the device\'s notes were not read, with no count and no «(резервне сховище)» ('+st+')', /^Сховище браузера не відкрилося, нотатки пристрою не прочитані · експорт:/.test(st) && !/нотат(ка|ки|ок) на цьому/.test(st) && !/резервне сховище/.test(st));
  const ext=external.filter(u=>!/fonts\.(googleapis|gstatic)\.com/.test(u));   // the font stylesheet is a static link of the page, not the account
  ok('2e '+mode+': the account UI is off and no request left for a Google host ('+ext.join(', ')+')', await pg.evaluate(()=>document.getElementById('signInBtn').hidden && document.getElementById('accHr').hidden && document.getElementById('syncBtn').hidden) && !ext.length);
  await pg.mouse.click(500,400); await pg.keyboard.type('нічого'); await pg.locator('#newBtn').click(); await pg.waitForTimeout(400);
  ok('2f '+mode+': typing and «Нова» change nothing, the toast says view-only', !(await pg.locator('#sheet .blk').count()) && (await items(pg)).length===1 && /Зараз лише перегляд/.test(await pg.locator('#toast').innerText()));
  ok('2g '+mode+': no sheet:note: key in localStorage', !(await fbKeys(pg)).length);
  // 3. the mode cleared and the page reloaded from the same evaluate (the probe, due 5 s after the lock, cannot pre-empt it)
  await reload(pg,'clear'); await ready(pg); await pg.waitForTimeout(300);
  const li3=await items(pg);
  ok('3 '+mode+': a normal start again shows exactly the typed note, no «Без назви», no strip, no fallback mark', li3.length===1 && /перша нотатка/.test(li3[0]) && !(await roMsg(pg)) && !/резервне/.test(await storLine(pg)) && (await dbNotes(pg)).length===1);
  // 4. one failure, then the retry succeeds
  await setMode(pg, 'once'); await resetOpens(pg); await reload(pg); await ready(pg); await pg.waitForTimeout(300);
  const o4=await opens(pg);
  ok('4 '+mode+': after one failure the retry opens the database: 2 attempts, no strip, the note shows ('+o4.length+')', o4.length===2 && !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||''));
  await typeAt(pg,500,mode==='error'? 500 : 650,'правка після повтору '+mode);   // a place on the sheet with no block yet
  ok('4a '+mode+': an edit is saved into IndexedDB', has((await dbNotes(pg))||[], new RegExp('правка після повтору '+mode)) && !(await fbKeys(pg)).length); }
await failRun('error'); await failRun('throw');

/* ── 5. a request that never answers: the waiting strip after 1 s, the lock after 8 s with one attempt, no probe; its late success reloads ── */
await setMode(pg,'hang'); await resetOpens(pg); await reload(pg);
{ const m1=await lockMsg(pg, OPENING, 3000); const b1=await buttons(pg);
  ok('5 within ~2 s the strip says the storage is opening, every button hidden ('+JSON.stringify(b1)+')', OPENING.test(m1||'') && !b1.roRestore && !b1.roPurge && !b1.roExport && !b1.roReload);
  const m2=await lockMsg(pg, LOCKED, 12000); await ready(pg); await shot(pg,'5-hang');
  ok('5a the lock within 12 s with exactly one attempt (no retry behind a silent request) ('+(await opens(pg)).length+')', LOCKED.test(m2||'') && (await opens(pg)).length===1);
  await pg.waitForTimeout(12000);
  ok('5b no probe follows a silent attempt: the count stays 1 after 12 s', (await opens(pg)).length===1);
  await setMode(pg,''); const nav=navWait(pg,5000); ok('5c the hung request answered with a real connection', await hangSuccess(pg));
  ok('5d the dead attempt\'s late success closes it and reloads the page by itself', await nav); await ready(pg);
  ok('5e the reload landed in a healthy start: editable, the note there, the reload count cleared', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'') && (await reloads(pg))===null); }

/* ── 6. the lock with copies in localStorage: shown read-only, exported, left byte for byte ── */
{ const T=Date.now(); await pg.evaluate(T=>{ localStorage.setItem('__idbfail','error');
    localStorage.setItem('sheet:note:x~tabq~1', JSON.stringify({id:'x',title:'Резервна копія',blocks:[{id:'a',fx:0.1,row:2,text:'з резервного ключа'}],created:T-9e5,updated:T-100}));
    localStorage.setItem('sheet:note:y', JSON.stringify({id:'y',title:'Плоский ключ',blocks:[{id:'b',fx:0.1,row:2,text:'з плоского ключа'}],created:T-9e5,updated:T-200})); }, T);
  const before=await fbKeys(pg); await reload(pg); await lockMsg(pg, LOCKED, 15000); await ready(pg); await shot(pg,'6-copies');
  const li=await items(pg);
  ok('6 both copies show as notes ('+li.length+')', li.length===2 && li.some(t=>/Резервна копія/.test(t)) && li.some(t=>/Плоский ключ/.test(t)));
  await pg.locator('#list .item').filter({hasText:'Плоский ключ'}).click(); await pg.waitForTimeout(200);
  ok('6a a copy opens read-only', /з плоского ключа/.test(await sheetText(pg)) && await pg.evaluate(()=>document.getElementById('sheet').inert));
  const data=await download(pg, ()=>pg.locator('#roExport').click());
  ok('6b «Експорт» on the strip carries both and no history', data.notes.length===2 && has(data.notes,/з резервного ключа/) && has(data.notes,/з плоского ключа/) && !data.history);
  await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await pg.locator('#newBtn').click(); await pg.waitForTimeout(500);
  ok('6c after a tab sync and «Нова» the keys are byte for byte as seeded', JSON.stringify(await fbKeys(pg))===JSON.stringify(before));
  await pg.evaluate(()=>{ localStorage.removeItem('sheet:note:x~tabq~1'); localStorage.removeItem('sheet:note:y'); }); await setMode(pg,''); }

/* ── 8. a device that never had IndexedDB (no marker): today's localStorage mode, then the move-in and the marker ── */
{ const c2=await context(); const q=await fresh(c2); await go(q,SITE+'blank.html'); await setMode(q,'error'); await go(q); await ready(q);
  ok('8 no marker: the fallback mode, editable, «(резервне сховище)»', /резервне сховище/.test(await storLine(q)) && !(await q.evaluate(()=>document.getElementById('sheet').inert)) && !(await roMsg(q)));
  await typeAt(q,500,300,'без бази'); const k=await fbKeys(q);
  ok('8a the note goes to a plain sheet:note: key', k.length===1 && !/~/.test(k[0][0]) && /без бази/.test(k[0][1]));
  await setMode(q,''); await reload(q); await ready(q); await q.waitForTimeout(500);
  ok('8b a normal start moves it in and writes idbOk', typeof (await settings(q)).idbOk==='number' && !(await fbKeys(q)).length && has((await dbNotes(q))||[],/без бази/));
  await c2.close(); }

/* ── 11. the upgrade path: a device with notes, versSwept and no idbOk (updated from the current code) locks instead of falling back ── */
{ await go(pg); await ready(pg); await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); delete s.idbOk; if(!s.versSwept) s.versSwept=Date.now(); localStorage.setItem('sheet:settings', JSON.stringify(s)); });
  await setMode(pg,'error'); await reload(pg); const m=await lockMsg(pg, LOCKED, 15000); await ready(pg);
  ok('11 versSwept alone is the marker: the storage lock, no fallback mode, no note key', LOCKED.test(m||'') && !/резервне/.test(await storLine(pg)) && !(await fbKeys(pg)).length);
  await reload(pg,'clear'); await ready(pg);
  ok('11a the next normal start writes idbOk again', typeof (await settings(pg)).idbOk==='number'); }

/* ── 12. a late error after the deadline: the queue is clear, the probing starts, the probe passes ── */
{ await setMode(pg,'hang'); await reload(pg); await lockMsg(pg, LOCKED, 12000); await ready(pg);
  await setMode(pg,''); const nav=navWait(pg,9000); await hangError(pg);
  ok('12 the hung request fails at last: the probing starts and the page reloads by itself within 9 s', await nav); await ready(pg);
  ok('12a a healthy start', !(await roMsg(pg)) && /перша нотатка/.test((await items(pg))[0]||'')); }

/* ── 18. the real connection queue: a versionless open behind a blocked upgrade is silent; released, the browser answers it and the tab reloads ── */
{ const d=await device(); const a=await fresh(d), b=await fresh(d), c=await fresh(d);
  await go(b,SITE+'blank.html'); await b.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ window.__hold=r.result; res(); }; }));   // kept open, deaf to versionchange
  await go(c,SITE+'blank.html'); await c.evaluate(()=>{ window.__c={}; const r=indexedDB.open('sheet',4); r.onblocked=()=>{ window.__c.blocked=true; }; r.onupgradeneeded=()=>{ window.__c.upgraded=true; r.transaction.abort(); }; r.onerror=()=>{ window.__c.error=(r.error||{}).name; }; r.onsuccess=()=>{ window.__c.success=true; r.result.close(); }; });
  const blocked=await until(()=>c.evaluate(()=>!!window.__c.blocked), 3000);
  await go(a); const m1=await lockMsg(a, OPENING, 3000);
  ok('18 a versionless open queued behind a blocked upgrade: the waiting strip after 1 s', blocked && OPENING.test(m1||''));
  const m2=await lockMsg(a, LOCKED, 12000); await ready(a); await a.waitForTimeout(6000);
  ok('18a the lock after 8 s with one attempt and no probe behind the silent request ('+(await opens(a)).length+')', LOCKED.test(m2||'') && (await opens(a)).length===1);
  const nav=navWait(a,6000); await b.evaluate(()=>window.__hold.close());
  const cst=await until(()=>c.evaluate(()=>window.__c.error? window.__c : null), 5000);
  ok('18b released: the upgrade ran and aborted ('+JSON.stringify(cst)+'), the queued request answered and the tab reloaded by itself', !!(cst && cst.upgraded && cst.error==='AbortError') && await nav); await ready(a);
  ok('18c a healthy start with the note', !(await roMsg(a)) && (await items(a)).some(t=>/перша нотатка/.test(t)) && (await a.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const v=r.result.version; r.result.close(); res(v); }; })))===3);
  await d.close(); }

/* ── 20. a phone (390 px): the storage strip, several lines high, covers no block of the open copy ── */
{ const c=await context({viewport:{width:390,height:844}, isMobile:true, hasTouch:true}); const p=await fresh(c); await go(p); await ready(p);
  await p.evaluate(()=>localStorage.setItem('sheet:note:lay', JSON.stringify({id:'lay', title:'Копія', blocks:[{id:'l1', row:2, fx:0.1, text:'видимий рядок копії'}], created:1, updated:Date.now()})));
  await setMode(p,'error'); await reload(p); await lockMsg(p, LOCKED, 15000); await ready(p);
  await p.locator('#list .item').filter({hasText:'Копія'}).click().catch(()=>{}); await p.waitForTimeout(400);
  const g=await p.evaluate(()=>{ const s=document.querySelector('#roStrip .rostrip').getBoundingClientRect(), b=[...document.querySelectorAll('#sheet .blk')].find(x=>/видимий рядок/.test(x.textContent)); const r=b && b.getBoundingClientRect(); return {strip:Math.round(s.bottom), block:r? Math.round(r.top) : null}; });
  await shot(p,'phone-strip');
  ok('20 the strip ends above the copy\'s first block ('+JSON.stringify(g)+')', g.block!==null && g.strip<=g.block);
  await p.evaluate(()=>localStorage.removeItem('sheet:note:lay')); await c.close(); }

/* ── 10. no page errors over the run ── */
await finish(ctx);
