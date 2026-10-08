# Baobook

Notes on a blank sheet: click anywhere and type right there. Baobook runs in the browser and installs as an app (PWA), works offline, and keeps notes on the device. The interface is in Ukrainian; English is planned, with each language in its own file.

- Development build: https://baobook.matamata.dev (available after the first deploy).
- Production: https://baobook.matamata.app, later, as a separate deployment.
- Previous home: https://yokogamma.github.io/mockups/sheet/ («Чистий аркуш»). It keeps working. Notes move over with Export → Import, because a new site cannot read another site's browser storage.

## Features

- Free placement on a dot grid: text lands where you click. Blocks never overlap; whatever is below gets pushed down.
- Rich text (bold, italic, underline, strikethrough) and inline `code` chips that copy with one click. A double click selects a whole token: a password, an address or a command.
- Code blocks: paste detection, a read-only lock, highlighting for about 20 languages, copy, wrap, line numbers and folding.
- Areas: containers that group blocks, with colours, folding, ungroup and undo.
- Phone layout: hold to create a block, position mode with arrows, system Back, panels that stay above the keyboard.
- Several notes, search, autosave to IndexedDB, per-field undo history, stored note versions, export and import as JSON.
- Offline shell through a service worker; light, dark and sand themes.

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

Cloudflare Workers Static Assets through Workers Builds: a merge to `main` runs `npx wrangler deploy` and publishes `public/` to https://baobook.matamata.dev. Production on `baobook.matamata.app` gets its own deployment later.

## Data

Notes live in the IndexedDB database `sheet` (stores `notes`, `versions`, `blobs`); settings live in localStorage under `sheet:settings`. The names come from «Чистий аркуш» and are kept on purpose, because renaming storage needs a migration. Export files look like `{app, format: 1, exported, settings, notes}`.

## History

The code was extracted from [Yokogamma/mockups](https://github.com/Yokogamma/mockups) (folder `sheet/`) on 2026-10-08 together with its commit history. See [docs/HISTORY.md](docs/HISTORY.md).

## License

[MIT](LICENSE)
