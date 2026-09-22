---
name: add-feedback-widget
description: Add or improve an in-app feedback and bug-reporting flow that files actionable GitHub or Linear issues. Use for feedback buttons, visual bug reports, screenshots or recordings, diagnostic context, mobile feedback flows, and issue-resolution notifications in Next.js/React, React Native/Expo, or Flutter apps.
metadata:
  author: alibad
  version: 14.0.0
---

# Add an In-App Feedback Widget

Build a feedback flow that fits the host app, captures only the context the reporter knowingly includes, and creates useful issues in the user's chosen tracker without exposing credentials or sensitive data.

## Non-negotiable outcomes

- The basic text-reporting path works without cloud storage or media permissions.
- GitHub and Linear credentials stay server-side. Mobile and browser bundles never contain a token or private key.
- Media, diagnostics, HTML, identity, and notification email are opt-in capabilities, not silent defaults.
- Speech transcription is a text-entry aid, not an implicit voice attachment: preserve typed text, show interim words, disclose browser/vendor processing, and send only reviewed text unless the reporter separately adds a voice note.
- A composer never requires two text boxes. When it offers both a summary and a description, exactly one of them is required, and the markup, the helper copy, and the server agree on which.
- Every text box in a composer carries a small inline dictation mic, on web and on native mobile alike. It fills the field; it never attaches audio.
- A web build in demo mode shows the feedback trigger unconditionally and opens no composer by itself.
- Public or anonymous submission is treated as an abuse-sensitive API, not as an unprotected form endpoint.
- The implementation reuses the app's auth, design system, storage, notification, localization, and observability patterns.
- No live issue, label, webhook, secret, deployment, or hosted workflow is created without authorization for that external change.

Read [security-and-privacy.md](references/security-and-privacy.md) before implementing any backend, upload, diagnostics, or notification path.

## 1. Route by platform

Detect the platform before designing the flow:

- **Next.js/React web:** continue with this file. Read only the references for the selected features.
- **React Native/Expo:** read [react-native.md](references/react-native.md). There is no DOM or `getDisplayMedia`; use a server-side bridge.
- **Flutter:** read [flutter.md](references/flutter.md). Use `RepaintBoundary` for in-process capture and a server-side bridge.
- **Mixed monorepo:** implement each surface separately. They may share the same private issue inbox and backend contract, but not platform UI code.

## 2. Inspect the host before changing it

Determine:

- package manager, framework/router, import conventions, state management, and test commands;
- UI primitives, theme tokens, toast/dialog patterns, i18n and RTL behavior;
- authenticated user/session model and whether anonymous feedback is actually intended;
- selected issue tracker, existing server client, and exact repository or Linear team/project target;
- existing object storage, its access model, retention rules, and reviewer access path;
- existing feedback UI, floating controls, logging, notification provider, and rate limiter;
- server/body-size limits, deployment environment, and platform permission configuration.

Reuse existing infrastructure. Do not replace a storage provider, auth model, state library, or design system solely for this widget. Preserve unrelated feedback entry points unless the user asked to replace them; if two triggers would be confusing, consolidate only the overlapping UI.

Read [issue-providers.md](references/issue-providers.md) to select and configure one destination. Honor an explicit GitHub or Linear choice. Existing server configuration may identify a destination; a git remote alone does not authorize sending customer reports there. If the destination or its visibility cannot be confirmed, leave a setup-blocked state. Never infer a Linear workspace from the author's account, copy identifiers from another app, or dual-write/fall back to a different tracker without approval.

## 3. Choose the smallest feature set that satisfies the request

Use one of these modes as the baseline:

### Core — default when the request is general

- title, description, category, page/route context;
- optional DOM element metadata on web, without a screenshot;
- server-side issue creation in GitHub or Linear;
- no cloud storage, microphone, screen capture, attachments, raw HTML, console logs, or network logs.

### Media

Add only the media the user requested and the host can store safely:

- screenshots and annotation;
- pinpoint capture;
- screen recording;
- voice notes;
- allowlisted attachments.

Media mode requires an explicit storage access choice. Prefer private storage plus an authenticated reviewer route. Public object URLs are an explicit trade-off, never an inferred default. Read [storage-strategy.md](references/storage-strategy.md).

