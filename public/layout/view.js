// The page's side of the slice that touches a document (LAYOUT-ENGINE-PLAN §4.3, §6; LAYOUT-SEAMS-PLAN §8.1, S5d-2): what a block
// measures, read from a hidden copy of its own element, its measurement signature, and the blocks drawn where a Layout has them.
// First version, for the narrow slice: no scale, no narrow view, no looks; those are step 4's. Everything of the page it needs
// comes through `host`, so nothing here reaches for a global.
//
// The page's cells. A block's element starts at its handle cell; its card is `cl` pixels to the right and a whole number of cells
// wide. On the sheet the page counts columns from 1 and rows from 2 (`cMinCol`, `cMinRow`), the engine from 0 (§3.1); in an area
// both count from 0. The sheet is as wide as the width the stored `fx` is read at (W0PX at the default text size), so the page's
// own conversion of `fx` gives the engine's column.

import { SHEET_ROW0, W0PX, G } from './geometry.js';

/** @typedef {import('./shapes.js').Layout} Layout
 *  @typedef {{id:string, kind?:string, el:HTMLElement, card:HTMLElement, txt?:HTMLElement, abody?:HTMLElement, parent?:string, cw?:number, ch?:number,
 *             collapsed?:boolean, w?:number, lines?:number, at?:number, innerW?:number, vcol?:number, vrow?:number}} PageBlock
 *    // a block object of index.html, as far as this module reads and writes it: `vcol`, `vrow`, the cell it is shown at in the
 *    // page's own counting, `w` and `lines`, its width in pixels and its rows, which the page's other code reads
 *  @typedef {{sheet:HTMLElement, blocks():PageBlock[], px():{g:number, cl:number}, left(col:number, area:?PageBlock):number,
 *             top(row:number, area:?PageBlock):number, plain(b:PageBlock):void}} ViewHost
 *    // px: the cell and the handle's width in pixels now; left, top: a cell's corner in its container; plain: the page's own
 *    // drawing of a block the engine does not hold (an empty text being started) */

/** Whether a block's title is the element that is held: the one state of focus a measurement reads, so `sign` and the copy that is
 *  measured ask this one question. */
const titleHeld = (b) => { const t = b.card.querySelector('.ctitle'); return !!t && t === b.el.ownerDocument.activeElement; };
/** A title's state as the page's styles tell it: held or not, and empty as `:empty` has it (no node at all: a title emptied by
 *  the keyboard may keep a `<br>`, which is not empty to a style). The copy measured and the signature both read this. */
const titleState = (b) => { const t = b.card.querySelector('.ctitle'); return (titleHeld(b) ? 'h' : '-') + (t && t.firstChild ? 'f' : 'e'); };
const cardOf = (el) => el.querySelector('.tcard,.cblk,.ablk');
/** A copy of a block's element to measure: an area's without its children, which its header's height does not read. */
function copyOf(b) {
  if (b.kind !== 'area') return b.el.cloneNode(true);
  const c = b.el.cloneNode(false);
  for (const k of b.el.children) {
    if (k !== b.card) { c.appendChild(k.cloneNode(true)); continue; }
    const card = k.cloneNode(false);
    for (const q of k.children) card.appendChild(q.cloneNode(q !== b.abody));
    c.appendChild(card);
  }
  return c;
}

/** The page's `probe` and `sign` for measure.js. A block is measured on a hidden copy of its own element, in its own container, so
 *  the classes, the content as rendered and the page's text size are the block's; a width in cells is the card's.
 *  - a text: its content's rows (the page's own rounding), with no set height; its natural width, its longest line;
 *  - a code block: its card as it now shows (its header, its lines, folded or not, unfolded while it is edited: the fold is the
 *    page's own in this slice, so the probe says one line and the passport folds nothing; proposed);
 *  - an area: its header.
 *  @param {ViewHost} host @returns {{probe:import('./measure.js').Probe, sign:(id:string)=>string}} */
