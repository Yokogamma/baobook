// Helpers for the scenarios on the Firebase emulators (Auth on 127.0.0.1:9099, Firestore on 127.0.0.1:8080, firebase.json at the root)
// under the demo project id, so no request can reach the real project. Everything the Node side needs is REST: the emulators' own
// endpoints and the Firestore REST API with the emulator's owner token, so the scenarios need no firebase package in Node. The browser
// side loads the SDK the way the app does, from www.gstatic.com/firebasejs/<version>/, but through a route that serves the three
// files from a local cache (downloaded once with curl), and every other request to Google hosts is aborted and counted.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT='demo-baobook', AUTH='http://127.0.0.1:9099', FIRESTORE='http://127.0.0.1:8080', SDK_VER='12.19.0';
export const SDK_BASE='https://www.gstatic.com/firebasejs/'+SDK_VER+'/';
const ROOT=fileURLToPath(new URL('../../../', import.meta.url));
const DOCS=FIRESTORE+'/v1/projects/'+PROJECT+'/databases/(default)/documents/';

async function call(method, url, body, headers={}){ const r=await fetch(url, {method, headers:{'content-type':'application/json', ...headers}, body: body===undefined? undefined : JSON.stringify(body)});
  const text=await r.text(); if(!r.ok) throw new Error(method+' '+url+' → '+r.status+' '+text.slice(0,300)); return text? JSON.parse(text) : null; }

// the emulators' state
export const clearAuth=()=>call('DELETE', AUTH+'/emulator/v1/projects/'+PROJECT+'/accounts');
export const clearFirestore=()=>call('DELETE', FIRESTORE+'/emulator/v1/projects/'+PROJECT+'/databases/(default)/documents');
// the rules of the repository with these uids in the access list (the placeholder 'OWNER_UID' until PR 3c, the owner's uid after it)
export function rulesFor(...uids){ const src=fs.readFileSync(path.join(ROOT,'firestore.rules'),'utf8'); const list=/(request\.auth\.uid in \[)[^\]]*(\])/g; if((src.match(list)||[]).length!==1) throw new Error('firestore.rules: one access list expected'); return src.replace(list, (m,a,b)=>a+uids.map(u=>`'${u}'`).join(', ')+b); }
export const loadRules=content=>call('PUT', FIRESTORE+'/emulator/v1/projects/'+PROJECT+':securityRules', {rules:{files:[{content}]}});
// a Google user of the Auth emulator from a fake id token: `sub` is the key the emulator maps to one account; the uid (localId) is the emulator's own
export async function googleUser(sub, email){ const r=await call('POST', AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key',
    {postBody:'id_token='+encodeURIComponent(JSON.stringify({sub, email, email_verified:true}))+'&providerId=google.com', requestUri:'http://localhost', returnSecureToken:true, returnIdpCredential:true});
  return {uid:r.localId, email:r.email||email, sub}; }
export const credential=(sub, email)=>JSON.stringify({sub, email, email_verified:true});   // what the browser passes to GoogleAuthProvider.credential()

// documents past the rules (the emulator's owner token): a Firestore REST write of plain values; Ts() marks a timestamp
export class Ts{ constructor(s, ns=0){ this.s=s; this.ns=ns; } static ms(ms){ return new Ts(Math.floor(ms/1000), (ms%1000)*1e6); } }
const rfc=t=>new Date(t.s*1000).toISOString().slice(0,19)+'.'+String(t.ns).padStart(9,'0')+'Z';
function value(v){ if(v===null || v===undefined) return {nullValue:null}; if(v instanceof Ts) return {timestampValue:rfc(v)}; if(typeof v==='boolean') return {booleanValue:v};
  if(typeof v==='number') return Number.isInteger(v)? {integerValue:String(v)} : {doubleValue:v}; if(typeof v==='string') return {stringValue:v};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(value)}}; return {mapValue:{fields:fieldsOf(v)}}; }
const fieldsOf=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined).map(([k,v])=>[k,value(v)]));
export const seed=(docPath, data)=>call('PATCH', DOCS+docPath, {fields:fieldsOf(data)}, {authorization:'Bearer owner'});
function plain(v){ if('stringValue' in v) return v.stringValue; if('integerValue' in v) return +v.integerValue; if('doubleValue' in v) return v.doubleValue; if('booleanValue' in v) return v.booleanValue; if('nullValue' in v) return null;
  if('timestampValue' in v){ const m=/^(.*?)(?:\.(\d+))?Z$/.exec(v.timestampValue); return new Ts(Math.floor(Date.parse(m[1]+'Z')/1000), +(m[2]||'').padEnd(9,'0')); } if('arrayValue' in v) return (v.arrayValue.values||[]).map(plain); return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,plain(x)])); }
export async function readDoc(docPath){ try{ const r=await call('GET', DOCS+docPath, undefined, {authorization:'Bearer owner'}); return Object.fromEntries(Object.entries(r.fields||{}).map(([k,v])=>[k,plain(v)])); }catch(e){ if(/404/.test(e.message)) return null; throw e; } }

// the SDK files, downloaded once into tests/emu/.sdk/<version>/ (gitignored; CI caches the folder)
export function sdkFiles(ver=SDK_VER){ const dir=path.join(ROOT,'tests','emu','.sdk',ver); fs.mkdirSync(dir,{recursive:true}); const files={};
  for(const f of ['firebase-app.js','firebase-auth.js','firebase-firestore.js']){ const p=path.join(dir,f); if(!fs.existsSync(p) || !fs.statSync(p).size){ execFileSync('curl', ['-sSfL','--retry','3','-o',p,'https://www.gstatic.com/firebasejs/'+ver+'/'+f]); } files[f]=p; }
  return files; }
// the routes of a browser context: the SDK from the cache, every other Google host aborted and counted (`blocked`)
export async function routeSdk(context, o={}){ const files=sdkFiles(o.ver||SDK_VER), blocked=[];
  for(const pat of ['https://*.googleapis.com/**','https://*.firebaseapp.com/**','https://*.google.com/**','https://*.gstatic.com/**','https://*.firebaseio.com/**','https://*.firebase.com/**']) await context.route(pat, r=>{ blocked.push(r.request().url()); r.abort(); });
  for(const pat of ['https://fonts.googleapis.com/**','https://fonts.gstatic.com/**']) await context.route(pat, r=>r.fulfill({status:200, contentType:'text/css', body:''}));   // the app's fonts: not Firebase, answered empty so the scenario never waits on them
  await context.route('https://www.gstatic.com/firebasejs/**', r=>{ const name=path.basename(new URL(r.request().url()).pathname), p=files[name];
    if(!p || !new URL(r.request().url()).pathname.startsWith('/firebasejs/'+(o.ver||SDK_VER)+'/')){ blocked.push(r.request().url()); return r.abort(); }
    r.fulfill({status:200, contentType:'text/javascript; charset=utf-8', headers:{'access-control-allow-origin':'*', 'cache-control':'no-store'}, body:fs.readFileSync(p)}); });
  return blocked; }
