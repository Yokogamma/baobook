// The Firestore adapter (public/cloud.js) against the cloud adapter contract of docs/SYNC-PLAN.md §4.6 and the rules of §4.16, on the
// Firestore emulator. Run from this folder through the emulator (see tests/README.md):
//   npx firebase emulators:exec --only firestore --project demo-baobook "node adapter.mjs"
// The adapter takes the SDK's firestore module and a Firestore instance, so here it runs over the npm package and an authenticated
// instance from @firebase/rules-unit-testing, with the rules loaded with the test uid as firestore.mjs does.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'firebase/firestore';
const { make } = createRequire(import.meta.url)('../../public/cloud.js');
fs.setLogLevel('silent');
const OWNER='owner-test', OTHER='someone-else', T0=Date.UTC(2026, 9, 1);
let fails=0, n=0;
const line=(c, name, why)=>{ n++; if(!c) fails++; console.log((c? '✓ ' : '✗ ')+n+' '+name+(c || !why? '' : ' — '+why)); };
const scenario=async title=>{ console.log('— '+title); await env.clearFirestore(); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn, timeout=5000)=>{ const end=Date.now()+timeout; for(;;){ const v=await fn(); if(v || Date.now()>=end) return v; await sleep(50); } };
const expectCode=async(name, fn, code)=>{ try{ await fn(); line(false, name, 'no error'); }catch(e){ line(e.code===code, name+' → '+code, 'got '+e.code+(e.raw? ' ('+e.raw+')' : '')+': '+e.message); } };

const src=readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const rules=src.replace(/(request\.auth\.uid in \[)[^\]]*(\])/g, `$1'${OWNER}'$2`);
let env;
try{ env=await initializeTestEnvironment({projectId:'demo-baobook', firestore:{rules}}); }
catch(e){ console.log('✗ the rules load on the emulator — '+e.message); console.log(process.env.FIRESTORE_EMULATOR_HOST? '' : 'FIRESTORE_EMULATOR_HOST is not set: run this file through firebase emulators:exec'); process.exit(1); }
const owner=env.authenticatedContext(OWNER).firestore(), other=env.authenticatedContext(OTHER).firestore(), anon=env.unauthenticatedContext().firestore();
const ROOT='env/dev/users/'+OWNER, N=id=>ROOT+'/notes/'+id;
const A=make({fs, db:owner, root:ROOT, uid:OWNER});
const seed=(p, data)=>env.withSecurityRulesDisabled(c=>fs.setDoc(fs.doc(c.firestore(), p), data));
const raw=async p=>{ let d=null; await env.withSecurityRulesDisabled(async c=>{ const s=await fs.getDoc(fs.doc(c.firestore(), p)); d=s.exists()? s.data() : null; }); return d; };
const body={title:'A note', blocks:[{id:'b1', row:0, fx:0, text:'text'}], created:T0, updated:T0};
const stamp=(D, op, dev='devA')=>({...body, v:1, rev:(D? D.rev : 0)+1, op, dev, rcpt:{...(D? D.rcpt : {}), [dev]:op}});
const sameSrv=(a,b)=>!!a && !!b && a.s===b.s && a.ns===b.ns;
const later=(a,b)=>a.s>b.s || (a.s===b.s && a.ns>b.ns);

