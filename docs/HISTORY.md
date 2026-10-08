# Repository history

On 2026-10-08 the «Чистий аркуш» app was extracted from [Yokogamma/mockups](https://github.com/Yokogamma/mockups) at `main` = `7d1d0ec` (PR Yokogamma/mockups#44) with `git filter-repo`. The app was then renamed to Baobook.

## What moved where

| In `mockups` | Here |
|---|---|
| `sheet/` (app, service worker, manifest, icons) | `public/` |
| `sheet/tests/` | `tests/` |
| `sheet/SYNC-PLAN.md`, `MOBILE-PLAN.md`, `MOBILE-REVIEW.md`, `VERSIONS-PLAN.md` | `docs/` |
| `freeform-editor-mockup.html`, `freeform-editor-practices.html`, `code-block-mockup.html` | `examples/` |
| `.github/workflows/tests.yml` | same path |

## Guarantees and differences

- 114 commits were kept with their authors and dates. Commit hashes are new.
- PR references such as `#24` in commit messages were rewritten to `Yokogamma/mockups#24`, so they still point at the original pull requests and not at this repository's.
- The tree at the first commit here (`1d1c75b`) matches `mockups` at `7d1d0ec` byte for byte: the same blob hashes for all 39 files.
- The plans in `docs/` were written before the move. They mention old paths (`sheet/index.html`, `sheet/tests/`) and the old name.
- [mockups-commit-map.txt](mockups-commit-map.txt) maps old commits to new ones (`old new`). A row of zeros in the `new` column marks a commit that did not touch the app and was dropped.
- Pull requests, reviews and issues stay in `mockups`.
