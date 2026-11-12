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
  const j = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 5, frow: 5 } }, mem(), ctx);
  ok('2 a block that stood in its columns keeps its side: B stays below though X was carried past its top', j.side.get('A') === 'above' && j.side.get('B') === 'below', obj(j.side));
  ok('2a a block in other columns is not judged', !j.side.has('C'));
  const L2 = at1c(start, 'X', { col: 6, y: 4 });
  const j2 = judgeCarry(L2, start, { id: 'X', at: { col: 6, y: 4, frow: 4.4 } }, mem(), ctx);
  ok('2b a block it did not stand with, by its middle: C (rows 3–5, middle 4.5) is below frow 4.4', j2.side.get('C') === 'below', obj(j2.side));
  const j3 = judgeCarry(L2, start, { id: 'X', at: { col: 6, y: 4, frow: 4.5 } }, mem(), ctx);
  ok('2c strictly below: at frow 4.5, C\'s middle is not below it, so C is above', j3.side.get('C') === 'above', obj(j3.side));
  const away = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 5, frow: 5 }, away: true }, mem({ away: true }), ctx);
  const memOnly = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 5, frow: 5 } }, mem({ away: true }), ctx);
  ok('2d away, every side by the middle: B (rows 4–5, middle 5) is above at frow 5', away.side.get('B') === 'above' && away.side.get('A') === 'above', obj(away.side));
  ok('2d2 the judge reads the change\'s own «away» (its maker set it from the memory), not the memory: the side is kept', memOnly.side.get('B') === 'below', obj(memOnly.side));
  const off = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 5, frow: 5 } }, mem(), ctxOf({}, resolve({ 'DRAG.B2.keep': false })));
  ok('2e DRAG.B2.keep off: sides by frow and the middle only, so B is above', off.side.get('B') === 'above', obj(off.side));
}

/* ── 3. DRAG.B3 met from the side ── */
{
  const start = sheet(20, [set('A', 6, 0, 5, 3), set('X', 0, 6, 5)]);
  // X (card 1–4, one row) put at col 3, row 1: it overlaps A (card 7–10, rows 0–2) by 1 column and 1 row
  const L = at1c(start, 'X', { col: 3, y: 1 });
  const v = judgeCarry(L, start, { id: 'X', at: { col: 3, y: 1, frow: 1 } }, mem(), ctx);
  ok('3 equal overlaps and no move yet (vertical): not met from the side', !v.met.has('A'), obj(v.met));
  const s = judgeCarry(L, start, { id: 'X', at: { col: 3, y: 1, frow: 1 } }, mem({ lastTarget: { col: 1, y: 1, frow: 1, w: 5 } }), ctx);
  ok('3a equal overlaps and the last move sideways: met from the side, pressed right (its centre to the right of X\'s)', s.met.get('A') === 'right', obj(s.met));
  const L2 = at1c(start, 'X', { col: 2, y: 1 });
  const across = judgeCarry(L2, start, { id: 'X', at: { col: 2, y: 1, frow: 1 } }, mem(), ctx);
  ok('3b X\'s card 3–6 and A\'s card 7–10 share no column: nothing hit, nothing met', !across.met.has('A') && !across.side.has('A'));
  const L3 = at1c(start, 'X', { col: 4, y: 0 });   // X card 5–8 over A card 7–10 rows 0–2: across 2, along 1
  const along = judgeCarry(L3, start, { id: 'X', at: { col: 4, y: 0, frow: 0 } }, mem(), ctx);
  ok('3c across 2, along 1: not met from the side, judged above or below', !along.met.has('A') && along.side.has('A'), [obj(along.met), obj(along.side)]);
  const tall = sheet(20, [set('A', 6, 0, 5, 3), set('X', 0, 6, 5, 3)]), L4 = at1c(tall, 'X', { col: 4, y: 0 });   // across 2, along 3
  const side4 = judgeCarry(L4, tall, { id: 'X', at: { col: 4, y: 0, frow: 0 } }, mem(), ctx);
  ok('3d across 2, along 3: met from the side, pressed right', side4.met.get('A') === 'right', obj(side4.met));
  const left = sheet(20, [set('A', 0, 0, 5, 3), set('X', 8, 6, 5, 3)]), L5 = at1c(left, 'X', { col: 2, y: 0 });   // X card 3–6, A card 1–4
  const s5 = judgeCarry(L5, left, { id: 'X', at: { col: 2, y: 0, frow: 0 } }, mem(), ctx);
  ok('3e pressed to the side its centre lies on: A to the left', s5.met.get('A') === 'left', obj(s5.met));
  const same = sheet(20, [set('A', 2, 0, 3, 3), set('X', 8, 6, 3, 3)]), L6 = at1c(same, 'X', { col: 2, y: 0 });   // both cards 3–4: across 2, along 3
  const s6 = judgeCarry(L6, same, { id: 'X', at: { col: 2, y: 0, frow: 0 } }, mem(), ctx);
  ok('3f centres that coincide: to the left', s6.met.get('A') === 'left', obj(s6.met));
  const sticky = judgeCarry(L3, start, { id: 'X', at: { col: 4, y: 0, frow: 0 } }, mem({ sides: new Map([['A', 'right']]) }), ctx);
  ok('3g sticky: A met from the side before stays so while it shares a row with the target, though the overlaps now judge it above or below', sticky.met.get('A') === 'right' && sticky.sides.get('A') === 'right', obj(sticky.met));
  const gone = judgeCarry(at1c(start, 'X', { col: 0, y: 8 }), start, { id: 'X', at: { col: 0, y: 8, frow: 8 } }, mem({ sides: new Map([['A', 'right']]) }), ctx);
  ok('3h and its record is dropped once it shares no row with the target', !gone.sides.has('A'), obj(gone.sides));
  const off = judgeCarry(L4, tall, { id: 'X', at: { col: 4, y: 0, frow: 0 } }, mem(), ctxOf({}, resolve({ 'DRAG.B3': false })));
  ok('3i DRAG.B3 off: nothing met from the side, every block hit judged above or below', off.met.size === 0 && off.side.has('A'), [obj(off.met), obj(off.side)]);
  ok('3j sideways: more across the columns than along the rows; vertical before any move',
    sideways({ col: 0, y: 0 }, { col: 2, y: 1 }) && !sideways({ col: 0, y: 0 }, { col: 1, y: 1 }) && !sideways(null, { col: 5, y: 0 }));
}

