# Layout rules: the decided model, module by module

**Status: specification of 2026-11-01, review round 0.** It gathers every decision the owner has made on placing and moving blocks up to this date, from §2 of [`LAYOUT-MODEL.md`](LAYOUT-MODEL.md) and from the trials in the mockup, and cuts them into modules with explicit boundaries, so that the new engine can be written and tested rule by rule. Where this document and the mockup disagree, this document wins and the difference is listed in §12. Where it and §3 of `LAYOUT-MODEL.md` disagree, this document wins: that section described the anchor-and-sweep model of 2026-10-26, which G1 replaced.

The mockup («Макет выталкивания», a private claude.ai artifact) stays the reference for how each rule feels. Its engine is a set of functions over a state with no page in them (`plan`, `shove`, `relink`, `reflow`, `squeezeH`, `squeezeV`); the names in brackets below point to them.

## 0. How to read

- Every rule has an id, `MODULE.n`, and says what must hold, not how a function does it. After it come the decisions it rests on, in square brackets, and, where useful, the mockup function, in round brackets.
- A module owns its rules. A rule never reads or writes the state of another module except through the inputs and outputs listed in the module's header. When two modules could act on the same block in one step, §9 says which acts first and which wins.
- «Must» is not used: every sentence is a requirement unless it says «for example».
- Numbers that the owner set are settings or constants with a name (§1.4); the rules use the names.

## 1. Vocabulary

### 1.1 Space

- **Cell.** The grid step `G`, 24 px at 16 px text. Dots of the grid sit on cell corners. Every size and threshold is counted in cells; a larger text size scales the sheet and moves nothing.
- **Container.** The sheet, or an area. Each has its own grid of columns `0 … cols−1` and rows `0, 1, …`. An area is a container inside the sheet (§6).
- **Block.** A rectangle of cells in one container: column `col`, row `y`, width `w` in cells, height `h` in rows.
- **Handle cell.** The first cell of a block, column `col`, holds the grip ⋮⋮. It is not part of the block for collisions [M4].
- **Card.** The rest of the block: columns `col+1 … col+w−1`, rows `y … y+h−1`. The card holds the content.
- **Shares a column** (lanes). Two blocks share a column when their cards have a column in common: `a.col+1 < b.col+b.w` and `b.col+1 < a.col+a.w`.
- **Shares a row.** Their row ranges intersect: `a.y < b.y+b.h` and `b.y < a.y+a.h`.
- **Hit.** They share a column and a row. Two blocks of one container never hit (INV-1).
- **Reading order.** By row, then by column.

### 1.2 Sizes

- **Elastic block.** A text whose width was not set by hand. Its width follows its text (SIZE.1).
- **Set width** `cw`. A width set with the handle at the card's right edge. Kept as is (SIZE.3).
- **Set height** `ch`, **fold**. A height set with the handle at the bottom edge: above the content it leaves spare room below the text, below the content it folds the block [H1].
- **Shown height** `h`. The rows the block takes on the sheet: its content rows at its width, or the set room, or the fold plus one row for «Розгорнути», minus the empty lines an area hid (SIZE.6).
- **Natural width.** The width of the longest line of a text, plus the inner padding, in whole cells.

### 1.3 Neighbours and gaps

- **Upper neighbour.** For a block `b`, a block `a` of the same container is an upper neighbour when, in at least one column of `b`'s card, `a` is the nearest block above `b` (`a.y+a.h ≤ b.y`). A block can have several upper neighbours, one per stretch of its columns. `b` is then a lower neighbour of `a`.
- **Head block.** A block with no upper neighbour.
- **Gap.** The empty rows between an upper neighbour and a lower one, in their shared columns. A gap is a list of runs `{owner, n}` from top to bottom: `n` rows that belong to block `owner`. A gap exists only between two blocks [G3].
- **Binding gap.** Of a block's upper neighbours, the one whose bottom plus gap is lowest decides the block's row (GAP.4); the other gaps are kept as they are and take over when the binding one goes.
- **Lend.** The rows of a gap that a block put into it covers with its body. The block keeps a note of them and gives them back to the gap when it leaves [G4, C3].

