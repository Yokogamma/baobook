// The sync core under Node: conflict copies in the interface (docs/SYNC-PLAN.md §4.19, PR 4b). A merge that keeps a losing side emits `copy` with
// the other side's device and copiesCount() counts it; restoreCopy puts the copy's state into the note through the write path (lrev, the job), keeps
// the state before as an inline «base» record and removes the copy, in one transaction refused whole by a moved epoch; its undo merges the state before
// over what arrived meanwhile and puts the copy back; dropCopies and putCopies (also into a revived note, never into a note that is gone); the 30-day
// rule without an owner keeps a note with a copy; a copy is never queued or sent.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const owner={env:'test', uid:'u1', email:'u@test'};
function device(cloud, name, o={}){ const d={name, db:o.db||new MemStore(), online:true, logs:[], changes:[]};
  d.proxy={ get:(c,i)=>cloud.get(c,i,{dev:name}), page:(c,q,n)=>cloud.page(c,q,n,{dev:name}), totals:c=>cloud.totals(c,{dev:name}), scan:(c,q,n)=>cloud.scan(c,q,n,{dev:name}), txn:(c,i,f)=>cloud.txn(c,i,f,{dev:name}),
    listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr,{dev:name}) };
  d.sync=S.makeSync({db:d.db, cloud:d.proxy, now:()=>cloud.now(), random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50}, log:e=>d.logs.push(e), onChange:e=>d.changes.push(e), onHistory:id=>d.changes.push({kind:'history', id})});
  d.off=async on=>{ d.online=on; d.sync.online(on); }; return d; }
async function mk(cloud, name, o={}){ const d=device(cloud, name, o); if(o.owner!==false) await d.sync.setOwner(owner); await d.sync.start(); await d.sync.idle(300); return d; }
const idle=async(...ds)=>{ for(let i=0;i<4;i++) for(const d of ds) await d.sync.idle(400); };
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const two=(a,b)=>[{id:'b1',row:1,fx:0,text:a},{id:'b2',row:2,fx:0,text:b}];
const copiesOf=(d,n)=>d.db.all('versions').filter(v=>v.note===n && v.reason==='copy');
// the same block edited on two offline devices: the one that merges second keeps a copy of the losing side
async function conflict(cloud){ const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await edit(A,'n1',(C,t)=>({title:'Конфлікт', blocks:two('спільне','друге'), created:t, updated:t})); await idle(A,B);
  await A.off(false); await B.off(false); await edit(A,'n1',(C,t)=>({...C, blocks:two('з A','друге'), updated:t})); cloud.advance(1000); await edit(B,'n1',(C,t)=>({...C, blocks:two('з B','друге'), updated:t}));
  await A.off(true); await idle(A); await B.off(true); await idle(A,B); return {A, B}; }

/* ── 1. a merge keeps a copy: `copy` names the other side; copiesCount counts it; the copy is never queued or sent ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const {A, B}=await conflict(cloud); const M=copiesOf(A,'n1').length? A : B, O=M===A? B : A, ev=M.changes.find(e=>e.kind==='copy');
  ok('1 one device keeps one copy, the other none ('+M.name+')', copiesOf(M,'n1').length===1 && copiesOf(O,'n1').length===0);
  ok('1a `copy` names the other side\'s device ('+JSON.stringify(ev)+')', !!ev && ev.note==='n1' && ev.dn==='Device '+O.name && !ev.tab);
  const map=await M.sync.copiesCount(); ok('1b copiesCount: n1 → 1', map.get('n1')===1 && map.size===1);
  const cid=copiesOf(M,'n1')[0].id; ok('1c the copy is never queued, attempted or in the cloud', !M.db.get('sync','out:v:'+cid) && !M.db.get('sync','try:v:'+cid) && !cloud.doc('versions',cid));

/* ── 2. restoreCopy: the note takes the copy, the state before is kept inline as «base», the copy goes; the note is queued ── */
  const copy=copiesOf(M,'n1')[0], C0=M.db.get('notes','n1'), state={title:copy.title, blocks:copy.blocks.map(e=>({id:e.id, row:e.row, fx:e.fx, text:e.s}))}, lrev0=M.db.get('sync','meta:n:n1').lrev, c0=M.changes.length;
  const r=await M.sync.restoreCopy('n1', copy.id, state); const C1=M.db.get('notes','n1');
  const base=M.db.all('versions').find(v=>v.note==='n1' && v.reason==='base' && v.inline);
  ok('2 restoreCopy: the note holds the copy\'s text, the copy is gone, lrev moved, a job is queued', r.ok && C1.blocks[0].text===copy.blocks.find(e=>e.id==='b1').s && !M.db.get('versions',copy.id) && M.db.get('sync','meta:n:n1').lrev===lrev0+1 && !!M.db.get('sync','out:n:n1'));
  ok('2a the state before is a «base» record with its bodies inline', !!base && base.blocks.find(e=>e.id==='b1').s===C0.blocks[0].text);
  ok('2b it tells the page: copies {n1}', M.changes.slice(c0).some(e=>e.kind==='copies' && e.note==='n1'));
  await idle(M,O); ok('2c the restored text reaches the cloud and the other device', cloud.doc('notes','n1').blocks[0].text===copy.blocks.find(e=>e.id==='b1').s && O.db.get('notes','n1').blocks[0].text===C1.blocks[0].text);

