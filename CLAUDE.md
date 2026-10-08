# Baobook

A notes app "on a blank sheet", formerly «Чистий аркуш» in `Yokogamma/mockups/sheet`. It is a vanilla JS PWA without a build step: `public/index.html` holds all the CSS and JS, plus `public/sw.js`, the manifest and icons.

## Conventions

- Talk to the owner in Russian. Everything in the repository is in English: README, docs, code comments, commit messages, PR titles and descriptions. The interface is being localized for international use: Ukrainian and English, each language in its own file; no UI strings in code.
- Workflow: branch → run the tests → PR into `main` → the owner merges (sessions do not run `gh pr merge`) → check https://baobook.matamata.dev with `curl` for a marker of the change.
- Run `tests/` before committing (Playwright, see `tests/README.md`). On Windows, use an installed browser via the `CHROMIUM` env var. Every new feature gets its own scenario.
- Only `public/` is published. Don't put tests, docs or tooling there.
- User data lives in IndexedDB `sheet` (stores `notes`, `versions`, `blobs`) and localStorage `sheet:settings`. Don't rename stores, and don't rename or drop fields, without a migration. New fields are optional and get defaults on read. Export files from older versions must keep importing.
- The service worker may delete only caches with its own prefix: other apps can share the origin.
- `public/index.html` writes the zero-width space as an escape sequence in the chip code. Editing tools may turn such escapes into the real character, so check the bytes after editing those lines.

## Current stage

Moving out of `mockups`, with no new features. Steps:

1. Repository with history, CI and an MIT license.
2. Rename to Baobook in the UI, manifest and export file. The service worker cleans only its own caches.
3. Honest import result:
   - count real write results;
   - re-read storage after import;
   - apply settings only when importing into an empty app.
4. Tests over HTTP:
   - migration across origins;
   - offline start;
   - other apps' caches left untouched.
5. Deploy to `baobook.matamata.dev` with Workers Builds.
6. Move the owner's notes there.
7. Finish up:
   - a "moved" banner on the old site, with no redirect and no data deletion;
   - the plan map, Notion and a daily check.

## Localization (next stage)

All UI strings move into per-language files. The language is chosen from the saved setting, then the browser language, then English. Plurals use `Intl.PluralRules`, dates use `Intl.DateTimeFormat`, and `<html lang>` follows the UI language.

## After the move

- Sync and Google/Apple sign-in come as a separate stage: Firebase Auth + Firestore, see `docs/SYNC-PLAN.md`. On a custom domain, proxy `/__/auth/` through the Worker.
- Production on `baobook.matamata.app` needs the `matamata.app` zone moved to Cloudflare, and it changes the origin again. Either sync or another export/import has to carry the notes over.
