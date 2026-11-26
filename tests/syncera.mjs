// The sync core with the era of a screen (docs/OWNER-ERA-PLAN.md, stage 2; Node, over MemStore). With `deps.era` and the rules of
// public/owner/model.js (`deps.ownerModel`, §7.1) the core is two objects (§7.3): the writer (the user's writes and reads by the era, setOwner) and
// runners (the cloud side, each of one epoch, owner and adapter for its whole life). Nothing in the app makes either yet, and without `deps.era` the
// engine is main's (the other sync*.mjs run over it unchanged). The cases drive them through the test page of tests/lib/erapage.mjs (`d.sync`), and
// reach the two objects themselves (`d.sync.writer`, `d.sync.runner`) where the order of calls is the point. Here:
//   W.   the wiring contract of §7.1;
//   M.   the matrix of §8.1, one row per operation of the user: (a) through the writer, right behind a change that kept the records, the operation is
//        accepted and decides by the new owner; (b) called with the era of a screen read before an erase, it is refused;
//   5s.  the cases of #146 (`syncguard` 5s–5s10) read again by §8.3 and §7.3.8;
//   B.   the cases beside the matrix (§8.1), the rules of §3.3, §3.4, §3.6 and §3.7 one by one, and the cases of the review rounds, on the end of an instance;
//   N.   the end of a runner (§7.3.2): a call already out, an identity the store has left, a transaction already admitted;
//   P.   runners of one epoch (§7.3.5), the quota as deltas and the sweep (§7.3.2), as §7.3.9 pins them.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { eraPage } from './lib/erapage.mjs';
import * as OM from '../public/owner/model.js';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const U=n=>({env:'test', uid:n, email:n+'@test'});
const eraNow=db=>OM.eraOf(db.get('sync','epoch')||null);   // what a new screen reads with its records
// a store whose next readonly transactions are planned: pass, hold until released (then run, or fail), fail, fail with a frozen error
const planned=db=>{ const plan=[], held=[]; const real=db.tx.bind(db), W={plan, opened:0, release:()=>{ for(const r of held.splice(0)) r(); }}; let release=null; const hold=r=>{ held.push(r); release=r; };   // release: every held read goes on, in the order it was asked for   // opened: transactions asked for so far, counted in the call itself
  W.tx=(st,mode,fn)=>{ W.opened++; const a=mode==='readonly' && plan.length? plan.shift() : 'pass';
    if(a==='fail') return Promise.reject(Object.assign(new Error('load failed'),{name:'UnknownError'}));
    if(a==='freeze') return Promise.reject(Object.freeze(Object.assign(new Error('load failed'),{name:'UnknownError', code:'frozen-x'})));
    if(a==='hold') return new Promise(hold).then(()=>real(st,mode,fn));
    if(a==='holdfail') return new Promise(hold).then(()=>{ throw Object.assign(new Error('load failed'),{name:'UnknownError'}); });
    return real(st,mode,fn); }; return W; };
// an engine over `db` for a screen of `era`; o.store: the wrapper its transactions go through; o.uid: the user the cloud adapter names
function dev(cloud, name, db, era, o={}){ const d={name, db, logs:[], status:[], changes:[], calls:0, signals:0};
  const c=f=>(...a)=>{ d.calls++; return f(...a); };
  d.proxy={ get:c((col,i)=>cloud.get(col,i,{dev:name})), page:c((col,q,n)=>cloud.page(col,q,n,{dev:name})), totals:c(col=>cloud.totals(col,{dev:name})), scan:c((col,q,n)=>cloud.scan(col,q,n,{dev:name})), txn:c((col,i,f)=>cloud.txn(col,i,f,{dev:name})),
    listen:c((col,from,onDocs,onErr)=>cloud.listen(col,from,onDocs,onErr,{dev:name})) }; if(o.uid) d.proxy.uid=o.uid;
  d.sync=eraPage(S, {db:o.store||db, cloud:d.proxy, now:()=>cloud.now(), random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50}, log:e=>d.logs.push(e), onChange:e=>d.changes.push(e), onStatus:code=>d.status.push(code), onCommit:()=>{ d.signals++; }, era, ownerModel:OM, ...(o.deps||{})}); return d; }
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const note=(d,id,text,x={})=>edit(d,id,(C,t)=>({title:text? id : '', blocks:text? [{id:'b',row:1,fx:0,text}] : [], created:t, updated:t, ...x}));
const code=p=>Promise.resolve(p).then(r=>r && r.ok!==false? 'ok' : (r && r.code)||'refused', e=>'throw:'+((e && e.code)||(e && e.name)));
const cErr=e=>(e.era? 'era:' : e.expect? 'expect:' : '')+(e.code||e.name);   // a refused change of owner: by the era of the screen, or by the epoch of the decision
const epNow=db=>(db.get('sync','epoch')||{}).id||null;
const vrec=(cloud,id,nid,name,x={})=>({id, note:nid, t:cloud.now(), w:cloud.now(), reason:'manual', keep:1, inline:1, title:'', sig:'s-'+id, blocks:[{id:'b',row:1,fx:0,s:'body '+id}], ...(name? {name} : {}), ...x});
const copy=(cloud,id,nid,text)=>({id, note:nid, t:cloud.now(), w:cloud.now(), reason:'copy', keep:1, inline:1, title:'copy', sig:'c-'+id, updated:cloud.now(), dev:'other', blocks:[{id:'b',row:1,fx:0,s:text}]});
const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const START=1_700_000_000_000;

/* ── W. the wiring (§7.1) ── */
{ const cloud=new TestCloud({start:START}), mk=deps=>{ try{ dev(cloud,'W',new MemStore(),deps.era,{deps}); return 'made'; }catch(e){ return e.name; } };
  ok('W1 with an era and no model the engine is not made ('+mk({era:'0', ownerModel:undefined})+'), nor with a model that lacks a rule ('+mk({era:'0', ownerModel:{...OM, judgeWrite:undefined}})+'), nor with an era that is no name ('+mk({era:''})+', '+mk({era:7})+')',
    mk({era:'0', ownerModel:undefined})==='TypeError' && mk({era:'0', ownerModel:{...OM, judgeWrite:undefined}})==='TypeError' && mk({era:''})==='TypeError' && mk({era:7})==='TypeError');
  const plain=S.makeSync({db:new MemStore(), cloud:null, now:()=>1, random:Math.random}), withEra=dev(cloud,'W2',new MemStore(),'0');
  ok('W2 without an era no model is asked for and the engine names no era; with one it names the era it was given', plain.era===undefined && withEra.sync.era==='0');
  // the era is never refreshed from the store: after this engine's own erase its screen is still the old one
  const db=new MemStore(), A=dev(cloud,'W3',db,'0'); await A.sync.setOwner(U('w1')); await note(A,'a','text'); await A.sync.setOwner(null,{erase:true});
  ok('W3 the engine keeps the era of its screen across its own erase (the store is in '+eraNow(db)+', the engine in '+A.sync.era+'): a save from that screen is refused', A.sync.era==='0' && eraNow(db)!=='0' && await code(note(A,'a','again'))==='epoch' && !db.get('notes','a')); }

/* ── M. the matrix of §8.1 ── */
const OPS=['writeLocal','purgeLocal all','purgeLocal here','purgeOldLocal','importNote','importMany','importHistory','version create','version name','version rename','version delete here','version delete all','restoreCopy','undoRestore','dropCopies','putCopies','unqueue','deviceName'];
// the records every row needs, written before the change of owner
async function seed(cloud, A, db){
  for(const id of ['p1','p2','k1','vn']) await note(A,id,'text of '+id);
  await note(A,'old','old trash',{deleted:5}); await note(A,'c1',''); await note(A,'u1','');   // c1, u1: empty notes, which a change of owner queues no job for
  for(const [id,name] of [['vr','To rename'],['vd','Delete here'],['vd2','Delete everywhere']]) await A.sync.versionLocal({op:'create', rec:vrec(cloud,id,'vn',name)});
  db.data.versions.set('va', vrec(cloud,'va','vn',null,{reason:'auto'}));   // an automatic record, to be named
  db.data.versions.set('cp1', copy(cloud,'cp1','c1','restored text')); db.data.versions.set('cp2', copy(cloud,'cp2','k1','a copy')); db.data.versions.set('cp3', copy(cloud,'cp3','k1','another copy')); }
// every operation of the user, in the order of OPS; each returns its promise at once, so its transaction is ordered by the call
function runAll(cloud, A){ const t=cloud.now();
  return [ note(A,'w1','written'),
    A.sync.purgeLocal('p1',{reach:'all'}), A.sync.purgeLocal('p2',{reach:'here'}), A.sync.purgeOldLocal('old', 10),
    A.sync.importNote({id:'i1', title:'import', blocks:[{id:'b',row:1,fx:0,text:'one'}], created:1, updated:1}),
    A.sync.importMany([{id:'i2', title:'import', blocks:[{id:'b',row:1,fx:0,text:'two'}], created:1, updated:1}, {id:'i3', title:'import', blocks:[{id:'b',row:1,fx:0,text:'three'}], created:1, updated:1}]),
    A.sync.importHistory({versions:[vrec(cloud,'vh','k1','From a file')], blobs:[]}, ['k1']),
    A.sync.versionLocal({op:'create', rec:vrec(cloud,'vc','vn','Created')}), A.sync.versionLocal({op:'name', id:'va', name:'Named'}), A.sync.versionLocal({op:'rename', id:'vr', name:'Renamed'}),
    A.sync.versionLocal({op:'delete', id:'vd', reach:'here'}), A.sync.versionLocal({op:'delete', id:'vd2', reach:'all'}),
    A.sync.restoreCopy('c1','cp1',{title:'restored', blocks:[{id:'b',row:1,fx:0,text:'restored text'}]}),
    A.sync.undoRestore('u1',{restored:{title:'', blocks:[], created:t, updated:t}, before:{title:'before', blocks:[{id:'b',row:1,fx:0,text:'as it was'}], created:t, updated:t}, copy:null}),
    A.sync.dropCopies('k1',['cp2']), A.sync.putCopies('k1',[copy(cloud,'cp4','k1','put back')]),
    A.sync.unqueue('k1'), A.sync.deviceName('Renamed device') ]; }

