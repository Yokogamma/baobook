// The account panel in the browser (docs/SYNC-PLAN.md §4.11, §4.18, PR 4c), over the shared test cloud with the account from the hook (no
// Firebase). The panel opens from the status button and from the account row of the menu; Esc and Back close it; it closes before «Прибрати
// нотатки з пристрою» opens, and Back then closes only that dialog. Its rows: the email, the status with its explanation, «Перевірено о» and
// today's budget, the counts, and for «Не синхронізовано · 1» the stuck version with its reason. «Очікую підтвердження» comes by itself 30 s
// after the held attempt first ran (the status timer, no manual status call). A new device name goes as `dn` in the next document and shows
// in the second tab, which shows the same status from the leader. Signed out, it says what waits. An account with no versions reaches
// cursor:versions.done and «Історія» does not say «версії ще завантажуються». A view-only tab opens the panel read-only. On a phone it is a
// bottom sheet at 390 and 320 wide.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, settle, typeAt, curId } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300}, USER={uid:'u1', email:'u@test'};
const cloud=new TestCloud({start:Date.now()});
const FLAG="(()=>{ try{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); if(!s.emulator){ s.emulator=true; localStorage.setItem('sheet:settings', JSON.stringify(s)); } }catch(_){} })()";
const loc=(pg, key, p)=>pg.evaluate(([k,p])=>loc(k,p), [key,p]);
const ui=pg=>pg.evaluate(()=>sheetDebug.sync.account().ui);
const untilUI=(pg, code, timeout=15000)=>pg.waitForFunction(c=>{ const a=sheetDebug.sync.account(); return !!a.ui && a.ui.code===c; }, code, {timeout});
const panel=pg=>pg.evaluate(()=>{ const d=document.getElementById('accPanel'); if(!d || !d.open) return null; const q=s=>d.querySelector(s), all=s=>[...d.querySelectorAll(s)].map(x=>x.textContent);
  return {email:(q('.accp-e')||{}).textContent||'', st:(q('.accp-st')||{}).textContent||'', kind:(q('.accp-s')||{dataset:{}}).dataset.st||'', why:all('.accp-body > .accp-why'), sub:all('.accp-sub'), counts:all('.accp-n li'), errs:all('.accp-err li'),
    acts:[...d.querySelectorAll('.accp-b button')].map(b=>b.dataset.act), name:(q('.accp-name input')||{}).value, nameField:!!q('.accp-name input'), box:d.getBoundingClientRect().toJSON()}; });
const openBtn=async pg=>{ await pg.evaluate(()=>document.getElementById('syncBtn').click()); return until(()=>panel(pg), 3000); };
const connect=(pg, o={})=>pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u1', email:'u@test'}, user:o.user, devId:'D', devName:'Device D', pace:o.pace, budgets:{reads:20000, writes:5000}}), {user:USER, pace:PACE, ...o});

const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, init:FLAG, connect:false}); await D.ctx.route('https://www.gstatic.com/**', r=>r.abort()); const pg=D.pg;
await connect(pg); await untilUI(pg, 'synced');

