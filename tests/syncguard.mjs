// The sync core under Node: the guarantees a review found broken (docs/SYNC-PLAN.md §4.7, §4.6, §4.17). A conflict copy keeps a block over the
// automatic history's body limit in full, and two copies that differ only in such a block are both kept; a version that arrives before its
// note is applied in its latest state once the note comes (no quarantine of the earlier state); the listener's deliveries count as reads,
// the budget stops the listeners (a reconnect or a restart on the same day does not bring them back, the next day does), and a paused engine
// names the next day as its wake-up time whatever waits (a job, a page, a refetch); a fallback copy's
// move decides over the stored record inside its own transaction. Section 5 (§4.10, two tabs of one device over one store): both engines write
// as the device of the store's `device` record; a runner that read the cloud before another insured an attempt does not insure a second one
// over it; two runners of one attempt leave one commit; a late delivery by a runner with an old memory never moves the cursor back; a tab
// that spent yesterday's budget leads again today after reload(); checkOwner() sees a change of owner made by another tab. Section 6 (§4.6):
// a listener the server ends with an error is started again by the step after a growing pause, from the cursor (one that keeps ending right after
// its snapshot keeps the pause growing); a refused one is not; an error of a listener already replaced, or reported inside listen(), leaks nothing.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const owner={env:'test', uid:'u1', email:'u@test'};
function device(cloud, name, o={}){ const d={name, db:o.db||new MemStore(), online:true, clock:0, logs:[], status:[]};
  d.proxy={ get:(c,i)=>cloud.get(c,i,{dev:name}), page:(c,q,n)=>cloud.page(c,q,n,{dev:name}), totals:c=>cloud.totals(c,{dev:name}), scan:(c,q,n)=>cloud.scan(c,q,n,{dev:name}), txn:(c,i,f)=>cloud.txn(c,i,f,{dev:name}),
    listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr,{dev:name}) };
  d.sync=S.makeSync({db:d.db, cloud:d.proxy, now:()=>cloud.now()+d.clock, random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:o.budgets||{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50}, log:e=>d.logs.push(e), onChange:()=>{}, onStatus:(code,n)=>d.status.push(code)});
  d.off=async on=>{ d.online=on; d.sync.online(on); }; return d; }
async function mk(cloud, name, o){ const d=device(cloud, name, o); await d.sync.setOwner(owner); await d.sync.start(); await d.sync.idle(300); return d; }
const idle=async(...ds)=>{ for(let i=0;i<3;i++) for(const d of ds) await d.sync.idle(300); };
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const body=d=>{ const o={title:d.title, blocks:d.blocks, created:d.created, updated:d.updated}; for(const k of ['deleted','archived','revived']) if(d[k]!==undefined) o[k]=d[k]; return o; };

