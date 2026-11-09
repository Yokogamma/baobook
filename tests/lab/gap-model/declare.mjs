// What a transition must declare, computed from the geometry alone (step 1b of docs/LAYOUT-ENGINE-PLAN.md): every column a block
// leaves or comes into, and every change of order in a column two blocks keep, read from `base` and `after` with no stacks, no LIS and
// nothing of the model's or the engine's code; and the check of a declaration of the model's relink(T) against them and against the
// kinds of action that may make each reason. It checks that the declaration is consistent with the geometry; what the action meant
// comes from the declaration itself.
//
// base and after: {id: {c0, c1, y, h, e, area}} in frame coordinates (y the displayed row; an area by its frame, which this file turns
// into its extent, as GAP counts it). T as model.mjs's relink takes it, with `swap` the two blocks of a swap when there is one: the carried
// block and its neighbour.

const extent = (b) => { const p = b.area ? 1 : 0; return { c0: b.c0 - p, c1: b.c1 + p, y: b.y - p, h: b.h + 2 * p, e: b.e || 0 }; };
const cols = (b) => { const r = []; for (let c = b.c0; c <= b.c1; c++) r.push(c); return r; };
const covers = (b, c) => b.c0 <= c && c <= b.c1;
const kc = (id, c) => id + '|' + c;

/** Every column each block leaves and comes into, and every pair of blocks whose order changes in a column both keep. */
export function explain(base, after) {
  const B = new Map(Object.entries(base).map(([id, b]) => [id, extent(b)])), A = new Map(Object.entries(after).map(([id, b]) => [id, extent(b)]));
  const left = [], entered = [], reordered = [];
  for (const [id, b] of B) for (const c of cols(b)) if (!A.has(id) || !covers(A.get(id), c)) left.push([id, c]);
  for (const [id, a] of A) for (const c of cols(a)) if (!B.has(id) || !covers(B.get(id), c)) entered.push([id, c]);
  const all = new Set(); for (const b of B.values()) for (const c of cols(b)) all.add(c);
  for (const c of [...all].sort((p, q) => p - q)) {
    const keep = [...B.keys()].filter((id) => A.has(id) && covers(B.get(id), c) && covers(A.get(id), c));
    for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
      const p = keep[i], q = keep[j], before = B.get(p).y < B.get(q).y, now = A.get(p).y < A.get(q).y;
      if (before !== now) reordered.push(before ? [c, p, q] : [c, q, p]);   // [column, the block above in base, the one under it]
    }
  }
  return { left, entered, reordered };
}

