# Trash and archive

Owner's decisions (2026-10-09):

- A deleted note goes to the trash («Кошик») without a dialog. After 30 days there it is deleted for good, with its versions.
- An empty note (no title, no text, no version history) is deleted at once, without the trash and without a dialog.
- The archive («Архів») holds notes that should stay but not clutter the list. They stay there with no time limit and can be opened at any time.
- The in-app confirmation dialog (`ask()`, PR 1) stays only for what cannot be undone: «Очистити аркуш» (the toast and the version history still bring the blocks back), «Видалити назавжди», «Очистити кошик».

Three PRs: PR 1 is the dialog and the broom for clearing the sheet, PR 2 is the trash and the list sections, PR 3 is the archive on top of them.

State (2026-10-09): PR 1, PR 2 and PR 3 are done.

## 1. Data

- Two optional note fields, both a time in ms: `deleted` (moved to the trash) and `archived` (moved to the archive, PR 3). Only a note in the trash or the archive carries the field; a missing field means "no". No new store and no database version bump: the records stay in `notes`.
- A note in the trash keeps `archived`, so a restore returns it where it was.
- Moving to the trash, to the archive and back is a change of the note: `updated` moves forward. Other tabs (`takeNote`) and import compare `updated`, so they pick the change up. A restore drops the field, and `takeNote` and import drop it too when the newer copy has none, so a tab or a file cannot leave a stale `deleted` behind. The version manifest is the title and the blocks, so these moves write no versions.
- `deleted` is the tombstone that `docs/SYNC-PLAN.md` already plans (`deleted: number|null`), so sync gets it for free.
- Import: the file's `deleted` comes with the note when it is a positive number. A newer copy replaces it, so a note restored on another device comes back here too; an older copy is skipped as before. Files from older versions have no field and import as before.
- Export carries every note with its fields, so the file stays a full copy.

## 2. Trash (PR 2)

- The bin in the list moves the note to the trash, with no dialog. If the note was open, the newest note of the list opens. The toast «Нотатку «…» переміщено в кошик · Скасувати» has the usual timer (Ctrl+Z works until a reload). The trash is the safety net, and a toast without a timer would cover the trash row of the panel on a phone.
- Sections: below the list, above the storage line, the row «Кошик · N» appears while the trash is not empty. A click shows the trash in place of the list: «‹ Кошик» (back to the notes), «Очистити кошик» and a hint about the 30 days. On a phone the section is a nav entry, so system Back returns to the notes; closing the panel also returns to the notes.
- A trash item shows the title, the preview and «ще N днів» instead of the date. On hover, and on the open item, it has «Відновити» and «Видалити назавжди». The Delete key deletes for good (with the dialog).
- A click on a trash item opens it read-only:
  - the sheet is inert, the title is not editable, the block handles are hidden;
  - a strip under the header says «Нотатка в кошику, ще N днів», with «Відновити» and «Видалити назавжди»;
  - clearing, a new area and the history are gone from the header and its «⋯» menu; Ctrl+Alt+H, paste and Ctrl+Z do nothing;
  - the sheet is two rows lower (four on a phone, where the strip has two rows), so the strip covers no block.
  - the strip shares the header's layer and comes before it in the page, so the header «⋯» menu opens above it.
- Search in the notes section skips the trash; in the trash section it filters the trash.
- Purge: at start and every hour while the app is open, notes with `deleted` older than 30 days are deleted for good with their versions; other tabs are told (`del`).
- After a restore or a purge empties the trash, the panel goes back to the notes.
- The storage line does not count the trash; the trash has its own counter on its row.
- At start (and after a reload) the app opens the last note only if it is in the list, otherwise the newest note of the list.

## 3. Archive (PR 3)

- «Перенести в архів» is the box button left of the bin on a list item, and an item of the header «⋯» menu on touch. No dialog; the toast «Нотатку «…» перенесено в архів · Скасувати» has the usual timer. If the note was open, the newest note of the list opens.
- The row «Архів · N» sits above «Кошик · N» while the archive is not empty and opens the archive section the same way (header, hint «без строку», a nav entry on a phone). An archive item has «Повернути до нотаток» and the bin.
- An archived note opens and edits as usual, history included. The strip under the header says «Нотатка в архіві» with «Повернути до нотаток» (one row on a phone); the note stays open after it. A reload keeps an open archived note open.
- The bin moves an archived note to the trash, and it keeps `archived` there; a restore brings it back to the archive («Нотатку «…» відновлено в архів»).
- Search in the notes also finds archived notes, in a group «В архіві» below the notes; in the archive section it filters the archive; the trash is never in the notes' results.
- The storage line counts the notes of the list and the archive (both are on this device); the trash is not counted.
- A section that becomes empty (the last note restored, moved back or deleted) gives way to the notes.

## 4. Tests

- `appask.mjs` (PR 1, updated in PR 2): the dialog itself; clearing the sheet with its undo and version; delete forever through the dialog.
- `apptrash.mjs` (PR 2): the bin and the toast; the trash row and section; read-only view; restore from the strip and from the list; «Очистити кошик»; the 30-day purge; reload; export and import of `deleted`; two tabs; the phone.
- `apparchive.mjs` (PR 3): to the archive and the undo; the search group; the section; editing an archived note and its strip; trash from the archive and back to it; back to the notes from the strip and the item; a reload; export and import of `archived`; two tabs; the phone «⋯» items and the strip under the menu.