/* ── 3. its undo after the other device's edit of another block: the restored state goes back, that edit stays, the copy is back ── */
  await edit(O,'n1',(C,t)=>({...C, blocks:[C.blocks[0], {...C.blocks[1], text:'друге, змінене'}], updated:t})); await idle(O,M);
  const u=await M.sync.undoRestore('n1', {restored:r.note, before:r.before, copy:r.copy}); const C2=M.db.get('notes','n1');
  ok('3 undo: b1 is back to the state before, b2 keeps the other device\'s edit, the copy is back ('+JSON.stringify(C2.blocks.map(b=>b.text))+')', u.ok && C2.blocks[0].text===C0.blocks[0].text && C2.blocks[1].text==='друге, змінене' && !!M.db.get('versions',copy.id));
  await idle(M,O); ok('3a the undo is a local write that reaches the cloud', cloud.doc('notes','n1').blocks[0].text===C0.blocks[0].text);

/* ── 4. dropCopies and putCopies ── */
  const d=await M.sync.dropCopies('n1',[copy.id]); ok('4 dropCopies removes the copy and returns it', d.ok && d.removed.length===1 && !M.db.get('versions',copy.id) && (await M.sync.countCopies('n1'))===0);
  const p=await M.sync.putCopies('n1', d.removed); ok('4a putCopies brings it back', p.ok && p.id==='n1' && !!M.db.get('versions',copy.id)); }

