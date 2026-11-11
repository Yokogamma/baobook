// SETTLE's primitives (docs/LAYOUT-RULES.md §5.3; LAYOUT-ENGINE-PLAN §2, §5.2): P-ASIDE with its chain and `far`; `sink`, with its uses
// P-DOWN, P-SINK and P-SEP; P-UP, its mirror; P-REST; `canMove`. They work on the working state of the phases between two RELINKs: the
// boxes as the phases move them, the stacks as the last RELINK left them (only RELINK writes stacks, PR-6), and the moved block of the
// change, which stands at its target and is in no chain until phase 8, so it neither leads nor follows a push and is never moved by a
// primitive but P-UP's lowering of it. Every vertical move is recorded: each call's steps, cut one per common part within the call (`steps`,
// the Moved of LAYOUT-ENGINE-PLAN §2.1, for the dev look), and the rows a push gave because a height changed (`follow`), since those are
// FOLLOW's and no step. The transition's steps are cut once, from what all the phases did (`transitionSteps`): steps recorded call by call
// hold only inside their call. A press aside changes columns only. Which primitive runs when, and what a switched-off rule runs in its
// place, is settle.js's (§5.1, §1.6); here a primitive does its one job.
//
// Rows and columns are compared by extents (an area's frame with its free cells, LAYOUT-RULES §1.1); a box's `y` is its frame's row, so an
// area's extent starts a row above it.

import { extent, isArea, hits, sharesCol, reaches, readingOrder, range } from './geometry.js';
import { minCells, rowsAt, capCells, isElastic } from './size.js';
import { push, resize, startRows } from './gap.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Step} Step @typedef {import('./shapes.js').Work} Work @typedef {import('./shapes.js').Obstacle} Obstacle */

/** A working state over a layout, its moved block and the context. @param {Layout} L @param {?string} moved @param {Ctx} ctx @returns {Work} */
export function working(L, moved, ctx) { return { L, base: L, moved, ctx, steps: new Map(), follow: new Map(), n: 0, order: L.order.slice() }; }
/** A phase starts: its visits go in the reading order of the layout it starts from (LAYOUT-RULES §5.1, INV-5). @param {Work} ws */
export function phase(ws) { ws.order = ws.L.order.slice(); return ws; }

/** In 0.1 every block can move every way within its container (LAYOUT-RULES §1.3); one that cannot is an obstacle. A later kind of block (a
 *  pinned block, O-7) answers here. @param {Box} box @param {'left'|'right'|'up'|'down'} dir */
export function canMove(box, dir) { return !!box && !!dir; }

// ---- the working state: a box replaced, a snapshot and its restore, the reading order kept
const get = (ws, id) => ws.L.boxes.get(id);
function relayout(L, boxes) { const order = readingOrder(boxes.values()); return { ...L, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }; }
function put(L, box) { const boxes = new Map(L.boxes); boxes.set(box.id, box); return relayout(L, boxes); }
const skipOf = (ws) => new Set(ws.moved == null ? [] : [ws.moved]);
const clone = (m) => new Map([...m].map(([k, v]) => [k, Array.isArray(v) ? v.slice() : v]));
/** @param {Work} ws */
export function snapshot(ws) { return { L: ws.L, steps: clone(ws.steps), follow: new Map(ws.follow), n: ws.n }; }
/** @param {Work} ws */
export function restore(ws, s) { ws.L = s.L; ws.steps = clone(s.steps); ws.follow = new Map(s.follow); ws.n = s.n; }
/** The ids of the visit: the reading order of the phase's start, of the blocks still there. */
const visit = (ws) => ws.order.filter((id) => ws.L.boxes.has(id));

// an extent's top row and its height, and the frame row an extent row gives (an area's frame is a row under its extent's top)
const top = (b) => extent(b).r0, ext = (b) => { const e = extent(b); return e.r1 - e.r0 + 1; }, pad = (b) => (isArea(b) ? 1 : 0);

