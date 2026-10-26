// The sync core under Node: access and the server's refusals (docs/SYNC-PLAN.md §4.5 errors, §4.8, §4.11 step 2, §4.16, §4.18). A refused
// read means no access («denied»); the first read since connecting that fails on the network is «could not check» (unverified) until a read
// passes; a refused write is judged by one check read: a refused read is the account, a read that passes marks only that note as invalid and
// the others go on, a read lost on the network leaves the decision to the next attempt; a refused tombstone does not loop; an automatic
// tombstone the rules refuse as early waits a day and is tried again, and an edit of the note cancels the wait; the automatic purge of the
// step finds the trash old enough by the device clock and skips notes with copies or work in flight; the receipt limit blocks one note without
// a write; unauthenticated answers in a row mean the sign-in must be repeated; setOwner erases every store, binds and erases in one
// transaction, and refuses a store whose epoch moved.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const DAY=864e5, owner={env:'test', uid:'u1', email:'u@test'};
const proxyOf=(cloud,d)=>({ get:(c,i)=>cloud.get(c,i,{dev:d.name}), page:(c,q,n)=>cloud.page(c,q,n,{dev:d.name}), totals:c=>cloud.totals(c,{dev:d.name}), scan:(c,q,n)=>cloud.scan(c,q,n,{dev:d.name}), txn:(c,i,f)=>cloud.txn(c,i,f,{dev:d.name}),
  listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr,{dev:d.name}) });   // the device's adapter over a test cloud (another cloud is another account's space)
function device(cloud, name, o={}){ const d={name, db:o.db||new MemStore(), online:true, clock:0, logs:[], status:[], changes:[]}; d.proxy=proxyOf(cloud,d);
  d.sync=S.makeSync({db:d.db, cloud:d.proxy, now:()=>cloud.now()+d.clock, random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:o.budgets||{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50, ...(o.pace||{})}, log:e=>d.logs.push(e), onChange:ev=>d.changes.push(ev), onStatus:(code,n)=>d.status.push(code)});
  d.off=async on=>{ d.online=on; d.sync.online(on); }; return d; }
