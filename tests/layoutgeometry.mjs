// Node: the pure geometry of the layout engine (public/layout/geometry.js; docs/LAYOUT-RULES.md §1.1, §5.3, AREA.7a, EDIT.1;
// LAYOUT-ENGINE-PLAN §3.1, §3.5): cards and extents, an area's free cell in sharing and hitting, reaching, reading order by code units,
// neighbour order, the engine's range, the clamp of a place, what a point belongs to, an area's children on the sheet, and the sheet's
// columns read from `fx` and written back, for every column of the sheet.
import { MAXCELL, G, W0PX, SHEETW, card, extent, sharesCol, sharesRow, hits, reaches, readingOrder, upperNeighbours, neighbourOrder,
  inRange, range, clampPlace, pointOwner, childToSheet, sheetToChild, colFromFx, fxFromCol, yFromRow, rowFromY } from '../public/layout/geometry.js';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const box = (id, col, y, w, h, kind = 'text') => ({ id, kind, col, y, w, h });

/* ── 1. cards and extents ── */
const t = box('T', 2, 3, 5, 2), a = box('A', 10, 4, 8, 3, 'area');
ok('1 a card leaves out the handle cell: columns col+1 … col+w−1', eq(card(t), { c0: 3, c1: 6, r0: 3, r1: 4 }));
ok('1a a text\'s extent is its card', eq(extent(t), card(t)));
ok('1b an area\'s extent is its frame with one free cell on every side: columns col … col+w, rows y−1 … y+h', eq(extent(a), { c0: 10, c1: 18, r0: 3, r1: 7 }));

/* ── 2. sharing, hitting, reaching ── */
ok('2 two texts side by side, handle on the last card cell: no shared column (P-ASIDE\'s rule)', !sharesCol(box('L', 0, 0, 4, 1), box('R', 3, 0, 4, 1)) && sharesCol(box('L', 0, 0, 4, 1), box('R', 2, 0, 4, 1)));
ok('2a a text right beside an area\'s frame takes its free cell: they hit', hits(box('X', 5, 4, 6, 1), a) && !hits(box('X', 4, 4, 6, 1), a));
ok('2b a text right above an area\'s frame hits its free row; one row higher it does not', hits(box('X', 11, 3, 3, 1), a) && !hits(box('X', 11, 2, 3, 1), a));
ok('2c two areas keep two free cells between them', hits(box('B', 18, 4, 5, 2, 'area'), a) && !hits(box('B', 19, 4, 5, 2, 'area'), a));
ok('2d sharing a row, by extents', sharesRow(box('X', 0, 7, 3, 1), a) && !sharesRow(box('X', 0, 8, 3, 1), a));
ok('2e a block is never said to hit itself', !hits(t, t));
const mv = box('M', 0, 5, 4, 2);
ok('2f reaches: one judged below reaches when its top is above the moved block\'s bottom; one judged above, when its bottom is below its top',
  reaches(box('N', 0, 6, 4, 1), mv, 'below') && !reaches(box('N', 0, 7, 4, 1), mv, 'below') && reaches(box('N', 0, 4, 4, 2), mv, 'above') && !reaches(box('N', 0, 3, 4, 2), mv, 'above'));

/* ── 3. orders ── */
ok('3 reading order: by row, then column, then id by code units («B» before «a» before «é»)', eq(readingOrder([box('é', 0, 0, 2, 1), box('a', 0, 0, 2, 1), box('B', 0, 0, 2, 1), box('z', 5, 0, 2, 1), box('y', 9, -1 + 1, 2, 1)]), ['B', 'a', 'é', 'z', 'y']));
const n1 = [box('L', 0, 6, 12, 1), box('A', 0, 0, 3, 1), box('B', 5, 2, 3, 1), box('C', 9, 0, 3, 4)];
ok('3a upper neighbours: the nearest block above in at least one column of its extent', eq(upperNeighbours(n1, n1[0]).map((b) => b.id), ['A', 'C', 'B']));
ok('3b neighbour order: every upper neighbour first, ties by reading order', eq(neighbourOrder(n1), ['A', 'C', 'B', 'L']));

