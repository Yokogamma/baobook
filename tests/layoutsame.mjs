// The engine against its pinned copy (docs/LAYOUT-SEAMS-PLAN.md §4.4): the same notes and commands, under the default rules, give the
// same answers, by value. It is the reference of the refactors of the seams stage (the switches made core, the frame inside the solve),
// which are meant to keep the behaviour; a difference is allowed only when explained by a case written independently, listed in
// EXPECTED below with its reason. The copy, tests/lab/engine-0d94f29/, is `main` at 0d94f29 and goes when the stage ends.
//
//   node tests/layoutsame.mjs [seed] [notes]

import { load, run, NEW, OLD } from './lib/layout/pair.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got, null, 1).slice(0, 4000))); };

const A = await load(NEW), B = await load(OLD);

// the comparison itself: a side given other rules is told apart, so a pass below is not a harness that sees nothing
{
  const r = run(A, B, { seed: 3, notes: 150, rulesOf: (E) => (E === A ? E.resolve({ 'P-ASIDE': false }) : E.DEFAULT), max: 1 });
  ok('the comparison tells two behaviours apart (one side with P-ASIDE off)', r.diffs.length > 0);
}

/** Differences that are meant, each with its reason and the case that shows the new answer right: none yet. */
const EXPECTED = [];

const seed = +process.argv[2] || 11, notes = +process.argv[3] || 700;
const r = run(A, B, { seed, notes });
const unexplained = r.diffs.filter((d) => !EXPECTED.some((e) => e.match(d)));
ok(`${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${r.stat.moved} of them changing the tree, ${r.stat.refused} refused, ${r.stat.failed} failed): the same answers as 0d94f29`, unexplained.length === 0, unexplained[0]);
console.log('  ' + Object.entries(r.by).map(([k, v]) => `${k} ${v.accepted}/${v.moved}/${v.refused}/${v.failed}`).join(', ') + '  (accepted/changing/refused/failed)');
// a kind the run never accepted compares nothing
const need = ['carry', 'carry away', 'carry+hold', 'undo carry', 'size', 'size set', 'width', 'create', 'remove', 'remove area', 'enter', 'leave', 'areaSide', 'drawArea', 'ungroup', 'area size', 'show'];
const thin = need.filter((k) => !(r.by[k] && (k === 'show' ? r.by[k].accepted : r.by[k].moved) >= 5));
ok('every kind of command accepted with a change at least five times', thin.length === 0, thin);

process.exit(fails ? 1 : 0);