// (a) a first sign-in: every operation is called right behind the change, before its commit is known and before any runner is made
{ const cloud=new TestCloud({start:START}), db=new MemStore(), W=planned(db), A=dev(cloud,'MA',db,'0',{store:W}); await A.sync.start(); await seed(cloud, A, db);
  const jobs0=db.all('sync').filter(r=>r.k.startsWith('out:')).length; A.status.length=0; A.changes.length=0;
  const bind=A.sync.writer.setOwner(U('m1'),{expectEpoch:null}).then(r=>r.changed && !r.erased? 'ok' : 'odd', cErr);   // its transaction is queued first; the page has not heard of it
  const ps=runAll(cloud, A), raw=await Promise.all(ps.map(p=>Promise.resolve(p).then(r=>r, e=>({ok:false, thrown:e.code||e.name})))), R=Object.fromEntries(OPS.map((o,i)=>[o, raw[i]]));
  const g=k=>db.get('sync',k), mem={runner:A.sync.runner, signals:A.signals};
  ok('Ma the change kept the records and committed (the store names '+(g('owner')||{}).uid+', era '+eraNow(db)+'); no runner exists yet ('+mem.runner+'), no job before it ('+jobs0+')',
    (g('owner')||{}).uid==='m1' && eraNow(db)==='0' && mem.runner===null && jobs0===0);
  ok('Ma writeLocal: accepted, the note has its `out:n:` job', R['writeLocal'].ok && !!db.get('notes','w1') && !!g('out:n:w1'));
  ok('Ma purgeLocal confirmed as «all»: a tombstone job, not a local-only delete ('+JSON.stringify({tomb:R['purgeLocal all'].tomb, job:g('out:n:p1')})+')', R['purgeLocal all'].ok && R['purgeLocal all'].tomb===true && !db.get('notes','p1') && !!g('out:n:p1') && g('out:n:p1').tomb===true && !!g('purged:n:p1'));
  ok('Ma purgeLocal confirmed as «here»: refused with `reach` (now «'+R['purgeLocal here'].reach+'»), nothing deleted, no tombstone', R['purgeLocal here'].ok===false && R['purgeLocal here'].code==='reach' && R['purgeLocal here'].reach==='all' && !!db.get('notes','p2') && !!g('out:n:p2') && !g('out:n:p2').tomb && !g('purged:n:p2'));
  ok('Ma purgeOldLocal: the 30-day rule without an owner is not run once the store has one ('+JSON.stringify(R['purgeOldLocal'])+')', R['purgeOldLocal'].ok && R['purgeOldLocal'].purged===false && R['purgeOldLocal'].kept==='owner' && !!db.get('notes','old'));
  ok('Ma importNote and importMany: the job of every note written', R['importNote'].ok && R['importMany'].ok && !!g('out:n:i1') && !!g('out:n:i2') && !!g('out:n:i3'));
  ok('Ma importHistory: the named version is queued', R['importHistory'].ok && R['importHistory'].added===1 && !!g('out:v:vh'));
  ok('Ma versionLocal create, name, rename: the version job of each, and the rename counted in the version\'s meta over the change\'s own (lrev '+(g('meta:v:vr')||{}).lrev+')', (g('meta:v:vr')||{}).lrev===2 && (g('meta:v:vc')||{}).lrev===1 && R['version create'].ok && R['version name'].ok && R['version rename'].ok && !!g('out:v:vc') && !!g('out:v:va') && !!g('out:v:vr') && db.get('versions','vr').name==='Renamed' && db.get('versions','va').name==='Named');
  ok('Ma versionLocal delete confirmed as «here»: refused with `reach`, the version stays, its job is no tombstone', R['version delete here'].ok===false && R['version delete here'].code==='reach' && R['version delete here'].reach==='all' && !!db.get('versions','vd') && !(g('out:v:vd')||{}).tomb);
  ok('Ma versionLocal delete confirmed as «all»: the version goes with a tombstone job', R['version delete all'].ok && R['version delete all'].cloud===true && !db.get('versions','vd2') && !!g('out:v:vd2') && g('out:v:vd2').tomb===true);
  ok('Ma restoreCopy and undoRestore: the note\'s job (both notes were empty: the change itself queued none)', R['restoreCopy'].ok && R['undoRestore'].ok && !!g('out:n:c1') && !!g('out:n:u1') && db.get('notes','c1').title==='restored' && db.get('notes','u1').title==='before');
  ok('Ma dropCopies and putCopies: local only, accepted', R['dropCopies'].ok && R['dropCopies'].removed.length===1 && !db.get('versions','cp2') && R['putCopies'].ok && !!db.get('versions','cp4'));
  ok('Ma unqueue: accepted over the new metas (no refusal by the owner; its own answer is «'+R['unqueue'].code+'»)', !R['unqueue'].thrown && R['unqueue'].code==='receipts');
  ok('Ma deviceName: accepted ('+A.sync.devName+')', R['deviceName'].ok && A.sync.devName==='Renamed device' && g('device').name==='Renamed device');
  ok('Ma no operation waited for anything or told the page of a refusal ('+JSON.stringify(A.status)+'); each commit signalled the runner\'s side ('+mem.signals+' signals), the events went ('+A.changes.filter(e=>e.kind==='version').length+' of versions)',
    !A.status.includes('reload') && !A.status.includes('stale') && mem.signals>=10 && A.changes.some(e=>e.kind==='version' && e.id==='vc') && A.changes.some(e=>e.kind==='purged' && e.id==='p1'));
  const b=await bind; await A.sync.reconcile(); await A.sync.idle(400); await A.sync.idle(400);
  ok('Ma a runner made afterwards reads all of it ('+b+', owner '+(A.sync.owner||{}).uid+'): the notes and versions written in the window reach the new owner\'s cloud, the purged note leaves a tombstone',
    b==='ok' && A.sync.owner.uid==='m1' && !!cloud.doc('notes','w1') && !!cloud.doc('notes','i1') && !!cloud.doc('notes','i3') && !!cloud.doc('notes','c1') && !!cloud.doc('notes','u1') && !!cloud.doc('versions','vc') && !!cloud.doc('versions','vh') && !!cloud.doc('notes','p2') && !cloud.doc('notes','w1').purged); }

// (a) again for a change from one owner to another that keeps the records, made by another engine over the same store (another tab): this engine's
// writer goes on, and «caught up» under the previous owner says nothing of the new owner's cloud: the mark went with the cursor (§3.3 item 5)
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'MB',db,'0'); await A.sync.setOwner(U('m2')); await A.sync.start(); await seed(cloud, A, db); await A.sync.idle(400); await A.sync.idle(400);
  const caught=A.sync._S.everCaughtUp, inCloud=!!cloud.doc('notes','p1'); A.sync.stop();
  const cloud2=new TestCloud({start:START}), X=dev(cloud2,'MB',db,eraNow(db)); await X.sync.setOwner(U('m3'));   // records kept; the new owner's cloud is empty
  for(const k of ['seen:n:p1','try:n:p1']) if(db.get('sync',k)) throw new Error('the change left '+k);
  db.data.sync.set('meta:n:k1',{...db.get('sync','meta:n:k1'), err:'receipts'});   // the new owner's rules refused k1 for its receipts; the old engine's memory knows nothing of it
  A.status.length=0; const ps=runAll(cloud, A), raw=await Promise.all(ps.map(p=>Promise.resolve(p).then(r=>r, e=>({ok:false, thrown:e.code||e.name})))), R=Object.fromEntries(OPS.map((o,i)=>[o, raw[i]])), g=k=>db.get('sync',k);
  ok('Mb unqueue over the new owner\'s metas: accepted, the mark and the job go ('+JSON.stringify(R['unqueue'])+')', R['unqueue'].ok===true && !g('out:n:k1') && !g('meta:n:k1').err);
  ok('Mb another engine changed the owner and kept the records (era '+eraNow(db)+'): every operation of the old engine is still accepted or answered by its own rule ('+OPS.filter((o,i)=>raw[i].thrown || raw[i].code==='epoch').join(', ')+')', !raw.some(r=>r.thrown || r.code==='epoch'));
  ok('Mb «delete forever» decides by the new owner, not by a memory that caught up under the previous one (caught up '+caught+', in the old cloud '+inCloud+'): a tombstone job', caught===true && inCloud && R['purgeLocal all'].tomb===true && (g('out:n:p1')||{}).tomb===true);
  ok('Mb the jobs are the new owner\'s: the saved and imported notes, the versions (the rename counted: lrev '+(g('meta:v:vr')||{}).lrev+'), the reach of a deletion', (g('meta:v:vr')||{}).lrev===2 && !!g('out:n:w1') && !!g('out:n:i2') && !!g('out:v:vc') && !!g('out:v:vh') && R['purgeLocal here'].code==='reach' && R['version delete here'].code==='reach' && (g('out:v:vd2')||{}).tomb===true);
  ok('Mb the screen is not told «reload» ('+JSON.stringify([...new Set(A.status)])+')', !A.status.includes('reload')); }

// (b) the era of a screen read before an erase: every operation is refused and writes nothing; the device name is the exception
for(const who of ['another engine','this engine','a fresh engine of the old screen']){
  const cloud=new TestCloud({start:START}), db=new MemStore(), A0=dev(cloud,'MC',db,'0'); await A0.sync.setOwner(U('m4')); await seed(cloud, A0, db);
  const era0=eraNow(db); if(who==='this engine') await A0.sync.setOwner(U('m5'),{erase:true}); else await dev(cloud,'MC',db,era0).sync.setOwner(U('m5'),{erase:true});
  const A=who==='a fresh engine of the old screen'? dev(cloud,'MC',db,era0) : A0; const w0=db.writes;
  const cs=await Promise.all(runAll(cloud, A).map(code)), bad=OPS.filter((o,i)=>o!=='deviceName' && cs[i]!=='epoch' && cs[i]!=='throw:epoch');
  ok('Mc an erase by '+who+' (era '+era0+' → '+eraNow(db)+'): every operation with the old era is refused ('+(bad.join(', ')||'all')+'), the device name is not ('+cs[OPS.indexOf('deviceName')]+'), and only it wrote ('+(db.writes-w0)+')',
    era0!==eraNow(db) && !bad.length && cs[OPS.indexOf('deviceName')]==='ok' && db.writes-w0===1 && db.all('notes').length===0 && db.all('versions').length===0 && !db.all('sync').some(r=>r.k.startsWith('out:')) && A.status.includes('reload'));
  const reads=await Promise.all([A.sync.versionStates('vn'), A.sync.lrevOf(), A.sync.state('p1'), A.sync.copiesCount(), A.sync.countCopies('k1'), A.sync.unsynced(), A.sync.seenAll()].map(code));
  ok('Mc the reads that feed that screen are refused the same way ('+[...new Set(reads)].join(', ')+')', reads.every(c=>c==='throw:epoch')); }

