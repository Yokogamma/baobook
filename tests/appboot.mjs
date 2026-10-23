// The start seen while it waits (2026-10-23: the installed app on Android showed an empty panel and no sign-in for minutes after «Оновити»,
// with no strip, because the panel covered it). On a phone with the panel open: after 1 s the strip says the storage is opening, above the panel;
// after 5 s that it is slow; the last list shows greyed meanwhile; then the real list. The settings menu lists the last starts with the step that
// took longest, and a start that never finished with the step it waited for. Under the storage lock the strip stays above the panel and the
// last list shows greyed under its caption.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
import { until } from './lib/wait.mjs';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const site=await serve(); const errs=[];

// IndexedDB that answers late (sessionStorage.__slow ms: the real open runs that much later) or fails (__fail: the request's error event)
const WRAP=()=>{ const real=IDBFactory.prototype.open; const S=k=>{ try{ return sessionStorage.getItem(k); }catch(_){ return null; } };
  IDBFactory.prototype.open=function(...a){ const slow=+(S('__slow')||0), fail=S('__fail'); if(!slow && !fail) return real.apply(this,a);
    const r={onsuccess:null, onerror:null, onblocked:null, onupgradeneeded:null, result:null, error:null, readyState:'pending'};
    if(fail){ setTimeout(()=>{ r.error=new DOMException('Internal error opening backing store for indexedDB.open.','UnknownError'); r.onerror && r.onerror({target:r}); }, 50); return r; }
    setTimeout(()=>{ const q=real.apply(indexedDB,a); q.onupgradeneeded=e=>{ r.result=q.result; r.transaction=q.transaction; r.onupgradeneeded && r.onupgradeneeded(e); };
      q.onsuccess=()=>{ r.result=q.result; r.readyState='done'; r.onsuccess && r.onsuccess({target:r}); }; q.onerror=()=>{ r.error=q.error; r.onerror && r.onerror({target:r}); }; }, slow); return r; }; };
// the notes' read held (sessionStorage.__stallNotes ms): the transaction completes that much later
const STALL=()=>{ const real=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(names, mode, ...r){ const t=real.call(this, names, mode, ...r), ms=+(sessionStorage.getItem('__stallNotes')||0);
  if(!ms || names!=='notes' || (mode && mode!=='readonly')) return t;
  return {objectStore:n=>t.objectStore(n), set oncomplete(f){ t.oncomplete=e=>setTimeout(()=>f(e), ms); }, set onerror(f){ t.onerror=f; }, set onabort(f){ t.onabort=f; }}; }; };
const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'}); await ctx.addInitScript(WRAP); await ctx.addInitScript(STALL);
const pg=await ctx.newPage(); pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const state=()=>pg.evaluate(()=>{ const s=document.querySelector('#roStrip .rostrip'), r=s.getBoundingClientRect(), hit=!document.getElementById('roStrip').hidden && document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
  return {strip:document.getElementById('roStrip').hidden? '' : document.getElementById('roMsg').textContent, above:!!(hit && hit.closest('#roStrip')), panel:document.querySelector('.app').classList.contains('open'),
    snap:[...document.querySelectorAll('#list .snapit')].map(e=>e.textContent), cap:(document.querySelector('#list .snapcap')||{}).textContent||'', items:[...document.querySelectorAll('#list .item .it-t')].map(e=>e.textContent)}; }).catch(()=>null);
const openPanel=()=>pg.evaluate(()=>{ if(!document.querySelector('.app').classList.contains('open')) document.getElementById('sideBtn').click(); });
const journal=async()=>{ await pg.evaluate(()=>{ document.getElementById('setPop').hidden=true; }); await openPanel(); await pg.click('#setBtn'); const t=await pg.locator('#bootV').innerText(); await pg.keyboard.press('Escape'); return t; };

