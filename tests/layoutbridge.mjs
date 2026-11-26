// Node: the bridge, its pure part (public/layout/bridge.js; LAYOUT-ENGINE-PLAN §3.4, §3.5, §4.2; LAYOUT-SEAMS-PLAN §8).
//   1  reading the page's blocks: what is shown, the places and sizes as cells, the stored fields as read;
//   2  a note at rest opens to itself and has nothing to write; a repair of open() is shown, not written, until an action in its container;
//   3  a note that cannot be opened is in the safe mode: placement off, typing kept, no place written;
//   4  an action's write put on the page's blocks, and the page's blocks read again, give the fields the bridge keeps;
//   5  typing that is refused or fails: the text is the page's to save, no place of the result is written, the note goes safe;
//   6  one state of inputs for a gesture: its measurements are stable, a change of the Measure's inputs or from outside cancels it, a
//      stale result is not written;
//   7  histories of random actions with the page's blocks kept beside: after each, a fresh reading of them gives the bridge's fields;
//      and how many of those notes, opened afresh from the page's blocks, stand as the session left them (counted, reported).
//
//   node tests/layoutbridge.mjs [seed] [notes]

import * as B from '../public/layout/bridge.js';
import { createJournal, entriesOf, replay, encode } from '../public/layout/journal.js';
import { unshow, diff } from '../public/layout/layout.js';
import { validate } from '../public/layout/validate.js';
import { fxFromCol, rowFromY, SHEETW, MAXCELL } from '../public/layout/geometry.js';
import { KINDS } from '../public/layout/kinds.js';
import { DEFAULT, SETTINGS } from '../public/layout/rules.js';
import { stubMeasure } from './lib/measure.mjs';
import { draw } from './lab/undo-snapshot/histories.mjs';

let fails = 0;
const ok = (n, c, got) => { if (!c) fails++; console.log((c ? '✓ ' : '✗ ') + n + (c || got === undefined ? '' : ': ' + JSON.stringify(got).slice(0, 1100))); };
const str = (v) => JSON.stringify(encode(v)), flat = (m) => JSON.stringify([...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, f]) => [id, Object.keys(f).sort().map((k) => [k, f[k]])]));
const seed = +process.argv[2] || 1, N = +process.argv[3] || 60;
const envOf = (map, journal) => ({ ctx: { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: stubMeasure(map) }, ...(journal ? { journal } : {}) });
/** The measuring stub reads the page's blocks: their kind and text. */
const mapOf = (blocks) => Object.fromEntries(blocks.map((b) => [b.id, { kind: b.kind, text: b.text }]));
const T = (id, col, row, o = {}) => ({ id, text: 'x', fx: fxFromCol(col), row: rowFromY(row), ...o });
const places = (tree) => JSON.stringify([[null, tree], ...tree.areas].flatMap(([box, L]) => L.order.map((id) => { const b = L.boxes.get(id); return [box, id, b.col, b.y, b.w, b.h]; })).sort());
const pending = (note, env) => diff(note.doc.stored, unshow(note.doc.tree, env.ctx));
/** The page's side of a write: the place fields put on its blocks, a block made, taken away or brought back with its content. */
function page(blocks, write, bin, made) {
  let out = B.patched(blocks, write);
  for (const id of write.removed) { const b = out.find((x) => x.id === id); if (b) bin.set(id, b); }
  out = out.filter((b) => !write.removed.includes(b.id));
  for (const id of [...(write.restored || []), ...(made ? [made.id] : [])]) {
    if (out.some((b) => b.id === id)) continue;
    const base = made && made.id === id ? made : bin.get(id), b = { id, text: base.text, ...(base.kind ? { kind: base.kind } : {}) };
    out = B.patched([...out, b], { patch: new Map([[id, write.patch.get(id) || {}]]), removed: [] });
  }
  return out;
}

