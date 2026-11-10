// Node: P-REST (public/layout/primitives.js `rest`; docs/LAYOUT-RULES.md §5.3 [S5], phase 9 (b)) on working states written by hand: an
// elastic block at its minimum that still hits a neighbour on its right presses that neighbour aside by P-ASIDE, by the cells it lacks, the
// chain included, as a text growing in height pushes the blocks under it down (H1); when the neighbour cannot make the room, the elastic
// block goes down itself, under that neighbour; any other hit is not P-REST's (false: P-SEP separates it). P-REST's own switch, and SIZE.2
// and P-ASIDE that it needs (LAYOUT-RULES §1.6), are read by settle.js and size.js: with SIZE.2 off no block is at a minimum it may press from.
import { rest } from '../public/layout/primitives.js';
import { resolve } from '../public/layout/rules.js';
import { set, text, chars, ctxOf, ws, place, places, hitting, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
// A: 30 characters, natural 10 cells, its narrowest min(10, MINC 6) = 6 cells (w 7), 2 rows at 6 cells
const ctx = ctxOf({ A: { text: chars(30) } });

/* ── 1. the neighbour on its right goes aside ── */
{
  const w = place(ws(20, [text('A', 0, 0, 7, 2), set('B', 5, 4, 4), set('C', 8, 0, 4)], ctx), 'B', { y: 0 });
  ok('1 A at its minimum (6 cells) hits B on its right: B goes aside by the cells A lacks (B\'s handle on A\'s last cell, col 6), C with it', rest(w, 'A', 'B') && eq(places(w), { A: [0, 0, 7, 2], B: [6, 0, 4, 1], C: [9, 0, 4, 1] }) && hitting(w) === null, places(w));
  const r = place(ws(20, [text('A', 0, 0, 7, 2), set('B', 5, 4, 4)], ctx), 'B', { y: 0 });
  ok('1a the pair in either order', rest(r, 'B', 'A') && eq(places(r).B, [6, 0, 4, 1]), places(r));
}

/* ── 2. no room: the elastic block goes down under it ── */
{
  const w = place(ws(9, [text('A', 0, 0, 7, 2), set('B', 5, 4, 4)], ctx), 'B', { y: 0 });
  ok('2 B has a set width and no room on its right: A goes down under B', rest(w, 'A', 'B') && eq(places(w), { A: [0, 1, 7, 2], B: [5, 0, 4, 1] }) && hitting(w) === null, places(w));
}

/* ── 3. not P-REST's ── */
{
  const w = place(ws(20, [text('A', 0, 0, 9, 1), set('B', 7, 4, 4)], ctx), 'B', { y: 0 });
  ok('3 A above its minimum (8 cells): not P-REST\'s, false, nothing moved', !rest(w, 'A', 'B') && eq(places(w), { A: [0, 0, 9, 1], B: [7, 0, 4, 1] }), places(w));
  const l = place(ws(20, [set('B', 0, 4, 4), text('A', 2, 0, 7, 2)], ctx), 'B', { y: 0 });
  ok('3a the other block on its left: false', !rest(l, 'A', 'B'));
  const s = place(ws(20, [set('A', 0, 0, 7, 2), set('B', 5, 4, 4)], ctx), 'B', { y: 0 });
  ok('3b a set width is at no minimum: false', !rest(s, 'A', 'B'));
  const off = place(ws(20, [text('A', 0, 0, 7, 2), set('B', 5, 4, 4)], ctxOf({ A: { text: chars(30) } }, resolve({ 'SIZE.2': false }))), 'B', { y: 0 });
  ok('3c SIZE.2 off: no block has a minimum to press from, false', !rest(off, 'A', 'B'));
}

process.exit(t.fails ? 1 : 0);
