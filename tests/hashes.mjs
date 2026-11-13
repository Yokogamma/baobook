// The integrity hashes of the page's own files (Subresource Integrity). public/index.html is the one place they live: the integrity
// attribute of the sync.js and cloud.js tags and the SRI table of the language files; the service worker reads them from the page it
// installs. Run as a scenario, this checks them against the files in public/ and prints the right values when one is stale;
// `node tests/hashes.mjs --write` puts the right values into index.html; `node tests/hashes.mjs --live <site>` checks a deployed site. Other scenarios import sri() and withHashes() for their deploys.
// The same goes for the Firebase SDK's FB_SRI (below), checked against the SDK files of the emulator scenarios and, with --live, against gstatic.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PUB=new URL('../public/', import.meta.url);
export const sri=body=>'sha384-'+crypto.createHash('sha384').update(body).digest('base64');
// the files a page of one build loads by ?b=: the two scripts, every language file and every ES module of public/<feature>/ (CLAUDE.md «Modular»),
// whose hashes sit in the SRI table beside the language files
const MODDIRS=fs.readdirSync(PUB,{withFileTypes:true}).filter(d=>d.isDirectory() && d.name!=='locales').map(d=>d.name).sort();
export const MODULES=MODDIRS.flatMap(d=>fs.readdirSync(new URL(d+'/', PUB)).filter(f=>f.endsWith('.js')).sort().map(f=>d+'/'+f));
export const FILES=['sync.js','cloud.js',...fs.readdirSync(new URL('locales/', PUB)).filter(f=>f.endsWith('.json')).sort().map(f=>'locales/'+f), ...MODULES];
export const expected=()=>Object.fromEntries(FILES.map(f=>[f, sri(fs.readFileSync(new URL(f, PUB)))]));
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// the same pattern as hashIn() in sw.js: `src="sync.js?b=N" integrity="…"` in a tag, `'locales/uk.json':'…'` in the SRI table
const at=f=>new RegExp('(["\']'+esc(f)+'(?:\\?b=\\d+" integrity="|\':\'))(sha384-[A-Za-z0-9+/]+=*)');
export const found=html=>Object.fromEntries(FILES.map(f=>[f, (at(f).exec(html)||[])[2]||null]));
export const withHashes=(html, map)=>Object.entries(map).reduce((h,[f,v])=>h.replace(at(f),(_,a)=>a+v), html);

// the Firebase SDK (FB_VER and FB_SRI in index.html, `'firebase-app.js':'…'` like the SRI table): three modules from gstatic, checked here against
// the files the emulator scenarios load, tests/emu/.sdk/<FB_VER>/ (gitignored, cached by CI; `--write` downloads them with curl). Without them
// the check is skipped, so a shard stays offline; `--live` checks gstatic itself. FB_VER must be SDK_VER of tests/emu/lib/emu.mjs, or the
// emulator scenarios would test another version than the page loads
export const SDK_FILES=['firebase-app.js','firebase-auth.js','firebase-firestore.js'];
export const sdkVer=html=>(/const FB_VER='([\d.]+)'/.exec(html)||[])[1]||null;
const emuVer=()=>(/SDK_VER='([\d.]+)'/.exec(fs.readFileSync(new URL('emu/lib/emu.mjs', import.meta.url),'utf8'))||[])[1]||null;
const sdkFile=(v,f)=>new URL('emu/.sdk/'+v+'/'+f, import.meta.url);
const sdkHas=(v,f)=>fs.existsSync(sdkFile(v,f)) && fs.statSync(sdkFile(v,f)).size>0;
const sdkHere=v=>SDK_FILES.every(f=>sdkHas(v,f));
const sdkDownload=v=>{ fs.mkdirSync(new URL('emu/.sdk/'+v+'/', import.meta.url),{recursive:true});
  for(const f of SDK_FILES) if(!sdkHas(v,f)) execFileSync('curl', ['-sSfL','--retry','3','-o',fileURLToPath(sdkFile(v,f)),'https://www.gstatic.com/firebasejs/'+v+'/'+f]); };
