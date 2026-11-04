// Runs the lab model of gaps (model.mjs) on the examples of the three review rounds and on random sequences.
// node tests/lab/gap-model/test.mjs [seeds]
import { createModel } from './model.mjs';

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const clean = (m, msg) => { const e = m.check(); ok(!e.length, msg + ': ' + e.join('; ')); };
const blk = (id, c0, c1, y, h = 1) => ({ id, c0, c1, y, h });

// ---- round 1 (finding 1): a text that widens by itself between A and C, then goes
{
  const m = createModel().open([blk('A', 9, 11, 0), blk('C', 9, 11, 5), blk('X', 1, 6, 2, 2), blk('R', 8, 8, 2)]);
  m.remove('R').height('X', 1).width('X', 1, 11);
  eq(m.rows().C, 5, 'r1: C stays when X widens between A and C');
  eq(m.stack('C', 10), 'A | A1 [X:A1] A2 |', 'r1: A\'s gap split round X, still A\'s');
  const s = createModel().open([blk('A', 9, 11, 0), blk('C', 9, 11, 5), blk('X', 1, 6, 2, 2), blk('R', 8, 8, 2)]);
  s.remove('R').height('X', 1).width('X', 1, 11).remove('X');
  eq(s.rows().C, 5, 'r1: C stays when X is deleted');
  eq(s.stack('C', 10), 'A | A4 |', 'r1: A\'s gap whole again');
  const n = createModel().open([blk('A', 9, 11, 0), blk('C', 9, 11, 5), blk('X', 1, 6, 2, 2), blk('R', 8, 8, 2)]);
  n.remove('R').height('X', 1).width('X', 1, 11).width('X', 1, 6);
  eq([n.rows().C, n.stack('C', 10)], [5, 'A | A4 |'], 'r1: C stays when X narrows back');
}

// ---- round 2 (finding 1a): a block put into the free room above a head block
{
  const m = createModel().open([blk('H', 1, 3, 10)]);
  m.insert(blk('X', 1, 3, 5));
  eq([m.rows().H, m.stack('H', 2)], [10, 'top | _5 [X:_1] _4 |'], 'r2a: X stands in H\'s free room');
  m.remove('X');
  eq([m.rows().H, m.stack('H', 2)], [10, 'top | _10 |'], 'r2a: H back at 10 after X goes');
}
// ---- round 2 (finding 1b): two blocks widen between one pair at once
function r2b() {
  return createModel().open([blk('A', 9, 11, 0), blk('C', 9, 11, 8), blk('X', 1, 6, 2, 2), blk('Y', 1, 6, 4, 2), blk('R', 8, 8, 2, 4)])
    .remove('R').height('X', 1).height('Y', 1).width('X', 1, 11).width('Y', 1, 11);
}
{
  const m = r2b();
  eq([m.rows().X, m.rows().Y, m.rows().C], [2, 3, 8], 'r2b: X at 2, Y at 3, C stays at 8');
  eq(m.stack('C', 10), 'A | A1 [X:A1] · [Y:A1] A4 |', 'r2b: one path, A\'s gap split round both');
  eq(r2b().remove('X').remove('Y').stack('C', 10), 'A | A7 |', 'r2b: delete X, then Y');
  eq(r2b().remove('Y').remove('X').stack('C', 10), 'A | A7 |', 'r2b: delete Y, then X');
  const n = r2b().width('X', 1, 6).width('Y', 1, 6);
  eq([n.rows().C, n.stack('C', 10)], [8, 'A | A7 |'], 'r2b: both narrow back');
}

