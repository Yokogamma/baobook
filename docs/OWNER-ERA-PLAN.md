# A change of owner: the era of the data and the owner of the transaction

**Status: proposed on 2026-11-13; the contract (§3–§6) was agreed with the owner in three review passes of the architecture review of #146, and merged by #151. A preflight over main at 2ee9dfc the same day found three high and two medium gaps in paths the plan did not name (§11); they are written in below. Stage 1 can start; stages 2 and 3 follow this text. Nothing here is implemented or tested yet.** The contract being agreed does not prove the implementation: the order of transactions, urgent saves and the behaviour of old tabs must be shown by the Node and browser scenarios of §8.

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

1. A write the user makes (a save, an import, a delete, a version, a copy's restore or removal, the device name) compares, inside its transaction, the era of the store with the era of the screen. A mismatch refuses the write (`epoch`).
2. The owner the write acts for is read from the store inside the same transaction. The decisions that depend on it (`ensureJob`, `queueV`, `importHistory`, `purgeLocal`, `versionLocal`, `versionStates`) take that owner, not `S.owner`. So a save ordered after a first sign-in's commit queues its `out:n:` job in that transaction.
3. The write waits for nothing: no `await load()` before its transaction, so a save made in `idbLost` opens its transaction in that task. IndexedDB itself orders it against a `setOwner` transaction in flight.
4. The cache updates a write queues for after its commit (`after`) apply only when the epoch of the engine's memory is the epoch the transaction read. Otherwise the memory is marked not loaded, and the next load reads the store.
5. A memory value that belongs to the previous owner is not used across epochs: `S.everCaughtUp` in `purgeLocal` counts as false when the epochs differ (a tombstone job is queued).
6. The raw writes of the page (`idb.tx`, `idb.run`: automatic versions, `idb.del`) compare the era in the same place where `fmtGuard` reads the `format` record first.
7. **The page chooses no path by the owner in the engine's memory.** Today `purgeNote()` takes `SYNC.purgeLocal()` or the raw `db.remove()` and `vdrop()` by `SYNC.hasOwner()`, read before any transaction. After a first sign-in's commit and before the load, `S.owner` is still empty: the raw path deletes the note, the era check lets it (nothing was erased), no tombstone is queued, and a document of that note in the new owner's cloud comes back. So with IndexedDB every deletion the user makes goes through the core, and «only here, or a tombstone» is decided by the owner read inside that transaction. The same holds for the other branches of the page on `SYNC.owner` or `SYNC.hasOwner()` that lead to a write: `purgeOld()` (the 30-day rule without an owner) and `fbPutCopy()` (§4). Branches that only choose a text or a panel (`hist.deleteAll` against `hist.deleteHere`, the account panel) may read the memory.
8. **The result of a write reaches the editor through microtasks only.** `laterSnap()` (the fix of the deleted block that came back after two saves held together, `tests/appsaveoverlap.mjs`) relies on it: the commit resolves the older write before the newer transaction's first request, which is a later task. So nothing between a write's commit and its result waits for a task: no load, no step, no `after` hook that awaits one. Item 4's «marked not loaded» is a flag set in that microtask, never a wait.

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
4. **Old copies without the mark** (an `NK` key with `~`; an `FX` record with only `epoch`) move in by themselves only where their origin is proved:
   - the era of the store is the initial one (`'0'`): no erase ever happened on this store (an erase by old code leaves an `epoch` without `era`, which reads as its `id`);
   - for `FX`, the `epoch` also matches the store's.
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

- **Stays:** the tests (`syncguard` 5s*, `appleadbind`, `emu/erasefail`) as regressions, with the expectations of §8.3; the forced account check that runs again after one in flight (d6e0ab1); `committed` on the error of a change whose load failed, as a hint for the page (no longer what safety rests on).
- **Goes:** `adoptOwner` at the commit, `S.stepEpoch`/`S.stepOwner`, `ERASES`, `COMMITS`, `S.erasedUnloaded`, `PENDING.erase`.

## 7. Stages

Each stage is a PR into `main`. New code is ES modules in `public/owner/`; `index.html` only wires them in.

| Stage | What it holds | What proves it |
|---|---|---|
| 1. The contract and the model | the rules of the era and of the two results as pure functions (`public/owner/model.js`); the compatibility table as cases | Node tests |
| 2. Transactional writes, dormant | §3.3, §3.4, §3.7 in `public/sync.js`, used only by an engine that is given the era of a screen (`deps.era`); the page gives none yet, so the checks of main stay in force and `setOwner` writes no `era` | Node over `MemStore` with `deps.era`; the existing `syncguard` 5s* unchanged without it |
| 3. The page, and the switch | §3.2 (one read at start), §3.3 items 6–7, §3.5, §3.8, §3.9, §4, the urgent save; the page gives the era, `setOwner` writes `era`; `FORMAT` and `IDB_VER` 5 | browser scenarios (§8.2); `syncguard` 5s* with §8.3 |
| 4. The engine made simpler | a separate PR after the others are green: `PENDING`, `OWN`, `allowance`, `LOADS` reduced; `setOwner`, the loads and the steps on one queue (allowed, since no write of the user waits for them) | late loads and callbacks do not spoil a new memory; a save still waits for nothing |

Each PR into `main` is deployed to `.dev`, so «released together» is not enough: no state of `main` may write the new contract or loosen an old check without the page and the barrier. Stage 2 therefore adds code that nothing in the app switches on, and stage 3 switches everything on in one PR: the era from the page, `era` in the store, the raw reads and writes, the messages, and `FORMAT` and `IDB_VER` 5. If the dormant form of stage 2 turns out to cost more than it saves, stages 2 and 3 become one PR; they are never two active halves.

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
| `versionLocal` create, name, rename, delete | the version job or its tombstone | refused |
| `restoreCopy`, `undoRestore` | the note's job | refused |
| `dropCopies`, `putCopies` | local only, accepted | refused |
| `unqueue` | accepted over the new metas | refused |
| `deviceName` | accepted | accepted: the device record is not of an era |

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
- «Delete forever» between a first sign-in's commit and the end of the load: a tombstone job is queued, and the note does not come back from the new owner's cloud.
- A `put` delayed across an erase and the start of a new page (it waits in `TABQ`): nothing of it reaches the new screen or the store.
- An export with history from an old screen locked after an erase, with the new owner's history already in the store: the file holds the old screen's notes and no history.
- `tests/appsaveoverlap.mjs` as it is, and its case again with a change of owner that keeps the records between the two saves: the deleted block stays deleted.

### 8.3 Expectations that change

`syncguard` 5s9 on #146 lets the same engine save again after an erase and a later change that loaded. Under this contract the era of an old screen never changes, so it splits in two:

- an old screen is refused, even when the engine loaded;
- a new screen, which read the records and the era in one transaction, saves.

Every other 5s* case is read again by the same sign before it is carried over.

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
