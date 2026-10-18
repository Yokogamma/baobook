/* Baobook sync core (docs/SYNC-PLAN.md, PR 1). Pure: no DOM, no UI strings, no IndexedDB, no clock of its own. Everything the engine
   needs (the transactional store, the cloud adapter, the time, randomness, the rich-text cleaner) comes in through `deps`, so the same
   file runs in the browser (window.BaobookSync) and under Node (require) for the unit tests and the randomized simulation. */
(function(root, factory){ if(typeof module==='object' && module.exports) module.exports=factory(); else root.BaobookSync=factory(); })(typeof self!=='undefined'? self : this, function(){
'use strict';
const DOC_MAX=960*1024;   // bytes a cloud document may take: 1 MiB minus 64 KiB of headroom for the service fields (§4.17)
const V_BODY_MAX=256*1024;   // a block body over this is not stored in the history (VERSIONS-PLAN)
const LIM={title:2000, blocks:5000, id:64, name:80, lang:40, color:24, dev:40, dn:80};

/* ── hashing and the canonical form (§4.15) ──────────────────────────────────────────────────────────────────────────────────
   hashOf: FNV-1a + djb2 + length over a string, the hash used for history bodies since VERSIONS-PLAN. canon(): object keys sorted,
   undefined dropped, optional fields at their default dropped, a note's blocks in canonical order, so a block built by serBlock and
   the same block back from the cloud (whose map key order is the SDK's) give one JSON and one hash. */
const hashOf=s=>{ let a=2166136261, b=5381; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); a=Math.imul(a^c,16777619); b=(Math.imul(b,33)^c)|0; } return (a>>>0).toString(36)+(b>>>0).toString(36)+s.length.toString(36); };
const BLOCK_DEFAULTS={wrap:false, num:false, open:false, collapsed:false, color:'neutral', html:'', title:'', lang:'', text:'', fx:0, col:0};   // a sheet block without fx (serBlock may leave it undefined) equals one with fx:0 after the normalizer
const isObj=x=>x!==null && typeof x==='object' && !Array.isArray(x);
function canonValue(v){ if(Array.isArray(v)) return v.map(canonValue); if(!isObj(v)) return v===-0? 0 : v;
  const o={}; for(const k of Object.keys(v).sort()){ if(v[k]!==undefined) o[k]=canonValue(v[k]); } return o; }
function canonBlock(b){ const o={}; for(const k of Object.keys(b).sort()){ const v=b[k]; if(v===undefined) continue; if(k in BLOCK_DEFAULTS && v===BLOCK_DEFAULTS[k]) continue; o[k]=canonValue(v); } return o; }
const blockJson=b=>JSON.stringify(canonBlock(b));
// (row, fx or col, id, JSON): the order does not depend on the order in the array
function blockCmp(a,b){ const ra=+a.row||0, rb=+b.row||0; if(ra!==rb) return ra-rb; const xa=a.parent? (+a.col||0) : (+a.fx||0), xb=b.parent? (+b.col||0) : (+b.fx||0); if(xa!==xb) return xa-xb;
  const ia=String(a.id), ib=String(b.id); if(ia!==ib) return ia<ib? -1 : 1; const ja=blockJson(a), jb=blockJson(b); return ja<jb? -1 : ja>jb? 1 : 0; }
function canon(doc){ if(!isObj(doc)) return canonValue(doc); const o={};
  for(const k of Object.keys(doc).sort()){ const v=doc[k]; if(v===undefined) continue;
    if(k==='blocks' && Array.isArray(v)){ o.blocks=v.filter(isObj).slice().sort(blockCmp).map(canonBlock); continue; }
    if((k==='deleted' || k==='archived') && !v) continue;   // absent, 0 or null all mean «not»
    if(k==='revived' && !v) continue;
    o[k]=canonValue(v); }
  return o; }
const cjson=doc=>JSON.stringify(canon(doc));
const hashDoc=doc=>hashOf(cjson(doc));
// the body of a document: what the device stores and compares; the service fields of §4.2 (and a tombstone's) are not part of it
const SERVICE=['id','v','rev','op','srv','dev','dn','rcpt','tsrv','purged','auto'];   // `id` is the record key and the document name, never a compared field
function noteBody(doc){ if(!isObj(doc)) return doc; const o={}; for(const k of Object.keys(doc)){ if(!SERVICE.includes(k) && doc[k]!==undefined) o[k]=doc[k]; } return o; }
function noUpdated(doc){ if(!isObj(doc)) return doc; const o=noteBody(doc); delete o.updated; return o; }
const sameDoc=(a,b)=>cjson(noUpdated(a))===cjson(noUpdated(b));   // equality «without updated» (§4.4 step 4), by the body only
const docBytes=doc=>new TextEncoder().encode(cjson(doc)).length;   // bytes, not code units: Cyrillic is two bytes a letter

/* ── server times: {s, ns} like a Firestore Timestamp (§4.6 rule 1) ── */
const cmpSrv=(a,b)=>{ const as=a? +a.s||0 : 0, bs=b? +b.s||0 : 0; if(as!==bs) return as<bs? -1 : 1; const an=a? +a.ns||0 : 0, bn=b? +b.ns||0 : 0; return an<bn? -1 : an>bn? 1 : 0; };
const clearlyNewer=(a,b)=>!!a && !!b && ((+a.s||0)-(+b.s||0))+((+a.ns||0)-(+b.ns||0))/1e9>=1;   // by at least one real second, not «the seconds field is larger»
const validSrv=s=>isObj(s) && Number.isInteger(s.s) && Number.isInteger(s.ns) && s.ns>=0 && s.ns<1e9;

/* ── the normalizer (§4.15): pure and deterministic, for data from the cloud and from imports ──────────────────────────────── */
const isNum=v=>typeof v==='number' && Number.isFinite(v);
const isStr=(v,max)=>typeof v==='string' && v.length<=max;
const isBool=v=>typeof v==='boolean';
const KINDS=[undefined,'code','area'];
// one block: false when its shape is wrong; otherwise a cleaned copy (unknown fields pass through)
function normBlock(raw, deps){ if(!isObj(raw)) return false; const b={...raw};
  if(!(typeof b.id==='string') || !b.id.length || b.id.length>LIM.id) return false;
  if(!isNum(b.row)) return false;
  if(b.parent!==undefined){ if(!isStr(b.parent,LIM.id) || !b.parent.length || !isNum(b.col)) return false; delete b.fx; } else { if(b.fx===undefined || b.fx===null) b.fx=0; if(!isNum(b.fx)) return false; delete b.col; }
  if(!KINDS.includes(b.kind)) return false; if(b.kind===undefined) delete b.kind;
  if(b.text===undefined || b.text===null) b.text=''; if(typeof b.text!=='string') return false;
  // the fields are checked, not rewritten: a valid record is stored as given (an import keeps the file's shape); defaults are the canonical form's business
  if(b.html!==undefined){ if(typeof b.html!=='string') return false; if(b.kind || !b.html) delete b.html; else { const h=deps && deps.cleanRich? deps.cleanRich(b.html) : b.html; if(h) b.html=h; else delete b.html; } }
  for(const k of ['wrap','num','open','collapsed']){ if(b[k]===undefined) continue; if(!isBool(b[k])) return false; }
  if(b.lang!==undefined && !isStr(b.lang,LIM.lang)) return false;
  if(b.title!==undefined && !isStr(b.title,LIM.title)) return false;
  if(b.color!==undefined && !isStr(b.color,LIM.color)) return false;
  for(const k of ['cw','ch']){ if(b[k]===undefined || b[k]===null) { delete b[k]; continue; } if(!isNum(b[k]) || b[k]<=0) return false; }
  return b; }
// the blocks of a note or version: shape, duplicate ids, parents; the array order is kept (the canonical order is for hashing and comparing)
function normBlocks(list, deps, o={}){ if(!Array.isArray(list) || list.length>LIM.blocks) return false; const out=[];
  for(const raw of list){ const b=normBlock(raw, deps); if(b===false) return false; if(o.inline && raw && raw.s!==undefined){ if(typeof raw.s!=='string') return false; } out.push(b); }
  // a parent must be an existing area, otherwise the block goes to the sheet (first, so that two copies that differ only by a dead parent dedupe)
  const areas=new Set(out.filter(b=>b.kind==='area').map(b=>b.id));
  const fixed=out.map(b=>{ if(!b.parent || areas.has(b.parent)) return b; const c={...b}; delete c.parent; delete c.col; c.fx=0; return c; });
  // duplicate ids: the first in canonical order keeps the id, equal duplicates go, the others get id~hash (a parent pointing at a duplicated area points at the kept one)
  const order=fixed.slice().sort(blockCmp), groups=new Map(), drop=new Set(), rename=new Map();   // groups: id → the JSON of every copy accepted so far
  for(const b of order){ const j=blockJson(b), g=groups.get(b.id); if(!g){ groups.set(b.id,new Set([j])); continue; } if(g.has(j)){ drop.add(b); continue; } g.add(j); rename.set(b, b.id+'~'+hashOf(j)); }
  return fixed.filter(b=>!drop.has(b)).map(b=>rename.has(b)? {...b, id:rename.get(b)} : b); }
function normRevived(r){ if(r===undefined || r===null) return undefined; if(!isObj(r) || !isStr(r.from,LIM.id) || !r.from.length || !isStr(r.dev,LIM.dev) || !isNum(r.at)) return false;
  const o={from:r.from, dev:r.dev, at:r.at}; if(r.dn!==undefined){ if(!isStr(r.dn,LIM.dn)) return false; o.dn=r.dn; } if(r.title!==undefined){ if(!isStr(r.title,LIM.title)) return false; o.title=r.title; } return o; }
// a note body (the fields of §4.2 that the device stores); the service fields are checked by the engine before this
function normNote(raw, deps){ if(!isObj(raw)) return {bad:'shape'};
  if(!isStr(raw.title,LIM.title)) return {bad:'title'};
  const blocks=normBlocks(raw.blocks, deps); if(blocks===false) return {bad:'blocks'};
  if(!isNum(raw.created) || !isNum(raw.updated)) return {bad:'time'};
  const note={title:raw.title, blocks, created:raw.created, updated:raw.updated};
  for(const k of ['deleted','archived']){ const v=raw[k]; if(v===undefined || v===null || v===0 || v===false) continue; if(!isNum(v) || v<=0) return {bad:k}; note[k]=v; }
  const rv=normRevived(raw.revived); if(rv===false) return {bad:'revived'}; if(rv) note.revived=rv;
  return {note}; }
// a named version or conflict copy from the cloud: full bodies in `s`
function normVersion(raw, deps){ if(!isObj(raw)) return {bad:'shape'};
  if(!isStr(raw.note,LIM.id) || !raw.note.length) return {bad:'note'}; if(!isNum(raw.t)) return {bad:'t'}; if(!isStr(raw.name,LIM.name) || !raw.name.length) return {bad:'name'};
  if(!isStr(raw.title,LIM.title)) return {bad:'title'}; const blocks=normBlocks(raw.blocks, deps, {inline:true}); if(blocks===false) return {bad:'blocks'};
  return {version:{note:raw.note, t:raw.t, name:raw.name, title:raw.title, blocks}}; }

/* ── merging (§4.7) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Every merge is local. merge3(base, L, R) is the three-way merge against the confirmed cloud state; merge0(L, R) the first merge of
   two copies with the same id and no common base; moveInto(revived, moved) the move of a late copy into the revived note. All three
   return {note, copies, lost, trace}: `copies` are the sides that lost somewhere (kept in full as conflict copies), `trace` names, for
   every block whose content from L or R did not reach the result, why: own | causal | deleted | key (for the simulation's oracle). */
