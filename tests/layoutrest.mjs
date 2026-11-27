// The rest widths when an action ends (the owner's G24 and G25, 2026-11-23; docs/LAYOUT-SEAMS-PLAN.md Q8, Q9): named cases. The laws
// over random sequences are tests/layoutseq.mjs; the rest width they and these cases judge by is the formula written apart,
// tests/lab/rest-ref.mjs.
//
//   node tests/layoutrest.mjs

import { load, NEW } from './lib/layout/pair.mjs';
import { stubMeasure } from './lib/measure.mjs';
import { restAgainstRef } from './lab/rest-ref.mjs';
import { rest } from '../public/layout/settle.js';
import { validate } from '../public/layout/validate.js';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1500))); };

const A = await load(NEW);
const lay = (E, cols, boxes, areas = {}) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: E.readingOrder(boxes),
  areas: new Map(Object.entries(areas).map(([id, bs]) => [id, { cols: 0, measure: 'canonical', boxes: new Map(bs.map((b) => [b.id, b])), order: E.readingOrder(bs), areas: new Map() }])) });
const ctxOf = (E, map) => ({ rules: E.DEFAULT, settings: E.SETTINGS, kinds: E.KINDS, measure: stubMeasure(map) });
const off = (E, T, map) => restAgainstRef(T, stubMeasure(map), E.SETTINGS);
const places = (T) => JSON.stringify([[null, T], ...T.areas].map(([n, L]) => [n, [...L.boxes.values()].map((b) => [b.id, b.col, b.y, b.w, b.h]).sort()]));
/** A note opened and a list of commands run by one engine. @returns {{tree, trees:object[], again:number}} */
function play(E, note, map, commands, temp = new Map()) {
  const ctx = ctxOf(E, map), o = E.open(lay(E, note.cols, note.boxes, note.areas), ctx, temp);
  if (!o.ok) throw new Error('open: ' + o.errors);
  let T = o.shown, again = 0; const trees = [T];
  for (const c of commands) {
    const r = E.settleTree(T, c, E.emptyMemory(), ctx, { trace: (p, L, info) => { if (info && info.again) again++; } });
    if (!r.ok) throw new Error(c.type + ': ' + r.why + ' ' + (r.errors || []));
    T = r.layout; trees.push(T);
  }
  return { tree: T, trees, again, ctx };
}

// ---- 1. G24: an action that ends with a text off its rest width after one run of phase 9 (found by the search over the pinned engine:
// seed 7, note 286). Five commands in and out of a drawn area; the last, B0 out of the area to the sheet, leaves B5 a cell wider than
// the room it has. The pinned engine answers so; this one runs phase 9 again and answers at rest, with what the pinned engine's next
// action would have brought: phases 9 and 10 alone on the pinned answer's sheet give this answer's places
{
  const map = { B0: { text: 'x'.repeat(20) }, B1: { text: 'x'.repeat(9) }, B2: { text: 'xxx' }, B3: { text: 'x'.repeat(28) }, B4: { text: 'xxxxx' }, B5: { text: 'x'.repeat(22) }, D: { kind: 'area' }, Z: { text: 'x' } };
  const note = { cols: 29, boxes: [{ id: 'B0', kind: 'text', col: 6, y: 10, cw: 1, ch: 4 }, { id: 'B1', kind: 'text', col: 2, y: 9, cw: 3 }, { id: 'B2', kind: 'text', col: 6, y: 3, cw: 1, ch: 3 },
    { id: 'B3', kind: 'text', col: 9, y: 1, cw: 7 }, { id: 'B4', kind: 'text', col: 17, y: 2, cw: 4 }, { id: 'B5', kind: 'text', col: 9, y: 6 }] };
  const commands = [
    { type: 'drawArea', box: null, id: 'D', at: { col: 2, y: 0, cols: 13, rows: 4 } },
    { type: 'enter', box: null, id: 'B1', to: 'D', at: { col: 2, y: 3 } },
    { type: 'leave', box: 'D', id: 'B1', to: null, at: { col: 17, y: 13 } },
    { type: 'enter', box: null, id: 'B0', to: 'D', at: { col: 4, y: 1 } },
    { type: 'leave', box: 'D', id: 'B0', to: null, at: { col: 16, y: 6 } },
  ];
  // (the engine pinned at 0d94f29, which went when the stage ended, left B5 off its rest width here until the next action)
  const now = play(A, note, map, commands);
  const before = now.trees.slice(0, -1).every((T) => off(A, T, map).length === 0), en = off(A, now.tree, map);
  ok('1 the case: every tree before the last command at rest', before, before);
  ok('1a this engine\'s answer at rest by the formula, valid, a rest after the first reported', en.length === 0 && validate(now.tree, now.ctx).length === 0 && now.again > 0, [en, validate(now.tree, now.ctx), now.again]);
  // the places it ends at, written down: the sheet's blocks as (column, row, width, rows), the area empty again
  const want = '[[null,[["B0",16,6,2,7],["B1",17,13,4,1],["B2",0,3,2,3],["B3",9,6,8,2],["B4",17,2,5,1],["B5",9,11,7,2],["D",2,1,14,4]]],["D",[]]]';
  ok('1b and every block stands where this case ends: B0 out of the area at column 16, row 6; B5 under it at row 11, seven cells wide; the area at row 1', places(now.tree) === want, places(now.tree));
  // and so a later action far away changes nothing of it: a text made far below and deleted again
  const far = { type: 'create', box: null, id: 'Z', kind: 'text', at: { col: 24, y: 60, frow: 60, w: 3 }, away: false, set: { cw: 2 } };
  const more = play(A, note, map, [...commands, far]);
  const strip = (T) => places({ ...T, boxes: new Map([...T.boxes].filter(([id]) => id !== 'Z')) });
  ok('1c a block made far below it changes no place of it', strip(more.tree) === places(now.tree), [strip(more.tree), places(now.tree)]);
}

