// validate (docs/LAYOUT-SEAMS-PLAN.md §4.1): the structural invariants of one tree, the one check of a note every test and the dev look
// use in place of a `sound()` of their own. It returns the errors and repairs nothing. What it checks is what one tree shows: the blocks
// and their containers, each container's stacks and both its measures (gap.js `check`), the reading order, the bounds, and every area's
// frame round its children. It is no oracle of memory: two valid trees with the same rows can differ in what a later deletion gives, which
// the laws and the references judge (§4.3); and INV-5, determinism, is a law of several runs.

import { extent, isArea, readingOrder, range, inRange, MAXCELL } from './geometry.js';
import { check } from './gap.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Ctx} Ctx */

/** The rows a container's blocks take from its top, as shown and canonically (an area's frame holds them, AREA.2). */
const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
const canonicalBottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent({ ...b, y: b.yc ?? b.y, h: b.h - (b.t || 0) }).r1 + 1); return m; };

/** One container by itself: its shape, its blocks' values, the reading order (INV-5), the bounds (INV-4, MAXCELL) and its stacks with
 *  both measures (INV-1 to INV-3; gap.js `check`). Exported for the tests of SETTLE in one container, where an area is a block with no
 *  children's container. @param {Layout} L @param {Ctx} ctx @param {string} [name] @returns {string[]} */
export function validateContainer(L, ctx, name = 'container') { return container(L, name, ctx); }
function container(L, name, ctx) {
  const errs = [], say = (e) => errs.push(name + ': ' + e);
  if (!L || !(L.boxes instanceof Map) || !Array.isArray(L.order)) return [name + ': no layout'];
  if (!Number.isInteger(L.cols) || L.cols < 1) say(`${L.cols} columns`);
  if (L.measure !== 'canonical' && L.measure !== 'displayed') say(`its measure is ${L.measure}`);
  let whole = true;
  for (const [id, b] of L.boxes) {
    if (!b || b.id !== id) { say(`the box kept as ${id} is ${b && b.id}`); whole = false; continue; }
    if (!ctx.kinds[b.kind]) { say(`${id}: no kind ${b.kind}`); whole = false; continue; }
    for (const f of ['col', 'y', 'w', 'h']) if (!inRange(b[f])) { say(`${id}.${f} = ${b[f]}`); whole = false; }
    for (const f of ['cw', 'ch', 't', 'yc']) if (b[f] != null && !inRange(b[f])) { say(`${id}.${f} = ${b[f]}`); whole = false; }
  }
  if (L.order.length !== L.boxes.size || L.order.some((id) => !L.boxes.has(id))) { say('its order does not list its boxes'); whole = false; }
  if (!whole) return errs;   // what follows reads these values
  const ro = readingOrder(L.boxes.values());
  if (!L.order.every((id, i) => id === ro[i])) say('not in reading order');
  for (const b of L.boxes.values()) {
    const t = b.t || 0;
    if (b.w < 2) say(`${b.id}: a card of ${b.w - 1} cells`);
    if (b.h < 1 || t > b.h - 1) say(`${b.id}: ${b.h} rows, ${t} of them temporary`);
    if (L.measure === 'canonical' && (t !== 0 || (b.yc ?? b.y) !== b.y)) say(`${b.id}: temporary rows in the canonical layout`);
    if ((b.yc ?? b.y) > b.y) say(`${b.id}: its canonical row ${b.yc} below its displayed row ${b.y}`);
    const r = range(b, L.cols);
    if (b.col < r.colMin || b.col > r.colMax || b.y < r.yMin) say(`${b.id} outside its container`);
    if (extent(b).r1 + 1 > MAXCELL) say(`${b.id} past MAXCELL`);
  }
  return [...errs, ...check(L).map((e) => name + ': ' + e)];
}

/** The errors of a tree: [] when it is valid. `tree` is the sheet's Layout with each area's children in `areas` (one level, §3.1); a
 *  single container with no areas is a tree too. Checked, beyond each container by itself:
 *  - every block in one container only; every area on the sheet with its container and no container without its area; no area in an
 *    area, and no container under a child container;
 *  - a child container's columns are its area's inner width, `w − 1`: neither its stacks nor the frame's height show a container laid
 *    out in other columns than its area has;
 *  - a child container in the measure of the sheet;
 *  - every area's frame round its children by its passport (`container.height`: its header at its width, its children's rows, `ch`,
 *    `collapsed`): canonically an equality; as shown, at least the frame its shown children give. The rows above that are the area's own
 *    temporary rows (`show`'s `temp`), which no field of the tree keeps apart yet: the frame inside the solve gives them their own field
 *    (`tx`, LAYOUT-SEAMS-PLAN §6.1), and this check becomes an equality with it.
 *  @param {Layout} tree @param {Ctx} ctx @returns {string[]} */
export function validate(tree, ctx) {
  const errs = container(tree, 'sheet', ctx);
  if (errs.some((e) => e === 'sheet: no layout')) return errs;
  const areas = tree.areas instanceof Map ? tree.areas : new Map(), seen = new Map([...tree.boxes.keys()].map((id) => [id, 'sheet']));
  if (!(tree.areas instanceof Map)) errs.push('sheet: no areas');
  for (const [id, C] of areas) {
    const a = tree.boxes.get(id);
    if (!a || !isArea(a)) { errs.push(`a container with no area: ${id}`); continue; }
    const mine = container(C, id, ctx);
    errs.push(...mine);
    if (mine.some((e) => e === id + ': no layout')) continue;
    for (const b of C.boxes.values()) {
      if (seen.has(b.id)) errs.push(`${b.id} in ${seen.get(b.id)} and in ${id}`); else seen.set(b.id, id);
      if (isArea(b)) errs.push(`${id}: an area in an area, ${b.id}`);
    }
    if (C.areas instanceof Map && C.areas.size) errs.push(`${id}: a container under a child container`);
    if (C.cols !== a.w - 1) errs.push(`${id}: its children in ${C.cols} columns, its card ${a.w - 1}`);
    if (C.measure !== tree.measure) errs.push(`${id}: its children ${C.measure}, the sheet ${tree.measure}`);
    if (mine.length || !ctx.kinds[a.kind]?.container) continue;   // a frame is judged round sound children
    const rows = (inner) => ctx.kinds[a.kind].container.height(a, inner, ctx.measure), t = a.t || 0;
    const canonical = rows(canonicalBottomOf(C)), shown = rows(bottomOf(C));
    if (a.h - t !== canonical) errs.push(`${id}: a canonical frame of ${a.h - t} rows, its children need ${canonical}`);
    if (a.h < shown) errs.push(`${id}: a frame of ${a.h} rows shown, its children need ${shown}`);
  }
  for (const b of tree.boxes.values()) if (isArea(b) && !areas.has(b.id)) errs.push(`an area with no container: ${b.id}`);
  return errs;
}
