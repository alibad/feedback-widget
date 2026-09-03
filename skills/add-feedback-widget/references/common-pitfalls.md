# Common Pitfalls

Quick reference of implementation pitfalls and safer approaches.

## Screenshots & Capture

| Mistake | Correct approach |
|---|---|
| Choosing capture without considering privacy | Native capture preserves rendered pixels but may include sensitive or unrelated content. Require review/removal, disable it on sensitive screens, and never promise automatic masking of arbitrary pixels |
| Widget UI visible in screenshots | Hide `#feedback-widget-root` before capture — use `withWidgetHidden()`. See `screenshot-visibility.md` |
| Not scaling crop coordinates for HiDPI | Use `img.width / window.innerWidth` scale factor when cropping — device pixel ratio differs |
| Stripping data URI prefix with regex | NEVER use regex — MIME types like `video/webm;codecs=vp9,opus` contain commas that break regex. Use `indexOf(';base64,')` |
| Inlining screenshots as base64 in GitHub issues | Store media through the chosen private/public access policy and link by server-controlled attachment reference. Never inline base64 in the issue body |

## Annotator

| Mistake | Correct approach |
|---|---|
| No visual indicator when annotation is selected | Show dashed blue bounding box around selected annotation. Implement `getAnnotationBounds()` for all tool types and render with `ctx.setLineDash([4, 4])` in `redraw()`. Add `selectedId` to redraw deps |
| No way to delete selected annotation | Delete/Backspace key removes selection. Push to undo stack (`setUndone(prev => [deleted, ...prev])`) so Ctrl+Z restores it. Add Trash icon in toolbar enabled when `selectedId` is set |
| `lineWidth` as a constant (`const [lineWidth] = useState(3)`) | Must be stateful with a range slider (1-12) in the toolbar. Users expect to control stroke thickness |
| Text input not stopping event propagation | `onMouseDown`, `onPointerDown`, `onKeyDown` MUST call `e.stopPropagation()` — otherwise clicks inside the input bubble to the canvas, which resets the input before user can type |
| `onBlur={commitText}` on text input | NEVER — fires during re-renders and destroys the input prematurely. Commit only via Enter or clicking elsewhere on the canvas |
| `autoFocus` on text input | Unreliable. Use `requestAnimationFrame(() => ref.current?.focus())` in a `useEffect` watching the text input state |
| Undo doesn't restore deleted annotations | `deleteSelected` must push to undo stack, not just filter it out |

## Data Model

| Mistake | Correct approach |
|---|---|
| Separate `screenshots[]` and `pinpointData` | Use unified `captures[]` array — each capture links element info + screenshot independently. See `captures-model.md` |
| Pinpoint as default tool | Prefer Select Element for structured metadata; expose Pinpoint only in Media mode when it fits the requested UX |

## UI & Interaction

| Mistake | Correct approach |
|---|---|
| `window.prompt()` for text annotations | Inline `<input>` positioned on canvas. See annotator.md for full implementation details |
| Text input `onBlur={commitTextInput}` | NEVER use onBlur to commit — it fires when focus shifts even briefly during re-render, destroying the input before user can type. Commit only via Enter key or clicking on canvas |
| Text input not stopping event propagation | `onMouseDown`, `onPointerDown`, and `onKeyDown` MUST call `e.stopPropagation()` — otherwise clicks/keys bubble to canvas handlers |
| Text input not auto-focusing | `autoFocus` is unreliable. Use `requestAnimationFrame(() => ref.current?.focus())` in a `useEffect` triggered by text input state |
| Text input with colored background | Use `bg-transparent` with `textShadow` for contrast — NOT a colored background rectangle which looks ugly |
| Only 6 preset colors in annotator | Hidden `<input type="color">` behind dashed-border "+" swatch |
| Color picker `<input>` with `display:none` | NEVER use `className="hidden"` — the native color picker dialog detaches from the button position. Use `opacity-0` with absolute positioning so the picker anchors correctly |
| Color picker with `conic-gradient` rainbow | Looks garish at small sizes. Use a clean dashed-border circle with "+" icon; fill with custom color when active |
| Pencil cursor with single-color stroke | White-on-white or dark-on-dark is invisible. Use dual-stroke SVG: thick black outer + thin white inner for visibility on any background |
| `elementFromPoint` while overlay visible | Set `pointer-events: none` on overlay first |
| Drop zone hidden until drag | Always-visible, clickable: "Drop images or files here, paste, or click to upload" |
| Separate Upload and Attach buttons | Unified drop zone routes images to annotator, non-images to attachments |
| `mouseup` for text selection | Use `pointerup` — fires for both mouse and touch |
| Highlighting `<html>`/`<body>` in Select mode | Skip these elements + anything inside `#feedback-widget-root` |
| Dialog overflows viewport with many captures | Add `max-h-[90vh] overflow-y-auto` to desktop dialog container |
| Selected text quote can't be dismissed | Add X button to clear `selectedText` without closing the dialog |
| Hiding where reports go | Disclose the selected tracker and audience plus attached data before Submit; do not imply that private workspace access is limited to the reporter |
| Using `confirm()` for deleting recordings | Use project's ConfirmDialog/AlertDialog — NEVER native browser dialogs |
| Feedback button overlapping other floating buttons | Position to avoid conflicts (e.g., WhatsApp button at bottom-right); use `bottom-24` or middle-right |

