# A frozen tab never stops the app

**Status: plan, awaiting the owner's approval (2026-10-26).** It follows #123 (the diagnosis of a waiting start and the strip of a held format check), which only says what happens. This plan makes the app work by itself. Three layers, each in its own PRs into `main`:

1. **Prevention:** a hidden document lets go of the database. Built by the sync session, which owns the engine.
2. **Recovery:** what a waiting tab can make the browser do. Mostly research; the findings are in §3.
3. **Degradation:** a held storage does not mean an empty screen.

The structure follows CLAUDE.md «Modular and ready for TypeScript» from the first line (§5).

## 1. The incident

On 2026-10-26 the owner's Android phone (a OnePlus 12, Chrome, the installed PWA of `.app`, prod 2026102601) could not start:
- «не завершився щонайменше за 83 хв, чекав на відкриття сховища», after starts of 10 min and 28–34 s;
- a stuck start showed the slow-start text forever, and the gear menu had no account row;
- the list showed only the greyed snapshot of names (`sheet:listsnap`).

**The cause, confirmed by the owner:**
- A normal Chrome tab of `baobook.matamata.app` had been open in the background for a long time; the owner never used it. On Android, the installed PWA and Chrome share one profile and so one origin: IndexedDB, localStorage, Firebase Auth, BroadcastChannel and Web Locks.
- When the owner signed in in the PWA, that tab was signed in too, and its engine began receiving from the cloud.
- The browser froze the tab with a transaction on `sync` open. The PWA's start read the `format` record on `sync` (#115) and queued behind that transaction with no deadline.
- When the owner switched to Chrome, the tab woke up, finished, and the PWA started at once: «7 хв 15 с; найдовше — відкриття сховища, 7 хв 14 с», 23 notes in a second.

The owner's requirement: **the app must work by itself.** A message that asks the user to find and close a tab among about a hundred is not a solution. A strip may explain what happens.

## 2. What already exists

- **#111:** the start's upgrade request waits with a strip instead of locking.
- **#115:** the format guard.
- **#123:**
  - the format check reads first;
  - the journal of starts tells the request (`db:open`) from the check (`db:fmt`);
  - a waiting start records a diagnosis (`BOOT.x`: the tabs that answered, a probe of `notes`, a separate test database, the Web Locks, the storage estimate);
  - after 15 s a held check shows `lock.waitHeld` («Перевірка сховища чекає вже понад 15 с. Можливо, …»; the advice to force-stop Chrome only on Android) and goes on by itself when the holder lets go.
- **The leader lock** `baobook-sync:{env}` is already let go on `pagehide` and `freeze` (`leadOff()` in `public/index.html`). The IndexedDB connection is not: a frozen leader keeps its connection, and the transaction in flight when it froze.
- **The fallback copies** (`sheet:note:<id>~<tab>~<generation>` in localStorage, IDB-FALLBACK-PLAN, SYNC-PLAN §4.14). `db.save` writes one when IndexedDB refuses a save, and the next start moves it in through the core (`db.move()` → `SYNC.importMany`, which keeps a backup of a differing record). They survive a closed page.

## 3. Research: can a waiting tab free the storage?

The question is whether a waiting client can make Chrome unfreeze or unload a frozen document that holds a blocking IndexedDB transaction, by a version change, a `deleteDatabase`, or a Web Locks `steal`. These are the findings from Chromium's own sources and documentation, without guesses.

1. **Chromium has a mechanism, but only for some states.** [`content/browser/indexed_db/indexed_db_client_state_checker.h`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/indexed_db/indexed_db_client_state_checker.h) (main, read on 2026-10-26):
   - **Inactive states.** A document can move between active and inactive, where inactive means «BFCache / frozen».
   - **`DisallowInactiveClient`.** Its reasons are a version change event, a transaction acquiring locks, a transaction starting while blocking others, and an ongoing transaction whose client becomes inactive while blocking others. For a document **in the back/forward cache**, the outcome is stated: it «is evicted and disallowed from being activated again».
   - **The keep-active handle.** It «unfreezes the document and/or prevents it from entering inactive states (such as BFCache or page freeze) while alive».
   - **The gap.** The header does not say what happens to a document that is already **frozen** when another client is blocked by it.
