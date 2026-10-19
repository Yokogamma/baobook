# Sync: manual checks on real devices

What the emulators cannot check (docs/SYNC-PLAN.md §7): the real Google sign-in through the Worker proxy, the redirect's return, phones, the installed app, the cost in the console. Every item names what to do and what must be seen. Done on `.dev` (https://baobook.matamata.dev), whose notes are scratch data; the same on `.app` after a release. Tick the items in the PR that asks for them, with the device and the browser.

## Before 3c (the rules are still «deny all»)

The sign-in works, the data does not move yet: the first read is refused by the rules, so the status says «Синхронізація за запрошенням». This is the state in which the owner's uid is read for 3c.

1. **Computer, Chrome:** the gear → «Увійти через Google». The first press turns the label into «Продовжити з Google» (the SDK loaded; `baobook-sdk` appears under DevTools → Application → Cache Storage). The second press opens a popup on `baobook.matamata.dev/__/auth/handler?…` (the site's own origin, not `firebaseapp.com`), with the Google account chooser. After the choice: the menu shows the email, «Вийти» and «Прибрати нотатки з пристрою»; the header has the cloud button; its title and the line under the email say «Синхронізація за запрошенням».
2. **Firebase console → Authentication → Users:** the account is listed with its User UID. The uid goes into `firestore.rules` (3c).
3. **Reload:** the menu still shows the account (Firebase remembers it), the status is the same, no popup.
4. **«Вийти»:** the menu offers the sign-in again and still names the account the notes belong to; the status says «Вийшли · 0 змін чекають». An edit → «Вийшли · 1 зміна чекає».
5. **Firefox and Safari** on the computer: items 1 and 3 (the popup on Safari may be blocked on the first try: allow popups for the site, or the second press after the SDK is in shows it).

## After 3c (the rules published with the owner's uid)

6. **Sign-in:** the status goes «Перевіряю доступ…» → «Синхронізовано»; the notes of the device are in Firestore (console → Firestore → `env/dev/users/{uid}/notes`), each with `srv`, `rev`, `rcpt`.
7. **A second browser or device, the same account:** after the sign-in the notes arrive; an edit on either side reaches the other within seconds; the same block edited on both at once leaves one text and a conflict copy in the history.
8. **Offline:** airplane mode → an edit → «Офлайн · 1 зміна чекає»; back online → «Синхронізовано», the edit on the other device.
9. **Sign-out with an edit waiting:** «Вийти» while the status says «Надсилаю…» → «Завершую надсилання…» for a moment, then «Вийшли · n змін чекає»; the sign-in again sends them.
10. **Another Google account (not in the rules):** sign out, sign in with a second account → «Синхронізація за запрошенням», no dialog, the notes stay; sign out, sign in with the owner's account → «Синхронізовано», nothing asked.
11. **Two tabs:** both show the status; «Вийти» in one signs out both; the sign-in in one shows the account in the other (reload it if its SDK was not loaded).
12. **«Прибрати нотатки з пристрою»:** the dialog says what is not in the cloud and offers the export; «Прибрати» → the page reloads empty, signed out, with the sign-in offered; the cloud keeps everything (item 6); the sign-in brings the notes back.
13. **Phone, Chrome on Android, in the browser:** the gear → the sign-in → the page itself goes to Google (no popup) and comes back signed in, with the status; everything typed before the press is there.
14. **Installed app (Android):** item 13 inside the app window; the return lands in the app, not in the browser.
15. **iPhone, Safari:** the sign-in by redirect as in 13; after the first start with an account a toast once: «Щоб встановити на iPhone: «Поділитися» → «На Початковий екран»»; not again after a reload.
16. **iPhone, the installed app:** the sign-in by redirect inside the app; the return lands in the app; after a few days of not opening Safari the notes are still there (the Home Screen app has its own counter) and the status says synced after a start.
17. **The service worker:** DevTools → Application → Cache Storage: `baobook-sdk` holds the three `firebasejs/12.19.0/` modules, no `/__/auth/` entry anywhere; offline → reload → the app starts, the SDK loads from the cache, the status says «Офлайн · …».

## The cost (SYNC-PLAN §4.17)

18. **Three devices for an hour** with the first load and a few reconnects: the console's usage (Firestore → Usage) against the device's estimate (`sheetDebug.sync.quota()` in the console of the leader tab: `reads`, `writes` for the Pacific day). Criterion: the extrapolated owner's day stays within 25 % of the project limit's share; a refused request (item 10) must not count as a document read in the console.

## Where the results go

The PR that asks for the checks lists the items done, with the device and the browser; what fails becomes an issue. The plan's §5 row of PR 3 and CLAUDE.md are updated when 3c is published.
