# The «Клітинка» theme (grid paper)

Status: **proposed** (2026-11-13), waiting for the owner's answers in §9 and a review round.
Mockup: a private claude.ai artifact, «Baobook Grid Paper» (switches for every open choice below).

## 1. What the owner asked for

A fourth theme beside light, dark and sand. The sheet looks like graph paper: a light page, every cell outlined by thin lines instead of the dot grid, numbers along the edges (columns along the top every 5, rows along the left), and text blocks on a filled light-grey card with rounded corners. Fonts: IBM Plex Sans for text, IBM Plex Mono for the numbers. No dark variant. The «Сітка аркуша» toggle hides the lines and the numbers. Several block colours are a later stage with its own plan (§10).

Names: «Клітинка» / "Grid paper" (short forms «клітинка» / "grid paper").

## 2. What does not change

- No stored field, no sync or export format change, no IndexedDB change. The theme is one more value of `theme` in `sheet:settings`.
- Block placement does not change: the geometry of `xOf`/`yOf`, `G`, `fx` and rows is untouched, and `public/layout/` is not touched. The lines are drawn where the dots are now, so a block that stands on a dot stands on a line crossing.
- The theme cycle stays one button: light → dark → sand → grid → light.

## 3. Tokens

`:root[data-theme="grid"]` sets the same token set as the other themes (every token the light theme defines), so every panel, menu and dialog follows:

| Token | Value | Use |
|---|---|---|
| `--page` | `#f6f7fa` | sheet and panels; also `<meta name="theme-color">` (set from `--page` already) |
| `--ink` | `#1d2230` | text (14.8:1 on the page, 13.4:1 on a block) |
| `--ink-2` | `#5d6578` | captions and the numbers (5.4:1 on the page) |
| `--ink-3` | `#8a91a3` | placeholders, as in the light theme (decorative only) |
| `--grid-line` | `#dfe3ec` | the cell lines, new token, hairline |
| `--blk-bg` | `#e9ecf2` | the standard block card, new token (§9 Q3 offers two neighbours) |
| `--code-bg` | `#eef0f5` | code cards |
| `--line`, `--line-2`, `--hover*`, `--sel*`, `--accent`, `--c-*`, `--sw-*`, code colours | derived from the light theme, hue shifted toward the cool grey | |
| `--sans` | `"IBM Plex Sans", "Inter", system-ui, …` | the whole interface in this theme |
| `--mono` | `"IBM Plex Mono", "JetBrains Mono", ui-monospace, …` | numbers and code |

The new tokens get a default in bare `:root` (`--grid-line: var(--dot)`, `--blk-bg: transparent`), so other themes are unaffected.

Contrast: the block card against the page is 1.10:1. That is a decoration, not text (WCAG 1.4.11 does not apply to a background that carries no meaning), and the text on it keeps 13.4:1. The selection and focus outlines keep their accent, ≥ 3:1 against both the page and the card.

## 4. The grid lines

`.sheet::before` already has the frame (`left: G`, `top: 2G`, `--fw`/`--fh` from `field()`). In this theme its `background-image` becomes two `linear-gradient`s (vertical and horizontal hairlines) with `background-size: G G` and `background-position` shifted by `G/2`, so each crossing falls exactly where a dot is today (`xOf(c)`, `yOf(r)`), and a text row fills one row of cells. Pure CSS, Baseline Widely available; it follows `--g`, so every text size (§4.3 of `docs/LAYOUT-ENGINE-PLAN.md`: `G = round(1.5 × fs)`) and the zoomed overview on a phone redraw by themselves. Hairline: `.5px`, one device pixel on a 2× screen; whether a 1× screen shows it faint or not at all is checked in the scenario and on devices, with `1px` under `(max-resolution: 1dppx)` if needed.

## 5. The numbers

Columns along the top, every 5 lines: 0, 5, 10, …; rows along the left: see §9 Q1. The numbers label **lines**, like a ruler: 0 is the line where the first column's text starts (stored `col 1`, the first dot column), and the first sheet row (stored `row 2`) is row 0 (§9 Q2).

They cannot be a CSS gradient, so they are DOM: a module `public/gridpaper/`:

- `model.js` — pure: `labels({cols, rows, g, step})` returns the positions and texts of both rulers from the frame `field()` computes. A Node test (`tests/gridpaper.mjs`) checks the positions against `xOf`/`yOf`, the steps, and the bounds.
- `view.js` — keeps two absolutely placed `aria-hidden` rulers inside `.sheet` (so they scroll with it, top one in the band between the header and row 0, left one in the margin cell), re-rendered only when `cols`, `rows`, `g` or the theme change. 9–10 px Plex Mono, `--ink-2`, `tabular-nums`, `pointer-events: none`.
- `index.html` wiring: `field()` calls `gridpaper.update(cols, rows, g)`; the theme switch calls `gridpaper.theme(on)`. Nothing else.