### 1.4 Named settings and constants

| Name | Value | Meaning | Decision |
|---|---|---|---|
| `TEXTW` | 26 cells (16 in the mockup) | The widest an elastic text gets by itself | W3 |
| `MINC` | 6 cells, a setting | The narrowest a long elastic text gets when pressed | W3 |
| `ORDER` | «push first, then narrow» (default), «narrow first, then push», «never narrow»; a setting | How an elastic block gives way | W3 |
| `HOLD` | 0.7 s | Pressing still against a neighbour that long lets the block through | M6 |
| `STILL` | 8 px | A pointer that stays within this radius counts as still | M6 |
| `STICK` | ¾ cell | How far the pointer goes before the block leaves the column or row it was taken from | M7 |
| `NEAR` | ½ cell | The margin to the right of and under a block that still belongs to it for a click | M8 |
| `MINSCALE` | 70 %, a setting | The smallest scale before the narrow view | W2 |
| `FOLDPHONE` | 10 rows | Long blocks fold there in the narrow view | H6 |

## 2. State and invariants

### 2.1 What is stored

For every block: its container, `col`, `y`, the sizes set by hand (`cw`, `ch`, fold), and the count of empty lines an area hid (SIZE.6). For every pair of neighbours: the runs of their gap. For a block standing in a gap: its lend.

What is stored is what is shown on a computer: a block's row and column are where it stands, not an anchor it is pushed away from [G1, W2]. A window, a scale or the narrow view never writes anything (INV-6).

How the gaps and their owners are written into a note, and how they travel with sync, is an engineering point for the engine's design (§13, E-1).

### 2.2 Invariants

The engine keeps these after every operation; each module's tests check them.

- **INV-1 No overlap.** Two blocks of one container never hit.
- **INV-2 Gaps fit the places.** For every block with upper neighbours, `y = max over its upper neighbours a of (a.y + a.h + gap(a, b))`. A head block keeps its row.
- **INV-3 Gaps only between neighbours** [G3]. A block with nothing under it has no gap under it; no gap hangs into empty space.
- **INV-4 Inside the container.** Every card lies within its container's columns, and every block of an area within the area's rows (§6).
- **INV-5 Determinism.** The same state and the same measured sizes give the same layout on every device, whatever order the blocks are stored in.
- **INV-6 Only user actions write.** A layout changes stored places only by: a drop, an arrow in position mode, a resize, a fold set by the handle, creating or deleting a block, a handle of an area, the growth or shrinking of a text (which moves the blocks under it, GAP.4). Showing a note in a window of any width, scaling it, the narrow view, the dev view and «Показати як на компʼютері» write nothing [W2, W6, V1].
- **INV-7 No trace.** A block inserted and taken away again, or carried and brought back to its very place, leaves the layout as it was [C1, C3]. Moves repeated back and forth never make a gap grow [G4].

## 3. Module SIZE: how big a block is

Inputs: a block's content, its set sizes, the container's columns, its neighbours on its rows, `ORDER`, `MINC`, `TEXTW`. Outputs: the block's width `w` and shown height `h`. SIZE knows nothing about carrying; DRAG and AREA call it through two questions only: «how many rows at this width» and «how narrow may this block get» (SIZE.2).

