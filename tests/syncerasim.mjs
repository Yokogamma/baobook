// The randomized simulation of the sync core (syncsim.mjs: the same seeds, operations and oracle) with every engine in the mode of
// docs/OWNER-ERA-PLAN.md, stage 2 (`deps.era` and the rules of public/owner/model.js; tests/lib/core.mjs, SYNC_ERA): the transactions of the user that
// read the era and the owner themselves and wait for no load, the cache updates bound to the epoch of the memory, the steps' checks. The simulation
// changes no owner; what a change of owner does in this mode is syncera.mjs.
process.env.SYNC_ERA='1';
await import('./syncsim.mjs');
