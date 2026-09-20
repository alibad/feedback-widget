# Feedback Widget website

Website for the [MIT-licensed Feedback Widget skill](https://github.com/alibad/feedback-widget), at https://feedback.humanquest.net. This directory is the canonical website source; ChatGPT Sites remains the production deployment target.

## Local development

Use Node 22.13+ and run `npm ci`, then `npm run dev`. Run `npm run verify` before publishing. Verification runs offline boundary tests with real SQLite and mocked GitHub/storage clients, builds the Worker, checks TypeScript, and audits dependencies. No hosted GitHub Actions are configured.

The hero illustration is illustrative; the persistent **Give feedback** button opens the real full experience: native screenshots, seven annotation tools, one safe element picker, screen recording (60 seconds), audio attachments (10 minutes), and image/audio/video/plain-text attachments. **Tap the mic inside Summary or What happened** to start voice input immediately. Live words appear at the field’s caret or selection; tap Stop, then edit normally. Cancel restores the pre-session text, and Undo is available after completion until you edit that field or start another session. No second transcript form or Insert step. Each dictation session lasts at most two minutes. Browser speech-recognition support varies; unsupported browsers get a keyboard-dictation/type fallback. Annotation is desktop-only; selection works with pointer, touch, or keyboard. Unsupported mobile browsers can attach existing media. Capture and preview work before sign-in; publishing requires Sign in with ChatGPT, explicit consent, and review. Reports go only to the public `alibad/feedback-widget` repository. The skill independently supports GitHub or Linear for other applications.

The widget opens only after an explicit click; query strings (including old `?feedback=open` links) never open it. Sign-in returns to the clean homepage. A compact sign-in notice explains that ChatGPT is the hosting identity provider, not the feedback destination. Privacy/retention details and capture limits are expandable; browser/screen diagnostics, console warnings/errors, and microphone inclusion in screen recordings start enabled after the reporter opens the widget and can be turned off before capture or review. All five capture tools stay visible. There is no duplicate Pinpoint control.

### UI verification before release

- Load `/` and `/?feedback=open`: no dialog should open. Click **Give feedback** to open it.
- Check the Category menu with mouse and keyboard. Escape closes the menu without closing the report. Its portal must stay inside the native dialog's top layer.
- Check the microphone and diagnostic switches, expandable help, and required publication-consent checkbox. No capture, diagnostics, or upload may start automatically.
- Opening the page or feedback form must not request the microphone. With explicit microphone-test permission, tap each field’s mic and check direct live/final text, Stop, Undo, manual edits, permission denial, Cancel, close/minimize, and tab hiding. Cancel restores the original value; overflow preserves the last fitting final words and explains that the remainder was not added. Without recording permission, use mocked speech tests and check non-recording controls only.
- Select ordinary paragraphs, nested icons, images, and form controls without authored labels. Test scrolling, Tab/Shift+Tab/Enter/Escape, and touch. Selection must not activate links or collect element text or field values. Protected regions must stay excluded.
- Fill a synthetic report, minimize/resume, and review without publishing. Verify draft preservation, redaction, and the final private/public distinction. Never create a live test issue without approval.
- Check desktop and 390px mobile layouts for clipping, focus visibility, reachable close/minimize actions, scrolling, and usable capture controls.

## Server setup

Configure these through Sites environment settings:

- `GITHUB_APP_ID` and `GITHUB_APP_INSTALLATION_ID`.
- `GITHUB_APP_PRIVATE_KEY` (secret).
- Random 32+ character `FEEDBACK_HASH_SECRET` (secret).
- `FEEDBACK_REVIEWER_EMAILS` (secret): comma-separated actual ChatGPT sign-in emails of authorized maintainers. Never included in issues.

Register a private GitHub App with Issues read/write only, metadata read, no webhooks, and install on **only** `alibad/feedback-widget`. The server narrows installation tokens to that repository and permission. Do not reuse a personal login token. Production credentials never belong in source or client bundles.

Missing configuration leaves publishing explicitly blocked; capture/preview remain available. Hosted authentication depends on Sites dispatch stripping/replacing identity headers. Never expose this Worker through an origin that bypasses that boundary. Local Sites sign-in uses a synthetic identity and is not evidence of production authorization.

## Privacy and abuse controls

- Public issues contain reviewed/redacted title, description, category, canonical homepage context, structural tag/index selection paths, optional safe developer-authored labels, selection coordinates, opaque attachment links, and a submission receipt. Selection targets the exact element, not a labeled ancestor; it excludes feedback controls and regions marked `data-private`, `data-sensitive`, or `data-no-capture`. Open shadow roots and pointer-events-none decoration can be selected; closed shadow roots and frame internals stay behind the browser boundary (their host box is selectable). Common secrets, email addresses, and mentions are sanitized on both client and server. Redaction is defense in depth, not a guarantee.
- Native screen/microphone capture requires an explicit gesture and browser permission. Microphone inclusion in screen recordings starts enabled, but no capture begins until the reporter explicitly starts screen recording and grants browser permission. No HTML-to-canvas reconstruction, raw DOM, arbitrary element text, cookies, request bodies, credentials, or browsing history is collected.
- Optional viewport/browser-family diagnostics and new console warnings/errors start enabled only after the reporter explicitly opens the widget. They can be turned off before review, and their exact redacted JSON is reviewed before private upload. Network collection and resolution-email notifications are not configured.
- Drafts and media remain in memory; report uploads start only on Publish. **Dictation is separate:** after the reporter explicitly taps a field’s mic, the browser may send microphone audio to its own speech service before publication. This is disclosed before recording. No dictation audio attachment is created; only the resulting field text enters the report. There is no server transcription API or transcript log. Cancel/unmount abort recognition; tab hiding and close/minimize immediately stop recognition, keeping finalized words and discarding interim guesses. Errors and timeouts release the engine. Internal transcripts are bounded at 8,000 characters; fields never exceed their limits. An overlong final result stops dictation and keeps the last fitting final text without silently cutting a word.
- Minimize preserves the draft. Closing or minimizing stops voice input without blocking dismissal. Closing discards captures with confirmation when necessary. Media tracks, timers, and object URLs are released on cancel, completion, and unmount.
- R2 has no public media route. The reporter or an exact server-side maintainer allowlist member must sign in to read a file. Reads fail closed, with no-store, nosniff, and sandbox headers. Public issue links point to an authenticated review page, not direct public objects. There is no sharing URL that bypasses authorization.
- Uploads: 10 MiB per object, 25 MiB and 8 attachments per issue, 100 KB per text file. MIME signatures are allowlisted; SVG, HTML, PDF, arbitrary binary, and executable uploads are rejected. Text files and diagnostics are redacted again server-side. Media may still contain private pixels, speech, or metadata: reporters must inspect it.
- Unclaimed uploads expire after one day. Submitted attachments become inaccessible after seven days. Storage cleanup runs opportunistically on subsequent uploads/submissions, so physical deletion may occur later. Failed deletion retains a durable tombstone for retry.
- D1 stores keyed identity/IP hashes and delivery/media metadata, not raw identity or report text. Submissions are limited to 3/user/hour, 10/IP/hour, 50/site/day, with separate attempt limits. Uploads are limited to 12/user/hour, 24/IP/hour, 50/site/day.
- Idempotency keys are scoped to actor and fixed repository and bound to normalized payload. Atomic reservations prevent duplicate creates. Uncertain provider outcomes stay reserved; the client locks the submitted payload for delivery checks.
- Budget records expire within 48 hours; delivery/hash records expire after 30 days with cleanup on later submissions. Public issues persist on GitHub until edited/deleted. Providers apply their own traffic-log policies.

For uncertain delivery, locate the GitHub issue using the opaque `feedback-submission-id` and reconcile its receipt before allowing a fresh send. No automated provider retries, webhook, email notifications, or background jobs are configured. Ask before creating a live test issue.

## Schema and publishing

Definitions are in `db/schema.ts`. Generate and review new SQL with `npm run db:generate`; never modify applied migrations. Sites applies committed migrations before deployment. Reuse `.openai/hosting.json`, including logical D1 `DB` and private R2 `MEDIA` bindings; Sites owns the physical resources.

Commit and push validated source, package `dist/server/index.js`, `dist/client`, and migrations with the Sites packaging helper, save the exact version, then deploy to the approved public audience. Never package local environment files or credentials.

The site uses Vinext, React, and shadcn/Base UI primitives, including Button, Tabs, Select, Checkbox, Switch, Input, and Textarea. Global resets belong in the base CSS layer so they cannot override component borders and checked states. Preserve `public/og.png`; canonical and social-preview links use the custom domain. The website is versioned under `website/` in the public skill repository while remaining independently built and deployed.
