// The laws of a sequence and the probes of its consequences (docs/LAYOUT-SEAMS-PLAN.md §4.2, §4.3), as an executor of seq.mjs's
// sequences over the engine. After every command:
//   - an answer, never a throw; a lawful command is never `failed`; a command nothing may do is never accepted;
//   - L6, the inputs unchanged, accepted or not: the tree and the gesture memory the command was given;
//   - the tree it answers with valid (validate.js), and its `start` too, but for the frame of the area a swap was made in;
//   - L4, determinism: the same input again, and the same tree kept in another order, give the same answer by value;
//   - L5, `unshow(show(C)) = C` for the canonical layout C of the answer, C valid too;
//   - L7, independence: a block that shares no column and no row with the blocks the change can reach, directly or through others, in
//     the tree before or after, stands where it stood (a rest width reads the rows beside a text, a push the columns under a block),
//     its set sizes as they were; but for a text that only now comes to its rest width, told by phases 9 and 10 alone giving it that
//     very place on the tree as the command found it, and counted apart;
//   - L13, translation, on the first command after the note is opened: the same note read 40 rows lower and 80 rows lower, the same
//     command aimed as much lower, give the same places but for those rows (far from the top edge both times). That is the opened
//     state only: stacks and a gesture's memory after a history of commands are not carried lower here, which is the references' part;
//   - the probes, each on the answer and none kept: delete a block (it must succeed), narrow a set width by a cell (it must succeed) or
//     an area by its handle (accepted or refused, never failed), end every temporary height; and, sampled, two steps: narrow and then
//     delete, end the temporary heights and then delete. Every result valid.
//   - L14, reported and not failed: the answer's canonical places read again and opened give the same places (stronger than today's
//     convergence over several openings, so a difference is judged case by case).
//   - the references (S2b): L1, every transition SETTLE hands RELINK, in a command or in a sampled probe, answered alike by the lab
//     model (modelref.mjs); L3, every area's frame of every tree judged valid against the formula written apart (tests/lab/frame-ref.mjs);
//     L13 after a history, sampled: the tree with its stacks and the gesture's memory carried 40 rows lower and 80, the same answer.
// A violation is kept with its seed, the commands so far and the change; the run stops at `max` of them. L2, the reference SETTLE, has
// a domain of fresh sheets and runs on its own (tests/layoutref.mjs).

import { validate, validateContainer } from '../../../public/layout/validate.js';
import { settleTree } from '../../../public/layout/tree.js';
import { emptyMemory, rest } from '../../../public/layout/settle.js';
import { open, show, unshow } from '../../../public/layout/layout.js';
import { readingOrder, sharesCol, sharesRow, extent, isArea, SHEETW } from '../../../public/layout/geometry.js';
import { KINDS } from '../../../public/layout/kinds.js';
import { canonicalCtx } from '../../../public/layout/size.js';
import { DEFAULT, SETTINGS } from '../../../public/layout/rules.js';
import { stubMeasure } from '../measure.mjs';
import { sequences, str } from './seq.mjs';
import { compare } from './modelref.mjs';
import { framesAgainstRef } from '../../lab/frame-ref.mjs';

export const G = { readingOrder, sharesCol, extent, SHEETW };
const placeOf = (b) => [b.col, b.y, b.w, b.h];
const containers = (T) => [[null, T], ...T.areas];
const placesOf = (T) => Object.fromEntries(containers(T).flatMap(([box, L]) => [...L.boxes].map(([id, b]) => [id, [box, ...placeOf(b)]])));
/** The same tree kept in another order: every Map reversed (the reading order, `order`, is the layout's own and stays). */
function reversed(T) {
  const rev = (L) => ({ ...L, boxes: new Map([...L.boxes].reverse()) });
  return { ...rev(T), areas: new Map([...T.areas].reverse().map(([id, C]) => [id, { ...rev(C), areas: new Map() }])) };
}
/** A tree `k` rows lower on the sheet: every block of the sheet, its canonical row and the unowned rows over each stack that starts at
 *  the top; the children of an area stand where they stood in it. */
