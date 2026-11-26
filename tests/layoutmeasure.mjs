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
import { settleTree } from '../public/layout/tree.js';
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

{ // 3a, 3b: the Measure's inputs change while the page answers; an epoch whose signatures change with it
  const px = { A: 24, B: 24 }, nat = { A: 24 }; let fire = null;
  const M = createMeasure({ probe: { rows: (id) => { const h = px[id]; if (fire === 'rows') { fire = null; px[id] = 240; M.invalidate(); } return { height: h }; }, natural: (id) => { const w = nat[id]; if (fire === 'natural') { fire = null; nat[id] = 480; M.invalidate(); } return w; } }, sign: (id) => id, cell: CELL });
  fire = 'rows';
  const first = M.rows('A', 5), second = M.rows('A', 5), third = M.rows('A', 5), st = M.stats();
  ok('3a a font loads while the page measures a height: the old height is given for that question and kept for no other; the next question asks the page again and gets the new one, once', first.rows === 1 && second.rows === 10 && third.rows === 10 && st.probed === 2, { first, second, st });
  fire = 'natural';
  const n1 = M.natural('A'), n2 = M.natural('A'), n3 = M.natural('A');
  ok('3a\' the same for a natural width: a number is given, never nothing, and the next question gets the new one', n1 === 1 && n2 === 20 && n3 === 20 && M.stats().probed === 4, { n1, n2, n3 });
  let c2 = 0, bump = null;
  const M2 = createMeasure({ probe: { rows: (id) => { if (bump === id) { bump = null; M2.changed('Z'); } c2++; return { height: 24 }; }, natural: () => 24 }, sign: (id) => id, cell: CELL });
  bump = 'A'; M2.rows('A', 5); M2.rows('A', 5);
  ok('3a" and for a block\'s content said to change while the page answers: that answer is kept for no other question', c2 === 2 && (M2.rows('A', 5), c2) === 2, c2);
  // a signature that has the font in it, as §4.3 has it
  let font = 1; const P = { rows: () => ({ height: 24 * font }), natural: () => 24 };
  const F = createMeasure({ probe: P, sign: (id) => id + ':font' + font, cell: CELL });
  F.rows('A', 5); F.rows('B', 5);
  font = 2; F.invalidate();
  const v = F.version(), a = F.rows('A', 5), after = F.version(); F.natural('B');
  ok(`3b a font loads, the page says so, and its signatures change with it: the version is ${v} before the first measurement of the new epoch and after it, and after every other`, a.rows === 2 && after === v && F.version() === v, { v, after, now: F.version() });
}

