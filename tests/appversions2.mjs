import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const NOTE={id:'pw',title:'Доступи',created:Date.now(),updated:Date.now(),blocks:[{id:'a',row:2,fx:0.1,text:'перший'},{id:'b',row:5,fx:0.1,text:'пароль: Qw3rty!'},{id:'c',row:8,fx:0.1,text:'третій'}]};
const MIN=60000;

// a page with one imported note «Доступи» and two versions an hour and forty minutes ago (the version clock runs behind, so no automatic versions get in the way):
// v1 — as imported; v2 — the password spoiled and the title changed; now — a new block «новий» on top of v2
async function setup(pg){
  await pg.goto(SITE); await pg.waitForTimeout(400);
  await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); sessionStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
  await pg.evaluate(ms=>{ sheetDebug.vers.clock=ms; }, -60*MIN);
  await pg.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:[NOTE]}))}); await pg.waitForTimeout(800);
  await pg.evaluate(()=>document.querySelector('#list .item[data-id="pw"]').click()); await pg.waitForTimeout(200);
  await pg.evaluate(()=>sheetDebug.vers.force('auto'));
  await pg.evaluate(()=>{ const t=[...document.querySelectorAll('#sheet .blk .txt')].find(t=>t.textContent.includes('пароль')); t.textContent='пароль: ууу'; t.dispatchEvent(new InputEvent('input',{bubbles:true})); });
  await pg.evaluate(()=>{ const t=document.getElementById('ttl'); t.textContent='Нова назва'; t.dispatchEvent(new InputEvent('input',{bubbles:true})); }); await pg.waitForTimeout(600);
  await pg.evaluate(ms=>{ sheetDebug.vers.clock=ms; }, -40*MIN); await pg.evaluate(()=>sheetDebug.vers.force('auto'));
  await pg.evaluate(()=>{ const b=[...document.querySelectorAll('#sheet .blk .txt')].find(t=>t.textContent.includes('третій')); b.focus(); }); await pg.keyboard.press('End'); await pg.keyboard.press('Escape');
  await pg.mouse.click(400,560); await pg.keyboard.type('новий'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(700); await pg.evaluate(()=>sheetDebug.vers.queue()); }
const stored=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction(['notes','versions'],'readonly'); const n=t.objectStore('notes').get('pw'), v=t.objectStore('versions').getAll(); t.oncomplete=()=>{ d.close(); res({note:n.result, vers:v.result.filter(x=>x.note==='pw').sort((a,b)=>a.t-b.t)}); }; }; }));
const texts=pg=>pg.evaluate(()=>[...document.querySelectorAll('#sheet .blk .txt')].map(t=>t.textContent).sort().join('|'));
const rows=pg=>pg.evaluate(()=>[...document.querySelectorAll('#histList .hv')].map(d=>({id:d.dataset.id, cur:d.classList.contains('cur'), t:(d.querySelector('.hv-t')||{}).textContent, k:(d.querySelector('.hv-k')||{}).textContent||'', s:(d.querySelector('.hv-s')||{}).textContent})));
const view=pg=>pg.evaluate(()=>sheetDebug.vers.view);

