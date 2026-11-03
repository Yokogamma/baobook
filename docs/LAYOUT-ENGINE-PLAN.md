# The layout engine: implementation plan

**Status: draft after review round 1, 2026-11-03.** This plan builds the engine that [`LAYOUT-RULES.md`](LAYOUT-RULES.md) specifies and puts it into the current app as version 0.1. It answers E-5 of that document (the steps of `LAYOUT-MODEL.md` §7, re-planned for the decided model) and settles E-1 to E-4 for 0.1. Where this plan and `LAYOUT-MODEL.md` §5–§7 disagree, this plan wins; those sections described the anchor-and-sweep model that G1 replaced.

Rules are cited by their ids in `LAYOUT-RULES.md` (`SIZE.1`, `P-ASIDE`, `INV-8`…); decisions by their ids in the table of `LAYOUT-MODEL.md` §2 (`W3`, `G6`…). **(proposed)** marks what rests on no decision of the owner yet.

## 1. What version 0.1 is

The engine takes over **placement only**: where every block stands, how wide and tall it is shown, and what happens to the other blocks when one is carried, resized, created, deleted, grows or shrinks, or goes into or out of an area. Everything else stays as it is in `public/index.html` and is not rewritten: the blocks' DOM and their content, typing and formatting, links and chips, the commands of the block menu (copy, delete, convert, colour, «Копіювати посилання»), the structural undo stack, history, trash, sync, tabs, import and export. Those features keep their code; where they change the layout today they call the engine instead of today's layout functions (§6).

Three properties make 0.1 a safe first release:

1. **No change of the stored format** (§3). A note written by 0.1 is read by the current version on `.app` as a valid note, and the other way round. No migration, no `FORMAT` raise, no new Firestore rules.
2. **A switch.** Until step 6 the engine is off by default and is turned on in the settings menu for testing on `.dev` («Нова розкладка (0.1)», a device setting in `sheet:settings`, its label in `uk.json` and `en.json`). A tab reads it once, when it starts; changing it reloads the tab, so a tab never runs both layouts. Off, the app behaves exactly as now.
3. **Pure core.** The rules run in Node without a browser, with a stub for measuring text (§4.3), so every rule of `LAYOUT-RULES.md` has fast tests before anything is wired.

### 1.1 In 0.1

| Module | Rules in 0.1 | Notes |
|---|---|---|
| SIZE | 1–4, 6, 8 | `ch` as a set height, the code block's own fold as today (§3.2); `ORDER`, `MINC` and `MINSCALE` at their defaults |
| GAP | 1–8 | pairs, gaps and lends kept in memory for the open note (§3.3) |
| SETTLE | §5.1–§5.4, every primitive but P-SQUEEZE | the change table of §5.2 without the sheet's right edge and the area's top and bottom handles carried inwards |
| DRAG | A1–A5, B1–B5, C1–C4, §6.D | |
| RESIZE | 1, 2, 3 for `ch` only | the height handle of a text writes `ch` when released above the content and clears it when released below, as today; for code it sets its fold (`ch`, `open`) as today; `fold` for texts is 0.2 |
| AREA | 1, 2, 3, 5 (no hidden lines to bring back), 6, 7, 7a, 7b | both side handles (today the area has a right handle only); 7a and 7b (proposed) as the mockup does them; the app's area header and collapse (§3.2) |
| EDIT | 1–4, 4a, 6 | EDIT.5 comes with hidden lines in 0.2 |
| VIEW | 1 without zooming in (with `SHEETW` fixed, §3.1), 2–7 | the scale fits the note and stops at `MINSCALE`; the list of notes keeps today's behaviour; the reading mode and the frame or background look as app settings; the dev look |

### 1.2 Later

- **0.2:** pairs and gaps stored and merged by sync (E-1 in full); `SHEETW` per note with the sheet's right edge (AREA.8) and a note without a width (VIEW.1c); `fold` for texts and areas (H1, and H5 once O-6 settles it); hidden empty lines (SIZE.7, P-SQUEEZE, AREA.4, EDIT.5); the note's own view settings (VIEW.6a, per-note override); P18 text placement and fields as settings (O-2). Each of these changes the stored format and goes with a `FORMAT` raise, after step 0 of `LAYOUT-MODEL.md` §7 (the editor keeps fields it does not know) is released. Also in 0.2, with no format change: zooming in from the fitted scale and from the narrow view, the scrollbar and the hand (VIEW.1, VIEW.1b), the list of notes pushing or covering the note (VIEW.1a), and the settings for `ORDER`, `MINC` and `MINSCALE`.
- **Stage 2:** the phone and the computer working together (O-5).
- **Later:** pinned blocks (O-7), block properties, kinds and commands as modules (`docs/BLOCKS-PLAN.md`, to be written).

