// The sync core with the era of a screen (docs/OWNER-ERA-PLAN.md, stage 2; Node, over MemStore). An engine made with `deps.era` and the rules of
// public/owner/model.js (`deps.ownerModel`, §7.1) is the new mode; nothing in the app makes one yet, and without `deps.era` the engine is main's
// (the other sync*.mjs run over it unchanged). Here:
//   W.   the wiring contract of §7.1;
//   M.   the matrix of §8.1, one row per operation of the user in the core: (a) ordered after the commit of a change that kept the records and before
//        the adopting load, the operation is accepted and decides by the new owner; (b) called with the era of a screen read before an erase, it is refused;
//   5s.  the cases of #146 (`syncguard` 5s–5s10) carried over and read again by §8.3: what was «this engine remembers its erase» is now the era;
//   B.   the cases beside the matrix (§8.1) and the rules of §3.3, §3.4, §3.6 and §3.7 one by one.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
import * as OM from '../public/owner/model.js';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const U=n=>({env:'test', uid:n, email:n+'@test'});
const eraNow=db=>OM.eraOf(db.get('sync','epoch')||null);   // what a new screen reads with its records
// a store whose next readonly transactions are planned: pass, hold until released (then run, or fail), fail, fail with a frozen error
const planned=db=>{ const plan=[]; let release=null; const real=db.tx.bind(db), W={plan, opened:0, release:()=>release && release()};   // opened: transactions asked for so far, counted in the call itself
  W.tx=(st,mode,fn)=>{ W.opened++; const a=mode==='readonly' && plan.length? plan.shift() : 'pass';
    if(a==='fail') return Promise.reject(Object.assign(new Error('load failed'),{name:'UnknownError'}));
    if(a==='freeze') return Promise.reject(Object.freeze(Object.assign(new Error('load failed'),{name:'UnknownError', code:'frozen-x'})));
    if(a==='hold') return new Promise(r=>{ release=r; }).then(()=>real(st,mode,fn));
    if(a==='holdfail') return new Promise(r=>{ release=r; }).then(()=>{ throw Object.assign(new Error('load failed'),{name:'UnknownError'}); });
    return real(st,mode,fn); }; return W; };
// an engine over `db` for a screen of `era`; o.store: the wrapper its transactions go through; o.uid: the user the cloud adapter names
function dev(cloud, name, db, era, o={}){ const d={name, db, logs:[], status:[], changes:[], calls:0};
  const c=f=>(...a)=>{ d.calls++; return f(...a); };
  d.proxy={ get:c((col,i)=>cloud.get(col,i,{dev:name})), page:c((col,q,n)=>cloud.page(col,q,n,{dev:name})), totals:c(col=>cloud.totals(col,{dev:name})), scan:c((col,q,n)=>cloud.scan(col,q,n,{dev:name})), txn:c((col,i,f)=>cloud.txn(col,i,f,{dev:name})),
    listen:c((col,from,onDocs,onErr)=>cloud.listen(col,from,onDocs,onErr,{dev:name})) }; if(o.uid) d.proxy.uid=o.uid;
  d.sync=S.makeSync({db:o.store||db, cloud:d.proxy, now:()=>cloud.now(), random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50}, log:e=>d.logs.push(e), onChange:e=>d.changes.push(e), onStatus:code=>d.status.push(code), era, ownerModel:OM, ...(o.deps||{})}); return d; }
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const note=(d,id,text,x={})=>edit(d,id,(C,t)=>({title:text? id : '', blocks:text? [{id:'b',row:1,fx:0,text}] : [], created:t, updated:t, ...x}));
const code=p=>Promise.resolve(p).then(r=>r && r.ok!==false? 'ok' : (r && r.code)||'refused', e=>'throw:'+((e && e.code)||(e && e.name)));
const cErr=e=>(e.committed? 'committed'+(e.erase? '+erase' : '')+':' : '')+(e.code||e.name);
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

