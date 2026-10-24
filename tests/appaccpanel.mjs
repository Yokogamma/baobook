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
    acts:[...d.querySelectorAll('.accp-b button')].map(b=>b.dataset.act), name:(q('.accp-name input')||{}).value, nameOff:!!(q('.accp-name input')||{}).disabled, box:d.getBoundingClientRect().toJSON()}; });
const openBtn=async pg=>{ await pg.evaluate(()=>document.getElementById('syncBtn').click()); return until(()=>panel(pg), 3000); };
const connect=(pg, o={})=>pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u1', email:'u@test'}, user:o.user, devId:'D', devName:'Device D', pace:o.pace, budgets:{reads:20000, writes:5000}}), {user:USER, pace:PACE, ...o});

const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, init:FLAG, connect:false}); await D.ctx.route('https://www.gstatic.com/**', r=>r.abort()); const pg=D.pg;
await connect(pg); await untilUI(pg, 'synced');

/* ── 1. the panel opens from the button and from the menu; Esc and Back close it ── */
{ const p=await openBtn(pg);
  ok('1 the button opens the panel: the email, «Синхронізовано» with its explanation ('+(p&&p.st)+')', !!p && p.email==='u@test' && p.st===await loc(pg,'sync.st.synced') && p.kind==='synced' && p.why[0]===await loc(pg,'account.why.synced'));
  ok('1a «Перевірено о …» and today\'s budget as two lines ('+(p&&p.sub.join(' | '))+')', !!p && p.sub.some(s=>/^Перевірено о \d/.test(s)) && p.sub.some(s=>/^Читань сьогодні: \d+ із 20000$/.test(s)) && p.sub.some(s=>/^Записів сьогодні: \d+ із 5000$/.test(s)));
  ok('1b signed in: «Вийти» and «Прибрати»; the device name field', !!p && p.acts.join()==='signOut,remove' && p.name==='Device D');
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
  await pg.keyboard.press('Escape');
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
  await pg.keyboard.press('Escape'); }

/* ── 4. the device name goes as dn and shows in the second tab; the second tab shows the leader's status ── */
{ const T2=await newTab(D, SITE, {connect:{pace:PACE, user:USER}}); await pg.bringToFront(); await openBtn(pg);
  await pg.fill('#accPanel .accp-name input','Мій ПК'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Escape');
  await pg.click('#newBtn'); await pg.waitForTimeout(300); await typeAt(pg,500,300,'з новою назвою'); const id=await curId(pg); const dn=await until(async()=>{ await settle(pg,100); const d=cloud.doc('notes',id); return d && d.dn==='Мій ПК'? d.dn : null; }, 8000);
  ok('4 a new device name goes as dn in the next document', dn==='Мій ПК');
  await T2.bringToFront(); await T2.evaluate(()=>document.getElementById('syncBtn').click()); const q=await until(()=>panel(T2), 3000); const lead=await ui(pg);
  ok('4a the second tab\'s panel shows the new name and the leader\'s status ('+(q&&q.st)+' / '+(lead&&lead.text)+')', !!q && q.name==='Мій ПК' && q.st===lead.text); await T2.keyboard.press('Escape'); await T2.close(); await pg.bringToFront(); }

/* ── 5. «Історія» of an account with no versions: done, no «версії ще завантажуються» ── */
{ const E=await newDevice(br, new TestCloud({start:Date.now()}), SITE, 'E', {ctx:CTX, init:FLAG, connect:false}); await E.ctx.route('https://www.gstatic.com/**', r=>r.abort());
  await E.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u9', email:'e@test'}, user:{uid:'u9', email:'e@test'}, devId:'E', pace:o}), PACE); await untilUI(E.pg,'synced');
  await typeAt(E.pg,500,300,'без версій'); await settle(E.pg); await E.pg.click('#histBtn'); await E.pg.locator('#histList .hv[data-id="now"]').waitFor(); await E.pg.waitForTimeout(200);
  const done=await E.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const q=r.result.transaction('sync','readonly').objectStore('sync').get('cursor:versions'); q.onsuccess=()=>{ res(!!(q.result||{}).done); r.result.close(); }; }; }));
  ok('5 an account with no versions at all reaches cursor:versions.done; «Історія» says nothing of loading', done && !(await E.pg.evaluate(()=>!!document.querySelector('#histList .hv-note'))));
  await E.pg.evaluate(()=>sheetDebug.sync.online(false)); await E.pg.evaluate(()=>sheetDebug.sync.online(true)); const seen=[]; for(let i=0;i<10;i++){ seen.push((await ui(E.pg)).code); await E.pg.waitForTimeout(100); }
  ok('5a a reconnect after that never shows «Отримую версії…» ('+[...new Set(seen)].join(',')+')', !seen.includes('versions')); await E.close(); }

/* ── 6. signed out: what waits; a view-only tab opens the panel read-only ── */
{ await pg.evaluate(()=>sheetDebug.sync.online(false)); await typeAt(pg,500,600,'чекає'); await pg.evaluate(()=>sheetDebug.sync.signOut()); await untilUI(pg,'signedOut'); const p=await openBtn(pg);
  ok('6 signed out: «Вийшли · N змін чекають», «Увійти» and «Прибрати» ('+(p&&p.st)+')', !!p && /^Вийшли · \d+ змін/.test(p.st) && p.acts.join()==='signIn,remove'); await pg.keyboard.press('Escape');
  await pg.evaluate(()=>sheetDebug.lock('updated')); await pg.evaluate(()=>document.getElementById('accRow').click()); const v=await until(()=>panel(pg), 3000);
  ok('6a a view-only tab: the menu row opens the panel read-only, no status button, no actions, the name field off', !!v && !v.acts.length && v.nameOff && !v.st && await pg.evaluate(()=>document.getElementById('syncBtn').hidden)); }
ok('6b no page errors', !D.errs.length); await D.close();

/* ── 7. a phone: a bottom sheet at 390 and 320 wide ── */
for(const w of [390,320]){ const c=new TestCloud({start:Date.now()}); const ctx=await br.newContext({...CTX, viewport:{width:w, height:760}, hasTouch:true, isMobile:true}); await ctx.addInitScript(FLAG);
  await ctx.route('https://www.gstatic.com/**', r=>r.abort()); const { attachCloud }=await import('./lib/cloudpage.mjs'); await attachCloud(ctx, c, 'M'+w); const m=await ctx.newPage(); const errs=[]; m.on('pageerror',e=>errs.push(e.message));
  await m.goto(SITE); await m.waitForSelector('html[data-ready]',{state:'attached'}); await m.waitForTimeout(400); await connect(m); await untilUI(m,'synced');
  const p=await openBtn(m); const btns=await m.evaluate(()=>[...document.querySelectorAll('#accPanel .accp-b button')].map(b=>b.getBoundingClientRect().toJSON()));
  ok('7 '+w+' wide: the panel is a bottom sheet across the screen, its buttons inside and at least 44 px high ('+JSON.stringify(p&&p.box)+')', !!p && Math.round(p.box.width)===w && Math.round(p.box.bottom)===760 && btns.every(b=>b.left>=0 && b.right<=w && b.height>=44) && !errs.length);
  await ctx.close(); }

await br.close(); await srv.close();
console.log(fails? '\n'+fails+' FAILED' : '\n✓ no errors'); process.exit(fails? 1 : 0);
