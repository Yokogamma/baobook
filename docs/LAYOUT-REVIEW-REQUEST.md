# Review request: the layout engine, plan for version 0.1

**Status (2026-11-05).** Round 9 of the independent review found no blocker or major issue: GAP is sufficiently specified and step 1 can start. Its three minor findings, in the lab model's `step` helper and in one test property, were repaired before the model serves as a strict oracle for `gap.js`.

## Round 9 (2026-11-05)

Thank you for round 8. The major finding is fixed by narrowing what the switch turns off; the two oracle defects are fixed in the model (named cases `round 8`). The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/d3e9fc9...4a17d3b>.

1. **`GAP.5.1` off** (rules §1.6, the core list, GAP.5).
   - Leaving and coming back cannot keep every other block where it is in both measures, so the switch no longer does that.
   - Rule 1's lengths of gaps are core: they are what INV-2 and INV-8 need.
   - The switch turns off only what rule 1 does to owners. The rows a move carries under a block, and the slack it used, become rows of the stack they come into, its `u`'s, and free room stays free.
   - So nothing moves otherwise, and the rows are the same with it on and off. Your case keeps X at 24 in both measures, before and after B's temporary row ends, in both switch states.
   - A deletion afterwards takes other rows than with it on, since the owners differ; the table says so.
   - `GAP.8` now needs `GAP.5.1`.
   - A random test runs 1,000 histories without deletions with the switch on and off, and finds the same rows in both measures after every operation.
2. **`step`** replays rule 1 on the stacks alone, with no placement guard, for the reference and for the retained columns. It validates the whole result at the end. Your X at column 1, row 3 moved down one and narrowed sideways arrives at column 2, row 4.
3. **Order of arrival.** `step` takes departures and arrivals top to bottom by the rows SETTLE gave, then by column and id. Your A and Z give Z first, and A ends at 2 after Z is deleted and A narrowed.

**What we ask.**
1. Are the three findings resolved?
2. Is GAP now a fixed implementation contract for step 1?
3. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 8 (2026-11-05)

Thank you for round 7. Both major findings and the model defect are fixed, first in the lab model (named cases `round 7`), then in the text. The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/c3d845e...d3e9fc9>.

1. **An arrival in the same RELINK as a move** (rules, GAP's inputs; plan `relink`). An arrival's reference is now prescribed: before rule 2, RELINK replays rule 1 for every step on a copy of `base`'s stacks, as if each block kept its columns, and FOLLOW in the canonical measure gives the block's row there. A step's `rows` are never added to a canonical row, and the reference is kept for rule 3 whatever columns the block leaves. The model has `step(moves, widths)`, one RELINK. Your example now enters at 3, `S | S2 [X:S1] S16 |`, and L keeps 20 after A folds.
2. **`GAP.5.1` off keeps every other block where it is** (rules §1.6). A standing block moved with the switch off gives its lend back and leaves the rows its body took beyond it, its growth's push, as rows of its stack's `u`; an anchor's body and slack stay as before. Your grown-standing case keeps L at 12 in both switch states. Deleting X then lets L rise to 10 with the switch on, and leaves it at 12 with the switch off, where the growth's rows are A's.
3. **The model's fallback** finds a block's neighbours in the column's chain, as rule 3 says. Your multi-block move gives A=4, B=7, L=12 in both id orders and both switch states.

**What we ask.**
1. Are the three findings resolved?
2. Is GAP now a fixed implementation contract for step 1?
3. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 7 (2026-11-05)

Thank you for round 6. Its four major findings and the minor one are fixed, first in the lab model (named cases `round 6` in `tests/lab/gap-model/test.mjs`, which now has areas), then in the text. The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/4c44fed...c3d845e>.

1. **The undo across columns** (plan §6.4, `CreateChange` and `CarryChange`; rules GAP.5 rule 3). An undo's change carries its old cell as a canonical place (`canonical: true`), and RELINK puts the block back by its canonical row in every one of its columns, as it places a block that comes into a column by itself. Its displayed row is what FOLLOW gives from there. Your example gives `A | A2 |` and `B | B2 |`, X at 11 on the screen and 3 canonically, back at 3 when A folds; the inverse away-drop gives the same. A user's drop is still placed at its displayed target.
2. **An arrival's canonical row** (GAP's inputs, plan `relink`). An arrival is measured by FOLLOW in the canonical measure over `base`'s stacks with `after`'s heights, so a height a phase changed is counted. The arriving block's own row there is moved by its steps, and `yc` and an area's `t` are refreshed by every FOLLOW. The model's case is yours in shape: B grows, X is then held at 13 canonically, widens into a third column, and L keeps 30.
3. **`GAP.5.1` off** (rules §1.6). A moved block leaves its columns as when narrowed off them, what its body stood on staying, and comes in again at its new row. No gap is adjusted, G5 and G6 are lost, and nothing else moves; fit still never cuts. Both switch states are tested: your A/X case moves up, and B stays under U and A.
4. **Areas in GAP** (rules §1.1 Extent, AREA.7a; plan §3.5). In GAP an area is its extent: its top one row above its frame, its canonical height its frame's plus two. So its lend (G7 caps it at the extent's height), its room, its slack, fresh rows and what its body leaves when narrowed off are all in extent rows. Your example now keeps L at 11 when the area narrows off, and a standing area covers four rows. An area's frame stands at row 1 or lower, so its free row above lies in its container; `open()` moves an area at row 0 down one row (proposed). `geometry.js` and the area cases join step 1.
5. **Fit's order** (rule 5, the model). Fit visits its targets in reading order; both of your input orders give A=2, B=7.

