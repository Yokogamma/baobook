// Sync core in the browser, part 2: sending (docs/SYNC-PLAN.md §4.5). The cloud moved ahead while a device was offline: the local merge,
// the result equal to the cloud, copies kept, base and queue right; a merge equal to the remote sends nothing; a lost confirmation
// followed by another device's write (the receipt resolves it, the later document is applied); a failure before every step; a failed
// insurance writes nothing to the cloud; two runners of one op; a shifted clock decides a conflict by the key and the losing side is
// kept with its device; the device budget stops sending and the next day resumes it; two devices converge after a series of edits.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, syncRecs, typeAt, openNote, curId, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const off=(d,on)=>d.pg.evaluate(on=>{ sheetDebug.sync.online(on); }, on);
const edit=async(d,id,blockText,add)=>{ await d.pg.bringToFront(); await openNote(d.pg,id); const t=d.pg.locator('#sheet .blk .txt').filter({hasText:blockText}).first(); await t.click(); await d.pg.keyboard.press('End'); await d.pg.keyboard.type(add); await d.pg.keyboard.press('Escape'); await d.pg.waitForTimeout(600); };
const texts=n=>n.blocks.map(b=>b.text).sort().join(' | ');
const both=async(A,B)=>{ for(let i=0;i<4;i++){ await settle(A.pg,300); await settle(B.pg,300); } };
const cloud=new TestCloud({start:Date.now()});
// the insurance can be made to fail: a put of a try: record throws while localStorage.__failTry is set
const FAIL_TRY=()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v){ let f=''; try{ f=localStorage.getItem('__failTry')||''; }catch(_){} if(this.name==='sync' && f && v && typeof v.k==='string' && v.k.startsWith('try:')) throw new DOMException('test failure','UnknownError'); return put.apply(this, arguments); }; };
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}, init:FAIL_TRY}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX, connect:{pace:PACE}});

/* ── 1. the cloud moved ahead: the local merge sends a fast-forward that equals the local copy; the queue and the base are right ── */
await typeAt(A.pg,500,300,'блок один'); await typeAt(A.pg,500,420,'блок два'); const id=await curId(A.pg); await both(A,B);
ok('1 the note is on both devices and in the cloud', !!(await stored(B.pg,'notes',id)) && !!cloud.doc('notes',id));
await off(A,false); await edit(A,id,'блок один',' (A офлайн)'); await edit(B,id,'блок два',' (B)'); await settle(B.pg);
const revBeforeA=cloud.doc('notes',id).rev; await off(A,true); await both(A,B);
const an=await stored(A.pg,'notes',id), cn=cloud.doc('notes',id), st=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id);
ok('1b after A came back the cloud holds the merge of both edits and equals A\'s record ('+texts(cn)+')', texts(an)===texts(cn) && /\(A офлайн\)/.test(texts(cn)) && /\(B\)/.test(texts(cn)) && cn.rev===revBeforeA+1);
ok('1c A: no job, no try, the base is the cloud document, baseLrev = lrev', !st.job && !st.tr && st.meta.base.rev===cn.rev && st.meta.baseLrev===st.meta.lrev);
ok('1d no conflict copies (different blocks), the state before the merge is in A\'s history', !st.versions.some(v=>v.reason==='copy') && st.versions.some(v=>v.reason==='incoming'));
const bn=await stored(B.pg,'notes',id); ok('1e B has the same text', texts(bn)===texts(cn));

