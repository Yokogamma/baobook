// Node: GAP.4 FOLLOW (public/layout/gap.js `follow`, `fromPlaces`; docs/LAYOUT-RULES.md INV-2, §2.1): every row from the stacks, in both
// measures, in one pass over the column chains: a valid note keeps its places, head rows and gaps included; a temporary height pushes the
// blocks under it on the screen only; the binding stack decides a row and the others keep their slack; an area stands by its extent.
import { follow, resize, check } from '../public/layout/gap.js';

import { DEFAULT } from '../public/layout/rules.js';
import { ok, eq, done, box, placed, edit, stack, rows, canon, clean, relink } from './lib/gapcase.mjs';

const L = placed([box('A', 1, 3, 3), box('B', 1, 3, 7, 2), box('C', 5, 6, 2)]);
eq('1 a valid note opens as stored: its head rows and gaps kept, in both measures (r10.6)', [rows(L), canon(L)], [{ A: 3, B: 7, C: 2 }, { A: 3, B: 7, C: 2 }]);
eq('1a GAP.1: every block an anchor, the rows above it its upper neighbour\'s, unowned under the top', [stack(L, 'A', 1), stack(L, 'B', 2), stack(L, 'C', 6)], ['top | _3 |', 'A | A3 |', 'top | _2 |']);
ok('1b FOLLOW again changes nothing', JSON.stringify([rows(follow(L)), canon(follow(L))]) === JSON.stringify([rows(L), canon(L)]));
clean('1c invariants', L);

const T = follow(resize(L, 'A', 3, 2));
eq('2 a temporary height pushes the blocks under it on the screen only (§2.1)', [rows(T).B, canon(T).B], [9, 7]);
eq('2a and changes no stack', stack(T, 'B', 2), 'A | A3 |');
eq('2b it ends: everything is back', rows(follow(resize(T, 'A', 1, 0))), rows(L));

const N = placed([box('A', 1, 1, 0), box('B', 3, 3, 0, 4), box('L', 1, 3, 10)]);
eq('3 a block over three columns, three stacks: the lowest decides its row', [stack(N, 'L', 1), stack(N, 'L', 2), stack(N, 'L', 3), rows(N).L], ['A | A9 |', 'top | _10 |', 'B | B6 |', 10]);
const N2 = follow(resize(N, 'B', 7, 3));
eq('3a B shown three rows taller: L follows on the screen by B\'s column, where the others had slack', [rows(N2).L, canon(N2).L], [13, 10]);
const N3 = follow(resize(N, 'A', 4, 3));
eq('3b after GAP.1 every stack binds L: A shown three rows taller pushes it too', [rows(N3).L, canon(N3).L], [13, 10]);

const R = placed([box('A', 1, 6, 0), box('R', 2, 5, 3, 2, { area: true }), box('L', 1, 6, 8)]);
eq('4 an area stands by its extent: its frame at row 3, its top one row above, its height two more (§1.1)', [rows(R), stack(R, 'R', 1), stack(R, 'L', 1)], [{ A: 0, L: 8, R: 3 }, 'A | A1 |', 'R | R2 |']);
clean('4a invariants', R);
// check() reports a broken or stale stack, never throws on it (the dev look and 0.2's loading read it)
const S0 = placed([box('A', 1, 1, 0), box('L', 1, 1, 10)]);
const SX = relink(S0, edit(S0, (m) => m.set('X', box('X', 1, 1, 4))), {}, 'X', DEFAULT);
const gone = new Map(SX.boxes); gone.delete('X');
let threw = false, e1 = []; try { e1 = check({ ...SX, boxes: gone, order: SX.order.filter((id) => id !== 'X') }); } catch { threw = true; }
ok('5 a stand of a block the layout no longer holds: reported, not thrown (' + e1.join('; ') + ')', !threw && e1.some((e) => e.includes('a stand of X')));
const l = S0.boxes.get('L'), stale = new Map(S0.boxes); stale.set('L', { ...l, above: [...l.above, { c0: 5, c1: 5, stack: { u: 'Q', parts: [[{ o: 'Q', n: 3 }]] } }] });
const e2 = check({ ...S0, boxes: stale });
ok('5a a stack in a column its block does not cover, under a block that is not there: reported (' + e2.join('; ') + ')', e2.some((e) => e.includes('does not cover column 5')));
done();
