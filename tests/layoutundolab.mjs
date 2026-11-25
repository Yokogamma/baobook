// Node: the undo experiment of the seams stage (docs/LAYOUT-SEAMS-PLAN.md §7, S4; tests/lab/undo-snapshot/): what an undo after later
// changes of content gives by four paths, on random histories. This test keeps the experiment running and its required cases drawn; the
// numbers it prints are the report's. It judges no path right: which undo the app takes was the owner's choice (Q7, G27).
//
//   node tests/layoutundolab.mjs [seed] [histories]

import { run, play, draw, noteOf, chars } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1500))); };
const seed = +process.argv[2] || 1, n = +process.argv[3] || 600;
const r = run({ seed, n }), s = r.stat, pc = (x, of) => (of ? (100 * x / of).toFixed(1) + ' %' : '—');
const total = (p) => Object.values(p || {}).reduce((a, b) => a + b, 0);
const row = (k) => { const p = r.pairs[k] || {}, all = total(p); return `${k}: the same ${pc(p['the same'] || 0, all)}, other rows ${pc(p['other rows'] || 0, all)}, the same rows and other probes ${pc(p['the same rows, other probes'] || 0, all)} (of ${all})`; };

console.log(`  ${s.played} histories played of ${s.drawn} (${JSON.stringify(s.skipped)}); by the first action undone: ${JSON.stringify(s.byKind)}`);
console.log(`  ${s.between} with something between an action and its undo or more than one undo (${JSON.stringify(s.undos)} by the undos in a row), ${s.nothing} with one action and nothing after it`);
console.log(`  of them: a signature that returns ${s.returns}, a block only an entry holds changed ${s.held}, a composite action ${s.composite}, a gesture ${s.gesture}, a set size or the width handle ${s.sized}; changes of a code block ${s.code}, of temporary rows ${s.temp}, of an area's header ${s.header}, of a block's own rows ${s.own}`);
for (const k of Object.keys(r.status)) console.log(`  ${k}, the whole chain: ${JSON.stringify(r.status[k])}` + (r.errors[k] ? '  ' + JSON.stringify(r.errors[k]) : '') + (r.chain[k] ? '; by undo, the last action first: ' + JSON.stringify(r.chain[k]) : ''));
for (const k of Object.keys(r.pairs)) console.log('  ' + row(k));
console.log(`  one action and nothing after it, the tree before the action given back row for row: ${JSON.stringify(r.exact)}`);
if (r.found.length) console.log(`  found, an undo that failed: ${JSON.stringify(r.found.slice(0, 5))}` + (r.found.length > 5 ? ` and ${r.found.length - 5} more` : ''));

// ---- the experiment runs, and draws what the plan requires of it
ok('histories played: five in six of those drawn', s.played * 6 >= s.drawn * 5, s);
const st = r.status;
ok('(B), the candidate: never failed, never a result `validate` rejects, in any undo of a chain', !st.B.failed && !st.B.invalid && Object.values(r.chain.B).every((c) => !c.failed && !c.invalid), [st.B, r.chain.B, r.errors.B]);
ok('the yardstick (no action happened) could be played for nine in ten', (st.C.ok || 0) * 10 >= s.between * 9, st.C);
ok(`one action and nothing after it: (B) and (B′) give the tree before the action back row for row (${r.exact.B?.same} and ${r.exact["B'"]?.same} histories)`, r.exact.B && !r.exact.B.other && r.exact["B'"] && !r.exact["B'"].other, r.exact);
ok(`every path runs the whole chain of undos: second undos ${total(r.chain.B[2])}, third ${total(r.chain.B[3])}, for (B′) ${total(r.chain["B'"][2])} and ${total(r.chain["B'"][3])}`,
  total(r.chain.B[2]) >= n / 10 && total(r.chain.B[3]) >= n / 30 && total(r.chain["B'"][2]) >= n / 10 && total(r.chain.A[2]) >= n / 10, r.chain);
ok(`the required cases are drawn, told by the block: a signature that returns (${s.returns}), a block only an entry holds changed (${s.held}), a composite action then a change of content (${s.composite})`,
  s.returns >= n / 12 && s.held >= n / 100 && s.composite >= n / 30, s);
ok(`and the kinds the review of 84bb4f0 asked for: gestures with a hold or Shift (${s.gesture}), set sizes and widths as actions (${s.sized}), code blocks (${s.code}), temporary rows (${s.temp}), an area's header (${s.header}), a block's own rows (${s.own})`,
  [s.gesture, s.sized, s.code, s.temp, s.header, s.own].every((x) => x >= n / 40), s);
