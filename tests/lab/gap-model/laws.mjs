// The laws of a transition (step 1b of docs/LAYOUT-ENGINE-PLAN.md), checked on random transitions from gen.mjs, each first checked by
// declare.mjs: a declaration that does not explain its geometry is the generator's fault and fails the run. On the model for now; step 1b's
// second part runs them on the engine too, against the model.
//   1. valid: a valid base and an admissible declaration give a valid result, no exception and no broken invariant;
//   2. local: a transition in columns far away, in the same RELINK, changes nothing of the others: rows in both measures, columns,
//      heights and stacks with their owners and lends;
//   3. after-effects: from the result, deleting any block, narrowing any block by a column and ending every temporary height keep the
//      invariants.
// A failure is shrunk (fewer blocks, fewer temporary heights, the far transition dropped), keeping the declaration valid and the failure,
// and returned whole: the generator's version, the switches, the blocks, the temporary heights and the declaration.
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

// one case: the blocks (frames), their temporary heights, the near and the far transition; returns a failure or null
export function runCase(c) {
  const mk = () => { const m = createModel(c.opts).open(c.blocks); for (const [id, e] of c.temps) m.show(id, e); return m; };
  const m1 = mk(), base = frames(m1), near = c.near, far = c.far;
  const T = far
    ? { after: { ...near.after, ...far.after }, steps: [...near.steps, ...far.steps], leave: [...near.leave, ...far.leave], enter: [...near.enter, ...far.enter], pass: [...near.pass, ...far.pass], carried: near.carried ?? far.carried, swap: near.swap || far.swap }
    : near;
  const errs = checkDeclaration(base, T); if (errs.length) return { law: 'declaration', errs };
  try { m1.relink(T); } catch (e) { return { law: 'valid', err: e.message }; }
  if (far) {
    // the same near transition with the far blocks left as they were
    const m2 = mk(), alone = { ...near, after: { ...Object.fromEntries(Object.entries(base).filter(([id]) => id[0] === 'z')), ...near.after } };
    try { m2.relink(alone); } catch (e) { return { law: 'valid', err: 'alone: ' + e.message }; }
    const ids = Object.keys(near.after);
    if (projection(m1, ids) !== projection(m2, ids)) return { law: 'local', with: projection(m1, ids), alone: projection(m2, ids) };
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
    if (cur.far) tries.push({ ...cur, far: null, blocks: cur.blocks.filter((b) => b.id[0] !== 'z') });
    for (const t of cur.temps) tries.push({ ...cur, temps: cur.temps.filter((x) => x !== t) });
    for (const b of cur.blocks) if (b.id !== cur.near.carried) tries.push({ ...cur, blocks: cur.blocks.filter((x) => x.id !== b.id), temps: cur.temps.filter(([id]) => id !== b.id), near: drop(cur.near, b.id), far: cur.far && drop(cur.far, b.id) });
    for (const t of tries) { const f = runCase(t); if (f && f.law === law) { cur = t; changed = true; break; } }
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
    const m = createModel(opts).open(blocks); for (const [id, e] of temps) m.show(id, e);
    const base = frames(m), part = (p) => Object.fromEntries(Object.entries(base).filter(([id]) => id[0] === p));
    const ea = action(r, part('a'), { off: 0 }), ez = action(r, part('z'), { off: 20 });
    if (!ea || !ez) { inc('no valid action drawn'); continue; }
    if (ea.T.carried && ez.T.carried) { inc('two carried blocks drawn'); continue; }
    const near = { ...ea.T, after: { ...ea.after } }, far = { ...ez.T, after: { ...ez.after } };
    tried++; inc(ea.kind); if (near.pass.length) inc('with passes'); if (near.swap && near.pass.some(([id]) => id === near.swap[1])) inc('a swap neighbour passing'); if (temps.length) inc('under temporary heights');
    const c = { seed, opts, blocks, temps, near, far }, f = runCase(c);
    if (f) { inc('failed: ' + f.law); if (!failure) failure = { GEN_VERSION, seed, failure: f, case: shrink(c, f.law) }; }
  }
  return { tried, counts, failure };
}
