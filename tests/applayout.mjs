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
  ok('4b the block\'s menu in the slice: copy, the link, «В область…» and delete; no position mode, no size', items.length===4 && /Видалити/.test(items.join('|')) && /В область/.test(items.join('|')) && !/Розмір|Виділити/i.test(items.join('|')), items);
  await pg.locator('.bm .mi.danger').first().click(); await pg.waitForTimeout(700);
  const g1=await geo(pg), n=await stored(pg,'lay1');
  ok('4c deleted: the block is gone from the page and from the stored note, the others stay', !g1['Beta t'] && !n.blocks.some(b=>b.id==='t2') && g1.Gamma.t===g0.Gamma.t && g1.Alpha.t===g0.Alpha.t, g1);
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(700);
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('4d «Скасувати» brings it back at its cell', !!g2['Beta t'] && g2['Beta t'].t===g0['Beta t'].t && g2['Beta t'].l===g0['Beta t'].l && n2.t2 && n2.t2.row===5, g2['Beta t']); }

/* ── 5: the carry ───────────────────────────────────────────────────────────────── */
const gripOf=t=>pg.locator('#sheet .blk:not(.is-area)').filter({hasText:t}).locator('.grip').first();
/** Two readings of the page are the same, whatever the order of the elements in the document. */
const same=(a,b)=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]))===JSON.stringify(Object.keys(b).sort().map(k=>[k,b[k]]));
/** A block carried by its grip by so many cells, in steps; `end`: what ends it. */
const carry=async(t,dx,dy,end='up')=>{ const g=await gripOf(t).boundingBox(), x=g.x+g.width/2, y=g.y+g.height/2; await pg.mouse.move(x,y); await pg.mouse.down(); await pg.mouse.move(x+dx*G/2, y+dy*G/2, {steps:6}); await pg.mouse.move(x+dx*G, y+dy*G, {steps:6}); await pg.waitForTimeout(80);
  if(end==='esc'){ await pg.keyboard.press('Escape'); await pg.waitForTimeout(80); await pg.mouse.up(); } else if(end==='hold') return; else await pg.mouse.up(); await pg.waitForTimeout(500); };
const undoKey=async()=>{ await pg.locator('#ttl').click(); await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.activeElement.blur()); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500); };
{ const g0=await geo(pg), n0=byId(await stored(pg,'lay1'));
  await carry('Gamma three', 12, 4);
  const g1=await geo(pg), n1=byId(await stored(pg,'lay1')), rz=await pg.locator('#sheet .blk .rz').evaluateAll(els=>els.filter(e=>getComputedStyle(e).display!=='none').length);
  ok('5 a block carried by its grip twelve columns right and four rows down stands there, stored at that cell; nothing else moved; no resize handle is shown', g1.Gamma.l===g0.Gamma.l+12*G && g1.Gamma.t===g0.Gamma.t+4*G && n1.t3.row===n0.t3.row+4 && Math.abs(n1.t3.fx-fxFromCol(15))<1e-9 && ['Alpha','Beta t','const','area'].every(k=>g1[k].l===g0[k].l && g1[k].t===g0[k].t) && rz===0, {a:g0.Gamma, b:g1.Gamma, row:n1.t3.row, fx:n1.t3.fx});
  await undoKey();
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('5a Ctrl+Z puts it back, on the page and in the stored note', same(g2, g0) && n2.t3.row===n0.t3.row && n2.t3.fx===n0.t3.fx, {g2:g2.Gamma, n:n2.t3});
  await carry('Gamma three', 12, 4, 'esc');
  const g3=await geo(pg), n3=await stored(pg,'lay1');
  ok('5b a carry given up with Esc: every block where it stood, nothing written', same(g3, g0) && JSON.stringify(byId(n3))===JSON.stringify(n2), g3.Gamma);
  // onto another block: the engine makes room, and nothing overlaps
  await carry('Gamma three', 0, -4);
  const g4=await geo(pg), over=(a,b)=>a.l<b.l+b.ew && b.l<a.l+a.ew && a.t<b.t+b.h && b.t<a.t+a.h;
  ok('5c carried up onto «Beta two»: the two do not overlap after the drop', !over(g4.Gamma, g4['Beta t']) && !over(g4.Gamma, g4.Alpha), {gamma:g4.Gamma, beta:g4['Beta t']});
  await undoKey();
  ok('5c\' and Ctrl+Z gives the layout before', same(await geo(pg), g0)); }
