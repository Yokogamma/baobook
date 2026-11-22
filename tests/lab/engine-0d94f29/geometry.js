// The pure geometry of the layout engine, one definition each (docs/LAYOUT-RULES.md §1.1, §5.3, AREA.7a, EDIT.1; LAYOUT-ENGINE-PLAN §2,
// §3.1): cards and extents, sharing a column or a row, hitting, reaching, reading and neighbour order, a container's range, the range a
// target is clamped to, what a point belongs to, an area's children on the sheet, and the sheet's columns read from `fx`. It imports nothing.

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout */

/** The largest cell any column, row, width or height may be (LAYOUT-RULES §1.5): the engine's range, not the format's. */
export const MAXCELL = 2 ** 20;
/** The grid step in pixels at the default text size, the width the sheet is read at in 0.1, and the sheet's columns there (§3.1, W11). */
export const G = 24, W0PX = 1458, SHEETW = Math.floor((W0PX - 2.5 * G) / G) + 1;
/** The sheet's first stored row today (`cMinRow`): a sheet block's engine row is its stored row minus this (§3.1). */
export const SHEET_ROW0 = 2;

/** Whether a kind takes part by its extent: an area, with one free cell round its frame (LAYOUT-RULES §1.1, AREA.7a). */
export const isArea = (b) => b.kind === 'area';

/** A block's card, its columns and rows inclusive: the handle cell `col` is not part of it (§1.1). */
export function card(b) { return { c0: b.col + 1, c1: b.col + b.w - 1, r0: b.y, r1: b.y + b.h - 1 }; }
/** What a block takes against another block of its container: its card, or an area's frame with one free cell on every side. */
export function extent(b) {
  return isArea(b) ? { c0: b.col, c1: b.col + b.w, r0: b.y - 1, r1: b.y + b.h } : card(b);
}

/** Two blocks share a column, or a row, by their extents (§1.1). */
export function sharesCol(a, b) { const p = extent(a), q = extent(b); return p.c0 <= q.c1 && q.c0 <= p.c1; }
export function sharesRow(a, b) { const p = extent(a), q = extent(b); return p.r0 <= q.r1 && q.r0 <= p.r1; }
/** Two blocks hit when their extents share a column and a row (INV-1 forbids it). */
export function hits(a, b) { return a.id !== b.id && sharesCol(a, b) && sharesRow(a, b); }

/** LAYOUT-RULES §5.3 «Reaches»: a block judged below the moved block reaches it when its top is above the moved block's bottom; one judged
 *  above, when its bottom is below the moved block's top; overlapping or not. @param {'below'|'above'} side */
export function reaches(n, moved, side) {
  const p = extent(n), q = extent(moved);
  return side === 'below' ? p.r0 <= q.r1 : p.r1 >= q.r0;
}

/** Ids compared by their code units, never by the device's language (LAYOUT-ENGINE-PLAN §4.1). */
export const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Reading order: by row, then by column, then by id (§1.1). */
export function readingCmp(a, b) { return a.y - b.y || a.col - b.col || byId(a.id, b.id); }
/** The ids of the boxes in reading order: a Layout's `order`. @param {Iterable<Box>} boxes */
export function readingOrder(boxes) { return [...boxes].sort(readingCmp).map((b) => b.id); }

/** The upper neighbours of a block: in at least one column of its extent, the nearest block above it (§1.3). @param {Box[]} boxes */
export function upperNeighbours(boxes, b) {
  const e = extent(b), best = new Map();
  for (const a of boxes) {
    if (a.id === b.id) continue;
    const p = extent(a); if (p.r1 >= e.r0) continue;
    for (let c = Math.max(p.c0, e.c0); c <= Math.min(p.c1, e.c1); c++) {
      const o = best.get(c); if (!o || extent(o).r1 < p.r1 || (extent(o).r1 === p.r1 && readingCmp(a, o) < 0)) best.set(c, a);
    }
  }
  return [...new Set(best.values())].sort(readingCmp);
}
/** Neighbour order: every upper neighbour before its lower neighbours, ties by reading order (§1.1). @param {Box[]} boxes */
export function neighbourOrder(boxes) {
  const ups = new Map(boxes.map((b) => [b.id, upperNeighbours(boxes, b).map((a) => a.id)])), done = new Set(), out = [];
  const left = [...boxes].sort(readingCmp);
  while (left.length) {
    const i = left.findIndex((b) => ups.get(b.id).every((id) => done.has(id)));
    if (i < 0) throw new Error('neighbour order: a cycle');   // only overlapping places make one
    const [b] = left.splice(i, 1); done.add(b.id); out.push(b.id);
  }
  return out;
}

