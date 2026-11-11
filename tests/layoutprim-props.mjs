// Node: step 2a's pieces together, as a property (LAYOUT-ENGINE-PLAN §5.2), before settle.js exists. Two families of random small
// sheets: free sheets of elastic texts and set widths, a block created or carried (sideways by a column at most); and stacks, a text across
// the sheet with small blocks packed under it and a new block put over the text (the independent review of 517a8d7). The carry's judge,
// P-ASIDE for every block met from the side (by its side, P-UP or P-DOWN, when it has no room), P-UP for the blocks judged above, P-DOWN
// for those judged below, P-SEP for what still hits, under GAP.9 and GAP.5.2 on and off; then the transition, facts and no path
// (`transitionFacts`, the architecture review of 2026-11-11), with the columns from the geometry, through transition.js `checkTransition`
// and gap.js `relink`. What must hold: RELINK takes every transition the primitives make (a refusal is excused only by sides that
// contradict each other, a block judged below over one judged above, which P-DOWN then drags past the moved block, step 2b's question,
// when the refusal names one of them), its result breaks no invariant (relink's own check), and every block the phases moved stands at its
// target or under it (rule 5, G15). RELINK's rows are the result (INV-8): where they differ from the phases', the difference is reported,
// block by block, by what GAP decided (1b's landing law; GAP.9 off; O-25, a block pressed out from under a block that sank past it, the
// owner's (б) of 2026-11-11 still to build), not failed. The property checks itself: a moved block given a row above its target must fail
// it. Seeded.
import { set, text, chars, ctxOf, sheet, over, rows, hitting } from './lib/primcase.mjs';
import { aside, down, up, sep, transitionFacts, phase } from '../public/layout/primitives.js';
import { judgeCarry } from '../public/layout/changes.js';
import { relink } from '../public/layout/gap.js';
import { checkTransition, explain } from '../public/layout/transition.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { readingOrder, hits, sharesCol } from '../public/layout/geometry.js';
// a seed, and how many cases: node tests/layoutprim-props.mjs [seed] [N]
let seed = +process.argv[2] || 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const N = +process.argv[3] || 3000, NS = Math.ceil(N / 2);
let tried = 0, triedStack = 0, bad = 0, skip = 0, injected = 0, caught = 0; const fails = {}, firsts = [], inc = (k) => (fails[k] = (fails[k] || 0) + 1);
const report = {}, rep = (k) => (report[k] = (report[k] || 0) + 1), others = [];
let current = null;
const fail = (why) => { bad++; inc(why.replace(/[A-Z]\d?/g, '·').slice(0, 60)); if (firsts.length < 3) firsts.push({ ...current, why }); };
const covers = (b, c) => b.col + 1 <= c && c <= b.col + b.w - 1;
/** Why the differences between RELINK's rows and the working state's are not ones GAP decided, block by block, from the top: a list of
 *  [block, why], empty when every one is explained.
 *  Lower: a block that came into a column by itself, no lower than its reference (RELINK's `refs`, GAP.5 rule 3), or a block under one so
 *  put, by no more rows.
 *  Higher: only with GAP.9 off, a block under one that left a column it keeps (it rises as after a deletion), or under one that rose, by no
 *  more rows. */
