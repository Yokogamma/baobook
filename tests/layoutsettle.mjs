// Node: SETTLE's pipeline (public/layout/settle.js; docs/LAYOUT-RULES.md §5.1–§5.5, LAYOUT-ENGINE-PLAN §5.2 step 2b): each change kind
// through phases 1–10 on layouts written by hand, the phases each kind runs (§5.2's column «Phases»), the transitions handed to RELINK
// taken, the fallbacks of switched-off rules, the refusals and their reasons, and every result with its stacks found again (gap.js check:
// INV-1, INV-2, INV-3) inside its container (INV-4) and in reading order (INV-5). The letting-through wrapper is step 2b's second part.
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check, remove, stackAt, showStack } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { readingOrder, extent } from '../public/layout/geometry.js';
import { set, text, chars, ctxOf, sheet, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const rows = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, b.y]));
const places = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, [b.col, b.y, b.w, b.h]]));
/** A result's layout is sound: its stacks pass gap.js's check, every card inside the container's columns, the order the reading order. */
function sound(r) {
  if (!r.ok) return false;
  const L = r.layout, inside = [...L.boxes.values()].every((b) => b.col >= 0 && extent(b).c1 <= L.cols - 1 && b.y >= 0);
  return check(L).length === 0 && inside && eq(L.order, readingOrder(L.boxes.values()));
}
const carry = (id, col, y, w, away = false) => ({ type: 'carry', box: null, id, at: { col, y, frow: y, w }, away });
const create = (id, col, y, w, o = {}) => ({ type: 'create', box: null, id, kind: 'text', at: { col, y, frow: y, w }, away: true, ...o });
const ctx = ctxOf();

/* ── 1. a carry down onto a block: P-DOWN, the block under it following (phases 1c, 2, 6, 8, 10) ── */
{
  const L = sheet(20, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), set('B', 0, 6, 5)]);
  const r = settle(L, carry('X', 0, 2, 5), emptyMemory(), ctx);
  ok('1 X carried down 2 onto A: A pushed to 4, B after it to 7; sound', r.ok && eq(rows(r.layout), { X: 2, A: 4, B: 7 }) && sound(r), r.ok ? rows(r.layout) : r);
  ok('1a phases 1c, 2, 6, 8, 10', r.ok && eq(r.ran, ['1c', '2', '6', '8', '10']), r.ran);
  ok('1b moves: X, A and B, for the dev look', r.ok && ['X', 'A', 'B'].every((id) => r.moves.has(id)), r.ok && [...r.moves.keys()]);
}

/* ── 2. a carry up within its columns into a block above: P-UP pushes it, and it stays (G18) ── */
{
  const L = sheet(10, [set('A', 0, 2, 5, 4), set('X', 0, 8, 5, 2)]);
  const r = settle(L, carry('X', 0, 4, 5), emptyMemory(), ctx);
  ok('2 X carried up into A\'s lower half: A pushed up to 0, X at 4 (phase 5)', r.ok && eq(rows(r.layout), { A: 0, X: 4 }) && r.ran.includes('5') && sound(r), r.ok ? [rows(r.layout), r.ran] : r);
  const back = r.ok && settle(r.layout, carry('X', 0, 8, 5), emptyMemory(), ctx);
  ok('2a carried back to 8, a new carry: A stays at 0 (G18)', back && back.ok && eq(rows(back.layout), { A: 0, X: 8 }), back && (back.ok ? rows(back.layout) : back));
}

/* ── 3. a creation over a block's lower half: nothing goes up, X under it, and taken away again every block back (G17, INV-7 b) ── */
{
  const L = sheet(6, [set('A', 2, 2, 4, 4), set('B', 2, 7, 4)]), c = ctxOf({ X: { text: 'x' } });
  const r = settle(L, create('X', 0, 4, 5, { set: { cw: 4, ch: 2 } }), emptyMemory(), c);
  ok('3 X created with its top on A\'s lower half: A stays at 2, X under it at 6, B pushed to 8', r.ok && eq(rows(r.layout), { A: 2, X: 6, B: 8 }) && sound(r), r.ok ? rows(r.layout) : r);
  const z = r.ok && settle(r.layout, { type: 'remove', box: null, id: 'X' }, emptyMemory(), c);
  ok('3a X removed (phases 1b and 10: GAP.6 relinked it, and nothing is left to rest): A at 2, B at 7, as before', z && z.ok && eq(rows(z.layout), { A: 2, B: 7 }) && eq(z.ran, ['1b', '10']), z && (z.ok ? [rows(z.layout), z.ran] : z));
}