// (a) a first sign-in: the engine's memory has no owner until the adopting load, the store has one from the commit on
{ const cloud=new TestCloud({start:START}), db=new MemStore(), W=planned(db), A=dev(cloud,'MA',db,'0',{store:W}); await A.sync.start(); await seed(cloud, A, db);
  const jobs0=db.all('sync').filter(r=>r.k.startsWith('out:')).length; A.status.length=0; A.changes.length=0;
  W.plan.push('hold'); const bind=A.sync.setOwner(U('m1')).then(()=>'ok', cErr);   // its transaction is queued first; its adopting load is held
  const ps=runAll(cloud, A), raw=await Promise.all(ps.map(p=>Promise.resolve(p).then(r=>r, e=>({ok:false, thrown:e.code||e.name})))), R=Object.fromEntries(OPS.map((o,i)=>[o, raw[i]]));
  const g=k=>db.get('sync',k), mem={epoch:A.sync.epoch, owner:A.sync.owner, loaded:A.sync._S.loaded, jobs:A.sync.jobs()};
  ok('Ma the change kept the records and committed (the store names '+(g('owner')||{}).uid+', era '+eraNow(db)+'); the engine\'s memory has not moved (epoch '+mem.epoch+', owner '+mem.owner+'), no job before it ('+jobs0+')',
    (g('owner')||{}).uid==='m1' && eraNow(db)==='0' && mem.epoch===null && mem.owner===null && jobs0===0);
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
  ok('Ma no operation waited for the load or told the page anything ('+JSON.stringify(A.status)+'); the cache took nothing of another epoch (jobs in memory: '+mem.jobs.length+', marked not loaded), the events still went ('+A.changes.filter(e=>e.kind==='version').length+' of versions)',
    !A.status.includes('reload') && !A.status.includes('stale') && mem.jobs.length===0 && A.changes.some(e=>e.kind==='version' && e.id==='vc') && A.changes.some(e=>e.kind==='purged' && e.id==='p1'));
  W.release(); const b=await bind; await A.sync.idle(400); await A.sync.idle(400);
  ok('Ma the adopting load then reads all of it ('+b+', owner '+(A.sync.owner||{}).uid+'): the notes and versions written in the window reach the new owner\'s cloud, the purged note leaves a tombstone',
    b==='ok' && A.sync.owner.uid==='m1' && !!cloud.doc('notes','w1') && !!cloud.doc('notes','i1') && !!cloud.doc('notes','i3') && !!cloud.doc('notes','c1') && !!cloud.doc('notes','u1') && !!cloud.doc('versions','vc') && !!cloud.doc('versions','vh') && !!cloud.doc('notes','p2') && !cloud.doc('notes','w1').purged); }

// (a) again for a change from one owner to another that keeps the records, made by another engine over the same store (another tab): this engine's
// memory is the previous owner's for good, and its «caught up» says nothing of the new owner's cloud (§3.3 item 5)
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
  ok('Mb the engine is not told «reload», its memory is marked not loaded and holds none of it ('+JSON.stringify([...new Set(A.status)])+')', !A.status.includes('reload') && A.sync._S.loaded===false && !A.sync.jobs().includes('w1') && A.sync.owner.uid==='m2'); }

