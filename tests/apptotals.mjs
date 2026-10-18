// Sync core in the browser, part 4: the totals check and the full pass (docs/SYNC-PLAN.md §4.6). A tombstone of a note never seen here, a
// version of a purged note and a document in quarantine are all in `seen`, so the totals agree; no check runs while an attempt is unresolved;
// a check that lost the race against another device's write is settled by the catch-up without a full pass; a lasting mismatch makes at
// most one full pass a day; a document deleted in the console is found by the pass and sent again, and the other devices take the
// recreated document by rule 1; a document that vanished on the send path is sent again the same way; an old copy restored in the console
// goes to quarantine by the pass and the totals agree; a late delivery of the state before a recreation does not lower `seen`; a recreation
// before the echo of an own write is recognised through `seen.after`; a recreated tombstone is a deletion; a pass over its budget goes on
// the next day and announces nothing until the end; an aggregation error is «unknown»; a commit visible after the window is found by the pass.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, syncRecs, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
// fast checks: a totals check every 600 ms after a match, the second check 300 ms after a mismatch (B and C wait four seconds, so only A makes a full pass)
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300, totalsEvery:600, totalsAfterMatch:600, totalsRecheck:300}, PACE_SLOW={...PACE, totalsRecheck:4000};
const cloud=new TestCloud({start:Date.now()});
let lie=null; { const orig=cloud.totals.bind(cloud); cloud.totals=async(col,o={})=>{ const r=await orig(col,o); if(lie && o.dev===lie && col==='notes') r.count+=1; return r; }; }   // an aggregation that lies to one device
const quiet=async(d,k=3)=>{ for(let i=0;i<k;i++) await settle(d.pg,300); };
const mark=d=>d.pg.evaluate(()=>Date.now()+(sheetDebug.sync.clock||0));
const since=(d,t,re,id)=>d.pg.evaluate(([t,re,id])=>sheetDebug.sync.log().filter(e=>e.at>=t && new RegExp(re).test(e.t) && (!id || e.id===id)), [t,re,id]);
const lastTotals=async(d,col)=>(await since(d,0,'^totals$')).filter(e=>e.col===col).pop();
const seenOf=async(d,k)=>{ const s=await d.pg.evaluate(()=>sheetDebug.sync.seen()); return [...s.notes, ...s.versions].find(r=>r.k===k); };
const status=d=>d.pg.evaluate(()=>sheetDebug.sync.status);
const state=(d,id)=>d.pg.evaluate(id=>sheetDebug.sync.state(id), id);
const edit=async(d,id,title)=>{ await d.pg.evaluate(([id,title])=>sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>({...C, title, updated:t})), [id,title]); await d.pg.evaluate(()=>sheetDebug.sync.wake()); };
const note=i=>({title:'Нотатка '+i, blocks:[{id:'b',row:1,fx:0,text:'текст '+i}]});
let dayA=0; const nextDayA=async()=>{ dayA+=86400e3; await A.pg.evaluate(ms=>{ sheetDebug.sync.clock=ms; sheetDebug.sync.wake(); }, dayA); };

