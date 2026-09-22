# Feedback API Boundary

Implement the route in the host framework (`POST /api/feedback` for a conventional Next.js app). Adapt names and libraries to the project; preserve the invariants below. Read [security-and-privacy.md](security-and-privacy.md) and [storage-strategy.md](storage-strategy.md).

## Server-owned configuration

The client must not choose:

- issue provider, GitHub owner/repository, or Linear team/project/state;
- labels or assignees;
- storage bucket/key/prefix;
- notification recipients or provider;
- whether authorization/rate limiting applies.

Resolve these from trusted server configuration. If required configuration is absent, return `setup_required` without echoing secret names or provider errors to anonymous callers.

## Request contract

Use the project's schema library. Keep Core small and make optional fields explicit:

```typescript
type FeedbackRequest = {
  title?: string;      // optional — see "One required text box"
  description: string; // the required field
  category: 'bug' | 'feature' | 'ui-ux' | 'general';
  page: { name?: string; path: string };
  source?: 'web' | 'app';
  captures?: Array<{
    elementInfo?: string; // bounded, redacted app-authored metadata, not arbitrary DOM text
    position?: { x: number; y: number }; // finite viewport coordinates
    imageDataUri?: string;
    attachmentId?: string;
  }>;
  videoAttachmentId?: string;
  audioAttachmentId?: string;
  attachments?: Array<{ id: string; displayName: string }>;
  diagnostics?: FeedbackDiagnostics;
  notify?: boolean;
  idempotencyKey: string;
};
```

Choose either validated data URIs for small server uploads or attachment IDs for authorized direct uploads. Avoid supporting both unless the platforms genuinely require it. Never accept an arbitrary media URL from the client. Native clients that already uploaded an object send an opaque attachment ID that the server verifies against the configured storage origin, prefix, owner/tenant, size, and state.

Reject unknown categories, sources, attachment fields, and excessive counts/lengths. See the suggested limits in [security-and-privacy.md](security-and-privacy.md).

### One required text box

`description` is the only required text field. Validate that it is present, non-empty after trimming, and within bounds. Accept an absent or empty `title` and derive a bounded one-line title from `description` using a server template. Do not return `invalid_request` for a missing optional summary, and do not enforce a rule the client's own form does not show. See [platform-baselines.md](platform-baselines.md).

## Processing order

1. Reject unsupported method/content type and oversized content length.
2. Authenticate the existing user/session. For intentional anonymous mode, apply durable rate limiting and bot protection.
3. Validate origin/CSRF policy.
4. Parse and validate the closed schema.
5. Check or reserve the idempotency key.
6. Redact and normalize text, path, element metadata, and diagnostics.
7. Validate/claim attachments and upload any accepted small media.
8. Resolve a human-readable page name from a server registry when available.
9. Build the issue title/body from bounded server templates.
10. Create the issue through the chosen provider adapter with server-owned routing and labels.
11. Persist the submission/issue/attachment/notification mapping.
12. Return the public result. Clean up or enqueue cleanup on failure.

Do not upload media or call either tracker before authentication, rate limiting, and validation. Read [issue-providers.md](issue-providers.md). For Linear, [linear.md](linear.md) replaces the GitHub-specific authentication and label instructions below; the request/privacy boundary remains the same.

## Authentication and abuse handling

Require the app's session by default and derive user/tenant identity server-side. A hidden debug button or client environment flag does not secure the API.

For anonymous mode, require a shared durable limiter across instances. Apply per-IP and device/session budgets, stricter media quotas, and the host's bot challenge. Return:

```json
{ "success": false, "code": "rate_limited", "retryAfterSeconds": 60 }
```

Do not store raw IP addresses longer than operationally necessary; hash or truncate according to the host's privacy policy.

## GitHub authentication

Reuse an existing server-only Octokit/GitHub App client. Otherwise use `@octokit/rest` with `@octokit/auth-app` and an installation restricted to the target repository with **Issues: read/write** only.

Accept private key input as an existing server secret or local development path. Never add credentials to browser-exposed environment variables, logs, source control, or mobile bundles. Validate installation IDs as positive integers and fail closed on placeholder owner/repository values.

For a deliberately small single-repository server bridge, a fine-grained token scoped to that repository with Issues write can be used when the user accepts its lifecycle trade-off. Never use a classic PAT.

## Issue rendering

Keep the issue scannable and avoid dumping sensitive diagnostics inline:

```markdown
**Page:** Account settings
**Path:** /settings/account
**Source:** web

## Report
The save button remains disabled after changing the display name.

## Selected element
- Button · Save · 120×40

## Attachments
- Screenshot: [Open secure attachment](reviewer-url)

## Environment
- App version: 2.8.1
- Submitted: 2026-08-31T19:20:00Z

<!-- feedback-submission-id: opaque-id -->
```

Use a server-generated opaque submission ID in the comment. Do not embed email, user ID, storage credentials, or raw diagnostic data.

Title format:

```text
[web] Bug: Save remains disabled — Account settings
```

Clamp the complete title. Escape or normalize line breaks and control characters. Preserve the user's full description in the body within limits.

## Labels

Map category and source through server allowlists:

```typescript
const categoryLabels = {
  bug: ['feedback', 'bug'],
  feature: ['feedback', 'enhancement'],
  'ui-ux': ['feedback', 'ui/ux'],
  general: ['feedback'],
} as const;
```

Add a configured `source:*` label only when the inbox uses multiple surfaces. Verify labels during setup when authorized. If issue creation fails because a label is missing, retry once without labels, log the configuration problem, and do not retry arbitrary validation failures.

## Idempotency

The UI disables duplicate submits, but the server still needs idempotency for network retries. Store `(trusted actor or anonymous bucket, idempotencyKey) -> submission state/issue result` in the project's persistent store with a bounded TTL. Return the original success result for a completed duplicate. Do not use a process-local map on serverless/multi-instance deployments.

Scope the durable key by tenant, actor, and configured destination; bind it to a normalized payload hash. A changed payload under the same key is a conflict. Reserve it atomically so concurrent requests cannot create two issues. A timeout after the provider may have accepted the issue is an uncertain result: retain the reservation and attachments for reconciliation, not a fresh automatic create or destructive cleanup. Do not fail over to another tracker. If the host has no persistent store, document the duplicate risk and keep unattended retries disabled.

## Public success result

Return `{ success: true, submissionId }` by default. Tracker identifiers, workspace/repository names, and issue URLs belong in the server-side receipt. Add a link only when the reporter is authorized to view that destination; a private Linear workspace is not automatically visible to every customer of the app.

## Errors

Use stable public codes:

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Schema/size/type failure |
| 401 | `unauthorized` | Session/token required |
| 403 | `forbidden` | Origin, tenant, or feature policy denied |
| 413 | `payload_too_large` | Body or decoded media limit |
| 429 | `rate_limited` | Submission budget exceeded |
| 503 | `setup_required` | Required server integration unavailable |
| 502/500 | `submission_failed` | Provider/internal failure |

Return a submission/request ID, not a stack trace. Log detailed errors server-side with redacted context.

## Verification

Prefer route tests with mocked storage and issue-provider adapters. Cover invalid auth/origin, unknown keys, size boundaries, malicious filenames, spoofed MIME, arbitrary URLs, secret redaction, duplicate idempotency keys, missing labels, provider failure cleanup, and rate limiting.

Do not create a real issue without the user's approval for a live integration test.
