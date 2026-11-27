// Node: a block's own temporary rows (`tx`; docs/LAYOUT-SEAMS-PLAN.md §6.1, §6.3). `show` is given rows for a block (P18's wide field
// row, an area's own row): they are part of its `t`, kept in a field of their own in the displayed layout, and every path that measures
// the block again or makes its box again gives them back. One named case per path of §6.1's table, for a text and for an area; then the
// budget of an area's own handle, which those rows are no room in (§6.3). The pinned engine of S1 loses them on most of these paths:
// that is the difference this part of the plan names, so these cases, not the comparison with it, hold the behaviour.
import { open, show, unshow } from '../public/layout/layout.js';
import { settleTree } from '../public/layout/tree.js';
import { emptyMemory } from '../public/layout/settle.js';
import { validate } from '../public/layout/validate.js';
import { readingOrder } from '../public/layout/geometry.js';
import { framesAgainstRef } from './lab/frame-ref.mjs';
import { chars, ctxOf, tally } from './lib/primcase.mjs';

const t = tally(), ok = t.ok;
const S = (id, col, y, cw) => ({ id, kind: 'text', col, y, cw });
const T = (id, col, y) => ({ id, kind: 'text', col, y });
const lay = (cols, boxes) => ({ cols, measure: 'canonical', boxes: new Map(boxes.map((b) => [b.id, b])), order: readingOrder(boxes), areas: new Map() });
const note = (boxes, areas = {}) => ({ ...lay(44, boxes), areas: new Map(Object.entries(areas).map(([id, bs]) => [id, lay(0, bs)])) });
const find = (Tr, id) => Tr.boxes.get(id) || [...Tr.areas.values()].map((C) => C.boxes.get(id)).find(Boolean);
/** A note opened and shown with rows of their own for the blocks of `temp`. */
function shown(boxes, areas, map, temp) {
  const ctx = ctxOf(map), o = open(note(boxes, areas), ctx);
  if (!o.ok) throw new Error('open: ' + JSON.stringify(o.errors));
  return { ctx, tree: show(o.layout, new Map(Object.entries(temp)), ctx) };
}
/** After a command: the block keeps `tx` rows of its own, shows `t` temporary rows in all, and the tree is valid, frames by the formula. */
function kept(name, r, ctx, id, tx, tt) {
  const b = r.ok && find(r.layout, id), errs = r.ok ? [...validate(r.layout, ctx), ...framesAgainstRef(r.layout, ctx.measure)] : ['not accepted'];
  ok(`${name}: ${id} keeps its ${tx} own, ${tt} temporary in all`, !!b && (b.tx || 0) === tx && (b.t || 0) === tt && !errs.length, r.ok ? [b && [b.w, b.h, b.t, b.tx], errs] : r);
  return r;
}
const go = (tree, change, ctx) => settleTree(tree, change, emptyMemory(), ctx);

