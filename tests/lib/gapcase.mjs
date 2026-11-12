// Helpers for the GAP tests (tests/layoutgap-*.mjs): layouts of the engine's Boxes from a short notation, in the lab model's terms (card
// columns c0…c1, a row and a height), and their stacks printed as the model prints them, so a case of tests/lab/gap-model reads the same.
import { fromPlaces, showStack, stackAt, check, follow, remove, relink as relinkT } from '../../public/layout/gap.js';
import { explain } from '../../public/layout/transition.js';
import { readingOrder } from '../../public/layout/geometry.js';
import { DEFAULT } from '../../public/layout/rules.js';

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

/** The transition of a RELINK written the short way, base and after with the steps of `moves` ({id: Step[]}) and the carried block (an id, or
 *  {id, canonical} for an undo's): declared as SETTLE declares it (LAYOUT-RULES §4): the steps one per step counter; every column a block
 *  leaves as narrowed off, an undo's carry back leaving all its columns as carried away; every column a block comes into by itself, the
 *  carried or a created block where it is put, an undo's by its canonical row in all its columns; `start` FOLLOW's over base's stacks with
 *  after's heights, once the blocks after does not hold are taken away; `pass` and `swap` as given. */
export function transition(base, after, moves = {}, carried = null, x = {}, rules = DEFAULT) {
  const cid = carried == null ? null : typeof carried === 'string' ? carried : carried.id, canonical = !!(carried && carried.canonical);
  const byStep = new Map(); for (const [id, list] of Object.entries(moves instanceof Map ? Object.fromEntries(moves) : moves)) for (const s of list) { const e = byStep.get(s.step) || { ids: [], rows: s.rows }; e.ids.push(id); byStep.set(s.step, e); }
  const stepsT = [...byStep].sort((a, b) => a[0] - b[0]).map(([, e]) => [e.ids, e.rows]).filter(([, d]) => d !== 0);
  const g = explain(base, after), leave = [], enter = [];
  for (const [id, c] of g.left) if (after.boxes.has(id)) leave.push([id, c, canonical && id === cid ? 'away' : 'narrow']);
  for (const [id, c] of g.entered) enter.push([id, c, canonical && id === cid ? 'back' : id === cid || !base.boxes.has(id) ? 'put' : 'self']);
  if (canonical && base.boxes.has(cid)) { const all = (L) => { const b = L.boxes.get(cid), r = []; for (let c = b.col + (b.kind === 'area' ? 0 : 1); c <= b.col + b.w - (b.kind === 'area' ? 0 : 1); c++) r.push(c); return r; };
    for (const c of all(base)) if (!leave.some(([i, k]) => i === cid && k === c)) leave.push([cid, c, 'away']);
    for (const c of all(after)) if (!enter.some(([i, k]) => i === cid && k === c)) enter.push([cid, c, 'back']); }
  let b0 = base; for (const id of base.order) if (!after.boxes.has(id)) b0 = remove(b0, id, rules || DEFAULT);
  const hs = { ...b0, boxes: new Map([...b0.boxes].map(([id, b]) => [id, after.boxes.has(id) ? { ...b, h: after.boxes.get(id).h, t: after.boxes.get(id).t || 0 } : b])) };
  const start = Object.fromEntries([...follow(hs).boxes].filter(([id]) => after.boxes.has(id)).map(([id, b]) => [id, b.y]));
  // as SETTLE's layout has them: a block no step moves, not carried, at the row FOLLOW gives it with after's heights
  const moved = new Set(stepsT.flatMap(([ids]) => ids)), boxes = new Map(after.boxes);
  for (const [id, y] of Object.entries(start)) if (!moved.has(id) && id !== cid) {
    // a row a test wrote for a block no step moves must be the one FOLLOW gives; one it left as base had it is set to that
    const was = base.boxes.get(id), now = boxes.get(id);
    if (was && now.y !== was.y && now.y !== y) throw new Error(`transition: ${id} is at row ${now.y} with no step that moves it; FOLLOW gives ${y}`);
    boxes.set(id, { ...now, y });
  }
  return { base, after: { ...after, boxes }, steps: stepsT, start, carried: cid, canonical, leave, enter, pass: [], ...x };
}
/** RELINK written the short way: the layout, or a thrown refusal with its reasons. */
export function relink(base, after, moves = {}, carried = null, rules = null, x = {}) {
  const out = relinkT(transition(base, after, moves, carried, x, rules || DEFAULT), rules);
  if (!out.ok) throw new Error('refused: ' + out.errors.join('; '));
  return out.layout;
}
