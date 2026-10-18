// Sync core in the browser, part 3: receiving (docs/SYNC-PLAN.md §4.6). An incoming edit leaves the state before it in «Історія», two in a
// row leave both; a delivery repeated at the same rev changes nothing; the echo of an own trash write fills tsrv in the base; after a
// reconnect the listener and the catch-up read only from the cursor; a failed history write leaves the document for a refetch; a version
// delivered late, after its note's tombstone, stays out; more than 200 documents with one srv all arrive on a new device; a failure between
// pages goes on from the cursor; a write between the catch-up and the first listener snapshot arrives with the snapshot; one document
// without space does not stop the page, a lasting QuotaExceededError stops receiving once and an hour later receiving starts over.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, connect, settle, stored, syncRecs, typeAt, openNote, curId, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const pageCalls=[]; { const orig=cloud.page.bind(cloud); cloud.page=(col,q,n,o={})=>{ pageCalls.push({dev:o.dev, col, q:structuredClone(q)}); return orig(col,q,n,o); }; }
// storage faults by flag: a put of a note whose id starts with localStorage.__quota throws QuotaExceededError; a put of an incoming history record throws while __failHist is set
const PATCH=()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v){ let q='', h=''; try{ q=localStorage.getItem('__quota')||''; h=localStorage.getItem('__failHist')||''; }catch(_){}
  if(this.name==='notes' && q && v && typeof v.id==='string' && v.id.startsWith(q)) throw new DOMException('full','QuotaExceededError');
  if(this.name==='versions' && h && v && v.reason==='incoming') throw new DOMException('history failure','UnknownError'); return put.apply(this, arguments); }; };
const texts=n=>n.blocks.map(b=>b.text).sort().join(' | ');
const body=d=>{ const o={title:d.title, blocks:d.blocks, created:d.created, updated:d.updated}; for(const k of ['deleted','archived','revived']) if(d[k]!==undefined) o[k]=d[k]; return o; };
// an edit made by another device straight in the cloud
const editCloud=(id, fn, o={})=>{ const b=body(cloud.doc('notes',id)); fn(b); b.updated=cloud.now(); return cloud.write('notes',{id, ...b},{dev:'phone', dn:'Телефон', ...o}); };
const quiet=async(d,k=3)=>{ for(let i=0;i<k;i++) await settle(d.pg,300); };
const versionsOf=async(d,id)=>(await stored(d.pg,'versions')).filter(v=>v.note===id);
const histText=async(d,v)=>{ const bl=await stored(d.pg,'blobs'); return v.blocks.map(e=>e.s!==undefined? e.s : (bl.find(x=>x.note===v.note && x.h===e.h)||{}).s).join(' | '); };
const logOf=(d,re,id)=>d.pg.evaluate(([re,id])=>sheetDebug.sync.log().filter(e=>new RegExp(re).test(e.t) && (!id || e.id===id)), [re,id]);
const status=d=>d.pg.evaluate(()=>sheetDebug.sync.status);
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}, init:PATCH});

/* ── 1. an incoming edit leaves the state before it in «Історія»; two in a row leave both ── */
await typeAt(A.pg,500,300,'перший текст'); const id=await curId(A.pg); await quiet(A);
ok('1 the note is in the cloud', !!cloud.doc('notes',id) && cloud.doc('notes',id).rev===1);
editCloud(id, b=>{ b.blocks[0].text='перший текст (телефон)'; }); await quiet(A,2);
const n1=await stored(A.pg,'notes',id), inc1=(await versionsOf(A,id)).filter(v=>v.reason==='incoming');
ok('1b the edit is on A, one «incoming» entry holds the text before it', texts(n1)==='перший текст (телефон)' && inc1.length===1 && (await histText(A,inc1[0]))==='перший текст');
await openNote(A.pg,id); await A.pg.click('#histBtn'); await A.pg.waitForTimeout(400); const kinds=await A.pg.locator('#histList .hv-k').allInnerTexts(); await A.pg.click('#histBtn'); await A.pg.waitForTimeout(200);
ok('1c «Історія» names the entry «з іншого пристрою» ('+kinds.join(', ')+')', kinds.some(k=>/з іншого пристрою/.test(k)));
editCloud(id, b=>{ b.blocks[0].text='перший текст (телефон, ще раз)'; }); await quiet(A,2);
const inc2=(await versionsOf(A,id)).filter(v=>v.reason==='incoming');
ok('1d a second incoming edit leaves a second entry; both earlier texts are kept', inc2.length===2 && texts(await stored(A.pg,'notes',id))==='перший текст (телефон, ще раз)' && (await Promise.all(inc2.map(v=>histText(A,v)))).sort().join(' / ')==='перший текст / перший текст (телефон)');

