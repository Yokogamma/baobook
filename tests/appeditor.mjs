// The editor snapshot E and the safe point (docs/SYNC-PLAN.md §4.10, the owner's decisions in §2). Several saves in one field without a redraw take
// the short path (the snapshot's lrev equals the record's after each), and a change from another device in between makes the next save a merge.
// A change that comes during an IME composition, or while the caret stands in a field, waits behind the strip «Є зміни з {пристрій} · Оновити»:
// «Оновити» saves what is typed and redraws, the caret leaving does the same, switching notes hides the strip; a write that failed keeps the
// strip until «Повторити» writes; with no caret the change applies at once; the empty block a click on the sheet makes does not hold a change
// back and is put back with the caret. On a phone the strip covers no block and its button is tall enough; an archived note shows both strips.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { TestCloud } from './lib/cloud.mjs';
import { newDevice, settle, stored, openNote, cloudWrite, connect } from './lib/cloudpage.mjs';
import { until } from './lib/wait.mjs';
const srv=await serve(); const SITE=srv.url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PACE={dev:0, note:0, big:0, huge:0, slow:0, retryMin:0, retryMax:300};
const cloud=new TestCloud({start:Date.now()});
const phone=(id,patch)=>cloud.write('notes',{...cloud.doc('notes',id), ...patch, updated:Date.now()},{dev:'phone', dn:'Телефон'});
const title=pg=>pg.evaluate(()=>document.getElementById('ttl').textContent);
const text=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).join('|'));
const strip=pg=>pg.evaluate(()=>{ const s=document.getElementById('chgStrip'); return s.hidden? '' : document.getElementById('chgMsg').textContent; });
const lrevOf=async(pg,id)=>(await pg.evaluate(()=>sheetDebug.sync.lrev()))[id];
const snapLrev=(pg,id)=>pg.evaluate(id=>{ const s=sheetDebug.sync.snap(id); return s? s.lrev : undefined; }, id);
const versions=(pg,id)=>pg.evaluate(id=>sheetDebug.vers.list(id), id);
const clickBlock=async(pg,t)=>{ await pg.bringToFront(); const f=pg.locator('#sheet .blk .txt').filter({hasText:t}).first(); await f.click(); await pg.keyboard.press('End'); };
const focusedTxt=pg=>pg.evaluate(()=>{ const a=document.activeElement; return !!(a && a.classList && a.classList.contains('txt')); });
const mark=pg=>pg.evaluate(()=>{ window.__el=document.activeElement; }); const sameEl=pg=>pg.evaluate(()=>window.__el===document.activeElement && document.contains(window.__el));

const A=await newDevice(br, cloud, SITE, 'A', {ctx:CTX, connect:{pace:PACE}}); const pg=A.pg;
cloudWrite(cloud,'e1',{title:'Редактор', blocks:[{id:'b1',row:2,fx:0.2,text:'рядок'}]}); cloudWrite(cloud,'e2',{title:'Друга', blocks:[{id:'b2',row:2,fx:0.2,text:'інша'}]}); await settle(pg);
await openNote(pg,'e1'); await pg.keyboard.press('Escape');

/* ── 1. several saves without a redraw: the short path, the snapshot keeps up; a change in between makes the next save a merge ── */
await clickBlock(pg,'рядок'); await mark(pg); const steps=[];
for(const ch of [' a',' b',' c']){ await pg.keyboard.type(ch); await pg.waitForTimeout(600); const l=await lrevOf(pg,'e1'); steps.push({l, snap:await snapLrev(pg,'e1'), stored:(await stored(pg,'notes','e1')).blocks[0].text, screen:await text(pg), same:await sameEl(pg)}); }
ok('1 three saves in one field: lrev 2, 3, 4, the snapshot equals the record after each, the record equals the screen, the field was never redrawn ('+steps.map(s=>s.l+'/'+s.snap).join(' ')+')', steps.map(s=>s.l).join()==='2,3,4' && steps.every(s=>s.snap===s.l && s.stored===s.screen && s.same) && steps[2].stored==='рядок a b c');
ok('1b no merge happened: no conflict copies, no incoming records', !(await versions(pg,'e1')).some(v=>v.reason==='copy' || v.reason==='incoming'));
phone('e1',{title:'Назва з телефону'}); await settle(pg);
const s1=await strip(pg);
ok('1c a title from the phone while the caret is in the block: the strip «'+s1+'», the old title on the screen, the field untouched', /Є зміни з Телефон/.test(s1) && await title(pg)==='Редактор' && await sameEl(pg));
await pg.keyboard.type(' d'); await pg.waitForTimeout(600); const r1=await stored(pg,'notes','e1');
ok('1d the next save merged: the record has the phone\'s title and the typed text, the snapshot\'s lrev is unknown, the strip stays', r1.title==='Назва з телефону' && r1.blocks[0].text==='рядок a b c d' && (await snapLrev(pg,'e1'))===null && /Телефон/.test(await strip(pg)) && await title(pg)==='Редактор');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
ok('1e the caret left: redrawn with the phone\'s title and the text, the snapshot carries the lrev again, the strip is gone', await title(pg)==='Назва з телефону' && /рядок a b c d/.test(await text(pg)) && (await snapLrev(pg,'e1'))===await lrevOf(pg,'e1') && !(await strip(pg)) && !(await sameEl(pg)));
ok('1f the phone\'s state went into the history as «incoming» before the merge', (await versions(pg,'e1')).some(v=>v.reason==='incoming'));

