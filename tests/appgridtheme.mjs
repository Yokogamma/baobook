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

ok('0 in another theme the page does not ask for the theme\'s fonts', await pg.evaluate(()=>!document.getElementById('plexCss')));
// 1 the cycle: light → dark → sand → «Клітинка» → light, the button names the next theme
{ const seen=[]; let title='';
  for(let i=0;i<4;i++){ await pg.locator('#themeBtn').click(); await pg.waitForTimeout(80); seen.push(await pg.evaluate(()=>document.documentElement.dataset.theme)); if(seen[i]==='sand') title=await pg.locator('#themeBtn').getAttribute('title'); }
  ok('1 the theme button cycles through four themes ('+seen.join(' → ')+'), sand says «далі — Клітинка»', seen.join()==='dark,sand,grid,light' && /далі — Клітинка/.test(title));
  await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.locator('#themeBtn').click(); await pg.waitForTimeout(150);
  ok('1b the button in «Клітинка» shows its grid icon and names it', await pg.locator('#themeBtn').getAttribute('data-th')==='grid' && await pg.locator('#themeBtn .th-grid').isVisible() && /Тема: Клітинка/.test(await pg.locator('#themeBtn').getAttribute('title'))); }
await pg.reload(); await pg.waitForTimeout(700);
ok('2 «Клітинка» is saved and comes back after a reload', await pg.evaluate(()=>document.documentElement.dataset.theme==='grid' && JSON.parse(localStorage.getItem('sheet:settings')).theme==='grid'));
ok('2b its fonts come by a link of their own, added with the theme: the Inter link keeps its cached URL; the sheet asks for IBM Plex', await pg.evaluate(()=>{ const l=[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href); return l.some(h=>/family=Inter:wght@400;500;600&family=JetBrains\+Mono:wght@400;500&display=swap$/.test(h)) && /IBM\+Plex\+Sans/.test(document.getElementById('plexCss')?.href||'') && !/Inter/.test(document.getElementById('plexCss').href); })
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
}
await at(2,8); await pg.keyboard.type('x'); await pg.keyboard.press('Backspace'); await pg.waitForTimeout(250);
{ const e=await pg.evaluate(()=>{ const b=document.activeElement.closest('.blk'), c=getComputedStyle(b.querySelector('.tcard'),'::before'); return {html:b.querySelector('.txt').innerHTML, shown:c.content!=='none' && c.display!=='none'}; });
  ok('4e a block typed in and emptied again ('+JSON.stringify(e.html)+') shows no card', !e.shown); }
await pg.keyboard.press('Escape'); await pg.mouse.click(G.x+G.w-40, G.y+800); await pg.waitForTimeout(250);

// 5 a code card and an area on whole cells
await at(2,9); await paste('const area = w * h;\nconst foam = 2;\nreturn area;'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); await pg.mouse.click(G.x+G.w-40, G.y+800); await pg.waitForTimeout(300);
{ const c=await before('#sheet .blk.is-code>.cblk'), I=Math.max(1, G.g*.05), box=await pg.evaluate(()=>{ const b=document.querySelector('#sheet .blk.is-code'); return {h:b.querySelector('.cblk').offsetHeight, rows:+getComputedStyle(b).getPropertyValue('--rows')}; });
  ok('5 a code card starts on its line, fills the rows the block takes and ends on a line', near(c.left, G.x+G.g/2+2*G.g+I, 1) && near(c.h+2*I, box.rows*G.g, 1) && box.rows===Math.ceil((box.h-2)/G.g) && whole((c.w+2*I)/G.g, .03) && near(parseFloat(c.radius), G.g*.18, .5)); }
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
  const over=await pg.evaluate(()=>({sw:document.documentElement.scrollWidth, iw:innerWidth, right:Math.max(...[...document.querySelectorAll('#sheet .tcard,#sheet .blk.is-code>.cblk,#sheet .blk.is-area>.ablk')].map(e=>{ const c=getComputedStyle(e,'::before'); return c.content==='none'? 0 : e.getBoundingClientRect().left+parseFloat(c.left)+parseFloat(c.width); }))}));
  ok('9b a text wrapping at the sheet\'s edge keeps every card inside the frame, and the page does not scroll sideways ('+over.sw+'/'+over.iw+')', over.sw<=over.iw && over.right<=f.left+f.w+.5);
  await pg.screenshot({path:OUT+'/app-gridtheme-phone.png'}); }

