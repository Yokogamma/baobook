// The new layout behind its switch (docs/LAYOUT-SEAMS-PLAN.md §8.1, S5d-2a; docs/LAYOUT-ENGINE-PLAN.md §6): the switch on the
// development site only, a real note opened by the engine with nothing written, typing, a block made and deleted through it, what
// it writes, the journal exported and replayed in Node, the text size, the safe mode, and today's layout untouched with it off.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import { fxFromCol, W0PX, SHEETW } from '../public/layout/geometry.js';
import { entriesOf, replay } from '../public/layout/journal.js';
import { KINDS } from '../public/layout/kinds.js';
const SITE=(await serve()).url, DEV='baobook.matamata.dev', APP='baobook.matamata.app';
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c,got)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n+(c||got===undefined? '' : ': '+JSON.stringify(got).slice(0,900))); };

// The real hosts are answered from the local server (as tests/appdevtag.mjs does); service workers are blocked.
const open=async(host,opts={})=>{
  const ctx=await br.newContext({...CTX, serviceWorkers:'block', viewport:{width:1800,height:900}, acceptDownloads:true, ...opts}); const pg=await ctx.newPage(); const errs=[];
  pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('console: '+m.text()); });
  if(host) await ctx.route(`https://${host}/**`, async r=>{ const u=new URL(r.request().url()); r.fulfill({response:await r.fetch({url:SITE+u.pathname.slice(1)+u.search})}); });
  const url=host? `https://${host}/` : SITE;
  await pg.goto(url); await pg.waitForSelector('html[data-started]'); await pg.waitForTimeout(150);
  return {ctx, pg, errs, url};
};
// `data-started`: the page's start() ran to its end, the layout's modules loaded or not
const ready=async pg=>{ await pg.waitForSelector('html[data-started]'); await pg.waitForTimeout(150); };
/** The switch clicked: the tab reloads by itself, and the new page is waited for. */
const flip=async pg=>{ await pg.locator('#setBtn').click(); await Promise.all([pg.waitForEvent('load'), pg.locator('#layRow').click()]); await ready(pg); };
const setting=(pg,p)=>pg.evaluate(p=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); Object.assign(s,p); localStorage.setItem('sheet:settings',JSON.stringify(s)); },p);
const go=async(pg,id)=>{ await setting(pg,{current:id}); await pg.evaluate(()=>{ sessionStorage.clear(); history.replaceState(null,'',location.pathname); }); await pg.reload(); await ready(pg); };
const settings=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));
const seed=(pg,note)=>pg.evaluate(n=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readwrite'); t.objectStore('notes').put(n); t.oncomplete=()=>{ d.close(); res(); }; }; }), note);
const stored=(pg,id)=>pg.evaluate(id=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readonly').objectStore('notes').get(id); t.onsuccess=()=>{ d.close(); res(t.result); }; }; }), id);
const byId=n=>Object.fromEntries(n.blocks.map(b=>[b.id,b]));
/** Every block on the sheet by the start of its text: its place and size in the page's pixels, a child's inside its area. */
const geo=pg=>pg.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#sheet .blk')].map(e=>{ const card=e.children[1], f=e.classList.contains('is-area')? null : card.querySelector('.txt,.code');
  return [f? f.textContent.replace(/\u200b/g,'').trim().slice(0,6).trim()||'∅' : 'area', {l:e.offsetLeft, t:e.offsetTop, w:card.offsetWidth, h:card.offsetHeight, ew:e.offsetWidth, in:!!e.parentElement.closest('.blk')}]; })));
const state=pg=>pg.evaluate(()=>({lay:document.getElementById('app').classList.contains('lay01'), safe:document.getElementById('sheet').classList.contains('lay-safe'), w:document.getElementById('sheet').clientWidth,
  row:!document.getElementById('layRow').hidden, on:document.getElementById('layOn').checked, journal:!document.getElementById('layJournal').hidden}));
const G=24;
const NOTE={id:'lay1', title:'Layout', created:1, updated:Date.now()+60000, blocks:[
  {id:'t1', fx:fxFromCol(3), row:2, text:'Alpha one'},
  {id:'t2', fx:fxFromCol(3), row:5, text:'Beta two'},
  {id:'t3', fx:fxFromCol(3), row:9, text:'Gamma three'},
  {id:'c1', fx:fxFromCol(20), row:2, kind:'code', lang:'javascript', text:'const a=1;\nconst b=2;'},
  {id:'A',  fx:fxFromCol(36), row:3, kind:'area', cw:14, title:'Area'},
  {id:'k1', parent:'A', col:0, row:0, text:'Kid one'},
  {id:'k2', parent:'A', col:0, row:2, text:'Kid two'}]};