/* ── 1. a tombstone of a note never seen here, a version of a purged note, a document in quarantine: all in seen, the totals agree ── */
cloudWrite(cloud,'p0',{title:'Покійна', blocks:[{id:'b',row:1,fx:0,text:'буде видалена'}]});
cloud.write('versions',{id:'vp0', note:'p0', t:cloud.now(), name:'Версія покійної', title:'Покійна', blocks:[{id:'b',row:1,fx:0,text:'буде видалена'}]},{dev:'phone'});
cloud.write('notes',{id:'p0', purged:cloud.now()},{dev:'phone'});
cloud.rewrite('notes','bad1',{v:1, rev:1, op:'x1', dev:'phone', rcpt:{phone:'x1'}, title:5, blocks:'nope', created:1, updated:1});   // the console: a document of the wrong shape
for(let i=1;i<=5;i++) cloudWrite(cloud,'d'+i,note(i));
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX, connect:{pace:PACE_SLOW}}), C=await newDevice(br, cloud, SITE, 'C', {ctx:CTX, connect:{pace:PACE_SLOW}});
const all=async(k=2)=>{ for(let i=0;i<k;i++) for(const d of [A,B,C]) await settle(d.pg,250); };
await all(3);
const q1=await syncRecs(A.pg,'quarantine:'), tn=await lastTotals(A,'notes'), tv=await lastTotals(A,'versions');
ok('1 seen holds the tombstone (rev 2), the ignored version and the quarantined document; nothing of them is stored', (await seenOf(A,'seen:n:p0')||{}).rev===2 && !!(await seenOf(A,'seen:v:vp0')) && !!(await seenOf(A,'seen:n:bad1')) && !(await stored(A.pg,'notes','p0')) && !(await stored(A.pg,'notes','bad1')) && !(await stored(A.pg,'versions','vp0')));
ok('1b the quarantine holds bad1 as «shape»; the totals of notes and versions agree; status «synced»', q1.length===1 && q1[0].k==='quarantine:n:bad1' && q1[0].reason==='shape' && !!(tn && tn.same) && !!(tv && tv.same) && (await status(A)).code==='synced' && (await stored(A.pg,'notes')).filter(n=>/^d\d$/.test(n.id)).length===5);

/* ── 2. no check runs while an attempt is unresolved ── */
cloud.fault('fail',{dev:'A', op:'txn', n:4}); await edit(A,'d1','Нотатка 1 (A)'); await quiet(A,4);
const l2=await since(A,0,'^(retry|accepted|totals)$'), r0=l2.find(e=>e.t==='retry' && e.id==='d1'), acc=r0 && l2.find(e=>e.t==='accepted' && e.id==='d1' && e.at>r0.at);
const between=r0 && acc? l2.filter(e=>e.t==='totals' && e.at>r0.at && e.at<acc.at) : null, afterAcc=acc? l2.filter(e=>e.t==='totals' && e.at>acc.at) : [];
ok('2 four failed attempts ('+(r0&&acc? acc.at-r0.at : '?')+' ms): no totals check in between, one after the acceptance', !!r0 && !!acc && between.length===0 && afterAcc.length>=1 && cloud.doc('notes','d1').title==='Нотатка 1 (A)');

/* ── 3. a check that lost the race against another device's write: mismatch → catch-up → the second check agrees, no full pass ── */
cloud.auto=false; const t3=await mark(A); cloudWrite(cloud,'r1',{title:'Наперегонки', blocks:[{id:'b',row:1,fx:0,text:'записано під час перевірки'}]}); await quiet(A,5);
const l3=(await since(A,t3,'^(totals|catchup-done|scan-start)$')).filter(e=>e.col===undefined || e.col==='notes'), i3=l3.findIndex(e=>e.t==='totals' && !e.same);
ok('3 '+l3.map(e=>e.t+(e.t==='totals'? (e.same? '=' : '≠') : '')).join(' → ')+'; r1 arrived by the catch-up', i3>=0 && l3.slice(i3+1).some(e=>e.t==='catchup-done') && l3.slice(i3+1).some(e=>e.t==='totals' && e.same) && !l3.some(e=>e.t==='scan-start') && !!(await stored(A.pg,'notes','r1')));
cloud.auto=true; cloud.pump(); await all(2);

/* ── 4. a lasting mismatch: one full pass today, later mismatches skip it ── */
lie='A'; const t4=await mark(A); await quiet(A,8);
const l4=await since(A,t4,'^(scan-start|scan-done|scan-skipped)$'), n4=k=>l4.filter(e=>e.t===k && e.col==='notes').length;
ok('4 the lying aggregation: '+n4('scan-start')+' pass started, '+n4('scan-done')+' done, '+n4('scan-skipped')+' skipped the same day', n4('scan-start')===1 && n4('scan-done')===1 && n4('scan-skipped')>=1);
lie=null; await quiet(A,4);
ok('4b with honest totals the check agrees again, status «synced» ('+JSON.stringify(await lastTotals(A,'notes'))+' '+JSON.stringify(await status(A))+')', (await lastTotals(A,'notes')).same && (await status(A)).code==='synced');

