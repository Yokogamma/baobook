// Node: P-ASIDE (public/layout/primitives.js `aside`; docs/LAYOUT-RULES.md §5.3, SIZE.2, SIZE.3; LAYOUT-ENGINE-PLAN §5.2) on working states
// written by hand: a block met from the side moves away from the block pressing it so that their cards share no column (pressed right, its
// handle may stand on the last cell of the card pressing it; pressed left, its card ends under that card's handle), the blocks it then
// hits go aside the same way, a chain; an elastic block narrows where it meets the container's edge or a block that cannot make the room
// («push first, then narrow»), a set width never; a block of the chain that cannot make all the room goes as far as it can and the block
// pressing it narrows by what is left; when the first block cannot get out of the way the whole chain is put back; an area by its extent;
// a narrowing that adds rows pushes the blocks under it as FOLLOW, no step. SIZE.2 in both states (its fallback: «never narrow»).
// P-ASIDE's own switch is read by settle.js (phase 4 skipped for the change kind's «no room aside»), so its off form is tests/layoutsettle's.
import { aside } from '../public/layout/primitives.js';
import { resolve, SETTINGS } from '../public/layout/rules.js';
import { set, text, area, chars, ctxOf, ws, places, steps, followed, hitting, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok, ctx = ctxOf();
// A takes 2 rows at 7 or 8 cells and 1 at 10 cells (30 characters, three a cell); its narrowest is min(natural 10, MINC 6) = 6 cells, w 7
const elastic = (rules, settings) => ctxOf({ A: { text: chars(30) } }, rules, settings);

/* ── 1. pressed right, pressed left, a chain ── */
{
  const w = ws(20, [set('A', 4, 0, 4), set('B', 7, 0, 4), set('X', 0, 3, 4)], ctx, 'X', { col: 2, y: 0 });
  const r = aside(w, 'A', 'X', 'right');
  ok('1 pressed right: A\'s handle on the last cell of X\'s card (col 5), and B, which A then hits, the same way (col 8)', r && eq(places(w), { X: [2, 0, 4, 1], A: [5, 0, 4, 1], B: [8, 0, 4, 1] }), places(w));
  ok('1a nothing hits afterwards, and a press aside is no step', hitting(w) === null && eq(steps(w), []) && eq(followed(w), {}));
  const v = ws(20, [set('A', 6, 0, 4), set('X', 0, 3, 4)], ctx, 'X', { col: 8, y: 0 });
  ok('1b pressed left: A\'s card ends under X\'s handle (A at col 5, card 6–8, X\'s handle at 8)', aside(v, 'A', 'X', 'left') && eq(places(v).A, [5, 0, 4, 1]), places(v));
  const u = ws(20, [set('A', 4, 0, 4), set('X', 0, 3, 4)], ctx, 'X', { col: 1, y: 0 });
  ok('1c a block that shares no column already stays where it is', aside(u, 'A', 'X', 'right') && eq(places(u).A, [4, 0, 4, 1]));
  const m = ws(20, [set('A', 4, 0, 4), set('B', 10, 0, 4, 2), set('X', 14, 4, 4)], ctx, 'X', { col: 2, y: 0 });
  ok('1d the moved block is never part of the chain, and a block A does not reach stays', aside(m, 'A', 'X', 'right') && eq(places(m), { X: [2, 0, 4, 1], A: [5, 0, 4, 1], B: [10, 0, 4, 2] }), places(m));
}

/* ── 2. no room: a set width is put back with its chain ── */
{
  const w = ws(11, [set('A', 4, 0, 4), set('B', 7, 0, 4), set('X', 0, 3, 4)], ctx, 'X', { col: 2, y: 0 });
  const before = places(w), r = aside(w, 'A', 'X', 'right');
  ok('2 a chain whose last block has a set width at the edge: the whole chain put back, false', !r && eq(places(w), before), places(w));
  ok('2a and nothing recorded', eq(steps(w), []) && eq(followed(w), {}));
  const v = ws(11, [set('A', 1, 0, 4), set('X', 4, 3, 4)], ctx, 'X', { col: 2, y: 0 });
  ok('2b pressed left past column 0 with a set width (it would need col −1): false, put back', !aside(v, 'A', 'X', 'left') && eq(places(v).A, [1, 0, 4, 1]), places(v));
}

/* ── 3. an elastic block narrows at the edge, the blocks under it following as FOLLOW ── */
{
  const w = ws(13, [text('A', 2, 0, 11), set('B', 2, 2, 4), set('X', 0, 4, 4)], elastic(), 'X', { col: 0, y: 0 });
  const r = aside(w, 'A', 'X', 'right');
  ok('3 A pressed right to col 3 has no room for 10 cells: it narrows to the edge (w 10, 9 cells) and takes 2 rows', r && eq(places(w).A, [3, 0, 10, 2]), places(w));
  ok('3a B under it follows with its gap of one row, as FOLLOW after a height, no step', places(w).B[1] === 3 && eq(followed(w), { B: 1 }) && eq(steps(w), []), [followed(w), steps(w)]);
  const off = ws(13, [text('A', 2, 0, 11), set('B', 2, 2, 4), set('X', 0, 4, 4)], elastic(resolve({ 'SIZE.2': false })), 'X', { col: 0, y: 0 });
  ok('3b SIZE.2 off («never narrow»): A cannot narrow, false, put back', !aside(off, 'A', 'X', 'right') && eq(places(off).A, [2, 0, 11, 1]), places(off));
  const never = ws(13, [text('A', 2, 0, 11), set('B', 2, 2, 4), set('X', 0, 4, 4)], elastic(undefined, { ...SETTINGS, ORDER: 'never' }), 'X', { col: 0, y: 0 });
  ok('3c ORDER «never narrow»: the same', !aside(never, 'A', 'X', 'right') && eq(places(never).A, [2, 0, 11, 1]));
  const tight = ws(9, [text('A', 1, 0, 8, 2), set('X', 0, 4, 4)], elastic(), 'X', { col: 0, y: 0 });
  ok('3d an elastic block that would go below its narrowest (6 cells, w 7) does not: false', !aside(tight, 'A', 'X', 'right') && eq(places(tight).A, [1, 0, 8, 2]), places(tight));
}

/* ── 4. a block of the chain that cannot make all the room: the one pressing it narrows by what is left ── */
{
  const w = ws(14, [text('A', 2, 0, 9, 2), set('B', 10, 0, 4), set('X', 0, 4, 4)], elastic(), 'X', { col: 0, y: 0 });
  ok('4 B (a set width at the edge) cannot move: A at col 3 narrows to end before B\'s card (w 8, 7 cells), B stays', aside(w, 'A', 'X', 'right') && eq(places(w), { X: [0, 0, 4, 1], A: [3, 0, 8, 2], B: [10, 0, 4, 1] }), places(w));
  const v = ws(15, [text('A', 2, 0, 9, 2), set('B', 10, 0, 4), set('X', 0, 4, 5)], elastic(), 'X', { col: 0, y: 0 });
  ok('4a «far»: B goes the one cell it can (col 11), and A narrows only by what is left (w 8)', aside(v, 'A', 'X', 'right') && eq(places(v), { X: [0, 0, 5, 1], A: [4, 0, 8, 2], B: [11, 0, 4, 1] }), places(v));
  const off = ws(15, [text('A', 2, 0, 9, 2), set('B', 10, 0, 4), set('X', 0, 4, 5)], elastic(resolve({ 'SIZE.2': false })), 'X', { col: 0, y: 0 });
  ok('4b SIZE.2 off: A cannot narrow by what is left, the chain is put back', !aside(off, 'A', 'X', 'right') && eq(places(off), { X: [0, 0, 5, 1], A: [2, 0, 9, 2], B: [10, 0, 4, 1] }), places(off));
}

/* ── 4c. the left side and an elastic block in the chain (pinned after the internal review of 345ac6f) ── */
{
  const two = (rules) => ctxOf({ A: { text: chars(30) }, M: { text: chars(30) } }, rules);
  const l = ws(20, [text('A', 1, 0, 11), set('X', 14, 4, 4)], two(), 'X', { col: 8, y: 0 });
  ok('4c pressed left past column 0: A narrows on the side it is pressed from, at col 0, its card ending under X\'s handle (w 9, 2 rows)', aside(l, 'A', 'X', 'left') && eq(places(l).A, [0, 0, 9, 2]), places(l));
  const b = ws(20, [set('B', 0, 0, 3), text('A', 3, 0, 11), set('X', 14, 4, 4)], two(), 'X', { col: 11, y: 0 });
  ok('4d pressed left onto a set width at column 0: B cannot move, A narrows by what is left from the left (col 2, w 10)', aside(b, 'A', 'X', 'left') && eq(places(b), { B: [0, 0, 3, 1], A: [2, 0, 10, 2], X: [11, 0, 4, 1] }), places(b));
  const m = ws(24, [text('A', 2, 0, 11), text('M', 13, 0, 11), set('X', 0, 4, 6)], two(), 'X', { col: 0, y: 0 });
  ok('4e an elastic block in the chain gives way at the edge (M to col 15, w 9, 2 rows) and the one pressing it keeps its width', aside(m, 'A', 'X', 'right') && eq(places(m), { X: [0, 0, 6, 1], A: [5, 0, 11, 1], M: [15, 0, 9, 2] }), places(m));
}

/* ── 5. an area by its extent ── */
{
  const w = ws(20, [area('A', 4, 1, 6, 2), set('X', 0, 6, 6)], ctx, 'X', { col: 0, y: 0 });
  ok('5 an area met from the side keeps one free cell: its extent starts after X\'s card (frame at col 6)', aside(w, 'A', 'X', 'right') && eq(places(w).A, [6, 1, 6, 2]), places(w));
  const v = ws(20, [set('A', 10, 1, 4), area('X', 0, 8, 6, 2)], ctx, 'X', { col: 7, y: 1 });
  ok('5a pressed right by an area (extent 7–13): A\'s handle on the area\'s free column on the right, col 13', aside(v, 'A', 'X', 'right') && eq(places(v).A, [13, 1, 4, 1]), places(v));
  const edge = ws(20, [area('A', 10, 1, 8, 2), set('X', 0, 6, 6)], ctx, 'X', { col: 6, y: 1 });
  ok('5c an area pushed past the container\'s last column (its right free column at 20 of 20): false, put back', !aside(edge, 'A', 'X', 'right') && eq(places(edge).A, [10, 1, 8, 2]), places(edge));
  const fits = ws(20, [area('A', 10, 1, 8, 2), set('X', 0, 6, 6)], ctx, 'X', { col: 5, y: 1 });
  ok('5d to the last column it may take: its right free column on column 19', aside(fits, 'A', 'X', 'right') && eq(places(fits).A, [11, 1, 8, 2]), places(fits));
  const left = ws(20, [set('A', 9, 1, 4), area('X', 0, 8, 6, 2)], ctx, 'X', { col: 11, y: 1 });
  ok('5b pressed left by an area at col 11: A\'s card ends at col 10, before the area\'s extent', aside(left, 'A', 'X', 'left') && eq(places(left).A, [7, 1, 4, 1]), places(left));
}

/* ── 6. an obstacle's extent, as a wall presses; the moved block is never pressed ── */
{
  const w = ws(20, [set('A', 2, 0, 4), set('B', 5, 2, 4)], ctx);
  ok('6 pressed by an extent that is no block (a wall at columns 0–3): A to col 3; B, on other rows, stays', aside(w, 'A', { c0: 0, c1: 3 }, 'right') && eq(places(w), { A: [3, 0, 4, 1], B: [5, 2, 4, 1] }), places(w));
  const o = ws(20, [set('A', 2, 0, 4), set('B', 5, 2, 4)], ctx);
  ok('6a an Obstacle as shapes.js describes it (cols, rows, pushes) presses the same way', aside(o, 'A', { cols: [0, 3], rows: [0, 5], pushes: 'right' }, 'right') && eq(places(o).A, [3, 0, 4, 1]), places(o));
  const g = ws(20, [set('A', 0, 0, 4), set('X', 8, 3, 4)], ctx, 'X', { col: 2, y: 0 });
  ok('6b the moved block itself is never pressed aside: false, nothing moves', !aside(g, 'X', 'A', 'right') && eq(places(g).X, [2, 0, 4, 1]), places(g));
}

process.exit(t.fails ? 1 : 0);
