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

/** [name, got, want, the declaration's errors] for each case; on `make`, the model's factory or one with its API (the engine's driver). A
 *  transition the engine refuses gives 'refused: …' as what it got. */
export function transitionCases(make = createModel) {
  const out = [], run = (name, m, t, got, want) => { const errs = checkDeclaration(frames(m), t);
    let refused = null; try { m.relink(t); } catch (e) { refused = e.message; } out.push([name, refused ? 'refused: ' + refused : got(m), want, errs]); };
  { const m = make().open([blk('X', 1, 1, 1), blk('Y', 1, 2, 4)]);
    run('X carried past Y while Y widens into column 3 by itself: Y stays, its reference not pushed', m,
      T(m, { X: { y: 10 }, Y: { c1: 3 } }, { steps: [[['X'], 9]], carried: 'X', pass: [['X', 1]], enter: [['Y', 3, 'self']] }),
      (m) => [m.rows(), m.stack('Y', 3)], [{ X: 10, Y: 4 }, 'top | _4 |']); }
  { const m = make().open([blk('U', 1, 1, 0), blk('A', 1, 1, 3), blk('D', 1, 1, 6)]);
    // D was an anchor in column 1 and comes back as one (the owner, 2026-11-10): A now stands under D's stack
    run('D moved up past A comes in at its target, in A\'s gap, as the anchor it was', m, T(m, { D: { y: 1 } }, { steps: [[['D'], -5]], pass: [['D', 1]] }),
      (m) => [m.rows(), m.stack('A', 1)], [{ A: 3, D: 1, U: 0 }, 'D | U1 |']); }
  { const m = make().open([blk('X', 1, 1, 1), blk('Y', 1, 1, 4)]);
    run('X moved down past Y while widening into column 2: its own reference, row 10', m,
      T(m, { X: { y: 10, c1: 2 } }, { steps: [[['X'], 9]], pass: [['X', 1]], enter: [['X', 2, 'self']] }),
      (m) => [m.rows(), m.stack('X', 2)], [{ X: 10, Y: 4 }, 'top | _10 |']); }
  { const m = make().open([blk('X', 1, 1, 6), blk('Y', 1, 1, 2)]);
    run('X moved up past Y while widening into column 2: row 0, above Y', m,
      T(m, { X: { y: 0, c1: 2 } }, { steps: [[['X'], -6]], pass: [['X', 1]], enter: [['X', 2, 'self']] }),
      (m) => [m.rows(), m.stack('X', 2)], [{ X: 0, Y: 2 }, 'top | · |']); }
  { const m = make().open([blk('X', 1, 1, 1), blk('Y', 1, 2, 4), blk('Z', 2, 2, 7)]);
    run('X passes Y in column 1 and Y passes Z in column 2, Y widening into column 3: X does not push Y', m,
      T(m, { X: { y: 10 }, Y: { y: 8, c1: 3 } }, { steps: [[['X'], 9], [['Y'], 4]], pass: [['X', 1], ['Y', 2]], enter: [['Y', 3, 'self']] }),
      (m) => [m.rows(), m.stack('Y', 3)], [{ X: 10, Y: 8, Z: 7 }, 'top | _8 |']); }
  { const m = make().open([blk('T', 3, 4, 2), blk('A', 4, 5, 4), blk('W', 4, 4, 14)]); m.show('T', 2);
    run('the temporary rows of a block that passed another are not made canonical in a column a block comes into by itself', m,
      T(m, { T: { y: 11 }, A: { y: 7 }, W: { c1: 5 } }, { steps: [[['T'], 9], [['A'], 1]], pass: [['T', 4]], enter: [['W', 5, 'self']] }),
      (m) => { const r = [m.rows(), m.rows('canonical'), m.stack('W', 5)]; m.show('T', 0); return [...r, m.rows()]; },
      [{ A: 7, T: 11, W: 18 }, { A: 7, T: 11, W: 16 }, 'A | A8 |', { A: 7, T: 11, W: 16 }]); }
  { const m = make().open([blk('B', 1, 2, 1), blk('D', 1, 2, 4)]);
    run('D moved up past B while leaving one of their two columns, B moved down and widening: no cycle', m,
      T(m, { B: { y: 5, c1: 3 }, D: { y: 0, c0: 2 } }, { steps: [[['D'], -4], [['B'], 4]], pass: [['D', 2]], leave: [['D', 1, 'narrow']], enter: [['B', 3, 'self']] }),
      (m) => [m.rows(), m.stack('B', 3)], [{ B: 5, D: 0 }, 'top | _5 |']); }
  for (const far of [false, true]) {
    const m = make().open([blk('A', 1, 1, 0), blk('B', 1, 2, 11), blk('P', 10, 10, 1), blk('Q', 10, 10, 4)]); m.height('A', 2);
    run(`B moved down a row and shifted from columns 1–2 to 2–3, ${far ? 'P passing Q in column 10 in the same RELINK' : 'nothing else'}: B's memory, narrowed back to column 2`, m,
      T(m, far ? { B: { y: 13, c0: 2, c1: 3 }, P: { y: 10 } } : { B: { y: 13, c0: 2, c1: 3 } }, { steps: far ? [[['B'], 1], [['P'], 9]] : [[['B'], 1]], pass: far ? [['P', 10]] : [], leave: [['B', 1, 'narrow']], enter: [['B', 3, 'self']] }),
      (m) => { const st = m.stack('B', 2); m.width('B', 2, 2); return [st, m.rows().B]; }, ['top | _11 |', 11]);
  }
  { const m = make().open([blk('C', 1, 1, 4), blk('N', 1, 2, 8), blk('A', 2, 2, 6)]);
    run('a swap with a wide neighbour (LAYOUT-RULES §5.1b): C pinned right against N at row 7, N takes row 7 and C stands right under it; N, moved up by C\'s height, stays under A', m,
      T(m, { N: { y: 7 }, C: { y: 8 } }, { steps: [[['C'], 3], [['N'], -1], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1]] }),
      (m) => m.rows(), { A: 6, C: 8, N: 7 }); }
  { const m = make().open([blk('C', 1, 1, 0, 3), blk('N', 1, 2, 5), blk('A', 2, 2, 4)]);
    run('a swap with a wide neighbour shorter than the carried block: N, taking C\'s pinned row 2, passes A in column 2, which C does not cover', m,
      T(m, { N: { y: 2 }, C: { y: 3 } }, { steps: [[['C'], 2], [['N'], -3], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1], ['N', 2]] }),
      (m) => m.rows(), { A: 4, C: 3, N: 2 }); }
  { const m = make().open([blk('U', 1, 1, 0), blk('X', 1, 1, 2), blk('N', 1, 1, 5), blk('B', 1, 1, 9)]);
    run('blocks that swap keep their own rows (GAP.2, G4): X carried down and swapped with N, N\'s three rows under it go with N when it is deleted', m,
      T(m, { N: { y: 4 }, X: { y: 5 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = m.rows(), st = m.stack('B', 1); m.remove('N'); return [r, st, m.rows()]; }, [{ B: 9, N: 4, U: 0, X: 5 }, 'X | N3 |', { B: 5, U: 0, X: 4 }]); }
  // a carry sideways that keeps some columns leaves the others as a narrowing does (the owner, 2026-11-10, G8)
  { const m = make().open([blk('A', 1, 3, 0, 2), blk('B', 1, 1, 4)]);
    run('a wide block carried one column right: the block under it in the column it left stays, as under a narrowing', m,
      T(m, { A: { c0: 2, c1: 4 } }, { carried: 'A', leave: [['A', 1, 'narrow']], enter: [['A', 4, 'put']] }),
      (m) => m.rows(), { A: 0, B: 4 }); }
  // a block of a swap keeps its status (the owner, 2026-11-10): an anchor comes back as an anchor, so taking it away closes its place as
  // in a document (G2) and leaves each block its own gaps (G4)
  { const m = make().open([blk('A', 1, 1, 0), blk('B', 1, 1, 1), blk('C', 1, 1, 2)]);
    run('A, B and C touching, A swapped under B and deleted: C closes up to row 1, as with no swap', m,
      T(m, { A: { y: 1 }, B: { y: 0 } }, { steps: [[['B'], -1], [['A'], 1]], carried: 'A', swap: ['A', 'B'], pass: [['A', 1]] }),
      (m) => { const r = m.rows(); m.remove('A'); return [r, m.rows()]; }, [{ A: 1, B: 0, C: 2 }, { B: 0, C: 1 }]); }
  { const m = make().open([blk('U', 1, 1, 0), blk('X', 1, 1, 2), blk('N', 1, 1, 5), blk('B', 1, 1, 9)]);
    run('X swapped under N and deleted: N keeps its own three rows over B', m,
      T(m, { N: { y: 4 }, X: { y: 5 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { m.remove('X'); return m.rows(); }, { B: 8, N: 4, U: 0 }); }
  { const m = make().open([blk('b3', 1, 3, 0), blk('b1', 3, 3, 4)]);
    run('a plain carry of b3 from row 0 to 7 past b1: b1 keeps its side and is pushed down to row 8 (DRAG.B2, P-DOWN), b3 alone over the gap and then with b1', m,
      T(m, { b3: { y: 7 }, b1: { y: 8 } }, { steps: [[['b3'], 3], [['b3', 'b1'], 4]], carried: 'b3' }),
      (m) => m.rows(), { b1: 8, b3: 7 }); }
  { const m = make().open([blk('b3', 1, 3, 0), blk('b1', 3, 3, 4)]);
    run('the same carry with the hold or Shift: b3 pinned on b1 at row 3, they swap, b1 takes row 3 and b3 stands right under it', m,
      T(m, { b1: { y: 3 }, b3: { y: 4 } }, { steps: [[['b1'], -1], [['b3'], 4]], carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }),
      (m) => m.rows(), { b1: 3, b3: 4 });
    run('then b3 goes on to row 7 from the new start, b1 staying at row 3', m, T(m, { b3: { y: 7 } }, { steps: [[['b3'], 3]], carried: 'b3' }),
      (m) => m.rows(), { b1: 3, b3: 7 }); }
  { const m = make().open([blk('C', 1, 1, 4, 4), blk('N', 1, 2, 8), blk('A', 2, 2, 6)]);
    run('the same wide neighbour under a carried block 4 rows tall: C already right against N, N takes row 4 and passes A in column 2, C at 5', m,
      T(m, { N: { y: 4 }, C: { y: 5 } }, { steps: [[['N'], -4], [['C'], 1]], carried: 'C', swap: ['C', 'N'], pass: [['C', 1], ['N', 2]] }),
      (m) => m.rows(), { A: 6, C: 5, N: 4 }); }
  { const m = make().open([blk('A', 1, 1, 0), blk('B', 1, 1, 4)]);
    run('an undo carrying A back to its old cell, row 7, under B: A leaves its column and comes back by its canonical row, B rising into its place', m,
      T(m, { A: { y: 7, yc: 7 }, B: { y: 0 } }, { carried: 'A', canonical: true, leave: [['A', 1, 'away']], enter: [['A', 1, 'back']] }),
      (m) => [m.rows(), m.rows('canonical')], [{ A: 7, B: 0 }, { A: 7, B: 0 }]); }
  { const m = make().open([blk('U', 1, 1, 0)]); m.show('U', 2);
    run('an undo making a deleted X again at its old cell, canonical row 2, under U with two temporary rows: on the screen at 4, canonically 2, and 2 when they end', m,
      T(m, { X: { c0: 1, c1: 2, y: 4, yc: 2, h: 1, e: 0 } }, { carried: 'X', canonical: true, enter: [['X', 1, 'back'], ['X', 2, 'back']] }),
      (m) => { const r = [m.rows().X, m.rows('canonical').X]; m.show('U', 0); return [...r, m.rows().X]; }, [4, 2, 2]); }
  { const m = make().open([blk('A', 1, 1, 0), blk('B', 1, 1, 2)]);
    run('a real height: A grows from 1 row to 3, B under it follows with its gap to row 4 (FOLLOW, no move)', m,
      T(m, { A: { h: 3 }, B: { y: 4 } }, { start: { A: 0, B: 4 } }),
      (m) => m.rows(), { A: 0, B: 4 }); }
  { const m = make().open([blk('Y', 1, 1, 3), blk('X', 1, 1, 6)]);
    run('P-UP off: X carried up into Y, which is pushed down under it instead (the fallback of §1.6): X passes Y, Y stays and moves', m,
      T(m, { X: { y: 3 }, Y: { y: 4 } }, { steps: [[['Y'], 1], [['X'], -3]], carried: 'X', fallback: 'P-UP', pass: [['X', 1]] }),
      (m) => m.rows(), { X: 3, Y: 4 }); }
  { const m = make({ gap8: false }).open([blk('a0', 4, 6, 11, 3), blk('a1', 3, 6, 18, 3), blk('a2', 0, 3, 10, 3), blk('a3', 2, 5, 4, 3)]); m.show('a0', 2); m.show('a3', 1);
    // found by the laws (seed 11225, GEN_VERSION 6): a1 carried up pushes a0 and a2 up (P-UP) while a3 widens into column 1 by itself; a3
    // comes in there at its reference, over a2, and its temporary row pushes a2 on the screen, a row under where SETTLE put it, and a2
    // pushes a1 in column 3: both stand canonically where SETTLE put them, and there when the temporary rows end (§2.1)
    run('a block that came in by itself pushes on the screen, through a block it pushes, a block the steps moved; canonically both land', m,
      T(m, { a0: { y: 8 }, a1: { y: 13 }, a2: { y: 10 }, a3: { c0: 1 } }, { steps: [[['a1'], -4], [['a1', 'a0'], -3], [['a1', 'a0', 'a2'], -1]], carried: 'a1', enter: [['a3', 1, 'self']] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('a0', 0); m.show('a3', 0); return [...r, m.rows()]; },
      [{ a0: 8, a1: 14, a2: 11, a3: 4 }, { a0: 8, a1: 13, a2: 10, a3: 4 }, { a0: 8, a1: 13, a2: 10, a3: 4 }]); }
  // the internal review of 62433e9 (Fable): a pass frees nothing, a step's slack is measured at the rows the steps give, a block put at its
  // row writes no temporary push of another block
  { const m = make().open([blk('N', 0, 0, 0), blk('B', 0, 0, 8)]); m.insert(blk('X', 0, 0, 3)); m.height('X', 3);
    // X stands in N's gap with a lend of one row and grew to three, pushing B to 10; swapped up with N, its place stays as rows, its body
    run('a standing carried block that grew passes its neighbour: its place stays, its whole body, and the block under it does not move', m,
      T(m, { X: { y: 0 }, N: { y: 3 } }, { steps: [[['X'], -2], [['X'], -1], [['N'], 3]], carried: 'X', swap: ['X', 'N'], pass: [['X', 0]] }),
      (m) => [m.rows(), m.rows('canonical')], [{ B: 10, N: 3, X: 0 }, { B: 10, N: 3, X: 0 }]); }
  { const steps = [[[['X'], -2], [['X'], -4], [['N'], 1]], [[['X'], -6], [['N'], 1]]];
    for (const st of steps) {
      const m = make().open([blk('N', 1, 1, 0), blk('X', 0, 1, 3), blk('D', 0, 0, 6)]); m.height('N', 4);
      // X, wider than N and held at 6 by N in column 1, swapped up; out of column 1 after its first step, it stands between the steps at the
      // row they gave it, so its slack in column 0 is the same however the move is cut, and D, which nothing moves, stays at 9
      run(`a carried block that passed out of one of its columns keeps, between its steps, the row they give it: ${st.length} steps, D stays`, m,
        T(m, { X: { y: 0 }, N: { y: 1 } }, { steps: st, carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
        (m) => [m.rows(), m.rows('canonical')], [{ D: 9, N: 1, X: 0 }, { D: 9, N: 1, X: 0 }]);
    } }
  { const m = make({ gap52: false }).open([blk('N', 0, 0, 0), blk('X', 0, 0, 3), blk('A', 0, 1, 5)]); m.insert(blk('B', 0, 0, 4));
    // GAP.5.2 off: X passes N while A, the anchor under X's gap, is narrowed off column 0 in the same RELINK; the pass is made after A's
    // departure, so A's stack losing its rows does not take what the pass keeps: B stays at 4, as with the narrowing first
    run('GAP.5.2 off: a pass and the anchor under it leaving in one RELINK keep what the pass keeps', m,
      T(m, { X: { y: 0 }, N: { y: 1 }, A: { c0: 1 } }, { steps: [[['X'], -2], [['X'], -1], [['N'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 0]], leave: [['A', 0, 'narrow']] }),
      (m) => m.rows(), { A: 5, B: 4, N: 1, X: 0 }); }
  { const m = make({ gap8: false }).open([blk('a1', 5, 5, 5), blk('a3', 5, 6, 16, 3), blk('a4', 6, 7, 11, 2)]); m.show('a1', 3); m.show('a4', 3);
    // seed 503898: a4 (three temporary rows) carried down and one column left, pushing a3; in column 5 it comes in under a1's temporary
    // rows, while column 6 holds it canonically at 16: the rows under it there keep a3 at its canonical row, so a3 lands where SETTLE put it
    run('a block put under another block\'s temporary rows, held by its other column: the block it pushed lands where SETTLE put it', m,
      T(m, { a4: { c0: 5, c1: 6, y: 16 }, a3: { y: 21 } }, { steps: [[['a4'], 3], [['a4', 'a3'], 2]], carried: 'a4', leave: [['a4', 7, 'narrow']], enter: [['a4', 5, 'put']] }),
      (m) => [m.rows(), m.rows('canonical')], [{ a1: 5, a3: 21, a4: 16 }, { a1: 5, a3: 18, a4: 16 }]); }
  { const m = make().open([blk('A', 0, 0, 0), blk('X', 1, 2, 0), blk('B', 0, 1, 8)]); m.show('A', 2); m.show('X', 2);
    // X carried into column 0 under A's temporary rows, column 1 holding it at 5: B, which nothing moves, keeps its canonical row 8 and is
    // pushed on the screen by X's temporary rows only, as before
    run('a block put under another block\'s temporary rows writes no push of them under it: B keeps its canonical row', m,
      T(m, { X: { c0: 0, c1: 1, y: 5 } }, { steps: [[['X'], 5]], carried: 'X', leave: [['X', 2, 'narrow']], enter: [['X', 0, 'put']] }),
      (m) => [m.rows(), m.rows('canonical')], [{ A: 0, B: 10, X: 5 }, { A: 0, B: 8, X: 5 }]); }
  { const m = make().open([blk('N', 1, 2, 0, 2), blk('X', 1, 1, 5), blk('E', 2, 2, 8)]); m.show('X', 1);
    // going up with a wide N (the owner, 2026-11-10): in column 2, which X does not come into, both gaps round N change by X's canonical
    // height, so E keeps its canonical row 8, is pushed to 9 on the screen while X's temporary row lasts, and is back at 8 when it ends
    run('O-21 going up, a wide neighbour: a block under it in a column of its own keeps its canonical row', m,
      T(m, { X: { y: 0 }, N: { y: 2 } }, { steps: [[['X'], -3], [['X'], -2], [['N'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ E: 9, N: 2, X: 0 }, { E: 8, N: 1, X: 0 }, { E: 8, N: 1, X: 0 }]); }
  // the independent review of b3351f4
  { const m = make().open([blk('A', 0, 0, 0), blk('H', 1, 1, 0), blk('X', 0, 1, 4), blk('N', 0, 0, 8)]); m.height('H', 3); m.show('A', 2);
    // X, held at 6 by H's growth in column 1, has slack in column 0 canonically that A's temporary rows take on the screen; swapped down
    // with N, its pass keeps the smaller of its two slacks, none, so A's temporary rows do not push N past the swap: N lands at 9, X at 10
    run('a pass keeps the smaller of its canonical and displayed slack: under another block\'s temporary rows the swap lands', m,
      T(m, { X: { y: 10 }, N: { y: 9 } }, { steps: [[['X'], 3], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 0]] }),
      (m) => [m.rows(), m.rows('canonical')], [{ A: 0, H: 0, N: 9, X: 10 }, { A: 0, H: 0, N: 7, X: 10 }]); }
  { const res = [];
    for (const st of [[[['X'], -4], [['X'], -4], [['N'], 1]], [[['X'], -8], [['N'], 1]]]) {
      const m = make().open([blk('U', 0, 0, 0), blk('N', 1, 1, 3), blk('X', 0, 1, 8), blk('D', 0, 0, 13)]); m.height('N', 4);
      const a = frames(m); a.X = { ...a.X, y: 3 }; a.N = { ...a.N, y: 4 };
      m.relink({ after: a, steps: st, carried: 'X', swap: ['X', 'N'], pass: [['X', 1]], leave: [], enter: [] });
      const r = [m.stack('D', 0)]; m.insert(blk('Z', 0, 0, 6)); m.remove('X'); r.push(m.rows()); res.push(r);
    }
    // X pinned under N (4 rows up) and swapped (4 more) as two steps, or moved 8 in one: in column 0 the slack it used comes first under
    // it, then U's rows it left, in order, either way; a block put in that gap and X taken away leave D where they leave it either way
    out.push(['a move cut into steps gives the owners one step gives, and the same after an insertion and a deletion', res[0], res[1], []]); }
  // O-21 (decided 2026-11-09): a swap's neighbour moves by the carried block's height on the screen, its temporary rows included, and
  // lands exactly where the swap put it; that displacement is structural and writes none of the carried block's temporary rows, so when
  // they end the neighbour follows the carried block
  { const m = make().open([blk('a3', 1, 4, 3, 3), blk('a1', 1, 1, 13, 2)]); m.show('a1', 1); m.show('a3', 1);
    // a1 (one temporary row) carried up and swapped with a3 (one too): a3 moves down by a1's 3 rows on the screen, to 6, right under a1;
    // canonically it stands right under a1's 2 rows, at 5, and stays there when the temporary rows end
    run('O-21: a swap of blocks with temporary heights lands the neighbour where the swap put it: 6 on the screen, 5 canonically, 5 when they end', m,
      T(m, { a1: { y: 3 }, a3: { y: 6 } }, { steps: [[['a1'], -7], [['a1'], -4], [['a3'], 3]], carried: 'a1', swap: ['a1', 'a3'], pass: [['a1', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('a1', 0); m.show('a3', 0); return [...r, m.rows()]; },
      [{ a1: 3, a3: 6 }, { a1: 3, a3: 5 }, { a1: 3, a3: 5 }]); }
  { const m = make().open([blk('N', 1, 2, 0, 2), blk('X', 1, 1, 5), blk('B', 1, 2, 9)]); m.show('X', 1);
    // going up: X (one temporary row) takes N's top row, N moves down by X's 2 rows on the screen; B, which X's temporary row pushed at
    // its old place, keeps its row on the screen, now pushed through N; when the temporary row ends N and B follow X
    run('O-21: going up, the neighbour right under the carried block, and the block under the carried block\'s old place kept on the screen', m,
      T(m, { X: { y: 0 }, N: { y: 2 } }, { steps: [[['X'], -3], [['X'], -2], [['N'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 10, N: 2, X: 0 }, { B: 9, N: 1, X: 0 }, { B: 9, N: 1, X: 0 }]); }
  { const m = make().open([blk('X', 1, 1, 0), blk('N', 1, 1, 4, 2), blk('F', 1, 1, 7)]); m.show('X', 1);
    // going down after a push: X (one temporary row) pushes N by 2 and F follows (P-DOWN), N is pinned at 7 and moves up by X's 2 rows,
    // X stands right under it; F stays where the push put it, 10, and follows X when its temporary row ends
    run('O-21: going down after a push, the neighbour and what followed it land where the swap put them', m,
      T(m, { X: { y: 7 }, N: { y: 5 }, F: { y: 10 } }, { steps: [[['X'], 3], [['X', 'N', 'F'], 2], [['N'], -2], [['X'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ F: 10, N: 5, X: 7 }, { F: 9, N: 5, X: 7 }, { F: 9, N: 5, X: 7 }]); }
  { const m = make().open([blk('U', 1, 1, 0), blk('B', 1, 2, 7)]); m.insert(blk('N', 1, 2, 2)); m.insert(blk('X', 1, 2, 4)); m.show('U', 1); m.show('X', 2);
    // found by the independent review of 989243c: N and X stand in the gaps over B; X (two temporary rows) carried up and swapped with N,
    // which U's temporary row holds on the screen through column 1, so in column 2 it has slack and its gap above grows by the rows its
    // stack keeps, not by the step: those too are less the carried block's temporary rows. N lands right under X, 6, and stays right under
    // it when the temporary rows end; X stands canonically at 3, where column 2, with no temporary row above it, holds the row it was put at
    run('O-21: a standing neighbour with slack in one column lands right under the carried block, and stays there when the temporary rows end', m,
      T(m, { X: { y: 3 }, N: { y: 6 } }, { steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['X', 2]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('U', 0); m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 10, N: 6, U: 0, X: 3 }, { B: 8, N: 4, U: 0, X: 3 }, { B: 8, N: 4, U: 0, X: 3 }]); }
  { const m = make().open([blk('X', 1, 1, 0), blk('N', 1, 2, 4, 2), blk('E', 2, 2, 8), blk('B', 1, 2, 12)]); m.show('X', 1);
    // the boundary of O-21: going down, a wide N moves up by X's 2 rows on the screen; in column 2, which X does not come into, the row of
    // X's temporary push that N moves up through stays its own rows under it, as in any move (rule 1, O-22), so E and B keep their rows on
    // the screen and keep them when X's temporary row ends; N lands right over X
    run('O-21: going down, a wide neighbour; what it moves up through in a column the carried block does not come into stays its own rows', m,
      T(m, { X: { y: 5 }, N: { y: 3 } }, { steps: [[['X'], 3], [['N'], -2], [['X'], 2]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('X', 0); return [...r, m.rows()]; },
      [{ B: 13, E: 9, N: 3, X: 5 }, { B: 13, E: 9, N: 3, X: 5 }, { B: 13, E: 9, N: 3, X: 5 }]); }
  { const m = make().open([blk('Q', 1, 2, 0), blk('X', 1, 2, 6), blk('B', 1, 2, 10)]); m.show('Q', 1);
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
  // the internal review of 416e4c6 (Fable): every pass is measured on one canonical snapshot, taken after the other departures, so a block
  // that passes in several columns keeps the same place whichever column is taken first
  for (const ca of [2, 3]) {
    const m = make().open([blk('T', ca, ca, 0), blk('A', ca, ca, 7), blk('X', 2, 3, 9), blk('N', 2, 3, 12)]); m.height('A', 2); m.show('T', 2);
    // A grew and holds X at 10 in its column, where T's temporary rows push both; in the other column X has one row of slack canonically
    // and three on the screen, of which its pass keeps one: swapped down with N, N stays at 13 canonically whichever column A is in
    run(`a block that passes in two columns keeps one place whichever is taken first: A in column ${ca}`, m,
      T(m, { N: { y: 14 }, X: { y: 15 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 2], ['X', 3]] }),
      (m) => [m.rows(), m.rows('canonical')], [{ A: 9, N: 14, T: 0, X: 15 }, { A: 7, N: 13, T: 0, X: 14 }]);
  }
  for (const [pc, qc] of [[3, 4], [4, 3]]) {
    const m = make().open([blk('X', 1, 1, 0, 3), blk('P', pc, pc, 3), blk('Q', qc, qc, 3), blk('N', 1, 4, 4), blk('D', qc, qc, 7)]); m.height('P', 2);
    // P grew and pushed N to 5; X, swapped down with N, passes it in column 1, and N, moving up to 2, passes P and Q in their columns:
    // D, under Q, which nothing moves, stays at 8 whichever of the two columns comes first
    run(`the neighbour passing two blocks in its own columns: D under one of them stays, P in column ${pc}`, m,
      T(m, { N: { y: 2 }, X: { y: 3 } }, { steps: [[['X'], 2], [['N'], -3], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['N', 3], ['N', 4]] }),
      (m) => [m.rows(), m.rows('canonical')], [{ D: 8, N: 2, P: 3, Q: 3, X: 3 }, { D: 8, N: 2, P: 3, Q: 3, X: 3 }]);
  }
  // every step of rule 1 is measured at the rows the declaration gives (start, then the steps so far), whatever rule 2's departures freed,
  // so a move cut into steps gives what one step gives even when a block leaves a column in the same RELINK
  for (const steps of [[[['X'], -2]], [[['X'], -1], [['X'], -1]]]) {
    const m = make().open([blk('P', 0, 0, 0, 2), blk('Q', 0, 0, 4, 2), blk('H', 1, 1, 5), blk('X', 0, 1, 10)]); m.show('P', 2);
    // P (two temporary rows) is pressed into column 2 while X, shown at 12, is carried up 2 rows: in column 0 the two rows X moved up
    // through, P's temporary rows no longer above it, are its slack and stay its own rows under Q, cut in one step or two
    run(`a move cut into steps beside a departure gives one step's owners: ${steps.length} step${steps.length > 1 ? 's' : ''}`, m,
      T(m, { X: { y: 10 }, P: { c0: 2, c1: 2 } }, { steps, carried: 'X', leave: [['P', 0, 'narrow']], enter: [['P', 2, 'self']] }),
      (m) => { const r = [m.stack('X', 0), m.stack('X', 1)]; m.width('X', 1, 1); return [...r, m.rows()]; }, ['Q | Q2 |', 'H | H4 |', { H: 5, P: 0, Q: 4, X: 10 }]);
  }
  for (const uy of [6, 7]) {
    const m = make({ gap9: false }).open([blk('P', 0, 0, 0, 2), blk('Q', 0, 0, 4, 2), blk('U', 1, 1, uy), blk('X', 0, 1, 10)]);
    // GAP.9 off: P narrowed off column 0 takes its rows under it and Q rises to 0; X carried up 3, pushing U in column 1 or not: column 0
    // sees the same move either way and gives Q the same rows
    run(`GAP.9 off: a move cut by a push in another column gives the same owners in this one: U at ${uy}`, m,
      T(m, { X: { y: 7 }, U: { y: 6 }, P: { c0: 2, c1: 2 } }, { steps: uy === 6 ? [[['X'], -3]] : [[['X'], -2], [['X', 'U'], -1]], carried: 'X', leave: [['P', 0, 'narrow']], enter: [['P', 2, 'self']] }),
      (m) => [m.rows(), m.stack('X', 0)], [{ P: 0, Q: 0, U: 6, X: 7 }, 'Q | Q1 |']);
  }
  // the same review: each of the following pins a line no random law reached (a mutation of it survived every other test)
  { const m = make().open([blk('A', 0, 0, 1, 2), blk('X', 0, 2, 4), blk('N', 1, 2, 7)]); m.show('A', 3);
    // X, held at 7 on the screen by A's temporary rows in column 0, has 4 rows of slack in column 2 canonically and 7 on the screen; swapped
    // down with N, its pass keeps the smaller, so N's memory in column 2 holds no temporary push: narrowed to column 2, N stands at 7
    run('a pass keeps its canonical slack where the screen shows more: narrowed to that column, the neighbour stands at its canonical row', m,
      T(m, { X: { y: 10 }, N: { y: 9 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['X', 2]] }),
      (m) => { const r = [m.rows(), m.stack('N', 2)]; m.width('N', 2, 2); return [...r, m.rows('canonical')]; },
      [{ A: 1, N: 9, X: 10 }, 'top | _7 |', { A: 1, N: 7, X: 10 }]); }
  { const m = make().open([blk('H', 0, 0, 0), blk('X', 0, 1, 2), blk('N', 0, 1, 5)]); m.height('H', 3);
    // X, held at 4 by H's growth in column 0, has 2 rows of slack in column 1 in both measures; swapped down with N, its pass keeps them as
    // rows, so N's memory in column 1 is its row: narrowed to column 1, N stays at 6
    run('a pass keeps a slack both measures show: narrowed to that column, the neighbour stays', m,
      T(m, { X: { y: 7 }, N: { y: 6 } }, { steps: [[['X'], 2], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 0], ['X', 1]] }),
      (m) => { const r = [m.rows(), m.stack('N', 1)]; m.width('N', 1, 1); return [...r, m.rows()]; },
      [{ H: 0, N: 6, X: 7 }, 'top | _6 |', { H: 0, N: 6, X: 7 }]); }
  { const m = make().open([blk('A', 1, 1, 1), blk('N', 1, 1, 9)]); m.insert(blk('X', 1, 1, 4, 3));
    // X, created in N's gap, stands there; swapped up with A it comes back standing (G11: a block of a swap keeps its status), now in A's
    // stack, so deleted it gives its lend back and A and N stay, where an anchor would close its place
    run('a standing block of a swap comes back standing: deleted, it gives its rows back', m,
      T(m, { X: { y: 1 }, A: { y: 4 } }, { steps: [[['X'], -2], [['X'], -1], [['A'], 3]], carried: 'X', swap: ['X', 'A'], pass: [['X', 1]] }),
      (m) => { const r = [m.rows(), m.stack('A', 1)]; m.remove('X'); return [...r, m.rows()]; },
      [{ A: 4, N: 9, X: 1 }, 'top | _1 [X:_3] · |', { A: 4, N: 9 }]); }
  { const m = make().open([blk('S', 0, 0, 0), blk('N', 0, 1, 6)]); m.insert(blk('X', 1, 1, 2, 2)); m.show('S', 1);
    // X, created in N's gap, carried down 3 rows on the screen, the gap under it 2 rows canonically, then 2 more pushing N, which S's
    // temporary row holds on the screen through column 0: over X, the rows of the top first, then the row that is X's room (rule 1, a
    // move cut into steps); moved back up a row, X takes that row under it, so deleted it takes one row away and N, narrowed to column 1,
    // stands at 8
    run('a move down cut by a push puts the stack\'s rows first and the moved block\'s room last, over it', m,
      T(m, { X: { y: 7 }, N: { y: 9 } }, { steps: [[['X'], 3], [['X', 'N'], 2]], carried: 'X' }),
      (m) => { const r = [m.rows(), m.stack('N', 1)]; m.relink(T(m, { X: { y: 6 } }, { steps: [[['X'], -1]], carried: 'X' }));
        r.push(m.stack('N', 1)); m.remove('X'); m.width('N', 1, 1); return [...r, m.rows()]; },
      [{ N: 9, S: 0, X: 7 }, 'top | _6+X1 [X:_2] · |', 'top | _6 [X:_2] X1 |', { N: 8, S: 0 }]); }
  { const m = make().open([blk('U', 0, 0, 0), blk('H', 1, 1, 0), blk('G', 2, 2, 0), blk('N', 0, 2, 10)]); m.insert(blk('X', 0, 1, 3));
    m.height('H', 4); m.height('G', 8); m.show('U', 2);
    // X stands in N's gaps in columns 0 and 1, held at 6 by H's growth; in column 0 it has 3 rows of slack canonically and 1 on the screen,
    // U's temporary rows taking the others; G's growth holds N at 17 through column 2. Swapped down with N, X's pass keeps the smaller
    // slack in place of its lend, so U's temporary rows are not written over N there: narrowed to column 0, N stands at 11
    run('a standing block passing keeps the smaller of its two slacks: the neighbour\'s memory in that column holds no temporary push', m,
      T(m, { N: { y: 16 }, X: { y: 17 } }, { steps: [[['X'], 10], [['N'], -1], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 0], ['X', 1]] }),
      (m) => { const r = [m.rows(), m.stack('N', 0)]; m.show('U', 0); m.width('N', 0, 0); return [...r, m.rows()]; },
      [{ G: 0, H: 0, N: 16, U: 0, X: 17 }, 'U | U10 |', { G: 0, H: 0, N: 11, U: 0, X: 17 }]); }
  { const m = make().open([blk('S', 0, 0, 0), blk('N', 0, 1, 6)]); m.insert(blk('X', 1, 1, 2, 2)); m.show('S', 3);
    m.relink(T(m, { X: { y: 7 } }, { steps: [[['X'], 5]], carried: 'X' })); m.insert(blk('B', 1, 1, 6));
    // X, created in N's gap, carried down 5 rows on the screen over a gap of 2 canonically, gets 3 rows of room over it; B, created in the
    // lowest of them, stands with X's own rows above it. Swapped down with N, X's pass keeps all its rows, those above B included: B,
    // which nothing moves, stays at 6
    run('a pass keeps the passer\'s own rows above another block: that block does not move', m,
      T(m, { N: { y: 7 }, X: { y: 8 } }, { steps: [[['N'], -2], [['X'], 1]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1]] }),
      (m) => [m.rows(), m.rows('canonical')], [{ B: 6, N: 7, S: 0, X: 8 }, { B: 6, N: 7, S: 0, X: 8 }]); }
  { const m = make().open([blk('X', 0, 1, 0, 2), blk('W', 0, 0, 4)]);
    // X carried one column right, keeping column 1, leaves column 0 as a narrowing does (M9), also in R, where W's own reference is
    // measured: W, widening into column 1 in the same RELINK, comes in there at its own row, 4, so narrowed to column 1 it stays
    run('a carry sideways and a widening under it in one RELINK: the widened block\'s reference keeps its row, the carry leaving as a narrowing', m,
      T(m, { X: { c0: 1, c1: 2 }, W: { c1: 1 } }, { carried: 'X', leave: [['X', 0, 'narrow']], enter: [['X', 2, 'put'], ['W', 1, 'self']] }),
      (m) => { const r = [m.rows(), m.stack('W', 1)]; m.width('W', 1, 1); return [...r, m.rows()]; },
      [{ W: 4, X: 0 }, 'X | X2 |', { W: 4, X: 0 }]); }
  { const m = make().open([blk('S', 0, 0, 0), blk('A', 1, 1, 0), blk('Y', 2, 2, 3), blk('N', 0, 1, 12)]); m.insert(blk('X', 1, 1, 6, 2)); m.show('S', 3);
    m.relink(T(m, { X: { y: 13 } }, { steps: [[['X'], 7]], carried: 'X' })); m.show('A', 2);
    // X, created in N's gap and carried down to it on the screen, has 3 rows of room over it in column 1; Y is carried from column 2 into
    // columns 1–2 at row 5, under A's two temporary rows, column 2 holding it canonically: the rows those would push are not written under
    // it, cut from the top of the seg, next to Y, so X keeps its room, and with the temporary heights ended and X deleted N is back at 12
    run('a block put under temporary rows cuts the rows next to it, not the room of the block below', m,
      T(m, { Y: { c0: 1, c1: 2, y: 5 } }, { steps: [[['Y'], 2]], carried: 'Y', enter: [['Y', 1, 'put']] }),
      (m) => { const r = [m.rows(), m.stack('N', 1)]; m.show('A', 0); m.show('S', 0); m.remove('X'); return [...r, m.rows()]; },
      [{ A: 0, N: 15, S: 0, X: 13, Y: 5 }, 'A | A2 [Y:A1] A4+X3 [X:A2] · |', { A: 0, N: 12, S: 0, Y: 5 }]); }
  // the generator's histories (GEN_VERSION 9, seed 2003655, found on step 1b's second part, the model and the engine alike): a3 widened
  // into columns 1 and 4 and then swapped down under a4; a4, three of its rows temporary, carried one column left and down 12, pushing a3
  // to 31 on the screen, where a1's gap in column 1 holds a3 at 30 canonically. In column 2 a4 comes in over a3: the two rows that would
  // keep a3 at 30 in that column too would push it, under a4's temporary rows, to 33, past its target; a block put by hand keeps under it
  // no more than holds a block SETTLE moved at its target on the screen, so a3 lands at 31, and at 30 when the temporary rows end
  { const blocks = [blk('a1', 0, 2, 0, 3), blk('a3', 2, 3, 4, 2), blk('a4', 3, 5, 13, 3)], f = (c0, c1, y, h, e) => ({ c0, c1, y, h, e });
    const history = [{ T: { after: { a1: f(0, 2, 0, 3, 1), a4: f(3, 5, 14, 3, 3), a3: f(1, 4, 5, 2, 0) }, steps: [], leave: [], enter: [['a3', 1, 'self'], ['a3', 4, 'self']], pass: [], carried: null } },
      { T: { after: { a1: f(0, 2, 0, 3, 1), a4: f(3, 5, 13, 3, 3), a3: f(1, 4, 19, 2, 0) }, steps: [[['a3'], 7], [['a3', 'a4'], 1], [['a4'], -2], [['a3'], 6]], leave: [], enter: [], pass: [['a3', 3], ['a3', 4]], carried: 'a3', swap: ['a3', 'a4'] } }];
    const m = build({}, blocks, [], [['a1', 1], ['a4', 3]], history, make);
    run('a block put by hand over a block it pushes keeps under it no more than holds that block at its target on the screen', m,
      { after: { a1: f(0, 2, 0, 3, 1), a4: f(2, 4, 25, 3, 3), a3: f(1, 4, 31, 2, 0) }, steps: [[['a4', 'a3'], 12]], leave: [['a4', 5, 'narrow']], enter: [['a4', 2, 'put']], pass: [], carried: 'a4' },
      (m) => { const r = [m.rows(), m.rows('canonical'), m.stack('a3', 2)]; m.show('a4', 0); m.show('a1', 0); return [...r, m.rows()]; },
      [{ a1: 0, a3: 31, a4: 25 }, { a1: 0, a3: 30, a4: 25 }, 'a1 | a121 [a4:a13] · |', { a1: 0, a3: 30, a4: 25 }]); }
  // the internal review of c05fb1e: K, held at 5 by C's growth in column 2, has two rows of slack in column 1 that A's two temporary rows take
  // on the screen; narrowed off column 1, it leaves its body and that slack as rows (GAP.9), through which A's temporary rows now push D on
  // the screen, to 10. D, carried in the same RELINK, moves by its step from where the gap holds it, the push staying on the screen: one
  // RELINK gives what the narrowing and then the carry give as two (O-22), D at its moved row when A folds
  for (const d of [-1, 1]) {
    const m = make().open([blk('A', 1, 1, 0), blk('C', 2, 2, 0), blk('K', 1, 2, 3), blk('D', 1, 1, 6)]); m.height('C', 3); m.show('A', 2);
    run(`a block narrowed off above a moved one under a temporary height: the move by its step, the push on the screen only (D by ${d})`, m,
      T(m, { K: { c0: 2 }, D: { y: 8 + d } }, { steps: [[['D'], d]], carried: 'D', leave: [['K', 1, 'narrow']] }),
      (m) => { const r = [m.rows(), m.rows('canonical')]; m.show('A', 0); return [...r, m.rows()]; },
      [{ A: 0, C: 0, D: 10 + d, K: 5 }, { A: 0, C: 0, D: 8 + d, K: 5 }, { A: 0, C: 0, D: 8 + d, K: 5 }]);
  }
  return out;
}

/** [name, the declaration's errors, the error it must contain, or null when it must be accepted]: what declare.mjs must refuse. */
export function declarationCases() {
  // each case's errors, with the declaration and its base, so that the engine's check can judge the same
  const chk = (b, T) => Object.assign(checkDeclaration(b, T), { T, base: b });
  const base = { b3: { c0: 1, c1: 3, y: 0, h: 1, e: 0 }, b1: { c0: 3, c1: 3, y: 4, h: 1, e: 0 }, a: { c0: 5, c1: 5, y: 0, h: 1, e: 0 } };
  const D = (after, x = {}) => chk(base, { after: { ...base, ...after }, steps: [], leave: [], enter: [], pass: [], carried: null, ...x });
  const swapAfter = { b1: { ...base.b1, y: 3 }, b3: { ...base.b3, y: 4 } }, swapSteps = [[['b1'], -1], [['b3'], 4]];
  return [
    ['a pass that changes no order is refused (nothing moved, b3 declared to pass in column 3)', D({}, { carried: 'b3', pass: [['b3', 3]] }), 'changes its order with no block there'],
    ['a pass the swap makes is accepted', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }), null],
    ['a change of order with no declared pass is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'] }), 'with no declared pass'],
    ['a pass outside a swap is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', pass: [['b3', 3]] }), 'only a block of a swap'],
    ['a pass by a block outside the swap is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3], ['a', 5]] }), 'only a block of a swap'],
    ['a swap whose first block is not the carried one is refused', D(swapAfter, { steps: swapSteps, carried: 'b1', swap: ['b3', 'b1'], pass: [['b3', 3]] }), 'not the carried one'],
    ['leaving as carried away is an undo\'s carry back\'s only', D({ b1: { ...base.b1, c0: 4, c1: 4 } }, { leave: [['b1', 3, 'away']], enter: [['b1', 4, 'self']] }), 'only an undo\'s carry back leaves as carried away'],
    ['coming in where it is put is the carried or a created block\'s only', D({ b1: { ...base.b1, c1: 4 } }, { enter: [['b1', 4, 'put']] }), 'only the carried block or a created one'],
    ['coming back by its canonical row is an undo\'s only', D({ b1: { ...base.b1, c1: 4 } }, { enter: [['b1', 4, 'back']] }), 'only an undo'],
    ['a leave the geometry does not show is refused', D({}, { leave: [['b1', 3, 'narrow']] }), 'is not in the geometry'],
    ['an entry not declared is refused', D({ b1: { ...base.b1, c1: 4 } }), 'not declared'],
    ['a swap away from the rows §5.1b gives (the neighbour at the carried block\'s first row) is refused', D({ b1: { ...base.b1, y: 0 }, b3: { ...base.b3, y: 1 } }, { steps: [[['b1'], -4], [['b3'], 1]], carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3]] }), 'not at the rows the swap gives'],
    ['the swap\'s neighbour declared to pass the carried block is refused', D(swapAfter, { steps: swapSteps, carried: 'b3', swap: ['b3', 'b1'], pass: [['b3', 3], ['b1', 3]] }), 'the carried block passes it'],
    ['a swap with no exchange of order is refused', D({ b3: { ...base.b3, y: 2 } }, { steps: [[['b3'], 2]], carried: 'b3', swap: ['b3', 'b1'] }), 'not exchanged'],
    ['the carried block keeping some of its columns and leaving one as carried away is refused', D({ b3: { ...base.b3, c1: 2 } }, { carried: 'b3', leave: [['b3', 3, 'away']] }), 'leaves the others as narrowed off'],
    ['an undo\'s carry back coming in where it is put is refused', D({ b3: { ...base.b3, c1: 4, y: 0 } }, { carried: 'b3', canonical: true, leave: [[ 'b3', 1, 'away'], ['b3', 2, 'away'], ['b3', 3, 'away']], enter: [['b3', 1, 'back'], ['b3', 2, 'back'], ['b3', 3, 'back'], ['b3', 4, 'put']] }), 'comes back by its canonical row'],
    ['a step of a block after does not hold is refused', chk(base, { after: { b3: base.b3, a: base.a }, steps: [[['b1'], 1]], leave: [], enter: [], pass: [], carried: null }), 'which after does not hold'],
    ['two blocks on one cell in after are refused', D({ a: { ...base.a, c0: 3, c1: 3, y: 4 } }, { leave: [['a', 5, 'narrow']], enter: [['a', 3, 'self']] }), 'overlap in after'],
    ['a push declared after the move that makes it, which replayed carries one block past another, is refused', D({ b3: { ...base.b3, y: 7 }, b1: { ...base.b1, y: 8 } }, { steps: [[['b3'], 7], [['b1'], 4]], carried: 'b3' }), 'carries b3 past b1'],
    ['a pass by the carried block outside a swap with no fallback declared is refused', D({ b3: { ...base.b3, y: 5 } }, { steps: [[['b3'], 5]], carried: 'b3', pass: [['b3', 3]] }), 'only a block of a swap'],
    ['the same pass under the fallback of P-UP off is accepted', D({ b3: { ...base.b3, y: 5 } }, { steps: [[['b3'], 5]], carried: 'b3', fallback: 'P-UP', pass: [['b3', 3]] }), null],
    ['an undo carrying a block back past another needs no pass: it leaves its columns and comes back into them', chk({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 7, yc: 7, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 0, h: 1, e: 0 } }, steps: [], carried: 'A', canonical: true, leave: [['A', 1, 'away']], enter: [['A', 1, 'back']], pass: [] }), null],
    ['a deleted block made again by an undo coming in where it is put is refused', chk({ U: { c0: 1, c1: 1, y: 0, h: 1, e: 2 } }, { after: { U: { c0: 1, c1: 1, y: 0, h: 1, e: 2 }, X: { c0: 1, c1: 2, y: 4, yc: 2, h: 1, e: 0 } }, steps: [], carried: 'X', canonical: true, leave: [], enter: [['X', 1, 'put'], ['X', 2, 'put']], pass: [] }), 'comes back by its canonical row'],
    ['a height changed in columns far away does not turn off the check of the steps here', chk({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 }, Z: { c0: 20, c1: 20, y: 0, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 7, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 8, h: 1, e: 0 }, Z: { c0: 20, c1: 20, y: 0, h: 2, e: 0 } }, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'carries A past B'],
    ['a block under one that grew starts from the row FOLLOW gives, which the transition states', chk({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 2, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 0, h: 3, e: 0 }, B: { c0: 1, c1: 1, y: 4, h: 1, e: 0 } }, start: { A: 0, B: 4 }, steps: [], carried: null, leave: [], enter: [], pass: [] }), null],
    ['the same with a step from a start that is not FOLLOW\'s, which does not add up, is refused', chk({ A: { c0: 1, c1: 1, y: 0, h: 1, e: 0 }, B: { c0: 1, c1: 1, y: 2, h: 1, e: 0 } }, { after: { A: { c0: 1, c1: 1, y: 0, h: 3, e: 0 }, B: { c0: 1, c1: 1, y: 6, h: 1, e: 0 } }, start: { A: 0, B: 4 }, steps: [[['B'], 4]], carried: null, leave: [], enter: [], pass: [] }), 'add up to 4 rows'],
    ['the same push as one step per common part is accepted', D({ b3: { ...base.b3, y: 7 }, b1: { ...base.b1, y: 8 } }, { steps: [[['b3'], 3], [['b3', 'b1'], 4]], carried: 'b3' }), null],
    (() => { // the review of 989243c: U grows from 1 row to 2, FOLLOW starts A at 4 and B at 8; a wrong split, A +7 and B +4, with no start
      const b = (y, h = 1) => ({ c0: 1, c1: 1, y, h, e: 0 }), base = { U: b(0), A: b(3), B: b(7) }, after = { U: b(0, 2), A: b(11), B: b(12) };
      return ['a change of height with no start for the blocks it reaches is refused: the steps could not be checked',
        chk(base, { after, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'gives no start for it']; })(),
    (() => {
      const b = (y, h = 1) => ({ c0: 1, c1: 1, y, h, e: 0 }), base = { U: b(0), A: b(3), B: b(7) }, after = { U: b(0, 2), A: b(11), B: b(12) };
      return ['the same with its start: the wrong split carries A through B and is refused',
        chk(base, { after, start: { U: 0, A: 4, B: 8 }, steps: [[['A'], 7], [['B'], 4]], carried: 'A', leave: [], enter: [], pass: [] }), 'carries A past B']; })(),
    // the internal review of c05fb1e: inputs that once made a check throw, or the two checks disagree, and a block with no column
    ['a swap whose carried block base does not hold is refused, not thrown', D({ x9: { c0: 3, c1: 3, y: 9, h: 1, e: 0 } }, { carried: 'x9', swap: ['x9', 'b1'], enter: [['x9', 3, 'put']] }), 'does not hold the carried block'],
    ['a step of a block after creates is refused, not thrown', D({ x9: { c0: 3, c1: 3, y: 9, h: 1, e: 0 } }, { steps: [[['x9'], 1]], enter: [['x9', 3, 'put']] }), 'not in base'],
    ['a block with no column in after is refused', D({ b1: { ...base.b1, c0: 4, c1: 3 } }, { leave: [['b1', 3, 'narrow']] }), 'has no column in after'],
  ].map(([name, errs, want]) => [name, errs, want, errs.T, errs.base]);
}

/** [name, the landing law's failure or null, whether it must fail]: the law excuses a block lower than its target only where a block that
 *  came in by itself is shown to push it (laws.mjs). */
export function landingCases(make = createModel) {
  const out = [];
  // the review of 989243c: the swap of the standing neighbour with, in the same RELINK, S widened by itself into column 2 over it, a free
  // cell, with no temporary row: S pushes nothing, so a neighbour a row lower than the swap put it must fail, even under S (the rows are
  // those the model gave before the fix)
  { const T = { after: { N: { c0: 1, c1: 2, y: 6, h: 1, e: 0 }, X: { c0: 1, c1: 2, y: 3, h: 1, e: 2 } }, steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', enter: [['S', 2, 'self']] };
    const wrong = { N: 7, X: 3 };
    out.push(['a block a row lower than its target under a block that came in by itself and pushes nothing fails the landing law',
      landing(T, wrong, { without: () => wrong }), true]); }
  // the same case on the model as it is: the neighbour lands where the swap put it, and the law passes
  { const blocks = [blk('U', 1, 1, 0), blk('B', 1, 2, 7), blk('N', 1, 2, 2), blk('X', 1, 2, 4), blk('S', 3, 3, 0)], ins = ['N', 'X'], temps = [['U', 1], ['X', 2]];
    const a = frames(build({}, blocks, ins, temps, [], make)); a.X = { ...a.X, y: 3 }; a.N = { ...a.N, y: 6 }; a.S = { ...a.S, c0: 2 };
    const near = { after: a, steps: [[['X'], -1], [['X'], -1], [['N'], 3]], carried: 'X', swap: ['X', 'N'], pass: [['X', 1], ['X', 2]], leave: [], enter: [['S', 2, 'self']] };
    out.push(['the same swap with S widened into column 2 on the model: every law holds', runCase({ opts: {}, blocks, ins, temps, near, far: null }, make), false]); }
  // seed 11225: a block that came in by itself pushes, by its temporary row, a block through another: excused, since without that entry
  // the moved blocks stand where SETTLE put them
  { const blocks = [blk('a0', 4, 6, 11, 3), blk('a1', 3, 6, 18, 3), blk('a2', 0, 3, 10, 3), blk('a3', 2, 5, 4, 3)], temps = [['a0', 2], ['a3', 1]], opts = { gap8: false };
    const a = frames(build(opts, blocks, [], temps, [], make)); a.a0 = { ...a.a0, y: 8 }; a.a1 = { ...a.a1, y: 13 }; a.a2 = { ...a.a2, y: 10 }; a.a3 = { ...a.a3, c0: 1 };
    const near = { after: a, steps: [[['a1'], -4], [['a1', 'a0'], -3], [['a1', 'a0', 'a2'], -1]], carried: 'a1', leave: [], enter: [['a3', 1, 'self']], pass: [] };
    out.push(['seed 11225: a push by the temporary row of a block that came in by itself, through a block it pushes, is excused', runCase({ opts, blocks, ins: [], temps, near, far: null }, make), false]); }
  return out;
}
