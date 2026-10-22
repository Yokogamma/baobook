# No silent localStorage fallback when IndexedDB fails to open

**Status: plan, awaiting the owner's approval (2026-10-22); revised after review rounds (§12).** Nothing is implemented yet. One PR into `main` (§8 lists its parts), released with the next `main → prod`.

## 1. Problem

`db.init()` in `public/index.html` opens IndexedDB once (`idb.open()`); when the open fails it quietly switches the app to localStorage:

```js
try{ await idb.open(); db.backend='idb'; }catch(_){ db.backend='local'; if(LOCK) return; const w=await writerLock(); if(w) fbLocal(); else setLock(w===false? 'other' : 'nolock'); return; }
```

That mode was designed for a browser **without** IndexedDB (SYNC-PLAN §4.14, item 5: "a rare environment"). It is also what the app does when IndexedDB exists but one open fails, which Chrome on Android does from time to time: `UnknownError: Internal error opening backing store for indexedDB.open` at a cold start, after the system killed the browser under memory pressure, or right after the PWA was reinstalled. The next start usually opens the database fine. In the fallback mode:

- the real notes are not on the screen (they are in the database that did not open); the list shows only the localStorage copies, usually none, so `start()` runs `newNote()` and **stores an empty «Без назви» note** under a plain `sheet:note:<id>` key;
- the app is fully editable and looks normal; the only hint is «(резервне сховище)» in the storage line of the panel footer;
- the account menu and the status button are hidden (`accOn()` needs `db.backend==='idb'`), so to a signed-in user the app looks signed out and shows a strange empty list;
- at the next start with IndexedDB the plain keys move in (`db.move()`), and the stray empty note stays in the list for good (an empty note is only purged when it is deleted by hand).

The owner likely hit this on 2026-10-21 on Android after reinstalling the PWA from `baobook.matamata.dev` (not confirmed).

## 2. Evidence

Reproduced with Playwright on the current `main` (an init script replaces `IDBFactory.prototype.open` with one that throws `DOMException('Internal error opening backing store for indexedDB.open.','UnknownError')` while a flag is set; the attempts are counted):

| Start | What the app did |
|---|---|
| 1. Normal start, a note typed | 1 note, stored in IndexedDB; `sheet:settings` gets `devId`, `devName`, `versSwept`; no `sheet:note:` keys |
| 2. The open throws | **one** attempt; the storage line says «1 нотатка на цьому пристрої (резервне сховище)»; the list shows one «Без назви»; the sheet is editable; no strip; a plain key `sheet:note:<new id>` holds the empty note |
| 3. Normal start again | 2 notes: the real one and the empty «Без назви» moved in from the plain key |

The scenario `tests/appidbfail.mjs` (§8) runs these steps and fails on the current code at steps 2 and 3.

The same open can also **hang** (no `success`, `error` or `blocked` event): Chrome's backing store open serializes behind the previous process's handles, and Safari had a known hang of the first `indexedDB.open` after a page was restored from the background. Today the app waits forever: the start never finishes, the sheet stays inert and the list empty, with no message.

## 3. Goal

- A device whose IndexedDB has worked before never silently drops into the localStorage mode: a failed open is retried, and if it still fails the app is **view-only with a strip that says why and offers a reload**, stores nothing, creates no empty note, and recovers by itself when the storage opens again.
- A device that has never had IndexedDB keeps today's behaviour (the fallback mode with the writer lock, §4.14 of SYNC-PLAN).
- Nothing changes in the stores, the fields or the export format.

## 4. Behaviour

### 4.1 Starting

