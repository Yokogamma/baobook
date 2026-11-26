// Node: the carry as the pointer makes it (public/layout/drag.js; LAYOUT-RULES §6.A, DRAG.B1, AREA.7), pure: targets and changes, nothing run.
//   1  the cell under the pointer with the grab's offset, rounded, and the unrounded row (DRAG.A1);
//   2  sticking to the column and to the row it was taken from (DRAG.A2);
//   3  home and outside ask nothing (DRAG.A4, A3b, PR-1);
//   4  away set with no column shared, cleared only with a column and a row shared (DRAG.B1);
//   5  the pointer inside an area's frame asks to enter, outside it to leave; the lowered bottom; what never goes in (AREA.7).
//
//   node tests/layoutdrag.mjs

import { pick, aim, over, awayAt, next } from '../public/layout/drag.js';
import { open } from '../public/layout/layout.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { stubMeasure } from './lib/measure.mjs';
import { noteOf } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 900))); };
const map = { A: { text: 'x' }, B: { text: 'x' }, W: { text: 'x' }, R: { kind: 'area' }, c: { text: 'x' }, d: { text: 'x' }, Q: { kind: 'area' } };
const ctx = { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) };
const T = open(noteOf(60, [{ id: 'A', kind: 'text', col: 2, y: 3, cw: 5 }, { id: 'B', kind: 'text', col: 2, y: 9, cw: 5 }, { id: 'W', kind: 'text', col: 40, y: 20, cw: 16 },
  { id: 'R', kind: 'area', col: 20, y: 4, cw: 12 }, { id: 'Q', kind: 'area', col: 40, y: 4, cw: 8 }], { R: [{ id: 'c', kind: 'text', col: 0, y: 0, cw: 4 }, { id: 'd', kind: 'text', col: 0, y: 6, cw: 4 }], Q: [] }), ctx).shown;
const A = T.boxes.get('A'), R = T.boxes.get('R'), S = SETTINGS;
const p0 = { x: A.col + 1.5, y: A.y + 0.25 }, at = (dx, dy) => ({ x: p0.x + dx, y: p0.y + dy });

