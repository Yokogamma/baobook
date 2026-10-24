# A barrier against old tabs that never waits for them

**Status: approved by the owner on 2026-10-24 (the five questions of §8 answered «as recommended»), after two internal review rounds and two independent ones (§10), the last without findings; PR 1 (part 2, #111) is merged; PR 2 (part 1) is built: the format guard in `idb.tx` (which `idb.run` now goes through) and `SDB.run` runs the write only after the format read, so a refused write never queued a request; the test hooks are `sheetDebug.fmt`.** Two PRs into `main`, in this order: **PR 1 (part 2 below, urgent)** — the one-time v3 → v4 upgrade waits for a sleeping tab instead of locking the device; it ships before #100 is released to baobook.matamata.app. **PR 2 (part 1 below)** — old tabs are stopped by a format number checked inside every write, so later format changes never raise the IndexedDB version and never wait for another tab; it ships before the next format change. The sections are numbered by topic; §9 states the order.

## 1. The incident

On 2026-10-23, after #100 (sync PR 4a-1) was merged and deployed to baobook.matamata.dev (build 2026102306), the owner's Android phone (Chrome with about 97 tabs, possibly the installed app too) showed the `storage` lock strip: «Сховище браузера не відкрилося, тож нотатки з цього пристрою зараз не прочитати…» (`lock.storage`). Closing every Baobook tab and the app and opening one again fixed it. No data was lost.

The cause:

1. #100 raised `IDB_VER` from 3 to 4 on purpose, as a barrier (SYNC-PLAN §4.9 «Old tabs stop writing»): the upgrade fires `versionchange` in every tab of the code before it, whose `idbLost` closes the connection and turns the tab view-only (`lock.updated`), so no old tab writes versions past the core's queue.
2. `idb.open` opens without a version (`go(0)`), finds 3 below `IDB_VER`, closes, and requests the upgrade (`go(IDB_VER)` in `next()`). That request can only proceed when every other connection has closed.
3. On Android a background tab or app window that the system has frozen cannot run its `versionchange` handler, so it keeps its v3 connection. The browser fired **no event at all** at the upgrade request: no `blocked` (with `blocked`, `onblocked` would have set the `blocked` lock after 3 s and shown `lock.blocked`, which the owner did not see), no `upgradeneeded`, no `success`.
4. The upgrade request had the start's silence deadline (`OPEN_WAIT`, 8 s, IDB-FALLBACK-PLAN §4.1). It fired, the attempt was marked dead and silent, and `db.init()` set `setLock('storage')` (the device has `idbOk`). A silent attempt disables the probe (`idb.silent`); its late `success` would reload the page through `idbBack()`, but it comes only when the frozen holder closes its connection, which in practice meant closing everything by hand.

On desktop Chromium a tab frozen with CDP `Page.setWebLifecycleState {state:'frozen'}` did **not** reproduce it (the upgrade went through), so the tests below simulate the Android behaviour directly: a holder that never closes, and a browser that fires no `blocked` (§5).

Two things are wrong, and they are fixed separately:

- **The message and the dead end.** A versioned request that hangs after a versionless open of the same database succeeded is not «the storage did not open»: the storage just answered. It is another connection that does not let go. The tab should say so, keep the request alive and continue by itself the moment the holder goes (part 2, PR 1).
- **The barrier itself.** A version upgrade is the only cross-tab signal IndexedDB has, and it depends on every other tab being awake. A barrier that is checked by the writer inside its own write needs no other tab to cooperate (part 1, PR 2).

## 2. Terms

- **The versionless open**: `go(0)`, `indexedDB.open('sheet')` with no version; it is never blocked and never upgrades an existing database (on a new device it creates an empty v1).
- **The upgrade request**: `go(v)` with `v>0`, sent only by `next()` after a versionless open of this same attempt succeeded and found `d.version < IDB_VER` (a v3 database, or the empty v1 of a new device). The other `go(0)` call (after `VersionError`) is a versionless open again.
- **A holder**: any open connection of another tab or window to `sheet` at a lower version. An awake holder of code since PR 0 closes it in `idbLost`; a frozen or deaf one does not.
- **FORMAT** (part 1): the data format number in this code, the value of the `format` record in store `sync`. Today `format` is written as `IDB_VER` (4).

## 3. Part 2 — the one-time v3 → v4 upgrade waits (PR 1)

### 3.1 Behaviour

Everything in this part applies to **the start's open** only: `idb.open({deadline})` from `idbOpenRetry`. An `idb.open()` made later in the session (`idb.run`, `idb.tx`, `SDB.tx` after `idbLost`, `onclose` or a deleted database; `appformat` 1g, 2m) has no deadline and keeps today's behaviour exactly, a lasting `blocked` included (`setLock('blocked')` and `lock.blocked`): it happens on a page that is started and editable, where a strip written outside `roSync()` would stay after the open ends, and it is not the incident.

1. **No silence deadline on the start's upgrade request.** `OPEN_WAIT` and the dead/silent logic stay on the versionless open. The upgrade request gets a **waiting timer** instead, `UPGRADE_WAIT` = 3 s, started with the request and cleared by its first event (`upgradeneeded`, `success`, `error`). When it fires, the start is **waiting**: nothing is rejected, nothing is marked dead, no lock is set, `idb.silent` stays false, and `db.init()` keeps awaiting the same promise. On a new device whose first upgrade is merely slow (more than 3 s before `upgradeneeded`), the waiting strip shows for those seconds; harmless, and it goes back to `lock.opening` with the event (item 3).
2. **`blocked` on the start's upgrade request is waiting too.** Today `onblocked` starts a 3 s timer that sets the `blocked` lock and rejects. For the start, a `blocked` event cancels the waiting timer and starts a 3 s timer whose end is the waiting state instead of the lock: «two tabs starting together close their v1 at once» keeps its 3 s of grace, and a lasting block is the same situation as the Android silence (another connection does not let go), with the same way out, except that the strip can be sure (item 3). §8 question 1.
3. **The waiting strip.** The strip that `idbOpenRetry` shows after 1 s (`lock.opening`, every button hidden) changes its text:
   - after `blocked` (a holder is proven: the browser dispatched `versionchange` and a connection stayed open): `lock.waitTab` «Інша вкладка Baobook або застосунок відкриті й не відпускають сховище, тож воно не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме.»;
   - after silence (a frozen holder is the likely cause, but a hung backend looks the same): `lock.waitSilent` «Схоже, інша вкладка Baobook або застосунок відкриті й заснули, тож сховище не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме.».
   The buttons stay hidden at first: no note has been read (the start reads the notes after the open), so there is nothing to export, and the localStorage fallback copies that the `blocked` lock shows today (`fbAll()`, `appformat` 9g) are not shown during the wait either; they move in through `db.move()` when the start finishes. The sheet stays inert and the list empty, as during every wait of the start (IDB-FALLBACK-PLAN §4.1 item 4). If the upgrade request then fires `upgradeneeded` (the holder went), the text goes back to the start's usual one until the upgrade ends (`lock.opening`, or `boot.slow` once the start has waited 5 s, PR #101's `waitUI`).
