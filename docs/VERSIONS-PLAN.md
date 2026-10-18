# Note versions in «Чистый лист»: implementation plan, revision 1

[now Baobook: `public/index.html`]

Date: 2026-10-05. The owner's request: see the versions of every note and go back to an earlier one "roughly as in git"; store the changes, not full copies of the note; the example is a password or a key in a note that was spoiled by accident and has to be looked up in an old version, compared and brought back; easy switching between versions. The direction (the "block bodies by content hash" option, section 3.1) is approved by the owner; this document is the plan for the reviewer.

App: `sheet/index.html` (one file, vanilla JS, PWA, no build step). Live version: https://yokogamma.github.io/mockups/sheet/. Tests: `sheet/tests/` (Playwright, 19 scenarios, how to run them is in `sheet/tests/README.md`). Related plans: `sheet/MOBILE-PLAN.md` (the stack of structural operations 3.6, the route and Back 3.8, the header «⋯» menu), `sheet/SYNC-PLAN.md` (merging by blocks, tombstones, Firestore).

In short: versions and block bodies live in the same IndexedDB `sheet` (database version 2, two new stores `versions` and `blobs`); a version is created before the first edit of a saved state and after that no more often than once in 5 minutes; old versions are thinned to one per hour, then one per day, and named ones are not touched; viewing is on the same canvas in read-only mode, with the differences highlighted; restoring the whole note or one block can always be undone: the state before the restore becomes a version itself, and the «Скасувати» toast brings it back at once. The line references below are to `sheet/index.html` at commit `584ffb2` and are approximate (≈).

PR 1 state (2026-10-06): implemented per sections 3.1–3.4, without an interface; scenario `sheet/tests/appversions.mjs`. The decisions of section 8 were taken by default (the owner said to start without the answers): a 5 min interval, a 24 h / 7 d / 90 d ladder, a budget of `min(20 MB, 5 % of the quota)` and 300 versions per note, named versions in PR 3, the versions of a deleted note are deleted with it, the toast after a restore has no timer, through the undo stack (MOBILE-PLAN 3.6 already exists). Differences from the text of the plan: (1) R1 writes «перед правкою» only if the note has no versions yet or the saved state has "settled" for ≥ `V_GAP` (by the version clock, `SAVED.at`); otherwise every pause in typing would make a version, and "10 edits in a minute, one version" would not hold; the state within an editing session is protected by R3 once in 5 min, as in Obsidian; (2) the empty initial state of a new note does not become a version; (3) `idb.run(mode, fn)` is left as it is, and `idb.tx(stores, mode, fn)` is added for several stores; (4) `force(reason, name)` writes a version with `t = vnow()`, so that the thinning scenarios work with a shifted clock; (5) with `?debug=1` version errors go to `console.warn`; there is no switch in the panel. The manual check of section 6 (items 3–5, 7) was not done on devices.

PR 2 state (2026-10-09): done per 3.5, 3.6 (restoring the note) and 3.8 (the panel hides «+»; the undo bar and toasts sit above the bottom sheet); scenario `tests/appversions2.mjs`. Differences from the text: (1) `.ghost-blk` (blocks a full restore would remove) moves to PR 3, as the plan allows; (2) the «Історія версій» item in the header «⋯» menu is not added: the button stays visible in the header at every width, 320 px included; (3) the version kind `conflict` reads «з іншої вкладки» (written when two tabs change one note at once, see `tests/apptabsync.mjs`), and `manual` without a name reads «вручну»; (4) the undo bar after a restore has no timer (`offerUndo` with `big`); (5) Ctrl+Z, «Область», «Очистити» and opening another note close the panel first, paste does nothing while a version is shown; (6) the system Back closes the panel only on a narrow screen (≤640 px), where it is a bottom sheet. Not checked on devices by hand (section 6, items 1 and 6).

PR 3 state (2026-10-09): done per 3.5 (search in versions, `.ghost-blk`), 3.6 (restoring a block), 3.7 and 3.8 (export with history); scenario `tests/appversions3.mjs`. Differences from the text: (1) «Повернути цей блок» is not shown on hover: the sheet is inert while a version is shown, so the buttons sit in a layer over the sheet (`#vlayer .vbtn`), beside every changed or missing block, the same on a computer and a phone; (2) «Зафіксувати версію…», the search on a phone and «Очистити історію нотатки» live in the panel's «⋯» menu (`#histMore`), so the bottom sheet keeps room for the list; on a computer the search field is always shown; (3) with a version shown, the menu item is «Назвати цю версію…» and gives that version the name instead of writing a new one; (4) undo after restoring a block puts back only that block, so later edits elsewhere stay; (5) the history size is shown in the notes panel footer as «історія: N КБ/МБ» once the size is known; (6) the export box «з історією версій» is not remembered: every export starts without history. Not checked on devices by hand (section 6, item 2).

## 0. Map of changes in the code

