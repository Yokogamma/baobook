/* Чистий аркуш — service worker.
   Оболонка застосунку: мережа спершу, кеш як запасний варіант (щоб оновлення приходили одразу, а без мережі все відкривалось).
   Шрифти Google: з кешу, оновлення у фоні. Дані нотаток у localStorage — сюди не потрапляють. */
const VERSION='v2';
const SHELL='sheet-shell-'+VERSION, FONTS='sheet-fonts';
const PRECACHE=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];

self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL&&k!==FONTS).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    e.respondWith(fetch(req).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(SHELL).then(cache=>cache.put(req,c)); } return r; })
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):undefined))));
    return;
  }
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(async cache=>{ const hit=await cache.match(req); const net=fetch(req).then(r=>{ cache.put(req,r.clone()); return r; }).catch(()=>hit); return hit||net; }));
  }
});
