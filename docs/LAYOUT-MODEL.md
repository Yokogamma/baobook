# The layout engine: placing and moving blocks

**Status: plan, draft 2 of 2026-10-26. The owner has read the rules of §3 and settled the height rule (§2, H1–H6). The narrow-screen part (§4) and the other questions (P1–P12) are proposals the owner is still reviewing. Nothing is implemented yet.** Code references are to `main` at `a756ce0`. Draft 1 (2026-10-18) described the model and measured the code; this draft adds the decisions, the module and the steps.

The sheet's defining feature is free placement of blocks on a dot grid: blocks never overlap, and areas hold blocks inside them. This plan puts all of it into one module, `public/layout/`, used by every kind of block, written by the modular rule of `CLAUDE.md` (ES modules split by role, rules covered by Node tests, ready for TypeScript).

The owner's guiding rule for it (2026-10-26): keep it as simple as possible, with universal rules, not a set of rarely used variants for each kind of block. A kind gives the engine data about itself; it never adds behaviour of its own.

## 1. Why

Today the layout lives in `public/index.html` (geometry 2328–2361, sweep 2375–2400, drag 3038–3110, resize 2423–2448, arrows 2762–2770, areas 2676–2830). It breaks its own rules in eight ways, each reproduced in Chromium on `a756ce0` with `tests/lab/layout-probes.mjs` (§8). Three of them become worse with sync: every push the layout saves lands in `row`, `row` is in the sync «place» group (`PLACE`, `public/sync.js:103`), so a push made by a narrow phone screen travels to every device.

## 2. Decisions and open questions

**Decided.** On 2026-10-26 the owner read the rules of §3, had questions only on height, and accepted the height rule with every recommendation on it:

| # | Question | Decision |
|---|---|---|
| H1 | Height | One rule for every kind: a height set above the content leaves room below, a height set below it folds the block with «Розгорнути · ще N рядків». Never a scrollbar |
| H2 | What folds by itself | Only a long paste: a block made by a paste longer than 14 lines starts folded at 12, as code does today. Everything else folds only by the handle |
| H3 | Is «Розгорнути» saved | No. It holds until the note is closed; only the height set by the handle is saved |
| H4 | A caret in a folded block | The block unfolds while the caret is in it and folds back when the caret leaves, as code does today |
| H5 | Areas | Fold to a height like text; folding to the header stays a separate button |
| H6 | Long blocks on a phone | Also fold to 10 rows, in the view only; the computer does not see it |
| N1 | An area inside an area (P3, decided on 2026-10-26) | Not now. The engine is written recursively, the interface keeps one level, and the plan does not grow with it |
| W1 | The order of work (the owner's proposal of 2026-10-26) | Two stages. Stage 1 builds and checks the engine on the computer; a narrow screen only shows the note in a phone-friendly way and never changes the computer layout. Stage 2 makes the phone and the computer work together (§4) |
| L1 | Pinned blocks (the owner, 2026-10-27) | Later, not in this stage. A pinned block, such as a heading, is never moved by other blocks; the user can still move it. Open for then: whether blocks that do not fit above it jump below it or the grown block folds, and what happens while the user types above it |

**Proposed, waiting for the owner.** The recommendations below are not decided yet. P1 and P2 are being tried in an interactive mockup; P4–P7 belong to stage 2 (W1). Where §3–§7 rest on one of them, they name it, and they change if the owner decides otherwise.

| # | Question | Recommended |
|---|---|---|
| P1 | A block pushed aside, once the cause is gone | It returns to its own place. Pushes are never saved |
| P2 | A grows and pushes B; C stands under B with a gap | C moves with B and the gap stays: like wagons, or like lines inserted in a document |
| P4 | Phone and computer | The computer layout is the master. A narrow screen shows a folded view of it (§4) and turns its moves into computer moves. A separate phone memory may come later as an optional field |
| P5 | Order of the fold | Automatic: pairs side by side (label and value) fold row by row, independent columns fold column by column |
| P6 | Short blocks that fit side by side on a phone | They stay side by side |
| P7 | A move made on a phone | Changes the computer layout by the rule «under which block, with which gap» |
| P8 | Horizontal position | Absolute columns. A wider screen shows more empty room on the right; nothing spreads out |
| P9 | Minimum text width | 10 cells, about 25 characters. A neighbour closer than that is a collision, not a squeeze |
| P10 | An area narrowed below its content | Its blocks are pushed left in a chain; the handle stops when they have no room |
| P11 | A sized block that does not fit at the right edge | It is shifted left until it fits; the ghost shows where |
| P12 | Release | The rules that stop pushes from being saved (steps 0–3 of §7) reach `.app` before or with the sync release |

## 3. The model, rule by rule

### 3.1 Cells

The step of the grid is `G = round(1.5 × text size)`: 24 px at 16 px text on a computer, 27 px at 18 px on a phone. Dots sit at `G/2 + k·G` on both axes. A block at `(col, row)` has its text start on dot column `col` and the top of its first line on dot row `row`. The grip, its gap and the text padding sit to the left of the text (`OFF`, 30 px on a computer); the card starts `CL` (24 px) to the right of the block's left edge.

Every size and threshold is in cells: minimum width 10 cells for text (P9) and 12 for code and areas, the text wrap of 26 cells, the margins. A larger text size makes the sheet larger and moves nothing.

An area's body has its own grid, aligned with the sheet so that a child keeps its dots when it enters, leaves or is ungrouped: a child at `(c, r)` of an area at `(A, R)` stands on sheet cell `(A + 1 + c, R + rowOff + r)`, where `rowOff` is the header height in whole rows (the area's top padding `AT` is chosen to make it whole).

