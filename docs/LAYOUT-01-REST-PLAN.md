# The rest of layout 0.1 (plan)

Status: **proposed, 2026-11-27; not approved.** Written against `main` at `07966f4` (build 2026112701), after the stage of [`LAYOUT-SEAMS-PLAN.md`](LAYOUT-SEAMS-PLAN.md) closed (#160–#178). Everything here that rests on no decision of the owner is a proposal; the owner's questions are in §3, each with a recommendation. Decisions are cited by their ids in `LAYOUT-MODEL.md` §2 (G27, W13…), rules by theirs in `LAYOUT-RULES.md` (DRAG.B4, RESIZE.1…), the seams plan's questions as Q1–Q10.

## 1. Why a new plan

`LAYOUT-ENGINE-PLAN.md` §5 planned steps 3–6 before the slice existed. The slice built much of steps 3–5, and built it otherwise: the page keeps its own commands and asks `bridge.page()` what they were for the engine, instead of one `LAYOUT.change(…)` per call site (engine plan §6, item 1); `ops.js` has the exact undo only; `measure.js`, `view.js` and `page.js` are wired behind the switch with no `input.js`. Rewriting §5 in place would erase the record of what was approved, and the seams plan is closed. So this document plans what remains, and the engine plan's §5 gets one line pointing here. The engine plan's §3 (data), §4 (determinism, bounds, measuring, passports, budgets), §6 (the boundary, its table of commands and §6.4's undo as G27 amends it) and §7 (risks) stay the reference; where this plan and them differ, this plan says so, and it wins.

The rules that carry over:

- **Build on the slice, not beside it.** `page.js` stays the one object `index.html` calls; `bridge.page()` stays the boundary for the page's own commands, and anything the engine has no action for ends in `outside` (opened again, nothing written). A command gets an action of its own only by a PR of this plan, never by a second path around the bridge.
- **One note is never served by two layouts in one tab**; the switch is read once when a tab starts (engine plan §1).
- **No change of the stored format** in 0.1 (engine plan §1, §3); a refused or failed layout writes none of its places; what is typed is saved whatever SETTLE answers (seams plan §8).
- **The process of the seams plan §9** (the owner's Q6): a finding is first a minimal permanent case, then its class in the generator with a saved seed; reachable means a sequence of allowed commands from a valid state; two rounds with findings of one class start an architecture review.
- **Every PR** into `main`, reviewed, merged on the owner's word; one that changes `public/` raises `BUILD` and runs `node tests/hashes.mjs --write`; a new file under `public/layout/` gets its SRI row by hand; a new test file gets its row in `tests/README.md`, and a weight in `tests/lib/shard.mjs` when slow.

## 2. Where it stands

**Built** (seams plan §10): the core (stacks, FOLLOW, RELINK on declared facts, SETTLE with letting through, `settleTree` with enter, leave, ungroup, drawArea and areaSide, `open`, `validate`, `frame.js`), 19 switches; the journal; `drag.js` (target, home, outside, away, entering and leaving by the frame); `ops.js` (carry, enter, leave, create, remove, typed, the exact undo); `bridge.js` (read, the safe mode, `page()`, one state of inputs for a carry); `measure.js`, `view.js`, `page.js`; on `.dev`, behind «Нова розкладка (0.1)», on a computer: carry by the grip and headers, «В область…» and «З області» with the exact undo, typing, creating and deleting through `page()`.

**Left for 0.1**, grouped:

| Group | What | Where it is specified |
|---|---|---|
| Undo | G27's (B) after later edits; `inverse` removed with `canonical` in `Change` and `Transition`, `back` in GAP and G21's branch of `transitionFacts`; the page's structural commands (delete, create, convert, collapse, ungroup, restore a block) as the engine's actions with its undo; a refused undo keeping its entry | G27, seams plan §7, §7.1; engine plan §6, §6.4 |
| Measuring | the view-only re-measure (text size, a font loaded late, a chip relabelled) that keeps the stacks and the entries; temporary heights through a change SETTLE runs (a code block unfolded while edited) | engine plan §4.3; G26 |
| Opening | a note opened afresh standing as the session left it (`tests/layoutbridge.mjs` 7a, 7b); the page's other code reading the shown places, not the stored rows | seams plan §8.1, §10 |
| Gestures | the hold and Shift (DRAG.B4); the width and height handles and the size menu (RESIZE.1–3); an area's side and bottom handles (AREA.2, 3, 5, 6); drawing an area (AREA.7b); the arrows of position mode (DRAG.C4, W15); a click on the empty sheet and its taking back (EDIT.1–4, 4a, 6) | `LAYOUT-RULES.md` §6–§9 |
| Look | the carry's look (the ghost, the block following the pointer, the guides, the lit neighbour, the slide, the scroll at the window's edge, the note's width frozen); the scale and the hand; the phone and the narrow view; the dev look and the «Правила» list | `LAYOUT-RULES.md` §10; W12, W13, W16; R1 |
| Release on `.dev` | the budgets of engine plan §4.5 in Chromium; the layout modules in `sw.js`'s `PRECACHE`; the table of browser scenarios with the switch on (engine plan §5.1); the engine the default; today's layout code removed (engine plan §6.2) | engine plan §4.5, §5.1, §6.2 |

**Known and not repaired**, each given a PR below: the elastic width a session gives a block is not stored, so `open()` may give another (D6); the journal's `same` shows that the engine answers again as it did, not that the answer is right, and a gesture's life in the browser may leave no command in it (each PR's browser cases, §4); the open observation of two tabs after the switch (seams plan §8.1), watched in every PR that touches the switch, with `localStorage['sheet:boot']` and `window.sheetDebug.boot` collected if it is seen.

## 3. The owner's questions

| # | Question | Recommendation |
|---|---|---|
| Q11 | The carry's direction for sticking (DRAG.A2) taken from the point it was picked up to where the pointer is now (`drag.js` `aim`), built in the slice: keep it? | **Keep.** It is the reading of «the carry since it was picked up» that needs no history of moves; the mockup's feel is the same in the slice's browser cases |
| Q12 | A carry that crosses an area's frame is run as a change of its own, the block a new block of the container it comes into (`ops.js` `moved`), built: keep it? | **Keep.** It is AREA.7's «a new block, away from the start» run as SETTLE knows it, and the carry back across the frame gives the container back as INV-7 a asks |
| Q13 | A code block's fold stays the page's in 0.1 (the passport counts one line and no header), until folding is one function in 0.2 (A3): keep it? | **Keep** for 0.1; the fold is A3's subject in 0.2 |
| Q14 | An area is its header and its children tall, without the spare row today's layout keeps under them (one row shorter than today): keep it? | **Keep**: AREA.2 says «never shorter than its content», not taller; the bottom handle (D9) sets a taller one |
| Q15 | The safe mode is told by a toast, built: keep it? | **Keep**, with the sheet's `lay-safe` mark; a safe note is rare and only a bug makes one |
| Q16 | A note opened afresh: an elastic text the session narrowed at the sheet's right edge (`tests/layoutbridge.mjs` 7b) is today moved left by `open()` to take its rest width. (а) `open()` keeps its stored column and narrows it there, as DRAG.A3 narrows at the edge; (б) as built, and the difference stays a known one | **(а)**: the column is stored, the width is not, so the stored field wins; D6 makes «opened afresh equals the session» a law of the sequences, with G26's temporary rows its only exception |
| Q17 | An undo the engine cannot place (§6.4's example: the restored block would pass `MAXCELL`): the entry stays and the toast says it could not undo. Keep the entry, or drop it so that the next Ctrl+Z undoes the one under it? | **Keep it**, as §6.4 says: the next Ctrl+Z tries again, and the toast is honest; a dropped entry would undo the wrong action without a word |
| Q18 | The looks of VIEW.6a (where the text stands and the field, P18; the reading mode; the frame or background look) in 0.1, as the engine plan's §1.1 has them, or moved to 0.2 | **Move to 0.2** (proposed): they change no placement, each is a re-measure that D4 makes cheap to add later, and 0.1 reaches the default sooner with today's look. The owner's P18 answer stays as it is for when they come |
| Q19 | Step 6 in two PRs: D16 makes the engine the default on `.dev` with the switch kept to turn it off; D17 removes today's layout code after the owner has used the default for a while | **Two PRs**: a fault found in the first days is a switch away from today's layout, and the removal is a review of its own |
| Q20 | An area's bottom handle carried inwards in 0.1: AREA.4 (P-SQUEEZE) is 0.2. (а) it stops at the area's content, setting `ch` only above it, as the text's height handle does (RESIZE.3); (б) no inward bottom handle in 0.1 | **(а)**: the handle a user meets works both ways, and nothing hidden is needed for it |
| Q21 | The order of the PRs (§4) | **As §4** |

## 4. The PRs

Each PR names its named cases first, then the class it adds to the sequence generator (`tests/lib/layout/seq.mjs`, `laws.mjs`) or to the page's histories (`tests/layoutbridge.mjs`), then the browser cases (`tests/applayout.mjs`, or a new file when it grows past one screen of items). «Effect» is what a person sees on `.dev` with the switch on; with it off, no PR before D16 changes anything. Two rules hold for every PR (seams plan §9, §10): a defect found while building gets a minimal permanent case, its class in the generator with a saved seed, and a check that the old code fails and the new passes; a new action is drawn into the sequences, their probes of consequences and their quotas before review. A failure of a gesture's life in the browser (the focus, a carry given up, the DOM) gets a browser case, since the journal may receive no command at all.

| PR | What | Depends on | Effect on `.dev` |
|---|---|---|---|
| D0 | This plan | | none |
| D1 | G27's undo (B), pure | | none |
| D2 | `inverse` and what belongs to it removed | D1 | none |
| D3 | The page's structural commands as the engine's actions, with its undo after later edits | D1 | undo after typing; delete, create, convert, collapse, ungroup and restore undone by the engine |
| D4 | The view-only re-measure | D1, D3 | a text size or a late font keeps the gaps and the undo |
| D5 | Temporary heights through SETTLE (G26) | D3 | a code block unfolded while edited is shown, never written |
| D6 | Opened afresh as the session left it; the page reading the shown places | D3 | a reload keeps every block where it stood |
| D7 | The hold and Shift (DRAG.B4) | | a neighbour lets the carried block through |
| D8 | The width and height handles, the size menu | D3 | the handles on |
| D9 | An area's handles, drawing an area | D8 | an area's handles on; drawing on |
| D10 | Position mode's arrows; a click on the empty sheet (`edit.js`) | D5, D8 | arrows and EDIT on |
| D11 | The carry's look | D7 | the ghost, the guides, the slide, the scroll at the edge |
| D12 | The scale and the hand | D11 | a narrower window scales the note |
| D13 | The phone and the narrow view | D12 | the engine on touch, reading and writing |
| D14 | The dev look and «Правила» | D9 | the list on `.dev` |
| D15 | The budgets, `PRECACHE`, the scenario table | D13, D14 | the engine starts offline |
| D16 | The engine the default on `.dev` | D15 | the engine for everyone on `.dev` |
| D17 | Today's layout code removed | D16, Q19 | none visible |

D7 needs nothing new of the engine and can go beside D3–D6; the others are in order. Each is one PR, split when its diff outgrows one review, as S5 was.

### D1. G27's undo (B), pure

`ops.js` `undo` gets its second path, in a module of its own, `public/layout/reconcile.js`, since D4 uses the same pass:

- **The exact path first**, as built (the identity is the top entry's `after` and every recorded signature is today's).
- **Otherwise (B)** (seams plan §7, the owner's G27): the candidate is the entry's tree before the action with today's content, canonical; the queue is made beforehand from it, the areas in reading order, in each its blocks in reading order, then the sheet's; each block whose signature differs from the one the entry recorded gets an ordinary `{type: 'size'}` through `settleTree`, one RELINK each, on the canonical measure (`canonicalCtx`), children included; the temporary heights are shown after it (`show`), the blocks' own rows (`tx`) kept; then `validate`. The queue's order is part of the contract (seams plan §7.1: 1.1 % of the histories depend on it).
- **One step**: preparing, the check that the note is the entry's and applying are one; a refusal or a failure keeps the entry, the state and the stored fields as they were (`{ok: false, why}`, the entries kept; Q17). A composite action (enter, leave, ungroup, an area's handle) is undone by its whole tree before, never by an inverse path.
- **The write**: `diff` of the stored fields against the canonical result, for the containers the entry's action ran in and those the pass settled; the blocks the action made are removed, and those it deleted are `restored` (their content the page's, their signatures today's).
- **What drops the entries**, as now: a change from outside (`outside`), the safe mode, a change of the rules (D14).

Tests, `tests/layoutreconcile.mjs` (Node): the named histories of the lab (`tests/lab/undo-snapshot/`): seed 101976 (typed over and back, (B) runs nothing); the review's case of §7 (C at row 8, both trees valid); the history `inverse` fails (two carries, typing between, the undo of the second), answered; a signature that returns to its recorded value; a deleted block whose chip is relabelled (engine plan §6.4's X and N); the `MAXCELL` refusal that keeps the entry; two and three undos in a row with typing between; enter and leave followed by typing; one of the 25 histories whose answer depends on the queue's order, pinned. The class: the lab's histories run on `ops.undo` and compared with the lab's (B) (`paths.mjs`), which becomes the reference (L14, proposed); in `tests/layoutseq.mjs` and `tests/layoutops.mjs`, histories with changes of content between an action and its undo, every undo valid, an undo with nothing between the tree before row for row, the probes after it (deleting, narrowing, ending temporary heights). `tests/layoutjournal.mjs`: an undo by (B) recorded and replayed. Effect: none (the page still drops the entries on typing until D3).

### D2. `inverse` removed

Removed: `inverse` in `settle.js`, `canonical` in `Change` and `Transition` (`shapes.js`), `back` and `byCanon` in `gap.js`, G21's branch of `transitionFacts`; the lab model keeps its own `byCanon` only while a test of the model needs it, and the twin stops drawing undos by canonical rows. `tests/layoutundo.mjs` goes, its cases that are not of the inverse path moved to `tests/layoutreconcile.mjs`; `tests/layoutundolab.mjs` keeps (A) as the lab's own copy, the comparison with the engine's gone. In `LAYOUT-MODEL.md` G21, G23 and G25 are marked «no subject since G27 (D2)», in `LAYOUT-RULES.md` the text of the inverse path goes, and the engine plan's §6.4 gets G27's text in place of «Undo after changes applied since». The same answers on every other test, checked by the sequences before and after (the seed fixed). Effect: none.

### D3. The page's structural commands as the engine's actions

The slice drops the engine's entries on anything but a carry, enter and leave. Here every structural command of the page in the engine plan's §6 table becomes an engine action whose token the page's own stack keeps (`layUndo`), and typing no longer drops the entries (G27):

- deleting a block (the menu, Backspace in an empty block, clearing the sheet), an area with its children: `remove`;
- `+`, a paste on the sheet, «блок після», an area by its button: `create` at its cell;
- converting to code or to text: a size change with the new passport, the bridge keeping the block's box by its id across the page's rebuild (today `outside`);
- collapsing and opening an area, a code block's own «more», `wrap` and `num`: a size change, written (`collapsed` and `open` are place fields);
- ungrouping: `ungroup`;
- restoring a block from «Історія»: a size change while it exists, `create` at its stored cell when it does not (engine plan §6).

The page keeps the content and the engine the places: one entry of the page's stack holds both; its undo brings the content back first (the page's own code, as today), then asks the engine, which reads the signatures of what is now on the page. `bridge.page()` keeps telling the page's commands apart as it does, and returns the token for `create` and `remove`; the page's commands that are still `outside` are listed in `page.js` with the PR that gives each an action. `doUndo`: an engine undo that is refused keeps its entry and says «Не вдалося скасувати» (a new key in `uk.json` and `en.json`; Q17). An entry passes its size to `offerUndo` (engine plan §6.4), measured on the generated note of 120 blocks against `UNDO_BYTES`.

Tests: `tests/layoutbridge.mjs`, named: each command, its undo with nothing between (exact) and after typing ((B)), an undo refused; an area deleted with a child whose chip links to a note renamed before the undo: on success the area and the child come back together, the child at the height of today's chip label, the geometry valid; on a refusal both stay deleted, nothing is written and the same entry is still on top for another try (the exact case of an area with a child, 4a, stays); the class: the page's random histories gain these commands and typing between an action and its undo, the page's blocks read afresh after every step giving the bridge's fields. Browser (`tests/applayout.mjs`): each command and its undo by Ctrl+Z, by the toast and by the header's «Скасувати»; an undo after typing in another block; a converted block keeping its place; the entry gone after a change from another tab. Effect: undo works after typing; the commands above are undone by the engine.

### D4. The view-only re-measure

Engine plan §4.3: a text size change, a font that loads after the note opened and a chip relabelled (`liveLinks`, with no `relayout` today) are a size change of every block whose signature changed, through `reconcile.js`'s pass (D1's queue), shown at once, writing nothing and making no undo entry; the stacks stay, and the entries stay too, going the (B) path since the identity is fresh (engine plan §6.4). What it moves is written with the next action in that container (§3.4). A re-measure while a carry is held waits and is applied after the drop or the cancel (engine plan §6, «Stale gestures»), the carry keeping its frozen Measure. `page.js` `remeasure` stops opening the note again (today it calls `reopen()`, which builds the tree anew and drops the history); `outside` stays for a change from outside.

Tests: `tests/layoutbridge.mjs`, named: a font that loads recomputes the live tree by size changes, keeps the undo history and writes nothing (the stored fields byte for byte, the entries the same objects); a re-measure that changes nothing keeps the identity and the exact path; one that grows a text keeps the gaps of the blocks under it that a reopening would lose; a deleted block's undo after the text size changed; a re-measure during a carry, applied after the drop and after Esc. The class: re-measures drawn into the page's histories (the stub's measure scaled), every result valid and the stored fields those of the last action until the next. Browser: the text size changed with an undo entry on the stack, then the undo; a font loaded late (a face held back by the test server) during a carry. Effect: the text size and a late font keep the note's gaps and its undo.

### D5. Temporary heights through SETTLE (G26)

The page tells the engine when a block shows rows that are not stored: a code block unfolded while it is edited (`unlock`, `lock`; today a size change). `page.js` gets `temp(b)`: the Measure is told the block changed, its answer's `shown` carrying the unfolded rows, and a size change runs through `settleTree` with no entry and no write of what the temporary rows moved (§3.4), the identity unchanged (§6.4). G26's case of a note opened with one stays as built. The provisional line of EDIT.3 uses the same path in D10.

Tests: named: a code block unfolded and folded again, every block back on its rows and nothing written; a carry while one is unfolded (a carry runs on what is shown, Q4) storing canonical rows; an undo while one is unfolded (G23's demand, now (B)'s). The class: temporary heights from `temp` drawn into the page's histories, the law that ending every temporary height gives the canonical layout. Browser: a long code block edited and left; the stored fields compared. Effect: a code block unfolded while edited pushes nothing permanently.

### D6. Opened afresh as the session left it

Two repairs that the page's random histories found (seams plan §8.1): `open()` keeps an elastic block's stored column and narrows it at the right edge where the room ends (Q16 (а), DRAG.A3's rule at the edge), instead of moving it left; and the law «the note opened afresh from its stored fields is the session's canonical layout», with a note opened with temporary rows its only exception (G26), joins the sequences, `tests/layoutbridge.mjs` 7a and 7b turning from counts into the law: 7b's expectation (column 27, width 7 once opened afresh) becomes column 28, width 6, and 7a's tolerated share of differences becomes none outside G26's exception. What is compared: the canonical layout (every block's container, column, canonical row and width; temporary rows folded) of the session after its last action against `open()` of the stored fields the session wrote, under the same Measure (the same answers by block, width and measuring version), the same rules and the same `cols`; the stacks are not compared, since `open()` builds them from places (engine plan §3.3). The page's other code that reads stored rows (`flowOrder`, `lines()`, `noteBlocks()`, `blockText`, `placeBacklinks`, `liveGeo`) reads the shown places through `page.js` (`order()`, `cell(b)`) with the switch on, so the reading order is the engine's (`LAYOUT-RULES.md` §1.1), which also fixes today's child sorted by `parent.row + row/1000` (`LAYOUT-MODEL.md` §8). Tests: the named case of 7b; the law on the page's histories and on the sequences; browser: a note reloaded after carries, every block where it stood; the export and the search reading blocks in the shown order. Effect: a reload keeps every block where it was; copy, export and search follow what is shown.

### D7. The hold and Shift (DRAG.B4)

The engine has letting through (`through.js`, phases 3 and 11). `page.js` keeps the hold point and its timer: started on SETTLE's `pressed`, restarted when `pressed` changes or the pointer leaves `STILL`; when it runs out, the carry's next change says `through: 'hold'`, and with Shift held `through: 'shift'`. `view.js` lights the pressed neighbour's outline while the time runs and while it lets the block through (VIEW.6, its minimum; the rest of the look is D11). Tests: `tests/layoutdrag.mjs` and `tests/layoutops.mjs`, named: the hold with the pointer still, the timer restarted by a move past `STILL`, Shift after a sideways move, `dir` cleared at home and at the drop (engine plan §5's step 3 list), the swap and the swap back; the class: gestures with holds and Shift in the page's histories, INV-8 (the last preview equals the drop). Browser: a hold over a neighbour and the drop; Shift; Esc during a hold. Effect: a neighbour lets the carried block through.

### D8. The width and height handles, the size menu

RESIZE.1 (the width handle, `width` through `settleTree`, every move from the gesture's start so carrying it back retraces), RESIZE.2 (a double click clears `cw`), RESIZE.3 for `ch` (released above the content it writes `ch`, below it clears it; a code block's fold as today, Q13); the size menu («Розмір») as one drop of the same change. A refused handle stops at the nearest accepted rectangle between the one asked for and the last accepted one (engine plan §4.5, `LAYOUT-RULES.md` §5.4). One gesture, one entry. Tests: named: the handle carried out and back, a set width wider than the room (refused, nearest accepted), a double click, the height above and below the content, each with its undo exact and after typing; the class: handle gestures in the sequences and the page's histories. Browser: both handles, the menu, Esc. Effect: the handles and «Розмір» on.

### D9. An area's handles; drawing an area

Both side handles (`areaSide`: AREA.3 inwards, AREA.5 outwards, AREA.6 one gesture one entry, AREA.7a outwards pressing what it reaches), the bottom handle (AREA.2: `ch` above the content; inwards it stops at the content, Q20 (а)); drawing an area on the empty sheet (`drawArea`, AREA.7b: at least 4 × 2 cells, then widened to 12, put in as a new block, the preview showing where it stands). Tests: named: the side handle left and right, inwards and outwards, a block that sinks and one refused, retrace, the bottom handle; drawing over blocks, a drawing too small; each with its undo; the class: area gestures in the sequences (with `validate`'s frame, L3) and the page's histories. Browser: each handle and drawing, Esc. Effect: an area's handles and drawing on.

### D10. Position mode's arrows; a click on the empty sheet

The arrows (DRAG.C4, W15): `ops.arrow` finds the jump's cell in the layout (left edge, the last column it fits, under the nearest block above, over the nearest below, or under the lowest) and drops a carry there at once with an empty memory. EDIT (`public/layout/edit.js`, data only, `index.html` keeping the events): EDIT.1 (what a point belongs to, `NEAR`), EDIT.2 (the cell cursor, the hover ghost gone), EDIT.4 (a click makes an empty elastic text; left empty it is taken away, and with nothing changed since, the layout before the click comes back and no entry is left), EDIT.4a (a new block carried before anything is written keeps the caret), EDIT.6, and EDIT.3's provisional line as a temporary height through D5. Tests: `tests/layoutedit.mjs` (EDIT as data), named arrows in `tests/layoutops.mjs`; the class: arrows and clicks in the page's histories, the law that a click left empty gives the tree before. Browser: the arrows of position mode; a click, Esc, a click elsewhere; a click under a text. Effect: arrows and EDIT on.

### D11. The carry's look

`view.js`: the carried block follows the pointer while its ghost stands at the target (DRAG.B4, VIEW.6); the guides; the frames of every block while a block is carried; the slide of the blocks pushed (today's `slideT`, `.shifted`); the sheet scrolling by itself at the window's edge (VIEW.9, W16); the note's width frozen for a carry. Nothing here changes a result: the journal of a gesture is the same with the look on and off. Tests: browser only, with screenshots kept as the test's output (not compared pixel by pixel): the ghost against the target, the guides, the scroll at the bottom edge. Effect: the carry looks as the mockup does.

### D12. The scale and the hand

VIEW.1 (the scale fitted to the width the note uses, W12, down to `MINSCALE`; «+», «−», «По ширині»; the sideways scroll), VIEW.1b (the hand: Space, the middle button, the toggle), W16 (the fitted scale recomputed after an action and when a note opens, not while typing). `sheetWidth` stops being a fixed width. Tests: browser at several window widths (a note that fits, one slightly wider, one below `MINSCALE`); Node for the scale's arithmetic in `view.js`'s pure part. Effect: a narrower window scales the note.

### D13. The phone and the narrow view

The switch stops being the computer's only (`LAY_ON` without `!TOUCH`): on touch the engine shows the real layout when the note fits at `MINSCALE` and the narrow view otherwise (VIEW.2–5, W13), reads, writes, deletes and creates by «+» (VIEW.4), and moves nothing; the «⋯» menu hides «Виділити», «В область…», «З області» and «Розмір» (engine plan §6.3); a hold on the empty sheet makes no block. The narrow view is drawn from the layout's reading order and measures nothing that feeds back into it (VIEW.2). Tests: browser on a phone's viewport and with `hasTouch`: the narrow view's order, typing in it, «+», «Показати як на компʼютері», a note that fits shown scaled; `apptouch`'s replaced expectations (engine plan §5.1). Effect: the engine on phones and tablets.

### D14. The dev look and «Правила»

VIEW.7 (the testing look: the gap runs with their owners, the blocks' letters, sizes, row numbers, the place a block was taken from) and VIEW.8 (`public/layout/panel.js`: every switch of `rules.js` with a checkbox, a rule whose needs are off greyed with the reason, names and reasons in the language files; a device setting in `sheet:settings`; a change opens the note again under the rules resolved, writing nothing, and drops the engine's entries). On `.dev` only. Tests: `tests/applayoutrules.mjs` as the engine plan's step 5 describes it. Effect: the list on `.dev`.

### D15. The budgets, `PRECACHE`, the scenario table

The budgets of engine plan §4.5 measured in Chromium on a generated note of 120 blocks kept in `tests/fixtures/` (opening under 150 ms with a cold cache and at most one measurement per block and width tried; a pointer move under 8 ms with a warm one; a keystroke that grows a text under 4 ms plus one measurement), recorded with the machine; a budget missed is fixed here, not waived. The layout modules join `sw.js`'s `PRECACHE`, so a tab with the switch on starts offline. The table of every browser scenario with the switch on (engine plan §5.1: kept, new expectation, replaced) in `tests/README.md`, and CI running the scenarios marked kept and new with the switch on. Tests: `tests/applayoutperf.mjs`; `appsw` offline with the switch on; the round trip of an unmoved note byte for byte. Effect: the engine starts offline.

### D16. The engine the default on `.dev`

The switch on by default on `.dev` (an absent `layout` in `sheet:settings` reads as on there), turned off by the same row («Нова розкладка (0.1)» unticked runs today's layout); `.app` unchanged. Tests: the scenario table of D15 run as CI's default; `appsettings` for the row's default. Effect: the engine for everyone on `.dev`. The owner is told before it lands, as the engine plan's §7 asks: devices and tabs without the engine keep writing pushes into notes the engine reads as places.

### D17. Today's layout code removed

Engine plan §6.2's list, the old expectations of the scenario table with them, the switch's row, and `LAYOUT-MODEL.md` §8's departures closed; `tests/lab/layout-probes.mjs` run again and recorded. After the owner has used D16 for as long as they choose (Q19). Effect: none visible.

## 5. After this plan: the release of 0.1 to `.app`

Not a PR of this plan: a PR `main → prod` when the owner asks, after the owner has used the default on `.dev`, with the two rehearsals of the engine plan's §5.1 (a copy of the exported notes edited with the engine and then with today's code; the same notes on two devices, one with the engine and one without) and the manual checks of each PR on the owner's devices.

## 6. Not in 0.1

As the engine plan's §1.2 has it, and moved there by this plan if the owner agrees: the looks of VIEW.6a (Q18). Stacks stored with the note (G12), folding as one function (A3), hidden empty lines, `SHEETW` per note, the «Правила» list on `.app`.

## Review log

(none yet)
