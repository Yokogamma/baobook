// The lab model's API (tests/lab/gap-model/model.mjs) over the engine's GAP (public/layout/gap.js), so that the model's own cases, random
// sequences and transitions run on the engine, and the two implementations can be compared operation by operation (docs/LAYOUT-ENGINE-PLAN.md
// steps 1 and 1b). Each of the model's events becomes the transition SETTLE would hand GAP, declared as the model declares it (LAYOUT-RULES
// §4, GAP's inputs): a creation is a block put where it lands, a move rule 1 alone, a width change the columns left as narrowed off and the
// ones come into by itself, a carry the carried block's steps and columns, a carry away GAP.6 and then a put, an undo a block placed by its
// canonical row; `start` and the rows of the blocks no step moves are those FOLLOW gives with the heights of after, as SETTLE's layout has
// them. The checks the model makes before and after an event (a target that overlaps, a move the stacks do not put where it was asked) are
// SETTLE's in the engine; they are kept here so that the two refuse the same events. Blocks come and go in the model's coordinates: card
// columns c0…c1 and the frame's row and height; the columns a transition names are GAP's, an area's extent.
import { fromPlaces, follow, resize, relink, adjust, remove, fit, shift, showStack, stackAt, check } from '../../public/layout/gap.js';
import { checkTransition } from '../../public/layout/transition.js';
import { resolve } from '../../public/layout/rules.js';
import { extent, isArea } from '../../public/layout/geometry.js';

const pad = (b) => (isArea(b) ? 1 : 0);
const boxOf = (b, e = 0) => ({ id: b.id, kind: b.area ? 'area' : 'text', col: b.c0 - 1, w: b.c1 - b.c0 + 2, y: b.y, yc: b.yc ?? b.y, h: b.h + e, t: e });
const inner = (box) => { const x = extent(box), p = pad(box), t = box.t || 0; return { id: box.id, c0: x.c0, c1: x.c1, y: box.y - p, yc: (box.yc ?? box.y) - p, h: box.h - t + 2 * p, e: t }; };
const gcols = (box) => { const x = extent(box), r = []; for (let c = x.c0; c <= x.c1; c++) r.push(c); return r; };
/** A block in frame coordinates, as the model's frames() gives it. */
const frameOf = (box) => { const t = box.t || 0; return { c0: box.col + 1, c1: box.col + box.w - 1, y: box.y, yc: box.yc ?? box.y, h: box.h - t, e: t, ...(isArea(box) ? { area: true } : {}) }; };

/** The engine's layout of a model's state (model.mjs's save(): its blocks by their extents, its stacks with one owner per row), so that a
 *  state found in the model, history and all, can be run on the engine. */
export function layoutFromModel(state) {
  const runs = (rows) => { const out = []; for (const o of rows) { const v = o === '' ? null : o, p = out[out.length - 1]; if (p && p.o === v) p.n++; else out.push({ o: v, n: 1 }); } return out; };
  const boxes = new Map(), order = [...state.B.keys()];
  for (const [id, b] of state.B) {
    const p = b.area ? 1 : 0, c0 = b.c0 + p, c1 = b.c1 - p;
    const mine = [...state.S.entries()].filter(([k]) => k.slice(0, k.lastIndexOf('|')) === id).map(([k, st]) => [+k.slice(k.lastIndexOf('|') + 1), { u: st.u, parts: st.parts.map((q, i) => (i % 2 ? { id: q.id, lend: runs(q.lend) } : runs(q))) }]).sort((x, y) => x[0] - y[0]);
    const above = []; for (const [c, st] of mine) { const l = above[above.length - 1]; if (l && l.c1 === c - 1 && JSON.stringify(l.stack) === JSON.stringify(st)) l.c1 = c; else above.push({ c0: c, c1: c, stack: st }); }
    boxes.set(id, { id, kind: b.area ? 'area' : 'text', col: c0 - 1, w: c1 - c0 + 2, y: b.y + p, yc: b.y + p, h: b.h - 2 * p + b.e, t: b.e, above });
  }
  return follow({ cols: 1 << 20, measure: 'displayed', boxes, order, areas: new Map() });
}