{ // 1
  const blocks = [
    T('A', 3, 4), { id: 'F', text: 'x', fx: fxFromCol(7) + 0.0001, row: 9.4 }, { id: 'N', text: 'x', fx: -0.2, row: -5 }, { id: 'E', text: '   ', fx: 0.1, row: 3 },
    { id: 'K', kind: 'code', text: 'a', fx: fxFromCol(20), row: 4, cw: 5.2, ch: 3.1, open: true }, { id: 'R', kind: 'area', text: '', fx: fxFromCol(30), row: 6, cw: 14, parent: 'Z', collapsed: true },
    { id: 'c', text: 'x', parent: 'R', col: 2.4, row: 1.6, cw: 4 }, { id: 'o', text: 'x', parent: 'gone', col: 9, row: 20 }, { id: 'd', text: 'x', parent: 'R', row: -1 },
  ];
  const r = B.read(blocks, KINDS), S = r.layout.boxes, R = r.layout.areas.get('R');
  ok('1 a sheet block: its column from its fx, its row less the sheet\'s first row; a fractional place rounded to the nearest cell', S.get('A').col === 3 && S.get('A').y === 4 && S.get('F').col === 7 && S.get('F').y === Math.round(9.4) - 2, [S.get('A'), S.get('F')]);
  ok('1a a place left of the sheet or above it is read at 0; a text with no content is not shown', S.get('N').col === 0 && S.get('N').y === 0 && !S.has('E') && !r.stored.has('E'), S.get('N'));
  ok('1b cw and ch rounded up to whole cells, cw at least the kind\'s minimum; open and collapsed kept', S.get('K').cw === 12 && S.get('K').ch === 4 && S.get('K').open === true && S.get('R').cw === 14 && S.get('R').collapsed === true && S.get('A').cw === undefined, S.get('K'));
  ok('1c an area has no parent; its children are its container\'s, at their col and row, rounded and at least 0; a child with no col is in column 0', r.layout.boxes.has('R') && R.boxes.get('c').col === 2 && R.boxes.get('c').y === 2 && R.boxes.get('d').col === 0 && R.boxes.get('d').y === 0 && !S.has('c'), [...R.boxes.values()]);
  ok('1d a block whose parent is no area of the note stands on the sheet, at the column it had', S.get('o').col === 9 && S.get('o').y === 18, S.get('o'));
  const st = r.stored;
  ok('1e the stored fields as read: a sheet block\'s fx and row as stored and the column its fx rounds to; a child\'s parent, col and row as stored; sizes as read here', st.get('F').row === 9.4 && st.get('F').col === 7 && st.get('F').fx === blocks[1].fx && st.get('N').col < 0 && st.get('N').row === -5 && st.get('c').col === 2.4 && st.get('c').row === 1.6 && st.get('c').parent === 'R' && st.get('K').cw === 12 && st.get('K').ch === 4 && st.get('o').parent === 'gone' && st.get('R').parent === 'Z', [...st]);
}

{ // 1f: a parent given and no col
  const r = B.read([{ id: 'o', text: 'x', parent: 'gone', fx: fxFromCol(9), row: 5 }, { id: 'R', kind: 'area', text: '', parent: 'Z', fx: fxFromCol(30), row: 6, cw: 14 }, { id: 'Q', kind: 'area', text: '', parent: 'Z', col: 7, fx: fxFromCol(12), row: 20, cw: 14 }, { id: 'k', text: 'x', parent: 'R', fx: fxFromCol(9), row: 1 }, { id: 'n', text: 'x', parent: 'gone', row: 9 }], KINDS);
  const S = r.layout.boxes;
  ok('1f a block with a dead parent and no col stands at the column its fx gives; an area with a parent stands by its fx, whatever col it carries; a child with no col is in column 0 whatever its fx; with neither, column 0', S.get('o').col === 9 && S.get('R').col === 30 && S.get('Q').col === 12 && r.layout.areas.get('R').boxes.get('k').col === 0 && S.get('n').col === 0, [S.get('o'), S.get('R'), S.get('Q'), S.get('n')]);
  ok('1g their stored fields keep the parent and what they had: the fx with the column it rounds to, or the col', r.stored.get('o').parent === 'gone' && r.stored.get('o').fx === fxFromCol(9) && r.stored.get('o').col === 9 && r.stored.get('R').parent === 'Z' && r.stored.get('R').col === 30 && r.stored.get('k').parent === 'R' && r.stored.get('k').col === 0 && !('fx' in r.stored.get('k')), [...r.stored]);
}

