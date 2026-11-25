// The histories of the undo experiment (docs/LAYOUT-SEAMS-PLAN.md §7): a note, some actions to give it a memory of gaps, one to three
// actions each with later changes of content, and then the undos, last action first, by each path of paths.mjs, compared. Seeded; every
// count the report gives comes from `run`.

import { settleTree } from '../../../public/layout/tree.js';
import { emptyMemory } from '../../../public/layout/settle.js';
import { open, show, unshow } from '../../../public/layout/layout.js';
import { readingOrder } from '../../../public/layout/geometry.js';
import { KINDS } from '../../../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../../../public/layout/rules.js';
import { stubMeasure } from '../../lib/measure.mjs';
import { sigOf, sigsOf, undoA, undoB, undoBprime, counterfactual, placesOf, probesOf, queueOf } from './paths.mjs';

const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const chars = (n) => 'x'.repeat(n);
export const ctxOf = (map) => ({ rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
export const noteOf = (cols, boxes, areas = {}) => ({ ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });
const clone = (map) => JSON.parse(JSON.stringify(map));
const holds = (T, id) => [[null, T], ...T.areas].some(([, L]) => L.boxes.has(id));
/** The paths that are an undo by themselves; the yardstick is played apart. */
export const PATHS = ['A', 'B', 'Bq', "B'"];

/** One history played and undone by every path. `h`: {note, map, warm: action[], stages: [{action, added?: {id, content}, edits}]}, one
 *  to three stages. An action is a Change, or a gesture `{type: 'carry', box, id, moves: [{at, away, through?}]}` (every move from the
 *  gesture's start, the last one the drop). An edit is `{id, content}` (what the block is measured from: its text, its lines, its
 *  temporary rows by the measure, an area's header) or `{own: [id, rows]}` (the block's own temporary rows, `tx`).
 *  @returns the comparison, or {skip: why} */
export function play(h) {
  const map = clone(h.map), ctx = ctxOf(map), own = new Map();
  const o = open(h.note, ctx); if (!o.ok) return { skip: 'the note does not open' };
  let T = o.shown;
  const one = (c) => { const r = settleTree(T, c, emptyMemory(), ctx); if (r.ok) T = r.layout; return r.ok; };
  const act = (c) => {
    if (!c.moves) return one(c);
    let start = T, memory = emptyMemory(), last = null;
    for (const m of c.moves) {
      const r = settleTree(start, { type: 'carry', box: c.box, id: c.id, at: m.at, away: !!m.away, ...(m.through ? { through: m.through } : {}) }, memory, ctx);
      if (!r.ok) return false;
      start = r.start; memory = r.memory; last = r.layout;
    }
    if (last) T = last;
    return !!last;
  };
  for (const c of h.warm || []) act(c);
  const boxOf = (id) => { for (const [n, L] of [[null, T], ...T.areas]) if (L.boxes.has(id)) return [n]; return null; };
  const entries = [], journals = [];
  for (const s of h.stages) {
    const entry = { before: T, sigs: sigsOf(map), action: s.action, mapBefore: clone(map), ownBefore: new Map(own) };
    if (s.added) map[s.added.id] = s.added.content;
    if (!act(s.action)) { if (s.added) delete map[s.added.id]; return { skip: entries.length ? 'a later action is not accepted' : 'the action is not accepted' }; }
    entries.push(entry);
    const journal = [];
    for (const e of s.edits || []) {
      if (e.own) {
        const [id, n] = e.own; if (!boxOf(id)) continue;
        if (n > 0) own.set(id, n); else own.delete(id);
        T = show(unshow(T, ctx), own, ctx); journal.push(e); continue;
      }
      const at = boxOf(e.id), was = map[e.id];
      if (!at) {
        // not in the tree: a block only an entry holds (one of the actions to undo took it away), or one gone before them, which
        // nothing holds and no edit reaches
        // the entry that holds it is the last one whose tree before has it: the action that took it away
        let holder = -1; entries.forEach((x, k) => { if (holds(x.before, e.id)) holder = k; });
        if (holder < 0) continue;
        map[e.id] = e.content; journal.push({ id: e.id, content: e.content, held: true, holder }); continue;
      }
      map[e.id] = e.content;
      if (one({ type: 'size', box: at[0], id: e.id })) journal.push({ id: e.id, content: e.content }); else map[e.id] = was;
    }
    journals.push(journal);
  }
  const first = entries[0], all = journals.flat(), n = entries.length;
  const kind = (h.stages[0].action.moves ? 'gesture' : h.stages[0].action.type) + (h.stages[0].action.box != null ? ' in an area' : '');
  const out = { kind, edits: all.length, undos: n, map };
  // the required cases, told by the block: one the first entry holds whose signature left the recorded one and is the recorded one
  // again; one only an entry holds whose content changed
  const trail = {};
  for (const e of all) if (!e.own && holds(first.before, e.id)) (trail[e.id] ??= []).push(JSON.stringify(e.content));
  out.returns = Object.entries(trail).some(([id, l]) => l.some((x) => x !== first.sigs[id]) && sigOf(map, id) === first.sigs[id]);
  // (the signature that entry recorded for it, when the action took it away, against today's: an edit that leaves the content as that
  // entry has it is no change of it, whatever an earlier entry recorded; the independent review of 42f67dd)
  out.held = all.some((e) => e.held && sigOf(map, e.id) !== entries[e.holder].sigs[e.id]);
  out.kinds = { code: all.some((e) => !e.own && e.content.kind === 'code'), temp: all.some((e) => !e.own && 'temp' in e.content), header: all.some((e) => !e.own && e.content.kind === 'area'), own: all.some((e) => e.own) };
  out.queue = queueOf(unshow(first.before, ctx), first.sigs, map).length;

  // every path undoes the actions last first, each from its own entry; a path that does not answer one of them stops there
  const ownNow = (T2) => new Map([...own].filter(([id]) => holds(T2, id)));
  const step = { A: (e, now) => undoA(e, now, ctx, ownNow(e.before)), B: (e) => undoB(e, map, ctx, 'queue', ownNow(e.before)), Bq: (e) => undoB(e, map, ctx, 'reversed', ownNow(e.before)), "B'": (e) => undoBprime(e, map, ctx, ownNow(e.before)) };
  const R = {}; out.chain = {};
  for (const p of PATHS) {
    let now = T, r = null; out.chain[p] = [];
    for (let k = n - 1; k >= 0; k--) {
      r = step[p](entries[k], now);
      out.chain[p].push(r.ok ? 'ok' : r.why);
      if (!r.ok) { r = { ...r, at: n - k }; break; }
      now = r.shown;
    }
    R[p] = r;
  }
  R.C = (() => { try { return counterfactual(first, all, clone(first.mapBefore), ctxOf, new Map(first.ownBefore)) || { ok: false, why: 'no yardstick' }; } catch (e) { return { ok: false, why: 'failed', errors: [e.message] }; } })();
  out.status = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.ok ? 'ok' : r.why]));
  out.errors = Object.fromEntries(Object.entries(R).filter(([, r]) => !r.ok && r.errors?.length).map(([k, r]) => [k, r.errors[0]]));
  const places = Object.fromEntries(Object.entries(R).filter(([, r]) => r.ok).map(([k, r]) => [k, placesOf(r.canonical)]));
  const probes = {}, probe = (k) => (probes[k] ??= probesOf(R[k].shown, map, ctxOf));
  out.pairs = {};
  for (const [x, y] of [['A', 'B'], ['B', "B'"], ['B', 'Bq'], ['A', 'C'], ['B', 'C'], ["B'", 'C']]) {
    if (!R[x].ok || !R[y].ok) continue;
    out.pairs[x + ' ~ ' + y] = places[x] !== places[y] ? 'other rows' : probe(x) !== probe(y) ? 'the same rows, other probes' : 'the same';
  }
  out.exact = all.length === 0 && n === 1 ? Object.fromEntries(Object.entries(R).filter(([, r]) => r.ok).map(([k, r]) => [k, placesOf(r.canonical) === placesOf(unshow(first.before, ctx))])) : null;
  out.trees = { before: first.before, now: T, ...Object.fromEntries(Object.entries(R).filter(([, r]) => r.ok).map(([k, r]) => [k, r.shown])) };
  return out;
}

