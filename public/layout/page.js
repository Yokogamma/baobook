// The slice on the page (LAYOUT-SEAMS-PLAN §8.1, S5d-2; LAYOUT-ENGINE-PLAN §6): the one object index.html calls where it lays a note
// out, when the switch «Нова розкладка (0.1)» is on. It holds the open note as the engine has it, the app's Measure and the action
// journal, asks the bridge what to make of the page's blocks after each of the page's commands, puts the write on them and draws.
//
// The page keeps its own commands. It changes its blocks as it always did (a keystroke, a block made or taken away, a menu's
// command) and then calls `settle`; `bridge.page` says what that was for the engine: nothing, a change of content, a creation, a
// deletion, or anything else, after which the note is read and opened again. So a command this slice has no action for still ends
// in a valid layout, and no stored field is written but by an action's `diff`.
//
// The engine's own actions are the carry, «В область» and «З області» (S5d-2b). Each gives the page a token of its undo entry; the
// page keeps it in its own stack and hands it back. Only the exact undo is here (seams plan §8): once anything else happened to
// the note, the engine's entries are dropped and the page is told (`host.stale`), so its stack holds no entry that cannot be undone.

import * as B from './bridge.js';
import { createMeasure } from './measure.js';
import { createJournal } from './journal.js';
import { KINDS } from './kinds.js';
import { DEFAULT, SETTINGS } from './rules.js';
import { PLACE_FIELDS } from './shapes.js';
import { SHEETW, colFromFx } from './geometry.js';
import { probeOf, draw, sheetWidth, save, cellsAt } from './view.js';

/** @typedef {import('./view.js').ViewHost & {build:number|string, ro():boolean, dirty():void, grow():void, safe(on:boolean, errors:string[]):void, stale():void}} Host
 *    // ro: nothing of the note may be written now (the trash, a version shown, a lock); dirty: the note changed, save it; grow: the
 *    // sheet's height after a draw; safe: the note went into, or out of, the safe mode; stale: the engine's undo entries are gone,
 *    // the page drops those it holds */

