# Sync between devices and Google sign-in

**Status: approved plan, not implemented yet.** Approved on 2026-10-16 after five review rounds (issue [#18](https://github.com/Yokogamma/baobook/issues/18)). PR 0, the storage groundwork, is the first step and ships on its own. The rest is built in PR 1–4. PR 5 updates this document to match what was actually built. The earlier plan («Чистий аркуш», September 2026) is in the git history of this file.

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
| Who can sync | The owner only at first (`access/{email}`). Later, requests through the site, with the email collected and a separate consent to mailings. |
| .dev and .app | Separate data spaces in one Firebase project. |
| Version history | Only named versions go to the cloud. |
| Settings | Theme, grid, language and text size stay per device. |
| Sign-in | A popup on a computer, a redirect to the Google page on a phone and in the installed app. |
| Deletion against an offline edit | The deletion stands and the edit is not lost: a note in the trash takes the edit and its 30 days start again. After «Видалити назавжди» the edit appears in the trash as a revived note with a mark. A copy that was not edited just goes. The same rule on every device. |
| «Очистити історію» | Clears only this device's automatic history. A named version is deleted with its own command, everywhere. |
| Conflict copies | Kept until the owner removes them; a «N конфлікт» mark on the history button, «Відновити» and «Прибрати» on the copy. |
| The open note | With no caret in the note it updates at once. While typing, a strip «Є зміни з {пристрій} · Оновити» appears and the change applies on the button or when the caret leaves the block. |

## 3. What the user sees

1. **Sign-in:** the gear → Google → access check → whose notes are on the device → merge → a cloud icon in the header.
2. **First sign-in on a device with notes:** they join the account. Notes with the same id but different text are merged by block, and both source copies are kept as conflict copies.
3. **«Синхронізовано»** means no jobs, attempts or `refetch:` marks, no errors, and both streams (notes and versions) got data from the server.
4. **An edit on another device:** the note updates at once or through the «Є зміни» strip. Saves made before the screen updates do not erase what came in.
5. **Offline:** «офлайн · N змін чекають».
6. **A conflict** (the same block edited on two offline devices): the edit from the device where the note was changed later stays; the other becomes a conflict copy.
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
access/{email, lower case}                            allowed addresses; the owner edits them in the console
env/{dev|app}/users/{uid}/notes/{noteId}
  v: 1, rev: int, op: string, srv: timestamp, dev: string   service fields of every write
  rcpt: { "{devId}": op }     receipts: the last accepted operation of each device on this document
  title, blocks[], created, updated, deleted?, archived?, revived?: {from, dev, at}
  tsrv?: timestamp            server time when the note entered the trash or its period was extended
  tombstone: v, rev, op, srv, dev, rcpt, purged: number, auto?: true
env/{dev|app}/users/{uid}/versions/{versionId}
  v, rev, op, srv, dev, rcpt, note, t, name, title, blocks[] (full bodies)
  tombstone: v, rev, op, srv, dev, rcpt, note, deleted: true
env/{dev|app}/users/{uid}/devices/{devId}
  name, seen: timestamp       device name and the server time anchor
```

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
| `purged:{id}` | tombstone registry: {rev, revivedAs?} |
| `cursor:notes`, `cursor:versions` | durable cursor {srv with nanoseconds, docId} |
| `quota` | reads and writes per Pacific day, rate limiter tokens |
| `quarantine:{id}` | a damaged incoming document, not applied |

- Everything except `format`, `owner` and `epoch` belongs to (env, uid) and is cleared when the owner changes.
- Conflict copies and named versions live in `versions` with the optional fields `keep:1` and `inline:1`: full bodies inside the record, no thinning, no budget, no `vsweep`, no plain «Очистити історію», no automatic purge.
- New optional note field `revived: {from, dev, at}`. `sheet:settings` gets `devId` and `devName`.

### 4.4 Local writes

Every local write is one IndexedDB transaction over `notes` + `sync` (+ `versions`):

1. Compare (epoch, env, uid) with the tab's. On a mismatch, abort and switch to «reload the page».
2. Read the current record `C`.
3. Apply the operation's delta (the editor: §4.10).
4. If the result equals `C` by normalized content, write nothing.
5. Write the result with `lrev+1`, and a job `out:` if the device has an owner.

Deleting forever with an owner removes the note, its history and blobs locally and queues a tombstone in `purged:` and the queue. Conflict copies go only with an explicit «forever», and the dialog names how many.

### 4.5 Sending (leader tab; one attempt per note)

1. **An unresolved attempt.** If there is a `try:`, it continues at step 4 with the same `op`, `expect` and `result`. An attempt is never dropped without a proven outcome, and no new `op` for the note starts before it is resolved.
2. **Prepare.** Read the cloud document `R` from the server.
   - **The cloud moved ahead** (`R.rev > base.rev`, or `R` exists and there is no base) → **a local merge**, one IndexedDB transaction with the (epoch, env, uid) check:
     - read the current record `C`;
     - note = `merge3(base, C, R)` (a first merge: `merge0(C, R)`, §4.7);
     - the losing sides (both source copies on a first merge) go to `versions` with `keep`/`inline`;
     - base = `R`;
     - if the note equals `R`, the job goes and `baseLrev = lrev`; otherwise the job stays.
     Then step 2 again.
   - **The cloud equals the base** (`R.rev == base.rev`, or neither `R` nor a base):
     - the local copy equals the base → the job goes;
     - otherwise → step 3.
3. **Insure the attempt** in one IndexedDB transaction with the check: `try = {op: new, expect: base.rev, result: the current note S, sentLrev: L, epoch}`. No copies are needed here: the cloud state that will be overwritten equals the base, which the device keeps in full.
4. **The cloud transaction.** The callback has no side effects. It may run several times, and an old and a new leader may run it at once. Read the document `D`:
   - `D.rcpt[devId] == try.op` → **accepted**, no write;
   - `D.rev == try.expect` (or no `D` and `expect == 0`) → write `try.result` with `rev = expect+1`, `op`, `srv`, `dev`, `rcpt = {...D.rcpt, [devId]: op}` → **accepted**;
   - `D.rev > try.expect` and no receipt → **rejected**. This is proven: a commit needs `D.rev == expect` and `rev` only grows; an accepted operation would have left a receipt that other devices do not change; this device starts no new `op` before the outcome is known;
   - no `D` while `expect > 0`, or `D.rev < expect` → **an invariant violation**, not a conflict: the attempt stays, this note stops syncing with «Не синхронізовано: пошкоджений запис у хмарі», and the document goes to quarantine.
   A network error or an unknown outcome leaves the `try:`; step 4 runs again later.
5. **Finish** in one IndexedDB transaction, only if `try.op` is still the same and (epoch, env, uid) match:
   - **accepted** → base = `{rev: expect+1, the result}` if newer than the base. If `lrev == sentLrev`, the job goes and `baseLrev = lrev`. Otherwise the job stays: the newer edits were made over `S`, which is now the base, so the next attempt is a fast-forward too. The `try:` goes.
   - **an accepted tombstone** (a manual «forever» or the automatic purge):
     - `lrev == sentLrev` → the note, its history and blobs go locally, `purged:{id} = {rev}`;
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
  - each page is one IndexedDB transaction, together with the cursor = max(cursor, the page's last document).
  The cursor never moves back. The 5-minute margin is only an extra re-read; correctness rests on the (srv, id) cursor and idempotent application.
- **Listener** on `srv >= cursor.srv` (inclusive). Documents with `hasPendingWrites` or an empty `srv` are skipped. The cursor moves only on snapshots from the server, after the IndexedDB write.
- **Applying a document** (every note and version has its own base), one transaction with the check:
  1. `rev < base.rev` → skip.
  2. `rev == base.rev` → only fill in the server fields of the base (`srv`, `tsrv`) if they were missing. Nothing else: no job, no copy, no new id.
  3. There is a `try:` → a receipt `rcpt[devId] == try.op` and `rev == expect+1` finishes it as accepted (§4.5 step 5); otherwise set `refetch:`.
  4. A tombstone → §4.7 «Deletion».
  5. `lrev == baseLrev` (no local changes) → note = document, base = document.
  6. Otherwise → a local merge as in §4.5 step 2. The job stays.
- **`refetch:` marks** are handled after attempts are resolved and at start: read the document from the server and apply it as above. A version of an unknown note gets a mark and waits for the note. A version of a note in `purged:` is ignored.
- **Tests:** over 200 documents with one `srv`; a failure between pages; a write between the catch-up and the listener; a repeated `rev`; filling in `tsrv` at an equal `rev`; correctness without the 5-minute margin.

### 4.7 Merging

**Three-way `merge3(base, local, remote)`:**

- Note fields (`title`, `deleted`, `archived`, `revived`) are compared with the base one by one. `created` = the smaller.
- Blocks are matched by id and have two groups of fields:
  - «place»: `row`, `fx`, `parent`, `col`, `cw`, `ch`, `collapsed`;
  - «content»: `kind`, `text`, `html`, `lang`, `wrap`, `num`, `open`, `title`, `color`.
- Deleted on one side and untouched on the other → deleted; deleted on one side and changed on the other → the changed block stays.
- **A conflict** (one field or group changed differently on both sides): the side with the larger key (`updated`, `dev`, hash of the normalized content) wins; a missing `dev` is an empty string. Both devices compute the same key. The losing side becomes a conflict copy in full; if both sides lose somewhere, both source copies are kept.
- `updated` of the result = the larger of the two. Receiving without local changes does not change it.
- **Structure:** `parent` must point to an existing area, otherwise the block moves to the sheet where the area was. Layout on display is not saved. Test: ten repeated deliveries cause no write.

**First merge `merge0(local, remote)`** (same id, no base):

- Equal after normalization → base = `remote`.
- Otherwise: blocks are united by id; a shared id with different content comes from the side with the larger key; note fields come from that side too, but `deleted` wins; both source copies become conflict copies in the same local transaction.

**Deletion and revival** (the owner's decision, the same on every device):

- **The revived note's address** is a sequence of candidates `c(k) = 'r' + hashOf('revive:' + id + (k ? ':' + k : ''))`, k = 0, 1, 2, … It uses the app's existing `hashOf` (FNV-1a + djb2 + length); a test pins reference values. The first candidate is taken that:
  - is not purged: not in `purged:`, and, with a network, the server read did not return a tombstone. **A purged address is never reused**, whatever its origin, since a tombstone has no `revived.from`;
  - is free, or holds a live note with `revived.from == id`. A live note with another `from` is a collision → the next k.
  The guarantee: one **current** revived note per original.
  **The sequence always belongs to the original note.** A revived note keeps `revived.from` = the original id (the root). If a revived copy is itself purged and a late edit arrives (of it or of the original), the next candidate `c(k+1)` of the root's sequence is used, not a new sequence from the intermediate copy's id. The root comes from the local copy (`revived.from`), since a tombstone does not carry it. A local copy without `revived` is its own root.
  Offline, the candidate is chosen from local knowledge. If it turns out to be purged, preparing the send (§4.5 step 2) receives the tombstone and the rule «incoming tombstone against a local copy» moves the text to the next candidate; nothing is lost. Two devices that know the same pick the same address.
- **Moving text into the revived note** is its own operation, not sync. The moved copy of the original and the revived note share no history, even when the revived note has a base of its own. So:
  - blocks are united **without assuming a common base**, by the block rules of `merge0`: united by id; a shared id with different content comes from the side with the larger key; a block missing on one side **stays**;
  - the revived note keeps its own fields (`title`, `deleted`, `archived`); a new one gets them by the rule below;
  - both sources (the current revived note and the moved copy) are kept as conflict copies; copies with equal content are not duplicated (compared by hash);
  - the original's conflict copies move to the revived note (`versions.note`);
  - all in one transaction, together with `purged:{id} = {rev, revivedAs}` and a job to send the revived note.
  The revived note then syncs with its own cloud document by the usual `merge3` with its real base. Moving the same text again changes nothing. New text (another device, a repeated import) is added without removing anyone's blocks.
  Test: the revived note has {A, B}; a late copy of the original {A′} that never saw B arrives. Result: {A′ or A by key, B} and both source copies.
- **Where the revived note goes:**
  - **the trash by default** (the owner's decision: «the edit goes to the trash»), also after a manual «forever» even if another device had restored the note from the trash;
  - **the list** (or the archive, if it was there) only when both hold: the tombstone came from the **automatic purge** (`auto: true`), and the moved copy had been **restored from the trash** (its base was in the trash and the local copy no longer has `deleted`). An explicit restore beats only the automatic purge, never a manual deletion.
  - If a revived note at that address already exists in the trash and the «list» rule applies, it moves to the list. This is the one exception to «the revived note keeps its own fields», for `deleted` only, in the same transaction as the move of the text.
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
  - candidates: `tsrv` known and the estimated server «now» − `tsrv` over 30 days;
  - notes with conflict copies on this device are skipped;
  - **a fresh time anchor before every pass:** write `devices.seen`, read the confirmed value from the server, then count with `performance.now()`. The anchor is dropped on `resume`, on `visibilitychange` and after 10 minutes;
  - the purge is a cloud transaction: `deleted` still set, the same `tsrv` and `rev` → a tombstone with `auto: true`;
  - **the rules check the age themselves:** `request.time > resource.data.tsrv + 30 days`. A wrong clock or anchor only makes the rules refuse and the purge retry later;
  - a restore on another device changes `rev` → the attempt is rejected.
- **`purgeOld()` at start:** with an owner the old rule by the device clock does not run at all, not even before sign-in. Without an owner, as now.
- **Tests:** delete → restore → delete; an extension with an equal numeric `deleted`; `tsrv` after a lost response; a clock change after the anchor; an early purge refused by the rules; a restore racing the purge.

### 4.9 Named versions

- Naming the current state creates a record with `keep` and `inline`: full bodies from the start.
- A named old version that lacks a block body is marked «неповна» and stays on the device only. The history shows «текст цього блоку не зберігся» instead of putting today's text there (PR 1).
- «Назвати», «перейменувати» and «Видалити версію» are one IndexedDB transaction over `versions` + `sync` with an `out:v:` job. Sending follows §4.5.
- **Created and deleted before the first send:**
  - no base and no `try:` → delete locally, drop the job, nothing goes to the cloud;
  - a `try:` → resolve it first: accepted → a tombstone; rejected → delete locally.
- **Rules:** deletion beats renaming, and a deleted version never comes back; creating and renaming need a live note, deleting is always allowed.
- **Order:** a version is sent only after its note (`base.rev ≥ 1`). A version of a note in `purged:` is not sent, and its cloud copy gets a tombstone.
- **States:** «у хмарі» (base confirmed), «ще не надіслано», «лише тут: завелика» (over 960 KiB), «лише тут: неповна».

### 4.10 Tabs and the open note

- **The leader tab:** `navigator.locks.request('baobook-sync:{env}')`. The lock is released on `pagehide` and `freeze`; on `pageshow` and `resume` the tab checks (epoch, env, uid) and asks for it again. A new leader continues unresolved attempts (§4.5 step 1).
- **Other tabs** only write locally. BroadcastChannel carries `{id, lrev}`; with an owner, `takeNote` compares `lrev`.
- **The editor snapshot `E`:**
  - a save: `D` = the screen; in the transaction write `merge3(E, D, C)` over the current `C`; then `E := D`, even without redrawing;
  - the record is never overwritten wholesale from the DOM.
- **A safe point:** wait for `compositionend` → save → redraw from IndexedDB, `E := C`.
- **Tests:** several saves without a redraw; IME; two tabs; a frozen leader; two runners of one `op`; bfcache.

### 4.11 Account

- **Sign-in order:**
  1. Finish the sign-in.
  2. Check access (yes / no / could not check).
  3. Compare `owner` (none / same uid / another uid).
  4. Only then receive and send.
- **Any change of owner** (a first sign-in on a device with notes, «Додати до хмари B», «Прибрати й увійти») is one IndexedDB transaction:
  - a new `epoch`, `owner` := B;
  - remove all sync metadata of the previous owner (`meta`, `out`, `try`, `refetch`, `purged`, `cursor`, `quota`);
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

### 4.12 Sign-in, hosts and the Worker

| Host | Mode |
|---|---|
| `baobook.matamata.app` | env `app` |
| `baobook.matamata.dev` | env `dev` |
| `localhost` / `127.0.0.1` | the emulator only (`demo-baobook`) |

- Other hosts have no sync. This separates data spaces; it is not a security boundary, since the rules cannot see which site a request came from.
- `authDomain` = `location.hostname`.
- The Worker proxies `/__/auth/*` and `/__/firebase/init.json` to `<project>.firebaseapp.com` transparently (GET and POST, query and body, no redirects, no cache); `main` lives in `worker/`, `assets.run_worker_first: ["/__/*"]`.
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
- **Tests:** `norm(norm(x)) == norm(x)`; shuffling the block array changes nothing; two «devices» get the same result.

### 4.16 Security rules (draft)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function verified() { return request.auth != null && request.auth.token.email_verified == true
                                 && request.auth.token.email is string; }
    function mail() { return request.auth.token.email.lower(); }
    function allowed() { return verified() && exists(/databases/$(db)/documents/access/$(mail())); }
    function owner(env, uid) { return env in ['dev', 'app'] && allowed() && request.auth.uid == uid; }
    function str(v, max) { return v is string && v.size() > 0 && v.size() <= max; }
    function optNum(d, k) { return !(k in d) || d[k] is number; }
    function receipts(d, o) {                 // own receipt == this op; other devices' receipts untouched
      return d.rcpt is map && d.rcpt.size() <= 200 && d.rcpt[d.dev] == d.op
        && (o == null ? d.rcpt.keys().hasOnly([d.dev])
                      : d.rcpt.diff(o.rcpt).affectedKeys().hasOnly([d.dev]));
    }
    function stamp(d, o) {                    // every synced document
      return d.v == 1 && d.rev is int && d.rev == (o == null ? 1 : o.rev + 1) && d.srv == request.time
        && str(d.op, 40) && str(d.dev, 40) && receipts(d, o);
    }

    match /access/{key} { allow get: if verified() && key == mail(); }   // no list, no client writes

    match /env/{env}/users/{uid}/notes/{id} {
      function live(d) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','title','blocks','created','updated'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','rcpt','title','blocks','created','updated','deleted','archived','revived','tsrv'])
          && d.title is string && d.title.size() <= 2000 && d.blocks is list && d.blocks.size() <= 5000
          && d.created is number && d.updated is number && optNum(d, 'deleted') && optNum(d, 'archived')
          && (!('revived' in d) || d.revived is map) && (!('tsrv' in d) || d.tsrv is timestamp);
      }
      function tomb(d, o) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','purged'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','rcpt','purged','auto']) && d.purged is number
          && (!('auto' in d) || (d.auto == true && o != null && 'deleted' in o && 'tsrv' in o
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
          && d.keys().hasOnly(['v','rev','op','srv','dev','rcpt','note','t','name','title','blocks'])
          && str(d.note, 40) && d.t is number && str(d.name, 80)
          && d.title is string && d.title.size() <= 2000 && d.blocks is list && d.blocks.size() <= 5000;
      }
      function vtomb(d) {
        return d.keys().hasAll(['v','rev','op','srv','dev','rcpt','note','deleted'])
          && d.keys().hasOnly(['v','rev','op','srv','dev','rcpt','note','deleted']) && d.deleted == true;
      }
      allow get, list: if owner(env, uid);
      allow create: if owner(env, uid) && stamp(request.resource.data, null)
        && vlive(request.resource.data) && noteAlive(request.resource.data.note);
      allow update: if owner(env, uid) && !('deleted' in resource.data)           // a deleted version stays deleted
        && stamp(request.resource.data, resource.data)
        && request.resource.data.note == resource.data.note
        && (vtomb(request.resource.data)                                          // deleting is always allowed
            || (vlive(request.resource.data) && noteAlive(request.resource.data.note)   // rename: live parent, same snapshot
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name','rev','op','srv','dev','rcpt'])));
      allow delete: if false;
    }

    match /env/{env}/users/{uid}/devices/{id} {
      allow get, list: if owner(env, uid);
      allow create, update: if owner(env, uid) && str(id, 40)
        && request.resource.data.keys().hasAll(['name','seen']) && request.resource.data.keys().hasOnly(['name','seen'])
        && str(request.resource.data.name, 80) && request.resource.data.seen == request.time;
      allow delete: if false;
    }
  }
}
```

- `hasOnly` limits the keys and `hasAll` requires them. The rules do not check other devices' receipt values; they only forbid changing them.
- Block contents are checked by the normalizer.
- **Receipt limit: 200 devices over a document's lifetime.** It counts installs: clearing site data makes a new `devId`. Old receipts cannot be cleaned, since that would destroy the proof of old attempts' outcomes. At the limit a new device cannot change that document: the note shows «Не синхронізовано: забагато пристроїв» and offers «Створити копію нотатки» (a new id, the same text); other notes go on. `devId` is also kept in `sync` to make new installs rarer. Decided and tested in PR 3.
- **Receipts do not authenticate a device:** the client sends `dev`, and another client of the same account could technically claim someone else's `devId`. For a personal app with one owner this is an accepted limit; there is no separate device authorization.
- Compilation and negative tests run on the emulator in PR 3; until then the draft is only checked by reading.
- Index exemptions: `blocks`, `title`, `rcpt` in `notes` and `versions`.

### 4.17 Size and load

- **The size limit** is 960 KiB (1 MiB minus 64 KiB), one value in the code and the interface, checked before every write and after merging. A note or version over it is skipped with a mark.
- **One send:** 1 write (the receipt is inside the document); about 3 reads on the sender (preparing `R`, the read in the transaction, the listener echo) plus the dependent read of `access`; about 1–2 reads on every other device.
- **Device budgets per Pacific day** (counted on the device, including the first load, reconnects and retries):

| Env | Writes per device | Reads per device | Worst case |
|---|---|---|---|
| .app | 4 000 | 9 000 | 3 devices: 12 000 writes / 27 000 reads |
| .dev | 1 500 | 4 000 | 2 devices: 3 000 / 8 000 |
| **Total** | | | **15 000 of 20 000 writes (75 %), 35 000 of 50 000 reads (70 %)** |

  - At 70 % of the device budget, at most one send per 30 s.
  - At 100 %, a **hard stop** of sync until the next day; local work goes on with «ліміт на сьогодні · N змін чекають».
- **Pace:** at most one send per 3 s per device and per 5 s per note.
- **Empty sends** are cut: content is compared before queueing and before writing; receiving does not change `updated` or `op`.
- **Emergency stop:** over 30 sends of a note in 5 minutes with no typing in it (the counter survives a restart).
- **Measured in PR 3 on .dev:** 3 devices for an hour, with the first load and reconnects. Criterion: the extrapolated owner's day stays within 25 % of the project limits.

### 4.18 Status

| State | When |
|---|---|
| no icon | no owner, not signed in |
| Синхронізовано | signed in; no jobs, attempts, `refetch:` marks or errors for notes and versions; both listeners got a server snapshot since connecting |
| Надсилаю… | jobs or attempts, online |
| Очікую підтвердження | an attempt unresolved for over 30 s while online |
| Офлайн · N змін чекають | offline; N = jobs and attempts |
| Не вдалося перевірити доступ | the `access` check failed on the network |
| Синхронізація за запрошеннями | no `access` document |
| Увійдіть знову | the sign-in must be repeated |
| Вийшли · N змін чекають | an owner, not signed in |
| Ліміт на сьогодні · N змін чекають | the device budget is spent |
| Не синхронізовано | a lasting error with its reason (too large, loop, damaged record) |

Icons differ in shape, not only colour. The button has an `aria-label`; on a phone a tap explains the state.

## 5. Pull requests (into `main`, checked on .dev)

| PR | What | Acceptance and tests |
|---|---|---|
| 0. Storage groundwork | Opening without a version; the format check first; view-and-export mode; `versionchange` with a save and an export; `blocked`/`VersionError`; both fallback copies kept; this document in English. **Released to production before the rest.** | A new device. An old tab with unsaved input. A rollback onto a v3 database with real `keep`/`inline`/`sync`: view-only; nothing written, localStorage included; the export keeps the raw records. The format check before the fallback move. Differing fallback copies. (`tests/appformat.mjs`) |
| 1. Core, one tab | `sync` (v3); epoch; writes as deltas; the queue with an owner; sending (local merge, insured attempt, cloud transaction with a receipt, finish); receiving with the cursor and `refetch:`; `merge3`/`merge0`; revival after «forever»; `keep`/`inline` on every deletion path; the new «Очистити історію»; `verBlocks` without substitution; exporting copies; the normalizer and quarantine; the rate limiter and budgets; the import contract; the cloud adapter interface. **A test cloud** in `tests/lib` with failures: «commit accepted, response lost», a later write by another device, a retry, a delay, a repeated delivery, reordering, two runners of one `op`. | Node: merging, the normalizer (two «devices»), reference revival addresses `c(k)`. Playwright, two contexts: the cloud moved ahead and the local result equals the cloud (copies kept, base and queue right); a lost confirmation followed by another device's write; a failure after each local commit; a failed insurance; two runners of one `op`; two devices with the same revival address; importing a purged id again; moving {A′} into an existing revived note {A, B} (B stays); purging the revived note and a new late edit (the next candidate `c(k+1)` of the **original's** sequence, also offline); a deletion started → local `lrev` changed → the cloud confirmed the tombstone (the edits are in the revived note); a restore from the trash during the automatic purge (`auto: true`) → the note in the list, also when the revived note was already in the trash; the same after a manual «forever» → the note in the trash; a vanished document or a smaller `rev` (quarantine); a local «forever» against a cloud edit; an incoming tombstone with local conflict copies; a shifted clock; over 200 documents with one `srv`; convergence; size; v2 → v3. |
| 2. Tabs and the open note | The leader tab continuing other tabs' attempts; `lrev` over BroadcastChannel; the editor snapshot `E`; the safe point with IME; the «Є зміни» strip. | Several saves without a redraw; IME; two tabs; a leader change mid-attempt; bfcache. |
| 3. Firebase, sign-in, account | SDK; Worker; service worker; hosts; popup/redirect; access; owner and owner change with the epoch; sign-out; «прибрати»; `devices` and the time anchor; `tsrv` and the automatic purge; `firestore.rules`; a minimal status. | Emulator: sign-in, sign-out, an account change keeping the notes (a frozen tab of A writes nothing). Edits and deletions after sign-out. `tsrv` after a lost response. A clock change after the anchor. An early automatic purge refused by the rules. A restore racing the purge. Negative rules tests for every forbidden change, others' receipts included. The receipt limit: device 201 is refused and the note offers a copy. No requests to the real Firebase. A load measurement. |
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

## 6. What the owner sets up (about 20 minutes, once; needed for PR 3)

1. https://console.firebase.google.com → **Add project** → `baobook`.
2. **Authentication → Sign-in method → Google → Enable**.
3. **Authorized domains:** `baobook.matamata.dev`, `baobook.matamata.app`.
4. **Firestore → Create database** → production mode, `eur3 (europe)`.
5. **Project settings → Web (`</>`)** → `Baobook web` → send the `firebaseConfig`.
6. **Google Cloud Console → Credentials → Web client → Authorized redirect URIs:** `https://baobook.matamata.dev/__/auth/handler`, `https://baobook.matamata.app/__/auth/handler`. **Branding:** `Baobook`, a support email.
7. **Firestore → Data → `access`** → a document whose id is the owner's Google address in lower case, field `role: "owner"`.
8. **Firestore → Indexes → Single field → exemptions:** `blocks`, `title`, `rcpt` in `notes` and `versions`.
9. **Firestore → Rules:** the text from PR 3 → Publish.

The quota is one per project, shared by .dev and .app; the budgets in §4.17 account for that.

## 7. Risks and manual checks

- **Sign-in in the installed app on an iPhone:** a checklist on a real device.
- **A merge bug:** merges are only local and insured; tests of failures and of two runners.
- **The same block edited online on two devices:** one edit stays, the other becomes a conflict copy. This is not real-time co-editing.
- **Load:** budgets with a hard stop, measured in PR 3.
- **Rollback:** safe for the data from PR 0 on (view-only); restoring editing takes a fix released forward.

## 8. Not in this stage

Encryption; sync requests and mailings; Apple sign-in; sharing notes; block-level updates under the caret; a list of the account's devices.