// (b) the era of a screen read before an erase: every operation is refused and writes nothing; the device name is the exception
for(const who of ['another engine','this engine','a fresh engine of the old screen']){
  const cloud=new TestCloud({start:START}), db=new MemStore(), A0=dev(cloud,'MC',db,'0'); await A0.sync.setOwner(U('m4')); await seed(cloud, A0, db);
  const era0=eraNow(db); if(who==='this engine') await A0.sync.setOwner(U('m5'),{erase:true}); else await dev(cloud,'MC',db,era0).sync.setOwner(U('m5'),{erase:true});
  const A=who==='a fresh engine of the old screen'? dev(cloud,'MC',db,era0) : A0; A.status.length=0; const w0=db.writes;
  const cs=await Promise.all(runAll(cloud, A).map(code)), bad=OPS.filter((o,i)=>o!=='deviceName' && cs[i]!=='epoch' && cs[i]!=='throw:epoch');
  ok('Mc an erase by '+who+' (era '+era0+' → '+eraNow(db)+'): every operation with the old era is refused ('+(bad.join(', ')||'all')+'), the device name is not ('+cs[OPS.indexOf('deviceName')]+'), and only it wrote ('+(db.writes-w0)+')',
    era0!==eraNow(db) && !bad.length && cs[OPS.indexOf('deviceName')]==='ok' && db.writes-w0===1 && db.all('notes').length===0 && db.all('versions').length===0 && !db.all('sync').some(r=>r.k.startsWith('out:')) && A.status.includes('reload'));
  const reads=await Promise.all([A.sync.versionStates('vn'), A.sync.lrevOf(), A.sync.state('p1'), A.sync.copiesCount(), A.sync.countCopies('k1'), A.sync.unsynced(), A.sync.seenAll()].map(code));
  ok('Mc the reads that feed that screen are refused the same way ('+[...new Set(reads)].join(', ')+')', reads.every(c=>c==='throw:epoch')); }