{ // 2
  const blocks = [T('A', 2, 3, { cw: 5 }), T('B', 2, 9, { cw: 5 }), { id: 'R', kind: 'area', text: '', fx: fxFromCol(24), row: rowFromY(4), cw: 14 }, { id: 'c', text: 'x', parent: 'R', col: 0, row: 0, cw: 4 }];
  const env = envOf(mapOf(blocks)), note = B.opened(blocks, env);
  ok('2 a note at rest: opened, not safe, valid, and nothing differs from its stored fields', !note.safe && validate(note.doc.tree, env.ctx).length === 0 && pending(note, env).size === 0, [...pending(note, env)]);
  const over = [T('A', 2, 3, { cw: 5 }), T('B', 2, 3, { cw: 5 }), T('C', 30, 3, { cw: 5 }), { id: 'P', text: 'x', parent: 'gone', col: 40, row: 8 }];
  const env2 = envOf(mapOf(over)), n2 = B.opened(over, env2), p2 = pending(n2, env2), low = ['A', 'B'].find((id) => n2.doc.tree.boxes.get(id).y > 3);
  ok(`2a two blocks stored on one cell, and a block with a dead parent: opened valid, ${low} shown a row lower; those repairs are what differs from the stored fields, and nothing is written yet`, !n2.safe && validate(n2.doc.tree, env2.ctx).length === 0 && !!low && p2.has(low) && p2.has('P') && 'parent' in p2.get('P') && p2.get('P').parent === undefined && !p2.has('C'), [...p2]);
  let c = B.carry(n2, { id: 'C', point: { x: 31.5, y: 3.3 } }, env2);
  c = B.moved(n2, c, { x: 45, y: 20 });
  const d = B.dropped(n2, c), after = page(over, d.write, new Map());
  ok('2b the first action on the sheet writes them with its own: the lowered row, the dead parent removed with an fx in its place', d.ok && d.write.patch.has('C') && d.write.patch.get(low).row === rowFromY(d.note.doc.tree.boxes.get(low).y) && after.find((b) => b.id === 'P').parent === undefined && !('col' in after.find((b) => b.id === 'P')) && 'fx' in after.find((b) => b.id === 'P') && pending(d.note, env2).size === 0, [...d.write.patch]);
  ok('2c and the page\'s blocks, read again, give the fields the bridge keeps', flat(B.read(after, KINDS).stored) === flat(d.note.doc.stored));
}

