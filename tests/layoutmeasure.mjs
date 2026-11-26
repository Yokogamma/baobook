// Node: the app's Measure without a document (public/layout/measure.js; LAYOUT-ENGINE-PLAN §4.3, LAYOUT-SEAMS-PLAN §8).
//   1  pixels as cells and rows: rounded up, at least one, the temporary part on top, the lines, the natural width;
//   2  one answer for a signature and a width: the page is asked once; another signature is another answer;
//   3  the epoch: `invalidate` drops every answer and changes the version and every signature;
//   4  the version: a change the page tells, and one it did not tell, found when the block is measured;
//   5  what is no length is a failure, told as one; the answers kept are bounded;
//   6  the engine on this Measure stands as on the Node stub that measures the same;
//   7  the journal keeps the measuring version with the answers of a command; answers of two versions make the entry unfit;
//   8  a carry is stale once the Measure's inputs change.
//
//   node tests/layoutmeasure.mjs

import { createMeasure } from '../public/layout/measure.js';
import * as B from '../public/layout/bridge.js';
import { createJournal, entriesOf, replay, encode } from '../public/layout/journal.js';
import { fxFromCol, rowFromY } from '../public/layout/geometry.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { stubMeasure } from './lib/measure.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 900))); };
const str = (v) => JSON.stringify(encode(v)), CELL = 24;
/** The page's side for the tests: pixels a hidden element would give, from the stub's cells; `calls` counts what was asked of it. */
function pageOf(map) {
  const stub = stubMeasure(map), calls = { rows: 0, natural: 0 };
  const probe = { rows(id, n) { calls.rows++; const r = stub.rows(id, n); return { height: r.rows * CELL - 3, extra: (r.shown - r.rows) * CELL, lines: r.lines }; }, natural(id) { calls.natural++; return stub.natural(id) * CELL - 5; } };
  return { probe, sign: (id) => (map[id].kind || 'text') + ':' + (map[id].text ?? '') + ':' + (map[id].temp || 0), calls, stub };
}
const T = (id, col, row, o = {}) => ({ id, text: 'x', fx: fxFromCol(col), row: rowFromY(row), ...o });

{ // 1
  const px = { A: { height: 24 }, B: { height: 25 }, C: { height: 47.9999994 }, D: { height: 0 }, E: { height: 30, extra: 50, lines: 7 }, F: { height: 48, extra: 0 } }, nat = { A: 0, B: 23, C: 24, D: 24.2, E: 300, F: 1 };
  const M = createMeasure({ probe: { rows: (id) => px[id], natural: (id) => nat[id] }, sign: (id) => id, cell: CELL });
  const r = Object.fromEntries(Object.keys(px).map((id) => [id, M.rows(id, 5)]));
  ok('1 a height in pixels as rows, rounded up and at least one: 24 px one row, 25 two, a hair under 48 two, nothing one', r.A.rows === 1 && r.B.rows === 2 && r.C.rows === 2 && r.D.rows === 1, r);
  ok('1a the temporary part is shown on top, rounded up by itself; the lines as given, or the rows', r.E.rows === 2 && r.E.shown === 2 + 3 && r.E.lines === 7 && r.F.shown === 2 && r.F.lines === 2 && r.A.lines === 1, [r.E, r.F]);
  ok('1b the natural width in whole cells, at least one: an empty block one cell (PR-8)', M.natural('A') === 1 && M.natural('B') === 1 && M.natural('C') === 1 && M.natural('D') === 2 && M.natural('E') === 13, Object.keys(nat).map((id) => M.natural(id)));
}

