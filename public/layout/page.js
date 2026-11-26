// The slice on the page (LAYOUT-SEAMS-PLAN §8.1, S5d-2; LAYOUT-ENGINE-PLAN §6): the one object index.html calls where it lays a note
// out, when the switch «Нова розкладка (0.1)» is on. It holds the open note as the engine has it, the app's Measure and the action
// journal, asks the bridge what to make of the page's blocks after each of the page's commands, puts the write on them and draws.
//
// The page keeps its own commands. It changes its blocks as it always did (a keystroke, a block made or taken away, a menu's
// command) and then calls `settle`; `bridge.page` says what that was for the engine: nothing, a change of content, a creation, a
// deletion, or anything else, after which the note is read and opened again. So a command this slice has no action for still ends
// in a valid layout, and no stored field is written but by an action's `diff`.
//
// Not here yet (S5d-2b): the carry, entering and leaving an area by a command, and the engine's undo entries.

import * as B from './bridge.js';
import { createMeasure } from './measure.js';
import { createJournal } from './journal.js';
import { KINDS } from './kinds.js';
import { DEFAULT, SETTINGS } from './rules.js';
import { PLACE_FIELDS } from './shapes.js';
import { SHEETW, colFromFx } from './geometry.js';
import { probeOf, draw, sheetWidth, save } from './view.js';

/** @typedef {import('./view.js').ViewHost & {build:number|string, ro():boolean, dirty():void, grow():void, safe(on:boolean, errors:string[]):void}} Host
 *    // ro: nothing of the note may be written now (the trash, a version shown, a lock); dirty: the note changed, save it; grow: the
 *    // sheet's height after a draw; safe: the note went into, or out of, the safe mode */

/** @param {Host} host */
export function start(host) {
  const doc = host.sheet.ownerDocument, { probe, sign } = probeOf(host);
  // a block's signature is read from its element once for a command: the Measure asks for it with every answer
  let memo = new Map(), M = null, cell = 0, note = null, hold = 0, safe = false;
  const measure = () => {
    cell = host.px().g;
    M = createMeasure({ probe, sign: (id) => { if (!memo.has(id)) memo.set(id, sign(id)); return memo.get(id); }, cell });
  };
  measure(); sheetWidth(host);
  const journal = createJournal({ limit: 300, versions: { build: String(host.build) } });
  const env = () => ({ ctx: { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: M }, journal, sign: M.sign, version: M.version });
  const live = () => host.blocks().filter((b) => b.id && !b.hidden);

  /** A write put on the page's blocks: the place fields and nothing else. A sheet block's own column follows its `fx`. */
  function put(write) {
    let any = false;
    if (!write) return any;
    for (const [id, p] of write.patch) {
      const b = host.blocks().find((x) => x.id === id);
      if (!b) continue;
      for (const f of PLACE_FIELDS) if (f in p) { b[f] = p[f]; any = true; }
      if (!b.parent && b.fx != null) b.col = colFromFx(b.fx) + 1;
    }
    return any;
  }
  function show() {
    draw(note.doc.tree, host); host.grow();
    if (note.safe !== safe) { safe = note.safe; host.safe(safe, note.errors); }
  }
  /** The note read from the page and opened: at the start, and after anything the engine was not told as an action. Nothing is written. */
  function reopen() {
    memo = new Map();
    note = note ? B.outside(note, live(), env(), { cols: SHEETW }) : B.opened(live(), env(), { cols: SHEETW });
    show();
  }
  /** After a command of the page. `changed`: the block whose content or own options it changed. Whatever happens here, the page's
   *  command goes on: what was typed is the page's to save (seams plan §8), so an error is reported and the note opened again. */
  function settle(changed) {
    if (hold) return;
    try { settled(changed); } catch (e) {
      console.error('layout: a command was not settled', e);
      try { reopen(); } catch (e2) { console.error('layout: the note was not opened', e2); }
    }
  }
  function settled(changed) {
    if (!note || host.ro()) return reopen();   // view-only: shown, never written
    memo = new Map();
    const id = (changed && changed.id) || null;
    if (id) M.changed(id);
    const r = B.page(note, live(), env(), { changed: id, cols: SHEETW });
    note = r.note;
    const wrote = put(r.write);
    show();
    if (wrote) host.dirty();
  }
  /** Several commands of the page as one: the note is opened once when they end (a note drawn block by block). */
  function batch(fn) {
    hold++;
    try { return fn(); } finally { hold--; if (!hold) reopen(); }
  }
  /** What every measurement reads changed (the text size, a font): measured anew and opened again, nothing written. */
  function remeasure() {
    if (host.px().g !== cell) measure(); else M.invalidate();
    sheetWidth(host);
    if (note && !hold) reopen();
  }
  if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', remeasure);

  return {
    settle, batch, reopen, remeasure,
    /** The action journal as a file: ids, kinds and numbers, no content of a note. */
    exportJournal() { save(doc, 'baobook-layout-journal-' + host.build + '.json', journal.export()); },
    journal: () => journal,
    /** For the scenarios: the note as the engine holds it. */
    note: () => note,
    measure: () => M,
  };
}
