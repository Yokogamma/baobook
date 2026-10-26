// The Worker (worker/index.js, docs/SYNC-PLAN.md §4.12) in Node, with fetch replaced: /__/auth/* goes to the project's
// firebaseapp.com host with the same method, path, query, headers and body, redirects are handed back to the browser instead of
// being followed, nothing is cached; other /__/ paths are 404; everything else goes to the static assets binding.
import worker from '../worker/index.js';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };

const calls=[]; let answer=()=>new Response('hello',{status:200, headers:{'content-type':'text/html; charset=utf-8'}});
globalThis.fetch=async(url, init)=>{ calls.push({url:String(url), init}); return answer(); };
const assets=[]; const env={ASSETS:{fetch:async req=>{ assets.push(req.url); return new Response('asset',{status:200}); }}};
const run=(path, init)=>worker.fetch(new Request('https://baobook.matamata.dev'+path, init), env);
const last=()=>calls[calls.length-1];

/* ── 1. a GET to the sign-in iframe: the same path and query on the upstream host, no redirect following, no caching ── */
{ const r=await run('/__/auth/iframe?apiKey=k&v=12', {headers:{'accept':'text/html', 'host':'baobook.matamata.dev', 'cf-ray':'x', 'cookie':'a=1'}});
  const c=last();
  ok('1 the request went to https://baobook-3fe7f.firebaseapp.com with the same path and query ('+c.url+')', c.url==='https://baobook-3fe7f.firebaseapp.com/__/auth/iframe?apiKey=k&v=12');
  ok('1b GET, redirects not followed (manual), no body', c.init.method==='GET' && c.init.redirect==='manual' && c.init.body===undefined);
  ok('1c the browser headers pass, this hop\'s own ones do not', c.init.headers.get('accept')==='text/html' && c.init.headers.get('cookie')==='a=1' && !c.init.headers.has('host') && !c.init.headers.has('cf-ray'));
  ok('1d the answer comes back with its status, body and type, and Cache-Control: no-store', r.status===200 && await r.text()==='hello' && r.headers.get('content-type')==='text/html; charset=utf-8' && r.headers.get('cache-control')==='no-store'); }

/* ── 2. a POST with a body (the handler's form posts) ── */
{ await run('/__/auth/handler', {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:'a=1&b=2'});
  const c=last(); const body=await new Response(c.init.body).text();
  ok('2 POST: the method, the content type and the body reach the upstream', c.init.method==='POST' && c.init.headers.get('content-type')==='application/x-www-form-urlencoded' && body==='a=1&b=2'); }

/* ── 3. a redirect from Firebase is handed back as it is ── */
{ answer=()=>new Response(null,{status:302, headers:{'location':'https://accounts.google.com/o/oauth2/auth?x=1', 'set-cookie':'s=1; Path=/'}});
  const r=await run('/__/auth/handler?providerId=google.com');
  ok('3 302 and its Location come back unchanged, the cookie too ('+r.status+' → '+r.headers.get('location')+')', r.status===302 && r.headers.get('location')==='https://accounts.google.com/o/oauth2/auth?x=1' && r.headers.get('set-cookie')==='s=1; Path=/' && r.headers.get('cache-control')==='no-store');
  answer=()=>new Response('hello',{status:200}); }

/* ── 4. the upstream's content-encoding and content-length do not travel with the decoded body ── */
{ answer=()=>new Response('decoded body',{status:200, headers:{'content-encoding':'gzip', 'content-length':'7', 'x-frame-options':'SAMEORIGIN'}});
  const r=await run('/__/auth/iframe.js');
  ok('4 content-encoding and content-length are dropped, other headers stay', !r.headers.has('content-encoding') && !r.headers.has('content-length') && r.headers.get('x-frame-options')==='SAMEORIGIN' && await r.text()==='decoded body');
  answer=()=>new Response('hello',{status:200}); }

/* ── 5. HEAD: no body either way ── */
{ const n=calls.length; const r=await run('/__/auth/iframe', {method:'HEAD'}); const c=last();
  ok('5 HEAD goes upstream as HEAD without a body and answers without one', calls.length===n+1 && c.init.method==='HEAD' && c.init.body===undefined && r.body===null); }

/* ── 6. other /__/ paths are not proxied: 404 without an upstream call ── */
{ const n=calls.length; const a=await run('/__/firebase/init.json'), b=await run('/__/'), c=await run('/__/authx');
  ok('6 /__/firebase/init.json, /__/ and /__/authx answer 404 and call nothing', a.status===404 && b.status===404 && c.status===404 && calls.length===n); }

/* ── 7. everything else is served from the static assets binding ── */
{ const n=calls.length; const r=await run('/index.html'); const r2=await run('/'); const r3=await run('/sync.js?v=1');
  ok('7 /index.html, / and /sync.js go to ASSETS and come back from it', r.status===200 && await r.text()==='asset' && r2.status===200 && r3.status===200 && assets.length===3 && assets[2].endsWith('/sync.js?v=1') && calls.length===n); }
{ const r=await worker.fetch(new Request('https://baobook.matamata.dev/index.html'), {});
  ok('7b without an assets binding (a misconfigured deploy) a page answers 404 instead of throwing', r.status===404); }

console.log(fails? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails? 1 : 0);
