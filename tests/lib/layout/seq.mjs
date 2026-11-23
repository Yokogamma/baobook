// Sequences of the commands a user has (docs/LAYOUT-SEAMS-PLAN.md §4.2), drawn from a seed: a note of texts, code blocks and areas with
// children, opened, and then commands one after another, each from the tree the one before it left: whole gestures (moves with their
// start and memory, holds, Shift, home, carries away, targets past the right edge, then the drop), an undo's carry back, typing in a text
// or a code block, a set size given or taken, the width handle, a creation, a deletion and the block made again by an undo, a block into
// and out of an area, an area's side handle, an area drawn, ungrouped, collapsed or given a height, a temporary height that starts or
// ends by the measure or by the rows `show` is given; and the commands nothing may do, which must not be accepted. The generator only
// draws: an executor `X` runs each command and says what came of it, so the comparison of two engines (pair.mjs) and the laws with their
// probes (laws.mjs) draw the same sequences.

/** A value by its content: maps and sets by their sorted entries, object keys sorted, no identity, no insertion order. */
export function canon(v) {
  if (v instanceof Map) return { '#map': [...v].map(([k, x]) => [String(k), canon(x)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) };
  if (v instanceof Set) return { '#set': [...v].map(canon).map((x) => JSON.stringify(x)).sort() };
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]); return o; }
  return v;
}
export const str = (v) => JSON.stringify(canon(v));
export const chars = (n) => 'x'.repeat(n);

/** The kinds of command the generator names, for the quotas: those that settle something, those that only show, and the negative ones. */
export const KINDS_SETTLE = ['carry', 'carry away', 'carry+hold', 'carry+shift', 'carry past the edge', 'undo carry', 'size before an undo', 'size', 'size code', 'size set', 'width', 'create', 'remove', 'create again', 'remove area', 'enter', 'leave', 'areaSide', 'drawArea', 'ungroup', 'area size'];
export const KINDS_SHOW = ['show', 'show own rows'];
export const KINDS_NOT = ['not: an area into an area', 'not: a wall given directly', 'not: an area\'s width by a width change'];

/** `notes` notes from `seed`, `steps` commands each. `G`: the geometry the generator reads (readingOrder, sharesCol, extent, SHEETW).
 *  `X`, the executor:
 *  - `note({k, seed, stored, map, hist})`: the note as read (a tree of places) and the measuring inputs, a plain map the generator changes
 *    as the user types; returns the tree it opens to, or null to skip the note;
 *  - `settle(kind, change, root, memory, {box, hist})` → `{ok: true, layout, start, memory}`, `{ok: false, why}` or `{stop: true}`;
 *  - `show(kind, tree, temp)` → `{layout}` (the tree's canonical layout shown again with `temp`) or `{stop: true}`;
 *  - `memory()`, an empty gesture memory; `done()`, true to end the run.
 *  `own: false` draws no temporary rows of a block's own (the rows `show` is given), for an engine that does not keep them (`tx`).
 *  @returns {{stat:object, by:object, types:object}} the counts; `by` per kind: accepted, moved (accepted with a tree that changed),
 *  refused, failed; `types` per Change type, an undo's apart: the moved ones on the sheet and in an area */
