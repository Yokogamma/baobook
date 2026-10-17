# Block placement and movement: a model of the sheet

Draft 1, 2026-10-18. The sheet's defining feature is free placement of blocks on a dot grid with no overlap and with one level of nesting (areas). This document states the geometry and the rules as a model, describes what `public/index.html` does today in the same terms, lists where the two differ (each difference reproduced in Chromium with `tests/lab/layout-probes.mjs`), and ends with the questions the owner has to answer before the model is final. Code line numbers refer to `main` at `d3cd90a`.

Status: a proposal. Nothing here is implemented; the current stage is still «no new features».

## 1. Vocabulary

- **Sheet**: the note's canvas, a container with no parent. **Area**: a block that is also a container. **Container**: the sheet or an area.
- **Block**: text, code or area. **Solid**: a block that takes part in collisions. Today everything is solid except a text block with no text (the «Пишіть…» placeholder); a dragged block's ghost is solid.
- **Cell**: one step of the dot grid, `G` px. `G = round(1.5 × font size)`: 24 px at 16 px text on a computer, 27 px at 18 px on a phone, 21…36 px across the text size setting.
- **Anchor**: where the user put a block. **Placement**: where it is drawn after the layout rules are applied. Today the two are the same field.
- **Lane**: the set of columns a block covers horizontally for collision purposes (`need`, see §4).

## 2. Coordinates

Every container has its own integer grid. A block's position is a cell `(col, row)`; its size is `w` cells wide and `h` rows tall (`h` is `lines` in the code).

### 2.1 The sheet

Dots sit at `x = G/2 + k·G`, `y = G/2 + k·G`. A block at `(col, row)` has its text start on the dot column `col` and the top of its first line on the dot row `row`:

```
text_x(col) = G/2 + col·G                    el_left(col) = text_x(col) − OFF
top_y(row)  = G/2 + row·G
```

`OFF = handle + 2 + 6` (30 px on a computer, 28 on a phone) is the grip, its gap and the text padding; `CL = handle + 2` (24 / 22 px) is the grip and the gap, so the card starts at `el_left + CL`. Margins: `col ≥ 1`, `row ≥ 2`; the right margin is `PAD` (one cell on a computer, 16 px on a phone). Columns above the right margin are allowed only as far as the block's minimum width fits (`maxColFor`, line 1550).

### 2.2 An area's inner grid

An area's body has its own grid, aligned to the sheet's so that a block keeps its dots when it enters, leaves or is ungrouped (lines 1538–1544):

```
inner el_left(col) = APAD + col·G,   APAD = G − CL − 1         (−1 px on a computer, +1 on a phone)
inner top_y(row)   = AT + row·G,     AT   = (G − (barH + 1) mod G) mod G
```

`barH` is the header height from the DOM. With `AT` chosen this way, `barH + 1 + AT` is a whole number of rows, so a child at `(c, r)` of an area at `(A, R)` stands on sheet cell `(A + 1 + c, R + rowOff + r)` exactly; `pullOut` and `ungroup` (lines 1885, 2027) use that identity. Inner margins: `col ≥ 0`, `row ≥ 0`, right padding 6 px.

### 2.3 What is stored

Per block (`serBlock`, line 1353): `id`, `row`, `text`; on the sheet `fx`, in an area `parent` and `col`; optional `cw` (width in cells), `ch` (height in rows, a minimum); kind-specific fields. `fx = text_x(col) / W` is the horizontal position as a fraction of the sheet width `W`. On every load and on every change of `W` the column is recomputed, `col = round((fx·W − G/2) / G)` clamped to the margins (`colOfX`, line 1553; `applyMode`, line 2271). A child's `col` is stored as is.

So horizontally the sheet is proportional and the area is absolute; vertically everything is absolute in rows. `h` and the pixel width are never stored: they come from the DOM on every layout.

## 3. Invariants

The rules the sheet promises. «Holds» describes the code today.

