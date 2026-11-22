// L1 (docs/LAYOUT-SEAMS-PLAN.md §4.3): the lab model (tests/lab/gap-model/model.mjs) as the reference of every RELINK that SETTLE asks
// for. settle.js hands each transition and its answer to `hooks.relink`; here the base layout becomes a state of the model, stacks and
// all, the transition its form (frames, GAP's columns), and the model's own relink runs on it: both accept or both refuse, and their
// rows in both measures, owners and lends are the same.
//
// One thing is written again here, since the model takes a path and SETTLE hands facts (the owner's G15): the cut of the moves
// (LAYOUT-RULES GAP's inputs, `moved`), from the rows the model's own FOLLOW gives. It follows the rule's text, not gap.js: every moved
// block from its start row to its target; the carried block's direction first; in each direction the furthest alone first, the others
// joining for the last rows; a swap's pair first to the rows it stood at pinned, then its two structural steps.
import { createModel } from '../../lab/gap-model/model.mjs';
import { createEngineModel } from '../gapdriver.mjs';
import { extent, isArea } from '../../../public/layout/geometry.js';

const frame = (b) => { const t = b.t || 0; return { c0: b.col + 1, c1: b.col + b.w - 1, y: b.y, yc: b.yc ?? b.y, h: b.h - t, e: t, ...(isArea(b) ? { area: true } : {}) }; };
/** The model's state of an engine's layout: its blocks by their extents, its stacks with one owner per row. */
export function stateOf(L) {
  const e = createEngineModel().load({ L, ids: [...L.order] });
  const B = new Map([...e.B].map(([id, b]) => { const box = L.boxes.get(id); return [id, { id, c0: b.c0, c1: b.c1, y: b.y, h: b.h, e: b.e, ...(isArea(box) ? { area: true } : {}) }]; }));
  return { state: { B, S: e.S }, snapshot: e.snapshot() };
}
function cut(d, first) {
  const out = [];
  for (const sign of [first, -first]) {
    const g = d.filter(([, e]) => Math.sign(e) === sign); if (!g.length) continue;
    const levels = [...new Set(g.map(([, e]) => Math.abs(e)))].sort((a, b) => b - a);
    levels.forEach((lv, i) => out.push([g.filter(([, e]) => Math.abs(e) >= lv).map(([id]) => id), sign * (lv - (levels[i + 1] || 0))]));
  }
  return out;
}
/** One RELINK of SETTLE on the model. @returns {null|{what:string}} null when the model answers as the engine did */
export function compare(T, answer) {
  const base = stateOf(T.base);
  let m; try { m = createModel().load(base.state); } catch (e) { return { what: 'the model cannot read the base', error: e.message }; }
  if (m.snapshot() !== base.snapshot) return { what: 'the base read by the model is another layout', model: m.snapshot(), engine: base.snapshot };
  const after = Object.fromEntries([...T.after.boxes].map(([id, b]) => [id, frame(b)]));
  // the start rows: the model's FOLLOW over base's stacks, the blocks after does not hold taken away, with after's heights
  const gone = T.base.order.filter((id) => !T.after.boxes.has(id));
  let start;
  try {
    const s0 = m.save();
    for (const id of gone.sort((a, b) => m.B.get(a).y - m.B.get(b).y || (a < b ? -1 : 1))) m.remove(id);
    start = m.rowsWith(Object.fromEntries(Object.entries(after).filter(([id]) => m.B.has(id)).map(([id, f]) => [id, { h: f.h, e: f.e }])));
    m.load(s0);
  } catch (e) { return { what: 'the model cannot take the departed blocks away', error: e.message }; }
  const moved = [...new Set([...(T.moved || []), ...(T.swap || [])])], pre = new Map(), tail = [];
  if (T.swap && T.base.boxes.has(T.swap[0]) && T.base.boxes.has(T.swap[1]) && after[T.swap[0]] && after[T.swap[1]]) {
    const [x, n] = T.swap, hX = after[x].h + after[x].e, hN = after[n].h + after[n].e, pad = (id) => (after[id].area ? 2 : 0);
    const HX = hX + pad(x), HN = hN + pad(n);
    if (extent(T.base.boxes.get(x)).r0 < extent(T.base.boxes.get(n)).r0) { pre.set(n, after[n].y + HX); pre.set(x, after[x].y - HN); tail.push([[n], -HX], [[x], HN]); }
    else { pre.set(x, after[x].y + HN); pre.set(n, after[n].y - HX); tail.push([[x], -HN], [[n], HX]); }
  }
  const d = [];
  for (const id of moved) if (after[id] && start[id] != null) { const e = (pre.has(id) ? pre.get(id) : after[id].y) - start[id]; if (e) d.push([id, e]); }
  const g = d.find(([id]) => id === T.carried);
  const Tm = { after, steps: [...cut(d, g && g[1] < 0 ? -1 : 1), ...tail], moved, carried: T.carried ?? null, canonical: !!T.canonical, leave: T.leave || [], enter: T.enter || [], pass: T.pass || [], ...(T.swap ? { swap: T.swap } : {}) };
  let refused = null; try { m.relink(Tm); } catch (e) { refused = e.message; }
  if (!answer.ok) return refused ? null : { what: 'the engine refused, the model accepts', engine: answer.errors, Tm };
  if (refused) return { what: 'the model refuses, the engine accepted', model: refused, Tm };
  const got = stateOf(answer.layout).snapshot;
  return m.snapshot() === got ? null : { what: 'another layout', model: m.snapshot(), engine: got, Tm };
}
