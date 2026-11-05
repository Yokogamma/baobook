// GAP (docs/LAYOUT-RULES.md §4): the stacks, the layout's memory. It is the only module that writes stacks. Its operations: GAP.1 stacks
// from places (`fromPlaces`), FOLLOW (`follow`), `resize`, the one writer of a box's h and t, RELINK (`relink`: leave, cap, adjust, stand,
// fresh, fit), a block taken away (`remove`, GAP.6), a uniform shift of the columns (`shift`, GAP.10), rule 5 alone (`fit`), `isHead`, and
// `check`, the invariants INV-1 to INV-3 that its tests and the dev look read. It is written from the executable model tests/lab/gap-model,
// which stays as the second implementation its tests compare with: every function below has its counterpart there, with the gap's rows kept
// as runs ({o, n}) instead of one owner per row, and the stacks kept on their blocks by stretches of columns (Box.above).
//
// Inside, an operation works on a private copy of a layout in the coordinates of GAP, where an area is its extent (§1.1): a block is its
// extent's columns c0…c1, its extent's top row y (displayed) and its canonical height h with its temporary rows e; every operation writes a
// new Layout and changes none it was given (stacks are replaced, never mutated).

import { on } from './rules.js';
import { extent, isArea, readingOrder, byId } from './geometry.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Stack} Stack
 *  @typedef {import('./shapes.js').Run} Run @typedef {import('./shapes.js').Rules} Rules @typedef {import('./shapes.js').Moved} Moved
 *  @typedef {import('./shapes.js').Carried} Carried */

// ---- runs: a gap's rows, in order, as {o, n}: n rows owned by o, or unowned (o null); normalised, so equal gaps have equal runs
const DROP = Symbol('drop');
function norm(runs) {
  const out = [];
  for (const r of runs) {
    if (!(r.n > 0)) continue;
    const p = out[out.length - 1];
    if (p && p.o === r.o) out[out.length - 1] = { o: p.o, n: p.n + r.n }; else out.push({ o: r.o, n: r.n });
  }
  return out;
}
const rlen = (runs) => runs.reduce((s, r) => s + r.n, 0);
const fill = (o, n) => (n > 0 ? [{ o, n }] : []);
const cat = (...rs) => norm(rs.flat());
function slice(runs, a, b = Infinity) {
  const out = []; let pos = 0;
  for (const r of runs) { const s = Math.max(a, pos), e = Math.min(b, pos + r.n); if (e > s) out.push({ o: r.o, n: e - s }); pos += r.n; }
  return norm(out);
}
/** every row's owner mapped by f, a row dropped where f returns DROP */
const remap = (runs, f) => norm(runs.flatMap((r) => { const o = f(r.o); return o === DROP ? [] : [{ o, n: r.n }]; }));

// ---- the working state of one operation: B the blocks, S the stacks by `${anchor}|${column}`
const key = (l, c) => l + '|' + c;
const colOf = (k) => +k.slice(k.lastIndexOf('|') + 1);
const anchorOf = (k) => k.slice(0, k.lastIndexOf('|'));
const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
const covers = (b, c) => b.c0 <= c && c <= b.c1;
const heirOf = (st) => st.u;
const isStand = (i) => i % 2 === 1;
const cloneStack = (st) => ({ u: st.u, parts: st.parts.map((p, i) => (isStand(i) ? { id: p.id, lend: p.lend.slice() } : p.slice())) });

/** A box in GAP's coordinates: its extent, its canonical height and its temporary rows. */
function gapBlock(b) {
  const e = extent(b), pad = isArea(b) ? 1 : 0, t = b.t || 0;
  if (!(Number.isInteger(b.h) && b.h - t >= 1)) throw new Error('gap: ' + b.id + ' has no height');
  return { id: b.id, c0: e.c0, c1: e.c1, y: b.y - pad, h: b.h - t + 2 * pad, e: t };
}
function toWork(layout) {
  const B = new Map(), S = new Map();
  for (const id of layout.order) {
    const b = layout.boxes.get(id); B.set(id, gapBlock(b));
    for (const s of b.above || []) for (let c = s.c0; c <= s.c1; c++) S.set(key(id, c), cloneStack(s.stack));
  }
  return { B, S, rules: null };
}
const copyWork = (W) => ({ B: new Map([...W.B].map(([k, b]) => [k, { ...b }])), S: new Map([...W.S].map(([k, st]) => [k, cloneStack(st)])), rules: W.rules });

// ---- the chain of one column: anchors from the top; and every element of it, anchors and standing blocks, in order
function chain(W, c) {
  const byU = new Map();
  for (const [k, st] of W.S) if (colOf(k) === c) byU.set(st.u, anchorOf(k));
  const out = []; let u = null;
  while (byU.has(u)) { const l = byU.get(u); out.push(l); u = l; if (out.length > W.B.size + 1) throw new Error('gap: a loop in column ' + c); }
  return out;
}
function seq(W, c) {   // [{id, st, i}]: i the index in st.parts for a standing block, -1 for the anchor of st
  const out = [];
  for (const l of chain(W, c)) { const st = W.S.get(key(l, c)); st.parts.forEach((p, i) => { if (isStand(i)) out.push({ id: p.id, st, i }); }); out.push({ id: l, st, i: -1 }); }
  return out;
}
const lowerOf = (W, x, c) => { for (const [k, st] of W.S) if (colOf(k) === c && st.u === x) return st; return null; };
const allCols = (W) => { const cs = new Set(); for (const b of W.B.values()) for (const c of cols(b)) cs.add(c); return [...cs].sort((a, b) => a - b); };

