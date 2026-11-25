// The engine against its pinned copy (docs/LAYOUT-SEAMS-PLAN.md §4.4): the same notes and commands, under the default rules, give the
// same answers, by value. It is the reference of the refactors of the seams stage (the switches made core, the frame inside the solve),
// which are meant to keep the behaviour; a difference is allowed only when it is one a decision of the owner means, held to what
// that decision can change (`meantBy` below) and counted. The copy, tests/lab/engine-0d94f29/, is `main` at 0d94f29 and goes when the stage ends.
//
//   node tests/layoutsame.mjs [seed] [notes]

import { load, run, canon, patches, storedOf, NEW, OLD } from './lib/layout/pair.mjs';
import { stubMeasure } from './lib/measure.mjs';
import { restAgainstRef } from './lab/rest-ref.mjs';
import { validate } from '../public/layout/validate.js';
import { rest } from '../public/layout/settle.js';

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

/** Differences that are meant. Two decisions of the owner made after the copy was pinned change answers (2026-11-23): G24, an action
 *  ends with every elastic block at its rest width, where the copy ran phase 9 once and left the rest of it to the next action; and
 *  G25, an undo gives no rest width by canonical rows. A reason says a difference may be there; it does not say the difference is
 *  right (the independent review of 3b3cbb2), so each is held to what its decision can change, and anything else fails:
 *  - only the tree may differ, and what is derived from it (`pair.mjs`: the outcome, `start`, the memory and the pressed block are
 *    compared as ever, and the written fields are the copy's own `diff` of the engine's tree);
 *  - the engine's tree is one `validate` accepts, and every container that differs from the copy's stands at its rest widths by the
 *    formula written apart (tests/lab/rest-ref.mjs);
 *  - G24: the engine itself reports a rest after the first that changed something (`hooks.trace`, phase 9 with `again`). On a note
 *    with no area the tree has an independent reference, and must equal it value for value, stacks and all: the copy's own answer,
 *    rested by phases 9 and 10 alone. With areas a command is several SETTLEs and the later rest may be an inner one, which that
 *    reference does not follow; those are counted apart;
 *  - G25: the change is an undo's, and some block's width or height differs between the two answers. An undo whose blocks all end at
 *    the same sizes must give the same answer whole. */
const str = (v) => JSON.stringify(canon(v)), each = (T) => [[null, T], ...T.areas];
const sizes = (T) => str(each(T).map(([n, L]) => [n, [...L.boxes.values()].map((x) => [x.id, x.w, x.h]).sort()]));
const meantBy = (rules) => ({ change, root, a, b, again }) => {
  if (!a.ok || !b.ok) return null;
  const ctx = { ...A.ctx, rules };
  if (validate(a.layout, ctx).length) return null;
  const theirs = new Map(each(b.layout));
  for (const [name, L] of each(a.layout)) {
    if (theirs.has(name) && str([...L.boxes]) === str([...theirs.get(name).boxes])) continue;
    if (rules['SIZE.1'] !== false && restAgainstRef({ ...L, areas: new Map() }, ctx.measure, A.SETTINGS).length) return null;
  }
  if (change.canonical) return sizes(a.layout) !== sizes(b.layout) ? 'an undo that rests by the rows shown (G25)' : null;
  if (!again) return null;
  if (root.areas.size || a.layout.areas.size || b.layout.areas.size) return 'a later rest changed something, a note with areas (G24)';
  const r = rest(b.layout, ctx);
  return r.ok && str([...r.layout.boxes]) === str([...a.layout.boxes]) ? 'a later rest changed something: the copy\'s answer, rested (G24)' : null;
};
const UNDO = 'an undo that rests by the rows shown (G25)';

