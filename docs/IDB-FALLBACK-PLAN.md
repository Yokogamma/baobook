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

Reproduced with Playwright on the current `main`. An init script wraps `IDBFactory.prototype.open`; while a flag is set it fails the open the way Chrome does — the call returns a request whose `error` event fires a moment later with `request.error` = `DOMException('Internal error opening backing store for indexedDB.open.','UnknownError')` — and, in a second run, by throwing the same DOMException synchronously out of `open()` (the `TypeError`/`SecurityError` shape). In `idb.open` these are two branches, `r.onerror=()=>{ … rej(r.error); }` and `catch(e){ return rej(e); }` in `go()`; both end in the same `catch` of `db.init()`, and both runs gave the same picture (the attempts are counted):

| Start | What the app did |
|---|---|
| 1. Normal start, a note typed | 1 note, stored in IndexedDB; `sheet:settings` gets `devId`, `devName`, `versSwept`; no `sheet:note:` keys |
| 2. The open fails | **one** attempt; the storage line says «1 нотатка на цьому пристрої (резервне сховище)»; the list shows one «Без назви»; the sheet is editable; no strip; a plain key `sheet:note:<new id>` holds the empty note |
| 3. Normal start again | 2 notes: the real one and the empty «Без назви» moved in from the plain key |

The scenario `tests/appidbfail.mjs` (§8) runs these steps and fails on the current code at steps 2 and 3.

The same open can also **hang** (no `success`, `error` or `blocked` event): Chrome's backing store open serializes behind the previous process's handles, and Safari had a known hang of the first `indexedDB.open` after a page was restored from the background. Today the app waits forever: the start never finishes, the sheet stays inert and the list empty, with no message.

## 3. Goal

- A device whose IndexedDB has worked before never silently drops into the localStorage mode: a failed open is retried, and if it still fails the app is **view-only with a strip that says why and offers a reload**, writes no note anywhere, creates no empty note, and recovers by itself when the storage opens again.
- A device that has never had IndexedDB keeps today's behaviour (the fallback mode with the writer lock, §4.14 of SYNC-PLAN).
- Nothing changes in the stores, the fields or the export format.

## 4. Behaviour

### 4.1 Starting

