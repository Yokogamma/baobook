# A frozen tab never stops the app

**Status: plan, awaiting the owner's approval (2026-10-26; brought to #126 the same day).** It follows #123 (the diagnosis of a waiting start and the strip of a held format check), which only says what happens. This plan makes the app work by itself. Three layers, each in its own PRs into `main`:

1. **Prevention:** a document about to be frozen lets go of the database. The sync session builds it in #126 (open); §4.1 says what that covers and what is left.
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
- **The leader lock** `baobook-sync:{env}` is let go on `pagehide` and `freeze` (`leadOff()` in `public/index.html`). In `main` the IndexedDB connection is not: a frozen leader keeps its connection, and the transaction in flight when it froze.
- **#126 (the sync session, open):** the page's life as a module, `public/lifecycle/model.js` (`actionsFor(event, state)`).
  - On `freeze`: the lead goes, new `SDB` transactions are refused, the open ones are aborted (the core does its work again, a save is kept and retried), and the IndexedDB connection and the BroadcastChannel close.
  - On `resume`, or a `pageshow` from the back/forward cache: they reopen, the page reads what other tabs stored meanwhile, and it asks for the lead.
  - On a phone a leader hidden for 15 s lets the lead go by itself.

  This is most of layer 1 (§4.1).
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

### 4.1 Layer 1: prevention (the sync session, #126)

A document must not hold the database while it is frozen. #126 does this on `freeze`, the event Chrome fires before it freezes a page:
- the lead goes first, so that nothing starts a new transaction after the abort;
- new `SDB` transactions are refused, and the open ones are aborted rather than awaited. An `SDB` transaction is atomic: the core does its work again, and a save fails as an ordinary failed save and is retried;
- the IndexedDB connection and the BroadcastChannel close. A frozen page that took a message would start a read it never finishes;
- on `resume` or a persisted `pageshow` they reopen, the page reads what other tabs stored meanwhile, and it asks for the lead.

On a phone a hidden leader lets the lead go after 15 s by itself, since a tab frozen later could not answer a request for it; on a computer a hidden leader keeps syncing. This settles the grace of a hidden client, which an earlier draft of this plan left as a question.

**What #126 leaves open:**
1. **Transactions outside `SDB`.** The page's `idb.tx` and `idb.run` are neither refused nor aborted on `freeze`: the versions and their blobs (`vput`, `vdelete`) and `db.put`/`db.del`. `close()` does not abort them either, since a connection closes only after its transactions end. A page frozen inside one still holds `versions` and `blobs`, and the core's own transactions over those stores wait behind it. Either these go through `SDB` (its `open` set), or `freeze` aborts them too. This is the sync session's call (§9).
2. **A tab of an older build.** A Chrome tab opened before the release that carries #126, and frozen since, runs the old code until it is reloaded, and a frozen tab is not reloaded. For a while after that release on `.app` the cause can come back; layer 3 covers it.
3. **No `freeze` event.** A renderer process the system kills fires nothing, but a kill frees the database. Whether Android ever freezes a Chrome renderer without Chrome's own freeze, and so without the event, is not known; the device experiment (§7, item 3) records what it sees.
4. **The start's own connection.** A tab frozen during its start holds its format check: the readonly transaction on `sync` runs on the pending connection (`idb.pend`), which is not `idb.db`. So `closeDb` does not close it, and it is not an `SDB` transaction. It does not block another start's readonly check, but it blocks every write on `sync`, the leader's included. The storage module (§5) adds this connection to the `freeze` actions: it aborts the check and closes the connection, and the start opens again on `resume`. This part is this plan's, not the sync session's.

