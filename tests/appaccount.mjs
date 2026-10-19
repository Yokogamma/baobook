// Sync core in the browser, part 8: the account on the screen without Firebase (docs/SYNC-PLAN.md §4.11, §4.12, §4.18). A host without a
// project shows nothing of the account; with the emulator flag the SDK that cannot load fails only when a press asked for it and the app goes
// on; the status button and the menu with the test cloud: synced, offline with the count, signed out after a reload; the leader's status
// mirrored in a second tab; the receipts strip and «Створити копію нотатки». The sign-in itself runs on the emulators (tests/emu).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, settle, stored, cloudWrite, typeAt, openNote } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300}, USER={uid:'u1', email:'u@test'};
const cloud=new TestCloud({start:Date.now()});
const FLAG="(()=>{ try{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); if(!s.emulator){ s.emulator=true; localStorage.setItem('sheet:settings', JSON.stringify(s)); } }catch(_){} })()";   // the app on 127.0.0.1 takes the emulator config only with this flag
const acc=pg=>pg.evaluate(()=>sheetDebug.sync.account());
const loc=(pg, key, p)=>pg.evaluate(([k,p])=>loc(k,p), [key,p]);
const menu=pg=>pg.evaluate(()=>{ const $=id=>document.getElementById(id), st=$('syncBtn'); return {signIn:!$('signInBtn').hidden, lbl:$('signInLbl').textContent, signOut:!$('signOutBtn').hidden, remove:!$('removeBtn').hidden, row:!$('accRow').hidden, email:$('accEmail').textContent, state:$('accState').textContent, hr:!$('accHr').hidden, sync:!st.hidden, st:st.dataset.st, title:st.title, rc:!$('rcStrip').hidden, toast:$('toast').textContent}; });
const untilUI=(pg, code, timeout=15000)=>pg.waitForFunction(c=>{ const a=sheetDebug.sync.account(); return !!a.ui && a.ui.code===c; }, code, {timeout});
const until=(pg, fn, arg, timeout=15000)=>pg.waitForFunction(fn, arg, {timeout});
const gstatic=async d=>{ const blocked=[]; await d.ctx.route('https://www.gstatic.com/**', r=>{ blocked.push(r.request().url()); r.abort(); }); return blocked; };

// 1. a host without a project: nothing of the account, with or without an owner
{ const P=await newDevice(br, cloud, SITE, 'P', {ctx:CTX, connect:false}); const a=await acc(P.pg), m=await menu(P.pg);
  ok('1 127.0.0.1 without the emulator flag: no project, no account rows in the menu, no status button', a.fb===null && !m.signIn && !m.signOut && !m.remove && !m.row && !m.hr && !m.sync && a.ui===null);
  await P.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u1', email:'u@test'}, pace:o}), PACE); await settle(P.pg,300); const m1=await menu(P.pg);
  ok('1b even with an owner and a cloud (the test hook) the screen stays as it was', !m1.sync && !m1.row && !m1.hr && !(await acc(P.pg)).ui && !P.errs.length); await P.close(); }

// 2. the emulator flag and an SDK that cannot load: the press reports it, the app goes on; with an owner the start tries quietly
const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, init:FLAG, connect:false}); const blocked=await gstatic(D);
{ const a=await acc(D.pg), m=await menu(D.pg);
  ok('2 with the flag the menu offers «Увійти через Google» and nothing else; no status button without an owner', a.fb && a.fb.emulator && !a.sdk && m.signIn && m.lbl===await loc(D.pg,'account.signIn') && !m.signOut && !m.remove && !m.row && m.hr && !m.sync);
  await D.pg.evaluate(()=>{ sheetDebug.sync.press(); }); await until(D.pg, ()=>!sheetDebug.sync.account().loading && document.getElementById('toast').textContent.length>0);
  const m2=await menu(D.pg), a2=await acc(D.pg);
  ok('2b the press tried the three modules of the SDK and reported «'+m2.toast+'»; the button is back to «Увійти»', blocked.length===3 && blocked.every(u=>/firebasejs\/12\.19\.0\/firebase-(app|auth|firestore)\.js$/.test(u)) && m2.toast===await loc(D.pg,'account.loadFailed') && !a2.sdk && !a2.loading && m2.lbl===await loc(D.pg,'account.signIn'));
  await D.pg.evaluate(()=>{ document.getElementById('toast').textContent=''; sheetDebug.sync.press(); }); await until(D.pg, ()=>!sheetDebug.sync.account().loading && document.getElementById('toast').textContent.length>0);
  ok('2c a second press reports it again without a new request: the browser keeps a failed module as failed, hence «reload the page»', blocked.length===3 && !(await acc(D.pg)).sdk && (await menu(D.pg)).toast===await loc(D.pg,'account.loadFailed')); }

