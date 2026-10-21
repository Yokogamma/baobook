// The sync core under Node: the canonical form and the normalizer (docs/SYNC-PLAN.md §4.15). No browser: public/sync.js is loaded
// through tests/lib/core.mjs. Checks: norm(norm(x)) == norm(x); shuffling the block array changes nothing in the canonical form;
// a block with its keys in another order gives the same hash; two «devices» get the same result; duplicate ids; a dead parent;
// a document without the basic shape is reported as bad; sizes are measured in bytes.
import { loadCore } from './lib/core.mjs';
const S=loadCore();
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const clean=h=>h;   // no DOM here: cleanRich is the identity
const shuffle=(a,seed)=>{ const r=[...a]; let x=seed; for(let i=r.length-1;i>0;i--){ x=(x*1103515245+12345)&0x7fffffff; const j=x%(i+1); [r[i],r[j]]=[r[j],r[i]]; } return r; };

const NOTE={title:'Нотатка', created:100, updated:200, blocks:[
  {id:'a1',row:2,fx:0.1,text:'перший',html:'<b>перший</b>',cw:8},
  {id:'ar',row:4,fx:0.2,kind:'area',cw:20,ch:6,title:'Область',color:'neutral',collapsed:false},
  {id:'c1',row:1,parent:'ar',col:0,kind:'code',text:'x=1',lang:'js',wrap:false,num:true,open:false},
  {id:'t2',row:3,parent:'ar',col:1,text:'в області'}]};

// 1 the canonical form does not depend on the block order or the key order; defaults are dropped
const reordered={...NOTE, blocks:shuffle(NOTE.blocks,7).map(b=>Object.fromEntries(Object.keys(b).reverse().map(k=>[k,b[k]])))};
ok('1 shuffled blocks with reversed keys give the same canonical JSON and hash', S.cjson(reordered)===S.cjson(NOTE) && S.hashDoc(reordered)===S.hashDoc(NOTE));
const withDefaults={...NOTE, deleted:0, archived:null, pinned:0, blocks:NOTE.blocks.map(b=>({...b, wrap:b.wrap||false, html:b.html||'', title:b.title||''}))};
ok('1b defaults (wrap:false, html:"", title:"", deleted:0, archived:null, pinned:0) do not change the canonical form', S.cjson(withDefaults)===S.cjson(NOTE));
ok('1c -0 reads as 0 and undefined fields are dropped', S.cjson({title:'',blocks:[{id:'z',row:-0,fx:undefined,text:''}],created:1,updated:1})===S.cjson({title:'',blocks:[{id:'z',row:0,fx:0,text:''}],created:1,updated:1}));
{ const wire=S.canon(NOTE), kid=wire.blocks.find(b=>b.id==='c1'), back=S.normNote(wire,{cleanRich:clean});
  ok('1e a block in an area\'s first column loses col 0 in the canonical form, as fx 0 does, and normalizes back with col 0 (found on .dev: 7 notes quarantined)', kid && kid.col===undefined && back.note && back.note.blocks.find(b=>b.id==='c1').col===0 && S.cjson(back.note)===S.cjson(NOTE)); }
{ const one=(...blocks)=>S.normNote({title:'',created:1,updated:1,blocks},{cleanRich:clean}), AR={id:'ar',row:1,fx:0,kind:'area',cw:3};
  const miss=one({id:'s',row:1,text:'t'}), nul=one({id:'s',row:1,fx:null,col:2,text:'t'}), str=one({id:'s',row:1,fx:'0.5',text:'t'}), obj=one({id:'s',row:1,fx:{},text:'t'}), nan=one({id:'s',row:1,fx:NaN,text:'t'});
  ok('1f a block on the sheet: a missing or null fx reads as 0 and a stray col goes; a string, an object or NaN as fx is refused', miss.note && miss.note.blocks[0].fx===0 && nul.note && nul.note.blocks[0].fx===0 && nul.note.blocks[0].col===undefined && str.bad && obj.bad && nan.bad);
  const kn=one(AR,{id:'k',row:1,parent:'ar',col:null,fx:0.3,text:'t'}), ks=one(AR,{id:'k',row:1,parent:'ar',col:'1',text:'t'});
  ok('1g a block in an area: a null col reads as 0 and a stray fx goes; a string col is refused', kn.note && kn.note.blocks.find(b=>b.id==='k').col===0 && kn.note.blocks.find(b=>b.id==='k').fx===undefined && ks.bad); }
ok('1d sameDoc ignores updated only', S.sameDoc(NOTE,{...NOTE,updated:999}) && !S.sameDoc(NOTE,{...NOTE,title:'інша'}));

// 2 the normalizer is idempotent and two devices agree
const n1=S.normNote(NOTE,{cleanRich:clean}), n2=S.normNote(n1.note,{cleanRich:clean}), other=S.normNote(reordered,{cleanRich:clean});
ok('2 norm(norm(x)) == norm(x)', n1.note && JSON.stringify(n2.note)===JSON.stringify(n1.note));
ok('2b two devices normalizing different orders of the same note get one canonical form', other.note && S.cjson(other.note)===S.cjson(n1.note));
ok('2c the array order of a valid note is kept as given (canonical order is for hashing only)', n1.note.blocks.map(b=>b.id).join()==='a1,ar,c1,t2');

