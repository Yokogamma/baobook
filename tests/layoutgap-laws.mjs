// Node: step 1b's transitions on the lab model (tests/lab/gap-model: model.mjs's relink(T), declare.mjs, gen.mjs, laws.mjs,
// transition-cases.mjs; docs/LAYOUT-ENGINE-PLAN.md step 1b). The named cases of a block changing its order in a column it keeps, the case
// the old model had no rule for; then the laws on random transitions as SETTLE would declare them: valid in, valid out; a transition far
// away changes nothing; deleting or narrowing any block afterwards, or ending the temporary heights, keeps the invariants. A failure prints
// its case shrunk, with the generator's version. The engine joins in the second part of step 1b.
// node tests/layoutgap-laws.mjs [random cases]
import { transitionCases, declarationCases, landingCases } from './lab/gap-model/transition-cases.mjs';
import { runLaws } from './lab/gap-model/laws.mjs';
import { FIXED, stateOf } from './lab/gap-model/fixed-cases.mjs';
import { createModel } from './lab/gap-model/model.mjs';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const N = +process.argv[2] || 150;
for (const [name, got, want, errs] of transitionCases()) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(name + (g === w ? '' : `: got ${g}, want ${w}`) + (errs.length ? ` (outside the contract: ${errs[0]})` : ''), g === w);
}
for (const c of FIXED) {   // the state of each, the operation, and the model's result; the engine is checked against it in step 1b's second part
  const m = createModel(c.opts).load(stateOf(c)); m[c.op[0]](...c.op.slice(1));
  ok(`fixed: ${c.name}${m.snapshot() === c.expect ? '' : ': got ' + m.snapshot()}`, m.snapshot() === c.expect);
}
for (const [name, errs, want] of declarationCases()) ok(name + (errs.length === 0 === !want ? '' : `: got ${JSON.stringify(errs)}`), want ? errs.some((e) => e.includes(want)) : !errs.length);
for (const [name, f, fails] of landingCases()) ok(name + (!!f === fails ? '' : `: got ${JSON.stringify(f)}`), !!f === fails);
{
  const { tried, counts, failure } = runLaws(N);
  ok(`${tried} random transitions: valid, local, and the invariants kept after deleting, narrowing and ending temporary heights (${JSON.stringify(counts)})` +
    (failure ? '; first failure: ' + JSON.stringify(failure).slice(0, 3000) : ''), tried >= N && !failure);
}
process.exit(fails ? 1 : 0);