The numbers live only in this theme. They are not selectable, not read by a screen reader, and not printed in an export.

## 6. The block card

Text blocks (`.tcard .txt`) get `background: var(--blk-bg)` and a radius of 20 % of a cell (`calc(var(--g) * .2)`, 5 px at G = 24). Two ways to size it, both in the mockup (§9 Q4):

- **by cells** (recommended, as in the reference): the card covers whole cells, from the line left of the text (the handle's cell) to the first line at or after the end of the text, and the block's rows, inset 2 px from the lines. A `::before` on `.tcard`, its width a custom property `--cw` that the view sets from the measured text width when it renders or re-measures a block (`ceil(w / G) × G`), so no new CSS feature is needed.
- **by text**: the card is the text's own box (6 px either side), with no rounding to cells.

Code cards keep their own card, with the theme's radius and `--code-bg`. Areas keep their colours and frame, with the theme's radius. Links, chips, highlights and the selection keep their current look. Empty blocks show no card (only the placeholder while focused), so an empty click does not leave grey boxes.

## 7. Fonts offline

Today the page links one Google Fonts stylesheet (Inter, JetBrains Mono) and the service worker keeps it and the font files in `baobook-fonts` (cache first, refreshed in the background). Plex comes as a **second** `<link>` (`IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400`), so the URL of the cached Inter stylesheet stays the same and an offline start of the new build keeps its fonts. The font files download only when the theme is in use; switching to the theme warms them with `document.fonts.load()`. Offline before the first use, the theme falls back to Inter and JetBrains Mono, which are cached: nothing breaks and the layout does not move, because sizes come from `--fs`/`--g`, not from the font. Measuring: a block's width is measured from its text, so a font that arrives later re-measures as the existing `document.fonts` handling does today (check in the scenario).

## 8. Settings, cycle, toggle, compatibility

- `THEMES = ['light','dark','sand','grid']`; `NAMES`, `THEME_NAMES`, the theme button's icon (a small grid) and `theme.grid`, `theme.short.grid` in `uk.json` and `en.json` (`node tests/hashes.mjs --write`).
- «Сітка аркуша» (`.nogrid`) hides the lines and the numbers in this theme, as it hides the dots now. The block cards stay.
- `applySettings` and import already accept only values in `THEMES`; an older build (production before the release, or an export opened on an older site) ignores `grid` and falls back to the system theme. No migration.
- Settings are not synced, so no Firestore change.
- Browser support: gradients, custom properties and `document.fonts` are Widely available; nothing Newly available is needed.

## 9. Questions for the owner

1. **Row numbers**: every row (as in the reference) or every 5 rows like the columns? The mockup has both. Recommendation: every row, it fits in the margin up to row 999.
2. **Where 0 is**: 0 on the first line where a block can start (the first dot column and the first sheet row), as in the mockup? Alternative: start at 1 and number cells, not lines.
3. **The standard grey**: `#e9ecf2` (recommended) or one of its neighbours in the mockup, `#eef0f5` (lighter) or `#e2e6ee` (darker)?
4. **The card**: by cells (recommended, as in the reference) or by text?
5. **The interface font**: Plex Sans for the whole interface in this theme (list, menus), or only for the sheet? Recommendation: the whole interface, one look.
6. **Rulers while scrolling**: they scroll with the sheet (recommended, simple, as in the reference) or stay pinned to the top and left edges of the window?

## 10. Later: several block colours (not in this PR)

A separate plan: an optional block field (as the note's `color` of `docs/LIST-ACTIONS-PLAN.md`), its sync and export, the Firestore rules the owner publishes first and the index exemption (`docs/SYNC-PLAN.md` §6), the palette in the block's menu, and how the colours look in the other three themes.

## 11. Tests and the PR

One PR into `main`:

- `tests/gridpaper.mjs` (Node): the ruler model.
- `tests/appgridtheme.mjs` (browser): the cycle has four themes and the button names the next one; `grid` is saved and restored after a reload; the sheet shows lines (no radial gradient) and rulers whose first numbers sit on `xOf(1)` and `yOf(2)`; a text block has the card colour and radius; «Сітка аркуша» hides lines and rulers, keeps the cards; a text size change moves the rulers with `G`; the narrow view and the zoomed overview on a phone width keep the rulers aligned; an import with `theme:'grid'` into an empty app applies it, and the other themes show no rulers; offline start with the theme picked does not fail when Plex is not cached.
- `tests/appi18n.mjs` and `tests/hashes.mjs` pass with the new keys; `BUILD` raised.
