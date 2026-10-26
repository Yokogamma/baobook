/* Baobook cloud adapter for Firestore (docs/SYNC-PLAN.md §4.6 contract, §4.8, §4.16; PR 3). Glue between the sync core (sync.js) and the
   Firestore SDK, with no state of its own. The SDK's firestore module comes in as `fs` (the browser imports it from gstatic, the tests from
   the npm package), so the same file runs in both, like sync.js (UMD, no build step).
   - Reads come from the server, never from the SDK's cache: getDocFromServer, getDocsFromServer, getAggregateFromServer.
   - A write is the whole document with set() inside a transaction, never update() or merge; the server's time is stamped here (`srv`, and
     `tsrv` by §4.8: a new server date when a note enters the trash or its term is extended, the stored one kept by an edit in the trash,
     none outside the trash or on a tombstone), so the core never sees a sentinel.
   - Times cross the boundary in one place: a Firestore Timestamp becomes {s, ns} for the core (srv, tsrv) and goes back as a Timestamp
     (cursors, a copied tsrv), nanoseconds kept, so a cursor never loses or repeats documents written within one millisecond.
   - The listener delivers the latest state of each changed document and says whether the snapshot came from the server; changes that are
     only metadata are asked for, so a re-subscription whose documents equal the cache still reports its server snapshot.
   - Errors reach the core with the codes it knows (sync.js errOf): permission-denied, resource-exhausted, unauthenticated, invalid
     (invalid-argument: a document over 1 MiB, a bad value), failed-precondition, and unavailable for everything transient, the terminated
     client included. */
(function(root, factory){ if(typeof module==='object' && module.exports) module.exports=factory(); else root.BaobookCloud=factory(); })(typeof self!=='undefined'? self : this, function(){
'use strict';
const TRANSIENT=['unavailable','deadline-exceeded','aborted','cancelled','unknown','internal'];
const toSrv=t=>t && typeof t.seconds==='number' && typeof t.nanoseconds==='number'? {s:t.seconds, ns:t.nanoseconds} : null;
function mapErr(e){ const raw=e && typeof e.code==='string'? e.code.replace(/^firestore\//,'') : ''; const msg=(e && e.message) || String(e);
  let code='unavailable';
  if(raw==='permission-denied' || raw==='resource-exhausted' || raw==='unauthenticated') code=raw;
  else if(raw==='invalid-argument') code='invalid';
  else if(raw==='failed-precondition') code=/terminated/i.test(msg)? 'unavailable' : 'failed-precondition';   // a terminated client (sign-out while a call was in flight) is a retry, not a verdict
  else if(TRANSIENT.includes(raw) || !raw) code='unavailable';
  const err=new Error(msg); err.code=code; err.raw=raw||null; err.cause=e; return err; }

// make({fs, db, root, uid}): fs the firestore module, db the Firestore instance, root the collection path prefix env/{env}/users/{uid}
function make(o){ const {fs, db, root}=o; const faults={};
  const col=c=>fs.collection(db, root+'/'+c), ref=(c,id)=>fs.doc(db, root+'/'+c+'/'+id), ts=srv=>new fs.Timestamp(srv.s, srv.ns);
  // a document as the core sees it: the record key `id`, srv and tsrv as {s, ns} (a tsrv that is not a server time is dropped, a missing srv is null: the core skips it)
  function read(snap){ if(!snap || !snap.exists()) return null; const d=snap.data(); const out={...d, id:snap.id}; out.srv=toSrv(d.srv);
    if('tsrv' in d){ const t=toSrv(d.tsrv); if(t) out.tsrv=t; else delete out.tsrv; } return out; }
  // what goes to Firestore: no id, srv = the server time, tsrv as §4.8 says, over the stored document D (the core's view of it)
  // the trash date is a note's: a version tombstone's `deleted: true` takes none (the rules refuse any other key there)
  function wire(c, w, D){ const out={...w}; delete out.id; delete out.tsrv; out.srv=fs.serverTimestamp();
    if(c==='notes' && !('purged' in out) && 'deleted' in out){ out.tsrv=(D && D.deleted===out.deleted && D.tsrv)? ts(D.tsrv) : fs.serverTimestamp(); } return out; }
  async function guard(fn){ try{ return await fn(); }catch(e){ throw mapErr(e); } }
  function pageQuery(c, q, n){ const parts=[col(c)]; if(q && q.after){ parts.push(fs.orderBy('srv'), fs.orderBy(fs.documentId()), fs.startAfter(ts(q.after.srv), String(q.after.id))); }
    else { if(q && q.from) parts.push(fs.where('srv','>=',ts(q.from))); parts.push(fs.orderBy('srv'), fs.orderBy(fs.documentId())); }
    parts.push(fs.limit(n)); return fs.query(...parts); }
  return {
    uid:o.uid||null, root,
    get:(c,id)=>guard(async()=>read(await fs.getDocFromServer(ref(c,id)))),
    // the cloud transaction (§4.5 step 4): fn(D) → the document to write or null; the SDK runs fn again on contention, so fn has no side effects
    txn:(c,id,fn)=>guard(async()=>{ const r=ref(c,id); let out;
      await fs.runTransaction(db, async tx=>{ const D=read(await tx.get(r)); const w=fn(D); if(faults.hold){ await faults.hold; faults.hold=null; } if(!w){ out={read:D, wrote:false}; return; } tx.set(r, wire(c, w, D)); out={read:D, wrote:true}; });
      if(faults.lost){ faults.lost=false; const e=new Error('the response was lost (test fault)'); e.code='unavailable'; throw e; } return out; }),
    page:(c,q,n)=>guard(async()=>(await fs.getDocsFromServer(pageQuery(c,q,n))).docs.map(read)),
    listen(c, from, onDocs, onErr){ const parts=[col(c)]; if(from) parts.push(fs.where('srv','>=',ts(from))); parts.push(fs.orderBy('srv'));
      try{ return fs.onSnapshot(fs.query(...parts), {includeMetadataChanges:true}, snap=>{ const docs=[];
          for(const ch of snap.docChanges()){ if(ch.type==='removed' || ch.doc.metadata.hasPendingWrites) continue; const d=read(ch.doc); if(d && d.srv) docs.push(d); }   // a document with its write still pending has no server time yet: it comes again with the server's snapshot
          onDocs(docs, {snapshot: !snap.metadata.fromCache}); }, e=>onErr(mapErr(e))); }
      catch(e){ queueMicrotask(()=>onErr(mapErr(e))); return ()=>{}; } },
    totals:c=>guard(async()=>{ const d=(await fs.getAggregateFromServer(col(c), {count:fs.count(), sum:fs.sum('rev')})).data(); return {count:+d.count||0, sum:+d.sum||0}; }),
    scan:(c,q,n)=>guard(async()=>{ const parts=[col(c), fs.orderBy(fs.documentId())]; if(q && q.afterId) parts.push(fs.startAfter(String(q.afterId))); parts.push(fs.limit(n)); return (await fs.getDocsFromServer(fs.query(...parts))).docs.map(read); }),
    // the tests' hand: `lost` makes the next transaction report a lost response after it committed; `hold` keeps the next transaction in flight until the promise resolves
    fault(kind, v){ faults[kind]=kind==='hold'? v : true; } };
}
return {make, mapErr, toSrv};
});
