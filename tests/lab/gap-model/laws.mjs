// The laws of a transition (step 1b of docs/LAYOUT-ENGINE-PLAN.md), checked on random transitions from gen.mjs, each first checked by
// declare.mjs: a declaration that does not explain its geometry is the generator's fault and fails the run. On the model for now; step 1b's
// second part runs them on the engine too, against the model.
//   1. valid: a valid base and an admissible declaration give a valid result, no exception and no broken invariant;
//   2. local: a transition in columns far away, in the same RELINK, changes nothing of the others: rows in both measures, columns,
//      heights and stacks with their owners and lends;
//   3. after-effects: from the result, deleting any block, narrowing any block by a column and ending every temporary height keep the
//      invariants;
//   4. landing: the blocks the steps move and the carried block stand where SETTLE put them, lower only where a block that came in by
//      itself pushes them on the screen, directly or through the blocks it pushes, shown by the same transition without that entry;
//   5. untouched: with no temporary rows, heights, deletions, departures but passes, or entries by themselves in a part, the blocks of
//      that part no step moves keep their rows in both measures;
//   6. split: two steps next to each other that move the same blocks, made one, give the same rows, owners and lends, and the same after
//      a moved block is taken away.
// The states have standing blocks: some blocks are inserted after the others are opened. A failure is shrunk (fewer blocks, fewer inserted
// ones, fewer temporary heights, the far transition dropped), keeping the declaration valid and the failure, and returned whole: the
// generator's version, the switches, the blocks, the inserted ones, the temporary heights and the declaration.
import { createModel } from './model.mjs';
import { checkDeclaration } from './declare.mjs';
import { rng, sheet, action, GEN_VERSION } from './gen.mjs';

const frames = (m) => Object.fromEntries([...m.B.values()].map((b) => [b.id, { c0: b.c0, c1: b.c1, y: b.y, h: b.h, e: b.e }]));
export function projection(m, ids) {
  const yc = m.rows('canonical'), y = m.rows();
  return JSON.stringify([...ids].sort().map((id) => {
    const b = m.B.get(id); if (!b) return [id, null];
    const s = []; for (let c = b.c0; c <= b.c1; c++) s.push(m.stack(id, c));
    return [id, b.c0, b.c1, y[id], yc[id], b.h, b.e, s];
  }));
}

/** Landing: every block the steps move and the carried block stand where SETTLE put them (`rows`, the result on the screen); lower only
 *  where a block that came in by itself pushes it on the screen (rule 5 never cuts a stack). That is shown, not assumed: the same
 *  transition without those entries (`withoutSelf()`: such a block keeps only the columns it kept, or, keeping none, stays in the columns
 *  it had) lands it where SETTLE put it, or higher. Being under such a block is not enough: one that comes into a free column by itself,
 *  with no temporary rows, pushes nothing. Returns the failure or null. */
export function landing(T, rows, { withoutSelf = () => null } = {}) {
  const a = T.after, self = T.enter.some(([, , h]) => h === 'self');
  const pushed = (id, want) => self && withoutSelf() != null && withoutSelf()[id] <= want;
  for (const id of new Set([...T.steps.flatMap(([ids]) => ids), ...(T.carried != null ? [T.carried] : [])])) {
    if (!(id in a) || !(id in rows)) continue;
    const want = a[id].y, got = rows[id];
    if (got < want || (got > want && !pushed(id, want))) return { law: 'landing', id, want, got };
  }
  return null;
}

// a state: the blocks not in `ins` opened as stored, then those in `ins` inserted in that order (they stand in the gaps they fall into),
// then the temporary heights
export function build(opts, blocks, ins, temps) {
  const m = createModel(opts).open(blocks.filter((b) => !ins.includes(b.id)));
  for (const id of ins) { const b = blocks.find((x) => x.id === id); if (b) m.insert(b); }
  for (const [id, e] of temps) if (m.B.has(id)) m.show(id, e);
  return m;
}