/* ── 1. the panel opens from the button and from the menu; Esc and Back close it ── */
{ await openBtn(pg); const p=await until(async()=>{ const x=await panel(pg); return x && x.sub.length>=3? x : null; }, 3000) || await panel(pg);   // the budget comes from the store just after the panel opens
  ok('1 the button opens the panel: the email, «Синхронізовано» with its explanation ('+(p&&p.st)+')', !!p && p.email==='u@test' && p.st===await loc(pg,'sync.st.synced') && p.kind==='synced' && p.why[0]===await loc(pg,'account.why.synced'));
  ok('1a «Перевірено о …» and today\'s budget as two lines ('+(p&&p.sub.join(' | '))+')', !!p && p.sub.some(s=>/^Перевірено о \d/.test(s)) && p.sub.some(s=>/^Читань сьогодні: \d+ із 20000$/.test(s)) && p.sub.some(s=>/^Записів сьогодні: \d+ із 5000$/.test(s)));
  ok('1b signed in: «Вийти», «Експортувати з історією» and «Прибрати»; the device name field', !!p && p.acts.join()==='signOut,export,remove' && p.name==='Device D');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); ok('1c Esc closes it', !(await panel(pg)));
  await pg.evaluate(()=>document.getElementById('accRow').click()); const p2=await until(()=>panel(pg), 3000);
  await pg.goBack(); await pg.waitForTimeout(300); ok('1d the account row of the menu opens it, and Back closes it', !!p2 && !(await panel(pg)));
  // «Прибрати нотатки з пристрою» from the panel: the panel closes first, Back then closes only that dialog
  await openBtn(pg); await pg.evaluate(()=>document.querySelector('#accPanel .accp-b button[data-act="remove"]').click()); await pg.waitForTimeout(400);
  const choice=await pg.evaluate(()=>document.getElementById('choice').open); const p3=await panel(pg); await pg.goBack(); await pg.waitForTimeout(300);
  ok('1e «Прибрати…» closes the panel before its dialog opens; Back closes only the dialog', choice && !p3 && !(await pg.evaluate(()=>document.getElementById('choice').open)) && !(await panel(pg))); }

/* ── 2. offline with N, the counts; a held attempt turns «Очікую підтвердження» by itself ── */
{ await pg.evaluate(()=>sheetDebug.sync.online(false)); await typeAt(pg,500,300,'офлайн'); await untilUI(pg,'offline'); await openBtn(pg); const p=await until(async()=>{ const q=await panel(pg); return q && q.counts.length? q : null; }, 3000);
  ok('2 offline with an edit: «Офлайн · 1 зміна чекає» and the count «1 нотатка ще не в хмарі.» ('+(p&&p.st)+' | '+(p&&p.counts.join(' | '))+')', !!p && p.st===await loc(pg,'sync.st.offline',{n:1}) && p.counts.includes(await loc(pg,'account.unsyncedNotes',{n:1})));
  await pg.evaluate(()=>sheetDebug.sync.online(true)); const SY=await loc(pg,'sync.st.synced'); const pc=await until(async()=>{ const q=await panel(pg); return q && q.st===SY && !q.counts.length? q : null; }, 8000);
  ok('2c the open panel follows the sending: «Синхронізовано» and no count left ('+JSON.stringify(await panel(pg).then(q=>q&&[q.st,q.counts]))+')', !!pc);
  await pg.keyboard.press('Escape'); await pg.evaluate(()=>sheetDebug.sync.online(false)); await pg.click('#newBtn'); await pg.waitForTimeout(300); await typeAt(pg,500,300,'ще офлайн'); await untilUI(pg,'offline');
  let rel; const hold=new Promise(r=>rel=r); cloud.fault('hold',{dev:'D', op:'txn', promise:hold}); await pg.evaluate(()=>sheetDebug.sync.online(true));
  await until(()=>pg.evaluate(()=>sheetDebug.sync.tries().length>0), 5000); const s0=(await ui(pg)).code;
  await pg.evaluate(()=>{ sheetDebug.sync.clock=31000; }); const w=await until(async()=>(await ui(pg)).code==='waiting', 5000);
  ok('2a the held attempt: «'+s0+'» at first, «Очікую підтвердження» after 30 s by the status timer alone', s0!=='waiting' && !!w && (await ui(pg)).text===await loc(pg,'sync.st.waiting'));
  rel(); await pg.evaluate(()=>{ sheetDebug.sync.clock=0; }); await settle(pg); await untilUI(pg,'synced'); }

