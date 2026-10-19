// Sync core in the browser, part 7: the automatic purge by the device clock (docs/SYNC-PLAN.md §4.8). The leader looks for notes in the trash
// whose server date is over 30 days old by this device's clock and sends automatic tombstones; the rules judge the age by their own clock, so a
// device clock that runs ahead gets its purge refused as early and tries again the next day (not «no access»); a restore on another device
// that races the purge changes the revision, the attempt is rejected and the note comes back to the list.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, syncRecs, cloudWrite } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const DAY=864e5, PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const quiet=async(d,k=3)=>{ for(let i=0;i<k;i++) await settle(d.pg,300); };
const wake=d=>d.pg.evaluate(()=>sheetDebug.sync.wake());
const clock=(d,ms)=>d.pg.evaluate(ms=>{ sheetDebug.sync.clock=ms; }, ms);
const write=async(d,id,fn,arg)=>{ const r=await d.pg.evaluate(([id,src,arg])=>{ const f=(0,eval)(src); return sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>f(C,m,t,arg)); }, [id,fn.toString(),arg]); if(!r.ok) console.log('  (write of '+id+' refused: '+r.code+')'); await wake(d); return r; };
const trash=(d,id)=>write(d,id,(C,m,t)=>({...C, deleted:t, updated:t}));
const state=(d,id)=>d.pg.evaluate(id=>sheetDebug.sync.state(id), id);
const job=async(d,id)=>(await syncRecs(d.pg,'out:')).find(r=>r.k==='out:n:'+id);
const logOf=(d,re,id)=>d.pg.evaluate(([re,id])=>sheetDebug.sync.log().filter(e=>new RegExp(re).test(e.t) && (!id || e.id===id)), [re,id]);
const status=d=>d.pg.evaluate(()=>sheetDebug.sync.status);
const listed=d=>d.pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(x=>x.dataset.id));
const body=d=>{ const o={title:d.title, blocks:d.blocks, created:d.created, updated:d.updated}; for(const k of ['archived','revived']) if(d[k]!==undefined) o[k]=d[k]; return o; };
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}});
for(const i of [1,2,3,4]) cloudWrite(cloud,'y'+i,{title:'', blocks:[{id:'b',row:1,fx:0,text:'y'+i}]}); await quiet(A,3);
ok('0 the notes from the phone are on A, the catch-up is done', (await listed(A)).filter(x=>/^y\d$/.test(x)).length===4 && await A.pg.evaluate(()=>sheetDebug.sync.engine()._S.everCaughtUp));

/* ── 1. trashed notes get their server date into the base through the echo; nothing is purged while the trash is young ── */
await trash(A,'y1'); await trash(A,'y2'); await quiet(A,3);
const s1=await state(A,'y1');
ok('1 y1 is in the trash in the cloud with a server tsrv, known in the base here', !!cloud.doc('notes','y1').deleted && !!cloud.doc('notes','y1').tsrv && !!s1.meta.base.tsrv && s1.meta.base.tsrv.s===cloud.doc('notes','y1').tsrv.s);
await wake(A); await quiet(A,2);
ok('1b the purge step ran and found no candidate (the trash is minutes old by the device clock)', (await logOf(A,'^purge-auto$')).length===0 && !cloud.doc('notes','y1').purged);