### 3.2 Anchor and placement

A block's **anchor** is where the user put it: its container, column and row, and the sizes the user chose (width `cw`, height `ch`, fold). It is stored. A block's **placement** is where it is drawn. It is computed by `place()` every time and never written anywhere.

Only a user action writes anchors (§3.9). Growing text, a fold or unfold, a narrow screen, the text size, a change arriving from another device: all of these change placements, none changes an anchor.

### 3.3 The kind passport

Each kind of block describes itself to the engine with data. Text, code and area have one each now; an image, a table or a checklist later add theirs and get everything else for free.

```js
/**
 * @typedef {{
 *   minCells: number,                       // narrowest width: 10 for text, 12 for code and areas
 *   width: 'text'|'fill'|'set',             // text: up to 26 cells or to a neighbour; fill: what is given; set: cw
 *   contentRows(b, widthCells): number,     // rows needed to show everything at that width (view.js measures)
 *   solid(b): boolean,                      // takes part in collisions; an empty text block does not
 *   container: null | {headerRows(b): number},
 *   fields(b): {cw?, minRows?, foldRows?}   // the kind's stored fields read as the engine's sizes (§5)
 * }} Kind
 */
```

### 3.4 Width

- A text without a set width takes `min(26 cells, room)`. The room ends one cell before the nearest solid neighbour to the right on the rows the text crosses, and at the container's right margin.
- The room never goes below 10 cells (P9). A neighbour closer than that is a collision and is handled by §3.7: whoever is lower, or on the same row more to the right, moves down.
- A set width `cw` is kept as is. If it does not fit, the block moves (P11), it does not shrink.
- Code and areas take the room they are given, at least 12 cells.

The width of a text depends on which neighbours cross its rows, and its rows depend on its width. Draft 1 measured the result: two different layouts of one note before and after a reload (F1). The engine breaks the cycle by looking for neighbours on the text's **natural rows**, the rows it takes at its full width, then measuring the height at the width that gives. One pass, one answer.

### 3.5 Height and folding

A block has a **content height**: the rows it needs to show everything at its width. Text measures its lines, code its lines plus the header, an area its children's shown heights plus its header.

The handle sets a height:

- **above the content**: the block keeps the room below its content (`ch`, as today);
- **below the content**: the block folds. It shows that many rows, the last line fades, and one more row holds «Розгорнути · ще N рядків». Text lines are exactly one cell tall, so a fold always falls between two lines.

Double click on the handle goes back to the content height. Nothing ever scrolls inside a block.

- «Розгорнути» shows the whole block until the note is closed and is not saved (H3); «Згорнути» at the bottom folds it back.
- A caret in a folded block unfolds it until the caret leaves (H4).
- A link to the block, a search hit under the fold, a change lit in «Історія» unfold it. Copying always copies everything.
- Unfolding a block inside a folded or collapsed area unfolds the area too. Areas fold to a height like text (H5); the header button still collapses an area to its header.
- Only a long paste folds by itself (H2). On a phone, long blocks also fold at 10 rows in the view (H6).

