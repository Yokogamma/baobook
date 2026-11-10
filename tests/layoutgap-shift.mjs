// Node: GAP.10, `shift` (public/layout/gap.js): every block's columns and every stack move by the same columns, so owners and lends stay; it
// checks no containment, so an area's left side handle passes through columns left of 0, and its wall then presses the children back in one
// RELINK, each coming into its new column by itself (docs/LAYOUT-RULES.md GAP.10, §5.6).
import { shift, adjust } from '../public/layout/gap.js';

import { DEFAULT } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, steps, clean, relink } from './lib/gapcase.mjs';

const R = DEFAULT;
let U = placed([box('U', 2, 4, 0), box('A', 2, 4, 5), box('B', 2, 4, 6), box('L', 2, 4, 12)]);
U = adjust(U, { A: steps([1, -2]) }, R);
U = relink(U, edit(U, (m) => m.set('X', box('X', 2, 4, 8))), {}, 'X', R);
const before = [stack(U, 'B', 3), stack(U, 'L', 3), rows(U)];
const s = shift(U, -1);
eq('1 shifted one column left: the same stacks, one column over (final.4)', [stack(s, 'B', 2), stack(s, 'L', 2), rows(s)], before);
eq('1a and back: every stack as it was', [stack(shift(s, 1), 'B', 3), stack(shift(s, 1), 'L', 3), rows(shift(s, 1))], before);
const W = placed([box('A', 2, 5, 0), box('X', 1, 2, 3), box('L', 2, 5, 8)]);
const w = shift(W, -2);
eq('2 an area\'s left handle carried in by two: X passes column 0, its stacks kept there, no containment', [w.boxes.get('X').col, stack(w, 'L', 0), stack(w, 'X', -1)], [-2, 'X | X4 |', 'top | _3 |']);
clean('2a invariants in the passing state', w);
const p = relink(w, edit(w, (m, set) => set('X', { col: -1 })), {}, null, R);
eq('3 the wall presses X back to column 0: it comes into column 1 by itself, at its row, in A\'s gap; every row stays (r10.5)', [rows(p), stack(p, 'L', 0), stack(p, 'L', 1)], [{ A: 0, L: 8, X: 3 }, 'X | X4 |', 'A | A2 [X:A1] A4 |']);
clean('3a invariants', p);
done();