/* ── 3. a refused version: «Не синхронізовано · 1», the row with its reason ── */
{ cloud.fault('fail',{dev:'D', op:'txn', code:'permission-denied', n:1});
  await pg.click('#histBtn'); await pg.locator('#histList .hv[data-id="now"]').waitFor(); await pg.click('#histMore'); await pg.locator('.amenu .mi',{hasText:'Зафіксувати версію…'}).click(); await pg.fill('#histName','Відмовлена'); await pg.keyboard.press('Enter');
  await pg.click('#histBtn'); const e=await until(async()=>{ await settle(pg,100); const u=await ui(pg); return u && u.code==='error'? u : null; }, 8000); const p=await openBtn(pg);
  ok('3 a refused version: «'+(e&&e.text)+'», the panel lists it with «хмара відмовила» ('+(p&&p.errs.join(' | '))+')', !!e && e.text===await loc(pg,'sync.st.error',{n:1}) && !!p && p.errs.length===1 && p.errs[0].includes(await loc(pg,'account.errVersion')) && p.errs[0].includes(await loc(pg,'account.reason.invalid')));
  // 3d: the error stays, a note is held and then goes: the status reads the same all along, the open panel still follows the queue and the use
  await pg.keyboard.press('Escape'); let rel; const hold=new Promise(r=>rel=r); cloud.fault('hold',{dev:'D', op:'txn', promise:hold});
  await pg.click('#newBtn'); await pg.waitForTimeout(300); await typeAt(pg,500,300,'поки помилка'); await until(()=>pg.evaluate(()=>sheetDebug.sync.tries().length>0), 5000);
  const ERR=await loc(pg,'sync.st.error',{n:1}), NOTE=await loc(pg,'account.unsyncedNotes',{n:1}); await openBtn(pg);
  const pre=await until(async()=>{ const x=await panel(pg); return x && x.counts.includes(NOTE)? x : null; }, 3000); const u0=await pg.evaluate(()=>sheetDebug.sync.engine().usedToday());
  rel(); let last=null; const post=await until(async()=>{ const x=await panel(pg), u=await pg.evaluate(()=>sheetDebug.sync.engine().usedToday()); last=x;
    const r=await loc(pg,'account.reads',{n:u.reads, max:20000}), w=await loc(pg,'account.writes',{n:u.writes, max:5000}); return x && !x.counts.includes(NOTE) && u.writes>u0.writes && x.sub.includes(r) && x.sub.includes(w)? x : null; }, 8000);
  ok('3d a version stays refused while a held note goes: «'+(last&&last.st)+'» all along, and the open panel drops the note\'s count and shows the new use ('+JSON.stringify(last&&[last.counts, last.sub])+')', !!pre && pre.st===ERR && !!post && post.st===ERR);
  await pg.keyboard.press('Escape');
  await pg.click('#histBtn'); await pg.locator('#histList .hv[data-id="now"]').waitFor(); await openBtn(pg); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok('3b Esc over «Історія» closes only the panel: the history stays open', !(await panel(pg)) && await pg.evaluate(()=>!document.getElementById('hist').hidden)); await pg.click('#histBtn'); }

