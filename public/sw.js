/* Baobook service worker.
   App shell: network first, cache as the fallback, so updates arrive at once and the app still opens offline.
   Google Fonts: served from cache, refreshed in the background. Notes live in IndexedDB and never pass through here.
   The Firebase SDK (www.gstatic.com/firebasejs/<version>/…, SYNC-PLAN 4.13): cached when first used, not precached; a version
   lives in its path, so a cached file never goes stale. Requests to /__/ (the Firebase Auth pages the Worker proxies) are left alone.
   Cache names carry the app prefix; activate deletes only this app's old caches, because other apps may share the origin. */
const VERSION='v8', PREFIX='baobook-';
const SHELL=PREFIX+'shell-'+VERSION, FONTS=PREFIX+'fonts', SDK=PREFIX+'sdk';
const KEEP=[SHELL, FONTS, SDK];
const PRECACHE=['./','./index.html','./sync.js','./cloud.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./locales/uk.json','./locales/en.json'];

self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(url.origin===location.origin && url.pathname.startsWith('/__/')) return;   // the sign-in pages: straight to the network, never cached, never answered from the shell
  if(req.method!=='GET') return;
  if(url.origin===location.origin){
    // cache:'no-cache': always revalidate with the server (ETag); otherwise a host's HTTP cache can serve the old shell for minutes after a deploy
    e.respondWith(fetch(req,{cache:'no-cache'}).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(SHELL).then(cache=>cache.put(req,c)); } return r; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):undefined))));
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
