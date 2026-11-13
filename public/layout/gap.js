// GAP (docs/LAYOUT-RULES.md §4): the stacks, the layout's memory. It is the only module that writes stacks. Its operations: GAP.1 stacks
// from places (`fromPlaces`), FOLLOW (`follow`), `resize`, the one writer of a box's h and t, RELINK (`relink`: on a transition SETTLE
// declares, checked first by transition.js; leave, cap, adjust, stand, fresh, fit), rule 1 alone (`adjust`), a block taken away (`remove`,
// GAP.6), a uniform shift of the columns (`shift`, GAP.10), rule 5 alone (`fit`), `isHead`, and `check`, the invariants INV-1 to INV-3 that
// its tests and the dev look read. It is written from the executable model tests/lab/gap-model,
// which stays as the second implementation its tests compare with: every function below has its counterpart there, with the gap's rows kept
// as runs ({o, n}) instead of one owner per row, and the stacks kept on their blocks by stretches of columns (Box.above).
//
// Inside, an operation works on a private copy of a layout in the coordinates of GAP, where an area is its extent (§1.1): a block is its
// extent's columns c0…c1, its extent's top row y (displayed) and its canonical height h with its temporary rows e; every operation writes a
// new Layout and changes none it was given (stacks are replaced, never mutated).

import { on, DEFAULT } from './rules.js';
import { extent, isArea, readingOrder, byId } from './geometry.js';
import { checkTransition } from './transition.js';

/** @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Layout} Layout @typedef {import('./shapes.js').Stack} Stack
 *  @typedef {import('./shapes.js').Run} Run @typedef {import('./shapes.js').Rules} Rules @typedef {import('./shapes.js').Moved} Moved
 *  @typedef {import('./shapes.js').Transition} Transition @typedef {import('./shapes.js').Relinked} Relinked */

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
/** the owner of row i of a gap, or undefined past its end */
function rowAt(runs, i) { let pos = 0; for (const r of runs) { if (i < pos + r.n) return r.o; pos += r.n; } return undefined; }
const allOwned = (runs, o) => runs.every((r) => r.o === o);
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
/** The stacks of a working state, keyed by key(anchor, column), with an index by column and by anchor kept with every set and delete, so
 *  that a column's chain and a block's stretches read only their own stacks (LAYOUT-ENGINE-PLAN §4.5: RELINK linear in the stacks). */
class Stacks extends Map {
  constructor(entries = null) { super(); this.byCol = new Map(); this.byAnchor = new Map(); if (entries) for (const [k, v] of entries) this.set(k, v); }
  set(k, v) {
    const c = colOf(k), l = anchorOf(k);
    let m = this.byCol.get(c); if (!m) this.byCol.set(c, (m = new Map())); m.set(k, v);
    let a = this.byAnchor.get(l); if (!a) this.byAnchor.set(l, (a = new Map())); a.set(k, v);
    return super.set(k, v);
  }
  delete(k) {
    if (!super.has(k)) return false;
    const c = colOf(k), l = anchorOf(k), m = this.byCol.get(c), a = this.byAnchor.get(l);
    m.delete(k); if (!m.size) this.byCol.delete(c);
    a.delete(k); if (!a.size) this.byAnchor.delete(l);
    return super.delete(k);
  }
  clear() { this.byCol.clear(); this.byAnchor.clear(); super.clear(); }
  /** the stacks of column c, by key @returns {Map<string, Stack>} */
  inCol(c) { return this.byCol.get(c) || NONE; }
  /** the stacks block l anchors, by key @returns {Map<string, Stack>} */
  of(l) { return this.byAnchor.get(l) || NONE; }
}
const NONE = new Map();

/** A box in GAP's coordinates: its extent, its canonical height and its temporary rows. */
function gapBlock(b) {
  const e = extent(b), pad = isArea(b) ? 1 : 0, t = b.t || 0;
  if (!(Number.isInteger(b.h) && b.h - t >= 1)) throw new Error('gap: ' + b.id + ' has no height');
  return { id: b.id, c0: e.c0, c1: e.c1, y: b.y - pad, h: b.h - t + 2 * pad, e: t };
}
function toWork(layout) {
  const B = new Map(), S = new Stacks();
  for (const id of layout.order) {
    const b = layout.boxes.get(id); B.set(id, gapBlock(b));
    for (const s of b.above || []) for (let c = s.c0; c <= s.c1; c++) S.set(key(id, c), cloneStack(s.stack));
  }
  return { B, S, rules: null };
}
const copyWork = (W) => ({ B: new Map([...W.B].map(([k, b]) => [k, { ...b }])), S: new Stacks([...W.S].map(([k, st]) => [k, cloneStack(st)])), rules: W.rules });

// ---- the chain of one column: anchors from the top; and every element of it, anchors and standing blocks, in order
function chain(W, c) {
  const byU = new Map();
  for (const [k, st] of W.S.inCol(c)) byU.set(st.u, anchorOf(k));
  const out = []; let u = null;
  while (byU.has(u)) { const l = byU.get(u); out.push(l); u = l; if (out.length > W.B.size + 1) throw new Error('gap: a loop in column ' + c); }
  return out;
}
function seq(W, c) {   // [{id, st, i}]: i the index in st.parts for a standing block, -1 for the anchor of st
  const out = [];
  for (const l of chain(W, c)) { const st = W.S.get(key(l, c)); st.parts.forEach((p, i) => { if (isStand(i)) out.push({ id: p.id, st, i }); }); out.push({ id: l, st, i: -1 }); }
  return out;
}
const lowerOf = (W, x, c) => { for (const st of W.S.inCol(c).values()) if (st.u === x) return st; return null; };
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

