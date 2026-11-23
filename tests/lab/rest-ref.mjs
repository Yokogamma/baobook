// G24 (docs/LAYOUT-MODEL.md; LAYOUT-SEAMS-PLAN Q8): after every action every elastic block stands at its rest width. The rest width by
// a formula written apart, from LAYOUT-RULES SIZE.1, SIZE.4 and SIZE.6 alone, sharing no code with public/layout/ (no passport, no
// geometry, no size.js): the widest width, from min(natural width, TEXTW) and the container's right edge down, that is no wider than the
// room the block has on the rows it shows at that width; never narrower than min(natural width, MINC) and its kind's floor, nor past
// the container's last column. The room ends at the handle cell of the nearest block to its right that shares a row with it, an
// area's rows counted with the free row above its frame and the one below. The rows a block shows are the measure's at that width,
// its set height when larger, a code block's fold, and its own temporary rows (`tx`).

const FLOOR = { text: 1, code: 12 }, FOLD_AT = 14, FOLD = 12;
const elastic = (b) => (b.kind === 'text' || b.kind === 'code') && b.cw == null;

/** The rows `b` shows at `cells`. */
function shownRows(b, cells, measure) {
  const r = measure.rows(b.id, cells), temp = r.shown - r.rows;
  let rows;
  if (b.kind === 'code') { const lines = r.lines ?? r.rows, lim = b.ch || (lines > FOLD_AT ? FOLD : Infinity); rows = !b.open && lines > lim ? lim + 1 : r.rows; }
  else rows = Math.max(r.rows, b.ch || 0);
  return rows + temp + (b.tx || 0);
}
/** The rest width of an elastic block of a container, in card cells. @param {{cols:number, boxes:Map<string, object>}} L */
export function restRef(L, b, measure, settings) {
  const natural = measure.natural(b.id), inside = Math.max(1, L.cols - (b.col + 1));
  const floor = Math.min(inside, Math.max(FLOOR[b.kind], Math.min(natural, settings.MINC)));
  const cap = Math.max(FLOOR[b.kind], Math.min(natural, settings.TEXTW));
  const room = (cells) => {
    const top = b.y, bottom = b.y + shownRows(b, cells, measure) - 1;
    let edge = L.cols;
    for (const o of L.boxes.values()) {
      if (o.id === b.id || o.col <= b.col) continue;
      const t = o.kind === 'area' ? o.y - 1 : o.y, u = o.kind === 'area' ? o.y + o.h : o.y + o.h - 1;
      if (t <= bottom && top <= u) edge = Math.min(edge, o.col);
    }
    return edge - (b.col + 1);
  };
  for (let w = Math.min(cap, inside); w > floor; w--) if (w <= room(w)) return w;
  return floor;
}
/** Every elastic block of every container of a tree against the formula. @returns {string[]} */
export function restAgainstRef(tree, measure, settings) {
  const errs = [];
  for (const [name, L] of [[null, tree], ...tree.areas]) for (const b of L.boxes.values()) {
    if (!elastic(b)) continue;
    const w = restRef(L, b, measure, settings);
    if (b.w - 1 !== w) errs.push(`${name ?? 'sheet'}: ${b.id} is ${b.w - 1} cells wide, its rest width is ${w}`);
  }
  return errs;
}
