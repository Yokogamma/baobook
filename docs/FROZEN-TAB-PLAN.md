# A frozen tab never stops the app

**Status: plan (2026-10-26; brought to #126 the same day; merged into `main` by #127 on 2026-10-27; the independent reviews of 7ac632c and a0807cb answered the same day, §10).** It follows #123 (the diagnosis of a waiting start and the strip of a held format check), which only says what happens. This plan makes the app work by itself. Three layers, each in its own PRs into `main`:

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

1. **Chromium has a mechanism, for frozen documents too.**
   - **The interface.** [`content/browser/indexed_db/indexed_db_client_state_checker.h`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/indexed_db/indexed_db_client_state_checker.h) (main, read on 2026-10-26):
     - a document can move between active and inactive, where inactive means «BFCache / frozen»;
     - `DisallowInactiveClient` is called for a version change event, a transaction acquiring locks, a transaction starting while blocking others, and an ongoing transaction whose client becomes inactive while blocking others;
     - its keep-active handle «unfreezes the document and/or prevents it from entering inactive states (such as BFCache or page freeze) while alive».
   - **The implementation.** [`content/browser/renderer_host/indexed_db_client_state_checker_factory.cc`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/renderer_host/indexed_db_client_state_checker_factory.cc) (main, read on 2026-10-27). `DisallowInactiveClient()` handles the two cases named in its comment, «freezing and back-forward cache»:
     - a document in the back/forward cache is evicted by the call to `IsInactiveAndDisallowActivation()`;
     - for a document that `IsFrozen()`, it registers a `HoldingBlockingIDBLockHandle`, which, the comment says, «will unfreeze and prevent the document from being frozen for the lifetime of the handle»;
     - the same code notes that «until crbug.com/40691610 is fixed, a RenderFrameHost that is frozen for any other reasons than BFCache is considered active».
   - **What the source does not settle:**
     - which Chrome version on the owner's phone carries this branch. The file's history on googlesource needs a sign-in, so the date it landed is not established here;
     - whether Android's freeze of a background tab is the `IsFrozen()` state this code sees, or a freeze below it that the browser process does not undo.

   The mechanism in current Chromium is a fact; its reliability in the case that was observed is not (item 3).
2. **Android freezes regardless.** The [freezing policy document](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/performance_manager/docs/freezing_opt_out_opt_in.md) lists «holding a Web Lock or an IndexedDB transaction» as a reason not to freeze a page **on desktop**. It also says: «Freezing is already enabled on Mobile and doesn't honor the Opt-Out/Opt-In presented on this page». The [Energy Saver post](https://developer.chrome.com/blog/freezing-on-energy-saver) (Chrome 133) has the same exemption for desktop. So on Android a tab holding a transaction may be frozen, which matches the incident.
3. **The incident is the measurement.** If Chromium unfroze the holder when the PWA's transaction was blocked, the start would not have waited 83 min. On this device, with its Chrome version, nothing freed the storage within the time that matters, whatever item 1's code does elsewhere.
4. **A version change or a delete cannot be used.**
   - Opening `sheet` with a higher version would upgrade the user's database, and this code would then read it as a newer app's data (`d.version > IDB_VER` → `newer`). The upgrade also waits for every connection to close, the frozen one included (the #111 incident).
   - `deleteDatabase` destroys the notes.
   - Neither is acceptable as a trigger.
5. **Web Locks `steal` frees only the lock.** MDN [`LockManager.request`](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request): «any held locks with the same name will be released, and the request will be granted… Code that was previously running inside the lock continues to run». It does not touch IndexedDB. Stealing the leader lock would let a visible tab lead, but its transactions still queue behind the frozen one.
6. **Another app found the same.** A public write-up ([skysa-notes PR #324](https://github.com/skysa-org/skysa-notes/pull/324)) describes a frozen tab's IndexedDB transaction blocking the foreground app until the tab closed. Their fix was to close the connection when the tab freezes. This is one developer's report, not a Chromium statement.

**Conclusion for layer 2.** Current Chromium has a mechanism meant for this case (item 1), but it did not free the owner's phone (item 3), and no page-level call is known that makes it act. The plan does not promise automatic recovery. It keeps one device experiment (§7, item 3) to check whether a blocked request on a scratch database of its own makes Chrome unfreeze a frozen holder. If it does, a later PR can use that, with a scratch database, never `sheet`. So the app must not depend on recovery: prevention (layer 1) removes the cause, and degradation (layer 3) covers what prevention misses.

## 4. Behaviour

### 4.1 Layer 1: prevention (the sync session, #126)

A document must not hold the database while it is frozen. #126 does this on `freeze`, the event Chrome fires before it freezes a page:
- the lead goes first, so that nothing starts a new transaction after the abort;
- new `SDB` transactions are refused, and the open ones are aborted rather than awaited. An `SDB` transaction is atomic: the core does its work again, and a save fails as an ordinary failed save and is retried;
- the IndexedDB connection and the BroadcastChannel close. A frozen page that took a message would start a read it never finishes;
- on `resume` or a persisted `pageshow` they reopen, the page reads what other tabs stored meanwhile, and it asks for the lead.

On a phone a hidden leader lets the lead go after 15 s by itself, since a tab frozen later could not answer a request for it; on a computer a hidden leader keeps syncing. This settles the grace of a hidden client, which an earlier draft of this plan left as a question.

**What #126 leaves open:**
1. **Transactions outside `SDB`.** The page's `idb.tx` and `idb.run` are neither refused nor aborted on `freeze`: the versions and their blobs (`vput`, `vdelete`) and `db.put`/`db.del`. `close()` does not abort them either, since a connection closes only after its transactions end.
   - Every write of `idb.tx` also takes `sync`: the format guard (#115) widens its scope with `fmtScope`.
   - So a page frozen inside one holds `sync` as well as `versions` and `blobs`: the store of the incident, and the one every start's format check reads.

   Either these go through `SDB` (its `open` set), or `freeze` aborts them too. This is the sync session's call (§9).
2. **A tab of an older build.** A Chrome tab opened before the release that carries #126, and frozen since, runs the old code until it is reloaded, and a frozen tab is not reloaded. For a while after that release on `.app` the cause can come back; layer 3 covers it.
3. **No `freeze` event.** A renderer process the system kills fires nothing, but a kill frees the database. Whether Android ever freezes a Chrome renderer without Chrome's own freeze, and so without the event, is not known; the device experiment (§7, item 3) records what it sees.
4. **The start's own connection.** A tab frozen during its start holds its format check. The check runs on the connection the start has opened and not adopted yet: `idb.pend` from #123; in `main`, before #123, the same connection without a name.
   - That connection is not `idb.db`, so `closeDb` skips it (it also skips while `idb.opening`), and the check is not an `SDB` transaction.
   - With #123 the check is readonly. It does not block another start's readonly check, but it blocks every write on `sync`, the leader's included. In `main` the check is a readwrite transaction and blocks every other start too.

   The storage module (§5) adds this connection to the `freeze` actions: it aborts the check and closes the connection, and the start opens again on `resume` (§5.1, the paused start). This part is this plan's, not the sync session's.
5. **A freeze before the lifecycle module has loaded.** `index.html` imports `public/lifecycle/model.js` after the page starts; until it arrives, #126's `life()` runs only `leadOff` on `freeze`. A tab frozen in its first moments keeps its connection and any transaction in it. Either the fallback runs the whole `freeze` list, or the module loads before the start opens the database. This is the sync session's call (§9).

**Interface between the two parts:** #126's `actionsFor()` names the actions of each event; `index.html` wires each one (`LIFE_DO`). The storage module's part of `closeDb` (item 4) is wired the same way. The format guard is unchanged: a reopened connection is an ordinary open, without a deadline.

### 4.2 Layer 2: recovery

Beyond §3 there is no automatic recovery. The held strip of #123 stays, as the explanation while layer 3 works.

### 4.3 Layer 3: degradation

When the start's storage check is held for longer than `HELD_WAIT` (15 s, #123), the app does not stay on the snapshot.
1. **What is shown:**
   - **Signed in:** the notes from the cloud. The cloud adapter `public/cloud.js` does not use `sheet`, and Firebase Auth keeps its own database. Read-only queries of the owner's notes count against the device's daily read budget (SYNC-PLAN §4.5, §4.17); the first screenful is read, the rest on demand.
   - **Not signed in:** the snapshot of names (`sheet:listsnap`), read-only, as now.
2. **Edits.** They are allowed only when the note came from the cloud with its revision (`rev`).
   - Each save writes a standby draft (§4.4): a localStorage key of its own, outside `sheet:note:`, with the note's origin and the cloud state it was edited from. It **survives a closed page**.
   - The draft is written with the editor's save, and once more on `visibilitychange` to hidden (`flushSave`). Chrome's guidance calls that the last moment a page can rely on to save.
   - When localStorage refuses too, the edit is in memory only: the strip says it is not saved, and «Експортувати незбережене» is offered, as `lock.unsaved` does today. The handover (§4.5) still writes it once the storage is free.
   - **Closing the page.** Where the browser fires `beforeunload`, closing with an edit that is only in memory asks first. That is not guaranteed ([Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)):
     - Chrome fires it only after an interaction with the page, and some browsers do not fire it when a page goes into the back/forward cache;
     - the guidance says the termination events (`beforeunload`, `pagehide`, `unload`) cannot be relied on, especially on mobile: closing a tab from the tab switcher or the browser from the app switcher does not fire `unload`, and a discarded page runs no code.

     So an edit that localStorage refused can be lost when the page ends. The strip and the export are the protection, not the question on closing.
   - The note carries a mark, «Зберігається, щойно сховище звільниться».
3. **When the storage is free** (the held check finishes, by layer 1, by the holder waking, or by a reload), the start goes on in this order:
   - the format check, then `SYNC.reload()`;
   - `db.move()` for the legacy fallback keys, as today (§4.4, «Legacy keys»);
   - the handover (§4.5): every draft and every edit still in memory goes through the core, each confirmed before anything of it is dropped;
   - only then the list is read from the store (`db.all()`), for the notes the handover has confirmed (§4.5, step 4).
4. **Not covered:**
   - creating notes, the trash, the archive, versions and «Історія» in degraded mode; these need the database, and the buttons say «Зараз лише перегляд» as under a lock;
   - the account panel;
   - search beyond the notes on the screen.

### 4.4 Standby drafts: their origin, and the move into the store

The existing fallback copies cannot carry this. A key `sheet:note:<id>~<tab>~<generation>` holds only the note, and `db.move()` imports it through `SYNC.importMany` without asking where it came from. The first `SYNC.reload()` of a start adopts the owner it finds in the store: the guard against another owner exists only from the second load (`S.everLoaded`). So a copy written under owner A moves into B's store and joins B's queue. The independent review reproduced this on the code of `main`.

**The key and the record** (described once, in `public/standby/model.js`):
- The key is `sheet:draft:<id>~<tab>~<generation>`. It is written once and never rewritten, with the same generation rule as the fallback keys.
- **Old tabs never read it.** `db.move()`, `fbAll` and `fbLocal` of every build read keys under `sheet:note:` only, so a tab of an older build never imports or shows a draft.
- The record:
  - `v`: 1, the version of this record;
  - `format`: the `FORMAT` of the code that wrote it;
  - `origin`: `{env, uid, epoch}`:
    - `env` and `uid` are those of the signed-in user whose cloud notes are shown (`fbUser` in `sheet:settings`, the cloud adapter's `env`);
    - `epoch` is the store's epoch as this device last saw it for that same account. It comes from a new optional settings field, `seen: {env, uid, epoch}`, which the page writes every time the engine has loaded or set the owner. It is `null` (unknown) when the field is missing or names another account;
  - `base`: `{rev, note}`, the cloud note exactly as it was shown and edited, with its revision;
    - `origin` belongs to this snapshot. Every generation of the note in this tab carries the origin of the snapshot it was first edited from, even if the signed-in account changes meanwhile;
  - `note`: the note as edited;
  - `tab`, `gen`, `t`: the tab, the generation of the save, and the time.

**The move: one core call per draft.** A new core function, `SYNC.importDraft(draft)`, lives in `public/sync.js` so that the data format stays there; the sync session reviews it. It runs in one transaction over `notes`, `sync`, `versions` and `blobs`, and returns `{ok, code, note, lrev, copies, gen}`: the stored result, its `lrev`, the copies `merge3` made, and the generation it recorded.
1. It reads the store's `owner` and `epoch`, the stored record of the note, and the applied record of the note and the draft's tab (below).
2. It moves the draft automatically only when all of these hold:
   - `v` is a version it knows, and `format` is not above `FORMAT`;
   - `origin.env` and `origin.uid` equal the store's owner;
   - `origin.epoch` equals the store's epoch. An unknown epoch never matches.
3. Otherwise it refuses with the code `origin`, writes nothing, and leaves the key as it is. The draft shows as a copy for export only («Чернетка, не перенесена: інший обліковий запис або не підтверджено»). Nothing imports it later; the user can only export it.
4. **A generation already applied is never applied again.** If the applied record of the note and the draft's tab has a generation at least the draft's, it refuses with the code `applied` and writes nothing: a repeat or an older generation, whoever holds it. It still returns the stored result and its `lrev`.
   - Another tab may have read the key into memory before it was removed.
   - A page may have closed between the commit and the removal of its key.
5. When accepted, the draft goes in by the core's three-way merge, `merge3(base, draft.note, stored)`, as the revival of a note does (`SYNC.writeLocal` with `SC.merge3`). The base depends on the generation:
   - **the first generation of a tab** that reaches the store merges over the draft's `base.note`, the cloud snapshot;
   - **every later generation of the same tab** merges over the note of that tab's latest applied generation, kept in the applied record. So a later generation brings only its own change over what the same tab handed in before, a revert included.

   The cases:
   - In the first review's case the user changed only the title of `rev` 5, and the store already had a new body from `rev` 6: the note keeps the new title and the body of `rev` 6.
   - In the second review's case `g1` changed the title from «Original» to «Edited» and was applied, another tab then changed the body, and `g2` set the title back to «Original». Over the cloud base, `g2` equals the base and the merge would keep «Edited» with no conflict copy. Over `g1` it gives «Original» with the other tab's body.
   - Copies that `merge3` returns are kept as the core keeps them.
   - With no stored record, the draft goes in as it is.
   - A revision number alone would not be enough: the merge needs the base itself, which is why the record keeps `base.note` and the applied record keeps the note of the last generation.

   In the same transaction it writes the applied record: `drafted:<note>:<tab>` in `sync` as `{env, uid, epoch, gen, note, t}`.
   - The identity of a generation is the origin, the note, the tab that wrote it, and its generation.
   - `note` is the draft's note as that tab handed it in, not the merged result. It is the base of that tab's next generation: the screen that tab keeps editing is that state, so its next change is measured from it. Measured from the merged result, another tab's change that this screen lacks would read as a deletion.
   - `note` goes when the tab that wrote it finishes its handover: its last handover transaction writes the record without it. A tab closed or frozen in the middle leaves it, one copy of the note per such tab.
   - A later generation that finds no `note` in the record merges without a base (`merge0`). Where the two sides differ, that keeps a conflict copy instead of choosing silently.
   - The marker itself, a few dozen bytes per note and tab that ever wrote a draft, stays. A tab that wakes after days with an old draft in its memory is still refused.
6. **A key goes only on the store's word.** A key is removed when the applied record of its note and tab has a generation at least the key's, read in a transaction of its own. Any tab may remove it then: a key left by a page that closed between the commit and the removal goes at the next start, without being imported again. A key with no such record is never removed.

**Legacy keys.** The fallback keys `sheet:note:…`, which `db.save` writes when IndexedDB refuses a save, keep today's move:
- `fbPut` over the whole snapshot keeps both versions, the newer as the note and the other as «… (резервна копія)», but it **does not merge** independent edits: there is no base;
- they carry no origin, so the gap above stays for them (§8, question 3).

### 4.5 The handover when the storage frees

The degraded view ends without losing an edit, including one that was only ever in memory and one typed while the handover runs.
1. **What it takes:** for every note edited in degraded mode, every generation of its edits:
   - the drafts in localStorage, of this tab and of other tabs;
   - this tab's memory state, with its latest generation. When localStorage refused, it is the only copy.
2. **The writes.** Each goes through `SYNC.importDraft` on its own, the oldest first:
   - for each other tab with drafts of the note, only its newest draft. An older generation of the same tab holds nothing the newest lacks, and moving it after the newest would set an older text against a newer one in the merge;
   - this tab's memory state at its latest generation `g`, as a draft with the same origin. The core takes its base from the applied record (§4.4, step 5).

   The editor stays editable on the degraded state meanwhile, and its saves still go to drafts or memory. A tab that is still open and keeps typing hands over its own newer state the same way: its base is its own previous generation, so it brings only its own change.
3. **Confirmation.** Generation `g` of a note is confirmed when the core's transaction has completed and `importDraft` has returned the stored result and its `lrev`.
   - A refusal `applied` for this tab's own generation confirms it too: another tab handed it in first.
   - Only then do the keys go, by the rule of §4.4, step 6.
   - If the user typed meanwhile, so that the memory is at a newer generation, the handover writes that one next. This is the loop the revival of a note already runs (`EDITS` and its generation).
   - Until a note is confirmed at its latest generation, its previous state (memory and keys) stays as it is.
4. **The switch.** The list and the open note are rebuilt from the store (`db.all()`) only for notes with nothing pending.
   - The open note keeps its editor, with what this tab wrote.
   - The stored result may hold more: another tab's draft or edit, merged in. It comes onto the screen the way another tab's change does: by `takeStored`, at a safe point, with «Є зміни» meanwhile.
   - **The editor's snapshot follows the rule `writeNote` already has** (`setSnap(id, D, same? r.lrev : null)`):
     - until the screen takes the result, `ESNAP` holds the note this tab handed in;
     - its `lrev` is the returned one only when `SC.sameDoc(handedIn, result.note)`, otherwise `null`.

     With `null`, the ordinary save of `editorDelta` cannot take its shortcut (`E.lrev === meta.lrev` → the screen as it is). It merges over the snapshot instead (`merge3(E.note, D, C)`), so a save made before the redraw keeps the other tab's change.
   - The review's case: A hands in a new title, and the merged record also has B's new body. A's caret stays in the editor, so `takeStored` waits. A types more of the title and saves. With the returned `lrev`, the shortcut would write A's old body over B's, with no copy. With `null`, B's body stays.
   - **When `takeStored` redraws the note** at its safe point, `ESNAP` becomes the accepted record with its `lrev`, as `takeStored` does today (`setSnap(id, n, lrev)`). The handover never puts its own older snapshot back after that.
   - From then on the ordinary save path (`db.save` → `SYNC.writeLocal`) takes over.
5. **Failures:**
   - A refusal by origin (`origin`) turns the note into a copy for export only, with the strip and «Експортувати незбережене».
   - An aborted transaction or a storage error is an ordinary failed save: the memory state stays, the `unsaved` map holds its reason, and «Повторити» tries again.
   - In both cases nothing is dropped.

## 5. Modules (CLAUDE.md «Modular and ready for TypeScript»)

| Folder | Files | What |
|---|---|---|
| `public/storewait/` | `model.js` | The rules of the start's wait as pure functions of its events: the states (opening, waiting for an upgrade, held, `storage` lock), the timers (`OPEN_WAIT`, `UPGRADE_WAIT`, `HELD_WAIT`, `DIAG_WAIT`), the journal steps and their labels (`bootPh`/`bootNext`), and the reading of a diagnosis. Node tests: `tests/storewaitmodel.mjs` |
| | `ops.js` | The diagnosis (`bootDiag`, the probe databases and their sweep); on `freeze`, the start's pending connection closed and its check aborted, then opened again on `resume` (§4.1, item 4) |
| | `view.js` | The strip texts of the wait (`waitUI`'s part) |
| `public/standby/` | `model.js` | Layer 3's rules: what is shown (cloud notes or the snapshot), what may be edited, the draft record and its key (§4.4), the decision of a draft against the store (`decideDraft`), the order of the handover (§4.5). Node tests: `tests/standbymodel.mjs` |
| | `ops.js` | The read-only cloud query through the cloud adapter, the saves into draft keys, the handover through `SYNC.importDraft` |
| | `view.js`, `panel.js` | The mark on a note, the strip, the list of the degraded view |
| `public/lifecycle/` (the sync session, #126) | `model.js` | The actions of each page event (`freeze`, `resume`, `hidden`, …); the storage module's part of `closeDb` is wired in beside the others |
| `public/sync.js` (the core) | — | `importDraft(draft)`, the one transaction of §4.4; the data format stays here |

**Wiring.** `index.html` only wires these in through the import map with SRI hashes, as `public/account/` is. The first PR moves the wait logic that #111, #115 and #123 put into `index.html` (`idb.open`'s timers, `idbWait`, `bootDiag`, `waitUI`'s wait part) into `public/storewait/` without changing behaviour, with the Node tests of `model.js`. The browser scenarios `appidbwait`, `appformatgen`, `appidbfail*` and `appboot` must pass unchanged.

### 5.1 Contracts

The folders alone do not make the port to TypeScript a file-by-file move; these contracts do. Each is a JSDoc `@typedef` in the `model.js` that owns it, described once.
- **The start's wait** (`storewait/model.js`): `next(state, event) → {state, actions}`, a pure function.
  - The events: `requested`, `answered`, `blocked`, `fmtStart`, `fmtDone`, `failed`, `timer` (with its name), `freeze`, `resume`.
  - The states: `opening`, `upgrade` (waiting for another tab), `checking` (the format check), `held` (past `HELD_WAIT`), `paused`, `done`, `locked` (with the `LOCK` kind).
  - The actions: `strip`, `diagnose`, `closePending`, `reopen`, `enterStandby`, `handover`, `journal` (with the step).
  - **The paused start.** A `freeze` in `opening`, `checking` or `held` gives `closePending` and the state `paused`, which keeps the attempt count and the journal. A `resume` gives `reopen`, with a new `HELD_WAIT` clock.
- **The draft** (`standby/model.js`): the record of §4.4 as `StandbyDraft`, its key as `draftKey(id, tab, gen)`, and its origin as `DraftOrigin`.
  - `decideDraft(draft, store) → {kind:'merge'|'asIs'|'applied'|'exportOnly', base?, reason?}`, given `{owner, epoch, format, record, applied}` of the store. It is pure, and `importDraft` applies the same rule inside its transaction.
  - The applied record as `DraftApplied`: `{env, uid, epoch, gen, note, t}` under `drafted:<note>:<tab>`, described once in `public/sync.js` with the other `sync` keys (`K`).
  - `importDraft`'s result as `DraftResult`: `{ok, code, note, lrev, copies, gen}`.
- **The handover** (`standby/ops.js`): `handover({drafts, memory}) → Promise<{confirmed: Map<id, gen>, exportOnly: id[], failed: Map<id, reason>}>`. `memory` is `Map<id, {note, base, gen}>`.
- **Between the modules:**
  - `storewait` gives `enterStandby` once the check is `held`, and `handover` once it is `done` after standby;
  - `standby` resolves the handover before `start()` reads `db.all()`;
  - `lifecycle` gives `freeze` and `resume` to `storewait` through the same `LIFE_DO` wiring as its other actions.

## 6. Data and strings

- **IndexedDB:** no new store, index or field. One new kind of record in `sync`, `drafted:<note>:<tab>` (§4.4, step 5), local to the device like the other `sync` records and not in the export.
- **localStorage:**
  - one new key family, `sheet:draft:<id>~<tab>~<generation>` (§4.4);
  - one new optional field of `sheet:settings`, `seen: {env, uid, epoch}`, which reads as missing (an unknown epoch) on a device that never wrote it.

  The existing fallback keys keep their format.
- **The export file does not change.** A draft for export only goes out through «Експортувати незбережене» as a note.
- **New strings** in `uk.json` and `en.json`, whole sentences:
  - the degraded strip, e.g. «Сховище браузера зараз зайняте, тому показано нотатки з хмари. Правки зберігаються на цьому пристрої й потраплять у сховище, щойно воно звільниться.»;
  - the mark on a note, «Зберігається, щойно сховище звільниться»;
  - a draft for export only, «Чернетка, не перенесена: інший обліковий запис або не підтверджено»;
  - the not-signed-in variant (read-only).

## 7. Tests and checks

1. **Node tests:**
   - `storewaitmodel`: every state change of the wait, the paused start (a `freeze` while `checking` gives `closePending`, and `resume` gives `reopen`), the labels of old journal records;
   - `standbymodel`: what is editable; `decideDraft` for each case of §4.4:
     - the same owner and epoch;
     - another uid; another env; another epoch; an unknown epoch;
     - a newer `format`; an unknown `v`;
     - the first review's merge: only the title of `rev` 5 edited, over a stored body of `rev` 6, gives the new title with the body of `rev` 6;
     - the second review's revert: `g1` «Edited» applied, another tab's body, `g2` back to «Original»: the result is «Original» with that body, so the base is `g1`, not the cloud snapshot;
     - a generation at or below the applied one gives `applied`;
     - a later generation whose record has lost its `note` merges without a base and keeps a conflict copy;
     - no stored record;
   - the core (`tests/sync*.mjs` over `public/sync.js`), `importDraft` in both replay schedules of the second review:
     - tab B reads A's key of `g1` into memory; A applies `g1`, its key goes, A edits on by the ordinary path and reverts the change; B's import of `g1` is refused with `applied` and changes nothing;
     - the page closes between the commit of `g1` and the removal of its key: the next start removes the key on the applied record and imports nothing;
     - an older generation that arrives after a newer one of the same tab is refused;
   - `lifecyclemodel` (#126): the actions of every event and state.
2. **Browser scenarios:**
   - **Layer 1:** #126's `appfreezetx`: after `freeze` another tab writes in a few milliseconds instead of waiting for the held transaction. For §4.1 item 4: a tab frozen during its format check lets another tab's write on `sync` through. It fails without closing `idb.pend`. Each scenario fails on the code before it.
   - **Layer 3:**
     - a held check after 15 s shows the cloud notes of the test cloud (`tests/lib/cloud.mjs`), an edit goes into a draft key, and the holder letting go moves it in by the merge;
     - **the storage frees while localStorage refuses** (every `setItem` throws `QuotaExceededError`) **and the user keeps typing** through the handover: the store ends with the last text, nothing typed is lost, no key goes before its transaction has completed, and the open note's editor is not replaced;
     - an aborted handover transaction leaves the memory state and the keys as they were;
     - the page closes between a handover's commit and the removal of its key: after a reload the key goes and the note is not imported twice;
     - the open note's result holds another tab's body while A's caret stays in the editor:
       - A types more of the title and saves by the ordinary path before the redraw: the stored note has A's title and B's body, with no copy. With the returned `lrev` in `ESNAP` this fails: the shortcut writes A's old body;
       - after the redraw by `takeStored`, `ESNAP` is the accepted record with its `lrev`, and the next ordinary save goes on from it;
     - a draft of another uid, or with an unknown epoch, is never imported, not after a reload either, and exports;
     - a start of code without `public/standby/` (only the legacy `db.move()`) leaves `sheet:draft:` keys alone.
3. **A device experiment** (Android, on `.dev`, for §3): a test page in a Chrome tab holds a transaction on a scratch database `baobook-frozen-test` and is left to freeze; the PWA requests a version change on that scratch database. Record whether the Chrome tab is unfrozen, discarded or left as it is, then the same with the tab's transaction on a store the PWA only reads. It never touches `sheet`.
4. **Manual checks after each PR:**
   - the owner's phone, with a Chrome tab of `.dev` left in the background for an hour while the PWA is used;
   - the journal of starts read from the menu.

## 8. Questions

1. **Edits in degraded mode** (§4.3). Recommended: only cloud notes with their revision, saved as drafts (§4.4); no new notes, trash or versions. Alternative: read-only cloud view only, which is simpler and safer.
2. **A draft whose origin is not confirmed** (another owner, another or unknown epoch, a newer format). Recommended: for export only, never imported automatically, not after a later start either (§4.4, step 3).
3. **The legacy fallback keys.** They carry no origin, so a key written under one owner moves in under another (§4.4). Recommended:
   - from the PR of §4.4, `db.save`'s own fallback writes draft records too, so its new copies move by §4.4's rules;
   - the `sheet:note:` keys already on a device keep today's move. They carry nothing to check, and refusing them would strand the copies of older builds.
4. **The order of the PRs.** Recommended:
   - #126 first (layer 1), then §4.1 items 1 and 5 (the sync session) and item 4 (this plan);
   - in parallel, the move of the wait logic into `public/storewait/` (no behaviour change);
   - then §4.4 with `SYNC.importDraft` and the legacy question;
   - then the rest of layer 3, with the handover;
   - the device experiment of §7 item 3 before deciding on any layer 2 code.

The grace of a hidden only client, the first question of an earlier draft, is settled by #126 (§4.1).

## 9. Coordination with the sync session

This session cannot message other sessions; the owner or the session that relays the reports passes this on. For the sync session («Baobook: sync PR 4 plan»):
- **#126 is layer 1.** What it leaves open:
  - §4.1 items 1 (the transactions outside `SDB`, which hold `sync` through `fmtScope`) and 5 (a freeze before the lifecycle module has loaded) are theirs;
  - item 4 (the start's connection) is this plan's, wired into their `closeDb` action.
- **#123 and #126 change the same lines.** Both raise `BUILD` to 2026102602, and both change the line of `TABS.onmessage`: #126 moves the handler into `openTabs()`, and #123 answers `who?`/`here` before `tabMsg`. The PR merged second merges `main`, raises `BUILD`, puts the two answers into `openTabs()`'s handler, and runs `node tests/hashes.mjs --write`, keeping `public/lifecycle/model.js` in the import map, the `SRI` table and `PRECACHE`. `bootDiag` sends through `tellTabs`, which skips a closed channel.
- **Receive transactions bounded in time.** With the abort on `freeze`, a long transaction no longer holds a frozen tab's store, but it is redone each time; on a phone that freezes often a long one might never finish. Check how long the longest one takes on a phone.
- **The read-only cloud query for layer 3:** the budget, and the receipts/conflict state of notes shown from the cloud.
- **The core's part of layer 3:**
  - `SYNC.importDraft` (§4.4), with the applied record `drafted:<note>:<tab>` and its result `{note, lrev, copies, gen}`;
  - the settings field `seen`, written wherever the engine loads or sets the owner.

## 10. Review rounds

1. **Independent, on 7ac632c (2026-10-27):** two major and two minor findings, all taken.
   - **Major:** the fallback copies carry no origin, and `db.move()` imported a draft of owner A into B's store (reproduced on the code). Now there are draft records with their origin and base under a key family that old builds do not read, a move checked inside one core transaction, and unconfirmed drafts for export only (§4.4, §8 questions 2 and 3).
   - **Major:** there was no safe handover of edits held in memory when the start ends, and the question on closing was promised. Now there is the handover with confirmation per generation and continued typing (§4.5), a browser scenario with localStorage refusing (§7), and `beforeunload` described as conditional (§4.3).
   - **Minor:** the move was called a three-way merge while `fbPut` imports a whole snapshot. Now the draft keeps its base and goes in by `merge3`, and the legacy behaviour is stated as it is (§4.4).
   - **Minor:** the research stopped at the header. Now the implementation's `IsFrozen()` branch with `HoldingBlockingIDBLockHandle` is in, kept apart from what was observed on the phone (§3).
   - **Also:** `fmtScope` widens `idb.tx` writes to `sync`; `idb.pend` exists from #123; a freeze before the lifecycle module loads (§4.1, items 1, 4 and 5); the contracts of §5.1; the SRI and `PRECACHE` step in §9.
2. **Independent, on a0807cb (2026-10-27, after #127 was merged; answered in a PR of its own):** two major findings, both taken.
   - **Major:** a later generation merged over the cloud base loses the revert of the tab's own change. The review reproduced this on `merge3`: `g1` «Edited» applied, another tab's body, then `g2` «Original»; the result kept «Edited» with no copy. Now a later generation merges over the same tab's latest applied generation, kept in the store, and `importDraft` returns the result and its `lrev`. The screen takes the merged result by `takeStored` instead of claiming it already shows it (§4.4, step 5; §4.5, steps 3–4).
   - **Major:** nothing stopped another tab, or a page closed before removing its key, from importing a generation again. Now each applied generation is recorded atomically with its result (`drafted:<note>:<tab>`: origin, note, tab, generation); a repeat or an older generation is refused with `applied`; keys go on that record. §7 covers both schedules.
   - The earlier findings stay closed: the origin check (with `origin` tied to the snapshot in `base`), the conditional `beforeunload`, the merge over a base for the first generation, Chromium, the contracts and the SRI step.
3. **Independent, on 2734325 (2026-10-27):** one major finding, taken.
   - **Major:** §4.5 put the handed-in note into `ESNAP` with the merged result's `lrev`. An ordinary save before the redraw then took `editorDelta`'s shortcut, and A's old body replaced B's with no conflict copy (reproduced on the functions of 142f0cf).
   - Now the snapshot follows `writeNote`'s rule: the returned `lrev` only when the result equals what was handed in, otherwise `null`; after `takeStored`, the accepted record with its `lrev`. §7 adds the save before the redraw, and editing after it.
   - The atomic marker and the tab's own previous generation are confirmed by the review (replays after a closed page or a key read by another tab; the revert «Edited» → «Original» on `merge3`).
