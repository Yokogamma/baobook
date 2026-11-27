// The page's side of docs/OWNER-ERA-PLAN.md §7.3.4, as small as the Node tests need it: one writer for a screen, at most one runner, and one
// idempotent reconciliation that decides whether there is a runner and which. It gives the tests the calls of the single engine of before (start,
// step, setOwner, setCloud, stop, the user's writes), so a scenario reads the same in both modes. The real page is stage 3; this is its model for
// the core's tests, and `writer` and `runner` are there for the cases that drive the two objects themselves.
//   - the user's writes and reads go to the writer;
//   - setOwner takes the epoch the store has when it is called as the epoch of the decision, unless the test names one;
//   - a test adapter that names no namespace is named for the owner it is connected under (public/cloud.js binds its root the same way);
//   - a runner that ended is replaced at the next reconciliation: after setOwner, start, setCloud, and at a step that finds none alive.
// What it does NOT model, and stage 3's page must have (§7.3.4): the recovery read after a runner ended and when the lead is granted; no loop of new
// runners on a storage error at initialisation (item 6: this model makes one at every step); the lead and its generation; a real adapter, which
// today names `uid` and `root` but no `env` (public/cloud.js), so the page must hand the runner an adapter that names both.
export function eraPage(C, deps){
  const W=C.makeSync(deps); let R=null, cloud=deps.cloud||null, started=false, on=true, busy=null; const ends=[], named=new Map();
  const nameOf=(c, ow)=>{ if(c.uid!==undefined || c.env!==undefined) return c; const k=ow.env+'/'+ow.uid; let m=named.get(c); if(!m){ m=new Map(); named.set(c,m); } if(!m.has(k)) m.set(k, Object.assign(Object.create(c), {uid:ow.uid, env:ow.env})); return m.get(k); };
  const F={writer:W, ends, locked:null, epoch:null, owner:null, get runner(){ return R; }};
  async function once(){ let st; try{ st=await W.ownerNow(); }catch(e){ if(R){ R.end('page'); R=null; } F.locked=e && e.code==='epoch'? 'reload' : 'storage'; return null; }
    F.epoch=st.epoch; F.owner=st.owner;
    if(R && (!R.alive || !started || !cloud || R.epoch!==st.epoch || R._cloud0!==cloud)){ if(R.alive) R.end(!started? 'page' : 'adapter'); R=null; }
    if(!R && started && cloud && st.owner){ let c; try{ c=nameOf(cloud, st.owner); const r=W.runner({epoch:st.epoch, owner:st.owner, cloud:c, onEnd:reason=>ends.push(reason)}); r._cloud0=cloud; R=r; if(!on) r.online(false); await r.start(); }catch(e){ F.lastError=e; } if(R && !R.alive) R=null; }
    return R; }
  const reconcile=()=>{ const p=(busy||Promise.resolve()).then(once, once); busy=p; return p; };   // one at a time: a second call waits for the first and then reads the inputs again
  F.reconcile=reconcile;
  for(const k of ['writeLocal','purgeLocal','unqueue','deviceName','countCopies','copiesCount','restoreCopy','undoRestore','dropCopies','putCopies','purgeOldLocal','importNote','importMany','state','seenAll','lrevOf','versionLocal','versionStates','importHistory','unsynced','typed','left','usedStored','limits']) F[k]=(...a)=>W[k](...a);
  F.setOwner=async(owner, o={})=>{ let exp=o.expectEpoch; if(exp===undefined){ try{ exp=(await W.ownerNow()).epoch; }catch(_){ exp=null; } } const r=await W.setOwner(owner, {...o, expectEpoch:exp}); await reconcile(); return r; };
  F.start=async(o={})=>{ if(o.cloud!==undefined) cloud=o.cloud; started=true; await reconcile(); };
  F.setCloud=async c=>{ cloud=c; await reconcile(); };
  F.stop=()=>{ started=false; if(R){ R.end('page'); R=null; } };
  F.reload=async()=>{ if(R){ R.end('lead'); R=null; } await reconcile(); };
  F.online=v=>{ on=!!v; if(R) R.online(v); };
  F.reconnect=()=>{ if(R) R.reconnect(); };
  F.nudge=()=>{ if(R) R.nudge(); };
  const IDLE=()=>({did:'idle', next:Infinity, status:null});
  F.step=async()=>{ if(!R || !R.alive) await reconcile(); if(!R) return IDLE(); const r=await R.step(); if(r.did==='ended'){ await reconcile(); return {did:'idle', next:R? deps.now() : Infinity, status:r.status}; } return r; };
  F.idle=async(limit=200)=>{ let r; for(let i=0;i<limit;i++){ r=await F.step(); if(r.did==='idle' && !(r.next<=deps.now() && R && R._S.asked)) break; } return r; };
  F.status=()=>R? R.status() : {code:'idle', n:0};
  F.checkOwner=async()=>{ try{ const st=await W.ownerNow(); return !R || R.epoch===st.epoch; }catch(e){ return false; } };
  F.usedToday=()=>R? R.usedToday() : {reads:0, writes:0};
  for(const k of ['jobs','tries','vjobs','vtries']) F[k]=()=>R? R[k]() : [];
  F.inboxSize=()=>R? R.inboxSize() : 0; F.isOnline=()=>on; F.hasOwner=()=>!!F.owner; F.busyMs=()=>W.busyMs();
  Object.defineProperties(F, {log:{get:()=>[...W.log, ...(R? R.log : [])]}, era:{get:()=>W.era}, devId:{get:()=>W.devId}, devName:{get:()=>W.devName}, _S:{get:()=>R? R._S : null}});
  return F; }