/** A random history. */
export function draw(seed) {
  const rnd = mulberry(seed), int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (l) => l[int(0, l.length - 1)];
  const cols = int(30, 44), map = {}, boxes = [], areas = {};
  const lines = (n) => Array.from({ length: n }, () => chars(int(4, 24))).join('\n');
  const leaf = (id, cmax) => {
    const w = rnd(), b = { id, kind: 'text', col: int(0, Math.max(0, cmax - 8)), y: int(0, 12) };
    if (w < 0.12 && cmax >= 20) { b.kind = 'code'; if (rnd() < 0.4) b.open = true; map[id] = { kind: 'code', text: lines(int(2, 22)) }; return b; }
    const el = w < 0.56;
    if (!el) { b.cw = int(2, 7); if (rnd() < 0.2) b.ch = int(2, 4); }
    map[id] = { text: chars(int(1, el ? 80 : 30)), ...(rnd() < 0.12 ? { temp: int(1, 2) } : {}) };
    return b;
  };
  for (let i = 0, n = int(3, 7); i < n; i++) boxes.push(leaf('B' + i, cols));
  for (let i = 0, n = rnd() < 0.55 ? int(1, 2) : 0; i < n; i++) {
    const id = 'R' + i, cw = int(12, 18); boxes.push({ id, kind: 'area', col: int(0, Math.max(0, cols - cw - 2)), y: int(1, 12), cw }); map[id] = { kind: 'area' };
    areas[id] = []; for (let j = 0, m = int(0, 3); j < m; j++) areas[id].push(leaf(id + 'c' + j, cw));
  }
  const note = noteOf(cols, boxes, areas);
  // the commands are drawn against the note as read: a block's place when a command runs may be another, which is what a history is
  const sheet = boxes.filter((b) => b.kind !== 'area').map((b) => b.id), aids = Object.keys(areas), kids = aids.flatMap((a) => areas[a].map((b) => [a, b.id]));
  const leaves = [...sheet, ...kids.map(([, id]) => id)], byId = Object.fromEntries([...boxes, ...aids.flatMap((a) => areas[a])].map((b) => [b.id, b]));
  const sets = leaves.filter((id) => byId[id].kind === 'text' && byId[id].cw != null);
  let fresh = 0;
  const carry = (id, b) => { const col = int(0, cols - 6), y = int(0, 16); return { type: 'carry', box: null, id, at: { col, y, frow: y, w: (b.cw ?? 5) + 1 }, away: Math.abs(col - b.col) > 6 }; };
  const action = () => {
    const w = rnd();
    if (w < 0.24 && sheet.length) { const id = pick(sheet); return { action: carry(id, byId[id]) }; }
    if (w < 0.33 && sheet.length) {   // a gesture of two or three moves, a hold or Shift at one of them, so that a neighbour may be let through and swapped
      const id = pick(sheet), b = byId[id], col = Math.max(0, b.col + int(-1, 1)), moves = [];
      for (let i = 0, n = int(2, 3), y = b.y; i < n; i++) { y = Math.max(0, y + int(1, 4) * (rnd() < 0.8 ? 1 : -1)); moves.push({ at: { col, y, frow: y + [0, 0.3, 0.8][int(0, 2)], w: (b.cw ?? 5) + 1 }, away: false, ...(rnd() < 0.6 ? { through: rnd() < 0.5 ? 'hold' : 'shift' } : {}) }); }
      return { action: { type: 'carry', box: null, id, moves } };
    }
    if (w < 0.41 && kids.length) { const [a, id] = pick(kids), y = int(0, 6), col = int(0, 6); return { action: { type: 'carry', box: a, id, at: { col, y, frow: y, w: 4 }, away: false } }; }
    if (w < 0.54) { const id = 'N' + (fresh++), cw = int(2, 7), col = int(0, cols - cw - 2), y = int(0, 14), box = aids.length && rnd() < 0.25 ? pick(aids) : null; return { action: { type: 'create', box, id, kind: 'text', at: { col: box ? int(0, 4) : col, y: box ? int(0, 4) : y, frow: box ? 0 : y, w: cw + 1 }, away: true, set: { cw } }, added: { id, content: { text: chars(int(1, 30)) } } }; }
    if (w < 0.66 && leaves.length) { const id = pick(leaves), k = kids.find(([, c]) => c === id); return { action: { type: 'remove', box: k ? k[0] : null, id } }; }
    if (w < 0.72 && leaves.length) { const id = pick(leaves), k = kids.find(([, c]) => c === id), b = byId[id]; return { action: { type: 'size', box: k ? k[0] : null, id, set: rnd() < 0.6 ? { ch: b.ch ? null : int(2, 6) } : b.cw != null ? { cw: null } : { cw: int(3, 9) } } }; }
    if (w < 0.77 && sets.length) { const id = pick(sets), k = kids.find(([, c]) => c === id), b = byId[id]; return { action: { type: 'width', box: k ? k[0] : null, id, cw: Math.max(1, b.cw + (int(-3, 4) || 1)), side: 'right' } }; }
    if (w < 0.84 && aids.length && sheet.length) return { action: { type: 'enter', box: null, id: pick(sheet), to: pick(aids), at: { col: int(0, 4), y: int(0, 4) } } };
    if (w < 0.9 && kids.length) { const [a, id] = pick(kids); return { action: { type: 'leave', box: a, id, to: null, at: { col: int(0, cols - 8), y: int(0, 14) } } }; }
    if (w < 0.94 && aids.length) return { action: { type: 'ungroup', box: null, id: pick(aids) } };
    if (aids.length) { const id = pick(aids), b = byId[id]; return rnd() < 0.5 ? { action: { type: 'areaSide', box: null, id, side: 'right', cols: b.cw + int(-3, 4) } } : { action: { type: 'areaSide', box: null, id, side: 'left', col: Math.max(0, b.col + int(-3, 3)) } }; }
    const id = pick(sheet); return { action: carry(id, byId[id]) };
  };
  // what a block is measured from, as the edits leave it; an edit is drawn against the content the edits before it gave
  const content = clone(map);
  const retype = (id) => { const old = content[id]; return old.kind === 'code' ? { ...old, text: lines(int(2, 26)) } : { ...old, text: chars(int(1, 80)) }; };
  const edits = (extra) => {
    const out = [], pool = [...leaves, ...extra];
    for (let i = 0, n = rnd() < 0.2 ? 0 : int(1, 3); i < n && pool.length; i++) {
      const w = rnd(), id = pick(pool), old = content[id] || { text: 'x' };
      if (w < 0.08) { out.push({ own: [id, int(0, 2)] }); continue; }
      if (w < 0.16 && aids.length) { const a = pick(aids); content[a] = { kind: 'area', header: int(1, 3) }; out.push({ id: a, content: content[a] }); continue; }
      if (w < 0.28) { content[id] = { ...old, temp: old.temp ? 0 : int(1, 2) }; out.push({ id, content: content[id] }); continue; }
      if (w < 0.46) { out.push({ id, content: retype(id) }, { id, content: old }); continue; }   // typed over and back: its signature returns
      content[id] = retype(id); out.push({ id, content: content[id] });
    }
    return out;
  };
  const warm = []; for (let i = 0, n = int(0, 3); i < n; i++) { const a = action(); if (!a.added) warm.push(a.action); }
  const stages = [];
  for (let i = 0, n = rnd() < 0.65 ? 1 : rnd() < 0.63 ? 2 : 3; i < n; i++) { const a = action(); if (a.added) content[a.added.id] = a.added.content; stages.push({ ...a, edits: edits(a.added ? [a.added.id] : []) }); }
  return { note, map, warm, stages };
}

