// Runs the lab model of gaps (model.mjs) on the examples of the review rounds and on random sequences.
// node tests/lab/gap-model/test.mjs [seeds]
import { createModel as labModel } from './model.mjs';
// tests/layoutgap-oracle.mjs runs these same cases on the engine's GAP, through the model's API (tests/lib/gapdriver.mjs)
const createModel = globalThis.GAP_MODEL_FACTORY || labModel;

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
  eq([m.rows().A, m.rows().L, m.stack('L', 2)], [2, 8, 'A | A5 |'], 'G6: A up 3, L stays, the rows are A\'s');
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
  const a = createModel({ gap9: false }).open(start()).width('A', 1, 4);
  eq([a.rows().C, a.stack('C', 7)], [0, 'top | · |'], 'GAP.9 off: A\'s rows over C go with A, C rises to the top');
}

// ---- an anchor carried down past the gap under it, into the room above a standing block (its own rows), and back: nothing else moves (INV-7 c)
{
  const m = createModel().open([blk('A', 1, 3, 0), blk('B', 7, 9, 0), blk('L', 1, 9, 7)]).height('B', 4);
  m.insert(blk('X', 1, 3, 8));
  const was = m.rows();
  m.carry('A', 7);
  eq(m.rows().X, was.X, 'room: A carried down into the room above X does not move X');
  m.carry('A', -7);
  eq(m.rows(), was, 'room: A back, every block where it was');
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

// ---- round 4 (finding 1, the blocker): a block put into a gap while it shows taller than it is (two measures, §2.1). The stacks are
// the same in both measures: its lend is by its canonical height, and its temporary rows push the blocks under it on the screen only
{
  const at = () => createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 12)]).insert({ ...blk('X', 1, 3, 3, 3), e: 3 });   // X is 3, shown 6
  const m = at();
  eq([m.stack('L', 2), m.rows().L, m.rows('canonical').L], ['A | A2 [X:A3] A6 |', 15, 12], 'r4.1: dropped shown at 6: it covers 3 rows; its temporary rows push L on the screen, to 15; canonical L stays at 12');
  m.show('X', 0);
  eq([m.stack('L', 2), m.rows().L, m.rows('canonical').L], ['A | A2 [X:A3] A6 |', 12, 12], 'r4.1: the temporary height ends: no stack changes, L stays');
  m.show('X', 3);
  eq([m.rows().L, m.rows('canonical').L], [15, 12], 'r4.1: shown again: the same push on the screen, nothing written');
  const s = m.stored(), m2 = createModel().load(s);
  eq([m2.rows().L, m2.stack('L', 2)], [12, 'A | A2 [X:A3] A6 |'], 'r4.1: reloaded from what 0.2 stores');
  const m1 = createModel().open(m.places());
  eq(m1.rows(), m.rows('canonical'), 'r4.1: reloaded from what 0.1 stores (places only): the same canonical rows');
  const before = m.snapshot(); let refused = false; try { m.carry('X', 7); } catch { refused = true; }
  eq([refused, m.snapshot() === before], [true, true], 'r4.1: a refused move (it would hit L) changes nothing');
  m.carry('X', 1);
  eq([m.stack('L', 2), m.rows().L, m.rows('canonical').X], ['A | A3 [X:A3] A5 |', 15, 4], 'r4.1: carried down one row inside the gap, in both measures');
  m.show('X', 0).remove('X');
  eq([m.stack('L', 2), m.rows().L, m.rows('canonical').L], ['A | A11 |', 12, 12], 'r4.1: removed after the temporary height ended: the gap whole, L at 12');
  const g = at().show('X', 0).height('X', 4);
  eq([g.rows('canonical').L, g.stack('L', 2)], [13, 'A | A2 [X:A3] A6 |'], 'r4.1: a real growth pushes L as any text does (H1)');
  const k = at().height('X', 2);
  eq([k.rows().L, k.rows('canonical').L, k.stack('L', 2)], [14, 11, 'A | A2 [X:A2] A6 |'], 'r4.1: a real shrink (G7): L rises by 1 in both measures');
  eq(k.remove('X').stack('L', 2), 'A | A10 |', 'r4.1: then removed: nothing moves down');
  const p = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 12)]).insert(blk('X', 1, 3, 3, 3)).show('X', 3);
  eq([p.rows().L, p.rows('canonical').L, p.stack('L', 2)], [15, 12, 'A | A2 [X:A3] A6 |'], 'r4.1: put in as it is, then shown taller: the same, whatever came first');
  const q = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 9)]).insert(blk('X', 1, 3, 3, 3)).show('X', 4);
  eq([q.rows().L, q.rows('canonical').L], [13, 9], 'r4.1: the temporary rows push L on the screen only');
  const t = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 12)]).insert(blk('X', 1, 3, 3, 6)).height('X', 3);
  eq([t.rows().L, t.remove('X').stack('L', 2), t.rows().L], [9, 'A | A8 |', 9], 'r4.1: the reviewer\'s trace is a real shrink from 6 to 3: G7 lets L rise to 9 and keeps it there');
  const a = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 12)]).insert({ ...blk('X', 1, 3, 3, 3), e: 3 }).show('X', 0).insert(blk('Y', 1, 3, 7));
  eq([a.stack('L', 2), a.rows().L], ['A | A2 [X:A3] A1 [Y:A1] A4 |', 12], 'r4.1: the rows that lay under its temporary rows are rows of the gap: a block can be put there');
  const c = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 12)]).insert({ ...blk('X', 1, 3, 3, 3), e: 3 }).show('X', 0).carry('L', -5);
  eq([c.rows().L, c.stack('L', 2)], [7, 'A | A2 [X:A3] A1 |'], 'r4.1: and the block under it can be carried up into them');
}
// ---- the temporary heights write nothing: a block that comes in by itself takes its canonical row; an anchor narrowed off takes
// its canonical body and slack (Fable's check of round 4)
{
  const m = createModel().open([blk('A', 0, 4, 0), blk('B', 5, 9, 0, 3), blk('L', 0, 9, 15)]).insert(blk('X', 4, 6, 4, 4));
  m.show('A', 3);
  eq([m.rows().X, m.rows('canonical').X], [7, 4], 'measures: A shown taller pushes X on the screen');
  m.width('X', 4, 7);
  eq([m.rows().X, m.rows('canonical').X, m.rows('canonical').L, m.stack('L', 7)], [7, 4, 15, 'B | B1 [X:B4] B7 |'], 'measures: X widened into B\'s columns keeps its canonical row there');
  m.show('A', 0);
  eq([m.rows().X, m.rows().L], [4, 15], 'measures: A folds back: X and L back');
  const k = createModel().open([blk('X', 1, 6, 0, 2), blk('L', 4, 6, 4), blk('K', 1, 3, 10)]).show('X', 3).width('X', 1, 3);
  eq([k.rows('canonical').L, k.rows().L], [4, 4], 'measures: an anchor shown taller narrowed off: L keeps its canonical row, and on the screen X\'s temporary rows stop pushing it');
  const start = () => createModel().open([blk('Q', 7, 7, 0, 11), blk('B', 6, 7, 13, 2), blk('L', 6, 6, 18)]).height('Q', 13);
  const w = start().insert({ ...blk('X', 6, 6, 12, 1), e: 2 }).width('B', 7, 7);
  eq([w.rows().L, w.rows('canonical').L], [22, 20], 'measures: B narrowed off under X shown taller: L keeps its canonical row (GAP.9); on the screen X\'s temporary rows, which B\'s slack took before, now push it');
  eq(w.remove('X').rows().L, start().width('B', 7, 7).rows().L, 'measures: then X removed: as without X');
}
// ---- round 4 (finding 2): an owner deleted takes its rows from every stack of the column, not only the one beside it
{
  const start = () => createModel().open([blk('U', 1, 3, 0), blk('A', 1, 3, 5), blk('B', 1, 3, 6)]).carry('A', -2);
  const m = start();
  eq([m.rows(), m.stack('A', 2), m.stack('B', 2)], [{ A: 3, B: 6, U: 0 }, 'U | U2 |', 'A | U2 |'], 'r4.2: G5 puts U\'s rows under A');
  m.remove('U');
  eq([m.rows(), m.stack('A', 2), m.stack('B', 2)], [{ A: 0, B: 1 }, 'top | · |', 'A | · |'], 'r4.2: U deleted: both of its runs go, A at 0, B at 1');
  const a = start().carryTo('U', 8, 10, 0);
  eq([a.rows().A, a.rows().B, a.stack('B', 2)], [0, 1, 'A | · |'], 'r4.2: U carried away to other columns: the same');
  const n = start().width('U', 2, 3);
  eq([n.rows(), n.stack('B', 1)], [{ A: 3, B: 6, U: 0 }, 'A | A2 |'], 'r4.2: U narrowed off column 1 (GAP.9 on): its rows there become the rows of the stack they lie in');
  const f = createModel({ gap9: false }).open([blk('U', 1, 3, 0), blk('A', 1, 3, 5), blk('B', 1, 3, 6)]).carry('A', -2).width('U', 2, 3);
  eq([f.stack('A', 1), f.stack('B', 1)], ['top | · |', 'A | · |'], 'r4.2: GAP.9 off: they go from column 1 as after a deletion');
}
// ---- round 4 (finding 3): a head block that stands in the free room of the block under it, moved up by hand (G6, GAP.8)
{
  const m = createModel().open([blk('H', 1, 3, 10)]).insert(blk('X', 1, 3, 5)).carry('X', -2);
  eq([m.rows(), m.stack('H', 2)], [{ H: 10, X: 3 }, 'top | _3 [X:_1] X2+_4 |'], 'r4.3: the two rows it left are its own');
  m.remove('X');
  eq([m.rows().H, m.stack('H', 2)], [8, 'top | _8 |'], 'r4.3: deleted, it takes them along: H rises by 2');
  const b = createModel().open([blk('H', 1, 3, 10)]).insert(blk('X', 1, 3, 5)).carry('X', -2).carry('X', 1);
  eq(b.stack('H', 2), 'top | _4 [X:_1] X1+_4 |', 'r4.3: moved down again, it uses its own rows first');
  const o = createModel({ gap8: false }).open([blk('H', 1, 3, 10)]).insert(blk('X', 1, 3, 5)).carry('X', -2);
  eq([o.stack('H', 2), o.remove('X').rows().H], ['top | _3 [X:_1] _6 |', 10], 'r4.3: GAP.8 off: the rows it left stay free room, H stays');
  const a = createModel({ gap8: false }).open([blk('A', 1, 3, 5), blk('L', 1, 3, 8)]).carry('A', -3);
  eq([a.stack('L', 2), a.remove('A').rows().L], ['A | _3+A2 |', 5], 'r4.3: GAP.8 off for an anchor head too');
}
// ---- a move is made on the displayed layout, as if the temporary heights were real; with them taken out it holds where a gap
// holds the block (H1), and a block that came in by itself past a block of its new column on the screen stays under it
{
  const m = createModel().open([blk('A', 1, 1, 0), blk('U', 2, 2, 0, 3), blk('X', 1, 2, 3)]).show('A', 3);
  m.carry('X', -1);
  eq([m.rows().X, m.rows('canonical').X, m.stack('X', 1), m.stack('X', 2)], [5, 3, 'A | A1 |', 'U | · |'], 'measures: X under A shown taller carried up one row: on the screen it moves; canonically U holds it');
  m.carry('X', 2);
  eq([m.rows().X, m.rows('canonical').X], [7, 4], 'measures: carried down two: canonically one, where A\'s gap holds it');
  m.carry('X', -1).show('A', 0);
  eq([m.rows().X, m.stack('X', 1), m.stack('X', 2)], [3, 'A | A2 |', 'U | · |'], 'measures: back, then A folds: X where it was, every gap as it was');
  const p = createModel().open([blk('A', 1, 1, 0), blk('X', 1, 1, 3), blk('S', 2, 2, 10), blk('L', 2, 2, 20)]).show('A', 8).width('X', 1, 2);
  eq([p.rows('canonical').X, p.stack('L', 2), p.show('A', 0).rows().X], [11, 'S | · [X:S1] S8 |', 11], 'measures: X, carried past S on the screen by A\'s temporary rows, widened under S: the order on the screen wins and X stays under S');
}
// ---- round 5: the integration of the two measures and of the steps
{
  // (1) fit after a canonical entry: SETTLE's rows are only targets; FOLLOW over the new stacks gives the rows, and no stack is cut
  const m = createModel().open([blk('A', 1, 1, 0), blk('X', 1, 1, 3), blk('S', 2, 2, 0), blk('L', 2, 2, 20)]).show('A', 8).width('X', 1, 2);
  eq([m.rows().X, m.rows('canonical').X, m.rows().L, m.rows('canonical').L, m.stack('L', 2)], [11, 3, 28, 20, 'S | S2 [X:S1] S16 |'], 'r5.1: X widened under A shown taller: canonical row kept, L pushed on the screen only');
  const before = m.snapshot(); m.fit({ X: 11, L: 20 });
  eq(m.snapshot() === before, true, 'r5.1: fit with the rows SETTLE had (L still at 20) changes nothing: L stands where FOLLOW puts it, no row is cut');
  eq([m.show('A', 0).rows().L, m.stack('L', 2)], [20, 'S | S2 [X:S1] S16 |'], 'r5.1: A folds: L back at 20, the gap whole');
  const f = createModel().open([blk('A', 1, 1, 0), blk('L', 1, 1, 5)]).fit({ L: 7 });
  eq([f.rows().L, f.stack('L', 1)], [7, 'A | A6 |'], 'r5.1: a block SETTLE put lower than its stacks hold it gets the rows it lacks, of its stack\'s u');
  // (2) a primitive that moves blocks by different rows reports one rigid step per common part, in order: P-UP leaving A=0, B=1, X=2
  const p = createModel().open([blk('A', 1, 1, 2), blk('B', 1, 1, 6), blk('X', 1, 1, 8)]);
  p.move(['B'], -3).move(['A', 'B'], -2).move(['X'], -6);
  eq([p.rows(), p.stack('A', 1), p.stack('B', 1), p.stack('X', 1)], [{ A: 0, B: 1, X: 2 }, 'top | · |', 'A | · |', 'B | · |'], 'r5.2: B up 3, then A and B up 2, then X up 6: every gap closed as the moves say');
  const q = createModel().open([blk('U', 1, 1, 0), blk('A', 1, 1, 4), blk('B', 1, 1, 7), blk('X', 1, 1, 9)]).move(['B'], -2).move(['A', 'B'], -1);
  eq([q.rows(), q.stack('A', 1), q.stack('B', 1), q.stack('X', 1)], [{ A: 3, B: 4, U: 0, X: 9 }, 'U | U2 |', 'A | · |', 'B | U1+A2+B1 |'], 'r5.2: the rows each step leaves come under the run that moved, with their owners');
  // (4) the inverse undo projects an old canonical row into the displayed layout by the push at it
  const u = createModel().open([blk('A', 1, 1, 0), blk('X', 1, 1, 3)]).show('A', 8).carry('X', 1);
  eq([u.rows().X, u.rows('canonical').X], [12, 4], 'r5.4: X moved down one under A shown taller; an undo then carries it back');
  let inside = false; try { u.carry('X', 3 - u.rows().X); } catch { inside = true; }
  eq(inside, true, 'r5.4: the old canonical row 3 used as a displayed target lies inside A shown taller: refused');
  const push = u.rows().A + u.B.get('A').h + u.B.get('A').e - (u.rows('canonical').A + u.B.get('A').h);   // the block right above: its displayed bottom less its canonical bottom
  u.carry('X', 3 + push - u.rows().X);
  eq([u.rows().X, u.rows('canonical').X, u.stack('X', 1)], [11, 3, 'A | A2 |'], 'r5.4: carried back by a displayed move of the push at it (8), in its one column: displayed 11, canonical 3 (over several columns an undo uses its canonical cell, r6.1)');
}
// ---- round 6: coordinates and accounting across columns and measures
{
  // (1) an undo puts a block back by its canonical row in every column; one displayed row cannot carry two columns' gaps
  const start = () => createModel().open([blk('A', 1, 1, 0), blk('B', 2, 2, 0), blk('X', 1, 2, 3)]).show('A', 8);
  const m = start();
  eq([m.rows().X, m.rows('canonical').X], [11, 3], 'r6.1: X over A shown taller and over B');
  m.remove('X').restore(blk('X', 1, 2, 3));
  eq([m.stack('X', 1), m.stack('X', 2), m.rows().X, m.rows('canonical').X, m.show('A', 0).rows().X], ['A | A2 |', 'B | B2 |', 11, 3, 3], 'r6.1: restored at its canonical cell: both gaps as they were, back at 3 when A folds');
  const d = start().remove('X').insert(blk('X', 1, 2, 11));
  eq([d.stack('X', 2), d.rows('canonical').X], ['B | B10 |', 11], 'r6.1: dropped at the displayed row 11 instead, column 2 gets ten rows: why the undo carries the canonical cell');
  const w = start().carryTo('X', 4, 5, 20).carryTo('X', 1, 2, 3, true);
  eq([w.stack('X', 1), w.stack('X', 2), w.rows('canonical').X], ['A | A2 |', 'B | B2 |', 3], 'r6.1: carried away and back to its old cell by the undo: the same');
  // (2) a block that comes into a column by itself takes the canonical row the stacks and heights give it now, a growth included
  const g = createModel().open([blk('A', 1, 1, 0), blk('B', 2, 2, 0, 4), blk('X', 1, 2, 6), blk('S', 3, 3, 0), blk('L', 3, 3, 30)]).show('A', 8);
  eq([g.rows().X, g.rows('canonical').X], [14, 6], 'r6.2: X pushed by A on the screen, held by B canonically');
  g.height('B', 11);
  eq([g.rows().X, g.rows('canonical').X], [14, 13], 'r6.2: B grows: X canonically at 13, its push now 1');
  g.width('X', 1, 3);
  eq([g.rows('canonical').L, g.stack('L', 3), g.show('A', 0).rows().L], [30, 'S | S12 [X:S1] S16 |', 30], 'r6.2: X widened into column 3 at its canonical row 13: L keeps 30');
  // (3) GAP.5.1 off: rule 1 still sets every gap's length; only the owners of the rows a move carries change; an upward move works
  for (const gap51 of [true, false]) {
    const a = createModel({ gap51 }).open([blk('A', 1, 1, 0), blk('X', 1, 1, 5)]).carry('X', -2);
    eq([a.rows().X, a.stack('X', 1)], [3, 'A | A2 |'], `r6.3: GAP.5.1 ${gap51 ? 'on' : 'off'}: X carried up two rows`);
    const b = createModel({ gap51 }).open([blk('U', 1, 1, 0), blk('A', 1, 1, 5), blk('B', 1, 1, 6)]).carry('A', -2);
    eq([b.rows(), b.stack('B', 1)], [{ A: 3, B: 6, U: 0 }, gap51 ? 'A | U2 |' : 'A | A2 |'], `r6.3: GAP.5.1 ${gap51 ? 'on' : 'off'}: B stays; the rows A left come under it ${gap51 ? 'with their owner (G5)' : 'as rows of the stack they come into'}`);
  }
  // (4) an area takes part by its extent: lends, retained bodies and rows in extent rows
  const r = createModel().open([blk('A', 2, 2, 0), blk('L', 2, 2, 11)]).insert({ ...blk('R', 2, 2, 4, 2), area: true });
  eq([r.stack('L', 2), r.rows().L], ['A | A2 [R:A4] A4 |', 11], 'r6.4: an area put between A and L covers four rows, its frame and its free rows');
  eq(r.remove('R').stack('L', 2), 'A | A10 |', 'r6.4: taken away, it gives them back');
  const n = createModel().open([blk('A', 2, 2, 0), { ...blk('R', 2, 4, 4, 2), area: true }, blk('L', 2, 2, 11)]).width('R', 4, 4);
  eq([n.rows().L, n.stack('L', 2)], [11, 'A | A10 |'], 'r6.4: an area narrowed off a column keeps its extent there (GAP.9): L stays at 11');
  let top = false; try { createModel().open([{ ...blk('R', 2, 3, 0, 2), area: true }]); } catch { top = true; }
  eq(top, true, 'r6.4: an area\'s frame never stands at row 0: its free row above lies in the container');
  // (5) fit visits its targets in reading order, whatever order they are given in
  const f1 = createModel().open([blk('A', 1, 1, 0), blk('B', 1, 1, 5)]).fit({ A: 2, B: 7 }).rows();
  const f2 = createModel().open([blk('A', 1, 1, 0), blk('B', 1, 1, 5)]).fit({ B: 7, A: 2 }).rows();
  eq([f1, f2], [{ A: 2, B: 7 }, { A: 2, B: 7 }], 'r6.5: fit gives the same in either order of its targets');
}
// ---- round 7: an arrival in the same RELINK as a move; GAP.5.1 off keeps every other block where it is
{
  // (1) X moves up one under A shown taller, held canonically by U, and comes into column 3 in the same RELINK: its reference is
  // rule 1 replayed, canonical 3, not its canonical row plus the displayed step (2)
  const m = createModel().open([blk('A', 1, 1, 0), blk('U', 2, 2, 0, 3), blk('X', 1, 2, 3), blk('S', 3, 3, 0), blk('L', 3, 3, 20)]).show('A', 3);
  eq([m.rows().X, m.rows('canonical').X], [6, 3], 'r7.1: X pushed by A on the screen');
  m.step([[['X'], -1]], { X: [1, 3] });
  eq([m.rows().X, m.rows('canonical').X, m.stack('L', 3), m.rows('canonical').L], [5, 3, 'S | S2 [X:S1] S16 |', 20], 'r7.1: moved and widened in one RELINK: entered at its reference 3, L keeps 20');
  eq(m.show('A', 0).rows().L, 20, 'r7.1: A folds: L at 20, no extra row');
  // (2) a grown standing block carried in both states of GAP.5.1: the same lengths, L does not move
  for (const gap51 of [true, false]) {
    const g = createModel({ gap51 }).open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 2)).height('X', 3);
    eq([g.rows().L, g.stack('L', 1)], [12, 'A | A1 [X:A1] A7 |'], `r7.2: GAP.5.1 ${gap51 ? 'on' : 'off'}: X grew to 3, L pushed to 12`);
    g.carry('X', 1);
    eq([g.rows().X, g.rows().L, g.stack('L', 1)], [3, 12, 'A | A2 [X:A1] A6 |'], `r7.2: GAP.5.1 ${gap51 ? 'on' : 'off'}: carried down one, L stays at 12`);
    eq(g.remove('X').rows().L, 10, `r7.2: GAP.5.1 ${gap51 ? 'on' : 'off'}: X deleted: its growth goes, L rises to 10`);
  }
  // (3) several blocks moved together with GAP.5.1 off, in either order of their ids
  for (const gap51 of [true, false]) for (const ids of [['A', 'B'], ['B', 'A']]) {
    const k = createModel({ gap51 }).open([blk('U', 1, 1, 0), blk('A', 1, 1, 5), blk('B', 1, 1, 8), blk('L', 1, 1, 12)]).move(ids, -1);
    eq(k.rows(), { A: 4, B: 7, L: 12, U: 0 }, `r7.3: GAP.5.1 ${gap51 ? 'on' : 'off'}, ${ids.join(', ')} up one: L stays`);
  }
}
// ---- round 8: GAP.5.1 off moves nothing else in either measure; the oracle's one RELINK
{
  for (const gap51 of [true, false]) {
    const m = createModel({ gap51 }).open([blk('A', 1, 1, 0), blk('B', 2, 2, 0, 3), blk('L', 1, 2, 12), blk('X', 2, 2, 20)]).height('A', 5).show('B', 1);
    eq([m.rows(), m.rows('canonical')], [{ A: 0, B: 0, L: 16, X: 24 }, { A: 0, B: 0, L: 16, X: 24 }], `r8.1: GAP.5.1 ${gap51 ? 'on' : 'off'}: B's temporary row taken by the slack`);
    m.carry('L', 2);
    eq([m.rows().L, m.rows().X, m.rows('canonical').X, m.show('B', 0).rows().X], [18, 24, 24, 24], `r8.1: GAP.5.1 ${gap51 ? 'on' : 'off'}: L moved down two, X stays at 24 in both measures, and after B's temporary row ends`);
  }
  const x = createModel().open([blk('X', 1, 1, 3)]).step([[['X'], 1]], { X: [2, 2] });
  eq([x.rows().X, x.B.get('X').c0, x.stack('X', 2)], [4, 2, 'top | _4 |'], 'r8.2: moved down one and narrowed sideways in one RELINK: X at column 2, row 4');
  const z = createModel().open([blk('A', 1, 1, 5), blk('Z', 2, 2, 2)]).step([], { A: [1, 3], Z: [2, 3] });
  eq([z.stack('Z', 3), z.stack('A', 3)], ['top | _2 |', 'Z | Z2 |'], 'r8.3: arrivals top to bottom: Z first, then A under it');
  eq(z.remove('Z').width('A', 3, 3).rows().A, 2, 'r8.3: Z deleted and A narrowed to column 3: A at 2, as the order of arrival gives');
}
// ---- round 9: the oracle's one RELINK over several steps, fit at its end, and what the switch's owners change later
{
  const m = createModel().open([blk('X', 1, 1, 3)]).step([[['X'], 1], [['X'], 1]]);
  eq(m.rows().X, 5, 'r9.1: two steps in one RELINK, each measured at the rows it starts from: X at 5');
  const f = createModel().open([blk('A', 1, 1, 0), blk('X', 1, 1, 3), blk('S', 2, 2, 0), blk('L', 2, 2, 20)]).show('A', 8).step([[['L'], 1]], { X: [1, 2] });
  eq([f.rows().L, f.rows('canonical').L], [29, 21], 'r9.2: L moved down one while X widens over it at its canonical row: FOLLOW puts L lower than its target on the screen, and that is the result (rule 5)');
  const d = [true, false].map((gap51) => createModel({ gap51 }).open([blk('U', 1, 1, 0), blk('A', 1, 1, 5), blk('B', 1, 1, 6)]).carry('A', -2).remove('U').rows().B);
  eq(d, [1, 3], 'r9.3: after GAP.5.1 off the rows A left are A\'s, not U\'s, so deleting U then takes fewer: an expected difference');
}
// ---- the final review: a carry that keeps some columns, the switches GAP.5.2 and GAP.5.3, a uniform shift of the columns
{
  // a carry one column sideways keeps two columns: the one it leaves it leaves as a narrowing does (the owner, 2026-11-10, M9, refining
  // the final review's G2 reading), so its rows stay there and L stays when X is deleted. The engine still carries it away from that
  // column until step 1b's second part: run on it (tests/layoutgap-oracle.mjs) the old expectation holds
  const ENGINE = !!globalThis.GAP_MODEL_FACTORY;
  const start = () => createModel().open([blk('A', 1, 3, 0), blk('X', 1, 3, 2), blk('L', 1, 3, 6)]);
  const c = start().carryTo('X', 2, 4, 2);
  eq([c.rows().L, c.stack('L', 1), c.stack('L', 2), c.stack('X', 4)], [6, ENGINE ? 'A | A1 |' : 'A | A5 |', 'X | X3 |', 'top | _2 |'], 'final.1: X carried one column sideways: it leaves column 1 as a narrowing does (M9), L held by columns 2 and 3');
  eq(c.remove('X').rows().L, ENGINE ? 2 : 6, 'final.1: X deleted then: L stays, its rows in column 1 kept (M9, G8)');
  const n = start().width('X', 2, 4);
  eq([n.stack('L', 1), n.remove('X').rows().L], ['A | A5 |', 6], 'final.1: X narrowed off column 1 instead keeps its rows there (GAP.9): L stays when it is deleted');
  // GAP.5.2 off: a block that went gives nothing back
  for (const gap52 of [true, false]) {
    const s1 = createModel({ gap52 }).open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 4)).remove('X');
    eq([s1.rows().L, s1.stack('L', 1)], gap52 ? [10, 'A | A9 |'] : [9, 'A | A8 |'], `final.2: GAP.5.2 ${gap52 ? 'on' : 'off'}: a standing block deleted ${gap52 ? 'gives its lend back' : 'takes its lend along: L rises (G2 without C3)'}`);
    const s2 = createModel({ gap52 }).open([blk('A', 1, 1, 0), blk('X', 1, 1, 4), blk('L', 1, 1, 8)]).remove('X');
    eq([s2.rows().L, s2.stack('L', 1)], gap52 ? [4, 'A | A3 |'] : [1, 'A | · |'], `final.2: GAP.5.2 ${gap52 ? 'on' : 'off'}: an anchor deleted, ${gap52 ? 'its own rows go' : 'the rows of its stack go too'}`);
  }
  // GAP.5.3 off: a block that comes between cuts the stack (lesson 17)
  for (const gap53 of [true, false]) {
    const t = createModel({ gap53 }).open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 4));
    eq([t.rows().L, t.stack('L', 1), t.stack('X', 1)], gap53 ? [10, 'A | A3 [X:A1] A5 |', null] : [10, 'X | X5 |', 'A | A3 |'], `final.3: GAP.5.3 ${gap53 ? 'on' : 'off'}: X put between A and L ${gap53 ? 'stands in A\'s gap' : 'cuts it, the rows under it its own'}`);
    eq(t.remove('X').rows().L, gap53 ? 10 : 4, `final.3: GAP.5.3 ${gap53 ? 'on' : 'off'}: X deleted, L ${gap53 ? 'stays (C3)' : 'rises by X and its rows'}`);
  }
  // a uniform shift of every column (an area's left side handle) moves the stacks with their columns: owners and lends stay
  const u = createModel().open([blk('U', 2, 4, 0), blk('A', 2, 4, 5), blk('B', 2, 4, 6), blk('L', 2, 4, 12)]).carry('A', -2).insert(blk('X', 2, 4, 8));
  const before = JSON.stringify([u.stack('B', 3), u.stack('L', 3), u.rows()]);
  u.shift(-1);
  eq(JSON.stringify([u.stack('B', 2), u.stack('L', 2), u.rows()]), before, 'final.4: shifted one column left: the same stacks, re-keyed');
  u.shift(1);
  eq(JSON.stringify([u.stack('B', 3), u.stack('L', 3), u.rows()]), before, 'final.4: and back: every stack as it was');
}
// ---- round 10: G7 at every write of a height; the carried block fitted with no vertical step; GAP.5.2 off under the last anchor;
// the wall of an area's left side handle; opening a valid note; a rules change and the exact undo
{
  // a standing text that gets shorter by widening (its rest width back, SIZE.8), not by a height of its own: its lend is cut at once
  const g = createModel().open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 3, 3)).show('A', 2);
  eq(g.stack('L', 1), 'A | A2 [X:A3] A4 |', 'r10.1: X stands in A\'s gap, its lend its three rows');
  g.width('X', 1, 2, 1);
  eq([g.stack('L', 1), g.rows().L, g.rows('canonical').L], ['A | A2 [X:A1] A4 |', 10, 8], 'r10.1: X widened into column 2 and got one row tall: its lend is cut to one row (G7) and L rises by two in both measures');
  clean(g, 'r10.1: invariants after the widening');
  g.remove('X');
  eq([g.stack('L', 1), g.rows().L, g.rows('canonical').L], ['A | A7 |', 10, 8], 'r10.1: X deleted then: L stays, never down (G7)');
  // a carry that keeps columns and moves no row: the carried block is fitted to its displayed target all the same (rule 5)
  const k = createModel().open([blk('A', 1, 1, 0, 10), blk('B', 2, 8, 0), blk('X', 1, 8, 12, 2)]).show('A', 5);
  eq([k.rows().X, k.rows('canonical').X], [17, 12], 'r10.3: X shown at 17 under A\'s temporary rows, canonically at 12');
  k.carryTo('X', 2, 8, 17);
  eq([k.rows().X, k.rows('canonical').X, k.stack('X', 2)], [17, 17, 'B | B16 |'], 'r10.3: X narrowed at the edge off the column that held it lower, dropped where it is shown: it stays at 17, the rows it lacked B\'s');
  clean(k, 'r10.3: invariants');
  // GAP.5.2 off: under the last anchor, the lowest standing block takes its place and the stack loses its rows and lends too
  for (const gap52 of [true, false]) {
    const p = createModel({ gap52 }).open([blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 5)).insert(blk('Y', 1, 1, 7)).remove('L');
    eq([p.rows().X, p.rows().Y, p.stack('Y', 1)], gap52 ? [5, 7, 'top | _5 [X:_1] _1 |'] : [0, 1, 'top | · [X:·] · |'], `r10.4: GAP.5.2 ${gap52 ? 'on' : 'off'}: the last anchor deleted, Y takes its place${gap52 ? ', the rows above it kept' : ' with no rows and X with no lend'}`);
  }
  // an area's left side handle carried inwards by two columns: the children keep their sheet cells through columns left of 0, then
  // the wall presses X back to column 0; it comes into its new column by itself, at its canonical row, standing in A's gap there
  const w = () => createModel().open([blk('A', 2, 5, 0), blk('X', 1, 2, 3), blk('L', 2, 5, 8)]);
  const a = w().side(2, 4);
  eq([a.rows(), a.B.get('X').c0, a.B.get('X').c1, a.stack('L', 0), a.stack('L', 1)], [{ A: 0, L: 8, X: 3 }, 0, 1, 'X | X4 |', 'A | A2 [X:A1] A4 |'], 'r10.5: the wall presses X from column −1 to 0: every row stays');
  clean(a, 'r10.5: invariants after the wall');
  eq(a.remove('X').rows().L, 8, 'r10.5: X deleted then: L stays, held in the column X came into');
  const refused = (fn) => { try { fn(); return false; } catch { return true; } };
  const r = w(), before = r.snapshot();
  ok(refused(() => r.side(3, 3)) && r.snapshot() === before, 'r10.5: A and L, four columns wide, cannot fit in three: the handle stops and nothing changed');
  const q = createModel().open([blk('X', 1, 1, 0), blk('Y', 2, 3, 0)]), was = q.snapshot();
  ok(refused(() => q.side(2, 4)) && q.snapshot() === was, 'r10.5: X pressed into Y: refused in the model, which has no P-ASIDE chain (the engine presses Y aside)');
  ok(refused(() => createModel().open([blk('X', 1, 3, 0)]).shift(-2)), 'r10.5: a shift alone, which promises a settled result, still refuses a card past column 0');
  // opening a valid note keeps every place, head rows and gaps included, in both measures, and stores nothing new
  const input = [blk('A', 1, 3, 3), blk('B', 1, 3, 7, 2), blk('C', 5, 6, 2)];
  const o = createModel().open(input);
  eq([o.rows(), o.rows('canonical'), o.stack('A', 1), o.stack('B', 2)], [{ A: 3, B: 7, C: 2 }, { A: 3, B: 7, C: 2 }, 'top | _3 |', 'A | A3 |'], 'r10.6: a valid note with a head row and a gap opens as stored');
  eq(o.places(), input, 'r10.6: and what 0.1 would store is what was read');
  // a rules change between an action and its undo, with an equal layout: the exact path would bring back a stack the rules now in
  // effect never make, so it is not taken (plan §6.4)
  const s = createModel().open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 1, 4)), entry = s.save(); s.remove('X');
  const reopened = () => createModel({ gap53: false }).open(s.places());
  eq(reopened().snapshot(), s.snapshot(), 'r10.2: X deleted, GAP.5.3 turned off and the note reopened: the same layout and stacks');
  const exact = reopened().load(entry), inverse = reopened().restore(blk('X', 1, 1, 4));
  eq([exact.stack('L', 1), inverse.stack('L', 1), inverse.stack('X', 1)], ['A | A3 [X:A1] A5 |', 'X | X5 |', 'A | A3 |'], 'r10.2: the exact undo brings X back standing with its lend; created under the rules in effect, it cuts A\'s gap');
  eq([exact.remove('X').rows().L, inverse.remove('X').rows().L], [10, 4], 'r10.2: so deleting X again leaves L at 10 after the exact path and at 4 after the inverse one');
}
// ---- round 11: G7 is judged by each RELINK against the heights it ends with; a widening with a new height checks its new rectangle
{
  // shrunk in one RELINK and grown back in the next, X's lend stays cut: deleting it then lets L rise (G7). A height that ends where
  // it started leaves the lend whole, which is what a shrink and a regrowth inside one RELINK interval give (phase 9 (a), then (b)):
  // FOLLOW never reads a lend, and RELINK sees only the height of `after`
  const g = () => createModel().open([blk('A', 1, 1, 0), blk('L', 1, 1, 10)]).insert(blk('X', 1, 2, 3, 3));
  const two = g().width('X', 1, 6, 1).width('X', 1, 2, 3);
  eq([two.stack('L', 1), two.rows().L, two.remove('X').rows().L], ['A | A2 [X:A1] A4 |', 10, 8], 'r11.1: X shrunk in one RELINK and grown in the next: its lend stays one row, and deleting it lets L rise to 8');
  const one = g().width('X', 1, 6).width('X', 1, 2);
  eq([one.stack('L', 1), one.rows().L, one.remove('X').rows().L], ['A | A2 [X:A3] A4 |', 10, 10], 'r11.1: X at the same height in every RELINK: its lend whole, and deleting it leaves L at 10 (no trace, H1)');
  // a widening that gets shorter is checked at its new height in the columns it comes into, never at the old one
  const blocks = [blk('X', 1, 2, 0, 3), blk('B', 4, 5, 2)];
  const w = createModel().open(blocks).width('X', 1, 6, 1), v = createModel().open(blocks).height('X', 1).width('X', 1, 6);
  eq([w.rows(), w.rows('canonical'), w.snapshot() === v.snapshot()], [{ B: 2, X: 0 }, { B: 2, X: 0 }, true], 'r11.3: X widened over B\'s columns while it gets one row tall: accepted, as the shrink then the widening');
  clean(w, 'r11.3: invariants');
}
// ---- GAP.8 is per column (G6: «the first block of a column»); with it off, the free room and the slack a first block uses stay free
{
  const m = createModel().open([blk('P', 2, 2, 0, 3), blk('H', 1, 2, 5), blk('L', 1, 2, 8)]).carry('H', -2);
  eq([m.stack('L', 1), m.stack('L', 2)], ['H | H4 |', 'H | P2+H2 |'], 'GAP.8: H is the first block of column 1 only: the free room it left there is its own; in column 2 P\'s rows came under it');
  m.remove('P').remove('H');
  eq(m.rows().L, 3, 'GAP.8: P and H deleted: L rises by what was theirs');
  const o = createModel({ gap8: false }).open([blk('Q', 2, 2, 0, 1), blk('H', 1, 2, 3), blk('L', 1, 2, 6)]).height('Q', 3).carry('H', -2);
  eq(o.stack('L', 1), 'H | _2+H2 |', 'GAP.8 off: the slack H used in column 1, where it is first, stays free room');
}
// ---- round 4 (finding 4): the last anchor deleted, the block standing in its stack keeps the room above it
{
  const base = [blk('A', 1, 3, 0), blk('B', 7, 9, 0), blk('X', 12, 14, 8)];
  const m = createModel().open(base).insert(blk('L', 1, 9, 7)).height('B', 4).width('X', 1, 3);
  eq([m.rows().X, m.rows().L, m.stack('L', 2)], [8, 10, 'A | A6+X1 [X:·] · |'], 'r4.4: X came in from the side under A, one row lower than A\'s gap reaches: that row is its own');
  m.remove('L');
  const o = createModel().open(base).height('B', 4).width('X', 1, 3);
  eq([m.rows().X, m.stack('X', 2), m.snapshot() === o.snapshot()], [8, 'A | A7 |', true], 'r4.4: L deleted: X stays at 8 with A7, as without L');
}
// ---- round 4 (finding 5): blocks moved together in one step keep the gaps between them, owners included
{
  const m = createModel().open([blk('U', 1, 3, 0), blk('A', 1, 3, 5), blk('B', 1, 3, 6)]).carry('A', -2).move(['A', 'B'], 1);
  eq([m.rows(), m.stack('A', 2), m.stack('B', 2)], [{ A: 4, B: 7, U: 0 }, 'U | U3 |', 'A | U2 |'], 'r4.5: A and B down one step: U\'s two rows between them stay U\'s');
  m.move(['A', 'B'], -1);
  eq([m.rows(), m.stack('A', 2), m.stack('B', 2)], [{ A: 3, B: 6, U: 0 }, 'U | U2 |', 'A | U2 |'], 'r4.5: and back up');
  const s = createModel().open([blk('A', 1, 3, 0), blk('L', 1, 3, 7)]).insert(blk('X', 1, 3, 3));
  s.move(['X', 'L'], 1);
  eq([s.rows(), s.stack('L', 2)], [{ A: 0, L: 8, X: 4 }, 'A | A3 [X:A1] A3 |'], 'r4.5: a standing block and the anchor under it, together: the rows between them stay');
  s.move(['X', 'L'], -1).move(['A', 'X'], 1);
  eq([s.rows(), s.stack('L', 2), s.stack('A', 2)], [{ A: 1, L: 7, X: 4 }, 'A | A2 [X:A1] A2 |', 'top | _1 |'], 'r4.5: the anchor above and a standing block, together: the rows above X stay, those under it go');
  s.move(['A', 'X'], -1).remove('X');
  eq([s.rows(), s.stack('L', 2)], [{ A: 0, L: 7 }, 'A | A6 |'], 'r4.5: back, then X deleted: the gap whole');
}
// ---- round 4 (finding 6): narrowing is not deleting for the rows a block owns; a standing block always gives its lend back (S8)
{
  for (const gap9 of [true, false]) {
    const m = createModel({ gap9 }).open([blk('L', 9, 11, 10)]).insert(blk('X', 1, 11, 5)).height('X', 8).width('X', 1, 6);
    eq([m.rows().L, m.stack('L', 10)], [10, 'top | _10 |'], `r4.6: GAP.9 ${gap9 ? 'on' : 'off'}: X stood over L and pushed it; narrowed off, its lend comes back and L returns`);
  }
  const k = createModel().open([blk('H', 1, 3, 10)]).insert(blk('X', 1, 5, 5)).carry('X', -2).width('X', 4, 5);
  eq([k.rows().H, k.stack('H', 2)], [10, 'top | _10 |'], 'r4.6: a standing head\'s own rows, narrowed off with GAP.9 on: they stay as free room');
  const d = createModel({ gap9: false }).open([blk('H', 1, 3, 10)]).insert(blk('X', 1, 5, 5)).carry('X', -2).width('X', 4, 5);
  eq([d.rows().H, d.stack('H', 2)], [8, 'top | _8 |'], 'r4.6: GAP.9 off: they go');
}

