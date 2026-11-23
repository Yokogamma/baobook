// Two engines on the same commands (docs/LAYOUT-SEAMS-PLAN.md §4.4): the reference of a refactor that is meant to keep the behaviour.
// Each engine is a folder of the layout modules, loaded on its own, so the pinned copy (tests/lab/engine-<sha>/) imports nothing from the
// public/layout that changes. `run` draws notes and sequences of commands from a seed, gives both engines the same input at every step
// (the tree, the gesture's start and memory, the change, the measuring answers) under the default rules, and compares what they answer by
// value: accepted, refused or failed, the tree with its stacks, the gesture memory and `start`, the canonical projection and the written
// fields, a field written as removed told from one not written. Nothing here judges whether an answer is right: that is the laws' and the references' work.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { stubMeasure } from '../measure.mjs';
import { sequences, canon } from './seq.mjs';
export { canon };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const NEW = join(ROOT, 'public', 'layout'), OLD = join(ROOT, 'tests', 'lab', 'engine-0d94f29');

/** The modules of one engine, from its folder. */
export async function load(dir) {
  const m = async (f) => import(pathToFileURL(join(dir, f)).href);
  const [tree, settle, layout, gap, geometry, rules, kinds] = await Promise.all(['tree.js', 'settle.js', 'layout.js', 'gap.js', 'geometry.js', 'rules.js', 'kinds.js'].map(m));
  return { dir, settleTree: tree.settleTree, emptyMemory: settle.emptyMemory, open: layout.open, show: layout.show, unshow: layout.unshow, diff: layout.diff,
    check: gap.check, readingOrder: geometry.readingOrder, sharesCol: geometry.sharesCol, extent: geometry.extent, SHEETW: geometry.SHEETW,
    rowFromY: geometry.rowFromY, fxFromCol: geometry.fxFromCol,
    resolve: rules.resolve, DEFAULT: rules.DEFAULT, SETTINGS: rules.SETTINGS, KINDS: kinds.KINDS };
}

/** Where two values first differ, as a path, for the report. */
export function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) { const d = firstDiff(a[k], b[k], path + '/' + k); if (d) return d; }
  }
  return { path, a, b };
}


/** What one engine answers to a command, as plain data to compare: an exception is an answer too. */
function answer(E, f) {
  let r;
  try { r = f(); } catch (e) { return { threw: String(e && e.message) }; }
  return r;
}
/** A patch of written fields by value, a field written as removed (`undefined`, LAYOUT-ENGINE-PLAN §3.4) kept apart from a field the
 *  patch does not name: `canon` drops undefined properties, which here are commands. */
export const REMOVED = '#removed';
export function patches(written) {
  return [...written].map(([id, p]) => [String(id), Object.keys(p).sort().map((k) => [k, p[k] === undefined ? REMOVED : p[k]])]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
/** The fields the bridge would keep for a note read from these places (§3.5), as `diff` takes them: Map<id, Stored>. */
export function storedOf(E, note) {
  const out = new Map();
  const put = (b, parent) => out.set(b.id, { parent, col: b.col, row: parent == null ? E.rowFromY(b.y) : b.y, ...(parent == null ? { fx: E.fxFromCol(b.col) } : {}),
    ...(b.cw != null ? { cw: b.cw } : {}), ...(b.ch != null ? { ch: b.ch } : {}), ...(b.open ? { open: true } : {}), ...(b.collapsed ? { collapsed: true } : {}) });
  for (const b of note.boxes.values()) put(b, null);
  for (const [id, L] of note.areas) for (const b of L.boxes.values()) put(b, id);
  return out;
}
/** The comparable part of settleTree's answer. A failure is compared by its kind only: its message is for people. What the comparison
 *  computes itself (the canonical projection, the written fields) must not throw: `broken` fails the run, equal on both sides or not. */
function settled(E, r, stored) {
  if (r.threw) return { threw: true };
  if (!r.ok) return { ok: false, why: r.why };
  let canonical, written;
  try { canonical = E.unshow(r.layout, E.ctx); written = patches(E.diff(stored, canonical)); } catch (e) { return { broken: String(e && e.message) }; }
  return { ok: true, layout: r.layout, start: r.start, memory: r.memory, pressed: r.pressed ?? null, ran: r.ran, canonical, sound: soundness(E, r.layout), written };
}
const soundness = (E, T) => [T, ...T.areas.values()].map((L) => E.check(L).length);

/** One run: `notes` notes from `seed`, `steps` commands each (seq.mjs draws them). `rulesOf(E)` gives an engine its rules (the default
 *  ones unless a test of the comparison itself gives one side others). Both engines get the same input by value: the tree, the gesture's
 *  start and memory the first engine answered with, which the second answered alike. @returns {{stat:object, by:object, diffs:object[]}} */
export function run(A, B, { seed = 1, notes = 300, steps = 6, rulesOf = (E) => E.DEFAULT, max = 3 } = {}) {
  const diffs = []; let removals = 0, cur = null, storedA = null, storedB = null;
  const differ = (what, a, b, extra) => { const ca = canon(a), cb = canon(b); if (JSON.stringify(ca) === JSON.stringify(cb)) return false; diffs.push({ note: cur.k, seed: cur.seed, what, ...extra, hist: cur.hist.slice(), first: firstDiff(ca, cb) }); return true; };
  const broke = (what, a, b, extra) => { diffs.push({ note: cur.k, seed: cur.seed, what, ...extra, hist: cur.hist.slice(), broken: [a || null, b || null] }); return { stop: true }; };
  const X = {
    done: () => diffs.length >= max,
    memory: () => A.emptyMemory(),
    note(n) {
      cur = n; storedA = storedOf(A, n.stored); storedB = storedOf(B, n.stored);
      // one map of measuring inputs, each engine its own Ctx over it (its own passports, settings and rules)
      for (const E of [A, B]) E.ctx = { rules: rulesOf(E), settings: E.SETTINGS, kinds: E.KINDS, measure: stubMeasure(n.map) };
      const oa = answer(A, () => A.open(n.stored, A.ctx)), ob = answer(B, () => B.open(n.stored, B.ctx));
      if (differ('open', oa, ob)) return null;
      return oa.threw || !oa.ok ? null : oa.shown;
    },
    settle(kind, change, root, memory) {
      const ra = answer(A, () => A.settleTree(root, change, memory, A.ctx)), rb = answer(B, () => B.settleTree(root, change, memory, B.ctx));
      const sa = settled(A, ra, storedA), sb = settled(B, rb, storedB);
      if (sa.broken || sb.broken) return broke(kind, sa.broken, sb.broken, { change });
      if (differ(kind, sa, sb, { change })) return { stop: true };
      if (sa.threw || !sa.ok) return { ok: false, why: sa.why || 'failed' };
      removals += sa.written.reduce((n, [, p]) => n + p.filter(([, v]) => v === REMOVED).length, 0);
      return ra;
    },
    show(kind, tree, temp) {
      const sa = answer(A, () => A.show(A.unshow(tree, A.ctx), temp, A.ctx)), sb = answer(B, () => B.show(B.unshow(tree, B.ctx), temp, B.ctx));
      if (differ(kind, sa, sb)) return { stop: true };
      if (sa.threw) return broke(kind, sa.threw, sb.threw);
      return { layout: sa };
    },
  };
  // no temporary rows of a block's own: the engine keeps them in `tx` since seams S3b, the pinned copy does not, and the paths that
  // lost them there are the differences that part of the plan names (§6.1); the named cases and the laws hold them
  const { stat, by } = sequences(A, X, { seed, notes, steps, own: false });
  return { stat: { ...stat, removals }, by, diffs };
}
