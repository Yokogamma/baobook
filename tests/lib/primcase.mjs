// Working states for the tests of SETTLE's primitives and change kinds (tests/layoutprim-*.mjs, tests/layoutchanges.mjs): boxes written
// by hand in cells, the stacks built from their places (GAP.1), the measuring stub, and short readers of what a primitive did.
import { fromPlaces, check, follow, resize } from '../../public/layout/gap.js';
import { KINDS } from '../../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../../public/layout/rules.js';
import { readingOrder, hits } from '../../public/layout/geometry.js';
import { working, phase } from '../../public/layout/primitives.js';
import { stubMeasure } from './measure.mjs';

/** A text with a set width (cw = w − 1, so it never narrows and keeps its height): id, column, row, width with the handle, rows. */
export const set = (id, col, y, w, h = 1) => ({ id, kind: 'text', col, y, w, h, t: 0, cw: w - 1 });
/** An elastic text: its width and height must be what the stub gives its text (`chars` characters); see tests/lib/measure.mjs. */
export const text = (id, col, y, w, h = 1) => ({ id, kind: 'text', col, y, w, h, t: 0 });
/** An area: a set width, its frame's rows. */
export const area = (id, col, y, w, h) => ({ id, kind: 'area', col, y, w, h, t: 0, cw: w - 1 });
export const chars = (n) => 'x'.repeat(n);

export const ctxOf = (map = {}, rules = DEFAULT, settings = SETTINGS) => ({ rules, settings, kinds: KINDS, measure: stubMeasure(map) });
/** A container of `cols` columns with these boxes, its stacks from their places (GAP.1). */
export function sheet(cols, boxes) {
  return fromPlaces({ cols, measure: 'displayed', boxes: new Map(boxes.map((b) => [b.id, { ...b }])), order: readingOrder(boxes), areas: new Map() });
}
/** A working state over it, the moved block put at a place of its own (phase 1c), in no chain; `insert` when the moved block comes in by
 *  rule 3 (created, or carried while away). */
export function ws(cols, boxes, ctx, moved = null, at = null, insert = false) {
  let L = sheet(cols, boxes);
  if (moved && at) { const boxes2 = new Map(L.boxes); boxes2.set(moved, { ...L.boxes.get(moved), ...at }); const order = readingOrder(boxes2.values()); L = { ...L, boxes: new Map(order.map((id) => [id, boxes2.get(id)])), order }; }
  return phase(working(L, moved, ctx, insert));
}
export const rows = (w) => Object.fromEntries([...w.L.boxes].map(([id, b]) => [id, b.y]));
export const places = (w) => Object.fromEntries([...w.L.boxes].map(([id, b]) => [id, [b.col, b.y, b.w, b.h]]));
/** The steps a primitive recorded, in order: [ids, rows, by]. */
export function steps(w) {
  const by = new Map();
  for (const [id, list] of w.steps) for (const s of list) { const e = by.get(s.step) || { ids: [], rows: s.rows, by: s.by }; e.ids.push(id); by.set(s.step, e); }
  return [...by].sort((a, b) => a[0] - b[0]).map(([, e]) => [e.ids.sort(), e.rows, e.by]);
}
export const followed = (w) => Object.fromEntries(w.follow);
/** Two blocks that still hit, the moved one included, or none. */
export function hitting(w) {
  const ids = w.L.order;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (hits(w.L.boxes.get(ids[i]), w.L.boxes.get(ids[j]))) return [ids[i], ids[j]];
  return null;
}
export { check };
/** Deep equality with the keys of objects in any order (arrays in order). */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
export function tally() { let fails = 0; return { ok(n, c, got) { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': got ' + JSON.stringify(got))); }, get fails() { return fails; } }; }
/** A layout whose block `id` really grew to `h` rows, FOLLOW pushing the blocks under it: the stacks keep their rows, so a column the
 *  growth does not bind keeps slack (LAYOUT-RULES §1.3). */
export function grown(L, id, h) { return follow(resize(L, id, h)); }
/** A working state over a layout already built; `insert` when the moved block comes in by rule 3 (created, or carried while away). */
export const over = (L, ctx, moved = null, at = null, insert = false) => {
  if (moved && at) { const b = new Map(L.boxes); b.set(moved, { ...L.boxes.get(moved), ...at }); const order = readingOrder(b.values()); L = { ...L, boxes: new Map(order.map((id) => [id, b.get(id)])), order }; }
  return phase(working(L, moved, ctx, insert));
};
/** A box of the working state put elsewhere by hand, as an earlier phase would have left it (its stacks unchanged, nothing recorded). */
export function place(w, id, patch) {
  const b = new Map(w.L.boxes); b.set(id, { ...w.L.boxes.get(id), ...patch }); const order = readingOrder(b.values());
  w.L = { ...w.L, boxes: new Map(order.map((k) => [k, b.get(k)])), order }; w.order = order.slice(); return w;
}