// ---- INV-7 b is for the neighbours a block had when it came. A block that becomes its neighbour while it is in keeps what it got
{
  // a block that came into its gap stands in it (G4), and on in the gap of the block under it after it goes
  const hist = (m) => m.width('P', 8, 9).width('Q', 8, 9);
  const w = createModel().open([blk('P', 1, 3, 7), blk('Q', 1, 3, 20)]).insert(blk('X', 4, 9, 32)); hist(w); w.remove('X');
  const o = createModel().open([blk('P', 1, 3, 7), blk('Q', 1, 3, 20)]); hist(o);
  eq([w.rows(), w.stack('Q', 9), o.stack('Q', 9)], [o.rows(), 'top | _7 [P:_1] _12 |', 'P | P12 |'], 'INV-7 b: P and Q came in over X: the rows as without X; Q is the anchor, P stands in its gap');
  eq([w.remove('P').rows().Q, o.remove('P').rows().Q], [20, 7], 'INV-7 b: deleting P then gives its lend back with X\'s visit, and closes its gap without it');
  // an anchor narrowed off from under it keeps as rows only the slack its growth left (G8); its going is then G2 for the block under
  const start = () => createModel().open([blk('Q', 2, 2, 0, 10), blk('B', 1, 2, 10), blk('L', 1, 1, 15)]).height('Q', 12);
  const g = start().insert(blk('X', 1, 1, 5)).height('X', 3).width('B', 2, 2);
  eq([g.rows().L, g.stack('L', 1)], [17, 'top | _5 [X:_1] _9 |'], 'INV-7 b: X grew into B\'s slack, B narrowed off: L stays (G8)');
  eq([g.remove('X').rows().L, start().width('B', 2, 2).rows().L], [15, 17], 'INV-7 b: X deleted: L rises by what X\'s growth had taken of the slack; without X it stays');
  // a block that changes its columns while another's growth holds it lower keeps that row in the columns it came into (S8) or the
  // slack it had there in the ones it left (G8): H1 brings back the blocks a growth pushed, not the columns one of them changed
  const st = () => createModel().open([blk('B', 1, 1, 2), blk('C', 2, 2, 10)]);
  const u = st().insert(blk('X', 1, 1, 0)).height('X', 2).width('B', 1, 2);
  eq([u.rows().B, u.stack('C', 2), u.remove('X').rows().B, st().width('B', 1, 2).rows().B], [3, 'top | _3 [B:_1] _6 |', 3, 2], 'INV-7 b: B pushed by X\'s growth widens into column 2 there: it stays there when X goes');
  const s2 = () => createModel().open([blk('B', 1, 2, 5), blk('L', 2, 2, 9)]);
  const v = s2().insert(blk('X', 1, 1, 1)).height('X', 3).width('B', 1, 1);
  eq([v.rows().L, v.remove('X').rows().L, s2().width('B', 1, 1).rows().L], [11, 11, 9], 'INV-7 b: B pushed by X\'s growth narrows off L\'s column: L keeps the row it had then');
}

