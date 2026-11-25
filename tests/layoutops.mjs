// Node: the user's actions of the narrow slice (public/layout/ops.js; LAYOUT-ENGINE-PLAN §3.4, §6.4; LAYOUT-SEAMS-PLAN §8).
//   1  a carry: every move a preview, the drop its commit; what is written is the difference from the stored fields, and every command
//      is in the journal and replays;
//   2  home and outside write nothing; a refused move keeps the last preview;
//   3  the exact undo: the tree before, as it was, and the stored fields before; two in a row;
//   4  typing: the text is the page's to save whatever SETTLE answers; a refusal and a failure write no place; typing between an action
//      and its undo drops the engine's entries;
//   5  a creation and a deletion with their undo;
//   6  entering and leaving an area, by the pointer and by a command; an action that is refused changes nothing;
//   7  a signature that changed makes the undo stale;
//   8  histories of random actions: after each the tree is valid and the stored fields are the canonical layout's; the journal replays.
//
//   node tests/layoutops.mjs [seed] [notes]

import { docOf, written, carry, moved, dropped, create, remove, enter, leave, typed, touched, undo } from '../public/layout/ops.js';
import { createJournal, entriesOf, replay } from '../public/layout/journal.js';
import { open, unshow, diff } from '../public/layout/layout.js';
import { validate } from '../public/layout/validate.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { encode } from '../public/layout/journal.js';
import { stubMeasure } from './lib/measure.mjs';
import { draw, noteOf } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1000))); };
const str = (v) => JSON.stringify(encode(v)), flat = (m) => JSON.stringify([...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, f]) => [id, Object.keys(f).sort().map((k) => [k, f[k]])]));   // by value, whatever the order of the fields
const seed = +process.argv[2] || 1, N = +process.argv[3] || 60;
/** A note opened as the bridge will: the tree as shown, and the stored fields the canonical layout would have written. */
function opened(note, map) {
  const ctx = { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) }, o = open(note, ctx);
  if (!o.ok) return null;
  const journal = createJournal({ limit: 1e6 });
  return { doc: docOf(o.shown, written(new Map(), diff(new Map(), o.layout))), env: { ctx, journal }, journal };
}
/** The stored fields are those of the canonical layout: nothing is left to write. */
const inStep = (doc, env) => diff(doc.stored, unshow(doc.tree, env.ctx)).size === 0;
const replays = (journal) => { let bad = 0; for (const e of entriesOf(journal.export())) if (replay(e, KINDS).same !== true) bad++; return bad; };
const centre = (tree, box, id, ctx) => {
  const b = (box == null ? tree : tree.areas.get(box)).boxes.get(id);
  if (box == null) return { x: b.col + 1.5, y: b.y + 0.3 };
  const a = tree.boxes.get(box), H = KINDS.area.container.headerRows(a, ctx.measure);
  return { x: a.col + 1 + b.col + 1.5, y: a.y + H + b.y + 0.3 };
};
const fixture = () => {
  const map = { A: { text: 'x'.repeat(30) }, B: { text: 'x' }, C: { text: 'x' }, R: { kind: 'area' }, c: { text: 'x' }, Q: { kind: 'area' } };
  const o = opened(noteOf(60, [{ id: 'A', kind: 'text', col: 2, y: 3, cw: 5 }, { id: 'B', kind: 'text', col: 2, y: 9, cw: 5 }, { id: 'C', kind: 'text', col: 12, y: 3, cw: 5 },
    { id: 'R', kind: 'area', col: 24, y: 4, cw: 14 }, { id: 'Q', kind: 'area', col: 44, y: 4, cw: 10 }], { R: [{ id: 'c', kind: 'text', col: 0, y: 0, cw: 4 }], Q: [] }), map);
  return { ...o, map };
};