/* ── 2. the device clock runs 31 days ahead: y1 and y2 are candidates here, the server refuses them as early ── */
await clock(A, 31*DAY+60000); await A.pg.evaluate(()=>{ sheetDebug.sync.engine()._S.lastPurge=0; }); await wake(A); await quiet(A,3);
const j1=await state(A,'y1'), j2=await state(A,'y2'), early=await logOf(A,'^purge-early$');
ok('2 both were tried as automatic tombstones and refused by the server clock: no tombstone in the cloud, the attempts gone, the jobs wait a day (tomb, auto, wait), the refusals logged ('+early.length+')', !cloud.doc('notes','y1').purged && !cloud.doc('notes','y2').purged && !j1.tr && !!j1.job && j1.job.tomb && j1.job.auto && j1.job.wait>Date.now()+31*DAY && !j2.tr && !!j2.job && j2.job.wait>0 && early.length===2 && (await logOf(A,'^purge-auto$')).length>=2);
ok('2b not «no access»: the status is not denied ('+(await status(A)).code+') and the notes are still in the trash here', (await status(A)).code!=='denied' && (await stored(A.pg,'notes','y1')).deleted>0 && (await stored(A.pg,'notes','y2')).deleted>0);
const ins0=(await logOf(A,'^insure$')).length; await wake(A); await quiet(A,2); ok('2c a later step tries nothing again before the wait ('+ins0+' attempts so far)', (await logOf(A,'^insure$')).length===ins0 && (await logOf(A,'^purge-early$')).length===2);

/* ── 3. a restore on the phone cancels the wait of y2: it goes as an ordinary edit and comes back to the list ── */
const d2=cloud.doc('notes','y2'); cloud.write('notes',{id:'y2', ...body(d2), updated:cloud.now()+1},{dev:'phone', dn:'Телефон'}); await quiet(A,3);
const n2=await stored(A.pg,'notes','y2'), j2b=await job(A,'y2');
ok('3 y2 was restored on the phone: live here and listed, no job left, no tombstone', !!n2 && !n2.deleted && (await listed(A)).includes('y2') && !j2b && !cloud.doc('notes','y2').purged && !cloud.doc('notes','y2').deleted);

/* ── 4. the next day by both clocks: the purge of y1 is accepted ── */
cloud.advance(30*DAY+2000); await clock(A, 32*DAY+120000); await wake(A); await quiet(A,3);
const c1=cloud.doc('notes','y1'), s1b=await state(A,'y1');
ok('4 the next day the tombstone of y1 went through: purged with auto in the cloud, the note gone here, nothing left in the queue', !!c1.purged && c1.auto===true && !s1b.note && !s1b.job && !s1b.tr && !!s1b.purged && !(await listed(A)).includes('y1'));

/* ── 5. a restore racing the purge: the phone restores y3 while the tombstone's transaction is in flight; the attempt is rejected ── */
await trash(A,'y3'); await quiet(A,3); const s3=await state(A,'y3');
ok('5 y3 is in the trash in the cloud and here with its server date', !!cloud.doc('notes','y3').deleted && !!s3.note && !!s3.note.deleted && !!s3.meta.base.tsrv);
cloud.setTsrv('y3', cloud.now()-31*DAY); await clock(A, 64*DAY);   // old enough by the server (the purge would pass) and by the device (a candidate)
let release; const held=new Promise(r=>{ release=r; }); cloud.fault('hold',{dev:'A', op:'txn', promise:held});
await A.pg.evaluate(()=>{ sheetDebug.sync.engine()._S.lastPurge=0; }); await wake(A);
const tr3=await until(async()=>(await state(A,'y3')).tr, 5000);
ok('5a the purge of y3 was insured (purged, auto) and its transaction is held', !!tr3 && !!tr3.result.purged && tr3.result.auto===true);
const d3=cloud.doc('notes','y3'); cloud.write('notes',{id:'y3', ...body(d3), updated:cloud.now()+1},{dev:'phone', dn:'Телефон'}); release(); await quiet(A,4);
const c3=cloud.doc('notes','y3'), s3b=await state(A,'y3');
ok('5b the restore landed first: the attempt was rejected by the revision (rev '+c3.rev+'), no tombstone, y3 is live here and listed, no job', !c3.purged && !c3.deleted && c3.rev===d3.rev+1 && !!s3b.note && !s3b.note.deleted && !s3b.tr && !s3b.job && (await listed(A)).includes('y3') && (await logOf(A,'^rejected$','y3')).length===1 && (await logOf(A,'^purged$','y3')).length===0);
ok('6 no page errors', !A.errs.length); if(A.errs.length) console.log(A.errs);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