// ---- where a block put at its displayed row comes into column c: the start of the seg it stands in (rule 3), or of the rows over it as a
// fresh anchor, as a canonical row, and its offset from there on the screen; its canonical row in that column is their sum. yc: the
// canonical rows of the layout the arrivals come into, rule 5 made (the moved blocks at their targets)
function slot(W, x, c, yc) {
  const inChain = new Set(seq(W, c).map((el) => el.id)), shownH = (b) => b.h + b.e;
  const others = [...W.B.values()].filter((b) => b.id !== x.id && inChain.has(b.id)).sort((a, b) => a.y - b.y || byId(a.id, b.id));
  const below = others.find((b) => b.y >= x.y + shownH(x));
  if (!below) { const above = others.filter((b) => b.y + shownH(b) <= x.y).pop(); return above ? yc.get(above.id) + above.h + x.y - (above.y + shownH(above)) : x.y; }
  let st = W.S.get(key(below.id, c)), i;
  if (st) i = st.parts.length - 1; else { const f = seq(W, c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
  return spans(W, st, 'canonical', yc)[i][0] + Math.max(0, x.y - spans(W, st, 'shown')[i][0]);
}

// ---- a block comes into column c (rules 3 and 4): carried or created there, at its displayed row; come in by itself, at its canonical row
// `ys`; byCanon: an undo putting it back, by its canonical row only (LAYOUT-ENGINE-PLAN §6.4). canon: a block moved by hand and put at its
// displayed row, its canonical row (the largest its columns give, `slot`, on the canonical rows `yc`): the rows under it are then those
// that keep the block under it at its canonical row, so that no temporary push of another block is written (§2.1), and the rest of the
// seg goes. resident: a block of a swap that was an anchor in this column comes back as one (G11): it cuts the stack, the rows above it and
// under it keeping their owners
/** The blocks in the order given, but each after every one of its uppers that the list holds (O-25): a stable order of dependencies. */
function followOrder(list, uppersOf) {
  const out = [], left = list.slice();
  while (left.length) { const k = left.findIndex((id) => ![...(uppersOf.get(id) || [])].some((u) => u !== id && left.includes(u))); out.push(...left.splice(k < 0 ? 0 : k, 1)); }
  return out;
}
// uppers: for a block that comes in by itself out of every column it had, the blocks that stood over it in base (O-25, the owner's G16): it
// comes in under every one of them in the column's chain, with the gap its reference gives, wherever the screen has it
function enter(W, x, c, ys = null, byCanon = false, canon = null, yc = null, resident = false, targetOf = null, uppers = null) {
  const shownH = (b) => b.h + b.e, Y = (b) => (ys ? ys.get(b.id) : b.y), H = (b) => b.h + (ys ? 0 : b.e);
  const order = seq(W, c).map((el) => el.id), inChain = new Set(order);   // the neighbours are those already in the column's chain (rule 3)
  // a block put at its displayed row reads its neighbours in the chain's order, which is the screen's but where a block that came in by itself
  // followed its old upper neighbour (O-25, G16): it stands under that block in the chain whatever its target row
  const at = new Map(order.map((id, k) => [id, k]));
  const others = [...W.B.values()].filter((b) => b.id !== x.id && inChain.has(b.id))
    .sort((a, b) => (byCanon ? Y(a) - Y(b) || byId(a.id, b.id) : at.get(a.id) - at.get(b.id)));
  if (byCanon) { const o = others.find((b) => Y(b) < Y(x) + x.h && Y(x) < Y(b) + b.h); if (o) throw new Error(`gap: a canonical place overlaps: ${x.id} at ${Y(x)} and ${o.id} at ${Y(o)} in column ${c}`); }
  const lastUp = uppers ? others.reduce((m, b, k) => (uppers.has(b.id) ? k : m), -1) : -1;
  const below = byCanon ? others.find((b) => Y(b) >= Y(x) + x.h) : others.find((b, k) => k > lastUp && b.y >= x.y + shownH(x));
  if (!below) {   // rule 4, fresh: x anchors a stack of its own, rows of the anchor above (unowned under the top)
    const above = byCanon ? others.filter((b) => Y(b) + b.h <= Y(x)).pop() : others.filter((b, k) => k <= lastUp || b.y + shownH(b) <= x.y).pop(), u = above ? above.id : null;
    W.S.set(key(x.id, c), { u, parts: [fill(u, Math.max(0, Y(x) - (above ? Y(above) + H(above) : 0)))] });
    return;
  }
  // rule 3, stand: in the stack that holds `below` (its own, or the one it stands in), in the seg just above it
  let st = W.S.get(key(below.id, c)), i;
  if (st) i = st.parts.length - 1; else { const f = seq(W, c).find((el) => el.id === below.id); st = f.st; i = f.i - 1; }
  let [before, entry, after] = place(st.parts[i], Math.max(0, Y(x) - spans(W, st, ys ? 'canonical' : 'shown', ys)[i][0]), x);
  if (canon != null) {
    // and no more than keep it at its target on the screen when SETTLE moved it: the put block's own temporary rows push it there, and the
    // rows that would keep its canonical row in this column too would push it past it (its canonical row is then another column's)
    let keep = Math.max(0, yc.get(below.id) - (canon + x.h)); const t = targetOf ? targetOf(below.id) : null;
    if (t != null) keep = Math.min(keep, Math.max(0, t - (x.y + shownH(x))));
    after = slice(after, rlen(after) - Math.min(rlen(after), keep));
  }
  if (resident) { W.S.set(key(x.id, c), { u: st.u, parts: [...st.parts.slice(0, i), before] }); st.u = x.id; st.parts = [after, ...st.parts.slice(i + 1)]; return; }
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
function release(W, x, c, keep, heir, all = false) {   // all: a pass, which keeps its rows above it too
  let past = false;
  for (const l of chain(W, c)) {
    const st = W.S.get(key(l, c)), to = st.u === x.id ? heir : heirOf(st);
    const f = (seg) => remap(seg, (o) => (o !== x.id ? o : (past && keep) || all ? to : DROP));
    st.parts = st.parts.map((p, j) => {
      if (!isStand(j)) return f(p);
      const q = { id: p.id, lend: f(p.lend) }; if (p.id === x.id) past = true; return q;
    });
    if (l === x.id) past = true;
  }
}

// ---- a block leaves column c (deleted, carried away, narrowed or pressed off it, or passing another): rule 2, by what `base` gave it
// there (its height in base, and ys, the canonical rows of base). A pass (a block of a swap changing its place in the chain of a column it
// keeps) frees nothing, whatever the switches: its rows above it and under it stay, and its place stays as rows, its canonical body and
// the slack above it (the rows by which its stack did not hold it: the smaller of its canonical and its displayed slack, on the canonical
// rows ycPass, taken once after every other departure of the RELINK); `shown`: the carried block of a swap keeps there its temporary rows
// too, as the screen has them, until the neighbour's step uses them or it comes back (O-21)
function leave(W, x, c, why, ys, shown = 0, ycPass = null) {
  const f = seq(W, c).find((el) => el.id === x.id); if (!f) return;
  const pass = why === 'pass', gap52 = pass || on(W.rules, 'GAP.5.2'), tmpRows = pass ? fill(heirOf(f.st), shown) : [];
  const keep = pass || ((why === 'narrow' || why === 'press') && on(W.rules, 'GAP.9'));   // G8: narrowing or pressing aside is not deleting
  const yc = pass ? ycPass || rowsIn(W, 'canonical') : null;
  release(W, x, c, keep, heirOf(f.st), pass);
  if (f.i >= 0) {   // standing: its lend comes back between the segs round it, whatever made it leave (S8); with GAP.5.2 off it goes with it
    const { st, i } = f;
    if (pass) {   // its place stays as rows in place of its lend, which may be shorter than its body (it grew, G7)
      const sl = Math.max(0, Math.min(yc.get(x.id) - spans(W, st, 'canonical', yc)[i - 1][1], x.y - spans(W, st)[i - 1][1]));
      st.parts.splice(i - 1, 3, cat(st.parts[i - 1], fill(heirOf(st), x.h + sl), tmpRows, st.parts[i + 1]));
    } else st.parts.splice(i - 1, 3, cat(st.parts[i - 1], gap52 ? st.parts[i].lend : [], st.parts[i + 1]));
    return;
  }
  const mine = f.st; W.S.delete(key(x.id, c));
  const L = lowerOf(W, x.id, c);
  // GAP.5.2 off: the stack of the block that went loses its rows, the blocks standing in it stand on with no lends, whether it joins the
  // stack under it or, under the last anchor, its lowest standing block takes its place
  const gone = (p, j) => (gap52 ? p : !isStand(j) ? [] : { id: p.id, lend: [] });
  if (L) {   // join: the stack above x and the stack under it become one
    const up = mine.parts.slice(), last = up.pop(), k = mine.parts.length - 1;
    // narrowed off: what its body stood on and its slack there stay, measured canonically, so that no temporary height is written
    const slack = !keep ? 0 : pass ? Math.max(0, Math.min(yc.get(x.id) - spans(W, mine, 'canonical', yc)[k][1], x.y - spans(W, mine)[k][1]))
      : ys.get(x.id) - spans(W, mine, 'canonical', ys)[k][1];
    const body = keep ? cat(fill(heirOf(mine), x.h + slack), tmpRows) : [];   // x.h: its height in base, rule 2 running before the heights of after
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
// it; only the gap above the run and the gap under it change (LAYOUT-RULES GAP.5 rule 1; the model's moveIn). sw: the swap's neighbour's
// step (O-21), {tmp, under}: the carried block's temporary rows and the columns it comes into. added: the rows the steps of this RELINK put
// round each run, so that a move cut into steps gives what one step gives, owners included: under a run moved up, the slack all its steps
// used first, then the rows they left (`own`); over a run moved down in one stack with the gap under it, the rows of u first, then its
// room (`room`)
function moveIn(W, c, ids, d, sw = null, added = { own: new Map(), room: new Map() }) {
  const q = seq(W, c), moved = q.map((el) => ids.has(el.id)), runs = [];
  for (let a = 0; a < q.length; a++) {   // every run, with its two gaps and its slack, read before anything changes
    if (!moved[a] || (a > 0 && moved[a - 1])) continue;
    let z = a; while (z + 1 < q.length && moved[z + 1]) z++;
    const top = q[a], bot = q[z], ust = top.st, ui = top.i >= 0 ? top.i - 1 : ust.parts.length - 1;
    const [lst, li] = bot.i >= 0 ? [bot.st, bot.i + 1] : [lowerOf(W, bot.id, c), 0];
    const slack = W.B.get(top.id).y - spans(W, ust)[ui][1];
    // a gap that reaches past the row the step starts from (a departure of rule 2 made a temporary height above push the block through the
    // rows it kept) has no slack: the step moves the block by its rows from where the gap holds it, the push staying on the screen (O-23)
    runs.push({ r: top.id, head: a === 0, run: new Set(q.slice(a, z + 1).map((el) => el.id)), ust, ui, lst, li, sameStack: top.i >= 0 && lst === ust, holds: slack <= 0, slack: Math.max(0, slack) });
    a = z;
  }
  const gap51 = on(W.rules, 'GAP.5.1'), gap8 = on(W.rules, 'GAP.8');
  for (const { r, head, run, ust, ui, lst, li, sameStack, holds, slack } of runs) {
    if (d > 0) {
      // the swap's neighbour moving down, the swap going up (O-21): in a column the carried block comes into over it, the gap under it
      // loses the step and the gap above gains it less the carried block's temporary rows; in a column of its own, both gaps change by the
      // step less them, the carried block's canonical height
      const cut = !!(sw && sw.under.has(c)), dd = sw && !cut ? Math.max(0, d - sw.tmp) : d;
      let k = dd, got = 0;
      if (lst) {   // the gap under the run loses its rows: first rows of the run's blocks wherever they lie in it, then from its top
        const seg = []; for (const p of lst.parts[li]) {
          if (k > 0 && run.has(p.o)) { const m = Math.min(k, p.n); k -= m; got += m; if (p.n > m) seg.push({ o: p.o, n: p.n - m }); } else seg.push(p);
        }
        const t = Math.min(k, rlen(seg)); lst.parts[li] = slice(norm(seg), t); got += t;
      }
      let nU = sameStack ? got : holds ? dd : 0, nR = sameStack && holds ? dd - got : 0;
      if (cut) { let cutN = Math.min(sw.tmp, nU + nR); const fromR = Math.min(cutN, nR); nR -= fromR; cutN -= fromR; nU -= Math.min(cutN, nU); }
      // the room this RELINK's earlier steps gave the run's top stays after the rows of u this step adds
      const kr = key(r, c), seg = ust.parts[ui], L = rlen(seg);
      let prevRoom = added.room.get(kr) || 0; while (prevRoom > 0 && rowAt(seg, L - prevRoom) !== r) prevRoom--;
      ust.parts[ui] = cat(slice(seg, 0, L - prevRoom), fill(heirOf(ust), nU), slice(seg, L - prevRoom), fill(r, nR));
      added.room.set(kr, prevRoom + nR);
    } else {
      const k = -d, used = Math.min(k, slack), seg0 = ust.parts[ui], n = Math.min(rlen(seg0), k - used);
      const left = slice(seg0, rlen(seg0) - n); ust.parts[ui] = slice(seg0, 0, rlen(seg0) - n);
      if (lst) {
        // the owners of what comes under the run: its top's own, the rows it left with theirs (G5, S7, G6/GAP.8); with GAP.5.1 off, rows
        // of the stack they come into, its u's, free room staying free; the lengths are the same either way. Going down under the swap's
        // neighbour, the carried block's temporary rows its pass kept come out (O-21)
        const into = heirOf(lst), mine = !gap51 ? (head ? null : into) : head && !gap8 ? null : r;
        const owner = (o) => (!gap51 ? (o === null ? null : into) : o === null && head ? mine : o);
        let cutN = sw && sw.under.has(c) ? sw.tmp : 0;
        const own = used - Math.min(used, cutN); cutN -= used - own;
        // the slack this RELINK's earlier steps put under the run stays first, before the rows this step leaves
        const ko = key(r, c), seg = lst.parts[li];
        let prevOwn = added.own.get(ko) || 0; while (prevOwn > 0 && !allOwned(slice(seg, 0, prevOwn), mine)) prevOwn--;
        lst.parts[li] = cat(fill(mine, own), slice(seg, 0, prevOwn), remap(slice(left, cutN), owner), slice(seg, prevOwn));
        added.own.set(ko, prevOwn + own);
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
  const mine = [...W.S.of(id)].map(([k, st]) => [colOf(k), st]).sort((a, b) => a[0] - b[0]);
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
  const W = { B: new Map(), S: new Stacks(), rules: null };
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

/** A push with its followers, for SETTLE's phases between two RELINKs (LAYOUT-ENGINE-PLAN §5.2): `after` is `before` with some blocks moved
 *  down or grown; every block they reach is pushed down so that it keeps its gap under them, in the order of the chains: in each column of
 *  a chain, under the element above it there, at most the stack's rows and at most the distance it had in `before`, so a gap P-UP closed
 *  stays closed and a column with slack takes the push into its slack first. The chains are those of `base` (the layout the RELINK interval
 *  started from, whose stacks the working state keeps) once every element that no longer covers a column of its chain there has left it by
 *  RELINK's own rule 2 (`leave`, as narrowed or pressed off): its body and the canonical slack above it stay as rows with GAP.9, its own
 *  rows go with it without, a standing block's lend comes back with GAP.5.2 and goes with it without; so the next element follows the one
 *  above it with the rows RELINK will give it. An element leads the next one only while the next one still stands under it on the screen
 *  (an earlier phase may have put it beside or over it, for P-SEP to settle). The blocks of `skip` (the moved block of the change, in no
 *  chain until phase 8) neither lead nor follow where they still stand in a chain, and the chain stops at them, the held place keeping
 *  the blocks under it where they are (DRAG.B1). Blocks only go down; no stack of the layout changes, RELINK's alone.
 *  @param {Layout} before @param {Layout} after @param {Set<string>} [skip] @param {?Rules} [rules] @param {Layout} [base]
 *  @returns {Layout} */
export function push(before, after, skip = new Set(), rules = null, base = before) {
  const W = toWork(after), W0 = toWork(before), H = (b) => b.h + b.e;
  const D = work(base, rules || DEFAULT);
  departAll(D, (id, c) => (W.B.has(id) && !covers(W.B.get(id), c) ? 'narrow' : null), rowsIn(D, 'canonical'), null);
  const preds = new Map([...W.B.keys()].map((id) => [id, []])), succs = new Map([...W.B.keys()].map((id) => [id, []]));
  const lead = (p, q, gap, c) => {
    if (p == null || !W.B.has(p) || !W.B.has(q)) return;
    const P = W.B.get(p), Q = W.B.get(q); if (!covers(P, c) || !covers(Q, c)) return;
    const P0 = W0.B.get(p), Q0 = W0.B.get(q), was = P0 && Q0 ? Q0.y - (P0.y + H(P0)) : gap;
    if (was < 0) return;   // not under it on the screen any more (a phase moved one of them): it does not follow it
    preds.get(q).push([p, Math.min(gap, was)]); succs.get(p).push(q);
  };
  for (const c of [...D.S.byCol.keys()].sort((a, b) => a - b)) {
    let prev = null, gap = 0;
    const at = (id) => { if (skip.has(id)) prev = null; else { lead(prev, id, gap, c); prev = id; } gap = 0; };
    for (const l of chain(D, c)) {
      D.S.get(key(l, c)).parts.forEach((p, i) => { if (!isStand(i)) gap += rlen(p); else at(p.id); });
      at(l);
    }
  }
  const indeg = new Map([...preds].map(([id, ps]) => [id, ps.length])), ready = [...indeg].filter(([, n]) => n === 0).map(([id]) => id), y = new Map();
  while (ready.length) {
    const id = ready.pop(), b = W.B.get(id);
    y.set(id, preds.get(id).reduce((m, [p, gap]) => Math.max(m, y.get(p) + H(W.B.get(p)) + gap), b.y));
    for (const s of succs.get(id)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) ready.push(s); }
  }
  if (y.size !== W.B.size) throw new Error('gap: push found a cycle');
  const boxes = new Map();
  for (const [id, b] of after.boxes) { const g = W.B.get(id); boxes.set(id, y.get(id) === g.y ? b : { ...b, y: y.get(id) + (isArea(b) ? 1 : 0) }); }
  return layoutOf(after, boxes);
}

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

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);   // ids may hold any character, so never join() them

// rule 2 for every block and column `out` names (id, c → why or null), column by column, each column's blocks top to bottom in its chain as
// it stands before any departure. The passes come after every other departure, in every column: a pass frees nothing, so what the others
// give back is measured with the passer still in its place; and every pass is measured on the same canonical rows, taken once then, so that
// a block passing in several columns keeps the same place whichever column is taken first. The carried block of a swap keeps its temporary
// rows at its old place (O-21)
function departAll(W, out, ys, swap) {
  const ws = allCols(W).map((c) => [c, seq(W, c).map((el) => [el.id, out(el.id, c)]).filter(([, w]) => w)]);
  for (const [c, list] of ws) for (const [id, w] of list) if (w !== 'pass') leave(W, W.B.get(id), c, w, ys);
  if (ws.some(([, list]) => list.some(([, w]) => w === 'pass'))) {
    const ycPass = rowsIn(W, 'canonical');
    for (const [c, list] of ws) for (const [id, w] of list) if (w === 'pass') leave(W, W.B.get(id), c, w, ys, swap && id === swap[0] ? W.B.get(id).e : 0, ycPass);
  }
}

/** GAP.5 RELINK, in one container, on a transition SETTLE declares (LAYOUT-RULES §4, GAP's inputs): checked first against its geometry
 *  (transition.js), and refused, `{ok: false, why: 'failed'}`, when it does not match it, an internal error of SETTLE (§5.5); refused too when
 *  its result would break an invariant. A block of base that after does not hold is taken away first, by GAP.6, top to bottom. Then three
 *  layouts are made from base: R, the same transition with every block in its columns of base (the carried block in those it keeps, an
 *  undo's carry back out of them all), which gives each block that comes into a column by itself its reference; W, the result: rule 2 as
 *  declared (the passes after every other departure, on one canonical snapshot), the heights and columns of after, `cap` (G7), rule 1 (every
 *  step measured at the rows the declaration gives: the start, FOLLOW's over base's stacks with after's heights, plus the steps so far),
 *  then the blocks put at a place, top to bottom (the carried block, a created one and a block of a swap coming back at its displayed
 *  target, a block moved by hand measured from its canonical row, G11's anchors coming back as anchors; an undo's by its canonical row);
 *  and M, W with rule 5 made, where the blocks that come in by themselves are measured, each at its reference. Then rule 5 and FOLLOW,
 *  whose rows are the result. @param {Transition} T @param {Rules} rules @returns {Relinked} */
export function relink(T, rules) {
  let out;
  try {
    const errors = checkTransition(T);
    if (errors.length) return { ok: false, why: 'failed', errors };
    out = relinkWork(T, rules);
  } catch (e) { return { ok: false, why: 'failed', errors: [e.message] }; }
  const errs = check(out.layout);
  return errs.length ? { ok: false, why: 'failed', errors: errs } : { ok: true, layout: out.layout, refs: out.refs };
}

/** FOLLOW over a working state's stacks with the heights of `tg` (after, in GAP's coordinates): the rows a transition's first step starts
 *  from, a height a phase changed being no move. */
function projected(W, tg) {
  const V = copyWork(W);
  for (const [id, t] of tg) if (V.B.has(id)) { const b = V.B.get(id); b.h = t.h; b.e = t.e; }
  followWork(V); return new Map([...V.B.values()].map((b) => [b.id, b.y]));
}
/** The rows RELINK counts every move from (LAYOUT-RULES GAP's inputs, `moved`): FOLLOW over `base`'s stacks, the blocks `after` does not
 *  hold taken away first (GAP.6), with `after`'s heights, a height a phase changed being no move. Box rows by id, for the blocks both hold;
 *  for the tests and the dev look. @param {Layout} base @param {Layout} after @param {Rules} rules @returns {Map<string, number>} */
export function startRows(base, after, rules) {
  const gb = new Map(base.order.map((id) => [id, gapBlock(base.boxes.get(id))]));
  let b0 = base; for (const id of [...gb.keys()].filter((id) => !after.boxes.has(id)).sort((a, b) => gb.get(a).y - gb.get(b).y || byId(a, b))) b0 = remove(b0, id, rules);
  const W = work(b0, rules), tg = new Map(after.order.filter((id) => W.B.has(id)).map((id) => [id, gapBlock(after.boxes.get(id))]));
  return new Map([...projected(W, tg)].map(([id, y]) => [id, y + (isArea(after.boxes.get(id)) ? 1 : 0)]));
}

/** Moves cut by common parts: `d` holds [id, rows] (rows ≠ 0); the blocks moved down and those moved up form two groups, `first`'s
 *  direction first; in each, the furthest alone first and the others joining it for the last rows of the way, one step per common part.
 *  @param {Array<[string, number]>} d @param {1|-1} [first] @returns {Array<[string[], number]>} */
export function cut(d, first = 1) {
  const out = [];
  for (const sign of [first, -first]) {
    const group = d.filter(([, e]) => Math.sign(e) === sign); if (!group.length) continue;
    const levels = [...new Set(group.map(([, e]) => Math.abs(e)))].sort((p, q) => q - p);
    levels.forEach((lv, i) => out.push([group.filter(([, e]) => Math.abs(e) >= lv).map(([id]) => id), sign * (lv - (levels[i + 1] || 0))]));
  }
  return out;
}

/** The moves rule 1 makes (LAYOUT-RULES GAP's inputs, `moved`; the owner, 2026-11-11, G15): every block SETTLE moved goes from its start
 *  row to its target, and RELINK cuts the moves itself (`cut`, the carried block's direction first): blocks moved by the same rows go
 *  together and keep the gaps between them, and a rigid move cut into more steps gives what one step gives (GAP.5 rule 1). A swap's pair (§5.1b) first goes to the rows it stood at when the carried block was
 *  pinned against the neighbour; then its structural steps, by the heights the swap is made with, after's (phase 1c gives the carried block
 *  its width and height at the target before phase 3 swaps; the independent review of 24a4f93): going down,
 *  the neighbour up by the carried block's height and the carried block down by the neighbour's; going up, the carried block up by the
 *  neighbour's height and the neighbour down by the carried block's. In the lab's form, `steps`, the blocks its steps move are the moved
 *  blocks; their path is not used. @returns {{moved:string[], steps:Array<[string[], number]>}} */
function movesOf(T, W, tg, start, gb) {
  const moved = [...new Set([...(T.moved || (T.steps || []).flatMap(([ids]) => ids)), ...(T.swap || [])])];
  const pre = new Map(), tail = [];
  if (T.swap && gb.has(T.swap[0]) && gb.has(T.swap[1]) && tg.has(T.swap[0]) && tg.has(T.swap[1])) {
    const [x, n] = T.swap, hX = tg.get(x).h + tg.get(x).e, hN = tg.get(n).h + tg.get(n).e;
    if (gb.get(x).y < gb.get(n).y) { pre.set(n, tg.get(n).y + hX); pre.set(x, tg.get(x).y - hN); tail.push([[n], -hX], [[x], hN]); }
    else { pre.set(x, tg.get(x).y + hN); pre.set(n, tg.get(n).y - hX); tail.push([[x], -hN], [[n], hX]); }
  }
  const d = [];
  for (const id of moved) if (W.B.has(id) && tg.has(id) && start.has(id)) { const e = (pre.has(id) ? pre.get(id) : tg.get(id).y) - start.get(id); if (e) d.push([id, e]); }
  const g = d.find(([id]) => id === T.carried);
  return { moved, steps: [...cut(d, g && g[1] < 0 ? -1 : 1), ...tail] };
}

function relinkWork(T, rules) {
  const { base, after } = T, carried = T.carried ?? null, canonical = !!T.canonical;
  const kv = (list) => new Map((list || []).map(([id, c, w]) => [key(id, c), w]));
  const LV = kv(T.leave), EN = kv(T.enter), PS = new Map((T.pass || []).map(([id, c]) => [key(id, c), 'pass'])), passers = new Set((T.pass || []).map(([id]) => id));
  // GAP.6 first, top to bottom, for every block after does not hold
  const gb = new Map(base.order.map((id) => [id, gapBlock(base.boxes.get(id))]));
  let b0 = base; for (const id of [...gb.keys()].filter((id) => !after.boxes.has(id)).sort((a, b) => gb.get(a).y - gb.get(b).y || byId(a, b))) b0 = remove(b0, id, rules);
  const W = work(b0, rules);
  const tg = new Map(); for (const id of after.order) tg.set(id, gapBlock(after.boxes.get(id)));   // after, in GAP's coordinates: rows are targets
  const padOf = (id) => (isArea(after.boxes.get(id)) ? 1 : 0);
  const canonTarget = (id) => { const b = after.boxes.get(id); return (b.yc ?? b.y) - padOf(id); };
  const byTarget = (a, b) => tg.get(a).y - tg.get(b).y || tg.get(a).c0 - tg.get(b).c0 || byId(a, b);
  // O-25 (the owner, 2026-11-11, G16): a block that comes into a column by itself and keeps none of its columns of base follows the blocks
  // that stood over it in base, in any of its chains: it comes in under them, with the gap its reference gives
  const uppersOf = new Map();
  for (const [id, t] of tg) {
    const x = W.B.get(id); if (!x || (t.c0 <= x.c1 && x.c0 <= t.c1)) continue;   // it keeps a column of base: nothing to follow
    if (!cols(t).some((c) => EN.get(key(id, c)) === 'self')) continue;
    const up = new Set(); for (const c of cols(x)) { const ch = seq(W, c).map((el) => el.id); for (const u of ch.slice(0, ch.indexOf(id))) up.add(u); }
    if (up.size) uppersOf.set(id, up);
  }
  const ys = rowsIn(W, 'canonical');   // the canonical rows of base, by which rule 2 measures
  const anchoredIn = new Set(W.S.keys());   // the (block, column) where a block is an anchor in base: a passer comes back there as one (G11)
  // the rows every move starts from: FOLLOW over base's stacks with after's heights, a height a phase changed being no move; the moves,
  // cut here; every moved block is held at its target by rule 5, one whose move adds up to nothing included (G15)
  const start = projected(W, tg), { moved, steps } = movesOf(T, W, tg, start, gb);
  const fits = new Map(); for (const id of moved) if (tg.has(id)) fits.set(id, tg.get(id).y);
  if (carried != null && !canonical && tg.has(carried)) fits.set(carried, tg.get(carried).y);
  // the neighbour's swap step, its last (§5.1b), with the carried block's temporary rows and the columns it comes into (O-21)
  const swapStep = T.swap ? steps.map(([list]) => list.includes(T.swap[1])).lastIndexOf(true) : -1;
  const swapOf = swapStep >= 0 && tg.has(T.swap[0]) ? { tmp: tg.get(T.swap[0]).e, under: new Set(cols(tg.get(T.swap[0]))) } : null;
  const atTargets = () => { for (const b of W.B.values()) if (tg.has(b.id)) b.y = tg.get(b.id).y; };
  const restore = (s0) => { W.B = s0.B; W.S = s0.S; };
  // rule 1: every step's slacks measured at the rows the declaration gives, each block at the row it starts from plus the steps that moved
  // it so far (a block created here, out of every chain, follows FOLLOW); so a move cut into steps gives what one step gives
  const ruleOne = () => {
    const row = new Map(start), added = { own: new Map(), room: new Map() };
    for (const b of W.B.values()) if (row.has(b.id)) b.y = row.get(b.id);
    steps.forEach(([list, d], si) => {
      const ids = new Set(list.filter((id) => W.B.has(id))), cs = new Set(); for (const id of ids) for (const c of cols(W.B.get(id))) cs.add(c);
      for (const c of [...cs].sort((a, b) => a - b)) moveIn(W, c, ids, d, si === swapStep ? swapOf : null, added);
      for (const id of ids) if (row.has(id)) row.set(id, row.get(id) + d);
      followWork(W); for (const b of W.B.values()) if (row.has(b.id)) b.y = row.get(b.id);
    });
  };
  // a block put at its displayed row into the columns cs (rule 3). Moved by hand (the carried block, a block of a swap coming back): its
  // canonical row the largest its columns give, those it keeps and those it comes into, measured on the canonical rows of this layout with
  // rule 5 made (the moved blocks at their targets), so that no temporary push of another block is written under it. Created: the rest of
  // the seg under it, as on the screen, so that taking it away gives every row back (INV-7 b)
  const putIn = (id, cs, passes) => {
    const res = (c) => passes(c) && anchoredIn.has(key(id, c));
    if (!ys.has(id)) { for (const c of cs) enter(W, W.B.get(id), c, null, false, null, null, res(c)); return; }
    const s0 = copyWork(W); followWork(W); fitWork(W, new Map([...fits].filter(([k]) => k !== id))); const yc = rowsIn(W, 'canonical'); restore(s0); atTargets();
    const x = W.B.get(id);
    let canon = cols(x).some((c) => seq(W, c).some((el) => el.id === id)) ? yc.get(id) : 0;
    for (const c of cs) canon = Math.max(canon, slot(W, x, c, yc));
    for (const c of cs) enter(W, x, c, null, false, canon, yc, res(c), (k) => (fits.has(k) && W.B.has(k) ? fits.get(k) : null));
  };
  // R, the reference: every block keeps the columns of base, the carried block those it keeps (an undo's carry back none); a declared passer
  // leaves every column of base where its order changes and comes back there at its displayed target; the heights of after, cap, rule 1,
  // rule 5. A change of order no passer explains is a wrong declaration
  const W0 = copyWork(W);
  if (carried != null && W.B.has(carried) && tg.has(carried)) {
    const x = W.B.get(carried), t = tg.get(carried);
    for (const c of cols(x)) if (canonical || !covers(t, c)) leave(W, x, c, canonical ? 'away' : 'narrow', ys);
    const k0 = Math.max(x.c0, t.c0), k1 = Math.min(x.c1, t.c1);   // the columns it keeps
    if (canonical || k0 > k1) W.B.delete(carried); else { x.c0 = k0; x.c1 = k1; }
  }
  const rOut = new Map(), add = (m, id, c) => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(c); };
  for (const c of allCols(W)) {
    const m = seq(W, c).map((el) => el.id).filter((id) => tg.has(id));
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
      if (tg.get(m[i]).y < tg.get(m[j]).y) continue;   // still above
      // in a column the two blocks of a swap share, the carried block is the one that passes (the neighbour stayed and moved)
      const pair = T.swap && T.swap.includes(m[i]) && T.swap.includes(m[j]);
      const ps = pair ? [T.swap[0]] : [m[i], m[j]].filter((id) => passers.has(id));
      if (!ps.length && covers(tg.get(m[i]), c) && covers(tg.get(m[j]), c)) throw new Error(`gap: ${m[i]} and ${m[j]} change their order in column ${c} and neither is declared to pass`);
      for (const id of ps) add(rOut, id, c);
    }
  }
  departAll(W, (id, c) => (rOut.has(id) && rOut.get(id).has(c) ? 'pass' : null), ys, T.swap);
  for (const [id, t] of tg) if (W.B.has(id)) { const b = W.B.get(id); b.h = t.h; b.e = t.e; }
  capAll(W); ruleOne(); atTargets();
  for (const id of [...rOut.keys()].sort(byTarget)) putIn(id, [...rOut.get(id)].sort((a, b) => a - b), () => true);
  followWork(W); fitWork(W, fits);
  const ref = rowsIn(W, 'canonical');
  restore(W0);
  // W: rule 2 as declared and the passers out of the columns they pass in; the blocks after creates; the heights and columns of after; cap;
  // rule 1; then the arrivals in two passes, top to bottom: the blocks put at a place, then those that come in by themselves
  departAll(W, (id, c) => LV.get(key(id, c)) || PS.get(key(id, c)) || null, ys, T.swap);
  for (const [id, t] of tg) if (!W.B.has(id)) W.B.set(id, { ...t });
  for (const [id, t] of tg) { const b = W.B.get(id); b.h = t.h; b.e = t.e; b.c0 = t.c0; b.c1 = t.c1; }
  capAll(W); ruleOne(); atTargets();
  // whether a block is out of a column's chain: read from a snapshot of the chains taken before each pass of arrivals, as a block's
  // membership changes only by its own arrival, which comes after its test
  let members = new Map();
  const snapshotChains = () => { members = new Map(allCols(W).map((c) => [c, new Set(seq(W, c).map((el) => el.id))])); };
  const ids = [...tg.keys()].sort(byTarget), own = (id, c) => !(members.get(c) || NONE).has(id);
  snapshotChains();
  for (const id of ids) {
    const putCs = cols(W.B.get(id)).filter((c) => own(id, c) && (EN.get(key(id, c)) === 'put' || PS.has(key(id, c))));
    if (putCs.length) putIn(id, putCs, (c) => PS.has(key(id, c)));
    // an undo's carry back, by its canonical row (plan §6.4), measured as a put block is, with rule 5 made: the blocks SETTLE moved out of
    // its way stand at their targets, not where their stacks still have them (found through SETTLE by tests/layoutgestures.mjs)
    const back = cols(W.B.get(id)).filter((c) => own(id, c) && EN.get(key(id, c)) === 'back');
    if (back.length) {
      const s0 = copyWork(W); followWork(W); fitWork(W, new Map([...fits].filter(([k]) => k !== id))); const yb = rowsIn(W, 'canonical'); restore(s0); atTargets();
      yb.set(id, canonTarget(id));
      for (const c of back) enter(W, W.B.get(id), c, yb, true);
    }
  }
  followWork(W);
  // M, where the blocks that come in by themselves are measured: W with rule 5 made, so that a block rule 5 is to lower is measured where it
  // will stand, and nothing of it written; each such block comes in at its reference, one that came in before it in this RELINK measured
  // at its own (blocks that come in at once are one path, G4)
  const W1 = copyWork(W); fitWork(W, fits); const M = rowsIn(W, 'canonical'); restore(W1); atTargets();
  // top to bottom, but a block that follows an old upper neighbour (O-25) after that neighbour, when it comes in by itself too (the
  // independent review of 0eda0ba)
  snapshotChains();
  for (const id of followOrder(ids.filter((id) => cols(W.B.get(id)).some((c) => EN.get(key(id, c)) === 'self')), uppersOf)) {
    const self = cols(W.B.get(id)).filter((c) => EN.get(key(id, c)) === 'self' && own(id, c)); if (!self.length) continue;
    if (ref.has(id)) M.set(id, ref.get(id));
    for (const c of self) enter(W, W.B.get(id), c, M, false, null, null, false, null, uppersOf.get(id) || null);
  }
  followWork(W); fitWork(W, fits);
  // the references of the blocks that came in by themselves, as canonical box rows, for the dev look and the tests (landing)
  const refs = new Map(ids.filter((id) => ref.has(id) && cols(W.B.get(id)).some((c) => EN.get(key(id, c)) === 'self')).map((id) => [id, ref.get(id) + padOf(id)]));
  return { layout: toLayout(W, after), refs };
}

/** Rule 1 alone, every block keeping its columns: the steps of `moves` in order, then FOLLOW; alone it is the lab model's `move`, and what
 *  step 1 tests rule 1 by. @param {Map<string,Moved>|Object<string,Moved>} moves @returns {Layout} */
export function adjust(layout, moves, rules) {
  const W = work(layout, rules), added = { own: new Map(), room: new Map() };
  for (const [ids, d] of stepsOf(moves)) {
    const cs = new Set(); for (const id of ids) if (W.B.has(id)) for (const c of cols(W.B.get(id))) cs.add(c);
    for (const c of [...cs].sort((a, b) => a - b)) moveIn(W, c, ids, d, null, added);
    followWork(W);
  }
  return toLayout(W, layout);
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
    for (const k of W.S.inCol(c).keys()) if (!reached.has(anchorOf(k))) errs.push(`stack ${k}: not reached from the top of column ${c}`);
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
