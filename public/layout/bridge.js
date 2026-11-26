// The bridge, its pure part (LAYOUT-ENGINE-PLAN §2, §3.4, §3.5, §4.2; LAYOUT-SEAMS-PLAN §8): the only module that knows the page's block
// objects. It reads them into a tree and the stored fields as read, opens the note, runs the slice's actions through ops.js, and says
// what to write back: the place fields of the blocks an action wrote. First version: no DOM here; the wiring into index.html and the
// browser's Measure are S5d's.
//
// The safe mode (§3.5, §4.2). A note that cannot be opened, and a note whose content changed in a way the engine could not place
// (typing that SETTLE refused or failed), is shown with every block at its last accepted place and its size there; placement is off
// for it, typing stays, and no place or size of it is written until it is opened again.
//
// One state of inputs for a gesture (seams plan §8): a carry holds the note it started on, the version of what the Measure reads
// (`env.version`, or the signatures `env.sign` gives for every block) and a Measure that answers the same question the same way
// until it ends. A change from outside, an action, a change of content or a change of the Measure's inputs makes it stale, and a
// stale carry asks nothing and writes nothing. The app gives one of `version` and `sign`; with neither, only the answers already
// given are kept, and a width not yet asked would be measured by the new inputs.

import { SHEETW, MAXCELL, colFromFx, yFromRow, readingOrder, isArea } from './geometry.js';
import { frameOf } from './frame.js';
import { PLACE_FIELDS } from './shapes.js';
import { open } from './layout.js';
import { heightAt, cellsOf } from './size.js';
import * as ops from './ops.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Stored} Stored @typedef {import('./ops.js').Doc} Doc
 *  @typedef {import('./ops.js').Env} Env
 *  @typedef {{id:string, row:number, text?:string, parent?:string, col?:number, fx?:number, kind?:string, cw?:number, ch?:number, open?:boolean, collapsed?:boolean}} Block
 *    // a block as the page holds and stores it (index.html `serBlock`): the bridge reads these fields and writes PLACE_FIELDS only
 *  @typedef {{doc:Doc, safe:boolean, epoch:number, errors:string[]}} Note
 *    // doc: ops.js's; safe: the safe mode; epoch: raised by every change from outside, so that a carry begun before it is stale
 *  @typedef {{patch:Map<string, Record<string, unknown>>, removed:string[], restored?:string[]}} Write
 *    // the place fields to put on the page's blocks (a field given as undefined is removed), the blocks to take away, and those an
 *    // undo brings back, whose content is the page's */

const kindOf = (d) => (d.kind === 'code' || d.kind === 'area' ? d.kind : 'text');
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });

/** The note as stored, read (§3.5): the blocks the page shows (a text with no content is not shown), areas with no parent, a block
 *  whose parent is not an area of the note on the sheet at its `col`, or by its `fx` when it has none, as an area with a parent is; a
 *  fractional place rounded to the nearest cell and at least 0,
 *  `cw` and `ch` rounded up to whole cells, `cw` at least the kind's minimum. And the stored fields as read, for `diff`: a sheet
 *  block's column as its `fx` rounds, every other place as stored, `cw` and `ch` as read here; so a place the reading or open()
 *  repaired differs from them, and is written with the first action in its container.
 *  @param {Block[]} blocks @param {Record<string, {minCells:Function}>} kinds @param {number} [cols]
 *  @returns {{layout:Layout, stored:Map<string, Stored>}} */