// one case: the blocks (frames), their temporary heights, the near and the far transition; returns a failure or null
export function runCase(c) {
  const mk = () => build(c.opts, c.blocks, c.ins || [], c.temps);
  const m1 = mk(), base = frames(m1), near = c.near, far = c.far;
  const T = far
    ? { after: { ...near.after, ...far.after }, steps: [...near.steps, ...far.steps], leave: [...near.leave, ...far.leave], enter: [...near.enter, ...far.enter], pass: [...near.pass, ...far.pass], carried: near.carried ?? far.carried, swap: near.swap || far.swap,
        ...(near.start || far.start ? { start: { ...(near.start || {}), ...(far.start || {}) } } : {}), ...(near.fallback || far.fallback ? { fallback: near.fallback || far.fallback } : {}) }
    : near;
  const errs = checkDeclaration(base, T); if (errs.length) return { law: 'declaration', errs };
  try { m1.relink(T); } catch (e) { return { law: 'valid', err: e.message }; }
  // landing: the run without the entries by themselves is made only when needed
  { const self = [...new Set(T.enter.filter(([, , h]) => h === 'self').map(([s]) => s))];
    let without;
    const withoutSelf = () => {
      if (without !== undefined) return without;
      without = null;
      const a2 = { ...T.after }; let leave = T.leave;
      for (const s of self) { if (!(s in base) || !(s in a2)) return null; const k0 = Math.max(base[s].c0, a2[s].c0), k1 = Math.min(base[s].c1, a2[s].c1);
        if (k0 <= k1) a2[s] = { ...a2[s], c0: k0, c1: k1 };
        else { a2[s] = { ...a2[s], c0: base[s].c0, c1: base[s].c1 }; leave = leave.filter(([id]) => id !== s); } }
      const m = mk(); try { m.relink({ ...T, after: a2, leave, enter: T.enter.filter(([, , h]) => h !== 'self') }); } catch (e) { return null; }
      return (without = m.rows());
    };
    const f = landing(T, m1.rows(), { withoutSelf }); if (f) return f; }
  // split: the same transition with two steps next to each other that move the same blocks made one step gives the same layout, rows,
  // owners and lends, and the same after a moved block is taken away (rule 1 does not depend on how a move is cut)
  { const merged = []; for (const [ids, d] of T.steps) { const p = merged[merged.length - 1];
      if (p && p[0].length === ids.length && p[0].every((v, i) => v === ids[i])) p[1] += d; else merged.push([ids.slice(), d]); }
    if (merged.length < T.steps.length && merged.every(([, d]) => d !== 0)) {
      const T2 = { ...T, steps: merged };
      if (!checkDeclaration(base, T2).length) {
        const m2 = mk(); try { m2.relink(T2); } catch (e) { return { law: 'split', err: e.message }; }
        if (m2.snapshot() !== m1.snapshot()) return { law: 'split', cut: m1.snapshot(), whole: m2.snapshot() };
        const id = merged.flatMap(([ids]) => ids).find((k) => m1.B.has(k));
        if (id) { const s1 = m1.save(), s2 = m2.save(); let a = null, b = null;
          try { m1.remove(id); a = m1.snapshot(); } catch (e) { a = 'refused'; } try { m2.remove(id); b = m2.snapshot(); } catch (e) { b = 'refused'; }
          m1.load(s1); m2.load(s2);
          if (a !== b) return { law: 'split', what: 'remove ' + id, cut: a, whole: b }; }
      } } }
  // untouched: with no temporary rows, no change of height, nothing taken away, no block leaving a column but by a pass and none coming in
  // by itself, in the blocks of a part, every block of that part no step moves keeps its row in both measures (a pass frees nothing, a move
  // changes only the gaps round what it moves)
  { const yc = m1.rows('canonical'), y = m1.rows(), moved = new Set([...T.steps.flatMap(([ids]) => ids), ...(T.carried != null ? [T.carried] : [])]);
    const bcanon = mk().rows('canonical');
    for (const p of ['a', 'z']) {
      const ids = Object.keys(base).filter((id) => id[0] === p);
      const quiet = ids.every((id) => id in T.after && !base[id].e && !(T.after[id].e || 0) && base[id].h === T.after[id].h)
        && !T.leave.some(([id]) => id[0] === p) && !T.enter.some(([id, , h]) => id[0] === p && h === 'self');
      if (!quiet) continue;
      for (const id of ids) if (!moved.has(id) && (y[id] !== base[id].y || yc[id] !== bcanon[id])) return { law: 'untouched', id, was: [base[id].y, bcanon[id]], got: [y[id], yc[id]] };
    } }
  if (far) {
    // the same near transition with the far blocks left as they were
    const m2 = mk(), alone = { ...near, after: { ...Object.fromEntries(Object.entries(base).filter(([id]) => id[0] === 'z')), ...near.after } };
    try { m2.relink(alone); } catch (e) { return { law: 'valid', err: 'alone: ' + e.message }; }
    const ids = Object.keys(near.after);
    if (projection(m1, ids) !== projection(m2, ids)) return { law: 'local', with: projection(m1, ids), alone: projection(m2, ids) };
    // and the other way: the far transition alone gives the far blocks what both together give them
    const m3 = mk(), farAlone = { ...far, after: { ...Object.fromEntries(Object.entries(base).filter(([id]) => id[0] !== 'z' && !(id in far.after))), ...far.after } };
    try { m3.relink(farAlone); } catch (e) { return { law: 'valid', err: 'far alone: ' + e.message }; }
    const fids = Object.keys(far.after);
    if (projection(m1, fids) !== projection(m3, fids)) return { law: 'local', side: 'far', with: projection(m1, fids), alone: projection(m3, fids) };
  }
  for (const id of Object.keys(T.after)) {
    const s = m1.save();
    try { m1.remove(id); } catch (e) { m1.load(s); return { law: 'after-effects', what: 'delete ' + id, err: e.message }; }
    m1.load(s);
    const b = m1.B.get(id);
    if (b && b.c1 > b.c0) { try { m1.width(id, b.c0, b.c1 - 1); } catch (e) { if (!/overlaps/.test(e.message)) { m1.load(s); return { law: 'after-effects', what: 'narrow ' + id, err: e.message }; } } m1.load(s); }
  }
  for (const [id] of c.temps) if (m1.B.has(id)) m1.show(id, 0);
  const inv = m1.check(); if (inv.length) return { law: 'after-effects', what: 'temporary heights ended', err: inv[0] };
  return null;
}

