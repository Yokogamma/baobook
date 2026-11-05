// The lab model's API (tests/lab/gap-model/model.mjs) over the engine's GAP (public/layout/gap.js), so that the model's own cases and random
// sequences run on the engine, and the two implementations can be compared operation by operation (docs/LAYOUT-ENGINE-PLAN.md step 1).
// Each of the model's events becomes what SETTLE would hand GAP: a creation is a RELINK with the new block carried, a move one with its
// step, a width change one with the block narrowed or widened, a carry away GAP.6 and then a RELINK. The checks the model makes before and
// after an event (a target that overlaps, a move the stacks do not put where it was asked) are SETTLE's in the engine; they are kept here so
// that the two refuse the same events. Blocks come and go in the model's coordinates: card columns c0…c1 and the frame's row and height.
import { fromPlaces, follow, resize, relink, adjust, remove, fit, shift, showStack, stackAt, check } from '../../public/layout/gap.js';
import { resolve } from '../../public/layout/rules.js';
import { extent, isArea } from '../../public/layout/geometry.js';

const pad = (b) => (isArea(b) ? 1 : 0);
const boxOf = (b, e = 0) => ({ id: b.id, kind: b.area ? 'area' : 'text', col: b.c0 - 1, w: b.c1 - b.c0 + 2, y: b.y, yc: b.y, h: b.h + e, t: e });
const inner = (box) => { const x = extent(box), p = pad(box), t = box.t || 0; return { id: box.id, c0: x.c0, c1: x.c1, y: box.y - p, yc: (box.yc ?? box.y) - p, h: box.h - t + 2 * p, e: t }; };

export function createEngineModel(opts = {}) {
  const rules = resolve({ 'GAP.5.1': opts.gap51 !== false, 'GAP.5.2': opts.gap52 !== false, 'GAP.5.3': opts.gap53 !== false, 'GAP.8': opts.gap8 !== false, 'GAP.9': opts.gap9 !== false });
  let L = { cols: 1 << 20, measure: 'displayed', boxes: new Map(), order: [], areas: new Map() }, ids = [];
  const put = (layout, list = ids) => { L = layout; ids = list.filter((id) => L.boxes.has(id)); return api; };
  const withBoxes = (base, f) => { const boxes = new Map(base.boxes); f(boxes); return { ...base, boxes, order: [...boxes.keys()] }; };
  const blocks = (layout = L) => [...layout.boxes.values()].map(inner);
  // the model's overlap: in the displayed layout, by extents; blocks moving in the same step keep their places to one another
  function overlaps(layout, x, except, moving) {
    for (const b of blocks(layout)) {
      if (b.id === x.id || b.id === except || (moving && moving.has(b.id))) continue;
      if (b.c0 <= x.c1 && x.c0 <= b.c1 && b.y < x.y + x.h + x.e && x.y < b.y + b.h + b.e) return true;
    }
    return false;
  }
  const moveSteps = (list) => { const m = new Map(); list.forEach(([idsOf, d], i) => { for (const id of idsOf) { if (!m.has(id)) m.set(id, []); m.get(id).push({ step: i + 1, by: 'change', rows: d }); } }); return m; };
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
    const after = withBoxes(base, (boxes) => {
      for (const [id, b] of boxes) {
        const w = widths[id], nb = { ...b, y: target.get(id) };
        if (w) { nb.col = w[0] - 1; nb.w = w[1] - w[0] + 2; }
        boxes.set(id, nb);
      }
    });
    const out = relink(base, after, moveSteps(moves), carried, rules);
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
      return put(relink(L, withBoxes(L, (m) => m.set(b.id, box)), {}, b.id, rules), [...ids, b.id]);
    },
    restore(b) {   // an undo: placed by its canonical row in every column
      const box = boxOf(b, b.e || 0), x = inner(box);
      if (L.boxes.has(b.id) || x.y < 0) throw new Error('restore overlaps');
      const out = relink(L, withBoxes(L, (m) => m.set(b.id, box)), {}, { id: b.id, canonical: true }, rules);
      if (overlaps(out, inner(out.boxes.get(b.id)))) throw new Error('restore overlaps');
      return put(out, [...ids, b.id]);
    },
    remove(id) { return put(remove(L, id, rules)); },
    height(id, h) { if (!(h >= 1)) throw new Error('height'); const b = L.boxes.get(id), t = b.t || 0; return put(relink(L, resize(L, id, h + t, t), {}, null, rules)); },
    show(id, e) { if (!(e >= 0)) throw new Error('temporary'); const b = L.boxes.get(id), t = b.t || 0; return put(follow(resize(L, id, b.h - t + e, e))); },
    width(id, f0, f1, h = null) {
      const box = L.boxes.get(id), x = inner(box), p = pad(box), c0 = f0 - p, c1 = f1 + p, H = h == null ? x.h : h + 2 * p;
      if (!(c0 <= c1)) throw new Error('no columns');
      if (h != null && !(h >= 1)) throw new Error('height');
      for (let c = c0; c <= c1; c++) if ((c < x.c0 || c > x.c1) && overlaps(L, { ...x, c0: c, c1: c, h: H }, id)) throw new Error('width overlaps');
      const t = box.t || 0, after = withBoxes(L, (m) => m.set(id, { ...box, col: f0 - 1, w: f1 - f0 + 2, ...(h == null ? {} : { h: h + t }) }));
      return put(relink(L, after, {}, null, rules));
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
      if (!canonical && overlaps(L, { ...x, c0, c1, y }, id)) throw new Error('carry overlaps');
      const gone = remove(L, id, rules), nb = { ...box, col: f0 - 1, w: f1 - f0 + 2, y: fy, yc: fy };
      if (!canonical && overlaps(gone, inner(nb), id)) throw new Error('carry overlaps');
      const out = relink(gone, withBoxes(gone, (m) => m.set(id, nb)), {}, canonical ? { id, canonical: true } : id, rules);
      if (canonical && overlaps(out, inner(out.boxes.get(id)), id)) throw new Error('carry overlaps');
      if (!canonical && out.boxes.get(id).y !== fy) throw new Error('carryTo: the stacks do not put ' + id + ' at its row');
      return put(out);
    },
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
