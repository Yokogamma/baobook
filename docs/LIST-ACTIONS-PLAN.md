# List actions and note colours

Status: approved plan, 2026-10-22, revised after four review rounds. PR A is merged (#94, the layout fix #102); PR B is merged (#104, 2026-10-24). The owner approved the interactive mockup
(https://claude.ai/artifact/KSeXeJf1uuCQBiGmYHsTWA, version 3) and asked for this plan.

## 1. The problem and the decisions

On a phone the list item buttons (pin, archive, bin) appear when a finger touches the item: the touch sets `:hover` and `:focus-within`, the
buttons become visible under the finger, and the same tap lands on them. Since #92 made them 44×44, a tap meant to open a note often archives it
instead (seen by the owner on Android, 2026-10-21). The owner's decisions (2026-10-21/22):

1. **Touch:** a short tap anywhere on an item only opens the note. Holding a finger on an item (a long press) shows the actions on its right side:
   large buttons with room between them.
2. **Buttons show the note's state:** a pinned note's pin button looks pressed; in the archive the archive button looks pressed (and returns the
   note to the notes); a coloured note's palette button wears its colour.
3. **Pinned notes look different** from the others in the list.
4. **A note can have a colour**, chosen with a palette like the one of an area: «Стандартний» (no colour), yellow, green, blue, pink, purple. The
   colour shows as the item's background in the list. Folders with a colour are a later task, out of scope here.
5. **Computer:** no long press. The buttons show on hover (as today, with the palette added); a right click opens a context menu with the same
   actions.
6. The palette is a drop-down under its button (above it when there is no room below); the current colour has a check mark and its name in the
   header.

## 2. Two pull requests

- **PR A — list actions** (no data change): the touch gesture, the action mode, the buttons with state, the pinned look, the context menu on a
  computer, the tests. It fixes the accidental archive on its own and can be released alone.
- **PR B — note colour** (a new optional note field `color`): the field in storage, sync, the rules, export and import; the palette button, the
  drop-down, the colour row in the context menu, the coloured background. The owner publishes the new Firestore rules and adds the index
  exemption before PR B is merged (§5.6).

PR B starts from `main` after PR A is merged. Each PR runs the full `tests/*.mjs` suite locally; CI runs the Playwright, `firestore-rules` and
`sync-emulator` jobs on every PR that touches `public/**` or the rules (one paths filter for the whole workflow).

## 3. What stays as it is

- The data of PR A: no new field, nothing in `sync.js`, the rules or the export.
- #92: the full-width panel on a phone (`(hover:none) and (max-width:600px)`) and its «×» stay. Its 44×44 item buttons (`public/index.html`
  around line 561) are replaced by the action mode below.
- Keyboard behaviour from #82: Tab from a focused item reaches its buttons; Enter and Space on a button act and the focus stays on the same button
  in the note's new place (`keyed`, `keepFocus`, `focusItem`); a held key acts once; Delete on an item trashes it; a closed panel keeps no focus.
- The pin button's accessible name: #82's review (commit 65c2bae) settled one constant name («Закріпити вгорі», `pin.pin`) with `aria-pressed`
  for the state, and a `title` that says what a click does. That stays.
- The trash stays read-only for its notes: its items keep «Відновити» and «Видалити назавжди», with no pin and no palette.
- The header «⋯» on a phone keeps «Закріпити вгорі / Відкріпити» for the open note. The colour is not added there (not asked).
- `TOUCH` (a constant read once, used in ~23 places) is not touched.

## 4. PR A — list actions

### 4.1 Which behaviour applies

The behaviour is decided by input, not width. The list keeps its own `matchMedia('(hover:none)')` object, `LISTTOUCH`, read at every
`pointerdown` and in CSS through the same media query; a `change` on it closes an open action mode. So a touch tablet gets the long press too (the
accidental archive happens there as well), a device with a mouse keeps the hover buttons at every width, and a docked tablet switches cleanly.
The long press starts only from `pointerType` `touch` or `pen`; on a touch laptop the mouse keeps hover buttons and the right-click menu.

### 4.2 Touch: the item at rest

- Inside `@media (hover:none)`, the item buttons are hidden at rest whatever `:hover`, `.cur` or `:focus-within` say. They show only in action
  mode (`.item.amode`) or for a keyboard focus (`.item:focus-visible`, `.item:has(:focus-visible)`; a tap focuses the item without
  `:focus-visible`, so a tap shows nothing).
- The title and the snippet take the full width at rest (no padding reserved for buttons).
- A pinned note shows a small filled pin before its title. The mark is a sibling placed before `.it-t` in a flex row (so the title's ellipsis
  stays right), `aria-hidden`. For screen readers the item gets a visually hidden text «закріплена» outside `.it-t`, through a new `.sr-only`
  utility class (there is none yet). This applies on a computer too.

### 4.3 Touch: the gesture

The list uses the shared `gesture(host, o)` helper (`public/index.html` ~line 2594: hold 450 ms `HOLD_MS`, slop `HOLD_SLOP` 8 px Manhattan,
`filter`, `onDown/onHold/onMove/onEnd/onCancel`), with host `list` and
`filter: e=>e.pointerType!=='mouse' && LISTTOUCH.matches && e.isPrimary && !e.target.closest('.item button')`: a tap on a visible item button (the
mode's, or one shown for a keyboard focus) starts no gesture at all (so step 5 never cancels its `touchend` and its `click` arrives), and a second finger starts none either.

1. `onDown` on an item: mark it pressed (`.press`, a slight darkening, no layout change) and call
   `list.setPointerCapture(e.pointerId)`. `drawList` rebuilds every item with `list.innerHTML=''` (≈ line 1427) on each pin, sync arrival or
   merged write (`relist`, `renderList`), so the pressed element may be replaced in the middle of a gesture. With the capture on `list`, which
   survives, `pointerup`/`pointercancel` keep arriving; the gesture keeps the note id, not the element. `lostpointercapture` ends the gesture as a
   cancel. `listItem` reapplies `.press` from the gesture's note id, as it does `.amode` from `actsId`, so the pressed look survives a rebuild.
2. Movement beyond the slop (`g.moved`), `pointercancel` (the browser took the gesture for a scroll) or a second finger end the press without
   action (a capture-phase `pointerdown` listener on `list` calls `z.cancel()` and clears `.press` when `!e.isPrimary`): `onEnd` acts only when `!g.moved && !g.held`, as
   `holdGesture` does, because the helper does not cancel on movement and a sideways move under `pan-y` ends in `pointerup`.
3. `onEnd` before the hold, not moved: a **tap**. The note opens (`openNote(n)`). An open action mode is closed by the document listener of §4.4
   on the pointer down. That listener runs in the capture phase, before the gesture's `onDown`, so it stores `closedBy={pointerId, at}` when it
   closes a mode; `onDown` reads and clears it, and `onEnd` then opens nothing, so the tap only closes the mode.
4. `onHold`: **action mode** opens on the note (§4.4); `navigator.vibrate(12)` when available (in `try`).
5. After a hold nothing that ends it may act: a `touchend` listener on the list calls `preventDefault()` for every touch the gesture handled
   (`z.state || z.last`, as `selHoldOn` does for blocks; the listener is `{passive:false}`), held or not, which stops the compatibility mouse
   events and the synthesized `click`. As a second guard, every action button
   acts only after a `pointerdown` on it that started after the mode opened (`modeAt`); a `click` without one (the release of the hold) is
   ignored. Keyboard clicks (`e.detail===0`) are not affected. The mockup's first version lacked this guard and its test caught the release
   pressing the bin under the finger.
6. The item's own `click` handler does not inspect the click's pointer type (WebKit's `click` is not reliably a `PointerEvent`). The gesture
   records `lastTouch={id, at}` in `onEnd` and `onHold`, and the handler's open-note branch (a click not on a button) ignores a click within
   500 ms of it; it also covers a `touchend` that never reached the list because its target was rebuilt. Button clicks are not touched by
   `lastTouch`: they are guarded only by the `modeAt` rule of step 5. Mouse and keyboard clicks open the note as today.
7. `contextmenu` on an item is prevented on touch (Android fires it on a long press). Items get `-webkit-touch-callout:none` and
   `user-select:none` on touch.
8. The list gets `touch-action:pan-y` (it has none today), so the browser handles vertical scrolling and cancels the pointer for it.

### 4.4 Touch: action mode

- One note at a time has the mode; its id is kept in `actsId`, and `listItem` draws `.item.amode` and the buttons for it, so any redraw keeps the
  mode on the same note.
- The buttons sit in a row over the right part of the item, vertically centred, **48×48 px with 12 px between them**, over a fade of the item's
  own background so the start of the title stays readable. In the notes: pin, archive, bin (PR B adds the palette first). In the archive:
  «Повернути до нотаток» (`archive.unarchive`, the pressed look), bin. In the trash: «Відновити», «Видалити назавжди».
- The mode closes after every action: **pin** (the owner, 2026-10-23, after trying it on the phone: the note moves to «Закріплені» and shows
  its pin mark; a new long press shows the pin pressed), **archive**, **unarchive**, **bin**, **restore** and **delete forever** (the existing
  toasts and undo stay as they are). In PR B the mode stays open after a colour is chosen, so the palette button shows the new colour.
- The item in the mode keeps its own block layout: the class is `amode`, because `.acts` is the card bars' flex row (it once made the item a
  row, the title slid under the buttons or off the screen).
- It closes on: any pointer down (touch, pen or mouse) outside the mode's own buttons and outside the palette drop-down of PR B, inside the
  list or not (one document listener in the capture phase; a tap that closes the mode does nothing else, §4.3 step 3), a user scroll of the list, Escape, Back (the mode
  registers with `nav` as `'acts'`, as the panel does with `'side'`, so Back closes the mode first and the panel on the next Back), closing the
  panel, a change of section or search, a `change` of `LISTTOUCH`, and a redraw that no longer contains the note.
- Order on the `nav` stack: `openNote` (from any path: a tap, the context menu, a key) calls `closeActs()` before it pushes `'note'`, and
  `setSide(false)` calls `closeActs()` before `nav.close('side')` (which removes every entry above `'side'`), so `actsId` never outlives its
  history entry and `'acts'` never sits above `'note'`.
- **A user scroll** is told apart from a redraw: a redraw changes the list height and `scrollTop` (a pin adds the «Закріплені»/«Інші» headers)
  and fires `scroll`. `drawList` sets a `redrawing` flag that is cleared on the next animation frame; `scroll` closes the mode only while the flag
  is off. A finger that scrolls the list also produces a `pointerdown` on the list, which closes the mode by itself (a tap or a move elsewhere).
- Accessibility: the buttons get a group with `aria-label` «Дії з нотаткою»; the item's `aria-expanded` is not used (the context menu of §4.6
  must not set it either).

### 4.5 Buttons with state (touch and computer)

| Button | Normal | With state |
|---|---|---|
| Pin (notes) | outline pin | filled pin, pressed background (`--on-bg`, an accent tint); `aria-pressed=true` |
| Archive (notes) | box, title «Перенести в архів» (`archive.move`) | — |
| Archive (archive section) | — | box with an up arrow, pressed background, title «Повернути до нотаток» (`archive.unarchive`); no `aria-pressed` (a one-shot action, not a toggle) |
| Bin | «Перемістити в кошик» (`notes.delete`); in the trash «Видалити назавжди» (`trash.purge`) | — |
| Restore (trash) | back arrow, «Відновити» (`trash.restore`) | — |

Names: the pin keeps `aria-label` `pin.pin` and `aria-pressed` (§3); its `title` follows the state (`pin.pin` / `pin.unpin`), as today. The
other buttons get `aria-label` equal to their `title`. The texts are the existing keys above (the mockup's short labels were placeholders).
New tokens: `--on-bg`, `--on-ink`, `--pin-bg` for each theme (light, dark by `[data-theme]` and by `prefers-color-scheme`, sand).

The pinned look: a pinned item gets `--pin-bg` (a warm grey, distinct from `--hover` and from the current item); the current item keeps its own
background and gets an inset `box-shadow` ring (the outline stays for the keyboard focus, which already uses an inset outline) so the open
note stays visible inside the pinned group.

### 4.6 Computer and keyboard

- Hover buttons stay as today (shown on `.item:hover`, `.item.cur`, `.item:focus-within`), 24×24, with the state of §4.5.
- **Right click** on an item opens a context menu built by `popMenu` (`public/index.html` ~line 2468), extended:
  - `at:{x,y}`: the menu goes into `document.body` with `position:fixed` at the point, clamped to the viewport (the list scrolls and clips, and on
    a narrow screen `.side` is transformed, so the menu cannot live inside the panel);
  - checkable items: `role=menuitemcheckbox`, `aria-checked`;
  - ArrowUp/ArrowDown/Home/End move between the `.mi` items only (the header «⋯» menu gets them too, which it lacks today; its text size
    stepper row keeps its own keys);
  - `aria-expanded`: today it is never set to `true` (the call sits inside a trailing comment) and only `closePop` sets `false`; the extension
    sets it on open and close when `anchor.matches('button')` (the header «⋯» and a block's actions button then report their state; the grip
    keeps its current behaviour) and touches neither for an item;
  - a second right click on the same item reopens the menu at the new point (the toggle-close on the same anchor applies only without `at`);
  - `closePop()` stays the single close path (`openHist`, `askChoice`, `openText` already call it).
  Items: «Відкрити» (`list.open`), «Закріпити вгорі» (`menuitemcheckbox`, checked when pinned), «Перенести в архів» or «Повернути до нотаток»,
  a separator, «Перемістити в кошик»; in the trash «Відкрити», «Відновити», «Видалити назавжди». Escape returns the focus to the item.
- The **ContextMenu key** and **Shift+F10** on a focused item open the same menu at the item's lower left; on touch they open the action mode.
- On touch the right-click menu is not used: `contextmenu` is prevented (§4.3).

### 4.7 The hint

Following `tapHint` (a toast, `S.tapHint` counter, three times): the first three times a tap opens a note on touch, a toast says «Утримуйте
нотатку, щоб закріпити або прибрати її» (`list.holdHint`); counter `S.holdHint` in `sheet:settings` (optional, default 0). PR B changes the text
to mention the colour. No new UI element.

### 4.8 Code changes (index.html)

- CSS: tokens; `.sr-only`; the pinned background and mark; in `@media (hover:none)` the item at rest, `.press`, `.item.amode` with its 48 px
  buttons, `touch-action:pan-y` on `.list`; remove the #92 rules for `.it-x/.it-r/.it-p` at 44 px and their title padding.
- `listItem`: the pin mark and the hidden state text; titles and labels of §4.5; the archive section's button with the pressed look; `.amode` when
  `actsId` matches; the `click` handler per §4.3 step 6.
- The list gesture: one `gesture(list, …)` with the `filter` of §4.3 (`isPrimary`, the mode's buttons excluded), the pointer capture, the
  second-finger cancel, `actsId`, `modeAt`, `lastTouch`, `openActs(id)`, `closeActs()` (also called first by `openNote` and by `setSide(false)`),
  the `nav` entry, the document capture listener that closes the mode, the `touchend` guard, the `redrawing` flag in `drawList`, `LISTTOUCH`,
  and `DEBUG.relist` for the tests.
- `popMenu` extended as in §4.6, and `itemMenu(n, at)` building the items.
- Strings in `uk.json` and `en.json`, each used by PR A: `list.actions` («Дії з нотаткою»), `list.pinnedState` («закріплена»), `list.open`
  («Відкрити»), `list.holdHint`.

### 4.9 Tests (PR A)

A new scenario `tests/applistacts.mjs` (phone 390×844 with `hasTouch`, `isMobile`, `hover:none` and `pointer:coarse` emulated through CDP, as
`apppin.mjs` does; taps and holds through `Input.dispatchTouchEvent`):

1. At rest no item button is visible on the open note or on a tapped item.
2. A tap at the right edge of the open note's item (where the bin is drawn) opens it; nothing is archived or trashed (storage checked). Run red
   first against `main` (the #92 code archives or trashes there) and recorded in the PR.
3. A hold of 600 ms opens the mode: three buttons, each at least 48×48, gaps at least 12 px, inside the item.
4. Releasing the hold over where the bin appears presses nothing (storage unchanged, the mode still open); then a fresh tap on the pin acts.
5. A tap on the pin pins the note (storage `pinned` > 0); the mode stays on it in «Закріплені» after the redraw; the pin has
   `aria-pressed=true`, the constant name «Закріпити вгорі» and the pressed look; a second tap unpins and the mode stays.
6. A redraw during a hold still ends the gesture: the test adds a debug hook `sheetDebug.relist` (`DEBUG.relist=()=>renderList()`, beside the
   existing hooks) and calls it while the finger is down, before and after the hold fires; the release presses nothing, the pressed look
   survives, and a later tap opens a note (the pointer capture works).
7. A tap on another item while a mode is open only closes the mode (no note opens).
8. A user scroll of the list, Escape and Back each close the mode; after Back the panel is still open and the next Back closes it.
9. A hold that moves 20 px opens nothing; a `touchCancel` opens nothing.
10. Archive from the mode moves the note to the archive with the toast; in the archive the button has the pressed look and no `aria-pressed`;
    tapping it returns the note.
11. The trash: the mode shows «Відновити» and «Видалити назавжди»; delete forever still asks.
12. A pinned item has the pin mark and a background different from an unpinned item's (computed colours compared).
13. `contextmenu` on an item is cancelled on touch. Headless Chromium may not synthesize it from a CDP touch sequence, so the test also
    dispatches a `contextmenu` event on the item during a hold and asserts `defaultPrevented`.
14. The hint toast shows on the first three taps and not on the fourth.
15. At 800 px with touch the same gesture works (by input, not width).

On a computer (no touch), in the same file:

16. Hover buttons show with state: a pinned note's pin has `aria-pressed=true` and the pressed look; sizes stay 24×24.
17. A right click opens the menu at the pointer, inside the window, with «Закріпити вгорі» `aria-checked` by state; each item acts (open, pin,
    archive, bin) and the menu closes; Escape closes it and the focus returns to the item; the arrow keys move; Shift+F10 on a focused item opens
    it.

Existing scenarios: `apppin.mjs` 10d and 10g–10m (`tests/apppin.mjs` ~367–387) expect the open note's pin visible at rest and 44 px buttons; they
are rewritten to hold first, and 10m (the 800 px touch case) absorbs test 15 instead of duplicating it. `apptouch`, `appnav`, `apptrash`,
`apparchive`, `appkb`, `applist` run unchanged unless they tap an item button on touch; any changed expectation is listed in the PR description.

## 5. PR B — note colour

### 5.1 The field

`color`: an optional string on a note, one of `yellow`, `green`, `blue`, `pink`, `purple`. Absent means «Стандартний». It is not content: it does
not count for conflict copies or backups, like `pinned`.

- Not a time, so not in `TIME_FIELDS`; it joins `OPT_FIELDS` in `index.html` (absent when not set; carried by `noteSnap` and `takeRec`).
- An unknown value that passes the format check (a colour added by a later version) is kept as is and drawn as «Стандартний». The rules accept
  the format (§5.3), not only the five names, for the same reason. Code without PR B (an old service worker cache, .app before a release) drops
  the field when it reads a note, and its next write of that note sends it without the colour; the merge then takes the absence. That is the
  same as `pinned` had and is listed in §6.

### 5.2 sync.js

- `canon`: `color` absent or empty means not set (as `pinned`).
- `normNote`: `color` must be a string of 1–`LIM.color` (24, already defined in `sync.js`) characters from `[a-z0-9-]`; anything else is
  `{bad:'color'}`; absent, `null` or `''` mean not set.
- `SOFT_FIELDS` becomes `['pinned','color']`: a colour changed differently on both sides goes by the key with no conflict copy; `merge0`
  handles every soft field through `unsoft` and its loop.
- `moveInto` (a late copy revived without a revived note, `sync.js` ~line 151): it drops `pinned` today; `color` is kept (a revived copy keeps
  its look; it is not a position in a list). Tested in `syncmerge.mjs`.
- A colour change is a local write and moves `updated` (§4.4 of `docs/SYNC-PLAN.md`). Consequence for the owner: like an edit, colouring a note
  moves it to the top of «Інші» (the list is ordered by `updated`) and its date shows the time of the colouring. Keeping the order would need a
  separate «content time» field and is not part of this plan.

### 5.3 Rules and the test cloud

- `firestore.rules`, `live(d)`: `color` joins `hasOnly`, and `optColor(d)`: `!('color' in d) || (d.color is string && d.color.matches('^[a-z0-9-]{1,24}$'))`.
- `tests/lib/cloud.mjs`: `LIVE_ONLY` gets `color`, the shape check the same pattern.
- `tests/rules/firestore.mjs`: deny a number, an empty string, an upper-case and a 25-character colour; allow `blue` and an unknown `teal`.
- `docs/SYNC-PLAN.md`: the document shape (§4.2), the merge (§4.7: `color` is a soft field like `pinned`), the rules text (§4.16), and item 4
  of §6: publish the rules and add the single-field index exemption for `color`, as item 3 did for `pinned`, before PR B is merged.

### 5.4 index.html

- `noteSig` stays without `color`; `fbPut` lets a newer copy that differs only by a soft field move in (the condition covers `pinned` and
  `color`); `backupOf` keeps the colour and drops the pin, as today.
- Import: `color` taken when it passes the `normNote` format check; export carries it (notes are written as they are). Older files without
  `color` import unchanged.
- History: versions and conflict copies hold only the title and the blocks (`vcapture` → `manifestOf`, `normVersion`), and restoring a version
  (`restoreWith`/`putState`) sets only the title and the blocks, so the colour, like the pin, is neither stored in history nor changed by a
  restore. No code change; one test.
- The write: `pinNote` is generalised into `softSet(n, field, value)` driven by a per-field table:

  | | pin | colour |
  |---|---|---|
  | allowed on | notes (not archived, not trashed) | notes and archived notes, not trashed |
  | no-op when | `!!n.pinned===on` | `(n.color||'')===(value||'')` |
  | delta on the stored record `C` | null when `C` is archived or trashed or already in that state | null when `C` is trashed or already has the value |
  | merged into archive/trash by the write | keeps the stored pin | sets the value outright (not trashed) or keeps the stored one (trashed) |

  The guards stay as they are for both fields (`held`, `unsaved` → `pin.unsaved`/`color.unsaved`, `FELL`, `REVIVING`, another write in flight
  without a snapshot → busy; the open note written whole through `editorDelta`). `PINREV` stays one record per note (renamed `SOFTREV`): a
  field-only write of either field in flight is replaced by the next soft write, which sets its own field outright and reads the stored record,
  so a pin after a colour on a closed note does not answer «busy».
  Since #90 `softSet` is a field write (`fieldWrite`, `docs/SYNC-PLAN.md` §4.10): while the note may be ahead of the store (a write failed or
  on its way, a localStorage leftover, the open note) it goes whole with its field set outright on the result, so the waits after a failed
  write and with a leftover (`pin.unsaved`/`color.unsaved`, `pin.wait`/`color.wait`) and `SOFTREV` are gone; only the wait while the note is
  revived stays (`pin.busy`/`color.busy`). The merge rule of the last table row stays: where a field does not apply, its stored value stays.
- Hover layout: the offsets of the buttons and the title padding are fixed per button today (`.it-p{right:58px}`, `.item.pa:hover .it-t
  {padding-right:54px}`); the palette gets the fourth offset and the title padding grows by one button (checked in the desktop test).
- UI: the palette button is first among the item buttons (touch mode and hover), with the note's colour as its background and a dot of the
  swatch colour in its corner; `aria-label` «Колір: {name}» (`color.button`), `aria-haspopup="dialog"`, `aria-expanded` while the drop-down is
  open.
- The drop-down: a `role=dialog` element in `document.body` with `position:fixed` next to the palette button, below it or above when there is no
  room, clamped to the viewport; touch: a 3×2 grid of 30 px circles with names under them in cells at least 44 px high; computer: one row of six
  circles with the names as `title` and `aria-label`. Circles keep `flex:none` and `aspect-ratio:1` so a two-line label cannot squash them. The
  swatches are a `role=radiogroup` of `role=radio` with `aria-checked` (as the text size choice `tszUi` does); the current colour has a ring
  and a check; the header shows «Колір нотатки» (`color.title`) and the current name. Choosing
  writes the colour and closes the drop-down; on touch the action mode stays open so the palette button shows the new colour. Escape, a pointer
  down outside, a user scroll and Back (`nav` entry `'palette'`) close it. Keyboard: the arrow keys move between colours, Enter or Space
  chooses, the focus returns to the palette button.
- The context menu gets the six colours under «Відкрити» as `role=menuitemradio` items with the class `.mi` and a modifier `.mi.sw1` that
  lays them out inline (`.amenu .mi` is a full-width flex row today), `aria-checked` on the current one, in one row
  and included in the roving: ArrowUp/ArrowDown step through them like other items, so the keyboard reaches every colour.
- Item background: `.item[data-color=…]` with the area colour tokens (light, dark, sand, as `.ablk[data-color]` has them); a pinned note with a
  colour keeps its colour and shows the pin mark; the current item keeps its outline over any colour.
- Strings in both files: `color.title`, `color.button`, `color.none` («Стандартний»), `color.yellow`, `color.green`, `color.blue`, `color.pink`,
  `color.purple`, `color.busy` (mirroring `pin.busy`; `color.unsaved` and `color.wait` went with #90), and the new text of `list.holdHint`.

### 5.5 Tests (PR B)

- `syncnorm.mjs`: valid colours kept, unknown valid strings kept, invalid ones `bad:'color'`, empty treated as not set.
- `syncmerge.mjs`: a colour changed on one side merges; changed differently on both sides goes by the key with no conflict copy; colour and
  content changes together merge both; `merge0` with only the colour different makes no copies; `moveInto` keeps the colour.
- `tests/rules/firestore.mjs` and `tests/lib/cloud.mjs` as in §5.3.
- A new browser scenario `tests/appcolor.mjs`: the palette from the hover button and from the context menu on a computer; from the action mode
  on a phone (hold, tap the palette, choose; the item's background and the palette button change; the mode stays); «Стандартний» removes the
  field from storage; the colour of an archived note; no palette in the trash; the colour survives a reload, export and import; an older export
  without `color` imports; another device through the test cloud receives the colour (as `apppin` does for the pin); a colour chosen while the
  note is open and being edited keeps the edit; a pin right after a colour on a closed note pins (no «busy»); restoring a version leaves the
  colour; the swatches are circles (width equals height) at the default and the largest text size; near the bottom of the list the drop-down
  opens upwards and stays inside the viewport.
- `appi18n.mjs` passes with the new keys.

### 5.6 Release order

1. PR B is reviewed and green.
2. The owner publishes the rules from the PR branch in the Firebase console and adds the index exemption for `color` (they accept every document
   the old rules did, so .app keeps working).
3. PR B is merged; .dev gets it.
4. A release to .app later, when the owner asks.

## 6. Risks

- **A long press is not discoverable.** The hint toast (§4.7) on the first three taps.
- **Timing on slow phones.** 450 ms is the existing `HOLD_MS` of the sheet and close to Android's long-press timeout; the mode does not depend
  on the browser's own long-press events.
- **Android's text selection and menu** on a long press: prevented by `user-select:none`, `-webkit-touch-callout:none` and the cancelled
  `contextmenu`; checked on the device by the owner (§7).
- **Old code erasing a colour** (§5.1): a device on code without PR B writes a coloured note without the colour. Same as `pinned`; it ends once
  every device has the new code.
- **Mixed devices** (§4.1): checked on the owner's computer.

## 7. Manual checks for the owner

- Android, Chrome: tap opens; hold shows the buttons with a short vibration; releasing presses nothing; pin, archive, bin; Back closes the mode
  and then the panel; a scroll that starts on an item scrolls and opens nothing.
- Computer: hover buttons, right-click menu, Shift+F10.
- PR B: the palette on both; the colour on another device.
