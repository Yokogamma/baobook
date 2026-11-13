// Node: SETTLE against the reference for the commonest case (tests/lab/settle-ref.mjs; the architecture review of 0a262d7, RC5): random
// sheets of set widths opened fresh, the default rules, a carry straight up or down within the block's columns and no hold; where the
// reference states the result (no block met from the side, P-UP able to lift, nothing left hitting), SETTLE gives the same row for every
// block. Seeded: node tests/layoutref.mjs [seed] [N]
import { settle, emptyMemory } from '../public/layout/settle.js';
import { set, ctxOf, sheet } from './lib/primcase.mjs';
import { referenceCarry } from './lab/settle-ref.mjs';

let seed = +process.argv[2] || 5; const seed0 = seed;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const N = +process.argv[3] || 3000;
const ctx = ctxOf({});
const stat = { tried: 0, compared: 0, outside: 0, refused: 0 }, diffs = [];
for (let k = 0; k < N * 4 && stat.tried < N; k++) {
  const cols = int(8, 16), n = int(2, 8), bs = [];
  for (let i = 0; i < n; i++) {
    const w = int(2, 6), col = int(0, cols - w), h = int(1, 3); let y = int(0, 10), ok = false;
    for (let t = 0; t < 4 && !ok; t++, y += int(1, 3)) ok = !bs.some((o) => o.col + 1 <= col + w - 1 && col + 1 <= o.col + o.w - 1 && o.y <= y + h - 1 && y <= o.y + o.h - 1);
    if (!ok) break; bs.push(set('B' + i, col, y, w, h));
  }
  if (bs.length < 2) continue;
  let L; try { L = sheet(cols, bs); } catch { continue; }
  const X = bs[int(0, bs.length - 1)], y = Math.max(0, X.y + int(-5, 5)); if (y === X.y) continue;
  stat.tried++;
  const want = referenceCarry(bs, X.id, y);
  if (!want) { stat.outside++; continue; }
  const r = settle(L, { type: 'carry', box: null, id: X.id, at: { col: X.col, y, frow: y, w: X.w }, away: false }, emptyMemory(), ctx);
  if (!r.ok) { stat.refused++; if (diffs.length < 5) diffs.push({ k, cols, bs: bs.map((b) => [b.id, b.col, b.y, b.w, b.h]), carry: [X.id, y], want, got: r }); continue; }
  stat.compared++;
  const got = Object.fromEntries([...r.layout.boxes].map(([i, b]) => [i, b.y]).sort());
  if (JSON.stringify(got) !== JSON.stringify(want) && diffs.length < 5) diffs.push({ k, cols, bs: bs.map((b) => [b.id, b.col, b.y, b.w, b.h]), carry: [X.id, y], want, got });
  else if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(null);
}
const bad = diffs.length, okAll = stat.tried >= N && bad === 0;
console.log((okAll ? '✓ ' : '✗ ') + `seed ${seed0}: ${stat.tried} carries within their columns on fresh sheets of set widths, ${stat.compared} inside the reference's domain, every row the reference states (${stat.outside} outside it: met from the side, a lift too high, a hit left), ${bad} different`);
for (const d of diffs.filter(Boolean)) console.log('  differs: ' + JSON.stringify(d).slice(0, 900));
process.exit(okAll ? 0 : 1);