/* ── 5s. the cases of #146, for the new mode (§8.3) ── */
{ const cloud=new TestCloud({start:START});
  // 5s, 5s1: the user's writes ordered right after this engine's own setOwner land under the new owner
  const dbA=new MemStore(), A=dev(cloud,'S1',dbA,'0'); await A.sync.setOwner(U('u1')); await A.sync.start(); await A.sync.idle(300); await note(A,'d1','for deletion',{deleted:START}); A.status.length=0;
  const bind=A.sync.setOwner(U('s2')).then(()=>'ok', cErr), ws=[note(A,'s1','saved'), A.sync.importNote({id:'s3', title:'import', blocks:[], created:1, updated:1}), A.sync.purgeLocal('d1',{reach:'all'})].map(code), memAtCall=A.sync.owner.uid;   // the writes are called while the change is in flight
  const out=[await bind, ...(await Promise.all(ws))];
  ok('5s the user\'s writes called while this engine\'s own setOwner is in flight (its memory still names '+memAtCall+'; bind, save, import, delete forever: '+out.join(', ')+') land under the new owner: no «reload», no «stale» ('+JSON.stringify([...new Set(A.status)])+'), the engine names '+A.sync.owner.uid,
    memAtCall==='u1' && out.every(c=>c==='ok') && !A.status.includes('reload') && !A.status.includes('stale') && A.sync.owner.uid==='s2' && !!dbA.get('notes','s1') && !!dbA.get('notes','s3') && !dbA.get('notes','d1') && await A.sync.checkOwner()===true);
  ok('5s1 the saved note is queued for the new owner, the deleted one leaves a tombstone job', !!dbA.get('sync','out:n:s1') && (dbA.get('sync','out:n:d1')||{}).tomb===true);
  // 5s2: an erase, then a save ordered behind it
  const dbE=new MemStore(), E=dev(cloud,'S2',dbE,'0'); await E.sync.setOwner(U('u1')); E.status.length=0;
  const er=E.sync.setOwner(null,{erase:true}).then(()=>'ok', cErr), we=code(note(E,'e1','after the erase')), oe=[await er, await we];
  ok('5s2 after an erase a save ordered behind it is refused ('+oe.join(', ')+'), nothing of it stored, the page is told «reload»', oe[0]==='ok' && oe[1]==='epoch' && !dbE.get('notes','e1') && E.status.includes('reload'));
  // 5s3: a step of the engine ordered after its own setOwner stays strict, and quiet
  const dbQ=new MemStore(), Q=dev(cloud,'S3',dbQ,'0'); await Q.sync.setOwner(U('u1')); await note(Q,'q1','trash',{deleted:START}); Q.status.length=0;
  const bq=Q.sync.setOwner(U('s4')).then(()=>'ok', cErr), tq=code(Q.sync.tombstoneAuto('q1')), oq=[await bq, await tq];
  ok('5s3 an engine step ordered right after this engine\'s own setOwner is refused quietly ('+oq.join(', ')+'; «reload» '+Q.status.filter(c=>c==='reload').length+', «stale» '+Q.status.filter(c=>c==='stale').length+'), the engine names '+Q.sync.owner.uid,
    oq[0]==='ok' && oq[1]==='throw:epoch' && !Q.status.includes('reload') && !Q.status.includes('stale') && Q.sync.owner.uid==='s4' && !(dbQ.get('sync','out:n:q1')||{}).tomb && await Q.sync.checkOwner()===true);
  // 5s4: a first sign-in; nothing waits for the load, each write queues its job in its own transaction
  const dbF=new MemStore(), F=dev(cloud,'S5',dbF,'0'); await F.sync.start(); await F.sync.idle(300); F.status.length=0; await note(F,'f0','before the sign-in');
  const bf=F.sync.setOwner(U('s6')).then(()=>'ok', cErr);
  const fs=[note(F,'f1','first sign-in'), F.sync.importNote({id:'f2', title:'import', blocks:[{id:'b',row:1,fx:0,text:'from a file'}], created:1, updated:1}), F.sync.versionLocal({op:'create', rec:vrec(cloud,'fv1','f0','Named')}), F.sync.importHistory({versions:[vrec(cloud,'fv2','f0','From a file')], blobs:[]}, ['f0'])].map(code);
  const of=[await bf, ...(await Promise.all(fs))]; await F.sync.idle(300); await F.sync.idle(300);
  ok('5s4 a first sign-in: the save, the import, a named version and a history import ordered right after setOwner ('+of.join(', ')+') are queued for the new owner and reach its cloud; no «reload»',
    of.every(c=>c==='ok') && !F.status.includes('reload') && F.sync.owner.uid==='s6' && !!cloud.doc('notes','f1') && !!cloud.doc('notes','f2') && !!cloud.doc('notes','f0') && !!cloud.doc('versions','fv1') && !!cloud.doc('versions','fv2'));
  // 5s5–5s7, read again: on #146 a write called before an erase waited for the engine's first load and so was ordered after the erase. Here a write
  // waits for nothing: called first, it is ordered first, lands, and is erased with the rest; called after, it is refused, whatever became of the load
  for(const failLoad of [false, true]){ const dbG=new MemStore(), G=dev(cloud, 'S7', dbG, '0'); await G.sync.setOwner(U('u1')); await note(G,'g0','old'); const era0=eraNow(dbG);
    const W=planned(dbG), H=dev(cloud,'S7',dbG,era0,{store:W});   // the same store opened anew (a reload): this engine has loaded nothing
    const wh=code(edit(H,'g0',(C,t)=>({...C, blocks:[{id:'b',row:1,fx:0,text:'old, added to'}], updated:t}))), opened=W.opened;
    if(failLoad) W.plan.push('pass','fail');   // setOwner's own first load passes, its adopting load fails
    const eh=H.sync.setOwner(null,{erase:true}).then(()=>'ok', cErr), oh=[await wh, await eh];
    ok('5s'+(failLoad? '6' : '5')+' a write called before an erase of this engine'+(failLoad? ', the erase\'s adopting load failing,' : '')+' is ordered before it without a load (its transaction opened in the call: '+opened+'), lands and is erased ('+oh.join(', ')+'): the device stays empty',
      opened===1 && oh[0]==='ok' && oh[1]===(failLoad? 'committed+erase:UnknownError' : 'ok') && !dbG.get('notes','g0') && !dbG.get('sync','out:n:g0') && !dbG.get('sync','owner'));
    const wa=await code(edit(H,'g0',(C,t)=>({...(C||{}), title:'old', blocks:[{id:'b',row:1,fx:0,text:'added after'}], created:t, updated:t})));
    ok('5s7 a save called after that erase'+(failLoad? ', whose adopting load failed,' : '')+' is refused ('+wa+'): nothing of the erased note comes back', wa==='epoch' && !dbG.get('notes','g0') && !dbG.get('sync','out:n:g0')); }
  // 5s8: two changes of owner overlapping, the older one (records kept) ending after a newer erase whose load failed
  { const dbK=new MemStore(), K0=dev(cloud,'S9',dbK,'0'); await K0.sync.setOwner(U('u1')); await note(K0,'k0','old'); const era0=eraNow(dbK);
    const W=planned(dbK), K=dev(cloud,'S9',dbK,era0,{store:W}); await K.sync.checkOwner();   // loaded
    W.plan.push('hold'); const p1=K.sync.setOwner(U('s10')).then(()=>'ok', cErr); await tick();
    W.plan.push('fail'); const p2=await K.sync.setOwner(U('s11'),{erase:true}).then(()=>'ok', cErr);
    W.release(); const r1=await p1, wk=await code(edit(K,'k0',(C,t)=>({...(C||{}), title:'old', blocks:[{id:'b',row:1,fx:0,text:'old, brought back'}], created:t, updated:t})));
    ok('5s8 an older change ending after a newer erase whose load failed ('+[r1, p2].join(', ')+'): a save of the erased note from the old screen is refused ('+wk+')', p2==='committed+erase:UnknownError' && wk==='epoch' && !dbK.get('notes','k0')); }
  // 5s9, split in two by §8.3: an older erase whose load fails after a newer change loaded
  { const dbL=new MemStore(), L0=dev(cloud,'S12',dbL,'0'); await L0.sync.setOwner(U('u1')); const era0=eraNow(dbL);
    const W=planned(dbL), L=dev(cloud,'S12',dbL,era0,{store:W}); await L.sync.checkOwner();
    W.plan.push('holdfail'); const p1=L.sync.setOwner(U('s13'),{erase:true}).then(()=>'ok', cErr); await tick();
    const p2=await L.sync.setOwner(U('s14')).then(()=>'ok', cErr); W.release(); const r1=await p1;
    const wl=await code(note(L,'l1','under s14'));
    ok('5s9a the old screen is refused, even though its engine loaded the newer owner ('+[r1, p2].join(', ')+'; the engine names '+(L.sync.owner||{}).uid+', the save: '+wl+')', r1==='committed+erase:UnknownError' && p2==='ok' && L.sync.owner.uid==='s14' && wl==='epoch' && !dbL.get('notes','l1'));
    const N=dev(cloud,'S12',dbL,eraNow(dbL)), wn=await code(note(N,'l1','under s14'));   // a new screen: the records and the era read together
    ok('5s9b a new screen, which read the era with the records, saves ('+wn+') and its note is queued for '+(dbL.get('sync','owner')||{}).uid, wn==='ok' && !!dbL.get('notes','l1') && !!dbL.get('sync','out:n:l1') && dbL.get('sync','owner').uid==='s14'); }
  // 5s10: the hint of a committed change survives a frozen error
  { const dbM=new MemStore(), M0=dev(cloud,'S15',dbM,'0'); await M0.sync.setOwner(U('u1'));
    const W=planned(dbM), M=dev(cloud,'S15',dbM,eraNow(dbM),{store:W}); await M.sync.checkOwner();
    W.plan.push('freeze'); const pm=await M.sync.setOwner(null,{erase:true}).then(()=>'ok', cErr);
    ok('5s10 a frozen error of the adopting load still reports the committed erase ('+pm+'), with its code', pm==='committed+erase:frozen-x'); } }

