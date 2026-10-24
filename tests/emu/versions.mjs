// Named versions on the real rules (SYNC-PLAN 4.9, PR 4a): a version named on the device reaches Firestore after its note, with the body
// inline and none of the local fields; a rename changes only the name; a name of 40 emoji (80 UTF-16 units, what the rules' size()
// counts) passes; «Видалити версію» leaves a tombstone; a version another device sent with a snapshot the normalizer changes on the way in
// (a block whose parent area is missing) is renamed here and the rules accept it, since the rename sends the cloud's own snapshot; a version
// queued before its note makes no refused write. Run from tests/rules through the emulators (see tests/README.md):
//   npx firebase emulators:exec --only auth,firestore --project demo-baobook "node ../emu/versions.mjs"
import { launch, device, signIn, untilUI, until } from './lib/app.mjs';
import { clearAuth, clearFirestore, rulesFor, loadRules, googleUser, credential, readDoc, seed, Ts } from './lib/emu.mjs';
import { typeAt } from '../lib/cloudpage.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
async function docUntil(path, pred, timeout=20000){ const t0=Date.now(); for(;;){ const d=await readDoc(path); if(pred(d)) return d; if(Date.now()-t0>timeout) return d; await new Promise(r=>setTimeout(r,200)); } }

await clearAuth(); await clearFirestore();
const u1=await googleUser('sub-one','one@example.com'), C1=credential('sub-one','one@example.com'), ROOT='env/dev/users/'+u1.uid;
await loadRules(rulesFor(u1.uid));
const env=await launch(); const A=await device(env,'A');
await typeAt(A.pg, 500, 300, 'Текст версії'); const id=await A.pg.evaluate(()=>sheetDebug.cur());
await A.pg.evaluate(()=>sheetDebug.vers.force('manual','Реліз'));   // named before the sign-in: the version waits for its note
await signIn(A.pg, C1); await untilUI(A.pg, 'synced');
const recs=await A.pg.evaluate(id=>sheetDebug.sync.state(id).then(st=>st.versions.filter(v=>v.name)), id), vid=recs[0] && recs[0].id;
const d1=await docUntil(ROOT+'/versions/'+vid, d=>!!d);
ok('1 the named version is in Firestore after its note: rev 1, the name, the body inline, no local field', !!(await readDoc(ROOT+'/notes/'+id)) && d1 && d1.rev===1 && d1.name==='Реліз' && JSON.stringify(d1.blocks).includes('Текст версії') && !('keep' in d1) && !('inline' in d1) && !('reason' in d1));
const log1=await A.pg.evaluate(()=>sheetDebug.sync.log());
ok('1a no refused write on the way (the version waited for its note)', !log1.some(e=>e.t==='rejected-write'));

await A.pg.evaluate(v=>sheetDebug.sync.version({op:'rename', id:v, name:'Перейменована'}), vid); await A.pg.evaluate(()=>sheetDebug.sync.wake());
const d2=await docUntil(ROOT+'/versions/'+vid, d=>!!d && d.rev===2);
ok('2 a rename: one write, only the name changed', d2 && d2.name==='Перейменована' && JSON.stringify(d2.blocks)===JSON.stringify(d1.blocks) && d2.t===d1.t);
await A.pg.evaluate(v=>sheetDebug.sync.version({op:'rename', id:v, name:'😀'.repeat(40)}), vid); await A.pg.evaluate(()=>sheetDebug.sync.wake());
const d3=await docUntil(ROOT+'/versions/'+vid, d=>!!d && d.rev===3);
ok('3 a name of 40 emoji (80 UTF-16 units) passes the rules', d3 && d3.name==='😀'.repeat(40));
const r41=await A.pg.evaluate(v=>sheetDebug.sync.version({op:'rename', id:v, name:'😀'.repeat(41)}), vid);
ok('3a 41 emoji are refused by the core before anything is sent', r41 && r41.ok===false && r41.code==='name');

// a version from another device whose snapshot the normalizer changes here
const now=Date.now();
await seed(ROOT+'/versions/vN', {v:1, rev:1, op:'o-phone', srv:Ts.ms(now), dev:'phone', rcpt:{phone:'o-phone'}, note:id, t:now, name:'Сира', title:'T', blocks:[{id:'c1', row:1, parent:'gone-area', col:2, s:'у неіснуючій області'}]});
await until(A.pg, ()=>sheetDebug.sync.state(sheetDebug.cur()).then(st=>st.versions.some(v=>v.id==='vN')), null);
await A.pg.evaluate(()=>sheetDebug.sync.version({op:'rename', id:'vN', name:'Перейменована тут'})); await A.pg.evaluate(()=>sheetDebug.sync.wake());
const dN=await docUntil(ROOT+'/versions/vN', d=>!!d && d.rev===2);
ok('4 a received snapshot the normalizer changed is renamed: the rules accept it, the cloud\'s blocks stay as they were', dN && dN.name==='Перейменована тут' && dN.blocks[0].parent==='gone-area');

await A.pg.evaluate(v=>sheetDebug.sync.version({op:'delete', id:v}), vid); await A.pg.evaluate(()=>sheetDebug.sync.wake());
const d5=await docUntil(ROOT+'/versions/'+vid, d=>!!d && d.deleted===true);
ok('5 «Видалити версію»: a tombstone in Firestore, no body', d5 && d5.deleted===true && !d5.blocks && d5.rev===4);
await untilUI(A.pg, 'synced');
const log2=await A.pg.evaluate(()=>sheetDebug.sync.log());
ok('6 no refused write and no invariant in the whole run', !log2.some(e=>e.t==='rejected-write' || e.t==='invariant'));
ok('7 no request went to a real Google host ('+A.blocked.length+' blocked)', !A.blocked.length); if(A.blocked.length) console.log(A.blocked);
ok('8 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await env.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
