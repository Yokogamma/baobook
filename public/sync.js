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
function noUpdated(doc){ if(!isObj(doc)) return doc; const o={...doc}; delete o.updated; return o; }
const sameDoc=(a,b)=>cjson(noUpdated(a))===cjson(noUpdated(b));   // equality «without updated» (§4.4 step 4)
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
  if(b.html!==undefined){ if(typeof b.html!=='string') return false; if(b.kind || !b.html) delete b.html; else { const h=deps && deps.cleanRich? deps.cleanRich(b.html) : b.html; if(h) b.html=h; else delete b.html; } }
  for(const k of ['wrap','num','open','collapsed']){ if(b[k]===undefined) continue; if(!isBool(b[k])) return false; if(!b[k] || (k==='collapsed'? b.kind!=='area' : b.kind!=='code')) delete b[k]; }
  if(b.lang!==undefined){ if(!isStr(b.lang,LIM.lang)) return false; if(!b.lang || b.kind!=='code') delete b.lang; }
  if(b.title!==undefined){ if(!isStr(b.title,LIM.title)) return false; if(!b.title || !b.kind) delete b.title; }
  if(b.color!==undefined){ if(!isStr(b.color,LIM.color)) return false; if(!b.color || b.color==='neutral' || b.kind!=='area') delete b.color; }
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

/* ── history manifests (VERSIONS-PLAN), shared with the versions code of index.html ── */
const bodyOf=d=>d.kind? (d.text||'') : (d.html||d.text||'');
const entryOf=d=>{ const e={...d}; delete e.text; delete e.html; delete e.s; delete e.r; const b=bodyOf(d); e.h=b.length>V_BODY_MAX? null : hashOf(b); return e; };   // a body too big for the history gets h:null
function manifestOf(title, blocks){ const m=(blocks||[]).filter(d=>d&&d.id).map(entryOf).sort((x,y)=>x.id<y.id?-1:1); return {title:title||'', blocks:m, sig:hashOf((title||'')+'\n'+JSON.stringify(m))}; }
function sumOf(m, prev){ const s={ch:0,add:0,del:0,mv:0,ttl:0}; if(!prev){ s.add=m.blocks.length; return s; } const P=new Map(prev.blocks.map(e=>[e.id,e])), seen=new Set();
  for(const e of m.blocks){ const p=P.get(e.id); seen.add(e.id); if(!p){ s.add++; continue; }
    if(p.h!==e.h || (p.title||'')!==(e.title||'') || (p.kind||'')!==(e.kind||'') || (p.lang||'')!==(e.lang||'')) s.ch++; else if(p.row!==e.row || p.fx!==e.fx || p.parent!==e.parent || p.col!==e.col) s.mv++; }
  for(const id of P.keys()) if(!seen.has(id)) s.del++; if((prev.title||'')!==(m.title||'')) s.ttl=1; return s; }

return {DOC_MAX, V_BODY_MAX, LIM, hashOf, canon, cjson, hashDoc, noUpdated, sameDoc, docBytes, cmpSrv, clearlyNewer, validSrv, normBlock, normBlocks, normNote, normVersion, bodyOf, entryOf, manifestOf, sumOf};
});
