// Node: SETTLE over the containers of a note (public/layout/tree.js `settleTree`; LAYOUT-RULES §5.6, AREA; LAYOUT-ENGINE-PLAN step 2c-2).
// Notes are opened as the bridge would read them (layout.js `open`), then changed:
//   1    a text in an area grows: the area's frame with it, the blocks under the area pushed; shrinks back: every row back (INV-7 b);
//   2    a carry inside an area, past its bottom: the frame grows, both containers in `ran`; the area's own start kept for the next move;
//   3    a block into an area and out again (enter, leave): taken away from one container, a new block in the other, frames following;
//   4    ungrouping: the area taken away, its children on the sheet at their cells;
//   5    drawing an area: what it covers makes room; its children an empty container; never inside an area;
//   6    an area's side handle: inwards a child pressed in by the wall, outwards a sheet block pressed aside, the left edge keeping the
//        children's sheet cells, a child that cannot fit refusing the whole and changing nothing; the width clamped to the kind's floor;
//   7    random notes and changes: every result sound in every container, every area's frame round its children, every block in one
//        container;
//   8    the independent review of 9a06496: a size change of an area itself (a collapse, ch), an area's container made and taken away
//        with it, the side handle judged by the frame (room in ch, a header growing at the new width), one width on a narrow sheet.
// Seeded: node tests/layouttree.mjs [seed] [N]
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { open } from '../public/layout/layout.js';
import { check } from '../public/layout/gap.js';
import { readingOrder, extent, range, hits, SHEETW } from '../public/layout/geometry.js';
import { resolve } from '../public/layout/rules.js';
import { chars, ctxOf, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const S = (id, col, y, cw, ch) => ({ id, kind: 'text', col, y, cw, ...(ch ? { ch } : {}) });
const T = (id, col, y) => ({ id, kind: 'text', col, y });
const A = (id, col, y, cw, o = {}) => ({ id, kind: 'area', col, y, cw, ...o });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const note = (cols, boxes, areas = {}) => ({ ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });
/** The stub's entries, kept in `map` so that a test can change a text and measure again. */
function ctxFor(n, len = {}, rules) {
  const map = {};
  for (const b of [...n.boxes.values(), ...[...n.areas.values()].flatMap((L) => [...L.boxes.values()])]) map[b.id] = b.kind === 'area' ? { kind: 'area' } : { text: len[b.id] != null ? chars(len[b.id]) : 'x' };
  const ctx = ctxOf(map, rules); ctx.map = map; return ctx;
}
const shown = (n, ctx) => { const r = open(n, ctx); if (!r.ok) throw new Error('open failed: ' + r.errors); return r.shown; };
const rows = (L) => Object.fromEntries([...L.boxes].map(([id, b]) => [id, b.y]));
const places = (L) => Object.fromEntries([...L.boxes].map(([id, b]) => [id, [b.col, b.y, b.w, b.h]]));
const frameRows = (area, inner, ctx) => ctx.kinds.area.container.height(area, inner, ctx.measure);
const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
/** Every container sound (INV-1 to INV-5), every area's frame round its children, every block in one container only. */
function sound(Tr, ctx) {
  const errs = [], seen = new Map();
  const one = (L, name) => {
    errs.push(...check(L).map((e) => name + ': ' + e));
    const ro = readingOrder(L.boxes.values()); if (!L.order.every((id, i) => id === ro[i])) errs.push(name + ': not in reading order');
    for (const b of L.boxes.values()) {
      const r = range(b, L.cols); if (b.col < r.colMin || b.col > r.colMax || b.y < r.yMin) errs.push(`${name}: ${b.id} outside its container`);
      if (seen.has(b.id)) errs.push(`${b.id} in ${seen.get(b.id)} and ${name}`); seen.set(b.id, name);
    }
  };
  one(Tr, 'sheet');
  for (const [id, C] of Tr.areas) {
    const a = Tr.boxes.get(id); if (!a) { errs.push('an area\'s children with no area ' + id); continue; }
    one(C, id);
    if (C.cols !== a.w - 1) errs.push(`${id}: its children in ${C.cols} columns, its card ${a.w - 1}`);
    if (a.h !== frameRows(a, bottomOf(C), ctx)) errs.push(`${id}: frame ${a.h}, its children need ${frameRows(a, bottomOf(C), ctx)}`);
  }
  for (const b of Tr.boxes.values()) if (b.kind === 'area' && !Tr.areas.has(b.id)) errs.push('an area with no children\'s container: ' + b.id);
  return errs;
}

/* ── 1. a text in an area grows and shrinks ── */
{
  const n = note(30, [A('R', 0, 1, 10), S('B', 0, 4, 3)], { R: [T('c', 0, 0)] }), ctx = ctxFor(n, { c: 9 }), T0 = shown(n, ctx);
  ok('1 opened: the area two rows (header and c), B under its free row', T0.boxes.get('R').h === 2 && T0.boxes.get('B').y === 4, places(T0));
  ctx.map.c = { text: chars(60) };
  const g = settleTree(T0, { type: 'size', box: 'R', id: 'c' }, emptyMemory(), ctx);
  ok('1 c grows to three rows: the frame to four, B pushed to 6, both containers settled; sound', g.ok && g.layout.boxes.get('R').h === 4 && g.layout.boxes.get('B').y === 6 && eq(g.ran, ['R', null]) && !sound(g.layout, ctx).length, g.ok ? [places(g.layout), sound(g.layout, ctx), g.ran] : g);
  ctx.map.c = { text: chars(9) };
  const s = g.ok && settleTree(g.layout, { type: 'size', box: 'R', id: 'c' }, emptyMemory(), ctx);
  ok('1 and back: the frame two rows again, B back at 4 by the same path (INV-7 b)', !!s && s.ok && eq(places(s.layout), places(T0)) && eq(places(s.layout.areas.get('R')), places(T0.areas.get('R'))), s && (s.ok ? places(s.layout) : s));
}

/* ── 2. a carry inside an area ── */
{
  const n = note(30, [A('R', 0, 1, 10), S('B', 0, 4, 3)], { R: [S('c', 0, 0, 3), S('d', 5, 0, 3)] }), ctx = ctxFor(n), T0 = shown(n, ctx);
  const carry = (y) => ({ type: 'carry', box: 'R', id: 'd', at: { col: 5, y, frow: y, w: 4 }, away: false });
  const g = settleTree(T0, carry(3), emptyMemory(), ctx);
  ok('2 d carried down to its row 3: the frame to five rows, B pushed under it; both containers; sound', g.ok && g.layout.areas.get('R').boxes.get('d').y === 3 && g.layout.boxes.get('R').h === 5 && g.layout.boxes.get('B').y === 7 && eq(g.ran, ['R', null]) && !sound(g.layout, ctx).length, g.ok ? [places(g.layout), places(g.layout.areas.get('R'))] : g);
  const back = g.ok && settleTree(g.start, { ...carry(0) }, g.memory, ctx);
  ok('2 the next move from the carry\'s start: back to its row 0, every row as opened', !!back && back.ok && eq(places(back.layout), places(T0)) && eq(places(back.layout.areas.get('R')), places(T0.areas.get('R'))), back && (back.ok ? places(back.layout) : back));
}

/* ── 3. into an area and out ── */
{
  const n = note(30, [A('R', 0, 1, 10), S('B', 0, 4, 3), S('S', 15, 1, 3)], { R: [S('c', 0, 0, 3)] }), ctx = ctxFor(n), T0 = shown(n, ctx);
  const e = settleTree(T0, { type: 'enter', box: null, id: 'S', to: 'R', at: { col: 0, y: 1 } }, emptyMemory(), ctx);
  ok('3 S into R under c: off the sheet, a child of R at its row 1, the frame three rows, B pushed to 5; sound', e.ok && !e.layout.boxes.has('S') && e.layout.areas.get('R').boxes.get('S')?.y === 1 && e.layout.boxes.get('R').h === 3 && e.layout.boxes.get('B').y === 5 && !sound(e.layout, ctx).length, e.ok ? [places(e.layout), places(e.layout.areas.get('R')), sound(e.layout, ctx)] : e);
  const l = e.ok && settleTree(e.layout, { type: 'leave', box: 'R', id: 'S', to: null, at: { col: 15, y: 1 } }, emptyMemory(), ctx);
  ok('3 and out again to where it stood: the frame two rows, B back at 4, S on the sheet at (15, 1); sound', !!l && l.ok && eq(places(l.layout), places(T0)) && !l.layout.areas.get('R').boxes.has('S') && !sound(l.layout, ctx).length, l && (l.ok ? places(l.layout) : l));
  const big = note(60, [A('Q', 0, 1, 40), A('P', 44, 1, 12)], { Q: [], P: [] }), cb = ctxFor(big);
  const nest = settleTree(shown(big, cb), { type: 'enter', box: null, id: 'P', to: 'Q', at: { col: 0, y: 1 } }, emptyMemory(), cb);
  ok('3 an area never goes into an area, even one with room for it: refused', !nest.ok && nest.why === 'refused', nest.ok ? places(nest.layout) : nest);
}

/* ── 4. ungrouping ── */
{
  const n = note(30, [A('R', 0, 1, 10), S('B', 0, 5, 3)], { R: [S('c', 0, 0, 3), S('d', 5, 1, 3)] }), ctx = ctxFor(n), T0 = shown(n, ctx);
  const u = settleTree(T0, { type: 'ungroup', box: null, id: 'R' }, emptyMemory(), ctx);
  ok('4 R ungrouped: gone with its container, c and d on the sheet at their cells (1, 2) and (6, 3); sound', u.ok && !u.layout.boxes.has('R') && !u.layout.areas.has('R') && eq([u.layout.boxes.get('c')?.col, u.layout.boxes.get('c')?.y], [1, 2]) && eq([u.layout.boxes.get('d')?.col, u.layout.boxes.get('d')?.y], [6, 3]) && !sound(u.layout, ctx).length, u.ok ? [places(u.layout), sound(u.layout, ctx)] : u);
}

/* ── 5. drawing an area ── */
{
  const n = note(30, [S('X', 2, 3, 3), S('Y', 20, 0, 3)]), ctx = ctxFor(n), T0 = shown(n, ctx);
  ctx.map.N = { kind: 'area' };
  const d = settleTree(T0, { type: 'drawArea', box: null, id: 'N', at: { col: 0, y: 2, cols: 12, rows: 2 } }, emptyMemory(), ctx);
  ok('5 an area drawn over X: its frame two rows at row 2, X under its free row (5), Y untouched, its children empty; sound', d.ok && d.layout.boxes.get('N').h === 2 && d.layout.boxes.get('N').cw === 12 && d.layout.boxes.get('X').y === 5 && d.layout.boxes.get('Y').y === 0 && d.layout.areas.get('N').boxes.size === 0 && !sound(d.layout, ctx).length, d.ok ? [places(d.layout), sound(d.layout, ctx)] : d);
  const small = settleTree(T0, { type: 'drawArea', box: null, id: 'N', at: { col: 0, y: 8, cols: 2, rows: 1 } }, emptyMemory(), ctx);
  ok('5 drawn smaller than its kind allows: as wide as its floor (12 cells), two rows', small.ok && small.layout.boxes.get('N').cw === 12 && small.layout.boxes.get('N').ch === 2, small.ok ? places(small.layout) : small);
  const inside = settleTree(T0, { type: 'drawArea', box: 'R', id: 'N', at: { col: 0, y: 0, cols: 12, rows: 2 } }, emptyMemory(), ctx);
  ok('5 never inside an area: refused', !inside.ok && inside.why === 'refused', inside);
}

/* ── 6. an area's side handle ── */
{
  const n = note(40, [A('R', 0, 1, 14), S('N', 16, 1, 3)], { R: [S('k', 8, 0, 4), S('m', 0, 0, 3)] }), ctx = ctxFor(n), T0 = shown(n, ctx);
  const inw = settleTree(T0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 13 }, emptyMemory(), ctx);
  const K = inw.ok && inw.layout.areas.get('R').boxes.get('k');
  ok('6 the right edge inwards to 12 inner columns: k pressed in to column 7, R narrower, both containers; sound', inw.ok && inw.layout.boxes.get('R').w === 13 && K.col === 7 && eq(inw.ran, ['R', null]) && !sound(inw.layout, ctx).length, inw.ok ? [places(inw.layout), places(inw.layout.areas.get('R')), sound(inw.layout, ctx)] : inw);
  const out = settleTree(T0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 18 }, emptyMemory(), ctx);
  ok('6 the right edge outwards past N: N pressed aside, clear of the area\'s free column; sound', out.ok && out.layout.boxes.get('R').w === 18 && !hits(out.layout.boxes.get('R'), out.layout.boxes.get('N')) && !sound(out.layout, ctx).length, out.ok ? places(out.layout) : out);
  const left = settleTree(T0, { type: 'areaSide', box: null, id: 'R', side: 'left', col: 2, cols: 0 }, emptyMemory(), ctx);
  const L2 = left.ok && left.layout, k2 = L2 && L2.areas.get('R').boxes.get('k');
  ok('6 the left edge two columns right: R at column 2, k keeping its sheet column (R.col + 1 + k.col = 9), m pressed in at column 0; sound', !!L2 && L2.boxes.get('R').col === 2 && L2.boxes.get('R').col + 1 + k2.col === 9 && L2.areas.get('R').boxes.get('m').col === 0 && !sound(L2, ctx).length, L2 ? [places(L2), places(L2.areas.get('R')), sound(L2, ctx)] : left);
  const wide = note(40, [A('R', 0, 1, 14)], { R: [S('w', 0, 0, 13)] }), cw = ctxFor(wide), W0 = shown(wide, cw);
  const ref = settleTree(W0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 13 }, emptyMemory(), cw);
  ok('6 a child wider than the area would be: refused, as a whole', !ref.ok && ref.why === 'refused', ref);
  const nar = note(40, [A('R', 0, 1, 14)], { R: [S('u', 0, 0, 1)] }), cn = ctxFor(nar), tiny = settleTree(shown(nar, cn), { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 3 }, emptyMemory(), cn);
  ok('6 the width no narrower than the area\'s floor (12 cells), however far the handle goes', tiny.ok && tiny.layout.boxes.get('R').w === 13 && tiny.layout.areas.get('R').cols === 12, tiny.ok ? places(tiny.layout) : tiny);
}

