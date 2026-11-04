# Layout rules: the decided model, module by module

**Status: specification of 2026-11-01, after review round 4; amended on 2026-11-04 after the independent review of the plan** (GAP.5 rules 1, 2 and 3a, the lend per pair, the two layouts of §2.1, which phases a change runs and the bound of phase 9 in §5.1, the failure of §5.5; review log). It gathers every decision the owner has made on placing and moving blocks up to this date, from §2 of [`LAYOUT-MODEL.md`](LAYOUT-MODEL.md) and from the trials in the mockup, and cuts them into modules with explicit boundaries, so that the new engine can be written and tested rule by rule. Where this document and the mockup disagree, this document wins and the difference is listed in §14. Where it and §3 of `LAYOUT-MODEL.md` disagree, this document wins: that section described the anchor-and-sweep model of 2026-10-26, which G1 replaced.

The mockup («Макет выталкивания», a private claude.ai artifact) stays the reference for how each rule feels, not for every outcome: §14.2 lists where it is known to be wrong. Its engine is a set of functions over a state with no page in them (`plan`, `shove`, `far`, `relink`, `adjust`, `fresh`, `reflow`, `squeezeH`, `squeezeV`); the names in round brackets below point to them.

Rules marked **(proposed)** rest on no decision of the owner yet; they say what the engine does until the owner decides, and §15 lists the question.

## 0. How to read

- Every rule has an id, `MODULE.n`, and says what must hold, not how a function does it. After it come the decisions it rests on, in square brackets, and, where useful, the mockup function, in round brackets.
- A module owns its rules. A rule never reads or writes the state of another module except through the inputs and outputs in the module's header.
- **One solver.** Every change of the layout, whatever the user did, goes through one function, SETTLE (§5): a gesture or an edit only describes its change (§5.2), and SETTLE runs its phases in their fixed order. No gesture carries its own pushing code. Rows follow sizes (FOLLOW) and gaps are found again (RELINK) at named points of SETTLE, never in between.
- Numbers the owner set are settings or constants with a name (§1.5).

## 1. Vocabulary

### 1.1 Space

- **Cell.** The grid step `G`, 24 px at 16 px text. Dots of the grid sit on cell corners. Every size and threshold is counted in cells; a larger text size scales the sheet and moves nothing.
- **Container.** The sheet, or an area. Each has its own columns `0 … cols−1` and rows `0, 1, …`. An area's `cols` is its width; the sheet's is `SHEETW` (§1.5), stored with the note, the same on every device, never the window's width [W7].
- **Block.** A rectangle of cells in one container: column `col`, row `y`, width `w` in cells, height `h` in rows. Every block's card is at least one cell wide: an empty text's natural width is one cell, and a placeholder is drawn but never measured (PR-8).
- **Handle cell.** The first cell of a block, column `col`, holds the grip ⋮⋮. It is not part of the block for collisions [M4].
- **Card.** The rest of the block: columns `col+1 … col+w−1`, rows `y … y+h−1`. The card holds the content.
- **Shares a column.** Two blocks share a column when their cards have a column in common: `a.col+1 < b.col+b.w` and `b.col+1 < a.col+a.w`.
- **Shares a row.** Their row ranges intersect: `a.y < b.y+b.h` and `b.y < a.y+a.h`.
- **Hit.** They share a column and a row. Two blocks of one container never hit (INV-1).
- **Reading order.** By row, then by column, then by id. Every rule that visits several blocks visits them in reading order of the layout its phase starts from (INV-5).
- **Neighbour order.** Every upper neighbour before its lower neighbours; ties by reading order. FOLLOW uses it.

### 1.2 Sizes

- **Elastic block.** A text or a code block whose width was not set by hand. Its width follows its content (SIZE.1); the two kinds follow the same rules [W14].
- **Set width** `cw`. A width set with the width handle. Kept as is (SIZE.3).
- **Set height** `ch` and **fold**. One handle at the bottom edge writes one of them (RESIZE.3): released above the content it writes `ch`, a spare room below the text; released below the content it writes `fold`, the rows shown [H1].
- **Shown height** `h`. The rows the block takes now: its content rows at its width, or `ch` when larger, or `fold` plus one row for «Розгорнути» when the content is longer, minus the empty lines an area hid (SIZE.6). It also changes with **temporary heights**, which are shown and never stored: «Розгорнути» until the note is closed [H3], the unfolding while the caret is in a folded block [H4], `FOLDPHONE` in the narrow view [H6], the provisional empty line of EDIT.3, the row of the wide field under every block while that setting is on (P18).
- **Natural width.** The width of the longest line of a text, plus the inner padding, in whole cells.
- **Rest width.** The width an elastic block has when nothing carries or presses it (SIZE.1).

### 1.3 Neighbours and gaps

- **Upper neighbour.** For a block `b`, a block `a` of the same container is an upper neighbour when, in at least one column of `b`'s card, `a` is the nearest block above `b` (`a.y+a.h ≤ b.y`). A block can have several upper neighbours, one per stretch of its columns; `b` is then a lower neighbour of each. The pairs are found by RELINK and stored (§2.1).
- **Head block.** A block with no upper neighbour in the stored pairs.
- **Gap.** The empty rows between the two blocks of a pair. A gap is a list of runs from top to bottom: `{owner, n}`, `n` rows that belong to block `owner`, or `{nobody, n}`, `n` unowned rows. Unowned rows are free room that was above a head block before a block was put there; they belong to no block, so taking a block away never takes them (GAP.6). A gap exists only for a pair [G3].
- **Binding gap.** Of a block's upper neighbours, the one whose bottom plus gap is lowest decides the block's row (INV-2); its gap is the binding one. The other gaps are kept as they are and take over when the binding one goes.
- **Lend.** For each pair a block stands between, the rows of that pair's gap it covers with its body, with their owners: it was put there by a carry (GAP.5 rule 3) or came there by itself (rule 3a). It is stored with the block, one per pair, keyed by the pair (above a head block, by that block); kept while the block stays between the same pair; given back to the gap when the block no longer stands between them or is taken away (GAP.5 rule 2, GAP.6), and then cleared [G4, C3, S8].

### 1.4 The target of a gesture

