# Feedback Widget

Teach your coding assistant to build an in-app feedback flow that fits your app and sends actionable reports to **GitHub or Linear**.

Free and open source under the [MIT license](LICENSE). Start with the install commands below or download a [release ZIP](https://github.com/alibad/feedback-widget/releases/latest).

This is an AI coding **skill**, not a hosted service or drop-in widget library. It contains implementation guidance, platform references, and a small tested server-side Linear adapter. Your assistant writes the widget into your app; you own its code and infrastructure.

## What it does

- Text-first reports: title, description, category, and sanitized page context.
- GitHub **or** Linear delivery through your authenticated backend.
- Optional screenshots, annotations, voice notes, recordings, and attachments.
- Platform guidance for Next.js/React, React Native/Expo, and Flutter.
- Explicit disclosure, private media by default, server-side credentials, and abuse controls.

It installs no hooks, background collectors, MCP servers, or account credentials. Installing it does not create issues or connect your tracker. Read [privacy](PRIVACY.md).

## Claude Code: install

Run these inside Claude Code (not your shell):

```text
/plugin marketplace add alibad/feedback-widget
/plugin install feedback-widget@feedback-widget
```

Choose **User** scope for all your projects, or **Project** to share the dependency with collaborators. Follow any reload/restart instruction Claude displays. Use `/plugin` → Installed to confirm it is enabled.

Open the application repository you want to modify, then run:

```text
/feedback-widget:add-feedback-widget Add a text-only feedback widget using Linear. Reuse this app's authentication. Do not add screenshots, diagnostics, or notifications. Ask me to confirm the destination team before wiring real delivery, and do not create a live test issue.
```

For GitHub, replace “using Linear” with “using GitHub” and confirm the intended repository. Add media later only if you want it and have private storage configured.

### Enable, disable, update

```text
/plugin enable feedback-widget@feedback-widget
/plugin disable feedback-widget@feedback-widget
/plugin marketplace update feedback-widget
```

Use the plugin manager to update the installed plugin when an update is offered. Follow its reload/restart instructions. Do not paste credentials into chat or commit them to your app.

### Local development

Pass the absolute path to this plugin checkout while running Claude Code from the application project you want to work on:

```sh
claude --plugin-dir /absolute/path/to/feedback-widget
```

Then invoke `/feedback-widget:add-feedback-widget` in a disposable application project. Loading this skill does not itself run its example adapter.

### Manual skill installation

Copy the **entire** `skills/add-feedback-widget` directory, including `references`, `assets`, and `tests`, into your personal `.claude/skills/` folder or a project's `.claude/skills/` folder. Do not overwrite an existing skill without reviewing it. The standalone command is `/add-feedback-widget` (without the plugin namespace).

For Claude's chat/Cowork skill upload, use a ZIP containing the `add-feedback-widget` folder, not the entire plugin repository. This skill is most useful in a coding environment with access to the app's files and test commands.

## Codex

Ask the built-in installer in Codex:

```text
$skill-installer Install the skill from https://github.com/alibad/feedback-widget/tree/main/skills/add-feedback-widget
```

The skill should be available on the next turn; restart Codex if it does not appear. Invoke `$add-feedback-widget` in your application project, followed by the same text-only Linear or GitHub request above.

For manual installation, copy the entire standalone `add-feedback-widget` folder into `~/.agents/skills/` (personal) or your app's `.agents/skills/` (project). Preserve its references, assets, and tests. Check for an existing copy before installing; do not overwrite one blindly. See the [official skill installation and discovery documentation](https://learn.chatgpt.com/docs/build-skills).

The repository includes a Codex plugin manifest, but the Claude marketplace commands above are **not** Codex commands, and this project is not claimed to be listed in the official Codex directory.

## Linear setup

The assistant can add the integration, but you must provide your own authorized destination and server configuration:

1. Choose the intended Linear team, and optionally a project.
2. Reuse an existing server-side OAuth integration, or create a narrowly scoped API key restricted to the intended team.
3. Store the credential in the app's server secret manager. Configure the team UUID and optional project UUID server-side. Never place a token in a browser or mobile bundle.
4. Run mocked tests first; authorize a live test explicitly when ready.

An installed Linear connector in your coding assistant is **not** the deployed app's credential. Missing setup leaves the widget's submission endpoint setup-blocked, not silently routed to GitHub. See the [Linear implementation guide](skills/add-feedback-widget/references/linear.md).

## Verify locally

Node 22+; no dependency installation or API credentials are needed:

```sh
npm run verify
claude plugin validate .
claude plugin validate .claude-plugin/plugin.json
```

The tests use synthetic data and mock every network request. They verify the included Linear adapter and signature verifier, not every app an assistant might generate. Validate the generated widget in its own repository before deployment.

No GitHub Actions workflows are included. Keep release checks local unless hosted automation is explicitly requested.

## Safety and contributions

Do not attach production screenshots, customer reports, private workspace links, tokens, or real webhook payloads to this repository. Use synthetic reproductions and review every contribution for provenance. See [SECURITY.md](SECURITY.md).

## Release packages

- `add-feedback-widget-13.0.0.zip`: the standalone skill folder, including references, adapter, tests, and MIT license; suitable for manual installation or Claude skill upload.
- `feedback-widget-plugin-13.0.0.zip`: the complete Claude/Codex plugin source package.
- `SHA256SUMS.txt`: checksums for both archives.

Run `npm run package` to verify and rebuild the archives locally. This requires Node 22+ and the `zip` command. Packaging uses the explicit file inventory, not the entire working directory.

## Send to a friend

Copy the short instructions in [SHARE.md](SHARE.md). Everyone configures their own tracker destination and server credentials; no author account is bundled.

## Official platform documentation

- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Linear API](https://linear.app/developers/graphql)