// ---- random sequences against the oracle: the same history without the inserted blocks (C3, S8, H1, G7). Carries of the inserted
// blocks are left out: by G5 and G6 a block moved by hand changes the gaps on purpose (the retrace cases test them); so are carries
// of base blocks, since whether a gap holds a block depends on what the inserted blocks push. Base blocks change height, show and
// end temporary heights, and change width (they come in from the side, as in finding 4 of round 4). The comparison is exact unless
// a base block came into a column or left it while it, or that column, did not stand as without the inserted blocks (an inserted
// block in that column, or a block an inserted block held elsewhere): it then took its place there from the inserted blocks' doing,
// and INV-7 b is for the neighbours a block had when it came (the named cases «INV-7 b» show each way); every other column's stacks
// must still agree
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function bases(r, n, W) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), base = [];
  for (let i = 0; i < n; i++) for (let t = 0; t < 30; t++) {
    const c0 = int(0, W - 3), b = blk('b' + i, c0, Math.min(W - 1, c0 + int(0, 6)), int(0, 26), int(1, 3));
    if (!base.some((o) => o.c0 <= b.c1 && b.c0 <= o.c1 && o.y < b.y + b.h + 1 && b.y < o.y + o.h + 1)) { base.push(b); break; }
  }
  return base;
}
function randomCase(seed, guarded = false) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const W = 14, base = bases(r, 5, W);
  const m = createModel().open(base), o = createModel().open(base), ins = [], log = [];
  const tryOp = (fn) => { const snap = m.snapshot(); try { fn(m); log.push(fn); return true; } catch (e) { if (m.snapshot() !== snap) throw new Error('a refused op changed the state: ' + e.message); return false; } };
  const both = (fn) => { const s = m.save(); if (!tryOp(fn)) return; try { fn(o); } catch { m.load(s); log.pop(); } };
  const look = (x, c) => { const yc = x.rows('canonical'); return JSON.stringify([...x.B.values()].filter((b) => b.c0 <= c && c <= b.c1).sort((p, q) => (p.id < q.id ? -1 : 1)).map((b) => [b.id, b.y, yc[b.id]])); };
  const displaced = (id) => m.B.get(id).y !== o.B.get(id).y || m.rows('canonical')[id] !== o.rows('canonical')[id];
  const touched = new Set();   // columns a base block came into or left while it, or that column, did not stand as without the inserted blocks
  for (let step = 0; step < 40; step++) {
    const kind = pick(['insert', 'insert', 'grow', 'widen', 'narrow', 'show', 'base', 'base', 'basewidth', 'baseshow', 'delete']);
    if (kind === 'insert') { const id = 'x' + ins.length, c0 = int(0, W - 2), b = { ...blk(id, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 40), int(1, 3)), e: pick([0, 0, 1, 2]) };
      if (tryOp((mm) => mm.insert(b))) ins.push(id); }
    else if (kind === 'base') { const b = pick(base), h = Math.max(1, m.B.get(b.id).h + pick([-1, 1, 2])); both((mm) => mm.height(b.id, h)); }
    else if (kind === 'baseshow') { const b = pick(base), e = pick([0, 0, 1, 3]); both((mm) => mm.show(b.id, e)); }
    else if (kind === 'basewidth') { const b = pick(base), x = m.B.get(b.id), a = Math.max(0, x.c0 + int(-3, 3)), z = Math.min(W - 1, Math.max(a, x.c1 + int(-3, 3))), moved = displaced(b.id);
      const changed = []; for (let c = Math.min(a, x.c0); c <= Math.max(z, x.c1); c++) if (c < a || c > z || c < x.c0 || c > x.c1) changed.push(c);
      // guarded: only while every base block stands as in the oracle, in both measures, and never under an inserted block
      if (guarded && (base.some((q) => displaced(q.id)) || ins.some((id) => m.B.has(id) && m.B.get(id).y < x.y && m.B.get(id).c0 <= z && a <= m.B.get(id).c1))) continue;
      const before = new Map(changed.map((c) => [c, look(m, c) !== look(o, c)]));   // the column did not look as it does without them
      const h = r() < 0.3 ? Math.max(1, x.h + pick([-1, 1])) : null;   // sometimes the re-measure at the new width gives another height
      const was = m.snapshot(); both((mm) => mm.width(b.id, a, z, h));
      if (m.snapshot() !== was) for (const c of changed) if (moved || before.get(c)) touched.add(c); }
    else {
      const live = ins.filter((id) => m.B.has(id)); if (!live.length) continue; const id = pick(live), x = { ...m.B.get(id) };
      if (kind === 'grow') { const h = x.h + int(1, 2); tryOp((mm) => mm.height(id, h)); }
      if (kind === 'show') { const e = pick([0, 1, 2]); tryOp((mm) => mm.show(id, e)); }
      if (kind === 'widen') { const a = Math.max(0, x.c0 - int(0, 2)), b = Math.min(W - 1, x.c1 + int(0, 2)); tryOp((mm) => mm.width(id, a, b)); }
      // an inserted block only grows (a shrink of one standing in a gap is G7, which leaves its trace on purpose): narrowed, it may get taller
      if (kind === 'narrow' && x.c1 > x.c0) { const a = x.c0 + int(0, 1), b = Math.max(a, x.c1 - int(0, 1)), h = r() < 0.4 ? x.h + 1 : null; tryOp((mm) => mm.width(id, a, b, h)); }
      if (kind === 'delete') tryOp((mm) => mm.remove(id));
    }
    const e = m.check(); if (e.length) return { seed, step, errs: e };
  }
  for (const id of ins.filter((i) => m.B.has(i)).sort(() => r() - 0.5)) { const fn = (mm) => mm.remove(id); fn(m); log.push(fn); }
  const sh = createModel().open([...base].reverse()); for (const fn of log) fn(sh);   // the same history from storage in another order
  if (sh.snapshot() !== m.snapshot()) return { seed, order: true };
  if (m.snapshot() === o.snapshot()) return null;
  const untouched = (x) => JSON.stringify([...x.S.keys()].filter((k) => !touched.has(+k.split('|')[1])).sort().map((k) => [k, x.stack(k.split('|')[0], +k.split('|')[1])]));
  const rowsOf = (x) => JSON.stringify([x.rows(), x.rows('canonical')]);
  if (touched.size && untouched(m) === untouched(o) && (!guarded || rowsOf(m) === rowsOf(o))) return { seed, owners: true };
  return { seed, diff: [m.snapshot(), o.snapshot()] };
}
// carrying a block by hand d rows and back, or moving several blocks together in one step and back, puts every block where it
// was, and repeating the round trip never makes a gap longer (INV-7 c, G4). The first round trip may lengthen a gap that did not
// hold a block by the slack it used going up: slack is not state, so going down cannot know it; owners may move between the
// gaps (G5, G6). Some blocks show temporary heights meanwhile
function retraceCase(seed) {
  const r = rng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 14, base = bases(r, 6, W);
  const m = createModel().open(base); m.height(base[int(0, base.length - 1)].id, 4);   // some slack somewhere
  if (r() < 0.5) m.show(base[int(0, base.length - 1)].id, int(1, 2));
  const lens = () => JSON.stringify([m.rows(), [...m.S.entries()].map(([k, st]) => [k, st.parts.reduce((n, p, i) => n + (i % 2 ? p.lend.length : p.length), 0)]).sort()]);
  const rowsBefore = m.rows(), canonBefore = m.rows('canonical'), d = int(1, 3) * (r() < 0.5 ? -1 : 1);
  const ids = [...new Set(Array.from({ length: int(1, 3) }, () => base[int(0, base.length - 1)].id))];
  try { m.move(ids, d); } catch { return null; }
  if (Object.entries(m.rows()).some(([k, y]) => !ids.includes(k) && y !== rowsBefore[k])) return null;   // a neighbour was pushed: a push is kept after the drop (M2)
  m.move(ids, -d);
  if (JSON.stringify(m.rows()) !== JSON.stringify(rowsBefore)) return { seed, ids, d, rows: true };
  // canonically, a stack that held a block only with no temporary height may have been lengthened by the slack it used on the
  // screen: the block may stand that much lower once the temporary heights end, never more, and never moved further by more trips
  const canonOnce = m.rows('canonical');
  if (Object.keys(canonOnce).some((k) => canonOnce[k] < canonBefore[k])) return { seed, ids, d, canonicalUp: true };
  const once = lens();
  for (let k = 0; k < 3; k++) { m.move(ids, d); m.move(ids, -d); }
  if (JSON.stringify(m.rows('canonical')) !== JSON.stringify(canonOnce)) return { seed, ids, d, canonicalDrifts: true };
  return lens() === once ? null : { seed, ids, d, grows: true };
}
// a deletion never moves another block down (G2, G7), in either measure, whatever the history: shrinking standing blocks, carries,
// moves of several blocks and temporary heights included
function deleteCase(seed, opts = {}) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 12;
  const m = createModel(opts).open([blk('a', 0, 5, 0), blk('b', 6, 11, 0, 3), blk('l', 0, 11, 12)]); let n = 0;
  for (let step = 0; step < 30; step++) {
    const live = [...m.B.keys()], kind = pick(['insert', 'insert', 'height', 'width', 'carry', 'sideways', 'move', 'show', 'delete']);
    try {
      if (kind === 'insert') { const c0 = int(0, W - 2); m.insert({ ...blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 6)), int(0, 30), int(1, 3)), e: pick([0, 0, 2]) }); }
      if (kind === 'height') { const id = pick(live); m.height(id, Math.max(1, m.B.get(id).h + pick([-2, -1, 1, 2]))); }
      if (kind === 'show') m.show(pick(live), pick([0, 0, 1, 3]));
      if (kind === 'width') { const id = pick(live), x = m.B.get(id), a = Math.max(0, x.c0 + pick([-1, 0, 1])); m.width(id, a, Math.max(a, Math.min(W - 1, x.c1 + pick([-1, 0, 1]))), pick([null, null, Math.max(1, x.h - 2), x.h + 1])); }
      if (kind === 'carry') m.carry(pick(live), pick([-2, -1, 1, 2]));
      if (kind === 'sideways') { const id = pick(live), x = m.B.get(id), k = pick([-1, 1]), cut = x.c1 > x.c0 && r() < 0.4;   // keeps some columns; sometimes narrowed at an edge
        m.carryTo(id, x.c0 + k + (cut && k > 0 ? 1 : 0), x.c1 + k - (cut && k < 0 ? 1 : 0), x.y + pick([0, 0, 1])); }
      if (kind === 'move') m.move([pick(live), pick(live)], pick([-1, 1]));
      if (kind === 'delete' && live.length > 1) { const id = pick(live), was = [m.rows(), m.rows('canonical')]; m.remove(id); const now = [m.rows(), m.rows('canonical')];
        for (const i of [0, 1]) for (const k of Object.keys(now[i])) if (now[i][k] > was[i][k]) return { seed, step, deleted: id, moved: k, measure: i ? 'canonical' : 'shown', from: was[i][k], to: now[i][k] }; }
    } catch { /* refused: nothing changed */ }
    const e = m.check(); if (e.length) return { seed, step, errs: e };
  }
  return null;
}
// the two measures: ending every temporary height gives the canonical rows on the screen; what 0.2 stores reloads to the same
// canonical layout, and what 0.1 stores (places only) to the same canonical rows
function measureCase(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 12;
  const m = createModel().open(bases(r, 4, W)); let n = 0;
  for (let step = 0; step < 25; step++) {
    const live = [...m.B.keys()], kind = pick(['insert', 'show', 'show', 'height', 'width', 'carry', 'delete']);
    try {
      if (kind === 'insert') { const c0 = int(0, W - 2); m.insert({ ...blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 30), int(1, 3)), e: pick([0, 1, 3]) }); }
      if (kind === 'show') m.show(pick(live), pick([0, 1, 2, 4]));
      if (kind === 'height') { const id = pick(live); m.height(id, Math.max(1, m.B.get(id).h + pick([-1, 1]))); }
      if (kind === 'width') { const id = pick(live), x = m.B.get(id), a = Math.max(0, x.c0 + pick([-1, 1])); m.width(id, a, Math.max(a, Math.min(W - 1, x.c1 + pick([-1, 1]))), pick([null, Math.max(1, x.h - 1), x.h + 1])); }
      if (kind === 'carry') m.carry(pick(live), pick([-1, 1]));
      if (kind === 'delete' && live.length > 1) m.remove(pick(live));
    } catch { /* refused */ }
    const e = m.check(); if (e.length) return { seed, step, errs: e };
  }
  const canon = JSON.stringify(m.rows('canonical'));
  const reloaded = createModel().load(m.stored());
  if (JSON.stringify(reloaded.rows()) !== canon) return { seed, reload02: true };
  if (JSON.stringify(createModel().open(m.places()).rows()) !== canon) return { seed, reload01: true };
  for (const id of m.B.keys()) m.show(id, 0);
  if (JSON.stringify(m.rows()) !== canon) return { seed, unshow: true };
  return null;
}
// GAP.5.1 off changes only owners: a history of inserts, heights, temporary heights, widenings, carries and moves gives the same rows,
// in both measures, with it on and off. A deletion, a carry away and a narrowing take rows by their owner (G2, a departing block's
// room), so after one the two may differ by the owners the switch changed (the named case «r9.3»)
function switchCase(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 12;
  const on = createModel().open(bases(r, 4, W)), off = createModel({ gap51: false }).open([...on.B.values()].map((b) => ({ id: b.id, c0: b.c0, c1: b.c1, y: b.y, h: b.h }))); let n = 0;
  const both = (fn) => { let a = true, b = true; try { fn(on); } catch { a = false; } try { fn(off); } catch { b = false; } return a === b; };
  for (let step = 0; step < 30; step++) {
    const live = [...on.B.keys()], kind = pick(['insert', 'height', 'show', 'width', 'carry', 'carry', 'move']);
    let same = true;
    if (kind === 'insert') { const c0 = int(0, W - 2), b = { ...blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 30), int(1, 3)), e: pick([0, 1]) }; same = both((m) => m.insert(b)); }
    if (kind === 'height') { const id = pick(live), h = Math.max(1, on.B.get(id).h + pick([-1, 1, 2])); same = both((m) => m.height(id, h)); }
    if (kind === 'show') { const id = pick(live), e = pick([0, 1, 3]); same = both((m) => m.show(id, e)); }
    if (kind === 'width') { const id = pick(live), x = on.B.get(id), a = Math.max(0, x.c0 - int(0, 1)), z = Math.min(W - 1, x.c1 + int(0, 1)); same = both((m) => m.width(id, a, z)); }   // widening only
    if (kind === 'carry') { const id = pick(live), d = pick([-2, -1, 1, 2]); same = both((m) => m.carry(id, d)); }
    if (kind === 'move') { const ids = [pick(live), pick(live)], d = pick([-1, 1]); same = both((m) => m.move(ids, d)); }
    if (!same) return { seed, step, kind, refused: 'one way only' };
    if (JSON.stringify([on.rows(), on.rows('canonical')]) !== JSON.stringify([off.rows(), off.rows('canonical')])) return { seed, step, kind, on: on.rows(), off: off.rows() };
    const e = off.check(); if (e.length) return { seed, step, errs: e };
  }
  return null;
}
{
  const N = +process.argv[2] || 2000;
  // guarded: base blocks change width only while they all stand as without the inserted blocks and never under one; then the
  // columns they touch keep the rows of every block in both measures, only stacks (G4's order of arrival) may differ there
  let bad = 0, first = null, owners = 0;
  for (let s = 1; s <= N; s++) { let res; try { res = randomCase(s, true); } catch (e) { res = { seed: s, error: e.message }; } if (res && res.owners) owners++; else if (res) { bad++; first = first || res; } }
  ok(bad === 0, `random (guarded): ${bad} of ${N} sequences leave a trace; first: ${JSON.stringify(first)}`);
  console.log(`random (guarded): ${N} sequences, exact but for ${owners} with the same rows in both measures and other stacks only in the columns a base block came into or left beside an inserted block (G4)`);
  bad = 0; first = null; owners = 0;
  for (let s = 1; s <= N; s++) { let res; try { res = randomCase(s); } catch (e) { res = { seed: s, error: e.message }; } if (res && res.owners) owners++; else if (res) { bad++; first = first || res; } }
  ok(bad === 0, `random: ${bad} of ${N} sequences leave a trace; first: ${JSON.stringify(first)}`);
  console.log(`random: ${N} sequences of inserts, growth, temporary heights, widening, narrowing and deletions, base blocks changing height and width, every inserted block deleted at the end, compared with the history without them (exact, but for ${owners} whose other stacks are all in columns a base block came into or left while it or that column stood otherwise than without them: INV-7 b)`);
}

const scale = (+process.argv[2] || 2000) / 2000;   // the other suites scale with the argument, at their defaults with none
for (const [name, fn, n] of [['retrace', retraceCase, 2000], ['delete moves nothing down', deleteCase, 2000], ['measures', measureCase, 1000], ['GAP.5.1 off moves nothing', switchCase, 1000],
  ['delete moves nothing down, GAP.5.2 off', (s) => deleteCase(s, { gap52: false }), 500], ['delete moves nothing down, GAP.5.3 off', (s) => deleteCase(s, { gap53: false }), 500]]) {
  const N = Math.max(1, Math.round(n * scale));
  let bad = 0, first = null;
  for (let s = 1; s <= N; s++) { let res; try { res = fn(s); } catch (e) { res = { seed: s, error: e.message }; } if (res) { bad++; first = first || res; } }
  ok(bad === 0, `${name}: ${bad} of ${N}; first: ${JSON.stringify(first)}`);
  console.log(`${name}: ${N} random cases`);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