{ // 1, 2, 3
  const { doc, env, journal } = fixture(), p = centre(doc.tree, null, 'A', env.ctx);
  let g = carry(doc, { id: 'A', point: p }, env);
  g = moved(g, { x: p.x + 3, y: p.y + 10 }, env);
  const first = g.last;
  g = moved(g, { x: p.x + 30, y: p.y + 20 }, env);
  const d = dropped(g, env), A0 = doc.tree.boxes.get('A'), A1 = d.doc.tree.boxes.get('A');
  ok('1 a carry of two moves and its drop: the block stands at the last target, the tree is valid', d.ok && first !== g.last && A1.col === A0.col + 30 && A1.y === A0.y + 20 && validate(d.doc.tree, env.ctx).length === 0, { A1, errors: validate(d.doc.tree, env.ctx) });
  ok('1a what is written: the fields of A that differ, its row and its fx; the stored fields are then those of the canonical layout', d.patch.has('A') && 'row' in d.patch.get('A') && 'fx' in d.patch.get('A') && !('cw' in d.patch.get('A')) && inStep(d.doc, env) && d.doc.stored.get('A').col === A1.col && doc.stored.get('A').col === A0.col, [...d.patch]);
  ok('1b both moves are in the journal, and each replays to the recorded answer', journal.entries().length === 2 && replays(journal) === 0, journal.entries().length);
  ok('1c one undo entry, with the identities before and after and the fields A had', d.entry && d.doc.undo.length === 1 && d.entry.before === doc.identity && d.entry.after === d.doc.identity && d.doc.identity !== doc.identity && str(d.entry.fields.get('A')) === str(doc.stored.get('A')));
  // 2
  let h = carry(doc, { id: 'A', point: p }, env);
  h = moved(h, { x: p.x + 9, y: p.y + 4 }, env); const was = h.last;
  h = moved(h, { x: p.x + 0.2, y: p.y + 0.1 }, env);
  const dh = dropped(h, env);
  ok('2 carried away and back to its cell: home, the preview is the note as the carry started, and the drop writes nothing and makes no entry', was && h.state === 'home' && h.last === null && h.start === doc.tree && dh.ok && dh.doc === doc && dh.patch.size === 0 && dh.entry === null);
  let o = carry(doc, { id: 'A', point: p }, env);
  o = moved(o, { x: p.x + 9, y: p.y + 4 }, env); const kept = o.last, n = journal.entries().length;
  o = moved(o, { x: -3, y: p.y }, env);
  ok('2a the pointer outside the sheet: nothing is asked of the engine, the last preview stays, and a drop commits it', o.state === 'outside' && o.last === kept && journal.entries().length === n && dropped(o, env).doc.tree === kept);
  const stub = { ctx: env.ctx, journal: { run: () => ({ ok: false, why: 'refused' }) } };
  const r = moved(o, { x: p.x + 12, y: p.y + 6 }, stub);
  ok('2b a move that is refused: the last accepted preview stays, and the gesture goes on', r.state === 'refused' && r.last === kept && !r.failed && dropped(r, env).ok === true);
  const f = moved(o, { x: p.x + 12, y: p.y + 6 }, { ctx: env.ctx, journal: { run: () => ({ ok: false, why: 'failed', errors: ['x'] }) } });
  const df = dropped(moved(f, { x: p.x + 14, y: p.y + 6 }, env), env);
  ok('2c a move that fails: the rest of the gesture asks nothing, and its drop writes nothing', f.failed && df.ok === false && df.why === 'failed' && df.doc === doc);
  // 3
  const u = undo(d.doc, env);
  ok('3 undone with nothing applied since: the tree before, the same object, the stored fields before, the identity before, no entry left', u.ok && u.doc.tree === doc.tree && flat(u.doc.stored) === flat(doc.stored) && u.doc.identity === doc.identity && u.doc.undo.length === 0);
  ok('3a what the undo writes puts the stored fields back: the fields that differed, as they were', flat(written(d.doc.stored, u.patch, u.removed)) === flat(doc.stored) && Object.keys(u.patch.get('A')).sort().join() === 'fx,row' && u.patch.get('A').row === doc.stored.get('A').row, [...u.patch]);
  ok('3b with no entry there is nothing to undo', undo(doc, env).why === 'none');
  // two in a row
  let g2 = carry(d.doc, { id: 'B', point: centre(d.doc.tree, null, 'B', env.ctx) }, env);
  g2 = moved(g2, { x: 30, y: 30 }, env);
  const d2 = dropped(g2, env), u2 = undo(d2.doc, env), u1 = undo(u2.doc, env);
  ok('3c two actions undone one after the other: each exact, back to the note as opened', d2.ok && d2.doc.undo.length === 2 && u2.ok && u2.doc.tree === d.doc.tree && u1.ok && u1.doc.tree === doc.tree && flat(u1.doc.stored) === flat(doc.stored) && u1.doc.identity === doc.identity);
}

