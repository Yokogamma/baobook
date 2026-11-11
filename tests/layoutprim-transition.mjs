// Node: the transition SETTLE hands RELINK (public/layout/primitives.js `transitionFacts`; LAYOUT-ENGINE-PLAN §5.2; docs/LAYOUT-RULES.md
// GAP's inputs), pinned before settle.js exists: facts, not a path (the architecture review of 2026-11-11). SETTLE names the blocks the
// phases moved; RELINK takes each from the row it counts it from to where the phases left it, cuts the moves itself and holds every moved
// block at its target, one whose move adds up to nothing included (the owner, 2026-11-11, G15). Each case is a carry, a creation or a
// narrowing and what the primitives did after it; RELINK takes the transition, gives the rows the phases left, and its memory is the one
// GAP's rules give: a block taken away again leaves no trace (INV-7 b). The cases of the reviews of the path this replaced (rounds 1 to 6 of
// the independent review of step 2a) stay, as rows and memory.
import { down, up, aside, sep, phase, reshape, sinkTo, transitionFacts } from '../public/layout/primitives.js';
import { checkTransition, explain } from '../public/layout/transition.js';
import { judgeCarry } from '../public/layout/changes.js';
import { relink, remove, stackAt, showStack } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { set, text, chars, ctxOf, sheet, over, place, rows, hitting, eq, tally } from './lib/primcase.mjs';
import { readingOrder } from '../public/layout/geometry.js';

const t = tally(), ok = t.ok, ctx = ctxOf();
const rowsOf = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, b.y]));
const got = (r) => (r.ok ? rowsOf(r.layout) : r.errors);
/** The transition of a vertical carry of X (it keeps its columns): base, the layout after the phases and the facts. */
function T(base, w, x = {}, o = {}) { return { base, after: w.L, ...transitionFacts(w, base, o), carried: 'X', leave: [], enter: [], pass: [], ...x }; }
/** base with a new block X in it, in reading order: X created at its cell. */
function withX(base, X) { const boxes = new Map([...base.boxes, ['X', X]]), order = readingOrder(boxes.values()); return { ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }; }
/** The carry's judge and what it calls for: P-ASIDE for every block met from the side, P-DOWN for those judged below. */
function carry(w, base, c, at) {
  const mem = { away: true, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
  const j = judgeCarry(w.L, base, { id: 'X', at, away: true }, mem, c);
  for (const [id, sd] of j.met) aside(w, id, 'X', sd);
  down(w, new Set([...j.side].filter(([, sd]) => sd === 'below').map(([id]) => id)));
}
/** The columns from the geometry: a block pressed off a column, a block coming in by itself, X put at its cell. */
function columns(base, w) { const g = explain(base, w.L); return { leave: g.left.map(([id, col]) => [id, col, 'press']), enter: g.entered.map(([id, col]) => [id, col, id === 'X' ? 'put' : 'self']), pass: [] }; }

/* ── 1. a carry down and P-DOWN ── */
{
  const base = sheet(20, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), set('B', 0, 6, 5)]), w = over(base, ctx, 'X', { y: 2 });
  down(w, new Set(['A', 'B']));
  const tr = T(base, w), r = relink(tr, DEFAULT);
  ok('1 X carried down 2 onto A: A pushed 1, B with it; the facts name X, A and B', eq(rows(w), { X: 2, A: 4, B: 7 }) && eq(tr.moved, ['X', 'A', 'B']), [rows(w), tr.moved]);
  ok('1a checkTransition and RELINK take it, the rows as the phases left them, B\'s gap whole under A', eq(checkTransition(tr), []) && r.ok && eq(got(r), { X: 2, A: 4, B: 7 }) && showStack(stackAt(r.layout, 'B', 1)) === 'A | A1 |', [checkTransition(tr), got(r)]);
}

