// Node: the action journal of the layout engine (public/layout/journal.js; docs/LAYOUT-SEAMS-PLAN.md §8): what the engine was asked and
// what it answered, exported and played again with the measurements it recorded.
//   1  recorded, settleTree answers what it answers alone; every entry replays to the recorded answer, refusals and the moves of a
//      gesture with their start and memory among them;
//   2  the ring keeps the last entries; the export is read back;
//   3  no content of the note is in the export;
//   4  a replay that asks for a measurement the journal has not says so, and gives no verdict; a measurement that differs is told;
//   5  Maps keep their order through the export, and a number JSON has no word for comes back;
//   6  the journal keeps what the engine's shapes name and nothing else: a field a caller added, the words of an error the engine did
//      not write and what a Measure threw do not reach the export; of the engine's own values the projection loses nothing (1c);
//   7  blocks named as Object's own members (`toString`, `__proto__`) are keys as any other, recorded and read back;
//   9  the second round of the review: names of settings and versions the engine has not, an answer of the Measure that is no number,
//      a hook and a passport that throw; an entry that lost something says so and is not replayed; a long message of the engine's
//      own is kept whole;
//   8  the inputs and the versions are written down before the engine runs: a function that changes its input is found by the replay.
//
//   node tests/layoutjournal.mjs [seed] [histories]

import { createJournal, entriesOf, replay, encode, decode, recording, replaying, Missing } from '../public/layout/journal.js';
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { open } from '../public/layout/layout.js';
import { validate } from '../public/layout/validate.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { stubMeasure } from './lib/measure.mjs';
import { draw, noteOf } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1200))); };
const ctxOf = (map) => ({ rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) });
const str = (v) => JSON.stringify(encode(v));
const seed = +process.argv[2] || 1, N = +process.argv[3] || 150;

// ---- 1. the histories of the undo lab, every command through the journal and through settleTree alone
{
  const J = createJournal({ limit: 1e6, versions: { build: 2026112502, engine: '0.1' } });
  let commands = 0, differ = 0, refused = 0, moves = 0, notes = 0, lost = 0, firstLost = null;
  for (let i = 0; i < N; i++) {
    const h = draw(seed * 7919 + i), map = JSON.parse(JSON.stringify(h.map)), ctx = ctxOf(map);
    const o = open(h.note, ctx); if (!o.ok) continue;
    notes++;
    let T = o.shown;
    const both = (root, c, memory) => {
      const before = [str(root), str(memory), str(c)];
      const alone = settleTree(root, c, memory, ctx), kept = J.run(root, c, memory, ctx);
      commands++; if (str(alone) !== str(kept)) differ++; if (!kept.ok) refused++;
      const e = J.entries().at(-1), got = [e.tree, e.memory, e.change, e.result].map((x) => JSON.stringify(x)), want = [...before, str(kept)];
      for (let k = 0; k < 4; k++) if (got[k] !== want[k]) { lost++; firstLost = firstLost || { n: e.n, what: ['tree', 'memory', 'change', 'result'][k], got: got[k].slice(0, 400), want: want[k].slice(0, 400) }; }
      return kept;
    };
    for (const s of [...h.warm.map((action) => ({ action })), ...h.stages]) {
      const c = s.action;
      if (s.added) map[s.added.id] = s.added.content;
      if (!c.moves) { const r = both(T, c, emptyMemory()); if (r.ok) T = r.layout; continue; }
      let start = T, memory = emptyMemory(), last = null;
      for (const m of c.moves) {
        const r = both(start, { type: 'carry', box: c.box, id: c.id, at: m.at, away: !!m.away, ...(m.through ? { through: m.through } : {}) }, memory);
        moves++; if (!r.ok) { last = null; break; }
        start = r.start; memory = r.memory; last = r.layout;
      }
      if (last) T = last;
    }
  }
  ok(`1 ${notes} notes, ${commands} commands through the journal (${refused} refused or failed, ${moves} moves of gestures): each answered as settleTree alone answers`, commands > N * 2 && differ === 0 && refused > 0 && moves > 20, { commands, differ, refused, moves });
  const entries = entriesOf(J.export());
  let same = 0, other = 0, missing = 0, first = null;
  for (const e of entries) { const r = replay(e, KINDS); if (r.missing) missing++; else if (r.same) same++; else { other++; first = first || { n: e.n, change: e.change }; } }
  ok(`1a exported, read back and replayed with the recorded measurements alone: ${same} of ${entries.length} entries give the recorded answer`, entries.length === commands && same === commands && !other && !missing, { same, other, missing, first });
  ok('1c of the engine\'s own trees, memories, changes and answers the projection loses nothing: each entry is the value itself, field for field and in its order', lost === 0, firstLost);
  ok('1b an entry carries the versions it was given, the rules and the settings', entries[0].versions.build === 2026112502 && entries[0].versions.engine === '0.1' && str(decode(entries[0].rules)) === str(DEFAULT) && decode(entries[0].settings).TEXTW === SETTINGS.TEXTW, entries[0].versions);
}

