# Backend comparison: Firebase, Cloudflare, Laravel

**Status: a comparison for the owner's decision (2026-10-20), asked for after [MCP-PLAN.md](MCP-PLAN.md); nothing is decided or changed.** It compares three places for Baobook's server side across sync, sign-in and authorization, backups and MCP, and ends with a scorecard (§7) and a recommendation (§8). The facts were checked on 2026-10-20 against the sources in §10 and against the agent reports behind MCP-PLAN §3; what was not verified is in §9.

## 1. The question and what does not change

Baobook stays a local-first PWA: the main copy of the notes lives in IndexedDB on each device, the app works offline and without an account, and the static site stays on Cloudflare Workers Static Assets. The sync core in `public/sync.js` stays too: it talks to the cloud only through the adapter contract of SYNC-PLAN §4.6 (`get`, `txn`, `page`, `listen`, `totals`, `scan`), and its merges, receipts, tombstones and the totals check do not depend on Firestore. The question is only **where the shared copy lives and what enforces access to it**:

| Stack | Shared copy | What enforces access | Sign-in | Server code |
|---|---|---|---|---|
| **Firebase** (today, on .dev) | Cloud Firestore, Standard edition, Spark plan, `eur3` | Firestore security rules (`firestore.rules`) | Firebase Auth, Google | none for sync; a small Worker for `/__/auth/*`, later the Drive token broker (BACKUP-PLAN B2) and MCP (MCP-PLAN) |
| **Cloudflare** | a Durable Object with SQLite storage per (env, user), in the EU jurisdiction | the Worker's own code in front of the object | Firebase Auth kept for Google sign-in (Cloudflare has no end-user sign-in service); the Worker verifies its ID tokens | a Worker + a Durable Object class |
| **Laravel** | a SQL database (Postgres or MySQL) behind a Laravel app | Laravel's own code (policies, middleware) | Firebase Auth kept (ID tokens verified in PHP), or replaced by Socialite + Sanctum | a Laravel app on Laravel Cloud, Forge or a VPS |

## 2. Sync