/* ── 1. a conflict copy keeps a block over V_BODY_MAX in full ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await edit(A,'n1',(C,t)=>({title:'Велика', blocks:[{id:'b',row:1,fx:0,text:'коротко'}], created:t, updated:t})); await idle(A);
  ok('1 the note is in the cloud', cloud.doc('notes','n1').rev===1);
  const BIG='А'.repeat(270000)+' UNIQUE-A-1', big2='Б'.repeat(270000)+' UNIQUE-A-2';
  ok('1a the text is over the automatic history\'s body limit ('+S.V_BODY_MAX+')', BIG.length>S.V_BODY_MAX);
  await A.off(false); A.clock=-3600e3; await edit(A,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:BIG}], updated:t}));   // A's clock is behind: A loses the conflict
  cloud.advance(5000); const b=body(cloud.doc('notes','n1')); b.blocks=[{...b.blocks[0], text:'коротко (телефон)'}]; b.updated=cloud.now(); cloud.write('notes',{id:'n1', ...b},{dev:'phone', dn:'Телефон'});
  await A.off(true); await idle(A);
  const n=A.db.get('notes','n1'), copies=A.db.all('versions').filter(v=>v.note==='n1' && v.reason==='copy'), c1=copies[0];
  ok('1b the phone\'s text won; one conflict copy holds the big block in full with its hash ('+(c1? c1.blocks[0].s.length : '-')+' chars)', n.blocks[0].text==='коротко (телефон)' && copies.length===1 && c1.blocks[0].s===BIG && typeof c1.blocks[0].h==='string' && c1.blocks[0].h.length>0 && c1.size>BIG.length);
  ok('1c the unique text is kept somewhere on the device', JSON.stringify(A.db.all('versions')).includes('UNIQUE-A-1'));
  // a second round that differs only in the big body: a second copy, not a duplicate of the first by sig
  await A.off(false); await edit(A,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:big2}], updated:t}));
  cloud.advance(5000); const b2=body(cloud.doc('notes','n1')); b2.blocks=[{...b2.blocks[0], text:'коротко (телефон 2)'}]; b2.updated=cloud.now(); cloud.write('notes',{id:'n1', ...b2},{dev:'phone', dn:'Телефон'});
  await A.off(true); await idle(A);
  const copies2=A.db.all('versions').filter(v=>v.note==='n1' && v.reason==='copy');
  ok('1d two copies that differ only in the big block are both kept ('+copies2.length+')', copies2.length===2 && copies2.some(c=>c.blocks[0].s===big2) && new Set(copies2.map(c=>c.sig)).size===2 && cloud.doc('notes','n1').rev===3); }

/* ── 2. a version that comes before its note, then a later state of it: applied in the latest state once the note arrives ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  cloud.write('notes',{id:'w1', title:'Пізня', blocks:[{id:'b',row:1,fx:0,text:'пізній коміт'}], created:cloud.now(), updated:cloud.now()},{dev:'phone', commitAt:cloud.now()+60000});   // hidden from page and listen for a minute
  cloud.write('versions',{id:'vW', note:'w1', t:cloud.now(), name:'Перша назва', title:'Пізня', blocks:[{id:'b',row:1,fx:0,text:'пізній коміт'}]},{dev:'phone'});
  cloud.write('versions',{id:'vW', note:'w1', t:cloud.now(), name:'Друга назва', title:'Пізня', blocks:[{id:'b',row:1,fx:0,text:'пізній коміт'}]},{dev:'phone'});
  await idle(A); const m=A.db.get('sync','meta:v:vW'), seen=A.db.get('sync','seen:v:vW');
  ok('2 both states came before the note: the version waits in its latest state (rev 2), seen is rev 2, nothing stored', !A.db.get('notes','w1') && !!m && !!m.wait && m.wait.rev===2 && m.wait.name==='Друга назва' && seen.rev===2 && !A.db.get('versions','vW'));
  cloud.advance(61000); cloud.pump(); await idle(A); const v=A.db.get('versions','vW');
  ok('2b the note arrived: the version is stored with the second name, no quarantine, the wait is over', !!A.db.get('notes','w1') && !!v && v.name==='Друга назва' && !A.db.get('sync','quarantine:v:vW') && !(A.db.get('sync','meta:v:vW')||{}).wait && !A.logs.some(e=>e.t==='quarantine' && e.id==='vW')); }

/* ── 3. the listener's deliveries are reads; the budget stops the listeners; the next day brings them back ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); for(let i=0;i<5;i++) cloud.write('notes',{id:'s'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'s'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  const G=await mk(cloud,'G',{budgets:{reads:30, writes:1000}}); await idle(G); const r0=G.sync._S.quota.reads, subs0=cloud.subs.filter(s=>s.dev==='G').length;
  for(let i=0;i<18;i++){ cloud.advance(120000); cloud.write('notes',{id:'d'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'d'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); }   // two minutes apart: the next day's catch-up and snapshot read only the last few, within their windows
  await idle(G); const r1=G.sync._S.quota.reads, subs1=cloud.subs.filter(s=>s.dev==='G').length, st=G.sync.status();
  ok('3 eighteen deliveries counted as reads ('+r0+' → '+r1+' with '+subs0+' listeners before); the budget of 30 is spent on the way: status «limit», no listeners left ('+subs1+')', subs0===2 && r1>r0 && r1>=30 && r1<=r0+18 && st.code==='limit' && subs1===0 && G.logs.some(e=>e.t==='limit'));
  cloud.write('notes',{id:'late1', title:'', blocks:[{id:'b',row:1,fx:0,text:'під час паузи'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); await idle(G);
  ok('3b nothing is read while paused', !G.db.get('notes','late1') && G.sync._S.quota.reads===r1);
  // a reconnect while paused brings nothing back; the step names the next day as its wake-up time
  await G.off(false); await G.off(true); await idle(G); await edit(G,'s0',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'s0 (G під час паузи)'}], updated:t})); await idle(G); const stepR=await G.sync.step();   // a local edit waits in the queue: the next useful wake-up is still the next day, not the next step
  for(let i=0;i<2;i++){ cloud.advance(1000); cloud.write('notes',{id:'p'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'p'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); } await idle(G);
  ok('3c offline → online while paused: still no listeners ('+cloud.subs.filter(s=>s.dev==='G').length+'), reads unchanged ('+G.sync._S.quota.reads+'), the edit waits in the queue, the step wakes on the next day ('+Math.round((stepR.next-cloud.now())/60000)+' min)', G.sync.jobs().includes('s0') && !cloud.doc('notes','s0').blocks[0].text.includes('G під час паузи') && stepR.next-cloud.now()>60000 && cloud.subs.filter(s=>s.dev==='G').length===0 && G.sync._S.quota.reads===r1 && !G.db.get('notes','p0') && Number.isFinite(stepR.next) && stepR.next>cloud.now() && S.dayKey(stepR.next)!==S.dayKey(cloud.now()));
  // a restart on the same day over the same store: the pause is restored from the stored quota before anything is read
  G.sync.stop(); const G2=device(cloud,'G',{budgets:{reads:30, writes:1000}, db:G.db}); await G2.sync.setOwner(owner); await G2.sync.start(); await idle(G2);
  ok('3d a new engine over the store on the same day: paused from the start, no listeners, nothing read ('+G2.sync._S.quota.reads+')', G2.sync._S.paused && G2.sync.status().code==='limit' && cloud.subs.filter(s=>s.dev==='G').length===0 && G2.sync._S.quota.reads===r1 && !G2.db.get('notes','late1'));
  cloud.advance(86400e3); await idle(G2); const subs2=cloud.subs.filter(s=>s.dev==='G').length;
  ok('3e the next day: the listeners are back ('+subs2+'), the notes written during the pause arrived, the budget counts anew ('+G2.sync._S.quota.reads+' reads)', subs2===2 && !!G2.db.get('notes','late1') && !!G2.db.get('notes','p1') && G2.sync.status().code!=='limit' && G2.sync._S.quota.reads<30 && cloud.doc('notes','s0').blocks[0].text==='s0 (G під час паузи)'); }

/* ── 3f. the limit reached during the first catch-up: the page stays due but forbidden, and the step still names the next day ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); for(let i=0;i<20;i++){ cloud.advance(120000); cloud.write('notes',{id:'c'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'c'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); }   // two minutes apart: the next day's windows hold only the last few
  const H=await mk(cloud,'H',{budgets:{reads:15, writes:1000}}); await idle(H); H.sync._S.refetch.add('c0');   // the first page alone spends the budget; a refetch waits as well
  const active=()=>!!((H.sync._S.catchup.notes && H.sync._S.catchup.notes.active) || (H.sync._S.catchup.versions && H.sync._S.catchup.versions.active));
  const steps=[]; for(let i=0;i<3;i++){ const r=await H.sync.step(); steps.push({did:r.did, wait:r.next-cloud.now()}); } const reads=H.sync._S.quota.reads;
  ok('3f paused during the first load: a catch-up is still active, three steps are idle and every one names the next day ('+steps.map(x=>x.did+':'+Math.round(x.wait/60000)+'min').join(' ')+'), reads stay at '+reads, H.sync._S.paused && active() && steps.every(x=>x.did==='idle' && x.wait>60000 && S.dayKey(cloud.now()+x.wait)!==S.dayKey(cloud.now())) && reads>=15 && H.sync._S.quota.reads===reads);
  cloud.advance(86400e3); await idle(H);
  ok('3g the next day the catch-up finishes within the budget ('+H.sync._S.quota.reads+' reads) and all the notes are here', !active() && H.db.all('notes').length===20 && H.sync.status().code!=='limit' && H.sync._S.quota.reads<15); }

/* ── 4. a fallback copy's move decides over the stored record inside the transaction, not over an earlier look at it ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await edit(A,'f1',(C,t)=>({title:'Резерв', blocks:[{id:'b',row:1,fx:0,text:'стан A'}], created:t, updated:t})); await idle(A);
  const look=A.db.get('notes','f1');   // what a caller saw before the move
  await A.sync.writeLocal('f1',(C,m,t)=>({note:{...C, blocks:[{...C.blocks[0], text:'стан B'}]}, keepUpdated:true}));   // another write lands meanwhile, with the same updated
  ok('4 the record changed under the same updated ('+look.updated+')', A.db.get('notes','f1').blocks[0].text==='стан B' && A.db.get('notes','f1').updated===look.updated);
  const copy={id:'f1', title:'Резерв', blocks:[{id:'b',row:1,fx:0,text:'стан C (резервна копія)'}], created:look.created, updated:look.updated+5000}; let seen=null;
  const r=await A.sync.importMany(C=>{ seen=C; return [copy, {...C, id:'bk1', title:'Резервна копія'}]; }, {id:'f1'});   // the decision (as fbPut makes it) runs inside the transaction
  const n=A.db.get('notes','f1'), bk=A.db.get('notes','bk1');
  ok('4b the decision saw the stored record (B), the copy moved in and the backup holds B, not A', r.ok && r.results.length===2 && !!seen && seen.blocks[0].text==='стан B' && n.blocks[0].text==='стан C (резервна копія)' && !!bk && bk.blocks[0].text==='стан B' && JSON.stringify(A.db.all('notes')).includes('стан B'));
  await idle(A); ok('4c both reached the cloud', cloud.doc('notes','f1').blocks[0].text==='стан C (резервна копія)' && !!cloud.doc('notes','bk1') && cloud.doc('notes','bk1').blocks[0].text==='стан B'); }
/* ── 5. two engines over one store (§4.10): the device record, has-try, two runners of one attempt, the cursor, reload() after a limit, checkOwner() ── */
const defer=()=>{ let res; const promise=new Promise(r=>{ res=r; }); return {promise, res}; };
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
{ const cloud=new TestCloud({start:1_700_000_000_000}); const db=new MemStore(); db.data.sync.set('device',{k:'device', id:'D', name:'Device D'});
  const A=await mk(cloud,'A',{db}), B=await mk(cloud,'B',{db});
  ok('5 both engines take the device id and name from the store, not from their own deps ('+A.sync.devId+', '+B.sync.devId+')', A.sync.devId==='D' && B.sync.devId==='D' && A.sync.devName==='Device D');
  // (a) has-try: A read the cloud before B insured an attempt; A must not insure a second one over it (§4.5 step 1)
  await edit(A,'h1',(C,t)=>({title:'Два бігуни', blocks:[{id:'b',row:1,fx:0,text:'перша правка'}], created:t, updated:t}));
  const hA=defer(), hB=defer(); cloud.fault('hold',{dev:'A', op:'get', promise:hA.promise}); cloud.fault('hold',{dev:'B', op:'txn', promise:hB.promise});
  const stepA=A.sync.step(); await tick();   // A: the job → cloud.get, held after its (empty) read
  const stepB=B.sync.step(); await tick();   // B: reads nothing, insures op_B and runs it → held inside the cloud transaction
  const tr1=db.get('sync','try:n:h1');
  ok('5a B insured an attempt while A still waits for its read', !!tr1 && tr1.expect===0 && !!A.sync._S.netBusy);
  await edit(A,'h1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'друга правка'}], updated:t}));   // lrev 2 while both are in flight
  hA.res(); await stepA;   // A goes on with its stale read: no document, no base → insureTx finds B's attempt
  const tr2=db.get('sync','try:n:h1'), insA=A.logs.filter(e=>e.t==='insure' && e.id==='h1').map(e=>e.ins);
  ok('5b A did not insure over it: the attempt is still B\'s (A\'s insure: '+insA.join(',')+')', !!tr2 && tr2.op===tr1.op && insA.includes('has-try') && !insA.includes('insured'));
  hB.res(); await stepB; await idle(A,B);
  const doc=cloud.doc('notes','h1'), commits=cloud.events.filter(e=>e.t==='commit' && e.id==='h1'), copies=db.all('versions').filter(v=>v.note==='h1' && v.reason==='copy');
  ok('5c B\'s attempt was accepted and the second edit followed as a fast-forward: rev '+doc.rev+', '+commits.length+' commits, «'+doc.blocks[0].text+'», dev '+doc.dev+', no conflict copies ('+copies.length+'), nothing left in the queue', doc.rev===2 && commits.length===2 && doc.blocks[0].text==='друга правка' && doc.dev==='D' && doc.dn==='Device D' && !copies.length && !db.get('sync','try:n:h1') && !db.get('sync','out:n:h1'));
  // (b) two runners of one attempt: A is held inside the cloud transaction, B runs the same try: to its end; A's finish then finds the attempt gone
  await edit(A,'h2',(C,t)=>({title:'Та сама спроба', blocks:[{id:'b',row:1,fx:0,text:'спроба'}], created:t, updated:t}));
  const h2=defer(); cloud.fault('hold',{dev:'A', op:'txn', promise:h2.promise});
  const stepA2=A.sync.step(); await tick();
  const trA=db.get('sync','try:n:h2'); ok('5d A insured op '+(trA||{}).op+' and is held in the cloud transaction', !!trA && !!A.sync._S.netBusy);
  await idle(B);   // B finds the attempt in the store and runs it
  const d1=cloud.doc('notes','h2'), m1=db.get('sync','meta:n:h2');
  ok('5e B finished A\'s attempt: rev 1 with the receipt, the try is gone, the base is set, no job', !!d1 && d1.rev===1 && d1.rcpt.D===trA.op && !db.get('sync','try:n:h2') && !!m1 && !!m1.base && m1.base.rev===1 && !db.get('sync','out:n:h2'));
  h2.res(); await stepA2; await idle(A,B);
  const commits2=cloud.events.filter(e=>e.t==='commit' && e.id==='h2');
  ok('5f A\'s run of the same attempt wrote nothing: one commit, rev 1, A forgot the attempt, nothing in the queue', commits2.length===1 && cloud.doc('notes','h2').rev===1 && !A.sync.tries().includes('h2') && !db.get('sync','out:n:h2') && !db.get('sync','try:n:h2') && (db.get('sync','seen:n:h2')||{}).rev===1);
  // (c) the cursor never moves back: a late delivery applied by a runner whose memory is behind the store
  for(let i=0;i<3;i++){ cloud.advance(10000); cloud.write('notes',{id:'c'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'c'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); }
  await idle(A,B); const cur0=db.get('sync','cursor:notes');
  ok('5g three documents arrived, the stored cursor stands at the last one', !!cur0 && cur0.id==='c2' && !!db.get('notes','c2'));
  A.sync._S.cursor.notes={srv:cloud.doc('notes','c0').srv, id:'c0'};   // an old leader's memory
  A.sync._S.inbox.push({col:'notes', doc:cloud.doc('notes','c1'), source:'delivery'}); await A.sync.step();
  const cur1=db.get('sync','cursor:notes');
  ok('5h a late delivery of c1 by the runner with the old memory leaves the stored cursor at c2 and brings its memory forward ('+A.sync._S.cursor.notes.id+')', cur1.id==='c2' && A.sync._S.cursor.notes.id==='c2');
  // (e) checkOwner(): the store against this engine's memory
  ok('5i checkOwner: the store matches this engine', await A.sync.checkOwner()===true);
  await B.sync.setOwner({env:'test', uid:'u2', email:'v@test'});
  ok('5j another tab changed the owner: checkOwner of the old engine says so', await A.sync.checkOwner()===false && await B.sync.checkOwner()===true); }

/* ── 5n. a page of the old owner, applied after the owner changed, leaves nothing to the new one: no document, no cursor, no «done» (both collections) ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const db=new MemStore(); db.data.sync.set('device',{k:'device', id:'D', name:'Device D'});
  for(let i=0;i<3;i++){ cloud.advance(1000); cloud.write('notes',{id:'o'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'o'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); }
  const A=device(cloud,'A',{db}); A.online=false;   // the listener delivers nothing: the documents come by the catch-up page only
  await A.sync.setOwner(owner); const hP=defer(); cloud.fault('hold',{dev:'A', op:'page', promise:hP.promise});
  await A.sync.start(); const stepA=A.sync.step(); await tick();   // the first page of the catch-up is read and held
  const B=device(cloud,'B',{db}); await B.sync.setOwner({env:'test', uid:'u2', email:'v@test'});   // another tab changed the owner meanwhile
  hP.res(); await stepA; await A.sync.idle(20);
  ok('5n the page came after the owner changed: no document applied, no cursor:notes left to the new owner, the catch-up not marked done, the status «reload»', !db.get('sync','cursor:notes') && !A.sync._S.catchupDone.notes && A.status.includes('reload') && !db.get('notes','o0') && db.all('notes').length===0);
  // the same for a page of versions: the notes are caught up under the old owner, the versions page is held, the owner changes, the page comes
  const cloud2=new TestCloud({start:1_700_000_000_000}); const db2=new MemStore(); db2.data.sync.set('device',{k:'device', id:'D', name:'Device D'});
  cloud2.write('notes',{id:'v0', title:'', blocks:[{id:'b',row:1,fx:0,text:'v0'}], created:cloud2.now(), updated:cloud2.now()},{dev:'phone'});
  cloud2.write('versions',{id:'vv', note:'v0', t:cloud2.now(), name:'Назва', title:'', blocks:[{id:'b',row:1,fx:0,text:'v0'}]},{dev:'phone'});
  const C=device(cloud2,'C',{db:db2}); C.online=false; await C.sync.setOwner(owner); const hV=defer(); cloud2.fault('hold',{dev:'C', op:'page', promise:hV.promise, skip:1});   // the second page call is the versions catch-up
  await C.sync.start(); const idleC=C.sync.idle(20); await tick(); await tick();
  ok('5o the notes are caught up and their cursor stored; the versions page is held', !!db2.get('notes','v0') && !!db2.get('sync','cursor:notes') && !db2.get('sync','cursor:versions'));
  const D2=device(cloud2,'E',{db:db2}); await D2.sync.setOwner({env:'test', uid:'u2', email:'v@test'});
  hV.res(); await idleC; await C.sync.idle(20);
  ok('5p the versions page came after the owner changed: no version stored, no cursor:versions, no cursor:notes written back, the status «reload»', !db2.get('versions','vv') && !db2.get('sync','cursor:versions') && !db2.get('sync','cursor:notes') && !C.sync._S.catchupDone.versions && C.status.includes('reload')); }

/* ── 5k. reload(): a tab that spent yesterday's budget is not paused when it leads again today ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const db=new MemStore();
  const G=await mk(cloud,'G',{db, budgets:{reads:40, writes:1000}}); await idle(G);
  for(let i=0;i<38;i++){ cloud.advance(120000); cloud.write('notes',{id:'d'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'d'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); }   // two minutes apart: the next day's windows hold only the last few
  await idle(G); ok('5k the budget of the day is spent on the deliveries: paused', G.sync._S.paused && G.sync.status().code==='limit');
  cloud.advance(86400e3);   // the next day: another tab leads first and stores today's quota
  const H=device(cloud,'H',{db, budgets:{reads:40, writes:1000}}); await H.sync.setOwner(owner); await H.sync.start(); await idle(H); const q=db.get('sync','quota');
  ok('5l the other tab led today within the budget and stored today\'s quota ('+q.reads+' reads)', !H.sync._S.paused && q.day===S.dayKey(cloud.now()) && q.reads<40);
  H.sync.stop(); await G.sync.reload(); await G.sync.start(); await idle(G);
  cloud.advance(1000); cloud.write('notes',{id:'today1', title:'', blocks:[{id:'b',row:1,fx:0,text:'сьогодні'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); await idle(G);
  ok('5m the old tab leads again after reload(): not paused, it reads today\'s document ('+G.sync._S.quota.reads+' reads today)', !G.sync._S.paused && G.sync.status().code!=='limit' && !!db.get('notes','today1') && G.sync._S.quota.reads<40); }

/* ── 6. a listener the server ends (§4.6): the step starts it again after a growing pause, from the cursor, so what was written meanwhile
   arrives and the status comes back; a refused one is not restarted; an error of a listener already replaced changes nothing ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await idle(A);
  const subs=col=>cloud.subs.filter(s=>s.dev==='A' && s.col===col).length, X=A.sync._S, logsOf=t=>A.logs.filter(e=>e.t===t), rl=col=>(X.relisten||{})[col];
  const phone=id=>cloud.write('notes',{id, title:'', blocks:[{id:'b',row:1,fx:0,text:id}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  const st0=A.sync.status().code, ended=cloud.end('notes',{dev:'A'}); await idle(A); phone('lost1'); await idle(A);   // the virtual clock stands: the pause is not over
  ok('6 the server ended the notes listener (status «'+st0+'» before): no listener, no snapshot, a restart planned; the note written meanwhile is not here yet', st0==='synced' && ended===1 && subs('notes')===0 && !X.snapshot.notes && !!rl('notes') && logsOf('listen-error').length===1 && !A.db.get('notes','lost1') && A.sync.status().code!=='synced');
  cloud.advance(1000); await idle(A);
  ok('6b the step started it again from the cursor: one listener, its snapshot came, the note written meanwhile arrived, status «'+A.sync.status().code+'»', subs('notes')===1 && X.snapshot.notes && !rl('notes') && logsOf('relisten').length===1 && !!A.db.get('notes','lost1') && A.sync.status().code==='synced');
  cloud.advance(100); cloud.fault('fail',{dev:'A', op:'listen', n:2}); cloud.end('notes',{dev:'A'}); await idle(A); const waits=[];   // the listener lived past the longest pause: the count starts at 1
  for(let i=0;i<10 && rl('notes');i++){ waits.push(rl('notes').at-cloud.now()); cloud.advance(rl('notes').at-cloud.now()); await idle(A); }
  ok('6c the restarted listener failed twice more: each pause longer than the one before ('+waits.join(', ')+' ms), then it is back; nothing restarted early', waits.length===3 && waits[0]<waits[1] && waits[1]<waits[2] && subs('notes')===1 && X.snapshot.notes && logsOf('relisten').map(e=>e.tries).join()==='1,1,2,3');
  // the device's retryMax is 50 ms: a listener that ends at once keeps the count going, one that lived longer starts it anew
  const lastTries=()=>(logsOf('relisten').slice(-1)[0]||{}).tries, flap=[];
  for(let k=0;k<3;k++){ cloud.end('notes',{dev:'A'}); await idle(A); for(let i=0;i<5 && rl('notes');i++){ cloud.advance(rl('notes').at-cloud.now()); await idle(A); } flap.push(lastTries()); }
  ok('6d a listener that ends right after its snapshot, again and again: the pause keeps growing ('+flap.join(', ')+' tries), it does not restart every retryMin', flap.join()==='4,5,6' && X.snapshot.notes);
  cloud.advance(100); cloud.end('notes',{dev:'A'}); await idle(A); for(let i=0;i<5 && rl('notes');i++){ cloud.advance(rl('notes').at-cloud.now()); await idle(A); }
  ok('6d2 after a listener that lived longer than the longest pause the count starts anew: the next end waits the first pause again', lastTries()===1 && X.snapshot.notes); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); let sync=1, offs=0; const A=device(cloud,'A'), X=A.sync._S, rl=col=>(X.relisten||{})[col];
  const listen=A.proxy.listen; A.proxy.listen=(c,from,onDocs,onErr)=>{ if(c==='notes' && sync){ sync--; onErr(Object.assign(new Error('refused at once'),{code:'unavailable'})); return ()=>{ offs++; }; } return listen(c,from,onDocs,onErr); };   // an adapter that reports the error before listen() returns
  await A.sync.setOwner(owner); await A.sync.start(); await A.sync.idle(300);
  ok('6g an error reported inside listen(), before it returned: no listener kept, its handle closed once, a restart planned', !A.sync._S.listen.notes && offs===1 && !!rl('notes') && !cloud.subs.some(s=>s.dev==='A' && s.col==='notes'));
  cloud.advance(1000); await idle(A);
  ok('6g2 the restart brings the listener back: one listener, its snapshot, status «'+A.sync.status().code+'»', cloud.subs.filter(s=>s.dev==='A' && s.col==='notes').length===1 && X.snapshot.notes && !rl('notes') && A.sync.status().code==='synced'); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await idle(A);
  const subs=col=>cloud.subs.filter(s=>s.dev==='A' && s.col===col).length, X=A.sync._S, logsOf=t=>A.logs.filter(e=>e.t===t), rl=col=>(X.relisten||{})[col];
  const old=cloud.subs.find(s=>s.dev==='A' && s.col==='notes'); await A.off(false); await A.off(true); await idle(A); const errs=logsOf('listen-error').length;
  old.onErr(Object.assign(new Error('late'),{code:'unavailable'})); await idle(A);
  ok('6e an error of a listener already replaced by a reconnect changes nothing: the new one stays, with its snapshot, nothing planned', old!==cloud.subs.find(s=>s.dev==='A' && s.col==='notes') && subs('notes')===1 && !!X.listen.notes && X.snapshot.notes && !rl('notes') && logsOf('listen-error').length===errs && A.sync.status().code==='synced');
  cloud.end('versions',{dev:'A', code:'permission-denied'}); await idle(A); cloud.advance(60000); await idle(A);
  ok('6f a refused listener is not started again: denied, no versions listener, nothing planned', X.denied && subs('versions')===0 && !rl('versions') && A.sync.status().code==='denied'); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=device(cloud,'A'), X=A.sync._S, rl=col=>(X.relisten||{})[col]; A.clock=3600000;   // the device clock an hour ahead; the cloud's clock only moves forward
  await A.sync.setOwner(owner); await A.sync.start(); await idle(A); cloud.end('notes',{dev:'A'}); await idle(A); const planned=rl('notes') && rl('notes').at-(cloud.now()+A.clock);
  A.clock=0; cloud.write('notes',{id:'back1', title:'', blocks:[{id:'b',row:1,fx:0,text:'back1'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  const wake=(await A.sync.step()).next-cloud.now(); cloud.advance(51); await idle(A);   // retryMax of the device is 50 ms
  ok('6h the device clock went back an hour while a restart waited ('+planned+' ms planned): the step wakes within the longest pause ('+wake+' ms) and restarts it; the note written meanwhile arrived, status «'+A.sync.status().code+'»', planned===10 && wake<=50 && cloud.subs.filter(s=>s.dev==='A' && s.col==='notes').length===1 && !!A.db.get('notes','back1') && A.sync.status().code==='synced'); }

console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
