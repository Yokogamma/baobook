// The action journal (docs/LAYOUT-SEAMS-PLAN.md §8): what the engine was asked and what it answered, kept so that a state a person
// reached can be played again in Node as a permanent case. An entry holds the tree the change was given (for a move of a gesture, the
// gesture's start), the gesture's memory, the change, the rules and settings, the versions, every answer of the Measure that was asked,
// and the result or the refusal. It holds no content of the note, and that is kept by construction, not by what callers happen to
// pass: everything recorded goes through a projection that keeps the fields the engine's shapes name (shapes.js) and nothing else, so
// a field a caller added to a box is not copied; a failure's message is kept only when the engine wrote it, and what a Measure threw
// is recorded as that fact, never as its words. A ring: the oldest entries go when it is full.
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

// ---- the projection: the engine's shapes as data, and `pick`, which keeps of a value what its shape names
const N = 'number', B = 'boolean', ID = 'id', IDMAX = 64;   // an id is a name the app made, never longer than this; a longer string is not kept
const en = (...values) => ({ values }), obj = (fields) => ({ fields }), list = (of) => ({ of }), map = (of) => ({ map: of }), either = (array, object) => ({ array, object });
const RUN = obj({ o: ID, n: N }), TARGET = obj({ col: N, y: N, frow: N, w: N, cols: N, rows: N });
const STRETCH = obj({ c0: N, c1: N, stack: obj({ u: ID, parts: list(either(list(RUN), obj({ id: ID, lend: list(RUN) }))) }) });
const BOX = obj({ id: ID, kind: ID, col: N, y: N, w: N, h: N, t: N, tx: N, yc: N, cw: N, ch: N, open: B, collapsed: B, above: list(STRETCH) });
const LAYOUT = { fields: null };
LAYOUT.fields = { cols: N, measure: en('canonical', 'displayed'), boxes: map(BOX), order: list(ID), areas: map(LAYOUT) };
const CHANGE = obj({ type: ID, box: ID, id: ID, to: ID, kind: ID, at: TARGET, away: B, canonical: B, through: en('hold', 'shift'), set: obj({ cw: N, ch: N, open: B, collapsed: B }),
  cw: N, col: N, cols: N, side: en('left', 'right'), shift: N, room: N, tx: N });
const MEMORY = obj({ away: B, sides: map(en('left', 'right')), through: obj({ id: ID, row: N, side: en('below', 'above'), at: TARGET, last: TARGET, line: N }), areaBottoms: map(N), lastTarget: TARGET, dir: en('up', 'down') });
const STEP = obj({ step: N, by: en('change', 'swap', 'aside', 'up', 'down', 'sink', 'sep', 'rest'), rows: N });
const RESULT = obj({ ok: B, why: en('refused', 'failed', 'threw'), errors: list(ID), layout: LAYOUT, start: LAYOUT, memory: MEMORY, pressed: ID, moves: map(list(STEP)), grew: N, ran: list(ID) });
/** Of a value, what its shape names: a number where a number is named, an id where an id is (ids are the engine's names of blocks,
 *  rules and phases, never content), one of the words where words are listed; a field the shape does not name is not read. null is
 *  kept; what does not fit is left out. */
function pick(v, s) {
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (s === N) return typeof v === 'number' ? v : undefined;
  if (s === B) return typeof v === 'boolean' ? v : undefined;
  if (s === ID) return typeof v === 'string' && v.length <= IDMAX ? v : undefined;
  if (s.values) return s.values.includes(v) ? v : undefined;
  if (s.of) return Array.isArray(v) ? v.map((x) => pick(x, s.of) ?? null) : undefined;
  if (s.map) return v instanceof Map ? new Map([...v].filter(([k]) => typeof k === 'string' && k.length <= IDMAX).map(([k, x]) => [k, pick(x, s.map) ?? null])) : undefined;
  if (s.array) return pick(v, Array.isArray(v) ? s.array : s.object);
  if (typeof v !== 'object' || Array.isArray(v) || v instanceof Map) return undefined;
  const o = {};
  for (const k of Object.keys(v)) if (Object.hasOwn(s.fields, k)) { const x = pick(v[k], s.fields[k]); if (x !== undefined) o[k] = x; }   // in the value's own order
  return o;
}
/** The rules and the settings: a record of the engine's own names to true, false, a number or a short word (a variant, `ORDER`). */
function record(v) {
  const o = {};
  if (v && typeof v === 'object') for (const k of Object.keys(v)) { const x = v[k]; if (typeof x === 'boolean' || typeof x === 'number' || (typeof x === 'string' && /^[A-Za-z0-9.\-]{1,24}$/.test(x))) o[k] = x; }
  return o;
}
/** A failure's messages in a form safe to export: the engine's own are kept (they name blocks, rows and columns); anything else, a
 *  runtime error's or one thrown through the engine by something it called, is kept as its length alone. */
