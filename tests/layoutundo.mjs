// Node: an undo's carry back through SETTLE (LAYOUT-ENGINE-PLAN §6.4, the inverse path: the block carried back to its old cell as a
// canonical place, `canonical: true`, RELINK putting it by its canonical row, GAP.5 rule 3). No test reached it before the gesture
// generator did (tests/layoutgestures.mjs, step 2c's groundwork); each case here fails without its fix:
//   1–1a   a carry back with nothing in the way, and one from other columns into a cell a block rose into (the sinks named, held where the
//          phases put them, never left to the arrival: primitives.js `transitionFacts`, `canonical`);
//   2–2c   cases the generator recorded, replayed as it ran them: the sinks named (2), the block's canonical row going with it where P-UP
//          stands it under a block that cannot go up (2a, settle.js phase 8), no pass declared for it under a fallback (2b), and its place
//          measured with rule 5 made, the blocks the phases moved out of its way at their targets (2c, gap.js, as the model has it).
//   1b     O-30, decided as G21 (the owner, 2026-11-13): a block right under it in a column it keeps, which no phase moved, stays where it
//          stands, as a drop at the old cell would leave it (primitives.js \`transitionFacts\` names it, RELINK holds it).
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check } from '../public/layout/gap.js';
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
