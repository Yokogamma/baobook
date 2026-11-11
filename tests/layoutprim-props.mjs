// Node: step 2a's pieces together, as a property (LAYOUT-ENGINE-PLAN §5.2), before settle.js exists: on random small sheets of elastic
// texts and set widths, a block created or carried (sideways by a column at most), the carry's judge, P-ASIDE for every block met from
// the side (by its side, P-UP or P-DOWN, when it has no room), P-UP for the blocks judged above, P-DOWN for those judged below, P-SEP for
// what still hits, under GAP.9 and GAP.5.2 on and off; then the transition `transitionSteps` cuts, with the columns from the geometry,
// through transition.js `checkTransition` and gap.js `relink`, and RELINK's rows compared with the working state's. A difference is
// explained only as GAP decided it: a block that came into a column by itself put lower by RELINK at its reference, with the blocks under
// it by no more rows (1b's landing law); with GAP.9 off a block under one that left a column it keeps rising at RELINK, as after a
// deletion, or one under it by no more rows (the phases never move a block up); each differing block is explained on its own. A refused
// transition is excused only by sides that contradict each other (a block judged below over one judged above, which P-DOWN then drags
// past the moved block), a question for the pipeline of step 2b, when the refusal names one of them. Anything else fails, with the first
// case printed. The property checks itself: one more row down given to a block nothing lets RELINK put lower must fail it. Seeded.
import { set, text, chars, ctxOf, sheet, over, rows, hitting } from './lib/primcase.mjs';
import { aside, down, up, sep, transitionSteps, phase } from '../public/layout/primitives.js';
import { judgeCarry } from '../public/layout/changes.js';
import { relink } from '../public/layout/gap.js';
import { checkTransition, explain } from '../public/layout/transition.js';
import { DEFAULT, resolve } from '../public/layout/rules.js';
import { readingOrder, hits, sharesCol } from '../public/layout/geometry.js';
// a seed, and how many cases: node tests/layoutprim-props.mjs [seed] [N]
let seed = +process.argv[2] || 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const N = +process.argv[3] || 3000;
let tried = 0, bad = 0, skip = 0, injected = 0, caught = 0; const fails = {}, firsts = [], inc = (k) => (fails[k] = (fails[k] || 0) + 1);
let current = null;
const fail = (why) => { bad++; inc(why.replace(/[A-Z]\d?/g, '·').slice(0, 60)); if (firsts.length < 3) firsts.push({ ...current, why }); };
const covers = (b, c) => b.col + 1 <= c && c <= b.col + b.w - 1;
/** Why a difference between RELINK's rows and the working state's is not one GAP decided, block by block, from the top; or null.
 *  Lower: a block that came into a column by itself, put at its reference (1b's landing law), or a block under one so put, by no more rows.
 *  Higher: only with GAP.9 off, a block under one that left a column it keeps (it rises as after a deletion), or under one that rose, by no
 *  more rows. */