/* ── 5s. the cases of #146, for a writer and runners (§8.3, §7.3.8) ── */
{ const cloud=new TestCloud({start:START});
  // 5s, 5s1: the user's writes ordered right after this screen's own change of owner land under the new owner
  const dbA=new MemStore(), WA=planned(dbA), A=dev(cloud,'S1',dbA,'0',{store:WA}); await A.sync.setOwner(U('u1')); await A.sync.start(); await A.sync.idle(300); await note(A,'d1','for deletion',{deleted:START}); await A.sync.idle(300); A.status.length=0;
  const r0=A.sync.runner, o0=WA.opened, bind=A.sync.writer.setOwner(U('s2'),{expectEpoch:epNow(dbA)}).then(r=>r.changed? 'ok' : 'same', cErr), o1=WA.opened-o0, ws=[note(A,'s1','saved'), A.sync.importNote({id:'s3', title:'import', blocks:[], created:1, updated:1}), A.sync.purgeLocal('d1',{reach:'all'})].map(code), o2=WA.opened-o0;   // the writes are called while the change is in flight; each opened its transaction in its call
  const out=[await bind, ...(await Promise.all(ws))]; await tick(); const ended=[r0.alive, r0.ended, ...A.sync.ends]; await A.sync.reconcile();
  ok('5s the user\'s writes called while this screen\'s own setOwner is in flight (transactions opened in the calls: '+o1+' then '+o2+'; bind, save, import, delete forever: '+out.join(', ')+') land under the new owner: no «reload», no «stale» ('+JSON.stringify([...new Set(A.status)])+'); the runner of the previous epoch ended ('+ended.join(', ')+') and the next one is of '+A.sync.runner.owner.uid,
    o1===1 && o2===4 && out.every(c=>c==='ok') && !A.status.includes('reload') && !A.status.includes('stale') && ended[0]===false && ended[1]==='mismatch' && ended.includes('mismatch') && A.sync.runner!==r0 && A.sync.runner.owner.uid==='s2' && !!dbA.get('notes','s1') && !!dbA.get('notes','s3') && !dbA.get('notes','d1') && await A.sync.checkOwner()===true);
  ok('5s1 the saved note is queued for the new owner, the deleted one leaves a tombstone job (it reached the previous cloud: '+!!cloud.doc('notes','d1')+')', !!dbA.get('sync','out:n:s1') && (dbA.get('sync','out:n:d1')||{}).tomb===true);
  // 5s2: an erase, then a save ordered behind it
  const dbE=new MemStore(), E=dev(cloud,'S2',dbE,'0'); await E.sync.setOwner(U('u1')); E.status.length=0;
  const er=E.sync.writer.setOwner(null,{erase:true, expectEpoch:epNow(dbE)}).then(r=>r.erased? 'ok' : 'kept', cErr), we=code(note(E,'e1','after the erase')), oe=[await er, await we];
  ok('5s2 after an erase a save ordered behind it is refused ('+oe.join(', ')+'), nothing of it stored, the page is told «reload»', oe[0]==='ok' && oe[1]==='epoch' && !dbE.get('notes','e1') && E.status.includes('reload'));
  // 5s3, read again by §7.3.8: there is no step of the previous owner «right after» a change. The runner ends with the change; what it is asked for
  // afterwards makes no cloud call and opens no transaction. The runner names no result: a kept change reads as «stale» (the writer's read of the
  // store passes, nothing is locked), an erase as «reload»
  for(const erase of [false, true]){ const dbQ=new MemStore(), WQ=planned(dbQ), Q=dev(cloud,'S3'+(erase? 'e' : ''),dbQ,'0',{store:WQ}); await Q.sync.setOwner(U('u1')); await Q.sync.start(); await note(Q,'q1','trash',{deleted:START}); await Q.sync.idle(300); const r=Q.sync.runner; Q.status.length=0;
    await Q.sync.writer.setOwner(U('s4'),{erase, expectEpoch:epNow(dbQ)}); await tick(); const calls0=Q.calls, o0=WQ.opened, st=await r.step(), st2=await r.start().then(()=>'returned', e=>'throw'), view=await Q.sync.writer.ownerNow().then(v=>'stale:'+v.owner.uid, e=>'reload:'+e.code);
    ok('5s3'+(erase? 'b an erase' : 'a a change that kept the records')+': the runner ended ('+r.ended+', one notice: '+JSON.stringify(Q.sync.ends)+'); a step and a start asked of it afterwards do nothing ('+st.did+', '+st2+'; cloud calls '+(Q.calls-calls0)+', transactions '+(WQ.opened-o0-1)+'), it has no `tombstoneAuto` to call; the writer reads '+view+' ('+JSON.stringify([...new Set(Q.status)])+')',
      r.alive===false && r.ended==='mismatch' && Q.sync.ends.length===1 && st.did==='ended' && st.next===Infinity && Q.calls===calls0 && WQ.opened-o0===1 && r.tombstoneAuto===undefined && r.setOwner===undefined && r.reload===undefined && r.setCloud===undefined && r.checkOwner===undefined
      && view===(erase? 'reload:epoch' : 'stale:s4') && Q.status.includes('reload')===erase && !Q.status.includes('stale')); }
  // 5s4: a first sign-in; nothing waits for anything, each write queues its job in its own transaction
  const dbF=new MemStore(), F=dev(cloud,'S5',dbF,'0'); await F.sync.start(); await F.sync.idle(300); F.status.length=0; await note(F,'f0','before the sign-in');
  const bf=F.sync.writer.setOwner(U('s6'),{expectEpoch:null}).then(()=>'ok', cErr);
  const fs=[note(F,'f1','first sign-in'), F.sync.importNote({id:'f2', title:'import', blocks:[{id:'b',row:1,fx:0,text:'from a file'}], created:1, updated:1}), F.sync.versionLocal({op:'create', rec:vrec(cloud,'fv1','f0','Named')}), F.sync.importHistory({versions:[vrec(cloud,'fv2','f0','From a file')], blobs:[]}, ['f0'])].map(code);
  const of=[await bf, ...(await Promise.all(fs))]; await F.sync.reconcile(); await F.sync.idle(300); await F.sync.idle(300);
  ok('5s4 a first sign-in: the save, the import, a named version and a history import ordered right after setOwner ('+of.join(', ')+') are queued for the new owner and reach its cloud; no «reload»',
    of.every(c=>c==='ok') && !F.status.includes('reload') && F.sync.owner.uid==='s6' && !!cloud.doc('notes','f1') && !!cloud.doc('notes','f2') && !!cloud.doc('notes','f0') && !!cloud.doc('versions','fv1') && !!cloud.doc('versions','fv2'));
  // 5s5, 5s7 (5s6 went with the adopting load): a write waits for nothing. Called before an erase it is ordered first, lands, and is erased with the
  // rest; called after, it is refused
  { const dbG=new MemStore(), G=dev(cloud, 'S7', dbG, '0'); await G.sync.setOwner(U('u1')); await note(G,'g0','old'); const era0=eraNow(dbG);
    const W=planned(dbG), H=dev(cloud,'S7',dbG,era0,{store:W});   // the same store opened anew (a reload): a writer that has read nothing
    const wh=code(edit(H,'g0',(C,t)=>({...C, blocks:[{id:'b',row:1,fx:0,text:'old, added to'}], updated:t}))), opened=W.opened;
    const eh=H.sync.writer.setOwner(null,{erase:true, expectEpoch:epNow(dbG)}).then(r=>r.erased? 'ok' : 'kept', cErr), oh=[await wh, await eh];
    ok('5s5 a write called before an erase of this screen is ordered before it, with nothing read first (its transaction opened in the call: '+opened+'), lands and is erased ('+oh.join(', ')+'): the device stays empty',
      opened===1 && oh[0]==='ok' && oh[1]==='ok' && !dbG.get('notes','g0') && !dbG.get('sync','out:n:g0') && !dbG.get('sync','owner'));
    const wa=await code(edit(H,'g0',(C,t)=>({...(C||{}), title:'old', blocks:[{id:'b',row:1,fx:0,text:'added after'}], created:t, updated:t})));
    ok('5s7 a save called after that erase is refused ('+wa+'): nothing of the erased note comes back', wa==='epoch' && !dbG.get('notes','g0') && !dbG.get('sync','out:n:g0')); }
  // 5s8: two changes of owner of one screen overlapping, each decided over the same epoch, in both orders. Two refusals, apart (§7.3.3 item 2): a
  // change that kept the records came first: the second is refused by the epoch of its decision, and the user is asked again, with no «reload».
  // An erase came first: the second is refused by the era of the screen, which may change nothing any more
  for(const first of ['kept','erase']){ const dbK=new MemStore(), K0=dev(cloud,'S9',dbK,'0'); await K0.sync.setOwner(U('u1')); await note(K0,'k0','old'); const era0=eraNow(dbK), e0=epNow(dbK);
    const K=dev(cloud,'S9',dbK,era0), p1=K.sync.writer.setOwner(U('s10'),{erase:first==='erase', expectEpoch:e0}).then(()=>'ok', cErr), p2=K.sync.writer.setOwner(U('s11'),{erase:first!=='erase', expectEpoch:e0}).then(()=>'ok', cErr), rs=[await p1, await p2];
    const wk=await code(edit(K,'k0',(C,t)=>({...(C||{}), title:'old', blocks:[{id:'b',row:1,fx:0,text:'old, written again'}], created:t, updated:t})));
    ok('5s8 '+(first==='kept'? 'a change that kept the records, then an erase' : 'an erase, then a change that keeps the records')+', both decided over one epoch ('+rs.join(', ')+'): the store names '+dbK.get('sync','owner').uid+'; '+(first==='kept'? 'the erase is refused by the epoch, the records stay, the screen saves ('+wk+') and is not told «reload»' : 'the second is refused by the era, and a save of the erased note from that screen too ('+wk+')'),
      rs[0]==='ok' && dbK.get('sync','owner').uid==='s10' && (first==='kept'? rs[1]==='expect:epoch' && wk==='ok' && !!dbK.get('notes','k0') && !K.status.includes('reload') : rs[1]==='era:epoch' && wk==='epoch' && !dbK.get('notes','k0') && K.status.includes('reload'))); }
  // 5s9, split in two by §8.3: after an erase and a later change of owner the old screen stays refused; a new screen saves
  { const dbL=new MemStore(), L0=dev(cloud,'S12',dbL,'0'); await L0.sync.setOwner(U('u1')); const era0=eraNow(dbL);
    const L=dev(cloud,'S12',dbL,era0); await L.sync.setOwner(U('s13'),{erase:true}); await dev(cloud,'S12',dbL,eraNow(dbL)).sync.setOwner(U('s14'));
    const wl=await code(note(L,'l1','under s14')), again=await L.sync.setOwner(U('s15'),{expectEpoch:epNow(dbL)}).then(()=>'ok', cErr);
    ok('5s9a the old screen is refused whatever owner came since (the store names '+dbL.get('sync','owner').uid+'; its save: '+wl+', its change of owner with the epoch of today: '+again+')', dbL.get('sync','owner').uid==='s14' && wl==='epoch' && again==='era:epoch' && !dbL.get('notes','l1'));
    const N=dev(cloud,'S12',dbL,eraNow(dbL)), wn=await code(note(N,'l1','under s14'));   // a new screen: the records and the era read together
    ok('5s9b a new screen, which read the era with the records, saves ('+wn+') and its note is queued for '+(dbL.get('sync','owner')||{}).uid, wn==='ok' && !!dbL.get('notes','l1') && !!dbL.get('sync','out:n:l1') && dbL.get('sync','owner').uid==='s14'); }
  // 5s10 (the hint of a committed change on the error of an adopting load) has no subject: setOwner loads nothing, and its result says what it wrote
  { const dbM=new MemStore(), M=dev(cloud,'S15',dbM,'0'); const r1=await M.sync.writer.setOwner(U('u1'),{expectEpoch:null}), r2=await M.sync.writer.setOwner({...U('u1'), email:'new@test'},{expectEpoch:r1.epoch}), noExp=await M.sync.writer.setOwner(U('u2')).then(()=>'ok', e=>e.name);
    ok('5s10 setOwner answers with what it wrote ('+JSON.stringify(r1)+'; the same owner again: '+JSON.stringify(r2)+', the email '+dbM.get('sync','owner').email+'); without the epoch of the decision it is not made ('+noExp+')',
      r1.changed===true && r1.erased===false && r1.epoch===epNow(dbM) && r2.changed===false && r2.epoch===r1.epoch && dbM.get('sync','owner').email==='new@test' && noExp==='TypeError'); } }

/* ── B. beside the matrix (§8.1), and the rules one by one ── */
// B1 (§3.3 item 3): a write opens its transaction in the call, with no load before it, also on an engine that never loaded and one whose load failed
{ const cloud=new TestCloud({start:START}), db=new MemStore(); await dev(cloud,'B1',db,'0').sync.setOwner(U('b1'));
  const W=planned(db), A=dev(cloud,'B1',db,eraNow(db),{store:W}); W.plan.push('fail','fail','fail'); const t0=db.txCount, p=note(A,'n1','no load'), opened=W.opened, r=await p;
  ok('B1 a save on an engine that never loaded (every read of the store would fail) opens one readwrite transaction in the call ('+opened+') and lands with its job; the plan of failing reads is untouched ('+W.plan.length+')',
    opened===1 && r.ok && W.opened===1 && db.txCount-t0===1 && !!db.get('sync','out:n:n1') && W.plan.length===3 && A.sync.runner===null); }
