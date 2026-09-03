# Linear Integration

Use this instead of GitHub delivery when the user selects Linear. Share the UI and [API boundary](api-route.md); do not route through GitHub or require a GitHub account. Native apps use the same authenticated server bridge.

## Configure the server

- Reuse an existing server-only Linear SDK or GraphQL client.
- For a single team's app, an explicitly configured API key should be restricted to the intended team and only the needed read/create-issue permissions. Do not request Admin access for routine reporting.
- For an app connecting multiple customers' workspaces, use Linear OAuth. Request `issues:create` with necessary read access, not broad write/admin unless another selected feature needs it. Validate OAuth state and tenant binding, protect stored tokens, and support revocation.
- Resolve organization, team UUID, and optional project/state/label UUIDs from trusted server configuration. A team key or display name is not a UUID. Validate that the chosen project, state, and labels belong to or are usable by the intended team. Ambiguous names require confirmation.
- Use explicit configuration such as `FEEDBACK_PROVIDER=linear`, `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, and optionally `LINEAR_PROJECT_ID`. These are example names, not real credentials. Never prefix secrets with `NEXT_PUBLIC_` or `EXPO_PUBLIC_`.
- Do not copy the author's or coding assistant's account settings. A Linear MCP connector can assist authorized setup, but it does not authenticate a deployed app.

Read-only discovery should request only necessary team/project/label metadata, with pagination; do not retrieve ticket bodies, users' email addresses, or unrelated workspaces. Configuration is setup-blocked until the intended destination and access are verified.

## Create the issue

Send a POST to `https://api.linear.app/graphql`. A personal API key is the raw `Authorization` value; an OAuth access token uses `Authorization: Bearer ...`.

Use GraphQL variables with `IssueCreateInput`. Include bounded title/description and the configured `teamId`; add `projectId`, `stateId`, or `labelIds` only from validated server configuration. Omit unneeded fields. Let the team's normal backlog/triage behavior apply when no state is configured.

The copyable [server adapter](../assets/linear-provider.mjs) implements this narrow network boundary with an injectable fetch function. It is not a complete endpoint: the host must still provide session authorization, tenant/destination validation, redaction, attachment ownership, and durable idempotency. Import it only from server code. The [offline tests](../tests/linear-provider.test.mjs) use synthetic data and never contact Linear; run them with `node --test tests/linear-provider.test.mjs` from the skill directory (Node 22+).

Always inspect HTTP status, GraphQL `errors`, `success`, and the returned issue—not HTTP 200 alone. Store `id`, `identifier`, and the provider-returned `url` in the private receipt. Do not construct workspace URLs or expose them to customers without authorization.

No automatic create retry is safe after a timeout, 5xx, invalid response, or partially successful mutation. Mark these outcomes uncertain and reconcile the durable submission record. Honor provider rate-limit guidance, bound any scheduled retry, and never retry invalid credentials or routing by switching providers. Do not drop labels/project routing and retry unless rejection was proven to occur before creation and the product explicitly accepts the change.

## Attachments and privacy

Use [private host storage](storage-strategy.md) and ordinary authenticated reviewer links by default. Link previews need not work without authentication; do not make objects public to fix a preview. Uploading to Linear itself is a separate storage choice requiring disclosure, authorization, retention planning, and the current Linear upload guide. Never upload a customer's media while merely installing/testing this skill.

Describe the destination and attached data before Submit. A private workspace can still expose data to more colleagues than the reporter expects. Keep reporter email, access tokens, raw diagnostics, and internal user IDs out of issue text. Retain notification recipients only in the host's protected store.

## Resolution webhooks — optional

Follow [resolution notifications](issue-closed-notify.md). Linear is not GitHub: there is no GitHub `issues.closed` event or `X-Hub-Signature-256` header here.

1. Provision an Issue webhook only when authorized. Keep its signing secret server-side.
2. Limit body size; verify the hex `Linear-Signature` as HMAC-SHA256 of the **raw body**, using constant-time comparison with validated equal lengths.
3. Parse only after signature verification; require a finite `webhookTimestamp` within the configured short freshness window (Linear recommends one minute).
4. Validate `type: Issue`, `action: update`, organization and configured team, plus the known immutable issue ID in the private mapping. Require a real state transition, not just an edit to an already completed issue.
5. Resolve workflow state semantics using verified team metadata. Notify on transition to `completed` when product policy considers it resolved; `canceled`, duplicate, archived, or deleted does not mean fixed. Re-fetch current state when needed to handle reordered events.
6. Deduplicate `Linear-Delivery` within the verified webhook scope and enqueue through a durable outbox keyed by issue/resolution transition. Ignore unknown submissions. Never derive email from webhook actor data.

The adapter includes a pure signature/freshness verifier. It deliberately does not send notifications or provision webhooks. Test wrong signatures, malformed hex, missing/stale/future timestamps, wrong tenant, non-state updates, cancellations, replays, and reordered events.

## Official references

Recheck current provider behavior when implementing:

- [GraphQL, authentication and issue creation](https://linear.app/developers/graphql)
- [API-key team and permission restrictions](https://linear.app/docs/api-and-webhooks)
- [OAuth scopes](https://linear.app/developers/oauth-2-0-authentication)
- [Webhook payloads and verification](https://linear.app/developers/webhooks)
- [Rate limits](https://linear.app/developers/rate-limiting)
- [File uploads](https://linear.app/developers/how-to-upload-a-file-to-linear)
