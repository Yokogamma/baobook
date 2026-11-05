// Node: GAP.5 rule 1, adjust (public/layout/gap.js `adjust`, and inside `relink`): moves written by hand as steps, so rule 1 is tested before
// any primitive exists. Runs of blocks moved together keep everything inside them; only the gap above and the gap under each run change; a
// first block moved up owns the free room it leaves (G6, GAP.8, per column); GAP.5.1 off keeps the lengths and changes only owners; several
// steps in one RELINK are each measured at the rows they start from; a step is rigid.
import { adjust, relink, remove } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { ok, eq, done, box, placed, edit, stack, rows, steps, clean } from './lib/gapcase.mjs';

const R = DEFAULT, mv = (L, ids, d, rules = R) => adjust(L, Object.fromEntries(ids.map((id) => [id, steps([1, d])])), rules);

const U = placed([box('U', 1, 3, 0), box('A', 1, 3, 5), box('B', 1, 3, 6)]);
const a = mv(mv(U, ['A'], -2), ['A', 'B'], 1);
eq('1 A up two, then A and B down one in one step: U\'s rows between them stay U\'s (r4.5)', [rows(a), stack(a, 'A', 2), stack(a, 'B', 2)], [{ A: 4, B: 7, U: 0 }, 'U | U3 |', 'A | U2 |']);
const b = mv(a, ['A', 'B'], -1);
eq('1a and back up', [rows(b), stack(b, 'A', 2), stack(b, 'B', 2)], [{ A: 3, B: 6, U: 0 }, 'U | U2 |', 'A | U2 |']);
clean('1b invariants', b);

const P = mv(placed([box('P', 2, 2, 0, 3), box('H', 1, 2, 5), box('L', 1, 2, 8)]), ['H'], -2);
eq('2 H is the first block of column 1 only: the free room it left there is its own; in column 2 P\'s rows came under it (G6, GAP.8)', [stack(P, 'L', 1), stack(P, 'L', 2)], ['H | H4 |', 'H | P2+H2 |']);
eq('2a P and H deleted: L rises by what was theirs', rows(remove(remove(P, 'P', R), 'H', R)).L, 3);
const off8 = resolve({ 'GAP.8': false }), Q = placed([box('Q', 2, 2, 0, 3), box('H', 1, 2, 3), box('L', 1, 2, 6)]);
eq('2b GAP.8 off: the slack H used in column 1, where it is first, stays free room', stack(mv(Q, ['H'], -2, off8), 'L', 1), 'H | _2+H2 |');

const V = placed([box('U', 1, 1, 0), box('A', 1, 1, 5), box('B', 1, 1, 6)]);
const d = [R, resolve({ 'GAP.5.1': false })].map((rules) => rows(remove(mv(V, ['A'], -2, rules), 'U', rules)).B);
eq('3 GAP.5.1 off: the rows A left are U\'s, not A\'s, so deleting U later takes more of them (r9.3); the rows are the same before', d, [1, 3]);
eq('3a the lengths are core: with GAP.5.1 off the move gives the same rows', rows(mv(V, ['A'], -2, resolve({ 'GAP.5.1': false }))), rows(mv(V, ['A'], -2)));

const X = placed([box('X', 1, 1, 3)]);
const two = relink(X, edit(X, (m, set) => set('X', { y: 5 })), { X: steps([1, 1], [2, 1]) }, null, R);
eq('4 two steps in one RELINK, each measured at the rows it starts from: X at 5 (r9.1)', rows(two).X, 5);
let threw = false; try { adjust(placed([box('A', 1, 1, 0), box('B', 3, 3, 0)]), { A: steps([1, 1]), B: steps([1, 2]) }, R); } catch { threw = true; }
ok('4a a step is rigid: one step that moved two blocks by different rows is refused', threw);
done();
