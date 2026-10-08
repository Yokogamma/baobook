/* Baobook service worker.
   App shell: network first, cache as the fallback, so updates arrive at once and the app still opens offline.
   Google Fonts: served from cache, refreshed in the background. Notes live in IndexedDB and never pass through here.
   Cache names carry the app prefix; activate deletes only this app's old caches, because other apps may share the origin. */
const VERSION='v6', PREFIX='baobook-';
const SHELL=PREFIX+'shell-'+VERSION, FONTS=PREFIX+'fonts';
const PRECACHE=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./locales/uk.json','./locales/en.json'];

self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==SHELL&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // cache:'no-cache': always revalidate with the server (ETag); otherwise a host's HTTP cache can serve the old shell for minutes after a deploy
    e.respondWith(fetch(req,{cache:'no-cache'}).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(SHELL).then(cache=>cache.put(req,c)); } return r; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):undefined))));
    return;
  }
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(async cache=>{ const hit=await cache.match(req); const net=fetch(req).then(r=>{ cache.put(req,r.clone()); return r; }).catch(()=>hit); return hit||net; }));
  }
});