- **SIZE.1 Elastic width at rest.** An elastic text is as wide as its natural width, at most `TEXTW`, and no wider than the room it has: the room ends at the container's right edge and at the handle cell of the nearest block to its right on the rows it takes at that width. It is never narrower than `min(natural width, MINC)`; a neighbour closer than that is a collision resolved by SIZE.7. When room frees up, it widens again by itself [W3]. (`autoCard`)
- **SIZE.2 How an elastic block gives way.** Pressed from either side, it gives way the same way, by `ORDER`: it moves aside as a whole while there is room and narrows where it meets the edge of its container or a block that cannot move; or it narrows first and then moves; or it never narrows. It narrows on the side it is pressed from, down to `min(natural width, MINC)`. When it can neither narrow nor move, the caller decides what happens next (DRAG.B7, AREA.3) [W3]. (`elastic.min`, `elastic.first`, `shove`)
- **SIZE.3 Set width.** A block with `cw` keeps it and is only moved, never narrowed [W3, W4]. A double click on the width handle removes `cw` and makes the block elastic again.
- **SIZE.4 «Never narrow» stays inside.** With `ORDER` «never narrow», an elastic block still never sticks out of its container: its width at rest is capped by the container's right edge (§12, D-4).
- **SIZE.5 Height.** The shown height is the content rows at the block's width, or the set room when it is larger, or the fold plus one row when it is smaller; nothing ever scrolls inside a block [H1–H6]. A text's lines are one cell tall, so a fold always falls between two lines.
- **SIZE.6 Hidden empty lines.** An elastic text with no size set by hand can hide the empty lines at the start and at the end of its text when an area is squeezed from above or below (AREA.4); the lines between paragraphs never hide. The count is stored; the text itself is never changed. The end lines hide first. They come back when the caret is put in the block (EDIT.5) or when the area grows again (AREA.5) [W5].
- **SIZE.7 Collisions at rest.** After sizes change (a text typed, a window that changes `cols` for the sheet), two blocks that hit are separated: if the right one is to the right of the left one, it moves aside as in DRAG.B7; otherwise the lower one, or on the same row the right one, goes down with the blocks under it. Then the gaps are found again (GAP.5). (`sizeTexts`)
- **SIZE.8 Width and height decide each other.** An elastic text's width depends on which neighbours cross its rows, and its rows depend on its width. The engine settles this in a bounded number of passes, the same on every device (§13, E-2).

## 4. Module GAP: neighbours and gaps

Inputs: the places and shown sizes of the blocks of one container. Outputs: the neighbour pairs, their gaps, the lends, and the rows of blocks after a change of size. GAP is the layout's memory: it is the only module that writes gaps.

- **GAP.1 Who are neighbours.** As defined in §1.3: per column of the lower block's card, the nearest block above. The pairs are found again from the places after every change (GAP.5). (`direct`)
- **GAP.2 Whose rows.** Every row of a gap has an owner. A gap is the property of the block above it and moves with that block in its columns; blocks that swap places keep their own gaps [G1, G4].
- **GAP.3 Only between blocks.** A gap exists only between two blocks; pulling the last block of a column up, moving it away or deleting the block under it leaves no gap hanging [G3].
- **GAP.4 A block grows or shrinks.** When a block's shown height changes (typing, unfolding, a fold, a width change), every block with upper neighbours takes the row INV-2 gives it, in reading order: the blocks under it follow with their gaps, and come back when it shrinks. A head block keeps its row [H1, P1]. (`reflow`)
- **GAP.5 After a move, the pairs are found again.** For every pair of neighbours after a change:
  - a pair that was a pair before keeps its rows, changed by how far each of the two went: the upper block went down into the gap, so rows go, its own first; it went up, so the rows it left come under it with their owners; the lower block was pushed down by the carried block, so the new rows belong to the block above; the lower block went up, so rows go; both went the same way, so the gap is unchanged [G5, G1]; (`adjust`, `left`)
  - a new pair whose block between them went away gets the rows above that block, the rows it stood on and the rows under it that were not its own [G2, C3]; (`fresh`)
  - a new pair formed by a block put into a gap: the gap keeps its owners and is split around the block, the part above and the part below, and the block keeps the rows its body covers as its lend [G4]; (`fresh`, `gapUnder`, `gapOver`)
  - any other new pair: the rows belong to the block above.
  - Then each block's binding gap gets any rows it lacks to reach the block's row, owned by its upper neighbour, and no gap is longer than the distance between the pair. (`relink`)
- **GAP.6 A block taken away.** Deleted, or carried out of its columns (DRAG.B2): the blocks under it rise into its place with the rows that were not its own; the rows of its own gap go with it; its lend goes back into the gap it stood in [G2, C3]. (`removed`)
- **GAP.7 Gaps live in their columns.** A block carried to other columns never brings its gap along; in the new columns it gets no gap of its own, so gaps never add up [G4].
- **GAP.8 A head block moved up by hand.** The empty rows it leaves above the next block become its own gap, shown with its letter (open: P14, §13). (`left` with nothing above)

