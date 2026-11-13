// SIZE (docs/LAYOUT-RULES.md §3): how big a block is. It answers three questions, through the passports and the Measure: a block's rows at
// a width, the narrowest it may get, and its rest width on the rows it stands on. It writes nothing: phase 9 (a) and `open()` take its
// answers and set them through gap.js's `resize`, the one writer of a box's height. Widths here are card cells, `w − 1` of a Box.

import { on } from './rules.js';
import { extent } from './geometry.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx */

const kindOf = (box, ctx) => { const k = ctx.kinds[box.kind]; if (!k) throw new Error('size: no passport for ' + box.kind); return k; };
/** A box's card width in cells. */
export const cellsOf = (box) => box.w - 1;

/** Whether its width follows its content: a kind that is 'text' by its passport and has no set width (SIZE.1, SIZE.3). */
export function isElastic(box, ctx) { return kindOf(box, ctx).width === 'text' && box.cw == null; }

/** Its rows at a card width, canonical and displayed (SIZE.6, through the passport). @returns {{rows:number, shown:number}} */
export function rowsAt(box, cells, ctx) { return kindOf(box, ctx).rows(box, cells, ctx.measure); }

/** The widest it gets by itself: an elastic block's natural width up to TEXTW, never below its kind's floor; a set width's `cw`; an area's
 *  `cw`, at least its floor (SIZE.1, SIZE.3). */
export function capCells(box, ctx) {
  const k = kindOf(box, ctx), floor = k.minCells(box, ctx.measure);
  if (box.cw != null) return Math.max(floor, box.cw);
  if (k.width === 'set') return floor;
  return Math.max(floor, Math.min(ctx.measure.natural(box.id), ctx.settings.TEXTW));
}

/** The narrowest it may get when pressed: an elastic block's min(natural width, MINC), never below its kind's floor; null for a block that
 *  never narrows: a set width (SIZE.3), and every block under «never narrow» or with SIZE.2 off (SIZE.2). */
export function minCells(box, ctx) {
  if (!isElastic(box, ctx) || ctx.settings.ORDER === 'never' || !on(ctx.rules, 'SIZE.2')) return null;
  const floor = kindOf(box, ctx).minCells(box, ctx.measure);
  return Math.max(floor, Math.min(ctx.measure.natural(box.id), ctx.settings.MINC));
}

/** The room to its right at a width: up to the container's right edge, and up to the handle cell of the nearest block to its right on the
 *  rows it takes at that width (an area's handle cell is its free column), in card cells (SIZE.1). @param {Layout} layout */
export function roomAt(layout, box, cells, ctx) {
  const h = rowsAt(box, cells, ctx).shown, r0 = box.y, r1 = box.y + h - 1;
  let edge = layout.cols;
  for (const id of layout.order) {
    const o = layout.boxes.get(id); if (o.id === box.id || o.col <= box.col) continue;
    const e = extent(o); if (e.r0 <= r1 && r0 <= e.r1) edge = Math.min(edge, o.col);
  }
  return edge - (box.col + 1);
}

/** SIZE.1 the rest width, in card cells: an elastic block's natural width, at most TEXTW, no wider than the room it has at that width, and
 *  never narrower than min(natural width, MINC) and its kind's floor, the same under every ORDER (SIZE.4); a set width's `cw`. With
 *  SIZE.1 off, min(natural width, TEXTW), clamped to the container's columns, whatever stands to its right. The rows a width takes decide
 *  which neighbours cross it, so the widest width that fits its own room is taken. */
export function restCells(layout, box, ctx) {
  const cap = capCells(box, ctx);
  if (!isElastic(box, ctx)) return cap;
  const inside = Math.max(1, layout.cols - (box.col + 1));
  if (!on(ctx.rules, 'SIZE.1')) return Math.min(cap, inside);
  // its floor, but never past its container's last column (INV-4, core): a block nearer the right edge than its floor narrows to the edge
  const floor = Math.min(inside, Math.max(kindOf(box, ctx).minCells(box, ctx.measure), Math.min(ctx.measure.natural(box.id), ctx.settings.MINC)));
  for (let w = Math.min(cap, inside); w > floor; w--) if (w <= roomAt(layout, box, w, ctx)) return w;
  return floor;   // it does not fit even at its floor: it hits, which P-REST or P-SEP settles (phase 9 (b))
}
