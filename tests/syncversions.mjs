// The sync core under Node: named versions in the cloud (docs/SYNC-PLAN.md §4.9, PR 4a). The version queue beside the note queue: a version
// goes only after its note and is created with one write; created and deleted before the first send it never reaches the cloud and leaves
// `gone`; a rename is one write of the name over the cloud's own snapshot, a rename back sends nothing; renames on two devices converge on the
// one sent last; deletion beats renaming in both orders; a rename after the note was purged elsewhere ends in a tombstone, with no loop; the
// purging device tombstones the note's versions and a receiving one queues none; a live version of a purged note gets a tombstone; local-only
// versions (too large, a missing body, a shape the rules refuse) are never sent and not counted; a lost confirmation is resolved by the receipt;
// the totals of `versions` match; a delivery before the first send joins an equal snapshot and keeps a different one under a new id; a deletion
// right after setOwner reads the cloud and leaves nothing to come back; a version of an empty note queues the note; a revival takes an unsent
// version along (and gives it back when its document turns up), and holds one whose create is in flight; legacy records and jobs from before
// 4a are migrated; names count in UTF-16 units as the rules do; a rename of a snapshot the normalizer changed passes the test cloud's rename check.
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
const S=loadCore(); let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const owner={env:'test', uid:'u1', email:'u@test'};
function device(cloud, name, o={}){ const d={name, db:o.db||new MemStore(), online:true, clock:0, logs:[], changes:[]};
  d.proxy={ get:(c,i)=>cloud.get(c,i,{dev:name}), page:(c,q,n)=>cloud.page(c,q,n,{dev:name}), totals:c=>cloud.totals(c,{dev:name}), scan:(c,q,n)=>cloud.scan(c,q,n,{dev:name}), txn:(c,i,f)=>cloud.txn(c,i,f,{dev:name}),
    listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr,{dev:name}) };
  d.sync=S.makeSync({db:d.db, cloud:d.proxy, now:()=>cloud.now()+d.clock, random:Math.random, cleanRich:h=>h, env:'test', devId:name, devName:'Device '+name, budgets:o.budgets||{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:10, retryMax:50}, log:e=>d.logs.push(e), onChange:e=>d.changes.push(e)});
  d.off=async on=>{ d.online=on; d.sync.online(on); }; return d; }
async function mk(cloud, name, o={}){ const d=device(cloud, name, o); if(o.before) await o.before(d); await d.sync.setOwner(owner); await d.sync.start(); await d.sync.idle(300); return d; }
const idle=async(...ds)=>{ for(let i=0;i<4;i++) for(const d of ds) await d.sync.idle(400); };
const edit=(d,id,fn)=>d.sync.writeLocal(id,(C,m,t)=>fn(C,t));
const note=(d,id,text,o={})=>edit(d,id,(C,t)=>({title:o.title||'Нотатка '+id, blocks:text===null? [] : [{id:'b1',row:1,fx:0,text}], created:t, updated:t}));
// a named record as index.html builds it (vwrite with full bodies inline)
function vrec(n, id, name, o={}){ const m=S.manifestOf(n.title, n.blocks), src=new Map(n.blocks.map(b=>[b.id,b]));
  const blocks=m.blocks.map(e=>{ const d=src.get(e.id), x={...e, s:S.bodyOf(d)}; if(!d.kind && d.html) x.r=1; return x; });
  return {id, note:n.id, t:o.t||n.updated, w:o.t||n.updated, reason:'manual', name, keep:1, inline:1, title:m.title, sig:m.sig, blocks, size:1, sum:{ch:0,add:blocks.length,del:0,mv:0,ttl:0}}; }
const nameNow=(d,noteId,vid,name,o)=>d.sync.versionLocal({op:'create', rec:vrec(d.db.get('notes',noteId), vid, name, o)});
const vdoc=(cloud,id)=>cloud.doc('versions',id);
const writesOf=(cloud,dev,col)=>cloud.events.filter(e=>e.t==='commit' && e.dev===dev && (!col || e.col===col)).length;
const defer=()=>{ let r; const p=new Promise(x=>r=x); return {promise:p, resolve:r}; };