/** Moves cut one per common part (LAYOUT-ENGINE-PLAN §5.2): [id, rows] by direction, `first` first, and in each the blocks by how far they
 *  went, the furthest alone first and the others joining it for the last rows of the way (the lab's commonParts). Replayed in order from
 *  places where nothing hits, to places where nothing hits, no step puts a block on another or carries it past one in a column both keep:
 *  a block that ends above another in such a column moves down at most by the rows between them more than it, and up at least by as much.
 *  @param {Array<[string, number]>} d @returns {Array<[string[], number]>} */
function cut(d, first = 1) {
  const out = [];
  for (const sign of [first, -first]) {
    const group = d.filter(([, e]) => Math.sign(e) === sign); if (!group.length) continue;
    const levels = [...new Set(group.map(([, e]) => Math.abs(e)))].sort((p, q) => q - p);
    levels.forEach((lv, i) => out.push([group.filter(([, e]) => Math.abs(e) >= lv).map(([id]) => id), sign * (lv - (levels[i + 1] || 0))]));
  }
  return out;
}
/** The blocks that moved between two layouts within one call, recorded as that call's steps (Moved, for the dev look). */
function record(ws, before, after, by) {
  const d = [];
  for (const [id, b] of after.boxes) { const a = before.boxes.get(id); if (a && b.y !== a.y) d.push([id, b.y - a.y]); }
  for (const [ids, rows] of cut(d)) { const step = ++ws.n; for (const id of ids) { if (!ws.steps.has(id)) ws.steps.set(id, []); ws.steps.get(id).push({ step, by, rows }); } }
}

/** The steps and the start rows of the transition the next RELINK reads (LAYOUT-RULES GAP's inputs; LAYOUT-ENGINE-PLAN §5.2), cut once
 *  from what the phases did since `base`, not from the steps each call recorded: those hold only inside their call (phase 1c moves the
 *  carried block alone all the way to its target, onto the neighbour that a later call pushes).
 *  - The start rows are GAP's (gap.js `startRows`): FOLLOW over `base`'s stacks with the heights the phases left, a height being no move.
 *  - Every block's origin, where it stands before the moves, is GAP's too: the same FOLLOW once rule 2 has run, every element that no
 *    longer covers a column of its chain having left it (`startRows` with `departed`). Where the origin is not the start row, a departure
 *    made the difference (a block under one that left its column and grew starts lower in the projection than it stands), and a step
 *    declares it: the corrections, one block at a time, those going up from the top and those going down from the bottom, so that from
 *    the start rows to the origins, both FOLLOW's and with nothing on another in a column both keep, none puts a block on another. A
 *    height that changed in a column the block keeps is FOLLOW's in both (the carried block narrowed at the container's edge and grown
 *    pushes the block under it in both), so it needs none.
 *  - A block the phases did not move and rule 2 puts elsewhere than they did stays at its start row in the replay (RELINK places it), so
 *    the origins are one order (the independent reviews of 8bafb15 and 517a8d7: with GAP.9 off, the blocks under a text pressed aside
 *    rise in GAP's origins, and the one no primitive moved stays at its start row): in a column both keep, a block over another at the
 *    start rows is over it at the origins, by its height, through every block between them; a block the phases did not move is fixed,
 *    and each one they moved stands as near its origin in GAP's projection as that order lets it.
 *  - Then every block the phases moved (by a primitive; the moved block; the pair of a swap) goes from its origin to its row now, cut one
 *    per common part, the moved block's direction first (down when it did not move), in each direction the furthest alone first and the
 *    others joining it for the last rows of the way; so RELINK brings it where the phases put it (GAP.5 rule 5), even when its row now is
 *    its start row. A block they did not move has its correction only where rule 2 leaves it where the phases did, and no move: where
 *    rule 2 puts it elsewhere (with GAP.9 off it rises, as after a deletion, which no phase does), RELINK does, a step would hold it.
 *  - A swap (phase 3, LAYOUT-RULES §5.1b) keeps its structural steps apart: the moves are cut up to the rows where the moved block was
 *    pinned against its neighbour, then the neighbour moves alone by the moved block's height, as the check of a swap requires, then the
 *    moved block by the neighbour's.
 *  @param {Work} ws @param {Layout} base @param {{swap?:[string, string]}} [o]
 *  @returns {{steps:Array<[string[], number]>, start:Record<string, number>}} */
