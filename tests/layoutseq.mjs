// Node: sequences of commands with the laws and the probes of their consequences (docs/LAYOUT-SEAMS-PLAN.md §4.2–§4.5), over the engine
// alone: tests/lib/layout/seq.mjs draws the notes and the commands, tests/lib/layout/laws.mjs runs each and judges it. What must hold
// after every command is in laws.mjs; here are the run, the quotas that make it mean something, and the checks that the laws can fail.
//
// The quotas count accepted transitions that changed the tree, in the numerator as in the denominator (a command accepted with the
// tree as it was is no hold, no swap and no change under a temporary height), and the negative attempts and the probes apart, each with
// its own denominator; a run below one fails, so that a law passing over nothing is seen. The numbers were set from what the generator
// draws, as a floor well under it; the plan's first numbers are in §4.5. Each law and each quota is shown to fail on an engine made
// to break it.
//
//   node tests/layoutseq.mjs [seed] [notes]

import { runLaws } from './lib/layout/laws.mjs';
import { KINDS_NOT } from './lib/layout/seq.mjs';
import { settleTree } from '../public/layout/tree.js';
import { sharesCol, sharesRow, readingOrder } from '../public/layout/geometry.js';
import { emptyMemory, rest } from '../public/layout/settle.js';
import { unshow } from '../public/layout/layout.js';
import { canonicalCtx } from '../public/layout/size.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { stubMeasure } from './lib/measure.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got, null, 1).slice(0, 5000))); };
const show = (v) => v && { ...v, hist: v.hist.slice(-8) };

const seed = +process.argv[2] || 7, notes = +process.argv[3] || 260;
const r = runLaws({ seed, notes });
const c = r.counts;

ok(`${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${r.stat.moved} of them changing the tree, ${r.stat.refused} refused, ${r.stat.failed} failed, each of those a command nothing may do): every law holds, every probe gives a valid tree`, r.violations.length === 0, show(r.violations[0]));
console.log('  probes: ' + Object.entries(c).filter(([k]) => k.startsWith('probe')).map(([k, v]) => `${k.slice(7)} ${v}`).join(', '));
console.log(`  laws run: L4 ${c['L4: again'] || 0} again and ${c['L4: another order'] || 0} in another order, L5 ${c.L5 || 0}, L7 ${c['L7: blocks out of reach'] || 0} blocks out of reach in ${c['L7: commands with a block out of reach'] || 0} commands, L9 ${c.L9 || 0}, L13 ${c.L13 || 0}`);

/** The quotas of one run: [what, whether it holds, what was counted]. Every share is of the commands that changed the tree, and counts
 *  only those. */
function quotas(r) {
  const c = r.counts, moved = r.stat.moved, pc = (n) => +(100 * (n || 0) / (moved || 1)).toFixed(1), by = (k) => r.by[k]?.moved || 0;
  const types = r.types, share = (t, w) => pc(types[t]?.[w]), all = (t) => pc((types[t]?.sheet || 0) + (types[t]?.area || 0));
  const TYPES = ['carry', 'create', 'width', 'size', 'remove', 'enter', 'leave', 'ungroup', 'drawArea', 'areaSide'], IN_AREA = ['carry', 'create', 'width', 'size', 'remove'];
  const thinType = TYPES.filter((t) => all(t) < 2), thinArea = IN_AREA.filter((t) => share(t, 'area') < 0.5);
  const undone = +(all('carry, undone') + all('create, undone')).toFixed(1), typed = by('size before an undo'), back = by('undo carry');
  const temp = pc(c['moved under a temporary height']), held = pc(by('carry+hold') + by('carry+shift')), swaps = c['moved with a swap'] || 0, width = pc(c['moved with a width changed']);
  const far = pc(c['L7: commands with a block out of reach']), blocks = c['L7: blocks out of reach'] || 0;
  const neg = KINDS_NOT.map((k) => [k, (r.by[k]?.refused || 0) + (r.by[k]?.failed || 0)]), attempts = neg.reduce((n, [, v]) => n + v, 0);
  const handle = (r.by.areaSide?.accepted || 0) + (r.by.areaSide?.refused || 0), narrowed = c['probe: narrow an area, accepted'] || 0, tried = c['probe: narrow an area'] || 0;
  return [
    ['every type of change at least 2 % (' + TYPES.map((t) => `${t} ${all(t)}`).join(', ') + ')', thinType.length === 0, thinType],
    ['in an area at least 0.5 % each (' + IN_AREA.map((t) => `${t} ${share(t, 'area')}`).join(', ') + ')', thinArea.length === 0, thinArea],
    [`an undo's change at least 10 % (${undone}: carries back ${all('carry, undone')}, deleted blocks made again ${all('create, undone')}), typed into before it, the typing changing the tree, for a fifth of the carries back at least (${typed} of ${back})`, undone >= 10 && typed >= 0.2 * back && back > 0, [undone, typed, back]],
    [`under a temporary height at least 15 % (${temp})`, temp >= 15, temp],
    [`a hold or Shift at least 5 % (${held})`, held >= 5, held],
    [`a real swap at least three times (${swaps})`, swaps >= 3, swaps],
    [`a width changed at least 5 % (${width})`, width >= 5, width],
    [`L7 over something: a block out of the change's reach in at least 20 % of them (${far}), a thousand such blocks at least (${blocks})`, far >= 20 && blocks >= 1000 * Math.min(1, r.stat.notes / 260), [far, blocks]],
    [`what no command may do, ${attempts} attempts, ten at least, each kind drawn and none accepted (${neg.map(([k, v]) => `${k.slice(5)} ${v}`).join(', ')})`, attempts >= 10 * Math.min(1, r.stat.notes / 260) && neg.every(([k, v]) => v >= 1 && !r.by[k].accepted), neg],
    [`an area's handle refused at least once and accepted at least half the times (${r.by.areaSide?.refused || 0} refused of ${handle})`, (r.by.areaSide?.refused || 0) >= 1 && (r.by.areaSide?.accepted || 0) >= handle / 2, r.by.areaSide],
    [`the probe that narrows an area accepted at least half the times (${narrowed} of ${tried}): a refusal is an answer, not every answer`, tried > 0 && narrowed >= tried / 2, [narrowed, tried]],
  ];
}
const Q = quotas(r);
for (const [what, holds, got] of Q) ok(what, holds, got);