function unexplained(base, after, rr, T, rules) {
  const selfIn = new Set(T.enter.filter(([, , h]) => h === 'self').map(([b]) => b)), low = new Map(), high = new Map();
  const off9 = rules !== DEFAULT && rules['GAP.9'] === false;
  for (const b of after.order) {
    const B = after.boxes.get(b), dy = rr.get(b) - B.y; if (!dy) continue;
    const above = (a) => { const A = after.boxes.get(a); return a !== b && sharesCol(A, B) && A.y < B.y; };
    if (dy > 0) {
      if (selfIn.has(b) || [...low].some(([a, da]) => above(a) && dy <= da)) { low.set(b, dy); continue; }
      return `${b} is ${dy} rows lower in RELINK, with no block come in by itself over it`;
    }
    const B0 = base.boxes.get(b);
    const left = B0 && [...base.boxes.values()].some((X0) => { if (X0.id === b || X0.y + X0.h > B0.y) return false;
      const XA = after.boxes.get(X0.id); for (let c = Math.max(X0.col + 1, B0.col + 1); c <= Math.min(X0.col + X0.w - 1, B0.col + B0.w - 1); c++) if (covers(B, c) && (!XA || !covers(XA, c))) return true; return false; });
    if (off9 && (left || [...high].some(([a, da]) => above(a) && -dy <= da))) { high.set(b, -dy); continue; }
    return `${b} is ${-dy} rows higher in RELINK${off9 ? ', with no block over it that left a column it keeps' : ', with GAP.9 on'}`;
  }
  if (low.size) inc('lower at its reference (landing law)'); if (high.size) inc('GAP.9 off: rises at RELINK');
  return null;
}
for (let k = 0; k < N * 3 && tried < N; k++) {
  const cols = int(10, 16), map = {}, bs = [], n = int(3, 7);
  for (let i = 0; i < n; i++) {
    const id = 'B' + i, el = rnd() < 0.4; let w, h, b;
    if (el) { const len = int(6, 60); map[id] = { text: chars(len) }; const nat = Math.max(1, Math.ceil(len / 3)); w = Math.min(nat, 26, cols - 2) + 1; h = Math.ceil(len / ((w - 1) * 3)); }
    else { w = int(2, 6); h = int(1, 3); }
    const col = int(0, cols - w); let y = 0;
    for (const o of bs) if (o.col + 1 < col + w && col + 1 < o.col + o.w) y = Math.max(y, o.y + o.h + int(0, 2));
    bs.push(el ? text(id, col, y, w, h) : set(id, col, y, w, h));
  }
  const rules = rnd() < 0.3 ? resolve({ 'GAP.9': false }) : rnd() < 0.2 ? resolve({ 'GAP.5.2': false }) : DEFAULT;
  const ctx = ctxOf(map, rules);
  let base; try { base = sheet(cols, bs); } catch (e) { skip++; continue; }
  // the moved block: a new one (away), or one of base carried within its columns
  const create = rnd() < 0.5; let X, w;
  if (create) {
    const xw = int(2, 5), xh = int(1, 3); X = set('X', int(0, cols - xw), int(0, 8), xw, xh);
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
  tried++; current = { k, create };
  const g = explain(base, w.L), ts = transitionSteps(w, base);
  const T = { base, after: w.L, steps: ts.steps, start: ts.start, carried: id,
    leave: g.left.map(([b, col]) => [b, col, b === id ? 'narrow' : 'press']), enter: g.entered.map(([b, col]) => [b, col, b === id ? 'put' : 'self']), pass: [] };
  const errs = checkTransition(T); let r; try { r = relink(T, rules); } catch (e) { r = { ok: false, errors: [e.message] }; }
  const rr = r.ok ? new Map([...r.layout.boxes].map(([b, x]) => [b, x.y])) : null;
  // contradictory sides (step 2b's question): a block judged above the moved block ends under it, or one judged below ends over it, in a
  // column both share; it excuses only a refused transition that names one of them
  const X2 = w.L.boxes.get(id), contra = [...j.side].filter(([b, s2]) => { const B2 = w.L.boxes.get(b); if (!B2 || j.met.has(b)) return false;
    const shares = B2.col + 1 < X2.col + X2.w && X2.col + 1 < B2.col + B2.w; return shares && (s2 === 'above' ? B2.y > X2.y : B2.y < X2.y); }).map(([b]) => b);
  if (errs.length && contra.some((b) => errs.some((e) => e.includes(b)))) { inc('contradictory sides (2b)'); continue; }
  if (errs.length || !r.ok) { fail(errs[0] || r.errors[0]); continue; }
  const why = unexplained(base, w.L, rr, T, rules);
  if (why) { fail(why); continue; }
  // the property's own check (the independent review of 421412d): one more row down for a block nothing lets RELINK put lower must fail it
  if (injected < 200) {
    const selfIn = new Set(T.enter.filter(([, , h]) => h === 'self').map(([b]) => b));
    const victim = [...w.L.order].reverse().find((b) => !selfIn.has(b) && rr.get(b) === w.L.boxes.get(b).y && ![...selfIn].some((s2) => sharesCol(w.L.boxes.get(s2), w.L.boxes.get(b))));
    if (victim) { injected++; const rr2 = new Map(rr); rr2.set(victim, rr.get(victim) + 1); if (unexplained(base, w.L, rr2, T, rules)) caught++; }
  }
}
const ok = tried >= N && bad === 0;
console.log((ok ? '✓ ' : '✗ ') + `${tried} random creations and carries through the primitives, every transition taken by checkTransition and relink with the rows the phases left, every block that differs explained as GAP decided (${JSON.stringify(fails)}); ${skip} draws with no valid state`);
console.log((caught === injected && injected > 0 ? '✓ ' : '✗ ') + `the property catches a row RELINK did not give: ${caught} of ${injected} results given one more row down for a block nothing lets RELINK put lower`);
for (const f of firsts) console.log('  first unexplained: ' + JSON.stringify(f).slice(0, 1200));
process.exit(ok && caught === injected && injected > 0 ? 0 : 1);
