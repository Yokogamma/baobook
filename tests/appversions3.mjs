import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const MIN=60000, T0=Date.now();
const NOTES=[{id:'pw',title:'Доступи',created:T0,updated:T0,blocks:[{id:'a',row:2,fx:0.1,text:'перший'},{id:'b',row:5,fx:0.1,text:'пароль: Qw3rty!'},{id:'c',row:8,fx:0.1,text:'третій'}]},
  {id:'ot',title:'Інша',created:T0,updated:T0-MIN,blocks:[{id:'o1',row:2,fx:0.1,text:'інша нотатка'}]}];

const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}, acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
const idb=(pg,stores)=>pg.evaluate(stores=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction(stores,'readonly'), out={}; for(const s of stores){ const q=t.objectStore(s).getAll(); q.onsuccess=()=>{ out[s]=q.result; }; } t.oncomplete=()=>{ d.close(); res(out); }; }; }), stores);
const state=async(p=pg)=>{ const o=await idb(p,['notes','versions','blobs']); const vs=o.versions.filter(v=>v.note==='pw').sort((a,b)=>a.t-b.t||a.w-b.w);
  return {note:o.notes.find(n=>n.id==='pw'), vers:vs, blobs:o.blobs.filter(b=>b.note==='pw'), other:o.versions.filter(v=>v.note==='ot'), otherBlobs:o.blobs.filter(b=>b.note==='ot')}; };
const blk=(n,id)=>n.blocks.find(b=>b.id===id);
const setText=(p,from,to)=>p.evaluate(([from,to])=>{ const t=[...document.querySelectorAll('#sheet .blk .txt')].find(t=>t.textContent===from); t.textContent=to; t.dispatchEvent(new InputEvent('input',{bubbles:true})); }, [from,to]);
const settle=async(p=pg)=>{ await p.waitForTimeout(700); await p.evaluate(()=>sheetDebug.vers.queue()); await p.waitForTimeout(100); };
const rows=(p=pg)=>p.evaluate(()=>[...document.querySelectorAll('#histList .hv')].map(d=>({id:d.dataset.id, k:(d.querySelector('.hv-k')||{}).textContent||''})));
const openPanel=async(p=pg)=>{ await p.click('#histBtn'); await p.waitForTimeout(500); };
const menu=async label=>{ await pg.click('#histMore'); await pg.waitForTimeout(100); await pg.locator('.amenu .mi',{hasText:label}).click(); await pg.waitForTimeout(150); };

// one note «Доступи» with a version an hour ago (the version clock runs behind, so no automatic versions get in the way); since then
// «перший» changed, the password spoiled, «третій» deleted and «новий» added. The other note «Інша» has a version of its own
await pg.goto(SITE); await pg.waitForTimeout(400);
await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
await pg.evaluate(ms=>{ sheetDebug.vers.clock=ms; }, -60*MIN);
await pg.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:NOTES}))}); await pg.waitForTimeout(800);
await pg.evaluate(()=>document.querySelector('#list .item[data-id="ot"]').click()); await pg.evaluate(()=>sheetDebug.vers.force('auto'));
await pg.evaluate(()=>document.querySelector('#list .item[data-id="pw"]').click()); await pg.waitForTimeout(200); await pg.evaluate(()=>sheetDebug.vers.force('auto'));
await setText(pg,'перший','перший змінено'); await setText(pg,'пароль: Qw3rty!','пароль: ууу'); await setText(pg,'третій',''); await pg.waitForTimeout(600);
await pg.mouse.click(400,640); await pg.keyboard.type('новий'); await pg.keyboard.press('Escape'); await settle();
const s0=await state(); const v1=s0.vers[0];
ok('0 setup: one version, now «'+s0.note.blocks.map(b=>b.text).join(' | ')+'»', s0.vers.length===1 && s0.other.length===1 && !blk(s0.note,'c') && blk(s0.note,'b').text==='пароль: ууу');

/* ── showing a version: what changed, what comes back, what goes away ── */
await openPanel(); await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(300);
const m=await pg.evaluate(()=>({ch:[...document.querySelectorAll('#sheet .blk.v-ch')].map(e=>e.textContent.trim()), add:[...document.querySelectorAll('#sheet .blk.v-add')].map(e=>e.textContent.trim()), ghosts:document.querySelectorAll('#sheet .ghost-blk').length, btns:[...document.querySelectorAll('#vlayer .vbtn')].map(b=>b.dataset.id).sort().join(',')}));
ok('1 changed blocks are marked ('+m.ch.join(', ')+'), the deleted one comes back ('+m.add.join(', ')+')', m.ch.length===2 && m.ch.includes('пароль: Qw3rty!') && m.add.length===1 && m.add[0]==='третій');
ok('2 a dashed outline where «новий» is now, the version has no such block ('+m.ghosts+')', m.ghosts===1);
ok('3 «Повернути цей блок» on each changed or missing block ('+m.btns+')', m.btns==='a,b,c');
await pg.screenshot({path:OUT+'/appversions3-blocks.png'});