/* ── 2. a delivery repeated at the same rev changes nothing ── */
cloud.fault('dup',{dev:'A'}); editCloud(id, b=>{ b.blocks[0].text='третя правка'; }); await quiet(A,2);
const inc3=(await versionsOf(A,id)).filter(v=>v.reason==='incoming'), rev3=cloud.doc('notes',id).rev, applied3=(await logOf(A,'^applied$',id)).filter(e=>e.rev===rev3);
ok('2 the batch came twice: one new entry, the document applied once (rev '+rev3+')', inc3.length===3 && texts(await stored(A.pg,'notes',id))==='третя правка' && applied3.length===1);

/* ── 3. the echo of an own write fills tsrv in the base ── */
await A.pg.evaluate(id=>sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>({...C, deleted:t, updated:t})), id); await A.pg.evaluate(()=>sheetDebug.sync.wake()); await quiet(A,2);
const cd=cloud.doc('notes',id), st3=await A.pg.evaluate(id=>sheetDebug.sync.state(id), id);
ok('3 the trash write is in the cloud with tsrv, and A\'s base has the same tsrv after the echo', !!cd.deleted && !!cd.tsrv && st3.meta.base.rev===cd.rev && JSON.stringify(st3.meta.base.tsrv)===JSON.stringify(cd.tsrv) && !st3.job && !st3.tr);

/* ── 4. after a reconnect the listener and the catch-up read only from the cursor ── */
const vBefore=(await versionsOf(A,id)).length, cursor=(await syncRecs(A.pg,'cursor:')).find(r=>r.k==='cursor:notes'); pageCalls.length=0;
await A.pg.evaluate(()=>sheetDebug.sync.reconnect()); await quiet(A,2);
const sub=cloud.subs.filter(s=>s.dev==='A' && s.col==='notes').pop(), pg4=pageCalls.filter(c=>c.dev==='A' && c.col==='notes');
ok('4 the listener starts two minutes before the cursor, the catch-up page five; nothing is applied twice', !!(sub && sub.from && cursor) && sub.from.s===cursor.srv.s-120 && pg4.length>=1 && !!pg4[0].q.from && pg4[0].q.from.s===cursor.srv.s-300 && (await versionsOf(A,id)).length===vBefore && texts(await stored(A.pg,'notes',id))==='третя правка');

/* ── 5. a failed history write does not apply the document; it is read again once the history can be written ── */
await A.pg.evaluate(()=>localStorage.setItem('__failHist','1'));
editCloud(id, b=>{ b.blocks[0].text='четверта правка'; }); await quiet(A,2);
const n5=await stored(A.pg,'notes',id), rf5=await syncRecs(A.pg,'refetch:'), err5=await logOf(A,'apply-error',id);
ok('5 the history could not be written: the note is unchanged, a refetch record waits, the error is logged ('+err5.length+')', texts(n5)==='третя правка' && rf5.some(r=>r.k==='refetch:n:'+id) && err5.length>=1);
await A.pg.evaluate(()=>localStorage.removeItem('__failHist')); await A.pg.waitForTimeout(400); await A.pg.evaluate(()=>sheetDebug.sync.wake()); await quiet(A,2);
ok('5b once the history can be written the document is applied and its entry is there', texts(await stored(A.pg,'notes',id))==='четверта правка' && (await versionsOf(A,id)).filter(v=>v.reason==='incoming').length===inc3.length+1 && !(await syncRecs(A.pg,'refetch:')).length);