// 9c a width where the sheet's edge falls between two lines: a full-width code box stops at the last line with its card, and nothing scrolls sideways
await pg.setViewportSize({width:401,height:844}); await pg.waitForTimeout(700);
G=await geo();
await pg.mouse.click(G.x+G.g/2+2*G.g+4, G.y+G.g/2+40*G.g+8); await pg.waitForTimeout(150); await paste('const veryLongLineOfCode = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];\nconst b = 2;\nreturn veryLongLineOfCode;'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
{ const f=await before('#sheet'), k=await pg.evaluate(()=>{ const e=[...document.querySelectorAll('#sheet .blk.is-code>.cblk')].find(x=>/veryLongLineOfCode/.test(x.textContent)); if(!e) return {found:false}; const c=getComputedStyle(e,'::before'), b=e.getBoundingClientRect(); return {found:!!e, box:b.right, card:b.left+parseFloat(c.left)+parseFloat(c.width), minH:getComputedStyle(e).minHeight, sw:document.documentElement.scrollWidth, iw:innerWidth}; });
  ok('9c-0 the long paste became a code block', k.found);
  ok('9c at 401px ('+((G.w-16-1.5*G.g)/G.g).toFixed(2)+' cells) a long code box ends with its card on the last line ('+Math.round(k.box)+'/'+Math.round(k.card)+'), no min-height holds it, no sideways scroll', k.box<=k.card+Math.max(1,G.g*.05)+6.5 && k.card<=f.left+f.w+.5 && (k.minH==='auto'||k.minH==='0px') && k.sw<=k.iw); }

// 9d an odd cell (text size 18, G = 27) at a width where the frame and the cards used to disagree by a cell: every card ends inside the frame
await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); localStorage.setItem('sheet:settings', JSON.stringify({...s, textSys:false, textSheet:18})); });
await pg.setViewportSize({width:353,height:844}); await pg.reload(); await pg.waitForTimeout(900);
{ const f=await before('#sheet'), k=await pg.evaluate(()=>({g:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g')), right:Math.max(...[...document.querySelectorAll('#sheet .tcard,#sheet .blk.is-code>.cblk,#sheet .blk.is-area>.ablk')].map(e=>{ const c=getComputedStyle(e,'::before'); return c.content==='none'? 0 : e.getBoundingClientRect().left+parseFloat(c.left)+parseFloat(c.width); }))}));
  ok('9d at G = '+k.g+' and 353px every card ends inside the frame ('+Math.round(k.right)+' ≤ '+Math.round(f.left+f.w)+')', k.g===27 && k.right<=f.left+f.w+.5); }
await pg.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')); delete s.textSys; delete s.textSheet; localStorage.setItem('sheet:settings', JSON.stringify(s)); });

// 10 blocks laid out in another theme keep their rows in «Клітинка»: a code card of 3 lines and the text under it, switched there and back
{ const p2=await ctx.newPage(); p2.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await p2.setViewportSize({width:1280,height:900});
  await p2.evaluate?.(()=>{}); await p2.goto(SITE); await p2.waitForTimeout(500);
  await p2.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); s.theme='light'; localStorage.setItem('sheet:settings', JSON.stringify(s)); }); await p2.reload(); await p2.waitForTimeout(700);
  await p2.locator('#newBtn').click(); await p2.waitForTimeout(300);
  const s2=await p2.locator('#sheet').boundingBox(), g=24, at2=async(c,r)=>{ await p2.mouse.click(s2.x+g/2+c*g+4, s2.y+g/2+r*g+8); await p2.waitForTimeout(150); };
  await at2(2,3); await p2.evaluate(text=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }, 'let a = 1;\nlet b = 2;\nlet c = a + b;'); await p2.waitForTimeout(400); await p2.keyboard.press('Escape');
  await p2.mouse.click(s2.x+900, s2.y+800); await p2.waitForTimeout(200);
  const rows0=await p2.evaluate(()=>+getComputedStyle(document.querySelector('#sheet .blk.is-code')).getPropertyValue('--rows'));
  await at2(2,3+rows0); await p2.keyboard.type('під кодом'); await p2.keyboard.press('Escape'); await p2.mouse.click(s2.x+900, s2.y+800); await p2.waitForTimeout(300);
  const top=()=>p2.evaluate(()=>[...document.querySelectorAll('#sheet .tcard .txt')].find(t=>t.textContent==='під кодом').closest('.blk').offsetTop);
  const t0=await top(); for(let i=0;i<3;i++){ await p2.locator('#themeBtn').click(); await p2.waitForTimeout(250); }
  const th=await p2.evaluate(()=>document.documentElement.dataset.theme), t1=await top(), rows1=await p2.evaluate(()=>+getComputedStyle(document.querySelector('#sheet .blk.is-code')).getPropertyValue('--rows'));
  await p2.locator('#themeBtn').click(); await p2.waitForTimeout(300); const t2=await top();
  ok('10 a code block of '+rows0+' rows keeps them in «Клітинка», and the text right under it does not move ('+[t0,t1,t2].join(', ')+')', th==='grid' && rows1===rows0 && t1===t0 && t2===t0);
  await p2.close(); }

