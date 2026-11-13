// settleTree (docs/LAYOUT-RULES.md §5.6; LAYOUT-ENGINE-PLAN §2.1, §5.2, step 2c-2): SETTLE over the containers of a note, so that SETTLE
// stays the work of one container. A note is a tree of one level: the sheet's Layout with each area's children in `areas`, in the
// area's own cells (§3.1). A change in an area that moves the bottom its content reaches makes the area's frame follow, by a size change
// of the area in the sheet; the composite changes (enter, leave, ungroup, drawArea, areaSide) are taken apart into the kinds of §5.2, and
// only those reach SETTLE. A refusal or a failure anywhere is the result of the whole, and nothing of it is kept.

import { settle, emptyMemory } from './settle.js';
import { extent, isArea, childToSheet } from './geometry.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Change} Change @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Memory} Memory */

class Stop extends Error { constructor(result) { super(result.why); this.result = result; } }

/** The container a change is in: the sheet for `null`, an area's children otherwise. */
const container = (T, box) => (box == null ? T : T.areas.get(box));
/** The tree with one container replaced; the sheet keeps the tree's areas, an area's children have none (no nesting). */
function put(T, box, L) {
  if (box == null) return { ...L, areas: T.areas };
  const areas = new Map(T.areas); areas.set(box, { ...L, areas: new Map() });
  return { ...T, areas };
}
/** The rows a container's blocks take from its top, in the layout's measure and canonically (an area's frame holds them, AREA.2). */
const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
const canonicalBottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent({ ...b, y: b.yc ?? b.y, h: b.h - (b.t || 0) }).r1 + 1); return m; };
/** An area's frame rows for children that take `inner` rows, by its passport (header, children, a larger `ch`; collapsed, the header). */
const frameRows = (area, inner, ctx) => ctx.kinds[area.kind].container.height(area, inner, ctx.measure);
/** An area's frame round its children: the rows shown, and their temporary part, the growth its children's temporary rows make. */
function frameOf(area, children, ctx) {
  const rows = frameRows(area, bottomOf(children), ctx);
  return { rows, t: rows - frameRows(area, canonicalBottomOf(children), ctx) };
}
/** One SETTLE in one container of the tree, its refusal or failure the whole's. @returns {{tree, r}} */
function one(T, change, memory, ctx) {
  const L = container(T, change.box ?? null);
  if (!L) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no container ' + change.box] });
  const r = settle(L, change, memory, ctx);
  if (!r.ok) throw new Stop(r);
  return { tree: put(T, change.box ?? null, r.layout), r };
}
/** The area `id`'s frame made to hold its children again: a size change of the area in the sheet, its frame rows from them (§5.6), so
 *  the blocks under an area that shrank come back by the path of those under one that grew (INV-7 b). Nothing when the frame is the same.
 *  @returns {{tree, ran:boolean}} */
function grow(T, id, ctx) {
  const area = T.boxes.get(id), C = T.areas.get(id);
  if (!area || !C) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + id] });
  const f = frameOf(area, C, ctx);
  if (f.rows === area.h && f.t === (area.t || 0)) return { tree: T, ran: false };
  return { tree: one(T, { type: 'size', box: null, id, rows: f.rows, t: f.t }, emptyMemory(), ctx).tree, ran: true };
}
const ranOf = (list) => [...new Set(list)];

/** A change in one container, and the frames of the areas it ran in after it. */
function simple(T, change, memory, ctx) {
  const box = change.box ?? null, { tree, r } = one(T, change, memory, ctx);
  let out = tree; const ran = [box];
  if (box != null) { const g = grow(out, box, ctx); out = g.tree; if (g.ran) ran.push(null); }
  return { ok: true, layout: out, start: put(T, box, r.start), memory: r.memory, pressed: r.pressed, moves: r.moves, ran: ranOf(ran) };
}

/** A block into or out of an area (AREA.7, «В область…», «З області»): taken away from the container it leaves (GAP.6), and put into the
 *  one it enters as a new block, away from the start (DRAG.B1), at `at`; each area's frame following after its own part. An area never
 *  goes into an area (no nesting). */
function move(T, change, ctx) {
  const from = change.box ?? null, to = change.to ?? null, b = container(T, from)?.boxes.get(change.id);
  if (!b) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no block ' + change.id] });
  if (to != null && isArea(b)) throw new Stop({ ok: false, why: 'refused' });
  if (to != null && !T.areas.has(to)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + to] });
  const ran = [from, to];
  let out = one(T, { type: 'remove', box: from, id: change.id }, emptyMemory(), ctx).tree;
  if (from != null) { const g = grow(out, from, ctx); out = g.tree; if (g.ran) ran.push(null); }
  const set = {}; for (const f of ['cw', 'ch']) if (b[f] != null) set[f] = b[f]; if (b.open) set.open = true;
  const make = { type: 'create', box: to, id: change.id, kind: b.kind, at: { frow: change.at.y, w: b.w, ...change.at }, away: true, set };
  if (isArea(b)) Object.assign(make, frameOf(b, T.areas.get(b.id), ctx));
  out = one(out, make, emptyMemory(), ctx).tree;
  if (to != null) { const g = grow(out, to, ctx); out = g.tree; if (g.ran) ran.push(null); }
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: ranOf(ran) };
}

/** Ungrouping an area (§5.6, LAYOUT-ENGINE-PLAN §6): the area taken away and each child created on the sheet in reading order, at the
 *  sheet cell it stood on (§3.1), with its sizes. */
