// Node: GAP.5 RELINK when a block passes another in a column both keep (public/layout/gap.js `relink`), the one path of RELINK the lab model
// has no rule for (it keeps every chain's order), so tests/layoutgap-twin.mjs leaves such events out. Random events with passes, widenings,
// narrowings, sideways shifts and temporary heights, the carried block among them or none, checked by properties instead of a second
// implementation:
//   1. RELINK never throws on an `after` whose blocks do not overlap, and check() finds nothing wrong in its result;
//   2. locality: an event in columns far away, in the same RELINK, changes nothing in the others, rows in both measures and stacks;
//   3. one RELINK of the passes and a widening gives what two give, the passes first and then the widening, rows in both measures and
//      the rows after each block is deleted; cases where the two inputs differ are left out (the second step overlapping, or the widened
//      block on the other side of a neighbour of its new columns on the screen than in the canonical layout, or than SETTLE put it).
// node tests/layoutgap-pass.mjs [events]
import { relink, remove, follow, resize, check } from '../public/layout/gap.js';
import { DEFAULT as R } from '../public/layout/rules.js';
import { ok, done, box, placed, edit, stack, rows, canon, steps } from './lib/gapcase.mjs';

const N = +process.argv[2] || 1500;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const shares = (a, b) => a.col + 1 <= b.col + b.w - 1 && b.col + 1 <= a.col + a.w - 1;
const hit = (a, b) => shares(a, b) && a.y < b.y + b.h && b.y < a.y + a.h;
const near = (a, b) => shares(a, b) && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1;

// 1 and 2: blocks in columns 1–5 and, far away, 21–25; an event in each
function scene(int, pre, off, n) {
  const bs = [];
  for (let i = 0; i < n; i++) for (let t = 0; t < 30; t++) {
    const c0 = off + int(1, 4), b = box(pre + i, c0, Math.min(off + 5, c0 + int(0, 2)), int(0, 16), int(1, 2));
    if (!bs.some((o) => near(o, b))) { bs.push(b); break; }
  }
  return bs;
}
function event(int, pick, r, L, ids, k) {
  const mv = {}, rowOf = new Map(ids.map((id) => [id, L.boxes.get(id).y])), cols = new Map();
  for (let i = 0, m = int(1, 3); i < m; i++) { const id = pick(ids), d = int(-8, 8); if (d && !mv[id]) { mv[id] = steps([k++, d]); rowOf.set(id, rowOf.get(id) + d); } }
  for (let i = 0, m = int(0, 2); i < m; i++) {
    const id = pick(ids), b = L.boxes.get(id), a = Math.max(1, b.col + 1 + int(-1, 1));
    cols.set(id, [a, Math.max(a, b.col + b.w - 1 + int(-1, 1))]);
  }
  const movers = Object.keys(mv), carried = r() < 0.5 ? pick(movers.length ? movers : ids) : null;
  return { mv, rowOf, cols, carried };
}
let tried = 0, threw = 0, broken = 0, nonlocal = 0, first = null;
for (let seed = 1; tried < N && seed < N * 20; seed++) {
  const r = rng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = (a) => a[Math.floor(r() * a.length)];
  const A = scene(int, 'a', 0, 5), Z = scene(int, 'z', 20, 4);
  let L = placed([...A, ...Z], 40);
  if (r() < 0.4) { const id = pick(A).id, b = L.boxes.get(id); L = follow(resize(L, id, b.h + 2, 2)); }
  const ea = event(int, pick, r, L, A.map((b) => b.id), 1), ez = event(int, pick, r, L, Z.map((b) => b.id), 10);
  const geo = (es) => [...L.boxes.values()].map((b) => {
    const o = { ...b };
    for (const e of es) { if (e.rowOf.has(b.id)) o.y = e.rowOf.get(b.id); if (e.cols.has(b.id)) { const [a, z] = e.cols.get(b.id); o.col = a - 1; o.w = z - a + 2; } }
    return o;
  });
  const all = geo([ea, ez]); if (all.some((b) => b.y < 0) || all.some((a, i) => all.some((b, j) => i < j && hit(a, b)))) continue;
  tried++;
  const run = (es) => relink(L, edit(L, (m, set) => { for (const b of geo(es)) set(b.id, { y: b.y, col: b.col, w: b.w }); }), Object.assign({}, ...es.map((e) => e.mv)), ea.carried, R);
  let both, alone;
  try { both = run([ea, ez]); alone = run([ea]); } catch (err) { threw++; first = first || { seed, err: err.message }; continue; }
  const errs = check(both); if (errs.length) { broken++; first = first || { seed, errs }; continue; }
  const sig = (x) => JSON.stringify(A.map((b) => { const o = x.boxes.get(b.id), s = [o.y, o.yc]; for (let c = o.col + 1; c <= o.col + o.w - 1; c++) s.push(stack(x, b.id, c)); return s; }));
  if (sig(both) !== sig(alone)) { nonlocal++; first = first || { seed, nonlocal: true }; }
}
ok(`${tried} random events with passes, widenings, narrowings and temporary heights: RELINK never throws (${threw}) and leaves valid stacks (${broken} broken)${first && !first.nonlocal ? '; first: ' + JSON.stringify(first) : ''}`, tried >= N && !threw && !broken);
ok(`the same events with another in columns far away in the same RELINK: nothing changes in these columns (${nonlocal} differ)${first && first.nonlocal ? '; first: seed ' + first.seed : ''}`, !nonlocal);

