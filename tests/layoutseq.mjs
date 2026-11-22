// Node: sequences of commands with the laws and the probes of their consequences (docs/LAYOUT-SEAMS-PLAN.md §4.2–§4.5), over the engine
// alone: tests/lib/layout/seq.mjs draws the notes and the commands, tests/lib/layout/laws.mjs runs each and judges it. What must hold
// after every command is in laws.mjs; here are the run, the quotas that make it mean something, and the checks that the laws can fail.
//
// The quotas count accepted transitions that changed the tree, and the negative attempts apart, each with its own denominator; a run
// below one fails, so that a law passing over nothing is seen. The numbers were set from what the generator draws, as a floor well under
// it; the plan's first numbers are in §4.5.
//
//   node tests/layoutseq.mjs [seed] [notes]

import { runLaws } from './lib/layout/laws.mjs';
import { KINDS_NOT } from './lib/layout/seq.mjs';
import { settleTree } from '../public/layout/tree.js';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got, null, 1).slice(0, 5000))); };
const show = (v) => v && { ...v, hist: v.hist.slice(-8) };

const seed = +process.argv[2] || 7, notes = +process.argv[3] || 260;
const r = runLaws({ seed, notes });
const c = r.counts, moved = r.stat.moved, pc = (n) => +(100 * (n || 0) / moved).toFixed(1);

ok(`${r.stat.notes} notes, ${r.stat.commands} commands (${r.stat.accepted} accepted, ${moved} of them changing the tree, ${r.stat.refused} refused, ${r.stat.failed} failed, each of those a command nothing may do): every law holds, every probe gives a valid tree`, r.violations.length === 0, show(r.violations[0]));
console.log('  probes: ' + Object.entries(c).filter(([k]) => k.startsWith('probe')).map(([k, v]) => `${k.slice(7)} ${v}`).join(', '));
console.log(`  laws run: L4 ${c['L4: again'] || 0} again and ${c['L4: another order'] || 0} in another order, L5 ${c.L5 || 0}, L7 ${c['L7: blocks out of reach'] || 0} blocks out of reach, L9 ${c.L9 || 0}, L13 ${c.L13 || 0}`);

// ---- the quotas of the accepted transitions, shares of those that changed the tree
const types = r.types, share = (t, w) => pc(types[t]?.[w]), all = (t) => pc((types[t]?.sheet || 0) + (types[t]?.area || 0));
const TYPES = ['carry', 'create', 'width', 'size', 'remove', 'enter', 'leave', 'ungroup', 'drawArea', 'areaSide'], IN_AREA = ['carry', 'create', 'width', 'size', 'remove'];
const thinType = TYPES.filter((t) => all(t) < 2.5), thinArea = IN_AREA.filter((t) => share(t, 'area') < 1);
ok('every type of change at least 2.5 % of them (' + TYPES.map((t) => `${t} ${all(t)}`).join(', ') + ')', thinType.length === 0, thinType);
ok('in an area at least 1 % each (' + IN_AREA.map((t) => `${t} ${share(t, 'area')}`).join(', ') + ')', thinArea.length === 0, thinArea);
const undone = all('carry, undone') + all('create, undone'), typed = r.by['size before an undo']?.accepted || 0, undos = (r.by['undo carry']?.accepted || 0) + (r.by['create again']?.accepted || 0);
ok(`an undo's change at least 10 % (${undone.toFixed(1)}: carries back ${all('carry, undone')}, deleted blocks made again ${all('create, undone')}), typed into before it for a fifth of the carries back at least (${typed} of ${r.by['undo carry']?.accepted || 0})`, undone >= 10 && typed >= 0.2 * (r.by['undo carry']?.accepted || 0), [undone, typed, undos]);
const held = (r.by['carry+hold']?.accepted || 0) + (r.by['carry+shift']?.accepted || 0);
ok(`under a temporary height at least 15 % (${pc(c['accepted under a temporary height'])}), a hold or Shift at least 5 % (${pc(held)}), a real swap seen (${c['accepted with a swap'] || 0}), a width changed at least 5 % (${pc(c['accepted with a width changed'])})`,
  pc(c['accepted under a temporary height']) >= 15 && pc(held) >= 5 && (c['accepted with a swap'] || 0) >= 3 && pc(c['accepted with a width changed']) >= 5);

// ---- the negative attempts, counted apart: each drawn, none accepted (an acceptance is a violation above), a handle refused
const neg = KINDS_NOT.map((k) => [k, (r.by[k]?.refused || 0) + (r.by[k]?.failed || 0)]), attempts = neg.reduce((n, [, v]) => n + v, 0);
ok(`what no command may do, ${attempts} attempts, each kind at least three times and none accepted (${neg.map(([k, v]) => `${k.slice(5)} ${v}`).join(', ')}); an area's handle refused ${r.by.areaSide?.refused || 0} times of ${(r.by.areaSide?.accepted || 0) + (r.by.areaSide?.refused || 0)}`,
  neg.every(([k, v]) => v >= 3 && !r.by[k].accepted) && (r.by.areaSide?.refused || 0) >= 1, neg);

// ---- reported, not failed
console.log(`  L14, reported: of ${r.reopened.same + r.reopened.other} answers read again and opened, ${r.reopened.same} open to the same places, ${r.reopened.other} to others` + (r.reopened.first ? ' (the first: ' + JSON.stringify(r.reopened.first).slice(0, 300) + ')' : ''));
console.log(`  L7, reported: ${c['L7: a text out of reach rested late'] || 0} texts out of a change's reach came to their rest width with it` + (r.lateFirst ? ' (the first: ' + JSON.stringify(r.lateFirst).slice(0, 400) + ')' : ''));
console.log(`  a gesture's start whose area's frame is not round its children, after a swap inside the area: ${c['start: an area\'s frame not round its children (after a swap inside it)'] || 0}`);

// ---- the laws can fail: an engine that breaks one is caught by that law
{
  const first = (tamper) => runLaws({ seed: 3, notes: 40, max: 1, engine: (root, change, memory, ctx) => tamper(settleTree(root, change, memory, ctx), root, memory) }).violations[0];
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
}

process.exit(fails ? 1 : 0);
