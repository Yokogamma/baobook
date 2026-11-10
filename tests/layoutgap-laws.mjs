// Node: step 1b's transitions (docs/LAYOUT-ENGINE-PLAN.md step 1b): the lab model's relink(T) (tests/lab/gap-model: model.mjs, declare.mjs,
// gen.mjs, laws.mjs, transition-cases.mjs) and the engine's RELINK on a declared transition (public/layout/gap.js `relink`, checked by
// transition.js), through the model's API (tests/lib/gapdriver.mjs). On the model: the named cases, the fixed cases, the declarations the
// checker must refuse and the landing law's own cases, then the laws on random transitions as SETTLE would declare them, after a history.
// On the engine: the same named cases (those outside the contract refused by its check), the fixed cases, the same declarations judged by
// transition.js as by declare.mjs, and the laws on random transitions, each compared with the model (the same history and transition give
// the same rows, owners and lends, or both refuse it). A failure prints its case shrunk, with the generator's version.
// node tests/layoutgap-laws.mjs [random cases]
import { transitionCases, declarationCases, landingCases } from './lab/gap-model/transition-cases.mjs';
import { runLaws } from './lab/gap-model/laws.mjs';
import { FIXED, stateOf } from './lab/gap-model/fixed-cases.mjs';
import { createModel } from './lab/gap-model/model.mjs';
import { createEngineModel, engineCheck } from './lib/gapdriver.mjs';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const N = +process.argv[2] || 150;
const named = (make, side) => {
  for (const [name, got, want, errs] of transitionCases(make)) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    // outside the contract, the model runs the case as its executor; the engine's check refuses it
    if (side === 'engine' && errs.length) { ok(`engine: ${name}: refused, outside the contract (${errs[0]})` + (/^"refused/.test(g) ? '' : `: got ${g}`), /^"refused/.test(g)); continue; }
    ok(`${side}: ${name}` + (g === w ? '' : `: got ${g}, want ${w}`) + (errs.length ? ` (outside the contract: ${errs[0]})` : ''), g === w);
  }
};
named(createModel, 'model');
named(createEngineModel, 'engine');
for (const c of FIXED) {   // the state of each, the operation, and the model's result, on both
  const m = createModel(c.opts).load(stateOf(c)); m[c.op[0]](...c.op.slice(1));
  ok(`model, fixed: ${c.name}${m.snapshot() === c.expect ? '' : ': got ' + m.snapshot()}`, m.snapshot() === c.expect);
  const e = createEngineModel(c.opts).loadModel(stateOf(c)); e[c.op[0]](...c.op.slice(1));
  ok(`engine, fixed: ${c.name}${e.snapshot() === c.expect ? '' : ': got ' + e.snapshot()}`, e.snapshot() === c.expect);
}
for (const [name, errs, want, T, base] of declarationCases()) {
  ok(name + (errs.length === 0 === !want ? '' : `: got ${JSON.stringify(errs)}`), want ? errs.some((e) => e.includes(want)) : !errs.length);
  if (T) { const ee = engineCheck(base, T); ok(`engine's check: ${name}` + (JSON.stringify(ee) === JSON.stringify(errs) ? '' : `: ${JSON.stringify(ee)} for declare.mjs's ${JSON.stringify(errs)}`), JSON.stringify(ee) === JSON.stringify(errs)); }
}
for (const [name, f, must] of landingCases()) ok(name + (!!f === must ? '' : `: got ${JSON.stringify(f)}`), !!f === must);
for (const [name, f, must] of landingCases(createEngineModel)) ok('engine: ' + name + (!!f === must ? '' : `: got ${JSON.stringify(f)}`), !!f === must);
{
  const { tried, counts, failure } = runLaws(N);
  ok(`model: ${tried} random transitions after a history: valid, local, landing, untouched, split, and the invariants kept after deleting, narrowing and ending temporary heights (${JSON.stringify(counts)})` +
    (failure ? '; first failure: ' + JSON.stringify(failure).slice(0, 3000) : ''), tried >= N && !failure);
}
{
  const { tried, counts, failure } = runLaws(N, { make: createEngineModel, twin: createModel, seed0: 1000001 });
  ok(`engine: ${tried} random transitions after a history: the same laws, and the same layout as the model's (${JSON.stringify(counts)})` +
    (failure ? '; first failure: ' + JSON.stringify(failure).slice(0, 3000) : ''), tried >= N && !failure);
}
// the carries under a switched-off rule's fallback, alone: the mix above draws them seldom (one in fifty or so), and a weight does not
// promise how many survive the filters, so a targeted run gives each fallback a floor (the independent review of a27021f)
for (const [side, o] of [['model', { seed0: 2000001 }], ['engine', { make: createEngineModel, twin: createModel, seed0: 3000001 }]]) {
  const FB = 40, FLOOR = 10, { tried, counts, failure } = runLaws(FB, { kinds: ['fallback'], ...o });
  const pu = counts['fallback P-UP'] || 0, dk = counts['fallback DRAG.B2.keep'] || 0;
  ok(`${side}: ${tried} carries under a fallback only, after a history: every law${side === 'engine' ? ', and the model\'s layout' : ''}, at least ${FLOOR} of each (P-UP ${pu}, DRAG.B2.keep ${dk})` +
    (failure ? '; first failure: ' + JSON.stringify(failure).slice(0, 3000) : ''), tried >= FB && pu >= FLOOR && dk >= FLOOR && !failure);
}
process.exit(fails ? 1 : 0);
