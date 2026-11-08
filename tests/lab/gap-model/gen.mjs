// Random transitions as SETTLE would declare them (step 1b of docs/LAYOUT-ENGINE-PLAN.md), built from the action, never read back from
// the stacks: a carry of one block (vertically, sideways, or away) with the blocks it reaches sinking or going up as rigid steps, a swap
// with the neighbour right under the carried block, a width change (narrowed, widened, shifted), a block created or deleted, a height,
// under temporary heights. Each gives the geometry after it and the declaration of the model's relink(T); declare.mjs checks that the
// declaration explains the geometry. Text blocks only (areas: next). The generator's version goes with every saved example.
export const GEN_VERSION = 1;

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

// the blocks the moved block reaches, settled as SETTLE's primitives do in the large: a block judged below it (its middle lower) sinks
// right under it, one judged above goes up right over it, and so on for what those then hit (P-DOWN, P-UP, P-SEP), each as a rigid step
// of one block; the moved blocks never move. Returns the steps, or null when a block would go above row 0 or it does not settle
function settle(after, fixed, base) {
  const steps = [];
  // the order two blocks had in a column they shared in base is kept: the one that was under goes down, the one that was over goes up
  const order = (a, b) => (base[a] && base[b] && share(base[a], base[b]) ? (base[a].y < base[b].y ? -1 : 1) : 0);
  for (let round = 0; round < 60; round++) {
    let pair = null;
    const ids = Object.keys(after).sort();
    for (const a of ids) for (const b of ids) if (a < b && hits(after[a], after[b])) { pair = [a, b]; break; }
    if (!pair) return steps;
    let [a, b] = pair;
    if (fixed.has(a) && fixed.has(b)) return null;
    // the one that moves: never a fixed block; else the lower one (by middle), on the same middle the later in reading order
    const mid = (x) => 2 * after[x].y + after[x].h + (after[x].e || 0);
    let mover = fixed.has(a) ? b : fixed.has(b) ? a : mid(a) > mid(b) || (mid(a) === mid(b) && after[a].c0 > after[b].c0) ? a : b;
    const other = mover === a ? b : a, M = after[mover], O = after[other];
    // below the other one: by their order in base where they shared a column, else by their middles now (a carried block judged)
    const under = order(mover, other) !== 0 && !fixed.has(other) ? order(mover, other) > 0 : mid(mover) >= mid(other);
    let d = under ? O.y + O.h + (O.e || 0) - M.y : O.y - (M.y + M.h + (M.e || 0));
    if (M.y + d < 0) return null;
    M.y += d; steps.push([[mover], d]);
  }
  return null;
}

/** One random action on `base` ({id: block}); returns {kind, after, T} or null when the draw gives no valid transition. */
export function action(r, base, opts = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = (a) => a[Math.floor(r() * a.length)];
  const ids = Object.keys(base); if (!ids.length) return null;
  const kinds = opts.kinds || ['carry', 'carry', 'carry', 'sideways', 'swap', 'swap', 'width', 'width', 'create', 'delete', 'height'];
  const kind = pick(kinds), after = clone(base), W = opts.W ?? 8, off = opts.off ?? 0, passWhy = opts.passWhy || 'away';
  const T = { after, steps: [], leave: [], enter: [], pass: [], carried: null };
  const passesOf = (x, why) => {   // the columns where x, which keeps them, changes its order with another block
    for (const id of ids) if (id !== x && after[id]) for (const c of cols(base[x])) {
      if (!(c >= after[x].c0 && c <= after[x].c1) || !(c >= base[id].c0 && c <= base[id].c1) || !(c >= after[id].c0 && c <= after[id].c1)) continue;
      if ((base[x].y < base[id].y) !== (after[x].y < after[id].y) && !T.pass.some(([p, q]) => p === x && q === c)) T.pass.push([x, c, why]);
    }
  };
  if (kind === 'carry' || kind === 'sideways') {
    const x = pick(ids), X = after[x], k = kind === 'sideways' ? pick([-1, 1]) : 0, d = int(-12, 12);
    if (!d && !k) return null;
    X.c0 += k; X.c1 += k; X.y += d; if (X.y < 0 || X.c0 < off || X.c1 > off + W - 1) return null;
    T.carried = x;
    const keepsAny = cols(base[x]).some((c) => c >= X.c0 && c <= X.c1);
    if (!keepsAny) return null;   // carried away entirely: phase 1b's GAP.6 and a creation, not one RELINK
    if (d) T.steps.push([[x], d]);
    const st = settle(after, new Set([x]), base); if (!st) return null;
    T.steps.push(...st);
    for (const c of cols(base[x])) if (c < X.c0 || c > X.c1) T.leave.push([x, c, 'away']);
    for (const c of cols(X)) if (c < base[x].c0 || c > base[x].c1) T.enter.push([x, c, 'put']);
    passesOf(x, passWhy);
  } else if (kind === 'swap') {
    // the carried block and the next block under it in a column they share, the gap between them closed: going down, the neighbour takes
    // the carried block's row and the carried block stands right under it (DRAG.B4)
    const x = pick(ids), X = base[x];
    const under = ids.filter((id) => id !== x && share(base[id], X) && base[id].y >= X.y + X.h).sort((a, b) => base[a].y - base[b].y);
    if (!under.length) return null;
    const n = under[0], N = base[n];
    if (ids.some((id) => id !== x && id !== n && share(base[id], X) && share(base[id], N) && base[id].y > X.y && base[id].y < N.y)) return null;
    const ny = X.y, xy = X.y + N.h + (N.e || 0);
    after[n].y = ny; after[x].y = xy;
    for (const id of ids) if (id !== x && id !== n && (hits(after[id], after[n]) || hits(after[id], after[x]))) return null;
    T.carried = x; T.swap = [x, n];
    T.steps.push([[n], ny - N.y]); if (xy !== X.y) T.steps.push([[x], xy - X.y]);
    passesOf(x, passWhy); passesOf(n, 'narrow');
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