/* ── 2. the same block on both sides: the key decides, the loser is a copy; a merge equal to the remote sends nothing ── */
await A.pg.evaluate(()=>{ sheetDebug.sync.clock=-3600e3; });   // A's clock is an hour behind: A loses concurrent conflicts
await off(A,false); await edit(A,id,'блок один',' X'); await edit(B,id,'блок один',' Y'); await settle(B.pg); const revY=cloud.doc('notes',id).rev;
await off(A,true); await both(A,B);
const a2=await stored(A.pg,'notes',id), s2=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id), copies2=s2.versions.filter(v=>v.reason==='copy');
ok('2 A\'s clock behind: B\'s edit stays, A\'s becomes a conflict copy on A with A\'s device ('+copies2.map(c=>c.dev+':'+c.blocks.map(e=>e.s).join('/')).join('; ')+')', /Y$/.test(a2.blocks.find(b=>/блок один/.test(b.text)).text) && copies2.length===1 && copies2[0].dev==='A' && copies2[0].keep===1 && copies2[0].inline===1 && copies2[0].blocks.some(e=>/ X$/.test(e.s)));
ok('2b the merge result equals the remote by content: nothing was sent (rev '+cloud.doc('notes',id).rev+' = '+revY+'), the job is gone', cloud.doc('notes',id).rev===revY && !s2.job);
await A.pg.evaluate(()=>{ sheetDebug.sync.clock=3600e3; });   // now A's clock runs ahead: A wins
await off(A,false); await edit(A,id,'блок два',' P'); await edit(B,id,'блок два',' Q'); await settle(B.pg); const revQ=cloud.doc('notes',id).rev;
await off(A,true); await both(A,B);
const a3=await stored(A.pg,'notes',id), s3=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id), copies3=s3.versions.filter(v=>v.reason==='copy');
ok('2c A\'s clock ahead: A\'s edit wins and is sent, B\'s side is the copy with B\'s device name ('+copies3.map(c=>c.dn).join(',')+')', /P$/.test(a3.blocks.find(b=>/блок два/.test(b.text)).text) && cloud.doc('notes',id).rev===revQ+1 && copies3.some(c=>c.dev==='B' && c.dn==='Device B' && c.blocks.some(e=>/ Q$/.test(e.s))));
ok('2d B took the result', texts(await stored(B.pg,'notes',id))===texts(cloud.doc('notes',id)));
await A.pg.evaluate(()=>{ sheetDebug.sync.clock=0; });

/* ── 3. a lost confirmation, then another device writes on top: the receipt resolves the attempt, the later document is applied ── */
cloud.fault('lost',{dev:'A'}); cloud.fault('fail',{n:3, code:'unavailable', dev:'A'});   // A's response is lost and its next three calls fail, while B writes on top
await edit(A,id,'блок один',' L'); await settle(A.pg,100); await settle(A.pg,0);
const sL=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id); ok('3 the response was lost: the write is in the cloud, A still has the attempt or has resolved it by the receipt', /L$/.test(cloud.doc('notes',id).blocks.find(b=>/блок один/.test(b.text)).text) && (!!sL.tr || !sL.job));
await edit(B,id,'блок два',' M'); await settle(B.pg); const revM=cloud.doc('notes',id).rev;
await both(A,B); await A.pg.waitForTimeout(400); await both(A,B);
const a4=await stored(A.pg,'notes',id), s4=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id);
ok('3b A resolved its attempt by the receipt and applied B\'s later document ('+texts(a4)+')', !s4.tr && !s4.job && s4.meta.base.rev===revM && /L$/.test(a4.blocks.find(b=>/блок один/.test(b.text)).text) && /M$/.test(a4.blocks.find(b=>/блок два/.test(b.text)).text) && cloud.doc('notes',id).rev===revM);
ok('3c seen matches the cloud', (await A.pg.evaluate(()=>sheetDebug.sync.seen())).notes.find(s=>s.k==='seen:n:'+id).rev===revM);

