// Waiting for conditions instead of fixed pauses. A pause that is long enough on a quiet machine can be too short on a busy one
// (other scenarios running, a CI runner), so these wait for what the next check depends on. Their timeouts are only reached
// when the app never gets there, and then the check that follows fails as before.

// the app is up: the language file is applied, the note list is drawn and the sheet is visible, so a click lands on it.
// The page is hidden until data-ready; with reduced motion the inherited visibility can reach #sheet a few frames later.
// It needs a note in the list: with every note in the archive or the trash it waits out the timeout
export async function ready(pg, timeout=30000){
  await pg.waitForSelector('html[data-ready]',{state:'attached',timeout});
  await pg.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout});
  await pg.waitForFunction(()=>{ const s=document.getElementById('sheet'); return !!s && getComputedStyle(s).visibility!=='hidden'; },null,{timeout}); }

// n frames drawn: pointer moves, resize events and requestAnimationFrame callbacks reach the page with a frame
export const frames=(pg,n=2)=>pg.evaluate(n=>new Promise(r=>{ const f=k=>k? requestAnimationFrame(()=>f(k-1)) : r(); f(n); }),n);

// no CSS transition runs on the element or inside it (a block sliding home, a card settling after a resize). It sees transitions
// already running or set by the handler that just ran; one the app starts later from a timer or a frame is not waited for
export const still=(loc,timeout=5000)=>loc.evaluate((e,timeout)=>Promise.race([
  Promise.all(e.getAnimations({subtree:true}).filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))),
  new Promise(r=>setTimeout(r,timeout))]),timeout);

// a new viewport size, once the page has had its resize event and the timers the app starts from it have run
// (the sheet height is recomputed 80 ms after a resize; a later timer runs after it)
export async function resize(pg, width, height){
  const same=await pg.evaluate(([w,h])=>innerWidth===w && innerHeight===h,[width,height]);
  if(!same) await pg.evaluate(()=>{ window.__resized=new Promise(r=>{ addEventListener('resize',()=>setTimeout(r,200),{once:true}); setTimeout(r,3000); }); });
  await pg.setViewportSize({width,height});
  if(!same) await pg.evaluate(()=>window.__resized);
  await frames(pg); }

// the click on an element that the next input causes (a tap becomes a click a moment after the touch ends) has been handled
// (its synchronous handlers have run): armClick(locator) before the input, clicked(page) after it. A click elsewhere does not count
export const armClick=loc=>loc.evaluate(el=>{ window.__click=new Promise(r=>{ const done=()=>{ removeEventListener('click',f,true); clearTimeout(t); setTimeout(r,0); };
  const f=e=>{ if(el.contains(e.target)) done(); }, t=setTimeout(done,10000); addEventListener('click',f,true); }); });
export const clicked=pg=>pg.evaluate(()=>window.__click);

// polls fn until it gives a truthy value or the time is up, and returns the last value: the check that uses it still decides
export async function until(fn, timeout=5000, every=50){
  const end=Date.now()+timeout;
  for(;;){ const v=await fn(); if(v || Date.now()>=end) return v; await new Promise(r=>setTimeout(r,every)); } }
