// Letting through (docs/LAYOUT-RULES.md §5.1b, DRAG.B4; LAYOUT-ENGINE-PLAN §5.2, step 2b-2): the pure pieces of the THROUGH wrapper, over
// layouts and the carry memory. settle.js is the one reader of the switch and runs them around the pipeline.
// The neighbour letting the block through stands in the memory with the target the moved block had when the neighbour was chosen (or where
// the last swap put it), the last target before that one, the row the neighbour stood at there and the side it stands on: «below» going
// down (under the moved block), «above» going up. While it is there the pipeline runs at that target, so the layout is the one the choice
// was made on and nothing is rebuilt from a row (the architecture review of 0a262d7); the pointer's own target says only when the neighbour
// leaves the memory and when the two swap.

import { extent, isArea, hits, sharesCol, readingOrder } from './geometry.js';
import { working, sink, sep } from './primitives.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Work} Work
 *  @typedef {import('./shapes.js').Memory} Memory @typedef {import('./shapes.js').Target} Target @typedef {import('./shapes.js').Change} Change
 *  @typedef {import('./shapes.js').Through} Through */

// an extent's top row and its rows; the frame row of an extent row (an area's frame is a row under its extent's top)
const top = (b) => extent(b).r0, ext = (b) => { const e = extent(b); return e.r1 - e.r0 + 1; }, pad = (b) => (isArea(b) ? 1 : 0);

/** The neighbour chosen in phase 11 from a result: its row there, its side, the moved block's target there (its own row, clamped as 1c
 *  clamped it, and the change's `frow`) and the last target before it. @param {Layout} layout @param {Change} change @param {string} id
 *  @param {'up'|'down'} dir @param {?Target} last @returns {Through} */
export function chosen(layout, change, id, dir, last) {
  const X = layout.boxes.get(change.id);
  return { id, row: top(layout.boxes.get(id)), side: dir === 'down' ? 'below' : 'above', at: { col: X.col, y: X.y, frow: change.at.frow ?? change.at.y }, last: last ? { ...last } : null, line: null };
}

/** The change as the pipeline runs it while the neighbour is held: the target's row and `frow` the ones of the choice (or of the swap), its
 *  column the pointer's, so that a carry along the rows shows the layout the choice was made on. @param {Change} change @param {Through} th
 *  @returns {Change} */
export function heldChange(change, th) { return { ...change, at: { ...change.at, y: th.at.y, frow: th.at.frow } }; }

/** Whether the target's row lies past the row the moved block is held at, on the side away from the neighbour: going down, a row above
 *  it (carried back before a swap, or on up after one); going up, a row below it. @param {Through} th @param {Target} at */
export function past(th, at) { return th.side === 'below' ? at.y < th.at.y : at.y > th.at.y; }

/** The neighbour's top row when it stands, in this result, right against the moved block's leading edge on its side, in a column they
 *  share; otherwise null (carried sideways off it, or it went elsewhere). @param {Layout} layout @param {string} g @param {Through} th
 *  @returns {?number} */
export function against(layout, g, th) {
  const N = layout.boxes.get(th.id), X = layout.boxes.get(g); if (!N || !X || !sharesCol(N, X)) return null;
  const n = extent(N), x = extent(X);
  return (th.side === 'below' ? x.r1 + 1 === n.r0 : n.r1 + 1 === x.r0) ? n.r0 : null;
}

/** Whether `frow` takes the moved block's leading edge past the neighbour's middle, in this result; after a swap, also back over the line
 *  the swap crossed (`line`, the `frow` at which the two would stand at their old rows' middle): a height that the swap's run changed (a
 *  text resting at another width beside the moved block) would otherwise swap them back at once (step 2b, proposed; found by
 *  tests/layoutgestures.mjs). @param {Layout} layout @param {string} g @param {Through} th @param {Target} at */
export function pastMiddle(layout, g, th, at) {
  const N = layout.boxes.get(th.id), X = layout.boxes.get(g), frow = (at.frow ?? at.y) - pad(X), mid = top(N) + ext(N) / 2;
  if (th.side === 'below') return frow + ext(X) > mid && (th.line == null || frow > th.line);
  return frow < mid && (th.line == null || frow < th.line);
}
/** The line a swap crosses, in `frow` (frame rows of the moved block's top, the pad taken off): going down the moved block's bottom passes
 *  the neighbour's middle, `frow` > line; going up its top does, `frow` < line. The same line, the other way, takes them back.
 *  @param {Layout} layout @param {string} g @param {Through} th @returns {number} */
export function lineOf(layout, g, th) {
  const N = layout.boxes.get(th.id), X = layout.boxes.get(g), mid = top(N) + ext(N) / 2;
  return th.side === 'below' ? mid - ext(X) : mid;
}

