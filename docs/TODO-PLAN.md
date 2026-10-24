# To-do lists

**Status: plan, awaiting the owner's approval (2026-10-20); revised after four review rounds; amended on 2026-10-23 for Claude access (§12, since 2026-10-24 the boundary with `docs/MCP-PLAN.md`), the release with sync and the modules of T1 (§6.19); eight review rounds in all, the last two found no blocker or major issue; on 2026-10-24 rebased onto `main` and aligned with what landed since (the build marker and update path, the quarantine re-check, sync PR 4a's versions, the IndexedDB barrier, script hashes, soft note fields, the list action mode), then reviewed again in three rounds; the last found no blocker or major issue.** Nothing is implemented yet. Three PRs: T0 (blocks and fields of an unknown kind survive older code), T1 (the to-do block, merging by task, and the «Списки справ» section of the panel), T2 (clearing done tasks, reordering). **T0 goes to production with the sync release: sync PR 4 → T0 → one `main → prod` release that brings sync and T0 together → every device runs it → T1 into `main`.** **A hard prerequisite of T1:** the IndexedDB barrier's PR 2 (`FORMAT`, `docs/IDB-BARRIER-PLAN.md`) is in `main` before T1, and in production at least one release before T1's release. The place of this plan in the project's order of stages is in `CLAUDE.md` («Roadmap»).

The mockups: the block, https://claude.ai/artifact/4ffsUSXw6kACznGR3RvNKA; the side panel, https://claude.ai/artifact/QuLRJVtVgmxf5dn4capNa4. Where this document and a mockup differ, this document wins (the block mockup still allows Ctrl+B in a task, which T1 does not have, §2).

## 1. Goal

- A to-do list on the sheet, next to text, code and areas: tick a task off, see when it was done, look back at what was done.
- Every task can carry a short comment that stays out of the way.
- All the lists of all notes in one place in the panel.
- Nothing is lost: not across devices or tabs with different versions of the app, not in versions, export, import, undo or sync.

## 2. Owner's decisions (2026-10-20)

| Question | Decision |
|---|---|
| What it is | A block of its own, `kind: 'todo'`, «Список справ» / «To-do list»: a card like a code block or an area, not a third kind of list (`ul`/`ol`) inside a text block. Every task has its own fields (done time, comment, creation time); in the html of a text block they would be attributes of lines that `cleanRich` drops, hiding rows inside one contenteditable is fragile, and versions and merging work by block. |
| Where a list lives | Inside an ordinary note, next to its text, as many lists as wanted. There is no special kind of note or sheet for tasks. |
| A task | A record: id, plain text, `done` (the time it was done; absent while not done), a comment (plain text, may have several lines), the creation time. |
| Formatting and `[[` links inside tasks | Later, as a separate step after T2 (§11). T1 and T2 tasks are plain text. |
| Creating | The header button is «Новий список» with a plus, so it reads as «make a new one», not «show the lists»; the same item in the phone «⋯»; `[] ` at the start of an empty text block. |
| Keys | Enter at the end of a task opens an empty line below it; the line becomes a task only when something is typed, and disappears when left empty; no empty task is ever saved or counted. Backspace in an empty task deletes it. Ctrl+Enter ticks, Shift+Enter opens the comment. |
| Ticking off | The task is struck through and grey, the done date shows on the right («20 жовт.»), the exact time in a tooltip. Unticking removes the date. |
| Views | A switcher in the card header: **Активні · Виконані · Усі**, «Активні» by default, kept in the block (it follows the list to every device). «Активні»: a ticked task leaves after two seconds, so a stray tick can be undone. «Виконані»: newest first, grouped by day («Сьогодні», «Вчора», «15 жовтня»). «Усі»: everything in order, done tasks struck through with their date. |
| Header | An optional title and a counter «3 з 8»: done of all. |
| Comment | Hidden. A small icon in the row only when there is a comment. The text pops up on hover on a computer and on a tap on a phone; a click edits it. Adding one: a faint icon on hovering the row, Shift+Enter, and an item of the task's menu on a phone. |
| Archive | None of its own: «Виконані» is the archive. What is not needed is deleted: with the cross of a task (with undo), or «⋯» of the block → «Видалити виконані» (all, or older than 30 days), with `ask()` and undo (T2). The note's version history keeps what was deleted anyway. |
| Search and preview | Search finds the text of tasks and comments. The preview in the note list shows tasks. |
| Claude (2026-10-23) | Later the owner talks to Claude, mostly from the phone and also from Claude Desktop and Claude Code: «which tasks are still open in <any list or project>», «find today's list», «mark this task done and write the result in its comment». Claude's changes apply at once. A project is whatever the owner calls it: Claude finds the list by its title, the note's title or the text; no project field. T1 stores tasks so that this needs no migration (§12). |
| The side panel | In T1. A note with lists shows a count after its date («4 з 8»). A row «Списки справ · N» next to «Архів» and «Кошик» opens a section with every list of every note; a click opens the note at that list. Ticking tasks from the section: not now. |

**Changed against the step list the owner saw first:** merging by task moves from T2 into T1. Without it, a tick that arrives from the phone while the caret is in the same list on the computer makes a conflict copy of the note on the next keystroke (the editor merges its screen over the moved record with `merge3`, `editorDelta` in `index.html`), which is ordinary live use, not a rare offline case. T2 keeps «Видалити виконані» and reordering.

## 3. Data

### 3.1 The block

```
{ id, row, fx | parent+col, cw?,          the «place» fields every block has; the height follows the tasks (no `ch`)
  kind: 'todo',
  title?: string,                          optional, up to 2000 characters, like the title of a code block
  view?: string,                           'done' | 'all'; absent = 'active'; an unknown value is kept and shown as «Активні»
  items: [ task, … ],                      the tasks in their order (the order of «Активні» and «Усі»)
  text: string }                           a plain copy of the tasks for code that does not know the block (§3.3)
```

- A list may have no tasks (just made, or every task deleted): `items: []`, `text: ''`. It is saved like a code block with no code: `serialize()` keeps every block that has a `kind`.
- No `ch`: the card's height is the number of shown rows in whole grid rows, measured from the card like a code card (`b.lines`).

### 3.2 A task

```
{ id: string,          [\w-]{1,64}, the alphabet of note ids and of links: 't' + time in base 36 + 4 random characters, like block
                       ids, regenerated until it is unique in the block (a paste makes thousands in one millisecond); the
                       normalizer renames duplicates within the same alphabet (§3.6)
  text: string,        one line, no line breaks
  done?: number,       ms, positive; absent while not done
  comment?: string,    plain text, may have line breaks; absent when empty
  created: number,     ms, positive
  changed?: number,    ms: the last change of the text, `done` or `comment`; absent on a task never changed after it was made
  by?: {dev, dn},      who made that last change
  doneBy?: {dev, dn} } who ticked it; set together with `done`, dropped with it
```

- **An author** is `{dev, dn}`: `dev` the device id (`devId`, `[\w-]{1,40}`, as `dev` in SYNC-PLAN §4.2), the identity; `dn` the device's name at that moment (up to 80), for display only, since names repeat (`uaName()` gives two phones of one model the same name) and can be changed. Claude has the reserved device id `claude` (§12); the code checks the id, never the name, and a device of the owner can never get that id (`devId` always starts with `d`).
- **`changed`, `by` and `doneBy`** are for the history of a task: «what changed since last week», «did Claude close this, or did I». The done date's tooltip names `doneBy` (§6.4). The editor sets `changed` and `by` on every change of the text, `done` or `comment`, and `doneBy` with every tick; a change of order or of the block does not touch them. Undo and «Відновити блок» are changes too: they set `changed`/`by` to now and this device, and restore `doneBy` together with `done`.

- **Optional fields are never written empty** by the editor: no `comment: ''`, no `done: 0` or `null`. The canonical form drops them anyway (§3.6), so a hand-edited file and the editor give one hash.
- **The editor never saves a bare empty task** (§6.3). The normalizer accepts `text: ''` (it checks shapes, it does not enforce editor rules), so a file or a later version with one is not refused.
- **Unknown fields of a task are kept**, as T0 keeps those of a block: a later version may add fields (formatting, a due date), and T1 must not strip them. A task is edited as `{...task, text}`, never rebuilt from the known fields. A later field that has to change together with the text (a later `html`) ships only after code that keeps it in step is on every device (§11).
- **Limits**, the same in the normalizer and the editor: up to 5000 tasks per block, task text up to 10 000 characters, a comment up to 10 000. The editor refuses to go past a limit with the toast «Досягнуто ліміту». The size of the whole note is still `DOC_MAX` (960 KiB) with its existing mark.

### 3.3 `text` of the block

- One line per task, in the order of `items`: `☐ task` for an open task, `☑ task` for a done one; no title, no comments. Built by one function in `sync.js`, `todoText(items)`, used by `serBlock` and by the merge (§6.13), so every device builds the same string.
- `text` is for code that does not know the block: T0's placeholder shows it, and T0's search, previews and block names see the tasks as plain lines. T1 never reads it back. The normalizer does not compare it with `items`; T1 rebuilds it on every save and after every merge.
- The cost: a list of short tasks takes about twice its text. A note at the size limit is reached at roughly 4000 tasks of 100 characters; the existing «завелика» mark covers it.

### 3.4 The view

- `view` is in the block and synced. In the merge it is **a group of its own**: when both sides changed it, the side with the larger key wins and nothing is marked lost, so a view switch never makes a conflict copy, not against another switch, not against a move or a content change (§6.13).
- A view switch is not a version change: the version body leaves `view` out (§3.5), so «Історія» shows no empty change. `restoreBlock` keeps the block's current `view`, like its place.
- `BLOCK_DEFAULTS` gains `view: 'active'`, so a block without the field and one with `'active'` have one canonical form.
- A switch is saved like any edit (`markDirty`). Every save sets `updated` (`flushSave`), and `updated` is the per-device monotonic clock that the merge key relies on (SYNC-PLAN §4.4), so a switch moves the note up the list, as folding an area does today.

### 3.5 Versions