/* ── 2. IME: a composition is not a safe point; the composed text is saved and merged, the redraw waits for the caret to leave ── */
await clickBlock(pg,'рядок a b c d'); const cdp=await A.ctx.newCDPSession(pg); await cdp.send('Input.imeSetComposition',{text:'й', selectionStart:1, selectionEnd:1}); await pg.waitForTimeout(100);
phone('e1',{title:'Назва під час IME'}); await settle(pg);
ok('2 a change during the composition: the strip, no redraw (the title and the field as they were)', /Телефон/.test(await strip(pg)) && await title(pg)==='Назва з телефону' && (await text(pg)).includes('рядок a b c dй'));
await cdp.send('Input.insertText',{text:'йц'}); await pg.waitForTimeout(700); const r2=await stored(pg,'notes','e1');
ok('2b the composition ended: the text is saved and merged with the phone\'s title; the caret is still in the field, so no redraw yet', r2.blocks[0].text==='рядок a b c dйц' && r2.title==='Назва під час IME' && await title(pg)==='Назва з телефону' && /Телефон/.test(await strip(pg)));
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
ok('2c the caret left: both on the screen', await title(pg)==='Назва під час IME' && /рядок a b c dйц/.test(await text(pg)) && !(await strip(pg)));

/* ── 3. the strip: «Оновити», no caret, switching notes, a failed write, the empty block a click makes ── */
await pg.click('#ttl'); await pg.keyboard.press('End'); phone('e1',{blocks:[{id:'b1',row:2,fx:0.2,text:'рядок з телефону'}]}); await settle(pg);
ok('3 the caret in the title: the strip, the old block text', /Телефон/.test(await strip(pg)) && /рядок a b c dйц/.test(await text(pg)));
await pg.click('#chgApply'); await pg.waitForTimeout(400);
ok('3b «Оновити»: redrawn with the phone\'s text, the strip gone, the caret out of the fields', /рядок з телефону/.test(await text(pg)) && !(await strip(pg)) && !(await pg.evaluate(()=>{ const a=document.activeElement; return a && (a.id==='ttl' || a.isContentEditable); })));
phone('e1',{blocks:[{id:'b1',row:2,fx:0.2,text:'рядок без курсора'}]}); await settle(pg); await pg.waitForTimeout(200);
ok('3c no caret in the note: the change applies at once, no strip', /рядок без курсора/.test(await text(pg)) && !(await strip(pg)));
await clickBlock(pg,'рядок без курсора'); phone('e1',{title:'Назва перед перемиканням'}); await settle(pg);
ok('3d the strip while the caret is in the block', /Телефон/.test(await strip(pg)));
await openNote(pg,'e2'); ok('3e switching notes hides the strip; the note that waited took the change on the way out', !(await strip(pg)) && await pg.evaluate(()=>sheetDebug.sync.pending().length)===0);
await openNote(pg,'e1'); ok('3f the note shows the change when opened again', await title(pg)==='Назва перед перемиканням' && !(await strip(pg)));
await pg.keyboard.press('Escape'); await pg.evaluate(()=>{ sheetDebug.failSave=true; }); await clickBlock(pg,'рядок без курсора'); await pg.keyboard.type(' (не записалось)'); await pg.waitForTimeout(600);
phone('e1',{title:'Назва при відмові'}); await settle(pg); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
ok('3g a write that failed: the strip stays after the caret left, the old title on the screen, the warning shown', /Телефон/.test(await strip(pg)) && await title(pg)==='Назва перед перемиканням' && !(await pg.evaluate(()=>document.getElementById('saveWarn').hidden)));
await pg.evaluate(()=>{ sheetDebug.failSave=false; }); await pg.click('#saveRetry'); await pg.waitForTimeout(700); const r3=await stored(pg,'notes','e1');
ok('3h «Повторити» wrote the merge and the sheet caught up: the phone\'s title and the typed text, the strip gone', r3.title==='Назва при відмові' && r3.blocks[0].text==='рядок без курсора (не записалось)' && await title(pg)==='Назва при відмові' && /не записалось/.test(await text(pg)) && !(await strip(pg)));
// the empty block a click on the sheet makes
await pg.mouse.click(500,600); await pg.waitForTimeout(200); const n0=await pg.evaluate(()=>document.querySelectorAll('#sheet .blk').length);
ok('3i a click on the sheet made an empty block with the caret', await focusedTxt(pg) && n0===2);
phone('e1',{title:'Назва при порожньому блоці'}); await settle(pg); await pg.waitForTimeout(200);
ok('3j an empty block holds nothing back: the change applied at once, no strip, the empty block is back with the caret', await title(pg)==='Назва при порожньому блоці' && !(await strip(pg)) && await focusedTxt(pg) && await pg.evaluate(()=>document.querySelectorAll('#sheet .blk').length)===2 && await pg.evaluate(()=>!document.activeElement.textContent.trim()));
await pg.keyboard.type('набрано після'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
ok('3k typing into it went into the note', (await stored(pg,'notes','e1')).blocks.some(b=>b.text==='набрано після'));

/* ── 4. an archived note shows both strips, one under the other ── */
await openNote(pg,'e2'); const it=pg.locator('#list .item[data-id="e2"]'); await it.hover(); await it.locator('.it-r').click(); await pg.waitForTimeout(400);
await pg.click('#archRow'); await pg.waitForTimeout(300); await openNote(pg,'e2'); await clickBlock(pg,'інша'); phone('e2',{title:'Архівна з телефону'}); await settle(pg);
const geo=await pg.evaluate(()=>{ const r=e=>e.getBoundingClientRect(); const ro=r(document.querySelector('#roStrip .rostrip')), ch=r(document.querySelector('#chgStrip .chgstrip')), b=r(document.querySelector('#sheet .blk')); return {ro:[ro.top,ro.bottom], ch:[ch.top,ch.bottom], blk:b.top, hidden:document.getElementById('roStrip').hidden || document.getElementById('chgStrip').hidden}; });
ok('4 an archived note with a change waiting: the archive strip, the change strip below it, the first block below both ('+JSON.stringify(geo)+')', !geo.hidden && geo.ch[0]>=geo.ro[1] && geo.blk>=geo.ch[1]);
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); ok('4b applied once the caret left', await title(pg)==='Архівна з телефону' && !(await strip(pg)));