{ // 3
  const blocks = [T('A', 2, 3), { id: 'B', text: 'x', fx: 0.1, row: 1e20 }, T('C', 20, 3)], map = mapOf(blocks), env = envOf(map);
  const note = B.opened(blocks, env);
  ok('3 a row out of the engine\'s range: the note opens in the safe mode with the reason, every block shown, that one within the engine\'s range, and its stored row as stored', note.safe && note.errors.length === 1 && /range/.test(note.errors[0]) && note.doc.tree.boxes.size === 3 && note.doc.tree.boxes.get('A').y === 3 && note.doc.tree.boxes.get('B').y === MAXCELL && note.doc.stored.get('B').row === 1e20, note.doc.tree.boxes.get('B'));
  {
    const wild = [T('A', 2, 3), { id: 'B', text: 'x', fx: 0.1, row: 1e20, ch: 1e100, cw: 1e30 }, { id: 'R', kind: 'area', text: '', fx: fxFromCol(20), row: rowFromY(4), cw: 14 }, { id: 'c', text: 'x', parent: 'R', col: 1e15, row: 1e12, ch: 1e200 }];
    const n = B.opened(wild, envOf(mapOf(wild))), all = [...n.doc.tree.boxes.values(), ...n.doc.tree.areas.get('R').boxes.values()];
    const within = all.every((b) => [b.col, b.y, b.w, b.h, b.cw ?? 0, b.ch ?? 0].every((v) => Number.isFinite(v) && v >= 0 && v <= MAXCELL) && b.y + b.h <= MAXCELL && b.col + b.w <= MAXCELL + 2);
    ok('3\' a row of 1e20 with a height of 1e100, and a child at a column of 1e15 with a height of 1e200: safe, and everything shown, on the sheet and in the area, is a number within the engine\'s range; the stored fields keep the row and the child\'s place as stored', n.safe && within && n.doc.stored.get('B').row === 1e20 && n.doc.stored.get('c').col === 1e15 && n.doc.stored.get('c').row === 1e12, all.map((b) => [b.id, b.col, b.y, b.w, b.h]));
  }
  const off = [B.create(note, { id: 'N', kind: 'text', at: { col: 1, y: 1, w: 4 } }, env), B.enter(note, { id: 'A', to: 'R', at: { col: 0, y: 0 } }, env), B.undo(note, env)];
  ok('3a placement is off: a creation, a move into an area, an undo and a carry answer «safe» and write nothing', off.every((x) => x.ok === false && x.why === 'safe' && x.write === null && x.note === note) && B.carry(note, { id: 'A', point: { x: 3, y: 3 } }, env) === null);
  map.A = { text: 'x'.repeat(300) };
  const t = B.typed(note, { id: 'A' }, env);
  ok('3b typing stays: the text is the page\'s to save, the block is shown at its new height where it stands, the others where they stood, and no place is written', t.ok && t.content === true && t.write === null && t.note.safe && t.note.doc.tree.boxes.get('A').h > note.doc.tree.boxes.get('A').h && t.note.doc.tree.boxes.get('A').y === 3 && t.note.doc.tree.boxes.get('C').y === 3 && t.note.doc.stored === note.doc.stored);
  const r = B.remove(t.note, { id: 'C' }, env);
  ok('3c a deletion only takes the block away: named as removed, no place written, nothing moved', r.ok && r.write.removed.join() === 'C' && r.write.patch.size === 0 && !r.note.doc.tree.boxes.has('C') && !r.note.doc.stored.has('C') && r.note.doc.tree.boxes.get('B').y === t.note.doc.tree.boxes.get('B').y);
  {
    // an area in the safe mode: its frame is the header and its children as they now are
    const bl = [{ id: 'R', kind: 'area', text: '', fx: fxFromCol(10), row: rowFromY(4), cw: 14 }, { id: 'c', text: 'x', parent: 'R', col: 0, row: 0, cw: 4 }, { id: 'Z', text: 'x', fx: 0.1, row: 1e20 }, T('U', 12, 8)];
    const m = mapOf(bl), e = envOf(m), n = B.opened(bl, e), h0 = n.doc.tree.boxes.get('R').h;
    m.R = { kind: 'area', header: 7 };
    const t1 = B.typed(n, { id: 'R' }, e), h1 = t1.note.doc.tree.boxes.get('R').h;
    m.c = { text: 'x'.repeat(240) };
    const t2 = B.typed(t1.note, { box: 'R', id: 'c' }, e), h2 = t2.note.doc.tree.boxes.get('R').h, c2 = t2.note.doc.tree.areas.get('R').boxes.get('c');
    ok(`3e in the safe mode an area's frame is its header and its children as they now are: ${h0} rows as opened, ${h1} once its header takes 7, ${h2} once its child takes ${c2.h}; the area and the block under it stay where they stood, and nothing is written`, n.safe && h0 === 2 && h1 === 8 && c2.h === 20 && h2 === 7 + 20 && t2.note.doc.tree.boxes.get('R').y === n.doc.tree.boxes.get('R').y && t2.note.doc.tree.boxes.get('U').y === n.doc.tree.boxes.get('U').y && t1.write === null && t2.write === null && t2.note.doc.stored === n.doc.stored, { h0, h1, h2, c: c2.h });
  }
  const fixed = blocks.map((b) => (b.id === 'B' ? { ...b, row: 12 } : b)), again = B.outside(note, fixed, envOf(mapOf(fixed)));
  ok('3d the note read again with the value repaired opens placed', !again.safe && again.epoch === note.epoch + 1 && again.errors.length === 0);
}

