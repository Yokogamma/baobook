// Node: `sink` and its three uses (public/layout/primitives.js `sink`, `down`, `sinkAside`, `sep`; docs/LAYOUT-RULES.md §5.3), and the push
// with followers they rest on (public/layout/gap.js `push`; LAYOUT-ENGINE-PLAN §5.2), on working states written by hand:
// - P-DOWN: every block judged below the moved block that reaches it sinks right under it, overlapping or not (a pointer that jumps past a
//   block still pushes it), the blocks under it following with their gaps, a column with slack taking the push into its slack first; the
//   steps cut one per common part, the block that went furthest alone first;
// - the push: the moved block, in no chain, neither leads nor follows; a block narrowed or pressed off a column pushes nothing there (GAP.9);
//   a gap P-UP closed stays closed;
// - P-SINK: a block P-ASIDE put back sinks against every block it hits, again and again; an elastic one at min(natural width, TEXTW), clamped
//   to the container; under a wall it first moves inside;
// - P-SEP: of two blocks that hit, the lower one sinks, on the same row the right one, on the same row and column the later in reading
//   order; the moved block never moves; in phase 7 the other goes by its side.
// The switches that choose between these uses (P-SINK, P-UP) are read by settle.js; their off forms are tests/layoutsettle's.
import { down, sink, sinkAside, sep, sinkTo } from '../public/layout/primitives.js';
import { push } from '../public/layout/gap.js';
import { DEFAULT } from '../public/layout/rules.js';
import { box, placed, edit, relink, stack } from './lib/gapcase.mjs';
import { hits } from '../public/layout/geometry.js';
import { set, text, area, chars, ctxOf, ws, sheet, over, grown, place, rows, places, steps, followed, hitting, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok, ctx = ctxOf();

/* ── 1. P-DOWN ── */
{
  const w = ws(20, [set('A', 0, 0, 5, 2), set('B', 0, 3, 5), set('X', 8, 0, 5, 2)], ctx, 'X', { col: 0, y: 1 });
  down(w, new Set(['A', 'B']));
  ok('1 A, judged below and reached by X (rows 1–2), sinks right under it to row 3; B under A follows with its gap of one row', eq(rows(w), { X: 1, A: 3, B: 6 }), rows(w));
  ok('1a one step, A and B together by 3 rows', eq(steps(w), [[['A', 'B'], 3, 'down']]), steps(w));
  const j = ws(20, [set('A', 0, 0, 5, 2), set('X', 0, 4, 5, 2)], ctx, 'X', { y: 5 });
  down(j, new Set(['A']));
  ok('1b reaching, not hitting: X jumped from row 4 past A to row 5, A judged below still sinks under it (row 7)', eq(rows(j), { A: 7, X: 5 }), rows(j));
  const n = ws(20, [set('A', 0, 0, 5, 2), set('B', 0, 3, 5), set('X', 8, 0, 5, 2)], ctx, 'X', { col: 0, y: 1 });
  down(n, new Set(['B']));
  ok('1c a block not judged below is not pushed by P-DOWN (A stays where X put its card on it, for P-SEP)', eq(rows(n), { A: 0, X: 1, B: 3 }) && eq(steps(n), []), rows(n));
}

/* ── 2. followers with slack, and the cut by common parts ── */
{
  // C grew from 2 to 4 rows and pushed B to row 5: in A's column B's gap is still 1 row, so it has 2 rows of slack there
  const L = grown(sheet(20, [set('A', 0, 0, 5, 2), set('C', 6, 0, 5, 2), set('B', 0, 3, 11), set('X', 14, 0, 5, 2)]), 'C', 4);
  const w = over(L, ctx, 'X', { col: 0, y: 1 });
  down(w, new Set(['A', 'B']));
  ok('2 A sinks by 3 to row 3; B, held by C two rows lower than A\'s column holds it, takes the push into that slack and goes 1 row', eq(rows(w), { C: 0, X: 1, A: 3, B: 6 }), rows(w));
  ok('2a the steps cut one per common part: A alone 2 rows, then A and B 1 row', eq(steps(w), [[['A'], 2, 'down'], [['A', 'B'], 1, 'down']]), steps(w));
}

/* ── 3. the push: the moved block, a block that left a column, a closed gap ── */
{
  // X stands at its old place between A and B (its place held, DRAG.B1) but is the moved block: A sunk into it does not push B through it
  const w = ws(20, [set('A', 0, 0, 5), set('X', 0, 2, 5), set('B', 0, 4, 5)], ctx, 'X', { col: 0, y: 2 });
  sinkTo(w, 'A', 1, 'down');
  ok('3 the moved block neither leads nor follows: A moved down by 1, B (under X in the chain) stays', eq(rows(w), { A: 1, X: 2, B: 4 }), rows(w));
  // A pressed aside out of its column: sunk afterwards, it pushes nothing under its old columns
  const L = sheet(20, [set('A', 0, 0, 5), set('B', 0, 2, 5)]), A2 = { ...L.boxes.get('A'), col: 6 };
  const moved = { ...L, boxes: new Map([...L.boxes].map(([k, b]) => [k, k === 'A' ? A2 : b])) };
  const p = push(moved, { ...moved, boxes: new Map([...moved.boxes].map(([k, b]) => [k, k === 'A' ? { ...b, y: 3 } : b])) });
  ok('3a a block pressed off its columns leads nothing there (GAP.9): A at col 6 sunk to row 3, B in A\'s old column stays at 2', p.boxes.get('B').y === 2 && p.boxes.get('A').y === 3, [...p.boxes].map(([k, b]) => [k, b.y]));
  // a gap P-UP closed stays closed: B was lifted to touch A; A sinks by 1, B follows by 1, not back to its stack's distance
  const L2 = sheet(20, [set('A', 0, 0, 5), set('B', 0, 3, 5)]), lifted = { ...L2, boxes: new Map([...L2.boxes].map(([k, b]) => [k, k === 'B' ? { ...b, y: 1 } : b])) };
  const q = push(lifted, { ...lifted, boxes: new Map([...lifted.boxes].map(([k, b]) => [k, k === 'A' ? { ...b, y: 1 } : b])) });
  ok('3b a gap closed in the working state stays closed: A down 1, B (lifted to row 1 against its stack of 2 rows) follows to 2', q.boxes.get('B').y === 2, [...q.boxes].map(([k, b]) => [k, b.y]));
  const r = push(L2, L2);
  ok('3c a push with nothing moved moves nothing', [...r.boxes].every(([k, b]) => b.y === L2.boxes.get(k).y));
  // B, under A in the chain, was put on A's rows by an earlier phase: sinking A does not drag it along (P-REST or P-SEP settles them)
  const L3 = sheet(20, [set('A', 0, 0, 5, 2), set('B', 3, 4, 5)]), beside = { ...L3, boxes: new Map([...L3.boxes].map(([k, b]) => [k, k === 'B' ? { ...b, y: 1 } : b])) };
  const u = push(beside, { ...beside, boxes: new Map([...beside.boxes].map(([k, b]) => [k, k === 'A' ? { ...b, y: 3 } : b])) });
  ok('3d a block no longer under its upper element on the screen does not follow it: A sunk to row 3, B (put on A\'s rows) stays at 1', u.boxes.get('B').y === 1, [...u.boxes].map(([k, b]) => [k, b.y]));
}

/* ── 3e. the push through a standing block and areas (pinned after the internal review of 345ac6f) ── */
{
  const mv = (L, id, patch) => ({ ...L, boxes: new Map([...L.boxes].map(([k, b]) => [k, k === id ? { ...b, ...patch } : b])) });
  const ys = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, b.y]));
  // X put into A's gap over L: it stands in L's stack, A | A3 [X:A1] A5
  let H = placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]);
  H = relink(H, edit(H, (m) => m.set('X', box('X', 1, 1, 4))), {}, 'X', DEFAULT);
  ok('3e (X stands in L\'s stack under A)', stack(H, 'L', 1) === 'A | A3 [X:A1] A5 |' && eq(ys(H), { A: 0, X: 4, L: 10 }), [stack(H, 'L', 1), ys(H)]);
  ok('3f A down 2: the standing block and the anchor under it follow with their rows', eq(ys(push(H, mv(H, 'A', { y: 2 }))), { A: 2, X: 6, L: 12 }));
  ok('3g the standing block down 2: L under it follows', eq(ys(push(H, mv(H, 'X', { y: 6 }))), { A: 0, X: 6, L: 12 }));
  ok('3h with the standing block the moved one: A down 2 pushes neither it nor what is under it', eq(ys(push(H, mv(H, 'A', { y: 2 }), new Set(['X']))), { A: 2, X: 4, L: 10 }));
  const S = sheet(20, [set('A', 0, 0, 5, 2), area('B', 0, 4, 6, 2), set('C', 0, 9, 5)]);
  ok('3i an area follows by its extent, and the block under it follows the area', eq(ys(push(S, mv(S, 'A', { y: 1 }))), { A: 1, B: 5, C: 10 }) && eq(ys(push(S, mv(S, 'B', { y: 6 }))), { A: 0, B: 6, C: 11 }));
  const T = sheet(20, [set('A', 0, 0, 5, 2), area('B', 0, 3, 6, 2)]);
  ok('3j an area whose free row touches the block above it (no rows between) follows it row for row', eq(ys(push(T, mv(T, 'A', { y: 2 }))), { A: 2, B: 5 }));
}

