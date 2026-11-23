// An area's frame round its children (docs/LAYOUT-SEAMS-PLAN.md §6.1; LAYOUT-RULES AREA.2, §2.1): the one place it is computed, a
// function of what a layout already holds. The sheet's Layout carries each area's children in `areas` through every phase, so SETTLE
// reads the frame of an area it changes from the layout it is given, with no number handed in from outside; `tree.js`, `layout.js`
// and `validate.js` read the same functions.

import { extent } from './geometry.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Ctx} Ctx */

/** The rows a container's blocks take from its top, in the layout's measure. @param {Layout} L */
export const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
/** The same canonically: every block at its canonical row, its temporary rows taken off. @param {Layout} L */
export const canonicalBottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent({ ...b, y: b.yc ?? b.y, h: b.h - (b.t || 0) }).r1 + 1); return m; };
/** An area's frame rows for children that take `inner` rows, by its passport (header, children, a larger `ch`; collapsed, the header). */
export const frameRows = (area, inner, ctx) => ctx.kinds[area.kind].container.height(area, inner, ctx.measure);
/** An area's frame round its children: by its passport from the area's own fields as they are or will be (its width, which its
 *  header is measured at, `ch`, `collapsed`) and the rows its children take; `h`, the rows shown, and `t`, their temporary part, the
 *  growth its children's temporary rows make. `children`: its container, or null for none yet.
 *  @param {Box} area @param {?Layout} children @param {Ctx} ctx @returns {{h:number, t:number}} */
export function frameOf(area, children, ctx) {
  const h = frameRows(area, children ? bottomOf(children) : 0, ctx);
  return { h, t: h - frameRows(area, children ? canonicalBottomOf(children) : 0, ctx) };
}