| Place in `sheet/index.html` | What changes | PR |
|---|---|---|
| `idb.open`, `idb.run` | database version 2, the stores `versions` and `blobs` with indexes, `run(stores, mode, fn)` | 1 |
| a new module `vers` next to `db` | `hashOf`, `bodyOf`, `manifestOf`, `capture`, `after`, `write`, `last`, `thin`, `sweep`, `drop`, `bodies` | 1 |
| `markDirty`, `flushSave`, `openNote`, `writeNote` | R1 in `markDirty`, `SAVED` in `flushSave` and `openNote`, `VLAST` in `openNote`, R3 after `r.ok` in `writeNote` | 1 |
| `importNotes`, `delNote` | R2 before `Object.assign`, `vers.drop(id)` on deletion | 1 |
| `DEBUG`, `Object.assign(DEBUG,…)` | `DEBUG.vers` with the hooks of section 3.4 | 1 |
| the `.top .tools` markup, a new `#hist`, CSS `.sheet.history`, `.blk.v-ch/.v-add`, `.ghost-blk` | the button, the panel, read-only mode, highlighting | 2 |
| `markDirty`, `flushSave`, `fabSync`, `layoutBottom` | no-op in history mode; «+» and the toast while the panel is open | 2 |
| `offerUndo` | an optional duration (15 s for a restore) | 2 |
| `make`/`buildText`/`buildCode` | the «Повернути цей блок» button in history mode, rebuilding a block when `kind` changes | 3 |
| `exportAll`, `importNotes`, `storageUI` | the «з історією версій» box, the `history` field, the history size in the footer | 3 |

## 1. Starting facts

Checked against the source; the behavior is confirmed by reading the code, not by measurements.

| What | Fact | Where in the code |
|---|---|---|
| Storage | Database `sheet` version 1, one store `notes` (keyPath `id`); `idb.run(mode, fn)` opens a transaction only on `'notes'`; when IndexedDB fails, `db.save` writes to localStorage `sheet:note:<id>`, and `db.init` moves such notes back | `idb` ≈523–530, `db` ≈533–544 |
| The write path | The only path is `writeNote(n)`: the revision `REV`, `inflight`, `unsaved`, the header status only by the latest started revision; `flushSave`, 300 ms after `markDirty`, puts `serialize()` into `cur.blocks` and sets `cur.updated=now()`; on a note switch, `pagehide` and hiding the tab, at once | `markDirty` ≈676, `writeNote` ≈682–685, `flushSave` ≈686, ≈693, ≈734 |
| The block model | `serBlock`: `{id,row,text}` + `fx` on the sheet or `parent`+`col` in an area; text: `cw,ch,html` (html only with formatting, `text` always next to it); code: `kind,lang,wrap,num,cw,ch,open,title`; area: `kind,cw,ch,title,color,collapsed`; empty text blocks are not saved | `serBlock` ≈668–672, `serialize` ≈673 |
| Loading a block | `make(d,false)`: `html` and `text` are restored from `d.html` (`cleanRich`, `plainOf`); areas are created first, orphaned children go to the sheet; `make` and `resolve` do not call `markDirty` | `make` ≈825–836, `openNote` ≈695–698, `resolve` ≈811–818 |
| Title | `ttl` on input changes `cur.title` before it calls `markDirty`, so at the time of `markDirty` the old title exists only in the saved copy | ≈725 |
| Undo | A toast for one operation, 7 s (`UNDO_MS`); Ctrl+Z outside fields is the toast, in a field it is the field's own history `HIST`; the area snapshot `snapshot`/`restoreArea` takes the live blocks as they are | `offerUndo` ≈998–1000, `HIST` ≈1006–1028, ≈1035–1038 |
| Destructive actions | «Очистити аркуш» (`confirm`, then `remove` of every block), `delNote` (`confirm`, `db.remove`), import replaces a note with a newer copy `Object.assign(ex,n)`, «Видалити область» with a toast | `clearBtn` ≈1294, `delNote` ≈699, `importNotes` ≈716–719, the area menu ≈1078 |
| Read-only | The «як на компʼютері» mode: `.sheet.overview{pointer-events:none}` and `zoom`, the same blocks; a ready model for a viewing mode | CSS ≈168, `applyMode` ≈1285 |
| Export | `{app:'sheet',format:1,exported,settings,notes}`; import takes only `id,title,blocks,created,updated` and ignores unknown fields | `exportAll` ≈711, `importNotes` ≈716 |
| Debugging | `const DEBUG={failSave:false}; window.sheetDebug=DEBUG`, with `idb`, `offerUndo`, `dropUndo` also in it; `?debug=1` shows the failure switch | ≈428, ≈545 |
| Header | `.top .tools`: the status, ⚠, the counter, area, spelling, grid, theme, «Очистити»; up to 640 px the status is short (● and ✓) and the counter is hidden; hotkeys through `hotkey(e)` do not depend on the keyboard layout | markup ≈404–412, `hotkey` ≈435 |
| Tests | State reset with `localStorage.clear()` + `indexedDB.deleteDatabase('sheet')` after a pause of ≥400 ms, `✓`/`✗` lines, exit code 1; `apphistory.mjs` is already taken by the edit history of a field | `sheet/tests/README.md` |

## 2. Patterns we rely on

- **A snapshot before the first edit after a pause** (Joplin: a revision before the first edit of a note not touched for 7 days): the state before an accidental edit always exists; our threshold is not 7 days but "the saved state is not yet written as a version".
- **Snapshot interval** (Obsidian File recovery: no more often than once in 5 min, kept 7 days; Joplin: 10 min, 90 days; Craft: an hour after the edits start): versions do not multiply from autosave.
- **Merging old versions, and named versions** (Google Docs: old edits are merged to save space, named versions are not merged, up to 40 per document; Notion: a depth of 7/30/90 days depending on the plan).
- **Local history without sync** (Obsidian: snapshots in a local database, not passed between devices): our first step is the same.
- **Content addressing** (git: a blob by content hash, a tree as a list of names → hashes, a commit with a parent and a time; what did not change is stored once).
- **A restore that erases nothing** (Google Docs, Evernote: a restore creates a new version, the earlier ones stay) plus our «Скасувати» toast.
- Apple Notes and Bear 2 have no version history; for Bear it is one of the most frequent requests, which confirms the value of the feature.