/* ── 4. a creation over a block: P-DOWN sinks it, FOLLOW's, and the creation taken away again gives its row back (G16, INV-7 b) ── */
{
  const L = sheet(10, [set('T', 0, 0, 5), set('U', 0, 2, 5)]), c = ctxOf({ X: { text: 'x' } });
  const r = settle(L, create('X', 0, 0, 3, { set: { cw: 2, ch: 2 } }), emptyMemory(), c);
  ok('4 X created over T: T sinks under it to 2, U after it to 4', r.ok && eq(rows(r.layout), { X: 0, T: 2, U: 4 }) && sound(r), r.ok ? rows(r.layout) : r);
  const z = r.ok && remove(r.layout, 'X', DEFAULT);
  ok('4a X taken away again: T back at 0, U at 2', z && eq(rows(z), { T: 0, U: 2 }), z && rows(z));
}

/* ── 5. met from the side: P-ASIDE; with no room aside, by its side (DRAG.B5), or refused with DRAG.B5 off ── */
{
  const L = sheet(20, [set('X', 0, 6, 4, 2), set('A', 5, 0, 4, 2)]);
  const r = settle(L, carry('X', 3, 0, 4, true), emptyMemory(), ctx);
  ok('5 X carried away beside A, overlapping one column: A pressed right to 6 (phase 4), rows kept', r.ok && eq(places(r.layout).A, [6, 0, 4, 2]) && r.ran.includes('4') && sound(r), r.ok ? [places(r.layout), r.ran] : r);
  const E = sheet(10, [set('X', 0, 6, 4, 2), set('A', 5, 0, 5, 2)]);
  const e = settle(E, carry('X', 3, 0, 4, true), emptyMemory(), ctx);
  ok('5a A at the sheet\'s edge has no room aside: judged below, it goes down under X (DRAG.B5)', e.ok && eq(places(e.layout).A, [5, 2, 5, 2]) && sound(e), e.ok ? places(e.layout) : e);
  const off = settle(E, carry('X', 3, 0, 4, true), emptyMemory(), ctxOf({}, resolve({ 'DRAG.B5': false })));
  ok('5b with DRAG.B5 off the move is refused', !off.ok && off.why === 'refused', off);
  const noAside = settle(L, carry('X', 3, 0, 4, true), emptyMemory(), ctxOf({}, resolve({ 'P-ASIDE': false })));
  ok('5c with P-ASIDE off, A goes at once to «no room aside»: down under X', noAside.ok && eq(places(noAside.layout).A, [5, 2, 4, 2]) && sound(noAside), noAside.ok ? places(noAside.layout) : noAside);
}

/* ── 6. P-UP off: a block judged above is pushed down under the moved block, the carried block passing it (a declared fallback) ── */
{
  const L = sheet(10, [set('A', 0, 2, 5, 4), set('X', 0, 8, 5, 2)]);
  const r = settle(L, carry('X', 0, 4, 5), emptyMemory(), ctxOf({}, resolve({ 'P-UP': false })));
  ok('6 P-UP off: X carried up into A, A pushed down under it (X 4, A 6), RELINK takes the declared pass', r.ok && eq(rows(r.layout), { X: 4, A: 6 }) && sound(r), r.ok ? rows(r.layout) : r);
}

/* ── 7. a size: a text typed into gets its rest width and height, the blocks under it following (phases 1a, 9, 10) ── */
{
  const c = ctxOf({ T: { text: chars(80) } });
  const L = sheet(20, [text('T', 0, 0, 11), set('B', 0, 2, 5)]);
  const r = settle(L, { type: 'size', box: null, id: 'T' }, emptyMemory(), c);
  ok('7 T now 80 characters: rest width 19 cells (w 20) on the sheet\'s 20 columns, two rows; B pushed to 3', r.ok && eq(places(r.layout).T, [0, 0, 20, 2]) && rows(r.layout).B === 3 && sound(r), r.ok ? places(r.layout) : r);
  ok('7a phases 1a, 9, 10: a size relinks once, in phase 9 (c), against base (step 2b, proposed)', r.ok && eq(r.ran, ['1a', '9', '10']), r.ran);
  const c2 = ctxOf({ T: { text: chars(10) } }), s = r.ok && settle(r.layout, { type: 'size', box: null, id: 'T' }, emptyMemory(), c2);
  ok('7b shortened again to 10 characters: T one row, 4 cells (w 5), B back at 2 (H1)', s && s.ok && eq(places(s.layout).T, [0, 0, 5, 1]) && rows(s.layout).B === 2 && sound(s), s && (s.ok ? places(s.layout) : s));
}