export function read(blocks, kinds, cols = SHEETW) {
  const shown = blocks.filter((d) => d && d.id && (kindOf(d) !== 'text' || (d.text || '').trim()));
  const areas = new Set(shown.filter((d) => kindOf(d) === 'area').map((d) => d.id));
  const sheet = [], kids = new Map([...areas].map((id) => [id, []])), stored = new Map();
  for (const d of shown) {
    const kind = kindOf(d), inArea = kind !== 'area' && d.parent != null && areas.has(d.parent);
    const min = kinds[kind].minCells(), cw = d.cw > 0 ? Math.max(Math.ceil(d.cw), min) : kind === 'area' ? min : undefined, ch = d.ch > 0 ? Math.ceil(d.ch) : undefined;
    const sizes = { ...(cw != null ? { cw } : {}), ...(ch != null ? { ch } : {}), ...(d.open ? { open: true } : {}), ...(d.collapsed ? { collapsed: true } : {}) };
    // a block with a parent that is no area of the note keeps the column it had there, as the page's `make` does; with no `col`
    // (and for an area, which never had one) its `fx` says where it stands; a child with neither is in its area's column 0
    const byCol = d.parent != null && (inArea || (d.col != null && kind !== 'area')) || (d.parent != null && d.fx == null);
    const col = byCol ? Math.round(d.col || 0) : colFromFx(d.fx || 0), row = Math.round(d.row);
    const box = { id: d.id, kind, col: Math.max(0, col), y: Math.max(0, inArea ? row : yFromRow(row)), ...sizes };
    (inArea ? kids.get(d.parent) : sheet).push(box);
    stored.set(d.id, d.parent != null ? { parent: d.parent, ...(byCol ? { col: d.col ?? 0 } : { fx: d.fx, col }), row: d.row, ...sizes } : { fx: d.fx ?? 0, col, row: d.row, ...sizes });
  }
  const layout = lay(cols, sheet);
  for (const [id, bs] of kids) layout.areas.set(id, lay(0, bs));
  return { layout, stored };
}

/** A note opened (§3.5). When open() fails, or a value lies out of the engine's range, the safe mode: the note as read, placement off,
 *  shown within the engine's range (the stored fields keep the values as stored).
 *  @param {Block[]} blocks @param {Env} env @param {{cols?:number, temp?:Map<string, number>}} [o] @returns {Note} */
export function opened(blocks, env, { cols = SHEETW, temp = new Map() } = {}) {
  const r = read(blocks, env.ctx.kinds, cols), o = open(r.layout, env.ctx, temp);
  return o.ok ? { doc: ops.docOf(o.shown, r.stored), safe: false, epoch: 0, errors: [] } : { doc: ops.docOf(safeTree(bounded(o.layout), env.ctx), r.stored), safe: true, epoch: 0, errors: o.errors || [] };
}

/** The page's blocks with a write put on them: PLACE_FIELDS and nothing else; a block taken away is left to the page, which holds its
 *  content. Returns new objects for the blocks it changed and the same objects for the others. @param {Block[]} blocks @param {Write} write */
export function patched(blocks, write) {
  return blocks.map((b) => {
    const p = write.patch.get(b.id);
    if (!p) return b;
    const out = { ...b };
    for (const f of PLACE_FIELDS) if (f in p) { if (p[f] === undefined) delete out[f]; else out[f] = p[f]; }
    return out;
  });
}

// ---- the safe mode
/** A block of the safe display within the engine's range (§3.5): its place first, leaving room for the smallest block (two columns,
 *  one row), then its size within what is left, so its right side and its bottom are at most MAXCELL. A size that is no number
 *  (a Measure's answer, a stored value) gives way to `last`, the size it was last shown at, and then to the smallest. */
function within(b, last = {}) {
  const whole = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
  const col = whole(b.col, 0, MAXCELL - 2) ?? 0, y = whole(b.y, 0, MAXCELL - 1) ?? 0;
  const o = { ...b, col, y, w: whole(b.w, 2, MAXCELL - col) ?? whole(last.w, 2, MAXCELL - col) ?? 2, h: whole(b.h, 1, MAXCELL - y) ?? whole(last.h, 1, MAXCELL - y) ?? 1 };
  o.t = whole(b.t, 0, o.h) ?? 0;
  if (b.yc != null) o.yc = whole(b.yc, 0, MAXCELL - 1) ?? y;
  for (const f of ['cw', 'ch']) if (b[f] != null) o[f] = whole(b[f], 1, MAXCELL) ?? 1;
  return o;
}
/** A tree shown within the engine's range, the sheet and every area. */
function bounded(tree) {
  const one = (L) => ({ ...L, boxes: new Map([...L.boxes].map(([id, b]) => [id, within(b)])) });
  return { ...one(tree), areas: new Map([...(tree.areas || [])].map(([id, A]) => [id, one(A)])) };
}
/** The tree as the safe mode shows it: every block where it stands, at the height its content has now, an area's frame round its
 *  children as they now are, each within the engine's range after it is measured; nothing settled, no stacks, so blocks may overlap. */
