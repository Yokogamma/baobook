// Node: SETTLE over whole gestures (public/layout/settle.js and through.js; LAYOUT-ENGINE-PLAN §5.2, step 2b; the architecture review of
// 0a262d7). Random small sheets of elastic texts and set widths, under the default rules or random switches, each given a history of four
// gestures: a gesture is a carry of two to six moves in any direction, sideways too, the hold set at any move, `frow` anywhere in the target
// row, «away» kept as DRAG.B1 has it and «home» as DRAG.A4 has it, dropped where it ends; between gestures a size, a width or a deletion.
// What must hold after every move:
//   - SETTLE never fails (a refusal is allowed, §5.5) and its result is sound: INV-1 to INV-3 (gap.js `check`), INV-4, INV-5;
//   - no phase reverses two blocks in a column both keep, other than the moved block and a swap's pair, against the layout of phase 1 of
//     the same run (the trace hook): what RELINK would refuse in phase 8 is named by the phase that did it;
//   - the memory (§5.1b, §6.D): a neighbour letting the block through is in the result, shares a column with the moved block, stands right
//     against its leading edge on the side the memory gives, at the row the memory gives, and is `pressed`;
//   - a sheet comes to rest under carries of a block to where it stands (a fixpoint within 8); a gesture that comes back to its start
//     cell with no swap gives what a carry there with no memory gives: the memory leaves no trace; the pointer held still (the same
//     target again from the result's start and memory) changes nothing; «the same» counts the canonical rows and the stacks with their
//     owners and lends, not the geometry only.
// Seeded: node tests/layoutgestures.mjs [seed] [N]
import { settle, emptyMemory } from '../public/layout/settle.js';
import { check } from '../public/layout/gap.js';
import { DECLS, resolve, DEFAULT, on } from '../public/layout/rules.js';
import { readingOrder, extent, range, sharesCol } from '../public/layout/geometry.js';
import { set, text, chars, ctxOf, sheet } from './lib/primcase.mjs';

let seed = +process.argv[2] || 7; const seed0 = seed;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const N = +process.argv[3] || 600;
const SWITCHES = ['SIZE.1', 'SIZE.2', 'SIZE.8', 'GAP.5.1', 'GAP.5.2', 'GAP.5.3', 'GAP.8', 'GAP.9', 'P-ASIDE', 'P-UP', 'P-REST', 'P-SINK', 'DRAG.A3.narrow', 'DRAG.A5', 'DRAG.B2.keep', 'DRAG.B3', 'DRAG.B5'];
const known = new Set(DECLS.map((d) => d.id)); for (const s of SWITCHES) if (!known.has(s)) throw new Error('unknown switch ' + s);

function draw() {
  const cols = int(8, 16), n = int(2, 7), bs = [], map = {};
  for (let i = 0; i < n; i++) {
    const id = 'B' + i, el = rnd() < 0.4, w = int(2, 6), col = int(0, cols - w), h = el ? 1 : int(1, 3);
    let y = int(0, 8);
    for (const o of bs) if (o.col < col + w && col < o.col + o.w && o.y < y + h && y < o.y + o.h) y = o.y + o.h + int(0, 1);
    for (const o of bs) if (o.col < col + w && col < o.col + o.w && o.y < y + h && y < o.y + o.h) return null;
    if (el) { map[id] = { text: chars((w - 1) * int(1, 6)) }; bs.push(text(id, col, y, w, 1)); } else { map[id] = { text: 'x' }; bs.push(set(id, col, y, w, h)); }
  }
  let rules = DEFAULT, off = [];
  if (rnd() < 0.5) { const o = {}; for (const s of SWITCHES) if (rnd() < 0.12) o[s] = false; try { rules = resolve(o); off = Object.keys(o); } catch { return null; } }
  let L; try { L = sheet(cols, bs); } catch { return null; }
  return { cols, bs, map, rules, off, L };
}