/* ── 6. a version delivered late, after its note's tombstone, stays out ── */
cloudWrite(cloud,'n2',{title:'Друга', blocks:[{id:'b1',row:1,fx:0,text:'друга'}]}); await quiet(A,2);
ok('6 the note from the phone is on A', !!(await stored(A.pg,'notes','n2')));
cloud.write('versions',{id:'vL', note:'n2', t:cloud.now()-1000, name:'Пізня', title:'Друга', blocks:[{id:'b1',row:1,fx:0,text:'друга (версія)'}]},{dev:'phone', commitAt:cloud.now()+5000});   // seen by the queries only in five seconds
cloud.write('notes',{id:'n2', purged:cloud.now()},{dev:'phone'}); await quiet(A,2);
ok('6b the tombstone is applied: the note is gone, purged: recorded, the version is not there', !(await stored(A.pg,'notes','n2')) && (await syncRecs(A.pg,'purged:')).some(r=>r.k==='purged:n:n2') && !(await stored(A.pg,'versions','vL')));
cloud.advance(6000); cloud.pump(); await quiet(A,2);
ok('6c the late version arrived and was ignored: not stored, but counted as seen', !(await stored(A.pg,'versions','vL')) && (await A.pg.evaluate(()=>sheetDebug.sync.seen())).versions.some(s=>s.k==='seen:v:vL') && (await status(A)).code==='synced');

/* ── 7. more than 200 documents with one srv all arrive on a new device ── */
cloud.auto=false; for(let i=0;i<250;i++) cloudWrite(cloud,'m'+String(i).padStart(3,'0'),{title:'Масова '+i, blocks:[{id:'b',row:1,fx:0,text:'текст '+i}]});
{ const S0=cloud.srvAt(cloud.now()); for(const d of cloud.docs.notes.values()) if(d.id.startsWith('m')) d.srv={s:S0.s, ns:S0.ns}; }   // the console: one srv for all of them
cloud.auto=true; cloud.pump();
const C=await newDevice(br, cloud, SITE, 'C', {ctx:CTX, connect:{pace:PACE}}); await quiet(C,8);
const cn=await stored(C.pg,'notes'), cseen=(await C.pg.evaluate(()=>sheetDebug.sync.seen())).notes, ccur=(await syncRecs(C.pg,'cursor:')).find(r=>r.k==='cursor:notes'), cpages=pageCalls.filter(c=>c.dev==='C' && c.col==='notes');
ok('7 C received '+cn.filter(n=>n.id.startsWith('m')).length+' of 250 documents with one srv over '+cpages.length+' pages; seen matches; the cursor is the last by id', cn.filter(n=>n.id.startsWith('m')).length===250 && cseen.filter(s=>s.k.startsWith('seen:n:m')).length===250 && cpages.length>=2 && !!ccur && ccur.id==='m249' && (await status(C)).code==='synced');
await C.close();

/* ── 8. a failure between pages: the catch-up goes on from the cursor ── */
cloud.fault('fail',{dev:'D', op:'page', skip:1, n:1});
const D=await newDevice(br, cloud, SITE, 'D', {ctx:CTX, connect:{pace:PACE}}); await quiet(D,8);
const dp=pageCalls.filter(c=>c.dev==='D' && c.col==='notes'), dn=await stored(D.pg,'notes'), derr=await logOf(D,'page-error');
ok('8 the second page failed once, the next request repeats its cursor, all documents arrived ('+dp.length+' page requests)', derr.length===1 && dp.length>=3 && !!dp[1].q.after && JSON.stringify(dp[2].q)===JSON.stringify(dp[1].q) && dn.filter(n=>n.id.startsWith('m')).length===250 && (await status(D)).code==='synced');
await D.close();