/* ── 1. a text ── */
{
  const map = { A: { text: chars(30) }, B: { text: 'x' }, R: { kind: 'area' }, c: { text: 'x' } };
  const boxes = [S('A', 2, 0, 5), S('B', 20, 0, 3), { id: 'R', kind: 'area', col: 0, y: 12, cw: 14 }];
  const { ctx, tree } = shown(boxes, { R: [S('c', 0, 0, 3)] }, map, { A: 1 });
  const a0 = tree.boxes.get('A');
  ok(`1 shown with a row of its own: ${a0.h} rows, ${a0.t} temporary, ${a0.tx} its own; canonically none`, a0.tx === 1 && a0.t === 1 && a0.h === 3 && !validate(tree, ctx).length && (unshow(tree, ctx).boxes.get('A').tx || 0) === 0 && unshow(tree, ctx).boxes.get('A').h === 2, [a0, validate(tree, ctx)]);
  // typing: measured again at its width
  const typed = ctxOf({ ...map, A: { text: chars(60) } });
  kept('1a typing', go(tree, { type: 'size', box: null, id: 'A' }, typed), typed, 'A', 1, 1);
  // the measure shows temporary rows of its own too (an unfolded block): both are shown
  const both = ctxOf({ ...map, A: { text: chars(30), temp: 2 } });
  kept('1b the measure shows two more', go(tree, { type: 'size', box: null, id: 'A' }, both), both, 'A', 1, 3);
  kept('1c its width handle', go(tree, { type: 'width', box: null, id: 'A', cw: 3, side: 'right' }, ctx), ctx, 'A', 1, 1);
  kept('1d a set width taken: it rests elastic', go(tree, { type: 'size', box: null, id: 'A', set: { cw: null } }, ctx), ctx, 'A', 1, 1);
  kept('1e carried', go(tree, { type: 'carry', box: null, id: 'A', at: { col: 8, y: 5, frow: 5, w: a0.w }, away: false }, ctx), ctx, 'A', 1, 1);
  kept('1f carried away, into other columns', go(tree, { type: 'carry', box: null, id: 'A', at: { col: 30, y: 4, frow: 4, w: a0.w }, away: true }, ctx), ctx, 'A', 1, 1);
  // pressed aside by another block's carry onto its rows, and another block's change beside it
  kept('1g another block carried onto it', go(tree, { type: 'carry', box: null, id: 'B', at: { col: 3, y: 1, frow: 1, w: 4 }, away: true }, ctx), ctx, 'A', 1, 1);
  const inR = kept('1h into an area', go(tree, { type: 'enter', box: null, id: 'A', to: 'R', at: { col: 0, y: 2 } }, ctx), ctx, 'A', 1, 1);
  const out = inR.ok && kept('1i and out of it again', go(inR.layout, { type: 'leave', box: 'R', id: 'A', to: null, at: { col: 26, y: 3 } }, ctx), ctx, 'A', 1, 1);
  inR.ok && kept('1j its area ungrouped', go(inR.layout, { type: 'ungroup', box: null, id: 'R' }, ctx), ctx, 'A', 1, 1);
  const made = go(tree, { type: 'create', box: null, id: 'N', kind: 'text', at: { col: 30, y: 8, frow: 8, w: 4 }, away: true, set: { cw: 3 } }, ctxOf({ ...map, N: { text: 'x' } }));
  ok('1k a block made new has none; the others keep theirs', made.ok && (made.layout.boxes.get('N').tx || 0) === 0 && made.layout.boxes.get('A').tx === 1, made.ok ? made.layout.boxes.get('N') : made);
  // an undo's carry back runs on canonical rows: the rows of its own are kept aside and shown again
  const moved = go(tree, { type: 'carry', box: null, id: 'A', at: { col: 8, y: 5, frow: 5, w: a0.w }, away: false }, ctx);
  moved.ok && kept('1l its carry undone (the canonical pass)', go(moved.layout, { type: 'carry', box: null, id: 'A', at: { col: 2, y: 0, frow: 0, w: a0.w }, away: false, canonical: true }, ctx), ctx, 'A', 1, 1);
  moved.ok && kept('1m another block\'s undo, beside it', go(moved.layout, { type: 'carry', box: null, id: 'B', at: { col: 20, y: 0, frow: 0, w: 4 }, away: false, canonical: true }, ctx), ctx, 'A', 1, 1);
  void out;
  // shown again with no rows: gone, and nothing else moved canonically
  const again = show(unshow(tree, ctx), new Map(), ctx);
  ok('1n shown again with none given: it has none', (again.boxes.get('A').tx || 0) === 0 && again.boxes.get('A').t === 0 && JSON.stringify(unshow(again, ctx).boxes.get('A')) === JSON.stringify(unshow(tree, ctx).boxes.get('A')));
}

/* ── 1'. its own rows are rows it stands on: the rest width counts them (the independent review of df6a635). A, 50 letters, set to 4
   cells, shows a row of its own; B stands beside the rows A would take wider. Made elastic, A rests no wider than B lets it on every
   row it shows, and B stays; the same note with that row given by the measure rests alike ── */
{
  const boxes = [S('A', 0, 0, 4), S('B', 12, 1, 3)], map = { A: { text: chars(50) }, B: { text: 'x' } };
  const own = shown(boxes, {}, map, { A: 1 }), byMeasure = shown(boxes, {}, { ...map, A: { text: chars(50), temp: 1 } }, {});
  const free = { type: 'size', box: null, id: 'A', set: { cw: null } };
  const r = go(own.tree, free, own.ctx), m = go(byMeasure.tree, free, byMeasure.ctx);
  const A = r.ok && r.layout.boxes.get('A'), B = r.ok && r.layout.boxes.get('B'), Am = m.ok && m.layout.boxes.get('A');
  ok(`1' made elastic beside B: A rests at ${A && A.w - 1} cells, B stays at row ${B && B.y}`, !!A && A.w - 1 === 11 && B.y === 1 && (B.yc ?? B.y) === 1 && A.tx === 1 && !validate(r.layout, own.ctx).length, r.ok ? [A, B] : r);
  ok('1\'a as the same row given by the measure does', !!Am && Am.w === A.w && Am.h === A.h && m.layout.boxes.get('B').y === 1, m.ok ? Am : m);
}

