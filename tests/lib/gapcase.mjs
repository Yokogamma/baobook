// Helpers for the GAP tests (tests/layoutgap-*.mjs): layouts of the engine's Boxes from a short notation, in the lab model's terms (card
// columns c0…c1, a row and a height), and their stacks printed as the model prints them, so a case of tests/lab/gap-model reads the same.
import { fromPlaces, showStack, stackAt, check } from '../../public/layout/gap.js';
import { readingOrder } from '../../public/layout/geometry.js';

let failed = 0;
export const ok = (n, c) => { if (!c) failed++; console.log((c ? '✓ ' : '✗ ') + n); };
export const eq = (n, got, want) => ok(`${n}${JSON.stringify(got) === JSON.stringify(want) ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`, JSON.stringify(got) === JSON.stringify(want));
export const done = () => process.exit(failed ? 1 : 0);

/** A box on card columns c0…c1 at row y, h rows tall, t of them temporary; an area with {area: true} (its frame). */
export const box = (id, c0, c1, y, h = 1, o = {}) => ({ id, kind: o.area ? 'area' : 'text', col: c0 - 1, w: c1 - c0 + 2, y, yc: y, h: h + (o.t || 0), t: o.t || 0 });
/** A layout from boxes at their places, stacks built by GAP.1. */
export function placed(boxes, cols = 64) {
  const m = new Map(boxes.map((b) => [b.id, b]));
  return fromPlaces({ cols, measure: 'displayed', boxes: m, order: readingOrder(boxes), areas: new Map() });
}
/** The same layout with boxes added or changed: the `after` a SETTLE would hand RELINK (rows are targets). */
export function edit(L, f) { const m = new Map(L.boxes); f(m, (id, patch) => m.set(id, { ...m.get(id), ...patch })); return { ...L, boxes: m, order: [...m.keys()] }; }
export const stack = (L, l, c) => { const s = stackAt(L, l, c); return s ? showStack(s) : null; };
export const rows = (L) => Object.fromEntries([...L.boxes.keys()].sort().map((id) => [id, L.boxes.get(id).y]));
export const canon = (L) => Object.fromEntries([...L.boxes.keys()].sort().map((id) => [id, L.boxes.get(id).yc]));
export const steps = (...list) => list.map(([n, d]) => ({ step: n, by: 'change', rows: d }));
export const clean = (n, L) => { const e = check(L); ok(n + (e.length ? ': ' + e.join('; ') : ''), !e.length); };