await scenario('the transaction: the whole document with set, srv and tsrv stamped by the server (§4.5 step 4, §4.8)');
line(await A.get('notes','n1')===null, 'get of a missing document is null');
let r=await A.txn('notes','n1', D=>stamp(D,'o1'));
let d=await A.get('notes','n1');
line(r.read===null && r.wrote===true && d.id==='n1' && d.rev===1 && d.rcpt.devA==='o1', 'a create: read null, wrote; the document comes back with its id and rev 1');
line(Number.isInteger(d.srv.s) && Number.isInteger(d.srv.ns) && d.srv.ns>=0 && d.srv.ns<1e9 && !('tsrv' in d), 'srv comes as {s, ns}, no tsrv outside the trash');
let rw=await raw(N('n1'));
line(rw.srv instanceof fs.Timestamp && rw.srv.seconds===d.srv.s && rw.srv.nanoseconds===d.srv.ns && !('id' in rw), 'the stored srv is a server Timestamp equal to {s, ns}; no id field is stored');
r=await A.txn('notes','n1', D=>({...stamp(D,'o2'), deleted:T0+10}));
d=await A.get('notes','n1'); rw=await raw(N('n1'));
line(r.read.rev===1 && r.wrote && d.rev===2 && sameSrv(d.tsrv, d.srv) && rw.tsrv.isEqual(rw.srv), 'entering the trash: tsrv is the server time of that write, equal to its srv');
const tsrv2=d.tsrv;
r=await A.txn('notes','n1', D=>({...stamp(D,'o3'), deleted:D.deleted, title:'edited in the trash'}));
d=await A.get('notes','n1');
line(d.rev===3 && sameSrv(d.tsrv, tsrv2) && later(d.srv, tsrv2), 'an edit in the trash keeps the stored tsrv while srv moves on');
r=await A.txn('notes','n1', D=>({...stamp(D,'o4'), deleted:T0+20}));
d=await A.get('notes','n1');
line(d.rev===4 && sameSrv(d.tsrv, d.srv) && !sameSrv(d.tsrv, tsrv2), 'extending the trash: a new tsrv, again the server time');
r=await A.txn('notes','n1', D=>stamp(D,'o5'));
d=await A.get('notes','n1'); rw=await raw(N('n1'));
line(d.rev===5 && !('tsrv' in d) && !('deleted' in d) && !('tsrv' in rw), 'a restore drops tsrv');
r=await A.txn('notes','n1', D=>({v:1, rev:D.rev+1, op:'o6', dev:'devA', rcpt:{...D.rcpt, devA:'o6'}, purged:T0+99}));
d=await A.get('notes','n1'); rw=await raw(N('n1'));
line(d.rev===6 && d.purged===T0+99 && !('tsrv' in d) && !('title' in d) && Object.keys(rw).sort().join()==='dev,op,purged,rcpt,rev,srv,v', 'a tombstone: only its fields, no tsrv');
r=await A.txn('notes','n1', D=>null);
line(r.wrote===false && r.read.rev===6 && (await A.get('notes','n1')).rev===6, 'a callback that returns null writes nothing and reports what it read');
r=await A.txn('notes','n2', D=>({...stamp(D,'p1'), deleted:T0}));
d=await A.get('notes','n2');
line(d.rev===1 && sameSrv(d.tsrv, d.srv), 'a new document straight into the trash gets tsrv');
r=await A.txn('notes','n3', D=>({...stamp(D,'q1'), dn:'Chrome · Windows', archived:T0+5, revived:{from:'n0', dev:'devB', at:T0}}));
d=await A.get('notes','n3');
line(d.dn==='Chrome · Windows' && d.archived===T0+5 && d.revived.from==='n0' && d.blocks[0].text==='text', 'dn, archived, revived and the blocks travel as they are');

await scenario('contention: another device writes while the transaction is in flight (the stale write is judged against the new document)');
// The emulator evaluates the rules on the stale write against the document as it is now, so the commit comes back as permission-denied
// instead of the SDK retrying the callback; the core resolves that with its check read (sync.js refusedWrite: the revision moved → rejected,
// then the merge). A backend that retries instead runs the pure callback again over the new document; both outcomes leave one write.
await A.txn('notes','c1', D=>stamp(D,'c-1'));
let runs=0, release; A.fault('hold', new Promise(res=>{ release=res; }));
const p=A.txn('notes','c1', D=>{ runs++; return {...stamp(D,'c-'+(runs+1)), title:'from A, run '+runs}; });
await sleep(300); const c1=await raw(N('c1'));
await seed(N('c1'), {...c1, rev:2, op:'b-1', dev:'devB', rcpt:{...c1.rcpt, devB:'b-1'}, srv:fs.Timestamp.now(), title:'from B'});
release(); let outcome='committed'; try{ r=await p; }catch(e){ outcome=e.code; } d=await A.get('notes','c1');
if(outcome==='committed') line(runs>=2 && r.read.rev===2 && r.wrote && d.rev===3 && d.title==='from A, run '+runs && d.rcpt.devB==='b-1', 'the SDK retried: the callback ran '+runs+' times, the commit is rev 3 over B\'s rev 2 with both receipts');
else line(outcome==='permission-denied' && runs===1 && d.rev===2 && d.title==='from B' && d.rcpt.devB==='b-1' && d.rcpt.devA==='c-1', 'the stale write was refused (permission-denied), nothing of it was written: B\'s rev 2 stands with A\'s first receipt; the core\'s check read then sees the moved revision', outcome+' runs '+runs+' rev '+d.rev+' '+JSON.stringify(d.rcpt));