1. `db.init()` opens the database with **retries**: attempts at 0, 300 and 900 ms after the previous failure (three in all), with **deadlines** of 3, 3 and 8 s. An attempt fails when the request fires `error` (Chrome's `UnknownError` comes this way; `VersionError` keeps its handling: another tab upgraded the database, open what is there), when `indexedDB.open` throws, or when **no event at all** has fired by the deadline. The deadline is a silence detector, not a budget: the first event of a request (`upgradeneeded`, `blocked`, `success`, `error`) clears it, so a slow upgrade on a fresh device (the `go(IDB_VER)` step that creates the stores) or a blocked request is never cut short; the second request of an attempt (`go(IDB_VER)` after the empty v1) gets a deadline of its own. `blocked` is not a failure to retry: another tab holds the database, and `setLock('blocked')` after 3 s stays as it is.
   An abandoned attempt is **dead**: a flag checked first in `go()` (so a late `VersionError` starts no new chain), in `onsuccess` (the connection is closed, `done()` never runs, `idb.db` is not touched, no `go(IDB_VER)` upgrade starts), in `onerror` (swallowed) and in `onblocked` (no timer, no lock). A `success` of a live attempt ends the loop as today.
2. With the database open, the start goes on as today, and `S.idbOk` is written once (§5): this device has a working IndexedDB.
3. When every attempt failed:
   - no `window.indexedDB` at all, or the device has no marker (§5): **today's path**, unchanged — `db.backend='local'`, the writer lock, `fbLocal()`, or the `other`/`nolock` lock;
   - the marker is there: `setLock('storage')` **before** anything is written. `db.backend` stays `'local'`, so every path that asks for IndexedDB (`vstart`, `purgeOld`, `accOn`, `db.move`, the leader) is off, and `LOCK` stops every write, `db.save` and the fallback keys included (`db.save` answers `{ok:false, reason: save.reason.locked}` as under any lock). `writerLock()` is not asked for and `fbLocal()` does not run: **no note key** (`sheet:note:…`) is written, read keys stay byte for byte. Device settings in `sheet:settings` (`saveS`: the theme, the language, `current` when a note is clicked, `devId`/`devName` from `makeEngine()` when absent) may still be written, as under every other lock; they are not notes. The background retry (§4.4) starts.
4. While the attempts run, nothing can change: the sheet is inert and the title not editable until `STARTED`, the list is empty, and a save that is asked for waits for the start (`tests/appformat.mjs` scenario 9, «a save made while the start still waits for the database waits too: it does not go to the fallback»). After 1 s of waiting the strip shows «Сховище браузера відкривається…» (`lock.opening`) with all four of its buttons hidden (`roRestore` and `roPurge` are visible in the markup and are only hidden by `roSync()`, which does not run before the start), so a slow or hanging open does not look like a frozen app; the start replaces it with the lock strip or hides it.

Typical cost: Chrome's `UnknownError` arrives as the request's `error` event after the backing-store attempt (tens to hundreds of milliseconds), so a device that recovers at the second attempt starts well under a second later than today and the user sees nothing. The worst case, three silent attempts, locks the tab after about 15 s (0.3 + 0.9 s of waits, 3 + 3 + 8 s of deadlines).

### 4.2 What the view-only tab shows

- The notes `db.all()` finds in localStorage (`fbAll()`): the plain keys and the fallback copies left by writes that missed IndexedDB, with a differing older copy as «… (резервна копія)» in memory, exactly as the `newer` lock shows them today. Usually there are none; then `newNote()` adds the empty note **in memory only** (`MEM`, never written: `newNote` already does this under `LOCK`), so the list and the sheet are not blank.
- The strip under the header, like the other locks (`roStrip`, `roMsg`, `roExport`, `roReload`): `lock.storage` «Сховище браузера не відкрилося, тож нотатки з цього пристрою зараз не прочитати. Оновіть сторінку; якщо не допоможе — закрийте застосунок і відкрийте знову.» with «Експорт» and «Оновити». The sheet is inert, the title fixed, the list items open notes read-only; «Нова», paste, Ctrl+Alt+N and every other write say `lock.say` through `held()`.
- The storage line says «N нотаток на цьому пристрої (сховище не відкрилося)» (`storage.closed` instead of `storage.fallback`): the count is of what is on the screen, not of the device.
- The account row and the status button are hidden, as under every lock (`accOn()` is false). The strip explains the state, so the hidden menu no longer looks like a sign-out.
- «Експорт» on the strip and in the gear menu export what is on the screen (`exportAll`: the in-memory notes, the empty `MEM` note left out, no `history` since there is no database). With no fallback copies the file has no notes; the button stays, since a copy may be there.
- «Оновити» reloads the page (`location.reload()`), which starts the retries again.
- `openNote()` does not save `current` for a note that lives only in memory (`MEM`: the empty note, a backup copy with a fresh id): it does not exist after the reload, and today it would overwrite the id of the real note the user had open, so the reload would land on `firstNote()`. A fallback copy keeps its own id and is saved as `current` as usual. This is a one-condition change in `openNote` (`if(!o.restore && !MEM.has(n.id)) saveS({current:n.id})`) and helps every lock, not only this one.

### 4.3 Edits, tabs, sync

- **Edits typed during the retries:** none are possible (§4.1, item 4). Tab messages that arrive before `STARTED` wait in `TABQ` as today.
- **Multiple tabs:** the locked tab holds no `baobook:writer` lock and no leader lock (`setLock` runs `leadOff()`; `leadAsk` is never called because the engine was not loaded from the store and has no owner). A second tab whose open succeeds works normally, moves the plain keys in under the writer lock and leads the sync. The locked tab keeps showing its in-memory copies until it is reloaded; `put`/`del` messages from the other tab reach it through `tabMsg` → `takeNote`/`dropNote`, which add to or leave the list under `LOCK` as the `other`/`nolock` locks do today (`dropNote` returns under `LOCK`). Two tabs that both fail are both view-only; no lock is needed, since neither writes.
- **The sync engine:** `SYNC=makeEngine()` is still made (it needs no store until `reload()`), `SYNC.reload()` and `db.move()` are skipped (`db.backend==='idb' && !LOCK` is false), so the engine has no owner and no queue and never steps. `accStart()` returns at `!accOn()`. Nothing is sent or received; the cloud is untouched. After a reload with the database open, everything resumes.
- **Writes that fail after a successful start** (`idbLost`, a transaction that fails, `DEBUG.failSave`): unchanged. `db.save` keeps writing the fallback copy `sheet:note:<id>~<tab>~<generation>` when IndexedDB refuses a write, and the copy moves in at the next start through `db.move()`; `unsaved`, «Повторити» and «Експортувати» work as today. Later opens (`idb.run`, `idb.tx`, `SDB.tx` after a closed connection) stay single attempts without a deadline: a retry there would only delay the fallback copy, which is the right outcome for a write.
- **The existing locks:** `newer` and `blocked` are decided inside the open and win over `storage` (`setLock` keeps the first kind). `updated` and `epoch` come after the start. `other` and `nolock` stay the locks of the fallback mode (no marker, or no `indexedDB` object); `storage` is the lock of a device that has the database but cannot open it.
- **The update strip (PR #91, `fix/stale-shell`):** `updCheck` runs regardless of `LOCK`; in the `storage` lock `updBusy()` is false, so «Оновити» there reloads at once, which is also the recovery path. Both strips can show at the same time (one under the header, one above the toast). This PR raises `BUILD`, the meta tag and `build.json` as every change of `public/` does.

### 4.4 Recovery

- While `LOCK==='storage'`, `idbWatch()` probes the database in the background: 5 s after the lock, then 10, 20 and every 30 s, only while the tab is visible (`document.hidden` pauses the timer; `visibilitychange` to visible probes at once, which is how a phone brought back to the app recovers). A probe is a bare `indexedDB.open(IDB_NAME)` with the 3 s silence deadline, outside `idb.open` (it needs neither the `newer` check nor the `sync` read, and must not set `idb.db`); a `success` closes the connection at once; `blocked`, `error` or silence count as «still closed».
- A probe that succeeds **reloads the page** (`location.reload()`): the tab is view-only and holds nothing unsaved (`beforeunload` asks nothing), so nothing is lost, and the reload keeps the open note when it is a real one (`tabCur`, `how==='reload'` in `start()`; §4.2 on `MEM` notes). The reload waits for the next probe while an in-app dialog is open (`ask`, `choice`, the text-size dialog) or an export is in flight (`exportAll` sets a flag around the download and the `navigator.share` sheet on touch devices), so it never closes something the user is reading or sharing. A reload that locks again is throttled: the first three successful probes of a tab session reload (`sessionStorage` key `sheet:idb-reloads` counts them); from the fourth on the strip changes to `lock.storageBack` «Сховище браузера знову доступне. Оновіть сторінку, щоб продовжити.» and waits for the button.
- A healthy device whose backing store takes longer than the retries to come up (a cold start where every request queues behind the previous process's handles) takes this path too: the lock, the probe 5 s later, one automatic reload — self-healing, a few seconds slower than a start that succeeded at once (§9).
- The owner may prefer no automatic reload at all (§11, question 2); then every success changes the strip to `lock.storageBack` and the button reloads.

### 4.5 Devices that have never had IndexedDB

Unchanged: a browser without `indexedDB`, and a device without the marker (a fresh profile whose very first open fails, a private window in an old Safari), keep the fallback mode with the writer lock, the `other`/`nolock` locks and the plain keys. The retries run there too, so a fresh device that recovers at the second attempt starts normally.

### 4.6 Private mode, iOS and Safari

- The marker lives in the same storage partition as the database, so a private window (its own empty localStorage and IndexedDB) has no marker and behaves as a new device. Safari before 15 refused IndexedDB in private browsing: that is the no-marker path.
- Safari's hanging first open after a restore from the background is a deadline failure, retried; if the three attempts hang the tab locks and the probe at the next `visibilitychange` recovers it.
- iOS evicts the site data of an installed PWA that was not used for a while (ITP) — localStorage and IndexedDB together, so the marker goes with the database and the device starts fresh, as today.

## 5. Data

- One new optional key in `sheet:settings`: `idbOk` — the time in ms when IndexedDB first opened on this device, written by `db.init()` after a successful open when the key is absent (`saveS({idbOk:now()})`). Absent means «never». It is a device setting like `devId`: not exported, not imported, not synced.
- **Devices updated from the current code** have no `idbOk` at their first start with the new code. `S.versSwept` is written only by `vstart()` after a successful versions sweep with IndexedDB (`db.backend==='idb' && !LOCK`), so `idbWorked()` is `!!(S.idbOk || S.versSwept)`: every device that has run the app with IndexedDB for one start is covered from the first start of the new code. The reproduction in §2 shows `versSwept` set after the first normal start.
- No new store, no database version bump, no note field, no change to the export file. The LOCK kinds are a code constant, not stored.
- `sessionStorage` key `sheet:idb-reloads` (the count of automatic reloads in this tab, §4.4), like `sheet:tab-current` and `sheet:signin`.

## 6. Code changes by function (`public/index.html`)

| Where | Change |
|---|---|
| the LOCK comment block before `IDB_VER` | add `'storage'` (IndexedDB exists and has worked here, but did not open at this start) and `OPEN_TRIES=[{wait:0,deadline:3000},{wait:300,deadline:3000},{wait:900,deadline:8000}]`, `PROBE_WAIT=3000` |
| `idb.open(o)` | takes an optional `{deadline}`: a silence timer started with each request (`go(v)`) and cleared by that request's first event; when it fires, the attempt is marked **dead** and the promise rejects with `Error('timeout')`. The dead flag is the first check in `go()`, `onsuccess` (close `r.result`, return: no `done()`, no `go(IDB_VER)`), `onerror` (return) and `onblocked` (return: no timer, no lock). Without the option nothing changes, so `idb.run`, `idb.tx` and `SDB.tx` behave exactly as today. `onblocked` of a live attempt keeps its own 3 s timer and `setLock('blocked')` |
| new `idbOpenRetry()` | `for(const t of OPEN_TRIES)`: sleep `t.wait`, then `await idb.open({deadline:t.deadline})`; returns on success; stops without retrying when `LOCK` is set (`blocked`) or `window.indexedDB` is missing; after the last failure throws the last error. After 1 s of waiting (a timer cleared on exit) shows `lock.opening`: `roMsg.textContent`, `roStrip.hidden=false`, and `roRestore`, `roPurge`, `roExport`, `roReload` all hidden |
| new `idbWorked()` | `!!(S.idbOk \|\| S.versSwept)` |
| `db.init()` | `await idbOpenRetry()` instead of `idb.open()`; on success `if(!S.idbOk) saveS({idbOk:now()})`; in the catch: `if(LOCK) return; if(window.indexedDB && idbWorked()){ setLock('storage'); idbWatch(); return; }` before today's writer-lock path |
| new `idbWatch()` | the background probe of §4.4: timers only while `LOCK==='storage'` and the tab is visible; a probe is a bare `indexedDB.open(IDB_NAME)` with a `PROBE_WAIT` silence deadline, its `success` closes `r.result` at once and never touches `idb.db`; then `location.reload()` unless a dialog is open (`ask.open`, `choice.open`, `tsz.open`) or `EXPORTING` is set, within the reload throttle (`sheet:idb-reloads`), else `idb.back=true` and `roSync()` |
| `roSync()` | the message map gains `LOCK==='storage'? (idb.back? 'lock.storageBack' : 'lock.storage')` before the `unsaved.size` branch; the waiting strip (`lock.opening`) is set directly by `idbOpenRetry` before `STARTED`, and `roSync()` at `STARTED` replaces or hides it as today |
| `storageUI()` | the suffix is `loc(LOCK==='storage'? 'storage.closed' : 'storage.fallback')` when `db.backend!=='idb'` |
| `openNote()` | `if(!o.restore && !MEM.has(n.id)) saveS({current:n.id})`: a note that exists only in memory is not remembered as the current one (§4.2) |
| `exportAll()` | sets `EXPORTING` for the duration of the download or the `navigator.share` promise, so `idbWatch` does not reload under a share sheet |
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

Style as `tests/appformat.mjs` and `tests/appupdate.mjs`: one static server from `lib/server.mjs`, `CTX`, `ready`/`until` from `lib/wait.mjs`, `✓`/`✗` lines, exit code 1 on a failure, screenshots under `<tmpdir>/sheet-tests/`. An init script wraps `IDBFactory.prototype.open` and reads a mode from `localStorage.__idbfail` (per context) or `sessionStorage.__idbfail` (per tab, set after a first navigation to `blank.html` as `appformat` does): `''` passes through; `'error'` returns a plain object as the request and fires its `onerror` ~100 ms later with `error` = the `UnknownError` DOMException — Chrome's real shape, the `r.onerror` branch of `idb.open`; `'throw'` throws the same DOMException out of `open()` — the `catch(e)` branch of `go()`; `'once'` is `'error'` for one call and then clears itself; `'hang'` returns a request whose handlers are never called. Every wrapped call appends `Date.now()` to `sessionStorage.__idbopens`, so the test reads the count **before** its own `indexedDB.open` calls and clears the mode before it seeds or reads the database itself. The marker `sheet:settings.idbOk` is read directly. Before the lock the list is empty, so `ready()` (which waits for `#list .item`) is used only once the strip says `lock.storage`; the strip text is waited for with `until()` on `#roMsg`. Steps 2–4 and 7 run under `'error'` and are repeated under `'throw'`.

| # | Step | Fails today |
|---|---|---|
| 1 | normal start, a note typed and saved; `idbOk` is a number in `sheet:settings` | yes (no key) |
| 2 | `error`, reload: `until` the strip says `lock.storage`; at least 3 open attempts, the gaps ≥ 250 and ≥ 800 ms; «Експорт» and «Оновити» on the strip, `roRestore` and `roPurge` hidden; the sheet is inert; the list has one «Без назви»; the storage line has «(сховище не відкрилося)» and not «(резервне сховище)»; the account row and status button are hidden; typing on the sheet and «Нова» change nothing (`lock.say` toast); **no `sheet:note:` key in localStorage** | yes (1 attempt, editable, a plain key) |
| 3 | the mode cleared, reload: exactly one note, the typed one; no «Без назви»; no strip; no `(резервне сховище)` | yes (2 notes) |
| 4 | `once`, reload: 2 attempts (read before the test's own open), no strip, the note shows, an edit is saved into IndexedDB (read back with the test's own `indexedDB.open`, the mode already clear) | yes (fallback mode) |
| 5 | `hang`, reload: `until` `#roMsg` says `lock.opening` within ~2 s, with every button hidden; `until` the `storage` lock within 20 s; no page errors | yes (the start never finishes) |
| 6 | `error` with a fallback copy seeded under `sheet:note:x~tabq~1` and a plain `sheet:note:y`: both show as notes, read-only; «Експорт» from the strip downloads a file with both; both keys are byte for byte as seeded after a tab sync (`visibilitychange`) and a click on «Нова» | yes (editable, a new key) |
| 7 | recovery: locked under `error`; the mode cleared; within 10 s the page reloads by itself (`framenavigated`) and is editable with the real note; `sheet:idb-reloads` is 1. The throttle: set → locked → cleared → automatic reload, three times in a row (the counter reads 1, 2, 3); the fourth time the mode is cleared the strip changes to `lock.storageBack` within 10 s and no reload happens in the 15 s after it; «Оновити» then reloads into the editable app | yes |
| 7b | locked under `error` with the `ask` dialog open (the app's own dialogs are off in the lock, so the test opens `#ask` with `showModal()`): the mode cleared, no reload for 8 s; the dialog closed, the reload follows at the next probe | yes |
| 8 | a fresh context (no marker) with `error`: today's fallback mode — «(резервне сховище)», editable, a note stored under a plain key; a normal start afterwards moves it in and writes `idbOk` | no (guards today's behaviour) |
| 9 | in the context of step 1 (the marker is there): tab A opens `blank.html`, sets `sessionStorage.__idbfail='error'` and goes to the app → locked; tab B opens normally and types; A shows B's note read-only after the `put` message, B is not locked and stays the writer; no page errors in either | yes |
| 10 | no page errors over the run | — |

### 8.2 Existing scenarios

- `appformat.mjs` «Without IndexedDB» (`indexedDB` undefined) and `appstore.mjs` step 6 keep passing: a missing `indexedDB` object stays on today's path whatever the marker says.
- `appi18n.mjs` covers the new keys in both files.
- `appupdate.mjs` checks the raised `BUILD`.
- `tests/README.md` gets the row for `appidbfail.mjs`; CI runs every `tests/*.mjs`.

## 9. Risks

- **Latency on failure.** Three silent attempts take ~15 s before the lock; the `lock.opening` strip after 1 s keeps it from looking frozen. A device where the open succeeds at the second attempt pays under a second once.
- **A healthy but slow device.** When the backing store takes longer than the whole retry budget to come up (every request queues behind the same wait), the tab locks, the first probe 5 s later succeeds and the tab reloads by itself: self-healing, but the lock strip flashes for a few seconds and one of the three automatic reloads of the tab session is spent. The growing deadline (3, 3, 8 s) is there to make this rare without stretching a genuinely broken start much further.
- **A permanently broken database** (the open keeps failing on every start) leaves the device view-only with nothing to show, where today it at least lets the user write new notes into localStorage. This is the intended trade: the notes are in the database the user cannot see either way, and a silent second store next to them has caused the stray notes and the hidden account menu. The strip tells the user to reload and then to restart the app; the known last resort is clearing the site data by hand, which deletes the unreadable database (§10, item 8); an escape hatch into the fallback mode is §11, question 3.
- **The marker and existing devices.** `versSwept` as the legacy marker covers every device that has run `vstart()` once with IndexedDB. A device whose first start with IndexedDB is the first start of the new code and fails at that start takes the fallback path once, as today.
- **A dead attempt's late events.** Without the dead flag in every handler, a late `VersionError` would start a new open chain, a late `success` on an empty v1 would start an upgrade, and a late `success` reaching `done()` would overwrite `idb.db` of the live attempt and leave a stray connection that blocks a later upgrade by another tab. §4.1 and §6 make the flag the first check in `go()`, `onsuccess`, `onerror` and `onblocked`; a late `success` closes its connection at once.
- **Automatic reload loops** are bounded by the counter (§4.4); a reload never interrupts a dialog or an export in flight.
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
8. The known recovery for a database that never opens again (also for `docs/SYNC-CHECKLIST.md`): export is empty in the lock, so there is nothing to save; in the browser's site settings clear the site data of `baobook.matamata.app` (Android Chrome: «Налаштування сайту → Сховище → Очистити», or the app's «Storage» info; iOS: Settings → Safari → Advanced → Website Data), reopen the app and sign in; the notes come back from the cloud. Checked once on a test profile, not on the owner's device.

## 11. Open questions for the owner

1. **The retry budget.** Three attempts (after 0, 300 and 900 ms) with silence deadlines of 3, 3 and 8 s: at most ~15 s before the view-only strip, and the waiting strip after 1 s. Recommended as is; a longer budget delays every genuinely broken start, a shorter one gives up on the common Android case and sends more healthy slow devices through the lock-and-reload path (§9).
2. **Recovery by automatic reload.** When the background probe opens the database, reload the page by itself (nothing is unsaved in a view-only tab; never under an open dialog or a share sheet; the first three times per tab session, then the strip asks), or only change the strip to «Сховище браузера знову доступне · Оновити» and wait for the tap every time? Recommended: the automatic reload, so the common case needs no action at all.
3. **An escape hatch.** Should the `lock.storage` strip offer «Працювати без бази» (continue in today's fallback mode, new notes into localStorage) for a database that never opens again? Recommended: not in this PR; the real notes are unreadable either way, and the fallback mode hides that. The known recovery is clearing the site data and signing in again (§10, item 8). Revisit if a device is ever seen to fail every start.
4. **The marker.** `idbOk` plus the legacy `versSwept`, as in §5. Alternative: only `idbOk`, which would make every updated device take the old fallback path once if its first start on the new code fails. Recommended: both.
5. **The waiting strip.** Show «Сховище браузера відкривається…» after 1 s of waiting, or keep the start silent (an empty list and an inert sheet, as today) until the lock or the start? Recommended: show it; a hanging open otherwise looks like a frozen app for up to 15 s.

## 12. Review rounds

Each round is an independent review of the plan against the code; the plan is fixed and reviewed again until a round finds no blocker or major issue.

**Round 1** (no blockers, 2 major, 11 minor):
- Major: the reproduction and the tests exercised only a synchronous throw out of `indexedDB.open`, while Chrome's `UnknownError` arrives as the request's `error` event (the `r.onerror` branch of `idb.open`, with the `VersionError` case). Fixed: both branches reproduced (§2) and both run in the scenario (`error` and `throw` modes, §8.1); the cost estimate corrected (§4.1).
- Major: a timed-out attempt specified only its late `success`. Fixed: the dead flag is the first check in `go()`, `onsuccess`, `onerror` and `onblocked` (§4.1, §6, §9).
- Minor: «nothing is written» overstated (settings are still written; `S.current` was overwritten with an in-memory note's id, so the reload would not keep the note) → §4.1 says «no note key», `openNote` skips `current` for `MEM` notes (§4.2, §6); the waiting strip hides all four buttons (§4.1, §6); a healthy slow device goes through the lock and one reload, the deadlines grow 3, 3, 8 s (§4.1, §9); `appformat` scenario 9 cited by its title (§4.1); the throttle test spelled out and the counter semantics fixed (§4.4, §8.1 step 7); the test wrapper counts the test's own opens (§8.1); `ready()` only after the lock (§8.1); step 9 needs the marker (§8.1); the probe is a bare `indexedDB.open` that never sets `idb.db` (§4.4, §6); no reload under a share sheet or a dialog (§4.4, §6, step 7b); clearing the site data recorded as the recovery for a database that never opens (§9, §10, §11).