/** `n` histories from `seed`, tallied. `keep`: how many of the smallest differing cases to keep per pair, for the pictures. */
export function run({ seed = 1, n = 1500, keep = 6 } = {}) {
  const stat = { drawn: 0, played: 0, skipped: {}, byKind: {}, between: 0, nothing: 0, undos: { 1: 0, 2: 0, 3: 0 }, returns: 0, held: 0, composite: 0, gesture: 0, code: 0, temp: 0, header: 0, own: 0, sized: 0 };
  const status = {}, chain = {}, pairs = {}, exact = {}, cases = {}, errors = {}, found = [];
  const inc = (o, k, d = 1) => { o[k] = (o[k] || 0) + d; };
  for (let i = 0; i < n; i++) {
    const s0 = seed * 100003 + i, h = draw(s0); stat.drawn++;
    let r; try { r = play(h); } catch (e) { inc(stat.skipped, 'threw: ' + String(e.message).slice(0, 60)); continue; }
    if (r.skip) { inc(stat.skipped, r.skip); continue; }
    stat.played++; inc(stat.byKind, r.kind);
    if (r.exact) { stat.nothing++; for (const [k, v] of Object.entries(r.exact)) { exact[k] ??= { same: 0, other: 0 }; exact[k][v ? 'same' : 'other']++; } continue; }
    stat.between++; stat.undos[r.undos]++;
    if (r.returns) stat.returns++; if (r.held) stat.held++;
    const t0 = h.stages[0].action;
    if (['enter', 'leave', 'ungroup', 'areaSide'].includes(t0.type)) stat.composite++;
    if (t0.moves) stat.gesture++;
    if (t0.type === 'size' || t0.type === 'width') stat.sized++;
    for (const k of ['code', 'temp', 'header', 'own']) if (r.kinds[k]) stat[k]++;
    for (const [k, v] of Object.entries(r.status)) { status[k] ??= {}; inc(status[k], v); }
    for (const [k, l] of Object.entries(r.chain)) l.forEach((v, j) => { chain[k] ??= {}; chain[k][j + 1] ??= {}; inc(chain[k][j + 1], v); if (v === 'failed' && k !== "B'") found.push({ seed: s0, path: k, undo: j + 1, error: String(r.errors[k] || '').slice(0, 160) }); });
    for (const [k, v] of Object.entries(r.errors)) { errors[k] ??= {}; inc(errors[k], String(v).replace(/\b[A-Z]\d+(c\d+)?\b/g, '#').slice(0, 80)); }
    for (const [k, v] of Object.entries(r.pairs)) {
      pairs[k] ??= {}; inc(pairs[k], v);
      if (v === 'the same') continue;
      const size = r.trees.before.boxes.size + [...r.trees.before.areas.values()].reduce((a, L) => a + L.boxes.size, 0) + (h.warm.length + r.edits) * 2 + (r.undos - 1) * 8;
      (cases[k] ??= []).push({ size, seed: s0, kind: r.kind, how: v, h, r });
    }
  }
  for (const k of Object.keys(cases)) cases[k] = cases[k].sort((a, b) => a.size - b.size).slice(0, keep);
  return { stat, status, chain, errors, pairs, exact, cases, found };
}
