// Node: GAP.5 rule 5, fit (public/layout/gap.js `fit`, and the end of `relink`): a block SETTLE put lower than FOLLOW over the stacks puts it
// gets, in its binding stack, the rows it lacks, owned by that stack's u; no stack is ever cut; blocks are visited in reading order; the
// carried block is fitted too, with no vertical step of its own.
import { fit, relink, resize } from '../public/layout/gap.js';
import { DEFAULT } from '../public/layout/rules.js';
import { ok, eq, done, box, placed, edit, stack, rows, canon, clean } from './lib/gapcase.mjs';

const R = DEFAULT, L = placed([box('A', 1, 1, 0), box('L', 1, 1, 5)]);
const f = fit(L, { L: 7 }, R);
eq('1 L asked at 7: two rows of A\'s come into its stack', [rows(f).L, stack(f, 'L', 1)], [7, 'A | A6 |']);
const n = fit(L, { L: 3 }, R);
ok('1a asked higher than FOLLOW puts it, nothing changes: no stack is cut', rows(n).L === 5 && stack(n, 'L', 1) === 'A | A4 |');
const o1 = fit(L, { A: 2, L: 7 }, R), o2 = fit(L, { L: 7, A: 2 }, R);
eq('2 in reading order: A first, so L, which follows A, needs nothing more (r6)', [rows(o1), rows(o2)], [{ A: 2, L: 7 }, { A: 2, L: 7 }]);
let K = placed([box('A', 1, 1, 0, 10), box('B', 2, 8, 0), box('X', 1, 8, 12, 2)]);
K = relink(K, resize(K, 'A', 15, 5), {}, null, R);
eq('3 X shown at 17 under A\'s temporary rows, canonically at 12', [rows(K).X, canon(K).X], [17, 12]);
const k = relink(K, edit(K, (m, set) => set('X', { col: 1, w: 8 })), {}, 'X', R);
eq('3a narrowed at the edge off the column that held it lower, dropped where it is shown: fitted to 17, the rows it lacked B\'s (r10.3)', [rows(k).X, canon(k).X, stack(k, 'X', 2)], [17, 17, 'B | B16 |']);
clean('3b invariants', k);
done();
