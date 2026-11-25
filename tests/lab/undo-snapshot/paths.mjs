// The undo experiment (docs/LAYOUT-SEAMS-PLAN.md §7, S4, Q7): what an undo after later edits of content gives, by four paths. A lab,
// beside the engine: nothing of public/ changes, and nothing here is the app's undo.
//
//   (A)  `inverse`, as built: the action's own change the other way (LAYOUT-ENGINE-PLAN §6.4). An undo only for a carry, a creation
//        and a deletion of a block that is no area; no undo of a composite action.
//   (B)  the candidate: the entry's `before`, canonical (places, stacks, the blocks only the entry holds), with today's content: every
//        block whose signature differs gets an ordinary `{type: 'size'}` through settleTree, in a queue made beforehand (the areas in
//        reading order, in each its blocks in reading order, then the sheet's), with the canonical measure; then shown.
//   (B′) the same candidate and queue; in each area, every such block measured again at its restored width and its height applied by
//        `resize`, all before anything follows; one FOLLOW and one `rest()` of that container; the area's frame by `frameOf`; the sheet
//        last, the same way. A container with no block that differs, its areas' frames as they were, is left untouched.
//   (C)  the yardstick, «the action never happened»: the tree before the action with the later edits played again in their order. It
//        needs the journal of those edits, which the app's entry does not keep; here the history has it.
//
// An entry is `{before, sigs, action}`: the shown tree before the action, the signature of every block's content then, the action.

import { settleTree } from '../../../public/layout/tree.js';
import { emptyMemory, rest } from '../../../public/layout/settle.js';
import { show, unshow } from '../../../public/layout/layout.js';
import { validate } from '../../../public/layout/validate.js';
import { canonicalCtx, heightAt } from '../../../public/layout/size.js';
import { frameOf } from '../../../public/layout/frame.js';
import { follow, resize } from '../../../public/layout/gap.js';
import { isArea, sharesCol } from '../../../public/layout/geometry.js';

export const sigOf = (map, id) => JSON.stringify(map[id] ?? null);
export const sigsOf = (map) => Object.fromEntries(Object.keys(map).map((id) => [id, sigOf(map, id)]));
const containers = (T) => [[null, T], ...T.areas];
const fail = (why, errors) => ({ ok: false, why, errors: errors || [] });
/** A path's result, checked: both measures valid, or `invalid` (a success `validate` rejects). */
function done(canonical, ctx, own = new Map()) {
  let shown; try { shown = show(canonical, own, ctx); } catch (e) { return fail('failed', ['show: ' + e.message]); }
  const e = [...validate(canonical, canonicalCtx(ctx)), ...validate(shown, ctx)];
  return e.length ? { ok: false, why: 'invalid', errors: e.slice(0, 3), canonical, shown } : { ok: true, canonical, shown };
}

/** The queue of (B) and (B′), made from the restored `before`: [box, id] of every block whose signature differs, the areas in reading
 *  order and in each its blocks in reading order, then the sheet's. */
export function queueOf(before, sigs, map) {
  const differs = (id) => sigs[id] !== sigOf(map, id), q = [];
  for (const id of before.order) if (isArea(before.boxes.get(id)) && before.areas.has(id)) for (const c of before.areas.get(id).order) if (differs(c)) q.push([id, c]);
  for (const id of before.order) if (differs(id)) q.push([null, id]);
  return q;
}

