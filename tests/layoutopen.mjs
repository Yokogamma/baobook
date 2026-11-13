// Node: opening a note and its two measures (public/layout/layout.js; LAYOUT-ENGINE-PLAN §2.1, §3.4, §3.5, step 2c). A note is written
// here as the bridge reads it: Boxes in the engine's cells with no width, height or stacks, an area's children in its own cells.
//   1    a valid note keeps every place it was read at, its head rows and gaps included, in both measures; diff gives nothing;
//   2    sizes (step 0): a set width its cw, an elastic text its rest width on the rows it stands on (SIZE.1, SIZE.8);
//   3    clamp (step 1): a card past the right edge, an elastic one narrowed by the edge, a set width wider than its container, an area
//        at row 0 with the block under it;
//   4    separate (step 2): as resolveIn, in reading order, a block alone down under the one it hits, an area's free cells, passes again;
//   5    rest (step 4): a text a moved neighbour no longer presses widens again;
//   6    areas: children first, in the columns the area shows; the frame round them, a collapsed one its header; a child past the edge;
//   7    show and unshow: temporary rows per block and by the measure, an area's growth by its children's, back to the canonical layout;
//   8    diff: the place in each container's own fields, a cleared field removed, a block that changed containers, a new block, booleans,
//        a fractional row as stored, every key one of PLACE_FIELDS;
//   9    the safe result: a value out of the engine's range, a bound exceeded;
//   10   a property over random notes: open is valid and comes to rest when opened again from its own places, show and unshow invert, diff of the result against itself is empty.
// Seeded: node tests/layoutopen.mjs [seed] [N]
import { open, show, unshow, diff } from '../public/layout/layout.js';
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check, columnChain, stackAt, showStack } from '../public/layout/gap.js';
import { readingOrder, extent, range, hits, rowFromY, fxFromCol, MAXCELL, SHEETW } from '../public/layout/geometry.js';
import { PLACE_FIELDS } from '../public/layout/shapes.js';
import { chars, ctxOf, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const S = (id, col, y, cw, ch) => ({ id, kind: 'text', col, y, cw, ...(ch ? { ch } : {}) });
const T = (id, col, y) => ({ id, kind: 'text', col, y });
const A = (id, col, y, cw, o = {}) => ({ id, kind: 'area', col, y, cw, ...o });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const note = (cols, boxes, areas = {}) => ({ ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });
/** The stub's entries: a set width or an area one row, a text the characters given (`len`). */
const ctxFor = (n, len = {}, temp = {}, rules) => {
  const map = {};
  const all = [...n.boxes.values(), ...[...n.areas.values()].flatMap((L) => [...L.boxes.values()])];
  for (const b of all) map[b.id] = b.kind === 'area' ? { kind: 'area', temp: temp[b.id] } : { text: len[b.id] != null ? chars(len[b.id]) : 'x', temp: temp[b.id] };
  return ctxOf(map, rules);
};
const places = (L) => Object.fromEntries([...L.boxes].map(([id, b]) => [id, [b.col, b.y, b.w, b.h]]));
const rows = (L) => Object.fromEntries([...L.boxes].map(([id, b]) => [id, b.y]));
/** The fields the bridge would keep for a note read from these places (§3.5): sheet rows stored with the sheet's offset. */
function storedOf(n) {
  const out = new Map();
  const put = (b, parent) => out.set(b.id, { parent, col: b.col, row: parent == null ? rowFromY(b.y) : b.y, ...(parent == null ? { fx: fxFromCol(b.col) } : {}), ...(b.cw != null ? { cw: b.cw } : {}), ...(b.ch != null ? { ch: b.ch } : {}), ...(b.open ? { open: true } : {}), ...(b.collapsed ? { collapsed: true } : {}) });
  for (const b of n.boxes.values()) put(b, null);
  for (const [id, L] of n.areas) for (const b of L.boxes.values()) put(b, id);
  return out;
}
/** A note read back from a layout: its places and set sizes, no widths, heights or stacks. */
function reread(L) {
  const strip = (b) => { const o = { id: b.id, kind: b.kind, col: b.col, y: b.y }; for (const f of ['cw', 'ch', 'open', 'collapsed']) if (b[f] != null) o[f] = b[f]; return o; };
  return { ...lay(L.cols, [...L.boxes.values()].map(strip)), areas: new Map([...L.areas].map(([id, A]) => [id, lay(A.cols, [...A.boxes.values()].map(strip))])) };
}
function sound(L) {
  const errs = check(L);
  const ro = readingOrder(L.boxes.values());
  if (!L.order.every((id, i) => id === ro[i])) errs.push('not in reading order');
  for (const b of L.boxes.values()) { const r = range(b, L.cols); if (b.col < r.colMin || b.col > r.colMax || b.y < r.yMin) errs.push(b.id + ' outside its container'); }
  for (const A of L.areas.values()) errs.push(...sound(A).map((e) => 'in an area: ' + e));
  return errs;
}

/* ── 1. a valid note keeps every place it was read at ── */
{
  const n = note(20, [S('A', 0, 0, 3), S('B', 5, 0, 2), T('T', 0, 3), S('C', 2, 6, 4, 2)]), ctx = ctxFor(n, { T: 9 });
  const r = open(n, ctx);
  ok('1 a valid note: every place as read, set widths their cw, the text its natural width; sound', r.ok && eq(places(r.layout), { A: [0, 0, 4, 1], B: [5, 0, 3, 1], T: [0, 3, 4, 1], C: [2, 6, 5, 2] }) && !sound(r.layout).length, r.ok ? places(r.layout) : r);
  ok('1 its gaps are GAP.1\'s: the rows over C in column 3 owned by T, the head rows of A and B unowned under the top', r.ok && showStack(stackAt(r.layout, 'C', 3)) === 'T | T2 |' && showStack(stackAt(r.layout, 'A', 1)) === 'top | · |' && columnChain(r.layout, 3).join() === 'A,T,C', r.ok && [showStack(stackAt(r.layout, 'C', 3)), showStack(stackAt(r.layout, 'A', 1)), columnChain(r.layout, 3)]);
  ok('1 shown with no temporary height: the same places; diff against what was read: nothing', r.ok && eq(places(r.shown), places(r.layout)) && diff(storedOf(n), r.layout).size === 0, r.ok && [...diff(storedOf(n), r.layout)]);
  const head = note(20, [S('A', 2, 3, 3), S('B', 8, 5, 2)]), rh = open(head, ctxFor(head));
  ok('1 head rows kept: blocks that start low stay low, nothing lifts them', rh.ok && eq(rows(rh.layout), { A: 3, B: 5 }), rh.ok && rows(rh.layout));
}

/* ── 2. sizes ── */
{
  const n = note(20, [T('T1', 0, 0), T('T2', 9, 0), T('U', 0, 3), S('V', 8, 3, 3)]), ctx = ctxFor(n, { T1: 18, T2: 3, U: 30 });
  const r = open(n, ctx);
  ok('2 a text with room: its natural width (18 characters, 6 cells); one with a neighbour on its rows: no wider than its room, taller (SIZE.1)', r.ok && eq(places(r.layout).T1, [0, 0, 7, 1]) && eq(places(r.layout).U, [0, 3, 8, 2]), r.ok && places(r.layout));
}

/* ── 3. clamp ── */
{
  const n = note(12, [S('S', 10, 0, 5), T('E', 9, 3)]), ctx = ctxFor(n, { E: 30 });
  const r = open(n, ctx);
  ok('3 a set width past the right edge moves left to where it fits; an elastic one at the edge takes its floor (min(natural, MINC)) and moves left', r.ok && eq(places(r.layout).S, [6, 0, 6, 1]) && eq(places(r.layout).E, [5, 3, 7, 2]), r.ok && places(r.layout));
  const w = note(12, [S('W', 4, 0, 20), S('B', 0, 2, 3)]), cw = ctxFor(w), rw = open(w, cw);
  ok('3 a set width wider than its container: shown at the full width from column 0, its cw as stored; diff writes no cw', rw.ok && eq(places(rw.layout).W, [0, 0, 12, 1]) && rw.layout.boxes.get('W').cw === 20 && !('cw' in (diff(storedOf(w), rw.layout).get('W') || {})), rw.ok && [places(rw.layout), [...diff(storedOf(w), rw.layout)]]);
  const sz = rw.ok && settle(rw.shown, { type: 'size', box: null, id: 'W' }, emptyMemory(), cw);
  ok('3 and a size change on it is taken, its width still the container\'s (phase 1a, SIZE.3)', !!sz && sz.ok && sz.layout.boxes.get('W').w === 12 && !sound(sz.layout).length, sz);
  const a = note(20, [A('A', 0, 0, 6), S('B', 1, 2, 3), S('C', 10, 0, 3)]), ra = open(a, ctxFor(a));
  ok('3 an area at row 0 moves down one row, so that its free row lies in the sheet, and the block under it with it; the rest stays', ra.ok && eq(rows(ra.layout), { A: 1, B: 3, C: 0 }), ra.ok && rows(ra.layout));
}

/* ── 4. separate ── */
{
  const n = note(20, [S('A', 0, 0, 3, 3), S('B', 1, 1, 5), S('C', 5, 2, 2, 2)]), r = open(n, ctxFor(n));
  ok('4 as resolveIn: B down under A, C, which B now hits, down under B in a second look; A never moves', r.ok && eq(rows(r.layout), { A: 0, B: 3, C: 4 }) && !sound(r.layout).length, r.ok && rows(r.layout));
  const tie = note(20, [S('P', 2, 1, 3), S('Q', 2, 1, 3)]), rt = open(tie, ctxFor(tie));
  ok('4 two blocks on one cell: the later id goes down', rt.ok && eq(rows(rt.layout), { P: 1, Q: 2 }), rt.ok && rows(rt.layout));
  const f = note(20, [S('X', 0, 1, 2), A('R', 2, 2, 5)]), rf = open(f, ctxFor(f));
  ok('4 a block in an area\'s free cell: the area, later in reading order, goes down until its free row is clear', rf.ok && eq(rows(rf.layout), { X: 1, R: 3 }) && !sound(rf.layout).length, rf.ok && rows(rf.layout));
}

/* ── 5. rest after separating ── */
{
  const n = note(20, [T('T', 0, 0), S('S', 4, 0, 3)]), ctx = ctxFor(n, { T: 30 }), r = open(n, ctx);
  ok('5 T at its floor beside S, which it hits; S goes down under T, and T, no longer pressed, widens to its natural width (step 4)', r.ok && eq(places(r.layout).T, [0, 0, 11, 1]) && r.layout.boxes.get('S').y === 2 && !sound(r.layout).length, r.ok && places(r.layout));
}

/* ── 6. areas ── */
{
  const n = note(30, [A('A', 0, 1, 8), S('B', 0, 3, 4)], { A: [S('c1', 0, 0, 3), T('c2', 4, 0), S('c3', 6, 0, 5)] }), ctx = ctxFor(n, { c2: 9 });
  const r = open(n, ctx), C = r.ok && r.layout.areas.get('A');
  ok('6 children first, in the area\'s eight columns: c3 past its edge moves left onto c1 and c2 and goes down under them', !!C && C.cols === 8 && eq(places(C).c3, [2, 1, 6, 1]) && !sound(r.layout).length, C && places(C));
  ok('6 the frame round them: its header and two rows of children, and B under it goes down past its free row (row 4)', r.ok && r.layout.boxes.get('A').h === 3 && r.layout.boxes.get('B').y === 5, r.ok && places(r.layout));
  const wide = note(SHEETW, [A('W', 3, 1, 70)], { W: [S('k', 60, 0, 3)] }), rw = open(wide, ctxFor(wide)), K = rw.ok && rw.layout.areas.get('W');
  ok('6 an area wider than the sheet: shown at the sheet\'s width from column 0, its children laid out in the columns shown, its cw as stored', !!K && rw.layout.boxes.get('W').w === SHEETW - 1 && rw.layout.boxes.get('W').col === 0 && K.cols === SHEETW - 2 && K.boxes.get('k').col === K.cols - 4 && rw.layout.boxes.get('W').cw === 70, rw.ok && [places(rw.layout), K && places(K)]);
  const col = note(30, [A('A', 0, 1, 8, { collapsed: true }), S('B', 0, 3, 4)], { A: [S('c1', 0, 0, 3), S('c2', 0, 1, 3)] }), rc = open(col, ctxFor(col));
  ok('6 a collapsed area: its header alone; its children opened and kept for when it opens', rc.ok && rc.layout.boxes.get('A').h === 1 && rc.layout.boxes.get('B').y === 3 && rc.layout.areas.get('A').boxes.size === 2, rc.ok && places(rc.layout));
}

/* ── 7. show and unshow ── */
{
  const n = note(20, [S('A', 0, 0, 3), S('B', 0, 2, 3), T('X', 6, 0), S('Y', 6, 2, 3)]), ctx = ctxFor(n, { X: 3 }, { X: 1 });
  const r = open(n, ctx, new Map([['A', 2]])), D = r.ok && r.shown;
  ok('7 temporary rows, given (A, 2) and by the measure (X, 1): the blocks under them shown lower, their canonical rows kept', !!D && D.boxes.get('A').h === 3 && D.boxes.get('A').t === 2 && D.boxes.get('B').y === 4 && D.boxes.get('B').yc === 2 && D.boxes.get('X').t === 1 && D.boxes.get('Y').y === 3 && D.boxes.get('Y').yc === 2, D && places(D));
  ok('7 the canonical layout has none of them: open\'s layout, and unshow gives it back from the shown one', r.ok && r.layout.boxes.get('A').h === 1 && eq(places(unshow(D, ctx)), places(r.layout)) && eq(rows(unshow(D, ctx)), rows(r.layout)), r.ok && places(unshow(D, ctx)));
  const a = note(30, [A('R', 0, 1, 8), S('B', 0, 4, 4)], { R: [S('c', 0, 0, 3)] }), ca = ctxFor(a), ra = open(a, ca, new Map([['c', 2]]));
  const R = ra.ok && ra.shown.boxes.get('R');
  ok('7 an area grows by its children\'s temporary rows, shown only: t 2, the block under it lower, its canonical frame unchanged', !!R && R.h === 4 && R.t === 2 && ra.shown.boxes.get('B').y === 6 && ra.layout.boxes.get('R').h === 2 && eq(places(unshow(ra.shown, ca)), places(ra.layout)), ra.ok && [places(ra.shown), places(ra.layout)]);
}

/* ── 8. diff ── */
{
  const n = note(20, [S('A', 0, 0, 3, 3), S('B', 1, 1, 5), S('C', 15, 0, 6)], { R: [] }), ctx = ctxFor(n), r = open(n, ctx), d = r.ok && diff(storedOf(n), r.layout);
  ok('8 separated and clamped blocks: B its stored row (sheet offset 2), C its fx for the column it now stands at; A nothing', !!d && eq(d.get('B'), { row: rowFromY(3) }) && eq(d.get('C'), { fx: fxFromCol(13) }) && !d.has('A'), d && [...d]);
  const st = new Map([['A', { parent: null, col: 0, row: 2, fx: fxFromCol(0), cw: 3, ch: 5 }], ['K', { parent: 'R', col: 1, row: 0, cw: 2 }], ['F', { parent: null, col: 4, row: 2.5, fx: fxFromCol(4), cw: 2, open: false }]]);
  const L = { ...lay(20, [{ id: 'A', kind: 'text', col: 0, y: 0, w: 4, h: 1, cw: 3 }, { id: 'K', kind: 'text', col: 9, y: 4, w: 3, h: 1, cw: 2 }, { id: 'F', kind: 'text', col: 4, y: 1, w: 3, h: 1, cw: 2, open: false }, { id: 'N', kind: 'text', col: 2, y: 7, w: 3, h: 1, cw: 2, ch: 2 }]), areas: new Map([['R', lay(8, [])]]) };
  const e = diff(st, L), K = e.get('K') || {};
  ok('8 a cleared ch is written as removed (the key, undefined)', 'ch' in (e.get('A') || {}) && e.get('A').ch === undefined && Object.keys(e.get('A')).length === 1, [...e]);
  ok('8 a block out of an area onto the sheet: parent removed, fx and row for the sheet, its area col removed', 'parent' in K && K.parent === undefined && K.fx === fxFromCol(9) && K.row === rowFromY(4) && 'col' in K && K.col === undefined, K);
  ok('8 a fractional row as stored is written; open false against none is no change', eq(e.get('F'), { row: rowFromY(1) }), e.get('F'));
  ok('8 a new block: every field it has, and none it lacks', eq(e.get('N'), { fx: fxFromCol(2), row: rowFromY(7), cw: 2, ch: 2 }), e.get('N'));
  ok('8 every key one of PLACE_FIELDS', [...e.values(), ...d.values()].every((p) => Object.keys(p).every((k) => PLACE_FIELDS.includes(k))), [...e]);
  const into = diff(new Map([['M', { parent: null, col: 3, row: 4, fx: fxFromCol(3) }]]), { ...lay(20, []), areas: new Map([['R', lay(8, [{ id: 'M', kind: 'text', col: 0, y: 1, w: 3, h: 1 }])]]) }).get('M');
  ok('8 a block into an area: its parent, col and row in the area, its sheet fx removed', eq(Object.keys(into).sort(), ['col', 'fx', 'parent', 'row']) && into.parent === 'R' && into.col === 0 && into.row === 1 && into.fx === undefined, into);
}

/* ── 9. the safe result ── */
{
  const n = note(20, [S('A', 0, 0, 3), S('B', 1, -1, 3)]), r = open(n, ctxFor(n));
  ok('9 a row out of the engine\'s range: failed, every block at its place and size as read, nothing separated', !r.ok && r.why === 'failed' && eq(rows(r.layout), { A: 0, B: -1 }) && r.layout.boxes.get('A').w === 4, r);
  const m = note(20, [S('A', 0, MAXCELL - 1, 3, 1), S('B', 1, MAXCELL - 1, 3)]), rm = open(m, ctxFor(m));
  ok('9 a separation that would pass MAXCELL: failed, the places as read', !rm.ok && rm.why === 'failed' && eq(rows(rm.layout), { A: MAXCELL - 1, B: MAXCELL - 1 }), rm.ok ? rows(rm.layout) : rm.errors);
}

/* ── 10. random notes ── */
{
  let seed = +process.argv[2] || 11; const seed0 = seed;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const N = +process.argv[3] || 400;
  let bad = 0, first = null, notes = 0, moved = 0, temps = 0;
  for (let k = 0; k < N; k++) {
    const cols = int(10, 24), boxes = [], areas = {}, len = {}, temp = {};
    const leaf = (id, cmax) => { const r = rnd(); const b = r < 0.45 ? T(id, int(0, cmax), int(0, 8)) : S(id, int(0, cmax), int(0, 8), int(1, 6), rnd() < 0.2 ? int(2, 3) : undefined); if (b.cw == null) len[id] = int(1, 40); if (rnd() < 0.15) temp[id] = int(1, 2); return b; };
    for (let i = 0, n = int(1, 7); i < n; i++) boxes.push(leaf('B' + i, cols));
    for (let i = 0, n = rnd() < 0.5 ? int(1, 2) : 0; i < n; i++) {
      const id = 'R' + i, a = A(id, int(0, cols), int(0, 8), int(4, cols + 2), rnd() < 0.15 ? { collapsed: true } : {}); boxes.push(a);
      areas[id] = []; for (let j = 0, m = int(0, 4); j < m; j++) areas[id].push(leaf(id + 'c' + j, a.cw));
    }
    const n = note(cols, boxes, areas), ctx = ctxFor(n, len, temp), r = open(n, ctx, new Map(Object.entries(temp)));
    notes++;
    const fail = (why, extra) => { bad++; if (!first) first = { k, seed0, why, cols, boxes, areas, len, temp, ...extra }; };
    if (!r.ok) { fail('open failed: ' + r.errors[0]); continue; }
    const e = sound(r.layout); if (e.length) { fail('unsound: ' + e[0]); continue; }
    if (diff(storedOf(n), r.layout).size) moved++;
    // opened again from its own places it comes to rest within 8 (RESTPASSES passes of SIZE.8 in each, so a long text may take more than
    // one, as under SETTLE), and at rest open keeps every place and size: a valid note keeps every place it was read at
    const all = (L) => JSON.stringify([places(L), [...L.areas].map(([id, A]) => [id, places(A)])]);
    let cur = r.layout, rested = false, again = null;
    for (let i = 0; i < 8 && !rested; i++) { again = open(reread(cur), ctx); if (!again.ok) break; rested = all(again.layout) === all(cur); cur = again.layout; }
    if (!rested) { fail('open does not come to rest within 8', { again: again && again.ok ? places(again.layout) : again && again.errors, was: places(r.layout) }); continue; }
    if (diff(storedOf(reread(r.layout)), r.layout).size) { fail('diff of a layout against its own fields is not empty', { d: [...diff(storedOf(reread(r.layout)), r.layout)] }); continue; }
    if (Object.keys(temp).length) temps++;
    const es = sound(r.shown); if (es.length) { fail('shown unsound: ' + es[0]); continue; }
    if (!eq(places(unshow(r.shown, ctx)), places(r.layout)) || !eq(rows(unshow(r.shown, ctx)), rows(r.layout))) { fail('unshow does not give the canonical layout back'); continue; }
    if ([...r.shown.boxes.values()].some((b) => (b.yc ?? b.y) !== r.layout.boxes.get(b.id).y)) { fail('a shown block\'s canonical row is not the canonical layout\'s'); continue; }
    if (!eq(places(show(r.layout, new Map(), ctxFor(n, len, {}))), places(r.layout))) { fail('shown with no temporary height is not the canonical layout'); continue; }
  }
  ok(`10 ${notes} random notes (${moved} with a place repaired, ${temps} with temporary heights): open sound and at rest within 8 openings, diff of the result against its own fields empty, show sound, unshow its inverse`, bad === 0, first);
}

process.exit(t.fails ? 1 : 0);
