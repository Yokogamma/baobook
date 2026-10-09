# Baobook

A notes app "on a blank sheet", formerly «Чистий аркуш» in `Yokogamma/mockups/sheet`. It is a vanilla JS PWA without a build step: `public/index.html` holds all the CSS and JS, plus `public/sw.js`, the manifest and icons.

## Conventions

- Talk to the owner in Russian. Everything in the repository is in English: README, docs, code comments, commit messages, PR titles and descriptions. The interface is being localized for international use: Ukrainian and English, each language in its own file; no UI strings in code.
- Workflow: branch → run the tests → PR into `main` → the owner merges (sessions do not run `gh pr merge` unless the owner says «вливай» for that PR; then wait for green CI and merge it) → check https://baobook.matamata.dev with `curl` for a marker of the change (`/`, not `/index.html`, which answers 307).
- Two sites from one repository: `main` deploys to https://baobook.matamata.dev (development, scratch notes, marked «DEV»), `prod` deploys to https://baobook.matamata.app (production, the owner's real notes). Sessions open PRs only into `main`. A release is a PR `main → prod`, opened and merged only when the owner asks for it; then check https://baobook.matamata.app/ with `curl`. Never commit to `prod` directly, not even an urgent fix. Before a release that changes storage, the owner exports the notes from `.app`, and the migration is checked on `.dev` with a copy of them.
- One worktree per session. Several Claude sessions work on this repository at the same time, and a shared checkout mixes their work: one switches the branch under another, or commits the other's unsaved edits. Never switch branches or commit in `D:\server\laragon\www\baobook`; keep it on `main`. Create your own worktree from `origin/main` (`git worktree add ../baobook-<task> -b <branch> origin/main`), link `node_modules` into it (`New-Item -ItemType Junction -Path <worktree>\node_modules -Target D:\server\laragon\www\baobook\node_modules`), and edit, test and commit there. Before each commit, check that `git status` and `git diff --cached` show only your own changes. Remove the worktree after the PR is merged (`git worktree remove`).
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
6. Production on `baobook.matamata.app` (Worker `baobook-prod` from branch `prod`), a «DEV» mark on `.dev`, and the owner's notes moved to `.app` on every device they use.
7. Finish up:
   - a "moved" page on the old site pointing to `.app`, with no redirect and no data deletion;
   - the plan map, Notion and a daily check.

## Localization

- Every UI string lives in `public/locales/<lang>.json`. Code asks for it with `loc('key', {params})`, or `locA()` when the text goes inside an HTML string or attribute.
- Static markup uses `data-i18n` (text), `data-i18n-html` (markup from our own files) and `data-i18n-attr="title:key;aria-label:key"`.
- A plural value is an object keyed by `Intl.PluralRules` categories (`one`, `few`, `many`, `other`) and is chosen by `params.n`. `{name}` marks a parameter. Write whole sentences with parameters, never glue fragments.
- Dates use `Intl` with `I18N.locale`.
- The language comes from the saved setting (the «Мова / Language» switcher in the settings menu behind the gear), then the browser language, then English.
- A new language takes a `public/locales/<code>.json` with every key, its code in `I18N.langs`, a `lang.<code>` name in every file, and a `PRECACHE` entry.
- `tests/appi18n.mjs` fails on Cyrillic string literals outside the language files, on missing or unused keys, and on broken plurals.
- Tests pin `uk-UA` through `CTX` in `tests/lib/server.mjs`.

## Product status

- **Mobile plan (`docs/MOBILE-PLAN.md`):** closed. PRs A, B and C are done; manual checks such as TalkBack and VoiceOver are still pending.
- **Note versions (`docs/VERSIONS-PLAN.md`):** closed. PR 1 (storage), PR 2 (the «Історія» panel, showing a version, restoring a note) and PR 3 (restoring a block, named versions, clearing history, search, export with history) are done; manual checks on devices (section 6) are still pending.
- **Secret links with Matamata:** A0 → A1 → A2; the plan lives in the private `payee-private-docs`.
- **Sync and sign-in (`docs/SYNC-PLAN.md`):** waiting for the owner's Firebase config and answers.

## After the move

- Sync and Google/Apple sign-in come as a separate stage: Firebase Auth + Firestore, see `docs/SYNC-PLAN.md`. Add `baobook.matamata.app` to the Firebase authorized domains and proxy `/__/auth/` through the production Worker.
