// Node: `resize` (public/layout/gap.js), the one writer of a box's height and temporary rows (docs/LAYOUT-ENGINE-PLAN.md §4.3, LAYOUT-RULES
// GAP.4): it sets h and t together, cuts no lend (G7 is RELINK's), runs no FOLLOW, and refuses a height with no canonical row.
import { resize, relink, follow } from '../public/layout/gap.js';
import { DEFAULT } from '../public/layout/rules.js';
import { ok, eq, done, box, placed, edit, stack, rows } from './lib/gapcase.mjs';

const L0 = placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]);
const X = relink(L0, edit(L0, (m) => m.set('X', box('X', 1, 1, 3, 3))), {}, 'X', DEFAULT);
eq('1 X stands in A\'s gap with three rows of lend', stack(X, 'L', 1), 'A | A2 [X:A3] A4 |');
const r = resize(X, 'X', 3, 2);
ok('1a resize sets h and t, and nothing else: the rows and the stacks are those it was given', r.boxes.get('X').h === 3 && r.boxes.get('X').t === 2 && rows(r).L === rows(X).L && r.boxes.get('L').above === X.boxes.get('L').above);
const s = resize(X, 'X', 1, 0);
eq('1b a shrink written by resize cuts no lend: G7 waits for the RELINK that sees it', stack(s, 'L', 1), 'A | A2 [X:A3] A4 |');
eq('1c FOLLOW then puts L under X as it is now; the lend, whatever its length, is never counted as rows', rows(follow(s)).L, 8);
let bad = 0; for (const [h, t] of [[0, 0], [2, 2], [1.5, 0], [3, -1]]) { try { resize(X, 'X', h, t); } catch { bad++; } }
ok('1d a height with no canonical row, or not whole, is refused', bad === 4);
ok('1e the layout it was given is unchanged', X.boxes.get('X').h === 3 && X.boxes.get('X').t === 0);
done();
