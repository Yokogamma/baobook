// Node: an undo's carry back through SETTLE (LAYOUT-ENGINE-PLAN §6.4, the inverse path: the block carried back to its old cell as a
// canonical place, `canonical: true`, RELINK putting it by its canonical row, GAP.5 rule 3). No test reached it before the gesture
// generator did (tests/layoutgestures.mjs, step 2c's groundwork); each case here fails without its fix:
//   1–1a   a carry back with nothing in the way, and one from other columns into a cell a block rose into (the sinks named, held where the
//          phases put them, never left to the arrival: primitives.js `transitionFacts`, `canonical`);
//   2–2c   cases the generator recorded, replayed as it ran them: the sinks named (2), the block's canonical row going with it where P-UP
//          stands it under a block that cannot go up (2a, settle.js phase 8), no pass declared for it under a fallback (2b), and its place
//          measured with rule 5 made, the blocks the phases moved out of its way at their targets (2c, gap.js, as the model has it).
//   1b     O-30, decided as G21 (the owner, 2026-11-13): a block right under it in a column it keeps, which no phase moved, stays where it
//          stands, as a drop at the old cell would leave it (primitives.js `transitionFacts` names it, RELINK holds it);
//   3–3c   the two measures (the independent review of c5efdda): its cell is canonical, RELINK gets its canonical row and FOLLOW shows it
//          under the temporary heights there, over its cell (3), over one of its two columns (3a), on a block P-UP lifts (3b), on a block
//          at the cell shown lower (3c, both found by the generator): SETTLE runs an undo on the canonical layout (settle.js `inverse`);
//   4      G21 holds only a block that still stands under it in a column it keeps: one pressed out of it comes in by itself;
//   5      the canonical measure an adapter of its own, so a frozen measure or a class serves (the independent review of f7900b2).
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check, resize, follow } from '../public/layout/gap.js';
import { resolve, DEFAULT } from '../public/layout/rules.js';
import { sharesCol } from '../public/layout/geometry.js';
import { set, text, area, chars, ctxOf, sheet, eq, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const rows = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, b.y]));
const cells = (L) => Object.fromEntries([...L.boxes].map(([k, b]) => [k, [b.col, b.yc ?? b.y]]));
const carry = (id, col, y, w, o = {}) => ({ type: 'carry', box: null, id, at: { col, y, frow: y, w }, away: false, ...o });

/* ── 1. by hand ── */
{
  const ctx = ctxOf({});
  const L0 = sheet(12, [set('X', 0, 0, 4, 2), set('N', 0, 4, 4, 2), set('M', 5, 1, 4, 1)]);
  const d = settle(L0, carry('X', 0, 8, 4), emptyMemory(), ctx);
  const u = d.ok && settle(d.layout, carry('X', 0, 0, 4, { canonical: true }), emptyMemory(), ctx);
  ok('1 X carried down from 0 to 8 (N pushed to 10), its undo carried back: X at its cell 0, N where it stands (10), as a drop at the cell would leave it (G21); sound', !!u && u.ok && eq(rows(u.layout), { X: 0, N: 10, M: 1 }) && !check(u.layout).length, u && (u.ok ? rows(u.layout) : u));
  // O-30, decided as G21 ((а)): X carried one row down onto B (one free row between them before), then undone: B, right under X in its
  // columns and moved by no phase, stays at 7; X back at 4. Before G21, B rose into X's place as X left and RELINK refused it there
  const O = sheet(10, [set('X', 0, 4, 4, 2), set('B', 0, 7, 4, 1)]);
  const o1 = settle(O, carry('X', 0, 5, 4), emptyMemory(), ctx), o2 = o1.ok && settle(o1.layout, carry('X', 0, 4, 4, { canonical: true }), emptyMemory(), ctx);
  ok('1b O-30: X a row down onto B, undone: X back at 4, B stays at 7 (G21); sound', o1.ok && eq(rows(o1.layout), { X: 5, B: 7 }) && !!o2 && o2.ok && eq(rows(o2.layout), { X: 4, B: 7 }) && !check(o2.layout).length, o2 && (o2.ok ? rows(o2.layout) : o2));
  const a = settle(L0, carry('X', 6, 3, 4, { away: true }), emptyMemory(), ctx);
  const b = a.ok && settle(a.layout, carry('X', 0, 0, 4, { away: true, canonical: true }), emptyMemory(), ctx);
  ok('1a X carried away (N up to 0), its undo from other columns: X back at 0, N sunk under it to 2, held there; sound', !!b && b.ok && eq(rows(b.layout), { X: 0, N: 2, M: 1 }) && !check(b.layout).length, b && (b.ok ? rows(b.layout) : b));
}

