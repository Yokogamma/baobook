// The sync core under Node: merging (docs/SYNC-PLAN.md §4.7). merge3 against a base, merge0 without one, moveInto for a revived note:
// note fields and the two block groups, deletion against a change, conflicts decided by the key (updated, dev, hash) with the losing
// side kept as a copy (one side or both), the trash period extended by an edit, a result equal to the remote taking its `updated`,
// a result with local changes getting the local stamp, and the trace that names why content disappeared.
import { loadCore } from './lib/core.mjs';
const S=loadCore();
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const blk=(id,row,text,more={})=>({id,row,fx:0,text,...more});
const base={title:'База',created:100,updated:1000,blocks:[blk('a',1,'A'),blk('b',2,'B'),blk('c',3,'C')]};
const cloud=(body,more)=>({v:1,rev:3,op:'o1',srv:{s:10,ns:0},dev:'other',dn:'Телефон',rcpt:{other:'o1'},...body,...more});   // a cloud document carries service fields
const ctx={dev:'me',t:5000};
const text=(n,id)=>(n.blocks.find(b=>b.id===id)||{}).text;

// 1 one side changes a block, the other another block or its place: no conflict, both changes in the result
{ const L={...base,updated:2000,blocks:[blk('a',1,'A1'),blk('b',2,'B'),blk('c',3,'C')]}, R=cloud({...base,updated:1500,blocks:[blk('a',1,'A'),blk('b',7,'B'),blk('c',3,'C'),blk('d',4,'D')]});
  const m=S.merge3(base,L,R,ctx);
  ok('1 content from L, place from R, a new block from R; nothing lost', text(m.note,'a')==='A1' && m.note.blocks.find(b=>b.id==='b').row===7 && text(m.note,'d')==='D' && !m.lost.local && !m.lost.remote && m.copies.length===0);
  ok('1b the result has local changes, so updated is the local stamp and no service field leaks in', m.note.updated===5000 && !('rcpt' in m.note) && !('dev' in m.note));
  ok('1c the trace says L\'s A was superseded causally… no: R kept the base, so only R\'s base copy of a disappears causally ('+JSON.stringify(m.trace)+')', m.trace.length===1 && m.trace[0].id==='a' && m.trace[0].side==='R' && m.trace[0].cause==='causal'); }

// 2 the same block changed differently on both sides: the larger key wins, the loser is a copy
{ const L={...base,updated:2000,blocks:[blk('a',1,'A-local'),blk('b',2,'B'),blk('c',3,'C')]}, R=cloud({...base,updated:1500,blocks:[blk('a',1,'A-remote'),blk('b',2,'B'),blk('c',3,'C')]});
  const m=S.merge3(base,L,R,ctx), m2=S.merge3(base,L,cloud({...R,updated:2500}),ctx);
  ok('2 L is later → L wins, R becomes the copy', text(m.note,'a')==='A-local' && m.lost.remote && !m.lost.local && m.copies.length===1 && m.copies[0].side==='R' && m.trace.some(x=>x.id==='a' && x.side==='R' && x.cause==='key'));
  ok('2b R is later → R wins, L becomes the copy', text(m2.note,'a')==='A-remote' && m2.lost.local && m2.copies[0].side==='L');
  const tie=S.merge3(base,{...L,updated:1500},cloud({...R,updated:1500,dev:'zz'}),ctx);
  ok('2c equal updated: dev decides (zz > me), so R wins', text(tie.note,'a')==='A-remote'); }

// 3 both sides lose somewhere → both copies; place and content are independent groups
{ const L={...base,updated:2000,blocks:[blk('a',1,'A-local'),blk('b',2,'B'),blk('c',9,'C')]}, R=cloud({...base,updated:1500,blocks:[blk('a',1,'A-remote'),blk('b',2,'B'),blk('c',3,'C-remote')]});
  const m=S.merge3(base,L,R,ctx);
  ok('3 L wins everywhere by key, R loses; c: place from L, content from R (independent groups)', text(m.note,'a')==='A-local' && m.note.blocks.find(b=>b.id==='c').row===9 && text(m.note,'c')==='C-remote' && m.copies.length===1);
  const L2={...L,updated:1200}; const m2=S.merge3(base,L2,R,ctx);
  ok('3b with R later, R wins the conflict on a; c still takes both groups', text(m2.note,'a')==='A-remote' && m2.note.blocks.find(b=>b.id==='c').row===9 && m2.lost.local && !m2.lost.remote);
  const both=S.merge3(base,{...base,updated:2000,title:'Моя',blocks:[blk('a',1,'A-local'),blk('b',2,'B'),blk('c',3,'C')]},cloud({...base,updated:2500,title:'Їхня',blocks:[blk('a',1,'A'),blk('b',2,'B-remote'),blk('c',3,'C')]}),ctx);
  ok('3c title conflict and a block changed on one side only: R wins the title (later), b from R causally, one copy (L)', both.note.title==='Їхня' && text(both.note,'b')==='B-remote' && both.copies.length===1 && both.copies[0].side==='L'); }

