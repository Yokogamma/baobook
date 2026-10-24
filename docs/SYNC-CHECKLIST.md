# Sync: manual checks on real devices

What the emulators cannot check (docs/SYNC-PLAN.md §7): the real Google sign-in through the Worker proxy, the redirect's return, phones, the installed app, the cost in the console. Every item names what to do and what must be seen. Done on `.dev` (https://baobook.matamata.dev), whose notes are scratch data; the same on `.app` after a release. Tick the items in the PR that asks for them, with the device and the browser.

## Before 3c (the rules are still «deny all»)

The sign-in works, the data does not move yet: the first read is refused by the rules, so the status says «Синхронізація за запрошеннями» and the device is not bound to the account (no owner). This is the state in which the owner's uid is read for 3c. Items 1–4 were done on 2026-10-19 in Chrome through Claude in Chrome: one press, the popup on the site's origin, the status, the account kept on a reload, the SDK in `baobook-sdk` and no `/__/auth/` entry in any cache; the uid is in the rules.

1. **Computer, Chrome:** the gear → «Увійти через Google». The press loads the SDK (`baobook-sdk` appears under DevTools → Application → Cache Storage) and opens a popup on `baobook.matamata.dev/__/auth/handler?…` (the site's own origin, not `firebaseapp.com`), with the Google account chooser. If the browser blocked the popup (the load took too long for the press to count as fresh), the label says «Продовжити з Google» and the next press opens it. After the choice: the menu shows the email, «Вийти» and «Прибрати нотатки з пристрою»; the header has the cloud button; its title and the line under the email say «Синхронізація за запрошеннями».
2. **Firebase console → Authentication → Users:** the account is listed with its User UID. The uid goes into `firestore.rules` (3c).
3. **Reload:** the menu still shows the account (Firebase remembers it), the status is the same, no popup.
4. **«Вийти»:** the menu offers the sign-in again and nothing else of the account: no status line, since the device was never bound (the rules refused the access). «Вийшли · n змін чекає» belongs to a bound device, after 3c (item 9).
5. **Firefox and Safari** on the computer: items 1 and 3 (the popup on Safari may be blocked on the first try: allow popups for the site, or the second press after the SDK is in shows it).

## After 3c (the rules published with the owner's uid)

6. **Sign-in:** the status goes «Перевіряю доступ…» → «Синхронізовано»; the notes of the device are in Firestore (console → Firestore → `env/dev/users/{uid}/notes`), each with `srv`, `rev`, `rcpt`.
7. **A second browser or device, the same account:** after the sign-in the notes arrive; an edit on either side reaches the other within seconds; the same block edited on both at once leaves one text and a conflict copy in the history.
8. **Offline:** airplane mode → an edit → «Офлайн · 1 зміна чекає»; back online → «Синхронізовано», the edit on the other device.
9. **Sign-out with an edit waiting:** «Вийти» while the status says «Надсилаю…» → «Завершую надсилання…» for a moment, then «Вийшли · n змін чекає»; the sign-in again sends them.
10. **Another Google account (not in the rules):** sign out, sign in with a second account → «Синхронізація за запрошеннями», no dialog, the notes stay; sign out, sign in with the owner's account → «Синхронізовано», nothing asked.
11. **Two tabs:** both show the status; «Вийти» in one signs out both; the sign-in in one shows the account in the other (reload it if its SDK was not loaded). A tab left in the background for over five minutes while the other is used: the visible one syncs (an edit reaches the other device within seconds, the status moves there), not the hidden one.
12. **«Прибрати нотатки з пристрою»:** the dialog says what is not in the cloud and offers the export; «Прибрати» → the page reloads empty, signed out, with the sign-in offered; the cloud keeps everything (item 6); the sign-in brings the notes back.
13. **Phone, Chrome on Android, in the browser:** the gear → the sign-in → one press: the SDK loads and the page itself goes to Google (no popup, no second press) and comes back signed in, with the status; everything typed before the press is there.
14. **Installed app (Android):** item 13 inside the app window; the return lands in the app, not in the browser.
15. **iPhone, Safari:** the sign-in by redirect as in 13; after the first start with an account a toast once: «Щоб встановити на iPhone: «Поділитися» → «На Початковий екран»»; not again after a reload.
16. **iPhone, the installed app:** the sign-in by redirect inside the app; the return lands in the app; after a few days of not opening Safari the notes are still there (the Home Screen app has its own counter) and the status says synced after a start.
17. **The service worker:** DevTools → Application → Cache Storage: `baobook-sdk` holds the three `firebasejs/12.19.0/` modules, no `/__/auth/` entry anywhere; offline → reload → the app starts, the SDK loads from the cache, the status says «Офлайн · …».

## The cost (SYNC-PLAN §4.17)

18. **Three devices for an hour** with the first load and a few reconnects: the console's usage (Firestore → Usage) against the device's estimate (`sheetDebug.sync.quota()` in the console of the leader tab: `reads`, `writes` for the Pacific day). Criterion: the extrapolated owner's day stays within 25 % of the project limit's share; a refused request (item 10) must not count as a document read in the console.

## The browser storage (docs/IDB-FALLBACK-PLAN.md §10, PR #96)

When IndexedDB does not open, the app no longer switches silently to localStorage: it retries, shows «Сховище браузера відкривається…», then a view-only strip «Сховище браузера не відкрилося…» with «Експорт» and «Оновити», and reloads by itself when the storage comes back. The full list of checks is in the plan's §10; these are the ones on the owner's devices. Items 19 and 20 were done on 2026-10-23 on the owner's Android phone, in the installed app on `.dev` at «Версія 26.10.23.2»: the reinstall with the app's data kept («не удалять»), then a force-stop of Chrome and a start from the home screen, each opened the real notes with the sign-in and no fallback mode; a start with the network off opened from the service worker's set with the notes; the update strip and «Оновити» worked. No storage strip showed.

19. **Android, the installed app on `.dev`:** uninstall and reinstall it, open it; then force-stop Chrome and open the app from the home screen at once. Expected: the real notes (and the sign-in in the menu), or the strip that goes away by itself within seconds; never «Без назви» alone with an editable sheet, never «(резервне сховище)» on a device that has notes. If a strip shows, note its text and how long it stayed.
20. **Android, offline and with an older build:** the same with Wi-Fi off (a start from the service worker's set) and with «Доступна нова версія» showing: both strips show, «Оновити» on either reloads.
21. **A database that never opens again.** First the steps that lose nothing: «Оновити»; close the app completely (Android: force-stop Chrome or the installed app; iOS: swipe it away) and open it again; restart the device; on a signed-in device, check on another device or in the Firebase console that the notes are in the cloud.
22. **Clearing the site data is the destructive last resort.** It deletes the unreadable database with every note that exists nowhere else (notes written offline or before signing in, and the local history of versions), and an empty export from the strip proves nothing about what the database holds. Do it only with a verified copy (an export made while the database still opened, or every note seen on another signed-in device) or with the decision to lose the inaccessible local data. Where: Android Chrome «Налаштування сайту → Сховище → Очистити» (or the installed app's storage info); iOS Settings → Safari → Advanced → Website Data. Afterwards reopen the app and sign in: what the cloud has comes back. Tried once on a test profile, never first on the owner's device.

## PR 4: named versions, conflicts, the account panel (SYNC-PLAN §4.9, §4.11, §4.18, §4.19)

Built in `main` (4a #100 and #114, 4b #116, 4c #118); checked on `.dev` before the release. Each item names its part.

23. **4a, a named version on two devices:** on the phone, «Історія» → «⋯» → «Зафіксувати версію…» with a name; the row says «ще не надіслано», then «у хмарі». On the computer the version appears in the same note's «Історія» within seconds; «Перейменувати версію…» there → the phone shows the new name. «Видалити версію» on one device → it goes from both, with the dialog «Її буде видалено на всіх пристроях.».
24. **4a, a version that stays on the device:** a version of a note with a very large block (over the cloud's limit) says «лише тут: завелика»; «Прибрати нотатки з пристрою» counts it in «Лише на цьому пристрої N іменованих версій.».
25. **4b, a conflict with the phone in flight mode:** the same block edited on the phone offline and on the computer; the phone back online → on the device whose edit lost, the toast «Конфлікт із {пристрій}: …» with «Показати» (only in the visible tab with the note open), the badge «N конфлікт» on the history button and the mark in the note list. «Показати» opens the copy.
26. **4b, «Відновити» and «Прибрати»:** «Відновити» on the copy → the note takes it, the copy goes, «Скасувати» brings both back (also by Ctrl+Z after leaving the note and coming back); the other device gets the restored text. A second conflict, then «Прибрати» → the copy goes, «Скасувати» brings it back. A note in the trash with a copy: «Історія» opens read-only, only «Прибрати»; removing its last copy asks first.
27. **4c, the panel on a computer:** the cloud button opens «Обліковий запис»: the email, «Синхронізовано» with its sentence, «Перевірено о …», «Читань сьогодні: N із L», «Записів сьогодні: M із L», the device name, the buttons. Esc closes it; the account row of the menu opens it too. Offline with an edit: «Офлайн · 1 зміна чекає» and «1 нотатка ще не в хмарі.»; back online the count goes while the panel stays open.
28. **4c, the panel on a phone:** a bottom sheet across the screen, Back closes it, the buttons large enough for a thumb; «Прибрати нотатки з пристрою» from it closes the panel first, and Back then closes only that dialog. With the keyboard open on the name field, the field stays visible.
29. **4c, the device name:** «Назва пристрою» on the phone → «Мій телефон», Enter. An edit made on the phone shows on the computer as «Є зміни з Мій телефон» while typing there, and a conflict copy from the phone names it.
30. **4c, «Очікую підтвердження»:** a slow network (DevTools → Network → a custom profile with a long latency, or a weak mobile signal): an edit says «Надсилаю… · 1», then «Очікую підтвердження» after 30 s with no other action, then «Синхронізовано».
31. **TalkBack (Android) and VoiceOver (iPhone):** the history button reads «Історія · N конфлікт»; the list mark reads «є конфліктні копії»; the conflict toast is announced and its «Показати» is reachable; the cloud button reads its status; the panel is announced as «Обліковий запис», its rows and buttons read in order, and closing it returns to the button that opened it.

## Where the results go

The PR that asks for the checks lists the items done, with the device and the browser; what fails becomes an issue. The plan's §5 row of PR 3 and CLAUDE.md are updated when 3c is published.
