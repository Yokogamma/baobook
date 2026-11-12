// Node: GAP.6, a block taken away (public/layout/gap.js `remove`): rule 2 in every column it covered, then FOLLOW; the blocks under it rise
// by its height and its own rows wherever those lie; unowned rows and rows of others stay; a deletion never moves a block down.
import { remove } from '../public/layout/gap.js';

import { DEFAULT } from '../public/layout/rules.js';
import { createEngineModel } from './lib/gapdriver.mjs';
import { ok, eq, done, box, placed, edit, stack, rows, relink } from './lib/gapcase.mjs';

const R = DEFAULT;
const a = remove(placed([box('A', 1, 1, 0), box('X', 1, 1, 4), box('L', 1, 1, 8)]), 'X', R);
eq('1 an anchor deleted: L rises by its height and its rows, A\'s rows stay', [rows(a).L, stack(a, 'L', 1)], [4, 'A | A3 |']);
const H = placed([box('H', 1, 3, 10)]), h = remove(relink(H, edit(H, (m) => m.set('X', box('X', 1, 3, 5))), {}, 'X', R), 'X', R);
eq('1a a block standing in free room deleted: the room is free room still, H stays', [rows(h).H, stack(h, 'H', 1)], [10, 'top | _10 |']);
const r = remove(placed([box('A', 1, 6, 0), box('R', 2, 5, 3, 2, { area: true }), box('L', 1, 6, 8)]), 'R', R);
eq('2 an area deleted: L rises by its extent and the rows it owned; A\'s row stays', [rows(r).L, stack(r, 'L', 1)], [2, 'A | A1 |']);
// a deletion never moves a block down, in either measure, over random histories
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
let down = null;
for (let seed = 1; seed <= 300 && !down; seed++) {
  const g = rng(seed), pick = (x) => x[Math.floor(g() * x.length)], int = (p, q) => p + Math.floor(g() * (q - p + 1));
  const m = createEngineModel().open([{ id: 'a', c0: 0, c1: 5, y: 0, h: 1 }, { id: 'b', c0: 6, c1: 11, y: 0, h: 3 }, { id: 'l', c0: 0, c1: 11, y: 12, h: 1 }]); let n = 0;
  for (let step = 0; step < 25 && !down; step++) {
    const live = [...m.B.keys()], k = pick(['insert', 'insert', 'height', 'carry', 'show', 'delete']);
    try {
      if (k === 'insert') { const c0 = int(0, 10); m.insert({ id: 'x' + n++, c0, c1: Math.min(11, c0 + int(0, 6)), y: int(0, 30), h: int(1, 3), e: pick([0, 0, 2]) }); }
      if (k === 'height') { const id = pick(live); m.height(id, Math.max(1, m.B.get(id).h + pick([-2, -1, 1, 2]))); }
      if (k === 'carry') m.carry(pick(live), pick([-2, -1, 1, 2]));
      if (k === 'show') m.show(pick(live), pick([0, 0, 1, 3]));
      if (k === 'delete' && live.length > 1) { const id = pick(live), was = [m.rows(), m.rows('canonical')]; m.remove(id); const now = [m.rows(), m.rows('canonical')];
        for (const i of [0, 1]) for (const key of Object.keys(now[i])) if (now[i][key] > was[i][key]) down = { seed, step, deleted: id, moved: key }; }
    } catch { /* refused */ }
  }
}
ok('3 a deletion never moves another block down, in either measure (300 random histories)' + (down ? ': ' + JSON.stringify(down) : ''), !down);
done();
