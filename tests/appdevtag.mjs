import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const fs=await import('node:fs');
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const OUT=(await import('node:path')).join((await import('node:os')).tmpdir(),'sheet-tests'); fs.mkdirSync(OUT,{recursive:true});

// The real hosts are answered from the local server, so the page runs with location.hostname of the real site
// (https, a secure context). Service workers are blocked: their requests would bypass the routing.
const open=async(host,opts={})=>{
  const ctx=await br.newContext({...CTX, serviceWorkers:'block', viewport:{width:1280,height:800}, ...opts}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  if(host) await ctx.route(`https://${host}/**`, async r=>{ const u=new URL(r.request().url()); r.fulfill({response:await r.fetch({url:SITE+u.pathname.slice(1)+u.search})}); });
  await pg.goto(host? `https://${host}/` : SITE); await pg.waitForSelector('html[data-ready]'); await pg.waitForTimeout(300);
  return {ctx, pg, errs};
};
const look=pg=>pg.evaluate(()=>{ const t=document.getElementById('devTag'), r=t.getBoundingClientRect(), strip=getComputedStyle(document.body,'::after'),
  gear=document.getElementById('setBtn').getBoundingClientRect(), nw=document.getElementById('newBtn').getBoundingClientRect();
  return {dev:document.documentElement.classList.contains('dev'), shown:r.width>0 && getComputedStyle(t).display!=='none', text:t.textContent, tip:t.title,
    strip:strip.content!=='none' && strip.position==='fixed' ? Math.round(parseFloat(strip.height)) : 0, stripEvents:strip.pointerEvents, title:document.title,
    tagBeforeGear:r.right<=gear.left+1, gearBeforeNew:gear.right<nw.left}; });

/* ── the tests' own origin (127.0.0.1) and production show no marker ─────────────── */
for(const host of [null,'baobook.matamata.app']){ const {ctx,pg,errs}=await open(host); const name=host||'127.0.0.1'; const s=await look(pg);
  ok(`1 ${name}: no «DEV» tag, no strip, the tab title has no «DEV» («${s.title}»)`, !s.dev && !s.shown && s.strip===0 && !/DEV/.test(s.title) && /· Baobook$/.test(s.title) && !errs.length);
  await ctx.close(); }

/* ── the development site is marked ───────────────────────────────────────────────── */
{ const {ctx,pg,errs}=await open('baobook.matamata.dev'); const s=await look(pg);
  ok('2 baobook.matamata.dev: the «DEV» tag stands after «Baobook», before the gear, and the gear still comes before «Нова»', s.dev && s.shown && s.text==='DEV' && s.tagBeforeGear && s.gearBeforeNew);
  ok('2b its tooltip says where notes belong («'+s.tip+'»)', /baobook\.matamata\.app/.test(s.tip) && /нотатки/i.test(s.tip));
  ok('3 an orange strip runs along the top ('+s.strip+'px) and lets clicks through ('+s.stripEvents+')', s.strip===3 && s.stripEvents==='none');
  ok('4 the tab title starts with «DEV · » («'+s.title+'»)', /^DEV · .+ · Baobook$/.test(s.title));
  await pg.locator('#ttl').click(); await pg.keyboard.type('Чернетка'); await pg.waitForTimeout(100);
  ok('4b and keeps it while the note title is typed («'+await pg.title()+'»)', await pg.title()==='DEV · Чернетка · Baobook');
  await pg.screenshot({path:OUT+'/appdevtag-desktop.png', clip:{x:0,y:0,width:640,height:120}});
  ok('5 no page errors', !errs.length); if(errs.length) console.log(errs);
  await ctx.close(); }

/* ── phone: the strip does not take the header's clicks ───────────────────────────── */
{ const {ctx,pg}=await open('baobook.matamata.dev',{viewport:{width:375,height:740}, hasTouch:true, isMobile:true});
  const s=await look(pg); const b=await pg.locator('#sideBtn').boundingBox();
  await pg.touchscreen.tap(b.x+b.width/2, b.y+4); await pg.waitForTimeout(300);
  ok('6 phone: the strip is there ('+s.strip+'px) and a tap on the top edge of the panel button still opens the panel', s.strip===3 && await pg.evaluate(()=>document.getElementById('app').classList.contains('open')));
  await pg.screenshot({path:OUT+'/appdevtag-phone.png'});
  await ctx.close(); }

/* ── English ───────────────────────────────────────────────────────────────────────── */
{ const {ctx,pg}=await open('baobook.matamata.dev',{locale:'en-US'}); const s=await look(pg);
  ok('7 in English the tooltip is English («'+s.tip+'»)', s.text==='DEV' && /^Development build/.test(s.tip) && /baobook\.matamata\.app/.test(s.tip));
  await ctx.close(); }

await br.close();
console.log(fails? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails?1:0);