// 4 deletion against a change
{ const L={...base,updated:2000,blocks:[blk('a',1,'A'),blk('c',3,'C')]}, R=cloud({...base,updated:1500,blocks:[blk('a',1,'A'),blk('b',2,'B-changed'),blk('c',3,'C')]});
  const m=S.merge3(base,L,R,ctx);
  ok('4 deleted here, changed there → the changed block stays', text(m.note,'b')==='B-changed' && m.copies.length===0);
  const m2=S.merge3(base,L,cloud({...base,updated:1500}),ctx);
  ok('4b deleted here, untouched there → gone, traced as causal', !m2.note.blocks.some(b=>b.id==='b') && m2.trace.some(x=>x.id==='b' && x.cause==='causal'));
  const m3=S.merge3(base,{...base,updated:2000},cloud({...base,updated:1500,blocks:[blk('a',1,'A'),blk('c',3,'C')]}),ctx);
  ok('4c deleted there, untouched here → gone, and the result equals R so it is taken as R with R\'s updated', !m3.note.blocks.some(b=>b.id==='b') && m3.same && m3.note.updated===1500); }

// 5 a result equal to the remote takes it as it is; a receive with no local change is the same path
{ const R=cloud({...base,updated:1500,blocks:[blk('a',1,'A'),blk('b',5,'B'),blk('c',3,'C')]});
  const m=S.merge3(base,{...base},R,ctx);
  ok('5 no local changes: the result is R by content, updated 1500, no copies, same=true', m.same && m.note.updated===1500 && m.copies.length===0 && !('rev' in m.note));
  const ten=Array.from({length:10},()=>S.merge3(R,{...S.noteBody(R)},R,ctx));
  ok('5b ten repeated deliveries of the same state: every merge is «same» and changes nothing', ten.every(x=>x.same && S.sameDoc(x.note,R))); }

// 6 trash against an edit: deleted stays and the period is extended to the merge time
{ const trashed=cloud({...base,updated:1500,deleted:1400});
  const m=S.merge3(base,{...base,updated:2000,blocks:[blk('a',1,'A-edit'),blk('b',2,'B'),blk('c',3,'C')]},trashed,ctx);
  ok('6 the note stays in the trash with the edit, deleted = the merge stamp', m.note.deleted===5000 && text(m.note,'a')==='A-edit');
  const m2=S.merge3(base,{...base},trashed,ctx);
  ok('6b no edit: the trash date is the remote one, nothing extended', m2.note.deleted===1400 && m2.same);
  const restoredL={...base,updated:2000}, baseT={...base,deleted:900}; const m3=S.merge3(baseT,restoredL,cloud({...baseT,updated:1500,blocks:[blk('a',1,'A'),blk('b',2,'B-r'),blk('c',3,'C')]}),ctx);
  ok('6c restored here (deleted removed), edited there in the trash: the restore stands (deleted changed only here) and the edit comes in', m3.note.deleted===undefined && text(m3.note,'b')==='B-r'); }

// 7 note fields: created is the smaller; revived/archived as fields; a dead parent in the result goes to the sheet
{ const m=S.merge3(base,{...base,updated:2000,archived:1900},cloud({...base,created:50,updated:1500,blocks:[blk('a',1,'A'),blk('b',2,'B'),blk('c',3,'C'),{id:'k',row:1,parent:'ar',col:0,text:'kid'}]}),ctx);
  ok('7 archived from L, created = min, a child whose area does not exist goes to the sheet', m.note.archived===1900 && m.note.created===50 && m.note.blocks.find(b=>b.id==='k').parent===undefined && m.note.blocks.find(b=>b.id==='k').fx===0); }