1. `db.init()` opens the database with **retries**: attempts at 0, 300 and 900 ms after the previous failure (three in all), each with a **deadline** of 3 s. An attempt fails when `indexedDB.open` throws, when the request fires `error` (except `VersionError`, which keeps its handling: another tab upgraded the database, open what is there), or when no event has fired by the deadline. `blocked` is not a failure to retry: another tab holds the database, and `setLock('blocked')` after 3 s stays as it is. A `success` that arrives after its attempt was abandoned closes that connection; a `success` of a live attempt ends the loop as today.
2. With the database open, the start goes on as today, and `S.idbOk` is written once (§5): this device has a working IndexedDB.
3. When every attempt failed:
   - no `window.indexedDB` at all, or the device has no marker (§5): **today's path**, unchanged — `db.backend='local'`, the writer lock, `fbLocal()`, or the `other`/`nolock` lock;
   - the marker is there: `setLock('storage')` **before** anything is written. `db.backend` stays `'local'`, so every path that asks for IndexedDB (`vstart`, `purgeOld`, `accOn`, `db.move`, the leader) is off, and `LOCK` stops every write, `db.save` and the fallback keys included (`db.save` answers `{ok:false, reason: save.reason.locked}` as under any lock). `writerLock()` is not asked for and `fbLocal()` does not run: localStorage is not touched. The background retry (§4.4) starts.
4. While the attempts run, nothing can change: the sheet is inert and the title not editable until `STARTED` (as `appformat` checks today: «While the start still waits for the database nothing can change»). After 1 s of waiting the strip shows «Сховище браузера відкривається…» with no buttons (`lock.opening`), so a slow or hanging open does not look like a frozen app; the start replaces it with the lock strip or hides it.

Typical cost: Chrome's `UnknownError` is thrown synchronously, so a device that recovers at the second attempt starts about 300 ms later than today and the user sees nothing. The worst case, three hanging attempts, locks the tab after about 10 s.

### 4.2 What the view-only tab shows

- The notes `db.all()` finds in localStorage (`fbAll()`): the plain keys and the fallback copies left by writes that missed IndexedDB, with a differing older copy as «… (резервна копія)» in memory, exactly as the `newer` lock shows them today. Usually there are none; then `newNote()` adds the empty note **in memory only** (`MEM`, never written: `newNote` already does this under `LOCK`), so the list and the sheet are not blank.
- The strip under the header, like the other locks (`roStrip`, `roMsg`, `roExport`, `roReload`): `lock.storage` «Сховище браузера не відкрилося, тож нотатки з цього пристрою зараз не прочитати. Оновіть сторінку; якщо не допоможе — закрийте застосунок і відкрийте знову.» with «Експорт» and «Оновити». The sheet is inert, the title fixed, the list items open notes read-only; «Нова», paste, Ctrl+Alt+N and every other write say `lock.say` through `held()`.
- The storage line says «N нотаток на цьому пристрої (сховище не відкрилося)» (`storage.closed` instead of `storage.fallback`): the count is of what is on the screen, not of the device.
- The account row and the status button are hidden, as under every lock (`accOn()` is false). The strip explains the state, so the hidden menu no longer looks like a sign-out.
- «Експорт» on the strip and in the gear menu export what is on the screen (`exportAll`: the in-memory notes, the empty `MEM` note left out, no `history` since there is no database). With no fallback copies the file has no notes; the button stays, since a copy may be there.
- «Оновити» reloads the page (`location.reload()`), which starts the retries again.

### 4.3 Edits, tabs, sync

