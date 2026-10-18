# Mobile version of «Чистый лист»: improvement plan, revision 2 (after the review)

[now Baobook: `public/index.html`]

Date: 2026-10-03. Revision 1 (commit `68fbe9c`) was reviewed; the review text is next to this file: [MOBILE-REVIEW.md](./MOBILE-REVIEW.md). This revision answers every remark and rewrites the plan in the recommended order: **saving and input → accessible actions and recovery → gestures and refactoring**.

App: `sheet/index.html` (one file, vanilla JS, PWA, no build step). Live version: https://yokogamma.github.io/mockups/sheet/. Tests: `sheet/tests/` (Playwright, 18 scenarios, how to run them is in `sheet/tests/README.md`). Storage and sync: `sheet/SYNC-PLAN.md`.

State: PR A (sections 3.1 and 3.2) is implemented in this same branch, scenarios `appsave.mjs` and `appkb.mjs`; differences from the text of the plan: the «Новий блок» button on touch is only a «+» icon (the label does not fit next to «Готово» at 360 px), the panel is shown only for text blocks (in code and titles the keyboard is closed with the system button), the «⋯» of the area and of the code block were not changed. After the reviewer checked the code, four places were fixed: `beforeunload` counts unfinished writes (`inflight`); each note has a write revision number, and an old successful response does not clear a new error; creating, importing and migrating go through the same `writeNote`; the caret is scrolled above any bottom panel (the «⋯» row, the toast, the keyboard), taking their total height into account. GitHub Actions (`.github/workflows/tests.yml`) runs all scenarios on PRs and on a push to `main`. The first check on Android showed the sheet cut in half after the keyboard (a consequence of `interactive-widget`); it was fixed in a separate PR. After checking on the phone the owner decided to remove the flow layout: the sheet on a phone is now free on both axes, and a hold on the text of a block without a caret, or a tap on the ⋮⋮ handle, turns on position mode with arrows (← → to the edges, ↑ ↓ to the neighbours); dragging by the handle stays free. On Android the system long press fires before our timer (threshold ≈400 ms) and sends pointercancel, so the text of a block without a caret is not selectable for the system, and the caret on a tap is placed from code (`focusAt`); scenarios `appflow.mjs` (rewritten) and `appsel.mjs`. Not checked on devices: that is the owner's task, by the matrix of section 5.

Edits after the second review pass (2026-10-03): the owner's decisions on three questions of section 8, a debug switch for a storage failure without a reload, unsaved versions by `noteId`, a Back route without empty history steps, overflow of the formatting panel on a narrow screen.

PR B state (2026-10-05), part 1: «⋯» on text blocks on touch (3.3) with «Копіювати блок», «Виділити» and «Видалити» (undo through the «Скасувати» toast), «⋯» in the app header instead of the spelling, grid, theme and clear buttons, 44 px touch targets for the header buttons, the code card headers, menu items and the ⋮⋮ handle (3.4); scenario `appmenu.mjs`. Differences from the text of the plan: the selection mode with the ← ↑ ↓ → arrow panel and «Готово» was done earlier (see `appsel.mjs`), so the mini panel of 3.3 with «Вище»/«Нижче» and «⋯» was not added: moving is done with the arrows, and copy and delete through the block's «⋯»; on touch a block is not deleted from the panel, only from the menu. After checking on the phone the owner changed the decision of 3.3: «⋯» is visible only on the selected block (position mode) or the block being edited, not on all of them all the time: on a page with a dozen blocks the icons were distracting; on the selected block the «Виділити» item is not shown. The area button in the header on touch read as a version switch and created extra areas, so it was removed: an area is drawn with a finger (a hold on empty space, then a drag draws a frame, as with a mouse on a computer; `touchmove` with `preventDefault` after the hold fires, so the finger does not scroll the page), and «Нова область» is the first item in the header «⋯». The area header on touch (3.5) is one 48 px row: the title on the left with an ellipsis (no narrower than 40 % of the header), on the right the color, «⋯», collapse; unchanged on a computer; by the owner's decision the area title is set in the color and weight of «Без назви» (`--ink-3`, 500), and an empty title on touch shows no placeholder (only while editing). The code block header in one row with «⋯» for wrapping and line numbers (3.5) is not done yet.

PR B state, part 2 (2026-10-05): the undo stack (3.6): `undoStacks` by `noteId`, up to 20 entries per note, an overall limit of 200 entries and ~2 MB of snapshots (the oldest are pushed out first); entries are pushed by deleting a block («⋯», erasing the text), deleting and ungrouping an area, moving with the arrows (silently, without a toast: a toast on every arrow press would get in the way); a toast without a timer for an area with blocks and for multi-line text, a ✕ button instead of «Готово» (not to be confused with «Готово» of the keyboard panel); Ctrl+Z outside fields takes entries off one at a time; «Скасувати: …» with the caption «до перезавантаження» is in the header «⋯» on touch (a computer has no «⋯» menu, Ctrl+Z is used there); going to another note hides the toast, the stack stays; a direct `remove()` stays for empty blocks (there is nothing to bring back). The items «Вище», «Нижче», «В область», «З області» and size by preset were not done: they are not in the interface. Scenarios `appundo.mjs` 5–8, `appmenu.mjs` 9. Part 3: the Back route and accessibility (3.7, 3.8).