**Interface between the two parts:** #126's `actionsFor()` names the actions of each event; `index.html` wires each one (`LIFE_DO`). The storage module's part of `closeDb` (item 4) is wired the same way. The format guard is unchanged: a reopened connection is an ordinary open, without a deadline.

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

   A copy whose stored record changed meanwhile (the frozen tab's receive, another device) is not overwritten. `fbPut` keeps the newer one as the note and the other as «… (резервна копія)», and the core's three-way merge applies to cloud records. A copy taken under another owner is not moved in: the epoch check refuses it, and it stays exportable (§8, question 2). The cloud receives the merged result through the ordinary queue.
4. **Not covered:**
   - creating notes, the trash, the archive, versions and «Історія» in degraded mode; these need the database, and the buttons say «Зараз лише перегляд» as under a lock;
   - the account panel;
   - search beyond the notes on the screen.

## 5. Modules (CLAUDE.md «Modular and ready for TypeScript»)

| Folder | Files | What |
|---|---|---|
| `public/storewait/` | `model.js` | The rules of the start's wait as pure functions of its events: the states (opening, waiting for an upgrade, held, `storage` lock), the timers (`OPEN_WAIT`, `UPGRADE_WAIT`, `HELD_WAIT`, `DIAG_WAIT`), the journal steps and their labels (`bootPh`/`bootNext`), and the reading of a diagnosis. Node tests: `tests/storewaitmodel.mjs` |
| | `ops.js` | The diagnosis (`bootDiag`, the probe databases and their sweep); on `freeze`, the start's pending connection closed and its check aborted, then opened again on `resume` (§4.1, item 4) |
| | `view.js` | The strip texts of the wait (`waitUI`'s part) |
| `public/standby/` | `model.js` | Layer 3's rules: what is shown (cloud notes or the snapshot), what may be edited, how a pending copy is decided against the stored record when the storage frees (over `fbPut`). Node tests: `tests/standbymodel.mjs` |
| | `ops.js` | The read-only cloud query through the cloud adapter, the saves into fallback keys, the hand-over to `db.move()` |
| | `view.js`, `panel.js` | The mark on a note, the strip, the list of the degraded view |
| `public/lifecycle/` (the sync session, #126) | `model.js` | The actions of each page event (`freeze`, `resume`, `hidden`, …); the storage module's part of `closeDb` is wired in beside the others |

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
   - `lifecyclemodel` (#126): the actions of every event and state.
2. **Browser scenarios:**
   - **Layer 1:** #126's `appfreezetx`: after `freeze` another tab writes in a few milliseconds instead of waiting for the held transaction. For §4.1 item 4: a tab frozen during its format check lets another tab's write on `sync` through. It fails without closing `idb.pend`. Each scenario fails on the code before it.
   - **Layer 3:** a held check after 15 s shows the cloud notes of the test cloud (`tests/lib/cloud.mjs`), an edit goes into a fallback key, and the holder letting go moves it in. With a conflicting stored record there is a backup copy and no loss; with another owner the copy stays exportable.
3. **A device experiment** (Android, on `.dev`, for §3): a test page in a Chrome tab holds a transaction on a scratch database `baobook-frozen-test` and is left to freeze; the PWA requests a version change on that scratch database. Record whether the Chrome tab is unfrozen, discarded or left as it is, then the same with the tab's transaction on a store the PWA only reads. It never touches `sheet`.
4. **Manual checks after each PR:**
   - the owner's phone, with a Chrome tab of `.dev` left in the background for an hour while the PWA is used;
   - the journal of starts read from the menu.

## 8. Questions

1. **Edits in degraded mode** (§4.3). Recommended: only cloud notes with their revision, saved into fallback keys; no new notes, trash or versions. Alternative: read-only cloud view only, which is simpler and safer.
2. **A pending copy whose owner changed meanwhile.** Recommended: never moved in; it stays as a fallback key, shown as a backup copy and exportable, as a fallback copy of another epoch is today.
3. **The order of the PRs.** Recommended:
   - #126 first (layer 1), then §4.1 items 1 (the sync session) and 4 (this plan);
   - in parallel, the move of the wait logic into `public/storewait/` (no behaviour change);
   - then layer 3;
   - the device experiment of §7 item 3 before deciding on any layer 2 code.

The grace of a hidden only client, the first question of an earlier draft, is settled by #126 (§4.1).

## 9. Coordination with the sync session

This session cannot message other sessions; the owner or the session that relays the reports passes this on. For the sync session («Baobook: sync PR 4 plan»):
- **#126 is layer 1.** What it leaves open: §4.1 item 1 (the transactions outside `SDB`) is theirs; item 4 (the start's connection) is this plan's, wired into their `closeDb` action.
- **#123 and #126 change the same lines.** Both raise `BUILD` to 2026102602, and both change the line of `TABS.onmessage`: #126 moves the handler into `openTabs()`, and #123 answers `who?`/`here` before `tabMsg`. The PR merged second merges `main`, raises `BUILD`, and puts the two answers into `openTabs()`'s handler. `bootDiag` sends through `tellTabs`, which skips a closed channel.
- **Receive transactions bounded in time.** With the abort on `freeze`, a long transaction no longer holds a frozen tab's store, but it is redone each time; on a phone that freezes often a long one might never finish. Check how long the longest one takes on a phone.
- **The read-only cloud query for layer 3:** the budget, and the receipts/conflict state of notes shown from the cloud.

## 10. Review rounds

(none yet)
