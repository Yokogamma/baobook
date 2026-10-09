import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const pg=await br.newPage({...CTX, viewport:{width:1280,height:900}}); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const paste=(text)=>pg.evaluate((text)=>{ const dt=new DataTransfer(); dt.setData('text/plain',text); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); },text);
await pg.goto(SITE); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
const LONG=Array.from({length:30},(_,i)=>`line_${i} = compute(${i}, "довгий рядок, щоб перевірити перенос за замовчуванням і відсутність горизонтальної смуги прокрутки");`).join('\n');
await pg.mouse.click(400,300); await paste(LONG); await pg.waitForTimeout(200);
const cb=pg.locator('.blk.is-code').first();
ok('1 перенос увімкнений типово, горизонтальної прокрутки немає', await cb.evaluate(e=>e.querySelector('.cblk').classList.contains('wrapped') && e.querySelector('.code').scrollWidth<=e.querySelector('.code').clientWidth+1));
ok('2 30 рядків → згорнуто до 12, затухання, кнопка «Розгорнути · ще 18 рядків»', await cb.evaluate(e=>e.querySelector('.cblk').classList.contains('cut') && getComputedStyle(e.querySelector('.fade')).display==='block') && /Розгорнути · ще 18 рядків/.test(await cb.locator('.more').textContent()));
// ручка: 5 рядків у згорнутому стані
{ const rz=await cb.locator('.rz').boundingBox(); await pg.mouse.move(rz.x+9,rz.y+9); await pg.mouse.down(); await pg.mouse.move(rz.x+9, rz.y+9-7*24,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(500);
  const st=await cb.evaluate(e=>({h:e.querySelector('.code').style.height, more:e.querySelector('.more').textContent}));
  ok('3 ручка задала висоту згорнутого стану: '+JSON.stringify(st), st.h==='124px' && /ще 25 рядків/.test(st.more));
  await pg.reload(); await pg.waitForTimeout(400);
  const st2=await pg.locator('.blk.is-code').first().evaluate(e=>({h:e.querySelector('.code').style.height, ch:e.querySelector('.code').style.height}));
  ok('4 згорнута висота запамʼятована після перезавантаження', st2.h==='124px'); }
// порожній блок не заважає перетягуванню
const cb2=pg.locator('.blk.is-code').first(); const box=await cb2.evaluate(e=>({t:e.offsetTop})); const bb=await cb2.boundingBox();
await pg.mouse.click(bb.x+60, bb.y+bb.height+60); await pg.waitForTimeout(80);      // порожній блок під кодом, у фокусі
ok('5a порожній блок «Пишіть…» існує і в фокусі', (await pg.locator('.blk:not(.is-code) .txt').count())===1 && await pg.evaluate(()=>document.activeElement.classList.contains('txt')));
{ const g=await cb2.locator('.grip').boundingBox(); await pg.mouse.move(g.x+10,g.y+12); await pg.mouse.down(); await pg.mouse.move(g.x+10, g.y+12+80,{steps:8}); await pg.mouse.up(); await pg.waitForTimeout(200);
  const after=await cb2.evaluate(e=>({t:e.offsetTop})); const empties=await pg.locator('.blk:not(.is-code)').count();
  ok('5b блок коду переїхав на місце порожнього, порожній зник', after.t>box.t && empties===0); }
// порожній блок не виштовхує інших при кліку поруч
await pg.mouse.click(1000,300); await pg.waitForTimeout(50); const p1=await pg.evaluate(()=>{ const t=[...document.querySelectorAll('.blk:not(.is-code)')].pop(); return t.offsetTop; });
await pg.mouse.click(1000,324); await pg.keyboard.type('другий'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
const rows=await pg.evaluate(()=>[...document.querySelectorAll('.blk:not(.is-code)')].map(t=>t.offsetTop));
ok('5c клік одразу під порожнім блоком: порожній не виштовхує новий і зникає', rows.length===1 && rows[0]===p1+24);
{ const c=pg.locator('.blk.is-code').first(); const rz=await c.locator('.rz').boundingBox(); const w0=(await c.locator('.cblk').boundingBox()).width;
  await pg.mouse.move(rz.x+9,rz.y+9); await pg.mouse.down(); await pg.mouse.move(rz.x+9-37, rz.y+9,{steps:4}); await pg.waitForTimeout(50);
  const mid=(await c.locator('.cblk').boundingBox()).width; await pg.mouse.up(); await pg.waitForTimeout(350); const end=(await c.locator('.cblk').boundingBox()).width;
  ok('6 під час руху ширина йде за курсором ('+Math.round(w0-mid)+'px), після відпускання прилипає до сітки ('+end+'px)', Math.abs((w0-mid)-37)<=2 && Math.abs(end-Math.round(end/24)*24)<=1.5); }
console.log(errs.length? errs.join('\n') : '✓ без помилок'); await br.close(); process.exit(fails||errs.length?1:0);
