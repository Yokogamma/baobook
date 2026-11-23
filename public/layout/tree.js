// settleTree (docs/LAYOUT-RULES.md §5.6; LAYOUT-ENGINE-PLAN §2.1, §5.2, step 2c-2): SETTLE over the containers of a note, so that SETTLE
// stays the work of one container. A note is a tree of one level: the sheet's Layout with each area's children in `areas`, in the
// area's own cells (§3.1). A change in an area that moves the bottom its content reaches makes the area's frame follow, by a size change
// of the area in the sheet; the composite changes (enter, leave, ungroup, drawArea, areaSide) are taken apart into the kinds of §5.2, and
// only those reach SETTLE. A refusal or a failure anywhere is the result of the whole, and nothing of it is kept.

import { settle, emptyMemory } from './settle.js';
import { isArea, childToSheet } from './geometry.js';
import { frameOf } from './frame.js';

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
/** The rows an area's frame at `area`'s width leaves its children without growing past `rows` (§5.4: an area's own handle never makes
 *  it taller): its header measured at that width taken off; a collapsed area's children take nothing of it. Negative: the header alone
 *  is too tall. */
function roomOf(area, rows, ctx) {
  const H = ctx.kinds[area.kind].container.headerRows(area, ctx.measure), x = area.tx || 0;
  return area.collapsed ? (H + x <= rows ? Infinity : -1) : rows - x - H;
}
/** An area's children's container made with the area, and taken away with it: the one place the tree's `areas` change, so that every
 *  area has its container and no container outlives its area. */
const withArea = (T, id, children) => { const areas = new Map(T.areas); areas.set(id, { ...children, areas: new Map() }); return { ...T, areas }; };
const withoutArea = (T, id) => { const areas = new Map(T.areas); areas.delete(id); return { ...T, areas }; };
const emptyFor = (T, cw) => ({ cols: cw, measure: T.measure, boxes: new Map(), order: [], areas: new Map() });

/** One SETTLE in one container of the tree, its refusal or failure the whole's. @returns {{tree, r}} */
function one(T, change, memory, ctx, hooks) {
  const L = container(T, change.box ?? null);
  if (!L) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no container ' + change.box] });
  const r = settle(L, change, memory, ctx, hooks);
  if (!r.ok) throw new Stop(r);
  return { tree: put(T, change.box ?? null, r.layout), r };
}
/** The area `id`'s frame made to hold its children again: a plain size change of the area in the sheet, which reads them (§5.6), so
 *  the blocks under an area that shrank come back by the path of those under one that grew (INV-7 b). Nothing when the frame is the same.
 *  @returns {{tree, ran:boolean}} */
function grow(T, id, ctx, hooks) {
  const area = T.boxes.get(id), C = T.areas.get(id);
  if (!area || !C) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + id] });
  const f = frameOf(area, C, ctx);
  if (f.h === area.h && f.t === (area.t || 0)) return { tree: T, ran: false };
  return { tree: one(T, { type: 'size', box: null, id }, emptyMemory(), ctx, hooks).tree, ran: true };
}
const ranOf = (list) => [...new Set(list)];

/** A change in one container, and the frames of the areas it ran in after it. A change of an area itself on the sheet takes its frame
 *  in the same SETTLE, which reads its children from the tree (frame.js), a creation of an area makes its empty container and a deletion takes its
 *  container away with it; an area's width and its walls go only by `areaSide`, which changes both together. */
function simple(T, change, memory, ctx, hooks) {
  const box = change.box ?? null, area = box == null && change.id != null ? T.boxes.get(change.id) : null;
  if (change.type === 'create' && change.kind === 'area') return createArea(T, change, ctx, hooks);
  if (change.type === 'wall' && box != null) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: a wall in an area is areaSide\'s part'] });
  if (area && isArea(area)) {
    if (change.type === 'width' || (change.type === 'size' && change.set && 'cw' in change.set)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: an area\'s width changes by areaSide'] });
  }
  const { tree, r } = one(T, change, memory, ctx, hooks);
  let out = change.type === 'remove' && area && isArea(area) ? withoutArea(tree, change.id) : tree;
  const ran = [box];
  if (box != null) { const g = grow(out, box, ctx, hooks); out = g.tree; if (g.ran) ran.push(null); }
  return { ok: true, layout: out, start: put(T, box, r.start), memory: r.memory, pressed: r.pressed, moves: r.moves, ran: ranOf(ran) };
}

