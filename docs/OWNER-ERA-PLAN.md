# A change of owner: the era of the data and the owner of the transaction

**Status: proposed on 2026-11-13; the contract (§3–§6) was agreed with the owner in three review passes of the architecture review of #146, and merged by #151. A preflight over main at 2ee9dfc the same day found three high and two medium gaps in paths the plan did not name (§11); they are written in below. Stage 1 (the model, `public/owner/model.js` with `tests/ownermodel.mjs`; nothing in the app imports it) is built. Stage 2 (§3.3, §3.4, §3.6, §3.7 in `public/sync.js`, used only by an engine made with `deps.era`; `tests/syncera.mjs`, `tests/syncerasim.mjs`) is built and dormant: nothing in the app makes such an engine, and §7.2 says what it holds and what it proposes to change in this text. Its user's writes (§3.3) stood three review rounds; its cloud side (§3.4) did not, and §7.3 proposes a correction of the approach that is not decided. Stage 3 follows this text, and nothing of it is implemented or tested yet.** The contract being agreed does not prove the implementation: the order of transactions, urgent saves and the behaviour of old tabs must be shown by the Node and browser scenarios of §8.

This plan replaces the approach of #146 (`fix-owner-save-race`). It keeps that PR's goal: a save made while this tab changes the owner must land, under the new owner, without locking the tab.

## 1. The problem

The device has an owner (an account). A change of owner is `setOwner` in `public/sync.js`: one readwrite transaction writes a new epoch and owner, rebuilds the queue for every note and, on `{erase:true}` or with no owner, erases every record; then the engine's memory is reset and loaded again.