async function mk(cloud, name, o){ const d=device(cloud, name, o); await d.sync.setOwner(owner); await d.sync.start(); await d.sync.idle(300); return d; }
const idle=async(...ds)=>{ for(let i=0;i<3;i++) for(const d of ds) await d.sync.idle(300); };
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const note=(d,id,text)=>edit(d,id,(C,t)=>C? {...C, blocks:[{...C.blocks[0], text}], updated:t} : {title:'', blocks:[{id:'b',row:1,fx:0,text}], created:t, updated:t});
const trash=(d,id)=>edit(d,id,(C,t)=>({...C, deleted:t, updated:t}));
const restore=(d,id)=>edit(d,id,(C,t)=>{ const n={...C, updated:t}; delete n.deleted; return n; });
const logs=(d,t,id)=>d.logs.filter(e=>e.t===t && (!id || e.id===id));
const seeded=cloud=>{ for(const i of [1,2,3]) cloud.write('notes',{id:'s'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'s'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); };

/* ── 1. a refused read is no access: the first page, a listener; reload() tries again ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); seeded(cloud);
  const A=device(cloud,'A'); cloud.fault('fail',{dev:'A', op:'page', code:'permission-denied'}); cloud.fault('fail',{dev:'A', op:'listen', n:1, code:'permission-denied'}); await A.sync.setOwner(owner); await note(A,'a1','правка до доступу'); await A.sync.start(); await idle(A);   // one listener refused: on the first load the versions listener waits for the notes
  ok('1 the notes listener was refused: denied, status «denied», the edit stays in the queue, nothing written, nothing read', A.sync._S.denied && A.sync.status().code==='denied' && A.status.includes('denied') && logs(A,'denied').length===1 && A.sync.jobs().includes('a1') && !cloud.doc('notes','a1') && !A.db.get('notes','s1'));
  cloud.advance(1000); await idle(A); ok('1b nothing is tried again while denied (the page was never asked for after the listener\'s refusal: '+cloud.faults.length+' refusal left unused)', !cloud.doc('notes','a1') && A.sync.status().code==='denied' && cloud.faults.length===1);
  cloud.faults.length=0;   // the account is let in
  await A.sync.reload(); await A.sync.start(); await idle(A);
  ok('1c reload() (a new leadership, a new sign-in) clears it: the notes came, the edit went, status not denied ('+A.sync.status().code+')', !A.sync._S.denied && !!A.db.get('notes','s1') && !!cloud.doc('notes','a1') && A.sync.status().code!=='denied');
  const B=device(cloud,'B'); cloud.fault('fail',{dev:'B', op:'listen', code:'permission-denied'}); await B.sync.setOwner(owner); await B.sync.start(); await idle(B);
  ok('1d a refused listener is a refused read too: denied', B.sync._S.denied && logs(B,'denied').some(e=>e.kind==='listen') && B.sync.status().code==='denied'); }

/* ── 2. the first read lost on the network: «could not check» until a read passes ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); seeded(cloud);
  const A=device(cloud,'A'); cloud.fault('fail',{dev:'A', op:'page', code:'unavailable'}); cloud.fault('fail',{dev:'A', op:'listen', n:2, code:'unavailable'}); await A.sync.setOwner(owner); await A.sync.start(); await A.sync.idle(5);
  ok('2 the page and the listeners failed on the network before any read: unverified, status «unverified», not denied', A.sync._S.unverified && !A.sync._S.denied && A.sync.status().code==='unverified' && logs(A,'unverified').length===1);
  cloud.advance(100); await idle(A);
  ok('2b the retried page passed: verified, the notes came, status «'+A.sync.status().code+'»', !A.sync._S.unverified && logs(A,'verified').length===1 && !!A.db.get('notes','s1') && A.sync.status().code!=='unverified');
  await A.off(false); await A.off(true); cloud.fault('fail',{dev:'A', op:'page', code:'unavailable'}); await A.sync.idle(5);
  ok('2c a page lost after a reconnect is an ordinary retry, not «could not check»', !A.sync._S.unverified && logs(A,'unverified').length===1); }

/* ── 3. a refused write: the check read decides between the account and the document ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await A.off(false); await note(A,'w1','перша'); await note(A,'w2','друга'); await note(A,'w3','третя');
  cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'});   // the first attempt (w1) is refused; its check read passes
  await A.off(true); await idle(A); const st1=await A.sync.state('w1');
  ok('3 the refused note is marked invalid, its attempt gone and its job kept; the other two went; not denied; status «error»', st1.meta.err==='invalid' && !st1.tr && !!st1.job && !cloud.doc('notes','w1') && !!cloud.doc('notes','w2') && !!cloud.doc('notes','w3') && !A.sync._S.denied && A.sync.status().code==='error' && logs(A,'rejected-write','w1').length===1 && !logs(A,'denied').length);
  cloud.advance(1000); await idle(A); ok('3b the invalid note is not sent again on its own ('+cloud.events.filter(e=>e.t==='commit' && e.id==='w1').length+' commits)', !cloud.doc('notes','w1'));
  await note(A,'w1','перша, виправлена'); await idle(A); const st1b=await A.sync.state('w1');
  ok('3c an edit clears the mark and the note goes', !st1b.meta.err && !!cloud.doc('notes','w1') && cloud.doc('notes','w1').blocks[0].text==='перша, виправлена' && !st1b.job);
  // the check read is refused too: the account has no access; the attempt stays for the next sign-in
  await A.off(false); await note(A,'w2','друга, правка'); cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); cloud.fault('fail',{dev:'A', op:'get', code:'permission-denied'}); await A.off(true); await idle(A); const st2=await A.sync.state('w2');
  ok('3d the check read was refused: denied, the attempt stays, nothing more goes', A.sync._S.denied && !!st2.tr && A.sync.status().code==='denied' && logs(A,'denied').some(e=>e.kind==='check') && cloud.doc('notes','w2').blocks[0].text==='друга');
  await A.sync.reload(); await A.sync.start(); await idle(A); const st2b=await A.sync.state('w2');
  ok('3e after reload() the attempt is run again and accepted', !st2b.tr && cloud.doc('notes','w2').blocks[0].text==='друга, правка' && !A.sync._S.denied);
  // the check read is lost on the network: the attempt is dropped, the job backs off, the next attempt decides (here: accepted)
  await A.off(false); await note(A,'w3','третя, правка'); cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); cloud.fault('fail',{dev:'A', op:'get', code:'unavailable'}); await A.off(true); await idle(A); const st3=await A.sync.state('w3');
  ok('3f the check read was lost: no attempt, the job waits with a retry, no mark', !st3.tr && !!st3.job && st3.job.tries>=1 && !st3.meta.err && !A.sync._S.denied && cloud.doc('notes','w3').blocks[0].text==='третя');
  cloud.advance(100); await idle(A); ok('3g the next attempt was accepted', cloud.doc('notes','w3').blocks[0].text==='третя, правка' && !(await A.sync.state('w3')).job);
  // the phone writes at the very moment of the refusal (a backend that judges the stale write against the new document instead of retrying
  // the transaction): the check read finds a newer revision, the attempt is rejected as by a moved cloud, the merge follows, no invalid mark
  await note(A,'w1','локальна'); const b=cloud.doc('notes','w1');
  cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied', then:c=>c.write('notes',{id:'w1', title:b.title, blocks:[{...b.blocks[0], text:'з телефону'}], created:b.created, updated:c.now()+1},{dev:'phone', dn:'Телефон'})});
  await idle(A); const st4=await A.sync.state('w1'), texts4=JSON.stringify(st4.note)+JSON.stringify(st4.versions), c4=cloud.doc('notes','w1');
  ok('3h the refusal came with a newer document in the cloud: rejected, not invalid; merged here (base rev '+(st4.meta.base||{}).rev+'), both texts kept, the result sent or equal to the cloud (rev '+c4.rev+')', !!st4.meta.base && st4.meta.base.rev===c4.rev && c4.rev>=2 && !st4.meta.err && !st4.tr && !st4.job && texts4.includes('з телефону') && texts4.includes('локальна') && logs(A,'refused-moved','w1').length===1 && logs(A,'rejected','w1').length===1 && logs(A,'merged','w1').length>=1);
  // a refused manual tombstone does not loop
  await note(A,'t1','буде видалена'); await idle(A); const commits0=cloud.events.length; ok('3i the note to be purged is in the cloud', !!cloud.doc('notes','t1') && commits0>0);
  cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); await A.sync.purgeLocal('t1'); await idle(A); cloud.advance(1000); await idle(A); cloud.advance(1000); await idle(A); const st5=await A.sync.state('t1');
  ok('3j a refused tombstone is marked invalid and not sent again ('+(cloud.events.length-commits0)+' more commits)', !!st5.meta && st5.meta.err==='invalid' && !!st5.job && st5.job.tomb && !st5.tr && !cloud.doc('notes','t1').purged && cloud.events.length===commits0);
  // (review) a note whose edit was refused is still deleted for good: the refusal was about the old content, not about the tombstone
  await note(A,'t2','буде відхилена'); await idle(A); cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); await note(A,'t2','відхилена правка'); await idle(A);
  ok('3k the edit of t2 was refused: invalid', (await A.sync.state('t2')).meta.err==='invalid' && cloud.doc('notes','t2').blocks[0].text==='буде відхилена');
  await A.sync.purgeLocal('t2'); await idle(A); const st6=await A.sync.state('t2');
  ok('3l «forever» after a refused edit: the tombstone goes (the mark was the old content\'s), the cloud document is purged', !!cloud.doc('notes','t2').purged && !st6.job && !st6.tr && !st6.meta && !!st6.purged);
  // (review) the user edits the note while the refused attempt's check read is in flight: the refusal was about the old content, the new one goes unmarked
  await note(A,'w4','стара'); await idle(A); let relG; const heldG=new Promise(r=>{ relG=r; });
  cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); cloud.fault('hold',{dev:'A', op:'get', promise:heldG});
  await note(A,'w4','стара, відхилена'); const stepW=A.sync.step(); await new Promise(r=>setTimeout(r,20));   // the attempt was refused and the check read is held
  await note(A,'w4','нова'); relG(); await stepW; await idle(A); const st7=await A.sync.state('w4');
  ok('3m the refusal met a newer local revision: no invalid mark, the new text went ('+cloud.doc('notes','w4').blocks[0].text+')', !st7.meta.err && !st7.tr && !st7.job && cloud.doc('notes','w4').blocks[0].text==='нова' && logs(A,'rejected-write','w4').some(e=>e.stale)); }

/* ── 4. the automatic purge: the early refusal waits a day, an edit cancels the wait, the candidates of the step ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  for(const id of ['p1','p2','p3','p4','p5','p6']) await note(A,id,id); await idle(A);
  for(const id of ['p1','p2','p3','p4','p6']) await trash(A,id); await idle(A);
  const b1=(await A.sync.state('p1')).meta.base; ok('4 the trashed notes went and the echo brought tsrv into the base', S.validSrv(b1.tsrv) && !!b1.deleted);
  // a conflict copy on p4 (an offline edit against a phone edit), an edit waiting on p3 (offline)
  await A.off(false); await note(A,'p4','p4 тут'); const d4=cloud.doc('notes','p4'); cloud.write('notes',{id:'p4', ...Object.fromEntries(Object.entries(d4).filter(([k])=>['title','blocks','created','deleted'].includes(k))), blocks:[{...d4.blocks[0], text:'p4 там'}], updated:cloud.now()+5},{dev:'phone'}); await A.off(true); await idle(A);
  const copies4=A.db.all('versions').filter(v=>v.note==='p4' && v.reason==='copy').length; await A.off(false); await note(A,'p3','p3 правка');
  // the device clock is two days ahead; the server dates p1 and p2 29 days back, p3 and p4 31 days back, p6 32 days back
  A.clock=2*DAY; for(const [id,days] of [['p1',29],['p2',29],['p3',31],['p4',31],['p6',32]]){ cloud.setTsrv(id, cloud.now()-days*DAY); const st=await A.sync.state(id); st.meta.base.tsrv=cloud.doc('notes',id).tsrv; A.db.data.sync.set('meta:n:'+id, st.meta); }   // the device learned the dates (as an echo or a catch-up would bring them)
  ok('4a p4 has a conflict copy ('+copies4+'), p3 an edit waiting', copies4>=1 && A.sync.jobs().includes('p3'));
  const cand=await A.sync.autoPurge(cloud.now()+A.clock);
  ok('4b the candidates by the device clock: p1, p2 and p6; p3 waits to be sent and p4 has a copy, so neither; p5 is not in the trash', cand.sort().join()==='p1,p2,p6');
  await A.off(true); await idle(A); const s1=await A.sync.state('p1'), s2=await A.sync.state('p2'), s6=await A.sync.state('p6');
  ok('4c the rules refused p1 and p2 as early (29 days by the server clock): no tombstone, the attempts gone, the jobs wait a day (tomb, auto, wait), the refusals logged; p6 (32 days) was purged; not denied, status «'+A.sync.status().code+'»', !cloud.doc('notes','p1').purged && !s1.tr && !!s1.job && s1.job.tomb && s1.job.auto && s1.job.wait>cloud.now()+A.clock+DAY-1000 && !s2.tr && !!s2.job && s2.job.wait>0 && logs(A,'purge-early').length===2 && !!cloud.doc('notes','p6').purged && cloud.doc('notes','p6').auto===true && !s6.note && !A.sync._S.denied && A.sync.status().code!=='denied' && A.sync.status().code!=='error');
  const r=await A.sync.step(); ok('4d the step sleeps at least until the next hourly look, not sooner ('+Math.round((r.next-(cloud.now()+A.clock))/60000)+' min)', r.did==='idle' && r.next-(cloud.now()+A.clock)>=3600e3-1000);
  const cand2=await A.sync.autoPurge(cloud.now()+A.clock);
  ok('4e a later look does not pick the waiting notes again, only p3, whose edit has gone meanwhile ('+cand2.join()+')', cand2.join()==='p3' && (await A.sync.state('p1')).job.wait===s1.job.wait);
  await idle(A); ok('4e2 p3 was purged (31 days by both clocks)', !!cloud.doc('notes','p3').purged && !(await A.sync.state('p3')).note);
  // an edit of p2 (a restore) cancels the wait: it goes as an ordinary edit
  await restore(A,'p2'); await idle(A); const s2b=await A.sync.state('p2');
  ok('4f the restore cancelled the wait and went: p2 is live in the cloud, no tombstone, no job', !s2b.job && !cloud.doc('notes','p2').deleted && !cloud.doc('notes','p2').purged && !cloud.doc('notes','p2').tsrv);
  // the next day: p1 is tried again and accepted (the server now agrees: 30 days and a second)
  cloud.advance(DAY+1000); await idle(A); const s1b=await A.sync.state('p1'), c1=cloud.doc('notes','p1');
  ok('4g the next day the purge of p1 went through: an automatic tombstone in the cloud, the note gone here', !!c1.purged && c1.auto===true && !s1b.note && !s1b.job && !!s1b.purged && logs(A,'purged','p1').length===1);
  // the step itself: after a catch-up and then once an hour
  await trash(A,'p5'); await idle(A); cloud.setTsrv('p5', cloud.now()-32*DAY);   // in the trash for long by the server; a new device learns that date from the catch-up
  const B=await mk(cloud,'B'); B.clock=2*DAY; await idle(B);
  ok('4h a new device after its catch-up purged p5 from the step: a tombstone in the cloud', !!cloud.doc('notes','p5').purged && logs(B,'purge-auto','p5').length===1 && B.logs.some(e=>e.t==='purged' && e.id==='p5'));
  await note(B,'p7','p7'); await idle(B); await trash(B,'p7'); await idle(B); cloud.setTsrv('p7', cloud.now()-31*DAY); const st7=await B.sync.state('p7'); st7.meta.base.tsrv=cloud.doc('notes','p7').tsrv; B.db.data.sync.set('meta:n:p7', st7.meta);
  await idle(B); ok('4i within the hour nothing is looked at again', !cloud.doc('notes','p7').purged);
  cloud.advance(3600e3+1000); await idle(B); ok('4j an hour later p7 is purged', !!cloud.doc('notes','p7').purged);
  // (review) a restore while the early refusal of an automatic tombstone is on its way: no day's wait on the restored note, it goes at once
  await note(B,'p8','p8'); await idle(B); await trash(B,'p8'); await idle(B); cloud.setTsrv('p8', cloud.now()-29*DAY); const st8=await B.sync.state('p8'); st8.meta.base.tsrv=cloud.doc('notes','p8').tsrv; B.db.data.sync.set('meta:n:p8', st8.meta);   // 29 days by the server (refused as early), 31 by B's clock two days ahead (a candidate)
  let relP; const heldP=new Promise(r=>{ relP=r; }); cloud.fault('fail',{dev:'B', op:'txn', code:'permission-denied', wait:heldP});
  cloud.advance(3600e3+1000); const stepP=B.sync.idle(300); await new Promise(r=>setTimeout(r,30));   // the purge look queued the automatic tombstone; its attempt waits on the server's answer
  ok('4k the automatic tombstone of p8 is in flight', (B.db.get('sync','try:n:p8')||{}).result && B.db.get('sync','try:n:p8').result.auto===true);
  await restore(B,'p8'); relP(); await stepP; await idle(B); const st8b=await B.sync.state('p8'), c8=cloud.doc('notes','p8');
  ok('4l restored meanwhile: the refusal set no wait, the restored note went at once, live in the cloud, no job', !st8b.job && !st8b.tr && !c8.purged && !c8.deleted && !!st8b.note && !st8b.note.deleted && logs(B,'purge-early','p8').some(e=>e.stale)); }

/* ── 5. the receipt limit: 200 devices on the document, this one not among them ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); cloud.write('notes',{id:'r1', title:'', blocks:[{id:'b',row:1,fx:0,text:'r1'}], created:cloud.now(), updated:cloud.now()},{dev:'dev0'});
  const many={}; for(let i=0;i<200;i++) many['dev'+i]='o'+i; cloud.docs.notes.get('r1').rcpt=many;   // past the rules, as a long life would
  const A=await mk(cloud,'A'); ok('5 the document with 200 receipts arrived', !!A.db.get('notes','r1'));
  const n0=cloud.events.length; await note(A,'r1','правка з 201-го пристрою'); await idle(A); const st=await A.sync.state('r1');
  ok('5a no write was made; the note is marked «receipts», the attempt gone, the job kept, status «error», the change reported', cloud.events.length===n0 && st.meta.err==='receipts' && !st.tr && !!st.job && A.sync.status().code==='error' && logs(A,'receipts','r1').length===1 && A.changes.some(c=>c.kind==='receipts' && c.id==='r1'));
  cloud.advance(1000); await idle(A); ok('5b and it is not tried again', cloud.events.length===n0 && (await A.sync.state('r1')).meta.err==='receipts');
  await note(A,'r2','інша нотатка'); await idle(A); ok('5c the other notes go on', !!cloud.doc('notes','r2')); }

/* ── 6. unauthenticated answers in a row: the sign-in must be repeated ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'u1','один'); await idle(A);
  await A.off(false); await note(A,'u1','два'); cloud.fault('fail',{dev:'A', op:'txn', code:'unauthenticated', n:3}); await A.off(true);
  for(let i=0;i<6;i++){ await A.sync.idle(5); cloud.advance(100); }
  ok('6 three unauthenticated answers: reauth, status «reauth», the attempt kept, nothing more sent', A.sync._S.reauth && A.sync.status().code==='reauth' && A.status.includes('reauth') && logs(A,'reauth').length===1 && A.sync.tries().includes('u1') && cloud.doc('notes','u1').blocks[0].text==='один');
  cloud.advance(1000); await idle(A); ok('6b nothing moves while reauth', cloud.doc('notes','u1').blocks[0].text==='один');
  await A.sync.reload(); await A.sync.start(); await idle(A); ok('6c after reload() (a new sign-in) the attempt is resolved', cloud.doc('notes','u1').blocks[0].text==='два' && !A.sync._S.reauth);
  const B=await mk(cloud,'B'); await B.off(false); await note(B,'u2','b'); cloud.fault('fail',{dev:'B', op:'txn', code:'unauthenticated', n:2}); await B.off(true); for(let i=0;i<6;i++){ await B.sync.idle(5); cloud.advance(100); }
  ok('6d two unauthenticated answers and then success: a token refresh, no reauth', !B.sync._S.reauth && !!cloud.doc('notes','u2')); }

/* ── 7. setOwner over every store: erase, erase and bind in one transaction, the epoch guard ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'o1','з історією'); await idle(A);
  A.db.data.versions.set('v1',{id:'v1', note:'o1', t:1, w:1, reason:'manual', name:'Назва', keep:1, inline:1, title:'', sig:'s', blocks:[{id:'b', h:'h1', s:'з історією'}], size:1, sum:{}}); A.db.data.blobs.set('o1\u0000h1',{note:'o1', h:'h1', s:'з історією', r:0, z:9});
  const ep0=A.sync.epoch; await A.sync.setOwner(null);
  ok('7 «remove from the device»: notes, versions and blobs are empty, no owner, a new epoch', !A.db.all('notes').length && !A.db.all('versions').length && !A.db.all('blobs').length && !A.db.get('sync','owner') && A.sync.epoch!==ep0 && !A.sync.hasOwner());
  await note(A,'o2','нова без власника'); const ep1=A.sync.epoch;
  let refused=null; try{ await A.sync.setOwner({env:'test', uid:'u2', email:'v@test'}, {expectEpoch:'e-stale'}); }catch(e){ refused=e.code; }
  ok('7a a stale expected epoch refuses the change: code «'+refused+'», the note and the epoch untouched, still no owner', refused==='epoch' && !!A.db.get('notes','o2') && A.sync.epoch===ep1 && !A.db.get('sync','owner'));
  await A.sync.setOwner({env:'test', uid:'u2', email:'v@test'}, {expectEpoch:ep1});
  ok('7b with the current epoch it binds: owner u2, the note queued for u2', A.sync.owner.uid==='u2' && A.sync.jobs().includes('o2') && A.sync.epoch!==ep1);
  A.db.data.blobs.set('o2\u0000h2',{note:'o2', h:'h2', s:'x', r:0, z:1}); const ep2=A.sync.epoch;
  await A.sync.setOwner({env:'test', uid:'u3', email:'w@test'}, {erase:true, expectEpoch:ep2});
  ok('7c «remove and sign in»: one transaction erased every store and bound u3 with nothing queued', A.sync.owner.uid==='u3' && !A.db.all('notes').length && !A.db.all('blobs').length && !A.sync.jobs().length && !A.db.get('sync','out:n:o2') && A.sync.epoch!==ep2); }

/* ── 7d. a change of owner keeps the local changes: the new owner's cloud has a note of the same id with other content; the queued note is a local
   change over no base (lrev 1 over baseLrev 0), so the document is merged with it (merge0) and the merged note goes up; the job is not dropped ── */
{ const cloud1=new TestCloud({start:1_700_000_000_000}), cloud2=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud1,'A'); await note(A,'m1','текст у хмарі A'); await idle(A);
  cloud2.write('notes',{id:'m1', title:'', blocks:[{id:'c',row:3,fx:0,text:'текст у хмарі B'}], created:cloud2.now(), updated:cloud2.now()},{dev:'phone'});
  A.sync.stop(); const ep=A.sync.epoch; await A.sync.setOwner({env:'test', uid:'u2', email:'v@test'}, {expectEpoch:ep}); const meta0=A.db.get('sync','meta:n:m1');
  ok('7d the note queued for u2 is marked as a local change over no base (lrev 1, baseLrev 0, no base)', A.sync.jobs().includes('m1') && !!meta0 && meta0.lrev===1 && meta0.baseLrev===0 && !meta0.base);
  await A.sync.start({cloud:proxyOf(cloud2,A)}); await idle(A);
  const local=A.db.get('notes','m1'), up=cloud2.doc('notes','m1'), texts=n=>(n.blocks||[]).map(b=>b.text).sort().join('|');
  ok('7e u2\'s document of the same id was merged with the local note, not put over it: both texts here and in u2\'s cloud (rev 2), no job left, u1\'s cloud untouched', texts(local)==='текст у хмарі A|текст у хмарі B' && !!up && up.rev===2 && texts(up)===texts(local) && !A.sync.jobs().length && logs(A,'merged','m1').length===1 && cloud1.doc('notes','m1').rev===1); }