| # | Invariant | Holds today |
|---|---|---|
| I1 | **No overlap.** Two solid blocks of one container never collide (§4). | yes, after `resolve` |
| I2 | **Containment.** A child lies inside its area's body: `col ≥ 0` and `el_left(col) + need ≤ innerW − 6`. An area lies inside the sheet. | no: §6 F6 |
| I3 | **Grid.** Every edge that the user sees as a boundary is on a cell boundary; a child keeps its dots across enter, leave, ungroup. | yes |
| I4 | **Reading order.** Displacement never moves a block above a block it was below, nor below a block it was above, in the same lane. | yes for pushes; no for collisions at load (§6 F4) |
| I5 | **Determinism.** The placement is a function of the stored state and the container width only. The same note at the same width looks the same before and after a reload, whatever the history and whatever the order of the stored array. | no: §6 F1, F4 |
| I6 | **Minimality.** Only the blocks that must move, move, and by the least amount that restores I1. | mostly; §6 F3 |
| I7 | **Preview = result.** During a drag or a resize the ghost and the pushed neighbours show exactly what a drop will produce. | no: §6 F2 |
| I8 | **Cells, not pixels.** Every threshold that decides a collision is in cells, so it does not depend on the device's text size. | no: §6 F5 |
| I9 | **Elasticity** (proposed, §7): a displacement disappears with its cause. | no: §6 F3 |

## 4. Collision and width

Rows: a block occupies the half-open interval `[row, row + h)`. Two blocks cross in rows when the intervals intersect.

**Lane width** `need(b)`: how many pixels to the right of `el_left` a block claims, whatever it is drawn at (line 1568):

```
need(b) = cw set ? max(minw(b), CL + cw·G) : minw(b)
minw    = 140 px for text, 288 px for code and areas
```

**Column collision** (`colsOverlap`, line 1569): with `L` the block whose text starts further left,

```
colsOverlap(a, b) ⇔ el_left(R) − el_left(L) < need(L)
```

Only the left block's lane matters, because blocks extend to the right. Two blocks collide (`overlaps`, line 1570) when they cross in rows and `colsOverlap`.

**Drawn width** (`rawWidth`, `render`, lines 1564–1580). A block that does not collide with a right-hand neighbour may still be narrowed by it, the «width to the neighbour» practice from `examples/freeform-editor-practices.html`, scene 4:

```
right(b) = min( cW − padR,  min{ el_left(o) : o solid, o crosses b in rows, text_x(o) > text_x(b) } )
avail(b) = max( minw(b), right(b) − el_left(b) )
w(b)     = cw set     ? min(avail, CL + cw·G)
         : text       ? min(avail, max(minw, CL + 26·G))        — an unsized text wraps at 26 cells (TEXT_CW)
         : avail                                                — code and areas take what they can
```

The card ends where the neighbour's grip begins, so there is exactly one cell between the two texts.

**Height**. Text: `h = round(txt.offsetHeight / G)`, at least `ch`. Code: `h = ceil((card.offsetHeight − 2) / G)`. Area: `h = max(ch, ceil((barH + 1 + AT + content·G + 12) / G))` with `content = max(1, max over children of row + h)`; collapsed: `ceil((barH + 2) / G)` (`areaMeasure`, line 1583).

Note the cycle for an unsized text: `w` depends on which neighbours cross its rows, the rows depend on `h`, and `h` depends on `w`. §6 F1 is this cycle.

## 5. The layout function today

`resolve(fixed)` (line 1598) is called after every change that can move something: a keystroke that changes the line count, a drop, a resize, a fold, a window resize, every `make` while a note loads.

For one container, `resolveIn(a, fixed)` (line 1588) does three passes of:

1. `render` every live block (widths and heights from the DOM, §4);
2. sort: `fixed` first, then `(row, col)`;
3. sweep: for each block in that order, while it collides with an already placed block `p`, set `row = p.row + p.h`; then, if solid, add it to `placed`. At most 60 steps per block.

`resolve` runs that for the dragged block's container, for the sheet, for every area, and for the sheet again, then grows the sheet to its content. Pushes write into `row`, and `row` is what `serBlock` stores: a push is permanent once anything saves the note.

Properties of this function, by construction:

- it only ever moves blocks **down**; a block never comes back up by itself (plastic);
- a pushed block lands **flush** against the bottom edge of what pushed it, closing any gap the user had left (`row = p.row + p.h`, not `row += overlap`);
- the three passes are a fixed number of iterations, not a convergence test;
- `fixed` is the one block that never moves (the dragged or edited one); at load there is one call per `make`, so the last block created is `fixed` against all the earlier ones;
- each pass is `O(n²)` and `rect()` calls `G()`, which reads `getComputedStyle` on every call (lines 824–825, 1563).