/* ── 2. a carry up and P-UP, and P-UP lowering the moved block ── */
{
  const base = sheet(20, [set('A', 0, 0, 5), set('B', 0, 3, 5, 2), set('X', 0, 6, 5, 2)]), w = over(base, ctx, 'X', { y: 4 });
  up(w, new Set(['A', 'B']));
  const tr = T(base, w), r = relink(tr, DEFAULT);
  ok('2 X carried up 2: B goes up 1 (B 2, X 4); taken, with those rows', eq(checkTransition(tr), []) && r.ok && eq(got(r), { A: 0, B: 2, X: 4 }), got(r));
  const b3 = sheet(20, [set('A', 0, 0, 5), set('B', 0, 2, 5, 2), set('X', 0, 6, 5, 3)]), v = over(b3, ctx, 'X', { y: 2 });
  up(v, new Set(['A', 'B']));
  const rv = relink(T(b3, v), DEFAULT);
  ok('2a P-UP lowers X: from row 6 to 3, B up 1; taken, with those rows', eq(rows(v), { A: 0, B: 1, X: 3 }) && rv.ok && eq(got(rv), { A: 0, B: 1, X: 3 }), got(rv));
  const m1 = sheet(20, [set('A', 0, 6, 5, 2), set('B', 0, 8, 5), set('C', 0, 9, 5, 2), set('X', 0, 12, 5, 2)]), u = over(m1, ctx, 'X', { y: 5 });
  up(u, new Set(['A', 'B', 'C']));
  const ru = relink(T(m1, u), DEFAULT);
  ok('2b three blocks over X carried up 7: taken, A 0, B 2, C 3, X 5', ru.ok && eq(got(ru), { A: 0, B: 2, C: 3, X: 5 }), got(ru));
}

/* ── 3. a push after a change of height is FOLLOW's, no move ── */
{
  // C, an elastic text of 30 characters at 10 cells (one row), narrowed to 9 cells takes two rows; D under it follows by one row, FOLLOW's
  const c = ctxOf({ C: { text: chars(30) } });
  const base = sheet(30, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), text('C', 10, 0, 11), set('D', 10, 2, 4)]), w = over(base, c, 'X', { y: 2 });
  down(w, new Set(['A'])); reshape(w, 'C', 10, 10);
  const tr = T(base, w, { leave: [['C', 20, 'narrow']] }), r = relink(tr, DEFAULT);
  ok('3 D followed C\'s new height: no move, it is not among the facts', !tr.moved.includes('D'), tr.moved);
  ok('3a checkTransition and RELINK take it, D at 3 with C\'s gap whole above it', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('D').y === 3 && showStack(stackAt(r.layout, 'D', 11)) === 'C | C1 |', got(r));
}

/* ── 4. a block a narrowing no longer pushes stays (the independent review of 88f7ba3) ── */
{
  // A, an elastic text of 30 characters on 10 cells (one row), and B under it in A's first column; a new block X at A's left presses A
  // right: A narrows to 9 cells and takes two rows, and leaves column 1, so B, which only that column held, stays at row 2 on the screen
  const c = ctxOf({ A: { text: chars(30) } }), base = sheet(11, [text('A', 0, 0, 11), set('B', 0, 2, 2)]);
  const w = over(withX(base, set('X', 0, 0, 2)), c, 'X');
  aside(w, 'A', 'X', 'right');
  const tr = { ...T(base, w), leave: [['A', 1, 'press']], enter: [['X', 1, 'put']] }, r = relink(tr, DEFAULT);
  ok('4 A pressed right (col 1, w 10, two rows); B stays at row 2, which no primitive moved', eq(w.L.boxes.get('A').col, 1) && w.L.boxes.get('A').h === 2 && rows(w).B === 2 && !tr.moved.includes('B'), [rows(w), tr.moved]);
  ok('4a checkTransition and RELINK take it, and B stays at row 2 (GAP.9: A\'s body and gap stay as rows in column 1)', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('B').y === 2, got(r));
}