/* ── 8. a deletion: the blocks under it rise into its place (GAP.6) ── */
{
  const L = sheet(20, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), set('B', 0, 6, 5)]);
  const r = settle(L, { type: 'remove', box: null, id: 'A' }, emptyMemory(), ctx);
  ok('8 A deleted: B rises to 3, X stays', r.ok && eq(rows(r.layout), { X: 0, B: 3 }) && sound(r), r.ok ? rows(r.layout) : r);
}

/* ── 9. the width handle: its wall presses what the widened card overlaps; with no room, P-SINK; P-SINK off refuses ── */
{
  const c = ctxOf({ A: { text: chars(20) }, B: { text: chars(9) } });
  const L = sheet(20, [set('A', 0, 0, 5, 1), set('B', 6, 0, 4, 1)]);
  const r = settle(L, { type: 'width', box: null, id: 'A', cw: 8, side: 'right' }, emptyMemory(), c);
  ok('9 A widened to 8 cells: B pressed right, its handle on A\'s last cell (col 8)', r.ok && eq(places(r.layout), { A: [0, 0, 9, 1], B: [8, 0, 4, 1] }) && sound(r), r.ok ? places(r.layout) : r);
  const E = sheet(12, [set('A', 0, 0, 5, 1), set('B', 6, 0, 6, 1)]);
  const e = settle(E, { type: 'width', box: null, id: 'A', cw: 8, side: 'right' }, emptyMemory(), ctxOf({ A: { text: chars(20) }, B: { text: chars(9) } }));
  ok('9a B at the edge has no room aside: P-SINK sinks it under A', e.ok && eq(places(e.layout).B, [6, 1, 6, 1]) && sound(e), e.ok ? places(e.layout) : e);
  const off = settle(E, { type: 'width', box: null, id: 'A', cw: 8, side: 'right' }, emptyMemory(), ctxOf({ A: { text: chars(20) }, B: { text: chars(9) } }, resolve({ 'P-SINK': false })));
  ok('9b with P-SINK off the handle is refused', !off.ok && off.why === 'refused', off);
}

/* ── 10. phase 1c clamps: a block carried past the right edge narrows if elastic (DRAG.A3.narrow), a set width stops; row 0 at the top ── */
{
  const c = ctxOf({ T: { text: chars(30) } });
  const L = sheet(20, [text('T', 0, 5, 11, 1)]);
  const r = settle(L, carry('T', 15, -2, 11), emptyMemory(), c);
  ok('10 T (10 cells) carried to column 15 of 20, above the top: it narrows down to min(natural, MINC) = 6 cells and then stops, at column 13 and row 0', r.ok && eq(places(r.layout).T, [13, 0, 7, 2]) && sound(r), r.ok ? places(r.layout) : r);
  const S = sheet(20, [set('S', 0, 5, 11, 1)]);
  const s = settle(S, carry('S', 15, 0, 11), emptyMemory(), ctx);
  ok('10a a set width stops at the last column where it fits whole (col 9)', s.ok && eq(places(s.layout).S, [9, 0, 11, 1]), s.ok ? places(s.layout) : s);
  const off = settle(L, carry('T', 15, 0, 11), emptyMemory(), ctxOf({ T: { text: chars(30) } }, resolve({ 'DRAG.A3.narrow': false })));
  ok('10b with DRAG.A3.narrow off an elastic block stops too (col 9), then phase 9 gives it its rest width', off.ok && places(off.layout).T[0] === 9 && sound(off), off.ok ? places(off.layout) : off);
}

/* ── 11. a carry into a block that stood above in start: it keeps its side (DRAG.B2) and, at row 0, lowers the moved block (P-UP); phase 9
   gives an elastic block its rest width on the rows it stands on ── */
{
  const c = ctxOf({ T: { text: chars(30) } });
  const L = sheet(30, [text('T', 0, 6, 11, 1), set('R', 8, 0, 5, 2)]);
  const r = settle(L, carry('T', 0, 0, 11), emptyMemory(), c);
  ok('11 T carried to row 0 across R, which stood above it: R keeps that side, cannot go up, and T stands under it (row 2)', r.ok && eq(places(r.layout), { R: [8, 0, 5, 2], T: [0, 2, 11, 1] }) && sound(r), r.ok ? [places(r.layout), r.ran] : r);
  const n = settle(L, carry('T', 0, 0, 6), emptyMemory(), c);
  ok('11a T carried at 5 cells to row 0, left of R: phase 9 widens it to the 7 cells of room left of R, two rows', n.ok && eq(places(n.layout).T, [0, 0, 8, 2]) && n.ran.includes('9') && sound(n), n.ok ? [places(n.layout), n.ran] : n);
}