// 11 the block menu and the resize handle stay over the blocks below (a card makes no stacking context)
{ const p3=await ctx.newPage(); p3.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await p3.setViewportSize({width:1280,height:900}); await p3.goto(SITE); await p3.waitForTimeout(400); await p3.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sheet:settings')||'{}'); localStorage.setItem('sheet:settings', JSON.stringify({...s, theme:'grid'})); }); await p3.reload(); await p3.waitForTimeout(700);
  await p3.locator('#newBtn').click(); await p3.waitForTimeout(300);
  const s3=await p3.locator('#sheet').boundingBox(), g=24;
  for(let i=0;i<10;i++){ await p3.mouse.click(s3.x+g/2+2*g+4, s3.y+g/2+(3+i)*g+8); await p3.waitForTimeout(120); await p3.keyboard.insertText('Рядок тексту номер '+(i+1)+' досить довгий щоб перекрити меню'); await p3.keyboard.press('Escape'); await p3.waitForTimeout(100); }
  await p3.mouse.click(s3.x+900, s3.y+800); await p3.waitForTimeout(300);
  const grip=p3.locator('#sheet>.blk .grip').first(); await grip.hover(); await grip.click({button:'right'}); await p3.waitForTimeout(300);
  const m=await p3.evaluate(()=>{ const menu=document.querySelector('#sheet .amenu'); if(!menu) return null; const r=menu.getBoundingClientRect(); let hit=0, n=0;
    for(let x=r.left+6;x<r.right-6;x+=20) for(let y=r.top+6;y<r.bottom-6;y+=12){ n++; const e=document.elementFromPoint(x,y); if(e && menu.contains(e)) hit++; } return {hit, n}; });
  ok('11-0 the page is in «Клітинка»', await p3.evaluate(()=>document.documentElement.dataset.theme==='grid'));
  ok('11 the block menu over the blocks below takes every touch ('+(m? m.hit+'/'+m.n : 'no menu')+')', m && m.n>4 && m.hit===m.n);
  await p3.keyboard.press('Escape'); await p3.mouse.click(s3.x+900, s3.y+800); await p3.waitForTimeout(200);
  await p3.locator('#sheet>.blk .txt').first().hover(); await p3.waitForTimeout(250);
  const rz=await p3.evaluate(()=>{ const b=document.querySelector('#sheet>.blk'), h=b.querySelector('.tcard>.rz'), r=h.getBoundingClientRect(), e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(e && h.contains(e)); });
  ok('11b the resize handle over the block below answers the pointer', rz);
  await p3.close(); }

