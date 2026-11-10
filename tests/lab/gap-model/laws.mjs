// The laws of a transition (step 1b of docs/LAYOUT-ENGINE-PLAN.md), checked on random transitions from gen.mjs, each first checked by
// declare.mjs: a declaration that does not explain its geometry is the generator's fault and fails the run. On the model, and, given a
// factory with its API (`make`, `twin`), on the engine through tests/lib/gapdriver.mjs, compared with the model case by case.
//   1. valid: a valid base and an admissible declaration give a valid result, no exception and no broken invariant;
//   2. local: a transition in columns far away, in the same RELINK, changes nothing of the others: rows in both measures, columns,
//      heights and stacks with their owners and lends;
//   3. after-effects: from the result, deleting any block, narrowing any block by a column and ending every temporary height keep the
//      invariants;
//   4. landing: the blocks the steps move and the carried block stand where SETTLE put them, lower only where another block's change of
//      columns pushes them on the screen (a block that came in by itself, or a temporary height through the rows a narrowed or pressed
//      block kept), directly or through the blocks it pushes, shown by the same transition without those changes;
//   5. untouched: with no temporary rows, heights, deletions, departures but passes, or entries by themselves in a part, the blocks of
//      that part no step moves keep their rows in both measures;
//   6. split: two steps next to each other that move the same blocks, made one, give the same rows, owners and lends, and the same after
//      a moved block is taken away.
// The states have standing blocks (some blocks are inserted after the others are opened), areas, and a history: up to a few transitions,
// and temporary heights starting or ending, made before the one the laws judge, so that the stacks hold the lends, rooms and slacks only
// moves leave. A failure is shrunk (fewer blocks, fewer inserted ones, fewer temporary heights, a shorter history, the far transition
// dropped), keeping every declaration valid and the failure, and returned whole: the generator's version, the switches, the blocks, the
// inserted ones, the temporary heights, the history and the declaration.
import { createModel } from './model.mjs';
import { checkDeclaration } from './declare.mjs';
import { rng, sheet, action, putBack, GEN_VERSION } from './gen.mjs';

const frames = (m) => m.frames();
// the two parts of a case, by columns: the near one left of column 20, the far one from it (a block a history created belongs to the part
// it is in)
export const partOf = (b) => (b.c0 < 20 ? 'a' : 'z');
export function projection(m, ids) {
  const yc = m.rows('canonical'), y = m.rows();
  return JSON.stringify([...ids].sort().map((id) => {
    const b = m.B.get(id); if (!b) return [id, null];
    const s = []; for (let c = b.c0; c <= b.c1; c++) s.push(m.stack(id, c));
    return [id, b.c0, b.c1, y[id], yc[id], b.h, b.e, s];
  }));
}

/** Landing: every block the steps move and the carried block stand where SETTLE put them (`rows`, the result on the screen); lower only
 *  where another block's change of columns pushes it on the screen (rule 5 never cuts a stack): a block that came in by itself, or a
 *  temporary height reaching it through the rows a block narrowed or pressed off kept (rule 2, rule 1). That is shown, not assumed: the
 *  same transition without those changes (`without()`: a block narrowed or pressed off keeps the columns it had; one that only came in by
 *  itself keeps only the columns it kept, or, keeping none, stays in the columns it had) lands it where SETTLE put it, or higher. Being
 *  under such a block is not enough: one that comes into a free column by itself, with no temporary rows, pushes nothing. Returns the
 *  failure or null. */