### Diagnostics

Add only when debugging context is valuable and the app owner accepts the privacy implications. Route, app version, and a sanitized URL are ordinary context; console history, network history, DOM snapshots, user identity, and device details are sensitive diagnostics. They start off and require clear per-submission disclosure. Read [diagnostics.md](references/diagnostics.md).

### Resolution notifications

Add only when requested and when the app has a notification provider plus a safe server-side mapping from provider and issue ID to recipient. Never put an email address in a tracker issue body or HTML comment. Read [issue-closed-notify.md](references/issue-closed-notify.md).

### Shipping product surfaces

Core is the floor for a bare install, a setup-blocked host, or an explicit text-only request. A surface that is a shipping product's own feedback widget has a higher floor, and it differs by platform: web gets the full capture set, native mobile gets a deliberately smaller touch-shaped set. Read [platform-baselines.md](references/platform-baselines.md) and implement the matching baseline in full, or name the items left out and why.

That reference also carries the two composer rules that hold on every platform: only one text box is ever required, and every text box carries an inline dictation mic.

Do not force a feature-selection interview when the user already specified the scope. When the request is ambiguous, implement Core and report which optional capabilities remain available.

## 4. Implement the shared model and UI

For web, use a client-side store consistent with the project. [captures-model.md](references/captures-model.md) defines the unified `captures[]` model.

Required state behavior:

- `close()` and `reset()` stop active media tracks, clear timers, and revoke object URLs.
- `minimize()` preserves the draft; `restore()` sets `isMinimized: false` and `isOpen: true`.
- transient blobs, captures, recording state, raw diagnostics, and notification email are never persisted to local storage.
- persisted preferences are allowlisted and non-sensitive.
- submissions disable duplicate sends and preserve the draft on retryable failure.

Build with the host design system and tokens. Support keyboard navigation, visible focus, Escape behavior, status announcements, 44px touch targets, reduced motion, and correct RTL positioning. Do not add a new UI framework merely for the widget.

Use mature host primitives for form controls instead of leaving prominent feedback UI at browser-default quality. If the host uses shadcn/ui, or the user explicitly requests it, use source-owned shadcn components such as `Select`, `Dialog`, `Textarea`, and `Button` with the host tokens. In particular, use shadcn `Select` for category and area pickers rather than styling a raw `<select>` to imitate it. Preserve labels through `aria-labelledby`/`Label`, render popup content in the provided portal, keep the menu above the dialog overlay, and verify keyboard selection, focus return, checked indicators, long labels, and the one-column mobile layout. If shadcn is absent and was not requested, reuse the existing design system rather than importing a framework solely for this widget.

For optional components, read the matching reference before implementation:

- DOM selection: [element-select.md](references/element-select.md)
- screenshots: [screenshot-capture.md](references/screenshot-capture.md) and [screenshot-visibility.md](references/screenshot-visibility.md)
- annotation: [annotator.md](references/annotator.md)
- pinpoint: [pinpoint-mode.md](references/pinpoint-mode.md)
- video: [video-recording.md](references/video-recording.md)
- voice: [voice-notes.md](references/voice-notes.md)
- speech-to-text transcription: [speech-dictation.md](references/speech-dictation.md)
- feature removal: [feature-toggles.md](references/feature-toggles.md)
- settings and pre-submit disclosure: [settings-popover.md](references/settings-popover.md)
- confirmations: [destructive-action-confirmations.md](references/destructive-action-confirmations.md)
- responsive web UI: [mobile-experience.md](references/mobile-experience.md)
- platform capability baselines, required fields, and mic placement: [platform-baselines.md](references/platform-baselines.md)
- showcase/demo builds: [demo-mode.md](references/demo-mode.md)

Flutter-only optional shortcuts:

- screenshot signal: [screenshot-gesture-trigger.md](references/screenshot-gesture-trigger.md)

The screenshot signal is an opt-in shortcut, not universal consent. It may react only after the feature has been enabled and disclosed; it uses the OS signal, never reads the system screenshot file, and asks before capturing the app's own view.

## 5. Implement the backend boundary

Read [api-route.md](references/api-route.md) and apply these invariants:

- Authenticate by default and derive user identity server-side. If anonymous reporting is explicitly required, use durable rate limiting and the host's bot/abuse protection.
- Enforce origin/CSRF protections appropriate to the auth mechanism.
- Validate a closed request schema, enum values, counts, character lengths, decoded byte sizes, and total request size before doing expensive work.
- Keep provider, owner/repository or Linear team/project/state, labels, storage keys, and notification routing server-controlled.
- Accept media URLs from mobile only from configured storage origins and prefixes; never fetch arbitrary client URLs.
- Redact sensitive data again on the server. Client-side redaction is UX, not a security boundary.
- Use idempotency where retries can create duplicate issues.
- Return stable public error codes such as `invalid_request`, `rate_limited`, `setup_required`, and `submission_failed`; log detailed provider errors only on the server.

Reuse the project's existing server client. For GitHub, use a GitHub App installation limited to the target repository with **Issues: read/write**, or an explicitly accepted fine-grained repo-scoped token for a small server bridge; never use a classic PAT. For Linear, read [linear.md](references/linear.md) for scoped authentication, team/project validation, issue creation, and optional signed webhooks. A coding assistant's Linear connector is not the deployed app's backend credential.

## 6. Configure media and browser permissions narrowly

- Core mode changes no media permissions or security headers.
- `getDisplayMedia()` is controlled by the `display-capture` Permissions-Policy directive, not `camera`.
- `getUserMedia({audio:true})` requires `microphone`; camera permission is needed only for an actual camera feature.
- Omitted `display-capture` and `microphone` directives already default to `self` in supporting browsers. Modify an existing restrictive policy only when a selected feature is blocked, and preserve every unrelated directive.
- Request screen or microphone access only from a direct user gesture. Denial or lack of support leaves text feedback fully usable.
- For a screen recording, capture the shared surface's audio (`getDisplayMedia({video:true, audio:true})`) and default the reporter's **microphone ON**, so they can narrate the bug. Disclose it in copy that is visible without opening a menu, keep a one-click off, and fall back to a silent recording if the mic is denied. Default it OFF only for regulated or minor-facing products.

Read [permissions-policy.md](references/permissions-policy.md) before modifying headers.

## 7. Wire it into the intended surfaces

Mount the widget once per relevant app shell or role layout. Check nested layouts and avoid duplicate mounts. Position the trigger relative to existing floating controls, but prefer a configurable slot/offset or host-provided trigger over selectors tied to a specific third-party button.

If the host already exposes a feedback command or toolbar item, connect it to the shared store and hide the floating trigger through an explicit prop or store field. Do not remove unrelated support/contact channels.

Use the app's localization system when present. Otherwise keep copy centralized in a small translation object; preserve stable API category values while localizing labels. Mirror fixed positioning for RTL.

## 8. Verify before calling it complete

Run the repository's existing local checks. Add focused tests where the project already has a test setup, especially for:

- request validation, authorization, rate limiting, redaction, and storage-origin validation;
- Core mode omitting every media and diagnostic field;
- cleanup of streams, timers, object URLs, temporary markers, and failed uploads;
- duplicate-submit prevention and idempotency;
- keyboard, focus, mobile sizing, RTL, and permission-denial fallbacks;
- transcription prefix preservation, interim/final result handling, manual stop, unexpected end, unsupported-browser and denied-permission fallbacks, and separation from voice-note attachments;
- private/public storage behavior chosen by the user.

Do not create a live issue as an implicit test. Prefer a mocked provider client or dry-run adapter. Ask before a live end-to-end submission, label it clearly as a test, and report the created issue URL only to authorized reviewers.

Verify configuration presence without printing secret values. If credentials or storage are missing, ship a concise setup-blocked state and document the missing names; do not claim the integration works.

Review [common-pitfalls.md](references/common-pitfalls.md) after implementation and use [troubleshooting.md](references/troubleshooting.md) only for observed failures.

## Completion report

Tell the user:

- which mode and optional capabilities were implemented;
- who can submit and what abuse controls protect the endpoint;
- exactly what data can be captured, its defaults, storage visibility, and retention;
- which tracker/destination was chosen and whether tracker/storage/notifications are configured or setup-blocked;
- which local checks passed and whether any live external test was performed.