// a smaller case that still fails the same law: one block fewer (and what declares it), one temporary height fewer, no far transition
export function shrink(c, law) {
  const drop = (T, id) => ({ ...T, after: Object.fromEntries(Object.entries(T.after).filter(([k]) => k !== id)), steps: T.steps.map(([ids, d]) => [ids.filter((k) => k !== id), d]).filter(([ids]) => ids.length),
    leave: T.leave.filter(([k]) => k !== id), enter: T.enter.filter(([k]) => k !== id), pass: T.pass.filter(([k]) => k !== id), carried: T.carried === id ? null : T.carried });
  let cur = c;
  for (let changed = true; changed;) {
    changed = false;
    const tries = [];
    if (cur.far) tries.push({ ...cur, far: null, blocks: cur.blocks.filter((b) => b.id[0] !== 'z'), temps: cur.temps.filter(([id]) => id[0] !== 'z'), ins: (cur.ins || []).filter((id) => id[0] !== 'z') });
    // an inserted block opened as stored instead: a state with fewer standing blocks
    for (const id of cur.ins || []) tries.push({ ...cur, ins: cur.ins.filter((x) => x !== id) });
    // a temporary height dropped ends in after too, and the rows a declaration gives are then the generator's, so it must still check out
    const unshow = (T, id) => T && id in T.after ? { ...T, after: { ...T.after, [id]: { ...T.after[id], e: 0 } } } : T;
    for (const t of cur.temps) tries.push({ ...cur, temps: cur.temps.filter((x) => x !== t), near: unshow(cur.near, t[0]), far: unshow(cur.far, t[0]) });
    for (const b of cur.blocks) if (b.id !== cur.near.carried && !(cur.near.swap || []).includes(b.id) && !(cur.far && (cur.far.swap || []).includes(b.id))) tries.push({ ...cur, blocks: cur.blocks.filter((x) => x.id !== b.id), temps: cur.temps.filter(([id]) => id !== b.id), ins: (cur.ins || []).filter((id) => id !== b.id), near: drop(cur.near, b.id), far: cur.far && drop(cur.far, b.id) });
    for (const t of tries) { let f; try { f = runCase(t); } catch (e) { continue; } if (f && f.law === law) { cur = t; changed = true; break; } }
  }
  return cur;
}