/* ── 5. a swap: RELINK makes its structural steps from the pair and their heights (the independent review of 88f7ba3) ── */
{
  // X at row 0 carried down; N at row 4 pushed to 8, X pinned against it at 7; past N's middle they swap: N at 7, X right under it at 8
  const base = sheet(20, [set('X', 0, 0, 5), set('N', 0, 4, 5)]), w = over(base, ctx, 'X', { y: 7 });
  sinkTo(w, 'N', 8, 'down');                                    // P-DOWN pushed N to 8, X pinned against it at 7
  place(w, 'N', { y: 7 }); place(w, 'X', { y: 8 });             // the swap (phase 3, 2b)
  const pass = [1, 2, 3, 4].map((col) => ['X', col]);
  const tr = { base, after: w.L, ...transitionFacts(w, base, { swap: ['X', 'N'] }), carried: 'X', leave: [], enter: [], pass }, r = relink(tr, DEFAULT);
  ok('5 the facts name the pair and the swap', eq(tr.moved, ['X', 'N']) && eq(tr.swap, ['X', 'N']), tr);
  ok('5a checkTransition and RELINK take it: N at 7, X right under it at 8, N\'s gap above it its own', eq(checkTransition(tr), []) && r.ok && eq(got(r), { N: 7, X: 8 }) && showStack(stackAt(r.layout, 'N', 1)) === 'top | _7 |', [checkTransition(tr), got(r)]);
  const bad = checkTransition({ ...tr, swap: undefined });
  ok('5b with no swap declared, the check refuses the pass', bad.some((e) => /only a block of a swap/.test(e)), bad);
  const upB = sheet(20, [set('N', 0, 0, 5), set('X', 0, 4, 5, 2)]), v = over(upB, ctx, 'X', { y: 1 });   // X pinned under N (row 0) at 1
  place(v, 'X', { y: 0 }); place(v, 'N', { y: 2 });             // the swap: X takes N's top row, N right under it
  const tu = { base: upB, after: v.L, ...transitionFacts(v, upB, { swap: ['X', 'N'] }), carried: 'X', leave: [], enter: [], pass }, ru = relink(tu, DEFAULT);
  ok('5c going up: X (two rows) takes N\'s top row, N right under it; taken', eq(checkTransition(tu), []) && ru.ok && eq(got(ru), { X: 0, N: 2 }), [checkTransition(tu), got(ru)]);
}

/* ── 5d. a swap after the carried block narrowed: made at the heights it is made with (the independent review of 24a4f93) ── */
{
  // X, an elastic text of 30 characters on 10 cells (one row), carried to column 1: at the right edge it narrows to 9 cells and takes two
  // rows (phase 1c), pinned at 2 against N at 4; past N's middle they swap: N up by X's two rows to 2, X right under it at 3
  const c = ctxOf({ X: { text: chars(30) } }), pass = [['X', 2]];
  const base = sheet(11, [text('X', 0, 0, 11), set('N', 1, 4, 2)]), w = over(base, c, 'X', { col: 1, y: 2, w: 10, h: 2 });
  place(w, 'N', { y: 2 }); place(w, 'X', { y: 3 });
  const tr = { base, after: w.L, ...transitionFacts(w, base, { swap: ['X', 'N'] }), carried: 'X', leave: [['X', 1, 'narrow']], enter: [], pass }, r = relink(tr, DEFAULT);
  ok('5d going down, X two rows high after narrowing at the edge: taken, N at 2, X right under it at 3', eq(checkTransition(tr), []) && r.ok && eq(got(r), { N: 2, X: 3 }), [checkTransition(tr), got(r)]);
  // going up: N at 0, X below at 4 carried up to column 1, two rows, pinned under N at 1; X takes N's top row, N right under it at 2
  const upB = sheet(11, [set('N', 1, 0, 2), text('X', 0, 4, 11)]), v = over(upB, c, 'X', { col: 1, y: 1, w: 10, h: 2 });
  place(v, 'X', { y: 0 }); place(v, 'N', { y: 2 });
  const tu = { base: upB, after: v.L, ...transitionFacts(v, upB, { swap: ['X', 'N'] }), carried: 'X', leave: [['X', 1, 'narrow']], enter: [], pass }, ru = relink(tu, DEFAULT);
  ok('5e going up, the same: taken, X at 0, N right under it at 2', eq(checkTransition(tu), []) && ru.ok && eq(got(ru), { X: 0, N: 2 }), [checkTransition(tu), got(ru)]);
}