export function probeOf(host) {
  const find = (id) => host.blocks().find((b) => b.id === id);
  function measured(b, cells, read) {
    const { g, cl } = host.px(), c = copyOf(b), card = cardOf(c), s = c.style;
    c.setAttribute('aria-hidden', 'true'); c.classList.remove('drag', 'lift', 'sel');
    s.visibility = 'hidden'; s.pointerEvents = 'none'; s.transition = 'none'; s.left = '0'; s.top = '0'; s.maxWidth = 'none';
    s.width = cells == null ? 'max-content' : cl + cells * g + 'px';
    card.style.width = cells != null && (b.cw || b.kind === 'area') ? cells * g + 'px' : '';
    card.style.maxWidth = cells == null ? 'none' : '';
    // a title that is held is laid out as one with text (the page's styles give `:focus` and `:not(:empty)` the same sizes), and a
    // copy is never focused: an empty title held on the page gets a character no one sees in the copy
    if (titleState(b) === 'he') card.querySelector('.ctitle').textContent = '\u200b';
    // in its own container, unless that is not laid out (the body of a collapsed area): nothing there has a size
    const home = b.el.parentNode;
    (home && home.offsetParent !== null ? home : host.sheet).appendChild(c);
    try { return read(c, card, g); } finally { c.remove(); }
  }
  const empty = (b) => !b.kind && !(b.txt && b.txt.textContent.replace(/​/g, '').trim());
  return {
    probe: {
      rows(id, cells) {
        const b = find(id);
        if (!b) return { height: NaN };
        return measured(b, cells, (c, card, g) => {
          if (b.kind === 'code') return { height: card.offsetHeight - 2, lines: 1 };
          if (b.kind === 'area') return { height: card.querySelector('.cbar').offsetHeight + 1 };
          const t = c.querySelector('.txt'); t.style.minHeight = '';
          return { height: Math.max(1, Math.round(t.offsetHeight / g)) * g };
        });
      },
      natural(id) {
        const b = find(id);
        if (!b) return NaN;
        if (empty(b)) return 0;   // a placeholder is never measured (PR-8)
        if (b.kind === 'area') return (b.cw || 0) * host.px().g;
        return measured(b, null, (c, card) => card.offsetWidth);
      },
    },
    /** What a block's measurement reads besides the width: its content as rendered (chips with their labels) and its own options
     *  as its element shows them. The text size and the fonts are the Measure's epoch. */
    sign(id) {
      const b = find(id);
      if (!b) return 'gone';
      if (!b.kind) return 't\u0001' + b.txt.innerHTML;
      const bar = b.card.querySelector('.cbar'), held = titleState(b);
      if (b.kind === 'area') return ['a', b.card.className, held, bar.textContent].join('\u0001');
      const pre = b.card.querySelector('.code'), more = b.card.querySelector('.more');
      return ['c', b.card.className, held, bar.textContent, pre.style.height, more.hidden ? 0 : 1, more.textContent, pre.textContent].join('\u0001');
    },
  };
}

/** The sheet as wide as the width the stored `fx` is read at, at the page's text size (§3.1). */
export function sheetWidth(host) { host.sheet.style.width = W0PX * host.px().g / G + 'px'; }

/** Every block of the page where the Layout has it: its place, its width, and the sizes an area's and a text's elements are given.
 *  A block the Layout does not hold is drawn by the page as it always was. An area before its children, whose rows start under its
 *  header. @param {Layout} tree @param {ViewHost} host */
export function draw(tree, host) {
  const { g, cl } = host.px(), all = host.blocks(), by = new Map(all.map((b) => [b.id, b]));
  const place = (b, box, area) => {
    const col = area ? box.col : box.col + 1, row = area ? box.y : box.y + SHEET_ROW0, s = b.el.style;
    b.vcol = col; b.vrow = row; b.lines = box.h; b.w = cl + (box.w - 1) * g;
    s.left = host.left(col, area) + 'px'; s.top = host.top(row, area) + 'px'; s.width = b.w + 'px';
    b.card.style.width = b.cw ? b.w - cl + 'px' : '';
    b.card.classList.toggle('sized', !!b.cw);
    if (!b.kind) b.txt.style.minHeight = b.ch ? b.ch * g + 'px' : '';
    if (b.kind === 'area') {
      const barH = b.card.querySelector('.cbar').offsetHeight;
      b.innerW = b.abody.clientWidth || (b.w - cl - 1);
      b.at = (g - (barH + 1) % g) % g;   // the children's rows on the sheet's rows
      if (b.collapsed) b.card.style.height = box.h * g - 2 + 'px';
      else { b.card.style.height = ''; b.abody.style.height = box.h * g - barH - 2 + 'px'; }
    }
  };
  const seen = new Set();
  for (const id of tree.order) { const b = by.get(id); if (b) { place(b, tree.boxes.get(id), null); seen.add(b); } }
  for (const [a, A] of tree.areas || []) {
    const area = by.get(a);
    if (!area) continue;
    for (const id of A.order) { const b = by.get(id); if (b) { place(b, A.boxes.get(id), area); seen.add(b); } }
  }
  for (const b of all) if (!seen.has(b)) { delete b.vcol; delete b.vrow; host.plain(b); }
}

/** A text given to the person as a file. */
export function save(doc, name, text) {
  const a = doc.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.href = url; a.download = name; doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