export function sequences(G, X, { seed = 1, notes = 300, steps = 6, own: ownRows = true } = {}) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (xs) => xs[int(0, xs.length - 1)];
  const stat = { notes: 0, commands: 0, accepted: 0, moved: 0, refused: 0, failed: 0 }, by = {}, types = {};
  const tallyOf = (k) => by[k] || (by[k] = { accepted: 0, moved: 0, refused: 0, failed: 0 });
  const T = (id, col, y) => ({ id, kind: 'text', col, y }), S = (id, col, y, cw, ch) => ({ id, kind: 'text', col, y, cw, ...(ch ? { ch } : {}) });
  const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: G.readingOrder(boxes), areas: new Map() });

  for (let k = 0; k < notes && !X.done(); k++) {
    const seed0 = seed, cols = rnd() < 0.15 ? int(10, 16) : int(28, G.SHEETW), boxes = [], areas = {}, map = {}, hist = [];
    const leaf = (id, cmax) => {
      if (rnd() < 0.12) {   // a code block: a row per line, folded past its limit, elastic as a text (W14)
        map[id] = { kind: 'code', text: Array.from({ length: int(1, 18) }, () => chars(int(1, 30))).join('\n'), ...(rnd() < 0.3 ? { wrap: true } : {}) };
        return { id, kind: 'code', col: int(0, cmax), y: int(0, 10), ...(rnd() < 0.3 ? { cw: int(12, 16) } : {}), ...(rnd() < 0.2 ? { ch: int(2, 6) } : {}) };
      }
      const b = rnd() < 0.5 ? T(id, int(0, cmax), int(0, 10)) : S(id, int(0, cmax), int(0, 10), int(1, 7), rnd() < 0.15 ? int(2, 5) : 0);
      map[id] = { text: b.cw == null ? chars(int(1, 60)) : chars(int(1, 30)) };
      if (rnd() < 0.12) map[id].temp = int(1, 3);   // a temporary height the measure shows (LAYOUT-RULES §2.1)
      return b;
    };
    for (let i = 0, n = int(1, 7); i < n; i++) boxes.push(leaf('B' + i, cols - 4));
    for (let i = 0, n = int(0, 2); i < n; i++) {
      const id = 'R' + i;
      boxes.push({ id, kind: 'area', col: int(0, Math.max(0, cols - 16)), y: int(1, 10), cw: int(12, 20), ...(rnd() < 0.25 ? { ch: int(3, 8) } : {}), ...(rnd() < 0.1 ? { collapsed: true } : {}) });
      // a header that wraps at a narrower width (the stub measures an entry with no kind as a text), or a tall one
      map[id] = rnd() < 0.3 ? { text: chars(int(20, 90)) } : rnd() < 0.2 ? { kind: 'area', header: int(2, 3) } : { kind: 'area' };
      areas[id] = []; for (let j = 0, m = int(0, 4); j < m; j++) areas[id].push(leaf(id + 'c' + j, 8));
    }
    const stored = { ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) };
    let Tr = X.note({ k, seed: seed0, stored, map, hist });
    if (!Tr) continue;
    stat.notes++;
    if (rnd() < 0.3) {   // rows of their own for a block or two from the start, an area among them, so that changes of every kind meet them
      const all = [...Tr.boxes.keys(), ...[...Tr.areas.values()].flatMap((C) => [...C.boxes.keys()])], temp = new Map();
      for (let i = 0, n = int(1, 2); i < n && all.length; i++) temp.set(pick(all), int(1, 2));
      if (ownRows && temp.size) { hist.push(['temp', [...temp.keys()], 'own']); const sh = X.show('show own rows', Tr, temp); if (sh.stop) break; Tr = sh.layout; tallyOf('show own rows').accepted++; }
    }

    /** One command through the executor, counted. */
    const both = (kind, change, root, memory) => {
      stat.commands++;
      const r = X.settle(kind, change, root, memory, { box: change.box ?? null, hist });
      if (r.stop) return r;
      const n = tallyOf(kind);
      if (!r.ok) { if (r.why === 'refused') { stat.refused++; n.refused++; } else { stat.failed++; n.failed++; } return r; }
      stat.accepted++; n.accepted++;
      if (str(r.layout) !== str(root)) { stat.moved++; n.moved++; const t = change.type + (change.canonical ? ', undone' : ''), w = change.box == null ? 'sheet' : 'area'; (types[t] || (types[t] = { sheet: 0, area: 0 }))[w]++; }
      return r;
    };

    for (let s = 0; s < steps && !X.done(); s++) {
      const aids = [...Tr.areas.keys()], onSheet = [...Tr.boxes.keys()], leaves = onSheet.filter((id) => !Tr.areas.has(id));
      const box = aids.length && rnd() < 0.45 ? pick(aids) : null, L = box == null ? Tr : Tr.areas.get(box), ids = [...L.boxes.keys()];
      const which = rnd();
      let r = null, c = null, kind = null;

      if (which < 0.2 && ids.length) {   // a gesture: moves with its start and memory, then the drop is the last accepted move
        const id = pick(ids), b = L.boxes.get(id), home = { col: b.col, y: b.y };
        let st = Tr, mem = X.memory(), col = b.col, y = b.y, away = false, last = null, stop = false;
        hist.push(['gesture', box, id]);
        for (let m = 0, nm = int(2, 5); m < nm; m++) {
          const q = rnd();
          if (q < 0.3 || q >= 0.85) col = Math.max(0, Math.min(L.cols - b.w, col + int(-4, 4)));
          let past = false; if (rnd() < 0.06) { col = L.cols - int(0, Math.max(1, b.w - 1)); past = true; }   // a target past the right edge: phase 1c clamps or narrows it (DRAG.A3)
          if (q >= 0.3) y = Math.max(0, y + int(-4, 4));
          if (col === home.col && y === home.y) { st = Tr; mem = X.memory(); away = false; last = null; hist.push(['home']); continue; }   // DRAG.A4
          const place = (box == null ? st : st.areas.get(box)).boxes.get(id), card = { ...place, col, y };
          if (!away && !G.sharesCol(card, place)) away = true;   // DRAG.B1
          else if (away && G.sharesCol(card, place) && G.extent(card).r0 <= G.extent(place).r1 && G.extent(place).r0 <= G.extent(card).r1) away = false;
          const through = rnd() < 0.3 ? 'hold' : rnd() < 0.1 ? 'shift' : undefined, frow = y + [0, 0, 0.3, 0.5, 0.8][int(0, 4)];
          c = { type: 'carry', box, id, at: { col, y, frow, w: b.w }, away, through };
          hist.push([col, y, frow, away ? 'away' : '', through || '']);
          const g = both(past ? 'carry past the edge' : through ? 'carry+' + through : away ? 'carry away' : 'carry', c, st, mem);
          if (g.stop) { stop = true; break; }
          if (!g.ok) continue;
          last = g; st = g.start; mem = g.memory;
        }
        if (stop) break;
        if (last) {
          const before = Tr; Tr = last.layout;
          if (rnd() < 0.85) {   // the undo's carry back, on the inverse path (LAYOUT-ENGINE-PLAN §6.4)
            if (rnd() < 0.5) {   // typed into meanwhile: a signature changed between the action and its undo
              const Lc = box == null ? Tr : Tr.areas.get(box), el = [...Lc.boxes.keys()].filter((i) => Lc.boxes.get(i).kind === 'text');
              if (el.length) { const tid = pick(el); map[tid] = { ...map[tid], text: chars(int(1, 70)) }; hist.push(['typed before the undo', tid]); const z = both('size before an undo', { type: 'size', box, id: tid }, Tr, X.memory()); if (z.stop) break; if (z.ok) Tr = z.layout; }
            }
            const L0 = box == null ? before : before.areas.get(box), b0 = L0.boxes.get(id), cur = (box == null ? Tr : Tr.areas.get(box)).boxes.get(id), cy = b0.yc ?? b0.y;
            if (cur) {
              c = { type: 'carry', box, id, at: { col: b0.col, y: cy, frow: cy, w: b0.w }, away: !G.sharesCol({ ...cur, col: b0.col, w: b0.w }, cur), canonical: true };
              hist.push(['undo', id]);
              const g = both('undo carry', c, Tr, X.memory());
              if (g.stop) break;
              if (g.ok) Tr = g.layout;
            }
          }
        }
        continue;
      }
      if (which < 0.3) {   // typing: a text changes, its block is sized again
        const el = ids.filter((i) => L.boxes.get(i).kind !== 'area'); if (!el.length) continue;
        const id = pick(el), code = L.boxes.get(id).kind === 'code';
        map[id] = { ...map[id], text: code ? Array.from({ length: int(1, 18) }, () => chars(int(1, 30))).join('\n') : chars(int(1, 70)) }; kind = code ? 'size code' : 'size'; c = { type: 'size', box, id };
      } else if (which < 0.34) {   // a set size given or taken
        const el = ids.filter((i) => L.boxes.get(i).kind === 'text'); if (!el.length) continue;
        const id = pick(el), b = L.boxes.get(id);
        kind = 'size set'; c = { type: 'size', box, id, set: rnd() < 0.5 ? { ch: b.ch ? null : int(2, 6) } : b.cw != null ? { cw: null } : { ch: int(2, 6) } };
      } else if (which < 0.475) {   // the width handle of a set width
        const sw = ids.filter((i) => L.boxes.get(i).kind === 'text' && L.boxes.get(i).cw != null); if (!sw.length) continue;
        const id = pick(sw), b = L.boxes.get(id);
        kind = 'width'; c = rnd() < 0.7 ? { type: 'width', box, id, cw: Math.max(1, b.cw + int(-3, 5)), side: 'right' } : (() => { const d = int(-3, 3) || 1; return { type: 'width', box, id, cw: Math.max(1, b.cw - d), side: 'left', col: Math.max(0, b.col + d) }; })();
      } else if (which < 0.55) {   // a new block
        const id = 'N' + k + '_' + s; map[id] = { text: chars(int(1, 40)) };
        const w = int(2, 8), col = int(0, Math.max(0, L.cols - w - 1)), y = int(0, 14);
        kind = 'create'; c = { type: 'create', box, id, kind: 'text', at: { col, y, frow: y + [0, 0.5][int(0, 1)], w }, away: true, ...(rnd() < 0.4 ? { set: { cw: w - 1 } } : {}) };
      } else if (which < 0.64 && ids.length) {
        const id = pick(ids); kind = Tr.areas.has(id) ? 'remove area' : 'remove'; c = { type: 'remove', box, id };
        if (kind === 'remove' && rnd() < 0.85) {   // and the undo of the deletion: the block made again at its canonical cell (LAYOUT-ENGINE-PLAN §6.4)
          const b = L.boxes.get(id), cy = b.yc ?? b.y;
          hist.push([kind, c]);
          const d = both(kind, c, Tr, X.memory());
          if (d.stop) break;
          if (!d.ok) continue;
          Tr = d.layout;
          const set = {}; for (const f of ['cw', 'ch']) if (b[f] != null) set[f] = b[f];
          kind = 'create again'; c = { type: 'create', box, id, kind: b.kind, at: { col: b.col, y: cy, frow: cy, w: b.w }, away: true, set, canonical: true };
        }
      } else if (which < 0.7 && aids.length && leaves.length) {
        kind = 'enter'; c = { type: 'enter', box: null, id: pick(leaves), to: pick(aids), at: { col: int(0, 4), y: int(0, 4) } };
      } else if (which < 0.79 && aids.length) {
        const a = pick(aids), kids = [...Tr.areas.get(a).boxes.keys()]; if (!kids.length) continue;
        kind = 'leave'; c = { type: 'leave', box: a, id: pick(kids), to: null, at: { col: int(0, Math.max(0, cols - 8)), y: int(0, 14) } };
      } else if (which < 0.88 && aids.length) {
        const a = pick(aids), b = Tr.boxes.get(a);
        kind = 'areaSide'; c = rnd() < 0.5 ? { type: 'areaSide', box: null, id: a, side: 'right', col: b.col, cols: b.w + int(-6, 6) } : { type: 'areaSide', box: null, id: a, side: 'left', col: b.col + int(-4, 4), cols: 0 };
      } else if (which < 0.905) {
        const id = 'D' + k + '_' + s; map[id] = { kind: 'area' };
        kind = 'drawArea'; c = { type: 'drawArea', box: null, id, at: { col: int(0, Math.max(0, cols - 16)), y: int(0, 14), cols: int(12, 16), rows: int(2, 4) } };
      } else if (which < 0.96 && aids.length) {
        kind = 'ungroup'; c = { type: 'ungroup', box: null, id: pick(aids) };
      } else if (which < 0.97 && aids.length) {
        const a = pick(aids), b = Tr.boxes.get(a);
        kind = 'area size'; c = { type: 'size', box: null, id: a, set: rnd() < 0.5 ? { collapsed: !b.collapsed } : { ch: rnd() < 0.3 ? null : int(2, 12) } };
      } else if (which < 0.985 && aids.length) {   // what no command may do: checked as an answer that is not an acceptance (§4.5)
        const a = pick(aids), b = Tr.boxes.get(a), other = aids.find((x) => x !== a), w = rnd();
        if (w < 0.6 && other) { kind = 'not: an area into an area'; c = { type: 'enter', box: null, id: a, to: other, at: { col: 0, y: 0 } }; }
        else if (w < 0.8) { kind = 'not: a wall given directly'; c = { type: 'wall', box: a, side: 'right', cols: Math.max(3, b.w - 2) }; }
        else { kind = 'not: an area\'s width by a width change'; c = rnd() < 0.5 ? { type: 'width', box: null, id: a, cw: b.cw + 2, side: 'right' } : { type: 'size', box: null, id: a, set: { cw: b.cw + 2 } }; }
      } else {   // a temporary height starts or ends: nothing is settled, the same stacks are shown again
        const el = [...leaves, ...aids.flatMap((a) => [...Tr.areas.get(a).boxes.keys()])]; if (!el.length) continue;
        // by the measure (an unfolded block), or by the rows `show` is given for a block, an area included (P18's row; an area's own row)
        const drawn = rnd() < 0.5, own = ownRows && drawn, id = own ? pick([...el, ...aids]) : pick(el), temp = new Map();
        if (own) temp.set(id, int(1, 2)); else map[id] = { ...map[id], temp: map[id].temp ? 0 : int(1, 3) };
        hist.push(['temp', id, own ? 'own' : map[id].temp]);
        const name = own ? 'show own rows' : 'show', sh = X.show(name, Tr, temp);
        if (sh.stop) break;
        Tr = sh.layout; tallyOf(name).accepted++;
        continue;
      }
      hist.push([kind, c]);
      r = both(kind, c, Tr, X.memory());
      if (r.stop) break;
      if (r.ok) Tr = r.layout;
    }
  }
  return { stat, by, types };
}
