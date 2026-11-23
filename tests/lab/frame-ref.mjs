// L3 (docs/LAYOUT-SEAMS-PLAN.md §4.3): an area's frame by a formula written apart, from LAYOUT-RULES AREA.2 and §2.1 alone, sharing no
// code with public/layout/ (no passport, no geometry): the header at the area's width, measured; under it the rows its children reach;
// its set height `ch` when that is more; the header alone when it is collapsed. Canonically the children's canonical rows and heights
// count; as shown, their shown ones. What an area shows above the shown formula is its own temporary rows, which no field keeps apart
// until the frame is computed inside the solve (`tx`, §6.1): until then the shown frame is «at least» the formula, and the named cases
// of an area's own temporary row are in tests/layoutframe.mjs with what today's tree gives.

/** The rows a list of children reaches from the top of their area: canonical (row `yc`, height without the temporary rows) or shown. */
const reach = (children, shown) => Math.max(0, ...children.map((b) => (shown ? b.y + b.h : (b.yc ?? b.y) + b.h - (b.t || 0))));
/** @param {{id:string, w:number, ch?:number, collapsed?:boolean}} area @param {{y:number, yc?:number, h:number, t?:number}[]} children
 *  @param {{rows:(id:string, cells:number) => {rows:number}}} measure @returns {{canonical:number, shown:number}} the frame's rows */
export function frameRef(area, children, measure) {
  const header = measure.rows(area.id, area.w - 1).rows;
  const of = (shown) => (area.collapsed ? header : Math.max(header + reach(children, shown), area.ch || 0));
  return { canonical: of(false), shown: of(true) };
}
/** Every area of a tree against the formula: its canonical frame equal, its shown frame at least the shown formula, its temporary rows
 *  at least the difference of the two. @returns {string[]} */
export function framesAgainstRef(tree, measure) {
  const errs = [];
  for (const [id, C] of tree.areas) {
    const a = tree.boxes.get(id); if (!a) continue;
    const f = frameRef(a, [...C.boxes.values()], measure), t = a.t || 0;
    if (a.h - t !== f.canonical) errs.push(`${id}: a canonical frame of ${a.h - t} rows, the formula gives ${f.canonical}`);
    if (a.h < f.shown) errs.push(`${id}: a frame of ${a.h} rows shown, the formula gives ${f.shown}`);
    if (t < f.shown - f.canonical) errs.push(`${id}: ${t} temporary rows, its children's make ${f.shown - f.canonical}`);
  }
  return errs;
}
