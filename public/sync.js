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
    if((k==='deleted' || k==='archived' || k==='pinned') && !v) continue;   // absent, 0 or null all mean «not»
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
// a version's name: at most 80 UTF-16 units, as the rules count a string (size(): 40 emoji pass, 41 do not, measured on the emulator), cut between
// code points so a surrogate pair is never split
const cutName=s=>{ let out=''; for(const ch of String(s||'')){ if(out.length+ch.length>LIM.name) break; out+=ch; } return out; };
const KINDS=[undefined,'code','area'];
// one block: false when its shape is wrong; otherwise a cleaned copy (unknown fields pass through)
function normBlock(raw, deps){ if(!isObj(raw)) return false; const b={...raw};
  if(!(typeof b.id==='string') || !b.id.length || b.id.length>LIM.id) return false;
  if(!isNum(b.row)) return false;
  // col 0 is a default the canonical form drops, like fx 0: a block in an area's first column comes from the cloud without col
  if(b.parent!==undefined){ if(b.col===undefined || b.col===null) b.col=0; if(!isStr(b.parent,LIM.id) || !b.parent.length || !isNum(b.col)) return false; delete b.fx; } else { if(b.fx===undefined || b.fx===null) b.fx=0; if(!isNum(b.fx)) return false; delete b.col; }
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
  for(const k of ['deleted','archived','pinned']){ const v=raw[k]; if(v===undefined || v===null || v===0 || v===false) continue; if(!isNum(v) || v<=0) return {bad:k}; note[k]=v; }
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
const NOTE_FIELDS=['title','deleted','archived','revived'], SOFT_FIELDS=['pinned'], MERGE_FIELDS=[...NOTE_FIELDS, ...SOFT_FIELDS];   // a soft field changed differently on both sides goes by the key and makes no conflict copy
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
  for(const f of MERGE_FIELDS){ const bv=vjson(base[f]), lv=vjson(L[f]), rv=vjson(R[f]);
    const v = (lv===bv && rv===bv)? L[f] : lv===bv? R[f] : rv===bv? L[f] : lv===rv? L[f] : SOFT_FIELDS.includes(f)? (lWins? L : R)[f] : (lost[lWins? 'remote' : 'local']=true, (lWins? L : R)[f]);
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
const unsoft=d=>{ const o={...d}; for(const f of SOFT_FIELDS) delete o[f]; return o; };
function merge0(L, R, ctx={}){ if(sameDoc(L,R)) return {note:noteBody(R), copies:[], lost:{local:false,remote:false}, trace:[], same:true};
  const lWins=cmpKey(keyOf(L,ctx.dev), keyOf(R,ctx.dev))>=0, W=lWins? L : R, trace=[];
  if(sameDoc(unsoft(L), unsoft(R))){ const res=unsoft(noteBody(R)); for(const f of SOFT_FIELDS) if(W[f]) res[f]=W[f]; return finishMerge(res, L, R, ctx, {local:false, remote:false}, trace); }   // only soft fields differ: the key decides, no conflict copies
  const res={};
  for(const f of ['title','archived','revived',...SOFT_FIELDS]) if(W[f]!==undefined) res[f]=W[f];
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
const PACE={dev:3000, note:5000, big:30000, huge:120000, slow:30000, retryMin:2000, retryMax:300000, totalsEvery:3600000, totalsAfterMatch:900000, totalsRecheck:300000, waiting:30000, loopN:30, loopWindow:300000,
  purgeAfter:30*864e5, purgeEvery:3600000, purgeWait:864e5, reauthAfter:3};   // the automatic purge (§4.8): the trash term by the device clock, how often candidates are looked for, how long a refused early purge waits; reauth: unauthenticated answers in a row
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit'});
const dayKey=t=>dayFmt.format(new Date(t));
const dayClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles', hourCycle:'h23', hour:'2-digit', minute:'2-digit', second:'2-digit'});
// the first moment of the next Pacific day (the budget counts anew then); a DST change is covered by the key check
const nextDay=t=>{ const f={}; for(const x of dayClock.formatToParts(new Date(t))) f[x.type]=+x.value; let n=t+((23-f.hour)*3600+(59-f.minute)*60+(60-f.second))*1000-(t%1000); for(let i=0;i<3 && dayKey(n)===dayKey(t);i++) n+=3600000; return n; };
const bytesOf=str=>new TextEncoder().encode(str).length;
const isNetErr=code=>code==='unavailable' || code==='deadline-exceeded' || code==='aborted' || code==='unknown' || code==='unauthenticated';   // unauthenticated: the token is being refreshed, or the sign-in is gone (then the driver stops the engine); retried like a network error
const errOf=e=>{ const code=(e && e.code) || 'unavailable'; return {code: ['unavailable','deadline-exceeded','permission-denied','resource-exhausted','too-large','invalid','failed-precondition','aborted','unauthenticated'].includes(code)? (code==='aborted'? 'unavailable' : code) : 'unavailable', message: e && e.message || String(e)}; };
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
    waiting:new Map(), netBusy:false, stepping:null, typed:new Map(), left:new Set(), lastStatus:null, retryAt:{notes:0, versions:0}, lastReconnect:0, rejected:new Set(),
    readOk:false, unverified:false, reauth:false, unauth:0, lastPurge:0,
    vjobs:new Map(), vtries:new Map(), vrefetch:new Set(), verr:new Map(), vblocked:new Set(), vrejected:new Set(), vlastDelivered:new Map(), vjudge:false};   // the version queue (§4.9): its own maps; vblocked: creates and renames waiting for their note to reach the cloud   // access (§4.11, §4.18): the first read since connecting failed on the network (unverified) or the sign-in must be repeated (reauth)
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
      for(const m of await t.range('sync','meta:v:','meta:v:\uffff')){ if(m.wait) addWaiting(m.wait); if(m.err) S.verr.set(m.k.slice(7), m.err); }
      await loadV(t);
      for(const col of ['notes','versions']){ const sc=await t.get('sync',K.scan(col)); if(sc) S.scan[col]=sc; } }); S.everLoaded=true; }catch(e){ S.loaded=false; throw e; } }
  // the version queue from the store; a job without a meta (written by code before 4a) asks for the migration pass (§4.9)
  async function loadV(t){ S.vjobs.clear(); S.vtries.clear(); S.vrefetch.clear();
    for(const j of await t.range('sync','out:v:','out:v:\uffff')){ const id=j.k.slice(6); S.vjobs.set(id, j); if(!j.tomb && !(await t.get('sync',K.meta('v',id)))) S.vjudge=true; }
    for(const r of await t.range('sync','try:v:','try:v:\uffff')) S.vtries.set(r.k.slice(6), r); for(const r of await t.range('sync','refetch:v:','refetch:v:\uffff')) S.vrefetch.add(r.k.slice(10)); }
  function addWaiting(doc){ const list=S.waiting.get(doc.note)||[]; const i=list.findIndex(d=>d.id===doc.id); if(i<0) list.push(doc); else if((doc.rev||0)>=(list[i].rev||0)) list[i]=doc; S.waiting.set(doc.note,list); }   // a later state of the same version replaces the earlier one
  // the job maps are a cache of the store: another runner over the same store (an old leader finishing its step, PR 2) may have added work
  async function reloadQueue(){ S.queueAt=now(); await db.tx(['sync'],'readonly', async t=>{ S.jobs.clear(); S.tries.clear(); S.refetch.clear();
      for(const j of await t.range('sync','out:n:','out:n:\uffff')) S.jobs.set(j.k.slice(6), j); for(const r of await t.range('sync','try:n:','try:n:\uffff')) S.tries.set(r.k.slice(6), r); for(const r of await t.range('sync','refetch:n:','refetch:n:\uffff')) S.refetch.add(r.k.slice(10)); await loadV(t); }); }
  // the memory that describes the owner's data and this engine's run; the device's own state (the quota, the pause) is reset only by reload()
  function resetMemory(o={}){ S.jobs.clear(); S.tries.clear(); S.refetch.clear(); S.err.clear(); S.vjobs.clear(); S.vtries.clear(); S.vrefetch.clear(); S.verr.clear(); S.vblocked.clear(); S.vrejected.clear(); S.vlastDelivered.clear(); S.vjudge=false; S.sends.clear(); S.waiting.clear(); S.lastDelivered.clear(); S.rejected.clear(); S.inbox.length=0;
    S.cursor={notes:null, versions:null}; S.scan={notes:null, versions:null}; S.catchup={notes:null, versions:null}; S.catchupDone={notes:false, versions:false}; S.snapshot={notes:false, versions:false};
    S.readOk=false; S.unverified=false; S.lastPurge=0;
    if(o.owner){ S.everCaughtUp=false; S.denied=false; S.reauth=false; S.unauth=0; S.totals={notes:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}, versions:{pending:true, strikes:0, last:0, lastMatch:0, mismatchAt:0}}; } S.loaded=false; }
  // a tab that becomes the leader (§4.10) starts from the store: the previous leader moved the cursor, resolved attempts and spent the budget while this
  // tab's memory stood still. The pause is reset too, since load() only ever sets it (a budget spent yesterday must not pause a leader of today)
  async function reload(){ const guard=S.everLoaded? {epoch:S.epoch, uid:S.owner? S.owner.uid : null, env:S.owner? S.owner.env : null} : null;   // a tab that waited for the lock must not adopt an owner it never knew
    resetMemory(); S.paused=false; S.listenPaused=false; S.nospace=false; S.sweptOnce=false; S.denied=false; S.reauth=false; S.unauth=0; S.readOk=false; S.unverified=false; S.lastPurge=0; S.errorUntil=0; S.stepErrors=0; S.queueAt=0; S.refetchRetry=0; S.quota=null; S.quotaDirty=false; await load({guard}); }
  const blocked=()=>S.denied || S.reauth;   // nothing talks to the cloud until the access or the sign-in is sorted out (reload() or a new owner clears both)
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
  // o.after: the transaction's after-queue, for the named versions (§4.9): o.own on the device that purges the note, o.never when the note was never in the cloud
  async function deleteRecord(t,id,o={}){ t.del('notes',id); for(const v of await versionsOf(t,id)){ t.del('versions',v.id); if(v.name && v.reason!=='copy' && S.owner && o.after) await vwithNote(t, v, o); } for(const b of await t.blobs(id)) t.del('blobs',[b.note,b.h]); }

  /* ── jobs, tries, marks (cache + store) ── */
  function setJob(t, id, job, after){ t.put('sync',job); after(()=>S.jobs.set(id,job)); }
  function dropJob(t, id, after){ t.del('sync',K.out('n',id)); after(()=>S.jobs.delete(id)); }
  async function ensureJob(t, id, body, meta, after){ if(!S.owner) return; let job=await t.get('sync',K.out('n',id));
    if(!job){ if(body && isEmpty(body) && !meta.base) return; job={k:K.out('n',id), tries:0, next:0}; }
    else if(job.tomb || job.wait){ job={...job}; delete job.tomb; delete job.auto; delete job.wait; }   // any change of the record cancels an automatic tombstone that is not insured yet, and the wait of one the rules refused as early (§4.8)
    setJob(t,id,job,after); }
  function setTry(t, id, tr, after){ t.put('sync',tr); after(()=>S.tries.set(id,tr)); }
  function dropTry(t, id, after){ t.del('sync',K.tr('n',id)); after(()=>S.tries.delete(id)); }
  function setRefetch(t, id, after){ t.put('sync',{k:K.refetch('n',id), at:now()}); after(()=>S.refetch.add(id)); }
  function dropRefetch(t, id, after){ t.del('sync',K.refetch('n',id)); after(()=>S.refetch.delete(id)); }
  function putMeta(t, meta, after){ t.put('sync',meta); const id=meta.k.slice(7);
    if(meta.k.startsWith('meta:n:')) after(()=>{ if(meta.err) S.err.set(id,meta.err); else S.err.delete(id); if(meta.sends) S.sends.set(id,meta.sends); if(meta.base) S.vblocked.clear(); });   // a note that reached the cloud lets its waiting versions go
    else after(()=>{ if(meta.err) S.verr.set(id,meta.err); else S.verr.delete(id); }); }
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
    // a named version that may never have reached the cloud follows too (§4.9 «Revival»): marked, so the server read before its first send decides
    if(S.owner) for(const v of await versionsOf(t,originId)){ if(!v.name || v.reason==='copy') continue; const vm=await getMeta(t,'v',v.id); if(vm.base || vm.gone || await t.get('sync',K.tr('v',v.id)) || await t.get('sync',K.seen('v',v.id))) continue;
      t.put('versions',{...v, note:targetId}); vm.movedFrom=originId; putMeta(t,vm,after); if(!vm.local && !(await t.get('sync',K.out('v',v.id)))) setVJob(t,v.id,vjob(v.id),after); log({t:'vmoved', id:v.id, to:targetId}); }
    if(!passed[0].revivedAs) passed[0].revivedAs=targetId; for(const p of passed) t.put('sync',p);
    after(()=>emit(deps.onChange,{id:targetId, kind:'note', dev:moved.dev, dn:moved.dn})); return targetId; }
  // a tombstone meets a local record: delete, or revive when the copy changed or has conflict copies
  async function tombstoneLocal(t, id, C, meta, doc, after){ const changed=meta.lrev!==meta.baseLrev, copies=C? await hasCopies(t,id) : false;
    const hashes=C? (C.blocks||[]).map(contentHash) : [];
    if(C && (changed || copies)){ const toList=!!(doc.auto && meta.base && meta.base.deleted && !C.deleted); await revive(t, id, noteBody(C), {t:now(), tombRev:doc.rev, toList}, after); log({t:'tombstone', id, changed:true, hashes}); }
    else log({t:'tombstone', id, changed:false, hashes});
    if(C) await deleteRecord(t,id,{after}); t.del('sync',K.meta('n',id)); after(()=>{ S.err.delete(id); S.sends.delete(id); S.bytes.delete(id); });
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
    // a quarantine marked for a recheck (§4.15) keeps its copy until this transaction applies the document; any other goes when a clearly newer one comes
    let q=doc.purged? null : await t.get('sync',K.quarantine('n',id)); const unq=()=>{ t.del('sync',K.quarantine('n',id)); if(meta.err==='damaged'){ delete meta.err; putMeta(t,meta,after); } if(q.recheck) log({t:'unquarantine', id}); q=null; };
    if(q && !q.recheck && (!q.raw || !q.raw.srv || clearlyNewer(doc.srv, q.raw.srv))) unq();
    if(meta.base && doc.rev===meta.base.rev && !recreated && !(q && q.recheck)){ let ch=false; if(!meta.base.srv && doc.srv){ meta.base.srv=doc.srv; ch=true; } if(doc.tsrv && !meta.base.tsrv){ meta.base.tsrv=doc.tsrv; ch=true; } if(ch) putMeta(t,meta,after); return 'done'; }
    if(tr){ if(doc.rcpt && doc.rcpt[devId]===tr.op && doc.rev===tr.expect+1){ await finishCore(t, id, tr, {kind:'accepted', rev:doc.rev, srv:doc.srv, echo:doc}, after); return 'done'; } setRefetch(t,id,after); return 'done'; }
    if(doc.purged){   // a tombstone
      if(!C && purgedRec){ if(doc.rev>(purgedRec.rev||0)){ purgedRec.rev=doc.rev; t.put('sync',purgedRec); } if(job && job.tomb) dropJob(t,id,after); if(await t.get('sync',K.meta('n',id))) t.del('sync',K.meta('n',id)); return 'done'; }   // the echo of an own tombstone, or another device's after ours
      if(!C){ t.put('sync',{k:K.purged(id), rev:doc.rev}); return 'done'; }   // never seen here
      if(job && job.tomb && job.auto && sameDoc(C, meta.base||{})){ log({t:'tombstone', id, changed:false, hashes:(C.blocks||[]).map(contentHash)}); await deleteRecord(t,id,{after}); t.del('sync',K.meta('n',id)); t.put('sync',{k:K.purged(id), rev:doc.rev}); dropJob(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return 'done'; }
      await tombstoneLocal(t, id, C, meta, doc, after); return 'done'; }
    const nn=normNote(doc, deps); if(nn.bad){ quarantine(t,'n',id,doc,'shape',{rev:doc.rev, srv:doc.srv},after); meta.err='damaged'; putMeta(t,meta,after); return 'damaged'; }
    if(q && q.recheck) unq();   // every branch below applies the document in this transaction
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
  async function bumpCursor(t, col, last, after){ const stored=await t.get('sync',K.cursor(col)), prev=stored? {srv:stored.srv, id:stored.id} : null, best=cursorMax(prev, last); if(best!==prev) t.put('sync',{...(stored||{}), k:K.cursor(col), ...best}); after(()=>{ S.cursor[col]=cursorMax(S.cursor[col], best); }); }
  async function applyIncoming(col, doc, source){ if(col==='versions') return applyVersionDoc(doc, source);
    try{ const r=await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const res=await applyNote(t, doc, source, after); if(source==='delivery' && res!=='skipped') await bumpCursor(t,'notes',{srv:doc.srv, id:doc.id},after); return res; });
      if(source==='delivery') S.lastDelivered.set(doc.id, doc.rev);
      const w=S.waiting.get(doc.id); if(w && w.length && r!=='skipped'){ S.waiting.delete(doc.id); for(const d of w) S.inbox.unshift({col:'versions', doc:d, source:'wait'}); }
      return r; }
    catch(e){ if(e.code==='epoch') return 'epoch'; if(/Quota/i.test(e.name||'') || e.code==='quota') return (await quotaTrouble(doc.id))? 'nospace' : 'error'; log({t:'apply-error', id:doc.id, error:String(e)}); try{ await tx(['sync'], async(t,after)=>{ setRefetch(t,doc.id,after); }); }catch(_){} return 'error'; } }
  // the first document without space: thin the history once and read the document again later, the page goes on; the second: no space, receiving stops (§4.6)
  // o.send: met on the send path (a merge or a collision in the prepare step): the job retries by itself, so no refetch mark is set
  async function quotaTrouble(id, c='n', o={}){ if(!S.sweptOnce){ S.sweptOnce=true; log({t:'quota', col:c, id}); if(deps.sweep){ try{ await deps.sweep(); }catch(_){} } if(!o.send){ try{ await tx(['sync'], async(t,after)=>{ if(c==='v') setVRefetch(t,id,after); else setRefetch(t,id,after); }); }catch(_){} } return false; }
    S.nospace=true; S.nospaceAt=now(); log({t:'nospace', id}); setStatus('nospace'); return true; }
  /* ── sending (§4.5) ── */
  // every cloud call: `read` marks the reads, whose refusal means no access (§4.11 step 2: the rules refuse by uid, so a refused read is the
  // account, not the document); a refused write is judged in runTry. The first read since connecting that fails on the network, before any
  // read succeeded, is «could not check» (unverified); `reauthAfter` unauthenticated answers in a row mean the sign-in must be repeated
  async function net(fn, o={}){ if(!S.online) return {error:{code:'unavailable', message:'offline'}};
    try{ const value=await fn(); S.unauth=0; if(o.read){ S.readOk=true; if(S.unverified){ S.unverified=false; log({t:'verified'}); } } return {value}; }
    catch(e){ const error=errOf(e);
      if(error.code==='unauthenticated'){ S.unauth++; if(S.unauth>=pace.reauthAfter && !S.reauth){ S.reauth=true; log({t:'reauth'}); setStatus('reauth'); } }
      else if(error.code==='permission-denied' && o.read){ if(!S.denied){ S.denied=true; log({t:'denied', kind:o.kind||'read'}); setStatus('denied'); } }
      else if(o.read && isNetErr(error.code) && !S.readOk && !S.unverified){ S.unverified=true; log({t:'unverified', code:error.code}); setStatus('unverified'); }
      return {error}; } }
  // the retry time is set in memory first: when storage itself fails, the job must still wait instead of being picked again at once
  async function backoff(id, error){ const job=S.jobs.get(id); if(!job) return; const j={...job, tries:(job.tries||0)+1, err:error.code}; j.next=now()+backoffMs(j.tries); log({t:'retry', id, code:error.code, next:j.next}); S.jobs.set(id,j);
    try{ await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.out('n',id)); if(cur) setJob(t,id,{...cur, tries:j.tries, next:j.next, err:j.err},after); }); }catch(_){} }   // only the retry fields: another runner may have changed the rest
  // a storage or program error inside one send or attempt: logged, the job backs off, the step goes on (§4.5: nothing unsecured reaches the cloud)
  // no space on the send path goes the way receiving does (§4.6): one sweep and one more try, then «no space» for an hour; the job stays
  const isQuota=e=>!!e && (/Quota/i.test(e.name||'') || e.code==='quota');
  async function vguarded(kind, id, fn){ try{ await fn(); }catch(e){ if(e && e.code==='epoch') return; log({t:'step-error', kind, col:'v', id, code:e && e.code, error:String(e && e.message || e)}); if(isQuota(e) && await quotaTrouble(id,'v',{send:true})) return; await vbackoff(id, {code:'storage'}); } }
  async function guarded(kind, id, fn){ try{ await fn(); }catch(e){ if(e && e.code==='epoch') return; log({t:'step-error', kind, id, code:e && e.code, error:String(e && e.message || e)}); if(isQuota(e) && await quotaTrouble(id,'n',{send:true})) return; await backoff(id, {code:'storage'}); } }
  function pickJob(nowT){ if(S.netBusy || S.paused || !S.online || blocked()) return null;
    for(const [id,job] of S.jobs){ if(S.tries.has(id)) continue; if((job.next||0)>nowT+pace.retryMax){ job.next=nowT; } if((job.wait||0)>nowT+pace.purgeWait+pace.retryMax){ job.wait=0; }   // a retry or a wait past its longest span is a clock set back
      if((job.next||0)>nowT || (job.wait||0)>nowT) continue; const err=S.err.get(id); if(err && (!job.tomb || err==='invalid' || err==='receipts')) continue; if(sendDelay(id,nowT)>nowT) continue; return id; } return null; }   // a tombstone still goes over a note too large or looping, not over one the rules or the receipt limit refused
  async function runSend(id){ S.netBusy=true; try{ for(let round=0; round<4; round++){
      const st=await db.tx(['notes','sync'],'readonly', async t=>({C:await t.get('notes',id), meta:await getMeta(t,'n',id), job:await t.get('sync',K.out('n',id)), tr:await t.get('sync',K.tr('n',id))}));
      if(!st.job){ S.jobs.delete(id); log({t:'send-nojob', id}); return; } if(st.tr){ await runTry(id); return; }
      const base=st.meta.base; let R;
      // the read is skipped only while the listener's last delivery for the note is the base; after a rejection the document is read (§4.5 step 2)
      if(S.snapshot.notes && base && S.lastDelivered.get(id)===base.rev && !S.rejected.has(id)) R=base; else { const got=await net(()=>S.cloud.get('notes',id), {read:true, kind:'get'}); if(got.error){ await backoff(id, got.error); return; } countRead(1); R=got.value; if(R && !R.id) R={...R, id}; S.rejected.delete(id); }
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
  // the receipt limit (§4.16): 200 devices over a document's lifetime; a device without a receipt there cannot change the document
  const atLimit=D=>!!(D && D.rcpt && !(devId in D.rcpt) && Object.keys(D.rcpt).length>=200);
  async function runTry(id){ const tr=S.tries.get(id); if(!tr || !S.online){ log({t:'try-skip', id, has:!!tr, online:S.online}); return; } S.netBusy=true; try{
      const res=await net(()=>S.cloud.txn('notes', id, D=>{ if(D && D.rcpt && D.rcpt[devId]===tr.op) return null; if((D? D.rev : 0)!==tr.expect) return null; if(atLimit(D)) return null; const w={...tr.result, v:1, rev:tr.expect+1, op:tr.op, dev:devId, rcpt:{...(D && D.rcpt || {}), [devId]:tr.op}}; if(devName) w.dn=devName; return w; }));
      if(res.error){ const code=res.error.code; if(isNetErr(code)){ await backoff(id, res.error); return; } if(code==='permission-denied'){ await refusedWrite(id, tr); return; } if(code==='resource-exhausted'){ pauseDay(); return; }
        await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.tr('n',id)); if(!cur || cur.op!==tr.op) return; dropTry(t,id,after); const meta=await getMeta(t,'n',id); meta.err=code==='too-large'? 'size' : 'invalid'; putMeta(t,meta,after); log({t:'rejected-write', id, code}); }); return; }
      const {read:D, wrote}=res.value; countRead(1); if(wrote) countWrite(1);
      // accepted by the receipt: the own write is rev expect+1; the document read may already be later (another device wrote on top) and is then applied as a server read
      let outcome; if(wrote) outcome={kind:'accepted', rev:tr.expect+1, srv:null}; else if(D && D.rcpt && D.rcpt[devId]===tr.op) outcome=D.rev===tr.expect+1? {kind:'accepted', rev:D.rev, srv:D.srv||null, echo:D} : {kind:'accepted', rev:tr.expect+1, srv:null, later:{...D, id}}; else if(D && D.rev>tr.expect) outcome={kind:'rejected'}; else if(D && D.rev===tr.expect && atLimit(D)) outcome={kind:'receipts'}; else outcome={kind:'invariant', D};
      await tx(['notes','sync','versions','blobs'], async(t,after)=>finishCore(t, id, tr, outcome, after)); }
    finally{ S.netBusy=false; } }
  // the rules refused the write (every refusal is permission-denied, §4.16). Nothing was written, so the attempt is resolved; what it means:
  // an automatic tombstone → the server says the 30 days are not over by its clock (the device clock runs ahead): the job waits a day and
  // is tried again (§4.8); anything else → one server read of the document tells: a refused read is the account (net() sets denied, the
  // attempt stays for the next sign-in); a read lost on the network leaves the decision to the next attempt; a document whose revision is
  // no longer the attempt's base means another device wrote first and the rules judged the stale write against the new state (a backend
  // may report that instead of retrying the transaction), so the attempt is rejected as in step 4 and the refusal says nothing about the
  // content; the same revision means this document is refused for what it is: invalid, the rest go on
  async function refusedWrite(id, tr){ const same=async t=>{ const cur=await t.get('sync',K.tr('n',id)); return !!cur && cur.op===tr.op; };
    if(tr.result && tr.result.purged && tr.result.auto){ await tx(['sync'], async(t,after)=>{ if(!(await same(t))) return; dropTry(t,id,after); const job=await t.get('sync',K.out('n',id)), meta=await getMeta(t,'n',id);
        if(job && job.tomb && job.auto && meta.lrev===tr.sentLrev){ setJob(t,id,{...job, tries:0, next:0, wait:now()+pace.purgeWait},after); log({t:'purge-early', id}); }   // still the same automatic tombstone: it waits for the server's day
        else if(job){ setJob(t,id,{...job, tries:0, next:0},after); log({t:'purge-early', id, stale:true}); } }); return; }   // the note was restored or edited meanwhile: the job is an ordinary send now and goes at once
    const got=await net(()=>S.cloud.get('notes',id), {read:true, kind:'check'});
    if(got.error){ if(S.denied) return; await tx(['sync'], async(t,after)=>{ if(await same(t)) dropTry(t,id,after); }); await backoff(id, got.error); return; }
    countRead(1); const R=got.value? {...got.value, id} : null;
    await tx(['notes','sync','versions','blobs'], async(t,after)=>{ if(!(await same(t))) return;
      if((R? R.rev : 0)!==tr.expect){ log({t:'refused-moved', id, expect:tr.expect, rev:R? R.rev : null}); return finishCore(t, id, tr, R && R.rev>tr.expect? {kind:'rejected'} : {kind:'invariant', D:R}, after); }
      dropTry(t,id,after); const meta=await getMeta(t,'n',id), job=await t.get('sync',K.out('n',id));
      if(meta.lrev!==tr.sentLrev){ log({t:'rejected-write', id, code:'permission-denied', stale:true}); if(job) setJob(t,id,{...job, tries:0, next:0},after); return; }   // the refused content was edited meanwhile: the newer record goes as a new attempt, unmarked
      log({t:'rejected-write', id, code:'permission-denied'}); meta.err='invalid'; putMeta(t,meta,after); }); }
  // §4.5 step 5: the finish, only if the attempt is still the same one
  async function finishCore(t, id, tr, outcome, after){ const cur=await t.get('sync',K.tr('n',id)); if(!cur || cur.op!==tr.op){ after(()=>{ if(S.tries.get(id)===tr) S.tries.delete(id); S.queueAt=0; }); return 'stale'; }   // another runner finished it (§4.5 step 5): this memory forgets the attempt and reads the queue again
    const meta=await getMeta(t,'n',id), job=await t.get('sync',K.out('n',id)), Srec=await t.get('notes',id), seen=(await t.get('sync',K.seen('n',id)))||null;
    if(outcome.kind==='accepted'){ const rev=outcome.rev, after_=meta.base? meta.base.srv||null : null; const sends=(meta.sends||[]).filter(x=>x>now()-pace.loopWindow); sends.push(now()); meta.sends=sends;
      if(tr.result && tr.result.purged){ setSeen(t,'n',id,{rev:Math.max(rev, seen? seen.rev : 0), srv:outcome.srv, after:after_});
        if(meta.lrev!==tr.sentLrev && Srec){ const toList=!!(tr.result.auto && meta.base && meta.base.deleted && !Srec.deleted); await revive(t, id, noteBody(Srec), {t:now(), tombRev:rev, toList}, after); log({t:'tombstone', id, changed:true, own:true}); }
        const p=(await t.get('sync',K.purged(id)))||{k:K.purged(id), rev:0}; p.rev=Math.max(p.rev||0, rev);   // read after the revival: it may have pointed the registry at the revived note
        if(Srec) await deleteRecord(t,id,{after, own:true}); t.put('sync',p); t.del('sync',K.meta('n',id)); after(()=>{ S.err.delete(id); S.sends.delete(id); S.bytes.delete(id); }); dropJob(t,id,after); dropTry(t,id,after); log({t:'purged', id, rev}); after(()=>emit(deps.onChange,{id, kind:'purged'})); return 'done'; }
      const nb={...tr.result, rev, srv:outcome.srv||null, dev:devId, op:tr.op, v:1}; if(devName) nb.dn=devName; if(meta.base && meta.base.tsrv && ((meta.base.deleted||0)===(tr.result.deleted||0))) nb.tsrv=meta.base.tsrv;
      if(outcome.echo){ nb.rcpt=outcome.echo.rcpt; nb.tsrv=outcome.echo.tsrv; } else nb.rcpt={...(meta.base && meta.base.rcpt || {}), [devId]:tr.op};
      if(!meta.base || rev>meta.base.rev) meta.base=nb;
      setSeen(t,'n',id,{rev:Math.max(rev, seen? seen.rev : 0), srv:outcome.srv, after:after_});
      if(meta.lrev===tr.sentLrev){ meta.baseLrev=meta.lrev; dropJob(t,id,after); } else if(job){ setJob(t,id,{...job, tries:0, next:0},after); }
      if(sends.length>pace.loopN && !(S.typed.get(id)>now()-pace.loopWindow)){ meta.err='loop'; log({t:'loop', id}); }
      putMeta(t,meta,after); dropTry(t,id,after); log({t:'accepted', id, rev}); if(outcome.later) return applyNote(t, outcome.later, 'server', after); return 'done'; }
    if(outcome.kind==='rejected'){ dropTry(t,id,after); if(job) setJob(t,id,{...job, tries:0, next:0},after); after(()=>S.rejected.add(id)); log({t:'rejected', id, expect:tr.expect}); return 'done'; }
    if(outcome.kind==='receipts'){ dropTry(t,id,after); meta.err='receipts'; putMeta(t,meta,after); log({t:'receipts', id}); after(()=>emit(deps.onChange,{id, kind:'receipts'})); return 'done'; }   // the job stays, blocked until a copy of the note takes the text (§4.16)
    // an invariant violation: a resolved outcome (§4.5 step 4)
    dropTry(t,id,after); const D=outcome.D; log({t:'invariant', id, kind:D? 'older' : 'vanished', rev:D? D.rev : null});
    if(!D){ meta.base=null; meta.baseLrev=0; putMeta(t,meta,after); t.del('sync',K.seen('n',id)); if(job && job.tomb) dropJob(t,id,after); return 'done'; }
    return applyNote(t, {...D, id}, 'server', after); }

  /* ── named versions (§4.9, PR 4a): local operations, the queue, sending and receiving ───────────────────────────────────────────
     The version queue lives beside the note queue with its own maps and keys (out:v:, try:v:, refetch:v:), so the note paths stay as
     they were. Only named versions sync; automatic records and conflict copies stay on the device. Deletion beats renaming; a deleted
     version never comes back (a tombstone base, a tombstone job or attempt, or `gone` for a deletion that left nothing in the cloud). */
  const VMARGIN=512+200*100;   // the stamp and room for 200 receipts: a version that fits now still fits after renames and more devices (§4.9 «big»)
  const newOp=()=>'o'+now().toString(36)+random().toString(36).slice(2,8);
  function setVJob(t, id, job, after){ t.put('sync',job); after(()=>{ S.vjobs.set(id,job); S.vblocked.delete(id); }); }
  function dropVJob(t, id, after){ t.del('sync',K.out('v',id)); after(()=>{ S.vjobs.delete(id); S.vblocked.delete(id); }); }
  const vjob=(id, o={})=>({k:K.out('v',id), tries:0, next:0, ...o});
  function setVTry(t, id, tr, after){ t.put('sync',tr); after(()=>S.vtries.set(id,tr)); }
  function dropVTry(t, id, after){ t.del('sync',K.tr('v',id)); after(()=>S.vtries.delete(id)); }
  function setVRefetch(t, id, after){ t.put('sync',{k:K.refetch('v',id), at:now()}); after(()=>S.vrefetch.add(id)); }
  function dropVRefetch(t, id, after){ t.del('sync',K.refetch('v',id)); after(()=>S.vrefetch.delete(id)); }
  const vdone=async t=>!!((await t.get('sync',K.cursor('versions')))||{}).done;   // the first catch-up of versions for this owner has ended (§4.9, §4.18)
  // the cloud document (§4.9): with a live base the snapshot is the cloud's own, untouched; only a create builds it from the record
  function vwire(rec, base){ if(base && !base.deleted) return {note:base.note, t:base.t, name:rec? rec.name : base.name, title:base.title, blocks:base.blocks};
    return {note:rec.note, t:rec.t, name:rec.name, title:rec.title||'', blocks:(rec.blocks||[]).map(e=>{ const x={...e}; delete x.h; if(x.r!==1) delete x.r; return x; })}; }
  // local-only (§4.9): decided once, since a snapshot never changes; the name is not part of it (cut or checked when it is set)
  function vlocalKind(rec){ const w=vwire(rec,null);
    if(!isStr(w.note,LIM.id) || !w.note.length || !isNum(w.t) || !isStr(w.title,LIM.title) || !Array.isArray(w.blocks) || w.blocks.length>LIM.blocks) return 'shape';
    if(w.blocks.some(b=>typeof b.s!=='string')) return 'partial';
    if(docBytes({...w, name:'x'.repeat(240)})+VMARGIN>DOC_MAX) return 'big';   // 80 UTF-16 units take at most 240 bytes in UTF-8
    return null; }
  // a legacy named record (name only, bodies in blobs) gets its bodies inline and keep/inline; a body that is really gone stays missing
  async function vinline(t, rec){ let ch=false; const blocks=[];
    for(const e of rec.blocks||[]){ if(typeof e.s==='string' || !e.h){ blocks.push(e); continue; } const b=await t.get('blobs',[rec.note,e.h]); if(b && typeof b.s==='string'){ const x={...e, s:b.s}; if(b.r) x.r=1; blocks.push(x); ch=true; } else blocks.push(e); }
    const out={...rec, blocks}; if(!out.keep){ out.keep=1; ch=true; } if(!out.inline){ out.inline=1; ch=true; } const nm=cutName(out.name); if(nm!==out.name){ out.name=nm; ch=true; }
    return {rec:out, ch}; }
  // the note of a queued version is queued too when nothing would send it (an empty note has no job of its own, §4.9)
  async function vparent(t, note, after){ if(await t.get('sync',K.purged(note))) return; const nm=await getMeta(t,'n',note); if(nm.base && nm.base.rev>=1) return;
    if(await t.get('sync',K.out('n',note)) || !(await t.get('notes',note))) return; setJob(t,note,{k:K.out('n',note), tries:0, next:0},after); if(!nm.lrev){ nm.lrev=1; putMeta(t,nm,after); } }
  // a named record joins the queue: inlined, judged local-only or not, with lrev and a job; o.force: the owner is being set in this very transaction
  async function queueV(t, rec, after, o={}){ if((!S.owner && !o.force) || !rec || !rec.name) return {rec};
    const meta=await getMeta(t,'v',rec.id); if(meta.gone || meta.base || meta.local) return {rec};
    const r=await vinline(t, rec); if(r.ch) t.put('versions', r.rec); rec=r.rec;
    const kind=vlocalKind(rec); if(kind){ meta.local=kind; putMeta(t,meta,after); dropVJob(t,rec.id,after); log({t:'vlocal', id:rec.id, kind}); return {rec, local:kind}; }
    meta.lrev=(meta.lrev||0)+1; putMeta(t,meta,after); if(!(await t.get('sync',K.out('v',rec.id)))) setVJob(t,rec.id,vjob(rec.id),after);
    await vparent(t, rec.note, after); return {rec, queued:true}; }
  // «Видалити версію»: certainly never in the cloud → it goes here and leaves `gone`; otherwise a tombstone job, which reads the cloud first when there is no base
  async function vdeleteLocal(t, rec, after){ const id=rec.id; t.del('versions',id); after(()=>emit(deps.onChange,{id, kind:'version', note:rec.note}));
    if(!S.owner) return {ok:true, cloud:false};
    const meta=await getMeta(t,'v',id), tr=await t.get('sync',K.tr('v',id)), seen=await t.get('sync',K.seen('v',id));
    if(!meta.base && !tr && !seen && await vdone(t)){ dropVJob(t,id,after); putMeta(t,{...defMeta('v',id), gone:true},after); log({t:'vgone', id, local:true}); return {ok:true, cloud:false}; }
    meta.lrev=(meta.lrev||0)+1; if(meta.err==='invalid') delete meta.err; putMeta(t,meta,after); setVJob(t,id,vjob(id,{tomb:true}),after); return {ok:true, cloud:true}; }   // a refusal of the old content says nothing about the tombstone
  // one call for every local operation on a named version, one transaction with the owner check (§4.9): create {rec}, name {id, name}, rename {id, name}, delete {id}
  async function versionLocal(op){ if(!S.loaded) await load();
    try{ return await tx(['notes','versions','blobs','sync'], async(t,after)=>{
      if(op.op==='create'){ const name=cutName(op.rec && op.rec.name); if(!name.trim()) return {ok:false, code:'name'}; if(op.rec.reason==='copy') return {ok:false, code:'copy'}; const rec={...op.rec, name, keep:1, inline:1}; t.put('versions',rec);
        const q=await queueV(t, rec, after); after(()=>emit(deps.onChange,{id:rec.id, kind:'version', note:rec.note})); return {ok:true, rec:q.rec, local:q.local||null}; }
      const rec=await t.get('versions',op.id); if(!rec) return {ok:false, code:'missing'};
      if(op.op==='delete') return vdeleteLocal(t, rec, after);
      if(op.op!=='name' && op.op!=='rename') return {ok:false, code:'op'};
      if(rec.reason==='copy') return {ok:false, code:'copy'};   // a conflict copy is never named: it stays on the device that merged (§2, §4.19)
      const name=String(op.name||''); if(!name.trim() || name.length>LIM.name) return {ok:false, code:'name'};
      const wasNamed=!!rec.name; let nr={...rec, name, keep:1, inline:1}; if(!wasNamed || !rec.keep) nr=(await vinline(t, nr)).rec;   // a shown automatic version becomes named: the bodies the history still has go inside it
      t.put('versions',nr); after(()=>emit(deps.onChange,{id:nr.id, kind:'version', note:nr.note}));
      if(!S.owner) return {ok:true, rec:nr};
      const meta=await getMeta(t,'v',nr.id); if(meta.gone || meta.local) return {ok:true, rec:nr, local:meta.local||null};
      if(meta.base || await t.get('sync',K.tr('v',nr.id)) || await t.get('sync',K.out('v',nr.id))){ meta.lrev=(meta.lrev||0)+1; putMeta(t,meta,after); if(!(await t.get('sync',K.out('v',nr.id)))) setVJob(t,nr.id,vjob(nr.id),after); return {ok:true, rec:nr}; }
      const q=await queueV(t, nr, after); return {ok:true, rec:q.rec, local:q.local||null}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  // the states of a note's named versions for «Історія» (§4.9): cloud | pending | big | partial | shape | error; null without an owner
  async function versionStates(note){ if(!S.loaded) await load(); return db.tx(['versions','sync'],'readonly', async t=>{ const out={};
    for(const v of await versionsOf(t,note)){ if(!v.name) continue; if(!S.owner){ out[v.id]=null; continue; }
      const m=await getMeta(t,'v',v.id), j=await t.get('sync',K.out('v',v.id)), tr=await t.get('sync',K.tr('v',v.id));
      out[v.id]=m.local? m.local : (m.err==='invalid' || m.err==='damaged' || m.err==='receipts')? 'error' : (j || tr)? 'pending' : (m.base && !m.base.deleted)? 'cloud' : 'pending'; }
    return out; }); }
  // the history of an export file (VERSIONS-PLAN 3.8, §4.9 «Import»): records and bodies this device does not have yet, one transaction; a named
  // version deleted here (a tombstone base, a tombstone job or attempt, `gone`) is skipped, so an old export never brings it back; a new one is queued
  async function importHistory(h, noteIds){ if(!S.loaded) await load(); const ids=new Set(noteIds||[]);
    try{ return await tx(['notes','versions','blobs','sync'], async(t,after)=>{ let added=0, size=0, skipped=0; const touched=new Set();
      for(const b of h.blobs||[]){ if(!b || !ids.has(b.note) || typeof b.h!=='string' || typeof b.s!=='string') continue; if(!(await t.get('blobs',[b.note,b.h]))) t.put('blobs',{note:b.note, h:b.h, s:b.s, r:b.r? 1 : 0, z:+b.z||bytesOf(b.s)}); }
      for(const v of h.versions||[]){ if(!v || typeof v.id!=='string' || !ids.has(v.note) || !Array.isArray(v.blocks) || typeof v.sig!=='string') continue; if(await t.get('versions',v.id)) continue;
        if(v.name && v.reason!=='copy' && S.owner){ const m=await getMeta(t,'v',v.id), j=await t.get('sync',K.out('v',v.id)), tr=await t.get('sync',K.tr('v',v.id));
          if(m.gone || (m.base && m.base.deleted) || (j && j.tomb) || (tr && tr.result && tr.result.deleted)){ skipped++; continue; } }
        t.put('versions',v); added++; size+=v.size||0; touched.add(v.note); if(v.name && v.reason!=='copy') await queueV(t, v, after); }
      for(const n of touched) after(()=>emit(deps.onHistory,n)); if(skipped) log({t:'import-vskip', n:skipped}); return {ok:true, added, size, skipped}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  // the migration (§4.9): every named record without a sync decision, also a job written by code before 4a with no meta, is judged once; an orphan job goes
  // o.jobs: only the jobs without a meta (S.vjudge, written by an old tab meanwhile); the full pass over the records runs once per epoch (`vmigrated`)
  async function vmigrate(o={}){ if(!S.owner) return; S.vjudge=false; return tx(['notes','versions','blobs','sync'], async(t,after)=>{ let n=0; const mark=await t.get('sync','vmigrated'), full=!o.jobs && !(mark && mark.epoch===S.epoch);
    if(full){ t.put('sync',{k:'vmigrated', epoch:S.epoch});
    for(const v of await t.range('versions','','\uffff')){ if(!v.name || v.reason==='copy') continue; const m=await t.get('sync',K.meta('v',v.id)); if(m && (m.base || m.local || m.gone || m.lrev)) continue;
      if(await t.get('sync',K.tr('v',v.id))) continue; await queueV(t, v, after); n++; } }
    for(const j of await t.range('sync','out:v:','out:v:\uffff')){ const jm=await t.get('sync',K.meta('v',j.k.slice(6))); if(!j.tomb && !jm){ const v=await t.get('versions',j.k.slice(6)); if(v && v.name && v.reason!=='copy'){ await queueV(t, v, after); n++; continue; } } const id=j.k.slice(6); if(j.tomb || await t.get('versions',id) || await t.get('sync',K.tr('v',id))) continue; const m=await getMeta(t,'v',id); if(m.base || m.held) continue; dropVJob(t,id,after); n++; }
    if(n) log({t:'vmigrate', n}); }); }
  // a named version whose note goes from this device (§4.9 «Receiving»): one with an attempt out is held until the attempt resolves; the
  // device that purges the note tombstones the versions that are or may be in the cloud; a device that only receives the note's tombstone
  // drops what would create or rename and keeps the owner's own tombstone jobs
  async function vwithNote(t, v, o){ const after=o.after, id=v.id, meta=await getMeta(t,'v',id), job=await t.get('sync',K.out('v',id));
    if(await t.get('sync',K.tr('v',id))){ meta.held=v; putMeta(t,meta,after); return; }
    if(job && job.tomb) return;
    if(!o.own){ if(job) dropVJob(t,id,after); return; }
    if(meta.base && !meta.base.deleted){ setVJob(t,id,vjob(id,{tomb:true}),after); return; }
    if(meta.base) return;   // already a tombstone in the cloud
    if(o.never || (!(await t.get('sync',K.seen('v',id))) && await vdone(t))){ if(job) dropVJob(t,id,after); return; }
    setVJob(t,id,vjob(id,{tomb:true}),after); }   // no base, but the cloud may hold it (after setOwner): the tombstone job reads it first

  /* ── receiving a version: one rule for every path (§4.9): the prepare read, the listener, a catch-up page, a refetch, a full pass ── */
  function vrecord(id, v, doc){ const m=manifestOf(v.title, v.blocks), src=new Map(v.blocks.map(b=>[b.id,b])); let size=0;
    const blocks=m.blocks.map(e=>{ const d=src.get(e.id); const body=d.s!==undefined? d.s : bodyOf(d); size+=bytesOf(body); const x={...e, s:body}; if(d.r || (!d.kind && d.html)) x.r=1; return x; });
    const r={id, note:v.note, t:Math.min(v.t, vnow()), w:now(), reason:'manual', name:v.name, keep:1, inline:1, title:v.title, sig:m.sig, blocks, size, sum:sumOf(m,null), dev:doc.dev}; if(doc.dn) r.dn=doc.dn; return r; }   // t clamped as every history record's (vthin, §4.6); the cloud's own t stays in the base
  const vsnap=rec=>cjson({note:rec.note, title:rec.title||'', blocks:(rec.blocks||[]).map(e=>{ const x={...e}; delete x.h; delete x.s; delete x.r; return x; })});
  // the same snapshot: note, title, the entries and every body the local record has (a partial one is compared by the bodies it has); not t, not the name
  function vsameSnap(a, b){ if(vsnap(a)!==vsnap(b)) return false; const B=new Map(b.blocks.map(e=>[e.id,e]));
    for(const e of a.blocks||[]){ if(typeof e.s!=='string') continue; const o=B.get(e.id); if(!o || o.s!==e.s || !!e.r!==!!o.r) return false; } return true; }   // a body is its string and its kind: the same text as rich text and as plain text are two snapshots
  async function applyVersionCore(t, doc, source, after){ const id=doc.id;
    if(source==='wait'){ const w=(await getMeta(t,'v',id)).wait; if(!w) return 'skipped'; doc=w; }   // the note came: the version is applied from its stored latest state, which is what seen holds, so the replay is not a stale server read
    if(!id || !Number.isInteger(doc.rev) || doc.rev<1 || !validSrv(doc.srv) || typeof doc.note!=='string'){ log({t:'malformed', col:'v', id}); return 'skipped'; }
    const seen=await t.get('sync',K.seen('v',id)), place=placeAgainstSeen(doc, seen, source!=='delivery');
    if(place==='stale') return 'skipped';
    setSeen(t,'v',id,{rev:doc.rev, srv:doc.srv}, seen);
    const meta=await getMeta(t,'v',id);
    if(place==='rewritten'){ quarantine(t,'v',id,doc,'rewritten',seen,after); meta.err='damaged'; putMeta(t,meta,after); return 'damaged'; }
    if(place==='recreated'){ log({t:'recreated', col:'v', id, rev:doc.rev}); meta.base=null; }
    const tr=await t.get('sync',K.tr('v',id));
    if(tr){ if(doc.rcpt && doc.rcpt[devId]===tr.op && doc.rev===tr.expect+1){ await finishV(t, id, tr, {kind:'accepted', rev:doc.rev, srv:doc.srv, echo:doc}, after); return 'done'; } setVRefetch(t,id,after); return 'done'; }
    if(meta.base && doc.rev===meta.base.rev && place!=='recreated'){ if(!meta.base.srv && doc.srv){ meta.base.srv=doc.srv; putMeta(t,meta,after); } return 'done'; }
    const job=await t.get('sync',K.out('v',id)), rec=await t.get('versions',id), changed=()=>{ after(()=>emit(deps.onChange,{id, kind:'version', note:doc.note})); };
    if(doc.deleted){ if(rec){ t.del('versions',id); changed(); } if(job) dropVJob(t,id,after); meta.base=storeBase(doc); meta.baseLrev=meta.lrev; for(const k of ['wait','local','held','movedFrom']) delete meta[k];
      if(meta.err==='damaged'){ delete meta.err; t.del('sync',K.quarantine('v',id)); }   // a damaged copy that is deleted now leaves nothing to repair
      putMeta(t,meta,after); return 'done'; }   // deletion beats renaming
    // a live version of a purged note, or of an id deleted here before it reached the cloud: no record, and a tombstone job over it (the moved
    // version of a revived note whose document turns up lands here too: its document names the original, which is purged)
    if(await t.get('sync',K.purged(doc.note)) || meta.gone){ if(rec){ t.del('versions',id); changed(); } for(const k of ['wait','movedFrom']) delete meta[k]; meta.base=storeBase(doc); putMeta(t,meta,after); if(S.owner) setVJob(t,id,vjob(id,{tomb:true}),after); log({t:'vtomb-due', id}); return 'done'; }
    if(!rec && job && job.tomb){ meta.base=storeBase(doc); delete meta.wait; putMeta(t,meta,after); return 'done'; }   // deleted here: the tombstone goes over this state, whether or not its note is here (a tombstone needs no note)
    if(!(await t.get('notes',doc.note))){ meta.wait=doc; putMeta(t,meta,after); after(()=>addWaiting(doc)); return 'done'; }
    const nv=normVersion(doc, deps); if(nv.bad){ quarantine(t,'v',id,doc,'shape',{rev:doc.rev, srv:doc.srv},after); meta.err='damaged'; putMeta(t,meta,after); return 'damaged'; }
    if(meta.err==='damaged'){ delete meta.err; t.del('sync',K.quarantine('v',id)); }
    const built=vrecord(id, nv.version, doc);
    if(rec && !meta.base){
      if(vsameSnap(rec, built)){ meta.base=storeBase(doc); for(const k of ['wait','local']) delete meta[k];
        const renamed=(meta.lrev||0)>1, nr={...rec}; if((rec.blocks||[]).some(e=>typeof e.s!=='string')) nr.blocks=built.blocks;   // a partial copy takes the cloud's full bodies
        if(!renamed) nr.name=built.name; t.put('versions',nr); changed();
        if(renamed && nr.name!==doc.name){ if(!job) setVJob(t,id,vjob(id),after); } else { if(job && !job.tomb) dropVJob(t,id,after); meta.baseLrev=meta.lrev; }
        putMeta(t,meta,after); log({t:'vjoined', id, renamed}); return 'done'; }
      const nid=vid(); t.put('versions',{...rec, id:nid}); t.put('sync',{...defMeta('v',nid), lrev:1, ...(meta.local? {local:meta.local} : {})});   // an id collision: the local snapshot is kept under a new id first
      if(S.owner && !meta.local) setVJob(t,nid,vjob(nid),after); if(job) dropVJob(t,id,after); delete meta.local; log({t:'vcollision', id, nid}); }
    else if(rec && meta.base && job && !job.tomb){ meta.base=storeBase(doc); delete meta.wait; putMeta(t,meta,after); return 'done'; }   // a rename waiting here goes over this state: the rename sent last wins
    t.put('versions',built); meta.base=storeBase(doc); meta.baseLrev=meta.lrev; for(const k of ['wait','local']) delete meta[k]; putMeta(t,meta,after); changed(); return 'done'; }
  async function applyVersionDoc(doc, source){ try{ const r=await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const res=await applyVersionCore(t, doc, source, after); if(source==='delivery' && res!=='skipped') await bumpCursor(t,'versions',{srv:doc.srv, id:doc.id},after); return res; });
      if(source==='delivery') S.vlastDelivered.set(doc.id, doc.rev); return r; }
    catch(e){ if(e.code==='epoch') return 'epoch'; if(/Quota/i.test(e.name||'') || e.code==='quota') return (await quotaTrouble(doc.id,'v'))? 'nospace' : 'error';   // no space: one sweep and one more try, then receiving stops for an hour (§4.6), as for notes
      log({t:'apply-error', col:'v', id:doc.id, error:String(e)}); try{ await tx(['sync'], async(t,after)=>setVRefetch(t,doc.id,after)); }catch(_){} return 'error'; } }

  /* ── sending a version (§4.9, the steps of §4.5) ── */
  async function vbackoff(id, error){ const job=S.vjobs.get(id); if(!job) return; const j={...job, tries:(job.tries||0)+1, err:error.code}; j.next=now()+backoffMs(j.tries); S.vjobs.set(id,j);
    try{ await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.out('v',id)); if(cur) setVJob(t,id,{...cur, tries:j.tries, next:j.next, err:j.err},after); }); }catch(_){} }
  // notes go first (pickJob before this); versions share the device's pace and budget; a create or rename waits without a read while its note is not in the cloud (vblocked)
  function pickVJob(nowT){ if(S.netBusy || S.paused || !S.online || blocked()) return null; const q=quotaNow(), last=Math.min(q.lastSend||0, nowT);
    if(last+pace.dev>nowT || (budgetShare()>=0.7 && last+pace.slow>nowT)) return null;
    for(const [id,job] of S.vjobs){ if(S.vtries.has(id) || S.vblocked.has(id)) continue; if((job.next||0)>nowT+pace.retryMax) job.next=nowT; if((job.next||0)>nowT) continue; const err=S.verr.get(id); if(err && (!job.tomb || err==='invalid' || err==='receipts')) continue; return id; } return null; }   // a tombstone still goes over a damaged copy, not over one the rules refused
  async function runVSend(id){ S.netBusy=true; let known; try{ for(let round=0; round<4; round++){
      const st=await db.tx(['versions','sync'],'readonly', async t=>{ const job=await t.get('sync',K.out('v',id)), tr=await t.get('sync',K.tr('v',id)), meta=await getMeta(t,'v',id), rec=await t.get('versions',id);
        const note=rec? rec.note : meta.base? meta.base.note : null; return {job, tr, meta, rec, note, nmeta:note? await getMeta(t,'n',note) : null, purged:note? !!(await t.get('sync',K.purged(note))) : false}; });
      if(!st.job){ S.vjobs.delete(id); return; } if(st.tr){ await runVTry(id); return; }
      if(!st.job.tomb){ if(!st.rec || st.purged){ await tx(['sync'], async(t,after)=>{ const j=await t.get('sync',K.out('v',id)); if(j && !j.tomb && !(await t.get('sync',K.tr('v',id)))) dropVJob(t,id,after); }); log({t:'vsend-drop', id, purged:st.purged}); return; }
        if(!(st.nmeta.base && st.nmeta.base.rev>=1)){ S.vblocked.add(id); log({t:'vsend-wait', id, note:st.note}); return; } }   // the note is not in the cloud yet: no read, no budget; a base for the note clears the mark
      const base=st.meta.base; let R;
      if(known!==undefined){ R=known; known=undefined; }
      else if(S.snapshot.versions && base && S.vlastDelivered.get(id)===base.rev && !S.vrejected.has(id)) R=null;
      else { const got=await net(()=>S.cloud.get('versions',id), {read:true, kind:'get'}); if(got.error){ await vbackoff(id, got.error); return; } countRead(1); R=got.value? {...got.value, id} : null; S.vrejected.delete(id); }
      const out=await vprepareTx(id, R, R===null && base && S.vlastDelivered.get(id)===base.rev); log({t:'vinsure', id, out});
      if(out==='insured'){ await runVTry(id); return; } if(out==='again'){ known=R; continue; } if(out==='has-try') await reloadQueue(); return; } }
    finally{ S.netBusy=false; } }
  // §4.5 steps 2–3 for a version, one transaction: the cloud moved → the shared rule applies it and the job is looked at again; else the attempt is insured
  async function vprepareTx(id, R, asBase){ return tx(['notes','versions','blobs','sync'], async(t,after)=>{ const job=await t.get('sync',K.out('v',id)); if(!job) return 'dropped'; if(await t.get('sync',K.tr('v',id))) return 'has-try';
      const meta=await getMeta(t,'v',id), base=meta.base;
      if(R && (!base || R.rev!==base.rev)){ const r=await applyVersionCore(t, R, 'server', after); return r==='skipped' || r==='damaged'? 'done' : 'again'; }
      if(!R && base && !asBase){ log({t:'invariant', col:'v', id, kind:'vanished'}); meta.base=null; meta.baseLrev=0; t.del('sync',K.seen('v',id));
        if(job.tomb){ dropVJob(t,id,after); meta.gone=true; putMeta(t,meta,after); return 'dropped'; } putMeta(t,meta,after); return 'again'; }   // vanished past the rules: a create or rename creates it again, a tombstone just goes
      const op=newOp();
      if(job.tomb){ if(!base || base.deleted){ dropVJob(t,id,after); if(!base){ meta.gone=true; delete meta.movedFrom; putMeta(t,meta,after); log({t:'vgone', id}); } return 'dropped'; }
        setVTry(t,id,{k:K.tr('v',id), op, expect:base.rev, result:{note:base.note, deleted:true}, sentLrev:meta.lrev, epoch:S.epoch},after); return 'insured'; }
      const rec=await t.get('versions',id); if(!rec){ dropVJob(t,id,after); return 'dropped'; }
      if(meta.movedFrom && !base){ delete meta.movedFrom; putMeta(t,meta,after); }   // the read found no document: the moved version belongs to the revived note (§4.9 «Revival»)
      if(base && rec.name===base.name){ dropVJob(t,id,after); meta.baseLrev=meta.lrev; putMeta(t,meta,after); return 'dropped'; }   // nothing to send (a rename back)
      if(!base){ const kind=vlocalKind(rec); if(kind){ meta.local=kind; putMeta(t,meta,after); dropVJob(t,id,after); return 'dropped'; } }
      setVTry(t,id,{k:K.tr('v',id), op, expect:base? base.rev : 0, result:vwire(rec, base), sentLrev:meta.lrev, epoch:S.epoch},after); return 'insured'; }); }
  async function runVTry(id){ const tr=S.vtries.get(id); if(!tr || !S.online) return; S.netBusy=true; try{
      const res=await net(()=>S.cloud.txn('versions', id, D=>{ if(D && D.rcpt && D.rcpt[devId]===tr.op) return null; if((D? D.rev : 0)!==tr.expect) return null; if(atLimit(D)) return null; const w={...tr.result, v:1, rev:tr.expect+1, op:tr.op, dev:devId, rcpt:{...(D && D.rcpt || {}), [devId]:tr.op}}; if(devName) w.dn=devName; return w; }));
      if(res.error){ const code=res.error.code; if(isNetErr(code)){ await vbackoff(id, res.error); return; } if(code==='permission-denied'){ await refusedVWrite(id, tr); return; } if(code==='resource-exhausted'){ pauseDay(); return; }
        await tx(['sync'], async(t,after)=>{ const cur=await t.get('sync',K.tr('v',id)); if(!cur || cur.op!==tr.op) return; dropVTry(t,id,after); const meta=await getMeta(t,'v',id); meta.err='invalid'; putMeta(t,meta,after); log({t:'rejected-write', col:'v', id, code}); }); return; }
      const {read:D, wrote}=res.value; countRead(1); if(wrote){ countWrite(1); if(!tr.result.deleted) countRead(1); }   // a create or a rename makes the rules read its note (noteAlive, §4.17)
      let outcome; if(wrote) outcome={kind:'accepted', rev:tr.expect+1, srv:null}; else if(D && D.rcpt && D.rcpt[devId]===tr.op) outcome=D.rev===tr.expect+1? {kind:'accepted', rev:D.rev, srv:D.srv||null, echo:D} : {kind:'accepted', rev:tr.expect+1, srv:null, later:{...D, id}}; else if(D && D.rev>tr.expect) outcome={kind:'rejected'}; else if(D && D.rev===tr.expect && atLimit(D)) outcome={kind:'receipts'}; else outcome={kind:'invariant', D};
      await tx(['notes','versions','blobs','sync'], async(t,after)=>finishV(t, id, tr, outcome, after)); }
    finally{ S.netBusy=false; } }
  // the rules refused a version write: one check read of the version (a moved revision → rejected, back to step 2), then one of its note;
  // the checks of refusedWrite stay: the same op, the epoch (tx), and an lrev that moved meanwhile makes the refusal no mark (§4.9 Sending 3)
  async function refusedVWrite(id, tr){ const same=async t=>{ const c=await t.get('sync',K.tr('v',id)); return !!c && c.op===tr.op; };
    const drop=async error=>{ if(S.denied) return; await tx(['sync'], async(t,after)=>{ if(await same(t)) dropVTry(t,id,after); }); await vbackoff(id, error); };
    const got=await net(()=>S.cloud.get('versions',id), {read:true, kind:'check'}); if(got.error) return drop(got.error); countRead(1); const R=got.value? {...got.value, id} : null;
    if((R? R.rev : 0)!==tr.expect){ await tx(['notes','versions','blobs','sync'], async(t,after)=>{ if(!(await same(t))) return; log({t:'refused-moved', col:'v', id}); await finishV(t, id, tr, R && R.rev>tr.expect? {kind:'rejected'} : {kind:'invariant', D:R}, after); }); return; }
    let N=null; if(!tr.result.deleted){ const g=await net(()=>S.cloud.get('notes',tr.result.note), {read:true, kind:'check'}); if(g.error) return drop(g.error); countRead(1); N=g.value||null; }
    await tx(['notes','versions','blobs','sync'], async(t,after)=>{ if(!(await same(t))) return; dropVTry(t,id,after); const meta=await getMeta(t,'v',id), job=await t.get('sync',K.out('v',id)), note=tr.result.note;
      if(!tr.result.deleted && !N){ log({t:'invariant', id:note, kind:'vanished', by:'version'}); const nm=await getMeta(t,'n',note); nm.base=null; nm.baseLrev=0; putMeta(t,nm,after); t.del('sync',K.seen('n',note));   // the note vanished past the rules: it goes again first, the version waits for it
        if(await t.get('notes',note) && !(await t.get('sync',K.out('n',note)))) setJob(t,note,{k:K.out('n',note), tries:0, next:0},after); if(job) setVJob(t,id,{...job, tries:0, next:0},after); after(()=>S.vblocked.add(id)); return; }
      if(!tr.result.deleted && N.purged){ log({t:'vrefused-purged', id}); await vnoteGone(t, id, meta, job, after); return; }
      if(meta.lrev!==tr.sentLrev){ if(job) setVJob(t,id,{...job, tries:0, next:0},after); log({t:'rejected-write', col:'v', id, stale:true}); return; }   // edited (renamed, deleted) while the check read was out: the newer state goes, unmarked
      meta.err='invalid'; putMeta(t,meta,after); log({t:'rejected-write', col:'v', id, code:'permission-denied'}); }); }
  // its note is purged in the cloud: a held version (its note already went here) moves into the revived note when the create was refused, or goes;
  // one with a base is tombstoned; an unsent one keeps its record until the note's tombstone arrives here and decides (revival or deletion)
  async function vnoteGone(t, id, meta, job, after){
    if(meta.held){ const h=meta.held; delete meta.held;
      if(meta.base){ putMeta(t,meta,after); setVJob(t,id,vjob(id,{tomb:true}),after); return; }
      const p=await t.get('sync',K.purged(h.note)), target=p && p.revivedAs? await t.get('notes',p.revivedAs) : null;
      if(target){ t.put('versions',{...h, note:target.id}); meta.lrev=1; meta.baseLrev=0; putMeta(t,meta,after); setVJob(t,id,vjob(id),after); log({t:'vmoved', id, to:target.id}); after(()=>emit(deps.onChange,{id, kind:'version', note:target.id})); return; }
      putMeta(t,meta,after); if(job) dropVJob(t,id,after); return; }
    if(meta.base){ const rec=await t.get('versions',id); if(rec) t.del('versions',id); setVJob(t,id,vjob(id,{tomb:true}),after); return; }
    if(job) dropVJob(t,id,after); }
  // §4.5 step 5 for a version, only if the attempt is still the same one
  async function finishV(t, id, tr, outcome, after){ const cur=await t.get('sync',K.tr('v',id)); if(!cur || cur.op!==tr.op){ after(()=>{ if(S.vtries.get(id)===tr) S.vtries.delete(id); S.queueAt=0; }); return 'stale'; }
    const meta=await getMeta(t,'v',id), job=await t.get('sync',K.out('v',id)), seen=await t.get('sync',K.seen('v',id)); dropVTry(t,id,after);
    if(outcome.kind==='accepted'){ const rev=outcome.rev, after_=meta.base? meta.base.srv||null : null;
      const nb={...tr.result, rev, srv:outcome.srv||null, dev:devId, op:tr.op, v:1}; if(devName) nb.dn=devName; nb.rcpt=outcome.echo? outcome.echo.rcpt : {...(meta.base && meta.base.rcpt || {}), [devId]:tr.op};
      if(!meta.base || rev>meta.base.rev) meta.base=nb; setSeen(t,'v',id,{rev:Math.max(rev, seen? seen.rev : 0), srv:outcome.srv, after:after_});
      if(tr.result.deleted){ dropVJob(t,id,after); delete meta.held; delete meta.movedFrom; }
      else if(meta.held){ delete meta.held; setVJob(t,id,vjob(id,{tomb:true}),after); }   // its note went while the attempt was out: accepted, the version goes with the original
      else if(meta.lrev===tr.sentLrev){ meta.baseLrev=meta.lrev; if(job && !job.tomb) dropVJob(t,id,after); }
      else if(job) setVJob(t,id,{...job, tries:0, next:0},after);
      putMeta(t,meta,after); log({t:'vaccepted', id, rev, tomb:!!tr.result.deleted}); if(outcome.later) return applyVersionCore(t, outcome.later, 'server', after); return 'done'; }
    if(outcome.kind==='rejected'){ if(meta.held){ delete meta.held; putMeta(t,meta,after); setVJob(t,id,vjob(id,{tomb:true}),after); } else if(job) setVJob(t,id,{...job, tries:0, next:0},after); after(()=>S.vrejected.add(id)); log({t:'vrejected', id}); return 'done'; }
    if(outcome.kind==='receipts'){ meta.err='receipts'; putMeta(t,meta,after); return 'done'; }
    const D=outcome.D; log({t:'invariant', col:'v', id, kind:D? 'older' : 'vanished'});
    if(!D){ meta.base=null; meta.baseLrev=0; t.del('sync',K.seen('v',id)); if((job && job.tomb) || meta.held){ if(job) dropVJob(t,id,after); delete meta.held; meta.gone=true; } putMeta(t,meta,after); return 'done'; }
    if(meta.held){ delete meta.held; putMeta(t,meta,after); setVJob(t,id,vjob(id,{tomb:true}),after); }
    return applyVersionCore(t, {...D, id}, 'server', after); }
  async function doVRefetch(id){ S.netBusy=true; try{ const got=await net(()=>S.cloud.get('versions',id), {read:true, kind:'refetch'}); if(got.error){ S.refetchRetry=now()+backoffMs(1); return; } countRead(1);
      try{ await tx(['notes','sync','versions','blobs'], async(t,after)=>{ dropVRefetch(t,id,after); if(got.value) await applyVersionCore(t, {...got.value, id}, 'server', after); }); }
      catch(e){ if(e.code==='epoch') return; if(/Quota/i.test(e.name||'') || e.code==='quota'){ await quotaTrouble(id,'v'); return; } log({t:'apply-error', col:'v', id, error:String(e)}); S.refetchRetry=now()+backoffMs(2); } }
    finally{ S.netBusy=false; } }

  /* ── receiving: catch-up, listener, refetch (§4.6) ── */
  function startCatchup(col, from){ S.catchup[col]={active:true, from:from===undefined? srvMinus(S.cursor[col] && S.cursor[col].srv, 5*60000) : from, after:null, retryAt:0}; S.catchupDone[col]=false; }
  async function fetchPage(col){ const c=S.catchup[col]; if(!c || c.retryAt>now()) return false; S.netBusy=true; try{
      const res=await net(()=>S.cloud.page(col, c.after? {after:c.after} : {from:c.from}, 200), {read:true, kind:'page'}); if(res.error){ c.retryAt=now()+backoffMs(++c.tries||1); log({t:'page-error', col, code:res.error.code}); return true; }
      const docs=res.value||[]; countRead(Math.max(1, docs.length)); let last=null;
      for(const d of docs){ const r=await applyIncoming(col, d, 'delivery'); if(r==='epoch') return true; if(r==='nospace'){ c.retryAt=now()+3600000; return true; } last={srv:d.srv, id:d.id}; }   // epoch: the owner changed under this page (§4.4 step 1); nothing of it is kept, not even the cursor
      if(last){ c.after=last; try{ await tx(['sync'], async(t,after)=>bumpCursor(t,col,last,after)); }catch(e){ if(e.code==='epoch') return true; throw e; } }   // with the owner check: a page of the old owner must not leave its cursor to the new one
      if(docs.length<200 && col==='versions'){ try{ await tx(['sync'], async t=>{ const st=await t.get('sync',K.cursor('versions')); if(!st || !st.done) t.put('sync',{...(st||{}), k:K.cursor('versions'), done:true}); }); }catch(e){ if(e.code==='epoch') return true; throw e; } }   // the first catch-up of versions has ended, also with no document at all
      if(docs.length<200){ c.active=false; S.catchupDone[col]=true; log({t:'catchup-done', col}); if(col==='notes'){ S.everCaughtUp=true; if(!S.catchup.versions || !S.catchup.versions.active) startCatchup('versions'); } S.totals[col].pending=true; }
      return true; } finally{ S.netBusy=false; } }
  function startListener(col){ if(!S.cloud || !S.cloud.listen || S.paused) return; if(S.listen[col]){ try{ S.listen[col](); }catch(_){} }
    S.snapshot[col]=false; const from=srvMinus(S.cursor[col] && S.cursor[col].srv, 2*60000);
    S.listen[col]=S.cloud.listen(col, from, (docs, info)=>{ if(info && info.snapshot){ S.snapshot[col]=true; S.readOk=true; } if(docs && docs.length) countRead(docs.length); for(const d of docs||[]) S.inbox.push({col, doc:d, source:'delivery'}); emit(deps.wake); },
      err=>{ const code=errOf(err).code; log({t:'listen-error', col, code}); S.snapshot[col]=false; S.listen[col]=null; if(code==='permission-denied' && !S.denied){ S.denied=true; log({t:'denied', kind:'listen'}); setStatus('denied'); } }); }   // every delivered document is a billed read (§4.17); a refused listener is a refused read
  function stopListeners(){ for(const col of ['notes','versions']){ if(S.listen[col]){ try{ S.listen[col](); }catch(_){} S.listen[col]=null; } S.snapshot[col]=false; } }
  async function doRefetch(id){ S.netBusy=true; try{ const got=await net(()=>S.cloud.get('notes',id), {read:true, kind:'refetch'}); if(got.error){ log({t:'refetch-error', id, code:got.error.code}); S.refetchRetry=now()+backoffMs(1); return; } countRead(1);
      try{ await tx(['notes','sync','versions','blobs'], async(t,after)=>{ dropRefetch(t,id,after); const R=got.value; if(R) await applyNote(t, {...R, id}, 'server', after); }); }
      catch(e){ if(e.code==='epoch') return; if(/Quota/i.test(e.name||'') || e.code==='quota'){ await quotaTrouble(id); return; } log({t:'apply-error', id, error:String(e)}); S.refetchRetry=now()+backoffMs(2); } }   // the record stays for the next try
    finally{ S.netBusy=false; } }

  /* ── the totals check and the full pass (§4.6) ── */
  async function seenTotals(c){ const list=await db.tx(['sync'],'readonly', async t=>t.range('sync','seen:'+c+':','seen:'+c+':\uffff')); let sum=0; for(const s of list) sum+=+s.rev||0; return {count:list.length, sum, ids:list.map(s=>s.k.slice(7))}; }
  function totalsDue(nowT){ if(!S.online || S.paused || blocked() || S.tries.size || S.vtries.size || S.netBusy || S.nospace) return null;
    for(const col of ['notes','versions']){ const T=S.totals[col]; if(!S.catchupDone[col] || !S.snapshot[col]) continue; if(S.catchup[col] && S.catchup[col].active) continue; if(S.scan[col] && S.scan[col].active) continue;   // the full pass settles the question itself; a check meanwhile would only spend the budget
      if(T.mismatchAt && nowT-T.mismatchAt<pace.totalsRecheck) continue; if(T.lastMatch && nowT-T.lastMatch<pace.totalsAfterMatch) continue;
      if(T.pending || !T.last || nowT-T.last>=pace.totalsEvery) return col; } return null; }
  async function runTotals(col){ const T=S.totals[col], c=COL[col]; S.netBusy=true; try{ const res=await net(()=>S.cloud.totals(col), {read:true, kind:'totals'}); T.last=now(); T.pending=false;
      if(res.error){ log({t:'totals-unknown', col, code:res.error.code}); return; } const {count, sum}=res.value; countRead(2*Math.max(1, Math.ceil(count/1000)));
      const mine=await seenTotals(c); const same=mine.count===count && mine.sum===sum; log({t:'totals', col, cloud:{count, sum}, seen:{count:mine.count, sum:mine.sum}, same});
      if(same){ T.lastMatch=now(); T.mismatchAt=0; T.strikes=0; return; }
      T.strikes++; T.mismatchAt=now();
      if(T.strikes===1){ startCatchup(col); return; }
      T.strikes=0; const day=dayKey(now()), sc=S.scan[col]; if(sc && (sc.startedDay===day || sc.active)){ log({t:'scan-skipped', col}); return; }
      const left=Math.max(0, budgets().reads-quotaNow().reads); S.scan[col]={k:K.scan(col), active:true, after:null, found:0, ids:[], startedDay:day, day, allow:Math.floor(left/2)}; await saveScan(col); log({t:'scan-start', col}); setStatus('checking',0); }
    finally{ S.netBusy=false; } }
  async function saveScan(col){ const sc=S.scan[col]; await tx(['sync'], async t=>{ if(sc) t.put('sync',sc); else t.del('sync',K.scan(col)); }); }   // under the owner check, like every write of the owner's data
  function scanReady(nowT){ for(const col of ['notes','versions']){ const sc=S.scan[col]; if(!sc || !sc.active) continue; const day=dayKey(nowT); if(sc.day!==day){ sc.day=day; sc.allow=Math.floor(Math.max(0, budgets().reads-quotaNow().reads)/2); } if(sc.allow>=1 && S.online && !S.paused && !S.netBusy && !blocked()) return col; } return null; }
  async function scanPage(col){ const sc=S.scan[col]; S.netBusy=true; try{ const n=Math.min(200, sc.allow); const res=await net(()=>S.cloud.scan(col, {afterId:sc.after}, n), {read:true, kind:'scan'}); if(res.error){ sc.retryAt=now()+backoffMs(1); return; }
      const docs=res.value||[]; countRead(Math.max(1,docs.length)); sc.allow-=Math.max(1,docs.length); for(const d of docs){ if(await applyIncoming(col, d, 'server')==='epoch') return; sc.ids.push(d.id); sc.found++; sc.after=d.id; } S.scanFound=sc.found; setStatus('checking',sc.found);
      if(docs.length<n){ await scanComplete(col); return; } await saveScan(col); } finally{ S.netBusy=false; } }
  async function scanComplete(col){ const sc=S.scan[col], c=COL[col], mine=await seenTotals(c), got=new Set(sc.ids), vanished=mine.ids.filter(id=>!got.has(id)); log({t:'scan-done', col, found:sc.found, vanished:vanished.length});
    if(vanished.length) await tx(['notes','sync','versions'], async(t,after)=>{ for(const id of vanished){ t.del('sync',K.seen(c,id)); log({t:'vanished', col, id}); if(c==='n'){ const meta=await getMeta(t,'n',id); meta.base=null; meta.baseLrev=0; putMeta(t,meta,after); const rec=await t.get('notes',id); if(rec){ const job=await t.get('sync',K.out('n',id)); if(!job) setJob(t,id,{k:K.out('n',id), tries:0, next:0},after); } } else { const meta=await getMeta(t,'v',id), job=await t.get('sync',K.out('v',id)), rec=await t.get('versions',id); meta.base=null; meta.baseLrev=0;   // a vanished version: created again when it is alive here, a tombstone job just goes
        if(job && job.tomb){ dropVJob(t,id,after); meta.gone=true; } else if(rec && rec.name && !meta.local && !job) setVJob(t,id,vjob(id),after); putMeta(t,meta,after); } } });
    S.scan[col]={...sc, active:false, ids:[], doneDay:dayKey(now())}; await saveScan(col); S.totals[col].pending=true; }

  /* ── the step ── */
  function status(){ const nowT=now(), jobs=[...S.jobs.values()].filter(j=>!(j.wait>nowT)).length+S.tries.size+S.vjobs.size+[...S.vtries.keys()].filter(id=>!S.vjobs.has(id)).length; let code;   // both streams: a note or a version counts once   // a job waiting out its day (an automatic tombstone the rules refused as early) is not «sending»
    if(!S.owner) code='none'; else if(S.denied) code='denied'; else if(S.reauth) code='reauth'; else if(S.nospace) code='nospace'; else if(S.paused) code='limit'; else if(!S.online) code='offline'; else if(S.unverified) code='unverified';
    else if([...S.jobs.values()].some(j=>['loop','size','invalid','damaged','receipts'].includes(S.err.get(j.k.slice(6)))) || [...S.vjobs.keys()].some(id=>S.verr.get(id)) || [...S.verr.values()].includes('damaged')) code='error';
    else if(S.scan.notes && S.scan.notes.active || S.scan.versions && S.scan.versions.active) code='checking';
    else if(S.tries.size && [...S.tries.values()].some(tr=>(S.jobs.get(tr.k.slice(6))||{}).tries>0 && now()-(tr.at||0)>pace.waiting)) code='waiting';
    else if(jobs || S.refetch.size || S.vrefetch.size) code='sending';
    else if(S.snapshot.notes && S.snapshot.versions && S.totals.notes.lastMatch && S.totals.versions.lastMatch) code='synced'; else code='pending';
    const st={code, n: code==='checking'? S.scanFound : jobs}; setStatus(code, st.n); return st; }
  // every status report goes through here, so a direct report (a pass's progress, denied, no space) and the computed one never disagree
  function setStatus(code, n){ const st={code, n:n||0}; if(!S.lastStatus || S.lastStatus.code!==code || S.lastStatus.n!==st.n){ S.lastStatus=st; emit(deps.onStatus, code, st.n); } }
  // the next step's time; the version queue counts with its retry time and the device pace; a job no pick would take (an error that blocks it, no
  // network, no access) sets no time: going online or a new owner wakes the engine itself
  function nextWake(nowT){ let next=Infinity; const net=S.online && !blocked(); if(!S.paused && net) for(const [id,job] of S.vjobs){ if(S.vblocked.has(id) || S.vtries.has(id)) continue; const verr=S.verr.get(id); if(verr && (!job.tomb || verr==='invalid' || verr==='receipts')) continue; const q=quotaNow(), d=Math.max(job.next||0, Math.min(q.lastSend||0, nowT)+pace.dev); next=Math.min(next, d>nowT? d : nowT+50); } if(!S.paused && net) for(const [id] of S.vtries){ const j=S.vjobs.get(id), d=j? (j.next||0) : 0; next=Math.min(next, d>nowT? d : nowT+50); } if(net) for(const [id,job] of S.jobs){ if(S.paused){ const tr=S.tries.get(id); if(!(tr && tr.result && tr.result.purged)) continue; }   // paused: only a tombstone's attempt may still run; the other jobs wait for the next day, not for the next step
      if(!S.tries.has(id)){ const err=S.err.get(id); if(err && (!job.tomb || err==='invalid' || err==='receipts')) continue; }
      const d=S.tries.has(id)? (job.next||0) : Math.max(job.next||0, job.wait||0, sendDelay(id,nowT)); if(d>nowT) next=Math.min(next,d); else next=Math.min(next, nowT+50); }
    if(S.everCaughtUp && !S.paused && S.online && !blocked()) next=Math.min(next, Math.max(nowT+50, (S.lastPurge||0)+pace.purgeEvery));   // the next look for trash old enough to purge (§4.8)
    if(!S.paused && net) for(const col of ['notes','versions']){ const c=S.catchup[col]; if(c && c.active) next=Math.min(next, Math.max(c.retryAt||0, nowT+50)); const T=S.totals[col]; if(S.catchupDone[col] && S.snapshot[col] && !S.tries.size){ next=Math.min(next, T.mismatchAt? T.mismatchAt+pace.totalsRecheck : T.lastMatch? Math.max(T.lastMatch+pace.totalsAfterMatch, T.last+pace.totalsEvery) : nowT+1000); } }   // paused: pages, refetches and totals are not allowed, so they set no time; the inbox (already paid) still does
    if(S.inbox.length || ((S.refetch.size || S.vrefetch.size) && !S.paused && net)) next=Math.min(next, nowT+10); if(S.nospace) next=Math.min(next, (S.nospaceAt||nowT)+3600000); if(S.paused) next=Math.min(next, nextDay(nowT)); return next; }   // paused: the step runs again when the budget counts anew
  async function stepOnce(){ if(!S.loaded) await load(); const nowT=now(); quotaNow();
    if(!S.started || !S.cloud || !S.owner){ return {did:'idle', next:Infinity, status:status()}; }
    if(S.listenPaused && !S.paused){ S.listenPaused=false; reconnect(); }   // the day turned: the budget is back, so are the listeners
    if((S.errorUntil||0)>nowT) return {did:'idle', next:S.errorUntil, status:status()};
    // no space (§4.6): receiving stops for an hour, deliveries meanwhile are dropped (the totals check finds them later); then the listener and catch-up start over
    if(S.nospace){ if(nowT<(S.nospaceAt||0)+3600000){ S.inbox.length=0; return {did:'idle', next:S.nospaceAt+3600000, status:status()}; } S.nospace=false; S.sweptOnce=false; log({t:'nospace-over'}); reconnect(); }
    if((!S.jobs.size && !S.tries.size && !S.vjobs.size && !S.vtries.size) || nowT-(S.queueAt||0)>60000) await reloadQueue();
    if(S.vjudge) await vmigrate({jobs:true});   // a version job written without a meta (code before 4a in another tab): judged before anything sends it
    try{
      if(S.inbox.length){ const m=S.inbox.shift(); await applyIncoming(m.col, m.doc, m.source); return {did:'inbox', next:nowT}; }
      if(S.online && !blocked()){ for(const [id,tr] of S.tries){ const job=S.jobs.get(id); if(job && (job.next||0)>nowT+pace.retryMax) job.next=nowT; if(job && (job.next||0)>nowT) continue; if(S.paused && !(tr.result && tr.result.purged)) continue; await guarded('try', id, ()=>runTry(id)); return {did:'try', next:nowT}; } }
      if(S.online && !blocked() && !S.paused){ for(const [id] of S.vtries){ const job=S.vjobs.get(id); if(job && (job.next||0)>nowT) continue; await vguarded('try', id, ()=>runVTry(id)); return {did:'vtry', next:nowT}; } }
      for(const col of ['notes','versions']){ const c=S.catchup[col]; if(c && c.active && S.online && !S.paused && !blocked() && (col==='notes' || !(S.catchup.notes && S.catchup.notes.active))){ if(await fetchPage(col)) return {did:'page', next:nowT}; } }
      if(S.online && !S.paused && !blocked() && !(S.refetchRetry>nowT)){ for(const id of S.refetch){ if(S.tries.has(id)) continue; await doRefetch(id); return {did:'refetch', next:nowT}; } for(const id of S.vrefetch){ if(S.vtries.has(id)) continue; await doVRefetch(id); return {did:'refetch', next:nowT}; } }
      if(S.everCaughtUp && S.online && !S.paused && !blocked() && !S.netBusy && nowT-(S.lastPurge||0)>=pace.purgeEvery){ await autoPurge(nowT); return {did:'purge', next:nowT}; }   // after a catch-up and then once an hour: the trash old enough by the device clock (§4.8)
      const pick=pickJob(nowT); if(pick){ await guarded('send', pick, ()=>runSend(pick)); return {did:'send', next:nowT}; }
      const vpick=pickVJob(nowT); if(vpick){ await vguarded('send', vpick, ()=>runVSend(vpick)); return {did:'vsend', next:nowT}; }
      const tcol=totalsDue(nowT); if(tcol){ await runTotals(tcol); return {did:'totals', next:nowT}; }
      const scol=scanReady(nowT); if(scol && !(S.scan[scol].retryAt>nowT)){ await scanPage(scol); return {did:'scan', next:nowT}; }
      return {did:'idle', next:nextWake(nowT), status:status()}; }
    finally{ await flushQuota(); } }
  // an error outside a send or an attempt (a page, the totals, a scan, the inbox) pauses the engine for a growing while instead of failing the step
  function step(){ if(S.stepping) return S.stepping; S.stepping=(async()=>{ try{ const r=await stepOnce(); if(r.did!=='idle') S.stepErrors=0; return r; }
      catch(e){ S.stepErrors=(S.stepErrors||0)+1; S.errorUntil=now()+backoffMs(S.stepErrors); log({t:'step-error', kind:'step', code:e && e.code, error:String(e && e.message || e), next:S.errorUntil}); return {did:'error', next:S.errorUntil, status:status()}; }
      finally{ S.stepping=null; } })(); return S.stepping; }
  async function idle(limit=200){ let r; for(let i=0;i<limit;i++){ r=await step(); if(r.did==='idle') break; } return r; }

  /* ── the automatic purge by the device clock (§4.8): candidates are notes in the trash whose server date `tsrv` is known and over the term
     by this device's clock, with no conflict copies here and nothing in flight (an edit waiting to go, an attempt, a refused early purge still
     waiting); each becomes an automatic tombstone job, whose cloud transaction the rules judge by their own clock ── */
  async function autoPurge(nowT){ S.lastPurge=nowT; const ids=await db.tx(['notes','sync','versions'],'readonly', async t=>{ const out=[];
      for(const n of await t.range('notes','','￿')){ if(!n.deleted) continue; const meta=await getMeta(t,'n',n.id), ts=meta.base? meta.base.tsrv : null; if(!validSrv(ts) || nowT-ts.s*1000<=pace.purgeAfter) continue;
        if(await t.get('sync',K.out('n',n.id)) || await t.get('sync',K.tr('n',n.id)) || await hasCopies(t,n.id)) continue; out.push(n.id); } return out; });
    for(const id of ids){ const r=await tombstoneAuto(id); log({t:'purge-auto', id, ok:r.ok, code:r.code}); } return ids; }

  /* ── owner, start, stop (the hook of PR 1; sign-in comes with PR 3) ── */
  // o.erase: the device's data go with the previous owner and the new one starts empty («Прибрати й увійти», §4.11), one transaction;
  // o.expectEpoch: the epoch the caller decided over (a dialog); another one in the store means another tab changed the owner first → `epoch`
  async function setOwner(owner, o={}){ if(!S.loaded) await load(); const same=!o.erase && S.owner && owner && S.owner.uid===owner.uid && S.owner.env===owner.env;
    await db.tx(['notes','versions','blobs','sync'],'readwrite', async t=>{ if(o.expectEpoch!==undefined){ const ep=await t.get('sync','epoch'); if((ep? ep.id : null)!==o.expectEpoch) throw fail('epoch'); }
      if(same){ t.put('sync',{k:'owner', ...owner}); return; }
      const epoch={k:'epoch', id:'e'+now().toString(36)+random().toString(36).slice(2,8)}; t.put('sync',epoch);
      for(const pre of ['meta:','seen:','out:','try:','refetch:','purged:','cursor:','quarantine:','scan:']) for(const r of await t.range('sync',pre,pre+'￿')) t.del('sync',r.k);
      const erase=!!o.erase || !owner;
      if(erase){ for(const n of await t.range('notes','','￿')) t.del('notes',n.id); for(const v of await t.range('versions','','￿')) t.del('versions',v.id); for(const b of await t.range('blobs',[''],['￿','￿'])) t.del('blobs',[b.note,b.h]); }
      if(owner){ t.put('sync',{k:'owner', ...owner}); if(!erase){ for(const n of await t.range('notes','','￿')){ if(isEmpty(n)) continue; t.put('sync',{k:K.out('n',n.id), tries:0, next:0}); t.put('sync',{...defMeta('n',n.id), lrev:1}); } const noop=()=>{}; for(const v of await t.range('versions','','￿')){ if(v.name && v.reason!=='copy') await queueV(t, v, noop, {force:true}); } } }   // the queued note is a local change ahead of no base (lrev 1 over baseLrev 0): a document of the same id in the new owner's cloud is merged with it (merge0) and the job stays, instead of replacing it
      else t.del('sync','owner');
      S.loaded=false; });
    if(same){ if(S.started) connectCloud(); return; }   // the same owner again (every start of a signed-in device): the memory stays as loaded from the store, the cursor included, so nothing is read anew
    resetMemory({owner:true}); await load(); if(S.started) connectCloud(); }
  // «Створити копію нотатки» (§4.18): the note the rules refuse for its receipts stays here as it is; its job goes, so the copy syncs in its place
  async function unqueue(id){ if(!S.loaded) await load(); return tx(['sync'], async(t,after)=>{ const meta=await getMeta(t,'n',id); if(meta.err!=='receipts') return {ok:false, code:'receipts'}; delete meta.err; putMeta(t,meta,after); dropJob(t,id,after); dropRefetch(t,id,after); return {ok:true}; }); }
  function connectCloud(){ if(!S.cloud || !S.owner) return; S.readOk=false; S.unverified=false; if(S.paused){ S.listenPaused=true; return; } startCatchup('notes'); S.catchup.versions=null; S.catchupDone.versions=false; startListener('notes'); startListener('versions'); }
  // every start has a run id; stop() and a later start move it on, so a start that was waiting on its transaction when either came connects nothing
  // and changes nothing of the run that superseded it (a tab that lost the lead during its start and got it back before that start finished)
  async function start(o={}){ if(!S.loaded) await load(); if(o.cloud!==undefined) S.cloud=o.cloud; const run=S.runId=(S.runId||0)+1; S.started=true;
    if(S.owner && S.cloud){ try{ await db.tx(['sync'],'readwrite', async t=>{ if(!(await t.get('sync','format'))) t.put('sync',{k:'format', v:deps.format||3}); }); }catch(_){} try{ await recheckQuarantine(); }catch(_){} try{ await vmigrate(); }catch(e){ log({t:'vmigrate-error', error:String(e)}); } if(!S.started || S.runId!==run) return; connectCloud(); } }
  // a note quarantined for its shape is checked again under the current normalizer (an update may accept what an older one refused, §4.15): one that passes
  // is marked and read from the cloud again; the read goes through rule 1 against the kept seen record (an equal document is fresh, a recreated one is
  // recognized), and the quarantine with its copy leaves only in the transaction that applies the document. One that still fails stays as it is
  async function recheckQuarantine(){ return tx(['sync'], async(t,after)=>{ for(const q of await t.range('sync','quarantine:n:','quarantine:n:\uffff')){ if(q.reason!=='shape' || !q.raw || q.recheck) continue; const id=q.k.slice(13);
      if(normNote(q.raw, deps).bad) continue; t.put('sync',{...q, recheck:true}); setRefetch(t,id,after); log({t:'recheck', id}); } }); }
  function stop(){ S.started=false; S.runId=(S.runId||0)+1; stopListeners(); }   // the snapshot flags go with the listeners: a step still in flight must not skip a server read on a dead listener
  function online(on){ const was=S.online; S.online=!!on; if(on && !was) reconnect(); }
  function reconnect(){ if(!S.started || !S.cloud || !S.owner) return; if(S.paused){ stopListeners(); S.listenPaused=true; emit(deps.wake); return; }   // the day's budget is spent: nothing is read until the next day, whatever the connection does
    S.lastReconnect=now(); startListener('notes'); startListener('versions'); startCatchup('notes'); emit(deps.wake); }

  /* ── «forever» with an owner, an automatic tombstone, import (§4.4, §4.7, §4.14) ── */
  async function purgeLocal(id){ if(!S.loaded) await load(); try{ return await tx(['notes','sync','versions','blobs'], async(t,after)=>{ const C=await t.get('notes',id); if(!C) return {ok:false, code:'missing'};
      const meta=await getMeta(t,'n',id), seen=await t.get('sync',K.seen('n',id)), tr=await t.get('sync',K.tr('n',id)), copies=(await versionsOf(t,id)).filter(v=>v.reason==='copy').length;
      const never=!S.owner || (!meta.base && !seen && !tr && S.everCaughtUp);
      await deleteRecord(t,id,{after, own:true, never}); after(()=>{ S.bytes.delete(id); S.sends.delete(id); S.err.delete(id); });   // nothing in the cloud to tombstone (decision 2 of the implementation plan)
      if(never){ t.del('sync',K.meta('n',id)); dropJob(t,id,after); dropRefetch(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return {ok:true, tomb:false, copies}; }
      meta.lrev=(meta.lrev||0)+1; if(meta.err==='invalid' || meta.err==='loop') delete meta.err; putMeta(t,meta,after); const prev=await t.get('sync',K.purged(id)); const p={k:K.purged(id), rev:0}; if(prev && prev.revivedAs) p.revivedAs=prev.revivedAs; t.put('sync',p);   // a refusal of the old content or a loop says nothing about the tombstone; a refusal of the tombstone itself blocks it again
      setJob(t,id,{k:K.out('n',id), tries:0, next:0, tomb:true},after); dropRefetch(t,id,after); after(()=>emit(deps.onChange,{id, kind:'purged'})); return {ok:true, tomb:true, copies}; }); }
    catch(e){ return {ok:false, code:codeOf(e), error:e}; } }
  async function tombstoneAuto(id){ if(!S.loaded) await load(); return tx(['notes','sync'], async(t,after)=>{ const C=await t.get('notes',id); if(!C || !C.deleted) return {ok:false}; const job=await t.get('sync',K.out('n',id)); if(job && !job.tomb) return {ok:false, code:'busy'}; if(job && job.wait) return {ok:false, code:'waiting'}; setJob(t,id,{k:K.out('n',id), tries:0, next:0, tomb:true, auto:true},after); return {ok:true}; }); }   // waiting: the rules refused it as early; it keeps its day
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

  return {start, stop, step, idle, status, online, reconnect, setOwner, reload, checkOwner, nudge, writeLocal, purgeLocal, unqueue, tombstoneAuto, autoPurge, countCopies, importNote, importMany, state, seenAll, lrevOf, versionLocal, versionStates, importHistory, get devId(){ return devId; }, get devName(){ return devName; },
    typed:id=>{ S.typed.set(id,now()); if(S.err.get(id)==='loop'){ tx(['sync'], async(t,after)=>{ const meta=await getMeta(t,'n',id); if(meta.err==='loop'){ delete meta.err; putMeta(t,meta,after); } }).catch(()=>{}); } },
    left:id=>{ S.left.add(id); emit(deps.wake); }, setCloud:c=>{ S.cloud=c; if(S.started) connectCloud(); },
    get log(){ return LOG; }, get owner(){ return S.owner; }, get epoch(){ return S.epoch; }, hasOwner:()=>!!S.owner, jobs:()=>[...S.jobs.keys()], tries:()=>[...S.tries.keys()], vjobs:()=>[...S.vjobs.keys()], vtries:()=>[...S.vtries.keys()], inboxSize:()=>S.inbox.length, _S:S};
}

return {DOC_MAX, V_BODY_MAX, LIM, SERVICE, hashOf, canon, cjson, hashDoc, noteBody, noUpdated, sameDoc, docBytes, cmpSrv, clearlyNewer, validSrv, normBlock, normBlocks, normNote, normVersion,
  keyOf, cmpKey, contentHash, merge3, merge0, moveInto, nextUpdated, placeAgainstSeen, bodyOf, entryOf, manifestOf, sumOf, budgetOf, dayKey, PACE, makeSync};
});