await scenario('refusals and errors reach the core with its codes (§4.16, errOf)');
await seed(N('n2'), {...stamp(null,'s1'), srv:fs.Timestamp.now()});
const O=make({fs, db:other, root:ROOT}), AN=make({fs, db:anon, root:ROOT});
await expectCode('get by another account', ()=>O.get('notes','n2'), 'permission-denied');
await expectCode('page by another account', ()=>O.page('notes',{from:{s:0, ns:0}},10), 'permission-denied');
await expectCode('page by another account without a range', ()=>O.page('notes',{from:null},10), 'permission-denied');
await expectCode('totals by another account', ()=>O.totals('notes'), 'permission-denied');
await expectCode('scan by another account', ()=>O.scan('notes',{},10), 'permission-denied');
await expectCode('a transaction by another account', ()=>O.txn('notes','n2', D=>stamp(D,'x')), 'permission-denied');
await expectCode('get while signed out', ()=>AN.get('notes','n2'), 'permission-denied');
{ let got=null; const unsub=O.listen('notes', null, ()=>{}, e=>{ got=e; }); await until(()=>got, 5000); unsub();
  line(!!got && got.code==='permission-denied', 'a listener by another account fails through its error callback → permission-denied', got? got.code : 'no error in 5 s'); }
await expectCode('a write the rules refuse (rev two ahead)', ()=>A.txn('notes','n2', D=>({...stamp(D,'bad'), rev:D.rev+2})), 'permission-denied');
await expectCode('a write the rules refuse (an unknown key)', ()=>A.txn('notes','n2', D=>({...stamp(D,'bad2'), lrev:5})), 'permission-denied');
await expectCode('a document over 1 MiB', ()=>A.txn('notes','big', D=>({...stamp(D,'big'), blocks:[{id:'b', row:0, fx:0, text:'x'.repeat(1_100_000)}]})), 'invalid');
line((await A.get('notes','n2')).rev===1 && await A.get('notes','big')===null, 'nothing of that was written');
A.fault('lost');
await expectCode('a lost response: the transaction commits and the adapter reports unavailable', ()=>A.txn('notes','l1', D=>stamp(D,'l-1')), 'unavailable');
line((await A.get('notes','l1')).rev===1 && (await A.get('notes','l1')).rcpt.devA==='l-1', 'the write landed anyway, with the receipt that resolves the attempt');
{ const tdb=env.authenticatedContext(OWNER).firestore(); const T=make({fs, db:tdb, root:ROOT}); await fs.terminate(tdb._delegate||tdb);   // the test library hands out a compat instance; terminate() wants the modular one inside
  await expectCode('a call on a terminated client (sign-out while in flight) is a retry', ()=>T.get('notes','n2'), 'unavailable'); }

