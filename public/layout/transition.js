// The check of a transition (docs/LAYOUT-RULES.md §4, GAP's inputs): what SETTLE declares it did between two RELINKs, checked against the
// geometry of `base` and `after` alone, with no stacks. GAP runs it before RELINK and refuses a transition that fails it, an internal
// error of SETTLE (`{failed}`, LAYOUT-RULES §5.5). It is written from the lab's tests/lab/gap-model/declare.mjs, which stays as the second
// implementation its tests compare with; the reasons it gives are the same words.
//
// Coordinates are GAP's: a block by its extent (an area's frame with one free cell on every side, LAYOUT-RULES §1.1), its displayed top
// row, its canonical height and its temporary rows; the columns a transition names are the extent's.

import { extent, isArea } from './geometry.js';

/** @typedef {import('./shapes.js').Transition} Transition @typedef {import('./shapes.js').Layout} Layout */

const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
const covers = (b, c) => b.c0 <= c && c <= b.c1;
const kc = (id, c) => id + '|' + c;
const idOf = (k) => k.slice(0, k.lastIndexOf('|'));
const colOf = (k) => +k.slice(k.lastIndexOf('|') + 1);
/** A box as GAP counts it: its extent's columns, its displayed top row, its canonical height and its temporary rows. */
function blockOf(b) {
  const e = extent(b), pad = isArea(b) ? 1 : 0, t = b.t || 0;
  return { c0: e.c0, c1: e.c1, y: b.y - pad, h: b.h - t + 2 * pad, e: t, pad };
}
const blocks = (layout) => new Map(layout.order.map((id) => [id, blockOf(layout.boxes.get(id))]));

/** Every column each block leaves and comes into, and every pair of blocks whose order changes in a column both keep.
 *  @param {Layout} base @param {Layout} after */
export function explain(base, after) {
  const B = blocks(base), A = blocks(after), left = [], entered = [], reordered = [];
  for (const [id, b] of B) for (const c of cols(b)) if (!A.has(id) || !covers(A.get(id), c)) left.push([id, c]);
  for (const [id, a] of A) for (const c of cols(a)) if (!B.has(id) || !covers(B.get(id), c)) entered.push([id, c]);
  const all = new Set(); for (const b of B.values()) for (const c of cols(b)) all.add(c);
  for (const c of [...all].sort((p, q) => p - q)) {
    const keep = [...B.keys()].filter((id) => A.has(id) && covers(B.get(id), c) && covers(A.get(id), c));
    for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
      const p = keep[i], q = keep[j], before = B.get(p).y < B.get(q).y, now = A.get(p).y < A.get(q).y;
      if (before !== now) reordered.push(before ? [c, p, q] : [c, q, p]);   // [column, the block above in base, the one under it]
    }
  }
  return { left, entered, reordered };
}

const FALLBACKS = ['P-UP', 'DRAG.B2.keep'];

/** The errors of a transition: [] when its declaration explains its geometry and every reason is one its action may give.
 *  @param {Transition} T @returns {string[]} */
