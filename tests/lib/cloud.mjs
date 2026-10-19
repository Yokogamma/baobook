// The test cloud: the adapter contract of docs/SYNC-PLAN.md §4.6 (get, txn, page, listen, totals, scan) with a virtual clock and
// failures by name. A document's `srv` is the time its transaction's request arrived, so within one document it grows with every
// revision (§4.6 rule 1 relies on that). A committed document is seen at once by get, txn, totals and scan; the `late` and `delay`
// faults hold it back from the queries by an `srv` range (page, listen) for a while, as an index that lags would, so when it does
// appear there its `srv` already lies below their window and only the totals check finds it. Writes are checked the way the security
// rules of §4.16 will check them: key sets, rev = previous + 1, the device's own receipt, other devices' receipts untouched, a
// tombstone final, a write equal to the previous document refused. The `hold` fault (with `op`: get or txn, and a `promise` the test resolves)
// keeps one call in flight: a get returns what it read before the wait, a transaction waits after its callback and reads the document again
// before committing, as the SDK would on contention, so two runners of one attempt (§4.10) can be interleaved deterministically.
const LIVE_ALL=['v','rev','op','dev','rcpt','title','blocks','created','updated'], LIVE_ONLY=[...LIVE_ALL,'dn','deleted','archived','revived','tsrv'];
const TOMB_ALL=['v','rev','op','dev','rcpt','purged'], TOMB_ONLY=[...TOMB_ALL,'dn','auto'];
const VLIVE_ALL=['v','rev','op','dev','rcpt','note','t','name','title','blocks'], VLIVE_ONLY=[...VLIVE_ALL,'dn'];
const VTOMB_ALL=['v','rev','op','dev','rcpt','note','deleted'], VTOMB_ONLY=[...VTOMB_ALL,'dn'];
const err=(code,msg)=>Object.assign(new Error(msg||code),{code});
const TRASH_MS=30*864e5;   // the trash term the rules enforce on an automatic tombstone (§4.8)
const clone=v=>v===undefined? undefined : structuredClone(v);
const SERVICE=new Set(['id','v','rev','op','srv','dev','dn','rcpt','tsrv','purged','auto','commitAt','seq']);
const bodyJson=d=>{ const o={}; for(const k of Object.keys(d).sort()){ if(!SERVICE.has(k) && k!=='updated') o[k]=d[k]; } return JSON.stringify(o); };
const cmpSrv=(a,b)=>(a.s-b.s)||(a.ns-b.ns);
export class TestCloud{
  constructor(o={}){ this.t=o.start||1_700_000_000_000; this.seq=0; this.docs={notes:new Map(), versions:new Map()}; this.subs=[]; this.faults=[]; this.events=[]; this.strict=o.strict!==false; this.auto=o.auto!==false; this.writesByDev=new Map(); }
  now(){ return this.t; } advance(ms){ this.t+=ms; }
  srvAt(ms){ const seq=++this.seq; return {s:Math.floor(ms/1000), ns:(ms%1000)*1e6+seq%1000}; }
  // failures by name, consumed by the next operation they apply to; with `dev` only that device's operations take them (the browser bridge names the device)
  fault(kind, o={}){ this.faults.push({kind, ...o}); }
  // a fault names its kind, optionally the device (`dev`), the call (`op`: get, txn, page, totals, scan), how many times it strikes (`n`) and how many matching calls pass first (`skip`)
  take(kind, dev, op){ const i=this.faults.findIndex(f=>f.kind===kind && (f.dev===undefined || f.dev===dev) && (f.op===undefined || f.op===op)); if(i<0) return null; const f=this.faults[i]; if(f.skip){ f.skip--; return null; } if(f.n && --f.n>0) return f; this.faults.splice(i,1); return f; }
  visible(col){ const now=this.t; return [...this.docs[col].values()].filter(d=>d.commitAt<=now); }   // for the srv-range queries only
  all(col){ return [...this.docs[col].values()]; }
  out(d){ if(!d) return null; const o=clone(d); delete o.commitAt; delete o.seq; return o; }
  fails(dev, op){ const f=this.take('fail',dev,op); if(f){ if(typeof f.then==='function') f.then(this); throw err(f.code||'unavailable','injected'); } }   // `then`: the test's hand at the moment of the failure (another device writes right then)
  async get(col,id,o={}){ this.fails(o.dev,'get'); const r=this.out(this.docs[col].get(id)); const h=this.take('hold',o.dev,'get'); if(h) await h.promise; return r; }   // held after the read: the caller goes on with a stale answer
  // the rules of §4.16 as the test cloud applies them
  check(col, w, D){ const keys=Object.keys(w), has=k=>keys.includes(k);
    if(D && D.purged) throw err('permission-denied','a tombstone is final'); if(D && col==='versions' && D.deleted) throw err('permission-denied','a deleted version stays deleted');
    if(w.v!==1 || !Number.isInteger(w.rev) || w.rev!==(D? D.rev : 0)+1) throw err('permission-denied','stamp: rev');
    if(typeof w.op!=='string' || !w.op || w.op.length>40 || typeof w.dev!=='string' || !w.dev || w.dev.length>40 || (has('dn') && (typeof w.dn!=='string' || !w.dn || w.dn.length>80))) throw err('permission-denied','stamp: op/dev/dn');
    if(!w.rcpt || typeof w.rcpt!=='object' || w.rcpt[w.dev]!==w.op || Object.keys(w.rcpt).length>200) throw err('permission-denied','receipts: own');
    if(D){ for(const k of Object.keys(D.rcpt||{})) if(k!==w.dev && w.rcpt[k]!==D.rcpt[k]) throw err('permission-denied','receipts: others'); for(const k of Object.keys(w.rcpt)) if(k!==w.dev && !(k in (D.rcpt||{}))) throw err('permission-denied','receipts: others'); }
    else if(Object.keys(w.rcpt).some(k=>k!==w.dev)) throw err('permission-denied','receipts: create');
    const tomb=col==='notes'? has('purged') : has('deleted') && w.deleted===true;
    const ALL=col==='notes'? (tomb? TOMB_ALL : LIVE_ALL) : (tomb? VTOMB_ALL : VLIVE_ALL), ONLY=col==='notes'? (tomb? TOMB_ONLY : LIVE_ONLY) : (tomb? VTOMB_ONLY : VLIVE_ONLY);
    for(const k of ALL) if(!has(k)) throw err('permission-denied','hasAll: '+k); for(const k of keys) if(!ONLY.includes(k)) throw err('permission-denied','hasOnly: '+k);
    if(col==='notes' && !tomb){ if(typeof w.title!=='string' || w.title.length>2000 || !Array.isArray(w.blocks) || w.blocks.length>5000 || typeof w.created!=='number' || typeof w.updated!=='number') throw err('permission-denied','live shape');
      if(has('deleted') && typeof w.deleted!=='number' || has('archived') && typeof w.archived!=='number' || has('revived') && (typeof w.revived!=='object' || !w.revived)) throw err('permission-denied','live shape'); }
    if(col==='notes' && tomb){ if(typeof w.purged!=='number') throw err('permission-denied','tomb shape'); if(has('auto') && (w.auto!==true || !D || !('deleted' in D))) throw err('permission-denied','auto');
      if(has('auto') && (!D.tsrv || this.t<=D.tsrv.s*1000+Math.floor(D.tsrv.ns/1e6)+TRASH_MS)) throw err('permission-denied','auto: the server clock says the 30 days are not over'); }   // the rules check the age by request.time (§4.8); here by the virtual clock
    if(col==='versions' && !tomb && w.note!==undefined){ const note=this.docs.notes.get(w.note); if(!note || note.purged) throw err('permission-denied','noteAlive'); }
    if(D && w.rev===D.rev+1 && bodyJson(w)===bodyJson(D) && !(tomb) && !(D.purged)) throw err('invalid','an empty write'); }
  // the server transaction: fn(D) → the document to write or null; it may run again on contention and with the `tworunners` fault
  async txn(col,id,fn,o={}){ this.fails(o.dev,'txn'); const two=this.take('tworunners',o.dev), other=this.take('other',o.dev), lost=this.take('lost',o.dev), delay=this.take('delay',o.dev), late=this.take('late',o.dev), hold=this.take('hold',o.dev,'txn');
    const reqAt=this.t; let attempts=0, D, w, held=false;
    for(;;){ if(++attempts>5) throw err('aborted','contention'); D=this.out(this.docs[col].get(id));
      w=fn(D? clone(D) : null); if(other && attempts===1){ this.write(other.col||col, other.doc, {dev:other.dev||'other', dn:other.dn}); continue; }   // another device wrote between the read and the commit
      if(hold && !held){ held=true; await hold.promise; const D2=this.docs[col].get(id); if((D2? D2.rev : 0)!==(D? D.rev : 0)) continue; }   // held after the callback: a document that moved meanwhile sends the callback round again
      break; }
    let wrote=false;
    if(w){ this.check(col, w, D); const commitAt=this.t+(delay? delay.ms : 0)+(late? late.ms : 0); const d={...clone(w), id, srv:this.srvAt(reqAt), commitAt, seq:++this.seq}; /* late: hidden from page and listen until commitAt */
      // tsrv as the adapter writes it (§4.8): a new server date when the note enters the trash or its term is extended, the stored one kept by an edit in the trash, none outside it or on a tombstone
      if(w.tsrv===undefined && col==='notes' && !w.purged && 'deleted' in w){ if(D && D.deleted===w.deleted && D.tsrv) d.tsrv=D.tsrv; else d.tsrv=this.srvAt(reqAt); }
      this.docs[col].set(id,d); wrote=true; this.events.push({t:'commit', col, id, rev:d.rev, dev:d.dev, at:this.t}); if(this.auto) this.pump(); }
    if(two && w){ const D2=this.out(this.docs[col].get(id)); const w2=fn(D2); if(w2) throw new Error('the callback wrote again over its own result: '+JSON.stringify(w2)); }
    if(lost) throw err('unavailable','the response was lost');
    return {read:D, wrote}; }
  // a write by another device, straight into the cloud (a test's hand): the same checks
  write(col, doc, o={}){ const D=this.out(this.docs[col].get(doc.id||o.id)); const id=doc.id||o.id; const w={...doc}; delete w.id; delete w.srv; delete w.commitAt;
    w.v=1; w.rev=(D? D.rev : 0)+1; w.op=o.op||'w'+(++this.seq); w.dev=o.dev||'other'; if(o.dn) w.dn=o.dn; w.rcpt={...(D? D.rcpt : {}), [w.dev]:w.op}; if(this.strict) this.check(col, w, D);
    const d={...w, id, srv:this.srvAt(o.at!==undefined? o.at : this.t), commitAt:o.commitAt!==undefined? o.commitAt : this.t, seq:++this.seq}; if(col==='notes' && !w.purged && 'deleted' in w && !(D && D.deleted===w.deleted && D.tsrv)) d.tsrv=d.srv; else if(D && D.tsrv && 'deleted' in w) d.tsrv=D.tsrv; this.docs[col].set(id,d); this.events.push({t:'commit', col, id, rev:d.rev, dev:d.dev, at:this.t}); if(this.auto) this.pump(); return this.out(d); }
  async page(col, q, n, o={}){ this.fails(o.dev,'page'); let list=this.visible(col).sort((a,b)=>cmpSrv(a.srv,b.srv)||(a.id<b.id? -1 : a.id>b.id? 1 : 0));
    if(q.after) list=list.filter(d=>{ const c=cmpSrv(d.srv,q.after.srv); return c>0 || (c===0 && d.id>q.after.id); }); else if(q.from) list=list.filter(d=>cmpSrv(d.srv,q.from)>=0);
    const out=list.slice(0,n).map(d=>this.out(d)); const h=this.take('hold',o.dev,'page'); if(h) await h.promise; return out; }   // held after the read, like get
  listen(col, from, onDocs, onErr, o={}){ const f=this.take('fail',o.dev,'listen'); if(f){ queueMicrotask(()=>onErr(err(f.code||'unavailable','injected'))); return ()=>{}; }   // a listener refused or lost: the error comes by the callback, as the SDK's does
    const sub={col, from, onDocs, onErr, dev:o.dev, seen:new Map(), first:true, live:true}; this.subs.push(sub); if(this.auto) queueMicrotask(()=>this.pump()); return ()=>{ sub.live=false; this.subs=this.subs.filter(s=>s!==sub); }; }
  // deliver what changed to every listener: the first call is the server snapshot; `dup` repeats the batch, `reorder` shuffles it
  pump(){ for(const sub of this.subs){ if(!sub.live) continue; const docs=this.visible(sub.col).filter(d=>!sub.from || cmpSrv(d.srv,sub.from)>=0).filter(d=>sub.seen.get(d.id)!==d.seq);
      if(!docs.length && !sub.first) continue; for(const d of docs) sub.seen.set(d.id,d.seq); let batch=docs.map(d=>this.out(d)); const dup=this.take('dup',sub.dev), re=this.take('reorder',sub.dev);
      if(re) batch=batch.slice().reverse(); if(dup) batch=batch.concat(batch.slice().reverse()); const first=sub.first; sub.first=false; sub.onDocs(batch, {snapshot:first}); } }
  async totals(col, o={}){ this.fails(o.dev,'totals'); const list=this.all(col).filter(d=>Number.isInteger(d.rev)); return {count:list.length, sum:list.reduce((a,d)=>a+d.rev,0)}; }
  async scan(col, q, n, o={}){ this.fails(o.dev,'scan'); return this.all(col).filter(d=>!q.afterId || d.id>q.afterId).sort((a,b)=>a.id<b.id? -1 : a.id>b.id? 1 : 0).slice(0,n).map(d=>this.out(d)); }
  // the console: changes past the rules
  vanish(col,id){ this.docs[col].delete(id); this.events.push({t:'vanish', col, id}); }
  rewrite(col,id,doc){ const cur=this.docs[col].get(id); const d={...clone(doc), id, srv:this.srvAt(this.t), commitAt:this.t, seq:++this.seq}; this.docs[col].set(id,d); this.events.push({t:'rewrite', col, id, rev:d.rev, was:cur? cur.rev : null}); if(this.auto) this.pump(); return this.out(d); }
  setTsrv(id, ms){ const d=this.docs.notes.get(id); if(d) d.tsrv=this.srvAt(ms); }
  dump(col){ return this.all(col||'notes').map(d=>this.out(d)); }
  doc(col,id){ return this.out(this.docs[col].get(id)); }
}