- **Edits typed during the retries:** none are possible (§4.1, item 4). Tab messages that arrive before `STARTED` wait in `TABQ` as today.
- **Multiple tabs:** the locked tab holds no `baobook:writer` lock and no leader lock (`setLock` runs `leadOff()`; `leadAsk` is never called because the engine was not loaded from the store and has no owner). A second tab whose open succeeds works normally, moves the plain keys in under the writer lock and leads the sync. The locked tab keeps showing its in-memory copies until it is reloaded; `put`/`del` messages from the other tab reach it through `tabMsg` → `takeNote`/`dropNote`, which add to or leave the list under `LOCK` as the `other`/`nolock` locks do today (`dropNote` returns under `LOCK`). Two tabs that both fail are both view-only; no lock is needed, since neither writes.
- **The sync engine:** `SYNC=makeEngine()` is still made (it needs no store until `reload()`), `SYNC.reload()` and `db.move()` are skipped (`db.backend==='idb' && !LOCK` is false), so the engine has no owner and no queue and never steps. `accStart()` returns at `!accOn()`. Nothing is sent or received; the cloud is untouched. After a reload with the database open, everything resumes.
- **Writes that fail after a successful start** (`idbLost`, a transaction that fails, `DEBUG.failSave`): unchanged. `db.save` keeps writing the fallback copy `sheet:note:<id>~<tab>~<generation>` when IndexedDB refuses a write, and the copy moves in at the next start through `db.move()`; `unsaved`, «Повторити» and «Експортувати» work as today. Later opens (`idb.run`, `idb.tx`, `SDB.tx` after a closed connection) stay single attempts without a deadline: a retry there would only delay the fallback copy, which is the right outcome for a write.
- **The existing locks:** `newer` and `blocked` are decided inside the open and win over `storage` (`setLock` keeps the first kind). `updated` and `epoch` come after the start. `other` and `nolock` stay the locks of the fallback mode (no marker, or no `indexedDB` object); `storage` is the lock of a device that has the database but cannot open it.
- **The update strip (PR #91, `fix/stale-shell`):** `updCheck` runs regardless of `LOCK`; in the `storage` lock `updBusy()` is false, so «Оновити» there reloads at once, which is also the recovery path. Both strips can show at the same time (one under the header, one above the toast). This PR raises `BUILD`, the meta tag and `build.json` as every change of `public/` does.

### 4.4 Recovery

- While `LOCK==='storage'`, `idbWatch()` tries the open again in the background: 5 s after the lock, then 10, 20 and every 30 s, only while the tab is visible (`document.hidden` pauses the timer; `visibilitychange` to visible tries at once, which is how a phone brought back to the app recovers). Each try is one attempt with the 3 s deadline.
- A try that succeeds closes its connection and **reloads the page** (`location.reload()`): the tab is view-only and holds nothing unsaved, so nothing is lost, and the reload keeps the open note (`tabCur`, `how==='reload'` in `start()`). A reload that fails again and locks again is throttled: at most three automatic reloads per tab session (`sessionStorage` key `sheet:idb-reloads`); after that the strip changes to `lock.storageBack` «Сховище браузера знову доступне. Оновіть сторінку, щоб продовжити.» and waits for the button.
- The owner may prefer no automatic reload at all (§11, question 2); then every success changes the strip to `lock.storageBack` and the button reloads.

### 4.5 Devices that have never had IndexedDB

Unchanged: a browser without `indexedDB`, and a device without the marker (a fresh profile whose very first open fails, a private window in an old Safari), keep the fallback mode with the writer lock, the `other`/`nolock` locks and the plain keys. The retries run there too, so a fresh device that recovers at the second attempt starts normally.

### 4.6 Private mode, iOS and Safari

- The marker lives in the same storage partition as the database, so a private window (its own empty localStorage and IndexedDB) has no marker and behaves as a new device. Safari before 15 refused IndexedDB in private browsing: that is the no-marker path.
- Safari's hanging first open after a restore from the background is a deadline failure, retried; if the three attempts hang the tab locks and the background try at the next `visibilitychange` recovers it.
- iOS evicts the site data of an installed PWA that was not used for a while (ITP) — localStorage and IndexedDB together, so the marker goes with the database and the device starts fresh, as today.

## 5. Data

- One new optional key in `sheet:settings`: `idbOk` — the time in ms when IndexedDB first opened on this device, written by `db.init()` after a successful open when the key is absent (`saveS({idbOk:now()})`). Absent means «never». It is a device setting like `devId`: not exported, not imported, not synced.
- **Devices updated from the current code** have no `idbOk` at their first start with the new code. `S.versSwept` is written only by `vstart()` after a successful versions sweep with IndexedDB (`db.backend==='idb' && !LOCK`), so `idbWorked()` is `!!(S.idbOk || S.versSwept)`: every device that has run the app with IndexedDB for one start is covered from the first start of the new code. The reproduction in §2 shows `versSwept` set after the first normal start.
- No new store, no database version bump, no note field, no change to the export file. The LOCK kinds are a code constant, not stored.
- `sessionStorage` key `sheet:idb-reloads` (the count of automatic reloads in this tab, §4.4), like `sheet:tab-current` and `sheet:signin`.

## 6. Code changes by function (`public/index.html`)

| Where | Change |
|---|---|
| the LOCK comment block before `IDB_VER` | add `'storage'` (IndexedDB exists and has worked here, but did not open at this start) and `OPEN_WAIT=3000`, `OPEN_RETRY=[300,900]` |
| `idb.open(o)` | takes an optional `{deadline}`: a timer that rejects with `Error('timeout')`, marks the attempt dead and ignores its late events (a late `success` closes `r.result`). Without the option the behaviour is exactly today's, so `idb.run`, `idb.tx` and `SDB.tx` do not change. `onblocked` keeps its own 3 s timer and `setLock('blocked')`; the deadline timer is cleared when `blocked` fires, since the block has its own handling |
| new `idbOpenRetry()` | `for(const wait of [0, ...OPEN_RETRY])`: sleep, then `await idb.open({deadline:OPEN_WAIT})`; returns on success; stops without retrying when `LOCK` is set (`blocked`) or `window.indexedDB` is missing; after the last failure throws the last error. Shows `lock.opening` on the strip after 1 s of waiting (a timer cleared on exit) |
| new `idbWorked()` | `!!(S.idbOk \|\| S.versSwept)` |
| `db.init()` | `await idbOpenRetry()` instead of `idb.open()`; on success `if(!S.idbOk) saveS({idbOk:now()})`; in the catch: `if(LOCK) return; if(window.indexedDB && idbWorked()){ setLock('storage'); idbWatch(); return; }` before today's writer-lock path |
| new `idbWatch()` | the background retry of §4.4: timers only while `LOCK==='storage'` and the tab is visible; a success closes the connection and reloads, or changes the strip, within the reload throttle |
| `roSync()` | the message map gains `LOCK==='storage'? 'lock.storage'` (and `'storageBack'`, a flag on `idb`, when the strip changes instead of reloading); `lock.opening` is set on `roMsg` with `roStrip.hidden=false` and both buttons hidden before `STARTED` |
| `storageUI()` | the suffix is `loc(LOCK==='storage'? 'storage.closed' : 'storage.fallback')` when `db.backend!=='idb'` |
| `start()` | no change: `db.all()` → `fbAll()` already shows the localStorage copies, `newNote()` under `LOCK` is in memory only, the fallback-key merge is only for `db.backend==='idb'` |
| `BUILD`, `<meta name="baobook-build">`, `public/build.json` | raised |
| `docs/SYNC-PLAN.md` §4.14 item 5 | one sentence: the fallback mode is for a device without the marker; with it, a failed open is the `storage` lock (this document) |

`public/sync.js`, `public/cloud.js`, `public/sw.js`, the manifest and the Firestore rules do not change.

## 7. Strings

`public/locales/uk.json` and `public/locales/en.json`, per the Localization section of CLAUDE.md (whole sentences, no fragments; `appi18n` checks that every key is used and present in both files):

| Key | uk | en |
|---|---|---|
| `lock.storage` | Сховище браузера не відкрилося, тож нотатки з цього пристрою зараз не прочитати. Оновіть сторінку; якщо не допоможе — закрийте застосунок і відкрийте знову. | The browser storage did not open, so the notes on this device cannot be read right now. Reload the page; if that does not help, close the app and open it again. |
| `lock.storageBack` | Сховище браузера знову доступне. Оновіть сторінку, щоб продовжити. | The browser storage is available again. Reload the page to continue. |
| `lock.opening` | Сховище браузера відкривається… | Opening the browser storage… |
| `storage.closed` | (сховище не відкрилося) | (storage did not open) |

The buttons reuse `lock.export`, `lock.exportUnsaved` and `lock.reload`; the refusal toast reuses `lock.say`.

## 8. Tests

### 8.1 New scenario `tests/appidbfail.mjs`

Style as `tests/appformat.mjs` and `tests/appupdate.mjs`: one static server from `lib/server.mjs`, `CTX`, `ready`/`until` from `lib/wait.mjs`, `✓`/`✗` lines, exit code 1 on a failure, screenshots under `<tmpdir>/sheet-tests/`. An init script wraps `IDBFactory.prototype.open` and reads a mode from `localStorage.__idbfail` (per context) or `sessionStorage.__idbfail` (per tab): `''` passes through, `'fail'` throws the `UnknownError` DOMException, `'once'` throws once and clears itself, `'hang'` returns a plain object whose handlers are never called; every call appends `Date.now()` to `sessionStorage.__idbopens`. The marker `sheet:settings.idbOk` is read directly.

| # | Step | Fails today |
|---|---|---|
| 1 | normal start, a note typed and saved; `idbOk` is a number in `sheet:settings` | yes (no key) |
| 2 | `fail`, reload: at least 3 open attempts, the gaps ≥ 250 and ≥ 800 ms; the strip shows `lock.storage` with «Експорт» and «Оновити»; the sheet is inert; the list has one «Без назви»; the storage line has «(сховище не відкрилося)» and not «(резервне сховище)»; the account row and status button are hidden; typing on the sheet and «Нова» change nothing (`lock.say` toast); **no `sheet:note:` key in localStorage** | yes (1 attempt, editable, a plain key) |
| 3 | the flag cleared, reload: exactly one note, the typed one; no «Без назви»; no strip; no `(резервне сховище)` | yes (2 notes) |
| 4 | `once`, reload: 2 attempts, no strip, the note shows, an edit is saved into IndexedDB (read back with `indexedDB.open` from the test) | yes (fallback mode) |
| 5 | `hang`, reload: the strip says `lock.opening` within ~2 s; the `storage` lock within 12 s; no page errors | yes (the start never finishes) |
| 6 | `fail` with a fallback copy seeded under `sheet:note:x~tabq~1` and a plain `sheet:note:y`: both show as notes, read-only; «Експорт» from the strip downloads a file with both; both keys are byte for byte as seeded after a tab sync (`visibilitychange`) and a click on «Нова» | yes (editable, a new key) |
| 7 | recovery: locked under `fail`; the flag cleared; within 10 s the page reloads by itself (`framenavigated`) and is editable with the real note; `sheet:idb-reloads` is 1. Variant: with the flag set again right after the reload the tab locks again; after the third automatic reload the strip says `lock.storageBack` and no further reload happens in 15 s | yes |
| 8 | a fresh context (no marker) with `fail`: today's fallback mode — «(резервне сховище)», editable, a note stored under a plain key; a normal start afterwards moves it in and writes `idbOk` | no (guards today's behaviour) |
| 9 | two tabs of one context: A under `sessionStorage` `fail` is locked, B opens normally and types; A shows B's note read-only after the `put` message, B is not locked and stays the writer; no page errors in either | yes |
| 10 | no page errors over the run | — |

