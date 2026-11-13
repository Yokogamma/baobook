// SETTLE (docs/LAYOUT-RULES.md §5; LAYOUT-ENGINE-PLAN §5.2, step 2b): the one solver, in one container. The pipeline is phases 1–10, run in
// this order every time; which of them a change runs is derived from its kind (changes.js), so this file holds no table of changes. Each
// phase reads only what the phases before it produced; the blocks they moved, with the columns each block left and came into and why, make
// the transition the next RELINK reads (GAP's inputs, `moved`): phase 8 against `base` (the layout after phase 1b), phase 9 (c) against the
// layout after phase 8. A switched-off rule skips its phase or takes the branch its fallback names (§1.6, rules.js DECLS). The letting-
// through wrapper (phase 3 and phase 11 with the runs again, §5.1b) is here too, around the pipeline, its pure pieces through.js's.

import { on } from './rules.js';
import { extent, isArea, hits, sharesCol, reaches, readingOrder, range, MAXCELL } from './geometry.js';
import { isElastic, rowsAt, restCells } from './size.js';
import { relink, remove, resize, follow, shift } from './gap.js';
import { explain } from './transition.js';
import { kindOf, judgeCarry, judgeWall } from './changes.js';
import { working, phase, aside, up, down, sinkAside, sep, rest, transitionFacts } from './primitives.js';
import { chosen, heldChange, past, against, pastMiddle, lineOf, canSwap, swapped, flipped, pressedOf } from './through.js';

/** @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Ctx} Ctx
 *  @typedef {import('./shapes.js').Change} Change @typedef {import('./shapes.js').Memory} Memory @typedef {import('./shapes.js').Result} Result
 *  @typedef {import('./shapes.js').Work} Work @typedef {import('./shapes.js').Transition} Transition @typedef {import('./shapes.js').Step} Step */

