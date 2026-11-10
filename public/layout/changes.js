// The change kinds (docs/LAYOUT-RULES.md §5.2; LAYOUT-ENGINE-PLAN §2.1 `ChangeKind`): one row of data per kind of change that reaches
// SETTLE, what it moves, how phase 2 judges, what a block with no room aside does and what containment does, so settle.js holds no table
// of changes of its own and derives the phases from these fields; and the judges of phase 2: the carry's (DRAG.B2 above or below, DRAG.B3
// met from the side, with the sides kept in the carry memory) and the wall's (an area's side handle inside the area, the width handle's
// moving edge). The composite changes (enter, leave, ungroup, drawArea, areaSide) never reach here: tree.js takes them apart (§5.6).

import { on } from './rules.js';
import { extent, isArea, sharesCol, sharesRow, hits } from './geometry.js';

/** @typedef {import('./shapes.js').ChangeKind} ChangeKind @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box
 *  @typedef {import('./shapes.js').Target} Target @typedef {import('./shapes.js').Memory} Memory @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Judged} Judged @typedef {import('./shapes.js').CarryChange} CarryChange */

/** One row per kind of LAYOUT-RULES §5.2, keyed by Change.type. @type {Readonly<Record<string, ChangeKind>>} */
export const CHANGE_KINDS = Object.freeze({
  // a pointer move while carrying, an arrow of position mode (a carry with an empty memory), a creation (away from the start)
  carry: Object.freeze({ moved: 'target', judge: 'carry', noRoom: 'side', contain: Object.freeze({ width: 'clamp', bottom: 'grow' }) }),
  create: Object.freeze({ moved: 'target', judge: 'carry', noRoom: 'side', contain: Object.freeze({ width: 'clamp', bottom: 'grow' }) }),
  // the width handle, and an area's side handle in the area's container
  width: Object.freeze({ moved: 'self', judge: 'wall', noRoom: 'sink', contain: Object.freeze({ width: 'clamp', bottom: 'grow' }) }),
  // an area's side handle inside the area: the moving edge is a wall
  wall: Object.freeze({ moved: 'none', judge: 'wall', noRoom: 'sink', contain: Object.freeze({ width: 'none', bottom: 'refuse' }) }),
  // typing, a fold, the height handle, a re-measure, a collapse, an area grown (settleTree)
  size: Object.freeze({ moved: 'none', judge: 'none', noRoom: 'none', contain: Object.freeze({ width: 'none', bottom: 'grow' }) }),
  remove: Object.freeze({ moved: 'none', judge: 'none', noRoom: 'none', contain: Object.freeze({ width: 'none', bottom: 'none' }) }),
});

/** The kind of a change, or an error for a composite or unknown one. @returns {ChangeKind} */
export function kindOf(change) {
  const k = CHANGE_KINDS[change.type];
  if (!k) throw new Error('changes: ' + change.type + ' is not a change SETTLE takes (a composite is settleTree\'s)');
  return k;
}

// an extent's middle row and middle column, and the cells two extents share across the columns and along the rows
const midRow = (e) => (e.r0 + e.r1 + 1) / 2, midCol = (e) => (e.c0 + e.c1 + 1) / 2;
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1);

/** Whether the last move between two targets was sideways: more across the columns than along the rows; vertical before any move
 *  (DRAG.B3). @param {?Target} last @param {Target} at */
export function sideways(last, at) { return !!last && Math.abs(at.col - last.col) > Math.abs(at.y - last.y); }

