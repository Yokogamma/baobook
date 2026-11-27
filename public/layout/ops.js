// The user's actions as changes (LAYOUT-ENGINE-PLAN §2, §3.4, §6.4; LAYOUT-SEAMS-PLAN §8): each run through `settleTree`, recorded by the
// journal when one is given, by one function for its preview and its commit, returning the new state, the stored fields to write and
// the undo entry. First version, for the narrow slice: a carry and its drop on the sheet and in an area with entering and leaving,
// «В область» and «З області» by a cell, typing, a creation, a deletion, and the exact undo only. Pure: no DOM, no storage; the bridge
// reads a note into a Doc and writes what an action returns.
//
// What an action writes (§3.4): `diff` of the stored fields as read against the canonical layout the action ends with. A refused or a
// failed layout writes no place and changes no state. Typing is another matter: the text is the page's to save whatever SETTLE answers,
// so `typed` always says `content: true`, and after a refusal or a failure `safe: true`: the content cannot be undone, so the note's
// geometry goes to the safe mode (§4.2).

import { settleTree } from './tree.js';
import { emptyMemory } from './settle.js';
import { unshow, diff } from './layout.js';
import { colFromFx } from './geometry.js';
import { pick, next } from './drag.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx @typedef {import('./shapes.js').Stored} Stored
 *  @typedef {{before:number, after:number, tree:Layout, fields:Map<string, ?Stored>, signs:Map<string, string>}} Entry
 *    // an undo entry (§6.4): the identities of the state before and after the action, the tree before it (shared, never changed), the
 *    // stored fields before of every block the action wrote (null: the action made it), and the measurement signature of every block
 *    // of both trees, by which an exact undo knows that the content they were measured for is today's
 *  @typedef {{tree:Layout, stored:Map<string, Stored>, identity:number, clock:number, undo:Entry[]}} Doc
 *    // a note as the engine holds it: the tree as shown, the stored fields as read and as written since, the identity of the canonical
 *    // layout (a fresh one for every change of what it is made from), and the entries
 *  @typedef {{ctx:Ctx, journal?:{run:Function}, sign?:(id:string)=>string}} Env
 *    // `sign`: a block's measurement signature (§4.3; measure.js's in the app), from today's content, for a block an entry holds too
 *  @typedef {{ok:true, doc:Doc, patch:Map<string, Record<string, unknown>>, removed:string[], entry:?Entry}
 *            |{ok:false, why:'refused'|'failed', doc:Doc}} Done */

/** A note the bridge opened. @param {Layout} shown open()'s @param {Map<string, Stored>} stored @returns {Doc} */
export function docOf(shown, stored) { return { tree: shown, stored, identity: 1, clock: 1, undo: [] }; }

const run = (env, root, change, memory) => (env.journal ? env.journal.run(root, change, memory, env.ctx) : settleTree(root, change, memory, env.ctx));
const idsOf = (tree) => [...tree.order, ...[...(tree.areas || new Map()).values()].flatMap((A) => A.order)];

/** The stored fields with a patch written: a field the patch has as undefined is removed; a sheet block's column follows its `fx`. */
export function written(stored, patch, removed = []) {
  const out = new Map(stored);
  for (const id of removed) out.delete(id);
  for (const [id, p] of patch) {
    const s = { ...(out.get(id) || {}) };
    for (const [f, v] of Object.entries(p)) if (v === undefined) delete s[f]; else s[f] = v;
    if (s.parent == null && s.fx != null && 'fx' in p) s.col = colFromFx(s.fx);
    out.set(id, s);
  }
  return out;
}

/** Of `diff`, the blocks of the containers an action ran in (§3.4): a block is written when the container it stands in after the action
 *  was settled by it. A place another container only shows (a repair of open(), a re-measure) waits for an action there. */
function ranIn(patch, layout, ran) {
  const at = new Set(ran.map((c) => c ?? null)), out = new Map();
  for (const [id, p] of patch) {
    let box = null;
    if (!layout.boxes.has(id)) for (const [a, A] of layout.areas || []) if (A.boxes.has(id)) { box = a; break; }
    if (at.has(box)) out.set(id, p);
  }
  return out;
}
/** The blocks a deletion takes: the block, and an area's children with it. */
function taken(tree, box, id) { return box == null && tree.areas?.has(id) ? [id, ...tree.areas.get(id).order] : [id]; }

