// Node: the comparison of two engines checks itself (tests/lib/layout/pair.mjs; docs/LAYOUT-SEAMS-PLAN.md §4.4). No pinned copy is
// needed for that: the engine against itself gives the same answers, and a side spoilt on purpose is told apart. The harness stays
// for the next refactor that pins a copy of the engine beside it.
//
//   node tests/layoutpair.mjs [seed] [notes]

import { load, run, NEW } from './lib/layout/pair.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 900))); };
const seed = +process.argv[2] || 11, notes = +process.argv[3] || 150;
const A = await load(NEW), B = await load(NEW);

const r = run(A, B, { seed, notes });
ok(`the engine against itself: ${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${r.stat.refused} refused, ${r.stat.failed} failed), the same answers; the patches compared hold fields written as removed (${r.stat.removals})`,
  r.diffs.length === 0 && r.stat.accepted > 500 && r.stat.removals >= 50, [r.diffs[0], r.stat]);

// a side that loses the fields written as removed (a value of undefined): a patch with the field and one without are two answers
const lost = { ...A, diff: (stored, after) => { const d = A.diff(stored, after); for (const [id, p] of d) d.set(id, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))); return d; } };
const p1 = run(lost, B, { seed, notes, max: 1 });
ok('a side whose patches lose the fields written as removed: told apart', p1.diffs.length > 0, p1.stat);

// a side that puts the lowest block a row lower after a deletion
const low = { ...A, settleTree: (root, change, memory, ctx, hooks) => {
  const x = A.settleTree(root, change, memory, ctx, hooks);
  if (!x.ok || change.type !== 'remove') return x;
  const last = [...x.layout.boxes.values()].sort((a, b) => b.y - a.y)[0]; if (!last) return x;
  const boxes = new Map(x.layout.boxes); boxes.set(last.id, { ...last, y: last.y + 1, yc: (last.yc ?? last.y) + 1 });
  return { ...x, layout: { ...x.layout, boxes } };
} };
const p2 = run(low, B, { seed, notes, max: 1 });
ok('a side that answers a deletion with its lowest block a row lower: told apart, at a deletion', p2.diffs.length > 0 && /remove/.test(p2.diffs[0].what), p2.diffs[0] && p2.diffs[0].what);

// a side that answers with another gesture memory
const mem = { ...A, settleTree: (root, change, memory, ctx, hooks) => { const x = A.settleTree(root, change, memory, ctx, hooks); return x.ok && change.type === 'carry' ? { ...x, memory: { ...x.memory, dir: 'sideways' } } : x; } };
const p3 = run(mem, B, { seed, notes, max: 1 });
ok('a side that answers a carry with another memory: told apart', p3.diffs.length > 0, p3.diffs[0] && p3.diffs[0].what);

process.exit(fails ? 1 : 0);