const PLACE=['row','fx','parent','col','cw','ch','collapsed'];   // the «place» group; everything else but id is «content»
const groupOf=(b,place)=>{ const o={}; for(const k of Object.keys(b)){ if(k==='id') continue; if(PLACE.includes(k)===place) o[k]=b[k]; } return o; };
const gjson=(b,place)=>JSON.stringify(canonBlock(groupOf(b,place)));
const vjson=v=>v===undefined? 'u' : JSON.stringify(canonValue(v));
const contentHash=b=>hashOf(gjson(b,false));   // the hash of a block's content group, named in the merge trace
// the key of a side in a conflict: (updated, dev, hash of the canonical form); a side without dev (a local record) is this device
const keyOf=(doc, dev)=>[+doc.updated||0, doc.dev||dev||'', hashDoc(noUpdated(doc))];
const cmpKey=(a,b)=>{ for(let i=0;i<3;i++){ if(a[i]<b[i]) return -1; if(a[i]>b[i]) return 1; } return 0; };
const NOTE_FIELDS=['title','deleted','archived','revived'];
function fixParents(blocks){ const areas=new Set(blocks.filter(b=>b.kind==='area').map(b=>b.id)); return blocks.map(b=>{ if(!b.parent || areas.has(b.parent)) return b; const c={...b}; delete c.parent; delete c.col; c.fx=0; return c; }); }
const byId=blocks=>new Map((blocks||[]).map(b=>[b.id,b]));
const contentChanged=(a,b)=>JSON.stringify(canon({title:a.title,blocks:a.blocks}))!==JSON.stringify(canon({title:b.title,blocks:b.blocks}));
function finishMerge(res, L, R, ctx, lost, trace){
  res.blocks=fixParents(res.blocks);
  // trash against an edit (§4.7): the note stays in the trash and its period starts again from this merge
  if(res.deleted && ctx && ctx.t && (ctx.base? (contentChanged(L,ctx.base) || contentChanged(R,ctx.base)) : contentChanged(L,R))) res.deleted=ctx.t;
  // a result equal to the remote by content takes it as it is, `updated` included, so a merge that only takes the other side sends nothing
  const same=sameDoc(res,R), note=same? noteBody(R) : {...res, updated: ctx && ctx.t? ctx.t : Math.max(+L.updated||0, +R.updated||0)};
  const copies=[]; if(lost.local) copies.push({side:'L', note:noteBody(L), dev:L.dev, dn:L.dn}); if(lost.remote) copies.push({side:'R', note:noteBody(R), dev:R.dev, dn:R.dn});
  return {note, copies, lost, trace, same}; }
// three-way: base is the confirmed cloud state, L the local record, R the cloud document that moved ahead
function merge3(base, L, R, ctx={}){ const lWins=cmpKey(keyOf(L,ctx.dev), keyOf(R,ctx.dev))>=0, lost={local:false, remote:false}, trace=[]; const res={};
  for(const f of NOTE_FIELDS){ const bv=vjson(base[f]), lv=vjson(L[f]), rv=vjson(R[f]);
    const v = (lv===bv && rv===bv)? L[f] : lv===bv? R[f] : rv===bv? L[f] : lv===rv? L[f] : (lost[lWins? 'remote' : 'local']=true, (lWins? L : R)[f]);
    if(v!==undefined) res[f]=v; }
  res.created=Math.min(+L.created||Infinity, +R.created||Infinity, +base.created||Infinity); if(!Number.isFinite(res.created)) res.created=+L.created||+R.created||0;
  const B=byId(base.blocks), Lm=byId(L.blocks), Rm=byId(R.blocks), ids=[...Lm.keys(), ...[...Rm.keys()].filter(id=>!Lm.has(id))], out=[];
  for(const id of ids){ const b=B.get(id), l=Lm.get(id), r=Rm.get(id);
    if(!b){ if(l && r){ if(blockJson(l)===blockJson(r)){ out.push(l); continue; } const m={id}; for(const place of [true,false]){ const gl=gjson(l,place), gr=gjson(r,place); const w=gl===gr? l : lWins? l : r; if(gl!==gr){ lost[lWins? 'remote' : 'local']=true; if(!place) trace.push({id, side:lWins? 'R' : 'L', cause:'key', h:contentHash(lWins? r : l)}); } Object.assign(m, groupOf(w,place)); } out.push(m); } else out.push(l||r); continue; }
    if(!l && !r) continue;
    if(!l){ if(blockJson(b)===blockJson(r)){ trace.push({id, side:'R', cause:'causal', h:contentHash(r)}); continue; } out.push(r); continue; }   // deleted here, untouched there → gone; changed there → stays
    if(!r){ if(blockJson(b)===blockJson(l)){ trace.push({id, side:'L', cause:'causal', h:contentHash(l)}); continue; } out.push(l); continue; }
    const m={id};
    for(const place of [true,false]){ const gb=gjson(b,place), gl=gjson(l,place), gr=gjson(r,place); let w;
      if(gl===gb && gr===gb) w=l; else if(gl===gb){ w=r; if(!place && gl!==gr) trace.push({id, side:'L', cause:'causal', h:contentHash(l)}); } else if(gr===gb){ w=l; if(!place && gl!==gr) trace.push({id, side:'R', cause:'causal', h:contentHash(r)}); } else if(gl===gr) w=l;
      else { w=lWins? l : r; lost[lWins? 'remote' : 'local']=true; if(!place) trace.push({id, side:lWins? 'R' : 'L', cause:'key', h:contentHash(lWins? r : l)}); }
      Object.assign(m, groupOf(w,place)); }
    out.push(m); }
  res.blocks=out; return finishMerge(res, L, R, {...ctx, base}, lost, trace); }
// first merge of two copies with the same id and no base: equal → the remote; otherwise a union by id, shared ids from the side with the larger key, deleted wins
function merge0(L, R, ctx={}){ if(sameDoc(L,R)) return {note:noteBody(R), copies:[], lost:{local:false,remote:false}, trace:[], same:true};
  const lWins=cmpKey(keyOf(L,ctx.dev), keyOf(R,ctx.dev))>=0, W=lWins? L : R, trace=[]; const res={};
  for(const f of ['title','archived','revived']) if(W[f]!==undefined) res[f]=W[f];
  const d=Math.max(+L.deleted||0, +R.deleted||0); if(d) res.deleted=d;
  res.created=Math.min(+L.created||Infinity, +R.created||Infinity); if(!Number.isFinite(res.created)) res.created=0;
  const Lm=byId(L.blocks), Rm=byId(R.blocks), ids=[...Lm.keys(), ...[...Rm.keys()].filter(id=>!Lm.has(id))];
  res.blocks=ids.map(id=>{ const l=Lm.get(id), r=Rm.get(id); if(!l || !r) return l||r; if(blockJson(l)===blockJson(r)) return l; if(gjson(l,false)!==gjson(r,false)) trace.push({id, side:lWins? 'R' : 'L', cause:'key', h:contentHash(lWins? r : l)}); return lWins? l : r; });
  return finishMerge(res, L, R, ctx, {local:true, remote:true}, trace); }   // both source copies are kept
// a late copy of a purged original goes into the revived note: a union without a common base; the revived note keeps its own fields
function moveInto(revived, moved, ctx={}){ const trace=[];
  if(!revived){ const note={title:moved.title, blocks:fixParents((moved.blocks||[]).map(b=>({...b}))), created:+moved.created||ctx.t||0, updated:ctx.t||+moved.updated||0}; if(moved.archived) note.archived=moved.archived; if(moved.deleted) note.deleted=moved.deleted; return {note, copies:[], trace, changed:true}; }
  const rWins=cmpKey(keyOf(revived,ctx.dev), keyOf(moved,ctx.dev))>=0, Vm=byId(revived.blocks), Mm=byId(moved.blocks), ids=[...Vm.keys(), ...[...Mm.keys()].filter(id=>!Vm.has(id))];
  const blocks=fixParents(ids.map(id=>{ const v=Vm.get(id), m=Mm.get(id); if(!v || !m) return v||m; if(blockJson(v)===blockJson(m)) return v; if(gjson(v,false)!==gjson(m,false)) trace.push({id, side:rWins? 'M' : 'V', cause:'key', h:contentHash(rWins? m : v)}); return rWins? v : m; }));
  const res={...revived, blocks}; const changed=!sameDoc(res, revived); if(changed) res.updated=ctx.t||res.updated;
  const copies=[{side:'V', note:noteBody(revived), dev:revived.dev, dn:revived.dn}]; if(hashDoc(noUpdated(moved))!==hashDoc(noUpdated(revived))) copies.push({side:'M', note:noteBody(moved), dev:moved.dev, dn:moved.dn});   // equal sources are not duplicated
  return {note:changed? res : revived, copies, trace, changed}; }

/* ── the monotonic device clock (§4.4) and rule 1 of §4.6 ── */
const nextUpdated=(now, last)=>Math.max(+now||0, (+last||0)+1);
// where a document stands against `seen`: 'fresh' | 'stale' | 'recreated' | 'rewritten' (a stale state read from the server itself)
function placeAgainstSeen(doc, seen, serverRead){ if(!seen) return 'fresh'; const known=!!seen.srv, ref=seen.srv||seen.after, rev=+doc.rev, sr=+seen.rev;
  if(rev<sr) return clearlyNewer(doc.srv, ref)? 'recreated' : serverRead? 'rewritten' : 'stale';
  if(rev>sr) return ref && clearlyNewer(ref, doc.srv)? (serverRead? 'rewritten' : 'stale') : 'fresh';
  if(!known) return 'fresh';   // the echo of an own write fills in srv
  return clearlyNewer(doc.srv, seen.srv)? 'recreated' : clearlyNewer(seen.srv, doc.srv)? (serverRead? 'rewritten' : 'stale') : 'fresh'; }

/* ── history manifests (VERSIONS-PLAN), shared with the versions code of index.html ── */
const bodyOf=d=>d.kind? (d.text||'') : (d.html||d.text||'');
const entryOf=d=>{ const e={...d}; delete e.text; delete e.html; delete e.s; delete e.r; const b=bodyOf(d); e.h=b.length>V_BODY_MAX? null : hashOf(b); return e; };   // a body too big for the history gets h:null
function manifestOf(title, blocks){ const m=(blocks||[]).filter(d=>d&&d.id).map(entryOf).sort((x,y)=>x.id<y.id?-1:1); return {title:title||'', blocks:m, sig:hashOf((title||'')+'\n'+JSON.stringify(m))}; }
function sumOf(m, prev){ const s={ch:0,add:0,del:0,mv:0,ttl:0}; if(!prev){ s.add=m.blocks.length; return s; } const P=new Map(prev.blocks.map(e=>[e.id,e])), seen=new Set();
  for(const e of m.blocks){ const p=P.get(e.id); seen.add(e.id); if(!p){ s.add++; continue; }
    if(p.h!==e.h || (p.title||'')!==(e.title||'') || (p.kind||'')!==(e.kind||'') || (p.lang||'')!==(e.lang||'')) s.ch++; else if(p.row!==e.row || p.fx!==e.fx || p.parent!==e.parent || p.col!==e.col) s.mv++; }
  for(const id of P.keys()) if(!seen.has(id)) s.del++; if((prev.title||'')!==(m.title||'')) s.ttl=1; return s; }