// B2 (§8.1): an `epoch` record without `era`, written as code before the plan writes it
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B2',db,'0'); await note(A,'n1','before');
  db.data.sync.set('epoch',{k:'epoch', id:'eold1'}); db.data.sync.set('owner',{k:'owner', ...U('old')});   // old code signed in and kept the records
  const w=await code(note(A,'n1','after')), N=dev(cloud,'B2',db,eraNow(db)), wn=await code(note(N,'n1','after, from a new screen'));
  ok('B2 an `epoch` without `era` reads as an era of its own ('+eraNow(db)+'): a write with the earlier era is refused ('+w+'), a screen read after it saves ('+wn+')', eraNow(db)==='eold1' && w==='epoch' && wn==='ok'); }
// B3 (§3.6): `expectEpoch` refuses after a change that kept the records
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B3',db,'0'); await A.sync.setOwner(U('b3')); const e1=A.sync.epoch;
  await dev(cloud,'B3',db,'0').sync.setOwner(U('b3x')); const era=eraNow(db), w0=db.writes;
  const r=await A.sync.setOwner(null,{erase:true, expectEpoch:e1}).then(()=>'ok', cErr), F=dev(cloud,'B3',db,'0'), rf=await F.sync.setOwner(null,{erase:true, expectEpoch:e1}).then(()=>'ok', cErr);
  ok('B3 an erase confirmed over an epoch that a change keeping the records replaced is refused, by the stale engine ('+r+') and by a fresh one ('+rf+'): nothing written, the era stays '+era, era==='0' && r==='expect:epoch' && rf==='expect:epoch' && db.writes===w0 && db.get('sync','owner').uid==='b3x');
  const r2=await F.sync.setOwner(null,{erase:true, expectEpoch:db.get('sync','epoch').id}).then(()=>'ok', cErr);
  ok('B3a asked again over the epoch in force, it goes ('+r2+') and starts a new era', r2==='ok' && eraNow(db)!=='0' && !db.get('sync','owner')); }
// B4 (§3.7): `lrev` across a change that keeps the records
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B4',db,'0'); await A.sync.setOwner(U('b4')); await A.sync.start();
  for(const x of ['one','two','three']) await note(A,'n1',x); await note(A,'n2','once'); await note(A,'e1','text'); await note(A,'e1','');   // e1 is empty now, with lrev 2
  await A.sync.versionLocal({op:'create', rec:vrec(cloud,'v1','n1','Named')}); await A.sync.versionLocal({op:'rename', id:'v1', name:'Renamed'}); await A.sync.idle(400); await A.sync.idle(400);
  const before=await A.sync.lrevOf(), vBefore=db.get('sync','meta:v:v1').lrev, B=dev(cloud,'B4',db,'0'); await B.sync.setOwner(U('b4x')); const after=await B.sync.lrevOf(), m=id=>db.get('sync','meta:n:'+id);
  ok('B4 every note\'s `lrev` after the change is above its `lrev` before ('+JSON.stringify(before)+' → '+JSON.stringify(after)+'), ahead of no base', Object.keys(before).length===3 && Object.keys(before).every(id=>after[id]===before[id]+1) && m('n1').baseLrev===0 && m('n1').base===null && m('n2').baseLrev===0 && !!db.get('sync','out:n:n1'));
  ok('B4a an empty note gets no job, as before, and keeps its number with nothing ahead ('+JSON.stringify({lrev:m('e1').lrev, baseLrev:m('e1').baseLrev})+'): a document of its id still replaces it', !db.get('sync','out:n:e1') && m('e1').lrev===3 && m('e1').baseLrev===3);
  ok('B4b the metas of versions start anew ('+vBefore+' → '+db.get('sync','meta:v:v1').lrev+'): no screen remembers them, and 1 is what «not renamed here» reads', vBefore>1 && db.get('sync','meta:v:v1').lrev===1 && !!db.get('sync','out:v:v1'));
  // the collision of §3.7: a screen remembers n2 at lrev 1; main would reset it to 1 and another tab's save would reach 2... here no number repeats
  const r=await note(B,'n2','another tab'), seen=new Set([before.n2, after.n2, r.lrev]);
  ok('B4c the screen\'s number, the change\'s and another tab\'s next save are three numbers ('+[...seen].join(', ')+')', seen.size===3 && r.lrev===3);
  const C=dev(cloud,'B4',db,'0'); await C.sync.setOwner(U('b4y')); const again=await C.sync.lrevOf();
  ok('B4d a second change goes on from there ('+JSON.stringify(again)+')', again.n1===after.n1+1 && again.n2===r.lrev+1 && again.e1===4); }
// B5 (§3.4): a runner's identity never changes, and every transaction of it checks the store against it; its adapter is of the owner's namespace
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B5',db,'0'); await A.sync.setOwner(U('b5')); await A.sync.start(); await note(A,'n1','mine'); await note(A,'t1','trash',{deleted:START}); await A.sync.idle(400); await A.sync.idle(400);
  const X=dev(cloud,'B5',db,'0'); await X.sync.setOwner(U('b5x')); await note(X,'x1','the new owner\'s'); A.status.length=0; const r=A.sync.runner, calls=A.calls, e0=r.epoch;
  const st=await r.step(); await tick(); const co=await A.sync.checkOwner();
  ok('B5 another screen changed the owner and kept the records: this runner\'s next step ends it ('+st.did+', '+r.ended+', notices '+JSON.stringify(A.sync.ends)+'); its identity is what it was made with, the new owner\'s queue is not read into it ('+r.jobs().join(',')+'), no cloud call ('+(A.calls-calls)+')',
    st.did==='ended' && r.alive===false && r.ended==='mismatch' && A.sync.ends.join()==='mismatch' && r.epoch===e0 && r.owner.uid==='b5' && !r.jobs().includes('x1') && A.calls===calls && co===false);
  ok('B5a the page is told neither «stale» nor «reload» by a status ('+JSON.stringify([...new Set(A.status)])+'): the runner reported a mismatch, and the writer, which holds the era, reads the store without a refusal', !A.status.includes('stale') && !A.status.includes('reload') && (await A.sync.writer.ownerNow()).owner.uid==='b5x');
  const w=await code(note(A,'n1','still typing'));
  ok('B5b and a save from that screen lands meanwhile ('+w+'), queued for the new owner', w==='ok' && !!db.get('sync','out:n:n1') && db.get('notes','n1').blocks[0].text==='still typing');
  await A.sync.reconcile(); const r2=A.sync.runner; await dev(cloud,'B5',db,'0').sync.setOwner(U('b5y'),{erase:true}); A.status.length=0; r2.nudge(); const st2=await r2.step(), view=await A.sync.writer.ownerNow().then(()=>'read', e=>e.code);
  ok('B5c the page made the next runner, of '+r2.owner.uid+'; after an erase its step ends it the same way ('+st2.did+', '+r2.ended+'), and it is the writer that says «reload» ('+view+', '+JSON.stringify([...new Set(A.status)])+')', r2!==r && r2.owner.uid==='b5x' && st2.did==='ended' && r2.ended==='mismatch' && view==='epoch' && A.status.includes('reload') && !A.status.includes('stale'));
  // the adapter names its namespace, and it is the owner's: no runner is made otherwise
  const db2=new MemStore(), cloudB=new TestCloud({start:START}), O=dev(cloudB,'B5o',db2,'0'); await O.sync.setOwner(U('b5o')); await note(O,'o1','not to be sent'); const ow=db2.get('sync','owner'), ep=epNow(db2);
  const mk=c=>{ try{ O.sync.writer.runner({epoch:ep, owner:ow, cloud:c}); return 'made'; }catch(e){ return e.name; } }, made=[mk({...O.proxy, uid:'someone-else', env:'test'}), mk({...O.proxy, uid:'b5o', env:'prod'}), mk(O.proxy), mk(null), mk({...O.proxy, uid:'b5o', env:'test'})];
  ok('B5d an adapter of another user, of another environment, one that names no namespace, and none: no runner ('+made.slice(0,4).join(', ')+'), no call ('+O.calls+'); the owner\'s own: '+made[4], made.slice(0,4).every(x=>x==='TypeError') && made[4]==='made' && O.calls===0 && O.sync.writer.runners().length===1);
  const P=O.sync.writer.runners()[0]; await P.start(); await P.idle(300);
  ok('B5e the owner\'s own adapter sends it', !!cloudB.doc('notes','o1')); }
// B6 (§3.3 item 7): a deletion without an owner goes through the core and stays on the device; a wider confirmation than the effect goes on
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B6',db,'0'); await note(A,'a','x'); await note(A,'b','y'); await note(A,'c','kept'); await note(A,'old','z',{deleted:5});
  await A.sync.versionLocal({op:'create', rec:vrec(cloud,'v1','a','Named')}); await A.sync.versionLocal({op:'create', rec:vrec(cloud,'v2','c','Named')});
  const r1=await A.sync.purgeLocal('a',{reach:'here'}), r2=await A.sync.purgeLocal('b',{reach:'all'}), r3=await A.sync.purgeOldLocal('old',10), r4=await A.sync.versionLocal({op:'delete', id:'v2'});
  ok('B6 without an owner «delete forever» (confirmed as «here», or as «all»), the 30-day rule and a version\'s deletion all stay on the device: nothing queued, no registry',
    r1.ok && r1.tomb===false && r2.ok && r2.tomb===false && r3.purged===true && r4.ok && r4.cloud===false && db.all('notes').map(n=>n.id).join()==='c' && db.all('versions').length===0 && !db.all('sync').some(r=>r.k.startsWith('out:') || r.k.startsWith('purged:'))); }
// B7: «the same owner again» is decided over the store. A memory another engine's change left behind does not put its owner under that change's epoch
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B7',db,'0'); await A.sync.setOwner(U('b7')); await note(A,'n1','text');
  const e1=db.get('sync','epoch').id; await A.sync.setOwner(U('b7')); const sameKept=db.get('sync','epoch').id===e1;
  await dev(cloud,'B7',db,'0').sync.setOwner(U('b7x')); const e2=db.get('sync','epoch').id; db.data.sync.delete('out:n:n1');   // as if the new owner's engine had sent it
  await A.sync.setOwner(U('b7')); const e3=db.get('sync','epoch').id;
  ok('B7 the same owner again keeps the epoch ('+sameKept+'); after another engine\'s change it is a change of its own: a new epoch, the queue rebuilt, the era kept ('+eraNow(db)+')', sameKept && e3!==e2 && e3!==e1 && db.get('sync','owner').uid==='b7' && !!db.get('sync','out:n:n1') && eraNow(db)==='0' && A.sync.epoch===e3); }
