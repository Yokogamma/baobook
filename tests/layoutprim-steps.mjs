// Node: the steps of the transition SETTLE hands RELINK (public/layout/primitives.js `transitionSteps`; LAYOUT-ENGINE-PLAN §5.2;
// docs/LAYOUT-RULES.md GAP's inputs), pinned before settle.js exists (the internal review of 345ac6f): a carry and what P-DOWN or P-UP did
// after it, cut once from the rows each block went since `base` (the moved block's direction first, then in each direction the furthest
// alone first, the others joining it for the last rows of the way), with the rows a push gave after a change of height as the start; the
// transition passes transition.js `checkTransition` and gap.js `relink` takes it. The steps the primitives record call by call (Moved, for
// the dev look) are not that input: phase 1c's step carries the moved block alone onto the neighbour that a later call pushes, and the check
// refuses them in order.
import { down, up, aside, reshape, sinkTo, transitionSteps } from '../public/layout/primitives.js';
import { checkTransition } from '../public/layout/transition.js';
import { relink, stackAt, showStack } from '../public/layout/gap.js';
import { DEFAULT } from '../public/layout/rules.js';
import { set, text, chars, ctxOf, sheet, over, place, rows, steps, eq, tally } from './lib/primcase.mjs';
import { readingOrder } from '../public/layout/geometry.js';

const t = tally(), ok = t.ok, ctx = ctxOf();
/** The transition of a vertical carry of X (it keeps its columns): base, the layout after the phases, the cut steps and start rows. */
function T(base, w, x = {}) { const { steps: st, start } = transitionSteps(w, base); return { base, after: w.L, steps: st, start, carried: 'X', leave: [], enter: [], pass: [], ...x }; }
/** The steps as the primitives recorded them, after phase 1c's own: what the review found refused. */
function naive(base, w) { const d = w.L.boxes.get('X').y - base.boxes.get('X').y, st = steps(w).map(([ids, r]) => [ids, r]); return [[['X'], d - st.filter(([ids]) => ids.includes('X')).reduce((s, [, r]) => s + r, 0)], ...st]; }

/* ── 1. a carry down and P-DOWN ── */
{
  const base = sheet(20, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), set('B', 0, 6, 5)]), w = over(base, ctx, 'X', { y: 2 });
  down(w, new Set(['A', 'B']));
  const tr = T(base, w);
  ok('1 X carried down 2 onto A: A pushed 1, B with it (X 2, A 4, B 7)', eq(rows(w), { X: 2, A: 4, B: 7 }), rows(w));
  ok('1a the cut: X alone 1 row, then X, A and B 1 row', eq(tr.steps, [[['X'], 1], [['X', 'A', 'B'], 1]]), tr.steps);
  ok('1b checkTransition takes it', eq(checkTransition(tr), []), checkTransition(tr));
  const r = relink(tr, DEFAULT);
  ok('1c and RELINK takes it, the rows as the phases left them', r.ok && eq(Object.fromEntries([...r.layout.boxes].map(([k, b]) => [k, b.y])), { X: 2, A: 4, B: 7 }), r);
  const bad = checkTransition({ ...tr, steps: naive(base, w) });
  ok('1d the steps as recorded call by call, after 1c\'s, are refused: 1c\'s step puts X on A', bad.some((e) => /puts X on A/.test(e)), bad);
}

