# Sync between devices and Google sign-in

**Status: approved plan; PR 0 ([#55](https://github.com/Yokogamma/baobook/pull/55), released by [#58](https://github.com/Yokogamma/baobook/pull/58)) and PR 1 ([#61](https://github.com/Yokogamma/baobook/pull/61), released by [#62](https://github.com/Yokogamma/baobook/pull/62) on 2026-10-18) are done and in production (the PR 1 row in §5 names what differs); PR 2 is built (its row in §5 names what differs); PR 3 is split in three: 3a (the cloud infrastructure) and 3b (sign-in and the account) are built, their row in §5 names what differs; 3c (the owner's uid in the rules) is in and the owner published the rules on 2026-10-20; PR 4 is planned in three parts, 4a–4c (§4.9, §4.11, §4.18, §4.19, §5.1), the owner answered its open questions on 2026-10-20 and the plan waits for approval; PR 5 is not implemented yet; the manual checks of 3b are in [SYNC-CHECKLIST.md](SYNC-CHECKLIST.md).** Approved on 2026-10-16 after five review rounds (issue [#18](https://github.com/Yokogamma/baobook/issues/18)) and amended on 2026-10-17 with the free-quota estimate ([#56](https://github.com/Yokogamma/baobook/issues/56)), an independent design review and the owner's answers to it. PR 0, the storage groundwork ([#55](https://github.com/Yokogamma/baobook/pull/55)), ships to production on its own. The rest is built in PR 1–4. PR 5 updates this document to match what was actually built. The earlier plan («Чистий аркуш», September 2026) is in the git history of this file.

Mockups of the interface: a private claude.ai page owned by the project owner (ask for access).

## 1. Goal

- The same notes on a computer, a laptop and a phone, without exporting and importing by hand.
- Sign-in with a Google account only.
- Local-first stays: without signing in and without a network the app works as now, and changes catch up with the cloud on their own.
- Sync runs in the background and its state is visible.
- Firebase Auth + Firestore on the free Spark plan, no Cloud Storage (notes have no images or files).

## 2. Owner's decisions

| Question | Decision |
|---|---|
| Encryption | None in stage 1. Encryption on the device and in the cloud comes as a later stage. |
| Who can sync | The owner only at first: the owner's uid is written in the security rules, so a request is checked without reading any document. Later, requests through the site, with the email collected and a separate consent to mailings; access then moves to a custom claim set by an admin script, and the project moves to Blaze with a budget alert before the first outside user. |
| .dev and .app | Separate data spaces in one Firebase project. |
| Version history | Only named versions go to the cloud. |
| Settings | Theme, grid, language and text size stay per device. |
| Sign-in | A popup on a computer, a redirect to the Google page on a phone and in the installed app. |
| Deletion against an offline edit | The deletion stands and the edit is not lost: a note in the trash takes the edit and its 30 days start again. After «Видалити назавжди» the edit appears in the trash as a revived note with a mark. A copy that was not edited just goes. The same rule on every device. The revived note gets a new id: if two devices revive the same note independently, both revived notes stay, each marked with its device, and the owner joins them by hand. |
| «Очистити історію» | Clears only this device's automatic history. A named version is deleted with its own command, everywhere. |
| An edit from another device | Before it changes a note, the state on this device goes into this device's automatic history, so «Історія» shows how the note was here before. |
| The automatic purge | By the device clock: 30 days after the server date of entering the trash the device tries, the rules refuse an early attempt, and it is tried again the next day. |
| Conflict copies | Kept until the owner removes them; a «N конфлікт» mark on the history button, «Відновити» and «Прибрати» on the copy. |
| The open note | With no caret in the note it updates at once. While typing, a strip «Є зміни з {пристрій} · Оновити» appears and the change applies on the button or when the caret leaves the block. |

## 3. What the user sees

1. **Sign-in:** the gear → Google → access check → whose notes are on the device → merge → a cloud icon in the header.
2. **First sign-in on a device with notes:** they join the account. Notes with the same id but different text are merged by block, and both source copies are kept as conflict copies.
3. **«Синхронізовано»** means no jobs, attempts or `refetch:` marks, no errors, both streams (notes and versions) got data from the server, and the last totals check matched (§4.6).
4. **An edit on another device:** the note updates at once or through the «Є зміни» strip. Saves made before the screen updates do not erase what came in.
5. **Offline:** «офлайн · N змін чекають».
6. **A conflict** (the same block edited on two offline devices): the edit from the device where the note was changed later, by that device's clock, stays; the other becomes a conflict copy.
7. **Deletion against an offline edit:** the deletion stands, the edit goes to the trash. The trash does not purge on its own a note that has conflict copies. If another device purged it, it comes back to the trash here with its copies.
8. **History:** a named version shows «у хмарі», «ще не надіслано», «лише тут: завелика / неповна», or «не синхронізовано».
9. **Sign-out:** sync stops in every tab, after the attempt already being sent is resolved. Edits made after signing out queue up until the next sign-in with the same account.
10. **Another account on the device:** a choice before any sync (export, add, remove, cancel).
11. **Access states:** no access, could not check, and offline are different states.
12. **The app updated in another tab:** the old tab saves its input or offers to export it. **A rollback:** view and export only.

## 4. Design

### 4.1 Principles

- The main copy lives in IndexedDB on the device. Firestore is the shared copy; the SDK cache is in memory only. The SDK loads after «Увійти» is pressed, or when the device is already bound to an account.
- **Device binding.** From the first sign-in the local set has an owner (env, uid), and it stays after sign-out. While it has one, every local edit and deletion is queued, even without a sign-in or a network.
- **Every merge is local.** The cloud only receives fast-forward writes: the device writes over a state it keeps as its confirmed base. A cloud write therefore never overwrites anything the device does not have.

### 4.2 Data in Firestore

```
env/{dev|app}/users/{uid}/notes/{noteId}
  v: 1, rev: int, op: string, srv: timestamp, dev: string   service fields of every write
  dn?: string                 the writing device's name, for marks (on every document, tombstones included)
  rcpt: { "{devId}": op }     receipts: the last accepted operation of each device on this document
  title, blocks[], created, updated, deleted?, archived?, revived?: {from, dev, at}
  tsrv?: timestamp            server time when the note entered the trash or its period was extended
  tombstone: v, rev, op, srv, dev, rcpt, purged: number, auto?: true
env/{dev|app}/users/{uid}/versions/{versionId}
  v, rev, op, srv, dev, rcpt, note, t, name, title, blocks[] (full bodies)
  tombstone: v, rev, op, srv, dev, rcpt, note, deleted: true
```

- **No other collections.** Access is the owner's uid in the rules (§4.16); a device's name travels as `dn` in the documents it writes, for «Є зміни з {пристрій}», conflict copies and revived notes.
- **Indexes:** `srv` ascending (the catch-up and the listener) and `rev` ascending (the totals check, §4.6), in `notes` and `versions`. Every other field has a single-field exemption with no indexes. `blocks` matters most (up to 549 KB of index entries on a note at the size limit); the others cut about 2.2 KB of index entries from every document, which doubles how many short notes fit and makes a tombstone 0.5 KB instead of 2.9 KB. A new query on another field needs its index back first (#56).

### 4.3 Data on the device

IndexedDB `sheet` v3 adds the store `sync` (key path `k`). The stores `notes`, `versions`, `blobs` and their fields do not change.

| Key in `sync` | What |
|---|---|
| `format` | data format number (3); older code reads it to see that the data is newer (§4.14) |
| `owner` | {env, uid, email}; survives sign-out |
| `epoch` | random id of the local set; changes on clearing and on **any** change of owner |
| `meta:n:{id}`, `meta:v:{id}` | `lrev`, the base (the full confirmed cloud state with `rev`, `srv`, `tsrv`), `baseLrev`, loop-guard counters; a version's also `wait` (a document waiting for its note), `local` (`big`, `partial` or `shape`: this named version stays on the device, §4.9), `gone` (deleted here before it ever reached the cloud) and `err` |
| `out:n:{id}`, `out:v:{id}` | queue job {tries, next, err}; `tomb` for a tombstone (a note's «forever», a version's «Видалити версію») |
| `try:n:{id}`, `try:v:{id}` | immutable attempt: {op, expect, result, sentLrev, epoch} |
| `refetch:n:{id}`, `refetch:v:{id}` | «read this document from the server again» |
| `seen:n:{id}`, `seen:v:{id}` | {rev, srv, after?}: the newest cloud state this device knows for the id (from a page, the listener, a server read, or its own accepted attempt), whether or not the document was applied; ordered by rule 1 of §4.6. After an own accepted attempt `srv` is unknown until the echo, and `after` holds the `srv` of the state it wrote over. Kept forever; the local side of the totals check |
| `purged:n:{id}` | tombstone registry of notes: {rev, revivedAs?}. A write sets `rev` and keeps `revivedAs` unless it points it to a new revived note (§4.7) |
| `cursor:notes`, `cursor:versions` | durable cursor {srv with nanoseconds, docId} |
| `quota` | reads and writes per Pacific day, rate limiter tokens |
| `clock` | {last}: the last `updated` this device gave (§4.4) |
| `quarantine:n:{id}`, `quarantine:v:{id}` | an incoming document of the wrong shape (§4.15), not applied |
| `scan:notes`, `scan:versions` | the state of a full pass (§4.6): {active, after, found, ids, startedDay, day, allow, doneDay}; a pass that ran out of budget goes on the next day from `after` |
| `device` | {id, name}: this device's id and name as the cloud sees them (`dev`, `dn`); written at start from the settings |

- Everything except `format`, `owner`, `epoch`, `clock`, `quota` and `device` belongs to (env, uid) and is cleared when the owner changes. `clock` and `quota` describe the device (its monotonic time, its daily use of the shared quota) and stay.
- Conflict copies and named versions live in `versions` with the optional fields `keep:1` and `inline:1`: full bodies inside the record, no thinning, no budget, no `vsweep`, no plain «Очистити історію», no automatic purge.
- New optional note field `revived: {from, dev, at}`. `sheet:settings` gets `devId` and `devName` (by default the browser and system, editable in the account panel; sent as `dn`).

### 4.4 Local writes

Every local write is one IndexedDB transaction over `notes` + `sync` (+ `versions` and `blobs` when it writes history):

1. Compare (epoch, env, uid) with the tab's. On a mismatch, abort and switch to «reload the page».
2. Read the current record `C`.
3. Apply the operation's delta (the editor: §4.10).
4. If the result equals `C` by its canonical form without `updated` (§4.15), write nothing.
5. Write the result with `lrev+1`, and a job `out:` if the device has an owner.

**`updated`** comes from this device's clock, kept monotonic: every local write sets `updated = max(Date.now(), clock.last + 1)` and stores `clock.last` in the same transaction, so two edits in one millisecond, or an edit after the clock was set back, never get an equal or smaller time. Incoming times are not followed, and none is promised a causal order. None is needed: an edit made after seeing another device's state merges against that state as its base and never conflicts with it, so the key of §4.7 only chooses between concurrent edits, which no clock orders. It picks by the devices' clocks: a device whose clock runs ahead wins concurrent conflicts more often, and the losing side is still kept as a conflict copy that shows its device and time. A remote `updated` in the future is applied as it is, since it is part of the key. **The list and the dates** use `updated`, but a time ahead of this device's clock is replaced by the moment the document arrived here (kept in `meta`): the note shows as just changed and then ages like any other, and the stored `updated` does not change (the owner's decision). **An import** keeps the `updated` of the file: the monotonic rule covers edits and merges made here, not restored records, so an old export loses a concurrent conflict to newer cloud edits; a future time in the file shows as the time of the import, like a future time from the cloud.

Deleting forever with an owner removes the note, its history and blobs locally and queues a tombstone in `purged:` and the queue. Conflict copies go only with an explicit «forever», and the dialog names how many.

### 4.5 Sending (leader tab; one attempt per note)

1. **An unresolved attempt.** If there is a `try:`, it continues at step 4 with the same `op`, `expect` and `result`. An attempt is never dropped without a proven outcome, and no new `op` for the note starts before it is resolved.
2. **Prepare.** Read the cloud document `R` from the server. **Skipped** when the listener is connected, has a server snapshot, and the last `rev` it delivered for this note equals `base.rev`: then `R` is the base, and step 4 reads the document in its transaction anyway (a rejection there comes back here and reads `R`). This saves one read and one copy of the document per send (#56).
   - **The cloud moved ahead** (`R.rev > base.rev`, or `R` exists and there is no base) → **a local merge**, one IndexedDB transaction with the (epoch, env, uid) check:
     - read the current record `C`;
     - `R` goes through rule 1 of §4.6 first: recreated → base dropped, a first merge below; rewritten with an older copy → quarantine, and nothing else here; then `seen` = `R`;
     - `C` goes into the automatic history as an `incoming` record, by the rule of §4.6;
     - note = `merge3(base, C, R)` (a first merge: `merge0(C, R)`, §4.7);
     - the losing sides (both source copies on a first merge) go to `versions` with `keep`/`inline`;
     - base = `R`;
     - if the note equals `R` by content (without `updated`), it takes `R` as it is, `updated` included, the job goes and `baseLrev = lrev`; otherwise the job stays.
     Then step 2 again.
   - **The cloud equals the base** (`R.rev == base.rev`, or neither `R` nor a base):
     - the local copy equals the base → the job goes;
     - otherwise → step 3.
3. **Insure the attempt** in one IndexedDB transaction with the check: `try = {op: new, expect: base.rev, result: the current note S, sentLrev: L, epoch}`. No copies are needed here: the cloud state that will be overwritten equals the base, which the device keeps in full.
4. **The cloud transaction.** The callback has no side effects. It may run several times, and an old and a new leader may run it at once. Read the document `D`:
   - `D.rcpt[devId] == try.op` → **accepted**, no write;
   - `D.rev == try.expect` (or no `D` and `expect == 0`) → write `try.result` with `rev = expect+1`, `op`, `srv`, `dev`, `rcpt = {...D.rcpt, [devId]: op}` → **accepted**;
   - `D.rev > try.expect` and no receipt → **rejected**. This is proven: a commit needs `D.rev == expect` and `rev` only grows; an accepted operation would have left a receipt that other devices do not change; this device starts no new `op` before the outcome is known;
   - no `D` while `expect > 0`, or `D.rev < expect` → **an invariant violation**: something changed the cloud past the rules. It is a resolved outcome, not an unknown one: the `try:` goes and the event is logged, then:
     - no `D` → the document vanished: the base and `seen` go, and the note is sent again as a new document (`expect = 0`), as in the full pass of §4.6; a tombstone job just goes, and the note stays in `purged:n:`;
     - `D.rev < expect` → rule 1 of §4.6 decides, as for a server read: a recreated document joins the note as in a first merge and the next attempt has `expect = D.rev`; a document rewritten with an older copy goes to quarantine. Either way `seen` = `D`.
     The totals check is never blocked by it.
   A network error or an unknown outcome leaves the `try:`; step 4 runs again later.
5. **Finish** in one IndexedDB transaction, only if `try.op` is still the same and (epoch, env, uid) match:
   - **accepted** → base = `{rev: expect+1, the result}` if newer than the base, and `seen` = {`expect+1`, `srv` unknown, `after` = the `srv` of the state written over} until the echo fills `srv` (rule 2 of §4.6). If `lrev == sentLrev`, the job goes and `baseLrev = lrev`. Otherwise the job stays: the newer edits were made over `S`, which is now the base, so the next attempt is a fast-forward too. The `try:` goes.
   - **an accepted tombstone** (a manual «forever» or the automatic purge):
     - `lrev == sentLrev` → the note, its history and blobs go locally; `seen` = `expect+1` with `after`, as above; `purged:n:{id}.rev` = the tombstone's `rev`, keeping `revivedAs` if there is one (the original may already have a revived note);
     - `lrev` changed (the note was edited or restored from the trash while the tombstone was being sent) → the late edits are kept as with an incoming tombstone: the current local copy moves into the revived note (§4.7), then the original goes locally.
     All in one transaction. There is never a fast-forward write over a tombstone: the original has no job left.
   - **rejected** → the `try:` goes → step 2 (a local merge happens there).
   A second finish of the same attempt (an old leader) finds no `try:` and does nothing.

- While a note has a `try:`, incoming documents of that note only set `refetch:`. After the finish, step 2 reads the current document.
- **Errors:**
  - temporary ones: retry with a delay from 2 s up to 5 min;
  - `permission-denied`: check access and the sign-in;
  - the rules refusing an early automatic purge: retry quietly later;
  - a document too large: mark it, the rest go on;
  - `resource-exhausted` or the device budget spent: stop until the next day.

### 4.6 Receiving (leader tab)

- **Catch-up** from the server:
  - the first page is `srv >= cursor.srv − 5 min`, ordered by (`srv`, id), 200 documents a page;
  - the next pages start after the last one read (`startAfter`);
  - each document of a page is applied in its own IndexedDB transaction (below), `seen` included; after the page, a small transaction sets the cursor = max(cursor, the last document processed: applied, skipped or marked), so a page stopped by a storage error resumes where it stopped.
  The cursor never moves back. **The margin is an economy, not the guarantee.** Firestore orders a listener's notifications by commit ([real-time queries at scale](https://firebase.google.com/docs/firestore/real-time_queries_at_scale)), but `srv` is the time the request arrived ([`request.time`](https://firebase.google.com/docs/reference/rules/rules.firestore.Request)), and nothing documented bounds how far a document's `srv` can lag behind documents already visible. The margin re-reads the usual window cheaply (applying is idempotent); a document that becomes visible below it is found by the totals check below.
- **Listener** on `srv >= cursor.srv − 2 min` (inclusive), with the same small margin. After a reconnect (`online`, `resume`, a network change) the leader starts the listener again from the current cursor minus the margin, so its result never grows to everything changed since the tab opened. Documents with `hasPendingWrites` or an empty `srv` are skipped. The cursor moves only on snapshots from the server, after the IndexedDB write.
- **Applying a document** (every note and version has its own base), one transaction with the check:
  1. **Rule 1 places the document against `seen`.** `srv` is the time the server processed the commit's request (`REQUEST_TIME`, in milliseconds), not a commit timestamp. For one document it grows with every write through the rules, since a write reads the previous state before its request; servers' clocks may disagree by milliseconds, so «clearly newer» or «clearly older» below means by at least 1 s, and an equal `srv` is never newer. While `seen.srv` is unknown after an own write, `seen.after` stands in for it.
     - `rev < seen.rev` and `srv` clearly newer → **recreated** past the rules (deleted in the console and sent again as new by another device): it is logged, `seen` = this state, the base is dropped. A live document joins the local copy as in a first merge (`merge0`, both source copies kept), or goes into the revived note for an id in `purged:n:` (§4.7). A tombstone goes to rule 4, judging «changed since the base» by the base before it was dropped.
     - `rev > seen.rev` but `srv` clearly older → a state from before a recreation; any other `rev < seen.rev` → an older state. Either is **stale**.
     - **A stale delivery** (a catch-up page or the listener, which can arrive after a newer state) → skip. This also keeps an old live state of a version or note purged here from coming back.
     - **A stale server read** (the transaction, `R` of §4.5 step 2, `refetch:`, the full pass), compared with `seen` as it was when the read was sent: the cloud itself holds an older copy, rewritten past the rules (an old JSON pasted in the console). It is logged, `seen` = what was read, and the document goes to quarantine with «пошкоджений запис у хмарі» and «Створити копію нотатки» (a new id with the local text, as at the receipt limit); a later document of the right shape with a clearly newer `srv` lifts the quarantine. Compared with a `seen` that moved while the read was on its way (the listener was faster), the read is just a stale delivery.
     A version waiting for its note is applied from its mark when the note arrives, not by this rule.
  2. `rev == base.rev` → only fill in the server fields of the base (`srv`, `tsrv`) if they were missing. Nothing else: no job, no copy, no new id.
  3. There is a `try:` → a receipt `rcpt[devId] == try.op` and `rev == expect+1` finishes it as accepted (§4.5 step 5); otherwise set `refetch:`.
  4. A tombstone → §4.7 «Deletion».
  5. `lrev == baseLrev` (no local changes) → in the same transaction, the current local state goes into this device's automatic history as a record of its own kind (`incoming`), with no age or gap rule (unlike `vcapture` and its `V_GAP`), skipped only when its content equals the note's last history record; then note = document, base = document.
  6. Otherwise → the same history record in the same transaction, then a local merge as in §4.5 step 2. The job stays.
  - Every document that is not stale sets `seen` to its `rev` and `srv` in the same transaction (rule 1 decides what is stale, so a state from before a recreation never lowers it back). A quarantined document is recorded in `seen` as read, so it does not keep the totals apart.
  - **The `incoming` record:** its `t` is the time it was written by this device's clock, not the note's `updated`, and in PR 1 every automatic record's `t` is at most `vnow()`, so a note with an `updated` far ahead cannot make `vthin` drop the note's history as «older than 90 days». It lives like other automatic records: «Очистити історію» removes it, `vthin` keeps the 24 h / 7 days / 90 days ladder and at most 300 records a note, `vsweep` keeps the budget, and a block body over 256 KiB is not stored (the history shows «текст цього блоку не зберігся»).
  - **A document that cannot be applied** (no space for its history): its transaction fails alone; the note gets `refetch:` in a small transaction of its own, and the rest of the page goes on. On `QuotaExceededError` the leader runs `vsweep` once and retries once; if that fails too, receiving stops with «немає місця на пристрої», the cursor stays before that document, and receiving tries again at the next start or after an hour, never in a loop.
- **The totals check guarantees completeness.** The leader reads `count()` and `sum(rev)` of each collection from the server in **one** aggregation query (one read time), and compares them with the number and the sum of its `seen` records. `seen` holds every cloud document this device has read, applied or not: a version ignored because its note is purged, a version waiting for its note, a quarantined document, a tombstone of a note never seen here, a document over the size limit.
  - **Why equality proves it.** Let the cloud hold {(id, r)} and the device {(id, s)}. (a) Every id in `seen` exists in the cloud: cloud documents are never deleted (`allow delete: if false`). (b) s ≤ r for every id: `seen` is set only from what the cloud returned and from an accepted attempt (`expect + 1`), never from local data, and through the rules `rev` only grows (a document recreated or rewritten past them sets `seen` to what was read, rule 1). (c) One record per id. Then equal counts mean the same set of ids, and an equal sum of termwise s ≤ r means s = r everywhere: one document cannot be one ahead while another is one behind. The proof holds while nothing changes the cloud past the rules. A change there (the console, a script) can break (a) or (b): a document written without `rev` is left out of both aggregates, since a query with several aggregations counts only documents with every field, and a deleted document can even cancel out a missing one. The full pass after any mismatch repairs such cases, but a console change can hide a gap until the next mismatch; on .dev this is accepted.
  - **When:** after the catch-up is done (its last page was short) and the listener's first server snapshot is applied; with no unresolved `try:`; within the day's budget. Then after each catch-up on start and reconnect, and once an hour while connected, but at most every 15 minutes after a matching check; a `resume` whose listener never lost its connection skips it. Otherwise the check waits; it is never counted as a mismatch.
  - **An error** of the aggregation (`deadline-exceeded` after 60 s, `unavailable`, offline) means «unknown», not «different».
  - Equal → nothing is missing.
  - Different → a catch-up from `cursor − margin`, and a second check no sooner than 5 minutes later (another device may have just written).
  - Still different → a full pass over that collection ordered by document id, 200 a page, started at most once a day per collection (the owner's decision). It spends at most half of what is left of the day's budget and goes on the next day from the last id read, so sends never stop for it; the status shows «Перевіряю повноту · N». Every document goes through the rules above (rule 1 included); how many it found goes into the sync log, so a real gap shows.
  - **An id in `seen` that a complete pass did not return** (never decided on a partial one) has vanished from the cloud past the rules (the console, a script). It is logged and its `seen` and base are dropped; a note or version alive on the device is sent again as a new document (`expect = 0`, the owner's decision); a tombstone just stays in `purged:` locally. Every other device then sees that document as recreated (rule 1) and joins it with its own copy, so the totals meet again everywhere. If the vanished document was a tombstone, a device that still held the note alive sends it again, the devices with `purged:n:` move its text into a revived note of their own, and the first device ends up with two notes that the owner joins by hand; nothing is lost.
  - «Синхронізовано» needs a matching check since the last connect. Cost: ⌈N / 1 000⌉ reads per aggregate per collection, counted per aggregate to be safe: 4 reads for 1 000 notes and 1 000 versions, 8 with three versions a note, 40 for 5 000 notes and 15 000 versions.
- **The cloud adapter contract** (what the core relies on; the test cloud implements exactly this, and PR 3 checks Firestore against it):
  1. `get(id)` and the read inside a transaction return the latest committed state: server reads (`getDocFromServer`), never the SDK's memory cache.
  2. `page(from or after, n)`: documents with `srv ≥ from` (or after a (srv, id) pair), ordered by (`srv`, id), read from the server (`getDocsFromServer`); each page is one consistent read (`readTime` of `runQuery`).
  3. `listen(from)`: after its first server snapshot, after each change of a document matching `srv ≥ from` its latest state arrives at least once, possibly repeated; intermediate states may be skipped (a listener can fall back to polling), and no order across documents is assumed. The core needs only the latest state (`rev > base`).
  4. `totals()`: `count` and `sum(rev)` of a collection in one aggregation query, served only by the backend with one `readTime`. Aggregations read only indexed fields, so `rev` keeps its ascending index. A sum of integers is a 64-bit integer, exact here.
  5. Nothing is assumed about the order in which commits become visible relative to their `srv`.
  **Completeness:** a committed document either changes after the listener's first snapshot with an `srv` in its range (delivered), or is visible to a later catch-up page in its range (read), or else makes the totals differ and is applied by the full pass. The last step depends on no time window; at worst it brings a missed document a day later.
- **`refetch:` marks** are handled after attempts are resolved and at start: read the document from the server and apply it as above. A version of an unknown note gets a mark and waits for the note. A version of a note in `purged:` is not applied; from PR 4a, with an owner, it gets a tombstone job (§4.9).
- **Tests:** over 200 documents with one `srv`; a failure between pages; a write between the catch-up and the listener; a repeated `rev`; filling in `tsrv` at an equal `rev`; a commit that becomes visible below `cursor − margin` long after it was made: the listener and the catch-up miss it, the totals differ, the full pass applies it; a check racing another device's write (a catch-up and a second check, no full pass); an ignored version of a purged note, a version waiting for its note, a quarantined document and a tombstone of a note never seen here all count in `seen`, and the totals match; a check with an unresolved `try:` or an unfinished first load waits; a lasting mismatch makes at most one full pass a day; a document deleted from the cloud past the rules is logged and the local note sent again, not looped, and the other two devices take the recreated document (rule 1) so the totals meet on all three and the quarantine stays empty; a vanished document met on the send path leads to the same resend; a stale delivery after a tombstone does not bring a version back; an old copy pasted in the console is quarantined by the full pass and the totals meet, without a daily pass; a state from before a recreation delivered late does not lower `seen`; a recreation in the window before the echo of an own write is recognized through `seen.after`; a recreated tombstone is applied as a deletion; a full pass larger than the budget goes on the next day and declares nothing vanished until it is complete; a merge equal to the remote by content sends nothing; an aggregation error is «unknown»; a merge in §4.5 step 2 leaves the previous state in «Історія»; a document with `updated` a year ahead does not change `vthin`; one document without space for its history does not stop the rest of the page, and a lasting `QuotaExceededError` stops receiving once, without re-reading; a listener restart after a reconnect re-reads only the margin; two incoming edits in quick succession leave both previous local states in «Історія»; a failed history write applies nothing and the document comes again.

### 4.7 Merging

**Three-way `merge3(base, local, remote)`:**

- Note fields (`title`, `deleted`, `archived`, `revived`) are compared with the base one by one. `created` = the smaller.
- Blocks are matched by id and have two groups of fields:
  - «place»: `row`, `fx`, `parent`, `col`, `cw`, `ch`, `collapsed`;
  - «content»: `kind`, `text`, `html`, `lang`, `wrap`, `num`, `open`, `title`, `color`.
- Deleted on one side and untouched on the other → deleted; deleted on one side and changed on the other → the changed block stays.
- **A conflict** (one field or group changed differently on both sides): the side with the larger key (`updated`, monotonic per device, §4.4; `dev`; hash of the canonical form of §4.15) wins; a missing `dev` is an empty string. Both devices compute the same key. The losing side becomes a conflict copy in full; if both sides lose somewhere, both source copies are kept.
- `updated` of a merge result (`merge3` or `merge0`) whose content differs from the local record is a local write by this device's monotonic clock (§4.4), not the larger of the two, so a remote time does not carry into the next conflict (the owner's decision). A result equal to the remote document by content (without `updated`) takes it as it is, `updated` included, so a merge that only takes the other side causes no send. Receiving without local changes takes the document as it is.
- **Structure:** `parent` must point to an existing area, otherwise the block moves to the sheet where the area was. Layout on display is not saved. Test: ten repeated deliveries cause no write.

**First merge `merge0(local, remote)`** (same id, no base):

- Equal after normalization → base = `remote`.
- Otherwise: blocks are united by id; a shared id with different content comes from the side with the larger key; note fields come from that side too, but `deleted` wins; both source copies become conflict copies in the same local transaction.

**Deletion and revival** (the owner's decision, the same on every device):

- **The revived note's id** is new and random, like any new note's, with `revived: {from, dev, at}`, where `from` is the root: the original id, or the `revived.from` of a local copy that is itself a revived note. The device keeps it in `purged:n:{id}.revivedAs`. A later edit of the same original (another tombstone, an import, a second delivery) follows the pointer: into the revived note while it is alive on the device; if that note was purged too, on through its own `purged:` entry. If the chain ends without a live note, a new revived note is made, and every entry passed on the way (the original's and each purged revived note's) is pointed to it, in the same transaction as the move of the text. Writing `rev` into an entry never drops its `revivedAs`. The chain has no cycles: each target of `revivedAs` is created after every entry that points to it, and ids are not reused; its depth is the number of successive «forever» along it, each step one read in the same transaction. A new id is random, so it never matches a purged one.
  - **A tombstone of a note this device never had** (a new device, a note purged before this device saw it) → `purged:n:{id} = {rev}` and `seen`, nothing else.
  - **An incoming note with `revived.from = X`** while the local `purged:n:X` has no `revivedAs` → the pointer is set to that note, so a late edit of X here goes into it instead of making a second revived note on this device.
  **Two devices that revive the same note independently** make two revived notes. Both stay, each marked «відновлена з «{title}» · {device}, {date}» (the device from `dn`), and the owner joins them by hand. It takes a deletion «forever» on one device and unsynced edits of that note on two others, and it loses nothing (the owner's decision, replacing the deterministic address sequence of the first draft).
- **Moving text into the revived note** is its own operation, not sync. The moved copy of the original and the revived note share no history, even when the revived note has a base of its own. So:
  - blocks are united **without assuming a common base**, by the block rules of `merge0`: united by id; a shared id with different content comes from the side with the larger key; a block missing on one side **stays**;
  - the revived note keeps its own fields (`title`, `deleted`, `archived`); a new one gets them by the rule below;
  - both sources (the current revived note and the moved copy) are kept as conflict copies; copies with equal content are not duplicated (compared by hash);
  - the original's conflict copies move to the revived note (`versions.note`);
  - all in one transaction, together with `purged:n:{id} = {rev, revivedAs}` and a job to send the revived note.
  The revived note then syncs with its own cloud document by the usual `merge3` with its real base. Moving the same text again changes nothing. New text (another device, a repeated import) is added without removing anyone's blocks.
  Test: the revived note has {A, B}; a late copy of the original {A′} that never saw B arrives. Result: {A′ or A by key, B} and both source copies.
- **Where the revived note goes:**
  - **the trash by default** (the owner's decision: «the edit goes to the trash»), also after a manual «forever» even if another device had restored the note from the trash;
  - **the list** (or the archive, if it was there) only when both hold: the tombstone came from the **automatic purge** (`auto: true`), and the moved copy had been **restored from the trash** (its base was in the trash and the local copy no longer has `deleted`). An explicit restore beats only the automatic purge, never a manual deletion.
  - If the revived note in `revivedAs` is already in the trash and the «list» rule applies, it moves to the list. This is the one exception to «the revived note keeps its own fields», for `deleted` only, in the same transaction as the move of the text.
- **Trash against an edit:** `deleted` stays, the text merges, the period is extended (`deleted` = the merge time; the server sets `tsrv` when it is sent).
- **A tombstone from the cloud against a local copy:**
  - the copy did not change since the base and has no conflict copies → delete locally;
  - otherwise → revival.
- **A local «forever» in the queue against a newer cloud edit:**
  - step 2 sees `R.rev > base.rev` and merges locally: the text of `R` moves into the revived note, the original's base = `R`;
  - then two independent ordinary attempts, one document each: the revived note (create, or merge with its cloud copy) and the original's tombstone with `expect = R.rev`.
  Their order does not matter for safety: the revived text is already on the device.
- **An accepted tombstone with late local edits:** §4.5 step 5.
- **Importing** an id from `purged:` moves the text into the revived note (as above, removing none of its blocks).

### 4.8 Trash and deleting forever

- **Tombstones** are kept forever. A document with `purged` never changes.
- **The trash date.** Entering the trash and extending it, the send writes `tsrv` = server time; the rules require it on every change of `deleted`. The device learns `tsrv` from the echo of its write or from a catch-up, by the rule «an equal `rev` fills in server fields» (§4.6).
- **The automatic purge**, with an owner:
  - only the leader tab, signed in, online, after a catch-up;
  - candidates: `tsrv` known and `Date.now()` − `tsrv` over 30 days, by the device clock (the owner's decision);
  - notes with conflict copies on this device are skipped;
  - the purge is a cloud transaction: `deleted` still set, the same `tsrv` and `rev` → a tombstone with `auto: true`;
  - **the rules check the age themselves:** `request.time > resource.data.tsrv + 30 days`. a clock ahead only makes the rules refuse, and that note is tried again the next day; a clock behind only purges later;
  - a restore on another device changes `rev` → the attempt is rejected.
- **`purgeOld()` at start:** with an owner the old rule by the device clock does not run at all, not even before sign-in. Without an owner, as now.
- **Tests:** delete → restore → delete; an extension with an equal numeric `deleted`; `tsrv` after a lost response; a device clock two days ahead (refused, tried again the next day); an early purge refused by the rules; a restore racing the purge.

### 4.9 Named versions

Planned in detail for PR 4a (§5.1). What exists before it: versions are received (`applyVersionDoc` in `public/sync.js`), and `out:v:` jobs are queued when «Зараз» is named and when a device is bound to an account (`setOwner`), but the engine loads only `out:n:` jobs and nothing sends them; naming a shown version and renaming queue nothing; there is no «Видалити версію».

**What goes to the cloud.** Only a version with a `name`. Automatic records (`base`, `auto`, `import`, `incoming`, `restore`, `conflict`) and conflict copies (`reason: 'copy'`) never go: they stay on the device that made them (§2, §4.19).

**Legacy named versions.** VERSIONS-PLAN PR 3 (in production before sync PR 1) wrote named versions with `name` only: no `keep`/`inline`, the bodies in `blobs`. `setOwner` today queues only `keep && name`, so these never sync. In 4a, whenever a named record is queued (`setOwner`, `versionLocal`, and a one-time pass at load over records with `name` and no `keep`), the same transaction inlines its bodies from `blobs` (`s`, `r`) and sets `keep`/`inline`; only a body that is really missing makes it `partial`.

**The document** is `{note, t, name, title, blocks}` with the stamp of §4.5 (`v`, `rev`, `op`, `srv`, `dev`, `dn`, `rcpt`), as the rules of §4.16 require (`vlive`). `blocks` are the record's entries without `h`, each with its body in `s` and `r: 1` for rich text: the form `applyVersionDoc` and `normVersion` already read. `t` is the record's `t`. The record's local fields (`keep`, `inline`, `w`, `reason`, `sig`, `size`, `sum`, the record's own `dev`/`dn`) are not sent; the rules refuse `keep` and `inline`. After creation only `name` changes; `t`, `title` and `blocks` never do (the rules refuse it).

**Local operations** are one core call, `SYNC.versionLocal(op)`, one IndexedDB transaction over `versions` + `sync` with the (epoch, env, uid) check of §4.4. `index.html` builds the record as it does now (`vwrite`, with the bodies inline) and passes it in; the core writes it, bumps `meta:v:{id}.lrev` and queues the job. Without an owner the same call only writes the record.

| Operation | From | Effect |
|---|---|---|
| `create {rec}` | «Зафіксувати версію…» on «Зараз» | the new named record; a job, unless the version is local-only. A block over 256 KiB has no history body (`h: null`, `vwrite` skips it); for a named version its body is inlined anyway, so the version is `partial` only if the document would not fit |
| `name {id, name, bodies}` | «Назвати цю версію…» on a shown automatic version | the record gets `name`, `keep`, `inline` and the bodies the history still has; a body that is gone leaves the entry without `s`, so the version is «неповна» and local-only |
| `rename {id, name}` | «Перейменувати версію…» on a shown named version | only `name`; a job if the version is (or will be) in the cloud |
| `delete {id}` | «Видалити версію» (§4.19 has the dialog) | below |

- **Local-only** is decided when the job would be queued, and never changes afterwards, since the content of a version never changes:
  - `partial`: an entry has no `s` after the legacy inlining (a named old version that lost a body; the history shows «текст цього блоку не зберігся»);
  - `big`: the document is over the limit, counted as for notes (`docBytes` of the wire form + 512 + the receipts, `putNote`) with the name at its 80-character maximum, so neither a rename nor more receipts later push it over;
  - `shape`: a field over a limit the rules enforce (`note` ≤ 64, `name` ≤ 80, `title` ≤ 2000, `blocks` ≤ 5000), possible only from an import.
  Such a version has no job and does not count as waiting; `meta:v:{id}.local` says why. `setOwner` (a first sign-in, «Додати до хмари») uses the same check when it queues the device's named versions. An incoming document of that id clears `local` (the cloud has it after all).
- **Jobs from before 4a.** Since PR 1, `vwrite` and `setOwner` wrote `out:v:` jobs with no `meta:v:` and no local-only decision; .dev devices have them. At the first load of 4a every `out:v:` without a `meta:v:` decision is judged once (local-only, or `lrev` 1 with the job kept); a version job whose record is gone and which has no base and no `try:` is dropped. From 4a on, every path that removes a note's versions also removes their jobs: `deleteRecord` drops the `out:v:` of a version that has no base and no `try:` and turns the others into tombstone jobs; `purgeLocal`'s «never in the cloud» path drops its versions' jobs.
- **Deleting:**
  - **certainly never in the cloud** (local-only; or no base, no `seen:v:`, no `try:`, and the versions catch-up done once for this owner, the proof `purgeLocal` uses for notes) → the record, the job and the meta go, and `meta:v:{id}` keeps `{gone: true}` so an old export does not bring it back; nothing goes to the cloud;
  - **no base but not proven absent** (after `setOwner` every meta is cleared and the new account's cloud may already hold the version) → the record goes, the job becomes `{tomb: true}`; on send it reads `R`: no `R` → the job goes (a tombstone cannot be created: `create` requires `vlive`), `R` live → the tombstone goes over `R.rev`, `R` a tombstone → done;
  - a base (the version is in the cloud) → the record goes locally at once (it leaves «Історія»), the job becomes `{tomb: true}`, the meta keeps the base until the tombstone is accepted; then base = the tombstone, `seen` = `expect+1` with `after`;
  - a `try:` in flight (a create or a rename) → the job becomes `{tomb: true}` and waits for the outcome: accepted → the tombstone goes as the next attempt over `expect+1`; rejected → step 2 reads the cloud and decides below; a refused create (the note was purged meanwhile) → nothing is in the cloud, the job goes.

**Sending** follows §4.5 with `try:v:` and the same receipts. The differences:

1. **Order.** A create or rename job is picked only when its note is in the cloud (`meta:n:{note}.base.rev ≥ 1`) and not in `purged:n:`. Until then it waits without a read and without spending the budget; `pickJob` checks the condition on every pass, so any transaction that gives the note a base (an accepted attempt, or a merge equal to the cloud copy after `setOwner`) lets it go. A create or rename of a version of a purged note drops its job (the record is already gone with the note, §4.7). **A tombstone job needs no live note** (the rules always allow deleting): it goes whenever its version may be in the cloud, also after the note is purged. Notes go first: a version job is picked only when no note job is ready, so what other devices show changes first. Versions share the device pace (one send per 3 s) and the budget; a create or a rename costs one write and, besides the reads of §4.17, the rules' `noteAlive` read, which is counted.
2. **Prepare** reads `R` as in §4.5 step 2, skipped on the same condition (the listener of `versions` delivered `base.rev`). Versions have no `merge3`: only the name and the deletion can change, and deletion beats renaming:
   - `R` is a tombstone → the record and the job go here, base = `R`; a rename waiting here is dropped;
   - `R` is live and newer than the base, and the job here is a tombstone → the tombstone goes over `R.rev`;
   - `R` is live and newer, and the job here is a rename → the name here goes over `R.rev`: the rename sent last wins on every device (the owner's decision, §5.1), with no copy;
   - the name here equals the base's (or `R`'s) → nothing to send: the job goes and `baseLrev = lrev` (a rename back, A → B → A, sends nothing);
   - `R` exists and there is no base (a resend after `setOwner` or after the cloud lost the base, two devices with the same imported versions, or an id collision) → `canon(wire(record))` against `canon(wire(normVersion(R)))`, the same transform on both sides, without `name`: equal → base = `R`, and a rename job only if the names differ; different → the record here takes a new id and is queued as a new version; a tombstone job (the record is already gone) → the tombstone goes over `R.rev`. So the comparison holds, a received record keeps the cloud's `t` as it is (today `applyVersionDoc` stores `min(t, vnow())`; the clamp moves to the display, as for a note's future `updated`);
   - no `R` and a base → the document vanished past the rules: a create or rename job creates it again (`expect = 0`), as for notes (§4.5 step 4); a tombstone job just goes. A full pass that finds a version vanished (`scanComplete`) queues it the same way (today it only drops the base).
3. **A refused write** (`permission-denied`) is judged like a note's (§4.5, `refusedWrite`): one check read of the version; a moved revision → rejected, back to step 2; the same revision → one read of the note: absent → the note vanished past the rules: in that transaction its base and `seen` go and, when it is alive here, it is queued again (as `vanishedTx` does), so rule 1 holds the version until the note is accepted (no loop of refused writes); purged → the job and the record go (the note's tombstone is on its way here); live → `err: 'invalid'`, «Не синхронізовано» for this version only, the others go on.
4. **Finish** as §4.5 step 5: accepted → base = the written document, the job goes if `lrev == sentLrev`; an accepted tombstone → the meta keeps the tombstone as base, the record is already gone.

**Receiving** (`applyVersionDoc`) learns the local side, in its one transaction:

- a `try:` → a receipt with `rev == expect+1` finishes it as accepted, otherwise `refetch:`, as for notes;
- a tombstone → the record goes, a rename waiting here goes, base = the tombstone; a tombstone waiting here is resolved (nothing more to send);
- live with `rev == base.rev` → only the server fields of the base, as §4.6 rule 2;
- live and newer, nothing waiting here → the record takes the document (in practice its name);
- live and newer, a rename waiting here → the record keeps its name, base = the document, the job stays and goes over it;
- live and newer, a tombstone waiting here → the record stays deleted, base = the document, the tombstone goes over it;
- a quarantined version sets `meta:v:{id}.err = 'damaged'`, so the status counts it (today only notes do);
- **a version of a note in `purged:`** is not applied, and with an owner it gets a tombstone job (meta base = the document), so the text of a note deleted forever does not stay in the cloud in its named versions (the owner's decision, §5.1). The device that purges a note does the same for its versions in the transaction that removes them (`deleteRecord`, which reads them by `versionsOf(note)` before deleting): a version with a base or a `try:` gets a tombstone job, one without either is dropped. Two devices doing it for one version cost one rejected attempt, which then reads the tombstone and stops.
- After applying, the leader sends `ver {note}` over BroadcastChannel, so a tab with that note's «Історія» open reloads it (today only the leader's own panel does).

**Revival** (§4.7): a named version of the original with no base **and no `try:`** moves with the text into the revived note (`note` = the revived id; its job stays; the cloud document does not exist yet, so the rule that a version keeps its note does not apply); one already in the cloud goes with the original (the owner's decision, §5.1). A version with a create in flight stays on the original until the attempt resolves: accepted → it goes with the original (its tombstone job follows); refused (the note was purged first) → it moves then.

**Import** with an owner: `importHistory` (today a raw transaction over `versions` and `blobs` that queues nothing) becomes a core call, one transaction over `versions`, `blobs` and `sync`. A named version from the file is skipped when its id was deleted here: a tombstone base, a tombstone job or `try:`, or `meta:v:{id}.gone`; so a deleted version never comes back from an old export. An unknown id is queued as a new version (with the legacy inlining and the local-only check); a known live one is left as it is. Conflict copies and automatic records import as now, local only.

**States** in «Історія», on the rows of named versions, only when the device has an owner:

| State | When |
|---|---|
| у хмарі | a live base, no job, no `try:` |
| ще не надіслано | a job or a `try:`, also while it waits for its note |
| лише тут: завелика | `local: 'big'` |
| лише тут: неповна | `local: 'partial'` |
| не синхронізовано | `err: 'invalid'` or `'damaged'` |

A named version received from another device shows the device of its document's stamp (`dn`), which after a rename is the renaming device; the row says «{пристрій}» without claiming who created it.

The core answers them through `SYNC.versionStates(note)` (one read transaction over `meta:v:`, `out:v:` and `try:v:` of the note's versions); the status of §4.18 counts the jobs and attempts of both streams.

**The rules of §4.16 are enough for this; PR 4 changes none.** Checked against `firestore.rules` and `tests/rules/firestore.mjs`:
- deletion beats renaming: an update over a version with `deleted` is refused, so a rename sent after a tombstone is rejected and its device takes the tombstone (step 2); a tombstone sent after a rename is rejected on `rev`, reads the rename and goes over it;
- a deleted version never comes back: a tombstone is final (`!('deleted' in resource.data)`), and a create over an existing id is an update, refused by the same condition; `allow delete: if false`;
- creating and renaming need a live note (`noteAlive`: the note exists and has no `purged`); a note in the trash is enough; deleting is always allowed, also after the note is purged;
- a rename changes only `name` and the stamp (`affectedKeys().hasOnly`), and keeps `note`.
PR 4a adds four rules tests: a create-shaped write (`rev` 1) over an existing tombstone is refused; a tombstone of a version with no document (a create) is refused; a tombstone of a version whose note is in the trash is allowed; a rename of a version whose note is in the trash is allowed. The test cloud (`tests/lib/cloud.mjs`) gains the checks it lacks for versions: a rename that changes anything but `name` and a tombstone that changes `note` are refused. Its «empty write» refusal stays (the real rules allow a same-name rename, but the core never sends one, step 2).

**Other tabs.** A version operation in a tab that does not lead sends `put`-like `vput {id}` so the leader reads its queue at once, as for notes (`nudge`).

### 4.10 Tabs and the open note

- **The leader tab:** `navigator.locks.request('baobook-sync:{env}')`. The lock is released on `pagehide` and `freeze` (PR 2: a request still waiting in the queue is aborted then; any view-only mode releases the lock and never asks for it; browsers without the `freeze` event release it when the tab is hidden); on `pageshow` and `resume` the tab checks (epoch, env, uid) and asks for it again (PR 2: also when another tab reports a change of owner; a mismatch, found there or by the engine's own check, locks the tab as view-only). A new leader continues unresolved attempts (§4.5 step 1); PR 2: it reloads the engine from the store first, and an attempt insured by one runner is never insured over by another.
- **Other tabs** only write locally. BroadcastChannel carries `{id, lrev}` (PR 2: `put {n, lrev}`, `chg {id, lrev, dn, dev}`, `gone {id}` and `owner`); `takeNote` compares `lrev` whenever both sides know it (equal `lrev` → by `updated`), with or without an owner.
- **The editor snapshot `E`:**
  - a save: `D` = the screen; in the transaction write `merge3(E, D, C)` over the current `C`; then `E := D`, even without redrawing;
  - the record is never overwritten wholesale from the DOM.
- **A safe point:** wait for `compositionend` → save → redraw from IndexedDB, `E := C`.
- **Tests:** several saves without a redraw; IME; two tabs; a frozen leader; two runners of one `op`; bfcache (a tab that still holds a Web Lock may not enter it: the test reads `notRestoredReasons` instead of assuming either).

### 4.11 Account

- **Sign-in order:**
  1. Finish the sign-in.
  2. Check access with the first read of the catch-up: refused by the rules → no access; a network error → could not check. There is no access document to read.
  3. Compare `owner` (none / same uid / another uid).
  4. Only then receive and send.
- **Any change of owner** (a first sign-in on a device with notes, «Додати до хмари B», «Прибрати й увійти») is one IndexedDB transaction:
  - a new `epoch`, `owner` := B;
  - remove all sync metadata of the previous owner (`meta`, `seen`, `out`, `try`, `refetch`, `purged`, `cursor`); `clock` and `quota` stay with the device;
  - for «add» and a first sign-in, queue every local note and named version for B without a base (`merge0` runs when sent);
  - for «remove», delete `notes`, `versions`, `blobs`.
  An unresolved attempt of A from an old tab may still land in A's cloud. That is A's data in A's cloud, and A's tab cannot write anything locally afterwards because of the epoch.
- **(epoch, env, uid)** is checked in every write transaction, when applying incoming data, when finishing a send, on `pageshow`/`resume` and before sending.
- **Sign-out:**
  1. Stop receiving.
  2. Wait for the current attempt to resolve (up to 10 s, «Завершую надсилання…»); otherwise the `try:` is resolved at the next sign-in.
  3. BroadcastChannel, release the lock, `signOut()`, `terminate()`.
  The owner and the queue stay.
- **«Прибрати нотатки з пристрою»** is a change of owner to «nobody»: a new epoch, everything erased. The dialog lists what is not in the cloud and offers an export with history. From PR 4a it also counts what lives only here and is erased with the rest: named versions kept «лише тут» (§4.9) and notes with conflict copies (§4.19), as «Лише на цьому пристрої: N іменованих версій, конфліктні копії в M нотатках»; the owner dialog («Додати до хмари B», «Прибрати й увійти») says the same.
- **The account panel** (PR 4c). Today the account is a row in the gear menu (the email, the status line, «Увійти через Google» / «Вийти», «Прибрати нотатки з пристрою») and the cloud button only says its status in a toast. PR 4c adds a panel «Обліковий запис»: a dialog on a computer, a bottom sheet on a phone with its own history entry (Back closes it), opened by the cloud button and by the account row of the menu. It reads the leader's state (mirrored in other tabs by `st`, which gains the fields below) and the store; it never reads the cloud. From the top:
  1. The email of the signed-in account, or of the owner when signed out («Вийшли»).
  2. The status of §4.18 with one sentence of explanation for its code («Зміни з цього пристрою ще не дійшли до хмари», «Перевіряю, чи хмара має все, що бачив цей пристрій»…). For «Не синхронізовано» a list of what is stuck, at most 20 rows, each with its reason (too large, a loop, a damaged record in the cloud, refused by the rules, too many devices) and a link that opens the note.
  3. Counts, each shown only when not zero: notes waiting, named versions waiting, named versions only on this device (too large or incomplete), notes with conflict copies (a link to the first, §4.19).
  4. «Перевірено о HH:MM»: the time of the last matching totals check of both collections (§4.6), so «Синхронізовано» has a date.
  5. Today's use of the device budget (§4.17): «Сьогодні: N читань, M записів із лімітів пристрою» (the owner's decision 6, §5.1).
  6. «Назва пристрою»: the name other devices see in «Є зміни з {пристрій}», conflict copies and revived notes (`dn`). Editable, up to 80 characters, empty restores the default (the browser and system). It is written to `sheet:settings.devName` and the store's `device` record in one step; the leader's engine takes it before its next write (`checkOwner` already refreshes the device record), the other tabs hear `dev` over BroadcastChannel. Old documents keep the name they were written with.
  7. The buttons: «Увійти через Google» or «Вийти», «Експортувати з історією», «Прибрати нотатки з пристрою». The menu row stays as it is and opens the panel.
- **Without IndexedDB** sync is paused.
- **Keeping the data on an iPhone:** WebKit may erase a site's storage after seven days of Safari use without a visit; an app on the Home Screen has its own counter. With an owner, `navigator.storage.persist()` is also asked at start (now it is asked only after a save), and Safari on an iPhone, outside the installed app, shows once a hint to add Baobook to the Home Screen.

### 4.12 Sign-in, hosts and the Worker

| Host | Mode |
|---|---|
| `baobook.matamata.app` | env `app` |
| `baobook.matamata.dev` | env `dev` |
| `localhost` / `127.0.0.1` | the emulator only (`demo-baobook`) |

- Other hosts have no sync. This separates data spaces; it is not a security boundary, since the rules cannot see which site a request came from.
- `authDomain` = `location.hostname`.
- The Worker proxies `/__/auth/*` to `<project>.firebaseapp.com` transparently (`/__/firebase/init.json` serves only Hosting's automatic setup, which the app does not use) (GET and POST, query and body, no redirects, no cache); `main` lives in `worker/`, `assets.run_worker_first: ["/__/*"]`.
- A redirect on touch devices and in the installed app, a popup on a computer. Before a redirect, save everything and set `signin:'pending'`. If the SDK is not loaded yet, the first press loads it and goes on: the redirect at once (it needs no fresh press), the popup while the browser still counts the press as fresh; a blocked popup is no error, the button says «Продовжити з Google» and the next press opens it.
- The installed app on iOS is checked on a real iPhone.

### 4.13 Service worker

- Requests of the site to `/__/` are left alone (the first line of `fetch`).
- The SDK from `www.gstatic.com/firebasejs/<version>/` is cached when used, not precached. Only `baobook-` caches are cleaned.
- Tests: an update from the old worker; no `/__/` responses in Cache Storage.

### 4.14 Storage, rollback and release

**PR 0, released to production ahead of the rest:**

1. `indexedDB.open('sheet')` without a version. On a new device that makes an empty v1, then v2 creates the stores.
2. **The format check comes first**, before the fallback copies move and before any cleanup. If the data is newer than the code knows (in PR 0: a database version above 2; from v3 on also `sync.format`), the app is view-only:
   - no writes at all, the localStorage fallback included;
   - no `purgeOld`, `vthin`, `vsweep`, `clearHist`;
   - the export keeps the raw history records, `keep`/`inline` included.
3. **`versionchange`** from a newer app: one last attempt to save the screen while the connection is still open → close → view-only; anything left unsaved in memory can be exported («Експортувати незбережене»). `blocked` and `VersionError` are handled.
4. **Fallback copies from localStorage** that differ are both kept: the newer as the note, the other as a separate note «… (резервна копія)», in one IndexedDB transaction. A fallback key is written once by one save (`sheet:note:<id>~<tab>~<generation>`), and a tab removes only its own keys of older generations, so neither a late older save nor another tab removes a copy that may be the only one. Nothing can change until the start is done (its notes would replace anything made meanwhile), and saves wait until the database is open. Deleting a note for good with IndexedDB removes the note and this tab's own fallback keys of it; another tab's key is left alone, so a copy not moved in yet brings the note back at the next start instead of being lost. A record that is not a note stays in localStorage.
5. **Without IndexedDB** (a rare environment; sync is paused there anyway, §4.11) the app only saves and exports. One tab writes, under a Web Lock held while it is open (`baobook:writer`); any other tab opens view-only with a strip and export, so no two tabs write the shared keys at once. When the lock cannot be confirmed (no Web Locks API, a refused request, no answer in 3 s) the tab opens view-only too, with its own strip and export: the start ends, but nothing is written. A tab with IndexedDB moves plain keys in and drops them only while it holds the same lock (or the browser has no Web Locks, and so no tab without IndexedDB writes); otherwise it keeps the keys and moves a plain copy in only when it is newer than the stored note, so restarts stack no backup copies, and a later start under the lock joins the older copy as one backup. Nothing is deleted for good: «Видалити назавжди», «Очистити кошик» and the 30-day purge are off, notes stay in the trash. At start the writing tab joins fallback keys left from a time IndexedDB worked into the plain keys; a copy whose backup does not fit stays in its key, shows and exports as a backup copy, and the plain key holding the older copy is not overwritten until a later start joins them.

**Production code from before PR 0** promises nothing here. So the release order is: PR 0 to production → the owner opens .app on every device → only then v3.

**Export:** the format stays; records with `keep`/`inline` are included. `sync` is not exported.

**Import** with an owner is a local write through the queue; an id from `purged:` moves its text into the revived note (§4.7).

### 4.15 Normalizing incoming data

`normNote()` and `normVersion()` are pure deterministic functions for data from the cloud and from imports:

- **Canonical block order:** (`row`, `fx` or `col`, id, block JSON); the result does not depend on the order in the array.
- **Duplicate ids:** the first in canonical order keeps the id; duplicates with equal content are dropped; the others get `id + '~' + hashOf(block JSON)`; a `parent` that pointed to a duplicated area points to the kept one.
- Field types and ranges, finite coordinates, a known `kind`, `parent` pointing to an existing area (otherwise to the sheet), `html` through `cleanRich()`, size limits.
- A document without the basic shape → `quarantine:` and «пошкоджений запис у хмарі», with an export of the raw document.
- **The canonical form** is what is hashed and compared: object keys in sorted order, no `undefined`, optional fields with their default value dropped, numbers as JSON numbers (`-0` as `0`). `hashOf` and every equality check of notes, blocks and copies take only this form, so a block built by `serBlock` and the same block back from Firestore (whose map key order is the SDK's) give one hash.
- **Every default the canonical form drops reads back as that default:** `fx` 0 on the sheet, `col` 0 in an area, empty `text`, `false` flags. Found on .dev on 2026-10-20: a block in an area's first column went to the cloud without `col`, the receiver refused the note as `shape`, and after «Прибрати нотатки з пристрою» seven notes stayed in quarantine. The normalizer now reads a missing `col` as 0; at start a note quarantined for its shape is checked again under the current normalizer and, when it passes, is marked (`recheck`) and read from the cloud again; one that still fails stays. The read goes through rule 1 against the `seen` record, which stays: the same revision is fresh, a document recreated meanwhile is recognized and merged with the note here (also with a local edit waiting) instead of being taken for the base. The quarantined copy stays until the transaction that applies the document deletes it, so a read that fails after the restart (no network, a refusal) loses nothing and is tried again; a document that still fails is quarantined again in that transaction.
- **Tests:** `norm(norm(x)) == norm(x)`; shuffling the block array changes nothing; a block with its keys in another order gives the same hash; two «devices» get the same result; `norm(canon(x)) == x` for every default.

### 4.16 Security rules (draft)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function allowed() { return request.auth != null && request.auth.uid in ['<the owner uid>']; }   // no document read
    function owner(env, uid) { return env in ['dev', 'app'] && allowed() && request.auth.uid == uid; }
    function str(v, max) { return v is string && v.size() > 0 && v.size() <= max; }
    function optNum(d, k) { return !(k in d) || d[k] is number; }
    function optPos(d, k) { return !(k in d) || (d[k] is number && d[k] > 0); }   // deleted, archived: a time, absent when not
    function receipts(d, o) {                 // own receipt == this op; other devices' receipts untouched
      return d.rcpt is map && d.rcpt.size() <= 200 && d.rcpt[d.dev] == d.op
        && (o == null ? d.rcpt.keys().hasOnly([d.dev])
                      : d.rcpt.diff(o.rcpt).affectedKeys().hasOnly([d.dev]));
    }
    function stamp(d, o) {                    // every synced document
      return d.v == 1 && d.rev is int && d.rev == (o == null ? 1 : o.rev + 1) && d.srv == request.time
        && str(d.op, 40) && str(d.dev, 40) && (!('dn' in d) || str(d.dn, 80)) && receipts(d, o);
    }

    match /env/{env}/users/{uid}/notes/{id} {
      function live(d) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','title','blocks','created','updated'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','dn','rcpt','title','blocks','created','updated','deleted','archived','revived','tsrv'])
          && d.title is string && d.title.size() <= 2000 && d.blocks is list && d.blocks.size() <= 5000
          && d.created is number && d.updated is number && optPos(d, 'deleted') && optPos(d, 'archived')
          && (!('revived' in d) || d.revived is map) && (!('tsrv' in d) || (d.tsrv is timestamp && 'deleted' in d));
      }
      function tomb(d, o) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','purged'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','dn','rcpt','purged','auto']) && d.purged is number
          && (!('auto' in d) || (d.auto == true && o != null && 'deleted' in o && o.deleted is number && o.deleted > 0 && 'tsrv' in o
                                 && request.time > o.tsrv + duration.value(30, 'd')));   // the server checks the age
      }
      function trashDated(d, o) {            // entering or extending the trash is dated by the server
        return !('deleted' in d)
          || (o != null && 'deleted' in o && d.deleted == o.deleted && d.get('tsrv', null) == o.get('tsrv', null))
          || d.get('tsrv', null) == request.time;
      }
      allow get, list: if owner(env, uid);
      allow create: if owner(env, uid) && stamp(request.resource.data, null)
        && (tomb(request.resource.data, null) || (live(request.resource.data) && trashDated(request.resource.data, null)));
      allow update: if owner(env, uid) && !('purged' in resource.data)            // a tombstone is final
        && stamp(request.resource.data, resource.data)
        && (tomb(request.resource.data, resource.data)
            || (live(request.resource.data) && trashDated(request.resource.data, resource.data)));
      allow delete: if false;
    }

    match /env/{env}/users/{uid}/versions/{id} {
      function noteAlive(note) {
        let p = /databases/$(db)/documents/env/$(env)/users/$(uid)/notes/$(note);
        return exists(p) && get(p).data.get('purged', null) == null;
      }
      function vlive(d) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','note','t','name','title','blocks'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','dn','rcpt','note','t','name','title','blocks'])
          && str(d.note, 64) && d.t is number && str(d.name, 80)
          && d.title is string && d.title.size() <= 2000 && d.blocks is list && d.blocks.size() <= 5000;
      }
      function vtomb(d) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','note','deleted'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','dn','rcpt','note','deleted']) && d.deleted == true;
      }
      allow get, list: if owner(env, uid);
      allow create: if owner(env, uid) && stamp(request.resource.data, null)
        && vlive(request.resource.data) && noteAlive(request.resource.data.note);
      allow update: if owner(env, uid) && !('deleted' in resource.data)           // a deleted version stays deleted
        && stamp(request.resource.data, resource.data)
        && request.resource.data.note == resource.data.note
        && (vtomb(request.resource.data)                                          // deleting is always allowed
            || (vlive(request.resource.data) && noteAlive(request.resource.data.note)   // rename: live parent, same snapshot
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name','rev','op','srv','dev','dn','rcpt'])));
      allow delete: if false;
    }
  }
}
```

- **Access** is the owner's uid, put into the rules after the first sign-in on .dev (§6). A request from any other account is refused without reading a document (any Google account can sign in to the project, and its config is public). So a refusal costs no dependent read and no bandwidth; whether a refused query still counts as the one-read minimum is not documented. A manual measurement on .dev in PR 3 settles it (a second Google account, the console's usage; the emulator bills nothing), and if it does count, App Check moves forward from §8. The only dependent read left is `noteAlive` when a version is created or renamed, counted as one more read. When sync requests open, the list becomes a custom claim (`request.auth.token.sync == true`) set by an admin script (§8).
- A trashed note carries `tsrv`; a restored one drops it.
- An aggregation query passes the rules as a `list` (the rules check the possible result set and read no data), so `allow get, list` covers the totals check; PR 3 adds a negative test of an aggregation from another account.
- `v == 1`: a change of the document format needs the new rules published first, then the client released.
- `hasOnly` limits the keys and `hasAll` requires them. The rules do not check other devices' receipt values; they only forbid changing them.
- Block contents are checked by the normalizer.
- **Receipt limit: 200 devices over a document's lifetime.** It counts installs: clearing site data makes a new `devId`. Old receipts cannot be cleaned, since that would destroy the proof of old attempts' outcomes. At the limit a new device cannot change that document: the note shows «Не синхронізовано: забагато пристроїв» and offers «Створити копію нотатки» (a new id, the same text); other notes go on. `devId` is also kept in `sync` to make new installs rarer. Decided and tested in PR 3.
- **Receipts do not authenticate a device:** the client sends `dev`, and another client of the same account could technically claim someone else's `devId`. For a personal app with one owner this is an accepted limit; there is no separate device authorization.
- The rules are `firestore.rules` at the repository root, tested on the emulator by `tests/rules/firestore.mjs` in CI (#64; 153 checks: every forbidden change, others' receipts, other accounts and aggregations, collection-group queries, partial writes). Two changes from the first draft came out of those tests and their review: a version's `note` takes up to 64 characters, the core's id limit (`LIM.id` in `public/sync.js`), not 40; and `deleted`/`archived` must be positive (`optPos`), since a device reads 0 as «not in the trash» and the automatic purge of such a note would otherwise pass. 3c put the owner's uid in place of the `'OWNER_UID'` placeholder on 2026-10-19; the owner publishes the rules.
- Indexes: `srv` and `rev` ascending (§4.2).

### 4.17 Size and load

- **The size limit** is 960 KiB (1 MiB minus 64 KiB), one value in the code and the interface, checked before every write and after merging. A note or version over it is skipped with a mark.
- **One send:** 1 write (the receipt is inside the document); 2 reads on the sender (the read in the transaction and the listener echo; 3 when `R` has to be read first, §4.5 step 2); 1 read on every other device. The rules read a document only for a version write (`noteAlive`, §4.16).
- **Totals checks** (§4.6): about 150 reads a day per device for 1 000 notes, about 1 500 for 5 000 notes and 15 000 versions; a full pass, at most once a day per collection, costs one read per document and is counted in the budget like any read.
- **Device budgets per Pacific day.** The device's count is an estimate: it adds documents returned, one read per query as the minimum (empty pages and aggregations included), aggregation reads per 1 000 index entries, the `noteAlive` read of a version write, the first load, reconnects and retries. It cannot see every charge (index-entry reads Firestore may bill for a query, a refused request), so the budgets stay well below the project limits, and the PR 3 measurement compares the estimate with the console's usage.

| Env | Writes per device | Reads per device | Worst case |
|---|---|---|---|
| .app | 4 000 | 9 000 | 3 devices: 12 000 writes / 27 000 reads |
| .dev | 1 500 | 4 000 | 2 devices: 3 000 / 8 000 |
| **Total** | | | **15 000 of 20 000 writes (75 %), 35 000 of 50 000 reads (70 %)** |

  - At 70 % of the device budget, at most one send per 30 s.
  - At 100 %, a **hard stop** of sync until the next day; local work goes on with «ліміт на сьогодні · N змін чекають».
- **Pace:** at most one send per 3 s per device and per 5 s per note; a note over 64 KB at most once per 30 s, over 256 KB once per 2 min and when the owner leaves it. A send moves the whole document 3–5 times (the sender and every other device), so big notes are what uses up the 10 GiB of monthly outgoing traffic first: an hour of editing a 120 KB note on three devices is about 0.43 GB (#56).
- **The first load of a device** brings the notes first and the named versions after them, in the background; «Історія» of a note whose versions have not arrived says «версії ще завантажуються». So 5 000 notes take one day of the device budget, and their versions follow over the next days.
- **Empty sends** are cut: content is compared by the canonical form without `updated` before queueing and before writing; receiving without local changes does not change `updated` or `op`.
- **Emergency stop:** over 30 sends of a note in 5 minutes with no typing in it (the counter survives a restart).
- **Measured in PR 3 on .dev:** 3 devices for an hour, with the first load and reconnects; the device's estimate against the console's usage. Criterion: the extrapolated owner's day stays within 25 % of the project limits.

### 4.18 Status

The full status of PR 4c covers both streams: notes and named versions. What 3b built is a minimal status: the core's `status()` counts only note jobs, its code `checking` (the full pass) is shown as «Перевіряю доступ…» (the account's own `checking`), and «Очікую підтвердження» shows as «Надсилаю…». A fourth gap: no code sets `at` on an attempt (`insureTx` writes none), so «over 30 s» holds for every attempt at once. PR 4c fixes the four: `insureTx` stores `at`, and the status of a resumed attempt counts from the time this engine first ran it.

The core computes the code in the leader tab, the other tabs mirror it (`st`), and the account code of `index.html` puts its own states first (from `signingOut` to `signedOut` below). The first row that holds wins; the core's own rows (from `denied` on) keep the order the core has today (`unverified` after `offline`: offline says more):

| Code | Text | When | Icon |
|---|---|---|---|
| — | no icon | no owner and not signed in | — |
| `reload` | Оновіть сторінку | the core found another owner or epoch in the store (§4.4 step 1); the tab turns view-only («epoch», §4.10), and the lock strip says why | bad |
| `signingOut` | Завершую надсилання… | sign-out waits for the step in flight (§4.11) | busy |
| `loading` | Завантажую… | the SDK is loading | busy |
| `signingIn` | Вхід… | a sign-in is under way | busy |
| `checking` | Перевіряю доступ… | the access probe or the owner dialog (§4.11) | busy |
| `open` | База не захищена: правила не опубліковано | the probe's write passed | bad |
| `other` | Інший обліковий запис — оберіть дію в іншій вкладці | the owner dialog runs in another tab | bad |
| `signedOut` | Вийшли · N змін чекають | an owner, not signed in | off |
| `denied` | Синхронізація за запрошеннями | the rules refused the first read: the account is not on the list | bad |
| `reauth` | Увійдіть знову | the sign-in must be repeated | bad |
| `nospace` | Немає місця на пристрої | receiving stopped for lack of space (§4.6) | bad |
| `limit` | Ліміт на сьогодні · N змін чекають | the device budget is spent | off |
| `offline` | Офлайн · N змін чекають | offline | off |
| `unverified` | Не вдалося перевірити доступ | the first read after the sign-in failed on the network | bad |
| `error` | Не синхронізовано · N | a note or a version with `size`, `loop`, `invalid`, `damaged` (a version's quarantine sets it too, §4.9) or `receipts`; N = how many; the panel lists them with their reasons | bad |
| `scan` | Перевіряю повноту · N | a full pass after a lasting totals mismatch (§4.6); N documents read so far | busy |
| `waiting` | Очікую підтвердження | an attempt unresolved for over 30 s while online | sending |
| `sending` | Надсилаю… · N | jobs or attempts of either stream, or `refetch:` marks | sending |
| `versions` | Отримую версії… | the notes' first catch-up is done and the versions' is still running (§4.17) | busy |
| `synced` | Синхронізовано | no jobs, attempts, `refetch:` marks or errors in either stream; both listeners got a server snapshot; the totals check of both collections matched since connecting | synced |
| `pending` | Синхронізація… | anything else (connecting, the first snapshot or check still to come) | busy |

- **N** counts the jobs and attempts of both streams, a note or a version once each. Not counted: a job waiting out its day (an automatic purge the rules refused as early), local-only named versions (§4.9, they have no job), and conflict copies, which never sync.
- A view-only tab (a newer app, a rollback, «epoch», no IndexedDB writer) shows no sync status of its own: the strip of §4.14 says what it is, and the button is hidden.
- The core's codes are `none`, `reload`, `denied`, `reauth`, `nospace`, `limit`, `offline`, `unverified`, `error`, `scan` (renamed from `checking`), `waiting`, `sending`, `versions`, `synced` and `pending`; the leader's `st` message carries the code, N, the error count, the time of the last matching totals check and the counts of the panel (§4.11), so a second tab shows the same panel.
- «Історія» of a note whose versions have not arrived yet (`versions` above, or no versions cursor while the device has an owner) says «версії ще завантажуються» under the list.
- Icons differ in shape, not only colour (the five shapes 3b drew: a check, an arrow, a slash, an exclamation mark, three dots). The button has an `aria-label` with the text. A press, or a tap on a phone, opens the account panel with the explanation; today's toast goes.

### 4.19 Conflicts in the interface

The owner's decision (§2): conflict copies are kept until the owner removes them; a «N конфлікт» mark on the history button, «Відновити» and «Прибрати» on the copy. Planned for PR 4b (§5.1), with the history actions of named versions from PR 4a.

**What a conflict copy is** (built in PR 1): a record in `versions` with `reason: 'copy'`, `keep: 1`, `inline: 1`, the full bodies, the losing side's `updated`, `dev` and `dn`. A merge makes it (§4.7: `merge3`, `merge0`, a move into a revived note; also two tabs of one device without an owner, §4.10). It lives only on the device that merged: it is never sent (§2), never thinned, not counted in the history budget, not removed by «Очистити історію», and a note in the trash with a copy is not purged automatically (§4.8); «Видалити назавжди» names how many copies go with the note.

**On the screen:**

- **The history button** of the open note shows the number of its copies as a small badge; its `title` and `aria-label` become «Історія · N конфлікт» (plural forms in the language files: «1 конфлікт», «2 конфлікти», «5 конфліктів»). No copies, no badge.
- **The note list** marks a note with copies by the same small sign after its title, and the account panel counts such notes (§4.11). When a merge in the open note makes a copy, a toast says «Конфлікт із {пристрій}: іншу версію збережено в історії · Показати»; «Показати» opens «Історія» on the copy (the owner's decision 4, §5.1).
- **The row of a copy** in «Історія» reads «конфліктна копія · {пристрій}» (as now) with the time of the losing side's `updated`, and under it «лише на цьому пристрої».
- **A shown copy** puts two buttons in the panel's footer instead of «Відновити цю версію»:
  - «Відновити»: the note takes the copy's state the way «Відновити цю версію» works (the state before becomes «base», the result is written as «restore» from the copy), and the copy is removed, since the conflict is resolved (the owner's decision 2, §5.1); «Скасувати» in the toast brings back both the note and the copy.
  - «Прибрати»: the copy goes, the badge counts down, and a toast «Копію прибрано · Скасувати» brings it back (the record is kept in memory until the toast goes).
  «Повернути цей блок» works on a copy as on any version and leaves the copy in place: taking one block resolves nothing on its own.
- **«⋯» of the panel** gains «Прибрати конфліктні копії (N)» when the note has more than one; it asks in the in-app dialog (`ask()`), with no undo.
- Removing a copy is local, one IndexedDB transaction over `versions` (no job: copies never sync). Once a note in the trash has no copies left, the automatic purge takes it at its next hourly look (§4.8).
- The other tabs: the leader's `ver {note}` (§4.9) and a tab's own removal both refresh the badge, the list mark and an open «Історія».

**Named versions in «Історія»** (PR 4a, §4.9):
- the row of a named version shows its state under the name, only with an owner: «у хмарі», «ще не надіслано», «лише тут: завелика», «лише тут: неповна», «не синхронізовано»;
- «⋯» on a shown named version: «Перейменувати версію…» (the existing «Назвати цю версію…» takes this label on a named version) and «Видалити версію»;
- «Видалити версію» asks in the in-app dialog: «Видалити версію «{name}»?» with «Її буде видалено на всіх пристроях.» when the version is or may be in the cloud, else (no owner, or a local-only version) «Її буде видалено з цього пристрою.»; there is no undo, since the tombstone is final in the cloud. The panel then shows «Зараз».

## 5. Pull requests (into `main`, checked on .dev)

| PR | What | Acceptance and tests |
|---|---|---|
| 0. Storage groundwork | **Merged ([#55](https://github.com/Yokogamma/baobook/pull/55)).** Opening without a version; the format check first; view-and-export mode; `versionchange` with a save and an export; `blocked`/`VersionError`; both fallback copies kept; this document in English. **Released to production before the rest.** | A new device. An old tab with unsaved input. A rollback onto a v3 database with real `keep`/`inline`/`sync`: view-only; nothing written, localStorage included; the export keeps the raw records. The format check before the fallback move. Differing fallback copies. (`tests/appformat.mjs`) |
| 1. Core, one tab | **Merged ([#61](https://github.com/Yokogamma/baobook/pull/61)), released by [#62](https://github.com/Yokogamma/baobook/pull/62) on 2026-10-18.** Built: the core in `public/sync.js` (UMD, no build step), the wiring in `index.html`, the test cloud in `tests/lib`. What differs from the row: the editor snapshot `E` and the safe point came in with PR 1, since one tab needs them too; versions are received but not sent until PR 4 (`out:v:` jobs are queued); the `sync` store also holds `scan:{col}` and `device` (§4.3); a note that was certainly never in the cloud is purged without a tombstone. The plan as approved: `sync` (v3); epoch; writes as deltas; the queue with an owner; sending (local merge, insured attempt, cloud transaction with a receipt, finish); receiving with the cursor and `refetch:`; `merge3`/`merge0`; the monotonic device clock; the canonical form; the `seen` registry and the totals check; revival after «forever»; `keep`/`inline` on every deletion path; the new «Очистити історію»; `verBlocks` without substitution; exporting copies; the normalizer and quarantine; the rate limiter and budgets; the import contract; the cloud adapter interface. **A test cloud** in `tests/lib` with failures: «commit accepted, response lost», a later write by another device, a retry, a delay, a repeated delivery, reordering, a commit that becomes visible long after later ones (beyond any window), the `count`/`sum(rev)` totals, two runners of one `op`. | Node: merging; the normalizer and the canonical form (two «devices», keys in another order); the monotonic clock (two edits in one millisecond, the clock set back). **A randomized simulation** with a fixed seed and an operation log for replay: three test devices, random operations (field-group edits, moves, block deletion, trash, restore, «forever», import), random offline spells, test-cloud failures and leader changes; the invariants: every device converges, no edit vanishes without a conflict copy, no empty `op`, no write after repeated deliveries. CI runs a few seeds and prints a failing one. Playwright, two contexts: the cloud moved ahead and the local result equals the cloud (copies kept, base and queue right); a lost confirmation followed by another device's write; a failure after each local commit; a failed insurance; two runners of one `op`; two devices reviving the same note (two marked revived notes, nothing lost); importing the original again after its tombstone was confirmed (the text goes into the same revived note); importing it again after the revived note was purged too (one new revived note, and both entries point to it); a tombstone of a note never seen here; an incoming revived note becomes this device's pointer; an import keeps the file's `updated`; a future `updated` shows as the arrival time in the list; the totals check in every state of §4.6 (ignored and waiting versions, quarantine, unresolved attempts, a document deleted past the rules and recreated, a full pass over several days); moving {A′} into an existing revived note {A, B} (B stays); purging the revived note and a new late edit (a new revived note from the original, also offline); a deletion started → local `lrev` changed → the cloud confirmed the tombstone (the edits are in the revived note); a restore from the trash during the automatic purge (`auto: true`) → the note in the list, also when the revived note was already in the trash; the same after a manual «forever» → the note in the trash; a vanished document or a smaller `rev` (quarantine); a local «forever» against a cloud edit; an incoming tombstone with local conflict copies; a shifted clock (concurrent edits decided by the key, the losing side kept with its device and time); a commit visible only after the window (found by the totals check); an incoming edit kept in «Історія»; over 200 documents with one `srv`; convergence; size; v2 → v3. |
| 2. Tabs and the open note | **Built.** The leader tab under the Web Lock `baobook-sync:{env}`: released on `pagehide` and `freeze` with the queued request aborted, asked again after the owner check on `pageshow` and `resume` and on another tab's «owner» message, released by any view-only mode, released on `visibilitychange: hidden` in browsers without `freeze`, and handed over by a hidden leader to a visible tab that asks for it (`lead?`, sent by a queued visible tab when it queues, when it is shown, when it writes, at most once in 2 s for writes, and when the leader says it is hidden: the leader's status message carries `hidden`, sent when it starts leading, when it is hidden and with every status; the leader that lets go queues again at once, so the lock returns to it when the asker is gone and passes on through hidden tabs queued ahead of the asker; added after 3b: Chrome does not freeze a page holding a lock but throttles a hidden tab's timers to one a minute after five minutes, so the sync crawled in a tab left in the background while the visible one waited); a new leader reloads the engine from the store; the other tabs' messages wake it. What differs from the row: the messages are `put {n, lrev}`, `chg {id, lrev, dn, dev}` (the leader applied a document), `gone {id}` (a tombstone purged) and `owner`, and `takeNote` compares `lrev` whenever both sides know it, with or without an owner; the engine's `devId` and `devName` come from the store's `device` record (written once per device), so every tab writes as one device and a receipt proves any tab's attempt; `insureTx` refuses to insure over another runner's attempt, a runner whose attempt another one finished forgets it, and the cursor is bumped against the stored one so a late runner never moves it back; a change of owner met by a write, by the «owner» message, by the `resume` check or by the load that comes with the lock (`reload()` refuses a store whose owner changed while the tab waited, inside the transaction that reads it) turns the tab view-only («epoch») with the refused text under the unsaved warning; a catch-up page or a full-pass page that meets the change applies nothing and leaves no cursor or scan state to the new owner; the leadership has a generation and every engine start a run id, so a start still running when the lock goes (pagehide, freeze, a LOCK) connects nothing and changes nothing of a start that took over meanwhile; a tab locked as «epoch» keeps its screen as it is on every path (messages, the storage check when shown again, pending changes); the old tab protocol's «conflict» record and toast are gone (the pending write merges, the same field edited in two tabs leaves a conflict copy); the safe point is the caret leaving every field of the note, except the empty block a click on the sheet makes, which holds nothing back and is put back with the caret after the redraw (the owner's decision); the strip «Є зміни з {пристрій} · Оновити» shows while a change waits for the caret or for a failed write, names the device from `dn` or «інша вкладка», and «Оновити» saves what is typed and takes the caret out. A frozen leader is tested with a synthetic `freeze` (headless Chromium does not freeze through CDP); the real one is on the phone checklist. | Node (`syncguard`): two engines over one store. Browser: `appleader`, `apptablrev`, `appeditor`, `appbfcache` (a browser launched with the cache on; the test reads `pageshow.persisted` and, when not restored, `notRestoredReasons`). |
| 3. Firebase, sign-in, account | **Built in part: 3a (the cloud infrastructure) and 3b (sign-in and the account); 3c (the owner's uid in the rules, 2026-10-19; the owner publishes them).** 3a: the Worker proxy for `/__/auth/*` (`worker/index.js`, `wrangler.jsonc`); the service worker (v8) leaves `/__/` alone and caches the SDK when used; the Firestore adapter as its own file `public/cloud.js` (the SDK module and the instance come in as dependencies, so the same file runs in the browser over gstatic and under Node over the npm package; the server time is stamped there; times cross as `{s, ns}` with nanoseconds; the listener asks for metadata changes so a re-subscription reports its server snapshot); the core: a refused read is «denied» and a refused write is judged by one check read (the account, the content, or a moved revision, since the emulator refuses a transaction's stale write by the rules instead of retrying it), the first read lost on the network is «could not check», `unauthenticated` answers in a row are «reauth», a refused early automatic purge waits a day (`wait` on the job, cancelled by an edit), the receipt limit is seen in the transaction's own read, the automatic purge runs as a step action after a catch-up and then hourly, `setOwner` covers `blobs` and takes `erase` and `expectEpoch`; the Firebase SDK is 12.19.0 (`tests/rules` test the same version); CI: the adapter test in the rules job and a `sync-emulator` job over the Auth and Firestore emulators with the SDK served from a local cache and every request to a real host aborted. 3b: the account in `index.html` over the SDK 12.19.0 loaded on demand (at start with an owner, a remembered user or a redirect under way, else on the first press of «Увійти через Google», which then goes on to the sign-in itself: the redirect at once, the popup while the press is still fresh, else the button says «Продовжити з Google» for the next press; a module that failed stays failed in the document, so the message asks for a reload); the hosts of §4.12 with the emulator config on localhost behind the `emulator` flag in the settings (the pace and budgets too, for the tests); `authDomain` is the site's host. What differs from the row: the access and the rules are checked by a probe before the owner is compared (one `limit(1)` read of the notes, refused → «Синхронізація за запрошеннями», lost → «Не вдалося перевірити доступ», tried again when the network is back; then one write of `probe/{devId}` the rules must refuse, accepted → «База не захищена», deleted again), and only for a new or another account: the same owner connects at once and the catch-up's own reads are the check; the owner dialog («Нотатки на цьому пристрої належать A»: export with history, «Додати до хмари B», «Прибрати й увійти», cancel = sign out) runs in one tab under the Web Lock `baobook-owner-dialog`, the tab where the sign-in happened first and the others 1.5 s later, which show «виберіть у іншій вкладці» and reload after the decision (or re-adopt the engine when the records stayed); every change of owner is `setOwner` with `expectEpoch`, a race says so and reloads; before it everything typed is written (`saveNow`, up to 5 s) and the page stops writing and taking (`DYING`); the signed-in user is mirrored in the settings (`fbUser`) before the lock is released on sign-out, so the next leader checks it synchronously (`authGate`) and never starts a cloud of a user who left; the tabs exchange `auth` (a sign-in loads the SDK elsewhere, a sign-out drops the cloud at once) and `st`/`st?` (the leader's status, mirrored); sign-out stops the engine, waits up to 10 s for the step in flight («Завершую надсилання…»), detaches a stuck engine (a fresh one takes its place, the old one's callbacks are ignored), signs out and terminates the Firestore instance, keeping the owner and the queue («Вийшли · n змін чекає»); «Прибрати нотатки з пристрою» counts the unsent notes and named versions, offers the export, then signs out, erases and reloads; the redirect (touch or the installed app) saves everything, marks `signin:'pending'` in the settings and the tab in sessionStorage, and a failed result is reported; three `unauthenticated` answers (`reauth`) sign the user out locally with «Увійдіть знову»; the status is a cloud button in the header and a line under the account in the menu (a job waiting out its day is not «sending»); the receipt limit shows the strip «Не синхронізовано: забагато пристроїв · Створити копію нотатки» (the copy syncs in its place, the original's job goes: `unqueue` in the core); `persist()` at start with an owner; the Home Screen hint once on an iPhone outside the app. After the review of 3b: every binding passes the epoch the tab's engine knows (`expectEpoch`, the same owner's email update included), so a stale tab never writes the owner back over another tab's change; the owner question is dropped when the device is no longer A's as when it came up (a decision taken elsewhere within the 1.5 s); a tab with text not in storage (a failed write, typing) keeps its screen view-only as «epoch» with the export instead of reloading, both after another tab's decision and after its own binding was refused by the epoch (one path, `epochMoved`); the tab that signed in tells the others (`auth`), so a tab without the SDK loads it; and `setOwner` marks every queued note as a local change over no base (`lrev` 1), so a document of the same id in the new account's cloud is merged with it (`merge0`) instead of replacing it and dropping the job (found by the account scenario: «Додати до хмари» onto an account that already had the note). The plan as approved: SDK; Worker; service worker; hosts; popup/redirect; the owner's uid in the rules; owner and owner change with the epoch; sign-out; «прибрати»; `tsrv` and the automatic purge by the device clock; `persist()` at start and the iPhone Home Screen hint; `firestore.rules`; a minimal status. | 3a: `worker` (Node), `appsw`, `syncaccess` (Node), `apppurge`, `rules/adapter` (the Firestore emulator), `emu/smoke` (both emulators). 3b: `appaccount` (the test cloud: a host without a project, the SDK that cannot load, the status button and the menu, the leader's status mirrored in a second tab, the receipts strip and the copy); on both emulators `emu/signin` (the first press, the sign-in binding the device and sending its notes, a second device of the account, sign-out keeping the owner and the queue, the SDK at start, the sign-in again sending what waited), `emu/account` (the dialog and its cancel, the export, «Додати до хмари», a second tab following a sign-out, «in the other tab», «Прибрати й увійти» reloading both tabs, «Прибрати нотатки з пристрою»), `emu/trash` (`tsrv` on entering the trash, the early purge refused by the rules and the day's wait, the purge after the month), `emu/receipts` (200 receipts, the strip, the copy), `emu/redirect` (the way out with the note written and the mark set; the way back needs Google's gapi script, so the failed return is checked and the successful one by hand). Not as tests: a frozen tab of A after the change (the epoch tests of PR 2 cover it); the billing of a refused request and the read estimate, by hand on .dev (SYNC-CHECKLIST.md). The rules tests on the emulator already exist (#64); PR 3 extends them with the Auth emulator for sign-in. The receipt limit: device 201 is refused and the note offers a copy. No requests to the real Firebase in CI. A load measurement on .dev. |
| 4. Versions, conflicts, status | **Planned in three parts (§5.1), waiting for the owner's approval.** 4a: named versions in the cloud (the version sender of the core, «Перейменувати версію…» and «Видалити версію», the version states, tombstones for the versions of a purged note); 4b: conflicts in the interface (§4.19: the badge «N конфлікт», «Відновити» and «Прибрати» on a copy, the list mark); 4c: the account panel (§4.11) and the full status over both streams (§4.18). | 4a: `syncversions` (Node), `syncsim` with version operations, two rules tests, `appvsync`, `emu/versions`. 4b: `appconflict`. 4c: `syncaccess` (the status codes), `appaccpanel`, a check in `emu/signin`. The scenarios of each part are in §5.1. |
| 5. Documentation | This document updated to what was built, README, CLAUDE.md. | — |

### 5.1 PR 4 in three parts

PR 4 touches the core's queue, the history panel and the account, so it is built in three PRs into `main`, in this order, each with its own scenarios and checked on .dev before the next. The design is in §4.9, §4.11, §4.18 and §4.19; this section says what each part builds and how it is tested. At least one check of every new scenario must fail on the code before it (checked by putting the file from `HEAD` back; some checks guard behaviour that already holds, such as the automatic purge skipping a note with a copy), and the full run of `tests/` passes before each PR. 4a is the largest part; if its diff grows past review, it goes in two PRs, the core first (4a-1, Node tests only) and then the interface (4a-2).

**4a. Named versions in the cloud.**
- The core (`public/sync.js`):
  - the queue covers both streams: the engine loads `out:v:`, `try:v:` and `refetch:v:` beside the note ones; the in-memory maps are keyed by stream and id; `backoff`, `pickJob`, `nextWake` and `status()` take the stream; the note paths keep their behaviour;
  - the version sender of §4.9: the order after the note, the prepare step without `merge3`, the insured attempt, the cloud transaction with the receipt, the finish, the refusal by one or two check reads;
  - `applyVersionDoc` with the local side (a waiting rename or tombstone, a `try:`), the tombstone job for a version of a purged note, the version tombstones queued by an accepted note tombstone;
  - `versionLocal(op)` and `versionStates(note)`; `setOwner` with the legacy inlining and the local-only check; the one-time pass at load over legacy named records and the jobs from before 4a; `deleteRecord` and `purgeLocal` handle their versions' jobs; the revival moves unsent named versions without a `try:`; `importHistory` as a core call that skips deleted versions; `scanComplete` queues a vanished version; `applyVersionDoc` keeps the cloud's `t`; `vput` from other tabs;
  - the status counts both streams (§4.18 for its full form comes in 4c, 4a only counts).
- `public/index.html`: naming «Зараз», naming a shown version, renaming and deleting go through `versionLocal` (the direct `out:v:` write in `vwrite` goes); the state line on named rows; «Перейменувати версію…» and «Видалити версію» with the dialog; `ver {note}` between tabs; `unsyncedCount` from the core, with a third count «only here» (local-only named versions and notes with conflict copies) that the removal dialog and the owner dialog show (§4.11). The strings in both language files.
- Tests:
  - `tests/syncversions.mjs` (new, Node over the test cloud):
    - naming queues one job with `lrev` 1; a version waits for its note (the note offline-queued: no version read or write) and goes after the note's accepted attempt, one write;
    - created and deleted before the first send: the cloud never sees it; deleted while its create is in flight: accepted → the tombstone follows, rejected → nothing remains;
    - a rename is one write that changes only the name; renames on two devices converge on the one sent last; a rename against a deletion, in both orders: deleted on both, the rename never comes back;
    - a rename after the note was purged is refused by the rules, the job and the record go, nothing loops;
    - a version of a purged note received from the cloud gets a tombstone; an accepted note tombstone queues tombstones for its versions; two devices doing it leave one tombstone;
    - local-only: a version over 960 KiB and one with a missing body are never sent and not counted as waiting, before and after `setOwner`;
    - a lost confirmation is resolved by the receipt; two runners of one version attempt leave one commit; a vanished version is created again;
    - the budget counts a version write and its `noteAlive` read; notes are picked before versions;
    - the totals of `versions` match after creates, renames and tombstones (`seen:v:`);
    - the import of a file with a version deleted here leaves it deleted, also while its tombstone is in flight and after a deletion that never reached the cloud (`gone`); the revival takes an unsent named version along and drops a sent one; a version whose create is in flight during the revival stays with the original and goes with it when accepted;
    - a legacy named record (`name` only, bodies in `blobs`) is inlined and sent, not «неповна»; a version named from «Зараз» on a note with a block over 256 KiB keeps that body;
    - jobs from before 4a: an `out:v:` without meta over 960 KiB becomes «лише тут: завелика» and is not sent; an orphan `out:v:` whose record is gone is dropped; a note deleted forever that was never in the cloud leaves no version job, and the status reaches «Синхронізовано»;
    - deleting a version in the window after `setOwner`, before its job was sent, while the cloud of the new account already holds it: the tombstone goes, and the catch-up does not bring it back;
    - two devices with the same imported named versions sign in to one account: one copy of each in the cloud and on both devices, none with a new id;
    - a refused version create whose note vanished from the cloud: the note is queued again, the version goes after it, no second refused write;
    - a rename A → B → A before sending sends nothing;
    - a version tombstone goes after its note was purged here; a version received for a purged note gets one;
    - a quarantined version counts as an error;
  - `tests/syncsim.mjs`: the random operations gain naming, renaming and deleting versions; new invariants: every device holds the same named versions with the same names, no deleted version comes back, no device keeps a version of a purged note.
  - `tests/rules/firestore.mjs`: the four tests of §4.9.
  - `tests/appvsync.mjs` (new, browser, two devices over the shared test cloud): «Зафіксувати версію…» offline shows «ще не надіслано», online «у хмарі»; device B shows it named with A's device; a rename on B reaches A; «Видалити версію» on A asks with «на всіх пристроях» and the version leaves B's open «Історія»; naming an old automatic version whose body is gone shows «лише тут: неповна»; a huge version shows «лише тут: завелика»; a second tab of A with «Історія» open refreshes on `ver`; a version named in a tab that does not lead reaches the cloud without waiting for the leader's minute (`vput`); «Прибрати нотатки з пристрою» counts a version «лише тут».
  - `tests/emu/versions.mjs` (new, both emulators): create, rename and delete through the real rules; a rename after the note is purged on the other device is refused and handled; a version queued before its note makes no refused write.

**4b. Conflicts in the interface** (§4.19).
- `public/index.html`: the badge and the label of the history button; the list mark; the toast with «Показати»; the row «лише на цьому пристрої»; «Відновити» and «Прибрати» on a shown copy with undo; «Прибрати конфліктні копії (N)»; the refresh on `ver` and after a removal in another tab. The core gains `dropCopies(note, ids)` (one transaction, with the epoch check) and `copiesCount()` for the list.
- Tests: `tests/appconflict.mjs` (new, browser, two devices over the test cloud):
  - the same block edited on two offline devices: the device that merges has one copy, the other none; the button reads «Історія · 1 конфлікт», the list marks the note, the toast's «Показати» opens the copy;
  - «Відновити» puts the copy's text in the note and removes the copy, «Скасувати» brings both back; «Прибрати» removes it and the badge goes, «Скасувати» brings it back; «Прибрати конфліктні копії (2)» asks and removes both;
  - the cloud never holds a copy (no version document of `reason: 'copy'` in the test cloud);
  - a note in the trash with a copy is not purged; after «Прибрати» the next look purges it;
  - two tabs of one device without an owner: a copy made by a tab merge shows the badge in both tabs;
  - on a phone (390 wide) the two buttons fit the bottom sheet and the badge is visible.

**4c. The account panel and the full status** (§4.11, §4.18).
- `public/sync.js`: `status()` by the table of §4.18 (`scan`, `waiting`, `versions`, the error count and the errors list, the time of the last match); `deviceName(name)` writes the `device` record.
- `public/index.html`: the panel; the button and the menu row open it; the texts and icons of every code; `st` with the new fields; «версії ще завантажуються» in «Історія»; the device name field.
- Tests:
  - Node, in `tests/syncaccess.mjs`: an attempt carries `at`, and «Очікую підтвердження» comes only 30 s after it (today it comes at once); every code of the core reached by its cause with both streams (a version job alone is `sending`, a version error alone is `error` with its reason, a version catch-up still running is `versions`, `synced` only when both totals matched); the error list names notes and versions.
  - `tests/appaccpanel.mjs` (new, browser over the test cloud): the panel opens from the button and from the menu, Esc and Back close it; each state reached through the test cloud's faults and the hooks: offline with N, a held attempt over 30 s is «Очікую підтвердження», a refused version is «Не синхронізовано · 1» with the row and its link, a full pass is «Перевіряю повноту · N», the spent budget, signed out; the counts and «Перевірено о»; a new device name goes as `dn` in the next document and shows in the second tab; a second tab shows the same panel from `st`; a phone bottom sheet at 390 and 320 wide; `tests/appaccount.mjs` keeps passing with the toast replaced by the panel.
  - `tests/emu/signin.mjs` gains one check: after the sign-in and a named version, «Синхронізовано» is reached on the emulators over both collections.

**Manual checks** of PR 4 go into [SYNC-CHECKLIST.md](SYNC-CHECKLIST.md) with the code of each part: a version named on the phone and renamed on the computer; a conflict made with the phone in flight mode, resolved with «Відновити» and with «Прибрати»; the panel on a phone and with TalkBack/VoiceOver; the device name in «Є зміни з {пристрій}».

**The owner's decisions** (2026-10-20: «С вопросами согласен по умолчанию», every default below accepted; the plan above is written with them). The review of the same day added to question 3 that a version with an attempt in flight waits for its outcome (§4.9 «Revival»).

1. **Two devices rename the same version while offline.** Default: the rename sent last wins on every device, with no copy (a name is short and visible, and a version keeps no `updated` the rules would let it change). The alternative, the later rename by its device's clock, needs a new field and a change of the rules.
2. **«Відновити» on a conflict copy.** Default: the note takes the copy and the copy is removed (the conflict is resolved); «Скасувати» brings both back. The alternative: the copy stays until «Прибрати».
3. **A named version not yet sent when its note is deleted forever elsewhere and revived here.** Default: it moves into the revived note and goes to the cloud with it; a named version already in the cloud is deleted with the original. The alternative: every named version of the original goes.
4. **Where conflicts show besides the history button.** Default: a mark in the note list, a toast with «Показати» when a copy appears in the open note, and a count in the account panel. The alternative: only the history button, as §2 says.
5. **The named versions of a note deleted forever.** Default: they get tombstones in the cloud (one write each), so the note's text does not stay there; the device that deletes and any device that meets one does it. The alternative: they stay in the cloud, ignored by every device.
6. **The device budget in the account panel.** Default: one line, «Сьогодні: N читань, M записів». The alternative: no numbers in the interface (they stay in the sync log).
7. **«Видалити версію».** Default: the in-app dialog, no undo (the tombstone is final in the cloud), only for named versions; automatic ones go only with «Очистити історію». The alternative: an undo toast that delays the tombstone for a few seconds.
8. **The order of PR 4a–4c.** Default: 4a, 4b, 4c, each checked on .dev, then the release of PR 1–4 as §5 «Release» says.

**CI:** Java 21, a pinned `firebase-tools`, `emulators:exec` with `demo-baobook`, a clean emulator between scenarios; `paths` extended with `worker/**`, `wrangler.jsonc`, `firestore.rules`, `firebase.json`. The real OAuth, the Worker and iOS are checked by hand on .dev with a checklist.

**Release:**

1. PR 0 to production.
2. The owner opens .app on every device.
3. PR 1–4 checked on .dev with a copy of the real notes.
4. Export from .app.
5. PR `main → prod`.
6. Sign in on every device.

## 6. What the owner sets up (needed for PR 3)

Done on 2026-10-16: the project `baobook-3fe7f` (Spark, Google Analytics off), the Google provider, the authorized domains `baobook.matamata.dev` and `baobook.matamata.app`, Firestore `(default)` in `eur3`, the web app `Baobook web`, the OAuth client's origins and redirect URIs with the branding, and the first index exemptions (`blocks`, `title`, `rcpt`). On 2026-10-18 the rest of the exemptions: every field of `notes` and `versions` except `srv` and `rev` (36 in all). Left:

1. **Done on 2026-10-19:** the first sign-in on .dev (3b), Authentication → Users → the owner's User UID, into `firestore.rules` (3c).
2. **Done on 2026-10-20:** Firestore → Rules: the text of `firestore.rules` from `main` → Publish (the owner). PR 4 needs no change of the rules (§4.9).

The `access/{email}` document made on 2026-10-16 is not used any more; it can stay or be deleted. The quota is one per project, shared by .dev and .app; the budgets in §4.17 account for that.

## 7. Risks and manual checks

- **Sign-in in the installed app on an iPhone:** a checklist on a real device, [SYNC-CHECKLIST.md](SYNC-CHECKLIST.md) (the redirect's return cannot run on the emulators: it needs Google's gapi script).
- **A merge bug:** merges are only local and insured; tests of failures and of two runners.
- **The same block edited online on two devices:** one edit stays, the other becomes a conflict copy. This is not real-time co-editing.
- **Quota:** a request from an account not on the list reads no document (§4.16; the remaining cost of a refusal is measured in PR 3); budgets with a hard stop and big notes sent less often, measured in PR 3; Blaze with a budget alert before the first outside user, since one user can use up the shared quota for everyone.
- **Storage on an iPhone:** WebKit may erase site data after seven days of Safari use without a visit. `persist()` at start and the Home Screen hint (§4.11); after a sign-in the cloud brings the notes back.
- **Rollback:** safe for the data from PR 0 on (view-only); restoring editing takes a fix released forward.

## 8. Not in this stage

Encryption; sync requests and mailings, and with them access by a custom claim, Blaze with a budget alert, a way to delete an account's cloud data and a privacy note (only the email and uid are used, not the name or photo); Apple sign-in; sharing notes; block-level updates under the caret; a list of the account's devices; App Check. Automatic backups of the notes to the owner's Google Drive are planned as a separate stage after PR 4, in [docs/BACKUP-PLAN.md](BACKUP-PLAN.md).

After the load measurement in PR 3, only if it shows the need: not storing `text` of formatted blocks in the cloud (rebuilt from `html`, about −20 % for an average note); compressing `blocks` of big notes (3–4 times smaller, but the rules and the console no longer see the blocks); Realtime Database instead of Firestore if reads stay the limit; finding a gap by halving `srv` ranges with aggregations instead of a full pass (may need a composite index `srv` + `rev`).
