// The histories of the undo experiment (docs/LAYOUT-SEAMS-PLAN.md §7): a note, some actions to give it a memory of gaps, the action to
// undo, later edits of content, and then the undo by each path of paths.mjs, compared. Seeded; every count the report gives comes from
// `run`.

import { settleTree } from '../../../public/layout/tree.js';
import { emptyMemory } from '../../../public/layout/settle.js';
import { open, unshow } from '../../../public/layout/layout.js';
import { readingOrder, sharesCol, isArea } from '../../../public/layout/geometry.js';
import { KINDS } from '../../../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../../../public/layout/rules.js';
import { stubMeasure } from '../../lib/measure.mjs';
import { sigsOf, undoA, undoB, undoBprime, counterfactual, placesOf, probesOf, queueOf } from './paths.mjs';

const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const chars = (n) => 'x'.repeat(n);
export const ctxOf = (map) => ({ rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
export const noteOf = (cols, boxes, areas = {}) => ({ ...lay(cols, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });
const clone = (map) => JSON.parse(JSON.stringify(map));

/** One history played and undone by every path. `h`: {note, map, warm: Change[], action: Change, added?: {id, content} (a created
 *  block's content), edits: {id, content}[] (typing, in order; the block's container found when it is played), second?: the same
 *  shape again, an action after the first with its own edits (two undos in a row)}. @returns the comparison, or {skip: why} */
export function play(h) {
  const map = clone(h.map), ctx = ctxOf(map);
  const o = open(h.note, ctx); if (!o.ok) return { skip: 'the note does not open' };
  let T = o.shown;
  const act = (c) => { const r = settleTree(T, c, emptyMemory(), ctx); if (r.ok) T = r.layout; return r.ok; };
  for (const c of h.warm || []) act(c);
  const boxOf = (id) => { for (const [n, L] of [[null, T], ...T.areas]) if (L.boxes.has(id)) return [n]; return null; };
  /** An action and its later edits; the entry as the app would keep it, and the journal of edits only the yardstick reads. */
  const stage = (s) => {
    const entry = { before: T, sigs: sigsOf(map), action: s.action, mapBefore: clone(map) };
    if (s.added) map[s.added.id] = s.added.content;
    if (!act(s.action)) { if (s.added) delete map[s.added.id]; return null; }
    const journal = [];
    for (const e of s.edits || []) {
      const was = map[e.id], at = boxOf(e.id);
      map[e.id] = e.content;
      if (!at) { journal.push({ box: null, id: e.id, content: e.content, held: true }); continue; }   // a block only the entry holds
      if (act({ type: 'size', box: at[0], id: e.id })) journal.push({ box: at[0], id: e.id, content: e.content }); else map[e.id] = was;
    }
    return { entry, journal };
  };
  const first = stage(h); if (!first) return { skip: 'the action is not accepted' };
  const second = h.second ? stage(h.second) : null;
  if (h.second && !second) return { skip: 'the second action is not accepted' };

  const kind = h.action.type + (h.action.box != null ? ' in an area' : '');
  const out = { kind, edits: first.journal.length, returns: false, held: first.journal.some((e) => e.held), two: !!second };
  // two undos in a row: the second action is undone first, by each path from its own entry, then the first
  let nowA = T, chainA = true;
  if (second) {
    const a2 = undoA(second.entry, T, ctx); if (a2.ok) nowA = a2.shown; else chainA = false;
    out.second = { A: a2.ok ? 'ok' : a2.why, B: undoB(second.entry, map, ctx).ok, ...(a2.ok || !a2.errors?.length ? {} : { error: a2.errors[0] }) };
  }
  const { entry, journal } = first;
  out.queue = queueOf(unshow(entry.before, ctx), entry.sigs, map).length;
  out.returns = journal.length > 0 && out.queue < new Set(journal.map((e) => e.id)).size;   // some block typed in has its old signature again
  const R = {
    A: chainA ? undoA(entry, nowA, ctx) : { ok: false, why: 'no undo' },
    B: undoB(entry, map, ctx),
    Bq: undoB(entry, map, ctx, 'reversed'),
    "B'": undoBprime(entry, map, ctx),
    C: (() => { try { return counterfactual(entry, [...journal, ...(second ? second.journal : [])], clone(entry.mapBefore), ctxOf) || { ok: false, why: 'no yardstick' }; } catch (e) { return { ok: false, why: 'failed', errors: [e.message] }; } })(),
  };
  out.status = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, r.ok ? 'ok' : r.why]));
  out.errors = Object.fromEntries(Object.entries(R).filter(([, r]) => !r.ok && r.errors?.length).map(([k, r]) => [k, r.errors[0]]));
  const places = Object.fromEntries(Object.entries(R).filter(([, r]) => r.ok).map(([k, r]) => [k, placesOf(r.canonical)]));
  const probes = {};
  const probe = (k) => (probes[k] ??= probesOf(R[k].shown, map, ctxOf));
  out.pairs = {};
  for (const [x, y] of [['A', 'B'], ['B', "B'"], ['B', 'Bq'], ['A', 'C'], ['B', 'C'], ["B'", 'C']]) {
    if (!R[x].ok || !R[y].ok) continue;
    out.pairs[x + ' ~ ' + y] = places[x] !== places[y] ? 'other rows' : probe(x) !== probe(y) ? 'the same rows, other probes' : 'the same';
  }
  out.exact = journal.length === 0 && !second ? Object.fromEntries(Object.entries(R).filter(([, r]) => r.ok).map(([k, r]) => [k, placesOf(r.canonical) === placesOf(unshow(entry.before, ctx))])) : null;
  out.trees = { before: entry.before, now: T, ...Object.fromEntries(Object.entries(R).filter(([, r]) => r.canonical).map(([k, r]) => [k, r.shown || r.canonical])) };
  out.map = map;
  return out;
}