/* ── computer ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
  await setup(pg); const s0=await stored(pg);
  ok('0 setup: two versions, now has «новий» ('+s0.vers.length+' versions, '+await texts(pg)+')', s0.vers.length===2 && (await texts(pg)).includes('новий'));
  const [v1,v2]=s0.vers;

  await pg.click('#histBtn'); await pg.waitForTimeout(400); const r=await rows(pg);
  const geo=await pg.evaluate(()=>{ const h=document.getElementById('hist').getBoundingClientRect(), s=document.getElementById('sheet').getBoundingClientRect(); return {h:[h.left,h.right,h.width].map(Math.round), s:Math.round(s.right)}; });
  ok('1 «Історія» opens a 300px column right of the sheet ('+geo.h.join(',')+', sheet ends at '+geo.s+'), the button is pressed', geo.h[2]===300 && geo.h[1]===1280 && geo.s<=geo.h[0] && await pg.getAttribute('#histBtn','aria-pressed')==='true');
  ok('2 rows: «Зараз» first, then the versions newest first ('+r.map(x=>x.t+' '+x.k).join(' / ')+')', r.length===3 && r[0].id==='now' && r[0].cur && r[1].id===v2.id && r[2].id===v1.id);
  ok('3 summaries: now «'+r[0].s+'», v2 «'+r[1].s+'»', r[0].s==='додано 1 блок' && /змінено 1 блок/.test(r[1].s) && /назву змінено/.test(r[1].s) && r[1].k==='автоматично');
  ok('3b a date group above the versions', await pg.locator('#histList .hg').count()>=1);

  await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(200);
  const shown=await pg.evaluate(()=>({cls:document.getElementById('sheet').classList.contains('history'), inert:document.getElementById('sheet').inert, ttl:document.getElementById('ttl').textContent, ce:document.getElementById('ttl').isContentEditable,
    ch:[...document.querySelectorAll('#sheet .blk.v-ch .txt')].map(t=>t.textContent), add:[...document.querySelectorAll('#sheet .blk.v-add')].length, restore:document.getElementById('histRestore').disabled}));
  ok('4 the oldest version is drawn read-only: «'+await texts(pg)+'», title «'+shown.ttl+'», view '+(await view(pg)===v1.id), shown.cls && shown.inert && !shown.ce && shown.ttl==='Доступи' && (await texts(pg))==='пароль: Qw3rty!|перший|третій' && await view(pg)===v1.id);
  ok('5 the block that differs from now is marked ('+shown.ch.join(',')+'), nothing is marked as missing now, «Відновити» is on', shown.ch.length===1 && shown.ch[0]==='пароль: Qw3rty!' && shown.add===0 && !shown.restore);
  await pg.mouse.click(600,300); await pg.keyboard.type('xyz'); await pg.waitForTimeout(700); const s1=await stored(pg);
  ok('6 clicks and typing on the shown version change nothing (note and versions the same)', JSON.stringify(s1.note.blocks)===JSON.stringify(s0.note.blocks) && s1.vers.length===2 && !(await texts(pg)).includes('xyz'));
  await pg.screenshot({path:OUT+'/appversions2-panel.png'});

  await pg.focus('#histList'); await pg.keyboard.press('ArrowUp'); await pg.waitForTimeout(200);
  ok('7 ↑ picks the newer version ('+((await rows(pg)).find(x=>x.cur)||{}).id+')', await view(pg)===v2.id && (await texts(pg)).includes('ууу'));
  await pg.keyboard.press('ArrowUp'); await pg.waitForTimeout(200);
  ok('8 ↑ again: «Зараз», the live note is back and editable', await view(pg)===null && (await texts(pg)).includes('новий') && !(await pg.evaluate(()=>document.getElementById('sheet').inert)));
  await pg.keyboard.press('End'); await pg.waitForTimeout(200); const atEnd=await view(pg); await pg.keyboard.press(' '); await pg.waitForTimeout(100); const sp1=await view(pg); await pg.keyboard.press(' '); await pg.waitForTimeout(100);
  ok('9 End picks the oldest; space shows now and back again ('+[atEnd===v1.id, sp1, await view(pg)===v1.id].join(',')+')', atEnd===v1.id && sp1===null && await view(pg)===v1.id);

  await pg.click('#histRestore'); await pg.waitForTimeout(900); await pg.evaluate(()=>sheetDebug.vers.queue()); const s2=await stored(pg); const rs=s2.vers.filter(v=>v.reason==='restore'), base=s2.vers.filter(v=>v.reason==='base');
  const undo=await pg.evaluate(()=>{ const u=document.getElementById('undo'); return u.hidden? '' : u.querySelector('.umsg').textContent; });
  ok('10 «Відновити цю версію»: the panel closes, the note has the old password and title, no «новий»', await pg.locator('#hist').isHidden() && s2.note.title==='Доступи' && s2.note.blocks.some(b=>b.text==='пароль: Qw3rty!') && !s2.note.blocks.some(b=>b.text==='новий') && (await texts(pg))==='пароль: Qw3rty!|перший|третій');
  ok('11 the state before is a version («base» with «новий»), the restore is a version from v1, older versions stay ('+s2.vers.map(v=>v.reason).join(',')+')', rs.length===1 && rs[0].from===v1.id && base.length===1 && s2.vers.length===4 && s2.vers.some(v=>v.id===v1.id) && s2.vers.some(v=>v.id===v2.id));
  ok('12 the undo bar says «'+undo+'»', /^Нотатку відновлено до версії \d\d:\d\d$/.test(undo));
  await pg.click('#undo .ubtn'); await pg.waitForTimeout(800); const s3=await stored(pg);
  ok('13 «Скасувати» brings back the state before, title too («'+s3.note.title+'», '+await texts(pg)+')', s3.note.title==='Нова назва' && s3.note.blocks.some(b=>b.text==='новий') && s3.note.blocks.some(b=>b.text==='пароль: ууу'));

  await pg.click('#histBtn'); await pg.waitForTimeout(400); const r2=await rows(pg);
  ok('14 the list now shows «відновлено з …» ('+r2.map(x=>x.k).join(' / ')+')', r2.some(x=>/^відновлено з \d\d:\d\d$/.test(x.k)) && r2.some(x=>x.k==='перед правкою'));
  await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(150); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok('15 Esc closes the panel and shows the live note', await pg.locator('#hist').isHidden() && await view(pg)===null && (await texts(pg)).includes('новий') && await pg.getAttribute('#histBtn','aria-pressed')==='false');
  await pg.keyboard.press('Control+Alt+KeyH'); await pg.waitForTimeout(300); const byKey=await pg.locator('#hist').isVisible();
  await pg.click('#histList .hv[data-id="'+v1.id+'"]'); await pg.waitForTimeout(150); await pg.click('#newBtn'); await pg.waitForTimeout(300);
  ok('16 Ctrl+Alt+H opens it; a new note closes it and leaves «Доступи» as it was', byKey && await pg.locator('#hist').isHidden() && (await stored(pg)).note.blocks.some(b=>b.text==='новий'));

  console.log(errs.length? errs.join('\n') : '✓ no errors (computer)'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone: a bottom sheet with a slider, Back closes it ── */
