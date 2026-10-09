import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1920,height:1080}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const model=async(re)=>{ for(const n of await idbAll()){ const b=n.blocks.find(b=>new RegExp(re).test(b.text||'')); if(b) return b; } return null; };
const fresh=async()=>{ await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300); };
await pg.goto(SITE); await pg.waitForTimeout(700); await fresh();
const G=await pg.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g')));
const CAP=26*G;
const LONG='Буфер обміну: '+'довге повідомлення, скопійоване з месенджера, яке на великому екрані розтягнулося б на всю ширину аркуша. '.repeat(6);

/* ── a pasted text without a set width wraps at the A4 column (26 cells) ── */
await pg.mouse.click(300,200); await pg.keyboard.insertText(LONG); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
const blk=pg.locator('#sheet > .blk').filter({hasText:'Буфер обміну'}); const card=blk.locator('.tcard'), txt=blk.locator('.txt');
const sheetW=(await box(pg.locator('#sheet'))).w;
{ const c=await box(card), t=await box(txt), m=await model('Буфер обміну');
  ok('1a the sheet is wide ('+sheetW+'px), the long text wraps at '+c.w+'px ≤ '+CAP+' over '+t.h/G+' lines', sheetW>1400 && c.w<=CAP && c.w>CAP-4*G && t.h>=5*G);
  ok('1b no width is stored: cw is absent, no .sized class', m && !m.cw && !(await card.evaluate(e=>e.classList.contains('sized')))); }

/* ── a short text stays as narrow as its words ── */
await pg.mouse.click(300,700); await pg.keyboard.type('коротко'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
{ const c=await box(pg.locator('#sheet > .blk').filter({hasText:'коротко'}).locator('.tcard'));
  ok('2 a short text keeps its own width ('+c.w+'px)', c.w<200); }

/* ── the handle still stretches the block past the cap, and that width is kept ── */
{ await txt.hover(); const r=await box(blk.locator('.rz')); const cx=r.x+r.w/2, cy=r.y+r.h/2;
  await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx+500,cy,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(350);
  const c=await box(card), m=await model('Буфер обміну');
  ok('3a dragged right: '+c.w+'px > '+CAP+', cw='+(m&&m.cw)+' saved', c.w>CAP+300 && m && m.cw===c.w/G);
  await pg.reload(); await pg.waitForTimeout(400);
  const c2=await box(pg.locator('#sheet > .blk').filter({hasText:'Буфер обміну'}).locator('.tcard'));
  ok('3b the wide block keeps its width after a reload ('+c2.w+')', c2.w===c.w); }

/* ── a double click on the handle goes back to the cap, not to the full sheet ── */
{ const b=pg.locator('#sheet > .blk').filter({hasText:'Буфер обміну'}); await b.locator('.txt').hover(); await b.locator('.rz').dblclick(); await pg.waitForTimeout(350);
  const c=await box(b.locator('.tcard')), m=await model('Буфер обміну');
  ok('4 double click: back to '+c.w+'px ≤ '+CAP+', cw removed', c.w<=CAP && c.w>CAP-4*G && m && !m.cw); }

/* ── a narrower neighbour still wins: the text stops where the next block starts ── */
{ const b=pg.locator('#sheet > .blk').filter({hasText:'Буфер обміну'}); const c=await box(b.locator('.tcard'));
  await pg.mouse.click(c.x+12*G, c.y+c.h+3*G); await pg.keyboard.type('сусід'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  const nb=pg.locator('#sheet > .blk').filter({hasText:'сусід'}); const g=await box(nb.locator('.grip'));
  await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10, c.y+12,{steps:10}); await pg.mouse.up(); await pg.waitForTimeout(400);
  const c2=await box(b.locator('.tcard')), n=await box(nb), m=await model('Буфер обміну');
  ok('5 a neighbour dropped on its row: the text ends before it ('+(c2.x+c2.w)+' ≤ '+n.x+'), no width stored', c2.x+c2.w<=n.x && c2.w<c.w && m && !m.cw); }

/* ── a code block is not capped ── */
await fresh();
{ const line='const message = "'+'x'.repeat(140)+'";';
  await pg.mouse.click(300,200); await pg.evaluate(t=>{ const dt=new DataTransfer(); dt.setData('text/plain',t); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }, line+'\n'+line+'\n'+line);
  await pg.waitForTimeout(400); await pg.keyboard.press('Escape');
  const cb=pg.locator('#sheet > .blk .cblk'); const n=await cb.count(); const c=n? await box(cb.first()) : {w:0};
  ok('6 pasted code is a code card wider than the text cap ('+c.w+'px)', n===1 && c.w>CAP+100); }

/* ── a phone screen is narrower than the cap: nothing changes there ── */
await ctx.close();
{ const c2=await br.newContext({...CTX, viewport:{width:375,height:812}, isMobile:true, hasTouch:true}); const p2=await c2.newPage(); p2.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await p2.goto(SITE); await p2.waitForTimeout(600);
  await p2.locator('#fab').tap(); await p2.waitForTimeout(250); await p2.keyboard.insertText(LONG); await p2.waitForTimeout(250);
  const sw=(await box(p2.locator('#sheet'))).w; const c=await box(p2.locator('#sheet > .blk').filter({hasText:'Буфер обміну'}).locator('.tcard'));
  ok('7 phone: the text takes the screen width as before ('+c.w+'px of '+sw+')', c.w<CAP && c.w>sw-6*G);
  await c2.close(); }

ok('8 no page errors '+(errs.length? errs.join(' | ') : ''), errs.length===0);
await br.close();
console.log(fails? `\n${fails} failed` : '\nall passed'); process.exit(fails?1:0);