/** A random history. */
export function draw(seed) {
  const rnd = mulberry(seed), int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = (l) => l[int(0, l.length - 1)];
  const cols = int(30, 44), map = {}, boxes = [], areas = {};
  const leaf = (id, cmax) => {
    const el = rnd() < 0.5, b = { id, kind: 'text', col: int(0, Math.max(0, cmax - 8)), y: int(0, 12) };
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
  const texts = [...sheet, ...kids.map(([, id]) => id)];
  let fresh = 0;
  const action = () => {
    const w = rnd();
    if (w < 0.34 && sheet.length) { const id = pick(sheet), b = boxes.find((x) => x.id === id), col = int(0, cols - 6), y = int(0, 16); return { action: { type: 'carry', box: null, id, at: { col, y, frow: y, w: (b.cw ?? 5) + 1 }, away: Math.abs(col - b.col) > 6 } }; }
    if (w < 0.44 && kids.length) { const [a, id] = pick(kids), y = int(0, 6), col = int(0, 6); return { action: { type: 'carry', box: a, id, at: { col, y, frow: y, w: 4 }, away: false } }; }
    if (w < 0.6) { const id = 'N' + (fresh++), cw = int(2, 7), col = int(0, cols - cw - 2), y = int(0, 14), box = aids.length && rnd() < 0.25 ? pick(aids) : null; return { action: { type: 'create', box, id, kind: 'text', at: { col: box ? int(0, 4) : col, y: box ? int(0, 4) : y, frow: box ? 0 : y, w: cw + 1 }, away: true, set: { cw } }, added: { id, content: { text: chars(int(1, 30)) } } }; }
    if (w < 0.74 && texts.length) { const id = pick(texts), k = kids.find(([, c]) => c === id); return { action: { type: 'remove', box: k ? k[0] : null, id } }; }
    if (w < 0.82 && aids.length && sheet.length) return { action: { type: 'enter', box: null, id: pick(sheet), to: pick(aids), at: { col: int(0, 4), y: int(0, 4) } } };
    if (w < 0.89 && kids.length) { const [a, id] = pick(kids); return { action: { type: 'leave', box: a, id, to: null, at: { col: int(0, cols - 8), y: int(0, 14) } } }; }
    if (w < 0.94 && aids.length) return { action: { type: 'ungroup', box: null, id: pick(aids) } };
    if (aids.length) { const id = pick(aids), b = boxes.find((x) => x.id === id); return rnd() < 0.5 ? { action: { type: 'areaSide', box: null, id, side: 'right', cols: b.cw + int(-3, 4) } } : { action: { type: 'areaSide', box: null, id, side: 'left', col: Math.max(0, b.col + int(-3, 3)) } }; }
    const id = pick(sheet), b = boxes.find((x) => x.id === id), col = int(0, cols - 6), y = int(0, 16); return { action: { type: 'carry', box: null, id, at: { col, y, frow: y, w: (b.cw ?? 5) + 1 }, away: false } };
  };
  const edits = (extra) => {
    const out = [], pool = [...texts, ...extra];
    for (let i = 0, n = rnd() < 0.2 ? 0 : int(1, 3); i < n && pool.length; i++) {
      const id = pick(pool), old = map[id] || { text: 'x' };
      if (rnd() < 0.2) { out.push({ id, content: { ...old, text: chars(int(1, 80)) } }, { id, content: old }); continue; }   // typed over and back: its signature returns
      out.push({ id, content: { ...old, text: chars(int(1, 80)) } });
    }
    return out;
  };
  const warm = []; for (let i = 0, n = int(0, 3); i < n; i++) { const a = action(); if (!a.added) warm.push(a.action); }
  const one = action(), h = { note, map, warm, ...one, edits: edits(one.added ? [one.added.id] : []) };
  if (rnd() < 0.2) { const two = action(); h.second = { ...two, edits: edits(two.added ? [two.added.id] : []) }; }
  return h;
}

/** `n` histories from `seed`, tallied. `keep`: how many of the smallest differing cases to keep per pair, for the pictures. */
export function run({ seed = 1, n = 1500, keep = 6 } = {}) {
  const stat = { drawn: 0, played: 0, skipped: {}, byKind: {}, withEdits: 0, noEdits: 0, two: 0, returns: 0, held: 0, composite: 0 };
  const status = {}, pairs = {}, exact = {}, second = { A: {}, B: { ok: 0, not: 0 } }, cases = {}, errors = {};
  const inc = (o, k, d = 1) => { o[k] = (o[k] || 0) + d; };
  for (let i = 0; i < n; i++) {
    const h = draw(seed * 100003 + i); stat.drawn++;
    let r; try { r = play(h); } catch (e) { inc(stat.skipped, 'threw: ' + String(e.message).slice(0, 60)); continue; }
    if (r.skip) { inc(stat.skipped, r.skip); continue; }
    stat.played++; inc(stat.byKind, r.kind);
    if (r.exact) { stat.noEdits++; for (const [k, v] of Object.entries(r.exact)) { exact[k] ??= { same: 0, other: 0 }; exact[k][v ? 'same' : 'other']++; } continue; }
    stat.withEdits++; if (r.two) stat.two++; if (r.returns) stat.returns++; if (r.held) stat.held++;
    if (['enter', 'leave', 'ungroup', 'areaSide'].includes(h.action.type)) stat.composite++;
    for (const [k, v] of Object.entries(r.status)) { status[k] ??= {}; inc(status[k], v); }
    for (const [k, v] of Object.entries(r.errors)) { errors[k] ??= {}; inc(errors[k], String(v).slice(0, 90)); }
    if (r.second) { inc(second.A, r.second.A); second.B[r.second.B ? 'ok' : 'not']++; if (r.second.error) (second.errors ??= []).push({ seed: seed * 100003 + i, error: String(r.second.error).slice(0, 160) }); }
    for (const [k, v] of Object.entries(r.pairs)) {
      pairs[k] ??= {}; inc(pairs[k], v);
      if (v === 'the same') continue;
      const size = [...r.trees.before.boxes.keys()].length + [...r.trees.before.areas.values()].reduce((a, L) => a + L.boxes.size, 0) + (h.warm.length + r.edits) * 2 + (r.two ? 8 : 0);
      (cases[k] ??= []).push({ size, seed: seed * 100003 + i, kind: r.kind, how: v, h, r });
    }
  }
  for (const k of Object.keys(cases)) cases[k] = cases[k].sort((a, b) => a.size - b.size).slice(0, keep);
  return { stat, status, errors, pairs, exact, second, cases };
}
