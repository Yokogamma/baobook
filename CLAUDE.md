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

## Localization

- Every UI string lives in `public/locales/<lang>.json`. Code asks for it with `loc('key', {params})`, or `locA()` when the text goes inside an HTML string or attribute.
- Static markup uses `data-i18n` (text), `data-i18n-html` (markup from our own files) and `data-i18n-attr="title:key;aria-label:key"`.
- A plural value is an object keyed by `Intl.PluralRules` categories (`one`, `few`, `many`, `other`) and is chosen by `params.n`. `{name}` marks a parameter. Write whole sentences with parameters, never glue fragments.
- Dates use `Intl` with `I18N.locale`.
- The language comes from the saved setting (the «Мова / Language» switcher in the panel), then the browser language, then English.
- A new language takes a `public/locales/<code>.json` with every key, its code in `I18N.langs`, a `lang.<code>` name in every file, and a `PRECACHE` entry.
- `tests/appi18n.mjs` fails on Cyrillic string literals outside the language files, on missing or unused keys, and on broken plurals.
- Tests pin `uk-UA` through `CTX` in `tests/lib/server.mjs`.

## Product status

- **Mobile plan (`docs/MOBILE-PLAN.md`):** closed. PRs A, B and C are done; manual checks such as TalkBack and VoiceOver are still pending.
- **Note versions (`docs/VERSIONS-PLAN.md`):** PR 1 (storage) is done. Next are PR 2 (the «Історія» button and panel, showing a version on the canvas, restoring a note) and PR 3 (restoring a block, named versions, clearing history, search, export with history).
- **Secret links with Matamata:** A0 → A1 → A2; the plan lives in the private `payee-private-docs`.
- **Sync and sign-in (`docs/SYNC-PLAN.md`):** waiting for the owner's Firebase config and answers.

## After the move

- Sync and Google/Apple sign-in come as a separate stage: Firebase Auth + Firestore, see `docs/SYNC-PLAN.md`. On a custom domain, proxy `/__/auth/` through the Worker.
- Production on `baobook.matamata.app` (the zone is already on Cloudflare) changes the origin again. Either sync or another export/import has to carry the notes over.