/* ── 6. a moved block whose move adds up to nothing is held (G15; the independent review of 82be34a) ── */
{
  // B (30 characters on 10 cells) narrowed to 9 cells takes two rows and leaves C's column; A sunk by one row pushes C from 4 to 5 through
  // B's kept rows. GAP counts C from 5 too (B, still in C's column in base, grown by a row): its move adds up to nothing, and it is held
  const c = ctxOf({ B: { text: chars(30) } }), base = sheet(11, [set('A', 0, 0, 2), text('B', 0, 2, 11), set('C', 0, 4, 2)]), w = over(base, c);
  reshape(w, 'B', 1, 10); sinkTo(w, 'A', 1, 'down');
  const tr = { ...T(base, w), carried: null, leave: [['B', 1, 'narrow']] }, r = relink(tr, DEFAULT);
  ok('6 A sunk by 1 pushes C to 5 through B\'s kept rows; the facts name A and C', eq(rows(w), { A: 1, B: 2, C: 5 }) && eq(tr.moved, ['A', 'C']), [rows(w), tr.moved]);
  ok('6a RELINK keeps C at 5, A\'s three rows above it', r.ok && r.layout.boxes.get('C').y === 5 && showStack(stackAt(r.layout, 'C', 1)) === 'A | A3 |', [got(r), r.ok && showStack(stackAt(r.layout, 'C', 1))]);
  const r0 = relink({ ...tr, moved: ['A'] }, DEFAULT);
  ok('6b not held (C left out of the facts), C would rise to 4 as B left its column, and A\'s push be lost', r0.ok && r0.layout.boxes.get('C').y === 4, got(r0));
}

/* ── 7. no block the phases did not move gets a move (the independent reviews of 321c664 and 517a8d7; the architecture review) ── */
{
  // X created on A's right half: the carry's judge meets A from the side, P-ASIDE narrows it from the left to three rows and it leaves the
  // columns of B, D and C; B stays at 3, P-DOWN takes D under X to 4 and C under D to 5. X is created: D and C, pushed down under it and
  // nothing else moved, are FOLLOW's, not named (G16, INV-7 b); taking X away again gives every block back its row of base, which the
  // path's corrections of B and D broke
  const c = ctxOf({ A: { text: chars(54) } }), base = sheet(11, [text('A', 0, 0, 11, 2), set('B', 0, 3, 2), set('D', 2, 3, 3), set('C', 0, 4, 4)]);
  const w = over(withX(base, set('X', 3, 0, 2, 4)), c, 'X');
  carry(w, base, c, { col: 3, y: 0, frow: 0 });
  const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, DEFAULT);
  ok('7 A pressed aside (col 4, w 7, three rows); B at 3, D at 4, C at 5; the facts name X alone, D and C being pushed down under it', eq(rows(w), { X: 0, A: 0, B: 3, D: 4, C: 5 }) && w.L.boxes.get('A').h === 3 && hitting(w) === null && eq(tr.moved, ['X']), [rows(w), tr.moved]);
  ok('7a checkTransition and RELINK take it, with the rows the phases left', eq(checkTransition(tr), []) && r.ok && eq(got(r), rows(w)), [checkTransition(tr), got(r)]);
  const z = r.ok && remove(r.layout, 'X', DEFAULT);
  ok('7b X taken away again: B 3, D 3, C 4, as in base', z && eq({ B: z.boxes.get('B').y, D: z.boxes.get('D').y, C: z.boxes.get('C').y }, { B: 3, D: 3, C: 4 }), z && rowsOf(z));
}

