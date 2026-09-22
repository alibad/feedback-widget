# Platform Baselines

[feature-toggles.md](feature-toggles.md) builds upward from Core, one capability
at a time. That is the right shape for a first install into an unknown host. It
is the wrong shape for a product surface that is already shipping: there,
"smallest set that satisfies the request" quietly leaves a web widget with no
way to attach a file and a mobile widget with a toolbar the reporter cannot see
past.

These baselines are the floor for a **product** feedback surface. Core remains
the floor for a bare install, a setup-blocked host, or an explicit text-only
request. When a surface is a shipping product's own widget, implement its
baseline in full or state which items are missing and why.

The two baselines are deliberately different. Web is a desktop-first canvas with
a pointer, a clipboard, and screen-capture APIs. Native mobile is a small touch
screen where every extra control covers the bug being reported.

## Web baseline

A shipping web feedback surface offers all of:

| Item | Reference |
|---|---|
| Element select, cleanly | [element-select.md](element-select.md) |
| Screenshot capture | [screenshot-capture.md](screenshot-capture.md) |
| Paste an image from the clipboard, then annotate it | [annotator.md](annotator.md) |
| A drop zone / picker for images **and** documents | [captures-model.md](captures-model.md) |
| Screen recording | [video-recording.md](video-recording.md) |
| Voice note | [voice-notes.md](voice-notes.md) |

"Cleanly" is load-bearing on element select. A picker that dims the page, tracks
one element under the cursor, and exits on Escape is the feature. A row of
persistent overlay chrome that the reporter has to dismiss is not.

Paste and annotate are one path, not two features: an image arriving on the
clipboard lands in `captures[]` and opens the same annotator a screenshot does.
A paste handler that attaches a raw image with no way to mark it up is half the
feature.

Media items still require a storage decision. If storage is absent or its
visibility has not been chosen, the baseline is not "ship the controls anyway" —
it is [storage-strategy.md](storage-strategy.md), then the baseline.

## Native mobile baseline

React Native and Flutter, not a phone-width browser. For responsive web layout
read [mobile-experience.md](mobile-experience.md); it describes the web widget
on a small screen and does not govern a native app.

A shipping native mobile feedback surface offers all of:

| Item | Shape |
|---|---|
| Screenshot | in-process capture of the app's own view, no OS photo permission |
| Settings | the reporter can configure how the widget behaves |
| Annotation | a touch editor that does not bury the screenshot in chrome |
| One note box | a single text field, with the dictation mic from rule 2 below |

And deliberately omits:

- **screen recording** — no platform API for it in-process, and a 60-second
  video is not what a phone reporter is trying to send;
- **voice note attachments** — the inline dictation mic already covers "I would
  rather talk than type", and it produces reviewable text instead of an audio
  file somebody has to sit through. Dictation is not a voice note; see rule 2.
- **element select and pinpoint** — no DOM, no hover.

### Settings the reporter controls

A native widget floats over every screen in the app. The reporter needs a way to
change that without uninstalling it. At minimum offer:

- **Show the floating trigger** — on/off, persisted. Long-pressing the trigger
  itself is a good shortcut to the off switch; confirm before hiding, and say in
  the confirmation which routes still work.
- **Open on screenshot** — on/off, persisted, when the app implements
  [screenshot-gesture-trigger.md](screenshot-gesture-trigger.md).
- **Include a screenshot** — on/off, persisted, so a reporter writing about
  something that is not on screen is not forced to attach the screen anyway.

Persist through the app's preference store and restore before the first frame,
so the choice does not flash on and then off at launch. Write through a setter
that updates the in-memory notifier first and persists in the background: a
failed write costs the choice at next launch and must never block the toggle.

Hiding the floating trigger must not disable the other routes in. The trigger is
hidden precisely because it is covering the screen being reported, which is the
moment a menu entry or the screenshot trigger matters most.

### Annotation that fits a phone

The annotator's job is to let somebody circle the thing that is wrong. On a
phone the screenshot is nearly the whole viewport, so every control competes
with the content being marked up.

- Keep the tool set to what a finger can use: pen, arrow, text, rectangle,
  ellipse. Arrow is the sensible default — the gesture is "point at the bug".
- **One toolbar, one row, pinned to a single edge.** Do not stack a tool row, a
  color row, a shape row, and an action row; do not float controls over the
  middle of the image. Fold variants into one compact menu rather than sprouting
  a button each — filled versus outlined shapes belong behind a single control,
  not four.
- Undo, clear, and the color palette are part of that same row. Cancel and
  Submit belong in the app bar or a bottom action pair, not in the tool row.
- Text is an inline field placed at the tap point, never a dialog or prompt.
- Hide the floating trigger for the whole annotating flow, not just the capture
  frame, and make it ignore pointers while hidden. See
  [flutter.md](flutter.md).

If the toolbar cannot fit one row at the narrowest supported width, remove
tools. Do not wrap it into a second row over the screenshot.

## Rule 1 — one required text box, never two

A composer with a Summary field and a Description field must require **one** of
them, not both. Two required boxes asks the reporter to say the same thing twice
and abandons the report when they will not.

- Require the box that carries the report — the description or note. A
  single-box composer requires that box. A Summary + Description composer
  requires the description and leaves the summary optional.
- Derive the absent summary server-side from the required text, bounded, rather
  than rejecting the submission. A title can be derived from a description; a
  description cannot be derived from a title, which is why the default
  requirement sits on the description.
- A composer that already requires exactly one field satisfies this rule even if
  the field it requires is the summary. Do not flip a working one-field
  composer; the defect this rule exists to catch is requiring two.
- Enforce it in one place. An HTML `required` attribute on both fields is the
  common form of this bug: the markup says both, the helper copy says "your note
  is required", and the two disagree.
- Never let helper text, the review step, and the field attributes describe
  different rules.
- The server applies the same rule: validate that the required field is present
  and within bounds, and accept an absent optional one. See
  [api-route.md](api-route.md).
- When the optional field is empty, derive the issue title server-side from the
  required text rather than rejecting the submission.

This is a reversal. Earlier versions of this skill left field requirements to the
host's form conventions, and the reference implementation marked both `Summary`
and `What happened?` as `required`. Requiring both is now a defect to fix, not a
style choice.

## Rule 2 — every text box gets a small dictation mic

Any text box in a feedback composer — web or native mobile, summary or
description or note — carries an inline microphone that dictates into that
field. Read [speech-dictation.md](speech-dictation.md) for the behavior
contract; this rule is about where the control lives and how big it is.

- The mic sits **inside the field**, as a suffix/adornment, bound to that field.
  A composer with two text boxes has two mics, each writing to its own field.
- Keep it small: a 14–16px glyph inside roughly a 30–32px surface, with a 44px
  or larger tap target around it. The listening state replaces the glyph with a
  stop square of the same size. Neither state may take over the field.
- Dictation fills the text box. It is not an attachment. Audio is not retained
  and no separate transcript field is sent.
- On native mobile this mic is the only microphone feature. There is no voice
  note. On web, dictation and voice notes are separate labelled actions and only
  one may hold the microphone at a time.
- Reuse the app's existing speech engine where it has one. Adding a speech
  dependency and native permission strings is a separate decision — if the host
  has no engine, say so rather than leaving a dead mic in the field.

An unsupported or denied recognizer leaves the mic disabled or absent and the
text box fully usable. Typing is always the guaranteed path.