// ---- round 3 (finding 1, the blocker): two paths converge under one inserted block
function r3(aRows) {   // A→L aRows (non-binding), B→L 6 (binding after B grows to 4)
  const L0 = 1 + aRows;
  return createModel().open([blk('A', 1, 3, 0), blk('B', 7, 9, 0, L0 - 6), blk('L', 1, 9, L0)]).height('B', 4);
}
{
  const m = r3(6);
  eq([m.rows().L, m.stack('L', 2), m.stack('L', 8)], [10, 'A | A6 |', 'B | B6 |'], 'r3: before X');
  m.insert(blk('X', 1, 9, 5));
  eq([m.stack('L', 2), m.stack('L', 8), m.stack('L', 5)], ['A | A4 [X:A1] A1 |', 'B | B1 [X:B1] B4 |', 'top | _5 [X:_1] _1 |'], 'r3: both paths kept under X (the free room over L in columns 4–6 is 7 rows, L held lower by B)');
  m.remove('X');
  eq([m.rows().L, m.stack('L', 2), m.stack('L', 8)], [10, 'A | A6 |', 'B | B6 |'], 'r3: both gaps whole after X goes');
  m.remove('B');
  eq(m.rows().L, 7, 'r3: L at 7 after B goes, as without X');
  const e = r3(8).insert(blk('X', 1, 9, 5));
  ok(e.snapshot() !== r3(6).insert(blk('X', 1, 9, 5)).snapshot(), 'r3: A→L of 6 and of 8 stay two states with X in');
  e.remove('X');
  eq(e.stack('L', 2), 'A | A8 |', 'r3: A→L of 8 comes back');
}
// ---- round 3 (finding 2): the last upper neighbour narrows away
{
  const m = createModel().open([blk('L', 9, 11, 10)]);
  m.insert(blk('X', 1, 11, 5)).height('X', 8);
  eq(m.rows().L, 17, 'r3b: X grown to 8 pushes L to 17');
  m.width('X', 1, 6);
  eq([m.rows().L, m.stack('L', 10)], [10, 'top | _10 |'], 'r3b: X narrows off L\'s columns, L back at 10');
}

// ---- G7: a standing block that shrinks below what it covers
{
  const m = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 7)]);
  m.insert(blk('X', 1, 3, 2, 3));
  eq(m.stack('L', 2), 'A | A1 [X:A3] A2 |', 'G7: X covers 3 of A\'s rows');
  m.height('X', 1);
  eq([m.rows().L, m.stack('L', 2)], [5, 'A | A1 [X:A1] A2 |'], 'G7: X shrinks, L rises by 2, the rows it left the gap');
  m.remove('X');
  eq(m.rows().L, 5, 'G7: deleting X moves nothing down');
}
// ---- a standing block carried within its gap keeps the gap whole (the stale lend Fable found in the current rules)
{
  const m = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 7)]);
  m.insert(blk('X', 1, 3, 5));
  m.carry('X', 1);
  eq(m.stack('L', 2), 'A | A5 [X:A1] · |', 'carry: X carried down 1, rows keep their owners');
  m.carry('X', -3).carry('X', 2).carry('X', 1);
  m.remove('X');
  eq([m.rows().L, m.stack('L', 2)], [7, 'A | A6 |'], 'carry: back and forth, then deleted: L at 7, A6');
}
// ---- G5/G6: a head block carried up by hand owns the rows it leaves
{
  const m = createModel().open([blk('A', 1, 3, 5), blk('L', 1, 3, 8)]);
  m.carry('A', -3);
  eq([m.rows().A, m.rows().L, m.stack('L', 2)], [2, 8, 'A | A3+A2 |'.replace('A3+A2', 'A5')], 'G6: A up 3, L stays, the rows are A\'s');
  m.remove('A');
  eq(m.rows().L, 2, 'G6: A deleted, its rows go, L rises to its place');
}
// ---- lesson 18: a gap that does not hold its block, through grow and shrink beside it
{
  const m = createModel().open([blk('A', 1, 3, 0), blk('B', 1, 3, 2), blk('C', 1, 3, 4), blk('D', 5, 7, 0), blk('E', 5, 7, 3), blk('F', 1, 7, 8)]);
  const before = m.stack('F', 6);
  m.height('C', 5).height('C', 1);
  eq(m.stack('F', 6), before, 'lesson 18: E\'s gap over F unchanged');
  m.remove('C');
  eq(m.rows().F, 8, 'lesson 18: F stays under E with E\'s gap after C goes');
}

// ---- G8: a heading over two columns narrows off the right one
{
  const start = () => [blk('A', 1, 9, 0), blk('B', 1, 4, 3), blk('C', 6, 9, 3)];   // A over B and C, two A rows above each
  const b = createModel().open(start()).width('A', 1, 4);
  eq([b.rows().C, b.stack('C', 7)], [3, 'top | _3 |'], 'G8: narrowing is not deleting: C stays, the rows become free room');
  const a = createModel({ ownRowsGoOnNarrow: true }).open(start()).width('A', 1, 4);
  eq([a.rows().C, a.stack('C', 7)], [0, 'top | · |'], 'GAP.9 off: A\'s rows over C go with A, C rises to the top');
}

