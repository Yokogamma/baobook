// Random transitions as SETTLE would declare them (step 1b of docs/LAYOUT-ENGINE-PLAN.md), built from the action, never read back from
// the stacks: a carry of one block (vertically, sideways, or away) with the blocks it reaches sinking or going up as rigid steps, a swap
// with the neighbour right under the carried block, a width change (narrowed, widened, shifted), a block created or deleted, a height,
// under temporary heights. Each gives the geometry after it and the declaration of the model's relink(T); declare.mjs checks that the
// declaration explains the geometry. Text blocks only (areas: next). The generator's version goes with every saved example.
export const GEN_VERSION = 2;

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
// column with it in base keeps the side it had (DRAG.B2); any other is below when its middle is below x's. One judged below that reaches
// x (its top above x's bottom, overlapping or not, so a pointer that jumps past it still pushes it: «Reaches») sinks right under it
// (P-DOWN); one judged above that reaches it (its bottom below x's top) goes up right over it (P-UP). Then every pair that still hits:
// one pushed up pushes the block over it up too, else the lower one sinks, the order two blocks had in a column they shared in base
// kept (P-SEP). Each move is a rigid step of one block. Returns the steps, or null when a block would go above row 0, a side meeting
// would need P-ASIDE, or it does not settle.
function carrySettle(after, base, x) {
  const steps = [], X = after[x], up = new Set(), bottom = (b) => b.y + b.h + (b.e || 0);
  const wasOver = (a, b) => (base[a] && base[b] && share(base[a], base[b]) ? base[a].y < base[b].y : null);
  const move = (id, d) => { if (!d) return true; if (after[id].y + d < 0) return false; after[id].y += d; steps.push([[id], d]); return true; };
  for (const id of Object.keys(after).sort()) {
    if (id === x || !share(after[id], X)) continue;
    const K = after[id], over = wasOver(id, x) ?? (2 * K.y + K.h + (K.e || 0) <= 2 * X.y + X.h + (X.e || 0));
    if (!over && K.y < bottom(X)) { if (!move(id, bottom(X) - K.y)) return null; }
    else if (over && bottom(K) > X.y) { if (!move(id, X.y - bottom(K))) return null; up.add(id); }
  }
  for (let round = 0; round < 80; round++) {
    const ids = Object.keys(after).sort(); let pair = null;
    for (const a of ids) for (const b of ids) if (a < b && hits(after[a], after[b])) { pair = [a, b]; break; }
    if (!pair) return steps;
    let [a, b] = pair; if (a === x || b === x) return null;   // a block the pushes put back into the carried one
    const aOver = wasOver(a, b) ?? (after[a].y < after[b].y || (after[a].y === after[b].y && after[a].c0 < after[b].c0));
    const [top, low] = aOver ? [a, b] : [b, a];
    if (up.has(low)) { if (!move(top, after[low].y - bottom(after[top]))) return null; up.add(top); }
    else if (!move(low, bottom(after[top]) - after[low].y)) return null;
  }
  return null;
}

/** One random action on `base` ({id: block}); returns {kind, after, T} or null when the draw gives no valid transition. */
export function action(r, base, opts = {}) {
  const int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = (a) => a[Math.floor(r() * a.length)];
  const ids = Object.keys(base); if (!ids.length) return null;
  const kinds = opts.kinds || ['carry', 'carry', 'carry', 'sideways', 'swap', 'swap', 'width', 'width', 'create', 'delete', 'height'];
  const kind = pick(kinds), after = clone(base), W = opts.W ?? 8, off = opts.off ?? 0;
  const T = { after, steps: [], leave: [], enter: [], pass: [], carried: null };
  const reorders = (x) => {   // the columns where x, which keeps them, changes its order with another block that keeps them
    const out = [];
    for (const id of ids) if (id !== x && after[id]) for (const c of cols(base[x])) {
      if (!(c >= after[x].c0 && c <= after[x].c1) || !(c >= base[id].c0 && c <= base[id].c1) || !(c >= after[id].c0 && c <= after[id].c1)) continue;
      if ((base[x].y < base[id].y) !== (after[x].y < after[id].y) && !out.includes(c)) out.push(c);
    }
    return out;
  };
  if (kind === 'carry' || kind === 'sideways') {
    const x = pick(ids), X = after[x], k = kind === 'sideways' ? pick([-1, 1]) : 0, d = int(-12, 12);
    if (!d && !k) return null;
    X.c0 += k; X.c1 += k; X.y += d; if (X.y < 0 || X.c0 < off || X.c1 > off + W - 1) return null;
    T.carried = x;
    const keepsAny = cols(base[x]).some((c) => c >= X.c0 && c <= X.c1);
    if (!keepsAny) return null;   // carried away entirely: phase 1b's GAP.6 and a creation, not one RELINK
    // sideways, it moves only into free room: a block met from the side would be P-ASIDE's, which this generator does not make
    if (k && ids.some((id) => id !== x && hits(after[id], X) && !cols(X).filter((c) => c >= base[id].c0 && c <= base[id].c1).some((c) => c >= base[x].c0 && c <= base[x].c1))) return null;
    const st = carrySettle(after, base, x); if (!st) return null;
    // the moves as rigid steps, one per common part (LAYOUT-RULES GAP's inputs): a block the carry pushes moves with it over the last rows
    // of its way, so x alone first, then x with every block pushed at least that far, and so on
    const disp = Object.keys(after).filter((id) => id !== x && base[id] && after[id].y !== base[id].y).map((id) => [id, after[id].y - base[id].y]);
    if (disp.some(([, e]) => Math.sign(e) !== Math.sign(d) || Math.abs(e) > Math.abs(d))) return null;
    const levels = [...new Set(disp.map(([, e]) => Math.abs(e)))].sort((p, q) => q - p);
    let done = 0;
    for (const L of [...levels, 0].map((v) => Math.abs(d) - v)) {
      if (L > done) { const with_ = disp.filter(([, e]) => Math.abs(d) - Math.abs(e) < L).map(([id]) => id); T.steps.push([[x, ...with_], Math.sign(d) * (L - done)]); done = L; }
    }
    // a carry inside its columns changes no order (DRAG.B2): a case where the pushes did is the generator's, not SETTLE's
    if (ids.some((id) => after[id] && reorders(id).length)) return null;
    for (const c of cols(base[x])) if (c < X.c0 || c > X.c1) T.leave.push([x, c, 'away']);
    for (const c of cols(X)) if (c < base[x].c0 || c > base[x].c1) T.enter.push([x, c, 'put']);
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
    for (const c of reorders(x)) T.pass.push([x, c]);
    for (const c of reorders(n)) T.pass.push([n, c]);
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
