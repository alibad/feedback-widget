# Security

Treat the skill as reviewed instructions, not a guarantee that generated code is secure. Review authorization, destination visibility, validation, storage, redaction, idempotency, and recorder cleanup in each app.

For a vulnerability, use [GitHub's private vulnerability reporting](https://github.com/alibad/feedback-widget/security/advisories/new), which is enabled for this repository. Do not publish exploit details, tokens, customer records, or private workspace information in a public issue.

Tests must use synthetic fixtures and mocked provider calls. Live issues, workspace installations, uploads, webhooks, and notifications require explicit authorization for the chosen target.

Before a release, run local verification, validate plugin manifests, inspect the exact release file list, scan for private identifiers/credentials, and verify the license and provenance. Do not publish private source-control history or personal configuration.
