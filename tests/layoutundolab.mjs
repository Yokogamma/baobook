// Node: the undo experiment of the seams stage (docs/LAYOUT-SEAMS-PLAN.md §7, S4; tests/lab/undo-snapshot/): what an undo after later
// edits of content gives by four paths, on random histories. This test keeps the experiment running and its required cases drawn; the
// numbers it prints are the report's. It judges no path right: which undo the app takes is the owner's choice (Q7).
//
//   node tests/layoutundolab.mjs [seed] [histories]

import { run, play, draw, noteOf, chars } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1500))); };
const seed = +process.argv[2] || 1, n = +process.argv[3] || 600;
const r = run({ seed, n }), s = r.stat, pc = (x, of) => (of ? (100 * x / of).toFixed(1) + ' %' : '—');
const row = (k) => { const p = r.pairs[k] || {}, all = Object.values(p).reduce((a, b) => a + b, 0); return `${k}: the same ${pc(p['the same'] || 0, all)}, other rows ${pc(p['other rows'] || 0, all)}, the same rows and other probes ${pc(p['the same rows, other probes'] || 0, all)} (of ${all})`; };

console.log(`  ${s.played} histories played of ${s.drawn} (${JSON.stringify(s.skipped)}); by the action undone: ${JSON.stringify(s.byKind)}`);
console.log(`  ${s.withEdits} with later edits or a second action (${s.returns} where a signature returns, ${s.held} with a change of a block only the entry holds, ${s.two} with two undos in a row, ${s.composite} of a composite action), ${s.noEdits} with nothing between`);
for (const k of Object.keys(r.status)) console.log(`  ${k}: ${JSON.stringify(r.status[k])}` + (r.errors[k] ? '  ' + JSON.stringify(r.errors[k]) : ''));
for (const k of Object.keys(r.pairs)) console.log('  ' + row(k));
console.log(`  with nothing between, the tree before the action given back exactly: ${JSON.stringify(r.exact)}`);
console.log(`  two undos in a row, the second action's undo: (A) ${JSON.stringify(r.second.A)}, (B) ${JSON.stringify(r.second.B)}` + (r.second.errors ? '; (A) failed: ' + JSON.stringify(r.second.errors) : ''));

// ---- the experiment runs, and draws what the plan requires of it
ok('histories played: nine in ten of those drawn', s.played * 10 >= s.drawn * 9, s);
const st = r.status;
ok('(B), the candidate: never failed, never a result `validate` rejects', !st.B.failed && !st.B.invalid, [st.B, r.errors.B]);
ok('(A), `inverse`: never failed, never a result `validate` rejects', !st.A.failed && !st.A.invalid, [st.A, r.errors.A]);
ok('the yardstick (the action never happened) could be played for nine in ten', (st.C.ok || 0) * 10 >= s.withEdits * 9, st.C);
ok(`with nothing between, (B) and (B′) give the tree before the action back exactly (${r.exact.B?.same} and ${r.exact["B'"]?.same} histories)`, r.exact.B && !r.exact.B.other && r.exact["B'"] && !r.exact["B'"].other, r.exact);
ok(`the required cases are drawn: a signature that returns (${s.returns}), a block only the entry holds changed (${s.held}), two undos in a row (${s.two}), a composite action then a change of content (${s.composite})`,
  s.returns >= n / 30 && s.held >= n / 60 && s.two >= n / 30 && s.composite >= n / 30, s);
ok('every pair compared on a hundred histories at least, the probes after the restore among them', ['A ~ B', "B ~ B'", 'B ~ Bq', 'B ~ C'].every((k) => Object.values(r.pairs[k] || {}).reduce((a, b) => a + b, 0) >= 100), r.pairs);

// ---- a named case: the same history twice gives the same comparison (the experiment is a function of its seed)
{
  const again = run({ seed, n: 60 }), once = run({ seed, n: 60 });
  ok('the run is a function of its seed', JSON.stringify([again.stat, again.pairs, again.status]) === JSON.stringify([once.stat, once.pairs, once.status]));
}
// ---- a named case: a signature that returns to its old value. A stands over B; A is carried aside; B's text is typed longer and back.
// (B) finds no block that differs and gives the tree before the carry back, row for row
{
  const note = noteOf(30, [{ id: 'A', kind: 'text', col: 1, y: 0, cw: 5 }, { id: 'B', kind: 'text', col: 1, y: 3, cw: 5 }, { id: 'F', kind: 'text', col: 20, y: 0, cw: 3 }]);
  const map = { A: { text: chars(30) }, B: { text: chars(40) }, F: { text: 'x' } };
  const h = { note, map, warm: [], action: { type: 'carry', box: null, id: 'A', at: { col: 12, y: 0, frow: 0, w: 6 }, away: true }, edits: [{ id: 'B', content: { text: chars(5) } }, { id: 'B', content: { text: chars(40) } }] };
  const p = play(h);
  ok('B typed shorter and back after A is carried aside: its signature is the old one, (B) has an empty queue and answers', !p.skip && p.queue === 0 && p.status.B === 'ok' && p.returns, p.skip || [p.queue, p.status, p.returns]);
}

// ---- a case the experiment found, reported and not judged here: after two carries and typing between, `inverse` fails the undo of the
// second carry (seed 101098: RELINK refuses phase 8, a canonical place overlaps). (B) answers the same history. Whether `inverse`
// stays, and is repaired, is the owner's choice of Q7
{
  const p = play(draw(101098));
  console.log(`  found: seed 101098, the undo of the second carry by (A): ${p.second?.A}` + (p.second?.error ? ' (' + p.second.error + ')' : ''));
  ok('that history is played, and (B) answers both its undos', !p.skip && p.second?.B === true && p.status.B === 'ok', p.skip || [p.second, p.status]);
}

process.exit(fails ? 1 : 0);