/** (A) the inverse change of an action, or null where `inverse` is no undo of it. `now`, the shown tree today. */
export function inverseOf(entry, now, ctx) {
  const a = entry.action, box = a.box ?? null, B = box == null ? entry.before : entry.before.areas.get(box), N = box == null ? now : now.areas.get(box);
  if (!B || !N) return null;
  if (a.type === 'carry') {
    const b0 = B.boxes.get(a.id), cur = N.boxes.get(a.id); if (!b0 || !cur) return null;
    const cy = b0.yc ?? b0.y;
    return { type: 'carry', box, id: a.id, at: { col: b0.col, y: cy, frow: cy, w: b0.w }, away: !sharesCol({ ...cur, col: b0.col, w: b0.w }, cur), canonical: true };
  }
  if (a.type === 'create' && a.kind !== 'area') return N.boxes.has(a.id) ? { type: 'remove', box, id: a.id } : null;
  if (a.type === 'remove') {
    const b = B.boxes.get(a.id); if (!b || isArea(b)) return null;
    const cy = b.yc ?? b.y, set = {}; for (const f of ['cw', 'ch']) if (b[f] != null) set[f] = b[f];
    if (b.open) set.open = true;   // a code block shown whole comes back shown whole (the independent review of 84bb4f0)
    return { type: 'create', box, id: a.id, kind: b.kind, at: { col: b.col, y: cy, frow: cy, w: b.w }, away: true, set, canonical: true };
  }
  // a set size and the width handle: the same change with the values the block had (this lab's reading; §6.4 names no path for them)
  if (a.type === 'size' && a.set) {
    const b0 = B.boxes.get(a.id); if (!b0 || !N.boxes.has(a.id)) return null;
    return { type: 'size', box, id: a.id, set: Object.fromEntries(Object.keys(a.set).map((k) => [k, b0[k] ?? null])) };
  }
  if (a.type === 'width') {
    const b0 = B.boxes.get(a.id); if (!b0 || b0.cw == null || !N.boxes.has(a.id)) return null;
    return { type: 'width', box, id: a.id, cw: b0.cw, side: a.side, ...(a.side === 'left' ? { col: b0.col } : {}) };
  }
  return null;
}
export function undoA(entry, now, ctx, own = new Map()) {
  const c = inverseOf(entry, now, ctx);
  if (!c) return { ok: false, why: 'no undo' };
  let r; try { r = settleTree(now, c, emptyMemory(), ctx); } catch (e) { return fail('failed', ['threw: ' + e.message]); }
  if (!r.ok) return fail(r.why, r.errors);
  let canonical; try { canonical = unshow(r.layout, ctx); } catch (e) { return fail('failed', ['unshow: ' + e.message]); }
  return done(canonical, ctx, own);
}

/** (B) the candidate. `order`: 'queue' as stated, or 'reversed', to see how far the result depends on the order of the queue. */
export function undoB(entry, map, ctx, order = 'queue', own = new Map()) {
  const cctx = canonicalCtx(ctx);
  let T; try { T = unshow(entry.before, ctx); } catch (e) { return fail('failed', ['unshow: ' + e.message]); }
  const q = queueOf(T, entry.sigs, map); if (order === 'reversed') q.reverse();
  for (const [box, id] of q) {
    let r; try { r = settleTree(T, { type: 'size', box, id }, emptyMemory(), cctx); } catch (e) { return fail('failed', ['threw: ' + e.message]); }
    if (!r.ok) return fail(r.why, r.errors);
    T = r.layout;
  }
  return { ...done(T, ctx, own), queue: q.length };
}

/** (B′): the heights of the blocks that differ applied at their restored widths, then one FOLLOW and one rest of each container. */
export function undoBprime(entry, map, ctx, own = new Map()) {
  const cctx = canonicalCtx(ctx);
  let T; try { T = unshow(entry.before, ctx); } catch (e) { return fail('failed', ['unshow: ' + e.message]); }
  const q = queueOf(T, entry.sigs, map);
  const restore = (L, ids) => {
    let out = L;
    for (const id of ids) { const b = id == null ? null : out.boxes.get(id); if (!b || isArea(b)) continue; const m = heightAt(b, b.w - 1, cctx); out = resize(out, id, m.h, 0); }
    if (out === L && !ids.length) return L;   // a container with no block that differs, its areas' frames as they were: nothing runs in it
    out = follow(out);
    const r = rest(out, cctx);
    if (!r.ok) throw Object.assign(new Error(r.errors?.[0] || r.why), { why: r.why });
    return r.layout;
  };
  try {
    let sheet = T; const areas = new Map(T.areas);
    for (const id of T.order) {
      if (!isArea(T.boxes.get(id)) || !areas.has(id)) continue;
      const C = areas.get(id), C2 = { ...restore(C, q.filter(([b]) => b === id).map(([, c]) => c)), measure: C.measure, areas: new Map() };
      areas.set(id, C2);
      const a = sheet.boxes.get(id), f = frameOf(a, C2, cctx);
      if (f.h !== a.h) sheet = resize(sheet, id, f.h, 0);
    }
    const mine = q.filter(([b]) => b == null).map(([, c]) => c), out = sheet === T && !mine.length ? sheet : restore(sheet === T ? sheet : { ...sheet, order: sheet.order }, mine.length ? mine : [null]);
    return { ...done({ ...out, measure: T.measure, areas }, ctx, own), queue: q.length };
  } catch (e) { return fail(e.why || 'failed', [e.message]); }
}