4. **A long wait adds the way out.** After `WAIT_LONG` = 60 s of waiting the text becomes `lock.waitLong`, which no longer assumes a holder (after silence the cause may be the backend): «Сховище досі не вдалося відкрити. Закрийте інші вкладки Baobook і застосунок; якщо не допоможе — закрийте застосунок повністю й відкрийте знову.» and «Оновити» (`roReload`) shows: a reload is a fresh start, which waits again while the holder is there and continues once it is gone; a hung backend is not cured by a reload (the versionless open succeeds again and the upgrade request hangs again), and its way out is the full restart the text names. The request is still kept alive meanwhile, so the tab still continues by itself if the holder goes. §8 question 2.
5. **It continues by itself.** When the holder closes (the user switched to the frozen tab, which ran `idbLost`, or closed it, or the system discarded it), the browser runs the upgrade: `upgradeneeded` → `success` of a live attempt → `done()` → `idbOpenRetry` returns → `db.init()` goes on, writes `idbOk` if absent, and the start finishes as usual; `roSync()` at `STARTED` replaces or hides the strip, as it does for `lock.opening` today. **No reload** is needed or made, so `RELOADS_MAX` and `sheet:idb-reloads` are not involved.
6. **A second tab of this code** whose versionless open queues behind the waiting upgrade request (the spec processes the open requests of one database one at a time) is silent too and gets today's `storage` lock after `OPEN_WAIT`, with the wrong message for a few seconds; it recovers by itself: when the upgrade ends, its dead attempt's late `success` calls `idbBack()` and the page reloads into a healthy start. Telling that tab the right thing needs a cross-tab signal (a Web Lock held while the upgrade request waits); it is deferred to PR 2 (§4.7), so the urgent PR adds no mechanism with a cross-tab lifetime.

### 3.2 Interactions