/* ── 1: the switch is the development site's ─────────────────────────────────────── */
for(const host of [null, APP]){ const {ctx,pg,errs}=await open(host); await setting(pg,{layout:true}); await pg.reload(); await ready(pg); const s=await state(pg);
  ok(`1 ${host||'127.0.0.1'}: no switch in the settings menu, and a saved setting turns nothing on`, !s.row && !s.lay && !s.journal && !errs.length, {s, errs}); await ctx.close(); }

const {ctx,pg,errs}=await open(DEV);
{ const s=await state(pg);
  ok('1a baobook.matamata.dev: the switch is in the settings menu, off; the layout is today\'s', s.row && !s.on && !s.lay && !s.journal, s); }

/* ── 2: a note written by today's layout opens the same under the engine, and opening writes nothing ── */
// the window is set so that today's sheet is as wide as the width the engine reads `fx` at: both read the same columns
{ const w=(await state(pg)).w; await pg.setViewportSize({width:1800+(W0PX-w), height:900}); await pg.waitForTimeout(200); }
await seed(pg, NOTE); await go(pg,'lay1');
const before=await geo(pg), sOff=await state(pg), n0=await stored(pg,'lay1');
ok('2 with the switch off the sheet is the window\'s, here '+sOff.w+' px', sOff.w===W0PX && !sOff.lay && Object.keys(before).length===7, {sOff, before});
await flip(pg);
const sOn=await state(pg), after=await geo(pg), n1=await stored(pg,'lay1');
ok('2a the switch turned on: the tab reloaded, the setting is saved, the engine lays the note out and the journal can be exported', sOn.lay && sOn.on && sOn.journal && (await settings(pg)).layout===true && sOn.w===W0PX, sOn);
{ const same=Object.keys(before).filter(k=>before[k].l===after[k].l && before[k].t===after[k].t), texts=['Alpha','Beta t','Gamma','Kid on','Kid tw'];
  ok('2b every block stands where today\'s layout shows it, and the texts are as wide and as tall', same.length===7 && texts.every(k=>before[k].w===after[k].w && before[k].h===after[k].h), {before, after});
  ok('2c an area is as wide as its set width and its header and children tall, without the spare row today\'s layout keeps under them; a code block with no set width is as wide as its longest line (W14), no longer up to the sheet\'s edge', after.area.w===before.area.w && after.area.w===14*G && after.area.h===before.area.h-G && after.const.ew<before.const.ew && after.const.h===before.const.h, {b:before.const, a:after.const});
  ok('2d opening wrote nothing: the stored note is the same, byte for byte', JSON.stringify(n0)===JSON.stringify(n1)); }

/* ── 3: typing ──────────────────────────────────────────────────────────────────── */
const txt=t=>pg.locator('#sheet .blk .txt').filter({hasText:t});
await txt('Alpha one').click(); await pg.keyboard.press('Control+End'); for(let i=0;i<5;i++){ await pg.keyboard.press('Enter'); await pg.keyboard.type('line '+i); }
await pg.waitForTimeout(700);
{ const g=await geo(pg), n=byId(await stored(pg,'lay1'));
  ok('3 a text that grows pushes what is under it, each as many rows lower as it grew, the gaps between them kept: six rows, the two texts below five rows lower', g.Alpha.h===6*G && g['Beta t'].t===after['Beta t'].t+5*G && g.Gamma.t===after.Gamma.t+5*G && g.const.t===after.const.t && g.area.t===after.area.t, g);
  ok('3a the rows that followed are written with the text, and nothing else of a place', n.t2.row===10 && n.t3.row===14 && n.t1.row===2 && n.t1.fx===NOTE.blocks[0].fx && n.c1.row===2 && n.A.row===3 && /line 4/.test(n.t1.text), {t2:n.t2.row, t3:n.t3.row}); }
for(let i=0;i<5;i++){ await pg.keyboard.press('Shift+Home'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); }
await pg.waitForTimeout(700);
{ const g=await geo(pg), n=byId(await stored(pg,'lay1'));
  ok('3b the text shrinks back and the blocks under it come back: a push is not permanent (H1)', g.Alpha.h===G && g['Beta t'].t===after['Beta t'].t && g.Gamma.t===after.Gamma.t && n.t2.row===5 && n.t3.row===9 && n.t1.text==='Alpha one', {g, rows:[n.t2.row, n.t3.row], text:n.t1.text}); }
