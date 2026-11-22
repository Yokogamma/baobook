# The seams before step 3 (plan)

Status: **approved by the owner on 2026-11-21**, after three rounds of the independent review (PR #160); not built yet. Written on 2026-11-13 against `main` at `0d94f29` (step 2 of `LAYOUT-ENGINE-PLAN.md` merged: #137, #144, #148, #152, #156). The owner's decisions of 2026-11-21 are in §2; the one choice left open is Q7, what an undo after later edits means, made on the experiment's report (§7).

## 1. Why

Two architecture reviews and the independent reviewer's answer between them (2026-11-13) agree: the core (stacks, FOLLOW, RELINK on declared facts) stays for 0.1, and the review rounds come from the seams round it, where one meaning is restored from another representation:

- an area's frame, a derived number, handed to SETTLE from outside (`rows`, `t` in `Change`);
- an undo after later edits, a carry back through SETTLE (`inverse`, `canonical`, `back`, G21);
- 35 switchable rules, each a second state the reviewer may test;
- generators that draw single transitions, while a wrong memory shows only after a later deletion, narrowing or gesture.

Step 3 (`drag.js`, `ops.js`) builds every action and its undo on `settleTree`, so these are fixed first. Not in this stage: GAP, the phases of SETTLE, the owners of rows (G5 needs them: the reviewer's example of two histories with the same rows and another outcome of a deletion), rows given by GAP alone, a second twin model.

**Dropped after reading the code: «record the cause of a column change at its source».** GAP gives `narrow` and `press` one branch (`gap.js:245`, the model's `model.mjs:203`, `laws.mjs:46`, `:89`); only `checkTransition` asks that the carried block leaves as `narrow` (`transition.js:109`). What `columnsOf` guesses by the width changes no memory; which columns a block left is the geometry by definition, guarded by RC3; `put`, `self` and `back` follow from the change kind; the groups of `transitionFacts` (G16) already read the recorded `by`. The reviewer confirmed it. Kept: RC3, the recorded steps, and one new law (§4.3, L12).

## 2. The owner's questions

| # | Question | Answer |
|---|---|---|
| Q1 | The order of the PRs (§3) | **decided by the owner, 2026-11-21: as §3** (the reviewer had no objection) |
| Q2 | The switches made core, their branches removed (§5) | **decided by the owner, 2026-11-21: the list of §5** |
| Q3 | `P-UP`: core (а), or kept switchable on `.dev` (б) | **decided by the owner, 2026-11-21: (а)**, `P-UP` is core and its fallback goes. Whether a carry from other columns should push up too (G17, G18) stays left to practice |
| Q4 | A carry folds the temporary heights at its start: (а) yes, G9, G10, G13, G14 lose their subject, at the cost of a jump when a carry starts; (б) no, as built | **decided by the owner, 2026-11-21: (б)**, a carry runs on what is shown, as built |
| Q5 | The narrow slice on `.dev` before the rest of steps 3–5 (§8) | **decided by the owner, 2026-11-21: yes**, with the action journal |
| Q6 | The process rules (§9) | **decided by the owner, 2026-11-21: as §9** |
| Q7 | What an undo after later edits means (§7): (A) the carry back, as built; (B) the layout before the action, reconciled with the content as it is now; (C) «the action never happened», with a journal of the edits between | **decided by the owner, 2026-11-21: the experiment is run**; the choice between (A) and (B) is the owner's, on its report; (C) not recommended (proposed) |

## 3. The PRs

Each is one PR into `main`, reviewed, merged on the owner's word; one that changes `public/` raises `BUILD` and runs `node tests/hashes.mjs --write`.

| PR | What | Depends on |
|---|---|---|
| S0 | This plan | |
| S1 | The branches of the switches made core removed (§5), under the old-engine comparison (§4.4), whose harness and pinned copy come with this PR | |
| S2 | `validate`, the sequence generator, the probes, the laws, the quotas (§4) | |
| S3 | The frame inside the solve, the one clamp, the input contract of the composite changes (§6), under §4.4 | S2 |
| S4 | The undo experiment in `tests/lab` and its report to the owner (§7); nothing in `public/` | S2; beside S3 |
| S5 | The narrow slice (§8), in its own PRs | S3; Q7's choice before its undo grows past the exact path |

Switches first, since the generator then has fewer states to cover; the frame before the slice, since the slice has areas. `inverse` is removed, if at all, only after Q7.

## 4. One check of a note, and sequences with consequences (S2)

### 4.1 `validate(tree, ctx)` in `public/layout/validate.js`

Structural invariants of one tree, in place of the four `sound()` of the tests (`layoutgestures.mjs`, `layoutopen.mjs`, `layoutsettle.mjs`, `layouttree.mjs`). It returns the errors and repairs nothing.

- every block in exactly one container; every area on the sheet has its container in `areas` and no container is without its area; no area in an area; a child container's `areas` empty; a child container's `cols` equal its area's inner width (`area.w − 1`), which neither `gap.check` nor the frame's height shows (an area of 12 inner columns over children laid out in 20 passes both), with a negative case kept when the four `sound()` go;
- in every container INV-1 to INV-4 and `gap.check`, in the measure the layout is in, and its canonical projection too;
- every area's `h` and `t` equal `frameOf` (§6.1), its own temporary rows (`tx`) counted; every block's `t` at least its `tx`;
- bounds: `MAXCELL`, the container's edges, an area with its free cells.

INV-5 (determinism) is a law of several runs, not of `validate`. `validate` is no oracle of memory: two valid trees can differ in what a later deletion gives.

### 4.2 The generator (`tests/lib/layout/seq.mjs`) and the probes

Sequences of the commands a user has, from a valid tree: every `Change` type of `shapes.js` on the sheet and in an area where it is lawful, whole gestures (moves, a hold, a swap, home, a drop), temporary heights starting and ending between actions, a signature changing (typing, a fold, a chip relabelled), an undo, an outside update that drops the history. The measuring stub answers by signature, so the inputs of one gesture are one state.

After every accepted transition, on a copy:

- **probes**: delete each block; narrow each block wider than its floor; end every temporary height. A deletion and the end of a temporary height must succeed where the contract promises it; a refusal is accepted only with its reason (a narrowing below the floor, `MAXCELL`), so that «always refused» fails. The result passes `validate`;
- **two-step probes**, sampled: narrow then delete; end a temporary height then delete; undo then delete a neighbour;
- where two paths are compared (§4.4, §7), the outcomes of the probes are compared too, not the rows alone.

### 4.3 Laws and their references

| | Law | Reference |
|---|---|---|
| L1 | Memory: the engine's RELINK and the lab model agree on every declared transition, and after each probe | `tests/lab/gap-model` |
| L2 | Rows of SETTLE in the reference's domain; the domain widened (sideways, creation, size), its borders stated, and a least count of comparisons really made in each part of it (§4.5): a transition the reference answers «outside my domain» checks nothing | `tests/lab/settle-ref.mjs` |
| L3 | The frame: `frameOf` against a formula written apart, with named cases (collapsed, `ch` larger, the header wrapping, own temporary rows with and without children's, the handle of an area that shows an own temporary row, §6.3) | `tests/lab` |
| L4 | Determinism: the storage order permuted; the same input run twice, the gesture memory and the measure included | itself |
| L5 | `unshow(show(C)) = C` with the same signatures, widths and rules and no action between | itself |
| L6 | A refusal changes nothing: the input tree, the gesture memory, the written fields, the undo history. A success leaves its input unchanged too (snapshots and stacks are shared with undo entries) | a frozen copy |
| L7 | Independence: a change moves nothing outside what it can reach (columns shared through a chain, a wide block, the common parent) | itself |
| L8 | A gesture: a still pointer gives the same result; home gives the start (INV-7 a); the last preview equals the commit (INV-8); a hold and a swap as sequences | `layoutgestures.mjs` |
| L9 | A temporary height that starts and ends with no move in its reach, and a text grown and shrunk back with no RELINK between: the tree and its stacks as before | itself |
| L10 | INV-7 b in its own words only (a creation that only pushes down, then taken away) | the model |
| L11 | The exact undo: equality of the tree and stacks with equal inputs; the contract of §7 otherwise | the snapshot |
| L12 | `narrow` ↔ `press` exchanged for the blocks that are not carried, in a lawful declaration: the same result and memory | itself |
| L13 | Translation: the same change far from the edges gives the translated result | itself |
| L14 | Opening what the engine wrote: places and sizes compared, not stacks (0.1 stores neither owners nor lends). «One opening changes nothing» is stronger than today's test of convergence; what it finds is judged case by case, not taken for a regression | `diff` |
| L15 | INV-6, nothing written without a user action: opening, a temporary height starting or ending, a window, a scale, a look change no stored field (L6 is another thing: the inputs unchanged and atomicity) | a snapshot of the stored fields, and in S5 the writes seen through the bridge |

«A block created and removed» and «an action and its opposite» are not universal laws: decided rules limit them (G18, G5).

### 4.4 The old engine as the reference of a refactor

For S1 and S3 (changes meant to keep the behaviour): the engine at `0d94f29`, copied once into `tests/lab/engine-0d94f29/` (every module of `public/layout/`, passports and rules included, with no import from the `public/layout` that changes) and removed when the stage ends, and the new one get the same sequence of commands and the same measuring answers under `DEFAULT`. Compared: accepted or refused, the tree, the gesture memory and `start`, the written fields (`diff`), and the stacks by value after normalising their representation (no object identity, no `Map` order). A difference is allowed only when explained: a confirmed defect, shown by an expected result written independently, or an approved change of contract; a named case records the decision and does not by itself justify it. Stricter answers to a caller's error (§6.3) are outside the common domain and tested apart. The comparison runs in CI.

### 4.5 Quotas

Two counters with their own denominators (the numbers are a start); the test fails below a quota.

- **Accepted transitions with substance**, shares of 10 000 of them: every `Change` type at least 3 %, on the sheet and in an area; with a temporary height at least 15 %; a hold or a real swap at least 5 %; followed by an undo at least 20 %, a quarter of them after a signature changed; an outside update at least 2 %; a real change of width at least 1 %. A carry accepted with nothing moved fills no quota.
- **Negative attempts**, shares of the attempts made, each checked as a refusal or a failure with its reason: a refused handle; an area into an area; a wall given directly; an area's width by `size`; `enter` and `leave` against their direction (§6.3); each at least 1 % of the attempts, and the attempts at least 5 % of all commands.
- **Comparisons really made** by a reference that has a domain (L2): at least 300 in each part of the domain per 10 000 accepted transitions.

Templates: change → temporary height → another gesture → undo; delete → a linked note renamed → undo; an area's handle → typing in a child → undo; collapse an area → carry over it → open it; enter → leave → undo twice; a signature that changes and returns (§7's case).

### 4.6 Cost

`validate` in full and the probes run in tests and, in the dev look, at the end of an action; never on a pointer move. The budgets of `LAYOUT-ENGINE-PLAN.md` §4.5 are measured again before step 3 (one pointer move under 8 ms), on the generator's note of 120 blocks.

## 5. The switches (S1; the owner's Q2 and Q3, decided)

A switch made core leaves `DECLS`, §1.6 of `LAYOUT-RULES.md`, the «two forms» of its tests and its branch in the engine and in the lab model. Hiding a switch and keeping its branch is no simplification.

| Made core, the branch removed | What goes |
|---|---|
| `GAP.5.1`, `GAP.8` | the branches of `gap.js` `moveIn` and the model's |
| `GAP.5.2`, `GAP.9` | the branches of `leave`, `release` (G8 core) |
| `GAP.5.3` | the branch of `enter` (S8 core; «r10.2» loses its cause) |
| `DRAG.B2.keep`, `P-UP` (the owner's Q3) | `Transition.fallback`, the passes outside a swap, the branch `under` of phases 5–6, `FALLBACKS` of `transition.js` |
| `DRAG.A3.narrow` | the branch of `atTarget` and of `layout.js` `clamped` |
| `DRAG.B5`, `DRAG.B3` | the refusal branch of phase 4, the branch of `changes.js` |

Their fallbacks never written (steps 3–5): `AREA.6`, `DRAG.B1`, `RESIZE.2`, `RESIZE.3`, `AREA.3`, `AREA.7`. Kept switchable on `.dev`: `THROUGH`, `P-ASIDE`, `P-REST`, `P-SINK`, `SIZE.1`, `SIZE.2`, `SIZE.8`, `DRAG.A5`, and those of the view and the input (`VIEW.*`, `EDIT.*`, `DRAG.A2`, `DRAG.A4`, `DRAG.C4`, `RESIZE.1`, `AREA.7b`). A mode with a rule off is experimental; damage to data, a broken atomicity and a wrong layout written block always.

**Built (S1).** `DECLS` has 19 switches; `gap.js` reads no rule and its functions take none (`relink(T)`, `remove(layout, id)`, `push(before, after, skip, base)`); `Transition.fallback` is gone, and a pass is a swap's only; `down` sinks against the moved block alone. `DRAG.A3.narrow` had needed `SIZE.1`, so its narrowing is now in effect wherever `SIZE.1` is on, and with `SIZE.1` off a block stops as before. The lab model has no options. The tests of a removed fallback went with it; a case found under a removed switch stays where it also holds under the default rules, and goes otherwise (two of the model's five fixed cases, the targeted run of the fallback carries). `tests/layoutsame.mjs` (§4.4) gives the engine and its copy at `0d94f29` the same notes and commands: the same answers by value, the written fields included, a field written as removed told from one not written; under `SIZE.1` off too. The last commit with every switch is `2b1adaf`.

## 6. The frame inside the solve (S3)

### 6.1 One function, read from the layout SETTLE is given

`Layout` carries `areas` (`shapes.js:26`); the sheet's layout keeps them through every phase (`tree.js` `put`, `gap.js` `layoutOf`, `settle.js` `put`). So an area's frame is a function of what `settle` already holds, with no number from outside and no closure in `ctx`:

`frameOf(area, children, ctx)` in `public/layout/frame.js` → `{h, t}`: the frame rows by the area's passport (its header at its width, `ch`, `collapsed`) round the rows its children take; `t`, the growth its children's temporary rows make plus the area's **own temporary rows**. `bottomOf` (three copies today: `tree.js`, `settle.js`, `layout.js`) and `frameRows` (two) live there.

**Own temporary rows** (the reviewer's finding: `show(…, new Map([['R', 1]]))` gives `h` 3, `t` 1 for a frame of 2, `layout.js:182–195`; a formula over the header and children alone would refuse it, or drop the row). `t` aggregates two sources and cannot give them back once the children change. So a displayed layout keeps the rows `show` was given for a block in a field of their own, `tx`: never stored, set by `show` from `temp`, removed by `unshow`, and `t` is always «what the measure or the children give» plus `tx`. Text blocks need it as areas do: the reviewer ran it on the base (a text shown with `h` 2, `t` 1 comes out of a change of width with `h` 1, `t` 0, and loses the row on entering an area too). That loss is a defect of the base, so §4.4 expects this difference, shown by cases written independently.

`tx` goes with the block through every path that measures it again or makes its box again:

| Path | Where | What holds |
|---|---|---|
| a size change, a width change, the moved block at its target | `settle.js` `measured()`, phases 1a and 1c | `t` = the measure's (or the frame's) temporary rows + `tx` |
| pressed aside, rested, narrowed by a primitive | `primitives.js` `reshape` (`:127`), phase 9 (a) | the same: one function gives a box its height, in `frame.js` for an area and beside `rowsAt` for the others, and no path computes `h`, `t` by itself |
| `enter`, `leave`, `ungroup` | `tree.js` `move`, `ungroup`, which make a new box from listed fields (`:101`) | the box of the same block keeps its `tx` |
| a block made new | `create`, `drawArea` | `tx` 0; the bridge gives a new block's own temporary rows with the next `show` (P18's row) |
| a canonical pass | `inverse` while it exists, §7's pass | folded with every temporary row, `tx` kept aside, and shown again after the pass by the same rule |

Each row is a named case in S3, and the generator gives `tx` to texts and areas before changes of every kind.

Readers:

- `settle.js` `measured()` for an area calls `frameOf(box, L.areas.get(box.id), ctx)`; an area with no container in `L.areas` is `failed`, never its old `h`;
- `rows` and `t` leave `SizeChange`, `CreateChange`, `WidthChange` (read at `settle.js:307`, `:330`); `room` stays: it is a condition of a composite change, not a derived number, and it counts no own temporary row (§6.3);
- `open()`: the sheet's `openOne` gets the children it has already opened, in place of `inner` (`layout.js:163–172`), and `sized`, `clamped` call `frameOf`;
- a canonical run reads canonical children: while `inverse` exists, it projects `areas` too (`settle.js:120–124` folds `start.boxes` only), and `frameOf` under a canonical `ctx` counts no temporary row.

### 6.2 One driver: children → frame → parent → validate

`tree.js` settles the changed content of an area, puts it into the tree, and then settles the sheet with that tree: a change of the area itself takes its frame in the same SETTLE (phase 1a or 1c, through `measured`), and otherwise, when `frameOf` differs from the area's `h` or `t`, a plain `{type: 'size', id}` with no numbers. `grow` and the four places that put `rows`, `t` into a change go. A gesture's `start` and the states of a hold carry the `areas` of the gesture's start, as the count from the start has it (AREA.6): a gesture on the sheet changes no child, and `areaSide` makes both parts again from the start at every move. Trees are immutable and a result is returned whole or not at all.

### 6.3 One clamp, and the input contract

- `sideRect` stays the only clamp of an area's handle. For an area's width change, phase 1c (`settle.js:326`) checks that the rectangle lies in the container, the area with its free cells, and fails otherwise; the clamp of every other width change stays.
- **The handle's budget.** An area's own handle never makes it taller (§5.4). Today `roomOf` takes the whole shown height and takes off the header, so an own temporary row becomes room for the children: the reviewer ran an area of canonical height 3 showing 4, narrowed so that a child grows a row, accepted with `h` 4, `t` 0; with `tx` kept and that budget it would show 5. So `room` keeps `roomOf`'s two branches, its header measured at the new width, counted from the shown height at the gesture's start: an open area, that height less its `tx` and its header; a collapsed area, whose frame is its header alone and whose hidden children stay, no limit when its header and `tx` fit in that height, a refusal otherwise (a budget of 0 there would refuse the handle of every collapsed area that has a child). In both, the handle is refused when the shown height after the change is more than at the gesture's start. Named cases, in L3 and in the handle's tests: an open area with an own temporary row whose child grows, and the handle of a collapsed area with children, with and without `tx`.
- `enter` needs `box == null` and `to` an existing area; `leave` needs `box` an existing area and `to == null`; the source block must exist; anything else is `failed` (today `move` takes `from === to`). The branch `isArea(b)` of `move` goes once this holds.
- Containers change only by `withArea` and `withoutArea`; deleting an area deletes its children and ungrouping moves them, as the operation says; `validate` checks and repairs nothing.

## 7. Undo after later edits: an experiment, then the owner's choice (S4, Q7)

The exact path of `LAYOUT-ENGINE-PLAN.md` §6.4 (nothing applied since: the snapshot put back) stays. The question is the other path.

**(B), the candidate.** The undo restores the layout before the action and reconciles it with the content as it is now, in a fixed order; the history of re-measures between is not replayed. It is *not* «as if the action had never happened»: the reviewer's case (B stands in a gap with a lend of 3; an unrelated block is carried; B's text shrinks to one row and returns to three, a RELINK between cutting its lend to 1 by G7) gives C at row 6 after B is deleted when the carry never happened, and at row 8 by (B), where B's signature is equal and nothing runs. Both trees are valid; only the probe tells them apart.

1. The candidate: the entry's `before` (places, stacks, the blocks only the entry holds) with today's content, canonical.
2. The queues are made beforehand from the restored `before`: the areas in reading order, in each its blocks in reading order, then the sheet's; so that settling one block never reorders the rest. Each block whose signature differs from the recorded one gets an ordinary `{type: 'size'}` through `settleTree`, the path typing takes, one RELINK each.
3. The whole pass runs with the canonical measure, children included; the temporary heights are shown after it (G23's demand stays).
4. `validate`; preparing, the freshness check and applying are one step; on a refusal the entry stays and nothing changes.

The other conditions of §6.4 stay: today's content is never replaced by the snapshot's; an outside change of the note drops the engine's entries (`undoStale`); a change of the rules drops them. Composite actions (enter, leave, ungroup, an area's handle) are undone by the snapshot of the whole tree, never by an inverse path.

**The experiment** (`tests/lab/undo-snapshot/`): on the generator's histories, three paths. (A) `inverse` as built, compared only where it is an undo today: the changes §6.4 of the engine plan lists one by one; it is no undo of a whole composite action, and those histories are reported as (B) and (B′) alone. (B), as above. (B′), stated in full before it runs: the same candidate and the same queues; in each area in reading order, every block whose signature differs is measured again at its restored width and its height applied by `resize`, all of them before anything follows; then one FOLLOW and one `rest()` of that container; then the area's frame by `frameOf`; the sheet last, the same way; canonical throughout. Reported to the owner:

- shares: the same / other rows / the same rows and other probes (deleting, narrowing, ending temporary heights, after the undo);
- how far step 2 depends on the order of its queue;
- for each path, apart: `refused`, `failed`, and a result returned as a success that `validate` rejects;
- the 5–10 smallest differing cases as pictures, G21's apart;
- the code that would go: `inverse`, `canonical` in `Change` and `Transition`, `back`, G21's branch of `transitionFacts`.

Required cases: a signature that returns to its old value; several undos in a row; changes of blocks only the entry holds (a chip to a renamed note); composite actions followed by a change of content; the probes after the restore.

(C), the counterfactual, needs a journal of the edits between and their RELINK borders, and the heights measured then may not be enough (without the action a block might have had another width). Not recommended.

## 8. The narrow slice on `.dev` (S5, Q5)

Behind the switch, off by default: open a real note; carry and drop on the sheet and in an area; enter and leave; typing; create and delete; the exact undo only, every other case dropping the engine's history until Q7. Handles, drawing an area, ungrouping and the hold are off. One note is never served by both layouts. The stored format does not change; A refused or failed layout writes none of its places and sizes; content is another matter. What the user typed is saved by the ordinary path whatever SETTLE answers, and after a failure the note's geometry goes to the safe mode, as `LAYOUT-ENGINE-PLAN.md` §4.2 has it. The bridge's tests give typing a refusal and a failure: the text is saved, no place of the failed result is written.

Its modules (`measure.js`, `bridge.js`, `drag.js`, `ops.js`) are the first versions of those of steps 3–5, with their Node tests, not code to throw away.

**The action journal**, a ring buffer that can be exported, with no note text: the input tree, the gesture's `start` and memory, the change, the rules and settings, the versions of the engine and the passports, each block's own temporary rows, the whole answers of `Measure` that were asked (`rows`, `shown`, `lines`, `natural`, keyed by block, width and measuring version), and the result or the refusal. Replayed in Node, an entry is a permanent case and a proof that a state is reachable. A replay that asks for a measurement the journal has not says so; it neither invents an answer nor calls the difference a defect.

**One state of inputs for a gesture** (the seam that remains once the frame is explicit): the bridge's tests show that the measurements of a gesture are stable, that an outside change cancels the gesture, and that a stale result is not written.

## 9. Process (the owner's Q6, decided)

- A finding: first a minimal permanent case; then its class in the generator with a saved seed; the old code fails and the new passes; the case stays. Nobody waits for a random generator to find it again.
- Reachable means a sequence of allowed commands from a valid state: import, the content of areas, fonts, renamed links and sync included. `failed` does not close a finding an allowed action leads to.
- A finding under a switched-off rule does not block in the experimental mode, except damage to data, a broken atomicity or a wrong layout written.
- Two rounds with findings of one class start an architecture review, not a rewrite by default.
- No reachable error under the default rules is necessary for a PR, not sufficient: the supported configurations and the common invariants remain.

## 10. What step 3 may assume after this stage

- `settleTree` takes no frame rows from outside (`rows`, `t`): a change of an area or its children gives a tree whose frames `validate` accepts. `room` stays an input.
- `validate` is the one check of a tree; the generator's sequences, probes and quotas are the bar a new action is drawn into before review.
- The switches of §5 that are core have no fallback to write or test.
- The undo's second path follows the contract the owner chose in Q7. S4 changes nothing in `public/`: the chosen path is built in step 3 (and `inverse` removed then, if (B) is chosen), not by this stage. Composite actions are undone by the snapshot.
- Not covered by Node tests and shown only by the slice: real measuring (fonts, devices), speed on real notes. For 0.2, before stacks are stored (G12): how stacks are read and repaired, `fromPlaces` being the fallback.

## Review log

- 2026-11-13, before the plan: the architecture decisions sent to the independent reviewer (read at `0d94f29`). Accepted: the one clamp, the input contract, dropping «the cause at its source». One major: (B) is not the counterfactual, shown by a case on the engine; §7 states the narrower meaning, fixes the queue and the canonical pass, and lists the required cases. One medium: an area's own temporary rows; §6.1 gives them their own field, and names `open` and `inverse` as places the function must be wired into. Conditions taken into §4 (justified refusals, two-step probes, input unchanged after a success, INV-5 as a law, the opening law compared by places, quotas by substance), §4.4 (a pinned commit, the same inputs, stacks by value, explained differences only) and §8 (the journal's fields, a missing measurement, one state of inputs).
- 2026-11-21, the independent review of the plan (PR #160 at `c2404df`): 1 high, 3 medium, 1 low; the owner's decisions of §2 untouched, the earlier finding on the undo's meaning closed. High: §8 said nothing is written on `failed`, which would lose typed text; the content is saved by the ordinary path and only the failed places are not written. Medium: `tx` through every path that measures or remakes a box, text blocks included (the loss confirmed on the base; §6.1's table); an own temporary row is no room for the children under the area's handle (§6.3); `validate` keeps the check of a child container's width (§4.1). Low: accepted transitions and negative attempts counted apart, with a least count of the reference's real comparisons (§4.5). Also taken in: the whole engine copied for §4.4 and compared in CI; INV-6 as a law (L15); (B′) stated in full, (A)'s domain, and the three kinds of bad outcome told apart (§7); §10 narrowed.
- 2026-11-21, the second round on the plan (`71b04de`): the five findings closed; one new medium, the budget of §6.3 had no branch for a collapsed area, whose handle a budget of 0 would refuse (run on the base); the two branches of `roomOf` are kept. No finding left that blocks the plan; Q7's choice stays the owner's, after the experiment.
- 2026-11-21, the third round (`3bd0ebe`): the independent reviewer confirmed §6.3 and every finding closed; no new finding; the plan is ready to be built once the owner approves it.
- 2026-11-21: the owner approved the plan.
- 2026-11-22: S1 built (the switches made core, the pinned copy and the comparison), for review.
- 2026-11-22, the independent review of S1 (`99c2520`): no regression of the engine found; 2 medium, 1 low, all in the comparison and the descriptions. The written fields were not compared (`diff` given a tree for a `Map` threw on both sides, and the errors compared equal): the comparison builds the stored fields as the bridge keeps them, and a patch that cannot be computed fails the run. A field written as removed read as a field not written: patches are compared with a marker for it. Each has a negative control in `tests/layoutsame.mjs`. The descriptions of the model's README, `shapes.js` and the model's tests brought to the contract. Taken from its notes on the generator: code blocks, a deleted block made again by an undo, own temporary rows through `show`, targets past the right edge with a named case, headers that wrap, a run under `SIZE.1` off. Found while answering: all five fixed cases of the model had been removed where two were meant; three are back.