export const sdkExpected=v=>Object.fromEntries(SDK_FILES.map(f=>[f, sri(fs.readFileSync(sdkFile(v,f)))]));
export const sdkFound=html=>Object.fromEntries(SDK_FILES.map(f=>[f, (at(f).exec(html)||[])[2]||null]));

if(process.argv[1]===fileURLToPath(import.meta.url) && process.argv.includes('--live')){
  // after a deploy: the live page's hashes against the bytes the live site serves (a CDN that rewrites a script would make every browser refuse it)
  const base=process.argv[process.argv.indexOf('--live')+1]||'https://baobook.matamata.dev/', html=await (await fetch(base,{cache:'no-store'})).text();
  const b=(/<meta name="baobook-build" content="(\d+)">/.exec(html)||[])[1], have=found(html); let bad=0;
  for(const f of FILES){ const got=sri(Buffer.from(await (await fetch(new URL(f+'?b='+b, base),{cache:'no-store'})).arrayBuffer())); if(got!==have[f]) bad++; console.log((got===have[f]? '✓ ':'✗ ')+b+' '+f+(got===have[f]? '' : ': the page says '+have[f]+', the site serves '+got)); }
  // the SDK the live page asks for, fetched from gstatic itself: the one check that does not rest on the files cached for the emulator scenarios
  const v=sdkVer(html), sh=sdkFound(html);
  if(!v){ bad++; console.log('✗ the live page has no FB_VER'); }
  else for(const f of SDK_FILES){ const r=await fetch('https://www.gstatic.com/firebasejs/'+v+'/'+f,{cache:'no-store'}), got=r.ok? sri(Buffer.from(await r.arrayBuffer())) : 'HTTP '+r.status;
    if(got!==sh[f]) bad++; console.log((got===sh[f]? '✓ ':'✗ ')+'firebasejs/'+v+'/'+f+(got===sh[f]? '' : ': the page says '+sh[f]+', gstatic serves '+got)); }
  process.exit(bad?1:0);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=new URL('index.html', PUB), html=fs.readFileSync(file,'utf8'), want=expected(), have=found(html);
  const stale=FILES.filter(f=>have[f]!==want[f]);
  const v=sdkVer(html), ev=emuVer(), sh=sdkFound(html);
  const sameVer=!!v && v===ev, verLine='✗ FB_VER in public/index.html is '+v+', SDK_VER in tests/emu/lib/emu.mjs is '+ev+': they must name one version';
  if(process.argv.includes('--write')){
    const miss=[...FILES, ...SDK_FILES].filter(f=>!have[f] && !sh[f]); if(miss.length){ console.log('✗ index.html has no place for the hash of '+miss.join(', ')); process.exit(1); }
    if(!sameVer){ console.log(verLine); process.exit(1); }
    sdkDownload(v); const sw=sdkExpected(v), sdkStale=SDK_FILES.filter(f=>sh[f]!==sw[f]);
    fs.writeFileSync(file, withHashes(withHashes(html, want), sw)); const upd=[...stale, ...sdkStale];
    console.log(upd.length? '✓ updated: '+upd.join(', ') : '✓ every hash was already right'); process.exit(0);
  }
  for(const f of FILES) console.log((have[f]===want[f]? '✓ ':'✗ ')+f+' '+(have[f]===want[f]? want[f] : 'is '+have[f]+', must be '+want[f]));
  let sdkBad=0;
  if(!sameVer){ sdkBad++; console.log(verLine); }
  else if(!sdkHere(v)) console.log('· the SDK files of '+v+' are not in tests/emu/.sdk/, so FB_SRI is not checked here (the emulator job has them; `node tests/hashes.mjs --write` downloads them)');
  else { const sw=sdkExpected(v); for(const f of SDK_FILES){ const same=sh[f]===sw[f]; if(!same) sdkBad++; console.log((same? '✓ ':'✗ ')+'firebasejs/'+v+'/'+f+' '+(same? sw[f] : 'is '+sh[f]+', must be '+sw[f])); } }
  if(stale.length || sdkBad) console.log('run `node tests/hashes.mjs --write`, or put the values above into public/index.html');
  process.exit(stale.length || sdkBad? 1 : 0);
}