// ---- reported, not failed
console.log(`  L14, reported: of ${r.reopened.same + r.reopened.other} answers read again and opened, ${r.reopened.same} open to the same places, ${r.reopened.other} to others` + (r.reopened.first ? ' (the first: ' + JSON.stringify(r.reopened.first).slice(0, 300) + ')' : ''));
console.log(`  L7, reported: ${c['L7: a text out of reach rested late'] || 0} texts out of a change's reach came to their rest width with it` + (r.lateFirst ? ' (the first: ' + JSON.stringify(r.lateFirst).slice(0, 400) + ')' : ''));
console.log(`  L7, reported: ${c['L7: a text out of reach rested by its canonical rows, under an undo'] || 0} texts out of an undo's reach rested by their canonical rows` + (r.canonFirst ? ' (the first: ' + JSON.stringify(r.canonFirst).slice(0, 400) + ')' : ''));
console.log(`  a gesture's start whose area's frame is not round its children, after a swap inside the area: ${c['start: an area\'s frame not round its children (after a swap inside it)'] || 0}`);

// ---- a named case (the independent review of a4e9bf4): an undo that rests a far text with temporary rows. A, 50 letters, shows two
// temporary rows; W stands beside its shown rows only. A is made elastic and rests against W; F, far away, is deleted and made again
// by an undo, whose SETTLE runs on the canonical layout: A rests by its canonical row, where W is not beside it, and widens. L7's
// confirmation must measure as the undo does, with no temporary row: by the displayed measure the same rest gives A another height,
// and the right engine would be told wrong
{
  const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
  const map = { A: { text: 'x'.repeat(50), temp: 2 }, W: { text: 'x' }, F: { text: 'x' } };
  const stored = lay(44, [{ id: 'A', kind: 'text', col: 2, y: 0, cw: 8 }, { id: 'W', kind: 'text', col: 14, y: 2, cw: 1, ch: 9 }, { id: 'F', kind: 'text', col: 36, y: 30, cw: 3 }]);
  const seen = [];
  const n = runLaws({ max: 5, probes: 2, drive: (X) => {
    const hist = []; let T = X.note({ k: 0, seed: 0, stored, map, hist });
    const step = (kind, c) => { hist.push([kind, c]); const a = X.settle(kind, c, T, emptyMemory()); if (a.ok) T = a.layout; seen.push(a.ok ? T : null); };
    step('size set', { type: 'size', box: null, id: 'A', set: { cw: null } });
    const f = T.boxes.get('F');
    step('remove', { type: 'remove', box: null, id: 'F' });
    step('create again', { type: 'create', box: null, id: 'F', kind: 'text', at: { col: f.col, y: f.y, frow: f.y, w: f.w }, away: true, set: { cw: f.cw }, canonical: true });
  } });
  const [, removed, undone] = seen, wA = (T) => T && T.boxes.get('A').w;
  ok(`an undo far away widens a text that rests by its canonical row (A ${wA(removed) - 1} cells, then ${wA(undone) - 1}): no violation, A and the block it now pushes counted as an undo's rest`,
    n.violations.length === 0 && wA(undone) > wA(removed) && n.counts['L7: a text out of reach rested by its canonical rows, under an undo'] === 2, [n.violations[0], n.counts]);
  const ctx = { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) }, cb = removed && unshow(removed, ctx);
  const byUndo = cb && rest(cb, canonicalCtx(ctx)), byScreen = cb && rest(cb, ctx), hA = (R) => R && R.ok && R.layout.boxes.get('A').h;
  ok(`and the case tells the two measures apart: the canonical rest gives A ${hA(byUndo)} row, the displayed measure ${hA(byScreen)}`, hA(byUndo) === unshow(undone, ctx).boxes.get('A').h && hA(byScreen) !== hA(byUndo), [hA(byUndo), hA(byScreen)]);
}