/** Whether a value is a cell the engine can compute with: a whole number from 0 to MAXCELL (§1.5, LAYOUT-ENGINE-PLAN §3.5). */
export function inRange(v) { return Number.isInteger(v) && v >= 0 && v <= MAXCELL; }

/** The cells a block's place may take in a container of `cols` columns (INV-4, DRAG.A3's clamp, applied in phase 1c): its handle cell from
 *  column 0, its card ending at the last column at most, its row from 0; an area's frame from row 1 and its right free column at the last
 *  column at most, so that its free row above and its free column on the right lie inside (LAYOUT-RULES §1.1, proposed); its free column on
 *  the left is its handle cell. A card wider than the container has no column: colMax is below colMin. */
export function range(b, cols) { return { colMin: 0, colMax: cols - b.w - (isArea(b) ? 1 : 0), yMin: isArea(b) ? 1 : 0 }; }
/** A place clamped into that range, the card kept whole as long as it fits (DRAG.A3 narrows an elastic block first: changes.js). */
export function clampPlace(b, cols) {
  const r = range(b, cols);
  return { col: Math.max(r.colMin, Math.min(r.colMax, b.col)), y: Math.max(r.yMin, b.y) };
}

/** EDIT.1: the block a point belongs to, or null for the empty sheet. The point is in cells, fractional (x a column, y a row). A point on a
 *  card belongs to that card; within `near` to the right of a card or under it, to the first such card in reading order; a point past the
 *  container's columns is no part of it. The card includes the spare room of a set size, which its shown height already counts.
 *  @param {Box[]} boxes in any order */
export function pointOwner(boxes, x, y, near, cols) {
  if (x < 0 || y < 0 || x >= cols) return null;
  const sorted = [...boxes].sort(readingCmp);
  const on = sorted.find((b) => x >= b.col + 1 && x < b.col + b.w && y >= b.y && y < b.y + b.h);
  if (on) return on.id;
  const margin = sorted.find((b) => (x >= b.col + b.w && x < b.col + b.w + near && y >= b.y && y < b.y + b.h)
    || (x >= b.col + 1 && x < b.col + b.w && y >= b.y + b.h && y < b.y + b.h + near));
  return margin ? margin.id : null;
}

/** An area's child at its cell (c, r) stands on the sheet at (a + 1 + c, y + H + r), the area at sheet (a, y) with H header rows; its handle
 *  on the area's column c (LAYOUT-ENGINE-PLAN §3.1, LAYOUT-MODEL §3.1). And back. */
export function childToSheet(area, headerRows, child) { return { col: area.col + 1 + child.col, y: area.y + headerRows + child.y }; }
export function sheetToChild(area, headerRows, cell) { return { col: cell.col - area.col - 1, y: cell.y - area.y - headerRows }; }

/** The sheet's columns from today's stored `fx`, read at W0PX (§3.1): the dot column c = round((fx × W0PX − G/2) / G), the engine's col
 *  c − 1, no clamp here. And the `fx` a written column gets, which reads back to the same column. */
export function colFromFx(fx) { return Math.round((fx * W0PX - G / 2) / G) - 1; }
export function fxFromCol(col) { return (G / 2 + (col + 1) * G) / W0PX; }
/** A sheet block's engine row from its stored row, and back (§3.1). */
export const yFromRow = (row) => row - SHEET_ROW0, rowFromY = (y) => y + SHEET_ROW0;
