// Two tabs of one device under sync (docs/SYNC-PLAN.md §4.10): tabs compare records by lrev, not by time. A record whose `updated` went back
// (a document from a device with a slow clock, applied as it is) still reaches the other tab, both through the leader's «chg» message and
// through the storage check when a tab is shown again; a tab that takes another tab's copy keeps the lrev in its editor snapshot, so its next
// write takes the short path. A change that comes while the open note is being typed in, or while the caret stands in one of its fields, waits
// behind the strip «Є зміни з іншої вкладки · Оновити» with no toast and no «conflict» record: the pending write merges, and the redraw comes
// when the caret leaves; the same field edited in both tabs leaves a conflict copy. A tombstone purged by the leader makes the other tabs drop
// the note («gone»), and a tab with unwritten text in it revives the text.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, newTab, lead, settle, stored, typeAt, openNote, curId, cloudWrite } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const title=pg=>pg.evaluate(()=>document.getElementById('ttl').textContent);
const text=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).join('|'));
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('#list .item')].map(d=>d.dataset.id));
const strip=pg=>pg.evaluate(()=>{ const s=document.getElementById('chgStrip'); return s.hidden? '' : document.getElementById('chgMsg').textContent; });
const toast=pg=>pg.evaluate(()=>{ const t=document.getElementById('toast'); return t.classList.contains('show')? t.textContent : ''; });
const lrevOf=async(pg,id)=>(await pg.evaluate(()=>sheetDebug.sync.lrev()))[id];
const snapLrev=(pg,id)=>pg.evaluate(id=>{ const s=sheetDebug.sync.snap(id); return s? s.lrev : undefined; }, id);
const versions=(pg,id)=>pg.evaluate(id=>sheetDebug.vers.list(id), id);
const gate=pg=>pg.evaluate(()=>{ window.__gate=new Promise(r=>{ window.__open=r; }); sheetDebug.saveGate=()=>window.__gate; });   // every write of this tab waits until __open()
const open=pg=>pg.evaluate(()=>{ sheetDebug.saveGate=null; window.__open(); });
const clickBlock=async(pg,t)=>{ await pg.bringToFront(); const f=pg.locator('#sheet .blk .txt').filter({hasText:t}).first(); await f.click(); await pg.keyboard.press('End'); };

const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}});
const B=await newTab(A, SITE, {connect:{pace:PACE}});
ok('0 the first tab leads, the second is a follower', (await lead(A.pg)).on && !(await lead(B)).on);
cloudWrite(cloud,'t1',{title:'Спільна', blocks:[{id:'b1',row:2,fx:0.2,text:'рядок'}]}); await settle(A.pg);
ok('0b a note from the phone reaches both tabs (the leader applies it and tells the follower)', (await items(A.pg)).includes('t1') && await until(async()=>(await items(B)).includes('t1'), 3000));
await openNote(A.pg,'t1'); await openNote(B,'t1'); await A.pg.keyboard.press('Escape'); await B.keyboard.press('Escape');

/* ── 1. updated goes back, lrev goes forward: the record still reaches the other tab ── */
const u0=(await stored(B,'notes','t1')).updated, l0=await lrevOf(B,'t1');
cloud.write('notes',{...cloud.doc('notes','t1'), title:'Старіший час', updated:Date.now()-7200e3},{dev:'phone', dn:'Телефон'}); await settle(A.pg);
const r1=await until(async()=>{ const r=await stored(B,'notes','t1'); return r && r.title==='Старіший час'? r : null; }, 3000);
ok('1 the phone\'s clock is two hours behind: the leader stored the document as it is (updated '+(r1? Math.round((r1.updated-u0)/60000) : '?')+' min relative to before, lrev '+l0+' → '+await lrevOf(B,'t1')+')', !!r1 && r1.updated<u0 && await lrevOf(B,'t1')>l0);
ok('1b the follower shows it: by time it would have ignored it ('+await title(B)+')', await until(async()=>await title(B)==='Старіший час', 3000) && !(await strip(B)));
// the storage check when a tab is shown again compares lrev too: a record written behind the tab's back with a later lrev and an earlier time
await B.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','sync'],'readwrite'), N=t.objectStore('notes'), S=t.objectStore('sync'); const g=N.get('t1'), m=S.get('meta:n:t1');
  g.onsuccess=()=>{ const n=g.result; n.title='Через сховище'; n.updated=n.updated-3600e3; N.put(n); }; m.onsuccess=()=>{ const x=m.result; x.lrev=(x.lrev||0)+1; S.put(x); }; t.oncomplete=()=>{ d.close(); res(); }; }; }));
ok('1c a record written behind the tab\'s back is not shown yet', await title(B)==='Старіший час');
await B.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await B.waitForTimeout(400);
ok('1d shown again, the tab reads the storage and takes the record by its lrev although its time is earlier ('+await title(B)+')', await title(B)==='Через сховище');

/* ── 2. a copy taken from another tab keeps the lrev in the snapshot: the next write takes the short path ── */
await clickBlock(A.pg,'рядок'); await A.pg.keyboard.type(' (A)'); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(600);
const lA=await lrevOf(A.pg,'t1');
ok('2 the follower redrew the leader\'s edit and its snapshot carries the record\'s lrev ('+lA+')', await until(async()=>/рядок \(A\)/.test(await text(B)), 3000) && await snapLrev(B,'t1')===lA && await lrevOf(B,'t1')===lA);