/** (C) the yardstick: the tree before the action with the later edits played again. `edits`, in order: `{id, content}`, a typing (or
 *  another change of what a block is measured from), or `{own: [id, rows]}`, a block's own temporary rows. `mapC` and `ownC` are its
 *  own, changed as the edits are played. Null where an edit is refused there. */
export function counterfactual(entry, edits, mapC, ctxOf, ownC = new Map()) {
  let T = entry.before; const ctx = ctxOf(mapC);
  const where = (id) => containers(T).find(([, C]) => C.boxes.has(id));
  for (const e of edits) {
    if (e.own) { const [id, n] = e.own; if (!where(id)) continue; if (n > 0) ownC.set(id, n); else ownC.delete(id); T = show(unshow(T, ctx), ownC, ctx); continue; }
    mapC[e.id] = e.content;
    const at = where(e.id);
    if (!at) continue;   // not in the tree without the action: a block the action created
    const r = settleTree(T, { type: 'size', box: at[0], id: e.id }, emptyMemory(), ctx); if (!r.ok) return null; T = r.layout;
  }
  let canonical; try { canonical = unshow(T, ctx); } catch { return null; }
  const own = new Map([...ownC].filter(([id]) => where(id)));
  return done(canonical, ctx, own);
}

/** The places of a tree, by value: per container, every block's column, row, width and height. */
export const placesOf = (T) => JSON.stringify(containers(T).map(([n, L]) => [n, [...L.boxes.values()].map((b) => [b.id, b.col, b.y, b.w, b.h]).sort()]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
/** What the probes of consequences give on a shown tree (§4.2), by value: each block deleted alone, each elastic text given a set
 *  width narrower, the temporary heights ended; and the blocks deleted one after another, the places after each, since one deletion
 *  alone does not show every gap a tree remembers (the independent review of 84bb4f0: two trees alike under every single probe put a
 *  block five rows apart after two deletions). The blocks are taken in the order of their ids, so that the order a tree keeps its
 *  blocks in is no difference. */
export function probesOf(shown, map, ctxOf) {
  const ctx = ctxOf(map), out = [];
  const leaves = (T) => containers(T).flatMap(([box, L]) => [...L.boxes.values()].filter((b) => !isArea(b)).map((b) => [box, b])).sort((x, y) => (x[1].id < y[1].id ? -1 : 1));
  for (const [box, b] of leaves(shown)) {
    const d = settleTree(shown, { type: 'remove', box, id: b.id }, emptyMemory(), ctx); out.push(['remove', b.id, d.ok ? placesOf(d.layout) : d.why]);
    if (b.kind === 'text' && b.cw == null && b.w > 4) { const n = settleTree(shown, { type: 'size', box, id: b.id, set: { cw: b.w - 3 } }, emptyMemory(), ctx); out.push(['narrow', b.id, n.ok ? placesOf(n.layout) : n.why]); }
  }
  let T = shown;
  for (const [, b0] of leaves(shown)) {
    const at = containers(T).find(([, L]) => L.boxes.has(b0.id)); if (!at) continue;
    const d = settleTree(T, { type: 'remove', box: at[0], id: b0.id }, emptyMemory(), ctx);
    if (!d.ok) { out.push(['then remove', b0.id, d.why]); continue; }
    T = d.layout; out.push(['then remove', b0.id, placesOf(T)]);
  }
  const calm = Object.fromEntries(Object.entries(map).map(([id, m]) => [id, { ...m, temp: 0 }]));
  try { out.push(['calm', placesOf(show(unshow(shown, ctx), new Map(), ctxOf(calm)))]); } catch (e) { out.push(['calm', 'threw']); }
  return JSON.stringify(out);
}