/* ── B. beside the matrix (§8.1), and the rules one by one ── */
// B1 (§3.3 item 3): a write opens its transaction in the call, with no load before it, also on an engine that never loaded and one whose load failed
{ const cloud=new TestCloud({start:START}), db=new MemStore(); await dev(cloud,'B1',db,'0').sync.setOwner(U('b1'));
  const W=planned(db), A=dev(cloud,'B1',db,eraNow(db),{store:W}); W.plan.push('fail','fail','fail'); const t0=db.txCount, p=note(A,'n1','no load'), opened=W.opened, r=await p;
  ok('B1 a save on an engine that never loaded (every read of the store would fail) opens one readwrite transaction in the call ('+opened+') and lands with its job; the plan of failing reads is untouched ('+W.plan.length+')',
    opened===1 && r.ok && W.opened===1 && db.txCount-t0===1 && !!db.get('sync','out:n:n1') && W.plan.length===3 && A.sync._S.loaded===false); }
// B2 (§8.1): an `epoch` record without `era`, written as code before the plan writes it
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B2',db,'0'); await note(A,'n1','before');
  db.data.sync.set('epoch',{k:'epoch', id:'eold1'}); db.data.sync.set('owner',{k:'owner', ...U('old')});   // old code signed in and kept the records
  const w=await code(note(A,'n1','after')), N=dev(cloud,'B2',db,eraNow(db)), wn=await code(note(N,'n1','after, from a new screen'));
  ok('B2 an `epoch` without `era` reads as an era of its own ('+eraNow(db)+'): a write with the earlier era is refused ('+w+'), a screen read after it saves ('+wn+')', eraNow(db)==='eold1' && w==='epoch' && wn==='ok'); }