/* ── 6a. accepted only when both parts are: the wall in the area takes it, the area's width in the sheet is refused (P-SINK off, N at
   the sheet's edge with no room aside), and the whole is refused, nothing kept ── */
{
  const n = note(30, [A('R', 0, 1, 14), S('N', 26, 1, 3)], { R: [S('k', 0, 0, 3)] }), ctx = ctxFor(n, {}, resolve({ 'P-SINK': false })), T0 = shown(n, ctx);
  const r = settleTree(T0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 27 }, emptyMemory(), ctx);
  ok('6a the sheet\'s part refused: the whole refused', !r.ok && r.why === 'refused', r.ok ? places(r.layout) : r);
}

/* ── 3a. a code block carries its fold choice (`open`) into the area it enters ── */
{
  const n = note(30, [A('R', 0, 1, 14), { id: 'K', kind: 'code', col: 16, y: 1, cw: 12, open: true }], { R: [] }), ctx = ctxFor(n);
  ctx.map.K = { kind: 'code', text: Array(20).fill('x').join('\n') };
  const T0 = shown(n, ctx), e = settleTree(T0, { type: 'enter', box: null, id: 'K', to: 'R', at: { col: 0, y: 0 } }, emptyMemory(), ctx);
  const K = e.ok && e.layout.areas.get('R').boxes.get('K');
  ok('3a K into R: still open, all its 20 lines shown; sound', !!K && K.open === true && K.h === 20 && !sound(e.layout, ctx).length, e.ok ? places(e.layout.areas.get('R')) : e);
}