/** @param {Host} host */
export function start(host) {
  const doc = host.sheet.ownerDocument, { probe, sign } = probeOf(host);
  // a block's signature is read from its element once for a command: the Measure asks for it with every answer
  let memo = new Map(), M = null, cell = 0, note = null, hold = 0, safe = false, held = null;   // held: the carry in the hand
  const measure = () => {
    cell = host.px().g;
    M = createMeasure({ probe, sign: (id) => { if (!memo.has(id)) memo.set(id, sign(id)); return memo.get(id); }, cell });
  };
  measure(); sheetWidth(host);
  const journal = createJournal({ limit: 300, versions: { build: String(host.build) } });
  const env = () => ({ ctx: { rules: DEFAULT, settings: SETTINGS, kinds: KINDS, measure: M }, journal, sign: M.sign, version: M.version });
  const live = () => host.blocks().filter((b) => b.id && !b.hidden);
  /** Before a command: the signatures read afresh, and those that changed with no word from the page counted now. */
  const look = () => { memo = new Map(); M.look(live().map((b) => b.id)); };

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
  /** The engine's undo entries dropped: they are of a note that has changed since. */
  function forget() { if (note.doc.undo.length) note = { ...note, doc: { ...note.doc, undo: [] } }; host.stale(); }
  /** The note read from the page and opened: at the start, and after anything the engine was not told as an action. Nothing is written. */
  function reopen() {
    memo = new Map();
    note = note ? B.outside(note, live(), env(), { cols: SHEETW }) : B.opened(live(), env(), { cols: SHEETW });
    host.stale();
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
    look();
    const id = (changed && changed.id) || null;
    if (id) M.changed(id);
    const r = B.page(note, live(), env(), { changed: id, cols: SHEETW });
    note = r.note;
    if (r.how !== 'same') forget();   // the page's commands have the page's own undo
    const wrote = put(r.write);
    show();
    if (wrote) host.dirty();
  }

  // ---- the engine's own actions
  const able = () => !!note && !hold && !note.safe && !host.ro();
  /** Where the engine has a block: its container and its box. */
  function where(id) {
    const T = note.doc.tree;
    if (T.boxes.has(id)) return { box: null, b: T.boxes.get(id) };
    for (const [a, A] of T.areas) if (A.boxes.has(id)) return { box: a, b: A.boxes.get(id) };
    return null;
  }
  /** An accepted action put on the page; the token of its undo entry, or null when it made none (a drop at home). */
  function took(r, entries) {
    note = r.note;
    const wrote = put(r.write);
    show();
    if (wrote) host.dirty();
    const e = note.doc.undo[note.doc.undo.length - 1];
    return note.doc.undo.length > entries && e ? { token: e.after } : null;
  }
  function act(fn) {
    if (!able()) return null;
    look();
    const entries = note.doc.undo.length, r = fn();
    return r && r.ok ? took(r, entries) : null;
  }
  /** A block picked up at a point of the window. False when it cannot be carried now. */
  function pick(b, x, y) {
    if (!able()) return false;
    look();
    const w = where(b.id);
    held = w && B.carry(note, { box: w.box, id: b.id, point: cellsAt(host, x, y) }, env());
    return !!held;
  }
  /** The pointer moved: the preview drawn. False when the carry is over (the note changed under it): the caller ends it. */
  function move(x, y) {
    if (!held) return false;
    if (!able()) return false;   // the tab turned view-only, or the note went safe, under the carry: it is over
    held = B.moved(note, held, cellsAt(host, x, y));
    if (held.cancelled) return false;
    draw(B.preview(note, held), host); host.grow();
    return true;
  }
  /** The drop, or the carry given up: the note as it was, or the accepted layout written. Nothing is accepted once the note may
   *  not be written (a lock that came while the block was carried): the layout shown is the note's again. */
  function drop(cancel) {
    const c = held; held = null;
    if (!c) return null;
    const entries = note.doc.undo.length, r = cancel || c.cancelled || !able() ? null : B.dropped(note, c);
    if (!r || !r.ok) { show(); return null; }
    return took(r, entries);
  }
  /** «В область»: under the area's lowest block, at its left, as the page's command put it. */
  const enter = (b, area) => act(() => {
    const w = where(b.id), A = note.doc.tree.areas.get(area.id);
    if (!w || w.box != null || !A) return null;
    let y = 0; for (const k of A.boxes.values()) y = Math.max(y, k.y + k.h + 1);
    return B.enter(note, { id: b.id, to: area.id, at: { col: 0, y } }, env());
  });
  /** «З області»: under the area, in the column it had inside (AREA.7). */
  const leave = (b) => act(() => {
    const w = where(b.id), a = w && w.box != null && note.doc.tree.boxes.get(w.box);
    return a ? B.leave(note, { box: w.box, id: b.id, at: { col: a.col + 1 + w.b.col, y: a.y + a.h + 1 } }, env()) : null;
  });
  /** The undo of the action a token is of: only while it is the engine's last and nothing happened since. False, and the
   *  engine's entries dropped, otherwise. */
  function undo(token) {
    if (!able()) return false;
    look();
    const e = note.doc.undo[note.doc.undo.length - 1], r = e && e.after === token ? B.undo(note, env()) : null;
    if (!r || !r.ok) { if (r) note = r.note; forget(); show(); return false; }
    note = r.note; put(r.write); show(); host.dirty();
    return true;
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
    settle, batch, reopen, remeasure, pick, move, drop, enter, leave, undo,
    /** The action journal as a file: ids, kinds and numbers, no content of a note. */
    exportJournal() { save(doc, 'baobook-layout-journal-' + host.build + '.json', journal.export()); },
    journal: () => journal,
    /** For the scenarios: the note as the engine holds it. */
    note: () => note,
    measure: () => M,
  };
}
