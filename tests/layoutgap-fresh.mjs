// Node: GAP.5 rule 4, fresh (public/layout/gap.js `relink`): a block that comes into a column with nothing below it anchors a new stack, the
// rows from the anchor above it (or the top) to it, owned by that anchor, unowned under the top; an area by its extent.
import { relink } from '../public/layout/gap.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { eq, done, box, placed, edit, stack, rows, clean } from './lib/gapcase.mjs';

const ins = (L, b, R = DEFAULT) => relink(L, edit(L, (m) => m.set(b.id, b)), {}, b.id, R);
const e = ins(placed([box('A', 1, 1, 0)]), box('X', 5, 6, 4));
eq('1 into empty columns: rows from the top, unowned', [stack(e, 'X', 5), stack(e, 'X', 6)], ['top | _4 |', 'top | _4 |']);
const u = ins(placed([box('A', 1, 1, 0)]), box('X', 1, 2, 6));
eq('1a under the last block of a column: rows of that block; beside it, unowned', [stack(u, 'X', 1), stack(u, 'X', 2)], ['A | A5 |', 'top | _6 |']);
const g = ins(placed([box('A', 1, 1, 0)]), box('X', 1, 1, 6), resolve({ 'GAP.5.3': false }));
eq('1b the same with GAP.5.3 off: nothing to cut', stack(g, 'X', 1), 'A | A5 |');
const a = ins(placed([box('A', 1, 6, 0)]), box('R', 2, 5, 3, 2, { area: true }));
eq('2 an area comes in by its extent: its top one row above its frame (§1.1)', [rows(a).R, stack(a, 'R', 1), stack(a, 'R', 6)], [3, 'A | A1 |', 'A | A1 |']);
clean('2a invariants', a);
done();
