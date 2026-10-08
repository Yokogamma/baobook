import { chromium } from 'playwright';
import fs from 'node:fs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=new URL('../public/index.html', import.meta.url).href;
const box=async(loc)=>{ const b=await loc.boundingBox(); return b? {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} : null; };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const tap=async(x,y)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(60); await touch('touchEnd',[]); };
const hold=async(x,y,ms=650)=>{ await touch('touchStart',[{x,y}]); await pg.waitForTimeout(ms); await touch('touchEnd',[]); };
const vis=loc=>loc.isVisible();
const idbNotes=()=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const hasText=t=>pg.locator('.blk .txt').filter({hasText:t}).count();
const fail=v=>pg.evaluate(v=>{ window.sheetDebug.failSave=v; },v);
await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
// 1 звичайний запис: ⚠ немає, короткий статус ✓ на телефоні
await hold(150,300); await pg.waitForTimeout(250); await pg.keyboard.type('перша записана'); await pg.waitForTimeout(500);
{ const st=await pg.locator('#saved').evaluate(e=>({cls:e.className, short:e.querySelector('.ss').textContent, longVis:getComputedStyle(e.querySelector('.sl')).display, shortVis:getComputedStyle(e.querySelector('.ss')).display}));
  ok('1 записано: ⚠ схований, на телефоні короткий статус «'+st.short+'» ('+st.cls+'), довгий підпис схований', !(await vis(pg.locator('#saveWarn'))) && /ok/.test(st.cls) && st.short==='✓' && st.longVis==='none' && st.shortVis!=='none'); }
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
// 2 відмова сховища: ⚠ у шапці (44 px), помилка в панелі з «Повторити» й «Експортувати»
await fail(true); await hold(150,500); await pg.waitForTimeout(250); await pg.keyboard.type('не записалось'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
{ const w=await box(pg.locator('#saveWarn')); const cls=await pg.locator('#saved').getAttribute('class');
  ok('2a відмова: ⚠ у шапці видно ('+(w&&w.w+'×'+w.h)+'), статус err', await vis(pg.locator('#saveWarn')) && w && w.w>=40 && w.h>=40 && /err/.test(cls));
  await tap(w.x+w.w/2, w.y+w.h/2); await pg.waitForTimeout(400); const msg=await pg.locator('#saveErrMsg').innerText();
  ok('2b ⚠ відкриває панель: «'+msg.slice(0,60)+'…», кнопки «Повторити» й «Експортувати»', await vis(pg.locator('#saveErr')) && /Не збережено: тест/.test(msg) && /Нотатка «не записалось»|Нотатка «перша записана»/.test(msg) && await vis(pg.locator('#saveRetry')) && await vis(pg.locator('#saveExport')));
  ok('2c статус у шапці не обіцяє успіху: без «Збережено»', !/Збережено/.test(await pg.locator('#saved').innerText())); }
// 3 видно на 320 px і при низькому вікні («клавіатура»)
await pg.setViewportSize({width:320,height:568}); await pg.waitForTimeout(300); const w320=await box(pg.locator('#saveWarn'));
await pg.setViewportSize({width:390,height:420}); await pg.waitForTimeout(300); const w420=await box(pg.locator('#saveWarn'));
ok('3 ⚠ видно на 320 px (x+w='+(w320&&w320.x+w320.w)+') і при вікні 420 px заввишки', w320 && w320.x+w320.w<=320 && w320.y>=0 && w420 && w420.y+w420.h<=420);
await pg.setViewportSize({width:390,height:844}); await pg.waitForTimeout(300);
// 4 друга нотатка теж не записується — у панелі обидві; повернення в першу: текст на місці, помилка на місці
await pg.locator('#newBtn').tap(); await pg.waitForTimeout(400); await hold(150,300); await pg.waitForTimeout(250); await pg.keyboard.type('друга в памʼяті'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(400); const msg2=await pg.locator('#saveErrMsg').innerText();
ok('4a дві незаписані: «'+msg2.slice(0,70)+'»', /2 нотатки/.test(msg2) && /друга в памʼяті/.test(msg2) && /перша записана/.test(msg2));
await pg.locator('#list .item').filter({hasText:'перша записана'}).tap(); await pg.waitForTimeout(600);
ok('4b повернення в першу нотатку: незаписаний текст на місці (з памʼяті), помилка лишилась', (await hasText('не записалось'))===1 && await vis(pg.locator('#saveWarn')) && /err/.test(await pg.locator('#saved').getAttribute('class')));
// 5 експорт із помилки бере останню версію з памʼяті
await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(400);
{ const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#saveExport').tap()]); const data=JSON.parse(fs.readFileSync(await dl.path(),'utf8')); const all=JSON.stringify(data);
  ok('5 експорт з рядка помилки: у файлі обидві незаписані версії', /не записалось/.test(all) && /друга в памʼяті/.test(all)); }
// 6 beforeunload попереджає, поки є незаписане
ok('6 beforeunload: закриття вкладки з незаписаним потребує підтвердження', await pg.evaluate(()=>{ const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; }));
// 7 відмову вимкнено (без перезавантаження) → «Повторити» записує останню версію обох нотаток
await fail(false); await pg.locator('#saveRetry').tap(); await pg.waitForTimeout(700);
{ const n=await idbNotes(); const texts=n.flatMap(x=>x.blocks.map(b=>b.text));
  ok('7 «Повторити»: обидві нотатки записані ('+texts.join(' | ')+'), ⚠ і рядок помилки зникли', texts.some(t=>/не записалось/.test(t)) && texts.some(t=>/друга в памʼяті/.test(t)) && !(await vis(pg.locator('#saveWarn'))) && !(await vis(pg.locator('#saveErr')))); }
ok('7b без незаписаного beforeunload не заважає', !(await pg.evaluate(()=>{ const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; })));
// 8 лише тепер перезавантаження: усе на місці
await pg.reload(); await pg.waitForTimeout(500);
{ const n=await idbNotes(); ok('8 після перезавантаження у сховищі '+n.length+' нотатки з текстами', n.length===2 && (await hasText('не записалось'))+(await hasText('друга в памʼяті'))===1); }
// 9 ?debug=1: перемикач у панелі
await pg.goto(PAGE+'?debug=1'); await pg.waitForTimeout(500); await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(300);
await pg.locator('#dbgFail').check(); const on=await pg.evaluate(()=>window.sheetDebug.failSave); await pg.locator('#dbgFail').uncheck(); const off=await pg.evaluate(()=>window.sheetDebug.failSave);
ok('9 ?debug=1: перемикач «Імітувати відмову сховища» видно, вмикає й вимикає без перезавантаження', await vis(pg.locator('#dbgRow')) && on===true && off===false);
await pg.goto(PAGE); await pg.waitForTimeout(400);
ok('9b без параметра перемикача немає', !(await vis(pg.locator('#dbgRow'))));
// 11 beforeunload рахує і незавершений запис: правка → одразу закриття, ще до 300 мс автозбереження
const unload=()=>pg.evaluate(()=>{ const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; });
await pg.locator('.blk .txt').filter({hasText:'не записалось'}).tap(); await pg.keyboard.press('End'); await fail(true); await pg.keyboard.type(' ще'); const immediate=await unload(); await pg.waitForTimeout(700);
ok('11a відмова: закриття одразу після правки попереджає ще до того, як запис завершився', immediate && await vis(pg.locator('#saveWarn')));
{ const w=await box(pg.locator('#saveWarn')); await tap(w.x+w.w/2, w.y+w.h/2); await pg.waitForTimeout(400); } await fail(false); await pg.locator('#saveRetry').tap(); await pg.waitForTimeout(700); await tap(350,700); await pg.waitForTimeout(400);   // ⚠ відкриває панель; «Повторити»; закрити панель
await pg.locator('.blk .txt').filter({hasText:'не записалось'}).tap(); await pg.keyboard.press('End'); await pg.keyboard.type(' і ще'); const inflight=await unload(); await pg.waitForTimeout(700); const settled=await unload();
ok('11b справне сховище: під час запису попередження є, після підтвердження запису — немає', inflight && !settled && !(await vis(pg.locator('#saveWarn'))));
await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
// 12 старіший успішний запис не знімає новішу помилку: порядок завершення керований
await pg.evaluate(()=>{ const q=[]; window.__q=q; const i=sheetDebug.idb; i._put=i._put||i.put; i.put=()=>new Promise((res,rej)=>q.push({res,rej})); window.__si=Storage.prototype.setItem; Storage.prototype.setItem=function(){ throw new DOMException('full','QuotaExceededError'); }; });
await pg.locator('.blk .txt').filter({hasText:'не записалось'}).tap(); await pg.keyboard.press('End'); await pg.keyboard.type('A'); await pg.waitForTimeout(450); const q1=await pg.evaluate(()=>window.__q.length);
await pg.keyboard.type('B'); await pg.waitForTimeout(450); const q2=await pg.evaluate(()=>window.__q.length);
await pg.evaluate(()=>window.__q[1].rej(new DOMException('full','QuotaExceededError'))); await pg.waitForTimeout(200); const afterNewFail=await vis(pg.locator('#saveWarn'));
await pg.evaluate(()=>window.__q[0].res()); await pg.waitForTimeout(200); const afterOldOk=await vis(pg.locator('#saveWarn'));
ok('12 два записи в польоті ('+q1+' → '+q2+'): новіший відмовив — ⚠ є; старіший потім вдався — ⚠ лишається', q1===1 && q2===2 && afterNewFail && afterOldOk && /err/.test(await pg.locator('#saved').getAttribute('class')));
await pg.evaluate(()=>{ const i=sheetDebug.idb; i.put=i._put; Storage.prototype.setItem=window.__si; }); await pg.keyboard.press('Escape'); await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(300); await pg.locator('#saveRetry').tap(); await pg.waitForTimeout(700);
{ const n=await idbNotes(); ok('12b після відновлення сховища «Повторити» записує останню версію (…AB)', !(await vis(pg.locator('#saveWarn'))) && n.some(x=>x.blocks.some(b=>/не записалось ще і щеAB/.test(b.text)))); } await tap(350,700); await pg.waitForTimeout(400);
// 13 імпорт іде тим самим шляхом: відмова при імпорті → нотатка в памʼяті, ⚠ і повтор
await fail(true); fs.writeFileSync(OUT+'/import-fail.json', JSON.stringify({app:'sheet',format:1,notes:[{id:'impF',title:'Імпортована при відмові',blocks:[{id:'f1',fx:0.2,row:2,text:'з файлу'}],created:1,updated:Date.now()+90000}]}));
await pg.locator('#importFile').setInputFiles(OUT+'/import-fail.json'); await pg.waitForTimeout(700);
ok('13a імпорт при відмові: нотатка є в списку, ⚠ видно, у рядку помилки її назва', (await pg.locator('#list .item').filter({hasText:'Імпортована при відмові'}).count())===1 && await vis(pg.locator('#saveWarn')) && /Імпортована при відмові/.test(await pg.locator('#saveErrMsg').innerText()));
await fail(false); await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(400); await pg.locator('#saveRetry').tap(); await pg.waitForTimeout(700);
{ const n=await idbNotes(); ok('13b «Повторити» дописує імпортовану нотатку в сховище', n.some(x=>x.id==='impF') && !(await vis(pg.locator('#saveWarn')))); }
await tap(350,700); await pg.waitForTimeout(300);
// 14 причина: переповнення сховища названо, інша помилка — з назвою
await pg.evaluate(()=>{ sheetDebug.idb.put=()=>Promise.reject(new DOMException('full','QuotaExceededError')); Storage.prototype.setItem=function(){ throw new DOMException('full','QuotaExceededError'); }; });
await hold(150,650); await pg.waitForTimeout(250); await pg.keyboard.type('переповнення'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
ok('14a переповнення: «'+(await pg.locator('#saved .sl').textContent())+'»', /Не збережено: сховище переповнене/.test(await pg.locator('#saved .sl').textContent()));
await pg.evaluate(()=>{ sheetDebug.idb.put=()=>Promise.reject(new DOMException('ro','ReadOnlyError')); Storage.prototype.setItem=function(){ throw new DOMException('sec','SecurityError'); }; });
await pg.locator('.blk .txt').filter({hasText:'переповнення'}).tap(); await pg.keyboard.press('End'); await pg.keyboard.type(' ще'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
ok('14b інша помилка: «'+(await pg.locator('#saved .sl').textContent())+'»', /Не збережено: помилка сховища \(SecurityError\)/.test(await pg.locator('#saved .sl').textContent()));
await pg.screenshot({path:OUT+'/appsave-final.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
