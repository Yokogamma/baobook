// Node: SIZE (public/layout/size.js, public/layout/kinds.js; docs/LAYOUT-RULES.md §3, LAYOUT-ENGINE-PLAN §4.3, §4.4) with the measuring
// stub of tests/lib/measure.mjs, so every expectation is in cells: the rest width of an elastic text (its natural width, at most TEXTW, no
// wider than the room to its right on the rows it takes at that width, never below min(natural, MINC)), code's floor of 12 cells, a set
// width, the same rest width under «never narrow» (SIZE.4), the narrowest a block may get when pressed (SIZE.2), its rows at a width with
// `ch`, a code block's fold and temporary rows (SIZE.6), and every switch it reads in both states.
import { restCells, minCells, capCells, rowsAt, roomAt, isElastic } from '../public/layout/size.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS, resolve } from '../public/layout/rules.js';
import { readingOrder } from '../public/layout/geometry.js';
import { stubMeasure } from './lib/measure.mjs';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const ctxOf = (map, rules = DEFAULT, settings = SETTINGS) => ({ rules, settings, kinds: KINDS, measure: stubMeasure(map) });
const box = (id, col, y, w, h, o = {}) => ({ id, kind: 'text', col, y, w, h, ...o });
const layoutOf = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const chars = (n) => 'x'.repeat(n);

/* ── 1. SIZE.1 the rest width ── */
{
  const ctx = ctxOf({ X: { text: chars(30) }, L: { text: chars(120) } });
  const X = box('X', 0, 0, 2, 1), L = box('L', 0, 3, 2, 1);
  ok('1 a short text is as wide as its natural width (30 characters: 10 cells)', restCells(layoutOf(59, [X]), X, ctx) === 10);
  ok('1a a long one stops at TEXTW (120 characters: 40 cells by nature, 26 at rest)', restCells(layoutOf(59, [L]), L, ctx) === 26 && capCells(L, ctx) === 26);
  const R = box('R', 12, 0, 4, 2), L0 = box('L', 0, 0, 2, 1);
  ok('1b no wider than the room before the handle cell of the nearest block to its right on its rows (R at column 12: 11 cells)', restCells(layoutOf(59, [L0, R]), L0, ctx) === 11 && restCells(layoutOf(59, [X, R]), X, ctx) === 10);
  const R2 = box('R', 6, 0, 4, 1);
  ok('1c a neighbour at column 6 on its row leaves 5 cells, but not below min(natural, MINC) = 6: it stays at 6 and hits', restCells(layoutOf(59, [X, R2]), X, ctx) === 6);
  const below = box('R', 6, 3, 4, 1), Lb = box('L', 0, 0, 2, 1);
  // L at 26 cells takes ceil(120/78) = 2 rows, so a block at row 3 does not cross it; at 5 cells it would take 8 rows and cross it
  ok('1d the rows it takes at a width decide which neighbours cross it: a block at row 3 does not stop a two-row text', restCells(layoutOf(59, [Lb, below]), Lb, ctx) === 26);
  ok('1e the room ends at the container\'s right edge too (a sheet of 15 columns, the card from column 1: 14 cells)', restCells(layoutOf(15, [L]), L, ctx) === 14 && roomAt(layoutOf(15, [L]), L, 14, ctx) === 14);
  const off = ctxOf({ X: { text: chars(30) }, L: { text: chars(120) } }, resolve({ 'SIZE.1': false }));
  ok('1f SIZE.1 off: min(natural, TEXTW) whatever stands to its right, clamped to the container', restCells(layoutOf(59, [X, R2]), X, off) === 10 && restCells(layoutOf(15, [L]), L, off) === 14);
  const never = ctxOf({ X: { text: chars(30) } }, DEFAULT, { ...SETTINGS, ORDER: 'never' });
  ok('1g SIZE.4: the same rest width under «never narrow»', restCells(layoutOf(59, [X, R2]), X, never) === 6 && restCells(layoutOf(59, [X]), X, never) === 10);
}