/** The errors of a declaration T for the transition from base: [] when it explains the geometry and every reason is one its action may give. */
export function checkDeclaration(base, T) {
  const errs = [], after = T.after, carried = T.carried ?? null, canonical = !!T.canonical, swap = T.swap || [];
  const g = explain(base, after);
  const LV = new Map((T.leave || []).map(([id, c, w]) => [kc(id, c), w])), EN = new Map((T.enter || []).map(([id, c, h]) => [kc(id, c), h]));
  const PS = new Map((T.pass || []).map(([id, c]) => [kc(id, c), true]));
  const leftSet = new Set(g.left.map(([id, c]) => kc(id, c))), enteredSet = new Set(g.entered.map(([id, c]) => kc(id, c)));
  // an undo's carry back leaves every column it had and comes back into every column it has, those it keeps included
  if (canonical && carried != null && base[carried] && after[carried]) {
    for (const c of cols(extent(base[carried]))) leftSet.add(kc(carried, c));
    for (const c of cols(extent(after[carried]))) enteredSet.add(kc(carried, c));
  }
  // coverage: what leaves and what comes in is declared, exactly; a block after does not hold needs nothing (GAP.6)
  for (const k of leftSet) { const id = k.slice(0, k.lastIndexOf('|')); if (after[id] && !LV.has(k)) errs.push(`leave of ${k} not declared`); }
  for (const k of LV.keys()) if (!leftSet.has(k)) errs.push(`declared leave ${k} is not in the geometry`);
  for (const k of enteredSet) if (!EN.has(k)) errs.push(`entry of ${k} not declared`);
  for (const k of EN.keys()) if (!enteredSet.has(k)) errs.push(`declared entry ${k} is not in the geometry`);
  // order: every pair whose order changes in a column both keep has a declared passer there, and every declared passer changes its order
  // with some block there: a pass the geometry does not show would free its place for nothing
  for (const [c, p, q] of g.reordered) if (!PS.has(kc(p, c)) && !PS.has(kc(q, c))) errs.push(`${p} and ${q} change their order in column ${c} with no declared pass`);
  for (const k of PS.keys()) { const [id, c] = [k.slice(0, k.lastIndexOf('|')), +k.slice(k.lastIndexOf('|') + 1)];
    if (!base[id] || !after[id] || !covers(extent(base[id]), c) || !covers(extent(after[id]), c)) errs.push(`declared pass ${k} in a column it does not keep`);
    else if (!g.reordered.some(([cc, p, q]) => cc === c && (p === id || q === id))) errs.push(`declared pass ${k}: it changes its order with no block there`); }
  // a swap (LAYOUT-RULES §5.1b, phase 3): the carried block and the next block over or under it in a column they share in base, nothing
  // between them there, their order exchanged; going down, the neighbour takes the row the carried block is pinned at, right against it,
  // and the carried block stands right under it; going up, the carried block takes the neighbour's top row and the neighbour stands right
  // under it. The neighbour counts as a block that stayed and moved: in a column they share, the carried block is the one that passes
  if (T.swap) {
    const [x, n] = T.swap, X = base[x] && extent(base[x]), N = base[n] && extent(base[n]);
    if (x !== carried) errs.push(`swap ${x}/${n}: its first block is not the carried one`);
    else if (!N || !after[n] || !after[x]) errs.push(`swap ${x}/${n}: no such neighbour`);
    else {
      const shared = cols(X).filter((c) => covers(N, c)), AX = extent(after[x]), AN = extent(after[n]), hX = X.h + X.e, hN = N.h + N.e;
      const between = (c) => Object.entries(base).some(([id, b]) => { if (id === x || id === n) return false; const e = extent(b); const lo = Math.min(X.y, N.y), hi = Math.max(X.y, N.y); return covers(e, c) && e.y > lo && e.y < hi; });
      if (!shared.length) errs.push(`swap ${x}/${n}: they share no column`);
      else if (shared.every(between)) errs.push(`swap ${x}/${n}: a block stands between them in every column they share`);
      else if ((X.y < N.y) === (AX.y < AN.y)) errs.push(`swap ${x}/${n}: their order is not exchanged`);
      else if (X.y < N.y ? AN.y !== N.y - hX || AX.y !== AN.y + hN : AX.y !== N.y || AN.y !== AX.y + hX) errs.push(`swap ${x}/${n}: not at the rows the swap gives them`);
      for (const c of shared) if (PS.has(kc(n, c)) && !g.reordered.some(([cc, p, q]) => cc === c && (p === n || q === n) && p !== x && q !== x)) errs.push(`swap ${x}/${n}: in column ${c} the neighbour stayed and moved, the carried block passes it`);
    }
  }
  // the layout after holds no two blocks on one cell, on the screen (INV-1)
  { const A = Object.entries(after).map(([id, b]) => [id, extent(b)]);
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) { const [p, a] = A[i], [q, b] = A[j];
      if (a.c0 <= b.c1 && b.c0 <= a.c1 && a.y < b.y + b.h + b.e && b.y < a.y + a.h + a.e) errs.push(`${p} and ${q} overlap in after`); } }
  // the steps: blocks after holds; where no height changes, they bring every block they move to its row in after, and replayed in order
  // they put no block on another in a column both keep (a block a move pushes moves with it, in the same step: one step per common part);
  // the two blocks of a swap pass through each other by definition
  const heightsKept = Object.keys(base).every((id) => !after[id] || (base[id].h === after[id].h && (base[id].e || 0) === (after[id].e || 0)));
  const moved = new Map();
  for (const [ids, d] of T.steps || []) for (const id of ids) { if (!after[id]) errs.push(`step of ${id}, which after does not hold`); moved.set(id, (moved.get(id) || 0) + d); }
  if (heightsKept) {
    for (const [id, d] of moved) if (after[id] && extent(base[id]).y + d !== extent(after[id]).y) errs.push(`the steps of ${id} add up to ${d} rows, not to its row in after`);
    const y = new Map(Object.keys(base).filter((id) => after[id]).map((id) => [id, extent(base[id]).y])), pair = (p, q) => swap.includes(p) && swap.includes(q);
    const keptCols = (id) => { const a = extent(base[id]), b = extent(after[id]); return { c0: Math.max(a.c0, b.c0), c1: Math.min(a.c1, b.c1) }; };
    for (const [ids, d] of T.steps || []) {
      for (const id of ids) if (y.has(id)) y.set(id, y.get(id) + d);
      const live = [...y.keys()];
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const p = live[i], q = live[j]; if (pair(p, q)) continue;
        const a = keptCols(p), b = keptCols(q), hp = extent(base[p]).h + extent(base[p]).e, hq = extent(base[q]).h + extent(base[q]).e;
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && y.get(p) < y.get(q) + hq && y.get(q) < y.get(p) + hp) { errs.push(`replayed, a step puts ${p} on ${q}`); i = live.length; break; }
        const declared = (c0, c1) => { for (let c = c0; c <= c1; c++) if (PS.has(kc(p, c)) || PS.has(kc(q, c))) return true; return false; };
        if (a.c0 <= b.c1 && b.c0 <= a.c1 && (extent(base[p]).y < extent(base[q]).y) !== (y.get(p) < y.get(q)) && !declared(Math.max(a.c0, b.c0), Math.min(a.c1, b.c1))) { errs.push(`replayed, a step carries ${p} past ${q}`); i = live.length; break; }
      }
    }
  }
  // the reasons each action may give
  for (const [k, w] of LV) { const id = k.slice(0, k.lastIndexOf('|'));
    if (w === 'away' && id !== carried) errs.push(`${k}: only the carried block leaves as carried away`);
    if (id === carried && w !== 'away') errs.push(`${k}: the carried block leaves every column it leaves as carried away`);
    if (w === 'delete') errs.push(`${k}: a deleted block is one after does not hold, with no declaration`);
    if (!['away', 'narrow', 'press', 'delete'].includes(w)) errs.push(`${k}: no such reason to leave, ${w}`); }
  for (const [k, h] of EN) { const id = k.slice(0, k.lastIndexOf('|')), created = !base[id];
    if (h === 'put' && !((id === carried && !canonical) || created)) errs.push(`${k}: only the carried block or a created one comes in where it is put, and an undo's carry back by its canonical row`);
    if (h === 'back' && !(canonical && id === carried)) errs.push(`${k}: only an undo's carry back comes back by its canonical row`);
    if (h === 'self' && (created || id === carried)) errs.push(`${k}: a created or carried block does not come in by itself`);
    if (!['put', 'self', 'back'].includes(h)) errs.push(`${k}: no such way to come in, ${h}`); }
  // a carry inside its columns keeps every neighbour on its side (DRAG.B2) and pushes what it reaches; only a swap changes an order
  for (const k of PS.keys()) { const id = k.slice(0, k.lastIndexOf('|'));
    if (!swap.includes(id)) errs.push(`${k}: only a block of a swap changes its order`); }
  for (const [ids, d] of T.steps || []) { if (!Number.isInteger(d) || d === 0) errs.push(`a step of ${d} rows`); for (const id of ids) if (!base[id]) errs.push(`step of ${id}, not in base`); }
  return errs;
}
