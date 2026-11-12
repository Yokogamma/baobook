// Node: SETTLE as a property (public/layout/settle.js; LAYOUT-ENGINE-PLAN §4.2, §5.2 step 2b, step 2's row of §5): random small sheets of
// elastic texts and set widths, and random changes of every kind SETTLE takes (a carry within its columns or away, a creation, a size, a
// deletion, the width handle, a carry held and carried on past its neighbour) under random sets of switched-off rules, each set through `resolve`, seeded. What must hold: SETTLE never
// fails (a failure is a bug: a bound exceeded, or a transition RELINK refuses), a refusal has one of the reasons §5.5 allows, and every
// result passes gap.js's check (INV-1 no two blocks share a cell, INV-2 rows FOLLOW's, INV-3 the stacks well formed), lies inside its
// container (INV-4) and in reading order (INV-5). A creation taken away again leaves every block where it was when nothing else changed
// columns and GAP.5.2 and GAP.5.3 are on (INV-7 b, LAYOUT-RULES §1.6). Seeded: node tests/layoutprops.mjs [seed] [N]
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check, remove } from '../public/layout/gap.js';
import { DECLS, resolve } from '../public/layout/rules.js';
import { readingOrder, extent } from '../public/layout/geometry.js';
import { set, text, chars, ctxOf, sheet } from './lib/primcase.mjs';

let seed = +process.argv[2] || 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const N = +process.argv[3] || 2000;
const SWITCHES = ['SIZE.1', 'SIZE.2', 'SIZE.8', 'GAP.5.1', 'GAP.5.2', 'GAP.5.3', 'GAP.8', 'GAP.9', 'P-ASIDE', 'P-UP', 'P-REST', 'P-SINK', 'DRAG.A3.narrow', 'DRAG.A5', 'DRAG.B2.keep', 'DRAG.B3', 'DRAG.B5'];
const known = new Set(DECLS.map((d) => d.id)); for (const s of SWITCHES) if (!known.has(s)) throw new Error('unknown switch ' + s);
const fails = {}, firsts = [], refusals = {}, kinds = {}, inc = (m, k) => (m[k] = (m[k] || 0) + 1);
let tried = 0, skipped = 0, inv7 = 0, held = 0;

function draw() {
  const cols = int(8, 16), n = int(2, 7), bs = [], map = {};
  for (let i = 0; i < n; i++) {
    const id = 'B' + i, el = rnd() < 0.4, w = int(2, 6), col = int(0, cols - w), h = el ? 1 : int(1, 3);
    let y = int(0, 8);
    for (const o of bs) if (o.col < col + w && col < o.col + o.w && o.y < y + h && y < o.y + o.h) y = o.y + o.h + int(0, 1);
    for (const o of bs) if (o.col < col + w && col < o.col + o.w && o.y < y + h && y < o.y + o.h) return null;
    if (el) { map[id] = { text: chars((w - 1) * 3) }; bs.push(text(id, col, y, w, 1)); } else { map[id] = { text: 'x' }; bs.push(set(id, col, y, w, h)); }
  }
  const off = {}; for (const s of SWITCHES) if (rnd() < 0.12) off[s] = false;
  let rules; try { rules = resolve(off); } catch { return null; }
  let L; try { L = sheet(cols, bs); } catch { return null; }
  return { cols, bs, map, rules, off: Object.keys(off), L };
}

function change(d) {
  const { L, bs, map, cols } = d, pick = bs[int(0, bs.length - 1)], r = rnd();
  if (r < 0.35) {   // a carry within its columns, up or down, a column aside at most
    const dc = int(-1, 1), dy = int(-4, 4); if (!dc && !dy) return null;
    const col = Math.max(0, Math.min(cols - pick.w, pick.col + dc));
    return { type: 'carry', box: null, id: pick.id, at: { col, y: Math.max(0, pick.y + dy), frow: Math.max(0, pick.y + dy), w: pick.w }, away: false };
  }
  if (r < 0.5) {   // a carry away: far from its columns
    const col = pick.col + pick.w + int(0, 4) <= cols - pick.w ? pick.col + pick.w + int(0, 2) : 0;
    if (col < pick.col + pick.w && pick.col < col + pick.w) return null;
    const y = int(0, 8); return { type: 'carry', box: null, id: pick.id, at: { col, y, frow: y, w: pick.w }, away: true };
  }
  if (r < 0.7) {   // a creation of a set width
    const w = int(2, 5), y = int(0, 8); map.X = { text: 'x' };
    return { type: 'create', box: null, id: 'X', kind: 'text', at: { col: int(0, cols - w), y, frow: y, w }, away: true, set: { cw: w - 1, ch: int(1, 3) } };
  }
  if (r < 0.8) {   // a size: an elastic text gets a new length
    const el = bs.filter((b) => b.cw == null); if (!el.length) return null;
    const b = el[int(0, el.length - 1)]; map[b.id] = { text: chars(int(1, 40)) };
    return { type: 'size', box: null, id: b.id };
  }
  if (r < 0.9) return { type: 'remove', box: null, id: pick.id };
  const sw = bs.filter((b) => b.cw != null); if (!sw.length) return null;   // the width handle on a set width
  const b = sw[int(0, sw.length - 1)]; return { type: 'width', box: null, id: b.id, cw: Math.max(1, b.cw + int(-2, 4)), side: 'right' };
}