### 1.3 Not finished before 0.1 starts

These stay open while the engine is built; the plan follows the rule as written now and changes with the owner's answer.

- **Areas:** AREA.7a and AREA.7b are proposed; the owner is still trying them in the mockup. Folding an area (H5) in the new model is open (O-6).
- **The batch of small proposals:** `DESKW` 40 cells, the hand button (VIEW.1b), the carried block's width (DRAG.A5), P-REST, P-SEP between two uncarried blocks, the handle always shown with borders always visible (VIEW.6a). The owner confirms or corrects them in one list.
- **O-2 (P18)** the default text placement and field: 0.1 keeps today's («як зараз»).
- **O-3 (P12)** the release order against the sync release.
- **New for 0.1: `W0`**, the sheet width in pixels that the owner's notes are read at (§3.1).
- **New for 0.1: the arrows of position mode.** M7 says «arrow keys move a selected block by one cell, as today», and DRAG.C4 follows it; but today position mode has arrow buttons, not keys, and they snap: left to the margin, right to the furthest column, up under the nearest block above, down over the nearest block below (`snapBlock`, `index.html` 2763–2768). 0.1 follows DRAG.C4 (one cell per press, buttons and keys) until the owner says whether the snapping stays.
- **New for 0.1: the code block's width** (§4.4) and **a collapsed area met by a carried block** (§3.2): both keep today's behaviour as far as the rules allow, marked proposed.

## 2. The modules

`public/layout/`, wired like `public/account/`: ES modules loaded through the import map with their SRI hashes, precached by the service worker, listed in `build.json`. The `model` role is split by the modules of `LAYOUT-RULES.md`, so a rule lives in the file of its module. No file reads a global; every shape is described once, in `shapes.js`.

| File | Role | Rules | DOM |
|---|---|---|---|
| `shapes.js` | Every shape, as JSDoc typedefs: `Box`, `Layout`, `Run`, `Pair`, `Change`, `Memory`, `Kind`, `Measure`, `Target` | §1–§2 | no |
| `size.js` | Rest widths, giving way, rows at a width through `Measure` | SIZE | no |
| `gap.js` | FOLLOW, RELINK, a block taken away | GAP | no |
| `settle.js` | SETTLE: the phases, the primitives, containment, the change table | §5, §11 | no |
| `drag.js` | The target from pointer cells, the carry memory, entering and leaving areas, the frame as an edge | DRAG, AREA.7, 7a | no |
| `ops.js` | Every user action as a change, run through SETTLE, returning the new stored state and its undo | §5.2, RESIZE, AREA, EDIT.4 | no |
| `kinds.js` | The passports of text, code and area (§4.4) | E-4 | no |
| `measure.js` | The browser's measuring function (§4.3) | E-3 | yes |
| `view.js` | Draws a layout: places the blocks, the ghost, the guides, the frames and the reading mode, the narrow view | VIEW | yes |
| `input.js` | Pointers and keys to targets and changes: carry, hold and Shift, Esc, arrows, the width and height handles, area handles, drawing an area, a click on the sheet | DRAG, RESIZE, AREA, EDIT | yes |
| `bridge.js` | The only place that knows `index.html`'s block objects: reads them into a `Layout`, writes placements and stored fields back (§6) | — | yes |

`settle.js`, `size.js`, `gap.js`, `drag.js` and `ops.js` import nothing from the page. `view.js` and `input.js` receive the bridge and the measuring function as arguments.

### 2.1 The engine's surface

```js
/** The stored state of one container and its derived rows.
 * @typedef {{id:string, col:number, y:number, w:number, h:number, kind:string, cw?:number, ch?:number, lend?:Run[]}} Box
 * @typedef {{o:?string, n:number}} Run                      // n rows owned by block o, or unowned (o null)
 * @typedef {{cols:number, boxes:Map<string,Box>, pairs:Map<string,Run[]>, areas:Map<string,Layout>}} Layout   // pairs keyed 'upper>lower'
 * @typedef {{type:string, id?:string, at?:{col:number,y:number,frow:number,w:number}, size?:object}} Change
 */
export function settle(start, change, memory, kinds, measure)   // → {layout, start, memory, pressed}   (LAYOUT-RULES §5)
export function open(stored, kinds, measure)                     // a note's stored places → a Layout, every pair new (§3.3); writes nothing
export function diff(before, after)                              // the stored fields that changed, per block id, for the bridge to write
```

