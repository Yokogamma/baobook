// What a transition must declare, computed from the geometry alone (step 1b of docs/LAYOUT-ENGINE-PLAN.md): every column a block
// leaves or comes into, and every change of order in a column two blocks keep, read from `base` and `after` with no stacks, no LIS and
// nothing of the model's or the engine's code; and the check of a declaration of the model's relink(T) against them and against the
// kinds of action that may make each reason. It checks that the declaration is consistent with the geometry; what the action meant
// comes from the declaration itself.
//
// base and after: {id: {c0, c1, y, h, e, area}} in frame coordinates (y the displayed row; an area by its frame, which this file turns
// into its extent, as GAP counts it). T as model.mjs's relink takes it, with `swap` the two blocks of a swap when there is one.

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
  const PS = new Map((T.pass || []).map(([id, c, w]) => [kc(id, c), w]));
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
  // order: every pair whose order changes in a column both keep has a declared passer there
  for (const [c, p, q] of g.reordered) if (!PS.has(kc(p, c)) && !PS.has(kc(q, c))) errs.push(`${p} and ${q} change their order in column ${c} with no declared pass`);
  for (const k of PS.keys()) { const [id, c] = [k.slice(0, k.lastIndexOf('|')), +k.slice(k.lastIndexOf('|') + 1)];
    if (!base[id] || !after[id] || !covers(extent(base[id]), c) || !covers(extent(after[id]), c)) errs.push(`declared pass ${k} in a column it does not keep`); }
  // the reasons each action may give
  for (const [k, w] of LV) { const id = k.slice(0, k.lastIndexOf('|'));
    if (w === 'away' && id !== carried) errs.push(`${k}: only the carried block leaves as carried away`);
    if (w === 'delete') errs.push(`${k}: a deleted block is one after does not hold, with no declaration`);
    if (!['away', 'narrow', 'press', 'delete'].includes(w)) errs.push(`${k}: no such reason to leave, ${w}`); }
  for (const [k, h] of EN) { const id = k.slice(0, k.lastIndexOf('|')), created = !base[id];
    if (h === 'put' && !(id === carried || created)) errs.push(`${k}: only the carried block or a created one comes in where it is put`);
    if (h === 'back' && !(canonical && id === carried)) errs.push(`${k}: only an undo's carry back comes back by its canonical row`);
    if (h === 'self' && (created || id === carried)) errs.push(`${k}: a created or carried block does not come in by itself`);
    if (!['put', 'self', 'back'].includes(h)) errs.push(`${k}: no such way to come in, ${h}`); }
  for (const [k, w] of PS) { const id = k.slice(0, k.lastIndexOf('|'));
    if (!(id === carried || swap.includes(id))) errs.push(`${k}: only the carried block or a block of the swap changes its order`);
    if (w === 'away' && id !== carried) errs.push(`${k}: only the carried block leaves its place as carried away`);
    if (!['away', 'narrow'].includes(w)) errs.push(`${k}: no such reason to pass, ${w}`); }
  for (const [ids, d] of T.steps || []) { if (!Number.isInteger(d) || d === 0) errs.push(`a step of ${d} rows`); for (const id of ids) if (!base[id]) errs.push(`step of ${id}, not in base`); }
  return errs;
}