The engine needs only the **shown height**: folded rows plus one, or the content, or the set room. Unfolding a block changes its shown height, the sweep moves what is below, and folding it back brings everything back (P1). An area grows with its children's shown heights, so it unfolds with them without code of its own. A folded block keeps its height on every screen; on a narrow one only N in «ще N рядків» grows.

### 3.6 Lanes and collisions

A block covers rows `[row, row + h)`, half-open. Its **lane** is the columns it claims: from its column, `cw` cells if set, otherwise its minimum width. Two solid blocks of one container collide when their rows intersect and the right one starts inside the left one's lane. Only the left block's lane matters, because blocks extend to the right. One free cell between them is enough.

### 3.7 The sweep

For each container, in the canonical order of anchors (row, then column, then id, the order `blockCmp` in `public/sync.js` uses), each block is placed once:

```
pred(b)  = the blocks before b in that order whose lanes cross b's lane
d(a)     = y(a) − anchor(a)                       how far a was moved down
y(b)     = max( anchor(b) + max{ d(a) : a ∈ pred(b) },       wagons: move with what is above (P2)
                max{ y(a) + h(a) : a ∈ pred(b) } )            no overlap: stand under what is above
```

This is the «skyline» of rectangle packing, or the earliest start of a task in scheduling: an exact answer in one pass, `O(n log n)` with an interval index over the lanes. It gives, by construction:

- **no overlap** inside a container;
- **reading order**: nobody overtakes anybody in a lane;
- **determinism**: the same anchors and the same width give the same picture on every device, in any order of the stored array;
- **elasticity** (P1): placements are computed from anchors, so when a cause goes, the blocks are back;
- **gaps kept** (P2): a block moved down takes the blocks below it in its lane along, by the same amount.

There is no «fixed» block. The block being dragged is a ghost with an anchor in the same sweep, and growing text only pushes what is after it in the order.

**Drops and ties.** A drop that takes a neighbour's place stores the dropped block just before that neighbour in the order: its row is the neighbour's row minus a small fraction (a fractional order key, as editors use for ordering lists). It is drawn on the whole row, the neighbour gives way in the sweep, and the neighbour's anchor is not written. Removing the dropped block later lets the neighbour return. When keys come too close, the next user action on that spot rewrites them as whole numbers.

### 3.8 Containers

An area is a sheet inside the sheet: the same rules, recursively; the interface keeps one level (N1). Its width is set by its handle; its height follows its children's shown heights plus its header, or a fold (H5), or a collapse to the header. Its children always stay inside: in the view, a child that would stick out is moved left to the last column where it fits and down if it then collides. Narrowing the area with its handle pushes its children left in a chain and stops when they have no room (P10). A block enters an area when it touches it or the pointer is over it, and leaves when it is pulled out past the edge.

### 3.9 What writes anchors