/* ── 12. containment: a block past MAXCELL refuses the change ── */
{
  const L = sheet(10, [set('X', 0, 0, 3, 1)]);
  const r = settle(L, carry('X', 0, 2 ** 20, 3), emptyMemory(), ctx);
  ok('12 X carried past MAXCELL: refused', !r.ok && r.why === 'refused', r);
}

/* ── 13. a result's stacks: a carry down keeps the gap under the moved block whole for the block pushed (rule 1) ── */
{
  const L = sheet(20, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), set('B', 0, 6, 5)]);
  const r = settle(L, carry('X', 0, 2, 5), emptyMemory(), ctx);
  ok('13 B\'s stack under A keeps one row (A | A1 |)', r.ok && showStack(stackAt(r.layout, 'B', 1)) === 'A | A1 |', r.ok && showStack(stackAt(r.layout, 'B', 1)));
}

/* ── 14. sides that keep the chains' order end to end (found by tests/layoutprops.mjs, k 202): B2 over B3, which keeps the side above,
   goes up with it instead of being sunk under the moved block, which dragged B3 past it and was refused ── */
{
  const c = ctxOf({ B0: { text: chars(12) }, B1: { text: chars(9) }, B2: { text: chars(9) }, B5: { text: chars(6) } }, resolve({ 'GAP.5.2': false, 'DRAG.B5': false }));
  const L = sheet(9, [text('B0', 2, 7, 5, 1), text('B1', 1, 4, 4, 1), text('B2', 3, 8, 4, 1), set('B3', 1, 9, 5, 3), set('B4', 1, 12, 3, 3), text('B5', 6, 5, 3, 1)]);
  const r = settle(L, carry('B4', 2, 8, 3), emptyMemory(), c);
  ok('14 B4 carried up into B3: taken; B3 and every block over it go up, B4 under B3, sound', r.ok && rows(r.layout).B3 < rows(r.layout).B4 && rows(r.layout).B2 < rows(r.layout).B3 && sound(r), r.ok ? places(r.layout) : r);
}

/* ── 15. P-UP off: the blocks judged above go under the moved block in their own order, and the blocks judged below stay under them
   (found by tests/layoutprops.mjs, k 1933: the block below sank against the moved block only and passed the one pushed under it) ── */
{
  const c = ctxOf({ B0: { text: chars(6) }, B1: { text: chars(9) }, B4: { text: chars(9) }, B5: { text: chars(3) } }, resolve({ 'P-UP': false, 'DRAG.A5': false }));
  const L = sheet(12, [text('B0', 1, 6, 3, 1), text('B1', 2, 5, 4, 1), set('B2', 4, 8, 3, 3), set('B3', 2, 1, 6, 1), text('B4', 7, 2, 4, 1), text('B5', 6, 4, 2, 1)]);
  const r = settle(L, carry('B1', 1, 6, 4), emptyMemory(), c);
  ok('15 B1 carried down a row: B3, judged above, goes under it and B0, judged below, under B3; taken, sound', r.ok && rows(r.layout).B1 < rows(r.layout).B3 && rows(r.layout).B3 < rows(r.layout).B0 && sound(r), r.ok ? places(r.layout) : r);
}

/* ── 16. a text typed into near the right edge narrows to the edge rather than past it (INV-4), its floor clamped to the container ── */
{
  const c = ctxOf({ B1: { text: chars(18) }, B0: { text: chars(12) } });
  const L = sheet(8, [text('B0', 1, 8, 5, 1), text('B1', 3, 5, 5, 1)]);
  const r = settle(L, { type: 'size', box: null, id: 'B1' }, emptyMemory(), c);
  ok('16 B1 at column 3 of 8, now 18 characters (floor 6 cells): 4 cells to the last column, two rows', r.ok && eq(places(r.layout).B1, [3, 5, 5, 2]) && sound(r), r.ok ? places(r.layout) : r);
}

/* ── 17. a text typed into until its floor no longer fits beside its neighbour: the hit is phase 9 (b)'s, and the size relinks once, in
   9 (c), against base (found by tests/layoutprops.mjs, k 68: phase 8 refused the overlap before 9 (b) could settle it) ── */
{
  const c = ctxOf({ B1: { text: chars(31) }, B0: { text: 'x' } });
  const L = sheet(16, [set('B0', 13, 3, 3, 3), text('B1', 8, 4, 2, 1)]);
  const r = settle(L, { type: 'size', box: null, id: 'B1' }, emptyMemory(), c);
  ok('17 B1, 31 characters, at its floor of 6 cells reaches B0: phase 9 (b) settles it (P-REST presses B0, or B1 goes under it); sound', r.ok && r.ran.includes('9') && sound(r), r.ok ? [places(r.layout), r.ran] : r);
}

process.exit(t.fails ? 1 : 0);