/** A block into or out of an area (AREA.7, «В область…», «З області»): taken away from the container it leaves (GAP.6), and put into the
 *  one it enters as a new block, away from the start (DRAG.B1), at `at`; each area's frame following after its own part. An area never
 *  goes into an area (no nesting). */
function move(T, change, ctx, hooks) {
  const from = change.box ?? null, to = change.to ?? null, b = container(T, from)?.boxes.get(change.id);
  if (!b) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no block ' + change.id] });
  if (to != null && isArea(b)) throw new Stop({ ok: false, why: 'refused' });
  if (to != null && !T.areas.has(to)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + to] });
  const ran = [from, to];
  let out = one(T, { type: 'remove', box: from, id: change.id }, emptyMemory(), ctx, hooks).tree;
  if (from != null) { const g = grow(out, from, ctx, hooks); out = g.tree; if (g.ran) ran.push(null); }
  const set = {}; for (const f of ['cw', 'ch']) if (b[f] != null) set[f] = b[f]; if (b.open) set.open = true;
  const make = { type: 'create', box: to, id: change.id, kind: b.kind, at: { frow: change.at.y, w: b.w, ...change.at }, away: true, set, ...(b.tx ? { tx: b.tx } : {}) };
  out = one(out, make, emptyMemory(), ctx, hooks).tree;
  if (to != null) { const g = grow(out, to, ctx, hooks); out = g.tree; if (g.ran) ran.push(null); }
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: ranOf(ran) };
}

/** Ungrouping an area (§5.6, LAYOUT-ENGINE-PLAN §6): the area taken away and each child created on the sheet in reading order, at the
 *  sheet cell it stood on (§3.1), with its sizes. */
function ungroup(T, change, ctx, hooks) {
  const area = T.boxes.get(change.id), C = T.areas.get(change.id);
  if (!area || !C || !isArea(area)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + change.id] });
  const H = ctx.kinds[area.kind].container.headerRows(area, ctx.measure);
  let out = withoutArea(one(T, { type: 'remove', box: null, id: change.id }, emptyMemory(), ctx, hooks).tree, change.id);
  for (const id of C.order) {
    const c = C.boxes.get(id), cell = childToSheet(area, H, c);   // on the screen, as the tree is: a creation is put at its displayed cell
    const set = {}; for (const f of ['cw', 'ch']) if (c[f] != null) set[f] = c[f]; if (c.open) set.open = true;
    out = one(out, { type: 'create', box: null, id, kind: c.kind, at: { col: cell.col, y: cell.y, frow: cell.y, w: c.w }, away: true, set, ...(c.tx ? { tx: c.tx } : {}) }, emptyMemory(), ctx, hooks).tree;
  }
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [null] };
}

/** An area made, by any creation of kind 'area' in the sheet: its frame from frameOf with no children, its children an empty container
 *  of its inner columns, made with it. Areas are never nested. */
function createArea(T, change, ctx, hooks) {
  if ((change.box ?? null) != null) throw new Stop({ ok: false, why: 'refused' });
  if (T.boxes.has(change.id) || T.areas.has(change.id)) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: ' + change.id + ' is already there'] });
  const floor = ctx.kinds.area.minCells({ id: change.id, kind: 'area' }, ctx.measure), cw = Math.max(floor, change.set?.cw ?? floor);
  const box = { id: change.id, kind: 'area', cw, w: cw + 1, ...(change.set?.ch != null ? { ch: change.set.ch } : {}) };
  const make = { ...change, set: { ...change.set, cw }, at: { ...change.at, w: cw + 1 } };
  const out = one(withArea(T, change.id, emptyFor(T, cw)), make, emptyMemory(), ctx, hooks).tree;
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [null, change.id] };
}

/** Drawing an area (AREA.7b): a new area at the cell pressed, its inner columns `cols` and its set height `rows`, at least 4 × 2 cells
 *  and never narrower than its kind's floor, put in as a new block is (createArea), so what it covers makes room by the same rules. */
function drawArea(T, change, ctx, hooks) {
  const cw = Math.max(4, change.at.cols), ch = Math.max(2, change.at.rows);
  return createArea(T, { type: 'create', box: change.box ?? null, id: change.id, kind: 'area', at: { col: change.at.col, y: change.at.y, frow: change.at.y, w: cw + 1 }, away: true, set: { cw, ch } }, ctx, hooks);
}

