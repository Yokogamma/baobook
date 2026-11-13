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

A text block is a **white card on whole cells**: from the line its text starts on to the first line after the end of its text, over its rows, inset `--gp-i` from the lines, corners `--gp-r`, regular weight, no padding above or below. The text stands a third of a cell right of the line, so it does not touch the card's edge; this is a view change only (stored `col`/`fx` and rows stay). The card is a `::before` on `.tcard` whose width is rounded up to a cell with CSS `round()` (Newly available: under `@supports`; without it the card ends with the text). A text block never reaches past its neighbour's handle (it wraps there), so a card rounded up to the next line never meets the neighbour's card. An empty block shows no card.

A code card fills whole cells too: inset from its line, its height the rows it takes (`--rows`, set by `render()`; in this theme the rows of a code block count both insets), its width rounded down to the last line it can reach. An area keeps its box (its inner grid is the sheet's) and draws its card on whole cells under it, in its own colour.

Switching into the theme or out of it re-measures the blocks as a text size change does, and once more when its fonts arrive; a round of themes writes no note (`tests/appgridtheme.mjs` 7b).

## 7. Fonts offline

Today the page links one Google Fonts stylesheet (Inter, JetBrains Mono) and the service worker keeps it and the font files in `baobook-fonts` (cache first, refreshed in the background). Plex comes as a **second** `<link>` (`IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400`), so the URL of the cached Inter stylesheet stays the same and an offline start of the new build keeps its fonts. The font files download only when the theme is in use; switching to the theme warms them with `document.fonts.load()`. Offline before the first use, the theme falls back to Inter and JetBrains Mono, which are cached: nothing breaks and the layout does not move, because sizes come from `--fs`/`--g`, not from the font. Measuring: a block's width is measured from its text, so a font that arrives later re-measures as the existing `document.fonts` handling does today (check in the scenario).

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