const snap = (L) => [...L.boxes.values()].map((b) => [b.id, b.col, b.y, b.w, b.h]);
// the same layout: every block's place, size and canonical row, and its stacks with their owners and lends (the memory of gaps, not the
// geometry only; the independent review of 07d2a7f)
const memoryOf = (b) => JSON.stringify([b.col, b.y, b.w, b.h, b.t ?? 0, b.yc ?? b.y, b.above || []]);
const same = (A, B) => A.boxes.size === B.boxes.size && [...A.boxes].every(([id, a]) => { const b = B.boxes.get(id); return b && memoryOf(a) === memoryOf(b); });
function sound(L) {
  const errs = check(L);
  const ro = readingOrder(L.boxes.values());
  if (!L.order.every((id, i) => id === ro[i])) errs.push('not in reading order');
  for (const b of L.boxes.values()) { const r = range(b, L.cols); if (b.col < r.colMin || b.col > r.colMax || b.y < r.yMin) errs.push(b.id + ' outside its container'); }
  return errs;
}
/** Two blocks that both cover a column in `ref` and in `L`, one wholly above the other in `ref` and wholly under it in `L` (overlaps are
 *  left to the phases after), neither in `skip`: the order RELINK keeps in a column among the blocks that stay in it. In a column a block
 *  came into (pressed aside, narrowed), its row is RELINK's by the landing law, not the phases' prediction (LAYOUT-ENGINE-PLAN §5.2). */
function reversed(ref, L, skip) {
  const ids = L.order.filter((id) => ref.boxes.has(id) && !skip.has(id));
  const kept = (a, b) => { const p = extent(ref.boxes.get(a)), q = extent(ref.boxes.get(b)), s = extent(L.boxes.get(a)), t = extent(L.boxes.get(b));
    return Math.max(p.c0, q.c0, s.c0, t.c0) <= Math.min(p.c1, q.c1, s.c1, t.c1); };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j]; if (!kept(a, b)) continue;
    const p = extent(ref.boxes.get(a)), q = extent(ref.boxes.get(b)), s = extent(L.boxes.get(a)), t = extent(L.boxes.get(b));
    if ((p.r1 < q.r0 && t.r1 < s.r0) || (q.r1 < p.r0 && s.r1 < t.r0)) return a + '/' + b;
  }
  return null;
}
/** The memory's neighbour against the moved block (§5.1b): null, or what is wrong. */
function memoryWrong(r, g) {
  const th = r.memory.through; if (!th) return null;
  const N0 = r.layout.boxes.get(th.id), X = r.layout.boxes.get(g);
  if (!N0) return 'the held neighbour is not in the result';
  if (!X) return 'the moved block is not in the result';
  if (!sharesCol(N0, X)) return 'the held neighbour shares no column with the moved block';
  const n = extent(N0), x = extent(X);
  if (th.side === 'below' ? x.r1 + 1 !== n.r0 : n.r1 + 1 !== x.r0) return 'the moved block is not against its held neighbour';
  if (n.r0 !== th.row) return 'the held neighbour is not at the row the memory gives';
  if (r.pressed !== th.id) return 'the held neighbour is not pressed';
  return null;
}

const fails = {}, firsts = [], stat = { sheets: 0, gestures: 0, moves: 0, refused: 0, holds: 0, swaps: 0, fixpoints: 0, homes: 0, still: 0, others: 0 };
const inc = (m, k) => (m[k] = (m[k] || 0) + 1);