export function transitionSteps(ws, base, o = {}) {
  const S = startRows(base, ws.L, ws.ctx.rules), P = startRows(base, ws.L, ws.ctx.rules, { departed: true }), start = {}, fix = [], d = [];
  // a swap: the rows before it, where the moved block stood pinned against its neighbour (extent tops; an area's frame is a row under)
  const pre = new Map(), tail = [];
  if (o.swap) {
    const [x, n] = o.swap, X = ws.L.boxes.get(x), N = ws.L.boxes.get(n), down = top(base.boxes.get(x)) < top(base.boxes.get(n));
    if (down) { pre.set(n, top(N) + ext(X) + pad(N)); pre.set(x, top(X) - ext(N) + pad(X)); tail.push([[n], -ext(X)], [[x], ext(N)]); }
    else { pre.set(n, top(X) + pad(N)); pre.set(x, top(X) + ext(N) + pad(X)); tail.push([[n], ext(X)], [[x], -ext(N)]); }
  }
  // the blocks the phases moved: by a primitive (the swap's own steps are its structural ones), the moved block, the pair of a swap
  const moved = new Set([...ws.steps].filter(([, l]) => l.some((st) => st.by !== 'swap')).map(([id]) => id));
  if (ws.moved != null) moved.add(ws.moved);
  if (o.swap) for (const id of o.swap) moved.add(id);
  const ids = base.order.filter((id) => ws.L.boxes.has(id) && S.has(id)), to = new Map(), stay = [];
  for (const id of ids) { start[id] = S.get(id); to.set(id, pre.has(id) ? pre.get(id) : ws.L.boxes.get(id).y); }
  // a block the phases did not move has a step only where rule 2 leaves it where the phases did: elsewhere (with GAP.9 off it rises, as
  // after a deletion, which no phase does) RELINK puts it, a step would hold it where the screen has it, and it stays at its start row in
  // the replay; no other block's origin may take that block past it in a column both keep
  for (const id of ids) if (!moved.has(id) && P.get(id) !== start[id]) { if (P.get(id) === to.get(id)) fix.push([id, P.get(id) - start[id]]); else stay.push(id); }
  const kept = (id) => { const a = extent(base.boxes.get(id)), b = extent(ws.L.boxes.get(id)); return [Math.max(a.c0, b.c0), Math.min(a.c1, b.c1)]; };
  const share = (p, q) => { const [a0, a1] = kept(p), [b0, b1] = kept(q); return a0 <= a1 && b0 <= b1 && a0 <= b1 && b0 <= a1; };
  // the origins as one order (the independent review of 517a8d7): in a column both keep, a block over another at the start rows stays
  // over it at the origins, by its height (after's, extent tops), through every block between them; a block the phases did not move is
  // fixed (at its start row, or at its origin where it has its correction), and each block they moved goes as near its origin in GAP's
  // projection as that order lets it, from the top: no lower than the blocks over it allow, no higher than the fixed ones under it, and
  // the moved ones between, leave room for
  const fixed = new Map(ids.filter((id) => !moved.has(id)).map((id) => [id, fix.some(([f]) => f === id) ? P.get(id) : start[id]]));
  const T0 = (id) => start[id] - pad(ws.L.boxes.get(id)), gap = (p, q) => ext(ws.L.boxes.get(p)) - pad(ws.L.boxes.get(p)) + pad(ws.L.boxes.get(q));
  const seq = [...ids].sort((p, q) => T0(p) - T0(q)), from = new Map(fixed), hi = new Map();
  for (let i = seq.length - 1; i >= 0; i--) {
    const p = seq[i]; if (fixed.has(p)) continue; let h = Infinity;
    for (let k = i + 1; k < seq.length; k++) { const q = seq[k]; if (T0(q) > T0(p) && share(p, q)) h = Math.min(h, (fixed.has(q) ? fixed.get(q) : hi.get(q)) - gap(p, q)); }
    hi.set(p, h);
  }
  for (let i = 0; i < seq.length; i++) {
    const q = seq[i]; if (fixed.has(q)) continue; let lo = -Infinity;
    for (let k = 0; k < i; k++) { const p = seq[k]; if (T0(p) < T0(q) && share(p, q)) lo = Math.max(lo, from.get(p) + gap(p, q)); }
    from.set(q, Math.min(hi.get(q), Math.max(lo, P.get(q))));
  }
  for (const id of ids) {
    if (!moved.has(id)) continue;
    const f = from.get(id);
    if (f !== start[id]) fix.push([id, f - start[id]]);
    if (to.get(id) !== f) d.push([id, to.get(id) - f]);
  }
  fix.sort((p, q) => (p[1] < 0 && q[1] < 0 ? start[p[0]] - start[q[0]] : p[1] > 0 && q[1] > 0 ? start[q[0]] - start[p[0]] : p[1] - q[1]));
  const g = d.find(([id]) => id === ws.moved);
  return { steps: [...fix.map(([id, r]) => [[id], r]), ...cut(d, g && g[1] < 0 ? -1 : 1), ...tail], start };
}
/** The rows a push gave because a height changed: FOLLOW's, no step (GAP.5 rule 1). */
function followed(ws, before, after) {
  for (const [id, b] of after.boxes) { const a = before.boxes.get(id); if (a && b.y !== a.y) ws.follow.set(id, (ws.follow.get(id) || 0) + b.y - a.y); }
}

