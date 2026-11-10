// Random transitions as SETTLE would declare them (step 1b of docs/LAYOUT-ENGINE-PLAN.md), built from the action, never read back from
// the stacks: a carry of one block (vertically, or sideways) with the blocks it reaches sinking or going up as rigid steps, a carry
// sideways that presses a block aside, a swap with the neighbour right under or over the carried block, a width change (narrowed, widened,
// shifted), a block created or deleted, a block carried away (taken away, then put where it lands, two RELINKs), an undo's carry back and
// a deleted block made again by an undo (each placed by its canonical row), a height; a carry or a swap with another block's width changed in
// the same RELINK, a swap whose carried block also shifts its columns, the same geometry as the pass of a switched-off rule's fallback, a
// swap with another block's height changed; text blocks and areas, under temporary heights. Each
// gives the geometry after it and the declaration of the model's relink(T); declare.mjs checks that the declaration explains the
// geometry. The generator's version goes with every saved example.
//
// Blocks come and go in frame coordinates ({c0, c1, y, h, e, yc, area}: an area by its frame, y its displayed row, yc its canonical one);
// inside, every block is its extent (LAYOUT-RULES §1.1: an area's frame with one free cell on every side), as GAP counts it, and the
// columns a declaration names are GAP's, the extent's.
export const GEN_VERSION = 11;
import { checkDeclaration } from './declare.mjs';

export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
const covers = (b, c) => b.c0 <= c && c <= b.c1;
const share = (a, b) => a.c0 <= b.c1 && b.c0 <= a.c1;
const hits = (a, b) => share(a, b) && a.y < b.y + b.h + (b.e || 0) && b.y < a.y + a.h + (a.e || 0);
const clone = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
const pad = (b) => (b.area ? 1 : 0);
/** A block's extent from its frame (and back): an area one cell wider on every side. */
const toExt = (b) => { const p = pad(b), o = { ...b, c0: b.c0 - p, c1: b.c1 + p, y: b.y - p, h: b.h + 2 * p, e: b.e || 0 }; if (b.yc != null) o.yc = b.yc - p; return o; };
const toFrame = (b) => { const p = pad(b), o = { ...b, c0: b.c0 + p, c1: b.c1 - p, y: b.y + p, h: b.h - 2 * p }; if (b.yc != null) o.yc = b.yc + p; return o; };

/** A random sheet of n blocks in columns off…off+W-1, a free row between any two extents that share a column; with `areas`, that share
 *  of them areas (a frame of 1 to 3 card columns, its extent inside the columns, its frame never at row 0). Frame coordinates. */
export function sheet(r, n, { off = 0, W = 8, rows = 24, pre = 'b', areas = 0 } = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), out = [];
  for (let i = 0; i < n; i++) for (let t = 0; t < 40; t++) {
    const area = r() < areas, c0 = off + int(0, W - 2), x = { c0, c1: Math.min(off + W - 1, c0 + int(area ? 2 : 0, 3)), y: int(0, rows), h: int(area ? 3 : 1, area ? 5 : 3), e: 0 };
    if (area && x.c1 - x.c0 < 2) continue;
    const b = { id: pre + i, ...(area ? toFrame({ ...x, area: true }) : x) };
    if (!out.some((o) => { const p = toExt(o); return share(p, x) && p.y < x.y + x.h + 1 && x.y < p.y + p.h + 1; })) { out.push(b); break; }
  }
  return out;
}