function ungroup(T, change, ctx) {
  const area = T.boxes.get(change.id), C = T.areas.get(change.id);
  if (!area || !C || !isArea(area)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + change.id] });
  const H = ctx.kinds[area.kind].container.headerRows(area, ctx.measure);
  let out = one(T, { type: 'remove', box: null, id: change.id }, emptyMemory(), ctx).tree;
  const areas = new Map(out.areas); areas.delete(change.id); out = { ...out, areas };
  for (const id of C.order) {
    const c = C.boxes.get(id), cell = childToSheet(area, H, c);   // on the screen, as the tree is: a creation is put at its displayed cell
    const set = {}; for (const f of ['cw', 'ch']) if (c[f] != null) set[f] = c[f]; if (c.open) set.open = true;
    out = one(out, { type: 'create', box: null, id, kind: c.kind, at: { col: cell.col, y: cell.y, frow: cell.y, w: c.w }, away: true, set }, emptyMemory(), ctx).tree;
  }
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [null] };
}

/** Drawing an area (AREA.7b): a new block of kind 'area' at the cell pressed, its inner columns `cols` and its set height `rows` (at least
 *  4 × 2 cells, and never narrower than its kind's floor), put in as a new block is, so what it covers makes room by the same rules; its
 *  children an empty container. Areas are never nested. */
function drawArea(T, change, ctx) {
  if ((change.box ?? null) != null) throw new Stop({ ok: false, why: 'refused' });
  if (T.boxes.has(change.id) || T.areas.has(change.id)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: ' + change.id + ' is already there'] });
  const k = ctx.kinds.area, probe = { id: change.id, kind: 'area' };
  const cw = Math.max(4, change.at.cols, k.minCells(probe, ctx.measure)), ch = Math.max(2, change.at.rows);
  const box = { ...probe, cw, ch, w: cw + 1 };
  const areas = new Map(T.areas); areas.set(change.id, { cols: cw, measure: T.measure, boxes: new Map(), order: [], areas: new Map() });
  const make = { type: 'create', box: null, id: change.id, kind: 'area', at: { col: change.at.col, y: change.at.y, frow: change.at.y, w: cw + 1 }, away: true, set: { cw, ch }, rows: frameRows(box, 0, ctx), t: 0 };
  const out = one({ ...T, areas }, make, emptyMemory(), ctx).tree;
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [null, change.id] };
}

/** An area's side handle (§5.6, AREA.3, AREA.5, AREA.6, AREA.7a), from the gesture's start at every move: its outer rectangle clamped to
 *  the container's columns first (no narrower than the kind's floor, no wider than the container leaves it), so that both parts work with
 *  one width. In the area, the moving edge is a wall: for the left edge every child is first shifted by the edge's move with its stacks
 *  (GAP.10), so that it keeps its cell on the sheet, and the wall presses those left of column 0; the area's own handle never makes it
 *  taller (refused). Then, in the container, the area is a block whose set width changes, at its new column for the left edge, with its new
 *  frame rows in the same change: its moving edge presses what it now overlaps aside or sinks it. Accepted only when both are. */
function areaSide(T, change, ctx) {
  const box = change.box ?? null, L = container(T, box), area = L?.boxes.get(change.id), C = T.areas.get(change.id);
  if (!area || !C || !isArea(area) || box != null) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + change.id + ' on the sheet'] });
  const floor = ctx.kinds.area.minCells(area, ctx.measure) + 1, right = area.col + area.w;
  let col = area.col, w;
  if (change.side === 'left') { col = Math.max(0, Math.min(change.col, right - floor)); w = right - col; }
  else w = Math.max(floor, Math.min(change.cols, L.cols - area.col - 1));
  if (col === area.col && w === area.w) return { ok: true, layout: T, start: T, memory: emptyMemory(), pressed: null, ran: [] };
  const wall = { type: 'wall', box: change.id, side: change.side, cols: w - 1 };
  if (change.side === 'left' && col !== area.col) wall.shift = area.col - col;
  let out = one(T, wall, emptyMemory(), ctx).tree;
  const f = frameOf({ ...area, w, cw: w - 1 }, out.areas.get(change.id), ctx);
  const width = { type: 'width', box: null, id: change.id, cw: w - 1, side: change.side, rows: f.rows, t: f.t };
  if (change.side === 'left') width.col = col;
  out = one(out, width, emptyMemory(), ctx).tree;
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [change.id, null] };
}

/** settleTree (LAYOUT-RULES §5.6): `root` the note's tree at the change's start (for a carry, every container as it was at the carry's
 *  start or its last swap, `start` of the last result), the change, the carry memory of the change's container, and `ctx`. Returns the
 *  tree after it, `start` (the tree with the change's container's start for the next move of a carry), the memory, `pressed`, and `ran`,
 *  the containers it settled (null, the sheet), for the write; or `{ok: false, why: 'refused'|'failed'}`, for the whole.
 *  @param {Layout} root @param {Change} change @param {?Memory} memory @param {Ctx} ctx */
export function settleTree(root, change, memory, ctx) {
  try {
    switch (change.type) {
      case 'enter': case 'leave': return move(root, change, ctx);
      case 'ungroup': return ungroup(root, change, ctx);
      case 'drawArea': return drawArea(root, change, ctx);
      case 'areaSide': return areaSide(root, change, ctx);
      default: return simple(root, change, memory || emptyMemory(), ctx);
    }
  } catch (e) {
    if (e instanceof Stop) return e.result;
    return { ok: false, why: 'failed', errors: [e.message] };
  }
}
