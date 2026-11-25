// The action journal (docs/LAYOUT-SEAMS-PLAN.md §8): what the engine was asked and what it answered, kept so that a state a person
// reached can be played again in Node as a permanent case. An entry holds the tree the change was given (for a move of a gesture, the
// gesture's start), the gesture's memory, the change, the rules and settings, the versions, every answer of the Measure that was asked,
// and the result or the refusal. It holds no content of the note: a tree is ids, kinds and numbers, and the Measure's answers are
// numbers. A ring: the oldest entries go when it is full.
//
// Replayed, an entry gets the answers it recorded and no other: a replay that asks for a measurement the journal has not says so; it
// neither invents an answer nor calls the difference a defect.

import { settleTree } from './tree.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Change} Change @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Measure} Measure @typedef {import('./shapes.js').Memory} Memory
 *  @typedef {{rows: Record<string, Record<string, {rows:number, shown:number, lines?:number}>>, natural: Record<string, number>}} Answers
 *  @typedef {{n:number, versions:object, tree:unknown, memory:unknown, change:unknown, rules:unknown, settings:unknown, answers:Answers, result:unknown}} Entry */

/** A value as plain JSON and back: a Map as its pairs in their order, a number JSON has no word for by its name. */
export function encode(v) {
  if (v instanceof Map) return { '#map': [...v].map(([k, x]) => [k, encode(x)]) };
  if (Array.isArray(v)) return v.map(encode);
  if (typeof v === 'number' && !Number.isFinite(v)) return { '#num': String(v) };
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = encode(v[k]); return o; }
  return v;
}
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (Array.isArray(v['#map'])) return new Map(v['#map'].map(([k, x]) => [k, decode(x)]));
    if (typeof v['#num'] === 'string') return Number(v['#num']);
    const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k]); return o;
  }
  return v;
}

/** A Measure that keeps every answer it gives. @param {Measure} measure @returns {{measure: Measure, answers: Answers}} */
export function recording(measure) {
  /** @type {Answers} */
  const answers = { rows: {}, natural: {} };
  return { answers, measure: Object.freeze({
    rows(id, cells) { const r = measure.rows(id, cells); (answers.rows[id] ??= {})[cells] = { rows: r.rows, shown: r.shown, ...(r.lines != null ? { lines: r.lines } : {}) }; return r; },
    natural(id) { const n = measure.natural(id); answers.natural[id] = n; return n; },
  }) };
}

/** A measurement a replay asked for and the journal has not. */
export class Missing extends Error { constructor(what, id, cells) { super(`the journal has no ${what} of ${id}` + (cells != null ? ` at ${cells} cells` : '')); this.what = what; this.id = id; this.cells = cells; } }
/** A Measure that answers from recorded answers alone. @param {Answers} answers @returns {Measure} */
export function replaying(answers) {
  return Object.freeze({
    rows(id, cells) { const r = answers.rows[id]?.[cells]; if (!r) throw new Missing('rows', id, cells); return { ...r }; },
    natural(id) { const n = answers.natural[id]; if (n == null) throw new Missing('natural width', id); return n; },
  });
}

/** A journal of `limit` entries. `versions`: what the caller knows the engine and the passports by (the page's build, say); they go into
 *  every entry as given. @param {{limit?:number, versions?:object}} [o] */
export function createJournal({ limit = 200, versions = {} } = {}) {
  /** @type {Entry[]} */
  let ring = [], n = 0;
  return {
    /** settleTree, recorded: the same arguments and the same answer. `settle`, the function run (settleTree unless a test gives another). */
    run(root, change, memory, ctx, hooks = {}, settle = settleTree) {
      const rec = recording(ctx.measure);
      let result;
      try { result = settle(root, change, memory, { ...ctx, measure: rec.measure }, hooks); }
      catch (e) { result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
      ring.push({ n: ++n, versions, tree: encode(root), memory: encode(memory ?? null), change: encode(change), rules: encode(ctx.rules), settings: encode(ctx.settings), answers: rec.answers, result: encode(result) });
      if (ring.length > limit) ring = ring.slice(ring.length - limit);
      if (result.why === 'threw') throw new Error(result.errors[0]);
      return result;
    },
    entries: () => ring.slice(),
    clear() { ring = []; },
    /** The journal as text, to be saved and sent: no content of the note is in it. */
    export: () => JSON.stringify({ journal: 'baobook-layout', entries: ring }),
  };
}

/** The entries of an exported journal. @param {string} text @returns {Entry[]} */
export function entriesOf(text) {
  const j = JSON.parse(text);
  if (!j || j.journal !== 'baobook-layout' || !Array.isArray(j.entries)) throw new Error('journal: not a layout journal');
  return j.entries;
}

/** One entry played again with the answers it recorded. `kinds`, the passports to play it with (today's); `settle`, the function run.
 *  @returns {{same:true, result:object} | {same:false, result:object, recorded:object} | {missing: {what:string, id:string, cells?:number}}}
 *  `same`: the answer is the recorded one, by value. `missing`: the replay asked for a measurement the journal has not, which is no
 *  verdict on either answer (another version of the engine asks other questions). */
export function replay(entry, kinds, settle = settleTree) {
  const ctx = { rules: decode(entry.rules), settings: decode(entry.settings), kinds, measure: replaying(entry.answers) };
  let miss = null;
  // SETTLE turns what a measure throws into a failure, so the missing answer is caught where it is asked
  const measure = Object.freeze({
    rows(id, cells) { try { return ctx.measure.rows(id, cells); } catch (e) { if (e instanceof Missing) miss = miss || { what: e.what, id: e.id, cells: e.cells }; throw e; } },
    natural(id) { try { return ctx.measure.natural(id); } catch (e) { if (e instanceof Missing) miss = miss || { what: e.what, id: e.id }; throw e; } },
  });
  let result;
  try { result = settle(decode(entry.tree), decode(entry.change), decode(entry.memory), { ...ctx, measure }); }
  catch (e) { result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
  if (miss) return { missing: miss };
  const got = JSON.stringify(encode(result)), was = JSON.stringify(entry.result);
  return got === was ? { same: true, result } : { same: false, result, recorded: decode(entry.result) };
}
