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
import { DEFAULT, SETTINGS } from './rules.js';

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
const N = 'number', B = 'boolean', ID = 'id', IDMAX = 64;   // an id is a name the app made, never longer than this (the journal's precondition)
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
const RESULT = obj({ ok: B, why: en('refused', 'failed', 'threw'), layout: LAYOUT, start: LAYOUT, memory: MEMORY, pressed: ID, moves: map(list(STEP)), grew: N, ran: list(ID) });
/** Of a value, what its shape names: a number where a number is named, an id where an id is (ids are the engine's names of blocks,
 *  rules and phases, never content), one of the words where words are listed; a field the shape does not name is not read, and that
 *  is no loss, the engine not reading it either. A value the shape names and that does not fit it (an id longer than IDMAX, a word
 *  that is not listed) is left out and its place written to `lost`, as the names of the shape's fields alone: an entry with a loss is
 *  not the state the engine was given, and is not replayed. */
function pick(v, s, lost, at) {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const no = () => { lost.add(at); return undefined; };
  if (s === N) return typeof v === 'number' ? v : no();
  if (s === B) return typeof v === 'boolean' ? v : no();
  if (s === ID) return typeof v === 'string' && v.length <= IDMAX ? v : no();
  if (s.values) return s.values.includes(v) ? v : no();
  if (s.of) return Array.isArray(v) ? v.map((x) => pick(x, s.of, lost, at + '[]') ?? null) : no();
  if (s.map) {
    if (!(v instanceof Map)) return no();
    const m = new Map();
    for (const [k, x] of v) { if (typeof k === 'string' && k.length <= IDMAX) m.set(k, pick(x, s.map, lost, at + '{}') ?? null); else lost.add(at + '{}'); }
    return m;
  }
  if (s.array) return pick(v, Array.isArray(v) ? s.array : s.object, lost, at);
  if (typeof v !== 'object' || Array.isArray(v) || v instanceof Map) return no();
  const o = {};
  for (const k of Object.keys(v)) if (Object.hasOwn(s.fields, k)) { const x = pick(v[k], s.fields[k], lost, at + '.' + k); if (x !== undefined) o[k] = x; }   // in the value's own order
  return o;
}
/** The rules and the settings: the names the engine has (rules.js) and no other; a rule is true or false, a setting a number, `ORDER`
 *  one of its words. A name the engine has not is not read by it and is not kept; a value of another kind is a loss. */
function known(v, shape, lost, at) {
  const o = {};
  if (v && typeof v === 'object') for (const k of Object.keys(v)) if (Object.hasOwn(shape, k)) {
    const x = v[k], d = shape[k];
    if (typeof d === 'string' ? ORDERS.includes(x) : typeof x === typeof d) o[k] = x; else lost.add(at);
  }
  return o;
}
const ORDERS = ['push', 'never'];
/** The versions: the page's build, and the versions of the engine, of the Measure and of the passports, each a number or a string of
 *  digits, dots and hyphens. Nothing else a caller puts there is kept. */
const VERSIONS = ['build', 'engine', 'measure', 'kinds'];
function versionsOf(v) {
  const o = {};
  if (v && typeof v === 'object') for (const k of VERSIONS) if (Object.hasOwn(v, k) && ((typeof v[k] === 'number' && Number.isFinite(v[k])) || (typeof v[k] === 'string' && /^[0-9.-]{1,32}$/.test(v[k])))) o[k] = v[k];
  return o;
}
/** A failure's messages in a form safe to export. The engine's own are kept (they name blocks, rows and columns) when nothing the
 *  caller gave could have written them: every function of the caller's the engine calls (the Measure, the hooks, the passports) is
 *  watched, and when one threw, the entry says which and keeps no word; when the entry has a loss, its ids are not the journal's to
 *  keep, and a message is kept as its length. Anything else, a runtime error's say, is kept as its length too. Read from the result
 *  itself, apart from the shape of ids, so a long message is not cut before it is judged. */