{ // 4
  const { doc, env, map } = fixture();
  map.A = { text: 'x'.repeat(200) };
  const t = typed(doc, { id: 'A' }, env), A0 = doc.tree.boxes.get('A'), A1 = t.doc.tree.boxes.get('A'), B0 = doc.tree.boxes.get('B'), B1 = t.doc.tree.boxes.get('B');
  ok(`4 typing that makes A taller (${A0.h} rows to ${A1.h}): B follows, its row is written, the text is the page's to save, and no undo entry is made`, t.ok && t.content === true && t.safe === false && A1.h > A0.h && B1.y > B0.y && t.patch.has('B') && t.patch.get('B').row === t.doc.stored.get('B').row && !t.patch.has('A') && t.entry === null && t.doc.undo.length === 0 && inStep(t.doc, env) && t.doc.identity !== doc.identity, [...t.patch]);
  const refused = typed(doc, { id: 'A' }, { ctx: env.ctx, journal: { run: () => ({ ok: false, why: 'refused' }) } });
  ok('4a typing that SETTLE refuses: the text is still saved, no place is written, the tree and the stored fields are as they were', refused.ok === false && refused.why === 'refused' && refused.content === true && refused.safe === false && refused.patch === undefined && refused.doc.tree === doc.tree && refused.doc.stored === doc.stored && refused.doc.identity !== doc.identity);
  const m = env.ctx.measure, failing = { ...env, ctx: { ...env.ctx, measure: { rows: (id, c) => { if (id === 'A') throw new Error('no measure'); return m.rows(id, c); }, natural: m.natural } } };
  const failed = typed(doc, { id: 'A' }, failing);
  ok('4b typing whose layout fails (the Measure throws): the text is still saved, no place is written, and the note goes to the safe mode', failed.ok === false && failed.why === 'failed' && failed.content === true && failed.safe === true && failed.doc.tree === doc.tree && failed.doc.stored === doc.stored && env.journal.entries().at(-1).unfit?.join() === 'measure');
  // typing between an action and its undo
  map.A = { text: 'x'.repeat(30) };
  const f2 = fixture();
  let g = carry(f2.doc, { id: 'C', point: centre(f2.doc.tree, null, 'C', f2.env.ctx) }, f2.env);
  g = moved(g, { x: 20, y: 30 }, f2.env);
  const d = dropped(g, f2.env);
  f2.map.B = { text: 'x'.repeat(90) };
  const t2 = typed(d.doc, { id: 'B' }, f2.env), u = undo(t2.doc, f2.env);
  ok('4c typing after an action: the undo of the action is no longer exact, nothing is undone, and the engine\'s entries are dropped', d.ok && t2.ok && t2.doc.undo.length === 1 && u.ok === false && u.why === 'stale' && u.doc.tree === t2.doc.tree && u.doc.stored === t2.doc.stored && u.doc.undo.length === 0);
  const u3 = undo(touched(d.doc), f2.env);
  ok('4d the same after a change that is no action (a fold, the rules): a fresh identity, the undo stale', u3.why === 'stale' && touched(d.doc).identity !== d.doc.identity && touched(d.doc).tree === d.doc.tree);
}

{ // 5
  const { doc, env, map, journal } = fixture();
  map.N = { text: 'new' };
  const c = create(doc, { id: 'N', kind: 'text', at: { col: 2, y: 5, w: 6 }, set: { cw: 5 } }, env), N = c.doc.tree.boxes.get('N');
  ok('5 a block created between A and B: it stands there, every field it has is written, B\'s row with it, and the tree is valid', c.ok && N && N.col === 2 && N.cw === 5 && c.patch.get('N').cw === 5 && 'fx' in c.patch.get('N') && 'row' in c.patch.get('N') && c.entry.fields.get('N') === null && validate(c.doc.tree, env.ctx).length === 0 && inStep(c.doc, env), [...c.patch]);
  const uc = undo(c.doc, env);
  ok('5a its undo: the tree before, the block named as one to take away, the others\' fields put back', uc.ok && uc.doc.tree === doc.tree && uc.removed.join() === 'N' && !uc.patch.has('N') && flat(written(c.doc.stored, uc.patch, uc.removed)) === flat(doc.stored) && flat(uc.doc.stored) === flat(doc.stored));
  const r = remove(c.doc, { id: 'A' }, env);
  ok('5b a block deleted: named as removed, gone from the tree and the stored fields; the entry keeps its fields', r.ok && r.removed.join() === 'A' && !r.doc.tree.boxes.has('A') && !r.doc.stored.has('A') && str(r.entry.fields.get('A')) === str(c.doc.stored.get('A')) && inStep(r.doc, env) && validate(r.doc.tree, env.ctx).length === 0);
  const ur = undo(r.doc, env);
  ok('5c its undo: the block named as one to bring back, with every stored field it had (its fx, not the column read from it)', ur.ok && ur.doc.tree === c.doc.tree && ur.restored.join() === 'A' && 'fx' in ur.patch.get('A') && 'row' in ur.patch.get('A') && !('col' in ur.patch.get('A')) && flat(ur.doc.stored) === flat(c.doc.stored), [...ur.patch]);
  ok('5d every command of these is in the journal and replays', journal.entries().length === 2 && replays(journal) === 0);
}

