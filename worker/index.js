/* The Baobook Worker (docs/SYNC-PLAN.md §4.12). The site itself is static: Cloudflare serves public/ as Workers Static Assets and
   only paths under /__/ reach this script (wrangler.jsonc: assets.run_worker_first ["/__/*"]).

   /__/auth/* is proxied to the Firebase Auth helper pages of the project, transparently: the request goes out with the same
   method, path, query, headers and body, and the answer comes back as it is, redirects included (they are for the browser, never
   followed here), with no caching. That lets `authDomain` be the site's own host, so the sign-in popup and the redirect handler run
   on the site's origin, which Safari's and Chrome's storage partitioning require. Any other path under /__/ is not ours (Hosting's
   /__/firebase/init.json among them): 404. */
const PROJECT='baobook-3fe7f';
const UPSTREAM='https://'+PROJECT+'.firebaseapp.com';
// headers that belong to this hop, not to the request we make upstream (Host is set by fetch from the target URL)
const HOP=['host','cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','cf-worker','x-forwarded-proto','x-forwarded-for','x-real-ip'];

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/__/')) return env && env.ASSETS? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
    if(!url.pathname.startsWith('/__/auth/')) return new Response('Not found',{status:404});
    const headers=new Headers(request.headers); for(const h of HOP) headers.delete(h);
    const init={method:request.method, headers, redirect:'manual'};
    if(request.method!=='GET' && request.method!=='HEAD'){ init.body=request.body; init.duplex='half'; }   // duplex: what Node needs for a streamed body; the Workers runtime ignores it
    const up=await fetch(UPSTREAM+url.pathname+url.search, init);
    const out=new Headers(up.headers);
    out.delete('content-encoding'); out.delete('content-length');   // the body below is the decoded stream; the edge compresses it again on the way out
    out.set('cache-control','no-store');
    return new Response(request.method==='HEAD'? null : up.body, {status:up.status, statusText:up.statusText, headers:out});
  }
};
