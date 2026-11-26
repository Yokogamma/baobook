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

// public/_headers as Cloudflare applies it to static files (developers.cloudflare.com/workers/static-assets/headers/). A block is a URL
// pattern (`*` any run of characters, `:name` one path segment) and indented `Name: value` lines; a request gets the headers of every
// block it matches, in file order, and a name given twice is joined with ', '. Paths under /__/ are the Worker's (wrangler.jsonc
// run_worker_first), which the file does not reach, and the file itself is never served. A line of any other form throws, so the file
// cannot say more than this reads. Returns path → headers.
export function readHeaders(text){
  const rules=[]; let cur=null;
  for(const [i,line] of text.split(/\r?\n/).entries()){
    const t=line.trim(); if(!t || t.startsWith('#')) continue;
    if(!/^\s/.test(line)){ cur={re:new RegExp('^'+t.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/:[A-Za-z]\w*/g,'[^/]+')+'$'), set:[]}; rules.push(cur); continue; }
    const m=/^([A-Za-z0-9-]+):\s*(\S.*)$/.exec(t); if(!cur || !m) throw new Error('_headers line '+(i+1)+': '+t); cur.set.push([m[1], m[2]]);
  }
  return p=>{ const out={}; if(p.startsWith('/__/')) return out;
    for(const r of rules) if(r.re.test(p)) for(const [k,v] of r.set){ const key=Object.keys(out).find(x=>x.toLowerCase()===k.toLowerCase())??k; out[key]=key in out? out[key]+', '+v : v; }
    return out; };
}
const HEADERS=path.join(ROOT,'_headers');

// override: path → string (serve this body instead of the file) or null (answer 404); redirect: path as requested (before '/' becomes
// '/index.html') → location, answered with 307 as Cloudflare answers /index.html; delay: path → ms before the answer starts (a network that
// neither answers nor fails); stall: path → ms between the headers and the body; hits: path → request count
export async function serve({host='127.0.0.1', port=0}={}){
  const override=new Map(), redirect=new Map(), delay=new Map(), stall=new Map(), hits=new Map();
  const extra=fs.existsSync(HEADERS)? readHeaders(fs.readFileSync(HEADERS,'utf8')) : ()=>({});   // read once per server, as a deploy carries one file
  const srv=http.createServer((req,res)=>{
    const asked=decodeURIComponent(new URL(req.url,'http://x').pathname); let p=asked;
    if(redirect.has(p)){ hits.set(p,(hits.get(p)||0)+1); res.writeHead(307,{Location:redirect.get(p)}); res.end(); return; }
    if(p.endsWith('/')) p+='index.html';
    hits.set(p,(hits.get(p)||0)+1);
    if(delay.has(p)){ const ms=delay.get(p); setTimeout(()=>answer(p,res,asked), ms); return; }
    answer(p,res,asked);
  });
  const answer=(p,res,asked)=>{
    const sec=extra(asked), head={'Content-Type':TYPES[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache', ...sec};   // _headers matches the path as asked: '/' before it becomes /index.html
    if(stall.has(p) && (override.get(p)!==null)){ const f=path.join(ROOT,p), body=override.has(p)? override.get(p) : fs.existsSync(f)? fs.readFileSync(f) : null;
      if(body!==null){ res.writeHead(200,head); res.flushHeaders(); setTimeout(()=>res.end(body), stall.get(p)); return; } }
    if(override.has(p)){ const body=override.get(p); if(body===null){ res.writeHead(404, sec); res.end(); } else { res.writeHead(200,head); res.end(body); } return; }
    const f=path.join(ROOT,p);
    if(p==='/_headers' || !f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404, sec); res.end(); return; }
    res.writeHead(200,head); fs.createReadStream(f).pipe(res);
  };
  await new Promise(r=>srv.listen(port,host,r));
  return { url:`http://${host}:${srv.address().port}/`, override, redirect, delay, stall, hits,
    close:()=>new Promise(r=>{ srv.closeAllConnections(); srv.close(()=>r()); }) };
}
