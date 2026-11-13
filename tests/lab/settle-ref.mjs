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