{ // 6
  const { doc, env, journal } = fixture(), p = centre(doc.tree, null, 'B', env.ctx), R = doc.tree.boxes.get('R');
  let g = carry(doc, { id: 'B', point: p }, env);
  g = moved(g, { x: R.col + 4, y: R.y + 1.5 }, env);
  const inside = g.cur, afterEnter = g.last;
  g = moved(g, { x: R.col + 6, y: R.y + 2.4 }, env);
  const d = dropped(g, env), s = d.doc.stored.get('B'), b = d.doc.tree.areas.get('R').boxes.get('B');
  ok('6 a block carried into an area and dropped there: it is the area\'s child, its parent, its column in the area and its row are written, and its fx is removed', inside === 'R' && afterEnter.areas.get('R').boxes.has('B') && d.ok && b && !d.doc.tree.boxes.has('B') && s.parent === 'R' && s.col === b.col && s.row === b.y && !('fx' in s) && d.patch.get('B').fx === undefined && 'fx' in d.patch.get('B') && inStep(d.doc, env) && validate(d.doc.tree, env.ctx).length === 0, { s, patch: d.patch.get('B') });
  const u = undo(d.doc, env);
  ok('6a its undo: the tree before, B back on the sheet with its fx and no parent', u.ok && u.doc.tree === doc.tree && flat(u.doc.stored) === flat(doc.stored) && u.patch.get('B').parent === undefined && 'parent' in u.patch.get('B') && u.patch.get('B').fx === doc.stored.get('B').fx, u.patch.get('B'));
  // out again, in one carry: in, then out
  let g2 = carry(doc, { id: 'B', point: p }, env);
  g2 = moved(g2, { x: R.col + 4, y: R.y + 1.5 }, env);
  g2 = moved(g2, { x: 8, y: 40 }, env);
  const d2 = dropped(g2, env);
  ok('6b carried into the area and out again before the drop: on the sheet where it was dropped, no parent written', g2.cur === null && d2.ok && d2.doc.tree.boxes.has('B') && !d2.doc.tree.areas.get('R').boxes.has('B') && d2.doc.stored.get('B').parent === undefined && inStep(d2.doc, env) && validate(d2.doc.tree, env.ctx).length === 0, d2.patch && [...d2.patch]);
  // a child carried out
  const pc = centre(doc.tree, 'R', 'c', env.ctx);
  let g3 = carry(doc, { box: 'R', id: 'c', point: pc }, env);
  g3 = moved(g3, { x: 6, y: 30 }, env);
  const d3 = dropped(g3, env), s3 = d3.doc.stored.get('c');
  ok('6c a child carried out of its area: a block of the sheet, its parent removed, its fx written', g3.cur === null && d3.ok && d3.doc.tree.boxes.has('c') && s3.parent === undefined && 'fx' in s3 && d3.patch.get('c').parent === undefined && 'parent' in d3.patch.get('c') && inStep(d3.doc, env) && validate(d3.doc.tree, env.ctx).length === 0, d3.patch && [...d3.patch]);
  // from one area into another
  const Q = doc.tree.boxes.get('Q');
  let g4 = carry(doc, { box: 'R', id: 'c', point: pc }, env);
  g4 = moved(g4, { x: Q.col + 3, y: Q.y + 0.5 }, env);
  const d4 = dropped(g4, env);
  ok('6d a child carried straight into another area: out and in within one move', g4.cur === 'Q' && d4.ok && d4.doc.tree.areas.get('Q').boxes.has('c') && d4.doc.stored.get('c').parent === 'Q' && inStep(d4.doc, env) && validate(d4.doc.tree, env.ctx).length === 0);
  // by a command
  const e = enter(doc, { id: 'A', to: 'R', at: { col: 0, y: 3 } }, env), l = leave(e.doc, { box: 'R', id: 'A', at: { col: 2, y: 20 } }, env);
  ok('6e «В область» and «З області» by a cell: each one action with its entry, undone exactly', e.ok && e.doc.stored.get('A').parent === 'R' && l.ok && l.doc.stored.get('A').parent === undefined && l.doc.undo.length === 2 && undo(l.doc, env).doc.tree === e.doc.tree && undo(undo(l.doc, env).doc, env).doc.tree === doc.tree);
  const no = enter(doc, { id: 'Q', to: 'R', at: { col: 0, y: 3 } }, env);
  ok('6f an area asked into an area is refused: the state is the same object, nothing to write', no.ok === false && no.why === 'refused' && no.doc === doc && no.patch === undefined);
  ok('6g every command of these is in the journal and replays', journal.entries().length > 8 && replays(journal) === 0, journal.entries().length);
}