## Dialog Styling

| Mistake | Correct approach |
|---|---|
| Using raw Tailwind colors (`zinc-*`, `gray-*`, `bg-white`) when the project has custom CSS properties | Read `globals.css` BEFORE writing any JSX. If the project defines `--color-foreground`, `--color-border`, `--color-muted`, use `text-foreground`, `border-border`, `bg-bg-light`, `text-muted` everywhere. Also match the trigger button style to existing floating buttons (e.g., glassmorphic `bg-white/80 backdrop-blur-md` if that's the pattern). Raw `zinc-*` looks out of place in a branded project |
| Removing an existing support channel without authorization | Consolidate only overlapping feedback triggers. Preserve unrelated contact/support paths unless the user asked to replace them |
| Tailwind `bg-white` overridden by MUI/CSS framework | If project uses MUI ThemeProvider or similar, Tailwind background classes may be overridden by framework global styles. Use inline `style={{ backgroundColor: '#ffffff' }}` or `!bg-white` (Tailwind `!important` modifier) to ensure solid opaque background |
| Dark floating indicator text invisible | Recording indicator with `text-white` on `bg-gray-900` can appear low-contrast. Use explicit `style={{ color: '#f5f5f5' }}` with `font-medium` weight and add a `border border-gray-700` for definition |
| Duration labels (60s, 10m) on buttons | Putting duration in button labels (e.g., "Record (60s)") causes inconsistent button heights when other buttons don't have them. Use just "Record" and "Voice" — the duration is communicated through the countdown timer |
| No page context in feedback issues | Include the page/route name in both the issue title and as the first field in the body. Resolve slugs to human-readable names from the project's registry/config if available. Raw URLs alone are insufficient |

## Dialog Behavior

| Mistake | Correct approach |
|---|---|
| No ESC key to close the feedback dialog | ESC should cascade: exit select/pinpoint mode → close annotator → close the dialog. Add a `keydown` handler that checks modes in priority order |
| `restore()` sets `isMinimized: true` | `restore()` must set `isMinimized: false, isOpen: true` — otherwise after screenshot/video capture the user sees the minimized pill instead of the full dialog |
| No way to hide the FAB trigger when host provides its own button | Add an explicit trigger-visibility option. A host toolbar can hide the floating trigger while preserving access to the same feedback flow |

## Zustand Store & React Hooks

| Mistake | Correct approach |
|---|---|
| `useCallback(() => { store.setIsRecording(false) }, [store])` — infinite render loop | NEVER put the reactive Zustand `store` object (from `const store = useMyStore()`) in a `useCallback` dep array. Zustand's hook returns a new object every render, so the callback recreates every render. If that callback is also in a `useEffect` dep array, the effect cleanup fires every render, calling the setter, which triggers another render → **"Maximum update depth exceeded"**. Fix: use `useMyStore.getState().setIsRecording(false)` inside the callback and give it `[]` deps |
| `useEffect(() => { return () => stopFn() }, [stopFn])` where `stopFn` depends on `store` | Cleanup-only effects must have stable deps. If `stopFn` recreates every render (because it closes over the reactive `store`), the cleanup re-fires every render. Fix: make `stopFn` use `useMyStore.getState()` so it has empty deps `[]`, or use a ref to hold the latest stop function |
| Calling `store.setSomething()` inside a callback passed to `useEffect` deps | Any Zustand setter called from a callback that depends on the reactive `store` hook creates a render cycle. **Rule: callbacks that both (a) call store setters and (b) appear in `useEffect` dependency arrays MUST use `getState()` instead of the reactive hook return** |

## Recording & Media

| Mistake | Correct approach |
|---|---|
| Dialog visible during video recording | Minimize the dialog before requesting the stream; keep a visible recording/stop indicator for the full recording |
| Screenshot/video capture on mobile | Skip entirely — Screen Capture API not supported on mobile |
| Not handling "Stop sharing" browser button | Listen for `ended` event on video track |
| Not revoking video/audio object URLs | Revoke in close(), reset(), removeVideo(), removeAudio(), and after submit |
| Recording microphone audio by default | Start with microphone off; only call separate `getUserMedia` after an explicit choice, and preserve video-only recording on denial |
| Using `navigator.permissions.query` for mic | NEVER pre-check — just call `getUserMedia` directly. `permissions.query` returns stale state |
| Accepting arbitrary attachment types | Allowlist only requested file types, verify size and signature server-side, and reject active content such as SVG/HTML by default |

## Mobile

| Mistake | Correct approach |
|---|---|
| Canvas annotator on mobile | Skip — add uploaded/pasted images directly |
| Hover-dependent UI on mobile | Always-visible on touch devices |
| Small touch targets | Min 44px (`min-h-11`) per Apple HIG |

## Flutter

See `references/flutter.md` for the full Flutter port.

| Mistake | Correct approach |
|---|---|
| `Navigator.of(context)` from inside `MaterialApp.builder` | That context is ABOVE the Navigator and throws. Set a `GlobalKey<NavigatorState>` as `MaterialApp.navigatorKey` and push via `rootNavigatorKey.currentState?.push(...)` |
| Live `TextField` baked into the exported annotation PNG | Before `toImage`, `_commitText()` to flush the in-progress label, then `await WidgetsBinding.instance.endOfFrame` so the editing field leaves the tree |
| `prompt()`/dialog for annotator text | Inline `TextField` positioned on the canvas at the tap point; commit on `onSubmitted` |
| Capturing at `pixelRatio: 1.0` on HiDPI | Use `MediaQuery.devicePixelRatio` for the screen capture and a fixed `2.0` for the export |
| Embedding a GitHub or Linear token in the Flutter app | Bundle is extractable — issue creation is server-side only; upload through authorized storage and send opaque attachment IDs, not URLs |
| Treating a hidden/debug trigger as backend security | Gate the intended audience in UI, but still authenticate, validate, and rate-limit the server endpoint |

## Permissions & Config

| Mistake | Correct approach |
|---|---|
| Enabling `camera` for screen capture | `getDisplayMedia` uses `display-capture`; enable `microphone` only for audio and `camera` only for an actual camera feature. Preserve unrelated policy directives |

## Environment & Setup

| Mistake | Correct approach |
|---|---|
| Using `GITHUB_TOKEN` (personal access token) | Use GitHub App auth (`@octokit/auth-app`) with `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`. PATs are tied to individual users, expire silently, and can't be org-scoped. (Exception: a single-repo Cloud Function bridge may use a fine-grained, repo-scoped token in a secret — see `flutter.md` → Delivery. Still never a classic PAT) |
| Creating a separate GitHub client when one already exists | Check `lib/github.ts` or `lib/octokit.ts` first — reuse the project's existing `getOctokit()` |
| Duplicating an existing GitHub client | Reuse the host's server client. A small direct REST call is acceptable only with server-held scoped credentials, bounded retry/error handling, and no client exposure |
| Claiming a tracker integration works without verification | Use mocked adapters and authorized read-only configuration checks; ask before creating a live test issue or sending a notification |
| Making Firebase or another bucket public for feedback | Keep storage private and use an authorized reviewer route/signed delivery. Public bearer URLs require explicit approval and retention rules |
| Firebase Storage `adminStorage.bucket()` without name | May not resolve correctly. Use `admin.storage().bucket(BUCKET_NAME)` with explicit bucket name matching the old working pattern |
| Uploading HTML snapshots as `text/html` to GCS | GCS attempts to render `.html` files and triggers `MissingSecurityHeader` auth errors. Upload as `text/plain` with `.txt` extension instead |
| Using Zustand persist middleware for feedback settings | Persists transient state (blobs, captures, recording). Use manual localStorage with explicit `loadSettings()` / `saveSettings()` for just the settings fields |
| Hiding diagnostic disclosure only in a settings popover | Keep controls compact, but show a plain-language payload summary immediately before Submit |
| Sending empty diagnostics arrays to the API | An empty `console: []` or `network: []` still creates a file with no useful content. Return `undefined` instead when filtered results are empty |

## i18n / Language Toggle

| Mistake | Correct approach |
|---|---|
| MutationObserver in `useFeedbackLang` overrides manual toggle | When the user clicks the language toggle, the widget re-renders with a new `dir` attribute on `#feedback-widget-root`. The observer on `document.body` subtree fires, calls `detectLang()`, which excludes `#feedback-widget-root` elements, and resets to "en" — making the toggle appear broken. Fix: add a `manualRef = useRef(false)` flag. Set it to `true` in the `toggle` callback. In the observer, skip `detectLang()` if `manualRef.current` is true |

## Notifications

| Mistake | Correct approach |
|---|---|
| Creating a GitHub Actions workflow as a notification side effect | Prefer a verified GitHub webhook; create hosted automation only when the user explicitly requested it |
| Putting reporter email in a hidden issue comment | Hidden comments remain repository/API data. Store issue-to-recipient mapping server-side |
| Comparing webhook secrets with `==` | Verify `X-Hub-Signature-256` over the raw body and use a constant-time comparison |
| Applying GitHub webhook rules to Linear | Verify Linear's raw-body signature, timestamp, tenant/team, and completed-state transition; see [linear.md](linear.md) |