/** A block put at row y (down), the blocks under it following with their gaps; recorded as a step. @param {Work} ws */
export function sinkTo(ws, id, y, by) {
  const b = get(ws, id); if (y <= b.y) return;
  const before = ws.L, after = push(before, put(before, { ...b, y }), skipOf(ws), ws.ctx.rules, ws.base);
  record(ws, before, after, by); ws.L = after;
}
/** Blocks put higher (P-UP): nothing follows them; recorded as steps, with the moved block's own row if P-UP lowered it.
 *  @param {Map<string, number>} rows the new frame rows */
function lift(ws, rows, by) {
  const before = ws.L; let after = before;
  for (const [id, y] of rows) after = put(after, { ...after.boxes.get(id), y });
  record(ws, before, after, by); ws.L = after;
}
/** A block at a new column and width: its height at that width (SIZE.6, through `resize`), the blocks under it following with their gaps,
 *  which is FOLLOW's and no step (LAYOUT-RULES §5.1 phase 4). @param {Work} ws */
export function reshape(ws, id, col, w) {
  const b = get(ws, id); if (col === b.col && w === b.w) return;
  const before = ws.L, nb = { ...b, col, w };
  let after = put(before, nb);
  if (w !== b.w) {   // only a new width is measured: a block moved aside keeps its height, an area's included
    const r = rowsAt(nb, w - 1, ws.ctx);
    if (r.shown !== b.h || r.shown - r.rows !== (b.t || 0)) after = resize(after, id, r.shown, r.shown - r.rows);
  }
  after = push(before, relayout(after, new Map(after.boxes)), skipOf(ws), ws.ctx.rules, ws.base);
  followed(ws, before, after); ws.L = after;
}

// ---- P-ASIDE
/** The narrowest card a block may take when pressed, as a width w (handle included), or null when it never narrows (SIZE.2, SIZE.3). */
const narrowest = (ws, b) => { const m = minCells(b, ws.ctx); return m == null ? null : m + 1; };

/** P-ASIDE for one block of the chain: `n` moves away from the extent `by` (the block pressing it, or a cell `far` tries) towards `side`,
 *  so that their extents share no column: pressed right, its handle cell may stand on the last cell of the card pressing it; pressed left,
 *  its card ends under that card's handle. It moves as a whole while there is room and narrows where it meets the container's edge, if it
 *  is elastic (SIZE.2, `ORDER` push first); the blocks it then hits go aside the same way, in the reading order of the phase's start. A
 *  block of the chain that cannot make all the room goes as far as it can (`far`), and `n` then narrows by what is left, if it can; if not,
 *  false, and the caller puts the layout back. `not`: the ids that are never part of the chain (the moved block, the block pressing it).
 *  @param {Work} ws @param {{c0:number, c1:number}} by @param {'left'|'right'} side @param {Set<string>} not @returns {boolean} */
