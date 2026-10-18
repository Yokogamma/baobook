// Sync core in the browser, part 5: revival (docs/SYNC-PLAN.md §4.7). Two devices revive one note into two revived notes and nothing is
// lost; the import of the original after a confirmed tombstone goes into the revived note; after «назавжди» of the revived note too, into one
// new note both purged records point at; an incoming revived note becomes this device's pointer; {A′} moved into {A, B} keeps B; a device that
// edited the original offline, while the revived note was purged as well, revives it anew; a live document over a pending tombstone (by the
// listener and on the send path) goes into a revived note in the trash and the tombstone is sent; an incoming tombstone over a note with a
// conflict copy revives it, over a note with only a named version deletes it; both devices deleted one note → nothing is sent twice; text typed
// into a note a tombstone just purged goes to the revived note.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, syncRecs, openNote, cloudWrite } from './lib/cloudpage.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:50, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const quiet=async(ds,k=3)=>{ for(let i=0;i<k;i++) for(const d of [].concat(ds)) await settle(d.pg,300); };
const off=(d,on)=>d.pg.evaluate(on=>{ sheetDebug.sync.online(on); }, on);
const wake=d=>d.pg.evaluate(()=>sheetDebug.sync.wake());
const edit=async(d,id,text)=>{ await d.pg.evaluate(([id,text])=>sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>({...C, blocks:C.blocks.map((b,i)=>i? b : {...b, text}), updated:t})), [id,text]); await wake(d); };
const addBlock=async(d,id,bid,text)=>{ await d.pg.evaluate(([id,bid,text])=>sheetDebug.sync.engine().writeLocal(id,(C,m,t)=>({...C, blocks:[...C.blocks, {id:bid,row:C.blocks.length+1,fx:0,text}], updated:t})), [id,bid,text]); await wake(d); };
const purge=async(d,id)=>{ const r=await d.pg.evaluate(id=>sheetDebug.sync.engine().purgeLocal(id), id); await wake(d); return r; };
const importNote=async(d,raw)=>{ const r=await d.pg.evaluate(raw=>sheetDebug.sync.engine().importNote(raw), raw); await wake(d); return r; };
const tomb=(id)=>cloud.write('notes',{id, purged:cloud.now()},{dev:'phone'});
const body=d=>{ const o={title:d.title, blocks:d.blocks, created:d.created, updated:d.updated}; for(const k of ['deleted','archived','revived']) if(d[k]!==undefined) o[k]=d[k]; return o; };
const editCloud=(id, text)=>{ const b=body(cloud.doc('notes',id)); b.blocks=b.blocks.map((x,i)=>i? x : {...x, text}); b.updated=cloud.now(); return cloud.write('notes',{id, ...b},{dev:'phone', dn:'Телефон'}); };
const notesOf=d=>stored(d.pg,'notes');
const revivedFrom=(list,from)=>list.filter(n=>n.revived && n.revived.from===from);
const purgedRec=async(d,id)=>(await syncRecs(d.pg,'purged:')).find(r=>r.k==='purged:n:'+id);
const text=n=>n.blocks.map(b=>b.text).join(' | ');
const allText=async(d,id)=>{ const n=await stored(d.pg,'notes',id); const vs=(await stored(d.pg,'versions')).filter(v=>v.note===id); return (n? text(n) : '')+' // '+vs.map(v=>v.blocks.map(e=>e.s||'').join(' ')).join(' / '); };   // the note and the bodies kept in its history (conflict copies)
const logOf=(d,re,id)=>d.pg.evaluate(([re,id])=>sheetDebug.sync.log().filter(e=>new RegExp(re).test(e.t) && (!id || e.id===id)), [re,id]);
const note=(i,t)=>({title:'', blocks:[{id:'b',row:1,fx:0,text:t||('x'+i)}]});
// a storage fault by flag: while localStorage.__failRevived is set, a put of a revived note throws QuotaExceededError
const PATCH=()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v){ let f=''; try{ f=localStorage.getItem('__failRevived')||''; }catch(_){} if(this.name==='notes' && f && v && v.revived) throw new DOMException('full','QuotaExceededError'); return put.apply(this, arguments); }; };
const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}, init:PATCH}), B=await newDevice(br, cloud, SITE, 'B', {ctx:CTX, connect:{pace:PACE}});
for(const i of [1,3,4,5,6,7,8,9,10,11,12]) cloudWrite(cloud,'x'+i,note(i)); await quiet([A,B],3);
ok('0 both devices hold the notes from the phone', (await notesOf(A)).filter(n=>/^x\d+$/.test(n.id)).length===11 && (await notesOf(B)).filter(n=>/^x\d+$/.test(n.id)).length===11);