- A block of a kind outside `text`, `code` and `area` (so `todo`, and any later kind) keeps in its manifest entry only `id`, `kind` and the place fields (`row`, `fx`, `parent`, `col`, `cw`, `ch`, `collapsed`); everything else (`title`, `items`, `text` and any unknown field), minus `view`, is its **body**: `bodyOf(d)` = the canonical JSON of those fields. `verBlocks` parses it back. This is T0's rule (§5.3), so a T0 device restores a T1 version whole.
- So the body hash covers every tick and comment (the history's «changed» mark and `sumOf` just compare `h`, as for other blocks), version records share bodies through `blobs`, and `V_BODY_MAX` (256 KB) applies: a list whose content is over it gets the existing «текст цього блоку не зберігся» mark in old versions, as a big text block does.
- **Named versions from the cloud** (`normVersion`) carry the same entries with the body inline (`s`); conflict copies are local `versions` records written with the same `bodyOf`/`entryOf`, never sent (sync PR 4a refuses to name or send them). `normVersion` checks a new-kind entry by the entry rules only (`id`, `kind`, the place fields, `h`, `s` a string when present), not by the kind's block rules, because the entry has no `items` or `title` of its own; T1 also parses `s` and checks it by the `todo` rules (§6.17). Local versions are not at risk: the legacy kinds keep today's `bodyOf`/`entryOf`, and no version record holds a new kind before T0.
- **The hash of a received entry.** In `main` today, `vrecord` rebuilds a received named version with `manifestOf` over the wire entries, whose `text` is `''`, so every entry gets `h = hashOf('')` and «Історія» marks every block of a received version as changed (checked in Node, 2026-10-24). This is a bug of sync PR 4a-1. The fix: wherever an entry carries `s`, its `h` equals `hashOf(s)`, for every kind (not «the sending device's `h`», which is `null` for a body over `V_BODY_MAX`). Fixed in sync PR 4a-2 (#114, not merged yet on 2026-10-24): `entryOf` hashes `s` when the entry carries it, else `bodyOf(d)`; `syncversions` scenario 32 checks a rich text block, a code block and an area received on another device. **If #114 does not land, T0 carries the fix**, since T0 rewrites `bodyOf`/`entryOf` anyway. Either way T0 adds the foreign-block case (PR 4's normalizer refuses a foreign kind, so that case can only live in T0).
- Without this, `items` would sit in every version entry and be copied into every version record (up to `V_MAX_NOTE` = 300 per note) outside the blob store and its limits.

### 3.6 Canonical form and normalizer

- `canonBlock` for `kind: 'todo'` also drops a task's empty optional fields (`comment: ''`, `done: 0|null|false`, and `doneBy` when there is no `done`; the editor removes `doneBy` on every untick), so hashes agree however a record was made.
- Duplicate task ids in one block: the first in array order keeps the id, later copies with equal content are dropped, the others are renamed to `id.slice(0, 63 - h.length) + '-' + h` with `h = hashOf(task JSON)`; when that id is taken in the block too, `h` is the hash of the JSON plus `#1`, `#2`, … until it is free. The renamed id matches `[\w-]{1,64}`, every device computes the same one, and `norm(norm(x)) == norm(x)`. (Blocks keep their own renaming, `id~hash`, unchanged, §3.7.)

### 3.7 Addresses

- A note is `NOTE`, a block `NOTE/BLOCK`, a task `NOTE/BLOCK/TASK`. This is the address the assistant tools use (`docs/MCP-PLAN.md`, §12); the app itself links to notes and blocks only (LINKS-PLAN), and a task has no in-app link in T1.
- **The alphabet of each segment:** `NOTE` and `TASK` are `[\w-]{1,64}`. `BLOCK` is `[\w~-]{1,96}`: the normalizer renames a duplicate block to `id~hash` (`normBlocks` in `sync.js`, today), and changing that rule would make devices with the old and the new normalizer disagree on ids, so it stays. The app's `LINK_RE` (`[\w-]{1,64}`) refuses such a renamed block; a link to one fails today, which is an existing gap this plan does not change. The tools accept the wider block segment.
- `todo/model.js` exports `formatAddress(note, block, task)` and `parseAddress(s)` (pure, §6.19), so the app and the server write and read addresses the same way.

### 3.8 Storage, sync, rules

- No new store, no new note field, no database version bump: the block lives in `notes.blocks`. Older exports have no such block and import as before.
- **Firestore rules:** `firestore.rules` checks `blocks` only as a list of at most 5000 entries (the `notes` and `versions` matches) and never looks inside a block, so the rules do not change. The index exemption on `blocks` (SYNC-PLAN §4.2) already covers nested fields: no console change. (Unlike the `pinned` note field of #82, which needed the rules.)

## 4. Compatibility in one picture

| Code in a tab | Meets a to-do block | Result |
|---|---|---|
| Before T0 (production today) | from sync | cannot happen on .app: production has no cloud sync until the release that also brings T0 (§5.5). On .dev: the note is quarantined («Не синхронізовано»); whether the old core can still send a write that drops the block is what T0's frozen-core test establishes (§5.4) |
| Before T0 | in an open tab, after any edit of the note | the block is rewritten as a text block: **data loss**. This is why T1 waits until no tab anywhere runs code older than T0 (§5.5) |
| Before T0 | from an import | the core refuses the note and counts it as failed; `importNotes` keeps it in memory as unsaved with «Повторити», and opening and editing it there would turn the list into a text block. The file stays intact, and production runs T0 by the time lists exist |
| T0 | anywhere | a read-only placeholder; the record is kept byte for byte; move, width, delete and undo work |
| T0 | a quarantined document from before the update | re-checked once by the new normalizer and applied (§5.3) |
| T1 | a task or block field from a later version | kept (§3.2, §5.3) |
| T1 | a tab with older code open on the same device | stops writing: T1 raises `FORMAT` (IDB-BARRIER-PLAN), and every tab with the barrier's guard turns view-only at its next write or on the `format` message (§6.14) |

## 5. T0: blocks and fields of an unknown kind (released first)

### 5.1 Why

- `public/sync.js`: `KINDS=[undefined,'code','area']` and `normBlock` returns `false` for any other `kind`, so `normNote` reports `bad:'blocks'`. An incoming cloud document goes to `quarantine:` and the note is marked `damaged`; `importNote` and `importMany` refuse the note.
- `public/index.html`: `make()` turns an unknown `kind` into a text block (`kind: undefined`), and `serBlock` writes only the fields it knows for each kind. An older tab that saves the note (an edit of any block, a move) writes the to-do list back as a text block with its `text`: the tasks, dates and comments are gone, and sync sends it as an ordinary edit.
- The same `serBlock` drops any future field of a known kind. T0 fixes both, for every future kind and field that is not a container: blocks inside a block of a future container kind would still be moved to the sheet by `fixParents` and `make`'s orphan rule, which T0 does not change.
- A document quarantined by an old normalizer stays quarantined after the update until another device writes the note again (`clearlyNewer` in `applyNote`); T0 re-checks it.

### 5.2 What the user sees

- In place of a block of an unknown kind, a card with the header «Блок з новішої версії Baobook», its title when it has one, and its `text` in grey (at most 8 lines, then «…»), read-only. A button «Оновити застосунок» uses the app's update path through a small new `updProbe()`: it fetches `build.json` (never cached) and returns the server's build or an error, compared with `BUILD` (not with `updSeen`, which a dismissed strip has already set). Newer: `updWant = true; flushSave(); updTry()`, as the «Доступна нова версія · Оновити» strip does (save what is pending, reload once nothing is left to save). Not newer (a .dev export imported into .app, say): the toast «Нової версії ще немає». Offline or the fetch failed: «Не вдалося перевірити оновлення», never «no newer version».
- The card moves like a code card (its header is the handle), resizes in width, copies (its `text`), takes a link («Копіювати посилання»), and is deleted with the usual undo toast. Delete in its menu is new for a block with a `kind`: `blockMenu` gives code cards and areas only copy and link today; for this card the menu (the right button on ⋮⋮, «⋯» on touch) has copy, link and delete.
- Its content cannot be edited; no folding, language or lock.
- In a read-only note (the trash, a shown version, the view-only modes of SYNC-PLAN §4.14) the card cannot be moved or deleted, as any block there.

### 5.3 Code

**`sync.js`**

- `normBlock`: a `kind` that is a string matching `^[a-z][a-z0-9-]{0,39}$` passes the kind check. For a kind it does not know, it checks only the common shape: `id`, `row`, `fx` or `parent`+`col`, `cw`/`ch` (positive numbers when present), `text` a string, `title` a string of at most 2000 when present. Every other field is left exactly as it is, `html` included. A malformed common field (`title: 5`) still makes the block bad. Known kinds keep their checks; their unknown fields already pass through untouched, and T0 adds a test for it.
- `KINDS` stays the list of kinds this version understands; `knownKind(k)` is exported for the editor.
- **Versions** (§3.5): `LEGACY_KINDS = [undefined, 'code', 'area']` keep today's `bodyOf`/`entryOf`. For any other kind, `entryOf` keeps `id`, `kind`, `row`, `fx`, `parent`, `col`, `cw`, `ch`, `collapsed`, `h`; `bodyOf` is the canonical JSON of the rest without `view`, `s`, `r` and `h` (`view` is reserved here already, so T0 and T1 agree; `s`, `r`, `h` are the history's own fields on a received entry). `verBlocks` (in `index.html`) parses such a body and assigns it over the entry, so the body's `text` wins over the `text: ''` that `normBlock` fills in; a body that does not parse gives the existing missing-body mark.
- `normBlocks(list, deps, {inline:true})` (named versions and conflict copies, `normVersion`): an entry of a kind outside `LEGACY_KINDS` gets only the entry checks (`id`, `kind`, the place fields, `h`, `s` a string when present); its body is not inspected in T0. An entry without `s` exists only in a named version kept on this device (`local: 'partial'`, «лише тут: неповна», SYNC-PLAN §4.9); it is shown with the missing-body mark.
- **Re-checking quarantine:** notes are already re-checked: `recheckQuarantine()` runs at every engine start with an owner and a cloud, re-runs `normNote` on every `quarantine:n:` record with reason `shape`, marks a pass `recheck` and refetches it, and `applyNote` then deletes the record and clears `damaged` (SYNC-PLAN §4.15). T0 changes nothing there. It extends the same start pass to `quarantine:v:`: re-run `normVersion`, mark a pass `recheck`, and refetch the version (`setVRefetch`). Nothing more is needed: `applyVersionCore` already deletes the `quarantine:v:` record and clears `damaged` whenever `normVersion` passes, and a version quarantined for its shape never has a `base`, so no shortcut stands in the way.
- The merge needs no change for T0: every field outside `PLACE` is «content» (`groupOf`).

**`index.html`**

- **One predicate, one audit.** `isCard(b)` = `b.kind && b.kind !== 'area'`; `isForeign(b)` = `b.kind && !knownKind(b.kind)`. Every site that today tests `kind==='code'` or reaches for `b.txt` is checked and given its branch for a foreign card. The ones known now: `make` (build), `render` (its last branch sets `b.txt.style.minHeight`; a card measures from `b.card` as code does), the grip click (copy or focus), keyboard ↑/↓ between blocks, `enterSel` and the position mode, the resize handle, `tempBlock`, `showBlock` (`b.kind? b.card : b.txt`, already right), `minw`, `isSolid`, `focusBlock`, `lines()`, `blockName`, `blockText`/`blockHtml`, `blockMenu`, `remove`, the link picker's kind label and icon, the link hover preview, copying and pasting a block. The PR lists every site it touched; `appforeign` drives each of them.
- `make(d)`: for a foreign kind, `b.kind = d.kind`, `b.raw = structuredClone(d)`, and `buildForeign(b)` (a code card's frame without the editor). For every kind, `b.raw` is a deep copy of the record as loaded (fields the editor does not know).
- `serBlock(b)`: every kind has a fixed set of fields the editor owns, `OWN[kind]`:
  - the known kinds: `id`, `row`, `fx`, `parent`, `col`, `cw`, `ch`, `kind`, and per kind: text `text`, `html`; code `text`, `lang`, `wrap`, `num`, `open`, `title`; area `title`, `color`, `collapsed`; todo (T1) `title`, `view`, `items`, `text` (and never `ch`: the resize handle of a to-do card changes the width only);
  - a foreign kind: exactly `id`, `row`, `fx`, `parent`, `col`, `cw`. Everything else, `kind` and `ch` included, comes from `b.raw` untouched.

  The result is `{...b.raw}` with every field of `OWN[kind]` deleted, then the live values written exactly as now (a field the editor writes only when set, such as `title` or `collapsed`, is therefore absent when unset, never resurrected from `raw`). So a block pulled out of an area has no stale `parent`/`col`, and one moved into an area has no stale `fx`. `b.raw` is reset to `{}` on every change of kind (the `[] ` conversion of T1, a text block made code by a paste, code made text).
- `takeNote` (another tab) and `openNote` go through `make`, so the raw copy is there too.

### 5.4 Tests

- `tests/appforeign.mjs` (new). A note put into IndexedDB holds a text block, a code block with an extra field `x9: {a: 1}`, a block `{kind:'later', title:'Пізніше', items:[{id:'i1', text:'a'}], text:'☐ a', html:'<b>x</b>', extra:[1,2]}` on the sheet and another foreign block inside an area:
  1. the placeholder shows «Пізніше», `☐ a` and «Оновити застосунок»; nothing in it is editable;
  2. typing in the text block, a reload: both foreign records and the code block's `x9` are stored equal to the original (canonical JSON, place fields aside);
  3. moving the placeholder, resizing its width, moving it into an area and out again, a reload: only the place fields change, with no stale `parent`/`col`/`fx`; a foreign block with `ch` keeps it and its `kind`;
  4. a code block's title emptied, a reload: no title comes back from `raw`;
  5. another tab takes the change and saves its own edit: still equal;
  6. delete from the menu and undo: back equal;
  7. the history: a version shows the placeholder; «Відновити блок» brings the record back equal, `html` and `extra` included;
  8. export and import round trip into a fresh origin: equal;
  9. a `[[` link to the placeholder, its chip name «Пізніше», the hover preview with `☐ a`; search finds `a`; the list preview;
  10. keyboard ↑/↓ across it, the grip click, the resize handle, the position mode on touch (a hold selects it);
  11. the trash read-only view: no delete, no move;
  12. the phone: «⋯» with copy, link and delete;
  13. «Оновити застосунок» with a newer `build.json` goes through `updTry`; with the same build it shows «Нової версії ще немає», also after the update strip was dismissed; offline it shows «Не вдалося перевірити оновлення».
- `tests/syncnorm.mjs`: a named version with a foreign block (entry plus inline `s`) passes `normVersion`, keeps its body, and `verBlocks` rebuilds the block with the body's `text`; an unknown kind passes and keeps every field, `html` included; `norm(norm(x)) == norm(x)`; keys in another order give one hash; bad kinds (`5`, `'Code!'`, `''`, 41 characters) are bad; an unknown kind with `title: 5` is bad; a known kind keeps an unknown field; `bodyOf`/`entryOf` of an unknown kind round-trip through `verBlocks` and leave `view` out.
- `tests/syncmerge.mjs`: an unknown block's fields are «content»: concurrent changes conflict with a copy, a change on one side wins over an untouched side, a move on one side and a content change on the other merge without a copy.
- `tests/syncforeign.mjs` (new): **the core of .dev before T0**: `public/sync.js` of `main` at T0's base (after sync PR 4, 4a to 4c; the only code that can meet a list through sync before T0, since production has no cloud sync until the release that brings T0, §5.5), committed as `tests/fixtures/pre-t0/sync.js`, together with the test store and cloud of that same commit (`tests/fixtures/pre-t0/memstore.mjs`, `cloud.mjs`; both changed in 4a-1, so they come from the same commit), never edited; the PR names the commit. One frozen-core device, its note synced from the cloud first; then the cloud document is replaced, past the rules (the test cloud's seeding), by the same note with a foreign block, as a T1 device would write it. The device receives it, then edits its local copy and syncs. **Expected, from the code:** quarantined (`normBlock` refuses the kind, `meta.err = 'damaged'`), and no write that drops the block (the send loop skips a job whose note has an `err`, and `putNote` never clears `damaged`). The test asserts this; if it fails, the result goes into the first row of §4 before T0 is merged.
- `tests/syncquar.mjs` (new): one note and one named version quarantined by the frozen .dev normalizer (`shape`), the device then started on the T0 core: both leave quarantine through the refetch, `damaged` clears, a second start changes nothing.
- `tests/appimport.mjs`: a file with a foreign block imports and counts as imported.
- `tests/syncsim.mjs`: the randomized runs include notes with a foreign block; the oracle checks it is never changed by a device that did not edit it.
- `tests/README.md`: a row for `appforeign`, `syncforeign`, `syncquar` and the fixture folder, in T0 itself.

### 5.5 Release

1. Sync PR 4 into `main`, then T0 into `main` (T0 is adapted to PR 4's code where they meet, `normVersion`), then sync PR 5 (the documentation of sync), checked on .dev. T0 does not wait for PR 5; the release waits for both.
2. The owner asks for the sync release; `main → prod` brings sync and T0 together; checked on .app with `curl -s https://baobook.matamata.app/build.json` and `node tests/hashes.mjs --live https://baobook.matamata.app/`. Production has no cloud sync before this release (PR 1's core runs without Firebase), so no device ever syncs with code older than T0: the case «a device that missed T0 receives a list through sync» cannot happen on .app, and `syncforeign` (§5.4) matters only for .dev devices.
3. On every device: tap «Оновити» on the «Доступна нова версія» strip in every open tab, or close every tab of .app and .dev and the installed app and open it again, then check «Версія» in the settings menu. The service worker never reloads an open page; the strip comes by itself (`updCheck` at start, on return to the tab, online, and every 30 minutes). The release also carries the IndexedDB upgrade of sync PR 4a (`IDB_VER` 4), whose `versionchange` stops every older tab of the origin from writing (SYNC-PLAN §4.9), so on .app no tab older than T0 can write after the new code has started on that device. The release PR has a checklist with the owner's devices.
4. **A hard prerequisite:** the IndexedDB barrier's PR 2 (`FORMAT`, IDB-BARRIER-PLAN) is in `main` before T1 and in production at least one release before T1's release (best in the sync release), since T1 relies on it (§6.14). On .dev the plan accepts, instead of the `IDB_VER` raise that IDB-BARRIER-PLAN §8 question 4 recommends for such a change, that a tab older than both PR 2 and T0 may still be open; step 3 closes it by hand.
5. Only then T1 is merged into `main`. Until T1 is released too, to-do lists exist only on .dev; the .dev tabs go through step 3 as well.

## 6. T1: the to-do block, merging by task, the panel

### 6.1 Creating a list

- **Computer:** a header button «Новий список» next to «Нова область» (`#todoBtn`, a list icon with a plus, title «Новий список справ»). It puts a card at the bottom of the sheet, as the area button does, with the caret in its empty line.
- **Phone:** the item «Новий список» in the header «⋯», next to «Нова область» (`tests/appmenu.mjs` counts the menu's items; it gains one). The caret is placed inside the tap's handler, so iOS opens the keyboard.
- **`[] ` or `[ ] `** typed at the start of an empty text block (the input handler that calls `mdList` on a space) turns the block into a to-do list in its place: same id, same position, `b.raw` reset, the caret in the empty line. Ctrl+Z right after brings back the text block with `[] ` (§6.10). Not in a code block, not in a text block with any other text, not inside a `ul`/`ol` line.
- Inside an area: `[] ` works in a text block inside the area, and a card moved into an area stays a list (like a code block). The button always adds to the sheet.
- Not offered in a read-only note.

### 6.2 The card

- **Header** (`.cbar`, the drag handle as on a code card: the mouse at once, a finger after a hold):
  - the title, editable like a code block title, placeholder «Список справ»; Enter leaves it for the first shown task;
  - the switcher **Активні · Виконані · Усі** as a `radiogroup`; when the card is narrower than 360 px, and on a phone, one button with the current view that opens the three options;
  - the counter «3 з 8» (done of all, tooltip «Виконано 3 з 8»);
  - «⋯»: «Копіювати», «Копіювати посилання», «Видалити виконані» (T2), «Видалити блок». On a computer the right button on ⋮⋮ opens the same menu (`blockMenu` for this kind).
- **A row:** the checkbox, the text, the comment icon (only when there is a comment), the done date (only when done). On a computer, on hover: a faint «add comment» icon (when there is none) and the cross. Done rows are struck through and grey.
- **On touch:** the tap highlight is off, as everywhere since #105; the checkbox, the row «⋯», the switcher, the comment buttons and the section rows get the app's own press feedback (`tests/apptaphl.mjs` gains them). The checkbox and the row icons are 44 px targets; the row with the caret shows «⋯» at its end with «Коментар» / «Додати коментар», «Позначити виконаною» / «Зняти позначку», «Видалити справу». A hold on a row is still the block's position mode (MOBILE-PLAN); a tap on the checkbox never starts it.
- **The empty line** at the end of «Активні» and «Усі» has the placeholder «Нова справа» and a dashed box. It is not a task (§6.3).
- **Empty states:** «Активні» with tasks but none open: «Усе виконано» above the empty line; «Виконані» with none done: «Ще нічого не виконано».
- **Width** is resizable (`cw`, the handle as on a code card); the height follows the shown rows in whole grid rows.
- **Read-only** (the trash, a shown version, view-only): checkboxes, rows, the title and the menus are inert; the switcher changes what is shown but saves nothing. An unknown `view` value shows «Активні» and is kept until the owner switches.

### 6.3 Typing and keys

Every task is its own contenteditable line (`contenteditable="plaintext-only"` where the browser has it, else `true` with a paste and input filter that keeps plain text). Formatting keys (Ctrl+B and the others) do nothing in a task; the formatting bar is not shown for a task. Keys are ignored while `isComposing`; the Enter that ends a composition does not split.

| Key | In a task | In the empty line |
|---|---|---|
| typing | edits the text | the first character makes a task here, and the caret stays in it (focus moves synchronously, so fast typing lands in the new task) |
| Enter at the end | opens an empty line right below this task, the caret in it (below the last task: the «Нова справа» line) | nothing |
| Enter at the start of a non-empty task | opens an empty line above it, the caret in it | — |
| Enter in the middle | splits the task: the part after the caret becomes a new task below; the comment, `done` and unknown fields stay with the first part | — |
| Backspace in an empty task | deletes it (§6.6 for which way), the caret to the end of the task above, or into the empty line when it was the first | removes the line (when it is not the last), the caret to the end of the task above |
| Backspace at the start of a non-empty task | joins it to the end of the task above when it has no comment, no `done` and no unknown fields; otherwise only moves the caret | — |
| ↑ / ↓ | to the task above or below when the caret is on the first or last visual line; past the first or last row they leave the card as in other blocks | the same |
| Ctrl+Enter (⌘+Enter) | ticks and unticks | — |
| Shift+Enter | opens the comment in editing | — |
| Esc | leaves the card (the block keeps focus, as Esc does in a text block) | removes the line |

- **The empty line** opened by Enter is drawn by the editor only and is not in `items`. Typing turns it into a task at that place (`created` = now); leaving it empty (blur, Esc, a click elsewhere) removes it and keeps the caret where the click put it. So the line is never saved, counted, sent or put into a version. In «Виконані» Enter does nothing and there is no empty line.
- **A task emptied while the caret is in it** (Backspace to the start, select-all and delete) is still the same task:
  - while it is empty, `serBlock` saves it with **its last non-empty text**, so an autosave, a tab closed or a sync in that moment loses nothing;
  - when the caret leaves it still empty: a task with no comment, no `done` and no unknown fields is deleted silently (Ctrl+Z brings it back); any other is deleted with the toast «Справу видалено · Скасувати»;
  - text that is only spaces counts as empty. Otherwise text is saved as typed, with no trimming.
  - the same holds for every path that serializes the open note, `softSet` (a pin or a colour of the open note) included, since all of them go through `serBlock`.
- **Paste:** a single line is inserted as plain text. Several lines make a task of each non-empty line, after the current task (or in place of the empty line), in order. A leading `- `, `* `, `• `, `[ ] `, `[] ` is dropped; `[x] ` or `[X] ` makes the task done with the time of the paste. Html is pasted as its plain text. Over the 5000-task limit, the rest is not pasted and the toast says «Досягнуто ліміту». One step of undo.
- **Android keyboards** often send Backspace in an empty field with neither a usable `keydown` (`key: 'Unidentified'`, code 229) nor `beforeinput`. An empty task therefore holds a zero-width sentinel character, as the chip code does: Backspace deletes the sentinel, the `input` event sees it gone and deletes the task. The sentinel is never saved (`serBlock` strips it, as the chip code strips its own).
- **A ticked task with the caret in it** does not leave «Активні» while the caret is in it; it fades out 2 s after the caret leaves. So focus never jumps on its own, and on iOS the keyboard does not close outside a gesture.

### 6.4 Ticking off and the views

- A tick sets `done` to now; an untick removes it. The date: `Intl.DateTimeFormat(I18N.locale, {day:'numeric', month:'short'})` («20 жовт.»), with the year when it is not the current year; the tooltip is `{dateStyle:'long', timeStyle:'short'}`, followed by who ticked it when `doneBy.dev` is another device («· Pixel 8») or `claude` («· Claude»).
- **Активні:** the open tasks in their order. A ticked task stays struck through with its date for 2 s (counted from the tick, or from the moment the caret leaves it, §6.3), then fades out (0.35 s; none with reduced motion). Unticking within those 2 s keeps it. Timers are per task. Switching the view or leaving the note drops pending timers (the task is already saved as done).
- **Виконані:** done tasks by `done`, newest first, under day headers by the device's local day: «Сьогодні», «Вчора», then `{day:'numeric', month:'long'}` («15 жовтня»), with the year when not this year. Text and comment stay editable; unticking makes the task leave after 2 s, as in «Активні».
- **Усі:** all tasks in their order, done ones struck through with their date.
- The counter counts all tasks of the block whatever the view; the empty line is never counted.
- A tick, an untick and a switch are saved like any edit (`markDirty`).

### 6.5 Comments

- A row with a comment shows a speech-bubble icon (`aria-label` «Коментар»). Hovering the icon for 400 ms on a computer, or tapping it on touch, shows the comment in a popover: plain text with its line breaks, at most 12 lines, then a scroll; `role="dialog"`; it closes on Esc, on a click outside, and when the pointer leaves both the icon and the popover.
- A click in the popover turns it into a textarea; on a computer a click on the icon opens editing at once. Esc, Ctrl+Enter or a click outside saves. An empty comment removes the field, with the toast «Коментар прибрано · Скасувати». Ctrl+Z inside the textarea is its own; closing the popover with a change is one step of undo.
- Adding: the faint icon on a hovered row (computer), Shift+Enter in the task, «Додати коментар» in the row's «⋯» (touch). The popover opens straight in editing.
- On a phone the popover sits above the keyboard (the placement of the link picker, LINKS-PLAN §3) with 44 px buttons «Готово» and «Прибрати».

### 6.6 Deleting a task

- The cross (computer), «Видалити справу» in the row's «⋯» (touch): the task goes with the toast «Справу видалено · Скасувати» (`offerUndo`); Ctrl+Z works too. Undo puts it back at its index with all its fields.
- Backspace in an empty task: silently for a bare task, with the toast otherwise (§6.3).

### 6.7 The side panel

- **The count on a note item.** A note with one or more lists that have tasks shows, after its date, a small checklist mark and «4 з 8» (done of all, summed over its lists; tooltip «Виконано 4 з 8 у списках цієї нотатки»). When everything is done the mark is faint (`--ink-3`). A note without lists, or whose lists have no tasks, has no mark. The same in the archive and trash sections and in search results.
- **The row «Списки справ · N»** in the panel's foot, above «Архів» and «Кошик», while at least one list exists in the notes or the archive. N is the number of those lists, empty ones included. It uses the existing `.srow`.
- **The section** (`section = 'todo'`, beside `'notes'`, `'archive'`, `'trash'` in `renderList` and `setSection`): «‹ Списки справ» back to the notes; the hint «{n} списків у нотатках, {k} з відкритими справами. Клік відкриває нотатку на цьому списку.», where n is every list and k the lists with an open task (plurals by `n`); two chips, «З відкритими справами» (the default) and «Усі». On a phone the section is a nav entry, so system Back returns to the notes, as for the archive.
- **A list in the section:** its title (or its first task when it has none, or «Список справ» when it has neither), «1 з 5», a thin progress bar, the first three open tasks as `☐` lines and «ще {n}», and below the note's title and date, with «в архіві» for an archived note. Lists with open tasks come first, ordered by the note's `updated`, then by their order in the note. With the chip «Усі», lists with no open task (all done, or empty) follow under the group «Усе виконано», ordered by their newest `done`.
- **A click** opens the note scrolled to that list and lights it for two seconds, through the links code (`linkGo(note/block, {noHop:true})`, `showBlock`), with no «back» step. When the list is inside a folded area, `showBlock` unfolds it, and that is an edit that moves the note up, as for a link today. On a computer the panel stays in the section; on a phone the panel closes as when a note is opened, and Back returns to the section.
- **Search** in the section filters lists by the list title, the note title, the tasks' text and comments (all the words, as the note search). The trash is never in the section; archived notes are.
- **Not note items.** The section's rows are not `.item[data-id]`: no long press, no list action mode (`.amode`, LIST-ACTIONS-PLAN), no right-click item menu, no hold hint; the list gesture's `onDown` ignores them, since they are not `.item`. A row shows its note's colour as a thin mark on its left edge (the note list's tint would compete with the progress bar). Pinned notes do not sort first in the section: the order is by open tasks and `updated`; a pin or a colour moves `updated`, so it reorders the section, as an edit does.
- **The count on a note item** sits in `.it-d` on the left, so the action mode's buttons and gradient on the right never cover it; its faint `--ink-3` state is checked for contrast on the five note colours.
- **Found anew** from the notes in memory whenever the list is drawn, like «Сюди посилаються»: no index. A tick here, a change in another tab (`takeNote`), an import and a sync redraw it.
- Ticking tasks from the section: not now (the owner's decision).

### 6.8 Search, preview, links, copying

- **Search** (`lines()`, `noteText`, `found`): a to-do block gives its title, then each task's text followed by its comment lines. The snippet shows the matching task or comment line. Version search (`vtext`) reads the same from the version's parsed body.
- **Preview** in the note list (`previewOf`): when the list is the note's first content, its first open task with `☐ `, or its first task with `☑ ` when all are done; a list with no tasks gives its title, or nothing.
- **Links:** a link to the block works as to any block: «Note › Title», or «Note › first task» without a title (`blockName`). The link picker labels it «Список справ · 3 з 8» with the checklist icon; the hover preview shows the title and the first five open tasks as `☐` lines.
- **Copying** the block (`blockText`/`blockHtml`): the plain text is the title (when there is one) and `☐`/`☑` lines; the html is a `<ul>` of `<li>` with `☐`/`☑` and the escaped text. Pasting it into a text block gives a plain bulleted list; pasting the plain text into a to-do list makes tasks (§6.3).
- **«Сюди посилаються»** is unchanged: tasks hold no links in T1.

### 6.9 Versions

- By T0's rule (§3.5): the entry holds `id`, `kind` and the place fields; the body is the canonical JSON of `title`, `items`, `text` and unknown fields, without `view`. A tick or a comment changes `h`, so the history marks the block changed, shows «Відновити блок» for it, and `sumOf` counts it, with no change to those functions.
- A shown version draws the card read-only in «Усі», so every task of that moment is visible, done ones with their dates.
- «Відновити блок» restores the title and the tasks (`restoreBlock`), keeps the current place and `view`, with the usual undo toast. Restoring the whole note (`restoreWith`) keeps the current `view` of every to-do block that still exists too; a block that comes back from the version opens in «Активні».
- `vcapture` before the first edit and `vafter` after it run as for any block: a tick is an edit.

### 6.10 Undo

- **Typing in a task** has the field's own history (`histRec` on the task element), as in a text block.
- **Ctrl+Z with the caret in a task, the empty line or the title**: the field's history first; when it has nothing to undo, the sheet's undo (`doUndo()`). This is a change to the keydown handler for fields inside a to-do card only (today `if(f){ histGo(f,redo); return; }`). So Ctrl+Z right after `[] `, a split, a join, a delete by Backspace or a new task works while the caret is still in the card.
- **Steps of the sheet's undo** (`offerUndo`, silent where there is no toast): a new task from the empty line, a split, a join, a tick or an untick, a deleted task (toast), a pasted group (toast), a comment change, the `[] ` conversion, a view switch, a deleted block (toast, as for any block).
- **Each step stores the inverse of its own operation by task id**, never a copy of the whole `items` array, and **checks its precondition** before it acts, so undoing an older step keeps every later edit made on this screen. Preconditions are checked against the screen's `b.items`. A value that a save-time merge (`editorDelta`) took in waits for the safe point and is not on the screen yet, so an undo in that moment acts on the screen, and the next save merges it by task like any edit: a conflict copy only when both sides changed the same group of the same task (§6.13). A change **taken** from storage (another tab's write through `takeNote`, a received change through `takeStored`/`redrawCur`) drops the open note's undo steps and field histories, as for every block today (their steps were made on the old copy); T1 keeps that rule:
  - a new task X: when X is still as it was made (empty or with the first typed text), delete it silently; when it was edited since, delete it with the toast «Справу видалено · Скасувати», which brings it back as it is (as `pastedUndo` hands over to `removeWithUndo` for blocks);
  - a deleted task: put X back at its index (clamped) with all its fields, when no task with its id exists;
  - a tick or untick: set X's `done` back only when it still holds the value the step set; a comment change: the same for `comment`; a view switch: the same for `view`;
  - a split of X into X and Y: join Y back into X when both are still as the split left them, else do nothing;
  - a join of Y into X: split X at the stored offset when X's text is still the joined text, else do nothing;
  - a paste: delete the pasted tasks that are unchanged;
  - the `[] ` conversion: back to a text block with `[] ` only while the list has no tasks;
  - whenever a precondition fails, nothing changes and the toast says «Не вдалося скасувати: справу вже змінено». The handler has no redo for sheet steps (`if(redo) return`), so an inverse never destroys what it cannot give back.
  Their `size` is the JSON length of what they hold, so `UNDO_MAX` and `UNDO_BYTES` apply.
- **Order across fields:** Ctrl+Z in a task undoes that task's typing first, then the newest sheet step, even if another task was typed in later; the typing of the other task stays in that task's own history. This is how text blocks behave today, and it is kept for one rule.

### 6.11 The block object and the editor snapshot

- `make` copies the tasks (`d.items.map(t => ({...t}))`). Every edit replaces `b.items` with a new array and a changed task with a new object; nothing mutates an array or a task in place. The editor snapshot of sync (`noteSnap` keeps `n.blocks` by reference, `ESNAP`) and the undo entries therefore never see a later edit, and `merge3`'s base stays the state the screen was drawn from.
- A test checks that `ESNAP`'s copy of the block is unchanged after a tick, a split and a typed character.

### 6.12 Other tabs and sync

- Another tab gets the note through `takeNote` and redraws the card. When the caret is not in the note, a change shows at once; while it is, through the «Є зміни» strip (SYNC-PLAN §4.10), as for any block. With merging by task (§6.13), a tick that came in while typing in another task of the same list merges without a conflict copy when the screen is saved.
- A pending 2-second leave survives a redraw: timers are keyed by task id, and a task that is no longer done drops its timer.

### 6.13 Merging by task (`sync.js`)

In `merge3(base, L, R)`, a block is merged by these rules instead of the two groups **only when every side that has it is of kind `todo`**. When the kinds differ (a `[] ` conversion on one device while the other edits the text block), today's two groups apply, and `kind` is «content» with the rest.

- **With a base:** the rules below.
- **Added on both sides with no base** (the `!b` branch): tasks united by id; a shared id with different content comes from the side with the larger key, marks `lost` and adds a trace entry, as with a base (inside `merge3` nothing else keeps a copy); order as below; the place group and `view` by key; `title` by key with `lost` when they differ.
- **Deleted on one side:** «untouched on the other» is judged by the canonical JSON of the block **without `view`**, so a list deleted on one device and only switched on the other stays deleted; any other change on the other side keeps the block, as today.

- **«place»** (`row`, `fx`, `parent`, `col`, `cw`, `ch`, `collapsed`) as today.
- **`view`**, the block-level counterpart of the note's soft fields (`SOFT_FIELDS = ['pinned', 'color']` in `sync.js`): three-way; when both sides changed it, the side with the larger key wins and `lost` is **not** marked (a switch is not worth a conflict copy). `merge0`'s shortcut for copies that differ only in soft fields also covers the `view` of to-do blocks, so two copies that differ only in a view make no conflict copies either. The comparison uses its own form (soft note fields removed, and `view` removed from to-do blocks); the result is not built from that form: it is `R`'s body with the soft note fields of the winner `W` (as today) and each to-do block's `view` taken from `W`, matching `merge3`'s «the larger key wins». Building the result from the stripped form would reset every list to «Активні».
- **`title`**, three-way as a field; a conflict → by key, `lost` marked.
- **`items`**, three-way by task id:
  - per task three groups: the text; `done`; `comment`; plus each unknown field as its own group; `created` is the smaller. **`doneBy` belongs to the `done` group** and travels with it. **Both sides ticked** (both have `done`, with different times): the earlier `done` with its `doneBy`, without `lost`, since it is the same intent; both unticked is already equal. **`changed` and `by` are not a group:** after the groups are merged, they come from the side whose group values are in the result for that task: from that side when only one side contributed, from the side with the larger `changed` when both did (the larger key on a tie); they never mark `lost`, so a tick on one device and a comment on another stay a clean merge, and `by` never names the author of a change that is not in the result; A conflict only when the same group of the same task changed differently on both sides: the larger key wins and `lost` is marked, so a conflict copy is kept as today;
  - a task deleted on one side and untouched on the other → deleted; deleted on one side and changed on the other → stays;
  - a task added on both sides with the same id and different content → by key, `lost` marked;
  - **order**: the order of the side with the larger key; a task present only on the other side goes right after its nearest preceding task (in that side's order) that is in the result, or first when there is none; two such tasks after the same task keep their order. A reorder on the losing side is not kept and not marked lost: order alone is not worth a conflict copy, and the tasks themselves are all there.
- **`text`** is not merged: rebuilt with `todoText` from the merged `items`.
- Other unknown block fields: three-way per field, conflict by key with `lost`.
- **`merge0` and `moveInto`** (no common base): tasks united by id; a shared id with different content comes from the side with the larger key; the order rule as above. These merges already keep both sources as conflict copies whenever they differ (`merge0` marks both sides lost; `moveInto` always keeps the moved copy), so nothing changes in what copies they make.
- **`trace`**: an entry per task whose content from one side did not reach the result, `{id: 'block/task', side, cause, h}` with `h` the hash of that task's canonical JSON, besides the per-block entries; the `syncsim` oracle checks, for a partly merged block, that every such task is in a kept copy.
- `finishMerge` is unchanged: a result equal to the remote by content takes it as it is.
- The test cloud in `tests/lib` uses the core; it needs scenarios, not code.

### 6.14 An older tab on the same device

- T1 raises `FORMAT`, the data format number of the IndexedDB barrier (IDB-BARRIER-PLAN §4, its PR 2): to-do blocks are «a record shape that older code would damage». Every tab with the barrier's guard checks `format` as the first request of each write and turns view-only (`lock.updated`) when it is newer than its own, and the `{t:'format', v}` tab message stops an awake tab at once. A T0 tab is stopped too, which is harmless: it would only have kept the lists intact.
- The hole that remains is a tab older than the barrier's PR 2 on .dev (.app gets PR 2 at least one release before T1, §5.5 step 4); §5.5 step 3 covers it.
- No strip and no build handshake of its own: the barrier is the one mechanism for old tabs.
- **A revert of T1 keeps `FORMAT` at its raised value.** Pre-T1 code with the lower `FORMAT` would open every device that holds T1 data as «newer» and lock it, so going back means a forward fix that lowers features, not a plain revert.

### 6.15 Validating what is saved

- Outgoing records are not normalized today (`wireBody` is `canon(noteBody(rec))`). T1 checks the record **inside `SYNC.writeLocal`**, on the result of the delta callback (`editorDelta`, which may merge), right before it is stored.
- **What is checked:** the note's basic shape and every `todo` block by the rules of §6.17, task ids unique within each block included (one `Set` per block), without `cleanRich` and without the duplicate pass over all blocks: the new code is where an editor bug would come from, and this keeps the check to a few microseconds per task on the 300 ms save path.
- **What happens on a failure:** the record is still written locally (refusing the write would trap a note that holds old, never-normalized data and lose the edits on reload). Only the send is blocked: the note's sync state gets `err: 'invalid'`, set **after** `putNote` in the same transaction with another `putMeta` (IndexedDB copies a record when `put` is called; `putNote` clears `invalid` on every write, so the next valid write lifts it on its own), and `S.err`, which the queue reads, is updated with it. It is set only when `err` is unset or already `invalid`, so it never overwrites `damaged`, `receipts` or `size`. It shows through the sync status as any `invalid` note does: the status «Не синхронізовано · N» of SYNC-PLAN §4.18 (PR 4c), with the reason «помилка в даних нотатки» in its per-note list (or `sync.st.error` if T1 lands before 4c); the `unsaved` map and its warning are not used, since the note is saved. So an editor bug cannot make a note «damaged» on every other device.
- The localStorage fallback backend has no sync; it writes as today.
- The `apptodo*` scenarios check after each step that every stored note normalizes to the same canonical form (`cjson(normNote(x).note) === cjson(noteBody(x))`, the stored record without `id`), not to the same object: the normalizer legitimately fills `fx` and drops `ch`.
- `apptodoperf` measures the whole save path (serialize, the check, `canon`, `sameDoc`) of a 1000-task note as a long-task budget: under 50 ms.
- Loosening any task or block rule later (a new `view` value, longer texts) is a normalizer change, and like T0 it ships only after the looser normalizer is on every device (§11).

### 6.16 Export and import

- Export writes the block as stored. Import validates it through `normNote` and keeps the file's shape.
- An export from T1 imported into T0 shows the placeholder. Into code older than T0 the note is refused by the core and kept in memory as unsaved (§4); the file stays intact.

### 6.17 The normalizer for `todo` (`sync.js`)

- `KINDS` gains `'todo'`. The quarantine re-check at start (§5.3) picks up notes and named versions quarantined by T0's normalizer, so a T0 device that updates to T1 applies them with no step of its own.
- For `kind: 'todo'`: `items` must be an array of at most 5000 tasks; each task an object with `id` (`[\w-]{1,64}`), `text` (a string of at most 10 000, no `\n`), `created` (a positive finite number), `done` (absent, or a positive finite number; `0`, `null`, `false` read as absent), `comment` (absent, or a string of at most 10 000; `''` reads as absent), `changed` (absent, or a positive finite number), `by` and `doneBy` (absent, or `{dev, dn}` with `dev` matching `[\w-]{1,40}` and `dn` a string of at most 80; `doneBy` without `done` reads as absent); unknown task fields pass. `view`: any string of at most 40 (unknown values are kept, §3.1). `title` as for code. `html` is dropped as for other kinds. `cw` as for code; `ch` is dropped.
- In named versions and conflict copies (`normBlocks` with `inline`), a `todo` entry gets the entry checks of §5.3, and its inline body `s`, when present, is parsed and checked by the rules above; a body that does not parse, or fails them, makes the version bad, as a malformed block does.
- **A stored `todo` block that fails these rules** (one that a T0 device let in through an import or sync, since T0's normalizer checks only the common shape) is drawn by `make` as the T0 read-only placeholder and kept byte for byte: `serBlock` uses the foreign `OWN` set for it (`id`, `row`, `fx`, `parent`, `col`, `cw`), not `OWN.todo`, and the save check of §6.15 skips a `todo` block whose content group equals that of its `raw` (compared without the place fields, `gjson(b, false)`), so the note keeps syncing when the placeholder is moved or resized or other blocks are edited. `apptodo` has a case for it: such a block, moved, and the note still syncs.
- A malformed task makes the whole note bad (quarantine), as a malformed block does: the normalizer checks, it does not repair, so two devices never disagree. §6.15 keeps the editor from producing one.

### 6.18 Localization

New keys in `public/locales/uk.json` and `en.json`. Every number goes into a whole sentence with parameters; every Ukrainian plural has `one`, `few`, `many` and `other`, as `trash.left` does. «Сьогодні» and «Вчора» reuse `hist.today` and `hist.yesterday`.

| Key | uk | en |
|---|---|---|
| `todo.kind` | Список справ | To-do list |
| `todo.new` | Новий список | New list |
| `todo.new.title` | Новий список справ | New to-do list |
| `todo.view.active` / `.done` / `.all` | Активні / Виконані / Усі | Active / Done / All |
| `todo.view.label` | Показати | Show |
| `todo.count` | {done} з {n} | {done} of {n} |
| `todo.count.title` | Виконано {done} з {n} | {done} of {n} done |
| `todo.note.count.title` | Виконано {done} з {n} у списках цієї нотатки | {done} of {n} done in this note's lists |
| `todo.placeholder` | Нова справа | New task |
| `todo.empty.active` | Усе виконано | All done |
| `todo.empty.done` | Ще нічого не виконано | Nothing done yet |
| `todo.done.title` | Виконано {when} | Done {when} |
| `todo.done.titleBy` | Виконано {when} · {by} | Done {when} · {by} |
| `todo.check` / `todo.uncheck` | Позначити виконаною / Зняти позначку | Mark as done / Mark as not done |
| `todo.comment` / `.add` / `.done` / `.remove` | Коментар / Додати коментар / Готово / Прибрати | Comment / Add comment / Done / Remove |
| `todo.comment.removed` | Коментар прибрано | Comment removed |
| `todo.delete` / `todo.deleted` | Видалити справу / Справу видалено | Delete task / Task deleted |
| `todo.pasted` | Додано {n} справу · справи · справ · справи | Added {n} task / tasks |
| `todo.limit` | Досягнуто ліміту | Limit reached |
| `todo.undoFailed` | Не вдалося скасувати: справу вже змінено | Could not undo: the task has changed since |
| `todo.section` | Списки справ | To-do lists |
| `todo.section.hint` | {n} список / списки / списків / списку у нотатках, {k} з відкритими справами. Клік відкриває нотатку на цьому списку. | {n} list / lists in notes, {k} with open tasks. A click opens the note at that list. |
| `todo.filter.open` / `todo.filter.all` | З відкритими справами / Усі | With open tasks / All |
| `todo.group.allDone` | Усе виконано | All done |
| `todo.more` | ще {n} | {n} more |
| `todo.archived` | в архіві | archived |
| `todo.converted` | Блок став списком справ | The block is now a to-do list |
| `sync.err.invalid` | помилка в даних нотатки | the note's data is invalid |
| `link.kindTodo` | Список справ | To-do list |
| `block.foreign` (T0) | Блок з новішої версії Baobook | A block from a newer version of Baobook |
| `block.foreign.update` (T0) | Оновити застосунок | Update the app |
| `block.foreign.none` (T0) | Нової версії ще немає | No newer version yet |
| `block.foreign.fail` (T0) | Не вдалося перевірити оновлення | Could not check for an update |

Dates by `Intl` with `I18N.locale`. `tests/appi18n.mjs` checks keys, use and plurals.

### 6.19 Modules

The to-do code does not go into `index.html` (3300 lines today) but into files of its own, as the sync core (`sync.js`) and the cloud adapter (`cloud.js`) already do. This is also the pattern the later refactoring stage can follow for the rest of the app.

**The split: by feature first, by responsibility inside it.** The feature is one folder; inside it the pure logic (data in, data out, no DOM) is separate from what draws and from what handles input. Pure logic is where the rules and the bugs are, and it is tested in Node in milliseconds, as `sync*.mjs` test the core; the DOM parts stay thin and are tested by the Playwright scenarios.

| File | Kind | What it holds |
|---|---|---|
| `public/sync.js` (existing) | the data format, shared with the future server (§12, `docs/MCP-PLAN.md`) | the normalizer of `todo` with its limits, the save check of §6.15, `todoText`, the merge by task, `bodyOf`/`entryOf` of new kinds: everything every device and the server must compute the same way |
| `public/todo/model.js` | pure | ids unique in a block, what a view shows (`visible`), day groups, the counter, search lines, the preview line. The limits (`LIM`) and the save check of §6.15 stay in `sync.js`, where the normalizer and `writeLocal` use them; `model.js` reads them from `BaobookSync` (in Node from `require('../sync.js')`), so no rule exists twice |
| `public/todo/ops.js` | pure | the operations on `items` (add, split, join, tick, untick, comment, delete, paste parsing, later reorder and clear-done), each returning the new `items` and its undo inverse with its precondition (§6.10); `changed`/`by`/`doneBy` set here from the arguments `{now, by}` every operation takes |
| `public/todo/view.js` | DOM | the card: header, switcher, counter, rows, the empty line, the comment popover, dates through `Intl`; draws from data, never decides a rule |
| `public/todo/input.js` | DOM events | keys, paste, the Android sentinel, IME, caret and focus between rows, the 2-second leave timers; turns events into calls to `ops` |
| `public/todo/panel.js` | DOM | the count on a note item and the «Списки справ» section with its chips and search |

- **Loading:** classic scripts with the same UMD wrapper as `sync.js` (a global `BaobookTodo` in the browser, `require` in Node), loaded after `sync.js` and `cloud.js` and before the main script, in a fixed order (`model`, `ops`, `view`, `input`, `panel`), each as `<script src="todo/<file>.js?b=BUILD" integrity="sha384-…">` like the two existing ones. With them: `PRECACHE` in `sw.js` gains `'./todo/<file>.js'+B`; `FILES` in `tests/hashes.mjs` (paths relative to `public/`) gains `todo/model.js`, `todo/ops.js`, `todo/view.js`, `todo/input.js`, `todo/panel.js`, and `node tests/hashes.mjs --write` runs on every change of a module; `tests/appupdate.mjs` checks every `?b=` script tag instead of exactly two; `torn()` requires `BaobookTodo.model`, `.ops`, `.view`, `.input` and `.panel` as well as the core and the adapter (every module adds itself to the shared global, so checking the global alone misses one refused file); `tests/appsri.mjs` refuses a non-first module (`panel.js`) and expects the torn path; `BUILD` is raised in all its places (the CI job `build-marker`); the `CLAUDE.md` lines that name only `sync.js` and `cloud.js` name the modules too. ES modules (`import`) would be the usual choice in a new project; here they would mix two loading styles in one page until the refactoring stage decides it for the whole app, so this plan keeps one style.
- **Pure functions, callable by the server as they are.** `todoText` and the to-do normalizer and merge (`sync.js`) and all of `todo/model.js` (what a view shows, day groups, the counter, the search lines, the preview line, `formatAddress`/`parseAddress`) take data and return data: no DOM, no `window`, no `localStorage`, no tab state, no clock of their own (a time comes in as an argument). The future MCP server (§12) requires them unchanged. `tests/todomodel.mjs` runs them in Node with no DOM globals, and checks that `model.js` and the to-do parts of `sync.js` mention none of `document`, `window`, `localStorage`, `navigator`, `Date.now`.
- **No reach into `index.html`:** the modules get what they need from one object passed at start (`env`: `loc`, `locA`, `now`, the device's `{dev, dn}`, `markDirty`, `offerUndo`, `histRec`, `linkGo`, `ask`), and never read the page's globals. The author is a getter (`env.author()`), since `connect` can change `devId`/`devName` after start. The model and ops get no `env` at all: the time and the author come in as arguments.
- **The hooks in `index.html`** stay a thin layer: `make` calls `BaobookTodo.view.build(b, env)`; `serBlock` asks `model` for the stored task list; `lines`, `previewOf`, `blockName`, `blockText`/`blockHtml`, `renderList`/`fillItem`, `setSection('todo')` call `model` and `panel`; the Ctrl+Z fallback, the T0 audit sites, `#todoBtn`, the header «⋯» item and the `[] ` conversion next to `mdList`.
- **Changes in `index.html` the hooks need:** `fieldOf` (today `.txt, .code code, #ttl, .ctitle`) recognises a task's text element, so Ctrl+Z inside a task reaches its own history before the sheet's (§6.10); `histGo` restores a field by setting its `innerHTML` and firing `input`, so `input.js` rebuilds the task from that `input` event, the sentinel included.
- **`tests/appi18n.mjs`** scans `index.html`, `sw.js`, `sync.js` and `cloud.js` today; T1 adds `public/todo/*.js` to its scan, for used keys and for Cyrillic literals. It collects used keys from single-quoted literals inside `loc(`/`locA(` only, so keys are always written whole (`loc(v === 'done'? 'todo.view.done' : 'todo.view.active')`), never `'todo.view.' + v`.
- **Types without a build step.** The modules are JavaScript with JSDoc types and `// @ts-check`: the types `Task`, `Author`, `TodoBlock` and the shapes of `env` are declared once (`@typedef` in `model.js`), every function of the modules has its parameter and return types, and CI runs `tsc --noEmit` with `--allowJs` (not `--checkJs`) on `public/todo/*.js`, so only files with `// @ts-check` are checked and the untyped `sync.js` that `model.js` requires is not (TypeScript installed with `npm i --no-save`, as Playwright is; no `package.json` at the root). `tests/types/` (outside `public/`) holds a `tsconfig.json` and a `.d.ts` for `BaobookSync` (the functions the modules use) and for the UMD wrapper's `module`/`require`. The browser gets the same files, so the «no build step» rule holds; when the refactoring stage moves the app to TypeScript (`CLAUDE.md`, «Roadmap»), these files need little more than a rename to `.ts`. T1 itself is not written in TypeScript: that would bring a build step and a new deploy setup before the refactoring chooses them for the whole app.
- **Size and granularity:** five files of about 150–300 lines each. Smaller pieces (one file per operation, per row part) would make the load order and the `PRECACHE` list longer without making anything easier to change; larger ones bring back the problem of one big file.
- **Tests per layer:** `tests/todomodel.mjs` and `tests/todoops.mjs` (new, Node, like `syncmerge.mjs`) for every rule of the model and every operation with its inverse and precondition; the `apptodo*` scenarios for the view, the input and the hooks.

**The hooks in detail:**

- `make` → `view.build(b)`: the card, the rows, the empty line, the switcher, the menus; `b.items`, `b.view`, `b.title` on the block object (§6.11); `b.raw` as in T0.
- `serBlock`: `OWN.todo` (§5.3); `items` written as `{...task}` minus the sentinel; an empty task with fields written with its last text (§6.3); `text` from `todoText`.
- Measuring: the card's height from its rows (`b.lines` from `b.card.offsetHeight`, as code).
- The `todo` branches of every site of T0's audit (§5.3).
- `drawList` (the `sec === 'todo'` pool), `renderList` (no `snapShow` in the section), `fillItem` (the count), `setSection('todo')` (which already closes the list action mode and pushes a nav entry on a phone), the row `#todoRow` beside `archRow`/`trashRow` and its counter, `renderTodoSection()`.
- The Ctrl+Z handler's fallback (§6.10); the `FORMAT` raise of §6.14; the check of §6.15 inside `writeLocal` (in `sync.js`).
- `#todoBtn`, the header «⋯» item, the `[] ` conversion next to `mdList`.
- `DEBUG.todo` for the tests: a clock offset (day groups at a fixed time) and the leave delay.

### 6.20 Tests

- `tests/todomodel.mjs` and `tests/todoops.mjs` (new, Node): the pure modules of §6.19, every rule and every operation with its inverse and precondition, before any browser scenario.

- `tests/apptodo.mjs` (new), creating and typing:
  1. «Новий список» makes a card at the bottom with the caret in the empty line; typing makes a task and the caret stays in it (typed with no delay); the counter «0 з 1»;
  2. Enter at the end of a middle task opens an empty line under it; a click on another task removes it and the caret stays where clicked; Enter then typing makes a task in that place; Enter at the end of the last task goes to the «Нова справа» line; storage never holds the empty line (checked after each step);
  3. Enter in the middle splits, with comment and `done` on the first part; Backspace at the start joins a bare task, only moves the caret before a task with a comment; Backspace in an empty task deletes it;
  4. select-all and delete in a task with a comment, then an autosave and a reload: the task is there with its last text and comment; leaving it empty deletes it with the toast, undo brings it back;
  5. the Android sentinel: an `input` that removes it deletes the task; it is never stored;
  6. ↑/↓ across tasks and out of the card;
  7. `[] ` and `[ ] ` in an empty text block convert, Ctrl+Z (caret still in the card) back to `[] `; not in a block with text, not in a code block; inside an area;
  8. paste of several lines with `- `, `[ ]`, `[x]`; a single line; html as plain text; the limit; a paste of 5000 lines gives 5000 distinct ids;
  9. a reload keeps everything; the phone «⋯» item; the read-only trash view; every stored note passes `normNote` unchanged after each step.
- `tests/apptodo2.mjs` (new), ticking and views: a tick with the date and its tooltip, an untick; `changed`, `by` and `doneBy` set by a tick, an edit and a comment, untouched by a reorder or a view switch; Claude's comment after the owner's tick leaves the tooltip naming the owner's device; a tick with `doneBy.dev: 'claude'` shows «· Claude», a device named «Claude» does not; undo of a tick restores `doneBy`; Ctrl+Enter; the 2-second leave, an untick in time, two ticks in a row; a ticked task with the caret in it stays until the caret leaves; «Виконані» with the day groups («Сьогодні», «Вчора», a date of another month and of another year) at a fixed clock; «Усі»; the counter; the switch is stored and shows the same after a reload and in another tab; an unknown `view` value shows «Активні» and is kept; the compact switcher on a narrow card; the empty states.
- `tests/apptodo3.mjs` (new), comments, deleting, undo: the comment icon only when there is one, the hover popover, editing, removing by emptying with its toast, Shift+Enter, the phone popover above the keyboard; the cross and its undo; **undo keeps later edits**: tick A, type in B, «Скасувати» of the tick → A unticked, B's typing kept; delete A, edit B, undo → A back, B kept; split then edit the new part, undo → «Не вдалося скасувати…»; a new task edited afterwards, Ctrl+Z → deleted with a toast that brings it back with its text; after another tab's change is taken, Ctrl+Z changes nothing and the other tab's value is kept; a tick undone while a merged change of another task waits for the safe point → the untick is kept and the other task's change arrives at the safe point, with no copy; Ctrl+Z with the caret in a task after each structural step; `ESNAP` unchanged after a tick, a split and a typed character.
- `tests/apptodo4.mjs` (new), the rest: search by task and by comment and the snippet; the list preview; copying (plain and html) and pasting back; a link to the block, its name and preview; a shown version in «Усі», the changed mark after a comment-only change, «Відновити блок» keeping place and view; export and import; **another tab**: a tick in tab 2 while tab 1 types in another task of the same list → after tab 1's save both are kept, no conflict copy (`apptabsync`-style); a tab served with the previous `FORMAT` turns view-only when a T1 tab starts (`appformatgen`-style); a pin or a colour of the open note while a task is typed and a remote tick arrives keeps all three; the phone: 44 px targets, the row «⋯», a hold is still the position mode and a tap on the checkbox is not.
- `tests/apptodolists.mjs` (new), the panel: the count on a note item (one list, two lists, all done, none, a list with no tasks); the row «Списки справ · N» only with lists, N with an empty list; the section, its hint and chips, the «Усе виконано» group; an archived note's list with its mark; a trashed note's list absent; a click opens the note at the list and lights it, also inside a folded area; search in the section; the count updates after a tick here and in another tab; the phone: the nav entry, system Back, 44 px rows; a long press on a section row opens no action mode; the count readable on every note colour and visible in the action mode; a coloured note's mark on its row.
- `tests/apptodoperf.mjs` (new): a seeded note with 1000 tasks and one with 5000: opening the note under 1 s and a typed character under 50 ms in CI Chromium; the section of the panel with 200 lists under 200 ms. If 5000 misses, T1 makes only the row with the caret contenteditable (the others plain rows that become editable on a click at the click's offset) before it is merged.
- `tests/appforeign.mjs` stays green: `todo` is known now; any other kind is still a placeholder; a task with an unknown field keeps it through a tick and an edit of its text.
- `tests/syncnorm.mjs`: a named version and a conflict copy holding a to-do list pass `normVersion` and keep their bodies, a bad inline body is bad; valid tasks, and bad ones (no id, an id with a space, `text` with `\n`, `done: 'x'`, a comment over the limit); duplicate task ids kept, dropped, renamed within `[\w-]{1,64}` (a 64-character id, a rename that collides once), and `norm(norm(x)) == norm(x)` with a renamed one; `parseAddress(formatAddress(...))` round-trips, a block segment with `~` included; empty optional fields equal to absent ones in the canonical form; `view: 'active'` equal to none; an unknown `view` kept; `changed`, `by` and `doneBy` checked (a negative `changed`, a `by` without `dev`, an 81-character `dn` are bad; `doneBy` without `done` dropped); unknown task fields kept; the start's quarantine re-check picks up a note quarantined by T0's normalizer.
- `tests/syncmerge.mjs`: a tick on one side and a comment on the other of the same task → no copy, `doneBy` from the tick, `changed`/`by` from the later side; a comment on one side that loses a conflict does not leave its `by`; both sides tick the same task at different times → the earlier `done` with its `doneBy`, no copy; different tasks on two sides → no copy; the same task's text on both → a copy; text on one side and the tick on the other → both kept, no copy; a comment on one side and a tick on the other; delete against an edit; adds on both sides with the order rule; a reorder on the losing side dropped without a copy; `view` against `view`, against a move and against a content change → no copy; `merge0` of two copies that differ only in a `view` (and in `pinned`/`color`) → no copies, and the result has the winner's `view`; a move of the block against a task edit; `text` rebuilt; ten repeated deliveries cause no write; both «devices» compute the same result; `merge0` and `moveInto` with tasks.
- `tests/syncsim.mjs`: task operations (add, edit, tick, comment, delete) in the randomized runs.
- `tests/emu/todo.mjs` (new): on the emulators, two devices tick different tasks offline, both come online: no conflict copy, both see both ticks; a note with a to-do block passes the rules.
- `tests/rules/firestore.mjs`: a note with a to-do block passes the rules unchanged.
- `tests/appi18n.mjs`: green with the new keys.
- `tests/README.md`: a row for every new file.
- **CI shards:** every top-level `tests/*.mjs` is picked up by `tests/lib/shard.mjs`; after the first CI run the measured seconds of `apptodo*`, `apptodoperf` and `appforeign` go into its `WEIGHTS`; `apptodoperf`'s thresholds are measured on a CI runner. `tests/emu/todo.mjs` runs in the `sync-emulator` job; `tests/fixtures/` is not scanned.

## 7. T2: clearing done tasks, reordering

### 7.1 «Видалити виконані»

- «⋯» of the block → «Видалити виконані» with two items: «Усі виконані · N» and «Старші за 30 днів · N» (by `done`; the second only when there are such tasks; both disabled with no done tasks).
- Each goes through `ask()` («Видалити 12 виконаних справ?», «Історія нотатки збереже їх, і їх можна буде відновити звідти.», «Видалити»), then the toast «Видалено 12 справ · Скасувати»; one step of undo, which puts back the deleted tasks by id at their indexes.
- A version is captured before the clearing (`vcapture` with the new reason `clear`, labelled «Перед видаленням виконаних» by `kindText`; `vthin` treats it like the other automatic reasons), so «Історія» has the tasks even within `V_GAP`.
- Tests: `tests/apptodoclear.mjs` (new): both choices at a fixed clock, Esc and «Скасувати» in the dialog, the undo with a later edit kept, the version before the clearing has the tasks and its label, the numbers in the menu, the phone bottom sheet of `ask()`.

### 7.2 Reordering

- A grip at the start of a row on hover (computer) and on the row with the caret (touch, 44 px): drag to a new place in «Активні» and «Усі» (not in «Виконані», whose order is by date). In «Активні» a task dropped between two open tasks goes right after the upper one in the full order; hidden done tasks keep their places.
- Alt+↑ / Alt+↓ move the task with the caret one shown row.
- A move is one step of undo (move X back to its index); Esc during a drag cancels it (as `appdragcancel` for blocks).
- The merge keeps the order of the winning side (§6.13); a concurrent reorder on the other device is not kept.
- Tests: `tests/apptododrag.mjs` (new): drag with the mouse and on touch, Alt+↑/↓, the order in «Усі» after moving in «Активні», a reload, the undo, Esc during a drag, the block's position mode on touch still works from the card header; `tests/syncsim.mjs` gains reorders.

## 8. Pull requests (into `main`)

| PR | What | Acceptance |
|---|---|---|
| T0 | After sync PR 4, released with the sync release. Unknown kinds and fields kept: `normBlock`, `make`/`serBlock` with `OWN` and `raw`, the placeholder and the audit of every kind site, version bodies of new kinds, the quarantine re-check extended to named versions, «Оновити застосунок» on the existing update path, the frozen-core test (§5). Carries the `h` fix of §3.5 if sync PR 4 did not. | §5.4 green; the result of `syncforeign` written into §4. **Released to production with sync, every device through §5.5 step 3, before T1 is merged.** |
| T1 | The to-do block (§6.1–6.6, 6.8–6.12, 6.14–6.17), merging by task (§6.13), the panel (§6.7), localization (§6.18). Needs the IndexedDB barrier's PR 2 in `main`, and in production one release before T1's release. | §6.20 green; checked on .dev with a copy of the real notes; the manual checks of §10 for T1. |
| T2 | «Видалити виконані» and reordering (§7). | §7 tests green. |

Every PR updates this document with what was actually built and the «Product status» line in `CLAUDE.md`, as the other plans do.

## 9. Risks

- **Older code meets the new block** (the main risk): T0 and its release order (§4, §5.5), the quarantine re-check, the IndexedDB upgrade of the sync release and the `FORMAT` barrier (§5.5, §6.14). `syncforeign` establishes what a device that missed T0 does with a synced list.
- **A tab left open with code older than T0** loses the list in that note if the note is edited there (§4). On .app the sync release's IndexedDB upgrade stops such tabs; on .dev only closing every tab (§5.5 step 3) prevents it. After T1, the `FORMAT` guard (§6.14) stops every tab that has the barrier.
- **One contenteditable per task on phones:** moving the caret from one task to the next must keep the keyboard open (iOS Safari and the installed app, Chrome on Android); Backspace on Gboard and Samsung Keyboard (the sentinel, §6.3); autocorrect and the suggestion bar on Enter; `plaintext-only` support (Safari has it since 17.4; the fallback filters input).
- **Accessibility:** the checkbox is a real `role="checkbox"` with `aria-checked` and the task text as its label; the switcher is a `radiogroup`; the done date is read with the task; the popover is reachable from the keyboard.
- **Size:** `text` doubles a list's weight (§3.3); the existing size mark covers it. A list over `V_BODY_MAX` keeps no body in old versions (§3.5).
- **Performance:** thresholds and the fallback in `apptodoperf` (§6.20).

## 10. Manual checks (written with T1 into a checklist like `docs/SYNC-CHECKLIST.md`)

- On a computer: creating by the button and by `[] `; ticking with the 2-second leave; the comment popover by hover; the views; the panel count and section.
- On an iPhone (Safari and the installed app) and an Android phone (Gboard and Samsung Keyboard): creating from «⋯» with the keyboard opening; typing, Enter and Backspace with the keyboard staying open; Backspace in an empty task; ticking with 44 px targets; the comment popover by a tap above the keyboard; the compact switcher; a hold for the position mode; the section as a nav entry with system Back.
- With sync: a list ticked on the phone while typing in it on the computer: no conflict copy; a view switch follows; the panel count updates.
- T0: «Версія» in the settings menu on every device after the release; the placeholder on a device updated after the others.
- TalkBack and VoiceOver: the checkbox, the switcher, the comment.

## 11. Later

- Formatting and `[[` links inside tasks: `html` per task through an inline-only `cleanRich`, links in «Сюди посилаються». A separate step after T2. It ships in two releases: first code that keeps a task's `html` in step when its text is edited (and accepts it in the normalizer), on every device; then the formatting itself.
- The same two-release rule for any later loosening of the normalizer (§6.15).
- Ticking tasks from the «Списки справ» section.
- Due dates and reminders; a task moved to another list or note; nested tasks; restoring a single task from a version.
- Assistant access: `docs/MCP-PLAN.md`, with the boundary in §12.

## 12. Assistant access: the boundary with `docs/MCP-PLAN.md`

Not built in T0–T2. **There is one plan for assistant access: `docs/MCP-PLAN.md`** (PR #80, written in another session on 2026-10-20, not merged yet): the hosting (a Worker next to the site), OAuth and consent for Claude and ChatGPT, the credentials, the tools, the mirror in a Durable Object, security and its stages M0–M4. This section only says what this plan owns, what it hands over to that one, and what it requires of it. Agreed with the owner on 2026-10-24.

**This plan owns** the data the tools read and write: the block and task shapes (§3), authors by device id with the reserved id `claude` (§3.2), the normalizer and the merge by task (§6.13, §6.17), `todoText` and the to-do search lines (`todo/model.js`, §6.19), and the rule that unknown block and task fields are kept. MCP-PLAN's shared text module (`public/notetext.js`, its §7.5) takes a to-do block's lines from `todo/model.js`, so the app and the server search lists the same way.

**MCP-PLAN owns** everything about the server: where it runs, OAuth, the credential, the tools and their contracts, the mirror, limits, logs, security, its stages, and its stages. All of them, the read-only ones included, come after the refactoring (`CLAUDE.md`, «Roadmap»; the owner's decision, 2026-10-24).

**The owner's requirements handed to MCP-PLAN** (2026-10-23 and 2026-10-24):

- The owner talks to Claude mostly from the phone (the claude.ai connector in the Claude app), also from Claude Desktop and Claude Code.
- **Writes, applied at once**, after the read-only stages: tick and untick a task with an optional comment, add a task, append to a comment, edit a task's text, add a text block (a project description), set the title of a list, an area or a code block. Also a report of what has no title or description, so sheets do not turn into a heap of unnamed things.
- **A sheet is a project.** Search order: the note title, then the list title, then the text of tasks and comments. «Today's list» works through titles and the note's `updated`; there is no project field.
- **The whole sheet:** Claude reads and edits text blocks, areas, code blocks and lists, not only lists.
- **Comments by Claude are appended**, never replaced: a new paragraph «23 жовт. · Claude: …»; over the 10 000 limit the tool refuses and says so.
- Every change Claude makes can be seen and undone in «Історія».

**What the write stage must keep** (requirements of this plan on MCP-PLAN):

- **Writes go through the sync core** (`sync.js`, pure and UMD, tested under Node) as a device with the fixed id `claude` and the name «Claude», never as raw Firestore writes. So the merge by task applies (a tick by Claude and a tick on the phone at the same moment merge like two devices), the receipts stay one per note (the rules allow 200 per document over its lifetime, SYNC-PLAN §4.16; a new id per request would use them up), and the other devices put the state before Claude's change into their automatic history (SYNC-PLAN §2), which is what makes it undoable.
- **The rules stay in force for writes.** MCP-PLAN §4.1 reads with a service-account key with `datastore.viewer`, which bypasses the rules but cannot write. A write role on that key would bypass the rules for writes too, so the write stage needs a credential the rules check, for example the owner's Firebase ID token from a refresh token kept encrypted by the Worker. MCP-PLAN decides it.
- **The core's store on the server:** a Durable Object with SQLite storage is `makeSync`'s transactional `db` (bases, `seen`, meta, jobs, attempts, the catch-up cursor) and the only writer, so concurrent calls are serialized as the leader tab serializes a device. Firestore's REST API has no listener, so the copy is kept current by catch-up pages since the cursor, at each call and on an alarm; this can be the same object as MCP-PLAN's mirror (its §7.6).
- **Limits:** the server is one more device in the read and write budgets (SYNC-PLAN §4.17).
- **A note field** still needs the rules and a release, as `pinned` and `color` did, so the write stage adds none if it can; block and task fields are free.
- A task's text is data, never instructions (MCP-PLAN §8.5 already says so for notes).
- The write stage comes after T1, since it writes to-do blocks.


- **What T1 prepares:** stable ids for notes, blocks and tasks (all there); a task as a record with `done`, `doneBy`, `comment`, `changed` and `by`, authors by device id (§3.2), so «what did Claude change», «what changed this week» and «who ticked it» need no new field; unknown fields kept, so the stage can add fields; the merge by task, so Claude's writes do not make conflict copies.
