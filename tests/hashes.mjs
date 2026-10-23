// The integrity hashes of the page's own files (Subresource Integrity). public/index.html is the one place they live: the integrity
// attribute of the sync.js and cloud.js tags and the SRI table of the language files; the service worker reads them from the page it
// installs. Run as a scenario, this checks them against the files in public/ and prints the right values when one is stale;
// `node tests/hashes.mjs --write` puts the right values into index.html. Other scenarios import sri() and withHashes() for their deploys.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PUB=new URL('../public/', import.meta.url);
export const sri=body=>'sha384-'+crypto.createHash('sha384').update(body).digest('base64');
// the files a page of one build loads by ?b=: the two scripts and every language file
export const FILES=['sync.js','cloud.js',...fs.readdirSync(new URL('locales/', PUB)).filter(f=>f.endsWith('.json')).sort().map(f=>'locales/'+f)];
export const expected=()=>Object.fromEntries(FILES.map(f=>[f, sri(fs.readFileSync(new URL(f, PUB)))]));
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// the same pattern as hashIn() in sw.js: `src="sync.js?b=N" integrity="…"` in a tag, `'locales/uk.json':'…'` in the SRI table
const at=f=>new RegExp('(["\']'+esc(f)+'(?:\\?b=\\d+" integrity="|\':\'))(sha384-[A-Za-z0-9+/]+=*)');
export const found=html=>Object.fromEntries(FILES.map(f=>[f, (at(f).exec(html)||[])[2]||null]));
export const withHashes=(html, map)=>Object.entries(map).reduce((h,[f,v])=>h.replace(at(f),(_,a)=>a+v), html);

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const file=new URL('index.html', PUB), html=fs.readFileSync(file,'utf8'), want=expected(), have=found(html);
  const stale=FILES.filter(f=>have[f]!==want[f]);
  if(process.argv.includes('--write')){
    const miss=FILES.filter(f=>!have[f]); if(miss.length){ console.log('✗ index.html has no place for the hash of '+miss.join(', ')); process.exit(1); }
    fs.writeFileSync(file, withHashes(html, want)); console.log(stale.length? '✓ updated: '+stale.join(', ') : '✓ every hash was already right'); process.exit(0);
  }
  for(const f of FILES) console.log((have[f]===want[f]? '✓ ':'✗ ')+f+' '+(have[f]===want[f]? want[f] : 'is '+have[f]+', must be '+want[f]));
  if(stale.length) console.log('run `node tests/hashes.mjs --write`, or put the values above into public/index.html');
  process.exit(stale.length?1:0);
}