// into an area and out of it, by the pointer
{ const g0=await geo(pg), a=await pg.locator('#sheet .blk.is-area .abody').boundingBox(), gr=await gripOf('Gamma three').boundingBox();
  await carry('Gamma three', Math.round((a.x+8*G-gr.x)/G), Math.round((a.y+a.height-G/2-gr.y)/G));
  const g1=await geo(pg), n1=byId(await stored(pg,'lay1'));
  ok('5d carried into the area: a child of it on the page and in the stored note, with its column and row there and no `fx`', g1.Gamma.in && n1.t3.parent==='A' && Number.isInteger(n1.t3.col) && Number.isInteger(n1.t3.row) && n1.t3.fx===undefined, {g:g1.Gamma, n:n1.t3});
  await undoKey();
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('5e Ctrl+Z takes it out again: on the sheet where it stood, stored with its `fx` and no parent', same(g2, g0) && n2.t3.parent===undefined && n2.t3.col===undefined && Math.abs(n2.t3.fx-fxFromCol(3))<1e-9, {g:g2.Gamma, n:n2.t3});
  await carry('Kid two', -14, 6);
  const g3=await geo(pg), n3=byId(await stored(pg,'lay1'));
  ok('5f a child carried out of the area: on the sheet, stored with `fx` and no parent', !g3['Kid tw'].in && n3.k2.parent===undefined && n3.k2.col===undefined && typeof n3.k2.fx==='number', {g:g3['Kid tw'], n:n3.k2});
  await undoKey();
  ok('5f\' and back by Ctrl+Z', same(await geo(pg), g0) && byId(await stored(pg,'lay1')).k2.parent==='A'); }
// by the menu
{ const g0=await geo(pg);
  await gripOf('Gamma three').click({button:'right'}); await pg.waitForTimeout(200); await pg.locator('.bm .mi').filter({hasText:'В область'}).click(); await pg.waitForTimeout(200); await pg.locator('.bm .mi').first().click(); await pg.waitForTimeout(500);
  const g1=await geo(pg), n1=byId(await stored(pg,'lay1')), toast=await pg.locator('#undo .umsg').innerText();
  ok('5g «В область…»: the block is a child of the area, under its lowest block, and the toast says so', g1.Gamma.in && n1.t3.parent==='A' && n1.t3.col===0 && n1.t3.row>n1.k2.row && /перенесено в область/.test(toast), {g:g1.Gamma, n:n1.t3, toast});
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(500);
  ok('5g\' «Скасувати» takes it out again', same(await geo(pg), g0));
  await gripOf('Kid two').click({button:'right'}); await pg.waitForTimeout(200); await pg.locator('.bm .mi').filter({hasText:'З області'}).click(); await pg.waitForTimeout(500);
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('5h «З області»: the child stands on the sheet under the area, in the column it had inside', !g2['Kid tw'].in && n2.k2.parent===undefined && g2['Kid tw'].t>=g2.area.t+g2.area.h && Math.abs(n2.k2.fx-fxFromCol(37))<1e-9, {g:g2['Kid tw'], area:g2.area, n:n2.k2});
  await pg.locator('#undo .ubtn').click(); await pg.waitForTimeout(500);
  ok('5h\' and back', same(await geo(pg), g0)); }
