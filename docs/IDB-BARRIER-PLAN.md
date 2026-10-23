# A barrier against old tabs that never waits for them

**Status: plan, awaiting the owner's approval (2026-10-23).** Two PRs into `main`, in this order: **PR 1 (part 2 below, urgent)** — the one-time v3 → v4 upgrade waits for a sleeping tab instead of locking the device; it ships before #100 is released to baobook.matamata.app. **PR 2 (part 1 below)** — old tabs are stopped by a format number checked inside every write, so later format changes never raise the IndexedDB version and never wait for another tab; it ships before the next format change. The sections are numbered by topic; §9 states the order.

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

1. **No silence deadline on the upgrade request.** `OPEN_WAIT` and the dead/silent logic stay on the versionless open only. The upgrade request gets a **waiting timer** instead, `UPGRADE_WAIT` = 3 s, started with the request and cleared by its first event (`upgradeneeded`, `success`, `error`). When it fires, the request is **waiting**: nothing is rejected, nothing is marked dead, no lock is set, `idb.silent` stays false, and the start keeps awaiting the same promise.
2. **`blocked` on the upgrade request is waiting too.** Today `onblocked` starts a 3 s timer that sets the `blocked` lock and rejects. In this PR a `blocked` event cancels the waiting timer and starts the same 3 s timer, whose end is the waiting state instead of the lock: «two tabs starting together close their v1 at once» keeps its 3 s of grace, and a lasting block is the same situation as the Android silence (another connection does not let go), with the same way out. The `blocked` LOCK kind and the key `lock.blocked` go (§3.4); `appformat` scenarios 4, 9 and 9g change accordingly (§3.5). §8 question 1.
3. **The waiting strip.** The strip that `idbOpenRetry` shows after 1 s (`lock.opening`, every button hidden) changes its text to `lock.waitTab`: «Інша вкладка Baobook або застосунок відкриті й заснули, тому сховище не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме.» The buttons stay hidden: there is nothing to export (no note was read: the start reads the notes after the open), and «Оновити» would not help (the holder still holds; whether a reload drops the queued request is up to the browser). The sheet stays inert and the list empty, as during every wait of the start (IDB-FALLBACK-PLAN §4.1 item 4). If the upgrade request then fires `upgradeneeded` (the holder went), the text goes back to `lock.opening` until the upgrade ends.
4. **It continues by itself.** When the holder closes (the user switched to the frozen tab, which ran `idbLost`, or closed it, or the system discarded it), the browser runs the upgrade: `upgradeneeded` → `success` of a live attempt → `done()` → `idbOpenRetry` returns → `db.init()` goes on, writes `idbOk` if absent, and the start finishes as usual; `roSync()` at `STARTED` hides the strip. **No reload** is needed or made, so `RELOADS_MAX` and `sheet:idb-reloads` are not involved.
5. **A second tab behind a waiting upgrade.** Per the IndexedDB spec, open requests of one database are processed one at a time, so a versionless open from another tab of this code queues behind the waiting upgrade request and is silent too. Without help it would reach `OPEN_WAIT` and the `storage` lock with the wrong message. So the waiting tab holds the Web Lock **`baobook:idb-upgrade`** from the moment it sends the upgrade request until that request answers (success, error, or the page goes away, which releases the lock). When a versionless open reaches its deadline, it asks `navigator.locks.query()`; if `baobook:idb-upgrade` is held (by any tab), the open is **not** dead: it becomes waiting the same way (the strip says `lock.waitTab`, no lock, no `idb.silent`), and its late `success` (the database is at `IDB_VER` by then) continues the start with no upgrade and no reload. The query is asynchronous: until it answers the deadline has not decided; an error or no Web Locks API decides «not held» (today's dead path). Old tabs of code before this PR cannot be helped this way; they keep today's behaviour (the `storage` lock, recovered by the dead attempt's late `success` → `idbBack()` reload).
6. **No limit on the wait.** The tab waits as long as the holder holds. A deadline after which the tab gives up would only turn a self-healing wait into a lock that needs a reload; the strip says what to do. §8 question 2.

### 3.2 Interactions

| With | What happens |
|---|---|
| `OPEN_WAIT` (8 s) | applies to the versionless open only; at its end the `baobook:idb-upgrade` query decides between waiting and dead (§3.1 item 5) |
| the dead/silent logic | unchanged for the versionless open (a dead attempt's late `success` closes and calls `idbBack()` under the `storage` lock; its late `error` restarts the probing). An upgrade request is never dead; a dead versionless open never sends one (`onsuccess` returns before `next()`, as today) |
| the retries (`OPEN_RETRY`) | unchanged: an `error` of the upgrade request (other than `VersionError`, which goes to `go(0)` as today) rejects the attempt and the loop retries after 300 and 900 ms; each retry starts again with the versionless open |
| the probe (`idbWatch`/`idbProbe`) | never started from the waiting state: no lock is set. A probe running under the `storage` lock of a tab of this code is a versionless open; it can queue behind another tab's waiting upgrade; its 3 s deadline then makes it silent, which ends the probing and leaves it as the watch (IDB-FALLBACK-PLAN §4.4): its late `success` after the upgrade reloads that tab into a healthy start. No change there |
| `RELOADS_MAX` | not involved: the waiting tab continues in place |
| `blocked` | the waiting state after 3 s (§3.1 item 2); the `blocked` lock is gone |
| `newer` | decided before any upgrade request (the format read and `d.version>IDB_VER` in `onsuccess` of the versionless open), unchanged |
| `lock.opening` | shown after 1 s of any wait as today; replaced by `lock.waitTab` while waiting |
| a first open on a device that never had IndexedDB | the versionless open creates the empty v1 (`upgradeneeded` with no version clears its deadline), then `go(IDB_VER)` is an upgrade request like any other: a holder of that v1 (another tab of the same start, normally closed at once; or a tab that froze in the middle of its own first start) makes it wait with the same strip. It never falls into the localStorage mode on silence: today a silent upgrade on a new device ends in the fallback mode (no `idbOk`), with the hung request still in the queue and its late upgrade making the database nobody reads until the next start. §8 question 3 |
| a waiting tab that is itself frozen later | its pending request keeps the queue; when the holder goes, the upgrade waits for this frozen tab to run `upgradeneeded`. The next tab of this code sees `baobook:idb-upgrade` held (a frozen tab keeps its Web Locks) and shows the waiting strip, which is the right message: another Baobook tab is asleep |
| the update strip (`updCheck`) | independent, as under every wait |
| `DEBUG.saveGate`, `saveHold` | untouched |

### 3.3 Code (`public/index.html`)

| Where | Change |
|---|---|
| the constants after `IDB_VER` | `UPGRADE_WAIT=3000`; the comment says the deadline is for the versionless open, the waiting timer for the upgrade request |
| `idb.open` → `go(v)` | for `v>0`: no `dt` deadline; `wt=setTimeout(idbWait, UPGRADE_WAIT)`, cleared by the first event; request `baobook:idb-upgrade` (`navigator.locks.request(name, ()=>new Promise(r=>idb.upRel=r))`, in a `try`, no wait for it) and release it in `onsuccess`/`onerror` of that request |
| `idb.open` → the deadline of `go(0)` | before `dead=true`: `navigator.locks.query()` (in a `try`, with `.catch`): `held` contains `baobook:idb-upgrade` → `idbWait()` and return (the request stays live); otherwise today's dead path. A first event that arrives while the query is in flight clears the deadline as today, and the query's answer is ignored (a flag) |
| `idb.open` → `onblocked` | for the upgrade request: `clearTimeout(wt)`, a 3 s timer to `idbWait()`; no `setLock`, no `rej`. A versionless open is never blocked (defensive no-op as in the probe) |
| `idb.open` → `onupgradeneeded` | also `clearTimeout(wt)`; if waiting, `roMsg` back to `lock.opening` |
| new `idbWait()` | `idb.waiting=true`; `roMsg.textContent=loc('lock.waitTab')`, `roStrip.hidden=false`, the four buttons hidden (as in `idbOpenRetry`) |
| `idb.open` → `onsuccess`/`onerror` of a live attempt | `idb.waiting=false` |
| `idbOpenRetry` | unchanged; its 1 s timer does not overwrite `lock.waitTab` (it checks `idb.waiting`) |
| the LOCK comment block, `roSync()` | `'blocked'` removed from the kinds and from the message map |

`public/sync.js`, `public/cloud.js`, `public/sw.js` do not change. `BUILD` is raised in all its places (CLAUDE.md); no hashes change (`index.html` only, locale files change → `node tests/hashes.mjs --write` for the two locale files).

### 3.4 Strings

| Key | uk | en |
|---|---|---|
| `lock.waitTab` (new) | Інша вкладка Baobook або застосунок відкриті й заснули, тому сховище не може оновитися. Перейдіть туди на мить або закрийте їх — тут усе продовжиться саме. | Another Baobook tab or the installed app is open and asleep, so the storage cannot be updated. Switch to it for a moment or close it, and this page will continue by itself. |
| `lock.blocked` | removed (no longer used; `appi18n` fails on unused keys) | removed |

### 3.5 Tests

New scenario **`tests/appidbwait.mjs`** (style of `appidbfail.mjs`/`appvsync.mjs`: `lib/server.mjs`, `CTX`, `until`, `✓`/`✗`, screenshots under `<tmpdir>/sheet-tests/`). The holder is real: a page of the origin (`blank.html`) that opens `sheet` at the old version and keeps the connection with `onversionchange` removed. «No `blocked`» is simulated in the app's page by an init script that wraps `IDBFactory.prototype.open` and, for a request with a version, makes `onblocked` a setter that drops the handler and `addEventListener('blocked',…)` a no-op: the request then hangs silently exactly like the Android one, and when the holder closes, the real upgrade runs. Every scenario except 3 fails on the code before this PR (checked by putting `public/index.html` from `HEAD` back).

| # | Step | Fails before |
|---|---|---|
| 1 | a v3 database with a note (the page served with `IDB_VER` 3 via route, as `appvsync` scenario 2, then closed); holder H at v3, deaf; the app with «no `blocked`»: within 1.5 s `lock.opening`, within 4.5 s `lock.waitTab` with all four buttons hidden; after 12 s still `lock.waitTab`, no `lock.storage`, `LOCK` null (`sheetDebug`), exactly one versionless open and one upgrade request (counted by the wrapper), no `sheet:note:` key; H closes → within 3 s the note shows, editable, no navigation (`framenavigated` not fired), the database at 4 with `format` 4, an edit saved | yes (`lock.storage` at 8 s) |
| 2 | the same with `blocked` delivered (no wrapper): `lock.waitTab` after about 3 s, never `lock.blocked`; H closes → the start continues without a reload | yes (`lock.blocked`) |
| 3 | the frozen variant: the old page (`IDB_VER` 3) open and frozen with CDP `Page.setWebLifecycleState {state:'frozen'}`; the app starts: either at once or after `lock.waitTab`; after `active` the old page shows `lock.updated`; no page error. A guard of the real lifecycle path, not a reproduction (desktop Chromium does not hang) | no |
| 4 | a second tab behind the wait: as 1, then tab C opens the app: after 8 s C shows `lock.waitTab`, not `lock.storage`; `navigator.locks.query()` in C lists `baobook:idb-upgrade`; H closes → A and C both start, no reload in either, C sends no upgrade request | yes |
| 5 | a new device: no database; holder H opens `sheet` without a version (the empty v1) and stays deaf; the app with «no `blocked`»: `lock.waitTab`, no «(резервне сховище)», no `sheet:note:` key, `idbOk` absent; H closes → a normal start, `idbOk` written | yes (the fallback mode at 8 s) |
| 6 | the wait under a dialog-free page left hidden for 10 s and shown again (`visibilitychange`): no probe, no reload, still waiting; H closes → continues | yes |
| 7 | no page errors over the run | — |

Existing scenarios:

- `appformat.mjs` scenario 4 («a blocked setup…»): expects `lock.waitTab` after 3.6 s instead of «Закрийте інші вкладки Baobook», then, when B closes its v1, the start continuing **without** the reload the scenario does today; 4b (typing changes nothing, no fallback key) stays. Scenarios 9 and 9g (a save during a blocked start; two fallback copies under a blocked start): the save waits for the start as before; the copies are judged after the holder closes and the start finishes (9g: the newer note and exactly one backup copy, now moved in through `db.move()` rather than shown from `fbAll()` under the lock). `ready()` there waits for a list item, which a waiting start never shows (the list stays empty until the open ends), so these scenarios wait for the strip instead and call `ready()` only after the holder closes.
- `appidbfail.mjs` step 18 (the real queue: C's upgrade request blocked by B, A's versionless open queued behind it) changes: C is the test's own raw request, so no `baobook:idb-upgrade` is held and A still gets the `storage` lock, as written; a sub-step adds the same with C being an app tab of this code (A then shows `lock.waitTab`).
- `appvsync.mjs` scenario 2 (the v4 barrier with an awake old page) passes unchanged: the old page answers `versionchange`.
- `appi18n.mjs` covers the new key and the removed one; `appupdate.mjs` the raised `BUILD`.

### 3.6 Docs

IDB-FALLBACK-PLAN §4.1 item 1 (`blocked`, the deadline per request) and §9 get one sentence each pointing here; SYNC-PLAN §4.9 «Old tabs stop writing» gets a sentence on the wait.

## 4. Part 1 — the format barrier (PR 2)

### 4.1 The rule

- **`IDB_VER` is raised only when stores or indexes change** (it stays 4; it cannot go back down: an existing v4 database would read as a newer app's data).
- **`FORMAT` is raised when tabs of older code must stop writing**: a field changes meaning, a write moves to another path (as in 4a-1, where the old `vwrite`/`saveName` bypassed the core's queue), a record shape that older code would damage. A change of stores raises both.
- `FORMAT` starts at 4, the value the `format` record already holds on every device with #100, so this PR changes no stored value.

### 4.2 Behaviour

1. **At start the tab records the format.** The versionless open's `onsuccess` today reads `format` in a readonly transaction. It becomes one **readwrite** transaction on `sync`: read `format`; if it is above `FORMAT` → `newer` (today's rule, unchanged); if it is absent or below `FORMAT` and no lock is set → put `{k:'format', v:FORMAT}` in the same transaction. No other tab is asked or waited for: this is an ordinary write. After it commits, the tab sends `{t:'format', v:FORMAT}` on the `sheet:notes` channel (`tellTabs`). A raise found before an upgrade request is written before it, so tabs that have the check stop at once even when the upgrade then has to wait (§4.6).
2. **Every write checks the format inside its own transaction.** Every readwrite transaction of the app includes the `sync` store and issues `get('format')` as its **first** request; in its `success`, a value above `FORMAT` aborts the transaction (`t.abort()`, which also rolls back any request queued after it: a transaction cannot commit while one of its requests' events has not been dispatched), calls `fmtNewer()` and rejects with `{code:'locked'}`. A value at or below `FORMAT`, or no record, lets the transaction go on. So a tab woken from freezing — whose timers, saves and engine steps resume in the middle of their work — stops at its first write, and that write leaves nothing behind.
3. **`fmtNewer()`**: `setLock('updated')` (the existing «Baobook оновився в іншій вкладці. Оновіть сторінку, щоб продовжити.», or `lock.unsaved` with «Експортувати незбережене» when an edit could not be written), then close the connection (`idb.db.close(); idb.db=null`), so a later real upgrade by a newer tab does not have to wait for this one. No `retrySave()`: unlike `idbLost`, the newer format is already in place, so a save would be refused; the unsaved edit stays exportable from memory, as `lock.unsaved` offers today.
4. **The message.** `tabMsg` takes `{t:'format', v}`: `v>FORMAT` → `fmtNewer()`. This is the fast path for an awake tab that is not writing (its sheet turns inert at once instead of at the next keystroke); a tab that misses it (frozen: the message may wait or be dropped; bfcache) is caught by item 5 or by item 2 at its next write. Code before this PR ignores the unknown message (`tabMsg` has no `else`).
5. **Coming back.** On `visibilitychange` to visible and on `pageshow` with `persisted`, a tab with `idb.db` and no lock reads `format` (readonly, one request) and calls `fmtNewer()` when it is above `FORMAT`. The read can fail (a closed connection): then nothing happens, and the next write decides.

### 4.3 Which writes

| Path | Where | Change |
|---|---|---|
| `idb.run(mode, fn)` (store `notes`: `idb.del` from `db.remove`; `idb.put` has no caller) | `public/index.html` | for `readwrite` the scope is `['notes','sync']` (`sync` left out when the database lacks it, as `SDB.run` does) and the guard request goes first |
| `idb.tx(stores, mode, fn)` (automatic versions `vwrite`, `vdelete`/`vthin`/`vdrop`, the sweep) | `public/index.html` | the same: `sync` added to a readwrite scope, the guard first, before `fn(t)` |
| `SDB.run` (every write of the sync core: `writeLocal`, `importMany`, `versionLocal`, `setOwner`, the cursors, `flushQuota`, the format write of `sync.js` line 868; and the two `device` puts of `index.html`) | `public/index.html` | the guard request first, before `fn(T)` runs; on a newer value `failed` is the `locked` error and the transaction aborts. `sync` is already in most scopes; it is added where it is not |
| the core's error handling | `public/sync.js` | `guarded`/`vguarded` and the receive paths treat `code==='locked'` like `epoch`: return quietly (today a `locked` error would count as a storage failure and back off the job, which is itself a refused write). `deps.format` is passed `FORMAT` instead of `IDB_VER`. `sync.js` changes, so `node tests/hashes.mjs --write` |
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

A later change of stores raises `IDB_VER` and `FORMAT` together. The new tab then writes the raised `format` on the old version's connection first (§4.2 item 1), so every tab with the guard stops writing at once and closes its connection on the message; then it sends the upgrade request. Awake tabs of any code since PR 0 close on `versionchange`; a frozen one keeps its connection, and the upgrade waits with the strip of part 2 (`lock.waitTab`) and continues by itself when it goes. The wait remains for that rare change, with the right message and no lock.

### 4.7 Tests

New scenario **`tests/appformatgen.mjs`**. A «newer» page is the current `index.html` served with `const FORMAT=5` via route (as `appvsync` scenario 2 serves `IDB_VER` 3); the scenario asserts the replacement took effect. Every scenario except 7 fails on the code before this PR.

| # | Step | Fails before |
|---|---|---|
| 1 | tab A (current), a note typed and saved; tab N (newer) opens: N starts with no strip and no wait (the versionless open only, `IDB_VER` still 4), `format` reads 5; within 1 s A shows `lock.updated`, its sheet inert, «Нова» says `lock.say` | yes |
| 2 | the woken tab: A's `BroadcastChannel` messages dropped by an init script (as a frozen tab misses them) and A hidden; N raises; A types (the sheet is still editable): the save is refused, A shows `lock.unsaved` with «Експортувати незбережене», the export carries the edit; the stored note is byte for byte the one before (read with the test's own `indexedDB.open`), no `sheet:note:` key, `lrev` unchanged | yes |
| 3 | the core's writes: A leads (the test cloud of `tests/lib`), N raises with messages dropped in A; A names a version and imports a file: both refused, no new record in `versions`, no job in the queue; A releases the leader lock and N takes it | yes |
| 4 | an automatic version and a deletion in A (via `idb.tx`/`idb.run`) after the raise: refused, the stores unchanged | yes |
| 5 | coming back: A hidden while N raises with messages dropped, then `visibilitychange` to visible: `lock.updated` without any write | yes |
| 6 | the start records the format: a database whose `format` record was deleted (a v3-era database) → after a start `format` is 4; a tab of a newer page with messages working and two tabs of it starting together: both start, one value 5, no error | yes (the first half: today the record is written only in the upgrade) |
| 7 | a rollback: a database with `format` 5 opened by the current page → `newer` at start (today's rule, a guard) | no |
| 8 | a real upgrade after the raise: the newer page served with `IDB_VER` 5 and `FORMAT` 5, a deaf holder at 4 and «no `blocked`»: A (current) is stopped by the format first (`lock.updated` before the upgrade runs), N waits with `lock.waitTab`; the holder closes → N continues | yes |
| 9 | no page errors over the run | — |

Existing: `appvsync` scenario 2 (the v4 barrier) stays as the history of the v3 → v4 step; `appformat` keeps its `newer` scenarios; `appsave`/`appstatus` (with `DEBUG.saveGate`/`saveHold`) pass with the guard inside the transaction; the Node suites of `sync.js` (`syncsim`, `syncversions`…) run on a store double whose `tx` ignores `format`, so they need the `locked` branch only in `syncsim`'s error paths, one check added. `tests/README.md` gets both new rows.

### 4.8 Docs

SYNC-PLAN §4.9 «Old tabs stop writing» and §3's `format` row: the v4 upgrade was the last barrier by version; later ones are the format guard (this document). SYNC-PLAN §4.14 item 3 (`versionchange`) stays for real upgrades.

## 5. Why the tests simulate the hang

Desktop Chromium did not hang with a CDP-frozen holder, so a test that only freezes a tab would pass on the broken code. The real ingredients of the Android hang are two: a connection that is never closed, and no `blocked` event at the upgrade request. Both are reproduced with real IndexedDB (a deaf holder page; the `blocked` event withheld from the app's handler), so the upgrade itself, the connection queue and the late `success` are the browser's own. The frozen variant (§3.5 scenario 3) stays as a guard of the lifecycle path.

## 6. Manual checks on devices

1. Android Chrome, PR 1: `.dev` cannot show it any more (its devices are already at v4), so the check is the release itself (§9): before the release, a Baobook tab of `.app` (v3 code) left in the background long enough to be frozen (10 minutes with other apps used meanwhile); after the release a new tab of `.app`: the waiting strip `lock.waitTab` instead of `lock.storage`; switching to the old tab for a moment and back (or closing it): the new tab continues by itself, with the notes, and the old one is view-only with «Baobook оновився в іншій вкладці».
2. Android, the installed app at v3 asleep, Chrome opened on the new build: the waiting strip names the app; opening the app from the switcher continues the tab.
3. After PR 2: two tabs on `.dev`, one hidden for 10 minutes, a build with `FORMAT` raised (a throwaway branch deployed only to `.dev`, or the test origin): the hidden tab, when shown, is view-only at once, and its first keystroke changes nothing.

## 7. Risks

- **A wait that never ends** when the holder never goes and the user does not act: the strip says what to do; nothing is written meanwhile, and nothing is lost. An Android holder is usually discarded by the system within hours.
- **The frozen waiting tab** (§3.2): it becomes a holder of the queue in turn; the next tab of this code says so through the Web Lock.
- **Browsers without Web Locks**: the second tab behind a waiting upgrade gets today's `storage` lock; its late `success` reloads it (`idbBack()`), so it recovers when the upgrade ends.
- **Tabs of code before PR 2** have no guard: the first `FORMAT` raise after PR 2 cannot stop a tab of older code that stays open on a device (a phone tab can live for weeks). §8 question 4.
- **The localStorage mode** has no format barrier; it holds notes in the shape every version imports.
- **The extra read** is per transaction, not per request; a measurable cost would show in the median of §4.3.

## 8. Questions for the owner

1. **`blocked` becomes the waiting state** (§3.1 item 2): the `blocked` lock and `lock.blocked` go, and a lasting block continues by itself when the other tab closes, instead of a view-only tab that needs «Оновити». Recommended: yes, in PR 1 (the request is alive in both cases and the way out is the same).
2. **No limit on the wait** (§3.1 item 6). Alternative: after, say, 60 s the `storage`-like lock with «Оновити». Recommended: no limit.
3. **A new device's upgrade** (§3.2) waits too, instead of the localStorage mode on silence. Recommended: wait (one rule for every upgrade request; the fallback there writes notes into a store the next start has to move).
4. **The first `FORMAT` raise after PR 2.** Recommended: PR 2 is released to `.app` at least one release before any change that raises `FORMAT`; that change's plan says whether a pre-guard tab could still harm it, and if so raises `IDB_VER` once more (with part 2's wait) for that one change.
5. **`format` or a separate `gen` record.** Recommended: `format` (one number; code since PR 0 already reads a `format` above its own as newer data at open, so even tabs of current code started after a raise open view-only). A separate `gen` would need that rule written again for code that does not have it yet.

## 9. Order

1. **PR 1 (part 2)** into `main`: `appidbwait.mjs`, the changes to `appformat` and `appidbfail` step 18, `BUILD`, the locale files and their hashes. Checked on `.dev` (where the devices are already at v4, so the check is the scenario run and a start that looks as before).
2. **The release `main → prod`** that carries #100 also carries PR 1; the owner watches the phone on `.app` after it (§6 items 1–2). The owner exports the notes from `.app` before it, as for every release that changes storage.
3. **PR 2 (part 1)** into `main` after PR 1, with `appformatgen.mjs`, the `sync.js` change and its hash. It raises no stored value.
4. **The next format change** only after PR 2 is in production (question 4).

## 10. Review rounds

(filled in as the rounds go)
