// Sync core in the browser, part 6: the trash and tombstones (docs/SYNC-PLAN.md §4.5 step 5, §4.7). An automatic tombstone whose attempt is
// in flight while the note is restored or edited: the attempt completes, the edits live on in a revived note (in the list after a restore, in
// the trash after an edit); the trash against an edit on another device extends the term; an empty note created and deleted before its first
// send leaves no tombstone and no purged record; a restore before the insurance of an automatic tombstone strips it from the job and goes as
// an ordinary edit; an edit undone before the insurance sends nothing.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, syncRecs, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const quiet=async(d,k=3)=>{ for(let i=0;i<k;i++) await settle(d.pg,300); };
const off=(d,on)=>d.pg.evaluate(on=>{ sheetDebug.sync.online(on); }, on);
const wake=d=>d.pg.evaluate(()=>sheetDebug.sync.wake());
// a local write through the engine: the delta runs in the page, so it takes its argument explicitly instead of closing over Node's scope
const write=async(d,id,fn,arg)=>{ const r=await d.pg.evaluate(([id,src,arg])=>{ const f=(0,eval)(src); return sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>f(C,m,t,arg)); }, [id,fn.toString(),arg]); if(!r.ok) console.log('  (write of '+id+' refused: '+r.code+')'); await wake(d); return r; };
const edit=(d,id,text)=>write(d,id,(C,m,t,text)=>({...C, blocks:C.blocks.map((b,i)=>i? b : {...b, text}), updated:t}), text);
const trash=(d,id)=>write(d,id,(C,m,t)=>({...C, deleted:t, updated:t}));
const restore=(d,id)=>write(d,id,(C,m,t)=>{ const n={...C, updated:t}; delete n.deleted; return n; });
const purge=async(d,id)=>{ const r=await d.pg.evaluate(id=>sheetDebug.sync.engine().purgeLocal(id), id); await wake(d); return r; };
const body=d=>{ const o={title:d.title, blocks:d.blocks, created:d.created, updated:d.updated}; for(const k of ['deleted','archived','revived']) if(d[k]!==undefined) o[k]=d[k]; return o; };
const editCloud=(id, text)=>{ const b=body(cloud.doc('notes',id)); b.blocks=b.blocks.map((x,i)=>i? x : {...x, text}); b.updated=cloud.now(); return cloud.write('notes',{id, ...b},{dev:'phone', dn:'Телефон'}); };
const notesOf=d=>stored(d.pg,'notes');
const revivedFrom=(list,from)=>list.filter(n=>n.revived && n.revived.from===from);
const purgedRec=async(d,id)=>(await syncRecs(d.pg,'purged:')).find(r=>r.k==='purged:n:'+id);
const state=(d,id)=>d.pg.evaluate(id=>sheetDebug.sync.state(id), id);
const job=async(d,id)=>(await syncRecs(d.pg,'out:')).find(r=>r.k==='out:n:'+id);
const text=n=>n.blocks.map(b=>b.text).join(' | ');
const logOf=(d,re,id)=>d.pg.evaluate(([re,id])=>sheetDebug.sync.log().filter(e=>new RegExp(re).test(e.t) && (!id || e.id===id)), [re,id]);
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}});
for(const i of [1,2,3,4,5]) cloudWrite(cloud,'y'+i,{title:'', blocks:[{id:'b',row:1,fx:0,text:'y'+i}]}); await quiet(A,3);
ok('0 the notes from the phone are on A', (await notesOf(A)).filter(n=>/^y\d$/.test(n.id)).length===5);

/* ── 1. an automatic tombstone in flight, the note restored meanwhile: the attempt completes, the restored note lives on in the list ── */
await trash(A,'y1'); await trash(A,'y2'); await quiet(A,2);
cloud.fault('fail',{dev:'A', op:'txn', n:4}); await A.pg.evaluate(()=>sheetDebug.sync.tombstone('y1')); await wake(A); await settle(A.pg,50); const s1=await state(A,'y1');
await restore(A,'y1'); await quiet(A,4); const an1=await notesOf(A), r1=revivedFrom(an1,'y1'), c1=cloud.doc('notes','y1');
ok('1 the attempt was insured (purged, auto) and kept failing; the restore came in between', !!s1.tr && !!s1.tr.result.purged && s1.tr.result.auto===true && !s1.note.deleted===false);
ok('1b the tombstone (auto) went through; y1 is gone and its restored text lives in a revived note in the list, which is in the cloud', !!c1 && !!c1.purged && c1.auto===true && !an1.find(n=>n.id==='y1') && r1.length===1 && !r1[0].deleted && text(r1[0])==='y1' && !!cloud.doc('notes',r1[0].id) && !cloud.doc('notes',r1[0].id).deleted && (await logOf(A,'^tombstone$','y1')).some(e=>e.own && e.changed));