/* ── 1. a version goes after its note, one write; the cloud document is the record's snapshot without the local fields ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await A.off(false); await note(A,'n1','перший текст'); const r=await nameNow(A,'n1','v1','Чернетка');
  const m=A.db.get('sync','meta:v:v1'), j=A.db.get('sync','out:v:v1');
  ok('1 naming queues one job with lrev 1, offline', r.ok && !!j && !j.tomb && m.lrev===1 && !m.base && A.sync.vjobs().includes('v1'));
  ok('1a the status counts the note and the version: 2 waiting', A.sync.status().code==='offline' && A.sync.status().n===2);
  await A.off(true); await idle(A); const d=vdoc(cloud,'v1');
  ok('1b after the note, the version is in the cloud: one write, rev 1, note n1, the name and the body', !!d && d.rev===1 && d.note==='n1' && d.name==='Чернетка' && d.blocks[0].s==='перший текст' && writesOf(cloud,'A','versions')===1);
  ok('1c the document has no local field (keep, inline, reason, sig, w, h)', d && !('keep' in d) && !('inline' in d) && !('reason' in d) && !('sig' in d) && !('w' in d) && !d.blocks.some(b=>'h' in b));
  const order=cloud.events.filter(e=>e.t==='commit' && e.dev==='A').map(e=>e.col);
  ok('1d the note was written before the version ('+order.join(',')+')', order[0]==='notes' && order.indexOf('versions')>0);
  ok('1e the job is gone, the base is the document, the status is synced or pending', !A.db.get('sync','out:v:v1') && A.db.get('sync','meta:v:v1').base.rev===1 && ['synced','pending'].includes(A.sync.status().code));
  const st=await A.sync.versionStates('n1'); ok('1f versionStates: «у хмарі»', st.v1==='cloud');
  // a version of a note not yet in the cloud waits without a read
  await A.off(false); await note(A,'n2','друга'); await nameNow(A,'n2','v2','Друга'); cloud.fault('fail',{dev:'A', op:'txn', n:1000}); await A.off(true);
  const reads0=cloud.events.length; for(let i=0;i<5;i++) await A.sync.idle(50);
  ok('1g while the note cannot be written, the version is not read or sent (waiting)', !vdoc(cloud,'v2') && A.logs.some(e=>e.t==='vsend-wait' && e.id==='v2') && !A.logs.some(e=>e.t==='vinsure' && e.id==='v2'));
  cloud.faults.length=0; cloud.advance(1000); await idle(A); ok('1h the note went, then the version', !!cloud.doc('notes','n2') && vdoc(cloud,'v2') && vdoc(cloud,'v2').rev===1); }

/* ── 2. created and deleted before the first send; deleted while the create is in flight ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'n1','текст'); await idle(A);
  ok('2 the versions catch-up is done once: cursor:versions.done', !!(A.db.get('sync','cursor:versions')||{}).done);
  await A.off(false); await nameNow(A,'n1','v1','Помилка'); const r=await A.sync.versionLocal({op:'delete', id:'v1'}); await A.off(true); await idle(A);
  ok('2a deleted before any send: nothing in the cloud, no job, `gone`', r.ok && r.cloud===false && !vdoc(cloud,'v1') && !A.db.get('sync','out:v:v1') && A.db.get('sync','meta:v:v1').gone===true && !A.db.get('versions','v1'));
  // in flight
  const h=defer(); cloud.fault('hold',{dev:'A', op:'txn', promise:h.promise}); await nameNow(A,'n1','v2','Летить'); const run=A.sync.idle(400); await new Promise(r=>setTimeout(r,30));
  const r2=await A.sync.versionLocal({op:'delete', id:'v2'}); h.resolve(); await run; await idle(A);
  ok('2b deleted while its create was in flight: the create landed, a tombstone followed', r2.ok && r2.cloud===true && vdoc(cloud,'v2') && vdoc(cloud,'v2').deleted===true && vdoc(cloud,'v2').rev===2 && !A.db.get('versions','v2') && !A.db.get('sync','out:v:v2')); }

/* ── 3. a rename is one write of the name; a rename back sends nothing; two devices converge on the rename sent last ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await nameNow(A,'n1','v1','Перша'); await idle(A,B);
  ok('3 B received the version', B.db.get('versions','v1') && B.db.get('versions','v1').name==='Перша');
  const w0=writesOf(cloud,'A','versions'); await A.sync.versionLocal({op:'rename', id:'v1', name:'Друга'}); await idle(A,B); const d=vdoc(cloud,'v1');
  ok('3a the rename is one write that changes only the name; B has it', d.rev===2 && d.name==='Друга' && writesOf(cloud,'A','versions')===w0+1 && B.db.get('versions','v1').name==='Друга');
  await A.off(false); await A.sync.versionLocal({op:'rename', id:'v1', name:'Третя'}); await A.sync.versionLocal({op:'rename', id:'v1', name:'Друга'}); await A.off(true); await idle(A,B);
  ok('3b a rename back (Друга → Третя → Друга) sends nothing', vdoc(cloud,'v1').rev===2 && !A.db.get('sync','out:v:v1'));
  await A.off(false); await B.off(false); await A.sync.versionLocal({op:'rename', id:'v1', name:'Від A'}); await B.sync.versionLocal({op:'rename', id:'v1', name:'Від B'});
  await A.off(true); await idle(A); await B.off(true); await idle(B,A,B);
  ok('3c two offline renames: the one sent last (B) wins on both devices and in the cloud', vdoc(cloud,'v1').name==='Від B' && A.db.get('versions','v1').name==='Від B' && B.db.get('versions','v1').name==='Від B' && !A.sync.vjobs().length && !B.sync.vjobs().length); }

/* ── 4. deletion beats renaming, in both orders ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await nameNow(A,'n1','v1','Ім\'я'); await nameNow(A,'n1','v2','Ім\'я 2'); await idle(A,B);
  // rename first, then the deletion
  await A.off(false); await B.off(false); await A.sync.versionLocal({op:'rename', id:'v1', name:'Нове'}); await B.sync.versionLocal({op:'delete', id:'v1'});
  await A.off(true); await idle(A); await B.off(true); await idle(B,A,B);
  ok('4 the rename went first, the deletion after it: deleted everywhere', vdoc(cloud,'v1').deleted===true && !A.db.get('versions','v1') && !B.db.get('versions','v1'));
  // the deletion first, then the rename
  await A.off(false); await B.off(false); await A.sync.versionLocal({op:'rename', id:'v2', name:'Нове 2'}); await B.sync.versionLocal({op:'delete', id:'v2'});
  await B.off(true); await idle(B); await A.off(true); await idle(A,B,A);
  ok('4a the deletion went first, the rename after it: still deleted, the rename did not come back, no job left', vdoc(cloud,'v2').deleted===true && !A.db.get('versions','v2') && !B.db.get('versions','v2') && !A.sync.vjobs().length && !A.db.get('sync','out:v:v2')); }

/* ── 5. a rename after the note was purged elsewhere; the purging device tombstones; a receiving one queues none ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await nameNow(A,'n1','v1','Іменована'); await idle(A,B);
  await B.off(false); await B.sync.versionLocal({op:'rename', id:'v1', name:'Перейменована'});
  await edit(A,'n1',(C,t)=>({...C, deleted:t, updated:t})); await idle(A); const pr=await A.sync.purgeLocal('n1'); await idle(A);
  ok('5 the purging device tombstoned the note and its version', pr.ok && cloud.doc('notes','n1').purged && vdoc(cloud,'v1').deleted===true && writesOf(cloud,'A','versions')===2);
  const bw0=writesOf(cloud,'B','versions'); await B.off(true); await idle(B,A,B);
  ok('5a B\'s late rename was refused (the version is deleted): B took the tombstone, no loop, no version left', !B.db.get('versions','v1') && !B.db.get('sync','out:v:v1') && writesOf(cloud,'B','versions')===bw0 && B.logs.filter(e=>e.t==='vinsure' && e.id==='v1').length<=3);
  ok('5b the receiving device queued no version tombstone of its own', !B.logs.some(e=>e.t==='vtomb-due')); }

/* ── 6. a live version of a purged note gets a tombstone; a rename refused because the note is purged ── */
{ const cloud=new TestCloud({start:1_700_000_000_000});
  cloud.write('notes',{id:'p1', title:'Стара', blocks:[], created:cloud.now(), updated:cloud.now()},{dev:'phone'});
  cloud.write('versions',{id:'vp', note:'p1', t:cloud.now(), name:'Стара версія', title:'Стара', blocks:[]},{dev:'phone'});
  cloud.write('notes',{id:'p1', purged:cloud.now()},{dev:'phone'});   // the phone purged it without tombstoning its version (an old version of the app)
  const A=await mk(cloud,'A'); await idle(A); ok('6 a live version of a purged note, met on a new device\'s catch-up: A tombstones it', vdoc(cloud,'vp').deleted===true && !A.db.get('versions','vp'));
  // rename refused by noteAlive: the note was purged in the cloud, its tombstone not delivered here yet
  await note(A,'n2','текст'); await nameNow(A,'n2','v2','Друга'); await idle(A);
  await A.off(false); await A.sync.versionLocal({op:'rename', id:'v2', name:'Пізня'}); cloud.write('notes',{id:'n2', purged:cloud.now()},{dev:'phone', commitAt:cloud.now()+600000}); await A.off(true); await idle(A);
  ok('6a the rename was refused (noteAlive): the version gets a tombstone instead, no `invalid` mark, no loop', vdoc(cloud,'v2').deleted===true && !A.db.get('sync','meta:v:v2').err && !A.db.get('sync','out:v:v2')); }