/* ── 3. the two measures (the independent review of c5efdda): an undo's cell is canonical; the phases see it where FOLLOW shows it, and
   RELINK gets its canonical row, moved only by what a phase really moved it, never a temporary push ── */
{
  const ctx = ctxOf({});
  // H over X's old cell in column 1, X carried away to columns 6–7; H then shows two temporary rows (h 3, t 2); X's undo to its cell
  const L0 = sheet(12, [set('H', 0, 0, 2, 1), set('X', 0, 1, 3, 1)]);
  const a = settle(L0, carry('X', 5, 7, 3, { away: true }), emptyMemory(), ctx), L1 = a.ok && follow(resize(a.layout, 'H', 3, 2));
  const u = L1 && settle(L1, carry('X', 0, 1, 3, { away: true, canonical: true }), emptyMemory(), ctx);
  const z = u && u.ok && follow(resize(u.layout, 'H', 1, 0));
  ok('3 under a temporary height: H stays at 0, X canonically at 1 and shown at 3; when H folds, X at 1; sound', !!z && eq(rows(u.layout), { H: 0, X: 3 }) && u.layout.boxes.get('X').yc === 1 && eq(rows(z), { H: 0, X: 1 }) && !check(u.layout).length, u && (u.ok ? [rows(u.layout), u.layout.boxes.get('X').yc] : u));
  // the temporary height over one of X's two columns: K over column 2 shows none; X canonically right under both, shown under H's shown
  // rows, and back right under both when H folds, its gap in column 2 not lengthened by H's rows
  const M0 = sheet(12, [set('H', 0, 0, 2, 1), set('K', 1, 0, 2, 1), set('X', 0, 1, 3, 1)]);
  const b = settle(M0, carry('X', 5, 7, 3, { away: true }), emptyMemory(), ctx), M1 = b.ok && follow(resize(b.layout, 'H', 3, 2));
  const v = M1 && settle(M1, carry('X', 0, 1, 3, { away: true, canonical: true }), emptyMemory(), ctx);
  const y = v && v.ok && follow(resize(v.layout, 'H', 1, 0));
  ok('3a a temporary height over one of its two columns: X shown at 3, canonically at 1, and at 1 under both when H folds; sound', !!y && eq(rows(v.layout), { H: 0, K: 0, X: 3 }) && v.layout.boxes.get('X').yc === 1 && eq(rows(y), { H: 0, K: 0, X: 1 }) && !check(y).length, v && (v.ok ? [rows(v.layout), v.layout.boxes.get('X').yc] : v));
}