/* ── 2. a carry up and P-UP, and P-UP lowering the moved block ── */
{
  const base = sheet(20, [set('A', 0, 0, 5), set('B', 0, 3, 5, 2), set('X', 0, 6, 5, 2)]), w = over(base, ctx, 'X', { y: 4 });
  up(w, new Set(['A', 'B']));
  const tr = T(base, w);
  ok('2 X carried up 2: B goes up 1 (B 2, X 4); the cut: X alone 1 row, then X and B 1 row', eq(tr.steps, [[['X'], -1], [['B', 'X'], -1]]) || eq(tr.steps, [[['X'], -1], [['X', 'B'], -1]]), tr.steps);
  ok('2a checkTransition and RELINK take it', eq(checkTransition(tr), []) && relink(tr, DEFAULT).ok, checkTransition(tr));
  const b3 = sheet(20, [set('A', 0, 0, 5), set('B', 0, 2, 5, 2), set('X', 0, 6, 5, 3)]), v = over(b3, ctx, 'X', { y: 2 });
  up(v, new Set(['A', 'B']));
  const tv = T(b3, v);
  ok('2b P-UP lowers X: from row 6 to 3, B up 1; the cut: X alone 2 rows, then X and B 1 row', eq(rows(v), { A: 0, B: 1, X: 3 }) && eq(tv.steps.map(([ids, r]) => [ids.sort(), r]), [[['X'], -2], [['B', 'X'], -1]]), tv.steps);
  ok('2c checkTransition and RELINK take it', eq(checkTransition(tv), []) && relink(tv, DEFAULT).ok, checkTransition(tv));
  const m1 = sheet(20, [set('A', 0, 6, 5, 2), set('B', 0, 8, 5), set('C', 0, 9, 5, 2), set('X', 0, 12, 5, 2)]), u = over(m1, ctx, 'X', { y: 5 });
  up(u, new Set(['A', 'B', 'C']));
  const tu = T(m1, u);
  ok('2d three blocks over X carried up 7: X alone 1 row, then all four 6 rows; taken by both', eq(tu.steps.map(([ids, r]) => [ids.sort(), r]), [[['X'], -1], [['A', 'B', 'C', 'X'], -6]]) && eq(checkTransition(tu), []) && relink(tu, DEFAULT).ok, [tu.steps, checkTransition(tu)]);
}

/* ── 3. a push after a change of height is the start, not a step ── */
{
  // C, an elastic text of 30 characters at 10 cells (one row), narrowed to 9 cells takes two rows; D under it follows by one row, FOLLOW's
  const c = ctxOf({ C: { text: chars(30) } });
  const base = sheet(30, [set('X', 0, 0, 5, 2), set('A', 0, 3, 5, 2), text('C', 10, 0, 11), set('D', 10, 2, 4)]), w = over(base, c, 'X', { y: 2 });
  down(w, new Set(['A'])); reshape(w, 'C', 10, 10);
  const tr = T(base, w, { leave: [['C', 20, 'narrow']] });
  ok('3 D followed C\'s new row as FOLLOW: its start row is 3 and no step moves it', tr.start.D === 3 && !tr.steps.some(([ids]) => ids.includes('D')), [tr.start, tr.steps]);
  ok('3a checkTransition and RELINK take it, C\'s narrowing declared', eq(checkTransition(tr), []) && relink(tr, DEFAULT).ok, checkTransition(tr));
  const noStart = checkTransition({ ...tr, start: undefined });
  ok('3b without the start rows the check refuses it: the change of height reaches D', noStart.some((e) => /reaches D/.test(e)), noStart);
}

/* ── 4. the start rows are GAP's (the independent review of 88f7ba3) ── */
{
  // A, an elastic text of 30 characters on 10 cells (one row), and B under it in A's first column; a new block X at A's left presses A
  // right: A narrows to 9 cells and takes two rows, and leaves column 1, so B, which only that column held, stays at row 2 on the screen
  const c = ctxOf({ A: { text: chars(30) } }), base = sheet(11, [text('A', 0, 0, 11), set('B', 0, 2, 2)]);
  const boxes = new Map([...base.boxes, ['X', set('X', 0, 0, 2)]]), order = readingOrder(boxes.values());
  const w = over({ ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }, c, 'X');
  aside(w, 'A', 'X', 'right');
  const tr = { ...T(base, w), leave: [['A', 1, 'press']], enter: [['X', 1, 'put']] };
  ok('4 A pressed right (col 1, w 10, two rows); B stays at row 2', eq(w.L.boxes.get('A').col, 1) && w.L.boxes.get('A').h === 2 && rows(w).B === 2, rows(w));
  ok('4a B starts where GAP counts it from, FOLLOW over base\'s stacks with A\'s new height (row 3), and no step moves it', tr.start.B === 3 && !tr.steps.some(([ids]) => ids.includes('B')), [tr.start, tr.steps]);
  const r = relink(tr, DEFAULT);
  ok('4b checkTransition and RELINK take it, and B stays at row 2 (GAP.9: A\'s body and gap stay as rows in column 1)', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('B').y === 2, [checkTransition(tr), r.ok ? r.layout.boxes.get('B').y : r]);
}