// what a carry does to the blocks it reaches, as SETTLE's primitives do in the large. The carried block x never moves. A block that shared a
// column with it in base keeps the side it had (DRAG.B2); any other is below when its middle is strictly below x's top row, frow. One
// judged below that reaches x (its top above x's bottom, overlapping or not, so a pointer that jumps past it still pushes it: «Reaches»)
// sinks right under it and its lower neighbours follow with their gaps (P-DOWN, `sink`); one judged above that reaches it (its bottom
// below x's top) goes up right over it, its gap above shrinking first and the blocks above it going up only as far as they must (P-UP).
// Then every pair that still hits: the lower one sinks against the other, with its lower neighbours, the order two blocks had in a column
// they shared in base kept (P-SEP). Returns false when a block would go above row 0 (P-UP would then lower x) or it does not settle.
// `off`, a switched-off rule (LAYOUT-RULES §1.6) and its fallback: 'P-UP', a block judged above that reaches x is pushed down under it
// instead; 'DRAG.B2.keep', every block's side is judged by frow and the middle, the side it had in base not kept
function carrySettle(after, base, x, off = null) {
  const X = after[x], others = Object.keys(after).filter((id) => id !== x), bottom = (b) => b.y + b.h + (b.e || 0);
  const wasOver = (a, b) => (base[a] && base[b] && share(base[a], base[b]) ? base[a].y < base[b].y : null);
  // the nearest block above `id` in one of its columns is its upper neighbour there (LAYOUT-RULES §1.3)
  const uppers = (id) => { const b = after[id], out = new Set();
    for (const c of cols(b)) { let best = null; for (const o of others) if (o !== id && after[o].c0 <= c && c <= after[o].c1 && bottom(after[o]) <= b.y && (!best || bottom(after[o]) > bottom(after[best]))) best = o; if (best) out.add(best); }
    return out; };
  const sink = (id, d) => {   // id down by d, every block under it following with its gap (the lower neighbours, and theirs)
    const set = new Set([id]), queue = [id];
    while (queue.length) { const k = queue.pop(); for (const o of others) if (!set.has(o) && uppers(o).has(k)) { set.add(o); queue.push(o); } }
    for (const k of set) after[k].y += d;
  };
  const rise = (id, d) => {   // id up by d (d > 0): its gap above shrinks first, a block above goes up only as far as it must
    after[id].y -= d; if (after[id].y < 0) return false;
    for (const o of others) if (o !== id && share(after[o], after[id]) && after[o].y < after[id].y && bottom(after[o]) > after[id].y) if (!rise(o, bottom(after[o]) - after[id].y)) return false;
    return true;
  };
  for (const id of others.slice().sort()) {
    if (!share(after[id], X)) continue;
    const K = after[id], byMiddle = !(2 * K.y + K.h + (K.e || 0) > 2 * X.y), over = off === 'DRAG.B2.keep' ? byMiddle : wasOver(id, x) ?? byMiddle;
    if (!over && K.y < bottom(X)) sink(id, bottom(X) - K.y);
    else if (over && bottom(K) > X.y) { if (off === 'P-UP') sink(id, bottom(X) - K.y); else if (!rise(id, bottom(K) - X.y)) return false; }
  }
  for (let round = 0; round < 80; round++) {
    let pair = null;
    for (const a of others) for (const b of others) if (a < b && hits(after[a], after[b])) { pair = [a, b]; break; }
    if (!pair) return !others.some((id) => hits(after[id], X));
    const [a, b] = pair, aOver = wasOver(a, b) ?? (after[a].y < after[b].y || (after[a].y === after[b].y && after[a].c0 < after[b].c0));
    const [top, low] = aOver ? [a, b] : [b, a];
    sink(low, bottom(after[top]) - after[low].y);
  }
  return false;
}

// the moves of a carry as rigid steps, one per common part (LAYOUT-RULES GAP's inputs): a block the carry pushes moves with it over the
// last rows of its way, so x alone first, then x with every block pushed at least that far, and so on. False when a block moved the other
// way or further than x
function commonParts(T, base, after, x, d) {
  const disp = Object.keys(after).filter((id) => id !== x && base[id] && after[id].y !== base[id].y).map((id) => [id, after[id].y - base[id].y]);
  if (disp.some(([, e]) => Math.sign(e) !== Math.sign(d) || Math.abs(e) > Math.abs(d))) return false;
  const levels = [...new Set(disp.map(([, e]) => Math.abs(e)))].sort((p, q) => q - p);
  let done = 0;
  for (const L of [...levels, 0].map((v) => Math.abs(d) - v)) {
    if (L > done) { const with_ = disp.filter(([, e]) => Math.abs(d) - Math.abs(e) < L).map(([id]) => id); T.steps.push([[x, ...with_], Math.sign(d) * (L - done)]); done = L; }
  }
  return true;
}