**What we ask.**
1. Are the five findings resolved?
2. Is GAP now a fixed implementation contract for step 1?
3. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 6 (2026-11-05)

Thank you for round 5. It found four integration gaps, each fixed in the text and pinned by a named case of the lab model (`round 5` in `tests/lab/gap-model/test.mjs`). The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/2db3b0e...4c44fed>.

1. **Fit (finding 1).** `LAYOUT-RULES.md` GAP.5 rule 5, PR-6, INV-8.
   - SETTLE's rows are targets, not constraints. Fit only gives a block the rows it lacks, in its binding stack, and never cuts a stack.
   - FOLLOW runs after every RELINK, in the displayed measure, and its rows are the result and the preview. So a block that came into a column at its canonical row and pushes another on the screen is what is shown and stored.
   - The model now has `fit`. With the rows SETTLE had (your L at 20), it changes nothing after your widening: L stays at 28 on the screen and 20 canonically, and is back at 20 when A folds.
2. **Rigid steps (finding 2).** GAP's inputs and plan §2.1 `Step`.
   - A step moves every block it moves by the same rows.
   - A primitive that moves blocks by different rows reports one step per common part, in order. Your P-UP example is B up 3, then A and B up 2, then X up 6, giving A=0, B=1, X=2 with every gap closed as the moves say.
3. **Both measures reach RELINK (finding 3).** Plan §2.1 `Box`, `Layout`, `relink` and `show`; GAP's inputs.
   - Every box of a displayed layout carries `t`, the temporary rows of its `h`, and `yc`, its canonical row. An area's `t` also holds the growth its children's temporary rows give it.
   - RELINK measures lends by `h − t`.
   - A block that comes into a column by itself takes as its canonical row its row in `after` less the push it had in `base`; a new block has no push.
4. **The inverse undo (finding 4).** Plan §6.4.
   - Every old cell is projected first: its row plus the push the temporary heights give at it, that is the most, over its columns, by which the block right above it there stands lower on the screen than canonically.
   - Your example projects 3 to 11, and the block gets back canonical 3 with its gap.
   - Recreation, entering, leaving and ungrouping use the same projection.

**The full review of the same head** (six agents; 6 major, 3 minor) is answered in the same commit (plan review log, «A full review of `2db3b0e`»):
1. **Undo prepared first** (plan §6.4). The bridge prepares the restore, all parts of a composite one together, applies it, and only then pops the entry. A refused or failed restore keeps the entry and the state, and the toast says it could not undo.
2. **Content that cannot be placed** (`LAYOUT-RULES.md` §5.5, plan §2.1, §3.5, §4.2). A refusal answers a request to place. A change of content that has already happened is never refused: the content is kept and saved, and the note's geometry goes to the safe mode.
3. **One list of written fields** (plan §3.4). `PLACE_FIELDS` covers `parent`, the place, `cw`, `ch`, `open` and `collapsed`, and a cleared field is written as removed. `diff`, the patch, the bridge and the undo all use it.
4. **The clamp before the judges** (rules phases 1c and 10, plan `ChangeKind.contain`). The target is clamped in phase 1c and a created block measured there. Phase 10 only checks and never moves a block.
5. **The extent** (rules §1.1, AREA.7a, plan `geometry.js`). One contact rule: an area takes its frame with one free cell on every side, and every comparison between blocks uses extents, the stacks and FOLLOW included. Two areas keep two free cells between them (proposed).
6. **Text size** (plan §4.4, §6.1). A change of it is a view-only re-measure, as the measured counterexample shows.

The three minor findings:
- a re-measure during a gesture waits for its end, tested with a late font;
- the chain under `GAP.5.2` off stays core and only the rows change;
- step 1 tests the pure column conversion, and step 5 the real `serBlock`.

The recommendations taken:
- `settle.js` split in three;
- one function for an action's preview and its commit;
- a kind's preconditions, including that a block never grows taller when it gets wider;
- stacks kept as runs in the engine.

**What we ask.**
1. Are the four round 5 findings and the full review's findings resolved?
2. Is GAP now implementable as written, as a fixed contract for step 1? Are the plan's contracts for the later steps (writes, refusal after input, undo) compatible with it?
3. Verdict: can step 1 start?

Out of scope and output: as in round 2.

## Round 5 (2026-11-05)