/* ── 5. a phone: the strip covers no block, the button is tall enough ── */
for(const w of [390,320]){ const ctx=await br.newContext({...CTX, viewport:{width:w,height:800}, hasTouch:true, isMobile:true}); const cdp2=await ctx.newCDPSession(await ctx.newPage().then(p=>{ ctx.__pg=p; return p; })); await cdp2.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  const mp=ctx.__pg; mp.on('pageerror',e=>A.errs.push('phone '+w+': '+e.message)); await ctx.exposeBinding('__noop',()=>{}); await mp.goto(SITE); await mp.waitForSelector('html[data-ready]',{state:'attached'}); await mp.waitForTimeout(400);
  await mp.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:[{id:'m1',title:'Телефонна',blocks:[{id:'b',row:2,fx:0.1,text:'перший блок'}],created:1,updated:Date.now()}]}))}); await mp.waitForTimeout(800);
  await mp.evaluate(()=>{ const d=document.querySelector('#list .item[data-id="m1"]'); if(d) d.click(); }); await mp.waitForTimeout(400);
  await mp.locator('#sheet .blk .txt').first().tap(); await mp.waitForTimeout(300);
  // a change from «another tab»: the same message the leader would send, without a cloud on a phone-sized context
  await mp.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction(['notes','sync'],'readwrite'); const g=t.objectStore('notes').get('m1'); g.onsuccess=()=>{ const n=g.result; n.title='Змінена назва'; n.updated=Date.now()+1; t.objectStore('notes').put(n); }; const m=t.objectStore('sync').get('meta:n:m1'); m.onsuccess=()=>{ const x=m.result||{k:'meta:n:m1', lrev:0, baseLrev:0, base:null}; x.lrev=(x.lrev||0)+1; t.objectStore('sync').put(x); }; t.oncomplete=()=>{ d.close(); res(); }; }; }));
  await mp.evaluate(()=>{ new BroadcastChannel('sheet:notes').postMessage({t:'chg', id:'m1', lrev:99, dn:'Ноутбук', dev:'x'}); }); await mp.waitForTimeout(400);
  const g=await mp.evaluate(()=>{ const r=e=>e.getBoundingClientRect(); const s=document.getElementById('chgStrip'); if(s.hidden) return {hidden:true}; const st=r(s.querySelector('.chgstrip')), b=r(document.querySelector('#sheet .blk')), btn=r(document.getElementById('chgApply')); return {msg:document.getElementById('chgMsg').textContent, right:st.right<=innerWidth, left:st.left>=0, below:b.top>=st.bottom, btn:btn.height}; });
  ok('5 at '+w+'px: the strip «'+(g.msg||'')+'» fits the screen, the first block is below it, the button is '+g.btn+'px tall', !g.hidden && /Ноутбук/.test(g.msg) && g.right && g.left && g.below && g.btn>=40);
  await ctx.close(); }

console.log(A.errs.length? A.errs.join('\n') : '✓ no errors'); if(A.errs.length) fails++;
await A.close(); await br.close(); await srv.close(); process.exit(fails?1:0);
