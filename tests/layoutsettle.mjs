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
  ok('1a phases 1c, 2, 6, 8, 10, and 11 (THROUGH on: the choice, nothing held)', r.ok && eq(r.ran, ['1c', '2', '6', '8', '10', '11']), r.ran);
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

/* ── 15. P-UP off: the blocks judged above that reach the moved block go under it in their own order, and the blocks judged below stay
   under them (found by tests/layoutprops.mjs, k 1933: a block below sank against the moved block only and passed the one pushed under it);
   a block above that the moved block does not reach stays where it is ── */
{
  const off = ctxOf({}, resolve({ 'P-UP': false }));
  const L = sheet(12, [set('A', 0, 2, 5, 4), set('X', 0, 8, 5, 2), set('B', 0, 10, 5)]);
  const r = settle(L, carry('X', 0, 4, 5), emptyMemory(), off);
  ok('15 P-UP off: X carried up into A\'s lower half: A goes under X (6), B under A (10); taken, sound', r.ok && eq(rows(r.layout), { X: 4, A: 6, B: 10 }) && sound(r), r.ok ? rows(r.layout) : r);
  const far = settle(sheet(12, [set('A', 0, 0, 5), set('X', 0, 4, 5, 2)]), carry('X', 0, 7, 5), emptyMemory(), off);
  ok('15a P-UP off: a block above that the moved block does not reach stays where it is (A at 0, X carried down to 7)', far.ok && eq(rows(far.layout), { A: 0, X: 7 }), far.ok ? rows(far.layout) : far);
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

/* ── 18. letting through (step 2b-2; LAYOUT-RULES §5.1b, DRAG.B4): the hold pins the neighbour, a carry back releases it, past its middle
   the two swap, the swap's own RELINK and the run again from the swapped layout, then the neighbour stays where the swap put it ── */
{
  const L = sheet(20, [set('X', 0, 0, 5, 2), set('N', 0, 2, 5, 2)]);
  const down = (o = {}) => ({ ...emptyMemory(), dir: 'down', ...o });
  const r0 = settle(L, carry('X', 0, 2, 5), down(), ctx);
  ok('18 X carried down onto N: N pushed to 4, and pressed (phase 11): it touches X\'s leading edge', r0.ok && eq(rows(r0.layout), { X: 2, N: 4 }) && r0.pressed === 'N' && r0.ran.includes('11'), r0.ok ? [rows(r0.layout), r0.pressed] : r0);
  const r1 = settle(L, { ...carry('X', 0, 2, 5), through: 'hold' }, down(), ctx);
  ok('18a the hold runs out: N goes into the memory where it stopped (row 4, below), the pipeline again from start, pinned', r1.ok && eq(r1.memory.through, { id: 'N', row: 4, side: 'below' }) && eq(rows(r1.layout), { X: 2, N: 4 }) && r1.ran.includes('3') && sound(r1), r1.ok ? [r1.memory.through, rows(r1.layout), r1.ran] : r1);
  const pinned = down({ through: { id: 'N', row: 4, side: 'below' } });
  const r2 = settle(L, carry('X', 0, 3, 5), pinned, ctx);
  ok('18b carried on to frow 3, before N\'s middle: N stays pinned at 4, X right against it at 2', r2.ok && eq(rows(r2.layout), { X: 2, N: 4 }) && r2.memory.through && sound(r2), r2.ok ? [rows(r2.layout), r2.memory.through] : r2);
  const r3 = settle(L, carry('X', 0, 4, 5), pinned, ctx);
  ok('18c to frow 4, X\'s bottom past N\'s middle: they swap, N at 2 and X right under it at 4; the start is the swapped layout, N in the memory above', r3.ok && eq(rows(r3.layout), { N: 2, X: 4 }) && eq(rows(r3.start), { N: 2, X: 4 }) && eq(r3.memory.through, { id: 'N', row: 2, side: 'above' }) && sound(r3), r3.ok ? [rows(r3.layout), r3.memory.through, r3.ran] : r3);
  const r4 = r3.ok && settle(r3.start, carry('X', 0, 7, 5), r3.memory, ctx);
  ok('18d carried on down from the swapped start: N leaves the memory and stays where the swap put it (2), X at 7', r4 && r4.ok && eq(rows(r4.layout), { N: 2, X: 7 }) && !r4.memory.through && sound(r4), r4 && (r4.ok ? [rows(r4.layout), r4.memory.through] : r4));
  const r5 = settle(L, carry('X', 0, 1, 5), pinned, ctx);
  ok('18e carried back before the swap (target above the pinned row 2): N leaves the memory and is pushed again like any other (3)', r5.ok && eq(rows(r5.layout), { X: 1, N: 3 }) && !r5.memory.through, r5.ok ? [rows(r5.layout), r5.memory.through] : r5);
  // going up: X under N, carried up into it; P-UP lifts N to 1; held, N pinned at 1, X right under it at 3; past N's middle they swap
  const U = sheet(20, [set('N', 0, 2, 5, 2), set('X', 0, 6, 5, 2)]), upm = (o = {}) => ({ ...emptyMemory(), dir: 'up', ...o });
  const u1 = settle(U, { ...carry('X', 0, 3, 5), through: 'shift' }, upm(), ctx);
  ok('18f going up: X carried into N lifts it to 1; Shift held: N into the memory (row 1, above), X right under it at 3', u1.ok && eq(rows(u1.layout), { N: 1, X: 3 }) && eq(u1.memory.through, { id: 'N', row: 1, side: 'above' }) && sound(u1), u1.ok ? [rows(u1.layout), u1.memory.through] : u1);
  const u2 = settle(U, carry('X', 0, 1, 5), upm({ through: { id: 'N', row: 1, side: 'above' } }), ctx);
  ok('18g to frow 1, X\'s top past N\'s middle (2): X takes N\'s top row 1, N right under it at 3; swapped, N below in the memory', u2.ok && eq(rows(u2.layout), { X: 1, N: 3 }) && eq(u2.memory.through, { id: 'N', row: 3, side: 'below' }) && sound(u2), u2.ok ? [rows(u2.layout), u2.memory.through] : u2);
  const off = settle(L, { ...carry('X', 0, 2, 5), through: 'hold' }, down(), ctxOf({}, resolve({ THROUGH: false })));
  ok('18h with THROUGH off: no phase 3 or 11, nothing pressed, N pushed as far as X is carried', off.ok && !off.ran.includes('3') && !off.ran.includes('11') && off.pressed === null && eq(rows(off.layout), { X: 2, N: 4 }), off.ok ? [off.ran, off.pressed] : off);
}

/* ── 19. the findings of the property test on held carries (step 2b-2) ── */
{
  // k 628: B4 carried down and held against B0; B1, judged by its middle above, stood under B0, which the memory holds below: B1 is below
  // too, and P-UP no longer lifts it with B0 past the moved block
  const c = ctxOf({ B3: { text: chars(9) }, B4: { text: chars(9) } }, resolve({ 'SIZE.8': false, 'DRAG.A3.narrow': false }));
  const L = sheet(10, [set('B0', 2, 5, 5, 3), set('B1', 3, 8, 5, 1), set('B2', 0, 9, 6, 2), text('B3', 6, 4, 4, 1), text('B4', 0, 4, 4, 1)]);
  const r0 = settle(L, carry('B4', 1, 8, 4), { ...emptyMemory(), dir: 'down' }, c);
  const r1 = r0.ok && settle(r0.start, { ...carry('B4', 1, 11, 4), at: { col: 1, y: 11, frow: 11.4, w: 4 }, through: 'hold' }, { ...r0.memory, dir: 'down' }, c);
  ok('19 a block under the held neighbour keeps the side below (k 628): taken, B4 over B0 and B1, sound', r1 && r1.ok && rows(r1.layout).B4 < rows(r1.layout).B0 && rows(r1.layout).B4 < rows(r1.layout).B1 && sound(r1), r1 && (r1.ok ? places(r1.layout) : r1));
  // k 3383: going up, X (B1) swaps with B2; B2, now under X, meets B4 on the same row: B4 sinks, the pair of the swap stays where it put it
  const u = ctxOf({ B2: { text: chars(12) } }, resolve({ 'GAP.5.2': false }));
  const U = sheet(16, [set('B0', 12, 2, 3, 2), set('B1', 14, 8, 2, 3), text('B2', 11, 6, 5, 1), set('B3', 4, 5, 3, 3), set('B4', 8, 8, 6, 1), set('B5', 7, 3, 3, 2)]);
  const s1 = settle(U, { ...carry('B1', 13, 6, 2), at: { col: 13, y: 6, frow: 6.4, w: 2 }, through: 'hold' }, { ...emptyMemory(), dir: 'up' }, u);
  const s2 = s1.ok && settle(s1.start, { ...carry('B1', 13, 3, 2), at: { col: 13, y: 3, frow: 3.4, w: 2 } }, { ...s1.memory, dir: 'up' }, u);
  ok('19a the swap\'s pair held while what it meets sinks (k 3383): B2 where the swap put it (8), B4 under it (9), B1 carried on to 3 over both; sound', s2 && s2.ok && rows(s2.layout).B2 === 8 && rows(s2.layout).B4 === 9 && rows(s2.layout).B1 === 3 && sound(s2), s2 && (s2.ok ? places(s2.layout) : s2));
  // k 643: P-SEP between two blocks that shared a column in base keeps their order: B1 (over B4 in column 7) stays over it
  const p = ctxOf({ B1: { text: chars(6) }, B2: { text: chars(9) }, B3: { text: chars(15) } }, resolve({ 'P-UP': false, 'DRAG.B2.keep': false }));
  const P = sheet(9, [set('B0', 5, 1, 4, 3), text('B1', 6, 5, 3, 1), text('B2', 4, 4, 4, 1), text('B3', 3, 6, 6, 1), set('B4', 4, 7, 4, 2)]);
  const q = settle(P, carry('B3', 3, 3, 6), emptyMemory(), p);
  ok('19b P-SEP keeps base\'s order (k 643): B1 stays over B4; taken, sound', q.ok && rows(q.layout).B1 < rows(q.layout).B4 && sound(q), q.ok ? places(q.layout) : q);
}

/* ── 20. the independent review of f920fb7 (2026-11-12: 3 major, 2 medium) ── */
{
  // (1) a wall that leaves a block it could neither press nor sink inside stops: refused, never a card past the last column (INV-4, §5.4)
  const W = sheet(8, [set('B', 0, 0, 6, 1)]);
  const w = settle(W, { type: 'wall', box: 'AREA', side: 'right', cols: 4 }, emptyMemory(), ctx);
  ok('20 a right wall at 4 columns over B (columns 1–5, a set width): refused', !w.ok && w.why === 'refused', w.ok ? places(w.layout) : w);
  // (2) inside an area, `grew` counts from the start the caller gave, across the run again after a swap (§5.6)
  const A = sheet(20, [set('X', 0, 0, 5, 2), set('N', 0, 2, 5, 2)]), inArea = (y, o = {}) => ({ ...carry('X', 0, y, 5), box: 'AREA', ...o });
  const a1 = settle(A, inArea(2, { through: 'hold' }), { ...emptyMemory(), dir: 'down' }, ctx);
  const a2 = a1.ok && settle(a1.start, inArea(4), { ...a1.memory, dir: 'down' }, ctx);
  ok('20a held at 2 (N pinned at 4), then to 4: they swap (N 2, X 4), and grew is 2 (content bottom 4 to 6), not 0', a2 && a2.ok && eq(rows(a2.layout), { N: 2, X: 4 }) && a2.grew === 2, a2 && (a2.ok ? [rows(a2.layout), a2.grew] : a2));
  // (3) a neighbour released because no swap can be declared leaves no trace of its pin: the moved block at its real target
  const R = sheet(20, [set('X', 0, 0, 2, 1), set('N', 4, 5, 2, 2)]);
  const r1 = settle(R, { ...carry('X', 4, 4, 2, true), through: 'hold' }, { ...emptyMemory(), dir: 'down' }, ctx);
  const r2 = r1.ok && settle(r1.start, carry('X', 4, 10, 2, true), { ...r1.memory, dir: 'down' }, ctx);
  const free = settle(R, carry('X', 4, 10, 2, true), { ...emptyMemory(), dir: 'down' }, ctx);
  ok('20b X away held against N (pinned at 5), then carried to 10: no swap can be declared, N released, X at 10 as with no pin', r1.ok && r1.memory.through && r2 && r2.ok && !r2.memory.through && rows(r2.layout).X === 10 && eq(rows(r2.layout), rows(free.layout)), r2 && (r2.ok ? [rows(r2.layout), rows(free.layout)] : r2));
  // (4) SETTLE reads the direction from the target's row against the last target's, before phase 2 (§6.D)
  const D = sheet(20, [set('N', 0, 2, 5, 2), set('X', 0, 6, 5, 2)]);
  const d = settle(D, { ...carry('X', 0, 3, 5), through: 'hold' }, { ...emptyMemory(), dir: 'down', lastTarget: { col: 0, y: 6, frow: 6, w: 5 } }, ctx);
  ok('20c carried up from 6 to 3 with a memory saying down: dir up, N pushed to 1 and held there (above), X at 3; lastTarget the new target', d.ok && d.memory.dir === 'up' && eq(d.memory.through, { id: 'N', row: 1, side: 'above' }) && eq(rows(d.layout), { N: 1, X: 3 }) && d.memory.lastTarget.y === 3, d.ok ? [d.memory.dir, d.memory.through, rows(d.layout)] : d);
  // (5) the blocks met from the side are cleared at a swap (§6.D): the run again judges them anew and presses B only as far as it must
  const S = sheet(20, [set('A', 5, 2, 3, 4), set('N', 4, 6, 4, 3), set('X', 5, 9, 5, 5), set('B', 7, 2, 5, 5)]);
  const sw = settle(S, { type: 'carry', box: null, id: 'X', at: { col: 4, y: 5, frow: 5.3, w: 5 }, away: false, through: 'shift' }, { ...emptyMemory(), dir: 'up' }, ctx);
  ok('20d after the swap B stands at column 7, row 9 (the old record would press it once more, to column 8); sound', sw.ok && eq(places(sw.layout).B.slice(0, 2), [7, 9]) && sound(sw), sw.ok ? places(sw.layout) : sw);
}

/* ── 21. found by the semantic checks of held carries (after the review of f920fb7) ── */
{
  // k 1635 (seed 3): P-UP off puts B1, judged above, under B0; held, B1 stays there: phase 8 declares the fallback from what passed the
  // moved block, not from the blocks judged above, which a held neighbour is not
  const c = ctxOf({ B1: { text: chars(9) } }, resolve({ 'SIZE.2': false, 'GAP.8': false, 'P-UP': false, 'P-REST': false }));
  const L = sheet(8, [set('B0', 0, 1, 6, 2), text('B1', 3, 0, 4, 1)]);
  const r0 = settle(L, carry('B0', 1, 0, 6), emptyMemory(), c);
  const r1 = r0.ok && settle(r0.start, { ...carry('B0', 1, 0, 6), through: 'hold' }, r0.memory, c);
  ok('21 P-UP off: B1 under B0, then held there: taken (the fallback\'s pass declared), B1 in the memory, sound', r1 && r1.ok && r1.memory.through?.id === 'B1' && rows(r1.layout).B1 === 2 && sound(r1), r1 && (r1.ok ? [rows(r1.layout), r1.memory.through] : r1));
  // k 4425 (seed 21): B3 stopped at row 6, where RELINK lifted it (GAP.9 off, the block over it pressed aside); the phases' prediction has
  // it lower, at 8: the pin puts it at 6, and the moved block right against it
  const g = ctxOf({}, resolve({ 'SIZE.1': false, 'GAP.9': false, 'DRAG.A5': false }));
  const G = sheet(11, [set('B0', 6, 0, 2, 3), set('B1', 5, 4, 6, 3), set('B2', 2, 8, 5, 2), set('B3', 7, 8, 2, 2)]);
  const m0 = settle(G, carry('B0', 7, 1, 2), emptyMemory(), g);
  const m1 = m0.ok && settle(m0.start, { ...carry('B0', 7, 3, 2), at: { col: 7, y: 3, frow: 3.4, w: 2 }, through: 'hold' }, m0.memory, g);
  ok('21a held at the row RELINK gave it (6), not the phases\' prediction (8): B3 pinned there, B0 right against it at 3; sound', m1 && m1.ok && eq(m1.memory.through, { id: 'B3', row: 6, side: 'below' }) && rows(m1.layout).B3 === 6 && rows(m1.layout).B0 === 3 && sound(m1), m1 && (m1.ok ? [rows(m1.layout), m1.memory.through] : m1));
  const m2 = m1 && m1.ok && settle(m1.start, { ...carry('B0', 7, 5, 2), at: { col: 7, y: 5, frow: 5.4, w: 2 } }, m1.memory, g);
  const f2 = m1 && m1.ok && settle(m1.start, { ...carry('B0', 7, 5, 2), at: { col: 7, y: 5, frow: 5.4, w: 2 } }, { ...m1.memory, through: null }, g);
  ok('21b past B3\'s middle no swap can be declared (B0 shared no column with it in base): released, the result the one with no pin', m2 && m2.ok && !m2.memory.through && eq(rows(m2.layout), rows(f2.layout)), m2 && (m2.ok ? [rows(m2.layout), rows(f2.layout)] : m2));
}

process.exit(t.fails ? 1 : 0);