/* ── 4. P-SINK ── */
{
  const w = ws(20, [set('A', 0, 0, 5), set('D', 2, 3, 5, 2), set('X', 10, 5, 5, 2)], ctx, 'X', { col: 0, y: 0 });
  sinkAside(w, 'A');
  ok('4 A, put back by P-ASIDE, sinks against what it hits, under X (row 2); D under it follows with its gap', eq(rows(w), { X: 0, A: 2, D: 5 }) && hitting(w) === null, rows(w));
  ok('4a one step, a sink', eq(steps(w), [[['A', 'D'], 2, 'sink']]), steps(w));
  // D was pressed aside into A's columns earlier in the phases, so it is in no chain of A's there: A sinks under X, hits D, sinks under D
  const v = ws(20, [set('A', 0, 0, 5), set('D', 8, 2, 5, 2), set('X', 10, 6, 5, 2)], ctx, 'X', { col: 0, y: 0 });
  v.L = { ...v.L, boxes: new Map([...v.L.boxes].map(([k, b]) => [k, k === 'D' ? { ...b, col: 2 } : b])) };
  sinkAside(v, 'A');
  ok('4b again and again until it hits nothing: under X (row 2), then under D, which came into its columns by the side (row 4)', eq(rows(v), { X: 0, D: 2, A: 4 }) && hitting(v) === null, rows(v));
  // an elastic block sinks at min(natural width, TEXTW), clamped to the container: 40 characters, natural 14 cells, 1 row at 14 cells
  const c = ctxOf({ A: { text: chars(40) } });
  const e = ws(12, [text('A', 2, 0, 8, 2), set('X', 0, 5, 6, 2)], c, 'X', { col: 0, y: 0 });
  sinkAside(e, 'A');
  ok('4c an elastic block sinks at its natural width clamped to the container (9 cells, w 10, at col 2) and its height there (2 rows)', eq(places(e).A, [2, 2, 10, 2]), places(e));
  const in_ = ws(10, [set('A', 7, 0, 4), set('X', 0, 4, 6, 2)], ctx, 'X', { col: 0, y: 0, w: 9 });
  in_.L = { ...in_.L, boxes: new Map(in_.L.boxes) };
  sinkAside(in_, 'A', { inside: true });
  ok('4d under a wall it first moves inside the container (a 10-column area: col 6, its card ending at the last column), then sinks', eq(places(in_).A, [6, 2, 4, 1]), places(in_));
}

