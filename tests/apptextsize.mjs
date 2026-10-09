import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const wipe=async pg=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };
const importNotes=async(pg,notes)=>{ await pg.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))}); await pg.waitForTimeout(800); };
const NOTE={id:'t1',title:'Субота',blocks:[{id:'a',row:3,text:'Молоко, хліб, яблука',fx:0.3},{id:'b',row:9,text:'Подзвонити мамі',fx:0.3}],created:1,updated:Date.now()};
// the root variables and the root font size; a computed font size of the first match
const vars=pg=>pg.evaluate(()=>{ const r=getComputedStyle(document.documentElement), v=n=>r.getPropertyValue(n).trim(); return {k:v('--k'), fs:v('--fs'), g:v('--g'), root:r.fontSize}; });
const size=(pg,sel)=>pg.evaluate(s=>{ const e=document.querySelector(s); return e? parseFloat(getComputedStyle(e).fontSize) : 0; }, sel);
const saved=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));
const blk=(pg,id)=>pg.evaluate(id=>{ const e=[...document.querySelectorAll('#sheet .blk')].find(x=>x.textContent.includes(id)); if(!e) return null; const t=e.querySelector('.txt'); return {top:e.offsetTop, left:e.offsetLeft, fs:parseFloat(getComputedStyle(t).fontSize), lh:parseFloat(getComputedStyle(t).lineHeight)}; }, id);
const exported=async pg=>{ await pg.click('#setBtn'); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.click('#exportBtn')]); return JSON.parse(fs.readFileSync(await dl.path(),'utf8')); };
const openDlg=async pg=>{ await pg.click('#setBtn'); await pg.click('#textBtn'); await pg.waitForTimeout(150); };