// the bounds of a meant difference, shown to hold: a patch of an undo spoilt, a memory spoilt, and a far block moved a row in a
// command with a later rest, each on an engine otherwise right
{
  const spoil = (over) => { const flag = { on: false }; return { ...A, ...over(flag), settleTree: (root, change, memory, ctx, hooks) => { flag.on = !!change.canonical; return A.settleTree(root, change, memory, ctx, hooks); } }; };
  const patch = spoil((flag) => ({ diff: (stored, after) => { const d = A.diff(stored, after); if (flag.on) { const id = [...after.boxes.keys()][0]; d.set(id, { ...(d.get(id) || {}), row: 999 }); } return d; } }));
  const p1 = run(patch, B, { seed: 11, notes: 120, max: 1, meant: meantBy(A.DEFAULT) });
  ok('a written patch of an undo with a row of 999 in it: told apart, whatever the undo excuses', p1.diffs.length > 0, p1.meant);
  const p2 = run(patch, B, { seed: 12, notes: 60, max: 1, rulesOf: (E) => E.resolve({ 'SIZE.1': false }), meant: meantBy(A.resolve({ 'SIZE.1': false })) });
  ok('and the same under SIZE.1 off', p2.diffs.length > 0, p2.meant);
  const mem = { ...A, settleTree: (root, change, memory, ctx, hooks) => { const r = A.settleTree(root, change, memory, ctx, hooks); return r.ok && change.canonical ? { ...r, memory: { ...r.memory, dir: 'sideways' } } : r; } };
  const p3 = run(mem, B, { seed: 11, notes: 120, max: 1, meant: meantBy(A.DEFAULT) });
  ok('an undo that answers with another memory: told apart', p3.diffs.length > 0 && /outside the tree|undo|create again/.test(p3.diffs[0].what), p3.diffs[0] && p3.diffs[0].what);
  const low = { ...A, settleTree: (root, change, memory, ctx, hooks) => {
    let again = false; const r = A.settleTree(root, change, memory, ctx, { ...hooks, trace: (ph, L, info) => { if (info && info.again) again = true; if (hooks && hooks.trace) hooks.trace(ph, L, info); } });
    if (!r.ok || !again || change.canonical) return r;
    const last = [...r.layout.boxes.values()].sort((x, y) => y.y - x.y)[0]; if (!last) return r;
    const boxes = new Map(r.layout.boxes); boxes.set(last.id, { ...last, y: last.y + 1, yc: (last.yc ?? last.y) + 1 });
    return { ...r, layout: { ...r.layout, boxes } };
  } };
  const p4 = run(low, B, { seed: 11, notes: 700, max: 1, meant: meantBy(A.DEFAULT) });
  ok('a command with a later rest that also puts the lowest block a row lower: told apart', p4.diffs.length > 0, p4.meant);
}

const seed = +process.argv[2] || 11, notes = +process.argv[3] || 700;
const r = run(A, B, { seed, notes, meant: meantBy(A.DEFAULT) });
ok(`${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${r.stat.moved} of them changing the tree, ${r.stat.refused} refused, ${r.stat.failed} failed): the same answers as 0d94f29, but ${JSON.stringify(r.meant)}`, r.diffs.length === 0, r.diffs[0]);
const undos = (r.by['undo carry']?.accepted || 0) + (r.by['create again']?.accepted || 0), meantAll = Object.values(r.meant).reduce((x, y) => x + y, 0);
ok(`the meant differences are few: ${meantAll} of ${r.stat.accepted} accepted commands (${r.meant[UNDO] || 0} of ${undos} undos)`, meantAll * 100 < r.stat.accepted && (r.meant[UNDO] || 0) * 50 < undos, r.meant);
console.log('  ' + Object.entries(r.by).map(([k, v]) => `${k} ${v.accepted}/${v.moved}/${v.refused}/${v.failed}`).join(', ') + '  (accepted/changing/refused/failed)');
// a kind the run never accepted compares nothing
const need = ['carry', 'carry away', 'carry+hold', 'carry+shift', 'carry past the edge', 'undo carry', 'size', 'size code', 'size set', 'width', 'create', 'remove', 'create again', 'remove area', 'enter', 'leave', 'areaSide', 'drawArea', 'ungroup', 'area size', 'show'];
const thin = need.filter((k) => !(r.by[k] && (k.startsWith('show') ? r.by[k].accepted : r.by[k].moved) >= 5));
ok('every kind of command accepted with a change at least five times', thin.length === 0, thin);
ok(`the patches compared hold fields written as removed (${r.stat.removals})`, r.stat.removals >= 50);

// the same under SIZE.1 off: DRAG.A3's narrowing at an edge needed SIZE.1 as a switch and is in effect only where SIZE.1 is on as core
{
  // no rest width is given there, so neither decision has a subject: no difference is meant, and none is let through
  const o = run(A, B, { seed: seed + 1, notes: Math.round(notes / 2), rulesOf: (E) => E.resolve({ 'SIZE.1': false }) });
  ok(`SIZE.1 off: ${o.stat.notes} notes, ${o.stat.commands} commands (${o.stat.accepted} accepted): the same answers as 0d94f29, none excused`, o.diffs.length === 0 && Object.keys(o.meant).length === 0, o.diffs[0]);
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