{ // 4, 5
  const blocks = [T('A', 2, 3, { cw: 5 }), T('B', 2, 9, { cw: 5 }), T('C', 20, 3, { cw: 5 }), { id: 'R', kind: 'area', text: '', fx: fxFromCol(30), row: rowFromY(4), cw: 14 }, { id: 'c', text: 'x', parent: 'R', col: 0, row: 0, cw: 4 }];
  const map = mapOf(blocks), journal = createJournal(), env = envOf(map, journal), note = B.opened(blocks, env), bin = new Map();
  map.N = { text: 'new' };
  const c = B.create(note, { id: 'N', kind: 'text', at: { col: 2, y: 3, w: 6 }, set: { cw: 5 } }, env), b1 = page(blocks, c.write, bin, { id: 'N', text: 'new' });
  ok('4 a creation: the new block gets every place field it has, the block it pushed its row, a block it did not reach stays the same object; the page\'s blocks read again are the bridge\'s fields', c.ok && b1.length === 6 && b1.find((b) => b.id === 'N').cw === 5 && 'fx' in b1.find((b) => b.id === 'N') && b1.find((b) => b.id === 'A').row !== blocks[0].row && b1.find((b) => b.id === 'C') === blocks[2] && flat(B.read(b1, KINDS).stored) === flat(c.note.doc.stored), [...c.write.patch]);
  const r = B.remove(c.note, { id: 'R' }, env), b2 = page(b1, r.write, bin);
  const u = B.undo(r.note, env), b3 = page(b2, u.write, bin);
  ok('4a an area deleted with its child and the deletion undone: the page takes both away and brings both back with their content and their fields', r.ok && b2.length === 4 && u.ok && u.write.restored.join() === 'R,c' && b3.length === 6 && b3.find((b) => b.id === 'c').parent === 'R' && b3.find((b) => b.id === 'R').kind === 'area' && flat(B.read(b3, KINDS).stored) === flat(u.note.doc.stored) && u.note.doc.tree === c.note.doc.tree, b3);
  ok('4b a note opened afresh from the page\'s blocks stands as the bridge\'s does', places(B.opened(b3, env).doc.tree) === places(u.note.doc.tree) && places(B.opened(b1, env).doc.tree) === places(c.note.doc.tree));
  const e = B.enter(u.note, { id: 'Q', to: 'R', at: { col: 0, y: 3 } }, env);
  ok('4c an action that fails (no such block) writes nothing, and the note is the same; it is no change of content, so no safe mode', e.ok === false && e.why === 'failed' && e.write === null && e.note === u.note && !e.note.safe);
  // 5: typing refused, typing failed
  map.A = { text: 'x'.repeat(200) };
  const before = u.note, refusing = { ctx: env.ctx, journal: { run: () => ({ ok: false, why: 'refused' }) } };
  for (const [name, bad] of [['refused', refusing], ['failed', { ...env, ctx: { ...env.ctx, measure: { rows: (id, n) => { if (id === 'A') throw new Error('no measure'); return env.ctx.measure.rows(id, n); }, natural: env.ctx.measure.natural } } }]]) {
    const t = B.typed(before, { id: 'A' }, bad), same = [...before.doc.tree.boxes.values()].every((b) => { const n = t.note.doc.tree.boxes.get(b.id); return n && n.col === b.col && n.y === b.y; });
    ok(`5 typing that SETTLE ${name === 'refused' ? 'refuses' : 'fails on'}: the text is the page's to save, nothing is written, the stored fields are untouched, and the note is in the safe mode with every block where it stood`, t.ok === false && t.why === name && t.content === true && t.write === null && t.note.safe && t.note.doc.stored === before.doc.stored && same && t.note.doc.undo.length === 0 && t.note.errors.length === 1, { why: t.why, safe: t.note.safe });
    if (name === 'refused') {
      const shown = B.typed(t.note, { id: 'A' }, env);
      ok('5a in the safe mode the block is then shown at the height its content has, where it stands, over whatever is under it', shown.note.doc.tree.boxes.get('A').h > before.doc.tree.boxes.get('A').h && shown.note.doc.tree.boxes.get('A').y === before.doc.tree.boxes.get('A').y && shown.note.doc.tree.boxes.get('B').y === before.doc.tree.boxes.get('B').y && shown.write === null);
      const again = B.outside(t.note, b3.map((b) => (b.id === 'A' ? { ...b, text: map.A.text } : b)), env);
      ok('5b opened again with the saved text, the note is placed: the tall block where it was stored, the block under it lower', !again.safe && again.doc.tree.boxes.get('A').h > 1 && again.doc.tree.boxes.get('B').y >= again.doc.tree.boxes.get('A').y + again.doc.tree.boxes.get('A').h && validate(again.doc.tree, env.ctx).length === 0);
    }
  }
  map.A = { text: 'x' };
  ok('5c every command the engine was given through the journal replays', journal.entries().length > 3 && entriesOf(journal.export()).every((x) => replay(x, KINDS).same === true || Array.isArray(x.unfit)), journal.entries().length);
}

