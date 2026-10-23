// The tap highlight: Android Chrome flashes a blue -webkit-tap-highlight-color over every tapped element unless it is turned off. It is off
// for the whole page, and the controls give their own press feedback instead: :active backgrounds on the gear, the header buttons, «+» and «×»
// of the panel and the menu items, and .press on a list item.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : (await import('node:fs')).existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
const cdp=await ctx.newCDPSession(pg); await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const touch=async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
const center=async loc=>{ const b=await loc.boundingBox(); return {x:b.x+b.width/2, y:b.y+b.height/2}; };
const TRANSPARENT='rgba(0, 0, 0, 0)';
const tapHl=loc=>loc.evaluate(e=>getComputedStyle(e).webkitTapHighlightColor);
const bg=loc=>loc.evaluate(e=>getComputedStyle(e).backgroundColor);
// the background while :active is forced on the element through DevTools (a real press keeps :active only for the gesture's moment)
const activeBg=async sel=>{ await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); const {root}=await cdp.send('DOM.getDocument');
  const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId, selector:sel}); await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:['active']});
  await pg.waitForTimeout(250);   // the gear has a .15s background transition
  const v=await pg.locator(sel).first().evaluate(e=>getComputedStyle(e).backgroundColor); await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:[]}); return v; };

await pg.goto(SITE); await pg.waitForTimeout(400); await pg.evaluate(()=>new Promise(r=>{ (localStorage.clear(),sessionStorage.clear()); const q=indexedDB.deleteDatabase('sheet'); q.onsuccess=q.onerror=q.onblocked=()=>r(); })); await pg.reload(); await pg.waitForTimeout(400);
// two notes, so the list has an item that is not the open one
await pg.evaluate(()=>document.getElementById('newBtn').click()); await pg.waitForTimeout(300);
await pg.locator('#sideBtn').tap(); await pg.waitForTimeout(300);

const gear=pg.locator('#setBtn'), item=pg.locator('.list .item:not(.cur)').first(), more=pg.locator('#moreBtn');
ok('1 the page turns the tap highlight off: html '+(await tapHl(pg.locator('html'))), (await tapHl(pg.locator('html')))===TRANSPARENT);
ok('2 the gear inherits it: '+(await tapHl(gear)), (await tapHl(gear))===TRANSPARENT);
ok('3 a list item inherits it: '+(await tapHl(item)), (await item.count())===1 && (await tapHl(item))===TRANSPARENT);
ok('4 the header «⋯» and the panel «+» and «×» too', (await tapHl(more))===TRANSPARENT && (await tapHl(pg.locator('#newBtn')))===TRANSPARENT && (await tapHl(pg.locator('#sideX')))===TRANSPARENT);

// press feedback: at rest transparent, pressed a visible background
for(const [name,sel] of [['the gear','#setBtn'],['the panel «+»','#newBtn'],['the panel «×»','#sideX']]){
  const rest=await bg(pg.locator(sel)), act=await activeBg(sel);
  ok('5 '+name+' pressed has a background ('+rest+' → '+act+')', rest===TRANSPARENT && act!==TRANSPARENT);
}
// a list item: .press while the finger is down, gone after the finger leaves
{ const id=await item.getAttribute('data-id'); const p=await center(item.locator('.it-t')); const rest=await bg(item);
  await touch('touchStart',[{x:p.x,y:p.y}]); await pg.waitForTimeout(80);
  const live=pg.locator('.list .item[data-id="'+id+'"]'); const pressed=await live.evaluate(e=>e.classList.contains('press')), pbg=await bg(live);
  await touch('touchEnd',[]); await pg.waitForTimeout(300);
  ok('6 a list item under the finger is marked ('+rest+' → '+pbg+')', pressed && pbg!==rest && pbg!==TRANSPARENT); }
// the header «⋯» and its menu items (the panel closed by the tap that opened the note)
{ if(await pg.locator('#sideX').evaluate(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.right>0 && r.left<innerWidth; })){ await pg.locator('#sideX').tap(); await pg.waitForTimeout(300); }
  const rest=await bg(more), act=await activeBg('#moreBtn');
  ok('7 the header «⋯» pressed has a background ('+rest+' → '+act+')', rest===TRANSPARENT && act!==TRANSPARENT);
  await more.tap(); await pg.waitForTimeout(300);
  const mi=pg.locator('.amenu.hm .mi').first(); const sel='.amenu.hm .mi';
  const mrest=await bg(mi), mact=await activeBg(sel);
  ok('8 a menu item pressed has a background ('+mrest+' → '+mact+')', (await mi.count())>=1 && mact!==TRANSPARENT && mact!==mrest);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); }
// the keyboard focus ring stays
{ const css=await pg.evaluate(()=>[...document.styleSheets].flatMap(s=>{ try{ return [...s.cssRules]; }catch(_){ return []; } }).some(r=>r.selectorText==='button:focus-visible' && /outline/.test(r.cssText)));
  ok('9 button:focus-visible keeps its outline', css); }
ok('10 no page errors'+(errs.length? ': '+errs.join(' | ') : ''), errs.length===0);
await br.close(); console.log(fails? '\n✗ failures: '+fails : '\n✓ all passed'); process.exit(fails?1:0);