/* ── computer: system mode by default, the dialog, the sheet text, the interface factor, persistence, export ─────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}, acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(SITE); await wipe(pg); await importNotes(pg,[NOTE]); await pg.locator('#list .item').filter({hasText:'Субота'}).click(); await pg.waitForTimeout(300);
  const v0=await vars(pg), s0={title:await size(pg,'.it-t'), date:await size(pg,'.it-d'), menu:await size(pg,'.setpop'), search:await size(pg,'#q'), foot:await size(pg,'.stor')};
  ok('1 by default «Як у системі»: root 16px, sheet text 16 on a 24 grid ('+JSON.stringify(v0)+')', v0.k==='1' && v0.root==='16px' && v0.fs==='16px' && v0.g==='24px');
  ok('1b on a computer the interface is the old sizes + 1px: list title 14, date 12, menu 14, search 14, footer 12 ('+Object.values(s0).join(', ')+')', s0.title===14 && s0.date===12 && s0.menu===14 && s0.search===14 && s0.foot===12);
  const ink=await pg.evaluate(()=>getComputedStyle(document.querySelector('.it-d')).color);
  ok('1c the note date is drawn in the caption colour, not the faint one ('+ink+')', ink==='rgb(107, 106, 101)');
  await pg.click('#setBtn'); await pg.waitForTimeout(100);
  ok('2 the gear menu has «Розмір тексту» with «як у системі»', (await pg.textContent('#textBtn')).replace(/\s+/g,' ').trim()==='Розмір текстуяк у системі' || (await pg.textContent('#textBtn')).includes('як у системі'));
  await pg.click('#textBtn'); await pg.waitForTimeout(150);
  const d0=await pg.evaluate(()=>({open:document.getElementById('tsz').open, menu:!document.getElementById('setPop').hidden, sys:document.getElementById('tszSys').getAttribute('aria-checked'), v:document.getElementById('tszSheetV').textContent, ui:document.getElementById('tszUiV').textContent, checked:document.querySelectorAll('#tszUi [aria-checked="true"]').length}));
  ok('2b it opens the dialog and closes the menu: the switch is on, «16 px», interface «100 %», no step picked ('+JSON.stringify(d0)+')', d0.open && !d0.menu && d0.sys==='true' && d0.v==='16 px' && d0.ui==='100 %' && d0.checked===0);
  const a0=await blk(pg,'Молоко'), b0=await blk(pg,'Подзвонити');
  await pg.locator('#tszSheet').fill('3'); await pg.waitForTimeout(250);
  const v1=await vars(pg), a1=await blk(pg,'Молоко'), b1=await blk(pg,'Подзвонити'), st1=await saved(pg);
  ok('3 the slider to 20: --fs 20px and --g 30px, the blocks draw 20px text on 30px rows ('+v1.fs+' '+v1.g+', '+a1.fs+'/'+a1.lh+')', v1.fs==='20px' && v1.g==='30px' && a1.fs===20 && a1.lh===30);
  ok('3b the blocks keep their rows: six rows apart before and after ('+(b0.top-a0.top)+' → '+(b1.top-a1.top)+')', b0.top-a0.top===6*24 && b1.top-a1.top===6*30);
  ok('3c and their place across: within one cell ('+a0.left+' → '+a1.left+')', Math.abs(a1.left-a0.left)<=30);
  ok('3d moving a control leaves system mode and saves the sizes ('+JSON.stringify(st1)+')', st1.textSys===false && st1.textSheet===20 && st1.textUi===1 && await pg.getAttribute('#tszSys','aria-checked')==='false');
  await pg.click('#tszUi [data-i="2"]'); await pg.waitForTimeout(250);
  const v2=await vars(pg), t2=await size(pg,'.it-t'), sw=await pg.evaluate(()=>Math.round(document.getElementById('side').getBoundingClientRect().width));
  ok('4 «Більший» sets --k 1.15: root 18.4px, list title 16.1px, panel 322px ('+v2.root+', '+t2+', '+sw+')', v2.k==='1.15' && v2.root==='18.4px' && Math.abs(t2-16.1)<.05 && sw===322);
  ok('4b the value reads «Більший · 115 %» and that step is the checked radio', await pg.textContent('#tszUiV')==='Більший · 115 %' && await pg.getAttribute('#tszUi [data-i="2"]','aria-checked')==='true');
  await pg.focus('#tszUi [data-i="2"]'); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(150);
  ok('5 arrows move through the steps: → gives «Найбільший» with the focus on it', (await vars(pg)).k==='1.3' && await pg.evaluate(()=>document.activeElement.dataset.i)==='3');
  await pg.keyboard.press('ArrowLeft'); await pg.waitForTimeout(150);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  ok('6 Esc closes the dialog', !(await pg.evaluate(()=>document.getElementById('tsz').open)));
  await pg.reload(); await pg.waitForTimeout(600);
  const v3=await vars(pg);
  ok('7 after a reload the sizes are back before anything is drawn ('+JSON.stringify(v3)+'), the menu says «20 · 115 %»', v3.fs==='20px' && v3.k==='1.15' && (await pg.textContent('#textV'))==='20 · 115 %' && (await blk(pg,'Молоко')).fs===20);
  const ex=await exported(pg);
  ok('8 the sizes are this device\'s: the export carries neither them nor a change to the notes ('+JSON.stringify(ex.settings)+', rows '+ex.notes.find(n=>n.id==='t1').blocks.map(b=>b.row).join(',')+')', !('textSheet' in ex.settings) && !('textUi' in ex.settings) && !('textSys' in ex.settings) && ex.notes.find(n=>n.id==='t1').blocks.map(b=>b.row).join(',')==='3,9');
  await openDlg(pg); await pg.click('#tszReset'); await pg.waitForTimeout(250);
  const v4=await vars(pg), st4=await saved(pg);
  ok('9 «Скинути» goes back to the system sizes ('+JSON.stringify(v4)+')', v4.fs==='16px' && v4.k==='1' && st4.textSys===true && !('textSheet' in st4) && await pg.getAttribute('#tszSys','aria-checked')==='true');
  await pg.click('#tszSys'); await pg.waitForTimeout(200);
  const v5=await vars(pg), st5=await saved(pg);
  ok('10 switching system mode off moves nothing: the sizes it showed become the manual ones ('+JSON.stringify(st5)+')', v5.fs==='16px' && v5.k==='1' && st5.textSys===false && st5.textSheet===16 && st5.textUi===1);
  await pg.click('#tszDone'); await pg.waitForTimeout(100);
  ok('10b «Готово» closes it', !(await pg.evaluate(()=>document.getElementById('tsz').open)));
  await pg.screenshot({path:OUT+'/textsize-desktop.png'});
  ok('no errors (computer)', !errs.length); if(errs.length) console.log(errs.join('\n'));
  await ctx.close(); }

/* ── the browser's own font size counts as the system size ─────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Page.enable'); await cdp.send('Page.setFontSizes',{fontSizes:{standard:20, fixed:16}});
  await pg.goto(SITE); await wipe(pg);
  const v=await vars(pg), t=await size(pg,'.it-t');
  ok('11 a browser set to 20px: the interface scales by 1.25 and the sheet text follows (root '+v.root+', list title '+t+', sheet '+v.fs+'/'+v.g+')', v.root==='20px' && t===17.5 && v.fs==='20px' && v.g==='30px');
  ok('no errors (browser font size)', !errs.length); if(errs.length) console.log(errs.join('\n'));
  await ctx.close(); }

/* ── phone: the touch scale, 18px sheet text, the «⋯» stepper, the dialog as a bottom sheet ─────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  await pg.goto(SITE); await wipe(pg); await importNotes(pg,[NOTE]);
  const v0=await vars(pg);
  ok('12 a phone reads 18px sheet text on a 27px grid by default ('+v0.fs+'/'+v0.g+')', v0.fs==='18px' && v0.g==='27px' && v0.k==='1');
  await pg.click('#sideBtn'); await pg.waitForTimeout(350);
  const s={title:await size(pg,'.it-t'), sub:await size(pg,'.it-s'), date:await size(pg,'.it-d'), search:await size(pg,'#q'), brand:await size(pg,'.brand'), foot:await size(pg,'.stor')};
  const side=await pg.evaluate(()=>{ const r=document.getElementById('side').getBoundingClientRect(), q=document.getElementById('searchBox').getBoundingClientRect(); return {w:Math.round(r.width), q:Math.round(q.height)}; });
  ok('12b the phone scale: list title 16, preview 14, date 13, brand 17, footer 13 ('+[s.title,s.sub,s.date,s.brand,s.foot].join(', ')+')', s.title===16 && s.sub===14 && s.date===13 && s.brand===17 && s.foot===13);
  ok('12c the search field is 16px, so iOS does not zoom into it, and 44px tall; the panel is 340px ('+s.search+', '+side.q+', '+side.w+')', s.search>=16 && side.q===44 && side.w===340);
  await pg.click('#setBtn'); await pg.waitForTimeout(150);
  ok('13 the settings menu reads 16px on a phone', await size(pg,'.setpop .mi')===16);
  await pg.click('#textBtn'); await pg.waitForTimeout(250);
  const dlg=await pg.evaluate(()=>{ const r=document.getElementById('tsz').getBoundingClientRect(), b=[...document.querySelectorAll('#tszUi button')].map(x=>Math.round(x.getBoundingClientRect().height)); return {l:Math.round(r.left), w:Math.round(r.width), bottom:Math.round(r.bottom), h:innerHeight, b}; });
  ok('14 on a phone the dialog is a bottom sheet across the screen, its steps 44px tall ('+JSON.stringify(dlg)+')', dlg.l===0 && dlg.w===390 && Math.abs(dlg.bottom-dlg.h)<=1 && dlg.b.every(h=>h>=44));
  await pg.goBack(); await pg.waitForTimeout(250);
  ok('14b system Back closes it', !(await pg.evaluate(()=>document.getElementById('tsz').open)));
  if(await pg.evaluate(()=>document.getElementById('app').classList.contains('open'))){ await pg.click('#backdrop',{position:{x:370,y:400}}); await pg.waitForTimeout(350); }
  await pg.click('#moreBtn'); await pg.waitForTimeout(200);
  const st=await pg.evaluate(()=>{ const s=document.querySelector('.amenu .mi-step'); return s && {out:s.querySelector('output').textContent, label:s.getAttribute('aria-label'), h:[...s.querySelectorAll('button')].map(b=>Math.round(b.getBoundingClientRect().height))}; });
  ok('15 the header «⋯» has «Текст нотаток» with − 18 + (buttons 44px) ('+JSON.stringify(st)+')', st && st.out==='18' && st.label==='Текст нотаток' && st.h.every(h=>h===44));
  await pg.tap('.mi-step [data-d="1"]'); await pg.waitForTimeout(250);
  ok('15b + gives 20: the sheet text grows and the menu stays open', (await vars(pg)).fs==='20px' && await pg.textContent('.mi-step output')==='20' && await pg.locator('.amenu').count()===1);
  for(let i=0;i<3;i++){ await pg.tap('.mi-step [data-d="-1"]'); await pg.waitForTimeout(150); }
  ok('15c − three times gives 14, and − is disabled there', (await vars(pg)).fs==='14px' && await pg.isDisabled('.mi-step [data-d="-1"]') && (await saved(pg)).textSheet===14);
  await pg.screenshot({path:OUT+'/textsize-phone.png'});
  ok('no errors (phone)', !errs.length); if(errs.length) console.log(errs.join('\n'));
  await ctx.close(); }

await br.close();
console.log(fails? '\n✗ '+fails+' failed' : '\n✓ all passed'); process.exit(fails?1:0);