/* ── 4. a failure before every step, then a failed insurance ── */
for(let i=0;i<4;i++) cloud.fault('fail',{n:1, code:i%2? 'deadline-exceeded' : 'unavailable', dev:'A'});
await edit(A,id,'блок один',' F'); await both(A,B); await A.pg.waitForTimeout(500); await both(A,B);
ok('4 failures before each step: the edit still arrives in the cloud and on B', /F$/.test(cloud.doc('notes',id).blocks.find(b=>/блок один/.test(b.text)).text) && /F$/.test((await stored(B.pg,'notes',id)).blocks.find(b=>/блок один/.test(b.text)).text));
await A.pg.evaluate(()=>localStorage.setItem('__failTry','1')); const revBefore=cloud.doc('notes',id).rev;
await edit(A,id,'блок один',' G'); await settle(A.pg,300); await settle(A.pg,0);
const s5=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id);
ok('4b the insurance cannot be written: nothing went to the cloud, the job waits, no try', cloud.doc('notes',id).rev===revBefore && !!s5.job && !s5.tr);
await A.pg.evaluate(()=>localStorage.removeItem('__failTry')); await both(A,B);
ok('4c once the insurance can be written the edit goes', cloud.doc('notes',id).rev===revBefore+1 && /G$/.test(cloud.doc('notes',id).blocks.find(b=>/блок один/.test(b.text)).text));

/* ── 5. two runners of one op: the callback runs twice, the second run finds the receipt and writes nothing ── */
cloud.fault('tworunners',{dev:'A'}); const revT=cloud.doc('notes',id).rev; await edit(A,id,'блок два',' T'); await both(A,B);
ok('5 two runners: one write, accepted, no error', cloud.doc('notes',id).rev===revT+1 && !(await A.pg.evaluate(id=>sheetDebug.sync.state(id), id)).tr && !A.errs.length);

/* ── 6. the device budget: two writes a day, then a stop; the next day it goes on ── */
const C=await newDevice(br, cloud, SITE, 'C', {ctx:CTX, connect:{pace:PACE, budgets:{reads:100000, writes:1}}});
await settle(C.pg,600); await settle(C.pg); const seenC=(await C.pg.evaluate(()=>sheetDebug.sync.seen())).notes.length;
ok('6 C caught up with the cloud ('+seenC+' documents seen)', seenC>=1);
await typeAt(C.pg,500,300,'перша C'); await settle(C.pg); const idC=await curId(C.pg);
await C.pg.evaluate(()=>sheetDebug.sync.engine().writeLocal('lim1',(Cn,m,t)=>({title:'Третя',blocks:[{id:'q',row:1,fx:0,text:'третя'}],created:t,updated:t}))); await C.pg.evaluate(()=>sheetDebug.sync.wake()); await settle(C.pg,300); await settle(C.pg,0);
const stC=await C.pg.evaluate(()=>sheetDebug.sync.status);
ok('6b the budget of one write is spent: status «limit», the next note waits ('+JSON.stringify(stC)+')', stC.code==='limit' && !!cloud.doc('notes',idC) && !cloud.doc('notes','lim1'));
await C.pg.evaluate(()=>{ sheetDebug.sync.clock=25*3600e3; }); await C.pg.evaluate(()=>sheetDebug.sync.wake()); await settle(C.pg,300); await settle(C.pg,0);
ok('6c the next Pacific day the queue moves again (the budget of one write is spent once more)', !!cloud.doc('notes','lim1') && (await C.pg.evaluate(()=>sheetDebug.sync.state('lim1'))).meta.base.rev===1);
await C.pg.evaluate(()=>{ sheetDebug.sync.clock=0; });

/* ── 7. convergence after a series of edits on both devices ── */
for(let i=0;i<3;i++){ await edit(A,id,'блок один',' a'+i); await edit(B,id,'блок два',' b'+i); await both(A,B); }
await both(A,B); const fa=await stored(A.pg,'notes',id), fb=await stored(B.pg,'notes',id), fc=cloud.doc('notes',id);
ok('7 after six edits on two devices all three copies agree ('+texts(fc)+')', texts(fa)===texts(fc) && texts(fb)===texts(fc) && fa.updated===fc.updated && fb.updated===fc.updated);
ok('7b both devices report «synced»', (await A.pg.evaluate(()=>sheetDebug.sync.status)).code==='synced' && (await B.pg.evaluate(()=>sheetDebug.sync.status)).code==='synced');
ok('8 no page errors', !A.errs.length && !B.errs.length && !C.errs.length);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