/** N random cases; returns the counts and the first failure, shrunk. */
export function runLaws(N, { seed0 = 1 } = {}) {
  const counts = {}, inc = (k) => (counts[k] = (counts[k] || 0) + 1);
  let tried = 0, failure = null;
  for (let seed = seed0; tried < N && seed < seed0 + N * 40; seed++) {
    const r = rng(seed);
    const opts = { gap51: r() > 0.2, gap52: r() > 0.2, gap53: r() > 0.2, gap8: r() > 0.2, gap9: r() > 0.2 };
    const A = sheet(r, 5, { off: 0, pre: 'a' }), Z = sheet(r, 4, { off: 20, pre: 'z' });
    const blocks = [...A, ...Z].map(({ e, ...b }) => b), temps = blocks.filter(() => r() < 0.25).map((b) => [b.id, 1 + Math.floor(r() * 3)]);
    // a third of the blocks inserted after the others are opened, so that some stand in another block's gap, with lends
    const ins = blocks.filter(() => r() < 0.35).map((b) => b.id);
    let m; try { m = build(opts, blocks, ins, temps); } catch (e) { inc('no valid state drawn'); continue; }
    const standing = [...m.B.values()].some((b) => m.stack(b.id, b.c0) == null);
    const base = frames(m), part = (p) => Object.fromEntries(Object.entries(base).filter(([id]) => id[0] === p));
    // the rows FOLLOW gives over the stacks with other heights, for a height change; the far part's own blocks only, so that its `start`
    // names none of the near ones
    const rowsWith = (only) => (hs) => { const all = m.rowsWith(hs); return Object.fromEntries(Object.entries(all).filter(([id]) => id[0] === only)); };
    const ea = action(r, part('a'), { off: 0, rowsWith: rowsWith('a') }), ez = action(r, part('z'), { off: 20, rowsWith: rowsWith('z') });
    if (!ea || !ez) { inc('no valid action drawn'); continue; }
    if (ea.T.carried && ez.T.carried) { inc('two carried blocks drawn'); continue; }
    const near = { ...ea.T, after: { ...ea.after } }, far = { ...ez.T, after: { ...ez.after } };
    tried++; inc(ea.kind); if (near.pass.length) inc('with passes'); if (near.swap && near.pass.some(([id]) => id === near.swap[1])) inc('a swap neighbour passing'); if (near.swap && near.steps.some(([ids]) => ids.includes(near.swap[0]) && ids.includes(near.swap[1]))) inc('a swap after a push'); if (temps.length) inc('under temporary heights'); if (standing) inc('with standing blocks'); if (near.swap && near.swap.some((id) => base[id].e)) inc('a swap of a block with a temporary height');
    const c = { seed, opts, blocks, ins, temps, near, far }, f = runCase(c);
    if (f) { inc('failed: ' + f.law); if (!failure) failure = { GEN_VERSION, seed, failure: f, case: shrink(c, f.law) }; }
  }
  return { tried, counts, failure };
}