// B3 (§3.6): `expectEpoch` refuses after a change that kept the records
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B3',db,'0'); await A.sync.setOwner(U('b3')); const e1=A.sync.epoch;
  await dev(cloud,'B3',db,'0').sync.setOwner(U('b3x')); const era=eraNow(db), w0=db.writes;
  const r=await A.sync.setOwner(null,{erase:true, expectEpoch:e1}).then(()=>'ok', cErr), F=dev(cloud,'B3',db,'0'), rf=await F.sync.setOwner(null,{erase:true, expectEpoch:e1}).then(()=>'ok', cErr);
  ok('B3 an erase confirmed over an epoch that a change keeping the records replaced is refused, by the stale engine ('+r+') and by a fresh one ('+rf+'): nothing written, the era stays '+era, era==='0' && r==='epoch' && rf==='epoch' && db.writes===w0 && db.get('sync','owner').uid==='b3x');
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
// B5 (§3.4): the steps against one memory that only a load moves; no send to a cloud that is not the owner's
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B5',db,'0'); await A.sync.setOwner(U('b5')); await A.sync.start(); await note(A,'n1','mine'); await note(A,'t1','trash',{deleted:START}); await A.sync.idle(400); await A.sync.idle(400);
  const X=dev(cloud,'B5',db,'0'); await X.sync.setOwner(U('b5x')); await note(X,'x1','the new owner\'s'); A.status.length=0; const calls=A.calls, e0=A.sync.epoch;
  const st=await A.sync.step(), ta=await code(A.sync.tombstoneAuto('t1')), co=await A.sync.checkOwner();
  ok('B5 another engine changed the owner and kept the records: this engine\'s step does nothing ('+st.did+'), its memory is where its load left it, the new owner\'s queue is not read into it ('+A.sync.jobs().join(',')+'), no cloud call ('+(A.calls-calls)+')',
    st.did==='idle' && A.sync.epoch===e0 && A.sync.owner.uid==='b5' && !A.sync.jobs().includes('x1') && A.calls===calls && ta==='throw:epoch' && co===false);
  ok('B5a the page is told «stale», not «reload» ('+JSON.stringify([...new Set(A.status)])+'): the queue is of the previous owner, the records are the screen\'s', A.status.includes('stale') && !A.status.includes('reload'));
  const w=await code(note(A,'n1','still typing'));
  ok('B5b and a save from that screen lands meanwhile ('+w+'), queued for the new owner', w==='ok' && !!db.get('sync','out:n:n1') && db.get('notes','n1').blocks[0].text==='still typing');
  await dev(cloud,'B5',db,'0').sync.setOwner(U('b5y'),{erase:true}); A.status.length=0; A.sync._S.queueAt=0; const st2=await A.sync.step(), ta2=await code(A.sync.tombstoneAuto('t1'));
  ok('B5c after an erase the same step tells «reload» ('+JSON.stringify([...new Set(A.status)])+', '+st2.did+', '+ta2+')', A.status.includes('reload') && !A.status.includes('stale') && st2.did==='idle' && ta2==='throw:epoch');
  // a cloud adapter that names another user than the owner is not used
  const db2=new MemStore(), cloudB=new TestCloud({start:START}), O=dev(cloudB,'B5o',db2,'0',{uid:'someone-else'}); await O.sync.setOwner(U('b5o')); await O.sync.start(); await note(O,'o1','not to be sent'); const r=await O.sync.idle(50); O.sync.reconnect();
  ok('B5d an adapter of another user than the owner leaves the step idle ('+r.did+'): no listener, no read, no send ('+O.calls+' calls), the job waits', r.did==='idle' && O.calls===0 && !cloudB.doc('notes','o1') && !!db2.get('sync','out:n:o1'));
  const P=dev(cloudB,'B5o',db2,'0',{uid:'b5o'}); await P.sync.start(); await P.sync.idle(300);
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
  await A.sync.setOwner(U('b8y'),{erase:true}); const ep=db.get('sync','epoch'); eras.push(ep.era); await A.sync.setOwner(null); eras.push(db.get('sync','epoch').era);
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
  db.data.sync.set('meta:n:n1',{...db.get('sync','meta:n:n1'), err:'loop'}); await N.sync.reload(); N.sync.typed('n1'); await tick();
  ok('B10b on an engine whose memory knows the mark, typed alone lifts it, as before', db.get('sync','meta:n:n1').err===undefined);
  await dev(cloud,'B10',db,eraNow(db)).sync.setOwner(U('t3'),{erase:true}); A.sync._S.err.set('n1','loop'); const w0=db.writes; A.status.length=0; A.sync.typed('n1'); await tick();
  ok('B10c from a screen of erased records typed writes nothing ('+(db.writes-w0)+') and the page is told «reload»', db.writes===w0 && A.status.includes('reload')); }