function lower(T, k) {
  if (!k) return T;
  const top = (seg) => (seg[0] && seg[0].o === null ? [{ o: null, n: seg[0].n + k }, ...seg.slice(1)] : [{ o: null, n: k }, ...seg]);
  const boxes = new Map([...T.boxes].map(([id, b]) => [id, { ...b, y: b.y + k, ...(b.yc != null ? { yc: b.yc + k } : {}),
    ...(b.above ? { above: b.above.map((t) => (t.stack.u !== null ? t : { ...t, stack: { ...t.stack, parts: [top(t.stack.parts[0]), ...t.stack.parts.slice(1)] } })) } : {}) }]));
  return { ...T, boxes };
}
/** A change aimed `k` rows lower when it aims at the sheet. */
function aimed(change, k) {
  const onSheet = ((change.box ?? null) == null || change.type === 'leave') && change.type !== 'enter';
  return change.at && onSheet ? { ...change, at: { ...change.at, y: change.at.y + k, ...(change.at.frow != null ? { frow: change.at.frow + k } : {}) } } : change;
}
/** A gesture's memory `k` rows lower, for a gesture on the sheet: the rows it keeps (LAYOUT-RULES §5.1b). */
function lowerMemory(memory, change, k) {
  if (!memory || !k || (change.box ?? null) != null) return memory;
  const t = (x) => (x ? { ...x, y: x.y + k, ...(x.frow != null ? { frow: x.frow + k } : {}) } : x);
  const th = memory.through && { ...memory.through, row: memory.through.row + k, at: t(memory.through.at), last: t(memory.through.last), ...(memory.through.line != null ? { line: memory.through.line + k } : {}) };
  return { ...memory, through: th, lastTarget: t(memory.lastTarget) };
}
/** A note read back from a canonical tree: its places and set sizes, no widths, heights or stacks. */
function reread(T) {
  const strip = (b) => { const o = { id: b.id, kind: b.kind, col: b.col, y: b.y }; for (const f of ['cw', 'ch', 'open', 'collapsed']) if (b[f] != null) o[f] = b[f]; return o; };
  const lay = (L) => { const bs = [...L.boxes.values()].map(strip); return { cols: L.cols, measure: 'canonical', boxes: new Map(bs.map((b) => [b.id, b])), order: readingOrder(bs), areas: new Map() }; };
  return { ...lay(T), areas: new Map([...T.areas].map(([id, C]) => [id, lay(C)])) };
}
/** The blocks of one container a change can reach: from `seeds`, through blocks that share a column or a row, before or after. */
function reach(before, after, seeds) {
  const ids = [...new Set([...(before ? before.boxes.keys() : []), ...(after ? after.boxes.keys() : [])])];
  const boxes = (id) => [before && before.boxes.get(id), after && after.boxes.get(id)].filter(Boolean);
  const linked = (p, q) => boxes(p).some((a) => boxes(q).some((b) => sharesCol(a, b) || sharesRow(a, b)));
  const seen = new Set(seeds.filter((id) => ids.includes(id))), queue = [...seen];
  while (queue.length) { const p = queue.pop(); for (const q of ids) if (!seen.has(q) && linked(p, q)) { seen.add(q); queue.push(q); } }
  return seen;
}

