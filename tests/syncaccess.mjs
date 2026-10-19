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
function device(cloud, name, o={}){ const d={name, db:o.db||new MemStore(), online:true, clock:0, logs:[], status:[], changes:[]};
  d.proxy={ get:(c,i)=>cloud.get(c,i,{dev:name}), page:(c,q,n)=>cloud.page(c,q,n,{dev:name}), totals:c=>cloud.totals(c,{dev:name}), scan:(c,q,n)=>cloud.scan(c,q,n,{dev:name}), txn:(c,i,f)=>cloud.txn(c,i,f,{dev:name}),
    listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr,{dev:name}) };
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
  const A=device(cloud,'A'); cloud.fault('fail',{dev:'A', op:'page', code:'permission-denied'}); cloud.fault('fail',{dev:'A', op:'listen', n:2, code:'permission-denied'}); await A.sync.setOwner(owner); await note(A,'a1','правка до доступу'); await A.sync.start(); await idle(A);
  ok('1 the first page and the listeners were refused: denied, status «denied», the edit stays in the queue, nothing written, nothing read', A.sync._S.denied && A.sync.status().code==='denied' && A.status.includes('denied') && logs(A,'denied').length===1 && A.sync.jobs().includes('a1') && !cloud.doc('notes','a1') && !A.db.get('notes','s1'));
  cloud.advance(1000); await idle(A); ok('1b nothing is tried again while denied (the page was never asked for after the listeners\' refusal: '+cloud.faults.length+' refusal left unused)', !cloud.doc('notes','a1') && A.sync.status().code==='denied' && cloud.faults.length===1);
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

console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