Related operations, in model terms:

- **Create** (`createAt`, `createIn`): a one-row, `minw`-wide probe at the clicked cell; allowed if it does not collide (`fits`) and is not too tight (`tooTight`: `minw` must fit before the right margin).
- **Drag** (`drag`, line 2184): the dragged block becomes a solid ghost `probe` and is `fixed`. A neighbour in the same lane yields only after the leading edge of the ghost passes its middle (`approach`, line 2200); before that the ghost lands beside it. Touching an area, or the pointer inside its card, puts the ghost into the area; areas never enter areas; a collapsed area is skipped. Within one cell of the origin the ghost snaps home; outside the sheet a drop goes home. Esc, the right button and losing the window cancel and restore every `row` from `row0`.
- **Resize** (`resizer`, line 1636): `cw = round(px / G)`, at least `ceil(min / G)`; widening pushes same-row neighbours to the right in a chain by `need`, and `cw` is reduced until nothing is pushed past the right margin; `ch` is kept only when it exceeds the content.
- **Arrows on touch** (`snapBlock`, line 1972): to the margins; up under the nearest crossing block above; down above the nearest crossing block below, else under the lowest block.
- **Enter, leave, ungroup** (`moveInto`, `pullOut`, `ungroup`): the identity of §2.2; `moveInto` puts the block at `col 0` under the lowest child.
- **Width change** (`applyMode`): `col` from `fx` for every sheet block, then `resolve()`.

## 6. Where today's code departs from the model

Every item was reproduced with `node tests/lab/layout-probes.mjs` (Chromium 1194, sheet 1000 px wide at a 1280 px window with the panel open, or a 390 px phone). The script is not part of CI: it documents behaviour, it does not assert it.

**F1. Width hysteresis: the layout depends on history, and a reload changes it (I5).** An unsized text at col 1 with a neighbour at col 8 whose row crosses the text's rows gets narrowed to the neighbour and grows tall. Moving the neighbour six rows down, out of the rows a wide text would take, leaves the text narrow, because its *current* 30 rows still cross the neighbour. A reload starts from one line, so the text comes out wide. Measured: 168 px × 30 rows before the reload, 648 px × 6 rows after it, same stored data. Cause: §4's cycle, resolved by three iterations from whatever `h` happens to be. Both results are fixed points of the rules; the rules do not pick one.

**F2. The drag preview is wrong for text that rewraps (I7).** The ghost keeps the height the block had where it was picked up (`probe.lines = b.lines`, line 2216; `render` never re-measures a ghost). Dragged into a narrower spot, a 6-row paragraph became 21 rows after the drop and pushed a block below by 10 rows that the preview had left in place.

**F3. Pushes are plastic and eat the gaps (I6, I9).** Blocks at rows 2, 4, 6. Two Enters in the first make it 3 rows tall: the second block moves to 5, the third stays at 6, so the one-row gaps become none. Deleting the two lines leaves 2, 5, 6: the user's spacing is gone and nothing restores it. Any later save stores the new rows. Scene 2 of the practices shows a push; it does not show that the push is permanent.

**F4. At load, the stored array order decides who yields, not the geometry (I4, I5).** Blocks are created one by one and each `make` runs `resolve(b)` with the new block fixed, so the *last* block in the array wins a collision. Stored `[X at fx .05, Y at fx .3]`, both row 2, folded together on a phone: Y stays at row 2 and the *left* block X goes to row 3, under the right one. Stored `[Y, X]`: the reverse. The order of the array is creation order, which the user never sees.

**F5. One edit on a phone rewrites the desktop layout, and collision thresholds are in pixels (I8, I9).** Same note, two blocks side by side on a computer (cols 2 and 12). On a 390 px phone the proportional columns fold to 1 and 3, they collide, one is pushed down; a single keystroke saves `row 3`, and on the computer the two blocks are no longer side by side. Also `minw` is 140 px: at 16 px text (G 24) blocks four cells apart collide, at 24 px text (G 36) the same blocks stand side by side, so two devices with different text sizes lay out one note differently and each one's edits are saved by the other's rules.

