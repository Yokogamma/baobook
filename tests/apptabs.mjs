import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;   // a real origin: the language files load over http, not from file://
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const NOTES=['Перша','Друга'].map((t,i)=>({id:'t'+i,title:t,blocks:[{id:'b'+i,row:2,text:'текст '+t,fx:0.2}],created:1,updated:Date.now()-i*60000}));
const open=(pg,title)=>pg.evaluate(t=>[...document.querySelectorAll('#list .item')].find(d=>d.textContent.includes(t)).click(), title);
const shows=pg=>pg.evaluate(()=>document.getElementById('ttl').textContent);
const stored=pg=>pg.evaluate(()=>JSON.parse(localStorage.getItem('sheet:settings')||'{}'));

/* ── two tabs of one browser: each keeps its own note, and neither erases the other's settings ── */
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:800}}); const errs=[];
  const A=await ctx.newPage(); A.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await A.goto(SITE); await A.waitForTimeout(400);
  await A.evaluate(()=>new Promise(r=>{ localStorage.clear(); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await A.reload(); await A.waitForTimeout(400);
  await A.setInputFiles('#importFile',{name:'n.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'baobook',format:1,notes:NOTES}))}); await A.waitForTimeout(800);
  const B=await ctx.newPage(); B.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await B.goto(SITE); await B.waitForTimeout(600);

  await open(A,'Перша'); await open(B,'Друга'); await A.waitForTimeout(200);
  ok('1 tab A shows «Перша», tab B shows «Друга»', await shows(A)==='Перша' && await shows(B)==='Друга');
  await A.bringToFront(); await A.click('#sideBtn'); await A.waitForTimeout(200);
  ok('2 hiding the panel in A keeps the last opened note (B\'s «Друга») in the shared settings', (await stored(A)).current==='t1' && (await stored(A)).side===false);
  await B.bringToFront(); await B.reload(); await B.waitForTimeout(600);
  ok('3 B reloaded stays on its own note «Друга» ('+await shows(B)+')', await shows(B)==='Друга');
  await A.reload(); await A.waitForTimeout(600);
  ok('4 A reloaded stays on its own note «Перша» ('+await shows(A)+')', await shows(A)==='Перша');

  const C=await ctx.newPage(); C.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); await C.goto(SITE); await C.waitForTimeout(600);
  ok('5 a new tab opens the note opened last in any tab («Друга»), the reload of A did not change it ('+await shows(C)+')', await shows(C)==='Друга');
  await C.close();

  await A.bringToFront(); await A.evaluate(()=>document.getElementById('themeBtn').click()); const theme=(await stored(A)).theme;
  await B.bringToFront(); await B.evaluate(()=>document.getElementById('gridBtn').click()); await B.waitForTimeout(100); const s=await stored(B);
  ok('6 a setting changed in B keeps the one A changed a moment ago (theme '+s.theme+', grid '+s.grid+', panel '+s.side+')', !!theme && s.theme===theme && s.grid===false && s.side===false);

  console.log(errs.length? errs.join('\n') : '✓ no errors'); if(errs.length) fails++;
  await ctx.close(); }

await br.close(); process.exit(fails?1:0);