// ---- 2. the ring
{
  const map = { A: { text: 'x' }, B: { text: 'x' } }, ctx = ctxOf(map), T = open(noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 3 }, { id: 'B', kind: 'text', col: 1, y: 4, cw: 3 }]), ctx).shown;
  const J = createJournal({ limit: 3 });
  for (let y = 1; y <= 7; y++) J.run(T, { type: 'carry', box: null, id: 'A', at: { col: 8, y, frow: y, w: 4 }, away: true }, emptyMemory(), ctx);
  const e = J.entries();
  ok('2 a ring of three after seven commands: the last three, numbered 5 to 7', e.length === 3 && e.map((x) => x.n).join() === '5,6,7' && decode(e[2].change).at.y === 7, e.map((x) => x.n));
  J.clear();
  ok('2a cleared: empty, and what is no journal is refused by name', J.entries().length === 0 && (() => { try { entriesOf('{"entries":[]}'); return false; } catch (err) { return /not a layout journal/.test(err.message); } })());
}

// ---- 3. no content of the note
{
  const secret = 'the owner wrote this and nobody else reads it', map = { A: { text: secret }, K: { kind: 'code', text: 'password = "hunter2"\nline two' }, R: { kind: 'area' }, c: { text: 'inside ' + secret } };
  const ctx = ctxOf(map), T = open(noteOf(40, [{ id: 'A', kind: 'text', col: 1, y: 0 }, { id: 'K', kind: 'code', col: 1, y: 6 }, { id: 'R', kind: 'area', col: 20, y: 1, cw: 12 }], { R: [{ id: 'c', kind: 'text', col: 0, y: 0 }] }), ctx).shown;
  const J = createJournal();
  J.run(T, { type: 'carry', box: null, id: 'A', at: { col: 4, y: 12, frow: 12, w: 8 }, away: false }, emptyMemory(), ctx);
  J.run(T, { type: 'size', box: 'R', id: 'c' }, emptyMemory(), ctx);
  J.run(T, { type: 'enter', box: null, id: 'K', to: 'R', at: { col: 0, y: 2 } }, emptyMemory(), ctx);
  const text = J.export();
  ok('3 the export holds no word of a text, a code block or an area\'s child, and no field named text', J.entries().length === 3 && !/owner|nobody|password|hunter2|line two|inside/.test(text) && !/"text"\s*:/.test(text), text.slice(0, 200));
}

// ---- 4. a measurement the journal has not; one that differs
{
  const map = { A: { text: 'x'.repeat(40) }, B: { text: 'x' } }, ctx = ctxOf(map), T = open(noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0 }, { id: 'B', kind: 'text', col: 20, y: 0, cw: 3 }]), ctx).shown;
  const J = createJournal();
  map.A = { text: 'x'.repeat(70) };
  J.run(T, { type: 'size', box: null, id: 'A' }, emptyMemory(), ctx);
  const e = entriesOf(J.export())[0], asked = Object.keys(e.answers.rows.A || {});
  ok(`4 typing in A: the entry keeps the rows it asked of A (at ${asked.join(', ')} cells) and its natural width, and replays`, asked.length > 0 && e.answers.natural.A > 0 && replay(e, KINDS).same === true, e.answers);
  const cut = JSON.parse(JSON.stringify(e)); delete cut.answers.rows.A[asked[0]];
  const r = replay(cut, KINDS);
  ok('4a with one of those answers taken away: the replay names the measurement it has not, and gives no verdict', !!r.missing && r.missing.id === 'A' && String(r.missing.cells) === asked[0] && r.same === undefined, r);
  const bent = JSON.parse(JSON.stringify(e)); for (const k of asked) { bent.answers.rows.A[k].rows += 3; bent.answers.rows.A[k].shown += 3; }
  const d = replay(bent, KINDS);
  ok('4b with those answers three rows taller: a difference, told as one, with the recorded answer beside', d.same === false && !!d.recorded && !d.missing, d.same);
  const m = replaying(recording(stubMeasure(map)).answers);
  ok('4c a replaying measure with nothing recorded throws Missing, by name', (() => { try { m.natural('A'); return false; } catch (err) { return err instanceof Missing && err.id === 'A'; } })());
}