/* ── 4. the engine's range and the clamp ── */
ok('4 MAXCELL is 2^20, which the view can still draw', MAXCELL === 1048576);
ok('4a in range: whole numbers 0 … MAXCELL only', inRange(0) && inRange(MAXCELL) && !inRange(MAXCELL + 1) && !inRange(-1) && !inRange(1.5) && !inRange(1e20) && !inRange(NaN) && !inRange(Number.MAX_SAFE_INTEGER + 2));
ok('4b a place\'s range: the handle cell from column 0, the card ending at the last column, an area\'s frame from row 1', eq(range(box('X', 0, 0, 5, 1), 20), { colMin: 0, colMax: 15, yMin: 0 }) && range(a, 20).yMin === 1);
ok('4b′ an area\'s right free column stays inside too (proposed): an area 8 wide in 20 columns ends its frame at column 18 at most', range(a, 20).colMax === 11 && extent({ ...a, col: range(a, 20).colMax }).c1 === 19);
ok('4c clamped: a card past the right edge moves left to the last column where it fits; a row above the top comes down', eq(clampPlace(box('X', 18, -2, 5, 1), 20), { col: 15, y: 0 }) && eq(clampPlace(box('A', -1, 0, 8, 2, 'area'), 20), { col: 0, y: 1 }));

/* ── 5. EDIT.1: what a point belongs to ── */
const pts = [box('P', 0, 0, 5, 2), box('Q', 6, 0, 5, 2)];
ok('5 a point on a card belongs to it, the handle cell not', pointOwner(pts, 1.2, 0.5, 0.5, 30) === 'P' && pointOwner(pts, 0.5, 0.5, 0.5, 30) === null);
ok('5a within NEAR to the right of a card or under it: that card', pointOwner(pts, 5.3, 1.5, 0.5, 30) === 'P' && pointOwner(pts, 2, 2.4, 0.5, 30) === 'P' && pointOwner(pts, 2, 2.6, 0.5, 30) === null);
const U = box('U', 4, 0, 3, 2), V = box('V', 1, 2, 3, 1);   // (5.2, 2.4) is under U's card and right of V's, within 2
ok('5b on a card beats a margin; within NEAR of two cards, the first in reading order', pointOwner(pts, 7.2, 0.5, 3, 30) === 'Q' && pointOwner([V, U], 5.2, 2.4, 2, 30) === 'U');
ok('5c past the sheet\'s columns: no part of it, a click does nothing; NEAR 0: no margin', pointOwner(pts, 30.5, 0.5, 0.5, 30) === null && pointOwner(pts, 5.3, 1.5, 0, 30) === null);

/* ── 6. an area's children on the sheet ── */
const area = box('A', 4, 10, 15, 6, 'area'), c = { col: 2, y: 3 };
ok('6 a child at (c, r) stands on sheet (a + 1 + c, y + H + r), and back', eq(childToSheet(area, 1, c), { col: 7, y: 14 }) && eq(sheetToChild(area, 1, childToSheet(area, 1, c)), c));

/* ── 7. the sheet's columns from fx at W0px, and back ── */
ok('7 W0px 1458, G 24: SHEETW is 59 columns', W0PX === 1458 && G === 24 && SHEETW === 59);
let bad = []; for (let col = 0; col < SHEETW; col++) if (colFromFx(fxFromCol(col)) !== col) bad.push(col);
ok('7a every column of the sheet written as fx reads back to itself', bad.length === 0);
ok('7b today\'s fx of the first dot column (c = 1, fx = 36/1458) reads to the engine\'s column 0', colFromFx(36 / 1458) === 0 && Math.abs(fxFromCol(0) - 36 / 1458) < 1e-12);
const w1451 = (c1) => (G / 2 + c1 * G) / 1451, w1466 = (c1) => (G / 2 + c1 * G) / 1466;
bad = []; for (let c1 = 1; c1 <= SHEETW; c1++) { if (colFromFx(w1451(c1)) !== c1 - 1 || colFromFx(w1466(c1)) !== c1 - 1) bad.push(c1); }
ok('7c an fx written at 1451 px or at 1466 px (the owner\'s two widths) reads back to its own column at 1458 px' + (bad.length ? ': not ' + bad.join(',') : ''), bad.length === 0);
ok('7d a sheet row: the engine\'s row is the stored row minus 2, and back', yFromRow(2) === 0 && rowFromY(yFromRow(17)) === 17);
process.exit(fails ? 1 : 0);
