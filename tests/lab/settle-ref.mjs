// A reference SETTLE for the commonest case (the architecture review of 0a262d7, RC5; LAYOUT-ENGINE-PLAN §5.2): a sheet of set widths
// opened fresh (every gap owned by the block above, GAP.1), the default rules, and a carry straight up or down within the block's columns,
// with no hold. Written from LAYOUT-RULES alone, sharing no code with public/layout/, so that what SETTLE gives can be stated and compared:
//   - the moved block X stands at its target (DRAG.A);
//   - every block that shares a column with X keeps the side it had in `start` (DRAG.B2), as every one stood in X's columns there;
//   - P-UP: a block above that reaches X goes up until its bottom meets X's top, the blocks over it going up as far as it needs, the gap
//     above each closing first; P-DOWN: a block below that reaches X sinks right under it;
//   - a block a primitive moved down pushes the blocks under it, which keep their gaps (FOLLOW downwards, push); nothing follows a block
//     up, and a block moved by nothing stays where it is, its gaps taking the change (GAP.5 rule 1, rule 5);
// A case outside that domain gives null: a block met from the side (DRAG.B3), a block P-UP cannot lift high enough, two blocks still hitting.
//
// The domain widened (docs/LAYOUT-SEAMS-PLAN.md §4.3, L2), on the same fresh sheets of set widths, each part with its border:
//   - a size (`referenceSize`): a block's height changes; every row is FOLLOW's (GAP.4): the blocks under it follow with their gaps
//     and come back when it shrinks. No border: FOLLOW leaves no hit;
//   - a deletion (`referenceRemove`, GAP.6): the block's own rows go with it, so in each of its columns the block under it follows
//     the block that stood above it, with the gap that one kept to the deleted block;
//   - a creation (`referenceCreate`): the new block at its cell. Every block it reaches there is judged there, once: one whose top
//     is above its own and that it cuts in the lower half is above it, and it goes under the lowest of those (G17: an insertion lifts
//     nothing); one whose top is at its top or lower is below it and sinks right under where it then stands (P-DOWN), the blocks
//     under that one following with their gaps. Outside: a block cut in its upper half (the judge of DRAG.B2 by the pointer's row is
//     not restated here), a block met from the side at the target, a block reached only where it then stands, a hit left;
//   - a carry away sideways (`referenceAway`, DRAG.B1): into columns it shares none of its own with; a deletion, then a creation at
//     the target on what the deletion left. Outside: what a creation leaves outside, and a target that still shares a column.

const card = (b, y = b.y) => ({ c0: b.col + 1, c1: b.col + b.w - 1, r0: y, r1: y + b.h - 1 });
const across = (p, q) => Math.max(0, Math.min(p.c1, q.c1) - Math.max(p.c0, q.c0) + 1);
const along = (p, q) => Math.max(0, Math.min(p.r1, q.r1) - Math.max(p.r0, q.r0) + 1);

/** @param {{id:string, col:number, y:number, w:number, h:number}[]} blocks the start, in any order @param {string} id the carried block
 *  @param {number} y its target row @returns {?Object<string, number>} every block's row, or null outside the domain */
