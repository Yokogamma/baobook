// Letting through (docs/LAYOUT-RULES.md §5.1b, DRAG.B4; LAYOUT-ENGINE-PLAN §5.2, step 2b-2): the pure pieces of the THROUGH wrapper, over
// a working state and the carry memory. settle.js is the one reader of the switch: it runs phase 3 with `pinStep` after phases 1c and 2, ends
// a run of the pipeline at a swap with that swap's own RELINK, and runs phase 11 with `pressedOf` after the pipeline.
// The neighbour letting the block through stands in the memory with the row where it stopped and the side it stands on: «below» going down
// (under the moved block), «above» going up. While it is there it is judged neither way (PR-4); it is pinned where it stopped, the blocks
// under it following as in P-DOWN (going up, the blocks over it as in P-UP), and the moved block stands right against it; when `frow` puts
// the moved block's leading edge past its middle, the two swap.

import { extent, isArea, sharesCol } from './geometry.js';
import { sinkTo, up } from './primitives.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Work} Work
 *  @typedef {import('./shapes.js').Memory} Memory @typedef {import('./shapes.js').Target} Target */

// an extent's top row and its rows; the frame row of an extent row (an area's frame is a row under its extent's top)
const top = (b) => extent(b).r0, ext = (b) => { const e = extent(b); return e.r1 - e.r0 + 1; }, pad = (b) => (isArea(b) ? 1 : 0);
const put = (ws, id, y) => {   // a box at another frame row, nothing following and nothing recorded (the moved block is in no chain)
  const boxes = new Map(ws.L.boxes); boxes.set(id, { ...boxes.get(id), y });
  ws.L = { ...ws.L, boxes };
};

/** Phase 3 for a carry with THROUGH on, when the memory holds a neighbour: whether it leaves the memory, and otherwise its pin.
 *  - It leaves when the target row lies past the row the moved block is pinned at, on the side away from the neighbour: before a swap the
 *    block was carried back and the neighbour is pushed again like any other; after a swap the block goes on and the neighbour stays where
 *    it is. Then its judgements of phase 2, kept apart (`held`), count for the rest of this SETTLE.
 *  - Otherwise it is pinned where it stopped, the blocks under it following as in P-DOWN (going up, those over it as in P-UP), and the moved
 *    block is put right against it, on its touching row; then `swap` says whether `frow` takes the moved block's leading edge past its
 *    middle. @param {Work} ws @param {Memory} memory @param {Target} at
 *  @returns {{released:boolean, swap:boolean}} */
export function pinStep(ws, memory, at) {
  const th = memory.through, g = ws.moved, N0 = ws.L.boxes.get(th.id), X = ws.L.boxes.get(g);
  if (!N0 || !X) return { released: true, swap: false };
  const down = th.side === 'below', hX = ext(X), hN = ext(N0);
  const target = at.y - pad(X);
  if (down ? target < th.row - hX : target > th.row + hN) return { released: true, swap: false };
  // the neighbour where it stopped, and what it carries: down, the blocks under it follow (P-DOWN's push); up, those over it go up (P-UP),
  // as far as they can; the moved block right against it where it stands, on its touching row
  if (down) { if (top(N0) < th.row) sinkTo(ws, th.id, th.row + pad(N0), 'down'); }
  else if (top(N0) > th.row) liftTo(ws, th.id, th.row);
  const nRow = top(ws.L.boxes.get(th.id)), pinnedX = down ? nRow - hX : nRow + hN;
  put(ws, g, pinnedX + pad(X));
  const frow = (at.frow ?? at.y) - pad(X), mid = nRow + hN / 2;
  return { released: false, swap: down ? frow + hX > mid : frow < mid };
}

/** The neighbour up to a row as P-UP takes a block up, the blocks over it going up as far as it needs (nothing follows it up). */
function liftTo(ws, id, row) {
  const g = ws.moved, b = ws.L.boxes.get(id), d = top(b) - row; if (d <= 0) return;
  // P-UP lifts the blocks of `above` that reach the moved block until their bottom meets its top: here the neighbour alone, with the moved
  // block standing for a moment right under the row the neighbour is to reach
  const X = ws.L.boxes.get(g), keep = X.y;
  put(ws, g, row + ext(b) + pad(X));
  up(ws, new Set([id]));   // as far as the blocks over it can go; where they cannot, it stops lower, and the moved block is pinned there
  put(ws, g, keep);
}

/** Whether a swap can be declared (GAP's inputs, `swap`): the moved block and the neighbour both in `base`, the neighbour on the side the
 *  memory says (under the moved block going down, over it going up), and in some column of the moved block's place in `base` they share,
 *  nothing between them. A neighbour that shares none of those columns (the moved block came into its columns at the target), or that
 *  stands past another block, or on the other side already (P-UP's fallback put it there), is released instead, and its middle judges it
 *  (step 2b-2, proposed). @param {Layout} base @param {string} g @param {string} n @param {'below'|'above'} side */
export function canSwap(base, g, n, side) {
  const X = base.boxes.get(g), N = base.boxes.get(n); if (!X || !N) return false;
  const ex = extent(X), en = extent(N), down = side === 'below';
  if (down ? !(ex.r1 < en.r0) : !(en.r1 < ex.r0)) return false;
  for (let c = Math.max(ex.c0, en.c0); c <= Math.min(ex.c1, en.c1); c++) {
    const lo = down ? ex.r1 : en.r1, hi = down ? en.r0 : ex.r0;
    let between = false;
    for (const b of base.boxes.values()) {
      if (b.id === g || b.id === n) continue;
      const e = extent(b); if (e.c0 <= c && c <= e.c1 && e.r0 > lo && e.r1 < hi) { between = true; break; }
    }
    if (!between) return true;
  }
  return false;
}

/** The swap of phase 3: going down, the neighbour takes the moved block's pinned row and the moved block stands right under it; going up,
 *  the moved block takes the neighbour's top row and the neighbour stands right under it. Moves the two boxes of the working state (the
 *  swap's own steps are RELINK's, from the two heights it is made with, GAP's inputs) and returns the memory with the neighbour on its new
 *  row and the side it stands on flipped. @param {Work} ws @param {Memory} memory @returns {Memory} */
export function swapStep(ws, memory) {
  const th = memory.through, g = ws.moved, N = ws.L.boxes.get(th.id), X = ws.L.boxes.get(g), down = th.side === 'below';
  if (down) { const nTop = top(X); put(ws, th.id, nTop + pad(N)); put(ws, g, nTop + ext(N) + pad(X)); }
  else { const xTop = top(N); put(ws, g, xTop + pad(X)); put(ws, th.id, xTop + ext(X) + pad(N)); }
  const N2 = ws.L.boxes.get(th.id);
  return { ...memory, through: { id: th.id, row: top(N2), side: down ? 'above' : 'below' } };
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