/* ── 5. a moved epoch refuses restoreCopy whole ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const {A, B}=await conflict(cloud); const M=copiesOf(A,'n1').length? A : B, copy=copiesOf(M,'n1')[0], C0=M.db.get('notes','n1');
  await M.db.tx(['sync'],'readwrite', async t=>{ t.put('sync',{k:'epoch', id:'other'}); });
  const r=await M.sync.restoreCopy('n1', copy.id, {title:'x', blocks:[]});
  ok('5 the epoch moved: refused, the note and the copy as they were, no base record', !r.ok && r.code==='epoch' && JSON.stringify(M.db.get('notes','n1'))===JSON.stringify(C0) && !!M.db.get('versions',copy.id) && !M.db.all('versions').some(v=>v.reason==='base' && v.inline)); }

/* ── 6. putCopies follows a revival; a note that is gone takes none ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const db=new MemStore(); const A=await mk(cloud,'A',{db});
  await A.db.tx(['notes','versions','sync'],'readwrite', async t=>{ t.put('notes',{id:'n9', title:'Відроджена', blocks:[], created:1, updated:1}); t.put('sync',{k:'purged:n:n1', rev:3, revivedAs:'n9'}); });
  const rec={id:'vc1', note:'n1', t:1, w:1, reason:'copy', keep:1, inline:1, title:'', sig:'s', blocks:[], size:1};
  const p=await A.sync.putCopies('n1',[rec]); ok('6 a copy whose note was revived goes into the revived note', p.ok && p.id==='n9' && A.db.get('versions','vc1').note==='n9');
  const g=await A.sync.putCopies('nX',[{...rec, id:'vc2', note:'nX'}]); ok('6a a note that is gone takes no copy back', !g.ok && g.code==='gone' && !A.db.get('versions','vc2')); }

/* ── 7. without an owner the 30-day rule keeps a note with a copy, inside its own transaction ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A',{owner:false}); const old=cloud.now()-31*864e5;
  await A.db.tx(['notes','versions'],'readwrite', async t=>{ t.put('notes',{id:'t1', title:'', blocks:[], created:1, updated:old, deleted:old}); t.put('notes',{id:'t2', title:'', blocks:[], created:1, updated:old, deleted:old});
    t.put('versions',{id:'vk', note:'t1', t:old, w:old, reason:'copy', keep:1, inline:1, title:'', sig:'k', blocks:[], size:1}); });
  const lim=cloud.now()-30*864e5, r1=await A.sync.purgeOldLocal('t1', lim), r2=await A.sync.purgeOldLocal('t2', lim);
  ok('7 the note with a copy stays («copies»), the one without goes', r1.ok && !r1.purged && r1.kept==='copies' && !!A.db.get('notes','t1') && r2.ok && r2.purged && !A.db.get('notes','t2'));
  const r3=await A.sync.purgeOldLocal('t1', old-1); ok('7a a note not yet past its days is not touched', r3.ok && !r3.purged && !r3.kept); }

/* ── 8. a block over the history's limit: «Відновити» keeps the state before in full, inline ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); const big='я'.repeat(300000);
  await edit(A,'n1',(C,t)=>({title:'Велика', blocks:two(big,'мале'), created:t, updated:t})); await idle(A);
  await A.db.tx(['versions'],'readwrite', async t=>{ t.put('versions',{id:'vb', note:'n1', t:1, w:1, reason:'copy', keep:1, inline:1, title:'Велика', sig:'b', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'коротко'}], size:7}); });
  const r=await A.sync.restoreCopy('n1','vb',{title:'Велика', blocks:[{id:'b1',row:1,fx:0,text:'коротко'}]}); const base=A.db.all('versions').find(v=>v.reason==='base' && v.inline);
  ok('8 the «base» of a restore keeps a 300 000-character body in full, with its real hash', r.ok && !!base && base.blocks.find(e=>e.id==='b1').s===big && !!base.blocks.find(e=>e.id==='b1').h); }

/* ── 9. a storage fault while restoring: nothing is half done, the copy stays ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const db=new MemStore(), orig=db.tx.bind(db); let fail=false;
  db.tx=(stores,mode,fn)=>orig(stores,mode,async T=>{ if(fail){ const put=T.put; T.put=(st,v)=>{ if(st==='notes') throw Object.assign(new Error('write failed'),{name:'UnknownError'}); return put(st,v); }; } return fn(T); });
  const A=await mk(cloud,'A',{db}); await edit(A,'n1',(C,t)=>({title:'Збій', blocks:two('як було','друге'), created:t, updated:t})); await idle(A);
  await A.db.tx(['versions'],'readwrite', async t=>{ t.put('versions',{id:'vf', note:'n1', t:1, w:1, reason:'copy', keep:1, inline:1, title:'Збій', sig:'f', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'з копії'}], size:7}); });
  const C0=JSON.stringify(A.db.get('notes','n1')), lrev0=A.db.get('sync','meta:n:n1').lrev; fail=true; const r=await A.sync.restoreCopy('n1','vf',{title:'Збій', blocks:[{id:'b1',row:1,fx:0,text:'з копії'}]}); fail=false;
  ok('9 the note\'s write fails: refused, the note, its lrev and the copy as they were, no «base» record', !r.ok && JSON.stringify(A.db.get('notes','n1'))===C0 && A.db.get('sync','meta:n:n1').lrev===lrev0 && !!A.db.get('versions','vf') && !A.db.all('versions').some(v=>v.reason==='base' && v.inline)); }

/* ── 10. a copy with a body over the history's limit restores it into the note in full; copies from an import and through setOwner are never queued ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A',{owner:false}); const big='ю'.repeat(300000);
  await edit(A,'n1',(C,t)=>({title:'Мала', blocks:two('мале','друге'), created:t, updated:t}));
  await A.db.tx(['versions'],'readwrite', async t=>{ t.put('versions',{id:'vB', note:'n1', t:1, w:1, reason:'copy', keep:1, inline:1, title:'Мала', sig:'B', blocks:[{id:'b1',row:1,fx:0,h:null,s:big}], size:big.length}); });
  const r=await A.sync.restoreCopy('n1','vB',{title:'Мала', blocks:[{id:'b1',row:1,fx:0,text:big},{id:'b2',row:2,fx:0,text:'друге'}]});
  ok('10 the 300 000-character body of the copy is in the note in full', r.ok && A.db.get('notes','n1').blocks[0].text===big);
  const h={versions:[{id:'vI', note:'n1', t:2, w:2, reason:'copy', keep:1, inline:1, title:'Мала', sig:'I', blocks:[{id:'b1',row:1,fx:0,h:'x',s:'з файлу'}], size:7}], blobs:[]};
  const im=await A.sync.importHistory(h,['n1']); await A.sync.setOwner(owner); await A.sync.start(); await idle(A);
  const ids=['vI', ...A.db.all('versions').filter(v=>v.reason==='copy').map(v=>v.id)];
  ok('10a a copy from a history file and every copy bound to an account by setOwner: no job, no attempt, no document', im.ok && im.added===1 && ids.every(id=>!A.db.get('sync','out:v:'+id) && !A.db.get('sync','try:v:'+id) && !cloud.doc('versions',id)) && !!cloud.doc('notes','n1')); }

console.log(fails? '\n'+fails+' FAILED' : '\nall passed'); process.exit(fails? 1 : 0);