/** The commit of a layout an action ended with: the stored fields that differ in the containers it ran in (`ran`), written, a fresh
 *  identity and, with `undo`, the entry. */
function commit(doc, layout, env, removed, undo, ran) {
  const patch = ranIn(diff(doc.stored, unshow(layout, env.ctx)), layout, ran), clock = doc.clock + 1;
  let entry = null;
  if (undo) {
    const fields = new Map(), signs = new Map();
    for (const id of [...patch.keys(), ...removed]) fields.set(id, doc.stored.get(id) || null);
    if (env.sign) for (const id of new Set([...idsOf(doc.tree), ...idsOf(layout)])) signs.set(id, env.sign(id));
    entry = { before: doc.identity, after: clock, tree: doc.tree, fields, signs };
  }
  const next = { tree: layout, stored: written(doc.stored, patch, removed), identity: clock, clock, undo: entry ? [...doc.undo, entry] : doc.undo };
  return { ok: true, doc: next, patch, removed, entry };
}

/** One action that is one change: run, and committed when the layout is accepted. @returns {Done} */
function act(doc, change, env, removed = []) {
  const r = run(env, doc.tree, change, emptyMemory());
  if (!r.ok) return { ok: false, why: r.why, doc };
  return commit(doc, r.layout, env, removed, true, r.ran || [change.box ?? null]);
}

/** A new block (EDIT.4), away from the start. `at`: its cell and width in the container's cells; `set`: the sizes it is made with. */
export function create(doc, { box = null, id, kind, at, set }, env) {
  return act(doc, { type: 'create', box, id, kind, at: { frow: at.y, ...at }, away: true, ...(set ? { set } : {}) }, env);
}
/** A block deleted, an area with its children. Their content is the page's to keep for the undo; the entry keeps their stored fields. */
export function remove(doc, { box = null, id }, env) { return act(doc, { type: 'remove', box, id }, env, taken(doc.tree, box, id)); }
/** «В область»: a block of the sheet into an area, at a cell of the area. */
export function enter(doc, { id, to, at }, env) { return act(doc, { type: 'enter', box: null, id, to, at }, env); }
/** «З області»: a child of an area out to the sheet, at a cell of the sheet. */
export function leave(doc, { box, id, at }, env) { return act(doc, { type: 'leave', box, id, at }, env); }

/** A block's content changed (typing, a paste, a fold of its own): its size is settled and the rows that follow are written; no undo
 *  entry, typing having its own undo in the field, and a fresh identity whatever SETTLE answers, the layouts the entries hold being
 *  those of the old content. The text is saved by the page in every case (`content`). */
export function typed(doc, { box = null, id }, env) {
  const r = run(env, doc.tree, { type: 'size', box, id }, emptyMemory());
  if (!r.ok) return { ok: false, why: r.why, doc: touched(doc), content: true, safe: true };
  return { ...commit(doc, r.layout, env, [], false, r.ran || [box]), content: true, safe: false };
}

/** A change of what the layout is made from that is no action (a fold, a relabelled chip, the rules, a font): a fresh identity. */
export function touched(doc) { return { ...doc, identity: doc.clock + 1, clock: doc.clock + 1 }; }

// ---- a carry: every move of the pointer a preview, the drop its commit
/** @typedef {{doc:Doc, drag:import('./drag.js').Drag, cur:?string, start:Layout, memory:object, last:?Layout, pressed:?string,
 *             state:'home'|'outside'|'move'|'refused'|'failed', failed:boolean}} Gesture
 *    // start, memory: what the next move is given (the tree of the carry's start or its last swap, with the crossings made); last:
 *    // the layout of the last accepted move, the preview and what a drop commits; null at home and outside; ran: the containers the
 *    // carry settled since it was last at home, those of its crossings among them, for the write */

/** A block picked up. @returns {?Gesture} */
export function carry(doc, { box = null, id, point }, env) {
  const drag = pick(doc.tree, box, id, point, env.ctx);
  return drag && { doc, drag, cur: box, start: doc.tree, memory: emptyMemory(), last: null, pressed: null, ran: [], state: 'home', failed: false };
}

/** The layout a carry shows (DRAG.C1): SETTLE's result for the current target; at home and outside, the note as the carry started. */
export const preview = (g) => g.last || g.doc.tree;

