// Node: the steps of the transition SETTLE hands RELINK (public/layout/primitives.js `transitionSteps`; LAYOUT-ENGINE-PLAN §5.2;
// docs/LAYOUT-RULES.md GAP's inputs), pinned before settle.js exists (the internal review of 345ac6f): a carry and what P-DOWN or P-UP did
// after it, cut once from the rows each block went since `base` (the moved block's direction first, then in each direction the furthest
// alone first, the others joining it for the last rows of the way), with the rows a push gave after a change of height as the start; the
// transition passes transition.js `checkTransition` and gap.js `relink` takes it. The steps the primitives record call by call (Moved, for
// the dev look) are not that input: phase 1c's step carries the moved block alone onto the neighbour that a later call pushes, and the check
// refuses them in order.
import { down, up, aside, reshape, sinkTo, transitionSteps } from '../public/layout/primitives.js';
import { checkTransition, explain } from '../public/layout/transition.js';
import { judgeCarry } from '../public/layout/changes.js';
import { relink, stackAt, showStack } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { set, text, chars, ctxOf, sheet, over, place, rows, steps, hitting, eq, tally } from './lib/primcase.mjs';
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
  ok('4a B starts where GAP counts it from, FOLLOW over base\'s stacks with A\'s new height (row 3); its way is one correction to the row it stood at, 2', tr.start.B === 3 && eq(tr.steps, [[['B'], -1]]), [tr.start, tr.steps]);
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