/* ── 7. local-only: too large, a missing body, a shape the rules refuse ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await note(A,'n1','текст'); await idle(A); const n=A.db.get('notes','n1');
  const big={...vrec(n,'vb','Велика'), blocks:[{...vrec(n,'vb','x').blocks[0], s:'Ж'.repeat(500000)}]};
  const partial={...vrec(n,'vq','Неповна'), blocks:[{...vrec(n,'vq','x').blocks[0], s:undefined}]}; delete partial.blocks[0].s;
  const shape={...vrec(n,'vs','Форма'), title:'Т'.repeat(2001)};
  for(const r of [big,partial,shape]) await A.sync.versionLocal({op:'create', rec:r}); await idle(A);
  const st=await A.sync.versionStates('n1');
  ok('7 none of them is sent: big, partial, shape ('+JSON.stringify(st)+')', !vdoc(cloud,'vb') && !vdoc(cloud,'vq') && !vdoc(cloud,'vs') && st.vb==='big' && st.vq==='partial' && st.vs==='shape');
  ok('7a no job, nothing counted as waiting', !A.sync.vjobs().length && A.sync.status().n===0);
  await A.sync.versionLocal({op:'rename', id:'vb', name:'Велика 2'}); await idle(A); ok('7b a rename of a local-only version changes the record only', A.db.get('versions','vb').name==='Велика 2' && !vdoc(cloud,'vb') && !A.sync.vjobs().length); }

/* ── 8. a lost confirmation is resolved by the receipt; the totals of versions match ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await note(A,'n1','текст'); await idle(A); cloud.fault('lost',{dev:'A'}); await nameNow(A,'n1','v1','Втрачена відповідь'); await idle(A);
  ok('8 a lost answer: one write in the cloud, accepted by the receipt, no job', vdoc(cloud,'v1').rev===1 && writesOf(cloud,'A','versions')===1 && !A.db.get('sync','out:v:v1') && A.db.get('sync','meta:v:v1').base.rev===1);
  await A.sync.versionLocal({op:'rename', id:'v1', name:'Друге'}); await nameNow(A,'n1','v2','Ще'); await A.sync.versionLocal({op:'delete', id:'v2'}); await idle(A);
  const seen=await A.sync.seenAll(), sum=seen.versions.reduce((a,s)=>a+s.rev,0), cl=cloud.all('versions'), csum=cl.reduce((a,d)=>a+d.rev,0);
  ok('8a seen of versions equals the cloud: '+seen.versions.length+'/'+sum+' against '+cl.length+'/'+csum, seen.versions.length===cl.length && sum===csum); }

/* ── 9. a delivery before the first send: an equal snapshot joins, a different one is kept under a new id ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A');
  await note(A,'n1','спільний текст'); await idle(A); const n=A.db.get('notes','n1'), r=vrec(n,'vX','Імпортована'), r2=vrec(n,'vY','Інша');
  // the same imported version is already in the cloud, renamed there; another id holds a different snapshot
  cloud.write('versions',{id:'vX', note:'n1', t:r.t, name:'Перейменована там', title:r.title, blocks:r.blocks.map(e=>{ const x={...e}; delete x.h; return x; })},{dev:'phone'});
  cloud.write('versions',{id:'vY', note:'n1', t:r.t, name:'Чужа', title:r.title, blocks:[{id:'b1',row:1,fx:0,s:'зовсім інший текст'}]},{dev:'phone'});
  await A.off(false); await A.sync.versionLocal({op:'create', rec:r}); await A.sync.versionLocal({op:'create', rec:r2}); await A.off(true); await idle(A);
  const all=A.db.all('versions').filter(v=>v.name), mine=all.find(v=>v.id!=='vX' && v.id!=='vY');
  ok('9 the equal snapshot joined: one copy, the cloud\'s name, nothing written for it', A.db.get('versions','vX').name==='Перейменована там' && vdoc(cloud,'vX').rev===1 && !A.db.get('sync','out:v:vX'));
  ok('9a the different snapshot under vY: the cloud\'s is applied, the local one kept under a new id and sent', A.db.get('versions','vY').blocks[0].s==='зовсім інший текст' && !!mine && mine.blocks[0].s==='спільний текст' && !!vdoc(cloud,mine.id)); }

/* ── 10. a deletion right after setOwner, before the versions catch-up: the tombstone reads the cloud ── */
{ const cloud=new TestCloud({start:1_700_000_000_000});
  const seed=device(cloud,'S'); await seed.sync.setOwner(owner); await seed.sync.start(); await note(seed,'n1','текст'); await nameNow(seed,'n1','v1','У хмарі'); await idle(seed);
  ok('10 the account\'s cloud holds v1', vdoc(cloud,'v1').rev===1);
  const db=new MemStore(); const pre=device(cloud,'A',{db}); await pre.sync.setOwner(null); await note(pre,'n1','текст');
  const n=db.get('notes','n1'); await pre.sync.versionLocal({op:'create', rec:{...vrec(n,'v1','У хмарі'), t:seed.db.get('versions','v1').t}}); await pre.sync.versionLocal({op:'create', rec:vrec(n,'v9','Лише тут')});
  const A=device(cloud,'A',{db}); await A.off(false); await A.sync.setOwner(owner); await A.sync.start();
  const r1=await A.sync.versionLocal({op:'delete', id:'v1'}), r9=await A.sync.versionLocal({op:'delete', id:'v9'});
  ok('10a deleted before the catch-up: both become tombstone jobs (the cloud may hold them)', r1.cloud===true && r9.cloud===true && A.db.get('sync','out:v:v1').tomb && A.db.get('sync','out:v:v9').tomb);
  await A.off(true); await idle(A);
  ok('10b v1 is tombstoned in the cloud; v9 had no document: its job went and it is `gone`', vdoc(cloud,'v1').deleted===true && !vdoc(cloud,'v9') && A.db.get('sync','meta:v:v9').gone===true && !A.db.get('versions','v1') && !A.db.get('versions','v9'));
  // a late create of v9 by another device does not bring it back here
  cloud.write('versions',{id:'v9', note:'n1', t:cloud.now(), name:'Повернулася?', title:'x', blocks:[]},{dev:'phone'}); await idle(A);
  ok('10c a late live document of the `gone` id brings no record back and is tombstoned', !A.db.get('versions','v9') && vdoc(cloud,'v9').deleted===true); }

