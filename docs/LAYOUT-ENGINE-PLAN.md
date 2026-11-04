# The layout engine: implementation plan

**Status: after review round 4 (2026-11-03), two checks of the owner's decisions of 2026-11-04, and the independent review of 2026-11-04 (1 blocker and 6 major findings, all fixed the same day, with S8's way chosen by the owner in the mockup; review log): ready to start step 1.** This plan builds the engine that [`LAYOUT-RULES.md`](LAYOUT-RULES.md) specifies and puts it into the current app as version 0.1. It answers E-5 of that document (the steps of `LAYOUT-MODEL.md` §7, re-planned for the decided model) and settles E-1 to E-4 for 0.1. Where this plan and `LAYOUT-MODEL.md` §5–§7 disagree, this plan wins; those sections described the anchor-and-sweep model that G1 replaced.

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
| AREA | 1, 2, 3, 5 (no hidden lines to bring back), 6, 7, 7a, 7b | both side handles (today the area has a right handle only); 7a and 7b as the mockup does them (A2); the app's area header and collapse (§3.2) |
| EDIT | 1–4, 4a, 6 | EDIT.5 comes with hidden lines in 0.2 |
| VIEW | 1, 1b (with `SHEETW` fixed, §3.1), 2–7 | the scale fits the width the note uses and stops at `MINSCALE` (W12); «+», «−» and «По ширині» with the sideways scroll, and the hand with its button, Space and the middle button (S2), their strings in `uk.json` and `en.json`; the list of notes keeps today's behaviour; the reading mode and the frame or background look as app settings; the dev look; where the text stands («як зараз», at the dots, in the middle of a cell) and the field (narrow, wide) as a device setting in `sheet:settings`, today's look by default (P18): measuring takes the text's insets from it, so changing it is a view-only re-measure that writes nothing by itself (§4.3), and with wide fields every block gets one more row under it, as the mockup's field row does; that row is a temporary height (`LAYOUT-RULES.md` §1.2): shown on this device, never written, and the rows it moves are not written either, `open()`'s separations included (§3.4, §3.5), so trying the setting writes nothing by itself: the field row never, and what the text placement moved only with the next action in that container, as a font's (§3.4); a block the user moves is written where the user puts it |

### 1.2 Later

- **0.2:** pairs and gaps stored and merged by sync (E-1 in full); `SHEETW` per note with the sheet's right edge (AREA.8) and a note without a width (VIEW.1c); folding as one function with one standard stored field for every kind that folds, text, area, code and to-do lists, code moved onto it from its `ch` and `open`, and with it the area's own ways (AREA.9, H5) (A3); hidden empty lines (SIZE.7, P-SQUEEZE, AREA.4, EDIT.5); the note's own view settings (VIEW.6a, per-note override); the text placement and field synced as an app setting, with a note's override and the default the owner chooses after trying them (P18). Each of these changes the stored format and goes with a `FORMAT` raise, after step 0 of `LAYOUT-MODEL.md` §7 (the editor keeps fields it does not know) is released. Also in 0.2, with no format change: the list of notes pushing or covering the note (VIEW.1a), and the settings for `ORDER`, `MINC` and `MINSCALE`.
- **Stage 2:** the phone and the computer working together (O-5).
- **Later:** pinned blocks (O-7), block properties, kinds and commands as modules (`docs/BLOCKS-PLAN.md`, to be written).

### 1.3 Not finished before 0.1 starts

These stay open while the engine is built; the plan follows the rule as written now and changes with the owner's answer.

