// The receipt limit (SYNC-PLAN 4.18) end to end: the cloud document of a note carries the receipts of 200 devices, so the rules would refuse
// a write of this device; the engine sees it in its transaction's read, writes nothing and marks the note; the strip «Не синхронізовано:
// забагато пристроїв» offers a copy, which syncs in place of the original. Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/receipts.mjs"
import { launch, device, acc, signIn, loc, menu, untilUI, until } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc, seed, Ts } from './lib/emu.mjs';
import { typeAt, openNote } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), C1=credential('sub-one','one@example.com'), ROOT='env/dev/users/'+u1.uid;
await loadRules(rulesFor(u1.uid));
const env=await launch(); const A=await device(env,'A');
await typeAt(A.pg, 500, 300, 'Нотатка з квитанціями'); const id1=await A.pg.evaluate(()=>sheetDebug.cur());
await signIn(A.pg, C1); await untilUI(A.pg, 'synced');
const d1=await readDoc(ROOT+'/notes/'+id1);
ok('1 the note is in the cloud with this device\'s receipt only', !!d1 && d1.rev===1 && Object.keys(d1.rcpt).length===1);

// 2. two hundred other devices wrote the note: the document is rewritten past the rules with their receipts and a newer revision; this device takes it
const rcpt={}; for(let i=1;i<=200;i++) rcpt['dev'+i]='o'+i;
await seed(ROOT+'/notes/'+id1, {v:1, rev:2, op:'o200', srv:Ts.ms(Date.now()), dev:'dev200', dn:'Пристрій 200', rcpt, title:d1.title, blocks:d1.blocks, created:d1.created, updated:d1.updated+1});
await until(A.pg, async id=>{ const st=await sheetDebug.sync.state(id); return !!st.meta && !!st.meta.base && st.meta.base.rev===2; }, id1);
ok('2 the device received revision 2 with the 200 receipts', (await acc(A.pg)).ui.code==='synced');

// 3. an edit here: the transaction reads the receipts, writes nothing; the note is marked and the strip shows on it
await typeAt(A.pg, 500, 420, 'Правка з цього пристрою'); await untilUI(A.pg, 'error');
await until(A.pg, id=>sheetDebug.sync.account().receipts.includes(id), id1);
const a3=await acc(A.pg), m3=await menu(A.pg), st3=await A.pg.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return {err:st.meta.err, job:!!st.job, tr:!!st.tr}; }, id1), d3=await readDoc(ROOT+'/notes/'+id1);
const stripText=await A.pg.evaluate(()=>document.querySelector('#rcStrip span[data-i18n]').textContent), btnText=await A.pg.evaluate(()=>document.getElementById('rcCopy').textContent);
ok('3 the write was refused for the receipts: the note is marked, its job stays, the status is «not synced», the cloud document is untouched', st3.err==='receipts' && st3.job && !st3.tr && a3.ui.code==='error' && m3.st==='bad' && d3.rev===2 && d3.blocks.length===1);
ok('3b the strip on the open note: «'+stripText+'» · «'+btnText+'»', m3.rc && stripText===await loc(A.pg,'sync.receipts') && btnText===await loc(A.pg,'sync.copyNote'));

// 4. the copy: a new note with the same content syncs; the original's job goes and the strip with it
await A.pg.evaluate(()=>sheetDebug.sync.copyNote()); const id2=await A.pg.evaluate(()=>sheetDebug.cur()); await untilUI(A.pg, 'synced');
const d4=await readDoc(ROOT+'/notes/'+id2), m4=await menu(A.pg), a4=await acc(A.pg), st4=await A.pg.evaluate(async id=>{ const st=await sheetDebug.sync.state(id); return {err:st.meta.err, job:!!st.job, text:st.note.blocks.map(b=>b.text).join('|')}; }, id1), toast=await A.pg.evaluate(()=>document.getElementById('toast').textContent);
ok('4 the copy is open and in the cloud with both blocks; the original keeps its text here, unmarked and without a job; the strip is gone; «'+toast+'»',
  id2!==id1 && !!d4 && d4.rev===1 && d4.blocks.length===2 && d4.blocks[1].text==='Правка з цього пристрою' && !st4.err && !st4.job && st4.text==='Нотатка з квитанціями|Правка з цього пристрою' && !m4.rc && a4.ui.code==='synced' && !a4.receipts.length && toast===await loc(A.pg,'sync.copied',{title:'Нотатка з квитанціями'}));
await openNote(A.pg, id1); await A.pg.waitForTimeout(300);
ok('4b the original opened again shows no strip', !(await menu(A.pg)).rc);
ok('5 no request went to a real Google host ('+A.blocked.length+' blocked)', !A.blocked.length); if(A.blocked.length) console.log(A.blocked);
ok('6 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
