// Tiny static server over public/ for scenarios that need a real origin: service worker, offline, moving between sites.
// Every server gets its own port, and a different port is a different origin with its own storage.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=fileURLToPath(new URL('../../public/', import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.css':'text/css; charset=utf-8'};

// Browser context options for every scenario: the checks read Ukrainian UI strings, so the browser language is
// pinned to Ukrainian; scenarios that copy and paste read the clipboard, which an http origin must be granted.
export const CTX={locale:'uk-UA', permissions:['clipboard-read','clipboard-write']};

// override: path → string (serve this body instead of the file) or null (answer 404); redirect: path as requested (before '/' becomes
// '/index.html') → location, answered with 307 as Cloudflare answers /index.html; delay: path → ms before the answer starts (a network that
// neither answers nor fails); stall: path → ms between the headers and the body; hits: path → request count
export async function serve({host='127.0.0.1', port=0}={}){
  const override=new Map(), redirect=new Map(), delay=new Map(), stall=new Map(), hits=new Map();
  const srv=http.createServer((req,res)=>{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(redirect.has(p)){ hits.set(p,(hits.get(p)||0)+1); res.writeHead(307,{Location:redirect.get(p)}); res.end(); return; }
    if(p.endsWith('/')) p+='index.html';
    hits.set(p,(hits.get(p)||0)+1);
    if(delay.has(p)){ const ms=delay.get(p); setTimeout(()=>answer(p,res), ms); return; }
    answer(p,res);
  });
  const answer=(p,res)=>{
    const head={'Content-Type':TYPES[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache'};
    if(stall.has(p) && (override.get(p)!==null)){ const f=path.join(ROOT,p), body=override.has(p)? override.get(p) : fs.existsSync(f)? fs.readFileSync(f) : null;
      if(body!==null){ res.writeHead(200,head); res.flushHeaders(); setTimeout(()=>res.end(body), stall.get(p)); return; } }
    if(override.has(p)){ const body=override.get(p); if(body===null){ res.writeHead(404); res.end(); } else { res.writeHead(200,head); res.end(body); } return; }
    const f=path.join(ROOT,p);
    if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200,head); fs.createReadStream(f).pipe(res);
  };
  await new Promise(r=>srv.listen(port,host,r));
  return { url:`http://${host}:${srv.address().port}/`, override, redirect, delay, stall, hits,
    close:()=>new Promise(r=>{ srv.closeAllConnections(); srv.close(()=>r()); }) };
}
