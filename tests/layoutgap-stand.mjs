// Node: GAP.5 rule 3, stand (public/layout/gap.js `relink`): a block that comes into a column with something below it stands in the stack that
// holds the nearest block below it, in the seg above that block; created or carried there, at its displayed target; come in by itself, at its
// canonical row, so a temporary height pushes it on the screen only; an undo by its canonical row in every column; put lower than the gap
// reaches, the rows between are its room; several at once stand one after another in one path; with GAP.5.3 off it cuts the stack.
import { relink, remove, resize } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, canon, steps, clean } from './lib/gapcase.mjs';

const R = DEFAULT, ins = (L, b, rules = R, carried = b.id) => relink(L, edit(L, (m) => m.set(b.id, b)), {}, carried, rules);
const H = ins(placed([box('H', 1, 3, 10)]), box('X', 1, 3, 5));
eq('1 a block put into the free room above a head block stands there, its lend unowned (r2a)', [rows(H).H, stack(H, 'H', 2)], [10, 'top | _5 [X:_1] _4 |']);
eq('1a and taken away, the room is whole', stack(remove(H, 'X', R), 'H', 2), 'top | _10 |');

let L = placed([box('A', 1, 1, 0), box('L', 1, 1, 10), box('X', 2, 2, 5)]);
L = relink(L, resize(L, 'A', 4, 3), {}, null, R);   // A shown three rows taller
const w = relink(L, edit(L, (m, set) => set('X', { col: 0, w: 3 })), {}, null, R);
eq('2 X widens into column 1 by itself: it stands there at its canonical row, 4 rows into A\'s gap; on the screen A\'s temporary rows push it to 8', [stack(w, 'L', 1), rows(w).X, canon(w).X, rows(w).L, canon(w).L], ['A | A4 [X:A1] A4 |', 8, 5, 13, 10]);

let U = placed([box('A', 1, 1, 0), box('L', 1, 2, 10)]);
U = relink(U, resize(U, 'A', 4, 3), {}, null, R);
const un = ins(U, box('X', 1, 2, 5), R, { id: 'X', canonical: true });
eq('3 an undo puts X back by its canonical row in both its columns, though A\'s temporary rows push it on the screen in one (r6)', [stack(un, 'L', 1), stack(un, 'L', 2), rows(un).X, canon(un).X], ['A | A4 [X:A1] A4 |', 'top | _5 [X:_1] _4 |', 8, 5]);

for (const on of [true, false]) {
  const t = ins(placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]), box('X', 1, 1, 4), resolve({ 'GAP.5.3': on }));
  eq(`4 GAP.5.3 ${on ? 'on' : 'off'}: X put between A and L ${on ? 'stands in A\'s gap' : 'cuts it, the rows under it its own'} (final.3)`, [rows(t).L, stack(t, 'L', 1), stack(t, 'X', 1)], on ? [10, 'A | A3 [X:A1] A5 |', null] : [10, 'X | X5 |', 'A | A3 |']);
}

let C = placed([box('A', 9, 11, 0), box('C', 9, 11, 8), box('X', 1, 6, 2), box('Y', 1, 6, 4)]);
C = relink(C, edit(C, (m, set) => { set('X', { w: 12 }); set('Y', { w: 12 }); }), {}, null, R);
eq('5 two blocks come between A and C at once: they stand one after another, from the top, in one path (r2b)', [rows(C), stack(C, 'C', 10)], [{ A: 0, C: 8, X: 2, Y: 4 }, 'A | A1 [X:A1] A1 [Y:A1] A3 |']);
eq('5a taken away in either order, the gap is whole', [stack(remove(remove(C, 'X', R), 'Y', R), 'C', 10), stack(remove(remove(C, 'Y', R), 'X', R), 'C', 10)], ['A | A7 |', 'A | A7 |']);
clean('5b invariants', C);
// the code review of step 1 (#132): a created block is measured on the screen whether or not it is the carried one; an undo puts a block
// back by its canonical row in the columns it keeps too
let E = placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]); E = relink(E, resize(E, 'A', 5, 4), {}, null, R);
const nb = (car) => relink(E, edit(E, (m) => m.set('X', box('X', 1, 1, 7))), {}, car, R);
eq('6 X created at row 7 on the screen under A\'s four temporary rows: canonically at 3, carried or not', [[rows(nb(null)).X, canon(nb(null)).X], [rows(nb('X')).X, canon(nb('X')).X]], [[7, 3], [7, 3]]);
let K = placed([box('A', 1, 1, 0), box('B', 2, 2, 0), box('X', 1, 2, 6), box('L', 1, 2, 10)]); K = relink(K, resize(K, 'A', 4, 3), {}, null, R);
const back = relink(K, edit(K, (m, set) => set('X', { y: 6, yc: 3 })), { X: steps([1, -3]) }, { id: 'X', canonical: true }, R);
eq('7 an undo carries X back to its canonical row 3 in the same two columns: by that row in both, as the model\'s carry back does (r6)', [rows(back), canon(back), stack(back, 'L', 1), stack(back, 'L', 2)], [{ A: 0, B: 0, L: 9, X: 6 }, { A: 0, B: 0, L: 6, X: 3 }, 'A | A2 [X:A1] A2 |', 'B | B2 [X:B1] B2 |']);
clean('7a invariants', back);
done();