/* ── 4. the device name goes as dn and shows in the second tab; the second tab shows the leader's status ── */
{ const T2=await newTab(D, SITE, {connect:{pace:PACE, user:USER}}); await pg.bringToFront(); await openBtn(pg);
  await pg.fill('#accPanel .accp-name input','Мій ПК'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Escape');
  await pg.click('#newBtn'); await pg.waitForTimeout(300); await typeAt(pg,500,300,'з новою назвою'); const id=await curId(pg); const dn=await until(async()=>{ await settle(pg,100); const d=cloud.doc('notes',id); return d && d.dn==='Мій ПК'? d.dn : null; }, 8000);
  ok('4 a new device name goes as dn in the next document', dn==='Мій ПК');
  await T2.bringToFront(); await T2.evaluate(()=>document.getElementById('syncBtn').click()); const q=await until(async()=>{ const x=await panel(T2); return x && x.name==='Мій ПК'? x : null; }, 5000) || await panel(T2); const lead=await ui(pg);   // the «dev» message may come after the panel opened: it draws the name again
  ok('4a the second tab\'s panel shows the new name and the leader\'s status ('+(q&&q.st)+' / '+(lead&&lead.text)+')', !!q && q.name==='Мій ПК' && q.st===lead.text); const max=(await T2.evaluate(()=>sheetDebug.sync.engine().limits())).reads; let last=null; const lu=await until(async()=>{ const u=await pg.evaluate(()=>sheetDebug.sync.engine().usedToday()), x=await panel(T2); last=x; const want=await loc(T2,'account.reads',{n:u.reads, max}); return u.reads>0 && x && x.sub.includes(want)? want : null; }, 5000);
  ok('4b the second tab\'s panel shows today\'s use the leader counted, read from the store ('+(last&&last.sub.join(' | '))+')', !!lu);
  await T2.keyboard.press('Escape'); await T2.close(); await pg.bringToFront(); }

/* ── 5. «Історія» of an account with no versions: done, no «версії ще завантажуються» ── */
{ const E=await newDevice(br, new TestCloud({start:Date.now()}), SITE, 'E', {ctx:CTX, init:FLAG, connect:false}); await E.ctx.route('https://www.gstatic.com/**', r=>r.abort());
  await E.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u9', email:'e@test'}, user:{uid:'u9', email:'e@test'}, devId:'E', pace:o}), PACE); await untilUI(E.pg,'synced');
  await typeAt(E.pg,500,300,'без версій'); await settle(E.pg); await E.pg.click('#histBtn'); await E.pg.locator('#histList .hv[data-id="now"]').waitFor(); await E.pg.waitForTimeout(200);
  const done=await E.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction('sync','readonly').objectStore('sync').get('cursor:versions'); q.onsuccess=()=>{ res(!!(q.result||{}).done); r.result.close(); }; }; }));
  ok('5 an account with no versions at all reaches cursor:versions.done; «Історія» says nothing of loading', done && !(await E.pg.evaluate(()=>{ const e=document.querySelector('#histList .hv-note'); return !!e && !e.hidden; })));
  await E.pg.evaluate(()=>sheetDebug.sync.online(false)); await E.pg.evaluate(()=>sheetDebug.sync.online(true)); const seen=[]; for(let i=0;i<10;i++){ seen.push((await ui(E.pg)).code); await E.pg.waitForTimeout(100); }
  ok('5a a reconnect after that never shows «Отримую версії…» ('+[...new Set(seen)].join(',')+')', !seen.includes('versions')); await E.close(); }

/* ── 5b. «Історія» open while the first versions catch-up runs: the line goes by itself when it ends, also with no document ── */
{ const F=await newDevice(br, new TestCloud({start:Date.now()}), SITE, 'F', {ctx:CTX, init:FLAG, connect:false}); await F.ctx.route('https://www.gstatic.com/**', r=>r.abort());
  await F.pg.evaluate(()=>{ const c=window.__cloud, pg=c.page.bind(c); window.__vhold=new Promise(r=>{ window.__vrel=r; }); c.page=(col,q,n)=>col==='versions'? window.__vhold.then(()=>pg(col,q,n)) : pg(col,q,n); });
  await F.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u8', email:'f@test'}, user:{uid:'u8', email:'f@test'}, devId:'F', pace:o}), PACE);
  await typeAt(F.pg,500,300,'чекаю версії'); await F.pg.click('#histBtn'); await F.pg.locator('#histList .hv[data-id="now"]').waitFor();
  const before=await until(()=>F.pg.evaluate(()=>{ const e=document.querySelector('#histList .hv-note'); return e && !e.hidden? e.textContent : null; }), 5000);
  await F.pg.evaluate(()=>window.__vrel()); await untilUI(F.pg,'synced'); await F.pg.waitForTimeout(300);
  const after=await F.pg.evaluate(()=>{ const e=document.querySelector('#histList .hv-note'); return e && !e.hidden? e.textContent : ''; });
  ok('5b «Історія» open while the versions catch-up runs says «'+before+'», and the line goes by itself when it ends with no document ('+JSON.stringify(after)+')', before===await loc(F.pg,'hist.vLoading') && after==='');
  await F.pg.click('#histBtn'); const o=await openBtn(F.pg); await F.pg.evaluate(()=>sheetDebug.lock('updated')); const l=await until(async()=>{ const x=await panel(F.pg); return x && x.acts.join()==='export'? x : null; }, 3000);
  ok('5c the tab is locked while the panel is open: it turns read-only at once, only the export, no name field; the user stays signed in ('+(o&&o.acts.join())+' → '+JSON.stringify(await panel(F.pg).then(x=>x&&x.acts))+')', !!o && o.acts.join()==='signOut,export,remove' && !!l && !l.nameField && await F.pg.evaluate(()=>!!sheetDebug.sync.account().user));
  await F.close(); }

