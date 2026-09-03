# Feature Modes and Toggles

Build from Core upward. Optional capability is disabled unless the request selects it and its dependencies are safe and configured.

## Core

Core includes:

- title, description, category, and sanitized route/page context;
- optional web element metadata;
- server-side tracker issue creation.

Core has no screenshot bytes, media fields, attachment controls, storage code, diagnostics collector, notification email, or media Permissions-Policy changes. Element selection records metadata only. Never inline a screenshot as base64 in the issue body.

## Media capabilities

Each capability can be enabled independently:

| Capability | Client state/UI | Server/storage |
|---|---|---|
| Element screenshot | optional `capture.screenshot` while drafting | validate and upload image, then discard base64/blob |
| Screenshot + annotation | capture/annotator state | image upload |
| Pinpoint | pinpoint state and selector option | image upload |
| Screen recording | recorder, stream, timer, preview URL | video upload |
| Voice note | recorder, stream, timer, preview URL | audio upload |
| Image attachment | allowlisted image picker/drop | image upload |
| Document attachment | allowlisted document picker/drop | type/signature validation and upload |

If storage is absent or its visibility has not been chosen, omit every media control. Do not render controls that fail only after the user has invested effort.

When a capability is omitted, also omit its state, permission request, payload field, cleanup code, server branch, and package dependency. Hidden UI alone is not a feature boundary.

## Diagnostics

Route/page and app version may be included as ordinary context. Browser metadata, DOM, console, and network diagnostics are separate opt-ins and default off. Do not initialize collectors for capabilities that are not enabled.

## Notifications

Resolution notifications require a provider, a verified close-event source, and server-side recipient storage. If any is missing, omit the email field and show no nonfunctional checkbox.

## Responsive behavior

Do not use a single `isMobile` flag as a security or capability check. Use feature detection plus input modality/layout checks:

- `getDisplayMedia` availability determines web screen capture;
- `MediaRecorder` and supported MIME types determine recording;
- `(pointer: coarse)` helps choose touch UI;
- viewport width and safe-area insets shape layout.

Always keep the text path usable when an optional capability is unavailable or denied.