// 7b pinned is a soft field: one side's pin or unpin comes through; pinned differently on both sides, the key decides and nothing is copied
{ const pinB={...base,pinned:800};
  const m=S.merge3(base,{...base,updated:2000,pinned:1900},cloud({...base,updated:1500,blocks:[blk('a',1,'A-r'),blk('b',2,'B'),blk('c',3,'C')]}),ctx);
  ok('7b pinned here, edited there: the pin and the edit both come through, no copies', m.note.pinned===1900 && text(m.note,'a')==='A-r' && m.copies.length===0);
  const m2=S.merge3(pinB,{...pinB,updated:2000,blocks:[blk('a',1,'A-l'),blk('b',2,'B'),blk('c',3,'C')]},cloud({...base,updated:1500}),ctx);
  ok('7c unpinned there, edited here: the note comes out unpinned with the edit', m2.note.pinned===undefined && text(m2.note,'a')==='A-l' && m2.copies.length===0);
  const m3=S.merge3(base,{...base,updated:2000,pinned:1900},cloud({...base,updated:2500,pinned:2400}),ctx), m4=S.merge3(pinB,{...pinB,updated:2600,pinned:2550},cloud({...base,updated:2500}),ctx), m4b=S.merge3(pinB,{...pinB,updated:2400,pinned:2350},cloud({...base,updated:2500}),ctx);
  ok('7d pinned at different times on both sides: the later key wins (R, 2400), no conflict copy', m3.note.pinned===2400 && m3.copies.length===0 && !m3.lost.local && !m3.lost.remote);
  ok('7e pinned anew here while unpinned there: the key decides (L later → pinned, R later → not), no copy', m4.note.pinned===2550 && m4b.note.pinned===undefined && m4.copies.length===0 && m4b.copies.length===0);
  const m5=S.merge3({...base,title:'T0'},{...base,title:'Моя',updated:2000,pinned:1900},cloud({...base,title:'Їхня',updated:2500}),ctx);
  ok('7f a title conflict still makes its copy, and the pin from L stays', m5.note.title==='Їхня' && m5.note.pinned===1900 && m5.copies.length===1 && m5.copies[0].side==='L'); }

// 8 merge0: no base
{ const L={...base,updated:2000,blocks:[blk('a',1,'A-local'),blk('x',4,'X')]}, R=cloud({...base,updated:1500,blocks:[blk('a',1,'A-remote'),blk('y',5,'Y')]});
  const m=S.merge0(L,R,ctx);
  ok('8 union by id, the shared id from the larger key (L), both source copies kept', text(m.note,'a')==='A-local' && text(m.note,'x')==='X' && text(m.note,'y')==='Y' && m.copies.length===2 && m.trace.some(x=>x.id==='a' && x.cause==='key'));
  const d=S.merge0({...L,deleted:3000},R,ctx), d2=S.merge0(L,cloud({...R,deleted:1200,updated:3000}),ctx), d3=S.merge0({...base,deleted:3000},cloud({...base,updated:900}),ctx);
  ok('8b deleted wins whichever side has it; with differing text the trash period restarts at the merge, with equal text the date stays', d.note.deleted===5000 && d2.note.deleted===5000 && d3.note.deleted===3000 && text(d2.note,'x')==='X');
  const same=S.merge0({...base},cloud({...base}),ctx);
  ok('8c equal copies: base = remote, no copies', same.same && same.copies.length===0);
  const p=S.merge0({...L,pinned:1800},R,ctx);
  const po=S.merge0({...base,updated:2000,pinned:1900},cloud({...base,updated:1500}),ctx), po2=S.merge0({...base,updated:1000},cloud({...base,updated:1500,pinned:1400}),ctx);
  ok('8e merge0 of copies that differ only by the pin: no conflict copies, the key decides (L later → pinned 1900; R later → pinned 1400)', po.copies.length===0 && !po.lost.local && !po.lost.remote && po.note.pinned===1900 && po2.copies.length===0 && po2.note.pinned===1400 && po2.same);
  ok('8d merge0 takes pinned from the side with the larger key', p.note.pinned===1800 && S.merge0(L,cloud({...R,pinned:1700,updated:3000}),ctx).note.pinned===1700); }

