// The passports of the kinds of block (docs/LAYOUT-ENGINE-PLAN.md §4.4, E-4): how wide a kind may get, how tall it is at a width, whether
// its empty lines may hide, and whether it is a container. The engine reaches them only as ctx.kinds; a new kind adds a passport here and
// nothing else in the engine. Widths are card cells (the handle cell not counted); heights are rows, canonical and displayed.

/** @typedef {import('./shapes.js').Kind} Kind @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Measure} Measure */

/** The kind's own floors in card cells: a code block's header (MINW_CODE, 288 px today) and an area's, 12 cells; a text's, one cell. */
export const MINW_CODE = 12, MINW_AREA = 12;
/** A code block with no `ch` that is longer than CODE_FOLD_AT lines shows CODE_FOLD of them, as today (`COLLAPSE_AT`, `SHOW`, index.html). */
export const CODE_FOLD_AT = 14, CODE_FOLD = 12;

/** A text: content rows at its width, or its set height `ch` when larger (SIZE.6); temporary rows added on top. @type {Kind} */
const text = Object.freeze({
  width: 'text', hides: true, container: null,
  minCells: () => 1,
  rows(box, cells, m) { const r = m.rows(box.id, cells), rows = Math.max(r.rows, box.ch || 0); return { rows, shown: rows + (r.shown - r.rows) }; },
});

/** A code block: elastic as a text (W14), never narrower than its header; folded as today (SIZE.6's one fold): at `ch`, or with no `ch` at
 *  CODE_FOLD rows when it has more than CODE_FOLD_AT lines, unless `open`, with one row for «Розгорнути»; the fold counts the content's
 *  lines, which the measure gives, wrapped or not. Its lines wrap or scroll by its own `wrap`, which the measure reads. @type {Kind} */
const code = Object.freeze({
  width: 'text', hides: false, container: null,
  minCells: () => MINW_CODE,
  rows(box, cells, m) {
    const r = m.rows(box.id, cells), lines = r.lines ?? r.rows, lim = box.ch || (lines > CODE_FOLD_AT ? CODE_FOLD : Infinity);
    const fold = !box.open && lines > lim ? lim + 1 : r.rows;
    return { rows: fold, shown: fold + (r.shown - r.rows) };
  },
});

/** An area: its set width, at least 12 cells. Its header is measured at its width (today's header wraps on a narrow area); its height is
 *  the header plus the rows its children take, or its `ch` when larger, and the header alone when it is collapsed (AREA.2, §3.2 of the
 *  plan): `container.height` says so, the engine's recursion giving it the children's rows (LAYOUT-RULES §5.4, step 2). @type {Kind} */
const headerRows = (box, m) => m.rows(box.id, box.w - 1).rows;
const area = Object.freeze({
  width: 'set', hides: false,
  minCells: () => MINW_AREA,
  rows(box, cells, m) { const r = m.rows(box.id, cells); return { rows: r.rows, shown: r.shown }; },
  container: Object.freeze({ headerRows, height: (box, inner, m) => (box.collapsed ? headerRows(box, m) : Math.max(headerRows(box, m) + inner, box.ch || 0)) }),
});

/** Every kind of 0.1, keyed as Box.kind. @type {Readonly<Record<string, Kind>>} */
export const KINDS = Object.freeze({ text, code, area });
