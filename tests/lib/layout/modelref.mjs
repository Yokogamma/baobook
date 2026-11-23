// L1 (docs/LAYOUT-SEAMS-PLAN.md §4.3): the lab model (tests/lab/gap-model/model.mjs) as the reference of every RELINK that SETTLE asks
// for. settle.js hands each transition and its answer to `hooks.relink`; here the base layout becomes a state of the model, stacks and
// all, the transition its form (frames, GAP's columns), and the model's own relink runs on it: both accept or both refuse, and the
// answer as RELINK wrote it (every block's two rows, heights and stacks) is what the model has.
//
// One thing is written again here, since the model takes a path and SETTLE hands facts (the owner's G15): the cut of the moves
// (LAYOUT-RULES GAP's inputs, `moved`), from the rows the model's own FOLLOW gives. It follows the rule's text, not gap.js: every moved
// block from its start row to its target; the carried block's direction first; in each direction the furthest alone first, the others
// joining for the last rows; a swap's pair first to the rows it stood at pinned, then its two structural steps.
import { createModel } from '../../lab/gap-model/model.mjs';

// Nothing of the engine is run here: a layout is read by its fields as they are (a block's columns, its two rows, its heights, its
// stacks run by run), so that what RELINK answered is compared as it answered it, a row its stacks do not give included.
const isArea = (b) => b.kind === 'area';
const frame = (b) => { const t = b.t || 0; return { c0: b.col + 1, c1: b.col + b.w - 1, y: b.y, yc: b.yc ?? b.y, h: b.h - t, e: t, ...(isArea(b) ? { area: true } : {}) }; };
const rowsOf = (runs) => runs.flatMap((r) => Array(r.n).fill(r.o == null ? '' : r.o));
/** The stacks of a layout in the model's form: one owner per row, '' for an unowned one, keyed `${anchor}|${column}`. */
function stacksOf(L) {
  const S = new Map();
  for (const id of L.order) for (const s of L.boxes.get(id).above || []) for (let c = s.c0; c <= s.c1; c++)
    S.set(id + '|' + c, { u: s.stack.u, parts: s.stack.parts.map((p, i) => (i % 2 ? { id: p.id, lend: rowsOf(p.lend) } : rowsOf(p))) });
  return S;
}
/** The model's state of an engine's layout: its blocks by their extents (an area's with its free cells round it), its stacks. */
export function stateOf(L) {
  const B = new Map(L.order.map((id) => { const b = L.boxes.get(id), p = isArea(b) ? 1 : 0, t = b.t || 0;
    return [id, { id, c0: b.col + 1 - p, c1: b.col + b.w - 1 + p, y: b.y - p, h: b.h - t + 2 * p, e: t, ...(p ? { area: true } : {}) }]; }));
  return { B, S: stacksOf(L) };
}
/** A layout as it is written, to compare: every block's frame (columns, displayed and canonical row, height, temporary rows) and every
 *  stack; the model's, from its own frames and state. */
const written = (frames, S) => JSON.stringify([Object.entries(frames).map(([id, f]) => [id, f.c0, f.c1, f.y, f.yc, f.h, f.e || 0]).sort(), [...S].map(([k, st]) => [k, st.u, st.parts]).sort()]);
export const writtenOf = (L) => written(Object.fromEntries(L.order.map((id) => [id, frame(L.boxes.get(id))])), stacksOf(L));
const writtenByModel = (m) => written(m.frames(), m.save().S);
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
  let m; try { m = createModel().load(stateOf(T.base)); } catch (e) { return { what: 'the model cannot read the base', error: e.message }; }
  if (writtenByModel(m) !== writtenOf(T.base)) return { what: 'the base read by the model is another layout', model: writtenByModel(m), engine: writtenOf(T.base) };
  const after = Object.fromEntries([...T.after.boxes].map(([id, b]) => [id, frame(b)]));
  // the start rows: the model's FOLLOW over base's stacks, the blocks after does not hold taken away, with after's heights
  const gone = T.base.order.filter((id) => !T.after.boxes.has(id));
  let start;
  try {
    const s0 = m.save();
    for (const id of gone.sort((a, b) => s0.B.get(a).y - s0.B.get(b).y || (a < b ? -1 : 1))) m.remove(id);
    start = m.rowsWith(Object.fromEntries(Object.entries(after).filter(([id]) => !gone.includes(id) && T.base.boxes.has(id)).map(([id, f]) => [id, { h: f.h, e: f.e }])));
    m.load(s0);
  } catch (e) { return { what: 'the model cannot take the departed blocks away', error: e.message }; }
  const moved = [...new Set([...(T.moved || []), ...(T.swap || [])])], pre = new Map(), tail = [];
  if (T.swap && T.base.boxes.has(T.swap[0]) && T.base.boxes.has(T.swap[1]) && after[T.swap[0]] && after[T.swap[1]]) {
    const [x, n] = T.swap, pad = (id) => (after[id].area ? 2 : 0), HX = after[x].h + after[x].e + pad(x), HN = after[n].h + after[n].e + pad(n);
    const top = (id) => { const b = T.base.boxes.get(id); return b.y - (isArea(b) ? 1 : 0); };
    if (top(x) < top(n)) { pre.set(n, after[n].y + HX); pre.set(x, after[x].y - HN); tail.push([[n], -HX], [[x], HN]); }
    else { pre.set(x, after[x].y + HN); pre.set(n, after[n].y - HX); tail.push([[x], -HN], [[n], HX]); }
  }
  const d = [];
  for (const id of moved) if (after[id] && start[id] != null) { const e = (pre.has(id) ? pre.get(id) : after[id].y) - start[id]; if (e) d.push([id, e]); }
  const g = d.find(([id]) => id === T.carried);
  const Tm = { after, steps: [...cut(d, g && g[1] < 0 ? -1 : 1), ...tail], moved, carried: T.carried ?? null, canonical: !!T.canonical, leave: T.leave || [], enter: T.enter || [], pass: T.pass || [], ...(T.swap ? { swap: T.swap } : {}) };
  let refused = null; try { m.relink(Tm); } catch (e) { refused = e.message; }
  if (!answer.ok) return refused ? null : { what: 'the engine refused, the model accepts', engine: answer.errors, Tm };
  if (refused) return { what: 'the model refuses, the engine accepted', model: refused, Tm };
  const got = writtenOf(answer.layout);
  return writtenByModel(m) === got ? null : { what: 'another layout', model: writtenByModel(m), engine: got, Tm };
}