// ---- an anchor carried down past the gap under it, into a standing block's pad, and back: nothing else moves (INV-7 c)
{
  const m = createModel().open([blk('A', 1, 3, 0), blk('B', 7, 9, 0), blk('L', 1, 9, 7)]).height('B', 4);
  m.insert(blk('X', 1, 3, 8));
  const was = m.rows();
  m.carry('A', 7);
  eq(m.rows().X, was.X, 'pad: A carried down into X\'s pad does not move X');
  m.carry('A', -7);
  eq(m.rows(), was, 'pad: A back, every block where it was');
}
// ---- G8 with slack: an anchor narrowed off a column where its stack did not hold it
{
  const start = () => createModel().open([blk('A', 1, 9, 0), blk('B', 1, 4, 2, 5), blk('X', 1, 9, 8), blk('C', 6, 9, 12)]).height('B', 6);
  const m = start(); const c = m.rows().C;
  m.width('X', 1, 4);
  eq(m.rows().C, c, 'G8 slack: C stays where it is when X narrows off its columns');
  eq(start().remove('X').rows().C < c, true, 'G8 slack: deleting X instead lets C rise');
}

// ---- determinism: the order the blocks come in changes nothing
{
  const bs = [blk('A', 1, 3, 0), blk('B', 7, 9, 0, 4), blk('L', 1, 9, 10), blk('K', 4, 5, 2, 2)];
  const s1 = createModel().open(bs).insert(blk('X', 1, 9, 6)).snapshot();
  const s2 = createModel().open([...bs].reverse()).insert(blk('X', 1, 9, 6)).snapshot();
  eq(s1 === s2, true, 'determinism: shuffled storage');
}