/* ── 6. signed out: what waits; a view-only tab opens the panel read-only ── */
{ await pg.evaluate(()=>sheetDebug.sync.online(false)); await typeAt(pg,500,600,'чекає'); await pg.evaluate(()=>sheetDebug.sync.signOut()); await untilUI(pg,'signedOut'); const p=await openBtn(pg);
  ok('6 signed out: «Вийшли · N змін чекають», «Увійти», the export and «Прибрати» ('+(p&&p.st)+')', !!p && /^Вийшли · \d+ змін/.test(p.st) && p.acts.join()==='signIn,export,remove'); await pg.keyboard.press('Escape');
  await pg.evaluate(()=>sheetDebug.lock('updated')); await pg.evaluate(()=>document.getElementById('accRow').click()); const v=await until(()=>panel(pg), 3000);
  ok('6a a view-only tab: the menu row opens the panel read-only with the status and the export only, no name field, no status button ('+(v&&v.st)+' '+(v&&v.acts.join())+')', !!v && v.acts.join()==='export' && !v.nameField && /^Вийшли/.test(v.st) && await pg.evaluate(()=>document.getElementById('syncBtn').hidden));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); ok('6a-f closed, the focus goes back to the gear that opened the menu, not to the hidden status button', await pg.evaluate(()=>document.activeElement && document.activeElement.id==='setBtn')); }
ok('6b no page errors', !D.errs.length); await D.close();

/* ── 7. a phone: a bottom sheet at 390 and 320 wide ── */
for(const w of [390,320]){ const c=new TestCloud({start:Date.now()}); const ctx=await br.newContext({...CTX, viewport:{width:w, height:760}, hasTouch:true, isMobile:true}); await ctx.addInitScript(FLAG);
  await ctx.route('https://www.gstatic.com/**', r=>r.abort()); const { attachCloud }=await import('./lib/cloudpage.mjs'); await attachCloud(ctx, c, 'M'+w); const m=await ctx.newPage(); const errs=[]; m.on('pageerror',e=>errs.push(e.message));
  await m.goto(SITE); await m.waitForSelector('html[data-ready]',{state:'attached'}); await m.waitForTimeout(400); await connect(m); await untilUI(m,'synced');
  const p=await openBtn(m); const btns=await m.evaluate(()=>[...document.querySelectorAll('#accPanel .accp-b button')].map(b=>b.getBoundingClientRect().toJSON()));
  ok('7 '+w+' wide: the panel is a bottom sheet across the screen, its buttons inside and at least 44 px high ('+JSON.stringify(p&&p.box)+')', !!p && Math.round(p.box.width)===w && Math.round(p.box.bottom)===760 && btns.every(b=>b.left>=0 && b.right<=w && b.height>=44) && !errs.length);
  await ctx.close(); }