{ // 2, 3, 4
  const map = { A: { text: 'x'.repeat(60) }, B: { text: 'x' } }, P = pageOf(map), M = createMeasure({ probe: P.probe, sign: P.sign, cell: CELL });
  const a = M.rows('A', 5), again = M.rows('A', 5); a.rows = 99;
  ok('2 the same block at the same width: the page is asked once, and the answer is the same, whatever was done to the one given before', P.calls.rows === 1 && again.rows === 4 && M.rows('A', 5).rows === 4 && M.natural('A') === 20 && M.natural('A') === 20 && P.calls.natural === 1, P.calls);
  ok('2a another width, another block: asked each once', M.rows('A', 10).rows === 2 && M.rows('B', 5).rows === 1 && P.calls.rows === 3 && M.stats().probed === 4 && M.stats().asked === 7, M.stats());
  const v0 = M.version();
  map.A = { text: 'x'.repeat(120) }; M.changed('A');
  const v1 = M.version(), r = M.rows('A', 5);
  ok('2b the content changed and the page said so: the version is another, the block is measured again with its new signature, and measuring it does not change the version again', v1 !== v0 && r.rows === 8 && P.calls.rows === 4 && M.version() === v1 && M.rows('B', 5).rows === 1 && P.calls.rows === 4, { v0, v1, now: M.version() });
  map.B = { text: 'x'.repeat(30) };
  const before = M.version(), rb = M.rows('B', 5), after = M.version();
  ok('4 a change the page did not tell: the block is still measured for its content as it is, and the version changes when that is found', rb.rows === 2 && after !== before && M.rows('B', 5).rows === 2 && M.version() === after, { before, after });
  const s0 = M.sign('A'), n0 = P.calls.rows;
  M.invalidate();
  ok('3 a font loaded: no answer is kept, the version and every block\'s signature are others, and the page is asked again', M.stats().kept === 0 && M.version() !== after && M.sign('A') !== s0 && M.rows('A', 5).rows === 8 && P.calls.rows === n0 + 1 && /^[0-9.]+$/.test(M.version()), M.version());
}

{ // 5
  const bad = { N: { height: NaN }, I: { height: Infinity }, M: { height: -4 }, X: { height: 24, extra: NaN }, G: { height: 24 } };
  const M = createMeasure({ probe: { rows: (id) => bad[id], natural: (id) => (id === 'G' ? NaN : 24) }, sign: (id) => id, cell: CELL });
  const fails5 = ['N', 'I', 'M', 'X'].map((id) => { try { M.rows(id, 5); return null; } catch (e) { return e.message; } }), nat = (() => { try { M.natural('G'); return null; } catch (e) { return e.message; } })();
  ok('5 a height that is no length (NaN, Infinity, negative), a temporary part or a natural width that is none: a failure with the engine\'s own kind of message, naming the block and no content', fails5.every((m) => /^measure: the (temporary )?height of [NIMX] is no length$/.test(m || '')) && /^measure: the natural width of G is no length$/.test(nat || ''), [...fails5, nat]);
  ok('5a and nothing of a failed question is kept: asked again, it fails again', (() => { try { M.rows('N', 5); return false; } catch { return true; } })() && (() => { try { createMeasure({ probe: {}, sign: () => '', cell: 0 }); return false; } catch (e) { return /no cell size/.test(e.message); } })());
  let n = 0; const K = createMeasure({ probe: { rows: () => ({ height: 24 }), natural: () => 24 }, sign: (id) => id, cell: CELL, keep: 10 });
  for (let i = 0; i < 100; i++) { K.rows('b' + i, 5); n = Math.max(n, K.stats().kept); }
  ok(`5b the answers kept are bounded: at most ${n} of 100 with a bound of 10`, n <= 11 && K.rows('b99', 5).rows === 1, n);
}

