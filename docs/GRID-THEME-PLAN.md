# The «Клітинка» theme (grid paper)

Status: **built** (2026-11-14), in the PR that adds this plan's code. Mockup 1 (pale cards around the text, small line numbers, hairlines on grey) was rejected by the owner; the theme follows the reference artifact, compared with it at one cell scale in the app itself. The owner then chose the text card from seven variants shown in the app: **white, no border, regular weight, no padding above or below the text** (2026-11-14).

## 1. What the owner asked for

A fourth theme beside light, dark and sand. The sheet looks like graph paper: a light page, every cell outlined by thin lines instead of the dot grid, numbers along the edges (columns along the top every 5, rows along the left), and text blocks on a filled light-grey card with rounded corners. Fonts: IBM Plex Sans for text, IBM Plex Mono for the numbers. No dark variant. The «Сітка аркуша» toggle hides the lines and the numbers. Several block colours are a later stage with its own plan (§10).

Names: «Клітинка» / "Grid paper" (short forms «клітинка» / "grid paper").

## 2. What does not change

- No stored field, no sync or export format change, no IndexedDB change. The theme is one more value of `theme` in `sheet:settings`.
- Stored placement does not change: `G`, `fx`, columns and rows are untouched, and `public/layout/` is not touched. Only the view adds an inset of the text inside its card in this theme (§6). The lines are drawn where the dots are now, so a block that stands on a dot stands on a line crossing.
- The theme cycle stays one button: light → dark → sand → grid → light.

## 3. Tokens

`:root[data-theme="grid"]` sets the same token set as the other themes, so every panel, menu and dialog follows:

| Token | Value | Use |
|---|---|---|
| `--page` | `#ffffff` | the sheet, the list and the menus; also `<meta name="theme-color">` |
| `--ink` | `#1d2230` | text (16.8:1 on white) |
| `--ink-2` | `#5d6578` | captions and the numbers (5.9:1 on white) |
| `--ink-3` | `#8a91a3` | placeholders (decorative only) |
| `--grid-line` | `#dfe3ec` | the cell lines and the frame, 1 px |
| `--blk-bg` | `#ffffff` | the text card: white, so it covers the lines under the text |
| `--code-bg` | `#eef0f5` | code cards and areas without a colour (approved by the owner as they are) |
| `--gp-in`, `--gp-i`, `--gp-r` | G/3, max(1px, 5 % of G), 18 % of G | the text's inset in its card, the card's inset from the lines, its corners |
| `--line*`, `--hover*`, `--sel*`, `--accent` | the light theme's, toward the cool grey | |
| `--sans` | `"IBM Plex Sans", "Inter", system-ui, …` | the whole interface in this theme |
| `--mono` | `"IBM Plex Mono", "JetBrains Mono", ui-monospace, …` | numbers and code |

## 4. The grid lines