function safeTree(tree, ctx) {
  const leaves = (L) => {
    const boxes = new Map();
    for (const [id, b] of L.boxes) {
      const { above, ...o } = b;
      if (!isArea(b)) { try { const r = heightAt(o, cellsOf(o), ctx); o.h = r.h; o.t = r.t; } catch { /* its last height */ } }
      boxes.set(id, within(o, b));
    }
    return { ...L, boxes };
  };
  const areas = new Map([...(tree.areas || [])].map(([id, A]) => [id, leaves(A)])), sheet = leaves(tree);
  for (const [id, b] of sheet.boxes) {
    if (!isArea(b)) continue;
    let f = null;
    try { f = frameOf(b, areas.get(id) || null, ctx); } catch { /* its last frame */ }
    if (f) sheet.boxes.set(id, within({ ...b, h: f.h, t: f.t }, b));
  }
  return { ...sheet, areas };
}
/** The note put into the safe mode: the entries are dropped, their layouts being of a note that was placed. */
const unsafe = (note, env, errors) => ({ ...note, doc: { ...ops.touched(note.doc), tree: safeTree(note.doc.tree, env.ctx), undo: [] }, safe: true, errors });

// ---- the actions
const done = (note, d) => (d.ok ? { ok: true, note: { ...note, doc: d.doc }, write: { patch: d.patch, removed: d.removed } } : { ok: false, why: d.why, note, write: null });
const off = (note) => ({ ok: false, why: 'safe', note, write: null });

/** A new block, a block into or out of an area: placement, off in the safe mode. A refused or failed layout writes nothing. */
export const create = (note, a, env) => (note.safe ? off(note) : done(note, ops.create(note.doc, a, env)));
export const enter = (note, a, env) => (note.safe ? off(note) : done(note, ops.enter(note.doc, a, env)));
export const leave = (note, a, env) => (note.safe ? off(note) : done(note, ops.leave(note.doc, a, env)));
/** A block deleted. In the safe mode it is only taken away: nothing follows it, and no place is written. */
export function remove(note, a, env) {
  if (!note.safe) return done(note, ops.remove(note.doc, a, env));
  const box = a.box ?? null, T = note.doc.tree, gone = box == null && T.areas.has(a.id) ? [a.id, ...T.areas.get(a.id).order] : [a.id];
  const cut = (L) => ({ ...L, boxes: new Map([...L.boxes].filter(([id]) => id !== a.id)), order: L.order.filter((id) => id !== a.id) });
  const areas = new Map([...T.areas].filter(([id]) => id !== a.id).map(([id, A]) => [id, id === box ? cut(A) : A]));
  const stored = new Map([...note.doc.stored].filter(([id]) => !gone.includes(id)));
  return { ok: true, note: { ...note, doc: { ...ops.touched(note.doc), tree: { ...(box == null ? cut(T) : T), areas }, stored } }, write: { patch: new Map(), removed: gone } };
}

/** A block's content changed. The text is the page's to save whatever happens here (`content`). Placed, the rows that follow are
 *  written. Refused or failed, no place is written and the note goes into the safe mode, the content being what it now is (§4.2). In
 *  the safe mode the block is shown at its new height where it stands. */
export function typed(note, a, env) {
  if (note.safe) return { ok: true, content: true, note: { ...note, doc: { ...ops.touched(note.doc), tree: safeTree(note.doc.tree, env.ctx) } }, write: null };
  const d = ops.typed(note.doc, a, env);
  if (d.ok) return { ok: true, content: true, note: { ...note, doc: d.doc }, write: { patch: d.patch, removed: [] } };
  return { ok: false, why: d.why, content: true, note: unsafe(note, env, ['bridge: a change of content was ' + d.why]), write: null };
}