**F6. Children are not kept inside their area (I2).** An area of 29 cells on a 390 px phone is clamped to the sheet, its child at col 20 is not: the child's right edge is at 720 px, the area's at 374, and the page scrolls horizontally to 724 px. Narrowing an area with its handle from 24 to 14 cells over a child at col 14 leaves the child sticking out by 140 px. `maxColFor` is applied only to new positions, never to stored or existing ones.

**F7. A set width is soft near the right edge.** A column is allowed when `minw` fits (`maxColFor`), so a text with `cw = 20` placed at col 31 on a 1000 px sheet keeps `cw 20` in the model but is drawn 226 px wide. The resizer clamps `cw` to the edge; placement does not.

**F8. Cost grows with the cube of the block count.** Opening a note: 20 blocks 0.4 s, 60 blocks 5–8 s, 120 blocks 32–58 s (two runs) (each `make` runs a full `resolve`, each pass is `O(n²)`, each `rect` reads `getComputedStyle`). One Enter in a text block: 26 ms, 200 ms, 700 ms. Beyond about 50 blocks the sheet stops feeling instant.

Smaller points seen in the code, not measured:

- `xConflict` (line 1971) and `colsOverlap` (1569) are the same predicate twice.
- `resolve` runs `resolveIn(null)` twice and every area once on every call, even for a keystroke inside one area.
- A collapsed area is skipped as a drop target, so a block dropped on it pushes it down, while an open area is entered; the comment at line 2228 promises areas are never pushed by a dragged block.
- `lines()` and `noteBlocks()` order a child by `parent.row + 0.5 + row/1000`: a child at row 500 or more sorts after the next sheet block.

## 7. Proposed model

The smallest set of changes that makes I1–I9 hold. Each point stands on its own; §9 lists what needs the owner's decision.

**M1. Anchor and placement are different things.** Store the anchor `(col, row)` the user chose. Compute the placement every time with a pure function `place(state, W, G)`; never write a placement back into the anchor. A drop, an arrow, a resize set anchors; a push, a fold, a device's text size never do. This alone removes F3's permanence, F5's drift and most of F4: what a phone shows is a view, what it saves is what the user did. Cost: a block can be drawn lower than its anchor, so `row` in storage stops meaning «the row you see»; the versions panel, links to blocks and the reading order (`lines`, `noteBlocks`) already use stored rows and keep working.

**M2. One canonical sweep, no fixed block at load.** Order blocks by `(row, col, id)` of their anchors and sweep once per container. A dragged or edited block is fixed only during its own gesture. Collisions at load resolve the same way every time (I5) and the upper-left block stays (I4). Loading calls `place` once after all blocks exist, not once per block (F8).

**M3. Break the width cycle.** Compute an unsized text's width from the neighbours that cross its *natural* rows `[row, row + h(text, 26 cells))`, draw it, measure `h`, and then treat any block that the drawn rectangle now crosses as a collision to push, exactly like a sized block. One pass, one answer, no visual overlap; the reload result of F1 (648 px × 6 rows) is the one it picks. A cheaper interim fix inside the current code: start every `resolveIn` from the natural `h` of each unsized text instead of the inherited one, so a layout and its reload agree.

**M4. Minimal displacement, elastic return.** Displace a block by the smallest number of rows that clears the collision (today's `p.row + p.h`), but from its anchor, so when the pusher shrinks the block returns and the gap comes back (I9). Whether the blocks *below* a displaced block should move with it as one body (keeping the author's spacing while displaced) or stay put until they collide themselves is a taste question, §9 Q4.

**M5. Everything in cells.** `minw` becomes 6 cells for text, 12 for code and areas; `need`, `TEXT_CW` and the paddings are already cells or become cells. The grid step `G` then scales a layout without changing it (I8).

**M6. Containment as a constraint.** An area's width is at least `max over children (col + needCells)`; a child's placed column is `min(col, maxCol)` when the area is narrower than its anchors allow (a view effect, like M1), and the area's inner body clips or scrolls rather than letting a block out. Narrowing by the handle stops at the widest child, or pushes children left in a chain, mirroring how widening pushes neighbours right.