// B11 (§3.4 item 2; the review of 877d7df, finding 1): nothing of the previous owner's cloud reaches the store after a change of owner. Its listeners
// end with the change, a delivery already waiting is not applied, and an answer of a call in flight is dropped
{ const cloudA=new TestCloud({start:START}), cloudB=new TestCloud({start:START}), db=new MemStore(), E=dev(cloudA,'B11',db,'0',{uid:'a'}); await E.sync.setOwner(U('a')); await E.sync.start(); await note(E,'mine','of A'); await E.sync.idle(300); await E.sync.idle(300);
  const live=()=>cloudA.subs.filter(x=>x.dev==='B11' && x.live!==false).length, live0=live(), sent=!!cloudA.doc('notes','mine');
  await E.sync.setOwner(U('b'),{erase:true}); const live1=live();
  cloudA.advance(1000); cloudA.write('notes',{id:'secretA', title:'secret', blocks:[{id:'b',row:1,fx:0,text:'A only'}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump();
  E.sync.setCloud(dev(cloudB,'B11',db,eraNow(db),{uid:'b'}).proxy); await E.sync.idle(300); await E.sync.idle(300);
  ok('B11 the listeners of the previous owner\'s cloud end with the change ('+live0+' → '+live1+'), and a note written there afterwards never reaches the new owner\'s store ('+db.all('notes').map(n=>n.id).join(',')+')', sent && live0>0 && live1===0 && !db.get('notes','secretA') && db.all('notes').length===0 && E.sync.owner.uid==='b');
  // a delivery that was already waiting when the owner changed (the listener's callback ran, the step had not)
  const db2=new MemStore(), F=dev(cloudA,'B11f',db2,'0',{uid:'a'}); await F.sync.setOwner(U('a')); await F.sync.start(); await F.sync.idle(300);
  cloudA.advance(1000); cloudA.write('notes',{id:'lateA', title:'late', blocks:[{id:'b',row:1,fx:0,text:'A only'}], created:cloudA.now(), updated:cloudA.now()},{dev:'phone'}); cloudA.pump(); const waiting=F.sync.inboxSize();
  const unnamed=dev(cloudB,'B11f',db2,'0').proxy; F.sync._S.inbox.push(...F.sync._S.inbox.splice(0));   // the deliveries stay as they are
  const keep=F.sync._S.inbox.slice(); await F.sync.setOwner(U('b')); F.sync._S.inbox.push(...keep); F.sync.setCloud(unnamed); await F.sync.idle(300); await F.sync.idle(300);
  ok('B11a a delivery of the previous owner\'s listener still waiting after the change ('+waiting+' waiting, put back past the reset) is dropped by its origin, not applied under the new owner ('+F.logs.filter(e=>e.t==='inbox-dropped').length+' drop logged)', waiting>0 && !db2.get('notes','lateA') && F.logs.some(e=>e.t==='inbox-dropped') && F.sync.owner.uid==='b');
  // an answer in flight: the read of a send is held while the owner changes and the records are kept; the send does not go on to the old adapter
  const cloudC=new TestCloud({start:START}), db3=new MemStore(), G=dev(cloudC,'B11g',db3,'0',{uid:'a'}); await G.sync.setOwner(U('a')); await G.sync.start(); await G.sync.idle(300); await note(G,'n1','kept across the change');
  let rel; const hold=new Promise(r=>{ rel=r; }); cloudC.fault('hold',{dev:'B11g', op:'get', promise:hold}); const st=G.sync.step(); await tick(); await G.sync.setOwner(U('b')); rel(); await st; await G.sync.idle(100);
  ok('B11b a read answered after the owner changed is dropped: the note, now the new owner\'s, is not sent on to the previous owner\'s cloud', !cloudC.doc('notes','n1') && !!db3.get('sync','out:n:n1') && !G.sync._S.denied && G.sync.owner.uid==='b'); }
// B12 (the review of 877d7df, finding 2): «the same owner» is read from the store. An engine whose memory names another owner asks for the owner the
// store already has: no new epoch, the queue and a deletion waiting to be sent stay, only the memory is read anew
{ const cloud=new TestCloud({start:START}), db=new MemStore(), A=dev(cloud,'B12',db,'0'); await A.sync.setOwner(U('a')); await A.sync.start(); await A.sync.idle(100);
  const X=dev(cloud,'B12',db,'0'); await X.sync.setOwner(U('b')); await X.sync.start(); await note(X,'gone','to be deleted'); await X.sync.idle(300); await X.sync.idle(300); X.sync.stop();
  const inCloud=!!cloud.doc('notes','gone'); await X.sync.purgeLocal('gone',{reach:'all'}); const e2=db.get('sync','epoch').id, tomb=db.get('sync','out:n:gone');
  A.sync.stop(); await A.sync.setOwner(U('b'),{expectEpoch:e2});
  ok('B12 the store already names the owner asked for: the epoch stays ('+(db.get('sync','epoch').id===e2)+'), the tombstone job and the registry of the deletion stay, the memory is the store\'s now ('+A.sync.owner.uid+', '+(A.sync.epoch===e2)+', jobs '+A.sync.jobs().join(',')+')',
    inCloud && !!tomb && tomb.tomb===true && db.get('sync','epoch').id===e2 && (db.get('sync','out:n:gone')||{}).tomb===true && !!db.get('sync','purged:n:gone') && A.sync.owner.uid==='b' && A.sync.epoch===e2 && A.sync.jobs().includes('gone'));
  await A.sync.start(); await A.sync.idle(300); await A.sync.idle(300); const N=dev(cloud,'B12',db,eraNow(db)); await N.sync.start(); await N.sync.idle(300); await N.sync.idle(300);
  ok('B12a the deletion reaches the cloud ('+!!(cloud.doc('notes','gone')||{}).purged+') and the note does not come back to the device', (cloud.doc('notes','gone')||{}).purged && !db.get('notes','gone')); }

console.log(fails? '\n'+fails+' failed' : '\nall passed'); process.exit(fails? 1 : 0);