Thank you for round 4 ([your comment](https://github.com/Yokogamma/baobook/pull/124#issuecomment-6644095368)). Every finding was fixed first in the lab model, with your executed examples as its named cases, and then in the text. The diff since the head you reviewed: <https://github.com/Yokogamma/baobook/compare/281c630...2db3b0e>.

**What changed.**

1. **Two measures (your blocker).** `LAYOUT-RULES.md` §1.3, §2.1, INV-2, INV-3, GAP.4, GAP.5 rules 1–4.
   - A standing block's lend is measured by its canonical height, so G7 holds as decided and cuts only on a real shrink.
   - A temporary height pushes the blocks under its block on the screen, whatever that block is, and changes no stack. Your example gives `A | A2 [X:A3] A6 |`, L at 15 on the screen and at 12 canonically, and `A | A11 |` after the removal. The real shrink of your trace (6 → 3) still lets L rise to 9 (G7).
   - A move is made on the displayed layout as if the temporary heights were real; with them taken out it holds where its gaps hold the block, as after a growth that shrinks back (H1, INV-7 c).
   - A change of columns is written at the canonical rows, so no push of a temporary height is written:
     - a block that comes into a column by itself (widened, pressed aside) takes its canonical row there, unless the screen put it under a block of that column;
     - a narrowed anchor keeps its canonical body and slack (GAP.9); on the screen a temporary height may then move the block under it until it ends.
   - Two internal checks shaped this. A first design, which recorded the rows a temporary height covered, left traces, had rows no operation could reach, and wrote temporary heights through width changes. A second, which made every move hold in both measures, refused legal carries. Both were replaced before this request.
2. **An owner's rows across a column (finding 2).** Rule 2 takes a departing block's rows wherever they lie in the column, and INV-3 and the model's `check()` require every owner to cover its column. Your example gives A=0, B=1, also for U carried away; narrowed off with `GAP.9` on, U's rows become rows of the stacks they lie in.
3. **Standing head blocks (finding 3).** The first block of a chain may stand, and `isHead(layout, box)` reads the chains. GAP.8 is per column, as G6 says: the free room the first block of a column leaves, anchor or standing, becomes its own. Your example gives `top | _3 [X:_1] X2+_4 |` and H at 8 after the removal; with `GAP.8` off, H stays at 10.
4. **The last anchor (finding 4).** There is no pad now: the room above a block put lower than the gap reaches is its own rows. Under the last anchor, the lowest standing block becomes the stack's anchor and its room becomes rows of `u`. Your paired histories now agree exactly: X=8, `A | A7 |`.
5. **Moves of several blocks (finding 5).** Rule 1 works, step by step, on runs of chain blocks moved together. Only the gap above each run and the gap under it change, each once, and the order of the rows under a run is named. The model has `move(ids, d)`; your example keeps `U2` between A and B both ways, and so do a standing block moved with its anchor, and with the anchor above it.
6. **GAP.9's scope (finding 6).** It covers the rows a block owns and an anchor's body. A standing block always gives its lend back (S8), so your round 3 case returns L to 10 in both switch states.
7. **INV-7 b is now exact about its scope.** It is for the neighbours a block had when it came, and the gaps as they were then. A block that changes its columns while an inserted block, or what it pushed, stands there takes its place as it finds it (S8, G8), and keeps it when the inserted block goes (G2). The named cases «INV-7 b» show each way:
   - G4's order of arrival;
   - G8's slack taken by the inserted block's growth;
   - a block widened while the inserted block's growth held it lower;
   - a block narrowed off from above another while that held it.

**The random tests.** As you suggested, base blocks now also change width (coming in from the side) and show temporary heights, and inserted blocks come in showing taller. Carries of inserted blocks stay out of the paired histories (by G5 and G6 a move by hand changes gaps on purpose), and so do carries of base blocks (whether a gap holds a block depends on what the inserted blocks push). Carries and moves of several blocks are covered by the round-trip test.

The paired histories run twice:
- **Guarded.** Base blocks change width only while they all stand as without the inserted blocks, and never under one. Every row then agrees in both measures, and stacks may differ only in the columns those blocks touched (G4's order of arrival, 6 of 2,000 sequences).
- **Unguarded.** The comparison is exact unless a base block came into a column, or left it, while it or that column did not stand as without the inserted blocks (about 15% of the sequences). Then the stacks of every other column must agree.

Further random tests:
- deletion never moves a block down, in either measure;
- round trips under temporary heights put every block back on the screen, and canonically move a block at most once, down, by the slack it used (a single move up leaves that slack as its own rows, so the blocks under it stand that much lower in the stored layout, INV-7 c);
- ending every temporary height gives the canonical rows;
- reloading what 0.2 and 0.1 store gives the same canonical layout.

**What we ask.**
1. Are the six round 4 findings resolved?
2. The two measures: is «a temporary height pushes on the screen and writes nothing; a move is made on the screen as if it were real; a change of columns is written at the canonical rows» sound and complete? Consider every way a block can come into a column, a carry with a temporary height on above or below it, the undo of plan §6.4, and INV-8.
3. INV-7 b's scope: is «the neighbours it had when it came, and the gaps as they were then» the right promise? Do the named ways a block that changed its columns meanwhile keeps a trace follow from G2, G4, G8 and S8 as decided, or do they point to a representation problem?
4. Is GAP implementable as written now? Where would two implementers differ?
5. Verdict: can step 1 start?

Out of scope and output: as in round 2.

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