const OURS = /^(settle|settleTree|gap|rules|transition|transitionFacts|primitives|changes|validate|layout|size|journal): /;
const safeErrors = (errors) => (Array.isArray(errors) ? errors.map((m) => (typeof m === 'string' && OURS.test(m) ? m : `another error (${String(m).length} characters)`)) : undefined);
/** A result as the journal keeps it and as a replay compares it. `threw`: the Measure threw during the call, whose words are not kept. */
function resultOf(result, threw) {
  const r = pick(result, RESULT) || {};
  if (r.errors) r.errors = threw ? ['journal: the Measure threw'] : safeErrors(r.errors);
  return encode(r);
}

/** A Measure that keeps every answer it gives, in tables that have no prototype, so that a block named `toString` or `__proto__` is a
 *  key as any other. @param {Measure} measure @returns {{measure: Measure, answers: Answers, threw: () => boolean}} */
export function recording(measure) {
  /** @type {Answers} */
  const answers = { rows: Object.create(null), natural: Object.create(null) };
  let threw = false;
  const safely = (f) => { try { return f(); } catch (e) { threw = true; throw e; } };
  return { answers, threw: () => threw, measure: Object.freeze({
    rows(id, cells) { const r = safely(() => measure.rows(id, cells)); (answers.rows[id] ??= Object.create(null))[cells] = { rows: r.rows, shown: r.shown, ...(r.lines != null ? { lines: r.lines } : {}) }; return r; },
    natural(id) { const n = safely(() => measure.natural(id)); answers.natural[id] = n; return n; },
  }) };
}

/** A measurement a replay asked for and the journal has not. */
export class Missing extends Error { constructor(what, id, cells) { super(`the journal has no ${what} of ${id}` + (cells != null ? ` at ${cells} cells` : '')); this.what = what; this.id = id; this.cells = cells; } }
/** A Measure that answers from recorded answers alone. @param {Answers} answers @returns {Measure} */
export function replaying(answers) {
  // own keys only: a table read from JSON has Object's prototype, and `toString` must not be found in it
  const own = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined);
  return Object.freeze({
    rows(id, cells) { const r = own(own(answers.rows, id), String(cells)); if (!r || typeof r !== 'object') throw new Missing('rows', id, cells); return { rows: r.rows, shown: r.shown, ...(r.lines != null ? { lines: r.lines } : {}) }; },
    natural(id) { const n = own(answers.natural, id); if (typeof n !== 'number') throw new Missing('natural width', id); return n; },
  });
}

/** A journal of `limit` entries. `versions`: what the caller knows the engine and the passports by (the page's build, say); they go into
 *  every entry as given. @param {{limit?:number, versions?:object}} [o] */
export function createJournal({ limit = 200, versions = {} } = {}) {
  /** @type {Entry[]} */
  let ring = [], n = 0;
  const mine = JSON.stringify(versions ?? {});   // the versions as given now: what the caller does to its object later changes no entry
  return {
    /** settleTree, recorded: the same arguments and the same answer. `settle`, the function run (settleTree unless a test gives another). */
    run(root, change, memory, ctx, hooks = {}, settle = settleTree) {
      const rec = recording(ctx.measure);
      // what the engine is given is written down before it runs: a function that changed its input would otherwise leave the journal
      // the changed tree, and the state the change started from would be lost
      const entry = { n: ++n, versions: JSON.parse(mine), tree: encode(pick(root, LAYOUT)), memory: encode(pick(memory ?? null, MEMORY)), change: encode(pick(change, CHANGE)), rules: encode(record(ctx.rules)), settings: encode(record(ctx.settings)), answers: rec.answers, result: null };
      let result, thrown = null;
      try { result = settle(root, change, memory, { ...ctx, measure: rec.measure }, hooks); }
      catch (e) { thrown = e; result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
      entry.result = resultOf(result, rec.threw());
      ring.push(entry);
      if (ring.length > limit) ring = ring.slice(ring.length - limit);
      if (thrown) throw thrown;
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
  let miss = null, threw = false;
  // SETTLE turns what a measure throws into a failure, so the missing answer is caught where it is asked
  const measure = Object.freeze({
    rows(id, cells) { try { return ctx.measure.rows(id, cells); } catch (e) { threw = true; if (e instanceof Missing) miss = miss || { what: e.what, id: e.id, cells: e.cells }; throw e; } },
    natural(id) { try { return ctx.measure.natural(id); } catch (e) { threw = true; if (e instanceof Missing) miss = miss || { what: e.what, id: e.id }; throw e; } },
  });
  let result;
  try { result = settle(decode(entry.tree), decode(entry.change), decode(entry.memory), { ...ctx, measure }); }
  catch (e) { result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
  if (miss) return { missing: miss };
  const got = JSON.stringify(resultOf(result, threw)), was = JSON.stringify(entry.result);
  return got === was ? { same: true, result } : { same: false, result, recorded: decode(entry.result) };
}
