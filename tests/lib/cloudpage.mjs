// The test cloud for browser scenarios: one TestCloud in Node, shared by every browser context (every «device») through
// context.exposeBinding. A function cannot cross the binding, so the page-side adapter splits the cloud transaction in two calls
// (txnBegin reads, txnCommit writes if the revision did not move, else the callback runs again, as the Firestore SDK retries), runs
// the engine's callback in the page, and polls the listener (the contract allows a listener that falls back to polling). Errors cross
// as {error:{code}} and are rethrown with their code in the page.
export async function attachCloud(context, cloud, dev){
  const tokens=new Map(); let seq=0; const o={dev};
  const api={
    get:(col,id)=>cloud.get(col,id,o), page:(col,q,n)=>cloud.page(col,q,n,o), totals:col=>cloud.totals(col,o), scan:(col,q,n)=>cloud.scan(col,q,n,o),
    txnBegin:async(col,id)=>{ cloud.fails(dev,'txn'); const D=await cloud.get(col,id); const token='t'+(++seq); tokens.set(token,{col,id,rev:D? D.rev : 0, at:cloud.now()}); return {token, D}; },
    txnCommit:async(token,w)=>{ const t=tokens.get(token); tokens.delete(token); if(!t) throw Object.assign(new Error('token expired'),{code:'aborted'});
      const h=cloud.take('hold',dev,'txn'); if(h) await h.promise;   // the `hold` fault: the page's transaction stays in flight until the scenario lets go; the re-read below then sees what landed meanwhile
      const D=await cloud.get(t.col,t.id); if((D? D.rev : 0)!==t.rev) return {ok:false, contention:true};
      // the commit goes through the real txn so every fault and check applies; the callback just returns what the page decided
      const r=await cloud.txn(t.col, t.id, ()=>w, o); return {ok:true, read:r.read, wrote:r.wrote}; },
    listen:(col,from)=>{ const id='l'+(++seq); const sub={col, from, batches:[]}; sub.unsub=cloud.listen(col, from, (docs,info)=>sub.batches.push({docs, info}), ()=>{}, o); subs.set(id,sub); return id; },
    poll:(id)=>{ const sub=subs.get(id); if(!sub) return null; const b=sub.batches; sub.batches=[]; return b; },
    unlisten:(id)=>{ const sub=subs.get(id); if(sub){ sub.unsub(); subs.delete(id); } return true; } };
  const subs=new Map();
  await context.exposeBinding('__cloudCall', async(_src, method, args)=>{ try{ return {value: await api[method](...(args||[]))}; }catch(e){ return {error:{code:(e && e.code)||'unavailable', message:(e && e.message)||String(e)}}; } });
  await context.addInitScript(()=>{
    const call=async(m,...a)=>{ const r=await window.__cloudCall(m,a); if(r.error){ const e=new Error(r.error.message); e.code=r.error.code; throw e; } return r.value; };
    window.__cloud={ get:(c,i)=>call('get',c,i), page:(c,q,n)=>call('page',c,q,n), totals:c=>call('totals',c), scan:(c,q,n)=>call('scan',c,q,n),
      async txn(col,id,fn){ for(let i=0;i<5;i++){ const {token,D}=await call('txnBegin',col,id); const w=fn(D); const r=await call('txnCommit',token,w); if(r.ok) return {read:D, wrote:r.wrote}; } const e=new Error('contention'); e.code='aborted'; throw e; },
      listen(col,from,onDocs,onErr){ let live=true, id=null; (async()=>{ try{ id=await call('listen',col,from); }catch(e){ onErr(e); return; } while(live){ let batches=null; try{ batches=await call('poll',id); }catch(e){ onErr(e); return; } if(batches===null){ onErr(Object.assign(new Error('gone'),{code:'unavailable'})); return; } for(const b of batches) if(live) onDocs(b.docs, b.info); await new Promise(r=>setTimeout(r,100)); } })(); return ()=>{ live=false; if(id) call('unlisten',id).catch(()=>{}); }; } }; });
  return api; }
