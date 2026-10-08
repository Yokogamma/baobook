// Localization: UI strings come only from public/locales/*.json, every key the code asks for exists, plurals and parameters work.
import { chromium } from 'playwright';
import { serve, CTX } from './lib/server.mjs';
import fs from 'node:fs';
const SITE=(await serve()).url;
const br=await chromium.launch(process.env.CHROMIUM? {executablePath:process.env.CHROMIUM} : fs.existsSync('/opt/pw-browsers/chromium')? {executablePath:'/opt/pw-browsers/chromium'} : {});
let fails=0; const ok=(n,c)=>{ if(!c) fails++; console.log((c?'✓ ':'✗ ')+n); };
const read=p=>fs.readFileSync(new URL('../public/'+p, import.meta.url),'utf8');
const html=read('index.html'), sw=read('sw.js');
const LOCALES=fs.readdirSync(new URL('../public/locales/', import.meta.url)).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5));
const dict=Object.fromEntries(LOCALES.map(l=>[l, JSON.parse(read('locales/'+l+'.json'))]));
const CYR=/[А-Яа-яІіЇїЄєҐґʼ]/;

// Tiny JS scanner: yields string, template and regex literals, skipping comments (same heuristic as the review tooling).
function literals(src){
  const out=[]; let i=0, prev='';
  while(i<src.length){
    const c=src[i];
    if(src.startsWith('//',i)){ const j=src.indexOf('\n',i); i=j<0? src.length : j; continue; }
    if(src.startsWith('/*',i)){ const j=src.indexOf('*/',i+2); i=j<0? src.length : j+2; continue; }
    if(c==="'"||c==='"'||c==='`'){ let j=i+1; while(j<src.length && src[j]!==c) j+= src[j]==='\\'? 2 : 1; out.push({at:i, text:src.slice(i,j+1)}); i=j+1; prev='x'; continue; }
    if(c==='/' && (prev===''||'(,=:[!&|?{};+-*%<>~^'.includes(prev))){ let j=i+1, cls=false; while(j<src.length && (src[j]!=='/'||cls)){ if(src[j]==='\\'){ j+=2; continue; } if(src[j]==='[') cls=true; else if(src[j]===']') cls=false; j++; } out.push({at:i, text:src.slice(i,j+1), regex:true}); i=j+1; prev='x'; continue; }
    if(/[A-Za-z_$]/.test(c)){ const w=/^[A-Za-z_$][\w$]*/.exec(src.slice(i))[0]; prev=['return','typeof','case','of','in'].includes(w)? '(' : 'x'; i+=w.length; continue; }
    if(!/\s/.test(c)) prev=/[\w$]/.test(c)? 'x' : c;
    i++;
  }
  return out;
}
const script=html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
const markup=html.slice(0, html.indexOf('<script>')).replace(/<!--[\s\S]*?-->/g,'').replace(/\/\*[\s\S]*?\*\//g,'');

// 1. no UI text left in code or markup
const cyrLits=literals(script).filter(l=>CYR.test(l.text)).map(l=>l.text);
ok('1 no Cyrillic string literals in the app code ('+(cyrLits.slice(0,3).join(' | ')||'none')+')', cyrLits.length===0);
ok('1b no Cyrillic in markup and CSS outside comments', !CYR.test(markup));
ok('1c no Cyrillic literals in the service worker', !literals(sw).some(l=>CYR.test(l.text)));

// 2. keys: everything the code and markup ask for exists in every language file, and nothing in the files is unused
const used=new Set();
for(const m of script.matchAll(/\bloc(?:A)?\(/g)){ let d=0, j=m.index+m[0].length-1, k=j; for(;k<script.length;k++){ const ch=script[k]; if(ch==="'"){ const e=script.indexOf("'",k+1); const s=script.slice(k+1,e); if(/^[a-z][\w]*(\.[\w]+)+$/.test(s)) used.add(s); k=e; continue; } if(ch==='(') d++; else if(ch===')'){ d--; if(!d) break; } } }
for(const m of markup.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
for(const m of markup.matchAll(/data-i18n-attr="([^"]+)"/g)) for(const pair of m[1].split(';')) used.add(pair.split(':')[1]);
used.add('code.lang.autoMark');   // set as a CSS variable by localize()
for(const l of LOCALES){
  const keys=new Set(Object.keys(dict[l]).filter(k=>!k.startsWith('_')));
  const missing=[...used].filter(k=>!keys.has(k)), unused=[...keys].filter(k=>!used.has(k));
  ok('2 '+l+'.json has all '+used.size+' keys the app uses'+(missing.length? ' — missing: '+missing.join(', ') : ''), !missing.length);
  ok('2b '+l+'.json has no unused keys'+(unused.length? ' — unused: '+unused.join(', ') : ''), !unused.length);
}

// 3. in the browser: Ukrainian UI exactly as before, plurals by Intl.PluralRules, parameters, fallback
{ const ctx=await br.newContext({...CTX, viewport:{width:1280,height:900}}); const pg=await ctx.newPage(); const warns=[], errs=[];
  pg.on('console',m=>{ if(/i18n/.test(m.text())) warns.push(m.text()); }); pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(SITE); await pg.waitForTimeout(500);
  const st=await pg.evaluate(()=>({lang:document.documentElement.lang, ready:document.documentElement.hasAttribute('data-ready'), tagline:document.querySelector('.brand small').textContent,
    newBtn:document.getElementById('newBtn').textContent.trim(), ph:document.getElementById('q').placeholder, retry:document.getElementById('saveRetry').textContent,
    ttl:document.getElementById('ttl').dataset.ph, auto:getComputedStyle(document.documentElement).getPropertyValue('--t-lang-auto').trim(), desc:document.querySelector('meta[name=description]').content}));
  ok('3 uk-UA browser: lang uk, page shown, static texts in place ('+st.tagline+' · '+st.newBtn+' · '+st.ph+')', st.lang==='uk' && st.ready && st.tagline==='твій чистий аркуш' && st.newBtn==='Нова' && st.ph==='Пошук по назві й тексту' && st.retry==='Повторити' && st.ttl==='Без назви' && st.auto==='"авто"' && /^Нотатки на чистому аркуші/.test(st.desc));
  const pl=await pg.evaluate(()=>[1,2,5,11,21,22,25,111].map(n=>loc('blocks.count',{n})));
  ok('3b plurals: '+pl.join(', '), pl.join('|')==='1 блок|2 блоки|5 блоків|11 блоків|21 блок|22 блоки|25 блоків|111 блоків');
  const p=await pg.evaluate(()=>[loc('undo.blockMovedInto',{label:'a', area:'b'}), loc('import.done',{n:3, updated:1, skipped:0}), loc('no.such.key')]);
  ok('3c parameters and a missing key ('+p.join(' | ')+')', p[0]==='Блок «a» перенесено в область «b»' && p[1]==='Імпортовано: 3 нові, 1 оновлено, 0 без змін' && p[2]==='no.such.key');
  ok('3d only the deliberate missing key warned ('+warns.length+')', warns.length===1 && /no\.such\.key/.test(warns[0]) && !errs.length);
  await ctx.close(); }
{ const ctx=await br.newContext({...CTX, locale:'de-DE'}); const pg=await ctx.newPage(); await pg.goto(SITE); await pg.waitForTimeout(500);
  const lang=await pg.evaluate(()=>document.documentElement.lang);
  ok('4 a browser in an unsupported language gets the fallback ('+lang+')', lang===(await pg.evaluate(()=>I18N.fallback)) && await pg.evaluate(()=>document.documentElement.hasAttribute('data-ready')));
  await ctx.close(); }
{ const site2=await serve(); site2.override.set('/locales/uk.json', null);
  const ctx=await br.newContext(CTX); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(site2.url); await pg.waitForTimeout(600);
  ok('5 without a language file the app still starts and shows keys, not a blank page', await pg.evaluate(()=>document.documentElement.hasAttribute('data-ready')) && (await pg.locator('#newBtn').textContent()).trim()==='notes.new' && !errs.length);
  await ctx.close(); await site2.close(); }
await br.close(); process.exit(fails?1:0);