export function referenceCarry(blocks, id, y) {
  const by = new Map(blocks.map((b) => [b.id, b])), X0 = by.get(id), row = new Map(blocks.map((b) => [b.id, b.y]));
  row.set(id, y);
  const at = (b) => card(b, row.get(b.id)), X = () => at(X0);
  const others = blocks.filter((b) => b.id !== id).sort((a, b) => a.y - b.y || a.col - b.col);
  // the chains of start: in each column, the block right above another
  const uppers = new Map(others.map((b) => [b.id, []]));
  for (const b of others) for (const a of others) {
    if (a === b || across(card(a), card(b)) === 0 || card(a).r1 >= card(b).r0) continue;
    const between = others.some((m) => m !== a && m !== b && across(card(m), card(a)) && across(card(m), card(b)) && card(m).r0 > card(a).r1 && card(m).r1 < card(b).r0
      && Math.max(card(a).c0, card(b).c0, card(m).c0) <= Math.min(card(a).c1, card(b).c1, card(m).c1));
    if (!between) uppers.get(b.id).push(a.id);
  }
  // DRAG.B3: a block met from the side is outside the domain (P-ASIDE)
  for (const b of others) { const p = card(b), q = X(); if (across(p, q) && along(p, q) && across(p, q) < along(p, q)) return null; }
  const above = others.filter((b) => across(card(b), card(X0)) && b.y < X0.y), below = others.filter((b) => across(card(b), card(X0)) && b.y > X0.y);
  // P-UP: each block above that reaches X, nearest first, then the blocks over it as far as each needs
  const lift = (b, top) => {
    if (top >= row.get(b.id)) return true;
    if (top < 0) return false;
    row.set(b.id, top);
    for (const u of uppers.get(b.id)) { const U = by.get(u); if (!lift(U, Math.min(row.get(u), top - U.h))) return false; }
    return true;
  };
  for (const b of [...above].sort((a, c) => c.y - a.y)) if (at(b).r1 >= X().r0 && !lift(b, X().r0 - b.h)) return null;
  // P-DOWN: each block below that reaches X sinks right under it; then every block pushed down pushes those under it, gaps kept
  const moved = new Set();
  for (const b of below) if (at(b).r0 <= X().r1) { row.set(b.id, X().r1 + 1); moved.add(b.id); }
  for (const b of others) {
    for (const u of uppers.get(b.id)) {
      if (!moved.has(u)) continue;
      const U = by.get(u), gap = card(b).r0 - card(U).r1 - 1, need = at(U).r1 + 1 + gap;
      if (need > row.get(b.id)) { row.set(b.id, need); moved.add(b.id); }
    }
  }
  const all = blocks.map((b) => at(b));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (across(all[i], all[j]) && along(all[i], all[j])) return null;
  return Object.fromEntries([...row].sort());
}

// ---- FOLLOW written apart, for the parts above: per card column the chain top to bottom, each block's gap to the one above it (from
// the top of the sheet for the first), a row the greatest that any of its columns gives
const colsOf = (b) => { const r = []; for (let c = b.col + 1; c <= b.col + b.w - 1; c++) r.push(c); return r; };
/** The chains of a sheet as it stands: Map<column, [{id, gap}]> top to bottom. */
function chains(blocks) {
  const by = new Map();
  for (const b of [...blocks].sort((p, q) => p.y - q.y)) for (const c of colsOf(b)) { if (!by.has(c)) by.set(c, []); by.get(c).push(b); }
  const out = new Map();
  for (const [c, list] of by) out.set(c, list.map((b, i) => ({ id: b.id, gap: i ? b.y - (list[i - 1].y + list[i - 1].h) : b.y })));
  return out;
}
/** The rows FOLLOW gives over chains, with these heights. */
function followRows(ch, height) {
  const row = new Map(), ids = new Set([...ch.values()].flatMap((l) => l.map((e) => e.id)));
  for (let guard = 0, changed = true; changed; guard++) {
    if (guard > 10000) throw new Error('reference: FOLLOW does not end');
    changed = false;
    for (const id of ids) {
      let y = 0, known = true;
      for (const list of ch.values()) {
        const i = list.findIndex((e) => e.id === id); if (i < 0) continue;
        if (i === 0) { y = Math.max(y, list[0].gap); continue; }
        const u = list[i - 1].id; if (!row.has(u)) { known = false; break; }
        y = Math.max(y, row.get(u) + height(u) + list[i].gap);
      }
      if (known && row.get(id) !== y) { row.set(id, y); changed = true; }
    }
  }
  return row;
}
const noHit = (blocks, row, h) => { const all = blocks.map((b) => card({ ...b, h: h(b.id) }, row.get(b.id))); for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (across(all[i], all[j]) && along(all[i], all[j])) return false; return true; };
const answer = (row) => Object.fromEntries([...row].sort());

