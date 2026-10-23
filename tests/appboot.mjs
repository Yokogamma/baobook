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
const ctx=await br.newContext({...CTX, viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'}); await ctx.addInitScript(WRAP);
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
ok('1 the list is remembered by names only ('+snap0.join(', ')+')', snap0.includes('Ключі від дому') && snap0.includes('Покупки') && await pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:listsnap')).every(x=>Object.keys(x).every(k=>k==='t'||k==='p'))));

// the storage answers after 7 s; the user opens the panel at once (as on the phone)
await pg.evaluate(()=>sessionStorage.setItem('__slow','7000')); await pg.reload(); await pg.waitForTimeout(300); await openPanel();
await pg.waitForTimeout(1300); const s1=await state();
ok('2 after 1 s, the panel open: the strip says the storage is opening and is above the panel ('+JSON.stringify(s1 && {strip:s1.strip, above:s1.above, panel:s1.panel})+')', !!s1 && s1.panel && /Сховище браузера відкривається/.test(s1.strip) && s1.above);
ok('2a the last list shows greyed meanwhile, under «Нотатки завантажуються…» ('+(s1 && s1.snap.join(', '))+')', !!s1 && /Нотатки завантажуються/.test(s1.cap) && s1.snap.includes('Покупки') && s1.items.length===0);
await pg.waitForTimeout(4000); const s2=await state();
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

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); await site.close(); process.exit(fails?1:0);
