// Node: the change kinds and the judges of phase 2 (public/layout/changes.js; docs/LAYOUT-RULES.md §5.2, §6.B, §5.3 «Obstacle»):
// - the table: every kind of §5.2 that reaches SETTLE as data (what it moves, how it judges, what a block with no room aside does, its
//   containment), a composite change refused with the reason;
// - the carry's judge: DRAG.B2 above or below (a block that stood in the carried block's columns in `start` keeps its side unless the
//   block is away; any other by its middle against frow, strictly below being below), DRAG.B3 met from the side (across smaller than along,
//   or equal and the last move sideways; vertical before any move; pressed to the side its centre lies on, left when they coincide; sticky
//   while it shares a row with the target), the neighbour letting the block through judged neither way (PR-4); DRAG.B2.keep and DRAG.B3 in
//   both states;
// - the wall's judge: an area's side handle inside the area (the right wall presses left what passes the last column, the left wall
//   presses right a handle left of column 0) and the width handle's moving edge (what the widened card now overlaps, pressed away from it).
import { CHANGE_KINDS, kindOf, judgeCarry, judgeWall, sideways } from '../public/layout/changes.js';
import { resolve } from '../public/layout/rules.js';
import { set, area, ctxOf, sheet, place, ws, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok, ctx = ctxOf();
const mem = (o = {}) => ({ away: false, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down', ...o });
const obj = (m) => Object.fromEntries(m);
/** The layout after phase 1c: `start` with the moved block at its target. */
const at1c = (start, id, at) => place({ L: start, order: start.order }, id, at).L;

/* ── 1. the table ── */
{
  const k = CHANGE_KINDS;
  ok('1 a carry and a new block: the moved block at its target, the carry\'s judge, by its side when there is no room aside, clamped and growing',
    eq(k.carry, { moved: 'target', judge: 'carry', noRoom: 'side', contain: { width: 'clamp', bottom: 'grow' } }) && eq(k.create, k.carry));
  ok('1a the width handle: itself, the wall\'s judge, P-SINK, clamped and growing', eq(k.width, { moved: 'self', judge: 'wall', noRoom: 'sink', contain: { width: 'clamp', bottom: 'grow' } }));
  ok('1b an area\'s side handle inside it: no moved block, the wall\'s judge, P-SINK, refused at the bottom', eq(k.wall, { moved: 'none', judge: 'wall', noRoom: 'sink', contain: { width: 'none', bottom: 'refuse' } }));
  ok('1c a size grows its area; a deletion contains nothing; neither judges', eq(k.size, { moved: 'none', judge: 'none', noRoom: 'none', contain: { width: 'none', bottom: 'grow' } })
    && eq(k.remove, { moved: 'none', judge: 'none', noRoom: 'none', contain: { width: 'none', bottom: 'none' } }));
  let msg = ''; try { kindOf({ type: 'enter' }); } catch (e) { msg = e.message; }
  ok('1d a composite change never reaches SETTLE: refused with the reason', /settleTree/.test(msg) && kindOf({ type: 'carry' }) === k.carry, msg);
  ok('1e the table is data that cannot be changed', Object.isFrozen(k) && Object.isFrozen(k.carry) && Object.isFrozen(k.carry.contain));
}

/* ── 2. DRAG.B2 above or below ── */
{
  // A over X and B under X in X's columns at the start; C beside, in other columns
  const start = sheet(20, [set('A', 0, 0, 5), set('X', 0, 2, 5), set('B', 0, 4, 5, 2), set('C', 8, 3, 4, 3)]);
  const L = at1c(start, 'X', { col: 0, y: 5 });
  const j = judgeCarry(L, start, 'X', { col: 0, y: 5, frow: 5 }, mem(), ctx);
  ok('2 a block that stood in its columns keeps its side: B stays below though X was carried past its top', j.side.get('A') === 'above' && j.side.get('B') === 'below', obj(j.side));
  ok('2a a block in other columns is not judged', !j.side.has('C'));
  const L2 = at1c(start, 'X', { col: 6, y: 4 });
  const j2 = judgeCarry(L2, start, 'X', { col: 6, y: 4, frow: 4.4 }, mem(), ctx);
  ok('2b a block it did not stand with, by its middle: C (rows 3–5, middle 4.5) is below frow 4.4', j2.side.get('C') === 'below', obj(j2.side));
  const j3 = judgeCarry(L2, start, 'X', { col: 6, y: 4, frow: 4.5 }, mem(), ctx);
  ok('2c strictly below: at frow 4.5, C\'s middle is not below it, so C is above', j3.side.get('C') === 'above', obj(j3.side));
  const away = judgeCarry(L, start, 'X', { col: 0, y: 5, frow: 5 }, mem({ away: true }), ctx);
  ok('2d away, every side by the middle: B (rows 4–5, middle 5) is above at frow 5', away.side.get('B') === 'above' && away.side.get('A') === 'above', obj(away.side));
  const off = judgeCarry(L, start, 'X', { col: 0, y: 5, frow: 5 }, mem(), ctxOf({}, resolve({ 'DRAG.B2.keep': false })));
  ok('2e DRAG.B2.keep off: sides by frow and the middle only, so B is above', off.side.get('B') === 'above', obj(off.side));
}

/* ── 3. DRAG.B3 met from the side ── */
{
  const start = sheet(20, [set('A', 6, 0, 5, 3), set('X', 0, 6, 5)]);
  // X (card 1–4, one row) put at col 3, row 1: it overlaps A (card 7–10, rows 0–2) by 1 column and 1 row
  const L = at1c(start, 'X', { col: 3, y: 1 });
  const v = judgeCarry(L, start, 'X', { col: 3, y: 1, frow: 1 }, mem(), ctx);
  ok('3 equal overlaps and no move yet (vertical): not met from the side', !v.met.has('A'), obj(v.met));
  const s = judgeCarry(L, start, 'X', { col: 3, y: 1, frow: 1 }, mem({ lastTarget: { col: 1, y: 1, frow: 1, w: 5 } }), ctx);
  ok('3a equal overlaps and the last move sideways: met from the side, pressed right (its centre to the right of X\'s)', s.met.get('A') === 'right', obj(s.met));
  const L2 = at1c(start, 'X', { col: 2, y: 1 });
  const across = judgeCarry(L2, start, 'X', { col: 2, y: 1, frow: 1 }, mem(), ctx);
  ok('3b X\'s card 3–6 and A\'s card 7–10 share no column: nothing hit, nothing met', !across.met.has('A') && !across.side.has('A'));
  const L3 = at1c(start, 'X', { col: 4, y: 0 });   // X card 5–8 over A card 7–10 rows 0–2: across 2, along 1
  const along = judgeCarry(L3, start, 'X', { col: 4, y: 0, frow: 0 }, mem(), ctx);
  ok('3c across 2, along 1: not met from the side, judged above or below', !along.met.has('A') && along.side.has('A'), [obj(along.met), obj(along.side)]);
  const tall = sheet(20, [set('A', 6, 0, 5, 3), set('X', 0, 6, 5, 3)]), L4 = at1c(tall, 'X', { col: 4, y: 0 });   // across 2, along 3
  const side4 = judgeCarry(L4, tall, 'X', { col: 4, y: 0, frow: 0 }, mem(), ctx);
  ok('3d across 2, along 3: met from the side, pressed right', side4.met.get('A') === 'right', obj(side4.met));
  const left = sheet(20, [set('A', 0, 0, 5, 3), set('X', 8, 6, 5, 3)]), L5 = at1c(left, 'X', { col: 2, y: 0 });   // X card 3–6, A card 1–4
  const s5 = judgeCarry(L5, left, 'X', { col: 2, y: 0, frow: 0 }, mem(), ctx);
  ok('3e pressed to the side its centre lies on: A to the left', s5.met.get('A') === 'left', obj(s5.met));
  const same = sheet(20, [set('A', 2, 0, 3, 3), set('X', 8, 6, 3, 3)]), L6 = at1c(same, 'X', { col: 2, y: 0 });   // both cards 3–4: across 2, along 3
  const s6 = judgeCarry(L6, same, 'X', { col: 2, y: 0, frow: 0 }, mem(), ctx);
  ok('3f centres that coincide: to the left', s6.met.get('A') === 'left', obj(s6.met));
  const sticky = judgeCarry(L3, start, 'X', { col: 4, y: 0, frow: 0 }, mem({ sides: new Map([['A', 'right']]) }), ctx);
  ok('3g sticky: A met from the side before stays so while it shares a row with the target, though the overlaps now judge it above or below', sticky.met.get('A') === 'right' && sticky.sides.get('A') === 'right', obj(sticky.met));
  const gone = judgeCarry(at1c(start, 'X', { col: 0, y: 8 }), start, 'X', { col: 0, y: 8, frow: 8 }, mem({ sides: new Map([['A', 'right']]) }), ctx);
  ok('3h and its record is dropped once it shares no row with the target', !gone.sides.has('A'), obj(gone.sides));
  const off = judgeCarry(L4, tall, 'X', { col: 4, y: 0, frow: 0 }, mem(), ctxOf({}, resolve({ 'DRAG.B3': false })));
  ok('3i DRAG.B3 off: nothing met from the side, every block hit judged above or below', off.met.size === 0 && off.side.has('A'), [obj(off.met), obj(off.side)]);
  ok('3j sideways: more across the columns than along the rows; vertical before any move',
    sideways({ col: 0, y: 0 }, { col: 2, y: 1 }) && !sideways({ col: 0, y: 0 }, { col: 1, y: 1 }) && !sideways(null, { col: 5, y: 0 }));
}

/* ── 4. the neighbour letting the block through ── */
{
  const start = sheet(20, [set('X', 0, 0, 5), set('B', 0, 2, 5, 3)]), L = at1c(start, 'X', { col: 0, y: 3 });
  const j = judgeCarry(L, start, 'X', { col: 0, y: 3, frow: 3 }, mem({ through: { id: 'B', row: 1, side: 'below' } }), ctx);
  ok('4 the neighbour in the memory is judged neither way (PR-4)', !j.side.has('B') && !j.met.has('B'), [obj(j.side), obj(j.met)]);
}

/* ── 5. the wall's judge ── */
{
  // an area's content after its right side handle moved in to 8 columns: B passes the last column
  const inner = { ...sheet(12, [set('A', 0, 0, 4), set('B', 5, 0, 5), set('C', 1, 3, 3)]), cols: 8 };
  const r = judgeWall(inner, { type: 'wall' });
  ok('5 the right wall: what passes the last column is met from the side, pressed left; nothing above or below', eq(obj(r.met), { B: 'left' }) && r.side.size === 0, obj(r.met));
  const shifted = place({ L: sheet(12, [set('A', 0, 0, 4), set('C', 1, 3, 3)]), order: [] }, 'A', { col: -2 }).L;
  const l = judgeWall(shifted, { type: 'wall' });
  ok('5a the left wall: a handle left of column 0 after the shift is pressed right', eq(obj(l.met), { A: 'right' }), obj(l.met));
  const wide = place({ L: sheet(20, [set('A', 0, 0, 5), set('B', 6, 0, 4), set('C', 3, 4, 4)]), order: [] }, 'A', { w: 9 }).L;
  const h = judgeWall(wide, { type: 'width', id: 'A' });
  ok('5b the width handle\'s right edge: B, which A\'s widened card now overlaps, pressed right; C under it is not', eq(obj(h.met), { B: 'right' }), obj(h.met));
  const ar = place({ L: sheet(30, [area('A', 6, 1, 8, 2), set('B', 1, 1, 4)]), order: [] }, 'A', { col: 3, w: 11 }).L;
  const al = judgeWall(ar, { type: 'width', id: 'A', side: 'left' });
  ok('5c an area\'s left edge carried outwards: what its extent now overlaps, pressed left', eq(obj(al.met), { B: 'left' }), obj(al.met));
}

process.exit(t.fails ? 1 : 0);