Only these, each with its undo entry: a drop, an arrow in position mode, entering or leaving an area, ungrouping, a resize (and the neighbours it pushes sideways, P10 and today's widening chain), a fold set by the handle, creating and deleting a block, a move on a phone translated by §4. Nothing else writes `row`, `col`, `fx`, `parent`, `cw`, `ch` or the fold.

### 3.10 Preview is the result

While a block is dragged, the ghost is measured at the width it will have at the target (a hidden copy of the text at that width), and the sweep with the ghost's anchor is exactly the sweep after the drop. The neighbours show where they will go. Nothing jumps after the drop. The same holds while a resize narrows a text.

### 3.11 Sync

Only anchors travel. Two devices with the same anchors draw the same layout because the sweep uses the same canonical order as the sync core. A merge of the place group from two devices that produces a collision is resolved by the sweep on every device in the same way, without writing anything.

## 4. Narrow screens

**Stage 1 (W1; the details are a proposal).** A narrow screen shows the note as a column in reading order, row by row, one empty row between blocks; an area is a frame with its blocks inside in the same way; long blocks fold at 10 rows (H6). There the user reads, writes and formats text, follows links, copies, unfolds and folds for reading, deletes and creates blocks. Moving, the arrows of position mode, the resize handle and «В область…» / «З області» are not available there, so a narrow screen never writes a place. A block created there goes on the computer right under the block it was created after, in that block's column; «+» puts it at the end, at the left margin. «Показати як на компʼютері» stays. For the time of stage 1 a phone cannot start a block anywhere, the freedom the old ribbon lacked.

**Stage 2 (proposal, P4–P7).** The rest of this section is the recommended way to make the two work together.

The computer layout is the master (P4). A screen shows `C` columns. When every block fits (`col + lane ≤ C`), the screen shows the computer layout as is. When some do not, the screen shows a **folded view**, computed from anchors and never stored:

1. **Clamp.** A block that sticks out is moved left to the last column where it fits. Short blocks that then fit side by side stay side by side (P6).
2. **Fold.** Blocks that still collide fold under each other, inside a horizontal band of rows where they stood side by side. The order inside a band is chosen automatically (P5): if each block on the right starts on the same row as a block on the left, they are pairs and fold row by row; otherwise they are columns and fold column by column, the whole left column first.
3. **Gaps stay.** The empty rows inside a column are kept, so a block can still start lower and leave room above it, which the old phone ribbon could not do.
4. **Long blocks fold** at 10 rows in this view (H6).

```
Computer:          Phone, pairs:      Phone, columns:
  A        B         A                  A
                     B                  C
  C        D         C                  B
                     D                  D
```

A move on a narrow screen is translated to the computer by the block above it in the view and the gap (P7): the block goes into that block's container and lane, the given number of empty rows under it. A block created in an empty spot on the phone is placed the same way, or at the left margin at the top when nothing is above. A note started on a phone looks like a tidy column on the left on a computer.

«Показати як на компʼютері» stays: the computer layout zoomed out, read-only. A tablet usually fits and shows the computer layout.

## 5. Data

The stored format does not change its fields' meaning in a way old notes notice, and no migration rewrites them.

- **`row` is the anchor.** Today's stored rows already contain old pushes; they are read as anchors. A row may carry a fraction as an order key (§3.7); old code draws it on the same row, a fraction of a pixel off.
- **Sheet columns (P8).** A sheet block gets `col`, absolute, like a child of an area. `normBlock` in `public/sync.js` deletes `col` on sheet blocks today and `blockCmp` orders them by `fx`; both change, in `sync.js`, where the format lives. A block without `col` derives it from `fx` with a fixed reference width `W0`, the same on every device: `col = round((fx × W0 − 12) / 24)`. `fx` is still written, as `col`'s position at `W0`, for older versions.
- **Fold (H1).** Text and areas get an optional `fold`: the rows shown when the user folded the block. It joins the place group (`PLACE`), because it changes the layout. Code keeps its fields: its `ch` already is a fold height, and its `open` means «the user chose the full height». Clicking «Розгорнути» stops writing `open` (H3).
- **Existing long code blocks** keep their look: a code block without `ch` or `open` and longer than 14 lines is shown folded at 12, as today. A new block made by a long paste stores its fold explicitly. Code typed by hand past 14 lines no longer folds by itself.
- **Old notes fold nothing by themselves.** A text whose `ch` is now below its content was a minimum height, not a fold, and stays shown in full: only `fold` folds a text.
- **Unknown fields.** `normBlock` passes unknown fields through, but the editor's `serBlock` (`index.html:2032`) writes only the fields it knows, so an older version that edits a note drops `fold` and the sheet `col`. Step 0 makes the editor keep the fields it does not know, and is released before any new field is written. When the new fields start being written, `FORMAT` is raised (`docs/IDB-BARRIER-PLAN.md`) so older tabs on the same device stop writing.

## 6. The module

`public/layout/`, wired like `public/account/`: loaded through the import map with its SRI hashes, precached by the service worker, listed in `build.json`.

| File | Role | DOM |
|---|---|---|
| `model.js` | The rules: cells, lanes, collisions, the sweep, widths, the folded view for narrow screens, the translation of a narrow-screen move | no |
| `ops.js` | The operations on anchors: drop, arrow, enter, leave, ungroup, resize, fold, create. Each returns the new anchors and its undo | no |
| `view.js` | Draws placements, the ghost, the trace of the old place, the slide; measures a block's content rows at a width | yes |
| `input.js` | Drag by the grip and the header, hold, arrows, the resize handle: turns a pointer into a cell, asks `model` for the preview, calls `ops` | yes |
| `kinds.js` | The passports of text, code and area (§3.3), until the split of the monolith gives each kind its own folder | no |

The main shapes, described once in `model.js`:

```js
/** @typedef {{id:string, kind?:string, parent?:string, col:number, row:number, cw?:number, minRows?:number, foldRows?:number}} Anchor
 *  @typedef {{col:number, row:number, w:number, h:number, folded:boolean}} Placement
 *  @typedef {{cols:number, narrow:boolean, open:Set<string>}} View    // open: blocks unfolded for reading (H3)
 *  @typedef {(a:Anchor, widthCells:number)=>number} Measure           // content rows; view.js in the browser, a stub in Node
 */
export function place(anchors, kinds, view, measure) { /* → Map<id, Placement>, every container, one sweep each */ }
```

- **Measuring is the only link to the browser.** In the browser, `view.js` answers how many rows a block takes at a width. In Node, tests pass a function of the text length. The rules are tested without a browser, and the drag preview asks the same question (§3.10).
- **Gestures stay shared.** `gesture()` (hold, slop, pointer capture) serves the whole page; `input.js` uses it and does not own it.
- **Tests.** `tests/layout*.mjs` run `model.js` and `ops.js` in Node, as `tests/sync*.mjs` run the sync core: every rule of §3 and §4 has cases, and every departure of §8 has a regression case. The browser scenarios (`appdrop`, `appswap`, `appresize`, `appdragcancel`, `apparea`, `appflow`, `appwidth`, `appslide`, `apptouch`, `appsel`) keep the interface and get one new scenario per decision they touch. `tests/lab/` stays out of CI.

## 7. Steps

Each step is one PR with every scenario green.

| Step | What | Closes | Data |
|---|---|---|---|
| 0 | The editor keeps block fields it does not know | the risk of §5 | none |
| 1 | `model.js` extracted as it is, called from `index.html`; Node tests pin today's behaviour | nothing yet | none |
| 2 | The canonical sweep of §3.7, run once after a note loads; widths from natural rows; `G` read once per pass | F1, F4, F8 | none |
| 3 | Anchors: placements are never written; elasticity, wagons, fractional keys for drops; thresholds in cells (P9); `FORMAT` raised | F3, most of F5 | meaning of `row` |
| 4 | Absolute sheet columns (P8) in `sync.js` and the editor; the stage 1 column view for narrow screens (§4) | the rest of F5 | `col` on the sheet |
| 5 | The height rule of §3.5 for every kind | | `fold` |
| 6 | Containment and set widths (P10, P11) | F6, F7 | none |
| 7 | `ops.js` and `input.js`: drag, resize, arrows, areas through `ops`; the ghost measured at the target | F2 | none |

If P12 is accepted, steps 0–3 go out before or with the sync release to `.app` and steps 4–7 may follow it. Steps 0–7 are stage 1 (W1); the folded view and the translation of phone moves of §4 are stage 2 and get their own steps once P4–P7 are answered.

## 8. Today's code against the model

Measured with `node tests/lab/layout-probes.mjs` on `a756ce0` (Chromium 1194; a 1280 px window with the panel open gives a 1000 px sheet; a phone is 390 px). The script asserts nothing.

- **F1. The layout depends on history (fixed by step 2).** A text at column 1 with a neighbour at column 8 crossing its rows narrows to 168 px and 30 rows. Moving the neighbour six rows down leaves it so, because its current 30 rows still cross the neighbour. A reload gives 648 px and 6 rows from the same data.
- **F2. The drag preview is wrong for text that rewraps (step 7).** The ghost keeps the height from where the block was picked up. A 6-row paragraph dropped into a narrower spot became 21 rows and pushed a block below by 10 rows that the preview had left in place.
- **F3. Pushes are permanent and eat the gaps (step 3).** Blocks at rows 2, 4, 6; the first grows to 3 lines: 2, 5, 6; it shrinks back: still 2, 5, 6.
- **F4. The stored array order decides who yields (step 2).** Each block is created with `resolve()` fixing it, so the last one in the array wins. On a phone, stored `[left, right]` puts the left block under the right one; `[right, left]` the other way.
- **F5. A phone edit rewrites the computer layout, and thresholds are in pixels (steps 3 and 4).** Two blocks side by side on a computer fold on a 390 px phone; one keystroke there saves `row 3`, and the blocks are no longer side by side on the computer. With sync this reaches every device. The minimum text width is 140 px: blocks four cells apart collide at 16 px text and stand side by side at 24 px.
- **F6. Children leave their area (step 6).** A 29-cell area on a phone is clamped to the screen, its child at column 20 is not: its right edge is at 720 px, the area's at 374 px, and the page scrolls sideways to 724 px. Narrowing an area from 24 to 14 cells over a child at column 14 leaves the child 140 px outside.
- **F7. A set width is soft at the right edge (step 6).** A text with `cw 20` at column 31 of a 1000 px sheet keeps `cw 20` and is drawn 226 px wide.
- **F8. The cost grows with the cube of the block count (step 2).**

| Blocks | Opening the note | One Enter in a text |
|---|---|---|
| 20 | 0.6 s | 20–40 ms |
| 60 | 8.8 s | 170–220 ms |
| 120 | 63 s | 770–920 ms |

Smaller points: `xConflict` and `colsOverlap` are one predicate twice; a collapsed area is pushed by a dragged block while an open one is entered, against the comment at `index.html:3082`; `lines()` and `noteBlocks()` sort a child by `parent.row + 0.5 + row/1000`, so a child at row 500 or more sorts after the next sheet block.

## 9. Open engineering points

These are not questions for the owner unless noted; the step that meets them settles them with tests.

- **`W0`** for deriving columns from `fx` (step 4, only if P8 is accepted): the sheet width the owner's notes were mostly made at. To ask the owner then: the usual computer and whether the panel is open.
- **Widths in one sweep** (step 2): a text's natural rows may cross a neighbour that is itself pushed down later in the sweep. Either the narrowing uses anchors (deterministic, sometimes narrower than needed) or a second, bounded pass. Both are deterministic; tests decide.
- **The fold of §4:** how a band is found, the tolerance for «the same row» in pairs, the gap between folded columns.
- **← and → in position mode on a narrow screen:** what they mean in the folded view.
- **Fractional keys:** the step between keys and when to renumber.
- **A child crossing an area's fold line** is cut like a line of text.
- **Where passports live** after the monolith split: `public/blocks/<kind>/` is the likely home; `layout/kinds.js` until then.

## 10. Appendix: formulas and analogies

From the discussion of 2026-10-18; they explain why §3.7 is exact and why the alternatives were left out.

- **Not a gas, not a liquid.** A gas spreads blocks evenly and forgets where they were put; a liquid lets them settle and closes every gap (Masonry, the compacting mode of react-grid-layout). Both contradict a free sheet.
- **Rigid bodies.** Physics engines separate overlapping bodies pair by pair, a few iterations at a time. Today's three-pass `resolveIn` is such a solver without a convergence test; F1 and F4 are its typical artefacts.
- **The skyline and the critical path.** With a fixed reading order, «no overlap» becomes `y(b) ≥ y(a) + h(a)` for every `a` before `b` in its lane. The least solution that is not above the anchors is the longest-path formula of §3.7, which is also the nearest solution to the anchors: no optimisation is needed.
- **Anchored springs.** A float on a tether returns when released: elasticity (P1). Today's behaviour is plasticine.
- **Wagons and beads.** Coupled wagons move together and keep their spacing (P2); beads on a thread close the slack first.
- **A soft cell.** A text keeps its area: `h ≈ ceil(chars × charWidth / width)`. At 6 cells a paragraph can become five times taller, at 10 cells (P9) about twice at most.
- **Text around a float.** CSS computes the width of each line from what crosses that line, top to bottom, with no iteration. It is the exact form of «width to the neighbour»; the natural-rows rule of §3.4 is its block-sized version.

## 11. Reproducing the measurements

```sh
npm i --no-save playwright@1.63.0 && npx playwright install chromium   # once
node tests/lab/layout-probes.mjs
```

The script seeds notes straight into IndexedDB, as the `app*.mjs` scenarios do, and prints one line per probe (P1 hysteresis, P2 phone drift, P3 and P15 containment, P4 preview, P5 cost, P6 load order, P7/P19 pushes and gaps, P9 pixel thresholds, P10 soft width).