function unexplained(base, after, rr, T, rules, refs = new Map(), count = true) {
  const selfIn = new Set(T.enter.filter(([, , h]) => h === 'self').map(([b]) => b)), low = new Map(), high = new Map(), out = [];
  const off9 = rules !== DEFAULT && rules['GAP.9'] === false;
  for (const b of after.order) {
    const B = after.boxes.get(b), dy = rr.get(b) - B.y; if (!dy) continue;
    const above = (a) => { const A = after.boxes.get(a); return a !== b && sharesCol(A, B) && A.y < B.y; };
    if (dy > 0) {
      // a block that came in by itself, no lower than its reference (GAP.5 rule 3: R, every block in its columns of base); or under such a
      // block, by no more rows
      if ((selfIn.has(b) && refs.has(b) && rr.get(b) <= refs.get(b)) || [...low].some(([a, da]) => above(a) && dy <= da)) { low.set(b, dy); continue; }
      out.push([b, `${b} is ${dy} rows lower in RELINK${selfIn.has(b) ? `, past its reference ${refs.get(b)}` : ', with no block come in by itself over it'}`]); continue;
    }
    const B0 = base.boxes.get(b);
    const left = B0 && [...base.boxes.values()].some((X0) => { if (X0.id === b || X0.y + X0.h > B0.y) return false;
      const XA = after.boxes.get(X0.id); for (let c = Math.max(X0.col + 1, B0.col + 1); c <= Math.min(X0.col + X0.w - 1, B0.col + B0.w - 1); c++) if (covers(B, c) && (!XA || !covers(XA, c))) return true; return false; });
    if (off9 && (left || [...high].some(([a, da]) => above(a) && -dy <= da))) { high.set(b, -dy); continue; }
    out.push([b, `${b} is ${-dy} rows higher in RELINK${off9 ? ', with no block over it that left a column it keeps' : ', with GAP.9 on'}`]);
  }
  if (count && low.size) rep('lower at its reference (landing law)'); if (count && high.size) rep('GAP.9 off: rises at RELINK');
  return out;
}
/** O-25 (the owner, 2026-11-11, (б), to build before step 2b): a block pressed out of every column it had, standing on the screen over a
 *  block that stood over it in base, which the same change took down past it. */