/** The pointer moved: the preview of the carry there. At home and outside the carry is as it started, before any swap and any crossing
 *  (INV-7 a, DRAG.C1), and a drop there stores nothing (DRAG.C3); a move that is refused keeps the last accepted preview; a failure
 *  stays for the rest of the gesture, whose drop writes nothing. `through`: the hold ran out or Shift is held (DRAG.B4); the neighbour
 *  SETTLE says is pressed is the gesture's `pressed`, which the input's hold timer reads. */
export function moved(g, point, env, through) {
  if (g.failed) return g;
  for (let i = 0; i < 3; i++) {
    const n = next(g.drag, g.cur, g.start, point, env.ctx.settings, through);
    if (n.state !== 'move') return { ...g, drag: { ...g.drag, away: false }, cur: g.drag.home.box, start: g.doc.tree, memory: emptyMemory(), last: null, pressed: null, ran: [], state: n.state };
    const crossing = n.change.type !== 'carry';
    const r = run(env, g.start, n.change, crossing ? emptyMemory() : g.memory);
    if (!r.ok) return { ...g, state: r.why, failed: r.why === 'failed' };
    // a crossing made: the block is a new block of the container it came into, and the carry goes on from the tree it left
    const ran = [...new Set([...g.ran, ...(r.ran || [n.change.box ?? null])])];
    if (crossing) { g = { ...g, drag: n.drag, cur: n.to, start: r.layout, memory: emptyMemory(), last: r.layout, pressed: null, ran, state: 'move' }; continue; }
    return { ...g, drag: n.drag, start: r.start, memory: r.memory, last: r.layout, pressed: r.pressed ?? null, ran, state: 'move' };
  }
  return g;
}

/** The drop: the last accepted preview committed, with one undo entry; nothing at home or outside the sheet (DRAG.C3); after a failure
 *  nothing is written. @returns {Done} */
export function dropped(g, env) {
  if (g.failed) return { ok: false, why: 'failed', doc: g.doc };
  if (!g.last) return { ok: true, doc: g.doc, patch: new Map(), removed: [], entry: null };
  return commit(g.doc, g.last, env, [], true, g.ran);
}

// ---- undo
/** The exact undo (§6.4): with nothing applied since the top entry's action (the identity is its `after`) and every block it knows
 *  measured for today's content (its signatures), the tree before the action is put back as it was, with its gaps and lends, and the
 *  stored fields before; no SETTLE. `patch` and `removed` are the write: the fields put back, and the blocks the action had made.
 *  Otherwise nothing is undone and the engine's entries are dropped: the undo after later edits is step 3's (G27).
 *  @returns {{ok:true, doc:Doc, patch:Map<string, Record<string, unknown>>, removed:string[], restored:string[]}|{ok:false, why:'none'|'stale', doc:Doc}} */
export function undo(doc, env) {
  const e = doc.undo[doc.undo.length - 1];
  if (!e) return { ok: false, why: 'none', doc };
  const stale = doc.identity !== e.after || (env.sign && [...e.signs].some(([id, s]) => env.sign(id) !== s));
  if (stale) return { ok: false, why: 'stale', doc: { ...doc, undo: [] } };
  const stored = new Map(doc.stored), patch = new Map(), removed = [], restored = [];
  for (const [id, was] of e.fields) {
    const now = doc.stored.get(id);
    if (!was) { stored.delete(id); removed.push(id); continue; }
    if (!now) restored.push(id);
    const p = {};
    for (const f of new Set([...Object.keys(was), ...Object.keys(now || {})])) {
      // a sheet block's column is read from its fx, not stored: it is written only as removed, when the block comes back out of an area
      if (f === 'col' && was.parent == null) { if (now && now.parent != null) p.col = undefined; continue; }
      // and so the column the bridge keeps for a block on the sheet is no stored field either: a block that goes back into an area
      // gets its column there whatever that one is
      const has = f === 'col' && now && now.parent == null ? undefined : (now || {})[f];
      if ((was[f] ?? null) !== (has ?? null)) p[f] = was[f];
    }
    stored.set(id, was); patch.set(id, p);
  }
  return { ok: true, doc: { tree: e.tree, stored, identity: e.before, clock: doc.clock, undo: doc.undo.slice(0, -1) }, patch, removed, restored };
}