/* ── 5. a document deleted in the console: the pass finds it, A sends it again, B and C take the recreated document by rule 1 ── */
await nextDayA(); cloud.vanish('notes','d2'); cloud.advance(2000); await all(6);
const c5=cloud.doc('notes','d2'), sA5=await state(A,'d2');
ok('5 A: the pass saw d2 vanish and sent it again (rev '+(c5&&c5.rev)+' by '+(c5&&c5.dev)+'), the base is the new document', !!c5 && c5.rev===1 && c5.dev==='A' && (await since(A,0,'^vanished$','d2')).length===1 && sA5.meta.base.rev===1 && !sA5.job && !sA5.tr);
const okDev=async d=>{ const n=await stored(d.pg,'notes','d2'); const r={note:!!n && n.blocks[0].text==='текст 2', recreated:(await since(d,0,'^recreated$','d2')).length===1, seen:(await seenOf(d,'seen:n:d2')||{}).rev===1, noScan:!(await since(d,0,'^scan-start$')).length, totals:!!(await lastTotals(d,'notes')||{}).same, noQ:!(await syncRecs(d.pg,'quarantine:')).some(r=>r.k==='quarantine:n:d2')}; r.ok=Object.values(r).every(Boolean); return r; };
const b5=await okDev(B), c5b=await okDev(C);
ok('5b B and C took the recreated document without a pass of their own; totals agree on all three, no quarantine ('+JSON.stringify(b5)+' '+JSON.stringify(c5b)+')', b5.ok && c5b.ok && (await lastTotals(A,'notes')).same && !(await syncRecs(A.pg,'quarantine:')).some(r=>r.k==='quarantine:n:d2'));

/* ── 6. a document that vanished on the send path is sent again the same way ── */
cloud.vanish('notes','d3'); cloud.advance(2000); await edit(A,'d3','Нотатка 3 (A)'); await quiet(A,3); await all(2);
const c6=cloud.doc('notes','d3'), sA6=await state(A,'d3');
ok('6 the read before the send found nothing: the invariant is logged, the note is created again with the edit', !!c6 && c6.rev===1 && c6.title==='Нотатка 3 (A)' && (await since(A,0,'^invariant$','d3')).some(e=>e.kind==='vanished') && sA6.meta.base.rev===1 && !sA6.job);
ok('6b B has the recreated note with A\'s title', (await stored(B.pg,'notes','d3')||{}).title==='Нотатка 3 (A)');

/* ── 7. an old copy restored in the console (its old srv with it) goes to quarantine by the pass; the totals agree ── */
await nextDayA(); const old7=cloud.doc('notes','d4'); await edit(A,'d4','Нотатка 4 (A1)'); await quiet(A,2); await edit(A,'d4','Нотатка 4 (A2)'); await quiet(A,2);
const rev7=cloud.doc('notes','d4').rev; cloud.rewrite('notes','d4',{v:1, rev:1, op:old7.op, dev:old7.dev, rcpt:old7.rcpt, title:old7.title, blocks:old7.blocks, created:old7.created, updated:old7.updated}); cloud.docs.notes.get('d4').srv={...old7.srv};
await quiet(A,8); const q7=(await syncRecs(A.pg,'quarantine:')).find(r=>r.k==='quarantine:n:d4');
ok('7 rev '+rev7+' → an old rev 1 with the old srv: the delivery is stale, the pass puts it in quarantine as «rewritten», seen is rev 1, the local note keeps A\'s text, the totals agree', rev7===3 && !!q7 && q7.reason==='rewritten' && (await seenOf(A,'seen:n:d4')).rev===1 && (await stored(A.pg,'notes','d4')).title==='Нотатка 4 (A2)' && (await lastTotals(A,'notes')).same && (await since(A,0,'^stale$','d4')).length>=1);