function shove(ws, nId, by, side, not) {
  const n = get(ws, nId), cols = ws.L.cols, r = range(n, cols), min = narrowest(ws, n), right = side === 'right';
  if (nId === ws.moved) return false;   // the moved block of the change never goes aside: it is the one pressing
  if (right) {
    const need = by.c1 + pad(n); if (n.col >= need) return true;
    if (!canMove(n, 'right')) return false;   // an obstacle in the chain (LAYOUT-RULES §5.3)
    if (need > r.colMax) { const w = cols - need - pad(n); if (min == null || w < min) return false; reshape(ws, nId, need, w); }
    else reshape(ws, nId, need, n.w);
  } else {
    const need = by.c0 - n.w - pad(n); if (n.col <= need) return true;
    if (!canMove(n, 'left')) return false;
    if (need < r.colMin) { const w = by.c0 - pad(n); if (min == null || w < min) return false; reshape(ws, nId, 0, w); }
    else reshape(ws, nId, need, n.w);
  }
  for (const mId of visit(ws)) {
    if (mId === nId || not.has(mId)) continue;
    const m = get(ws, mId), nn = get(ws, nId); if (!hits(m, nn)) continue;
    const s = snapshot(ws);
    if (shove(ws, mId, extent(nn), side, new Set([...not, nId]))) continue;
    restore(ws, s); far(ws, mId, nId, side, not);
    // n narrows by what is left, on the side it is pressed from, if it is elastic and above its minimum (an elastic block is never an area)
    const m2 = get(ws, mId), n2 = get(ws, nId); if (!hits(m2, n2)) continue;
    const e = extent(m2), min2 = narrowest(ws, n2);
    if (right) { const w = e.c0 - n2.col; if (min2 == null || w < min2) return false; reshape(ws, nId, n2.col, w); }
    else { const col = e.c1, w = n2.col + n2.w - col; if (min2 == null || w < min2) return false; reshape(ws, nId, col, w); }
    if (hits(get(ws, mId), get(ws, nId))) return false;
  }
  return true;
}

/** `far`: m cannot make all the room asked of it, so it goes as far as it can, a cell at a time, pressed by a single cell that never pushes
 *  back the block pressing it (`of`), so that the block pressing it narrows only by what is left (LAYOUT-RULES §5.3, «push first, then
 *  narrow»). */
function far(ws, mId, of, side, not) {
  const cols = ws.L.cols, skip = new Set([...not, of]);
  for (let i = 0; i <= cols; i++) {
    const e = extent(get(ws, mId)), cell = side === 'right' ? { c0: e.c0, c1: e.c0 } : { c0: e.c1, c1: e.c1 };
    const s = snapshot(ws), went = () => { const f = extent(get(ws, mId)); return side === 'right' ? f.c0 > e.c0 : f.c1 < e.c1; };
    if (!shove(ws, mId, cell, side, skip) || !went()) { restore(ws, s); return; }
  }
}

/** P-ASIDE (LAYOUT-RULES §5.3): `n`, met from the side by `p` (a block's id, or an obstacle: a wall or a container's edge), goes aside
 *  towards `side`, with the chain of the blocks it then hits; the moved block is never pressed aside, never narrows here and is never part
 *  of the chain. False when the first block of the chain cannot get out of the way: the whole chain is put back where it was found, and the
 *  caller hands `n` to its change kind's «no room aside» (or, in phase 9 (b), to P-REST's own rule).
 *  @param {Work} ws @param {string|Obstacle|{c0:number, c1:number}} p @returns {boolean} */
export function aside(ws, n, p, side) {
  const by = typeof p === 'string' ? extent(get(ws, p)) : p.cols ? { c0: p.cols[0], c1: p.cols[1] } : p;
  const not = new Set([...skipOf(ws), ...(typeof p === 'string' ? [p] : [])]);
  const s = snapshot(ws);
  if (shove(ws, n, by, side, not)) return true;
  restore(ws, s); return false;
}