// 3 duplicate ids, a dead parent, a parent fixed before deduplication
const dup=S.normNote({title:'d',created:1,updated:1,blocks:[{id:'x',row:1,parent:'nope',col:2,text:''},{id:'x',row:1,fx:0,text:''},{id:'x',row:1,fx:0,text:'other'},{id:'ar',row:5,fx:0,kind:'area',cw:3},{id:'k',row:1,parent:'ar',col:0,text:'kid'}]},{cleanRich:clean});
const ids=dup.note.blocks.map(b=>b.id);
ok('3 duplicates: the copy that differs only by a dead parent is dropped, the other differing one is renamed id~hash ('+ids.join(' ')+')', ids.length===4 && ids.filter(i=>i==='x').length===1 && ids.some(i=>/^x~/.test(i)) && !dup.note.blocks.some(b=>b.parent==='nope'));
ok('3b a block in a real area keeps its parent', dup.note.blocks.find(b=>b.id==='k').parent==='ar');
const dead=S.normNote({title:'',created:1,updated:1,blocks:[{id:'q',row:1,parent:'gone',col:3,text:'t'}]},{cleanRich:clean}).note.blocks[0];
ok('3c a parent to a missing area: the block goes to the sheet with fx 0 and no col', dead.parent===undefined && dead.col===undefined && dead.fx===0);

// 4 shape errors
const bad=[[null,'shape'],[{title:5,blocks:[],created:1,updated:1},'title'],[{title:'',blocks:'no',created:1,updated:1},'blocks'],[{title:'',blocks:[],created:'x',updated:1},'time'],
  [{title:'',blocks:[{id:'',row:1,fx:0}],created:1,updated:1},'blocks'],[{title:'',blocks:[{id:'a',row:'1',fx:0}],created:1,updated:1},'blocks'],[{title:'',blocks:[{id:'a',row:1,fx:0,kind:'table'}],created:1,updated:1},'blocks'],
  [{title:'',blocks:[],created:1,updated:1,deleted:'yes'},'deleted'],[{title:'',blocks:[],created:1,updated:1,pinned:-5},'pinned'],[{title:'',blocks:[],created:1,updated:1,revived:{from:'',dev:'d',at:1}},'revived'],[{title:'x'.repeat(2001),blocks:[],created:1,updated:1},'title']];
ok('4 bad shapes are reported, not repaired: '+bad.map(([d,why])=>S.normNote(d,{cleanRich:clean}).bad).join(','), bad.every(([d,why])=>S.normNote(d,{cleanRich:clean}).bad===why));
ok('4b a good revived field with dn and title passes', S.normNote({title:'',blocks:[],created:1,updated:1,revived:{from:'n1',dev:'dev1',dn:'Chrome',title:'Стара',at:5}},{cleanRich:clean}).note.revived.title==='Стара');
ok('4b2 a pinned note keeps its pin time; pinned:0 or null means «not pinned» and is dropped', S.normNote({title:'',blocks:[],created:1,updated:1,pinned:7},{}).note.pinned===7 && !('pinned' in S.normNote({title:'',blocks:[],created:1,updated:1,pinned:0},{}).note) && !('pinned' in S.normNote({title:'',blocks:[],created:1,updated:1,pinned:null},{}).note));
ok('4c html goes through cleanRich and an empty result drops the field', S.normNote({title:'',blocks:[{id:'a',row:1,fx:0,text:'t',html:'<i>t</i>'}],created:1,updated:1},{cleanRich:()=>''}).note.blocks[0].html===undefined);

// 5 versions
const v=S.normVersion({note:'n1',t:5,name:'Реліз',title:'T',blocks:[{id:'a',row:1,fx:0,text:'t',s:'тіло'}]},{cleanRich:clean});
ok('5 a version with inline bodies normalizes; a version without a name is bad', v.version && v.version.name==='Реліз' && S.normVersion({note:'n1',t:5,name:'',title:'',blocks:[]},{}).bad==='name');

// 6 bytes and times
ok('6 docBytes counts UTF-8 bytes ('+S.docBytes({title:'ааааа',blocks:[],created:1,updated:1})+' for five Cyrillic letters in the title)', S.docBytes({title:'ааааа',blocks:[],created:1,updated:1})-S.docBytes({title:'',blocks:[],created:1,updated:1})===10);
ok('6b clearlyNewer needs a real second: 2 ms across a second boundary is not newer, 1.001 s is', !S.clearlyNewer({s:11,ns:1e6},{s:10,ns:999e6}) && S.clearlyNewer({s:12,ns:0},{s:10,ns:999e6}) && S.cmpSrv({s:1,ns:5},{s:1,ns:6})<0);
ok('6c hashOf is the FNV-1a + djb2 + length hash of the versions code', S.hashOf('abc')==='7aigaz375fut3');

// 7 history manifests shared with index.html: a body over V_BODY_MAX gets h:null, the manifest is ordered by id
const m=S.manifestOf('t',[{id:'b',row:1,fx:0,text:'x'.repeat(S.V_BODY_MAX+1)},{id:'a',row:1,fx:0,text:'y',html:'<b>y</b>'}]);
ok('7 manifestOf: ordered by id, big body h:null, rich body hashed by its html', m.blocks[0].id==='a' && m.blocks[1].h===null && m.blocks[0].h===S.hashOf('<b>y</b>') && typeof m.sig==='string');
ok('7b sumOf counts a change and a move', JSON.stringify(S.sumOf(S.manifestOf('t',[{id:'a',row:2,fx:0,text:'z'}]), m))==='{"ch":1,"add":0,"del":1,"mv":0,"ttl":0}');

console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