// ---- 5. the encoding
{
  const v = { m: new Map([['b', 1], ['a', new Map([['z', Infinity]])]]), list: [1, -Infinity, null], skip: undefined, s: 'x' }, back = decode(JSON.parse(JSON.stringify(encode(v))));
  ok('5 a Map keeps its order and its nesting through JSON, Infinity comes back, undefined is left out', back.m instanceof Map && [...back.m.keys()].join() === 'b,a' && back.m.get('a').get('z') === Infinity && back.list[1] === -Infinity && back.list[2] === null && !('skip' in back) && back.s === 'x', [...back.m]);
}

// ---- 6. what the shapes do not name does not reach the export
{
  const secret = 'the owner wrote this and nobody else reads it', map = { A: { text: secret }, B: { text: 'x' } }, ctx = ctxOf(map);
  const T = open(noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 3 }, { id: 'B', kind: 'text', col: 1, y: 4, cw: 3 }]), ctx).shown;
  const dirty = { ...T, title: secret, boxes: new Map([...T.boxes].map(([id, b]) => [id, { ...b, text: secret, content: { text: secret }, above: (b.above || []).map((st) => ({ ...st, note: secret })) }])) };
  const change = { type: 'carry', box: null, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4, label: secret }, away: true, text: secret };
  const memory = { ...emptyMemory(), draft: secret };
  const J = createJournal({ versions: { build: 1, note: { text: secret }, engine: secret, [secret]: 1 } });
  const clean = settleTree(T, { type: 'carry', box: null, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx);
  const r = J.run(dirty, change, memory, { ...ctx, settings: { ...SETTINGS, NOTE: secret, [secret]: 1 }, rules: { ...DEFAULT, note: secret, [secret]: true } });
  const text = J.export(), e = entriesOf(text)[0];
  ok('6 a tree, a change, a memory, rules and settings with the note\'s text in fields of the caller\'s own: the engine answers, and the export has none of it', r.ok && clean.ok && !text.includes('owner') && !/"(text|content|title|note|label|draft|NOTE)"\s*:/.test(text) && e.unfit === undefined && str(e.versions) === '{"build":1}', text.slice(0, 300));
  ok('6a that entry replays to the recorded answer', replay(e, KINDS).same === true);
  // a Measure that throws with the text it was measuring
  const J2 = createJournal(), bad = { ...ctx, measure: { rows: (id) => { throw new Error('cannot measure «' + map[id].text + '»'); }, natural: (id) => { throw new Error('cannot measure «' + map[id].text + '»'); } } };
  let threw2 = null, r2 = null;
  try { r2 = J2.run(T, { type: 'size', box: null, id: 'A' }, emptyMemory(), bad); } catch (err) { threw2 = err; }
  const t2 = J2.export(), e2 = entriesOf(t2)[0];
  ok('6b a Measure that throws with the note\'s text in its message: the caller gets what the engine gives, the export says that the Measure threw and no word of the message', J2.entries().length === 1 && !t2.includes('owner') && !t2.includes('cannot measure') && JSON.stringify(e2.result).includes('journal: the Measure threw') && (threw2 ? threw2.message.includes(secret) : r2.ok === false), { t2: t2.slice(-300) });
  // something the engine calls throws words of its own
  const J3 = createJournal(); let threw3 = null;
  try { J3.run(T, { type: 'size', box: null, id: 'A' }, emptyMemory(), ctx, {}, () => { throw new TypeError('no property of «' + secret + '»'); }); } catch (err) { threw3 = err; }
  const t3 = J3.export(), e3 = decode(entriesOf(t3)[0].result);
  ok('6c an error the engine did not write: thrown on to the caller as it was, kept in the journal as its length alone', threw3 instanceof TypeError && threw3.message.includes(secret) && !t3.includes('owner') && e3.why === 'threw' && /^another error \(\d+ characters\)$/.test(e3.errors[0]), e3);
  const J4 = createJournal();
  const r4 = J4.run(T, { type: 'carry', box: null, id: 'nobody', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx), e4 = decode(J4.entries()[0].result);
  ok('6d the engine\'s own message of a failure is kept as written', !r4.ok && Array.isArray(r4.errors) && r4.errors.length > 0 && str(e4.errors) === str(r4.errors), { got: e4.errors, want: r4.errors });
}

// ---- 7. blocks named as Object's own members
{
  const ids = ['toString', '__proto__', 'constructor', 'hasOwnProperty'], map = Object.create(null);
  for (const id of ids) map[id] = { text: 'x'.repeat(40) };
  const ctx = ctxOf(map), T = open(noteOf(40, ids.map((id, i) => ({ id, kind: 'text', col: 1 + i * 9, y: 0 }))), ctx).shown;
  let all = true, miss = true, first = null;
  for (const id of ids) {
    const J = createJournal();
    map[id] = { text: 'x'.repeat(90) };
    J.run(T, { type: 'size', box: null, id }, emptyMemory(), ctx);
    const text = J.export(), e = entriesOf(text)[0];
    const asked = Object.hasOwn(e.answers.rows, id) ? Object.keys(e.answers.rows[id]) : [];
    if (!asked.length || !Object.hasOwn(e.answers.natural, id) || replay(e, KINDS).same !== true) { all = false; first = first || { id, answers: text.slice(text.indexOf('"answers"'), text.indexOf('"answers"') + 300) }; }
    const cut = JSON.parse(text).entries[0]; cut.answers = { rows: {}, natural: {} };
    const r = replay(cut, KINDS);
    if (!r.missing || r.same !== undefined) { miss = false; first = first || { id, r: r.same }; }
    map[id] = { text: 'x'.repeat(40) };
  }
  ok('7 blocks named toString, __proto__, constructor and hasOwnProperty: their measurements are in the export under their names, and the entry replays from them', all, first);
  ok('7a with the tables emptied, the replay of each names a measurement it has not: nothing is read from Object\'s prototype', miss, first);
  ok('7b and nothing was written there', ({}).rows === undefined && typeof ({}).toString === 'function' && Object.keys(Object.prototype).length === 0 && Object.keys(Function.prototype.toString).length === 0);
}

// ---- 8. the inputs and the versions are those before the run
{
  const map = { A: { text: 'x' }, B: { text: 'x' } }, ctx = ctxOf(map), fresh = () => open(noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 3 }, { id: 'B', kind: 'text', col: 1, y: 4, cw: 3 }]), ctx).shown;
  const versions = { build: 1, engine: '1.0' }, J = createJournal({ versions });
  versions.build = 2;
  const T = fresh(), was = str(T), change = { type: 'carry', box: null, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, wasChange = str(change);
  // a function that moves a block of the tree it is given, and bends the change, before it settles
  const mutant = (root, c, memory, cx, hooks) => { root.boxes.get('B').col = 14; root.boxes.get('B').y = 9; root.boxes.get('B').yc = 9; c.at.col = 20; return settleTree(root, c, memory, cx, hooks); };
  J.run(T, change, emptyMemory(), ctx, {}, mutant);
  versions.engine = '2.0';
  const e = entriesOf(J.export())[0];
  ok('8 a function that changes the tree and the change it is given: the entry holds both as they were given', str(T) !== was && JSON.stringify(e.tree) === was && JSON.stringify(e.change) === wasChange, { tree: JSON.stringify(e.tree).slice(0, 300) });
  const r = replay(e, KINDS);
  ok('8a and the replay with the engine finds the difference', r.same === false && !!r.recorded, r.same);
  ok('8b the versions are those the journal was made with, whatever the caller does to its object after', e.versions.build === 1 && e.versions.engine === '1.0', e.versions);
  const J2 = createJournal({ versions: { build: 1 } }); J2.run(fresh(), { type: 'carry', box: null, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx);
  const a = J2.entries()[0], b = J2.entries(); a.versions.build = 'bent';
  ok('8c an honest run of the same command replays as the same', replay(entriesOf(J2.export())[0], KINDS).same === true, b.length);
}

// ---- 9. what a caller can still hand the journal, and an entry that is not fit to replay
{
  const word = 'swordfish', map = { A: { text: 'x'.repeat(40) }, B: { text: 'x' } }, ctx = ctxOf(map);
  const T = open(noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0 }, { id: 'B', kind: 'text', col: 20, y: 0, cw: 3 }]), ctx).shown;
  const size = { type: 'size', box: null, id: 'A' };
  const J = createJournal({ versions: { build: 1, note: { text: word }, measure: word, [word]: 2 } });
  J.run(T, size, emptyMemory(), { ...ctx, settings: { ...SETTINGS, NOTE: word, [word]: 3 }, rules: { ...DEFAULT, [word]: true } });
  const t = J.export(), e = entriesOf(t)[0];
  ok('9 settings, rules and versions with names and values of the caller\'s own: only the engine\'s names are in the export, and the entry replays', !t.includes(word) && str(Object.keys(decode(e.settings))) === str(Object.keys(SETTINGS)) && str(Object.keys(decode(e.rules))) === str(Object.keys(DEFAULT)) && str(e.versions) === '{"build":1}' && replay(e, KINDS).same === true, t.slice(0, 200));
  // an answer of the Measure with words in it
  const J2 = createJournal(), m = ctx.measure;
  J2.run(T, size, emptyMemory(), { ...ctx, measure: { rows: (id, cells) => ({ ...m.rows(id, cells), lines: word }), natural: (id) => m.natural(id) } });
  const t2 = J2.export(), e2 = entriesOf(t2)[0], r2 = replay(e2, KINDS);
  ok('9a a Measure whose answer has a word where a number is read: no word in the export, the entry says its answers are not whole, and the replay gives no verdict', !t2.includes(word) && str(e2.unfit) === '["answers"]' && str(r2.unfit) === '["answers"]' && r2.same === undefined && r2.missing === undefined, { unfit: e2.unfit, r2 });
  // a hook that throws in the engine's voice, and a passport that throws
  const J3 = createJournal(); let r3 = null, t3e = null;
  try { r3 = J3.run(T, size, emptyMemory(), ctx, { trace: () => { throw new Error('settle: ' + word); } }); } catch (err) { t3e = err; }
  const t3 = J3.export();
  ok('9b a hook that throws «settle: …» with a word of its own: the entry says a hook threw and keeps no word of it', J3.entries().length === 1 && !t3.includes(word) && t3.includes('journal: a hook threw') && (t3e ? t3e.message.includes(word) : r3.ok === false), t3.slice(-200));
  const J4 = createJournal(); let r4 = null, t4e = null;
  const kinds = { ...KINDS, text: { ...KINDS.text, rows: () => { throw new Error('gap: ' + word); } } };
  try { r4 = J4.run(T, size, emptyMemory(), { ...ctx, kinds }); } catch (err) { t4e = err; }
  const t4 = J4.export();
  ok('9c a passport that throws likewise: the entry says a passport threw', !t4.includes(word) && t4.includes('journal: a passport threw') && (t4e ? t4e.message.includes(word) : r4.ok === false), t4.slice(-200));
  // an id longer than the journal keeps
  const long = 'L'.repeat(65), map5 = { [long]: { text: 'x' }, B: { text: 'x' } }, ctx5 = ctxOf(map5);
  const T5 = open(noteOf(30, [{ id: long, kind: 'text', col: 1, y: 0, cw: 3 }, { id: 'B', kind: 'text', col: 1, y: 4, cw: 3 }]), ctx5).shown;
  const J5 = createJournal(), r5 = J5.run(T5, { type: 'carry', box: null, id: long, at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx5);
  const e5 = entriesOf(J5.export())[0], p5 = replay(e5, KINDS);
  ok('9d a block whose id has 65 characters: the engine answers, the entry names what it lost by the shapes\' fields, and the replay gives no verdict on the engine', validate(T5, ctx5).length === 0 && r5.ok && Array.isArray(e5.unfit) && e5.unfit.includes('change.id') && e5.unfit.includes('tree.boxes{}') && e5.unfit.every((x) => /^[a-zA-Z.{}\[\]]+$/.test(x)) && str(p5.unfit) === str(e5.unfit) && p5.same === undefined, { unfit: e5.unfit, p5: Object.keys(p5) });
  const J6 = createJournal(), bad = J6.run(T5, { type: 'carry', box: long, id: 'B', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx5), e6 = decode(J6.entries()[0].result);
  ok('9e and a message of the engine that would name that id is kept as its length', !bad.ok && bad.errors[0].includes(long) && !J6.export().includes(long) && e6.errors[0] === `another error (${bad.errors[0].length} characters)`, e6.errors);
  // long messages of the engine's own, ids within the journal's length
  const i60 = 'n'.repeat(60), j60 = 'm'.repeat(60), J7 = createJournal();
  const a7 = J7.run(T, { type: 'carry', box: i60, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx), b7 = J7.run(T, { type: 'carry', box: j60, id: 'A', at: { col: 8, y: 2, frow: 2, w: 4 }, away: true }, emptyMemory(), ctx);
  const [x7, y7] = entriesOf(J7.export());
  ok(`9f a message of the engine longer than an id (${a7.errors?.[0].length} characters) is kept whole, two of them are told apart, and both entries replay`, !a7.ok && a7.errors[0].length > 64 && decode(x7.result).errors[0] === a7.errors[0] && decode(y7.result).errors[0] === b7.errors[0] && a7.errors[0] !== b7.errors[0] && x7.unfit === undefined && replay(x7, KINDS).same === true && replay(y7, KINDS).same === true, decode(x7.result).errors);
  const swapped = JSON.parse(JSON.stringify(x7)); swapped.result = y7.result;
  ok('9g one\'s recorded answer under the other\'s command: a difference', replay(swapped, KINDS).same === false);
}

process.exit(fails ? 1 : 0);