// the blocks a block's departure from its columns reaches: those under it in its columns, and under those, by their displayed rows
function reachedFrom(base, x) {
  const out = new Set(), queue = [x];
  while (queue.length) { const k = queue.pop(), K = base[k];
    for (const [id, b] of Object.entries(base)) if (id !== x && !out.has(id) && share(b, K) && b.y >= K.y + K.h + K.e) { out.add(id); queue.push(id); } }
  return out;
}

// a free cell for a block placed by its canonical row (an undo: a carry back, or a deleted block made again), in columns c0…c1 at canonical
// row yc: the blocks of those columns are none that the departure of `gone` moves, nothing overlaps it in either measure, and the block under
// it in each column stays where it is on the screen. Returns its displayed row, FOLLOW's: in each column, the rows above it there counted
// from the displayed bottom of the block above it (its place measured canonically, in that block's seg), the largest
function canonicalCell(base, X, c0, c1, yc, gone, R = gone == null ? new Set() : reachedFrom(base, gone)) {
  const x = { ...X, c0, c1 };
  const inCols = Object.entries(base).filter(([id, b]) => id !== gone && share(b, x));
  if (inCols.some(([id]) => R.has(id))) return null;
  let y = yc;
  for (const c of cols(x)) {
    const col = inCols.filter(([, b]) => covers(b, c)).map(([, b]) => b);
    if (col.some((b) => b.yc < yc + x.h && yc < b.yc + b.h)) return null;
    const above = col.filter((b) => b.yc + b.h <= yc).sort((a, b) => a.yc + a.h - (b.yc + b.h)).pop();
    if (above) y = Math.max(y, above.y + above.h + above.e + (yc - (above.yc + above.h)));
  }
  for (const c of cols(x)) for (const b of inCols.map(([, b]) => b).filter((b) => covers(b, c) && b.yc >= yc + x.h))
    if (y + x.h + x.e + (b.yc - (yc + x.h)) > b.y) return null;   // it would push the block under it on the screen
  if (inCols.some(([, b]) => hits(b, { ...x, y }))) return null;
  return y;
}

/** One random action on `base` ({id: block}, frame coordinates, every block with its canonical row yc); returns {kind, after, T} (after and
 *  T.after in frame coordinates) or null when the draw gives no valid transition. A carry away is two RELINKs: `away` takes the block
 *  away (GAP.6, after without it) and returns `then`, which `putBack` turns, on the layout that RELINK left, into the RELINK that puts it
 *  where it lands. */