{ // 6
  const blocks = [T('A', 2, 3), T('B', 2, 9, { cw: 5 }), T('C', 20, 3, { cw: 5 })], map = mapOf(blocks);
  map.A = { text: 'x'.repeat(60) };
  const env = envOf(map), note = B.opened(blocks, env), p = { x: 3.5, y: 3.3 };
  let c = B.carry(note, { id: 'A', point: p }, env);
  c = B.moved(note, c, { x: 30, y: 12 });
  const h1 = B.preview(note, c).boxes.get('A').h;
  map.A = { text: 'x'.repeat(600) };   // a font loaded, a chip relabelled: the same block now measures taller
  const c2 = B.moved(note, c, { x: 30.4, y: 12.2 }), c3 = B.moved(note, c2, { x: 31, y: 14 });
  const fresh = B.opened(blocks, env).doc.tree.boxes.get('A').h, at = B.preview(note, c3).boxes.get('A');
  ok(`6 the measurements of a gesture are one state: A, ${h1} rows when it was picked up and ${fresh} to a new measure, is ${at.h} rows in every later preview of the carry`, h1 > 0 && fresh > h1 && B.preview(note, c2).boxes.get('A').h === h1 && at.h === h1 && at.y === 14);
  const f = B.frozen({ rows: (() => { let n = 0; return () => ({ rows: ++n, shown: n }); })(), natural: (() => { let n = 0; return () => ++n; })() });
  const given = { rows: 2, shown: 2 }, f2 = B.frozen({ rows: () => given, natural: () => 3 }), first = f2.rows('A', 5);
  given.rows = 99; first.rows = 77;
  ok('6a\' and keeps a copy: what is done later to the object it was given, or to an answer it gave, changes no answer', f2.rows('A', 5).rows === 2);
  ok('6a a frozen Measure answers a question once, each question its own', f.rows('A', 5).rows === 1 && f.rows('A', 5).rows === 1 && f.rows('A', 6).rows === 2 && f.rows('B', 5).rows === 3 && f.natural('A') === 1 && f.natural('A') === 1 && f.natural('B') === 2);
  const d = B.dropped(note, c3);
  ok('6b the drop writes the carry as it was shown', d.ok && d.write.patch.has('A') && d.note.doc.tree.boxes.get('A').y === 14 && d.note.doc.tree.boxes.get('A').h === h1);
  // the Measure's inputs change in the middle of a carry, and the next target asks a width not asked before
  for (const how of ['sign', 'version']) {
    const m2 = mapOf(blocks); m2.A = { text: 'x'.repeat(60) };
    let v = 1;
    const e2 = { ...envOf(m2), ...(how === 'sign' ? { sign: (id) => String((m2[id]?.text || '').length) } : { version: () => v }) }, n2 = B.opened(blocks, e2);
    let k = B.carry(n2, { id: 'A', point: p }, e2);
    k = B.moved(n2, k, { x: 30, y: 12 });
    const was = B.preview(n2, k);
    m2.A = { text: 'x'.repeat(600) }; v = 2;
    const k2 = B.moved(n2, k, { x: n2.doc.tree.cols - 0.5, y: 12 }), dk = B.dropped(n2, k2);
    ok(`6f the measured text changed in the middle of a carry, told by ${how === 'sign' ? 'the blocks\' signatures' : 'the Measure\'s version'}, and the pointer went on to the right edge, a width not asked before: the carry is stale, the move asks nothing, the note is shown as it is, and the drop writes nothing`, !!was && B.stale(n2, k) && k2.cancelled === true && k2.g === k.g && B.preview(n2, k2) === n2.doc.tree && dk.ok === false && dk.why === 'stale' && dk.write === null, { stale: B.stale(n2, k) });
  }
  // a change from outside
  let g = B.carry(note, { id: 'C', point: { x: 21.5, y: 3.3 } }, env);
  g = B.moved(note, g, { x: 40, y: 20 });
  const outside = B.outside(note, blocks.map((b) => (b.id === 'B' ? { ...b, row: rowFromY(30) } : b)), env);
  const g2 = B.moved(outside, g, { x: 42, y: 22 }), dg = B.dropped(outside, g2);
  ok('6c the note changed from outside during a carry: the carry is stale, its next move asks nothing and cancels it, the note is shown as it now is, and the drop writes nothing', B.stale(outside, g) && g2.cancelled === true && g2.g === g.g && B.preview(outside, g2) === outside.doc.tree && dg.ok === false && dg.why === 'stale' && dg.write === null && dg.note === outside);
  ok('6d even a drop with no move after the change writes nothing', B.dropped(outside, g).why === 'stale');
  // an action of this tab between
  let k = B.carry(note, { id: 'C', point: { x: 21.5, y: 3.3 } }, env);
  k = B.moved(note, k, { x: 40, y: 20 });
  map.B = { text: 'x'.repeat(90) };
  const typed = B.typed(note, { id: 'B' }, env);
  ok('6e a change of content in this tab during a carry makes it stale too: a result made for the old note is not written onto the new one', typed.ok && B.stale(typed.note, k) && B.dropped(typed.note, k).why === 'stale' && !B.stale(note, k));
}

