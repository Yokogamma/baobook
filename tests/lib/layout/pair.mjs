// Two engines on the same commands (docs/LAYOUT-SEAMS-PLAN.md §4.4): the reference of a refactor that is meant to keep the behaviour.
// Each engine is a folder of the layout modules, loaded on its own, so the pinned copy (tests/lab/engine-<sha>/) imports nothing from the
// public/layout that changes. `run` draws notes and sequences of commands from a seed, gives both engines the same input at every step
// (the tree, the gesture's start and memory, the change, the measuring answers) under the default rules, and compares what they answer by
// value: accepted, refused or failed, the tree with its stacks, the gesture memory and `start`, the canonical projection and the written
// fields, a field written as removed told from one not written. Nothing here judges whether an answer is right: that is the laws' and the references' work.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { stubMeasure } from '../measure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const NEW = join(ROOT, 'public', 'layout'), OLD = join(ROOT, 'tests', 'lab', 'engine-0d94f29');

/** The modules of one engine, from its folder. */
export async function load(dir) {
  const m = async (f) => import(pathToFileURL(join(dir, f)).href);
  const [tree, settle, layout, gap, geometry, rules, kinds] = await Promise.all(['tree.js', 'settle.js', 'layout.js', 'gap.js', 'geometry.js', 'rules.js', 'kinds.js'].map(m));
  return { dir, settleTree: tree.settleTree, emptyMemory: settle.emptyMemory, open: layout.open, show: layout.show, unshow: layout.unshow, diff: layout.diff,
    check: gap.check, readingOrder: geometry.readingOrder, sharesCol: geometry.sharesCol, extent: geometry.extent, SHEETW: geometry.SHEETW,
    rowFromY: geometry.rowFromY, fxFromCol: geometry.fxFromCol,
    resolve: rules.resolve, DEFAULT: rules.DEFAULT, SETTINGS: rules.SETTINGS, KINDS: kinds.KINDS };
}

/** A value by its content: maps and sets by their sorted entries, object keys sorted, no identity, no insertion order. */
export function canon(v) {
  if (v instanceof Map) return { '#map': [...v].map(([k, x]) => [String(k), canon(x)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) };
  if (v instanceof Set) return { '#set': [...v].map(canon).map((x) => JSON.stringify(x)).sort() };
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]); return o; }
  return v;
}
const str = (v) => JSON.stringify(canon(v));
/** Where two values first differ, as a path, for the report. */
export function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) { const d = firstDiff(a[k], b[k], path + '/' + k); if (d) return d; }
  }
  return { path, a, b };
}

const chars = (n) => 'x'.repeat(n);

/** What one engine answers to a command, as plain data to compare: an exception is an answer too. */
function answer(E, f) {
  let r;
  try { r = f(); } catch (e) { return { threw: String(e && e.message) }; }
  return r;
}
/** A patch of written fields by value, a field written as removed (`undefined`, LAYOUT-ENGINE-PLAN §3.4) kept apart from a field the
 *  patch does not name: `canon` drops undefined properties, which here are commands. */