/* ── restoring one block ── */
await pg.click('#vlayer .vbtn[data-id="b"]'); await pg.waitForTimeout(800); await pg.evaluate(()=>sheetDebug.vers.queue()); const s1=await state(); const rs1=s1.vers.filter(v=>v.reason==='restore');
const undo1=await pg.evaluate(()=>{ const u=document.getElementById('undo'); return u.hidden? '' : u.querySelector('.umsg').textContent; });
ok('4 only the password comes back: «'+blk(s1.note,'b').text+'», «'+blk(s1.note,'a').text+'» and «новий» stay, «третій» stays deleted', blk(s1.note,'b').text==='пароль: Qw3rty!' && blk(s1.note,'a').text==='перший змінено' && s1.note.blocks.some(b=>b.text==='новий') && !blk(s1.note,'c') && await pg.locator('#hist').isHidden());
ok('5 place and size stay (row '+blk(s0.note,'b').row+' → '+blk(s1.note,'b').row+', fx the same)', blk(s1.note,'b').row===blk(s0.note,'b').row && blk(s1.note,'b').fx===blk(s0.note,'b').fx);
ok('6 the state before is «base», the restore is «restore» from v1 with summary '+JSON.stringify(rs1[0]&&rs1[0].sum), rs1.length===1 && rs1[0].from===v1.id && rs1[0].sum.ch===1 && rs1[0].sum.add===0 && s1.vers.some(v=>v.reason==='base'));
ok('7 the undo bar says «'+undo1+'»', /^Блок повернуто з версії \d\d:\d\d$/.test(undo1));
await setText(pg,'перший змінено','перший змінено ще раз'); await pg.waitForTimeout(600); await pg.click('#undo .ubtn'); await pg.waitForTimeout(800); const s2=await state();
ok('8 «Скасувати» puts back only that block: «'+blk(s2.note,'b').text+'», the later edit «'+blk(s2.note,'a').text+'» stays', blk(s2.note,'b').text==='пароль: ууу' && blk(s2.note,'a').text==='перший змінено ще раз');
await openPanel(); await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(300); await pg.click('#vlayer .vbtn[data-id="c"]'); await pg.waitForTimeout(800); await pg.evaluate(()=>sheetDebug.vers.queue()); const s3=await state(); const rs3=s3.vers.filter(v=>v.reason==='restore').pop();
ok('9 a deleted block comes back where it was (row '+(blk(s3.note,'c')||{}).row+'), summary '+JSON.stringify(rs3&&rs3.sum), blk(s3.note,'c') && blk(s3.note,'c').text==='третій' && blk(s3.note,'c').row>=8 && rs3.sum.add===1 && rs3.sum.ch===0);