// ---- FOLLOW (GAP.4, INV-2): every block's row is the highest the stacks of all its columns allow, in a measure: one pass in the order of
// the chains (a block after every element before it in any of its columns), each block at the furthest cursor of its columns. A block in
// no chain stands at row 0, which a caller that keeps it elsewhere overrides
function rowsIn(W, measure) {
  const shown = measure === 'shown', H = (id) => { const b = W.B.get(id); return b.h + (shown ? b.e : 0); };
  const preds = new Map([...W.B.keys()].map((id) => [id, []])), succs = new Map([...W.B.keys()].map((id) => [id, []]));
  for (const c of allCols(W)) {
    let prev = null, gap = 0;
    for (const l of chain(W, c)) {
      const st = W.S.get(key(l, c));
      st.parts.forEach((p, i) => {
        if (!isStand(i)) { gap += rlen(p); return; }
        preds.get(p.id).push([prev, gap]); if (prev) succs.get(prev).push(p.id); prev = p.id; gap = 0;
      });
      preds.get(l).push([prev, gap]); if (prev) succs.get(prev).push(l); prev = l; gap = 0;
    }
  }
  const y = new Map(), indeg = new Map([...preds].map(([id, ps]) => [id, ps.filter(([p]) => p).length]));
  const ready = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  while (ready.length) {
    const id = ready.pop();
    y.set(id, preds.get(id).reduce((m, [p, gap]) => Math.max(m, (p ? y.get(p) + H(p) : 0) + gap), 0));
    for (const s of succs.get(id)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) ready.push(s); }
  }
  if (y.size !== W.B.size) throw new Error('gap: FOLLOW found a cycle');
  return y;
}
function followWork(W) { const y = rowsIn(W, 'shown'); for (const b of W.B.values()) b.y = y.get(b.id); }

// where each part of a stack lies, in a measure: its first and its last row plus one
function spans(W, st, measure = 'shown', ys = null) {
  const Y = (id) => (ys ? ys.get(id) : W.B.get(id).y), H = (b) => b.h + (measure === 'shown' ? b.e : 0);
  let cur = st.u == null ? 0 : Y(st.u) + H(W.B.get(st.u)); const out = [];
  st.parts.forEach((p, i) => {
    if (!isStand(i)) { out.push([cur, cur + rlen(p)]); cur += rlen(p); return; }
    const s = W.B.get(p.id), top = Math.max(cur, Y(s.id)); out.push([top, top + H(s)]); cur = top + H(s);
  });
  return out;
}