/* ── 8. the independent review of 9a06496: changes of an area itself, its container's life, its handle by its frame, one width ── */
{
  // (1) a size change of the area: its frame from its own fields and its children
  const n = note(30, [A('R', 0, 1, 12, { collapsed: true }), S('B', 0, 3, 2)], { R: [S('c', 0, 3, 2)] }), ctx = ctxFor(n), T0 = shown(n, ctx);
  const ex = settleTree(T0, { type: 'size', box: null, id: 'R', set: { collapsed: false } }, emptyMemory(), ctx);
  ok('8 a collapsed area opened: its frame round its child (5 rows), B under it at 7; sound', ex.ok && ex.layout.boxes.get('R').h === 5 && ex.layout.boxes.get('B').y === 7 && !sound(ex.layout, ctx).length, ex.ok ? places(ex.layout) : ex);
  const tall = ex.ok && settleTree(ex.layout, { type: 'size', box: null, id: 'R', set: { ch: 10 } }, emptyMemory(), ctx);
  ok('8 its height set to 10: the frame 10 rows, B at 12; and back: ch removed, 5 rows, B at 7', !!tall && tall.ok && tall.layout.boxes.get('R').h === 10 && tall.layout.boxes.get('B').y === 12 && (() => { const b = settleTree(tall.layout, { type: 'size', box: null, id: 'R', set: { ch: null } }, emptyMemory(), ctx); return b.ok && b.layout.boxes.get('R').h === 5 && b.layout.boxes.get('B').y === 7; })(), tall && (tall.ok ? places(tall.layout) : tall));
  // (2) an area's container made and taken away with it, by any creation or deletion
  const rm = settleTree(ex.layout, { type: 'remove', box: null, id: 'R' }, emptyMemory(), ctx);
  ok('8 an area deleted: its children\'s container with it; sound', rm.ok && !rm.layout.boxes.has('R') && !rm.layout.areas.has('R') && !sound(rm.layout, ctx).length, rm.ok ? [places(rm.layout), [...rm.layout.areas.keys()]] : rm);
  ctx.map.Q = { kind: 'area' };
  const mk = settleTree(T0, { type: 'create', box: null, id: 'Q', kind: 'area', at: { col: 16, y: 1, frow: 1, w: 13 }, away: true, set: { cw: 12, ch: 2 } }, emptyMemory(), ctx);
  ok('8 a plain creation of an area: its empty container with it, its frame two rows; sound', mk.ok && mk.layout.areas.get('Q')?.boxes.size === 0 && mk.layout.areas.get('Q').cols === 12 && mk.layout.boxes.get('Q').h === 2 && !sound(mk.layout, ctx).length, mk.ok ? places(mk.layout) : mk);
  const raw = settleTree(T0, { type: 'width', box: null, id: 'R', cw: 20 }, emptyMemory(), ctx);
  ok('8 an area\'s width only by areaSide: a plain width change of it fails as a caller\'s error', !raw.ok && raw.why === 'failed', raw);
  // (3) the side handle by the frame: the room `ch` leaves is taken; a header that grows at the new width refuses
  const h = note(40, [A('R', 0, 1, 20, { ch: 6 })], { R: [S('a', 0, 0, 6), S('b', 9, 0, 6)] }), ch = ctxFor(h), H0 = shown(h, ch);
  const inw = settleTree(H0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 13 }, emptyMemory(), ch);
  ok('8 the right edge inwards with room in ch: b sunk under a inside it, the frame still 6 rows; sound', inw.ok && inw.layout.boxes.get('R').h === 6 && inw.layout.areas.get('R').boxes.get('b').y === 1 && !sound(inw.layout, ch).length, inw.ok ? [places(inw.layout), places(inw.layout.areas.get('R'))] : inw);
  const hd = note(40, [A('R', 0, 1, 20)], { R: [S('a', 0, 0, 2)] }), chd = ctxFor(hd); chd.map.R = { text: chars(50) };
  const hd0 = shown(hd, chd), up = settleTree(hd0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 13 }, emptyMemory(), chd);
  ok('8 a header that takes two rows at the new width would make the area taller: refused', hd0.boxes.get('R').h === 2 && !up.ok && up.why === 'refused', up.ok ? places(up.layout) : up);
  // (4) one width for both parts on a sheet narrower than the area's floor
  const nw = note(10, [A('R', 0, 1, 12)], { R: [T('t', 0, 0)] }), cn = ctxFor(nw, { t: 30 }), N0 = shown(nw, cn);
  const nr = settleTree(N0, { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 6 }, emptyMemory(), cn);
  ok('8 a sheet narrower than the area\'s floor: the area keeps the width it is shown at, its children their columns; sound', nr.ok && nr.layout.boxes.get('R').w === N0.boxes.get('R').w && nr.layout.areas.get('R').cols === N0.areas.get('R').cols && !sound(nr.layout, cn).length, nr.ok ? [places(nr.layout), nr.layout.areas.get('R').cols] : nr);
}