export function action(r, baseF, opts = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = (a) => a[Math.floor(r() * a.length)];
  const base = Object.fromEntries(Object.entries(baseF).map(([id, b]) => [id, toExt(b)]));
  const ids = Object.keys(base); if (!ids.length) return null;
  const kinds = opts.kinds || ['carry', 'carry', 'carry', 'sideways', 'press', 'swap', 'swap', 'swap', 'swap', 'width', 'width', 'compose', 'compose', 'swapshift', 'fallback', 'swapheight', 'create', 'delete', 'height', 'away', 'back', 'restore'];
  const kind = pick(kinds), after = clone(base), W = opts.W ?? 8, off = opts.off ?? 0;
  const T = { after, steps: [], leave: [], enter: [], pass: [], carried: null };
  // the heights FOLLOW is given (frame), and its rows back in extent coordinates
  const followRows = () => { const rows = opts.rowsWith(Object.fromEntries(ids.map((id) => [id, { h: after[id].h - 2 * pad(after[id]), e: after[id].e || 0 }])));
    for (const id of ids) if (id in rows) after[id].y = rows[id] - pad(after[id]);
    T.start = Object.fromEntries(ids.map((id) => [id, rows[id]])); };
  const done = () => {   // back to frame coordinates; only an undo's carried block keeps its canonical target
    const out = Object.fromEntries(Object.entries(after).map(([id, b]) => { const f = toFrame(b); if (!(T.canonical && id === T.carried)) delete f.yc; return [id, f]; }));
    T.after = out; return { kind, after: out, T };
  };
  const reorders = (x, but = null) => {   // the columns where x, which keeps them, changes its order with another block (not `but`) that keeps them
    const out = [];
    for (const id of ids) if (id !== x && id !== but && after[id]) for (const c of cols(base[x])) {
      if (!(c >= after[x].c0 && c <= after[x].c1) || !(c >= base[id].c0 && c <= base[id].c1) || !(c >= after[id].c0 && c <= after[id].c1)) continue;
      if ((base[x].y < base[id].y) !== (after[x].y < after[id].y) && !out.includes(c)) out.push(c);
    }
    return out;
  };
  const inside = (b) => b.c0 >= off && b.c1 <= off + W - 1 && b.y >= 0;
  // a swap made otherwise: its carried block also shifting its columns by one (`swapshift`), or another block's height changed in the same
  // RELINK (`swapheight`, the blocks under it following by FOLLOW, `start` given); kept only when declare.mjs accepts the result, a
  // combination the geometry does not allow being no draw
  if (kind === 'swapshift' || kind === 'swapheight') {
    const c = action(r, baseF, { ...opts, kinds: ['swap'] }); if (!c) return null;
    const T2 = JSON.parse(JSON.stringify(c.T)), ca = Object.fromEntries(Object.entries(T2.after).map(([id, b]) => [id, toExt(b)]));
    if (kind === 'swapshift') {
      const x = T2.carried, X = ca[x], k = pick([-1, 1]), nx = { ...X, c0: X.c0 + k, c1: X.c1 + k };
      if (!inside(nx) || !cols(base[x]).some((cc) => covers(nx, cc)) || Object.keys(ca).some((id) => id !== x && hits(ca[id], nx))) return null;
      ca[x] = nx;
      for (const cc of cols(base[x])) if (!covers(nx, cc)) T2.leave.push([x, cc, 'narrow']);
      for (const cc of cols(nx)) if (!covers(base[x], cc)) T2.enter.push([x, cc, 'put']);
      T2.pass = T2.pass.filter(([id, cc]) => covers(nx, cc) || id !== x);
    } else {
      if (!opts.rowsWith) return null;
      const k = pick(ids.filter((id) => !T2.swap.includes(id))); if (!k) return null;
      ca[k] = { ...ca[k], h: Math.max(1 + 2 * pad(ca[k]), ca[k].h + pick([-1, 1])) };
      const rows = opts.rowsWith(Object.fromEntries(ids.map((id) => [id, { h: ca[id].h - 2 * pad(ca[id]), e: ca[id].e || 0 }])));
      const by = {}; for (const [l, d] of T2.steps) for (const id of l) by[id] = (by[id] || 0) + d;
      for (const id of ids) if (id in rows) ca[id].y = rows[id] - pad(ca[id]) + (by[id] || 0);
      T2.start = Object.fromEntries(ids.map((id) => [id, rows[id]]));
    }
    T2.after = Object.fromEntries(Object.entries(ca).map(([id, b]) => [id, toFrame(b)]));
    if (checkDeclaration(baseF, T2).length) return null;
    return { kind, after: T2.after, T: T2 };
  }
  if (kind === 'compose') {
    // a carry or a swap and, in the same RELINK, another block narrowed, widened or pressed by a column where nothing is: as phase 8
    // relinks a carry with the blocks P-ASIDE pressed (a press met from the side is `press`)
    const c = action(r, baseF, { ...opts, kinds: [pick(['carry', 'carry', 'swap'])] }); if (!c) return null;
    const ca = Object.fromEntries(Object.entries(c.after).map(([id, b]) => [id, toExt(b)]));
    // another block: neither of the swap nor moved by any step (a swap's neighbour may end at its old row)
    const moving = new Set(c.T.steps.flatMap(([l]) => l));
    const free = ids.filter((id) => id !== c.T.carried && !(c.T.swap || []).includes(id) && !moving.has(id) && ca[id] && ca[id].y === base[id].y); if (!free.length) return null;
    // half the time a block above one the steps move, in a column it shares, so that its kept rows meet the move (rule 2 before rule 1)
    const over = free.filter((id) => [...moving].some((mv) => share(base[id], base[mv]) && base[id].y < base[mv].y));
    const k = over.length && r() < 0.5 ? pick(over) : pick(free), K = ca[k], z = Math.min(off + W - 1, Math.max(K.c0 + 2 * pad(K), K.c1 + pick([-1, 0, 1]))), a = Math.min(z - 2 * pad(K), Math.max(off, K.c0 + pick([-1, 0, 1])));   // a card column at least
    if (a === K.c0 && z === K.c1) return null;
    const was = cols(K), nk = { ...K, c0: a, c1: z };
    if (!inside(nk) || ids.some((id) => id !== k && ca[id] && hits(ca[id], nk))) return null;
    ca[k] = nk; const why = pick(['narrow', 'narrow', 'press']);
    for (const col of was) if (col < a || col > z) c.T.leave.push([k, col, why]);
    for (const col of cols(nk)) if (!was.includes(col)) c.T.enter.push([k, col, 'self']);
    const out = Object.fromEntries(Object.entries(ca).map(([id, b]) => [id, toFrame(b)]));
    c.T.after = out; return { kind, after: out, T: c.T };
  }
  if (kind === 'fallback') {
    // a carry under a switched-off rule whose fallback puts a neighbour on the carried block's other side (LAYOUT-RULES GAP's inputs): with
    // P-UP off a block judged above that the carry reaches is pushed down under it; with DRAG.B2.keep off sides are judged by frow and the
    // middle, so a block that was under it can be judged above and go up over it. The carried block passes that neighbour, declared with
    // the fallback; the carried block's move first, then the blocks pushed, one step per displacement, the other way included
    const off = pick(['P-UP', 'DRAG.B2.keep']), x = pick(ids), X = after[x], d = off === 'P-UP' ? -int(1, 12) : int(1, 12);
    X.y += d; if (!inside(X)) return null;
    if (!carrySettle(after, base, x, off)) return null;
    if (ids.some((id) => id !== x && after[id] && reorders(id, x).length)) return null;   // only the carried block changes an order
    const passes = reorders(x); if (!passes.length) return null;   // no neighbour on the other side: a plain carry
    T.carried = x; T.fallback = off;
    // the blocks pushed the way the carried block moves go with it over the last rows of its way, one step per common part; those pushed
    // the other way (under it, or over it) after it, one step per displacement
    const disp = ids.filter((id) => id !== x && after[id].y !== base[id].y).map((id) => [id, after[id].y - base[id].y]);
    const same = disp.filter(([, e]) => Math.sign(e) === Math.sign(d)), other = disp.filter(([, e]) => Math.sign(e) !== Math.sign(d));
    if (same.some(([, e]) => Math.abs(e) > Math.abs(d))) return null;
    const levels = [...new Set(same.map(([, e]) => Math.abs(e)))].sort((p, q) => q - p); let doneRows = 0;
    for (const L of [...levels, 0].map((v) => Math.abs(d) - v)) if (L > doneRows) { T.steps.push([[x, ...same.filter(([, e]) => Math.abs(d) - Math.abs(e) < L).map(([id]) => id)], Math.sign(d) * (L - doneRows)]); doneRows = L; }
    const byD = new Map(); for (const [id, e] of other) { if (!byD.has(e)) byD.set(e, []); byD.get(e).push(id); }
    for (const [e, list] of [...byD].sort((p, q) => Math.abs(p[0]) - Math.abs(q[0]))) T.steps.push([list, e]);
    for (const c of passes) T.pass.push([x, c]);
    const out = done(); if (checkDeclaration(baseF, out.T).length) return null; return out;
  }
  if (kind === 'carry' || kind === 'sideways') {
    const x = pick(ids), X = after[x], k = kind === 'sideways' ? pick([-1, 1]) : 0, d = int(-12, 12);
    if (!d && !k) return null;
    X.c0 += k; X.c1 += k; X.y += d; if (!inside(X)) return null;
    T.carried = x;
    const keepsAny = cols(base[x]).some((c) => c >= X.c0 && c <= X.c1);
    if (!keepsAny) return null;   // carried away entirely: phase 1b's GAP.6 and a put, two RELINKs (`away`)
    // sideways, it moves only into free room here: a block met from the side is pressed aside (`press`)
    if (k && ids.some((id) => id !== x && hits(after[id], X) && !cols(X).filter((c) => c >= base[id].c0 && c <= base[id].c1).some((c) => c >= base[x].c0 && c <= base[x].c1))) return null;
    if (!carrySettle(after, base, x)) return null;
    if (!commonParts(T, base, after, x, d)) return null;
    // a carry inside its columns changes no order (DRAG.B2): a case where the pushes did is the generator's, not SETTLE's
    if (ids.some((id) => after[id] && reorders(id).length)) return null;
    for (const c of cols(base[x])) if (c < X.c0 || c > X.c1) T.leave.push([x, c, 'narrow']);   // keeping some columns, as a narrowing (M9)
    for (const c of cols(X)) if (c < base[x].c0 || c > base[x].c1) T.enter.push([x, c, 'put']);
  } else if (kind === 'press') {
    // a carry sideways by a column that meets blocks from the side, at the same rows: each is pressed aside (P-ASIDE) in the carry's
    // direction, just clear of the carried block, keeping its rows (a press moves no row and is no step: a leave and an entry, `press` and
    // `self`), into free room (no chain of presses here); the carried block keeps some of its columns
    // drawn among the carries that meet a block from the side
    const meets = []; for (const id of ids) for (const k of [-2, -1, 1, 2]) { const M = { ...base[id], c0: base[id].c0 + k, c1: base[id].c1 + k };
      if (inside(M) && cols(base[id]).some((c) => covers(M, c)) && ids.some((o) => o !== id && hits(base[o], M) && !share(base[o], base[id]))) meets.push([id, k]); }
    if (!meets.length) return null;
    const [x, k] = pick(meets), X = after[x];
    X.c0 += k; X.c1 += k;
    const met = ids.filter((id) => id !== x && hits(after[id], X));
    for (const id of met) {
      if (share(base[id], base[x])) return null;   // met from above or under, not from the side
      const K = after[id], s = k > 0 ? X.c1 + 1 - K.c0 : X.c0 - 1 - K.c1; K.c0 += s; K.c1 += s;
      if (!inside(K)) return null;
    }
    for (const id of [x, ...met]) if (ids.some((o) => o !== id && hits(after[o], after[id]))) return null;
    T.carried = x;
    for (const c of cols(base[x])) if (!covers(X, c)) T.leave.push([x, c, 'narrow']);
    for (const c of cols(X)) if (!covers(base[x], c)) T.enter.push([x, c, 'put']);
    for (const id of met) { for (const c of cols(base[id])) if (!covers(after[id], c)) T.leave.push([id, c, 'press']);
      for (const c of cols(after[id])) if (!covers(base[id], c)) T.enter.push([id, c, 'self']); }
  } else if (kind === 'swap') {
    // the carried block and the next block under or over it in a column they share (LAYOUT-RULES §5.1b, phase 3, DRAG.B4): the carried
    // block is pinned right against the neighbour, on its touching row; going down, the neighbour takes the carried block's pinned row and
    // the carried block stands right under it; going up, the carried block takes the neighbour's top row and the neighbour stands right
    // under it. The neighbour counts as a block that stayed and moved: the carried block passes it; the neighbour may pass another block
    // in a column of its own the carried block does not cover
    const x = pick(ids), X = base[x], down = r() < 0.5, hX = X.h + (X.e || 0);
    const near = ids.filter((id) => id !== x && share(base[id], X) && (down ? base[id].y >= X.y + hX : base[id].y + base[id].h + (base[id].e || 0) <= X.y))
      .sort((a, b) => (down ? base[a].y - base[b].y : base[b].y - base[a].y));
    if (!near.length) return null;
    const n = near[0], N = base[n], hN = N.h + (N.e || 0);
    const between = (c) => ids.some((id) => id !== x && id !== n && base[id].c0 <= c && c <= base[id].c1 && base[id].y > Math.min(X.y, N.y) && base[id].y < Math.max(X.y, N.y));
    if (cols(X).filter((c) => c >= N.c0 && c <= N.c1).every(between)) return null;
    // going down, the carried block may push the neighbour first (P-DOWN, its lower neighbours following), which then stops and lets it
    // through (M2, M6): pinned where it stopped, the carried block right against it
    const push = down && r() < 0.5 ? int(1, 4) : 0;
    let xp, xy, ny, pN = N.y;
    if (push) {
      after[x].y = N.y - hX + push;
      if (!carrySettle(after, base, x) || after[n].y !== N.y + push) return null;
      if (!commonParts(T, base, after, x, after[x].y - X.y)) return null;
      pN = after[n].y; xp = after[x].y;
    } else xp = down ? N.y - hX : N.y + hN;
    if (down) { ny = xp; xy = ny + hN; } else { xy = N.y; ny = xy + hX; }
    after[x].y = xy; after[n].y = ny;
    if (!inside(after[x]) || !inside(after[n])) return null;
    if (ids.some((id) => id !== x && id !== n && (hits(after[id], after[n]) || hits(after[id], after[x]) || hits(after[id], { ...X, y: xp })))) return null;
    T.carried = x; T.swap = [x, n];
    if (!push && xp !== X.y) T.steps.push([[x], xp - X.y]);   // the pin
    if (down) { T.steps.push([[n], ny - pN]); T.steps.push([[x], xy - xp]); } else { T.steps.push([[x], xy - xp]); T.steps.push([[n], ny - pN]); }
    // the carried block changes its order with the neighbour only; anything else it would pass, P-DOWN or P-UP would have pushed
    if (reorders(x, n).length) return null;
    for (const c of reorders(x)) T.pass.push([x, c]);
    for (const c of reorders(n, x)) T.pass.push([n, c]);
  } else if (kind === 'width') {
    const x = pick(ids), X = after[x], z = Math.min(off + W - 1, Math.max(X.c0 + 2 * pad(X), X.c1 + pick([-1, 0, 1]))), a = Math.min(z - 2 * pad(X), Math.max(off, X.c0 + pick([-1, 0, 1])));   // a card column at least
    if (a === X.c0 && z === X.c1) return null;
    const was = cols(X); X.c0 = a; X.c1 = z;
    if (r() < 0.3) {   // the re-measure at the new width: the blocks under it follow (FOLLOW, no move), from the rows `start` states
      X.h = Math.max(1 + 2 * pad(X), X.h + pick([-1, 1]));
      if (!opts.rowsWith) return null;
      followRows();
    }
    if (ids.some((id) => id !== x && hits(after[id], X))) return null;
    for (const c of was) if (c < a || c > z) T.leave.push([x, c, 'narrow']);
    for (const c of cols(X)) if (!was.includes(c)) T.enter.push([x, c, 'self']);
  } else if (kind === 'create') {
    const area = r() < 0.3, c0 = off + int(0, W - 2), b = { c0, c1: Math.min(off + W - 1, c0 + int(area ? 2 : 0, 3)), y: int(0, 30), h: int(area ? 3 : 1, area ? 5 : 3), e: 0, ...(area ? { area: true } : {}) };
    if ((area && b.c1 - b.c0 < 2) || Object.values(after).some((o) => hits(o, b))) return null;
    const id = 'n' + Math.floor(r() * 1e6); after[id] = b;
    for (const c of cols(b)) T.enter.push([id, c, 'put']);
  } else if (kind === 'delete') {
    delete after[pick(ids)];
  } else if (kind === 'away') {
    // carried away to other columns (DRAG.B1): phase 1b takes it away first (GAP.6), so this RELINK's after does not hold it; the next
    // RELINK puts it where it lands (putBack), as a block base does not hold
    const x = pick(ids); delete after[x];
    const out = done(); out.then = { id: x, block: toFrame(base[x]) }; return out;
  } else if (kind === 'back' || kind === 'restore') {
    // an undo placed by its canonical row in every column (LAYOUT-ENGINE-PLAN §6.4): `back`, an undone carry, the block back at an old
    // cell, leaving every column it had as carried away and coming back into every column it has; `restore`, an undone deletion, a block
    // base does not hold made again at its old cell. The cell is free in both measures and moves no other block
    const x = kind === 'back' ? pick(ids) : 'r' + Math.floor(r() * 1e6), area = kind === 'restore' && r() < 0.3;
    const X = kind === 'back' ? base[x] : { c0: 0, c1: int(area ? 2 : 0, 3), h: int(area ? 3 : 1, area ? 5 : 3), e: 0, ...(area ? { area: true } : {}) };
    const w = X.c1 - X.c0; if (w > W - 1) return null;
    // the blocks its departure moves: those under its old place, and, with GAP.5.2 off, those that stood in its stack above it; known from
    // the rows FOLLOW gives once it is away, when the caller gives them
    const rw = kind === 'back' && opts.rowsWithout ? opts.rowsWithout(x) : null;
    const R = kind !== 'back' ? new Set() : rw ? new Set(ids.filter((id) => id !== x && id in rw && rw[id] - pad(base[id]) !== base[id].y)) : reachedFrom(base, x);
    const c0 = off + int(0, W - 1 - w), yc = int(0, 30), y = canonicalCell(base, X, c0, c0 + w, yc, kind === 'back' ? x : null, R);
    if (y == null) return null;
    after[x] = { ...X, c0, c1: c0 + w, y, yc };
    T.carried = x; T.canonical = true;
    if (kind === 'back') {
      // the blocks its departure moves (under its old place, rising into it, its rows going with it): their rows after are those FOLLOW
      // gives once it is away
      if (rw) for (const id of R) after[id].y = rw[id] - pad(after[id]);
      for (const c of cols(base[x])) T.leave.push([x, c, 'away']);
    }
    for (const c of cols(after[x])) T.enter.push([x, c, 'back']);
  } else if (kind === 'height') {
    // a real height: the blocks under it follow with their gaps (FOLLOW, no move), so after holds the rows FOLLOW gives over base's
    // stacks with the new height, which are also the rows the first step would start from (`start`); that needs the stacks: `rowsWith`
    if (!opts.rowsWith) return null;
    const x = pick(ids); after[x].h = Math.max(1 + 2 * pad(after[x]), after[x].h + pick([-2, -1, 1, 2]));
    followRows();
  }
  return done();
}

/** The RELINK that puts a block carried away where it lands (DRAG.B1, after phase 1b's GAP.6): a free cell on the screen in columns
 *  off…off+W-1, the block carried, coming in where it is put in every column, as a block base does not hold. */
export function putBack(r, baseF, then, opts = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = opts.W ?? 8, off = opts.off ?? 0;
  const base = Object.fromEntries(Object.entries(baseF).map(([id, b]) => [id, toExt(b)])), X = toExt(then.block), w = X.c1 - X.c0;
  if (w > W - 1) return null;
  const c0 = off + int(0, W - 1 - w), b = { ...X, c0, c1: c0 + w, y: int(0, 30) };
  delete b.yc;
  if (Object.values(base).some((o) => hits(o, b))) return null;
  const after = Object.fromEntries(Object.entries(baseF).map(([id, f]) => { const g = { ...f }; delete g.yc; return [id, g]; }));
  after[then.id] = toFrame(b);
  const T = { after, steps: [], leave: [], enter: cols(b).map((c) => [then.id, c, 'put']), pass: [], carried: then.id };
  return { kind: 'put', after, T };
}