- **Target.** What a pointer move asks for, after DRAG.A: the column, the row, the fractional row `frow` (the row of the block's top before rounding, equal to the row when the row is held by sticking), the width, and the state: «move», «home» or «outside».

### 1.5 Named settings and constants

| Name | Value | Meaning | Decision |
|---|---|---|---|
| `SHEETW` | per note, stored; a new note made on a computer gets the width that computer shows with the list of notes open; a note begun on a phone has none until a computer opens it | The sheet's columns: its right edge for rest widths and for carrying | W7 |
| `DESKW` | 40 cells of visible area with the list open | A device that shows at least this much gives a note begun on a phone its width (VIEW.1c). Editing the layout does not depend on it: a device that shows the note at `MINSCALE` or more edits it (VIEW.1), in the first release only a computer (W13) | W7, S3, W13 |
| `TEXTW` | 26 cells (16 in the mockup) | The widest an elastic text gets by itself | W3 |
| `MINC` | 6 cells, a setting | The narrowest a long elastic text gets when pressed | W3 |
| `ORDER` | «push first, then narrow» (default) or «never narrow»; a setting | How an elastic block gives way | W3 |
| `HOLD` | 0.7 s | Pressing still against a neighbour that long lets the block through | M6 |
| `STILL` | 8 px | A pointer that stays within this radius counts as still | M6 |
| `STICK` | ¾ cell | How far the pointer goes before the block leaves the column or row it was taken from | M7 |
| `NEAR` | ½ cell | The margin to the right of and under a card that still belongs to it for a click | M8 |
| `MINSCALE` | 70 %, a setting | The smallest scale before the narrow view | W2 |
| `FOLDPHONE` | 10 rows | Long blocks fold there in the narrow view | H6 |
| `PASTEFOLD` | longer than 14 lines → fold at 12 | A block made by a paste starts folded | H2 |
| `RESTPASSES` | a fixed small number (E-2) | The passes of SIZE.8 in phase 9 | — |
| `RESTSTEPS` | per container and SETTLE: its blocks × (its `cols` + the bottom row of its lowest block + the sum of its blocks' heights at their narrowest widths) | The most steps phase 9 (b) can take (§5.1); more is a bug, and SETTLE fails (§5.5) | — |

## 2. State and invariants

### 2.1 What is stored and what is derived

**Stored**, for every block: its container, `col`, `y`, its sizes set by hand (`cw`, `ch`, `fold`), the count of empty lines an area hid (SIZE.6), and its lends (§1.3). For the container: the list of neighbour pairs, each with the runs of its gap. A block's `y` is trusted only when it is a head block.

**Derived**, never trusted over the stored state: every block's shown width and height (SIZE), and the row of every block with upper neighbours, given by INV-2 and recomputed by FOLLOW. The stored `y` of such a block is a cache.

So a temporary height (§1.2) moves the blocks under it on the screen and writes nothing: the pairs and the gaps stay, and when the temporary height ends the blocks are back [H3, H4, H6, G1]. A window, a scale, the narrow view and the dev look write nothing either (INV-6) [W2, W6, V1]. How the pairs, gaps and lends are written into a note and merged by sync is E-1 (§15).

**Two layouts.** The *canonical* layout is the stored state with its derived rows and no temporary height. The *displayed* layout is the canonical one with the temporary heights set and FOLLOW run, and nothing else: no pair, gap, lend, width or head block's row changes. The user aims at what is displayed, so a gesture, its memory and every SETTLE of a gesture or an edit run on the displayed layout, and the result is shown as it is (INV-8). What is stored is the result's canonical layout: its temporary heights taken out and FOLLOW run, its pairs, gaps, lends, widths and head rows kept. Taking them out moves only blocks that have upper neighbours, and only up, keeping the order of the blocks in every column, so no two blocks come to hit; putting them back gives the shown result again. A temporary height does not start or end while a gesture is held; one that would waits for the gesture's end [H3, H4, P18].

### 2.2 Invariants

The engine keeps these after every SETTLE; each module's tests check them.

- **INV-1 No overlap.** Two blocks of one container never hit.
- **INV-2 Rows follow the gaps.** For every block with upper neighbours, `y = max over its upper neighbours a of (a.y + a.h + total(gap(a, b)))`, computed in neighbour order. A head block keeps its stored row.
- **INV-3 Gaps only between neighbours** [G3]. Every stored pair is a pair of neighbours by §1.3; no gap is longer than the distance between its pair.
- **INV-4 Inside the container.** Every card lies within its container's columns; every block of an area lies within the area's rows (§8).
- **INV-5 Determinism.** The same stored state and the same measured sizes give the same layout on every device, whatever order the blocks are stored in. Every rule that visits several blocks visits them in reading order of the layout its phase starts from; ties go to the upper block, then to the left one.
- **INV-6 Only user actions write.** The stored state changes only by the changes of §5.2 that the user makes: a drop, an arrow, a handle, creating or deleting a block, typing, putting the caret into a block that hides empty lines; and by what SETTLE does in consequence of them. A window, a scale, the narrow view, the looks and the temporary heights write nothing [W2, W6, V1]. Nor does a block that measures differently with no user changing it (a linked note renamed changes a chip's label; a font loads late): its new size is shown at once, and what it moves is written with the next user action in that container (LAYOUT-ENGINE-PLAN §3.4). One exception, not a user action: the first time a computer opens a note that has no `SHEETW` yet, it stores its own (VIEW.1c) [W7].
- **INV-7 No trace.** (a) Within one carry, «home» gives back the layout the carry started from [C1]. (b) A block inserted and then taken away leaves its neighbours as they were: two blocks that touched touch again, a gap that was there is there again [C3]; the same for a block that came between two blocks by itself and then went, or narrowed back off their columns (GAP.5 rule 3a) [S8], and for a text that grew and shrank back, whether the gaps beside it bind their blocks or not [H1]. (c) Carrying one block back and forth between the same two places, any number of times, never makes a gap longer than the first carry made it [G4].
- **INV-8 The preview is the result.** What any gesture shows while it is held (a carry, a width or height handle, an area's handle) is exactly what letting go stores, as it is displayed (§2.1). Nothing moves after the release.

## 3. Module SIZE: how big a block is

Inputs: a block's content, its set sizes, its container's columns, the blocks on its rows to its right, `ORDER`, `MINC`, `TEXTW`. Outputs, as answers to three questions: the block's rows at a given width; the narrowest it may get (none for a block that never narrows); the empty lines at the start and end of its text that may hide. And the rest width of every elastic block. SIZE owns the hidden-lines count; other modules change it only through a change of §5.2. SIZE knows nothing about gestures. What a block measures depends on its content as it is shown (a chip shows the linked note's current name), its kind's options (a code block's wrap and line numbers, an area's title), the text size, the font and the text placement (P18); a change of any of them changes the block's size (phase 1a), whoever made it, and INV-6 says what is written.

- **SIZE.1 Rest width.** A code block's natural width is its longest line, and it is never narrower than its header needs (`MINW_CODE`, 12 cells, as today); otherwise it follows this rule as a text does; a line longer than its width wraps or scrolls sideways inside the block by its own «перенос» setting, as today [W14]. An elastic text is as wide as its natural width, at most `TEXTW`, and no wider than the room it has: the room ends at its container's right edge and at the handle cell of the nearest block to its right on the rows it takes at that width. It is never narrower than `min(natural width, MINC)`. When room frees up, it widens again by itself [W3]. (`autoCard`)
- **SIZE.2 Giving way.** Pressed from either side, an elastic block gives way the same way, by `ORDER`: it moves aside as a whole while there is room and narrows where it meets the edge of its container or a block that cannot move; or it never narrows. It narrows on the side it is pressed from, down to `min(natural width, MINC)` [W3, W10]. What a block that can neither move nor narrow does is SETTLE's (P-ASIDE, phase 9). (`elastic.min`, `elastic.first`, `shove`)
- **SIZE.3 Set width.** A block with `cw` keeps it and is only moved, never narrowed [W3, W4]. A double click on the width handle removes `cw` (RESIZE.2).
- **SIZE.4 «Never narrow» at rest.** The rest width is the same under every `ORDER`: with «never narrow» too, a close neighbour on the right caps it (SIZE.1). «Never narrow» only changes SIZE.2, how the block gives way when pressed [W9].
- **SIZE.5 (dropped).** «Narrow first» is no longer an order [W10].
- **SIZE.6 Height.** The shown height as in §1.2; nothing ever scrolls inside a block; a text's lines are one cell tall, so a fold always falls between two lines [H1–H6]. `ch` below the content is ignored: a block whose content outgrows its `ch` grows (RESIZE.3).
- **SIZE.7 Hidden empty lines.** An elastic text with no size set by hand may hide the empty lines at the start and at the end of its text; the lines between paragraphs never hide. Only an area's top or bottom handle hides them (P-SQUEEZE); the count is stored, the text never changes. The end lines hide first. They come back when the caret is put in the block (EDIT.5) or when the area grows again (AREA.5) [W5].
- **SIZE.8 Width and height decide each other.** A text's rest width depends on which neighbours cross its rows, and its rows depend on its width. SIZE settles this in reading order, each block once per pass, in `RESTPASSES` passes, the same on every device (E-2).

## 4. Module GAP: neighbours and gaps

Inputs: the layout a SETTLE compares with (`base`, §5.1) and the layout after its phases, the carried block if any, and whether it is away (DRAG.B1). Outputs: the stored pairs with their gaps, the lends, and the derived rows. GAP is the layout's memory and the only module that writes pairs, gaps and lends. Its two operations are FOLLOW and RELINK; SETTLE calls them at named points.

- **GAP.1 Who are neighbours.** As defined in §1.3: per column of the lower block's card, the nearest block above. RELINK finds them from the places. (`direct`)
- **GAP.2 Whose rows.** Every run of a gap has an owner or is unowned (§1.3). A gap's rows are, by default, the property of the block above them, and move with that block in its columns; blocks that swap places keep their own rows [G1, G4].
- **GAP.3 Only between blocks.** A gap exists only for a pair of neighbours; pulling the last block of a column up, moving it away or deleting the block under it leaves no gap hanging [G3].
- **GAP.4 FOLLOW.** The derived rows are recomputed by INV-2 in neighbour order: the blocks under a block whose shown height changed follow with their gaps and come back when it shrinks. A head block keeps its row. No pair and no gap changes, and the rows FOLLOW moves are not moves for RELINK (GAP.5 rule 1) [H1, G1]. (`reflow`)
- **GAP.5 RELINK.** The pairs are found again from the places, and every pair's runs are set by comparing with `base`, in reading order of the lower block:
  1. A pair that was a pair in `base` keeps its runs, changed only by how far each of its two facing edges (the upper block's bottom, the lower block's top) was *moved*, after the part both were moved together is taken out. An edge is moved when its block's row is changed by the change itself (the moved block) or by a primitive of phases 3–7 and 9 (a swap, P-ASIDE, P-UP, P-DOWN, P-SINK, P-SEP, P-REST). A row that FOLLOW changed, and a bottom that the block's own height changed (a text grew, narrowed or widened), are not moves and change no runs: what they open or close is the room by which the pair does not hold its lower block, and rule 5 alone fits the gap to the distance. Then: the upper block's bottom was moved down, so rows go from the top of the gap, its own first; it was moved up, so the rows it left come under it with their owners, and with nothing above it its own rows (GAP.8) — G5 and G6 decided this for a block moved up by hand, and S7 for a head block pushed up, the same way; the lower block was moved up, so rows go from the bottom; the lower block was moved down, and it is the carried block, so the gap grows by rows owned by the upper block; a lower block pushed down by any other block keeps its runs. So a text that grows and shrinks back leaves every gap as it was, the ones that do not hold their lower block included [G5, G1, H1]. (`adjust`, `left`)
  2. A new pair whose blocks were, in `base`, the upper and the lower neighbour of one block that is no longer between them (deleted, away, the carried block now elsewhere, or a block that narrowed or was pushed off their columns) gets the runs above that block, then its lend for that pair, then the runs under it that were not its own [G2, C3, S8]. (`fresh`)
  3. A new pair formed by the carried block put into a gap of `base`: the gap keeps its owners and is split around the block, the runs above it and the runs under it; the rows its body covers become its lend [G4]. Put above a head block that had free room above it, the block gets the rows between them as unowned runs, and its lend is unowned too, so taking it away gives the head block its row back [C3]. (`fresh`, `gapUnder`, `gapOver`)
  3a. A block that is not the carried block and comes between two blocks by itself, because it widened (its text changed, phase 1a, or at rest, phase 9) or a primitive moved it: in a column of a block `l` where, in `base`, the nearest block above `l` was `u`, the nearest is now `x`, and `u` is the nearest above `x` there. Then `x` counts as put into the gap of `u` → `l` by rule 3: that gap keeps its owners and is split around `x`; the pair `u` → `x`, if it is new, gets the runs above `x`; the pair `x` → `l` gets the runs under `x`, or, if it was a pair already, keeps whichever of its own runs and those reaches lower, so the gap that held `l` still holds it; and the rows `x`'s body covers become its lend for that pair. Where nothing was above `l` in that column, the rows between `x` and `l` are unowned, and so is its lend. Whether `u` → `l` stays a pair is GAP.1's, as always; if it stays, rule 1 keeps its runs. So `x`, growing, pushes `l` with the gap under it, like any text (H1); and `x` taken away, or narrowed back off those columns, gives `l` its gap back whole (rule 2) [S8, G4, C3]. (`between`)
  4. Any other new pair: the rows belong to the block above [G1].
  5. Then each block's binding gap gets any rows it lacks to reach the block's row, owned by its upper neighbour; any gap longer than the distance of its pair is cut from the bottom.
  (`relink`)
- **GAP.6 A block taken away.** Deleted, or carried away (DRAG.B1): its pairs are replaced by pairs across it, by GAP.5 rule 2; its own rows, wherever they lie in any gap, go; unowned rows stay; then FOLLOW: the blocks under it rise into its place. A lower block left with no upper neighbour takes the row of the taken block's top plus its lend plus the runs under it that were not its own, and that row is its stored row from then on [G2, C3]. (`removed`)
- **GAP.7 Gaps live in their columns.** A block carried to other columns never brings its rows along; in the new columns it gets no rows of its own, so gaps never add up [G4].
- **GAP.8 A head block moved up by hand.** The empty rows it leaves above the block under it become its own rows (GAP.5 rule 1, «with nothing above it»): every empty row under a head block is its own, so deleted or carried away it takes them along and the block under it rises to its place [G6]. (`left` with nothing above)

## 5. Module SETTLE: the one solver

`settle(start, change, memory) → {layout, start, memory, pressed}`. Inputs: the layout a gesture or edit starts from (`start`: the stored state with its derived rows), what the user changed (`change`, §5.2), and the gesture's memory (§6.D, RESIZE.1, AREA.6, EDIT.6). Outputs: a layout satisfying INV-1 to INV-5, with its pairs and gaps found again; `start` and the memory as phases 3 and 11 left them (the caller keeps them for the next move); and `pressed`, the block phase 11 would choose, which DRAG uses for the hold timer and VIEW lights. SETTLE changes nothing else.

### 5.1 The phases, in this order

Each phase reads only what the phases before it produced, and visits several blocks in reading order of the layout it starts from.

1. **Apply.**
   1a. Set the sizes the change sets (typing, a fold, a handle's `cw`, `ch` or `fold`, the hidden-lines count, a re-measure); FOLLOW; recompute the rest widths only of the elastic blocks whose content changed, on the rows FOLLOW gave (SIZE.1); FOLLOW again if a height changed. A change of room (a set width, a wall, the moved block, a block taken away) is met in phases 2–7 and settled in phase 9, never here.
   1b. Take away the block the change deletes, or the carried block when it is away (GAP.6, which ends with FOLLOW).
   The layout now is `base`: every RELINK of this SETTLE compares with it, so a column a carried block left is already closed when the block comes back (GAP.5, INV-7 b).
   1c. Put the moved block of the change (§5.2) at its target, with its target width; it takes part in no pair until phase 8.
   A change with no moved block goes on by its kind (§5.1a): a wall at phase 2, any other at phase 8.
2. **Sides.** Judge once, by the rule of the change (§5.2), every block that shares a column with the moved block: above or below it; and every block that hits it: met from the side or not. A block gets both judgements; the side judgement wins in phases 4 and 11, and «above or below» is used for a block met from the side only when P-ASIDE puts it back. A neighbour letting the block through gets both judgements like any other block, but they count only if phase 3 releases it; while it is in the memory it is judged neither way (PR-4). The judgements hold for the rest of this SETTLE. For a wall the judgements are its own (§5.3): every block sticking out past it is met from the side, and nothing is above or below it.
3. **Letting through.** If the memory holds a neighbour letting the block through (DRAG.B4):
   - it leaves the memory when the target row lies past the row the moved block is pinned at, on the side away from the neighbour: before a swap the block was carried back, and the neighbour is pushed again like any other; after a swap the block goes on, and the neighbour stays where it is; either way it is an ordinary block with its phase 2 judgements for the rest of this SETTLE;
   - otherwise it is pinned where it stopped, the blocks under it following with their gaps as in P-DOWN (going up, as in P-UP), and the moved block is pinned right against it, on its touching row; `frow` drives only the swap test;
   - when `frow` puts the moved block's leading edge past the neighbour's middle, they swap: going down, the neighbour takes the moved block's pinned row and the moved block stands right under it; going up, the moved block takes the neighbour's top row and the neighbour stands right under it. The swapped layout is relinked (phase 8 with this layout) and becomes `start` for B1; the memory's neighbour becomes the swapped one, with its new row and the opposite direction; SETTLE starts again at phase 1, at most once for every neighbour passed.
4. **Press aside.** Every block met from the side is pressed by P-ASIDE. A block that narrows changes its shown height: FOLLOW at once, so the blocks under it move with their gaps.
5. **Push up.** P-UP.
6. **Push down.** P-DOWN.
7. **Separate.** P-SEP.
8. **Relink.** RELINK against `base`, with the moved block as the carried block.
9. **Rest.** One fixed sequence, run once: (a) `RESTPASSES` passes of SIZE.8: a pass visits the elastic blocks in reading order of the layout it starts from, gives each its rest width on the rows it stands on and its height at that width, and ends with FOLLOW; (b) the hits this leaves, one at a time, the first in reading order: P-REST, or P-SEP where P-REST does not apply; (c) RELINK against the layout after phase 8. Step (a) may move blocks up (a text widened and got shorter); it runs a fixed number of passes, so it ends. Step (b) moves blocks only right within the container, or down, and only narrows elastic blocks, so their heights only grow: every step raises the sum of all the blocks' columns and rows, which can rise no higher than `RESTSTEPS` (§1.5) allows; so (b) ends, and if it ever takes more steps, which is a bug, SETTLE fails (§5.5). A text that (b) left narrower than its rest width gets it at the next SETTLE (E-2).
10. **Contain.** Check INV-4 by the rule of the change (§5.2): an area grows, a width is clamped, or the change is refused (§5.4).
11. **Choose (a carry only).** If the memory holds no neighbour letting the block through: the candidates are the blocks that, in this result, touch the moved block's leading edge in the direction of the vertical move, share a column with it, and are not met from the side; `pressed` is the first in reading order, or none. When the pointer has been still (within `STILL` of the hold point) for `HOLD` against this same `pressed`, or Shift is held, `pressed` goes into the memory and SETTLE starts again at phase 1 [M6].

### 5.1a Which phases a change runs

| Change (§5.2) | Phases |
|---|---|
| A moved block: a carry, an arrow, a new block, the width handle | 1–10; 11 for a carry |
| A wall: an area's side handle, the sheet's right edge carried inwards | 1a (the container's new columns), 2 (the wall's judgements), 4 (P-ASIDE by the wall), 6 (P-SINK for what P-ASIDE put back; P-DOWN has nothing to push), 7–10 |
| A size, a deletion | 1a or 1b, then 8–10 |
| An area's top or bottom handle | 1a, P-SQUEEZE in place of 2–7, then 8–10 |
| A temporary height | no SETTLE: the displayed layout (§2.1) |

### 5.2 Changes

| User action | Moved block | Sides (phase 2) | No room aside | Containment (phase 10) | Memory |
|---|---|---|---|---|---|
| A pointer move while carrying, or the hold running out, or Shift pressed | the carried block at the target | DRAG.B2, B3 | pushed up or down by its side (DRAG.B5) | clamped at the sides and top (DRAG.A3); an area grows at its bottom | the carry memory, §6.D |
| An arrow in position mode | the selected block at the cell its jump aims at (DRAG.C4) | DRAG.B2, B3 | as a carry | as a carry | empty |
| A click on the empty sheet, «+», a block made on a narrow screen | the new empty block at its cell, away from the start | DRAG.B2 with «away», and B3 | as a carry | as a carry | empty |
| The width handle | the widened block itself, at its new width; no above or below is needed | every block it hits on its right is met from the side, pressed right | P-SINK, in phase 6 after P-DOWN | the width clamped at the container's edge; an area grows | the gesture's start, RESIZE.1 |
| The right edge of the sheet, carried outwards | none | — | — | the sheet grows, up to the edge of the screen | the gesture's start |
| The right edge of the sheet, carried inwards | none: the edge is a wall, as an area's side handle | as an area's side handle | P-SINK | refused: the edge stops (§5.4) | the gesture's start |
| A side handle of an area | none: the moving edge is a wall (§5.3) | every child sticking out past it is pressed inwards by the wall | P-SINK, in phase 6 after P-DOWN | refused: the handle stops (§5.4) | the gesture's start, AREA.6 |
| The top or bottom handle of an area | none: P-SQUEEZE replaces phases 2–7 | — | — | refused: the handle stops (§5.4) | the gesture's start, AREA.6 |
| The height handle, a double click on a handle | none | — | — | an area grows | none |
| Deleting a block | none (1b) | — | — | — | none |
| Typing, a fold, the caret entering a block that hides lines | none (1a) | — | — | an area grows | EDIT.6 for a provisional line |
| A temporary height (§1.2) | none: no SETTLE, the displayed layout (§2.1) | — | — | an area grows, shown only | none; nothing of it is stored |

### 5.3 The primitives

- **P-ASIDE.** A block `n` met from the side by a block `p` moves away from `p` so that their cards no longer share a column; `n` may stand with its handle cell on the last cell of `p`'s card. The blocks `n` then hits go aside the same way, a chain, in reading order. An elastic block gives way by SIZE.2. A block in the chain that cannot make all the room asked of it goes as far as it can (a set width a cell at a time, without pushing back the block pressing it; an elastic one down to its minimum), and the block pressing it then narrows by what is left, if it is elastic and above its minimum; if it cannot, the failure goes up the chain the same way. The moved block of the change never narrows here. If the first block of the chain cannot get out of the way, the whole chain is put back where this phase found it, and that block is handled by the change's «no room aside» (§5.2): for a carry, P-UP or P-DOWN by its side; for a handle, P-SINK [M5, W3]. (`shove`, `far`)
- **P-UP.** Every block judged above the moved block that reaches it goes up so that its bottom meets the moved block's top: first the gap above it shrinks, then the blocks above it go up too, each as high as it can, up to row 0. The moved block stands under the lowest bottom they could reach [M3]. (`up`, `topmost`)
- **P-DOWN.** Every block judged below the moved block that reaches it goes down so that its top meets the moved block's bottom, and the blocks under it follow with their gaps. No limit but §5.4 [M2]. (`down`)
- **Wall.** Not a block: the moving edge of an area's side handle. The right wall presses, in phase 4, as `p` of the first block of a chain, every child whose card passes the last column, until its card ends at that column; the left wall every child whose handle cell is left of column 0, until it is at column 0. A wall is judged nothing, reaches nothing, pushes nothing in phases 5–7, is in no pair, and has no `pressed`.
- **P-SINK.** A block P-ASIDE put back, for a handle: under a wall it goes to the nearest column where its card lies inside the container; under the width handle it keeps its column. An elastic block sinks at `min(natural width, TEXTW)` clamped to the container, and gets its rest width in phase 9. It goes down to the lowest bottom of the blocks it hits, repeated in reading order until it hits none; its lower neighbours follow with their gaps [W5]. (`squeezeH`)
- **P-SEP.** Two blocks that still hit: the moved block never moves; against it, the other goes by its side, a block below to its bottom; between two other blocks, the lower one, or on the same row the right one, or on the same row and column the later in reading order, goes down to the other's bottom with the blocks under it, as today's app separates blocks [S6].
- **P-REST.** At rest (phase 9), an elastic block at its minimum that still hits a neighbour on its right presses that neighbour aside by P-ASIDE, by the cells it lacks, the chain included, as a text growing in height pushes the blocks under it down (H1). When the neighbour cannot make the room, the elastic block goes down itself, under that neighbour. «Never pushes by itself» (W3) is about its widening beyond its minimum. Any other hit is separated by P-SEP [S5].
- **P-SQUEEZE.** An area's top or bottom handle carried inwards by one row, the other edge staying: the children move whole, with their gaps, into the free rows; when there are none, the gaps between children close, the ones furthest from the moving edge first; when none are left, elastic texts hide empty lines (SIZE.7), again furthest from the edge first, the end lines of a text first; when nothing can give, the step is refused. No child changes its column or its order. A handle carried several rows runs one step per row [W5]. (`squeezeV`, `squeezeTB`)
- **Reaches.** A block judged below the moved block reaches it when its top is above the moved block's bottom; one judged above reaches it when its bottom is below the moved block's top; overlapping or not, so a pointer that jumps past a block in one move still pushes it.

### 5.4 Containment

- A carried block is clamped at the sides and the top of its container by DRAG.A3; P-UP stops at row 0.
- At the bottom of the sheet there is no limit.
- At the bottom of an area, a change other than the area's own handle makes the area's shown height grow: the area's SETTLE ends with its children's layout and the new height, and the area's container then runs SETTLE with the change «a shown height» (phase 1a) for the area; the preview shows both [W5, AREA.2].
- An area's own handle never makes the area taller and never puts a child outside: a result that would do either is refused. The handle then stands at the nearest rectangle to the one asked for, searched from it back towards the gesture's start, that SETTLE accepts; nothing about earlier moves of the handle is used (PR-7) [W5].

### 5.5 Failure

SETTLE has one failure result, `{failed}`, returned when a bound is exceeded: the restarts of phase 3 (once for every neighbour passed) or of phase 11 (once per move), or `RESTSTEPS` in phase 9. It is a bug, never the user's error. The caller keeps the layout it had before the change and writes nothing; a gesture ends as a cancel (DRAG.C3); the dev look (VIEW.7) reports the change and the layout it started from, so that the case becomes a test.

## 6. Module DRAG: carrying a block

DRAG turns a pointer into a target, hands it to SETTLE as a change, and shows or stores the result. Inputs: the layout the carry started from, the pointer, the keys, the carry memory. Outputs: the target and, on a drop, the layout to store.

### 6.A The target

- **DRAG.A1 The cell.** The block's top-left card cell follows the pointer with the offset it was grabbed at, rounded to the nearest cell; `frow` is the unrounded row.
- **DRAG.A2 Sticking.** While the pointer is within `STICK` of the column the block was taken from, and the carry since it was picked up has been more vertical than horizontal, the column is held at that column; the same for the row when the carry has been more horizontal. A held row is also `frow`. When the pointer comes back within `STICK`, the value is held again [M7].
- **DRAG.A3 The edges of the container.** The block's top is clamped to row 0. Past the right edge, an elastic block narrows so that its left edge stays under the pointer, down to `min(natural width, MINC)`, and then stops; carried back, it widens again. A block with a set width stops at the last column where it fits whole. At the left edge every block stops. The state is «outside» when the pointer itself leaves the sheet's box. The carried block as drawn stops at these edges as its ghost does: it never slides out of the sheet, so nothing scrolls past it [W4, C1]. When the window shows only part of the sheet, the sheet scrolls by itself while the pointer holds the carried block at the window's edge: sideways up to the sheet's own edges, and downwards with no limit, the sheet growing under the block as it does today (§5.4) [W16].
- **DRAG.A4 Home.** Exactly on the cell it was taken from at the start of the carry, the state is «home» [C1].
- **DRAG.A5 The carried block's width.** A carried block keeps the width it had when the carry started, narrowed only at the edges by DRAG.A3. In the result, phase 9 gives an elastic block its rest width at the target (SIZE.1): it widens where there is room and stays narrow beside a neighbour on its right, and its own widening never presses anything, as an elastic block never pushes by itself (W3); only what the block overlaps is pressed. The preview shows that width (DRAG.C1, INV-8). A block with a set width keeps it [S4].

### 6.B What DRAG asks of SETTLE

- **DRAG.B1 In its columns, or away.** «Away» is carry memory. It is set when the carried block's card shares no column with its place in `start`, and cleared only when it shares both a column and a row with that place. While not away, its place is held: nothing rises under it [M1]. While away, its place is freed in phase 1b [G2]. `start` is the layout at the start of the carry, or at the last swap (phase 3); DRAG.A2 and A4 always use the start of the carry. A block just made (EDIT.4, VIEW.4) is away from the start.
- **DRAG.B2 Above or below.** A block that shares a column with the carried block and stood in its columns in `start` keeps the side it had there, unless the block is away; any other is below when its middle is strictly below `frow`, otherwise above [M1, G2].
- **DRAG.B3 Met from the side.** A block that hits the carried block is met from the side when the overlap across the columns is smaller than the overlap along the rows, or equal and the last move between two targets was sideways (vertical before any move). It is pressed to the side its centre lies on, to the left when the centres coincide. Once met from the side, it stays so for the rest of the carry while it shares a row with the target rows; the record is cleared at a swap [M5].
- **DRAG.B4 Letting through.** DRAG keeps the hold point and starts the hold timer on SETTLE's `pressed`, restarting it when `pressed` changes or the pointer leaves `STILL`; the neighbour is chosen in phase 11 and applied, released and swapped in phase 3. While it lets the block through, the ghost stands right against it and a drop stores the block there; the dragged block itself follows the pointer. After a swap, the swapped neighbour, now on the other side, lets the block back the same way. Carried back before the swap, the neighbour is pushed again [M2, M6, M5].
- **DRAG.B5 No room aside.** A block met from the side that P-ASIDE put back is pushed by P-UP or P-DOWN according to DRAG.B2 for this move; it stays met from the side, and comes back up, aside and as wide as before, as soon as the block is carried back [M5].

### 6.C The result

- **DRAG.C1 The preview.** During the carry, the layout shown is SETTLE's result for the current target; at «home» or «outside», the layout at the start of the carry, before any swap. The carried block shows its width and height at the target (INV-8).
- **DRAG.C2 Drop.** Letting go in the «move» state stores the result as one undo entry [C2].
- **DRAG.C3 Cancel.** Esc, the right mouse button, «home» and letting go outside the sheet store nothing [C1].
- **DRAG.C4 Arrows.** The arrows of position mode jump, as today: left to the left edge of the container, right to the last column where the block fits, up right under the nearest block above it in its columns, down right over the nearest block below, or under the lowest block when there is none. A jump is a carry to that cell with an empty memory, dropped at once, so what it meets is pushed by the rules of a carry. The arrows are for throwing a block to an edge, not for moving it a cell; a later release may jump several selected blocks at once, lining them up on a side of the sheet [W15]. On a computer position mode is entered from the block's menu («Виділити»); on touch it waits for its own stage (W13).

### 6.D The carry memory

Kept for one carry only and cleared at «home» and at the drop: the start place and pointer (DRAG.A2, A4); `start` (B1); the last target and the direction of the last vertical move, down before any vertical move when the target row is not above the start row (B3, phase 11); the blocks met from the side and their sides (B3), cleared at a swap; the neighbour letting the block through and the row it stopped at (B4); the hold point and its timer (phase 11); «away» (B1); the lowered bottom of each area it was carried in (AREA.7); and the note's width frozen for the carry, so that VIEW does not rescale the sheet under the pointer. Nothing else carries over from one pointer move to the next.

## 7. Module RESIZE: the handles of a block

- **RESIZE.1 The width handle.** Carrying the handle at the card's right edge sets `cw`, from three cells to the container's right edge. The blocks it reaches are pressed aside by P-ASIDE, an elastic one giving way by `ORDER`, one with no room going down by P-SINK. Every move of the handle is a SETTLE from the layout the gesture started from (its memory), so carrying the handle back retraces the way; letting go stores one undo entry [W8, W3, C2].
- **RESIZE.2 Back to elastic.** A double click on the width handle removes `cw` [W3].
- **RESIZE.3 The height handle.** Released above the content, it writes `ch` and clears `fold`; released below it, it writes `fold` and clears `ch`; a double click clears both. `ch` below the content is ignored [H1].
- **RESIZE.4 A long paste.** A block made by a paste longer than 14 lines starts with `fold` 12 (`PASTEFOLD`); nothing else folds by itself [H2].

## 8. Module AREA: areas and their edges

An area is a container inside the sheet: inside it, every rule of SIZE, GAP, SETTLE, DRAG, RESIZE and EDIT holds with the area's own columns and rows; the interface keeps one level of areas, the engine is written recursively [N1]. Inputs: the area's rectangle, its children's layout. Outputs: the area's new rectangle and its children's layout, through SETTLE.

- **AREA.1 Containment.** The children always stay inside the area (INV-4, §5.4). At its sides a carried child behaves as at the edges of the sheet (DRAG.A3) [W4].
- **AREA.2 Height.** An area is never shorter than its content, and grows when a change other than its own handle pushes a child past its bottom (§5.4); it may be set taller with its bottom handle [W5].
- **AREA.3 A side handle carried inwards.** The opposite edge stays. The moving edge is a wall: what sticks out past it is pressed inwards by P-ASIDE; a block left with no room on its rows goes down by P-SINK, under what stands in its way, shifted inwards as far as it needs, and takes its rest width in phase 9. The handle stops (§5.4) where a block cannot fit even alone (a set width wider than the area, or an elastic block's minimum), and where a block, or a block it pushes, would come out past the bottom edge. The left handle works as the right one, mirrored [W5]. (`squeezeH`)
- **AREA.4 The top or bottom handle carried inwards.** P-SQUEEZE, one row at a time, until it is refused, then the handle stops (§5.4). For the bottom handle this supersedes H5 (an area folding to a height like text) until folding comes as one function in the next release [W5, A3].
- **AREA.5 A handle carried outwards.** The children keep their places on the sheet; hidden empty lines come back while there is room, the ones nearest the moving edge first [W5]. (`unsqueeze`)
- **AREA.6 One gesture, one entry.** The handle's memory is the layout and the rectangle at the start of the gesture, nothing else; every move of the handle is a SETTLE from it, so carrying it back retraces the way; letting go stores the area and its children as one undo entry [W5].
- **AREA.7 Entering and leaving.** By the pointer: a carried block goes into an area when the pointer comes inside its frame, and out when the pointer leaves it [A1]. (Tried against «whole» and «only by command» in the mockup.) An area counts as it was when the carry started, its bottom lowered to one row under the lowest of its other blocks when they need it: the carried block may stand right under the lowest of them, pushing it down or after swapping with it, and stays in; carried lower, it goes out. Within one carry this bottom never moves up, so a swap that lifts the neighbour does not put the pointer outside; the carried block's own body never keeps it in. A set width wider than the area never goes in. The container the block leaves lays out without it, as if it were deleted (GAP.6); in the one it enters it is a new block, away from the start (DRAG.B1); an area never lets a block through by holding; and «В область» puts the selected block into the nearest area it fits, under its lowest block at the left edge, as the app does, while «З області» puts it on the sheet under the area, in the column it had inside [A1, A2].
- **AREA.7a An area on its container.** On the sheet an area stands as a block with a set width, with one free cell round its frame for its handles: what stands beside it, above it or below it keeps that cell free, and it is pushed and followed by the same rules as a block. A block carried on the sheet over an area it does not go into stops at the frame, on the side it came from (where it last stood clear of the area, or, just out of another container, where the pointer is); pressed against the left side, an elastic block narrows first, as at the sheet's edge (DRAG.A3). A side handle carried outwards presses what it reaches aside, and what has no room goes down under the area (P-SINK); the blocks under the area follow its bottom handle both ways [A2].
- **AREA.7b Drawing an area (as in the app).** A drag on the empty sheet, outside every area, draws an empty area from the cell pressed to the cell under the pointer, at least 4 × 2 cells; it is put in as a new block is (EDIT.4), so what it covers makes room by the same rules, above or below judged by its frame; the preview shows where it will stand. Areas are never nested. In the reading mode and in the app look, an area's handles show only under the pointer, as a block's handle does (VIEW.6a) [A2].
- **AREA.9 Long content in an area.** Decided (A3, 2026-11-04): the first release folds nothing new; an area with no set height follows its blocks, and its existing collapse to the header stays. The next release makes folding one function with one standard stored field for every kind that folds (text, area, code, to-do lists) and settles the ways tried in the mockup: Two needs, «I see the blocks, only shorter» and «I know they are there, I need not see them», and these ways, all heights of SIZE.6 and none stored as a layout:
  1. A long text folds itself (H1): from its menu, «Згорнути до 5 рядків», or with its height handle; the area follows its blocks, so it gets smaller. An area's height is its content's, or its set height `ch` from its bottom handle when larger; growth with the content is not kept once the content shrinks (AREA.2).
  2. An area has three states, switched on its header: all blocks as they are; «Рядки», every block one first line with «+N рядків», a click opens that one for reading (a temporary height, H3); collapsed, a strip with «N блоків», whose hover or tap lists the first lines, and a click on one opens the area on that block. A compact or collapsed area takes no carried block, makes no new block on a click, and hides its handles. The state is stored with the area.
  3. A variant of the top and bottom handles: when P-SQUEEZE can give nothing more, the handle folds the long texts, the one furthest from the moving edge first, a row at a time, never below 3 rows shown, instead of stopping; the folds are stored on release (W5 says the handle stops; this is offered as an alternative).
  Every kind that folds will fold the same way: one stored field, its passport reading it, one «Розгорнути» row and one menu command (A3).
- **AREA.8 The sheet's right edge.** The sheet is a container too, and its right edge is a handle. Carried outwards into the white room of a wider window, it widens `SHEETW`, up to the edge of the screen and no further; nothing moves. Carried inwards, it narrows `SHEETW` as an area's side handle narrows an area (AREA.3), except that the sheet has no bottom edge to stop at. Letting go stores it with one undo entry [W7].

## 9. Module EDIT: clicks, the caret and new blocks

Inputs: a click or a hover on the sheet, the blocks' rectangles. Outputs: where the caret goes, or a change for SETTLE.

- **EDIT.1 What a point belongs to.** A point belongs to a block when it lies on its card, the spare room of a set size included, or within `NEAR` to the right of the card or under it. A point on a card belongs to that card even when it is within `NEAR` of another; a point within `NEAR` of two cards belongs to the first in reading order. Any other point of a container is empty sheet [M8]. A point in the white room beyond `SHEETW` is no part of the sheet: a click there does nothing [W7].
- **EDIT.2 Before the click.** Over a block, its whole frame shows and the cursor is a text cursor; over the empty sheet, the cursor is a cell and nothing else shows [M8].
- **EDIT.3 A click on a block.** On its text, the caret goes there. To the right of a line, it goes to the end of that line. Below the text, in the spare room or within `NEAR` under the card, it goes to the first empty line after the text, made if there is none: a provisional line, a temporary height (§1.2), which becomes text only when something is written on it and is taken back when the caret leaves without it. Clicking below again finds the same line; only Enter adds lines. A block with spare room keeps its height; one without grows by a row, as with Enter [M8].
- **EDIT.4 A click on the empty sheet.** A single click starts a new empty elastic text there, its card on the clicked cell: a change for SETTLE (§5.2). Left empty, it is removed as a delete (GAP.6); if nothing else has changed since the click, the layout before the click is restored instead, and the click and the removal together make no undo entry [M8, C3].
- **EDIT.5 The caret brings hidden lines back.** Putting the caret in a block that hides empty lines sets its count to zero: a change of §5.2 that writes [W5].
- **EDIT.4a A new block carried before anything is written in it.** It keeps the caret while it is carried, so it is not taken away under the hand, and the caret is back in it after the drop. Left empty afterwards, it goes away with its carries too: the layout is the one before the click (EDIT.4) [M8, C3]. The removal waits until no gesture holds the block (a block being carried or given the caret back stays), and it takes away only that block and restores the others' places: nothing else on the sheet is rebuilt.
- **EDIT.6 EDIT's memory.** The block and the line of a provisional line, and the text before it, until the caret leaves; the block made by EDIT.4, whether anything was written in it and the layout before the click, until the caret leaves it.

## 10. Module VIEW: windows, scale, the narrow view, the look

Inputs: the stored layout, the window width, the settings, and during a gesture the note's width frozen in its memory. Outputs: what is drawn. VIEW never writes the layout (INV-6), and nothing it hides or shows changes how anything is measured (PR-8).

- **VIEW.1 Window and scale.** The width that counts is the sheet's, `SHEETW`. The visible area is the window less the list of notes when the list is docked. A visible area wider than the sheet shows the sheet with its dot grid and plain white room to its right, where nothing can be placed. The scale is fitted to the width the note uses, up to its rightmost block, not to the whole sheet [W12]: a visible area at least that wide shows the note at full size, and the rest of the sheet, when the window is narrower than `SHEETW`, is reached by the sideways scroll and the hand; a narrower one shows the note scaled down to fit its used width, no smaller than `MINSCALE`; narrower still, the narrow view (VIEW.2). The user can zoom in from the fitted scale, and from the narrow view to the real layout; a horizontal scrollbar appears and the hand works (the scale is a setting of the device, never stored in the note). The first release places blocks on a computer only [W13]: a device with a mouse or a trackpad, at `MINSCALE` or more, edits the layout. A phone or a tablet reads, writes, deletes and creates blocks as VIEW.3 allows and moves nothing, whatever its width: at `MINSCALE` or more it shows the real layout so, below it the narrow view, with «Показати як на компʼютері» only to look at (VIEW.5, W6). How touch devices move blocks waits for their own stage (O-5). Widened again, the note is as it was. During a gesture the visible area and the scale are frozen [W2, W7]. The fitted scale is recomputed when a note opens and after an action (a drop, a handle, a creation, a deletion); typing never changes it while the caret is in the block, and it is recomputed when the caret leaves [W16].
- **VIEW.1a The list of notes.** Hiding it only widens the visible area; it never changes a note. Opened, it pushes the note aside when the note still fits beside it at its current scale, and otherwise opens over the note like a drawer, so that opening it never rescales the note [W7].
- **VIEW.1c A note without a width.** A note begun on a phone has no `SHEETW` yet: on a device that is not a computer it fits the screen, like a web page. The first time a computer opens it, the width that computer shows with the list of notes open becomes its `SHEETW`, stored and synced; from then on it is a note like any other. The blocks made on the phone keep their places, a column at the left margin (W6) [W7].
- **VIEW.1b The hand.** In the hand mode a drag moves the sheet in any direction and does nothing else: no click, no carry, no new block. It is on while Space or the middle mouse button is held, or while the hand button is pressed, a toggle next to the scale [S2]; two fingers on a touchpad or a touch screen scroll the sheet as always [W7].
- **VIEW.2 The narrow view.** The blocks one under another in reading order, an empty row between them, none wider than the screen; an area as a frame with its children inside in the same way; long blocks folded at `FOLDPHONE` rows, a temporary height. The stored layout under it keeps `SHEETW`: nothing measured for the narrow view feeds back into it [W2, W6, H6].
- **VIEW.3 What the narrow view allows.** Reading, writing and formatting text, following links, copying, unfolding and folding for reading, deleting and creating blocks. Not carrying, the arrows, the handles, «В область…» and «З області» [W6].
- **VIEW.4 A block made on a narrow screen.** Made after block X, it goes under X on the computer, in X's column, one empty row under X's bottom, as a change of §5.2 like EDIT.4. «+» puts one under every block at the left margin. In the narrow view it shows by reading order, so it can appear after a block that stands beside X [W6].
- **VIEW.5 «Показати як на компʼютері».** The computer layout scaled to the screen, only to look at [W6].
- **VIEW.6 The look during a gesture.** Every block shows its real size as a thin frame, its empty part included; the carried block gets a background; a selected block shows its frame only. Guides follow the carried block: a hairline along the left edge of its card and one along its top, across the sheet, solid where they meet the starting place or the left or top edge of another block, the row one paler than the column. A neighbour pressed for `HOLD` lights its outline while the time runs and keeps it lit while it lets the block through. The width handle shows only under the pointer [V1, M6, M7].
- **VIEW.6a The note's view settings.** Where the text stands and which field (P18) are a setting of the app, synced, which a note may override with its own, stored and synced (in the first release a setting of the device, every variant offered and today's look the default, for the owner to try on real notes; P18); changing either is a change for SETTLE (a re-layout with its undo). A note's view switch chooses between borders always visible and the reading mode: at rest only text on a clean sheet; the borders of all blocks show while a block is carried (VIEW.6), and while the pointer is held still on the empty sheet for a moment (they go when it is let go, and nothing is created). A new block starts with no frame, only the caret, and while it is started nothing else shows: no borders of the other blocks (O-17). In the reading mode the block's handle shows only under the pointer, while the caret is in the block and while it is carried; on a touch screen, with no pointer to hover with, it stays faint. With borders always visible the handle is always shown [S1]. Borders show as a thin frame or with a background, chosen in the same view settings. By default a note is in the reading mode with a thin frame; the note's menu switches to borders always visible and to a background [V2].
- **VIEW.7 Two looks.** The app look shows only what VIEW.6 lists. The testing look («dev») adds what the rules work with: the gap runs with their owners and sizes, the blocks' letters, sizes in cells, row numbers, the outline of the place a block was taken from, the focus ring. Both looks are kept in the app; the testing look is switched on, deep in the app's settings, to track down a bug [V1, V2]. A block selected with the keyboard shows its frame solid instead of dashed: that is the focus in the app look [V1].

## 11. Precedence

The phases of §5.1 order everything within one change, and the table of §5.2 says what differs between changes. These rules settle the rest.

- **PR-1 Home and outside first.** At «home» or «outside» SETTLE does not run for that move (DRAG.A4, C1).
- **PR-2 One target per move.** Every phase uses the target of DRAG.A, never the raw pointer: a held row is the row for the sides and the swap too (DRAG.A2, B2, phase 3).
- **PR-3 Sides are sticky and exclusive.** A block met from the side is pressed aside, or pushed for lack of room; it is never a candidate to let the block through (DRAG.B3, B5, phase 11).
- **PR-4 The neighbour letting the block through is fixed.** While it is in the memory its phase 2 judgements do not count and it takes no part in phases 4–7; released in phase 3, it is an ordinary block with them.
- **PR-5 Containment by §5.4.**
- **PR-6 FOLLOW and RELINK only at their points.** FOLLOW runs in phase 1a, at the end of GAP.6, inside phase 3 for a pinned neighbour's lower blocks, inside phase 4 after a narrowing, in phase 9, and in making the displayed and the canonical layout (§2.1); RELINK in phase 3 after a swap, phase 8 and phase 9. An area that grows hands its new height to its container's own SETTLE (§5.4), which runs these steps there. No phase reads gaps written in the middle of another.
- **PR-7 No hidden memory.** SETTLE reads nothing but `start`, `change` and the gesture's memory, and writes nothing but its outputs; the caller keeps the returned `start` and memory for the next move.
- **PR-8 Presentation never changes measurement.** Nothing VIEW draws or hides changes a width or a height.

## 12. Lessons from the mockup's bugs

Each bug found while the owner tried the mockup came from two rules meeting without a stated order. The rules above are cut so that each has one place where it is decided.

1. **A «home» zone of one cell swallowed pushes** next to the starting place (2026-11-01). Home is the exact cell only (DRAG.A4, PR-1).
2. **Sticking held the row, the side judgement used the pointer**, so neighbours above were pushed down (2026-11-01). One target per move (PR-2).
3. **A neighbour pushed down for lack of room, then held still over, let the block through** and stayed down (2026-10-30). Sides are exclusive (PR-3).
4. **A block brought back into its columns lower down pushed its old lower neighbour through itself** (2026-10-31). Away and back (DRAG.B1, B2).
5. **An area's height did not follow children that went down**, and they stuck out (2026-10-31). Containment in one place (§5.4).
6. **A carried block's gap piled onto the gaps of its new column** (2026-10-27). Gaps live in their columns (GAP.7).
7. **Room reserved for a testing label made texts wrap early**, which looked like free room in the app look (2026-11-01). Presentation never changes measurement (PR-8).
8. **A new block on the same row as a neighbour judged that neighbour above it** (2026-10-31). A new block is away from the start (DRAG.B1).
9. **The narrow view measured elastic widths with the phone's columns** (2026-10-31). The layout under the narrow view keeps `SHEETW` (VIEW.2).
10. **The bottom handle of an area closed a gap and reopened another** when it moved several rows at once (2026-10-31). One row at a time (P-SQUEEZE).
11. **A state class of the mockup collided with the class of another element** and narrowed the sheet, so clicks on its right part did nothing (2026-11-01). For the engine: the view's state names live in their own namespace, and every interface scenario clicks across the whole sheet.
15. **A new empty block grabbed by its handle lost its caret, was taken away under the hand, and the carry never ended**, so every click on the sheet was ignored afterwards (2026-11-02). A block being started keeps its caret while carried (EDIT.4a), and for the engine: a block is never removed under a gesture, any gesture whose block is gone ends at once (§6.D is cleared), and a new press ends any gesture still hanging before it does anything else, so the sheet can never stay in a carry.
16. **Pushing a neighbour down, the block let it through after one or two rows** (2026-11-04). The hold timer restarted only when the block changed cell, so a hand moving slowly, more than `HOLD` per row, ran it out while moving; and in an area the pointer was compared with the area's first bottom, so a block pushing a neighbour past it left the area. Then a swap inside an area threw the block out at once: the neighbour that let it through stood still while the pointer went down through it, past the area's bottom, and the swap lifted that bottom further. For the engine: the timer restarts whenever the pointer leaves `STILL`, as DRAG.B4 says, whatever the target does; an area keeps a carried block down to one row under its lowest other block, and that bottom never moves up within a carry (AREA.7).
14. **The carried block slid past the edge of the sheet while its ghost stopped**, which made the sheet scroll; **a long press on the empty sheet started the browser's own text selection and drag** (2026-11-02). The drawn block obeys the same edges as the ghost (DRAG.A3), and the sheet selects nothing outside the texts.
12. **The width handle, the area's handles, a new block and the carry each had their own pushing code** in the mockup, with slightly different rules. One solver (§5).
13. **Found in review, not yet seen by the owner:** the mockup compares gaps with the start of the carry, so a block carried away and back loses a row of its upper neighbour's gap (D-11). RELINK compares with `base` (phase 1).
17. **A text that widened by itself between two blocks took the upper one's gap as its own**, so deleting it lifted the lower block to the upper one (found by the independent review, 2026-11-04, and shown in the mockup's «Расширился между»). A block that comes between by itself counts as put into the gap (GAP.5 rule 3a, S8).
18. **A gap that did not hold its lower block lost rows every time a text beside it grew and shrank back** (found while trying rule 3a in the mockup, 2026-11-04: in «Две колонки» C grown by four lines and back took E's gap of four rows from F, and deleting C then lifted F). A row that FOLLOW or a height changed is not a move (GAP.5 rule 1).

## 13. Tests

Every rule gets fast tests without a browser over the engine's pure functions, as `tests/sync*.mjs` test the sync core; the interface keeps browser scenarios. Each primitive and each of FOLLOW and RELINK gets its own test file. Every test checks INV-1 to INV-5 after each SETTLE; the gesture tests check INV-8 by comparing the last preview with the stored result; the review's scenarios (growth with a gap under it, away and back, a held neighbour on several columns) are regression cases from the start. The mockup's checks are the seed:

| Module | Rules | Mockup scenarios | Asserts |
|---|---|---|---|
| SIZE | 1–5, 8 | `width`, `widthtext`, `elastic`, `card`, `wrap` | rest widths, giving way by each `ORDER`, set width kept, determinism of the passes |
| SIZE | 6–7 | `area5`, `write2` | hidden lines hide and come back, the text unchanged |
| GAP | 1–8 | `own`, `grow`, `press`, `leaf`, `one`, `back`, `widen`, `twocol` | INV-2, INV-3, INV-7 b after insert, remove, grow, shrink; unowned runs above a head block; growth keeps the gap under; a block come between by itself (rule 3a) deleted, narrowed back, grown and shrunk, with the upper block still a neighbour in other columns or not, with several upper neighbours, with a pair it had already, above a head block; a gap that does not hold its block kept through grow and shrink; a lend per pair for a block between two pairs |
| SETTLE | 5.1–5.5 | `side`, `up`, `push`, `card`, `inside`, `margin` | each primitive alone; phase order; which phases each kind of change runs (§5.1a): a side handle whose child sinks into spare rows of the area, and one refused; containment; restarts bounded; phase 9 within `RESTSTEPS` on width, height and FOLLOW feeding each other and on long chains of neighbours; the failure result writes nothing; the displayed and canonical layouts (§2.1): a gesture with wide fields on, dropped and cancelled, stores canonical rows |
| DRAG.A | 1–5 | `axis`, `drift`, `edge`, `home` | one target per move, sticking, edges, home exact, carried width |
| DRAG.B | 1–3, 5 | `away`, `side`, `back2`, `back3`, `elastic` | away and back keeps every gap, sides judged by the target, retrace, no room aside |
| DRAG.B | 4 | `hold2`, `back` | let through, the ghost against the neighbour, swap, back through, pushed again when carried back, several candidates |
| DRAG.C | 1–4 | every drag scenario | preview equals drop, cancel and home leave no trace (INV-7 a), arrows |
| RESIZE | 1–4 | `card`, `leaf` | retrace, `ch` and `fold` exclusive, paste fold |
| AREA | 1–7 | `area`, `area4`, `area5`, `inside` | containment, the spatial search of a stopped handle, order of giving up room, undo |
| EDIT | 1–6 | `write`, `write2`, `caret`, `click`, `click3` | caret places, one provisional line, a new block removed with no trace, clicks across the whole sheet |
| VIEW | 1–7 | `mix`, `phone`, `viewshot`, `textgrid` | nothing written, `SHEETW` under the narrow view, measurement unchanged by the look |

The reference for `RESTPASSES` runs SIZE.8 passes until two in a row give the same layout, or as many passes as the container has blocks; a case that reaches that count is a cycle and is kept as a test.

## 14. The mockup and this document

### 14.1 Comparison options that are not decisions

The mockup keeps switches to compare ways the owner did not choose; the engine implements only the decided one, unless the decision says a setting.

- Horizontal place: «колонка», «доля ширины», «масштаб» (W2 chose «вместе»; the minimum scale is a setting).
- At the edge of the sheet: «возвращается», «упирается» (W4 chose «упругий сужается»).
- An area narrowed below its content: «ручка упирается», «до содержимого» (W5 chose «блоки уходят вниз»).
- Writing next to a block: «как сейчас» (M8 chose «с подсказками»).
- Swapping: «по середине» (M6 chose «подержать или Shift»; the middle rule is dropped, O-4).
- How an elastic block gives way: «сначала сужаться» (dropped, W10).
- Text in its cells, fields, background (P18, open, O-2).
- A block that came between two blocks by itself: «как было в правилах», «б) по старому соседу» (S8 chose «а) вставка», 2026-11-04).

`ORDER` is a real setting [W3]; the dev look is a real feature [V1].

### 14.2 Where the mockup differs

- **D-1** One area per example, standing for the sheet; areas inside the sheet, entering and leaving, folding an area are not in it.
- **D-2** It measures text in the page; the engine asks a measuring function (E-3).
- **D-3** Its elastic maximum is 16 cells; the app's is 26 [W3].
- **D-4** Its sheet's columns are the window's when the window is wider than the note, so rest widths depend on the window; the engine uses `SHEETW` [W7].
- **D-5** It draws a fresh block's placeholder «Пишите…» and counts its width; the engine never measures a placeholder (§1.1).
- **D-6** Its rows are stored for every block, and its temporary heights move the blocks under them in the stored state; the engine derives the rows of blocks with upper neighbours (§2.1).
- **D-7** Its width handle starts every move from the gesture's start, as RESIZE.1 says, but separates the blocks by its own rule (the block more to the left stays, the other moves aside or down); the engine follows P-ASIDE and P-SINK [W8].
- **D-8** Its carried elastic block keeps the width it had at rest, as DRAG.A5 says, but takes its rest width at the target, and an area's pushed-down child its width back, only after the release; the engine shows them in the preview (phase 9, INV-8).
- **D-9** Its choice of the neighbour that lets the block through depends on the order of storage, and the Shift path and the hold path choose differently; the engine follows phase 11.
- **D-10** Its separation after a size change keeps the block more to the left (or, in one column, the upper one) and moves the other aside or down, and an elastic block at its minimum pushes its neighbour; the engine follows P-SEP and P-REST.
- **D-11** Its RELINK compares with the start of the carry, so a block carried away and brought back touching its old upper neighbour loses that neighbour's row, and a second carry away does not give it back; the engine compares with `base` (phase 1).
- **D-13** With «never narrow» its text ignores the neighbours at rest and pushes them aside; the engine caps it by its room (SIZE.4, W9).
- **D-14** Its lend is one list per block, not one per pair, so a block standing between two pairs at once gives back only one of them; its rule 3a looks for blocks that share columns, not column by column; and it tells FOLLOW's moves from pushes only for a whole change (a size change that pushed nothing), not block by block.
- **D-12** It recomputes rows only at the end of a carry step, so a block that grows during SETTLE can close the gap under it; the engine runs FOLLOW where sizes change (PR-6).

## 15. Open questions and engineering points

### 15.1 For the owner

- **O-1** Decided as G6 (2026-11-02): the rows a head block moved up by hand leaves become its own.
- **O-2 (P18)** The default waits for the owner to try every variant on real notes: the first release offers them all as a device setting, today's look by default (P18, 2026-11-04); the next release sets the default.
- **O-3 (P12)** Moot: sync was released to production by #130 on 2026-10-27, so the engine comes after it.
- **O-4** Decided (M6, 2026-11-02): «по середине» is dropped; one way to swap.
- **O-5 (P4–P7)** The phone and the computer working together: stage 2 [W1].
- **O-6** Decided: entering and leaving as A1 (2026-11-02), the rest of the areas as A2, long content as A3 (2026-11-04, AREA.7–AREA.9). Folding, for every kind and one stored field, is the next release's (A3).
- **O-7 (L1)** Pinned blocks: later. The owner, 2026-11-04: blocks that never move come as static or fixed blocks in a later release, with the block properties (`docs/BLOCKS-PLAN.md`, to be written).
- **O-8** Decided as W7 (2026-11-02): a sheet width per note.
- **O-9** Decided as W8 (2026-11-02): the width handle presses its neighbours aside, with a retrace, like a carry.
- **O-10** Decided as W9 (2026-11-02): at rest the neighbours cap the width under every order.
- **O-11** Decided (V1, 2026-11-02): keyboard focus is the selected block's frame, solid.
- **O-13** Decided (W7, 2026-11-02): narrowing the sheet works as an area's side handle.
- **O-14** Decided (W7, 2026-11-02): no stretching past the edge of the screen.
- **O-15** Decided (W7, 2026-11-02): a note begun on a phone fits the phone until a computer first opens it and gives it that computer's width (VIEW.1c).
- **O-16** Decided (W7, 2026-11-02): the narrow view, and the user can zoom in from it to the real layout with the scrollbar and the hand (VIEW.1).
- **O-17** Decided (V2, 2026-11-02, after trying both in the mockup): while a new block is started in the reading mode, nothing shows but the caret (VIEW.6a).
- **O-12** Decided as W10 (2026-11-02): «narrow first» is dropped.
- **O-19** Decided as W13 (2026-11-04): the first release places blocks on a computer only; touch devices, phones and tablets, read, write, delete and create, and move nothing.
- **O-18** Decided as W12 (2026-11-04, after trying it in the mockup): a narrower window scales the note by the width it uses, up to its rightmost block, not by the whole `SHEETW` (VIEW.1).

### 15.2 For the engine's design

- **E-1** How the pairs, gaps, owners and lends are stored in a note and merged by sync; old notes, which have none stored, get them from their places once (RELINK with every pair new).
- **E-2** Settled: phase 9 is a fixed sequence with a bound (§5.1, `RESTSTEPS`), restarts are bounded in phases 3 and 11, and a bound exceeded is the failure of §5.5; `RESTPASSES` is set in LAYOUT-ENGINE-PLAN §4.2.
- **E-3** The measuring function: rows at a width, the natural width and the empty lines at the ends of a text, in the browser and as a stub in Node tests.
- **E-4** The passports of the kinds of block (text, code, area) as data the engine reads (`LAYOUT-MODEL.md` §3.3).
- **E-5** The steps of `LAYOUT-MODEL.md` §7 are re-planned for this model before the first PR.

## 16. Relation to `LAYOUT-MODEL.md`

This document replaces §3 of `LAYOUT-MODEL.md` (the model rule by rule) and states §4 «Stage 1» as rules (VIEW). The decisions table of its §2 stays the record of what the owner decided and when; every rule here points to it. Its §5 (data), §6 (the module) and §7 (steps) are replaced by [`LAYOUT-ENGINE-PLAN.md`](LAYOUT-ENGINE-PLAN.md), which settles E-1 to E-5 for version 0.1; its §8 (today's code) and §9–§11 stay.

## Review log

- **Round 0 → 1** (21 findings). Added: the sheet's width `SHEETW` (O-8); stored and derived state, temporary heights; INV-8; one solver SETTLE with fixed phases and named primitives, every action a change; RESIZE; unowned gap runs; the order of visits; the carried block's width; containment in one place; the let-through split into apply and choose, its reverse after a swap; away as memory with its hysteresis; «reaches» defined; GAP.5 corrected; INV-7 restated; the carry memory completed; H5 superseded for the bottom handle; O-8 to O-11.
- **Round 1 → 2** (11 findings). FOLLOW and RELINK as named steps at fixed points (PR-6); RELINK compares with `base`, the layout after phase 1 with an away block's column closed (D-11); phase 9 bounded and relinked, containment last; the let-through chosen after the result (phase 11), the ghost pinned against it, the swap geometry, restarts bounded; a table of changes with the moved block, the sides, the lack of room and the containment of each; P-SQUEEZE for an area's top and bottom handles, the stopped handle found by a search in space; P-ASIDE, P-UP and P-SEP made single-valued, P-REST for an elastic block at its minimum; «narrow first» at rest as O-12; the stored pairs and lends, neighbour order for FOLLOW; the hidden-lines count owned by SIZE; EDIT's memory; DRAG.A5 marked proposed.
- **Round 2 → 3** (10 findings). The neighbour letting the block through leaves the memory when the target passes its pinned row, and after a swap the memory holds the swapped neighbour; the blocks under a pinned neighbour follow it; a lower block left with no upper neighbour takes the row of the taken block's top plus its lend and the rows not its own (GAP.6); P-SINK for a block with no room aside under a handle; phase 1a recomputes only widths whose content changed; SETTLE returns `start`, the memory and `pressed`, and DRAG runs the hold timer on `pressed`; GAP.5 rule 1 by facing edges, rule 2 for any block gone from between a pair; both judgements in phase 2; a temporary height's result is never stored; P-SEP between uncarried blocks and P-REST marked proposed.
- **Round 3 → 4** (7 findings; none of the earlier fixes found wrong). The released let-through neighbour keeps its phase 2 judgements; the wall of an area's side handle defined, not a block; the width-handle row names its moved block; phase 11 for a carry only; an empty text is one cell wide and a placeholder is never measured; P-SINK's column under a wall and under the width handle; an area's growth handed to its container's SETTLE; EDIT.4 restores the layout before the click when nothing else changed; a pair new at rest gets no rows.
- **After the independent review of the plan** (2026-11-04: 1 blocker and 6 major findings on the plan, three of them on these rules). GAP.5: a block that comes between two blocks by itself counts as put into the gap (rule 3a, S8 settled in the mockup as «вставка»), rule 2 gives the gap back when it narrows back, the lend kept per pair (§1.3); found while trying it, rule 1 counts as moves only rows changed by the change or a primitive, never by FOLLOW or a height, so a gap that does not hold its block survives a text growing and shrinking beside it (lessons 17, 18). The canonical and the displayed layout (§2.1): gestures and SETTLE on what is shown, the canonical layout stored. Which phases each kind of change runs (§5.1a): a wall runs P-ASIDE and P-SINK although it moves no block. Phase 9 a fixed sequence with a bound, `RESTSTEPS`, and SETTLE's failure result (§5.5). SIZE names what a measurement depends on; INV-6 says a re-measure no user made writes with the next action.
- **After round 4.** The owner answered O-8 (W7, 2026-11-02): the sheet's width per note, the white room beyond it, stretching it by its right edge (AREA.8), zoom and scroll, the hand (VIEW.1b), the list of notes (VIEW.1a); O-13 to O-16 opened and answered the same day: narrowing the sheet as an area (AREA.8), no stretching past the screen, a note begun on a phone (VIEW.1c), zooming in from the narrow view (VIEW.1).