export function landing(T, rows, { without = () => null, canon = null } = {}) {
  const a = T.after, changes = T.enter.some(([, , h]) => h === 'self') || T.leave.some(([id, , w]) => id !== T.carried && (w === 'narrow' || w === 'press'));
  const pushed = (id, want) => changes && without() != null && without()[id] <= want;
  for (const id of new Set([...T.steps.flatMap(([ids]) => ids), ...(T.carried != null ? [T.carried] : [])])) {
    if (!(id in a) || !(id in rows)) continue;
    // an undo's carry back is placed by its canonical row (its displayed row is FOLLOW's from there)
    if (T.canonical && id === T.carried) { if (canon && a[id].yc != null && canon[id] !== a[id].yc) return { law: 'landing', id, want: a[id].yc, got: canon[id], measure: 'canonical' }; continue; }
    const want = a[id].y, got = rows[id];
    if (got < want || (got > want && !pushed(id, want))) return { law: 'landing', id, want, got };
  }
  return null;
}

// a state: the blocks not in `ins` opened as stored, then those in `ins` inserted in that order (they stand in the gaps they fall into),
// then the temporary heights
export function build(opts, blocks, ins, temps, history = [], make = createModel) {
  const m = make(opts).open(blocks.filter((b) => !ins.includes(b.id)));
  for (const id of ins) { const b = blocks.find((x) => x.id === id); if (b) m.insert(b); }
  for (const [id, e] of temps) if (m.B.has(id)) m.show(id, e);
  replay(m, history);
  return m;
}
// the history: transitions (checked by their declarations first) and temporary heights starting or ending
export function replay(m, history) {
  for (const h of history) {
    if (h.show) { if (m.B.has(h.show[0])) m.show(...h.show); continue; }
    const errs = checkDeclaration(frames(m), h.T); if (errs.length) throw new Error('history: ' + errs[0]);
    m.relink(h.T);
  }
}
// near and far in one RELINK
export const merge = (near, far) => (!far ? near : { after: { ...near.after, ...far.after }, steps: [...near.steps, ...far.steps], leave: [...near.leave, ...far.leave], enter: [...near.enter, ...far.enter], pass: [...near.pass, ...far.pass],
  carried: near.carried ?? far.carried, ...(near.canonical || far.canonical ? { canonical: true } : {}), ...(near.swap || far.swap ? { swap: near.swap || far.swap } : {}),
  ...(near.start || far.start ? { start: { ...(near.start || {}), ...(far.start || {}) } } : {}), ...(near.fallback || far.fallback ? { fallback: near.fallback || far.fallback } : {}) });