/** An area's side handle's rectangle, the one clamp both its parts use (§5.6): its right edge or its left edge moved to where the handle
 *  asks, the other edge staying, the width no narrower than the kind's floor and no wider than the container leaves it. Where the
 *  container leaves less than the floor (a sheet narrower than the area), the area keeps the width it is shown at and the handle moves
 *  nothing. @returns {{col:number, w:number}} */
function sideRect(area, change, cols, ctx) {
  const floor = ctx.kinds.area.minCells(area, ctx.measure) + 1, right = area.col + area.w;
  if (change.side === 'left') {
    const most = right;                                   // the widest it gets from column 0
    if (floor > most) return { col: area.col, w: area.w };
    const col = Math.max(0, Math.min(change.col, right - floor));
    return { col, w: right - col };
  }
  const most = cols - area.col - 1;                       // its free column on the right inside the container
  if (floor > most) return { col: area.col, w: area.w };
  return { col: area.col, w: Math.max(floor, Math.min(change.cols, most)) };
}

/** An area's side handle (§5.6, AREA.3, AREA.5, AREA.6, AREA.7a), from the gesture's start at every move: its rectangle clamped first
 *  (sideRect), so that both parts work with one width. In the area, the moving edge is a wall: for the left edge every child is first
 *  shifted by the edge's move with its stacks (GAP.10), so that it keeps its cell on the sheet, and the wall presses those left of column
 *  0; the children may take the rows the area's frame leaves them at the new width, its header measured there and `ch` counted (`room`),
 *  and no more: the area's own handle never makes it taller (§5.4). Then, in the container, the area is a block whose set width changes,
 *  at its new column for the left edge, with its frame from frameOf in the same change: its moving edge presses what it now overlaps
 *  aside or sinks it. Accepted only when both are. */
function areaSide(T, change, ctx, hooks) {
  const box = change.box ?? null, L = container(T, box), area = L?.boxes.get(change.id), C = T.areas.get(change.id);
  if (!area || !C || !isArea(area) || box != null) throw new Stop({ ok: false, why: 'failed', errors: ['settleTree: no area ' + change.id + ' on the sheet'] });
  const { col, w } = sideRect(area, change, L.cols, ctx);
  if (col === area.col && w === area.w) return { ok: true, layout: T, start: T, memory: emptyMemory(), pressed: null, ran: [] };
  const next = { ...area, col, w, cw: w - 1 }, room = roomOf(next, area.h, ctx);
  if (room < 0) throw new Stop({ ok: false, why: 'refused' });
  const wall = { type: 'wall', box: change.id, side: change.side, cols: w - 1, room };
  if (change.side === 'left' && col !== area.col) wall.shift = area.col - col;
  let out = one(T, wall, emptyMemory(), ctx, hooks).tree;
  const width = { type: 'width', box: null, id: change.id, cw: w - 1, side: change.side };
  if (change.side === 'left') width.col = col;
  out = one(out, width, emptyMemory(), ctx, hooks).tree;
  if (out.boxes.get(change.id).h > area.h) throw new Stop({ ok: false, why: 'refused' });   // its own handle never makes it taller (§5.4)
  return { ok: true, layout: out, start: out, memory: emptyMemory(), pressed: null, ran: [change.id, null] };
}

/** settleTree (LAYOUT-RULES §5.6): `root` the note's tree at the change's start (for a carry, every container as it was at the carry's
 *  start or its last swap, `start` of the last result), the change, the carry memory of the change's container, and `ctx`. Returns the
 *  tree after it, `start` (the tree with the change's container's start for the next move of a carry), the memory, `pressed`, and `ran`,
 *  the containers it settled (null, the sheet), for the write; or `{ok: false, why: 'refused'|'failed'}`, for the whole.
 *  `hooks`, settle.js's, for the tests and the dev look: every SETTLE of every container is given them.
 *  @param {Layout} root @param {Change} change @param {?Memory} memory @param {Ctx} ctx @param {object} [hooks] */
export function settleTree(root, change, memory, ctx, hooks = {}) {
  try {
    switch (change.type) {
      case 'enter': case 'leave': return move(root, change, ctx, hooks);
      case 'ungroup': return ungroup(root, change, ctx, hooks);
      case 'drawArea': return drawArea(root, change, ctx, hooks);
      case 'areaSide': return areaSide(root, change, ctx, hooks);
      default: return simple(root, change, memory || emptyMemory(), ctx, hooks);
    }
  } catch (e) {
    if (e instanceof Stop) return e.result;
    return { ok: false, why: 'failed', errors: [e.message] };
  }
}
