# Send this to a friend

I open-sourced a skill that teaches Claude Code or Codex to add a feedback widget to your app, with GitHub or Linear issue delivery. It's MIT-licensed, and you own the generated implementation.

Website and setup: https://feedback.humanquest.net

Source: https://github.com/alibad/feedback-widget

Open Claude Code in your app's repository, then run:

```text
/plugin marketplace add alibad/feedback-widget
/plugin install feedback-widget@feedback-widget
```

Choose User scope. Check `/plugin` → Installed and make sure **feedback-widget** is enabled. Follow any reload/restart prompt.

Then run:

```text
/feedback-widget:add-feedback-widget Add a text-only feedback widget using Linear. Reuse my app's authentication and design system. Ask me to confirm the destination team. Keep screenshots, diagnostics, and notifications off. Do not create a live test issue.
```

Prefer GitHub? Replace “using Linear” with “using GitHub” and choose your own inbox repository.

You will need your own server-side tracker integration. Never paste keys into chat or put them in a mobile/browser bundle. Installing this skill does not connect an account or automatically collect feedback. It guides the assistant to build the feature into your app; review and test that implementation before deployment.

For manual installation, get the standalone skill ZIP from [Releases](https://github.com/alibad/feedback-widget/releases/latest). The full README explains where to put it and how to enable it.

Using Codex? Follow the [Codex install instructions](https://github.com/alibad/feedback-widget#codex), then invoke `$add-feedback-widget` in your app project.
