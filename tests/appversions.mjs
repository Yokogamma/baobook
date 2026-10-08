import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); pg.on('dialog',d=>d.accept());
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const idbAll=(store)=>pg.evaluate(store=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction(store,'readonly').objectStore(store).getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }), store);
const vers=async id=>(await idbAll('versions')).filter(v=>v.note===id).sort((a,b)=>a.t-b.t);
const bodies=async id=>(await idbAll('blobs')).filter(b=>b.note===id);
const note=async id=>(await idbAll('notes')).find(n=>n.id===id);
const curId=()=>pg.evaluate(()=>sheetDebug.cur());
const settle=async()=>{ await pg.waitForTimeout(700); await pg.evaluate(()=>sheetDebug.vers.queue()); await pg.waitForTimeout(100); };
const clock=ms=>pg.evaluate(ms=>{ sheetDebug.vers.clock=ms; }, ms);
const force=(reason,name)=>pg.evaluate(([r,n])=>sheetDebug.vers.force(r,n), [reason,name||null]);
const paste=(text)=>pg.evaluate(t=>{ const dt=new DataTransfer(); dt.setData('text/plain',t); document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); }, text);
await pg.goto(new URL('../public/index.html', import.meta.url).href); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
// 0 база версії 2, нова нотатка з блоком: версій ще немає (порожній стан не версія, інтервал не минув)
await pg.mouse.click(500,300); await pg.keyboard.type('пароль: Qw3rty!'); await pg.keyboard.press('Escape'); await settle();
const id=await curId(); const dbv=await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const names=[...d.objectStoreNames]; const v=d.version; d.close(); res({v,names}); }; }));
ok('0 база версії '+dbv.v+' зі сховищами '+dbv.names.join(',')+'; після першого блока версій '+(await vers(id)).length, dbv.v===2 && dbv.names.includes('versions') && dbv.names.includes('blobs') && (await vers(id)).length===0);
// 1 нова сесія, перша правка: версія «base» зі станом до правки і часом минулого збереження; тіло — старий текст
await pg.reload(); await pg.waitForTimeout(500); const before=await note(id);
const txt=pg.locator('#sheet .blk .txt').first(); await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' змінено'); await pg.keyboard.press('Escape'); await settle();
{ const v=await vers(id), b=await bodies(id), after=await note(id);
  ok('1 перша правка в новій сесії: версій '+v.length+' ('+(v[0]&&v[0].reason)+'), t = попереднє updated ('+(v[0]&&v[0].t===before.updated)+'), тіло версії «'+(b[0]&&b[0].s)+'», sig відрізняється від поточного ('+(v[0]&&v[0].sig!==(await pg.evaluate(()=>sheetDebug.vers.last().sig))===false)+')', v.length===1 && v[0].reason==='base' && v[0].t===before.updated && b.length===1 && b[0].s==='пароль: Qw3rty!' && /змінено/.test(after.blocks[0].text)); }