{ // 6
  const blocks = [T('A', 2, 3), T('B', 2, 9, { cw: 5 }), T('C', 20, 3, { cw: 5 }), { id: 'K', kind: 'code', text: 'a\nb\nc', fx: fxFromCol(40), row: rowFromY(2) }, { id: 'R', kind: 'area', text: '', fx: fxFromCol(30), row: rowFromY(8), cw: 14 }, { id: 'c', text: 'x'.repeat(50), parent: 'R', col: 0, row: 0, cw: 4 }];
  const map = Object.fromEntries(blocks.map((b) => [b.id, { kind: b.kind, text: b.text }]));
  map.A = { text: 'x'.repeat(70), temp: 2 };
  const P = pageOf(map), M = createMeasure({ probe: P.probe, sign: P.sign, cell: CELL });
  const ctx = (measure) => ({ rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure }), a = B.opened(blocks, { ctx: ctx(M) }), b = B.opened(blocks, { ctx: ctx(P.stub) });
  ok('6 a note opened on this Measure, over a page that answers in pixels, stands as on the Node stub that measures the same, temporary rows and an area\'s frame included', !a.safe && !b.safe && str(a.doc.tree) === str(b.doc.tree) && a.doc.tree.boxes.get('A').t === 2, { a: a.errors, b: b.errors });
  const st = M.stats();
  ok(`6a opening asked ${st.asked} questions and the page ${st.probed}: an answer is given from what is kept`, st.probed < st.asked && st.probed > 0, st);

  // 7: the journal
  const journal = createJournal(), env = { ctx: ctx(M), journal };
  map.B = { text: 'x'.repeat(90) }; M.changed('B');
  const t = B.typed(a, { id: 'B' }, env), e = entriesOf(journal.export())[0];
  ok('7 a command through the journal: the measuring version is kept with its answers, the entry is fit, and it replays', t.ok && e.answers.version === M.version() && /^[0-9.]+$/.test(e.answers.version) && e.unfit === undefined && replay(e, KINDS).same === true, { v: e.answers.version, unfit: e.unfit });
  // a font loads in the middle of a command: the answers of the command are of two states
  let once = true; const P2 = pageOf(map);
  const M2 = createMeasure({ probe: { rows: (id, n) => { const r = P2.probe.rows(id, n); if (once && id === 'C') { once = false; M2.invalidate(); } return r; }, natural: P2.probe.natural }, sign: P2.sign, cell: CELL });
  const j2 = createJournal(), a2 = B.opened(blocks, { ctx: ctx(M2) });
  once = true; map.C = { text: 'x'.repeat(80) }; M2.changed('C');
  B.typed(a2, { id: 'C' }, { ctx: ctx(M2), journal: j2 });
  const e2 = entriesOf(j2.export())[0], r2 = replay(e2, KINDS);
  ok('7a the Measure\'s inputs changed in the middle of a command: its answers are not one state, the entry says so and is not replayed', !once && Array.isArray(e2.unfit) && e2.unfit.includes('answers') && Array.isArray(r2.unfit) && r2.same === undefined, { unfit: e2.unfit });
  const j3 = createJournal(); j3.run(a.doc.tree, { type: 'size', box: null, id: 'A' }, null, { ...ctx({ ...P.stub, version: () => 'swordfish' }) });
  ok('7b a version that is not digits is not kept, and the entry is unfit', !j3.export().includes('swordfish') && j3.entries()[0].unfit?.includes('answers'), j3.entries()[0].unfit);

  // 8: a carry
  const n8 = B.opened(blocks, { ctx: ctx(M) }), env8 = { ctx: ctx(M) };
  let c = B.carry(n8, { id: 'C', point: { x: 21.5, y: 3.3 } }, env8);
  c = B.moved(n8, c, { x: 44, y: 20 });
  const fresh = !B.stale(n8, c);
  M.invalidate();
  const c2 = B.moved(n8, c, { x: 45, y: 22 });
  ok('8 a carry on this Measure with no other word from the caller: a font loads in the middle, the carry is stale, its move asks nothing and its drop writes nothing', fresh && B.stale(n8, c) && c2.cancelled === true && B.dropped(n8, c2).why === 'stale');
  let k = B.carry(n8, { id: 'C', point: { x: 21.5, y: 3.3 } }, env8);
  k = B.moved(n8, k, { x: 44, y: 20 });
  map.B = { text: 'x'.repeat(10) }; M.changed('B');
  ok('8a and so is one after the page said a block\'s content changed', B.stale(n8, k) && B.dropped(n8, k).ok === false);
}

process.exit(fails ? 1 : 0);