/* ── budgets, pace and the Pacific day (§4.17) ── */
const BUDGETS={app:{writes:4000, reads:9000}, dev:{writes:1500, reads:4000}};
const budgetOf=env=>BUDGETS[env]||{writes:1500, reads:4000};
const PACE={dev:3000, note:5000, big:30000, huge:120000, slow:30000, retryMin:2000, retryMax:300000, totalsEvery:3600000, totalsAfterMatch:900000, totalsRecheck:300000, waiting:30000, loopN:30, loopWindow:300000};
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit'});
const dayKey=t=>dayFmt.format(new Date(t));
const dayClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles', hourCycle:'h23', hour:'2-digit', minute:'2-digit', second:'2-digit'});
// the first moment of the next Pacific day (the budget counts anew then); a DST change is covered by the key check
const nextDay=t=>{ const f={}; for(const x of dayClock.formatToParts(new Date(t))) f[x.type]=+x.value; let n=t+((23-f.hour)*3600+(59-f.minute)*60+(60-f.second))*1000-(t%1000); for(let i=0;i<3 && dayKey(n)===dayKey(t);i++) n+=3600000; return n; };
const bytesOf=str=>new TextEncoder().encode(str).length;
const isNetErr=code=>code==='unavailable' || code==='deadline-exceeded' || code==='aborted' || code==='unknown';
const errOf=e=>{ const code=(e && e.code) || 'unavailable'; return {code: ['unavailable','deadline-exceeded','permission-denied','resource-exhausted','too-large','invalid','failed-precondition','aborted'].includes(code)? (code==='aborted'? 'unavailable' : code) : 'unavailable', message: e && e.message || String(e)}; };
const codeOf=e=>(e && typeof e.code==='string' && e.code) || (e && e.name) || 'error';   // a refusal carries a string code; a DOMException's numeric code is no name, its .name is
const fail=(code,msg)=>Object.assign(new Error(msg||code),{code});
const srvMinus=(srv, ms)=>{ if(!srv) return null; const s=(+srv.s||0)-Math.ceil(ms/1000); return {s: Math.max(0,s), ns:+srv.ns||0}; };
const cursorMax=(a,b)=>!a? b : !b? a : (cmpSrv(a.srv,b.srv)<0 || (cmpSrv(a.srv,b.srv)===0 && String(a.id)<String(b.id)))? b : a;