// B8 (§3.1): what a change of owner writes of the era
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B8',db,'0'); const eras=[eraNow(db)];
  await A.sync.setOwner(U('b8')); eras.push(db.get('sync','epoch').era); await A.sync.setOwner(U('b8x')); eras.push(db.get('sync','epoch').era);
  await A.sync.setOwner(U('b8y'),{erase:true}); const ep=db.get('sync','epoch'); eras.push(ep.era); await dev(cloud,'B8',db,eraNow(db)).sync.setOwner(null); eras.push(db.get('sync','epoch').era);
  ok('B8 a first sign-in and a change that keeps the records copy the era in force, an erase and a sign-out start a new one ('+eras.join(' → ')+')', eras[0]==='0' && eras[1]==='0' && eras[2]==='0' && eras[3]===ep.id && eras[4]===db.get('sync','epoch').id && eras[4]!==eras[3]);
  const dbL=new MemStore(), L=S.makeSync({db:dbL, cloud:null, now:()=>cloud.now(), random:Math.random}); await L.setOwner(U('b8'));
  ok('B8a an engine without an era writes none, as before ('+JSON.stringify(dbL.get('sync','epoch'))+')', !('era' in dbL.get('sync','epoch'))); }
// B9 (§3.3 item 1): the device name is of the device. Written from an old screen, read by the engine of a new one
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B9',db,'0'); await A.sync.setOwner(U('b9')); await A.sync.setOwner(U('b9x'),{erase:true});
  const r=await A.sync.deviceName('  Kitchen tablet  '), N=dev(cloud,'B9',db,eraNow(db)); await note(N,'n1','x');
  ok('B9 the device name is written whatever the era ('+JSON.stringify(r)+') and outlives the erase; a write of another engine takes it from the store with no load ('+N.sync.devName+')', r.ok && r.name==='Kitchen tablet' && db.get('sync','device').name==='Kitchen tablet' && N.sync.devName==='Kitchen tablet'); }
// B10 (§3.3 item 2, the `typed` mark): a note the new owner's engine marked as looping is not known as such to an old memory; what is typed and saved
// from the old engine still lifts the mark, by the store, so the save can be sent. From a screen of erased records `typed` writes nothing
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B10',db,'0'); await A.sync.setOwner(U('t1')); await note(A,'n1','before');
  await dev(cloud,'B10',db,'0').sync.setOwner(U('t2')); db.data.sync.set('meta:n:n1',{...db.get('sync','meta:n:n1'), err:'loop'});
  A.sync.typed('n1'); const w=await code(note(A,'n1','typed after the change')), m=db.get('sync','meta:n:n1');
  ok('B10 typed and saved from an engine whose memory is of the previous owner ('+w+'): the mark «loop» the store holds is lifted ('+m.err+'), the job stays', w==='ok' && m.err===undefined && !!db.get('sync','out:n:n1') && db.get('notes','n1').blocks[0].text==='typed after the change');
  const N=dev(cloud,'B10',db,eraNow(db)); await N.sync.start(); await N.sync.idle(300); await N.sync.idle(300);
  ok('B10a and a new engine sends it ('+((cloud.doc('notes','n1')||{blocks:[{}]}).blocks[0].text)+')', (cloud.doc('notes','n1')||{blocks:[{}]}).blocks[0].text==='typed after the change');
  db.data.sync.set('meta:n:n1',{...db.get('sync','meta:n:n1'), err:'loop'}); N.sync.typed('n1'); await tick();
  ok('B10b typed alone lifts the mark, by the store', db.get('sync','meta:n:n1').err===undefined);
  await dev(cloud,'B10',db,eraNow(db)).sync.setOwner(U('t3'),{erase:true}); const w0=db.writes; A.status.length=0; A.sync.typed('n1'); await tick();
  ok('B10c from a screen of erased records typed writes nothing ('+(db.writes-w0)+') and the page is told «reload»', db.writes===w0 && A.status.includes('reload')); }
