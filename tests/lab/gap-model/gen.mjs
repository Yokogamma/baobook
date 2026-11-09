// Random transitions as SETTLE would declare them (step 1b of docs/LAYOUT-ENGINE-PLAN.md), built from the action, never read back from
// the stacks: a carry of one block (vertically, sideways, or away) with the blocks it reaches sinking or going up as rigid steps, a swap
// with the neighbour right under the carried block, a width change (narrowed, widened, shifted), a block created or deleted, a height,
// under temporary heights. Each gives the geometry after it and the declaration of the model's relink(T); declare.mjs checks that the
// declaration explains the geometry. Text blocks only (areas: next). The generator's version goes with every saved example.
export const GEN_VERSION = 4;

export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
const share = (a, b) => a.c0 <= b.c1 && b.c0 <= a.c1;
const hits = (a, b) => share(a, b) && a.y < b.y + b.h + (b.e || 0) && b.y < a.y + a.h + (a.e || 0);
const clone = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));

/** A random sheet of n text blocks in columns off…off+W-1, a free row between any two that share a column. */
export function sheet(r, n, { off = 0, W = 8, rows = 24, pre = 'b' } = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), out = [];
  for (let i = 0; i < n; i++) for (let t = 0; t < 40; t++) {
    const c0 = off + int(0, W - 2), b = { id: pre + i, c0, c1: Math.min(off + W - 1, c0 + int(0, 3)), y: int(0, rows), h: int(1, 3), e: 0 };
    if (!out.some((o) => share(o, b) && o.y < b.y + b.h + 1 && b.y < o.y + o.h + 1)) { out.push(b); break; }
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
function carrySettle(after, base, x) {
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
    const K = after[id], over = wasOver(id, x) ?? !(2 * K.y + K.h + (K.e || 0) > 2 * X.y);
    if (!over && K.y < bottom(X)) sink(id, bottom(X) - K.y);
    else if (over && bottom(K) > X.y) { if (!rise(id, bottom(K) - X.y)) return false; }
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

/** One random action on `base` ({id: block}); returns {kind, after, T} or null when the draw gives no valid transition. */
export function action(r, base, opts = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = (a) => a[Math.floor(r() * a.length)];
  const ids = Object.keys(base); if (!ids.length) return null;
  const kinds = opts.kinds || ['carry', 'carry', 'carry', 'sideways', 'swap', 'swap', 'swap', 'swap', 'width', 'width', 'compose', 'create', 'delete', 'height'];
  const kind = pick(kinds), after = clone(base), W = opts.W ?? 8, off = opts.off ?? 0;
  const T = { after, steps: [], leave: [], enter: [], pass: [], carried: null };
  const reorders = (x, but = null) => {   // the columns where x, which keeps them, changes its order with another block (not `but`) that keeps them
    const out = [];
    for (const id of ids) if (id !== x && id !== but && after[id]) for (const c of cols(base[x])) {
      if (!(c >= after[x].c0 && c <= after[x].c1) || !(c >= base[id].c0 && c <= base[id].c1) || !(c >= after[id].c0 && c <= after[id].c1)) continue;
      if ((base[x].y < base[id].y) !== (after[x].y < after[id].y) && !out.includes(c)) out.push(c);
    }
    return out;
  };
  if (kind === 'compose') {
    // a carry and, in the same RELINK, another block narrowed or widened by a column where nothing is: as phase 8 relinks a carry with
    // the blocks P-ASIDE pressed (pressing itself is not made here)
    const c = action(r, base, { ...opts, kinds: ['carry'] }); if (!c) return null;
    const free = ids.filter((id) => id !== c.T.carried && c.after[id] && c.after[id].y === base[id].y); if (!free.length) return null;
    const k = pick(free), K = c.after[k], a = Math.max(off, K.c0 + pick([-1, 0, 1])), z = Math.min(off + W - 1, Math.max(a, K.c1 + pick([-1, 0, 1])));
    if (a === K.c0 && z === K.c1) return null;
    const was = cols(K), nk = { ...K, c0: a, c1: z };
    if (ids.some((id) => id !== k && c.after[id] && hits(c.after[id], nk))) return null;
    c.after[k] = nk;
    for (const col of was) if (col < a || col > z) c.T.leave.push([k, col, 'narrow']);
    for (const col of cols(nk)) if (!was.includes(col)) c.T.enter.push([k, col, 'self']);
    return { kind, after: c.after, T: c.T };
  }
  if (kind === 'carry' || kind === 'sideways') {
    const x = pick(ids), X = after[x], k = kind === 'sideways' ? pick([-1, 1]) : 0, d = int(-12, 12);
    if (!d && !k) return null;
    X.c0 += k; X.c1 += k; X.y += d; if (X.y < 0 || X.c0 < off || X.c1 > off + W - 1) return null;
    T.carried = x;
    const keepsAny = cols(base[x]).some((c) => c >= X.c0 && c <= X.c1);
    if (!keepsAny) return null;   // carried away entirely: phase 1b's GAP.6 and a creation, not one RELINK
    // sideways, it moves only into free room: a block met from the side would be P-ASIDE's, which this generator does not make
    if (k && ids.some((id) => id !== x && hits(after[id], X) && !cols(X).filter((c) => c >= base[id].c0 && c <= base[id].c1).some((c) => c >= base[x].c0 && c <= base[x].c1))) return null;
    if (!carrySettle(after, base, x)) return null;
    if (!commonParts(T, base, after, x, d)) return null;
    // a carry inside its columns changes no order (DRAG.B2): a case where the pushes did is the generator's, not SETTLE's
    if (ids.some((id) => after[id] && reorders(id).length)) return null;
    for (const c of cols(base[x])) if (c < X.c0 || c > X.c1) T.leave.push([x, c, 'away']);
    for (const c of cols(X)) if (c < base[x].c0 || c > base[x].c1) T.enter.push([x, c, 'put']);
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
    // a swap of a block with a temporary height is an open question of the contract (transition-cases.mjs: the neighbour moved by the
    // carried block's height on the screen keeps those rows canonically, and lands a row lower): left out until it is settled
    if ((X.e || 0) || (N.e || 0)) return null;
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
    if (ids.some((id) => id !== x && id !== n && (hits(after[id], after[n]) || hits(after[id], after[x]) || hits(after[id], { ...X, y: xp })))) return null;
    T.carried = x; T.swap = [x, n];
    if (!push && xp !== X.y) T.steps.push([[x], xp - X.y]);   // the pin
    if (down) { T.steps.push([[n], ny - pN]); T.steps.push([[x], xy - xp]); } else { T.steps.push([[x], xy - xp]); T.steps.push([[n], ny - pN]); }
    // the carried block changes its order with the neighbour only; anything else it would pass, P-DOWN or P-UP would have pushed
    if (reorders(x, n).length) return null;
    for (const c of reorders(x)) T.pass.push([x, c]);
    for (const c of reorders(n, x)) T.pass.push([n, c]);
  } else if (kind === 'width') {
    const x = pick(ids), X = after[x], a = Math.max(off, X.c0 + pick([-1, 0, 1])), z = Math.min(off + W - 1, Math.max(a, X.c1 + pick([-1, 0, 1])));
    if (a === X.c0 && z === X.c1) return null;
    const was = cols(X); X.c0 = a; X.c1 = z;
    if (r() < 0.3) X.h = Math.max(1, X.h + pick([-1, 1]));   // the re-measure at the new width
    if (ids.some((id) => id !== x && hits(after[id], X))) return null;
    for (const c of was) if (c < a || c > z) T.leave.push([x, c, 'narrow']);
    for (const c of cols(X)) if (!was.includes(c)) T.enter.push([x, c, 'self']);
  } else if (kind === 'create') {
    const c0 = off + int(0, W - 2), b = { c0, c1: Math.min(off + W - 1, c0 + int(0, 3)), y: int(0, 30), h: int(1, 3), e: 0 };
    if (Object.values(after).some((o) => hits(o, b))) return null;
    const id = 'n' + Math.floor(r() * 1e6); after[id] = b;
    for (const c of cols(b)) T.enter.push([id, c, 'put']);
  } else if (kind === 'delete') {
    delete after[pick(ids)];
  } else if (kind === 'height') {
    const x = pick(ids); after[x].h = Math.max(1, after[x].h + pick([-2, -1, 1, 2]));
    // a taller block pushes what is under it by FOLLOW: no move to declare; the rows after are what FOLLOW will give, which RELINK
    // does not read for blocks it does not move
  }
  return { kind, after, T };
}