/* ── 7. random notes and changes ── */
{
  let seed = +process.argv[2] || 5; const seed0 = seed;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const N = +process.argv[3] || 300;
  const SWITCHES = ['SIZE.1', 'SIZE.2', 'SIZE.8', 'GAP.5.1', 'GAP.5.2', 'GAP.9', 'P-ASIDE', 'P-UP', 'P-REST', 'P-SINK', 'DRAG.A3.narrow', 'DRAG.B5'];
  const stat = { notes: 0, changes: 0, refused: 0 }, by = {};
  let bad = 0, first = null;
  for (let k = 0; k < N; k++) {
    const cols = rnd() < 0.15 ? int(10, 16) : int(28, SHEETW), boxes = [], areas = {}, len = {};
    const leaf = (id, cmax) => { const b = rnd() < 0.45 ? T(id, int(0, cmax), int(0, 8)) : S(id, int(0, cmax), int(0, 8), int(1, 6)); if (b.cw == null) len[id] = int(1, 50); return b; };
    for (let i = 0, n = int(1, 6); i < n; i++) boxes.push(leaf('B' + i, cols - 4));
    for (let i = 0, n = int(1, 2); i < n; i++) { const id = 'R' + i, a = A(id, int(0, Math.max(0, cols - 16)), int(1, 10), int(12, 20), { ...(rnd() < 0.25 ? { ch: int(3, 8) } : {}), ...(rnd() < 0.1 ? { collapsed: true } : {}) }); boxes.push(a); areas[id] = []; for (let j = 0, m = int(0, 4); j < m; j++) areas[id].push(leaf(id + 'c' + j, 8)); }
    let rules; if (rnd() < 0.4) { const o = {}; for (const s of SWITCHES) if (rnd() < 0.15) o[s] = false; try { rules = resolve(o); } catch { rules = undefined; } }
    const n = note(cols, boxes, areas), ctx = ctxFor(n, len, rules);
    for (const id of Object.keys(areas)) if (rnd() < 0.3) ctx.map[id] = { text: chars(int(10, 70)) };   // a header that wraps at a narrower width
    const r = open(n, ctx);
    if (!r.ok) continue;
    stat.notes++;
    let Tr = r.shown; const hist = [];
    for (let s = 0; s < 4; s++) {
      const aids = [...Tr.areas.keys()], sheetIds = [...Tr.boxes.keys()].filter((id) => !Tr.areas.has(id)), pick = (xs) => xs[int(0, xs.length - 1)];
      let c = null; const which = rnd();
      if (which < 0.2 && aids.length) { const a = pick(aids), kids = [...Tr.areas.get(a).boxes.keys()]; if (kids.length) { const id = pick(kids); ctx.map[id] = { text: chars(int(1, 60)) }; if (Tr.areas.get(a).boxes.get(id).cw != null) ctx.map[id] = { text: 'x' }; c = { type: 'size', box: a, id }; } }
      else if (which < 0.4 && aids.length) { const a = pick(aids), C = Tr.areas.get(a), kids = [...C.boxes.keys()]; if (kids.length) { const id = pick(kids), b = C.boxes.get(id), y = Math.max(0, b.y + int(-2, 4)); c = { type: 'carry', box: a, id, at: { col: Math.max(0, Math.min(C.cols - b.w, b.col + int(-2, 2))), y, frow: y, w: b.w }, away: false }; } }
      else if (which < 0.55 && aids.length && sheetIds.length) { const id = pick(sheetIds); c = { type: 'enter', box: null, id, to: pick(aids), at: { col: int(0, 4), y: int(0, 4) } }; }
      else if (which < 0.7 && aids.length) { const a = pick(aids), kids = [...Tr.areas.get(a).boxes.keys()]; if (kids.length) c = { type: 'leave', box: a, id: pick(kids), to: null, at: { col: int(0, cols - 8), y: int(0, 14) } }; }
      else if (which < 0.85 && aids.length) { const a = pick(aids), b = Tr.boxes.get(a); c = rnd() < 0.5 ? { type: 'areaSide', box: null, id: a, side: 'right', col: b.col, cols: b.w + int(-6, 6) } : { type: 'areaSide', box: null, id: a, side: 'left', col: b.col + int(-4, 4), cols: 0 }; }
      else if (which < 0.92) { const id = 'D' + s; ctx.map[id] = { kind: 'area' }; c = { type: 'drawArea', box: null, id, at: { col: int(0, cols - 16), y: int(0, 14), cols: int(12, 16), rows: int(2, 4) } }; }
      else if (which < 0.95 && aids.length) c = { type: 'ungroup', box: null, id: pick(aids) };
      else if (which < 0.97 && aids.length) { const a = pick(aids), b = Tr.boxes.get(a); c = { type: 'size', box: null, id: a, set: rnd() < 0.5 ? { collapsed: !b.collapsed } : { ch: rnd() < 0.3 ? null : int(2, 12) } }; }
      else if (aids.length) c = rnd() < 0.5 ? { type: 'remove', box: null, id: pick(aids) } : (() => { const id = 'Q' + s; ctx.map[id] = { kind: 'area' }; return { type: 'create', box: null, id, kind: 'area', at: { col: int(0, cols - 16), y: int(0, 14), frow: 0, w: 13 }, away: true, set: { cw: int(12, 16), ch: int(2, 4) } }; })();
      if (!c) continue;
      hist.push(c); stat.changes++; by[c.type] = (by[c.type] || 0) + 1;
      const res = settleTree(Tr, c, emptyMemory(), ctx);
      if (!res.ok) { if (res.why === 'refused') { stat.refused++; continue; } bad++; if (!first) first = { k, seed0, why: (res.errors || ['failed'])[0], n: [...n.boxes.values()], areas, len, hist }; break; }
      const e = sound(res.layout, ctx);
      // an area's own handle never makes it taller (§5.4)
      if (c.type === 'areaSide' && res.layout.boxes.get(c.id).h > Tr.boxes.get(c.id).h) e.push(`${c.id}: its own side handle made it taller`);
      if (e.length) { bad++; if (!first) first = { k, seed0, why: e[0], hist, got: places(res.layout) }; break; }
      Tr = res.layout;
    }
  }
  ok(`7 ${stat.notes} random notes, ${stat.changes} changes ${JSON.stringify(by)} (${stat.refused} refused): never failed, every container sound, every frame round its children, every block in one container`, bad === 0, first);
}

process.exit(t.fails ? 1 : 0);