const allowed = new Set(['refused']);
for (let k = 0; k < N * 4 && tried < N; k++) {
  const d = draw(); if (!d) { skipped++; continue; }
  const c = change(d); if (!c) { skipped++; continue; }
  const ctx = ctxOf(d.map, d.rules);
  const r = settle(d.L, c, emptyMemory(), ctx);
  tried++; inc(kinds, c.type);
  const dump = () => ({ k, seed0: process.argv[2] || 11, cols: d.cols, bs: d.bs.map((b) => [b.id, b.col, b.y, b.w, b.h, b.cw == null ? 'el' : 'set']), change: c, off: d.off, map: c.type === 'size' ? { [c.id]: d.map[c.id] } : undefined });
  if (!r.ok) {
    if (allowed.has(r.why)) { inc(refusals, c.type); continue; }
    const why = (r.errors || [r.why])[0].replace(/B\d+|X\b/g, '·').slice(0, 90); inc(fails, why); if (firsts.length < 4) firsts.push({ ...dump(), errors: r.errors }); continue;
  }
  // a carry within its columns, held: two or three moves further the same way from the result's start and memory, the hold set on the
  // first (step 2b-2: the pin, the swap and its run again, the release), every result sound
  if (c.type === 'carry' && !c.away && rnd() < 0.5) {
    const dir = c.at.y >= d.L.boxes.get(c.id).y ? 'down' : 'up';
    let st = r.start, mem = { ...r.memory, dir }, y = c.at.y, bad2 = null; const seq = [];
    for (let m = 0; m < int(2, 3) && !bad2; m++) {
      y = Math.max(0, y + (dir === 'down' ? int(1, 3) : -int(1, 3)));
      const cm = { ...c, at: { ...c.at, y, frow: y + (rnd() < 0.5 ? 0.4 : 0) }, through: m === 0 ? 'hold' : undefined };
      seq.push({ y: cm.at.y, frow: cm.at.frow, through: cm.through }); const rm = settle(st, cm, mem, ctx);
      if (!rm.ok) { if (rm.why !== 'refused') bad2 = (rm.errors || [rm.why])[0]; break; }
      const e2 = check(rm.layout); if (e2.length) { bad2 = e2[0]; break; }
      st = rm.start; mem = { ...rm.memory, dir };
    }
    held++;
    if (bad2) { const why = 'held carry: ' + bad2.replace(/B\d+|X\b/g, '·').slice(0, 80); inc(fails, why); if (firsts.length < 4) firsts.push({ ...dump(), dir, seq, errors: [bad2] }); continue; }
  }
  const L = r.layout, errs = check(L);
  if (!L.order.every((id, i) => id === readingOrder(L.boxes.values())[i])) errs.push('not in reading order');
  for (const b of L.boxes.values()) if (b.col < 0 || extent(b).c1 > L.cols - 1 || b.y < 0) errs.push(b.id + ' outside its container');
  if (errs.length) { const why = errs[0].replace(/B\d+|X\b/g, '·').slice(0, 90); inc(fails, why); if (firsts.length < 4) firsts.push({ ...dump(), errors: errs }); continue; }
  // INV-7 b: a creation taken away again, nothing pressed aside or narrowed, GAP.5.2 and GAP.5.3 on: every block back at its row
  if (c.type === 'create' && !d.off.includes('GAP.5.2') && !d.off.includes('GAP.5.3') && [...d.L.boxes].every(([id, b]) => { const a = L.boxes.get(id); return a && a.col === b.col && a.w === b.w; })) {
    const z = remove(L, 'X', d.rules), back = [...d.L.boxes].filter(([id, b]) => z.boxes.get(id).y !== b.y);
    inv7++;
    if (back.length && !r.moves.has(back[0][0])) { inc(fails, 'INV-7 b: a block not moved by a primitive is not back'); if (firsts.length < 4) firsts.push({ ...dump(), errors: ['INV-7 b ' + back.map(([id]) => id)] }); }
  }
}
const bad = Object.values(fails).reduce((s, n) => s + n, 0), okAll = tried >= N && bad === 0;
console.log((okAll ? '✓ ' : '✗ ') + `${tried} random changes through SETTLE (${JSON.stringify(kinds)}) under random switches: never failed, every result sound (INV-1 to INV-5); refused ${JSON.stringify(refusals)}; ${held} carries held and carried on; INV-7 b checked on ${inv7} creations ${JSON.stringify(fails)}; ${skipped} draws skipped`);
for (const f of firsts) console.log('  first failure: ' + JSON.stringify(f).slice(0, 1500));
process.exit(okAll ? 0 : 1);