// 12 wrapped paragraphs stored one right under another, in this theme, keep their rows when the theme's fonts come late (no service worker,
// the font files delayed) and through a round of themes, and the edit after each stores the same rows (needs the network for IBM Plex)
{ const c4=await br.newContext({...CTX, viewport:{width:1280,height:2000}, serviceWorkers:'block'}); const p4=await c4.newPage(); p4.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await p4.goto(SITE); await p4.waitForTimeout(500); await p4.evaluate(()=>localStorage.setItem('sheet:settings', JSON.stringify({theme:'grid'}))); await p4.reload(); await p4.waitForTimeout(1200);
  const s4=await p4.locator('#sheet').boundingBox(), g=24, para='abcdefghij klmnopqrst uvwxyz 0123456789 lorem ipsum dolor sit amet. ';
  const state=()=>p4.evaluate(()=>[...document.querySelectorAll('#sheet>.blk')].filter(b=>b.querySelector('.txt')?.textContent).map(b=>({t:b.querySelector('.txt').textContent.replace(/\s+/g,' ').trim(), rows:+getComputedStyle(b).getPropertyValue('--rows'), top:b.offsetTop})));
  let row=3;
  for(let k=0;k<12;k++){ await p4.mouse.click(s4.x+g/2+2*g+4, s4.y+g/2+row*g+8); await p4.waitForTimeout(150); const t=(para.repeat(3)+'xyz '.repeat(k*3)).trim(); await p4.keyboard.insertText(t); await p4.waitForTimeout(200);
    row+=await p4.evaluate(()=>+getComputedStyle(document.activeElement.closest('.blk')).getPropertyValue('--rows')); await p4.keyboard.press('Escape'); await p4.waitForTimeout(150); }
  await p4.mouse.click(s4.x+1000, s4.y+1950); await p4.waitForTimeout(1200);
  const plex=await p4.evaluate(()=>document.fonts.check('16px "IBM Plex Sans"'));
  const stored=()=>p4.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result, t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); const n=t.result.sort((a,b)=>b.updated-a.updated)[0]; res((n.blocks||[]).map(b=>b.row).join()); }; }; }));
  const edit=async()=>{ const tx=p4.locator('#sheet>.blk .txt').last(); await tx.click(); await p4.keyboard.press('End'); await p4.keyboard.type('.'); await p4.keyboard.press('Escape'); await p4.mouse.click(s4.x+1000, s4.y+1950); await p4.waitForTimeout(1200); };
  const r0=await stored();
  await p4.route(/fonts\.gstatic\.com/, async r=>{ await new Promise(z=>setTimeout(z,300)); r.continue(); });
  await p4.reload(); await p4.waitForTimeout(4500); await edit(); const r1=await stored();
  ok('12 '+(plex? '' : '(IBM Plex not loaded here, so this proves less) ')+'twelve wrapped paragraphs written in «Клітинка» keep their rows when its fonts come late, and the edit after stores them'+(r1===r0? '' : ' ('+r0+' → '+r1+')'), r1===r0);
  await p4.unroute(/fonts\.gstatic\.com/);
  for(let i=0;i<4;i++){ await p4.locator('#themeBtn').click(); await p4.waitForTimeout(500); }
  await edit(); const r2=await stored();
  ok('12b the same note keeps its rows through a round of the four themes and the edit after it'+(r2===r0? '' : ' ('+r0+' → '+r2+')'), r2===r0);
  await c4.close(); }

console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
