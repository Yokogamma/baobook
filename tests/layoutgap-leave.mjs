// Node: GAP.5 rule 2, leave (public/layout/gap.js `relink`, `remove`): a standing block gives its lend back, whatever made it leave (C3,
// S8), or takes it along with GAP.5.2 off; an anchor's stack joins the one under it; narrowed off, its rows stay (G8, GAP.9) or go with
// GAP.9 off; the carried block leaves the columns it leaves as carried away, though it keeps others; under the last anchor the lowest
// standing block takes its place, the stack cleared with GAP.5.2 off; a block carried past a neighbour of a column it keeps counts as
// leaving its old place and coming in at its new one (the engine's own case: the lab model keeps every chain's order).
import { relink, remove } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, steps, clean } from './lib/gapcase.mjs';

const ins = (L, b, R = DEFAULT) => relink(L, edit(L, (m) => m.set(b.id, b)), {}, b.id, R);
for (const on of [true, false]) {
  const R = resolve({ 'GAP.5.2': on });
  const s = remove(ins(placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]), box('X', 1, 1, 4), R), 'X', R);
  eq(`1 GAP.5.2 ${on ? 'on' : 'off'}: a standing block deleted ${on ? 'gives its lend back' : 'takes its lend along'}`, [rows(s).L, stack(s, 'L', 1)], on ? [10, 'A | A9 |'] : [9, 'A | A8 |']);
  const a = remove(placed([box('A', 1, 1, 0), box('X', 1, 1, 4), box('L', 1, 1, 8)]), 'X', R);
  eq(`1a GAP.5.2 ${on ? 'on' : 'off'}: an anchor deleted, ${on ? 'its own rows go' : 'the rows of its stack go too'}`, [rows(a).L, stack(a, 'L', 1)], on ? [4, 'A | A3 |'] : [1, 'A | · |']);
  const p = remove(ins(ins(placed([box('L', 1, 1, 10)]), box('X', 1, 1, 5), R), box('Y', 1, 1, 7), R), 'L', R);
  eq(`1b GAP.5.2 ${on ? 'on' : 'off'}: the last anchor deleted, Y takes its place${on ? '' : ', its stack cleared'} (r10.4)`, [rows(p).X, rows(p).Y, stack(p, 'Y', 1)], on ? [5, 7, 'top | _5 [X:_1] _1 |'] : [0, 1, 'top | · [X:·] · |']);
}
for (const on of [true, false]) {
  const R = resolve({ 'GAP.9': on }), L = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
  const n = relink(L, edit(L, (m, set) => set('X', { col: 1 })), {}, null, R);
  eq(`2 GAP.9 ${on ? 'on' : 'off'}: X narrowed off column 1 ${on ? 'leaves its body and rows there (G8)' : 'takes them along'}`, [stack(n, 'L', 1), stack(n, 'L', 2), rows(remove(n, 'X', R)).L], on ? ['A | A5 |', 'X | X3 |', 6] : ['A | A1 |', 'X | X3 |', 2]);
}
const S = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
const c = relink(S, edit(S, (m, set) => set('X', { col: 1 })), {}, 'X', DEFAULT);
eq('3 carried one column sideways, X keeps two columns: in the one it leaves it is carried away, its rows go with it (final.1)', [rows(c).L, stack(c, 'L', 1), stack(c, 'L', 2), stack(c, 'X', 4)], [6, 'A | A1 |', 'X | X3 |', 'top | _2 |']);
eq('3a deleted then, L rises to its place (G2)', rows(remove(c, 'X', DEFAULT)).L, 2);
const P = placed([box('X', 1, 1, 2), box('B', 1, 1, 6)]);
const past = relink(P, edit(P, (m, set) => set('X', { y: 10 })), { X: steps([1, 8]) }, 'X', DEFAULT);
eq('4 X carried down past B in their column: it leaves its place, taking its rows, B rises into it (G2), and X comes in under B', [rows(past), stack(past, 'B', 1), stack(past, 'X', 1)], [{ B: 2, X: 10 }, 'top | _2 |', 'B | B7 |']);
clean('4a invariants', past);
done();
