# Automatic backups to Google Drive

**Status: approved plan, not implemented yet; approved on 2026-10-19; a separate stage after sync PR 4** ([docs/SYNC-PLAN.md](SYNC-PLAN.md)). The facts of §4 were checked on 2026-10-18 against the sources in §11; the CORS probe of §4 was run the same day. The owner's decisions are in §2 and are not changed by this document; where a fact bends a decision, §9 says how.

## 1. Goal

- **Sync is not a backup.** Firestore is a replica: a mistake, a merge bug or a deleted account reaches every device within seconds. A backup is a copy with a date that nobody writes over.
- **The 3-2-1 rule:** three copies (the device, the Firestore replica, the Drive copies), two media (Drive, plus the manual export on a computer as the second medium), one off-site (Drive). The iPhone is the reason it matters most: WebKit deletes a site's script-writable storage after seven days of Safari use without a visit to the site (an app on the Home Screen has its own counter, §4), and sync brings back only what the cloud still has.
- The app itself makes the copies while it is open, from one tab, only when something changed, without a server of its own and without Blaze.
- Restoring is the import that already exists: it adds and updates, never deletes.
- Without a sign-in nothing changes: the manual export stays as it is.

## 2. Owner's decisions (2026-10-19)

| Question | Decision |
|---|---|
| Who makes a copy | The app, while it is open, from the leader tab (SYNC-PLAN §4.10); only when something changed; no server of its own, no Blaze. |
| Access | The scope `drive.file`: the app sees only the files it created. Non-sensitive, no verification. The owner enables the Drive API and adds the scope (§8). |
| Token | A Drive access token lives about an hour and the browser gets no refresh token (§4). **B1:** one tap per session gives a token. **B2:** full automation through a small token broker in the Worker that PR 3 of the sync plan adds anyway; the notes never pass through it; the refresh token and the client secret are kept there safely (§6.6). |
| Kinds of copies | The copy «for today» is replaced at most once an hour, on a phone once in three hours. At 04:00 local time the last copy of the day becomes that day's copy. Kept: 7 daily, 4 weekly, 12 monthly, about 21 files, about 200 MB of 15 GB. Grandfather-father-son rotation, as `restic forget --keep-daily/weekly/monthly` and Time Machine do. |
| Safety nets | The 3 newest copies are never deleted. When a new copy has sharply fewer notes than the previous one, the previous one is kept for 30 days. Pruning is a pure function with tests. |
| What is in a copy | Every note in the export format of today; from the history only named versions and conflict copies; gzip (`CompressionStream`); no encryption (a password comes with the encryption stage). |
| Where | A visible folder «Baobook» in the owner's Drive; the copies of .dev in a folder of their own; separate dated files, not revisions of one file (Drive keeps revisions for a limited time, §4). |
| With sync | One set of copies per account, not per device: any device writes when it is «Синхронізовано». Equal content, by hash, is not uploaded twice. Two devices writing at once is covered in §6.7. |
| Restore | A list of copies in the app, a view with a comparison against the current notes, then the usual import, which deletes nothing. |
| Who | The owner only at first. Without a sign-in: as now, the manual export. |
| Also | **B4**, optional and independent, possibly earlier: copies into a folder on the computer through the File System Access API (Chrome and Edge only). On Blaze: daily managed backups of Firestore itself. |
| Unverified | Whether Google lets a browser upload files over 5 MB directly with the resumable protocol (CORS). B1 checks it first; if not, a fallback through the Worker (§6.5). |

## 3. Practices

- **GFS (grandfather-father-son).** `restic forget --keep-last n` keeps the n most recent snapshots; `--keep-daily n` keeps, «for the last n days which have one or more snapshots, only the most recent one for each day»; weekly and monthly likewise; «a snapshot only needs to match a single option to be kept (the results are ORed)». Time Machine «automatically makes hourly backups for the past 24 hours, daily backups for the past month, and weekly backups for all previous months», and deletes the oldest when the disk is full. §6.2 uses the restic semantics.
- **RPO and RTO.** The recovery point is the age of the newest copy: at most an hour (three on a phone) while some device has the app open, plus however long every device was closed; the manual export covers the rest. The recovery time is minutes: open the list, pick a copy, import; no server is involved, and a copy is readable without the app (§6.8).
- **How others do it.** Obsidian's File Recovery keeps local snapshots at least 5 minutes apart for 7 days, per device, outside the vault. Joplin saves a revision every 10 minutes, keeps them 90 days by default and syncs them with the notes. Standard Notes writes an encrypted backup every day to a folder on the computer and can e-mail a daily encrypted backup. Notion keeps page history 7, 30 or 90 days by plan, the trash 30 days, exports the workspace by hand, and restores from its own database snapshots of the last 30 days on request. Bear backs up by hand into one `.bear2bk` archive (a zip of text bundles) and its restore replaces every note; its iCloud sync is not a backup. The lessons taken: copies separate from sync, several generations, a copy that opens without the app, a restore that adds instead of replacing.

