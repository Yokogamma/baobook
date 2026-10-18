# Sync between devices and Google sign-in

**Status: approved plan; PR 0 ([#55](https://github.com/Yokogamma/baobook/pull/55), released by [#58](https://github.com/Yokogamma/baobook/pull/58)) and PR 1 ([#61](https://github.com/Yokogamma/baobook/pull/61), released by [#62](https://github.com/Yokogamma/baobook/pull/62) on 2026-10-18) are done and in production (the PR 1 row in §5 names what differs); PR 2 is built (its row in §5 names what differs); PR 3–5 are not implemented yet.** Approved on 2026-10-16 after five review rounds (issue [#18](https://github.com/Yokogamma/baobook/issues/18)) and amended on 2026-10-17 with the free-quota estimate ([#56](https://github.com/Yokogamma/baobook/issues/56)), an independent design review and the owner's answers to it. PR 0, the storage groundwork ([#55](https://github.com/Yokogamma/baobook/pull/55)), ships to production on its own. The rest is built in PR 1–4. PR 5 updates this document to match what was actually built. The earlier plan («Чистий аркуш», September 2026) is in the git history of this file.

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
8. **History:** a named version shows «у хмарі», «ще не надіслано», or «лише тут: завелика / неповна».
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
| `meta:n:{id}`, `meta:v:{id}` | `lrev`, the base (the full confirmed cloud state with `rev`, `srv`, `tsrv`), `baseLrev`, loop-guard counters |
| `out:n:{id}`, `out:v:{id}` | queue job {tries, next, err} |
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
- **`refetch:` marks** are handled after attempts are resolved and at start: read the document from the server and apply it as above. A version of an unknown note gets a mark and waits for the note. A version of a note in `purged:` is ignored.
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

- Naming the current state creates a record with `keep` and `inline`: full bodies from the start.
- A named old version that lacks a block body is marked «неповна» and stays on the device only. The history shows «текст цього блоку не зберігся» instead of putting today's text there (PR 1).
- «Назвати», «перейменувати» and «Видалити версію» are one IndexedDB transaction over `versions` + `sync` with an `out:v:` job. Sending follows §4.5.
- **Created and deleted before the first send:**
  - no base and no `try:` → delete locally, drop the job, nothing goes to the cloud;
  - a `try:` → resolve it first: accepted → a tombstone, with `seen` = `expect+1` and `after` (§4.5 step 5); rejected → delete locally.
- **Rules:** deletion beats renaming, and a deleted version never comes back; creating and renaming need a live note, deleting is always allowed.
- **Order:** a version is sent only after its note (`base.rev ≥ 1`). A version of a note in `purged:` is not sent, and its cloud copy gets a tombstone.
- **States:** «у хмарі» (base confirmed), «ще не надіслано», «лише тут: завелика» (over 960 KiB), «лише тут: неповна».

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
- **«Прибрати нотатки з пристрою»** is a change of owner to «nobody»: a new epoch, everything erased. The dialog lists what is not in the cloud and offers an export with history.
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
- A redirect on touch devices and in the installed app, a popup on a computer. Before a redirect, save everything and set `signin:'pending'`. If the SDK is not loaded yet, the first press loads it and shows «Продовжити з Google», and the second opens the popup.
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
- **Tests:** `norm(norm(x)) == norm(x)`; shuffling the block array changes nothing; a block with its keys in another order gives the same hash; two «devices» get the same result.

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
- The rules are `firestore.rules` at the repository root, tested on the emulator by `tests/rules/firestore.mjs` in CI (#64; 153 checks: every forbidden change, others' receipts, other accounts and aggregations, collection-group queries, partial writes). Two changes from the first draft came out of those tests and their review: a version's `note` takes up to 64 characters, the core's id limit (`LIM.id` in `public/sync.js`), not 40; and `deleted`/`archived` must be positive (`optPos`), since a device reads 0 as «not in the trash» and the automatic purge of such a note would otherwise pass. PR 3 puts the owner's uid in place of the `'OWNER_UID'` placeholder and publishes the rules.
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

| State | When |
|---|---|
| no icon | no owner, not signed in |
| Синхронізовано | signed in; no jobs, attempts, `refetch:` marks or errors for notes and versions; both listeners got a server snapshot and the totals check matched since connecting |
| Надсилаю… | jobs or attempts, online |
| Очікую підтвердження | an attempt unresolved for over 30 s while online |
| Офлайн · N змін чекають | offline; N = jobs and attempts |
| Не вдалося перевірити доступ | the first read after sign-in failed on the network |
| Синхронізація за запрошеннями | the rules refused the first read: the account is not on the list |
| Увійдіть знову | the sign-in must be repeated |
| Вийшли · N змін чекають | an owner, not signed in |
| Перевіряю повноту · N | a full pass after a lasting totals mismatch (§4.6); N documents read so far |
| Ліміт на сьогодні · N змін чекають | the device budget is spent |
| Не синхронізовано | a lasting error with its reason (too large, loop, damaged record) |

Icons differ in shape, not only colour. The button has an `aria-label`; on a phone a tap explains the state.

## 5. Pull requests (into `main`, checked on .dev)

| PR | What | Acceptance and tests |
|---|---|---|
| 0. Storage groundwork | **Merged ([#55](https://github.com/Yokogamma/baobook/pull/55)).** Opening without a version; the format check first; view-and-export mode; `versionchange` with a save and an export; `blocked`/`VersionError`; both fallback copies kept; this document in English. **Released to production before the rest.** | A new device. An old tab with unsaved input. A rollback onto a v3 database with real `keep`/`inline`/`sync`: view-only; nothing written, localStorage included; the export keeps the raw records. The format check before the fallback move. Differing fallback copies. (`tests/appformat.mjs`) |
| 1. Core, one tab | **Merged ([#61](https://github.com/Yokogamma/baobook/pull/61)), released by [#62](https://github.com/Yokogamma/baobook/pull/62) on 2026-10-18.** Built: the core in `public/sync.js` (UMD, no build step), the wiring in `index.html`, the test cloud in `tests/lib`. What differs from the row: the editor snapshot `E` and the safe point came in with PR 1, since one tab needs them too; versions are received but not sent until PR 4 (`out:v:` jobs are queued); the `sync` store also holds `scan:{col}` and `device` (§4.3); a note that was certainly never in the cloud is purged without a tombstone. The plan as approved: `sync` (v3); epoch; writes as deltas; the queue with an owner; sending (local merge, insured attempt, cloud transaction with a receipt, finish); receiving with the cursor and `refetch:`; `merge3`/`merge0`; the monotonic device clock; the canonical form; the `seen` registry and the totals check; revival after «forever»; `keep`/`inline` on every deletion path; the new «Очистити історію»; `verBlocks` without substitution; exporting copies; the normalizer and quarantine; the rate limiter and budgets; the import contract; the cloud adapter interface. **A test cloud** in `tests/lib` with failures: «commit accepted, response lost», a later write by another device, a retry, a delay, a repeated delivery, reordering, a commit that becomes visible long after later ones (beyond any window), the `count`/`sum(rev)` totals, two runners of one `op`. | Node: merging; the normalizer and the canonical form (two «devices», keys in another order); the monotonic clock (two edits in one millisecond, the clock set back). **A randomized simulation** with a fixed seed and an operation log for replay: three test devices, random operations (field-group edits, moves, block deletion, trash, restore, «forever», import), random offline spells, test-cloud failures and leader changes; the invariants: every device converges, no edit vanishes without a conflict copy, no empty `op`, no write after repeated deliveries. CI runs a few seeds and prints a failing one. Playwright, two contexts: the cloud moved ahead and the local result equals the cloud (copies kept, base and queue right); a lost confirmation followed by another device's write; a failure after each local commit; a failed insurance; two runners of one `op`; two devices reviving the same note (two marked revived notes, nothing lost); importing the original again after its tombstone was confirmed (the text goes into the same revived note); importing it again after the revived note was purged too (one new revived note, and both entries point to it); a tombstone of a note never seen here; an incoming revived note becomes this device's pointer; an import keeps the file's `updated`; a future `updated` shows as the arrival time in the list; the totals check in every state of §4.6 (ignored and waiting versions, quarantine, unresolved attempts, a document deleted past the rules and recreated, a full pass over several days); moving {A′} into an existing revived note {A, B} (B stays); purging the revived note and a new late edit (a new revived note from the original, also offline); a deletion started → local `lrev` changed → the cloud confirmed the tombstone (the edits are in the revived note); a restore from the trash during the automatic purge (`auto: true`) → the note in the list, also when the revived note was already in the trash; the same after a manual «forever» → the note in the trash; a vanished document or a smaller `rev` (quarantine); a local «forever» against a cloud edit; an incoming tombstone with local conflict copies; a shifted clock (concurrent edits decided by the key, the losing side kept with its device and time); a commit visible only after the window (found by the totals check); an incoming edit kept in «Історія»; over 200 documents with one `srv`; convergence; size; v2 → v3. |
| 2. Tabs and the open note | **Built.** The leader tab under the Web Lock `baobook-sync:{env}`: released on `pagehide` and `freeze` with the queued request aborted, asked again after the owner check on `pageshow` and `resume` and on another tab's «owner» message, released by any view-only mode, released on `visibilitychange: hidden` in browsers without `freeze`; a new leader reloads the engine from the store; the other tabs' messages wake it. What differs from the row: the messages are `put {n, lrev}`, `chg {id, lrev, dn, dev}` (the leader applied a document), `gone {id}` (a tombstone purged) and `owner`, and `takeNote` compares `lrev` whenever both sides know it, with or without an owner; the engine's `devId` and `devName` come from the store's `device` record (written once per device), so every tab writes as one device and a receipt proves any tab's attempt; `insureTx` refuses to insure over another runner's attempt, a runner whose attempt another one finished forgets it, and the cursor is bumped against the stored one so a late runner never moves it back; a change of owner met by a write, by the «owner» message, by the `resume` check or by the load that comes with the lock (`reload()` refuses a store whose owner changed while the tab waited, inside the transaction that reads it) turns the tab view-only («epoch») with the refused text under the unsaved warning; a catch-up page or a full-pass page that meets the change applies nothing and leaves no cursor or scan state to the new owner; the leadership has a generation and every engine start a run id, so a start still running when the lock goes (pagehide, freeze, a LOCK) connects nothing and changes nothing of a start that took over meanwhile; a tab locked as «epoch» keeps its screen as it is on every path (messages, the storage check when shown again, pending changes); the old tab protocol's «conflict» record and toast are gone (the pending write merges, the same field edited in two tabs leaves a conflict copy); the safe point is the caret leaving every field of the note, except the empty block a click on the sheet makes, which holds nothing back and is put back with the caret after the redraw (the owner's decision); the strip «Є зміни з {пристрій} · Оновити» shows while a change waits for the caret or for a failed write, names the device from `dn` or «інша вкладка», and «Оновити» saves what is typed and takes the caret out. A frozen leader is tested with a synthetic `freeze` (headless Chromium does not freeze through CDP); the real one is on the phone checklist. | Node (`syncguard`): two engines over one store. Browser: `appleader`, `apptablrev`, `appeditor`, `appbfcache` (a browser launched with the cache on; the test reads `pageshow.persisted` and, when not restored, `notRestoredReasons`). |
| 3. Firebase, sign-in, account | SDK; Worker; service worker; hosts; popup/redirect; the owner's uid in the rules; owner and owner change with the epoch; sign-out; «прибрати»; `tsrv` and the automatic purge by the device clock; `persist()` at start and the iPhone Home Screen hint; `firestore.rules`; a minimal status. | Emulator: sign-in, sign-out, an account change keeping the notes (a frozen tab of A writes nothing). Edits and deletions after sign-out. `tsrv` after a lost response. A device clock two days ahead: the early purge is refused and tried again the next day. A request from an account not on the list is refused. By hand on .dev: whether a refused request is billed, and the device's read estimate against the console. A restore racing the purge. The rules tests on the emulator already exist (#64); PR 3 extends them with the Auth emulator for sign-in. The receipt limit: device 201 is refused and the note offers a copy. No requests to the real Firebase in CI. A load measurement on .dev. |
| 4. Versions, conflicts, status | Syncing named versions; «Видалити версію»; version states; conflicts in the interface; the account panel; the full status. | A version created and deleted before the first send; renaming after the note was purged (refused by the rules); incomplete and large versions; the status over both streams. |
| 5. Documentation | This document updated to what was built, README, CLAUDE.md. | — |

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

1. **After the first sign-in on .dev (PR 3):** Authentication → Users → the owner's User UID; it goes into the rules.
2. **Firestore → Rules:** the text from PR 3 → Publish.

The `access/{email}` document made on 2026-10-16 is not used any more; it can stay or be deleted. The quota is one per project, shared by .dev and .app; the budgets in §4.17 account for that.

## 7. Risks and manual checks

- **Sign-in in the installed app on an iPhone:** a checklist on a real device.
- **A merge bug:** merges are only local and insured; tests of failures and of two runners.
- **The same block edited online on two devices:** one edit stays, the other becomes a conflict copy. This is not real-time co-editing.
- **Quota:** a request from an account not on the list reads no document (§4.16; the remaining cost of a refusal is measured in PR 3); budgets with a hard stop and big notes sent less often, measured in PR 3; Blaze with a budget alert before the first outside user, since one user can use up the shared quota for everyone.
- **Storage on an iPhone:** WebKit may erase site data after seven days of Safari use without a visit. `persist()` at start and the Home Screen hint (§4.11); after a sign-in the cloud brings the notes back.
- **Rollback:** safe for the data from PR 0 on (view-only); restoring editing takes a fix released forward.

## 8. Not in this stage

Encryption; sync requests and mailings, and with them access by a custom claim, Blaze with a budget alert, a way to delete an account's cloud data and a privacy note (only the email and uid are used, not the name or photo); Apple sign-in; sharing notes; block-level updates under the caret; a list of the account's devices; App Check. Automatic backups of the notes to the owner's Google Drive are planned as a separate stage after PR 4, in [docs/BACKUP-PLAN.md](BACKUP-PLAN.md).

After the load measurement in PR 3, only if it shows the need: not storing `text` of formatted blocks in the cloud (rebuilt from `html`, about −20 % for an average note); compressing `blocks` of big notes (3–4 times smaller, but the rules and the console no longer see the blocks); Realtime Database instead of Firestore if reads stay the limit; finding a gap by halving `srv` ranges with aggregations instead of a full pass (may need a composite index `srv` + `rev`).