/* ── 8. a height that changed where the block under it stays is FOLLOW's (the independent review of 421412d) ── */
{
  // X, an elastic text of 30 characters on 10 cells (one row), carried to column 1, row 1: at the right edge it narrows to 9 cells (DRAG.A3)
  // and takes two rows; B under it in column 2, judged below, sinks under it to 3
  const c = ctxOf({ X: { text: chars(30) } }), base = sheet(11, [text('X', 0, 0, 11), set('B', 1, 1, 2)]), w = over(base, c, 'X', { col: 1, y: 1, w: 10, h: 2 });
  down(w, new Set(['B']));
  const tr = { ...T(base, w), leave: [['X', 1, 'narrow']] }, r = relink(tr, DEFAULT);
  ok('8 X at col 1, row 1, w 10, two rows; B sunk under it to 3', eq(rows(w), { X: 1, B: 3 }) && w.L.boxes.get('X').h === 2, rows(w));
  ok('8a checkTransition and RELINK take it: X 1, B 3, right under X', eq(checkTransition(tr), []) && r.ok && eq(got(r), { X: 1, B: 3 }) && showStack(stackAt(r.layout, 'B', 2)) === 'X | · |', [checkTransition(tr), got(r)]);
}

/* ── 9. with GAP.9 off a block the phases did not move is not held: it rises at RELINK ── */
{
  // A narrowed off column 1 (from the left); B under it there. With GAP.9 off A's own rows go with it and its body leaves none, so B rises
  // as after a deletion; the phases never move a block up, so the screen has B where it was, and only RELINK lifts it
  const off = resolve({ 'GAP.9': false }), c = ctxOf({}, off), base = sheet(11, [set('A', 0, 0, 5), set('B', 0, 2, 2)]), w = over(base, c);
  place(w, 'A', { col: 1, w: 4 });
  const tr = { base, after: w.L, ...transitionFacts(w, base), carried: null, leave: [['A', 1, 'narrow']], enter: [], pass: [] }, r = relink(tr, off);
  ok('9 B is not among the facts', !tr.moved.includes('B'), tr.moved);
  ok('9a RELINK takes it and lifts B, as GAP.9 off has it (row 0), above the row the screen had (2)', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('B').y === 0, got(r));
}

/* ── 10, 11. case 7 with GAP.9 off, and chains under C (the independent reviews of 8bafb15 and 517a8d7) ── */
{
  // A's own rows go with it: B, which no primitive moved, rises at RELINK; D, C and the blocks under C stay where P-DOWN put them, held. X
  // taken away again, every one rises into A's place, as after a deletion, B with them
  const off = resolve({ 'GAP.9': false }), c = ctxOf({ A: { text: chars(54) } }, off);
  const run = (extra) => {
    const base = sheet(11, [text('A', 0, 0, 11, 2), set('B', 0, 3, 2), set('D', 2, 3, 3), set('C', 0, 4, 4), ...extra]);
    const w = over(withX(base, set('X', 3, 0, 2, 4)), c, 'X');
    carry(w, base, c, { col: 3, y: 0, frow: 0 });
    const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, off);
    return { w, tr, r, check: checkTransition(tr), gone: r.ok ? rowsOf(remove(r.layout, 'X', off)) : null };
  };
  const a = run([]);
  ok('10 the phases leave B at 3, D at 4, C at 5; RELINK lifts B to 0 and keeps D at 4, C at 5', eq(rows(a.w), { X: 0, A: 0, B: 3, D: 4, C: 5 }) && eq(a.check, []) && a.r.ok && eq(got(a.r), { X: 0, A: 0, B: 0, D: 4, C: 5 }), [a.check, got(a.r)]);
  ok('10a X taken away: B, D and C rise into A\'s place (B 0, D 0, C 1)', eq(a.gone, { B: 0, D: 0, A: 0, C: 1 }), a.gone);
  const e = run([set('E', 2, 5, 2)]);
  ok('11 the reviewer\'s case, E under C: taken, B 0, D 4, C 5, E 6', eq(e.check, []) && e.r.ok && eq(got(e.r), { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6 }), [e.check, got(e.r)]);
  const f = run([set('E', 2, 5, 2), set('F', 2, 6, 2)]);
  ok('11a two in a row under C (E, F): taken, B 0, D 4, C 5, E 6, F 7', eq(f.check, []) && f.r.ok && eq(got(f.r), { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6, F: 7 }), [f.check, got(f.r)]);
  const g = run([set('E', 2, 5, 2), set('F', 1, 6, 2), set('G', 0, 7, 3)]);
  ok('11b three, each under the one before in a column both keep (E, F, G): taken, with the rows the phases left', eq(g.check, []) && g.r.ok && eq(got(g.r), { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6, F: 7, G: 8 }), [g.check, got(g.r)]);
  ok('11c X taken away: the chain rises into A\'s place with B (D 0, C 1, E 2, F 3, G 4)', eq(g.gone, { B: 0, D: 0, A: 0, C: 1, E: 2, F: 3, G: 4 }), g.gone);
}