/* ── 2. code, set widths, areas ── */
{
  const ctx = ctxOf({ C: { kind: 'code', text: 'ab\ncd' }, K: { kind: 'code', text: chars(60) }, S: { text: chars(90) }, A: { kind: 'area' } });
  const C = box('C', 0, 0, 2, 1, { kind: 'code' }), K = box('K', 0, 0, 2, 1, { kind: 'code' });
  ok('2 a code block is elastic as a text, never narrower than its header\'s 12 cells (W14)', isElastic(C, ctx) && restCells(layoutOf(59, [C]), C, ctx) === 12);
  ok('2a its natural width its longest line, up to TEXTW (60 characters: 20 cells)', restCells(layoutOf(59, [K]), K, ctx) === 20);
  const S = box('S', 0, 0, 9, 1, { cw: 8 });
  ok('2b a set width keeps its cw and never narrows (SIZE.3)', !isElastic(S, ctx) && restCells(layoutOf(59, [S, box('R', 3, 0, 2, 1)]), S, ctx) === 8 && minCells(S, ctx) === null);
  const A = box('A', 0, 1, 13, 4, { kind: 'area', cw: 20 });
  ok('2c an area is a set width, at least 12 cells', restCells(layoutOf(59, [A]), A, ctx) === 20 && capCells({ ...A, cw: 5 }, ctx) === 12 && !isElastic(A, ctx));
}

/* ── 3. SIZE.2 how far a pressed block narrows ── */
{
  const map = { X: { text: chars(30) }, Y: { text: chars(9) }, C: { kind: 'code', text: chars(60) } };
  const X = box('X', 0, 0, 11, 1), Y = box('Y', 0, 0, 4, 1), C = box('C', 0, 0, 21, 1, { kind: 'code' });
  const ctx = ctxOf(map);
  ok('3 an elastic text narrows down to min(natural width, MINC): 6 cells, or its natural 3', minCells(X, ctx) === 6 && minCells(Y, ctx) === 3);
  ok('3a a code block never below its header', minCells(C, ctx) === 12);
  ok('3b «never narrow» or SIZE.2 off: it never narrows', minCells(X, ctxOf(map, DEFAULT, { ...SETTINGS, ORDER: 'never' })) === null && minCells(X, ctxOf(map, resolve({ 'SIZE.2': false }))) === null);
}

/* ── 4. SIZE.6 the shown height ── */
{
  const ctx = ctxOf({ X: { text: chars(30) }, H: { text: chars(30), temp: 1 }, C: { kind: 'code', text: 'a\nb\nc\nd\ne\nf' }, W: { kind: 'code', text: chars(30), wrap: true } });
  const X = box('X', 0, 0, 11, 1);
  ok('4 a text\'s rows at a width (30 characters: one row at 10 cells, four at 3)', rowsAt(X, 10, ctx).rows === 1 && rowsAt(X, 3, ctx).rows === 4);
  ok('4a a set height ch below the content is ignored; above it, it is the height (spare room, RESIZE.3)', rowsAt({ ...X, ch: 3 }, 10, ctx).rows === 3 && rowsAt({ ...X, ch: 3 }, 2, ctx).rows === 5);
  ok('4b a temporary row is the displayed answer only', rowsAt(box('H', 0, 0, 11, 1), 10, ctx).rows === 1 && rowsAt(box('H', 0, 0, 11, 1), 10, ctx).shown === 2);
  const C = box('C', 0, 0, 13, 1, { kind: 'code' });
  ok('4c code: one row per line, folded at ch with one row for «Розгорнути», unfolded when open', rowsAt(C, 12, ctx).rows === 6 && rowsAt({ ...C, ch: 3 }, 12, ctx).rows === 4 && rowsAt({ ...C, ch: 3, open: true }, 12, ctx).rows === 6 && rowsAt({ ...C, ch: 8 }, 12, ctx).rows === 6);
  ok('4d code with wrap wraps; without, it does not', rowsAt(box('W', 0, 0, 13, 1, { kind: 'code' }), 4, ctx).rows === 3);
}
process.exit(fails ? 1 : 0);