/* ── 9. a write between the catch-up and the first listener snapshot arrives with the snapshot; until then the status is not «synced» ── */
cloud.auto=false; const E=await newDevice(br, cloud, SITE, 'E', {ctx:CTX, connect:{pace:PACE}}); await quiet(E,6);
const e9=await E.pg.evaluate(()=>({status:sheetDebug.sync.status, done:sheetDebug.sync.log().filter(e=>e.t==='catchup-done').map(e=>e.col)}));
cloudWrite(cloud,'gap1',{title:'У проміжку', blocks:[{id:'b',row:1,fx:0,text:'між catch-up і знімком'}]});
ok('9 the catch-up is done ('+e9.done.join(',')+') but without the listener\'s snapshot the status is «'+e9.status.code+'»', e9.done.includes('notes') && e9.done.includes('versions') && e9.status.code!=='synced' && !!(await stored(E.pg,'notes','m000')));
cloud.auto=true; cloud.pump(); await quiet(E,4);
ok('9b the snapshot brought the write made in between, status «synced»', !!(await stored(E.pg,'notes','gap1')) && (await status(E)).code==='synced');
await E.close();

/* ── 10. one document without space does not stop the page; a lasting QuotaExceededError stops receiving once; an hour later it starts over ── */
cloud.auto=false; cloudWrite(cloud,'q1',{title:'Без місця', blocks:[{id:'b',row:1,fx:0,text:'не вміщається'}]}); cloudWrite(cloud,'z1',{title:'Після', blocks:[{id:'b',row:1,fx:0,text:'після неї на сторінці'}]});
const F=await newDevice(br, cloud, SITE, 'F', {ctx:CTX, connect:false, init:PATCH}); await F.pg.evaluate(()=>localStorage.setItem('__quota','q')); await connect(F.pg,{devId:'F', devName:'Device F', pace:PACE}); await quiet(F,6);
const f10=await F.pg.evaluate(()=>sheetDebug.sync.log().filter(e=>/quota|nospace|catchup-done/.test(e.t))), fn=await stored(F.pg,'notes');
ok('10 the page went on past the document without space (z1 and the rest arrived), the second failure stopped receiving: status «nospace»', !fn.find(n=>n.id==='q1') && !!fn.find(n=>n.id==='z1') && fn.filter(n=>n.id.startsWith('m')).length===250 && (await status(F)).code==='nospace' && f10.some(e=>e.t==='quota') && f10.some(e=>e.t==='nospace'));
cloud.auto=true; cloudWrite(cloud,'q2',{title:'Поки без місця', blocks:[{id:'b',row:1,fx:0,text:'доставлено під час паузи'}]}); cloud.pump(); await quiet(F,2);
ok('10b a delivery during the pause is dropped, receiving stays stopped', !(await stored(F.pg,'notes','q2')) && (await status(F)).code==='nospace');
await F.pg.evaluate(()=>{ localStorage.removeItem('__quota'); sheetDebug.sync.clock=3600e3+5000; sheetDebug.sync.wake(); }); await quiet(F,4);
ok('10c an hour later receiving starts over: q1 and q2 arrive, status «synced»', !!(await stored(F.pg,'notes','q1')) && !!(await stored(F.pg,'notes','q2')) && (await status(F)).code==='synced');
await A.pg.evaluate(()=>sheetDebug.sync.wake()); await quiet(A,2);
ok('11 A has everything too and no device had page errors', !!(await stored(A.pg,'notes','q2')) && (await stored(A.pg,'notes')).filter(n=>n.id.startsWith('m')).length===250 && !A.errs.length && !F.errs.length);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