/* ── 12. a transition the path could not declare (the architecture review, k 3726) ── */
{
  // GAP.9 off. A full-width text T narrowed by a new block X at its middle; B2 and B5, which P-DOWN took down by one row each, start lower
  // in GAP's count than the screen has them: the path had to move them up, through B1, and was refused. As facts it is taken
  const off = resolve({ 'GAP.9': false }), c = ctxOf({ T: { text: chars(67) } }, off);
  const base = sheet(13, [text('T', 0, 0, 13, 2), set('B0', 8, 2, 4, 2), set('B1', 3, 3, 2, 2), set('B3', 6, 3, 3, 1), set('B4', 6, 4, 3, 2), set('B2', 3, 5, 4, 1), set('B5', 5, 6, 2, 2)]);
  const w = over(withX(base, set('X', 5, 0, 2, 6)), c, 'X');
  carry(w, base, c, { col: 5, y: 0, frow: 0 });
  const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, off);
  ok('12 nothing hits after the phases; B2 and B5 moved down a row, pushed under X: FOLLOW\'s, the facts name X alone', hitting(w) === null && rows(w).B2 === 6 && rows(w).B5 === 7 && eq(tr.moved, ['X']), [rows(w), tr.moved]);
  ok('12a checkTransition and RELINK take it, B2 and B5 where the phases left them', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('B2').y === 6 && r.layout.boxes.get('B5').y === 7, [checkTransition(tr), got(r)]);
}

/* ── 13. O-25 (the owner, 2026-11-11, G16): a block pressed out from under a block that the change takes down past it follows it ── */
{
  // T, a text across the sheet, and B1 under it in column 6; X created over both: the carry's judge meets B1 from the side (P-ASIDE, a
  // column left, out of every column it had) and T sinks under X with the blocks under it (P-DOWN, FOLLOW's). RELINK: B1 under T with the
  // gap it had, none, not over it with T pushed further; X taken away again, every block back (INV-7 b)
  const c = ctxOf({ T: { text: chars(76) } });
  const base = sheet(10, [text('T', 0, 0, 10, 2), set('B0', 2, 2, 2, 2), set('B1', 5, 2, 2, 2), set('B2', 0, 3, 3, 1)]);
  const w = over(withX(base, set('X', 5, 0, 4, 4)), c, 'X');
  carry(w, base, c, { col: 5, y: 0, frow: 0 });
  const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, DEFAULT);
  ok('13 the phases: B1 a column aside, beside X at 2; T under X at 4, B0 at 6, B2 at 7; the facts name X alone', eq(rows(w), { X: 0, B1: 2, T: 4, B0: 6, B2: 7 }) && w.L.boxes.get('B1').col === 4 && eq(tr.moved, ['X']), [rows(w), tr.moved]);
  ok('13a RELINK: B1 right under T, at 6; T at 4, with no rows left empty under X', eq(checkTransition(tr), []) && r.ok && eq(got(r), { X: 0, T: 4, B0: 6, B1: 6, B2: 7 }) && showStack(stackAt(r.layout, 'B1', 5)) === 'T | · |', [checkTransition(tr), got(r), r.ok && showStack(stackAt(r.layout, 'B1', 5))]);
  const z = r.ok && remove(r.layout, 'X', DEFAULT);
  ok('13b X taken away again: T at 0, B1 right under it at 2, B0 2, B2 3, as in base', z && eq(rowsOf(z), { T: 0, B0: 2, B1: 2, B2: 3 }), z && rowsOf(z));
}