`ops.js` builds on `settle` one function per action of §5.2 (`drop`, `arrow`, `create`, `remove`, `grow`, `width`, `height`, `areaSide`, `areaBottom`, `enter`, `leave`, `drawArea`); `input.js` calls them; the bridge writes what `diff` returns and pushes one undo entry.

## 3. Data in 0.1

### 3.1 Columns

The engine's `col` is the handle cell; the card starts at `col + 1` (`LAYOUT-RULES.md` §1.1). Today's code keeps a different number:

- **In an area** a child stores `col`; its grip stands in the area's cell `col` and its card starts at cell `col + 1` (`xlOf` with `cOX(area) = APAD`, `index.html` 2328–2336). The engine's `col` is the stored `col`.
- **On the sheet** a block stores `fx`, the left edge of its *text* as a share of the sheet's width in pixels: `fx = xOf(c) / W()`, with `xOf(c) = G/2 + c × G` and `c ≥ 1` (`cMinCol`). The card starts on the dot column `c`. The engine's `col` is `c − 1`.

In 0.1 nothing new is stored. The sheet is read at one fixed pixel width `W0px` instead of the window's:

- **Read:** `c = round((fx × W0px − G/2) / G)`, clamped as today's `colOfX` clamps it, with `G = 24` whatever the text size; the engine's `col = c − 1`. `SHEETW` is the number of columns today's dot grid shows at that width, `floor((W0px − 2.5 × 24) / 24) + 1` (`field()`, 2398), the same for every note in 0.1.
- **Write:** a sheet block that a user action moved gets `fx = (G/2 + c × G) / W0px` with `c = col + 1` and `G = 24`. Reading that back gives the same `c`, so the mapping is exact both ways; a block that no action moved keeps its stored `fx` untouched. Step 1 pins both with a round-trip test through `serBlock` and step 5 with a scenario that saves an unmoved note and compares the bytes.
- **The current version** reads the same `fx` at its own `W()` and clamps it to its `maxColFor`, on every resize of its window (`applyMode`, 3125), as it does today.
- **`W0px`** is a question for the owner (`LAYOUT-MODEL.md` §9): the width in pixels of their sheet (`sheet.clientWidth`) on their usual computer, with the list of notes open, at the default text size; most of their `fx` were written at it, and an error of half a cell moves a block on the right by a column. Until answered, 1000 px (`LAYOUT-MODEL.md` §8 measured that width with the list open on a 1280 px window).

A note is shown at `SHEETW` columns on every device: wider windows show white room to the right, narrower ones scale down to `MINSCALE`, narrower still the narrow view (VIEW.1, VIEW.2).

### 3.2 Sizes

- **`cw`** is the set width (SIZE.3) for texts and code; an area's `cw` is its width.
- **`ch`** of a text is its set height, spare room below the text (RESIZE.3); 0.1 writes only `ch`.
- **Code** keeps its fields: its `ch` is its fold height and `open` the user's choice of the full height, as today (`LAYOUT-MODEL.md` §5). The engine reads its shown height and its width from the passport (§4.4).
- **Areas** keep `ch` (a set height, AREA.2) and `collapsed`. A collapsed area shows its header only; its children keep their stored places and take part in nothing until it is opened. A carried block does not enter a collapsed area: its frame is an edge as AREA.7a says (proposed, until H5 is settled; today a collapsed area is pushed, an open one entered).

### 3.3 Pairs and gaps (E-1 for 0.1)

0.1 stores no pairs, gaps or lends. `open()` finds every pair from the places with every pair new (GAP.5 rule 4: the rows belong to the block above) and the engine keeps them in memory with the open note; every rule runs on them as written, and every user action writes the places that result (§3.4).

The memory lasts while the note is open in the tab and nothing replaces its stored places from outside. It is found again by `open()`, with every gap belonging to the block above it, after a reload, after a change from another tab or device (`safePoint`, `takeStored`, `takeNote`), after an import and after restoring a version. An undo keeps it: each engine undo entry carries the pairs before its action, and the undo puts them back with the fields (§6.4). Leaving the view of an old version («Історія») puts back the pairs the note had before. So INV-7 holds within one open note between such events, and across them a gap is never lost, it only changes hands; 0.2 stores the pairs and lifts this.