| With | What happens |
|---|---|
| `OPEN_WAIT` (8 s) | applies to the start's versionless open only, as the silence detector of IDB-FALLBACK-PLAN §4.1 |
| the dead/silent logic | unchanged for the versionless open (a dead attempt's late `success` closes and calls `idbBack()` under the `storage` lock; its late `error` restarts the probing). The start's upgrade request is never dead; a dead versionless open never sends one (`onsuccess` returns before `next()`, as today) |
| the retries (`OPEN_RETRY`) | unchanged: an `error` of the upgrade request (other than `VersionError`, which goes to `go(0)` as today) rejects the attempt and the loop retries after 300 and 900 ms; each retry starts again with the versionless open; the waiting state ends with the error |
| the probe (`idbWatch`/`idbProbe`) | never started from the waiting state: no lock is set. A probe of another tab under the `storage` lock can queue behind this tab's waiting upgrade; its 3 s deadline makes it silent and leaves it as the watch (IDB-FALLBACK-PLAN §4.4): its late `success` after the upgrade reloads that tab. No change there |
| `RELOADS_MAX` | not involved: the waiting tab continues in place; «Оновити» after `WAIT_LONG` is the user's own reload, not counted |
| `blocked` | at the start: the waiting state after 3 s (item 2); later in the session: the `blocked` lock as today |
| `newer` | decided before any upgrade request (the format read and `d.version>IDB_VER` in `onsuccess` of the versionless open), unchanged |
| `lock.opening` | shown after 1 s of any wait as today; replaced by `lock.waitTab`/`lock.waitSilent`/`lock.waitLong` while waiting, and back after `upgradeneeded` |
| a first open on a device that never had IndexedDB | the versionless open creates the empty v1 (its `upgradeneeded` clears its deadline), then `go(IDB_VER)` is an upgrade request like any other: a holder of that v1 (another tab of the same start, normally closed at once) makes it wait with the same strip. It never falls into the localStorage mode on silence: today a silent upgrade there ends in the fallback mode (no `idbOk`), with the hung request still queued and its late upgrade making a database the fallback tab never reads. §8 question 3 |
| a waiting tab that later goes to the background | its pending request keeps the queue. In Chrome a page holding an IndexedDB connection or a pending request may be discarded rather than frozen; a discard drops the request and the next tab becomes the upgrader. If it is frozen with the request pending, the next tab of this code waits behind it, which is again «another Baobook tab is asleep», and that tab's `WAIT_LONG` brings «Оновити» and the full-restart advice, so no tab is left without a way out |
| the update strip (`updCheck`) | independent, as under every wait |
| `DEBUG.saveGate`, `saveHold` | untouched |

### 3.3 Code (`public/index.html`)

| Where | Change |
|---|---|
| the constants after `IDB_VER` | `UPGRADE_WAIT=3000`, `WAIT_LONG=60000`; the comment says the deadline is for the start's versionless open, the waiting timer for its upgrade request |
| `idb.open` → `go(v)` | for `v>0` with `o.deadline`: no `dt` deadline; `wt=setTimeout(()=>idbWait('silent'), UPGRADE_WAIT)`, cleared by the first event. Without `o.deadline` (later in the session): exactly today's code |
| `idb.open` → `onblocked` | with `o.deadline` and `v>0`: `clearTimeout(wt)`, a 3 s timer to `idbWait('blocked')`, cleared like `wt` by `upgradeneeded`, `success` and `error`; no `setLock`, no `rej`. Without `o.deadline`: today's 3 s timer to `setLock('blocked')` |
| `idb.open` → `onupgradeneeded` | also `clearTimeout(wt)` and the `blocked` timer; while waiting, the strip back to the start's usual text (`waitUI`: `lock.opening`, or `boot.slow` after 5 s), `roReload` hidden |
| new `idbWait(kind)` | `idb.waiting=kind`; `roMsg.textContent=loc(kind==='blocked'? 'lock.waitTab' : 'lock.waitSilent')`, `roStrip.hidden=false`, the four buttons hidden (as in `idbOpenRetry`); one `WAIT_LONG` timer (started on the first call) → `lock.waitLong` and `roReload.hidden=false`. A later `blocked` after silence switches the text to `lock.waitTab`, but never replaces `lock.waitLong` (the text and the button stay). Every timer of the wait (`wt`, the `blocked` timer, `WAIT_LONG`) is cleared by the request's `upgradeneeded`, `success` and `error`, and `upgradeneeded` also hides `roReload`, so «Оновити» never shows during a running upgrade (a reload there would abort the version-change transaction) |
| `idb.open` → `onsuccess`/`onerror` of a live attempt | `idb.waiting=null`, the timers cleared |
| `idbOpenRetry` | its 1 s timer does not overwrite the waiting text (it checks `idb.waiting`); the comment on the locks set inside the open names `newer` only for the start |
| the LOCK comment block | `'blocked'`: «another tab keeps this one from upgrading the database it reopens during the session»; the start waits instead (this document) |

`public/sync.js`, `public/cloud.js`, `public/sw.js` do not change. `BUILD` is raised in all its places (CLAUDE.md). The locale files change, and they are in the `SRI` table, so `node tests/hashes.mjs --write` runs.

### 3.4 Strings

Whole sentences, in `public/locales/uk.json` and `en.json`; `lock.blocked` stays (the session-time lock).

| Key | uk | en |
|---|---|---|
| `lock.waitTab` | Інша вкладка Baobook або застосунок відкриті й не відпускають сховище, тож воно не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме. | Another Baobook tab or the installed app is open and holding the storage, so it cannot be updated. Switch to it for a moment or close it, and this page will continue by itself. |
| `lock.waitSilent` | Схоже, інша вкладка Baobook або застосунок відкриті й заснули, тож сховище не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме. | Another Baobook tab or the installed app seems to be open and asleep, so the storage cannot be updated. Switch to it for a moment or close it, and this page will continue by itself. |
| `lock.waitLong` | Сховище досі не вдалося відкрити. Закрийте інші вкладки Baobook і застосунок; якщо не допоможе — закрийте застосунок повністю й відкрийте знову. | The storage still could not be opened. Close the other Baobook tabs and the app; if that does not help, close the app completely and open it again. |

### 3.5 Tests

New scenario **`tests/appidbwait.mjs`** (style of `appidbfail.mjs`/`appvsync.mjs`: `lib/server.mjs`, `CTX` with `serviceWorkers:'block'` so the `route` that serves the old page applies, `until`, `✓`/`✗`, screenshots under `<tmpdir>/sheet-tests/`). The holder is real: a page of the origin (`blank.html`) that opens `sheet` at the old version and keeps the connection with `onversionchange` removed. «No `blocked`» is simulated in the app's page by an init script that wraps `IDBFactory.prototype.open` and, **only for a request with a version**, makes `onblocked` a setter that drops the handler and `addEventListener('blocked',…)` a no-op; the versionless open passes untouched. The request then hangs silently like the Android one, and when the holder closes, the real upgrade runs. The wrapper also counts the requests by kind. Every scenario except 3 and 6 (guards) and the first half of 8 fails on the code before this PR (checked by putting `public/index.html` from `HEAD` back). Scenario 7 waits the real `WAIT_LONG` (60 s): `TUNE` is read only under the emulator, and a test-only override in the start's open is not worth its code.

| # | Step | Fails before |
|---|---|---|
| 1 | a v3 database with a note (the page served with `IDB_VER` 3 via route, as `appvsync` scenario 2, then closed); holder H at v3, deaf; the app with «no `blocked`»: within 1.5 s `lock.opening`, within 4.5 s `lock.waitSilent` with all four buttons hidden; after 12 s still waiting, no `lock.storage`, `LOCK` null, exactly one versionless open and one upgrade request, no `sheet:note:` key; H closes → within 3 s the note shows, editable, no reload (a marker set on `window` by the test before H closes is still there, `performance.timeOrigin` unchanged, and no new request for the main document; `framenavigated` is not used: the start's `setHash` → `history.replaceState` fires it without a new document), the database at 4 with `format` 4, an edit saved | yes (`lock.storage` at 8 s) |
| 2 | the same with `blocked` delivered (no wrapper): `lock.waitTab` after about 3 s, never `lock.blocked`; H closes → the start continues without a reload | yes (`lock.blocked`) |
| 3 | the frozen variant: the old page (`IDB_VER` 3) open and frozen with CDP `Page.setWebLifecycleState {state:'frozen'}`; the app starts, at once or after the waiting strip; after `active` the old page shows `lock.updated`; no page error. A guard of the real lifecycle path, not a reproduction (desktop Chromium does not hang) | no |
| 4 | a new device: no database; holder H opens `sheet` without a version (the empty v1) and stays deaf; the app with «no `blocked`»: `lock.waitSilent`, no «(резервне сховище)», no `sheet:note:` key, `idbOk` absent; H closes → a normal start, `idbOk` written | yes (the fallback mode at 8 s) |
| 5 | hidden and shown: the waiting page hidden for 3 s and shown (`visibilitychange`): no probe, no reload, still waiting; H closes → continues | yes |
| 6 | the session-time open is unchanged: a started page, its connection closed by deleting the database from another page while H holds a fresh v1 and stays deaf; the next save's `idb.open()` is blocked → after 3 s `lock.blocked` as today, no `lock.waitTab` | no (a guard) |
| 7 | the long wait: after 60 s `lock.waitLong` with «Оновити» visible, the request still alive; H closes → continues without a reload | yes |
| 8 | a second tab of this code behind the wait: C opens while A waits: C ends in `lock.storage` (accepted in PR 1); H closes → A continues and C reloads by itself into a healthy start | the recovery half yes (A) |
| 9 | no page errors over the run | — |

Existing scenarios:

- `appformat.mjs` scenario 4 («a blocked setup…»): expects `lock.waitTab` after 3.6 s instead of «Закрийте інші вкладки Baobook»; 4b (typing changes nothing, no fallback key) stays; then, when B closes its v1, the start continues **without** the reload the scenario makes today, and the typed note is saved.
- `appformat.mjs` scenario 9 (a save made while the start waits): 9b now reads `lock.waitTab` instead of the `lock.blocked` text; 9c («Експорт» plain under a lock) and 9e (the neighbour's note shown view-only, `#ttl` not editable) describe a locked tab and become: the button row is hidden during the wait; after the holder closes nothing typed during the wait was taken, the neighbour's note from `TABQ` shows, and the sheet is editable. Scenario 9g (two fallback copies under a blocked start): the copies are judged after the holder closes and the start finishes: the newer note and exactly one backup copy, moved in through `db.move()` rather than shown from `fbAll()`. `ready()` (`tests/lib/wait.mjs`) waits for a list item, which a waiting start never shows, so these scenarios wait for the strip first and call `ready()` only after the holder closes.
- `appidbfail.mjs` step 18 (the real queue: the test's raw upgrade request blocked by B, A's versionless open queued behind it) stays as written: the raw request is not the app's, and A still gets the `storage` lock.
- `appvsync.mjs` scenario 2 (the v4 barrier with an awake old page) passes unchanged: the old page answers `versionchange`.
- `appi18n.mjs` covers the new keys; `appupdate.mjs` the raised `BUILD`; `hashes.mjs` the locale hashes.

### 3.6 Docs

IDB-FALLBACK-PLAN §4.1 item 1 (`blocked`, the deadline per request) and §9 get one sentence each pointing here; SYNC-PLAN §4.9 «Old tabs stop writing» gets a sentence on the wait.

## 4. Part 1 — the format barrier (PR 2)

### 4.1 The rule

- **`IDB_VER` is raised only when stores or indexes change** (it stays 4; it cannot go back down: an existing v4 database would read as a newer app's data).
- **`FORMAT` is raised when tabs of older code must stop writing**: a field changes meaning, a write moves to another path (as in 4a-1, where the old `vwrite`/`saveName` bypassed the core's queue), a record shape that older code would damage. A change of stores raises both.
- `FORMAT` starts at 4, the value the `format` record already holds on every device with #100, so this PR changes no stored value.

### 4.2 Behaviour

1. **At start the tab records the format.** The versionless open's `onsuccess` today reads `format` in a readonly transaction. It becomes one **readwrite** transaction on `sync`: read `format`; if it is above `FORMAT` → `newer` (today's rule, unchanged); if it is absent or below `FORMAT` and no lock is set → put `{k:'format', v:FORMAT}` in the same transaction. No other tab is asked or waited for: this is an ordinary write. After it commits, the tab sends `{t:'format', v:FORMAT}` on the `sheet:notes` channel (`tellTabs`). A raise found before an upgrade request is written before it, so tabs that have the check stop at once even when the upgrade then has to wait (§4.6).
2. **Every write checks the format inside its own transaction.** Every readwrite transaction of the app includes the `sync` store and issues `get('format')` as its **first** request; in its `success`, a value above `FORMAT` first records the refusal (`failed=locked()`, a closure of that transaction), then aborts the transaction (`t.abort()`, which also rolls back any request queued after it: a transaction cannot commit while one of its requests' events has not been dispatched), calls `fmtNewer()`, and the transaction's promise rejects with that `{code:'locked'}` error. The abort makes every other pending request of the transaction fail with `AbortError` before the `abort` event; those errors must not replace the refusal (`failed=failed||e` everywhere `failed` is set, and `onerror`/`onabort` reject with `failed` first; in `idb.run` and `idb.tx` the transaction's `error` event comes before `abort` and today settles the promise with a null `t.error`, so both handlers change), or `writeLocal` would answer `AbortError` and the core would log a storage failure and back off. A value at or below `FORMAT`, or no record, lets the transaction go on. So a tab woken from freezing — whose timers, saves and engine steps resume in the middle of their work — stops at its first write, and that write leaves nothing behind.
3. **`fmtNewer()`**: `setLock('updated')` (the existing «Baobook оновився в іншій вкладці. Оновіть сторінку, щоб продовжити.», or `lock.unsaved` with «Експортувати незбережене» when an edit could not be written), then close the connection (`idb.db.close(); idb.db=null`), so a later real upgrade by a newer tab does not have to wait for this one. No `retrySave()`: unlike `idbLost`, the newer format is already in place, so a save would be refused; the unsaved edit stays exportable from memory, as `lock.unsaved` offers today.
4. **The message.** `tabMsg` takes `{t:'format', v}`: `v>FORMAT` → `fmtNewer()`. This is the fast path for an awake tab that is not writing (its sheet turns inert at once instead of at the next keystroke); a tab that misses it (frozen: the message may wait or be dropped; bfcache) is caught by item 5 or by item 2 at its next write. Code before this PR takes no action on the unknown message (`tabMsg` has no branch for it; its last line only nudges the engine of a leader, harmless).
5. **Coming back.** On `visibilitychange` to visible and on `pageshow` with `persisted`, a tab with `idb.db` and no lock reads `format` (readonly, one request) and calls `fmtNewer()` when it is above `FORMAT`. The read can fail (a closed connection): then nothing happens, and the next write decides. `syncTabs()` and `retrySave()` run on the same `visibilitychange` and may write before the read answers; there is no ordering to rely on, and such a write is refused by the guard of item 2.

### 4.3 Which writes

| Path | Where | Change |
|---|---|---|
| `idb.run(mode, fn)` (store `notes`: `idb.del` from `db.remove`; `idb.put` has no caller) | `public/index.html` | for `readwrite` the scope is `['notes','sync']` (`sync` left out when the database lacks it, as `SDB.run` does) and the guard request goes first; both `t.onerror` and `t.onabort` reject with the guard's `locked` error. After a manual `abort()` Chrome fires the request's `error` (`AbortError`), then the transaction's `error` with `t.error === null`, then `abort`; today `t.onerror=()=>rej(t.error)` settles the promise with `null` first, so changing `onabort` alone would not help (the data is rolled back either way) |
| `idb.tx(stores, mode, fn)` (automatic versions `vwrite`, `vdelete`/`vthin`/`vdrop`, the sweep) | `public/index.html` | the same: `sync` added to a readwrite scope, the guard first, before `fn(t)`, the `locked` error kept in a closure and used by both `t.onerror` and `t.onabort`, for the same reason as `idb.run`. `vwrite`'s request handlers keep writing from event handlers (`prevQ.onerror=()=>finish()` → `V.put`), which on an aborted transaction throws `TransactionInactiveError` inside a handler: a page error. So `idb.tx` marks the transaction aborted and `vwrite`'s `finish` (and every handler of `idb.tx` callers that writes from an event) returns when it is; the scenarios check «no page errors» after a refused automatic version |
| the upgrade (`onupgradeneeded`, line 960) | `public/index.html` | writes `{k:'format', v:FORMAT}` instead of `IDB_VER`: with `FORMAT` above `IDB_VER` (a raise without a store change) the upgrade of a v2/v3 database would otherwise write the lower number over the `FORMAT` recorded just before it (§4.2 item 1), and a new device would start one format low |
| `SDB.run` (every write of the sync core: `writeLocal`, `importMany`, `versionLocal`, `setOwner`, the cursors, `flushQuota`, the format write of `sync.js` line 868; and the two `device` puts of `index.html`) | `public/index.html` | the guard request first, before `fn(T)` runs; on a newer value `failed` is the `locked` error (never overwritten afterwards) and the transaction aborts. `sync` is already in most scopes; it is added where it is not. `SDB.run` drops a store the database lacks, so on a damaged database without `sync` the guard is not there: a known hole (§7) |
| the core's error handling | `public/sync.js` | `guarded`/`vguarded` and the receive paths treat `code==='locked'` like `epoch`: return quietly (today a `locked` error would count as a storage failure and back off the job, which is itself a refused write). `deps.format` is passed `FORMAT` instead of `IDB_VER` (`index.html` line 1213), so the core's own write of a missing record (`sync.js` line 868) writes `FORMAT` too. `sync.js` changes, so `node tests/hashes.mjs --write` |
| `db.save` → the localStorage fallback copy | `public/index.html` | none: `writeLocal` returns `code:'locked'` for the aborted write, and `db.save` already treats `locked` as a refusal (no fallback copy). A fallback copy written by an old tab for another reason (a quota error) before or after the raise is moved in by the next start through `db.move()` → the core, like an import of an older file: export files of older versions keep importing (CLAUDE.md), so their note shape is accepted |
| the localStorage mode (no IndexedDB) | — | no format record exists; plain keys are written only under the writer lock by one tab, in the note shape every version imports. Not covered, as today (§7) |
| `sheet:settings` | — | device settings, not data: not covered |

The cost: one `get` of a one-key record per write transaction, in a store the core's transactions already hold; on a desktop it is well under a millisecond, and saves are already debounced (one per pause in typing). Adding `sync` to the scope of `idb.run` and `idb.tx` writes makes them serialize with the core's writes, which take `sync` already; the automatic version writes run in `vqueue` after the note's save, so no new waiting shows. The PR description gives the median of 200 saves with and without the guard (`?debug=1` timing in a throwaway run); CI has no threshold.

### 4.4 Interactions

- **`newer`** (data of a newer app, e.g. after the site was rolled back): at start a `format` above `FORMAT` is `newer` as today, now also reached without a version change. A running tab that meets it in a write is `updated` (it was opened before the newer app wrote), as `idbLost` decides today.
- **The leader and the Web Lock** (SYNC-PLAN §4.10): `setLock` runs `leadOff()`, so a stopped leader releases `baobook-sync:{env}` and a tab of the new code takes the lead. A frozen old leader holds nothing (the leader lock goes on `pagehide` and `freeze`, and on `hidden` in browsers without the freeze event); when it wakes, its engine's first transaction aborts and it stops.
- **`lrev` between tabs** (SYNC-PLAN PR 2): an aborted transaction bumps no `lrev` and sends no `put`; the locked tab sends nothing after the lock. Its `PENDING` copies stay on its screen until the reload.
- **Versions**: automatic versions (`idb.tx`), named versions (the core's `versionLocal`), the sweep and the deletion all go through a guarded transaction. «Історія» reads stay readonly.
- **Export and import**: an export reads (readonly) and works in a locked tab, as under `updated` today, «Експортувати незбережене» included. An import writes through the core (`importMany`) and is refused after the raise, as any write.
- **The owner change, «Прибрати нотатки з пристрою»** (`setOwner`): a guarded core transaction like the rest.
- **The epoch check** (`check()` in `sync.js`): independent and unchanged; the format guard runs first, in `SDB.run`, before `fn`.

### 4.5 What does not change

The stores, the indexes, `IDB_VER` (4), the export file, the note fields, the Firestore rules. `public/cloud.js` and `public/sw.js` do not change.

### 4.6 When a real upgrade is still needed

A later change of stores raises `IDB_VER` and `FORMAT` together. The new tab then writes the raised `format` on the old version's connection first (§4.2 item 1), so every tab with the guard stops writing at once and closes its connection on the message; then it sends the upgrade request. Awake tabs of any code since PR 0 close on `versionchange`; a frozen one keeps its connection, and the upgrade waits with the strip of part 2 (`lock.waitSilent` or `lock.waitTab`) and continues by itself when it goes. The wait remains for that rare change, with the right message and no lock.

### 4.7 The second tab behind a waiting upgrade

Deferred from PR 1 (§3.1 item 6). The start's upgrade request is wrapped in the Web Lock **`baobook:idb-upgrade`**, held from the moment the request is sent until it answers; when a versionless open of the start reaches `OPEN_WAIT`, it asks `navigator.locks.query()` and, if that lock is held by any tab, becomes waiting (`lock.waitSilent`, no lock, no `idb.silent`) instead of dead; its late `success` (the database is at `IDB_VER` by then) continues the start with no upgrade and no reload.

- **One release per request, whatever the order of events.** The lock is requested with a signal: `const ac=new AbortController(); let answered=false, rel=null; navigator.locks.request('baobook:idb-upgrade', {signal:ac.signal}, ()=>answered? null : new Promise(r=>rel=r)).catch(()=>{})`, and the request's `success`/`error` set `answered=true`, call `ac.abort()` (drops a grant still queued) and `rel&&rel()`. So a tab whose upgrade request answers before its lock is granted (two tabs of this code starting together on a v3 database: B's lock request queues behind A's, B's `open(4)` then succeeds with no upgrade) never ends up holding the lock afterwards; a lock held by a tab that no longer waits would turn every later genuine silence on the device into «another tab is asleep» with no way out.
- **The query decides once.** It is asynchronous; a first event of the request that arrives while it is in flight clears the deadline as today and the answer is ignored (a flag); an error, or no Web Locks API, decides «not held» (today's dead path).
- **`WAIT_LONG` applies here too**, so even a wrong «held» ends in `lock.waitLong` with «Оновити» after 60 s.
- Old tabs of code before this PR cannot be helped this way; they keep the `storage` lock and the `idbBack()` reload.

Tests (in `tests/appidbwait.mjs`, added by PR 2): a second tab C behind A's wait shows `lock.waitSilent` after 8 s, not `lock.storage`, and `navigator.locks.query()` in C lists `baobook:idb-upgrade`; the holder closes → A and C start, no reload in either, C sends no upgrade request (fails before: `lock.storage`). Two tabs of this code starting together on a v3 database: both start, and afterwards `navigator.locks.query()` lists no `baobook:idb-upgrade` in either (the release race). C must open strictly after A's upgrade request is queued (the test waits for A's `lock.waitSilent`), or C is the upgrader.

### 4.8 Tests

New scenario **`tests/appformatgen.mjs`**. A «newer» page is the current `index.html` served with `const FORMAT=5` via route (as `appvsync` scenario 2 serves `IDB_VER` 3); the scenario asserts the replacement took effect. Every scenario except 7 fails on the code before this PR.

| # | Step | Fails before |
|---|---|---|
| 1 | tab A (current), a note typed and saved; tab N (newer) opens: N starts with no strip and no wait (the versionless open only, `IDB_VER` still 4), `format` reads 5; within 1 s A shows `lock.updated`, its sheet inert, «Нова» says `lock.say` | yes |
| 2 | the woken tab: A's `BroadcastChannel` messages dropped by an init script (as a frozen tab misses them) and A hidden; N raises; A types (the sheet is still editable): the save is refused, A shows `lock.unsaved` with «Експортувати незбережене», the export carries the edit; the stored note is byte for byte the one before (read with the test's own `indexedDB.open`), no `sheet:note:` key, `lrev` unchanged | yes |
| 3 | one write path per tab, so a missing guard is not hidden by a `LOCK` the first refusal already set: for each of `SDB.run` (a named version, through the core; and, in another tab, an import), `idb.tx` (an automatic version) and `idb.run` (a deletion for good, `db.remove`), a tab of its own that is not locked, with the `format` message dropped by the init script; N raises; that tab's operation is refused **inside the transaction it created** (a test hook counts the transactions created and the guard's refusals; the promise rejects with `error.code==='locked'`, not `null` or `AbortError`), the stores are unchanged (no new record in `versions`, no job in the queue, the note still there), and then the tab is `updated`. In the core's tab A leads (the test cloud of `tests/lib`) and releases the leader lock afterwards; N takes it | yes |
| 4 | no page errors after a refused automatic version (`vwrite`'s handlers on the aborted transaction) | yes |
| 5 | coming back: A hidden while N raises with messages dropped, then `visibilitychange` to visible: `lock.updated` without any write | yes |
| 6 | the start records the format: a **v4** database whose `format` record was deleted (at v4 there is no upgrade, so the code before this PR does not write the record back) → after a start `format` is 4; a tab of a newer page with messages working and two tabs of it starting together: both start, one value 5, no error (the two `format` writes serialize on `sync`, both send `{t:'format'}`, and `fmtNewer()` is idempotent through `setLock`, so a double message is harmless) | yes (the first half: today the record is written only in the upgrade) |
| 7 | a rollback: a database with `format` 5 opened by the current page → `newer` at start (today's rule, a guard) | no |
| 8 | a real upgrade after the raise: the newer page served with `IDB_VER` 5 and `FORMAT` 5, a deaf holder at 4 and «no `blocked`»: A (current) is stopped by the format first (`lock.updated` before the upgrade runs), N waits with `lock.waitSilent`; the holder closes → N continues | yes |
| 9 | no page errors over the run | — |

Existing: `appvsync` scenario 2 (the v4 barrier) stays as the history of the v3 → v4 step; `appformat` keeps its `newer` scenarios; `appsave`/`appstatus` (with `DEBUG.saveGate`/`saveHold`) pass with the guard inside the transaction; the Node suites of `sync.js` (`syncsim`, `syncversions`…) run on a store double whose `tx` ignores `format`, so they need the `locked` branch only in `syncsim`'s error paths, one check added. `tests/README.md` gets both new rows.

### 4.9 Docs

SYNC-PLAN §4.9 «Old tabs stop writing» and §3's `format` row: the v4 upgrade was the last barrier by version; later ones are the format guard (this document). SYNC-PLAN §4.14 item 3 (`versionchange`) stays for real upgrades.

## 5. Why the tests simulate the hang

Desktop Chromium did not hang with a CDP-frozen holder, so a test that only freezes a tab would pass on the broken code. The real ingredients of the Android hang are two: a connection that is never closed, and no `blocked` event at the upgrade request. Both are reproduced with real IndexedDB (a deaf holder page; the `blocked` event withheld from the app's handler), so the upgrade itself, the connection queue and the late `success` are the browser's own. The frozen variant (§3.5 scenario 3) stays as a guard of the lifecycle path.

## 6. Manual checks on devices

1. Android Chrome, PR 1: `.dev` cannot show it any more (its devices are already at v4), so the check is the release itself (§9): before the release, a Baobook tab of `.app` (v3 code) left in the background long enough to be frozen (10 minutes with other apps used meanwhile); after the release a new tab of `.app`: the waiting strip `lock.waitSilent` (or `lock.waitTab`) instead of `lock.storage`; switching to the old tab for a moment and back (or closing it): the new tab continues by itself, with the notes, and the old one is view-only with «Baobook оновився в іншій вкладці».
2. Android, the installed app at v3 asleep, Chrome opened on the new build: the waiting strip names the app; opening the app from the switcher continues the tab.
3. After PR 2: two tabs on `.dev`, one hidden for 10 minutes, a build with `FORMAT` raised (a throwaway branch deployed only to `.dev`, or the test origin): the hidden tab, when shown, is view-only at once, and its first keystroke changes nothing.

## 7. Risks

- **A wait that never ends** when the holder never goes and the user does not act: the strip says what to do; nothing is written meanwhile, and nothing is lost. An Android holder is usually discarded by the system within hours.
- **A hung backend after a successful versionless open** (the upgrade transaction never starts for a reason other than a holder) looks like a frozen holder; the silent text says «схоже», and after 60 s `lock.waitLong` adds the full restart and «Оновити» (§3.1 item 4).
- **The frozen waiting tab** (§3.2): it becomes a holder of the queue in turn; the next tab of this code waits behind it (from PR 2 with the right message, §4.7).
- **The second tab behind a waiting upgrade** in PR 1, and in browsers without Web Locks after PR 2: today's `storage` lock (with «Оновити») for the length of the wait, which can be hours on a phone; its late `success` reloads it (`idbBack()`).
- **A damaged database without `sync`** has no format guard (`SDB.run` drops the missing store); such a database is already outside the app's guarantees.
- **Tabs of code before PR 2** have no guard: the first `FORMAT` raise after PR 2 cannot stop a tab of older code that stays open on a device (a phone tab can live for weeks). §8 question 4.
- **The localStorage mode** has no format barrier; it holds notes in the shape every version imports.
- **The extra read** is per transaction, not per request; a measurable cost would show in the median of §4.3.

## 8. Questions for the owner

The owner answered all five on 2026-10-24: **as recommended**.

1. **`blocked` at the start becomes the waiting state** (§3.1 item 2): a lasting block continues by itself when the other tab closes, instead of a view-only tab that needs «Оновити»; the `blocked` lock stays for an open later in the session. Recommended: yes, in PR 1 (the request is alive in both cases and the way out is the same).
2. **The long wait** (§3.1 item 4): after 60 s the strip adds the full-restart advice and «Оновити», while the request is still kept alive. Alternatives: no change of the strip at all, or a lock after 60 s. Recommended: as described.
3. **A new device's upgrade** (§3.2) waits too, instead of the localStorage mode on silence. Recommended: wait (one rule for every upgrade request; the fallback there writes notes into a store the next start has to move).
4. **The first `FORMAT` raise after PR 2.** Recommended: PR 2 is released to `.app` at least one release before any change that raises `FORMAT`; that change's plan says whether a pre-guard tab could still harm it, and if so raises `IDB_VER` once more (with part 2's wait) for that one change.
5. **`format` or a separate `gen` record.** Recommended: `format` (one number; code since PR 0 already reads a `format` above its own as newer data at open, so even tabs of current code started after a raise open view-only). A separate `gen` would need that rule written again for code that does not have it yet.

## 9. Order

1. **PR 1 (part 2)** into `main`: `appidbwait.mjs`, the changes to `appformat` scenarios 4, 9, 9g, `BUILD`, the locale files and their hashes. Checked on `.dev` (where the devices are already at v4, so the check is the scenario run and a start that looks as before).
2. **The release `main → prod`** that carries #100 also carries PR 1; the owner watches the phone on `.app` after it (§6 items 1–2). The owner exports the notes from `.app` before it, as for every release that changes storage.
3. **PR 2 (part 1)** into `main` after PR 1, with `appformatgen.mjs`, the second-tab Web Lock (§4.7) and its scenarios, the `sync.js` change and its hash. It raises no stored value.
4. **The next format change** only after PR 2 is in production (question 4).

## 10. Review rounds

Each round is an internal review of the plan against the code; the plan is fixed and reviewed again until a round finds no blocker or major issue.

**Round 1** (1 blocker, 6 major, 8 minor):
- Blocker: the `baobook:idb-upgrade` Web Lock was released through one shared resolver set in the grant callback, so a tab whose upgrade request answered before its lock was granted (two tabs starting together) held the lock for the rest of its life, and every later genuine silence on the device would read «another tab is asleep» with no way out. Fixed: a release per request with an `AbortController` and an `answered` flag, a test that no lock is left after two tabs start together; the whole mechanism moved out of the urgent PR into PR 2 (§3.1 item 6, §4.7).
- Major: the waiting state applied to every upgrade request, also the session-time `idb.open()` of a started, editable page, where a strip written outside `roSync()` would stay → the waiting state is the start's only; later opens keep today's `blocked` lock and `lock.blocked` stays (§3.1, §3.3, §3.4, scenario 6). Silence does not prove a holder → the silent text is hedged («Схоже…»), `blocked` has its own sure text, and after 60 s `lock.waitLong` adds the full restart and «Оновити»; the fallback copies are not shown during the wait (§3.1 items 3–4, §8 question 2). The guard's abort lost its `locked` code to the `AbortError` of the other pending requests (`SDB.run`) and to `t.error` being null after a manual abort (`idb.tx`), and `vwrite`'s handlers would write on the aborted transaction (a page error) → the refusal is recorded first and never overwritten, `onabort` rejects with it, `vwrite`'s `finish` checks the abort (§4.2 item 2, §4.3). The upgrade wrote `format` = `IDB_VER` over a higher `FORMAT` → it writes `FORMAT` (§4.3). `appformat` scenario 9's 9b, 9c and 9e describe a locked tab → spelled out (§3.5). The scope of the urgent PR → the Web Lock deferred (above).
- Minor: contradictions in §3.3 (`idbOpenRetry`, the hashes: the locale files are in the `SRI` table); Chrome may discard rather than freeze a page that holds IndexedDB state; a slow first upgrade shows the waiting text briefly; `tabMsg`'s last line nudges a leader on unknown messages; the missing `sync` store drops the guard (§7); `serviceWorkers:'block'` for the route, the wrapper leaves the versionless open alone, the second tab opens strictly after the first one's upgrade request; the LOCK and `idbOpenRetry` comments.

**Round 2** (no blocker, no major, 9 minor — **ready**). Folded in: the scenarios of §3.5 that are guards named in its preamble; a reload does not cure a hung backend, the full restart does (§3.1 item 4); every timer of the wait is cleared by the request's first event, «Оновити» never shows during a running upgrade, `lock.waitLong` is never downgraded by a late `blocked` (§3.3); the next tab's long wait covers a frozen waiting tab (§3.2); the second tab's `storage` lock lasts as long as the wait (§7); two format writes and double messages are harmless (§4.8 scenario 6); the writes on `visibilitychange` before the format read are caught by the guard (§4.2 item 5).

**Round 3, independent** (relayed by the owner on 2026-10-24, against head bef182b and base 4b91cbf: no blocker, no major, 4 minor; the architecture, the split into an urgent PR 1 and PR 2, the deferred Web Lock and the defaults of §8 supported, question 4 included: one release in between does not remove old tabs by itself). Folded in:
- Fixing `onabort` alone is not enough: after a manual `abort()` Chrome fires the request's `error` (`AbortError`), the transaction's `error` with `t.error === null`, then `abort`, so today's `t.onerror=()=>rej(t.error)` settles the promise with `null` first (checked by the reviewer in Chrome; the data is rolled back either way). Both handlers of `idb.run` and `idb.tx` reject with the guard's error, and the test checks `error.code==='locked'` as well as the unchanged stores (§4.2 item 2, §4.3, §4.8 scenario 3).
- `framenavigated` does not prove a reload: the start's `setHash` → `history.replaceState` fires it without a new document. The scenarios check a marker on `window`, `performance.timeOrigin` and that no main document was requested (§3.5).
- Several write paths tested in one tab could hit a `LOCK` the first refusal set, hiding a path without the guard: one fresh, unlocked tab per path (`SDB.run`, `idb.tx`, `idb.run`), with the refusal counted inside the created transaction; the missing-`format` check uses a v4 database, which the old code does not upgrade (§4.8 scenarios 3 and 6).
- `lock.waitLong` stated a holder again after silence: it now starts neutrally, «Сховище досі не вдалося відкрити…» (§3.1 item 4, §3.4).

**Round 4, independent** (relayed on 2026-10-24, against head 52c9aae): no findings.