2. **Android freezes regardless.** The [freezing policy document](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/performance_manager/docs/freezing_opt_out_opt_in.md) lists «holding a Web Lock or an IndexedDB transaction» as a reason not to freeze a page **on desktop**. It also says: «Freezing is already enabled on Mobile and doesn't honor the Opt-Out/Opt-In presented on this page». The [Energy Saver post](https://developer.chrome.com/blog/freezing-on-energy-saver) (Chrome 133) has the same exemption for desktop. So on Android a tab holding a transaction may be frozen, which matches the incident.
3. **The incident is the measurement.** If Chromium unfroze the holder when the PWA's transaction was blocked, the start would not have waited 83 min. On this device the mechanism did not free the storage within the time that matters.
4. **A version change or a delete cannot be used.**
   - Opening `sheet` with a higher version would upgrade the user's database, and this code would then read it as a newer app's data (`d.version > IDB_VER` → `newer`). The upgrade also waits for every connection to close, the frozen one included (the #111 incident).
   - `deleteDatabase` destroys the notes.
   - Neither is acceptable as a trigger.
5. **Web Locks `steal` frees only the lock.** MDN [`LockManager.request`](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request): «any held locks with the same name will be released, and the request will be granted… Code that was previously running inside the lock continues to run». It does not touch IndexedDB. Stealing the leader lock would let a visible tab lead, but its transactions still queue behind the frozen one.
6. **Another app found the same.** A public write-up ([skysa-notes PR #324](https://github.com/skysa-org/skysa-notes/pull/324)) describes a frozen tab's IndexedDB transaction blocking the foreground app until the tab closed. Their fix was to close the connection when the tab freezes. This is one developer's report, not a Chromium statement.

**Conclusion for layer 2.** No page-level call is known that makes Chrome on Android free a frozen holder. The plan does not promise automatic recovery. It keeps one device experiment (§7, item 3) to check whether a blocked request on a scratch database of its own makes Chrome unfreeze a frozen holder. If it does, a later PR can use that, with a scratch database, never `sheet`. So the app must not depend on recovery: prevention (layer 1) removes the cause, and degradation (layer 3) covers what prevention misses.

## 4. Behaviour

### 4.1 Layer 1: prevention (the sync session builds it)

A document that is not visible must not hold the database, so that a freeze never finds a transaction open.
1. **On `visibilitychange` to hidden** (and on `freeze` and `pagehide`, which come later or not at all), the document:
   - stops starting new transactions: the engine pauses its steps, and the editor's save is flushed first, as today (`flushSave`);
   - lets the transactions in flight finish;
   - lets go of the leader lock;
   - closes its IndexedDB connection (`idb.db.close()`, `idb.db=null`). A later read or write opens again.
2. **On `visible` and `resume`,** it opens the database again (the ordinary `idb.open()`), asks for the lead, and the engine resumes.
3. **No lead while hidden.** A hidden document never asks for the lead while a visible client exists. When the only client is hidden (the PWA in the background), it may keep receiving for a grace period. The sync session decides the length (§8, question 1). Then it pauses as in item 1.

**What it does not cover:**
- the OS freezing the whole renderer process with no event at all;
- a transaction that is long when the freeze lands.

The second is why item 1 waits for transactions to finish rather than closing at once. It is also why the core's receive transactions must stay short (#122 already writes 25 notes to a transaction on a new device).

**Interface between the two parts:**
- the engine gives `pause()` and `resume()` with a promise that settles when the transactions in flight are done;
- the storage module (§5) gives `release()` (close after the in-flight transactions) and `reacquire()`.

The format guard is unchanged: a reopened connection is an ordinary open, without a deadline.

### 4.2 Layer 2: recovery

Beyond §3 there is no automatic recovery. The held strip of #123 stays, as the explanation while layer 3 works.

### 4.3 Layer 3: degradation

When the start's storage check is held for longer than `HELD_WAIT` (15 s, #123), the app does not stay on the snapshot.
1. **What is shown:**
   - **Signed in:** the notes from the cloud. The cloud adapter `public/cloud.js` does not use `sheet`, and Firebase Auth keeps its own database. Read-only queries of the owner's notes count against the device's daily read budget (SYNC-PLAN §4.5, §4.17); the first screenful is read, the rest on demand.
   - **Not signed in:** the snapshot of names (`sheet:listsnap`), read-only, as now.
2. **Edits.** They are allowed only when the note came from the cloud with its revision (`rev`).
   - Each save goes to a fallback copy (`sheet:note:<id>~<tab>~<generation>`). It is the same key and format `db.save` writes when IndexedDB refuses a save, so it **survives a closed page**. Nothing is kept only in memory unless localStorage refuses too: then the edit is in memory, the strip says it is not saved, and «Експортувати незбережене» is offered, as `lock.unsaved` does today.
   - The note carries a mark, «Зберігається, щойно сховище звільниться».
   - Closing the page with an edit in memory only asks first (`beforeunload`).
3. **When the storage is free** (the held check finishes, by layer 1, by the holder waking, or by a reload):
   - the start goes on as today: the format check, the owner and epoch check (`SYNC.reload()`, which refuses a store of another owner);
   - then `db.move()`, which brings the fallback copies in through the core.

   A copy whose stored record changed meanwhile (the frozen tab's receive, another device) is not overwritten. `fbPut` keeps the newer one as the note and the other as «… (резервна копія)», and the core's three-way merge applies to cloud records. A copy taken under another owner is not moved in: the epoch check refuses it, and it stays exportable (§8, question 3). The cloud receives the merged result through the ordinary queue.
4. **Not covered:**
   - creating notes, the trash, the archive, versions and «Історія» in degraded mode; these need the database, and the buttons say «Зараз лише перегляд» as under a lock;
   - the account panel;
   - search beyond the notes on the screen.

## 5. Modules (CLAUDE.md «Modular and ready for TypeScript»)

| Folder | Files | What |
|---|---|---|
| `public/storewait/` | `model.js` | The rules of the start's wait as pure functions of its events: the states (opening, waiting for an upgrade, held, `storage` lock), the timers (`OPEN_WAIT`, `UPGRADE_WAIT`, `HELD_WAIT`, `DIAG_WAIT`), the journal steps and their labels (`bootPh`/`bootNext`), and the reading of a diagnosis. Node tests: `tests/storewaitmodel.mjs` |
| | `ops.js` | The diagnosis (`bootDiag`, the probe databases and their sweep), `release()`/`reacquire()` for layer 1 |
| | `view.js` | The strip texts of the wait (`waitUI`'s part) |
| `public/standby/` | `model.js` | Layer 3's rules: what is shown (cloud notes or the snapshot), what may be edited, how a pending copy is decided against the stored record when the storage frees (over `fbPut`). Node tests: `tests/standbymodel.mjs` |
| | `ops.js` | The read-only cloud query through the cloud adapter, the saves into fallback keys, the hand-over to `db.move()` |
| | `view.js`, `panel.js` | The mark on a note, the strip, the list of the degraded view |
| the engine (`public/sync.js`, the sync session) | — | `pause()`, `resume()`, the hidden rule of §4.1 |

**Wiring.** `index.html` only wires these in through the import map with SRI hashes, as `public/account/` is. The first PR moves the wait logic that #111, #115 and #123 put into `index.html` (`idb.open`'s timers, `idbWait`, `bootDiag`, `waitUI`'s wait part) into `public/storewait/` without changing behaviour, with the Node tests of `model.js`. The browser scenarios `appidbwait`, `appformatgen`, `appidbfail*` and `appboot` must pass unchanged.

## 6. Data and strings

- **No new store, field or record.** The fallback keys are the existing format; the export file does not change.
- **New strings** in `uk.json` and `en.json`, whole sentences:
  - the degraded strip, e.g. «Сховище браузера зараз зайняте, тому показано нотатки з хмари. Правки зберігаються на цьому пристрої й потраплять у сховище, щойно воно звільниться.»;
  - the mark on a note, «Зберігається, щойно сховище звільниться»;
  - the not-signed-in variant (read-only).

## 7. Tests and checks

1. **Node tests:**
   - `storewaitmodel`: every state change of the wait, the labels of old journal records;
   - `standbymodel`: what is editable; a pending copy against a stored record that changed meanwhile, and one of another owner;
   - the engine's pause/resume, written by the sync session in `syncsim`.
2. **Browser scenarios:**
   - **Layer 1:** a tab hidden with a long receive closes its connection after its transaction and a visible tab starts at once. A frozen tab is simulated by a held transaction from a page that does not close (as `appformatgen` 10h does); hiding a page with the layer in place lets the transaction finish and closes the connection. Each scenario fails on the code before it.
   - **Layer 3:** a held check after 15 s shows the cloud notes of the test cloud (`tests/lib/cloud.mjs`), an edit goes into a fallback key, and the holder letting go moves it in. With a conflicting stored record there is a backup copy and no loss; with another owner the copy stays exportable.
3. **A device experiment** (Android, on `.dev`, for §3): a test page in a Chrome tab holds a transaction on a scratch database `baobook-frozen-test` and is left to freeze; the PWA requests a version change on that scratch database. Record whether the Chrome tab is unfrozen, discarded or left as it is, then the same with the tab's transaction on a store the PWA only reads. It never touches `sheet`.
4. **Manual checks after each PR:**
   - the owner's phone, with a Chrome tab of `.dev` left in the background for an hour while the PWA is used;
   - the journal of starts read from the menu.

## 8. Questions

1. **The grace of a hidden only client** (§4.1, item 3). Recommended: 30 s after hidden, then pause. A PWA in the background stops receiving then and resumes when shown.
2. **Edits in degraded mode** (§4.3). Recommended: only cloud notes with their revision, saved into fallback keys; no new notes, trash or versions. Alternative: read-only cloud view only, which is simpler and safer.
3. **A pending copy whose owner changed meanwhile.** Recommended: never moved in; it stays as a fallback key, shown as a backup copy and exportable, as a fallback copy of another epoch is today.
4. **The order of the PRs.** Recommended:
   - layer 1 first (the sync session), as it removes the cause;
   - in parallel, the move of the wait logic into `public/storewait/` (no behaviour change);
   - then layer 3;
   - the device experiment of §7 item 3 before deciding on any layer 2 code.

## 9. Coordination with the sync session

This session cannot message other sessions; the owner or the session that relays the reports passes this on. For the sync session («Baobook: sync PR 4 plan»):
- **The hidden rule and the grace:** §4.1, question 1.
- **Whether the engine's receive transactions can be bounded in time.** For example, no transaction that waits for a network answer inside it. They already have no foreign await (SDB), but check how long the longest one takes on a phone.
- **`pause()`/`resume()`:** their contract and how the leader handover works with a hidden leader that closes its connection.
- **The read-only cloud query for layer 3:** the budget, and the receipts/conflict state of notes shown from the cloud.

## 10. Review rounds

(none yet)
