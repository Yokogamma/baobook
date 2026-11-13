// Security headers (public/_headers, applied by tests/lib/server.mjs as Cloudflare applies them): every static file carries them; the paths
// under /__/ (the Worker's sign-in pages, which the sign-in iframe must be able to show) and the file itself do not; no page, of another
// origin or of the app's own, can frame the app; the app starts with no policy violation; a page the service worker answers, also offline,
// keeps them.
//   node tests/appheaders.mjs                    the local scenario
//   node tests/appheaders.mjs --live <site>      only the header checks, against a deployed site (after a merge, before a release)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve, CTX } from './lib/server.mjs';
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const live=process.argv.includes('--live')? process.argv[process.argv.indexOf('--live')+1] : null;

// the values are spelled out here, not read from public/_headers, so a change of the file has to change this test too. The enforced CSP has
// no script-src and no default-src: a policy for scripts goes out report-only first
const csp=v=>Object.fromEntries(String(v||'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>{ const [k,...a]=s.split(/\s+/); return [k.toLowerCase(), a.join(' ')]; }));
const secure=get=>{ const c=csp(get('content-security-policy')), pp=String(get('permissions-policy')||'');
  return get('x-content-type-options')==='nosniff' && get('x-frame-options')==='DENY' && get('referrer-policy')==='strict-origin-when-cross-origin'
    && c['frame-ancestors']==="'none'" && c['object-src']==="'none'" && c['base-uri']==="'none'" && !('script-src' in c) && !('default-src' in c)
    && ['camera','microphone','geolocation','payment','usb'].every(f=>pp.includes(f+'=()')); };
const framable=get=>!get('x-frame-options') && csp(get('content-security-policy'))['frame-ancestors']!=="'none'";
const H=r=>k=>r.headers.get(k);

// the header checks over HTTP, the same for the local server and a deployed site: the files of one build, the sign-in pages, the file itself
async function headers(base, build){
  // the page as '/': Cloudflare answers /index.html with its own 307, which is not a file
  const files=['', 'sw.js', 'build.json', 'manifest.webmanifest', 'icon.svg', 'sync.js?b='+build, 'cloud.js?b='+build, 'locales/uk.json?b='+build, 'account/model.js?b='+build];
  const bad=[]; for(const f of files){ const r=await fetch(base+f, {redirect:'manual'}); if(r.status!==200 || !secure(H(r))) bad.push('/'+f+' '+r.status); }
  ok('1 every static file of the build carries the headers ('+files.length+' files'+(bad.length? '; not: '+bad.join(', ') : '')+')', !bad.length);
  const auth=await fetch(base+'__/auth/iframe?apiKey=k', {redirect:'manual'});
  ok('2 /__/auth/iframe (the Worker\'s, framed by the sign-in) has no X-Frame-Options and no frame-ancestors \'none\' ('+auth.status+')', framable(H(auth)));
  const self=await fetch(base+'_headers', {redirect:'manual'});
  ok('3 /_headers is not served ('+self.status+')', self.status===404);
}

if(live){
  const base=live.endsWith('/')? live : live+'/';
  const build=(await (await fetch(base+'build.json', {cache:'no-store'})).json()).build;
  console.log('· '+base+' build '+build); await headers(base, build);
  process.exit(fails?1:0);
}

const BUILD=/const BUILD=(\d+)/.exec(fs.readFileSync(new URL('../public/index.html', import.meta.url),'utf8'))[1];
const site=await serve(), other=await serve();   // two ports: two origins
await headers(site.url, BUILD);

const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage();
const errs=[], noise=[]; pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
pg.on('console',m=>{ if(/Permissions-Policy|Unrecognized feature|Content.Security.Policy|X-Frame-Options|frame-ancestors/i.test(m.text())) noise.push(m.type()+': '+m.text()); });
await ctx.addInitScript(()=>{ window.__csp=[]; document.addEventListener('securitypolicyviolation', e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI)); });

// a normal start under the headers: the page as the network gives it, a note typed, nothing violated and nothing reported about the policies
{ const r=await pg.goto(site.url); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  await pg.mouse.click(500,300); await pg.keyboard.type('нотатка під заголовками'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  const camera=await pg.evaluate(()=>{ const p=document.permissionsPolicy||document.featurePolicy; return p? p.allowsFeature('camera') : null; });
  const v=await pg.evaluate(()=>window.__csp);
  ok('4 the app starts under the headers: the page carries them, the note is typed, no securitypolicyviolation ('+v.length+'), nothing in the console about the policies ('+noise.length+'), the camera is off ('+camera+')',
    secure(k=>r.headers()[k]??null) && await pg.locator('.blk .txt').filter({hasText:'нотатка під заголовками'}).count()===1 && !v.length && !noise.length && camera===false); }

// the service worker answers the page from then on (network first): its response keeps the headers
{ await pg.evaluate(()=>navigator.serviceWorker.ready); await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  const r=await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  ok('5 the page the service worker answers keeps the headers', r.fromServiceWorker() && secure(k=>r.headers()[k]??null)); }

// framing: a page of another origin frames the app and, as a control that the check can see a loaded frame, a page under /__/ of the app's
// origin; then a page of the app's own origin frames the app. The app's frame stays empty (the browser's error page); the control loads
const shown=async(pgx, id, sel)=>{ const f=await (await pgx.$('#'+id)).contentFrame(); try{ return !!(f && await f.$(sel)); }catch{ return false; } };
site.override.set('/__/frame-ok.html', '<!doctype html><p id="ok">ok</p>');
other.override.set('/frame.html', '<!doctype html><iframe id="app" src="'+site.url+'"></iframe><iframe id="own" src="'+site.url+'__/frame-ok.html"></iframe>');
site.override.set('/frame-self.html', '<!doctype html><iframe id="app" src="/"></iframe>');
{ const p2=await ctx.newPage(); await p2.goto(other.url+'frame.html'); await p2.waitForLoadState('load'); await p2.waitForTimeout(300);
  const app=await shown(p2,'app','#sheet'), own=await shown(p2,'own','#ok');
  await p2.goto(site.url+'frame-self.html'); await p2.waitForLoadState('load'); await p2.waitForTimeout(300); const self=await shown(p2,'app','#sheet');
  ok('6 no page can frame the app: another origin ('+(app?'shown':'refused')+'), the app\'s own origin ('+(self?'shown':'refused')+'); the control under /__/ loads in a frame ('+(own?'shown':'empty')+')', !app && !self && own);
  await p2.close(); }

// offline: the page comes from the service worker's set, with the headers it was stored with
await site.close(); await other.close();
{ const r=await pg.reload(); await pg.waitForSelector('html[data-ready]',{state:'attached',timeout:10000});
  ok('7 offline, the page from the service worker\'s set still carries the headers', r.fromServiceWorker() && secure(k=>r.headers()[k]??null)); }

console.log(errs.length? errs.join('\n') : '✓ no page errors'); if(errs.length) fails++;
await ctx.close(); await br.close(); process.exit(fails?1:0);