/* ── 14. INV-7 b: a block created over a block it pushes down, then taken away (G16) ── */
{
  // T at row 0; X created over it, over every column of T or over some: P-DOWN sinks T under X. T pushed down under X is FOLLOW's: the
  // facts name X alone, and X taken away again, T is back at 0. Named as a move, T would keep the rows it went down by, as free room above
  // it, and stay at 2
  for (const [name, tw] of [['over all of T', 3], ['over part of T', 5]]) {
    const base = sheet(10, [set('T', 0, 0, tw, 1)]), w = over(withX(base, set('X', 0, 0, 3, 2)), ctx, 'X');
    down(w, new Set(['T']));
    const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, DEFAULT);
    const z = r.ok && remove(r.layout, 'X', DEFAULT), z1 = remove(relink({ ...tr, moved: ['T', 'X'] }, DEFAULT).layout, 'X', DEFAULT);
    ok(`14 X created ${name}: T at 2 under it, the facts name X alone; X taken away, T back at 0 (named as a move, it would stay at 2)`, eq(tr.moved, ['X']) && r.ok && got(r).T === 2 && z && z.boxes.get('T').y === 0 && z1.boxes.get('T').y === 2, [tr.moved, got(r), z && rowsOf(z), rowsOf(z1)]);
  }
}

/* ── 15. a push under a created block beside another primitive's move: every move named, none counted twice ── */
{
  // X created at row 2 and lowered by P-UP to 3; P-DOWN takes the blocks under it down by three rows, and P-SEP one more for some of
  // them: those are moves, so every block the phases moved is named, and RELINK gives the rows the phases left (a block left out would
  // be pushed by FOLLOW over it and again by the move of the block under it)
  const c = ctxOf({ B4: { text: chars(18) }, B5: { text: chars(26) }, B6: { text: chars(11) } });
  const base = sheet(10, [set('B1', 1, 0, 2), set('B0', 4, 0, 6, 3), set('B2', 0, 2, 3, 3), set('B3', 2, 3, 4, 2), text('B4', 0, 5, 7), text('B5', 1, 8, 9, 2), text('B6', 1, 11, 5)]);
  const w = over(withX(base, set('X', 1, 2, 5, 3)), c, 'X');
  const mem = { away: true, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
  const j = judgeCarry(w.L, base, { id: 'X', at: { col: 1, y: 2, frow: 2 }, away: true }, mem, c);
  phase(w); for (const [id, sd] of j.met) aside(w, id, 'X', sd);
  phase(w); up(w, new Set([...j.side].filter(([id, sd]) => sd === 'above' && !j.met.has(id)).map(([id]) => id)));
  phase(w); down(w, new Set([...j.side].filter(([id, sd]) => sd === 'below' && !j.met.has(id)).map(([id]) => id)));
  phase(w); for (let k = 0; k < 20; k++) { const h = hitting(w); if (!h) break; sep(w, h[0], h[1], (o) => j.side.get(o)); }
  const tr = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', ...columns(base, w) }, r = relink(tr, DEFAULT);
  ok('15 every block the phases moved is named, P-DOWN\'s pushes with them', hitting(w) === null && ['B2', 'B3', 'B4', 'B5', 'B6', 'X'].every((b) => tr.moved.includes(b)), [rows(w), tr.moved]);
  ok('15a RELINK gives the rows the phases left', r.ok && eq(got(r), rows(w)), [got(r), rows(w)]);
}

process.exit(t.fails ? 1 : 0);
