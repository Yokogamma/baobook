// The «Клітинка» theme (docs/GRID-THEME-PLAN.md): the cycle of four themes, the saved setting, the cell lines and numbered edges on the sheet's
// own grid, the text card on whole cells, the code and area cards, «Сітка аркуша», the text size, a phone width, and no note written by a switch
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const paste=text=>pg.evaluate(text=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },text);
const idbNotes=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const near=(a,b,d=1.5)=>Math.abs(a-b)<=d, whole=(v,d=.03)=>near(v, Math.round(v), d);
// the sheet's geometry as the page has it: G, the sheet's box, the lines xOf(c) = G/2 + c·G and yOf(r) = G/2 + r·G
const geo=()=>pg.evaluate(()=>{ const s=document.getElementById('sheet'), r=s.getBoundingClientRect(); return {g:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g')), x:r.left, y:r.top, w:s.clientWidth}; });
const before=sel=>pg.evaluate(sel=>{ const e=document.querySelector(sel); if(!e) return null; const c=getComputedStyle(e,'::before'), b=e.getBoundingClientRect(); return {display:c.content==='none'?'none':c.display, bg:c.backgroundColor, img:c.backgroundImage, radius:c.borderTopLeftRadius, left:b.left+parseFloat(c.left), top:b.top+parseFloat(c.top), w:parseFloat(c.width), h:parseFloat(c.height)}; }, sel);
const rulers=()=>pg.evaluate(()=>{ const e=document.querySelector('.gp-rulers'); if(!e) return null; const sp=s=>{ const b=s.getBoundingClientRect(); return {t:s.textContent, l:b.left, cx:b.left+b.width/2, cy:b.top+b.height/2, r:b.right, b:b.bottom}; };
  return {shown:getComputedStyle(e).display!=='none', cols:[...e.querySelectorAll('.gp-c')].map(sp), rows:[...e.querySelectorAll('.gp-r')].map(sp), font:getComputedStyle(e).fontFamily}; });
const textLeft=sel=>pg.evaluate(sel=>{ const t=document.querySelector(sel); const r=document.createRange(); r.selectNodeContents(t); return r.getClientRects()[0].left; }, sel);

await pg.goto(SITE); await pg.waitForTimeout(300); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(600);

// 1 the cycle: light → dark → sand → «Клітинка» → light, the button names the next theme
{ const seen=[]; let title='';
  for(let i=0;i<4;i++){ await pg.locator('#themeBtn').click(); await pg.waitForTimeout(80); seen.push(await pg.evaluate(()=>document.documentElement.dataset.theme)); if(seen[i]==='sand') title=await pg.locator('#themeBtn').getAttribute('title'); }
  ok('1 the theme button cycles through four themes ('+seen.join(' → ')+'), sand says «далі — Клітинка»', seen.join()==='dark,sand,grid,light' && /далі — Клітинка/.test(title));
  await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.waitForTimeout(150);
  ok('1b the button in «Клітинка» shows its grid icon and names it', await pg.locator('#themeBtn').getAttribute('data-th')==='grid' && await pg.locator('#themeBtn .th-grid').isVisible() && /Тема: Клітинка/.test(await pg.locator('#themeBtn').getAttribute('title'))); }
await pg.reload(); await pg.waitForTimeout(700);
ok('2 «Клітинка» is saved and comes back after a reload', await pg.evaluate(()=>document.documentElement.dataset.theme==='grid' && JSON.parse(localStorage.getItem('sheet:settings')).theme==='grid'));
ok('2b its fonts are a link of their own: the Inter link keeps its cached URL; the sheet asks for IBM Plex', await pg.evaluate(()=>{ const l=[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href); return l.some(h=>/family=Inter:wght@400;500;600&family=JetBrains\+Mono:wght@400;500&display=swap$/.test(h)) && l.some(h=>/IBM\+Plex\+Sans/.test(h) && !/Inter/.test(h)); })
  && /IBM Plex Sans/.test(await pg.evaluate(()=>getComputedStyle(document.body).fontFamily)));

// 3 the lines and the numbers on the sheet's own grid
let G=await geo();
{ const f=await before('#sheet');
  ok('3 the frame draws lines (no dots) from the first line crossing xOf(1), yOf(2)', /linear-gradient/.test(f.img) && !/radial/.test(f.img) && near(f.left, G.x+1.5*G.g) && near(f.top, G.y+2.5*G.g));
  const R=await rulers();
  ok('3b columns are numbered 0, 5, 10 … from the first line, in IBM Plex Mono', R.shown && R.cols.slice(0,3).map(c=>c.t).join()==='0,5,10' && near(R.cols[0].l, G.x+1.5*G.g+0.15*G.g, 3) && near(R.cols[1].l-R.cols[0].l, 5*G.g, 1) && R.cols.every(c=>c.b<=G.y+2.5*G.g) && /IBM Plex Mono/.test(R.font));
  ok('3c every row is numbered left of the frame, in the middle of its cell', R.rows.slice(0,3).map(r=>r.t).join()==='0,1,2' && near(R.rows[0].cy, G.y+2.5*G.g+G.g/2, 2) && near(R.rows[1].cy-R.rows[0].cy, G.g, 1) && R.rows.every(r=>r.r<=G.x+1.5*G.g)); }

// 4 text cards on whole cells, the text a third of a cell in; two cards in a row do not meet; an empty block has no card
const at=async(c,r)=>{ await pg.mouse.click(G.x+G.g/2+c*G.g+4, G.y+G.g/2+r*G.g+8); await pg.waitForTimeout(150); };
await at(2,3); await pg.keyboard.type('Ремонт балкона'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
await at(14,5); await pg.keyboard.type('Бюджет'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
await at(2,5); await pg.keyboard.type('Заміряти вікно, купити піну й підвіконня, подзвонити майстру в четвер'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
await pg.mouse.click(G.x+G.w-40, G.y+800); await pg.waitForTimeout(300);
{ const sel=i=>'#sheet .blk:not(.is-code):not(.is-area):nth-of-type(n) '+'.tcard';
  const cards=await pg.evaluate(()=>[...document.querySelectorAll('#sheet .tcard')].map(t=>{ const c=getComputedStyle(t,'::before'), b=t.getBoundingClientRect(), x=t.querySelector('.txt'), r=document.createRange(); r.selectNodeContents(x); const tr=r.getClientRects()[0];
    return {text:x.textContent, display:c.content==='none'?'none':c.display, bg:c.backgroundColor, radius:parseFloat(c.borderTopLeftRadius), left:b.left+parseFloat(c.left), top:b.top+parseFloat(c.top), w:parseFloat(c.width), h:parseFloat(c.height), tx:tr? tr.left : null, weight:getComputedStyle(x).fontWeight}; }));
  const one=cards.find(c=>c.text==='Ремонт балкона'), I=Math.max(1, G.g*.05), line=G.x+G.g/2+2*G.g;
  ok('4 a text block is a white card over the lines, corners 18 % of a cell, regular weight', one && one.display!=='none' && one.bg==='rgb(255, 255, 255)' && near(one.radius, G.g*.18, .5) && one.weight==='400');
  ok('4b its card starts on its line and row, inset '+I.toFixed(1)+'px, and fills whole cells ('+(one.w+2*I)/G.g+' cells)', near(one.left, line+I, 1) && near(one.top, G.y+G.g/2+3*G.g+I, 1) && whole((one.w+2*I)/G.g, .02) && near(one.h+2*I, G.g, 1));
  ok('4c the text stands a third of a cell right of the line', near(one.tx, line+G.g/3, 1.5));
  const long=cards.find(c=>c.text.startsWith('Заміряти')), bud=cards.find(c=>c.text==='Бюджет');
  ok('4d a text that wraps at its neighbour: its card ends before the neighbour\'s card begins', long && bud && long.h>G.g && long.left+long.w<bud.left);
  const empty=cards.find(c=>c.text==='');
  ok('4e an empty block shows no card', !empty || empty.display==='none'); }

// 5 a code card and an area on whole cells
await at(2,9); await paste('const area = w * h;\nconst foam = 2;\nreturn area;'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); await pg.mouse.click(G.x+G.w-40, G.y+800); await pg.waitForTimeout(300);
{ const c=await pg.evaluate(()=>{ const e=document.querySelector('#sheet .blk.is-code>.cblk'), b=e.getBoundingClientRect(); return {l:b.left, t:b.top, w:b.width, h:b.height, r:getComputedStyle(e).borderTopLeftRadius}; }), I=Math.max(1, G.g*.05);
  ok('5 a code card starts on its line, fills whole rows and ends on a line', near(c.l, G.x+G.g/2+2*G.g+I, 1) && whole((c.h+2*I)/G.g, .03) && whole((c.w+2*I)/G.g, .03) && near(parseFloat(c.r), G.g*.18, .5)); }
await pg.locator('#areaBtn').click(); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); await pg.mouse.click(G.x+G.w-40, G.y+800); await pg.waitForTimeout(300);
{ const a=await before('#sheet .blk.is-area>.ablk'), I=Math.max(1, G.g*.05), col=(a.left-I-G.x-G.g/2)/G.g, row=(a.top-I-G.y-G.g/2)/G.g;
  ok('5b an area draws its card on whole cells (column '+col.toFixed(2)+', row '+row.toFixed(2)+')', a.display!=='none' && whole(col, .05) && whole(row, .05) && whole((a.w+2*I)/G.g, .03) && whole((a.h+2*I)/G.g, .03)); }
await pg.screenshot({path:OUT+'/app-gridtheme.png'});

// 6 «Сітка аркуша» hides the lines and the numbers, the cards stay
await pg.locator('#gridBtn').click(); await pg.waitForTimeout(200);
ok('6 «Сітка аркуша» off: no lines, no numbers, the cards stay', (await before('#sheet')).display==='none' && !(await rulers()).shown && (await before('#sheet .tcard')).display!=='none');
await pg.locator('#gridBtn').click(); await pg.waitForTimeout(200);

// 7 switching the theme writes no note and leaves every block where it stood
{ const n0=JSON.stringify((await idbNotes()).map(n=>[n.id,n.updated,(n.blocks||[]).map(b=>[b.row,b.col??b.fx])]));
  await pg.locator('#themeBtn').click(); await pg.waitForTimeout(300);
  const light={f:await before('#sheet'), R:await rulers(), card:await before('#sheet .tcard')};
  ok('7 the other themes show dots, no numbers and no card', /radial-gradient/.test(light.f.img) && !light.R.shown && light.card.display==='none');
  for(let i=0;i<3;i++){ await pg.locator('#themeBtn').click(); await pg.waitForTimeout(250); }
  await pg.waitForTimeout(800);
  ok('7b a round of the four themes writes no note and moves no block', JSON.stringify((await idbNotes()).map(n=>[n.id,n.updated,(n.blocks||[]).map(b=>[b.row,b.col??b.fx])]))===n0 && await pg.evaluate(()=>document.documentElement.dataset.theme)==='grid'); }

// 8 a larger text size: the lines and numbers follow G
await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); localStorage.setItem('sheet:settings', JSON.stringify({...s, textSys:false, textSheet:20})); }); await pg.reload(); await pg.waitForTimeout(800);
G=await geo();
{ const R=await rulers(), f=await before('#sheet');
  ok('8 at text size 20 (G = '+G.g+'): the frame and every number move with G', G.g===30 && near(f.left, G.x+45) && near(R.cols[1].l-R.cols[0].l, 150, 1) && near(R.rows[0].cy, G.y+75+15, 2)); }

// 9 a phone width: the frame reaches the last line a block can reach, the numbers stay on it
await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); delete s.textSys; delete s.textSheet; localStorage.setItem('sheet:settings', JSON.stringify(s)); });
await pg.setViewportSize({width:390,height:844}); await pg.reload(); await pg.waitForTimeout(900);
G=await geo();
{ const f=await before('#sheet'), R=await rulers(), pad=16, cells=Math.floor((G.w-pad-1.5*G.g)/G.g);
  ok('9 on a phone the frame has '+cells+' cells, to the last line before the sheet\'s padding, numbered from its first line', near(f.w-1, cells*G.g) && f.left+f.w<=G.x+G.w-pad+1 && R.shown && near(R.cols[0].l, G.x+1.5*G.g+0.15*G.g, 3) && near(R.rows[0].cy, G.y+2.5*G.g+G.g/2, 2));
  await pg.screenshot({path:OUT+'/app-gridtheme-phone.png'}); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
