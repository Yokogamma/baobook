# The «Клітинка» theme (grid paper)

Status: **proposed** (2026-11-13), mockup 2 (2026-11-14), waiting for the owner's answers in §9 and a review round.
Mockup: a private claude.ai artifact, «Baobook Grid Paper». Mockup 1 (pale cards around the text, small line numbers, hairlines on grey) was rejected by the owner: the theme follows the reference artifact as closely as the app's grid allows.

## 1. What the owner asked for

A fourth theme beside light, dark and sand. The sheet looks like graph paper: a light page, every cell outlined by thin lines instead of the dot grid, numbers along the edges (columns along the top every 5, rows along the left), and text blocks on a filled light-grey card with rounded corners. Fonts: IBM Plex Sans for text, IBM Plex Mono for the numbers. No dark variant. The «Сітка аркуша» toggle hides the lines and the numbers. Several block colours are a later stage with its own plan (§10).

Names: «Клітинка» / "Grid paper" (short forms «клітинка» / "grid paper").

## 2. What does not change

- No stored field, no sync or export format change, no IndexedDB change. The theme is one more value of `theme` in `sheet:settings`.
- Stored placement does not change: `G`, `fx`, columns and rows are untouched, and `public/layout/` is not touched. Only the view adds an inset of the text inside its card in this theme (§6). The lines are drawn where the dots are now, so a block that stands on a dot stands on a line crossing.
- The theme cycle stays one button: light → dark → sand → grid → light.

## 3. Tokens

`:root[data-theme="grid"]` sets the same token set as the other themes (every token the light theme defines), so every panel, menu and dialog follows:

| Token | Value | Use |
|---|---|---|
| `--page` | `#ffffff` | the sheet (the reference's white panel), the list and the menus; also `<meta name="theme-color">` (set from `--page` already) |
| `--ink` | `#1d2230` | text (16.8:1 on white, 6.3:1 on the reference grey) |
| `--ink-2` | `#5d6578` | captions and the numbers (5.9:1 on white) |
| `--ink-3` | `#8a91a3` | placeholders (decorative only) |
| `--grid-line` | `#dfe3ec` | the cell lines and the frame, new token, 1 px |
| `--blk-bg` | `#9aa3b5` | the standard block card, new token: the reference's grey (§9 Q3 offers two lighter ones) |
| `--code-bg` | `#eef0f5` | code cards |
| `--line`, `--line-2`, `--hover*`, `--sel*`, `--accent`, `--c-*`, `--sw-*`, code colours | derived from the light theme, hue shifted toward the cool grey | |
| `--sans` | `"IBM Plex Sans", "Inter", system-ui, …` | the whole interface in this theme |
| `--mono` | `"IBM Plex Mono", "JetBrains Mono", ui-monospace, …` | numbers and code |

The new tokens get a default in bare `:root` (`--grid-line: var(--dot)`, `--blk-bg: transparent`), so other themes are unaffected. Selection and focus outlines keep their accent, ≥ 3:1 against white and against the card. A selected text on the card uses a lighter selection colour so it stays readable (checked in the scenario).

## 4. The grid lines

`.sheet::before` already has the frame (`left: G`, `top: 2G`, `--fw`/`--fh` from `field()`). In this theme the frame starts at the first line, `xOf(1)` and `yOf(2)` (the dots of today are the line crossings), its `background-image` becomes two 1 px `linear-gradient`s (vertical and horizontal) with `background-size: G G`, and an inset shadow closes the right and bottom edge. So a text row fills one row of cells, and a block standing on a dot stands on a crossing. Pure CSS, Baseline Widely available; it follows `--g`, so every text size (`G = round(1.5 × fs)`) and the zoomed overview on a phone redraw by themselves.

## 5. The numbers

As in the reference, the numbers name **cells**, centred on the cell: columns along the top every 5 (0, 5, 10, …), rows along the left (every row, §9 Q1). Cell 0 is the first cell a block can stand in: column 0 = stored `col 1`, row 0 = stored `row 2`. Plex Mono at half a cell (12 px at G = 24), `--ink-2`, `tabular-nums`. The row numbers stand in the left margin (1.5 G wide, enough for three digits), the column numbers in the band above row 0.

They cannot be a CSS gradient, so they are DOM: a module `public/gridpaper/`:

- `model.js` — pure: `labels({cols, rows, g, step})` returns the positions and texts of both rulers from the frame `field()` computes. A Node test (`tests/gridpaper.mjs`) checks the positions against `xOf`/`yOf`, the steps and the bounds.
- `view.js` — keeps two absolutely placed `aria-hidden` rulers inside `.sheet`, so they scroll with it; re-rendered only when `cols`, `rows`, `g` or the theme change; `pointer-events: none`.
- `index.html` wiring: `field()` calls `gridpaper.update(cols, rows, g)`; the theme switch calls `gridpaper.theme(on)`. Nothing else.

The numbers live only in this theme. They are not selectable, not read by a screen reader, and not part of an export.

## 6. The block card

As in the reference, a text block is a card that fills **whole cells**: from the line its text starts on to the first line after the end of its text, over all its rows, inset 2 px from the lines, corners of 18 % of a cell (4 px at G = 24), filled with `--blk-bg`. The text is semibold as in the reference (§9 Q4).

The text cannot start on the line itself: it would touch the card's edge. So in this theme the text stands a third of a cell (8 px at G = 24) right of the line. This is a view change only: the stored `col`/`fx` and rows stay, and the other themes are unchanged. But the block becomes that much wider, so:

- the card's width is `ceil((P + text + P) / G) × G − 4`, set by the view as a custom property `--cw` whenever a block is rendered or re-measured;
- the measuring in `index.html` that keeps blocks from overlapping counts the theme's inset (one constant beside `OFF()`), so two cards in one row never overlap; switching the theme re-measures as a text size change does and writes nothing by itself (§4.3 of `docs/LAYOUT-ENGINE-PLAN.md`; `public/layout/` itself is not touched — its P18 setting «where the text stands» is the same idea and will take this inset over later).

Code cards fill cells the same way, with `--code-bg` and the same corners. Areas fill cells, keep their colours, with the same corners; blocks inside an area are cards too. Links, chips, highlights and the selection keep their look. An empty block shows no card (only the placeholder while focused).

## 7. Fonts offline

Today the page links one Google Fonts stylesheet (Inter, JetBrains Mono) and the service worker keeps it and the font files in `baobook-fonts` (cache first, refreshed in the background). Plex comes as a **second** `<link>` (`IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400`), so the URL of the cached Inter stylesheet stays the same and an offline start of the new build keeps its fonts. The font files download only when the theme is in use; switching to the theme warms them with `document.fonts.load()`. Offline before the first use, the theme falls back to Inter and JetBrains Mono, which are cached: nothing breaks and the layout does not move, because sizes come from `--fs`/`--g`, not from the font. Measuring: a block's width is measured from its text, so a font that arrives later re-measures as the existing `document.fonts` handling does today (check in the scenario).

## 8. Settings, cycle, toggle, compatibility

- `THEMES = ['light','dark','sand','grid']`; `NAMES`, `THEME_NAMES`, the theme button's icon (a small grid) and `theme.grid`, `theme.short.grid` in `uk.json` and `en.json` (`node tests/hashes.mjs --write`).
- «Сітка аркуша» (`.nogrid`) hides the lines and the numbers in this theme, as it hides the dots now. The block cards stay.
- `applySettings` and import already accept only values in `THEMES`; an older build (production before the release, or an export opened on an older site) ignores `grid` and falls back to the system theme. No migration.
- Settings are not synced, so no Firestore change.
- Browser support: gradients, custom properties and `document.fonts` are Widely available; nothing Newly available is needed.

## 9. Questions for the owner

1. **Row numbers**: every row (as in the reference, recommended) or every 5 rows like the columns?
2. **Cell 0**: the first cell a block can stand in (as in the mockup)?
3. **The grey**: the reference's `#9aa3b5` (as in the mockup), or lighter `#c3c9d6` or `#dde1ea`? With a long note the dark grey is a lot of grey; the lighter ones are in the mockup.
4. **The text on the card**: semibold as in the reference, or regular weight? Recommendation: regular for notes longer than a word or two; the mockup has both.
5. **The interface font**: Plex Sans for the whole interface in this theme (list, menus), or only for the sheet? Recommendation: the whole interface.
6. **Rulers while scrolling**: they scroll with the sheet (recommended, as in the reference) or stay pinned to the top and left edges of the window?

## 10. Later: several block colours (not in this PR)

A separate plan: an optional block field (as the note's `color` of `docs/LIST-ACTIONS-PLAN.md`), its sync and export, the Firestore rules the owner publishes first and the index exemption (`docs/SYNC-PLAN.md` §6), the palette in the block's menu, and how the colours look in the other three themes.

## 11. Tests and the PR

One PR into `main`:

- `tests/gridpaper.mjs` (Node): the ruler model.
- `tests/appgridtheme.mjs` (browser): the cycle has four themes and the button names the next one; `grid` is saved and restored after a reload; the sheet shows lines (no radial gradient) and rulers whose first numbers sit on `xOf(1)` and `yOf(2)`; a text block has the card colour and radius, its card fills whole cells and its text stands the theme's inset right of the line; two blocks in one row with cards never overlap; switching the theme writes no note; «Сітка аркуша» hides lines and rulers, keeps the cards; a text size change moves the rulers with `G`; the narrow view and the zoomed overview on a phone width keep the rulers aligned; an import with `theme:'grid'` into an empty app applies it, and the other themes show no rulers; offline start with the theme picked does not fail when Plex is not cached.
- `tests/appi18n.mjs` and `tests/hashes.mjs` pass with the new keys; `BUILD` raised.
