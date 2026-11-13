# A change of owner: the era of the data and the owner of the transaction

**Status: proposed on 2026-11-13; the contract (§3–§6) was agreed with the owner in three review passes of the architecture review of #146, and merged by #151. A preflight over main at 2ee9dfc the same day found three high and two medium gaps in paths the plan did not name (§11); they are written in below. Stage 1 (the model, `public/owner/model.js` with `tests/ownermodel.mjs`; nothing in the app imports it) is built. Stage 2 (§3.3, §3.4, §3.6, §3.7 in `public/sync.js`, used only by an engine made with `deps.era`; `tests/syncera.mjs`, `tests/syncerasim.mjs`) is built and dormant: nothing in the app makes such an engine, and §7.2 says what it holds and what it proposes to change in this text. Stage 3 follows this text, and nothing of it is implemented or tested yet.** The contract being agreed does not prove the implementation: the order of transactions, urgent saves and the behaviour of old tabs must be shown by the Node and browser scenarios of §8.

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
3. `detachEngine()` and `ownerMoved()` hand the era of the screen to the new engine. A new engine never takes its permission to write from the store as it is now.
4. Every later read that feeds the screen from the store (`takeStored`, `syncTabs`, the engine's `rtx`) compares the era inside its own transaction. A mismatch means «the records were erased», never new data to show. What reaches the screen without a read of the store (a message of another tab) is §3.8; what leaves the page as a file is §3.9.

### 3.3 The user's writes

1. A write the user makes (a save, an import, a delete, a version, a copy's restore or removal) compares, inside its transaction, the era of the store with the era of the screen. A mismatch refuses the write (`epoch`). The one exception is the device name (`deviceName`): the `device` record is of the device, not of an era, and outlives an erase, so it is written whatever the era. Every other limit holds for it as for any write: the `format` guard, the page's lock, a frozen store.
2. The owner the write acts for is read from the store inside the same transaction. The decisions that depend on it (`ensureJob`, `queueV`, `importHistory`, `purgeLocal`, `versionLocal`, `versionStates`) take that owner, not `S.owner`. So a save ordered after a first sign-in's commit queues its `out:n:` job in that transaction.
3. The write waits for nothing: no `await load()` before its transaction, so a save made in `idbLost` opens its transaction in that task. IndexedDB itself orders it against a `setOwner` transaction in flight.
4. The cache updates a write queues for after its commit (`after`) apply only when the epoch of the engine's memory is the epoch the transaction read. Otherwise the memory is marked not loaded, and the next load reads the store.
5. A memory value that belongs to the previous owner is not used across epochs: `S.everCaughtUp` in `purgeLocal` counts as false when the epochs differ (a tombstone job is queued).
6. The raw writes of the page (`idb.tx`, `idb.run`: automatic versions, `idb.del`) compare the era in the same place where `fmtGuard` reads the `format` record first.
7. **The page chooses no path by the owner in the engine's memory.** Today `purgeNote()` takes `SYNC.purgeLocal()` or the raw `db.remove()` and `vdrop()` by `SYNC.hasOwner()`, read before any transaction. After a first sign-in's commit and before the load, `S.owner` is still empty: the raw path deletes the note, the era check lets it (nothing was erased), no tombstone is queued, and a document of that note in the new owner's cloud comes back. So with IndexedDB every deletion the user makes goes through the core, and «only here, or a tombstone» is decided by the owner read inside that transaction. The same holds for the other branches of the page on `SYNC.owner` or `SYNC.hasOwner()` that lead to a write: `purgeOld()` (the 30-day rule without an owner) and `fbPutCopy()` (§4). Branches that only show a state (the account panel, the status) may read the memory. A text the user confirms an action by is not such a branch: item 9.
8. **The result of a write reaches the editor through microtasks only.** `laterSnap()` (the fix of the deleted block that came back after two saves held together, `tests/appsaveoverlap.mjs`) relies on it: the commit resolves the older write before the newer transaction's first request, which is a later task. So nothing between a write's commit and its result waits for a task: no load, no step, no `after` hook that awaits one. Item 4's «marked not loaded» is a flag set in that microtask, never a wait.
9. **A confirmed action keeps the reach the user confirmed.** A dialog that says how far a deletion goes is part of the action. Today «Видалити версію» asks with `hist.deleteHere` («Її буде видалено з цього пристрою») or `hist.deleteAll` by `SYNC.owner` when the dialog opens. A first sign-in while it is open, then the confirmation: the transaction reads an owner and queues a tombstone, and the deletion the user confirmed for this device reaches every device. Reading the owner again just before the dialog shows does not close this; the change can come while it is open.
   - The page passes the reach it showed (`here` or `all`) with the operation: a version's deletion, «Видалити назавжди» (`purgeLocal`, whose text names no reach but whose effect grows the same way), and any later action of the kind.
   - Inside the transaction the core compares it with what the owner it read makes of the action. Where the owner makes it reach further than confirmed (`here` confirmed, an owner in the store), nothing is deleted and the refusal has a code of its own (`reach`).
   - The page then asks again with the text of the new reach; only that confirmation deletes.
   - The same reach, or a narrower one, goes on.
   - An operation that names no reach is taken as `here`, the narrowest: a caller that forgot to say what the user confirmed never widens a deletion.
   - The reach is judged by the owner alone (`here` without one, `all` with one), not by what this deletion would do: «Видалити назавжди» of a note that never reached the cloud is still refused when it was confirmed as `here` and the store has an owner. The page then asks with the text of a device that has an owner, which is the text it would have shown had it known.

### 3.4 The engine's steps

1. A step compares the store's epoch with one memory, `S.epoch`, which only a load moves.
2. A step never sends to a cloud that is not the owner's: a cloud adapter whose `uid` differs from the owner's leaves the step idle.
3. A late network result of an old engine is dropped by the epoch check of its transaction, as today.

### 3.5 Two results instead of one

`checkOwner`, the loads, `rtx` and the statuses report two independent facts:

- **the era moved:** the screen is of erased records. `epochMoved` takes it (a reload, or the view-only screen with the export when something is unsaved);
- **the queue is stale:** the owner changed and the records were kept. The engine stops its steps, is replaced, the `lrev` of every note is read again and the account is checked. The editor is not locked.

The second path is idempotent. The «owner» message, a `resume` check and a refused step may start it in any order. Today `leadCheck()` turns `checkOwner()`'s `false` into `setLock('epoch')`, and the `reload` status of a step does the same, so a `resume` that comes before the «owner» message locks a tab the era check would let save.

### 3.6 `expectEpoch` stays strict

`setOwner` with `expectEpoch` is refused by any other epoch in the store, a change that kept the records included. Replacing a stale engine repeats nothing by itself: an erase or a binding the user confirmed before is asked again over the new owner.

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

- **Stays:** the tests of #146 (the `syncguard` 5s* cases, its additions to `appleadbind`, and `emu/erasefail`; main has `appleadbind` without those additions, no 5s* case and no `emu/erasefail`) carried over for the new mode, with the expectations of §8.3; the forced account check that runs again after one in flight (d6e0ab1); `committed` on the error of a change whose load failed, as a hint for the page (no longer what safety rests on).
- **Goes:** `adoptOwner` at the commit, `S.stepEpoch`/`S.stepOwner`, `ERASES`, `COMMITS`, `S.erasedUnloaded`, `PENDING.erase`.

## 7. Stages

Each stage is a PR into `main`. New code is ES modules in `public/owner/`; `index.html` only wires them in.

| Stage | What it holds | What proves it |
|---|---|---|
| 1. The contract and the model | the rules of the era and of the two results as pure functions (`public/owner/model.js`); the compatibility table as cases | Node tests |
| 2. Transactional writes, dormant | §3.3, §3.4, §3.7 in `public/sync.js`, with the 5s* cases of #146 carried over for the new mode and read again by §8.3 (some of them test the fix of the race, which the old mode keeps), used only by an engine that is given the era of a screen (`deps.era`); the page gives none yet, so the checks of main stay in force and no `setOwner` of the app writes `era` (an engine with `deps.era` writes it: §7.2) | Node over `MemStore` with `deps.era`; without it, the whole suite of main as it is (main has no 5s* cases: they come from #146) |
| 3. The page, and the switch | §3.2 (one read at start), §3.3 items 6–7, §3.5, §3.8, §3.9, §4, the urgent save; the page gives the era, `setOwner` writes `era`; `FORMAT` and `IDB_VER` 5 | browser scenarios (§8.2) |
| 4. The engine made simpler | a separate PR after the others are green: `PENDING`, `OWN`, `allowance`, `LOADS` reduced; `setOwner`, the loads and the steps on one queue (allowed, since no write of the user waits for them) | late loads and callbacks do not spoil a new memory; a save still waits for nothing |

Each PR into `main` is deployed to `.dev`, so «released together» is not enough: no state of `main` may write the new contract or loosen an old check without the page and the barrier. Stage 2 therefore adds code that nothing in the app switches on, and stage 3 switches everything on in one PR: the era from the page, `era` in the store, the raw reads and writes, the messages, and `FORMAT` and `IDB_VER` 5. If the dormant form of stage 2 turns out to cost more than it saves, stages 2 and 3 become one PR; they are never two active halves.

### 7.1 How the model reaches the core (stage 2; the owner's decision of 2026-11-13)

1. The model reaches the core through `deps.ownerModel`: the exports of `public/owner/model.js`, handed to `makeSync` by whoever makes the engine. `public/sync.js` stays a classic script and imports nothing.
2. Without `deps.era` the engine behaves exactly as on `main` today: the same checks, the same waits, the same records. This is the dormant stage 2, and every existing test passes over it unchanged.
3. With `deps.era` the model is required. A missing `deps.ownerModel` (or one without a function the core calls) is an error thrown by `makeSync`, never a fall back to the old checks.
4. The model is loaded before the engine is made. Nothing on the write path imports dynamically or waits for a load.
5. `deps.era` is the era of the screen (§3.2). The engine never refreshes it from the store: not at a load, not after its own change of owner. A new screen is a new engine made with the era that screen was read over.

### 7.2 What stage 2 built (2026-11-13)

Everything below is in `public/sync.js` behind `deps.era`. Without it no line decides differently from main: the existing Node suite passes with the same output, and the page makes its engine as before.

**The user's writes (§3.3).** `writeLocal`, `purgeLocal`, `purgeOldLocal`, `importNote`, `importMany`, `importHistory`, `versionLocal`, `restoreCopy`, `undoRestore`, `dropCopies`, `putCopies`, `unqueue`, `deviceName` and the `typed` mark go through one transaction of their own kind (`utx`):

- it is opened in the call, with no load before it (item 3);
- it reads the `epoch`, `owner` and `device` records first; the era is judged by `judgeWrite` (the device name excepted, item 1), and a mismatch is the refusal `epoch` with the status `reload`;
- every decision inside takes the owner that transaction read (`ownerIn(t)`: `ensureJob`, `queueV`, the versions that follow a deleted or revived note, `importHistory`, `vdeleteLocal`, `versionLocal`, `purgeLocal`; item 2);
- the work queued for after the commit is of two kinds: cache updates (`after`), applied only when the memory is of the epoch and owner the transaction read, and events for the page (`after.ev`), which always go (the device name and the size hint of a deleted note go with the events: neither is of an epoch). A memory of another epoch is marked not loaded, as a flag (items 4 and 8). The steps' own transactions follow the same rule;
- `purgeLocal` counts `S.everCaughtUp` only for a memory of the transaction's epoch (item 5), takes `{reach}` and refuses with `reach` (item 9); `versionLocal` delete takes `reach` the same way; `purgeOldLocal` does nothing once the store has an owner (item 7);
- the mark `loop` of a note is lifted by the save of what was typed, by the store's word. `typed()` is called with every keystroke and opens a transaction only when the memory knows the mark, as on main; a memory of another epoch does not know it, so `writeLocal` lifts it inside its own transaction when the note was typed in within the loop window.

**The steps (§3.4).** They keep main's check against `S.epoch` and `S.owner`, which only a load moves. Three things are added:

- the queue is read again (`reloadQueue`) only for the epoch of the memory. On main that read has no check, so a stale engine takes another owner's jobs and attempts into its memory and runs such an attempt through its own cloud: the independent review reproduced the new owner's text in the previous owner's cloud, on main and on this branch without an era. The refusal of the local transaction afterwards undoes nothing. It is a separate task for the mode that runs today;
- a cloud adapter that names another user than the owner (`cloud.uid`) is not used: no step, no listener, no send (item 2);
- nothing of the previous owner's cloud outlives a change of owner: the listeners end with the change (and with `setCloud`, whether or not the new adapter may be used); every delivery waiting in the inbox names the epoch and the adapter it came under, and the step drops those of another; an answer of a cloud call that comes back after the epoch or the adapter changed is dropped as a lost call. The check of the memory inside a step's transaction is not enough here: after the engine's own change the memory is the new owner's;
- a step that meets another owner's store ends idle instead of failing with a growing pause.

**The two results, as far as the core reports them.** §3.5 is stage 3, but a core that accepts saves after a change that kept the records cannot go on saying `reload` for it. So with an era a refusal by the memory (a step, a load) reports the status `reload` when the era moved and a new status `stale` when only the queue is of another owner; a step refused by the owner this engine's own `setOwner` is writing reports nothing. The page reads neither yet. What `checkOwner` returns is unchanged and is stage 3's.

**The reads (§3.2 item 4, for the engine's `rtx`).** `versionStates` is named by §3.3 item 2, and a read that waited for a load would be refused by a queue that is stale, which is the false lock the plan removes. So with an era the reads of the core (`versionStates`, `state`, `lrevOf`, `seenAll`, `copiesCount`, `countCopies`, `unsynced`) wait for no load, compare the era in their own transaction (`judgeRead`) and take the owner they read.

**The change of owner.**

- An engine with `deps.era` writes `era` in the `epoch` record (`nextEpoch`): the matrix of §8.1 cannot be run otherwise, because an `epoch` without `era` reads as a new era and column (a) would be refused. An engine without `deps.era` writes none, as main. Stage 3 changes which engine the page makes, not this.
- `expectEpoch` is main's comparison, through `expected` (§3.6).
- `lrev` is kept as §3.7 now says.
- «The same owner again» is read from the store alone, never from the memory. The store names another owner than the one asked for: a change of its own (a new epoch, the queue rebuilt, the era kept), also when the memory names the owner asked for. The store already names the owner asked for: no new epoch, and the queue and the registry of deletions stay, also when the memory names another owner; then only the memory is read anew. Whether the memory must be refreshed and whether the epoch must be made anew are two questions.
- An error of the adopting load carries `committed` and `erase` (§6), a copy of it when the error is frozen.

**Not in stage 2:** the page, the raw reads and writes, the messages, the fallback copies, the export, `FORMAT` and `IDB_VER` (stage 3); `PENDING`, `OWN`, `allowance` and `LOADS` are as they were (stage 4).

## 8. Tests

### 8.1 Node

Every operation of the user in the core is a row of one matrix, each run in two columns: **(a)** ordered after the commit of a change that kept the records and before the adopting load, it is accepted and decides by the new owner (a job or a tombstone queued where that owner needs one); **(b)** called with the era of a screen read before an erase, it is refused.

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

- A save ordered after a first sign-in's commit and before the adopting load lands and has its `out:n:` job.
- After an erase, a write with the old era is refused: with the erase by this engine and its load succeeded, with its load failed, and with the erase by another engine over the same store, a fresh engine included.
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
- 5s10 (the hint of a committed change on a frozen error): as on #146.

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
- **The independent review of stage 2 at 877d7df (2026-11-13): three major, two minor, and one major of main.** Major: a listener of the previous owner's cloud outlived the change and its deliveries were applied under the new owner, after an erase too (§7.2, the steps: listeners end with the change, deliveries and answers carry their origin); «the same owner again» started from the memory, so an engine that remembered another owner made a new epoch over a store that already had the owner asked for and lost a deletion waiting to be sent (§7.2, the change of owner); `typed` decided by the memory, so a save accepted after a change kept the mark `loop` and was never sent (§7.2, the user's writes). Minor: `purgeOldLocal` got one more callback, so one more await, without an era (one callback again); three checks weaker than their names (5s called the writes after the bind had ended, `unqueue` was only refused by its own rule, the rename was told by a job the change queues itself). Each has a case in `tests/syncera.mjs` that fails on 877d7df. The major of main (`reloadQueue`, §7.2) is not changed in this PR. The review found the corrections of §3.7, the era written only by the new mode, the unnamed reach and the reading of 5s5–5s7 sound.
- **Stage 2 (2026-11-13).** Three places where this text did not hold as written, corrected here and built that way: §3.7 gave a rule for «every note» though an empty one gets no meta, and gave none for versions (both now in §3.7, proposed); §7 said `setOwner` writes no `era` in stage 2, which leaves §8.1 column (a) unrunnable (§7.2: no engine of the app does); §3.3 item 9 did not say what an unnamed reach means (`here`). One finding about main, not changed there: `reloadQueue` reads the queue with no epoch check (§7.2, the steps).
- **Stage 1 (2026-11-13).** Writing the rules as functions found one of them unsatisfiable: §4 rule 4 asked an old `FX` copy for the initial era and a matching epoch at once, and a device with an owner never reads as the initial era. The rule is now one condition for each kind of copy.