// a first start, two notes with titles: the list is remembered by names
await pg.goto(site.url); await pg.waitForSelector('#list .item');
await pg.evaluate(()=>{ document.getElementById('ttl').textContent='Ключі від дому'; document.getElementById('ttl').dispatchEvent(new Event('input',{bubbles:true})); }); await pg.waitForTimeout(400);
await pg.evaluate(()=>document.getElementById('newBtn').click()); await pg.waitForTimeout(200);
await pg.evaluate(()=>{ document.getElementById('ttl').textContent='Покупки'; document.getElementById('ttl').dispatchEvent(new Event('input',{bubbles:true})); }); await pg.waitForTimeout(1600);
const snap0=await pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:listsnap')||'[]').map(x=>x.t));
await pg.evaluate(()=>localStorage.removeItem('sheet:listsnap')); await pg.reload(); await pg.waitForSelector('#list .item'); await pg.waitForTimeout(1600);
ok('1b a healthy start with nothing touched remembers its list too', (await pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:listsnap')||'[]').map(x=>x.t))).includes('Покупки'));
ok('1 the list is remembered by names only ('+snap0.join(', ')+')', snap0.includes('Ключі від дому') && snap0.includes('Покупки') && await pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:listsnap')).every(x=>Object.keys(x).every(k=>k==='t'||k==='p'))));

// the storage answers after 7 s; the user opens the panel at once (as on the phone)
await pg.evaluate(()=>sessionStorage.setItem('__slow','7000')); await pg.reload(); await pg.waitForTimeout(300); await openPanel();
await pg.waitForTimeout(1300); const s1=await state();
ok('2 after 1 s, the panel open: the strip says the storage is opening and is above the panel ('+JSON.stringify(s1 && {strip:s1.strip, above:s1.above, panel:s1.panel})+')', !!s1 && s1.panel && /Сховище браузера відкривається/.test(s1.strip) && s1.above);
ok('2a the last list shows greyed meanwhile, under «Нотатки завантажуються…» ('+(s1 && s1.snap.join(', '))+')', !!s1 && /Нотатки завантажуються/.test(s1.cap) && s1.snap.includes('Покупки') && s1.items.length===0);
{ await pg.click('#setBtn'); await pg.waitForTimeout(200);
  const hit=await pg.evaluate(()=>{ const s=document.getElementById('langSel'), r=s.getBoundingClientRect(), h=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!h && (h===s || s.contains(h)); });
  ok('2b the settings menu opened during the wait: the language switcher is not under the strip', hit); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); }
await pg.waitForTimeout(3600); const s2=await state();
ok('3 after 5 s the strip says the storage is slow ('+(s2 && s2.strip)+')', !!s2 && /відповідає повільно/.test(s2.strip) && s2.above);
const s3=await until(async()=>{ const s=await state(); return s && s.items.length? s : null; }, 10000);
ok('4 the storage answered: the real list, no greyed names, no strip ('+JSON.stringify(s3 && {items:s3.items, snap:s3.snap.length, strip:s3.strip})+')', !!s3 && s3.items.includes('Покупки') && !s3.snap.length && !s3.strip);
const j1=await journal();
ok('5 the menu lists the start with its longest step: opening the storage, about 7 s ('+j1.replace(/\n/g,' | ')+')', /Останні запуски/.test(j1) && /найдовше — відкриття сховища, 7(,\d)? с/.test(j1));

// a start that never finished (the app closed while the storage was silent): the next start's menu says what it waited for
await pg.evaluate(()=>sessionStorage.setItem('__slow','60000')); await pg.reload(); await pg.waitForTimeout(4500);
await pg.evaluate(()=>sessionStorage.removeItem('__slow')); await pg.reload(); await pg.waitForSelector('#list .item'); await pg.waitForTimeout(300);
const j2=await journal();
ok('6 a start that never finished: «не завершився щонайменше за …, чекав на відкриття сховища» ('+j2.replace(/\n/g,' | ')+')', /не завершився щонайменше за [4-9](,\d)? с, чекав на відкриття сховища/.test(j2));

// the storage lock with the panel open: the strip above the panel, the last list greyed under its caption
await pg.evaluate(()=>sessionStorage.setItem('__fail','1')); await pg.reload();
await until(async()=>{ const s=await state(); return s && /не відкрилося/.test(s.strip); }, 15000); await openPanel(); await pg.waitForTimeout(500);   // the panel opened by hand after the start (it closes when the start opens a note)
const s4=await state();
ok('7 the storage lock, the panel open: the strip is above the panel ('+JSON.stringify(s4 && {above:s4.above, panel:s4.panel})+')', !!s4 && s4.above && s4.panel && /не відкрилося/.test(s4.strip));
ok('7a the last list greyed under «Ці нотатки є на пристрої, але зараз недоступні:» ('+(s4 && s4.snap.join(', '))+')', !!s4 && /зараз недоступні/.test(s4.cap) && s4.snap.includes('Ключі від дому'));
const keep=await pg.evaluate(()=>localStorage.getItem('sheet:listsnap')); await pg.evaluate(()=>sessionStorage.removeItem('__fail')); await pg.reload(); await pg.waitForSelector('#list .item'); await pg.waitForTimeout(1500);
ok('7b the lock writes no list: the remembered names are the healthy start\'s', JSON.parse(keep).some(x=>x.t==='Покупки'));

// review 3: a lock found before the start's end (data of a newer app) while the notes' read is held: the strip says the lock, not nothing
await pg.evaluate(()=>new Promise(res=>{ const r=indexedDB.open('sheet', 99); r.onsuccess=()=>{ r.result.close(); res(); }; r.onerror=()=>res(); }));
await pg.evaluate(()=>sessionStorage.setItem('__stallNotes','60000')); await pg.reload();
const s8=await until(async()=>{ const s=await state(); return s && /старша за ваші дані/.test(s.strip)? s : null; }, 6000);
ok('8 a lock before the start ends (newer data, the notes\' read held): the strip says it ('+(s8 && s8.strip.slice(0,40))+'…)', !!s8);
await pg.evaluate(()=>sessionStorage.removeItem('__stallNotes'));

// review 1: a list write waiting in one tab is dropped by an owner change told by another tab (the names go with the notes)
{ const c2=await br.newContext({...CTX, serviceWorkers:'block'}); const a=await c2.newPage(); await a.goto(site.url); await a.waitForSelector('#list .item');
  const b=await c2.newPage(); await b.goto(site.url); await b.waitForSelector('#list .item'); await b.waitForTimeout(1600);
  await b.evaluate(()=>sheetDebug.relist());   // b's list write is now 1 s away
  await a.evaluate(()=>{ localStorage.removeItem('sheet:listsnap'); new BroadcastChannel('sheet:notes').postMessage({t:'owner', by:'account'}); });
  await b.waitForTimeout(1600);
  ok('9 an owner change from another tab drops the list and the write that was waiting', await a.evaluate(()=>localStorage.getItem('sheet:listsnap'))===null);
  await c2.close(); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); await site.close(); process.exit(fails?1:0);