// ---- a block comes into column c (rules 3 and 4): carried or created there, at its displayed row; come in by itself, at its canonical row
// `ys`; byCanon: an undo putting it back, by its canonical row only (LAYOUT-ENGINE-PLAN §6.4)
function enter(W, x, c, ys = null, byCanon = false) {
  const shownH = (b) => b.h + b.e, Y = (b) => (ys ? ys.get(b.id) : b.y), H = (b) => b.h + (ys ? 0 : b.e);
  const inChain = new Set(seq(W, c).map((el) => el.id));   // the neighbours are those already in the column's chain (rule 3)
  const others = [...W.B.values()].filter((b) => b.id !== x.id && inChain.has(b.id))
    .sort((a, b) => (byCanon ? Y(a) - Y(b) : a.y - b.y) || byId(a.id, b.id));
  if (byCanon && others.some((b) => Y(b) < Y(x) + x.h && Y(x) < Y(b) + b.h)) throw new Error('gap: a canonical place overlaps');
  const below = byCanon ? others.find((b) => Y(b) >= Y(x) + x.h) : others.find((b) => b.y >= x.y + shownH(x));
  if (!below) {   // rule 4, fresh: x anchors a stack of its own, rows of the anchor above (unowned under the top)
    const above = byCanon ? others.filter((b) => Y(b) + b.h <= Y(x)).pop() : others.filter((b) => b.y + shownH(b) <= x.y).pop(), u = above ? above.id : null;
    W.S.set(key(x.id, c), { u, parts: [fill(u, Math.max(0, Y(x) - (above ? Y(above) + H(above) : 0)))] });
    return;
  }
  // rule 3, stand: in the stack that holds `below` (its own, or the one it stands in), in the seg just above it
  let st = W.S.get(key(below.id, c)), i;
  if (st) i = st.parts.length - 1; else { const f = seq(W, c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
  const [before, entry, after] = place(st.parts[i], Math.max(0, Y(x) - spans(W, st, ys ? 'canonical' : 'shown', ys)[i][0]), x);
  if (!on(W.rules, 'GAP.5.3')) {   // GAP.5.3 off: it cuts the stack, an anchor over the rows above it, the rows under it its own, no lend
    W.S.set(key(x.id, c), { u: st.u, parts: [...st.parts.slice(0, i), remap(before, (o) => (o === x.id ? heirOf(st) : o))] });
    st.u = x.id; st.parts = [fill(x.id, rlen(after)), ...st.parts.slice(i + 1)];
    return;
  }
  st.parts.splice(i, 1, before, entry, after);
}
// a standing block put at offset off from the start of the rows `rows`: the rows before it, its entry, the rows after it
function place(rows, off, x) {
  if (off < 0) throw new Error('gap: a collision above ' + x.id);
  if (off >= rlen(rows)) return [cat(rows, fill(x.id, off - rlen(rows))), { id: x.id, lend: [] }, []];   // the room above it is its own
  return [slice(rows, 0, off), { id: x.id, lend: slice(rows, off, off + x.h) }, slice(rows, off + x.h)];
}

// ---- x's rows in column c, wherever they lie (G2): those above it go; those under it go too, or, narrowed off with GAP.9 on (G8), become
// rows of the stack they lie in, its u's; in the stack whose u x is, the u that stack is about to get, x's own
function release(W, x, c, keep, heir) {
  let past = false;
  for (const l of chain(W, c)) {
    const st = W.S.get(key(l, c)), to = st.u === x.id ? heir : heirOf(st);
    const f = (seg) => remap(seg, (o) => (o !== x.id ? o : past && keep ? to : DROP));
    st.parts = st.parts.map((p, j) => {
      if (!isStand(j)) return f(p);
      const q = { id: p.id, lend: f(p.lend) }; if (p.id === x.id) past = true; return q;
    });
    if (l === x.id) past = true;
  }
}

// ---- a block leaves column c (deleted, carried away, narrowed or pressed off it): rule 2, by what `base` gave it there (hb, its height
// in base, and ys, the canonical rows of base)
function leave(W, x, c, why, ys) {
  const f = seq(W, c).find((el) => el.id === x.id); if (!f) return;
  const gap52 = on(W.rules, 'GAP.5.2'), keep = why === 'narrow' && on(W.rules, 'GAP.9');   // G8: narrowing is not deleting
  release(W, x, c, keep, heirOf(f.st));
  if (f.i >= 0) {   // standing: its lend comes back between the segs round it, whatever made it leave (S8); with GAP.5.2 off it goes with it
    const { st, i } = f;
    st.parts.splice(i - 1, 3, cat(st.parts[i - 1], gap52 ? st.parts[i].lend : [], st.parts[i + 1]));
    return;
  }
  const mine = f.st; W.S.delete(key(x.id, c));
  const L = lowerOf(W, x.id, c);
  // GAP.5.2 off: the stack of the block that went loses its rows, the blocks standing in it stand on with no lends, whether it joins the
  // stack under it or, under the last anchor, its lowest standing block takes its place
  const gone = (p, j) => (gap52 ? p : !isStand(j) ? [] : { id: p.id, lend: [] });
  if (L) {   // join: the stack above x and the stack under it become one
    const up = mine.parts.slice(), last = up.pop();
    // narrowed off: what its body stood on and its slack there stay, measured canonically, so that no temporary height is written
    const slack = keep ? ys.get(x.id) - spans(W, mine, 'canonical', ys)[mine.parts.length - 1][1] : 0;
    const body = keep ? fill(heirOf(mine), x.h + slack) : [];   // x.h: its height in base, rule 2 running before the heights of after
    L.u = mine.u; L.parts = [...up.map(gone), cat(gone(last, 0), body, L.parts[0]), ...L.parts.slice(1)];
  } else if (mine.parts.length > 1) {   // the last anchor: the lowest block standing in its stack becomes the stack's anchor, the others
    // stand on in it; its lend and the rows under it go (GAP.3), and the room above it that was its own becomes the gap's
    const k = mine.parts.length - 2, s = mine.parts[k], to = heirOf(mine), g = (seg) => remap(seg, (o) => (o === s.id ? to : o));
    W.S.set(key(s.id, c), { u: mine.u, parts: mine.parts.slice(0, k).map((p, j) => (!isStand(j) ? g(p) : { id: p.id, lend: g(p.lend) })).map(gone) });
  }
}

// ---- G7, `cap`: what a standing block covers is never more than its canonical height; RELINK runs it after rule 2 (GAP.4)
function capAll(W) {
  for (const st of W.S.values()) st.parts.forEach((p, j) => {
    if (!isStand(j)) return;
    const h = W.B.get(p.id).h; if (rlen(p.lend) > h) st.parts[j] = { id: p.id, lend: slice(p.lend, 0, h) };
  });
}

// ---- rule 1, adjust: blocks moved by d rows in one step. Per column, each run of chain blocks that moved together keeps everything inside
// it; only the gap above the run and the gap under it change (LAYOUT-RULES GAP.5 rule 1; the model's moveIn)
function moveIn(W, c, ids, d) {
  const q = seq(W, c), moved = q.map((el) => ids.has(el.id)), runs = [];
  for (let a = 0; a < q.length; a++) {   // every run, with its two gaps and its slack, read before anything changes
    if (!moved[a] || (a > 0 && moved[a - 1])) continue;
    let z = a; while (z + 1 < q.length && moved[z + 1]) z++;
    const top = q[a], bot = q[z], ust = top.st, ui = top.i >= 0 ? top.i - 1 : ust.parts.length - 1;
    const [lst, li] = bot.i >= 0 ? [bot.st, bot.i + 1] : [lowerOf(W, bot.id, c), 0];
    const slack = W.B.get(top.id).y - spans(W, ust)[ui][1];
    runs.push({ r: top.id, head: a === 0, run: new Set(q.slice(a, z + 1).map((el) => el.id)), ust, ui, lst, li, sameStack: top.i >= 0 && lst === ust, holds: slack === 0, slack });
    a = z;
  }
  const gap51 = on(W.rules, 'GAP.5.1'), gap8 = on(W.rules, 'GAP.8');
  for (const { r, head, run, ust, ui, lst, li, sameStack, holds, slack } of runs) {
    if (d > 0) {
      let k = d, got = 0;
      if (lst) {   // the gap under the run loses d rows: first rows of the run's blocks wherever they lie in it, then from its top
        const seg = []; for (const p of lst.parts[li]) {
          if (k > 0 && run.has(p.o)) { const m = Math.min(k, p.n); k -= m; got += m; if (p.n > m) seg.push({ o: p.o, n: p.n - m }); } else seg.push(p);
        }
        const t = Math.min(k, rlen(seg)); lst.parts[li] = slice(norm(seg), t); got += t;
      }
      const grow = sameStack ? cat(fill(heirOf(ust), got), fill(r, holds ? d - got : 0)) : fill(heirOf(ust), holds ? d : 0);
      ust.parts[ui] = cat(ust.parts[ui], grow);
    } else {
      const k = -d, used = Math.min(k, slack), seg = ust.parts[ui], n = Math.min(rlen(seg), k - used);
      const left = slice(seg, rlen(seg) - n); ust.parts[ui] = slice(seg, 0, rlen(seg) - n);
      if (lst) {
        // the owners of what comes under the run: its top's own, the rows it left with theirs (G5, S7, G6/GAP.8); with GAP.5.1 off, rows
        // of the stack they come into, its u's, free room staying free; the lengths are the same either way
        const into = heirOf(lst), mine = !gap51 ? (head ? null : into) : head && !gap8 ? null : r;
        const owner = (o) => (!gap51 ? (o === null ? null : into) : o === null && head ? mine : o);
        lst.parts[li] = cat(fill(mine, used), remap(left, owner), lst.parts[li]);
      }
    }
  }
}

// ---- rule 5, fit: a block SETTLE put lower than FOLLOW over the stacks puts it gets, in its binding stack, the rows it lacks, owned by that
// stack's u; one FOLLOW puts lower stays there: no stack is cut. targets: id → displayed row in GAP's coordinates; reading order (INV-5)
function fitWork(W, targets) {
  const order = [...targets.keys()].filter((id) => W.B.has(id))
    .sort((a, b) => W.B.get(a).y - W.B.get(b).y || W.B.get(a).c0 - W.B.get(b).c0 || byId(a, b));
  for (const id of order) {
    const x = W.B.get(id), t = targets.get(id); if (t <= x.y) continue;
    for (const c of cols(x)) {
      const f = seq(W, c).find((el) => el.id === id); if (!f) continue;
      const st = f.st, i = f.i >= 0 ? f.i - 1 : st.parts.length - 1;
      if (x.y === spans(W, st)[i][1]) { st.parts[i] = cat(st.parts[i], fill(heirOf(st), t - x.y)); break; }
    }
    followWork(W);
  }
}

// ---- writing a layout back: the rows FOLLOW gives in both measures, frame rows for an area; the stacks by stretches of equal columns
function stretchesOf(W, id) {
  const mine = [...W.S.entries()].filter(([k]) => anchorOf(k) === id).map(([k, st]) => [colOf(k), st]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [c, st] of mine) {
    const p = out[out.length - 1], frozen = freeze(st);
    if (p && p.c1 === c - 1 && same(p.stack, frozen)) out[out.length - 1] = { c0: p.c0, c1: c, stack: p.stack };
    else out.push({ c0: c, c1: c, stack: frozen });
  }
  return out;
}
const freeze = (st) => Object.freeze({ u: st.u, parts: Object.freeze(st.parts.map((p, i) => Object.freeze(isStand(i) ? { id: p.id, lend: Object.freeze(p.lend.map((r) => Object.freeze({ ...r }))) } : p.map((r) => Object.freeze({ ...r }))))) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The layout `from` with W's rows and stacks: boxes as `from` has them, every row and stack from W. */
function toLayout(W, from) {
  const shown = rowsIn(W, 'shown'), canon = rowsIn(W, 'canonical'), boxes = new Map();
  for (const [id, b] of from.boxes) {
    if (!W.B.has(id)) continue;
    const pad = isArea(b) ? 1 : 0;
    boxes.set(id, { ...b, y: shown.get(id) + pad, yc: canon.get(id) + pad, above: stretchesOf(W, id) });
  }
  return layoutOf(from, boxes);
}
const layoutOf = (from, boxes) => {
  const order = readingOrder(boxes.values());
  return { cols: from.cols, measure: from.measure, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order, areas: from.areas || new Map() };
};
const work = (layout, rules) => { const W = toWork(layout); W.rules = rules; return W; };

// ====================================================================== the operations
/** GAP.1 Stacks from places: in every column, top to bottom by its canonical rows, every block an anchor whose stack holds the rows from the
 *  block above (or the top) to it, owned by the block above, unowned under the top; nothing stands yet. Then FOLLOW. Places that overlap are
 *  a caller's bug (open()'s separation comes first). @param {Layout} layout @returns {Layout} */
export function fromPlaces(layout) {
  const W = { B: new Map(), S: new Map(), rules: null };
  for (const id of layout.order) { const b = layout.boxes.get(id); W.B.set(id, gapBlock({ ...b, y: b.yc ?? b.y })); }
  for (const c of allCols(W)) {
    const col = [...W.B.values()].filter((b) => covers(b, c)).sort((a, b) => a.y - b.y || byId(a.id, b.id));
    let u = null;
    for (const b of col) {
      const n = b.y - (u == null ? 0 : W.B.get(u).y + W.B.get(u).h);
      if (n < 0) throw new Error('gap: places overlap at ' + b.id);
      W.S.set(key(b.id, c), { u, parts: [fill(u, n)] }); u = b.id;
    }
  }
  return toLayout(W, layout);
}

/** FOLLOW: every row from the stacks (INV-2), y in the layout's measure and yc in the canonical one; no stack changes. @returns {Layout} */
export function follow(layout) { return toLayout(work(layout, null), layout); }

/** The one writer of a box's height: h its rows in the layout's measure, t those of them that are temporary (h − t its canonical height).
 *  It cuts no lend: G7 is RELINK's, against the heights it ends with (GAP.4). No FOLLOW. @returns {Layout} */
export function resize(layout, id, h, t = 0) {
  if (!(Number.isInteger(h) && Number.isInteger(t) && t >= 0 && h - t >= 1)) throw new Error('gap: a height must leave one canonical row');
  const b = layout.boxes.get(id); if (!b) throw new Error('gap: no block ' + id);
  const boxes = new Map(layout.boxes); boxes.set(id, { ...b, h, t });
  return { ...layout, boxes };
}

/** The steps of `moves` in order: [ids, rows] per step counter, a step being rigid (LAYOUT-RULES GAP's inputs). */
function stepsOf(moves) {
  const byStep = new Map();
  const entries = moves instanceof Map ? [...moves] : Object.entries(moves || {});
  for (const [id, list] of entries) for (const s of list) {
    const e = byStep.get(s.step);
    if (e && e.rows !== s.rows) throw new Error('gap: step ' + s.step + ' is not rigid');
    if (e) e.ids.add(id); else byStep.set(s.step, { ids: new Set([id]), rows: s.rows });
  }
  return [...byStep].sort((a, b) => a[0] - b[0]).map(([, e]) => [e.ids, e.rows]).filter(([, d]) => d !== 0);
}

// rule 1 for every step, each measured at the rows it starts from: FOLLOW after each, a block in no chain keeping the row its steps give it
function adjustWork(W, steps) {
  const row = new Map([...W.B.values()].map((b) => [b.id, b.y]));
  for (const [ids, d] of steps) {
    const cs = new Set(); for (const id of ids) if (W.B.has(id)) for (const c of cols(W.B.get(id))) cs.add(c);
    for (const c of [...cs].sort((a, b) => a - b)) moveIn(W, c, ids, d);
    for (const id of ids) if (row.has(id)) row.set(id, row.get(id) + d);
    followWork(W);
    const inChain = new Set(); for (const c of allCols(W)) for (const el of seq(W, c)) inChain.add(el.id);
    for (const b of W.B.values()) if (!inChain.has(b.id)) b.y = row.get(b.id);
  }
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);   // ids may hold any character, so never join() them

/** The blocks of a column whose place in the chain differs between base and after (a swap, a block carried or moved past a neighbour,
 *  GAP.5): the fewest that explain the change, a block that moved before any that did not, the carried block first of all. That is the
 *  heaviest subsequence of after's order that keeps base's order, a block that did not move weighing more than every block that did, a
 *  block of `moves` more than the carried one; the blocks out of it are displaced. @param {Map<string,number>} weightOf */
function displaced(W, c, afterOrder, weightOf) {
  const inAfter = new Set(afterOrder), was = seq(W, c).map((el) => el.id).filter((id) => inAfter.has(id));
  const inBase = new Set(was), now = afterOrder.filter((id) => inBase.has(id));
  if (sameList(was, now)) return [];
  const pos = new Map(was.map((id, i) => [id, i])), idx = now.map((id) => pos.get(id)), wt = (id) => weightOf(id, now.length);
  const best = now.map(wt), prev = now.map(() => -1);
  for (let i = 0; i < now.length; i++) for (let j = 0; j < i; j++) if (idx[j] < idx[i] && best[j] + wt(now[i]) > best[i]) { best[i] = best[j] + wt(now[i]); prev[i] = j; }
  let k = 0; for (let i = 1; i < now.length; i++) if (best[i] > best[k]) k = i;
  const keep = new Set(); while (k >= 0) { keep.add(now[k]); k = prev[k]; }
  return now.filter((id) => !keep.has(id));
}

// rule 2 for every block of `out` (id → the columns it leaves), column by column, each column's blocks top to bottom in its chain as it stands
function departAll(V, out, whyOf, ys) {
  const byCol = new Map();
  for (const [id, cs] of out) for (const c of cs) { if (!byCol.has(c)) byCol.set(c, new Set()); byCol.get(c).add(id); }
  for (const c of [...byCol.keys()].sort((a, b) => a - b)) {
    const order = seq(V, c).map((el) => el.id).filter((id) => byCol.get(c).has(id));
    for (const id of order) leave(V, V.B.get(id), c, whyOf(id), ys);
  }
}

/** GAP.5 RELINK, in one container: the stacks of `after`, a layout SETTLE made from `base` (its rows are targets), with `moves` the steps that
 *  moved its blocks. A block of base missing from after is taken away first, by GAP.6, as phase 1b does. Then, in each column: every block
 *  that left it, top to bottom in its chain (rule 2, by what base gave it); `cap` against after's heights (G7); the steps of `moves` (rule 1),
 *  the first measured at the rows FOLLOW gives over base's stacks with after's heights; every block that came into it, top to bottom (rules 3
 *  and 4): at its displayed target the carried block, a created one (not in base) and a block in a column whose chain it passed in;
 *  by its canonical row in every column the carried block of an undo ({id, canonical: true}), which leaves all its columns for it; every
 *  other at its reference (rule 1 replayed on a copy of base's stacks, every block keeping its columns but those it passed in, then
 *  canonical FOLLOW); then rule 5 and FOLLOW, whose rows are the result. The carried block leaves as carried away, every other block as
 *  narrowed or pressed off.
 *  @param {Layout} base @param {Layout} after @param {Map<string,Moved>|Object<string,Moved>} moves @param {?(string|Carried)} carried
 *  @param {Rules} rules @returns {Layout} */
export function relink(base, after, moves, carried, rules) {
  const cid = carried == null ? null : typeof carried === 'string' ? carried : carried.id, canonical = !!(carried && carried.canonical);
  let b0 = base; for (const id of base.order) if (!after.boxes.has(id)) b0 = remove(b0, id, rules);
  const W = work(b0, rules), steps = stepsOf(moves);
  const tgt = new Map(); for (const id of after.order) tgt.set(id, gapBlock(after.boxes.get(id)));   // after, in GAP's coordinates: rows are targets
  const canonTarget = (id) => { const b = after.boxes.get(id); return (b.yc ?? b.y) - (isArea(b) ? 1 : 0); };
  const setHeights = (V) => { for (const [id, t] of tgt) if (V.B.has(id)) { const b = V.B.get(id); b.h = t.h; b.e = t.e; } };
  const why = (id) => (id === cid ? 'away' : 'narrow');
  const ys = rowsIn(W, 'canonical');   // the canonical rows of base, by which rule 2 measures
  // who leaves and who comes into which column; who passed whom in a column's chain
  const afterCols = new Map(); for (const [id, t] of tgt) for (const c of cols(t)) { if (!afterCols.has(c)) afterCols.set(c, []); afterCols.get(c).push(id); }
  for (const list of afterCols.values()) list.sort((a, b) => tgt.get(a).y - tgt.get(b).y || byId(a, b));
  const out = new Map(), into = new Map(), passed = new Map();   // id → columns it leaves, comes into, passed another block in
  const add = (m, id, c) => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(c); };
  for (const b of W.B.values()) { const t = tgt.get(b.id); for (const c of cols(b)) if (!covers(t, c)) add(out, b.id, c); }
  for (const [id, t] of tgt) { const b = W.B.get(id); for (const c of cols(t)) if (!b || !covers(b, c)) add(into, id, c); }
  const moving = new Set(); for (const [ids] of steps) for (const id of ids) moving.add(id);
  const weightOf = (id, n) => (id === cid ? 1 : moving.has(id) ? n + 1 : (n + 1) * (n + 1));
  for (const [c, list] of afterCols) for (const id of displaced(W, c, list, weightOf)) { add(out, id, c); add(into, id, c); add(passed, id, c); }
  if (canonical && W.B.has(cid)) { for (const c of cols(W.B.get(cid))) add(out, cid, c); for (const c of cols(tgt.get(cid))) add(into, cid, c); }
  const rowOf = (id) => tgt.get(id).y, c0Of = (id) => (W.B.has(id) ? W.B.get(id).c0 : tgt.get(id).c0);
  const arrivals = [...into.keys()].sort((a, b) => rowOf(a) - rowOf(b) || c0Of(a) - c0Of(b) || byId(a, b));
  // the rows each step starts from: FOLLOW over base's stacks with after's heights, since a height a phase changed is no move
  const S = copyWork(W); setHeights(S); const start = rowsIn(S, 'shown');
  // every arrival's reference, on a copy: the blocks that passed others in a column out of it, so that they push nothing they passed
  const R = copyWork(W), inR = new Map();
  for (const [id, cs] of passed) inR.set(id, cs);
  if (canonical && R.B.has(cid)) inR.set(cid, new Set(cols(R.B.get(cid))));
  departAll(R, inR, why, ys);
  setHeights(R); for (const b of R.B.values()) b.y = start.get(b.id);
  adjustWork(R, steps); const ref = rowsIn(R, 'canonical');
  // rule 2, column by column, top to bottom in each chain
  departAll(W, out, why, ys);
  // the heights and columns of after (a new block at its target, in no chain yet); G7 for every block still standing; rule 1
  for (const [id, t] of tgt) if (!W.B.has(id)) W.B.set(id, { ...t });
  setHeights(W); for (const [id, t] of tgt) { const b = W.B.get(id); b.c0 = t.c0; b.c1 = t.c1; }
  capAll(W);
  for (const b of W.B.values()) if (start.has(b.id)) b.y = start.get(b.id);
  adjustWork(W, steps);
  // rules 3 and 4, top to bottom, every block at the row SETTLE gave it
  const now = rowsIn(W, 'canonical');
  for (const b of W.B.values()) b.y = tgt.get(b.id).y;
  for (const id of arrivals) {
    const x = W.B.get(id), list = [...into.get(id)].sort((a, b) => a - b), mine = passed.get(id) || new Set();
    if (id === cid && canonical) { const ys2 = new Map(now); ys2.set(id, canonTarget(id)); for (const c of list) enter(W, x, c, ys2, true); continue; }
    const onScreen = id === cid || !base.boxes.has(id);   // carried, or created: measured on the screen, as the user aims at what is shown
    now.set(id, base.boxes.has(id) ? ref.get(id) : canonTarget(id));
    for (const c of list) { if (onScreen || mine.has(c)) enter(W, x, c); else enter(W, x, c, now); }
  }
  followWork(W);
  // rule 5: the moved blocks and the carried one, to the rows SETTLE gave them
  const fits = new Map(); for (const [ids] of steps) for (const id of ids) if (tgt.has(id)) fits.set(id, tgt.get(id).y);
  if (cid != null && tgt.has(cid)) fits.set(cid, tgt.get(cid).y);
  fitWork(W, fits);
  return toLayout(W, after);
}

/** Rule 1 alone, every block keeping its columns: the steps of `moves`, each measured at the rows it starts from, then FOLLOW. RELINK runs it
 *  between rule 2 and rule 3; alone it is the lab model's `move`, and what step 1 tests rule 1 by. @returns {Layout} */
export function adjust(layout, moves, rules) {
  const W = work(layout, rules); adjustWork(W, stepsOf(moves)); return toLayout(W, layout);
}

/** GAP.6 A block taken away (deleted, or carried away in phase 1b): rule 2 in every column it covered, then FOLLOW. @returns {Layout} */
export function remove(layout, id, rules) {
  const W = work(layout, rules), x = W.B.get(id); if (!x) throw new Error('gap: no block ' + id);
  const ys = rowsIn(W, 'canonical');
  for (const c of cols(x)) leave(W, x, c, 'delete', ys);
  W.B.delete(id);
  const boxes = new Map(layout.boxes); boxes.delete(id);
  return toLayout(W, { ...layout, boxes });
}

/** Rule 5 alone: targets, id → displayed row of the box (a frame row for an area). @returns {Layout} */
export function fit(layout, targets, rules) {
  const W = work(layout, rules), t = new Map();
  for (const [id, y] of targets instanceof Map ? targets : Object.entries(targets)) t.set(id, y - (isArea(layout.boxes.get(id)) ? 1 : 0));
  fitWork(W, t);
  return toLayout(W, layout);
}

/** GAP.10 A uniform shift of every block's columns by k, every stack moving with its columns: nothing leaves or comes in, so every owner and
 *  lend stays. It checks no containment: an area's left side handle passes through columns left of 0 before its wall presses the children
 *  back (phase 4), and phase 10 checks INV-4. @returns {Layout} */
export function shift(layout, k) {
  const boxes = new Map();
  for (const [id, b] of layout.boxes) boxes.set(id, { ...b, col: b.col + k, above: (b.above || []).map((s) => ({ c0: s.c0 + k, c1: s.c1 + k, stack: s.stack })) });
  return follow(layoutOf(layout, boxes));
}

/** Whether a block is a head block: the first of the chain in every column of its extent (LAYOUT-RULES §1.3). */
export function isHead(layout, id) {
  const W = work(layout, null), x = W.B.get(id);
  return cols(x).every((c) => { const q = seq(W, c); return q.length > 0 && q[0].id === id; });
}

/** The ids of a column's chain, top to bottom, anchors and standing blocks. */
export function columnChain(layout, c) { return seq(work(layout, null), c).map((el) => el.id); }

/** A stack as the lab model prints it: «u | runs [stand:lend] runs |», '_' for unowned rows, '·' for an empty seg. */
export function showStack(st) {
  const runs = (seg) => seg.map((r) => (r.o == null ? '_' : r.o) + r.n).join('+') || '·';
  return (st.u || 'top') + ' | ' + st.parts.map((p, i) => (isStand(i) ? `[${p.id}:${runs(p.lend)}]` : runs(p))).join(' ') + ' |';
}
/** The stack of anchor l in column c, or null. */
export function stackAt(layout, l, c) {
  const b = layout.boxes.get(l); if (!b) return null;
  const s = (b.above || []).find((x) => x.c0 <= c && c <= x.c1); return s ? s.stack : null;
}

/** INV-1 in both measures, the canonical rows never below the displayed ones, INV-3 (the chains are the blocks of each column in row order,
 *  every owner covers its column, no lend longer than its block's canonical height) and INV-2 (the rows are FOLLOW's). @returns {string[]} */
export function check(layout) {
  const errs = [];
  let W; try { W = work(layout, null); } catch (e) { return ['unreadable: ' + e.message]; }
  // the stacks' shape first, so that a stale or broken stack is reported, never thrown: every stack's anchor and u in its column, its parts
  // alternating seg and stand, every stand a block of the layout in that column, every stack reached from the top of its column
  const stackCols = new Set();
  for (const [k, st] of W.S) {
    const l = anchorOf(k), c = colOf(k); stackCols.add(c);
    if (!W.B.has(l) || !covers(W.B.get(l), c)) errs.push(`stack ${k}: ${l} does not cover column ${c}`);
    if (st.u != null && !(W.B.has(st.u) && covers(W.B.get(st.u), c))) errs.push(`stack ${k}: its u ${st.u} is not in column ${c}`);
    if (!Array.isArray(st.parts) || st.parts.length % 2 !== 1) { errs.push(`stack ${k}: its parts do not alternate seg and stand`); continue; }
    st.parts.forEach((p, i) => {
      if (!isStand(i)) { if (!Array.isArray(p)) errs.push(`stack ${k}: part ${i} is no seg`); return; }
      if (!p || !W.B.has(p.id) || !covers(W.B.get(p.id), c)) errs.push(`stack ${k}: a stand of ${p && p.id}, which is not in column ${c}`);
    });
  }
  if (!errs.length) for (const c of stackCols) {
    let reached; try { reached = new Set(chain(W, c)); } catch (e) { errs.push(e.message); continue; }
    for (const k of W.S.keys()) if (colOf(k) === c && !reached.has(anchorOf(k))) errs.push(`stack ${k}: not reached from the top of column ${c}`);
  }
  if (errs.length) return errs;
  let yc, ys; try { yc = rowsIn(W, 'canonical'); ys = rowsIn(W, 'shown'); } catch (e) { return [e.message]; }
  const bs = [...W.B.values()];
  for (const [name, y, hh] of [['displayed', (b) => ys.get(b.id), (b) => b.h + b.e], ['canonical', (b) => yc.get(b.id), (b) => b.h]])
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j];
      if (a.c0 <= b.c1 && b.c0 <= a.c1 && y(a) < y(b) + hh(b) && y(b) < y(a) + hh(a)) errs.push(`overlap ${a.id} ${b.id} (${name})`); }
  for (const b of bs) {
    if (yc.get(b.id) > ys.get(b.id)) errs.push(`canonical row of ${b.id} below its displayed row`);
    const box = layout.boxes.get(b.id), pad = isArea(box) ? 1 : 0;
    if (box.y !== ys.get(b.id) + pad || (box.yc ?? box.y) !== yc.get(b.id) + pad) errs.push(`row of ${b.id} is not FOLLOW's`);
  }
  for (const c of allCols(W)) {
    const got = seq(W, c).map((el) => el.id), want = bs.filter((b) => covers(b, c)).sort((a, b) => ys.get(a.id) - ys.get(b.id) || byId(a.id, b.id)).map((b) => b.id);
    if (!sameList(got, want)) errs.push(`column ${c}: chain ${JSON.stringify(got)} ≠ blocks ${JSON.stringify(want)}`);
  }
  for (const [k, st] of W.S) {
    const c = colOf(k), rows = st.parts.flatMap((p, i) => (isStand(i) ? p.lend : p));
    for (const r of rows) if (r.o !== null && !(W.B.has(r.o) && covers(W.B.get(r.o), c))) { errs.push(`stack ${k}: rows of ${r.o}, which is not in column ${c}`); break; }
    st.parts.forEach((p, i) => { if (isStand(i) && rlen(p.lend) > W.B.get(p.id).h) errs.push('lend over height ' + p.id); });
  }
  return errs;
}