/** The engine's check of a transition in the model's form ({id: frame} for base and T.after), as declare.mjs's checkDeclaration takes it. */
export function engineCheck(base, T) {
  const lay = (fr) => { const boxes = new Map(Object.entries(fr).map(([id, f]) => [id, { ...boxOf({ id, ...f }, f.e || 0), yc: f.yc ?? f.y }])); return { cols: 1 << 20, measure: 'displayed', boxes, order: [...boxes.keys()], areas: new Map() }; };
  return checkTransition({ base: lay(base), after: lay(T.after), moved: T.moved, steps: T.steps, start: T.start, carried: T.carried ?? null, canonical: !!T.canonical, leave: T.leave, enter: T.enter, pass: T.pass, swap: T.swap, fallback: T.fallback });
}

export function createEngineModel(opts = {}) {
  const rules = resolve({ 'GAP.5.1': opts.gap51 !== false, 'GAP.5.2': opts.gap52 !== false, 'GAP.5.3': opts.gap53 !== false, 'GAP.8': opts.gap8 !== false, 'GAP.9': opts.gap9 !== false });
  let L = { cols: 1 << 20, measure: 'displayed', boxes: new Map(), order: [], areas: new Map() }, ids = [];
  const put = (layout, list = ids) => { L = layout; ids = list.filter((id) => L.boxes.has(id)); return api; };
  const withBoxes = (base, f) => { const boxes = new Map(base.boxes); f(boxes); return { ...base, boxes, order: [...boxes.keys()] }; };
  const blocks = (layout = L) => [...layout.boxes.values()].map(inner);
  const framesOf = (layout) => Object.fromEntries([...layout.boxes].map(([id, b]) => [id, frameOf(b)]));
  // the model's overlap: in the displayed layout, by extents; blocks moving in the same step keep their places to one another
  function overlaps(layout, x, except, moving) {
    for (const b of blocks(layout)) {
      if (b.id === x.id || b.id === except || (moving && moving.has(b.id))) continue;
      if (b.c0 <= x.c1 && x.c0 <= b.c1 && b.y < x.y + x.h + x.e && x.y < b.y + b.h + b.e) return true;
    }
    return false;
  }
  /** One RELINK on a transition in the model's form (after in frame coordinates); a refusal throws, as the model's relink does. */
  function relinkT(base, T) {
    const after = withBoxes(base, (boxes) => {
      for (const id of [...boxes.keys()]) if (!(id in T.after)) boxes.delete(id);
      for (const [id, f] of Object.entries(T.after)) {
        const e = f.e || 0, b = boxes.get(id), nb = { ...(b || { id, kind: f.area ? 'area' : 'text' }), col: f.c0 - 1, w: f.c1 - f.c0 + 2, y: f.y, h: f.h + e, t: e };
        nb.yc = f.yc != null ? f.yc : b ? b.yc : f.y;
        boxes.set(id, nb);
      }
    });
    // the facts SETTLE hands RELINK (LAYOUT-RULES GAP's inputs, `moved`): with `facts`, the blocks the model's steps move and those it names
    // as moved, in reverse order (a set: its order changes nothing), and no path; otherwise the model's form, steps, start and moved
    const moved = [...new Set([...(T.steps || []).flatMap(([ids]) => ids), ...(T.moved || [])])].reverse();
    const path = opts.facts ? { moved } : { steps: T.steps || [], start: T.start, moved: T.moved };
    const out = relink({ base, after, ...path, carried: T.carried ?? null, canonical: !!T.canonical, leave: T.leave || [], enter: T.enter || [], pass: T.pass || [], swap: T.swap, fallback: T.fallback }, rules);
    if (!out.ok) throw new Error('relink: ' + out.errors[0]);
    return out.layout;
  }
  /** The transition of one of the model's events: after in frame coordinates, the heights changed in it; `start` and the rows of the blocks
   *  no step moves FOLLOW's over base's stacks with those heights, the moved ones from there by their steps. */
  function declared(base, a, x = {}) {
    // as RELINK counts them: the blocks after does not hold taken away first (GAP.6), top to bottom
    let b0 = base; for (const id of base.order.filter((k) => !a[k]).sort((p, q) => inner(base.boxes.get(p)).y - inner(base.boxes.get(q)).y || (p < q ? -1 : p > q ? 1 : 0))) b0 = remove(b0, id, rules);
    const hs = withBoxes(b0, (boxes) => { for (const [id, b] of boxes) if (a[id]) boxes.set(id, { ...b, h: a[id].h + (a[id].e || 0), t: a[id].e || 0 }); });
    const S = follow(hs), start = {}, by = new Map();
    for (const [list, d] of x.steps || []) for (const id of list) by.set(id, (by.get(id) || 0) + d);
    for (const id of base.order) if (a[id]) { start[id] = S.boxes.get(id).y; if (!(x.canonical && id === x.carried)) a[id] = { ...a[id], y: start[id] + (by.get(id) || 0) }; }
    return { after: a, steps: [], leave: [], enter: [], pass: [], carried: null, ...x, start };
  }
  const moveSteps = (list) => { const m = new Map(); list.forEach(([idsOf, d], i) => { for (const id of idsOf) { if (!m.has(id)) m.set(id, []); m.get(id).push({ step: i + 1, by: 'change', rows: d }); } }); return m; };
  // the model's step: the steps of `moves` and blocks changing their columns; the carried block comes in where it is put, every other one
  // by itself; a block that keeps some of its columns leaves the others as narrowed off (M9)
  function step(base, moves = [], widths = {}, carried = null) {
    const target = new Map([...base.boxes.values()].map((b) => [b.id, b.y]));
    for (const [list, d] of moves) for (const id of list) target.set(id, target.get(id) + d);
    // the model checks every non-carried width at its target, top to bottom, each against the columns the ones before it took
    const order = Object.keys(widths).sort((a, b) => target.get(a) - target.get(b) || inner(base.boxes.get(a)).c0 - inner(base.boxes.get(b)).c0 || (a < b ? -1 : 1));
    let seen = base;
    for (const id of order) {
      const box = seen.boxes.get(id), x = inner(box), [f0, f1] = widths[id], c0 = f0 - pad(box), c1 = f1 + pad(box);
      if (id !== carried && overlaps(seen, { ...x, c0, c1, y: target.get(id) - pad(box) }, id)) throw new Error('width overlaps');
      seen = withBoxes(seen, (m) => m.set(id, { ...box, col: f0 - 1, w: f1 - f0 + 2 }));
    }
    const a = framesOf(base), leave = [], enter = [];
    for (const [id, [f0, f1]] of Object.entries(widths)) {
      const box = base.boxes.get(id), was = gcols(box), will = gcols({ ...box, col: f0 - 1, w: f1 - f0 + 2 });
      for (const c of was) if (!will.includes(c)) leave.push([id, c, 'narrow']);
      for (const c of will) if (!was.includes(c)) enter.push([id, c, id === carried ? 'put' : 'self']);
      a[id] = { ...a[id], c0: f0, c1: f1 };
    }
    const out = relinkT(base, declared(base, a, { steps: moves, leave, enter, carried }));
    const errs = check(out); if (errs.length) throw new Error('step: ' + errs[0]);
    return out;
  }
  const api = {
    get B() { return new Map(ids.map((id) => [id, inner(L.boxes.get(id))])); },
    get S() {   // in the model's form: one owner per row, '' for an unowned one, as its tests read them
      const rows = (runs) => runs.flatMap((r) => Array(r.n).fill(r.o == null ? '' : r.o)), S = new Map();
      for (const id of ids) for (const s of L.boxes.get(id).above || []) for (let c = s.c0; c <= s.c1; c++)
        S.set(id + '|' + c, { u: s.stack.u, parts: s.stack.parts.map((p, i) => (i % 2 ? { id: p.id, lend: rows(p.lend) } : rows(p))) });
      return S;
    },
    open(list) {
      for (const b of list) if (b.area && b.y < 1) throw new Error('an area at row 0');
      const boxes = new Map(list.map((b) => [b.id, boxOf(b)]));
      return put(fromPlaces({ cols: 1 << 20, measure: 'displayed', boxes, order: list.map((b) => b.id), areas: new Map() }), list.map((b) => b.id));
    },
    insert(b) {
      const box = boxOf(b, b.e || 0), x = inner(box);
      if (L.boxes.has(b.id) || overlaps(L, x) || x.y < 0) throw new Error('insert overlaps');
      const a = framesOf(L); a[b.id] = { e: 0, ...b };
      return put(relinkT(L, declared(L, a, { enter: gcols(box).map((c) => [b.id, c, 'put']) })), [...ids, b.id]);
    },
    restore(b) {   // an undo: placed by its canonical row in every column
      const box = boxOf(b, b.e || 0), x = inner(box);
      if (L.boxes.has(b.id) || x.y < 0) throw new Error('restore overlaps');
      const a = framesOf(L); a[b.id] = { e: 0, ...b, yc: b.y };
      const out = relinkT(L, declared(L, a, { enter: gcols(box).map((c) => [b.id, c, 'back']), carried: b.id, canonical: true }));
      if (overlaps(out, inner(out.boxes.get(b.id)))) throw new Error('restore overlaps');
      return put(out, [...ids, b.id]);
    },
    remove(id) { const a = framesOf(L); delete a[id]; return put(relinkT(L, declared(L, a))); },
    height(id, h) { if (!(h >= 1)) throw new Error('height'); const a = framesOf(L); a[id] = { ...a[id], h }; return put(relinkT(L, declared(L, a))); },
    show(id, e) { if (!(e >= 0)) throw new Error('temporary'); const b = L.boxes.get(id), t = b.t || 0; return put(follow(resize(L, id, b.h - t + e, e))); },
    width(id, f0, f1, h = null) {
      const box = L.boxes.get(id), x = inner(box), p = pad(box), c0 = f0 - p, c1 = f1 + p, H = h == null ? x.h : h + 2 * p;
      if (!(c0 <= c1)) throw new Error('no columns');
      if (h != null && !(h >= 1)) throw new Error('height');
      for (let c = c0; c <= c1; c++) if ((c < x.c0 || c > x.c1) && overlaps(L, { ...x, c0: c, c1: c, h: H }, id)) throw new Error('width overlaps');
      const a = framesOf(L), was = gcols(box), will = gcols({ ...box, col: f0 - 1, w: f1 - f0 + 2 });
      a[id] = { ...a[id], c0: f0, c1: f1, ...(h == null ? {} : { h }) };
      return put(relinkT(L, declared(L, a, { leave: was.filter((c) => !will.includes(c)).map((c) => [id, c, 'narrow']), enter: will.filter((c) => !was.includes(c)).map((c) => [id, c, 'self']) })));
    },
    move(list, d) {
      const set = new Set(list); if (!set.size || !d) return api;
      for (const id of set) { const x = inner(L.boxes.get(id)); if (overlaps(L, { ...x, y: x.y + d }, id, set)) throw new Error('move overlaps'); }
      const want = new Map([...set].map((id) => [id, L.boxes.get(id).y + d])), yc = new Map([...set].map((id) => [id, L.boxes.get(id).yc]));
      const out = adjust(L, moveSteps([[list, d]]), rules);   // the model's move is rule 1 alone: no rule 5 to give a block the rows it lacks
      for (const id of set) {
        if (out.boxes.get(id).y !== want.get(id)) throw new Error('move: the stacks do not put ' + id + ' at its row');
        const dc = out.boxes.get(id).yc - yc.get(id);
        if (d > 0 ? dc < 0 || dc > d : dc > 0 || dc < d) throw new Error('move: ' + id + ' moved ' + dc + ' canonically for ' + d);
      }
      return put(out);
    },
    carry(id, d) { return api.move([id], d); },
    step(moves = [], widths = {}, carried = null) { return put(step(L, moves, widths, carried)); },
    fit(targets) { return put(fit(L, targets, rules)); },
    shift(k) { const out = shift(L, k); if ([...out.boxes.values()].some((b) => b.col + 1 < 0)) throw new Error('shift past the edge'); return put(out); },
    side(k, W) {
      let out = shift(L, -k); const widths = {};
      for (const b of out.boxes.values()) { const f0 = b.col + 1, f1 = b.col + b.w - 1; if (f0 < 0) widths[b.id] = [0, f1 - f0]; }
      if (Object.keys(widths).length) out = step(out, [], widths);
      for (const b of out.boxes.values()) if (b.col + 1 < 0 || b.col + b.w - 1 > W - 1) throw new Error('the handle stops: ' + b.id + ' cannot fit');
      return put(out);
    },
    carryTo(id, f0, f1, fy, canonical = false) {
      const box = L.boxes.get(id), x = inner(box), p = pad(box), c0 = f0 - p, c1 = f1 + p, y = fy - p;
      if (!(c0 <= c1)) throw new Error('no columns');
      if (!canonical && c0 <= x.c1 && x.c0 <= c1) return api.step(y === x.y ? [] : [[[id], y - x.y]], { [id]: [f0, f1] }, id);
      const nb = { ...box, col: f0 - 1, w: f1 - f0 + 2, y: fy, yc: fy };
      if (canonical) {
        const a = framesOf(L); a[id] = { ...frameOf(nb) };
        const out = relinkT(L, declared(L, a, { leave: gcols(box).map((c) => [id, c, 'away']), enter: gcols(nb).map((c) => [id, c, 'back']), carried: id, canonical: true }));
        if (overlaps(out, inner(out.boxes.get(id)), id)) throw new Error('carry overlaps');
        return put(out);
      }
      if (overlaps(L, { ...x, c0, c1, y }, id)) throw new Error('carry overlaps');
      const ga = framesOf(L); delete ga[id];
      const gone = relinkT(L, declared(L, ga));   // GAP.6
      if (overlaps(gone, inner(nb), id)) throw new Error('carry overlaps');
      const a = framesOf(gone); a[id] = { ...frameOf(nb) }; delete a[id].yc;
      const out = relinkT(gone, declared(gone, a, { enter: gcols(nb).map((c) => [id, c, 'put']), carried: id }));
      if (out.boxes.get(id).y !== fy) throw new Error('carryTo: the stacks do not put ' + id + ' at its row');
      return put(out, ids);
    },
    relink(T) { return put(relinkT(L, T), [...ids, ...Object.keys(T.after).filter((id) => !ids.includes(id))]); },
    loadModel(state) { return put(layoutFromModel(state), [...state.B.keys()]); },   // a state saved by the model, history and all
    rowsWith(heights) {   // the displayed frame rows FOLLOW gives over the stacks with these heights ({id: {h, e}}, frame), nothing written
      const hs = withBoxes(L, (boxes) => { for (const [id, v] of Object.entries(heights)) { const b = boxes.get(id); if (b) boxes.set(id, { ...b, h: v.h + (v.e || 0), t: v.e || 0 }); } });
      const S = follow(hs); return Object.fromEntries([...S.boxes].map(([id, b]) => [id, b.y]));
    },
    frames() { return Object.fromEntries(ids.map((id) => [id, frameOf(L.boxes.get(id))])); },
    rows(measure = 'shown') { return Object.fromEntries([...ids].sort().map((id) => { const b = L.boxes.get(id); return [id, measure === 'shown' ? b.y : b.yc]; })); },
    stack(l, c) { const st = stackAt(L, l, c); return st ? showStack(st) : null; },
    save() { return { L, ids }; },
    load(s) { return put(follow(s.L), s.ids); },
    stored() { return { L: withBoxes(L, (m) => { for (const [id, b] of m) m.set(id, { ...b, h: b.h - (b.t || 0), t: 0 }); }), ids }; },
    places() { return ids.map((id) => { const b = L.boxes.get(id), t = b.t || 0; return { id, c0: b.col + 1, c1: b.col + b.w - 1, y: b.yc, h: b.h - t, ...(isArea(b) ? { area: true } : {}) }; }); },
    snapshot() {
      const bs = ids.map((id) => { const x = inner(L.boxes.get(id)); return [id, x.c0, x.c1, x.y, x.yc, x.h, x.e]; }).sort();
      const ss = []; for (const id of ids) for (const s of L.boxes.get(id).above || []) for (let c = s.c0; c <= s.c1; c++) ss.push([id + '|' + c, showStack(s.stack)]);
      ss.sort();
      return JSON.stringify([bs, ss]);
    },
    check() { return check(L); },
    layout() { return L; },
  };
  return api;
}