// ---- 2. A temporary height that starts with no action (a note opened with one) changes no canonical row (L9), so it may leave a text
// off its rest width on the rows shown: A, 60 letters, stands under P and rests against W beside its canonical rows; P shows two
// temporary rows, A goes down under them, and W is beside it no more. The first action in the container, here one far away, brings
// it to rest: A widens to its natural width
{
  const map = { P: { text: 'x', temp: 2 }, A: { text: 'x'.repeat(60) }, W: { text: 'x' }, F: { text: 'x' } };
  const note = { cols: 44, boxes: [{ id: 'P', kind: 'text', col: 2, y: 0, cw: 4 }, { id: 'A', kind: 'text', col: 2, y: 1 }, { id: 'W', kind: 'text', col: 10, y: 1, cw: 2 }, { id: 'F', kind: 'text', col: 36, y: 30, cw: 3 }] };
  const calm = { ...map, P: { text: 'x' } }, quiet = play(A, note, calm, []);
  const opened = play(A, note, map, []), e0 = off(A, opened.tree, map), wA = (T) => T.boxes.get('A').w - 1;
  ok(`2 opened with a temporary height above it, A is off its rest width on the rows it shows (${e0[0]}); with none it is at rest at the same width`,
    e0.length === 1 && /^sheet: A /.test(e0[0]) && off(A, quiet.tree, calm).length === 0 && wA(quiet.tree) === wA(opened.tree), [e0, off(A, quiet.tree, calm), wA(quiet.tree), wA(opened.tree)]);
  const after = play(A, note, map, [{ type: 'remove', box: null, id: 'F' }]);
  ok(`2a the first action in the sheet, a deletion far away, brings it to rest (A ${wA(opened.tree)} cells, then ${wA(after.tree)})`,
    off(A, after.tree, map).length === 0 && wA(after.tree) > wA(opened.tree) && validate(after.tree, after.ctx).length === 0, [off(A, after.tree, map), validate(after.tree, after.ctx)]);
}

// ---- 3. G25: an undo and the width of a text it does not reach. The same A, its width at rest against W on the rows shown. F is
// deleted and made again by an undo, whose SETTLE runs on the canonical layout (G23), where W is not beside A. The engine before G25 rested A
// by those rows and widened it; this one gives a rest width by canonical rows to the block the undo brings back alone, and leaves A
{
  const map = { A: { text: 'x'.repeat(50), temp: 2 }, W: { text: 'x' }, F: { text: 'x' } };
  const note = { cols: 44, boxes: [{ id: 'A', kind: 'text', col: 2, y: 0, cw: 8 }, { id: 'W', kind: 'text', col: 14, y: 2, cw: 1, ch: 9 }, { id: 'F', kind: 'text', col: 36, y: 30, cw: 3 }] };
  const commands = (E) => {
    const first = [{ type: 'size', box: null, id: 'A', set: { cw: null } }, { type: 'remove', box: null, id: 'F' }];
    const f = play(E, note, map, [first[0]]).tree.boxes.get('F');
    return [...first, { type: 'create', box: null, id: 'F', kind: 'text', at: { col: f.col, y: f.y, frow: f.y, w: f.w }, away: true, set: { cw: f.cw }, canonical: true }];
  };
  const now = play(A, note, map, commands(A)), w = (p, i) => p.trees[i].boxes.get('A').w - 1;
  ok(`3a this engine's undo leaves A's width (${w(now, 2)} cells, then ${w(now, 3)}) and W's row, at rest, and F is back at its place`, w(now, 3) === w(now, 2) && off(A, now.tree, map).length === 0
    && JSON.stringify([now.tree.boxes.get('F').col, now.tree.boxes.get('F').y]) === JSON.stringify([now.trees[1].boxes.get('F').col, now.trees[1].boxes.get('F').y]) && now.tree.boxes.get('W').y === now.trees[2].boxes.get('W').y && validate(now.tree, now.ctx).length === 0, [w(now, 2), w(now, 3), off(A, now.tree, map)]);
}

process.exit(fails ? 1 : 0);