### 8.2 Existing scenarios

- `appformat.mjs` «Without IndexedDB» (`indexedDB` undefined) and `appstore.mjs` step 6 keep passing: a missing `indexedDB` object stays on today's path whatever the marker says.
- `appi18n.mjs` covers the new keys in both files.
- `appupdate.mjs` checks the raised `BUILD`.
- `tests/README.md` gets the row for `appidbfail.mjs`; CI runs every `tests/*.mjs`.

## 9. Risks

- **Latency on failure.** Three hanging attempts take ~10 s before the lock; the `lock.opening` strip after 1 s keeps it from looking frozen. A device where the open succeeds at the second attempt pays ~300 ms once.
- **A permanently broken database** (the open keeps failing on every start) leaves the device view-only with nothing to show, where today it at least lets the user write new notes into localStorage. This is the intended trade: the notes are in the database the user cannot see either way, and a silent second store next to them has caused the stray notes and the hidden account menu. The strip tells the user to reload and then to restart the app; an escape hatch into the fallback mode is §11, question 3.
- **The marker and existing devices.** `versSwept` as the legacy marker covers every device that has run `vstart()` once with IndexedDB. A device whose first start with IndexedDB is the first start of the new code and fails at that start takes the fallback path once, as today.
- **A late `success` after an abandoned attempt** opens a second connection for a moment; it is closed in the dead attempt's handler, so `versionchange` and the `blocked` handling of other tabs are not affected.
- **Automatic reload loops** are bounded by the counter (§4.4).
- **`UnknownError` on a transaction instead of the open** (a database that opens but refuses to read) is not covered: `db.all()` then falls back to `fbAll()` as today with `db.backend==='idb'`, and the start shows the copies with the account menu on. Watching for it is a manual check (§10); a fix would be a `storage` lock on a failed first read, out of this PR.
- **The `blocked` interplay**: a tab blocked by another tab's old connection still becomes `blocked` after 3 s, not `storage`, since `setLock` keeps the first kind and `idbOpenRetry` stops when `LOCK` is set.