/* ── 7. a correction never meets a block that stood still (the independent review of 321c664) ── */
{
  // X created on A's right half: the carry's judge meets A from the side, P-ASIDE narrows it from the left to three rows and it leaves the
  // columns of B, D and C; B stays at 3, P-DOWN takes D under X to 4 and C under D to 5. GAP projects B and D at 4 and C at 5 (A, still in
  // their columns in base, grown by a row): B, which no primitive moved, gets its correction too, before C's would put C on it
  const c = ctxOf({ A: { text: chars(54) } }), base = sheet(11, [text('A', 0, 0, 11, 2), set('B', 0, 3, 2), set('D', 2, 3, 3), set('C', 0, 4, 4)]);
  const boxes = new Map([...base.boxes, ['X', set('X', 3, 0, 2, 4)]]), order = readingOrder(boxes.values());
  const w = over({ ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }, c, 'X');
  const mem = { away: true, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
  const j = judgeCarry(w.L, base, { id: 'X', at: { col: 3, y: 0, frow: 0 }, away: true }, mem, c);
  for (const [id, sd] of j.met) aside(w, id, 'X', sd);
  down(w, new Set([...j.side].filter(([, sd]) => sd === 'below').map(([id]) => id)));
  const g = explain(base, w.L), sw = transitionSteps(w, base);
  const tr = { base, after: w.L, steps: sw.steps, start: sw.start, carried: 'X', leave: g.left.map(([id, col]) => [id, col, 'press']), enter: g.entered.map(([id, col]) => [id, col, id === 'X' ? 'put' : 'self']), pass: [] };
  ok('7 A pressed aside (col 4, w 7, three rows); B at 3, D at 4, C at 5; nothing hits', eq(rows(w), { X: 0, A: 0, B: 3, D: 4, C: 5 }) && w.L.boxes.get('A').h === 3 && hitting(w) === null, rows(w));
  ok('7a B, D and C start at 4, 4 and 5; B\'s correction comes first, then D\'s and C\'s, then D and C together', eq(sw.start, { A: 0, B: 4, D: 4, C: 5 }) && eq(sw.steps, [[['B'], -1], [['D'], -1], [['C'], -1], [['D', 'C'], 1]]), [sw.start, sw.steps]);
  const r = relink(tr, DEFAULT);
  ok('7b checkTransition and RELINK take it, with the rows the phases left', eq(checkTransition(tr), []) && r.ok && eq(Object.fromEntries([...r.layout.boxes].map(([k, b]) => [k, b.y])), rows(w)), [checkTransition(tr), r.ok || r.errors]);
}

/* ── 8. a height that changed where the block under it stays is FOLLOW's, no correction (the independent review of 421412d) ── */
{
  // X, an elastic text of 30 characters on 10 cells (one row), carried to column 1, row 1: at the right edge it narrows to 9 cells (DRAG.A3)
  // and takes two rows; B under it in column 2, judged below, sinks under it to 3. GAP counts B from 2, X's growth pushing it in a column
  // X keeps: B's origin is 2 too, so its way is the move with X alone, which the correction to 1 inside X's new body would have broken
  const c = ctxOf({ X: { text: chars(30) } }), base = sheet(11, [text('X', 0, 0, 11), set('B', 1, 1, 2)]), w = over(base, c, 'X', { col: 1, y: 1, w: 10, h: 2 });
  down(w, new Set(['B']));
  const tr = { ...T(base, w), leave: [['X', 1, 'narrow']] };
  ok('8 X at col 1, row 1, w 10, two rows; B sunk under it to 3', eq(rows(w), { X: 1, B: 3 }) && w.L.boxes.get('X').h === 2, rows(w));
  ok('8a B starts at 2 and needs no correction: one step, X and B by 1', eq(tr.start, { X: 0, B: 2 }) && eq(tr.steps, [[['X', 'B'], 1]]), [tr.start, tr.steps]);
  const r = relink(tr, DEFAULT);
  ok('8b checkTransition and RELINK take it: X 1, B 3', eq(checkTransition(tr), []) && r.ok && eq(Object.fromEntries([...r.layout.boxes].map(([k, b]) => [k, b.y])), { X: 1, B: 3 }), [checkTransition(tr), r.ok || r.errors]);
}

/* ── 9. with GAP.9 off a block the phases did not move has no step that holds it: it rises at RELINK ── */
{
  // A narrowed off column 1 (from the left); B under it there. With GAP.9 off A's own rows go with it and its body leaves none, so B rises
  // as after a deletion; the phases never move a block up, so the screen has B where it was, and only RELINK lifts it
  const off = resolve({ 'GAP.9': false }), c = ctxOf({}, off), base = sheet(11, [set('A', 0, 0, 5), set('B', 0, 2, 2)]), w = over(base, c);
  place(w, 'A', { col: 1, w: 4 });
  const tr = { base, after: w.L, ...transitionSteps(w, base), carried: null, leave: [['A', 1, 'narrow']], enter: [], pass: [] };
  const r = relink(tr, off);
  ok('9 no step for B, which the phases did not move', eq(tr.steps, []), tr.steps);
  ok('9a RELINK takes it and lifts B, as GAP.9 off has it (row 0), above the row the screen had (2)', eq(checkTransition(tr), []) && r.ok && r.layout.boxes.get('B').y === 0, [checkTransition(tr), r.ok ? r.layout.boxes.get('B').y : r.errors]);
}

/* ── 10. case 7 with GAP.9 off: no origin takes a block past one that stays at its start row (the independent review of 8bafb15) ── */
{
  // as in case 7, but A's own rows go with it: in GAP's origins B, D and C rise (0, 0, 1). B, which no primitive moved, gets no step (RELINK
  // lifts it) and stays at its start row, 4, in the replay; C's origin is kept under it, so C is not carried past it
  const off = resolve({ 'GAP.9': false }), c = ctxOf({ A: { text: chars(54) } }, off);
  const base = sheet(11, [text('A', 0, 0, 11, 2), set('B', 0, 3, 2), set('D', 2, 3, 3), set('C', 0, 4, 4)]);
  const boxes = new Map([...base.boxes, ['X', set('X', 3, 0, 2, 4)]]), order = readingOrder(boxes.values());
  const w = over({ ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }, c, 'X');
  const mem = { away: true, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
  const j = judgeCarry(w.L, base, { id: 'X', at: { col: 3, y: 0, frow: 0 }, away: true }, mem, c);
  for (const [id, sd] of j.met) aside(w, id, 'X', sd);
  down(w, new Set([...j.side].filter(([, sd]) => sd === 'below').map(([id]) => id)));
  const g = explain(base, w.L), sw = transitionSteps(w, base);
  const tr = { base, after: w.L, steps: sw.steps, start: sw.start, carried: 'X', leave: g.left.map(([id, col]) => [id, col, 'press']), enter: g.entered.map(([id, col]) => [id, col, id === 'X' ? 'put' : 'self']), pass: [] };
  ok('10 the phases leave B at 3, D at 4, C at 5', eq(rows(w), { X: 0, A: 0, B: 3, D: 4, C: 5 }) && hitting(w) === null, rows(w));
  ok('10a no step for B; none takes C past it', !tr.steps.some(([ids]) => ids.includes('B')), tr.steps);
  const r = relink(tr, off);
  ok('10b checkTransition and RELINK take it: B lifted to 0 (GAP.9 off), D at 4, C at 5', eq(checkTransition(tr), []) && r.ok && eq(Object.fromEntries([...r.layout.boxes].map(([k, b]) => [k, b.y])), { X: 0, A: 0, B: 0, D: 4, C: 5 }), [checkTransition(tr), r.ok ? Object.fromEntries([...r.layout.boxes].map(([k, b]) => [k, b.y])) : r.errors, tr.steps]);
}

/* ── 11. case 10 with a chain under C: the origins are one order through every block between (the independent review of 517a8d7) ── */
{
  // E under C in columns C keeps, and D, which the phases moved, over E; C's origin kept under B (case 10) keeps E under C, and so on down a
  // chain of several: no correction carries a block past another, and RELINK gives the rows the empty list gives
  const off = resolve({ 'GAP.9': false }), c = ctxOf({ A: { text: chars(54) } }, off);
  const run = (extra) => {
    const base = sheet(11, [text('A', 0, 0, 11, 2), set('B', 0, 3, 2), set('D', 2, 3, 3), set('C', 0, 4, 4), ...extra]);
    const boxes = new Map([...base.boxes, ['X', set('X', 3, 0, 2, 4)]]), order = readingOrder(boxes.values());
    const w = over({ ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }, c, 'X');
    const mem = { away: true, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
    const j = judgeCarry(w.L, base, { id: 'X', at: { col: 3, y: 0, frow: 0 }, away: true }, mem, c);
    for (const [id, sd] of j.met) aside(w, id, 'X', sd);
    down(w, new Set([...j.side].filter(([, sd]) => sd === 'below').map(([id]) => id)));
    const g = explain(base, w.L), sw = transitionSteps(w, base);
    const tr = { base, after: w.L, steps: sw.steps, start: sw.start, carried: 'X', leave: g.left.map(([id, col]) => [id, col, 'press']), enter: g.entered.map(([id, col]) => [id, col, id === 'X' ? 'put' : 'self']), pass: [] };
    const r = relink(tr, off), r0 = relink({ ...tr, steps: [] }, off), y = (x) => x.ok ? Object.fromEntries([...x.layout.boxes].map(([k, b]) => [k, b.y])) : x.errors;
    return { w, tr, r, rows: y(r), empty: y(r0), check: checkTransition(tr) };
  };
  const e = run([set('E', 2, 5, 2)]);
  ok('11 the reviewer\'s case: E under C; the phases leave B 3, D 4, C 5, E 6', eq(rows(e.w), { X: 0, A: 0, B: 3, D: 4, C: 5, E: 6 }) && hitting(e.w) === null, rows(e.w));
  ok('11a checkTransition and RELINK take it: B 0, D 4, C 5, E 6, as with no steps at all', eq(e.check, []) && e.r.ok && eq(e.rows, { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6 }) && eq(e.rows, e.empty), [e.check, e.rows, e.tr.steps]);
  const f = run([set('E', 2, 5, 2), set('F', 2, 6, 2)]);
  ok('11b two in a row under C (E, F): taken, B 0, D 4, C 5, E 6, F 7', eq(f.check, []) && f.r.ok && eq(f.rows, { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6, F: 7 }), [f.check, f.rows, f.tr.steps]);
  const g = run([set('E', 2, 5, 2), set('F', 1, 6, 2), set('G', 0, 7, 3)]);
  ok('11c three, each under the one before in a column both keep (E, F, G): taken, with the rows the phases left', eq(g.check, []) && g.r.ok && eq(g.rows, { X: 0, A: 0, B: 0, D: 4, C: 5, E: 6, F: 7, G: 8 }) && eq(g.rows, g.empty), [g.check, g.rows, g.tr.steps]);
}

process.exit(t.fails ? 1 : 0);
