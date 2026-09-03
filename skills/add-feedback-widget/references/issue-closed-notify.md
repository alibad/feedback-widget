# Resolution Notifications

Add this only when the user requested it and the host already has, or explicitly wants to add, a notification provider and server-side recipient store.

## Privacy invariant

Never put a reporter email in a GitHub or Linear issue body, visible field, label, title, or hidden HTML comment. Hidden comments are still tracker data and are visible through APIs and raw markdown.

When feedback is submitted:

1. Validate and normalize the email or derive a verified account email server-side.
2. Create an opaque feedback submission record in the host database.
3. After issue creation, store tenant, provider, destination, and immutable issue ID against that record (plus GitHub repository ID/issue number or Linear team ID/identifier).
4. Store notification preference and recipient under the host's ordinary PII access/retention rules.
5. Put only the opaque submission ID in the issue comment.

If the app has no safe server-side store, omit resolution notifications. Do not fall back to leaking the email into either tracker. For Linear, use the signed Issue-update and completed-state flow in [linear.md](linear.md); the GitHub section below applies only to GitHub.

## Event source

### Preferred: GitHub App or repository webhook

Subscribe only to issue events needed for the feature. Configure a webhook secret and verify `X-Hub-Signature-256` over the raw request body using HMAC-SHA256 and a constant-time comparison before parsing JSON.

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyGitHubSignature(rawBody: Buffer, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}
```

Then require:

- event header is `issues`;
- action is `closed` with a completed state reason (not `not_planned`), or another explicitly configured resolution policy; optionally handle `reopened` for state cleanup;
- repository ID matches the configured inbox;
- immutable issue ID matches a server-side submission record for that repository; an editable issue comment is not authoritative;
- delivery ID has not already been processed.

Store processed delivery IDs or make notification dispatch idempotent. Return success for already-processed deliveries so GitHub retries do not send duplicate email.

Webhook creation, secret configuration, and production deployment are external changes. Perform them only when the user authorized those actions.

### Hosted workflow alternative — explicit opt-in only

A GitHub Actions workflow can POST close events to the app, but do not create or modify `.github/workflows/*` unless the user explicitly asks for hosted automation. Follow repository policy and prefer a local/documented setup when hosted automation is not requested.

If explicitly selected, pin third-party actions to immutable commit SHAs, use minimum permissions, pass untrusted issue/comment text through structured JSON rather than shell interpolation, and verify a shared secret at the receiver. Do not rely on a placeholder production URL.

## Notification dispatch

Reuse the host's existing mail or messaging helper. Send notification after the close event is authenticated and the submission record resolves.

User-facing content should contain:

- a friendly statement that the reported issue was addressed;
- the sanitized report title or page name;
- an optional human-authored resolution summary when the product has a trustworthy source for it;
- the app/support link appropriate for the user.

Do not expose internal labels, repository URLs, closers, comments, or diagnostic attachments unless the user is an authorized internal reviewer.

Escape every value interpolated into HTML email. A GitHub issue title/comment is untrusted input.

Team notifications may include the issue URL and internal details, subject to the team's access policy. Send team and user messages as separate templates and recipient calls.

## UI behavior

- Checkbox starts unchecked.
- Explain which email will be used.
- For authenticated apps, prefer the verified account email and offer a different address only when product policy allows it.
- Do not persist the address in local storage by default.
- Submission still succeeds if notification dispatch/configuration fails; record and surface the notification-specific state separately.
- Offer unsubscribe/contact behavior consistent with the host's transactional email policy.

## Secret handling

Use the host's secret manager or deployment environment. Never print, commit, or append generated secrets to files without explicit authorization and target verification. Changing production variables or GitHub webhook configuration is an external mutation and may require deployment/restart.

## Verification

Use fixtures and provider sandboxes/mocks first. Test:

- valid and invalid signatures;
- signature comparison against the raw body;
- wrong repository/event/action;
- replayed delivery IDs;
- missing/deleted submission records;
- malicious HTML in issue text;
- one close delivery sends at most one user notification;
- reporter email never appears in GitHub issue data or logs;
- notification failure does not corrupt the feedback submission.

Ask before closing a real issue or sending a real email as an end-to-end test.

Reference: [GitHub webhook signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