/* ── 8. a block in an area's first column: the canonical form drops col 0, the receiver normalizes it back; a note quarantined for its shape by an older
   normalizer is checked again at start and read from the cloud again, its seen record and its quarantined copy kept until the document is applied;
   one that still fails stays ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await edit(A,'ar1',(C,t)=>({title:'з областю', blocks:[{id:'ar',row:2,fx:0.2,kind:'area',cw:20,ch:6},{id:'k0',row:0,parent:'ar',col:0,text:'перша колонка'},{id:'k1',row:2,parent:'ar',col:1,text:'друга колонка'}], created:t, updated:t}));
  await idle(A,B); const doc=cloud.doc('notes','ar1'), got=B.db.get('notes','ar1');
  ok('8 the cloud document has no col for the first-column block; device B took the note with col 0 and quarantined nothing', !!doc && doc.blocks.find(b=>b.id==='k0').col===undefined && !!got && got.blocks.find(b=>b.id==='k0').col===0 && got.blocks.find(b=>b.id==='k1').col===1 && !B.db.all('sync').some(r=>r.k.startsWith('quarantine:')));
  // the state an older normalizer left on a device that removed its notes and signed in again: no note, a quarantine record, the seen registry, the mark
  const seen=B.db.get('sync','seen:n:ar1');
  B.sync.stop(); B.db.data.notes.delete('ar1'); B.db.data.sync.set('quarantine:n:ar1',{k:'quarantine:n:ar1', raw:{...doc, id:'ar1'}, reason:'shape', seen:{rev:doc.rev, srv:doc.srv}, at:1});
  B.db.data.sync.set('meta:n:ar1',{k:'meta:n:ar1', lrev:0, baseLrev:0, base:null, err:'damaged'});
  B.db.data.sync.set('quarantine:n:bad1',{k:'quarantine:n:bad1', raw:{id:'bad1', title:5, blocks:[], created:1, updated:1, rev:1, srv:doc.srv}, reason:'shape', seen:{rev:1, srv:doc.srv}, at:1});
  await B.sync.reload(); await B.sync.start(); await idle(B);
  const back=B.db.get('notes','ar1'), meta=B.db.get('sync','meta:n:ar1');
  const seen2=B.db.get('sync','seen:n:ar1');
  ok('8b at start the quarantined note passes the current normalizer: it is read from the cloud again against the kept seen record (the same revision counts as fresh), stored with col 0; the quarantine and the mark are gone', !!seen && !!back && back.blocks.find(b=>b.id==='k0').col===0 && !B.db.get('sync','quarantine:n:ar1') && !(meta && meta.err) && logs(B,'recheck','ar1').length===1 && logs(B,'unquarantine','ar1').length===1 && !!seen2 && seen2.rev===doc.rev && !logs(B,'recreated','ar1').length);
  ok('8c a quarantined document that still fails stays in quarantine', !!B.db.get('sync','quarantine:n:bad1') && !logs(B,'recheck','bad1').length && !logs(B,'unquarantine','bad1').length); }

// the state an older normalizer left: the cloud document in quarantine with its seen record, the note marked; what the device had before stays
const quarantined=(d,id,doc)=>{ d.db.data.sync.set('quarantine:n:'+id,{k:'quarantine:n:'+id, raw:{...doc, id}, reason:'shape', seen:{rev:doc.rev, srv:doc.srv}, at:1}); d.db.data.sync.set('seen:n:'+id,{k:'seen:n:'+id, rev:doc.rev, srv:doc.srv});
  const m=d.db.get('sync','meta:n:'+id)||{k:'meta:n:'+id, lrev:0, baseLrev:0, base:null}; d.db.data.sync.set('meta:n:'+id,{...m, err:'damaged'}); };
const areaNote=(cloud,id)=>cloud.write('notes',{id, title:'з областю', blocks:[{id:'ar',row:2,fx:0.2,kind:'area',cw:20,ch:6},{id:'k0',row:0,parent:'ar',text:'перша колонка'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});

/* ── 8d. the read after the restart fails (no network, then a refused read): the quarantined copy, the seen record and the read stay; the next
   start reads the document and the note comes back ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const B=await mk(cloud,'B'); const doc=areaNote(cloud,'ar2'); await idle(B);
  B.sync.stop(); B.db.data.notes.delete('ar2'); B.db.data.sync.set('meta:n:ar2',{k:'meta:n:ar2', lrev:0, baseLrev:0, base:null}); quarantined(B,'ar2',doc);   // as after «Прибрати нотатки з пристрою» and a sign-in
  for(const op of ['get','page','totals','scan']) cloud.fault('fail',{dev:'B', op, n:1000}); cloud.fault('fail',{dev:'B', op:'listen', n:1000});
  await B.sync.reload(); await B.sync.start(); await idle(B);
  const kept=()=>{ const q=B.db.get('sync','quarantine:n:ar2'), sn=B.db.get('sync','seen:n:ar2'), m=B.db.get('sync','meta:n:ar2'); return !!q && !!q.raw && q.raw.rev===doc.rev && q.recheck===true && !!sn && sn.rev===doc.rev && !!B.db.get('sync','refetch:n:ar2') && !B.db.get('notes','ar2') && !!m && m.err==='damaged'; };
  ok('8d no read passes after the restart: the quarantined copy (marked for the recheck), the seen record, the read to do and the mark all stay; no note yet', kept() && logs(B,'refetch-error','ar2').length>=1 && !logs(B,'unquarantine','ar2').length);
  B.sync.stop(); cloud.faults.length=0; for(const op of ['get','page']) cloud.fault('fail',{dev:'B', op, n:1000, code:'permission-denied'}); cloud.fault('fail',{dev:'B', op:'listen', n:1000, code:'permission-denied'});
  await B.sync.reload(); await B.sync.start(); await idle(B);
  ok('8e the next start meets a refused read: still nothing lost, the recheck is not marked twice', kept() && logs(B,'recheck','ar2').length===1);
  B.sync.stop(); cloud.faults.length=0; await B.sync.reload(); await B.sync.start(); await idle(B);
  const back=B.db.get('notes','ar2'), m=B.db.get('sync','meta:n:ar2');
  ok('8f with the network back the document is read and applied: the note with col 0, the quarantine, the read and the mark gone in that step', !!back && back.blocks.find(b=>b.id==='k0').col===0 && !B.db.get('sync','quarantine:n:ar2') && !B.db.get('sync','refetch:n:ar2') && !(m && m.err) && logs(B,'unquarantine','ar2').length===1); }

/* ── 8g. the cloud document was recreated meanwhile (a lower revision, a clearly newer server time): the kept seen record recognizes it, so it is
   merged with the note here, with and without a local edit waiting, instead of being taken for the base and written over ── */