- **Areas:** settled as A1, A2 and A3 (AREA.7–AREA.9, 2026-11-04): 0.1 folds nothing new, an area follows its blocks, its collapse to the header stays.
- **The small proposals** were decided as S1–S8 (2026-11-04). **S8's way** was chosen after the independent review, by trying three in the mockup (2026-11-04): a block that comes between two blocks by itself counts as put into the upper one's gap (`LAYOUT-RULES.md` GAP.5 rule 3a).
- **O-2 (P18)** answered for 0.1: today's look by default, and every variant in the settings menu as a device setting, for the owner to try on real notes (P18).
- **O-3 (P12)** moot: sync is in production since #130 (2026-10-27), so 0.1 follows it.
- **`W0`** answered: 1458 px, 59 columns (§3.1, W11).
- **What a narrower window scales by** answered: the note's used width, up to its rightmost block (W12).
- **The arrows of position mode** answered (W15): they jump, as today (`snapBlock`, `index.html` 2763–2768): to the left edge, to the last column, under the nearest block above, over the nearest block below; each jump is a carry dropped at once (DRAG.C4). On a computer position mode stays in 0.1, entered from the block's menu by the right button on ⋮⋮ («Виділити», 2412, 2810); on touch it waits for the touch stage (W13).
- **The code block's width** answered (W14): elastic as a text, its natural width its longest line; widened by hand when needed. **A collapsed area met by a carried block** (§3.2) keeps today's behaviour as far as the rules allow, marked proposed.
- **Who edits the layout** (S3 and W13, 2026-11-04): in 0.1 only a computer, a device the app does not treat as touch (`!TOUCH`, `matchMedia('(hover:none)')`, read once when the tab starts, as the menus and the sign-in already use it; a 2-in-1 keeps the start's answer), at `MINSCALE` or more; a phone or a tablet reads, writes, deletes and creates by «+», as VIEW.3 allows, and moves nothing, showing the real layout when it fits at `MINSCALE` and the narrow view below; `DESKW` only decides who gives a phone note its width, in 0.2.
- **The text size and the phone** answered (2026-11-04, W11): both computers use the default 16 px text, so their `fx` read at `G = 24` give the columns they show today; notes arranged on a phone are shown by 0.1 as the computer shows them today, by the same shares, so nothing more is needed.

## 2. The modules

`public/layout/`, wired like `public/account/`: ES modules loaded through the import map with their SRI hashes, precached by the service worker, listed in `build.json`. The `model` role is split by the modules of `LAYOUT-RULES.md`, so a rule lives in the file of its module. No file reads a global; every shape is described once, in `shapes.js`.

| File | Role | Rules | DOM |
|---|---|---|---|
| `shapes.js` | Every shape, as JSDoc typedefs: `Box`, `Layout`, `Run`, `Pair`, `Change`, `Memory` (the carry memory of `LAYOUT-RULES.md` §6.D, the lowered bottom of each area for AREA.7 included), `Kind`, `Measure`, `Target` | §1–§2 | no |
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
/** The stored state of one container and its derived rows. The bridge builds the Boxes from index.html's blocks with `w` and `h`
 *  unset and no pairs; `open()` sizes them and finds the pairs.
 * @typedef {{id:string, kind:string, col:number, y:number, w?:number, h?:number, cw?:number, ch?:number, open?:boolean, collapsed?:boolean, lend?:Map<string,Run[]>}} Box   // lend: one per pair it stands between, keyed 'upper>lower' ('>lower' above a head block)
 * @typedef {{o:?string, n:number}} Run                      // n rows owned by block o, or unowned (o null)
 * @typedef {{cols:number, boxes:Map<string,Box>, pairs:Map<string,Run[]>, areas:Map<string,Layout>}} Layout   // pairs keyed 'upper>lower'
 * @typedef {{type:string, box:?string, id?:string, to?:?string, at?:{col:number,y:number,frow:number,w:number}, size?:object}} Change   // box: the container (null, the sheet); to: the container entered, for enter, leave and ungroup
 */
export function settle(start, change, memory, kinds, measure)   // on the displayed layout → {layout, start, memory, pressed}, or {failed} (LAYOUT-RULES §5, §5.5)
export function open(stored, kinds, measure)                     // a Layout of Boxes from the bridge (no pairs, sizes unset) → {layout, pending}, or {failed, layout}: §3.5; writes nothing
export function show(canonical, temp)                            // the displayed layout: the temporary rows per block id set, then FOLLOW (LAYOUT-RULES §2.1)
export function unshow(displayed, temp)                          // the canonical layout: the same rows taken out, then FOLLOW
export function diff(before, after)                              // between two canonical layouts: the stored fields that changed, per block id, for the bridge to write
```

Every action runs `settle` on the displayed layout, `show(current, temp)`; the result is drawn as it is, and `unshow(result, temp)` is what `diff` compares, what the undo entry keeps and what the next action starts from (`LAYOUT-RULES.md` §2.1).

`ops.js` builds on `settle` one function per action of §5.2 (`drop`, `arrow`, `create`, `remove`, `grow`, `width`, `height`, `areaSide`, `areaBottom`, `enter`, `leave`, `drawArea`); `input.js` calls them; the bridge writes what `diff` returns and pushes one undo entry.

## 3. Data in 0.1

### 3.1 Columns

The engine's `col` is the handle cell; the card starts at `col + 1` (`LAYOUT-RULES.md` §1.1). Today's code keeps a different number:

- **In an area** a child stores `col`; its grip stands in the area's cell `col` and its card starts at cell `col + 1` (`xlOf` with `cOX(area) = APAD`, `index.html` 2328–2336). The engine's `col` is the stored `col`.
- **On the sheet** a block stores `fx`, the left edge of its *text* as a share of the sheet's width in pixels: `fx = xOf(c) / W()`, with `xOf(c) = G/2 + c × G` and `c ≥ 1` (`cMinCol`). The card starts on the dot column `c`. The engine's `col` is `c − 1`.

In 0.1 nothing new is stored. The sheet is read at one fixed pixel width `W0px` instead of the window's:

- **Read:** `c = round((fx × W0px − G/2) / G)` with `G = 24` whatever the text size, and no clamp here (today's `colOfX` clamps by pixels, `maxColFor`; §3.5 is the engine's only edge); the engine's `col = c − 1`. `SHEETW` is the number of columns today's dot grid shows at that width, `floor((W0px − 2.5 × 24) / 24) + 1` (`field()`, 2398), the same for every note in 0.1.
- **Write:** a sheet block that a user action moved gets `fx = (G/2 + c × G) / W0px` with `c = col + 1` and `G = 24`. Reading that back gives the same `c`, so the mapping is exact both ways; a block that no action moved keeps its stored `fx` untouched. Step 1 pins both with a round-trip test through `serBlock` and step 5 with a scenario that saves an unmoved note and compares the bytes.
- **The current version** reads the same `fx` at its own `W()` and clamps it to its `maxColFor`, on every resize of its window (`applyMode`, 3125), as it does today.
- **Exact at the default text size only.** Today's code writes and reads `fx` with the cell of the current text size, so a note edited at a larger text size reads to other columns at `G = 24`, and a current-version tab at a larger text size reads the engine's `fx` to other columns (§1.3, §7).
- **`W0px`** is a question for the owner (`LAYOUT-MODEL.md` §9): the width in pixels of their sheet (`sheet.clientWidth`) on their usual computer, with the list of notes open, at the default text size; most of their `fx` were written at it, and an error of half a cell moves a block on the right by a column. The owner measured 1451–1466 px on both computers they use, a 14-inch laptop and a 24-inch display (2026-11-04, W11): a window with and without the vertical scrollbar, so notes were written at both. `W0px` is their middle, 1458 px: a block written at either width reads back to its own column, the error staying under 8 px of a 24 px cell. `SHEETW` is then 59 columns.

**Rows.** In an area the engine's `y` is the stored `row`. On the sheet it is `row − 2`: a sheet block's first row today is 2 (`cMinRow`, 2334; `clampRowFor`), the rows above it left empty, so that row is the engine's row 0; a write stores `row = y + 2`.

**Children and the sheet.** An area is a Box at sheet `(a, y)` with `H` header rows (`container.headerRows`); its child at `(c, r)` stands on sheet cell `(a + 1 + c, y + H + r)`, its handle on the area's column `c`. This is `LAYOUT-MODEL.md` §3.1's mapping in the engine's columns. `enter` and `ungroup` use it, and «З області» (`leave`) its column part, since AREA.7 puts the block under the area in the column it had inside; `ops.js` works in cells only.

A note's sheet is `SHEETW` columns on every device. Its scale is fitted to the width the note uses, up to its rightmost block (W12): a window at least that wide shows it at full size, white room to the right when it is wider than the sheet, the rest of the sheet reached by the sideways scroll when it is narrower; a narrower window scales the note down to `MINSCALE`, narrower still the narrow view (VIEW.1, VIEW.2). The user may zoom in with «+» and move with the hand. The fitted scale is recomputed on opening and after an action, never while typing, only when the caret leaves the block; carried to the window's edge, a block makes the sheet scroll by itself (W16).

### 3.2 Sizes

- **`cw`** is the set width (SIZE.3) for texts and code; an area's `cw` is its width.
- **`ch`** of a text is its set height, spare room below the text (RESIZE.3); 0.1 writes only `ch`.
- **Code** keeps its fields: its `ch` is its fold height and `open` the user's choice of the full height, as today (`LAYOUT-MODEL.md` §5). The engine reads its shown height and its width from the passport (§4.4).
- **Areas** keep `ch` (a set height, AREA.2) and `collapsed`; with no `ch` an area is as tall as its blocks need, so it shrinks when they do (A3). A collapsed area shows its header only; its children keep their stored places and take part in nothing until it is opened. A carried block does not enter a collapsed area: its frame is an edge as AREA.7a says (proposed, until folding comes as one function in a later release, A3; today a collapsed area is pushed, an open one entered).

### 3.3 Pairs and gaps (E-1 for 0.1)

0.1 stores no pairs, gaps or lends. `open()` finds every pair from the places with every pair new (GAP.5 rule 4: the rows belong to the block above) and the engine keeps them in memory with the open note; every rule runs on them as written, and every user action writes the places that result (§3.4).

The memory lasts while the note is open in the tab and nothing replaces its stored places from outside. It is found again by `open()`, with every gap belonging to the block above it, after a reload, after a change from another tab or device (`safePoint`, `takeStored`, `takeNote`), after an import and after restoring a version. An undo keeps it (§6.4). Leaving the view of an old version («Історія») puts back the layout and pairs the bridge kept aside (§6.1). So INV-7 holds within one open note between such events, and across them a gap is never lost, it only changes hands; 0.2 stores the pairs and lifts this.

### 3.4 Rows and what a user action writes

A user action writes, through the bridge, the stored fields of the blocks whose place or set size differs between the canonical layout the action started from (`start`, the layout of §3.5 or of the last action) and its result's canonical layout (`LAYOUT-RULES.md` §2.1): rows and columns, `cw`, `ch`. That includes the blocks FOLLOW moved under a text that grew or shrank, as today's `relayout` does, and their derived rows are written as caches (`LAYOUT-RULES.md` §2.1). In 0.1 every stored row is a place for `open()`, since no pairs are stored to derive rows from; the rule that only head blocks' rows are trusted applies from 0.2. A temporary height is shown and never written, and neither is a row it moves, since the canonical layout has neither: the field row of wide fields (P18) is one. Applying a change that came from another tab or device writes nothing.

One addition, the **pending places**: places that changed with no user action, and so were shown and not written, are written with the next user action in their container whose own writes are not empty, all of that container's at once and no others. They are the places `open()` repaired, clamped, separated or re-rested (§3.5), and the places a re-measure no user made moved: a linked note renamed, which changes a chip's label, or a font that loaded after the note opened (§4.3). The user has seen them, and writing them keeps the layout the same after a reload and for the current version. They include separations that come from this device measuring a text taller than the device that wrote the note: `open()` cannot tell the two causes apart (§7). An undo that puts back the stored places of the action that wrote them makes them pending again.

What this saves against today: a keystroke that changes no height writes no row, and opening a note writes nothing; a device that measures differently writes its own separations once, with its next action in that container, and otherwise only the blocks an action moves. `row` is in the sync «place» group (`sync.js` 103), and a place group changed on two devices makes a conflict copy.

### 3.5 Opening a note

Every note on `.app` was laid out by today's `resolveIn`, whose result depends on the window's width and the order of the stored array (`LAYOUT-MODEL.md` F1, F4–F6). Read at `W0px`, its places may break the invariants: two cards overlap, a block lies past `SHEETW`, a child lies outside its area, a block stands in the free cell round an area (AREA.7a). `open()` makes a valid layout of them, shown and not written.

**Reading.** The bridge reads the stored blocks as `make` and `makeAll` read them today (2099, 2401–2408), so a note shows the same blocks: areas first; a text with no content is not shown, as today; an area has no parent (no nesting); a block whose parent is not an area of the note stands on the sheet, its column from its `col`, as `make` does, or from its `fx`. Every value `normBlock` accepts (`sync.js` 54–68) gives a place: a fractional `col`, row or column read from `fx` is rounded to the nearest cell, and the engine's `col` and `y`, after the offsets of §3.1, are at least 0 (today `clampRowFor` keeps a sheet row at `cMinRow`, 2, or more); `cw` and `ch` are read rounded up to whole cells and at least the kind's minimum. A repair that changes a place makes it pending (§3.4); no repair writes `cw` or `ch`.

0. **Sizes.** Every block's width and rows at its stored place: `RESTPASSES` passes of SIZE.8.
1. **Clamp.** A card past its container's right edge moves left to the last column where it fits; an elastic block narrows first, as at the edge (DRAG.A3). A set width wider than its container (an imported note, a `cw` written on a wider window or in a wider area: `normBlock` accepts any positive `cw`, `cw: 80` on a sheet of 59 columns) is shown at the container's full width, from its column 0, as today's `render` caps it at the room it has (2362); its `cw` stays as stored, and is written only when the user sets a width with the handle. SIZE.3 still holds: no rule narrows that block, it is only shown inside its container. An area wider than the sheet is shown the same way, its children laid out in the width shown. A child below its area's set height makes the area taller in the layout (AREA.2).
2. **Separate.** As today's `resolveIn` does: keep a list of placed blocks, empty at first; visit the blocks in reading order of the layout as it stands, ties by id; a block that hits a placed one, or stands in the free cell round an area, goes down alone to the bottom of the block it hits (or below the area's free cell), and is placed; when a pass moved a block, visit again from the start in the updated reading order; stop after a pass that moves nothing. Rows only grow and a placed block never moves, so this ends. It is P-SEP between two uncarried blocks (S6), done before any pair exists.
3. **Pairs.** RELINK with every pair new (§3.3).
4. **Rest.** Phase 9 of SETTLE at rest: `RESTPASSES` passes of SIZE.8 on the separated places, so a text that a moved neighbour no longer presses widens again and a block that came down beside a text narrows it; FOLLOW; P-REST and P-SEP for any hit this leaves; RELINK. This is what `resolveIn` does today by measuring again between its passes.

5. **Temporary heights.** Only now is the displayed layout made (`show`, `LAYOUT-RULES.md` §2.1): «Розгорнути», a code block unfolded while it is edited, the wide field row of P18. Every SETTLE runs on the displayed layout, while `diff`, the undo and the next action keep the canonical one, so none of them is ever written.

`open()` records which blocks steps 1, 2 and 4 moved or resized, for §3.4, so the first action's writes and its own are told apart.

**If `open()` fails.** The reading and the steps above give a layout for every note `normBlocks` accepts; only a bug can exceed a bound inside them (§4.2). Then `open()` returns `{failed, layout}`, every block at its read place and size and nothing separated. The bridge shows that layout, turns placement off for that note in this tab (no carry, handle, arrow, area gesture or creation on the sheet; typing and the commands that are not placement stay, and a height change moves nothing, so blocks may overlap as shown), writes nothing for it, and says so in a strip with its own key in `uk.json` and `en.json`; the dev look reports the case. The stored note is untouched, and the next start tries again.

The result is the layout the next action starts from; what the reading and steps 1–4 changed are pending places, written with the first user action in their container (§3.4). `open()` is deterministic: the same stored note gives the same layout on every device that measures the same. The current version keeps writing its own pushes until 0.1 reaches every device (§7); `open()` reads them as places like any other.

## 4. Engineering points settled for 0.1

### 4.1 Determinism (INV-5)

Every visit is in reading order of the layout its phase starts from, ties by id, the ids compared by their code units (`a < b`), never by `localeCompare`, whose order follows the device's language; nothing depends on the order of the stored array (`LAYOUT-MODEL.md` F4). Measured sizes may differ between devices with different fonts; the stored rows are each device's own result of a user action, every stored row is a place for `open()` in 0.1, and what a device separates or re-rests because it measures differently is written only as §3.4 says.

### 4.2 Bounds (E-2)

- `RESTPASSES` is 2 (proposed): two passes of SIZE.8 in phase 9 (a). The reference in the tests runs passes until two in a row give the same layout, or as many passes as the container has blocks; a case where two passes differ from it, or that reaches that count (a cycle), becomes a regression test, and the number is raised or the rule fixed.
- Phase 9 (b) ends within `RESTSTEPS` steps (`LAYOUT-RULES.md` §1.5, §5.1): each step moves a block right within the container or down, and narrows elastic blocks only, so the sum of the blocks' columns and rows rises at every step and has a ceiling. `open()`'s separation (§3.5 step 2) only moves blocks down, a placed one never, so it ends too.
- Restarts: phase 3 restarts at most once for every neighbour passed in the carry; phase 11 at most once per pointer move.
- A bound exceeded is a bug: `settle` returns `{failed}` (`LAYOUT-RULES.md` §5.5), so the action writes nothing and a gesture ends as a cancel; `open()` returns `{failed, layout}` (§3.5). The dev look reports both with the change and the layout, for a test.
- Step 2 tests the bounds where width, height and FOLLOW feed each other (a text that widens gets shorter and lifts the blocks under it into the rows of another text, which then narrows), on long chains of neighbours pressed aside and down, and on large accepted notes (the generated note of §4.5 and the owner's exported notes), not only on small random sheets.

### 4.3 Measuring (E-3)

```js
/** @typedef {{rows(id:string, cells:number):number, natural(id:string):number}} Measure   // by block id: the browser's measure reads the content through the bridge, the Node stub from a map id → {kind, text, wrap} */
```

- **Browser:** one hidden measuring element per kind, styled with the block's own classes, in the sheet so that the text size and the font are the page's, filled with the same sanitized content the block shows (`cleanRich`). Results are cached by a **measurement signature**: the kind and its options (a code block's `wrap`, `num` and language header, an area's title and `collapsed`); the content as rendered, chips with their resolved labels (`linkChip`, 1898); the width in cells; the text size; the text placement and field (P18); and a font epoch, raised by `document.fonts` when a face loads. A placeholder is never measured (PR-8): an empty text's natural width is one cell.
- **Re-measuring.** A change of a block's signature is a size change of that block (phase 1a). Made by the user in the note (typing, a code toggle), it is an action and writes as §3.4 says. Otherwise it is a view-only re-measure, which shows and writes nothing and has no undo entry, what it moves becoming pending (§3.4): the text placement changed in the settings (P18, a device setting in 0.1, which acts on rows as a font does, `LAYOUT-RULES.md` VIEW.6a); a linked note renamed elsewhere, whose chips `liveLinks` relabels (2202) through `renderBacklinks`, not through `relayout`, so today's layout call sites do not see it; a font that loads after the note opened.
- **Node:** a stub: a text of `n` characters is `ceil(n / (cells × 3))` rows and `ceil(n_longest_line / 3)` cells wide; code is one row per line and never wraps unless its `wrap` is set; an area's header is one row unless a test says otherwise; so tests state their expectations in cells.

### 4.4 Passports (E-4)

```js
/** @typedef {{width:'text'|'set', minCells(box:Box, measure:Measure):number, rows(box:Box, cells:number, measure:Measure):number, container:null|{headerRows(box:Box, measure:Measure):number}}} Kind
 *  width: 'text', elastic by SIZE.1–SIZE.4 unless `cw`; 'set', `cw` always.
 *  rows: a leaf's rows at a width; for an area the passport gives only its header (`headerRows`, measured: today's header wraps on a narrow
 *  area, `areaMeasure`) and its `ch`; the area's height is its children's layout plus the header, from the engine's recursion (LAYOUT-RULES §5.4) */
```

| Kind | Elastic | Width | Shown height | Container |
|---|---|---|---|---|
| text | `text` unless `cw` | SIZE.1, `TEXTW`, `MINC` | content rows, or `ch` when larger | no |
| code | `text` unless `cw` (W14) | as a text: its natural width its longest line, at most `TEXTW`, giving way by SIZE.2; never below `MINW_CODE` (its header) | as today: folded at `ch` unless `open`; its lines wrap or scroll sideways by its `wrap` | no |
| area | `set` | `cw`, at least 12 cells as today | header plus its children's rows, or `ch` when larger; the header only when collapsed | yes: its header's rows |

**One fold.** The engine knows one fold: the rows shown plus one row for «Розгорнути» when the content is longer (SIZE.6). In 0.1 only code has one, read by its passport from its `ch` unless `open`, as today. 0.2 gives every kind that folds one standard stored field and one look and command (A3), so the engine does not change for it.

**Code is elastic as a text (W14).** Today a code block without `cw` takes all the room to its right neighbour (`rawWidth`, `index.html` 2351–2362); in 0.1 it is as wide as its longest line, up to `TEXTW`, like a text, and the user widens it by hand when needed. Nothing stored changes; a code block with long lines looks narrower than today, its lines wrapped or scrolled sideways by its own setting.

A text's measured width and the cell size follow the text size: a larger text size makes `G` larger (`--g`, as `applyText` does today), so the sheet scales and no column or row changes; the measuring cache is cleared. A new kind (a checklist, an image) adds a passport and nothing else in the engine.

### 4.5 Performance

`LAYOUT-MODEL.md` F8 measured today's code at 63 s to open a note of 120 blocks, most of it DOM measurement repeated in three passes. The budgets for 0.1 count the measuring: on a generated note of 120 blocks in two containers, with a cold measuring cache, opening the note under 150 ms and at most one measurement per block and width tried; one pointer move of a carry under 8 ms with a warm cache; one keystroke that grows a text under 4 ms plus one measurement. The engine works per container; FOLLOW and RELINK are linear in the pairs after sorting; a pointer move runs one SETTLE from `start`. `open()`'s sizes step (§3.5) is the bulk of the measurements on opening. Step 1 measures the engine in Node, step 4 the measuring in Chromium, step 5 the whole in the app. In the browser a budget counts the whole path, the blocks' DOM made, measured and drawn, not the engine alone; every result is recorded with the machine and the fixture it ran on: a generated note of 120 blocks kept in `tests/fixtures/`, on CI's Chromium and on the owner's 14-inch laptop.

## 5. Steps

Each step is one PR into `main` with every test green, the build marker raised and, for files under `public/`, the SRI hashes written (`node tests/hashes.mjs --write`). Steps 1–4 add the engine with no effect on the app; step 5 wires it behind the switch; step 6 makes it the default and removes today's layout code.

| Step | What | Tests | Effect on the app |
|---|---|---|---|
| 1 | `shapes.js`, `size.js`, `gap.js` (with RELINK from places), `kinds.js`, the Node measuring stub | `tests/layoutsize.mjs`, `tests/layoutgap.mjs`: SIZE and GAP rules, INV-2, INV-3, INV-7 b, determinism under shuffled storage; GAP.5 rule 3a (a block come between by itself, deleted, narrowed back, grown and shrunk; the upper block still a neighbour in other columns or not; several upper neighbours; a pair it had already; above a head block), a gap that does not hold its block kept through grow and shrink (rule 1), the lend per pair | none |
| 2 | `settle.js`: the phases, the primitives, containment, the change table, the failure result; `open()` with its reading and normalisation (§3.5) | `tests/layoutsettle.mjs`: each primitive alone, the phase order and which phases each change runs (a side handle whose child sinks into spare rows of the area, and one refused), INV-1 to INV-5 after every SETTLE, the review's regression cases, the bounds and the failure (§4.2); `tests/layoutopen.mjs`: accepted legacy and import fixtures (`cw: 80`, a fractional or negative `col`, `row` or `fx`, a self-parented area, a child of a text or of a missing area, an empty text), the pending places, the fallback | none |
| 3 | `drag.js` and `ops.js`: targets, the carry memory, letting through, entering and leaving areas, every action of §5.2 in 0.1 with its undo; `show` and `unshow` | `tests/layoutdrag.mjs`, `tests/layoutops.mjs`: the mockup's scenarios as cases, INV-7 a, INV-8 (the last preview equals the drop); undo (§6.4): two and three undos in a row on the exact path, a chain of blocks pressed aside undone, an undo after a height edit on the inverse path; a gesture with wide fields and one with a temporary expansion, dropped and cancelled, storing canonical fields | none |
| 4 | `measure.js`, `view.js`, `input.js` | `tests/layoutview.mjs` in Chromium on a page of the engine alone, kept in `tests/lib/` (never in `public/`) and served by `tests/lib/server.mjs` from a second root next to `public/`: carry, hold, Shift, Esc, arrows, handles, areas, drawing, the narrow view, the reading mode; the measurement signature with a warm cache: a linked note renamed, the text placement changed, a font loaded late | none |
| 5 | `bridge.js` and the switch: with the switch on, `index.html` calls the engine where it calls today's layout (§6); the dev look shows INV violations | the existing browser scenarios with the switch off as today; with it on, by the table of §5.1; the round trip of an unmoved note (§3.1), byte for byte; the first action's write of pending places and its undo; a note saved by the current version with its pushes; two devices with deliberately different measurements editing one note; a change from another tab, a lock, a change of owner and «Історія» opened during a gesture (§6); wide fields turned on, a block carried, the setting turned off, the note reloaded, its stored fields compared | only with the switch on |
| 6 | The switch on by default; today's layout functions removed; `LAYOUT-MODEL.md` §8 departures closed | the existing scenarios with the engine only; `tests/lab/layout-probes.mjs` re-run and recorded | the engine for everyone on `.dev` |

### 5.1 The browser scenarios with the switch on

Some scenarios assert today's behaviour that a decision changes, so they cannot pass with the switch on. Step 5 writes, in `tests/README.md`, a table of every scenario: **kept** (it passes as it is), **new expectation** (the same steps, the decided result: `appflow` and `appdrop` without permanent pushes, `appwidth` with elastic widths and `SHEETW`, `appdrop` with letting through), or **replaced** (a new scenario for the decision: `apptouch` with a tap on the empty sheet that makes no block, a hold that shows the borders, «+» that creates one, and a «⋯» menu with no position mode, no «В область…» or «З області» and no «Розмір» (W13), `appsel` with position mode on a computer, entered from the block's menu, its arrows jumping as today and pushing by the rules of a carry, and absent on touch, `applabels` with the narrow view, the hover ghost gone). With the switch on, step 5 also runs the scenarios that are not about placement and guard the release: the offline start and the service worker (`appsw`), the integrity hashes (`appsri`, `tests/hashes.mjs` with the `layout/` files), the update strip (`appupdate`). Step 6 deletes the old expectations with the old code.

Release of 0.1 to `.app` is a PR `main → prod` when the owner asks, after the owner has used it on `.dev`. 0.1 changes no stored field, so the export before the release is a precaution, not the CLAUDE.md requirement for a storage change. Two rehearsals are still release gates: a copy of the owner's exported notes imported on `.dev`, edited with the switch on, then opened and edited with it off (the current code) and exported again, with nothing lost and every block where it was; and the same notes edited on two devices at once, one with the switch on and one with it off, making only the conflict copies sync makes today.

## 6. The boundary with `index.html`

The bridge is the only module that reads or writes `index.html`'s block objects. `index.html` changes in three ways only:

1. **Where it lays out today, it calls the bridge.** Each call site of today's layout functions (§6.1) becomes one call: `LAYOUT.change(type, …)` for a user action, `LAYOUT.open()` when a note is shown or changed from outside, `LAYOUT.draw()` when only the look changed. With the switch off the old call stays.
2. **Its gestures for placement are handed over.** The carry by the grip, the arrows of position mode, the width and height handles, the area's handles, drawing an area and the click on the empty sheet are `input.js`'s; `index.html` keeps the gestures that are not placement (selection, entering and leaving position mode from the block's menu, the menus); the long press of position mode on touch is off in 0.1 (W13).
3. **The undo stack gets the engine's entries.** An engine action returns the stored fields before and after; the bridge pushes them as one entry of the existing structural undo stack (C2), so Ctrl+Z, the toasts and the history treat them as they treat any structural change.

Two more rules hold at the boundary:

- **Guards.** An engine action runs only where today's placement code may run: never while the note is read-only (the trash, a version shown in «Історія», the storage lock, a tab turned view-only by a newer format); and the bridge writes through today's pipeline (`markDirty`, `update`, the editor snapshot that sync reads), never around it.
- **Stale gestures.** A gesture held when the note changes from outside (another tab or device), the note is switched or closed, «Історія» opens, the tab turns read-only or the account's owner changes, ends at once as a cancel (DRAG.C3): nothing is stored, and the layout drawn next is the one `open()` gives. No gesture finishes on a layout that is no longer the note's.

Commands that are not placement keep their code and, where they change the layout, call the bridge:

| Command | Change for the engine |
|---|---|
| Delete a block (menu, Backspace in an empty block, clearing the sheet) | `remove` (GAP.6); an empty block left on blur as EDIT.4 says; an area's children are taken away with it in the same change |
| Paste a block on the sheet, `+`, «блок після», a new area by its button | `create` at its cell (§5.2, EDIT.4, VIEW.4) |
| Convert to code or to text (`toCode`, `toText`, 2509–2510, which remove the block and make it again) | a size change (phase 1a) with the new passport: the bridge keeps the block's `Box` by its id across the rebuild |
| «В область…» and «З області» | `enter` and `leave` (AREA.7) |
| Ungroup an area | `ungroup`: the area is taken away and each child is put on the sheet on the very cells it stood on inside, as today (`index.html` 2676–2677), in reading order, through SETTLE; one undo entry |
| Typing, Enter, a paste into a block, a code or area title, code wrap and numbers | a size change (phase 1a) |
| «Розгорнути» and «Згорнути» of a text | a temporary height, written never (H3) |
| The code block's own «more» (`open`), its `wrap` and `num` | a size change, written, as today (§3.2) |
| A code block unfolded while it is edited (`unlock`, `lock`) | a temporary height (H4), written never |
| Collapse and open an area (kept as today, A3) | a size change of the area (§3.2) |
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
| `showVersion`, `showNow` | 3218, 3232 | `open()` read-only for the version shown, the note's layout and pairs kept aside by the bridge; on leaving they are put back, or found by `open()` if the note changed from outside meanwhile |
| `putState` (restore) | 3233 | stored fields put back, `open()`, then the save as today |
| Import | 2244–2255 | `open()` through `redrawCur` / `openNote` |
| `createAt`, `createIn`, `createNext`, `createAfter`, `areaBtn`, paste on the sheet | 2740, 2694, 2749, 2845, 3024, 3025–3030 | `ops.create` |
| `remove` → `resolve(); update()` | 2673, callers 2814, 2665, 2560, 2938–2942, 3134 | `ops.remove`; clearing the sheet opens an empty layout |
| `moveInto`, `pullOut`, `ungroup`, `restoreArea` | 2825, 2827, 2676, 2670 | `ops.enter`, `ops.leave`; `restoreArea` is an undo (put back and `open()`) |
| `relayout(b)` | 2449, from typing 2462–2483, code 2555–2602, titles 2531–2532 and 2691–2692 | `ops.grow` (a size change); from the code block's `unlock` and `lock` (2552–2558), a temporary height (H4) |
| `liveLinks` → `renderBacklinks`, `linkChip` | 2202, 1898 | a view-only re-measure of the blocks whose chips changed label (§4.3); today it moves nothing |
| `document.fonts` (new) | — | a view-only re-measure when a face loads after the note opened (§4.3) |
| `placeUndo` | 2820–2824 | the engine's undo entries; it also snapshots `collapsed`, which it misses today |
| `snapBlock` and the arrow bar | 2763–2772 | `ops.arrow`: the jump's target cell found in the `Layout`, in cells, by the rule `snapBlock` applies today in pixels, then a carry dropped at once (DRAG.C4, W15); `selBlk`, `enterSel`, `exitSel` stay in `index.html`; `selHoldOn`, the long press on touch, is off in 0.1 (W13) |
| `drag(b, grip, o)` on the grip and the card bar | 3038–3118, attached at 2411 and 2413 | `input.js` carries by the grip and by a code or area header; a grip tapped without a move calls back into `index.html` (copy with a mouse, focus for code) as 3115 does; on touch it does nothing in 0.1, since position mode waits there (W13) |
| `resizer` and `sizeMenu` | 2423–2448, set up at 2503, 2591, 2730; 2830 | `input.js` handles (RESIZE, AREA.3); the size menu calls `ops.width` / `ops.height` |
| Area collapse `.fold` | 2704 | `ops.grow` for the area |
| `marqGest`, `createArea`, `areaFromRect` | 3000–3011 | `input.js` draws, `ops.drawArea` (AREA.7b) |
| The hover ghost on the empty sheet | 3017–3022 | gone: EDIT.2 shows the cell cursor only |
| `holdGesture` on the sheet and in an area | 2935, 2943, 2700 | see §6.3 |
| The block menu on touch, the «⋯» button | 2457–2458, `blockMenu` 2807–2812 | with the switch on, on touch it hides «Виділити», «В область…», «З області» and «Розмір» (W13, VIEW.3); `enterSel`, `moveInto`, `pullOut` and `sizeMenu` also refuse under `TOUCH` |
| A text's `blur` | 2459 | the fitted scale is recomputed when the caret leaves a block (W16); an `open()` from another tab or device while the caret is in a block waits for that too |
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

- **The sheet has a width.** A note's sheet is `SHEETW` columns on every device, with white room to the right on a wide window; a narrow window scales the note by the width it uses, up to its rightmost block, so a note on the left of the sheet stays at full size in a half-screen window (W2, W7, W12, §3.1). Today a sheet block's place is a share of the window's width.
- **Old notes may shift once.** A note whose stored places overlap or stick out at `W0px` is shown separated and clamped (§3.5); those places are written with the user's first action in that container (§3.4), not before. A block whose set width is wider than the sheet is shown as wide as the sheet, its stored width kept.
- **The phone and the tablet move nothing** (W13). They read, write, delete and create blocks by «+»; nothing is carried, resized or moved by position mode, which goes away on touch until the touch stage. On a computer position mode stays, entered from the block's menu, and its arrows jump as today (W15). A phone or a tablet shows the real layout when the note fits it at the minimum scale by the width the note uses (W12), a narrow note even on a phone, and the narrow view otherwise (W6, VIEW.2–VIEW.5). Today both show the free sheet, with position mode on a hold.
- **Touch on the empty sheet** makes no block (W13): a hold shows the borders while it is held (VIEW.6a); a new block comes from «+». Today a hold creates one.
- **The block's «⋯» menu on touch** loses «Виділити», «В область…», «З області» and «Розмір» in 0.1 (W13); copying, deleting, converting, colour and links stay.
- **Hover on the empty sheet** shows the cell cursor only, no ghost of a block (EDIT.2).
- **Pushes are not permanent.** A block that grows and shrinks back leaves its neighbours where they were (H1, G1); today they stay pushed (`LAYOUT-MODEL.md` F3).
- **The rest of `LAYOUT-RULES.md`:** letting through by holding or Shift, elastic widths, guides and sticking, the reading mode, areas entered by the pointer and stopping a block at their frame (A1, A2), both side handles of an area, drawing an area with at least 4 × 2 cells, then widened to the area's minimum width (12 cells, as today) (A2).

### 6.4 Undo

Today's structural undo is one stack per note (`offerUndo`, `index.html` 2618): the toast's button, Ctrl+Z outside the fields and the header's «Скасувати» all undo the top entry (`doUndo`, 2632); a newer entry replaces the toast; there is no structural redo; a change from outside drops every entry that is not marked `safe` (`undoStale`, 2616). The engine fits into it as follows.

- **An entry.** An engine action pushes one entry (C2) with the toast it has today. It carries the stored fields the action wrote, before and after, the canonical layout and pairs before the action (which after §3.5 may differ from the stored fields), and two **state identities**. The bridge gives every canonical layout it holds an identity, a fresh one for every change applied to it: an action, a size change from typing, a view-only re-measure (§4.3), a re-open, an undo. The entry records the identity of the layout the action started from (`before`) and of its result (`after`).
- **Undo with nothing applied since** (the current identity is the entry's `after`): the fields' «before» values, the layout and the pairs are put back, with no SETTLE, and the current identity becomes the entry's `before` again; the layout is exactly the one before the action. So undoing B and then A, with nothing between, takes this path both times: once B is undone, the identity is B's `before`, which is A's `after`.
- **Undo after changes applied since** (the current identity is not the entry's `after`). Only changes with no entry of their own can come between, since a structural action pushes a new top entry: typing that changed heights, a fold, a view-only re-measure. Then the undo runs SETTLE so that nothing overlaps: an undone deletion makes the block again as `create` at its stored cell, in reading order, an area first and its children then entering it; an undone move carries the block back as a drop at its old cell; an undone resize sets the old size; an undone creation removes the block; an undone `enter` is a `leave` back to its old cell and the other way round; an undone `ungroup` makes the area again as `create` and its children enter it at their old cells. This is the rule EDIT.4 states for a new block taken away.
- **No redo**, as today.
- **Changes from outside.** Engine entries are not `safe`: a change from another tab or device drops them, as it drops today's entries, since their layouts are stale.
- `placeUndo` snapshots `collapsed` too, which it misses today.
- An entry passes its `size` to `offerUndo`, counting the layout and pairs it carries, so `trimUndo` keeps the stack within `UNDO_BYTES`.

## 7. Risks

- **Notes made at another width.** Reading `fx` at `W0` moves sheet blocks of notes made on a much wider or narrower sheet. Mitigation: `W0` chosen from the owner's notes; the switch lets the owner compare before step 6; the engine writes nothing until the user acts.
- **Two layouts in one tab.** Between steps 5 and 6 both exist; the switch is read once when the tab starts (§1), so a tab runs one of them only.
- **The current version keeps writing pushes.** Today's `resolveIn` writes pushed rows (`index.html` 2379) and saves them with the next edit; `relayout` does so on every keystroke. Every edit on a device or in a tab without 0.1 (the switch off, or `.app` before the release) keeps sending permanent pushes into notes that 0.1 reads as places. So G1 and INV-7 hold only among devices and tabs that run 0.1; the owner is told before using the switch on `.dev` with notes edited elsewhere.
- **Rows of different fonts.** A device that measures a text taller than the device that wrote the note separates the blocks under it on opening and writes those rows with its first action in that container (§3.4). Otherwise §3.4 writes only what an action moved, so a keystroke that changes no height writes no row; a keystroke that changes a height writes the rows of the blocks under it, as today, and two devices editing the same note can then make a conflict copy, as today.
- **The text placement variants** (P18) change the insets a text is measured with, so they act on rows like a different font: what a device separates or re-rests because of them is written only as §3.4 says.
- **A larger text size.** `fx` written at a larger text size reads to other columns (§3.1); a current-version tab at a larger text size reads the engine's `fx` to other columns. The owner's answer (§1.3) says whether this touches real notes.
- **A note that cannot be laid out.** Only a bug can make `open()` fail; the note then shows as stored, with placement off and nothing written (§3.5), so such a bug costs moving blocks in that note, never the note.
- **Gestures on the displayed layout.** A drop while a temporary height is in effect stores canonical rows (`LAYOUT-RULES.md` §2.1): the block stays where it was put while the temporary height lasts, and keeps its gaps when it ends; step 5 compares the stored fields with the setting on and off.
- **The structural undo stack and history.** An engine entry must restore exactly the stored fields it changed; tests undo every action and compare the stored blocks.
- **Unknown fields.** 0.1 writes only today's fields, so an older version that edits a note drops nothing of 0.1's. Step 0 of `LAYOUT-MODEL.md` §7 (the editor keeps fields it does not know) moves to 0.2, before the first new field.

## 8. Relation to the other documents

- `LAYOUT-RULES.md`: what the engine does. This plan: how and in which order it is built, and what 0.1 leaves out.
- `LAYOUT-MODEL.md`: its §2 stays the record of decisions; its §5–§7 are replaced by §3–§5 here, and their headers say so; its §8 stays the list of today's departures that step 6 closes.
- `LAYOUT-RULES.md` §16 points here for E-1 to E-5.
- The mockup stays the reference for how a rule feels; its known differences are `LAYOUT-RULES.md` §14.2.

## Review log

- **Independent review, 2026-11-04** (1 blocker, 6 major findings; PR #124). (1) A block that comes between two blocks by itself counts as put into the upper one's gap, the owner's choice after trying three ways in the mockup (S8; `LAYOUT-RULES.md` GAP.5 rule 3a), its lend kept per pair; trying it showed that a gap not holding its block lost rows whenever a text beside it grew and shrank back, so GAP.5 rule 1 now counts only real moves. (2) `open()` reads every value `normBlock` accepts: a set width wider than its container shown at the container's width and never rewritten, coordinates rounded and floored at 0, `make`'s flattening of parents kept; checking it found the sheet's rows offset by `cMinRow`, now in §3.1; a failure shows the note as stored with placement off (§3.5). (3) Undo by state identities instead of a generation, so undos in a row stay exact (§6.4). (4) Which phases a change runs: a wall runs P-ASIDE and P-SINK though it moves no block (`LAYOUT-RULES.md` §5.1a). (5) The canonical and the displayed layout: gestures and SETTLE work on what is shown, `show` and `unshow`, the canonical layout stored (§2.1, §3.5); a code block unfolded while it is edited is a temporary height (§6.1). (6) Phase 9 a fixed sequence bounded by `RESTSTEPS`, a failure result that writes nothing, the reference for `RESTPASSES` bounded (§4.2). (7) A measurement signature with chip labels, kind options, the text placement and a font epoch; a re-measure no user made is shown, its places pending (§4.3, §3.4). Also: the first action's writes generalised as pending places, with §3.5 and §6.3 brought in line; ids compared by code units; guards and stale gestures (§6); the tests and the release rehearsals the review asked for (§5). A verification of the fixes (2 major wording traps in GAP.5 and one contradiction, 6 minor) followed: `base` read by its stored pairs and the lend keyed by the pair `u` → `l` (`LAYOUT-RULES.md` GAP.5); the text placement a view-only re-measure everywhere (§1.1, §4.3, VIEW.6a); a re-measure gives a fresh state identity (§6.4); the row floor after the sheet's offset (§3.5).

- **Checks after the owner's decisions of 2026-11-04** (9 findings, then 6, no blocker). The new decisions (A1–A3, S1–S8, W11–W16, P18) carried into all three documents; the wide field row of P18 a temporary height, applied after `open()` and left out of every SETTLE and `diff` (§3.5); the computer test the app's `TOUCH`; position mode kept on a computer with jumping arrows (W15) and hidden on touch with «В область…», «З області» and «Розмір» (W13); the sheet's auto-scroll and the moments the fitted scale is recomputed (W16); the carry memory keeps each area's lowered bottom; stale text gone. Verdict: ready to start step 1.
- **Round 3 → 4** (6 findings, no blocker; the round-3 answers verified, the children's mapping checked against `ungroup` and `pullOut`). `open()` re-rests after separating, as `resolveIn` re-measures between passes, and records those moves too (§3.5); §4.1 brought in line with §3.4; «З області» uses the column part of the mapping; the fill rule pressed from the right and at the right edge; the header measured; the stub knows `wrap`. Verdict: ready to start step 1.
- **Round 2 → 3** (10 findings, no blocker). The passport's `width` is `text`, `fill` or `set`, with the fill rule written out and INV-8 argued by DRAG.C1 (§4.4); the first action's writes include separations caused by measurement, said plainly, and the risk named (§3.4, §7); a sizes step before the clamp (§3.5); `Box`, `Change`, `Kind` and the Node stub completed, `open()`'s input stated (§2.1, §4.3); «the first action» defined and re-armed by an undo; the separation's visit order as today's `resolveIn`; the children's cells on the sheet in the engine's columns (§3.1); the phone's 18 px text in the owner's question (§1.3); the reverse of `enter`, `leave` and `ungroup` under a changed generation, and the entry's `size` (§6.4); every stored row is a place for `open()` in 0.1.
- **Round 1 → 2** (11 findings). The code block is a «fill» kind whose carried width is the room at the target, so INV-8 holds and DRAG.A5 does not apply (§4.4); the first action in a container writes the places `open()` normalised there (§3.4); the normalisation separates before any pair exists, and `open()` moves to step 2 (§3.5, §5); undo fitted to today's stack: a generation counter, the layout kept apart from the stored fields, only content edits between an entry and its undo, no redo, entries not `safe` (§6.4); ungroup keeps the children on their cells (§6); history keeps the layout aside (§6.1, §3.3); no `colOfX` clamp, the text size as a limit and a question (§3.1, §1.3); §3.4 no longer overstates; `DESKW` not applied in 0.1 (§1.3); `Measure` by block id; `toCode`/`toText` as a size change.
- **Round 0 → 1** (15 findings). `open()` normalises stored places that break the invariants, shown and not written (§3.5); undo after other changes re-creates or carries back through SETTLE (§6.4); the column convention per container and `W0` as a width in pixels tied to today's `colOfX` and `field()` (§3.1); an action writes only what it moved, so devices with different fonts do not rewrite each other's rows (§3.4); the current version's pushes named as a risk, the switch read once per tab; the code block elastic with no cap, as today (§4.4); position mode gone on the phone, the arrows' snapping a question for the owner (§1.3, §6.3); the engine's test page under `tests/lib/`; a table for the browser scenarios with the switch on (§5.1); the events that reset the in-memory pairs (§3.3); missing call sites (`field()`, the started block, the slide, `touchmove`, `placeBacklinks`' helpers, an area's children on delete, the text size); the height handle's wording; performance with the measuring counted; strings and settings deferred to 0.2 stated; a collapsed area is not entered.
