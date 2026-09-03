# Media Permissions and Permissions-Policy

Check this only for selected media features. Core mode does not change browser permissions or headers.

## Map feature to directive

| Feature | Browser API | Relevant directive |
|---|---|---|
| Screenshot / screen recording | `getDisplayMedia()` | `display-capture` |
| Voice note / recording microphone | `getUserMedia({ audio: true })` | `microphone` |
| Camera photo | `getUserMedia({ video: true })` | `camera` |

Screen capture does **not** require the `camera` directive. Do not weaken `camera=()` for a widget that never opens the camera.

Both `display-capture` and `microphone` default to `self` where their directives are supported. If the project does not set them, usually no header change is needed. If an existing policy explicitly blocks a selected feature, change only that directive and preserve all other directives:

```text
Permissions-Policy: display-capture=(self), microphone=(self), camera=(), geolocation=()
```

For a cross-origin iframe, the parent policy and the iframe's `allow` attribute must both permit the feature. Do not broaden to `*`; list the exact origin only when embedding is an explicit requirement.

## Runtime behavior

- Call media APIs only from a direct user action.
- Feature-detect before rendering the control.
- Do not use the Permissions API as a gate for microphone access; call `getUserMedia()` and handle the actual result.
- Treat `NotAllowedError` as ambiguous: user denial, browser policy, iframe policy, or environment restriction may all produce it.
- Stop every acquired track on success, cancellation, timeout, unmount, and error.
- When permission is denied or unsupported, retain the draft and keep text submission available.

## Verification

Inspect the final production response headers, not only application config; a CDN or reverse proxy may alter them. Test:

1. the selected feature prompts only after the user clicks it;
2. denial produces useful copy and no broken state;
3. Core mode never prompts;
4. all tracks stop and browser sharing indicators clear;
5. iframe deployments work only for the intended origin.

References: [MDN `display-capture`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/display-capture), [MDN `microphone`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/microphone).
