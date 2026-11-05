# The gap model (lab)

An executable model of the gaps of the layout engine: the empty rows between blocks, kept as «stacks» (decisions G1–G8, S8 in `docs/LAYOUT-MODEL.md` §2; the specification `docs/LAYOUT-RULES.md` §1.3 and GAP is written from this model). It is not the engine: one container, blocks as card columns and rows, no handles, no SETTLE, no pushes aside. Its job is to show, by running, that the representation keeps every gap whole.

```
node tests/lab/gap-model/test.mjs [number of random sequences, 2000 by default]
```

- `model.mjs`: the state and the events RELINK sees column by column.
  - **The state.** The blocks, each with its canonical height `h` and the rows `e` a temporary height adds while it lasts. For every block and every column where it is an anchor, a stack: the anchor above or the top, the gap's rows with their owners, and the blocks standing in it. Each standing block has its lend, the rows its body covers by its canonical height, at most `h`. A temporary height pushes what is under its block on the screen and writes nothing. A block put lower than the gap reaches has the room above it as its own rows.
  - **FOLLOW.** It runs in both measures: displayed, which every operation works on, and canonical, which is stored.
  - **The events.** A block comes into a column, leaves it, changes its real height, or gets or ends a temporary height. `fit` gives a block SETTLE put lower than its stacks hold it the rows it lacks, and never cuts a stack. `step` runs moves and width changes in one RELINK, an arrival placed at its reference: rule 1 replayed on a copy, then canonical FOLLOW. One block or several move in one step (`move`, `carry`), or a block is carried away to other columns (`carryTo`). A dropped block is placed at its displayed row; a block that comes into a column by itself (`width`), at its canonical row. A move is made on the displayed layout; canonically the block moves the same way, at most as far.
  - **Switches.** `gap8`, `gap9` and `gap51` are the switches `GAP.8`, `GAP.9` and `GAP.5.1`; `gap51` off changes only the owners of the rows a move carries (rule 1's lengths are core), and turns `gap8` off with it.
  - **Areas.** A block with `area: true` takes part by its extent, its frame with one free cell on every side; the model keeps extents inside and converts at its surface.
  - **Storage.** `save`/`load` keep the whole state; `stored` is what 0.2 stores, `places` what 0.1 stores.
- `test.mjs` has named cases and random sequences.
  - **Named cases**, asserting rows and owners:
    - the examples of the seven rounds of the independent review (PR #124), rounds 5 to 7 for the engine's contract: a move and an arrival in one RELINK (`step`), the arrival at its reference; `fit` after an entry at the canonical row and in reading order, rigid steps, an undo putting a block back by its canonical cell (`restore`, `carryTo` with `canonical`), an arrival after a growth, `GAP.5.1` off, areas by their extents;
    - G5–G8 and lesson 18;
    - both states of the switches.
  - **Random sequences.**
    - Inserts, growth, temporary heights, widening, narrowing and deletions, with base blocks changing height and width. The result is compared with the same history without the inserted blocks (the oracle of C3 and S8), twice:
      - guarded: base blocks change width only while they all stand as without the inserted blocks and never under one; then every row agrees in both measures, and stacks may differ only in the columns they touched (G4's order of arrival);
      - unguarded, as below.
      - It is exact unless a base block came into a column, or left it, while it or that column did not stand as without the inserted blocks. That block then took its place there from what the inserted blocks did, and INV-7 b is for the neighbours a block had when it came: that column's stacks may differ (the named cases «INV-7 b» show how), every other column's must agree.
      - Base blocks are not carried there: whether a gap holds a block depends on what the inserted blocks push.
      - The same history is replayed from storage in another order.
      - Carries of the inserted blocks are left out: by G5 and G6 a move by hand changes the gaps on purpose.
    - Carries and moves of several blocks there and back, some under temporary heights: the displayed rows come back exactly; the canonical ones never rise and stop changing after the first trip (INV-7 c).
    - Deletions that never move a block down, in either measure.
    - `GAP.5.1` off: a history without deletions gives the same rows in both measures with the switch on and off.
    - The two measures:
      - ending every temporary height gives the canonical rows;
      - reloading what 0.2 and 0.1 store gives the same canonical layout.

It is not run by CI (only `tests/*.mjs` are); step 1 of `docs/LAYOUT-ENGINE-PLAN.md` turns its cases into `tests/layoutgap-*.mjs`.
