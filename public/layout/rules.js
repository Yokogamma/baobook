// The switchable rules (R1, docs/LAYOUT-RULES.md §1.6): one declaration per switch with what it needs and what runs in its place, every
// rule on by default, and `resolve`, which closes a partial choice over the needs. Every reader of a switch asks `on` or `variant`, so 0.2's
// variants (O-20) change this file alone. The settings of §1.5 at their 0.1 defaults live here too: they are the parameters of their rules.
// The rules the owner made core on 2026-11-21 (docs/LAYOUT-SEAMS-PLAN.md §5) have no switch and no branch: GAP.5.1, GAP.5.2, GAP.5.3, GAP.8,
// GAP.9, P-UP, DRAG.A3.narrow (in effect wherever SIZE.1 is), DRAG.B2.keep, DRAG.B3, DRAG.B5; and those whose fallbacks are never written,
// their code being steps 3–5's: DRAG.B1, RESIZE.2, RESIZE.3, AREA.3, AREA.6, AREA.7.

/** @typedef {import('./shapes.js').RuleId} RuleId @typedef {import('./shapes.js').RuleDecl} RuleDecl
 *  @typedef {import('./shapes.js').Rules} Rules @typedef {import('./shapes.js').Settings} Settings */

/** @type {readonly RuleDecl[]} one per 0.1 row of the table of §1.6 */
export const DECLS = Object.freeze([
  ['SIZE.1', [], 'every elastic block keeps min(natural width, TEXTW), clamped to its container, and never narrows by itself'],
  ['SIZE.2', ['SIZE.1'], '«never narrow»: a pressed elastic block moves aside or goes down', ['P-ASIDE']],
  ['SIZE.8', ['SIZE.1'], 'one pass (RESTPASSES 1)'],
  ['P-ASIDE', [], 'a block met from the side goes at once to its change kind\'s «no room aside»', ['P-SINK']],
  ['P-REST', ['P-ASIDE', 'SIZE.2'], 'an elastic block at its minimum that hits a neighbour goes down under it (P-SEP)'],
  ['P-SINK', [], 'a handle stops where a block has no room aside'],
  ['THROUGH', [], 'no neighbour lets the block through'],
  ['DRAG.A2', [], 'STICK 0: the target is the rounded pointer'],
  ['DRAG.A4', [], 'home is an ordinary cell'],
  ['DRAG.A5', ['SIZE.1'], 'the carried block takes its rest width at every target', ['SIZE.1']],
  ['DRAG.C4', [], 'no position mode'],
  ['RESIZE.1', [], 'no width handle'],
  ['AREA.7b', [], 'an area only from its button'],
  ['EDIT.3', [], 'a click below the text puts the caret at its end'],
  ['EDIT.4', [], 'a block only from «+»'],
  ['VIEW.1.fit', [], 'the note at 100 % with the sideways scroll'],
  ['VIEW.1b', [], 'the scrollbars only'],
  ['VIEW.2', [], 'below MINSCALE, the scaled layout with the sideways scroll'],
  ['VIEW.6', [], 'nothing extra shows while a block is carried'],
].map(([id, needs, fallback, relies = []]) => Object.freeze({ id, needs: Object.freeze(needs), fallback, relies: Object.freeze(relies) })));

const IDS = DECLS.map((d) => d.id), BY = new Map(DECLS.map((d) => [d.id, d]));

/** Every 0.1 rule on. @type {Rules} */
export const DEFAULT = resolve({});

/** The settings of LAYOUT-RULES §1.5 at their 0.1 defaults (cells, seconds, pixels, a share). @type {Readonly<Settings>} */
export const SETTINGS = Object.freeze({ TEXTW: 26, MINC: 6, ORDER: 'push', STICK: 0.75, NEAR: 0.5, HOLD: 0.7, STILL: 8, MINSCALE: 0.7, RESTPASSES: 2 });

/** A partial choice {[RuleId]: boolean}, ids left out on, closed over the needs: every rule whose needs are not all on is off, transitively.
 *  An id no declaration has is an error, so a typo never passes as «on». @returns {Rules} */
export function resolve(partial = {}) {
  for (const id of Object.keys(partial)) if (!BY.has(id)) throw new Error('rules: no switch ' + id);
  const v = Object.fromEntries(IDS.map((id) => [id, partial[id] !== false]));
  for (let changed = true; changed;) {
    changed = false;
    for (const d of DECLS) if (v[d.id] && d.needs.some((n) => !v[n])) { v[d.id] = false; changed = true; }
  }
  return Object.freeze(v);
}

/** Whether a rule is on. @param {Rules} rules @param {RuleId} id */
export function on(rules, id) {
  if (!BY.has(id)) throw new Error('rules: no switch ' + id);
  return rules[id] === true;
}

/** A rule's variant; in 0.1 its value, as on() gives it. @param {Rules} rules @param {RuleId} id */
export function variant(rules, id) { return on(rules, id); }

/** The rules a rule's choice turns off with it: every rule that needs it, transitively. @param {RuleId} id @returns {RuleId[]} */
export function dependents(id) {
  const off = resolve({ [id]: false });
  return IDS.filter((x) => x !== id && !off[x]);
}