## 5. Module DRAG: carrying a block

DRAG turns a pointer into a layout, once per pointer move, in three stages: the **target** (A) from the pointer, the **plan** (B) from the target, and the **result** (C) shown and stored. Inputs: the layout the move started from, the pointer, the keys, the carry memory (D.1). Outputs: the layout to show, and on a drop the layout to store.

### 5.A The target: where the pointer puts the block

- **DRAG.A1 The cell.** The block's top-left card cell follows the pointer with the offset it was grabbed at, rounded to the nearest cell.
- **DRAG.A2 Sticking.** Carried mostly up or down since it was picked up, the block keeps the column it was taken from until the pointer is `STICK` away from that column; carried mostly sideways, it keeps its row the same way. Once away, it follows the pointer. While a column or row is held, the held value is the target for every later rule in that move, including the judgement of who is above and who below (DRAG.B4) [M7].
- **DRAG.A3 The edges of the container.** Past the right edge, an elastic block narrows so that its left edge stays under the pointer, down to `min(natural width, MINC)`, and then stops; carried back, it widens again. A block with a set width stops at the last column where it fits whole. At the left edge every block stops. With the pointer outside the sheet the state is «outside», and letting go there cancels the move [W4, C1].
- **DRAG.A4 Home.** Exactly on the cell it was taken from, the block is «home»: the layout shown is the one the move started from, and the carry memory of swaps, sides and leaving is cleared. A cell away it is carried like anywhere else [C1].

### 5.B The plan: what moves

The plan is a function of the layout the move started from (or, after a swap, the layout at the swap, DRAG.B6), the target, and the carry memory. It never starts from the previous move's result, so carrying back retraces the way [M5, P1]. (`plan`)

- **DRAG.B1 Only what it touches moves.** A block the carried block does not hit, directly or through a chain of pushed blocks, stays [M1, G4].
- **DRAG.B2 In its columns, or away.** While the carried block's card shares a column with the place it was taken from, its place is held: nothing rises under it [M1]. Once it shares none, it is «away»: its place is freed as by GAP.6, and its old neighbours are above or below it by where they stand (DRAG.B4). Brought back over its place, sharing a column and a row with it, it is no longer away and the place is held again [G2]. A block just made (EDIT.3, VIEW.4) is away from the start, having no place of its own.
- **DRAG.B3 Above or below.** A neighbour the carried block reaches is either above it or below it, judged once per move: a neighbour that shared its columns before the move keeps the side it had, unless the block is away; any other is below when its middle row is below the block's top row (the held row under DRAG.A2) [M1, G2].
- **DRAG.B4 Met from the side.** A neighbour the block hits is met from the side when the overlap across the columns is smaller than the overlap along the rows, or equal and the block was last moved sideways. Once met from the side, it stays so for the rest of the carry while it shares a row with the block's target rows [M5].
- **DRAG.B5 Letting through.** A neighbour touching the block from above or below in the direction of the move lets it through when the pointer stays within `STILL` for `HOLD`, or when Shift is held, even in the middle of a push: it stops where it is, and the block slides over it; when the block's leading edge passes the neighbour's middle, they swap where they stand, each with its own gap, and the carry goes on from that layout. Carried back before the swap, the neighbour is pushed again. A neighbour met from the side never lets the block through [M2, M6, M5].
- **DRAG.B6 Moving aside.** A neighbour met from the side moves away from the block so that their cards no longer share a column, and the blocks it meets go aside with it in a chain. An elastic block gives way by SIZE.2; a block with a set width moves as far as it can, and the block pressing it narrows only by what is left. When there is no room for the neighbour, it goes down for this move (B7), keeps being met from the side, and comes back up, aside and as wide as before, as soon as the block is carried back [M5, W3]. (`shove`, `far`)
- **DRAG.B7 Pushing up.** A neighbour above the block that the block reaches goes up into the room above it: first the gap above it shrinks, then the block above it goes up too, up to the top of the container. When nothing above can give way, the carried block stops lower [M3]. (`up`, `topmost`)
- **DRAG.B8 Pushing down.** A neighbour below the block that the block reaches goes down to the block's bottom, and the blocks under it follow with their gaps. There is no limit [M2]. (`down`)
- **DRAG.B9 What still overlaps.** After B6–B8, any two blocks that still hit are separated: the lower one, or on the same row the right one, goes down with the blocks under it; a block below the carried block goes under it.
- **DRAG.B10 The gaps.** The pairs are found again (GAP.5) with the carried block as the one that may take rows from a gap (lend, gap split).