### 3.4 Rows and what a user action writes

A user action writes, through the bridge, only the stored fields of the blocks that the action itself moved or resized compared with the layout it started from: rows and columns that it changed, `cw`, `ch`. A block whose shown row differs from its stored row for another reason (the normalisation of §3.5, a font that wraps differently on this device, a temporary height) is not written by an action that did not move it. The derived rows of the blocks it did move are written as caches (`LAYOUT-RULES.md` §2.1); `open()` trusts only the rows of head blocks. A temporary height is shown and never written. Applying a change that came from another tab or device writes nothing.

This keeps two devices that measure differently from rewriting each other's rows on every keystroke: `row` is in the sync «place» group (`sync.js` 103), and a place group changed on both sides makes a conflict copy.

### 3.5 Opening a note

Every note on `.app` was laid out by today's `resolveIn`, whose result depends on the window's width and the order of the stored array (`LAYOUT-MODEL.md` F1, F4–F6). Read at `W0px`, its places may break the invariants: two cards overlap, a block lies past `SHEETW`, a child lies outside its area, a block stands in the free cell round an area (AREA.7a). `open()` makes a valid layout of them, shown and not written:

1. **Clamp.** A card past its container's right edge moves left to the last column where it fits; an elastic block narrows first, as at the edge (DRAG.A3). A child below its area's set height makes the area taller in the layout (AREA.2).
2. **Separate.** In reading order, any two blocks that still hit, or a block in the free cell round an area, are separated by P-SEP for two uncarried blocks: the lower one, or on the same row the right one, goes down to the other's bottom with the blocks under it. (P-SEP between uncarried blocks is proposed in `LAYOUT-RULES.md`; 0.1 needs it here.)
3. **Pairs.** RELINK with every pair new (§3.3).

The result is the layout the next action starts from; by §3.4 a block's normalised place is written only when an action moves it. `open()` is deterministic: the same stored note gives the same layout on every device that measures the same. The current version keeps writing its own pushes until 0.1 reaches every device (§7); `open()` reads them as places like any other.

## 4. Engineering points settled for 0.1

### 4.1 Determinism (INV-5)

Every visit is in reading order of the layout its phase starts from, ties by id; nothing depends on the order of the stored array (`LAYOUT-MODEL.md` F4). Measured sizes may differ between devices with different fonts; the stored rows are then each device's own result of a user action, and `open()` derives the rest from the head rows, so devices that measure differently show slightly different rows and write nothing until the user acts.

### 4.2 Bounds (E-2)

- `RESTPASSES` is 2 (proposed): two passes of SIZE.8 in phase 9. Tests compare with a run to a fixed point on the mockup's scenarios and on generated sheets; if two passes ever differ from the fixed point on a case, the case is a regression test and the number is raised.
- Restarts: phase 3 restarts at most once for every neighbour passed in the carry; phase 11 at most once per pointer move. `settle` asserts both bounds and returns the last valid layout if one is exceeded (a bug, reported in the dev look).
- P-REST only moves blocks down, P-SEP likewise between uncarried blocks; phase 9 ends.

### 4.3 Measuring (E-3)

```js
/** @typedef {{rows(box:Box, cells:number):number, natural(box:Box):number}} Measure */
```

- **Browser:** one hidden measuring element per kind, styled with the block's own classes, in the sheet so that the text size and the font are the page's; results cached by the content's hash, the width and the text size; the cache is cleared when the text size changes. A placeholder is never measured (PR-8): an empty text's natural width is one cell.
- **Node:** a stub: a text of `n` characters is `ceil(n / (cells × 3))` rows and `ceil(n_longest_line / 3)` cells wide, so tests state their expectations in cells.

### 4.4 Passports (E-4)

```js
/** @typedef {{elastic:boolean, minCells(box):number, rows(box, cells, measure):number, container:null|{headerRows:number}}} Kind */
```

| Kind | Elastic | Width | Shown height | Container |
|---|---|---|---|---|
| text | yes, unless `cw` | SIZE.1, `TEXTW`, `MINC` | content rows, or `ch` when larger | no |
| code | yes unless `cw`, with no `TEXTW` cap (proposed, as today) | without `cw`, all the room to its right neighbour or the container's edge, as today's `rawWidth` gives it (`index.html` 2362); never below `MINW_CODE`; gives way by SIZE.2 | as today: folded at `ch` unless `open` | no |
| area | no | `cw`, at least 12 cells as today | header plus its children's rows, or `ch` when larger; the header only when collapsed | yes: its header's rows |

