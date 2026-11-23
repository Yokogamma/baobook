// The engine against its pinned copy (docs/LAYOUT-SEAMS-PLAN.md §4.4): the same notes and commands, under the default rules, give the
// same answers, by value. It is the reference of the refactors of the seams stage (the switches made core, the frame inside the solve),
// which are meant to keep the behaviour; a difference is allowed only when explained by a case written independently, listed in
// EXPECTED below with its reason. The copy, tests/lab/engine-0d94f29/, is `main` at 0d94f29 and goes when the stage ends.
//
//   node tests/layoutsame.mjs [seed] [notes]

import { load, run, canon, patches, storedOf, NEW, OLD } from './lib/layout/pair.mjs';
import { stubMeasure } from './lib/measure.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got, null, 1).slice(0, 4000))); };

const A = await load(NEW), B = await load(OLD);

// the comparison itself, so that a pass below is not a harness that sees nothing: a side given other rules is told apart; a side
// whose patch loses the fields written as removed is told apart (the independent review of 99c2520: `undefined` in a patch is a
// command, and by value it must not read as a field not written); and a patch that cannot be computed fails the run on its own, equal on
// both sides or not (the same review: `diff` given a tree for a Map threw on both sides, and the two errors compared equal)
{
  const r = run(A, B, { seed: 3, notes: 150, rulesOf: (E) => (E === A ? E.resolve({ 'P-ASIDE': false }) : E.DEFAULT), max: 1 });
  ok('the comparison tells two behaviours apart (one side with P-ASIDE off)', r.diffs.length > 0);
  const lossy = { ...A, diff: (st, after) => new Map([...A.diff(st, after)].map(([id, p]) => [id, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))])) };
  const l = run(lossy, B, { seed: 3, notes: 150, max: 1 });
  ok('a side that drops the fields written as removed is told apart', l.diffs.length > 0 && !l.diffs[0].broken && /written/.test(l.diffs[0].first?.path || ''), l.diffs[0]);
  const thrower = (E) => ({ ...E, diff: () => { throw new Error('no patch'); } });
  const t = run(thrower(A), thrower(B), { seed: 3, notes: 20, max: 1 });
  ok('a patch that cannot be computed fails the run, though both sides throw alike', t.diffs.length > 0 && !!t.diffs[0].broken, t.diffs[0]);
}

/** Differences that are meant, each with its reason and the case that shows the new answer right: none yet. */
const EXPECTED = [];

const seed = +process.argv[2] || 11, notes = +process.argv[3] || 700;
const r = run(A, B, { seed, notes });
const unexplained = r.diffs.filter((d) => !EXPECTED.some((e) => e.match(d)));
ok(`${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${r.stat.moved} of them changing the tree, ${r.stat.refused} refused, ${r.stat.failed} failed): the same answers as 0d94f29`, unexplained.length === 0, unexplained[0]);
console.log('  ' + Object.entries(r.by).map(([k, v]) => `${k} ${v.accepted}/${v.moved}/${v.refused}/${v.failed}`).join(', ') + '  (accepted/changing/refused/failed)');
// a kind the run never accepted compares nothing
const need = ['carry', 'carry away', 'carry+hold', 'carry+shift', 'carry past the edge', 'undo carry', 'size', 'size code', 'size set', 'width', 'create', 'remove', 'create again', 'remove area', 'enter', 'leave', 'areaSide', 'drawArea', 'ungroup', 'area size', 'show'];
const thin = need.filter((k) => !(r.by[k] && (k.startsWith('show') ? r.by[k].accepted : r.by[k].moved) >= 5));
ok('every kind of command accepted with a change at least five times', thin.length === 0, thin);
ok(`the patches compared hold fields written as removed (${r.stat.removals})`, r.stat.removals >= 50);

// the same under SIZE.1 off: DRAG.A3's narrowing at an edge needed SIZE.1 as a switch and is in effect only where SIZE.1 is on as core
{
  const o = run(A, B, { seed: seed + 1, notes: Math.round(notes / 2), rulesOf: (E) => E.resolve({ 'SIZE.1': false }) });
  ok(`SIZE.1 off: ${o.stat.notes} notes, ${o.stat.commands} commands (${o.stat.accepted} accepted): the same answers as 0d94f29`, o.diffs.length === 0, o.diffs[0]);
}

// a carry past the right edge, as a named case on both (the generator keeps most targets inside the container): an elastic text narrows
// to its floor and stops, a set width stops where it fits whole; with SIZE.1 off the text takes its clamped width there
for (const [name, rulesOf] of [['the default rules', (E) => E.DEFAULT], ['SIZE.1 off', (E) => E.resolve({ 'SIZE.1': false })]]) {
  const map = { T: { text: 'x'.repeat(30) }, S: { text: 'x' } };
  const answers = [A, B].map((E) => {
    const ctx = { rules: rulesOf(E), settings: E.SETTINGS, kinds: E.KINDS, measure: stubMeasure(map) };
    const boxes = [{ id: 'T', kind: 'text', col: 0, y: 5 }, { id: 'S', kind: 'text', col: 0, y: 9, cw: 10 }];
    const note = { cols: 20, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: E.readingOrder(boxes), areas: new Map() };
    const o = E.open(note, ctx), st = storedOf(E, note), out = [];
    for (const id of ['T', 'S']) {
      const b = o.shown.boxes.get(id), r2 = E.settleTree(o.shown, { type: 'carry', box: null, id, at: { col: 15, y: 0, frow: 0, w: b.w }, away: true }, E.emptyMemory(), ctx);
      out.push(r2.ok ? { layout: r2.layout, written: patches(E.diff(st, E.unshow(r2.layout, ctx))), place: [r2.layout.boxes.get(id).col, r2.layout.boxes.get(id).w] } : { ok: false, why: r2.why });
    }
    return out;
  });
  const same = JSON.stringify(canon(answers[0])) === JSON.stringify(canon(answers[1]));
  ok(`a carry past the right edge, ${name}: the same answers (T at ${JSON.stringify(answers[0][0].place)}, S at ${JSON.stringify(answers[0][1].place)})`, same && answers[0].every((x) => x.place), answers);
}

process.exit(fails ? 1 : 0);