/** The carry's judge (phase 2; DRAG.B2 and B3, LAYOUT-RULES §6.B): on the layout after phase 1c, the moved block at its target, `start`
 *  the layout at the start of the carry or at the last swap, the change (a carry or a creation: its block `id`, its target `at` and its own
 *  `away`, which its maker set and the judge reads alone, LAYOUT-ENGINE-PLAN §2.1) and the carry memory.
 *  - Above or below, every block that shares a column with the moved block (DRAG.B2): one that stood in its columns in `start` keeps the
 *    side it had there, unless the block is away; any other is below when its middle is strictly below `frow`, the unrounded row of the
 *    moved block's top (an area's frame, its stored and shown place), otherwise above. With `DRAG.B2.keep` off every block is judged by
 *    `frow` and its middle.
 *  - Met from the side, every block that hits it (DRAG.B3): when the overlap across the columns is smaller than the overlap along the rows,
 *    or equal and the last move was sideways; pressed to the side its centre lies on, to the left when the centres coincide. Once met from
 *    the side, it stays so while it shares a row with the target's rows (the memory's `sides`). With `DRAG.B3` off nothing is met from the
 *    side.
 *  - The neighbour letting the block through is judged like any other, but apart (`held`): its judgements count only if phase 3 releases
 *    it (LAYOUT-RULES §5.1 phase 2, PR-4).
 *  The sides met are returned for the memory; nothing here writes it (PR-7).
 *  @param {Layout} layout @param {?Layout} start @param {{id:string, at:Target, away?:boolean}} change @param {Memory} memory @param {Ctx} ctx
 *  @returns {Judged & {sides:Map<string,'left'|'right'>, held:?{side?:'above'|'below', met?:'left'|'right'}}} */
export function judgeCarry(layout, start, change, memory, ctx) {
  const g = change.id, at = change.at, G = layout.boxes.get(g), eg = extent(G), side = new Map(), met = new Map(), sides = new Map();
  const through = memory.through ? memory.through.id : null, keep = on(ctx.rules, 'DRAG.B2.keep') && !change.away;
  const S = start ? start.boxes.get(g) : null, frow = at.frow ?? at.y;
  let held = null;
  for (const id of layout.order) {
    if (id === g) continue;
    const n = layout.boxes.get(id), en = extent(n), sd = id === through ? (held = {}) : null;
    if (sharesCol(n, G)) {
      const was = keep && S && start.boxes.get(id);
      const v = was && sharesCol(was, S) ? (extent(was).r0 < extent(S).r0 ? 'above' : 'below') : midRow(en) > frow ? 'below' : 'above';
      if (sd) sd.side = v; else side.set(id, v);
    }
    if (!on(ctx.rules, 'DRAG.B3') || !hits(n, G)) continue;
    const kept = memory.sides && memory.sides.get(id);
    let m = null;
    if (kept && sharesRow(n, G)) m = kept;
    else {
      const across = overlap(en.c0, en.c1, eg.c0, eg.c1), along = overlap(en.r0, en.r1, eg.r0, eg.r1);
      if (across < along || (across === along && sideways(memory.lastTarget, at))) m = midCol(en) > midCol(eg) ? 'right' : 'left';
    }
    if (m) { if (sd) sd.met = m; else met.set(id, m); }
  }
  for (const [id, s] of met) sides.set(id, s);
  // a block met from the side earlier keeps its record while it shares a row with the target's rows, hit or not
  if (memory.sides) for (const [id, s] of memory.sides) if (!sides.has(id) && layout.boxes.has(id) && sharesRow(layout.boxes.get(id), G)) sides.set(id, s);
  return { side, met, sides, held };
}

/** The wall's judge (phase 2; LAYOUT-RULES §5.3 «Obstacle»):
 *  - `wall`: an area's side handle inside the area, its new columns `cols` already the layout's: every child whose card passes the last
 *    column is met from the side and pressed left; every child whose handle cell is left of column 0 (the left edge, after `shift`) is
 *    pressed right.
 *  - `width`: the widened block `g` at its new width (and, for an area's left edge, its new column): every block its extent now overlaps
 *    is met from the side, pressed away from the moving edge, to the right by a right edge, to the left by a left edge.
 *  Nothing is above or below. @param {Layout} layout @param {{type:'wall'|'width', id?:string, side?:'left'|'right'}} change @returns {Judged} */
export function judgeWall(layout, change) {
  const met = new Map();
  if (change.type === 'wall') {
    for (const id of layout.order) {
      const b = layout.boxes.get(id);
      if (extent(b).c1 > layout.cols - 1) met.set(id, 'left'); else if (b.col < 0) met.set(id, 'right');
    }
  } else {
    const G = layout.boxes.get(change.id), to = change.side === 'left' ? 'left' : 'right';
    for (const id of layout.order) if (id !== change.id && hits(layout.boxes.get(id), G)) met.set(id, to);
  }
  return { side: new Map(), met };
}