A text's measured width and the cell size follow the text size: a larger text size makes `G` larger (`--g`, as `applyText` does today), so the sheet scales and no column or row changes; the measuring cache is cleared. A new kind (a checklist, an image) adds a passport and nothing else in the engine.

### 4.5 Performance

`LAYOUT-MODEL.md` F8 measured today's code at 63 s to open a note of 120 blocks, most of it DOM measurement repeated in three passes. The budgets for 0.1 count the measuring: on a generated note of 120 blocks in two containers, with a cold measuring cache, opening the note under 150 ms and at most one measurement per block and width tried; one pointer move of a carry under 8 ms with a warm cache; one keystroke that grows a text under 4 ms plus one measurement. The engine works per container; FOLLOW and RELINK are linear in the pairs after sorting; a pointer move runs one SETTLE from `start`. Step 1 measures the engine in Node, step 4 the measuring in Chromium, step 5 the whole in the app.

## 5. Steps

Each step is one PR into `main` with every test green, the build marker raised and, for files under `public/`, the SRI hashes written (`node tests/hashes.mjs --write`). Steps 1–4 add the engine with no effect on the app; step 5 wires it behind the switch; step 6 makes it the default and removes today's layout code.

| Step | What | Tests | Effect on the app |
|---|---|---|---|
| 1 | `shapes.js`, `size.js`, `gap.js`, `kinds.js`, the Node measuring stub; `open()` | `tests/layoutsize.mjs`, `tests/layoutgap.mjs`: SIZE and GAP rules, INV-2, INV-3, INV-7 b, determinism under shuffled storage | none |
| 2 | `settle.js`: the phases, the primitives, containment, the change table | `tests/layoutsettle.mjs`: each primitive alone, the phase order, INV-1 to INV-5 after every SETTLE, the review's regression cases, bounds (§4.2) | none |
| 3 | `drag.js` and `ops.js`: targets, the carry memory, letting through, entering and leaving areas, every action of §5.2 in 0.1 with its undo | `tests/layoutdrag.mjs`, `tests/layoutops.mjs`: the mockup's scenarios as cases, INV-7 a, INV-8 (the last preview equals the drop) | none |
| 4 | `measure.js`, `view.js`, `input.js` | `tests/layoutview.mjs` in Chromium on a page of the engine alone, kept in `tests/lib/` (never in `public/`) and served by `tests/lib/server.mjs` from a second root next to `public/`: carry, hold, Shift, Esc, arrows, handles, areas, drawing, the narrow view, the reading mode | none |
| 5 | `bridge.js` and the switch: with the switch on, `index.html` calls the engine where it calls today's layout (§6); the dev look shows INV violations | the existing browser scenarios with the switch off as today; with it on, by the table of §5.1; the round trip of an unmoved note (§3.1) | only with the switch on |
| 6 | The switch on by default; today's layout functions removed; `LAYOUT-MODEL.md` §8 departures closed | the existing scenarios with the engine only; `tests/lab/layout-probes.mjs` re-run and recorded | the engine for everyone on `.dev` |

### 5.1 The browser scenarios with the switch on

Some scenarios assert today's behaviour that a decision changes, so they cannot pass with the switch on. Step 5 writes, in `tests/README.md`, a table of every scenario: **kept** (it passes as it is), **new expectation** (the same steps, the decided result: `appflow` and `appdrop` without permanent pushes, `appwidth` with elastic widths and `SHEETW`, `appdrop` with letting through), or **replaced** (a new scenario for the decision: `apptouch` with a tap that creates and a hold that shows the borders, `appsel` with position mode on a computer only and its arrows by the owner's answer, `applabels` with the narrow view, the hover ghost gone). Step 6 deletes the old expectations with the old code.

Release of 0.1 to `.app` is a PR `main → prod` when the owner asks, after the owner has used it on `.dev`. 0.1 changes no stored field, so the export before the release is a precaution, not the CLAUDE.md requirement for a storage change. Its order against the sync release is O-3.

## 6. The boundary with `index.html`

The bridge is the only module that reads or writes `index.html`'s block objects. `index.html` changes in three ways only:

1. **Where it lays out today, it calls the bridge.** Each call site of today's layout functions (§6.1) becomes one call: `LAYOUT.change(type, …)` for a user action, `LAYOUT.open()` when a note is shown or changed from outside, `LAYOUT.draw()` when only the look changed. With the switch off the old call stays.
2. **Its gestures for placement are handed over.** The carry by the grip, the arrows of position mode, the width and height handles, the area's handles, drawing an area and the click on the empty sheet are `input.js`'s; `index.html` keeps the gestures that are not placement (selection, the long press of position mode on touch, the menus).
3. **The undo stack gets the engine's entries.** An engine action returns the stored fields before and after; the bridge pushes them as one entry of the existing structural undo stack (C2), so Ctrl+Z, the toasts and the history treat them as they treat any structural change.

Commands that are not placement keep their code and, where they change the layout, call the bridge:

| Command | Change for the engine |
|---|---|
| Delete a block (menu, Backspace in an empty block, clearing the sheet) | `remove` (GAP.6); an empty block left on blur as EDIT.4 says; an area's children are taken away with it in the same change |
| Paste a block on the sheet, `+`, «блок після», a new area by its button | `create` at its cell (§5.2, EDIT.4, VIEW.4) |
| Convert to code or to text | a size change (phase 1a) with the new passport |
| «В область…» and «З області» | `enter` and `leave` (AREA.7) |
| Ungroup an area | `leave` for each child, in reading order, then `remove` for the area |
| Typing, Enter, a paste into a block, a code or area title, code wrap and numbers | a size change (phase 1a) |
| «Розгорнути» and «Згорнути» of a text | a temporary height, written never (H3) |
| The code block's own «more» (`open`) | a size change, written, as today (§3.2) |
| Collapse and open an area | a size change of the area (§3.2) |
| Undo and redo of a structural entry | §6.4 |
| Restoring a version | its stored fields are put back and the layout is opened from them (`open`) |
| Restoring a block from history | it keeps its current place and size, as today, so it is a size change while the block exists; a block that no longer exists is `create` at its stored cell |
| Copy a block (the grip tapped without a move), colour, «Копіювати посилання», links | nothing |

### 6.1 Call sites

Line numbers are in `public/index.html` at `0178041`; step 5 re-checks them.