for(const local of [false, true]){ const cloud=new TestCloud({start:1_700_000_000_000}); const B=await mk(cloud,'B'), id='rc'+(+local);
  cloud.write('notes',{id, title:'', blocks:[{id:'b',row:1,fx:0,text:'перший текст'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); await idle(B);
  B.sync.stop(); cloud.advance(2000); const doc2=cloud.write('notes',{id, title:'', blocks:[{id:'b',row:1,fx:0,text:'друга ревізія'}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  quarantined(B,id,doc2);   // the note here stays at rev 1, as when rev 2 was refused
  cloud.advance(5000); cloud.rewrite('notes',id,{title:'', blocks:[{id:'n',row:3,fx:0,text:'відновлений текст'}], created:cloud.now(), updated:cloud.now(), v:1, rev:1, dev:'phone', op:'r1', rcpt:{phone:'r1'}});
  if(local) await B.sync.writeLocal(id,(C,m,t)=>({...C, blocks:[{...C.blocks[0], text:'локальна правка'}], updated:t}));
  await B.sync.reload(); await B.sync.start(); await idle(B);
  const here=B.db.get('notes',id), up=cloud.doc('notes',id), texts=n=>(n && n.blocks||[]).map(b=>b.text).sort().join('|'), want=local? 'відновлений текст|локальна правка' : 'відновлений текст|перший текст';
  ok('8'+(local? 'h' : 'g')+' the recreated document '+(local? 'and a local edit waiting' : 'with no local edit')+': recognized as recreated, merged with the note here; the recreated text is here and stays in the cloud ('+texts(here)+' / '+texts(up)+'), the quarantine gone', logs(B,'recreated',id).length>=1 && texts(here)===want && texts(up)===want && up.rev===2 && !B.db.get('sync','quarantine:n:'+id) && !B.sync.jobs().length); }

/* ── 20. the full status of PR 4c (§4.18): «waiting» from the engine's own first run of an attempt, both streams in every code, the errors list ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const W={waiting:30000}; let A=await mk(cloud,'A',{pace:W});
  await note(A,'n1','текст'); await idle(A);
  const st0=A.sync.status(); ok('20 with both totals matched and nothing waiting: «synced», with the time of the match ('+st0.code+')', st0.code==='synced' && st0.checked>0 && st0.vdone===true && st0.errorN===0);
  // an attempt held in flight: «sending» until 30 s after this engine first ran it, then «waiting» with no other event
  const defer=()=>{ let r; const p=new Promise(x=>r=x); return {promise:p, resolve:r}; }, h=defer(); cloud.fault('hold',{dev:'A', op:'txn', promise:h.promise});
  await note(A,'n1','змінено'); const run=A.sync.idle(200); await new Promise(r=>setTimeout(r,50));
  const s1=A.sync.status(); cloud.advance(29000); const s2=A.sync.status(); cloud.advance(2000); const s3=A.sync.status();
  ok('20a a held attempt: «sending» at once and at 29 s, «waiting» at 31 s ('+[s1.code,s2.code,s3.code].join(',')+')', s1.code==='sending' && s2.code==='sending' && s3.code==='waiting');
  A.sync.online(false); A.sync.online(true); await new Promise(r=>setTimeout(r,50)); const s3b=A.sync.status(); ok('20a-r after a reconnect the attempt sent again counts its 30 s anew ('+s3b.code+')', s3b.code!=='waiting');
  // a new engine over the same store resumes the attempt: it counts from its own first run, not from the insurance
  A.sync.stop(); const db=A.db; const B=device(cloud,'A',{db, pace:W}); await B.sync.start(); await new Promise(r=>setTimeout(r,50));
  const s4=B.sync.status(); ok('20b a new leader resuming the attempt does not say «waiting» at once ('+s4.code+')', s4.code!=='waiting'); h.resolve(); await run; await idle(B); A=B;
  // a version job alone is «sending»; a version error alone is «error» with its reason, named in the list
  await A.off(false); await A.sync.versionLocal({op:'create', rec:{id:'v1', note:'n1', t:cloud.now(), w:cloud.now(), reason:'manual', name:'Версія', keep:1, inline:1, title:'', sig:'s', blocks:[{id:'b',row:1,fx:0,s:'змінено'}], size:1, sum:{}}});
  const s5=A.sync.status(); await A.off(true); ok('20c offline with only a version waiting: «offline» · 1, and N counts it ('+s5.code+' '+s5.n+')', s5.code==='offline' && s5.n===1);
  cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied', n:1}); const s6pre=A.sync.status(); await idle(A); const s6=A.sync.status();
  ok('20d a version refused by the rules: «error» · 1, the list names the version and its reason ('+s6.code+' '+JSON.stringify(s6.errors)+')', s6pre.code==='sending' && s6.code==='error' && s6.n===1 && s6.errors.length===1 && s6.errors[0].col==='versions' && s6.errors[0].id==='v1' && s6.errors[0].reason==='invalid'); }

/* ── 21. «versions» only while the first catch-up of versions runs; an account with no versions at all still gets cursor:versions.done ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); cloud.write('notes',{id:'nx', title:'', blocks:[], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); for(let i=0;i<3;i++) cloud.write('versions',{id:'vx'+i, note:'nx', t:cloud.now(), name:'x', title:'', blocks:[]},{dev:'phone'});
  const d=device(cloud,'A'); const codes=[]; const pg=d.proxy.page; let hold=null; d.proxy.page=(c,q,n)=>c==='versions' && hold? hold.then(()=>pg(c,q,n)) : pg(c,q,n);
  let rel; hold=new Promise(r=>rel=r); await d.sync.setOwner(owner); await d.sync.start(); const run=d.sync.idle(3000); for(let i=0;i<20;i++){ await new Promise(r=>setTimeout(r,30)); codes.push(d.sync.status().code); }
  ok('21 the first catch-up of versions still running: «versions» ('+[...new Set(codes)].join(',')+')', codes.includes('versions')); hold=null; rel(); await run; await idle(d);
  ok('21a done: cursor:versions.done is set and the status leaves «versions»', !!(d.db.get('sync','cursor:versions')||{}).done && d.sync.status().code!=='versions');
  d.sync.online(false); d.sync.online(true); const after=[]; for(let i=0;i<6;i++){ await d.sync.idle(50); after.push(d.sync.status().code); }
  ok('21b a reconnect after that never says «versions» ('+[...new Set(after)].join(',')+')', !after.includes('versions'));
  cloud.write('versions',{id:'vx9', note:'nx', t:cloud.now(), name:'y', title:'', blocks:[]},{dev:'phone'}); await idle(d); const s21d=d.sync.status();
  ok('21d a version delivered after that moves the cursor and keeps «done» in memory too ('+s21d.code+', vdone '+s21d.vdone+')', !!d.db.get('versions','vx9') && s21d.vdone===true);
  const E=new TestCloud({start:1_700_000_000_000}), e=await mk(E,'E'); ok('21c an account with no version at all reaches cursor:versions.done', !!(e.db.get('sync','cursor:versions')||{}).done); }

/* ── 22. deviceName: the store's device record, then the name of the next document ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'n1','a'); await idle(A);
  const r=await A.sync.deviceName('  Мій ноутбук  '); await note(A,'n1','b'); await idle(A);
  ok('22 the name is trimmed, kept in the device record and carried as dn by the next document', r.ok && r.name==='Мій ноутбук' && A.db.get('sync','device').name==='Мій ноутбук' && cloud.doc('notes','n1').dn==='Мій ноутбук' && A.sync.devName==='Мій ноутбук');
  const long='😀'.repeat(45); const r2=await A.sync.deviceName(long); ok('22a a name over 80 UTF-16 units is cut between code points', r2.ok && r2.name.length===80); }

/* ── 23. a slow store: a new device's first notes go many per transaction, the status counts them, and says the store is slow ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); for(let i=0;i<60;i++) cloud.write('notes',{id:'m'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'m'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  const db=new MemStore(), real=db.tx.bind(db); let writes=0, slow=false; db.tx=(st,mode,fn)=>{ if(mode==='readwrite' && st.includes('notes')) writes++; return slow? new Promise(r=>setTimeout(r,40)).then(()=>real(st,mode,fn)) : real(st,mode,fn); };
  const d=device(cloud,'A',{db, pace:{slowTx:30}}); await d.sync.setOwner(owner); slow=true; const w0=writes, seen=[];
  await d.sync.start(); const run=d.sync.idle(20000); for(let i=0;i<200 && !(d.sync.status().code==='synced'); i++){ await new Promise(r=>setTimeout(r,20)); const st=d.sync.status(); seen.push(st.code+':'+st.n+(st.slow? ':slow' : '')); } await run; slow=false; await idle(d);
  const all=[...Array(60).keys()].every(i=>d.db.get('notes','m'+i)), rec=seen.filter(x=>x.startsWith('receiving:')).map(x=>+x.split(':')[1]);
  ok('23 the 60 notes of the account arrive in a few transactions, not one each ('+(writes-w0)+' writes over notes)', all && writes-w0<=12);
  ok('23a the status says «receiving» with the count growing ('+[...new Set(rec)].join(',')+')', rec.length>0 && Math.max(...rec)>Math.min(...rec) && Math.max(...rec)<=60);
  ok('23b a write slower than pace.slowTx shows as slow in the status ('+seen.filter(x=>x.endsWith(':slow')).length+' samples)', seen.some(x=>x.endsWith(':slow')));
  ok('23c afterwards: synced, nothing waits', d.sync.status().code==='synced'); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); for(let i=0;i<30;i++) cloud.write('notes',{id:'f'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'f'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  // one chunk fails inside its transaction: the chunk is applied again one note at a time, and every note arrives
  const db=new MemStore(), real=db.tx.bind(db); let thrown=0; db.tx=(st,mode,fn)=>real(st,mode,async t=>{ const r=await fn(t); if(mode==='readwrite' && Array.isArray(r) && r.length>1 && !thrown){ thrown=1; throw new Error('chunk fault'); } return r; });
  const d=await mk(cloud,'B',{db}); await idle(d);
  ok('23d a chunk that fails is applied again note by note: all 30 notes here ('+thrown+' fault)', thrown===1 && [...Array(30).keys()].every(i=>d.db.get('notes','f'+i)) && logs(d,'page-chunk-error').length===1); }

{ const cloud=new TestCloud({start:1_700_000_000_000}); cloud.write('notes',{id:'vn', title:'', blocks:[], created:cloud.now(), updated:cloud.now()},{dev:'phone'}); for(let i=0;i<5;i++) cloud.write('versions',{id:'vv'+i, note:'vn', t:cloud.now(), name:'x', title:'', blocks:[]},{dev:'phone'});
  const d=device(cloud,'C'); const order=[]; const ls=d.proxy.listen; d.proxy.listen=(c,...a)=>{ order.push('listen:'+c+':'+(d.sync._S.snapshot.notes? 'after' : 'before')); return ls(c,...a); };
  await d.sync.setOwner(owner); await d.sync.start(); await idle(d);
  const vl=order.filter(x=>x.startsWith('listen:versions'));
  ok('23e on the first load the versions listener starts only after the notes listener\'s first snapshot ('+order.join(', ')+'), and the versions came', vl.length>=1 && vl.every(x=>x.endsWith(':after')) && !!d.db.get('versions','vv0'));
  const o2=order.length; d.sync.online(false); d.sync.online(true); await idle(d);
  ok('23f once the versions catch-up ended, a reconnect starts the versions listener at once, without waiting for the notes\' snapshot ('+order.slice(o2).join(', ')+' '+d.sync.status().code+' done '+!!(d.db.get('sync','cursor:versions')||{}).done+')', order.slice(o2).some(x=>x==='listen:versions:before') && d.sync.status().code==='synced'); }

{ // the day's budget spent by the notes on a first load, several days running: the versions still come the first day (the review of #122)
  const cloud=new TestCloud({start:1_700_000_000_000}); for(let i=0;i<4;i++) cloud.write('notes',{id:'q'+i, title:'', blocks:[{id:'b',row:1,fx:0,text:'q'+i}], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  cloud.write('versions',{id:'qv', note:'q0', t:cloud.now(), name:'x', title:'', blocks:[]},{dev:'phone'});
  const d=device(cloud,'Q',{budgets:{reads:8, writes:100}}); await d.sync.setOwner(owner); await d.sync.start(); await idle(d); const days=[];
  for(let day=0; day<3; day++){ days.push(!!d.db.get('versions','qv')); cloud.advance(864e5); await d.sync.idle(300); await idle(d); }
  ok('23g a budget of 8 reads, 4 notes and a version: the version is here on the first day ('+days.join(',')+')', days[0]===true); }
{ // a direct write of the core held over the threshold (the quota's flush at the end of a step): busyMs() and slow show it while it waits
  const cloud=new TestCloud({start:1_700_000_000_000}); seeded(cloud);
  const db=new MemStore(), real=db.tx.bind(db); let hold=false, seenBusy=0, seenSlow=0;
  const d=device(cloud,'H',{db, pace:{slowTx:30}}); await d.sync.setOwner(owner); await d.sync.start(); await idle(d);
  db.tx=(st,mode,fn)=>real(st,mode,async t=>{ let quota=false; const put=t.put.bind(t); t.put=(store,v)=>{ if(v && v.k==='quota') quota=true; return put(store,v); }; const r=await fn(t); if(hold && quota) await new Promise(res=>setTimeout(res,120)); return r; });
  hold=true; await note(d,'h1','тримаю квоту'); const run=d.sync.idle(3000);
  for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,10)); const b=d.sync.busyMs(); if(b>=30){ seenBusy=Math.max(seenBusy,b); seenSlow=Math.max(seenSlow, d.sync.status().slow||0); } } await run; hold=false; await idle(d);
  ok('23h the quota\'s flush held for 120 ms is seen: busyMs '+seenBusy+' ms, slow '+seenSlow+' ms', seenBusy>=30 && seenSlow>=30); }

{ // a write held for 300 ms while quick reads run beside it (the open panel's counts every 2 s): the wait is the write's, from its start, and stays
  const cloud=new TestCloud({start:1_700_000_000_000}); seeded(cloud);
  const db=new MemStore(), real=db.tx.bind(db); let hold=false;
  const d=device(cloud,'I',{db, pace:{slowTx:30}}); await d.sync.setOwner(owner); await d.sync.start(); await idle(d);
  db.tx=(st,mode,fn)=>real(st,mode,async t=>{ const r=await fn(t); if(hold && mode==='readwrite' && st.includes('notes')) await new Promise(res=>setTimeout(res,300)); return r; });
  hold=true; const w=note(d,'i1','тримаю запис'); const t0=Date.now(), seen=[];
  for(let i=0;i<20;i++){ await new Promise(r=>setTimeout(r,10)); d.sync.unsynced().catch(()=>{}); seen.push({at:Date.now()-t0, busy:d.sync.busyMs(), slow:d.sync.status().slow||0}); } hold=false; await w; await idle(d);
  const late=seen.filter(x=>x.at>=60 && x.at<=280);
  ok('23i reads beside a held write do not restart its wait: busyMs and slow follow the write ('+late.map(x=>x.busy).join(',')+')', late.length>3 && late.every(x=>x.busy>=x.at-15 && x.slow>=30) && late.every((x,i)=>!i || x.busy>=late[i-1].busy)); }

console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