await scenario('pages by (srv, id) with a cursor that keeps nanoseconds: no gap, no repeat (§4.6)');
const S0=1_800_000_000; const docs=[];   // 250 documents in five seconds, 50 a second, two by two on one timestamp: ties broken by id
for(let i=0;i<250;i++){ const id='d'+String(i).padStart(3,'0'), s=S0+Math.floor(i/50), ns=Math.floor((i%50)/2)*1000+7; docs.push({id, s, ns, rev:(i%3)+1}); }
await env.withSecurityRulesDisabled(async c=>{ const db=c.firestore(); const b=fs.writeBatch(db); for(const x of docs) b.set(fs.doc(db, N(x.id)), {...stamp(null,'w'+x.id), rev:x.rev, srv:new fs.Timestamp(x.s, x.ns)}); await b.commit(); });
const order=docs.slice().sort((a,b)=>(a.s-b.s)||(a.ns-b.ns)||(a.id<b.id? -1 : 1)).map(x=>x.id);
line(order[0]==='d000' && order[1]==='d001' && order[2]==='d002', 'the expected order starts d000, d001 (one timestamp), d002');
{ const got=[]; let q={from:{s:0, ns:0}}; for(let k=0;k<10;k++){ const page=await A.page('notes', q, 100); got.push(...page); if(page.length<100) break; const last=page[page.length-1]; q={after:{srv:{s:last.srv.s, ns:last.srv.ns}, id:last.id}}; }
  const ids=got.map(x=>x.id); const srvs=got.map(x=>x.srv);
  line(got.length===250 && new Set(ids).size===250 && ids.join()===order.join(), 'three pages of 100, 100 and 50 give every document once, in (srv, id) order');
  line(srvs.every((x,i)=>!i || (srvs[i-1].s<x.s || (srvs[i-1].s===x.s && srvs[i-1].ns<=x.ns))) && srvs.some((x,i)=>i && srvs[i-1].s===x.s && srvs[i-1].ns===x.ns) && srvs.some((x,i)=>i && srvs[i-1].s===x.s && x.ns-srvs[i-1].ns===1000), 'the pages carry nanoseconds: equal timestamps and timestamps a microsecond apart both appear in order');
  const cut=got[100]; const from=await A.page('notes', {from:{s:cut.srv.s, ns:cut.srv.ns}}, 5);
  line(from[0].id===order[order.indexOf(cut.id)-1] || from[0].id===cut.id, 'from is inclusive: the page starts at the first document with that timestamp ('+from[0].id+')');
  const all=await A.page('notes', {from:null}, 3); line(all.length===3 && all[0].id==='d000', 'from null: the whole collection from its first document'); }
{ const t=await A.totals('notes'); const sum=docs.reduce((a,x)=>a+x.rev,0); line(t.count===250 && t.sum===sum, 'totals: count 250 and sum(rev) '+sum+' in one aggregation ('+t.count+', '+t.sum+')'); }
{ const got=[]; let q={}; for(let k=0;k<10;k++){ const page=await A.scan('notes', q, 100); got.push(...page); if(page.length<100) break; q={afterId:page[page.length-1].id}; }
  const ids=got.map(x=>x.id); line(got.length===250 && ids.join()===docs.map(x=>x.id).join(), 'scan by id in pages of 100 gives every document once in id order'); }

await scenario('the listener: a server snapshot on an empty collection, a change, a pending write, a re-subscription without changes');
{ const got=[]; let unsub; const first=until(()=>got.some(g=>g.info.snapshot), 5000); unsub=A.listen('notes', null, (docs,info)=>got.push({docs, info}), e=>got.push({error:e}));
  await first; line(got.some(g=>g.info && g.info.snapshot && g.docs.length===0) && !got.some(g=>g.error), 'an empty collection: the server snapshot is reported with no documents');
  await seed(N('L1'), {...stamp(null,'L-1'), srv:fs.Timestamp.now()}); await until(()=>got.some(g=>g.docs && g.docs.some(x=>x.id==='L1')), 5000);
  const l1=got.flatMap(g=>g.docs||[]).filter(x=>x.id==='L1');
  line(l1.length===1 && Number.isInteger(l1[0].srv.s) && l1[0].rev===1, 'a document written by another device comes once, with its srv as {s, ns}');
  got.length=0; await fs.setDoc(fs.doc(owner, N('L2')), {...stamp(null,'L-2'), srv:fs.serverTimestamp()}); await until(()=>got.some(g=>g.docs && g.docs.some(x=>x.id==='L2')), 5000); await sleep(400);
  const l2=got.flatMap(g=>g.docs||[]).filter(x=>x.id==='L2');
  line(l2.length===1 && !!l2[0].srv && Number.isInteger(l2[0].srv.s), 'a write from this client is delivered once, after the server dated it (never with the pending sentinel)');
  unsub(); got.length=0;
  const again=until(()=>got.some(g=>g.info && g.info.snapshot), 5000); unsub=A.listen('notes', null, (docs,info)=>got.push({docs, info}), e=>got.push({error:e})); await again;
  line(got.some(g=>g.info && g.info.snapshot) && !got.some(g=>g.error), 're-subscribed to the same range with nothing changed: the server snapshot is reported again'); unsub();
  const from={s:(await A.get('notes','L2')).srv.s+1, ns:0}; got.length=0; const empty=until(()=>got.some(g=>g.info && g.info.snapshot), 5000); unsub=A.listen('notes', from, (docs,info)=>got.push({docs, info}), e=>got.push({error:e})); await empty;
  line(got.some(g=>g.info && g.info.snapshot && g.docs.length===0), 'a range above every document: a server snapshot with nothing in it'); unsub(); }

await env.cleanup();
console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