ok('every pair compared on a hundred histories at least, the probes after the restore among them', ['A ~ B', "B ~ B'", 'B ~ Bq', 'B ~ C'].every((k) => total(r.pairs[k]) >= 100), r.pairs);
{
  const again = run({ seed, n: 60 }), once = run({ seed, n: 60 });
  ok('the run is a function of its seed', JSON.stringify([again.stat, again.pairs, again.status, again.chain]) === JSON.stringify([once.stat, once.pairs, once.status, once.chain]));
}

// ---- named cases
// a signature that returns to its old value. A stands over B; A is carried aside; B's text is typed shorter and back. (B) finds no block
// that differs and gives the tree before the carry back, row for row
{
  const note = noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 5 }, { id: 'B', kind: 'text', col: 1, y: 3, cw: 5 }, { id: 'F', kind: 'text', col: 20, y: 0, cw: 3 }]);
  const map = { A: { text: chars(30) }, B: { text: chars(40) }, F: { text: 'x' } };
  const p = play({ note, map, warm: [], stages: [{ action: { type: 'carry', box: null, id: 'A', at: { col: 12, y: 0, frow: 0, w: 6 }, away: true }, edits: [{ id: 'B', content: { text: chars(5) } }, { id: 'B', content: { text: chars(40) } }] }] });
  ok('B typed shorter and back after A is carried aside: its signature is the old one, (B) has an empty queue and answers', !p.skip && p.queue === 0 && p.status.B === 'ok' && p.returns, p.skip || [p.queue, p.status, p.returns]);
}
// §7's point, in a history the generator drew (seed 101976): a block is carried, two blocks are typed over and back, the carry is undone.
// Every signature is the recorded one, so (B) runs nothing and gives the tree before the carry; the yardstick has the same rows; and the
// two are told apart only by what follows, the probes. (B) is not «the action never happened»
{
  const p = play(draw(101976));
  ok('typed over and back, then undone: (B) runs nothing, stands on the yardstick\'s rows, and differs from it by the probes alone', !p.skip && p.returns && p.queue === 0 && p.pairs['B ~ C'] === 'the same rows, other probes', p.skip || [p.returns, p.queue, p.pairs]);
}
// a code block shown whole, deleted, a line added to it while only the entry holds it, the deletion undone (the independent review of
// 84bb4f0: the lab's inverse lost `open`, and the block came back folded at 13 rows): every path gives it back shown whole, 21 rows
{
  const code = (k) => ({ kind: 'code', text: Array.from({ length: k }, () => 'xxxxxxxx').join('\n') });
  const note = noteOf(40, [{ id: 'K', kind: 'code', col: 2, y: 1, open: true }, { id: 'F', kind: 'text', col: 30, y: 0, cw: 3 }]);
  const p = play({ note, map: { K: code(20), F: { text: 'x' } }, warm: [], stages: [{ action: { type: 'remove', box: null, id: 'K' }, edits: [{ id: 'K', content: code(21) }] }] });
  const K = (k) => p.trees?.[k]?.boxes.get('K'), each = ['A', 'B', "B'", 'C'].map((k) => [k, K(k)?.open === true, K(k)?.h]);
  ok('an open code block deleted, a line added, the deletion undone: back shown whole at 21 rows by every path, a change of a block only the entry holds', !p.skip && p.held && each.every(([, o, h]) => o && h === 21), p.skip || [p.held, each]);
}
// the probes tell two trees with the same rows and another memory of gaps apart (the independent reviews of 84bb4f0 and 42f67dd): in
// both histories (A) and (B) end on the same rows and under every single deletion alike, and two deletions one after the other put a
// block on other rows (seed 100098: B2 then B1 leaves B0 a row apart; the first generator's 100091: R0c0 then R0c1 leaves B3 rows apart)
{
  const T = (k, o = {}) => ({ text: chars(k), ...o });
  const p1 = play(draw(100098));
  ok('seed 100098: (A) and (B) on the same rows, told apart by the probes', !p1.skip && p1.pairs['A ~ B'] === 'the same rows, other probes', p1.skip || p1.pairs);
  const note = noteOf(30, [{ id: 'B0', kind: 'text', col: 19, y: 8, cw: 7, ch: 4 }, { id: 'B1', kind: 'text', col: 16, y: 9 }, { id: 'B2', kind: 'text', col: 1, y: 8 }, { id: 'B3', kind: 'text', col: 11, y: 9 }, { id: 'B4', kind: 'text', col: 3, y: 12 }, { id: 'B5', kind: 'text', col: 8, y: 8, cw: 4 }, { id: 'R0', kind: 'area', col: 13, y: 6, cw: 14 }],
    { R0: [{ id: 'R0c0', kind: 'text', col: 5, y: 8, cw: 6 }, { id: 'R0c1', kind: 'text', col: 2, y: 11, cw: 6 }] });
  const p2 = play({ note, map: { B0: T(3), B1: T(51), B2: T(25), B3: T(15), B4: T(70), B5: T(18), R0: { kind: 'area' }, R0c0: T(27, { temp: 2 }), R0c1: T(4) }, warm: [], stages: [{ action: { type: 'remove', box: null, id: 'B4' }, edits: [{ id: 'B0', content: T(62) }] }] });
  ok('a deletion undone after typing, two children of an area deleted after it: (A) and (B) on the same rows, told apart by the probes', !p2.skip && p2.pairs['A ~ B'] === 'the same rows, other probes', p2.skip || p2.pairs);
}
// a block only an entry holds, counted by the entry that holds it (the independent review of 42f67dd). A is carried; B is typed from x to
// xx; B is deleted. Typed back to x while only the deletion's entry holds it, its content is no longer what that entry recorded: a
// change. Typed to the same xx again, it is none, though the carry's entry recorded x
{
  const note = noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 5 }, { id: 'B', kind: 'text', col: 10, y: 0, cw: 5 }, { id: 'F', kind: 'text', col: 20, y: 6, cw: 3 }]);
  const h = (last) => ({ note, map: { A: { text: 'x' }, B: { text: 'x' }, F: { text: 'x' } }, warm: [], stages: [
    { action: { type: 'carry', box: null, id: 'A', at: { col: 1, y: 4, frow: 4, w: 6 }, away: false }, edits: [{ id: 'B', content: { text: 'xx' } }] },
    { action: { type: 'remove', box: null, id: 'B' }, edits: [{ id: 'B', content: { text: last } }] }] });
  const back = play(h('x')), same = play(h('xx'));
  ok('B typed x → xx, deleted, then x again while only the deletion\'s entry holds it: a change of a held block; xx again: none', !back.skip && !same.skip && back.held === true && same.held === false, [back.skip || back.held, same.skip || same.held]);
}
// a defect of the engine the experiment found, reported and not repaired here (the independent review confirmed it with the inverse
// carry given straight to the engine): two carries with typing between and after; `inverse` fails the undo of the second carry, RELINK
// refusing phase 8 with a canonical place that overlaps. (B) answers both undos. With (B) chosen (G27), `inverse` goes in step 3
{
  const T = (k) => ({ text: chars(k) });
  const note = noteOf(37, [{ id: 'B0', kind: 'text', col: 22, y: 0, cw: 4, ch: 3 }, { id: 'B1', kind: 'text', col: 7, y: 4, cw: 3, ch: 4 }, { id: 'B2', kind: 'text', col: 10, y: 5, cw: 4, ch: 3 }, { id: 'B3', kind: 'text', col: 0, y: 1, cw: 2 }, { id: 'B4', kind: 'text', col: 21, y: 11 }]);
  const p = play({ note, map: { B0: T(15), B1: T(7), B2: T(10), B3: T(20), B4: T(56) },
    warm: [{ type: 'carry', box: null, id: 'B1', at: { col: 23, y: 11, frow: 11, w: 4 }, away: true }, { type: 'carry', box: null, id: 'B3', at: { col: 23, y: 5, frow: 5, w: 3 }, away: false }],
    stages: [{ action: { type: 'carry', box: null, id: 'B2', at: { col: 24, y: 14, frow: 14, w: 5 }, away: true }, edits: [{ id: 'B2', content: T(23) }, { id: 'B2', content: T(39) }, { id: 'B2', content: T(10) }] },
      { action: { type: 'carry', box: null, id: 'B0', at: { col: 13, y: 7, frow: 7, w: 5 }, away: true }, edits: [{ id: 'B4', content: T(41) }, { id: 'B1', content: T(64) }, { id: 'B2', content: T(6) }, { id: 'B2', content: T(10) }] }] });
  console.log(`  found: two carries with typing, the undo of the second by (A): ${p.chain?.A?.[0]}` + (p.errors?.A ? ' (' + p.errors.A + ')' : ''));
  ok('that history is played, and (B) answers both its undos', !p.skip && p.chain.B.length === 2 && p.chain.B.every((x) => x === 'ok'), p.skip || p.chain);
}

process.exit(fails ? 1 : 0);