for (let k = 0; k < N * 4 && stat.sheets < N; k++) {
  const d = draw(); if (!d) continue;
  stat.sheets++;
  const ctx = ctxOf(d.map, d.rules), hist = [];
  const fail = (why, extra = {}) => {
    const w = String(why).replace(/B\d+/g, '·').slice(0, 100); inc(fails, w);
    if (firsts.length < 4 && fails[w] === 1) firsts.push({ k, seed0, cols: d.cols, off: d.off, init: d.bs.map((b) => [b.id, b.col, b.y, b.w, b.h, b.cw == null ? 'el' : 'set']), lens: Object.fromEntries(Object.entries(d.map).map(([i, m]) => [i, m.text.length])), hist, why, ...extra });
  };
  // the sheet at rest: its first block carried to where it stands, again and again until two carries in a row give the same layout (SIZE.8
  // runs RESTPASSES passes in each, so a long text may take more than one); a sheet that does not come to rest so is a cycle
  let L = d.L;
  {
    const id = L.order[0]; let rested = false;
    for (let t = 0; t < 8 && !rested; t++) {
      const b = L.boxes.get(id), r = settle(L, { type: 'carry', box: null, id, at: { col: b.col, y: b.y, frow: b.y, w: b.w }, away: false }, emptyMemory(), ctx);
      if (!r.ok) break;
      rested = same(r.layout, L); L = r.layout;
    }
    stat.fixpoints++;
    if (!rested) { fail('a carry to where the block stands does not come to rest in 8 carries', { at: snap(L) }); continue; }
  }
  let dead = false;
  for (let gi = 0; gi < 4 && !dead; gi++) {
    const ids = [...L.boxes.keys()]; if (!ids.length) break;
    if (rnd() < 0.75) {   // a gesture
      const id = ids[int(0, ids.length - 1)], b = L.boxes.get(id), home = { col: b.col, y: b.y };
      let st = L, mem = emptyMemory(), col = b.col, y = b.y, away = false, last = null, swapped = false, held = false;
      stat.gestures++; hist.push(['gesture', id]);
      for (let m = 0, nm = int(2, 6); m < nm && !dead; m++) {
        const r = rnd();
        if (r < 0.25 || r >= 0.85) col = Math.max(0, Math.min(d.cols - b.w, col + int(-3, 3)));
        if (r >= 0.25) y = Math.max(0, y + int(-3, 3));
        if (m === nm - 1 && rnd() < 0.15) { col = home.col; y = home.y; }   // back to where it was taken from
        if (col === home.col && y === home.y) {   // DRAG.A4: «home» shows the start of the carry and clears the memory
          hist.push(['home']);
          // and SETTLE's result there is the one with no memory: what the carry met on its way leaves no trace, when nothing was swapped, the
          // block keeps its width (DRAG.A5; off, its rest width there may meet a block, judged by the last move) and a held neighbour is
          // released there (towards it, the block stays pinned, and DRAG.A4 shows the start anyway)
          const th = mem.through, towards = th && (th.side === 'below' ? home.y >= th.at.y : home.y <= th.at.y);
          if (!swapped && on(d.rules, 'DRAG.A5') && !towards) {
            const hc = { type: 'carry', box: null, id, at: { ...home, frow: home.y, w: b.w }, away: false };
            const rh = settle(st, hc, mem, ctx), r0 = settle(L, hc, emptyMemory(), ctx); stat.homes++;
            if (rh.ok !== r0.ok || (rh.ok && !same(rh.layout, r0.layout))) { fail('back at its start cell, the carry\'s memory leaves a trace' + (held ? ' (after a hold)' : ''), { got: rh.ok ? snap(rh.layout) : rh, want: r0.ok ? snap(r0.layout) : r0 }); dead = true; break; }
          }
          st = L; mem = emptyMemory(); away = false; last = null; swapped = false; held = false; continue;
        }
        // DRAG.B1: away once the card shares no column with its place in start; back only when it shares a column and a row with it
        const place = st.boxes.get(id), card = { ...place, col, y };
        if (!away && !sharesCol(card, place)) away = true;
        else if (away && sharesCol(card, place) && extent(card).r0 <= extent(place).r1 && extent(place).r0 <= extent(card).r1) away = false;
        const hold = rnd() < 0.3, frow = y + [0, 0, 0.3, 0.5, 0.8][int(0, 4)];
        const c = { type: 'carry', box: null, id, at: { col, y, frow, w: b.w }, away, through: hold ? 'hold' : undefined };
        hist.push([col, y, frow, away ? 'away' : '', hold ? 'hold' : '']);
        // the order of every phase, against phase 1 of the same run
        let ref = null, bad = null; const skip0 = new Set([id]);
        const trace = (name, W, info) => {
          if (bad) return;
          if (name === '1') { ref = W; return; }
          const skip = info && info.swap ? new Set([id, ...info.swap]) : skip0, rv = ref && reversed(ref, W, skip);
          if (rv) bad = 'phase ' + name + ' reverses two blocks';
        };
        const res = settle(st, c, mem, ctx, { trace }); stat.moves++;
        if (bad) { fail(bad); dead = true; break; }
        if (!res.ok) { if (res.why === 'refused') { stat.refused++; continue; } fail((res.errors || ['failed'])[0]); dead = true; break; }
        const e = sound(res.layout); if (e.length) { fail('unsound: ' + e[0]); dead = true; break; }
        const mw = memoryWrong(res, id); if (mw) { fail(mw, { memory: res.memory.through, got: snap(res.layout) }); dead = true; break; }
        if (res.start !== st) { stat.swaps++; swapped = true; }
        if (res.memory.through) { stat.holds++; held = true; }
        // the pointer held still: the same target again from the result's start and memory changes nothing, no swap back and forth
        if (rnd() < 0.3) {
          const again = settle(res.start, { ...c, through: undefined }, res.memory, ctx); stat.still++;
          if (!again.ok || again.start !== res.start || !same(again.layout, res.layout) || (again.memory.through?.id ?? null) !== (res.memory.through?.id ?? null)) { fail('the pointer held still changes the layout', { memory: res.memory.through, got: again.ok ? snap(again.layout) : again, was: snap(res.layout) }); dead = true; break; }
        }
        st = res.start; mem = res.memory; last = res;
      }
      if (!dead && last) L = last.layout;   // the drop
    } else {   // a size, a width or a deletion
      const r0 = rnd(); let c = null;
      if (r0 < 0.4) { const el = ids.filter((i) => L.boxes.get(i).cw == null); if (el.length) { const i = el[int(0, el.length - 1)]; d.map[i] = { text: chars(int(1, 40)) }; c = { type: 'size', box: null, id: i }; hist.push(['size', i, d.map[i].text.length]); } }
      else if (r0 < 0.7) { const sw = ids.filter((i) => L.boxes.get(i).cw != null); if (sw.length) { const i = sw[int(0, sw.length - 1)]; c = { type: 'width', box: null, id: i, cw: Math.max(1, L.boxes.get(i).cw + int(-2, 4)), side: 'right' }; hist.push(['width', i, c.cw]); } }
      else { const i = ids[int(0, ids.length - 1)]; c = { type: 'remove', box: null, id: i }; hist.push(['remove', i]); }
      if (!c) continue;
      stat.others++;
      const res = settle(L, c, emptyMemory(), ctx);
      if (!res.ok) { if (res.why !== 'refused') { fail((res.errors || ['failed'])[0]); dead = true; } continue; }
      const e = sound(res.layout); if (e.length) { fail('unsound: ' + e[0]); dead = true; break; }
      L = res.layout;
    }
  }
}

const bad = Object.values(fails).reduce((s, n) => s + n, 0), ok = stat.sheets >= N && bad === 0;
console.log((ok ? '✓ ' : '✗ ') + `${stat.sheets} sheets, ${stat.gestures} gestures of ${stat.moves} moves (${stat.holds} with a neighbour held, ${stat.swaps} swaps, ${stat.refused} refused) and ${stat.others} other changes: SETTLE never failed, every result sound, no phase reversed two blocks, the memory right against its neighbour; ${stat.fixpoints} fixpoints, ${stat.homes} gestures back home, ${stat.still} moves held still ${JSON.stringify(fails)}`);
for (const f of firsts) console.log('  first failure: ' + JSON.stringify(f).slice(0, 2000));
process.exit(ok ? 0 : 1);