{ // 1
  const g = pick(T, null, 'A', p0, ctx), t = aim(g, null, at(3.4, 2.6), S);
  ok('1 the block\'s cell follows the pointer with the offset it was grabbed at, rounded; frow is the unrounded row', g.grab.dx === 1.5 && g.grab.dy === 0.25 && t.col === A.col + 3 && t.y === A.y + 3 && Math.abs(t.frow - (A.y + 2.6)) < 1e-9 && t.w === A.w, t);
  const e = aim(g, null, at(-30, -30), S);
  ok('1a the left edge and row 0 stop it', e.col === 0 && e.y === 0 && e.frow === 0, e);
  ok('1b a block that is not there is not picked', pick(T, null, 'nobody', p0, ctx) === null && pick(T, 'R', 'A', p0, ctx) === null);
}
{ // 2
  const g = pick(T, null, 'A', p0, ctx);
  const v = aim(g, null, at(0.7, 5), S), v2 = aim(g, null, at(0.8, 5), S), h = aim(g, null, at(6, 0.7), S), h2 = aim(g, null, at(6, 0.8), S);
  ok(`2 carried down with the pointer ${0.7} of a column aside (STICK ${S.STICK}): the column is held; at 0.8 it is not`, v.col === A.col && v.y === A.y + 5 && v2.col === A.col + 1, { v, v2 });
  ok('2a carried sideways with the pointer 0.7 of a row off: the row is held, and frow is that row; at 0.8 it is not', h.y === A.y && h.frow === A.y && h.col === A.col + 6 && h2.y === A.y + 1 && Math.abs(h2.frow - (A.y + 0.8)) < 1e-9, { h, h2 });
  ok('2b with STICK 0 the target is the rounded pointer', aim(g, null, at(0.7, 5), { ...S, STICK: 0 }).col === A.col + 1);
  const gc = pick(T, 'R', 'c', { x: R.col + 2, y: R.y + 1.2 }, ctx), inR = aim(gc, null, { x: R.col + 2.4, y: R.y + 9 }, S);
  ok('2c in another container than the one it was taken from nothing is held', inR.col === Math.round(R.col + 2.4 - gc.grab.dx), inR);
}
{ // 3
  const g = pick(T, null, 'A', p0, ctx);
  ok('3 exactly on the cell it was taken from: home, nothing asked', next(g, null, T, at(0.3, 0.2), S).state === 'home' && next(g, null, T, p0, S).change === undefined);
  ok('3a the pointer out of the sheet\'s box: outside, nothing asked', next(g, null, T, { x: -0.1, y: 5 }, S).state === 'outside' && next(g, null, T, { x: 5, y: -0.1 }, S).state === 'outside' && next(g, null, T, { x: T.cols + 1.1, y: 5 }, S).state === 'outside');
}
{ // 4
  let g = pick(T, null, 'A', p0, ctx);
  const s1 = next(g, null, T, at(2, 8), S), s2 = next(s1.drag, null, T, at(A.w + 1, 8), S), s3 = next(s2.drag, null, T, at(1, 12), S), s4 = next(s3.drag, null, T, at(1, 0.2), S);
  ok('4 two columns aside it still shares a column: not away; with no column shared: away', s1.change.type === 'carry' && s1.change.away === false && s2.change.away === true, [s1.change, s2.change]);
  ok('4a back over its columns but rows below its place: still away; with a row shared too: no longer', s3.change.away === true && s4.change.away === false, [s3.change, s4.change]);
  ok('4b a block the start has not in this container is away', awayAt(false, T, 'c', { col: 0, y: 0 }) === true);
}
{ // 5
  const g = pick(T, null, 'A', p0, ctx), f = g.frames.get('R'), HR = f.top - R.y;
  const inP = { x: f.c0 + 3 + g.grab.dx, y: f.top + 2 + g.grab.dy };
  const e = next(g, null, T, inP, S);
  ok('5 the pointer inside an area\'s frame: an enter into it, at the area\'s cell under the pointer, away from the start', over(g, inP) === 'R' && e.change.type === 'enter' && e.change.to === 'R' && e.change.box === null && e.change.at.col === 3 && e.change.at.y === 2 && e.to === 'R' && e.drag.away === true, e.change);
  const edge = next(g, null, T, { x: f.c1 + 0.9, y: f.top + 2 }, S);
  ok('5a a cell that would put it past the area\'s right side is brought in whole', edge.change.type === 'enter' && edge.change.at.col === f.cols - A.w, edge.change);
  const gc = pick(T, 'R', 'c', { x: f.c0 + 1, y: f.top + 0.5 }, ctx), out = next(gc, 'R', T, { x: 5.5, y: 30.2 }, S);
  ok('5b a child carried out of the frame: a leave to the sheet, at the sheet\'s cell under the pointer', out.change.type === 'leave' && out.change.box === 'R' && out.change.at.col === Math.round(5.5 - gc.grab.dx) && out.change.at.y === Math.round(30.2 - gc.grab.dy) && out.to === null, out.change);
  const toQ = next(gc, 'R', T, { x: T.boxes.get('Q').col + 3, y: T.boxes.get('Q').y + 1.5 }, S);
  ok('5c from one area straight over another: the leave first', toQ.change.type === 'leave' && toQ.to === null, toQ.change);
  const d = T.areas.get('R').boxes.get('d'), low = f.top + d.y + d.h;
  ok(`5d the frame's bottom as the carry started, lowered to one row under the lowest of its other blocks (row ${f.bottom}): inside just above it, outside at it`, f.bottom === Math.max(R.y + R.h, low + 1) && over(g, { x: f.c0 + 1, y: f.bottom - 0.01 }) === 'R' && over(g, { x: f.c0 + 1, y: f.bottom }) === null, f);
  const gd = pick(T, 'R', 'd', { x: f.c0 + 1, y: f.top + d.y }, ctx), c = T.areas.get('R').boxes.get('c');
  ok('5e the carried block\'s own body never keeps the bottom low', gd.frames.get('R').bottom === Math.max(R.y + R.h, f.top + c.y + c.h + 1) && HR >= 1, gd.frames.get('R'));
  const gR = pick(T, null, 'R', { x: R.col + 1, y: R.y }, ctx), Q = T.boxes.get('Q');
  ok('5f an area never goes into an area', over(gR, { x: Q.col + 3, y: Q.y + 1.5 }) === null);
  const gW = pick(T, null, 'W', { x: 41, y: 20.5 }, ctx), fq = gW.frames.get('Q');
  ok('5g a set width wider than the area never goes in; into a wider area it does', gW.w > fq.cols && over(gW, { x: fq.c0 + 1, y: fq.top + 0.5 }) === null && gW.w <= f.cols === (over(gW, { x: f.c0 + 1, y: f.top + 0.5 }) === 'R'), { w: gW.w, q: fq.cols, r: f.cols });
}

process.exit(fails ? 1 : 0);
