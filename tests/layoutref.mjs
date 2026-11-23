// Node: SETTLE against the reference for the commonest case (tests/lab/settle-ref.mjs; the architecture review of 0a262d7, RC5): random
// sheets of set widths opened fresh, the default rules, a carry straight up or down within the block's columns and no hold; where the
// reference states the result (no block met from the side, P-UP able to lift, nothing left hitting), SETTLE gives the same row for every
// block. Seeded: node tests/layoutref.mjs [seed] [N]
import { settle, emptyMemory } from '../public/layout/settle.js';
import { set, ctxOf, sheet } from './lib/primcase.mjs';
import { referenceCarry, referenceSize, referenceRemove, referenceCreate, referenceAway } from './lab/settle-ref.mjs';

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

// ---- the domain widened (docs/LAYOUT-SEAMS-PLAN.md §4.3, L2): a size, a deletion, a creation, a carry away sideways, on the same fresh
// sheets. Each part counts what it tried, what the reference answered and what it left outside its domain; a part that compared too
// little fails, since a case the reference leaves outside checks nothing
const parts = { size: { tried: 0, compared: 0, outside: 0, moved: 0 }, remove: { tried: 0, compared: 0, outside: 0, moved: 0 }, create: { tried: 0, compared: 0, outside: 0, moved: 0 }, away: { tried: 0, compared: 0, outside: 0, moved: 0 } }, wide = [];
const rowsOf = (L, skip) => Object.fromEntries([...L.boxes].filter(([i]) => i !== skip).map(([i, b]) => [i, b.y]).sort());
for (let k = 0; k < N * 20 && Object.values(parts).some((p) => p.tried < N); k++) {
  const cols = int(8, 16), n = int(2, 8), bs = [];
  for (let i = 0; i < n; i++) {
    const w = int(2, 6), col = int(0, cols - w), h = int(1, 3); let y = int(0, 10), free = false;
    for (let t = 0; t < 4 && !free; t++, y += int(1, 3)) free = !bs.some((o) => o.col + 1 <= col + w - 1 && col + 1 <= o.col + o.w - 1 && o.y <= y + h - 1 && y <= o.y + o.h - 1);
    if (!free) break; bs.push(set('B' + i, col, y, w, h));
  }
  if (bs.length < 2) continue;
  // heights by the measure: a text of 3 × cells × rows letters takes `rows` rows at its set width
  const map = Object.fromEntries(bs.map((b) => [b.id, { text: 'x'.repeat(3 * (b.w - 1) * b.h) }])), c2 = ctxOf(map);
  let L; try { L = sheet(cols, bs); } catch { continue; }
  const X = bs[int(0, bs.length - 1)], part = ['size', 'remove', 'create', 'away'][int(0, 3)], P = parts[part];
  if (P.tried >= N) continue;
  let want, r, skip, ask = null;
  if (part === 'size') {
    const h = Math.max(1, X.h + [-2, -1, 1, 2, 3][int(0, 4)]); if (h === X.h) continue;
    map[X.id] = { text: 'x'.repeat(3 * (X.w - 1) * h) };
    want = referenceSize(bs, X.id, h); r = settle(L, { type: 'size', box: null, id: X.id }, emptyMemory(), c2);
  } else if (part === 'remove') {
    want = referenceRemove(bs, X.id); r = settle(L, { type: 'remove', box: null, id: X.id }, emptyMemory(), c2);
  } else if (part === 'create') {
    const w = int(2, 6), nb = { id: 'N', col: int(0, cols - w), y: int(0, 16), w, h: int(1, 3) };
    map.N = { text: 'x'.repeat(3 * (w - 1) * nb.h) };
    ask = [nb.col, nb.y, nb.w, nb.h];
    want = referenceCreate(bs, nb); r = settle(L, { type: 'create', box: null, id: 'N', kind: 'text', at: { col: nb.col, y: nb.y, frow: nb.y, w }, away: true, set: { cw: w - 1 } }, emptyMemory(), c2);
  } else {
    const col = int(0, cols - X.w), y = int(0, 16);
    ask = [col, y];
    want = referenceAway(bs, X.id, col, y); r = settle(L, { type: 'carry', box: null, id: X.id, at: { col, y, frow: y, w: X.w }, away: true }, emptyMemory(), c2);
  }
  P.tried++;
  if (!want) { P.outside++; continue; }
  if (!r.ok) { wide.push({ part, k, cols, bs: bs.map((b) => [b.id, b.col, b.y, b.w, b.h]), X: X.id, to: ask, want, got: r }); continue; }
  P.compared++;
  const got = rowsOf(r.layout, skip);
  if (JSON.stringify(got) !== JSON.stringify(want)) wide.push({ part, k, cols, bs: bs.map((b) => [b.id, b.col, b.y, b.w, b.h]), X: X.id, to: ask, want, got });
  else if (bs.some((b) => !(part === 'away' && b.id === X.id) && b.id in got && got[b.id] !== b.y)) P.moved++;   // another block: not the carried one
}
const least = Math.floor(N / 4);
const wideOk = wide.length === 0 && Object.values(parts).every((p) => p.tried >= N && p.compared >= least && p.moved >= 30);
console.log((wideOk ? '✓ ' : '✗ ') + `the domain widened, ${N} of each, at least ${least} inside the reference's domain and 30 of them moving another block: ` + Object.entries(parts).map(([n2, p]) => `${n2} ${p.compared} compared (${p.moved} moving another block, ${p.outside} outside)`).join('; ') + `; ${wide.length} different`);
for (const d of wide.slice(0, 8)) console.log('  differs: ' + JSON.stringify(d).slice(0, 900));
const bad = diffs.length, okAll = stat.tried >= N && bad === 0;
console.log((okAll ? '✓ ' : '✗ ') + `seed ${seed0}: ${stat.tried} carries within their columns on fresh sheets of set widths, ${stat.compared} inside the reference's domain, every row the reference states (${stat.outside} outside it: met from the side, a lift too high, a hit left), ${bad} different`);
for (const d of diffs.filter(Boolean)) console.log('  differs: ' + JSON.stringify(d).slice(0, 900));
process.exit(okAll && wideOk ? 0 : 1);