/* ── 1. two devices revive one note: two revived notes, nothing lost ── */
await off(A,false); await off(B,false); await edit(A,'x1','x1 (A офлайн)'); await edit(B,'x1','x1 (B офлайн)'); tomb('x1');
await off(A,true); await off(B,true); await quiet([A,B],4);
const an1=await notesOf(A), bn1=await notesOf(B), ra=revivedFrom(an1,'x1'), rb=revivedFrom(bn1,'x1'), has=(list,s)=>list.some(n=>text(n).includes(s));
ok('1 both devices revived x1: two revived notes on each, both texts on each, x1 gone, the cloud holds both and the tombstone', ra.length===2 && rb.length===2 && !an1.find(n=>n.id==='x1') && !bn1.find(n=>n.id==='x1') && has(ra,'x1 (A офлайн)') && has(ra,'x1 (B офлайн)') && has(rb,'x1 (A офлайн)') && has(rb,'x1 (B офлайн)') && ra.every(n=>cloud.doc('notes',n.id) && n.deleted) && !!cloud.doc('notes','x1').purged);
const RA=ra.find(n=>n.revived.dev==='A').id, RB=rb.find(n=>n.revived.dev==='B').id;
ok('1b each device points purged:x1 at its own revived note; the revived notes name their device', (await purgedRec(A,'x1')).revivedAs===RA && (await purgedRec(B,'x1')).revivedAs===RB && ra.find(n=>n.id===RA).revived.dn==='Device A' && ra.find(n=>n.id===RB).revived.dn==='Device B');

/* ── 2. the import of the original after a confirmed tombstone goes into the revived note ── */
const raw1={id:'x1', title:'', blocks:[{id:'b',row:1,fx:0,text:'x1 оригінал з файлу'}], created:1, updated:2};
const r2=await importNote(A,raw1); await quiet(A,2);
ok('2 the import is a revival into A\'s revived note; the file\'s text is kept there ('+await allText(A,RA)+')', r2.ok && r2.kind==='revived' && r2.id===RA && !(await stored(A.pg,'notes','x1')) && (await allText(A,RA)).includes('x1 оригінал з файлу'));

/* ── 3. after «назавжди» of the revived note too: one new note, both purged records point at it ── */
await purge(A,RA); await quiet(A,2); const r3=await importNote(A,raw1); await quiet(A,3); const n3=await stored(A.pg,'notes',r3.id);
ok('3 a new revived note from the original; purged:x1 and purged:'+RA.slice(0,6)+'… point at it; the tombstone of the first revived note is in the cloud', r3.kind==='revived' && r3.id!==RA && !!n3 && n3.revived.from==='x1' && text(n3)==='x1 оригінал з файлу' && (await purgedRec(A,'x1')).revivedAs===r3.id && (await purgedRec(A,RA)).revivedAs===r3.id && !!cloud.doc('notes',RA).purged && !!cloud.doc('notes',r3.id));

/* ── 5. an incoming revived note becomes this device's pointer; the import of the original then goes there ── */
await off(A,false); await edit(A,'x3','x3 (A)'); tomb('x3'); await quiet(B,2);
ok('5 B had no changes: x3 deleted, a purged record without a pointer', !(await stored(B.pg,'notes','x3')) && !!(await purgedRec(B,'x3')) && !(await purgedRec(B,'x3')).revivedAs);
await off(A,true); await quiet([A,B],3); const R3=revivedFrom(await notesOf(A),'x3')[0];
ok('5b A revived x3; B received the revived note and points at it', !!R3 && !!(await stored(B.pg,'notes',R3.id)) && (await purgedRec(B,'x3')).revivedAs===R3.id);
const r5=await importNote(B,{id:'x3', title:'', blocks:[{id:'b',row:1,fx:0,text:'x3 з файлу на B'}], created:1, updated:2}); await quiet([A,B],2);
ok('5c B\'s import of the original goes into that revived note', r5.kind==='revived' && r5.id===R3.id && (await allText(B,R3.id)).includes('x3 з файлу на B'));