/* ── 3b–3c. the canonical layout for the phases (found by tests/layoutgestures.mjs with temporary heights, after the review of c5efdda): no
   single row on the screen carries an undo's cell when the phases move a block that shows temporary rows, or when a temporary height shows
   a block that stands at the cell canonically under it; so SETTLE runs on the canonical layout and FOLLOW shows the temporary rows after ── */
{
  const ctx = ctxOf({});
  const undo = (L, id, col, y, w) => settle(L, carry(id, col, y, w, { canonical: true }), emptyMemory(), ctx);
  const fold = (L) => { let F = L; for (const b of L.boxes.values()) if (b.t > 0) F = resize(F, b.id, b.h - b.t, 0); return follow(F); };
  // 3b: B stands over X in start, three rows shown, one canonical; X's undo to row 2 lifts B by P-UP canonically to row 1, and FOLLOW
  // shows X under B's rows, at 4: X is canonically at its cell, never lowered by the rows B shows
  const B1 = follow(resize(sheet(12, [set('B', 0, 4, 3, 1), set('X', 0, 5, 3, 1)]), 'B', 3, 2)), b = undo(B1, 'X', 0, 2, 3), bf = b.ok && fold(b.layout);
  ok('3b P-UP lifts a block that shows temporary rows: B canonically at 1, X at its cell 2, shown at 4; folded, B at 1 and X at 2; sound', !!bf && eq(rows(b.layout), { B: 1, X: 4 }) && b.layout.boxes.get('X').yc === 2 && eq(rows(bf), { B: 1, X: 2 }) && !check(b.layout).length, b.ok ? [rows(b.layout), b.layout.boxes.get('X').yc] : b);
  // 3c: B stands at X's cell canonically, shown three rows lower by K's temporary rows in a column X does not take; X comes back over it
  // (B under X in start), so P-DOWN sinks B under X canonically: B at row 2, a row under K canonically, so shown at 4 under K's rows;
  // folded, at 2
  const C1 = follow(resize(sheet(12, [set('K', 1, 0, 2, 1), set('X', 2, 0, 3, 1), set('B', 1, 1, 4, 1)]), 'K', 3, 2)), c = undo(C1, 'X', 2, 1, 3), cf = c.ok && fold(c.layout);
  ok('3c a block at the cell canonically, shown lower by a temporary height elsewhere: sunk under X, B canonically at 2, shown at 4; folded, at 2; sound', !!cf && eq(rows(c.layout), { K: 0, X: 1, B: 4 }) && c.layout.boxes.get('B').yc === 2 && eq(rows(cf), { K: 0, X: 1, B: 2 }) && !check(c.layout).length, c.ok ? [rows(c.layout), c.layout.boxes.get('B').yc] : c);
}

/* ── 5. the canonical measure (the independent review of f7900b2): `inverse` adapts the measure by delegating its two answers, so a frozen
   measure, or one built as a class with its answers on the prototype, serves as it is; the undo of a block with nothing in its way is
   taken, and the temporary rows a text shows by its measure are shown again ── */
{
  class Measure {
    constructor(m) { this.m = m; }
    rows(id, cells) { return this.m.rows(id, cells); }
    natural(id) { return this.m.natural(id); }
  }
  const base = ctxOf({ X: { text: chars(4) }, T: { text: chars(4), temp: 2 } });
  for (const [name, measure] of [['frozen', Object.freeze({ ...base.measure })], ['a class', new Measure(base.measure)]]) {
    const ctx = { ...base, measure };
    const L = sheet(12, [text('T', 6, 0, 3, 1), text('X', 0, 3, 3, 1)]);
    const T1 = settle(L, { type: 'size', box: null, id: 'T' }, emptyMemory(), ctx);
    const u = T1.ok && settle(T1.layout, carry('X', 0, 0, 3, { canonical: true }), emptyMemory(), ctx);
    ok(`5 ${name} measure: the undo taken, X at its cell 0, T showing its temporary rows again; sound`, !!u && u.ok && u.layout.boxes.get('X').y === 0 && u.layout.boxes.get('T').t === 2 && !check(u.layout).length, u && (u.ok ? cells(u.layout) : u));
  }
}