/* ── 8. a late delivery of the state before a recreation does not lower seen ── */
const s8=await seenOf(A,'seen:n:d2'), cur8=cloud.doc('notes','d2'), oldD2={...cur8, srv:{s:cur8.srv.s-2, ns:0}, title:'Нотатка 2', dev:'phone', op:'o0', rcpt:{phone:'o0'}};
await A.pg.evaluate(doc=>{ sheetDebug.sync.engine()._S.inbox.push({col:'notes', doc, source:'delivery'}); sheetDebug.sync.wake(); }, oldD2); await quiet(A,2);
ok('8 the old state is stale: seen unchanged, the note unchanged', JSON.stringify(await seenOf(A,'seen:n:d2'))===JSON.stringify(s8) && (await since(A,0,'^stale$','d2')).length===1 && (await stored(A.pg,'notes','d2')).title==='Нотатка 2');
await B.close(); await C.close();   // from here on A alone: another device's first merge of a recreated document would add writes of its own

/* ── 9. a recreation before the echo of an own write is recognised through seen.after ── */
cloud.auto=false; await edit(A,'d5','Нотатка 5 (A)'); await quiet(A,2); const s9=await seenOf(A,'seen:n:d5');
cloud.vanish('notes','d5'); cloud.advance(2000); cloudWrite(cloud,'d5',{title:'Нотатка 5 (телефон, заново)', blocks:[{id:'b',row:1,fx:0,text:'текст 5 заново'}]});
cloud.auto=true; cloud.pump(); await quiet(A,4); const c9=cloud.doc('notes','d5'), sA9=await state(A,'d5'), s9b=await seenOf(A,'seen:n:d5'), kept9=/заново/.test(JSON.stringify(c9&&c9.blocks)+(c9&&c9.title)) || (await stored(A.pg,'versions')).some(v=>v.note==='d5' && v.reason==='copy' && /заново/.test(JSON.stringify(v)));   // the phone's side is in the result or in a conflict copy (A's clock runs days ahead, so A's side wins the key)
ok('9 the own write was seen without srv (after = the previous srv); the recreated rev 1 is recognised, merged and sent: rev '+(c9&&c9.rev)+' by '+(c9&&c9.dev)+' ('+(await since(A,0,'^(accepted|recreated|merged|insure|invariant|rejected|retry|applied|stale)$','d5')).map(e=>e.t+(e.rev? ':'+e.rev : '')+(e.same!==undefined? (e.same? '=' : '≠') : '')).join(' ')+')', s9.rev===2 && !s9.srv && !!s9.after && (await since(A,0,'^recreated$','d5')).length===1 && !!c9 && c9.rev===2 && c9.dev==='A' && sA9.meta.base.rev===2 && !sA9.job && s9b.rev===2 && !!s9b.srv && kept9);

/* ── 10. a recreated tombstone is a deletion ── */
cloud.vanish('notes','d1'); cloud.advance(2000); cloud.write('notes',{id:'d1', purged:cloud.now()},{dev:'phone'}); await quiet(A,3);
ok('10 the tombstone with rev 1 below seen but a newer srv: the note is deleted, purged: recorded', !(await stored(A.pg,'notes','d1')) && (await syncRecs(A.pg,'purged:')).some(r=>r.k==='purged:n:d1') && (await since(A,0,'^recreated$','d1')).length===1 && (await since(A,0,'^tombstone$','d1')).some(e=>e.changed===false));

