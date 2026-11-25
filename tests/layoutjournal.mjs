// Node: the action journal of the layout engine (public/layout/journal.js; docs/LAYOUT-SEAMS-PLAN.md §8): what the engine was asked and
// what it answered, exported and played again with the measurements it recorded.
//   1  recorded, settleTree answers what it answers alone; every entry replays to the recorded answer, refusals and the moves of a
//      gesture with their start and memory among them;
//   2  the ring keeps the last entries; the export is read back;
//   3  no content of the note is in the export;
//   4  a replay that asks for a measurement the journal has not says so, and gives no verdict; a measurement that differs is told;
//   5  Maps keep their order through the export, and a number JSON has no word for comes back.
//
//   node tests/layoutjournal.mjs [seed] [histories]

import { createJournal, entriesOf, replay, encode, decode, recording, replaying, Missing } from '../public/layout/journal.js';
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { open } from '../public/layout/layout.js';
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
  const J = createJournal({ limit: 1e6, versions: { build: 'test' } });
  let commands = 0, differ = 0, refused = 0, moves = 0, notes = 0;
  for (let i = 0; i < N; i++) {
    const h = draw(seed * 7919 + i), map = JSON.parse(JSON.stringify(h.map)), ctx = ctxOf(map);
    const o = open(h.note, ctx); if (!o.ok) continue;
    notes++;
    let T = o.shown;
    const both = (root, c, memory) => {
      const alone = settleTree(root, c, memory, ctx), kept = J.run(root, c, memory, ctx);
      commands++; if (str(alone) !== str(kept)) differ++; if (!kept.ok) refused++;
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
  ok('1b an entry carries the versions it was given, the rules and the settings', entries[0].versions.build === 'test' && str(decode(entries[0].rules)) === str(DEFAULT) && decode(entries[0].settings).TEXTW === SETTINGS.TEXTW, entries[0].versions);
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

process.exit(fails ? 1 : 0);