for(const [w,h] of [[390,844],[320,568]]){ const ctx=await br.newContext({...CTX, viewport:{width:w,height:h}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  await setup(pg); const s0=await stored(pg);
  const btn=await pg.locator('#histBtn').boundingBox();
  ok(w+' 1 «Історія» sits in the header within the screen ('+Math.round(btn.x+btn.width)+' ≤ '+w+')', btn.x+btn.width<=w && btn.y<44);
  await pg.tap('#histBtn'); await pg.waitForTimeout(400);
  const g=await pg.evaluate(()=>{ const r=document.getElementById('hist').getBoundingClientRect(), b=document.getElementById('histRestore').getBoundingClientRect(); return {top:r.top, h:r.height, bottom:r.bottom, rb:b.bottom, rr:b.right, range:getComputedStyle(document.getElementById('histRange')).display, fab:document.getElementById('fab').hidden}; });
  ok(w+' 2 a bottom sheet of 40% ('+Math.round(g.h)+'px) with the slider and «Відновити» inside the screen; «+» hidden', Math.abs(g.h-h*0.4)<2 && Math.round(g.bottom)===h && g.rb<=h && g.rr<=w && g.range==='block' && g.fab);
  await pg.focus('#histRange'); await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(200); const v1=await view(pg); await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(200); const v2=await view(pg);
  ok(w+' 3 the slider steps back through the versions ('+[v1===s0.vers[1].id, v2===s0.vers[0].id].join(',')+')', v1===s0.vers[1].id && v2===s0.vers[0].id && (await texts(pg)).includes('Qw3rty!'));
  if(w===390) await pg.screenshot({path:OUT+'/appversions2-phone.png'});
  await pg.goBack(); await pg.waitForTimeout(400);
  ok(w+' 4 Back closes the panel and the live note is back', await pg.locator('#hist').isHidden() && await view(pg)===null && (await texts(pg)).includes('ууу'));
  console.log(errs.length? errs.join('\n') : '✓ no errors ('+w+')'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