/* ── 4. the neighbour letting the block through ── */
{
  const start = sheet(20, [set('X', 0, 0, 5), set('B', 0, 2, 5, 3)]), L = at1c(start, 'X', { col: 0, y: 3 });
  const j = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 3, frow: 3 } }, mem({ through: { id: 'B', row: 1, side: 'below' } }), ctx);
  ok('4 the neighbour in the memory counts in neither judgement (PR-4)', !j.side.has('B') && !j.met.has('B'), [obj(j.side), obj(j.met)]);
  ok('4a but it is judged apart, for phase 3 to use if it releases it: below, kept from the start, not met from the side', eq(j.held, { side: 'below' }), j.held);
  const none = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 3, frow: 3 } }, mem(), ctx);
  ok('4b with no neighbour in the memory nothing is held', none.held === null && none.side.get('B') === 'below');
}

/* ── 4c. an area as the carried block, and a record of a block no longer hit (the internal review of 345ac6f) ── */
{
  // the area X's frame carried to row 5 (its free row above at 4); T, a one-row text on row 4 in its columns, never stood with it
  const start = sheet(30, [set('T', 2, 4, 4), area('X', 12, 9, 8, 2)]), L = at1c(start, 'X', { col: 0, y: 5 });
  const j = judgeCarry(L, start, { id: 'X', at: { col: 0, y: 5, frow: 5 } }, mem(), ctx);
  ok('4c an area is judged by its frame row, its stored and shown place: T (middle 4.5) is above frow 5', j.side.get('T') === 'above', obj(j.side));
  const s0 = sheet(20, [set('A', 6, 0, 5, 3), set('X', 0, 6, 5, 3)]), L2 = at1c(s0, 'X', { col: 0, y: 0 });   // X card 1–4, A card 7–10: no hit
  const k = judgeCarry(L2, s0, { id: 'X', at: { col: 0, y: 0, frow: 0 } }, mem({ sides: new Map([['A', 'right']]) }), ctx);
  ok('4d a block met from the side earlier and no longer hit keeps its record while it shares a row, though nothing presses it now', k.sides.get('A') === 'right' && !k.met.has('A'), [obj(k.sides), obj(k.met)]);
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

/* ── 6. sides that keep the order of the chains (step 2b, proposed): no block judged below stands over one judged above ── */
{
  // X (B4, columns 1–3 of its extent) carried up from row 12 to row 8 at column 2: B3 stood over it and keeps the side above; B2, at row
  // 8 over B3, never stood in X's columns, so its middle (8.5, below frow 8) would judge it below, and P-DOWN would then drag B3 past X.
  // B2 stood over a block that keeps the side above: it is above too
  const S = sheet(9, [set('B2', 3, 8, 4), set('B3', 1, 9, 5, 3), set('B4', 1, 12, 3, 3)]);
  const j = judgeCarry(at1c(S, 'B4', { col: 2, y: 8 }), S, { id: 'B4', at: { col: 2, y: 8, frow: 8 }, away: false }, mem(), ctx);
  ok('6 B2 over B3, which keeps the side above, is above too, not below by its middle', j.side.get('B3') === 'above' && j.side.get('B2') === 'above', obj(j.side));
  const off = judgeCarry(at1c(S, 'B4', { col: 2, y: 8 }), S, { id: 'B4', at: { col: 2, y: 8, frow: 8 }, away: false }, mem(), ctxOf({}, resolve({ 'DRAG.B2.keep': false })));
  ok('6a with DRAG.B2.keep off every side is the middle\'s: B2 (8.5) and B3 (10.5) both below frow 8', off.side.get('B2') === 'below' && off.side.get('B3') === 'below', obj(off.side));
  // the mirror: X carried down from rows 0–1 to row 6 at column 2; C stood under it and keeps the side below; E, at row 5 under C, never
  // stood in X's columns, so its middle (5.5, not below frow 6) would judge it above, and P-UP would lift it past C. E stood under a block
  // that keeps the side below: it is below too
  const T = sheet(12, [set('X', 0, 0, 3, 2), set('C', 0, 3, 5, 2), set('E', 3, 5, 5, 1)]);
  const k = judgeCarry(at1c(T, 'X', { col: 2, y: 6 }), T, { id: 'X', at: { col: 2, y: 6, frow: 6 }, away: false }, mem(), ctx);
  ok('6b E under C, which keeps the side below, is below too, not above by its middle', k.side.get('C') === 'below' && k.side.get('E') === 'below', obj(k.side));
}

process.exit(t.fails ? 1 : 0);
