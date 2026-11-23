// validate (docs/LAYOUT-SEAMS-PLAN.md §4.1): the structural invariants of one tree, the one check of a note every test and the dev look
// use in place of a `sound()` of their own. It returns the errors and repairs nothing. What it checks is what one tree shows: the blocks
// and their containers, each container's stacks and both its measures (gap.js `check`), the reading order, the bounds, and every area's
// frame round its children. The shape is checked first, and after an error of shape nothing of that container is read on, so that a
// broken tree is said and never thrown. It is no oracle of memory: two valid trees with the same rows can differ in what a later deletion gives, which
// the laws and the references judge (§4.3); and INV-5, determinism, is a law of several runs.

import { extent, isArea, readingOrder, range, inRange, MAXCELL } from './geometry.js';
import { check } from './gap.js';
import { bottomOf, canonicalBottomOf } from './frame.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Ctx} Ctx */

/** The runs of a gap: an array of `{o, n}`, each a whole number of rows from 1, owned by a block or by none, two neighbours never by
 *  the same owner (shapes.js `Run`). gap.js adds lengths up and never asks what one is. */
function runs(rs, say, where) {
  if (!Array.isArray(rs)) { say(`${where}: no runs`); return; }
  rs.forEach((r, i) => {
    if (!r || typeof r !== 'object') { say(`${where}: run ${i} is ${r}`); return; }
    if (!Number.isInteger(r.n) || r.n < 1 || r.n > MAXCELL) say(`${where}: a run of ${r.n} rows`);
    if (r.o !== null && typeof r.o !== 'string') say(`${where}: a run owned by ${r.o}`);
    if (i && rs[i - 1] && rs[i - 1].o === r.o) say(`${where}: two runs in a row owned by ${r.o}`);
  });
}
/** A block's stacks as kept (shapes.js `Stretch`, `Stack`): stretches of its columns, each with an anchor above or none and parts that
 *  alternate seg and stand. Which blocks they name and what rows they give is gap.js `check`'s, read from a shape that is whole. */
function stacks(b, say) {
  if (b.above == null) return;
  if (!Array.isArray(b.above)) { say(`${b.id}: its stacks are no list`); return; }
  b.above.forEach((s, i) => {
    const where = `${b.id}: stack ${i}`;
    if (!s || typeof s !== 'object' || !s.stack || typeof s.stack !== 'object') { say(`${where}: no stretch`); return; }
    if (!inRange(s.c0) || !inRange(s.c1) || s.c0 > s.c1) say(`${where}: columns ${s.c0} to ${s.c1}`);
    const st = s.stack;
    if (st.u !== null && typeof st.u !== 'string') say(`${where}: its anchor above is ${st.u}`);
    if (!Array.isArray(st.parts) || st.parts.length % 2 !== 1) { say(`${where}: its parts do not alternate seg and stand`); return; }
    st.parts.forEach((p, j) => {
      if (j % 2 === 0) { runs(p, say, `${where}, part ${j}`); return; }
      if (!p || typeof p !== 'object' || typeof p.id !== 'string') { say(`${where}, part ${j}: no stand`); return; }
      runs(p.lend, say, `${where}, part ${j}`);
    });
  });
}

/** The shape of one container, before anything is computed from it: a layout with its columns and measure, every box an object kept
 *  under its own id, of a kind the passports have as their own key, its numbers whole and in range, its stacks of the shape gap.js
 *  reads, the order a list of its boxes. @returns {string[]} the errors; with one, nothing else of the container is read */