// 3. the status button with the test cloud: the user and the owner from the hook (no Firebase), synced, offline with the count, back
await D.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u1', email:'u@test'}, user:o.user, devId:'D', devName:'Device D', pace:o.pace, budgets:{reads:1e6, writes:1e6}}), {user:USER, pace:PACE}); await untilUI(D.pg, 'synced');
{ const m=await menu(D.pg), a=await acc(D.pg);
  ok('3 signed in (the hook) and synced: the status button says «'+m.title+'», the menu shows the account, «Вийти» and «Прибрати…»', m.sync && m.st==='synced' && m.title===await loc(D.pg,'sync.st.synced') && m.state===m.title && m.row && m.email==='u@test' && m.signOut && m.remove && !m.signIn && a.lead && a.cloud);
  await D.pg.evaluate(()=>sheetDebug.sync.online(false)); await typeAt(D.pg, 500, 300, 'Офлайн-правка'); await untilUI(D.pg, 'offline'); await until(D.pg, ()=>/1/.test(sheetDebug.sync.account().ui.text));
  const m3=await menu(D.pg);
  ok('3b offline with an edit: «'+m3.title+'», the button marked off', m3.st==='off' && m3.title===await loc(D.pg,'sync.st.offline',{n:1}));
  await D.pg.evaluate(()=>sheetDebug.sync.online(true)); await untilUI(D.pg, 'synced'); await D.pg.evaluate(()=>{ document.getElementById('syncBtn').click(); });
  ok('3c online again: synced; a press on the button says the status in a toast', (await menu(D.pg)).toast===await loc(D.pg,'sync.st.synced'));
  await D.pg.reload(); await D.pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await until(D.pg, ()=>sheetDebug.sync.account().ui && sheetDebug.sync.account().ui.code==='signedOut'); const m4=await menu(D.pg);
  ok('3d after a reload (the owner stored, the SDK still unreachable, no Firebase user): «'+m4.title+'», the sign-in offered, the owner named, no report of the quiet load', m4.st==='off' && m4.title===await loc(D.pg,'sync.st.signedOut',{n:0}) && m4.signIn && m4.row && m4.email==='u@test' && m4.toast!==await loc(D.pg,'account.loadFailed') && blocked.length===6); }   // the toast after a reload is the editing hint, not the load

// 4. a second tab mirrors the leader's status: asked for on connecting, then every change
await D.pg.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:{env:'test', uid:'u1', email:'u@test'}, user:o.user, devId:'D', devName:'Device D', pace:o.pace, budgets:{reads:1e6, writes:1e6}}), {user:USER, pace:PACE}); await untilUI(D.pg, 'synced');
const T2=await newTab(D, SITE, {connect:{user:USER, pace:PACE}}); await untilUI(T2, 'synced');
{ const a=await acc(T2), m=await menu(T2);
  ok('4 the second tab waits behind the leader and shows the leader\'s status: «'+m.title+'»', !a.lead && a.cloud && m.st==='synced');
  await D.pg.evaluate(()=>sheetDebug.sync.online(false)); await typeAt(D.pg, 500, 420, 'Ще одна офлайн-правка'); await untilUI(D.pg, 'offline'); await untilUI(T2, 'offline'); await until(T2, ()=>/1/.test(sheetDebug.sync.account().ui.text));
  ok('4b the leader went offline with an edit waiting: the second tab says «'+(await menu(T2)).title+'» too', (await menu(T2)).title===await loc(T2,'sync.st.offline',{n:1}));
  await D.pg.evaluate(()=>sheetDebug.sync.online(true)); await untilUI(D.pg, 'synced'); await untilUI(T2, 'synced');
  ok('4c and synced again in both', (await menu(T2)).st==='synced'); await T2.close(); }

// 5. the receipt limit with the test cloud: the strip on the note, the copy syncs in place of the original
cloudWrite(cloud,'r1',{title:'', blocks:[{id:'b',row:1,fx:0,text:'Нотатка з 200 квитанціями'}]}); const many={}; for(let i=0;i<200;i++) many['dev'+i]='o'+i; cloud.docs.notes.get('r1').rcpt=many;   // past the rules, as a long life would
await settle(D.pg,300); await until(D.pg, ()=>!!document.querySelector('#list .item[data-id="r1"]')); await openNote(D.pg,'r1'); await D.pg.waitForTimeout(200);
ok('5 the note with the receipts arrived and opens without a strip', !(await menu(D.pg)).rc);
await typeAt(D.pg, 500, 420, 'Правка з D'); await untilUI(D.pg, 'error'); await until(D.pg, ()=>sheetDebug.sync.account().receipts.includes('r1'));
{ const m=await menu(D.pg), st=await D.pg.evaluate(()=>sheetDebug.sync.state('r1')), before=cloud.docs.notes.get('r1').rev;
  ok('5b the write was refused for the receipts: the note marked, «'+m.title+'», the strip on it', st.meta.err==='receipts' && !!st.job && m.st==='bad' && m.title===await loc(D.pg,'sync.st.error') && m.rc && await D.pg.evaluate(()=>document.querySelector('#rcStrip span[data-i18n]').textContent)===await loc(D.pg,'sync.receipts'));
  await D.pg.evaluate(()=>{ document.getElementById('rcCopy').click(); }); await until(D.pg, ()=>sheetDebug.cur()!=='r1'); const id2=await D.pg.evaluate(()=>sheetDebug.cur()); await untilUI(D.pg, 'synced'); await settle(D.pg,300);
  const m5=await menu(D.pg), st5=await D.pg.evaluate(()=>sheetDebug.sync.state('r1')), copy=cloud.docs.notes.get(id2), orig=cloud.docs.notes.get('r1');
  ok('5c «Створити копію нотатки»: the copy is open and in the cloud with both blocks, the original unmarked and without a job, untouched in the cloud; «'+m5.toast+'»', !!copy && copy.blocks.length===2 && copy.blocks[1].text==='Правка з D' && orig.rev===before && orig.blocks.length===1 && !st5.meta.err && !st5.job && !m5.rc && m5.st==='synced' && m5.toast===await loc(D.pg,'sync.copied',{title:'Нотатка з 200 квитанціями'}));
  await openNote(D.pg,'r1'); await D.pg.waitForTimeout(200); ok('5d the original opened again shows no strip', !(await menu(D.pg)).rc && (await stored(D.pg,'notes','r1')).blocks.length===2); }

ok('6 no page errors', !D.errs.length); if(D.errs.length) console.log(D.errs);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