/* ── 11. a pass over its budget goes on the next day and announces nothing until the end ── */
for(let i=0;i<20;i++) cloudWrite(cloud,'s'+String(i).padStart(2,'0'),{title:'Маса '+i, blocks:[{id:'b',row:1,fx:0,text:'м '+i}]}); await quiet(A,2);
lie='G'; const G=await newDevice(br, cloud, SITE, 'G', {ctx:CTX, connect:{pace:PACE, budgets:{reads:100, writes:1000}}}); await quiet(G,8);
const l11=await since(G,0,'^(scan-start|scan-done|vanished|limit)$'), sc11=(await syncRecs(G.pg,'scan:')).find(r=>r.k==='scan:notes'), total=cloud.all('notes').length;
ok('11 the pass started and ran out of budget ('+(sc11&&sc11.found)+' of '+total+' read): not done, nothing announced, status «checking»', l11.some(e=>e.t==='scan-start') && !l11.some(e=>e.t==='scan-done') && !l11.some(e=>e.t==='vanished') && !l11.some(e=>e.t==='limit') && (await status(G)).code==='checking' && !!sc11 && sc11.active && sc11.found>0 && sc11.found<total);
await G.pg.evaluate(()=>{ sheetDebug.sync.clock=86400e3; sheetDebug.sync.wake(); }); await quiet(G,6);
const l11b=await since(G,0,'^(scan-done|vanished)$'), done11=l11b.find(e=>e.t==='scan-done' && e.col==='notes');   // the aggregation still lies, so a new pass may already have begun: the finished one is judged by its log entry
ok('11b the next day the pass finishes with the new budget ('+(done11&&done11.found)+' read in all); nothing vanished', !!done11 && done11.found===total && done11.vanished===0 && !l11b.some(e=>e.t==='vanished'));
lie=null; await G.close();

/* ── 12. an aggregation error is «unknown»: no strike, no catch-up ── */
cloud.fault('fail',{dev:'A', op:'totals', n:1}); const t12=await mark(A); await quiet(A,4);
const l12a=await since(A,t12,'^(totals-unknown|totals|catchup-done|scan-start)$'), u12=l12a.find(e=>e.t==='totals-unknown'), l12=u12? l12a.filter(e=>e.col===u12.col) : l12a, i12=l12.indexOf(u12);
ok('12 '+l12.map(e=>e.t+(e.t==='totals'? (e.same? '=' : '≠') : '')).join(' → ')+(u12? ' ('+u12.col+', '+u12.code+')' : ''), i12>=0 && !l12.slice(i12+1).some(e=>e.t==='catchup-done' || e.t==='scan-start') && l12.slice(i12+1).some(e=>e.t==='totals' && e.same));

/* ── 13. a commit visible after the window is found by the pass; the version that came before its note waited for it ── */
cloudWrite(cloud,'w1',{title:'Пізній коміт', blocks:[{id:'b',row:1,fx:0,text:'видимий пізніше'}]},{commitAt:cloud.now()+600000});
cloud.write('versions',{id:'vW', note:'w1', t:cloud.now(), name:'Чекає', title:'Пізній коміт', blocks:[{id:'b',row:1,fx:0,text:'видимий пізніше'}]},{dev:'phone'}); await quiet(A,3);   // today's pass is spent (7): the totals disagree, the catch-up finds nothing, the pass is skipped, the version keeps waiting
const m13=(await syncRecs(A.pg,'meta:v:')).find(r=>r.k==='meta:v:vW'), w13=await stored(A.pg,'notes','w1');
ok('13 the version came before its note: it waits, is seen, not stored; the note is hidden and today\'s pass is spent ('+JSON.stringify({wait:!!(m13&&m13.wait), seen:!!(await seenOf(A,'seen:v:vW')), v:!!(await stored(A.pg,'versions','vW')), n:!!w13})+')', !!m13 && !!m13.wait && !!(await seenOf(A,'seen:v:vW')) && !(await stored(A.pg,'versions','vW')) && !w13 && (await since(A,0,'^scan-skipped$')).length>=1);
await nextDayA(); await quiet(A,8); const v13=await stored(A.pg,'versions','vW');
ok('13b the totals disagree, the pass reads the hidden commit: the note is on A, the waiting version is applied, the totals agree ('+JSON.stringify({n:!!(await stored(A.pg,'notes','w1')), v:v13&&v13.name, scans:(await since(A,0,'^scan-done$')).length, tn:(await lastTotals(A,'notes')||{}).same, tv:(await lastTotals(A,'versions')||{}).same, st:await status(A)})+')', !!(await stored(A.pg,'notes','w1')) && !!v13 && v13.name==='Чекає' && v13.note==='w1' && (await since(A,0,'^scan-done$')).length>=1 && (await lastTotals(A,'notes')).same && (await lastTotals(A,'versions')).same && (await status(A)).code==='synced');
ok('14 no page errors', !A.errs.length && !B.errs.length && !C.errs.length && !G.errs.length);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