// ---- sink and its uses
/** `sink` (LAYOUT-RULES §5.3): `id` goes down so that its top meets the lowest bottom of the blocks of `against` that it reaches or hits
 *  (`meets`), repeated until it meets none of them; the blocks under it follow with their gaps. @param {Work} ws
 *  @param {(id:string) => boolean} against @param {(n:Box, a:Box) => boolean} meets */
export function sink(ws, id, against, meets, by) {
  if (!canMove(get(ws, id), 'down')) return;
  for (let i = 0; i <= ws.L.boxes.size; i++) {
    const n = get(ws, id); let low = -1;
    for (const a of visit(ws)) if (a !== id && against(a) && meets(n, get(ws, a))) low = Math.max(low, extent(get(ws, a)).r1 + 1);
    if (low < 0 || low <= top(n)) return;
    sinkTo(ws, id, low + pad(n), by);
  }
  throw new Error('primitives: sink does not end');
}

/** P-DOWN (phase 6): every block judged below the moved block that reaches it sinks against it, in reading order; the blocks under each
 *  follow with their gaps. No limit but containment (LAYOUT-RULES §5.4). @param {Work} ws @param {Set<string>} below */
export function down(ws, below) {
  const g = ws.moved; if (g == null) return;
  for (const id of visit(ws)) {
    if (id === g || !below.has(id)) continue;
    sink(ws, id, (a) => a === g, (n, a) => sharesCol(n, a) && reaches(n, a, 'below'), 'down');
  }
}

/** P-SINK (phase 6, for a change kind that sinks): a block P-ASIDE put back sinks against every block it hits. Under a wall (`inside`) it
 *  first moves to the nearest column where its card lies inside the container, a press aside; under the width handle it keeps its column.
 *  An elastic block sinks at min(natural width, TEXTW), clamped to the container, and gets its rest width in phase 9 [W5].
 *  @param {Work} ws @param {{inside?:boolean}} [o] */
export function sinkAside(ws, id, o = {}) {
  const b = get(ws, id), cols = ws.L.cols;
  let w = isElastic(b, ws.ctx) ? capCells(b, ws.ctx) + 1 : b.w, col = b.col;
  if (o.inside) { const r = range({ ...b, w: Math.min(w, cols - pad(b)) }, cols); col = Math.max(r.colMin, Math.min(r.colMax, col)); }
  if (isElastic(b, ws.ctx)) w = Math.max(narrowest(ws, b) ?? 2, Math.min(w, cols - col - pad(b)));
  reshape(ws, id, col, w);
  sink(ws, id, () => true, (n, a) => hits(n, a), 'sink');
}

/** P-SEP (phase 7 and phase 9 (b)): of two blocks that hit, one sinks against the other. The moved block never moves. In phase 7, against
 *  the moved block the other goes by its side (`sideOf`): judged below, it sinks; judged above, it goes up by P-UP. Everywhere else the lower
 *  one sinks, or on the same row the right one, or on the same row and column the later in reading order, so phase 9 (b) moves blocks
 *  only down [S6]. @param {Work} ws @param {(id:string) => ('above'|'below'|undefined)} [sideOf] */
export function sep(ws, a, b, sideOf) {
  const g = ws.moved;
  if (sideOf && (a === g || b === g)) {
    const o = a === g ? b : a;
    if (sideOf(o) === 'above') { up(ws, new Set([o])); return; }
    sink(ws, o, (x) => x === g, (n, x) => hits(n, x), 'sep'); return;
  }
  const A = get(ws, a), B = get(ws, b);
  let low;
  if (a === g) low = b; else if (b === g) low = a;
  else {
    const ea = extent(A), eb = extent(B), at = (id) => { const i = ws.order.indexOf(id); return i < 0 ? Infinity : i; };
    low = ea.r0 !== eb.r0 ? (ea.r0 > eb.r0 ? a : b) : ea.c0 !== eb.c0 ? (ea.c0 > eb.c0 ? a : b) : (at(a) > at(b) ? a : b);
  }
  const other = low === a ? b : a;
  sink(ws, low, (x) => x === other, (n, x) => hits(n, x), 'sep');
}