/** Whether the neighbour keeps its side by its place in `start` (DRAG.B2), so that only a swap takes the moved block past it: both blocks
 *  there, the neighbour on the side the memory says, and in some column of the moved block's place they share, nothing between them. A
 *  neighbour that shares none of those columns (the moved block came into its columns at the target) or stands past another block is
 *  judged by its middle, and past it is released instead (step 2b-2, proposed). @param {Layout} start @param {string} g @param {string} n
 *  @param {'below'|'above'} side */
export function canSwap(start, g, n, side) {
  const X = start.boxes.get(g), N = start.boxes.get(n); if (!X || !N) return false;
  const ex = extent(X), en = extent(N), down = side === 'below';
  if (down ? !(ex.r1 < en.r0) : !(en.r1 < ex.r0)) return false;
  for (let c = Math.max(ex.c0, en.c0); c <= Math.min(ex.c1, en.c1); c++) {
    const lo = down ? ex.r1 : en.r1, hi = down ? en.r0 : ex.r0;
    let between = false;
    for (const b of start.boxes.values()) {
      if (b.id === g || b.id === n) continue;
      const e = extent(b); if (e.c0 <= c && c <= e.c1 && e.r0 > lo && e.r1 < hi) { between = true; break; }
    }
    if (!between) return true;
  }
  return false;
}

/** The swap, on the result the pointer saw (§5.1b): going down, the neighbour takes the moved block's top row and the moved block stands
 *  right under it; going up, the moved block takes the neighbour's top row and the neighbour stands right under it. What the two now meet
 *  sinks against them, the pair held where the swap put it; any other hit, the lower one sinking (P-SEP). A working state over that
 *  result, for the swap's own RELINK with that result as its base (step 2b, proposed: the two touch and share a column there, so the swap
 *  is always one GAP's inputs can declare). @param {Layout} R @param {string} g @param {Through} th @param {object} ctx @param {number} guard
 *  @returns {Work} */
export function swapped(R, g, th, ctx, guard) {
  const n = th.id, ws = working(R, g, ctx, false), N = R.boxes.get(n), X = R.boxes.get(g);
  const boxes = new Map(R.boxes);
  if (th.side === 'below') { const t = top(X); boxes.set(n, { ...N, y: t + pad(N) }); boxes.set(g, { ...X, y: t + ext(N) + pad(X) }); }
  else { const t = top(N); boxes.set(g, { ...X, y: t + pad(X) }); boxes.set(n, { ...N, y: t + ext(X) + pad(N) }); }
  const order = readingOrder(boxes.values());
  ws.L = { ...R, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order };
  const pair = (id) => id === g || id === n;
  for (let k = 0; ; k++) {
    let h = null;
    for (let i = 0; i < ws.L.order.length && !h; i++) for (let j = i + 1; j < ws.L.order.length; j++) {
      const a = ws.L.boxes.get(ws.L.order[i]), b = ws.L.boxes.get(ws.L.order[j]); if (hits(a, b)) { h = [a.id, b.id]; break; }
    }
    if (!h) return ws;
    if (k > guard) throw new Error('settle: the swap\'s separation does not end');
    if (pair(h[0]) || pair(h[1])) { const o = pair(h[0]) ? h[1] : h[0], p = o === h[0] ? h[1] : h[0]; sink(ws, o, (x) => x === p, (a, b) => hits(a, b), 'sep'); }
    else sep(ws, h[0], h[1]);
  }
}

/** The memory's neighbour after the swap, in the swap's relinked layout: on the other side, at its new row, the moved block's target where
 *  the swap put it, and the line the swap crossed. @param {Layout} L @param {string} g @param {Through} th @param {?Target} last
 *  @param {number} line @returns {Through} */
export function flipped(L, g, th, last, line) {
  const X = L.boxes.get(g);
  return { id: th.id, row: top(L.boxes.get(th.id)), side: th.side === 'below' ? 'above' : 'below', at: { col: X.col, y: X.y, frow: X.y }, last: last ? { ...last } : null, line };
}

/** Phase 11's candidates: the blocks that, in this result, touch the moved block's leading edge in the memory's direction, share a column
 *  with it and are not met from the side; `pressed` is the first in reading order, or null (DRAG.B4 lights it and times the hold on it).
 *  @param {Layout} layout @param {string} g @param {Map<string,string>} met @param {'up'|'down'} dir @returns {?string} */
export function pressedOf(layout, g, met, dir) {
  const X = layout.boxes.get(g); if (!X) return null;
  const e = extent(X);
  for (const id of layout.order) {
    if (id === g || met.has(id)) continue;
    const b = layout.boxes.get(id), f = extent(b);
    if (!sharesCol(b, X)) continue;
    if (dir === 'down' ? f.r0 === e.r1 + 1 : f.r1 + 1 === e.r0) return id;
  }
  return null;
}