## 4. Facts about Google Drive and the browser that shape the design

- **Scope.** `drive.file` is **non-sensitive**: it lets the app «create new Drive files, or modify existing files, that you open with an app», and `files.list` returns only those. «If your app utilizes only non-sensitive scopes, it is not mandatory for your app to complete the app verification process»; a lighter «brand verification» is only for showing the name and logo. The consent screen is already in production.
- **Tokens.** «User access tokens automatically expire after one hour». In the browser Google issues no refresh token: the Google Identity Services token model renews a token only by `requestAccessToken()` «from a user-driven event such as a button press», and Firebase Auth hands out the Google access token only inside the result of a sign-in, `reauthenticateWithPopup`/`reauthenticateWithRedirect` or a link (`GoogleAuthProvider.credentialFromResult(result).accessToken`, after `provider.addScope(…)`); Firebase renews its own ID token, not Google's access token. A refresh token exists only for a server: the authorization code flow with `access_type=offline`, returned on the first exchange only (`prompt=consent` forces a new one), renewed at `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, revoked at `https://oauth2.googleapis.com/revoke`. It stops working when revoked or unused for six months; 100 live refresh tokens per account per client. The 7-day expiry of the «Testing» publishing status does not apply: the screen is «In production».
- **Uploads.** Simple and multipart uploads take «5 MB or less»; «for large files (greater than 5 MB)» the resumable protocol: a `POST` with the metadata and `X-Upload-Content-Type`/`X-Upload-Content-Length`, the session URI in the `Location` header, then `PUT` chunks «in multiples of 256 KB», a session valid for a week; the file limit is 5 TB. **CORS probe (2026-10-18, without a token):** the preflight of `POST /upload/drive/v3/files?uploadType=resumable` from `https://baobook.matamata.app` allows `POST, PUT, PATCH, DELETE` and the headers `authorization, content-type, x-upload-content-type, x-upload-content-length`; the 401 answer exposes `X-GUploader-UploadID`, not `Location`. Whether `Location` is exposed on a 200 is what B1 checks; if it is not, the session URI is rebuilt as `…?uploadType=resumable&upload_id={X-GUploader-UploadID}`, and if that fails too, the Worker proxies the upload (§6.5).
- **Revisions.** Of a non-Google file «any blob file revision, other than the head revision, that's not designated as "Keep Forever" is purgeable», kept about 30 days and «purged earlier if a file has 100 revisions»; «up to 200 revisions can be set to "Keep Forever"» and they «count towards your storage limit». Drive Help: «a version might be permanently deleted after 30 days or if there are 100 newer versions». So a copy is a file of its own, and a copy «for today» is a new file plus the deletion of the earlier one, never `files.update` with new content.
- **Deleting.** `files.delete` «permanently delete[s] a Drive file without moving it to the trash»; trashed files «are automatically deleted after 30 days» and count toward storage until then.
- **Properties.** `appProperties` are private to the app, at most 30 per app per file, «124 bytes per property string (including both key and value)», and searchable: `appProperties has { key='…' and value='…' }`.
- **Quotas.** Limits are in quota units: `files.list` 100, `files.get` 5, a download 200, `files.update` 50, other calls 5; 1 000 000 units per minute per project and 325 000 per minute per user; 400 000 000 units a day before charges. Storage: 15 GB shared with Gmail and Photos; the trash counts.
- **Browser.** `CompressionStream`/`DecompressionStream` with `gzip` are Baseline, «available across browsers since May 2023» (Chromium 80, Firefox 113, Safari 16.4). `showDirectoryPicker` is Chromium only (Chrome and Edge 86+), secure context, user activation; since Chrome 122 a granted folder permission can persist, and installed apps persist it by default. WebKit: a 7-day cap on script-writable storage in Safari; «web applications added to the home screen are not part of Safari and thus have their own counter».
- **Cloudflare.** Secrets are encrypted bindings, «not visible within Wrangler or Cloudflare dashboard after you define them», up to 5 KB each. Workers Free: 100 000 requests a day, 10 ms CPU per request, 100 MB request body, 50 subrequests. KV Free: 100 000 reads and 1 000 writes a day, 1 GB.
- **Firebase.** An ID token is verified with Google's public keys (`kid`, RS256; the x509 list and the JWK list at `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`, cached by `Cache-Control: max-age`, about 6 hours), `aud` = `baobook-3fe7f`, `iss` = `https://securetoken.google.com/baobook-3fe7f`, `exp`, `iat`, `sub` = uid. Firestore Spark: 50 000 reads, 20 000 writes, 20 000 deletes a day; this stage adds no Firestore traffic. Since 2025 the console shows an OAuth client secret only when the client is created.

## 5. Options