// 2 десять правок з паузами за хвилину — версій не більшає (стан не «відлежався», інтервал R3 не минув)
for(let i=0;i<10;i++){ await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('.'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(450); }
await settle(); ok('2 десять правок з паузами: версій '+(await vers(id)).length, (await vers(id))===1 || (await vers(id)).length===1);
// 3 безперервна правка понад 5 хв (годинник версій +1…+4 хв, потім +5,5) — одна «auto» від R3; через 7,5 хв ще правка: стан до неї вже версія (auto), тож R1 мовчить, а R3 пише нову «auto»
for(const m of [1,2,3,4]){ await clock(m*60000); await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('a'); await pg.keyboard.press('Escape'); await settle(); }
const n3=(await vers(id)).length; await clock(5.5*60000); await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('b'); await pg.keyboard.press('Escape'); await settle(); const v3=await vers(id);
await clock(13*60000); await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('c'); await pg.keyboard.press('Escape'); await settle(); const v3b=await vers(id);
ok('3 правки на +1…+4 хв: версій '+n3+'; на +5,5 хв: '+v3.length+' ('+v3.map(v=>v.reason).join(',')+'); після паузи 7,5 хв: '+v3b.length+' ('+v3b.map(v=>v.reason).join(',')+')', n3===1 && v3.length===2 && v3[1].reason==='auto' && v3b.length===3 && v3b[2].reason==='auto');
// 4 перенос блока мишею не додає тіл; у зведенні «переміщено 1»
{ const b0=(await bodies(id)).length; const g=await pg.locator('#sheet .blk .grip').first().boundingBox(); await pg.mouse.move(g.x+g.width/2,g.y+g.height/2); await pg.mouse.down(); await pg.mouse.move(g.x+g.width/2+200,g.y+g.height/2+150,{steps:8}); await pg.mouse.up(); await settle();
  await clock(20*60000); await force('auto'); const v=await vers(id), b1=(await bodies(id)).length; const last=v[v.length-1];
  ok('4 перенос блока: тіл '+b0+' → '+b1+', зведення '+JSON.stringify(last.sum), b1===b0 && last.sum.mv===1 && last.sum.ch===0); }
// 5 блок коду: вставка — нове тіло; перейменування блока — без нового тіла, у зведенні «змінено 1»
{ await pg.mouse.click(500,700); await pg.waitForTimeout(50); await paste('function a(){\n  return 1;\n}'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await settle(); await clock(25*60000); await force('auto'); const b0=(await bodies(id)).length;
  const t=pg.locator('#sheet .blk.is-code .ctitle').first(); await t.click(); await pg.keyboard.type('Назва'); await pg.keyboard.press('Enter'); await settle(); await clock(30*60000); await force('auto'); const v=await vers(id), b1=(await bodies(id)).length, last=v[v.length-1];
  ok('5 блок коду: тіл після вставки '+b0+', після перейменування '+b1+'; зведення '+JSON.stringify(last.sum)+'; назва в маніфесті «'+(last.blocks.find(e=>e.kind==='code')||{}).title+'»', b0>=2 && b1===b0 && last.sum.ch===1 && (last.blocks.find(e=>e.kind==='code')||{}).title==='Назва'); }
// 6 імпорт новішої копії: версія «import» зі станом до перезапису (стан після правки ще не версія — інтервал не минув)
{ await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('!'); await pg.keyboard.press('Escape'); await settle(); const n=await note(id); const copy={app:'sheet',format:1,notes:[{id:n.id,title:'Імпортована',blocks:n.blocks.map(b=>({...b,text:b.kind? b.text : 'після імпорту'})),created:n.created,updated:n.updated+5000}]};
  await pg.setInputFiles('#importFile',{name:'imp.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(copy))}); await settle(); const v=await vers(id), imp=v.filter(x=>x.reason==='import');
  ok('6 імпорт новішої копії: версій «import» '+imp.length+', її назва «'+(imp[0]&&imp[0].title)+'», нотатка тепер «'+(await note(id)).title+'»', imp.length===1 && imp[0].title===n.title && (await note(id)).title==='Імпортована'); }
// 7 прорідження: версії з минулого через force при зсунутому годиннику; очікування рахуємо тією ж лестницею
{ const H=36e5, D=864e5; const past=[-100*D, -20*D, -20*D+H, -3*D, -3*D+20*60000, -3*D+2*H, -2*H, -H]; for(const c of past){ await clock(c); await force('auto'); }
  await clock(0); await pg.evaluate(()=>sheetDebug.vers.thin()); const v=await vers(id); const tMax=Math.max(Date.now(), ...v.map(x=>x.t));
  const all=[...v].sort((a,b)=>b.t-a.t); const expect=(()=>{ const keep=new Set(), seen=new Set(); all.forEach((x,i)=>{ if(i===0||x.name){ keep.add(x.id); return; } const a=tMax-x.t; if(a<D){ keep.add(x.id); return; } if(a>=90*D) return; const k=a<7*D? 'h'+Math.floor(x.t/H) : 'd'+Math.floor(x.t/D); if(!seen.has(k)){ seen.add(k); keep.add(x.id); } }); return keep.size; })();
  const gone100=!v.some(x=>tMax-x.t>=90*D), day20=v.filter(x=>Math.abs(tMax-x.t-20*D)<2*H).length, day3=v.filter(x=>Math.abs(tMax-x.t-3*D)<3*H).length;
  ok('7 прорідження: лишилось '+v.length+' (лестниця дає '+expect+'), версії старші за 90 днів зникли ('+gone100+'), за день −20 лишилась '+day20+' з 2, за день −3 — '+day3+' з 3 (дві в одну годину)', v.length===expect && gone100 && day20===1 && day3===2); }
// 8 бюджет: квота 20 МБ → бюджет 1 МБ; шість версій блока коду по 200 КБ; sweep лишає найновішу і іменовану
{ await pg.evaluate(()=>{ sheetDebug.vers.estimate={usage:0,quota:20*1024*1024}; }); const big='x'.repeat(200*1024); await pg.mouse.click(900,300); await pg.waitForTimeout(50); await paste(big+'\n1'); await pg.waitForTimeout(400); await pg.keyboard.press('Escape'); await settle();
  const bigTxt=pg.locator('#sheet .blk').filter({hasText:'xxxxxxxx'}).locator('.txt').first(); for(let i=0;i<6;i++){ await bigTxt.click(); await pg.keyboard.press('Control+End'); await pg.keyboard.type('z'); await pg.keyboard.press('Escape'); await settle(); await clock((40+i)*60000); await force(i===2? 'manual' : 'auto', i===2? 'Реліз' : null); }
  const before=await vers(id), sizeBefore=await pg.evaluate(()=>sheetDebug.vers.size); await pg.evaluate(()=>sheetDebug.vers.sweep()); const after=await vers(id), sizeAfter=await pg.evaluate(()=>sheetDebug.vers.size), budget=await pg.evaluate(()=>sheetDebug.vers.budget());
  const newest=before[before.length-1]; ok('8 бюджет '+Math.round(budget/1024)+' КБ: до '+before.length+' версій ('+Math.round(sizeBefore/1024)+' КБ), після sweep '+after.length+' ('+Math.round(sizeAfter/1024)+' КБ); найновіша на місці ('+after.some(x=>x.id===newest.id)+'), іменована на місці ('+after.some(x=>x.name==='Реліз')+')', budget===1024*1024 && sizeBefore>budget && sizeAfter<=budget && after.length<before.length && after.some(x=>x.id===newest.id) && after.some(x=>x.name==='Реліз')); }
// 9 відмова запису версії не чіпає статус збереження
{ await pg.evaluate(()=>{ sheetDebug.vers.fail=true; sheetDebug.vers.clock=120*60000; }); const e0=await pg.evaluate(()=>sheetDebug.vers.errors); await txt.click(); await pg.keyboard.press('End'); await pg.keyboard.type('q'); await pg.keyboard.press('Escape'); await settle(); const cls=await pg.locator('#saved').getAttribute('class'), e1=await pg.evaluate(()=>sheetDebug.vers.errors), warn=await pg.locator('#saveWarn').isHidden();
  await pg.evaluate(()=>{ sheetDebug.vers.fail=false; }); ok('9 відмова версії: статус «'+cls+'», ⚠ немає ('+warn+'), помилок '+e0+' → '+e1, /ok|^saved$/.test(cls) && warn && e1>e0); }
// 10 видалення нотатки чистить її версії й тіла
{ const other=(await idbAll('notes')).length; await pg.locator('#list .item.cur .it-x').click(); await settle(); await pg.waitForTimeout(300); ok('10 після видалення нотатки версій '+(await vers(id)).length+', тіл '+(await bodies(id)).length, (await vers(id)).length===0 && (await bodies(id)).length===0 && other>=1); }
await pg.screenshot({path:OUT+'/appversions.png'});
console.log(errs.length? errs.join('\n') : '✓ без помилок'); if(errs.length) fails++;
await br.close(); process.exit(fails?1:0);