| Today | Where | In 0.1 |
|---|---|---|
| `make` → `resolve(b); update()` | 2401–2416 (fx → col at 2408) | the bridge builds the block's `Box`; the caller's action decides the change: `create` for a new block, nothing for `makeAll` |
| `makeAll` from `drawBlocks` | `openNote` 2090 → `drawNote` 2096 → 2098 | `open()` once for the note |
| `redrawCur`, `takeStored`, `takeNote`, `tabMsg`, `safePoint`, `flushPending`, the conflict copies | 1328–1355, 2202, 2213, 3293, 3296 | `open()`; the block being started (EDIT.4a) is kept as it is now (1342) |
| `showVersion`, `showNow` | 3218, 3232 | `open()` read-only for the version shown; `open()` again on leaving |
| `putState` (restore) | 3233 | stored fields put back, `open()`, then the save as today |
| Import | 2244–2255 | `open()` through `redrawCur` / `openNote` |
| `createAt`, `createIn`, `createNext`, `createAfter`, `areaBtn`, paste on the sheet | 2740, 2694, 2749, 2845, 3024, 3025–3030 | `ops.create` |
| `remove` → `resolve(); update()` | 2673, callers 2814, 2665, 2560, 2938–2942, 3134 | `ops.remove`; clearing the sheet opens an empty layout |
| `moveInto`, `pullOut`, `ungroup`, `restoreArea` | 2825, 2827, 2676, 2670 | `ops.enter`, `ops.leave`; `restoreArea` is an undo (put back and `open()`) |
| `relayout(b)` | 2449, from typing 2462–2483, code 2555–2602, titles 2531–2532 and 2691–2692 | `ops.grow` (a size change) |
| `placeUndo` | 2820–2824 | the engine's undo entries; it also snapshots `collapsed`, which it misses today |
| `snapBlock` and the arrow bar | 2763–2772 | `ops.arrow` (DRAG.C4); `selBlk`, `enterSel`, `exitSel`, `selHoldOn` stay in `index.html` |
| `drag(b, grip, o)` on the grip and the card bar | 3038–3118, attached at 2411 and 2413 | `input.js` carries by the grip and by a code or area header; a grip tapped without a move calls back into `index.html` (copy, position mode on touch, focus for code) as 3115 does |
| `resizer` and `sizeMenu` | 2423–2448, set up at 2503, 2591, 2730; 2830 | `input.js` handles (RESIZE, AREA.3); the size menu calls `ops.width` / `ops.height` |
| Area collapse `.fold` | 2704 | `ops.grow` for the area |
| `marqGest`, `createArea`, `areaFromRect` | 3000–3011 | `input.js` draws, `ops.drawArea` (AREA.7b) |
| The hover ghost on the empty sheet | 3017–3022 | gone: EDIT.2 shows the cell cursor only |
| `holdGesture` on the sheet and in an area | 2935, 2943, 2700 | see §6.3 |
| `applyMode`, `viewBtn`, the sheet's `ResizeObserver`, `setText` | 3121–3127, 3342 | VIEW: scale, the narrow view and «Показати як на компʼютері» (VIEW.5); a text size change redraws and clears the measuring cache, it moves nothing |
| `growSheet` | 2397, from 2910, 2859, 2012 | `view.js` sizes the sheet from the layout's bottom |
| `flowOrder`, `lines()`, `noteBlocks()` | 2384, 1628, 1894, `blockText` / `blockHtml` 2896–2897 | the engine's reading order (`LAYOUT-RULES.md` §1.1), which also fixes the child sorted by `parent.row + row/1000` (`LAYOUT-MODEL.md` §8) |
| `field()` | 2398 | `view.js` draws the dot grid of `SHEETW` columns and the white room beyond it (VIEW.1) |
| `redrawCur` re-creating the block being started through `fits()` | 1342 | the bridge keeps the started block (EDIT.4a) as `create` at its cell after `open()` |
| The slide of pushed blocks (`slideT`, `slideFrom`, `.dragging`, `.shifted`, `.trace`) | 3032–3041 and the CSS | `view.js` |
| `touchmove` held while carrying | 2998, 3117 | `input.js` |
| `placeBacklinks`, `liveGeo` | 2013, 3213 | they read the drawn blocks; `placeBacklinks` keeps the two helpers it uses (`xlOf`, `cMinCol`) or gets the same numbers from `view.js` |

### 6.2 What is removed in step 6