{ // 5
  const bad = { N: { height: NaN }, I: { height: Infinity }, M: { height: -4 }, X: { height: 24, extra: NaN }, G: { height: 24 } };
  const M = createMeasure({ probe: { rows: (id) => bad[id], natural: (id) => (id === 'G' ? NaN : 24) }, sign: (id) => id, cell: CELL });
  const fails5 = ['N', 'I', 'M', 'X'].map((id) => { try { M.rows(id, 5); return null; } catch (e) { return e.message; } }), nat = (() => { try { M.natural('G'); return null; } catch (e) { return e.message; } })();
  ok('5 a height that is no length (NaN, Infinity, negative), a temporary part or a natural width that is none: a failure with the engine\'s own kind of message, naming the block and no content', fails5.every((m) => /^measure: the (temporary )?height of [NIMX] is no length$/.test(m || '')) && /^measure: the natural width of G is no length$/.test(nat || ''), [...fails5, nat]);
  ok('5a and nothing of a failed question is kept: asked again, it fails again', (() => { try { M.rows('N', 5); return false; } catch { return true; } })() && [0, -24, NaN, Infinity, undefined, '24'].every((cell) => { try { createMeasure({ probe: {}, sign: () => '', cell }); return false; } catch (e) { return /no cell size/.test(e.message); } }));
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

  // the next command after a font loaded in the middle of the last one: asked of the page again, and fit
  map.C = { text: 'x'.repeat(40) }; M2.changed('C');
  const before = P2.calls.rows, t3 = B.typed(a2, { id: 'C' }, { ctx: ctx(M2), journal: j2 }), e3 = entriesOf(j2.export())[1];
  ok('7a\' the next command is measured afresh and its entry is fit and replays', t3.ok && P2.calls.rows > before && e3.unfit === undefined && replay(e3, KINDS).same === true, { unfit: e3.unfit });
  // a Measure whose version cannot be read
  for (const [name, mk] of [['a getter that throws', () => Object.defineProperty({ rows: P.stub.rows, natural: P.stub.natural }, 'version', { get() { throw new Error('swordfish'); } })], ['a version that throws', () => ({ ...P.stub, version() { throw new Error('swordfish'); } })], ['a version that is no function', () => ({ ...P.stub, version: 7 })]]) {
    const j4 = createJournal(), change = { type: 'size', box: null, id: 'A' };
    let r4 = null, t4 = null; try { r4 = j4.run(a.doc.tree, change, null, ctx(mk())); } catch (err) { t4 = err; }
    const alone = settleTree(a.doc.tree, change, null, ctx(P.stub));
    ok(`7c ${name}: the command is answered as settleTree alone answers it, it is in the journal, unfit, with no word of the error`, !t4 && !!r4 && str(r4) === str(alone) && j4.entries().length === 1 && j4.entries()[0].unfit?.includes('answers') && !j4.export().includes('swordfish'), { t4: t4 && t4.message, unfit: j4.entries()[0]?.unfit });
  }
  // a carry over a Measure whose version cannot be read, with no other word of what it reads: stale, whatever the way it fails
  for (const [name, mk] of [['a getter that throws', (m) => Object.defineProperty({ rows: m.rows, natural: m.natural }, 'version', { get() { throw new Error('swordfish'); } })], ['a version that throws', (m) => ({ rows: m.rows, natural: m.natural, version() { throw new Error('swordfish'); } })], ['a version that is no function', (m) => ({ rows: m.rows, natural: m.natural, version: 7 })]]) {
    const m9 = { A: { text: 'x'.repeat(60) }, B: { text: 'x' } }, bl = [T('A', 2, 3), T('B', 2, 20, { cw: 5 })], e9 = { ctx: ctx(mk(stubMeasure(m9))) }, n9 = B.opened(bl, e9);
    let c9 = null, t9 = null, d9 = null;
    try {
      c9 = B.carry(n9, { id: 'A', point: { x: 3.5, y: 3.3 } }, e9);
      c9 = B.moved(n9, c9, { x: 20, y: 12 });
      m9.A = { text: 'x'.repeat(600) };   // the measured text changes, and the next target asks a width not asked before
      c9 = B.moved(n9, c9, { x: n9.doc.tree.cols - 0.5, y: 12 });
      d9 = B.dropped(n9, c9);
    } catch (err) { t9 = err; }
    ok(`7d a carry over a Measure with ${name}, the measured text changed and the pointer carried on to the right edge: nothing is thrown, the carry is stale and cancelled, the note is shown as it is, and the drop is «stale» with nothing to write`, !t9 && !!c9 && B.stale(n9, c9) && c9.cancelled === true && B.preview(n9, c9) === n9.doc.tree && d9.ok === false && d9.why === 'stale' && d9.write === null, { t9: t9 && t9.message, d9 });
  }
  {
    // a Measure with no version at all is the laboratory's: the answers already given are kept, and that is all
    const m9 = { A: { text: 'x'.repeat(60) }, B: { text: 'x' } }, bl = [T('A', 2, 3), T('B', 2, 20, { cw: 5 })], e9 = { ctx: ctx(stubMeasure(m9)) }, n9 = B.opened(bl, e9);
    let c9 = B.carry(n9, { id: 'A', point: { x: 3.5, y: 3.3 } }, e9);
    c9 = B.moved(n9, c9, { x: 20, y: 12 });
    const f = B.frozen({ rows: () => ({ rows: 1, shown: 1 }), natural: () => 1 }), g = B.frozen(Object.defineProperty({}, 'version', { get() { throw new Error('x'); } }));
    ok('7e a Measure with no version has none through a frozen one either, and a carry over it is not stale by that; a version that cannot be read cannot be read through a frozen one', !B.stale(n9, c9) && f.version === undefined && (() => { try { return g.version && false; } catch { return true; } })());
  }
  // a version that is a method of its Measure, read through the frozen copy a carry works with: called on the Measure it is of
  class Priv { #rev = '2.5'; constructor(m) { this.rows = m.rows; this.natural = m.natural; } version() { return this.#rev; } }
  for (const [name, mk, want] of [['a version that reads «this»', (m) => ({ rows: m.rows, natural: m.natural, revision: '1.0', version() { return this.revision; } }), '1.0'], ['a version that reads a private field', (m) => new Priv(m), '2.5']]) {
    const m9 = { A: { text: 'x'.repeat(60) }, B: { text: 'x' } }, bl = [T('A', 2, 3), T('B', 2, 20, { cw: 5 })], me = mk(stubMeasure(m9)), j9 = createJournal(), e9 = { ctx: ctx(me), journal: j9 }, n9 = B.opened(bl, e9);
    let c9 = null, d9 = null, t9 = null, fv = null;
    try {
      fv = B.frozen(me).version();
      c9 = B.carry(n9, { id: 'A', point: { x: 3.5, y: 3.3 } }, e9);
      c9 = B.moved(n9, c9, { x: 20, y: 12 });
      d9 = B.dropped(n9, c9);
    } catch (err) { t9 = err; }
    const es = entriesOf(j9.export());
    ok(`7f ${name}: through a frozen Measure it is the Measure's own, the carry is not stale, its drop is accepted, and every entry of the carry has that version, is fit and replays`, !t9 && fv === want && fv === me.version() && !c9.cancelled && d9.ok === true && es.length > 0 && es.every((e) => e.answers.version === want && e.unfit === undefined && replay(e, KINDS).same === true), { t9: t9 && t9.message, fv, ok: d9 && d9.ok, unfit: es.map((e) => e.unfit) });
  }
  ok('7g a version that is no function is handed through a frozen Measure as it is', B.frozen({ version: 7 }).version === 7);

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