/* ── 4e. P-SINK inside an area's columns (pinned after the internal review of 345ac6f) ── */
{
  const c = ctxOf({ A: { text: chars(15) } });   // natural 5 cells, one row
  const e = ws(10, [text('A', 6, 3, 6), set('X', 0, 6, 4)], c);
  sinkAside(e, 'A', { inside: true });
  ok('4e an elastic block sticking out past an area\'s last column comes inside at its width (col 4, card 5–9)', eq(places(e).A, [4, 3, 6, 1]), places(e));
  const l = place(ws(10, [set('A', 2, 0, 4), set('B', 0, 3, 5)], ctx), 'A', { col: -2 });
  sinkAside(l, 'A', { inside: true });
  ok('4f a handle left of column 0 after the left edge\'s shift comes in at column 0', eq(places(l).A, [0, 0, 4, 1]), places(l));
}

/* ── 5. P-SEP ── */
{
  const w = ws(20, [set('A', 0, 0, 5, 2), set('B', 2, 3, 5, 2)], ctx);
  w.L = { ...w.L, boxes: new Map([...w.L.boxes].map(([k, b]) => [k, k === 'B' ? { ...b, y: 1 } : b])) };
  sep(w, 'A', 'B');
  ok('5 of two blocks that hit, the lower one sinks against the other (B to row 2)', eq(rows(w), { A: 0, B: 2 }) && hitting(w) === null, rows(w));
  const s = ws(20, [set('A', 0, 0, 5, 2), set('B', 2, 3, 5, 2)], ctx);
  s.L = { ...s.L, boxes: new Map([...s.L.boxes].map(([k, b]) => [k, k === 'B' ? { ...b, y: 0 } : b])) };
  sep(s, 'B', 'A');
  ok('5a on the same row the right one sinks (B, col 2)', eq(rows(s), { A: 0, B: 2 }), rows(s));
  const g = ws(20, [set('A', 0, 0, 5, 2), set('X', 2, 4, 5, 2)], ctx, 'X', { y: 1 });
  sep(g, 'X', 'A');
  ok('5b the moved block never moves: X lower, A still sinks under it', eq(rows(g), { X: 1, A: 3 }), rows(g));
  const same = place(ws(20, [set('A', 0, 0, 5), set('B', 0, 4, 3)], ctx), 'B', { y: 0 });
  sep(same, 'B', 'A');
  ok('5d on the same row and column the later in the reading order of the phase\'s start sinks (B after A)', eq(rows(same), { A: 0, B: 1 }), rows(same));
  const und = ws(20, [set('A', 0, 0, 5, 2), set('X', 0, 4, 5, 2)], ctx, 'X', { y: 1 });
  sep(und, 'A', 'X', () => undefined);
  ok('5e in phase 7 a block with no side judged against the moved block is taken as below: it sinks', eq(rows(und), { X: 1, A: 3 }), rows(und));
  const p7 = ws(20, [set('A', 0, 0, 5, 1), set('X', 0, 4, 5, 2)], ctx, 'X', { y: 0 });
  sep(p7, 'A', 'X', (id) => (id === 'A' ? 'above' : undefined));
  ok('5c in phase 7, against the moved block, one judged above goes up by P-UP: A at row 0 cannot, so X stands under it', eq(rows(p7), { A: 0, X: 1 }), rows(p7));
}

/* ── 6. areas by their extents ── */
{
  const w = ws(20, [area('A', 1, 1, 6, 2), set('X', 10, 6, 5, 2)], ctx, 'X', { col: 0, y: 0 });
  down(w, new Set(['A']));
  ok('6 an area judged below sinks by its extent: its free row above under X\'s card (X rows 0–1, the area\'s frame at row 3)', eq(rows(w), { X: 0, A: 3 }) && !hits(w.L.boxes.get('A'), w.L.boxes.get('X')), rows(w));
}

/* ── 7. sink ends ── */
{
  const w = ws(20, [set('A', 0, 0, 5), set('B', 0, 1, 5), set('C', 0, 2, 5)], ctx);
  sink(w, 'A', () => false, () => true, 'sink');
  ok('7 a sink against nothing moves nothing', eq(rows(w), { A: 0, B: 1, C: 2 }) && eq(steps(w), []));
}

process.exit(t.fails ? 1 : 0);