function o25(base, after, T) {
  const selfIn = new Set(T.enter.filter(([, , h]) => h === 'self').map(([b]) => b));
  return [...selfIn].some((s) => { const S0 = base.boxes.get(s), S1 = after.boxes.get(s); if (!S0 || !S1) return false;
    if (S0.col + 1 <= S1.col + S1.w - 1 && S1.col + 1 <= S0.col + S0.w - 1) return false;   // it keeps a column
    return [...base.boxes.values()].some((U0) => { const U1 = after.boxes.get(U0.id); return U0.id !== s && U1 && sharesCol(U0, S0) && U0.y < S0.y && sharesCol(U1, S1) && S1.y < U1.y; }); });
}
// two families: free sheets (any blocks anywhere, a block created or carried), and stacks (the independent review of 517a8d7): an elastic
// text across the sheet with a stack of small blocks packed under it, a new block put over the text that presses it aside, so that with
// GAP.9 off the blocks under the text rise in GAP's origins in chains of several, some moved by the phases and some not
for (let k = 0; k < (N + NS) * 3 && (tried < N || triedStack < NS); k++) {
  const stack = tried >= N;
  const cols = stack ? int(9, 14) : int(10, 16), map = {}, bs = [], n = stack ? int(3, 8) : int(3, 7);
  if (stack) {
    const len = int(cols * 2, cols * 6); map.T = { text: chars(len) }; const h = Math.ceil(len / ((cols - 1) * 3));
    bs.push(text('T', 0, 0, cols, h));
    for (let i = 0; i < n; i++) {
      const id = 'B' + i, w = int(2, 4), col = int(0, cols - w); let y = h + int(0, 1);
      for (const o of bs) if (o.id !== 'T' && o.col + 1 < col + w && col + 1 < o.col + o.w) y = Math.max(y, o.y + o.h + int(0, 1));
      bs.push(set(id, col, y, w, int(1, 2)));
    }
  } else for (let i = 0; i < n; i++) {
    const id = 'B' + i, el = rnd() < 0.4; let w, h, b;
    if (el) { const len = int(6, 60); map[id] = { text: chars(len) }; const nat = Math.max(1, Math.ceil(len / 3)); w = Math.min(nat, 26, cols - 2) + 1; h = Math.ceil(len / ((w - 1) * 3)); }
    else { w = int(2, 6); h = int(1, 3); }
    const col = int(0, cols - w); let y = 0;
    for (const o of bs) if (o.col + 1 < col + w && col + 1 < o.col + o.w) y = Math.max(y, o.y + o.h + int(0, 2));
    bs.push(el ? text(id, col, y, w, h) : set(id, col, y, w, h));
  }
  const rules = stack ? (rnd() < 0.7 ? resolve({ 'GAP.9': false, ...(rnd() < 0.3 ? { 'GAP.5.2': false } : {}) }) : DEFAULT) : rnd() < 0.3 ? resolve({ 'GAP.9': false }) : rnd() < 0.2 ? resolve({ 'GAP.5.2': false }) : DEFAULT;
  const ctx = ctxOf(map, rules);
  let base; try { base = sheet(cols, bs); } catch (e) { skip++; continue; }
  // the moved block: a new one (away), or one of base carried within its columns
  const create = stack || rnd() < 0.5; let X, w;
  if (create) {
    const xw = int(2, 5), xh = stack ? int(2, 6) : int(1, 3); X = set('X', int(0, cols - xw), stack ? 0 : int(0, 8), xw, xh);
    const boxes = new Map([...base.boxes, ['X', X]]), order = readingOrder(boxes.values());
    w = over({ ...base, boxes: new Map(order.map((id) => [id, boxes.get(id)])), order }, ctx, 'X');
  } else {
    const b = bs[int(0, n - 1)], d = int(-5, 5), dc = int(-1, 1);
    const B0 = base.boxes.get(b.id); if (!d && !dc) { skip++; continue; }
    const col = B0.col + dc, y = B0.y + d; if (y < 0 || col < 0 || col + B0.w > cols) { skip++; continue; }
    X = { ...B0, col, y }; w = over(base, ctx, b.id, { col, y });
  }
  const id = X.id, at = { col: w.L.boxes.get(id).col, y: w.L.boxes.get(id).y, frow: w.L.boxes.get(id).y };
  const mem = { away: create, sides: new Map(), through: null, areaBottoms: new Map(), lastTarget: null, dir: 'down' };
  const j = judgeCarry(w.L, base, { id, at, away: create }, mem, ctx);
  try {
    phase(w);
    for (const [m, sd] of j.met) { if (!w.L.boxes.has(m)) continue; if (!aside(w, m, id, sd)) { const s2 = j.side.get(m) || 'below'; if (s2 === 'above') up(w, new Set([m])); else down(w, new Set([m])); } }
    phase(w); up(w, new Set([...j.side].filter(([m, s2]) => s2 === 'above' && !j.met.has(m)).map(([m]) => m)));
    phase(w); down(w, new Set([...j.side].filter(([m, s2]) => s2 === 'below' && !j.met.has(m)).map(([m]) => m)));
    phase(w);
    for (let r = 0; r < 100; r++) { const h = hitting(w); if (!h) break; sep(w, h[0], h[1], (o) => j.side.get(o)); }
  } catch (e) { skip++; continue; }
  if (hitting(w) || w.L.boxes.get(id).y < 0) { skip++; continue; }
  if (stack) triedStack++; else tried++; current = { k, create, stack };
  if (process.env.DUMP) current.dump = { cols, base: [...base.boxes.values()].map((b) => [b.id, b.col, b.y, b.w, b.h]), X: [X.col, X.y, X.w, X.h], map, rules: rules === DEFAULT ? 'default' : Object.entries(rules).filter(([kk, v]) => v === false).map(([kk]) => kk), after: [...w.L.boxes.values()].map((b) => [b.id, b.col, b.y, b.w, b.h]), met: [...j.met], side: [...j.side] };
  const g = explain(base, w.L);
  const T = { base, after: w.L, ...transitionFacts(w, base), carried: id,
    leave: g.left.map(([b, col]) => [b, col, b === id ? 'narrow' : 'press']), enter: g.entered.map(([b, col]) => [b, col, b === id ? 'put' : 'self']), pass: [] };
  const errs = checkTransition(T); let r; try { r = relink(T, rules); } catch (e) { r = { ok: false, errors: [e.message] }; }
  const rr = r.ok ? new Map([...r.layout.boxes].map(([b, x]) => [b, x.y])) : null;
  // contradictory sides (step 2b's question): a block judged above the moved block ends under it, or one judged below ends over it, in a
  // column both share; it excuses only a refused transition that names one of them
  const X2 = w.L.boxes.get(id), contra = [...j.side].filter(([b, s2]) => { const B2 = w.L.boxes.get(b); if (!B2 || j.met.has(b)) return false;
    const shares = B2.col + 1 < X2.col + X2.w && X2.col + 1 < B2.col + B2.w; return shares && (s2 === 'above' ? B2.y > X2.y : B2.y < X2.y); }).map(([b]) => b);
  if (errs.length && contra.some((b) => errs.some((e) => e.includes(b)))) { rep('refused: contradictory sides (2b)'); continue; }
  if (errs.length || !r.ok) { fail(errs[0] || r.errors[0]); continue; }
  // every block the phases moved stands at its target (rule 5 holds it, G15), or lower only as GAP decides (a block that came in by itself
  // pushing it, the landing law): never above it, and never elsewhere unexplained
  const refs = r.refs || new Map();
  const movedWrong = (m, rf, count) => { const hi = T.moved.find((b) => m.has(b) && m.get(b) < w.L.boxes.get(b).y); if (hi) return `${hi} stands above its target`;
    const u = unexplained(base, w.L, m, T, rules, rf, count).find(([b]) => T.moved.includes(b)); return u ? u[1] : null; };
  const wrong = movedWrong(rr, refs, true), isO25 = o25(base, w.L, T);
  // O-25 (б) is to be built before step 2b: until then its hole, and the moved blocks under it pushed down, are reported, not failed
  if (wrong && isO25) { rep('O-25: pressed out from under a block that sank past it'); continue; }
  if (wrong) { fail(wrong); continue; }
  // the report: RELINK's rows are the result (INV-8); where a block the phases did not move stands elsewhere, by what GAP decided
  const why = unexplained(base, w.L, rr, T, rules, refs, false);
  if (why.length) { if (isO25) rep('O-25: pressed out from under a block that sank past it'); else { rep('other'); if (others.length < 3) others.push({ ...current, why: why[0][1] }); } }
  // the property's own check: SETTLE dropping its facts (only the carried block held) must leave some moved block where RELINK cannot put it
  if (injected < 300 && T.moved.some((b) => b !== id)) {
    injected++; let r2; try { r2 = relink({ ...T, moved: [id] }, rules); } catch (e) { r2 = { ok: false }; }
    if (!r2.ok || movedWrong(new Map([...r2.layout.boxes].map(([b, x]) => [b, x.y])), r2.refs || new Map(), false)) caught++;
  }
}
// the reviewer's case, fixed: A pressed one column right into a free column by a new block X; RELINK leaves it at 0, its reference: put
// at 1 or at 100 instead, nothing explains it
let named = false;
{
  const base = sheet(8, [set('A', 0, 0, 3)]), ctx = ctxOf();
  const boxes = new Map([...base.boxes, ['X', set('X', 0, 0, 2)]]), order = readingOrder(boxes.values());
  const w = over({ ...base, boxes: new Map(order.map((b) => [b, boxes.get(b)])), order }, ctx, 'X');
  aside(w, 'A', 'X', 'right');
  const g = explain(base, w.L);
  const T = { base, after: w.L, ...transitionFacts(w, base), carried: 'X', leave: g.left.map(([b, col]) => [b, col, 'press']), enter: g.entered.map(([b, col]) => [b, col, b === 'X' ? 'put' : 'self']), pass: [] };
  const r = relink(T, DEFAULT), rr = new Map([...r.layout.boxes].map(([b, x]) => [b, x.y]));
  const wrong = (y) => { const m = new Map(rr); m.set('A', y); return unexplained(base, w.L, m, T, DEFAULT, r.refs, false).length > 0; };
  named = r.ok && rr.get('A') === 0 && rr.get('X') === 0 && !unexplained(base, w.L, rr, T, DEFAULT, r.refs, false).length && wrong(1) && wrong(100);
}
const ok = tried >= N && triedStack >= NS && bad === 0 && named;
console.log((ok ? '✓ ' : '✗ ') + `${tried} random creations and carries and ${triedStack} stacks under a text pressed aside, through the primitives: RELINK takes every transition, as facts, and every moved block stands at its target or under it (${JSON.stringify(fails)}); ${skip} draws with no valid state`);
console.log('  where RELINK\'s rows differ from the phases\', by what GAP decided (reported, RELINK\'s rows being the result): ' + JSON.stringify(report));
const teeth = caught >= injected / 10;
console.log((teeth ? '✓ ' : '✗ ') + `the property has teeth: with the facts dropped (only the carried block held), ${caught} of ${injected} transitions leave a moved block where nothing explains it (a tenth at least)`);
console.log((named ? '✓ ' : '✗ ') + 'a block pressed into a free column by a new one stays at its reference, 0; put at 1 or 100 instead, nothing explains it');
for (const f of firsts) console.log('  first failure: ' + JSON.stringify(f).slice(0, 1200));
for (const f of others) console.log('  reported, other: ' + JSON.stringify(f).slice(0, 600));
process.exit(ok && teeth ? 0 : 1);