{ // 7
  let notes = 0, actions = 0, written = 0, bad = 0, first = null, safeNotes = 0, undone = 0, moved = 0, firstOther = null;
  const re = [[0, 0], [0, 0]];   // [no temporary rows, with them] × [stands the same, stands otherwise]
  for (let i = 0; i < N; i++) {
    const h = draw(seed * 15485863 + i), map = JSON.parse(JSON.stringify(h.map));
    let blocks = [...h.note.boxes.values()].map((b) => ({ id: b.id, text: map[b.id].text ?? '', ...(b.kind !== 'text' ? { kind: b.kind } : {}), fx: fxFromCol(b.col), row: rowFromY(b.y), ...(b.cw != null ? { cw: b.cw } : {}), ...(b.ch != null ? { ch: b.ch } : {}), ...(b.open ? { open: true } : {}), ...(b.collapsed ? { collapsed: true } : {}) }));
    for (const [a, A] of h.note.areas) for (const b of A.boxes.values()) blocks.push({ id: b.id, text: map[b.id].text ?? '', ...(b.kind !== 'text' ? { kind: b.kind } : {}), parent: a, col: b.col, row: b.y, ...(b.cw != null ? { cw: b.cw } : {}), ...(b.ch != null ? { ch: b.ch } : {}), ...(b.open ? { open: true } : {}) });
    const journal = createJournal({ limit: 1e6 }), env = envOf(map, journal), bin = new Map();
    let note = B.opened(blocks, env, { cols: h.note.cols });
    if (note.safe) { safeNotes++; continue; }
    notes++;
    let s = (seed * 11 + i) >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296), int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const flag = (what) => { bad++; first = first || { note: i, what }; };
    for (let k = 0; k < 8 && !note.safe; k++) {
      const T0 = note.doc.tree, where = [[null, T0], ...T0.areas].filter(([, L]) => L.order.length), [box, L] = where[int(0, where.length - 1)] || [null, T0];
      const id = L.order[int(0, Math.max(0, L.order.length - 1))], q = rnd();
      let d = null, made = null;
      actions++;
      if (!id || q < 0.15) { made = { id: 'n' + i + '_' + k, text: 'x'.repeat(int(1, 40)) }; map[made.id] = { text: made.text }; d = B.create(note, { id: made.id, kind: 'text', at: { col: int(0, T0.cols - 6), y: int(0, 20), w: 6 } }, env); }
      else if (q < 0.25) d = B.remove(note, { box, id }, env);
      else if (q < 0.4 && map[id] && map[id].kind !== 'area') { const text = 'x'.repeat(int(1, 120)); map[id] = { ...map[id], text }; blocks = blocks.map((b) => (b.id === id ? { ...b, text } : b)); d = B.typed(note, { box, id }, env); }
      else {
        const b = L.boxes.get(id), a = box == null ? null : T0.boxes.get(box), o = a ? { x: a.col + 1, y: a.y + 1 } : { x: 0, y: 0 };
        let c = B.carry(note, { box, id, point: { x: o.x + b.col + 1.5, y: o.y + b.y + 0.3 } }, env);
        for (let m = 0, nm = int(1, 4); m < nm; m++) { c = B.moved(note, c, { x: int(0, T0.cols), y: int(0, 30) + rnd() }); moved++; }
        d = B.dropped(note, c);
      }
      const was = new Set(pending(note, env).keys());
      if (!d.ok) { if (d.write !== null) flag('a refused action has a write'); note = d.note; continue; }
      if (d.write) { written++; blocks = page(blocks, d.write, bin, made); }
      note = d.note;
      if (rnd() < 0.3 && note.doc.undo.length) { const u = B.undo(note, env); if (u.ok) { undone++; blocks = page(blocks, u.write, bin); note = u.note; } }
      if (flat(B.read(blocks, KINDS, h.note.cols).stored) !== flat(note.doc.stored)) { flag({ k, what: 'the page\'s blocks read again are not the fields the bridge keeps' }); break; }
      if (validate(note.doc.tree, env.ctx).length) flag({ invalid: validate(note.doc.tree, env.ctx)[0] });
      const left = [...pending(note, env).keys()].filter((x) => !was.has(x)); if (left.length) flag({ what: 'an action left a place unwritten that was not waiting before it', left });
    }
    if (!note.safe) {
      // opened afresh from the page's blocks, as a reload would: counted apart for the notes whose Measure gives temporary rows
      const again = B.opened(blocks, env, { cols: h.note.cols }), temp = Object.values(map).some((m) => m.temp), same = !again.safe && places(again.doc.tree) === places(note.doc.tree);
      re[temp ? 1 : 0][same ? 0 : 1]++;
      if (!same && !temp) firstOther = firstOther || { seed, note: i };
    }
  }
  {
    // the named case of what 7a counts (found by this test and narrowed by the independent review): a sheet of 34 columns, a text of
    // 20 characters created at column 28 with a width of 6. Reported, not repaired: it is layout.js's, and a question for step 3.
    const m = { N: { text: 'x'.repeat(20) } }, e = envOf(m), n0 = B.opened([], e, { cols: 34 });
    const c = B.create(n0, { id: 'N', kind: 'text', at: { col: 28, y: 3, w: 6 } }, e), bl = page([], c.write, new Map(), { id: 'N', text: m.N.text });
    const a = c.note.doc.tree.boxes.get('N'), b = B.opened(bl, e, { cols: 34 }).doc.tree.boxes.get('N');
    ok(`7b as built: a text created at the right edge stands at column ${a.col}, ${a.w} wide; the same note opened afresh shows it at column ${b.col}, ${b.w} wide (an elastic block's width is not stored)`, c.ok && a.col === 28 && a.w === 6 && b.col === 27 && b.w === 7 && c.note.doc.stored.get('N').cw === undefined, { a: [a.col, a.w], b: [b.col, b.w] });
  }
  ok(`7 ${notes} notes, ${actions} actions (${written} writes, ${undone} undos, ${moved} moves of carries) with the page's blocks kept beside: after each, a fresh reading of them gives the bridge's fields, the tree is valid and no action leaves a place unwritten that was not waiting before it`, notes > N / 2 && written > actions / 3 && undone > 10 && bad === 0, { bad, first, safeNotes });
  // Reported, not repaired here (open() is layout.js's): a note opened afresh from its stored fields does not always stand as the
  // session left it. With temporary rows that is G26 (a note opened with one is at rest with its first action). Without them the
  // stored fields do not hold an elastic block's width, and open() gives it the widest it gets by itself where the session had it
  // narrowed beside a neighbour, or at the right edge. Both are counted, and the second is bounded.
  ok(`7a opened afresh from the page's blocks at the end: of the ${re[0][0] + re[0][1]} notes with no temporary rows ${re[0][0]} stand as the bridge has them and ${re[0][1]} otherwise; of the ${re[1][0] + re[1][1]} with temporary rows, ${re[1][0]} and ${re[1][1]}`, re[0][0] + re[0][1] > 10 && re[0][1] <= (re[0][0] + re[0][1]) * 0.15 && re[1][0] > re[1][1], { re, firstOther });
}

process.exit(fails ? 1 : 0);