// the exact undo only: after anything else happened to the note the entry is gone
{ await carry('Gamma three', 12, 4); const g1=await geo(pg);
  await txt('Alpha one').click(); await pg.keyboard.press('Control+End'); await pg.keyboard.type('!'); await pg.waitForTimeout(400);
  await undoKey(); const g2=await geo(pg), n=byId(await stored(pg,'lay1'));
  ok('5i a carry, then typing in another block, then Ctrl+Z outside the fields: the carry is not undone (its entry went with the typing), the block stays where it was dropped', g2.Gamma.l===g1.Gamma.l && g2.Gamma.t===g1.Gamma.t && n.t3.row===13, {g1:g1.Gamma, g2:g2.Gamma, row:n.t3.row});
  await carry('Gamma three', -12, -4); await undoKey(); await txt('Alpha one').click(); await pg.keyboard.press('Control+End'); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); }

// an area carried with its children; the journal of all these carries
{ const g0=await geo(pg), ag=await pg.locator('#sheet .blk.is-area > .grip').boundingBox();
  await pg.mouse.move(ag.x+ag.width/2, ag.y+ag.height/2); await pg.mouse.down(); await pg.mouse.move(ag.x+ag.width/2, ag.y+ag.height/2+3*G, {steps:8}); await pg.waitForTimeout(80); await pg.mouse.up(); await pg.waitForTimeout(500);
  const g1=await geo(pg), n1=byId(await stored(pg,'lay1'));
  ok('5j an area carried three rows down by its grip: its children go with it, their places inside unchanged', g1.area.t===g0.area.t+3*G && g1.area.l===g0.area.l && ['Kid on','Kid tw','Kid th'].every(k=>g1[k].in && g1[k].l===g0[k].l && g1[k].t===g0[k].t) && n1.A.row===6 && n1.k1.row===0, {a0:g0.area, a1:g1.area, row:n1.A.row});
  await undoKey(); ok('5j\' and back by Ctrl+Z', same(await geo(pg), g0));
  await pg.locator('#setBtn').click(); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#layJournal').click()]); await pg.keyboard.press('Escape');
  const es=entriesOf(fs.readFileSync(await dl.path(),'utf8')), kinds={}; for(const e of es) kinds[e.change.type]=(kinds[e.change.type]||0)+1;
  const res=es.filter(e=>!e.unfit).map(e=>replay(e, KINDS));
  ok(`5l the journal of these carries (${Object.entries(kinds).map(([k,n])=>k+' '+n).join(', ')}): every command fit and replayed in Node to the recorded answer`, es.length>30 && es.every(e=>!e.unfit) && res.every(r=>r.same===true) && kinds.carry>20 && kinds.enter>0 && kinds.leave>0, {n:es.length, kinds, unfit:es.map((e,i)=>e.unfit&&[i,e.change.type,e.change.id,e.unfit,e.answers.version,es[i-1]&&es[i-1].answers.version,es[i-1]&&es[i-1].change.type]).filter(Boolean), differ:res.filter(r=>r.same!==true).length}); }

