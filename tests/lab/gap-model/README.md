# The gap model (lab)

An executable model of the gaps of the layout engine: the empty rows between blocks, kept as «stacks» (decisions G1–G7, S8 in `docs/LAYOUT-MODEL.md` §2; the specification `docs/LAYOUT-RULES.md` GAP is rewritten from this model). It is not the engine: one container, blocks as card columns and rows, no handles, no SETTLE, no pushes aside. Its job is to show, by running, that the representation keeps every gap whole.

```
node tests/lab/gap-model/test.mjs [number of random sequences, 2000 by default]
```

- `model.mjs`: the state (blocks; for every block and every column where it is an anchor, a stack: the anchor above or the top, the gap's rows with their owners, and the blocks standing in it with the rows they cover), FOLLOW, and the events RELINK sees column by column: a block comes into a column, leaves it, changes height, is carried by hand.
- `test.mjs`: the examples of the three rounds of the independent review (PR #124), G5–G7 and lesson 18 as named cases asserting rows and owners; random sequences of inserts, growth, widening, narrowing, carries and deletions compared with the same history without the inserted blocks (the oracle of C3 and S8); the same history from storage in another order; carries there and back; deletions that never move a block down.

It is not run by CI (only `tests/*.mjs` are); step 1 of `docs/LAYOUT-ENGINE-PLAN.md` turns its cases into `tests/layoutgap-*.mjs`.
