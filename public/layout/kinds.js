// The passports of the kinds of block (docs/LAYOUT-ENGINE-PLAN.md §4.4, E-4): how wide a kind may get, how tall it is at a width, whether
// its empty lines may hide, and whether it is a container. The engine reaches them only as ctx.kinds; a new kind adds a passport here and
// nothing else in the engine. Widths are card cells (the handle cell not counted); heights are rows, canonical and displayed.

/** @typedef {import('./shapes.js').Kind} Kind @typedef {import('./shapes.js').Box} Box @typedef {import('./shapes.js').Measure} Measure */

/** The kind's own floors in card cells: a code block's header (MINW_CODE, 288 px today) and an area's, 12 cells; a text's, one cell. */
export const MINW_CODE = 12, MINW_AREA = 12;

/** A text: content rows at its width, or its set height `ch` when larger (SIZE.6); temporary rows added on top. @type {Kind} */
const text = Object.freeze({
  width: 'text', hides: true, container: null,
  minCells: () => 1,
  rows(box, cells, m) { const r = m.rows(box.id, cells), rows = Math.max(r.rows, box.ch || 0); return { rows, shown: rows + (r.shown - r.rows) }; },
});

/** A code block: elastic as a text (W14), never narrower than its header; folded at `ch` unless `open`, with one row for «Розгорнути»
 *  when its content is longer (SIZE.6's one fold, as today). Its lines wrap or scroll by its own `wrap`, which the measure reads. @type {Kind} */
const code = Object.freeze({
  width: 'text', hides: false, container: null,
  minCells: () => MINW_CODE,
  rows(box, cells, m) {
    const r = m.rows(box.id, cells), fold = box.ch && !box.open && r.rows > box.ch ? box.ch + 1 : r.rows;
    return { rows: fold, shown: fold + (r.shown - r.rows) };
  },
});

/** An area: its set width, at least 12 cells; the passport gives only its header, measured at its width (today's header wraps on a narrow
 *  area); its height is its children's layout plus the header, or its `ch` when larger, from the engine's recursion (LAYOUT-RULES §5.4). @type {Kind} */
const area = Object.freeze({
  width: 'set', hides: false,
  minCells: () => MINW_AREA,
  rows(box, cells, m) { const r = m.rows(box.id, cells); return { rows: r.rows, shown: r.shown }; },
  container: Object.freeze({ headerRows: (box, m) => m.rows(box.id, box.w - 1).rows }),
});

/** Every kind of 0.1, keyed as Box.kind. @type {Readonly<Record<string, Kind>>} */
export const KINDS = Object.freeze({ text, code, area });