/* ── 2. an area ── */
{
  const map = { R: { kind: 'area' }, c: { text: 'x' }, d: { text: 'x' }, B: { text: 'x' } };
  const kids = [S('c', 0, 0, 3), S('d', 4, 2, 4)], boxes = [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 12 }, S('B', 30, 0, 3)];
  const { ctx, tree } = shown(boxes, { R: kids }, map, { R: 1 });
  const a0 = tree.boxes.get('R');
  ok(`2 shown with a row of its own: ${a0.h} rows (the formula's 4 and one), ${a0.t} temporary`, a0.h === 5 && a0.t === 1 && a0.tx === 1 && !validate(tree, ctx).length && !framesAgainstRef(tree, ctx.measure).length, [a0, validate(tree, ctx)]);
  // its lowest child grows by typing: the frame follows, its own row still on top of it
  const grown = ctxOf({ ...map, d: { text: chars(40) } });
  const g = kept('2a a child grows', go(tree, { type: 'size', box: 'R', id: 'd' }, grown), grown, 'R', 1, 1);
  ok('2a\' and the frame is taller by the child\'s rows', g.ok && g.layout.boxes.get('R').h > 5, g.ok && g.layout.boxes.get('R').h);
  const temp2 = ctxOf({ ...map, d: { text: 'x', temp: 2 } });
  kept('2b a child shows two temporary rows of the measure', go(tree, { type: 'size', box: 'R', id: 'd' }, temp2), temp2, 'R', 1, 3);
  kept('2c a child deleted', go(tree, { type: 'remove', box: 'R', id: 'd' }, ctx), ctx, 'R', 1, 1);
  kept('2d carried', go(tree, { type: 'carry', box: null, id: 'R', at: { col: 6, y: 6, frow: 6, w: a0.w }, away: false }, ctx), ctx, 'R', 1, 1);
  kept('2e collapsed', go(tree, { type: 'size', box: null, id: 'R', set: { collapsed: true } }, ctx), ctx, 'R', 1, 1);
  kept('2f a set height', go(tree, { type: 'size', box: null, id: 'R', set: { ch: 9 } }, ctx), ctx, 'R', 1, 1);
  kept('2g a block comes into it', go(tree, { type: 'enter', box: null, id: 'B', to: 'R', at: { col: 0, y: 5 } }, ctx), ctx, 'R', 1, 1);
  const moved = go(tree, { type: 'carry', box: null, id: 'R', at: { col: 6, y: 6, frow: 6, w: a0.w }, away: false }, ctx);
  moved.ok && kept('2h its carry undone (the canonical pass)', go(moved.layout, { type: 'carry', box: null, id: 'R', at: { col: 0, y: 1, frow: 1, w: a0.w }, away: false, canonical: true }, ctx), ctx, 'R', 1, 1);
  const drawn = go(tree, { type: 'drawArea', box: null, id: 'D', at: { col: 20, y: 10, cols: 12, rows: 3 } }, ctxOf({ ...map, D: { kind: 'area' } }));
  ok('2i an area drawn new has none', drawn.ok && (drawn.layout.boxes.get('D').tx || 0) === 0 && drawn.layout.boxes.get('R').tx === 1, drawn.ok ? drawn.layout.boxes.get('D') : drawn);
}

