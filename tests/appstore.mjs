import { chromium } from 'playwright';
import fs from 'node:fs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const PAGE=new URL('../index.html', import.meta.url).href;
const idbNotes=pg=>pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction('notes','readonly').objectStore('notes').getAll(); t.onsuccess=()=>{ d.close(); res(t.result); }; t.onerror=()=>{ d.close(); res([]); }; }catch(_){ d.close(); res([]); } }; r.onerror=()=>res([]); }));
const lsNotes=pg=>pg.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sheet:note:')));
const wipe=async pg=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };

/* ── звичайний режим: IndexedDB ─────────────────────────────────────────── */
{ const ctx=await br.newContext({viewport:{width:1280,height:900},acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.addInitScript(()=>{ window.__persist=0; const st=navigator.storage; if(st&&st.persist){ const o=st.persist.bind(st); st.persist=()=>{ window.__persist++; return o(); }; } });
  await pg.goto(PAGE); await wipe(pg);
  await pg.mouse.click(500,300); await pg.keyboard.type('перша нотатка в IndexedDB'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  const a=await idbNotes(pg), l=await lsNotes(pg);
  ok('1 нотатка лежить в IndexedDB, у localStorage нотаток немає ('+a.length+' / '+l.length+')', a.length===1 && a[0].blocks.some(b=>/перша нотатка/.test(b.text)) && l.length===0);
  ok('1b після першого збереження застосунок попросив постійне сховище (persist)', (await pg.evaluate(()=>window.__persist))>=1);
  ok('1c у панелі — рядок про сховище', /1 нотатка на цьому пристрої · експорт: ще не робили/.test(await pg.locator('#storInfo').innerText()));
  await pg.reload(); await pg.waitForTimeout(400);
  ok('2 після перезавантаження нотатка на місці', (await pg.locator('.blk .txt').filter({hasText:'перша нотатка'}).count())===1);
  // міграція зі старого localStorage
  await pg.evaluate(()=>{ localStorage.setItem('sheet:note:mig1', JSON.stringify({id:'mig1',title:'Мігрована',blocks:[{id:'m1',fx:0.3,row:3,text:'зі старого сховища'}],created:1,updated:Date.now()+5000})); });
  await pg.reload(); await pg.waitForTimeout(500); await pg.locator('#list .item').filter({hasText:'Мігрована'}).click(); await pg.waitForTimeout(200);
  const a2=await idbNotes(pg), l2=await lsNotes(pg);
  ok('3 нотатка з localStorage переїхала в IndexedDB і відкрилась, старий ключ прибрано', a2.some(n=>n.id==='mig1') && l2.length===0 && (await pg.locator('#list .item').filter({hasText:'Мігрована'}).count())===1 && (await pg.locator('.blk .txt').filter({hasText:'зі старого сховища'}).count())===1);
  // експорт
  const [dl]=await Promise.all([pg.waitForEvent('download'), pg.locator('#exportBtn').click()]); const path=await dl.path(); const data=JSON.parse(fs.readFileSync(path,'utf8'));
  ok('4 експорт: файл '+dl.suggestedFilename()+' з '+data.notes.length+' нотатками, формат 1', /^chystyi-arkush-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && data.format===1 && data.notes.length===2 && data.notes.some(n=>n.id==='mig1') && /експорт: щойно/.test(await pg.locator('#storInfo').innerText()));
  // імпорт: нова нотатка + новіша версія наявної + старіша версія (пропускається)
  const imp={app:'sheet',format:1,notes:[
    {id:'imp1',title:'Імпортована',blocks:[{id:'i1',fx:0.2,row:4,text:'прийшла з файлу'}],created:1,updated:Date.now()+9000},
    {id:'mig1',title:'Мігрована',blocks:[{id:'m1',fx:0.3,row:3,text:'оновлений текст з файлу'}],created:1,updated:Date.now()+20000},
    {id:data.notes.find(n=>n.id!=='mig1').id,title:'',blocks:[{id:'x',fx:0.2,row:2,text:'СТАРА версія, не має замінити'}],created:1,updated:5}]};
  fs.writeFileSync('import-test.json', JSON.stringify(imp));
  await pg.locator('#importFile').setInputFiles('import-test.json'); await pg.waitForTimeout(600);
  const toast=await pg.locator('#toast').innerText();
  ok('5a імпорт: повідомлення «1 нова, 1 оновлено, 1 без змін» ('+toast.trim()+')', /Імпортовано: 1 нова, 1 оновлено, 1 без змін/.test(toast));
  await pg.locator('#list .item').filter({hasText:'Імпортована'}).click(); await pg.waitForTimeout(200);
  ok('5b нова нотатка відкривається з вмістом', (await pg.locator('.blk .txt').filter({hasText:'прийшла з файлу'}).count())===1);
  await pg.locator('#list .item').filter({hasText:'Мігрована'}).click(); await pg.waitForTimeout(200);
  ok('5c наявна нотатка замінена новішою версією', (await pg.locator('.blk .txt').filter({hasText:'оновлений текст з файлу'}).count())===1 && (await pg.locator('.blk .txt').filter({hasText:'зі старого сховища'}).count())===0);
  await pg.locator('#list .item').filter({hasText:'перша нотатка'}).click(); await pg.waitForTimeout(200);
  ok('5d старіша версія з файлу не замінила локальну', (await pg.locator('.blk .txt').filter({hasText:'перша нотатка в IndexedDB'}).count())===1 && (await pg.locator('.blk .txt').filter({hasText:'СТАРА версія'}).count())===0);
  await pg.reload(); await pg.waitForTimeout(400);
  ok('5e після перезавантаження всі три нотатки на місці', (await pg.locator('#list .item').count())===3 && (await idbNotes(pg)).length===3);
  fs.writeFileSync('bad.json','{"hello":1}'); await pg.locator('#importFile').setInputFiles('bad.json'); await pg.waitForTimeout(300);
  ok('5f чужий файл: зрозуміле повідомлення, нічого не змінилось', /не файл експорту/.test(await pg.locator('#toast').innerText()) && (await pg.locator('#list .item').count())===3);
  console.log(errs.length? errs.join('\n') : '✓ без помилок (IndexedDB)'); if(errs.length) fails++; await ctx.close(); }

/* ── запасний режим: без IndexedDB ──────────────────────────────────────── */
{ const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.addInitScript(()=>{ Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true}); });
  await pg.goto(PAGE); await pg.waitForTimeout(400); await pg.evaluate(()=>localStorage.clear()); await pg.reload(); await pg.waitForTimeout(400);
  await pg.mouse.click(500,300); await pg.keyboard.type('без IndexedDB'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  ok('6 без IndexedDB нотатки зберігаються в localStorage, у панелі позначка «резервне сховище»', (await lsNotes(pg)).length===1 && /резервне сховище/.test(await pg.locator('#storInfo').innerText()));
  await pg.reload(); await pg.waitForTimeout(400);
  ok('6b після перезавантаження нотатка на місці', (await pg.locator('.blk .txt').filter({hasText:'без IndexedDB'}).count())===1 && /Збережено|^$/.test(await pg.locator('#saved').innerText()));
  console.log(errs.length? errs.join('\n') : '✓ без помилок (localStorage)'); if(errs.length) fails++; await ctx.close(); }
await br.close(); process.exit(fails?1:0);