// 3: one RELINK against two, the passes first and then the widening
let pairs = 0, differ = 0, firstPair = null;
for (let seed = 1; pairs < N / 3 && seed < N * 20; seed++) {
  const r = rng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), bs = [];
  for (let i = 0; i < 5; i++) for (let t = 0; t < 30; t++) {
    const c0 = int(1, 4), b = box('b' + i, c0, Math.min(5, c0 + int(0, 1)), int(0, 16), 1);
    if (!bs.some((o) => near(o, b))) { bs.push(b); break; }
  }
  if (bs.length < 3) continue;
  let L = placed(bs, 12);
  if (r() < 0.4) { const id = bs[int(0, bs.length - 1)].id; L = follow(resize(L, id, 3, 2)); }
  const mover = bs[int(0, bs.length - 1)].id, d = int(-10, 10), wid = bs[int(0, bs.length - 1)].id, extra = int(1, 3);
  const second = r() < 0.3 ? bs[int(0, bs.length - 1)].id : null, d2 = int(-4, 4);
  if (!d || wid === mover || wid === second) continue;
  const target = new Map([...L.boxes.values()].map((b) => [b.id, b.y])); target.set(mover, target.get(mover) + d);
  const mv = { [mover]: steps([1, d]) }; if (second && second !== mover && d2) { mv[second] = steps([2, d2]); target.set(second, target.get(second) + d2); }
  if ([...target.values()].some((y) => y < 0)) continue;
  const w = L.boxes.get(wid).w + extra, geo = [...L.boxes.values()].map((b) => ({ ...b, y: target.get(b.id), w: b.id === wid ? w : b.w }));
  if (geo.some((a, i) => geo.some((b, j) => i < j && hit(a, b)))) continue;
  const m0 = L.boxes.get(mover);   // the mover passes someone in a column both keep, or the case is the model's
  if (![...L.boxes.values()].some((b) => b.id !== mover && shares(b, m0) && (b.y < m0.y) !== (target.get(b.id) < target.get(mover)))) continue;
  const moved = (m, set) => { for (const id of Object.keys(mv)) set(id, { y: target.get(id) }); };
  const a1 = relink(L, edit(L, moved), mv, null, R);
  const two = relink(a1, edit(a1, (m, set) => set(wid, { w })), {}, null, R);
  const wb = two.boxes.get(wid), wa = a1.boxes.get(wid), nc = []; for (let c = wb.col + 1; c <= wb.col + wb.w - 1; c++) nc.push(c);
  const inNew = (b) => b.id !== wid && nc.some((c) => b.col + 1 <= c && c <= b.col + b.w - 1);
  if (check(two).length || [...two.boxes.values()].some((b) => b.id !== wid && hit(b, wb))) continue;
  if ([...a1.boxes.values()].some((b) => inNew(b) && (Math.sign(wa.y - b.y) !== Math.sign(wa.yc - b.yc) || Math.sign(target.get(wid) - target.get(b.id)) !== Math.sign(wa.y - b.y)))) continue;
  pairs++;
  const one = relink(L, edit(L, (m, set) => { moved(m, set); set(wid, { w }); }), mv, null, R);
  const sig = (x) => JSON.stringify([rows(x), canon(x), ...bs.map((b) => rows(remove(x, b.id, R)))]);
  if (check(one).length || sig(one) !== sig(two)) { differ++; firstPair = firstPair || { seed, mover, d, wid, extra, one: rows(one), two: rows(two) }; }
}
ok(`${pairs} passes with a widening: one RELINK gives what two give, the passes first (${differ} differ${firstPair ? '; first: ' + JSON.stringify(firstPair) : ''})`, pairs >= N / 3 && !differ);
done();