/** A block's height changes to `h`. @returns {Object<string, number>} every block's row */
export function referenceSize(blocks, id, h) {
  const H = (k) => (k === id ? h : blocks.find((b) => b.id === k).h);
  return answer(followRows(chains(blocks), H));
}
/** The chains with a block taken away (GAP.6): the block under it in a column takes the gap it had to the block above it there. */
function without(ch, id) {
  const out = new Map();
  for (const [c, list] of ch) {
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) { out.set(c, list); continue; }
    const rest = list.filter((e) => e.id !== id).map((e) => ({ ...e }));
    if (i < rest.length) rest[i].gap = list[i].gap;
    if (rest.length) out.set(c, rest);
  }
  return out;
}
/** A block is deleted. @returns {Object<string, number>} the rows of those that stay */
export function referenceRemove(blocks, id) {
  const rest = blocks.filter((b) => b.id !== id);
  return answer(followRows(without(chains(blocks), id), (k) => rest.find((b) => b.id === k).h));
}
/** A new block X = {id, col, y, w, h} on the sheet `blocks`. Every block X reaches at its target is judged there, once: above X (its
 *  top above X's, cut in its lower half) or below. X goes under the lowest bottom of those above; those below sink right under where X
 *  then stands, reached there or not. `gaps`: the chains with the gaps the sheet remembers, when they are not those its rows show (after
 *  a deletion a block may stand lower than the gap it took over asks, held there by another column). @returns {?Object<string, number>} null outside the domain */
export function referenceCreate(blocks, X, gaps = chains(blocks)) {
  const q0 = card(X), side = new Map();
  for (const b of blocks) {
    const p = card(b); if (!across(p, q0) || !along(p, q0)) continue;
    if (across(p, q0) < along(p, q0)) return null;                    // met from the side
    if (b.y < X.y && 2 * (X.y - b.y) < b.h) return null;              // cut in its upper half: the judge is not restated here
    side.set(b.id, b.y < X.y ? 'above' : 'below');
  }
  const y = Math.max(X.y, ...blocks.filter((b) => side.get(b.id) === 'above').map((b) => b.y + b.h)), q = card(X, y);
  // where X then stands it reaches no block it did not judge at its target
  for (const b of blocks) if (!side.has(b.id) && across(card(b), q) && along(card(b), q)) return null;
  // the chains with X in them: over it the blocks judged above and those that end above it; under it, right under it, those judged
  // below, and the others with the rows they keep
  const ch = new Map();
  for (const [c, list] of gaps) ch.set(c, list.map((e) => ({ ...e })));
  const row0 = new Map(blocks.map((b) => [b.id, b.y])), h0 = new Map(blocks.map((b) => [b.id, b.h]));
  const over = (id) => side.get(id) === 'above' || (!side.has(id) && row0.get(id) + h0.get(id) <= y);
  for (const c of colsOf(X)) {
    const list = ch.get(c) || [];
    let at = list.findIndex((e) => !over(e.id)); if (at < 0) at = list.length;
    if (list.slice(at).some((e) => over(e.id))) return null;          // a block judged below would pass one that stays above
    const up = at ? list[at - 1] : null, gap = y - (up ? row0.get(up.id) + h0.get(up.id) : 0);
    if (gap < 0) return null;
    if (at < list.length) list[at] = { ...list[at], gap: Math.max(0, row0.get(list[at].id) - (y + X.h)) };
    list.splice(at, 0, { id: X.id, gap }); ch.set(c, list);
  }
  const all = [...blocks, { ...X, y }], H = (k) => (k === X.id ? X.h : h0.get(k));
  const row = followRows(ch, H);
  if (row.get(X.id) !== y || !noHit(all, row, H)) return null;
  return answer(row);
}
/** X carried away into columns it shares none of its own with, to (col, y). @returns {?Object<string, number>} null outside the domain */
export function referenceAway(blocks, id, col, y) {
  const X = blocks.find((b) => b.id === id);
  if (across(card(X), card({ ...X, col }))) return null;
  const left = referenceRemove(blocks, id), rest = blocks.filter((b) => b.id !== id).map((b) => ({ ...b, y: left[b.id] }));
  return referenceCreate(rest, { ...X, col, y }, without(chains(blocks), id));
}