// connect a page as a device: the hook writes the owner and starts the engine with the shared cloud
export async function connect(page, o={}){ return page.evaluate(o=>sheetDebug.sync.connect({cloud:window.__cloud, owner:o.owner||{env:'test', uid:'u1', email:'u@test'}, user:o.user, devId:o.devId, devName:o.devName, budgets:o.budgets||{reads:1e6, writes:1e6}, pace:o.pace||{dev:0, note:0, big:0, huge:0, slow:0}}), o); }   // user: a signed-in account for the status button (appaccount), without Firebase
// drive the engine until it is idle; the test cloud's listener is polled every 100 ms, so give deliveries a moment first
export async function settle(page, ms=250){ await page.waitForTimeout(ms); return page.evaluate(()=>sheetDebug.sync.idle(300)); }
// a browser «device»: its own context (own storage), the shared cloud attached, the app loaded and connected
export async function newDevice(br, cloud, SITE, name, o={}){ const ctx=await br.newContext({...(o.ctx||{}), viewport:{width:1280,height:900}}); await attachCloud(ctx, cloud, name); if(o.init) await ctx.addInitScript(o.init); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(name+': '+e.message));
  await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await pg.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout:10000}); await pg.waitForTimeout(200);
  if(o.connect!==false) await connect(pg,{devId:name, devName:'Device '+name, ...(o.connect||{})}); return {ctx, pg, name, errs, close:()=>ctx.close()}; }
// a second tab of the same device: the same context (its storage, its locks, the cloud bridge), connected with the same device id; it leads only once the first lets go
export async function newTab(dev, SITE, o={}){ const pg=await dev.ctx.newPage(); pg.on('pageerror',e=>dev.errs.push(dev.name+' tab: '+e.message)); await pg.goto(SITE); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000}); await pg.waitForFunction(()=>document.querySelectorAll('#list .item').length>0,null,{timeout:10000}); await pg.waitForTimeout(200);
  if(o.connect!==false) await connect(pg,{devId:dev.name, devName:'Device '+dev.name, ...(o.connect||{})}); return pg; }
export const lead=pg=>pg.evaluate(()=>sheetDebug.sync.lead());
export const locks=pg=>pg.evaluate(()=>navigator.locks.query().then(q=>({held:q.held.map(l=>l.name), pending:q.pending.map(l=>l.name)})));
// what the device stores
export const stored=(pg,store,id)=>pg.evaluate(([store,id])=>new Promise(res=>{ const r=indexedDB.open('sheet'); r.onsuccess=()=>{ const d=r.result; try{ const t=d.transaction(store,'readonly').objectStore(store); const q=id===undefined? t.getAll() : t.get(id); q.onsuccess=()=>{ d.close(); res(q.result); }; q.onerror=()=>{ d.close(); res(null); }; }catch(_){ d.close(); res(null); } }; r.onerror=()=>res(null); }), [store,id]);
export const syncRecs=async(pg,prefix)=>(await stored(pg,'sync')).filter(r=>r.k.startsWith(prefix));
// type into a new block at (x, y) and leave it
export async function typeAt(pg,x,y,text){ await pg.bringToFront(); await pg.mouse.click(x,y); await pg.waitForFunction(()=>!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#sheet .blk')),null,{timeout:3000}); await pg.keyboard.type(text); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500); }
export const openNote=(pg,id)=>pg.evaluate(id=>{ const d=document.querySelector('#list .item[data-id="'+id+'"]'); if(d) d.click(); return !!d; }, id).then(ok=>pg.waitForTimeout(250).then(()=>ok));
export const curId=pg=>pg.evaluate(()=>sheetDebug.cur());
// a note written by another device straight into the cloud, from a body
export function cloudWrite(cloud, id, body, o={}){ return cloud.write('notes', {id, title:'', created:cloud.now(), updated:cloud.now(), blocks:[], ...body}, {dev:o.dev||'phone', dn:o.dn||'Телефон', ...o}); }