export function checkTransition(T) {
  const errs = [], B = blocks(T.base), A = blocks(T.after), carried = T.carried ?? null, canonical = !!T.canonical, swap = T.swap || [];
  const steps = T.steps || [], leaveL = T.leave || [], enterL = T.enter || [], passL = T.pass || [];
  const g = explain(T.base, T.after);
  const LV = new Map(leaveL.map(([id, c, w]) => [kc(id, c), w])), EN = new Map(enterL.map(([id, c, h]) => [kc(id, c), h]));
  const PS = new Set(passL.map(([id, c]) => kc(id, c)));
  const leftSet = new Set(g.left.map(([id, c]) => kc(id, c))), enteredSet = new Set(g.entered.map(([id, c]) => kc(id, c)));
  // an undo's carry back leaves every column it had and comes back into every column it has, those it keeps included
  if (canonical && carried != null && B.has(carried) && A.has(carried)) {
    for (const c of cols(B.get(carried))) leftSet.add(kc(carried, c));
    for (const c of cols(A.get(carried))) enteredSet.add(kc(carried, c));
  }
  // coverage: what leaves and what comes in is declared, exactly; a block after does not hold needs nothing (GAP.6)
  for (const k of leftSet) if (A.has(idOf(k)) && !LV.has(k)) errs.push(`leave of ${k} not declared`);
  for (const k of LV.keys()) if (!leftSet.has(k)) errs.push(`declared leave ${k} is not in the geometry`);
  for (const k of enteredSet) if (!EN.has(k)) errs.push(`entry of ${k} not declared`);
  for (const k of EN.keys()) if (!enteredSet.has(k)) errs.push(`declared entry ${k} is not in the geometry`);
  // order: every pair whose order changes in a column both keep has a declared passer there, and every declared passer changes its order
  // with some block there; an undo's carry back keeps no place in any chain to pass from
  const undone = canonical && carried != null ? carried : null;
  for (const [c, p, q] of g.reordered) if (p !== undone && q !== undone && !PS.has(kc(p, c)) && !PS.has(kc(q, c))) errs.push(`${p} and ${q} change their order in column ${c} with no declared pass`);
  for (const k of PS) { const id = idOf(k), c = colOf(k);
    if (!B.has(id) || !A.has(id) || !covers(B.get(id), c) || !covers(A.get(id), c)) errs.push(`declared pass ${k} in a column it does not keep`);
    else if (!g.reordered.some(([cc, p, q]) => cc === c && (p === id || q === id))) errs.push(`declared pass ${k}: it changes its order with no block there`); }
  // a swap (LAYOUT-RULES §5.1b, phase 3): the carried block and the next block over or under it in a column they share in base, nothing
  // between them there, their order exchanged at the rows the swap gives; in a column they share, the carried block is the one that passes
  if (T.swap) {
    const [x, n] = T.swap, X = B.get(x), N = B.get(n);
    if (x !== carried) errs.push(`swap ${x}/${n}: its first block is not the carried one`);
    else if (!X || !A.has(x)) errs.push(`swap ${x}/${n}: base or after does not hold the carried block`);
    else if (!N || !A.has(n) || !A.has(x)) errs.push(`swap ${x}/${n}: no such neighbour`);
    else {
      const shared = cols(X).filter((c) => covers(N, c)), AX = A.get(x), AN = A.get(n), hX = X.h + X.e, hN = N.h + N.e;
      const between = (c) => [...B].some(([id, e]) => { if (id === x || id === n) return false; const lo = Math.min(X.y, N.y), hi = Math.max(X.y, N.y); return covers(e, c) && e.y > lo && e.y < hi; });
      if (!shared.length) errs.push(`swap ${x}/${n}: they share no column`);
      else if (shared.every(between)) errs.push(`swap ${x}/${n}: a block stands between them in every column they share`);
      else if ((X.y < N.y) === (AX.y < AN.y)) errs.push(`swap ${x}/${n}: their order is not exchanged`);
      else {
        // the neighbour may have been pushed before it stopped (M2, M6): pinned where it stopped, its swap is its last step, the carried
        // block's displayed height towards where the carried block was pinned
        const nSteps = steps.filter(([ids]) => ids.includes(n)), last = nSteps[nSteps.length - 1], down = X.y < N.y;
        const swapStep = last && last[0].length === 1 && last[1] === (down ? -hX : hX);
        const pinned = AN.y + (down ? hX : -hX);   // the neighbour's row before the swap
        if (!swapStep || (down ? AX.y !== AN.y + hN || pinned < N.y : AN.y !== AX.y + hX || pinned > N.y)) errs.push(`swap ${x}/${n}: not at the rows the swap gives them`);
      }
      for (const c of shared) if (PS.has(kc(n, c)) && !g.reordered.some(([cc, p, q]) => cc === c && (p === n || q === n) && p !== x && q !== x)) errs.push(`swap ${x}/${n}: in column ${c} the neighbour stayed and moved, the carried block passes it`);
    }
  }
  // every block of after has a card column at least
  for (const id of T.after.order) { const b = T.after.boxes.get(id); if (!(b.col + 1 <= b.col + b.w - 1)) errs.push(`${id} has no column in after`); }
  // the layout after holds no two blocks on one cell, on the screen (INV-1); an undo's carried block is placed by its canonical cell, its
  // displayed row FOLLOW's from there, which RELINK checks in its result
  { const L = [...A].filter(([id]) => !(canonical && id === carried));
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const [p, a] = L[i], [q, b] = L[j];
      if (a.c0 <= b.c1 && b.c0 <= a.c1 && a.y < b.y + b.h + b.e && b.y < a.y + a.h + a.e) errs.push(`${p} and ${q} overlap in after`); } }
  // the steps: from the rows the first step starts from (`start` for the blocks a change of height or of temporary rows reaches, which the
  // transition must give, base's rows for the others), they bring every block they move to its row in after, and replayed in order they put
  // no block on another nor carry it past one in a column both keep, but the two blocks of a swap and a block and the one it is declared
  // to pass
  const H = (id) => { const b = A.get(id); return b.h + b.e; };
  const changed = [...B.keys()].filter((id) => A.has(id) && (B.get(id).h !== A.get(id).h || B.get(id).e !== A.get(id).e));
  const reached = new Set(), queue = [...changed];
  while (queue.length) { const K = B.get(queue.pop());
    for (const [id, b] of B) { if (reached.has(id) || b === K) continue;
      if (b.c0 <= K.c1 && K.c0 <= b.c1 && b.y >= K.y + K.h + K.e) { reached.add(id); queue.push(id); } } }
  for (const id of reached) if (A.has(id) && !(T.start && id in T.start)) errs.push(`a change of height reaches ${id} and the transition gives no start for it`);
  const origin = (id) => (T.start && id in T.start ? T.start[id] - A.get(id).pad : reached.has(id) ? null : B.get(id).y);
  const moved = new Map();
  for (const [ids, d] of steps) for (const id of ids) { if (!A.has(id)) errs.push(`step of ${id}, which after does not hold`); moved.set(id, (moved.get(id) || 0) + d); }
  for (const [id, d] of moved) if (A.has(id) && B.has(id) && origin(id) != null && origin(id) + d !== A.get(id).y) errs.push(`the steps of ${id} add up to ${d} rows, not to its row in after`);
  // with nothing taken away, nothing leaving a column and no undo, a block no step moves keeps its row: every other change of row is a move
  if ([...B.keys()].every((id) => A.has(id)) && !leaveL.length && undone == null)
    for (const id of B.keys()) if (!moved.has(id) && origin(id) != null && origin(id) !== A.get(id).y) errs.push(`${id} is at another row in after with no step that moves it`);
  { // a block and the one it is declared to pass: the two change their order in a column where one of them is declared to pass
    const passing = (p, q) => g.reordered.some(([c, a, b]) => ((a === p && b === q) || (a === q && b === p)) && (PS.has(kc(p, c)) || PS.has(kc(q, c))));
    const pair = (p, q) => (swap.includes(p) && swap.includes(q)) || passing(p, q);
    const y = new Map([...B.keys()].filter((id) => A.has(id) && id !== undone && origin(id) != null).map((id) => [id, origin(id)]));
    const keptCols = (id) => { const a = B.get(id), b = A.get(id); return { c0: Math.max(a.c0, b.c0), c1: Math.min(a.c1, b.c1) }; };
    // a block pressed aside out of every column it had keeps none: no order to keep with any block (an empty range shares no column)
    const none = (k) => k.c0 > k.c1;
    for (const [ids, d] of steps) {
      for (const id of ids) if (y.has(id)) y.set(id, y.get(id) + d);
      const live = [...y.keys()];
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const p = live[i], q = live[j]; if (pair(p, q)) continue;
        const a = keptCols(p), b = keptCols(q);
        if (none(a) || none(b)) continue;
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && y.get(p) < y.get(q) + H(q) && y.get(q) < y.get(p) + H(p)) { errs.push(`replayed, a step puts ${p} on ${q}`); i = live.length; break; }
        const declared = (c0, c1) => { for (let c = c0; c <= c1; c++) if (PS.has(kc(p, c)) || PS.has(kc(q, c))) return true; return false; };
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && (origin(p) < origin(q)) !== (y.get(p) < y.get(q)) && !declared(Math.max(a.c0, b.c0), Math.min(a.c1, b.c1))) { errs.push(`replayed, a step carries ${p} past ${q}`); i = live.length; break; }
      }
    }
  }
  // the reasons each action may give
  for (const [k, w] of LV) { const id = idOf(k);
    if (w === 'away' && !(id === carried && canonical)) errs.push(`${k}: only an undo's carry back leaves as carried away`);
    // the carried block keeps some of its columns in one RELINK and leaves the others as narrowed off (M9); an undo's carry back leaves
    // every column as carried away
    if (id === carried && !canonical && w !== 'narrow') errs.push(`${k}: the carried block, keeping some of its columns, leaves the others as narrowed off`);
    if (id === carried && canonical && w !== 'away') errs.push(`${k}: an undo's carry back leaves every column as carried away`);
    if (w === 'delete') errs.push(`${k}: a deleted block is one after does not hold, with no declaration`);
    if (!['away', 'narrow', 'press', 'delete'].includes(w)) errs.push(`${k}: no such reason to leave, ${w}`); }
  for (const [k, h] of EN) { const id = idOf(k), created = !B.has(id);
    if (h === 'put' && (id === undone || !(id === carried || created))) errs.push(`${k}: only the carried block or a created one comes in where it is put; an undo, a carry back or a deleted block made again, comes back by its canonical row`);
    if (h === 'back' && !(canonical && id === carried)) errs.push(`${k}: only an undo's carry back comes back by its canonical row`);
    if (h === 'self' && (created || id === carried)) errs.push(`${k}: a created or carried block does not come in by itself`);
    if (!['put', 'self', 'back'].includes(h)) errs.push(`${k}: no such way to come in, ${h}`); }
  // a carry inside its columns keeps every neighbour on its side (DRAG.B2): only a swap changes an order, or a fallback of a switched-off
  // rule that puts a neighbour on the carried block's other side, declared as `fallback`, where the carried block passes it
  if (T.fallback != null && !FALLBACKS.includes(T.fallback)) errs.push(`no such fallback, ${T.fallback}`);
  for (const k of PS) { const id = idOf(k);
    if (!(swap.includes(id) || (T.fallback != null && id === carried))) errs.push(`${k}: only a block of a swap, or the carried block under a fallback, changes its order`);
    if (id === undone) errs.push(`${k}: an undo's carry back keeps no place in any chain and passes nothing`); }
  for (const [ids, d] of steps) { if (!Number.isInteger(d) || d === 0) errs.push(`a step of ${d} rows`); for (const id of ids) if (!B.has(id)) errs.push(`step of ${id}, not in base`); }
  return errs;
}
