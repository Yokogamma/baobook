// The sync core under Node: the guarantees a review found broken (docs/SYNC-PLAN.md §4.7, §4.6, §4.17). A conflict copy keeps a block over the
// automatic history's body limit in full, and two copies that differ only in such a block are both kept; a version that arrives before its
// note is applied in its latest state once the note comes (no quarantine of the earlier state); the listener's deliveries count as reads,
// the budget stops the listeners (a reconnect or a restart on the same day does not bring them back, the next day does); a fallback copy's
// move decides over the stored record inside its own transaction.
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
console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