/** Run the sequences with the laws; `engine`, settleTree unless a test of the laws themselves gives one that breaks a law. @returns {{stat, by, violations:object[], counts:object, reopened:{same:number, other:number}}} */
export function runLaws({ seed = 1, notes = 200, steps = 6, max = 3, rules = DEFAULT, probes = 4, engine = settleTree, drive = null } = {}) {
  const violations = [], counts = {}, reopened = { same: 0, other: 0, first: null };
  const inc = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  let p = (seed * 2654435761) >>> 0;   // the laws' own draws, apart from the generator's stream
  const rnd = () => (p = (p * 1664525 + 1013904223) >>> 0) / 2 ** 32, sample = (xs, n) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  let cur = null, ctx = null, opened = null, lateFirst = null, canonFirst = null;
  const ctxOf = (map) => ({ rules, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) });
  const bad = (law, detail, extra = {}) => { violations.push({ law, note: cur.k, seed: cur.seed, ...extra, detail, hist: cur.hist.slice() }); };
  // L1: every transition SETTLE hands RELINK, in a command or in a probe, answered by the lab model too (modelref.mjs). An engine given
  // in the engine's place by a test of the laws takes the hooks or leaves them
  let l1 = null, l1on = true;   // l1on: off for the runs that are another law's (L13's lowered trees) and for the probes not sampled
  const hooks = { relink(T, answer) {
    if (!l1on) return;
    inc('L1: transitions RELINK was handed');
    let d; try { d = compare(T, answer); } catch (e) { d = { what: 'the comparison threw', error: String(e && e.message) }; }
    if (d && !l1) l1 = d;
  } };
  const settleSafe = (root, change, memory, c = ctx) => { try { return engine(root, change, memory, c, hooks); } catch (e) { return { threw: String(e && e.message) }; } };
  /** A violation of L1 since the last call, said with the command it came in. */
  const modelSays = (extra) => { if (!l1) return false; const d = l1; l1 = null; bad('L1: the lab model gives RELINK\'s answer', { what: d.what, model: String(d.model ?? '').slice(0, 600), engine: String(d.engine ?? d.error ?? '').slice(0, 600) }, extra); return true; };
  // every tree judged valid is judged by L3 too: each area's frame against the formula written apart (tests/lab/frame-ref.mjs)
  const valid = (law, T, c, extra) => {
    const e = validate(T, c); if (e.length) { bad(law, e.slice(0, 3), extra); return false; }
    let f; try { f = framesAgainstRef(T, c.measure); } catch (err) { f = ['the formula threw: ' + err.message]; }
    inc('L3: frames against the formula', T.areas.size);
    if (f.length) bad('L3: an area\'s frame is the formula\'s', f.slice(0, 3), { ...extra, of: law });
    return !f.length;
  };

  /** The probes of consequences on an accepted tree; nothing of them is kept. */
  function probe(T, extra) {
    const all = containers(T).flatMap(([box, L]) => [...L.boxes.values()].map((b) => [box, b]));
    for (const [box, b] of sample(all, probes)) {
      const d = settleSafe(T, { type: 'remove', box, id: b.id }, emptyMemory());
      inc('probe: delete');
      if (d.threw || !d.ok) { bad('probe: a deletion must succeed', d, { ...extra, probe: ['remove', box, b.id] }); continue; }
      valid('probe: valid after a deletion', d.layout, ctx, { ...extra, probe: ['remove', box, b.id] });
    }
    const narrowable = all.filter(([, b]) => (isArea(b) ? true : b.cw != null && b.cw > 1));
    for (const [box, b] of sample(narrowable, probes)) {
      const c = isArea(b) ? { type: 'areaSide', box: null, id: b.id, side: 'right', col: b.col, cols: b.w - 1 } : { type: 'width', box, id: b.id, cw: b.cw - 1, side: 'right' };
      const w = settleSafe(T, c, emptyMemory());
      inc(isArea(b) ? 'probe: narrow an area' : 'probe: narrow');
      if (w.threw || (!w.ok && (w.why !== 'refused' || !isArea(b)))) { bad('probe: a narrowing must succeed (an area\'s may be refused)', w, { ...extra, probe: c }); continue; }
      if (!w.ok) { inc('probe: narrow an area, refused'); continue; }
      if (isArea(b)) inc('probe: narrow an area, accepted');
      if (!valid('probe: valid after a narrowing', w.layout, ctx, { ...extra, probe: c })) continue;
      if (rnd() < 0.25 && !isArea(b)) {   // two steps: narrow, then delete
        const d = settleSafe(w.layout, { type: 'remove', box, id: b.id }, emptyMemory());
        inc('probe: narrow, then delete');
        if (d.threw || !d.ok) bad('probe: a deletion after a narrowing must succeed', d, { ...extra, probe: [c, 'remove'] });
        else valid('probe: valid after a narrowing and a deletion', d.layout, ctx, { ...extra, probe: [c, 'remove'] });
      }
    }
    // every temporary height ended: the measure showing none, and no rows given to `show`
    const calm = ctxOf(Object.fromEntries(Object.entries(cur.map).map(([id, m]) => [id, { ...m, temp: 0 }])));
    let E;
    try { E = show(unshow(T, ctx), new Map(), calm); } catch (e) { bad('probe: the temporary heights must end', String(e && e.message), extra); return; }
    inc('probe: end the temporary heights');
    if (!valid('probe: valid once the temporary heights ended', E, calm, extra)) return;
    if (rnd() < 0.25 && all.length) {   // two steps: end them, then delete
      const [box, b] = sample(all, 1)[0], d = settleSafe(E, { type: 'remove', box, id: b.id }, emptyMemory(), calm);
      inc('probe: end the temporary heights, then delete');
      if (d.threw || !d.ok) bad('probe: a deletion after the temporary heights ended must succeed', d, { ...extra, probe: ['calm', 'remove', box, b.id] });
      else valid('probe: valid after the temporary heights ended and a deletion', d.layout, calm, { ...extra, probe: ['calm', 'remove', box, b.id] });
    }
  }

  /** L13 on the first command: the note read `k` rows lower, the command aimed `k` rows lower when it aims at the sheet. */
  function lowered(k, change) {
    const n = cur.stored, boxes = [...n.boxes.values()].map((b) => ({ ...b, y: b.y + k }));
    const shifted = { ...n, boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes) };
    const o = open(shifted, ctx); if (!o.ok) return null;
    const onSheet = (change.box ?? null) == null || change.type === 'leave';
    const at = change.at && onSheet && change.type !== 'enter' ? { ...change.at, y: change.at.y + k, ...(change.at.frow != null ? { frow: change.at.frow + k } : {}) } : change.at;
    const r = settleSafe(o.shown, at ? { ...change, at } : change, emptyMemory());
    if (r.threw || !r.ok) return { ok: false, why: r.why || 'threw' };
    return { ok: true, places: Object.fromEntries(Object.entries(placesOf(r.layout)).map(([id, [box, col, y, w, h]]) => [id, [box, col, box == null ? y - k : y, w, h]])) };
  }

  const X = {
    done: () => violations.length >= max,
    memory: () => emptyMemory(),
    note(n) {
      cur = n; ctx = ctxOf(n.map);
      let o; try { o = open(n.stored, ctx); } catch (e) { bad('open must not throw', String(e && e.message)); return null; }
      if (!o.ok) { inc('notes not opened'); return null; }
      valid('valid: the note as opened, canonical', o.layout, ctx);
      valid('valid: the note as opened, shown', o.shown, ctx);
      opened = o.shown;
      return o.shown;
    },
    settle(kind, change, root, memory) {
      const negative = kind.startsWith('not: '), extra = { kind, change };
      const before = str(root), memBefore = str(memory);
      const r = settleSafe(root, change, memory);
      if (modelSays(extra)) return { stop: true };
      if (str(root) !== before || str(memory) !== memBefore) { bad('L6: the inputs unchanged', r.ok ? 'after an acceptance' : 'after ' + (r.why || 'a throw'), extra); return { stop: true }; }
      if (r.threw) { bad('an answer, never a throw', r.threw, extra); return { stop: true }; }
      if (!r.ok) {
        if (r.why === 'failed' && !negative) { bad('a lawful command is never failed', r.errors, extra); return { stop: true }; }
        return r;
      }
      if (negative) { bad('a command nothing may do is not accepted', r.layout ? placesOf(r.layout) : null, extra); return { stop: true }; }
      if (!valid('valid: the answer', r.layout, ctx, extra)) return { stop: true };
      // `start`, the tree the next move of a gesture is given: a valid tree, but for one thing. After a swap inside an area its child
      // container is the swap's and its sheet the gesture's start, so that area's frame there is not round those children (the next
      // move settles the frame again from them; §6.2 decides one tree). Only that is let through: a carry in an area, a `start` whose
      // children of that area are not the ones the move was given, and the error that area's frame; anything else of `start` fails
      {
        const e = validate(r.start, ctx), box = change.box ?? null, isFrame = (x) => x.startsWith(`${box}: a canonical frame of `) || x.startsWith(`${box}: a frame of `);
        const inArea = change.type === 'carry' && box != null && r.start.areas.has(box) && root.areas.has(box);
        // a swap, told by what it is (LAYOUT-RULES §5.1b): the sheet of `start` the one the move was given, and in the area the
        // carried block and the neighbour the gesture holds on the other side of each other than they were
        const sideOf = (C, n) => { const g = C.boxes.get(change.id), o = C.boxes.get(n); return g && o && g.id !== o.id ? Math.sign(g.y - o.y) : 0; };
        const held = [memory.through?.id, r.memory?.through?.id].filter((n) => n != null);
        const swapped = inArea && str(r.start.areas.get(box)) !== str(root.areas.get(box)) && str([...r.start.boxes]) === str([...root.boxes])
          && held.some((n) => sideOf(root.areas.get(box), n) * sideOf(r.start.areas.get(box), n) < 0);
        // a later move of the same gesture is given that `start` and answers with it again: the same error, word for word, is its own
        const given = inArea && !swapped ? validate(root, ctx).filter(isFrame) : [];
        const frame = (x) => inArea && isFrame(x) && (swapped || given.includes(x));
        const other = e.filter((x) => !frame(x));
        if (other.length) { bad('valid: the answer\'s start', other.slice(0, 3), extra); return { stop: true }; }
        if (e.length) inc('start: an area\'s frame not round its children (after a swap inside it)');
      }
      // L4: the same input again; the same tree kept in another order
      if (rnd() < 0.3) {
        inc('L4: again'); const again = settleSafe(root, change, memory);
        if (str(again) !== str(r)) { bad('L4: the same input gives the same answer', null, extra); return { stop: true }; }
        inc('L4: another order'); const other = settleSafe(reversed(root), change, memory);
        if (other.threw || !other.ok || str(other.layout) !== str(r.layout) || str(other.memory) !== str(r.memory)) { bad('L4: the order the tree is kept in changes nothing', other.ok ? null : other, extra); return { stop: true }; }
      }
      // L5: unshow(show(C)) = C
      let C; try { C = unshow(r.layout, ctx); } catch (e) { bad('L5: unshow must not throw', String(e && e.message), extra); return { stop: true }; }
      if (!valid('valid: the answer\'s canonical layout', C, ctx, extra)) return { stop: true };
      if (rnd() < 0.5) {
        inc('L5');
        let back; try { back = unshow(show(C, new Map(), ctx), ctx); } catch (e) { bad('L5: show must not throw', String(e && e.message), extra); return { stop: true }; }
        if (str(back) !== str(C)) { bad('L5: unshow(show(C)) = C', null, extra); return { stop: true }; }
      }
      // L7: a block out of the change's reach stands where it stood
      {
        const box = change.box ?? null, type = change.type;
        const seedsOf = (name) => (type === 'ungroup' ? (name == null ? [change.id, ...(root.areas.get(change.id)?.boxes.keys() || [])] : [])
          : name == null ? [...(box == null || type === 'leave' ? [change.id] : []), ...[box, change.to].filter((x) => x != null)]
            : name === box || name === change.to ? (type === 'areaSide' ? null : [change.id]) : name === change.id && type === 'areaSide' ? null : []);
        const names = new Set([null, ...root.areas.keys(), ...r.layout.areas.keys()]);
        for (const name of names) {
          const seeds = seedsOf(name); if (seeds == null) continue;   // an area's side handle reaches every child
          const B = name == null ? root : root.areas.get(name), Af = name == null ? r.layout : r.layout.areas.get(name);
          if (!B || !Af) continue;
          const can = reach(B, Af, seeds), out = [...B.boxes.keys()].filter((id) => !can.has(id) && Af.boxes.has(id));
          inc('L7: blocks out of reach', out.length); if (out.length) inc('L7: commands with a block out of reach');
          const same = (x, y) => str(placeOf(x)) === str(placeOf(y)) && str([x.cw ?? null, x.ch ?? null]) === str([y.cw ?? null, y.ch ?? null]);
          const off = out.filter((id) => !same(B.boxes.get(id), Af.boxes.get(id)));
          if (!off.length) continue;
          // One thing may move a block out of reach: phase 9 rests every elastic block of the container at every change, so a text
          // whose rest width SIZE.8's passes had not reached after the command before comes to it now (found here: seed 3, note 15,
          // a deletion far away widens a text set elastic by the command before; for the owner: whether a container at rest must be
          // at its rest widths before the next action). That is told by what it is, not by the difference: phases 9 and 10 alone
          // (`rest`, the engine's own and not the one under test) on the container as the command found it must give each block out of
          // reach the very place it has now, its set sizes as they were. Anything else is the violation.
          // An undo's SETTLE runs on the canonical layout (G23), so there the same is asked of the canonical trees: a text with
          // temporary rows rests by its canonical rows, which may have no neighbour beside them (found here: seed 4, note 21); measured
          // as the undo measures, with no temporary row (size.js `canonicalCtx`)
          const was = (id) => placeOf(B.boxes.get(id)), is = (id) => placeOf(Af.boxes.get(id)), pick = (T) => (name == null ? T : T.areas.get(name));
          let R, got;
          if (change.canonical) { let cb, ca; try { cb = pick(unshow(root, ctx)); ca = pick(unshow(r.layout, ctx)); } catch { cb = null; } R = cb && ca ? rest(cb, canonicalCtx(ctx)) : { ok: false }; got = (id) => ca.boxes.get(id); }
          else { R = rest(B, ctx); got = (id) => Af.boxes.get(id); }
          const sizes = (x) => str([x.cw ?? null, x.ch ?? null]);
          const wrong = off.find((id) => !R.ok || !R.layout.boxes.has(id) || !same(R.layout.boxes.get(id), got(id)) || sizes(B.boxes.get(id)) !== sizes(Af.boxes.get(id)));
          if (wrong) { bad('L7: a block out of the change\'s reach stands where it stood', { container: name, block: wrong, was: was(wrong), is: is(wrong), rest: R.ok ? R.layout.boxes.has(wrong) && placeOf(R.layout.boxes.get(wrong)) : R }, extra); return { stop: true }; }
          if (change.canonical) { inc('L7: a text out of reach rested by its canonical rows, under an undo', off.length); canonFirst = canonFirst || { note: cur.k, seed: cur.seed, kind, change, block: off[0], was: was(off[0]), is: is(off[0]) }; continue; }
          inc('L7: a text out of reach rested late', off.length);
          lateFirst = lateFirst || { note: cur.k, seed: cur.seed, kind, change, block: off[0], was: was(off[0]), is: is(off[0]) };
        }
      }
      // L13: translation, the first command on the note as opened
      if (root === opened && !change.canonical) {
        const a = lowered(40, change), b = lowered(80, change);
        if (a && b) {
          inc('L13');
          if (str(a) !== str(b)) { bad('L13: the same change far from the top gives the same places, 40 rows lower or 80', { at40: a, at80: b }, extra); return { stop: true }; }
        }
      }
      // L13 after a history: the tree the command was given, stacks and all, and the gesture's memory carried 40 rows lower and 80,
      // the command aimed as much lower: the two answers are each other's translation, the tree with its stacks and the memory
      if (root !== opened && !change.canonical && rnd() < 0.35) {
        l1on = false;
        const a = settleSafe(lower(root, 40), aimed(change, 40), lowerMemory(memory, change, 40)), b = settleSafe(lower(root, 80), aimed(change, 80), lowerMemory(memory, change, 80));
        l1on = true;
        inc('L13: after a history');
        const far = (x, k) => (x.threw || !x.ok ? { ok: false, why: x.why || 'threw' } : { ok: true, layout: str(lower(x.layout, 80 - k)), memory: str(lowerMemory(x.memory, change, 80 - k)) });
        const fa = far(a, 40), fb = far(b, 80);
        if (str(fa) !== str(fb)) { bad('L13: after a history, the same change 40 rows lower or 80 gives the same answer', fa.ok && fb.ok ? { layouts: fa.layout === fb.layout, memories: fa.memory === fb.memory, at40: placesOf(a.layout), at80: placesOf(b.layout) } : { at40: fa.ok || fa, at80: fb.ok || fb }, extra); return { stop: true }; }
      }
      // what the quotas count (§4.5): a transition under a temporary height, one that swapped, one that changed a width
      // of the commands that changed the tree, the denominator of every share
      if (str(r.layout) !== str(root)) {
        inc('moved');
        if (containers(root).some(([, L]) => [...L.boxes.values()].some((b) => (b.t || 0) > 0))) inc('moved under a temporary height');
        if (change.type === 'carry' && r.start !== root && str(r.start) !== str(root)) inc('moved with a swap');
        { const was = placesOf(root), is = placesOf(r.layout); if (Object.keys(was).some((id) => is[id] && is[id][3] !== was[id][3])) inc('moved with a width changed'); }
      }
      l1on = rnd() < 0.2;   // the model answers the probes of one command in five
      probe(r.layout, extra);
      l1on = true;
      if (modelSays({ ...extra, in: 'a probe' })) return { stop: true };
      if (violations.length >= max) return { stop: true };
      // L14, reported: what the engine wrote opens to the same places
      if (rnd() < 0.3) {
        let o; try { o = open(reread(C), ctx); } catch { o = { ok: false }; }
        if (o.ok && str(placesOf(o.layout)) === str(placesOf(C))) reopened.same++;
        else { reopened.other++; reopened.first = reopened.first || { note: cur.k, seed: cur.seed, kind, change, ok: !!o.ok }; }
      }
      return r;
    },
    show(kind, tree, temp) {
      let C, S;
      try { C = unshow(tree, ctx); S = show(C, temp, ctx); } catch (e) { bad('show must not throw', String(e && e.message), { kind }); return { stop: true }; }
      if (!valid('valid: shown again', S, ctx, { kind, temp: [...temp] })) return { stop: true };
      let back; try { back = unshow(S, ctx); } catch (e) { bad('L5: unshow must not throw', String(e && e.message), { kind }); return { stop: true }; }
      inc('L9');
      if (str(back) !== str(C)) { bad('L9: a temporary height that starts or ends changes no canonical row and no stack', null, { kind, temp: [...temp] }); return { stop: true }; }
      return { layout: S };
    },
  };
  // `drive`, a sequence written by hand in the generator's place, for a named case: it calls the executor as seq.mjs does
  if (drive) { drive(X); return { violations, counts, lateFirst, canonFirst }; }
  const { stat, by, types } = sequences(G, X, { seed, notes, steps });
  return { stat, by, types, violations, counts, reopened, lateFirst, canonFirst };
}
