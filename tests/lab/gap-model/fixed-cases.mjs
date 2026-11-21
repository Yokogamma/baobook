// Fixed cases found by the random histories of step 1b (docs/LAYOUT-ENGINE-PLAN.md), each shrunk to the fewest blocks that still show it and
// kept with its state (blocks by their extents, stacks with one owner per row), the operation, the state the model gives and why; since step
// 1b's second part the engine gives `expect` too (tests/layoutgap-laws.mjs runs both).
export const FIXED = [];   // the one case of step 1b was a state only GAP.5.2 and GAP.9 off made; both are core since 2026-11-21 (docs/LAYOUT-SEAMS-PLAN.md §5)

/** The model state of a case, to load(): Maps from the saved entries. */
export const stateOf = (c) => ({ B: new Map(c.state.B), S: new Map(c.state.S) });