**M7. The ghost is measured at the destination.** Lay the dragged text out at the candidate width (a hidden clone of `.txt`) and use that height for the ghost and for the pushes shown; the drop then changes nothing the preview did not show (I7). The same for a resize that narrows a text.

**M8. Hard width or an explicit fallback.** `maxColFor` uses `need(b)` when `cw` is set, so a sized block is placed where it fits whole; when the container itself is narrower than `cw` (a phone), draw it at the container's width and say so in the model (`w = min(cw, available)`), rather than letting it happen silently.

**M9. Cost.** One sweep per changed container with an interval structure keyed by lane, `G`/`OFF`/`CL` read once per layout, no `getComputedStyle` in the inner loop: `O(n log n)` per layout, which is milliseconds for hundreds of blocks.

What the model keeps as is: the dot grid and its alignment rules (§2), half-open rows, the left block's lane deciding a collision, width to the neighbour with one cell between texts, the «yield after the middle» drag rule, home snapping, chain pushing on resize, one level of nesting unless Q1 says otherwise, and the stored format (M1 adds no field: the stored `row` *is* the anchor; only the writes change).

## 8. Open points in the code that the model does not settle

- Should a dragged block ever push an area, or always enter it? Today: enters an open one, pushes a collapsed one.
- Should empty text blocks stay non-solid? They can be overlapped by a drop and vanish on blur; harmless, but a surprise when a user has several placeholders open.
- `fx` keeps a block proportional to the sheet width. With M1 the fold on a narrow screen becomes a view, but the dot a block sits on still changes with the window width (`round(fx·W)`), so two blocks one cell apart may fall on the same column at another width. An absolute `col` on the sheet with a view-time fold would make the grid stable; it needs a new optional field and a rule for old notes (`col` absent → derive from `fx` once). Q3.

## 9. Questions for the owner

1. **Nesting depth.** «Areas inside areas» or one level, as now? One level keeps §2.2 a single identity; deeper nesting makes `rowOff`/`APAD` compose and the fold rules recursive. The model is written for one level.
2. **Anchors (M1).** Agree that pushes, folds and device metrics never change what is saved? The visible consequence: after a push the saved `row` is above the drawn row, and a block dragged by one row where it stands may «jump» relative to its anchor. Alternative: keep plastic pushes but restore the gaps (F3) and stop saving after a fold (F5) by other means.
3. **Horizontal anchor.** Keep `fx` (proportional: a note made on a wide screen spreads on a wider one and folds on a phone) or move to an absolute column with a view fold? Proportional is what the practices mockup shows; absolute is what the dot grid and the area's inner grid already assume.
4. **Push shape (M4).** When A grows and displaces B, should C below B move with B (keeping B–C spacing) or stay until B reaches it?
5. **Minimum text width.** 140 px ≈ 6 cells ≈ 10 characters makes a paragraph a tall column when a neighbour lands 6 cells to its right (F1's 30 rows). Keep 6 cells, raise it (10–12 cells), or make the minimum for an *unsized* text its own natural width so that a neighbour closer than that pushes instead of narrowing?
6. **Areas narrower than their content (M6).** Clip, scroll inside the area, fold the children like the sheet folds, or forbid (the handle stops at the widest child, a narrow screen scrolls the whole sheet horizontally)?
7. **Sized blocks at the edge (M8).** Refuse the drop, slide the block left so it fits, or draw it narrower and mark it?
8. **Where to start.** The quick fixes (natural `h` at the start of `resolveIn`; one `resolve` after `makeAll`; `G` cached per pass) are small and safe now. M1–M9 together are one layout module, which is also step 15 of the architecture plan («`sheet/layout.js`, the drag probe passed as a parameter»); doing them inside the current file is possible but every PR would touch the same 150 lines as the sync work.

## 10. Reproducing the measurements

```sh
npm i --no-save playwright@1.63.0 && npx playwright install chromium   # once
node tests/lab/layout-probes.mjs
```

The script prints one line per probe (P1 hysteresis, P2 phone drift, P3 and P15 containment, P4 preview, P5 cost, P6 load order, P7 and P19 plastic push and gaps, P9 pixel thresholds, P10 soft width) with the numbers quoted in §6. It seeds notes straight into IndexedDB the way the `app*.mjs` scenarios do and does not assert anything.
