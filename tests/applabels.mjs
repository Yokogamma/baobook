import { chromium } from 'playwright';
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const PAGE=new URL('../public/index.html', import.meta.url).href;
const wipe=async pg=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };
const seed=(pg,notes)=>pg.evaluate(notes=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; const t=d.transaction('notes','readwrite'); notes.forEach(n=>t.objectStore('notes').put(n)); t.oncomplete=()=>{ d.close(); res(); }; }; }), notes);
const pad=pg=>pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--pad').trim());
const texts=n=>Array.from({length:n},(_,i)=>({id:'t'+i, fx:0.05+(i%3)*0.3, row:2+Math.floor(i/3)*2, text:'рядок '+(i+1)}));
const Y=new Date().getFullYear(), jan15=new Date().getMonth()===0 && new Date().getDate()===15;

/* ── компʼютер: дата в списку нотаток, лічильник блоків, «разом із N блоком» у меню області ───────────── */
{ const ctx=await br.newContext({viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(PAGE); await wipe(pg);
  await seed(pg,[
    {id:'today', title:'Сьогоднішня', blocks:texts(1), created:1, updated:Date.now()},
    {id:'year', title:'Цьогорічна', blocks:texts(2), created:1, updated:+new Date(Y, jan15? 1 : 0, 15, 12)},
    {id:'old', title:'Торішня', blocks:texts(5), created:1, updated:+new Date(Y-1, 8, 28, 12)},
    {id:'c11', title:'Лічильник: 11', blocks:texts(11), created:1, updated:+new Date(Y-1, 0, 11)},
    {id:'c21', title:'Лічильник: 21', blocks:texts(21), created:1, updated:+new Date(Y-1, 0, 21)},
    {id:'c25', title:'Лічильник: 25', blocks:texts(25), created:1, updated:+new Date(Y-1, 0, 25)},
    {id:'area', title:'Область на 21', created:1, updated:+new Date(Y-2, 5, 1), blocks:[{id:'A', fx:0.05, row:2, kind:'area', cw:12, title:'Двадцять один'}, ...Array.from({length:21},(_,i)=>({id:'k'+i, parent:'A', col:0, row:i*2, text:'пункт '+(i+1)}))]}]);
  await pg.evaluate(()=>localStorage.clear()); await pg.reload(); await pg.waitForTimeout(600);
  const item=t=>pg.locator('#list .item').filter({has:pg.locator('.it-t',{hasText:new RegExp('^'+t+'$')})});
  const date=async t=>(await item(t).locator('.it-d').innerText()).trim();
  // 1 дата: сьогодні — час; цього року — «15 січ.» (місяць словом, без року); іншого року — «28 вер. 2025 р.»
  { const d0=await date('Сьогоднішня'), d1=await date('Цьогорічна'), d2=await date('Торішня');
    ok('1a сьогоднішня нотатка — час ('+d0+')', /^\d{1,2}:\d{2}$/.test(d0));
    ok('1b цьогорічна — число й місяць словом, без року ('+d1+')', /^15 [а-яіїєґ]+\.?$/i.test(d1));
    ok('1c торішня — число, місяць словом і рік ('+d2+')', /^28 [а-яіїєґ]+\.? /i.test(d2) && d2.includes(String(Y-1))); }
  // 2 лічильник блоків у шапці — у правильному відмінку
  { const want={'Сьогоднішня':'1 блок','Цьогорічна':'2 блоки','Торішня':'5 блоків','Лічильник: 11':'11 блоків','Лічильник: 21':'21 блок','Лічильник: 25':'25 блоків','Область на 21':'22 блоки'}, got={};
    for(const t of Object.keys(want)){ await item(t).click(); await pg.waitForTimeout(150); got[t]=(await pg.locator('#cnt').innerText()).trim(); }
    ok('2 лічильник: '+Object.values(got).join(', '), Object.keys(want).every(t=>got[t]===want[t])); }
  // 3 меню «⋯» області з 21 блоком: «Видалити область і 21 блок» (не «блоки»/«блоків»); число в основному підписі, плашка після видалення — «разом із 21 блоком»
  { const area=pg.locator('.blk.is-area').first(); await area.locator('.ablk').hover(); await area.locator('.cb.more').click(); await pg.waitForTimeout(120);
    const s=await area.locator('.amenu .del').evaluate(e=>[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()); await pg.keyboard.press('Escape');   // основний підпис — текстовий вузол між значком і <small>
    ok('3 меню області: «'+s+'»', s==='Видалити область і 21 блок'); }
  // 4 стилі: правило без селектора браузер мовчки відкидає — таких немає; бокове поле аркуша на компʼютері — клітинка
  { const css=await pg.evaluate(()=>[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n')); const bare=css.replace(/\/\*[\s\S]*?\*\//g,'').match(/(^|[{};])\s*\{[^{}]{0,40}/g)||[];
    ok('4 у стилях немає правил без селектора'+(bare.length? ': '+bare.map(s=>s.replace(/\s+/g,' ').trim()).join(' | ') : '')+'; --pad '+(await pad(pg)), !bare.length && (await pad(pg))==='24px'); }
  console.log(errs.length? errs.join('\n') : '✓ без помилок (компʼютер)'); if(errs.length) fails++;
  await ctx.close(); }

/* ── iPhone: підказка встановлення — рядком у підвалі панелі, а не спливною карткою над пошуком ─────── */
{ const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
  const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(PAGE); await wipe(pg);
  await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(500);
  const g=await pg.evaluate(()=>{ const r=id=>{ const b=document.getElementById(id).getBoundingClientRect(); return {t:Math.round(b.top), b:Math.round(b.bottom), l:Math.round(b.left), r:Math.round(b.right)}; }; const h=document.getElementById('iosHint');
    return {hidden:h.hidden, pos:getComputedStyle(h).position, hint:r('iosHint'), foot:r('sideFoot'), search:r('searchBox')}; });
  ok('5 iPhone: підказка встановлення видна, у підвалі панелі під кнопками ('+g.pos+', '+g.hint.t+'–'+g.hint.b+' у '+g.foot.t+'–'+g.foot.b+'), пошук ('+g.search.t+'–'+g.search.b+') не закриває',
    !g.hidden && g.pos==='static' && g.hint.t>=g.foot.t && g.hint.b<=g.foot.b && g.hint.l>=g.foot.l && g.hint.r<=g.foot.r && g.hint.t>g.search.b);
  ok('6 телефон: бокове поле аркуша 16px ('+(await pad(pg))+')', (await pad(pg))==='16px');
  await pg.screenshot({path:OUT+'/applabels-ios.png'});
  console.log(errs.length? errs.join('\n') : '✓ без помилок (iPhone)'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