| Option | For | Against | Verdict |
|---|---|---|---|
| The client makes copies while the app is open | no server, no Blaze; the data is already on the device; `drive.file` | nothing happens while every device is closed; a token an hour | **chosen** (B1, then B2) |
| Revisions of one Drive file | one file, Drive's own history | purged after about 30 days or 100 revisions; keep-forever is capped at 200 and counts toward storage; no control over which generations stay; deleting the file loses everything | rejected: dated files |
| The hidden `appDataFolder` | no clutter | the owner cannot see, download or move the copies | rejected: a visible «Baobook» |
| Server-side copies (Cloud Scheduler + Functions, or managed Firestore backups) | runs with every device closed | Blaze; a copy of the replica, not of the device | later, when the project moves to Blaze |
| A folder on the computer (File System Access API) | a second medium, no cloud | Chrome and Edge only; the computer must be on | **B4**, optional |
| Encrypted copies | nothing readable at Google | a lost password loses the copies; a reader needs the key | with the encryption stage |
| B1 token: Google Identity Services token client | Google's own library | a new script and CSP entry for the same one tap | Firebase re-authentication with the scope instead |
| B2 token: GIS code client vs a plain OAuth redirect | — | the popup needs a JavaScript callback; the installed app prefers redirects (SYNC-PLAN §2) | a plain authorization-code redirect to the Worker |

## 6. Design

### 6.1 What is built

- `public/backup.js`: a pure core like `sync.js` (UMD, no build step, no DOM, no UI strings): the payload builder, the hash, `prune()`, file names and properties, the Drive client over an injected `fetch` with its base URL. `index.html` wires it to IndexedDB, the sync status, the gear menu and the leader tab.
- The `sync` store gets the keys `backup:last` {at, hash, notes, fileId, name}, `backup:folder` {id, site} and `backup:state` {mode: `off` | `tap` | `broker`, since}; all belong to (env, uid) and are cleared with the owner's other metadata (SYNC-PLAN §4.11). Tokens live in the tab's memory only.
- The gear menu gets a row «Резервні копії» with the state (§6.9) and a panel for the list and the restore (§6.8). The «Імпорт» button accepts `.json.gz` as well.
- B2 adds four routes to the Worker of SYNC-PLAN §4.12 (`worker/`), a KV namespace and two secrets (§6.6); `assets.run_worker_first` grows to `["/__/*", "/api/*"]`.

### 6.2 Kinds of copies, retention and safety nets

Every copy is a file. The «copy for today» is not overwritten in place: a new file is uploaded and the pruner deletes the earlier copies of the same backup day. A **backup day** runs from 04:00 to 04:00 local time, so the last copy before 04:00 is the one that stays for its day. Weeks are ISO weeks and months calendar months of the backup day. `prune(files, now, policy)` is a pure function over the listing of the folder; `policy = {last: 3, daily: 7, weekly: 4, monthly: 12, dayStart: 4}`:

```
sorted = files ordered by t descending            // t = appProperties.t (the creating device's clock), else createdTime
keep   = the first policy.last of sorted           // the 3 newest, whatever their age
     ∪ { f : f.keepUntil > now }                   // the shrink guard (below)
for (key, n) in [(day, 7), (week, 4), (month, 12)]:
  seen = ∅
  for f in sorted:                                 // newest first: the first file of a key is the newest of that day, week or month
    if key(f) ∈ seen: continue
    seen ∪= key(f); keep ∪= f
    if |seen| = n: break
remove = sorted ∖ keep
```

- Restic semantics: the «last 7 days» are the last seven days that have a copy, so a pause in use never eats the generations; the sets are ORed, and a file that is both a daily and a weekly is kept once.
- Only files of this site with `appProperties.app = baobook` and `kind = backup` are listed and only they can be removed; the folder itself, a file the app does not recognise and a file whose metadata it cannot read are never touched. Removal is `files.delete`, permanent, because a trashed copy still counts toward storage for 30 days and hourly copies would pile up there; the generations and the shrink guard are the protection, not the trash.
- **The shrink guard.** Before uploading, the new count of records in `notes` (the trash and the archive included) is compared with `appProperties.notes` of the newest listed copy. If it fell by at least 10 % and by at least 3 notes (`SHRINK = {pct: 10, min: 3}`, one constant with a test), the newest copy gets `appProperties.keepUntil = now + 30 days` and `reason = shrink` with a metadata-only `files.update`, the new copy is uploaded anyway, and the status says so (§6.9). The pruner keeps a file whose `keepUntil` is in the future.
- Expected shelf: 7 + 4 + 12 generations with overlaps, plus up to 3 newest and the guarded ones: about 21–24 files. A copy is a few MB today (§6.4); the plan budgets 10 MB a file, about 210–240 MB.
- Two devices in different time zones compute different backup days: that only changes which hourly copy survives as a day's copy, never whether a day survives.

### 6.3 When a copy is made and how often

