# Layout rules: the decided model, module by module

**Status: specification of 2026-11-01, after review round 1.** It gathers every decision the owner has made on placing and moving blocks up to this date, from §2 of [`LAYOUT-MODEL.md`](LAYOUT-MODEL.md) and from the trials in the mockup, and cuts them into modules with explicit boundaries, so that the new engine can be written and tested rule by rule. Where this document and the mockup disagree, this document wins and the difference is listed in §14. Where it and §3 of `LAYOUT-MODEL.md` disagree, this document wins: that section described the anchor-and-sweep model of 2026-10-26, which G1 replaced.

The mockup («Макет выталкивания», a private claude.ai artifact) stays the reference for how each rule feels. Its engine is a set of functions over a state with no page in them (`plan`, `shove`, `far`, `relink`, `adjust`, `fresh`, `reflow`, `squeezeH`, `squeezeV`); the names in round brackets below point to them.

Rules marked **(proposed)** rest on no decision of the owner yet; they say what the engine does until the owner decides, and §15 lists the question.

## 0. How to read

- Every rule has an id, `MODULE.n`, and says what must hold, not how a function does it. After it come the decisions it rests on, in square brackets, and, where useful, the mockup function, in round brackets.
- A module owns its rules. A rule never reads or writes the state of another module except through the inputs and outputs in the module's header.
- **One solver.** Every change of the layout, whatever the user did, goes through one function, SETTLE (§5): a gesture or an edit only describes its change, and SETTLE applies the phases of §5 in their fixed order. No gesture carries its own pushing code. This is the main defence against rules meeting without a stated order.
- Numbers the owner set are settings or constants with a name (§1.5).

## 1. Vocabulary

### 1.1 Space

- **Cell.** The grid step `G`, 24 px at 16 px text. Dots of the grid sit on cell corners. Every size and threshold is counted in cells; a larger text size scales the sheet and moves nothing.
- **Container.** The sheet, or an area. Each has its own columns `0 … cols−1` and rows `0, 1, …`. An area's `cols` is its width; the sheet's is `SHEETW` (§1.5), the same on every device, never the window's width (O-8).
- **Block.** A rectangle of cells in one container: column `col`, row `y`, width `w` in cells, height `h` in rows. Every block's card is at least one cell wide, an empty text included.
- **Handle cell.** The first cell of a block, column `col`, holds the grip ⋮⋮. It is not part of the block for collisions [M4].
- **Card.** The rest of the block: columns `col+1 … col+w−1`, rows `y … y+h−1`. The card holds the content.
- **Shares a column.** Two blocks share a column when their cards have a column in common: `a.col+1 < b.col+b.w` and `b.col+1 < a.col+a.w`.
- **Shares a row.** Their row ranges intersect: `a.y < b.y+b.h` and `b.y < a.y+a.h`.
- **Hit.** They share a column and a row. Two blocks of one container never hit (INV-1).
- **Reading order.** By row, then by column, then by id. Every rule that visits several blocks visits them in reading order of the layout it starts from (INV-5).

### 1.2 Sizes

- **Elastic block.** A text whose width was not set by hand. Its width follows its text (SIZE.1).
- **Set width** `cw`. A width set with the width handle. Kept as is (SIZE.3).
- **Set height** `ch` and **fold**. One handle at the bottom edge writes one of them (RESIZE.3): released above the content it writes `ch`, a spare room below the text; released below the content it writes `fold`, the rows shown [H1].
- **Shown height** `h`. The rows the block takes now: its content rows at its width, or `ch` when larger, or `fold` plus one row for «Розгорнути» when the content is longer, minus the empty lines an area hid (SIZE.6). It also changes with **temporary heights**, which are shown and never stored: «Розгорнути» until the note is closed [H3], the unfolding while the caret is in a folded block [H4], `FOLDPHONE` in the narrow view [H6], the provisional empty line of EDIT.3.
- **Natural width.** The width of the longest line of a text, plus the inner padding, in whole cells.
- **Rest width.** The width an elastic block has when nothing carries it (SIZE.1).

### 1.3 Neighbours and gaps

- **Upper neighbour.** For a block `b`, a block `a` of the same container is an upper neighbour when, in at least one column of `b`'s card, `a` is the nearest block above `b` (`a.y+a.h ≤ b.y`). A block can have several upper neighbours, one per stretch of its columns; `b` is then a lower neighbour of each.
- **Head block.** A block with no upper neighbour.
- **Gap.** The empty rows between an upper neighbour and a lower one. A gap is a list of runs from top to bottom: `{owner, n}`, `n` rows that belong to block `owner`, or `{nobody, n}`, `n` unowned rows. Unowned rows are free room that was above a head block before a block was put there; they belong to no block, so taking a block away never takes them (GAP.6). A gap exists only between two blocks [G3].
- **Binding gap.** Of a block's upper neighbours, the one whose bottom plus gap is lowest decides the block's row (INV-2); its gap is the binding one. The other gaps are kept as they are and take over when the binding one goes.
- **Lend.** The rows of a gap that a block put into it covers with its body. The block keeps them as its lend and gives them back to the gap when it leaves [G4, C3]. The lend is found again at every relink; a block that stands in no gap has none.

### 1.4 The target of a gesture