/* ── 6. {A′} moved into {A, B}: B stays, A′ comes in by its key ── */
await addBlock(A,R3.id,'c','другий блок'); await quiet(A,2);
const r6=await importNote(A,{id:'x3', title:'', blocks:[{id:'b',row:1,fx:0,text:'x3 копія пізніше'}], created:1, updated:Date.now()+5000}); await quiet(A,2); const n6=await stored(A.pg,'notes',R3.id);
ok('6 the revived note keeps its second block; the later copy of the first block came in ('+text(n6)+')', r6.id===R3.id && n6.blocks.length===2 && n6.blocks.some(b=>b.text==='другий блок') && n6.blocks.some(b=>b.text==='x3 копія пізніше'));

/* ── 7. the revived note purged as well, then a device that edited the original offline comes back: a new revived note ── */
const C=await newDevice(br, cloud, SITE, 'C', {ctx:CTX, connect:{pace:PACE}}); await quiet(C,3); await off(C,false); await edit(C,'x5','x5 (C офлайн)');
await off(A,false); await edit(A,'x5','x5 (A)'); tomb('x5'); await off(A,true); await quiet(A,3); const R5A=revivedFrom(await notesOf(A),'x5')[0].id; await purge(A,R5A); await quiet(A,2);
await off(C,true); await quiet(C,4); const cn7=await notesOf(C), r7=revivedFrom(cn7,'x5');
ok('7 C: both tombstones arrived; its edit is in a new revived note, the purged revived note of A is not there', r7.length===1 && r7[0].id!==R5A && text(r7[0])==='x5 (C офлайн)' && !cn7.find(n=>n.id==='x5') && !cn7.find(n=>n.id===R5A) && (await purgedRec(C,'x5')).revivedAs===r7[0].id && !!cloud.doc('notes',r7[0].id) && !!cloud.doc('notes',R5A).purged);
await C.close();

/* ── 8. a live document over a pending tombstone: the listener brings the phone's edit while the tombstone's attempts fail ── */
cloud.fault('fail',{dev:'A', op:'txn', n:3}); await purge(A,'x6'); editCloud('x6','x6 (телефон після)'); await quiet(A,5);
const r8=revivedFrom(await notesOf(A),'x6');
ok('8 the edit went into a revived note in the trash, the tombstone was sent over the edit', !!cloud.doc('notes','x6').purged && r8.length===1 && text(r8[0])==='x6 (телефон після)' && !!r8[0].deleted && !!cloud.doc('notes',r8[0].id) && (await logOf(A,'^moved-in$','x6')).length===1);

/* ── 9. the same on the send path: «назавжди» offline against an edit in the cloud ── */
await off(A,false); await purge(A,'x7'); editCloud('x7','x7 (телефон)'); await off(A,true); await quiet(A,4);
const r9=revivedFrom(await notesOf(A),'x7');
ok('9 the read before the send found the edit: a revived note in the trash, then the tombstone', !!cloud.doc('notes','x7').purged && r9.length===1 && text(r9[0])==='x7 (телефон)' && !!r9[0].deleted && !!cloud.doc('notes',r9[0].id));
await quiet(B,2); ok('9b B took the tombstones of x6 and x7 and the revived notes', !(await stored(B.pg,'notes','x6')) && !(await stored(B.pg,'notes','x7')) && !!(await stored(B.pg,'notes',r8[0].id)) && !!(await stored(B.pg,'notes',r9[0].id)));

/* ── 10. an incoming tombstone over a note with a conflict copy revives it; over a note with only a named version deletes it ── */
await A.pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('versions','readwrite'), s=t.objectStore('versions'), T=Date.now()-1000, sum={ch:0,add:1,del:0,mv:0,ttl:0};
  s.put({id:'vc8', note:'x8', t:T, w:T, reason:'copy', keep:1, inline:1, dev:'B', dn:'Device B', title:'', sig:'s8', size:10, sum, blocks:[{id:'b',row:1,fx:0,h:'h8',s:'x8 конфліктна копія'}]});
  s.put({id:'vn9', note:'x9', t:T, w:T, reason:'manual', name:'Іменована', keep:1, inline:1, title:'', sig:'s9', size:10, sum, blocks:[{id:'b',row:1,fx:0,h:'h9',s:'x9 іменована'}]}); t.oncomplete=()=>{ d.close(); res(); }; }; }));
