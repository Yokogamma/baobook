// Node: an area's frame against the formula written apart (tests/lab/frame-ref.mjs; docs/LAYOUT-SEAMS-PLAN.md §4.3, L3), by named cases:
// a plain area, a collapsed one, a set height larger than the content and smaller, a header that wraps at the area's width, children
// with temporary rows, an area's own temporary row with and without its children's. The sequences ask the same of every tree they
// make (tests/layoutseq.mjs). The frame the engine computes is tree.js's today and frame.js's once it is computed inside the solve
// (§6): the cases of an area's own temporary row state what today's tree gives, an inequality, which becomes an equality with `tx`.
import { frameRef, framesAgainstRef } from './lab/frame-ref.mjs';
import { open, show, unshow } from '../public/layout/layout.js';
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { readingOrder } from '../public/layout/geometry.js';
import { chars, ctxOf, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const S = (id, col, y, cw) => ({ id, kind: 'text', col, y, cw });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const note = (area, kids) => ({ ...lay(40, [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 12, ...area }]), areas: new Map([['R', lay(0, kids)]]) });
/** The case opened: the area's canonical and shown frames, the formula's, and the errors of the comparison on both trees. */
function frames(area, kids, map, temp) {
  const ctx = ctxOf({ R: { kind: 'area' }, ...map }), o = open(note(area, kids), ctx);
  if (!o.ok) return { failed: o };
  const shown = temp ? show(o.layout, temp, ctx) : o.shown, a = shown.boxes.get('R'), f = frameRef(a, [...shown.areas.get('R').boxes.values()], ctx.measure);
  return { canonical: a.h - (a.t || 0), shown: a.h, t: a.t || 0, ref: f, errs: [...framesAgainstRef(o.layout, ctx.measure), ...framesAgainstRef(shown, ctx.measure)], ctx, tree: shown };
}
const same = (n, r, canonical, shown) => ok(`${n}: ${r.canonical} rows, ${r.shown} shown; the formula ${r.ref?.canonical} and ${r.ref?.shown}`,
  !r.failed && !r.errs.length && r.canonical === canonical && r.shown === shown && r.ref.canonical === canonical && r.ref.shown === shown, r.failed || [r.canonical, r.shown, r.ref, r.errs]);

const kids = [S('c', 0, 0, 3), S('d', 4, 2, 4)], map = { c: { text: 'x' }, d: { text: 'x' } };
same('1 a header of one row over children that reach three rows', frames({}, kids, map), 4, 4);
same('2 no children: the header alone', frames({}, [], {}), 1, 1);
same('3 collapsed: the header alone, whatever its children reach', frames({ collapsed: true }, kids, map), 1, 1);
same('4 a set height larger than the content: the set height', frames({ ch: 9 }, kids, map), 9, 9);
same('5 a set height smaller than the content: the content', frames({ ch: 2 }, kids, map), 4, 4);
same('6 a header that wraps at the area\'s width (80 letters in 12 cells: 3 rows) over the same children', frames({}, kids, { ...map, R: { text: chars(80) } }), 6, 6);
same('6a and a tall header given by the measure', frames({}, kids, { ...map, R: { kind: 'area', header: 2 } }), 5, 5);
same('7 the lowest child shows two temporary rows: the frame shows two more, canonically the same', frames({}, kids, { ...map, d: { text: 'x', temp: 2 } }), 4, 6);
same('7a a child above the lowest shows one that reaches no lower: nothing more shown', frames({}, kids, { ...map, c: { text: 'x', temp: 1 } }), 4, 4);
same('7b under a larger set height the children\'s temporary rows show nothing more', frames({ ch: 9 }, kids, { ...map, d: { text: 'x', temp: 2 } }), 9, 9);
same('7c collapsed, they show nothing', frames({ collapsed: true }, kids, { ...map, d: { text: 'x', temp: 2 } }), 1, 1);
{
  // an area's own temporary row (`show`'s temp for the area): above the formula today, no field keeping it apart (§6.1 gives it `tx`)
  const own = frames({}, kids, map, new Map([['R', 1]]));
  ok(`8 an own temporary row, its children showing none: ${own.shown} rows shown, one over the formula's ${own.ref.shown}; canonically the formula's`, !own.errs.length && own.canonical === 4 && own.shown === 5 && own.ref.shown === 4 && own.t === 1, own);
  const both = frames({}, kids, { ...map, d: { text: 'x', temp: 2 } }, new Map([['R', 1]]));
  ok(`8a an own temporary row over its children's two: ${both.shown} rows shown, one over the formula's ${both.ref.shown}, three temporary`, !both.errs.length && both.canonical === 4 && both.shown === 7 && both.ref.shown === 6 && both.t === 3, both);
}
{
  // the frame follows a change inside the area: typing that makes the lowest child taller, and the area's own handle making it narrower
  const r = frames({}, kids, map), ctx2 = ctxOf({ R: { kind: 'area' }, c: { text: 'x' }, d: { text: chars(40) } });
  const g = settleTree(r.tree, { type: 'size', box: 'R', id: 'd' }, emptyMemory(), ctx2);
  ok('9 the lowest child grows by typing: the frame is the formula\'s again', g.ok && !framesAgainstRef(g.layout, ctx2.measure).length && g.layout.boxes.get('R').h === frameRef(g.layout.boxes.get('R'), [...g.layout.areas.get('R').boxes.values()], ctx2.measure).shown && g.layout.boxes.get('R').h > 4, g.ok ? [g.layout.boxes.get('R').h, framesAgainstRef(g.layout, ctx2.measure)] : g);
  const C = g.ok && unshow(g.layout, ctx2);
  ok('9a and canonically', !!C && !framesAgainstRef(C, ctx2.measure).length, C && framesAgainstRef(C, ctx2.measure));
}
{
  // the formula tells: a frame a row off is said, canonical or shown
  const r = frames({}, kids, { ...map, d: { text: 'x', temp: 2 } }), off = (patch) => ({ ...r.tree, boxes: new Map([...r.tree.boxes].map(([id, b]) => [id, id === 'R' ? { ...b, ...patch } : b])) });
  const a = r.tree.boxes.get('R');
  ok('10 a frame a row taller than its content: said', framesAgainstRef(off({ h: a.h + 1 }), r.ctx.measure).some((e) => /a canonical frame of 5 rows, the formula gives 4/.test(e)), framesAgainstRef(off({ h: a.h + 1 }), r.ctx.measure));
  ok('10a a shown frame a row short of its children\'s shown rows: said', framesAgainstRef(off({ h: a.h - 1, t: a.t - 1 }), r.ctx.measure).some((e) => /a frame of 5 rows shown, the formula gives 6/.test(e)), framesAgainstRef(off({ h: a.h - 1, t: a.t - 1 }), r.ctx.measure));
}
process.exit(t.fails ? 1 : 0);