// one case: the blocks (frames), their temporary heights, the near and the far transition; returns a failure or null
export function runCase(c, make = createModel) {
  const mk = () => build(c.opts, c.blocks, c.ins || [], c.temps, c.history || [], make);
  const m1 = mk(), base = frames(m1), near = c.near, far = c.far;
  const T = merge(near, far);
  const errs = checkDeclaration(base, T); if (errs.length) return { law: 'declaration', errs };
  try { m1.relink(T); } catch (e) { return { law: 'valid', err: e.message }; }
  // landing: the run without the other blocks' changes of columns is made only when needed
  { const self = [...new Set(T.enter.filter(([, , h]) => h === 'self').map(([s]) => s))];
    const off = [...new Set(T.leave.filter(([id, , w]) => id !== T.carried && (w === 'narrow' || w === 'press')).map(([s]) => s))];
    let done;
    const without = () => {
      if (done !== undefined) return done;
      done = null;
      const a2 = { ...T.after }; let leave = T.leave, enter = T.enter;
      for (const s of off) { if (!(s in base) || !(s in a2)) return null; a2[s] = { ...a2[s], c0: base[s].c0, c1: base[s].c1 };
        leave = leave.filter(([id]) => id !== s); enter = enter.filter(([id]) => id !== s); }
      for (const s of self) { if (off.includes(s)) continue; if (!(s in base) || !(s in a2)) return null; const k0 = Math.max(base[s].c0, a2[s].c0), k1 = Math.min(base[s].c1, a2[s].c1);
        if (k0 <= k1) a2[s] = { ...a2[s], c0: k0, c1: k1 };
        else { a2[s] = { ...a2[s], c0: base[s].c0, c1: base[s].c1 }; leave = leave.filter(([id]) => id !== s); } }
      const m = mk(); try { m.relink({ ...T, after: a2, leave, enter: enter.filter(([, , h]) => h !== 'self') }); } catch (e) { return null; }
      return (done = m.rows());
    };
    const f = landing(T, m1.rows(), { without, canon: m1.rows('canonical') }); if (f) return f; }
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
    const bcanon = mk().rows('canonical'), pid = (id) => partOf(base[id] || T.after[id]);
    for (const p of ['a', 'z']) {
      const ids = Object.keys(base).filter((id) => pid(id) === p);
      // a block put there with temporary rows of its own pushes the block under it on the screen (§2.1), as one in base does
      const quiet = ids.every((id) => id in T.after && !base[id].e && !(T.after[id].e || 0) && base[id].h === T.after[id].h)
        && !Object.entries(T.after).some(([id, b]) => !(id in base) && (b.e || 0) && partOf(b) === p)
        && !T.leave.some(([id]) => pid(id) === p) && !T.enter.some(([id, , h]) => pid(id) === p && h === 'self');
      if (!quiet) continue;
      for (const id of ids) if (!moved.has(id) && (y[id] !== base[id].y || yc[id] !== bcanon[id])) return { law: 'untouched', id, was: [base[id].y, bcanon[id]], got: [y[id], yc[id]] };
    } }
  if (far) {
    // the same near transition with the far blocks left as they were
    const m2 = mk(), alone = { ...near, after: { ...Object.fromEntries(Object.entries(base).filter(([, b]) => partOf(b) === 'z')), ...near.after } };
    try { m2.relink(alone); } catch (e) { return { law: 'valid', err: 'alone: ' + e.message }; }
    const ids = Object.keys(near.after);
    if (projection(m1, ids) !== projection(m2, ids)) return { law: 'local', with: projection(m1, ids), alone: projection(m2, ids) };
    // and the other way: the far transition alone gives the far blocks what both together give them
    const m3 = mk(), farAlone = { ...far, after: { ...Object.fromEntries(Object.entries(base).filter(([id, b]) => partOf(b) !== 'z' && !(id in far.after))), ...far.after } };
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
  for (const b of [...m1.B.values()]) if (b.e) m1.show(b.id, 0);
  const inv = m1.check(); if (inv.length) return { law: 'after-effects', what: 'temporary heights ended', err: inv[0] };
  return null;
}

// a smaller case that still fails the same law: one block fewer (and what declares it), one temporary height fewer, a history shorter by
// one entry, no far transition
export function shrink(c, law, judge = (t) => runCase(t)) {
  const drop = (T, id) => ({ ...T, after: Object.fromEntries(Object.entries(T.after).filter(([k]) => k !== id)), steps: T.steps.map(([ids, d]) => [ids.filter((k) => k !== id), d]).filter(([ids]) => ids.length),
    leave: T.leave.filter(([k]) => k !== id), enter: T.enter.filter(([k]) => k !== id), pass: T.pass.filter(([k]) => k !== id), carried: T.carried === id ? null : T.carried,
    ...(T.start ? { start: Object.fromEntries(Object.entries(T.start).filter(([k]) => k !== id)) } : {}) });
  const dropH = (hist, id) => hist.filter((h) => !(h.show && h.show[0] === id)).map((h) => (h.T ? { T: drop(h.T, id) } : h));
  let cur = { ...c, history: c.history || [] };
  for (let changed = true; changed;) {
    changed = false;
    const tries = [];
    if (cur.far) tries.push({ ...cur, far: null, blocks: cur.blocks.filter((b) => b.id[0] !== 'z'), temps: cur.temps.filter(([id]) => id[0] !== 'z'), ins: (cur.ins || []).filter((id) => id[0] !== 'z'),
      history: cur.history.filter((h) => !(h.show && h.show[0][0] === 'z')).map((h) => (h.T ? { T: Object.keys(h.T.after).filter((id) => partOf(h.T.after[id]) === 'z').reduce(drop, h.T) } : h)) });
    for (let i = 0; i < cur.history.length; i++) tries.push({ ...cur, history: cur.history.filter((_, j) => j !== i) });
    // an inserted block opened as stored instead: a state with fewer standing blocks
    for (const id of cur.ins || []) tries.push({ ...cur, ins: cur.ins.filter((x) => x !== id) });
    // a temporary height dropped ends in after too, and the rows a declaration gives are then the generator's, so it must still check out
    const unshow = (T, id) => T && id in T.after ? { ...T, after: { ...T.after, [id]: { ...T.after[id], e: 0 } } } : T;
    for (const t of cur.temps) tries.push({ ...cur, temps: cur.temps.filter((x) => x !== t), near: unshow(cur.near, t[0]), far: unshow(cur.far, t[0]) });
    for (const b of cur.blocks) if (b.id !== cur.near.carried && !(cur.near.swap || []).includes(b.id) && !(cur.far && (cur.far.swap || []).includes(b.id))) tries.push({ ...cur, blocks: cur.blocks.filter((x) => x.id !== b.id), temps: cur.temps.filter(([id]) => id !== b.id), ins: (cur.ins || []).filter((id) => id !== b.id), history: dropH(cur.history, b.id), near: drop(cur.near, b.id), far: cur.far && drop(cur.far, b.id) });
    for (const t of tries) { let f; try { f = judge(t); } catch (e) { continue; } if (f && f.law === law) { cur = t; changed = true; break; } }
  }
  return cur;
}

