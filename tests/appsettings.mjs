import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
// scrollbars stay on: the scenario measures the list's scrollbar width
const br=await chromium.launch({ignoreDefaultArgs:['--hide-scrollbars'], ...(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {})});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});
const wipe=async pg=>{ await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400); };
const importNotes=async(pg,notes)=>{ await pg.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes}))}); await pg.waitForTimeout(800); };
const many=n=>[...Array(n)].map((_,i)=>({id:'n'+i,title:'Нотатка '+(i+1),blocks:[{id:'b'+i,row:2,text:'текст '+(i+1),fx:0.2}],created:1,updated:Date.now()-i*60000}));
const LONG={id:'long',title:'Довга',blocks:[{id:'l1',row:2,text:'верх',fx:0.2},{id:'l2',row:160,text:'низ',fx:0.2}],created:1,updated:Date.now()+60000};   // the sheet is taller than the window
const shown=(pg,sel)=>pg.locator(sel).isVisible();

/* ── computer: the gear menu, the footer, the scrollbar, the wheel ─────────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800},acceptDownloads:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto(SITE); await wipe(pg);
  ok('1 the panel shows no settings: language, export and import sit behind the gear', await shown(pg,'#setBtn') && !(await shown(pg,'#setPop')) && !(await shown(pg,'#langSel')) && !(await shown(pg,'#exportBtn')) && !(await shown(pg,'#importBtn')));
  const g1=await pg.evaluate(()=>{ const r=id=>document.getElementById(id).getBoundingClientRect(), gear=r('setBtn'), brand=document.querySelector('.brand span').getBoundingClientRect(), nw=r('newBtn');
    return {gear:[gear.left,gear.right,gear.top,gear.bottom].map(Math.round), brandTop:Math.round(brand.top), newLeft:Math.round(nw.left), label:document.getElementById('setBtn').getAttribute('aria-label')}; });
  ok('1b the gear sits right after «Baobook», before «Нова», named «'+g1.label+'» ('+g1.gear.join(',')+')', g1.gear[1]<g1.newLeft && g1.gear[2]>=g1.brandTop-4 && g1.label==='Налаштування');

  await pg.click('#setBtn'); await pg.waitForTimeout(200);
  const m=await pg.evaluate(()=>{ const p=document.getElementById('setPop').getBoundingClientRect(), s=document.getElementById('side').getBoundingClientRect(), b=document.getElementById('setBtn').getBoundingClientRect();
    return {open:document.getElementById('setBtn').getAttribute('aria-expanded'), inside:p.left>=s.left && p.right<=s.right, below:p.top>=b.bottom-2}; });
  ok('2 the gear opens the menu below it, inside the panel (aria-expanded '+m.open+')', m.open==='true' && m.inside && m.below && await shown(pg,'#langSel') && await shown(pg,'#exportBtn') && await shown(pg,'#importBtn'));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  ok('3 Esc closes it and the focus returns to the gear', !(await shown(pg,'#setPop')) && await pg.evaluate(()=>document.activeElement.id)==='setBtn' && await pg.getAttribute('#setBtn','aria-expanded')==='false');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  ok('4 from the keyboard the focus goes straight into the menu (language)', await shown(pg,'#setPop') && await pg.evaluate(()=>document.activeElement.id)==='langSel');
  await pg.mouse.click(700,400); await pg.waitForTimeout(150);
  ok('5 a click outside closes it', !(await shown(pg,'#setPop')));
  await pg.click('#setBtn'); await pg.click('#setBtn'); await pg.waitForTimeout(100);
  ok('5b a second click on the gear closes it', !(await shown(pg,'#setPop')));

  await importNotes(pg,[...many(30),LONG]);
  await pg.locator('#list .item').filter({hasText:'Довга'}).click(); await pg.waitForTimeout(300);
  await pg.click('#setBtn'); const [dl]=await Promise.all([pg.waitForEvent('download'), pg.click('#exportBtn')]); await pg.waitForTimeout(200);
  ok('6 export from the menu downloads the file and closes the menu ('+dl.suggestedFilename()+')', /^baobook-/.test(dl.suggestedFilename()) && !(await shown(pg,'#setPop')));

  const f=await pg.evaluate(()=>{ const r=id=>document.getElementById(id).getBoundingClientRect(), l=r('list'), s=r('side'), i=r('storInfo'), list=document.getElementById('list');
    return {listBottom:Math.round(l.bottom), sideBottom:Math.round(s.bottom), infoTop:Math.round(i.top), infoBottom:Math.round(i.bottom), sb:list.offsetWidth-list.clientWidth, text:document.getElementById('storInfo').innerText, fs:getComputedStyle(document.getElementById('sideFoot')).fontSize}; });
  ok('7 the list reaches the bottom of the panel ('+f.listBottom+' / '+f.sideBottom+'), «'+f.text+'» stays small ('+f.fs+') at the bottom', f.listBottom===f.sideBottom && f.infoBottom<=f.sideBottom && f.infoTop>f.sideBottom-60 && /^3\d нотат/.test(f.text) && f.fs==='11px');
  ok('7b the scrollbar is thin ('+f.sb+'px)', f.sb>0 && f.sb<=8);
  await pg.locator('#list').evaluate(e=>{ e.scrollTop=e.scrollHeight; }); await pg.waitForTimeout(100);
  const last=await pg.evaluate(()=>{ const its=document.querySelectorAll('#list .item'); return {b:Math.round(its[its.length-1].getBoundingClientRect().bottom), t:Math.round(document.getElementById('storInfo').getBoundingClientRect().top)}; });
  ok('7c scrolled to the end, the last note is above the footer ('+last.b+' ≤ '+last.t+')', last.b<=last.t);
  await pg.locator('#list').evaluate(e=>{ e.scrollTop=0; }); await pg.evaluate(()=>scrollTo(0,0)); await pg.waitForTimeout(100);

  const sc=()=>pg.evaluate(()=>({list:Math.round(document.getElementById('list').scrollTop), win:Math.round(scrollY)}));
  const over=async(sel)=>{ const b=await pg.locator(sel).boundingBox(); await pg.mouse.move(b.x+b.width/2, b.y+b.height/2); };
  await over('#searchBox'); await pg.mouse.wheel(0,300); await pg.waitForTimeout(300); let s=await sc();
  ok('8 the wheel over the search box scrolls the note list, not the sheet ('+s.list+' / '+s.win+')', s.list>0 && s.win===0);
  await over('#storInfo'); const s0=s.list; await pg.mouse.wheel(0,200); await pg.waitForTimeout(300); s=await sc();
  ok('8b over the footer too ('+s0+' → '+s.list+' / '+s.win+')', s.list>s0 && s.win===0);
  await over('#list'); const s1=s.list; await pg.mouse.wheel(0,200); await pg.waitForTimeout(400); s=await sc();
  ok('8c over the list itself ('+s1+' → '+s.list+' / '+s.win+')', s.list>s1 && s.win===0);
  await pg.mouse.move(800,400); const s2=s.list; await pg.mouse.wheel(0,400); await pg.waitForTimeout(400); s=await sc();
  ok('9 over the right side the wheel scrolls the sheet and leaves the list alone ('+s.list+' / '+s.win+')', s.win>0 && s.list===s2);
  await pg.screenshot({path:OUT+'/appsettings-desktop.png'});

  await pg.evaluate(()=>scrollTo(0,0)); await pg.fill('#q','Довга'); await pg.waitForTimeout(300);
  await over('#searchBox'); await pg.mouse.wheel(0,300); await pg.waitForTimeout(300); s=await sc();
  ok('10 a short list does not hand the wheel to the sheet either ('+s.list+' / '+s.win+')', s.win===0);
  await over('#list .item'); await pg.mouse.wheel(0,300); await pg.waitForTimeout(300); s=await sc();
  ok('10b also over the notes of a short list ('+s.win+')', s.win===0);
  await pg.click('#setBtn'); await pg.waitForTimeout(100); await over('#setPop'); await pg.mouse.wheel(0,300); await pg.waitForTimeout(300); s=await sc();
  ok('10c and not over the open menu ('+s.win+')', s.win===0);
  console.log(errs.length? errs.join('\n') : '✓ no errors (computer)'); if(errs.length) fails++;
  await ctx.close(); }

/* ── phone: touch-sized items, Back closes the menu and keeps the panel ─────────── */
{ const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  await pg.goto(SITE); await wipe(pg);
  await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(400); await pg.locator('#setBtn').tap(); await pg.waitForTimeout(300);
  const h=await pg.evaluate(()=>[...document.querySelectorAll('#setPop .mi:not([hidden])')].map(e=>Math.round(e.getBoundingClientRect().height)));
  ok('11 phone: the menu opens inside the panel, items are at least 44px ('+h.join(', ')+')', await shown(pg,'#setPop') && h.length>=2 && h.every(x=>x>=44));
  await pg.evaluate(()=>history.back()); await pg.waitForTimeout(400);
  const open=await pg.locator('.app').evaluate(e=>e.classList.contains('open'));
  ok('12 system Back closes the menu, the panel stays open', !(await shown(pg,'#setPop')) && open);
  await pg.locator('#setBtn').tap(); await pg.waitForTimeout(200); await pg.touchscreen.tap(150,700); await pg.waitForTimeout(200);
  ok('13 a touch outside closes it', !(await shown(pg,'#setPop')));
  await pg.screenshot({path:OUT+'/appsettings-phone.png'});
  console.log(errs.length? errs.join('\n') : '✓ no errors (phone)'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
