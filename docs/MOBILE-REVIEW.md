# Review of the mobile UI/UX of «Чистий аркуш»

Historical document, written in Russian for «Чистий аркуш» in `Yokogamma/mockups/sheet` and translated; the app is now Baobook, `public/index.html`.

Date: 2026-10-03. Subject: [MOBILE-PLAN.md](./MOBILE-PLAN.md), branch `claude/clever-gates-ex73jv`.

## Summary

**The plan should be reworked before implementation.** The direction is good: keep the system text selection, remove competing panels, hide the handles while typing, and ship independent PRs with a desktop regression check. The main gaps: visibility of save errors, a clear entry to block actions, safe deletion, and the full flow of work with the keyboard.

Recommended order: **saving and input → accessible actions and recovery → gestures and refactoring**. Dragging by the header and changing the height in the flow layout must not delay the fixes that affect data and everyday editing.

### What was checked

A static review of the plan and of the matching parts of the source code. Commit checked: [`68fbe9ce205d6e6096b8ad9805db4f3880c964ca`](https://github.com/Yokogamma/mockups/commit/68fbe9ce205d6e6096b8ad9805db4f3880c964ca).

- Plan blob: `769d44f0faaa1941c0bbd5640f38fb5984d8d3d7`.
- `sheet/index.html` blob: `14aa276f64ad69af82a8adac0150b1d3dfb9db6b`.
- The line references below are pinned to this commit.
- The app and the tests were **not run** for this review. The measurements from the plan were not rechecked. Behavior on real devices and full WCAG conformance are not confirmed.
- "Code fact" means an observation in the source; "plan gap" means underspecified future behavior; recommendations need checking during implementation.

Priorities: **P1**: close before the matching mobile scenario is released; **P2**: include in the specification and acceptance; **P3**: an improvement after the main scenario. These are product priorities, not a formal assessment of conformance to the standard.

## What to keep

- The system selection, copy and paste; not suppressing the native menu.
- No resize handles while typing.
- Separate modes for reading, block actions and editing, with predictable transitions.
- Moving secondary actions into «⋯» without hiding the main features.
- PRs that can be checked on their own, and a regression check of the existing desktop behavior.

Basis: [patterns and work with the keyboard](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L25-L47), [selection mode](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L67-L80), [scope limits](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L109-L120).

## 1. P1: the save error is hidden on the phone

**Code fact:** at widths up to 640 px a rule hides the whole `.saved`, the error state included: [index.html:151–153](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L151-L153). On a failed write the message is put into exactly this element: [index.html:612–620](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L612-L620). This is a confirmed static risk of invisible feedback, not the result of a reproduced data loss.

**Change in the plan:**

- Keep a compact status for a successful write, but show the error constantly until a successful recovery.
- Tell apart "saving", "saved on this device" and "could not save". Do not promise sync.
- Provide a retry of the write and an accessible way to save or export the current unsaved data.
- Do not reduce every error to "storage full" when the cause is not established.
- When moving between notes, tie the error to the right note; do not replace it with the success status of another operation.

**Acceptance:** an artificial storage failure is visible at 320–640 CSS px, with and without the keyboard. A retry really saves the latest version. After recovery, a note switch and a reload, the content is checked; until a successful write the interface does not report success.

## 2. P1: the entry to block actions must stay visible

**Plan gap:** selection is turned on by touching the handle, but an open question allows showing the handle only on a block that is already selected. This makes a closed loop: [selection](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L69-L80), [the visibility question](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L116-L120).

**Change in the plan:**

- Keep an accessible «⋯» actions button, or a visible handle with a clear purpose, on every block in reading mode.
- A short tap on text must predictably place the caret; a tap on a separate control opens the block actions. A hold can be a shortcut, but not the only way.
- Remove the automatic deselection after a 40 px scroll: the user may scroll to reach the edge of a long block or its panel. The panel can be repositioned or hidden for a while, keeping the block selected.
- Describe the exit explicitly: «Готово», a tap on another block or on empty space, Esc for a hardware keyboard. Do not require Esc on a phone.
- Resolve the contradiction: item 3.1 removes copying from the mobile formatting panel, while item 3.3 still lists it as a way to copy.

**Acceptance:** a new user who does not know the gestures finds copy and delete; scrolling a long note does not reset the selection unexpectedly; switching to typing hides the frame and the handles at once.

## 3. P1: agree on the real touch targets

**Contradiction in the plan:** the 44 px principle sits next to 56×40 px buttons, 28×28 px handles and a requirement of a 32 px high header: [principle and toolbar](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L29-L41), [header and handle](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L53-L65), [resize](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L71-L74).

**Recommendation:** adopt for this project a target size of **44–48 CSS px** on both axes for frequent mobile actions. The icon can be smaller; the whole clickable area is what is checked. Targets must not overlap, be clipped by their container or catch the neighbouring text. If everything does not fit, use «⋯» and make the header taller instead of the strict 32 px requirement.

This is a UX design target. [WCAG 2.2, SC 2.5.8, level AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) sets a minimum of 24×24 CSS px with exceptions, sufficient spacing among them. So a 28×28 size does not by itself prove an AA failure.

**Acceptance:** the actual hit areas of all buttons, handles and menu items are measured; neighbouring actions do not fire on a touch at the edge; the header stays usable with a long title and enlarged text.

## 4. P1: describe the full flow of the keyboard and the bottom panels

**Plan gap:** hiding the FAB and the shared anchoring of Undo and formatting to the bottom of the viewport do not yet define how to finish input, create the next block and keep the two panels from colliding: [item 3.1](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L34-L47). The code already positions by `visualViewport` and keeps the selection from being lost on `pointerdown`: [index.html:1019–1026](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L1019-L1026). Having them does not replace a check of the scenario.

**Add a behavior contract:**

1. A visible way to finish editing and close the keyboard.
2. A clear way to the next or a new block when «+» is hidden.
3. Formatting keeps the selection range and applies the command to the expected text; after the command, typing can go on.
4. Undo stays available at the same time as formatting, without covering the buttons, the caret or the last line of text.
5. When the keyboard hides, when moving between editors, on rotation and on a change of browser chrome, the panels are recalculated without jumps and without the FAB appearing by mistake.
6. The safe area is counted once; unsupported features have a working fallback.

`interactive-widget=resizes-content` should be treated as part of the implementation, not as a universal guarantee of behavior in all browsers. The release criterion is the observed behavior on real Android and iOS, in Safari and in the installed PWA, not the presence of a meta parameter.

**Acceptance:** text at the bottom of a long note → selection → formatting → Undo → continue typing → finish → new block. Repeat with the keyboard, without it, and after a rotation. No needed button or line is covered.

## 5. P1: deletion needs reliable recovery

**Code facts:**

- The single undo operation lives 7 seconds; the next one replaces the previous: [index.html:913–919](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L913-L919).
- Opening a note calls `dropUndo()`: [index.html:617–620](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L617-L620).
- Deleting an area deletes its child blocks: [index.html:920–931](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L920-L931).
- The existing menu already explains that the content is deleted too, and makes a snapshot for undo: [index.html:955–965](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L955-L965). This is a useful base to keep.

The plan adds a more accessible delete to the mini panel, but `remove()` itself does not create an Undo. Every new deletion path must provide recovery explicitly.

**Change in the plan:**

- For an area, show "Delete the area and N blocks" separately from "Ungroup".
- Define the recovery of several deletions in a row: an operation stack or another accessible mechanism.
- Pin down the limits: the current note, moving between notes, closing the app. If recovery after closing is not supported, do not promise it; add extra protection for a significant deletion.
- Do not rely only on a short timer and on the snackbar being seen. Do not intercept the native text undo while typing.

**Acceptance:** delete two areas in a row, restore both with their content and order; delete with the keyboard open; check going to another note and back according to the chosen contract; make sure that undoing a structural operation does not erase later text edits.

## 6. P2: dragging must have an alternative

**Plan gap:** moving and resizing are described mostly as gestures: [items 3.2–3.3](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L49-L80).

Add "Move up", "Move down" and "Move into an area / out of an area" with a choice of destination to the block actions. For manual size, provide buttons, presets or entering a value, including a return to the automatic size.

[WCAG 2.2, SC 2.5.7, level AA](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires an alternative to dragging that works with a single pointer without dragging, except for the defined exceptions. Keyboard support alone does not meet this need.

**Acceptance:** the user can do the supported moves and resizes with a sequence of taps; the result matches dragging. For the long flow layout, changing the minimum height of a text block stays **P3** unless it solves a confirmed task; the automatic size matters more than manual adjustment.

## 7. P2: make accessibility part of acceptance

The plan lists gesture checks but does not set a full accessibility contract: [acceptance and the manual check](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L80-L107).

- Check clear accessible names and the state of icons; do not stop at the B/I symbols or a visual color.
- Keep and check the existing `aria-pressed` of formatting: [index.html:1020](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L1020-L1020). Do not treat it as missing.
- Describe the focus order, entering and leaving menus and panels, returning the focus to the trigger, and a visible focus with a hardware keyboard.
- For `role="toolbar"`, align the keyboard behavior with the [WAI-ARIA APG Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/); the role attribute alone does not make the whole pattern.
- Check the interface at a width of 320 CSS px and, separately, with text enlarged to 200%: titles, buttons, menus and messages are not lost.
- Go through the main scenarios with TalkBack and VoiceOver, including reading the save status and undo.
- As an extra improvement, take `prefers-reduced-motion` into account for lifting and scaling the card. Do not declare the absence of this improvement an AA failure by itself.

**Acceptance:** with a screen reader and with an external keyboard, a note can be found, opened, edited and saved, and a block can be safely deleted. The new mini panels do not duplicate the HTML id `bubble`; block actions and formatting have distinct names and states.

## 8. P2: add the main note route

The manual check now starts with creating an area. For a notes app, the path **list → search → open → edit → return** matters no less: [plan:101–107](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/MOBILE-PLAN.md#L101-L107). Search and opening already exist in the code: [index.html:540–554](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L540-L554), [617–620](https://github.com/Yokogamma/mockups/blob/68fbe9ce205d6e6096b8ad9805db4f3880c964ca/sheet/index.html#L617-L620).

Add a scenario with a long list: search by title and text, a clear empty result, opening the found note, changing it and returning to the results without an unexpected reset of the query or the position. Define explicitly what the on-screen "Back" button and the system Back do, including with the keyboard or a menu open.

**Acceptance:** the user returns to where the note was opened from; the last edit is saved or an error is visible; Back does not unexpectedly close the app from an intermediate mode.

## Proposed PR split

| PR | Content | Ready when |
|---|---|---|
| A | Save statuses and recovery; keyboard; FAB; formatting and Undo side by side | The storage failure and the full input cycle are checked, the bottom elements do not overlap |
| B | Touch targets; adaptive headers; visible block actions; safe deletion; basic accessibility and the note route | Everything main is reachable without a hidden gesture, operations in a row can be undone |
| C | Dragging by the header; alternatives to drag; tuning the thresholds; a shared gesture module and refactoring | Gestures do not get in the way of reading or selection, the alternatives are equivalent, the regression passes |

The height in the flow layout and cosmetic animations can move after C. Recount the estimates of the original plan once the states and the test matrix are agreed; hours of CSS alone are not enough to confirm the behavior on devices. Each PR must be checkable on its own. This document is not a permission to merge or publish the app.

### Answers to the open questions

1. **Desktop:** keep the current behavior within the mobile task. Unifying the mini panel is a separate discussion.
2. **250 or 350 ms:** 350 ms can be taken as a testable starting hypothesis. Compare it with 250 ms on real devices by accidental moves while scrolling and by the felt delay. Do not present a specific threshold as a universal standard.
3. **Handle visibility:** before selection there is always a visible entry to the actions. Show the resize handles only in the matching mode, and hide them while typing.

## Overall acceptance checklist

- [ ] Visible save errors, a retry of the write and recovery of the current content are confirmed.
- [ ] Block actions are available without a hold; scrolling does not reset the selection unexpectedly.
- [ ] Non-overlapping hit areas are measured, the header height is agreed.
- [ ] Finishing input and creating the next block are available with the FAB hidden.
- [ ] Formatting keeps the selection; Undo and the keyboard do not cover the controls.
- [ ] Deletions in a row, restoring child blocks and moving between notes are checked.
- [ ] Moving and resizing have an alternative without drag.
- [ ] Search, opening, editing and returning to the results are gone through.
- [ ] 320 CSS px, 200% text, long titles, portrait and landscape are checked.
- [ ] Android Chrome and iPhone Safari on real devices, the installed PWAs, TalkBack and VoiceOver are checked; the device, OS and browser versions are recorded.
- [ ] A hybrid device with touch and a mouse is checked: the decision follows the actual input, not only `hover: none`.
- [ ] The existing regression scenarios and the new checks are run; what passed, what failed and what was not run is recorded separately.
- [ ] Desktop behavior is kept; the documentation and the actual state contract match.