// the next transition of a history on m, near and far: a carry away is two RELINKs, the taking away (with the far part) and then the put
// alone, drawn on the layout the first left (`pending`)
function draw(r, m, pending, { areas }) {
  const base = frames(m), part = (p) => Object.fromEntries(Object.entries(base).filter(([, b]) => partOf(b) === p));
  if (pending.then) { const t = pending.then; pending.then = null; const near = putBack(r, part('a'), t, { off: 0 }); return near ? { near: { ...near.T }, far: null, kind: 'away' } : null; }
  // the rows FOLLOW gives over the stacks with other heights, for a height change; the far part's own blocks only, so that its `start`
  // names none of the near ones; and the rows once a block is taken away, for an undo's carry back
  const only = (p, rows) => Object.fromEntries(Object.entries(rows).filter(([id]) => id in part(p)));
  const rowsWith = (p) => (hs) => only(p, m.rowsWith(hs));
  const rowsWithout = (p) => (id) => { const s = m.save(); m.remove(id); const rows = m.rows(); m.load(s); return only(p, rows); };
  const ea = action(r, part('a'), { off: 0, rowsWith: rowsWith('a'), rowsWithout: rowsWithout('a') });
  const ez = action(r, part('z'), { off: 20, rowsWith: rowsWith('z'), rowsWithout: rowsWithout('z'), kinds: ['carry', 'carry', 'swap', 'width', 'create', 'delete', 'height', 'press', 'back'] });
  if (!ea || !ez) return null;
  if (ea.T.carried && ez.T.carried) return { skip: 'two carried blocks drawn' };
  if (ea.then) pending.then = ea.then;
  return { near: { ...ea.T, after: { ...ea.after } }, far: { ...ez.T, after: { ...ez.after } }, kind: ea.kind };
}

/** The same case on a second implementation (`twin`, the engine through its driver) against the first: the same history and transition give
 *  the same layout, rows, owners and lends, or both refuse it. */
export function runTwin(c, make, twin) {
  const T = merge(c.near, c.far), go = (f) => { let m; try { m = build(c.opts, c.blocks, c.ins || [], c.temps, c.history || [], f); } catch (e) { return 'history refused: ' + e.message; }
    try { m.relink(T); } catch (e) { return 'refused'; } return m.snapshot(); };
  const a = go(make), b = go(twin);
  return a === b ? null : { law: 'twin', first: a, second: b };
}

