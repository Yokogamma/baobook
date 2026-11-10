// Node: the engine's GAP (public/layout/gap.js) against its executable model (tests/lab/gap-model/model.mjs), event by event
// (docs/LAYOUT-ENGINE-PLAN.md step 1: «gap.js must give the model's results»). Random histories of creations, undos, deletions, heights,
// temporary heights, widths with and without a new height, moves of one block and of several, carries sideways and away, steps that move
// and change widths in one RELINK, rule 5 alone, shifts and an area's left side handle, under random sets of the GAP switches: after
// every event both implementations accept it or both refuse it, and their rows in both measures, owners and lends are the same. Until step
// 1b's second part the model runs with `screenPut`: a block moved by hand and put at its row under another block's temporary rows measured as the engine
// still measures it (the internal review of 62433e9 found that this writes their push; the model fixed it, the engine follows).
// node tests/layoutgap-twin.mjs [histories]
import { createModel } from './lab/gap-model/model.mjs';
import { createEngineModel } from './lib/gapdriver.mjs';

let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n); };
const N = +process.argv[2] || 400;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const blk = (id, c0, c1, y, h = 1) => ({ id, c0, c1, y, h });

// whether an event's moves carry a block past another in a column both cover before and after it
function passes(m, kind, moved) {
  if (!moved) return false;
  for (const [list, d] of moved) for (const id of list) {
    const x = m.B.get(id), y2 = x.y + d;
    for (const b of m.B.values()) {
      if (list.includes(b.id) || b.c1 < x.c0 || x.c1 < b.c0) continue;
      if ((x.y < b.y) !== (y2 < b.y) || (x.y > b.y) !== (y2 > b.y)) return true;
    }
  }
  return false;
}
let skipped = 0;
function history(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], int = (a, b) => a + Math.floor(r() * (b - a + 1)), W = 12;
  const opts = { gap51: r() > 0.2, gap52: r() > 0.2, gap53: r() > 0.2, gap8: r() > 0.2, gap9: r() > 0.2 };
  const base = []; for (let i = 0; i < 4; i++) for (let t = 0; t < 30; t++) {
    const c0 = int(0, W - 3), b = blk('b' + i, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 24), int(1, 3));
    if (!base.some((o) => o.c0 <= b.c1 && b.c0 <= o.c1 && o.y < b.y + b.h + 1 && b.y < o.y + o.h + 1)) { base.push(b); break; }
  }
  // the model with `screenPut`: a block put at its row measured as the engine still measures it, until step 1b's second part
  const m = createModel({ ...opts, screenPut: true }).open(base), e = createEngineModel(opts).open(base);
  if (m.snapshot() !== e.snapshot()) return { seed, at: 'open', m: m.snapshot(), e: e.snapshot() };
  let n = 0;
  for (let step = 0; step < 30; step++) {
    const live = [...m.B.keys()]; if (!live.length) break;
    const id = pick(live), x = { ...m.B.get(id) }, kind = pick(['insert', 'insert', 'restore', 'height', 'show', 'width', 'widthh', 'move', 'moves', 'carry', 'sideways', 'away', 'step', 'fit', 'shift', 'side', 'delete']);
    let op;
    if (kind === 'insert') { const c0 = int(0, W - 2), b = { ...blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 30), int(1, 3)), e: pick([0, 0, 2]) }; op = (q) => q.insert(b); }
    if (kind === 'restore') { const c0 = int(0, W - 2), b = blk('x' + n++, c0, Math.min(W - 1, c0 + int(0, 5)), int(0, 30), int(1, 3)); op = (q) => q.restore(b); }
    if (kind === 'height') { const h = Math.max(1, x.h + pick([-2, -1, 1, 2])); op = (q) => q.height(id, h); }
    if (kind === 'show') { const t = pick([0, 0, 1, 3]); op = (q) => q.show(id, t); }
    if (kind === 'width' || kind === 'widthh') { const a = Math.max(0, x.c0 + pick([-1, 0, 1])), z = Math.max(a, Math.min(W - 1, x.c1 + pick([-1, 0, 1]))), h = kind === 'widthh' ? Math.max(1, x.h + pick([-1, 1])) : null; op = (q) => q.width(id, a, z, h); }
    if (kind === 'move') { const d = pick([-2, -1, 1, 2]); op = (q) => q.carry(id, d); op.moved = [[[id], d]]; }
    if (kind === 'moves') { const list = [id, pick(live)], d = pick([-1, 1]); op = (q) => q.move(list, d); op.moved = [[list, d]]; }
    if (kind === 'carry') { const d = pick([-3, 3]); op = (q) => q.carry(id, d); op.moved = [[[id], d]]; }
    // every random value is drawn here, once, never inside the event, which runs twice
    if (kind === 'sideways') { const k = pick([-1, 1]), cut = x.c1 > x.c0 && r() < 0.4, dy = pick([0, 0, 1]); op = (q) => q.carryTo(id, x.c0 + k + (cut && k > 0 ? 1 : 0), x.c1 + k - (cut && k < 0 ? 1 : 0), x.y + dy); op.moved = [[[id], dy]]; op.cols = { [id]: [x.c0 + k + (cut && k > 0 ? 1 : 0), x.c1 + k - (cut && k < 0 ? 1 : 0)] }; }
    if (kind === 'away') { const c0 = int(0, W - 2), w = x.c1 - x.c0, y = int(0, 30), canon = r() < 0.3; op = (q) => q.carryTo(id, c0, Math.min(W - 1, c0 + w), y, canon); if (!canon && c0 <= x.c1 && x.c0 <= Math.min(W - 1, c0 + w)) { op.moved = [[[id], y - x.y]]; op.cols = { [id]: [c0, Math.min(W - 1, c0 + w)] }; } }
    if (kind === 'step') { const o = pick(live), d = pick([-1, 1]), a = Math.max(0, x.c0 + pick([-1, 1])), z = Math.max(a, Math.min(W - 1, x.c1 + pick([0, 1]))), car = r() < 0.3 ? id : null; op = (q) => q.step([[[o], d]], { [id]: [a, z] }, car); op.moved = [[[o], d]]; }
    if (kind === 'fit') { const y = x.y + int(0, 3); op = (q) => q.fit({ [id]: y }); }
    if (kind === 'shift') { const k = pick([-1, 1]); op = (q) => q.shift(k); }
    if (kind === 'side') { const k = pick([1, 2]); op = (q) => q.side(k, W - k); }
    if (kind === 'delete') op = (q) => q.remove(id);
    // a block carried or moved past a block of a column it keeps is outside the model, which keeps every chain's order and has no rule for
    // it: RELINK counts it as leaving its old place and coming in at its new one (LAYOUT-RULES GAP.5), tested by tests/layoutgap-leave.mjs
    if (passes(m, kind, op.moved)) { skipped++; continue; }
    let em = null, ee = null;
    try { op(m); } catch (err) { em = err.message; }
    try { op(e); } catch (err) { ee = err.message; }
    if ((em === null) !== (ee === null)) return { seed, step, kind, opts, model: em || 'accepted', engine: ee || 'accepted' };
    if (m.snapshot() !== e.snapshot()) return { seed, step, kind, opts, m: m.snapshot(), e: e.snapshot() };
    const errs = e.check(); if (errs.length) return { seed, step, kind, errs };
  }
  // what 0.1 stores reopens to the same canonical rows in both
  const pm = createModel({ ...opts, screenPut: true }).open(m.places()), pe = createEngineModel(opts).open(e.places());
  if (pm.snapshot() !== pe.snapshot()) return { seed, at: 'places' };
  return null;
}

let bad = 0, first = null;
for (let s = 1; s <= N; s++) { let res; try { res = history(s); } catch (err) { res = { seed: s, error: err.stack }; } if (res) { bad++; first = first || res; } }
ok(`${N} random histories: the engine accepts and refuses what the model does, with the same rows, owners and lends after every event (${skipped} events outside the model left out; ${bad} differ${first ? '; first: ' + JSON.stringify(first).slice(0, 1500) : ''})`, bad === 0);
process.exit(fails ? 1 : 0);
