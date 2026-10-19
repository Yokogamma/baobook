// An in-memory stand-in for the IndexedDB wrapper the sync engine runs on (SDB in index.html): the same transactional interface, so the
// engine runs under Node for the unit tests and the randomized simulation. Transactions run one at a time in creation order (IndexedDB
// orders overlapping readwrite scopes the same way); a transaction works on a copy and replaces the store only when its function
// returns, so a throw inside leaves nothing behind. `writes` counts committed puts and deletes; `onPut` sees every committed put.
const KEY={notes:r=>r.id, versions:r=>r.id, blobs:r=>r.note+'\u0000'+r.h, sync:r=>r.k};
const keyOf=(store,k)=>Array.isArray(k)? k.join('\u0000') : String(k);
const clone=v=>v===undefined? undefined : structuredClone(v);
export class MemStore{
  constructor(){ this.data={notes:new Map(), versions:new Map(), blobs:new Map(), sync:new Map()}; this.q=Promise.resolve(); this.writes=0; this.onPut=null; this.onDel=null; this.txCount=0; }
  tx(stores, mode, fn){ const run=async()=>{ this.txCount++; const work={}; for(const s of stores) work[s]=new Map(this.data[s]);   // a shallow copy of the map; values are replaced, never mutated
      const puts=[], dels=[]; const self=this;
      const W=s=>{ if(!work[s]) throw Object.assign(new Error('store outside the transaction: '+s),{name:'NotFoundError'}); return work[s]; };   // as IndexedDB: a store the transaction was not opened over cannot be touched
      const T={ get:async(s,k)=>clone(W(s).get(keyOf(s,k))), put:(s,v)=>{ if(mode!=='readwrite') throw new Error('readonly'); const c=clone(v); W(s).set(KEY[s](c),c); puts.push([s,c]); }, del:(s,k)=>{ if(mode!=='readwrite') throw new Error('readonly'); W(s).delete(keyOf(s,k)); dels.push([s,k]); },
        range:async(s,lo,hi)=>{ const a=keyOf(s,lo), b=keyOf(s,hi); return [...W(s).entries()].filter(([k])=>k>=a && k<=b).sort((x,y)=>x[0]<y[0]? -1 : x[0]>y[0]? 1 : 0).map(([,v])=>clone(v)); },
        byNote:async(s,note)=>[...W(s).values()].filter(v=>v.note===note).sort((a,b)=>(a.t-b.t)||(a.w-b.w)).map(clone),
        blobs:async note=>[...W('blobs').values()].filter(b=>b.note===note).map(clone),
        abort:()=>{ throw new Error('abort'); } };
      const r=await fn(T); for(const s of stores) self.data[s]=work[s]; self.writes+=puts.length+dels.length; if(self.onDel) for(const [s,k] of dels) self.onDel(s,k); if(self.onPut) for(const [s,v] of puts) self.onPut(s,v); return r; };
    const p=this.q.then(run, run); this.q=p.catch(()=>{}); return p; }
  all(s){ return [...this.data[s].values()].map(clone); }
  get(s,k){ return clone(this.data[s].get(keyOf(s,k))); }
}
