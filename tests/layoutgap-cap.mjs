// Node: G7, `cap` (public/layout/gap.js, docs/LAYOUT-RULES.md GAP.4, GAP.5): a standing block's lend is never longer than its canonical
// height, judged by each RELINK against the heights it ends with, after the blocks that left a column gave back what they had there. A
// shrink a RELINK sees is real; one undone before the RELINK (inside phase 9) leaves no trace; a temporary height that ends is no shrink.
import { resize, remove } from '../public/layout/gap.js';

import { DEFAULT } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, canon, clean, relink } from './lib/gapcase.mjs';

const R = DEFAULT;
const L0 = placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]);
const withX = (x) => relink(L0, edit(L0, (m) => m.set('X', x)), {}, 'X', R);
const X = withX(box('X', 1, 2, 3, 3));
eq('0 X stands in A\'s gap, its lend three rows', stack(X, 'L', 1), 'A | A2 [X:A3] A4 |');

const s = relink(X, resize(X, 'X', 1, 0), {}, null, R);
eq('1 X shrinks to one row: the RELINK cuts its lend to one row and L rises by two (r10.1)', [stack(s, 'L', 1), rows(s).L], ['A | A2 [X:A1] A4 |', 8]);
eq('1a deleted then, it gives back only what it still covers: L stays (G7)', [rows(remove(s, 'X', R)).L, stack(remove(s, 'X', R), 'L', 1)], [8, 'A | A7 |']);
clean('1b invariants', s);

const back = relink(X, resize(resize(X, 'X', 1, 0), 'X', 3, 0), {}, null, R);
eq('2 a shrink and a regrowth before one RELINK (a pass of SIZE.8, then phase 9 (b)): the lend stays whole (r11.1)', [stack(back, 'L', 1), rows(remove(back, 'X', R)).L], ['A | A2 [X:A3] A4 |', 10]);
const two = relink(s, resize(s, 'X', 3, 0), {}, null, R);
eq('2a in two RELINKs the shrink was real: the lend stays cut, and L rises to 8 when X goes', [stack(two, 'L', 1), rows(two).L, rows(remove(two, 'X', R)).L], ['A | A2 [X:A1] A4 |', 10, 8]);

const t = relink(X, resize(X, 'X', 5, 2), {}, null, R), t2 = relink(t, resize(t, 'X', 3, 0), {}, null, R);
eq('3 a temporary height that ends is no shrink: the lend is the canonical height\'s throughout', [stack(t, 'L', 1), stack(t2, 'L', 1), rows(t).L, canon(t).L], ['A | A2 [X:A3] A4 |', 'A | A2 [X:A3] A4 |', 12, 10]);

const W = placed([box('A', 1, 2, 0), box('L', 1, 2, 10)]);
const XW = relink(W, edit(W, (m) => m.set('X', box('X', 1, 2, 3, 3))), {}, 'X', R);
const nw = relink(XW, edit(XW, (m, set) => set('X', { col: 0, w: 2, h: 1 })), {}, null, R);
eq('4 X narrowed off column 2 while it shrinks: column 2 gets its whole lend back, column 1 has it cut (rule 2 before cap)', [stack(nw, 'L', 1), stack(nw, 'L', 2), rows(nw).L], ['A | A2 [X:A1] A4 |', 'A | A9 |', 10]);
done();