/* ── 8. a module of another build is refused: the status button and the update strip say so, the reload brings the panel back ── */
{ const ctx=await br.newContext({...CTX, serviceWorkers:'block'}); await ctx.addInitScript(FLAG); await ctx.route('https://www.gstatic.com/**', r=>r.abort());
  let bad=true; await ctx.route(u=>u.pathname==='/account/view.js', async r=>{ if(!bad) return r.continue(); const res=await r.fetch(); r.fulfill({response:res, body:(await res.text())+'\n// another build\n'}); });
  const m=await ctx.newPage(); await m.goto(SITE); await m.waitForSelector('html[data-ready]',{state:'attached'});
  const f=await until(()=>m.evaluate(()=>{ const u=sheetDebug.sync.account().ui, s=document.getElementById('updStrip'), b=document.getElementById('syncBtn'); return u && u.code==='failed' && !s.hidden? {msg:document.getElementById('updMsg').textContent, btn:!b.hidden && b.title} : null; }), 5000);
  const want=await loc(m,'account.moduleFailed');
  ok('8 a refused module: the status button stays and says «'+(f&&f.btn)+'», the update strip offers the reload', !!f && f.msg===want && f.btn===want);
  bad=false; await Promise.all([m.waitForNavigation(), m.click('#updGo')]); await m.waitForSelector('html[data-ready]',{state:'attached'});
  await until(()=>m.evaluate(()=>!!document.getElementById('accPanel')), 5000); await m.evaluate(()=>{ document.getElementById('syncBtn').hidden=false; document.getElementById('syncBtn').click(); });
  const back=await until(()=>panel(m), 3000);
  ok('8a after «Оновити» with the right file the panel opens again', !!back); await ctx.close(); }

/* ── 9. a new device's first receiving: «Отримую нотатки · N» on the button, and the slow store in the panel ── */
{ const c9=new TestCloud({start:Date.now()}); for(let i=0;i<40;i++) c9.write('notes',{id:'r'+i, title:'r'+i, blocks:[{id:'b',row:1,fx:0,text:'r'+i}], created:c9.now(), updated:c9.now()},{dev:'phone'});
  const G=await newDevice(br, c9, SITE, 'G', {ctx:CTX, init:FLAG, connect:false}); await G.ctx.route('https://www.gstatic.com/**', r=>r.abort());
  const seen=[]; await G.pg.exposeFunction('__st', t=>seen.push(t)); await G.pg.evaluate(()=>{ const b=document.getElementById('syncBtn'); new MutationObserver(()=>window.__st(b.title)).observe(b,{attributes:true, attributeFilter:['title']}); });
  await G.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u7', email:'g@test'}, user:{uid:'u7', email:'g@test'}, devId:'G', pace:{...o, slowTx:1}}), PACE);
  await openBtn(G.pg); const sl=await until(async()=>{ const x=await panel(G.pg); return x && x.why.some(w=>/повільно/.test(w))? x : null; }, 8000); await G.pg.keyboard.press('Escape');
  await untilUI(G.pg,'synced', 20000); const rec=seen.filter(t=>/^Отримую нотатки · \d+$/.test(t));
  ok('9 a new device shows «Отримую нотатки · N» while the first notes come ('+[...new Set(rec)].join(' | ')+')', rec.length>0);
  ok('9a the panel says the browser storage is slow when a write is over the threshold ('+(sl&&sl.why.find(w=>/повільно/.test(w)))+')', !!sl);
  ok('9b all 40 notes arrived, and the button ends at «Синхронізовано»', await G.pg.evaluate(()=>document.querySelectorAll('#list .item').length)>=40 && (await ui(G.pg)).code==='synced');
  // 9c: the panel open while another connection holds the sync store for 4 s: the core's transaction waits, and the panel says how long, also while its own reads come and go
  await G.pg.evaluate(()=>{ window.__held=new Promise(done=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const db=r.result, t=db.transaction('sync','readwrite'), st=t.objectStore('sync'), end=Date.now()+4000; const spin=()=>{ if(Date.now()<end) st.get('x').onsuccess=spin; }; spin(); t.oncomplete=()=>{ db.close(); done(); }; }; }); });
  await G.pg.evaluate(()=>sheetDebug.sync.wake()); await openBtn(G.pg);
  const held=await until(async()=>{ const x=await panel(G.pg); const w=x && x.why.find(t=>/повільно/.test(t)); const n=w && +(w.match(/триває (\d+)/)||[])[1]; return n>=2? w : null; }, 3800);
  await G.pg.evaluate(()=>window.__held); await G.pg.keyboard.press('Escape');
  ok('9c a held write with the panel open: the panel counts its wait in seconds ('+held+')', !!held); await G.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