`rect`, `rawWidth`, `need`, `colsOverlap`, `overlaps`, `tooTight`, `fits`, `xConflict`, `resolveIn`, `resolve`, `flowKey`, `flowOrder`, the layout part of `render(b)` and `areaMeasure` (what is left draws the block's content), `relayout`, `snapBlock`, `drag` and its `probe`, `resizer`, the hover ghost, `marqCells` and `drawMarq`, the layout part of `applyMode`, `growSheet`, and the grid helpers that only they use (`colOfX`, `rowOfY`, `maxColFor`, `clampColFor`, `clampRowFor`, `cMinRow`, `live`, `isSolid`, `solid`). `xOf`, `xlOf` and `cMinCol` stay while the bridge's column mapping (§3.1) and `placeBacklinks` use them. `gesture()` stays: `input.js` uses it for the carry, as `drag` does now, and the notes list keeps using it.

### 6.3 What the user sees change

Every item comes from a decision; the ones that touch the phone are listed so that the owner checks them on a device before step 6.

- **The sheet has a width.** A note is shown at `SHEETW` columns on every device, with white room to the right on a wide window and scaled down on a narrow one (W2, W7, §3.1). Today a sheet block's place is a share of the window's width.
- **Old notes may shift once.** A note whose stored places overlap or stick out at `W0px` is shown separated and clamped (§3.5); nothing is written until the user moves those blocks.
- **The phone.** At any phone width the note is below the minimum scale, so the phone always shows the narrow view: one column in reading order, where blocks are read, written, created and deleted, but not carried, not resized and not moved by position mode (W6, VIEW.2–VIEW.5). Today the phone shows the same free sheet, with position mode on a hold.
- **Touch on the empty sheet of a computer layout** (a tablet held wide; proposed for touch). A tap starts a new block (EDIT.4), which goes away if nothing is written; a hold shows the borders while it is held (VIEW.6a). Today a hold creates a block. A hold on a block's text starts position mode where position mode exists.
- **Position mode on a computer** moves by one cell per arrow, buttons and keys (DRAG.C4), unless the owner keeps today's snapping (§1.3).
- **Hover on the empty sheet** shows the cell cursor only, no ghost of a block (EDIT.2).
- **Pushes are not permanent.** A block that grows and shrinks back leaves its neighbours where they were (H1, G1); today they stay pushed (`LAYOUT-MODEL.md` F3).
- **The rest of `LAYOUT-RULES.md`:** letting through by holding or Shift, elastic widths, guides and sticking, the reading mode, areas entered by the pointer and stopping a block at their frame (proposed), both side handles of an area, drawing an area with at least 4 × 2 cells, then widened to the area's minimum width (12 cells, as today) (proposed).

### 6.4 Undo

An engine action returns an undo entry with the stored fields it changed, before and after, and the in-memory pairs before it (§3.3); the bridge pushes it onto the existing structural undo stack as one entry (C2), with the toast the action has today.

- **Undo when nothing changed since.** If the stored fields the entry changed still hold its «after» values, the undo puts back its «before» values and its pairs, with no SETTLE: the layout is exactly the one before the action.
- **Undo after other changes.** A toast can undo an action after other actions (a deletion with content keeps its toast). Then an undo of a deletion makes the block again as `create` at its stored cell, in reading order, an area first and its children then entering it; an undo of a move carries the block back as a drop at its old cell. Both run SETTLE, so nothing overlaps. This is the rule EDIT.4 states for a new block taken away.
- **Redo** is the same in the other direction.
- `placeUndo` snapshots `collapsed` too, which it misses today.

## 7. Risks

- **Notes made at another width.** Reading `fx` at `W0` moves sheet blocks of notes made on a much wider or narrower sheet. Mitigation: `W0` chosen from the owner's notes; the switch lets the owner compare before step 6; the engine writes nothing until the user acts.
- **Two layouts in one tab.** Between steps 5 and 6 both exist; the switch is read once when the tab starts (§1), so a tab runs one of them only.
- **The current version keeps writing pushes.** Today's `resolveIn` writes pushed rows (`index.html` 2379) and saves them with the next edit; `relayout` does so on every keystroke. Every edit on a device or in a tab without 0.1 (the switch off, or `.app` before the release) keeps sending permanent pushes into notes that 0.1 reads as places. So G1 and INV-7 hold only among devices and tabs that run 0.1. This belongs to the release order (O-3), and the owner is told before using the switch on `.dev` with notes edited elsewhere.
- **Rows of different fonts.** §3.4 writes only what an action moved, so devices that measure differently do not rewrite each other's rows on every keystroke; a conflict copy is still possible when both move the same block, as today.
- **The structural undo stack and history.** An engine entry must restore exactly the stored fields it changed; tests undo every action and compare the stored blocks.
- **Unknown fields.** 0.1 writes only today's fields, so an older version that edits a note drops nothing of 0.1's. Step 0 of `LAYOUT-MODEL.md` §7 (the editor keeps fields it does not know) moves to 0.2, before the first new field.

## 8. Relation to the other documents

- `LAYOUT-RULES.md`: what the engine does. This plan: how and in which order it is built, and what 0.1 leaves out.
- `LAYOUT-MODEL.md`: its §2 stays the record of decisions; its §5–§7 are replaced by §3–§5 here, and their headers say so; its §8 stays the list of today's departures that step 6 closes.
- `LAYOUT-RULES.md` §16 points here for E-1 to E-5.
- The mockup stays the reference for how a rule feels; its known differences are `LAYOUT-RULES.md` §14.2.

## Review log

- **Round 0 → 1** (15 findings). `open()` normalises stored places that break the invariants, shown and not written (§3.5); undo after other changes re-creates or carries back through SETTLE (§6.4); the column convention per container and `W0` as a width in pixels tied to today's `colOfX` and `field()` (§3.1); an action writes only what it moved, so devices with different fonts do not rewrite each other's rows (§3.4); the current version's pushes named as a risk, the switch read once per tab; the code block elastic with no cap, as today (§4.4); position mode gone on the phone, the arrows' snapping a question for the owner (§1.3, §6.3); the engine's test page under `tests/lib/`; a table for the browser scenarios with the switch on (§5.1); the events that reset the in-memory pairs (§3.3); missing call sites (`field()`, the started block, the slide, `touchmove`, `placeBacklinks`' helpers, an area's children on delete, the text size); the height handle's wording; performance with the measuring counted; strings and settings deferred to 0.2 stated; a collapsed area is not entered.
