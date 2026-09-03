# Privacy-Safe Diagnostics

Diagnostics can turn an ordinary bug report into a data leak. Implement them only when requested, keep every sensitive source off by default, and read [security-and-privacy.md](security-and-privacy.md).

## Data classes and defaults

| Data | Default | Safe handling |
|---|---|---|
| Route/page name | On | Server-known label when possible |
| URL | On | Send origin + pathname; strip query and fragment |
| App version/build | On when available | Non-sensitive release identifier |
| Viewport and DPR | Off | Include only after disclosure |
| Browser/OS user agent | Off | Prefer coarse parsed values over the raw string |
| User identity | Off | Derive server-side; never trust client identity |
| Console history | Off | Collect only while enabled; redact and bound |
| Network history | Off | Metadata only; never headers or bodies |
| DOM snapshot | Off | Selected region only; sanitize aggressively |

Full-page raw HTML is not a supported default. It can contain hidden fields, tokens, form values, personalized content, and third-party markup.

## Collection lifecycle

Do not patch `console` or `fetch` merely because the widget is mounted. Start a collector only when diagnostics have been enabled by the app owner and the reporter has opted in for the current reporting session. Stop and clear it when the session ends.

If the product needs pre-failure history, that is an observability product decision: use the app's existing scrubbed logging/telemetry pipeline rather than silently adding a second global recorder.

Collectors must be:

- idempotent (`start()` twice does not double-wrap);
- reversible (`stop()` restores the exact original functions);
- bounded by entry count and total serialized bytes;
- circular-safe and exception-safe;
- excluded from capturing their own feedback requests;
- cleared after submit, cancel, sign-out, or user/tenant change.

## Console capture

Capture only selected levels and convert arguments with a bounded serializer. Never call raw `JSON.stringify()` on arbitrary values without handling cycles, getters, DOM nodes, errors, and oversized objects.

Before storing an entry:

- replace token/JWT/private-key patterns;
- replace email addresses and long identifier-like values unless the app explicitly needs them;
- omit DOM nodes, file/blob contents, and object properties with sensitive key names;
- clamp each message and the complete buffer.

Pass through to the original console method without changing application behavior.

## Network capture

Record at most:

- HTTP method;
- sanitized origin + pathname or a route label;
- status class/status code;
- duration and timestamp.

Never record request/response headers, bodies, cookies, authorization, signed URLs, query strings, fragments, form data, or GraphQL variables. Exclude `/api/feedback`, upload, auth, payment, analytics, and other configured sensitive routes.

Only collect same-origin traffic unless the app owner supplies an explicit host allowlist.

## DOM context

Prefer structured element metadata over HTML: tag, stable test ID, accessible name if non-sensitive, dimensions, and an app-defined component/page label.

If selected-region HTML is explicitly enabled:

1. Clone only the chosen element with a strict byte/descendant limit.
2. Remove `script`, `style`, `link`, `meta`, `iframe`, `object`, `embed`, and comments.
3. Remove event-handler attributes, `srcdoc`, inline styles, and unknown attributes.
4. Clear values from `input`, `textarea`, `select`, and contenteditable elements.
5. Remove URL query strings and redact token-like values.
6. Replace any `[data-feedback-private]` subtree with a placeholder.
7. Serialize as text for review; never render the snapshot as executable HTML.

Do not reconstruct elements by parsing the human-readable selector stored in `elementInfo`. Store a stable DOM reference only during the local draft or an explicit sanitized snapshot at selection time.

## Reporter controls

The settings UI should list each diagnostic class with a plain-language description. All sensitive diagnostics start unchecked for each report. Immediately before submission, show exactly which classes are attached and allow removal.

Persist only non-sensitive product preferences if the user explicitly asks to remember them. Never persist captured entries, HTML, email, identity, or media in local storage.

## Payload and issue rendering

Send diagnostics as bounded structured JSON. Redact again and validate on the server. Keep sensitive diagnostics out of the tracker issue body when the destination may be public or broadly visible; store them with the same private access policy and retention as media, then link by opaque attachment ID.

Do not create empty diagnostic objects or files.

Suggested shape:

```typescript
type FeedbackDiagnostics = {
  viewport?: { width: number; height: number; dpr: number };
  client?: { browser?: string; os?: string; appVersion?: string };
  console?: Array<{ level: 'warn' | 'error'; message: string; at: string }>;
  network?: Array<{ method: string; path: string; status?: number; durationMs: number; at: string }>;
  domText?: string;
};
```

Use server policy to decide which fields may enter the issue versus private attachment storage.

## Verification

Test with fixtures containing passwords, bearer tokens, JWTs, emails, cyclic objects, signed URLs, query tokens, form values, and very large messages. Assert the sensitive values do not appear in the client payload, stored object, server logs, or tracker issue.
