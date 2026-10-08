import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const box=async(loc)=>{ const b=await loc.boundingBox(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}; };
const idbAll=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const ZW=String.fromCharCode(0x200b), clean=s=>s.split(ZW).join('');
const text=async loc=>clean(await loc.innerText());
const Z=async()=>{ await pg.keyboard.press('Control+z'); await pg.waitForTimeout(120); }, SZ=async()=>{ await pg.keyboard.press('Control+Shift+z'); await pg.waitForTimeout(120); };
// Ctrl+літера так, як її надсилає кирилична розкладка: e.key — «я» / «у», фізична клавіша — Z / E
const cdp=await ctx.newCDPSession(pg);
const cyr=async(key,code,vk)=>{ for(const type of ['rawKeyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers:2}); await pg.waitForTimeout(120); };
await pg.goto(SITE); await pg.waitForTimeout(300); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(300);
const A=pg.locator('#sheet > .blk').first().locator('.txt');

// 1 набір поспіль — один крок: Ctrl+Z прибирає всю фразу, Ctrl+Shift+Z повертає
await pg.mouse.click(500,200); await pg.keyboard.type('Привіт, світе'); await pg.waitForTimeout(100);
{ await Z(); const a1=await text(A); await SZ(); const a2=await text(A);
  ok('1 набір — один крок: Ctrl+Z прибирає всю фразу («'+a1+'»), Ctrl+Shift+Z повертає («'+a2+'»)', a1==='' && a2==='Привіт, світе'); }
// 2 пауза понад секунду ділить набір на кроки; автозбереження посередині (пауза 0,7 с) — ні
await pg.keyboard.press('End'); await pg.keyboard.type(' раз'); await pg.waitForTimeout(700); await pg.keyboard.type(' два'); await pg.waitForTimeout(1300); await pg.keyboard.type(' три');
{ await Z(); const b1=await text(A); await Z(); const b2=await text(A);
  ok('2 пауза понад секунду — окремий крок: «'+b1+'», далі «'+b2+'»; пауза 0,7 с з автозбереженням крок не ділить', b1==='Привіт, світе раз два' && b2==='Привіт, світе'); }
// 3 стирання поспіль — один крок
await pg.keyboard.press('End'); for(let i=0;i<4;i++) await pg.keyboard.press('Backspace');
{ const c0=await text(A); await Z(); const c1=await text(A);
  ok('3 чотири Backspace — один крок: «'+c0+'» → «'+c1+'»', c0==='Привіт, с' && c1==='Привіт, світе'); }
// 4 курсор перейшов — новий крок
await pg.keyboard.press('End'); await pg.keyboard.type(' abc'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowLeft'); await pg.keyboard.type('X');
{ const d0=await text(A); await Z(); const d1=await text(A);
  ok('4 після переходу курсора — новий крок: «'+d0+'» → «'+d1+'»', d0==='Привіт, світе aXbc' && d1==='Привіт, світе abc'); }
// 5 жирний, чип (Ctrl+E) і чип зі зворотних лапок скасовуються кожен окремо
await pg.keyboard.press('End'); for(let i=0;i<3;i++) await pg.keyboard.press('Shift+ArrowLeft');
{ await pg.keyboard.press('Control+b'); await pg.waitForTimeout(100); const h0=await A.innerHTML(); await Z(); const h1=await A.innerHTML();
  await pg.keyboard.press('Control+e'); await pg.waitForTimeout(100); const h2=await A.innerHTML(); await Z(); const h3=await A.innerHTML();
  await pg.keyboard.press('End'); await pg.keyboard.type(' `ls -la`'); await pg.waitForTimeout(100); const h4=await A.innerHTML(); await Z(); const h5=await A.innerHTML();
  ok('5a Ctrl+B → Ctrl+Z: жирного немає, текст той самий', /<b>abc<\/b>/.test(h0) && !/<b>/.test(h1) && clean(await A.innerText())==='Привіт, світе abc');
  ok('5b Ctrl+E → Ctrl+Z: чипа немає', /<code>abc<\/code>/.test(h2) && !/<code>/.test(h3));
  ok('5c `ls -la` → чип; Ctrl+Z прибирає і чип, і набір', /<code>ls -la<\/code>/.test(h4) && !/<code>/.test(h5) && clean(await A.innerText())==='Привіт, світе abc'); }
// 6 кирилична розкладка: Ctrl+Z приходить як «я», Ctrl+E — як «у»
await pg.keyboard.press('End'); await pg.keyboard.type(' тест');
{ await cyr('я','KeyZ',90); const f0=await text(A);
  for(let i=0;i<3;i++) await pg.keyboard.press('Shift+ArrowLeft'); await cyr('у','KeyE',69); const f1=await A.innerHTML();
  ok('6 кирилична розкладка: Ctrl+Z скасовує набір («'+f0+'»), Ctrl+E робить чип', f0==='Привіт, світе abc' && /<code>abc<\/code>/.test(f1)); }
// 7 Ctrl+Z в одному блоці не чіпає інший; скасований набір можна повернути
await pg.keyboard.press('Escape'); await pg.mouse.click(500,320); await pg.keyboard.type('Другий блок'); await pg.waitForTimeout(100);
const B=pg.locator('#sheet > .blk').nth(1).locator('.txt');   // за порядком: після скасування тексту в ньому немає
{ await Z(); await Z(); await Z(); const g0=await text(A), g1=await text(B); await SZ(); const g2=await text(B);
  ok('7 Ctrl+Z тричі в другому блоці: він порожній («'+g1+'»), перший не змінився («'+g0+'»); Ctrl+Shift+Z повертає («'+g2+'»)', g0==='Привіт, світе abc' && g1==='' && g2==='Другий блок'); }
await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
// 8 скасоване йде й у сховище
{ const n=(await idbAll()).find(n=>n.blocks.some(b=>/Другий блок/.test(b.text||''))); const a=n&&n.blocks.find(b=>/Привіт/.test(b.text||''));
  ok('8 у сховищі — стан після скасувань: «'+(a&&a.text)+'», чип abc', !!a && a.text==='Привіт, світе abc' && /<code>abc<\/code>/.test(a.html||'')); }
// 9 вийшли з блока (Esc) — Ctrl+Z скасовує останню правку в ньому й повертає туди курсор
await A.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' кінець'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
{ await Z(); const i0=await text(A); const focused=await A.evaluate(e=>document.activeElement===e);
  ok('9 після Esc: Ctrl+Z поза блоком скасовує «кінець» («'+i0+'»), курсор знову в блоці', i0==='Привіт, світе abc' && focused); }
await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
// 10 стерли весь текст і вийшли — блок зникає з плашкою «Скасувати»; Ctrl+Z повертає його на те саме місце
{ const b0=await box(B); await B.click(); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Delete'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  const gone=(await pg.locator('#sheet > .blk').filter({hasText:'Другий блок'}).count())===0, msg=await pg.locator('#undo .umsg').innerText(), shown=await pg.locator('#undo').evaluate(e=>!e.hidden && e.classList.contains('show'));
  ok('10a блок зник, плашка: «'+msg+'»', gone && shown && msg==='Блок «Другий блок» видалено');
  await Z(); await pg.waitForTimeout(400); const back=pg.locator('#sheet > .blk').filter({hasText:'Другий блок'}).locator('.txt'); const b1=(await back.count())? await box(back) : null;
  const n=(await idbAll()).find(n=>n.blocks.some(b=>/Привіт/.test(b.text||'')));
  ok('10b Ctrl+Z повернув блок на те саме місце ('+(b1&&b1.x+','+b1.y)+' = '+b0.x+','+b0.y+'), він у сховищі', !!b1 && b1.x===b0.x && b1.y===b0.y && !!n && n.blocks.some(b=>b.text==='Другий блок')); }
// 11 назва нотатки, назва області й код у редагуванні — теж кроками, а не по букві
await pg.locator('#ttl').click(); await pg.keyboard.type('Назва нотатки');
{ await Z(); const t0=await pg.locator('#ttl').innerText(); await pg.keyboard.press('Enter');
  await pg.locator('#areaBtn').click(); await pg.waitForTimeout(200); await pg.keyboard.type('Паролі'); const at=pg.locator('.blk.is-area .ctitle').first(); await Z(); const t1=await at.innerText(); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.evaluate(()=>{ const dt=new DataTransfer(); dt.setData('text/plain','const a = 1;\nconst b = 2;\nconsole.log(a + b);'); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true})); }); await pg.waitForTimeout(300);
  const cb=pg.locator('.blk.is-code').first(); await cb.locator('.cb.lock').click(); await pg.waitForTimeout(150); await pg.keyboard.type('// нове'); await Z(); const t2=await cb.locator('.code code').innerText(); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok('11 Ctrl+Z одним кроком: назва нотатки («'+t0+'»), назва області («'+t1+'»), код у редагуванні (без «// нове»: '+!/нове/.test(t2)+')', t0==='' && t1==='' && !/нове/.test(t2) && /console\.log/.test(t2)); }

await pg.screenshot({path:OUT+'/apphistory-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