// ---- random sequences against the oracle: the same history without the inserted blocks
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function randomCase(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const W = 14, base = [];
  for (let i = 0; i < 5; i++) for (let t = 0; t < 30; t++) {
    const c0 = int(0, W - 3), c1 = Math.min(W - 1, c0 + int(0, 6)), y = int(0, 26), h = int(1, 3), b = blk('b' + i, c0, c1, y, h);
    if (!base.some((o) => o.c0 <= b.c1 && b.c0 <= o.c1 && o.y < b.y + b.h + 1 && b.y < o.y + o.h + 1)) { base.push(b); break; }
  }
  const m = createModel().open(base), o = createModel().open(base), ins = [], log = [];
  const tryOp = (fn) => { const snap = m.snapshot(); try { fn(m); log.push(fn); return true; } catch (e) { if (m.snapshot() !== snap) throw new Error('a refused op changed the state: ' + e.message); return false; } };
  for (let step = 0; step < 40; step++) {
    const kind = pick(['insert', 'insert', 'grow', 'widen', 'narrow', 'carry', 'base', 'base', 'delete']);
    if (kind === 'insert') { const id = 'x' + ins.length, c0 = int(0, W - 2), b = blk(id, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 40), int(1, 3));
      if (tryOp((mm) => mm.insert(b))) ins.push(id); }
    else if (kind === 'base') { const b = pick(base), h = Math.max(1, m.B.get(b.id).h + pick([-1, 1, 2]));
      if (tryOp((mm) => mm.height(b.id, h))) o.height(b.id, h); }
    else {
      const live = ins.filter((id) => m.B.has(id)); if (!live.length) continue; const id = pick(live), x = { ...m.B.get(id) };
      if (kind === 'grow') { const h = x.h + int(1, 2); tryOp((mm) => mm.height(id, h)); }
      if (kind === 'widen') { const a = Math.max(0, x.c0 - int(0, 2)), b = Math.min(W - 1, x.c1 + int(0, 2)); tryOp((mm) => mm.width(id, a, b)); }
      if (kind === 'narrow' && x.c1 > x.c0) { const a = x.c0 + int(0, 1), b = Math.max(a, x.c1 - int(0, 1)); tryOp((mm) => mm.width(id, a, b)); }
      if (kind === 'carry') { const d = pick([-2, -1, 1, 2]); tryOp((mm) => mm.carry(id, d)); }
      if (kind === 'delete') tryOp((mm) => mm.remove(id));
    }
    const e = m.check(); if (e.length) return { seed, step, errs: e };
  }
  for (const id of ins.filter((i) => m.B.has(i)).sort(() => r() - 0.5)) { const fn = (mm) => mm.remove(id); fn(m); log.push(fn); }
  if (m.snapshot() !== o.snapshot()) return { seed, diff: [m.snapshot(), o.snapshot()] };
  const sh = createModel().open([...base].reverse()); for (const fn of log) fn(sh);   // the same history from storage in another order
  if (sh.snapshot() !== m.snapshot()) return { seed, order: true };
  return null;
}
// carrying a block by hand d rows and back puts every block where it was, and repeating the round trip never makes a gap longer
// (INV-7 c, G4). The first round trip may lengthen a gap that did not hold the block by the slack it used going up: slack is not
// state, so going down cannot know it; owners may move between the gaps (G5)
function retraceCase(seed) {
  const r = rng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 14, base = [];
  for (let i = 0; i < 6; i++) for (let t = 0; t < 30; t++) { const c0 = int(0, W - 3), b = blk('b' + i, c0, Math.min(W - 1, c0 + int(0, 6)), int(0, 26), int(1, 3));
    if (!base.some((o) => o.c0 <= b.c1 && b.c0 <= o.c1 && o.y < b.y + b.h + 1 && b.y < o.y + o.h + 1)) { base.push(b); break; } }
  const m = createModel().open(base); m.height(base[int(0, base.length - 1)].id, 4);   // some slack somewhere
  const lens = () => JSON.stringify([m.rows(), [...m.S.entries()].map(([k, st]) => [k, st.parts.reduce((n, p, i) => n + (i % 2 ? p.lend.length + p.pad : p.length), 0)]).sort()]);
  const rowsBefore = JSON.stringify(m.rows()), id = base[int(0, base.length - 1)].id, d = int(1, 3) * (r() < 0.5 ? -1 : 1);
  try { m.carry(id, d); } catch { return null; }
  const moved = Object.entries(m.rows()).some(([k, y]) => k !== id && y !== JSON.parse(rowsBefore)[k]);
  if (moved) return null;   // the carry pushed a neighbour: a push is kept after the drop (M2), so no round trip is expected
  m.carry(id, -d);
  if (JSON.stringify(m.rows()) !== rowsBefore) return { seed, id, d, rows: true };
  const once = lens();
  for (let k = 0; k < 3; k++) { m.carry(id, d); m.carry(id, -d); }
  return lens() === once ? null : { seed, id, d, grows: true };
}
// a deletion never moves another block down (G2, G7), whatever the history, shrinking standing blocks included
function deleteCase(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 12;
  const m = createModel().open([blk('a', 0, 5, 0), blk('b', 6, 11, 0, 3), blk('l', 0, 11, 12)]); let n = 0;
  for (let step = 0; step < 30; step++) {
    const live = [...m.B.keys()], kind = pick(['insert', 'insert', 'height', 'width', 'delete']);
    try {
      if (kind === 'insert') { const c0 = int(0, W - 2); m.insert(blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 6)), int(0, 30), int(1, 3))); }
      if (kind === 'height') { const id = pick(live); m.height(id, Math.max(1, m.B.get(id).h + pick([-2, -1, 1, 2]))); }
      if (kind === 'width') { const id = pick(live), x = m.B.get(id), a = Math.max(0, x.c0 + pick([-1, 0, 1])); m.width(id, a, Math.max(a, Math.min(W - 1, x.c1 + pick([-1, 0, 1])))); }
      if (kind === 'delete' && live.length > 1) { const id = pick(live), was = m.rows(); m.remove(id); const now = m.rows();
        for (const k of Object.keys(now)) if (now[k] > was[k]) return { seed, step, deleted: id, moved: k, from: was[k], to: now[k] }; }
    } catch { /* refused: nothing changed */ }
    const e = m.check(); if (e.length) return { seed, step, errs: e };
  }
  return null;
}
{
  const N = +process.argv[2] || 2000; let bad = 0, first = null;
  for (let s = 1; s <= N; s++) { let res; try { res = randomCase(s); } catch (e) { res = { seed: s, error: e.message }; } if (res) { bad++; first = first || res; } }
  ok(bad === 0, `random: ${bad} of ${N} sequences leave a trace; first: ${JSON.stringify(first)}`);
  console.log(`random: ${N} sequences of inserts, growth, widening, narrowing, carries and deletions, every inserted block deleted at the end, compared with the history without them`);
}

for (const [name, fn, N] of [['retrace', retraceCase, 2000], ['delete moves nothing down', deleteCase, 2000]]) {
  let bad = 0, first = null;
  for (let s = 1; s <= N; s++) { let res; try { res = fn(s); } catch (e) { res = { seed: s, error: e.message }; } if (res) { bad++; first = first || res; } }
  ok(bad === 0, `${name}: ${bad} of ${N}; first: ${JSON.stringify(first)}`);
  console.log(`${name}: ${N} random cases`);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
