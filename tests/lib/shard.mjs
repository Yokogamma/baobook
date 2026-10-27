// Splits the scenarios in tests/*.mjs into N shards of about equal running time, for the CI matrix.
//
//   node tests/lib/shard.mjs <index> <count>     prints the files of shard <index> (0-based), one per line
//   node tests/lib/shard.mjs [<count>]           prints every shard with its estimated seconds (SHARDS of them by default)
//
// The split is deterministic: scenarios sorted by weight, each placed on the least loaded shard (longest-processing-time
// first). WEIGHTS holds the measured seconds of the slow scenarios (GitHub Actions, ubuntu-latest, October 2026); a scenario
// not listed counts as DEFAULT. The numbers only balance the shards, so a stale one costs a little wall time, not correctness:
// every file is on exactly one shard whatever the weights say. Update them from the run log when a shard sticks out.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEIGHTS = {
  appidbfail: 110, appidbfail2: 105, appidbfail3: 110, appidbwait: 110, appformatgen: 95, apppin: 96, applistacts: 74, appformat: 74, appnavwait: 62, appsend: 57, apprecv: 57, apptrash: 39,
  apprevive: 37, apptotals: 36, appswap: 26, appboot: 26, appsave: 25, appask: 24, appleader: 23, appversions3: 22,
  appsync: 21, appundo: 20, appsri: 20, appmenu: 20, appupdate: 18, appeditor: 18, appcard: 18, appnav: 16, apparchive: 16,
  applinks: 15, appchip: 15, apptouch: 14, appconflict: 60, appaccpanel: 75,
};
const DEFAULT = 12;
const SHARDS = 8;   // as the matrix in .github/workflows/tests.yml

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)).sort();
const weight = n => WEIGHTS[n] ?? DEFAULT;

export function shards(count) {
  const out = Array.from({ length: count }, () => ({ files: [], seconds: 0 }));
  const order = [...names].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  for (const n of order) {
    const s = out.reduce((m, x) => (x.seconds < m.seconds ? x : m), out[0]);
    s.files.push(n); s.seconds += weight(n);
  }
  for (const s of out) s.files.sort();
  return out;
}

const [index, count] = process.argv.slice(2).map(Number);
if (Number.isInteger(count) && count > 0 && Number.isInteger(index) && index >= 0 && index < count) {
  for (const n of shards(count)[index].files) console.log(`tests/${n}.mjs`);
} else if (process.argv.length <= 3 && !(process.argv[2] && !(Number(process.argv[2]) > 0))) {
  const all = shards(Number(process.argv[2]) || SHARDS);
  all.forEach((s, i) => console.log(`shard ${i}: ~${s.seconds}s  ${s.files.join(' ')}`));
} else {
  console.error('usage: node tests/lib/shard.mjs <index> <count>');
  process.exit(2);
}