// ---- P-UP
/** The upper neighbours of a block among the blocks of the working state but the moved one, by their extents (LAYOUT-RULES §1.3). */
function uppers(ws, b) {
  const e = extent(b), out = new Map();
  for (const id of visit(ws)) {
    if (id === b.id || id === ws.moved) continue;
    const a = get(ws, id), p = extent(a); if (p.r1 >= e.r0) continue;
    for (let c = Math.max(p.c0, e.c0); c <= Math.min(p.c1, e.c1); c++) { const o = out.get(c); if (!o || extent(o).r1 < p.r1) out.set(c, a); }
  }
  return [...new Set(out.values())];
}
/** The highest extent row a block can be pushed up to: the top, unless a block above it cannot move (LAYOUT-RULES §5.3, `topmost`). */
function topmost(ws, b, memo) {
  if (memo.has(b.id)) return memo.get(b.id);
  let t = canMove(b, 'up') ? 0 : top(b);
  for (const a of uppers(ws, b)) t = Math.max(t, topmost(ws, a, memo) + ext(a));
  memo.set(b.id, t); return t;
}
/** A block's extent to row t and up: the blocks above it that its new extent reaches go up too, each only as far as it must. */
function upTo(ws, b, t, rows) {
  if (top(b) <= t || !canMove(b, 'up')) return;
  // the blocks above its place where the phase found it (lifted already, it is above them on its new rows): each goes up only as far as
  // this block's new top needs
  for (const a of uppers(ws, get(ws, b.id))) { const cur = rows.has(a.id) ? { ...a, y: rows.get(a.id) } : a; if (extent(cur).r1 + 1 > t) upTo(ws, cur, t - ext(a), rows); }
  rows.set(b.id, t + pad(b));
}

/** P-UP (phase 5), the mirror of `sink`: every block of `above` (judged above the moved block) that shares a column with it and reaches it
 *  goes up so that its bottom meets the moved block's top: first the gap above it shrinks, then the blocks above it go up too, each only as
 *  far as it must, no higher than row 0, as the mockup's `up` does. When they cannot all go high enough, the moved block stands under the
 *  lowest bottom they could reach (`topmost`, each as high as it can) [M3].
 *  @param {Work} ws @param {Set<string>} above */
export function up(ws, above) {
  if (ws.moved == null) return;
  const g = get(ws, ws.moved), memo = new Map(), rows = new Map();
  const hitsUp = visit(ws).filter((id) => above.has(id) && id !== g.id && sharesCol(get(ws, id), g) && reaches(get(ws, id), g, 'above'));
  if (!hitsUp.length) return;
  const lim = Math.max(...hitsUp.map((id) => topmost(ws, get(ws, id), memo) + ext(get(ws, id))));
  if (top(g) < lim) rows.set(g.id, lim + pad(g));
  const gTop = Math.max(top(g), lim);
  for (const id of hitsUp) { const b = get(ws, id); upTo(ws, rows.has(id) ? { ...b, y: rows.get(id) } : b, gTop - ext(b), rows); }
  lift(ws, rows, 'up');
}

// ---- P-REST
/** P-REST (phase 9 (b)): of two blocks that hit, an elastic block at its minimum with the other on its right presses that neighbour aside by
 *  the cells it lacks, the chain included (P-ASIDE), as a text growing in height pushes the blocks under it down (H1); when the neighbour
 *  cannot make the room, the elastic block goes down itself, under that neighbour. False when P-REST does not apply, and P-SEP separates
 *  them [S5]. @param {Work} ws */
export function rest(ws, a, b) {
  const pair = [[a, b], [b, a]].find(([p, q]) => { const P = get(ws, p), Q = get(ws, q); return p !== ws.moved && narrowest(ws, P) === P.w && Q.col > P.col; });
  if (!pair) return false;
  const [p, q] = pair;
  if (q !== ws.moved && aside(ws, q, p, 'right')) return true;   // the moved block never goes aside: the elastic one goes down under it
  sink(ws, p, (x) => x === q, (n, x) => hits(n, x), 'rest');
  return true;
}
