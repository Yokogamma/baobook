// Node: GAP.5 rule 1, adjust (public/layout/gap.js `adjust`, and inside `relink`): moves written by hand as steps, so rule 1 is tested before
// any primitive exists. Runs of blocks moved together keep everything inside them; only the gap above and the gap under each run change; a
// first block moved up owns the free room it leaves (G6, GAP.8, per column); GAP.5.1 off keeps the lengths and changes only owners; several
// steps in one RELINK are each measured at the rows they start from; a step is rigid.
import { adjust, remove } from '../public/layout/gap.js';

import { ok, eq, done, box, placed, edit, stack, rows, steps, clean, relink } from './lib/gapcase.mjs';

const mv = (L, ids, d) => adjust(L, Object.fromEntries(ids.map((id) => [id, steps([1, d])])));

const U = placed([box('U', 1, 3, 0), box('A', 1, 3, 5), box('B', 1, 3, 6)]);
const a = mv(mv(U, ['A'], -2), ['A', 'B'], 1);
eq('1 A up two, then A and B down one in one step: U\'s rows between them stay U\'s (r4.5)', [rows(a), stack(a, 'A', 2), stack(a, 'B', 2)], [{ A: 4, B: 7, U: 0 }, 'U | U3 |', 'A | U2 |']);
const b = mv(a, ['A', 'B'], -1);
eq('1a and back up', [rows(b), stack(b, 'A', 2), stack(b, 'B', 2)], [{ A: 3, B: 6, U: 0 }, 'U | U2 |', 'A | U2 |']);
clean('1b invariants', b);

const P = mv(placed([box('P', 2, 2, 0, 3), box('H', 1, 2, 5), box('L', 1, 2, 8)]), ['H'], -2);
eq('2 H is the first block of column 1 only: the free room it left there is its own; in column 2 P\'s rows came under it (G6, GAP.8)', [stack(P, 'L', 1), stack(P, 'L', 2)], ['H | H4 |', 'H | P2+H2 |']);
eq('2a P and H deleted: L rises by what was theirs', rows(remove(remove(P, 'P'), 'H')).L, 3);

const V = placed([box('U', 1, 1, 0), box('A', 1, 1, 5), box('B', 1, 1, 6)]);
eq('3 the rows A left under it are U\'s (GAP.5.1, G5), so deleting U later takes them: B rises to 1 (r9.3)', rows(remove(mv(V, ['A'], -2), 'U')).B, 1);

const X = placed([box('X', 1, 1, 3)]);
const two = relink(X, edit(X, (m, set) => set('X', { y: 5 })), { X: steps([1, 1], [2, 1]) }, null);
eq('4 two steps in one RELINK, each measured at the rows it starts from: X at 5 (r9.1)', rows(two).X, 5);
let threw = false; try { adjust(placed([box('A', 1, 1, 0), box('B', 3, 3, 0)]), { A: steps([1, 1]), B: steps([1, 2]) }); } catch { threw = true; }
ok('4a a step is rigid: one step that moved two blocks by different rows is refused', threw);
// the code review of step 1 (#132): a height, a move and a widening in one RELINK; the step starts from the rows the new height gives
const H0 = placed([box('A', 1, 2, 0), box('B', 1, 1, 4)]);
const hw = relink(H0, edit(H0, (m, set) => { set('A', { w: 2, h: 3 }); set('B', { w: 3, y: 7, yc: 7 }); }), { B: steps([1, 1]) }, null);
eq('5 A narrowed to column 1 and three rows tall, B pushed by it to 6 and moved down one, widening into column 2: B stands at 7 there', [rows(hw), stack(hw, 'B', 2), stack(hw, 'B', 1)], [{ A: 0, B: 7 }, 'top | _7 |', 'A | A4 |']);
eq('5a A deleted then, B keeps 7 (it was held there by column 2 too)', rows(remove(hw, 'A')).B, 7);
clean('5b invariants', hw);
done();