/* ── 11. a version of an empty note queues the note; legacy records and jobs from before 4a are migrated ── */
{ const cloud=new TestCloud({start:1_700_000_000_000});
  const db=new MemStore(); const pre=device(cloud,'A',{db}); await pre.sync.setOwner(null); await note(pre,'n1','був текст'); const n=db.get('notes','n1');
  await pre.sync.versionLocal({op:'create', rec:vrec(n,'v1','Перед очищенням')}); await note(pre,'n1',null);   // the note emptied before the first sign-in
  // a legacy record from before sync PR 1: name only, the body in blobs
  const m=S.manifestOf('Стара', [{id:'b1',row:1,fx:0,text:'тіло в блобах'}]); await db.tx(['versions','blobs','notes'],'readwrite', async t=>{ t.put('notes',{id:'n2', title:'Стара', blocks:[{id:'b1',row:1,fx:0,text:'тіло в блобах'}], created:1, updated:1}); t.put('blobs',{note:'n2', h:m.blocks[0].h, s:'тіло в блобах', r:0, z:10}); t.put('versions',{id:'vL', note:'n2', t:1, w:1, reason:'manual', name:'Легасі', title:'Стара', sig:m.sig, blocks:m.blocks, size:1, sum:{}}); });
  const A=device(cloud,'A',{db}); await A.sync.setOwner(owner); await A.sync.start(); await idle(A);
  ok('11 the empty note was queued for its version: both in the cloud', !!cloud.doc('notes','n1') && vdoc(cloud,'v1') && vdoc(cloud,'v1').rev===1);
  ok('11a the legacy record was inlined from blobs and sent, not «неповна»', vdoc(cloud,'vL') && vdoc(cloud,'vL').blocks[0].s==='тіло в блобах' && A.db.get('versions','vL').keep===1);
  // on a bound device: a record named by the old saveName (keep, no job, no meta) and an old job of an oversized version without meta
  await db.tx(['versions','sync'],'readwrite', async t=>{ t.put('versions',{...vrec(A.db.get('notes','n2'),'vO','Старий saveName')}); const big=vrec(A.db.get('notes','n2'),'vB','Стара велика'); big.blocks=[{...big.blocks[0], s:'Ж'.repeat(500000)}]; t.put('versions',big); t.put('sync',{k:'out:v:vB', tries:0, next:0}); t.put('sync',{k:'out:v:vGone', tries:0, next:0}); });
  A.sync.nudge(); await A.sync.step(); await idle(A);
  ok('11b on a bound device, without a new binding: the old saveName record goes to the cloud', vdoc(cloud,'vO') && vdoc(cloud,'vO').name==='Старий saveName');
  ok('11c the old job of an oversized version is judged before sending: «завелика», not sent; an orphan job went', !vdoc(cloud,'vB') && A.db.get('sync','meta:v:vB').local==='big' && !A.db.get('sync','out:v:vB') && !A.db.get('sync','out:v:vGone')); }