/** The exact undo; `restored`, the blocks to bring back with the content the page kept. Stale, the entries are dropped. */
export function undo(note, env) {
  if (note.safe) return off(note);
  const u = ops.undo(note.doc, env);
  return u.ok ? { ok: true, note: { ...note, doc: u.doc }, write: { patch: u.patch, removed: u.removed, restored: u.restored } } : { ok: false, why: u.why, note: { ...note, doc: u.doc }, write: null };
}

/** The note changed from outside (another tab or device, an import): read and opened again, its entries dropped, and every carry
 *  begun before it stale. @param {Note} note @param {Block[]} blocks */
export function outside(note, blocks, env, o) { return { ...opened(blocks, env, o), epoch: note.epoch + 1 }; }

// ---- a carry
/** A Measure that answers a question once and gives that answer again, as a copy of what it was first given, so that nothing done
 *  to an answer changes the next one. */
export function frozen(measure) {
  const rows = new Map(), natural = new Map();
  return {
    rows(id, cells) { const k = id + '\u0000' + cells; if (!rows.has(k)) rows.set(k, { ...measure.rows(id, cells) }); return { ...rows.get(k) }; },
    natural(id) { if (!natural.has(id)) natural.set(id, measure.natural(id)); return natural.get(id); },
    // the app's Measure says what it reads; read from it each time, so that one that has no version has none here, and one whose
    // version cannot be read cannot be read here either
    get version() { return measure.version; },
  };
}
const idsOf = (tree) => [...tree.order, ...[...(tree.areas || new Map()).values()].flatMap((A) => A.order)];
/** What the Measure reads, as one value to compare: the caller's version of it, every block's signature, or the Measure's own
 *  version. A Measure that has none gives nothing to compare (the answers already given are all a carry keeps). One whose version
 *  cannot be read, a getter or a call that throws or a version that is no function, is another matter: a value equal to no other,
 *  so the carry is stale, asks nothing and writes nothing. */
function inputs(tree, env) {
  try {
    if (env.version) return env.version();
    if (env.sign) return idsOf(tree).map((id) => id + '\u0000' + env.sign(id)).join('\u0001');
    const f = env.ctx.measure.version;
    return f === undefined ? null : typeof f === 'function' ? f.call(env.ctx.measure) : {};
  } catch { return {}; }
}

/** A block picked up: the carry holds the note as it is, its epoch, the Measure's inputs and a frozen Measure. Off in the safe mode. */
export function carry(note, a, env) {
  if (note.safe) return null;
  const mine = { ...env, ctx: { ...env.ctx, measure: frozen(env.ctx.measure) } }, g = ops.carry(note.doc, a, mine);
  return g && { g, env: mine, doc: note.doc, epoch: note.epoch, inputs: inputs(note.doc.tree, env), read: () => inputs(note.doc.tree, env) };
}
/** A carry is stale when the note changed since it began (from outside, or by any action or change of content), or what the Measure
 *  reads did (a font, a relabelled chip, the text size): a width it has not asked yet would be measured for another state. */
export const stale = (note, c) => note.epoch !== c.epoch || note.doc !== c.doc || note.safe || c.read() !== c.inputs;
/** The pointer moved. A stale carry asks nothing and is cancelled. */
export function moved(note, c, point) { return stale(note, c) ? { ...c, cancelled: true } : { ...c, g: ops.moved(c.g, point, c.env) }; }
/** The layout a carry shows; the note's own once it is cancelled. */
export const preview = (note, c) => (c.cancelled || stale(note, c) ? note.doc.tree : ops.preview(c.g));
/** The drop. A stale or cancelled carry writes nothing. */
export function dropped(note, c) {
  if (c.cancelled || stale(note, c)) return { ok: false, why: 'stale', note, write: null };
  return done(note, ops.dropped(c.g, c.env));
}