In this theme `.sheet::before` starts on the first line crossing, `xOf(1)` and `yOf(2)` (today's first dot), and draws two 1 px `linear-gradient`s with `background-size: G G`; an inset shadow closes the last line. So a text row fills one row of cells and a block standing on a dot stands on a crossing. The frame reaches the last line a block can reach (`W − PAD`, `--gw` from `field()`), one cell further than the last dot on a phone, where `PAD < G`. Pure CSS: it follows `--g`, so every text size and the zoomed overview redraw by themselves.

## 5. The numbers

As in the reference, the numbers name **cells**: columns along the top every 5 (0, 5, 10, …) from the cell's left line, every row along the left in the middle of its cell. Cell 0 is the first cell a block can stand in: column 0 = stored `col 1`, row 0 = stored `row 2`. Plex Mono at 55 % of a cell, `--ink-2`, `tabular-nums`.

The module `public/gridpaper/`:

- `model.js` — pure: `rulers({cols, rows, g})` returns the positions of both rulers; `tests/gridpaper.mjs` checks them in Node.
- `view.js` — one `aria-hidden` layer inside `.sheet` (it scrolls and zooms with it), re-rendered only when the frame, `G` or the theme change.
- `index.html` wiring: `field()` calls `RULERS.update(...)`; the module is imported once, with its SRI hashes in the import map and a `PRECACHE` entry.

## 6. The block card

Every card of the theme is a `::before` over whole cells, inset `--gp-i` from the lines, corners `--gp-r`: from the line its content starts on (`xOf`, 6 px into the block's box) to the first line after the box, rounded up with CSS `round()` (Newly available: under `@supports`; without it the card ends with its box), but **never past the last line its container lets the block reach**: `render()` sets `--cmax`, the cells from the text's start to `cW − cPadR`, and a text card's `max-width` keeps the text wrapping inside them. So no card, and no text, passes the sheet's edge (on a phone `PAD < G`, where rounding up alone would scroll the page sideways), and a card never meets a neighbour's card, since a block wraps before the neighbour's handle.

- **Text**: a white card (`--blk-bg`), regular weight, no padding above or below, the text a third of a cell right of the line (a view change only: stored `col`/`fx` and rows stay). Hover, hold, resizing, selection and drag show on the card, not on the text box. An empty block (`blank`, set by `render()` from the text, so an emptied block holding a `<br>` counts) shows no card.
- **Code**: the code box is clamped to the last line too (its bar and scroller end with the card); in a code box narrowed by less than a cell, a header that wraps by its container query could take one row more than in another theme, the only case where the theme changes a row count (as a text size change does). Otherwise the card box keeps its size and its row count (`ceil((H − 2) / G)`, as in every theme); the card is drawn under it over the rows the block takes (`--rows`), so the theme moves no stored row and a code block that shrinks gives its rows back.
- **Area**: keeps its box (its inner grid is the sheet's) and draws its card under it in its own colour.

Switching into the theme or out of it re-measures the blocks as a text size change does; a round of themes writes no note and moves no block laid out in another theme (`tests/appgridtheme.mjs` 7b, 10).

## 7. Fonts offline

The theme's fonts come by a stylesheet of their own (`IBM Plex Mono` 400/500, `IBM Plex Sans` 400/500/600), added by `themeLaid()` only when the theme is in use: the other themes never wait for it, and the URL of the cached Inter stylesheet stays, so an offline start keeps its fonts. The service worker keeps both in `baobook-fonts` (cache first, refreshed in the background). Offline before the first use, the theme falls back to Inter and JetBrains Mono. Every face that arrives later (a Cyrillic subset loads only when text needs it) fires `document.fonts` `loadingdone`, and the blocks are re-measured once, debounced.

## 8. Settings, cycle, toggle, compatibility

- `THEMES = ['light','dark','sand','grid']`; `NAMES`, `THEME_NAMES`, the theme button's icon (a small grid) and `theme.grid`, `theme.short.grid` in `uk.json` and `en.json` (`node tests/hashes.mjs --write`).
- «Сітка аркуша» (`.nogrid`) hides the lines and the numbers in this theme, as it hides the dots now. The block cards stay.
- `applySettings` and import already accept only values in `THEMES`; an older build (production before the release, or an export opened on an older site) ignores `grid` and falls back to the system theme. No migration.
- Settings are not synced, so no Firestore change.
- Browser support: gradients, custom properties, `:has()` and `document.fonts` are Widely available; CSS `round()` is Newly available and used only under `@supports`, with a card that ends with its text as the fallback.

## 9. Decided with the owner

1. Rows: every row is numbered, columns every 5, as in the reference.
2. Cell 0 is the first cell a block can stand in.
3. Text card: white, no border, regular weight, no padding above or below (seven variants seen in the app, 2026-11-14). Code and area cards as built.
4. Plex for the whole interface in this theme; the numbers scroll with the sheet.

## 10. Later: several block colours (not in this PR)

A separate plan: an optional block field (as the note's `color` of `docs/LIST-ACTIONS-PLAN.md`), its sync and export, the Firestore rules the owner publishes first and the index exemption (`docs/SYNC-PLAN.md` §6), the palette in the block's menu, and how the colours look in the other three themes.

## 11. Tests

- `tests/gridpaper.mjs` (Node): the ruler model.
- `tests/appgridtheme.mjs` (browser): the cycle of four themes and the button's names and icon; the saved theme after a reload; the fonts' own link; lines from the first crossing and the numbered edges; the white card on whole cells with the text a third of a cell in, two cards in a row apart, no card on an empty block; code and area cards on whole cells; «Сітка аркуша»; no note written by a round of themes; the text size; a phone width.
- `tests/apptitle.mjs` clicks once more to come back to the light theme; every other scenario passes unchanged.
