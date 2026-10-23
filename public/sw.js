/* Baobook service worker.
   The app shell is kept as one set per build: BUILD here equals BUILD in index.html (tests/appupdate checks it), so every deploy changes
   this file, the browser installs the new worker, and install downloads the whole set of that build (the page, sync.js?b=, cloud.js?b=,
   the language files, the manifest, the icons) into baobook-shell-<BUILD>. Nothing is ever written into a set afterwards, so a set never
   mixes two builds; activate deletes the older sets, and only this app's caches (the 'baobook-' prefix), because other apps may share the origin.
   The page: network first, whole body, at most WAIT; a network that fails, or neither answers nor fails within WAIT (a phone waking up, Wi-Fi
   reconnecting), gets the page of the set instead; the update strip in the page tells about a newer build. A first visit has no set and waits.
   The page's own files carry its build in their address (?b=BUILD): only that exact address answers, from a set or from the network, and
   when neither has it the request fails rather than take a file of another build. So a page and its files are always of one build. build.json (the build on the server) is never
   cached. Google Fonts: served from cache, refreshed in the background. Notes live in IndexedDB and never pass through here.
   The Firebase SDK (www.gstatic.com/firebasejs/<version>/…, SYNC-PLAN 4.13): cached when first used; a version lives in its path, so a
   cached file never goes stale. Requests to /__/ (the Firebase Auth pages the Worker proxies) are left alone. */
const BUILD=2026102302, PREFIX='baobook-', WAIT=5000;
const SHELL=PREFIX+'shell-'+BUILD, FONTS=PREFIX+'fonts', SDK=PREFIX+'sdk';
const KEEP=[SHELL, FONTS, SDK];
const APP=new URL('./', self.registration.scope).href, BUILD_URL=new URL('./build.json', APP).pathname, B='?b='+BUILD;
const PRECACHE=['./','./sync.js'+B,'./cloud.js'+B,'./locales/uk.json'+B,'./locales/en.json'+B,'./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];

// The set is checked before anything is stored: the page must be of this build, and build.json, asked after every file came, must still
// say this build (a deploy in between would mix two builds: the server keeps no older files). cache:'reload' skips the browser's HTTP
// cache. A set that fails any check is not installed, and the previous set stays.
const get=u=>fetch(new Request(u,{cache:'reload'})).then(r=>{ if(!r.ok || r.redirected) throw new Error(u+': '+r.status); return r; });
async function fill(){ const page=await get(PRECACHE[0]), html=await page.clone().text();
  if(+(/<meta name="baobook-build" content="(\d+)">/.exec(html)||[])[1]!==BUILD) throw new Error('the page is of another build');
  const rest=await Promise.all(PRECACHE.slice(1).map(u=>get(u).then(r=>[u,r])));
  const now=await fetch(BUILD_URL,{cache:'no-store'}).then(r=>r.ok && !r.redirected? r.json() : null).then(j=>j? +j.build : 0, ()=>0);   // an error page is no confirmation
  if(now!==BUILD) throw new Error('a deploy during the install');
  const c=await caches.open(SHELL); await c.put(PRECACHE[0], page); for(const [u,r] of rest) await c.put(u, r); }
self.addEventListener('install',e=>{ e.waitUntil(fill().then(()=>self.skipWaiting(), err=>caches.delete(SHELL).then(()=>{ throw err; }))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

const inSet=(key,o)=>caches.match(key,{...o, cacheName:SHELL}).catch(()=>undefined);   // caches.match, not caches.open: an older worker still running must not recreate its deleted set
// the whole body, not only the headers: a body that stalls after the headers still loses to the set
const whole=r=>r.ok && r.type!=='opaqueredirect'? r.arrayBuffer().then(b=>new Response(b,{status:r.status, statusText:r.statusText, headers:r.headers})) : r;
function page(req){ const net=fetch(req,{cache:'no-cache'}).then(whole);
  return new Promise(res=>{ let done=false; const end=r=>{ if(done) return false; done=true; clearTimeout(t); res(r); return true; };
    const t=setTimeout(()=>inSet(APP).then(r=>{ if(r) end(r); }), WAIT);   // no set yet (the first visit): the network is all there is
    net.then(end, ()=>inSet(APP).then(r=>end(r||Response.error()))); }); }

self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(url.origin===location.origin && url.pathname.startsWith('/__/')) return;   // the sign-in pages: straight to the network, never cached, never answered from the shell
  if(req.method!=='GET') return;
  if(url.origin===location.origin){
    if(url.pathname===BUILD_URL) return;
    if(req.mode==='navigate'){ e.respondWith(page(req)); return; }
    if(/^\?b=\d+$/.test(url.search)){ e.respondWith(caches.match(req).then(r=>r||fetch(req)).catch(()=>Response.error())); return; }   // a file of one build: that exact address from a set, else the network; never a file of another build
    e.respondWith(fetch(req,{cache:'no-cache'}).catch(()=>inSet(req,{ignoreSearch:true}).then(r=>r||Response.error())));   // the rest (the manifest, the icons, an older page's files): network first
    return;
  }
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(async cache=>{ const hit=await cache.match(req); const net=fetch(req).then(r=>{ cache.put(req,r.clone()); return r; }).catch(()=>hit); return hit||net; }));
    return;
  }
  if(url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.open(SDK).then(async cache=>{ const hit=await cache.match(req); if(hit) return hit; const r=await fetch(req); if(r.ok) cache.put(req,r.clone()); return r; }));
  }
});