## 10. Manual checks on devices

1. Android Chrome, the installed PWA on `baobook.matamata.dev`: uninstall and reinstall the PWA, open it; then force-stop Chrome and open the app from the home screen at once. Expected: the real notes, or the `lock.storage` strip that goes away by itself within seconds; never «Без назви» alone with an editable sheet, never «(резервне сховище)» on a device that has notes.
2. Android: the same with Wi-Fi off (a cold start from the service worker cache) and with the update strip present (an older build in the installed app): both strips show, «Оновити» on either reloads.
3. Android, two tabs of Chrome: one locked (reproduce by opening the app while the other is still starting, or by DevTools remote debugging with the init script), the other editing; the locked one follows the list and never writes.
4. iOS Safari, the installed app: background it for a long time, bring it back; and the first open after the device restarts. Expected: a normal start, or the `lock.opening` strip followed by recovery.
5. Firefox and Safari private windows: today's fallback mode (no marker), editable, «(резервне сховище)».
6. Desktop Chrome: DevTools → Application → delete the `sheet` database while the app is open, then type: the write makes a fallback copy (unchanged), the next start moves it in. Then Application → Storage → «Clear site data»: a fresh device, `idbOk` written at the first start.
7. The storage line, the strip and the toast on both languages («Мова / Language»).