Every write is checked inside its transaction against the engine's memory of the epoch and owner (`check()`). A save that reaches the store after `setOwner`'s commit and before the adopting load is refused as `epoch`, and the tab locks with the text unsaved (the fourth owner-change race, found by #143).

#146 went through five review rounds. Each fixed its findings and found new major ones in the fix.

## 2. Diagnosis

`check()` answers two different questions with one comparison:

- **The lineage of the data:** were the records this screen shows erased since it was loaded? This matters for the user's writes. It changes only when records are erased.
- **The lineage of the queue:** were the queue and the cursors in memory loaded for the owner the store has now? This matters only for the engine's own steps. It changes with every change of owner.

#146 split the memory in two (`S.epoch`/`S.owner` for the user's writes, `S.stepEpoch`/`S.stepOwner` for steps) but still answers the first question from one engine's memory: `ERASES`, `COMMITS`, `S.erasedUnloaded`, `PENDING.erase`. Together with `PENDING`, `OWN`, `allowance`, `LOADS`, `LOADP`, `S.loaded` and `S.everLoaded` these encode a state machine that is written down nowhere.

The rule «after an erase the old screen re-creates nothing» is therefore held in several places that drift apart:

- the engine's counters, only for its own erase and only while `setOwner` runs or its load failed;
- the page's `DYING` flag, only in `writeNote`;
- the `epoch` lock and the BroadcastChannel messages, for other tabs.

Paths that pass none of them, read in the code of c6f1003:

- automatic versions (`vwrite` writes through `idb.tx`, with no owner check);
- `idb.del`;
- the fallback copies in localStorage (`fbPutCopy` stamps the epoch of the current engine, not the origin of the screen; `db.move()` imports them through whichever engine runs at the next start);
- a fresh engine made in the same page (`detachEngine`): its first load accepts any owner.

A Node probe on c6f1003 showed that the engine's API accepts a `writeLocal` of an erased note after this engine's own erase succeeded, and after another tab's erase when the engine is a fresh one. This is not proof of a bug the user can reach: an API without the origin of the data cannot tell an old screen from a new note. It shows where the boundary is missing.

## 3. The contract

### 3.1 The era

1. The `sync:epoch` record gets an optional field `era`: the generation of the device's records. It changes only when records are erased (`setOwner` with `erase`, or with no owner).
2. Read as `ep ? (ep.era ?? ep.id) : '0'`. No `epoch` record is the initial era `'0'`. An `epoch` written by code before this plan has no `era` and reads as its own `id`, so new code refuses conservatively after any change of owner made by old code.
3. A change of owner that keeps the records copies the era in force into the new `epoch` record, explicitly. So a first sign-in does not change the era.
4. An erase writes a new era.

### 3.2 The era of the screen

1. The page holds the era its screen was read over. It is read **in one readonly transaction over `notes` and `sync`** together with the notes and their `lrev`. Today `start()` uses four transactions (`SYNC.reload()`, `db.move()`, `SYNC.lrevOf()`, `db.all()`); an erase between two of them would give old notes the new era, or a new screen the old one.
2. The era of the screen changes only by reading the whole screen again, that is, by a reload of the page.
3. The era of the screen is the writer's (§7.3.1), for the life of the screen; a runner has an epoch, not an era. Nothing takes its permission to write from the store as it is now.
4. Every later read that feeds the screen from the store (`takeStored`, `syncTabs`, the writer's reads) compares the era inside its own transaction. A mismatch means «the records were erased», never new data to show. What reaches the screen without a read of the store (a message of another tab) is §3.8; what leaves the page as a file is §3.9.

### 3.3 The user's writes

1. A write the user makes (a save, an import, a delete, a version, a copy's restore or removal) compares, inside its transaction, the era of the store with the era of the screen. A mismatch refuses the write (`epoch`). The one exception is the device name (`deviceName`): the `device` record is of the device, not of an era, and outlives an erase, so it is written whatever the era. Every other limit holds for it as for any write: the `format` guard, the page's lock, a frozen store.
2. The owner the write acts for is read from the store inside the same transaction. The decisions that depend on it (`ensureJob`, `queueV`, `importHistory`, `purgeLocal`, `versionLocal`, `versionStates`) take that owner, not `S.owner`. So a save ordered after a first sign-in's commit queues its `out:n:` job in that transaction.
3. The write waits for nothing: no `await load()` before its transaction, so a save made in `idbLost` opens its transaction in that task. IndexedDB itself orders it against a `setOwner` transaction in flight.
4. The writer keeps no memory of the queue, so a write has no cache to update. After its commit a signal goes to the runner (`deps.onCommit`), fired and never awaited; a signal that meets a busy runner is kept as a request for one more step (§7.3.3 item 4).
5. «Never in the cloud» is decided in `purgeLocal` by facts of the store for this epoch: no base, no `seen`, no attempt, no `refetch`, and the stored mark that this epoch's first catch-up of notes ended (§7.3.3 item 5). Without any of them a tombstone job is queued.
6. The raw writes of the page (`idb.tx`, `idb.run`: automatic versions, `idb.del`) compare the era in the same place where `fmtGuard` reads the `format` record first.
7. **The page chooses no path by the owner in the engine's memory.** Today `purgeNote()` takes `SYNC.purgeLocal()` or the raw `db.remove()` and `vdrop()` by `SYNC.hasOwner()`, read before any transaction. After a first sign-in's commit and before the load, `S.owner` is still empty: the raw path deletes the note, the era check lets it (nothing was erased), no tombstone is queued, and a document of that note in the new owner's cloud comes back. So with IndexedDB every deletion the user makes goes through the core, and «only here, or a tombstone» is decided by the owner read inside that transaction. The same holds for the other branches of the page on `SYNC.owner` or `SYNC.hasOwner()` that lead to a write: `purgeOld()` (the 30-day rule without an owner) and `fbPutCopy()` (§4). Branches that only show a state (the account panel, the status) read the store through the writer, and the status of the work from the live runner (§7.3.4 item 4). A text the user confirms an action by is not such a branch: item 9.
8. **The result of a write reaches the editor through microtasks only.** `laterSnap()` (the fix of the deleted block that came back after two saves held together, `tests/appsaveoverlap.mjs`) relies on it: the commit resolves the older write before the newer transaction's first request, which is a later task. So nothing between a write's commit and its result waits for a task: no load, no step, no `after` hook that awaits one. Item 4's signal is fired in that microtask, never awaited, and an error of it does not change the result of the write.
9. **A confirmed action keeps the reach the user confirmed.** A dialog that says how far a deletion goes is part of the action. Today «Видалити версію» asks with `hist.deleteHere` («Її буде видалено з цього пристрою») or `hist.deleteAll` by `SYNC.owner` when the dialog opens. A first sign-in while it is open, then the confirmation: the transaction reads an owner and queues a tombstone, and the deletion the user confirmed for this device reaches every device. Reading the owner again just before the dialog shows does not close this; the change can come while it is open.
   - The page passes the reach it showed (`here` or `all`) with the operation: a version's deletion, «Видалити назавжди» (`purgeLocal`, whose text names no reach but whose effect grows the same way), and any later action of the kind.
   - Inside the transaction the core compares it with what the owner it read makes of the action. Where the owner makes it reach further than confirmed (`here` confirmed, an owner in the store), nothing is deleted and the refusal has a code of its own (`reach`).
   - The page then asks again with the text of the new reach; only that confirmation deletes.
   - The same reach, or a narrower one, goes on.
   - An operation that names no reach is taken as `here`, the narrowest: a caller that forgot to say what the user confirmed never widens a deletion.
   - The reach is judged by the owner alone (`here` without one, `all` with one), not by what this deletion would do: «Видалити назавжди» of a note that never reached the cloud is still refused when it was confirmed as `here` and the store has an owner. The page then asks with the text of a device that has an owner, which is the text it would have shown had it known.

### 3.4 The engine's steps

1. A runner's identity `(epoch, env, uid, adapter)` never changes, and every transaction of it that touches the owner's data, reads included, checks the store against it (§7.3.2 checks 1 and 2).
2. The adapter is fixed for the runner's life and is of the owner's namespace; one that names none is not accepted.
3. A late network result is dropped in one of two ways. Of another epoch: by the check of its transaction. Within one epoch, after its runner ended (the lead lost, the adapter replaced): the continuation is cancelled, which is not a network error, and nothing of it is written or published (§7.3.2 checks 3–5). A decision by a server read also compares the state its request was made over (§7.3.5 item 4).

### 3.5 Two results instead of one

A runner that meets a store of another epoch or owner reports a mismatch of its identity, once (`deps.onEnd`), and the writer, which holds the era of the screen, names the result. The page's reconciliation (§7.3.4) reaches the same two results with no runner running. They are two independent facts:

- **the era moved:** the screen is of erased records. `epochMoved` takes it (a reload, or the view-only screen with the export when something is unsaved);
- **the queue is stale:** the owner changed and the records were kept. The runner has ended; the page makes the recovery read (§7.3.2), checks the account and makes the next runner. The editor is not locked.

The second path is the idempotent reconciliation of §7.3.4. The «owner» message, a `resume` check and a runner's end may start it in any order. Today `leadCheck()` turns `checkOwner()`'s `false` into `setLock('epoch')`, and the `reload` status of a step does the same, so a `resume` that comes before the «owner» message locks a tab the era check would let save.

### 3.6 `expectEpoch` stays strict

`setOwner` always takes `expectEpoch`, the epoch the user's decision was made over (`null` for a store with none), and is refused by any other epoch in the store, a change that kept the records included. Beside it and first, `setOwner` judges the era of its screen as every write does: another era is `reload` and changes nothing (§7.3.3 item 2). Replacing a stale engine repeats nothing by itself: an erase or a binding the user confirmed before is asked again over the new owner.

### 3.7 `lrev` across a change that keeps the records

Today `setOwner` writes `{...defMeta, lrev:1}` for every note, and `editorDelta` returns the editor's note without `merge3` when `E.lrev===meta.lrev`. With saves accepted in this window the numbers can collide: the screen remembers `lrev` 2, the change resets it to 1, another tab saves and gets 2, and this tab overwrites that edit.

The rule: a change that keeps the records writes `lrev` = the previous `lrev` + 1 with `baseLrev` 0. The meaning «a local change ahead of no base» stays. The `LREV` map between tabs (the «Є зміни» strip, `takeNote`) compares the same numbers, so one rule covers both places. To check with it: the metas of versions (`meta:v:`), `restoreCopy` and `undoRestore`, repeated saves.

Checked in stage 2, with two corrections of the rule (**proposed**, built that way in the mode of `deps.era`):

- **An empty note.** `setOwner` does not write a meta for every note: an empty one (no title, no blocks) gets no job and no meta, so its `lrev` falls to 0 and the same collision is open for it. The rule above cannot be used as it is: `lrev` ahead of `baseLrev` means a local change, and an empty note with one would be merged with a document of its id (`merge0`, with conflict copies) where today the document replaces it. So an empty note that had a meta keeps its number too, with nothing ahead: `lrev` = the previous `lrev` + 1 and `baseLrev` = `lrev`. It still gets no job, and a document of its id still replaces it.
- **The metas of versions start anew**, as today (`lrev` 1 through `queueV`). No screen remembers a version's `lrev` (the page's `LREV` map is of notes), and `lrev` over 1 is how receiving reads «renamed here»: kept across the change, every named version would look renamed and its name would win over the cloud's.
- `restoreCopy`, `undoRestore` and repeated saves go through `putNote`, which adds one to whatever the meta holds; nothing to change.

### 3.8 Messages between tabs

Today a `put` message carries the note itself (`{n, lrev}`), `takeNote()` puts it on the screen without a read of the store, and the messages that come during a start wait in `TABQ` and are applied after the screen is read. A `put` of the old era queued by a starting tab, then an erase in another tab, then the start reading the new era, then the queue: the old note lands on the new screen and is saved under the new owner. The era of the store and of the screen agree, and the content is of neither.

1. Every message about records (`put`, `del`, `chg`, `gone`, `copy`, `copies`, `ver`, `vput`) carries the era of the sender's screen.
2. A message whose era is not the era of this screen is not applied, when it comes and when `TABQ` is emptied alike. It starts the check of §3.5 instead: either the era moved here too, or the sender is the stale one.
3. With IndexedDB a `put` is a notice: the receiver reads the record from the store in a transaction that compares the era (`takeStored`), and takes no content from the message. Without IndexedDB (the localStorage mode) there is no erase and one era, and the content is taken as today.
4. A message without an era (a tab of code before this plan, stopped from writing by §5) is a notice at most, never content.
5. After a recovery read (§7.3.2) that found a change, the page tells the other tabs to read the store: a notice, by item 3.

### 3.9 Reads handed to the user

The rule of the era covers every read that hands records to the user, not only those that feed the editor. Today `exportAll()` takes the notes from the page's memory and `historyOf()` reads every record of `versions` and `blobs` in raw readonly transactions that pass no check. A screen of A that stays locked after an erase, with its text unsaved, would export A's notes with B's history.

1. The raw reads of the page (`idb.tx` readonly: `historyOf`, `vlist`, the counts of copies) compare the era as the raw writes do (§3.3 item 6).
2. `historyOf()` reads the versions, the bodies and the era in one transaction.
3. On a mismatch the export still gives what the old screen holds (its notes, the unsaved text included) and no history, and says so. It never mixes in records of another era.

## 4. Fallback copies in localStorage

1. **New copies** always carry the era of the screen, with an owner or without: the wrapper `{era, note}` under the `FX` prefix. New code no longer writes a bare `NK+id~TAB~g`.
2. A copy's era is never replaced: not at a retry, not after a reload.
3. `db.move()` compares the copy's era with the store's inside the transaction of the import; `fbRead` compares it for showing.
4. **Old copies without the mark** move in by themselves only where their origin is proved, each kind by what it carries:
   - an `FX` record with only `epoch` (written by old code on a device with an owner): its `epoch` is the id of the store's `epoch` record, so the owner did not change at all since the copy was made. The era cannot be asked here: a device with an owner has an `epoch` record, old code wrote it without `era`, and it never reads as `'0'`;
   - an `NK` key with `~` (written by old code without an owner): the era of the store is the initial one (`'0'`), so no erase ever happened on this store. A device signed in by old code since then reads as an era of its own, because an old sign-in and an old erase leave the same record; such a copy is held, on the safe side.
5. **Every other old copy** stays in localStorage and is offered in a separate restore with the export. It is never given the current era.
6. **Plain keys `NK+id`** of the mode without IndexedDB are that mode's storage, not copies; nothing erases there. When IndexedDB appears they move in by rule 4.

A side effect to keep: today `fbRead` compares the copy's epoch with `SYNC.epoch`, so a copy made before a change that kept the records reads as nothing afterwards. Compared by era, it is read.

## 5. Compatibility and the release

Who changed the owner, against who writes afterwards from a screen loaded before:

| The change | An old tab writes | A new tab writes |
|---|---|---|
| old code, records kept | refused `epoch` | refused (the era reads as the new `id`) |
| old code, erase | `check()` refuses; raw writes pass | refused |
| new code, records kept | refused `epoch`; would reset `lrev` if it changed the owner itself | accepted |
| new code, erase | `check()` refuses; **raw writes pass** | refused |

`era ?? id` protects a new tab from an old write, not the store from an old tab. So the release carries a barrier (the owner's decision of 2026-11-13):

1. **`FORMAT` 4 → 5**, recorded at the start of the new build. A tab with the format guard (IDB-BARRIER-PLAN PR 2; `.app` has it in build 2026111201) refuses its writes and turns view-only.
2. **`IDB_VER` 4 → 5, once**, with no new store or index. A tab of code before the guard does not read `format` before a write; IDB-BARRIER-PLAN §8 question 4 says such a change raises `IDB_VER` once more. The upgrade fires `versionchange` in every open tab of older code: a live one closes its connection and turns view-only; a frozen one makes the upgrade wait, with the waiting strip of that plan's PR 1, and the start goes on by itself.
3. The barrier is raised at the release, not at the first erase: it is needed for a change that keeps the records too, or old code would reset `lrev`.
4. **A rollback is a fixed build that understands format 5.** The format number never goes back without a separate proof of compatibility.
5. Before the release the owner exports the notes from `.app`, and the upgrade is checked on `.dev` with a copy of them, as for every release that changes storage.

Export files are not affected: the era is not part of a note.

## 6. What goes and what stays of #146

- **Stays:** the tests of #146 (the `syncguard` 5s* cases, its additions to `appleadbind`, and `emu/erasefail`; main has `appleadbind` without those additions, no 5s* case and no `emu/erasefail`) carried over for the new mode, with the expectations of §8.3; the forced account check that runs again after one in flight (d6e0ab1); the browser guarantees written for the adopting load, moved to a successor runner that fails to start. `committed` has no subject any more: `setOwner` loads nothing, and its result says the commit happened.
- **Goes:** `adoptOwner` at the commit, `S.stepEpoch`/`S.stepOwner`, `ERASES`, `COMMITS`, `S.erasedUnloaded`, `PENDING.erase`.

## 7. Stages

Each stage is a PR into `main`. New code is ES modules in `public/owner/`; `index.html` only wires them in.

| Stage | What it holds | What proves it |
|---|---|---|
| 1. The contract and the model | the rules of the era and of the two results as pure functions (`public/owner/model.js`); the compatibility table as cases | Node tests |
| 2. Transactional writes, dormant | §3.3, §3.4, §3.7 in `public/sync.js`, with the 5s* cases of #146 carried over for the new mode and read again by §8.3 (some of them test the fix of the race, which the old mode keeps), used only by an engine that is given the era of a screen (`deps.era`); the page gives none yet, so the checks of main stay in force and no `setOwner` of the app writes `era` (an engine with `deps.era` writes it: §7.2) | Node over `MemStore` with `deps.era`; without it, the whole suite of main as it is (main has no 5s* cases: they come from #146) |
| 3. The page, and the switch | §3.2 (one read at start), §3.3 items 6–7, §3.5, §3.8, §3.9, §4, the urgent save; the page gives the era, `setOwner` writes `era`; `FORMAT` and `IDB_VER` 5 | browser scenarios (§8.2) |
| 4. The engine made simpler | a separate PR after the others are green: the branch without an era deleted, and with it `PENDING`, `OWN`, `allowance`, `LOADS` and the adopting loads, which live only there (§7.3.1 item 3) | late loads and callbacks do not spoil a new memory; a save still waits for nothing |

Each PR into `main` is deployed to `.dev`, so «released together» is not enough: no state of `main` may write the new contract or loosen an old check without the page and the barrier. Stage 2 therefore adds code that nothing in the app switches on, and stage 3 switches everything on in one PR: the era from the page, `era` in the store, the raw reads and writes, the messages, and `FORMAT` and `IDB_VER` 5. If the dormant form of stage 2 turns out to cost more than it saves, stages 2 and 3 become one PR; they are never two active halves.

### 7.1 How the model reaches the core (stage 2; the owner's decision of 2026-11-13)

1. The model reaches the core through `deps.ownerModel`: the exports of `public/owner/model.js`, handed to `makeSync` by whoever makes the engine. With an era `makeSync` gives the writer, and the writer makes its runners (`runner({cloud})`), each with the same model. `public/sync.js` stays a classic script and imports nothing.
2. Without `deps.era` the engine behaves exactly as on `main` today: the same checks, the same waits, the same records. This is the dormant stage 2, and every existing test passes over it unchanged.
3. With `deps.era` (the writer, and so its runners) the model is required. A missing `deps.ownerModel` (or one without a function the core calls) is an error thrown by `makeSync`, never a fall back to the old checks.
4. The model is loaded before the engine is made. Nothing on the write path imports dynamically or waits for a load.
5. `deps.era` is the era of the screen (§3.2), and it is the writer's. Nothing refreshes it from the store. A runner has no era: it is made over the epoch and owner the store has then. A new screen is a new writer made with the era that screen was read over.

### 7.2 What stage 2 built (2026-11-13)

Everything below is in `public/sync.js` behind `deps.era`. Without it no line decides differently from main: the existing Node suite passes with the same output, and the page makes its engine as before.

**The user's writes (§3.3).** `writeLocal`, `purgeLocal`, `purgeOldLocal`, `importNote`, `importMany`, `importHistory`, `versionLocal`, `restoreCopy`, `undoRestore`, `dropCopies`, `putCopies`, `unqueue`, `deviceName` and the `typed` mark go through one transaction of their own kind (`utx`):

- it is opened in the call, with no load before it (item 3);
- it reads the `epoch`, `owner` and `device` records first; the era is judged by `judgeWrite` (the device name excepted, item 1), and a mismatch is the refusal `epoch` with the status `reload`;
- every decision inside takes the owner that transaction read (`ownerIn(t)`: `ensureJob`, `queueV`, the versions that follow a deleted or revived note, `importHistory`, `vdeleteLocal`, `versionLocal`, `purgeLocal`; item 2);
- the work queued for after the commit is of two kinds: cache updates (`after`), applied only when the memory is of the epoch and owner the transaction read, and events for the page (`after.ev`), which always go (the device name and the size hint of a deleted note go with the events: neither is of an epoch). A memory of another epoch is marked not loaded, as a flag (items 4 and 8). The steps' own transactions follow the same rule;
- `purgeLocal` counts `S.everCaughtUp` only for a memory of the transaction's epoch (item 5), takes `{reach}` and refuses with `reach` (item 9); `versionLocal` delete takes `reach` the same way; `purgeOldLocal` does nothing once the store has an owner (item 7);
- the mark `loop` of a note is lifted by `typed()` and by nothing else, by the store's word: with an era `typed()` always opens its own transaction (the page calls it once per note when the note turns dirty, not per keystroke), reads the meta there and lifts the mark whatever the memory holds. A save does not lift it: a write nobody typed for (a pin, an import) says nothing of a loop.

**The steps (§3.4).** They keep main's check against `S.epoch` and `S.owner`, which only a load moves. Three things are added:

- the queue is read again (`reloadQueue`) only for the epoch and owner of the memory. This was a major of main that the independent review of this PR found (a stale engine took the new owner's unresolved attempt and sent its text through the previous owner's cloud); main fixed it for the mode that runs today in #157, with an attempt of another epoch never sent and a step that does not run across the engine's own change of owner. This branch takes that guard as it is; with an era its answer is one of three: this engine's own change that kept the records is `own` (quiet, the step asks to be run again in 50 ms, so the page's timer is not lost), its own erase is `reload` with no time asked for, another engine's change that kept the records is `stale`; the marks of the queued jobs are read in the same transaction;
- a cloud adapter that names another user than the owner (`cloud.uid`) is not used: no step, no listener, no send (item 2);
- nothing of the previous owner's cloud outlives a change of owner. The engine keeps a **generation** of its cloud work, moved inside the transaction that changes the owner (so before the adopting load), by `setCloud`, by `start` with another adapter and by `reload`. A step keeps the generation it began under, and under another one none of this is applied: a transaction of the step is refused (the rest of a page already fetched, a cursor, a refetch, a scan), the answer or the refusal of a cloud call is dropped as a lost call (a «permission-denied» of the previous adapter does not deny the new owner), a delivery waiting in the inbox is dropped, a listener's callback does nothing. The listeners end with the change, and with a refusal that tells the page to replace or reload the engine. The check of the memory inside a step's transaction is not enough: after the engine's own change the memory is the new owner's;
- an adapter that names no user is bound to the epoch it is first connected under and is not used under another; after a change of owner the page hands a new adapter. So every adapter an epoch may use is its owner's, and a version that waits for its note (`S.waiting`, `meta.wait`), which names no adapter, is of the epoch its meta is of;
- the marks that block a queued job (`meta.err`) are read again with the queue, so a leader learns that another tab lifted one;
- a step that meets another owner's store ends idle instead of failing with a growing pause.

**The two results, as far as the core reports them.** §3.5 is stage 3, but a core that accepts saves after a change that kept the records cannot go on saying `reload` for it. So with an era a refusal by the memory (a step, a load) reports the status `reload` when the era moved and a new status `stale` when only the queue is of another owner; a step refused by the owner this engine's own `setOwner` is writing reports nothing. The page reads neither yet. What `checkOwner` returns is unchanged and is stage 3's.

**The reads (§3.2 item 4, for the engine's `rtx`).** `versionStates` is named by §3.3 item 2, and a read that waited for a load would be refused by a queue that is stale, which is the false lock the plan removes. So with an era the reads of the core (`versionStates`, `state`, `lrevOf`, `seenAll`, `copiesCount`, `countCopies`, `unsynced`) wait for no load, compare the era in their own transaction (`judgeRead`) and take the owner they read.

**The change of owner.**

- An engine with `deps.era` writes `era` in the `epoch` record (`nextEpoch`): the matrix of §8.1 cannot be run otherwise, because an `epoch` without `era` reads as a new era and column (a) would be refused. An engine without `deps.era` writes none, as main. Stage 3 changes which engine the page makes, not this.
- `expectEpoch` is main's comparison, through `expected` (§3.6).
- `lrev` is kept as §3.7 now says.
- `setOwner` loads nothing before its transaction: the epoch and the owner are read there, so a memory of another owner, or one a write marked not loaded, does not refuse the change before `expectEpoch` is judged.
- «The same owner again» is read from the store alone, never from the memory. The store names another owner than the one asked for: a change of its own (a new epoch, the queue rebuilt, the era kept), also when the memory names the owner asked for. The store already names the owner asked for: no new epoch, and the queue and the registry of deletions stay, also when the memory names another owner; then only the memory is read anew. Whether the memory must be refreshed and whether the epoch must be made anew are two questions.
- An error of an adopting load, the one that only refreshes the memory included, carries `committed` and `erase` (§6), a copy of it when the error is frozen. The owner being refreshed is registered as this engine's own, so a step beside that load is refused quietly.

### 7.3 The engine's cloud side: a writer and runners (proposed on 2026-11-23, amended on 2026-11-26 after each of three independent reviews of the text; cleared for building by the fourth look on 2026-11-26, which the owner passed on; being built in this PR)

**Why.** Three rounds of the independent review of this stage found 3, then 6, then 6 high and 4 medium findings, and from the second round on nearly all are of one kind: work of the engine's cloud side (a step, a fetched page, an answer, a listener, a delivery, an attempt) that began under one owner or adapter and ends under another. Each round's fix closed the sequences it was shown and left the next: the origin checked at the answer (round 1), then a generation checked at the start of a transaction and by hand after some awaits (round 2). This is the pattern of #146 (§1), moved from the user's writes to the steps. The cause is that with an era the engine still **adopts** a new owner and a new adapter in place, so one memory and one set of in-flight work serve several owners in turn. The user's writes no longer depend on that memory (§3.3), and no round found a hole in them.

**Two reviews of this section.** An internal design review of its first wording found the direction right and four places where the memory or the adapter could still move. The independent review of the second wording (at deb79ea) gave the verdict «build after amendments»: the split removes the main cause, but an epoch that never moves guards only the border **between owners**. Across a change of adapter or a hand-over of the lead within one epoch the old and the new runner pass the same check, so ending a runner and dropping its continuations is part of the safety contract, not hygiene. The text below is written to that. Its second look (at ed1f4ae) found the split standing (a fixed adapter, a cancelled late answer and one initialisation close the main races of the earlier rounds) and asked for rules where the text only named a guarantee: what the screen reads after an admitted commit, the era of the screen in the reconciliation and in `setOwner`, the work a runner starts through hooks, a full pass under two runners of one epoch. Its third look (at 1175fe2) found the architecture ready and two rules of a hand-over missing: who restores the screen when the tab of the runner that ended is gone, and a late server read while both runners of an epoch live. The rest it left to the implementation and its tests (§7.3.9). They are below.

#### 7.3.1 The two objects

1. **The writer** lives as long as the screen and is never replaced. It holds the user's side as built: the writes of §3.3 and the reads that feed the screen (`versionStates`, `unsynced`, `state`, `lrevOf`, the counts of copies), each in its own transaction, by the era, with the owner read there. It has no memory of the queue, loads nothing and makes no cloud call. `setOwner` and the check «is the store still this owner's» are the writer's.
2. **A runner** is the cloud side, and it is of one `(epoch, env, uid, adapter)` for its whole life:
   - it is made for an epoch and an owner (`deps.epoch`, `deps.owner`) with its adapter; the adapter names its namespace (`env` and `uid`, as `public/cloud.js` binds its `root`), and it must be the owner's. An adapter that names none is not accepted with an era; the tests' adapters name theirs;
   - it has **one initialisation**, one shared result: the load that reads the queue for that epoch. A store of another epoch or owner fails it as a mismatch of its identity (the runner knows no era; the writer says which of §3.5's two results that is, §7.3.4 item 3); a storage error fails it and leaves the runner unusable; the page makes another by §7.3.4 item 6, not at once. No step, listener or `start` acts before it succeeds, and nothing loads again afterwards: `reload`, a second `start` with another adapter, `setCloud` and `checkOwner` do not exist on a runner;
   - `tombstoneAuto` and every other step-only operation belongs to the runner and runs only inside its own step.
3. `PENDING`, `OWN`, `allowance`, `LOADS` and the adopting loads stay **only in the branch without an era**, as on main, until stage 4 deletes that branch. A runner has none of them.

#### 7.3.2 What safety rests on

Five checks, and nothing else of rounds 1–3 (no `S.stepGen`, no stamps on deliveries, no adoption in place):

1. **The identity never changes.** A runner's `(epoch, env, uid, adapter)` is fixed when it is made.
2. **The owner is checked inside every transaction of the runner that touches the owner's data**, reads included: the reads a runner bases cloud work on (`runSend`'s and `runVSend`'s state, `seenTotals`, `autoPurge`, the queue) compare `(epoch, env, uid)` in their own transaction, as the writes do. A mismatch ends the runner. This is the border between owners: a memory that never moves cannot match another epoch.
3. **Life is checked on both sides of every cloud call.** Before the call, an ended runner makes none (and opens no listener). After the answer, an ended runner's continuation stops with a result of its own, **cancelled**, which is not a network error: no `denied`, `reauth` or `unverified`, no `backoff` written, no count, no retry, no memory update, no local transaction, no event. The callbacks of a listener check it the same way.
4. **Life is checked when a local write is admitted**: inside the transaction, beside the owner check. An ended runner's transaction is refused there.
5. **The instance is checked before any effect is published**: an event to the page (`onChange`, `onHistory`, `onStatus`), a wake, a status. An ended runner publishes nothing. The one notice of its end (§7.3.4 item 3) is not such an effect: it goes through a callback of its own (`deps.onEnd`), once, whatever the statuses of its last step.

What these cannot do, and what covers it:

- **A request already sent** may complete on the server after its runner ended. The guarantee there is the fixed namespace (it is this owner's cloud) and the attempt protocol: the `try:` record stays in the store with its `op`, and the successor resolves it by the same `op`, `devId` and receipt, as a second runner of one attempt does today (§4.5 of SYNC-PLAN). `devId` is the store's `device` record, so it survives the hand-over.
- **A transaction already admitted when the runner ends** (it passed checks 2 and 4, and has not committed) **may finish**. What it commits is this owner's data, checked; its runner publishes none of its effects (check 5). So that the screen does not keep what it deleted or miss what it wrote, two rules:
  1. every writing transaction of a runner has the `sync` store in its scope;
  2. **the recovery read** is made by the page after any runner of its own ended, a successor or not (an adapter taken away with none to follow included), **and by a tab that is granted the lead, before it makes a runner, whether it ever had one**: the tab of the runner that ended may have closed at `pagehide`, its admitted write committed and no one told. A recovery read cut short by a freeze is made again at `resume`. The lock's hand-over waits for nobody. It is one transaction over `sync`, `notes` and `versions`, opened after `end()`. IndexedDB starts it after every writing transaction with an overlapping scope that was created before it, so after the admitted one. It reads the records and their `lrev` together, a record that is no longer there counted as a change; `lrev` alone is not enough, since a second delivery of the same revision passes with no event. What differs from the screen is applied by the rules the page has for a change that came from outside (the unsaved text of the open note is protected as today), the history and the counts of copies are read again, and the other tabs are told to read the store (§3.8).
- **Work a runner starts through a hook.** A runner awaits nothing of the page that opens transactions of its own under the runner's name. `deps.sweep()` (the clearing of old history when the store is full) is the page's maintenance: its transactions are the writer's, by the era, with the owner read there, safe whatever became of the runner; the runner treats the call as a cloud call, with check 3 after it. What `onHistory` or `onChange` queued in the page before the runner ended is the page's too, and goes through the writer the same way.
- **Between another tab's change of owner and this runner's first checked transaction** the runner may still make calls. They are of data read under its own epoch, to its own namespace, as §3.4 item 3 agreed. Not a hole; an Auth error alone ends nothing.
- **The quota record** is of the device, not of an owner, and is written today as a snapshot of memory with no check, so an old step's last flush can overwrite a newer count. With runners it is written as a delta inside a transaction: read the record, add, write.
  - The delta is what the runner spent since its last successful flush: its steps' reads and writes, and the reads of its listeners, which are counted outside a step and wait for the next flush.
  - A flush that fails keeps the delta for the next one.
  - The day is the day at the flush: the transaction resets a record of another day and then adds. A call that crossed midnight is counted on the day it is recorded.
  - `lastSend` is merged as the later of the two.
  - A flush already admitted may finish, by the rule above. After `end()` no flush is opened: the delta the runner still held is lost. That undercount, of whatever was not yet flushed, is the accepted bound.
- **The `format` record** is not a runner's to write: it goes to the start barrier of §5 (the page), where the other `FORMAT` writes are.

#### 7.3.3 The writer in detail

1. **`setOwner`** commits its transaction and returns `{epoch, changed, erased}`; it loads nothing. The queue is rebuilt, `lrev` kept by §3.7 and every `meta:` (with `meta.wait`), `try:` and cursor of the previous epoch deleted, all in that transaction, as today.
2. **It checks two things, apart.** First the era, as every write of the writer does: its own era, which never changes, against the store's, inside the transaction. Another era is `reload`, and the owner is not changed: a screen of erased records changes nothing, an erase included. Then **the epoch the decision was made over** (`expectEpoch`, always given, `null` for a store with none): any other epoch in the store refuses it (§3.6). A fresh `expectEpoch` proves what the user saw in the dialog, not that this screen may act, which is why the era is checked by itself. A dialog takes the epoch when it is shown, with the owner and the counts it shows, not after the confirmation: «Прибрати нотатки з пристрою» today reads the epoch after `saveNow()`. A refusal by the epoch asks the user again; nothing is retried by itself.
3. `changed` is false only for an ordinary bind, with no `erase`, of the `(env, uid)` the store already names: the owner record is rewritten (a new email), the epoch, the queue and the registry of deletions stay. The page still compares the returned epoch with its runner's.
4. **After a write of the writer commits, a signal goes to the runner** (`deps.onCommit`; the page turns it into the runner's `nudge` and a wake, as it does today for a message of another tab). It is fired, never awaited: the result of the write does not wait for it (§3.3 item 8). This replaces §3.3 item 4: the writer has no cache to update. **The signal is not lost on a busy runner**: a signal that arrives while a step runs, also after the step computed when to run next, is kept as a request for one more step after this one, and the step's answer then asks for it at once. A signal with no live runner needs nothing: the next runner's initialisation reads the queue.
5. **«Never in the cloud»** (§3.3 item 5) is decided by facts of the store for this epoch only: no base, no `seen`, no attempt, no `refetch` waiting on the note, and the mark that this epoch's first catch-up of notes ended. Without any of them a tombstone job is queued. The mark is the runner's, kept with the notes' cursor and deleted with it at a change of owner; it is set only by a pass that was accounted to its end. It says what the device has seen, not what the cloud holds (SYNC-PLAN §4.6 already says the end of the pages proves no absence), and an incoming note whose write failed leaves `refetch`, which is why `refetch` is a fact of its own here.
6. **`typed`** lifts `loop` in its own transaction, by the store, and separately passes the hint «typed» to the runner (the runner's loop detection reads it). The hints of a runner that are of no owner (`typed`, `bytes`, `left`) are lost when it is replaced: the size is measured again from the record at the next send, and a note the user left is sent at the ordinary pace once.
7. The device's name is written by the writer whatever the era (§3.3 item 1), and a runner reads the `device` record at each step that stamps a document.

#### 7.3.4 The page (stage 3; written now because the runner's shape depends on it)

1. **One idempotent reconciliation** decides whether this tab has a runner and which. **It judges the era first**, through the writer, runner or no runner: a store of another era than the screen's is `reload`, and no runner is made. A tab with no adapter that missed the message of an erase is caught here, at `resume`, and not handed a runner of the new epoch over its old screen. Its other inputs are read fresh each time: the store's epoch and owner (through the writer), the adapter the account has now, and the lead this tab holds (with a generation of the lead). It ends a runner whose `(epoch, env, uid, adapter)` or lead generation is no longer those, and makes one when the tab leads, the store has an owner and the adapter is that owner's. After every wait inside it the inputs are read again. There is at most one runner, live or being made, for the current context: a second call while one is being made waits for that one. A loss of the lead or of the adapter that the page knows of ends the runner at once, before the reconciliation is awaited.
2. It runs after: the lead is granted or lost; a bind or an erase of this tab; a change of Auth or of the adapter; an «owner» message; `resume`, `pageshow`; a runner that ended by itself. So a first sign-in in a tab that already holds the lock gets its runner at the bind, and a continuation of `dropCloud()` that resumes after a new adapter appeared ends nothing of the new context.
3. **A runner reports its end once, with the reason** (`deps.onEnd`): a mismatch of its identity with the store; the lead lost; the adapter taken away; a storage error; ended by the page. The runner does not tell `stale` from `reload`, having no era: on a mismatch the writer judges the era of the screen. Another era is `reload` (the existing path: save the draft, export, reload); the same era is `stale` (the queue is another owner's: the recovery read, a check of the account, nothing locked). These are §3.5's two results. Statuses, timers and `finally` blocks of the page compare the runner instance, since the writer is the same object throughout.
4. Where the page decides by the owner or the epoch, it reads the store through the writer, not a runner's memory. The status of the work is the live runner's; with no runner the panel reads the queue from the store.
5. After the tab's own erase the page reloads: only a new screen reads the new era (§3.2 item 2).
6. **A runner whose initialisation failed on storage** is not replaced in a loop: the next one is made when the storage answers again (the probe of IDB-FALLBACK-PLAN) or after a growing delay, and by any other trigger of item 2.
7. **The recovery read** of §7.3.2 runs after any runner of this tab ended and when this tab is granted the lead, before the next runner is made and also when none will be.

#### 7.3.5 Runners of one epoch

1. The inbox is the instance's and is dropped at its end. `meta.wait` is in the store and is read by the next runner: right because every adapter of an epoch is of one namespace (§7.3.1 item 2), so a new adapter object is a new session of the same cloud.
2. **A stored wait is woken by the store, not by a delivery.** The runner that committed the parent note may end before it wakes the version, the parent may lie outside what is delivered again, and `seen:v` already counts the waiting version, so equal totals wake nothing. At its initialisation and at every read of the queue a runner finds the `meta.wait` whose parent is stored and applies them. The same read frees a queued version held for its note (`vblocked`) when the note's meta shows it sent, whoever sent it. Both cover a parent written by another live runner.
3. **Without Web Locks** two live runners of one epoch can step at once, and no local «ended» tells them apart. Attempts are idempotent by `op` and receipt; the cursor never moves back (the stored one decides); the queue is read again from the store. A full pass needs more than a name in `scan:`:
   - **a pass is claimed in a transaction**, which writes a token unique to the pass only if `scan:` is free or no longer fresh; every update of the position and the end of the pass compare the token in their transaction, and a runner whose token is gone drops its pass and writes nothing of it, a late total included;
   - a pass whose runner left is continued from its stored position under a new token, the next day as SYNC-PLAN §4.6 has it, not started anew;
   - **a record the pass would call missing is confirmed before its meta is changed**: by a read of that one document, and in a transaction that checks the token and that the record has no job, no attempt and no change since the pass began. One that fails any of it is left for the next pass. So a version received by another runner behind the pass's position, and then queued for deletion by the user, is not declared missing and its tombstone is not dropped. The cost is one read for each candidate, and candidates are rare. The token is compared also in the transactions that apply the pass's pages.
4. **A server read is not acted on when the store moved under it**, in a pass or out of one. Runner A reads `null` for a document that left the cloud and is delayed; runner B restores the document, and the user queues its deletion; A is alive and of the same epoch, so no check of §7.3.2 stops it, and receipts do not apply yet. So every decision by a server read that resets `base` or `seen` or takes a job away (`vanishedTx`, `vprepareTx` and their kin) compares, in its writing transaction, the state the request was made over: the record's base and `seen`, its job and its attempt. If any changed, nothing is decided: the document is read again, or the job is left to the next step.

#### 7.3.6 The agreed text this changes (applied to §3, §6, §7.1 and §8 on 2026-11-26)

- §3.2 item 4 and §7.1 items 1, 3 and 4: `rtx`, `makeSync` and the passing of the model are written for one engine; they become the writer's reads and the two objects, each given the model.
- §3.2 item 3 and §7.1 item 5: the era of the screen is the writer's, for the life of the screen; a runner has an epoch, not an era.
- §3.3 item 4 becomes the signal of §7.3.3 item 4; item 5 becomes §7.3.3 item 5; items 7 and 8 lose the status read from the engine's memory and the «not loaded» flag (the writer has neither).
- §3.4 items 1 and 2 become §7.3.2: «a step compares with one memory that only a load moves» is «a runner's identity never changes, and every transaction of it checks the store against it»; item 2 is «the adapter is fixed and of the owner's namespace». Item 3 is rewritten: a transaction refused by the epoch does not describe an answer cancelled within one epoch.
- §3.5: a runner reports a mismatch once, and `stale` and `reload` are the results of the writer's check after it; the reconciliation is the idempotent path, and it finds a change by the writer with no runner running.
- §3.6: `expectEpoch` is always given, and the era is checked beside it.
- §3.8: the notice to the other tabs after the recovery read.
- §6: `committed` on the error of a change whose load failed has no subject (there is no load in `setOwner`; the page knows the commit happened). The forced check of the account after one already running stays. The browser guarantees written for the adopting load move to a successor that fails to start.
- §8.1–§8.3: column (a), the `5s*` cases and the list of carried cases, by §7.3.8.
- Stage 4 in §7 shrinks to deleting the branch without an era, and the closing line of stage 2 says that `PENDING` and its kin stay only in that branch.
- §4, the barrier of §5 and the `lrev` rules of §3.7 stay as they are.

#### 7.3.7 What it does not answer, and is fixed apart

- A note already dirty when `loop` is set gets no new `typed()` until it turns dirty again. Apart; what the split itself keeps is that `typed()` lifts a stored `loop` through the writer.
- `sendDelay` on a stale size and send time. Apart; the rule to keep is that the size is known before the delay is chosen, so a new runner measures it from the record before a note's first send.
- `opts.erase` read before the transaction: compatibility of the branch without an era.
- No longer here: a queued version left in `vblocked` after another runner sent its note. §7.3.5 item 2 frees it, since two live runners of one epoch must make progress.

#### 7.3.8 Staging and tests

Stage 2 stays dormant in `public/sync.js`: the writer and the runner behind `deps.era`, the code of the generation, `BOUND`, `swapCloud`, the refreshing load and `adopting()` removed before it merges. Node proves the borders of the two objects, the tests making the next runner themselves; stage 3 switches on the page, the messages and the format barrier in one change. Nothing in the page passes `deps.era`, so no state of `main` is unsafe.

What `tests/syncera.mjs` keeps and loses. Lost: 5s10 and the part of B19 that is `committed` (its update of the email over an epoch that stays is kept), and B14's rebinding of an unnamed adapter (B14a stays, as an adapter taken away with its listeners closed). Kept with another mechanism: from 5s6–5s8 and 5s9a, the order of a write against an erase and the refusal of an old screen; from B7 and B12, the choice by the store's owner and an epoch, a queue and a registry that stay at a repeated bind; from 5s3 and B20, no cloud work and `stale` against `reload` (no `own` answer); B11, B11a–B11c and B13–B15 rewritten on the end of an instance, with the guarantees they have now; B16 and B17 as `loop` lifted in a transaction, by typing alone; B18 as the strictness of `expectEpoch` and an epoch that stays at a repeated bind. Column (a) of §8.1 is «through the writer, after the commit of a change that kept the records».

New cases, each with a barrier at three places (before the call is made; on a call already out; between a local transaction's check, its commit and the publication of its event):

- a late success and a late refusal of an ended runner within one epoch: no finish of the attempt, no `backoff` written, no `denied`, no event;
- the same attempt resolved by the successor through its `op` and receipt;
- a runner made for one epoch over a store of another, and a read that bases cloud work on the store after the owner changed;
- an admitted chunk that commits after `end()`: the records are there, no event from the old runner, the successor reads them;
- `meta.wait` across a hand-over; the quota as deltas (an old step's end does not lower a newer count); a new runner's inbox untouched by the old one;
- a bind that is refused or aborted leaves the previous runner working; `tombstoneAuto` outside a step of its runner is not possible;
- an admitted deletion that commits after `end()`: the records are gone and the old runner gives no event (stage 2); the recovery read taking it off the screen and telling the other tab is a browser case of stage 3;
- a stored wait whose parent was committed by a runner that ended, with no second delivery of the parent; a version in `vblocked` whose note another runner sent;
- a signal of the writer while a step that already answered «nothing to do» is still flushing: the next step runs;
- a late total of a pass whose `scan:` another runner claimed; a version received behind the pass and queued for deletion is not declared missing;
- between the snapshot of a dialog and its confirmation, two cases apart: another tab's change that kept the records (refused by the epoch, asked again, no `reload`) and another tab's erase (refused by the era first, `reload`); and `setOwner` from a screen of another era with a fresh `expectEpoch` (`reload`, no change). The dialog reads the era, the epoch, the owner and its counts in one snapshot;
- a late `null` of a server read after another runner restored the document and the user queued its deletion: the tombstone stays; a tab granted the lead after the leader's tab closed over an admitted write makes the recovery read first;
- the sweep called by a runner that ends during it: nothing of the runner's is written after, and the sweep's own deletions are judged by the era.

Stage 3 adds, in the browser: a first connection in a tab that already holds the lock; a re-sign-in of the same user; a refused bind; the lead lost during a runner's initialisation; a tab with no adapter that missed an erase and resumes (`reload`, no runner); a storage error at initialisation that does not loop.

#### 7.3.9 Pinned by the implementation and its tests (the third review)

- **The recovery read.** `sync` in the scope and a read opened after `end()` order it after any number of admitted writes, the quota's flush included. An initialisation's read begun earlier may run beside it; its result is dropped when the runner has ended. For a dirty open note the page's existing rules serve, and the test tells two cases apart: an outside update, which waits for a safe point and does not move the revision of the old snapshot, and a confirmed purge, which keeps the unsaved text by the path that restores a note. `syncTabs()` alone does not cover the second.
- **The budget of a full pass.** Confirming candidates is part of the same stored pass: a `get` spends its remainder; when the last page used the day's budget, the phase and the position are stored for the next day. Only an answer «no such document» confirms an absence; an error leaves the candidate unconfirmed. The pass is complete after its candidates.
- **The sweep.** The dependency runs from the runner to the page's maintenance; a user's write still opens its transaction at once and waits for neither (§3.3 item 8). Life is checked before the call and after its success or its error. The sweep checks its candidates and the references to blobs again inside the deleting transaction: the era check does not refresh a list computed before a wait. An error of `onCommit` does not change the result of a write.
- **`vblocked` and `meta.wait`.** A held create or rename is freed when its living parent has a confirmed base in this epoch, and the job is checked as it is now: the writer may have replaced it with a tombstone, which needs no parent. A stored `purged:n` of the parent wakes a wait too, through the ordinary branch of a deletion. A queue that holds only waiting records still gets a reason to be read again: the signal, or a check after a bounded delay.
- **The quota.** A test holds a flush and delivers one more listener read: the flush takes off only the delta it captured.

**Not in stage 2:** the page, the raw reads and writes, the messages, the fallback copies, the export, `FORMAT` and `IDB_VER` (stage 3); `PENDING`, `OWN`, `allowance` and `LOADS` are as they were (stage 4).

## 8. Tests

### 8.1 Node

Every operation of the user in the core is a row of one matrix, each run in two columns: **(a)** through the writer, right after the commit of a change that kept the records, it is accepted and decides by the new owner (a job or a tombstone queued where that owner needs one); **(b)** called with the era of a screen read before an erase, it is refused.

| Operation | (a) decides by the new owner | (b) old era |
|---|---|---|
| `writeLocal` | the `out:n:` job | refused |
| `purgeLocal`, and the deletion without an owner that §3.3 item 7 moves into the core | a tombstone job, not a local-only delete | refused |
| `purgeOldLocal` (the 30-day rule without an owner) | not run once the store has an owner | refused |
| `importNote`, `importMany` | the job of every note written | refused |
| `importHistory` | named versions queued | refused |
| `versionLocal` create, name, rename | the version job | refused |
| `versionLocal` delete, `purgeLocal` confirmed as `here` | refused with `reach`, nothing deleted; with `all`, the tombstone | refused |
| `restoreCopy`, `undoRestore` | the note's job | refused |
| `dropCopies`, `putCopies` | local only, accepted | refused |
| `unqueue` | accepted over the new metas | refused |
| `deviceName` | accepted | accepted: the exception of §3.3 item 1 |

Beside the matrix:

- A save ordered after a first sign-in's commit, before any runner is made, lands and has its `out:n:` job.
- After an erase, a write with the old era is refused: with the erase by this writer, and with the erase by another over the same store, a fresh runner included.
- Overlapping changes of owner, in both orders.
- An `epoch` record without `era`, written as old code writes it: a write with the earlier era is refused.
- `expectEpoch` refuses after a change that kept the records.
- `lrev` after a change that kept the records is above every `lrev` before it.

### 8.2 Browser

- The «owner» message delayed: a `resume` and a save come first, for a change with an erase and for one without.
- A save in `idbLost` before and after `setOwner`'s commit (the first is a hole on main today; removing the wait of §3.3 item 3 should close it, and this scenario decides).
- An automatic version and `idb.del` from an old screen after an erase are refused.
- A freeze on an old screen after its engine was replaced, then a reload and `db.move()`: the copy keeps its era and does not move into another set of records.
- An old `NK` copy after an erase is not imported and shows in the restore; with the initial era it is imported.
- A tab of code before the format guard and a tab with it, each beside the new build: an erase and a change that keeps the records in each pair.
- A frozen old tab: the upgrade waits and goes on by itself.
- The `lrev` collision: a screen with `lrev` 2, a change of owner, one edit in another tab, a save here; the other tab's edit stays.
- Two tabs, a change that keeps the records in one while the other types: no lock.
- A change of owner between a dialog's showing and its confirmation: «Видалити версію» shown with «з цього пристрою», a first sign-in, then the confirmation. Nothing is deleted, no tombstone is queued, and the dialog asks again with «на всіх пристроях». The same for «Видалити назавжди».
- «Delete forever» between a first sign-in's commit and the end of the load: a tombstone job is queued, and the note does not come back from the new owner's cloud.
- A `put` delayed across an erase and the start of a new page (it waits in `TABQ`): nothing of it reaches the new screen or the store.
- An export with history from an old screen locked after an erase, with the new owner's history already in the store: the file holds the old screen's notes and no history.
- `tests/appsaveoverlap.mjs` as it is, and its case again with a change of owner that keeps the records between the two saves: the deleted block stays deleted.

### 8.3 Expectations that change

`syncguard` 5s9 on #146 lets the same engine save again after an erase and a later change that loaded. Under this contract the era of an old screen never changes, so it splits in two:

- an old screen is refused, even when the engine loaded;
- a new screen, which read the records and the era in one transaction, saves.

Every other 5s* case is read again by the same sign before it is carried over.

As carried over (`tests/syncera.mjs`):

- 5s, 5s1, 5s4 (the user's writes right after this engine's own change, a first sign-in included): as on #146, and the deletion among them leaves a tombstone job.
- 5s2 (a save behind an erase): refused, now by the era.
- 5s3 (a step right after this engine's own change): refused and quiet, as on #146.
- 5s5–5s7 change. On #146 a write called before an erase waited for the engine's first load and was therefore ordered after the erase, and refused. A write waits for nothing now: called first, it is ordered first, lands and is erased with the rest; called after the erase it is refused, whether the erase's adopting load succeeded or failed.
- 5s8 (an older change ending after a newer erase whose load failed): the old screen is refused, by the era and not by a guard the engine keeps.
- 5s9: the two cases above.
- 5s10 (the hint of a committed change on a frozen error): gone with the adopting load (§6).
- With §7.3 the cases are kept, lost or rewritten as §7.3.8 lists.

## 9. Risks

- The body of a write reads `S.owner` in about eight places, and the page branches on it before a write in three (§3.3 item 7); one left behind decides for the old owner. The matrix of §8.1 names each operation.
- The one read at start replaces four transactions in a start that is sometimes slow on Android (the cause is still unknown, IDB-FALLBACK-PLAN). The boot journal shows whether it changes the longest step.
- The `IDB_VER` raise can make a start wait behind a frozen old tab. That is the case IDB-BARRIER-PLAN PR 1 was built for.
- The rework of `after` and of the memory updates touches the order `laterSnap()` relies on (§3.3 item 8). `tests/appsaveoverlap.mjs` is a required regression of stages 2 and 3.
- A `put` that becomes a notice costs the receiving tab one read per message. Typing in one tab with several open is the case to measure.

## 10. How others do it

Read in the sources on 2026-11-13. They support keeping a stable context for each operation; they do not prove this scheme.

- A database per user, a new instance at a switch: Zero, Replicache, Standard Notes.
- Sign-out as wipe and reload: Standard Notes, Replicache and Zero (`onClientStateNotFound`, `onUpdateNeeded`).
- A change in place: Dexie Cloud pins the user to a transaction when it is created (from `currentUserObservable`, memory that follows the database) and adopts anonymous rows in one transaction inside the sync job, under a Web Lock; Firestore keys the mutation queue by `[userId, batchId]` and runs the user change on the same serial queue as the writes.
- The client stopped before the wipe: Element Web (`stopMatrixClient()`, then `clearStorage`).
- `versionchange`: Dexie, Firestore, Standard Notes and PouchDB close the connection.

Not opened: Signal Desktop, Joplin, Logseq, AFFiNE, Excalidraw, automerge-repo, ElectricSQL.

## 11. Review rounds

- **The architecture review of #146 (2026-11-13), three passes with the owner.** Pass 1: five major gaps (the era read with the screen's records, the fallback copies, compatibility one way only, the false lock through reads and the lead, the `lrev` collision). Pass 2: two major and one minor (the `NK` exception, the tabs before the format guard, `syncguard` 5s9). Pass 3: none; the plan merged by #151.
- **Preflight over main at 2ee9dfc (2026-11-13): three high, two medium.** High: the page chooses the path of a deletion by the owner in memory (§3.3 item 7); a message between tabs carries a note with no origin, `TABQ` included (§3.8); the export's history is read outside the rule of the era (§3.9). Medium: stages 2 and 3 as two active PRs leave an unsafe `main` on `.dev` (§7); the overlapping saves were called an open separate task though main has `laterSnap()` and `tests/appsaveoverlap.mjs` (§3.3 item 8, §8.2, §9). The Node matrix now names every operation (§8.1).
- **Review of #153 at 263d85a (2026-11-13): one high, two minor.** High: the text a deletion is confirmed by was called cosmetic; a change of owner while the dialog is open widens the deletion to every device (§3.3 item 9). Minor: the device name's exception was in the matrix and not in the rule (§3.3 item 1); the dormant stage 2 named 5s* as a suite of main, where they are not (§7).
- **The independent review of §7.3's text, at deb79ea (2026-11-26): build after amendments; five high, three medium.** A design review, read against the code, nothing run. The split removes the main cause, but a fixed epoch guards only the border between owners: within one epoch the old and the new runner pass the same check. High: the gate is needed after a cloud call too, with a result of its own (a late answer of an ended runner must not finish an attempt, back off, deny, or publish); local reads and writes that pass no check (`flushQuota`, `format`, the reads a step bases cloud work on); the fate of a transaction already admitted at `end()`; one path for the page to make and replace a runner; `expectEpoch` tied to what the user confirmed. Medium: the signal from the writer to the runner and the source of «caught up»; `meta.wait` and two runners of one epoch; the transitions of a runner (one initialisation, no second load). It also found the text saying both that `PENDING`/`OWN` go now and that they stay until stage 4. §7.3 is rewritten in subsections with all of it, and lists the agreed text it would change (§7.3.6) without changing it yet.
- **The second independent review of §7.3's text, at ed1f4ae (2026-11-26): more amendments before building; four high, four medium.** Read against the code, nothing run. The split stands. High: `lrev` does not bring back what an admitted transaction did after its runner ended (a deletion stays on the screen), so a recovery read is needed, ordered after it by IndexedDB through `sync`; the reconciliation and `setOwner` must judge the era of the screen, a fresh `expectEpoch` not being a right to act; work started through hooks (`deps.sweep`, what `onHistory` queued) passes no check of the runner; a name in `scan:` does not keep two runners of one epoch from one pass, nor a pass from declaring missing a version another runner received behind it. Medium: a stored wait is not woken when its parent is already there; the stored mark «caught up» beside a failed incoming write (`refetch`); a writer's signal lost on a busy wake, and a loop of runners on a storage error; the bound of the quota's undercount. It also listed what §7.3.6 missed and which cases §7.3.8 should keep. All of it is written into §7.3; `vblocked` moved from §7.3.7 into §7.3.5.
- **The fourth look at §7.3's text, at da4015c (2026-11-26): it can be built after §7.3.6 is applied.** Both rules that blocked the start are closed; §7.3.9 holds criteria of the implementation, none of them a decision still to make. Notes for the build: the mode without Web Locks makes the same recovery read when its local lead begins; a late server answer is judged by base, `seen`, the job and the attempt compared by content, their absence included, read together before the request, and by `lrev` or another field where a branch rests on one; no stamp of its own is needed. Two wordings corrected (the order of the recovery read; who names `stale` and `reload`). §7.3.6 is applied to §3, §6, §7.1 and §8 in the same commit.
- **The third independent review of §7.3's text, at 1175fe2 (2026-11-26): the architecture is ready; two rules of a hand-over to write before building.** Read against the code, nothing run. High: the recovery read must also be made by the tab that takes the lead, since the old leader's tab may close at `pagehide` after its admitted write committed; and a late server read (`null` for a vanished document) can undo a newer tombstone while both runners of one epoch live, outside a full pass too, so such a decision must compare the state its request was made over. Left to the implementation and its tests: the order of the recovery read and the unsaved text, the era beside `expectEpoch` as two cases, the budget of confirming candidates, the sweep, `vblocked` and `meta.wait`, the quota's flush (§7.3.9). Text: a runner reports a mismatch and the writer names it `stale` or `reload`; §3.2 item 4 and §7.1 items 1, 3–4 added to §7.3.6. All written into §7.3.
- **An internal review of §7.3's first wording, and a fourth look by the independent reviewer at 1b2271a (2026-11-23).** The internal review (a design review, read against the code, two probes run) found the direction right and the wording open in four places: `PENDING`/`OWN` still moving the memory, a fresh engine's first load accepting any owner (run: an engine made for one owner loading another's store and calling the first one's cloud), «one adapter for life» against what the page does on a lead and a re-sign-in, «loaded once» against `reload()`; and it proposed the split into a writer and a runner. §7.3 is rewritten with them. The fourth look, at 1b2271a, reproduced one of round 3's findings (a step begun before `setCloud` calling the new adapter) and established another by reading the code, not by a run (an old step taking a new delivery out of the inbox); they are of the class §7.3 removes and were not patched.
- **The third round of the independent review, at 1161dea (2026-11-23): six high, four medium; the PR returned again.** A step begun for one owner calling the adapter that replaced its own; a write past its check and the memory updated after a commit under a moved generation; an unnamed adapter used before it is bound, and a waiting version of another source; this engine's own erase answered three ways by where the step met it; a note already dirty when `loop` is set; a version left blocked after another engine sent its note; an aborted `setOwner` leaving the listeners deaf; an old step consuming a new delivery; `tombstoneAuto` inheriting a step's generation; `sendDelay` on stale data. Not answered by more checks: §7.3 proposes to change what the engine is with an era, and waits for the owner. Nothing of the code changed after this round.
- **The review of #157 against this branch (2026-11-23): one medium for the merge.** On the reviewer's trial merge a change of this engine that began under a step's read of the queue was refused by the era's check before the own change was recognised, and the step asked for no time, so the page's timer was lost. The merge made here (8941b37) asks the own change first and did not lose it; it had the opposite gap, an erase of this engine answered as `own` instead of `reload`. Both are now pinned by case B20; the erase variant fails on 8941b37.
- **The second round of the independent review, at 6220954 (2026-11-23): six major, one minor; the PR returned.** The first round's fix for the previous owner's cloud checked the origin once, at the answer, and by epoch and adapter. Major: the rest of a page already fetched went on being applied after the owner changed (chunks of 25 with a pause on a slow store; the same for versions, a scan, the totals, a refetch); an adapter that names no user was listened to again under the new owner, `start({cloud:null})` left listeners alive, a waiting version carries no origin; a «permission-denied» of the previous adapter between the commit and the adopting load denied the new owner; a running leader never learnt that another tab lifted `loop`; lifting `loop` by the time of the last `typed()` was wrong both ways (a save that changes nothing or comes 301 s later kept it, a pin lifted a new one), and its premise was wrong too: `typed()` runs once per note turning dirty, not per keystroke; `setOwner` for the store's own owner was refused by its first load once a write had marked the memory not loaded. Minor: the load that only refreshes the memory lost `committed`. Answered by the generation, the bound adapter, `typed()` reading the store, `setOwner` without a first load and the marks read with the queue (§7.2). Cases B13–B19 fail on 6220954, with 5s6 and 5s7 (which now expect no first load); B11c and the transaction count of 5s pass there too. Without a case of their own: the same guard on the totals, a scan and a refetch (one mechanism with B13), a waiting version (an argument, §7.2), a step or `checkOwner` beside the refreshing load.
- **The independent review of stage 2 at 877d7df (2026-11-13): three major, two minor, and one major of main.** Major: a listener of the previous owner's cloud outlived the change and its deliveries were applied under the new owner, after an erase too (§7.2, the steps: listeners end with the change, deliveries and answers carry their origin); «the same owner again» started from the memory, so an engine that remembered another owner made a new epoch over a store that already had the owner asked for and lost a deletion waiting to be sent (§7.2, the change of owner); `typed` decided by the memory, so a save accepted after a change kept the mark `loop` and was never sent (§7.2, the user's writes). Minor: `purgeOldLocal` got one more callback, so one more await, without an era (one callback again); three checks weaker than their names (5s called the writes after the bind had ended, `unqueue` was only refused by its own rule, the rename was told by a job the change queues itself). Seven checks of `tests/syncera.mjs` fail on 877d7df (B10, B10a, B11, B11a, B11b, B12, B12a: the three major findings); the await was measured by the reviewer, not by a case, and the strengthened 5s, Ma and Mb pass on 877d7df too, since the code they check was right. The major of main (`reloadQueue`, §7.2) was not changed in this PR; #157 fixed it on main on 2026-11-23, and the branch merged that. The review found the corrections of §3.7, the era written only by the new mode, the unnamed reach and the reading of 5s5–5s7 sound.
- **Stage 2 (2026-11-13).** Three places where this text did not hold as written, corrected here and built that way: §3.7 gave a rule for «every note» though an empty one gets no meta, and gave none for versions (both now in §3.7, proposed); §7 said `setOwner` writes no `era` in stage 2, which leaves §8.1 column (a) unrunnable (§7.2: no engine of the app does); §3.3 item 9 did not say what an unnamed reach means (`here`). One finding about main, not changed there: `reloadQueue` reads the queue with no epoch check (§7.2, the steps).
- **Stage 1 (2026-11-13).** Writing the rules as functions found one of them unsatisfiable: §4 rule 4 asked an old `FX` copy for the initial era and a matching epoch at once, and a device with an owner never reads as the initial era. The rule is now one condition for each kind of copy.
