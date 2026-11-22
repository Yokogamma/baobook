// Node: validate (public/layout/validate.js; docs/LAYOUT-SEAMS-PLAN.md §4.1), the one check of a note's tree. A tree the engine made is
// valid, canonical and shown; and each way of breaking one is caught with a reason that names it, so that the check cannot pass a tree
// by seeing nothing: a block in two containers, an area with no container and a container with no area, an area in an area, a child
// container laid out in other columns than its area has (which neither its stacks nor the frame's height show), a frame that is not round
// its children, the reading order, the bounds, an overlap, a temporary row in the canonical layout, a value out of the engine's range.
// It repairs nothing: its input is the same after it.

import { validate, validateContainer } from '../public/layout/validate.js';
import { open } from '../public/layout/layout.js';
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { readingOrder, MAXCELL } from '../public/layout/geometry.js';
import { chars, ctxOf, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const S = (id, col, y, cw, ch) => ({ id, kind: 'text', col, y, cw, ...(ch ? { ch } : {}) });
const T = (id, col, y) => ({ id, kind: 'text', col, y });
const A = (id, col, y, cw, o = {}) => ({ id, kind: 'area', col, y, cw, ...o });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const note = (cols, boxes, areas = {}) => ({ ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });

// a note with two areas, a text that wraps and a temporary height
const n = note(40, [S('a', 0, 0, 4), T('t', 6, 0), A('R', 0, 3, 12), S('b', 0, 8, 5), A('Q', 16, 3, 14, { ch: 5 })], { R: [S('c', 0, 0, 3), S('d', 4, 1, 4)], Q: [T('e', 0, 0)] });
const map = { a: { text: 'x' }, t: { text: chars(40) }, R: { kind: 'area' }, b: { text: 'x' }, Q: { kind: 'area' }, c: { text: 'x', temp: 2 }, d: { text: 'x' }, e: { text: chars(20) } };
const ctx = ctxOf(map), o = open(n, ctx);
const tree = o.layout, shown = o.shown;

/* ── 1. what the engine makes is valid ── */
ok('1 a note opened: its canonical tree is valid', o.ok && validate(tree, ctx).length === 0, o.ok ? validate(tree, ctx) : o);
ok('1a and its shown tree, a child\'s temporary rows growing its area\'s frame by one', validate(shown, ctx).length === 0 && shown.boxes.get('R').t === 1, [validate(shown, ctx), shown.boxes.get('R')]);
{
  const r = settleTree(shown, { type: 'enter', box: null, id: 'b', to: 'R', at: { col: 0, y: 4 } }, emptyMemory(), ctx);
  ok('1b after a block enters an area: valid', r.ok && validate(r.layout, ctx).length === 0, r.ok ? validate(r.layout, ctx) : r);
  const before = JSON.stringify([...shown.boxes]);
  validate(shown, ctx);
  ok('1c it repairs nothing: its input is the same after it', JSON.stringify([...shown.boxes]) === before);
}
ok('1d one container by itself, an area there a block with no children\'s container: valid', validateContainer({ ...tree, areas: new Map() }, ctx).length === 0, validateContainer({ ...tree, areas: new Map() }, ctx));

/* ── 2. each way of breaking a tree is caught, by its name ── */
const withBox = (L, id, patch) => { const boxes = new Map(L.boxes); boxes.set(id, { ...boxes.get(id), ...patch }); return { ...L, boxes }; };
const withArea = (Tr, id, f) => { const areas = new Map(Tr.areas); areas.set(id, f(areas.get(id))); return { ...Tr, areas }; };
const caught = (name, broken, re, c = ctx) => { const e = validate(broken, c); ok('2 ' + name, e.some((x) => re.test(x)), e); };

caught('an area with no container', { ...tree, areas: new Map([...tree.areas].filter(([id]) => id !== 'R')) }, /an area with no container: R/);
caught('a container with no area', { ...tree, areas: new Map([...tree.areas, ['Z', lay(5, [])]]) }, /a container with no area: Z/);
caught('a container kept for a block that is no area', { ...tree, areas: new Map([...tree.areas, ['b', lay(5, [])]]) }, /a container with no area: b/);
caught('a block in two containers', withArea(tree, 'Q', (C) => { const b = tree.areas.get('R').boxes.get('c'); return { ...C, boxes: new Map([...C.boxes, ['c', { ...b, y: 6, yc: 6 }]]), order: [...C.order, 'c'] }; }), /c in R and in Q|c in Q and in R/);
caught('an area in an area', withArea(tree, 'R', (C) => withBox(C, 'c', { kind: 'area' })), /an area in an area, c/);
caught('a container under a child container', withArea(tree, 'R', (C) => ({ ...C, areas: new Map([['c', lay(3, [])]]) })), /a container under a child container/);
{
  // the independent review of the plan: an area of 12 inner columns over children laid out in 20: every stack is sound in the
  // container's own 20 columns and the frame's height is right, so only the two widths compared tell
  const wide = withArea(tree, 'R', (C) => ({ ...C, cols: 20 }));
  const e = validate(wide, ctx);
  ok('2 (that container by itself is sound)', validateContainer(wide.areas.get('R'), ctx).length === 0, validateContainer(wide.areas.get('R'), ctx));
  ok('2 a child container in other columns than its area has: caught by its width alone', e.length === 1 && /R: its children in 20 columns, its card 12/.test(e[0]), e);
}
caught('a frame taller than its children need', withBox(tree, 'R', { h: tree.boxes.get('R').h + 1 }), /R: a canonical frame of \d+ rows, its children need \d+|row of|overlap|chain/);
caught('a frame too short for the children it shows', withBox(shown, 'R', { h: shown.boxes.get('R').h - 1, t: shown.boxes.get('R').t - 1 }), /R: a frame of \d+ rows shown, its children need \d+|R: a canonical frame|row of|chain/);
caught('a child container in another measure than the sheet', withArea(tree, 'R', (C) => ({ ...C, measure: 'displayed' })), /R: its children displayed, the sheet canonical/);
caught('not in reading order', { ...tree, order: [...tree.order].reverse() }, /sheet: not in reading order/);
caught('an order that does not list the boxes', { ...tree, order: tree.order.slice(1) }, /sheet: its order does not list its boxes/);
caught('a block outside its container', withArea(tree, 'R', (C) => withBox(C, 'd', { col: 10 })), /R: d outside its container/);
caught('an area at row 0, its free row above outside the sheet', withBox(withBox(tree, 'a', { col: 30 }), 'R', { y: 0, yc: 0 }), /sheet: R outside its container/);
caught('two blocks that overlap', withBox(tree, 'b', { y: 0, yc: 0 }), /overlap|row of b is not FOLLOW's|chain/);
caught('a temporary row in the canonical layout', withBox(tree, 'a', { t: 1, h: 2 }), /sheet: a: temporary rows in the canonical layout/);
caught('a canonical row below the displayed one', withBox(shown, 'b', { yc: shown.boxes.get('b').y + 1 }), /sheet: b: its canonical row \d+ below its displayed row \d+/);
caught('more temporary rows than rows', withBox(shown, 'a', { t: 5 }), /sheet: a: 1 rows, 5 of them temporary/);
caught('a block past MAXCELL', withBox(tree, 'b', { y: MAXCELL, yc: MAXCELL }), /sheet: b past MAXCELL|sheet: b\.y/);
caught('a value that is no whole number', withBox(tree, 'a', { col: 1.5 }), /sheet: a\.col = 1\.5/);
caught('a kind the engine does not know', withBox(tree, 'a', { kind: 'todo' }), /sheet: a: no kind todo/);
caught('a box kept under another id', { ...tree, boxes: new Map([...tree.boxes].map(([id, b]) => (id === 'a' ? ['zz', b] : [id, b]))) }, /sheet: the box kept as zz is a/);
caught('a container with no columns', withArea(tree, 'Q', (C) => ({ ...C, cols: 0 })), /Q: 0 columns/);
caught('more columns than MAXCELL', { ...tree, cols: MAXCELL + 1 }, /sheet: \d+ columns/);
caught('a kind that is only an inherited property of the passports', withBox(tree, 'a', { kind: 'toString' }), /sheet: a: no kind toString/);
caught('a child container with no areas map', withArea(tree, 'R', (C) => { const { areas, ...rest } = C; return rest; }), /R: no areas/);
caught('the sheet with no areas map', (() => { const { areas, ...rest } = tree; return rest; })(), /sheet: no areas/);
caught('an order that names a box twice', { ...tree, order: [tree.order[0], ...tree.order.slice(0, -1)] }, /sheet: its order does not list its boxes/);
{
  // the independent review of S2a: gap.js adds a gap's lengths up and never asks what one is, so runs of -1 and 4 rows, or of 1.5 and
  // 1.5, in the place of a seg of 3 give every row it reads. Found in the tree, not written by hand: a seg of one run of 2 rows or more
  let at = null;
  for (const [name, L] of [[null, shown], ...shown.areas]) for (const b of L.boxes.values()) (b.above || []).forEach((s, i) => s.stack.parts.forEach((p, j) => {
    if (!at && j % 2 === 0 && p.length === 1 && p[0].n >= 2) at = { name, id: b.id, i, j, o: p[0].o, n: p[0].n };
  }));
  ok('2 (a seg of one run of two rows or more is in the tree)', !!at, at);
  const withSeg = (rs) => {
    const put = (L) => withBox(L, at.id, { above: L.boxes.get(at.id).above.map((s, i) => (i !== at.i ? s : { ...s, stack: { ...s.stack, parts: s.stack.parts.map((p, j) => (j === at.j ? rs : p)) } })) });
    return at.name == null ? put(shown) : withArea(shown, at.name, put);
  };
  ok('2 (that seg as it is, written again, is no error)', !validate(withSeg([{ o: at.o, n: at.n }]), ctx).length, validate(withSeg([{ o: at.o, n: at.n }]), ctx));
  caught('a run of -1 rows beside one that makes the sum right', withSeg([{ o: at.o, n: -1 }, { o: at.o === null ? at.id : null, n: at.n + 1 }]), /a run of -1 rows/);
  caught('runs of 1.5 rows', withSeg([{ o: at.o, n: at.n - 1.5 }, { o: at.o === null ? at.id : null, n: 1.5 }]), /a run of 1\.5 rows/);
  caught('a run of no rows', withSeg([{ o: at.o, n: at.n }, { o: at.o === null ? at.id : null, n: 0 }]), /a run of 0 rows/);
  caught('two runs in a row of one owner', withSeg([{ o: at.o, n: 1 }, { o: at.o, n: at.n - 1 }]), /two runs in a row owned by/);
  caught('a run that is no object', withSeg([null]), /run 0 is null/);
  caught('a stack whose parts are no list', withBox(shown, shown.order[0], { above: [{ c0: 0, c1: 0, stack: { u: null, parts: null } }] }), /its parts do not alternate seg and stand/);
  caught('stacks that are no list', withBox(shown, shown.order[0], { above: 'x' }), /its stacks are no list/);
}
{
  // a broken shape is said and nothing is read on from it: no throw, on the sheet or in an area
  const run = (T) => { try { return validate(T, ctx); } catch (e) { return ['threw: ' + e.message]; } };
  const a = run({ ...tree, boxes: new Map([...tree.boxes].map(([id, b]) => (id === 'a' ? [id, null] : [id, b]))) });
  ok('2 null in the place of a block of the sheet: said, not thrown', a.length === 1 && /sheet: the box kept as a is null/.test(a[0]), a);
  const c = run(withArea(tree, 'R', (C) => ({ ...C, boxes: new Map([...C.boxes].map(([id, b]) => (id === 'c' ? [id, null] : [id, b]))) })));
  ok('2 and of an area: said, not thrown, the rest of the tree still checked', c.length === 1 && /R: the box kept as c is null/.test(c[0]), c);
  const d = run(withArea(tree, 'R', () => null));
  ok('2 null in the place of a child container: said, not thrown', d.length === 1 && /R: no layout/.test(d[0]), d);
  const e = run(withBox(tree, 'a', { kind: undefined }));
  ok('2 a block with no kind: said, not thrown', e.length === 1 && /sheet: a: no kind undefined/.test(e[0]), e);
}
ok('2 no layout at all: said, not thrown', validate(null, ctx).length === 1 && validate({}, ctx).length === 1, [validate(null, ctx), validate({}, ctx)]);

process.exit(t.fails ? 1 : 0);