/* ── the engine (§4.4–4.8, §4.17, §4.10): driven by step() in the leader tab; the other tabs only write locally through it ───────────────────────────────────────────────────────────────── */
function makeSync(deps){
  const {db, now, random}=deps, vnow=deps.vnow||now; let devId=deps.devId||'dev', devName=deps.devName||'';   // the store's `device` record once loaded (§4.3): every tab of one device writes as one device, so a receipt proves any tab's attempt
  const emit=(fn,...a)=>{ try{ if(typeof fn==='function') fn(...a); }catch(_){} };
  const pace={...PACE, ...(deps.pace||{})};
  const S={loaded:false, started:false, owner:null, epoch:null, cloud:deps.cloud||null, online:true, denied:false, paused:false, nospace:false,
    cursor:{notes:null, versions:null}, quota:null, quotaDirty:false, jobs:new Map(), tries:new Map(), refetch:new Set(), err:new Map(), sends:new Map(), bytes:new Map(),
    inbox:[], listen:{notes:null, versions:null}, snapshot:{notes:false, versions:false}, lastDelivered:new Map(), catchup:{notes:null, versions:null}, catchupDone:{notes:false, versions:false}, everCaughtUp:false,
    totals:{notes:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}, versions:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}}, scan:{notes:null, versions:null}, scanFound:0,
    waiting:new Map(), netBusy:false, stepping:null, typed:new Map(), left:new Set(), lastStatus:null, retryAt:{notes:0, versions:0}, lastReconnect:0, rejected:new Set()};
  const LOG=[]; const log=ev=>{ ev.at=now(); LOG.push(ev); if(LOG.length>3000) LOG.shift(); emit(deps.log, ev); };
  const budgets=()=>deps.budgets||budgetOf(deps.env);
  const K={meta:(c,id)=>'meta:'+c+':'+id, out:(c,id)=>'out:'+c+':'+id, tr:(c,id)=>'try:'+c+':'+id, refetch:(c,id)=>'refetch:'+c+':'+id, seen:(c,id)=>'seen:'+c+':'+id, purged:id=>'purged:n:'+id, quarantine:(c,id)=>'quarantine:'+c+':'+id, cursor:col=>'cursor:'+col, scan:col=>'scan:'+col};
  const COL={notes:'n', versions:'v'}, colOf=c=>c==='n'? 'notes' : 'versions';
  const newId=()=>'n'+now().toString(36)+random().toString(36).slice(2,6);
  const vid=()=>'v'+now().toString(36)+random().toString(36).slice(2,6);
  const isEmpty=body=>!(body.title||'').trim() && !(body.blocks && body.blocks.length);
  const wireBody=rec=>canon(noteBody(rec));   // what goes to the cloud: the body in canonical form, no id, no service fields
  const storeBase=doc=>{ const b={...doc}; delete b.id; return b; };   // the base keeps every field of the cloud document (rev, srv, tsrv, rcpt, dev…)
  const defMeta=(c,id)=>({k:K.meta(c,id), lrev:0, baseLrev:0, base:null});
  async function getMeta(t,c,id){ const m=await t.get('sync',K.meta(c,id)); return m? {...defMeta(c,id), ...m} : defMeta(c,id); }
  async function check(t){ const ep=await t.get('sync','epoch'), ow=await t.get('sync','owner'); const eid=ep? ep.id : null, uid=ow? ow.uid : null, env=ow? ow.env : null;
    if(eid!==S.epoch || uid!==(S.owner? S.owner.uid : null) || env!==(S.owner? S.owner.env : null)){ setStatus('reload'); throw fail('epoch'); } }
  // one transaction with the epoch check; `after` queues work for after the commit (cache updates, UI events)
  async function tx(stores, fn){ const after=[]; const t0=await db.tx(stores,'readwrite', async t=>{ await check(t); return fn(t, f=>after.push(f)); }); for(const f of after) await f(); return t0; }
  // o.guard: the (epoch, env, uid) this engine had before; a store that moved to another owner meanwhile is not adopted (§4.4 step 1), the
  // status «reload» goes out and the load fails with code `epoch`, inside the same transaction that would have read the state
  async function load(o={}){ if(S.loaded) return; S.loaded=true; const guard=o.guard||null; try{
    await db.tx(['sync'],'readonly', async t=>{ const ep=await t.get('sync','epoch'), ow=await t.get('sync','owner'), eid=ep? ep.id : null;
      if(guard && (eid!==guard.epoch || (ow? ow.uid : null)!==guard.uid || (ow? ow.env : null)!==guard.env)){ setStatus('reload'); throw fail('epoch'); }
      S.epoch=eid; S.owner=ow||null; const dv=await t.get('sync','device'); if(dv && dv.id){ devId=String(dv.id); if(dv.name) devName=String(dv.name); }
      S.cursor.notes=(await t.get('sync',K.cursor('notes')))||null; S.cursor.versions=(await t.get('sync',K.cursor('versions')))||null; S.quota=(await t.get('sync','quota'))||null;
      if(overBudget()){ S.paused=true; S.listenPaused=true; }   // the day's budget was spent before this start: the pause is restored from the stored quota, nothing is read until the next day
      for(const j of await t.range('sync','out:n:','out:n:\uffff')) S.jobs.set(j.k.slice(6), j);
      for(const r of await t.range('sync','try:n:','try:n:\uffff')) S.tries.set(r.k.slice(6), r);
      for(const r of await t.range('sync','refetch:n:','refetch:n:\uffff')) S.refetch.add(r.k.slice(10));
      for(const m of await t.range('sync','meta:n:','meta:n:\uffff')){ if(m.err) S.err.set(m.k.slice(7), m.err); if(m.sends) S.sends.set(m.k.slice(7), m.sends); }
      for(const m of await t.range('sync','meta:v:','meta:v:\uffff')){ if(m.wait) addWaiting(m.wait); }
      for(const col of ['notes','versions']){ const sc=await t.get('sync',K.scan(col)); if(sc) S.scan[col]=sc; } }); S.everLoaded=true; }catch(e){ S.loaded=false; throw e; } }
  function addWaiting(doc){ const list=S.waiting.get(doc.note)||[]; const i=list.findIndex(d=>d.id===doc.id); if(i<0) list.push(doc); else if((doc.rev||0)>=(list[i].rev||0)) list[i]=doc; S.waiting.set(doc.note,list); }   // a later state of the same version replaces the earlier one
  // the job maps are a cache of the store: another runner over the same store (an old leader finishing its step, PR 2) may have added work
  async function reloadQueue(){ S.queueAt=now(); await db.tx(['sync'],'readonly', async t=>{ S.jobs.clear(); S.tries.clear(); S.refetch.clear();
      for(const j of await t.range('sync','out:n:','out:n:\uffff')) S.jobs.set(j.k.slice(6), j); for(const r of await t.range('sync','try:n:','try:n:\uffff')) S.tries.set(r.k.slice(6), r); for(const r of await t.range('sync','refetch:n:','refetch:n:\uffff')) S.refetch.add(r.k.slice(10)); }); }
  // the memory that describes the owner's data and this engine's run; the device's own state (the quota, the pause) is reset only by reload()
  function resetMemory(o={}){ S.jobs.clear(); S.tries.clear(); S.refetch.clear(); S.err.clear(); S.sends.clear(); S.waiting.clear(); S.lastDelivered.clear(); S.rejected.clear(); S.inbox.length=0;
    S.cursor={notes:null, versions:null}; S.scan={notes:null, versions:null}; S.catchup={notes:null, versions:null}; S.catchupDone={notes:false, versions:false}; S.snapshot={notes:false, versions:false};
    if(o.owner){ S.everCaughtUp=false; S.totals={notes:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}, versions:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}}; } S.loaded=false; }
  // a tab that becomes the leader (§4.10) starts from the store: the previous leader moved the cursor, resolved attempts and spent the budget while this
  // tab's memory stood still. The pause is reset too, since load() only ever sets it (a budget spent yesterday must not pause a leader of today)
  async function reload(){ const guard=S.everLoaded? {epoch:S.epoch, uid:S.owner? S.owner.uid : null, env:S.owner? S.owner.env : null} : null;   // a tab that waited for the lock must not adopt an owner it never knew
    resetMemory(); S.paused=false; S.listenPaused=false; S.nospace=false; S.sweptOnce=false; S.denied=false; S.errorUntil=0; S.stepErrors=0; S.queueAt=0; S.refetchRetry=0; S.quota=null; S.quotaDirty=false; await load({guard}); }
  // (epoch, env, uid) of the store against this engine's (§4.11, on pageshow/resume and when another tab reports a change of owner); the device record is refreshed on the way
  async function checkOwner(){ if(!S.loaded) await load(); return db.tx(['sync'],'readonly', async t=>{ const ep=await t.get('sync','epoch'), ow=await t.get('sync','owner'), dv=await t.get('sync','device'); if(dv && dv.id){ devId=String(dv.id); if(dv.name) devName=String(dv.name); }
    return (ep? ep.id : null)===S.epoch && (ow? ow.uid : null)===(S.owner? S.owner.uid : null) && (ow? ow.env : null)===(S.owner? S.owner.env : null); }); }
  const nudge=()=>{ S.queueAt=0; };   // another tab wrote: the next step reads the queue again instead of waiting for its minute

  /* ── budget and pace ── */
  function quotaNow(){ const day=dayKey(now()); if(!S.quota || S.quota.day!==day){ S.quota={k:'quota', day, reads:0, writes:0, lastSend:0}; S.quotaDirty=true; S.paused=false; } return S.quota; }
  const countRead=n=>{ const q=quotaNow(); q.reads+=Math.max(1,n|0); S.quotaDirty=true; if(q.reads>=budgets().reads) pauseDay(); };
  const countWrite=n=>{ const q=quotaNow(); q.writes+=n; q.lastSend=now(); S.quotaDirty=true; if(q.writes>=budgets().writes) pauseDay(); };
  function pauseDay(){ if(S.paused) return; S.paused=true; log({t:'limit', reads:S.quota.reads, writes:S.quota.writes}); stopListeners(); S.listenPaused=true; }   // no more paid reads today: the listeners go too, and come back with the next day's budget
  const overBudget=()=>{ const q=S.quota, b=budgets(); return !!q && q.day===dayKey(now()) && (q.reads>=b.reads || q.writes>=b.writes); }
  const budgetShare=()=>{ const q=quotaNow(), b=budgets(); return Math.max(q.reads/b.reads, q.writes/b.writes); };
  async function flushQuota(){ if(!S.quotaDirty || !S.quota) return; S.quotaDirty=false; try{ await db.tx(['sync'],'readwrite', async t=>{ t.put('sync', S.quota); }); }catch(_){ S.quotaDirty=true; } }
  // the pace is counted from time stamps clamped to now: a clock set back must not stall the queue for the difference
  function sendDelay(id, t){ const q=quotaNow(), nowT=t||now(), last=Math.min(q.lastSend||0, nowT); let next=last+pace.dev; const sends=S.sends.get(id)||[], lastNote=sends.length? Math.min(sends[sends.length-1], nowT) : 0; if(sends.length) next=Math.max(next, lastNote+pace.note);
    const bytes=S.bytes.get(id)||0; if(bytes>256*1024 && !S.left.has(id)) next=Math.max(next, lastNote+pace.huge); else if(bytes>64*1024) next=Math.max(next, lastNote+pace.big);
    if(budgetShare()>=0.7) next=Math.max(next, last+pace.slow); return next; }
  const backoffMs=tries=>Math.min(pace.retryMax, pace.retryMin*Math.pow(2, Math.max(0,tries-1)));

  /* ── history records inside the engine's transactions (§4.6 incoming, §4.7 copies) ── */
  async function versionsOf(t,id){ return t.byNote('versions',id); }
  const lastOf=list=>{ let best=null; for(const v of list) if(!best || (v.w||0)>(best.w||0)) best=v; return best; };
  async function writeIncoming(t, id, C, tt, after){ if(!C) return; const list=await versionsOf(t,id), last=lastOf(list); const m=manifestOf(C.title, C.blocks); if(last && last.sig===m.sig) return;
    const src=new Map((C.blocks||[]).map(b=>[b.id,b])); let size=0;
    for(const e of m.blocks){ if(!e.h) continue; const d=src.get(e.id), body=bodyOf(d); let h=e.h, k=0;
      for(;;){ const ex=await t.get('blobs',[id,h]); if(!ex){ const z=bytesOf(body); t.put('blobs',{note:id,h,s:body,r:(!d.kind&&d.html)?1:0,z}); size+=z; break; } if(ex.s===body) break; k++; h=e.h+'~'+k; } e.h=h; }
    const sig=hashOf(m.title+'\n'+JSON.stringify(m.blocks)), tv=Math.min(tt, vnow());
    t.put('versions',{id:vid(), note:id, t:tv, w:tv, reason:'incoming', title:m.title, sig, blocks:m.blocks, size:size+bytesOf(JSON.stringify(m.blocks)), sum:sumOf(m,last)});
    after(()=>emit(deps.onHistory,id)); }
  // a conflict copy is the insurance of a losing side (§4.7): every body goes in full, inline, whatever the limit of the automatic history
  // (a block over V_BODY_MAX has h:null in a manifest; here it gets its real hash, so the record's sig tells copies apart by that body too)
  async function writeCopies(t, id, copies, tt, after){ if(!copies || !copies.length) return; const list=await versionsOf(t,id), last=lastOf(list); const sigs=new Set(list.filter(v=>v.reason==='copy').map(v=>v.sig)); let any=false;
    for(const c of copies){ const n=c.note, m=manifestOf(n.title, n.blocks), src=new Map((n.blocks||[]).map(b=>[b.id,b])); let size=0;
      const blocks=m.blocks.map(e=>{ const d=src.get(e.id), body=bodyOf(d); size+=bytesOf(body); const x={...e, h:e.h||hashOf(body), s:body}; if(!d.kind && d.html) x.r=1; return x; });
      const bare=blocks.map(x=>{ const e={...x}; delete e.s; delete e.r; return e; }), sig=hashOf(m.title+'\n'+JSON.stringify(bare)); if(sigs.has(sig)) continue; sigs.add(sig); any=true;
      const tv=Math.min(tt, vnow()), rec={id:vid(), note:id, t:tv, w:tv, reason:'copy', keep:1, inline:1, title:m.title, sig, blocks, size:size+bytesOf(JSON.stringify(bare)), sum:sumOf(m,last), updated:n.updated, dev:c.dev||devId}; const dn=c.dev? c.dn : devName; if(dn) rec.dn=dn; t.put('versions',rec); }
    if(any) after(()=>emit(deps.onHistory,id)); }
  async function hasCopies(t,id){ return (await versionsOf(t,id)).some(v=>v.reason==='copy'); }
  async function deleteRecord(t,id){ t.del('notes',id); for(const v of await versionsOf(t,id)) t.del('versions',v.id); for(const b of await t.blobs(id)) t.del('blobs',[b.note,b.h]); }

  /* ── jobs, tries, marks (cache + store) ── */
  function setJob(t, id, job, after){ t.put('sync',job); after(()=>S.jobs.set(id,job)); }
  function dropJob(t, id, after){ t.del('sync',K.out('n',id)); after(()=>S.jobs.delete(id)); }
  async function ensureJob(t, id, body, meta, after){ if(!S.owner) return; let job=await t.get('sync',K.out('n',id));
    if(!job){ if(body && isEmpty(body) && !meta.base) return; job={k:K.out('n',id), tries:0, next:0}; }
    else if(job.tomb){ job={...job}; delete job.tomb; delete job.auto; }   // any change of the record cancels an automatic tombstone that is not insured yet
    setJob(t,id,job,after); }
  function setTry(t, id, tr, after){ t.put('sync',tr); after(()=>S.tries.set(id,tr)); }
  function dropTry(t, id, after){ t.del('sync',K.tr('n',id)); after(()=>S.tries.delete(id)); }
  function setRefetch(t, id, after){ t.put('sync',{k:K.refetch('n',id), at:now()}); after(()=>S.refetch.add(id)); }
  function dropRefetch(t, id, after){ t.del('sync',K.refetch('n',id)); after(()=>S.refetch.delete(id)); }
  function putMeta(t, meta, after){ t.put('sync',meta); const id=meta.k.slice(7); if(meta.k.startsWith('meta:n:')) after(()=>{ if(meta.err) S.err.set(id,meta.err); else S.err.delete(id); if(meta.sends) S.sends.set(id,meta.sends); }); }
  function setSeen(t, c, id, rec, prev){ const next={k:K.seen(c,id), ...rec}; if(prev && prev.rev===next.rev && cmpSrv(prev.srv,next.srv)===0 && !!prev.srv===!!next.srv) return; t.put('sync',next); }
  function quarantine(t, c, id, raw, reason, seen, after){ t.put('sync',{k:K.quarantine(c,id), raw, reason, seen:seen||null, at:now()}); log({t:'quarantine', col:c, id, reason}); after(()=>emit(deps.onChange,{id, kind:'quarantine'})); }

  /* ── the local write as a delta (§4.4, §2.4 of the implementation plan) ── */
  async function putNote(t, id, body, meta, o, after){ const rec={id, ...noteBody(body)}; delete rec.id; const stored={id, ...rec};
    meta.lrev=(meta.lrev||0)+1; if(o.baseEq) meta.baseLrev=meta.lrev;
    const bytes=docBytes(wireBody(stored))+512+(meta.base && meta.base.rcpt? bytesOf(JSON.stringify(meta.base.rcpt)) : 0);
    if(bytes>DOC_MAX) meta.err='size'; else if(meta.err==='size' || meta.err==='invalid') delete meta.err;
    t.put('notes',stored); putMeta(t,meta,after); after(()=>{ S.bytes.set(id,bytes); });
    if(o.copies) await writeCopies(t, id, o.copies, o.t||now(), after);
    return {lrev:meta.lrev, note:stored}; }
  async function writeLocal(id, delta){ if(!S.loaded) await load();
    try{ return await tx(['notes','sync','versions','blobs'], async(t, after)=>{
      if(await t.get('sync',K.purged(id))) return {ok:false, code:'purged'};
      const C=await t.get('notes',id), meta=await getMeta(t,'n',id), clock=(await t.get('sync','clock'))||{k:'clock', last:0};
      const tt=nextUpdated(now(), clock.last), r=delta(C? {...C} : undefined, meta, tt);
      if(r==null) return {ok:true, same:true, note:C, lrev:meta.lrev};
      const note=r.note||r, copies=r.copies||[]; if(C && sameDoc(note,C) && !copies.length) return {ok:true, same:true, note:C, lrev:meta.lrev};
      const body={...noteBody(note)}; if(!r.keepUpdated){ body.updated=tt; t.put('sync',{k:'clock', last:tt}); }
      const res=await putNote(t, id, body, meta, {copies, t:tt}, after); await ensureJob(t, id, body, meta, after);
      return {ok:true, lrev:res.lrev, note:res.note}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }

  /* ── revival (§4.7) ── */
  async function revive(t, originId, moved, o, after){ const tt=o.t||now(); let purgedRec=await t.get('sync',K.purged(originId)); if(!purgedRec) purgedRec={k:K.purged(originId), rev:0}; if(o.tombRev) purgedRec.rev=Math.max(purgedRec.rev||0, o.tombRev);
    const passed=[purgedRec]; let cur=purgedRec.revivedAs, target=null;
    while(cur){ const rec=await t.get('notes',cur); if(rec){ target=rec; break; } const p=await t.get('sync',K.purged(cur)); if(!p) break; passed.push(p); cur=p.revivedAs; }
    const ctx={dev:devId, t:tt}; let targetId;
    if(target){ targetId=target.id; const m=moveInto(target, moved, ctx), tmeta=await getMeta(t,'n',targetId); let note=m.note;
      if(o.toList && note.deleted){ note={...note}; delete note.deleted; }   // the one exception to «the revived note keeps its own fields»
      if(!sameDoc(note,target) || m.changed){ note={...note, updated:tt}; await putNote(t, targetId, note, tmeta, {copies:m.copies, t:tt}, after); await ensureJob(t, targetId, note, tmeta, after); }
      else await writeCopies(t, targetId, m.copies, tt, after);
      log({t:'moved', from:originId, to:targetId, existing:true}); }
    else { targetId=newId(); const m=moveInto(null, moved, ctx), note=m.note, root=moved.revived? moved.revived.from : originId;
      note.revived={from:root, dev:devId, at:tt}; if(devName) note.revived.dn=devName; note.revived.title=moved.title||'';
      if(o.toList) delete note.deleted; else note.deleted=tt;
      const nmeta=defMeta('n',targetId); await putNote(t, targetId, note, nmeta, {t:tt}, after); await ensureJob(t, targetId, note, nmeta, after);
      for(const p of passed) p.revivedAs=targetId;
      log({t:'moved', from:originId, to:targetId, existing:false}); after(()=>emit(deps.onChange,{id:targetId, kind:'revived', from:originId, dev:moved.dev, dn:moved.dn})); }
    for(const v of await versionsOf(t,originId)) if(v.reason==='copy'){ t.put('versions',{...v, note:targetId}); }   // the original's conflict copies follow its text
    if(!passed[0].revivedAs) passed[0].revivedAs=targetId; for(const p of passed) t.put('sync',p);
    after(()=>emit(deps.onChange,{id:targetId, kind:'note', dev:moved.dev, dn:moved.dn})); return targetId; }
  // a tombstone meets a local record: delete, or revive when the copy changed or has conflict copies
  async function tombstoneLocal(t, id, C, meta, doc, after){ const changed=meta.lrev!==meta.baseLrev, copies=C? await hasCopies(t,id) : false;
    const hashes=C? (C.blocks||[]).map(contentHash) : [];
    if(C && (changed || copies)){ const toList=!!(doc.auto && meta.base && meta.base.deleted && !C.deleted); await revive(t, id, noteBody(C), {t:now(), tombRev:doc.rev, toList}, after); log({t:'tombstone', id, changed:true, hashes}); }
    else log({t:'tombstone', id, changed:false, hashes});
    if(C) await deleteRecord(t,id); t.del('sync',K.meta('n',id)); after(()=>{ S.err.delete(id); S.sends.delete(id); S.bytes.delete(id); });
    const p=(await t.get('sync',K.purged(id)))||{k:K.purged(id), rev:0}; p.rev=Math.max(p.rev||0, doc.rev); t.put('sync',p);
    dropJob(t,id,after); dropTry(t,id,after); dropRefetch(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); }

  /* ── applying a document of `notes` (§4.6) and the local merge of §4.5 step 2 ── */
  // returns 'skipped' | 'done' | 'again' | 'damaged'
  async function applyNote(t, doc, source, after){ const id=doc.id, serverRead=source!=='delivery';
    if(!id || !Number.isInteger(doc.rev) || doc.rev<1 || !validSrv(doc.srv)){ log({t:'malformed', id, source}); return 'skipped'; }
    const seen=await t.get('sync',K.seen('n',id)); let meta=await getMeta(t,'n',id); const place=placeAgainstSeen(doc, seen, serverRead);
    if(place==='stale'){ log({t:'stale', id, rev:doc.rev}); return 'skipped'; }
    if(place==='rewritten'){ quarantine(t,'n',id,doc,'rewritten',seen,after); setSeen(t,'n',id,{rev:doc.rev, srv:doc.srv}); meta.err='damaged'; putMeta(t,meta,after); return 'damaged'; }
    let recreated=false; if(place==='recreated'){ recreated=true; log({t:'recreated', id, rev:doc.rev}); }
    setSeen(t,'n',id,{rev:doc.rev, srv:doc.srv}, seen);
    const C=await t.get('notes',id), purgedRec=await t.get('sync',K.purged(id)), tr=await t.get('sync',K.tr('n',id)), job=await t.get('sync',K.out('n',id));
    if(recreated) meta.base=null;
    if(!doc.purged){ const q=await t.get('sync',K.quarantine('n',id)); if(q && (!q.raw || !q.raw.srv || clearlyNewer(doc.srv, q.raw.srv))){ t.del('sync',K.quarantine('n',id)); if(meta.err==='damaged'){ delete meta.err; putMeta(t,meta,after); } } }
    if(meta.base && doc.rev===meta.base.rev && !recreated){ let ch=false; if(!meta.base.srv && doc.srv){ meta.base.srv=doc.srv; ch=true; } if(doc.tsrv && !meta.base.tsrv){ meta.base.tsrv=doc.tsrv; ch=true; } if(ch) putMeta(t,meta,after); return 'done'; }
    if(tr){ if(doc.rcpt && doc.rcpt[devId]===tr.op && doc.rev===tr.expect+1){ await finishCore(t, id, tr, {kind:'accepted', rev:doc.rev, srv:doc.srv, echo:doc}, after); return 'done'; } setRefetch(t,id,after); return 'done'; }
    if(doc.purged){   // a tombstone
      if(!C && purgedRec){ if(doc.rev>(purgedRec.rev||0)){ purgedRec.rev=doc.rev; t.put('sync',purgedRec); } if(job && job.tomb) dropJob(t,id,after); if(await t.get('sync',K.meta('n',id))) t.del('sync',K.meta('n',id)); return 'done'; }   // the echo of an own tombstone, or another device's after ours
      if(!C){ t.put('sync',{k:K.purged(id), rev:doc.rev}); return 'done'; }   // never seen here
      if(job && job.tomb && job.auto && sameDoc(C, meta.base||{})){ log({t:'tombstone', id, changed:false, hashes:(C.blocks||[]).map(contentHash)}); await deleteRecord(t,id); t.del('sync',K.meta('n',id)); t.put('sync',{k:K.purged(id), rev:doc.rev}); dropJob(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return 'done'; }
      await tombstoneLocal(t, id, C, meta, doc, after); return 'done'; }
    const nn=normNote(doc, deps); if(nn.bad){ quarantine(t,'n',id,doc,'shape',{rev:doc.rev, srv:doc.srv},after); meta.err='damaged'; putMeta(t,meta,after); return 'damaged'; }
    const body=nn.note, tt=now();
    if(purgedRec){   // the deletion stands: a live document of a purged id goes into the revived note
      await revive(t, id, {...body, dev:doc.dev, dn:doc.dn}, {t:tt}, after); if(job){ meta.base=storeBase(doc); putMeta(t,meta,after); } log({t:'moved-in', id}); return job? 'again' : 'done'; }
    if(!C){ await putNote(t, id, body, meta, {baseEq:true}, after); meta.base=storeBase(doc); meta.arrived=tt; putMeta(t,meta,after); dropJob(t,id,after);
      if(body.revived){ const pr=await t.get('sync',K.purged(body.revived.from)); if(pr && !pr.revivedAs){ pr.revivedAs=id; t.put('sync',pr); } }   // an incoming revived note becomes this device's pointer
      log({t:'applied', id, rev:doc.rev, fresh:true}); after(()=>emit(deps.onChange,{id, kind:'note', lrev:meta.lrev, dev:doc.dev, dn:doc.dn})); return 'done'; }
    if(meta.lrev===meta.baseLrev && !recreated){ await writeIncoming(t, id, C, tt, after); await putNote(t, id, {...body}, meta, {baseEq:true}, after); meta.base=storeBase(doc); meta.arrived=tt; putMeta(t,meta,after); dropJob(t,id,after);
      log({t:'applied', id, rev:doc.rev}); after(()=>emit(deps.onChange,{id, kind:'note', lrev:meta.lrev, dev:doc.dev, dn:doc.dn})); return 'done'; }
    return mergeCore(t, id, C, meta, doc, body, tt, after); }
  // the local merge (§4.5 step 2, §4.6 rule 6): the state here goes into the history first, then merge3 over the base (or merge0 without one)
  async function mergeCore(t, id, C, meta, doc, body, tt, after){ await writeIncoming(t, id, C, tt, after);
    const ctx={dev:devId, t:tt}, R={...body, dev:doc.dev, dn:doc.dn}, m=meta.base? merge3(noteBody(meta.base), C, R, ctx) : merge0(C, R, ctx);
    meta.base=storeBase(doc); meta.arrived=tt; log({t:'merged', id, rev:doc.rev, trace:m.trace, same:m.same});
    if(m.same){ await putNote(t, id, m.note, meta, {baseEq:true, copies:m.copies, t:tt}, after); dropJob(t,id,after); after(()=>emit(deps.onChange,{id, kind:'note', lrev:meta.lrev, dev:doc.dev, dn:doc.dn})); return 'done'; }
    await putNote(t, id, m.note, meta, {copies:m.copies, t:tt}, after); await ensureJob(t, id, m.note, meta, after); after(()=>emit(deps.onChange,{id, kind:'note', lrev:meta.lrev, dev:doc.dev, dn:doc.dn})); return 'again'; }
  // the cursor never moves back (§4.6): the stored one decides, not this runner's memory, which may be behind another tab's leadership
  async function bumpCursor(t, col, last, after){ const stored=await t.get('sync',K.cursor(col)), prev=stored? {srv:stored.srv, id:stored.id} : null, best=cursorMax(prev, last); if(best!==prev) t.put('sync',{k:K.cursor(col), ...best}); after(()=>{ S.cursor[col]=cursorMax(S.cursor[col], best); }); }
  async function applyIncoming(col, doc, source){ if(col==='versions') return applyVersionDoc(doc, source);
    try{ const r=await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const res=await applyNote(t, doc, source, after); if(source==='delivery' && res!=='skipped') await bumpCursor(t,'notes',{srv:doc.srv, id:doc.id},after); return res; });
      if(source==='delivery') S.lastDelivered.set(doc.id, doc.rev);
      const w=S.waiting.get(doc.id); if(w && w.length && r!=='skipped'){ S.waiting.delete(doc.id); for(const d of w) S.inbox.unshift({col:'versions', doc:d, source:'wait'}); }
      return r; }
    catch(e){ if(e.code==='epoch') return 'epoch'; if(/Quota/i.test(e.name||'') || e.code==='quota') return (await quotaTrouble(doc.id))? 'nospace' : 'error'; log({t:'apply-error', id:doc.id, error:String(e)}); try{ await tx(['sync'], async(t,after)=>{ setRefetch(t,doc.id,after); }); }catch(_){} return 'error'; } }
  // the first document without space: thin the history once and read the document again later, the page goes on; the second: no space, receiving stops (§4.6)
  async function quotaTrouble(id){ if(!S.sweptOnce){ S.sweptOnce=true; log({t:'quota', id}); if(deps.sweep){ try{ await deps.sweep(); }catch(_){} } try{ await tx(['sync'], async(t,after)=>{ setRefetch(t,id,after); }); }catch(_){} return false; }
    S.nospace=true; S.nospaceAt=now(); log({t:'nospace', id}); setStatus('nospace'); return true; }
  // versions are received only in PR 1 (sending them comes with PR 4); a version waits for its note, one of a purged note is ignored
  async function applyVersionDoc(doc, source){ try{ return await tx(['notes','sync','versions'], async(t,after)=>{ const id=doc.id;
      if(source==='wait'){ const w=(await getMeta(t,'v',id)).wait; if(!w) return 'skipped'; doc=w; }   // the note came: the version is applied from its stored latest state, which is what seen holds, so the replay is not a stale server read
      if(!id || !Number.isInteger(doc.rev) || doc.rev<1 || !validSrv(doc.srv) || typeof doc.note!=='string'){ log({t:'malformed', col:'v', id}); return 'skipped'; }
      const seen=await t.get('sync',K.seen('v',id)), place=placeAgainstSeen(doc, seen, source!=='delivery');
      if(place==='stale') return 'skipped';
      setSeen(t,'v',id,{rev:doc.rev, srv:doc.srv}, seen);
      if(place==='rewritten'){ quarantine(t,'v',id,doc,'rewritten',seen,after); return 'damaged'; }
      const meta=await getMeta(t,'v',id);
      if(doc.deleted){ t.del('versions',id); meta.base=storeBase(doc); delete meta.wait; putMeta(t,meta,after); return 'done'; }
      if(await t.get('sync',K.purged(doc.note))){ delete meta.wait; putMeta(t,meta,after); return 'done'; }   // a version of a purged note is ignored
      const note=await t.get('notes',doc.note);
      if(!note){ meta.wait=doc; putMeta(t,meta,after); after(()=>addWaiting(doc)); return 'done'; }
      const nv=normVersion(doc, deps); if(nv.bad){ quarantine(t,'v',id,doc,'shape',{rev:doc.rev, srv:doc.srv},after); return 'damaged'; }
      const v=nv.version, m=manifestOf(v.title, v.blocks), src=new Map(v.blocks.map(b=>[b.id,b])); let size=0;
      const blocks=m.blocks.map(e=>{ const d=src.get(e.id); const body=d.s!==undefined? d.s : bodyOf(d); size+=bytesOf(body); const x={...e, s:body}; if(d.r || (!d.kind && d.html)) x.r=1; return x; });
      t.put('versions',{id, note:v.note, t:Math.min(v.t, vnow()), w:now(), reason:'manual', name:v.name, keep:1, inline:1, title:v.title, sig:m.sig, blocks, size, sum:sumOf(m,null), dev:doc.dev, dn:doc.dn});
      meta.base=storeBase(doc); meta.baseLrev=meta.lrev; delete meta.wait; putMeta(t,meta,after); after(()=>emit(deps.onChange,{id, kind:'version', note:v.note})); if(source==='delivery') await bumpCursor(t,'versions',{srv:doc.srv, id},after); return 'done'; }); }
    catch(e){ if(e.code==='epoch') return 'epoch'; log({t:'apply-error', col:'v', id:doc.id, error:String(e)}); return 'error'; } }

  /* ── sending (§4.5) ── */
  async function net(fn){ if(!S.online) return {error:{code:'unavailable', message:'offline'}}; try{ return {value: await fn()}; }catch(e){ return {error: errOf(e)}; } }
  // the retry time is set in memory first: when storage itself fails, the job must still wait instead of being picked again at once
  async function backoff(id, error){ const job=S.jobs.get(id); if(!job) return; const j={...job, tries:(job.tries||0)+1, err:error.code}; j.next=now()+backoffMs(j.tries); log({t:'retry', id, code:error.code, next:j.next}); S.jobs.set(id,j);
    try{ await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.out('n',id)); if(cur) setJob(t,id,{...cur, tries:j.tries, next:j.next, err:j.err},after); }); }catch(_){} }   // only the retry fields: another runner may have changed the rest
  // a storage or program error inside one send or attempt: logged, the job backs off, the step goes on (§4.5: nothing unsecured reaches the cloud)
  async function guarded(kind, id, fn){ try{ await fn(); }catch(e){ if(e && e.code==='epoch') return; log({t:'step-error', kind, id, code:e && e.code, error:String(e && e.message || e)}); await backoff(id, {code:'storage'}); } }
  function pickJob(nowT){ if(S.netBusy || S.paused || !S.online || S.denied) return null;
    for(const [id,job] of S.jobs){ if(S.tries.has(id)) continue; if((job.next||0)>nowT+pace.retryMax){ job.next=nowT; } if((job.next||0)>nowT) continue; const err=S.err.get(id); if(err && !job.tomb) continue; if(sendDelay(id,nowT)>nowT) continue; return id; } return null; }   // a retry time past the longest backoff is a clock set back
  async function runSend(id){ S.netBusy=true; try{ for(let round=0; round<4; round++){
      const st=await db.tx(['notes','sync'],'readonly', async t=>({C:await t.get('notes',id), meta:await getMeta(t,'n',id), job:await t.get('sync',K.out('n',id)), tr:await t.get('sync',K.tr('n',id))}));
      if(!st.job){ S.jobs.delete(id); log({t:'send-nojob', id}); return; } if(st.tr){ await runTry(id); return; }
      const base=st.meta.base; let R;
      // the read is skipped only while the listener's last delivery for the note is the base; after a rejection the document is read (§4.5 step 2)
      if(S.snapshot.notes && base && S.lastDelivered.get(id)===base.rev && !S.rejected.has(id)) R=base; else { const got=await net(()=>S.cloud.get('notes',id)); if(got.error){ await backoff(id, got.error); return; } countRead(1); R=got.value; if(R && !R.id) R={...R, id}; S.rejected.delete(id); }
      if(R && (!base || R.rev>base.rev)){ const out=await mergeTx(id, R); if(out==='again') continue; return; }
      if(R && base && R.rev<base.rev){ const out=await invariantTx(id, R); if(out==='again') continue; return; }
      if(!R && base){ await vanishedTx(id); continue; }
      const ins=await insureTx(id); log({t:'insure', id, ins}); if(ins==='insured'){ await runTry(id); return; } if(ins==='has-try'){ await reloadQueue(); return; } if(ins==='again') continue; return; } }   // has-try: another runner insured an attempt while this one was reading the cloud; the next step runs that attempt
    finally{ S.netBusy=false; } }
  // §4.5 step 2 when the cloud moved ahead: one transaction, R is a server read
  async function mergeTx(id, R){ return tx(['notes','sync','versions','blobs'], async(t,after)=>{ const res=await applyNote(t, R, 'server', after); return res; }); }
  async function invariantTx(id, R){ log({t:'invariant', id, kind:'older', rev:R.rev}); return tx(['notes','sync','versions','blobs'], async(t,after)=>applyNote(t, R, 'server', after)); }   // rule 1 decides: recreated → first merge, rewritten → quarantine
  async function vanishedTx(id){ log({t:'invariant', id, kind:'vanished'}); await tx(['sync'], async(t,after)=>{ const meta=await getMeta(t,'n',id), job=await t.get('sync',K.out('n',id)); meta.base=null; meta.baseLrev=0; putMeta(t,meta,after); t.del('sync',K.seen('n',id)); if(job && job.tomb) dropJob(t,id,after); }); }
  // §4.5 step 3: the insured attempt, result and sentLrev from one read; a tombstone keeps its own emptiness rule
  async function insureTx(id){ return tx(['notes','sync','versions'], async(t,after)=>{ let job=await t.get('sync',K.out('n',id)); if(!job) return 'dropped'; if(await t.get('sync',K.tr('n',id))) return 'has-try';   // §4.5 step 1: no new op while an attempt stands, whoever insured it
      const Srec=await t.get('notes',id), meta=await getMeta(t,'n',id), base=meta.base, tt=now();
      if(job.tomb){ const manual=!Srec; if(manual || (Srec.deleted && base && sameDoc(Srec, base) && !(await hasCopies(t,id)))){ const tr={k:K.tr('n',id), op:'o'+now().toString(36)+random().toString(36).slice(2,8), expect: base? base.rev : 0, result:{purged:tt}, sentLrev:meta.lrev, epoch:S.epoch}; if(job.auto) tr.result.auto=true; setTry(t,id,tr,after); return 'insured'; }
        job={...job}; delete job.tomb; delete job.auto; setJob(t,id,job,after); }
      if(!Srec){ dropJob(t,id,after); return 'dropped'; }
      if(base && sameDoc(Srec, base)){ dropJob(t,id,after); meta.baseLrev=meta.lrev; putMeta(t,meta,after); return 'dropped'; }
      if(meta.err==='size'){ return 'blocked'; }
      const tr={k:K.tr('n',id), op:'o'+now().toString(36)+random().toString(36).slice(2,8), expect: base? base.rev : 0, result:wireBody(Srec), sentLrev:meta.lrev, epoch:S.epoch}; setTry(t,id,tr,after); return 'insured'; }); }
  // §4.5 step 4: the cloud transaction; the callback has no side effects and may run more than once
  async function runTry(id){ const tr=S.tries.get(id); if(!tr || !S.online){ log({t:'try-skip', id, has:!!tr, online:S.online}); return; } S.netBusy=true; try{
      const res=await net(()=>S.cloud.txn('notes', id, D=>{ if(D && D.rcpt && D.rcpt[devId]===tr.op) return null; if((D? D.rev : 0)!==tr.expect) return null; const w={...tr.result, v:1, rev:tr.expect+1, op:tr.op, dev:devId, rcpt:{...(D && D.rcpt || {}), [devId]:tr.op}}; if(devName) w.dn=devName; return w; }));
      if(res.error){ const code=res.error.code; if(isNetErr(code)){ await backoff(id, res.error); return; } if(code==='permission-denied'){ S.denied=true; log({t:'denied', id}); setStatus('denied'); return; } if(code==='resource-exhausted'){ pauseDay(); return; }
        await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.tr('n',id)); if(!cur || cur.op!==tr.op) return; dropTry(t,id,after); const meta=await getMeta(t,'n',id); meta.err=code==='too-large'? 'size' : 'invalid'; putMeta(t,meta,after); log({t:'rejected-write', id, code}); }); return; }
      const {read:D, wrote}=res.value; countRead(1); if(wrote) countWrite(1);
      // accepted by the receipt: the own write is rev expect+1; the document read may already be later (another device wrote on top) and is then applied as a server read
      let outcome; if(wrote) outcome={kind:'accepted', rev:tr.expect+1, srv:null}; else if(D && D.rcpt && D.rcpt[devId]===tr.op) outcome=D.rev===tr.expect+1? {kind:'accepted', rev:D.rev, srv:D.srv||null, echo:D} : {kind:'accepted', rev:tr.expect+1, srv:null, later:{...D, id}}; else if(D && D.rev>tr.expect) outcome={kind:'rejected'}; else outcome={kind:'invariant', D};
      await tx(['notes','sync','versions','blobs'], async(t,after)=>finishCore(t, id, tr, outcome, after)); }
    finally{ S.netBusy=false; } }
  // §4.5 step 5: the finish, only if the attempt is still the same one
  async function finishCore(t, id, tr, outcome, after){ const cur=await t.get('sync',K.tr('n',id)); if(!cur || cur.op!==tr.op){ after(()=>{ if(S.tries.get(id)===tr) S.tries.delete(id); S.queueAt=0; }); return 'stale'; }   // another runner finished it (§4.5 step 5): this memory forgets the attempt and reads the queue again
    const meta=await getMeta(t,'n',id), job=await t.get('sync',K.out('n',id)), Srec=await t.get('notes',id), seen=(await t.get('sync',K.seen('n',id)))||null;
    if(outcome.kind==='accepted'){ const rev=outcome.rev, after_=meta.base? meta.base.srv||null : null; const sends=(meta.sends||[]).filter(x=>x>now()-pace.loopWindow); sends.push(now()); meta.sends=sends;
      if(tr.result && tr.result.purged){ setSeen(t,'n',id,{rev:Math.max(rev, seen? seen.rev : 0), srv:outcome.srv, after:after_});
        if(meta.lrev!==tr.sentLrev && Srec){ const toList=!!(tr.result.auto && meta.base && meta.base.deleted && !Srec.deleted); await revive(t, id, noteBody(Srec), {t:now(), tombRev:rev, toList}, after); log({t:'tombstone', id, changed:true, own:true}); }
        const p=(await t.get('sync',K.purged(id)))||{k:K.purged(id), rev:0}; p.rev=Math.max(p.rev||0, rev);   // read after the revival: it may have pointed the registry at the revived note
        if(Srec) await deleteRecord(t,id); t.put('sync',p); t.del('sync',K.meta('n',id)); after(()=>{ S.err.delete(id); S.sends.delete(id); S.bytes.delete(id); }); dropJob(t,id,after); dropTry(t,id,after); log({t:'purged', id, rev}); after(()=>emit(deps.onChange,{id, kind:'purged'})); return 'done'; }
      const nb={...tr.result, rev, srv:outcome.srv||null, dev:devId, op:tr.op, v:1}; if(devName) nb.dn=devName; if(meta.base && meta.base.tsrv && ((meta.base.deleted||0)===(tr.result.deleted||0))) nb.tsrv=meta.base.tsrv;
      if(outcome.echo){ nb.rcpt=outcome.echo.rcpt; nb.tsrv=outcome.echo.tsrv; } else nb.rcpt={...(meta.base && meta.base.rcpt || {}), [devId]:tr.op};
      if(!meta.base || rev>meta.base.rev) meta.base=nb;
      setSeen(t,'n',id,{rev:Math.max(rev, seen? seen.rev : 0), srv:outcome.srv, after:after_});
      if(meta.lrev===tr.sentLrev){ meta.baseLrev=meta.lrev; dropJob(t,id,after); } else if(job){ setJob(t,id,{...job, tries:0, next:0},after); }
      if(sends.length>pace.loopN && !(S.typed.get(id)>now()-pace.loopWindow)){ meta.err='loop'; log({t:'loop', id}); }
      putMeta(t,meta,after); dropTry(t,id,after); log({t:'accepted', id, rev}); if(outcome.later) return applyNote(t, outcome.later, 'server', after); return 'done'; }
    if(outcome.kind==='rejected'){ dropTry(t,id,after); if(job) setJob(t,id,{...job, tries:0, next:0},after); after(()=>S.rejected.add(id)); log({t:'rejected', id, expect:tr.expect}); return 'done'; }
    // an invariant violation: a resolved outcome (§4.5 step 4)
    dropTry(t,id,after); const D=outcome.D; log({t:'invariant', id, kind:D? 'older' : 'vanished', rev:D? D.rev : null});
    if(!D){ meta.base=null; meta.baseLrev=0; putMeta(t,meta,after); t.del('sync',K.seen('n',id)); if(job && job.tomb) dropJob(t,id,after); return 'done'; }
    return applyNote(t, {...D, id}, 'server', after); }

  /* ── receiving: catch-up, listener, refetch (§4.6) ── */
  function startCatchup(col, from){ S.catchup[col]={active:true, from:from===undefined? srvMinus(S.cursor[col] && S.cursor[col].srv, 5*60000) : from, after:null, retryAt:0}; S.catchupDone[col]=false; }
  async function fetchPage(col){ const c=S.catchup[col]; if(!c || c.retryAt>now()) return false; S.netBusy=true; try{
      const res=await net(()=>S.cloud.page(col, c.after? {after:c.after} : {from:c.from}, 200)); if(res.error){ c.retryAt=now()+backoffMs(++c.tries||1); log({t:'page-error', col, code:res.error.code}); return true; }
      const docs=res.value||[]; countRead(Math.max(1, docs.length)); let last=null;
      for(const d of docs){ const r=await applyIncoming(col, d, 'delivery'); if(r==='epoch') return true; if(r==='nospace'){ c.retryAt=now()+3600000; return true; } last={srv:d.srv, id:d.id}; }   // epoch: the owner changed under this page (§4.4 step 1); nothing of it is kept, not even the cursor
      if(last){ c.after=last; try{ await tx(['sync'], async(t,after)=>bumpCursor(t,col,last,after)); }catch(e){ if(e.code==='epoch') return true; throw e; } }   // with the owner check: a page of the old owner must not leave its cursor to the new one
      if(docs.length<200){ c.active=false; S.catchupDone[col]=true; log({t:'catchup-done', col}); if(col==='notes'){ S.everCaughtUp=true; if(!S.catchup.versions || !S.catchup.versions.active) startCatchup('versions'); } S.totals[col].pending=true; }
      return true; } finally{ S.netBusy=false; } }
  function startListener(col){ if(!S.cloud || !S.cloud.listen || S.paused) return; if(S.listen[col]){ try{ S.listen[col](); }catch(_){} }
    S.snapshot[col]=false; const from=srvMinus(S.cursor[col] && S.cursor[col].srv, 2*60000);
    S.listen[col]=S.cloud.listen(col, from, (docs, info)=>{ if(info && info.snapshot) S.snapshot[col]=true; if(docs && docs.length) countRead(docs.length); for(const d of docs||[]) S.inbox.push({col, doc:d, source:'delivery'}); emit(deps.wake); }, err=>{ log({t:'listen-error', col, code:errOf(err).code}); S.snapshot[col]=false; S.listen[col]=null; }); }   // every delivered document is a billed read (§4.17)
  function stopListeners(){ for(const col of ['notes','versions']){ if(S.listen[col]){ try{ S.listen[col](); }catch(_){} S.listen[col]=null; } S.snapshot[col]=false; } }
  async function doRefetch(id){ S.netBusy=true; try{ const got=await net(()=>S.cloud.get('notes',id)); if(got.error){ log({t:'refetch-error', id, code:got.error.code}); S.refetchRetry=now()+backoffMs(1); return; } countRead(1);
      try{ await tx(['notes','sync','versions','blobs'], async(t,after)=>{ dropRefetch(t,id,after); const R=got.value; if(R) await applyNote(t, {...R, id}, 'server', after); }); }
      catch(e){ if(e.code==='epoch') return; if(/Quota/i.test(e.name||'') || e.code==='quota'){ await quotaTrouble(id); return; } log({t:'apply-error', id, error:String(e)}); S.refetchRetry=now()+backoffMs(2); } }   // the record stays for the next try
    finally{ S.netBusy=false; } }

  /* ── the totals check and the full pass (§4.6) ── */
  async function seenTotals(c){ const list=await db.tx(['sync'],'readonly', async t=>t.range('sync','seen:'+c+':','seen:'+c+':\uffff')); let sum=0; for(const s of list) sum+=+s.rev||0; return {count:list.length, sum, ids:list.map(s=>s.k.slice(7))}; }
  function totalsDue(nowT){ if(!S.online || S.paused || S.denied || S.tries.size || S.netBusy || S.nospace) return null;
    for(const col of ['notes','versions']){ const T=S.totals[col]; if(!S.catchupDone[col] || !S.snapshot[col]) continue; if(S.catchup[col] && S.catchup[col].active) continue; if(S.scan[col] && S.scan[col].active) continue;   // the full pass settles the question itself; a check meanwhile would only spend the budget
      if(T.mismatchAt && nowT-T.mismatchAt<pace.totalsRecheck) continue; if(T.lastMatch && nowT-T.lastMatch<pace.totalsAfterMatch) continue;
      if(T.pending || !T.last || nowT-T.last>=pace.totalsEvery) return col; } return null; }
  async function runTotals(col){ const T=S.totals[col], c=COL[col]; S.netBusy=true; try{ const res=await net(()=>S.cloud.totals(col)); T.last=now(); T.pending=false;
      if(res.error){ log({t:'totals-unknown', col, code:res.error.code}); return; } const {count, sum}=res.value; countRead(2*Math.max(1, Math.ceil(count/1000)));
      const mine=await seenTotals(c); const same=mine.count===count && mine.sum===sum; log({t:'totals', col, cloud:{count, sum}, seen:{count:mine.count, sum:mine.sum}, same});
      if(same){ T.lastMatch=now(); T.mismatchAt=0; T.strikes=0; return; }
      T.strikes++; T.mismatchAt=now();
      if(T.strikes===1){ startCatchup(col); return; }
      T.strikes=0; const day=dayKey(now()), sc=S.scan[col]; if(sc && (sc.startedDay===day || sc.active)){ log({t:'scan-skipped', col}); return; }
      const left=Math.max(0, budgets().reads-quotaNow().reads); S.scan[col]={k:K.scan(col), active:true, after:null, found:0, ids:[], startedDay:day, day, allow:Math.floor(left/2)}; await saveScan(col); log({t:'scan-start', col}); setStatus('checking',0); }
    finally{ S.netBusy=false; } }
  async function saveScan(col){ const sc=S.scan[col]; await tx(['sync'], async t=>{ if(sc) t.put('sync',sc); else t.del('sync',K.scan(col)); }); }   // under the owner check, like every write of the owner's data
  function scanReady(nowT){ for(const col of ['notes','versions']){ const sc=S.scan[col]; if(!sc || !sc.active) continue; const day=dayKey(nowT); if(sc.day!==day){ sc.day=day; sc.allow=Math.floor(Math.max(0, budgets().reads-quotaNow().reads)/2); } if(sc.allow>=1 && S.online && !S.paused && !S.netBusy && !S.denied) return col; } return null; }
  async function scanPage(col){ const sc=S.scan[col]; S.netBusy=true; try{ const n=Math.min(200, sc.allow); const res=await net(()=>S.cloud.scan(col, {afterId:sc.after}, n)); if(res.error){ sc.retryAt=now()+backoffMs(1); return; }
      const docs=res.value||[]; countRead(Math.max(1,docs.length)); sc.allow-=Math.max(1,docs.length); for(const d of docs){ if(await applyIncoming(col, d, 'server')==='epoch') return; sc.ids.push(d.id); sc.found++; sc.after=d.id; } S.scanFound=sc.found; setStatus('checking',sc.found);
      if(docs.length<n){ await scanComplete(col); return; } await saveScan(col); } finally{ S.netBusy=false; } }
  async function scanComplete(col){ const sc=S.scan[col], c=COL[col], mine=await seenTotals(c), got=new Set(sc.ids), vanished=mine.ids.filter(id=>!got.has(id)); log({t:'scan-done', col, found:sc.found, vanished:vanished.length});
    if(vanished.length) await tx(['notes','sync'], async(t,after)=>{ for(const id of vanished){ t.del('sync',K.seen(c,id)); log({t:'vanished', col, id}); if(c==='n'){ const meta=await getMeta(t,'n',id); meta.base=null; meta.baseLrev=0; putMeta(t,meta,after); const rec=await t.get('notes',id); if(rec){ const job=await t.get('sync',K.out('n',id)); if(!job) setJob(t,id,{k:K.out('n',id), tries:0, next:0},after); } } else { const meta=await getMeta(t,'v',id); meta.base=null; putMeta(t,meta,after); } } });
    S.scan[col]={...sc, active:false, ids:[], doneDay:dayKey(now())}; await saveScan(col); S.totals[col].pending=true; }

  /* ── the step ── */
  function status(){ const jobs=S.jobs.size+S.tries.size; let code;
    if(!S.owner) code='none'; else if(S.denied) code='denied'; else if(S.nospace) code='nospace'; else if(S.paused) code='limit'; else if(!S.online) code='offline';
    else if([...S.jobs.values()].some(j=>S.err.get(j.k.slice(6))==='loop' || S.err.get(j.k.slice(6))==='size' || S.err.get(j.k.slice(6))==='invalid' || S.err.get(j.k.slice(6))==='damaged')) code='error';
    else if(S.scan.notes && S.scan.notes.active || S.scan.versions && S.scan.versions.active) code='checking';
    else if(S.tries.size && [...S.tries.values()].some(tr=>(S.jobs.get(tr.k.slice(6))||{}).tries>0 && now()-(tr.at||0)>pace.waiting)) code='waiting';
    else if(jobs || S.refetch.size) code='sending';
    else if(S.snapshot.notes && S.snapshot.versions && S.totals.notes.lastMatch && S.totals.versions.lastMatch) code='synced'; else code='pending';
    const st={code, n: code==='checking'? S.scanFound : jobs}; setStatus(code, st.n); return st; }
  // every status report goes through here, so a direct report (a pass's progress, denied, no space) and the computed one never disagree
  function setStatus(code, n){ const st={code, n:n||0}; if(!S.lastStatus || S.lastStatus.code!==code || S.lastStatus.n!==st.n){ S.lastStatus=st; emit(deps.onStatus, code, st.n); } }
  function nextWake(nowT){ let next=Infinity; for(const [id,job] of S.jobs){ if(S.paused){ const tr=S.tries.get(id); if(!(tr && tr.result && tr.result.purged)) continue; }   // paused: only a tombstone's attempt may still run; the other jobs wait for the next day, not for the next step
      const d=S.tries.has(id)? (job.next||0) : Math.max(job.next||0, sendDelay(id,nowT)); if(d>nowT) next=Math.min(next,d); else next=Math.min(next, nowT+50); }
    if(!S.paused) for(const col of ['notes','versions']){ const c=S.catchup[col]; if(c && c.active) next=Math.min(next, Math.max(c.retryAt||0, nowT+50)); const T=S.totals[col]; if(S.catchupDone[col] && S.snapshot[col] && !S.tries.size){ next=Math.min(next, T.mismatchAt? T.mismatchAt+pace.totalsRecheck : T.lastMatch? Math.max(T.lastMatch+pace.totalsAfterMatch, T.last+pace.totalsEvery) : nowT+1000); } }   // paused: pages, refetches and totals are not allowed, so they set no time; the inbox (already paid) still does
    if(S.inbox.length || (S.refetch.size && !S.paused)) next=Math.min(next, nowT+10); if(S.nospace) next=Math.min(next, (S.nospaceAt||nowT)+3600000); if(S.paused) next=Math.min(next, nextDay(nowT)); return next; }   // paused: the step runs again when the budget counts anew
  async function stepOnce(){ if(!S.loaded) await load(); const nowT=now(); quotaNow();
    if(!S.started || !S.cloud || !S.owner){ return {did:'idle', next:Infinity, status:status()}; }
    if(S.listenPaused && !S.paused){ S.listenPaused=false; reconnect(); }   // the day turned: the budget is back, so are the listeners
    if((S.errorUntil||0)>nowT) return {did:'idle', next:S.errorUntil, status:status()};
    // no space (§4.6): receiving stops for an hour, deliveries meanwhile are dropped (the totals check finds them later); then the listener and catch-up start over
    if(S.nospace){ if(nowT<(S.nospaceAt||0)+3600000){ S.inbox.length=0; return {did:'idle', next:S.nospaceAt+3600000, status:status()}; } S.nospace=false; S.sweptOnce=false; log({t:'nospace-over'}); reconnect(); }
    if((!S.jobs.size && !S.tries.size) || nowT-(S.queueAt||0)>60000) await reloadQueue();
    try{
      if(S.inbox.length){ const m=S.inbox.shift(); await applyIncoming(m.col, m.doc, m.source); return {did:'inbox', next:nowT}; }
      if(S.online && !S.denied){ for(const [id,tr] of S.tries){ const job=S.jobs.get(id); if(job && (job.next||0)>nowT+pace.retryMax) job.next=nowT; if(job && (job.next||0)>nowT) continue; if(S.paused && !(tr.result && tr.result.purged)) continue; await guarded('try', id, ()=>runTry(id)); return {did:'try', next:nowT}; } }
      for(const col of ['notes','versions']){ const c=S.catchup[col]; if(c && c.active && S.online && !S.paused && !S.denied && (col==='notes' || !(S.catchup.notes && S.catchup.notes.active))){ if(await fetchPage(col)) return {did:'page', next:nowT}; } }
      if(S.online && !S.paused && !S.denied && !(S.refetchRetry>nowT)){ for(const id of S.refetch){ if(S.tries.has(id)) continue; await doRefetch(id); return {did:'refetch', next:nowT}; } }
      const pick=pickJob(nowT); if(pick){ await guarded('send', pick, ()=>runSend(pick)); return {did:'send', next:nowT}; }
      const tcol=totalsDue(nowT); if(tcol){ await runTotals(tcol); return {did:'totals', next:nowT}; }
      const scol=scanReady(nowT); if(scol && !(S.scan[scol].retryAt>nowT)){ await scanPage(scol); return {did:'scan', next:nowT}; }
      return {did:'idle', next:nextWake(nowT), status:status()}; }
    finally{ await flushQuota(); } }
  // an error outside a send or an attempt (a page, the totals, a scan, the inbox) pauses the engine for a growing while instead of failing the step
  function step(){ if(S.stepping) return S.stepping; S.stepping=(async()=>{ try{ const r=await stepOnce(); if(r.did!=='idle') S.stepErrors=0; return r; }
      catch(e){ S.stepErrors=(S.stepErrors||0)+1; S.errorUntil=now()+backoffMs(S.stepErrors); log({t:'step-error', kind:'step', code:e && e.code, error:String(e && e.message || e), next:S.errorUntil}); return {did:'error', next:S.errorUntil, status:status()}; }
      finally{ S.stepping=null; } })(); return S.stepping; }
  async function idle(limit=200){ let r; for(let i=0;i<limit;i++){ r=await step(); if(r.did==='idle') break; } return r; }

  /* ── owner, start, stop (the hook of PR 1; sign-in comes with PR 3) ── */
  async function setOwner(owner){ if(!S.loaded) await load(); const same=S.owner && owner && S.owner.uid===owner.uid && S.owner.env===owner.env;
    await db.tx(['notes','versions','sync'],'readwrite', async t=>{ if(same){ t.put('sync',{k:'owner', ...owner}); return; }
      const epoch={k:'epoch', id:'e'+now().toString(36)+random().toString(36).slice(2,8)}; t.put('sync',epoch);
      for(const pre of ['meta:','seen:','out:','try:','refetch:','purged:','cursor:','quarantine:','scan:']) for(const r of await t.range('sync',pre,pre+'\uffff')) t.del('sync',r.k);
      if(owner){ t.put('sync',{k:'owner', ...owner}); for(const n of await t.range('notes','','\uffff')){ if(isEmpty(n)) continue; t.put('sync',{k:K.out('n',n.id), tries:0, next:0}); } for(const v of await t.range('versions','','\uffff')){ if(v.keep && v.name) t.put('sync',{k:K.out('v',v.id), tries:0, next:0}); } }
      else { t.del('sync','owner'); for(const n of await t.range('notes','','\uffff')) t.del('notes',n.id); for(const v of await t.range('versions','','\uffff')) t.del('versions',v.id); for(const b of await t.range('blobs',[''],[ '\uffff','\uffff'])) t.del('blobs',[b.note,b.h]); }
      S.loaded=false; });
    if(same){ if(S.started) connectCloud(); return; }   // the same owner again (every start of a signed-in device): the memory stays as loaded from the store, the cursor included, so nothing is read anew
    resetMemory({owner:true}); await load(); if(S.started) connectCloud(); }
  function connectCloud(){ if(!S.cloud || !S.owner) return; if(S.paused){ S.listenPaused=true; return; } startCatchup('notes'); S.catchup.versions=null; S.catchupDone.versions=false; startListener('notes'); startListener('versions'); }
  async function start(o={}){ if(!S.loaded) await load(); if(o.cloud!==undefined) S.cloud=o.cloud; S.started=true;
    if(S.owner && S.cloud){ try{ await db.tx(['sync'],'readwrite', async t=>{ if(!(await t.get('sync','format'))) t.put('sync',{k:'format', v:3}); }); }catch(_){} if(!S.started) return; connectCloud(); } }   // stopped while the record was written (the tab lost the lead): no listeners
  function stop(){ S.started=false; stopListeners(); }   // the snapshot flags go with the listeners: a step still in flight must not skip a server read on a dead listener
  function online(on){ const was=S.online; S.online=!!on; if(on && !was) reconnect(); }
  function reconnect(){ if(!S.started || !S.cloud || !S.owner) return; if(S.paused){ stopListeners(); S.listenPaused=true; emit(deps.wake); return; }   // the day's budget is spent: nothing is read until the next day, whatever the connection does
    S.lastReconnect=now(); startListener('notes'); startListener('versions'); startCatchup('notes'); emit(deps.wake); }

  /* ── «forever» with an owner, an automatic tombstone, import (§4.4, §4.7, §4.14) ── */
  async function purgeLocal(id){ if(!S.loaded) await load(); try{ return await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const C=await t.get('notes',id); if(!C) return {ok:false, code:'missing'};
      const meta=await getMeta(t,'n',id), seen=await t.get('sync',K.seen('n',id)), tr=await t.get('sync',K.tr('n',id)), copies=(await versionsOf(t,id)).filter(v=>v.reason==='copy').length;
      await deleteRecord(t,id); after(()=>{ S.bytes.delete(id); S.sends.delete(id); S.err.delete(id); });
      const never=!S.owner || (!meta.base && !seen && !tr && S.everCaughtUp);   // nothing in the cloud to tombstone (decision 2 of the implementation plan)
      if(never){ t.del('sync',K.meta('n',id)); dropJob(t,id,after); dropRefetch(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return {ok:true, tomb:false, copies}; }
      meta.lrev=(meta.lrev||0)+1; putMeta(t,meta,after); const prev=await t.get('sync',K.purged(id)); const p={k:K.purged(id), rev:0}; if(prev && prev.revivedAs) p.revivedAs=prev.revivedAs; t.put('sync',p);
      setJob(t,id,{k:K.out('n',id), tries:0, next:0, tomb:true},after); dropRefetch(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return {ok:true, tomb:true, copies}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  async function tombstoneAuto(id){ if(!S.loaded) await load(); return tx(['notes','sync'], async(t,after)=>{ const C=await t.get('notes',id); if(!C || !C.deleted) return {ok:false}; const job=await t.get('sync',K.out('n',id)); if(job && !job.tomb) return {ok:false, code:'busy'}; setJob(t,id,{k:K.out('n',id), tries:0, next:0, tomb:true, auto:true},after); return {ok:true}; }); }
  async function countCopies(id){ if(!S.loaded) await load(); return db.tx(['versions'],'readonly', async t=>(await t.byNote('versions',id)).filter(v=>v.reason==='copy').length); }
  async function importOne(t, raw, body, after){ const id=String(raw.id), tt=now();
    if(await t.get('sync',K.purged(id))){ const target=await revive(t, id, body, {t:tt}, after); return {ok:true, kind:'revived', id:target}; }
    const C=await t.get('notes',id), meta=await getMeta(t,'n',id);
    if(C && !(body.updated>C.updated)) return {ok:true, kind:'skipped', id, note:C};
    if(C && sameDoc(body,C)) return {ok:true, kind:'same', id, note:C};
    const res=await putNote(t, id, body, meta, {t:tt}, after); await ensureJob(t, id, body, meta, after);
    return {ok:true, kind:C? 'updated' : 'added', id, note:res.note, lrev:res.lrev}; }
  async function importNote(raw){ if(!S.loaded) await load(); const nn=normNote(raw, deps); if(nn.bad) return {ok:false, code:'shape'};
    try{ return await tx(['notes','sync','versions','blobs'], async(t,after)=>importOne(t, raw, nn.note, after)); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  // several records in one transaction: a fallback copy and the backup of the record it displaces go in together or not at all. `src` is the
  // list of records, or a function of the stored record of `o.id` (null when there is none) that returns the list: it decides inside the
  // transaction, over the record as it is at that moment, so no write can slip in between the look and the move
  async function importMany(src, o={}){ if(!S.loaded) await load();
    try{ return await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const raws=typeof src==='function'? src(o.id? ((await t.get('notes',o.id))||null) : null) : src;
      if(!Array.isArray(raws)) return {ok:false, code:'shape'}; const norm=raws.map(r=>normNote(r, deps)); if(norm.some(n=>n.bad)) return {ok:false, code:'shape'};
      const results=[]; for(let i=0;i<raws.length;i++) results.push(await importOne(t, raws[i], norm[i].note, after)); return {ok:true, results}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  async function state(id){ if(!S.loaded) await load(); return db.tx(['notes','sync','versions'],'readonly', async t=>({note:await t.get('notes',id), meta:await t.get('sync',K.meta('n',id)), job:await t.get('sync',K.out('n',id)), tr:await t.get('sync',K.tr('n',id)), seen:await t.get('sync',K.seen('n',id)), purged:await t.get('sync',K.purged(id)), refetch:await t.get('sync',K.refetch('n',id)), quarantine:await t.get('sync',K.quarantine('n',id)), versions:await t.byNote('versions',id)})); }
  async function seenAll(){ if(!S.loaded) await load(); return db.tx(['sync'],'readonly', async t=>({notes:await t.range('sync','seen:n:','seen:n:\uffff'), versions:await t.range('sync','seen:v:','seen:v:\uffff')})); }
  async function lrevOf(ids){ if(!S.loaded) await load(); return db.tx(['sync'],'readonly', async t=>{ const out={}; for(const m of await t.range('sync','meta:n:','meta:n:\uffff')) out[m.k.slice(7)]=m.lrev||0; return out; }); }

  return {start, stop, step, idle, status, online, reconnect, setOwner, reload, checkOwner, nudge, writeLocal, purgeLocal, tombstoneAuto, countCopies, importNote, importMany, state, seenAll, lrevOf, get devId(){ return devId; }, get devName(){ return devName; },
    typed:id=>{ S.typed.set(id,now()); if(S.err.get(id)==='loop'){ tx(['sync'], async(t,after)=>{ const meta=await getMeta(t,'n',id); if(meta.err==='loop'){ delete meta.err; putMeta(t,meta,after); } }).catch(()=>{}); } },
    left:id=>{ S.left.add(id); emit(deps.wake); }, setCloud:c=>{ S.cloud=c; if(S.started) connectCloud(); },
    get log(){ return LOG; }, get owner(){ return S.owner; }, get epoch(){ return S.epoch; }, hasOwner:()=>!!S.owner, jobs:()=>[...S.jobs.keys()], tries:()=>[...S.tries.keys()], inboxSize:()=>S.inbox.length, _S:S};
}

return {DOC_MAX, V_BODY_MAX, LIM, SERVICE, hashOf, canon, cjson, hashDoc, noteBody, noUpdated, sameDoc, docBytes, cmpSrv, clearlyNewer, validSrv, normBlock, normBlocks, normNote, normVersion,
  keyOf, cmpKey, contentHash, merge3, merge0, moveInto, nextUpdated, placeAgainstSeen, bodyOf, entryOf, manifestOf, sumOf, budgetOf, dayKey, PACE, makeSync};
});