/** An empty carry memory (LAYOUT-RULES §6.D): an arrow's, a creation's, and every change that keeps none. @returns {Memory} */
export function emptyMemory() { return { away: false, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' }; }

// ---- small helpers over layouts: a box put back with the reading order rebuilt (INV-5), a box taken out of `boxes` only
function put(L, box) { const boxes = new Map(L.boxes); boxes.set(box.id, box); const order = readingOrder(boxes.values()); return { ...L, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }; }
const pad = (b) => (isArea(b) ? 1 : 0);
const bottomOf = (L) => { let m = 0; for (const b of L.boxes.values()) m = Math.max(m, extent(b).r1 + 1); return m; };
/** A box at a card width of `w − 1` cells, its height and temporary rows measured there (SIZE.6, through the passport); an area keeps the
 *  height its children give it (§5.6, settleTree's). */
function measured(box, w, ctx) {
  if (isArea(box)) return { ...box, w };
  const r = rowsAt({ ...box, w }, w - 1, ctx);
  return { ...box, w, h: r.shown, t: r.shown - r.rows };
}
/** The first two blocks that hit, in reading order, or null. */
function firstHit(L) {
  const ids = L.order;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (hits(L.boxes.get(ids[i]), L.boxes.get(ids[j]))) return [ids[i], ids[j]];
  return null;
}
/** The guard on a loop that must end (LAYOUT-RULES §1.5 `RESTSTEPS`): its blocks × its columns × 4, known before anything is measured. */
const stepsGuard = (L) => Math.max(1, L.boxes.size) * Math.max(1, L.cols) * 4;
class Failed extends Error {}
class Refused extends Error {}

/** Phase 1c: the moved block of a carry or a creation at its target, clamped to its container by DRAG.A3: its top at row 0 or lower (an
 *  area's frame at row 1), at the left edge every block stops; past the right edge a set width stops where it fits whole, and an elastic
 *  block narrows instead, down to min(natural width, MINC) and its kind's floor, then stops (`DRAG.A3.narrow`; off, every block stops). Its
 *  width is the target's (DRAG.A5 keeps the width the carry started with; off, the rest width at every target), and it is measured at the
 *  width it gets. @returns {Box} */
function atTarget(box, at, cols, ctx, fresh = false) {
  let w = at.w ?? box.w;
  if (!on(ctx.rules, 'DRAG.A5') && isElastic(box, ctx)) w = restCells({ cols, boxes: new Map(), order: [] }, { ...box, col: at.col, y: at.y, w }, ctx) + 1;
  let col = Math.max(0, at.col);
  const colMax = cols - w - pad(box);
  if (col > colMax) {
    if (isElastic(box, ctx) && on(ctx.rules, 'DRAG.A3.narrow')) {
      const floor = Math.max(ctx.kinds[box.kind].minCells(box, ctx.measure), Math.min(ctx.measure.natural(box.id), ctx.settings.MINC)) + 1;
      w = Math.max(floor, cols - col - pad(box));
    }
    col = Math.max(0, Math.min(col, cols - w - pad(box)));
  }
  const r = range({ ...box, w }, cols), placed = { ...box, col, y: Math.max(r.yMin, at.y) };
  return w === box.w && box.h != null && !fresh ? { ...placed, w } : measured(placed, w, ctx);   // only a new width, or a new block, is measured
}

/** The columns each block left and came into between two layouts, with why and how (GAP's inputs), from the geometry (transition.js
 *  `explain`): the moved block of a carry or a creation comes in `put` and leaves the columns it no longer covers `narrow` (M9), or, for an
 *  undo's carry back or a deleted block made again (`canonical`), leaves every column of base `away` and comes into every column it has
 *  `back`; the widened block of the width handle leaves `narrow` and comes in `self`; any other block leaves `narrow` when its width changed
 *  and `press` when it was pressed aside, and comes in `self`. */
function columnsOf(base, after, moved, how) {
  const g = explain(base, after), wOf = (L, id) => L.boxes.get(id)?.w;
  const leave = [], enter = [];
  if (how === 'canonical' && moved != null) {
    const B = base.boxes.get(moved), A = after.boxes.get(moved);
    if (B) for (let c = extent(B).c0; c <= extent(B).c1; c++) leave.push([moved, c, 'away']);
    if (A) for (let c = extent(A).c0; c <= extent(A).c1; c++) enter.push([moved, c, 'back']);
  }
  for (const [id, c] of g.left) {
    if (id === moved && how === 'canonical') continue;
    leave.push([id, c, id === moved || wOf(base, id) !== wOf(after, id) ? 'narrow' : 'press']);
  }
  for (const [id, c] of g.entered) {
    if (id === moved && how === 'canonical') continue;
    enter.push([id, c, id === moved && how === 'put' ? 'put' : 'self']);
  }
  return { leave, enter, reordered: g.reordered };
}

/** SETTLE in one container (LAYOUT-RULES §5): from `start`, the displayed layout a gesture or an edit starts from (for a carry, the layout at
 *  the start of the carry or at its last swap), the change, the gesture's memory and `ctx`, a layout satisfying INV-1 to INV-5 with its
 *  stacks found again, or `{ok: false, why: 'refused'}` (§5.5: the kind's containment, or a switched-off rule's fallback that is a refusal),
 *  or `{ok: false, why: 'failed'}` (a bound exceeded, or a transition RELINK refuses: a bug). This is the pipeline, phases 1–10, and the
 *  letting-through wrapper around it (phases 3 and 11) for a carry with THROUGH on. `moves` is the union of the steps every RELINK of this SETTLE was handed, for
 *  the dev look; `grew`, for a change inside an area (`change.box`), the change of the bottom its content reaches, in rows (settleTree's,
 *  §5.6); `ran`, the phases that ran, for the tests. @param {Layout} start @param {Change} change @param {?Memory} memory @param {Ctx} ctx
 *  @param {{trace?:(phase:string, layout:Layout, info?:{swap:string[]}) => void}} [hooks] the working layout after each phase of every
 *  run (phase 3: the swapped layout, with its pair), for the dev look and the tests @returns {Result} */
export function settle(start, change, memory, ctx, hooks = {}) {
  try { return wrapper(start, change, memory || emptyMemory(), ctx, hooks); }
  catch (e) {
    if (e instanceof Refused) return { ok: false, why: 'refused' };
    if (e instanceof Failed) return { ok: false, why: 'failed', errors: [e.message] };
    return { ok: false, why: 'failed', errors: [e.message] };
  }
}

/** The letting-through wrapper (LAYOUT-RULES §5.1b; step 2b-2, its representation by the architecture review of 0a262d7): for a carry with
 *  THROUGH on, phase 3 and phase 11 around the pipeline, with the runs again; any other change runs the pipeline once. Phase 3: a neighbour
 *  in the memory leaves it when it is gone or the target's row lies past the row the moved block is held at, on the side away from it;
 *  otherwise the pipeline runs at the target of the choice (`heldChange`), so the layout is the one the choice was made on, and then the
 *  neighbour leaves the memory if it no longer stands right against the moved block (carried sideways off it), or, when `frow` takes the
 *  moved block's leading edge past its middle, the two swap (`swapped`) if the neighbour keeps its side by `start` (`canSwap`; otherwise it
 *  leaves the memory and its middle judges it): the swap's own RELINK, with the result the pointer saw as its base, becomes `start` and
 *  the pipeline runs again from it, at most once for every neighbour swapped in this move. Phase 11, with no neighbour held: `pressed`,
 *  the first block touching the moved block's leading edge in the memory's direction, and, when the change says the hold ran out or Shift
 *  is held (`change.through`), that block into the memory (`chosen`) and the pipeline once more, held, at most once per move. Bounds
 *  exceeded are a failure (§5.5). */
function wrapper(start, change, memory, ctx, hooks) {
  const through = change.type === 'carry' && on(ctx.rules, 'THROUGH');
  // the direction of the last vertical move (§6.D): changed only when the target row changes, by its sign against the last target, read
  // before phase 2, so that a pointer held still or moved sideways keeps it; the memory returned carries this target as the last one
  // the first move of a carry against the block's place at its start (a move from it is a vertical move; step 2b, proposed)
  let mem = memory;
  const prevY = memory.lastTarget ? memory.lastTarget.y : change.type === 'carry' && change.at && start.boxes.has(change.id) ? start.boxes.get(change.id).y : null;
  if (change.at && prevY != null && change.at.y !== prevY) mem = { ...memory, dir: change.at.y > prevY ? 'down' : 'up' };
  const end = (r, s, m, pressed, ran) => {
    const { met, ...out } = r;
    return { ...out, start: s, memory: change.at ? { ...m, lastTarget: { ...change.at } } : m, pressed, ran };
  };
  if (!through) { const r = pipeline(start, change, mem, ctx, hooks, start); return end(r, start, r.memory, null, r.ran); }
  const g = change.id, last = mem.lastTarget, swappedWith = new Set(), guard = 4 * (start.boxes.size + 2);
  let s = start, chose = false, ran3 = false;
  const ranOf = (r) => { const out = r.ran.slice(), i = out.indexOf('2'); if (ran3) out.splice(i < 0 ? out.length : i + 1, 0, '3'); return [...out, '11']; };
  for (let k = 0; ; k++) {
    if (k > guard) throw new Failed('settle: the letting through does not end');
    let th = mem.through;
    if (th) { ran3 = true; if (!s.boxes.has(th.id) || past(th, change.at)) { mem = { ...mem, through: null }; th = null; } }
    const r = th ? pipeline(s, heldChange(change, th), { ...mem, lastTarget: th.last }, ctx, hooks, start) : pipeline(s, change, mem, ctx, hooks, start);
    if (th) {
      const row = against(r.layout, g, th);
      // carried off it (sideways, or it went elsewhere): it leaves the memory, the result the one with no neighbour (G19, the owner, 2026-11-13)
      if (row == null) { mem = { ...mem, through: null }; continue; }
      if (pastMiddle(r.layout, g, th, change.at)) {
        // a carry away, or a neighbour judged by its middle: released, and its middle judges it (step 2b-2, proposed)
        if (change.away || !canSwap(s, g, th.id, th.side)) { mem = { ...mem, through: null }; continue; }
        if (swappedWith.has(th.id)) throw new Failed('settle: a second swap with ' + th.id + ' in one move');
        swappedWith.add(th.id);
        const ws = swapped(r.layout, g, th, ctx, stepsGuard(r.layout));
        if (hooks.trace) hooks.trace('3', ws.L, { swap: [g, th.id] });
        const cl = columnsOf(r.layout, ws.L, g, 'put'), pass = [];
        for (const [c, p, q] of cl.reordered) {
          if (p === g || q === g) pass.push([g, c]);
          else if (p === th.id || q === th.id) pass.push([th.id, c]);
        }
        /** @type {Transition} */
        const T = { base: r.layout, after: ws.L, ...transitionFacts(ws, r.layout, { swap: [g, th.id] }), carried: g, leave: cl.leave, enter: cl.enter, pass };
        const rl = relink(T, ctx.rules);
        if (!rl.ok) throw new Failed('settle: RELINK refused the swap: ' + (rl.errors || []).join('; '));
        // the blocks met from the side are cleared at a swap (§6.D): the run again judges them anew
        s = rl.layout; mem = { ...r.memory, lastTarget: last, sides: new Map(), through: flipped(s, g, th, last, lineOf(r.layout, g, th)) };
        continue;
      }
      return end(r, s, { ...r.memory, through: { ...th, row } }, th.id, ranOf(r));
    }
    const pressed = pressedOf(r.layout, g, r.met, mem.dir || 'down');
    if (pressed && change.through && !chose) {
      chose = true;
      mem = { ...r.memory, lastTarget: last, through: chosen(r.layout, change, pressed, mem.dir || 'down', last) };
      continue;   // once more, held: the layout the choice was made on, and the swap test on it
    }
    return end(r, s, r.memory, pressed, ranOf(r));
  }
}

/** One run of phases 1–10 from `start`; `origin`, the start the caller gave settle, which `grew` counts from across the runs again (§5.6). */
function pipeline(start, change, memory, ctx, hooks, origin = start) {
  const kind = kindOf(change), rules = ctx.rules, ran = [];
  const g = kind.moved === 'none' ? null : change.id;
  let L = start;

  // ---- 1a (a wall's part): the container's new columns, and for an area's left edge `shift` (GAP.10), a stack operation, so in base
  if (change.type === 'wall') {
    ran.push('1a');
    L = { ...L, cols: change.cols };
    if (change.shift) L = shift(L, change.shift);
  }

  // ---- 1b. take away the block the change deletes, or the carried block when it is away (GAP.6)
  if (change.type === 'remove' || (change.type === 'carry' && change.away && L.boxes.has(change.id))) {
    ran.push('1b');
    if (!L.boxes.has(change.id)) throw new Failed('settle: no block ' + change.id);
    L = remove(L, change.id, rules);
  }
  // every RELINK of this SETTLE compares with base (GAP.5, INV-7 b); the sizes of 1a are in the working layout only, so that a width they
  // change is a column the block leaves or comes into in phase 8's transition, and a height a phase changed is no move (GAP's inputs)
  const base = L;

  // ---- 1a. the sizes the change sets, through `resize`; FOLLOW; the rest width of an elastic block whose content changed; FOLLOW again
  if (change.type === 'size') {
    ran.push('1a');
    const b0 = L.boxes.get(change.id); if (!b0) throw new Failed('settle: no block ' + change.id);
    const set = change.set || {}, b = { ...b0 };
    for (const f of ['ch', 'open', 'collapsed']) if (f in set) b[f] = set[f];
    if ('cw' in set) { if (set.cw == null) delete b.cw; else b.cw = set.cw; }
    let w = b.cw != null ? b.cw + 1 : b.w;
    if (isElastic(b, ctx)) w = restCells(L, b, ctx) + 1;   // its content changed: its rest width on the rows it stands on (SIZE.1)
    const nb = measured(b, w, ctx);
    L = follow(resize(put(L, { ...nb, h: b0.h, t: b0.t ?? 0 }), change.id, nb.h, nb.t ?? 0));
  }

  // ---- 1c. the moved block at its target, clamped, in no chain until phase 8
  const insert = g != null && kind.moved === 'target' && !base.boxes.has(g);
  if (g != null) {
    ran.push('1c');
    let box;
    if (change.type === 'create') {
      if (start.boxes.has(g)) throw new Failed('settle: a created block ' + g + ' is already there');
      box = { id: g, kind: change.kind, col: change.at.col, y: change.at.y, w: change.at.w, h: 1, t: 0 };
      if (change.set?.cw != null) { box.cw = change.set.cw; box.w = change.set.cw + 1; }
      if (change.set?.ch != null) box.ch = change.set.ch;
    } else box = (start.boxes.get(g)) && { ...start.boxes.get(g) };
    if (!box) throw new Failed('settle: no block ' + g);
    if (kind.moved === 'target') box = atTarget(box, { ...change.at, w: change.type === 'create' ? box.w : change.at.w }, L.cols, ctx, change.type === 'create');
    else {   // the width handle: the block itself at its new width (and for a left edge its new column), clamped to the container
      const col = change.col ?? box.col, w = Math.max(2, Math.min(change.cw + 1, L.cols - col - pad(box)));
      box = measured({ ...box, col, cw: w - 1 }, w, ctx);
    }
    L = put(L, box);
  }
  const ws = working(L, g, ctx, insert); ws.base = base;
  const trace = (name) => hooks.trace && hooks.trace(name, ws.L);
  trace('1');
  const changed = () => ws.L !== base;

  // ---- 2. sides: the kind's judge, once
  let judged = { side: new Map(), met: new Map(), sides: memory.sides };
  if (kind.judge === 'carry') { ran.push('2'); judged = judgeCarry(ws.L, start, change, memory, ctx); }
  else if (kind.judge === 'wall') { ran.push('2'); judged = { ...judgeWall(ws.L, change.type === 'wall' ? change : { type: 'width', id: g, side: change.side }), sides: memory.sides }; }
  const sideOf = (id) => judged.side.get(id);

  // ---- 4. press aside; a block with no room aside goes to its kind's branch: by its side (DRAG.B5, phases 5 and 6), or P-SINK (phase 6)
  const above = new Set([...judged.side].filter(([id, s]) => s === 'above' && !judged.met.has(id)).map(([id]) => id));
  const below = new Set([...judged.side].filter(([id, s]) => s === 'below' && !judged.met.has(id)).map(([id]) => id));
  const sinkers = [];
  if (judged.met.size) {
    ran.push('4'); phase(ws);
    for (const id of ws.order) {
      if (!judged.met.has(id) || !ws.L.boxes.has(id)) continue;
      const side = judged.met.get(id);
      // a wall presses a child past the last column back until its card ends there, and one left of column 0 until it stands at column 0
      const by = change.type === 'wall' ? (side === 'left' ? { c0: ws.L.cols, c1: ws.L.cols } : { c0: -1, c1: 0 }) : g;
      if (on(rules, 'P-ASIDE') && aside(ws, id, by, side)) continue;
      if (kind.noRoom === 'side') {
        if (!on(rules, 'DRAG.B5')) throw new Refused('DRAG.B5 off: no room aside');
        (sideOf(id) === 'above' ? above : below).add(id);
      } else if (kind.noRoom === 'sink') {
        if (!on(rules, 'P-SINK')) throw new Refused('P-SINK off: no room aside');
        sinkers.push(id);
      }
    }
  }

  if (judged.met.size) trace('4');
  // ---- 5. push up (P-UP); off, the blocks judged above are pushed down under the moved block instead, the transition declaring it
  // the switched-off rule whose fallback may put a block on the moved block's other side, declared in phase 8 when one did: P-UP off pushes
  // the blocks above under it (and a neighbour held there stays there, §5.1b), DRAG.B2.keep off judges by the middle alone
  const fallback = kind.judge !== 'carry' ? null : !on(rules, 'P-UP') ? 'P-UP' : !on(rules, 'DRAG.B2.keep') ? 'DRAG.B2.keep' : null;
  const under = new Set();
  if (g != null && above.size) {
    if (on(rules, 'P-UP')) { ran.push('5'); phase(ws); up(ws, above); }
    else {   // only the blocks P-UP would have moved: judged above and reaching the moved block (LAYOUT-RULES §5.3 «Reaches»)
      const X = ws.L.boxes.get(g);
      for (const id of above) if (reaches(ws.L.boxes.get(id), X, 'above')) { below.add(id); under.add(id); }
    }
  }

  trace('5');
  // ---- 6. push down (P-DOWN); then, for a kind that sinks what has no room aside, P-SINK
  if (g != null && below.size) { ran.push('6'); phase(ws); down(ws, below, under); }
  if (sinkers.length) { if (!ran.includes('6')) ran.push('6'); phase(ws); for (const id of sinkers) sinkAside(ws, id, { inside: change.type === 'wall' }); }

  trace('6');
  // ---- 7. separate (P-SEP), against the moved block by the sides of phase 2, elsewhere the lower one sinking; a kind that judges nothing
  // (a size, a deletion) runs 1a or 1b and 8–10 (§5.2): what its sizes leave is phase 9 (b)'s
  if (kind.judge !== 'none' && firstHit(ws.L)) {
    ran.push('7'); phase(ws);
    for (let k = 0, n = stepsGuard(ws.L); ; k++) {
      const h = firstHit(ws.L); if (!h) break;
      if (k > n) throw new Failed('settle: phase 7 does not end');
      sep(ws, h[0], h[1], sideOf);
    }
  }

  trace('7');
  // ---- 8. RELINK against base, with the facts of phases 1c–7. A kind that judges nothing (a size, a deletion) moves nothing in phases 2–7,
  // and what its sizes leave (a text at its floor on a neighbour, SIZE.1) is phase 9 (b)'s: it relinks once, in phase 9 (c), against base
  // (step 2b, proposed), as RELINK takes no layout where two blocks hit
  const deferred = kind.judge === 'none';
  let L8 = deferred ? ws.L : base, moves = new Map();
  if (!deferred && changed()) {
    ran.push('8');
    const how = change.canonical ? 'canonical' : kind.moved === 'target' ? 'put' : 'self';
    // an undo's carry back is put by its canonical row (GAP.5 rule 3): the row it stands at after the phases, its old cell's or lower where a
    // phase moved it (P-UP stands it under a block that now stands at its cell and cannot go up), never the row of the place it was carried
    // back from, which its box still holds (found by tests/layoutgestures.mjs)
    if (change.canonical && g != null && ws.L.boxes.has(g)) { const X = ws.L.boxes.get(g); if (X.yc !== X.y) { const boxes = new Map(ws.L.boxes); boxes.set(g, { ...X, yc: X.y }); ws.L = { ...ws.L, boxes }; } }
    const cl = columnsOf(base, ws.L, g, how);
    /** @type {Transition} */
    // the carried block is the moved block of a carry or a creation; the widened block of the width handle comes into its new columns by
    // itself and carries nothing (GAP's inputs)
    const T = { base, after: ws.L, ...transitionFacts(ws, base, { canonical: !!change.canonical }), carried: kind.moved === 'target' ? g : null, leave: cl.leave, enter: cl.enter, pass: [] };
    if (change.canonical) T.canonical = true;
    // the carried block passes the blocks the fallback put on its other side; an undo's carry back keeps no place to pass from (GAP's inputs)
    if (fallback && g != null && base.boxes.has(g) && !change.canonical) {
      const pass = cl.reordered.filter(([, p, q]) => p === g || q === g).map(([c]) => [g, c]);
      if (pass.length) { T.fallback = fallback; T.pass = pass; }
    }
    const r = relink(T, rules);
    if (!r.ok) throw new Failed('settle: RELINK refused phase 8: ' + (r.errors || []).join('; '));
    L8 = r.layout;
    if (hooks.trace) hooks.trace('8', L8);
    // phase 1c's move of the moved block, then every step the primitives took (Moved, for the dev look)
    const from = start.boxes.get(g), to = ws.L.boxes.get(g);
    if (from && to && to.y !== from.y) moves.set(g, [{ step: 0, by: 'change', rows: to.y - from.y }]);
    for (const [id, l] of ws.steps) moves.set(id, [...(moves.get(id) || []), ...l]);
  }

  // ---- 9. rest: (a) RESTPASSES passes of SIZE.8, (b) the hits left, by P-REST or P-SEP, within RESTSTEPS, (c) RELINK against the layout
  // after phase 8 with the moves of (b) only
  let La = L8;
  const passes = on(rules, 'SIZE.8') ? ctx.settings.RESTPASSES : 1;
  if (on(rules, 'SIZE.1')) for (let p = 0; p < passes; p++) {
    const before = La;
    for (const id of La.order) {
      const b = La.boxes.get(id); if (!b || !isElastic(b, ctx)) continue;
      const w = restCells(La, b, ctx) + 1; if (w === b.w) continue;
      const nb = measured(b, w, ctx);
      La = resize(put(La, { ...nb, h: b.h, t: b.t ?? 0 }), id, nb.h, nb.t ?? 0);
    }
    if (La !== before) La = follow(La); else break;
  }
  let final = La;
  const b9 = deferred ? base : L8;   // the layout phase 9 (c) relinks against
  const w9 = working(La, null, ctx); w9.base = b9;
  if (firstHit(w9.L)) {
    phase(w9);
    for (let k = 0, n = stepsGuard(w9.L); ; k++) {
      const h = firstHit(w9.L); if (!h) break;
      if (k > n) throw new Failed('settle: phase 9 (b) exceeds RESTSTEPS');
      if (!(on(rules, 'P-REST') && rest(w9, h[0], h[1]))) sep(w9, h[0], h[1]);
    }
  }
  if (hooks.trace) hooks.trace('9', w9.L);
  if (w9.L !== b9) {
    ran.push('9');
    const cl = columnsOf(b9, w9.L, null, 'self');
    const T = { base: b9, after: w9.L, ...transitionFacts(w9, b9), carried: null, leave: cl.leave, enter: cl.enter, pass: [] };
    const r = relink(T, rules);
    if (!r.ok) throw new Failed('settle: RELINK refused phase 9 (c): ' + (r.errors || []).join('; '));
    final = r.layout;
    for (const [id, l] of w9.steps) moves.set(id, [...(moves.get(id) || []), ...l]);
  }

  // ---- 10. contain: nothing moves here; a block past MAXCELL refuses the change, an area's own handle refuses to make it taller, any other
  // change inside an area reports how far its content's bottom moved (settleTree grows or shrinks the area, §5.6)
  ran.push('10');
  for (const b of final.boxes.values()) {
    if (extent(b).r1 + 1 > MAXCELL) throw new Refused('MAXCELL');
    // INV-4 across the columns: every card (an area with its free columns) inside the container; a wall that leaves a block it could not
    // press or sink inside stops (§5.4); no other kind leaves one outside, phase 1c having clamped the moved block
    const r = range(b, final.cols);
    if (b.col < r.colMin || b.col > r.colMax || b.y < r.yMin) throw new Refused('a block would stand outside its container (INV-4)');
  }
  if (hooks.trace) hooks.trace('10', final);
  const grown = change.box != null ? bottomOf(final) - bottomOf(origin) : 0;
  if (kind.contain.bottom === 'refuse' && grown > 0) throw new Refused('the handle would make the area taller');
  return { ok: true, layout: final, start, memory: { ...memory, sides: judged.sides || memory.sides }, pressed: null, moves, grew: grown, ran, met: judged.met };
}