## 11. Open questions for the owner

1. **The retry budget.** Three attempts (0, 300, 900 ms) with a 3 s deadline each: at most ~10 s before the view-only strip. Recommended as is; a longer budget delays every genuinely broken start, a shorter one gives up on the common Android case.
2. **Recovery by automatic reload.** When the background try opens the database, reload the page by itself (nothing is unsaved in a view-only tab; at most three times per tab session), or only change the strip to «Сховище браузера знову доступне · Оновити» and wait for the tap? Recommended: the automatic reload, so the common case needs no action at all.
3. **An escape hatch.** Should the `lock.storage` strip offer «Працювати без бази» (continue in today's fallback mode, new notes into localStorage) for a database that never opens again? Recommended: not in this PR; the real notes are unreadable either way, and the fallback mode hides that. Revisit if a device is ever seen to fail every start.
4. **The marker.** `idbOk` plus the legacy `versSwept`, as in §5. Alternative: only `idbOk`, which would make every updated device take the old fallback path once if its first start on the new code fails. Recommended: both.
5. **The waiting strip.** Show «Сховище браузера відкривається…» after 1 s of waiting, or keep the start silent (an empty list and an inert sheet, as today) until the lock or the start? Recommended: show it; a hanging open otherwise looks like a frozen app for up to 10 s.

## 12. Review rounds

Filled in as the plan is reviewed (reviewer findings and what changed).
