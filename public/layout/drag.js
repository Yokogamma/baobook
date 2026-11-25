// The carry of a block as the pointer makes it (LAYOUT-RULES §6.A, DRAG.B1, AREA.7; LAYOUT-ENGINE-PLAN §2): the target from the pointer's
// cells, «home» and «outside», away, and the change that asks for it: a carry in the block's container, or an `enter` or a `leave` when
// the pointer crosses an area's frame. It builds targets and changes and runs nothing; ops.js runs them. First version, for the narrow
// slice of LAYOUT-SEAMS-PLAN §8: the hold and Shift (DRAG.B4) are not here.
//
// Every point is in the sheet's cells, fractional: x in columns, y in rows from the sheet's row 0.

import { isArea, sharesCol, extent } from './geometry.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx @typedef {import('./shapes.js').Settings} Settings
 *  @typedef {{x:number, y:number}} Point
 *  @typedef {{c0:number, c1:number, r0:number, bottom:number, top:number, cols:number}} Frame
 *    // an area's frame on the sheet as the carry started: its columns, its first row, the row under its last (lowered, AREA.7), the
 *    // sheet row of its children's row 0, and the columns its children have
 *  @typedef {{box:?string, id:string, area:boolean, set:boolean, w:number, home:{box:?string, col:number, y:number}, grab:{dx:number, dy:number},
 *             from:Point, cols:number, away:boolean, frames:Map<string, Frame>}} Drag
 *  @typedef {{state:'outside'}|{state:'home'}|{state:'move', drag:Drag, to:?string, change:object}} Step */

const inside = (tree, box) => (box == null ? tree : tree.areas.get(box));

/** A block picked up: what the carry remembers from its start (DRAG.A1's offset, A2's and A4's cell, AREA.7's frames).
 *  @param {Layout} tree the note as shown when the carry starts @param {?string} box @param {string} id @param {Point} point @param {Ctx} ctx
 *  @returns {?Drag} null when the block is not there */
export function pick(tree, box, id, point, ctx) {
  const b = inside(tree, box)?.boxes.get(id);
  if (!b) return null;
  /** @type {Map<string, Frame>} */
  const frames = new Map();
  for (const a of tree.boxes.values()) {
    if (!isArea(a) || a.collapsed) continue;
    const A = tree.areas.get(a.id), H = ctx.kinds[a.kind].container.headerRows(a, ctx.measure), top = a.y + H;
    // the bottom, lowered to one row under the lowest of its other blocks when they need it; it never moves in the carry (AREA.7)
    let low = 0; for (const c of A.boxes.values()) if (c.id !== id) low = Math.max(low, extent(c).r1 + 1);
    frames.set(a.id, { c0: a.col + 1, c1: a.col + a.w - 1, r0: a.y, bottom: Math.max(a.y + a.h, top + low + 1), top, cols: A.cols });
  }
  const o = origin(frames, box);
  return { box, id, area: isArea(b), set: b.cw != null, w: b.w, home: { box, col: b.col, y: b.y }, grab: { dx: point.x - (o.col + b.col), dy: point.y - (o.y + b.y) }, from: point, cols: tree.cols, away: false, frames };
}

/** The sheet cell of a container's cell (0, 0), by the frames of the carry's start. */
function origin(frames, box) { if (box == null) return { col: 0, y: 0 }; const f = frames.get(box); return { col: f.c0, y: f.top }; }

/** The container under the pointer (AREA.7): the area whose frame it is inside, when the carried block may go in (an area never does,
 *  nor a set width wider than the area), else the sheet; `undefined` outside the sheet's box (DRAG.A3b). */
export function over(drag, point) {
  if (point.x < 0 || point.x > drag.cols + 1 || point.y < 0) return undefined;
  if (drag.area) return null;
  for (const [id, f] of drag.frames) if (point.x >= f.c0 && point.x < f.c1 + 1 && point.y >= f.r0 && point.y < f.bottom && !(drag.set && drag.w > f.cols)) return id;
  return null;
}

/** The target in a container's cells (DRAG.A1, A2; the left and top edges of A3, the right one being phase 1c's): the block's top-left
 *  cell under the pointer with the offset it was grabbed at, rounded; `frow` the unrounded row. In the container it was taken from, the
 *  column is held at its column while the pointer is within STICK of it and the carry has been more vertical than horizontal, the row
 *  likewise (measured from where it was picked up to where the pointer is; proposed).
 *  @param {Drag} drag @param {?string} box @param {Point} point @param {Settings} settings */
export function aim(drag, box, point, settings) {
  const o = origin(drag.frames, box), fx = point.x - drag.grab.dx - o.col, fy = point.y - drag.grab.dy - o.y;
  let col = Math.max(0, Math.round(fx)), frow = Math.max(0, fy), y = Math.max(0, Math.round(fy));
  if (box === drag.home.box && settings.STICK > 0) {
    const dx = Math.abs(point.x - drag.from.x), dy = Math.abs(point.y - drag.from.y);
    if (dy > dx && Math.abs(fx - drag.home.col) <= settings.STICK) col = drag.home.col;
    if (dx > dy && Math.abs(fy - drag.home.y) <= settings.STICK) { y = drag.home.y; frow = y; }
  }
  return { col, y, frow, w: drag.w };
}

/** Away (DRAG.B1): set when the block's card at the target shares no column with its place in `start`, cleared only when it shares
 *  both a column and a row with it. @param {Layout} start the block's container at the carry's start or its last swap */
export function awayAt(away, start, id, at) {
  const place = start.boxes.get(id);
  if (!place) return true;   // just put into this container: away from the start
  const here = { ...place, col: at.col, y: at.y }, col = sharesCol(here, place), p = extent(here), q = extent(place);
  if (!away && !col) return true;
  if (away && col && p.r0 <= q.r1 && q.r0 <= p.r1) return false;
  return away;
}

/** One move of the pointer: what the carry asks next. `cur`, the container the block is in now (`start`, the tree of the last result,
 *  has it there). Outside the sheet's box and exactly at home nothing is asked (PR-1). A pointer that crossed a frame asks for the
 *  crossing, a `leave` to the sheet first when it came out of an area: the caller runs it and asks again with the same point.
 *  @param {Drag} drag @param {?string} cur @param {Layout} start @param {Point} point @param {Settings} settings @returns {Step} */
export function next(drag, cur, start, point, settings) {
  const to = over(drag, point);
  if (to === undefined) return { state: 'outside' };
  if (to !== cur) {
    const dest = cur != null ? null : to, at = aim(drag, dest, point, settings), cols = dest == null ? drag.cols : drag.frames.get(dest).cols;
    const cell = { col: Math.max(0, Math.min(at.col, cols - drag.w)), y: at.y };
    const change = cur != null ? { type: 'leave', box: cur, id: drag.id, at: cell } : { type: 'enter', box: null, id: drag.id, to, at: cell };
    return { state: 'move', drag: { ...drag, away: true }, to: dest, change };
  }
  const at = aim(drag, cur, point, settings);
  if (cur === drag.home.box && at.col === drag.home.col && at.y === drag.home.y) return { state: 'home' };
  const away = awayAt(drag.away, inside(start, cur), drag.id, at);
  return { state: 'move', drag: { ...drag, away }, to: cur, change: { type: 'carry', box: cur, id: drag.id, at, away } };
}