await pg.keyboard.press('Escape');

/* ── 4: a block made and deleted ────────────────────────────────────────────────── */
const sheetBox=await pg.locator('#sheet').boundingBox();
await pg.mouse.click(sheetBox.x+G/2+10*G+4, sheetBox.y+G/2+16*G+12); await pg.keyboard.type('New block'); await pg.waitForTimeout(700);
{ const g=await geo(pg), n=await stored(pg,'lay1'), b=n.blocks.find(x=>x.text==='New block');
  ok('4 a click on the empty sheet and typing: a block there, stored at its cell', !!g['New bl'] && g['New bl'].t===G/2+16*G && !!b && b.row===16 && Math.abs(b.fx-fxFromCol(9))<1e-9 && b.parent===undefined, {g:g['New bl'], b}); }
await pg.keyboard.press('Escape');
// in the area: a click on its body
{ const a=await pg.locator('#sheet .blk.is-area .abody').boundingBox(); await pg.mouse.click(a.x+9*G, a.y+a.height-8); await pg.keyboard.type('Kid three'); await pg.waitForTimeout(700);
  const n=await stored(pg,'lay1'), b=n.blocks.find(x=>x.text==='Kid three'), g=await geo(pg);
  ok('4a a click in an area and typing: a child of the area, stored with its column and row there', !!b && b.parent==='A' && Number.isInteger(b.col) && Number.isInteger(b.row) && b.fx===undefined && g['Kid th'].in, {b, g:g['Kid th']}); }
await pg.keyboard.press('Escape');
// delete «Beta two» from its menu, and bring it back
{ const g0=await geo(pg); await pg.locator('#sheet .blk').filter({hasText:'Beta two'}).locator('.grip').click({button:'right'}); await pg.waitForTimeout(200);
  const items=await pg.locator('.bm .mi').allInnerTexts();
  ok('4b the block\'s menu in the slice: copy, the link and delete; no position mode, no «В область», no size', items.length===3 && /Видалити/.test(items.join('|')) && !/Розмір|Виділити|область/i.test(items.join('|')), items);
  await pg.locator('.bm .mi.danger').first().click(); await pg.waitForTimeout(700);
  const g1=await geo(pg), n=await stored(pg,'lay1');
  ok('4c deleted: the block is gone from the page and from the stored note, the others stay', !g1['Beta t'] && !n.blocks.some(b=>b.id==='t2') && g1.Gamma.t===g0.Gamma.t && g1.Alpha.t===g0.Alpha.t, g1);
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(700);
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('4d «Скасувати» brings it back at its cell', !!g2['Beta t'] && g2['Beta t'].t===g0['Beta t'].t && g2['Beta t'].l===g0['Beta t'].l && n2.t2 && n2.t2.row===5, g2['Beta t']); }

/* ── 5: what the slice leaves out ───────────────────────────────────────────────── */
{ const g0=await geo(pg), grip=await pg.locator('#sheet .blk').filter({hasText:'Gamma three'}).locator('.grip').boundingBox();
  await pg.mouse.move(grip.x+4, grip.y+8); await pg.mouse.down(); await pg.mouse.move(grip.x+200, grip.y+150, {steps:8}); await pg.mouse.up(); await pg.waitForTimeout(400);
  const g1=await geo(pg), rz=await pg.locator('#sheet .blk .rz').evaluateAll(els=>els.filter(e=>getComputedStyle(e).display!=='none').length);
  ok('5 the carry is not in this part: a drag by the grip moves nothing; no resize handle is shown', JSON.stringify(g0)===JSON.stringify(g1) && rz===0, {rz}); }

/* ── 6: a reload, and the note stands as it was left; nothing is written by opening ── */
{ const g0=await geo(pg), n0=await stored(pg,'lay1'); await pg.reload(); await ready(pg); const g1=await geo(pg), n1=await stored(pg,'lay1');
  ok('6 reloaded: every block where it stood, and the stored note unchanged', JSON.stringify(g0)===JSON.stringify(g1) && JSON.stringify(n0)===JSON.stringify(n1), {g0, g1}); }