/* ── 12. revival: an unsent version goes along; one whose document turns up goes back and is tombstoned; a create in flight is held ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await idle(A,B);
  await B.off(false); await edit(B,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'правка B'}], updated:t})); await nameNow(B,'n1','vB','Версія B');
  await edit(A,'n1',(C,t)=>({...C, deleted:t, updated:t})); await idle(A); await A.sync.purgeLocal('n1'); await idle(A);
  await B.off(true); await idle(B,A,B); const rv=B.db.all('notes').find(x=>x.revived && x.revived.from==='n1'), v=B.db.get('versions','vB');
  ok('12 B revived its edit; the unsent named version moved into the revived note and went to the cloud there', !!rv && v && v.note===rv.id && vdoc(cloud,'vB') && vdoc(cloud,'vB').note===rv.id); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await idle(A,B); const n=B.db.get('notes','n1'), r=vrec(n,'vI','Імпорт на двох');
  await A.sync.versionLocal({op:'create', rec:{...r}}); await idle(A);   // A sent the imported version
  await B.off(false); await B.sync.versionLocal({op:'create', rec:{...r}}); await edit(B,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'правка B'}], updated:t}));
  await edit(A,'n1',(C,t)=>({...C, deleted:t, updated:t})); await idle(A); await A.sync.purgeLocal('n1'); await idle(A);
  ok('12a A tombstoned the note and the version it had sent', vdoc(cloud,'vI').deleted===true);
  await B.off(true); await idle(B,A,B); const rv=B.db.all('notes').find(x=>x.revived);
  ok('12b B moved its copy into the revived note, the server read found the tombstone: no copy survives anywhere', !!rv && !B.db.get('versions','vI') && vdoc(cloud,'vI').deleted===true && !cloud.all('versions').some(d=>!d.deleted && d.note===rv.id)); }
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B');
  await note(A,'n1','текст'); await idle(A,B);
  await edit(B,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'правка B'}], updated:t})); await idle(B,A);
  B.online=false; cloud.fault('lost',{dev:'B'}); await nameNow(B,'n1','vH','У польоті'); await B.sync.idle(400);   // B's listener hears nothing, so no echo resolves it either await A.off(false); await B.off(false);   // the create landed, its answer was lost: the attempt stays open (its retry waits on the virtual clock)
  ok('12c the create is in the cloud, B has its attempt open', vdoc(cloud,'vH') && vdoc(cloud,'vH').rev===1 && B.sync.vtries().includes('vH'));
  await edit(B,'n1',(C,t)=>({...C, blocks:[{...C.blocks[0], text:'ще правка B'}], updated:t})); await A.off(true); await edit(A,'n1',(C,t)=>({...C, deleted:t, updated:t})); await idle(A); await A.sync.purgeLocal('n1'); await idle(A);
  await B.off(true); cloud.advance(1000); await idle(B,A,B);
  ok('12d B held the version while its attempt was open; accepted, it went with the original and was tombstoned', vdoc(cloud,'vH').deleted===true && !B.db.get('versions','vH') && !(B.db.get('sync','meta:v:vH')||{}).held); }

/* ── 13. names count by code points; a rename of a snapshot the normalizer changed ── */
{ const e40='😀'.repeat(40), e41='😀'.repeat(41);   // the rules' size() counts UTF-16 units (measured on the emulator): 40 emoji are 80
  ok('13 normVersion: a name of 40 emoji (80 UTF-16 units) passes, 41 is refused, as the rules do', !S.normVersion({note:'n', t:1, name:e40, title:'', blocks:[]}).bad && S.normVersion({note:'n', t:1, name:e41, title:'', blocks:[]}).bad==='name');
  const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'), B=await mk(cloud,'B'); await note(A,'n1','текст'); await idle(A,B);
  const n=A.db.get('notes','n1'); await A.sync.versionLocal({op:'create', rec:vrec(n,'vE','😀'.repeat(45))}); await idle(A,B);
  ok('13a a longer imported name is cut to 80 UTF-16 units without splitting a pair, sent and received without quarantine', vdoc(cloud,'vE').name===e40 && B.db.get('versions','vE') && B.db.get('versions','vE').name===e40 && !B.db.get('sync','quarantine:v:vE'));
  const rr=await A.sync.versionLocal({op:'rename', id:'vE', name:e41}); ok('13b a rename over 80 UTF-16 units is refused locally', rr.ok===false && rr.code==='name');
  // a snapshot the normalizer changes on the way in: a block whose parent area is missing goes to the sheet here, the cloud keeps it as it is
  cloud.write('versions',{id:'vN', note:'n1', t:cloud.now(), name:'Сира', title:'T', blocks:[{id:'c1', row:1, parent:'gone-area', col:2, s:'у неіснуючій області'}]},{dev:'phone'}); await idle(B);
  ok('13c B normalized the received snapshot (the block is on the sheet here)', B.db.get('versions','vN') && !B.db.get('versions','vN').blocks[0].parent);
  await B.sync.versionLocal({op:'rename', id:'vN', name:'Перейменована'}); await idle(B);
  ok('13d the rename passes the rename check: the cloud\'s snapshot went as it was, only the name changed', vdoc(cloud,'vN').rev===2 && vdoc(cloud,'vN').name==='Перейменована' && vdoc(cloud,'vN').blocks[0].parent==='gone-area' && !B.db.get('sync','meta:v:vN').err); }

