# Review request: the layout engine, plan for version 0.1

## Round 4 (2026-11-04)

Thank you for round 3 ([your comment](https://github.com/Yokogamma/baobook/pull/124#issuecomment-6642160737)). Your blocker showed that gaps split over pairs of neighbours lose information, so we changed the representation instead of patching it. The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/0a28e78...2bf705a>.

**What changed.**

1. **Gaps are stacks** (`LAYOUT-RULES.md` §1.3, §2.1, INV-2, INV-3, GAP.1–GAP.9).
   - Every gap is kept whole on the block that had it before anything came between (per column: its `u`, or the top).
   - The blocks that came between stand in it, each with its lend (the rows its body covers, never more than its height: decision G7) and its pad.
   - Every row, a head block's included, comes from the stacks. Head rows are no longer trusted caches.
   - RELINK works column by column: leave, adjust, stand, fresh, fit.
   - Your two round 3 examples are now cases of the model, below.
2. **The gaps were written first as an executable model**, `tests/lab/gap-model` (`node tests/lab/gap-model/test.mjs`; it is not run by CI), and the specification was then rewritten from it. The model passes:
   - the examples of all three of your rounds, asserting rows and owners;
   - decisions G5 to G8 and lesson 18;
   - random sequences of inserts, growth, widening, narrowing, carries and deletions, compared with the same history without the inserted blocks;
   - the same history from storage in another order;
   - carries there and back;
   - deletions that never move a block down.

   Step 1 ports its cases to `tests/layoutgap-*.mjs` and keeps it as a second implementation to compare with (plan §5).
3. **New decisions by the owner.**
   - **G7:** a standing block that shrinks below its lend gives up those rows, so a later deletion moves nothing down.
   - **G8:** narrowing is not deleting. The block under a narrowed one stays, and the rows become free room. It is a switch, `GAP.9`, whose «off» behaves like a deletion.
4. **Your minor finding.** The safe mode saves text through the normal pipeline and never writes a place or a size; the stored geometry stays as it was (plan §3.5).

**What we ask.**

1. Is the round 3 blocker resolved by the stacks, and your major (the last upper block narrowing away)?
2. Is the GAP section implementable as written, without the model? Where would two implementers differ? Consider the order of events in one RELINK, swaps, pushes by primitives (`moves`), rule 5's fit, slack, pads.
3. Does the model agree with the text? Can you find a sequence that breaks either? The model and its tests are small enough to run and extend.
4. Did anything else change for the worse?
5. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 3 (2026-11-04)

Thank you for round 2 ([your comment](https://github.com/Yokogamma/baobook/pull/124#issuecomment-6639782304)). Its four findings are fixed; the diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/1db73b2...d7180d8>.

1. **Blocker, GAP's classifier.** The within and across classes now follow the whole path of blocks in a column (`LAYOUT-RULES.md` GAP.5):
   - a block put into the free room above a head block, and several blocks that come between one old pair at once, are split as one path and joined back as one (rules 2 and 3);
   - every lend of a path is kept under the path's outer pair, looked up by column, and its key moves to the next block when an end of the pair is taken away (§1.3, GAP.6), so the blocks of a path can be deleted in any order;
   - a new class, *across and within*, covers a column where old blocks went and new ones came in the same RELINK.

   An internal check worked your two examples and three more sequences through the text: after every order of deletion the lower block comes back to its row.
2. **Major, an area's side handle.** It is now a composite change, `areaSide` (§5.6, plan §2.1). The rectangle is clamped first. Then a wall acts inside the area: for the left edge the children keep their cells on the sheet. Then the area's width change, with its new height, runs in its container. The two parts are accepted or refused together, and both containers are written.
3. **Major, direction.** The carry memory keeps `dir`, the last vertical direction. It starts down and changes only when the target row changes; SETTLE updates it before phase 2 (§6.D, phase 11).
4. **Major, numeric domain.** `MAXCELL` (2^24) bounds every coordinate and size the engine computes with (§1.5). The bridge checks the range before `open()`. A note outside it opens in a safe mode: each value shown clamped, placement off, nothing written, the stored values untouched, the sync format unchanged (plan §3.5). A push past `MAXCELL` is refused, and the opening separation is bounded.

Also done: the rules list keeps the requested values apart from what `resolve` puts in effect (VIEW.8). Tests for each fix are added to steps 1–3.

**What we ask.**
1. Are your round 2 findings resolved, and with them the two partial round 1 findings?
2. Is the path-based GAP.5 (classes, rules 2 and 3, the lend key and its moves, GAP.6) sound and implementable as written, including orders of deletion and narrowing you can think of beyond the five we checked?
3. Did the fixes introduce anything new?
4. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 2 (2026-11-04)

Thank you for round 1. This round asks you to look again at both documents, which have changed a good deal since you read them. Your round 1 brief is kept below for reference.

**What changed since round 1.** You reviewed head `643f940`; the current head is `2f7cf6e` (diff: <https://github.com/Yokogamma/baobook/compare/643f940...2f7cf6e>).

1. **Your seven findings were fixed** (`7313a24`, `d438873`). A [PR comment](https://github.com/Yokogamma/baobook/pull/124#issuecomment-6634154830) maps each finding to its fix. For finding 1, the owner tried three ways in the mockup and chose «insertion»: a block that comes between two blocks by itself counts as put into the upper one's gap (`LAYOUT-RULES.md` GAP.5 rule 3, decision S8). Trying it exposed a second defect: rule 1 eroded a gap that does not hold its lower block whenever a text beside it grew and shrank back. Rule 1 now counts only real moves, never FOLLOW or a change of height (lessons 17 and 18).
2. **An architecture review** looked at modularity, simplification, atomicity, extensibility and switchability. The owner accepted it with decision **R1**: every rule that is not core can be turned off without breaking the others, and 0.1 has a «Правила» list on `.dev`. The documents were restructured around it:
   - **Switchable rules.** `LAYOUT-RULES.md` §1.6 lists the core rules, and every switch with its fallback and what it needs. The engine takes a `Rules` input, closed over those needs by `resolve` (plan §2.1).
   - **GAP.5** is now a classification (`kept`, `across`, `within`, `fresh`) followed by five operations (`adjust`, `join`, `split`, `fresh`, `fit`). It works over an explicit `moves` input, which the change and the primitives produce.
   - **SETTLE** is a pipeline of phases 1–10. Letting through is phase 3, inside the pipeline, plus a wrapper (phase 11 and the runs again, §5.1b).
   - **Change kinds** are data, in one table (§5.2).
   - **Fewer primitives.** One primitive, `sink`, covers P-DOWN, P-SINK and P-SEP. One `Obstacle` covers walls, container edges and immovable blocks.
   - **`settleTree`** drives SETTLE across containers (§5.6).
   - **One layout, two measures** (§2.1).
   - **Results.** `{refused}` exists beside `{failed}` (§5.5).
   - **Storage.** The gaps are stored on the lower block.
   - **Writes.** A write is a diff against the stored fields, so no list of pending places is kept (plan §3.4).
3. **Cross-checks.** Two rounds of agents checked the two documents against each other: 48 findings, then 24, all confirmed, none a blocker. All are fixed. The documents' review logs list them.

**What we ask you to review.** Please answer these explicitly:

1. **Round 1.** Is each of your seven findings resolved now? A status table is enough, with a pointer wherever one is not.
2. **Switchable rules (R1).**
   - Is §1.6 sound? Check that the core list is right, that every fallback can be built, and that the needs are complete. Also check whether the invariants that §1.6 claims hold under any set of switches really do.
   - Can the plan's machinery express every switch: `Rules`, `resolve`, `ctx` reaching every module, every test in two forms, the property test under random rule sets, and the list (VIEW.8, `panel.js`)?
3. **The restructured core.** Look for contradictions, parts that cannot be implemented, and wording that two implementers would read differently, in:
   - GAP.5 with `moves` (`Moved` as a list of steps);
   - the pipeline and the letting-through wrapper (a swap ends its run, each RELINK uses up its moves);
   - the change kinds and `ChangeKind`;
   - `settleTree` and `grew` in both directions;
   - `{refused}`;
   - the two measures.
4. **The two documents together.** They were edited in parallel by two authors. Does the plan's surface (§2.1 typedefs and signatures) match the rules?
5. **Steps and tests (plan §5).** Is each step still shippable and testable? This includes:
   - SRI rows for `public/layout/` files from step 1;
   - the test server's second root at step 4;
   - one test file per primitive and per GAP operation;
   - the split of the property test between Node (INV-1 to INV-5) and the browser (INV-6, INV-8).
6. **Anything else** that is missing or risky. Then a verdict: can step 1 start?

**Out of scope**, as in round 1: the owner's product decisions, unless one conflicts with another or cannot be built; the mockup's code; features after 0.1, except where 0.1 would block them. Variants of a rule beyond on and off are one of those features: 0.1 keeps switches binary, and the next release chooses which rules get variants (`LAYOUT-RULES.md` O-20).

**Suggested order:**
1. The two review logs (the newest entries) and §1.6 of the rules.
2. The rules' §4 (GAP) and §5 (SETTLE).
3. The plan's §2.1, §3.4 and §5.
4. The rest, as needed.

**What we would like back.** As in round 1: numbered findings, the most severe first. Give each one a severity (blocker, major or minor), the document and section, the evidence, and a concrete fix. Then the explicit answers and a short verdict. A comment on PR #124 or an issue in this repository is fine, in English or Russian.

## Round 1 (2026-11-04)

**Answered** on 2026-11-04 in [PR #124](https://github.com/Yokogamma/baobook/pull/124): 1 blocker and 6 major findings, fixed the same day; see the review logs of `LAYOUT-ENGINE-PLAN.md` and `LAYOUT-RULES.md`.

**The documents** (all in this folder, on the branch `ccr-fde1eaa8-r7b10i`, pull request [#124](https://github.com/Yokogamma/baobook/pull/124)):

- [`LAYOUT-ENGINE-PLAN.md`](LAYOUT-ENGINE-PLAN.md): **the implementation plan for version 0.1**, the subject of the review.
- [`LAYOUT-RULES.md`](LAYOUT-RULES.md): the specification the plan implements.
- [`LAYOUT-MODEL.md`](LAYOUT-MODEL.md): §2 is the table of the owner's decisions that the rules cite in square brackets (W3, G6, A2…); §8 lists today's defects; §3–§7 are an earlier model, kept as a record.

**The code** the plan cites: line numbers of `public/index.html` are at commit [`0178041`](https://github.com/Yokogamma/baobook/blob/0178041/public/index.html); the data format is [`public/sync.js`](../public/sync.js); the repository's conventions are [`CLAUDE.md`](../CLAUDE.md).

**What Baobook is.** A notes app on a free «sheet»: a note is a set of blocks (text, code, areas that hold other blocks) placed anywhere on a grid of cells, like cards on a desk. It is a vanilla JS PWA with no build step; notes live in IndexedDB and sync through Firestore (sync is in production).

**The problem.** Today's layout code (in `public/index.html`) places and pushes blocks with rules that depend on the window width and on the order of the stored array; pushes are saved for good and eat the gaps between blocks; opening a note of 120 blocks takes about a minute. `docs/LAYOUT-MODEL.md` §8 lists eight such defects (F1–F8), each reproduced.

**What has been done.** The owner decided, one by one, how blocks should behave (the table in `docs/LAYOUT-MODEL.md` §2), each tried in an interactive mockup first. The decisions are written as a specification, `docs/LAYOUT-RULES.md`: modules SIZE, GAP, SETTLE (one solver with fixed phases), DRAG, RESIZE, AREA, EDIT, VIEW, with invariants INV-1…INV-8; it went through four review rounds. The implementation plan, `docs/LAYOUT-ENGINE-PLAN.md`, went through four review rounds and two checks after the latest decisions. Both reviews were by an internal AI reviewer; you are the first independent one.

**What we ask you to review: the plan.** Its core idea: version 0.1 replaces **placement only** (where blocks stand, how big they are shown, what moves when one is carried, resized, created, deleted or grows), keeps every other feature's code, changes **no stored field**, and runs behind a switch until its last step. Please answer these questions explicitly:

1. **Safety of real notes and sync.** Is it true that 0.1 changes no stored format (§1, §3)? Is the reading of today's stored positions sound: sheet blocks store `fx`, a share of the window's width, read at a fixed 1458 px into columns (§3.1)? Is what a user action writes well defined (§3.4)? Is opening old notes that break the invariants handled without harm (§3.5)? What happens with devices that measure text differently, and with devices still running the current version?
2. **The boundary with today's code.** Is the list of call sites complete and right (§6, §6.1), and the list of what is removed (§6.2)? Does undo fit the existing structural undo stack (§6.4)?
3. **The steps** (§5): is each one shippable and testable, is the split «pure core in Node, then browser, then bridge» sound, and is the test plan enough (§5, §5.1, `LAYOUT-RULES.md` §13)?
4. **Faithfulness and implementability.** Does the plan implement `LAYOUT-RULES.md` as written? Are there rules that contradict each other or cannot be implemented as stated, above all SETTLE's phases (§5 of the rules) and the gaps (GAP, §4 of the rules)?
5. **Performance and determinism** (§4.1, §4.2, §4.5).
6. **Anything missing or risky** that we have not seen.

**Out of scope.** The owner's product decisions themselves, that is why a block behaves a certain way: flag one only if it conflicts with another or cannot be built. The mockup's code. Features planned after 0.1 (§1.2), except where 0.1 would block them.

**Suggested order.** The plan's §1 → the rules' §1–§2 and §5 → the plan in full → the code where the plan cites it. The mockup is a private page; ask the owner for access if you want to feel how the rules behave.

**What we would like back.** Numbered findings, the most severe first, each with: severity (blocker / major / minor), the document and section, the evidence (file and line, or rule id), and a concrete proposed fix. Then explicit answers to questions 1–6 and a short verdict: can step 1 start as planned? English or Russian, as you prefer. Comments on the pull request [#124](https://github.com/Yokogamma/baobook/pull/124) are a good place for them.
