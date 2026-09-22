# Settings and Disclosure UI

Use a compact settings panel only for capabilities actually configured. Do not show inert notification or diagnostic controls.

**Scope: the web widget's per-submission disclosure panel.** A native mobile app also owes the reporter a place to change how the widget *behaves* — whether the floating trigger shows at all, whether a screenshot opens it, whether a screenshot is attached. Those are persisted app settings, not per-report payload toggles; see the native mobile baseline in [platform-baselines.md](platform-baselines.md).

## Recommended structure

- **Report contents:** removable chips/rows for screenshot, recording, attachment, and each diagnostic class.
- **Diagnostics:** unchecked switches for browser details, console errors, network metadata, and sanitized selected-element context. Link to a short "what is included" explanation.
- **Resolution notification:** unchecked switch and email field only when the complete provider/event/mapping pipeline exists.

Immediately above Submit, render a one-line summary of the current payload. This matters more than hiding everything behind a gear:

> Includes: description, page name, screenshot, console errors.

## Persistence

Do not persist raw diagnostics, media, notification email, or notification opt-in. Non-sensitive display preferences may be persisted through an allowlisted settings object. If the product offers "remember my email," make it a separate explicit choice and prefer the authenticated account email rather than local storage.

## Interaction and accessibility

- Use the host popover/dialog primitive with focus management and Escape handling.
- On small screens, use a sheet or inline disclosure section rather than a fragile floating panel.
- Every switch has a visible label and description; do not rely on icons alone.
- Changes update the payload summary immediately.

Read [diagnostics.md](diagnostics.md) and [issue-closed-notify.md](issue-closed-notify.md) for the data behavior behind these controls.
