// A randomized simulation of the sync core (docs/SYNC-PLAN.md §5, PR 1): three devices over in-memory stores and one test cloud,
// random operations from a fixed seed (edits of the content and place groups, block deletion and creation, new notes, trash, restore,
// «forever», import of another device's copy), random offline spells, cloud failures by name (lost response, errors, repeated and
// reordered deliveries, delayed and late commits, two runners of one op, listeners ended by an error) and leader changes (a new engine over
// the same store, the old one stepping once more beside it and then stopping). Checked on every write: seen.rev never above the cloud's rev, lrev never decreasing, no insured
// attempt whose result equals the base. After settling: every device equals the cloud for every live note (updated included), every
// confirmed purged entry matches a cloud tombstone, count/sum(rev) of the cloud equal seen on every device, no quarantine, no jobs,
// (`updated` may be newer on a device that changed a note and changed it back: an edit equal to the base by content is not sent),
// no tries, no refetch marks; delivering every cloud document twice more writes nothing; and no edit vanished without a copy: every
// block content a device ever wrote is in the final state, in a conflict copy, superseded by that device itself, or reached the cloud
// (from where only a device that had received it can replace it). Named versions (PR 4a, §4.9): random naming, renaming and deleting;
// after settling every device holds exactly the cloud's live named versions with the cloud's names, no version deleted on any device
// comes back anywhere, no live version of a purged note is left in the cloud, and the totals of `versions` equal seen on every device.
// Settling lasts until every device is «synced» (a commit visible only below every window waits for the full pass, at most once a day),
// up to 80 rounds of 20 minutes. SEEDS=1..6 OPS=1200 by default; a failing seed prints its op log.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { loadCore } from './lib/core.mjs';
import { MemStore } from './lib/memstore.mjs';
import { TestCloud } from './lib/cloud.mjs';
const S=loadCore();
const SEEDS=(process.env.SEEDS||'1,2,3,4,5,6').split(',').map(Number), OPS=+process.env.OPS||1200;
const OUT=path.join(os.tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
function rng(seed){ let a=(seed>>>0)||1; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const live=n=>!n.deleted;

async function run(seed){
  const rnd=rng(seed), pick=arr=>arr[Math.floor(rnd()*arr.length)], chance=p=>rnd()<p; let counter=0;
  const cloud=new TestCloud({auto:true}), owner={env:'test', uid:'u1', email:'u@x'}, ops=[], logs=[], problems=[];
  const written=new Map(), own=new Set(), inCloud=new Set(), key=(n,h)=>n+'|'+h;   // the edit oracle; own and inCloud are keyed by the note and by the root of a revived note
  const rootOf=()=>null; const mark=(set, id, root, h)=>{ set.add(key(id,h)); };
  const fail=(what, detail)=>{ problems.push({op:ops.length, what, detail}); };
  const devs=[], vdeleted=new Set();
  const vrec=(n,id,name)=>{ const m=S.manifestOf(n.title,n.blocks), src=new Map(n.blocks.map(b=>[b.id,b])); const blocks=m.blocks.map(e=>({...e, s:S.bodyOf(src.get(e.id))})); return {id, note:n.id, t:cloud.now(), w:cloud.now(), reason:'manual', name, keep:1, inline:1, title:m.title, sig:m.sig, blocks, size:1, sum:{}}; };
  const named=d=>d.db.all('versions').filter(v=>v.name && v.reason!=='copy');
  const makeEngine=d=>S.makeSync({db:d.db, cloud:d.proxy, now:()=>cloud.now(), random:rnd, cleanRich:h=>h, env:'test', devId:d.name, devName:'Device '+d.name, budgets:{reads:1e9, writes:1e9},
    pace:{dev:0, note:0, big:0, huge:0, slow:0, retryMin:1000, retryMax:8000}, log:e=>logs.push({dev:d.name, ...e}), onChange:()=>{}, onStatus:()=>{}});
  for(const name of ['A','B','C']){ const d={name, db:new MemStore(), online:true, lrev:new Map(), old:null};
    d.proxy={ get:(c,i)=>cloud.get(c,i), page:(c,q,n)=>cloud.page(c,q,n), totals:c=>cloud.totals(c), scan:(c,q,n)=>cloud.scan(c,q,n),
      txn:async(c,i,f)=>{ const r=await cloud.txn(c,i,f); if(r.wrote){ const doc=cloud.doc(c,i); if(doc && !doc.purged) for(const b of doc.blocks||[]) mark(inCloud, i, rootOf(doc), S.contentHash(b)); } return r; },
      listen:(c,from,onDocs,onErr)=>cloud.listen(c,from,(docs,info)=>{ if(d.online) onDocs(docs,info); },onErr) };
    d.db.onPut=(store,rec)=>{ if(store!=='sync') return;
      if(rec.k.startsWith('seen:n:')){ const id=rec.k.slice(7), cd=cloud.docs.notes.get(id); if(!cd || rec.rev>cd.rev) fail('seen above the cloud', {dev:name, id, seen:rec.rev, cloud:cd? cd.rev : null}); }
      if(rec.k.startsWith('purged:n:')) d.lrev.delete(rec.k.slice(9));   // a purged note's meta is gone; a later meta for the id starts anew
      if(rec.k.startsWith('meta:n:')){ const id=rec.k.slice(7), prev=d.lrev.get(id)||0; if((rec.lrev||0)<prev) fail('lrev decreased', {dev:name, id, from:prev, to:rec.lrev}); d.lrev.set(id, rec.lrev||0); }
      if(d.putKeys) d.putKeys.push(rec.k);
      if(rec.k.startsWith('try:n:') && rec.result && !rec.result.purged){ const id=rec.k.slice(6), meta=d.db.get('sync','meta:n:'+id); if(meta && meta.base && S.sameDoc(rec.result, S.noteBody(meta.base))) fail('an empty op was insured', {dev:name, id}); } };
    d.db.onDel=(store,k)=>{ if(store==='sync' && String(k).startsWith('meta:n:')) d.lrev.delete(String(k).slice(7)); };   // a note purged locally may come back from another device's copy and start its lrev anew (decision 2)
    d.sync=makeEngine(d); await d.sync.setOwner(owner); await d.sync.start(); devs.push(d); }
  const notesOf=d=>d.db.all('notes'), blockOf=n=>n.blocks.length? pick(n.blocks) : {id:'b'+(++counter)};   // a merge may leave a note with no blocks (each side deleted the block the other kept)
  const recordEdit=(d, id, before, after)=>{ const bh=new Set((before? before.blocks : []).map(S.contentHash)), ah=new Set((after.blocks||[]).map(S.contentHash));
    for(const b of after.blocks||[]){ const h=S.contentHash(b); if(!written.has(id)) written.set(id,new Map()); if(!written.get(id).has(h)) written.get(id).set(h,{dev:d.name, text:b.text, op:ops.length}); }
    for(const h of bh) if(!ah.has(h)) mark(own, id, rootOf(before), h); };
  const write=async(d, id, fn)=>{ const before=d.db.get('notes',id); const r=await d.sync.writeLocal(id, (C,meta,t)=>fn(C,t)); if(r.ok && !r.same) recordEdit(d, id, before, r.note); return r; };
  const step=async d=>{ if(d.old){ await Promise.all([d.old.step(), d.sync.step()]); d.old.stop(); d.old=null; } else await d.sync.step(); };   // the old leader stops after that step, as a tab that lost the lead does, and its listeners go with it
  const op=async(o)=>{ ops.push(o); const d=devs.find(x=>x.name===o.dev);
    switch(o.k){
      case 'new': await write(d, 'n'+o.n, (C,t)=>({title:'Note '+o.n, blocks:[{id:'b'+o.n, row:1, fx:0, text:'text '+o.n}], created:t, updated:t})); break;
      case 'edit': await write(d, o.id, (C,t)=>C && live(C)? {...C, blocks:C.blocks.some(b=>b.id===o.b)? C.blocks.map(b=>b.id===o.b? {...b, text:o.text} : b) : [...C.blocks, {id:o.b, row:C.blocks.length+1, fx:0, text:o.text}]} : null); break;
      case 'move': await write(d, o.id, (C,t)=>C && live(C)? {...C, blocks:C.blocks.map(b=>b.id===o.b? {...b, row:o.row} : b)} : null); break;
      case 'delblock': await write(d, o.id, (C,t)=>C && live(C) && C.blocks.length>1? {...C, blocks:C.blocks.filter(b=>b.id!==o.b)} : null); break;
      case 'trash': await write(d, o.id, (C,t)=>C && !C.deleted? {...C, deleted:t} : null); break;
      case 'restore': await write(d, o.id, (C,t)=>{ if(!C || !C.deleted) return null; const n={...C}; delete n.deleted; return n; }); break;
      case 'forever': { const C=d.db.get('notes',o.id); if(C){ const copies=d.db.all('versions').filter(v=>v.note===o.id && v.reason==='copy'); const r=await d.sync.purgeLocal(o.id); if(r.ok){ for(const b of C.blocks) mark(own, o.id, rootOf(C), S.contentHash(b)); for(const v of copies) for(const e of v.blocks){ const b={...e}; delete b.h; delete b.s; delete b.r; b.text=e.s||''; mark(own, o.id, rootOf(C), S.contentHash(b)); } } } break; }   // «forever» takes the conflict copies with it, by the owner's decision
      case 'import': { const e=devs.find(x=>x.name===o.from), raw=e.db.get('notes',o.id); if(raw){ const before=d.db.get('notes',o.id); const r=await d.sync.importNote(raw); if(r.ok && (r.kind==='added'||r.kind==='updated')) recordEdit(d, o.id, before, r.note); } break; }
      case 'vname': { const n=d.db.get('notes',o.id); if(n && live(n)) await d.sync.versionLocal({op:'create', rec:vrec(n, o.v, o.name)}); break; }
      case 'vrename': await d.sync.versionLocal({op:'rename', id:o.v, name:o.name}); break;
      case 'vdelete': { const r=await d.sync.versionLocal({op:'delete', id:o.v}); if(r && r.ok) vdeleted.add(o.v); break; }
      case 'toggle': d.online=!d.online; d.sync.online(d.online); break;
      case 'fault': cloud.fault(o.fault, o.opts||{}); break;
      case 'leader': d.old=d.sync; d.sync=makeEngine(d); await d.sync.start(); d.sync.online(d.online); break;   // a new leader knows navigator.onLine
      case 'time': cloud.advance(o.ms); break; }
    cloud.advance(Math.floor(rnd()*1500)); const k=1+Math.floor(rnd()*4); for(let i=0;i<k;i++) await step(pick(devs)); };
  // the run
  for(let i=0;i<OPS;i++){ const d=pick(devs), notes=notesOf(d), lives=notes.filter(live), trashed=notes.filter(n=>n.deleted), r=rnd();
    if(chance(0.1)){ const vs=named(d), q=rnd();   // named versions: name, rename, delete
      if((q<0.5 || !vs.length) && lives.length) await op({dev:d.name, k:'vname', id:pick(lives).id, v:'v'+(++counter), name:'N'+counter});
      else if(q<0.8 && vs.length) await op({dev:d.name, k:'vrename', v:pick(vs).id, name:'R'+(++counter)});
      else if(vs.length) await op({dev:d.name, k:'vdelete', v:pick(vs).id});
      continue; }
    if(r<0.08 || !notes.length) await op({dev:d.name, k:'new', n:++counter});
    else if(r<0.38 && lives.length){ const n=pick(lives); await op({dev:d.name, k:'edit', id:n.id, b: chance(0.8)? blockOf(n).id : 'b'+(++counter), text:'t'+(++counter)}); }
    else if(r<0.46 && lives.length){ const n=pick(lives); await op({dev:d.name, k:'move', id:n.id, b:blockOf(n).id, row:1+Math.floor(rnd()*20)}); }
    else if(r<0.53 && lives.length){ const n=pick(lives); await op({dev:d.name, k:'delblock', id:n.id, b:blockOf(n).id}); }
    else if(r<0.60 && lives.length) await op({dev:d.name, k:'trash', id:pick(lives).id});
    else if(r<0.65 && trashed.length) await op({dev:d.name, k:'restore', id:pick(trashed).id});
    else if(r<0.69 && trashed.length) await op({dev:d.name, k:'forever', id:pick(trashed).id});
    else if(r<0.74){ const e=pick(devs.filter(x=>x!==d)), en=notesOf(e); if(en.length) await op({dev:d.name, k:'import', from:e.name, id:pick(en).id}); }
    else if(r<0.82){ if(d.online && devs.filter(x=>!x.online).length>=2) continue; await op({dev:d.name, k:'toggle'}); }
    else if(r<0.90){ const f=pick(['lost','fail','dup','reorder','late','delay','tworunners']); await op({dev:d.name, k:'fault', fault:f, opts: f==='fail'? {n:1+Math.floor(rnd()*3), code:pick(['unavailable','deadline-exceeded'])} : f==='late'? {ms:600000+Math.floor(rnd()*600000)} : f==='delay'? {ms:Math.floor(rnd()*5000)} : {}}); }
    else if(r<0.93) await op({dev:d.name, k:'leader'});
    else await op({dev:d.name, k:'time', ms:100+Math.floor(rnd()*120000)}); }
  // settle: everyone online, no faults, time passes for retries and late commits
  // a device whose totals still differ is not settled: a commit made visible below every window (`late`) is found by the full pass, at most once a day (§4.6), so settling may take a day
  cloud.faults.length=0; for(const d of devs){ if(!d.online){ d.online=true; d.sync.online(true); } }
  let quiet=0; for(let round=0; round<80 && quiet<3; round++){ cloud.advance(20*60000); cloud.pump(); for(const d of devs) await d.sync.idle(400);
    const busy=devs.some(d=>d.sync.jobs().length || d.sync.tries().length || d.sync.vjobs().length || d.sync.vtries().length || d.sync._S.vrefetch.size || d.sync.inboxSize() || d.sync._S.refetch.size || (d.sync._S.catchup.notes && d.sync._S.catchup.notes.active) || d.sync.status().code!=='synced'); quiet=busy? 0 : quiet+1; }
  // invariants after settling
  const cloudLive=cloud.dump('notes').filter(d=>!d.purged), tombs=cloud.dump('notes').filter(d=>d.purged);
  for(const d of devs){ const notes=notesOf(d), ids=new Set(notes.map(n=>n.id));
    // the body must match; `updated` may be newer on a device that changed a note and changed it back (the job goes when the copy equals the base, §4.5), never older
    for(const c of cloudLive){ const n=d.db.get('notes',c.id); if(!n) fail('a live cloud note is missing on a device', {dev:d.name, id:c.id}); else if(!S.sameDoc(n,c) || n.updated<c.updated) fail('a device differs from the cloud', {dev:d.name, id:c.id, local:S.cjson(n), cloud:S.cjson(S.noteBody(c))}); }
    for(const n of notes) if(!cloudLive.some(c=>c.id===n.id)) fail('a device holds a note the cloud does not have alive', {dev:d.name, id:n.id});
    const sync=d.db.all('sync'); const purged=sync.filter(r=>r.k.startsWith('purged:n:'));
    for(const p of purged){ if(p.rev>0){ const tomb=tombs.find(t=>t.id===p.k.slice(9)); if(!tomb || tomb.rev!==p.rev) fail('a confirmed purged entry without a matching tombstone', {dev:d.name, id:p.k.slice(9), rev:p.rev}); } }
    for(const t of tombs) if(!purged.some(p=>p.k.slice(9)===t.id)) fail('a cloud tombstone unknown to a device', {dev:d.name, id:t.id});
    if(sync.some(r=>r.k.startsWith('quarantine:'))) fail('quarantine not empty', {dev:d.name});
    if(d.sync.jobs().length || d.sync.tries().length || d.sync._S.refetch.size) fail('work left after settling', {dev:d.name, jobs:d.sync.jobs(), tries:d.sync.tries(), refetch:[...d.sync._S.refetch]});
    const seen=await d.sync.seenAll(), tot=await cloud.totals('notes'); const mine={count:seen.notes.length, sum:seen.notes.reduce((a,s)=>a+s.rev,0)};
    if(mine.count!==tot.count || mine.sum!==tot.sum) fail('totals differ from seen', {dev:d.name, mine, cloud:tot});
    const status=d.sync.status(); if(status.code!=='synced') fail('status is not synced after settling', {dev:d.name, status});
    // named versions (§4.9): the device holds exactly the cloud's live versions, with their names; nothing deleted comes back; the totals meet
    const cv=cloud.dump('versions').filter(v=>!v.deleted), mineV=named(d);
    for(const c of cv){ const m=mineV.find(v=>v.id===c.id); if(!m) fail('a live cloud version is missing on a device', {dev:d.name, id:c.id, note:c.note}); else if(m.name!==c.name || m.note!==c.note) fail('a version differs from the cloud', {dev:d.name, id:c.id, local:[m.note,m.name], cloud:[c.note,c.name]}); }
    for(const m of mineV) if(!cv.some(c=>c.id===m.id)) fail('a device holds a named version the cloud does not have alive', {dev:d.name, id:m.id});
    for(const id of vdeleted) if(mineV.some(v=>v.id===id) || cv.some(c=>c.id===id)) fail('a deleted version came back', {dev:d.name, id});
    if(d.sync.vjobs().length || d.sync.vtries().length) fail('version work left after settling', {dev:d.name, jobs:d.sync.vjobs(), tries:d.sync.vtries()});
    const tv=await cloud.totals('versions'), mv={count:seen.versions.length, sum:seen.versions.reduce((a,x)=>a+x.rev,0)};
    if(mv.count!==tv.count || mv.sum!==tv.sum) fail('version totals differ from seen', {dev:d.name, mine:mv, cloud:tv}); }
  for(const c of cloud.dump('versions').filter(v=>!v.deleted)){ const n=cloud.doc('notes',c.note); if(!n || n.purged) fail('a live version of a purged note is left in the cloud', {id:c.id, note:c.note}); }
  if(process.env.TRACE){ const id=process.env.TRACE; console.log('--- ops touching '+id); ops.forEach((o,i)=>{ if(o.id===id || ('n'+o.n)===id || o.k==='toggle' || o.k==='fault' || o.k==='leader') console.log(i, JSON.stringify(o)); });
    console.log('--- engine log for '+id); logs.filter(e=>e.id===id || e.from===id || e.to===id).forEach(e=>console.log(JSON.stringify(e).slice(0,300)));
    console.log('--- cloud doc', JSON.stringify(cloud.doc('notes',id)||null).slice(0,400)); for(const d of devs) console.log(d.name, JSON.stringify(d.db.get('notes',id)||null).slice(0,300), JSON.stringify(d.db.get('sync','meta:n:'+id)||null).slice(0,200), JSON.stringify(d.db.get('sync','purged:n:'+id)||null)); }
  if(process.env.STATE) for(const d of devs){ const X=d.sync._S; console.log(d.name, 'state', JSON.stringify({online:X.online, netBusy:X.netBusy, paused:X.paused, denied:X.denied, nospace:X.nospace, snapshot:X.snapshot, catchupDone:X.catchupDone, catchup:{n:X.catchup.notes&&X.catchup.notes.active, v:X.catchup.versions&&X.catchup.versions.active}, totals:X.totals, tries:[...X.tries.keys()], jobs:[...X.jobs.keys()], refetch:[...X.refetch], scan:{n:!!(X.scan.notes&&X.scan.notes.active)}})); console.log(d.name, 'totals events', logs.filter(e=>e.dev===d.name && /totals|scan/.test(e.t)).length, logs.filter(e=>e.dev===d.name && /totals|scan/.test(e.t)).slice(-3).map(e=>JSON.stringify(e)).join(' ')); }
  // redelivering every document twice writes nothing and makes no job
  // a first delivery may still fill in an srv the device never saw (an own commit held back past the window by `late`); the two after it write nothing
  for(const d of devs){ for(const doc of cloud.dump('notes')) d.sync._S.inbox.push({col:'notes', doc, source:'delivery'}); await d.sync.idle(2000); const w0=d.db.writes; d.putKeys=[]; for(let k=0;k<2;k++) for(const doc of cloud.dump('notes')) d.sync._S.inbox.push({col:'notes', doc, source:'delivery'}); await d.sync.idle(2000);
    if(d.db.writes!==w0) fail('a repeated delivery wrote something', {dev:d.name, writes:d.db.writes-w0, keys:d.putKeys.slice(0,6)}); if(d.sync.jobs().length) fail('a repeated delivery made a job', {dev:d.name}); d.putKeys=null; }
  // no edit vanished without a copy: a hash written under note X counts when it is found under X or under any note X's text moved into
  const moved=new Map(); for(const e of logs) if(e.t==='moved'){ if(!moved.has(e.from)) moved.set(e.from,new Set()); moved.get(e.from).add(e.to); }
  const family=id=>{ const out=new Set([id]), stack=[id]; while(stack.length){ const x=stack.pop(); for(const y of moved.get(x)||[]) if(!out.has(y)){ out.add(y); stack.push(y); } } return out; };
  const present=new Set(); for(const c of cloudLive) for(const b of c.blocks||[]) present.add(key(c.id,S.contentHash(b)));
  const copied=new Set(); for(const d of devs) for(const v of d.db.all('versions')) if(v.reason==='copy') for(const e of v.blocks){ const b={...e}; delete b.h; delete b.s; delete b.r; b.text=e.s||''; copied.add(key(v.note,S.contentHash(b))); }
  for(const [id,m] of written) for(const [h,info] of m){ const fam=[...family(id)]; if(fam.some(x=>present.has(key(x,h)) || copied.has(key(x,h)) || own.has(key(x,h)) || inCloud.has(key(x,h)))) continue; fail('an edit vanished without a copy', {id, text:info.text, by:info.dev, op:info.op, family:fam}); }
  const file=path.join(OUT,'syncsim-'+seed+'.json'); fs.writeFileSync(file, JSON.stringify({seed, ops:OPS, log:ops, problems, engineLog:logs.slice(-400)}, null, 0));
  return {problems, file, notes:cloudLive.length, tombs:tombs.length, ops:ops.length, writes:cloud.events.length, versions:cloud.dump('versions').length, vdel:cloud.dump('versions').filter(v=>v.deleted).length};
}
let fails=0;
for(const seed of SEEDS){ const r=await run(seed); const okk=!r.problems.length; if(!okk) fails++;
  console.log((okk? '✓ ' : '✗ ')+'seed '+seed+': '+r.ops+' ops, '+r.writes+' cloud commits, '+r.notes+' live notes, '+r.tombs+' tombstones, '+r.versions+' versions ('+r.vdel+' deleted)'+(okk? '' : ' — '+r.problems.length+' problems, first: '+JSON.stringify(r.problems[0]).slice(0,400)+' (log: '+r.file+')')); }
console.log(fails? fails+' seed(s) failed' : 'all seeds passed'); process.exit(fails? 1 : 0);