/* ── search in versions ── */
await openPanel(); await pg.fill('#histQ','qw3rty'); await pg.waitForTimeout(300); const found=await rows();
const all=(await state()).vers.filter(v=>v.blocks.some(e=>e.id==='b'));
ok('10 search keeps «Зараз» and the versions with the password ('+(found.length-1)+' of '+(await state()).vers.length+')', found[0].id==='now' && found.length>1 && found.length-1<(await state()).vers.length);
await pg.click('#histList .hv[data-id="'+found[1].id+'"]'); await pg.waitForTimeout(300);
ok('11 the matching block in the shown version is marked', await pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk.v-hit')].map(e=>e.textContent.trim()).join())==='пароль: Qw3rty!');
await pg.fill('#histQ',''); await pg.waitForTimeout(300); ok('11b clearing the search shows every version again', (await rows()).length===(await state()).vers.length+1);

/* ── named versions ── */
await pg.click('#histList .hv[data-id="now"]'); await pg.waitForTimeout(150); await menu('Зафіксувати версію…'); await pg.fill('#histName','Реліз'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(200); await menu('Назвати цю версію…'); await pg.fill('#histName','Перша'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
const named=(await rows()).filter(r=>r.k.startsWith('●')).map(r=>r.k); const s4=await state();
ok('12 «Зараз» saved as «Реліз», the old version named «Перша» ('+named.join(', ')+')', named.includes('● Реліз') && named.includes('● Перша') && s4.vers.find(v=>v.id===v1.id).name==='Перша' && s4.vers.some(v=>v.reason==='manual' && v.name==='Реліз'));
await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
const foot=await pg.evaluate(()=>document.getElementById('storInfo').textContent);
ok('13 the panel footer shows the size of the history: «'+foot+'»', /історія: \d+ КБ/.test(foot));

/* ── export and import with history ── */
const exportFile=async withHist=>{ await pg.click('#setBtn'); await pg.waitForTimeout(150); if(await pg.isChecked('#exportHist')!==withHist) await pg.click('#exportHist'); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.click('#exportBtn')]); return JSON.parse(fs.readFileSync(await dl.path(),'utf8')); };
const plain=await exportFile(false); const full=await exportFile(true); const s5=await state();
ok('14 export without the box has no history; with it, every version and body ('+(full.history? full.history.versions.length : 0)+' versions)', !('history' in plain) && full.history && full.history.versions.length===s5.vers.length+s5.other.length && full.history.blobs.length===s5.blobs.length+s5.otherBlobs.length);
{ const c2=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const p2=await c2.newPage(); p2.on('pageerror',e=>errs.push('PAGEERROR (2) '+e.message)); await p2.goto(SITE); await p2.waitForTimeout(600);
  await p2.setInputFiles('#importFile',{name:'h.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(full))}); await p2.waitForTimeout(1000); const toast=await p2.evaluate(()=>document.getElementById('toast').textContent); const t2=await state(p2);
  await p2.evaluate(()=>document.querySelector('#list .item[data-id="pw"]').click()); await p2.waitForTimeout(200); await openPanel(p2); const r2=await rows(p2);
  await p2.click('#histList .hv[data-id="'+v1.id+'"]'); await p2.waitForTimeout(300); const txt=await p2.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).join('|'));
  ok('15 a clean profile imports the history: «'+toast+'», '+t2.vers.length+' versions, the old one shows «'+txt+'»', /історія: \d+ версі/.test(toast) && t2.vers.length===s5.vers.length && r2.length===s5.vers.length+1 && txt.includes('Qw3rty!') && r2.some(r=>r.k==='● Перша'));
  await c2.close(); }

/* ── named versions survive thinning and a tiny budget; clearing removes only this note's history ── */
await pg.evaluate(()=>{ sheetDebug.vers.estimate={usage:0, quota:1}; return sheetDebug.vers.sweep(); }); await pg.waitForTimeout(200); const s6=await state();
ok('16 a tiny budget leaves the named versions and the newest one ('+s6.vers.map(v=>v.name||v.reason).join(', ')+')', s6.vers.some(v=>v.name==='Реліз') && s6.vers.some(v=>v.name==='Перша') && s6.vers.length<s5.vers.length);
await pg.evaluate(()=>{ sheetDebug.vers.estimate=null; });
await openPanel(); await menu('Очистити історію нотатки'); await pg.waitForTimeout(500); const s7=await state();
ok('17 «Очистити історію нотатки» removes its versions and bodies, «Інша» keeps hers ('+s7.vers.length+'/'+s7.blobs.length+', other '+s7.other.length+'/'+s7.otherBlobs.length+')', s7.vers.length===0 && s7.blobs.length===0 && s7.other.length===1 && s7.otherBlobs.length>0 && blk(s7.note,'b'));
ok('18 the list says «Поки версій немає»', await pg.evaluate(()=>document.querySelector('#histList .none')?.textContent)==='Поки версій немає');

/* ── phone: the search hides behind «⋯», the restore buttons stay on the screen ── */
{ const c3=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const p3=await c3.newPage(); p3.on('pageerror',e=>errs.push('PAGEERROR (phone) '+e.message)); await p3.goto(SITE); await p3.waitForTimeout(600);
  await p3.setInputFiles('#importFile',{name:'h.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(full))}); await p3.waitForTimeout(1000);
  await p3.evaluate(()=>document.querySelector('#list .item[data-id="pw"]').click()); await p3.waitForTimeout(200); await p3.tap('#histBtn'); await p3.waitForTimeout(500);
  const hidden=await p3.locator('#histQ').isHidden(); await p3.tap('#histMore'); await p3.waitForTimeout(150); await p3.locator('.amenu .mi',{hasText:'Шукати у версіях…'}).tap(); await p3.waitForTimeout(150);
  ok('19 phone: the search is hidden until «Шукати у версіях…» in «⋯» shows it', hidden && await p3.locator('#histQ').isVisible() && await p3.evaluate(()=>document.activeElement.id)==='histQ');
  await p3.locator('#histList .hv[data-id="'+v1.id+'"]').tap(); await p3.waitForTimeout(300);
  const bs=await p3.evaluate(()=>[...document.querySelectorAll('#vlayer .vbtn')].map(b=>{ const r=b.getBoundingClientRect(); return [r.left,r.right]; }));
  ok('20 phone: «Повернути цей блок» buttons inside the screen ('+bs.length+')', bs.length>0 && bs.every(([l,r])=>l>=0 && r<=390));
  await p3.screenshot({path:OUT+'/appversions3-phone.png'}); await c3.close(); }

console.log(errs.length? errs.join('\n') : '✓ no errors'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