// B11 (the review of 877d7df, finding 1; rewritten on the end of an instance, §7.3.8): nothing of a runner that ended reaches the store. Its listeners
// end with it, a delivery already waiting is not applied, and the answer of a call in flight is cancelled
{ const cloudA=new TestCloud({start:START}), cloudB=new TestCloud({start:START}), db=new MemStore(), E=dev(cloudA,'B11',db,'0'); await E.sync.setOwner(U('a')); await E.sync.start(); await note(E,'mine','of A'); await E.sync.idle(300); await E.sync.idle(300);
  const live=()=>cloudA.subs.filter(x=>x.dev==='B11' && x.live!==false).length, live0=live(), sent=!!cloudA.doc('notes','mine');
  await E.sync.setOwner(U('b'),{erase:true}); const live1=live();
  cloudA.advance(1000); cloudA.write('notes',{id:'secretA', title:'secret', blocks:[{id:'b',row:1,fx:0,text:'A only'}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump();
  const E2=dev(cloudB,'B11',db,eraNow(db)); await E2.sync.start(); await E2.sync.idle(300); await E2.sync.idle(300);
  ok('B11 the listeners of the previous owner\'s cloud end with the change ('+live0+' → '+live1+'), and a note written there afterwards never reaches the new owner\'s store ('+db.all('notes').map(n=>n.id).join(',')+'); the old screen gets no runner ('+E.sync.runner+', '+E.sync.locked+')', sent && live0>0 && live1===0 && !db.get('notes','secretA') && db.all('notes').length===0 && E2.sync.runner.owner.uid==='b' && E.sync.runner===null && E.sync.locked==='reload');
  // a delivery that was already waiting when the runner ended (the listener's callback ran, the step had not), the lead lost within one epoch
  const db2=new MemStore(), F=dev(cloudA,'B11f',db2,'0'); await F.sync.setOwner(U('a')); await F.sync.start(); await F.sync.idle(300);
  cloudA.advance(1000); cloudA.write('notes',{id:'lateA', title:'late', blocks:[{id:'b',row:1,fx:0,text:'A only'}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump(); const r=F.sync.runner, waiting=r.inboxSize(), keep=r._S.inbox.slice();
  r.end('lead'); const dropped=r.inboxSize(); r._S.inbox.push(...keep); const st=await r.step(); F.changes.length=0; cloudA.advance(1000); cloudA.write('notes',{id:'laterA', title:'later', blocks:[], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump(); await tick();
  ok('B11a a delivery waiting when the runner ended ('+waiting+' waiting, '+dropped+' after the end; put back by hand: the step is «'+st.did+'») is not applied, and its listeners deliver nothing more ('+r.inboxSize()+' in its inbox, the put-back one)', waiting>0 && dropped===0 && st.did==='ended' && !db2.get('notes','lateA') && r.inboxSize()===keep.length && !F.changes.length);
  // an answer in flight: the read of a send is held while the owner changes and the records are kept; the send does not go on
  const cloudC=new TestCloud({start:START}), db3=new MemStore(), G=dev(cloudC,'B11g',db3,'0'); await G.sync.setOwner(U('a')); await G.sync.start(); await G.sync.idle(300); await note(G,'n1','kept across the change');
  let rel; const hold=new Promise(r=>{ rel=r; }); cloudC.fault('hold',{dev:'B11g', op:'get', promise:hold}); const rg=G.sync.runner, sg=rg.step(); await tick(); await G.sync.writer.setOwner(U('b'),{expectEpoch:epNow(db3)}); const reads0=rg._S.quota.reads; rel(); const dg=await sg;
  ok('B11b a read answered after its runner ended is cancelled ('+dg.did+'): the note, now the new owner\'s, is not sent on to the previous owner\'s cloud, nothing is said of the access, the read is not counted ('+(rg._S.quota.reads-reads0)+')', dg.did==='ended' && rg._S.quota.reads===reads0 && !cloudC.doc('notes','n1') && !!db3.get('sync','out:n:n1') && !rg._S.denied && !G.status.includes('denied'));
  // only the adapter is replaced, the owner stays: the old runner's waiting delivery is not applied, and it does not touch the new runner's inbox
  const db4=new MemStore(), H=dev(cloudA,'B11c',db4,'0'); await H.sync.setOwner(U('a')); await H.sync.start(); await H.sync.idle(300);
  cloudA.advance(1000); cloudA.write('notes',{id:'lateC', title:'late', blocks:[{id:'b',row:1,fx:0,text:'A only'}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump(); const old=H.sync.runner, w4=old.inboxSize();
  await H.sync.setCloud(dev(cloudB,'B11c',db4,'0').proxy); const nw=H.sync.runner; cloudB.write('notes',{id:'ofB', title:'new session', blocks:[], created:cloudB.now(), updated:cloudB.now()},{dev:'phone'}); cloudB.pump(); const in1=nw.inboxSize(), so=await old.step(), in2=nw.inboxSize(); await H.sync.idle(300);
  ok('B11c a delivery waiting when only the adapter is replaced ('+w4+' waiting; the old runner ended: '+old.ended+', its step «'+so.did+'») is not applied; the new runner\'s inbox is its own ('+in1+' before the old step, '+in2+' after) and is applied', w4>0 && old.ended==='adapter' && so.did==='ended' && !db4.get('notes','lateC') && nw!==old && in1>0 && in2===in1 && !!db4.get('notes','ofB')); }
// B12 (the review of 877d7df, finding 2): «the same owner» is read from the store. A screen asks for the owner the store already has: no new epoch,
// the queue and a deletion waiting to be sent stay
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B12',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(100);
  const X=dev(cloud,'B12',db,'0'); await X.sync.setOwner(U('b')); await X.sync.start(); await note(X,'gone','to be deleted'); await X.sync.idle(300); await X.sync.idle(300); X.sync.stop();
  const inCloud=!!cloud.doc('notes','gone'); await X.sync.purgeLocal('gone',{reach:'all'}); const e2=db.get('sync','epoch').id, tomb=db.get('sync','out:n:gone');
  A.sync.stop(); const res=await A.sync.setOwner(U('b'),{expectEpoch:e2});
  ok('B12 the store already names the owner asked for ('+JSON.stringify(res)+'): the epoch stays, the tombstone job and the registry of the deletion stay',
    inCloud && !!tomb && tomb.tomb===true && res.changed===false && res.epoch===e2 && db.get('sync','epoch').id===e2 && (db.get('sync','out:n:gone')||{}).tomb===true && !!db.get('sync','purged:n:gone') && A.sync.owner.uid==='b');
  await A.sync.start(); await A.sync.idle(300); await A.sync.idle(300);
  ok('B12a the deletion reaches the cloud ('+!!(cloud.doc('notes','gone')||{}).purged+') and the note does not come back to the device', (cloud.doc('notes','gone')||{}).purged && !db.get('notes','gone')); }

/* ── the second round of the independent review (at 6220954), on the end of an instance ── */
// B13: a page already fetched from the previous owner's cloud does not go on being applied after the owner changed. The store is slow, so the page is
// applied in chunks with a pause between them, and the whole change of owner ends inside that pause
{ const cloudA=new TestCloud({start:START}), db=new MemStore(); for(let i=0;i<60;i++){ cloudA.advance(10); cloudA.write('notes',{id:'pg'+String(i).padStart(2,'0'), title:'A', blocks:[{id:'b',row:1,fx:0,text:'of A '+i}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); }
  const slow={tx:(st,mode,fn)=>mode==='readwrite'? new Promise(r=>setTimeout(r,3)).then(()=>db.tx(st,mode,fn)) : db.tx(st,mode,fn)};
  const E=dev(cloudA,'B13',db,'0',{store:slow, deps:{pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50, slowTx:1}}});
  await E.sync.setOwner(U('a')); cloudA.fault('fail',{dev:'B13', op:'listen', n:2}); await E.sync.start(); const r=E.sync.runner;   // no listener: the notes come by the catch-up page
  let did=''; const run=(async()=>{ for(let i=0;i<8 && did!=='page' && did!=='ended';i++) did=(await r.step()).did; })();
  for(let i=0;i<400 && db.all('notes').length===0;i++) await tick(5); const mid=db.all('notes').length;
  await E.sync.setOwner(U('b'),{erase:true}); const after=db.all('notes').length; await run; await tick(250);
  ok('B13 the owner changed between two chunks of a page of the previous owner ('+mid+' of 60 applied, the step: '+did+'): the rest is not applied under the new owner ('+db.all('notes').length+' notes, cursor '+!!db.get('sync','cursor:notes')+', caught up '+r._S.everCaughtUp+')',
    did==='ended' && mid>0 && mid<60 && after===0 && db.all('notes').length===0 && !db.get('sync','cursor:notes') && r._S.everCaughtUp===false && db.get('sync','owner').uid==='b'); }
// B14a: an adapter taken away ends the runner and its listeners (B14's rebinding of an unnamed adapter went: an adapter names its namespace, B5d)
{ const cloud=new TestCloud({start:START}), live=n=>cloud.subs.filter(x=>x.dev===n && x.live!==false).length;
  const db2=new MemStore(), G=dev(cloud,'B14g',db2,'0'); await G.sync.setOwner(U('a')); await G.sync.start(); await G.sync.idle(300); const g0=live('B14g'), r=G.sync.runner; await G.sync.start({cloud:null}); const g1=live('B14g');
  ok('B14a the adapter taken away ends the runner ('+r.ended+') and the listeners of the one that was there ('+g0+' → '+g1+'); none is made without an adapter ('+G.sync.runner+')', g0>0 && g1===0 && r.ended==='adapter' && G.sync.runner===null); }
// B15: a refusal of the previous owner's cloud that arrives after its runner ended says nothing of the new owner's access
{ const cloud=new TestCloud({start:START}), db=new MemStore(), G=dev(cloud,'B15',db,'0'); await G.sync.setOwner(U('a')); await G.sync.start(); await G.sync.idle(300); await note(G,'n1','text');
  let refuseGet; G.proxy.get=()=>new Promise((_,rej)=>{ refuseGet=rej; }); const r=G.sync.runner, st=r.step(); for(let i=0;i<50 && !refuseGet;i++) await tick(2);
  G.status.length=0; G.logs.length=0; await G.sync.setOwner(U('b')); const r2=G.sync.runner;
  refuseGet(Object.assign(new Error('refused'),{code:'permission-denied'})); const d=await st; await tick();
  ok('B15 «permission-denied» of the previous owner\'s adapter after the change ('+d.did+'): neither runner is denied (the old '+r._S.denied+', the new '+r2._S.denied+'), no status or log of it ('+JSON.stringify([...new Set(G.status)])+')',
    !!refuseGet && d.did==='ended' && r._S.denied===false && r2!==r && r2.alive && r2._S.denied===false && !G.status.includes('denied') && !G.logs.some(e=>e.t==='denied')); }
// B16: a running leader learns that another tab lifted the mark «loop» of a queued note
{ const cloud=new TestCloud({start:START}), db=new MemStore(), L=dev(cloud,'B16',db,'0'); await L.sync.setOwner(U('t')); await L.sync.start(); await note(L,'n1','before'); await L.sync.idle(300); await L.sync.idle(300);
  const O=dev(cloud,'B16',db,eraNow(db)); await note(O,'n1','typed, and looping'); db.data.sync.set('meta:n:n1',{...db.get('sync','meta:n:n1'), err:'loop'}); await L.sync.reload(); await L.sync.idle(100);
  const blocked=L.sync._S.err.get('n1')==='loop' && cloud.doc('notes','n1').blocks[0].text==='before';
  O.sync.typed('n1'); await tick(); const w=await code(note(O,'n1','typed again')); L.sync.nudge(); await L.sync.idle(300); await L.sync.idle(300);
  ok('B16 the leader held the note back for its mark ('+blocked+'); another tab typed and saved ('+w+'), and after a nudge the leader reads the mark with the queue and sends ('+cloud.doc('notes','n1').blocks[0].text+')', blocked && w==='ok' && L.sync._S.err.get('n1')===undefined && cloud.doc('notes','n1').blocks[0].text==='typed again'); }
// B17: the mark is lifted by the user's typing and by nothing else. Typed, then a save that changes nothing: lifted. A save nobody typed for (a pin): kept
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B17',db,'0'); await A.sync.setOwner(U('t')); await note(A,'n1','text'); const mark=()=>db.data.sync.set('meta:n:n1',{...db.get('sync','meta:n:n1'), err:'loop'});
  mark(); A.sync.typed('n1'); await tick(); const same=await edit(A,'n1',C=>C), e1=db.get('sync','meta:n:n1').err;
  mark(); const pin=await edit(A,'n1',(C,t)=>({...C, pinned:t})), e2=db.get('sync','meta:n:n1').err;
  mark(); const imp=await A.sync.importNote({...db.get('notes','n1'), title:'imported', updated:db.get('notes','n1').updated+10}), e3=db.get('sync','meta:n:n1').err;
  ok('B17 typed, then a save that changes nothing ('+(same.same===true)+'): the mark is lifted ('+e1+'); a pin and an import nobody typed for ('+pin.ok+', '+imp.kind+') leave a mark set since ('+e2+', '+e3+')', same.same===true && e1===undefined && pin.ok && e2==='loop' && imp.kind==='updated' && e3==='loop'); }
// B18: `expectEpoch` is strict for the store's own owner too, and a repeated bind keeps the epoch
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B18',db,'0'); await A.sync.setOwner(U('a')); await dev(cloud,'B18',db,'0').sync.setOwner(U('b')); const e2=db.get('sync','epoch').id;
  const w=await code(note(A,'n1','accepted')), bad=await A.sync.setOwner(U('b'),{expectEpoch:'e-other'}).then(()=>'ok', cErr), good=await A.sync.setOwner(U('b'),{expectEpoch:e2}).then(r=>r.changed? 'changed' : 'ok', cErr);
  ok('B18 after a save ('+w+'), setOwner for the store\'s own owner is judged by its transaction: a wrong epoch refused ('+bad+'), the right one goes ('+good+'), the epoch stays, the job too',
    w==='ok' && bad==='expect:epoch' && good==='ok' && db.get('sync','epoch').id===e2 && A.sync.owner.uid==='b' && A.sync.epoch===e2 && !!db.get('sync','out:n:n1')); }
// B20 (the review of #157's merge, read again by §7.3.8): a step reading the queue while this screen's own change of owner commits. There is no
// `own` answer: the runner ends, makes no cloud call, and the page's reconciliation follows at once, so no timer is lost. A change that kept the
// records gives the next runner; an erase gives «reload» and none
for(const erase of [false, true]){ const cloud=new TestCloud({start:START}), db=new MemStore(), W=planned(db), A=dev(cloud,'B20',db,'0',{store:W}); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); A.status.length=0; const calls=A.calls, r=A.sync.runner;
  W.plan.push('hold'); r.nudge(); const st=r.step(); await tick();   // the queue's read is held
  const bind=A.sync.writer.setOwner(U('b'), {erase, expectEpoch:epNow(db)}).then(()=>'ok', cErr); await tick(); W.release(); const d=await st, b=await bind; await tick(); const ends=A.sync.ends.join(), c1=A.calls; await A.sync.reconcile();
  ok('B20 '+(erase? 'an erase' : 'a change that kept the records')+' of this screen under a step\'s read of the queue (bind '+b+'): the step is '+d.did+', the runner ended ('+ends+'), no cloud call of it ('+(c1-calls)+'), statuses '+JSON.stringify([...new Set(A.status)])+'; the page then has '+(A.sync.runner? 'a runner of '+A.sync.runner.owner.uid : 'no runner, '+A.sync.locked),
    b==='ok' && d.did==='ended' && d.next===Infinity && ends==='mismatch' && c1===calls && !A.status.includes('stale') && (erase? A.sync.runner===null && A.sync.locked==='reload' && A.status.includes('reload') && A.calls===calls : A.sync.runner!==r && A.sync.runner.owner.uid==='b' && !A.status.includes('reload'))); }

/* ── a writer and runners (§7.3.8): the end of a runner, at three places ── */
// a store that can hold one readwrite transaction after its work is done and before it commits: «admitted, not yet committed»
const gated=db=>{ const G={gate:null, admitted:null, tx:(st,mode,fn)=>db.tx(st,mode, async t=>{ const v=await fn(t); if(mode==='readwrite' && G.gate){ const g=G.gate; G.gate=null; if(G.admitted) G.admitted(); await g; } return v; })}; return G; };
// N1: a call already out when its runner ends within one epoch (the lead lost). A late success: the attempt is not finished by the old runner, nothing
// is written or published; the successor resolves the same attempt by its `op` and receipt, and the document is written once
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'N1',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); await note(A,'n1','sent once');
  let rel; const hold=new Promise(r=>{ rel=r; }); cloud.fault('hold',{dev:'N1', op:'txn', promise:hold}); const r=A.sync.runner; let d; const run=(async()=>{ for(let i=0;i<6;i++){ d=await r.step(); if(d.did==='ended') break; } })();
  for(let i=0;i<100 && !db.get('sync','try:n:n1');i++) await tick(2); const tr=db.get('sync','try:n:n1'); await tick(10);
  r.end('lead'); A.status.length=0; A.changes.length=0; A.logs.length=0; const w0=db.writes, l0=r.log.length, o0=r._S.txSeq; rel(); await run; await tick();
  ok('N1 a late success of a runner that ended (the attempt '+(tr && tr.op? 'insured' : 'missing')+', the step «'+d.did+'»): the attempt stays in the store as it was, nothing is written ('+(db.writes-w0)+'), no event, no status ('+A.changes.length+', '+A.status.length+'); the answer is cancelled, so the runner opens no transaction and logs nothing ('+(r._S.txSeq-o0)+', '+(r.log.length-l0)+')',
    !!tr && d.did==='ended' && r._S.txSeq===o0 && r.log.length===l0 && db.writes===w0 && JSON.stringify(db.get('sync','try:n:n1'))===JSON.stringify(tr) && !!db.get('sync','out:n:n1') && !A.changes.length && !A.status.length);
  await A.sync.reconcile(); const r2=A.sync.runner; await A.sync.idle(300); await A.sync.idle(300); const doc=cloud.doc('notes','n1');
  ok('N1a the successor resolves the same attempt (op '+(doc && doc.op===tr.op)+'): the document is there once (rev '+(doc||{}).rev+'), the attempt and the job are gone', r2!==r && !!doc && doc.op===tr.op && doc.rev===1 && !db.get('sync','try:n:n1') && !db.get('sync','out:n:n1')); }
// N1b: a late refusal: no backoff written, no «denied», no count of an error
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'N1b',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); await note(A,'n1','refused late');
  let refuse; const real=A.proxy.txn; A.proxy.txn=()=>new Promise((_,rej)=>{ refuse=rej; }); const r=A.sync.runner; let d; const run=(async()=>{ for(let i=0;i<6;i++){ d=await r.step(); if(d.did==='ended') break; } })();
  for(let i=0;i<100 && !refuse;i++) await tick(2); const job=JSON.stringify(db.get('sync','out:n:n1')), w0=db.writes; r.end('lead'); A.status.length=0; A.logs.length=0;
  refuse(Object.assign(new Error('refused'),{code:'permission-denied'})); await run; await tick(); A.proxy.txn=real;
  ok('N1b a late refusal of a runner that ended («'+d.did+'»): the job is as it was (no backoff, no try counted), nothing written ('+(db.writes-w0)+'), no «denied» ('+r._S.denied+', '+JSON.stringify(A.status)+'), no error logged', !!refuse && d.did==='ended' && JSON.stringify(db.get('sync','out:n:n1'))===job && db.writes===w0 && r._S.denied===false && !A.status.length && !A.logs.some(e=>e.t==='denied' || e.t==='step-error')); }
// N2: a runner made for one epoch over a store of another: its one initialisation fails, it ends, and it makes no cloud call
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'N2',db,'0'); await A.sync.setOwner(U('a')); const e1=epNow(db), ow1=db.get('sync','owner'); await A.sync.setOwner(U('b'));
  const ends=[], r=A.sync.writer.runner({epoch:e1, owner:ow1, cloud:{...A.proxy, uid:'a', env:'test'}, onEnd:x=>ends.push(x)}), s1=await r.start().then(()=>'started', e=>e.code), i2=await r.init().then(()=>'ok', e=>e.code), d=await r.step(); await tick();
  ok('N2 a runner of an epoch the store has left: start fails ('+s1+'), the same result again ('+i2+'), it ended ('+r.ended+', one notice '+JSON.stringify(ends)+'), its step is «'+d.did+'», no cloud call ('+A.calls+')', s1==='epoch' && i2==='epoch' && r.alive===false && r.ended==='mismatch' && ends.join()==='mismatch' && d.did==='ended' && A.calls===0); }
// N3: a transaction already admitted when its runner ends may finish: the records are there, the old runner publishes nothing of them, and the
// successor reads them from the store
{ const cloud=new TestCloud({start:START}), db=new MemStore(), G=gated(db); cloud.write('notes',{id:'in1', title:'incoming', blocks:[{id:'b',row:1,fx:0,text:'from the cloud'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  const A=dev(cloud,'N3',db,'0',{store:G}); await A.sync.setOwner(U('a')); await A.sync.start(); const r=A.sync.runner; A.changes.length=0;
  let open; const done=new Promise(x=>{ open=x; }); let adm; const admitted=new Promise(x=>{ adm=x; }); let d; const run=(async()=>{ for(let i=0;i<20 && !db.get('notes','in1');i++){ if(r.inboxSize() || i<3){ if(!G.gate && !db.get('notes','in1') && r.inboxSize()){ G.gate=done; G.admitted=adm; } } d=await r.step(); if(d.did==='ended') break; } })();
  await Promise.race([admitted, tick(400)]); const before=!!db.get('notes','in1'); r.end('lead'); open(); await run; await tick();
  ok('N3 a chunk admitted before the end commits after it (in the store before the end: '+before+', after: '+!!db.get('notes','in1')+'); the old runner gave no event of it ('+A.changes.length+') and its step is «'+d.did+'»', before===false && !!db.get('notes','in1') && !A.changes.length && d.did==='ended');
  await A.sync.reconcile(); await A.sync.idle(300); const st=await A.sync.state('in1');
  ok('N3a the successor works on from the store: the note is known as received (seen rev '+((st.seen||{}).rev)+'), no job for it', !!st.note && !!st.seen && !st.job); }

/* ── runners of one epoch (§7.3.5), the quota and the sweep (§7.3.2), as §7.3.9 pins them ── */
// P1: a stored wait is woken by the store. A version arrived before its note and waits (`meta.wait`); its runner ended; the note then came to be
// on the device with no delivery of it to any runner. The next runner finds the wait ready when it reads the queue
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P1',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300);
  cloud.write('notes',{id:'par', title:'Parent', blocks:[{id:'b',row:1,fx:0,text:'in the cloud, not seen by the queries yet'}], created:cloud.now(), updated:cloud.now()},{dev:'phone', commitAt:cloud.now()+1e9});   // the note's document lags behind its version
  cloud.write('versions',{id:'vw', note:'par', t:cloud.now(), name:'Waited', title:'Parent', blocks:[{id:'b',row:1,fx:0,text:'a version of a note not here yet'}]},{dev:'phone'}); await A.sync.idle(300); await A.sync.idle(300);
  const waits=!!(db.get('sync','meta:v:vw')||{}).wait && !db.get('versions','vw');
  cloud.advance(10*60000); cloud.write('notes',{id:'u', title:'Unrelated', blocks:[], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); cloud.write('versions',{id:'vu', note:'u', t:cloud.now(), name:'Later', title:'Unrelated', blocks:[]},{dev:'phone'}); await A.sync.idle(300); await A.sync.idle(300);   // the cursor of versions moves on: a new listener no longer delivers the waiting one again
  const moved=!!db.get('versions','vu'); A.sync.runner.end('lead');
  await note(A,'par','the parent, written here');   // the parent exists now; nothing will deliver it
  A.sync.online(false); await A.sync.reconcile(); const r2=A.sync.runner, inMem=r2._S.waiting.size, calls=A.calls; await A.sync.idle(300); await A.sync.idle(300);   // offline: no send of the parent, so no read of it either
  ok('P1 a version that waited for its note ('+waits+') under a runner that ended is applied by the next one from the store, with no cloud call ('+(A.calls-calls)+'; in its memory at first: '+inMem+' note waited for; the record: '+!!db.get('versions','vw')+', the wait left: '+!!(db.get('sync','meta:v:vw')||{}).wait+')', waits && moved && inMem===1 && A.calls===calls && !!db.get('versions','vw') && db.get('versions','vw').name==='Waited' && !(db.get('sync','meta:v:vw')||{}).wait); }
// P2: a queued version held for its note (`vblocked`) is looked at again when the queue is read, whoever sent the note
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P2',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300);
  cloud.fault('fail',{dev:'P2', op:'txn', n:1000}); await note(A,'n1','the note'); await A.sync.versionLocal({op:'create', rec:vrec(cloud,'v1','n1','Named')}); const r=A.sync.runner; for(let i=0;i<12;i++) await r.step();
  const held=r._S.vblocked.has('v1') && !cloud.doc('notes','n1');
  const B=dev(cloud,'P2b',db,eraNow(db)); const rb=B.sync.writer.runner({epoch:epNow(db), owner:db.get('sync','owner'), cloud:{...B.proxy, uid:'a', env:'test'}}); await rb.start(); for(let i=0;i<60 && !cloud.doc('notes','n1');i++){ await rb.step(); cloud.advance(20); } rb.end('lead');   // another live runner of the epoch sent the note, and left
  await tick(); r._S.inbox.length=0; const byOther=!!cloud.doc('notes','n1') && !cloud.doc('versions','v1'); cloud.faults.length=0; cloud.advance(100); r.nudge();   // the first runner applies no delivery of the note: the store alone tells it
  for(let i=0;i<60 && !cloud.doc('versions','v1');i++){ await r.step(); cloud.advance(20); }
  ok('P2 a version held for its note ('+held+'), the note then sent by another runner of the epoch ('+byOther+'): after a nudge the first runner reads the queue, lets the version go and sends it ('+!!cloud.doc('versions','v1')+')', held && byOther && !!cloud.doc('versions','v1') && !r._S.vblocked.has('v1')); }
// P3: a signal of the writer that meets a busy runner is one more step. The step has answered «nothing to do» and is flushing the quota when it comes
{ const cloud=new TestCloud({start:START}), db=new MemStore(), G=gated(db), A=dev(cloud,'P3',db,'0',{store:G}); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); const r=A.sync.runner;
  r._S.quotaDirty=true; const quiet=await r.step(); r._S.quotaDirty=true; let open; const gate=new Promise(x=>{ open=x; }); let adm; const admitted=new Promise(x=>{ adm=x; }); G.gate=gate; G.admitted=adm; const st=r.step(); await Promise.race([admitted, tick(300)]);
  r.nudge(); open(); const d=await st;   // as the writer's commit would signal it; the step is past its reading of the queue
  ok('P3 an idle step asks for nothing soon by itself (next in '+(quiet.next===Infinity? '∞' : quiet.next-cloud.now()+' ms')+'); the same step with a signal arriving while it flushes asks to be run at once ('+d.did+', next in '+(d.next-cloud.now())+' ms)', quiet.did==='idle' && quiet.next>cloud.now() && d.did==='idle' && d.next===cloud.now()); }
// P4: the quota is written as a delta. An old count does not replace a newer one; a flush takes off only what it captured; an ended runner flushes nothing
{ const cloud=new TestCloud({start:START}), db=new MemStore(), G=gated(db), A=dev(cloud,'P4',db,'0',{store:G}); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); const r=A.sync.runner, q0=db.get('sync','quota'), day=S.dayKey(cloud.now());
  db.data.sync.set('quota',{k:'quota', day, reads:(q0? q0.reads : 0)+100, writes:7, lastSend:cloud.now()+5});   // another runner of the device spent meanwhile
  r._S.quota.reads+=3; r._S.quotaDirty=true; const mem0=r._S.quota.reads; await r.step(); const q1=db.get('sync','quota');
  ok('P4 a runner that counted 3 more reads over a record another runner raised by 100 writes the sum ('+((q0||{}).reads||0)+' → '+q1.reads+', writes '+q1.writes+', lastSend kept as the later), not its own count ('+mem0+'), and takes the store\'s figure into its memory ('+r._S.quota.reads+')',
    q1.reads===((q0||{}).reads||0)+103 && q1.writes===7 && q1.lastSend===cloud.now()+5 && r._S.quota.reads===q1.reads);
  let open; const gate=new Promise(x=>{ open=x; }); let adm; const admitted=new Promise(x=>{ adm=x; }); r._S.quota.reads+=2; r._S.quotaDirty=true; G.gate=gate; G.admitted=adm; const st=r.step(); await Promise.race([admitted, tick(300)]);
  r._S.quota.reads+=1; r._S.quotaDirty=true; open(); await st; const q2=db.get('sync','quota'), dirty=r._S.quotaDirty, mem=r._S.quota.reads; await r.step(); const q3=db.get('sync','quota');
  ok('P4a a read counted while a flush is held is not in that flush ('+q1.reads+' → '+q2.reads+', the memory '+mem+', still to write: '+dirty+') and goes with the next ('+q3.reads+')', q2.reads===q1.reads+2 && mem===q1.reads+3 && dirty===true && q3.reads===q1.reads+3);
  r._S.quota.reads+=9; r._S.quotaDirty=true; r.end('lead'); const w0=db.writes; await r.step(); await tick();
  ok('P4b an ended runner opens no flush ('+(db.writes-w0)+' writes): what it still held is the accepted undercount', db.writes===w0 && db.get('sync','quota').reads===q3.reads); }
// P5: a late «no such document» does not undo what the store has gained since the request. The send's read is held; the user deletes the note for
// good meanwhile; the answer says the document is gone (it is back by then). The tombstone job stays and reaches the cloud
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P5',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await note(A,'n1','one'); await A.sync.idle(300); await A.sync.idle(300);
  const doc=cloud.docs.notes.get('n1'); cloud.docs.notes.delete('n1'); const r=A.sync.runner; r._S.snapshot.notes=false; await note(A,'n1','two');   // the document left the cloud past the rules; the edit makes a job, and its send reads the document
  let rel; const hold=new Promise(x=>{ rel=x; }); cloud.fault('hold',{dev:'P5', op:'get', promise:hold}); r.nudge(); let d; const run=(async()=>{ for(let i=0;i<4;i++){ d=await r.step(); if(d.did==='send') break; } })(); await tick(20);
  const del=await A.sync.purgeLocal('n1',{reach:'all'}); cloud.docs.notes.set('n1',doc); const job=db.get('sync','out:n:n1'); rel(); await run;
  const stale=A.logs.some(e=>e.t==='stale-read' && e.id==='n1'); await A.sync.idle(300); await A.sync.idle(300);
  ok('P5 the read of a send answered «gone» after the user queued the deletion ('+del.tomb+'): the answer is not acted on (logged stale: '+stale+'), the document is read again, and the tombstone reaches the cloud ('+!!(cloud.doc('notes','n1')||{}).purged+'); the note does not come back ('+!db.get('notes','n1')+')', del.ok && del.tomb===true && !!job && job.tomb===true && stale && !!(cloud.doc('notes','n1')||{}).purged && !db.get('notes','n1') && !db.get('sync','out:n:n1')); }
// P5v: the same for a version. Its document left the cloud; a rename here reads it; the user deletes the version meanwhile; the answer «gone» is late
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P5v',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await note(A,'n1','one'); await A.sync.versionLocal({op:'create', rec:vrec(cloud,'v1','n1','Named')}); await A.sync.idle(300); await A.sync.idle(300);
  const doc=cloud.docs.versions.get('v1'), was=!!doc; cloud.docs.versions.delete('v1'); const r=A.sync.runner; r._S.snapshot.versions=false; r._S.vlastDelivered.delete('v1'); await A.sync.versionLocal({op:'rename', id:'v1', name:'Renamed'});   // no listener's word for it: the send reads the document
  let rel; const hold=new Promise(x=>{ rel=x; }); cloud.fault('hold',{dev:'P5v', op:'get', promise:hold}); r.nudge(); let d; const run=(async()=>{ for(let i=0;i<4;i++){ d=await r.step(); if(d.did==='vsend') break; } })(); await tick(20);
  const del=await A.sync.versionLocal({op:'delete', id:'v1', reach:'all'}); cloud.docs.versions.set('v1',doc); rel(); await run; const stale=A.logs.some(e=>e.t==='stale-read' && e.col==='v' && e.id==='v1'); await A.sync.idle(300); await A.sync.idle(300);
  ok('P5v the read of a version\'s send answered «gone» after the user queued its deletion ('+(del.cloud===true)+'): not acted on (logged stale: '+stale+'), read again, and the tombstone reaches the cloud ('+!!(cloud.doc('versions','v1')||{}).deleted+')', was && del.ok && del.cloud===true && stale && !!(cloud.doc('versions','v1')||{}).deleted && !db.get('versions','v1')); }
// P6d: a record the pass is confirming changes under the confirming read: nothing is declared
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P6d',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await note(A,'kx','text'); await A.sync.idle(300); await A.sync.idle(300); A.sync.stop(); cloud.docs.notes.delete('kx');
  const day=S.dayKey(cloud.now()); db.data.sync.set('scan:notes',{k:'scan:notes', active:true, after:null, found:0, ids:[], phase:'confirm', cand:['kx'], startedDay:day, day, allow:5, token:'p-gone', at:cloud.now()-10*60000});   // a pass left in its confirmations by a runner that is gone
  let rel; const hold=new Promise(x=>{ rel=x; }); cloud.fault('hold',{dev:'P6d', op:'get', promise:hold}); await A.sync.start(); const r=A.sync.runner; r._S.snapshot.notes=false; let d; const run=(async()=>{ for(let i=0;i<40;i++){ d=await r.step(); if(d.did==='scan') break; } })();
  for(let i=0;i<100 && !A.logs.some(e=>e.t==='scan-taken');i++) await tick(2); await tick(10); const seen0=JSON.stringify(db.get('sync','seen:n:kx'));
  db.data.sync.set('meta:n:kx',{...db.get('sync','meta:n:kx'), lrev:(db.get('sync','meta:n:kx').lrev||0)+1});   // the record moved meanwhile (another tab's write would do it through a transaction; the store is held by nothing here)
  rel(); await run; const stale=A.logs.some(e=>e.t==='stale-read' && e.col==='notes' && e.id==='kx');
  ok('P6d the confirming read answered «gone» over a record that changed since it was asked: nothing is declared (logged stale: '+stale+', `seen` kept: '+(JSON.stringify(db.get('sync','seen:n:kx'))===seen0)+', the base kept: '+!!db.get('sync','meta:n:kx').base+')', stale && !!seen0 && JSON.stringify(db.get('sync','seen:n:kx'))===seen0 && !!db.get('sync','meta:n:kx').base && !A.logs.some(e=>e.t==='vanished')); }