A copy is **due** when all of these hold in the leader tab: an owner is signed in and backups are on (`tap` with a live token, or `broker`); the device is online; the sync status is «Синхронізовано» (SYNC-PLAN §4.18: the local set equals the cloud, so every device would write the same copy); nothing was typed for 30 s and the save queue is empty; the tab is not view-only; and `backup:last.at` is older than the interval: **1 hour**, or **3 hours** on a phone (the app's existing rule: a touch device whose shorter screen side is under 600 px). The check runs on a one-minute timer, on `visibilitychange` to visible, on `online`, and when the sync status becomes «Синхронізовано».

«Only when something changed»: the due check first compares the last local write (`clock.last`) and the last applied incoming document with `backup:last.at`; when neither is newer, nothing is read. Otherwise the payload is built and its hash compared with `backup:last.hash` and with the newest copy on Drive (§6.5); equal content only moves `backup:last.at`.

### 6.4 What a copy holds: format, names, folder

- The file is the export format of today, gzip-compressed (`application/gzip`), so the current import reads it after decompression and older exports keep importing:

```
{ app: "baobook", format: 1, kind: "backup", site: "app" | "dev", exported: ISO time,
  device: {id, name},                                   // the writing device, as sync's dev/dn
  settings: {theme, grid, spell},                       // as the export; the import applies them only into an empty app
  notes: [every record of `notes`: trash and archive included, with deleted/archived/revived],
  history: {versions: [records of `versions` with keep: 1, bodies inline], blobs: []} }
```

- Only `keep` records go in: named versions and conflict copies, whose bodies are inline (SYNC-PLAN §4.3), so `blobs` is empty and the automatic history stays per device. The importer ignores `kind`, `site` and `device`.
- **The hash** is SHA-256 (`crypto.subtle.digest`) over the canonical form of `notes` and `history.versions` without `updated` (SYNC-PLAN §4.15, §4.4 step 4), so two devices in «Синхронізовано» produce one hash whatever the key order of their records, and a change of `updated` alone makes no copy.
- **Names:** `baobook-2026-10-19T14-07.json.gz` on .app and `baobook-dev-2026-10-19T14-07.json.gz` on .dev: local time of the writing device, sortable, no colons. Both sites use one OAuth client and see each other's files, so the folders keep them apart: **«Baobook»** for .app, **«Baobook DEV»** for .dev, created in the root of My Drive, found again by `appProperties` (`app = baobook`, `kind = folder`, `site`), the id cached in `backup:folder`. The owner may move or rename the folder; a deleted folder is created again.
- **`appProperties` of a copy:** `app = baobook`, `kind = backup`, `site`, `fmt = 1`, `t` (ms), `hash` (64 hex), `notes` (count), `versions` (count), `dev` (device id); optional `keepUntil` (ms) and `reason`. Each under 124 bytes, fewer than 30.
- **Size.** Notes have no images (SYNC-PLAN §1). 5 000 notes of 1–3 KB are 5–15 MB of JSON and 1–4 MB gzipped; named versions and conflict copies add their bodies. Most copies fit one multipart request (≤ 5 MB); bigger ones take the resumable path.

### 6.5 One copy, step by step

1. **Read** in one IndexedDB transaction over `notes`, `versions` and `sync`: every note, the `keep` versions, `device`, `owner`. Build the payload, compute the hash.
2. **Compare** with `backup:last.hash`: equal → write `backup:last.at = now`, status «Без змін», stop.
3. **Token:** B1 the token of this session, B2 `POST /api/drive/token` (§6.6); none → the waiting status, stop.
4. **Folder:** `files.get` of the cached id (5 units); missing or trashed → `files.list` by `appProperties` (100) → create (`files.create`, `mimeType = application/vnd.google-apps.folder`).
5. **List** the folder (100): `q = '{folder}' in parents and trashed = false and appProperties has {key='app' and value='baobook'} and appProperties has {key='site' and value='{site}'}`, `fields = files(id, name, size, createdTime, appProperties)`, `pageSize = 100`. The newest copy by `t`: its `hash` equals ours → `backup:last` takes it, stop; its `t` is within the interval → another device wrote, `backup:last` takes it, stop. Shrink check against it (§6.2).
6. **Compress:** `new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))` → bytes.
7. **Upload:** ≤ 5 MB → one `multipart` request (metadata part with `name`, `parents`, `appProperties`; media part `application/gzip`). Over 5 MB → resumable: `POST` with the metadata and `X-Upload-Content-Length`, the session URI from `Location` or rebuilt from `X-GUploader-UploadID` (§4), then `PUT` chunks of 8 MiB (a multiple of 256 KiB); on a cut, `PUT` with `Content-Range: bytes */total` asks what arrived and continues; the session is good for a week but the copy is simply redone on the next due check if the tab is gone. **Fallback,** only if B1 proves the browser cannot finish a resumable upload: `PUT /api/drive/upload` streams the bytes through the Worker to Drive with the same metadata; the Worker stores nothing (body limit 100 MB).
8. **Verify** the answer: `id`, `name`, and `size` equal to the bytes sent; otherwise the copy does not count and the file is deleted.
9. **Guard and prune:** the `keepUntil` update when the shrink guard fired; `prune(listing + the new file, now)`; `files.delete` each removed file, one at a time, errors logged and retried on the next copy.
10. **Record** `backup:last` {at, hash, notes, fileId, name}; status «Копія на Диску · {when}»; the other tabs get `backup {at, state}` over the BroadcastChannel.

### 6.6 Tokens

**B1, one tap.** The row «Резервні копії» offers «Зробити копію на Диск». The tap runs `reauthenticateWithPopup` (a computer) or `reauthenticateWithRedirect` (a phone and the installed app, after saving everything, as SYNC-PLAN §4.12) with a `GoogleAuthProvider` carrying `addScope('https://www.googleapis.com/auth/drive.file')` and `login_hint` = the owner's email; Google asks for the Drive consent the first time (incremental authorization), and the result's `credential.accessToken` lives about an hour in the tab's memory. The copy runs at once, and again within that hour if something changes; when the token has expired the row says «Копія чекає на дотик» and the next tap repeats this. So B1 is honestly one tap per copy, not a tap per day: that is what B2 removes.

**B2, the broker in the Worker.** The standard authorization-code flow with a redirect, no Google library:

| Route | Does |
|---|---|
| `POST /api/drive/connect` | `Authorization: Bearer {Firebase ID token}` → verify (§4), uid on the allowlist → `state` = 32 random bytes, KV `state:{state}` = {uid, env} for 10 minutes → `{url}` of `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri = https://{host}/api/drive/callback`, `response_type = code`, `scope = drive.file`, `access_type = offline`, `prompt = consent`, `include_granted_scopes = true`, `login_hint`, `state`. The app saves everything and navigates there. |
| `GET /api/drive/callback` | `state` found and deleted (one use) → `code` exchanged at `https://oauth2.googleapis.com/token` with the client secret → the refresh token encrypted with AES-GCM under the key `DRIVE_KEK` (a random 256-bit secret; the nonce stored with the ciphertext) → KV `rt:{env}:{uid}` → redirect to `/?backup=connected`. No refresh token in the answer (`prompt=consent` makes it rare) → `/?backup=retry`. |
| `POST /api/drive/token` | ID token verified, uid allowed → KV → decrypt → `grant_type = refresh_token` at Google → `{access_token, expires_in}` to the tab, which caches it until a minute before expiry. Google's `invalid_grant` (revoked, six months unused) → the KV entry goes → 410 → «Підключіть Диск знову». |
| `POST /api/drive/disconnect` | revoke at `https://oauth2.googleapis.com/revoke`, delete the KV entry. |

- The browser receives exactly what Google would give it directly, a one-hour access token; the refresh token and the client secret never leave the Worker; the ciphertext (KV) and the key (a secret) live in different systems. Secrets: `GOOGLE_CLIENT_SECRET`, `DRIVE_KEK` via `wrangler secret put`, per Worker (`baobook`, `baobook-prod`). Variables: `GOOGLE_CLIENT_ID`, `BACKUP_UIDS` (the owner's uid; the same list as the rules). KV namespace `baobook-tokens`, one per Worker.
- Load: two requests a copy at most, under 100 a day, KV reads likewise, KV writes only on connect: nothing near the free limits. CPU: RS256 verification and AES-GCM through WebCrypto, well under 10 ms.
- The tab prefers the broker when `backup:state.mode = broker`; on a 410 or a failed broker it falls back to the B1 tap. Both sites register their own callback URI on the one OAuth client; the owner's Google account then lists one «Baobook» with Drive access.

### 6.7 With sync and the leader tab

- Only the leader tab backs up: it already runs the engine under the Web Lock and knows the status. Other tabs show the state from the BroadcastChannel and from `backup:last`.
- The gate «Синхронізовано» makes the copy a copy of the account, not of a device: every device in that state holds the same canonical content, so their copies hash equal and the second is skipped at step 5. A device that is offline or has pending changes makes no copy, and the row says «Копія після синхронізації».
- **Two devices at once.** Drive has no lock and SYNC-PLAN §4.2 allows no other Firestore collections, so there is no claim document; coordination is the listing at step 5 (another copy within the interval → skip) and, when both pass it within seconds, two files a few seconds apart with one hash. The next pruning keeps the newest of the day; the 3-newest rule may keep the twin for a while. Nothing is lost and nothing is written twice over the same file, since every copy is a new file.
- A change that lands between the read of step 1 and the upload is in the next copy; a copy is never a merge.
- The import that restores a copy is a local write through the core (SYNC-PLAN §4.14, the import contract), so sync carries the restored notes to the cloud and the other devices as usual.

### 6.8 Restore

- The panel «Резервні копії» lists the copies of this site from Drive, newest first: date and time, size, «{n} нотаток», «збережено до {date}» for a guarded one, and «Зробити копію зараз».
- A chosen copy is downloaded (`files.get?alt=media`, 200 units), decompressed with `DecompressionStream`, parsed and compared with the current notes by id and `updated`: «У копії {n} нотаток: {a} немає на цьому пристрої, {b} новіших у копії, {c} новіших тут, {d} без змін», with the titles of the first twenty differing notes. «Імпортувати» runs the import of today (`importNotes` + `importHistory`): missing notes are added, a note is replaced only by a newer copy and its state before that goes into the history as an `import` version, nothing is deleted. «Завантажити файл» saves the `.json.gz` on the device.
- The same file imports anywhere: «Імпорт» takes `.json.gz` (decompressed in the browser) and `.json`, so a copy downloaded from Drive by hand restores a fresh Baobook on any device, signed in or not.
- **Without the app:** a copy is gzip around plain JSON. `gunzip`, 7-Zip or the Archive Utility opens it; `notes[].title` and `blocks[].text` hold the text of every block (`html` only carries formatting), so any editor or `jq -r '.notes[] | .title, (.blocks[].text)'` reads the notes. B3 may also write a one-line `README.txt` into the folder saying exactly this (an open question for the owner, §9).

### 6.9 Errors and status

The row «Резервні копії» in the gear menu; a tap opens the panel. No toasts: a backup is a quiet background job.

| State | When |
|---|---|
| Копії на Диску вимкнено · Увімкнути | an owner, backups never set up |
| Зробити копію на Диск | B1: no live token |
| Роблю копію… | uploading |
| Копія на Диску · {when} | the last copy succeeded; {when} as the storage line's «експорт: … тому» |
| Без змін від {when} | the content hash did not change |
| Копія після синхронізації | the gate of §6.3 is not met (offline, pending changes, sync stopped) |
| Копія чекає на дотик | B1: the token expired, a change is waiting |
| Підключіть Диск знову | B2: the refresh token was revoked or expired (410) |
| На Диску немає місця | 403 `storageQuotaExceeded`; retried once a day |
| Диск не відповідає · спробую пізніше | network errors, 5xx, 429: exponential backoff from 1 to 60 minutes |
| Нотаток стало менше ({from} → {to}) · попередню копію збережено на 30 днів | the shrink guard fired |
| Копію не перевірено | step 8 failed; the file was deleted and the copy will be redone |

- A 401 from Drive: B1 drops the token and shows the tap; B2 asks the broker once more, then «Підключіть Диск знову». A 404 of the folder recreates it. A failed `files.delete` in pruning is logged and retried with the next copy.
- The account panel of SYNC-PLAN PR 4 shows «Диск підключено» with «Відключити Диск» (B2: revoke and forget).

### 6.10 Quotas and cost

| Resource | Per copy | Per day (≤ 24 copies) | Free limit |
|---|---|---|---|
| Drive API units | list 100 + folder 5 + create 50 + up to 3 deletes 150 + guard 50 | under 10 000 | 325 000 a minute per user, 400 million a day |
| Drive storage | ≤ 10 MB a file | about 21–24 files, 210–240 MB | 15 GB shared |
| Worker requests (B2) | 1–2 | under 100 | 100 000 a day |
| KV (B2) | 1 read | under 100 reads; writes on connect only | 100 000 reads, 1 000 writes a day |
| Firestore | 0 | 0 | — |
| A restore | list 100 + download 200 | | |

Everything stays on the free plans; the only resource that grows is Drive storage, bounded by the generations.

### 6.11 Privacy and the consent text

- The copies are unencrypted JSON in the owner's own Drive, readable by the owner and by Google, as the notes in Firestore already are. The app asks only `drive.file`: it sees nothing else in the Drive. Google's consent screen names the Drive permission; in the app, before the first connection: «Baobook створить у вашому Google Диску папку «Baobook» і зберігатиме в ній копії нотаток: щогодини, поки застосунок відкритий, і лише коли щось змінилося. Застосунок бачить лише файли, які створив сам. Відключити можна будь-коли; копії лишаються у вашому Диску, доки ви їх не видалите.»
- B2's Worker keeps an encrypted refresh token and sees access tokens; it never sees a note, unless the upload fallback of §6.5 step 7 is needed, which streams a copy through it without storing it.
- «Відключити Диск» revokes the grant and forgets the token; the folder stays until the owner deletes it in Drive. The copies of .dev sit in «Baobook DEV» and may be deleted at any time.

## 7. Pull requests (into `main`, checked on .dev)

| PR | What | Acceptance and tests |
|---|---|---|
| **B1. Copies with one tap** | **First task:** on .dev, a payload over 5 MB through the resumable protocol from the browser: `Location` exposed or not, the `upload_id` fallback, the result written into §4 (and the Worker fallback designed only if both fail). Then: `public/backup.js` (payload, hash, `prune`, names, the Drive client), the `backup:*` keys, the due check and the gate (§6.3), the folder, multipart and resumable uploads, the shrink guard, pruning, Firebase re-authentication with the scope (popup and redirect), the row of §6.9 without the panel, «Імпорт» of `.json.gz`. | Node: `prune()` table-driven: a day of hourly copies leaves one file; the 3 newest survive whatever their age; the 04:00 boundary (03:59 and 04:01 are two days); 7, 4, 12 with gaps in use (restic semantics); `keepUntil`; a file that is both daily and weekly; the sets ORed; another site's file never removed; two twins seconds apart; a run in `Europe/Kyiv` and in UTC. The payload: only `keep` versions, `blobs: []`, importable by the current import (round trip); the hash equal for two stores with another key order and another `updated`; the shrink constant. Browser (Playwright, a **fake Drive** in `tests/lib/drive.mjs`: an HTTP server with `files.list` and the subset of `q` the app uses, `files.create` multipart and resumable with `Content-Range` and 308, `files.get` with `alt=media`, `files.update`, `files.delete`, folder creation, CORS answers with and without `Location` exposed, a virtual clock for `createdTime`, faults by name: `401`, `403 storage`, `429`, `cut` mid-upload, `slow`; the app takes the base URL and a test token through `sheetDebug.backup`): the first copy makes the folder and the file with the right name and properties; no change → no upload; a change → a new file and the earlier copy of the day gone; the 3-newest rule; the shrink guard sets `keepUntil` and the status; two devices (two contexts over one fake Drive and the test cloud, both «Синхронізовано») → one copy, the second skipped by hash; a non-leader tab writes nothing; an expired token → «Копія чекає на дотик», a tap resumes; a cut upload resumes from the 308 answer; the fallback session URI from the upload id; a `.json.gz` import into a clean profile shows every note and the named versions; no copy while offline or with pending changes. CI unchanged: no real Google in tests. |
| **B2. The token broker** | The four routes in `worker/`, ID-token verification with cached keys, the allowlist, the one-use `state`, AES-GCM, KV, the client's preference for the broker with the B1 fallback, `run_worker_first` for `/api/*`, `wrangler.jsonc` with the KV bindings, the dev and prod secrets (§8). | Node: the Worker's handlers as a module with injected `fetch` (a fake Google token endpoint), an in-memory KV and a local RSA key pair: a bad signature, a wrong `aud`/`iss`, an expired token, a uid off the list, a reused `state`, a stale `state`, a callback without `code`, encrypt–decrypt round trip, `invalid_grant` → the entry removed and 410, `disconnect` revokes and forgets. Browser: with the fake broker, copies run with no tap for a simulated day; a 410 shows «Підключіть Диск знову» and the tap still works. By hand on .dev: the real consent, the callback on both hosts, a copy an hour later without a tap, revocation from the Google account page, the installed app on an iPhone. CI `paths` gains `worker/**` and `wrangler.jsonc` (if PR 3 has not already). |
| **B3. Restore and the panel** | The panel of §6.8: the list, the comparison, «Імпортувати», «Завантажити файл», «Зробити копію зараз», «Відключити Диск», the full status table, the optional `README.txt`, README and CLAUDE.md updated. | Browser: the list from the fake Drive newest first with the guard mark; the comparison counts on a prepared pair of states; the import adds and updates, deletes nothing, keeps the pre-import state as an `import` version, and the restored notes reach the test cloud; the download produces a file that imports; errors of §6.9 shown in the row; a phone layout of the panel. `tests/appi18n.mjs` keeps every string in the language files. |
| **B4. A folder on the computer** (optional, independent) | `showDirectoryPicker({mode: 'readwrite'})`, the handle in IndexedDB, `queryPermission`/`requestPermission` on return, the same files, names and `prune()` over the folder's listing; shown only where the API exists. | Browser (Chromium): a folder picked, a copy written, a change → a new file and the old one removed by the same pruner, a revoked permission → a one-tap re-request; the row hidden without the API. |

**Release:** B1 and B2 are checked on .dev with a copy of the real notes (the «Baobook DEV» folder), then released together or B1 first; the owner exports from .app before the release as always (CLAUDE.md).

## 8. What the owner sets up

1. **Before B1:** Google Cloud console, project `baobook-3fe7f`: APIs & Services → Library → **Google Drive API → Enable**. Google Auth Platform → **Data Access → Add or remove scopes** → `https://www.googleapis.com/auth/drive.file` → Save (non-sensitive: no verification, the screen stays «In production»).
2. **Before B2:** Google Auth Platform → Clients → the web client the Firebase Google provider uses (its id and secret are also under Authentication → Sign-in method → Google → Web SDK configuration in the Firebase console; if the secret is masked there, create a client «Baobook Worker» instead and save its secret at creation, Google shows it once). Add the **authorized redirect URIs** `https://baobook.matamata.dev/api/drive/callback` and `https://baobook.matamata.app/api/drive/callback`.
3. **Before B2:** `npx wrangler kv namespace create baobook-tokens` (and `--env prod`), the ids into `wrangler.jsonc`; `npx wrangler secret put GOOGLE_CLIENT_SECRET` and `npx wrangler secret put DRIVE_KEK` (`openssl rand -base64 32`) for both Workers; `GOOGLE_CLIENT_ID` and `BACKUP_UIDS` (the owner's uid from PR 3) as variables.
4. **After B1 on .dev:** the tap, the consent screen, the folder «Baobook DEV» in Drive, a file in it; the > 5 MB check of §7 with a copy of the real notes; a `.json.gz` import into a clean profile.
5. **After B2 on .dev:** «Підключити Google Диск», the consent with the Drive line, a copy an hour later without a tap on a computer and on the phone; revoke at myaccount.google.com → the row says «Підключіть Диск знову»; connect again.
6. The release as in §7.

## 9. Risks, open questions and manual checks

- **B1 means one tap per copy,** not per day: a one-hour token cannot cover the hourly cadence. B2 is the automatic variant; B1 alone is a safe first step and the manual «copy now» later.
- **The CORS of the resumable upload** is the first task of B1 (§4, §7); the fallback through the Worker exists on paper only until it is needed.
- **The 04:00 rule** is implemented as a backup day boundary, not as a rename at 04:00: nothing runs at 04:00, and the day's last copy stays because the next copy belongs to the next day.
- **The shrink threshold** `10 % and ≥ 3 notes` and the **30 s quiet period** are the plan's proposals, constants with tests; the owner may set other numbers.
- **`README.txt` in the folder** (§6.8) and **a date in the status** («Копія на Диску · 14:07» instead of «5 хв тому») are open questions for the owner.
- **Google storage full** stops copies, not the app; the row says so and retries daily.
- **Revocation and the six-month rule** end the broker's token: the row asks to connect again; nothing is lost.
- **Only the owner's uid** may connect (the allowlist and the rules); every other account gets the manual export as today.
- **Manual checks:** the consent screens on both hosts (the app name and the Drive line; no «unverified» warning for a non-sensitive scope), the redirect flow in the installed app on an iPhone, a phone that stays open for three hours, a copy over 5 MB, Drive's folder renamed and moved by hand (the copies still land in it), the folder deleted by hand (recreated), the Google account page showing «Baobook» with Drive access and revoking it.

## 10. Not in this stage

Encryption of the copies (with the encryption stage); copies for accounts other than the owner's; managed Firestore backups and Scheduler on Blaze; copies of the automatic history (per device by design); a reader page for copies outside the app (the JSON is readable as it is, §6.8); App Check on the broker.

## 11. Sources

- Drive API scopes and sensitivity: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- OAuth app verification: https://support.google.com/cloud/answer/13463073
- Google OAuth 2.0: token expiration, refresh tokens, incremental authorization: https://developers.google.com/identity/protocols/oauth2 and https://developers.google.com/identity/protocols/oauth2/web-server
- Access token lifetime (one hour): https://docs.cloud.google.com/docs/authentication/token-types
- Google Identity Services, token model and code model: https://developers.google.com/identity/oauth2/web/guides/use-token-model and https://developers.google.com/identity/oauth2/web/guides/use-code-model
- Firebase Auth, Google sign-in (`addScope`, `credentialFromResult`): https://firebase.google.com/docs/auth/web/google-signin; `reauthenticateWithPopup`: https://firebase.google.com/docs/reference/js/auth
- Firebase ID token verification with a third-party library: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Drive uploads (simple, multipart, resumable): https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Drive revisions: https://developers.google.com/workspace/drive/api/guides/manage-revisions and https://support.google.com/drive/answer/2409045
- Drive deleting and the trash: https://developers.google.com/workspace/drive/api/guides/delete
- Drive custom properties: https://developers.google.com/workspace/drive/api/guides/properties; search: https://developers.google.com/workspace/drive/api/guides/search-files
- Drive API limits (quota units): https://developers.google.com/workspace/drive/api/guides/limits
- Google storage (15 GB shared): https://support.google.com/drive/answer/6374270
- Masked OAuth client secrets: https://developers.googleblog.com/en/usability-and-safety-updates-to-google-auth-platform/
- Consent screen configuration (Google Auth Platform): https://developers.google.com/workspace/guides/configure-oauth-consent
- MDN `CompressionStream`: https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream; `showDirectoryPicker`: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker; persistent permissions: https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- WebKit, the 7-day cap and Home Screen apps: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Cloudflare Workers secrets, limits and KV: https://developers.cloudflare.com/workers/configuration/secrets/, https://developers.cloudflare.com/workers/platform/limits/, https://developers.cloudflare.com/kv/platform/pricing/
- Firestore quotas: https://firebase.google.com/docs/firestore/quotas
- restic `forget` policies: https://restic.readthedocs.io/en/stable/060_forget.html; Time Machine: https://support.apple.com/en-us/104984
- Obsidian File Recovery: https://obsidian.md/help/plugins/file-recovery; Joplin note history: https://joplinapp.org/help/apps/note_history; Standard Notes backups: https://standardnotes.com/help/14/how-do-i-create-and-import-backups-of-my-standard-notes-data; Notion page history and export: https://www.notion.com/help/duplicate-delete-and-restore-content, https://www.notion.com/help/export-your-content; Bear backup and restore: https://bear.app/faq/backup-restore/