tomb('x8'); tomb('x9'); await quiet(A,3); const an10=await notesOf(A), r8c=revivedFrom(an10,'x8');
ok('10 x8 with a conflict copy is revived and the copy follows it; x9 with a named version only is deleted', r8c.length===1 && !an10.find(n=>n.id==='x8') && ((await stored(A.pg,'versions','vc8'))||{}).note===r8c[0].id && !an10.find(n=>n.id==='x9') && !revivedFrom(an10,'x9').length && !!(await purgedRec(A,'x9')));

/* ── 11. both devices deleted one note: the second sees the tombstone, records its rev and sends nothing ── */
await off(A,false); await off(B,false); await purge(A,'x10'); await purge(B,'x10'); await off(A,true); await quiet(A,3); const revT=cloud.doc('notes','x10').rev; await off(B,true); await quiet(B,3);
const sB=await B.pg.evaluate(()=>sheetDebug.sync.state('x10'));
ok('11 the cloud has one tombstone (rev '+revT+'); B\'s purged record carries that rev, no job, nothing accepted on B', !!cloud.doc('notes','x10').purged && cloud.doc('notes','x10').rev===revT && (await purgedRec(B,'x10')).rev===revT && !sB.job && !sB.tr && !(await logOf(B,'^(accepted|purged)$','x10')).length);

/* ── 12. text typed into a note a tombstone just purged goes to the revived note ── */
await A.pg.bringToFront(); await openNote(A.pg,'x11'); const t12=A.pg.locator('#sheet .blk .txt').first(); await t12.click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' набір'); tomb('x11'); await A.pg.waitForTimeout(1500); await quiet(A,3);
const an12=await notesOf(A), r12=revivedFrom(an12,'x11');
ok('12 the typed text is in a revived note ('+(r12[0]? text(r12[0]) : '—')+'), x11 is gone, the revived note is in the cloud', r12.length===1 && /набір/.test(text(r12[0])) && !an12.find(n=>n.id==='x11') && !!cloud.doc('notes',r12[0].id));
/* ── 12b. the revival fails (no space for the revived note): the typed text stays on the screen and in memory with the warning; «Повторити» revives it later ── */
await openNote(A.pg,'x12'); const t12b=A.pg.locator('#sheet .blk .txt').first(); await t12b.click(); await A.pg.keyboard.press('End'); await A.pg.keyboard.type(' без місця'); await A.pg.evaluate(()=>localStorage.setItem('__failRevived','1')); tomb('x12'); await A.pg.waitForTimeout(1500); await quiet(A,2);
const an12b=await notesOf(A), ui12=await A.pg.evaluate(()=>({inList:!!document.querySelector('#list .item[data-id="x12"]'), warn:!document.getElementById('saveWarn').hidden, msg:document.getElementById('saveErrMsg').innerText, sheet:document.getElementById('sheet').innerText, cur:sheetDebug.cur()}));
ok('12b the revived note could not be written: x12 is still open with the typed text and in the list, the warning names it and the reason; storage has neither x12 nor a revived note', !an12b.find(n=>n.id==='x12') && !revivedFrom(an12b,'x12').length && ui12.inList && ui12.cur==='x12' && /x12 без місця/.test(ui12.sheet) && ui12.warn && /без місця/.test(ui12.msg) && /переповнене/.test(ui12.msg));
await A.pg.evaluate(()=>localStorage.removeItem('__failRevived')); await A.pg.evaluate(()=>document.getElementById('saveRetry').click()); await A.pg.waitForTimeout(600); await quiet(A,3);
const an12c=await notesOf(A), r12b=revivedFrom(an12c,'x12');
ok('12c «Повторити» revives it: the text is in a revived note that reached the cloud, x12 left memory, the warning is gone', r12b.length===1 && /x12 без місця/.test(text(r12b[0])) && !!cloud.doc('notes',r12b[0].id) && !(await A.pg.evaluate(()=>!!document.querySelector('#list .item[data-id="x12"]'))) && (await A.pg.evaluate(()=>document.getElementById('saveWarn').hidden)));
ok('13 no page errors', !A.errs.length && !B.errs.length && !C.errs.length);
await br.close(); await srv.close(); console.log(fails? fails+' failed' : 'all passed'); process.exit(fails? 1 : 0);