const OURS = /^(settle|settleTree|gap|rules|transition|transitionFacts|primitives|changes|validate|layout|size|journal): /;
function safeErrors(errors, threw, fit) {
  if (threw) return [`journal: ${threw} threw`];
  return errors.map((m) => (fit && typeof m === 'string' && OURS.test(m) ? m : `another error (${String(m).length} characters)`));
}
/** A result as the journal keeps it and as a replay compares it. `threw`: which function of the caller's threw during the call. */
function resultOf(result, threw, lost) {
  const r = pick(result, RESULT, lost, 'result') || {};
  if (result && Array.isArray(result.errors)) r.errors = safeErrors(result.errors, threw, lost.size === 0);
  return encode(r);
}
/** The one boundary between the engine and what the caller gave it to call (hooks, passports): a proxy that does nothing until the
 *  engine reads a property, and then reads it from `o` itself, with `o` as the receiver, so a getter, a private field and a method
 *  of a class see the object they were written for. A function read is called with `o` as its receiver; a plain object read (a
 *  passport, its `container`) is watched the same way; an array, a Map or any other value is the original. Whatever throws on the
 *  way, a getter or a call, tells `mark` and is thrown on. Nothing is read that the engine does not read. */
function watched(o, mark, seen = new WeakMap()) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || o instanceof Map || o instanceof Set) return o;
  if (seen.has(o)) return seen.get(o);
  const calls = new Map();   // one wrapper for a function, so that reading it twice gives the same value
  const guard = (f) => { try { return f(); } catch (e) { mark(); throw e; } };
  const w = new Proxy({}, {
    get(_, k) {
      const v = guard(() => Reflect.get(o, k, o));
      if (typeof v === 'function') {
        if (!calls.has(v)) calls.set(v, function (...a) { return guard(() => v.apply(this === w ? o : this, a)); });
        return calls.get(v);
      }
      return watched(v, mark, seen);
    },
    set: (_, k, v) => guard(() => Reflect.set(o, k, v, o)),
    has: (_, k) => guard(() => Reflect.has(o, k)),
    deleteProperty: (_, k) => Reflect.deleteProperty(o, k),
    ownKeys: () => Reflect.ownKeys(o),
    // told as configurable, the proxy's own target having no such property; the value is read through `get` when it is wanted
    getOwnPropertyDescriptor(_, k) { const d = Reflect.getOwnPropertyDescriptor(o, k); return d && { enumerable: d.enumerable, configurable: true, writable: true, value: undefined }; },
    getPrototypeOf: () => Reflect.getPrototypeOf(o),
  });
  seen.set(o, w);
  return w;
}

/** A Measure that keeps every answer it gives, as the numbers the engine reads and nothing else, in tables that have no prototype, so
 *  that a block named `toString` or `__proto__` is a key as any other. `threw()`: it threw; `bent()`: an answer was not numbers, and
 *  is not kept. @param {Measure} measure @returns {{measure: Measure, answers: Answers, threw: () => boolean, bent: () => boolean}} */