PR B state, part 3 (2026-10-05): the `nav` module (3.8): the notes panel on a phone, the «⋯» menu (block and header), the area menu, the language menu, the "as on a computer" overview and position mode push a history entry when they open; `popstate` closes the top overlay; closing from the interface rewinds the history and silences its own `popstate`, and a `pushState` asked for while the own `popstate` has not arrived yet is deferred (otherwise the browser ran `go(-1)` relative to the already new entry and went to the wrong place); if the expected `popstate` does not arrive within 600 ms, the waiting is reset. The route "panel → open → Back": opening a note from the panel hides the panel without removing its entry and adds a «нотатка» entry; Back shows the panel with the same query and the list's `scrollTop` (kept in memory), a second Back hides the panel. On a computer the panel is not an overlay and makes no entries; menus do. Accessibility (3.7), the basics: `button:focus-visible`, `prefers-reduced-motion`, ←/→/Home/End navigation over `role="toolbar"`, Esc leaves position mode from a hardware keyboard, the focus on the position panel does not end the mode; the check "every button has a name" is in `appnav.mjs`. Not done: updating the list in place (the list is redrawn, but the query and the scroll are restored), checking TalkBack/VoiceOver by hand. Scenario `appnav.mjs`.

PR C state, part 1 (2026-10-05): dragging by the header (3.5): `drag(b, handle, {hold, skip, quiet})` on the same mechanics as the ⋮⋮ handle: with a mouse at once (except on the buttons and the title), with a finger after `HOLD_DRAG_MS` = 350 ms without moving more than `HOLD_SLOP` (the card gets `lift`: a shadow and scale 1.02, `prefers-reduced-motion` removes the transition), then `touchmove` with `preventDefault`; before the hold fires, the finger scrolls; a hold on the title lifts too, if the title is not being edited; the context menu on the header is suppressed, the title on touch is not selectable outside editing. The ⋮⋮ handle on touch is 0.45. The code block header on touch (3.5) is one 48 px row: the language, the title, «Копіювати» as an icon, the lock, «⋯» with wrapping and line numbers (`.cmore`, `popMenu`). Alternatives to dragging in the text block's «⋯»: «В область…» (a list of areas by title), «З області» (the same cell as inside, like `ungroup`), «Розмір» with the presets «Авто»/«Коротший»/«Вищий» (±2 rows of `ch`); «Вище»/«Нижче» were not duplicated: these are the ↑/↓ arrows of position mode. The 350/250 ms comparison on devices was not done.

PR C state, part 2 (2026-10-05), refactoring without a change of behavior (3.9): the module `gesture(el, {slop, holdMs, filter, manual, onDown, onHold, onMove, onEnd, onCancel})` on pointer events, with shared move and release listeners on `document` (the capture phase, so the pointer capture of dragging does not get in their way); it runs creating a block with a hold on the sheet and in an area (`holdGesture`), dragging by the handle and by the header (`drag`), position mode with a hold on text (`selHoldOn`) and the area frame with a mouse (`marqGest`); thresholds: `HOLD_MS` 450, `HOLD_DRAG_MS` 350, `HOLD_SLOP` 8, the mouse frame 6, "did the block move" in dragging 2 px (as before). `cardBar({lang, ph, label, actions, overflow})` builds the code and area headers, `cardMore` builds the «⋯» menu from the overflow buttons (the label is the title, the state is aria-pressed); one 48 px row on touch for both cards in one container query ≤640 px (code used to switch at ≤560; on a tablet with a wide card it is now one row too). All the rules for touch screens (16 `@media (hover:none)` blocks) are gathered into one block at the end of the styles, in the same order. The scenarios did not change, except the check of the order of the code «⋯» menu items in `appcard.mjs`. Part 2: the undo stack (3.6); part 3: the Back route and accessibility (3.7, 3.8), headers in one row (3.5).

After revision 1, `main` got PR #24 (the caret in the «код» chip is visible, typing after the chip goes outside it), #25 (the state of the overview button, dates in the list, plural forms of the counter, the area «⋯», a hint for iPhone) and #26 (an own edit history for Ctrl+Z in fields). The line references below are to `sheet/index.html` of this branch and do not match the references in the review, which are pinned to commit `68fbe9c`.

## 0. Answer to the review

All eight remarks are accepted. Two clarifications (to items 5 and 6) were decided by the owner; the decisions are in the table and in section 8. The review's answers to the open questions of revision 1 are accepted in full.