// ---- the laws can fail: an engine that breaks one is caught by that law
{
  const broken = (tamper, o = {}) => runLaws({ seed: 3, notes: 60, max: 1, probes: 0, ...o, engine: (root, change, memory, ctx) => tamper(settleTree(root, change, memory, ctx), root, change, memory) });
  const first = (tamper, o) => broken(tamper, o).violations[0];
  const lower = (r2) => { if (!r2.ok) return r2; const id = r2.layout.order[0], boxes = new Map(r2.layout.boxes); boxes.set(id, { ...boxes.get(id), y: boxes.get(id).y + 1 }); return { ...r2, layout: { ...r2.layout, boxes } }; };
  const a = first(lower);
  ok('a block moved with no stack to hold it there: caught as an invalid answer', !!a && /^valid: the answer/.test(a.law), show(a));
  const b = first((r2, root) => { if (r2.ok && root.order.length) root.boxes.delete(root.order[0]); return r2; });
  ok('an input changed by the command: caught by L6', !!b && /^L6/.test(b.law), show(b));
  let n = 0;
  const d = first((r2) => (r2.ok && n++ % 2 ? { ...r2, memory: { ...r2.memory, dir: r2.memory.dir === 'down' ? 'up' : 'down' } } : r2));
  ok('an answer that differs when asked again: caught by L4', !!d && /^L4/.test(d.law), show(d));
  const e = first((r2) => (r2.ok ? r2 : { ok: true, layout: null }));
  ok('a command nothing may do, accepted: caught', !!e && /not accepted|never a throw|valid/.test(e.law), show(e));

  // the independent review of S2a: three engines its exceptions let through, and one for L13
  const f = first((r2, root, change) => (r2.ok && r2.start && change.type !== 'carry' ? { ...r2, start: { ...r2.start, areas: new Map() } } : r2));
  ok('a start that lost its child containers: caught as an invalid start, the frame after a swap the only thing let through', !!f && /^valid: the answer's start/.test(f.law) && /an area with no container/.test(String(f.detail)), show(f));
  const g2 = first((r2, root, change) => {   // a frame of `start` made wrong where no swap was: by a carry on the sheet
    if (!r2.ok || change.type !== 'carry' || change.box != null) return r2;
    const a2 = [...r2.start.areas.keys()][0]; if (!a2) return r2;
    const boxes = new Map(r2.start.boxes), x = boxes.get(a2); boxes.set(a2, { ...x, ch: (x.ch || x.h) + 3 });
    return { ...r2, start: { ...r2.start, boxes } };
  });
  ok('an area\'s frame of a start changed where no swap was made in it: caught', !!g2 && /^valid: the answer's start|^L4|^valid/.test(g2.law), show(g2));
  // after a carry inside an area with no swap, every child of that area in `start` a row lower, the order and the stacks kept (a row
  // more above each block that anchors from the top): a sound container, and a frame that is not round it, with no swap to explain it
  const sunk = (C) => ({ ...C, boxes: new Map([...C.boxes].map(([id, x]) => [id, { ...x, y: x.y + 1, ...(x.yc != null ? { yc: x.yc + 1 } : {}),
    ...(x.above ? { above: x.above.map((t) => (t.stack.u !== null ? t : { ...t, stack: { ...t.stack, parts: [t.stack.parts[0][0]?.o === null ? [{ o: null, n: t.stack.parts[0][0].n + 1 }, ...t.stack.parts[0].slice(1)] : [{ o: null, n: 1 }, ...t.stack.parts[0]], ...t.stack.parts.slice(1)] } })) } : {}) }])) });
  const j = first((r2, root, change) => {
    if (!r2.ok || change.type !== 'carry' || change.box == null || !r2.start.areas.has(change.box) || !r2.start.areas.get(change.box).boxes.size) return r2;
    if (JSON.stringify([...r2.start.areas.get(change.box).boxes]) !== JSON.stringify([...root.areas.get(change.box).boxes])) return r2;   // not where the engine swapped
    const areas = new Map(r2.start.areas); areas.set(change.box, sunk(areas.get(change.box)));
    return { ...r2, start: { ...r2.start, areas } };
  }, { notes: 200 });
  ok('the children of a start a row lower in their area after a carry with no swap: caught as an invalid start, by the frame alone', !!j && /^valid: the answer's start/.test(j.law) && j.detail.every((x) => /frame of/.test(x)), show(j));
  // a block a cell narrower, its stacks cut to the columns it keeps, so that the tree stays one `validate` accepts
  const narrower = (x) => ({ ...x, w: x.w - 1, ...(x.above ? { above: x.above.filter((t) => t.c0 <= x.col + x.w - 2).map((t) => ({ ...t, c1: Math.min(t.c1, x.col + x.w - 2) })) } : {}) });
  // a deletion that narrows a text nothing links to the deleted block, and sets its width: the tree stays valid (its height and its
  // stacks are as they were), so only L7 can tell, and its exception for a late rest must not take it
  const far = (root, id) => {   // a text of the sheet no chain of shared columns and rows links to block `id`, alone in its columns
    const bs = [...root.boxes.values()], seen = new Set([id]), queue = [root.boxes.get(id)];
    while (queue.length) { const p = queue.pop(); for (const q of bs) if (!seen.has(q.id) && (sharesCol(p, q) || sharesRow(p, q))) { seen.add(q.id); queue.push(q); } }
    return bs.find((x) => !seen.has(x.id) && x.kind === 'text' && x.cw == null && x.w > 3 && bs.every((y) => y === x || !sharesCol(x, y)));
  };
  const narrowing = (set) => (r2, root, change) => {
    if (!r2.ok || change.type !== 'remove' || change.box != null) return r2;
    const lone = far(root, change.id), x = lone && r2.layout.boxes.get(lone.id);
    if (!x || x.w !== lone.w) return r2;
    const boxes = new Map(r2.layout.boxes); boxes.set(x.id, { ...narrower(x), ...(set ? { cw: x.w - 2 } : {}) });
    return { ...r2, layout: { ...r2.layout, boxes } };
  };
  const h = first(narrowing(true), { notes: 800 });
  ok('a text out of a deletion\'s reach narrowed and given a set width: caught by L7, no late rest', !!h && /^L7/.test(h.law), show(h));
  const h2 = first(narrowing(false), { notes: 800 });
  ok('and narrowed with its width left elastic: caught by L7 too', !!h2 && /^L7/.test(h2.law), show(h2));
  // an engine that answers by where the sheet's blocks stand from the top: it refuses once every block is 75 rows down
  const i = first((r2, root) => (r2.ok && root.boxes.size && [...root.boxes.values()].every((x) => x.y >= 75) ? { ok: false, why: 'refused', errors: [] } : r2));
  ok('an answer that depends on the rows from the top: caught by L13', !!i && /^L13/.test(i.law), show(i));

  // and the quotas: a hold that is accepted and changes nothing is no hold; a handle that is always refused is no probe
  const failing = (run, re) => quotas(run).filter(([, holds]) => !holds).map(([what]) => what).filter((w) => re.test(w));
  const empty = broken((r2, root, change, memory) => (r2.ok && change.through === 'hold' ? { ok: true, layout: root, start: root, memory } : r2), { seed, notes, max: 1e9 });
  ok(`a hold accepted with the tree as it was (${empty.by['carry+hold']?.accepted} accepted, ${empty.by['carry+hold']?.moved} changing the tree): the quota of holds fails`, failing(empty, /^a hold or Shift/).length === 1 && (empty.by['carry+hold']?.moved || 0) === 0, quotas(empty).map(([w, h2]) => [h2, w.slice(0, 60)]));
  const stiff = broken((r2, root, change) => (change.type === 'areaSide' ? { ok: false, why: 'refused', errors: [] } : r2), { seed, notes: 60, probes: 4, max: 1e9 });
  ok('an area\'s handle that is always refused: the quotas of the handle and of its probe fail', failing(stiff, /^the probe that narrows an area|^an area's handle/).length === 2, quotas(stiff).map(([w, h2]) => [h2, w.slice(0, 60)]));
}

process.exit(fails ? 1 : 0);