## 3. Behavior contracts

### 3.1. Storage model (PR 1)

Sizes for choosing the option (strings in Chrome's IndexedDB: 2 bytes per Cyrillic character, 1 per ASCII character). A "typical" note: 20 blocks × 200 characters ≈ 20 × (400 + ~70 of overhead) ≈ 10 KB; the scenario: 30 versions a day, 3 blocks changed in each. "Code": a 5 KB block (ASCII) + 19 text blocks (~8 KB), the code edited 50 times.

| Option | Typical, 30 versions | Code 5 KB × 50 | Pros / cons |
|---|---|---|---|
| (a) full snapshots of the note | 30 × 10 = 300 KB | 50 × 13 = 650 KB | 30 lines of code; everything is duplicated |
| (b) manifest + block bodies by hash | 30 × 1.3 (manifests) + 8 + 30 × 3 × 0.42 ≈ 85 KB | 50 × 5 + 8 + 65 ≈ 320 KB (with deflate ≈ 150) | any version is read in one transaction; the "what changed" summary comes from the manifests; bodies need GC |
| (c) text deltas per block | ≈ 16 KB | ≈ 25 KB | the least space; needs a diff (diff-match-patch ≈ 45 KB) or our own; showing a version means rebuilding the chain; one damaged delta breaks everything after it |
| (d) operation log | as (c) | as (c) | does not fit contenteditable (the text is read from the DOM through `richOf`, there are no "operations"); a complex replay |

Chosen: (b). In the typical case it is 3.5 times smaller than (a); in the worst case, "a big block edited many times", it loses to (c) about 10 times but stays in the hundreds of KB, and with the rules of section 3.2, 50 edits a day give 10–12 versions (~70 KB). The implementation is ~150 lines without libraries, any version is read in O(1), and deltas and compression can be added later inside the same scheme.

Scheme (`indexedDB.open('sheet', 2)`):

```
versions  keyPath 'id'   id = 'v' + Date.now().toString(36) + 4 random characters (as for notes)
  { id, note, t, w, reason, name?, title, sig, from?, dev?, size, sum:{ch,add,del,mv,ttl}, blocks:[manifest entry…] }
  indexes: note_t ['note','t'] (the note's list by time), t (global thinning and the budget)
blobs     keyPath ['note','h']
  { note, h, s, r?, z }
```

- A manifest entry: `{id, h, row, fx | parent+col, kind?, lang?, title?, cw?, ch?, wrap?, num?, open?, color?, collapsed?}`: everything from `serBlock` except the body. `t` is the time of the content (for R1 this is the note's `updated`), `w` is the time the version was written, `reason` ∈ `base | auto | import | manual | restore | conflict`, `from` is the `id` of the version that was restored, `dev` is the device (for the future `conflict`), `sig` is the hash of the title and the manifest (to compare "did it change" without recomputing), `sum` is a summary against the note's previous version, computed on write, `size` is the bytes of the manifest plus the bodies first written by this version.
- The body: `s` = `html` if there is formatting (`r:1`), otherwise `text`; for code, the code; for an area, `s=''`. `z = new Blob([s]).size`. Moving a block, its width, `lang`, and renaming a code block or an area do not create a new body.
- The hash is synchronous, without libraries: FNV-1a 32-bit (offset 2166136261, multiplier 16777619, over UTF-16 codes) and djb2 32-bit (start 5381, `h*33 ^ c`), plus the length; the key is the three numbers in base36, concatenated, 13–16 characters. The probability of a collision with 10 000 bodies in a note is ≈ 3·10⁻¹², but we do not rely on it: before the `put` of a body, the record with the same key is read, and if it exists and its `s` differs, the body is written under the key `h~1` (`h~2`…), and the manifest gets the actual key. `crypto.subtle.digest('SHA-256')` is rejected as asynchronous, with no gain given this check.
- A sketch of the helpers (names for the code review):

```js
const hashOf=s=>{ let a=2166136261, b=5381; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); a=Math.imul(a^c,16777619); b=(Math.imul(b,33)^c)|0; }
  return (a>>>0).toString(36)+(b>>>0).toString(36)+s.length.toString(36); };
const bodyOf=d=>d.kind? (d.text||'') : (d.html||d.text||'');                       // what is hashed and put into blobs
const entryOf=d=>{ const e={...d}; delete e.text; delete e.html; e.h=hashOf(bodyOf(d)); return e; };   // a manifest entry
function manifestOf(title, blocks){ const m=blocks.map(entryOf).sort((x,y)=>x.id<y.id?-1:1); return {title, blocks:m, sig:hashOf(title+'\n'+JSON.stringify(m))}; }
```

- The threshold: a body longer than 256 KB does not go into the history: the manifest has `h:null`; when shown, the block is drawn with the caption «завеликий для історії»; on a restore, the current content of the block is taken (if there is no such block, it is skipped, and the toast says «1 блок пропущено»).
- `idb.run(stores, mode, fn)` takes a list of stores and passes the transaction on; existing calls pass `'notes'`. `onupgradeneeded` creates `versions` with its indexes and `blobs`; `notes` is not touched. An old tab with version 1 code gets a `VersionError` on open after the database upgrade: its `db.save` goes to localStorage, and the move back on the next start already exists. Tests reset the database with `deleteDatabase('sheet')` as before.
- Not now, and without a change of the scheme: a delta body for `s` > 2 KB (a common prefix and suffix with the previous body of the same `id`, `{b:h0,p,q,m}`, a chain ≤ 10) and `CompressionStream('deflate-raw')` (Chrome 80+, Safari 16.4+, Firefox 113+; code compresses ~3×).

### 3.2. When a version is created (PR 1)

All versions are saved states. Constants: `V_GAP = 5 min`, the time through `vnow() = Date.now() + DEBUG.vers.clock`. In memory: `SAVED: noteId → {title, blocks, updated}`: the last state flushed into the note object (set in `openNote` from the loaded note and in `flushSave` after `cur.blocks=serialize()`); `VLAST: noteId → {id, t, w, sig}`: the note's latest version, read in `openNote` with a cursor backwards over `note_t`; the writes of one note go through a promise queue `VQ`, so that R1 does not overtake the loading of `VLAST` and two versions are not written interleaved.

- **R1 «перед правкою»**: `markDirty()` calls `vers.capture(cur.id, SAVED.get(cur.id), 'base')`: if `SAVED` exists and its `sig` ≠ `VLAST.sig`, a version is written with `t = SAVED.updated`, `w = vnow()`. This protects the password: the state before an accidental edit is written before autosave overwrites the note 300 ms later. Along the way it covers «Очистити аркуш», deleting a block and an area, ungrouping and restoring: all of them go through `markDirty`. `capture` needs the copy of the title from `SAVED`, not `cur.title` (the fact about `ttl` in section 1).
- **R2 "before an overwrite from outside"**: `importNotes` calls `vers.capture(ex.id, {title:ex.title, blocks:ex.blocks, updated:ex.updated}, 'import')` before `Object.assign(ex,n)` and waits for it; a future merge in sync is `conflict` with `dev`.
- **R3 «інтервал»**: in `writeNote` after `r.ok` (and only if `REV.get(n.id)===rev`), `vers.after(n)`: the manifest of the current state; if `sig` matches `VLAST.sig`, nothing; if `vnow() − w0 < V_GAP`, where `w0 = VLAST.w`, or `n.created` when there are no versions, nothing; otherwise an `auto` version with `t = n.updated`. It counts from `w`, not from `t`: otherwise, 300 ms after an R1 version, a version of a single keystroke would appear.
- **R4 «вручну»** (PR 3): «Зафіксувати версію…» → `flushSave()` → `capture(cur.id, {title:cur.title, blocks:cur.blocks, updated:cur.updated}, 'manual', name)`, ignoring the interval and `sig` (two identical named versions are allowed).
- **R5 «відновлення»**: a restore of a note or a block writes a `restore` version with `from` right after its `flushSave`, ignoring the interval; the state before the restore was written by R1.
- The conditions of R1 and R3, one line each (a sketch):

```js
async function capture(id, st, reason, name, from){ if(!st) return; const m=manifestOf(st.title, st.blocks); const L=VLAST.get(id);
  if(reason!=='manual' && L && L.sig===m.sig) return; await write(id, m, {t:st.updated, w:vnow(), reason, name, from}); }          // R1, R2, R4, R5
async function after(n){ const m=manifestOf(n.title, n.blocks), L=VLAST.get(n.id); if(L && L.sig===m.sig) return;
  if(vnow()-(L? L.w : n.created) < V_GAP) return; await write(n.id, m, {t:n.updated, w:vnow(), reason:'auto'}); }                    // R3
```

- The end of a session creates no version: the last state is the note itself («Зараз»), and R1 writes it on the next edit with the right `t`. Deleting a note (`delNote`) deletes its versions and bodies.
- A volume estimate: 8 hours of continuous editing of one note ≤ 96 versions ≈ 2.5 KB each ≈ 240 KB a day; after thinning, 8 versions a day.

### 3.3. Thinning, budget, GC (PR 1)

- A ladder by age relative to `tMax = max(vnow(), t of the newest version)` (the clock may have gone back): younger than 24 h, everything; 24 h–7 d, the last one of each hour; 7–90 d, the last one of each day; older than 90 d, deleted. Versions with a `name` and the note's newest version are never deleted.
- The bucket key: the age `a = tMax − t`; `a < 24 h` → every version has a bucket of its own; `a < 7 d` → the local hour `Math.floor(loc/3600000)`; `a < 90 d` → the local day `Math.floor(loc/86400000)`, where `loc = t − getTimezoneOffset(t) × 60000` (the owner's decision of 2026-10-08: days and hours are local, as «Історія» shows them, not UTC; in Kyiv a UTC day started at 02:00/03:00); older → the "delete" bucket. In each bucket the version with the largest `t` stays, and the others without a `name` are deleted; the pass goes from the newest to the oldest over the `note_t` index.
- The per-note limit: 300 versions; the extra ones are the oldest without a `name`. The overall budget: `min(20 MB, 0.05 × quota)` from `navigator.storage.estimate()` (without `estimate`, 20 MB); the sum of `size` is kept in memory and recounted at start with a cursor over the `t` index in `requestIdleCallback` (a fallback `setTimeout` of 3 s). When it is exceeded, the oldest versions without a `name` are deleted, except the newest of each note, down to 90 % of the budget.
- When it runs: for a note, after every write of its version; globally, once a day at start (`S.versSwept` in the settings).
- Body GC after any deletion of a note's versions: the set of `h` from the remaining versions, then a cursor over `blobs` in the range `IDBKeyRange.bound([note,''],[note,'￿'])` deletes the bodies outside the set. A note's bodies are not shared with the versions of other notes, so GC does not touch anything else.

### 3.4. The write path and failures (PR 1)

- `vers.write(note, manifest, meta)`: one readwrite transaction over `['versions','blobs']`: for each manifest entry, `get [note,h]` → a collision check → `put` if missing; then the `put` of the version; `VLAST` is updated on `oncomplete`. Deliberately not in one transaction with the note: a quota failure in `blobs` must not roll back the note's write.
- An error writing a version is swallowed: `unsaved` and the «Збережено» status are not touched, `DEBUG.vers.errors++`, and with `?debug=1` a `console.warn`; after a `QuotaExceededError` the global thinning runs once, and the write is retried on the next save of the note. A version never blocks `writeNote`, and `beforeunload` does not wait for it.
- Debug hooks in `window.sheetDebug.vers` (like `DEBUG.failSave`): `force(reason, name)`: write a version of the current note, bypassing the interval; `clock`: the shift of `vnow()` in ms; `estimate`: a substitute answer of `navigator.storage.estimate()`; `fail`: every version write ends with an error; `errors`: the counter; `list(noteId)` and `thin(noteId)`, `sweep()`: reading and forced thinning for tests. Tests read `versions`/`blobs` directly through `indexedDB.open('sheet')`, like `idbAll` in `appstore.mjs`.

### 3.5. The «Історія» panel: viewing (PR 2)

- Entry: the `#histBtn` button «Історія версій» (a clock icon with an arrow) in `.top .tools` before «Очистити»; Ctrl+Alt+H through `hotkey` (like Ctrl+Alt+N). On a phone, the same icon; when the header «⋯» menu appears (MOBILE-PLAN 3.6), the «Історія версій» item is duplicated there; the system Back closes the panel through the `nav` module (3.8), and before that, Esc and «✕».
- The `#hist` panel (`role="complementary"`, `aria-label="Історія версій"`): on a computer a 300 px column right of the sheet, and the sheet narrows; on a screen up to 640 px, a bottom sheet 40 % of the window high with a handle, and the note's sheet scrolls above it. The header: «Історія версій», «✕»; the buttons «Відновити цю версію» (active when a version is chosen) and, in PR 3, «Зафіксувати версію…».
- Identifiers for styles and tests (fixed in PR 2 and not changed after): `#histBtn` (`aria-pressed`), `#hist`, `#histClose`, `#histRestore`, `#histRange` (only up to 640 px), `#histList` with `.hv` rows (`data-id` of the version, `.hv-t` the time, `.hv-k` the kind, `.hv-s` the summary, `.cur` on the chosen one, `.named` on named ones), `#histNow`: the «Зараз» row; PR 3 adds `#histName`, `#histSave`, `#histClear`, `#histQ`, `.vbtn` on a block. The state of the mode is `sheet.classList.contains('history')`; `DEBUG.vers.view` holds the `id` of the shown version or `null`.
- The list (`role="listbox"`): the first row is «Зараз» (the current state), below it the versions by descending `t`, in the groups «Сьогодні», «Вчора», then the date by `fmtDate`; a row: the time, the kind («автоматично», «перед правкою», «перед імпортом», «відновлено з 10:02», «● Назва» for named ones), the summary from `sum` through `pl`: «змінено 3 блоки, видалено 1», «додано 2 блоки», «переміщено 1 блок», «назву змінено». The «Зараз» row has a summary against the newest version, computed from the live blocks when the panel opens. The list volume: manifests are not needed, only the row fields are read; the note's bodies are read with one `getAll` over a range and cached while the panel is open.
- Showing a version: the chosen row → `showVersion(v)`: the live elements are taken off the sheet, and blocks are created from the manifest and the bodies by the same `make(d,false)` (areas first), `resolve(); update()`; `sheet.classList.add('history')` gives `pointer-events:none` like `.overview` and hides the handles and «+»; `ttl` shows the version's title and is not editable; `document.title` does not change. While in the mode, `markDirty` and `flushSave` are no-ops (insurance: `make`/`resolve` do not call them now, but no future path may write a version over the note). Leaving («Зараз», Esc, «✕», going to another note): `openNote(cur)` redraws the live note.
- Highlighting against «Зараз»: `.blk.v-ch`, a bar on the left in the warning color: the body or the title differs; `.blk.v-add`, green: the block is not there now and comes back on a restore; `.ghost-blk`, a grey dashed outline at the current coordinates: blocks that did not exist yet in the version and disappear on a full restore (if it does not fit in PR 2, then in PR 3). Moved blocks are not highlighted, they are only in the summary. The colors are checked on the three themes and on the colored backgrounds of areas.
- Switching: ↑/↓ in the list change the choice and redraw the sheet (an 80 ms delay), Home/End go to the ends, Space toggles version ↔ «Зараз» to compare in place, Esc closes. On a phone there is an `input[type=range]` slider above the list (`aria-valuetext` = the version's time) to turn through versions with a finger; a tap on a row chooses it. No side-by-side: two sheets do not fit on a canvas with absolute coordinates, and switching "before/after" in place shows more.
- Search in versions (PR 3): the field «Шукати у версіях…» above the list, a 120 ms delay like `#q`, comparison through `norm`; the versions whose bodies contain the query stay, and the matching blocks get `.v-hit`.

### 3.6. Restoring a note and a block, the toast (the note in PR 2, the block in PR 3)

- Restoring a note: «Відновити цю версію» → `flushSave()` → R1 for the current state (if it is not a version yet) → a copy `prev` of the current state in memory → the blocks and the title are replaced with the content of the version (as in `openNote`), `markDirty()`, `flushSave()` → a `restore` version with `from`. The toast `offerUndo('Нотатку відновлено до версії 10:02', …)`; undo brings back `prev` the same way. The toast has no timer, as 3.6 plans for deletions with content; until 3.6 is implemented, `offerUndo(msg, restore, 15000)` (a third, optional parameter instead of `UNDO_MS`), which is enough because the state before the restore is a version too. The caption in the panel after a restore: «Попередній стан збережено як версію».
- Restoring a block: in history mode a block with `.v-ch` or `.v-add` has a «Повернути цей блок» button (`pointer-events:auto` only on it; on a computer on hover, on touch a tap on the block shows the same button in a mini panel like `#blockbar`). The action: leave history mode, then in the live note the block with the same `id` gets the body, `kind`, `lang` and `title` of the version (the position and size do not change; a change of `kind` is a rebuild, like `toCode`/`toText`); a deleted block is created at the version's coordinates (in its area if the area is alive, otherwise on the sheet by the orphan rule) and pushed apart by `resolve`; `markDirty()`, a `restore` version with `from` and `sum:{ch:1}` or `{add:1}`; the toast «Блок повернуто з версії 10:02 · Скасувати» brings back the previous body or removes the created block.
- Neither restore erases later edits of other blocks (for the block restore) or touches other notes; `unsaved` and the status behave as on an ordinary edit.

### 3.7. «Зафіксувати версію», «Очистити історію», size (PR 3)

- «Зафіксувати версію…»: in the panel header; the field «Назва версії» and «Зберегти» right in the panel (no `prompt`); a `manual` version is written by R4; the row shows as «● Назва» and is not thinned.
- «Очистити історію нотатки» in the panel footer: `confirm('Видалити всі версії нотатки «…»? Поточний текст залишиться.')` → the note's versions and bodies are deleted in one transaction, and `VLAST` is reset. It is needed for passwords, which otherwise live in the history for 90 days.
- In the notes panel footer the `storInfo` row gets «· історія: 3,2 МБ» from the sum of `size`.

### 3.8. Interaction with other parts

- The edit history in fields (`HIST`) and the planned stack of structural operations (3.6) are in memory, precise to a keystroke, until a reload. Versions are on disk, a step of ≥ 5 min, 90 days. The layers do not overlap: a restore from the history is an ordinary operation that the toast (and later the stack) can undo; Ctrl+Z in a field still goes to `HIST`. A side benefit: 3.6 promises recovery «до перезавантаження», and R1 makes a deleted area available after a reload too.
- Export and import: `format:1` does not change; with the «з історією версій» box (off by default) the file gets `history:{versions, blobs}`; import merges versions by `id` and bodies by `[note,h]`; an old import ignores the unknown field. An ordinary export does not grow.
- Firestore (SYNC-PLAN): versions stay local on the device. The manifest refers to the same block `id`s as the `blocks` map with `u`; a proposal for §4 of SYNC-PLAN: write the copies that lose in a merge as a `conflict` version with `dev`, not as a «конфлікт з телефону» block on the canvas. Syncing history comes later: named versions and bodies in `notes/{id}/versions` and `blobs` (≤ 1 MB per document), the TTL the smallest among the devices (Joplin's lesson); with encryption, bodies are encrypted like notes.
- Quota: `persistOnce()` is already called after the first save; the history budget is separate (3.3); on iOS without the PWA installed, storage may be wiped after 7 days without use: the same risk as for notes.
- The «Скасувати» toast and «+» on a phone: the history panel hides the toast and «+» (like the open notes panel in `fabSync`); a restore from the panel closes the panel, then shows the toast.

### 3.9. Interface texts (Ukrainian, as in the app)

| Where | Text |
|---|---|
| The header button, `title` | «Історія версій (Ctrl+Alt+H)» |
| Panel | «Історія версій», «Зараз», «Відновити цю версію», «Зафіксувати версію…», «Назва версії», «Зберегти», «Очистити історію нотатки», «Шукати у версіях…», «Поки версій немає» |
| Version kind | «автоматично», «перед правкою», «перед імпортом», «відновлено з 10:02», «конфлікт з телефону» (future), a named one: «● Назва» |
| Summary | «змінено N», «додано N», «видалено N», «переміщено N» with `pl(N,'блок','блоки','блоків')`; «назву змінено»; «без змін» on the «Зараз» row when it matches the newest version |
| Date groups | «Сьогодні», «Вчора», then `fmtDate` («28 вер.», with another year «28 вер. 2025 р.») |
| Block | «Повернути цей блок», the caption «завеликий для історії» |
| Toasts | «Нотатку відновлено до версії 10:02», «Блок повернуто з версії 10:02», the «Скасувати» button as it is; the caption in the panel «Попередній стан збережено як версію» |
| Confirmations | «Видалити всі версії нотатки «…»? Поточний текст залишиться.» |
| Notes panel footer | «… · історія: 3,2 МБ»; the export box «з історією версій» |

## 4. PR order and scope

| PR | Content | Tests | Ready when | Estimate |
|---|---|---|---|---|
| 1 | 3.1 database v2, `idb.run` with a list of stores, the `vers` module (a hash with collision checks, the manifest, `sig`, `sum`, `write`), 3.2 R1–R3 and the R5 hook, `SAVED`/`VLAST`/`VQ`, 3.3 thinning, budget, GC, `delNote`, 3.4 failures and `DEBUG.vers`; no interface | a new `appversions.mjs`: the first edit creates `base` with `t = updated` and a `sig` ≠ the current one; 10 edits in a minute give one version; `clock` +5 min and an edit → `auto`; moving a block with the mouse does not increase the number of bodies; renaming a code block creates no body; importing a newer copy writes `import`; `delNote` cleans `versions` and `blobs`; 200 synthetic versions with dates → after `thin` the number expected by the ladder, the named one intact; `estimate` = 1 MB → old `auto` versions deleted down to 90 %, the newest of each note intact; `fail=true` → «Збережено» and `unsaved` as usual, `errors` grows; the `VersionError` of an old tab cannot be reproduced in Playwright and is checked by reading the code; regression of `appstore`, `appsave` | All scenarios pass; on the live page, after the database upgrade the notes are in place, `versions`/`blobs` appear after an edit, the export is unchanged | 6–8 h |
| 2 | 3.5 the button, the panel, the list, showing a version, highlighting, ↑/↓, Space, the slider, the bottom sheet on a phone; 3.6 restoring a note with a toast; 3.8 hiding the toast and «+» | a new `appversions2.mjs`: after three versions (through `force`) the panel shows «Зараз» and three rows with summaries; choosing a row draws the version's blocks, and typing on the keyboard and clicks on the sheet change nothing (`notes` in IndexedDB and `versions.count` are the same); the `.v-ch`/`.v-add` classes are on the right blocks; ↑/↓ change the choice; Space shows «Зараз»; «Відновити цю версію» → the text is replaced, there is a `restore` with `from`, the earlier versions are intact, «Скасувати» brings it back; 390×844 with `hover:none`: the bottom sheet, the slider through CDP touches; 320×568 and a low window; regression of `appundo`, `appkb` | The panel opens on a computer and a phone, a version reads with highlighting, a restore can be undone; behavior on a computer outside the panel did not change | 10–14 h of code and tests, 2 h on devices |
| 3 | 3.6 restoring a block; 3.7 «Зафіксувати версію…», «Очистити історію нотатки», the history size in the footer; 3.5 search in versions; 3.8 export with history by a box; `.ghost-blk` if it did not get into PR 2 | a new `appversions3.mjs`: restoring a block changes only its body, the neighbours and `row`/`fx` stay, there is a `restore` with `sum.ch=1`, «Скасувати» brings it back; a deleted block returns into its area; a named version survives `thin` and the budget; «Очистити історію» deletes the versions and bodies of this note only; search keeps the right versions and marks the block; an export without the box has no `history`, and with the box an import into a clean profile restores the list | The owner's password scenario passes by hand per section 6 on a computer and a phone | 6–8 h, 1 h on devices |

Each PR can be merged on its own, passes all scenarios and does not change behavior on a computer outside the panel; publishing after each: a PR into `main`, GitHub Pages, a check of the live page with `curl` for a version marker. The PR description records what passed, what failed and what was not run, with the versions of the devices and browsers.

## 5. Test matrix and acceptance

Automatically (Playwright, Chromium): a computer at 1280×900; a phone at 390×844 and 320×568 with `hover:none`, `pointer:coarse`, touches through CDP; the time substituted through `DEBUG.vers.clock`, the quota through `DEBUG.vers.estimate`, a failure through `DEBUG.vers.fail`; `versions` and `blobs` read directly from IndexedDB. Each scenario is a separate file `appversions*.mjs`, with a state reset by `localStorage.clear()` + `indexedDB.deleteDatabase('sheet')` after a pause of ≥400 ms, `✓`/`✗` lines, exit code 1 on an error, screenshots in `<tmpdir>/sheet-tests/`; CI runs them together with the rest.

Conventions for the `appversions*.mjs` scenarios:

- A helper `idbAll(store)` modelled on `idbAll` from `appundo.mjs`, but with a store name; `vers(noteId)`: the note's versions by `note_t`, sorted by `t`; `bodies(noteId)`: the bodies by key range.
- A version is written after autosave, so before reading `versions` wait ≥500 ms after the last edit (the 300 ms flush + the transaction); for R1, do not read right after the first keystroke: wait the same pause.
- Time is shifted only through `sheetDebug.vers.clock` (ms), not through `page.clock`: `Date.now()` in `updated` and in the note list must stay real.
- Versions "from the past" for thinning are created through `sheetDebug.vers.force('auto')` at different `clock` values (negative values go into the past), then `sheetDebug.vers.thin(id)`; the expected number of versions is computed in the scenario itself by the ladder of 3.3 from the same dates.
- Touches on the phone go through CDP (`Input.dispatchTouchEvent`), as in `apptouch.mjs`; the slider is moved with `page.keyboard` (←/→) after focusing it, so as not to depend on coordinates.
- Screenshots: `appversions2-panel.png`, `appversions2-phone.png` in `<tmpdir>/sheet-tests/`, like the others.

On devices, by hand, with the versions recorded in the PR description: Android Chrome, iPhone Safari, the installed PWA on both: the bottom sheet and the slider with a finger, a block restore by touch, Back (after 3.8), rotation, 200 % text, opening the panel for a note with 300 versions (expected: up to 300 ms), TalkBack and VoiceOver over the list and the buttons.

Acceptance of PR 1: after the live page updates, the notes are in place; an edit creates a `base` version with the time of the previous save; a series of edits within a minute does not multiply versions; after 5 minutes an edit gives `auto`; `?debug=1` with `DEBUG.vers.fail=true` does not change the «Збережено» status; the export is unchanged; `delNote` leaves no bodies.

Acceptance of PR 2: the password scenario of section 6 passes with a restore of the whole note; in history mode neither typing, nor touches, nor «+» change anything; undoing the restore brings everything back, the title included; at 320 px the panel and the buttons fit, and the toast is visible.

Acceptance of PR 3: the password scenario passes with a restore of one block, and the neighbouring blocks and their edits are intact; a named version does not disappear after thinning or with a small budget; «Очистити історію» clears only its own note; an export with history imports into a clean profile.

## 6. How the reviewer checks by hand

1. **Password (after PR 2, restoring the note).** Create a note «Доступи» with three blocks, one of them «пароль: Qw3rty!», leave the block, wait 1 s (the write). Reload the page (a new session). Put the caret into the block with the password, erase the password and type «ууу», leave the block, wait 1 s. Open «Історія» (the button in the header or Ctrl+Alt+H). Expected: the rows «Зараз · змінено 1 блок» and «<time of the previous save> · перед правкою». Choose the second: the old password is on the sheet, the block is highlighted on the left, the sheet is not editable, «+» is hidden. Press «Відновити цю версію»: the note with the right password, the toast «Нотатку відновлено до версії … · Скасувати», a row «відновлено з …» appears in the list, and the spoiled version also stays in the list. Press «Скасувати»: «ууу» again. Restore again: the password is back.
2. **Password (after PR 3, restoring a block).** The same path, but before the restore add the word «нове» to another block (R1 writes one more version). In the history choose the version from before the password was spoiled, hover over the highlighted block (on a phone, tap it) → «Повернути цей блок». Expected: the old password, the word «нове» in the neighbouring block is intact, the toast «Блок повернуто з версії …».
3. **Interval (after PR 1).** In one note, type with pauses 10 times within a minute, then run `sheetDebug.vers.list(<id>)` in the console. Expected: one `base` version. Run `sheetDebug.vers.clock = 5*60*1000` and type more: an `auto` version appears.
4. **Budget (after PR 1).** `sheetDebug.vers.estimate = {usage:0, quota: 20*1024*1024}` (a 1 MB budget), paste 200 KB of text into a code block, make six versions with changes through `sheetDebug.vers.force('auto')`, call `sheetDebug.vers.sweep()`. Expected: the old `auto` versions are deleted, the newest is in place, the named one (`force('manual','Реліз')`) is in place, and the size in the footer went down.
5. **Failure (after PR 1).** `?debug=1`, `sheetDebug.vers.fail = true`, type some text. Expected: «Збережено» as usual, no ⚠ in the panel, `sheetDebug.vers.errors` grows; turn it off: the next edit writes a version.
6. **Phone (after PR 2).** Open the history: the bottom sheet, the slider; move the slider: the sheet above the panel redraws; Back (after 3.8) or «✕» closes it; with the panel open, «+» and the toast do not stick out from under it.
7. **The old behavior.** Repeat the `appundo` scenario by hand: delete an area with blocks, «Скасувати»: it is back; Ctrl+Z in text works as before; the export still has no `history` field.

## 7. Out of scope

- Syncing the history between devices, and a trash for deleted notes (separate tasks after step 3 of SYNC-PLAN).
- A diff inside a block (highlighting words) and a side-by-side comparison; deltas and compression of bodies (3.1, "not now").
- Co-editing, history over several notes at once, "the history of this block" as a separate screen (cheap to do as a filter of the list, but not in these PRs).
- A change of the export format `format:1`; history in an ordinary export.

## 8. Open questions for the owner and proposed defaults

1. The R3 interval: 5 min is proposed (Obsidian); the alternatives are 2 min (more versions, more space) and 10 min (Joplin). One constant, `V_GAP`.
2. Retention: 24 h everything → 7 days one per hour → 90 days one per day → deletion; named ones forever. The alternative: never delete the daily versions (at ~2.5 KB per version this is ≤ 1 MB a year per active note).
3. Budget: `min(20 MB, 5 % of the quota)` and 300 versions per note; when it is exceeded, the oldest without a name are deleted. Show the history size in the footer: yes.
4. Named versions: PR 3 is proposed (the write is cheap, the interface needs a field in the panel); if they are needed earlier, a field in PR 2.
5. Where «Історія» goes: a button in the header at every width; at 320 px check that `.tools` does not overflow (a phone now has five 44 px buttons there); if it is tight, an item in the header «⋯» menu that MOBILE-PLAN 3.6 plans, and the header keeps the button only on a computer.
6. «Очистити історію»: only for the current note (in the panel). A general clearing in the notes panel footer is optional, as one button «Очистити всю історію».
7. The versions of a deleted note are deleted with it (as decided in MOBILE-PLAN 8.2: no trash); the alternative is to keep them for 7 days as a cheap trash.
8. The toast after a restore: no timer (as in 3.6) or 15 s; until the 3.6 stack is implemented, 15 s is proposed.

## 9. Acceptance checklist

- [ ] 1: the database is upgraded to version 2 without losing notes; `versions` and `blobs` are created; old bodies are not duplicated on moving and renaming.
- [ ] 1: R1 writes the state before the first edit with the time of the previous save; R3 no more often than once in 5 min; import writes `import`; `delNote` cleans up everything of its own.
- [ ] 1: the thinning ladder, the per-note limit, the budget and GC are confirmed by the scenario and by hand; named and newest versions are intact.
- [ ] 1: a failed version write does not affect the save status, `unsaved` or `beforeunload`; `DEBUG.vers` works.
- [ ] 2: the panel on a computer and a phone; the list with summaries; the version on the canvas, read-only, with highlighting on the three themes.
- [ ] 2: ↑/↓, Space, Esc, the slider on touch; the toast and «+» do not stick out.
- [ ] 2: restoring a note can be undone with the toast and becomes a version itself; the password scenario passes.
- [ ] 3: restoring a block does not touch the neighbours; named versions; «Очистити історію»; search; export with history by a box.
- [ ] Each PR: Android Chrome and iPhone Safari, the installed PWAs; versions recorded.
- [ ] Each PR: all regression scenarios and the new ones pass in CI; what passed, what failed and what was not run is recorded.
- [ ] Each PR: the export without the box and the behavior on a computer outside the panel did not change; the document and the actual contract match.
