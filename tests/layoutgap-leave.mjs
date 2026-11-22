// Node: GAP.5 rule 2, leave (public/layout/gap.js `relink`, `remove`): a standing block gives its lend back, whatever made it leave (C3,
// S8), or takes it along with GAP.5.2 off; an anchor's stack joins the one under it; narrowed off, its rows stay (G8, GAP.9) or go with
// GAP.9 off; the carried block leaves the columns it no longer covers as narrowed off, while it keeps others (M9); under the last anchor
// the lowest standing block takes its place, the stack cleared with GAP.5.2 off; a block carried past a neighbour of a column it keeps is
// refused outside a swap, and as a swap it passes it, freeing nothing (step 1b).
import { remove, follow, resize } from '../public/layout/gap.js';

import { ok, eq, done, box, placed, edit, stack, rows, canon, steps, clean, relink } from './lib/gapcase.mjs';

const ins = (L, b) => relink(L, edit(L, (m) => m.set(b.id, b)), {}, b.id);
{
  const s = remove(ins(placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]), box('X', 1, 1, 4)), 'X');
  eq('1 a standing block deleted gives its lend back (GAP.5.2)', [rows(s).L, stack(s, 'L', 1)], [10, 'A | A9 |']);
  const a = remove(placed([box('A', 1, 1, 0), box('X', 1, 1, 4), box('L', 1, 1, 8)]), 'X');
  eq('1a an anchor deleted, its own rows go', [rows(a).L, stack(a, 'L', 1)], [4, 'A | A3 |']);
  const p = remove(ins(ins(placed([box('L', 1, 1, 10)]), box('X', 1, 1, 5)), box('Y', 1, 1, 7)), 'L');
  eq('1b the last anchor deleted, Y takes its place (r10.4)', [rows(p).X, rows(p).Y, stack(p, 'Y', 1)], [5, 7, 'top | _5 [X:_1] _1 |']);
}
{
  const L = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
  const n = relink(L, edit(L, (m, set) => set('X', { col: 1 })), {}, null);
  eq('2 X narrowed off column 1 leaves its body and rows there (GAP.9, G8)', [stack(n, 'L', 1), stack(n, 'L', 2), rows(remove(n, 'X')).L], ['A | A5 |', 'X | X3 |', 6]);
}
const S = placed([box('A', 1, 3, 0), box('X', 1, 3, 2), box('L', 1, 3, 6)]);
const c = relink(S, edit(S, (m, set) => set('X', { col: 1 })), {}, 'X');
eq('3 carried one column sideways, X keeps two columns: the one it leaves it leaves as a narrowing does, its rows there kept (M9, final.1)', [rows(c).L, stack(c, 'L', 1), stack(c, 'L', 2), stack(c, 'X', 4)], [6, 'A | A5 |', 'X | X3 |', 'top | _2 |']);
eq('3a deleted then, L stays (G8)', rows(remove(c, 'X')).L, 6);
// a block carried past another in a column both keep, outside a swap: SETTLE never declares it (a carry pushes what it reaches, DRAG.B2),
// so RELINK's check refuses it. The executor's cases of such passes are the lab model's (tests/lab/gap-model/transition-cases.mjs), and
// tests/layoutgap-laws.mjs runs them on the engine too, where each is refused
const P = placed([box('X', 1, 1, 2), box('B', 1, 1, 6)]);
let why = null; try { relink(P, edit(P, (m, set) => set('X', { y: 10 })), { X: steps([1, 8]) }, 'X'); } catch (e) { why = e.message; }
ok('4 X carried down past B in their column with no swap declared: refused, a change of order no pass explains (' + why + ')', /with no declared pass/.test(why || ''));
// the same passage as a swap (DRAG.B4): X pinned right against B, B moved up by X's height, X right under it; X passes B, freeing nothing
const sw = relink(P, edit(P, (m, set) => { set('X', { y: 6 }); set('B', { y: 5 }); }), { X: steps([1, 3], [3, 1]), B: steps([2, -1]) }, 'X', { swap: ['X', 'B'], pass: [['X', 1]] });
eq('4a the same as a swap: B takes X\'s pinned row, X stands right under it, an anchor as it was (G11), its place kept as rows over B', [rows(sw), stack(sw, 'B', 1), stack(sw, 'X', 1)], [{ B: 5, X: 6 }, 'top | _5 |', 'B | · |']);
clean('4b invariants', sw);
// B, pushed to 12 by A's growth in column 1 (its stack in column 2 still 11), moved down a row and shifted from columns 1–2 to 2–3: B's
// memory in column 2 is its own, and narrowed back to column 2 it stands at 11, as the model has it
const M0 = (() => { const L = follow(resize(placed([box('A', 1, 1, 0), box('B', 1, 2, 11)]), 'A', 2)); return relink(L, L, {}, null); })();
{ const out = relink(M0, edit(M0, (m, set) => set('B', { col: 1, w: 3, y: 13, yc: 13 })), { B: steps([1, 1]) }, null);
  const back = relink(out, edit(out, (m, set) => set('B', { col: 1, w: 2 })), {}, null);
  eq('5 a block that moves and shifts its columns keeps its memory in the column it keeps', [rows(out).B, stack(out, 'B', 2), rows(back).B], [13, 'top | _11 |', 11]); }
for (const [del, nar] of [['Z', 'A'], ['A', 'Z']]) {
  const Z0 = placed([box(del, 1, 1, 1), box(nar, 1, 2, 4), box('L', 1, 2, 7)]);
  const inside = relink(Z0, edit(Z0, (m, set) => { m.delete(del); set(nar, { col: 1, w: 2, y: 0, yc: 0 }); }), { [nar]: steps([1, -4]) }, null);
  const g = remove(Z0, del), first = relink(g, edit(g, (m, set) => set(nar, { col: 1, w: 2, y: 0, yc: 0 })), { [nar]: steps([1, -4]) }, null);
  eq(`7 a block deleted inside RELINK (${del}) is taken away first, as GAP.6 in phase 1b: the same stacks, whatever the ids`, [rows(inside), stack(inside, 'L', 1), rows(remove(inside, nar)).L], [rows(first), stack(first, 'L', 1), rows(remove(first, nar)).L]);
}
// ids that hold a comma or a bar: «a,a» swapped up with «a», pinned right under it and then taking its top row
const C0 = placed([box('a', 1, 1, 2), box('a,a', 1, 1, 6)]);
const cm = relink(C0, edit(C0, (m, set) => { set('a,a', { y: 2 }); set('a', { y: 3 }); }), { 'a,a': steps([1, -3], [2, -1]), a: steps([3, 1]) }, 'a,a', { swap: ['a,a', 'a'], pass: [['a,a', 1]] });
eq('8 ids that hold a comma: «a,a» swapped above «a»', rows(cm), { a: 3, 'a,a': 2 });
done();