- **Target.** What a pointer move asks for, after DRAG.A: the column, the row, the fractional row `frow` (the row of the block's top before rounding, equal to the row when the row is held by sticking), the width, and the state: «move», «home» or «outside».

### 1.5 Named settings and constants

| Name | Value | Meaning | Decision |
|---|---|---|---|
| `SHEETW` | (proposed) a width per note, the same on every device | The sheet's columns: its right edge for rest widths and for carrying | O-8 |
| `TEXTW` | 26 cells (16 in the mockup) | The widest an elastic text gets by itself | W3 |
| `MINC` | 6 cells, a setting | The narrowest a long elastic text gets when pressed | W3 |
| `ORDER` | «push first, then narrow» (default), «narrow first, then push», «never narrow»; a setting | How an elastic block gives way | W3 |
| `HOLD` | 0.7 s | Pressing still against a neighbour that long lets the block through | M6 |
| `STILL` | 8 px | A pointer that stays within this radius counts as still | M6 |
| `STICK` | ¾ cell | How far the pointer goes before the block leaves the column or row it was taken from | M7 |
| `NEAR` | ½ cell | The margin to the right of and under a card that still belongs to it for a click | M8 |
| `MINSCALE` | 70 %, a setting | The smallest scale before the narrow view | W2 |
| `FOLDPHONE` | 10 rows | Long blocks fold there in the narrow view | H6 |
| `PASTEFOLD` | longer than 14 lines → fold at 12 | A block made by a paste starts folded | H2 |

## 2. State and invariants

### 2.1 What is stored and what is derived

**Stored**, for every block: its container, `col`, its sizes set by hand (`cw`, `ch`, `fold`), the count of empty lines an area hid (SIZE.6), and, for a head block, its row `y`. For every pair of neighbours: the runs of its gap. For a block standing in a gap: its lend.

**Derived**, never trusted over the stored state: every block's shown width and height (SIZE), and the row of every block that has upper neighbours, given by INV-2. The engine may store derived rows as a cache; on load and after every change of a shown height the cache is recomputed from the gaps (GAP.4).

So a temporary height (§1.2) moves the blocks under it on the screen and writes nothing: the gaps stay, and when the temporary height ends the blocks are back [H3, H4, H6, G1]. A window, a scale, the narrow view and the dev look write nothing either (INV-6) [W2, W6, V1]. How the gaps, their owners and the lends are written into a note and merged by sync is E-1 (§15).

### 2.2 Invariants

The engine keeps these after every SETTLE; each module's tests check them.

- **INV-1 No overlap.** Two blocks of one container never hit.
- **INV-2 Rows follow the gaps.** For every block with upper neighbours, `y = max over its upper neighbours a of (a.y + a.h + total(gap(a, b)))`. A head block keeps its stored row.
- **INV-3 Gaps only between neighbours** [G3]. A pair that is not a pair of neighbours has no gap; no gap is longer than the distance between its pair.
- **INV-4 Inside the container.** Every card lies within its container's columns; every block of an area lies within the area's rows (§8).
- **INV-5 Determinism.** The same stored state and the same measured sizes give the same layout on every device, whatever order the blocks are stored in. Every rule that visits several blocks visits them in reading order of the layout it starts from; ties go to the upper block, then to the left one.
- **INV-6 Only user actions write.** The stored state changes only by: a drop of a carried block, an arrow in position mode, a width or height handle, a handle of an area, creating or deleting a block, typing (which changes content and so shown heights, but no gap), and putting the caret into a block that hides empty lines (SIZE.6). Nothing else writes [W2, W6, V1].
- **INV-7 No trace.** (a) Within one carry, home gives back the layout the carry started from [C1]. (b) A block inserted and then taken away leaves its neighbours as they were: two blocks that touched touch again, a gap that was there is there again [C3]. (c) Carrying one block back and forth between the same two places, any number of times, never makes a gap longer than the first carry made it [G4].
- **INV-8 The preview is the result.** What any gesture shows while it is held (a carry, a width or height handle, an area's handle) is exactly what letting go stores. Nothing moves after the release.

## 3. Module SIZE: how big a block is

Inputs: a block's content, its set sizes, its container's columns, the blocks on its rows to its right, `ORDER`, `MINC`, `TEXTW`. Outputs, as answers to three questions: the block's rows at a given width; the narrowest it may get (null for a block that never narrows); the number of empty lines at the start and end of its text that may hide. And the rest width of every elastic block. SIZE knows nothing about gestures.

- **SIZE.1 Rest width.** An elastic text is as wide as its natural width, at most `TEXTW`, and no wider than the room it has: the room ends at its container's right edge and at the handle cell of the nearest block to its right on the rows it takes at that width. It is never narrower than `min(natural width, MINC)`; a neighbour closer than that is separated by SETTLE (§5, phase 7). When room frees up, it widens again by itself [W3]. (`autoCard`)
- **SIZE.2 Giving way.** Pressed from either side, an elastic block gives way the same way, by `ORDER`: it moves aside as a whole while there is room and narrows where it meets the edge of its container or a block that cannot move; or it narrows first and then moves; or it never narrows. It narrows on the side it is pressed from, down to `min(natural width, MINC)`. When it can neither narrow nor move, it is pushed up or down by SETTLE [W3, M5]. (`elastic.min`, `elastic.first`, `shove`)
- **SIZE.3 Set width.** A block with `cw` keeps it and is only moved, never narrowed [W3, W4]. A double click on the width handle removes `cw` (RESIZE.2).
- **SIZE.4 «Never narrow» at rest (proposed).** With `ORDER` «never narrow», an elastic block's rest width is capped by its container's right edge only, not by its neighbours, as in the mockup; whether its neighbours may cap it instead is O-10.
- **SIZE.5 Height.** The shown height as in §1.2; nothing ever scrolls inside a block; a text's lines are one cell tall, so a fold always falls between two lines [H1–H6]. `ch` below the content is ignored: a block whose content outgrows its `ch` grows (RESIZE.3).
- **SIZE.6 Hidden empty lines.** An elastic text with no size set by hand may hide the empty lines at the start and at the end of its text; the lines between paragraphs never hide. Only an area's top or bottom handle hides them (AREA.4); the count is stored, the text never changes. The end lines hide first. They come back when the caret is put in the block (EDIT.5) or when the area grows again (AREA.5) [W5].
- **SIZE.7 Width and height decide each other.** A text's rest width depends on which neighbours cross its rows, and its rows depend on its width. SIZE settles this in reading order, each block once per pass, in at most a fixed number of passes, the same on every device (E-2).

## 4. Module GAP: neighbours and gaps

Inputs: the places and shown sizes of the blocks of one container before and after a change, the carried block if any, and whether it is away (DRAG.B1). Outputs: the neighbour pairs, their gaps, the lends, and the derived rows. GAP is the layout's memory and the only module that writes gaps.

- **GAP.1 Who are neighbours.** As defined in §1.3: per column of the lower block's card, the nearest block above. The pairs are found again from the places at every relink (GAP.5). (`direct`)
- **GAP.2 Whose rows.** Every run of a gap has an owner or is unowned (§1.3). A gap's rows are, by default, the property of the block above them, and move with that block in its columns; blocks that swap places keep their own rows [G1, G4].
- **GAP.3 Only between blocks.** A gap exists only between two neighbours; pulling the last block of a column up, moving it away or deleting the block under it leaves no gap hanging [G3].
- **GAP.4 Shown heights change.** When a shown height changes (typing, a fold, a width change, a temporary height), the derived rows are recomputed by INV-2 in reading order: the blocks under the block follow with their gaps and come back when it shrinks. A head block keeps its row. No gap changes [H1, G1]. (`reflow`)
- **GAP.5 Relink: the pairs found again after places changed.** For every pair of neighbours after a change, in reading order of the lower block:
  1. A pair that was a pair before keeps its runs, changed by how far each of the two went, after the part both went together is taken out: the upper block went down, so rows go from the top of the gap, its own first; the upper block went up, so the rows it left come under it with their owners, and with no gap above it its own rows (GAP.7); the lower block went up, so rows go from the bottom; the lower block went down, and it is the carried block, so the gap grows by rows owned by the upper block; a lower block pushed down by any other block keeps its runs [G5, G1]. (`adjust`, `left`)
  2. A new pair across a block that went away (taken out or carried away) gets the runs above that block, then its lend, then the runs under it that were not its own [G2, C3]. (`fresh`)
  3. A new pair formed by the carried block put into a gap: the gap keeps its owners and is split around the block, the runs above it and the runs under it; the rows its body covers become its lend [G4]. Put above a head block that had free room above it, the block gets the rows between them as unowned runs, and its lend is unowned too, so taking it away gives the head block its row back [C3]. (`fresh`, `gapUnder`, `gapOver`)
  4. Any other new pair: the rows belong to the block above.
  5. Then each block's binding gap gets any rows it lacks to reach the block's row, owned by its upper neighbour; any gap longer than the distance of its pair is cut from the bottom.
  (`relink`)
- **GAP.6 A block taken away.** Deleted, or carried away (DRAG.B1): the blocks under it rise into its place by GAP.5 rule 2; its own rows, wherever they lie in any gap, go; unowned rows stay [G2, C3]. (`removed`)
- **GAP.7 Gaps live in their columns.** A block carried to other columns never brings its rows along; in the new columns it gets no rows of its own, so gaps never add up [G4].
- **GAP.8 A head block moved up by hand (pending O-1).** The empty rows it leaves above the block under it become its own rows (GAP.5 rule 1, «with no gap above it»), as the mockup does until the owner decides P14. (`left` with nothing above)

## 5. Module SETTLE: the one solver

`settle(start, change, memory) → layout`. Inputs: the layout a gesture or edit starts from (`start`), what the user changed (`change`), and the gesture's memory (§6.D) when there is a gesture. Output: a layout satisfying INV-1 to INV-5, with the gaps found again. Every user action is a `change` (§5.2); SETTLE runs the same phases for all of them, so the order of rules lives in one place.

### 5.1 The phases, in this order

Each phase reads only what the phases before it produced. Where a phase visits several blocks, it visits them in reading order of `start` (INV-5).

1. **Apply the change.** Put the changed block at its target, with its target width; take away a block that is deleted or away (GAP.6); set new sizes.
2. **Sides.** For every block that shares a column with the moved block, judge once whether it is above or below the moved block (DRAG.B2); for every block that hits the moved block, judge once whether it is met from the side (DRAG.B3). The judgements hold for the rest of the phases.
3. **Letting through.** Apply the neighbour that lets the block through, if any, and swap when its middle is passed; a swap restarts SETTLE from the swap's layout (DRAG.B4). Then, if a new one is asked for (`HOLD` or Shift), choose it among the candidates of DRAG.B4.
4. **Press aside.** Every block met from the side is pressed away from the block that meets it, in a chain (§5.3, P-ASIDE).
5. **Push up.** Every block above the moved block that it reaches goes up (P-UP).
6. **Push down.** Every block below the moved block that it reaches goes down (P-DOWN).
7. **Separate.** Any two blocks that still hit are separated (P-SEP).
8. **Contain.** Check INV-4 (§5.4): clamp, grow, or refuse.
9. **Relink.** The gaps are found again, once (GAP.5).
10. **Rest.** The rest widths and shown heights are recomputed (SIZE.1, SIZE.7), the derived rows follow (GAP.4), and any hit this creates is separated by phases 4–7 with the gaps kept. This is the same pass the layout gets after a release, so the preview is the result (INV-8).

### 5.2 Changes

| User action | The change | Memory | Module |
|---|---|---|---|
| A pointer move while carrying | the carried block at the target | the carry memory | DRAG |
| Arrow in position mode | the selected block one cell over | empty | DRAG.C4 |
| Width handle | the block's new `cw`, pressing from the moving edge | the handle's memory | RESIZE |
| Height handle | the block's new `ch` or `fold` | none | RESIZE |
| An area's handle | the area's new rectangle, its edge pressing | the handle's memory | AREA |
| A click on the empty sheet, «+», a block made on a narrow screen | a new empty block at a cell, away from the start | empty | EDIT, VIEW |
| Deleting a block | the block taken away | none | GAP.6 |
| Typing, a fold, a temporary height | new content or shown height | none | SIZE, GAP.4 |

### 5.3 The primitives

- **P-ASIDE.** A block `n` met from the side by a block `p` moves away from `p` so that their cards no longer share a column; a block may stand with its handle cell on the last cell of `p`'s card. The blocks `n` then hits go aside the same way, in reading order. An elastic `n` gives way by SIZE.2. A block with a set width that cannot make all the room asked of it still goes as far as it can, a cell at a time, without pushing back the block that presses it, and the block pressing it narrows only by what is left. When `n` cannot get out of the way, its position is put back to where this phase found it, and phases 5–7 push it by its side [M5, W3]. (`shove`, `far`)
- **P-UP.** A block above the moved block that it reaches goes up so that its bottom meets the moved block's top: first the gap above it shrinks, then the block above it goes up too, up to row 0. When nothing above can give way, the moved block stops lower, under the lowest of them [M3]. (`up`, `topmost`)
- **P-DOWN.** A block below the moved block that it reaches goes down so that its top meets the moved block's bottom, and the blocks under it follow with their gaps. There is no limit except §5.4 [M2]. (`down`)
- **P-SEP.** Two blocks that still hit: the lower one, or on the same row the right one, goes down to the other's bottom with the blocks under it; a block judged below the moved block always goes under it (P-SEP is also the rule for a hit at rest: an elastic block's minimum against a close neighbour, a merge from sync).
- **Reaches.** A block judged below the moved block reaches it when its top is above the moved block's bottom; one judged above reaches it when its bottom is below the moved block's top; overlapping or not, so a pointer that jumps past a block in one move still pushes it.

### 5.4 Containment

- **At the sides and the top of a container,** a carried block is clamped (DRAG.A3), and P-UP stops at row 0.
- **At the bottom of the sheet** there is no limit.
- **At the bottom of an area,** a carried child pushing down makes the area's shown height grow in the same phase, and the sheet's blocks under the area follow it (GAP.4), in the preview too [W5, AREA.2].
- **An area's handle** never makes an area taller: a result that would put a child outside the area is refused, and the handle stops at the last valid rectangle (AREA.3, AREA.4) [W5].

## 6. Module DRAG: carrying a block

DRAG turns a pointer into a target, hands it to SETTLE as a change, and shows or stores the result. Inputs: the layout the carry started from, the pointer, the keys, the carry memory. Outputs: the target and, on a drop, the layout to store.

### 6.A The target

- **DRAG.A1 The cell.** The block's top-left card cell follows the pointer with the offset it was grabbed at, rounded to the nearest cell; `frow` is the unrounded row.
- **DRAG.A2 Sticking.** While the pointer is within `STICK` of the column the block was taken from, and the carry since it was picked up has been more vertical than horizontal, the column is held at that column; the same for the row when the carry has been more horizontal. A held row is also `frow`. When the pointer comes back within `STICK`, the value is held again [M7].
- **DRAG.A3 The edges of the container.** Rows above 0 are clamped to 0. Past the right edge, an elastic block narrows so that its left edge stays under the pointer, down to `min(natural width, MINC)`, and then stops; carried back, it widens again. A block with a set width stops at the last column where it fits whole. At the left edge every block stops. With the pointer outside the sheet the state is «outside» [W4, C1].
- **DRAG.A4 Home.** Exactly on the cell it was taken from at the start of the carry, the state is «home» [C1].
- **DRAG.A5 The carried block's width.** An elastic carried block has the width `min(natural width, TEXTW)`, narrowed only by DRAG.A3; the blocks to its right are met from the side and never limit it. After the drop, SIZE.1 gives it the same width, because those blocks were pressed aside (INV-8). A block with a set width keeps it.

### 6.B What DRAG asks of SETTLE

- **DRAG.B1 In its columns, or away.** «Away» is carry memory. It is set when the carried block's card shares no column with the place it was taken from, and cleared only when it shares both a column and a row with it. While not away, its place is held: nothing rises under it [M1]. While away, its place is freed by GAP.6 in phase 1 [G2]. After a swap, «the place it was taken from» is its place at the swap; DRAG.A2 and A4 still use the place at the start of the carry. A block just made (EDIT.4, VIEW.4) is away from the start.
- **DRAG.B2 Above or below.** Judged once per pointer move in phase 2: a neighbour that shared the carried block's columns before the carry keeps the side it had, unless the block is away; any other is below when its middle is strictly below `frow`, otherwise above [M1, G2].
- **DRAG.B3 Met from the side.** A block that hits the carried block is met from the side when the overlap across the columns is smaller than the overlap along the rows, or equal and the last move between two targets was sideways (vertical at the start of the carry). It is pressed to the side its centre lies on, to the left when the centres coincide. Once met from the side, it stays so for the rest of the carry while it shares a row with the target rows [M5].
- **DRAG.B4 Letting through.** Applied in phase 3. A neighbour lets the block through when it touches the block's leading edge in the direction of the vertical move, shares a column with it and is not met from the side, and the pointer has stayed within `STILL` for `HOLD`, or Shift is held (also in the middle of a push). Of several such neighbours, the first in reading order. It stops where it is, takes no part in phases 4–7, and the block slides over it. When `frow` puts the block's leading edge past the neighbour's middle, they swap where they stand, each keeping its own rows (GAP.2), and SETTLE restarts from that layout with the swapped neighbour now on the other side, ready to let the block back the same way. Carried back before the swap, the neighbour is pushed again [M2, M6, M5].
- **DRAG.B5 No room aside.** A block met from the side that P-ASIDE could not move is pushed by P-UP or P-DOWN according to DRAG.B2 for this move; it stays met from the side, and comes back up, aside and as wide as before, as soon as the block is carried back [M5].

### 6.C The result

- **DRAG.C1 The preview.** During the carry, the layout shown is SETTLE's result for the current target; at «home» or «outside», the layout the carry started from. The carried block shows its width and height at the target (INV-8).
- **DRAG.C2 Drop.** Letting go in the «move» state stores the result as one undo entry [C2].
- **DRAG.C3 Cancel.** Esc, the right mouse button, «home» and letting go outside the sheet store nothing [C1].
- **DRAG.C4 Arrows.** An arrow in position mode is a carry of one cell with an empty memory, dropped at once [M7].

### 6.D The carry memory

Kept for one carry only and cleared at «home» and at the drop: the start place and pointer (DRAG.A2, A4); the last target and the direction of the last vertical move (B3, B4); the neighbours met from the side and their sides (B3), also cleared at a swap; the neighbour letting the block through and the row it stopped at (B4); the hold point and its timer (B4); «away» (B1); the layout at the last swap (B4); and the note's width frozen for the carry, so that VIEW does not rescale the sheet under the pointer. Nothing else carries over from one pointer move to the next.

## 7. Module RESIZE: the handles of a block

- **RESIZE.1 The width handle (proposed).** Carrying the handle at the card's right edge sets `cw`. The moving edge presses the blocks to its right as a wall would, by P-ASIDE, and SETTLE starts every handle move from the layout the gesture started from, so carrying the handle back retraces the way; the width is clamped at the container's right edge and at three cells; letting go stores one undo entry [W3, C2]. The mockup separates the blocks after the release instead (§14, D-7); O-9 asks the owner.
- **RESIZE.2 Back to elastic.** A double click on the width handle removes `cw` [W3].
- **RESIZE.3 The height handle.** Released above the content, it writes `ch` and clears `fold`; released below it, it writes `fold` and clears `ch`; a double click clears both. `ch` below the content is ignored [H1].
- **RESIZE.4 A long paste.** A block made by a paste longer than 14 lines starts with `fold` 12 (`PASTEFOLD`); nothing else folds by itself [H2].

## 8. Module AREA: areas and their edges

An area is a container inside the sheet: inside it, every rule of SIZE, GAP, SETTLE, DRAG, RESIZE and EDIT holds with the area's own columns and rows; the interface keeps one level of areas, the engine is written recursively [N1]. Inputs: the area's rectangle, its children's layout. Outputs: the area's new rectangle and its children's layout, through SETTLE.

- **AREA.1 Containment.** The children always stay inside the area (INV-4, §5.4). At its sides a carried child behaves as at the edges of the sheet (DRAG.A3) [W4].
- **AREA.2 Height.** An area is never shorter than its content, and grows when a child is pushed past its bottom (§5.4); it may be set taller with its bottom handle [W5].
- **AREA.3 A side handle carried inwards.** The opposite edge stays. What sticks out past the moving edge is pressed as by a wall, by P-ASIDE. A block left with no room on its rows goes down, under what stands in its way, shifted inwards as far as it needs, and there takes its rest width back (phase 10, in the preview too). The handle stops where a block cannot fit even alone (a set width wider than the area, or an elastic block's minimum), and where a block, or a block it pushes, would come out past the bottom edge (§5.4). The left handle works as the right one, mirrored [W5]. (`squeezeH`)
- **AREA.4 The top or bottom handle carried inwards.** The opposite edge stays. Row by row, the area gives up room in this order: first the children move whole, with their gaps, into the free rows; then the gaps between children close, the ones furthest from the moving edge first; then elastic texts hide empty lines (SIZE.6), again furthest from the edge first; then the handle stops. No child changes its column or its order. For the bottom handle this supersedes H5 (an area folding to a height like text) until O-6 [W5]. (`squeezeV`, `squeezeTB`)
- **AREA.5 A handle carried outwards.** The children keep their places on the sheet; hidden empty lines come back while there is room, the ones nearest the moving edge first [W5]. (`unsqueeze`)
- **AREA.6 One gesture, one entry.** While a handle is held, carrying it back retraces the way; letting go stores the area and its children as one undo entry [W5].
- **AREA.7 Entering and leaving.** How a block enters or leaves an area by carrying is not yet tried in the mockup (O-6).

## 9. Module EDIT: clicks, the caret and new blocks

Inputs: a click or a hover on the sheet, the blocks' rectangles. Outputs: where the caret goes, or a new block as a change for SETTLE.

- **EDIT.1 What a point belongs to.** A point belongs to a block when it lies on its card, the spare room of a set size included, or within `NEAR` to the right of the card or under it. A point on a card belongs to that card even when it is within `NEAR` of another; a point within `NEAR` of two cards belongs to the first in reading order. Any other point of a container is empty sheet [M8].
- **EDIT.2 Before the click.** Over a block, its whole frame shows and the cursor is a text cursor; over the empty sheet, the cursor is a cell and nothing else shows [M8].
- **EDIT.3 A click on a block.** On its text, the caret goes there. To the right of a line, it goes to the end of that line. Below the text, in the spare room or within `NEAR` under the card, it goes to the first empty line after the text, made if there is none: a provisional line, a temporary height (§1.2), kept as a text change only when something is written on it and taken back when the caret leaves without it. Clicking below again finds the same line; only Enter adds lines. A block with spare room keeps its height; one without grows by a row, as with Enter [M8].
- **EDIT.4 A click on the empty sheet.** A single click starts a new empty elastic text there, its card on the clicked cell: a change for SETTLE with the block away from the start. Left empty, it goes away, and the layout is as it was before the click [M8, C3].
- **EDIT.5 The caret brings hidden lines back.** Putting the caret in a block that hides empty lines (SIZE.6) sets the count to zero: a user action that writes (INV-6) [W5].

## 10. Module VIEW: windows, scale, the narrow view, the look

Inputs: the stored layout, the window width, the settings. Outputs: what is drawn. VIEW never writes the layout (INV-6), and nothing it hides or shows changes how anything is measured (PR-8).

- **VIEW.1 Window and scale.** The width that counts is the note's own, up to the right edge of its rightmost card. A window wider than the note shows it as it is, with room on the right. A narrower one shows the whole sheet scaled down to fit, no smaller than `MINSCALE`. Narrower still, the narrow view (VIEW.2). Widened again, the note is as it was. During a carry the note's width is frozen (§6.D) [W2].
- **VIEW.2 The narrow view.** The blocks one under another in reading order, an empty row between them, none wider than the screen; an area as a frame with its children inside in the same way; long blocks folded at `FOLDPHONE` rows, a temporary height. The stored layout under it keeps `SHEETW`: nothing measured for the narrow view feeds back into it [W2, W6, H6].
- **VIEW.3 What the narrow view allows.** Reading, writing and formatting text, following links, copying, unfolding and folding for reading, deleting and creating blocks. Not carrying, the arrows, the handles, «В область…» and «З області» [W6].
- **VIEW.4 A block made on a narrow screen.** Made after block X, it goes under X on the computer, in X's column, one empty row under X's bottom, as a change for SETTLE like EDIT.4. «+» puts one under every block at the left margin. In the narrow view it shows by reading order, so it can appear after a block that stands beside X [W6].
- **VIEW.5 «Показати як на компʼютері».** The computer layout scaled to the screen, only to look at [W6].
- **VIEW.6 The look during a gesture.** Every block shows its real size as a thin frame, its empty part included; the carried block gets a background; a selected block shows its frame only. Guides follow the carried block: a hairline along the left edge of its card and one along its top, across the sheet, solid where they meet the starting place or the left or top edge of another block, the row one paler than the column. A neighbour pressed for `HOLD` lights its outline while the time runs and keeps it lit while it lets the block through. The width handle shows only under the pointer [V1, M6, M7].
- **VIEW.7 Two looks.** The app look shows only what VIEW.6 lists. The testing look («dev») adds what the rules work with: the gap runs with their owners and sizes, the blocks' letters, sizes in cells, row numbers, the outline of the place a block was taken from, the focus ring. Both looks are kept in the app; the testing look is switched on to track down a bug [V1]. Keyboard focus in the app look is O-11.

## 11. Precedence

The phases of §5.1 order everything within one change. These rules settle what the phases alone do not.

- **PR-1 Home and outside first.** At «home» or «outside» SETTLE does not run for that move (DRAG.A4, C1).
- **PR-2 One target per move.** Every phase uses the target of DRAG.A, never the raw pointer: a held row is the row for the sides and the swap too (DRAG.A2, B2, B4).
- **PR-3 Sides are sticky and exclusive.** A block met from the side is pressed aside, or pushed for lack of room; it is never the neighbour that lets the block through (DRAG.B3–B5).
- **PR-4 The neighbour letting the block through is fixed.** It takes no part in phases 4–7.
- **PR-5 Containment by §5.4.** A carried block is clamped at the sides and the top; an area grows at its bottom for a carried child; an area's handle stops rather than grow it.
- **PR-6 The gaps are found once,** in phase 9, and the rest pass keeps them. No phase reads gaps written in the middle of a SETTLE.
- **PR-7 No hidden memory.** SETTLE reads nothing but `start`, `change` and the gesture's memory (§6.D, RESIZE, AREA.6).
- **PR-8 Presentation never changes measurement.** Nothing VIEW draws or hides changes a width or a height.

## 12. Lessons from the mockup's bugs

Each bug found while the owner tried the mockup came from two rules meeting without a stated order. The rules above are cut so that each of these has one place where it is decided.

1. **A «home» zone of one cell swallowed pushes** next to the starting place (2026-11-01). Home is the exact cell only (DRAG.A4, PR-1).
2. **Sticking held the row, the side judgement used the pointer**, so neighbours above were pushed down (2026-11-01). One target per move (PR-2).
3. **A neighbour pushed down for lack of room, then held still over, let the block through** and stayed down (2026-10-30). Sides are exclusive (PR-3).
4. **A block brought back into its columns lower down pushed its old lower neighbour through itself** (2026-10-31). Away and back (DRAG.B1, B2).
5. **An area's height did not follow children that went down**, and they stuck out (2026-10-31). Containment in one place (§5.4).
6. **A carried block's gap piled onto the gaps of its new column** (2026-10-27). Gaps live in their columns (GAP.7).
7. **Room reserved for a testing label made texts wrap early**, which looked like free room in the app look (2026-11-01). Presentation never changes measurement (PR-8).
8. **A new block on the same row as a neighbour judged that neighbour above it** (2026-10-31). A new block is away from the start (DRAG.B1).
9. **The narrow view measured elastic widths with the phone's columns** (2026-10-31). The layout under the narrow view keeps `SHEETW` (VIEW.2).
10. **The bottom handle of an area closed a gap and reopened another** when it moved several rows at once (2026-10-31). A handle gives up room one row at a time (AREA.4).
11. **A state class of the mockup collided with the class of another element** and narrowed the sheet, so clicks on its right part did nothing (2026-11-01). For the engine: the view's state names live in their own namespace, and every interface scenario clicks across the whole sheet.
12. **The width handle, the area's handles, a new block and the carry each had their own pushing code** in the mockup, with slightly different rules. One solver (§5).

## 13. Tests

Every rule gets fast tests without a browser over the engine's pure functions, as `tests/sync*.mjs` test the sync core; the interface keeps browser scenarios. Each SETTLE primitive gets its own test file. Every test checks INV-1 to INV-5 after each step, and the gesture tests check INV-8 by comparing the last preview with the stored result. The mockup's checks are the seed:

| Module | Rules | Mockup scenarios | Asserts |
|---|---|---|---|
| SIZE | 1–4, 7 | `width`, `widthtext`, `elastic`, `card`, `wrap` | rest widths, giving way by each `ORDER`, set width kept, determinism of the passes |
| SIZE | 5–6 | `area5`, `write2` | hidden lines hide and come back, the text unchanged |
| GAP | 1–8 | `own`, `grow`, `press`, `leaf`, `one`, `back` | INV-2, INV-3, INV-7 (b) after insert, remove, grow, shrink; unowned runs above a head block |
| SETTLE | 5.1, 5.3, 5.4 | `side`, `up`, `push`, `card`, `inside`, `margin` | each primitive alone; phase order; containment |
| DRAG.A | 1–5 | `axis`, `drift`, `edge`, `home` | one target per move, sticking, edges, home exact, carried width |
| DRAG.B | 1–3, 5 | `away`, `side`, `back2`, `back3`, `elastic` | away and back, sides judged by the target, retrace, no room aside |
| DRAG.B | 4 | `hold2`, `back` | let through, swap, back through, pushed again when carried back |
| DRAG.C | 1–4 | every drag scenario | preview equals drop, cancel and home leave no trace (INV-7 a), arrows |
| RESIZE | 1–4 | `card`, `leaf` | retrace, `ch` and `fold` exclusive, paste fold |
| AREA | 1–7 | `area`, `area4`, `area5`, `inside` | containment, stops, order of giving up room, undo |
| EDIT | 1–5 | `write`, `write2`, `caret`, `click`, `click3` | caret places, one provisional line, a new block removed with no trace, clicks across the whole sheet |
| VIEW | 1–7 | `mix`, `phone`, `viewshot`, `textgrid` | nothing written, `SHEETW` under the narrow view, measurement unchanged by the look |

## 14. The mockup and this document

### 14.1 Comparison options that are not decisions

The mockup keeps switches to compare ways the owner did not choose; the engine implements only the decided one, unless the decision says a setting.

- Horizontal place: «колонка», «доля ширины», «масштаб» (W2 chose «вместе»; the minimum scale is a setting).
- At the edge of the sheet: «возвращается», «упирается» (W4 chose «упругий сужается»).
- An area narrowed below its content: «ручка упирается», «до содержимого» (W5 chose «блоки уходят вниз»).
- Writing next to a block: «как сейчас» (M8 chose «с подсказками»).
- Swapping: «по середине» (M6 chose «подержать или Shift»; whether to keep the middle rule as a setting is O-4).
- Text in its cells, fields, background (P18, open, O-2).

`ORDER` is a real setting [W3]; the dev look is a real feature [V1].

### 14.2 Where the mockup differs

- **D-1** One area per example, standing for the sheet; areas inside the sheet, entering and leaving, folding an area are not in it.
- **D-2** It measures text in the page; the engine asks a measuring function (E-3).
- **D-3** Its elastic maximum is 16 cells; the app's is 26 [W3].
- **D-4** Its sheet's columns are the window's when the window is wider than the note, so rest widths depend on the window; the engine uses `SHEETW` (O-8).
- **D-5** It draws a fresh block's placeholder «Пишите…» and counts its width; the app's placeholder is the app's own, and a card is never less than one cell.
- **D-6** Its rows are stored for every block, and temporary heights («Развернуть» in the mockup) move the blocks under them in the stored state; the engine derives the rows of blocks with upper neighbours (§2.1).
- **D-7** Its width handle separates the blocks after each change of the width, with no retrace; RESIZE.1 proposes the retrace through SETTLE (O-9).
- **D-8** Its carried elastic block keeps the width it had at rest, and an area's pushed-down child takes its width back only after the release; the engine follows DRAG.A5 and phase 10 (INV-8).
- **D-9** Its choice of the neighbour that lets the block through depends on the order of storage, and the Shift path and the hold path choose differently; the engine follows DRAG.B4.
- **D-10** Its separation after a size change keeps the block more to the left (or, in one column, the upper one) and moves the other aside or down; the engine follows P-SEP.

## 15. Open questions and engineering points

### 15.1 For the owner

- **O-1 (P14)** A head block moved up by hand: do the rows it leaves become its own gap (GAP.8)?
- **O-2 (P18)** Where the text stands in its cells, which field, which background; with wide fields, one row under every block keeps blocks apart.
- **O-3 (P12)** The release order of the rules against the sync release.
- **O-4** Keep «по середине» as a setting next to M6, or drop it.
- **O-5 (P4–P7)** The phone and the computer working together: stage 2 [W1].
- **O-6** Entering and leaving an area by carrying (AREA.7), and folding an area [H5] in the new model.
- **O-7 (L1)** Pinned blocks: later.
- **O-8** The sheet's width: what is the right edge of the sheet for rest widths (SIZE.1) and for carrying past it (W4)? Recommended: a width per note, `SHEETW`, the same on every device, so that a monitor and a laptop never rewrite each other's layout; a wider window shows room beyond it.
- **O-9** The width handle: does widening a block press its neighbours aside with a retrace, like a carry (RESIZE.1)?
- **O-10** «Never narrow»: may an elastic block's neighbours cap its rest width (it never narrows when pressed, but is no wider than its room), or does it keep its natural width and push them (SIZE.4)?
- **O-11** Keyboard focus in the app look: with the focus ring hidden (V1), how a keyboard user sees which block has the focus.

### 15.2 For the engine's design

- **E-1** How the gaps with their owners and the lends are stored in a note and merged by sync; old notes, which have no gaps stored, get them from their places once (GAP.5 with every pair new).
- **E-2** The number of passes for SIZE.7, and a proof that the rest pass of phase 10 ends.
- **E-3** The measuring function: rows at a width, the natural width and the empty lines at the ends of a text, in the browser and as a stub in Node tests.
- **E-4** The passports of the kinds of block (text, code, area) as data the engine reads (`LAYOUT-MODEL.md` §3.3).
- **E-5** The steps of `LAYOUT-MODEL.md` §7 are re-planned for this model before the first PR.

## 16. Relation to `LAYOUT-MODEL.md`

This document replaces §3 of `LAYOUT-MODEL.md` (the model rule by rule) and states §4 «Stage 1» as rules (VIEW). The decisions table of its §2 stays the record of what the owner decided and when; every rule here points to it. Its §5 (data), §6 (the module), §7 (steps), §8 (today's code), §9–§11 stay as they are until the engine's design (E-1, E-5) revises them.

## Review log

- **Round 0 → 1** (21 findings). Added: the sheet's width `SHEETW` (O-8); stored and derived state, temporary heights (§2.1); INV-8; one solver SETTLE with fixed phases and named primitives (§5), every action a change (§5.2); RESIZE; unowned gap runs; the order of visits (INV-5); the carried block's width (DRAG.A5); containment in one place (§5.4); the let-through split into apply and choose, its reverse after a swap; away as memory with its hysteresis; «reaches» defined; GAP.5 corrected (only the carried block grows a gap when it goes down; the lend between the two parts); INV-7 restated; the carry memory completed; H5 superseded for the bottom handle; O-8 to O-11; cross-references fixed.
