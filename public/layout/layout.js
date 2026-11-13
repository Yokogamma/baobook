// Opening a note and its two measures (docs/LAYOUT-ENGINE-PLAN.md §2.1, §3.4, §3.5; LAYOUT-RULES §2.1): `open()` makes a valid layout of
// the places the bridge read, shown and not written; `show` and `unshow` turn one measure into the other with the same stacks and widths;
// `diff` gives the stored fields an action writes. The note is a tree of one level: the sheet's Layout with an area's children in
// `areas`, each in the area's own cells (§3.1). Nothing here records what it moved: what differs from the fields the bridge kept is all
// §3.4 needs.

import { PLACE_FIELDS } from './shapes.js';
import { extent, isArea, hits, readingOrder, range, inRange, rowFromY, fxFromCol } from './geometry.js';
import { on } from './rules.js';
import { isElastic, rowsAt, restCells, capCells, canonicalCtx } from './size.js';
import { fromPlaces, follow, resize } from './gap.js';
import { rest } from './settle.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Stored} Stored */

const pad = (b) => (isArea(b) ? 1 : 0);
const layoutOf = (from, boxes, extra = {}) => {
  const order = readingOrder(boxes.values());
  return { cols: from.cols, measure: from.measure, ...extra, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order, areas: extra.areas ?? from.areas ?? new Map() };
};
/** The rows a container's blocks take, from its top: what an area's frame holds under its header (AREA.2). */
const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
/** An area's frame rows for children that take `inner` rows, by its passport (AREA.2: header, children, or a larger `ch`; collapsed, the
 *  header alone). */
const frameRows = (area, inner, ctx) => ctx.kinds[area.kind].container.height(area, inner, ctx.measure);

// ====================================================================== open()
/** Step 0, sizes: every block's width and rows at its place as read, in the canonical measure (`ctx` already canonical). A set width is its
 *  `cw`, shown no wider than its container (step 1's cap, applied here so that it is measured once); an area's height is its frame round
 *  the rows its children take (`inner`); an elastic block starts at the widest it gets by itself and takes RESTPASSES passes of SIZE.8's
 *  rest width on the rows it stands on. @returns {Map<string, Box>} */
