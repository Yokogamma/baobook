# The seams before step 3 (plan, proposed)

Status: **proposed**, not approved. Written on 2026-11-13 against `main` at `0d94f29` (step 2 of `LAYOUT-ENGINE-PLAN.md` merged: #137, #144, #148, #152, #156). Everything here is a proposal unless a line names the owner's decision. The owner's open questions are in §2.

## 1. Why

Two architecture reviews and the independent reviewer's answer between them (2026-11-13) agree: the core (stacks, FOLLOW, RELINK on declared facts) stays for 0.1, and the review rounds come from the seams round it, where one meaning is restored from another representation:

- an area's frame, a derived number, handed to SETTLE from outside (`rows`, `t` in `Change`);
- an undo after later edits, a carry back through SETTLE (`inverse`, `canonical`, `back`, G21);
- 35 switchable rules, each a second state the reviewer may test;
- generators that draw single transitions, while a wrong memory shows only after a later deletion, narrowing or gesture.

Step 3 (`drag.js`, `ops.js`) builds every action and its undo on `settleTree`, so these are fixed first. Not in this stage: GAP, the phases of SETTLE, the owners of rows (G5 needs them: the reviewer's example of two histories with the same rows and another outcome of a deletion), rows given by GAP alone, a second twin model.

**Dropped after reading the code: «record the cause of a column change at its source».** GAP gives `narrow` and `press` one branch (`gap.js:245`, the model's `model.mjs:203`, `laws.mjs:46`, `:89`); only `checkTransition` asks that the carried block leaves as `narrow` (`transition.js:109`). What `columnsOf` guesses by the width changes no memory; which columns a block left is the geometry by definition, guarded by RC3; `put`, `self` and `back` follow from the change kind; the groups of `transitionFacts` (G16) already read the recorded `by`. The reviewer confirmed it. Kept: RC3, the recorded steps, and one new law (§4.3, L12).

## 2. The owner's questions (open)

| # | Question | Proposed |
|---|---|---|
| Q1 | The order of the PRs (§3) | as §3; the reviewer has no objection |
| Q2 | The switches made core, their branches removed (§5) | the list of §5 |
| Q3 | `P-UP`: core (а), or kept switchable on `.dev` (б), G18 being «revisited in practice» | (а) |
| Q4 | A carry folds the temporary heights at its start: (а) yes, G9, G10, G13, G14 lose their subject, at the cost of a jump when a carry starts; (б) no, as built | (б) for 0.1, asked again on the slice |
| Q5 | The narrow slice on `.dev` before the rest of steps 3–5 (§8) | yes |
| Q6 | The process rules (§9) | as §9 |
| Q7 | What an undo after later edits means (§7): (A) the carry back, as built; (B) the layout before the action, reconciled with the content as it is now; (C) «the action never happened», with a journal of the edits between | decided on the experiment's report; (C) not recommended |

## 3. The PRs

Each is one PR into `main`, reviewed, merged on the owner's word; one that changes `public/` raises `BUILD` and runs `node tests/hashes.mjs --write`.

| PR | What | Depends on |
|---|---|---|
| S0 | This plan | |
| S1 | The branches of the switches made core removed (§5), under the old-engine comparison (§4.4), whose harness and pinned copy come with this PR | Q2, Q3 |
| S2 | `validate`, the sequence generator, the probes, the laws, the quotas (§4) | |
| S3 | The frame inside the solve, the one clamp, the input contract of the composite changes (§6), under §4.4 | S2 |
| S4 | The undo experiment in `tests/lab` and its report to the owner (§7); nothing in `public/` | S2; beside S3 |
| S5 | The narrow slice (§8), in its own PRs | Q5; S3; Q7 before its undo grows past the exact path |

Switches first, since the generator then has fewer states to cover; the frame before the slice, since the slice has areas. `inverse` is removed, if at all, only after Q7.

## 4. One check of a note, and sequences with consequences (S2)

### 4.1 `validate(tree, ctx)` in `public/layout/validate.js`

Structural invariants of one tree, in place of the four `sound()` of the tests (`layoutgestures.mjs`, `layoutopen.mjs`, `layoutsettle.mjs`, `layouttree.mjs`). It returns the errors and repairs nothing.

- every block in exactly one container; every area on the sheet has its container in `areas` and no container is without its area; no area in an area; a child container's `areas` empty;
- in every container INV-1 to INV-4 and `gap.check`, in the measure the layout is in, and its canonical projection too;
- every area's `h` and `t` equal `frameOf` (§6.1), its own temporary rows counted;
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
| L2 | Rows of SETTLE in the reference's domain; the domain widened (sideways, creation, size) | `tests/lab/settle-ref.mjs` |
| L3 | The frame: `frameOf` against a formula written apart, with named cases (collapsed, `ch` larger, the header wrapping, own temporary rows with and without children's) | `tests/lab` |
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

«A block created and removed» and «an action and its opposite» are not universal laws: decided rules limit them (G18, G5).

### 4.4 The old engine as the reference of a refactor

For S1 and S3 (changes meant to keep the behaviour): the engine at `0d94f29`, copied once into `tests/lab/engine-0d94f29/` and removed when the stage ends, and the new one get the same sequence of commands and the same measuring answers under `DEFAULT`. Compared: accepted or refused, the tree, the gesture memory and `start`, the written fields (`diff`), and the stacks by value after normalising their representation (no object identity, no `Map` order). A difference is allowed only when explained: a confirmed defect, shown by an expected result written independently, or an approved change of contract; a named case records the decision and does not by itself justify it. Stricter answers to a caller's error (§6.3) are outside the common domain and tested apart.

### 4.5 Quotas

Counted on accepted transitions with substance, per 10 000 (the numbers are a start): every `Change` type at least 3 %, on the sheet and in an area; with a temporary height at least 15 %; a hold or a real swap at least 5 %; followed by an undo at least 20 %, a quarter of them after a signature changed; an outside update at least 2 %; a real change of width, a refused handle, each at least 1 %; each unlawful combination (an area into an area, a wall given directly, an area's width by `size`) at least 1 %, checked as a refusal. A carry accepted with nothing moved fills no quota. The test fails below a quota.

Templates: change → temporary height → another gesture → undo; delete → a linked note renamed → undo; an area's handle → typing in a child → undo; collapse an area → carry over it → open it; enter → leave → undo twice; a signature that changes and returns (§7's case).

### 4.6 Cost

`validate` in full and the probes run in tests and, in the dev look, at the end of an action; never on a pointer move. The budgets of `LAYOUT-ENGINE-PLAN.md` §4.5 are measured again before step 3 (one pointer move under 8 ms), on the generator's note of 120 blocks.

## 5. The switches (S1; the owner's Q2, Q3)

A switch made core leaves `DECLS`, §1.6 of `LAYOUT-RULES.md`, the «two forms» of its tests and its branch in the engine and in the lab model. Hiding a switch and keeping its branch is no simplification.

| Made core, the branch removed | What goes |
|---|---|
| `GAP.5.1`, `GAP.8` | the branches of `gap.js` `moveIn` and the model's |
| `GAP.5.2`, `GAP.9` | the branches of `leave`, `release` (G8 core) |
| `GAP.5.3` | the branch of `enter` (S8 core; «r10.2» loses its cause) |
| `DRAG.B2.keep`, `P-UP` (Q3) | `Transition.fallback`, the passes outside a swap, the branch `under` of phases 5–6, `FALLBACKS` of `transition.js` |
| `DRAG.A3.narrow` | the branch of `atTarget` and of `layout.js` `clamped` |
| `DRAG.B5`, `DRAG.B3` | the refusal branch of phase 4, the branch of `changes.js` |

Their fallbacks never written (steps 3–5): `AREA.6`, `DRAG.B1`, `RESIZE.2`, `RESIZE.3`, `AREA.3`, `AREA.7`. Kept switchable on `.dev`: `THROUGH`, `P-ASIDE`, `P-REST`, `P-SINK`, `SIZE.1`, `SIZE.2`, `SIZE.8`, `DRAG.A5`, and those of the view and the input (`VIEW.*`, `EDIT.*`, `DRAG.A2`, `DRAG.A4`, `DRAG.C4`, `RESIZE.1`, `AREA.7b`). A mode with a rule off is experimental; damage to data, a broken atomicity and a wrong layout written block always.

## 6. The frame inside the solve (S3)

### 6.1 One function, read from the layout SETTLE is given

`Layout` carries `areas` (`shapes.js:26`); the sheet's layout keeps them through every phase (`tree.js` `put`, `gap.js` `layoutOf`, `settle.js` `put`). So an area's frame is a function of what `settle` already holds, with no number from outside and no closure in `ctx`:

`frameOf(area, children, ctx)` in `public/layout/frame.js` → `{h, t}`: the frame rows by the area's passport (its header at its width, `ch`, `collapsed`) round the rows its children take; `t`, the growth its children's temporary rows make plus the area's **own temporary rows**. `bottomOf` (three copies today: `tree.js`, `settle.js`, `layout.js`) and `frameRows` (two) live there.

**Own temporary rows** (the reviewer's finding: `show(…, new Map([['R', 1]]))` gives `h` 3, `t` 1 for a frame of 2, `layout.js:182–195`; a formula over the header and children alone would refuse it, or drop the row). `t` aggregates two sources and cannot give them back once the children change. So a displayed layout keeps the rows `show` was given for a block in a field of their own (`tx`, never stored, set by `show`, removed by `unshow`), and `t` is always «what the measure or the children give» plus `tx`. To be checked in S3 with a case: a text block measured anew in a gesture (`settle.js` `measured`) keeps its `tx` (P18's row), which by reading it loses today.

Readers:

- `settle.js` `measured()` for an area calls `frameOf(box, L.areas.get(box.id), ctx)`; an area with no container in `L.areas` is `failed`, never its old `h`;
- `rows` and `t` leave `SizeChange`, `CreateChange`, `WidthChange` (read at `settle.js:307`, `:330`); `room` stays: it is a condition of a composite change, not a derived number;
- `open()`: the sheet's `openOne` gets the children it has already opened, in place of `inner` (`layout.js:163–172`), and `sized`, `clamped` call `frameOf`;
- a canonical run reads canonical children: while `inverse` exists, it projects `areas` too (`settle.js:120–124` folds `start.boxes` only), and `frameOf` under a canonical `ctx` counts no temporary row.

### 6.2 One driver: children → frame → parent → validate

`tree.js` settles the changed content of an area, puts it into the tree, and then settles the sheet with that tree: a change of the area itself takes its frame in the same SETTLE (phase 1a or 1c, through `measured`), and otherwise, when `frameOf` differs from the area's `h` or `t`, a plain `{type: 'size', id}` with no numbers. `grow` and the four places that put `rows`, `t` into a change go. A gesture's `start` and the states of a hold carry the `areas` of the gesture's start, as the count from the start has it (AREA.6): a gesture on the sheet changes no child, and `areaSide` makes both parts again from the start at every move. Trees are immutable and a result is returned whole or not at all.

### 6.3 One clamp, and the input contract

- `sideRect` stays the only clamp of an area's handle. For an area's width change, phase 1c (`settle.js:326`) checks that the rectangle lies in the container, the area with its free cells, and fails otherwise; the clamp of every other width change stays.
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

**The experiment** (`tests/lab/undo-snapshot/`): on the generator's histories, three paths: (A) `inverse` as built; (B); (B′) one `resize` and FOLLOW per container, then one `rest()`. Reported to the owner:

- shares: the same / other rows / the same rows and other probes (deleting, narrowing, ending temporary heights, after the undo);
- how far step 2 depends on the order of its queue;
- the refusals of each path;
- the 5–10 smallest differing cases as pictures, G21's apart;
- the code that would go: `inverse`, `canonical` in `Change` and `Transition`, `back`, G21's branch of `transitionFacts`.

Required cases: a signature that returns to its old value; several undos in a row; changes of blocks only the entry holds (a chip to a renamed note); composite actions followed by a change of content; the probes after the restore.

(C), the counterfactual, needs a journal of the edits between and their RELINK borders, and the heights measured then may not be enough (without the action a block might have had another width). Not recommended.

## 8. The narrow slice on `.dev` (S5, Q5)

Behind the switch, off by default: open a real note; carry and drop on the sheet and in an area; enter and leave; typing; create and delete; the exact undo only, every other case dropping the engine's history until Q7. Handles, drawing an area, ungrouping and the hold are off. One note is never served by both layouts. The stored format does not change; on `failed`, the safe result and nothing written.

Its modules (`measure.js`, `bridge.js`, `drag.js`, `ops.js`) are the first versions of those of steps 3–5, with their Node tests, not code to throw away.

**The action journal**, a ring buffer that can be exported, with no note text: the input tree, the gesture's `start` and memory, the change, the rules and settings, the versions of the engine and the passports, each block's own temporary rows, the whole answers of `Measure` that were asked (`rows`, `shown`, `lines`, `natural`, keyed by block, width and measuring version), and the result or the refusal. Replayed in Node, an entry is a permanent case and a proof that a state is reachable. A replay that asks for a measurement the journal has not says so; it neither invents an answer nor calls the difference a defect.

**One state of inputs for a gesture** (the seam that remains once the frame is explicit): the bridge's tests show that the measurements of a gesture are stable, that an outside change cancels the gesture, and that a stale result is not written.

## 9. Process (Q6)

- A finding: first a minimal permanent case; then its class in the generator with a saved seed; the old code fails and the new passes; the case stays. Nobody waits for a random generator to find it again.
- Reachable means a sequence of allowed commands from a valid state: import, the content of areas, fonts, renamed links and sync included. `failed` does not close a finding an allowed action leads to.
- A finding under a switched-off rule does not block in the experimental mode, except damage to data, a broken atomicity or a wrong layout written.
- Two rounds with findings of one class start an architecture review, not a rewrite by default.
- No reachable error under the default rules is necessary for a PR, not sufficient: the supported configurations and the common invariants remain.

## 10. What step 3 may assume after this stage

- `settleTree` takes no derived number: a change of an area or its children gives a tree whose frames `validate` accepts.
- `validate` is the one check of a tree; the generator's sequences, probes and quotas are the bar a new action is drawn into before review.
- The switches of §5 that are core have no fallback to write or test.
- The undo's second path is the one the owner chose in Q7; composite actions are undone by the snapshot.
- Not covered by Node tests and shown only by the slice: real measuring (fonts, devices), speed on real notes. For 0.2, before stacks are stored (G12): how stacks are read and repaired, `fromPlaces` being the fallback.

## Review log

- 2026-11-13, before the plan: the architecture decisions sent to the independent reviewer (read at `0d94f29`). Accepted: the one clamp, the input contract, dropping «the cause at its source». One major: (B) is not the counterfactual, shown by a case on the engine; §7 states the narrower meaning, fixes the queue and the canonical pass, and lists the required cases. One medium: an area's own temporary rows; §6.1 gives them their own field, and names `open` and `inverse` as places the function must be wired into. Conditions taken into §4 (justified refusals, two-step probes, input unchanged after a success, INV-5 as a law, the opening law compared by places, quotas by substance), §4.4 (a pinned commit, the same inputs, stacks by value, explained differences only) and §8 (the journal's fields, a missing measurement, one state of inputs).