// the life of the gesture in the browser: the focus, the tab hidden
{ const g0=await geo(pg), n0=await stored(pg,'lay1');
  await pg.locator('#sheet .blk.is-code .ctitle').click(); await pg.waitForTimeout(300);
  await carry('Gamma three', 4, 4);
  const g1=await geo(pg);
  ok('5m with the caret in a code block\'s empty title, another block carried: it stands at its target at the first try (the title is left before the block is picked up)', g1.Gamma.l===g0.Gamma.l+4*G && g1.Gamma.t===g0.Gamma.t+4*G, {a:g0.Gamma, b:g1.Gamma});
  await undoKey(); ok('5m\' and back by Ctrl+Z', same(await geo(pg), g0));
  // the code block itself, its own title held, into the area: moving its element takes no focus away in the middle
  await pg.locator('#sheet .blk.is-code .ctitle').click(); await pg.waitForTimeout(300);
  const a=await pg.locator('#sheet .blk.is-area .abody').boundingBox(), cg=await pg.locator('#sheet .blk.is-code > .grip').boundingBox();
  await pg.mouse.move(cg.x+cg.width/2, cg.y+cg.height/2); await pg.mouse.down(); await pg.mouse.move(a.x+2*G, a.y+a.height-G/2, {steps:12}); await pg.waitForTimeout(80); await pg.mouse.up(); await pg.waitForTimeout(500);
  const g2=await geo(pg), n2=byId(await stored(pg,'lay1'));
  ok('5n a code block carried into the area with the caret in its own title: a child of the area', g2.const.in && n2.c1.parent==='A', {g:g2.const, n:{parent:n2.c1.parent, col:n2.c1.col, row:n2.c1.row}});
  await undoKey(); ok('5n\' and back by Ctrl+Z', same(await geo(pg), g0) && byId(await stored(pg,'lay1')).c1.parent===undefined);
  // the tab is hidden while the block is carried
  await carry('Gamma three', 4, 4, 'hold');
  const mid=await geo(pg);
  await pg.evaluate(()=>{ Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  await pg.mouse.up(); await pg.waitForTimeout(500);
  const g3=await geo(pg), n3=await stored(pg,'lay1');
  ok('5o the tab hidden while a block is carried: the carry is given up, every block where it stood, nothing written by the release', mid.Gamma.t===g0.Gamma.t+4*G && same(g3, g0) && JSON.stringify(byId(n3).t3)===JSON.stringify(byId(n0).t3), {mid:mid.Gamma, after:g3.Gamma}); }

/* ── 6: a reload, and the note stands as it was left; nothing is written by opening ── */
{ const g0=await geo(pg), n0=await stored(pg,'lay1'); await pg.reload(); await ready(pg); const g1=await geo(pg), n1=await stored(pg,'lay1');
  ok('6 reloaded: every block where it stood, and the stored note unchanged', same(g0, g1) && JSON.stringify(n0)===JSON.stringify(n1), {g0, g1}); }

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
  // the whole chain with no reload: held, a character, emptied by the keyboard, left
  await pg.locator('#sheet .blk.is-area .ctitle').click(); await pg.keyboard.type('X'); await pg.waitForTimeout(300); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(300); const rE=await rects(pg);
  await pg.locator('#ttl').click(); await pg.waitForTimeout(400); const rL=await rects(pg), ttlL=await pg.evaluate(()=>{ const t=document.querySelector('#sheet .is-area .ctitle'); return [t.childNodes.length, document.querySelector('#sheet .is-area .cbar').offsetHeight]; });
  await pg.reload(); await ready(pg); const r2=await rects(pg);
  const inside=r=>r.One.x>=r.area.x && r.One.r<=r.area.r && r.One.y>=r.area.y && r.One.b<=r.area.b, clear=r=>r.Und.y>=r.area.b;
  ok('7b an area loaded collapsed and opened: its child is as wide and as tall as its three lines, inside the frame, the block under the area clear of it; the same after a reload', r1.One.h===3*G && r1.One.w>40 && inside(r1) && clear(r1) && JSON.stringify(r1)===JSON.stringify(r2) && !byId(n1).A.collapsed, {r1, r2});
  ok('7b\' opened by its button and then its empty title held, with no reload: the header is taller ('+headT[0]+' px) and the frame holds the child; left again, the area is as it was', /ctitle/.test(headT[1]) && rT.area.h>r1.area.h && inside(rT) && clear(rT) && JSON.stringify(rB)===JSON.stringify(r1), {r1, rT, rB, headT});
  ok('7b\" then a character typed and deleted and the title left, still with no reload: the frame holds the child at each step, and the title left empty has no node in it (header '+ttlL[1]+' px)', inside(rE) && clear(rE) && inside(rL) && clear(rL) && ttlL[0]===0 && JSON.stringify(rL)===JSON.stringify(r1), {rE, rL, ttlL, r1});
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

/* ── 13: the tab turns view-only while a block is carried ───────────────────────── */
{ const {ctx,pg,errs}=await open(DEV); await seed(pg, NOTE); await setting(pg,{layout:true}); await go(pg,'lay1');
  const g0=await geo(pg), n0=await stored(pg,'lay1'), gr=await pg.locator('#sheet .blk:not(.is-area)').filter({hasText:'Gamma three'}).locator('.grip').boundingBox(), x=gr.x+gr.width/2, y=gr.y+gr.height/2;
  await pg.mouse.move(x,y); await pg.mouse.down(); await pg.mouse.move(x+2*G, y+2*G, {steps:6}); await pg.mouse.move(x+4*G, y+4*G, {steps:6}); await pg.waitForTimeout(80);
  const mid=await geo(pg);
  await pg.evaluate(()=>{ const c=new BroadcastChannel('sheet:notes'); c.postMessage({t:'format', v:1e6}); c.close(); }); await pg.waitForTimeout(400);   // a tab of a newer format recorded it: this one may write no more
  const locked=await pg.evaluate(()=>document.getElementById('app').classList.contains('locked')), g1=await geo(pg);
  await pg.mouse.move(x+6*G, y+6*G, {steps:4}); await pg.mouse.up(); await pg.waitForTimeout(500);
  const g2=await geo(pg), n2=await stored(pg,'lay1');
  ok('13 the tab turned view-only while a block was carried: the carry is given up at once, the block is shown where the note has it, and the release accepts nothing', (await state(pg)).lay && mid.Gamma.t===g0.Gamma.t+4*G && locked && g1.Gamma.t===g0.Gamma.t && g1.Gamma.l===g0.Gamma.l && g2.Gamma.t===g0.Gamma.t && g2.Gamma.l===g0.Gamma.l && JSON.stringify(n2)===JSON.stringify(n0) && !errs.length, {locked, mid:mid.Gamma, g1:g1.Gamma, g2:g2.Gamma, errs}); await ctx.close(); }

/* ── 14: letting through (DRAG.B4): Shift, and the hold ─────────────────────────── */
{ const {ctx,pg,errs}=await open(DEV);
  const N3={id:'lay3', title:'Through', created:3, updated:Date.now()+60000, blocks:[
    {id:'t1', fx:fxFromCol(3), row:2, text:'Alpha one'}, {id:'t2', fx:fxFromCol(3), row:6, text:'Beta two'},
    {id:'U', fx:fxFromCol(30), row:4, kind:'area', cw:14, title:'Upper'}, {id:'u1', parent:'U', col:0, row:0, text:'Kid up'},
    {id:'L', fx:fxFromCol(30), row:12, kind:'area', cw:14, title:'Lower'}, {id:'l1', parent:'L', col:0, row:0, text:'Kid low'}]};
  await seed(pg, N3); await setting(pg,{layout:true}); await go(pg,'lay3');
  /** The top of every block of the sheet, in pixels, by the start of its text or its title. */
  const tops=()=>pg.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#sheet > .blk')].map(e=>[(e.classList.contains('is-area')? e.querySelector('.ctitle') : e.querySelector('.txt')).textContent.split(' ')[0], parseFloat(e.style.top)])));
  const grip=async t=>{ const g=await pg.locator('#sheet > .blk').filter({hasText:t}).locator('> .grip').boundingBox(); return {x:g.x+g.width/2, y:g.y+g.height/2}; };
  /** A block picked up by its grip and carried down so many rows, a row at a time; it stays in the hand. */
  const down=async(p,from,to)=>{ for(let d=from+1; d<=to; d++){ await pg.mouse.move(p.x, p.y+d*G-G/2, {steps:2}); await pg.mouse.move(p.x, p.y+d*G, {steps:2}); } await pg.waitForTimeout(60); };
  const pickUp=async t=>{ const p=await grip(t); await pg.mouse.move(p.x,p.y); await pg.mouse.down(); return p; };
  const places=n=>JSON.stringify(n.blocks.map(b=>[b.id, b.parent||null, b.row, b.parent? b.col : Math.round(b.fx*1e9)]).sort());   // where the note stores every block
  const t0=await tops(), n0=await stored(pg,'lay3');

  let p=await pickUp('Upper'); await down(p,0,16); const pushed=await tops();
  await pg.keyboard.press('Escape'); await pg.mouse.up(); await pg.waitForTimeout(300); const back=await tops();
  ok('14 an area carried down onto another with no key: the lower one is pushed down under it; given up, both stand as they stood', pushed.Upper===t0.Upper+16*G && pushed.Lower>t0.Lower && pushed.Lower>pushed.Upper && same(back,t0) && places(await stored(pg,'lay3'))===places(n0), {t0, pushed, back});

  await pg.keyboard.down('Shift'); p=await pickUp('Upper'); await down(p,0,16); const through=await tops();
  await pg.mouse.up(); await pg.keyboard.up('Shift'); await pg.waitForTimeout(500);
  const t1=await tops(), n1=byId(await stored(pg,'lay3'));
  ok('14a the same carry with Shift held: the lower area lets it through and stands above it, not pushed; the drop stores both there', through.Upper===t0.Upper+16*G && through.Lower<through.Upper && through.Lower<=t0.Lower && same(t1,through) && n1.U.row===N3.blocks[2].row+16 && n1.L.row<n1.U.row && n1.L.row<=12, {t0, through, U:n1.U.row, L:n1.L.row});
  const undo=async()=>{ await pg.locator('#ttl').click(); await pg.keyboard.press('Escape'); await pg.evaluate(()=>document.activeElement.blur()); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500); };
  await undo();
  ok('14b one undo puts both areas back, on the page and in the stored note', same(await tops(), t0) && places(await stored(pg,'lay3'))===places(n0), await tops());

  // the hold: a text pushes its neighbour while the pointer moves; standing HOLD against it, the neighbour lets it through
  p=await pickUp('Alpha'); await down(p,0,5); const a5=await tops(); await down(p,5,8); const a8=await tops();
  await pg.keyboard.press('Escape'); await pg.mouse.up(); await pg.waitForTimeout(300);
  p=await pickUp('Alpha'); await down(p,0,5); await pg.waitForTimeout(1000); const stood=await tops(); await down(p,5,8); const h8=await tops();
  await pg.mouse.up(); await pg.waitForTimeout(500); const n2=byId(await stored(pg,'lay3'));
  ok('14c a text carried down without a stop pushes its neighbour all the way; stopped against it for the hold, nothing moves, and carried on it passes: the neighbour stays above, and the drop stores that',
    a5.Beta>t0.Beta && a8.Beta>a5.Beta && a8.Beta>a8.Alpha && same(stood,a5) && h8.Alpha===a8.Alpha && h8.Beta<h8.Alpha && h8.Beta<=a5.Beta && n2.t2.row<n2.t1.row, {t0, a5, a8, stood, h8, t1:n2.t1.row, t2:n2.t2.row});
  await undo();
  // Shift pressed and let go with the pointer standing: the neighbour is let through from then on
  p=await pickUp('Alpha'); await down(p,0,5); await pg.keyboard.down('Shift'); await pg.waitForTimeout(60); await pg.keyboard.up('Shift'); await pg.waitForTimeout(60); const s5=await tops(); await down(p,5,8); const s8=await tops();
  await pg.keyboard.press('Escape'); await pg.mouse.up(); await pg.waitForTimeout(300);
  ok('14d Shift pressed while the pointer stands, with no move of it: the neighbour pushed so far lets the block through as it is carried on; given up, the note is as it was', same(s5,a5) && s8.Beta<s8.Alpha && same(await tops(), t0) && places(await stored(pg,'lay3'))===places(n0), {a5, s5, s8});
  ok('14e no page errors', !errs.length, errs); await ctx.close(); }

await br.close(); process.exit(fails? 1 : 0);