/** N random cases; returns the counts and the first failure, shrunk. Each case has a history of up to `deep` transitions and temporary
 *  heights before the transition the laws judge; `make` the implementation they run on, and with `twin` a second one compared with it. */
export function runLaws(N, { seed0 = 1, deep = 3, areas = 0.2, make = createModel, twin = null } = {}) {
  const counts = {}, inc = (k) => (counts[k] = (counts[k] || 0) + 1);
  let tried = 0, failure = null;
  for (let seed = seed0; tried < N && seed < seed0 + N * 40; seed++) {
    const r = rng(seed);
    const opts = { gap51: r() > 0.2, gap52: r() > 0.2, gap53: r() > 0.2, gap8: r() > 0.2, gap9: r() > 0.2 };
    const A = sheet(r, 5, { off: 0, pre: 'a', areas }), Z = sheet(r, 4, { off: 20, pre: 'z', areas });
    const blocks = [...A, ...Z].map(({ e, ...b }) => b), temps = blocks.filter(() => r() < 0.25).map((b) => [b.id, 1 + Math.floor(r() * 3)]);
    // a third of the blocks inserted after the others are opened, so that some stand in another block's gap, with lends
    const ins = blocks.filter(() => r() < 0.35).map((b) => b.id);
    let m; try { m = build(opts, blocks, ins, temps, [], make); } catch (e) { inc('no valid state drawn'); continue; }
    // the history: each entry a transition the laws do not judge (only that it is valid) or a temporary height starting or ending
    const history = [], pending = { then: null }, L = Math.floor(r() * (deep + 1));
    let next = null, broke = false;
    for (let i = 0; i <= L || pending.then; i++) {
      if (i < L && !pending.then && r() < 0.25) {
        const ids = [...m.B.keys()], id = ids[Math.floor(r() * ids.length)], e = r() < 0.5 ? 0 : 1 + Math.floor(r() * 3);
        m.show(id, e); history.push({ show: [id, e] }); continue;
      }
      const d = draw(r, m, pending, { areas }); if (!d || d.skip) { inc(d ? d.skip : 'no valid action drawn'); broke = true; break; }
      if (i >= L && !pending.then) { next = d; break; }
      // a transition of the history: it must be valid; one that is not is the case the laws judge
      const T = merge(d.near, d.far); let bad = checkDeclaration(frames(m), T).length > 0;
      if (!bad) { const s = m.save(); try { m.relink(T); } catch (e) { m.load(s); bad = true; } }
      if (bad) { next = d; pending.then = null; break; }
      history.push({ T });
    }
    if (broke || !next) continue;
    const standing = [...m.B.values()].some((b) => m.stack(b.id, b.c0) == null);
    tried++; inc(next.kind); const near = next.near, far = next.far, base = frames(m);
    if (history.length) inc('after a history'); if (history.some((h) => h.T)) inc('after a move in the history');
    if (Object.values(base).some((b) => b.area)) inc('with areas');
    if (near.pass.length) inc('with passes'); if (near.swap && near.pass.some(([id]) => id === near.swap[1])) inc('a swap neighbour passing'); if (near.swap && near.steps.some(([ids]) => ids.includes(near.swap[0]) && ids.includes(near.swap[1]))) inc('a swap after a push'); if (temps.length || history.some((h) => h.show)) inc('under temporary heights'); if (standing) inc('with standing blocks'); if (near.swap && near.swap.some((id) => base[id].e)) inc('a swap of a block with a temporary height');
    const c = { seed, opts, blocks, ins, temps, history, near, far }, f = runCase(c, make) || (twin && runTwin(c, make, twin));
    if (f) { inc('failed: ' + f.law); if (!failure) failure = { GEN_VERSION, seed, failure: f, case: shrink(c, f.law, (t) => runCase(t, make) || (twin && runTwin(t, make, twin))) }; }
  }
  return { tried, counts, failure };
}
