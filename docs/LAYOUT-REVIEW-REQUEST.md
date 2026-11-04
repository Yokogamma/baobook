# Review request: the layout engine, plan for version 0.1

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
