# Links between notes

Owner's decisions (2026-10-10):

- The note list stays a flat feed: no folders, no nesting. Notes are tied together with links inside their text.
- A link points either to a note or to one block of a note (a text block, a code block or an area).
- A link looks like a chip that shows the target's current name, like mentions in Notion and Apple Notes (variant A of the mockup). A link with its own text (variant B) can come later.
- The notes that link to the open note are listed under its lowest block (variant 1 of the mockup).
- One PR for all of it.

The mockups with the variants: https://claude.ai/artifact/M6PjvKYgoTJNJVfsNmG8SJ

State (2026-10-10): done.

## 1. Data

- A link lives in the html of a text block, next to `b`, `i`, `u`, `s` and `code`: `<a data-to="NOTE">label</a>` for a note, `<a data-to="NOTE/BLOCK">label</a>` for a block. `NOTE` and `BLOCK` are the ids the notes and blocks already have, so a link survives a rename, a move on the sheet, export, import and the coming sync. The address carries no host, so moving notes from `.dev` to `.app` keeps the links.
- An id must match `[\w-]{1,64}`. Anything else in `data-to` is dropped when the text is read (the label stays as text), as is any foreign `<a>`.
- `label` is the target's name when the text was last saved: «Note» or «Note › Block». It is shown only while the target is gone. Search, the note list, the plain text of copying and older versions of the app see it as plain text.
- `text` (the plain text next to the html) has the label in place of the link.
- No new store, no new field, no migration. Older versions read the html as text with the label; their `cleanRich` drops the tag and keeps the label.

## 2. The chip

- Drawn from the stored html (`paint` → `liveLinks`): the name is the target's name of now. A renamed note shows its new name in every link, and the notes that link to it are not changed and do not move up the list. The stored label catches up when such a note is edited.
- A block is named by its title (code, area) or its first line (text): «Note › Block».
- States:
  - the target note is in the trash: struck through, grey;
  - the note is gone (deleted for good, or not on this device yet before sync): dashed, grey, with the last known name;
  - the note is here but the block is gone: dashed, grey; following it opens the note with the toast «Блок не знайдено — відкрито нотатку».
  - An archived note is linked as usual.
- The chip is `contenteditable=false`: the caret stands before or after it, Backspace removes it whole. Zero-width spaces on both sides (as for the code chip) keep the caret out of it; they are not saved.

## 3. Making a link

- `[[` typed in a text block opens the picker under the caret. What follows `[[` is the query:
  - notes as the panel's search finds them (all the words, the title first, then the text with a snippet); an empty query lists the latest notes; the trash is not listed; the open note is found by its title only, since its text has the query being typed;
  - «Створити нотатку «…»» at the end when no title is exactly the query: a new empty note with this title, linked at once; the open note stays open.
- ↑/↓ move, Enter links to the note, → or Tab (or the arrow button of a row) lists the blocks of that note: the typed text becomes «[[Name › », and what follows filters the blocks. «Уся нотатка» is the first row. ← with an empty filter goes back to the notes.
- Esc closes the picker and leaves the typed text as it is. Moving the caret out of «[[…» closes it too.
- The link replaces «[[…» and gets a space after it unless a space or a punctuation mark follows, and a space before it when it follows a word. Ctrl+Z brings the typed «[[…» back.
- The formatting bar has a link button. On touch it is there whenever the caret is in a block (`[[` is hard to type on a phone keyboard); the picker then spans the screen right above the bar, the keyboard stays open, rows and the arrow are 44px. A selected piece of text becomes the query.
- «Копіювати посилання» puts the address of a block or a note into the clipboard (plain text: the address; html: a link with the name):
  - a text block: its menu — «⋯» on touch, the right button on ⋮⋮ on a computer (new: the computer had no menu for a text block);
  - a code block: a button in its header (in «⋯» on a narrow card on touch), and the right button on ⋮⋮;
  - an area: its «⋯» menu, and the right button on ⋮⋮;
  - the note: the header «⋯» on touch; on a computer the address bar already has it (section 5).
- Pasting an address of a note of this site (or of a note this device has, from the other site) into a text block makes a link. The hint «Вставлено як посилання · Залишити адресою» turns it back into the address, as «Вставлено як код · Зробити текстом» does.
- Copying text with links: the plain text has the labels, the html has real `<a href>` addresses of this site.

## 4. Following a link

- A click or a tap on a chip opens the target. The caret does not go into the text; a hold on touch is still the position mode. Ctrl, ⌘ or the middle button opens it in a new tab.
- The note opens; for a block it is scrolled to the middle and lit for two seconds. A block in a folded area unfolds it.
- «Back»: the header shows «← Name» of the note left; a click returns to it at the same scroll position. Every hop is also an entry of the browser history (`nav`), so the browser's Back and the system Back on a phone return too. Opening a note any other way clears these steps.
- A gone note: the toast «Нотатки немає: її видалено або вона ще не на цьому пристрої», nothing opens. A note in the trash opens read-only, as from the trash.
- On a computer, a hover of about half a second over a chip shows a preview: the name, the date (or «в архіві», «Нотатка в кошику»), the first lines of the block or the note (a code block in monospace), and the hint about Ctrl+click.

## 5. Addresses

- The open note is in the hash of the address: `/#NOTE`, `/#NOTE/BLOCK` after following a link to a block. It is replaced, not pushed: opening a note is not a step of the browser history (only following a link is, section 4).
- When the app is opened with an address of a note (a link opened in a new tab, a bookmark, an address sent to oneself), that note opens, before the note the tab showed last. A reload keeps the tab's own note, as before: its address names that note anyway. With a block it is shown as when following a link. A note that is not here opens the usual note quietly: the address may be this tab's own from before a reload, and that note may have been deleted meanwhile.
- An address typed into this tab (`hashchange`) opens its note the same way, without a «back» step.

## 6. The notes that link here

- Under the lowest block of the sheet, aligned with the first column: «Сюди посилаються · N» and, per linking block, the note's name and the line with the link, the link in bold. Other notes only; the trash is skipped.
- Found anew from the notes in memory whenever a note is drawn, another tab changes a note, a note goes to the trash or comes back, and after an import. No index to keep.
- A click opens that note at that block, with «back». Ctrl+click opens a new tab.
- Hidden while a version is shown.

## 7. Tests

`tests/applinks.mjs`: the picker and its keys, a link to a block, a new note from the picker, Esc, Ctrl+Z, live names after a rename (the linking note is not saved again), the trash and gone states, the preview, following with «back» and the browser's Back, a folded area, the notes that link here, «Копіювати посилання» from ⋮⋮ and the code card, pasting an address and «Залишити адресою», html of copying, Ctrl+click into a new tab, the address after a reload; on touch: the link button, the picker above the bar with 44px rows, the arrow, a tap on a chip, the header «⋯».

## 8. Later

- A link with its own text (select text → link keeps the text).
- A mark on a block that other notes link to.
- Showing a block of another note inside this one (transclusion).