/* ── 4. G21 holds only a block that still stands under it in a column it keeps (the independent review of c5efdda): X back from columns
   1–3 to 3–5 by its canonical row; B, columns 2–3 under it, is pressed aside to 1–2 by phase 4 and leaves the one column X keeps, so it
   comes in by itself at its reference (row 4), not held at 6 ── */
{
  const ctx = ctxOf({});
  const L0 = sheet(12, [set('X', 0, 4, 4, 2), set('B', 1, 6, 3, 3)]);
  const u = settle(L0, carry('X', 2, 6, 4, { canonical: true }), emptyMemory(), ctx);
  ok('4 B pressed out of the column X keeps: at its reference 4, columns 1–2; X at 6; sound', u.ok && eq(rows(u.layout), { X: 6, B: 4 }) && u.layout.boxes.get('B').col === 0 && !check(u.layout).length, u.ok ? cells(u.layout) : u);
}

/* ── 2. recorded by tests/layoutgestures.mjs (seeds 7 and 13), replayed as it runs them: the sheet at rest, the gestures dropped where they end,
   «home» starting again, the undo of the last gesture carried back to its old cell ── */
function replay(f) {
  const map = {}; const bs = f.init.map(([id, col, y, w, h, k]) => { map[id] = { text: k === 'el' ? chars(f.lens[id]) : 'x' }; return k === 'el' ? text(id, col, y, w, 1) : k === 'area' ? area(id, col, y, w, h) : set(id, col, y, w, h); });
  const ctx = ctxOf(map, f.off.length ? resolve(Object.fromEntries(f.off.map((s) => [s, false]))) : DEFAULT), box = f.box;
  let L = sheet(f.cols, bs);
  { const id = L.order[0]; for (let k = 0; k < 8; k++) { const b = L.boxes.get(id), r = settle(L, { ...carry(id, b.col, b.y, b.w), box }, emptyMemory(), ctx); if (!r.ok) break; const same = JSON.stringify(cells(r.layout)) === JSON.stringify(cells(L)); L = r.layout; if (same) break; } }
  let st, mem, id, b, last = null, G = null, out = null;
  const drop = () => { if (G && last) L = last.layout; G = null; last = null; };
  for (const h of f.hist) {
    if (h[0] === 'gesture') { drop(); id = h[1]; b = L.boxes.get(id); st = L; mem = emptyMemory(); G = L; continue; }
    if (h[0] === 'home') { st = L; mem = emptyMemory(); last = null; continue; }
    if (h[0] === 'undo') {
      drop(); const cur = L.boxes.get(id), cy = b.yc ?? b.y;
      const r = settle(L, { ...carry(id, b.col, cy, b.w, { away: !sharesCol({ ...cur, col: b.col, w: b.w }, cur), canonical: true }), box }, emptyMemory(), ctx);
      out = { r, id, col: b.col, y: cy }; if (r.ok) L = r.layout; continue;
    }
    if (['size', 'width', 'remove', 'wall'].includes(h[0])) drop();
    let c = null;
    if (h[0] === 'size') { map[h[1]] = { text: chars(h[2]) }; c = { type: 'size', box, id: h[1] }; }
    else if (h[0] === 'width') c = { type: 'width', box, id: h[1], cw: h[2], side: 'right' };
    else if (h[0] === 'remove') c = { type: 'remove', box, id: h[1] };
    else if (h[0] === 'wall') { c = { type: 'wall', box, side: h[1], cols: h[2] }; if (h[3]) c.shift = h[3]; }
    if (c) { const r = settle(L, c, emptyMemory(), ctx); if (r.ok) L = r.layout; continue; }
    const [col, y, frow, away, hold] = h;
    const r = settle(st, { ...carry(id, col, y, b.w, { away: !!away, through: hold ? 'hold' : undefined }), box, at: { col, y, frow, w: b.w } }, mem, ctx);
    if (!r.ok) continue;
    st = r.start; mem = r.memory; last = r;
  }
  return out;
}
const CASES = {
  '2 the sinks under a carry back from other columns named (primitives.js transitionFacts)': {"cols":9,"off":[],"box":null,"init":[["B0",3,1,5,1,"el"],["B1",3,7,4,1,"el"],["B2",1,2,3,3,"set"],["B3",2,7,2,1,"el"]],"lens":{"B0":20,"B1":9,"B2":1,"B3":2},"hist":[["gesture","B2"],[4,2,2.5,"away","hold"],[4,0,0,"away",""],[4,0,0.5,"away",""],["gesture","B2"],["home"],[1,2,2.8,"away",""],[0,2,2.8,"away",""],[0,5,5.8,"away","hold"],[2,6,6,"away",""],["undo",4,0,"away"]]},
  '2a its canonical row with it where a phase lowers it under a block now at its cell (settle.js, phase 8)': {"cols":9,"off":[],"box":null,"init":[["B0",5,8,2,1,"el"],["B1",2,4,6,2,"area"],["B2",0,3,2,2,"set"],["B3",3,9,3,2,"set"],["B4",1,0,2,1,"el"],["B5",1,1,4,2,"set"]],"lens":{"B0":2,"B1":1,"B2":1,"B3":1,"B4":2,"B5":1},"hist":[["gesture","B0"],[5,10,10.3,"",""],[5,13,13.8,"","hold"],[5,10,10,"",""],[3,10,10,"away",""],[3,7,7.3,"away",""],["gesture","B2"],[0,2,2.8,"",""],[2,2,2,"away",""],[2,4,4.8,"away",""],[2,1,1.5,"away",""],[1,1,1.5,"away",""],[1,0,0.8,"away",""],["undo",0,3,"away"],["gesture","B4"],[1,1,1,"",""],[0,1,1,"away",""],[0,2,2,"away",""],[0,5,5.8,"away",""],[0,3,3.5,"away",""],["home"],["gesture","B0"],[3,4,4.8,"",""],[3,1,1,"","hold"],[3,1,1.3,"",""],[3,0,0.8,"",""],[2,2,2.3,"away",""],[4,2,2.3,"away",""],["undo",3,7,"away"]]},
  '2b no pass declared for it under a fallback (DRAG.B2.keep off; settle.js, phase 8)': {"cols":10,"off":["DRAG.B2.keep"],"box":"AREA","init":[["B0",3,3,6,1,"el"],["B1",3,5,5,1,"el"],["B2",3,8,3,1,"el"]],"lens":{"B0":10,"B1":16,"B2":2},"hist":[["gesture","B1"],[3,2,2.8,"",""],[3,4,4.3,"",""],[3,3,3,"",""],[3,1,1.5,"","hold"],["undo",3,5,""]]},
  '2c its place measured with rule 5 made, the blocks moved out of its way at their targets (gap.js, the model)': {"cols":13,"off":["P-ASIDE","DRAG.B5"],"box":null,"init":[["B0",0,1,6,1,"set"],["B1",4,3,6,1,"el"],["B2",1,5,6,1,"el"],["B3",3,0,6,1,"set"]],"lens":{"B0":1,"B1":30,"B2":10,"B3":1},"hist":[["gesture","B2"],[1,4,4,"",""],[1,1,1,"",""],[0,1,1.8,"",""],[1,1,1,"",""],[1,0,0,"",""],["width","B3",3],["gesture","B0"],[1,0,0.8,"",""],[1,1,1,"",""],["undo",0,1,""],["gesture","B1"],[3,0,0.5,"",""],[3,0,0,"",""],[2,0,0.8,"",""],[2,2,2.5,"","hold"],["undo",4,2,""]]},
};
for (const [name, f] of Object.entries(CASES)) {
  const u = replay(f), X = u && u.r.ok && u.r.layout.boxes.get(u.id);
  ok(name + ': taken, sound, the block at its old column and at its cell or under what stands there now', !!X && !check(u.r.layout).length && X.col === u.col && (X.yc ?? X.y) >= u.y, u && (u.r.ok ? cells(u.r.layout) : u.r));
}

process.exit(t.fails ? 1 : 0);