function shape(L, name, ctx) {
  const errs = [], say = (e) => errs.push(name + ': ' + e);
  if (!L || typeof L !== 'object' || !(L.boxes instanceof Map) || !Array.isArray(L.order)) return [name + ': no layout'];
  if (!Number.isInteger(L.cols) || L.cols < 1 || L.cols > MAXCELL) say(`${L.cols} columns`);
  if (L.measure !== 'canonical' && L.measure !== 'displayed') say(`its measure is ${L.measure}`);
  for (const [id, b] of L.boxes) {
    if (!b || typeof b !== 'object' || b.id !== id) { say(`the box kept as ${id} is ${b && typeof b === 'object' ? b.id : b}`); continue; }
    if (typeof b.kind !== 'string' || !Object.hasOwn(ctx.kinds, b.kind)) { say(`${id}: no kind ${b.kind}`); continue; }
    for (const f of ['col', 'y', 'w', 'h']) if (!inRange(b[f])) say(`${id}.${f} = ${b[f]}`);
    for (const f of ['cw', 'ch', 't', 'yc']) if (b[f] != null && !inRange(b[f])) say(`${id}.${f} = ${b[f]}`);
    stacks(b, say);
  }
  if (L.order.length !== L.boxes.size || new Set(L.order).size !== L.order.length || L.order.some((id) => !L.boxes.has(id))) say('its order does not list its boxes');
  return errs;
}

/** One container by itself: its shape, its blocks' values, the reading order (INV-5), the bounds (INV-4, MAXCELL) and its stacks with
 *  both measures (INV-1 to INV-3; gap.js `check`). Exported for the tests of SETTLE in one container, where an area is a block with no
 *  children's container. @param {Layout} L @param {Ctx} ctx @param {string} [name] @returns {string[]} */
export function validateContainer(L, ctx, name = 'container') { return container(L, name, ctx).errs; }
/** @returns {{errs:string[], whole:boolean}} whole: its shape can be read on */
function container(L, name, ctx) {
  const errs = shape(L, name, ctx), say = (e) => errs.push(name + ': ' + e);
  if (errs.length) return { errs, whole: false };   // what follows reads these values
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
  return { errs: [...errs, ...check(L).map((e) => name + ': ' + e)], whole: true };
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
  const sheet = container(tree, 'sheet', ctx), errs = sheet.errs;
  if (!sheet.whole) return errs;   // the areas are found by the sheet's boxes
  if (!(tree.areas instanceof Map)) return [...errs, 'sheet: no areas'];
  const areas = tree.areas, seen = new Map([...tree.boxes.keys()].map((id) => [id, 'sheet']));
  for (const [id, C] of areas) {
    const a = tree.boxes.get(id);
    if (!isArea(a ?? {})) { errs.push(`a container with no area: ${id}`); continue; }
    const mine = container(C, id, ctx);
    errs.push(...mine.errs);
    if (!mine.whole) continue;
    for (const b of C.boxes.values()) {
      if (seen.has(b.id)) errs.push(`${b.id} in ${seen.get(b.id)} and in ${id}`); else seen.set(b.id, id);
      if (isArea(b)) errs.push(`${id}: an area in an area, ${b.id}`);
    }
    if (!(C.areas instanceof Map)) errs.push(`${id}: no areas`);
    else if (C.areas.size) errs.push(`${id}: a container under a child container`);
    if (C.cols !== a.w - 1) errs.push(`${id}: its children in ${C.cols} columns, its card ${a.w - 1}`);
    if (C.measure !== tree.measure) errs.push(`${id}: its children ${C.measure}, the sheet ${tree.measure}`);
    if (mine.errs.length || !ctx.kinds[a.kind].container) continue;   // a frame is judged round sound children
    const rows = (inner) => ctx.kinds[a.kind].container.height(a, inner, ctx.measure), t = a.t || 0;
    const canonical = rows(canonicalBottomOf(C)), shown = rows(bottomOf(C));
    if (a.h - t !== canonical) errs.push(`${id}: a canonical frame of ${a.h - t} rows, its children need ${canonical}`);
    if (a.h < shown) errs.push(`${id}: a frame of ${a.h} rows shown, its children need ${shown}`);
  }
  for (const b of tree.boxes.values()) if (isArea(b) && !areas.has(b.id)) errs.push(`an area with no container: ${b.id}`);
  return errs;
}