function sized(boxes, cols, inner, ctx) {
  const out = new Map(), at = (b, w) => {
    if (isArea(b)) return { ...b, w, h: frameRows({ ...b, w }, inner.get(b.id) ?? 0, ctx), t: 0, yc: b.y };
    const q = rowsAt({ ...b, w }, w - 1, ctx);
    return { ...b, w, h: q.rows, t: 0, yc: b.y };
  };
  for (const b of boxes.values()) {
    const w = b.cw != null ? Math.min(b.cw + 1, cols - pad(b)) : Math.min(capCells(b, ctx) + 1, Math.max(2, cols - b.col - pad(b)));
    out.set(b.id, at(b, Math.max(2, w)));
  }
  const passes = on(ctx.rules, 'SIZE.8') ? ctx.settings.RESTPASSES : 1;
  for (let p = 0; p < passes; p++) {
    let changed = false;
    const L = layoutOf({ cols, measure: 'canonical' }, out);
    for (const id of L.order) {
      const b = out.get(id); if (!isElastic(b, ctx)) continue;
      const w = restCells(layoutOf({ cols, measure: 'canonical' }, out), b, ctx) + 1;
      if (w !== b.w) { out.set(id, at(b, w)); changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

/** Step 1, clamp, by each block's kind (geometry.js's range, as phase 1c clamps a moved block): an area at row 0 moves down one row, so
 *  that its free row above lies in the sheet; a card past the container's right edge moves left to the last column where it fits, an
 *  elastic block narrowed below its floor by the edge taking its floor first (DRAG.A3: min(natural width, MINC) and its kind's floor; with
 *  DRAG.A3.narrow off, the widest it gets by itself); a set width wider than its container already stands at its full width (step 0) and
 *  goes to column 0. What a clamp puts on another block, step 2 separates. @returns {Map<string, Box>} */
function clamped(boxes, cols, inner, ctx) {
  const out = new Map();
  for (const b of boxes.values()) {
    let w = b.w;
    if (isElastic(b, ctx)) {
      const k = ctx.kinds[b.kind], floor = on(ctx.rules, 'DRAG.A3.narrow') ? Math.max(k.minCells(b, ctx.measure), Math.min(ctx.measure.natural(b.id), ctx.settings.MINC)) : capCells(b, ctx);
      w = Math.min(Math.max(w, floor + 1), cols - pad(b));
    }
    const r = range({ ...b, w }, cols), col = Math.max(r.colMin, Math.min(r.colMax, b.col)), y = Math.max(r.yMin, b.y);
    if (w === b.w && col === b.col && y === b.y) { out.set(b.id, b); continue; }
    const nb = { ...b, col, y, yc: y, w };
    if (w !== b.w) nb.h = isArea(b) ? frameRows(nb, inner.get(b.id) ?? 0, ctx) : rowsAt(nb, w - 1, ctx).rows;
    out.set(b.id, nb);
  }
  return out;
}

/** Step 2, separate, as today's `resolveIn` does: the blocks visited in reading order of the layout as it stands, ties by id, each placed
 *  in turn; a block that hits a placed one (an area's extent with its free cells, AREA.7a) goes down alone, its extent's top right under
 *  the bottom of the one it hits, until it hits none, and is placed. Rows only grow and a placed block never moves (P-SEP between two
 *  uncarried blocks, S6, before any stack exists), so one pass leaves no two blocks that hit: every pair was checked when the later one
 *  was placed. `resolveIn`'s pass again, in the updated order, moves nothing after it. @returns {Map<string, Box>} */
function separated(boxes) {
  const out = new Map(boxes), placed = [];
  for (const id of readingOrder(out.values())) {
    let b = out.get(id);
    for (let hit = placed.find((p) => hits(p, b)); hit; hit = placed.find((p) => hits(p, b))) {
      const y = b.y + (extent(hit).r1 + 1 - extent(b).r0);
      b = { ...b, y, yc: y };
    }
    out.set(id, b); placed.push(b);
  }
  return out;
}

/** One container's steps 0–4 (§3.5): sizes, clamp, separate at the places as read, with no stacks and no FOLLOW; GAP.1's stacks from the
 *  separated places; phases 9 and 10 of SETTLE at rest (`rest`), FOLLOW and RELINK included. `inner`: the rows each area's children
 *  take, its children opened first. @returns {{ok:true, layout:Layout}|{ok:false, layout:Layout, errors:string[]}} */
function openOne(L, cols, inner, ctx) {
  const read = sized(L.boxes, cols, inner, ctx);
  const safe = layoutOf({ cols, measure: 'canonical' }, read);
  try {
    const placed = separated(clamped(read, cols, inner, ctx));
    const r = rest(fromPlaces(layoutOf({ cols, measure: 'canonical' }, placed)), ctx);
    if (!r.ok) return { ok: false, layout: safe, errors: r.errors };
    return { ok: true, layout: r.layout };
  } catch (e) {
    return { ok: false, layout: safe, errors: [e.message] };
  }
}

/** Every column, row, width and height a whole number from 0 to MAXCELL, after the conversions of §3.1 (the bridge's): the engine's range.
 *  @returns {?string} the first value out of it */
function outOfRange(L) {
  for (const b of L.boxes.values()) for (const f of ['col', 'y', 'cw', 'ch']) if (b[f] != null && !inRange(b[f])) return `${b.id}.${f} = ${b[f]}`;
  return null;
}

/** open() (LAYOUT-ENGINE-PLAN §3.5): the note's places as the bridge read them, a Layout of Boxes with `w` and `h` unset and no stacks,
 *  the sheet's with each area's children in `areas` in the area's cells, made a valid layout in the canonical measure: every area's
 *  children first, in the columns the area shows, so that its frame holds the rows they take; then the sheet. Step 5, the displayed
 *  layout, is `show` with the temporary heights the caller gives (`shown`). Writes and records nothing; deterministic: the same note
 *  gives the same layout on every device that measures the same. When a step fails, which only a bug makes happen, or a value lies out of
 *  the engine's range, `{ok: false, why: 'failed', layout}`: every block at its place and size as read, nothing separated, no stacks,
 *  for the safe mode. A collapsed area's children are opened as any area's, kept for when it opens (proposed).
 *  @param {Layout} stored @param {Ctx} ctx @param {Map<string, number>} [temp] the temporary rows per block id, for `shown`
 *  @returns {{ok:true, layout:Layout, shown:Layout}|{ok:false, why:'failed', layout:Layout, errors:string[]}} */
export function open(stored, ctx, temp = new Map()) {
  const c = canonicalCtx(ctx), cols = stored.cols, areas = new Map(), inner = new Map(), errors = [];
  const bad = [stored, ...(stored.areas ? stored.areas.values() : [])].map(outOfRange).find(Boolean);
  if (bad) errors.push('open: out of the engine\'s range: ' + bad);
  for (const b of stored.boxes.values()) {
    if (!isArea(b)) continue;
    const A = stored.areas?.get(b.id) || { boxes: new Map() }, shown = b.cw != null ? Math.min(b.cw + 1, cols - 1) : 2;
    const r = errors.length ? { ok: false, layout: layoutOf({ cols: shown - 1, measure: 'canonical' }, new Map()) } : openOne(A, shown - 1, new Map(), c);
    if (!r.ok) { errors.push(...(r.errors || [])); areas.set(b.id, r.layout); } else areas.set(b.id, r.layout);
    inner.set(b.id, bottomOf(r.layout));
  }
  const sheet = errors.length ? null : openOne(stored, cols, inner, c);
  if (sheet && !sheet.ok) errors.push(...sheet.errors);
  if (errors.length) {
    const L = { ...layoutOf({ cols, measure: 'canonical' }, sized(stored.boxes, cols, inner, c)), areas };
    return { ok: false, why: 'failed', layout: L, errors };
  }
  const layout = { ...sheet.layout, areas };
  return { ok: true, layout, shown: show(layout, temp, ctx) };
}

// ====================================================================== the two measures
/** The displayed layout (LAYOUT-RULES §2.1): FOLLOW with the displayed measure, the same stacks and widths. Every block shows the rows the
 *  measure adds to its canonical ones, and those `temp` gives it (the wide field row of P18, FOLDPHONE); an area, children first, the
 *  growth of its frame that their shown rows make, and its own `temp`. Each box's `t` is set, and its `yc` refreshed by FOLLOW.
 *  @param {Layout} canonical @param {Map<string, number>} [temp] @param {Ctx} ctx @returns {Layout} */
export function show(canonical, temp = new Map(), ctx) {
  const areas = new Map();
  for (const [id, A] of canonical.areas || []) areas.set(id, show(A, temp, ctx));
  let L = canonical;
  for (const b of canonical.boxes.values()) {
    const hc = b.h - (b.t || 0);
    let t = temp.get(b.id) || 0;
    if (isArea(b)) {
      const A = canonical.areas?.get(b.id);
      if (A) t += frameRows(b, bottomOf(areas.get(b.id)), ctx) - frameRows(b, bottomOf(unshow(A, ctx)), ctx);
    } else {
      const q = rowsAt(b, b.w - 1, ctx); t += q.shown - q.rows;
    }
    if (t !== (b.t || 0)) L = resize(L, b.id, hc + t, t);
  }
  return { ...follow(L), measure: 'displayed', areas };
}

/** The canonical layout: FOLLOW with the canonical measure, every temporary row taken off, the same stacks and widths; what `diff`
 *  compares, what the undo entry keeps and what the next action starts from (LAYOUT-ENGINE-PLAN §2.1). @returns {Layout} */
export function unshow(displayed, ctx) {
  const areas = new Map();
  for (const [id, A] of displayed.areas || []) areas.set(id, unshow(A, ctx));
  let L = displayed;
  for (const b of displayed.boxes.values()) if (b.t > 0) L = resize(L, b.id, b.h - b.t, 0);
  return { ...(L === displayed ? displayed : follow(L)), measure: 'canonical', areas };
}

// ====================================================================== diff
const PLACE = new Set(['parent', 'row', 'fx', 'col']), SIZES = PLACE_FIELDS.filter((f) => !PLACE.has(f));
const same = (a, b) => (a ?? null) === (b ?? null);

/** The stored fields of one block that differ from those the bridge read (§3.4): its parent; its place in its container's own fields (on
 *  the sheet `row` and `fx`, `fx` only when its column is not the one read; in an area `row` and `col`), the other container's place field
 *  removed when it changed containers; `cw`, `ch`, `open`, `collapsed`. A field the block no longer has is in the patch as `undefined`:
 *  written as removed. A block the bridge read nothing for gets every field it has. */
function patchOf(b, parent, s) {
  const p = {}, was = s || {}, fresh = !s;
  if (fresh ? parent != null : !same(was.parent, parent)) p.parent = parent ?? undefined;
  const moved = fresh || 'parent' in p;
  if (parent == null) {
    if (moved || was.col !== b.col) p.fx = fxFromCol(b.col);
    if (moved && !fresh) p.col = undefined;
    if (moved || was.row !== rowFromY(b.y)) p.row = rowFromY(b.y);
  } else {
    if (moved || was.col !== b.col) p.col = b.col;
    if (moved && !fresh) p.fx = undefined;
    if (moved || was.row !== b.y) p.row = b.y;
  }
  for (const f of SIZES) {
    const flag = typeof b[f] === 'boolean' || typeof was[f] === 'boolean';
    const now = flag ? (b[f] ? true : undefined) : b[f], then = flag ? (was[f] ? true : undefined) : was[f];
    if (!same(now, then) && (!fresh || now !== undefined)) p[f] = now;
  }
  return p;
}

/** diff (LAYOUT-ENGINE-PLAN §2.1, §3.4): the stored fields of `after`'s blocks, the canonical layout an action ends with, the sheet's and
 *  every area's, that differ from `stored`, the fields as the bridge read them; per block id, only the blocks with a difference. Every key
 *  is one of PLACE_FIELDS. @param {Map<string, Stored>} stored @param {Layout} after @returns {Map<string, Record<string, unknown>>} */
export function diff(stored, after) {
  const out = new Map();
  const visit = (L, parent) => {
    for (const id of L.order) {
      const p = patchOf(L.boxes.get(id), parent, stored.get(id));
      if (Object.keys(p).length) out.set(id, p);
    }
  };
  visit(after, null);
  for (const [id, A] of after.areas || []) visit(A, id);
  return out;
}
