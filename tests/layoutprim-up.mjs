// Node: P-UP (public/layout/primitives.js `up`; docs/LAYOUT-RULES.md §5.3 [M3]), the mirror of `sink`, on working states written by hand:
// every block judged above the moved block that shares a column with it and reaches it (its bottom below the moved block's top, overlapping
// or not) goes up so that its bottom meets the moved block's top: first the gap above it shrinks, then the blocks above it go up too, each
// only as far as it must, up to row 0; when they cannot all go high enough, the moved block stands under the lowest bottom they could reach;
// nothing follows a block up; the steps cut one per common part, the block that went furthest alone first; an area by its extent. Over a
// moved block that comes in by rule 3 (created, or carried while away) no block goes up: the moved block stands under them (G17).
// P-UP's own switch (its fallback: the blocks judged above pushed down under the moved block) is read by settle.js: tests/layoutsettle.
import { up, sep } from '../public/layout/primitives.js';
import { set, area, ctxOf, ws, rows, steps, hitting, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok, ctx = ctxOf();

/* ── 1. the gap above shrinks first ── */
{
  const w = ws(20, [set('A', 0, 0, 5), set('B', 0, 3, 5, 2), set('X', 0, 6, 5, 2)], ctx, 'X', { y: 4 });
  up(w, new Set(['A', 'B']));
  ok('1 B (rows 3–4) reaches X at row 4: it goes up one row into its gap; A stays', eq(rows(w), { A: 0, B: 2, X: 4 }) && hitting(w) === null, rows(w));
  ok('1a one step, B up 1', eq(steps(w), [[['B'], -1, 'up']]), steps(w));
}

/* ── 2. then the blocks above go up too, only as far as they must ── */
{
  const w = ws(20, [set('A', 0, 1, 5), set('B', 0, 3, 5, 2), set('X', 0, 6, 5, 2)], ctx, 'X', { y: 3 });
  up(w, new Set(['A', 'B']));
  ok('2 B must end at row 3: it goes up 2, its gap of one row first, then A goes up 1 to row 0', eq(rows(w), { A: 0, B: 1, X: 3 }) && hitting(w) === null, rows(w));
  ok('2a the steps cut one per common part: B alone 1 row, then A and B 1 row', eq(steps(w), [[['B'], -1, 'up'], [['A', 'B'], -1, 'up']]), steps(w));
}

/* ── 2b. several blocks above, one over another, and one over two (the internal review of 345ac6f: a block above was dropped once the
   block under it was lifted, and two blocks ended on one another) ── */
{
  const w = ws(20, [set('A', 0, 6, 5, 2), set('B', 0, 8, 5), set('C', 0, 9, 5, 2), set('X', 0, 12, 5, 2)], ctx, 'X', { y: 5 });
  up(w, new Set(['A', 'B', 'C']));
  ok('2b three touching blocks over X carried up to row 5: each goes up 6 rows, one step, nothing hits', eq(rows(w), { A: 0, B: 2, C: 3, X: 5 }) && hitting(w) === null && eq(steps(w), [[['A', 'B', 'C'], -6, 'up']]), [rows(w), steps(w)]);
  const v = ws(20, [set('U', 0, 0, 11), set('A', 0, 2, 11), set('B2', 6, 4, 5, 2), set('B1', 0, 5, 5), set('X', 0, 7, 11)], ctx, 'X', { y: 4 });
  up(v, new Set(['U', 'A', 'B1', 'B2']));
  ok('2c A over two blocks in different columns, U over A: B2 needs A one row higher, B1 needs nothing of it; U stays', eq(rows(v), { U: 0, A: 1, B2: 2, B1: 3, X: 4 }) && hitting(v) === null, rows(v));
}

/* ── 3. no room above: the moved block stands lower ── */
{
  const w = ws(20, [set('A', 0, 0, 5), set('B', 0, 1, 5, 2), set('X', 0, 6, 5, 3)], ctx, 'X', { y: 2 });
  up(w, new Set(['A', 'B']));
  ok('3 A at row 0 and B right under it cannot go up: X stands under B\'s bottom (row 3), a step of its own', eq(rows(w), { A: 0, B: 1, X: 3 }) && eq(steps(w), [[['X'], 1, 'up']]), [rows(w), steps(w)]);
  const v = ws(20, [set('A', 0, 0, 5), set('B', 0, 2, 5, 2), set('X', 0, 6, 5, 3)], ctx, 'X', { y: 2 });
  up(v, new Set(['A', 'B']));
  ok('3a part of the way: B goes up its one row of gap, and X stands under it at row 3', eq(rows(v), { A: 0, B: 1, X: 3 }) && hitting(v) === null, rows(v));
  ok('3b in that run X goes down one row and B up one, two steps of opposite directions', eq(steps(v), [[['X'], 1, 'up'], [['B'], -1, 'up']]), steps(v));
}

/* ── 4. which blocks P-UP pushes ── */
{
  const w = ws(20, [set('A', 0, 0, 5, 2), set('X', 0, 6, 5, 2)], ctx, 'X', { y: 1 });
  up(w, new Set());
  ok('4 a block not judged above is not pushed by P-UP', eq(rows(w), { A: 0, X: 1 }));
  const j = ws(20, [set('A', 0, 4, 5, 2), set('X', 0, 0, 5, 2)], ctx, 'X', { y: 2 });
  up(j, new Set(['A']));
  ok('4a reaching, not hitting: X jumped up past A, A judged above still goes up over it', eq(rows(j), { A: 0, X: 2 }) && hitting(j) === null, rows(j));
  const s = ws(20, [set('A', 0, 2, 5, 2), set('C', 0, 5, 5), set('X', 8, 0, 5, 2)], ctx, 'X', { col: 0, y: 3 });
  up(s, new Set(['A']));
  ok('4b nothing follows a block up: C under A stays where it was', eq(rows(s), { A: 1, X: 3, C: 5 }), rows(s));
  const o = ws(20, [set('A', 0, 2, 5, 2), set('X', 8, 0, 5, 2)], ctx, 'X', { col: 7, y: 3 });
  up(o, new Set(['A']));
  ok('4c a block that shares no column with the moved block is not pushed', eq(rows(o), { A: 2, X: 3 }), rows(o));
}

/* ── 5. areas by their extents ── */
{
  const w = ws(20, [area('A', 1, 2, 6, 2), set('X', 10, 8, 5, 2)], ctx, 'X', { col: 0, y: 4 });
  up(w, new Set(['A']));
  ok('5 an area judged above goes up by its extent: its free row under it above X (frame rows 1–2, extent 0–3)', eq(rows(w), { A: 1, X: 4 }) && hitting(w) === null, rows(w));
  const v = ws(20, [set('A', 0, 0, 5), area('X', 0, 8, 6, 2)], ctx, 'X', { y: 1 });
  up(v, new Set(['A']));
  ok('5a a block over a moved area that cannot go up: the area stands with its free row under it (frame row 2)', eq(rows(v), { A: 0, X: 2 }) && hitting(v) === null, rows(v));
}

/* ── 6. over an inserted block no block goes up (the owner, 2026-11-12, G17) ── */
{
  // A in columns 2–5 at rows 2–5 with two free rows above it, B under it at row 7; X, five columns wide and two rows tall, comes with its
  // top on A's lower half (row 4). Inserted (created, or carried while away), A stays and X goes under it, to row 6, so that taking X away
  // gives every row back (INV-7 b); carried up within its own columns to the same row, A goes up to 0 as before
  const blocks = () => [set('A', 2, 2, 4, 4), set('B', 2, 7, 4)];
  const w = ws(6, [...blocks(), set('X', 0, 9, 5, 2)], ctx, 'X', { y: 4 }, true);
  up(w, new Set(['A']));
  ok('6 X inserted over A\'s lower half: A stays at 2, X goes under it, to 6; no step moves A', eq(rows(w), { A: 2, X: 6, B: 7 }) && !w.steps.has('A'), [rows(w), steps(w)]);
  const c = ws(6, [...blocks(), set('X', 0, 9, 5, 2)], ctx, 'X', { y: 4 });
  up(c, new Set(['A']));
  ok('6a X carried up within its columns to the same row: A goes up to 0, X stays at 4', eq(rows(c), { A: 0, X: 4, B: 7 }), rows(c));
  // with blocks over A that could go up as well, still none goes: X goes under the lowest bottom of the blocks it reaches
  const u = ws(8, [set('C', 2, 2, 4), set('A', 1, 3, 6, 3), set('X', 0, 9, 4, 2)], ctx, 'X', { y: 4 }, true);
  up(u, new Set(['A', 'C']));
  ok('6b a chain over A: neither A nor C goes up, X under A (row 6)', eq(rows(u), { C: 2, A: 3, X: 6 }) && !u.steps.has('A') && !u.steps.has('C'), [rows(u), steps(u)]);
  // phase 7: P-SEP against an inserted moved block judged above calls P-UP, which lowers X the same way
  const s = ws(6, [...blocks(), set('X', 0, 9, 5, 2)], ctx, 'X', { y: 4 }, true);
  sep(s, 'X', 'A', () => 'above');
  ok('6c P-SEP, A judged above an inserted X: A stays, X goes under it', eq(rows(s), { A: 2, X: 6, B: 7 }) && !s.steps.has('A'), rows(s));
}

process.exit(t.fails ? 1 : 0);