| # | Review remark | Decision | PR |
|---|---|---|---|
| 1 | P1: the save error is hidden on the phone | Accepted, the fact is confirmed: `@media (max-width:640px){ .cnt,.saved{display:none} }` (line 152) hides the `.saved.err` state too. On top of that, any failure is labeled «сховище переповнене» (655), though `db.save` swallows the exception without looking at it (518). The status contract is in 3.1 | A |
| 2 | P1: the entry to block actions must stay visible | Accepted: on touch screens every block has a permanent «⋯» button; the hold and the handle stay as shortcuts; automatic deselection on scroll is removed; the exit is «Готово», a tap elsewhere, Esc. The contradiction between 3.1 and 3.3 is resolved: copying on touch is the system menu for text and «Копіювати блок» in «⋯»; the formatting panel on touch has no copy. The contract is in 3.3 | B |
| 3 | P1: agree on the touch targets | Accepted: the target is 44–48 CSS px on both axes for frequent actions, with no overlaps. The 32 px header requirement is dropped: on touch the header is 48 px (the code block already has it: `.cbar{height:48px}` under `hover:none`, line 241), on a computer 32 px, unchanged. The contract is in 3.4 | B |
| 4 | P1: the full flow of the keyboard and the bottom panels | Accepted, six points of the contract in 3.2; the panel on touch gets «Готово» and «Новий блок». `interactive-widget=resizes-content` is an implementation detail for Chrome; the main mechanism is `visualViewport` (already there, line 1096); the criterion is the behavior on devices | A |
| 5 | P1: deletion needs reliable recovery | Accepted: a stack of structural operations per note; it lives until the tab reloads, and moving between notes does not destroy it (the owner's decision); the limits are named explicitly (3.6); a toast without a timer for deleting with content; every deletion path must push an entry onto the stack. A clarification to "do not intercept the native text undo": fields have their own history since #26, because the browser's history got fragmented by DOM updates and did not see the chips; the system undo gestures (shaking and three fingers on an iPhone, «Скасувати» from the context menu) are already routed into it through `beforeinput` with `inputType` `historyUndo`/`historyRedo` (line 982). This stays; the system menu and the selection gestures are not intercepted | B |
| 6 | P2: dragging must have an alternative | Accepted: «Вище», «Нижче», «В область…», «З області» and size by presets in the block's «⋯» menu (WCAG 2.2 SC 2.5.7). The height of a text block in the flow layout stays in PR C as presets plus a handle in selection mode (the owner's decision: the feature is needed, but PR A is not held up for it) | C |
| 7 | P2: accessibility as part of acceptance | Accepted: the contract in 3.7 and the matrix in 5. The formatting panel has `aria-pressed` (184), and it stays; the block mini panel has its own id `blockbar`; the keyboard in `role="toolbar"` follows the APG; 320 px and 200 % text are in the matrix | B, regression in all |
| 8 | P2: the main note route | Accepted: the scenario "list → search → open → edit → back" in 3.8 and in the manual check. The system Back is not intercepted now (there is no `popstate` or `pushState` in the code); with the panel or a menu open it closes the installed PWA; the Back contract is in 3.8 | B |
| — | Answers to the open questions of revision 1 | Accepted: behavior on a computer does not change; a 350 ms hold as a starting hypothesis, checked against 250 ms on devices; a visible entry to the actions always, resize handles only in selection mode and never while typing | — |
| — | Estimates | Recounted in section 4 as ranges, with hours on devices separately; hours of CSS are not enough to confirm behavior, and this is taken into account | — |

## 1. Starting facts

Measured in phone emulation (Chromium, 390×844, `hover: none`, `pointer: coarse`) and checked against the source; lines are per `sheet/index.html` of this branch.