// 7g color is a soft field like pinned: one side's colour comes through with the other's edit; coloured differently on both sides, the key decides with no copy
{ const m=S.merge3(base,{...base,updated:2000,color:'blue'},cloud({...base,updated:1500,blocks:[blk('a',1,'A-r'),blk('b',2,'B'),blk('c',3,'C')]}),ctx);
  ok('7g coloured here, edited there: the colour and the edit both come through, no copies', m.note.color==='blue' && text(m.note,'a')==='A-r' && m.copies.length===0);
  const m2=S.merge3({...base,color:'pink'},{...base,color:'pink',updated:2000,blocks:[blk('a',1,'A-l'),blk('b',2,'B'),blk('c',3,'C')]},cloud({...base,updated:1500}),ctx);
  ok('7h the colour removed there («Стандартний»), edited here: no colour, the edit stays', m2.note.color===undefined && text(m2.note,'a')==='A-l' && m2.copies.length===0);
  const m3=S.merge3(base,{...base,updated:2000,color:'green'},cloud({...base,updated:2500,color:'yellow'}),ctx), m4=S.merge3(base,{...base,updated:2600,color:'green'},cloud({...base,updated:2500,color:'yellow'}),ctx);
  ok('7i coloured differently on both sides: the later key wins (R yellow, then L green), no conflict copy', m3.note.color==='yellow' && m4.note.color==='green' && m3.copies.length===0 && m4.copies.length===0 && !m3.lost.local && !m3.lost.remote);
  const m5=S.merge3(base,{...base,updated:2000,color:'purple',blocks:[blk('a',1,'A-l'),blk('b',2,'B'),blk('c',3,'C')]},cloud({...base,updated:1500,blocks:[blk('a',1,'A'),blk('b',2,'B-r'),blk('c',3,'C')]}),ctx);
  ok('7j a colour and content changes together: both blocks and the colour merge', m5.note.color==='purple' && text(m5.note,'a')==='A-l' && text(m5.note,'b')==='B-r' && m5.copies.length===0);
  const z=S.merge0({...base,updated:2000,color:'blue'},cloud({...base,updated:1500,color:'pink'}),ctx), z2=S.merge0({...base,updated:1000},cloud({...base,updated:1500,color:'pink'}),ctx);
  ok('7k merge0 of copies that differ only by the colour: no copies, the key decides', z.copies.length===0 && !z.lost.local && !z.lost.remote && z.note.color==='blue' && z2.copies.length===0 && z2.note.color==='pink');
  const r=S.moveInto(null,{...base,updated:4500,color:'green',pinned:4400},{...ctx,t:7000});
  ok('7l moveInto without a revived note keeps the colour and drops the pin', r.note.color==='green' && r.note.pinned===undefined); }

// 9 moveInto: {A, B} plus a late {A′} that never saw B → {A′ or A by key, B}, both sources as copies, B stays
{ const revived={title:'Відновлена',created:1,updated:4000,deleted:3900,blocks:[blk('a',1,'A'),blk('b',2,'B')]}, late={title:'Стара',created:1,updated:4500,blocks:[blk('a',1,'A′')]};
  const m=S.moveInto(revived,late,ctx);
  ok('9 B stays, A′ wins by key (later), the revived note keeps its own title and trash state', text(m.note,'b')==='B' && text(m.note,'a')==='A′' && m.note.title==='Відновлена' && m.note.deleted===3900 && m.changed && m.copies.length===2);
  const again=S.moveInto(m.note,late,ctx);
  ok('9b moving the same text again changes nothing, and the equal source is not duplicated', !again.changed && again.copies.length===2);
  const fresh=S.moveInto(null,late,{...ctx,t:7000});
  ok('9c a new revived note takes the moved copy\'s text and fields, stamped now', text(fresh.note,'a')==='A′' && fresh.note.title==='Стара' && fresh.note.updated===7000); }

// 10 the key and rule 1
ok('10 keyOf: updated, then dev (a local side gets this device), then the hash', S.cmpKey(S.keyOf({updated:5,blocks:[]},'me'),S.keyOf({updated:5,dev:'zz',blocks:[]},'me'))<0 && S.cmpKey(S.keyOf({updated:6,blocks:[]},'me'),S.keyOf({updated:5,dev:'zz',blocks:[]},'me'))>0);
const seen={rev:5,srv:{s:100,ns:0}};
ok('10b placeAgainstSeen: older rev is stale on delivery and rewritten on a server read; older rev with a clearly newer srv is recreated', S.placeAgainstSeen({rev:4,srv:{s:90,ns:0}},seen)==='stale' && S.placeAgainstSeen({rev:4,srv:{s:90,ns:0}},seen,true)==='rewritten' && S.placeAgainstSeen({rev:1,srv:{s:200,ns:0}},seen)==='recreated');
ok('10c a newer rev with a clearly older srv (a state from before a recreation) is stale; a newer rev is otherwise fresh; the echo of an own write (srv unknown) is fresh', S.placeAgainstSeen({rev:6,srv:{s:50,ns:0}},seen)==='stale' && S.placeAgainstSeen({rev:6,srv:{s:100,ns:5}},seen)==='fresh' && S.placeAgainstSeen({rev:6,srv:{s:130,ns:0}},{rev:6,srv:null,after:{s:100,ns:0}})==='fresh' && S.placeAgainstSeen({rev:5,srv:{s:40,ns:0}},{rev:6,srv:null,after:{s:100,ns:0}})==='stale');
ok('10d no seen → fresh; equal rev with equal srv → fresh', S.placeAgainstSeen({rev:1,srv:{s:1,ns:0}},null)==='fresh' && S.placeAgainstSeen({rev:5,srv:{s:100,ns:0}},seen)==='fresh');

console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