### 5.C The result: preview, drop, cancel

- **DRAG.C1 The preview is the result.** What is shown during the carry, the ghost and every neighbour, is exactly what the drop stores. The carried block shows the width and height it will have (DRAG.A3). Nothing jumps after the drop.
- **DRAG.C2 Drop.** Letting go in the «move» state stores the plan's layout as one undo entry [C2].
- **DRAG.C3 Cancel.** Esc, the right mouse button, home (DRAG.A4) and letting go outside the sheet store nothing; the layout is the one the move started from [C1].

### 5.D The carry memory

Kept for one carry only, cleared at home (DRAG.A4) and at the drop: the neighbours met from the side and the side each goes to (B4, B6), the neighbour letting the block through and the row it stopped at (B5), whether the block is away (B2), the layout at the last swap (B5), the last axis of movement (B4), and the start of the move for sticking (A2). Nothing else carries over from one pointer move to the next.

## 6. Module AREA: areas and their edges

An area is a container inside the sheet: inside it, every rule of SIZE, GAP, DRAG and EDIT holds with the area's own columns and rows; the interface keeps one level of areas, the engine is written recursively [N1]. Inputs: the area's rectangle, its children's layout. Outputs: the area's new rectangle and its children's layout.

- **AREA.1 Containment.** The children always stay inside the area (INV-4). At its edges a carried child behaves as at the edges of the sheet (DRAG.A3) [W4].
- **AREA.2 Height.** An area is never shorter than its content; it may be set taller with its bottom edge [W5].
- **AREA.3 A side edge carried inwards.** The opposite edge stays. What sticks out past the moving edge is pressed as a block met from the side is pressed (DRAG.B6): the children go inwards in a chain, a block with a set width as far as it can, an elastic one giving way by SIZE.2. A block left with no room on its rows goes down, under what stands in its way, shifted inwards as far as it needs, and there takes its width back. The edge stops where a block cannot fit even alone (a set width wider than the area, or an elastic block's minimum), and where a block, or a block it pushes, would come out past the bottom edge: narrowing never makes an area taller. The left edge works as the right one, mirrored [W5]. (`squeezeH`)
- **AREA.4 The top or bottom edge carried inwards.** The opposite edge stays. Row by row, the area gives up room in this order: first the children move whole, with their gaps, into the free rows; then the gaps between children close, the ones furthest from the moving edge first; then elastic texts hide empty lines (SIZE.6), again furthest from the edge first; then the edge stops. No child changes its column or its order [W5]. (`squeezeV`, `squeezeTB`)
- **AREA.5 An edge carried outwards.** The children keep their places on the sheet; hidden empty lines come back while there is room, the ones nearest the moving edge first [W5]. (`unsqueeze`)
- **AREA.6 One gesture, one entry.** While a handle is held, carrying it back retraces the way; letting go stores the area and its children as one undo entry [W5].
- **AREA.7 Entering and leaving.** How a block enters or leaves an area by carrying is not yet tried in the mockup (§13, O-6).

## 7. Module EDIT: clicks, the caret and new blocks

Inputs: a click or a hover on the sheet, the blocks' rectangles. Outputs: where the caret goes, or a new block. EDIT never moves blocks itself: a new block is placed through DRAG's plan, as a drop of a new block would be.

- **EDIT.1 What a point belongs to.** A point belongs to a block when it lies on its card, the spare room of a set size included, or within `NEAR` to the right of the card or under it. Any other point of a container is empty sheet [M8].
- **EDIT.2 Before the click.** Over a block, its whole frame shows and the cursor is a text cursor; over the empty sheet, the cursor is a cell and nothing else shows [M8].
- **EDIT.3 A click on a block.** On its text, the caret goes there. To the right of a line, it goes to the end of that line. Below the text, in the spare room or within `NEAR` under the card, it goes to the first empty line after the text, made if there is none; clicking below again finds the same line, and only Enter adds lines. A line made this way is taken back when the caret leaves without anything written on it. A block with spare room keeps its height; one without grows by a row, as with Enter [M8].
- **EDIT.4 A click on the empty sheet.** A single click starts a new empty elastic text there, its card on the clicked cell, placed as a carried block dropped there (DRAG.B with the block away from the start, B2). Left empty, it goes away, and the blocks it moved go back, as if it had never been made [M8, C3].
- **EDIT.5 The caret brings hidden lines back.** Putting the caret in a block that hides empty lines (SIZE.6) shows them again [W5].

## 8. Module VIEW: windows, scale, the narrow view, the look

Inputs: the stored layout, the window width, the settings. Outputs: what is drawn. VIEW never writes the layout (INV-6), and it never changes how anything is measured: what it hides or shows does not move a single line of text (§10, lesson 7).

- **VIEW.1 Window and scale.** The width that counts is the note's own, up to the right edge of its rightmost card. A window wider than the note shows it as it is. A narrower one shows the whole sheet scaled down to fit, no smaller than `MINSCALE`. Narrower still, the narrow view (VIEW.2). Widened again, the note is as it was [W2].
- **VIEW.2 The narrow view.** The blocks one under another in reading order, an empty row between them, none wider than the screen; an area as a frame with its children inside in the same way; long blocks folded at `FOLDPHONE` rows in the view only. The layout under it keeps the computer's columns: nothing measured for the narrow view feeds back into the stored layout [W2, W6, H6].
- **VIEW.3 What the narrow view allows.** Reading, writing and formatting text, following links, copying, unfolding and folding for reading, deleting and creating blocks. Not moving, the arrows, the width handle, «В область…» and «З області» [W6].
- **VIEW.4 A block made on a narrow screen.** Made after block X, it goes under X on the computer, in X's column, one empty row lower, placed as a new block dropped there (EDIT.4). «+» puts one at the end of the note at the left margin. In the narrow view it shows by reading order, so it can appear after a block that stands beside X [W6].
- **VIEW.5 «Показати як на компʼютері».** The computer layout scaled to the screen, only to look at [W6].
- **VIEW.6 The look while carrying.** Every block shows its real size as a thin frame, its empty part included; the carried block gets a background; a selected block shows its frame only. Guides follow the carried block: a hairline along the left edge of its card and one along its top, across the sheet, solid where they meet its starting place or another block's edge, the row one paler than the column. The width handle shows only under the pointer [V1, M7].
- **VIEW.7 Two looks.** The app look shows only what VIEW.6 lists. The testing look («dev») adds what the rules work with: the gap bands with their owners and sizes, the blocks' letters, sizes in cells, row numbers, the outline of the place a block was taken from, the focus ring. Both looks are kept in the app; the testing look is switched on to track down a bug [V1].

## 9. Order and precedence

### 9.1 One pointer move

Each pointer move during a carry runs these steps in this order, each reading only what the steps before it produced:

1. DRAG.A1 the cell → A2 sticking → A3 edges → A4 home. Their result is one target: column, row, width, and the state («move», «home», «outside»).
2. If «home» or «outside», stop: the layout shown is the starting one.
3. DRAG.B2 away or in its columns, and GAP.6 if away.
4. DRAG.B5 the neighbour letting the block through, and a swap if its middle is passed (which restarts the plan from the swap's layout).
5. DRAG.B3 above or below, and B4 met from the side, for every neighbour the target reaches.
6. DRAG.B6 moving aside, then B7 pushing up, then B8 pushing down, then B9 what still overlaps.
7. DRAG.B10 the gaps, once.
8. DRAG.C1 the preview.

### 9.2 Which rule wins

- **PR-1 Home first.** At home nothing else runs (DRAG.A4).
- **PR-2 One target per move.** Every rule after step 1 uses the target of step 1, never the raw pointer: the held row of sticking is the row for the side judgement too (DRAG.A2, B3).
- **PR-3 Sides are sticky and exclusive.** A neighbour met from the side is moved aside or pushed down for lack of room; it is never the neighbour that lets the block through (DRAG.B4, B5).
- **PR-4 The neighbour letting the block through is fixed.** It takes no part in moving aside or pushing (DRAG.B5).
- **PR-5 Containment last, and it wins.** A result that would put a block outside its container is not shown: a carried block is clamped at the edge (DRAG.A3); an area's handle stops at the last valid width or height (AREA.3, AREA.4).
- **PR-6 The gaps are found once,** at the end of a step that changed places (DRAG.B10, AREA, SIZE.7). No rule reads gaps written in the middle of a step.
- **PR-7 The plan has no other memory** than the carry memory (§5.D).
- **PR-8 Presentation never changes measurement.** Nothing VIEW draws or hides changes a width or a height (VIEW, §10 lesson 7).

## 10. Lessons from the mockup's bugs

Each bug found while the owner tried the mockup came from two rules meeting without a stated order. The rules above are cut so that each of these has one place where it is decided.

1. **A «home» zone of one cell swallowed pushes** next to the starting place (2026-11-01). Home is the exact cell only (DRAG.A4, PR-1).
2. **Sticking held the row, the side judgement used the pointer**, so neighbours above were pushed down (2026-11-01). One target per move (PR-2).
3. **A neighbour pushed down for lack of room, then held still over, let the block through** and stayed down (2026-10-30). Sides are exclusive (PR-3).
4. **A block brought back into its columns lower down pushed its old lower neighbour through itself** (2026-10-31). Away and back (DRAG.B2, B3).
5. **An area's height did not follow children that went down**, and they stuck out (2026-10-31). Containment last (PR-5).
6. **A carried block's gap piled onto the gaps of its new column** (2026-10-27). Gaps live in their columns (GAP.7).
7. **Room reserved for a testing label made texts wrap early**, which looked like free room in the app look (2026-11-01). Presentation never changes measurement (PR-8).
8. **A new block on the same row as a neighbour judged that neighbour above it** (2026-10-31). A new block is away from the start (DRAG.B2).
9. **The narrow view measured elastic widths with the phone's columns** (2026-10-31). The layout under the narrow view keeps the computer's columns (VIEW.2).
10. **The bottom edge of an area closed a gap and reopened another** when it moved several rows at once (2026-10-31). An edge gives up room one row at a time (AREA.4).
11. **A state class of the mockup collided with the class of another element** and narrowed the sheet, so clicks on its right part did nothing (2026-11-01). For the engine: state names of the view live in their own namespace, and every interface scenario clicks across the whole sheet.

## 11. Tests

Every rule gets fast tests without a browser over the engine's pure functions, as `tests/sync*.mjs` test the sync core; the interface keeps browser scenarios. The mockup's checks are the seed: each line names the mockup scenarios that cover a rule today and the invariant each must assert.

| Module | Rules | Mockup scenarios | Asserts |
|---|---|---|---|
| SIZE | 1–4, 7 | `width`, `widthtext`, `elastic`, `card` | widths at rest, giving way by each `ORDER`, set width kept, INV-1 |
| SIZE | 5–6 | `area5`, `write2` | hidden lines hide and come back, text unchanged |
| GAP | 1–7 | `own`, `grow`, `press`, `leaf`, `one`, `back` | INV-2, INV-3, INV-7 after insert, remove, grow, shrink |
| DRAG.A | 1–4 | `axis`, `drift`, `edge`, `home` | one target per move, sticking, edges, home exact |
| DRAG.B | 2–3 | `away`, `side` | away and back, sides judged by the target |
| DRAG.B | 4, 6 | `side`, `back2`, `back3`, `elastic` | retrace on carry back, chains, far |
| DRAG.B | 5 | `hold2`, `back` | let through, swap, push again when carried back |
| DRAG.B | 7–9 | `up`, `push`, `one` | M3 limit, gaps follow, INV-1 |
| DRAG.C | 1–3 | all drag scenarios | preview equals drop, cancel leaves no trace |
| AREA | 1–6 | `area`, `area4`, `area5`, `inside` | containment, stops, order of giving up room, undo |
| EDIT | 1–5 | `write`, `write2`, `caret`, `click`, `click3` | caret places, one line, fresh block removed with no trace, clicks across the whole sheet |
| VIEW | 1–7 | `mix`, `phone`, `viewshot` | nothing written, computer columns under the narrow view, measurement unchanged by the look |

## 12. The mockup and this document

### 12.1 Comparison options that are not decisions

The mockup keeps switches to compare ways the owner did not choose; the engine implements only the decided one, unless the decision says a setting.

- Horizontal place: «колонка», «доля ширины», «масштаб» (W2 chose «вместе»; the minimum scale is a setting).
- At the edge of the sheet: «возвращается», «упирается» (W4 chose «упругий сужается»).
- An area narrowed below its content: «ручка упирается», «до содержимого» (W5 chose «блоки уходят вниз»).
- Writing next to a block: «как сейчас» (M8 chose «с подсказками»).
- Swapping: «по середине» (M6 chose «подержать или Shift»; whether to keep the middle rule as a setting is O-4).
- Text in its cells, fields, background (P18, open).

`ORDER` is a real setting [W3]; the dev look is a real feature [V1].

### 12.2 Where the mockup differs

- **D-1** The mockup has one area per example, which stands for the sheet; areas inside the sheet, entering and leaving, folding an area are not in it.
- **D-2** The mockup measures text in the page; the engine asks a measuring function (§13, E-3).
- **D-3** The mockup's elastic maximum is 16 cells; the app's is 26 [W3].
- **D-4** With «never narrow» the mockup capped the width at the sheet's edge late (2026-10-31); SIZE.4 makes it a rule.
- **D-5** The mockup draws a fresh block's placeholder «Пишите…» and counts its width; the app's placeholder is the app's own.

## 13. Open questions and engineering points

### 13.1 For the owner

- **O-1 (P14)** A head block moved up by hand: do the rows it leaves become its own gap (GAP.8)?
- **O-2 (P18)** Where the text stands in its cells, which field, which background; with wide fields, one row under every block keeps blocks apart.
- **O-3 (P12)** The release order of the rules against the sync release.
- **O-4** Keep «по середине» as a setting next to M6, or drop it.
- **O-5 (P4–P7)** The phone and the computer working together: stage 2 [W1].
- **O-6** Entering and leaving an area by carrying (AREA.7), and folding an area [H5] in the new model.
- **O-7 (L1)** Pinned blocks: later.

### 13.2 For the engine's design

- **E-1** How the gaps with their owners and the lends are stored in a note and merged by sync; old notes, which have no gaps stored, get them found from their places once (GAP.5 with every pair new).
- **E-2** The number of passes for SIZE.8, and a proof that it ends.
- **E-3** The measuring function: rows at a width and the natural width, in the browser and as a stub in Node tests.
- **E-4** The passports of the kinds of block (text, code, area) as data the engine reads (`LAYOUT-MODEL.md` §3.3).
- **E-5** The steps of `LAYOUT-MODEL.md` §7 are re-planned for this model before the first PR.

## 14. Relation to `LAYOUT-MODEL.md`

This document replaces §3 of `LAYOUT-MODEL.md` (the model rule by rule) and states §4 «Stage 1» as rules (VIEW). The decisions table of its §2 stays the record of what the owner decided and when; every rule here points to it. Its §5 (data), §6 (the module), §7 (steps), §8 (today's code), §9–§11 stay as they are until the engine's design (E-1, E-5) revises them.
