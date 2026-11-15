# The rules reference and the rules assistant

**Status: draft of 2026-11-04, after the owner's answers to eight questions (§2) and one independent review round (review log); for after layout engine 0.1 ships. Not implemented. Waiting for: the owner's review, answers to §3, and four additions to the layout engine's documents (§3.1, D-1 to D-4), which this plan does not make itself.**

This plan adds two things on top of the layout engine of [`LAYOUT-ENGINE-PLAN.md`](LAYOUT-ENGINE-PLAN.md) (on branch `ccr-fde1eaa8-r7b10i`, draft PR #124, until it is merged):

1. **The reference** («Довідник»): every switchable rule, every setting and every core idea of the layout, in plain words in Ukrainian and English, browsable and searchable in the app, offline, at no cost. Each entry says what it does, gives an example, what replaces it when it is off, what it needs and what needs it, the owner's decision it comes from, and where it is changed; a rule or setting that can be changed is changed right in its entry.
2. **The assistant** («Помічник»): a chat in the app that has the whole reference in front of it, answers questions about how the layout behaves («как работают отступы у …?»), finds the rule or setting a request is about («сделай поля широкие у текстовых блоков»), and proposes the change. The owner confirms; the app applies it through the same function as the reference's own switch and the «Правила» list, never by writing a note, and offers «Повернути».

Rules are cited by their ids in [`LAYOUT-RULES.md`](LAYOUT-RULES.md) (`SIZE.1`, `VIEW.8`, §1.6), decisions by their ids in the table of [`LAYOUT-MODEL.md`](LAYOUT-MODEL.md) §2 (`W3`, `P18`, `R1`); the decisions of this plan are `RA1`, `RA2`….

## 1. What and why

The owner, 2026-11-04: «У нас много будет и есть правил, все мне помнить где что меняется будет крайне сложно. Было бы удобно, чтобы после выкатки первого 0.1 движка мы подготовили справочник и вариант AI-чата с нашим приложением, который читает справочник и сам находит и переключает нужное правило.»

Version 0.1 has about 36 switches (`LAYOUT-RULES.md` §1.6; the prose of the layout plan says 35, its `RuleId` lists 36, and this plan counts nothing by hand: every count comes from `rules.js`), about a dozen named settings and constants (§1.5), two device settings of the look (P18: where the text stands, narrow or wide field), the reading mode and the frame or background look (VIEW.6a), and the testing look (VIEW.7). Their descriptions live in three English documents of 500 lines each, under ids that only make sense next to the documents. 0.2 adds more (O-20: variants of a rule; `ORDER`, `MINC`, `MINSCALE` as settings; a note's own view settings). Finding «the rule that makes the block jump when I hold it» means knowing it is `THROUGH`.

Two things must hold:

- **One source of truth.** The reference is built from the engine's own declarations (`public/layout/rules.js` and the settings declarations of D-3) and the localized texts; it holds no list of rules of its own. A test fails when a rule or setting has no entry, an entry names a rule or setting that does not exist, a decision cited does not exist, or a text is missing in one language (§6).
- **One way to change.** The reference, the «Правила» list and the assistant change a rule or a setting through one function of the layout bridge (D-4), so what the assistant does is exactly what the owner's tap does, with the same resolution of needs (`resolve`) and the same re-open of the note (`open()`, `LAYOUT-ENGINE-PLAN.md` §6 item 4). The assistant never writes a note, a block or `sheet:settings` directly.

## 2. The owner's decisions (2026-11-04)

| # | Question | Decision |
|---|---|---|
| RA1 | Where | Both the reference and the assistant on `.dev` and `.app`. The assistant switches rules on `.app` too, so the rules become changeable on `.app` (D-1) |
| RA2 | Order | The reference and its plain search first (PR 1), with no AI, no network and no cost; the assistant on top of it (PR 2, PR 3) |
| RA3 | Model | Claude Sonnet 5.5 (`claude-sonnet-5-5`), behind the Cloudflare Worker; the API key only in the Worker |
| RA4 | Budget | $20 a month in all, `.dev` and `.app` together; the Worker stops the assistant when it is reached (§5.6) |
| RA5 | A note's own settings | When they exist (0.2, VIEW.6a), the assistant may change them for the open note, with the owner's confirmation and an undo, by the same path as the note's menu (§5.4) |
| RA6 | A live example | Yes, in a separate PR after the chat (PR 4): a small sheet of two or three blocks, laid out by the same engine with the rule on and off; it never touches a note |
| RA7 | Note content | Not now. Nothing from the notes goes to the model: no text, no titles, no layout. Asking «why did this block go down» about a real note is a later stage, if ever (§10) |
| RA8 | Who | Only the signed-in owner: the Worker checks the Firebase ID token and the owner's uid (§5.2); signed out, offline or over the budget, the reference keeps working and the assistant says why it does not |

## 3. Open questions

### 3.1 For the layout engine's documents (not edited by this plan)

These are additions to `LAYOUT-RULES.md` and `LAYOUT-ENGINE-PLAN.md`, owned by the session that writes them. This plan assumes the recommended answer and changes with the owner's.

- **D-1. The rules on `.app`** (from RA1). Today the «Правила» list is `.dev` only and inside the testing look (VIEW.8), and the layout plan says so in several places: §1.1 «Switches» («absent on `.app`»), §1.2 «Later» («only if the owner decides so»), §2.1 «The `rules` input» («on `.app`, with no list, they are `DEFAULT`»), §5's release text (0.1 goes to `.app` with every rule on and no list), the §6.1 settings row, step 5's `tests/applayoutrules.mjs` (rules absent on `baobook.matamata.app`), and §7 «Rules switched off on `.dev`». RA1 is the owner's decision that changes them. Recommended: on `.app` the rules are changed only from the reference and the assistant, not from a list in the testing look; the risk of §7 of that plan (a rule turned off moves what the next action writes, into real notes, synced; INV-7 b lost while `GAP.2`, `GAP.5.2` or `GAP.5.3` is off, and not given back when it is on again) is then the owner's real notes' risk, so §9 adds the marks and guards of this plan, and the release that brings the rules to `.app` is rehearsed on `.dev` with a rule off on a copy of the owner's notes (§7).
- **D-2. Decisions and names on each rule.** `RuleDecl` is `{id, needs, fallback}` (`LAYOUT-ENGINE-PLAN.md` §2.1); the decisions a rule rests on are only in the brackets of `LAYOUT-RULES.md`, and the «Правила» list's names and greyed reasons are keys of `uk.json` and `en.json`. Recommended: `RuleDecl` gets `decisions: string[]` (`['M6']` for `THROUGH`) and `module: string` (`'DRAG'`), so the reference reads them from the same declaration and `tests/layoutrules.mjs` checks them against §1.6 as it checks `needs`; and one function maps a rule id to its keys (`ruleKey('P-ASIDE')` → `rule.p_aside`, since `-` and the id's dots break the key pattern of `tests/appi18n.mjs`), used by the list and the reference alike, so a rule has one name. Fallback if not: the reference keeps a table `id → decisions`, and `tests/refmodel.mjs` checks it against the brackets of `LAYOUT-RULES.md` (§6).
- **D-3. Settings as declarations.** The settings of 0.1 are a typedef (`Settings`, §2.1) and keys in `sheet:settings` (the engine switch, the testing look, P18's two, the reading mode, frame or background), with no list a program can read. Recommended: a `SettingDecl` per setting, `{id, key, values, default, scope: 'device'|'app'|'note', since, changeable, assistant}`: `changeable: false` for the constants at their defaults in 0.1 (`TEXTW`, `HOLD`…; `ORDER`, `MINC` and `MINSCALE` become changeable in 0.2); `assistant: false` for those the assistant must not set: the engine switch (it reloads the tab, which ends the conversation, and goes away after step 6) and the testing look; exported next to `rules.js` (`settings.js`, or in `rules.js`). Whether the reading mode and the frame look are device settings or app settings in 0.1 (the layout plan's §1.1 VIEW row says «app settings») is for that plan to settle; the scope comes from the declaration either way.
- **D-4. One setter.** `panel.js` writes the «Правила» setting and calls `LAYOUT.open()` (§6 item 4). Recommended: the bridge exports `setRules(partial)` and `setSetting(id, value)`, which validate, write `sheet:settings`, resolve and re-open the open note (cancelling a gesture held, as for any change from outside); `setRules` takes and returns the rules *asked for* (the partial map VIEW.8 keeps), never the resolved ones, so that putting the old map back keeps «turning it on again brings back what was on»; both return the stored values before and after (for «Повернути»). `getState()` gives the rules asked for, the rules in effect with the reason a rule is greyed, and the settings' values. `panel.js`, the reference and the assistant all call them, and nothing else writes those keys. Other tabs of the same device listen for the `storage` event on those keys and re-open their note the same way, so no tab keeps laying out by the old rules.

### 3.2 For the owner

- **Q-1. Where the reference texts live.** About 60 entries × 5 texts make some 35 KB a language, almost doubling `uk.json` (44 KB), which every start loads. Recommended: a file of their own per language in a folder of their own, `public/locales/ref/<lang>.json` (not `public/locales/<lang>.ref.json`: `tests/appi18n.mjs` takes every `*.json` in `public/locales/` for a language), loaded when the reference or the assistant opens, with its hash in the `SRI` table and its `PRECACHE` entry (`tests/hashes.mjs` and `sw.js` name the folder), checked by `tests/refmodel.mjs` (completeness against the declarations, since the `ref.*` keys are built at run time and no literal names them) and by `tests/appi18n.mjs` for Cyrillic outside the language files and broken plurals. The rule names stay in `<lang>.json`, where the «Правила» list has them (D-2). That is a second file per language, which `CLAUDE.md` «Localization» does not yet mention; PR 1 adds the line. The other way: everything in `<lang>.json`.
- **Q-2. «Сокращённые заголовки».** Your example «найди, как работают отступы у сокращённых заголовков»: 0.1 has no rule with headings; the nearest are an area collapsed to its header (A3), a code block never narrower than its header (W14), and the gaps between blocks (GAP). Was it an example of a question the assistant must answer «there is no such rule; the nearest are…», or a feature that is coming (pinned headings, L1)? The assistant is written to say plainly when the reference has nothing (§5.3), and this question is in its eval set (§6.4).
- **Q-3. The assistant's reach on a phone.** The layout is edited only on a computer in 0.1 (W13), but rules and settings are device settings of every device. Recommended: the reference and the assistant work on a phone too, and a change applies to that device only, as the card says (§5.4).

## 4. The reference

### 4.1 What an entry is

Three kinds of entry:

- **rule**: one per `RuleDecl` of `rules.js` (35 in 0.1; 0.2's join with their rules).
- **setting**: one per `SettingDecl` (D-3): the device settings of 0.1, and the named constants of §1.5 that a user would recognise (`TEXTW`, `MINC`, `ORDER`, `HOLD`, `STICK`, `NEAR`, `MINSCALE`, `FOLDPHONE`), shown as «не змінюється в 0.1» with their value. The engine's internal bounds (`MAXCELL`, `RESTSTEPS`, `RESTPASSES`) and `SHEETW`, a stored property of a note, get no entry; `SettingDecl` marks them `internal`, and the drift test knows them by that mark.
- **topic**: a core idea that is not a switch but is what people ask about: the gaps and their stacks (GAP, §1.3), the elastic width and the set width (W3, SIZE.1), rows and heights (§1.2, H1), folding (H1–H6), areas (AREA), the scale and the narrow view (VIEW.1, VIEW.2), the reading mode (VIEW.6a), what is written and when (INV-6). A topic lists the rule ids of `LAYOUT-RULES.md` it explains, core ones included (`GAP.1`, `FOLLOW`), and links to the switches inside it. The list of topics is data of the reference (`topics.js`, about 15); each topic id and every rule id it cites is checked against `LAYOUT-RULES.md` (§6).

Each entry has, in both languages:

| Text | Example (`P18` field) |
|---|---|
| `name`: what the owner would call it | «Поля навколо блоків» |
| `what`: what it does, in one or two sentences | «Вузьке поле: блоки можуть стояти впритул. Широке: під кожним блоком лишається порожній рядок, тож блоки не підходять ближче ніж на рядок.» |
| `example`: one situation | «Два абзаци один під одним: з широким полем між ними завжди рядок.» |
| `off` (rules) or `values` (settings): what replaces it when off, or what each value does | from the fallback of §1.6 |
| `words`: search words and synonyms, Ukrainian, English and Russian | «поле, поля, відступ, отступ, проміжок, margin, padding, широкі, широкие» |

and, from the declarations, never written by hand: its id, module, kind, whether it is core, `needs` and what needs it (from `rules.js`, the reverse computed), the decisions (D-2) as id and date (a summary of each would repeat `LAYOUT-MODEL.md` §2 in two more languages and drift; the entry's own `what` is the summary), where it is changed (`rules` for a switch, `device`, `app` or `note` for a setting, from D-3), the version it came in, and, for a setting, its values and default.

### 4.2 The data, described once

```js
/** @typedef {'rule'|'setting'|'topic'} RefKind
 *  @typedef {{id:string, kind:RefKind, module:string, core:boolean, needs:string[], neededBy:string[], decisions:string[],
 *             where:('rules'|'device'|'app'|'note')[], since:string, values?:string[], dflt?:string, cites?:string[]}} RefEntry
 *    // built by model.build(decls, settingDecls, topics); cites: a topic's rule ids
 *  @typedef {{name:string, what:string, example:string, off?:string, values?:Record<string,string>, words:string}} RefText
 *    // per entry and language, from locales/ref/<lang>.json under refKey(id) (D-2's mapping, `ref.p_aside`); `name` of a rule from <lang>.json (D-2)
 *  @typedef {{entry:RefEntry, score:number, field:string}} RefHit */
```

### 4.3 Modules (`public/reference/`)

| File | Role | DOM |
|---|---|---|
| `model.js` | `build()`: entries from the declarations, the topics and the texts; `search(query, lang)`: normalize (lower case, the apostrophes ’ ʼ ' to one, ё to е; і, и and ї stay distinct letters), split, match each word by prefix (at least 4 letters in Cyrillic, 3 in Latin, so «gap» counts) against `name`, `words`, `what` in this order of weight, in both languages whatever the interface language (so a Russian question finds the Ukrainian word by its stem: «широкие» and «широкі» share «широк»), ids exactly (`THROUGH`, `p18`); `related(id)`: needs, needed by, the topic it is in | no |
| `topics.js` | The topics: ids, the rule ids each cites, the switches inside | no |
| `view.js` | An entry, a list of hits, the needs chain, the decisions | yes |
| `input.js` | The search field (typing, Enter, arrows over the hits, Esc) | yes |
| `panel.js` | «Довідник» in the settings menu, its panel, links from every row of the «Правила» list («?») and from the assistant's answers to the entry | yes |

`model.js` and `topics.js` import nothing from the page; `view.js` and `panel.js` get the bridge's `getState`, `setRules` and `setSetting` (D-4) as arguments, as the layout's `panel.js` gets the bridge.

### 4.4 In the app

- The settings menu gets «Довідник правил» on both sites (RA1). It opens a panel (a side panel on a computer, the whole screen on a phone, as «Історія» does) with a search field on top and, empty, the topics and then the rules by module.
- An entry shows its texts, then a line «Увімкнено» / «Вимкнено» / «Вимкнено, бо вимкнене … (потрібне для нього)» from `getState()`, a switch for a rule or a choice of values for a changeable setting, its needs and what needs it as links, its decisions («W3 · 29.10.2026»), and «Де змінюється».
- The switch in an entry calls `setRules` or `setSetting`. Turning off a rule others need lists them first, in the in-app `ask()` dialog («Разом із ним вимкнуться: …»), as `resolve` would.
- A rule or setting that is not at its default shows a dot in the list and in the settings menu (§9), and the reference's header has «Повернути все за замовчуванням».
- Offline it works fully: the texts and modules are precached.

## 5. The assistant

### 5.1 Options

| | A. The plain search only | B. A model in the page with the owner's key | C. A model behind our Worker (recommended) | D. A hosted agent (Managed Agents) |
|---|---|---|---|---|
| Understands «сделай поля широкие» | by words only; finds the entry, the owner taps | yes | yes | yes |
| Key | none | in the page, readable by any script on the origin | in the Worker's secrets only | in the Worker |
| Cost | 0 | per use | per use, capped by the Worker | per use plus a hosted sandbox it does not need |
| Work | PR 1 | small, unsafe | Worker route, auth, caps | more moving parts, a session per chat |

A is PR 1 and stays the offline and over-budget answer. B is ruled out by «the API key never in the page». D brings a sandbox and a server-side loop that this task, which only reads a reference and asks to change one value, does not need. **C**: the Worker is a narrow, fixed proxy; the page runs the tool loop, because the tools act on the page's own state.

### 5.2 The Worker (`worker/assistant/`)

`POST /api/assistant` (`assets.run_worker_first` grows to `["/__/*", "/api/*"]`, as the backup plan's B2 also does; the service worker leaves `/api/` alone, BACKUP-PLAN §6.1).

1. **Who.** `Authorization: Bearer {Firebase ID token}`, verified against Google's keys (`aud`, `iss`, `exp`, `sub`; BACKUP-PLAN §4 «Firebase»), `sub` equal to the secret `OWNER_UID` (the uid the Firestore rules allow, 3c). Otherwise 401 or 403. `worker/lib/jwt.js` is shared with backup B2: whichever is built first writes it.
2. **Which build.** The body is `{build, lang, messages}`. `build` must equal the Worker's own build (the `BUILD` constant it is deployed with); otherwise 409, and the page shows «Доступна нова версія · Оновити», which it already has. So the reference the model reads is always the page's.
3. **What it accepts.** `lang` one of the app's languages (`I18N.langs`), which picks the texts file; `messages` checked by `worker/assistant/shape.js`: roles alternate, starting with the user; content blocks only `text`, `thinking`, `tool_use` (one of the three tool names) and `tool_result`; no `cache_control`, no image, no document; at most 40 messages and 64 KB. Anything else is 400. Nothing else of the body is read.
4. **Caps** (§5.6), checked and charged in one step.
5. **The request it makes**, all fixed in the Worker:
   - `model`: the variable `ASSISTANT_MODEL`, `claude-sonnet-5-5` (RA3); a change of model is a variable, not code.
   - `system`: the instructions (§5.3), the site (the variable `SITE`, `dev` or `app`), and the reference of this build: the declarations and the topics imported by `worker/assistant/prompt.js` from `public/layout/rules.js`, `public/layout/settings.js` and `public/reference/topics.js` (Wrangler bundles them at deploy, so they are the deployed build's; the app has no build step that could make a JSON of them), and the texts of `lang` and English read from `env.ASSETS` (`/locales/ref/<lang>.json`, and `/locales/<lang>.json` for the rule names). The text is made by one pure function, the same the page's tests use, deterministic byte for byte, with `cache_control` on it; a second `cache_control` breakpoint on the last message caches the conversation so far for the next round.
   - `tools`: the three of §5.4, each `strict: true`, their `id` enums made from the declarations; `tool_choice` auto (Sonnet 5.5 refuses forced tool choice).
   - `thinking` adaptive, `output_config.effort` `low` (a chat with one or two tool calls; raised only if the eval of §6.4 shows it misses), `max_tokens` 4000, no streaming in the first version (answers are short; the page shows «Думаю…»).
   - The server-side fallback on a refusal (`fallbacks: "default"` with its beta header), and a `refusal` stop reason answered as «Не можу відповісти на це» rather than an empty bubble. PR 2 checks that the blocks of a fallback model's answer are accepted when passed back to Sonnet on the next turn (the API drops blocks the model cannot read, unbilled).
   - No uid, no e-mail, no device name, no note.
6. **The answer** goes back as it came (`content`, `stop_reason`, `usage`, `model`). Its cost, priced by the `model` of the answer from the per-model table `ASSIST_PRICES`, is charged before the answer is returned, so a client that went away is charged too.

Secrets and bindings, set by the owner in both Workers (`baobook`, `baobook-prod`): `ANTHROPIC_API_KEY` and `OWNER_UID`; the counter of §5.6; the variables `SITE`, `ASSISTANT_MODEL`, `ASSIST_MONTH_USD` (20), `ASSIST_DAY_REQ` (300), `ASSIST_PRICES` (input, output, cache write and cache read per million tokens per model, from the price list). In `wrangler.jsonc`, `vars` and bindings are not inherited by `env.prod`, so PR 2 declares them in both. **Branch previews** (`"previews": {}`) run unreviewed branch code: they get no `ANTHROPIC_API_KEY`, and the route answers 503 there.

### 5.3 What the model is told

The instructions, in English, fixed in `worker/assistant/prompt.js` and covered by a test that they contain no note data placeholder:

- It is Baobook's rules assistant; it answers about the layout only from the reference below and says plainly when the reference has nothing, naming the nearest entries (Q-2).
- It answers in the language of the question (the owner writes Russian; the interface is Ukrainian or English), short, and names rules and settings as the app shows them, with the id in brackets, so the owner can find them in «Довідник». Plain text with at most the markup of §5.5; no HTML, no links but to entry ids.
- To change something it calls `propose_changes`; it never says a change is made before that tool's result says `applied`; it states that a change applies to this device and re-lays the open note. What moves under a rule is written with the next action in that container (INV-6); the wide field of P18 is a temporary height and is never written (VIEW.6a); the text placement of P18 acts as a font does.
- When a request is wider than what exists, it says so: «поля широкие у текстовых блоков» — the field of P18 is one setting for every block, not for text blocks only.
- On `.app` it warns before turning off `GAP.2`, `GAP.5.2` or `GAP.5.3` that gaps lost while they are off do not come back (D-1, §9), and suggests trying on `.dev` first.
- The state it was given may be old: before proposing, it calls `get_state` once in that question.

### 5.4 The tools, and what the page does with them

| Tool | Input | What the page does | Result |
|---|---|---|---|
| `get_state` | none | `getState()` (D-4) | the rules asked for and in effect with the reason a rule is off, the settings' values, the site, whether a note is open and whether it is read-only |
| `open_entry` | `{id}` | opens that entry in «Довідник» beside the chat, for the owner to read | `{shown:true}` or `{error:'unknown id'}` |
| `propose_changes` | `{changes:[{kind:'rule'|'setting', id, value, scope:'device'|'app'|'note'}], why}` | validates each change against the declarations (the id exists, the value is one of the setting's values, the setting is changeable and `assistant` is not false, the scope is the setting's own, `note` only with a note open and editable); computes what else `resolve` turns off; shows a card and **waits for the owner** | `{applied:{before, after}}`, `{declined:true}`, `{declined:'superseded'}` or `{error}` |

The whole reference is in the system prompt (some 20–25 thousand tokens in two languages), so there is no search tool: one fewer round per question. If the reference outgrows about 60 thousand tokens, a `search_reference` tool over `model.search` replaces the full text (§8).

**The card** shows each change as «Поля навколо блоків: вузькі → широкі (на цьому пристрої)», what else goes off with it, and two buttons, «Застосувати» and «Не треба». The `propose_changes` call stays open until the owner chooses; then its `tool_result` is sent and the model ends the turn with a line, so the decision reaches it as a tool result and costs no extra round. «Застосувати» calls `setRules` / `setSetting` once for the whole card, so it is one step; the card turns into «Застосовано · Повернути». A new message typed while a card waits answers it `{declined:'superseded'}`, ahead of the new text. Only the latest card is live.

**«Повернути»** puts back the asked-for rules and the settings of the card's «before» (D-4), so a rule that went off only because of a cascade comes back on by itself. It applies at once only while the current asked-for values still equal the card's «after»; otherwise it asks first, listing what changed since. It restores the settings, not the layout: what a user action wrote in between under the changed rules stays written (INV-6), and the card says so after such an action. A change the model has not seen (a «Повернути», a tap in «Довідник», another tab) is told to it as a short text block at the start of the next user message («State changed since: P18.field wide → narrow»), so the history stays append-only.

**A note's own settings** (RA5, when 0.2 has them): `scope:'note'` changes go through the same function as the note's menu, and their undo here is the card's «Повернути». Whether such a change is also a Ctrl+Z step of the note is not settled: V2 says it is a user action with its undo, VIEW.6a (which wins) says it is a re-measure with no undo entry; this plan follows what 0.2 decides. Never on a read-only note (trash, a version, the storage lock).

### 5.5 Modules (`public/assistant/`)

| File | Role | DOM |
|---|---|---|
| `model.js` | The conversation (`{role, content}[]`, content kept exactly as the API returned it, never edited or trimmed); the rules of the loop below; the validation of a proposal against the declarations; the state-change text | no |
| `ops.js` | One question: send to the Worker, run tools until the model ends its turn, apply and undo a card through the setter, errors to states | no (the transport and the setter are passed in) |
| `view.js` | The messages, the card, the states (offline, signed out, over budget, a newer build, an error, a full conversation) | yes |
| `input.js` | The message field (Enter sends, Shift+Enter a line), Esc closes | yes |
| `panel.js` | «Помічник» in the settings menu and as a button in «Довідник»'s header; the panel | yes |

**The loop's rules** (`model.js`, each with a Node test):

- Every `tool_use` of an answer gets its `tool_result` in the one next user message, in the same order; several in one answer (parallel calls) are answered together, `propose_changes` last, when the owner has chosen.
- At most 4 rounds a question. At the cap the open `tool_use`s are answered with `is_error: true` («round limit») and the question ends; the history never ends on an unanswered `tool_use`.
- An error, 409 or 429 in the middle of a loop leaves the last request unsent; the next send repeats it as it was, or, if the owner starts a new conversation, it is dropped with the conversation.
- The history is never trimmed or edited (thinking blocks are bound to it). At 40 messages or 64 KB the panel says the conversation is full and offers «Нова розмова».

**Rendering.** The model's text is shown with `textContent`, through a small hand-written renderer for paragraphs, lists and `code`, with no raw HTML; a link is made only from an entry id that exists (`[[THROUGH]]` → the entry). The card's `why` is plain text.

The transport (`fetch('/api/assistant')` with the ID token from the account module) is passed to `ops.js` by `panel.js`, so `ops.js` runs in Node with a stub. The conversation lives in the tab's memory only: never in IndexedDB, `localStorage` or sync; closing the panel keeps it until the tab closes; «Нова розмова» clears it.

### 5.6 Cost and limits

The prices of RA3 (Claude Sonnet 5.5: $2 input, $10 output, $0.20 cache reads a million tokens; a cache write at 1.25× input, for five minutes). A question of two rounds with a 22-thousand-token prefix: the first in five minutes writes the cache, ≈ 22k × $2.5/M ≈ $0.055, plus the history, the output and the thinking (billed as output) ≈ $0.01, so about $0.06–0.07; a following one ≈ 2 × 22k × $0.20/M + the history mostly from the second breakpoint + 1–2k output ≈ $0.02. Sporadic questions pay the cache write every time. **$20 is roughly 300–1000 questions a month**, enough for the owner.

- **The counter**: one Durable Object (SQLite-backed, on the Workers Free plan; PR 2 confirms) defined in `baobook-prod` and bound by `baobook` through `script_name`, so both share it, holding the month's dollars and the day's requests; a request calls it once to check and reserve, and once to charge the real cost, atomically, so the cap holds exactly. At `ASSIST_MONTH_USD` the Worker answers 429 `budget` until the next month, and the panel says «Ліміт помічника на цей місяць вичерпано; довідник працює». KV is not used: it is not atomic, its reads can be a minute stale, and its 1 000 free writes a day are shared with backup B2.
- At most `ASSIST_DAY_REQ` requests a day (in the same object) and 30 a minute (the Workers rate-limiting binding), against a loop that never ends.
- The backstop is a monthly spend limit the owner sets for the key's workspace in the Anthropic Console, at $20 too.
- The panel shows the month's spend («Цього місяця: $1.20 із $20»), from the Worker's answers.

### 5.7 Offline, errors, languages

- Offline (or `/api/assistant` unreachable): the panel says «Немає з'єднання. Довідник працює без мережі» with the search field, which runs `model.search` on what was typed.
- Signed out: «Увійдіть, щоб говорити з помічником»; not the owner: the button is not shown (the Worker refuses anyway).
- Errors: 409 the build strip; 429 the budget or the rate; 5xx and timeouts «Помічник зараз не відповідає»; the message stays in the field to send again.
- Every string of the panel and the card is in `uk.json` and `en.json`; the reference texts in `locales/ref/<lang>.json` (Q-1). The model's own words are its answer, in the language the owner wrote in.

## 6. Tests

### 6.1 Node, fast, in CI

- **`tests/refmodel.mjs`** (the drift test; every count in it comes from `rules.js` and `settings.js`, none from prose): every `RuleDecl` and every `SettingDecl` not marked `internal` has an entry, and every entry has one; every entry and topic has every text in `locales/ref/uk.json` and `locales/ref/en.json`, every rule its name in both `<lang>.json` under `ruleKey(id)` and no second name in the reference files, and no `ref.*` key is left without an entry; `ruleKey` is one-to-one over the ids; `needs` and `neededBy` agree with `rules.js` and `resolve`; every decision cited exists in the table of `LAYOUT-MODEL.md` §2; every rule id a topic cites exists in `LAYOUT-RULES.md` (its rule ids, the §1.6 table and the core list), and every switch is in some topic; a setting's values in the texts are exactly its declared values; the `Settings` defaults object has exactly the ids of the `SettingDecl`s it covers, and the `sheet:settings` keys the declarations name are the keys the bridge reads; the tools' `id` enums equal the declarations; the system text built twice from the same build is byte for byte the same (so the cache hits). Search: a table of queries in three languages and the entry each must find first («широкі поля», «поля широкие», «прилипає до колонки» → `DRAG.A2`, «тримаю і він проскакує» → `THROUGH`, «відступи» → the gaps topic and `P18`).
- **`tests/assistantmodel.mjs`**: a proposal with an unknown id, a value not declared, a constant, `scope:'note'` with no note or a read-only one is refused; one with a needed rule lists what goes off as `resolve` does; apply then «Повернути» gives back the values before; a cascade (`SIZE.1` off, which takes `SIZE.2`, `SIZE.8` and others with it, then «Повернути» brings them all back as asked); «Повернути» after another change in between asks first; the loop's rules of §5.5: parallel tool calls answered together and in order, `propose_changes` held until the choice, a superseded card, the round cap, an error in mid-loop and then a new question, the state-change text; each request's history is the previous one with messages appended, never changed.
- **`tests/workerassist.mjs`** (beside `tests/worker.mjs`, `fetch` replaced): no token 401, a token of another uid 403, an expired one 401; another build 409; over the month or the day 429; the upstream request has the fixed model, tools, system with `cache_control`, no field taken from the page but `messages`, and no uid; the counter adds the cost from `usage`; an upstream 5xx comes back as 502 and adds nothing; `/__/auth/*` and the other `/__/` 404 unchanged.

### 6.2 Browser (Playwright)

- **`tests/appref.mjs`**: «Довідник» opens on `.dev` and `.app` settings; search finds and opens an entry; the switch in an entry changes the same setting the «Правила» list shows, with the same greyed rules; turning off a needed rule asks first; the dot on non-defaults and «Повернути все»; offline (the service worker's precache) it opens and searches.
- **`tests/appassistant.mjs`**, with `/api/assistant` answered by a scripted stub (no model in CI): a question, a `get_state` round, a card, «Застосувати» changes the setting and re-opens the note, «Повернути» brings it back, «Не треба» changes nothing; offline, signed out, 409, 429 states; nothing of a note's text appears in any request body (the test types a marker into a note and looks for it); a stubbed answer with `<img src=x onerror>` and a `javascript:` link runs nothing; a card waiting while the owner types a new message is sent as superseded; another tab changing a rule re-opens this tab's note.

### 6.3 Checks every PR

The build marker, the `SRI` hashes (`node tests/hashes.mjs --write` for the new files), `PRECACHE`, and `tests/appi18n.mjs` (which must not take `locales/ref/` for languages) as `CLAUDE.md` says.

### 6.4 The eval (manual, costs money)

`tests/assistant-eval/` (outside `public/`): about 40 requests in Russian, Ukrainian and English, each with the entry or proposal expected and what must not happen («сделай поля широкие у текстовых блоков» → `propose_changes` P18 field wide, with the remark that it is for every block; «как работают отступы у сокращённых заголовков» → no invented rule; «выключи всё лишнее» → asks which; «удали этот блок» → it cannot touch notes). A script runs them against the real Worker on `.dev`, with the owner's approval each time, and prints the misses: the owner copies a short-lived ID token from the account panel on `.dev` (a «Копіювати токен» line there, `.dev` only), and the script answers `get_state` from a fixed fixture and `propose_changes` with `{declined:true}`, so it changes nothing. A run costs about $1–2 and counts against RA4's $20 and the daily cap. Run before PR 3 merges and whenever the instructions, the model or the reference change much.

## 7. Steps (PRs into `main`, checked on `.dev`)

| PR | What | Needs |
|---|---|---|
| 0 | This plan, through review rounds | — |
| 1 | The reference: `public/reference/`, `locales/ref/<lang>.json` (Q-1), the line in `CLAUDE.md` «Localization», «Довідник» in the settings menu on both sites, «?» from the «Правила» rows, switches in the entries, the marks of §9; `tests/refmodel.mjs`, `tests/appref.mjs` | 0.1 in `main`; D-1 to D-4 |
| 2 | The Worker: `worker/assistant/` (route, prompt, caps, counter), `worker/lib/jwt.js` (or B2's), `wrangler.jsonc` (`/api/*`, the Durable Object, the rate-limiting binding, the variables, in both environments); `tests/workerassist.mjs`. The owner sets the secrets and the Console limit (§11) | PR 1 |
| 3 | The assistant: `public/assistant/`, its strings; `tests/assistantmodel.mjs`, `tests/appassistant.mjs`; the eval run on `.dev` | PR 2 |
| 4 | Live examples (RA6): a small sheet in an entry and in a card, the same engine with the rule on and off, made from a fixed example layout per rule in `public/reference/examples.js`, never a note; tests that every example lays out with the rule on and off and differs | PR 3 |
| later | A note's own settings in the assistant (RA5), when 0.2 has them; variants of a rule (O-20) as setting-like entries | 0.2 |

Each PR goes to `.app` only with a release the owner asks for. The assistant on `.app` needs the secrets in `baobook-prod` too. Before the release that brings switchable rules to `.app` (PR 1, D-1), the owner rehearses on `.dev` with a copy of the `.app` notes: turn off one rule of each kind (`THROUGH`, `GAP.5.2`), work in a note, turn it on again, «Повернути все», and compare what was written, as for a release that changes storage.

## 8. Risks

- **Rules off on `.app` change real notes** (D-1). A rule turned off re-lays every note on that device, and what moves is written with the next action and synced to the other devices, which lay them out by their own rules; with `GAP.2`, `GAP.5.2` or `GAP.5.3` off, gaps lost do not come back when it is on again. Mitigations: §9's marks; the warning in the assistant and in the entry's switch on `.app` for those three; «Повернути все»; the owner tries a rule on `.dev` with a copy first, as for storage changes.
- **The model proposes the wrong thing.** It cannot apply anything: every change is a card the owner confirms, validated against the declarations, applied through the same setter as a tap, with «Повернути». The eval (§6.4) measures how often it picks the right entry.
- **The model invents a rule** (Q-2). The instructions forbid it, the card can only name declared ids, and the eval has such questions.
- **The reference drifts.** It is built from the declarations, and `tests/refmodel.mjs` fails on any gap either way; what it cannot check is whether a text still says the truth after a rule changes its behaviour, so a PR that changes a rule's behaviour updates its texts (a line for the layout plan's PR template).
- **Cost.** Capped in the Worker (an atomic counter, §5.6) and in the Console; a request reserves before it runs, so the cap can be passed only by the difference between a reservation and the real cost of the last request; prices are a variable per model, so a fallback model is priced as itself.
- **Privacy.** What leaves the device: the reference (ours), the owner's messages, the current rules and settings, the site. Nothing of the notes (RA7), checked by the browser test. Anthropic keeps API requests by its usual retention; the owner should not paste note text into the chat, and the panel's first line says so.
- **Model output in the notes' page.** The panel shares the origin with the notes and the Firebase session, so an answer is never HTML: §5.5's renderer, `textContent`, links only to entry ids; a browser test feeds a stubbed answer with `<img onerror>` and a `javascript:` link and checks nothing runs.
- **The key and branch previews.** The key is only a Worker secret of the two production Workers; previews of other branches get none (§5.2).
- **A shared Worker budget.** The Worker serves `/__/auth/*` too; 300 assistant requests a day are well inside 100 000. CPU per request is JSON in and out, inside the free plan's 10 ms, except a cold JWT key fetch (cached).
- **The reference outgrows the prompt.** At 60 thousand tokens or so, a cache write costs more; then the search tool of §5.4 replaces the full text.
- **The two layouts' dependency.** This plan builds on documents of another branch. If D-1 to D-4 come out differently, §4.3, §5.4 and the tests follow them.

## 9. Marks and guards for changed rules

Because the rules now act on `.app` (D-1):

- While any rule or setting of the reference is not at its default, the settings button (the gear) shows a dot, and the settings menu a line «Змінено правил: N · Довідник».
- «Повернути все за замовчуванням» in the reference's header, one `setRules` with every rule on and one `setSetting` per changed setting.
- On `.app`, turning off `GAP.2`, `GAP.5.2` or `GAP.5.3`, from an entry or a card, asks first with the reason (INV-7 b).
- Rules and settings stay device settings: another device keeps its own, and the card and the entry say «на цьому пристрої».

## 10. Not in this stage

- Sending a note's content or layout to the model (RA7).
- The assistant changing anything but rules and settings: no blocks, no notes, no sync, no account.
- Voice, streaming answers, keeping conversations.
- Variants of a rule beyond on and off (O-20) until 0.2 decides them.

## 11. What the owner sets up (PR 2)

1. An Anthropic API key in a workspace of its own («baobook»), with a monthly spend limit of $20.
2. `npx wrangler secret put ANTHROPIC_API_KEY` and `OWNER_UID` for `baobook` and with `--env prod` for `baobook-prod`.
3. Nothing else: the Durable Object and the rate-limiting binding are created by `wrangler deploy` from `wrangler.jsonc` (a migration entry for the object's class); `baobook-prod` is deployed before `baobook` the first time, since `baobook` binds its object.

## Review log

- 2026-11-04: first draft, after the owner's answers RA1–RA8.
- 2026-11-04, independent review round 1 (3 blockers, 9 major, 10 minor; all accepted and fixed the same day):
  - blockers: the Worker had no source for the declarations as JSON (now it imports the modules and Wrangler bundles them, §5.2); `<lang>.ref.json` beside the language files would have been taken for languages by `tests/appi18n.mjs`, and rule ids with `-` break its key pattern (now `locales/ref/<lang>.json` and `ruleKey`, Q-1, D-2); trimming the history broke the append-only conversation thinking blocks need (now never trimmed, «Нова розмова» when full, §5.5);
  - major: the loop's rules for parallel calls, the round cap and errors (§5.5); `propose_changes` held open until the owner chooses, so the decision is its tool result (§5.4); a note setting's Ctrl+Z left to 0.2, since VIEW.6a and V2 disagree (§5.4); asked-for vs in-effect rules in the setter and «Повернути» (D-4, §5.4); KV replaced by an atomic Durable Object counter and the rate-limiting binding (§5.6); safe rendering of model output (§5.5, §8); one name per rule, shared with the «Правила» list (D-2); the full list of layout-plan places D-1 changes, and a rehearsal before the rules reach `.app` (D-1); the drift test's counts from the declarations, topic ids no longer looked up in `LAYOUT-RULES.md`, more checks (§6.1);
  - minor: the cost range (300–1000 questions, a second cache breakpoint, thinking billed as output, §5.6); pricing by the answer's model (§5.2); the Worker validates `lang` and the messages' shape (§5.2); a `SITE` variable and bindings declared in both environments (§5.2, §11); no key in branch previews (§5.2, §8); setting scopes and `assistant: false` for the engine switch and the testing look (D-3, §5.4); other tabs follow a change through the `storage` event (D-4); search normalization (§4.3); the eval's token and fixture (§6.4); no entries for internal constants and no hand-written decision summaries (§4.1); the wide field is never written, said in the prompt (§5.3).