/* ── 7: the journal ─────────────────────────────────────────────────────────────── */
await txt('Gamma three').click(); await pg.keyboard.press('Control+End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('more'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape');
{ await pg.locator('#setBtn').click(); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#layJournal').click()]);
  const text=fs.readFileSync(await dl.path(),'utf8'), es=entriesOf(text), fit=es.filter(e=>!e.unfit), res=fit.map(e=>replay(e, KINDS));
  ok(`7 the journal is saved as a file (${dl.suggestedFilename()}): ${es.length} commands, each with the measuring version, every one fit and replayed in Node to the recorded answer`, /^baobook-layout-journal-\d+\.json$/.test(dl.suggestedFilename()) && es.length>0 && fit.length===es.length && res.every(r=>r.same===true) && es.every(e=>/^[0-9.]+$/.test(e.answers.version)), {n:es.length, unfit:es.map(e=>e.unfit).filter(Boolean), res:res.filter(r=>r.same!==true).length});
  ok('7a no word of the note in it', !/Gamma|Alpha|Kid|more|const a/.test(text));
  await pg.keyboard.press('Escape'); }

/* ── 7b: a collapsed area's children are measured where something has a size; a title held and empty ── */
const rects=pg=>pg.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#sheet .blk')].map(e=>{ const card=e.children[1], r=card.getBoundingClientRect(), f=e.classList.contains('is-area')? null : card.querySelector('.txt,.code');
  return [f? f.textContent.trim().slice(0,3) : 'area', {x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), b:Math.round(r.bottom), r:Math.round(r.right)}]; })));
{ const note={id:'lay3', title:'Collapsed', created:3, updated:Date.now()+90000, blocks:[
    {id:'A', fx:fxFromCol(4), row:3, kind:'area', cw:14, collapsed:true}, {id:'k', parent:'A', col:0, row:0, text:'One\nTwo\nThree'}, {id:'u', fx:fxFromCol(4), row:7, text:'Under'}]};
  await seed(pg, note); await go(pg,'lay3');
  await pg.locator('#sheet .blk.is-area .fold').click(); await pg.waitForTimeout(500);
  const r1=await rects(pg), n1=await stored(pg,'lay3');
  // with no reload between: the fold button is what is held when the header is first measured, then the empty title
  await pg.locator('#sheet .blk.is-area .ctitle').click(); await pg.waitForTimeout(400); const rT=await rects(pg), headT=await pg.evaluate(()=>[document.querySelector('#sheet .is-area .cbar').offsetHeight, document.activeElement.className]);
  await pg.locator('#ttl').click(); await pg.waitForTimeout(400); const rB=await rects(pg);
  await pg.reload(); await ready(pg); const r2=await rects(pg);
  const inside=r=>r.One.x>=r.area.x && r.One.r<=r.area.r && r.One.y>=r.area.y && r.One.b<=r.area.b, clear=r=>r.Und.y>=r.area.b;
  ok('7b an area loaded collapsed and opened: its child is as wide and as tall as its three lines, inside the frame, the block under the area clear of it; the same after a reload', r1.One.h===3*G && r1.One.w>40 && inside(r1) && clear(r1) && JSON.stringify(r1)===JSON.stringify(r2) && !byId(n1).A.collapsed, {r1, r2});
  ok('7b\' opened by its button and then its empty title held, with no reload: the header is taller ('+headT[0]+' px) and the frame holds the child; left again, the area is as it was', /ctitle/.test(headT[1]) && rT.area.h>r1.area.h && inside(rT) && clear(rT) && JSON.stringify(rB)===JSON.stringify(r1), {r1, rT, rB, headT});
  // the title: empty, held, with a character, empty again, left
  const title=pg.locator('#sheet .blk.is-area .ctitle'), steps=[]; const step=async name=>{ await pg.waitForTimeout(350); const r=await rects(pg); steps.push({name, head:await pg.evaluate(()=>document.querySelector('#sheet .is-area .cbar').offsetHeight), ok:inside(r) && clear(r), area:r.area.h, one:[r.One.y, r.One.b], under:r.Und.y}); };
  await step('empty'); await title.click(); await step('held'); await pg.keyboard.type('X'); await step('text'); await pg.keyboard.press('Backspace'); await step('empty again'); await pg.keyboard.press('Escape'); await pg.locator('#ttl').click(); await step('left');
  ok('7c an area\'s empty title held, typed in, emptied and left: at every step the child is inside the frame and the block under the area clear of it, whatever the header\'s height ('+steps.map(s=>s.name+' '+s.head).join(', ')+')', steps.every(s=>s.ok) && new Set(steps.map(s=>s.head)).size>1, steps); }