/* ── 5. a swap keeps its structural steps (the independent review of 88f7ba3) ── */
{
  // X at row 0 carried down; N at row 4 pushed to 8, X pinned against it at 7; past N's middle they swap: N at 7, X right under it at 8
  const base = sheet(20, [set('X', 0, 0, 5), set('N', 0, 4, 5)]), w = over(base, ctx, 'X', { y: 7 });
  sinkTo(w, 'N', 8, 'down');                                    // P-DOWN pushed N to 8, X pinned against it at 7
  place(w, 'N', { y: 7 }); place(w, 'X', { y: 8 });             // the swap (phase 3, 2b), whose own steps transitionSteps takes from `swap`
  const sw = transitionSteps(w, base, { swap: ['X', 'N'] });
  const tr = { base, after: w.L, steps: sw.steps, start: sw.start, carried: 'X', swap: ['X', 'N'], leave: [], enter: [], pass: [1, 2, 3, 4].map((col) => ['X', col]) };
  ok('5 the moves up to the pin, then the neighbour alone by the carried block\'s height, then the carried block: X +3, X and N +4, N −1, X +1', eq(sw.steps.map(([ids, r]) => [ids.sort(), r]), [[['X'], 3], [['N', 'X'], 4], [['N'], -1], [['X'], 1]]), sw.steps);
  ok('5a checkTransition and RELINK take it', eq(checkTransition(tr), []) && relink(tr, DEFAULT).ok, checkTransition(tr));
  const flat = transitionSteps(w, base);
  ok('5b cut from the net moves alone, the swap\'s step is lost and the check refuses it', checkTransition({ ...tr, steps: flat.steps }).some((e) => /not at the rows the swap gives/.test(e)), checkTransition({ ...tr, steps: flat.steps }));
  const up = sheet(20, [set('N', 0, 0, 5), set('X', 0, 4, 5, 2)]), v = over(up, ctx, 'X', { y: 1 });   // X pinned under N (row 0) at 1
  place(v, 'X', { y: 0 }); place(v, 'N', { y: 2 });             // the swap: X takes N's top row, N right under it
  const su = transitionSteps(v, up, { swap: ['X', 'N'] });
  const tu = { base: up, after: v.L, steps: su.steps, start: su.start, carried: 'X', swap: ['X', 'N'], leave: [], enter: [], pass: [1, 2, 3, 4].map((col) => ['X', col]) };
  ok('5c going up: X (two rows) takes N\'s top row, N right under it; the neighbour\'s step is the carried block\'s height, +2', su.steps[su.steps.length - 2][1] === 2 && eq(checkTransition(tu), []) && relink(tu, DEFAULT).ok, [su.steps, checkTransition(tu)]);
}

/* ── 6. a block a primitive moved keeps its way when its row now is its start row (the independent review of 82be34a) ── */
{
  // B (30 characters on 10 cells) narrowed to 9 cells takes two rows and leaves C's column; A sunk by one row pushes C from 4 to 5 through
  // B's kept rows. GAP's projected start for C is 5 too (B, still in C's column in base, grown by a row): C's way is declared from its
  // real row, 4, so that RELINK keeps it where the push put it, A's gap whole above it
  const c = ctxOf({ B: { text: chars(30) } }), base = sheet(11, [set('A', 0, 0, 2), text('B', 0, 2, 11), set('C', 0, 4, 2)]), w = over(base, c);
  reshape(w, 'B', 1, 10); sinkTo(w, 'A', 1, 'down');
  const tr = { ...T(base, w), carried: null, leave: [['B', 1, 'narrow']] };
  ok('6 A sunk by 1 pushes C to 5 through B\'s kept rows; C\'s start is 5', eq(rows(w), { A: 1, B: 2, C: 5 }) && tr.start.C === 5, [rows(w), tr.start]);
  ok('6a C\'s way is declared: from its start to the row it stood at, then with A', eq(tr.steps, [[['C'], -1], [['A', 'C'], 1]]), tr.steps);
  const r = relink(tr, DEFAULT);
  ok('6b checkTransition and RELINK take it; C stays at 5 with A\'s three rows above it', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('C').y === 5 && showStack(stackAt(r.layout, 'C', 1)) === 'A | A3 |', [checkTransition(tr), r.ok && r.layout.boxes.get('C').y, r.ok && showStack(stackAt(r.layout, 'C', 1))]);
}

process.exit(t.fails ? 1 : 0);
