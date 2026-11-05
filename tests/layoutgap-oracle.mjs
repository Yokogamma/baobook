// Node: the lab model's own cases and random sequences (tests/lab/gap-model/test.mjs), run on the engine's GAP through the model's API
// (tests/lib/gapdriver.mjs): every named case of the twelve review rounds, the oracle of the same history without the inserted blocks,
// the retrace, the deletions, the two measures and GAP.5.1 off (docs/LAYOUT-ENGINE-PLAN.md step 1). The model runs its full counts by
// itself; here the random suites run at 150 sequences each, scaled.
import { createEngineModel } from './lib/gapdriver.mjs';
globalThis.GAP_MODEL_FACTORY = createEngineModel;
process.argv[2] = process.argv[2] || '150';
await import('./lab/gap-model/test.mjs');