// P6: a full pass under runners. Another runner's fresh pass is not run twice; one left without a runner is taken over from its position; the runner
// that lost it writes nothing of it; a record is declared missing only after its own read confirmed it and with no job of its own; when the day's
// share ends in the middle of the confirmations the phase waits for the next day
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'P6',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); for(const id of ['k1','k2','k3','k4']) await note(A,id,'text of '+id); await A.sync.idle(400); await A.sync.idle(400);
  const sent=['k1','k2','k3','k4'].every(id=>!!cloud.doc('notes',id)); A.sync.stop(); for(const id of ['k2','k3','k4']) cloud.docs.notes.delete(id);   // three documents leave the cloud past the rules
  await note(A,'k3','edited here'); db.data.sync.set('meta:n:k3',{...db.get('sync','meta:n:k3'), err:'receipts'});   // k3 has a job of its own, held back
  const day=S.dayKey(cloud.now()), other={k:'scan:notes', active:true, after:null, found:0, ids:[], startedDay:day, day, allow:2, token:'p-other', at:cloud.now()}; db.data.sync.set('scan:notes', other);
  let scans=0; const real=A.proxy.scan; A.proxy.scan=(...a)=>{ scans++; return real(...a); };
  const old=A.sync.writer.runner({epoch:epNow(db), owner:db.get('sync','owner'), cloud:{...A.proxy, uid:'a', env:'test'}}); await old.start(); old._S.scanTok.notes='p-other';   // the runner that holds the pass (its token), idle
  await A.sync.start(); const r=A.sync.runner; for(let i=0;i<30;i++) await r.step();
  ok('P6 a pass another runner holds and touched lately is not run by this one (scan calls '+scans+', the token '+db.get('sync','scan:notes').token+')', sent && scans===0 && db.get('sync','scan:notes').token==='p-other');
  cloud.advance(2*60000); for(let i=0;i<60 && !A.logs.some(e=>e.t==='scan-taken');i++) await r.step(); for(let i=0;i<40;i++) await r.step(); const sc=db.get('sync','scan:notes'), g=k=>db.get('sync',k);
  ok('P6a left untouched for two minutes, it is taken over under a new token ('+(sc.token!=='p-other')+', scan calls '+scans+'); k2 was read, found gone, declared missing and so created again from the device ('+A.logs.some(e=>e.t==='vanished' && e.id==='k2')+', in the cloud '+!!cloud.doc('notes','k2')+'); the day\'s share ended there: the phase «'+sc.phase+'» waits with '+JSON.stringify(sc.cand)+', the pass still active ('+sc.active+')',
    A.logs.some(e=>e.t==='scan-taken') && sc.token!=='p-other' && scans===1 && A.logs.some(e=>e.t==='vanished' && e.id==='k2') && !!cloud.doc('notes','k2') && !cloud.doc('notes','k4') && sc.active===true && sc.phase==='confirm' && sc.cand.join()==='k3,k4' && !!g('seen:n:k4'));
  const before=JSON.stringify(db.get('sync','scan:notes')), seen4=JSON.stringify(g('seen:n:k4')); old._S.scan.notes={...other}; for(let i=0;i<30 && !old.log.some(e=>e.t==='scan-lost');i++) await old.step();
  ok('P6b the runner that lost the pass meets the new token and writes nothing of it ('+old.log.filter(e=>e.t==='scan-lost').length+' loss logged; the record and k4 as they were)', old.log.some(e=>e.t==='scan-lost') && JSON.stringify(db.get('sync','scan:notes'))===before && JSON.stringify(g('seen:n:k4'))===seen4);
  old.end('page'); cloud.advance(24*3600000); for(let i=0;i<80 && (db.get('sync','scan:notes')||{}).active;i++){ await r.step(); cloud.advance(50); } const done=db.get('sync','scan:notes');
  ok('P6c the next day the pass ends ('+(done.active===false)+'): k4 confirmed and declared missing ('+!g('seen:n:k4')+'); k3, which has a job of its own, was left to the send path by the pass (its job, its `seen` and its base kept: '+[!!g('out:n:k3'), !!g('seen:n:k3'), !!(g('meta:n:k3')||{}).base].join(', ')+')', done.active===false && !g('seen:n:k4') && !!g('out:n:k3') && !!g('seen:n:k3') && !!g('meta:n:k3').base); }