export function recording(measure) {
  /** @type {Answers} */
  const answers = { rows: Object.create(null), natural: Object.create(null) };
  let threw = false, bent = false;
  const safely = (f) => { try { return f(); } catch (e) { threw = true; throw e; } };
  const num = (x) => typeof x === 'number';
  return { answers, threw: () => threw, bent: () => bent, measure: Object.freeze({
    rows(id, cells) {
      const r = safely(() => measure.rows(id, cells));
      if (r && num(r.rows) && num(r.shown) && (r.lines == null || num(r.lines)) && num(cells)) (answers.rows[id] ??= Object.create(null))[cells] = { rows: r.rows, shown: r.shown, ...(r.lines != null ? { lines: r.lines } : {}) };
      else bent = true;
      return r;
    },
    natural(id) { const n = safely(() => measure.natural(id)); if (num(n)) answers.natural[id] = n; else bent = true; return n; },
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

/** A journal of `limit` entries. `versions`: what the caller knows the engine and the passports by (`build`, `engine`, `measure`,
 *  `kinds`: numbers or strings of digits, dots and hyphens); they go into every entry. @param {{limit?:number, versions?:object}} [o] */
export function createJournal({ limit = 200, versions = {} } = {}) {
  /** @type {Entry[]} */
  let ring = [], n = 0;
  const mine = JSON.stringify(versionsOf(versions));   // the versions as given now: what the caller does to its object later changes no entry
  return {
    /** settleTree, recorded: the same arguments and the same answer. `settle`, the function run (settleTree unless a test gives another). */
    run(root, change, memory, ctx, hooks = {}, settle = settleTree) {
      const rec = recording(ctx.measure), lost = new Set();
      let threw = null;
      const by = (who) => () => { threw = threw || who; };
      // what the engine is given is written down before it runs: a function that changed its input would otherwise leave the journal
      // the changed tree, and the state the change started from would be lost
      const entry = { n: ++n, versions: JSON.parse(mine), tree: encode(pick(root, LAYOUT, lost, 'tree')), memory: encode(pick(memory ?? null, MEMORY, lost, 'memory')), change: encode(pick(change, CHANGE, lost, 'change')),
        rules: encode(known(ctx.rules, DEFAULT, lost, 'rules')), settings: encode(known(ctx.settings, SETTINGS, lost, 'settings')), answers: rec.answers, result: null };
      let result, thrown = null;
      try { result = settle(root, change, memory, { ...ctx, kinds: watched(ctx.kinds, by('a passport')), measure: rec.measure }, watched(hooks, by('a hook'))); }
      catch (e) { thrown = e; result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
      if (rec.bent()) lost.add('answers');
      // a Measure, a hook or a passport that threw decided the answer, and the journal has not the throw: nothing to play again (the
      // answers a Measure gave before it threw are kept, and would let a replay pass where the command failed)
      if (rec.threw()) lost.add('measure'); else if (threw) lost.add(threw === 'a hook' ? 'hooks' : 'kinds');
      entry.result = resultOf(result, rec.threw() ? 'the Measure' : threw, lost);
      // a loss: the entry is not what the engine was given (an id longer than the journal keeps, a value of another kind), so it is
      // kept as a trace and never replayed
      if (lost.size) entry.unfit = [...lost].sort();
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
 *  @returns {{same:true, result:object} | {same:false, result:object, recorded:object} | {missing: {what:string, id:string, cells?:number}} | {unfit: string[], result?: object}}
 *  `same`: the answer is the recorded one, by value. `missing`: the replay asked for a measurement the journal has not, which is no
 *  verdict on either answer (another version of the engine asks other questions). `unfit`: the entry says it lost something of
 *  what the engine was given (the places, as names of the shapes' fields), so there is nothing to play: no verdict either; or the answer of this
 *  replay has a value its shape has no place for (`result.…`), which is a defect of the function run, told as that and not compared. */
export function replay(entry, kinds, settle = settleTree) {
  if (Array.isArray(entry.unfit) && entry.unfit.length) return { unfit: entry.unfit.filter((x) => typeof x === 'string') };
  const ctx = { rules: decode(entry.rules), settings: decode(entry.settings), kinds, measure: replaying(entry.answers) };
  let miss = null, threw = false, passport = false;
  // SETTLE turns what a measure throws into a failure, so the missing answer is caught where it is asked
  const measure = Object.freeze({
    rows(id, cells) { try { return ctx.measure.rows(id, cells); } catch (e) { threw = true; if (e instanceof Missing) miss = miss || { what: e.what, id: e.id, cells: e.cells }; throw e; } },
    natural(id) { try { return ctx.measure.natural(id); } catch (e) { threw = true; if (e instanceof Missing) miss = miss || { what: e.what, id: e.id }; throw e; } },
  });
  let result;
  try { result = settle(decode(entry.tree), decode(entry.change), decode(entry.memory), { ...ctx, kinds: watched(kinds, () => { passport = true; }), measure }); }
  catch (e) { result = { ok: false, why: 'threw', errors: [String(e && e.message)] }; }
  if (miss) return { missing: miss };
  const lost = new Set(), got = JSON.stringify(resultOf(result, threw ? 'the Measure' : passport ? 'a passport' : null, lost)), was = JSON.stringify(entry.result);
  // an answer with a value its shape has no place for is not compared as if the value were not there
  if (lost.size) return { unfit: [...lost].sort(), result };
  return got === was ? { same: true, result } : { same: false, result, recorded: decode(entry.result) };
}
