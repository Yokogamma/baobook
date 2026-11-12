// SETTLE's primitives (docs/LAYOUT-RULES.md §5.3; LAYOUT-ENGINE-PLAN §2, §5.2): P-ASIDE with its chain and `far`; `sink`, with its uses
// P-DOWN, P-SINK and P-SEP; P-UP, its mirror; P-REST; `canMove`. They work on the working state of the phases between two RELINKs: the
// boxes as the phases move them, the stacks as the last RELINK left them (only RELINK writes stacks, PR-6), and the moved block of the
// change, which stands at its target and is in no chain until phase 8, so it neither leads nor follows a push and is never moved by a
// primitive but P-UP's lowering of it. Every vertical move is recorded: each call's steps, cut one per common part within the call (`steps`,
// the Moved of LAYOUT-ENGINE-PLAN §2.1, for the dev look), and the rows a push gave because a height changed (`follow`), since those are
// FOLLOW's and no step. RELINK reads facts, not a path (`transitionFacts`): the blocks the phases moved, which it takes from the rows it
// counts them from to where the phases left them. A press aside changes columns only. Which primitive runs when, and what a switched-off
// rule runs in its place, is settle.js's (§5.1, §1.6); here a primitive does its one job.
//
// Rows and columns are compared by extents (an area's frame with its free cells, LAYOUT-RULES §1.1); a box's `y` is its frame's row, so an
// area's extent starts a row above it.

import { extent, isArea, hits, sharesCol, reaches, readingOrder, range } from './geometry.js';
import { minCells, rowsAt, capCells, isElastic } from './size.js';
import { push, resize, cut } from './gap.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Step} Step @typedef {import('./shapes.js').Work} Work @typedef {import('./shapes.js').Obstacle} Obstacle */

/** A working state over a layout, its moved block and the context; `insert` when the moved block comes in by rule 3 (created, or carried
 *  while away, DRAG.B1), which P-UP reads (G17). @param {Layout} L @param {?string} moved @param {Ctx} ctx @param {boolean} [insert]
 *  @returns {Work} */
export function working(L, moved, ctx, insert = false) { return { L, base: L, moved, ctx, insert: !!insert, steps: new Map(), follow: new Map(), n: 0, order: L.order.slice() }; }
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

/** The blocks that moved between two layouts within one call, recorded as that call's steps (Moved, for the dev look). */
function record(ws, before, after, by) {
  const d = [];
  for (const [id, b] of after.boxes) { const a = before.boxes.get(id); if (a && b.y !== a.y) d.push([id, b.y - a.y]); }
  for (const [ids, rows] of cut(d)) { const step = ++ws.n; for (const id of ids) { if (!ws.steps.has(id)) ws.steps.set(id, []); ws.steps.get(id).push({ step, by, rows }); } }
}

/** What the next RELINK reads of the phases (LAYOUT-RULES GAP's inputs; LAYOUT-ENGINE-PLAN §5.2), the facts and no path: the blocks the
 *  phases moved, by a primitive (a swap's own moves are its pair's), the moved block of the change, and the pair of a swap, in base's
 *  reading order. RELINK takes every one from the row it counts it from to where the phases left it and holds it there, one whose move adds
 *  up to nothing included (the owner, 2026-11-11, G15); the rows a push gave because a height changed are FOLLOW's and no move.
 *  @param {Work} ws @param {Layout} base @param {{swap?:[string, string]}} [o] @returns {{moved:string[], swap?:[string, string]}} */
export function transitionFacts(ws, base, o = {}) {
  // the blocks P-DOWN sank under a moved block that comes in by rule 3 (one base does not hold: created, or carried away and put), with the
  // blocks that followed them, are pushed by that block's arrival, FOLLOW's: not named, so that taking the moved block away again gives
  // every row back (INV-7 b, G16). That is judged for each group of blocks the phases moved that share columns, base's or now's, one with
  // the next: a group where another primitive moved a block too (P-SEP, P-SINK, P-REST; P-UP lifts nothing over such a block, G17) has
  // every move named, as RELINK would otherwise count a push twice, once by FOLLOW over a block it did not name and once in the move of a
  // block under it; a group in other columns changes nothing of it (the independent review of 0eda0ba). The working state says the same
  // (`insert`, which P-UP read): a state that disagrees with base is SETTLE's error
  const putIn = ws.moved != null && !base.boxes.has(ws.moved), pushedOnly = new Set();
  if (ws.moved != null && putIn !== !!ws.insert) throw new Error(`transitionFacts: ${ws.moved} ${putIn ? 'comes in by rule 3' : 'is in base'}, the working state says ${ws.insert ? 'inserted' : 'not inserted'}`);
  if (putIn) {
    const ids = [...ws.steps.keys()].filter((id) => id !== ws.moved && ws.L.boxes.has(id)), up = new Map(ids.map((id) => [id, id]));
    const root = (id) => { while (up.get(id) !== id) id = up.get(id); return id; };
    const spans = (id) => [base.boxes.get(id), ws.L.boxes.get(id)].filter(Boolean).map((b) => extent(b));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
      if (spans(ids[i]).some((a) => spans(ids[j]).some((b) => a.c0 <= b.c1 && b.c0 <= a.c1))) up.set(root(ids[i]), root(ids[j]));
    const groups = new Map(); for (const id of ids) { const r = root(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); }
    for (const g of groups.values()) if (g.every((id) => ws.steps.get(id).every((st) => st.by === 'down' || st.by === 'swap'))) for (const id of g) pushedOnly.add(id);
  }
  const moved = new Set([...ws.steps].filter(([id, l]) => !pushedOnly.has(id) && l.some((st) => st.by !== 'swap')).map(([id]) => id));
  if (ws.moved != null) moved.add(ws.moved);
  if (o.swap) for (const id of o.swap) moved.add(id);
  const order = [...base.order.filter((id) => moved.has(id)), ...[...moved].filter((id) => !base.boxes.has(id))].filter((id) => ws.L.boxes.has(id));
  return o.swap ? { moved: order, swap: o.swap } : { moved: order };
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
 *  lowest bottom they could reach (`topmost`, each as high as it can) [M3]. Over a moved block that comes in by rule 3 (`ws.insert`:
 *  created, or carried while away) they go up by nothing: the moved block stands under the lowest bottom of those it reaches, so that taking
 *  it away again gives every row back (the owner, 2026-11-12, G17; INV-7 b).
 *  @param {Work} ws @param {Set<string>} above */
export function up(ws, above) {
  if (ws.moved == null) return;
  const g = get(ws, ws.moved), memo = new Map(), rows = new Map();
  const hitsUp = visit(ws).filter((id) => above.has(id) && id !== g.id && sharesCol(get(ws, id), g) && reaches(get(ws, id), g, 'above'));
  if (!hitsUp.length) return;
  const high = (b) => (ws.insert ? top(b) : topmost(ws, b, memo));
  const lim = Math.max(...hitsUp.map((id) => high(get(ws, id)) + ext(get(ws, id))));
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