/* ── 3. the budget of an area's own handle (§6.3): never taller than at the gesture's start, its own rows no room for its children ── */
{
  // children of 12 letters in 4 cells: one row; narrowed to 3 cells... the area is narrowed so that a child takes a row more
  const kids = [T('c', 0, 0)], base = [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 14 }];
  const map = { R: { kind: 'area' }, c: { text: chars(39) } };   // 39 letters: one row in 13 cells, two in 12
  const plain = shown(base, { R: kids }, map, {}), own = shown(base, { R: kids }, map, { R: 1 });
  const narrow = { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 14 };
  const p = go(plain.tree, narrow, plain.ctx), q = go(own.tree, narrow, own.ctx);
  ok(`3 an open area narrowed so that its child takes a row more: refused, with no row of its own (${plain.tree.boxes.get('R').h} rows) and with one (${own.tree.boxes.get('R').h})`, !p.ok && p.why === 'refused' && !q.ok && q.why === 'refused', [p.ok ? p.layout.boxes.get('R') : p.why, q.ok ? q.layout.boxes.get('R') : q.why]);
  // a set height leaves the room: accepted, the same rows shown, with a row of its own or without
  const tall = [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 14, ch: 5 }];
  const tp = shown(tall, { R: kids }, map, {}), tq = shown(tall, { R: kids }, map, { R: 1 });
  const rp = go(tp.tree, narrow, tp.ctx), rq = go(tq.tree, narrow, tq.ctx);
  ok('3a with a set height that leaves the room: accepted, no taller', rp.ok && rp.layout.boxes.get('R').h === tp.tree.boxes.get('R').h && !validate(rp.layout, tp.ctx).length, rp.ok ? rp.layout.boxes.get('R') : rp);
  ok(`3b and with a row of its own: accepted, no taller (${tq.tree.boxes.get('R').h} rows before and after), the row kept`, rq.ok && rq.layout.boxes.get('R').h === tq.tree.boxes.get('R').h && rq.layout.boxes.get('R').tx === 1 && !validate(rq.layout, tq.ctx).length && !framesAgainstRef(rq.layout, tq.ctx.measure).length, rq.ok ? rq.layout.boxes.get('R') : rq);
  // the room is the frame's less its header and its own rows: a child that would need the row the area shows of its own is refused
  const tight = [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 14, ch: 2 }];
  const xp = shown(tight, { R: kids }, map, {}), xq = shown(tight, { R: kids }, map, { R: 1 });
  const sp = go(xp.tree, narrow, xp.ctx), sq = go(xq.tree, narrow, xq.ctx);
  ok(`3c a frame of a header and one row (${xq.tree.boxes.get('R').h} shown, one its own): the child's second row is not taken from the area's own row, refused as without it`, !sp.ok && !sq.ok && sq.why === 'refused', [sp.ok ? sp.layout.boxes.get('R') : sp.why, sq.ok ? sq.layout.boxes.get('R') : sq.why]);
  // a collapsed area: its frame is its header, its hidden children take nothing of it: the handle moves, with a row of its own or not
  const coll = [{ id: 'R', kind: 'area', col: 0, y: 1, cw: 14, collapsed: true }];
  const cp = shown(coll, { R: kids }, map, {}), cq = shown(coll, { R: kids }, map, { R: 1 });
  const up = go(cp.tree, narrow, cp.ctx), uq = go(cq.tree, narrow, cq.ctx);
  ok('3d a collapsed area with a child: its handle moves', up.ok && up.layout.boxes.get('R').w === 14 && up.layout.boxes.get('R').h === 1 && !validate(up.layout, cp.ctx).length, up.ok ? up.layout.boxes.get('R') : up);
  ok('3e and with a row of its own: it moves, the row kept', uq.ok && uq.layout.boxes.get('R').w === 14 && uq.layout.boxes.get('R').h === 2 && uq.layout.boxes.get('R').tx === 1 && !validate(uq.layout, cq.ctx).length, uq.ok ? uq.layout.boxes.get('R') : uq);
}
/* ── 4. the case of the plan's review (§6.3): an area of three rows that shows four, one its own, narrowed so that its child takes a
   row more. The engine before `tx` took the area's own row for room: accepted, four rows and none temporary, the row lost ── */
{
  const map = { R: { kind: 'area' }, c: { text: chars(78) } };   // 78 letters: two rows in 13 cells, three in 12
  const own = shown([{ id: 'R', kind: 'area', col: 0, y: 1, cw: 14 }], { R: [T('c', 0, 0)] }, map, { R: 1 });
  const a0 = own.tree.boxes.get('R'), narrow = { type: 'areaSide', box: null, id: 'R', side: 'right', col: 0, cols: 14 };
  const r = go(own.tree, narrow, own.ctx);
  ok(`4 ${a0.h - a0.t} rows showing ${a0.h}, narrowed so that the child needs a third row: refused, the area as it was`, a0.h === 4 && a0.t === 1 && !r.ok && r.why === 'refused', r.ok ? r.layout.boxes.get('R') : r.why);
}
process.exit(t.fails ? 1 : 0);