export const REMOVED = '#removed';
export function patches(written) {
  return [...written].map(([id, p]) => [String(id), Object.keys(p).sort().map((k) => [k, p[k] === undefined ? REMOVED : p[k]])]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
/** The fields the bridge would keep for a note read from these places (§3.5), as `diff` takes them: Map<id, Stored>. */
export function storedOf(E, note) {
  const out = new Map();
  const put = (b, parent) => out.set(b.id, { parent, col: b.col, row: parent == null ? E.rowFromY(b.y) : b.y, ...(parent == null ? { fx: E.fxFromCol(b.col) } : {}),
    ...(b.cw != null ? { cw: b.cw } : {}), ...(b.ch != null ? { ch: b.ch } : {}), ...(b.open ? { open: true } : {}), ...(b.collapsed ? { collapsed: true } : {}) });
  for (const b of note.boxes.values()) put(b, null);
  for (const [id, L] of note.areas) for (const b of L.boxes.values()) put(b, id);
  return out;
}
/** The comparable part of settleTree's answer. A failure is compared by its kind only: its message is for people. What the comparison
 *  computes itself (the canonical projection, the written fields) must not throw: `broken` fails the run, equal on both sides or not. */
function settled(E, r, stored) {
  if (r.threw) return { threw: true };
  if (!r.ok) return { ok: false, why: r.why };
  let canonical, written;
  try { canonical = E.unshow(r.layout, E.ctx); written = patches(E.diff(stored, canonical)); } catch (e) { return { broken: String(e && e.message) }; }
  return { ok: true, layout: r.layout, start: r.start, memory: r.memory, pressed: r.pressed ?? null, ran: r.ran, canonical, sound: soundness(E, r.layout), written };
}
const soundness = (E, T) => [T, ...T.areas.values()].map((L) => E.check(L).length);

/** One run: `notes` notes from `seed`, `steps` commands each. `rulesOf(E)` gives an engine its rules (the default ones unless a test of
 *  the comparison itself gives one side others). @returns {{stat:object, by:object, diffs:object[]}} */
export function run(A, B, { seed = 1, notes = 300, steps = 6, rulesOf = (E) => E.DEFAULT, max = 3 } = {}) {
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (xs) => xs[int(0, xs.length - 1)];
  const stat = { notes: 0, commands: 0, accepted: 0, moved: 0, refused: 0, failed: 0, removals: 0 }, by = {}, diffs = [];
  const note = (k) => by[k] || (by[k] = { accepted: 0, moved: 0, refused: 0, failed: 0 });
  const T = (id, col, y) => ({ id, kind: 'text', col, y }), S = (id, col, y, cw, ch) => ({ id, kind: 'text', col, y, cw, ...(ch ? { ch } : {}) });
  const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: A.readingOrder(boxes), areas: new Map() });

  for (let k = 0; k < notes && diffs.length < max; k++) {
    const seed0 = seed, cols = rnd() < 0.15 ? int(10, 16) : int(28, A.SHEETW), boxes = [], areas = {}, map = {}, hist = [];
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
      map[id] = rnd() < 0.3 ? { text: chars(int(20, 90)) } : rnd() < 0.2 ? { kind: 'area', header: int(2, 3) } : { kind: 'area' };   // a header that wraps at a narrower width (the stub measures an entry with no kind as a text), or a tall one
      areas[id] = []; for (let j = 0, m = int(0, 4); j < m; j++) areas[id].push(leaf(id + 'c' + j, 8));
    }
    const stored = { ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) };
    const storedA = storedOf(A, stored), storedB = storedOf(B, stored);
    // one map of measuring inputs, each engine its own Ctx over it (its own passports, settings and rules)
    for (const E of [A, B]) E.ctx = { rules: rulesOf(E), settings: E.SETTINGS, kinds: E.KINDS, measure: stubMeasure(map) };
    const differ = (what, a, b, extra) => { const ca = canon(a), cb = canon(b); if (JSON.stringify(ca) === JSON.stringify(cb)) return false; diffs.push({ note: k, seed: seed0, what, ...extra, hist: hist.slice(), first: firstDiff(ca, cb) }); return true; };

    const oa = answer(A, () => A.open(stored, A.ctx)), ob = answer(B, () => B.open(stored, B.ctx));
    if (differ('open', oa, ob)) continue;
    if (oa.threw || !oa.ok) continue;
    stat.notes++;
    let Tr = oa.shown, TrB = ob.shown;

    /** One command on both, from the same input; true when both accepted the same answer, which the sequence then goes on from. */
    const both = (kind, change, root, rootB, memory, memoryB) => {
      stat.commands++;
      const ra = answer(A, () => A.settleTree(root, change, memory, A.ctx)), rb = answer(B, () => B.settleTree(rootB, change, memoryB, B.ctx));
      const sa = settled(A, ra, storedA), sb = settled(B, rb, storedB);
      if (sa.broken || sb.broken) { diffs.push({ note: k, seed: seed0, what: kind, change, hist: hist.slice(), broken: [sa.broken || null, sb.broken || null] }); return { stop: true }; }
      if (differ(kind, sa, sb, { change })) return { stop: true };
      if (sa.ok) stat.removals += sa.written.reduce((n, [, p]) => n + p.filter(([, v]) => v === REMOVED).length, 0);
      const n = note(kind);
      if (sa.threw || !sa.ok) { if (sa.why === 'refused') { stat.refused++; n.refused++; } else { stat.failed++; n.failed++; } return { ok: false }; }
      stat.accepted++; n.accepted++;
      if (str(ra.layout) !== str(root)) { stat.moved++; n.moved++; }
      return { ok: true, a: ra, b: rb };
    };

    for (let s = 0; s < steps && diffs.length < max; s++) {
      const aids = [...Tr.areas.keys()], onSheet = [...Tr.boxes.keys()], leaves = onSheet.filter((id) => !Tr.areas.has(id));
      const box = aids.length && rnd() < 0.3 ? pick(aids) : null, L = box == null ? Tr : Tr.areas.get(box), ids = [...L.boxes.keys()];
      const which = rnd();
      let r = null, c = null, kind = null;

      if (which < 0.34 && ids.length) {   // a gesture: moves with its start and memory, then the drop is the last accepted move
        const id = pick(ids), b = L.boxes.get(id), home = { col: b.col, y: b.y };
        let st = Tr, stB = TrB, mem = A.emptyMemory(), memB = B.emptyMemory(), col = b.col, y = b.y, away = false, last = null, stop = false;
        hist.push(['gesture', box, id]);
        for (let m = 0, nm = int(2, 6); m < nm; m++) {
          const q = rnd();
          if (q < 0.3 || q >= 0.85) col = Math.max(0, Math.min(L.cols - b.w, col + int(-4, 4)));
          let past = false; if (rnd() < 0.06) { col = L.cols - int(0, Math.max(1, b.w - 1)); past = true; }   // a target past the right edge: phase 1c clamps or narrows it (DRAG.A3)
          if (q >= 0.3) y = Math.max(0, y + int(-4, 4));
          if (col === home.col && y === home.y) { st = Tr; stB = TrB; mem = A.emptyMemory(); memB = B.emptyMemory(); away = false; last = null; hist.push(['home']); continue; }   // DRAG.A4
          const place = (box == null ? st : st.areas.get(box)).boxes.get(id), card = { ...place, col, y };
          if (!away && !A.sharesCol(card, place)) away = true;   // DRAG.B1
          else if (away && A.sharesCol(card, place) && A.extent(card).r0 <= A.extent(place).r1 && A.extent(place).r0 <= A.extent(card).r1) away = false;
          const through = rnd() < 0.3 ? 'hold' : rnd() < 0.1 ? 'shift' : undefined, frow = y + [0, 0, 0.3, 0.5, 0.8][int(0, 4)];
          c = { type: 'carry', box, id, at: { col, y, frow, w: b.w }, away, through };
          hist.push([col, y, frow, away ? 'away' : '', through || '']);
          const g = both(past ? 'carry past the edge' : through ? 'carry+' + through : away ? 'carry away' : 'carry', c, st, stB, mem, memB);
          if (g.stop) { stop = true; break; }
          if (!g.ok) continue;
          last = g; st = g.a.start; stB = g.b.start; mem = g.a.memory; memB = g.b.memory;
        }
        if (stop) break;
        if (last) {
          const before = Tr; Tr = last.a.layout; TrB = last.b.layout;
          if (rnd() < 0.25) {   // the undo's carry back, on the inverse path (LAYOUT-ENGINE-PLAN §6.4)
            const L0 = box == null ? before : before.areas.get(box), b0 = L0.boxes.get(id), cur = (box == null ? Tr : Tr.areas.get(box)).boxes.get(id), cy = b0.yc ?? b0.y;
            if (cur) {
              c = { type: 'carry', box, id, at: { col: b0.col, y: cy, frow: cy, w: b0.w }, away: !A.sharesCol({ ...cur, col: b0.col, w: b0.w }, cur), canonical: true };
              hist.push(['undo', id]);
              const g = both('undo carry', c, Tr, TrB, A.emptyMemory(), B.emptyMemory());
              if (g.stop) break;
              if (g.ok) { Tr = g.a.layout; TrB = g.b.layout; }
            }
          }
        }
        continue;
      }
      if (which < 0.44) {   // typing: a text changes, its block is sized again
        const el = ids.filter((i) => L.boxes.get(i).kind !== 'area'); if (!el.length) continue;
        const id = pick(el), code = L.boxes.get(id).kind === 'code';
        map[id] = { ...map[id], text: code ? Array.from({ length: int(1, 18) }, () => chars(int(1, 30))).join('\n') : chars(int(1, 70)) }; kind = code ? 'size code' : 'size'; c = { type: 'size', box, id };
      } else if (which < 0.5) {   // a set size given or taken
        const el = ids.filter((i) => L.boxes.get(i).kind === 'text'); if (!el.length) continue;
        const id = pick(el), b = L.boxes.get(id);
        kind = 'size set'; c = { type: 'size', box, id, set: rnd() < 0.5 ? { ch: b.ch ? null : int(2, 6) } : b.cw != null ? { cw: null } : { ch: int(2, 6) } };
      } else if (which < 0.58) {   // the width handle of a set width
        const sw = ids.filter((i) => L.boxes.get(i).kind === 'text' && L.boxes.get(i).cw != null); if (!sw.length) continue;
        const id = pick(sw), b = L.boxes.get(id);
        kind = 'width'; c = rnd() < 0.7 ? { type: 'width', box, id, cw: Math.max(1, b.cw + int(-3, 5)), side: 'right' } : (() => { const d = int(-3, 3) || 1; return { type: 'width', box, id, cw: Math.max(1, b.cw - d), side: 'left', col: Math.max(0, b.col + d) }; })();
      } else if (which < 0.66) {   // a new block
        const id = 'N' + k + '_' + s; map[id] = { text: chars(int(1, 40)) };
        const w = int(2, 8), col = int(0, Math.max(0, L.cols - w - 1)), y = int(0, 14);
        kind = 'create'; c = { type: 'create', box, id, kind: 'text', at: { col, y, frow: y + [0, 0.5][int(0, 1)], w }, away: true, ...(rnd() < 0.4 ? { set: { cw: w - 1 } } : {}) };
      } else if (which < 0.72 && ids.length) {
        const id = pick(ids); kind = Tr.areas.has(id) ? 'remove area' : 'remove'; c = { type: 'remove', box, id };
        if (kind === 'remove' && rnd() < 0.5) {   // and the undo of the deletion: the block made again at its canonical cell (LAYOUT-ENGINE-PLAN §6.4)
          const b = L.boxes.get(id), cy = b.yc ?? b.y;
          hist.push([kind, c]);
          const d = both(kind, c, Tr, TrB, A.emptyMemory(), B.emptyMemory());
          if (d.stop) break;
          if (!d.ok) continue;
          Tr = d.a.layout; TrB = d.b.layout;
          const set = {}; for (const f of ['cw', 'ch']) if (b[f] != null) set[f] = b[f];
          kind = 'create again'; c = { type: 'create', box, id, kind: b.kind, at: { col: b.col, y: cy, frow: cy, w: b.w }, away: true, set, canonical: true };
        }
      } else if (which < 0.78 && aids.length && leaves.length) {
        kind = 'enter'; c = { type: 'enter', box: null, id: pick(leaves), to: pick(aids), at: { col: int(0, 4), y: int(0, 4) } };
      } else if (which < 0.84 && aids.length) {
        const a = pick(aids), kids = [...Tr.areas.get(a).boxes.keys()]; if (!kids.length) continue;
        kind = 'leave'; c = { type: 'leave', box: a, id: pick(kids), to: null, at: { col: int(0, Math.max(0, cols - 8)), y: int(0, 14) } };
      } else if (which < 0.9 && aids.length) {
        const a = pick(aids), b = Tr.boxes.get(a);
        kind = 'areaSide'; c = rnd() < 0.5 ? { type: 'areaSide', box: null, id: a, side: 'right', col: b.col, cols: b.w + int(-6, 6) } : { type: 'areaSide', box: null, id: a, side: 'left', col: b.col + int(-4, 4), cols: 0 };
      } else if (which < 0.93) {
        const id = 'D' + k + '_' + s; map[id] = { kind: 'area' };
        kind = 'drawArea'; c = { type: 'drawArea', box: null, id, at: { col: int(0, Math.max(0, cols - 16)), y: int(0, 14), cols: int(12, 16), rows: int(2, 4) } };
      } else if (which < 0.95 && aids.length) {
        kind = 'ungroup'; c = { type: 'ungroup', box: null, id: pick(aids) };
      } else if (which < 0.975 && aids.length) {
        const a = pick(aids), b = Tr.boxes.get(a);
        kind = 'area size'; c = { type: 'size', box: null, id: a, set: rnd() < 0.5 ? { collapsed: !b.collapsed } : { ch: rnd() < 0.3 ? null : int(2, 12) } };
      } else {   // a temporary height starts or ends: nothing is settled, the same stacks are shown again
        const el = [...leaves, ...aids.flatMap((a) => [...Tr.areas.get(a).boxes.keys()])]; if (!el.length) continue;
        // by the measure (an unfolded block), or by the rows `show` is given for a block, an area included (P18's row; an area's own row)
        const own = rnd() < 0.5, id = own ? pick([...el, ...aids]) : pick(el), temp = new Map();
        if (own) temp.set(id, int(1, 2)); else map[id] = { ...map[id], temp: map[id].temp ? 0 : int(1, 3) };
        hist.push(['temp', id, own ? 'own' : map[id].temp]);
        const sa = answer(A, () => A.show(A.unshow(Tr, A.ctx), temp, A.ctx)), sb = answer(B, () => B.show(B.unshow(TrB, B.ctx), temp, B.ctx));
        const name = own ? 'show own rows' : 'show';
        if (differ(name, sa, sb)) break;
        if (sa.threw) { diffs.push({ note: k, seed: seed0, what: name, hist: hist.slice(), broken: [sa.threw, sb.threw || null] }); break; }
        Tr = sa; TrB = sb; note(name).accepted++;
        continue;
      }
      hist.push([kind, c]);
      r = both(kind, c, Tr, TrB, A.emptyMemory(), B.emptyMemory());
      if (r.stop) break;
      if (r.ok) { Tr = r.a.layout; TrB = r.b.layout; }
    }
  }
  return { stat, by, diffs };
}