{ // 7
  const { doc, env, map } = fixture(), sign = (id) => id + ':' + (map[id]?.text ?? '').length, envS = { ...env, sign };
  const r = remove(doc, { id: 'A' }, envS);
  ok('7 with signatures: a deletion undone while its block\'s content is as it was is exact', r.entry.signs.get('A') === 'A:30' && undo(r.doc, envS).ok === true);
  map.A = { text: 'x'.repeat(31) };
  const u = undo(r.doc, envS);
  ok('7a the deleted block\'s content changed meanwhile (no block of the note did, the identity is the entry\'s): the undo is stale', r.doc.identity === r.entry.after && u.ok === false && u.why === 'stale' && u.doc.undo.length === 0);
}

{ // 8
  let notes = 0, actions = 0, committed = 0, undone = 0, bad = 0, first = null, entries = 0, differ = 0;
  for (let i = 0; i < N; i++) {
    const h = draw(seed * 104729 + i), map = JSON.parse(JSON.stringify(h.map)), o = opened(h.note, map);
    if (!o) continue;
    notes++;
    let s = (seed * 7 + i) >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296), int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    let doc = o.doc; const env = o.env;
    const note = (what) => { bad++; first = first || { note: i, what }; };
    for (let k = 0; k < 8; k++) {
      const where = [[null, doc.tree], ...doc.tree.areas].filter(([, L]) => L.order.length), [box, L] = where[int(0, where.length - 1)] || [null, doc.tree];
      const id = L.order[int(0, Math.max(0, L.order.length - 1))], q = rnd();
      let d = null;
      actions++;
      if (!id || q < 0.15) { const nid = 'n' + i + '_' + k; map[nid] = { text: 'x'.repeat(int(1, 40)) }; d = create(doc, { box: null, id: nid, kind: 'text', at: { col: int(0, doc.tree.cols - 6), y: int(0, 20), w: 6 } }, env); }
      else if (q < 0.25) d = remove(doc, { box, id }, env);
      else if (q < 0.4 && map[id] && map[id].kind !== 'area') { map[id] = { ...map[id], text: 'x'.repeat(int(1, 120)) }; d = typed(doc, { box, id }, env); }
      else {
        let g = carry(doc, { box, id, point: centre(doc.tree, box, id, env.ctx) }, env);
        for (let m = 0, nm = int(1, 4); m < nm; m++) g = moved(g, { x: int(0, doc.tree.cols), y: int(0, 30) + rnd() }, env);
        d = dropped(g, env);
      }
      if (!d.ok) { if (d.doc.tree !== doc.tree || d.doc.stored !== doc.stored) note('a refused action changed the state'); doc = d.doc; continue; }
      committed++;
      const errs = validate(d.doc.tree, env.ctx);
      if (errs.length) note({ invalid: errs[0] });
      if (!inStep(d.doc, env)) note('the stored fields are not the canonical layout\'s');
      if (flat(written(doc.stored, d.patch, d.removed)) !== flat(d.doc.stored)) note('the patch does not give the stored fields');
      if (d.entry && rnd() < 0.4) {
        const u = undo(d.doc, env);
        if (!u.ok || u.doc.tree !== doc.tree) note('an undo does not give the tree before');
        else if (flat(u.doc.stored) !== flat(doc.stored)) note('an undo does not give the stored fields before');
        else if (flat(written(d.doc.stored, u.patch, u.removed)) !== flat(doc.stored)) note({ undoPatch: [...u.patch], was: [...doc.stored].filter(([k]) => u.patch.has(k)), now: [...d.doc.stored].filter(([k]) => u.patch.has(k)) });
        else { undone++; doc = u.doc; continue; }
      }
      doc = d.doc;
    }
    for (const e of entriesOf(o.journal.export())) { entries++; const r = replay(e, KINDS); if (r.same !== true) { differ++; first = first || { note: i, n: e.n, replay: Object.keys(r) }; } }
  }
  ok(`8 ${notes} notes, ${actions} actions (${committed} committed, ${undone} undone at once): every tree valid, the stored fields those of the canonical layout, each patch the difference, each undo exact`, notes > N / 2 && committed > actions / 3 && undone > 10 && bad === 0, { bad, first });
  ok(`8a the ${entries} commands the engine was given for them are in the journals, and each replays to the recorded answer`, entries > committed && differ === 0, { differ, first });
}

process.exit(fails ? 1 : 0);