/* ── 1c. the same with an edit instead of a restore: the revived note stays in the trash ── */
cloud.fault('fail',{dev:'A', op:'txn', n:4}); await A.pg.evaluate(()=>sheetDebug.sync.tombstone('y2')); await wake(A); await settle(A.pg,50);
await edit(A,'y2','y2 (правка в кошику)'); await quiet(A,4); const an2=await notesOf(A), r2=revivedFrom(an2,'y2');
ok('1c the edit of a note in the trash lives on in a revived note in the trash ('+(await logOf(A,'^(insure|retry|tombstone|purged)$','y2')).map(e=>e.t).join(' ')+')', !!cloud.doc('notes','y2').purged && !an2.find(n=>n.id==='y2') && r2.length===1 && !!r2[0].deleted && text(r2[0])==='y2 (правка в кошику)' && !!cloud.doc('notes',r2[0].id));

/* ── 2. the trash against an edit on another device: the merge keeps the edit and extends the term ── */
await off(A,false); await trash(A,'y3'); const tA=(await stored(A.pg,'notes','y3')).deleted; await A.pg.waitForTimeout(20); editCloud('y3','y3 (телефон)'); await off(A,true); await quiet(A,3);
const n3=await stored(A.pg,'notes','y3'), c3=cloud.doc('notes','y3');
ok('2 the note is in the trash with the phone\'s text; deleted moved from '+tA+' to '+n3.deleted+'; the cloud has the merge (rev '+c3.rev+')', !!n3 && n3.deleted>tA && text(n3)==='y3 (телефон)' && c3.deleted===n3.deleted && c3.rev===3 && text(c3)==='y3 (телефон)');

/* ── 3. an empty note created and deleted before its first send: no tombstone, no purged record (decision 2) ── */
await off(A,false); await write(A,'e1',(C,m,t)=>({title:'', blocks:[], created:t, updated:t})); const p4=await purge(A,'e1'); await off(A,true); await quiet(A,3);
ok('3 purged locally without a tombstone: nothing in the cloud, no purged:, no job, no meta', p4.ok && p4.tomb===false && !cloud.doc('notes','e1') && !(await purgedRec(A,'e1')) && !(await job(A,'e1')) && !(await syncRecs(A.pg,'meta:n:e1')).length && !(await stored(A.pg,'notes','e1')));

/* ── 4. a restore before the insurance of an automatic tombstone strips it from the job; the restore goes as an ordinary edit ── */
await trash(A,'y4'); await quiet(A,2); const rev5=cloud.doc('notes','y4').rev; await off(A,false); await A.pg.evaluate(()=>sheetDebug.sync.tombstone('y4')); const j5=await job(A,'y4');
await restore(A,'y4'); const j5b=await job(A,'y4'); await off(A,true); await quiet(A,3); const c5=cloud.doc('notes','y4'), s5=await state(A,'y4');
ok('4 the job was a tombstone (auto) and became an ordinary job; the cloud got the live note back (rev '+c5.rev+'), no tombstone', !!j5 && j5.tomb===true && j5.auto===true && !!j5b && !j5b.tomb && !j5b.auto && !c5.purged && !c5.deleted && c5.rev===rev5+1 && !s5.job && !s5.tr && !!s5.note && !s5.note.deleted);

/* ── 5. an edit undone before the insurance: the record equals the base, nothing is sent ── */
const rev6=cloud.doc('notes','y5').rev; await off(A,false); await edit(A,'y5','y5 (тимчасово)'); await edit(A,'y5','y5'); const s6a=await state(A,'y5'); await off(A,true); await quiet(A,3); const s6=await state(A,'y5');
ok('5 offline the job waited with lrev ahead of the base (lrev '+s6a.meta.lrev+' > '+s6a.meta.baseLrev+'); online nothing went out (rev '+cloud.doc('notes','y5').rev+'), the job is gone, baseLrev = lrev', !!s6a.job && s6a.meta.lrev>s6a.meta.baseLrev && cloud.doc('notes','y5').rev===rev6 && !s6.job && !s6.tr && s6.meta.baseLrev===s6.meta.lrev && !(await logOf(A,'^accepted$','y5')).length);
ok('6 no page errors', !A.errs.length);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