/* ── 14. the test cloud refuses what Firestore refuses ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); let r1=null, r2=null;
  try{ cloud.write('versions',{id:'vT', note:'n1', deleted:true},{dev:'phone'}); }catch(e){ r1=e.code; }
  cloud.write('notes',{id:'n1', title:'', blocks:[], created:1, updated:1},{dev:'phone'});
  try{ cloud.write('versions',{id:'vW', note:'n1', t:'вчора', name:'x', title:'', blocks:[]},{dev:'phone'}); }catch(e){ r2=e.code; }
  ok('14 a version tombstone without a document and a create of the wrong shape are refused ('+r1+', '+r2+')', r1==='permission-denied' && r2==='permission-denied'); }

/* ── 15. a refused rename whose check read is held, a deletion meanwhile: the tombstone goes, the old refusal marks nothing ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'n1','текст'); await nameNow(A,'n1','v1','Ім\'я'); await idle(A);
  const h=defer(); cloud.fault('fail',{dev:'A', op:'txn', code:'permission-denied'}); cloud.fault('hold',{dev:'A', op:'get', promise:h.promise});
  await A.sync.versionLocal({op:'rename', id:'v1', name:'Відмовлено'}); const run=A.sync.idle(400); await new Promise(r=>setTimeout(r,30));
  await A.sync.versionLocal({op:'delete', id:'v1'}); h.resolve(); await run; await idle(A);
  ok('15 the deletion made while the refusal was judged went; no `invalid` mark', vdoc(cloud,'v1').deleted===true && !(A.db.get('sync','meta:v:v1')||{}).err && !A.db.get('sync','out:v:v1')); }

/* ── 16. a vanished version is created again ── */
{ const cloud=new TestCloud({start:1_700_000_000_000}); const A=await mk(cloud,'A'); await note(A,'n1','текст'); await nameNow(A,'n1','v1','Зникне'); await idle(A);
  cloud.docs.versions.delete('v1'); await A.sync.versionLocal({op:'rename', id:'v1', name:'Після зникнення'}); await idle(A);
  ok('16 the rename found no document: the version is created again with the new name', vdoc(cloud,'v1') && vdoc(cloud,'v1').rev===1 && vdoc(cloud,'v1').name==='Після зникнення'); }

console.log(fails? '\n'+fails+' FAILED' : '\nall passed'); process.exit(fails? 1 : 0);
