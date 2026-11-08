// Node: step 1b's transitions on the lab model (tests/lab/gap-model: model.mjs's relink(T), declare.mjs, gen.mjs, laws.mjs,
// transition-cases.mjs; docs/LAYOUT-ENGINE-PLAN.md step 1b). The named cases of a block changing its order in a column it keeps, the case
// the old model had no rule for; then the laws on random transitions as SETTLE would declare them: valid in, valid out; a transition far
// away changes nothing; deleting or narrowing any block afterwards, or ending the temporary heights, keeps the invariants. A failure prints
// its case shrunk, with the generator's version. The engine joins in the second part of step 1b.
// node tests/layoutgap-laws.mjs [random cases]
import { transitionCases } from './lab/gap-model/transition-cases.mjs';
import { runLaws } from './lab/gap-model/laws.mjs';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const N = +process.argv[2] || 150;
for (const [name, got, want, errs] of transitionCases()) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(name + (g === w ? '' : `: got ${g}, want ${w}`) + (errs.length ? ` (outside the contract: ${errs[0]})` : ''), g === w);
}
for (const passWhy of ['away', 'narrow']) {
  const { tried, counts, failure } = runLaws(N, { passWhy });
  ok(`${tried} random transitions, the carried block leaving its place as ${passWhy === 'away' ? 'carried away' : 'narrowed off'} where it passes: ` +
    `valid, local, and the invariants kept after deleting, narrowing and ending temporary heights (${JSON.stringify(counts)})` +
    (failure ? '; first failure: ' + JSON.stringify(failure).slice(0, 3000) : ''), tried >= N && !failure);
}
process.exit(fails ? 1 : 0);