/* ── 3. a change from another tab while this one types: the strip, the merge, the redraw at the safe point ── */
await clickBlock(B,'рядок (A)'); await gate(B); await B.keyboard.type(' (B)');   // B's write is held in flight
await typeAt(A.pg,500,420,'другий блок (A)'); await B.waitForTimeout(300);
const s3=await strip(B), t3=await toast(B);
ok('3 the follower is typing when the leader\'s put comes: the strip «'+s3+'», no toast, its screen untouched', /іншої вкладки/.test(s3) && !t3 && /рядок \(A\) \(B\)/.test(await text(B)) && !/другий блок/.test(await text(B)));
ok('3b no «conflict» record is written', !(await versions(B,'t1')).some(v=>v.reason==='conflict'));
await open(B); const r3=await until(async()=>{ const r=await stored(B,'notes','t1'); return r && r.blocks.length===2 && r.blocks.some(b=>/рядок \(A\) \(B\)/.test(b.text))? r : null; }, 3000);
ok('3c the held write landed as a merge: both texts in the record', !!r3 && r3.blocks.some(b=>/другий блок \(A\)/.test(b.text)));
ok('3d the caret is still in the block: the strip stays, no redraw yet', /іншої вкладки/.test(await strip(B)) && !/другий блок/.test(await text(B)));
await B.keyboard.press('Escape'); await B.waitForTimeout(300);
ok('3e the caret left: the sheet shows both blocks, the strip is gone', /другий блок \(A\)/.test(await text(B)) && /рядок \(A\) \(B\)/.test(await text(B)) && !(await strip(B)));
// a caret that only stands in a field, no typing
await clickBlock(B,'рядок (A) (B)'); await A.pg.bringToFront(); await clickBlock(A.pg,'другий блок'); await A.pg.keyboard.type(' ще'); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(600);
ok('3f a standing caret holds the change back too: the strip, the old text on the screen', /іншої вкладки/.test(await strip(B)) && !/ще/.test(await text(B)));
await B.bringToFront(); await B.keyboard.press('Escape'); await B.waitForTimeout(300);
ok('3g the caret left: applied', /другий блок \(A\) ще/.test(await text(B)) && !(await strip(B)));
// the same field in both tabs: the later edit wins and the other side stays as a conflict copy
await clickBlock(B,'рядок (A) (B)'); await gate(B); await B.keyboard.type(' X');
await clickBlock(A.pg,'рядок (A) (B)'); await A.pg.keyboard.type(' Y'); await A.pg.keyboard.press('Escape'); await A.pg.waitForTimeout(600);
await B.bringToFront(); await open(B); await B.waitForTimeout(600); await B.keyboard.press('Escape'); await B.waitForTimeout(300);
const r3h=await stored(B,'notes','t1'), cp=(await versions(B,'t1')).filter(v=>v.reason==='copy');
ok('3h the same block typed in both tabs: the later write wins («'+r3h.blocks.map(b=>b.text).join(' | ')+'»), the other side is a conflict copy ('+cp.length+')', r3h.blocks.some(b=>/рядок \(A\) \(B\) X/.test(b.text)) && cp.some(c=>JSON.stringify(c).includes('(B) Y')));

/* ── 4. a tombstone purged by the leader: the follower drops the note, or revives the text it typed ── */
cloudWrite(cloud,'g1',{title:'Піде', blocks:[{id:'b',row:2,fx:0,text:'піде'}]}); cloudWrite(cloud,'g2',{title:'Оживе', blocks:[{id:'b',row:2,fx:0,text:'оживе'}]}); await settle(A.pg);
ok('4 two more notes from the phone are on both tabs', await until(async()=>(await items(B)).includes('g1') && (await items(B)).includes('g2'), 3000));
await openNote(B,'g2'); await B.evaluate(()=>{ sheetDebug.failSave=true; }); await clickBlock(B,'оживе'); await B.keyboard.type(' (набрано у B)'); await B.keyboard.press('Escape'); await B.waitForTimeout(600);
ok('4b the follower typed into g2 and could not write it', (await B.evaluate(()=>document.getElementById('saveWarn').hidden))===false);
cloud.write('notes',{id:'g1', purged:Date.now()},{dev:'phone'}); cloud.write('notes',{id:'g2', purged:Date.now()},{dev:'phone'}); await settle(A.pg); await B.evaluate(()=>{ sheetDebug.failSave=false; });
ok('4c the leader purged both', !(await stored(A.pg,'notes','g1')) && !(await stored(A.pg,'notes','g2')));
const gone=await until(async()=>!(await items(B)).includes('g1'), 3000);
ok('4d «gone»: the follower dropped the untouched note at once', gone);
const rv=await until(async()=>(await stored(B,'notes')).find(n=>n.revived && n.revived.from==='g2'), 4000);
ok('4e the note the follower typed in is revived with its text, the original is gone from its list', !!rv && rv.blocks.some(b=>/набрано у B/.test(b.text)) && !(await items(B)).includes('g2') && (await curId(B))!=='g2');

console.log(A.errs.length? A.errs.join('\n') : '✓ no errors'); if(A.errs.length) fails++;
await A.close(); await br.close(); await srv.close(); process.exit(fails?1:0);