/* ── 7d: no area is drawn in the slice ──────────────────────────────────────────── */
{ await go(pg,'lay1'); const sb=await pg.locator('#sheet').boundingBox(), n0=(await stored(pg,'lay1')).blocks.filter(b=>b.kind==='area').length;
  await pg.mouse.move(sb.x+G/2+10*G, sb.y+G/2+24*G); await pg.mouse.down(); await pg.mouse.move(sb.x+G/2+30*G, sb.y+G/2+32*G, {steps:6}); const marq=await pg.locator('.marq').count(); await pg.mouse.up(); await pg.waitForTimeout(500);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const n1=(await stored(pg,'lay1')).blocks.filter(b=>b.kind==='area').length, onPage=await pg.locator('#sheet .blk.is-area').count();
  ok('7d a drag over the empty sheet shows no frame and makes no area', marq===0 && n0===1 && n1===1 && onPage===1, {marq, n0, n1, onPage}); }

/* ── 8: the text size ───────────────────────────────────────────────────────────── */
{ await setting(pg,{textSys:false, textSheet:20}); await pg.reload(); await ready(pg);
  const g=await geo(pg), cell=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g'))), s=await state(pg);
  ok(`8 a larger text (a cell of ${cell} px): the sheet is ${SHEETW} columns of it, the blocks stand on the same cells`, cell===30 && Math.abs(s.w-W0PX*cell/G)<=1 && g.Alpha.t===cell/2+2*cell && g['Beta t'].t===cell/2+5*cell && !s.safe, {cell, s, a:g.Alpha, b:g['Beta t']});
  await setting(pg,{textSys:false, textSheet:16}); await pg.reload(); await ready(pg); }

/* ── 9: the safe mode ───────────────────────────────────────────────────────────── */
{ const bad={id:'lay2', title:'Out of range', created:2, updated:Date.now()+120000, blocks:[{id:'x1', fx:fxFromCol(3), row:2, text:'Near'}, {id:'x2', fx:fxFromCol(3), row:1e20, text:'Far'}]};
  await seed(pg, bad); await go(pg,'lay2');
  const s=await state(pg), toast=await pg.locator('#toast').innerText();
  ok('9 a note with a row out of the engine\'s range opens in the safe mode, and the person is told', s.safe && /Розкладку/.test(toast), {s, toast});
  await txt('Near').click(); await pg.keyboard.press('Control+End'); await pg.keyboard.type(' typed'); await pg.waitForTimeout(700);
  const n=byId(await stored(pg,'lay2'));
  ok('9a typing there is saved; no place is written: the stored row stays as it was', n.x1.text==='Near typed' && n.x2.row===1e20 && n.x1.row===2 && n.x1.fx===bad.blocks[0].fx, n);
  await pg.keyboard.press('Escape'); }

/* ── 10: off again ──────────────────────────────────────────────────────────────── */
{ await go(pg,'lay1'); const gOn=await geo(pg);
  await flip(pg);
  const s=await state(pg), gOff=await geo(pg), keys=Object.keys(gOn).filter(k=>k!=='const');
  ok('10 the switch turned off: today\'s layout again, the note the engine wrote standing where it stood', !s.lay && !s.on && (await settings(pg)).layout===false && keys.every(k=>gOn[k].l===gOff[k].l && gOn[k].t===gOff[k].t), {s, gOn, gOff}); }
ok('11 no page errors', !errs.length, errs);
await ctx.close();

/* ── 12: two tabs: the switch changed in one reloads the other ──────────────────── */
{ const {ctx,pg,errs}=await open(DEV); const p2=await ctx.newPage(); await p2.goto(`https://${DEV}/`); await ready(p2);
  await flip(pg); await p2.waitForFunction(()=>document.documentElement.dataset.started!==undefined && document.getElementById('app').classList.contains('lay01'), null, {timeout:20000}).catch(()=>{});   // the other tab reloads by itself, whenever the message reaches it
  const a=await state(pg), b=await state(p2);
  ok('12 the switch turned on in one tab: the other tab reloads and runs the engine too', a.lay && b.lay && !errs.length, {a, b, errs}); await ctx.close(); }

await br.close(); process.exit(fails? 1 : 0);
