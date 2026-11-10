// Named cases of the model's relink(T) (step 1b of docs/LAYOUT-ENGINE-PLAN.md): every example the reviews of step 1 found on the path of a
// block that changes its order in a column it keeps, the case the old model had no rule for, each with its declaration. Several have a
// block other than the carried one pass another, which the contract does not allow SETTLE to declare outside a swap (declare.mjs says
// so); they stay as cases of the executor, which runs any declared pass, and their expectations are those of the reviews.
import { createModel } from './model.mjs';
import { checkDeclaration } from './declare.mjs';
import { landing, runCase, build } from './laws.mjs';

const blk = (id, c0, c1, y, h = 1) => ({ id, c0, c1, y, h });
const frames = (m) => Object.fromEntries([...m.B.values()].map((b) => [b.id, { c0: b.c0, c1: b.c1, y: b.y, h: b.h, e: b.e }]));
const T = (m, edits, x = {}) => { const a = frames(m); for (const [id, p] of Object.entries(edits)) a[id] = { ...a[id], ...p }; return { after: a, leave: [], enter: [], pass: [], steps: [], carried: null, ...x }; };

/** [name, got, want, the declaration's errors] for each case. */
export function transitionCases() {
  const out = [], run = (name, m, t, got, want) => { const errs = checkDeclaration(frames(m), t); m.relink(t); out.push([name, got(m), want, errs]); };
  { const m = createModel().open([blk('X', 1, 1, 1), blk('Y', 1, 2, 4)]);
    run('X carried past Y while Y widens into column 3 by itself: Y stays, its reference not pushed', m,
      T(m, { X: { y: 10 }, Y: { c1: 3 } }, { steps: [[['X'], 9]], carried: 'X', pass: [['X', 1]], enter: [['Y', 3, 'self']] }),
      (m) => [m.rows(), m.stack('Y', 3)], [{ X: 10, Y: 4 }, 'top | _4 |']); }
  { const m = createModel().open([blk('U', 1, 1, 0), blk('A', 1, 1, 3), blk('D', 1, 1, 6)]);
    run('D moved up past A comes in at its target, in A\'s gap', m, T(m, { D: { y: 1 } }, { steps: [[['D'], -5]], pass: [['D', 1]] }),
      (m) => [m.rows(), m.stack('A', 1)], [{ A: 3, D: 1, U: 0 }, 'U | · [D:U1] U1 |']); }
  { const m = createModel().open([blk('X', 1, 1, 1), blk('Y', 1, 1, 4)]);
    run('X moved down past Y while widening into column 2: its own reference, row 10', m,
      T(m, { X: { y: 10, c1: 2 } }, { steps: [[['X'], 9]], pass: [['X', 1]], enter: [['X', 2, 'self']] }),
      (m) => [m.rows(), m.stack('X', 2)], [{ X: 10, Y: 4 }, 'top | _10 |']); }
  { const m = createModel().open([blk('X', 1, 1, 6), blk('Y', 1, 1, 2)]);
    run('X moved up past Y while widening into column 2: row 0, above Y', m,
      T(m, { X: { y: 0, c1: 2 } }, { steps: [[['X'], -6]], pass: [['X', 1]], enter: [['X', 2, 'self']] }),
      (m) => [m.rows(), m.stack('X', 2)], [{ X: 0, Y: 2 }, 'top | · |']); }
  { const m = createModel().open([blk('X', 1, 1, 1), blk('Y', 1, 2, 4), blk('Z', 2, 2, 7)]);
    run('X passes Y in column 1 and Y passes Z in column 2, Y widening into column 3: X does not push Y', m,
      T(m, { X: { y: 10 }, Y: { y: 8, c1: 3 } }, { steps: [[['X'], 9], [['Y'], 4]], pass: [['X', 1], ['Y', 2]], enter: [['Y', 3, 'self']] }),
      (m) => [m.rows(), m.stack('Y', 3)], [{ X: 10, Y: 8, Z: 7 }, 'top | _8 |']); }
  { const m = createModel().open([blk('T', 3, 4, 2), blk('A', 4, 5, 4), blk('W', 4, 4, 14)]); m.show('T', 2);
    run('the temporary rows of a block that passed another are not made canonical in a column a block comes into by itself', m,
      T(m, { T: { y: 11 }, A: { y: 7 }, W: { c1: 5 } }, { steps: [[['T'], 9], [['A'], 1]], pass: [['T', 4]], enter: [['W', 5, 'self']] }),
      (m) => { const r = [m.rows(), m.rows('canonical'), m.stack('W', 5)]; m.show('T', 0); return [...r, m.rows()]; },
      [{ A: 7, T: 11, W: 18 }, { A: 7, T: 11, W: 16 }, 'A | A8 |', { A: 7, T: 11, W: 16 }]); }
  { const m = createModel().open([blk('B', 1, 2, 1), blk('D', 1, 2, 4)]);
    run('D moved up past B while leaving one of their two columns, B moved down and widening: no cycle', m,
      T(m, { B: { y: 5, c1: 3 }, D: { y: 0, c0: 2 } }, { steps: [[['D'], -4], [['B'], 4]], pass: [['D', 2]], leave: [['D', 1, 'narrow']], enter: [['B', 3, 'self']] }),
      (m) => [m.rows(), m.stack('B', 3)], [{ B: 5, D: 0 }, 'top | _5 |']); }
  for (const far of [false, true]) {
    const m = createModel().open([blk('A', 1, 1, 0), blk('B', 1, 2, 11), blk('P', 10, 10, 1), blk('Q', 10, 10, 4)]); m.height('A', 2);
    run(`B moved down a row and shifted from columns 1–2 to 2–3, ${far ? 'P passing Q in column 10 in the same RELINK' : 'nothing else'}: B's memory, narrowed back to column 2`, m,
      T(m, far ? { B: { y: 13, c0: 2, c1: 3 }, P: { y: 10 } } : { B: { y: 13, c0: 2, c1: 3 } }, { steps: far ? [[['B'], 1], [['P'], 9]] : [[['B'], 1]], pass: far ? [['P', 10]] : [], leave: [['B', 1, 'narrow']], enter: [['B', 3, 'self']] }),
      (m) => { const st = m.stack('B', 2); m.width('B', 2, 2); return [st, m.rows().B]; }, ['top | _11 |', 11]);
  }
  { const m = createModel().open([blk('C', 1, 1, 4), blk('N', 1, 2, 8), blk('A', 2, 2, 6)]);
    run('a swap with a wide neighbour (LAYOUT-RULES §5.1b): C pinned right against N at row 7, N takes row 7 and C stands right under it; N, moved up by C\'s height, stays under A', m,
      T(m, { N: { y: 7 }, C: { y: 8 } }, { steps: [[['C'], 3], [['N'], -1], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1]] }),
      (m) => m.rows(), { A: 6, C: 8, N: 7 }); }
  { const m = createModel().open([blk('C', 1, 1, 0, 3), blk('N', 1, 2, 5), blk('A', 2, 2, 4)]);
    run('a swap with a wide neighbour shorter than the carried block: N, taking C\'s pinned row 2, passes A in column 2, which C does not cover', m,
      T(m, { N: { y: 2 }, C: { y: 3 } }, { steps: [[['C'], 2], [['N'], -3], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1], ['N', 2]] }),
      (m) => m.rows(), { A: 4, C: 3, N: 2 }); }
  { const m = createModel().open([blk('U', 1, 1, 0), blk('X', 1, 1, 2), blk('N', 1, 1, 5), blk('B', 1, 1, 9)]);
    run('blocks that swap keep their own rows (GAP.2, G4): X carried down and swapped with N, N\'s three rows under it go with N when it is deleted', m,
      T(m, { N: { y: 4 }, X: { y: 5 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = m.rows(), st = m.stack('B', 1); m.remove('N'); return [r, st, m.rows()]; }, [{ B: 9, N: 4, U: 0, X: 5 }, 'N | · [X:U1] N3 |', { B: 5, U: 0, X: 4 }]); }
  { const m = createModel().open([blk('b3', 1, 3, 0), blk('b1', 3, 3, 4)]);
    run('a plain carry of b3 from row 0 to 7 past b1: b1 keeps its side and is pushed down to row 8 (DRAG.B2, P-DOWN), b3 alone over the gap and then with b1', m,
      T(m, { b3: { y: 7 }, b1: { y: 8 } }, { steps: [[['b3'], 3], [['b3', 'b1'], 4]], carried: 'b3' }),
      (m) => m.rows(), { b1: 8, b3: 7 }); }
  { const m = createModel().open([blk('b3', 1, 3, 0), blk('b1', 3, 3, 4)]);
    run('the same carry with the hold or Shift: b3 pinned on b1 at row 3, they swap, b1 takes row 3 and b3 stands right under it', m,
      T(m, { b1: { y: 3 }, b3: { y: 4 } }, { steps: [[['b1'], -1], [['b3'], 4]], carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }),
      (m) => m.rows(), { b1: 3, b3: 4 });
    run('then b3 goes on to row 7 from the new start, b1 staying at row 3', m, T(m, { b3: { y: 7 } }, { steps: [[['b3'], 3]], carried: 'b3' }),
      (m) => m.rows(), { b1: 3, b3: 7 }); }
  { const m = createModel().open([blk('C', 1, 1, 4, 4), blk('N', 1, 2, 8), blk('A', 2, 2, 6)]);
    run('the same wide neighbour under a carried block 4 rows tall: C already right against N, N takes row 4 and passes A in column 2, C at 5', m,
      T(m, { N: { y: 4 }, C: { y: 5 } }, { steps: [[['N'], -4], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1], ['N', 2]] }),
      (m) => m.rows(), { A: 6, C: 5, N: 4 }); }
  { const m = createModel().open([blk('A', 1, 1, 0), blk('B', 1, 1, 4)]);
    run('an undo carrying A back to its old cell, row 7, under B: A leaves its column and comes back by its canonical row, B rising into its place', m,
      T(m, { A: { y: 7, yc: 7 }, B: { y: 0 } }, { carried: 'A', canonical: true, leave: [['A', 1, 'away']], enter: [['A', 1, 'back']] }),
      (m) => [m.rows(), m.rows('canonical')], [{ A: 7, B: 0 }, { A: 7, B: 0 }]); }
  { const m = createModel().open([blk('U', 1, 1, 0)]); m.show('U', 2);
    run('an undo making a deleted X again at its old cell, canonical row 2, under U with two temporary rows: on the screen at 4, canonically 2, and 2 when they end', m,
      T(m, { X: { c0: 1, c1: 2, y: 4, yc: 2, h: 1, e: 0 } }, { carried: 'X', canonical: true, enter: [['X', 1, 'back'], ['X', 2, 'back']] }),
      (m) => { const r = [m.rows().X, m.rows('canonical').X]; m.show('U', 0); return [...r, m.rows().X]; }, [4, 2, 2]); }
  { const m = createModel().open([blk('A', 1, 1, 0), blk('B', 1, 1, 2)]);
    run('a real height: A grows from 1 row to 3, B under it follows with its gap to row 4 (FOLLOW, no move)', m,
      T(m, { A: { h: 3 }, B: { y: 4 } }, { start: { A: 0, B: 4 } }),
      (m) => m.rows(), { A: 0, B: 4 }); }
  { const m = createModel().open([blk('Y', 1, 1, 3), blk('X', 1, 1, 6)]);
    run('P-UP off: X carried up into Y, which is pushed down under it instead (the fallback of §1.6): X passes Y, Y stays and moves', m,
      T(m, { X: { y: 3 }, Y: { y: 4 } }, { steps: [[['Y'], 1], [['X'], -3]], carried: 'X', fallback: 'P-UP', pass: [['X', 1]] }),
      (m) => m.rows(), { X: 3, Y: 4 }); }
  { const m = createModel({ gap8: false }).open([blk('a0', 4, 6, 11, 3), blk('a1', 3, 6, 18, 3), blk('a2', 0, 3, 10, 3), blk('a3', 2, 5, 4, 3)]); m.show('a0', 2); m.show('a3', 1);
    // found by the laws (seed 11225, GEN_VERSION 6): a1 carried up pushes a0 and a2 up (P-UP) while a3 widens into column 1 by itself; a3
    // comes in there at its reference, over a2, and its temporary row pushes a2 on the screen, a row under where SETTLE put it, and a2
    // pushes a1 in column 3: both stand canonically where SETTLE put them, and there when the temporary rows end (§2.1)
    run('a block that came in by itself pushes on the screen, through a block it pushes, a block the steps moved; canonically both land', m,
      T(m, { a0: { y: 8 }, a1: { y: 13 }, a2: { y: 10 }, a3: { c0: 1 } }, { steps: [[['a1'], -4], [['a1', 'a0'], -3], [['a1', 'a0', 'a2'], -1]], carried: 'a1', enter: [['a3', 1, 'self']] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('a0', 0); m.show('a3', 0); return [...r, m.rows()]; },
      [{ a0: 8, a1: 14, a2: 11, a3: 4 }, { a0: 8, a1: 13, a2: 10, a3: 4 }, { a0: 8, a1: 13, a2: 10, a3: 4 }]); }
  // O-21 (decided 2026-11-09): a swap's neighbour moves by the carried block's height on the screen, its temporary rows included, and
  // lands exactly where the swap put it; that displacement is structural and writes none of the carried block's temporary rows, so when
  // they end the neighbour follows the carried block
  { const m = createModel().open([blk('a3', 1, 4, 3, 3), blk('a1', 1, 1, 13, 2)]); m.show('a1', 1); m.show('a3', 1);
    // a1 (one temporary row) carried up and swapped with a3 (one too): a3 moves down by a1's 3 rows on the screen, to 6, right under a1;
    // canonically it stands right under a1's 2 rows, at 5, and stays there when the temporary rows end
    run('O-21: a swap of blocks with temporary heights lands the neighbour where the swap put it: 6 on the screen, 5 canonically, 5 when they end', m,
      T(m, { a1: { y: 3 }, a3: { y: 6 } }, { steps: [[['a1'], -7], [['a1'], -4], [['a3'], 3]], carried: 'a1', swap: ['a1', 'a3'], pass: [['a1', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('a1', 0); m.show('a3', 0); return [...r, m.rows()]; },
      [{ a1: 3, a3: 6 }, { a1: 3, a3: 5 }, { a1: 3, a3: 5 }]); }
  { const m = createModel().open([blk('N', 1, 2, 0, 2), blk('X', 1, 1, 5), blk('B', 1, 2, 9)]); m.show('X', 1);
    // going up: X (one temporary row) takes N's top row, N moves down by X's 2 rows on the screen; B, which X's temporary row pushed at
    // its old place, keeps its row on the screen, now pushed through N; when the temporary row ends N and B follow X
    run('O-21: going up, the neighbour right under the carried block, and the block under the carried block\'s old place kept on the screen', m,
      T(m, { X: { y: 0 }, N: { y: 2 } }, { steps: [[['X'], -3], [['X'], -2], [['N'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 10, N: 2, X: 0 }, { B: 9, N: 1, X: 0 }, { B: 9, N: 1, X: 0 }]); }
  { const m = createModel().open([blk('X', 1, 1, 0), blk('N', 1, 1, 4, 2), blk('F', 1, 1, 7)]); m.show('X', 1);
    // going down after a push: X (one temporary row) pushes N by 2 and F follows (P-DOWN), N is pinned at 7 and moves up by X's 2 rows,
    // X stands right under it; F stays where the push put it, 10, and follows X when its temporary row ends
    run('O-21: going down after a push, the neighbour and what followed it land where the swap put them', m,
      T(m, { X: { y: 7 }, N: { y: 5 }, F: { y: 10 } }, { steps: [[['X'], 3], [['X', 'N', 'F'], 2], [['N'], -2], [['X'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ F: 10, N: 5, X: 7 }, { F: 9, N: 5, X: 7 }, { F: 9, N: 5, X: 7 }]); }
  { const m = createModel().open([blk('U', 1, 1, 0), blk('B', 1, 2, 7)]); m.insert(blk('N', 1, 2, 2)); m.insert(blk('X', 1, 2, 4)); m.show('U', 1); m.show('X', 2);
    // found by the independent review of 989243c: N and X stand in the gaps over B; X (two temporary rows) carried up and swapped with N,
    // which U's temporary row holds on the screen through column 1, so in column 2 it has slack and its gap above grows by the rows its
    // stack keeps, not by the step: those too are less the carried block's temporary rows. N lands right under X, 6, and stays right under
    // it when the temporary rows end; X stands canonically at 3, where column 2, with no temporary row above it, holds the row it was put at
    run('O-21: a standing neighbour with slack in one column lands right under the carried block, and stays there when the temporary rows end', m,
      T(m, { X: { y: 3 }, N: { y: 6 } }, { steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['X', 2]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('U', 0); m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 10, N: 6, U: 0, X: 3 }, { B: 8, N: 4, U: 0, X: 3 }, { B: 8, N: 4, U: 0, X: 3 }]); }
  { const m = createModel().open([blk('X', 1, 1, 0), blk('N', 1, 2, 4, 2), blk('E', 2, 2, 8), blk('B', 1, 2, 12)]); m.show('X', 1);
    // the boundary of O-21: going down, a wide N moves up by X's 2 rows on the screen; in column 2, which X does not come into, the row of
    // X's temporary push that N moves up through stays its own rows under it, as in any move (rule 1, O-22), so E and B keep their rows on
    // the screen and keep them when X's temporary row ends; N lands right over X
    run('O-21: going down, a wide neighbour; what it moves up through in a column the carried block does not come into stays its own rows', m,
      T(m, { X: { y: 5 }, N: { y: 3 } }, { steps: [[['X'], 3], [['N'], -2], [['X'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 13, E: 9, N: 3, X: 5 }, { B: 13, E: 9, N: 3, X: 5 }, { B: 13, E: 9, N: 3, X: 5 }]); }
  { const m = createModel().open([blk('Q', 1, 2, 0), blk('X', 1, 2, 6), blk('B', 1, 2, 10)]); m.show('Q', 1);
    // O-22 (decided 2026-11-09): Q has a temporary row; in one RELINK Q is narrowed out of column 2 (as P-ASIDE's press would) and X is
    // carried up 2 rows on the screen, 7 to 5. Rule 2 comes before rule 1, so in column 2 X no longer has Q's temporary row above it and
    // moves up through a row of slack, which by rule 1 stays its own rows under it: X goes canonically from 6 to 5 only, and B from 10
    // to 11, and when Q's temporary row ends X stays at 5 and B at 11, where they were seen. One RELINK equals the narrowing first and
    // the carry after it as two RELINKs; the carry first and the narrowing after it would leave them canonically at 4 and 10. §2.1
    // promises no trace only for a temporary height that starts and ends with no move between
    run('O-22: a narrowing of a block with a temporary row and a move under it in one RELINK: X and B stay where they were seen when it ends', m,
      T(m, { Q: { c1: 1 }, X: { y: 5 } }, { steps: [[['X'], -2]], carried: 'X', leave: [['Q', 2, 'narrow']] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('Q', 0); return [...r, m.rows()]; },
      [{ B: 11, Q: 0, X: 5 }, { B: 11, Q: 0, X: 5 }, { B: 11, Q: 0, X: 5 }]); }
  return out;
}

/** [name, the declaration's errors, the error it must contain, or null when it must be accepted]: what declare.mjs must refuse. */
export function declarationCases() {
  const base = { b3: { c0: 1, c1: 3, y: 0, h: 1, e: 0 }, b1: { c0: 3, c1: 3, y: 4, h: 1, e: 0 }, a: { c0: 5, c1: 5, y: 0, h: 1, e: 0 } };
  const D = (after, x = {}) => checkDeclaration(base, { after: { ...base, ...after }, steps: [], leave: [], enter: [], pass: [], carried: null, ...x });
  const swapAfter = { b1: { ...base.b1, y: 3 }, b3: { ...base.b3, y: 4 } }, swapSteps = [[['b1'], -1], [['b3'], 4]];
  return [
    ['a pass that changes no order is refused (nothing moved, b3 declared to pass in column 3)', D({}, { carried: 'b3', pass: [['b3', 3]] }), 'changes its order with no block there'],
    ['a pass the swap makes is accepted', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }), null],
    ['a change of order with no declared pass is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'] }), 'with no declared pass'],
    ['a pass outside a swap is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', pass: [['b3', 3]] }), 'only a block of a swap'],
    ['a pass by a block outside the swap is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3], ['a', 5]] }), 'only a block of a swap'],
    ['a swap whose first block is not the carried one is refused', D(swapAfter, { steps: swapSteps, carried: 'b1', swap: ['b3', 'b1'], pass: [['b3', 3]] }), 'not the carried one'],
    ['leaving as carried away is the carried block\'s only', D({ b1: { ...base.b1, c0: 4, c1: 4 } }, { leave: [['b1', 3, 'away']], enter: [['b1', 4, 'self']] }), 'only the carried block leaves as carried away'],
    ['coming in where it is put is the carried or a created block\'s only', D({ b1: { ...base.b1, c1: 4 } }, { enter: [['b1', 4, 'put']] }), 'only the carried block or a created one'],
    ['coming back by its canonical row is an undo\'s only', D({ b1: { ...base.b1, c1: 4 } }, { enter: [['b1', 4, 'back']] }), 'only an undo'],
    ['a leave the geometry does not show is refused', D({}, { leave: [['b1', 3, 'narrow']] }), 'is not in the geometry'],
    ['an entry not declared is refused', D({ b1: { ...base.b1, c1: 4 } }), 'not declared'],
    ['a swap away from the rows §5.1b gives (the neighbour at the carried block\'s first row) is refused', D({ b1: { ...base.b1, y: 0 }, b3: { ...base.b3, y: 1 } }, { steps: [[['b1'], -4], [['b3'], 1]], carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }), 'not at the rows the swap gives'],
    ['the swap\'s neighbour declared to pass the carried block is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3], ['b1', 3]] }), 'the carried block passes it'],
    ['a swap with no exchange of order is refused', D({ b3: { ...base.b3, y: 2 } }, { steps: [[['b3'], 2]], carried: 'b3', swap: ['b3', 'b1'] }), 'not exchanged'],
    ['the carried block leaving as narrowed is refused', D({ b3: { ...base.b3, c1: 2 } }, { carried: 'b3', leave: [['b3', 3, 'narrow']] }), 'leaves every column it leaves as carried away'],
    ['an undo\'s carry back coming in where it is put is refused', D({ b3: { ...base.b3, c1: 4, y: 0 } }, { carried: 'b3', canonical: true, leave: [[ 'b3', 1, 'away'], ['b3', 2, 'away'], ['b3', 3, 'away']], enter: [['b3', 1, 'back'], ['b3', 2, 'back'], ['b3', 3, 'back'], ['b3', 4, 'put']] }), 'comes back by its canonical row'],
    ['a step of a block after does not hold is refused', checkDeclaration(base, { after: { b3: base.b3, a: base.a }, steps: [[['b1'], 1]], leave: [], enter: [], pass: [], carried: null }), 'which after does not hold'],
    ['two blocks on one cell in after are refused', D({ a: { ...base.a, c0: 3, c1: 3, y: 4 } }, { leave: [['a', 5, 'narrow']], enter: [['a', 3, 'self']] }), 'overlap in after'],
    ['a push declared after the move that makes it, which replayed carries one block past another, is refused', D({ b3: { ...base.b3, y: 7 }, b1: { ...base.b1, y: 8 } }, { steps: [[['b3'], 7], [['b1'], 4]], carried: 'b3' }), 'carries b3 past b1'],
    ['a pass by the carried block outside a swap with no fallback declared is refused', D({ b3: { ...base.b3, y: 5 } }, { steps: [[['b3'], 5]], carried: 'b3', pass: [['b3', 3]] }), 'only a block of a swap'],
    ['the same pass under the fallback of P-UP off is accepted', D({ b3: { ...base.b3, y: 5 } }, { steps: [[['b3'], 5]], carried: 'b3', fallback: 'P-UP', pass: [['b3', 3]] }), null],
    ['an undo carrying a block back past another needs no pass: it leaves its columns and comes back into them', checkDeclaration({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 7, yc: 7, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 0, h: 1, e: 0 } }, steps: [], carried: 'A', canonical: true, leave: [['A', 1, 'away']], enter: [['A', 1, 'back']], pass: [] }), null],
    ['a deleted block made again by an undo coming in where it is put is refused', checkDeclaration({ U: { c0: 1, c1: 1, y: 0, h: 1, e: 2 } }, { after: { U: { c0: 1, c1: 1, y: 0, h: 1, e: 2 }, X: { c0: 1, c1: 2, y: 4, yc: 2, h: 1, e: 0 } }, steps: [], carried: 'X', canonical: true, leave: [], enter: [['X', 1, 'put'], ['X', 2, 'put']], pass: [] }), 'comes back by its canonical row'],
    ['a height changed in columns far away does not turn off the check of the steps here', checkDeclaration({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 }, Z: { c0: 20, c1: 20, y: 0, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 7, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 8, h: 1, e: 0 }, Z: { c0: 20, c1: 20, y: 0, h: 2, e: 0 } }, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'carries A past B'],
    ['a block under one that grew starts from the row FOLLOW gives, which the transition states', checkDeclaration({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 2, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 0, h: 3, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 } }, start: { A: 0, B: 4 }, steps: [], carried: null, leave: [], enter: [], pass: [] }), null],
    ['the same with a step from a start that is not FOLLOW\'s, which does not add up, is refused', checkDeclaration({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 2, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 0, h: 3, e: 0 }, B: { c0: 1, c1: 1, y: 6, h: 1, e: 0 } }, start: { A: 0, B: 4 }, steps: [[['B'], 4]], carried: null, leave: [], enter: [], pass: [] }), 'add up to 4 rows'],
    ['the same push as one step per common part is accepted', D({ b3: { ...base.b3, y: 7 }, b1: { ...base.b1, y: 8 } }, { steps: [[['b3'], 3], [['b3', 'b1'], 4]], carried: 'b3' }), null],
    (() => { // the review of 989243c: U grows from 1 row to 2, FOLLOW starts A at 4 and B at 8; a wrong split, A +7 and B +4, with no start
      const b = (y, h = 1) => ({ c0: 1, c1: 1, y, h, e: 0 }), base = { U: b(0), A: b(3), B: b(7) }, after = { U: b(0, 2), A: b(11), B: b(12) };
      return ['a change of height with no start for the blocks it reaches is refused: the steps could not be checked',
        checkDeclaration(base, { after, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'gives no start for it']; })(),
    (() => {
      const b = (y, h = 1) => ({ c0: 1, c1: 1, y, h, e: 0 }), base = { U: b(0), A: b(3), B: b(7) }, after = { U: b(0, 2), A: b(11), B: b(12) };
      return ['the same with its start: the wrong split carries A through B and is refused',
        checkDeclaration(base, { after, start: { U: 0, A: 4, B: 8 }, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'carries A past B']; })(),
  ];
}

/** [name, the landing law's failure or null, whether it must fail]: the law excuses a block lower than its target only where a block that
 *  came in by itself is shown to push it (laws.mjs). */
export function landingCases() {
  const out = [];
  // the review of 989243c: the swap of the standing neighbour with, in the same RELINK, S widened by itself into column 2 over it, a free
  // cell, with no temporary row: S pushes nothing, so a neighbour a row lower than the swap put it must fail, even under S (the rows are
  // those the model gave before the fix)
  { const T = { after: { N: { c0: 1, c1: 2, y: 6, h: 1, e: 0 }, X: { c0: 1, c1: 2, y: 3, h: 1, e: 2 } }, steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', enter: [['S', 2, 'self']] };
    const wrong = { N: 7, X: 3 };
    out.push(['a block a row lower than its target under a block that came in by itself and pushes nothing fails the landing law',
      landing(T, wrong, { withoutSelf: () => wrong, unshownSelf: () => wrong }), true]); }
  // the same case on the model as it is: the neighbour lands where the swap put it, and the law passes
  { const blocks = [blk('U', 1, 1, 0), blk('B', 1, 2, 7), blk('N', 1, 2, 2), blk('X', 1, 2, 4), blk('S', 3, 3, 0)], ins = ['N', 'X'], temps = [['U', 1], ['X', 2]];
    const a = frames(build({}, blocks, ins, temps)); a.X = { ...a.X, y: 3 }; a.N = { ...a.N, y: 6 }; a.S = { ...a.S, c0: 2 };
    const near = { after: a, steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['X', 2]], leave: [], enter: [['S', 2, 'self']] };
    out.push(['the same swap with S widened into column 2 on the model: every law holds', runCase({ opts: {}, blocks, ins, temps, near, far: null }), false]); }
  // seed 11225: a block that came in by itself pushes, by its temporary row, a block through another: excused, since with its temporary
  // rows ended the moved blocks stand where SETTLE put them
  { const blocks = [blk('a0', 4, 6, 11, 3), blk('a1', 3, 6, 18, 3), blk('a2', 0, 3, 10, 3), blk('a3', 2, 5, 4, 3)], temps = [['a0', 2], ['a3', 1]], opts = { gap8: false };
    const a = frames(build(opts, blocks, [], temps)); a.a0 = { ...a.a0, y: 8 }; a.a1 = { ...a.a1, y: 13 }; a.a2 = { ...a.a2, y: 10 }; a.a3 = { ...a.a3, c0: 1 };
    const near = { after: a, steps: [[['a1'], -4], [['a1', 'a0'], -3], [['a1', 'a0', 'a2'], -1]], carried: 'a1', leave: [], enter: [['a3', 1, 'self']], pass: [] };
    out.push(['seed 11225: a push by the temporary row of a block that came in by itself, through a block it pushes, is excused', runCase({ opts, blocks, ins: [], temps, near, far: null }), false]); }
  return out;
}
