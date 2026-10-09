// Localization: UI strings come only from public/locales/*.json, every key exists in every language, plurals and parameters
// work, English is the fallback, and the switcher in the panel changes the language.
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
for(const l of LOCALES) used.add('lang.'+l);   // the language switcher names every language
for(const l of LOCALES){
  const keys=new Set(Object.keys(dict[l]).filter(k=>!k.startsWith('_')));
  const missing=[...used].filter(k=>!keys.has(k)), unused=[...keys].filter(k=>!used.has(k));
  ok('2 '+l+'.json has all '+used.size+' keys the app uses'+(missing.length? ' — missing: '+missing.join(', ') : ''), !missing.length);
  ok('2b '+l+'.json has no unused keys'+(unused.length? ' — unused: '+unused.join(', ') : ''), !unused.length);
}
// the same parameters in every language, and every plural form a language needs
const params=v=>[...new Set((typeof v==='object'? Object.values(v) : [v]).join(' ').match(/\{\w+\}/g)||[])].sort().join(',');
const badParams=[], badPlurals=[];
for(const k of Object.keys(dict.uk)) for(const l of LOCALES){ if(params(dict[l][k])!==params(dict.uk[k])) badParams.push(l+':'+k);
  const v=dict[l][k]; if(typeof v==='object'){ const need=new Intl.PluralRules(l).resolvedOptions().pluralCategories; if(need.some(c=>!(c in v))) badPlurals.push(l+':'+k); } }
ok('2c every language uses the same {parameters}'+(badParams.length? ' — differ: '+badParams.join(', ') : ''), !badParams.length);
ok('2d every plural value has all the forms its language needs'+(badPlurals.length? ' — incomplete: '+badPlurals.join(', ') : ''), !badPlurals.length);

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
// UI text of the chrome: text nodes and the attributes people read; the switcher names languages in their own language
const chromeCyr=pg=>pg.evaluate(()=>{ const bad=[], CY=/[\u0400-\u04FF]/; /* the Cyrillic block */ const skip=e=>e.closest('#langSel, .blk, script, style');
  for(const e of document.querySelectorAll('body *')){ if(skip(e)) continue; for(const n of e.childNodes) if(n.nodeType===3 && CY.test(n.data)) bad.push(n.data.trim());
    for(const a of ['title','aria-label','placeholder','data-ph']) if(CY.test(e.getAttribute(a)||'')) bad.push(a+'='+e.getAttribute(a)); }
  const auto=getComputedStyle(document.documentElement).getPropertyValue('--t-lang-auto'); if(CY.test(auto)) bad.push('--t-lang-auto'); return bad; });
{ const ctx=await br.newContext({...CTX, locale:'de-DE'}); const pg=await ctx.newPage(); await pg.goto(SITE); await pg.waitForTimeout(500);
  const lang=await pg.evaluate(()=>document.documentElement.lang), bad=await chromeCyr(pg);
  ok('4 a browser in an unsupported language gets English ('+lang+'), with no Cyrillic left in the UI'+(bad.length? ' — '+bad.slice(0,4).join(' | ') : ''), lang==='en' && !bad.length && await pg.evaluate(()=>document.documentElement.hasAttribute('data-ready')));
  await ctx.close(); }
{ const ctx=await br.newContext({...CTX, locale:'en-US'}); const pg=await ctx.newPage(); await pg.goto(SITE); await pg.waitForTimeout(500);
  const st=await pg.evaluate(()=>({lang:document.documentElement.lang, newBtn:document.getElementById('newBtn').textContent.trim(), ph:document.getElementById('q').placeholder, pl:[1,2,21].map(n=>loc('blocks.count',{n})).join(', '), sel:document.getElementById('langSel').value, opts:[...document.querySelectorAll('#langSel option')].map(o=>o.textContent).join(', ')}));
  ok('6 en-US browser: English UI ('+st.newBtn+' · '+st.ph+' · '+st.pl+'), switcher shows '+st.opts, st.lang==='en' && st.newBtn==='New' && st.ph==='Search titles and text' && st.pl==='1 block, 2 blocks, 21 blocks' && st.sel==='en' && st.opts==='Українська, English');
  await pg.click('#setBtn'); await Promise.all([pg.waitForEvent('load'), pg.selectOption('#langSel','uk')]); await pg.waitForTimeout(500);
  const uk=await pg.evaluate(()=>({lang:document.documentElement.lang, newBtn:document.getElementById('newBtn').textContent.trim(), saved:JSON.parse(localStorage.getItem('sheet:settings')||'{}').lang}));
  ok('7 the switcher saves the choice and reloads in Ukrainian ('+uk.newBtn+')', uk.lang==='uk' && uk.newBtn==='Нова' && uk.saved==='uk');
  await pg.reload(); await pg.waitForTimeout(500);
  ok('7b the choice beats the browser language after a reload', await pg.evaluate(()=>document.documentElement.lang)==='uk');
  await pg.click('#setBtn'); await Promise.all([pg.waitForEvent('load'), pg.selectOption('#langSel','en')]); await pg.waitForTimeout(500);
  ok('7c and back to English', await pg.evaluate(()=>document.documentElement.lang)==='en' && (await chromeCyr(pg)).length===0);
  await ctx.close(); }
{ const site2=await serve(); site2.override.set('/locales/uk.json', null);
  const ctx=await br.newContext(CTX); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(site2.url); await pg.waitForTimeout(600);
  ok('5 without a language file the app still starts and shows keys, not a blank page', await pg.evaluate(()=>document.documentElement.hasAttribute('data-ready')) && (await pg.locator('#newBtn').textContent()).trim()==='notes.new' && !errs.length);
  await ctx.close(); await site2.close(); }
await br.close(); process.exit(fails?1:0);
