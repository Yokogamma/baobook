// The Measure of the app (LAYOUT-ENGINE-PLAN §4.3, LAYOUT-SEAMS-PLAN §8): the answers of the page's measuring elements as the engine
// reads them, cells and rows, kept by a measurement signature. No DOM here: the page gives `probe`, which fills a hidden element and
// reads pixels, and `sign`, the signature of a block's content as rendered; so the rules of the cache and the conversion are tested
// in Node, and the wiring into index.html is the only part that touches a document.
//
// One state of inputs (seams plan §8). Everything a measurement reads besides the block's own signature (a font that loaded, the text
// size, the text placement) is the Measure's epoch, raised by `invalidate()`; a block's signature covers its own content, chips with
// their labels included, and the page says `changed(id)` when it changes (typing, a relabelled chip). `version()` is the epoch and
// the count of those changes, one value for «what the Measure reads»: a carry holds it (bridge.js), and the journal keeps it with
// the answers of a command. A signature found changed with no word from the page counts too, when it is found, so a change the
// page forgot to tell still makes a carry stale and a journal entry unfit, never a silent answer for another content.

/** @typedef {import('./shapes.js').Measure} Measure
 *  @typedef {{rows(id:string, cells:number):{height:number, extra?:number, lines?:number}, natural(id:string):number}} Probe
 *    // the page's side, in pixels: a block's height at a card width of `cells`, the temporary part shown on top of it (`extra`), its
 *    // content's lines; its natural width. A placeholder is never measured (PR-8): the page answers 0 for an empty block.
 *  @typedef {Measure & {version():string, sign(id:string):string, changed(id:string):void, invalidate():void, stats():{asked:number, probed:number, kept:number}}} AppMeasure */

/** @param {{probe:Probe, sign:(id:string)=>string, cell:number, keep?:number}} o `cell`, the pixels of one cell; `keep`, the answers
 *  kept at most, after which the oldest epoch's are dropped whole. @returns {AppMeasure} */
export function createMeasure({ probe, sign, cell, keep = 4000 }) {
  if (!(Number.isFinite(cell) && cell > 0)) throw new Error('measure: no cell size');
  let epoch = 1, changes = 0, asked = 0, probed = 0;
  let rows = new Map(), natural = new Map();
  const seen = new Map();   // id → the signature it was last measured with
  /** A length in pixels as whole cells, rounded up, at least `min`; what is no length is a failure of the page's side, told as one. */
  const cells = (px, min, what, id) => { if (!Number.isFinite(px) || px < 0) throw new Error(`measure: ${what} of ${id} is no length`); return Math.max(min, Math.ceil(px / cell - 1e-6)); };
  const signed = (id) => { const s = String(sign(id)); if (seen.get(id) !== s) { if (seen.has(id)) changes++; seen.set(id, s); } return s; };
  const state = () => epoch + '.' + changes;
  const room = () => { if (rows.size + natural.size > keep) { rows = new Map(); natural = new Map(); } };
  return Object.freeze({
    rows(id, n) {
      asked++;
      const k = signed(id) + '\u0000' + n;
      if (rows.has(k)) return { ...rows.get(k) };
      room(); probed++;
      // an answer is kept only when what the Measure reads is, after the page answered, what it was when it was asked: a font that
      // loads while the page measures leaves the answer for this question, given, and no answer for the next one
      const was = state(), p = probe.rows(id, n), r = cells(p.height, 1, 'the height', id), x = p.extra == null ? 0 : cells(p.extra, 0, 'the temporary height', id);
      const a = { rows: r, shown: r + x, lines: p.lines == null ? r : cells(p.lines * cell, 1, 'the lines', id) };
      if (state() === was) rows.set(k, a);
      return { ...a };
    },
    natural(id) {
      asked++;
      const k = signed(id);
      if (natural.has(k)) return natural.get(k);
      room(); probed++;
      const was = state(), a = cells(probe.natural(id), 1, 'the natural width', id);
      if (state() === was) natural.set(k, a);
      return a;
    },
    /** A block's measurement signature with the epoch: what ops.js's exact undo and bridge.js's carry compare. */
    sign: (id) => epoch + '\u0000' + String(sign(id)),
    /** What the Measure reads, as one value: it changes with every `invalidate()`, every `changed(id)`, and when a block is found
     *  with another signature than it was last measured with. Digits and a dot only, so the journal can keep it. */
    version: state,
    /** A block's content changed (typing, a chip relabelled, a fold of its own): said before the change is settled, so that the
     *  command that settles it has one version from its start to its end. */
    changed(id) { changes++; seen.delete(id); },
    /** Something every measurement reads changed (a font loaded, the text size, the text placement): no answer is kept, and no
     *  signature either, a page's signature having the font and the text size in it: the first measurement of the new epoch is
     *  no change of its own. */
    invalidate() { epoch++; rows = new Map(); natural = new Map(); seen.clear(); },
    stats: () => ({ asked, probed, kept: rows.size + natural.size }),
  });
}