| Problem | Fact | Where in the code |
|---|---|---|
| Save error on the phone | Up to 640 px the status element is hidden entirely, the error included; the error text is always «сховище переповнене», the cause is not established; the write cannot be retried | CSS `.saved` 150–152, `db.save` 518, `markDirty`/`flushSave` 651–655 |
| Undoing structural operations | One operation, 7 s, the next one replaces the previous; opening a note calls `dropUndo()`; `remove()` does not create an undo itself, only three calls of `offerUndo` do (erased text, ungroup, delete an area) | `UNDO_MS`, `offerUndo`, `dropUndo` 957–960, `openNote` 656, `remove` 1000, the area menu 1038–1039 |
| Edit history in fields | Each field has its own history: typing as one step, chips, formatting, Ctrl+Z/Y in any keyboard layout, `historyUndo` from `beforeinput` (merged in #26) | `histRec`, `histGo` 970–990 |
| System Back on the phone | `history.pushState`/`popstate` are not used: Back with the notes panel, a menu or the overview open closes the installed PWA or leaves the site | — |
| Search and returning to the list | Search by title and text exists, and so does the empty result «Нічого не знайдено»; the query is reset by «Нова нотатка», the list's scroll position is not kept after returning, the list is redrawn entirely | `renderList` 543–551, search 690–692, 659 |
| Area header on a narrow card | The title goes to a second line under the buttons, the header is 68 px instead of 32 | CSS `@container (max-width:420px)` and `@media (hover:none){ @container (max-width:640px) … }` for `.ablk .ctitle`, 266–278 |
| An area cannot be dragged by its header | Touching the header and moving 120 px does not change the position | `drag(b, grip)` is attached only to `.grip` |
| The ⋮⋮ handle on a touch screen | 20×24 px, opacity 0.28, left of the card | `.grip` 189, `@media (hover:none){ .grip{opacity:.28} }` 200 |
| Conflict when selecting text | The Android system menu at the selection, our panel above the keyboard, the keyboard panel; the «+» button covers our panel by 52 px and hides «Копіювати» | `#bubble` 182–188, `placeBubble()` 1095, `.fab` 124–126, the rule `#undo.show ~ .fab` hides «+» only for the undo toast |
| Duplicated copy | Our «Копіювати» in the panel repeats Copy in the system menu | `#bubble button[data-act="copy"]` |
| Text block size on a touch screen | The resize handle is off (`display:none` in the flow layout, `opacity:0; pointer-events:none` on touch); on a tablet the size cannot be changed on the canvas | `.sheet.flow .rz`, `@media (hover:none){ .tcard .rz … }` 298 |
| The «Скасувати» toast | Pinned to the bottom of the window; with the keyboard open it can go under it | `.undo{bottom:18px}` 343 |
| Behavior when the keyboard appears | `<meta name="viewport">` has no `interactive-widget`; the formatting panel already computes the bottom by `visualViewport`, the toast and «+» do not | line 5, 1096, 1111 |
| Touch targets now | App header buttons 40×40 with a gap of 4 (fixed in this branch; before, 30×28 with no gap: a miss on «Нова область» created an empty area); card header buttons 44×40; the ⋮⋮ handle 20×24; the resize handle 26×26; formatting panel buttons 56×40; area menu items ≈38 high | 153, 241, 189, 289, 188, 312 |
| Touch styles | Twelve `@media (hover:none)` blocks in different places (126–349); their order affects specificity | — |

Not a bug, but worth knowing for the reviewer: the phone no longer has the flow layout (removed after PR A by the owner's decision), and the sheet on a narrow screen is the same free canvas; a hold of ~450 ms creates a block where the finger is; a hold on the text of a block turns on position mode with arrows; a click on the ⋮⋮ handle without dragging copies the block; in the «код» chip the icon at the right edge copies; empty text blocks are not saved.

## 2. Patterns we rely on

- **Save status** (Google Docs, Notion, Apple Notes): the success state is compact and disappears; an error stays with a «Повторити» action until a successful write; being offline is not an error while the copy on the device is intact.
- **A snackbar with undo plus an undo stack** (Gmail, Google Keep, Apple Notes): the toast only reports the last operation; undo stays available after it disappears, through a menu, a key combination or a gesture.
- **A card whose title is the handle** (Trello, Milanote, Google Keep, Apple Freeform): the title on the left in one row with an ellipsis, the actions on the right, the card is dragged by the header; on a touch screen it lifts after a hold, so that scrolling is not broken.
- **Block selection mode** (Freeform, Keynote, Miro on a tablet): a tap on the handle selects the block, a frame with handles and a mini action panel appear, a tap on the text enters typing. Handles are never shown while typing.
- **The formatting panel as a keyboard accessory with «Готово»** (iOS `inputAccessoryView`, Notion, Craft, Bear): only formatting and finishing input; copy and paste belong to the system menu; floating buttons hide while the keyboard is open.
- **An alternative to dragging in a menu** (Notion mobile «Move to», Apple Reminders, Trello «Move»): the same moves with a sequence of taps, as WCAG 2.2 SC 2.5.7 requires.
- **Target size**: 44 pt (Apple HIG), 48 dp (Material), WCAG 2.2 SC 2.5.8 at least 24 px with spacing.
- **Overflow in the header** (Notion mobile, GitHub mobile): more than three actions go into «⋯».

## 3. Behavior contracts

### 3.1. Save status (PR A)

States and how they show:

- «зберігається» (●) while a write is in flight; «збережено на пристрої» for 1.8 s after a successful write, then the status hides; «не збережено» constantly, until a successful write. No text anywhere promises sync.
- On a screen up to 640 px the success states stay compact (a dot in the header), and the error is always shown: a ⚠ icon in the header (44×44, opens the panel) and a row in the notes panel, `#saveErr` with `role="alert"`: «Не збережено: <reason>. Повторити · Експортувати». The `display:none` rule for `.saved` is replaced by hiding only the success states.
- The cause: `QuotaExceededError` → «сховище переповнене»; other errors → «помилка сховища (<name>)»; «тест» for the debug mode. `db.save` returns `{ok, reason}` instead of `true/false`.
- «Повторити» sets `dirty=true` and calls `flushSave()`; the status changes only by the result of the new write. «Експортувати» from the error state takes the current model (`serialize()` of the open note plus the other notes from memory), not the copy from storage.
- Unsaved versions live in memory by `noteId`. `flushSave` puts the current blocks into the note object before the write (`cur.blocks=serialize()`, 653), so moving to another note by itself loses no data; only a reload or closing the tab loses it. The set `unsaved` (`noteId` → cause, time) keeps which notes are not written. Going to another note does not replace the error with the «збережено» status of another operation: the row in the panel lists the unwritten notes by title. «Повторити», and the automatic retry on returning to the note and on `visibilitychange`, write the latest version from memory for every note in `unsaved`. Export takes the notes from memory (`exportAll`, 672–673), so the file gets the latest version even when storage fails. While `unsaved` is not empty, `beforeunload` asks to confirm closing; on a phone this is unreliable, so the main mechanism is the constant error in the interface.
- Debug mode: the address parameter `?debug=1` shows a switch «Імітувати відмову сховища» in the panel footer (its state is in memory only, not saved); while it is on, `db.save` answers `{ok:false, reason:'тест'}` to every write. Turning it off needs no reload, so the unsaved copy in memory stays and the retry can be checked honestly. In autotests the same flag is set through `page.evaluate`.

Code: `markDirty`/`flushSave` 651–655, `db.save` 518, `storageUI` 667, CSS `.saved` 150–152, a new element `#saveErr` in the panel, an icon in `.top`.

### 3.2. Keyboard and bottom panels (PR A)

1. **Finishing input.** The formatting panel on touch has a «Готово» button: it removes the focus, closes the keyboard and clears the selection. Esc on a hardware keyboard already does the same (819).
2. **The next block while «+» is hidden.** The same panel has a «Новий блок» button (a + icon): it creates a block under the current one (in the flow layout the next slot, on the canvas a row below, by the logic of `createNext`) and moves the focus there. The «+» button in the corner is hidden while the focus is in any field (text, code, titles), while the formatting panel or the toast is visible, and while the notes panel or the overview is open; it comes back 150 ms after the focus is lost (checked by `document.activeElement`, not by the window height).
3. **Formatting keeps the selection.** `pointerdown` on the panel buttons with `preventDefault` (already there, 1108); after the command the selection range is the same (`getSelection()` compared before and after), and typing goes on at the same place without another tap.
4. **Undo and the panel at once.** The «Скасувати» toast sits above the formatting panel (`bottom` = panel height + 8 px), both above the bottom of `visualViewport`; when the panel or the toast shows, the active line is scrolled into view (`scrollIntoView({block:'nearest'})` with a margin for the panel height), so the caret and the last line are not covered.
5. **Recalculation without jumps.** One `visualViewport` handler (`resize` and `scroll`) sets the CSS variable `--kb` (the keyboard height) and positions the panel, the toast and «+»; rotation and a change of browser chrome go the same way; «+» does not appear by mistake while the focus is in a field.
6. **Safe area once.** `env(safe-area-inset-bottom)` is added only to the lowest element (the panel or the toast); the others count from it. Without `visualViewport` the panel is pinned to the bottom of the window, as now.
7. **The panel on a narrow screen and with large text.** Button priority: «Готово», «Новий блок», B, I, U, S, «</>». The panel does not wrap to a second row: when the actual width does not fit all buttons with 44 px targets, the lowest-priority ones go into the panel's «⋯» (a pop-up row above it); the calculation uses measured sizes through `ResizeObserver`, not the number of buttons, so 200 % text goes the same way. The panel height is `min-height: 48px`, not fixed: with large text it grows, and the button targets stay at least 44 px.

`interactive-widget=resizes-content` was tried in PR A and removed after a check on Android: when the window shrank for the keyboard, the sheet got a `min-height` from the reduced `innerHeight` and stayed half the screen after the keyboard closed (no grid, and a hold there created nothing). There is one mechanism for all browsers, `visualViewport` (item 5); the sheet height is computed from the window height without the keyboard and recomputed on `resize`. The release criterion is the scenario of section 5 on real Android and iOS, in the browser and in the installed PWA.

Code: `placeBubble` 1095–1096, `fab` 124–126, 699, 1202, `.undo` 343, `<meta viewport>` 5, `createNext` 1089.

### 3.3. Entry to block actions, selection, copying (PR B)

Applies to touch input: `hover: none` for styles and the event's `pointerType === 'touch'` for behavior, so hybrid devices (Surface, an iPad with a mouse) decide by the actual input.

- In reading mode every block shows a «⋯» button (a 44×44 target, a 20 px icon, in the top right corner of the card; for an area and a code block it is the existing «⋯» in the header). Opacity 0.5 is a starting value, checked on the light and dark themes and on the colored backgrounds of areas; with focus, in selection mode and with the menu open, 0.9. It does not hide before the first touch (the owner's decision). A tap opens the actions menu: «Копіювати блок», «Виділити», «Вище», «Нижче», «В область…» or «З області», «Розмір», «Видалити»; for an area, «Розгрупувати» and «Видалити область і N блоків» instead of the last two.
- A short tap on the text places the caret, as now. A tap on the ⋮⋮ handle or the «Виділити» item turns on selection mode: a frame in `--sel-line`, a corner resize handle (visible part 28 px, target 44), moving by dragging the ⋮⋮ handle without a hold. A hold on the header or the handle is a shortcut, not the only way.
- Scrolling does not clear the selection. The block mini panel `#blockbar` («Копіювати», «Вище», «Нижче», «Видалити», «⋯», «Готово») is pinned above the bottom of `visualViewport` and does not depend on where the block is on the screen.
- Leaving the mode: «Готово», a tap on another block or on empty space, Esc on a hardware keyboard. A tap on the text of the selected block switches to typing and removes the frame and the handles at once.
- Copying on touch: the system selection menu for text; «Копіювати блок» in «⋯» and in the mini panel; the icon of the «код» chip. The formatting panel on touch has no «Копіювати» button; on a computer it stays.
- On a computer a click on the handle still copies the block; the mini panel and «⋯» do not appear on text blocks.

Code: `.grip` 189, 200, `copyBlock` 1107, `remove` 1000, `ungroup` 1003, the area menu 1035–1039, the new `#blockbar` and the `.blk.sel` state.

### 3.4. Touch targets (PR B)

- The target for frequent actions: 44–48 CSS px on both axes (the buttons of the app header and of the card headers, «⋯», «+», the formatting panel, the mini panel, menu items, the ⋮⋮ and resize handles). For rare actions 24 px with spacing is acceptable (WCAG 2.2 SC 2.5.8). The icon may be smaller; the whole clickable area is measured.
- Targets do not overlap, are not clipped by their container (`overflow`) and do not catch the neighbouring text. If the actions do not fit in a row, the extra ones go into «⋯».
- The card header on touch is 48 px (the code card already has it), on a computer 32 px, unchanged.
- Changes: `.tb` 40×40 → 44×44 (153); `.cb` height 40 → 44 (241); `.grip` a 44×44 target through `::before`, with a visible 20×24 icon (189); `.rz` a 44 target with a visible 28 part (289); formatting panel buttons 56×40 → 48×44, and on a narrow screen and at 200 % text the extra ones go into the panel's «⋯» by the rule of 3.2 item 7 (seven 44 px buttons do not fit into 320 px without margins, and that is not counted as a usable panel); menu items at least 44 (312).
- Measured in `apptouch.mjs`: for every interactive element, `getBoundingClientRect()`, and `document.elementFromPoint` at the four corners 2 px inside hits the same element or its child; neighbouring elements do not intersect.

### 3.5. Card headers in one row and dragging by the header (headers in PR B, dragging in PR C)

An area on a screen up to 640 px:

- One row 48 px high: the title on the left with an ellipsis, at least 40 % of the header width; on the right the color, «⋯», collapse. An empty title shows the placeholder «Назва області…». A short tap on the title opens editing; Enter or Esc closes it.
- Dragging (PR C): the whole header except the buttons is a handle. With a mouse the drag starts at once. With a finger: a hold of 350 ms without moving more than 8 px lifts the card (a shadow and scale 1.02, no animation with `prefers-reduced-motion`), and then movement drags it; without a hold, a touch on the header scrolls the sheet. 350 ms is a starting hypothesis, compared with 250 ms on devices by two measures: accidental drags while scrolling and the felt delay; the threshold is kept in one constant. The context menu on the header is suppressed, and text selection in the header is off except for the title while it is being edited; a hold on the title lifts the card too.
- The ⋮⋮ handle stays for the computer and as a visible fallback entry on touch (a 44×44 target, opacity 0.45, 0.9 on the selected block).

A code block on a screen up to 640 px: one row: the language, the title with an ellipsis, «Копіювати» as an icon, the lock, «⋯»; line wrapping and line numbers go into «⋯». On a computer the header does not change.

Code: `buildArea()` and `buildCode()` (the `.cbar` markup), container queries 266–278, `drag(b, grip)` gets a source (the header) and the shared hold detector from the gesture module (3.9).

### 3.6. Deletion and recovery (PR B)

- A stack of structural operations per note (`ops` by `noteId`), up to 20 entries per note and an overall memory limit (in total at most 200 entries or about 2 MB of serialized snapshots, the oldest pushed out first): deleting a block (with its html and position), deleting an area with its children (a snapshot, like `snapshot` 995), ungrouping, moves from the menu («Вище», «Нижче», «В область», «З області»), size by preset. Every deletion path pushes an entry onto the stack: `remove()` is called only through `removeWithUndo(b, msg)`; a direct call stays only inside recovery.
- The «Скасувати» toast shows the last entry. Entries are undone one at a time: the toast button, Ctrl+Z outside fields (this already works for one entry, 986–989), the item «Скасувати: <operation>» in the app header menu. For a deletion with content (an area with blocks, text longer than one line) the toast has no timer and stays until the next operation or «Готово»; for empty and one-line blocks, 7 s. The stack lives on after the toast disappears.
- The limits we promise (the owner's decision): the stacks live until the tab is reloaded or closed. Going to another note hides the toast, but the note's stack stays: on returning to the note, «Скасувати: …» in the menu and Ctrl+Z outside fields work (now `openNote` calls `dropUndo()`, 656; this changes to hiding the toast without clearing). There is no trash and no recovery after closing; the caption of the menu item says so («до перезавантаження»); a significant deletion is protected by the toast without a timer and by the menu item.
- Undoing a structural operation does not erase later text edits: recovery takes the live blocks as they are and recreates only the missing ones (like `restoreArea` 996–998).
- Text in fields: their own history (#26) stays, and `beforeinput` with `historyUndo`/`historyRedo` is already routed into it (982); the system selection menu and gestures are not intercepted. Undo in a field and the stack of structural operations are independent: Ctrl+Z in a field goes to the field's history, outside a field to the stack.
- The area menu: «Розгрупувати» and «Видалити область і N блоків» as two items, the number in the main label (now it is in the sub-line, 1036).

### 3.7. Accessibility (PR B the basics, regression in every PR)

- Names and states: every button has a text name (`aria-label` «Жирний», «Копіювати блок», not only a symbol); toggles with `aria-pressed` (formatting has it, 184, and so does `.tb`, 148), menus with `role="menu"`/`menuitem` (the area menu has it, 1035), the save status with `role="status"`, the error with `role="alert"`.
- Focus: the order header → sheet → panels; menus and the mini panel open with the focus on the first item, Esc closes them and returns the focus to the trigger (the area menu does this, 1041); a visible focus (`:focus-visible`) on all buttons with a hardware keyboard.
- `role="toolbar"` on the formatting panel and the mini panel: the ←/→ arrows move between the buttons, Home/End go to the start and the end, Tab leaves the panel (APG Toolbar Pattern).
- 320 CSS px and 200 % text (browser zoom and the large font of Android/iOS): titles, buttons, menus and messages are not lost, and there is no horizontal scrolling.
- TalkBack and VoiceOver: find a note, open it, edit, save, delete a block and undo; the save status, the error and the toast are read out.
- `prefers-reduced-motion`: lifting and scaling the card without animation (an improvement, not a blocker).
- Unique ids: the mini panel `#blockbar`, the error row `#saveErr`; there is no second `#bubble`.

### 3.8. The note route and the system Back (PR B)

- Scenario: a list of 50+ notes → search by title and text → «Нічого не знайдено» on an empty result (exists) → open the found note → edit → back to the results: the query and the scroll position of the list are kept (the list is updated in place, not redrawn entirely).
- The panel's on-screen button: on a phone the notes panel is an overlay; closing it returns to the note, and the edits are already written (`flushSave` on switching exists, 656) or an error is visible per 3.1.
- The system Back, one `nav` module: every overlay (the notes panel, the «⋯» menu, the language menu, the "as on a computer" overview, selection mode) does a `pushState` with a mark when it opens, and `popstate` closes the top overlay. Closing an overlay from the interface («Готово», Esc, a tap outside, choosing an item) calls `history.back()` and silences its own `popstate`, so no empty history steps are left; opening the same overlay again replaces the entry (`replaceState`) instead of growing the history. With the keyboard open, the first Back closes the keyboard (the system does it), the next one the overlay.
- The route "list → open → Back" on a phone: opening a note from the panel closes the panel and leaves a "panel with results" entry in the history (the query and the scroll position are kept in memory); Back from the note opens the panel with the same results; a second Back closes the panel and returns to the note, with the entry removed; a third, on the main screen with no overlays, goes to the browser (close the PWA or return to the previous site): this is what "not intercepted" means.
- Acceptance: the user returns to where the note was opened from; Back does not close the app from an intermediate mode; after a menu or the panel is closed, no extra Back presses are needed.

### 3.9. Refactoring gestures and headers (PR C)

- One gesture module, `gesture(el, {tapSlop, holdMs, onTap, onHold, onDragStart, onDragMove, onDragEnd, onCancel})`, on pointer events with `setPointerCapture`. Creating a block with a hold, dragging by the handle and by the header, and selection mode use it. Now these are four handlers with different thresholds (2, 6, 8 px) and timers.
- A shared function that builds a card header, `cardBar({kind, title, actions, overflow})`, for code and areas, with one rule for overflow into «⋯» and one layout of the narrow row.
- All the rules for touch screens are gathered into one `@media (hover:none)` block at the end of the styles (now there are twelve).
- Behavior on a computer does not change; the existing scenarios check this.

## 4. PR order and scope

| PR | Content | Tests | Ready when | Estimate |
|---|---|---|---|---|
| A | 3.1 statuses and save recovery; 3.2 keyboard: «Готово», «Новий блок», «+», the toast above the panel, one recalculation by `visualViewport`, viewport meta | `appstore`: a failed write is visible at 390 and 320 px with and without the keyboard, the order "error → another note → back → retry → reload", the failure switch without a reload, export from the error, `beforeunload` with unwritten notes; `apptouch`: the cycle of section 5, the panel at 320 px and at 200 % with overflow into «⋯» | An artificial storage failure is visible and can be fixed; the input cycle passes; the bottom elements do not cover each other, the caret or the last line; all scenarios pass | 4–6 h of code and autotests, 1–2 h on devices |
| B | 3.3 «⋯» on blocks, selection mode, the mini panel; 3.4 touch targets; 3.5 headers in one row; 3.6 the undo stack; 3.7 basic accessibility; 3.8 the route and Back | `apptouch`: hit areas, «⋯», selection without automatic clearing, two deletions in a row; `appundo`: the stack, the limits; a new `appnav.mjs`: search → open → back, Back from the panel and menus | Everything main is reachable without a hidden gesture; operations in a row can be undone; hit areas are measured; behavior on a computer did not change | 8–12 h, 2–3 h on devices |
| C | 3.5 dragging by the header with a hold; drag alternatives («Вище», «Нижче», «В область…», «З області», «Розмір»); the 350/250 ms threshold; 3.9 the gesture module, `cardBar`, one block of touch styles; the text block height in the flow layout by presets and a handle | `apptouch`: dragging by the header, the alternatives give the same result as drag; `appflow`: height; regression of everything | Gestures do not get in the way of reading and selection; the alternatives are equivalent; the regression passes | 8–10 h, 2 h on devices |

Each PR can be merged on its own, does not change behavior on a computer and passes all scenarios; publishing after each: a PR into `main`, GitHub Pages, a check of the live page. Cosmetic animations come after C. Each PR description records separately what passed, what failed and what was not run, with the versions of the devices, OSes and browsers.

## 5. Test matrix and acceptance

Automatically (Playwright, Chromium): a computer at 1280×800; a phone at 390×844 and 320×568 with `hover:none`, `pointer:coarse`, touches through CDP; a substituted `db.save`; a check of hit areas by their corners. This covers the logic and the layout, but not the keyboard, the system menu and the gestures of real OSes.

On devices, by hand, with the versions recorded in the PR description: Android Chrome (a phone), iPhone Safari, the installed PWA on both, TalkBack, VoiceOver, portrait and landscape, 200 % text, 320 px (a narrow phone or split screen), a hybrid device with a mouse and a touch screen.

Acceptance of PR A: with `?debug=1` turn on «Імітувати відмову сховища»; at 320–640 px the error is visible with and without the keyboard; go to another note and back: the error and the text are in place; turn off the simulation and press «Повторити»: the latest version from memory is written; only after that a reload, and the content matches; until a successful write the interface does not report success. The formatting panel at 320 px and at 200 % text: 44 px targets, the extra buttons in «⋯», no wrapping to a second row. The cycle: text at the bottom of a long note → selection → formatting → undo → continue typing → «Готово» → «Новий блок», with the keyboard, without it and after a rotation; no needed button or line is covered; «+» does not appear while the focus is in a field.

Acceptance of PR B: a new user who does not know the gestures finds copy and delete through «⋯»; scrolling a long note does not reset the selection; switching to typing hides the frame and the handles at once; the hit areas of all buttons, handles and menu items are measured, and neighbours do not fire on a touch at the edge; the header is usable with a long title and 200 % text; delete two areas in a row and restore both with their content and order; delete with the keyboard open; undoing a structural operation does not erase later edits; going to another note and back behaves per 3.6; the route of 3.8 with Back; TalkBack and VoiceOver per 3.7.

Acceptance of PR C: a 350 ms hold on the header and a move drag the area, a simple touch scrolls, and only `row` changes in the model; the same moves through the menu give the same result; the threshold is compared with 250 ms on two devices, with the observations recorded; all scenarios pass without changed expectations, except the ones deliberately updated in `apptouch.mjs` and `appflow.mjs`.

## 6. How the reviewer checks by hand

1. Open https://yokogamma.github.io/mockups/sheet/?debug=1 on a phone, turn on «Імітувати відмову сховища» in the panel footer, type some text. Expected after PR A: ⚠ in the header, the row «Не збережено: тест. Повторити · Експортувати» in the panel; go to another note and back: the error and the text are in place; turn off the simulation, press «Повторити»: «Збережено»; only now reload: the text is in place.
2. Select a word in a text block at the bottom of a long note. Expected after PR A: «+» is gone, the panel above the keyboard has B, I, U, S, «</>», «Новий блок», «Готово», without «Копіювати»; the Android system menu works as usual; press «Готово»: the keyboard closes and «+» comes back.
3. Tap «⋯» on a text block. Expected after PR B: a menu with copy, moves and delete; «Видалити» gives the «Скасувати» toast; delete a second block, undo twice: both are in place. Tap the ⋮⋮ handle: a frame and a resize handle; scroll: the selection stays; «Готово» clears it.
4. Open the notes panel, find a note by a word from its text, open it, press the system Back. Expected after PR B: the panel opens with the same query and position, and the app does not close.
5. Create an area, type a title. Expected after PR B: the title and the buttons in one 48 px row. After PR C: a hold on the header lifts the card, a move drags it, a simple touch does not get in the way of scrolling; in «⋯», «Вище» and «Нижче» do the same.
6. Switch "as on a computer" on and off several times. Expected already now: no new areas appear; the toggle button sits next to the menu.
7. On a computer, repeat the scenarios from `README.md`: a click creates a block, a drag creates an area, the resize handle is visible on hover and hidden while typing, a click on the handle copies, the formatting panel has «Копіювати».

## 7. Out of scope

- Sync and Google sign-in (the third step of the plan, `sheet/SYNC-PLAN.md`); «Не збережено» never means "not synced".
- Nested areas, co-editing.
- A separate "flow" layout for the phone: it was removed, the sheet is free everywhere.
- Suppressing the system selection menu of Android and iOS: technically unreliable, and users expect to see it.
- Recovering what was deleted after the app is closed (a trash): a separate task after sync.

## 8. Owner's decisions and open questions

1. The height of a text block on a phone stays in PR C (the presets «Авто», «Коротший», «Вищий» in «⋯» plus a handle in selection mode); PR A is not held up for it.
2. Undo: a stack per note until the tab reloads, 20 operations per note and an overall memory limit; moving between notes does not destroy the stack; no trash.
3. The «⋯» button on every text block on a phone is permanent; 0.5 is the starting opacity, checked on light, dark and colored backgrounds, more visible with focus and in the active state; it does not hide before the first touch.
4. Open question: the hold threshold of 350 or 250 ms is decided by feel on the owner's devices after PR C; both numbers are one constant away.

## 9. Overall acceptance checklist (from the review, tied to PRs)

- [ ] A: visible save errors, a retry of the write and recovery of the current content are confirmed.
- [ ] A: finishing input and creating the next block are available with «+» hidden.
- [ ] A: formatting keeps the selection; undo and the keyboard do not cover the controls.
- [ ] A: the formatting panel at 320 px and at 200 % text loses no buttons (overflow into «⋯»); the save error survives moving between notes and a retry without a reload.
- [ ] B: block actions are available without a hold; scrolling does not reset the selection.
- [ ] B: non-overlapping hit areas are measured, the header height is agreed.
- [ ] B: deletions in a row, restoring child blocks and moving between notes are checked.
- [ ] B: search, opening, editing and returning to the results are gone through; Back from intermediate modes.
- [ ] B: 320 CSS px, 200 % text, long titles, portrait and landscape.
- [ ] B: TalkBack and VoiceOver on the main scenarios; `aria-pressed` and names are in place.
- [ ] C: moving and size have an alternative without drag, with the same result.
- [ ] C: a hybrid device with touch and a mouse decides by the actual input, not only by `hover: none`.
- [ ] Each PR: Android Chrome and iPhone Safari on real devices, the installed PWAs; versions recorded.
- [ ] Each PR: all regression scenarios and the new checks are run; what passed, what failed and what was not run is recorded.
- [ ] Each PR: behavior on a computer is kept; the documentation and the actual state contract match.
