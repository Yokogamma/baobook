# Baobook

Notes on a blank sheet: click anywhere and type right there. Baobook runs in the browser and installs as an app (PWA), works offline, and keeps notes on the device. The interface speaks Ukrainian and English. A browser set to Ukrainian gets Ukrainian, any other gets English, and the choice can be changed under «Language» in the settings menu (the gear next to «Baobook»).

- Production: https://baobook.matamata.app. Keep your notes here.
- Development build: https://baobook.matamata.dev. Every merged change lands here first; it has an orange strip along the top and a «DEV» tag after the name. Its notes are scratch data.
- Previous home: https://yokogamma.github.io/mockups/sheet/ («Чистий аркуш»), now a closing page that exports the notes left in that browser.

Each site keeps its own notes, because a site cannot read another site's browser storage. Notes move between sites with Export → Import, once per browser and device.

## Features

- Free placement on a dot grid: text lands where you click. Blocks never overlap; whatever is below gets pushed down.
- Rich text (bold, italic, underline, strikethrough) and inline `code` chips that copy with one click. A double click selects a whole token: a password, an address or a command.
- Code blocks: paste detection, a read-only lock, highlighting for about 20 languages, copy, wrap, line numbers and folding.
- Areas: containers that group blocks, with colours, folding, ungroup and undo.
- Phone layout: hold to create a block, position mode with arrows, system Back, panels that stay above the keyboard.
- Several notes, search, autosave to IndexedDB, per-field undo history, stored note versions, export and import as JSON.
- Offline shell through a service worker; light, dark and sand themes.
- Ukrainian and English UI from `public/locales/*.json`; a new language is one more file (see CLAUDE.md).

## Layout

| Path | What |
|---|---|
| `public/` | the site: `index.html` (all CSS and JS), `sw.js`, `manifest.webmanifest`, icons. Only this folder is published |
| `tests/` | end-to-end Playwright scenarios, see [tests/README.md](tests/README.md) |
| `docs/` | design plans for sync, mobile and note versions (written in Russian before the move) and [HISTORY.md](docs/HISTORY.md) |
| `examples/` | early mockups the app grew from |
| `wrangler.jsonc` | Cloudflare Workers Static Assets configuration |

## Run locally

```sh
python -m http.server 8765 --directory public
```

Then open http://localhost:8765/. The service worker needs http(s), so opening the file directly gives you the app without offline support.

## Tests

```sh
npm i --no-save playwright@1.63.0 && npx playwright install chromium
node tests/apparea.mjs
```

GitHub Actions runs every scenario on each pull request and on pushes to `main`. Details, Windows notes and the list of scenarios are in [tests/README.md](tests/README.md).

## Deploy

Cloudflare Workers Static Assets through Workers Builds, two Workers from this one repository (see `wrangler.jsonc`):

| Worker | Branch | Deploy command | Site |
|---|---|---|---|
| `baobook` | `main` | `npx wrangler deploy` | https://baobook.matamata.dev |
| `baobook-prod` | `prod` | `npx wrangler deploy --env prod` | https://baobook.matamata.app |

Releasing:

1. Every change goes into `main` through a pull request and is checked on https://baobook.matamata.dev.
2. A release is a pull request `main → prod`. Merging it publishes exactly what was tested on `.dev`.
3. Nobody commits to `prod` directly, urgent fixes included: they go through `main` and `.dev` like any other change, so `prod` never drifts from `main`.
4. Before a release that changes storage (database version, stores, fields), export the notes from `.app` to disk, then import a copy into `.dev` and check the migration there.

One-time setup of the production Worker in the Cloudflare dashboard: create the `prod` branch from `main`; Workers & Pages → Create → Import a repository → `Yokogamma/baobook`, Worker name `baobook-prod`, production branch `prod`, deploy command `npx wrangler deploy --env prod`, non-production branch builds off. The Worker name in the build settings must match `env.prod.name`, or the build fails. The first deploy attaches the custom domain `baobook.matamata.app` from the config.

## Data

Notes live in the IndexedDB database `sheet` (stores `notes`, `versions`, `blobs`); settings live in localStorage under `sheet:settings`. The names come from «Чистий аркуш» and are kept on purpose, because renaming storage needs a migration. Export files look like `{app, format: 1, exported, settings, notes}`.

## History

The code was extracted from [Yokogamma/mockups](https://github.com/Yokogamma/mockups) (folder `sheet/`) on 2026-10-08 together with its commit history. See [docs/HISTORY.md](docs/HISTORY.md).

## License

[MIT](LICENSE)