| | Firebase | Cloudflare | Laravel |
|---|---|---|---|
| State | **built and tested**: PR 1–3c, the rules tested by 153 checks on the emulator, a randomized simulation, the account scenarios on the Auth and Firestore emulators; deployed on .dev; not on .app yet | to build: the object, its HTTP and WebSocket API, the access checks, a new `cloud.js` against the same contract, CI on the local Workers runtime | to build: the same in PHP, plus hosting |
| Writes | Firestore transactions from the client; `srv` = the request time stamped by the rules | the object runs one request at a time: a conditional write (`rev == expect`, or the device's receipt already there) in one SQLite transaction | a database transaction with a per-user row lock |
| Order and completeness | `srv` is the request time, not the commit order, so the catch-up needs margins, and the totals check with a daily full pass is the guarantee (SYNC-PLAN §4.6) | `srv` can be assigned in commit order inside the object (`max(now, last + 1)`), so a cursor misses nothing; the totals check stays as a cheap safety net | the same as Cloudflare if every write of a user goes through one lock |
| Real-time updates | Firestore listeners, maintained by Google | WebSockets into the object, with hibernation: an idle connection costs no duration; incoming messages are billed 20:1 as requests; our code fans changes out | Laravel Reverb, a separate long-running process (Supervisor, open-file limits, a reverse proxy, Redis to scale), managed on Laravel Cloud at extra cost; or polling |
| Limits that shape the code | Spark: 50 000 reads, 20 000 writes a day for the whole project, 10 GiB a month out, 1 GiB stored; hence the device budgets, the pace and the hard stop of SYNC-PLAN §4.17; 1 MiB a document | Workers Free: 100 000 Durable Object requests, 5 M rows read and 100 000 rows written a day, 5 GB stored; Workers Paid ($5/month) far beyond one owner's use; the budget machinery could mostly go | the server's size and the database plan |
| Durability | multi-region `eur3` | each commit goes to five followers in different data centres and is confirmed by three; batches go to object storage every 10 s | the database's own (managed or ours) |
| Security model | declarative rules enforced by Google, already written and tested | general code we write and test (the rules are ported to it: shapes, `rev + 1`, receipts, final tombstones, the trash date, the 30-day purge age, a version's live note) | the same, in PHP |
| Data location | `eur3` (Europe) | `jurisdiction("eu")`: the object runs and stores only in the EU | the chosen region (Laravel Cloud has Frankfurt, Ireland, London) |
| If the cloud is down | the app works locally; sync waits | the same | the same |

## 3. Sign-in and authorization

| | Firebase | Cloudflare | Laravel |
|---|---|---|---|
| The owner's sign-in in the app | **built**: Google through Firebase Auth, popup and redirect, the `/__/auth/*` proxy for storage partitioning, checked on .dev; Apple available later; free up to 50 000 monthly users | the same Firebase Auth, unchanged; the app loads only its auth module, not Firestore's; the Worker verifies ID tokens (BACKUP-PLAN B2 needs that code anyway) | the same Firebase Auth with ID tokens verified in PHP, or Socialite + Sanctum, which means rewriting and re-testing the sign-in of PR 3b (popup, redirect, the installed app on an iPhone) |
| Who may sync | the owner's uid in the rules | an allowlist in the Worker | an allowlist or a users table |
| OAuth for assistants (MCP) | no authorization server in Firebase: the Worker's `workers-oauth-provider` (MCP-PLAN §6) | the same library, on the same platform as the data | Laravel Passport through `laravel/mcp`: discovery, Dynamic Client Registration, PKCE and a consent view out of the box; one scope (`mcp:use`), «ignoring many aspects of OAuth, such as scopes»; Client ID Metadata Documents not found in the docs or the route code; audience binding not documented |
| The assistant's consent screen | on the app's origin, where the Firebase session already is (MCP-PLAN §6) | the same | on the Laravel host: one more sign-in unless the Laravel app is the whole backend under the same site |

## 4. Backups

| | Firebase | Cloudflare | Laravel |
|---|---|---|---|
| Server-side, automatic | **none on Spark**: scheduled backups (up to 14 weeks, restored into a new database) need Blaze; point-in-time recovery keeps 7 days at one-minute steps, is off by default and needs billing | **point-in-time recovery for 30 days, on by default** for every SQLite-backed object, restorable per object (per user and env) | scheduled database dumps (for example `spatie/laravel-backup`) to R2, S3 or Drive, set up and restore-tested by us; managed snapshots depend on the database chosen |
| Copies the owner can open | BACKUP-PLAN B1–B4: copies made by the app into the owner's Drive while a device is open; the manual export | BACKUP-PLAN unchanged; and a nightly export of each object to R2 by a Cron Trigger is possible without any device open | dumps on a schedule without any device open; BACKUP-PLAN unchanged |
| What a bad merge or a deleted account does | reaches the cloud copy at once; only device copies and Drive copies remain | the object can be rolled back to before it | the last dump |

## 5. MCP (read-only `search` and `fetch`)

| | Firebase | Cloudflare | Laravel |
|---|---|---|---|
| Reading the notes | Firestore REST with a **service-account key** in a Worker secret; `datastore.viewer` cannot write, but reads every user and both envs | the MCP Worker calls the user's own object: **no key**, and the object id derived from the uid is the isolation | Eloquent queries on the same database: no key; isolation by `user_id` in our queries |
| Quota | competes with sync for 50 000 reads a day; real use needs a mirror of the notes at Cloudflare (MCP-PLAN §7.6) or Blaze | no competition worth counting | none |
| Search | the app's substring search over a mirror; Firestore Standard has no text search | the same search, or FTS5 in the same SQLite, next to the data | Postgres full-text (a Russian configuration, no Ukrainian dictionary) with `pg_trgm`, or MySQL `FULLTEXT`, or the app's search ported to PHP |
| Where the notes are seen | Google (stored), Cloudflare (passing through, stored in the mirror), the assistant's provider | Cloudflare (stored), the assistant's provider | the Laravel host and its database provider, the assistant's provider |
| Protocol and OAuth code | libraries: `createMcpHandler` (MCP 2026-07-28 and older clients), `workers-oauth-provider` | the same | libraries: `laravel/mcp` 1.0 (2026-07-28 and legacy clients), Passport |
| Code of our own | the Firestore reader, the mirror, the text and search shared with the app, the consent page | the text and search shared with the app, the consent page; no reader, no mirror | a PHP port of the app's text and search (two implementations to keep equal), the consent and user mapping |
| MCP-PLAN stages | as written | M1 and M3 get smaller: no service account, no mirror, no key rotation | rewritten for PHP |

## 6. From today's state; running and cost

| | Firebase | Cloudflare | Laravel |
|---|---|---|---|
| Work to get there | none for sync and sign-in; PR 4–5 of SYNC-PLAN remain as planned | the cloud side of PR 3a again (about its size: the object, the API, the ported rules and their tests, `cloud.js`, CI), and smaller parts of 3b (the access probe); PR 1, PR 2, the account interface and the sign-in stay; **no data to move**: .app has no cloud copy yet and .dev holds scratch notes | the same as Cloudflare in PHP, plus a server or Laravel Cloud, a database, Reverb or polling, and possibly a new sign-in |
| Delay of the sync release | none | the rebuild | the rebuild and the hosting |
| Platforms to run | Firebase and Cloudflare | Cloudflare, plus Firebase Auth | Cloudflare (the site), Laravel's host and database, plus Firebase Auth if kept |
| Money | $0 on Spark; Blaze later, whose budget alerts warn but do not cap | $0 on Workers Free if it fits, otherwise $5 a month | Laravel Cloud from $5 a month plus usage (database storage always billed, Reverb extra, spending limits available), or a VPS from about $4–6 a month plus our time |
| Operations | none of our own | none of our own; Workers Builds already deploys the site | PHP, database and package updates, monitoring, restore tests (less on Laravel Cloud) |
| Lock-in | Firestore's data model and rules | the site and the data on one provider (the Drive copies of BACKUP-PLAN keep an exit) | the least: plain SQL and PHP |

## 7. Scorecard

1 is weak, 5 is strong, judged for this project (one owner now, a few invited users later), on the end state of each stack; row 5 is the cost of getting there from today.

| Criterion | Firebase | Cloudflare | Laravel | Why |
|---|---|---|---|---|
| 1. Sync | **4** | **4.5** | **3** | Firebase is built and proven, but bent around Spark's quotas and `srv` that is not the commit order; Cloudflare removes both and adds WebSockets, at the price of our own access code; Laravel needs a separate WebSocket process |
| 2. Sign-in and authorization | **4.5** | **4.5** | **3.5** | the first two share Firebase Auth for people and the same OAuth library for assistants; Passport through `laravel/mcp` has one scope and no confirmed CIMD |
| 3. Backups | **2.5** | **5** | **4** | nothing server-side on Spark; 30-day point-in-time recovery per user by default; server dumps that we set up |
| 4. MCP | **3** | **5** | **4** | a project-wide read key and a mirror; direct reads with no key; direct reads, but the app's search ported to PHP |
| 5. From today (5 = nothing to do) | **5** | **3** | **1.5** | built; the cloud side of 3a again; a new backend, host and maybe sign-in |
| 6. Running and cost | **4** | **4.5** | **2.5** | free but quota-bound, two consoles; one platform, $0–5; a host to run |
| **Total of 30** | **23** | **26.5** | **18.5** | |

**How sensitive it is.** The order holds with every criterion weighted equally and with criterion 5 counted twice (28 / 29.5 / 20). Counted three times, Firebase leads by half a point (33 / 32.5 / 21.5). So the choice turns on one thing: **how much an early sync release is worth against a simpler long-term backend.** Laravel stays last under every weighting tried; it gains only if a maintained Laravel host already exists and is to be reused (§9).

## 8. Recommendation

- **Cloudflare (Durable Objects with SQLite), with Firebase Auth kept for sign-in**, decided **before sync is released to production**. Now is the cheapest moment: .app has no cloud data, so nothing migrates. It removes the weakest points of today's plans at once: the Spark quota budgets of sync, the absence of server-side backups without Blaze, and MCP's project-wide service-account key and mirror.
- **Stay on Firebase** if releasing sync on .app soon matters more: it works on .dev and is thoroughly tested. MCP then follows MCP-PLAN as written, and server-side backups wait for Blaze.
- **Laravel** only if there is already a maintained Laravel host the owner wants to reuse and accepts a PHP copy of the app's text and search; otherwise it costs the most and gains nothing the other two lack.
- **Not recommended:** releasing on Firestore now and moving to Cloudflare later. That pays for both, plus a real data migration.
- If the owner picks Cloudflare, the next step is a design amendment to SYNC-PLAN before any code: the object's API mapped onto the adapter contract, the rules ported into checks, the WebSocket listener, CI, and an estimate. MCP-PLAN is then revised: no service account, no mirror, M1 reads the object.

## 9. Not verified, and questions for the owner

- **Not verified:** the price of managed Reverb and of Laravel Cloud's Postgres snapshots; whether Passport validates CIMD clients; a size limit per SQLite-backed object (none stated on the storage API page); Workers Free CPU (10 ms) for the sync API's heavier requests (large notes); how often WebSocket reconnects happen on phones in practice.
- **For the owner:** is there a Laravel host already running (for Matamata or elsewhere) that should be reused? How soon should sync reach .app? Is it acceptable that the site and the shared copy of the notes are with one provider (Cloudflare), with Drive copies as the exit?

## 10. Sources (read on 2026-10-20)

- Firebase: [pricing](https://firebase.google.com/pricing) · [scheduled backups](https://firebase.google.com/docs/firestore/backups) · [point-in-time recovery](https://firebase.google.com/docs/firestore/pitr) · [Enterprise text search](https://firebase.google.com/docs/firestore/enterprise/text-search) · [Firestore IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam)
- Cloudflare: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) · [SQLite in Durable Objects (durability, PITR)](https://blog.cloudflare.com/sqlite-in-durable-objects/) · [data location](https://developers.cloudflare.com/durable-objects/reference/data-location/) · [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)
- Laravel: [Laravel MCP](https://laravel.com/docs/master/mcp) · [laravel/mcp releases](https://github.com/laravel/mcp/releases) · [`oauthRoutes()`](https://raw.githubusercontent.com/laravel/mcp/main/src/Server/Registrar.php) · [Reverb](https://laravel.com/docs/master/reverb) · [Laravel Cloud pricing](https://laravel.com/cloud/pricing)
- Baobook: [SYNC-PLAN.md](SYNC-PLAN.md) §4.6, §4.16, §4.17 · [BACKUP-PLAN.md](BACKUP-PLAN.md) · [MCP-PLAN.md](MCP-PLAN.md)