// P7: the sweep. A runner that ends while the page's sweep runs writes nothing after it; a runner that was ended makes no sweep at all
{ const cloud=new TestCloud({start:START}), db=new MemStore(); let sweeps=0, open; const gate=new Promise(x=>{ open=x; });
  const full={n:0, hold:null, tx:(st,mode,fn)=>db.tx(st,mode, async t=>{ const v=await fn(t); if(mode==='readwrite' && full.n>0 && st.includes('notes') && st.includes('blobs')){ full.n--; if(full.hold){ const h=full.hold; full.hold=null; if(full.held) full.held(); await h; } throw Object.assign(new Error('full'),{name:'QuotaExceededError'}); } return v; })};
  const A=dev(cloud,'P7',db,'0',{store:full, deps:{sweep:async()=>{ sweeps++; await gate; }}}); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(300); const r=A.sync.runner;
  cloud.write('notes',{id:'big', title:'incoming', blocks:[{id:'b',row:1,fx:0,text:'no room for it'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); full.n=9; let d; const st=(async()=>{ for(let i=0;i<6;i++){ d=await r.step(); if(d.did==='ended') break; } })(); for(let i=0;i<80 && !sweeps;i++) await tick(2); full.n=0;
  r.end('lead'); const w0=db.writes; open(); await st; await tick();
  ok('P7 the store was full, the runner asked the page for a sweep ('+sweeps+') and ended while it ran: nothing of the runner is written after it ('+(db.writes-w0)+' writes, no mark to read the document again: '+!db.get('sync','refetch:n:big')+'), the step is «'+d.did+'»', sweeps===1 && db.writes===w0 && !db.get('sync','refetch:n:big') && d.did==='ended');
  await A.sync.reconcile(); const r2=A.sync.runner; await A.sync.idle(300); cloud.advance(1000); cloud.write('versions',{id:'vbig', note:'big', t:cloud.now(), name:'No room either', title:'incoming', blocks:[]},{dev:'phone'}); cloud.pump(); await tick();
  let go; const hold=new Promise(x=>{ go=x; }); let held; const isHeld=new Promise(x=>{ held=x; }); r2._S.sweptOnce=false; full.n=9; full.hold=hold; full.held=held; let d2; const st2=(async()=>{ for(let i=0;i<6;i++){ d2=await r2.step(); if(d2.did==='ended') break; } })(); await Promise.race([isHeld, tick(400)]);
  r2.end('lead'); go(); await st2; full.n=0;
  ok('P7a a runner that ended before the store answered «full» asks for no sweep ('+(sweeps-1)+' more), its step is «'+d2.did+'»', sweeps===1 && d2.did==='ended'); }

console.log(fails? '\n'+fails+' failed' : '\nall passed'); process.exit(fails? 1 : 0);
