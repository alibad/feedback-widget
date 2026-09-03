# Flutter Feedback Widget

The entry skill targets web by default; [react-native.md](react-native.md) covers React Native / Expo. Flutter has no DOM or browser Screen Capture API and must not hold GitHub/Linear credentials in the app bundle. Use this reference for Flutter UI/capture while keeping the entry skill's security, backend, storage, and verification rules. Select delivery through [issue-providers.md](issue-providers.md); [linear.md](linear.md) also applies to this server bridge.

Flutter can capture app-rendered content in-process with `RepaintBoundary` and support a canvas annotator via `CustomPainter`. These are optional Media capabilities, not part of text-only Core. Capture requires a user action, a permitted non-sensitive screen, and preview/removal; absence of an OS permission prompt is not consent.

## When this applies — detect the platform first

Flutter if there's a `pubspec.yaml` with a `flutter:` SDK block, a `lib/main.dart`, and `android/` + `ios/` runner folders. In a mixed monorepo, build the widget for each platform separately; they can share the backend contract and selected tracker destination.

## Web concept → Flutter equivalent

| Web (rest of skill) | Flutter | Notes |
|---|---|---|
| DevTools element select (`elementFromPoint`) | ✗ none | No DOM. Drop element-select; capture the whole screen instead |
| `getDisplayMedia` screenshot | `RepaintBoundary` + `RenderRepaintBoundary.toImage()` | In-process, no plugin, **no OS permission** — Flutter's superpower |
| html2canvas / canvas annotator | `CustomPaint` + `CustomPainter` over the captured image — **KEEP IT** | RN skips the annotator; Flutter ships it |
| `getUserMedia` + `MediaRecorder` voice | `record` / `just_audio` + `speech_to_text` (optional) | Not in the reference impl; add only if asked |
| File drop zone | `file_picker` / `image_picker` (optional) | |
| Page HTML snapshot | route name + device/app meta (optional enrichments) | No HTML; the reference only sends `platform` — see Diagnostics |
| Server issue adapter → GitHub/Linear | **backend bridge** (app holds NO secrets) | See "Delivery" — same rule as RN |
| `Permissions-Policy` header | native `Info.plist` / `AndroidManifest` usage strings | Only if you add camera/mic capture |

## Capture the screen — the `RepaintBoundary` pattern (Flutter's superpower)

Wrap the app content in a `RepaintBoundary` keyed by a top-level `GlobalKey`, mounted in `MaterialApp.builder` so it sits over every route. Capturing it gives a pixel-perfect PNG with no plugin and no permission prompt.

```dart
// Top-level, next to the widget:
final GlobalKey feedbackBoundaryKey = GlobalKey();

// In MaterialApp.builder (wraps every screen):
builder: (context, child) {
  return Stack(
    children: [
      RepaintBoundary(key: feedbackBoundaryKey, child: child!),
      if (kDebugMode) const DebugFeedbackButton(), // debug-gated, see below
    ],
  );
},

// Capture, on tap:
final boundary = feedbackBoundaryKey.currentContext!
    .findRenderObject() as RenderRepaintBoundary;
final image = await boundary.toImage(
  pixelRatio: MediaQuery.of(context).devicePixelRatio, // crisp on HiDPI
);
final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
final bytes = byteData!.buffer.asUint8List();
```

- Capture at `devicePixelRatio` so the screenshot matches the physical screen resolution (the Flutter analog of the web "scale crop coords for HiDPI" rule).
- The boundary must be an **ancestor** of the content you want in the shot — mounting it in `MaterialApp.builder` captures the active route but not the FAB itself (the FAB is a sibling in the `Stack`, outside the boundary), which is exactly what you want.

### ⚠️ The FAB still lands on top of the screenshot — hide it for the whole flow

The point above is true and it is not enough, and the gap produces a bug report
that sounds impossible: *"the feedback button is in its own screenshot."*

It is not in the PNG. Being a sibling of the boundary genuinely keeps it out.
But the FAB is mounted in `MaterialApp.builder`, which is **above the
Navigator** — so it also floats over the annotator route you push next, landing
directly on top of the very screenshot being annotated. Identical appearance,
completely different cause, and you will go looking in the capture code and find
nothing wrong with it.

Hide the trigger for the duration of the flow, not just for the capture frame:

```dart
bool _inFeedbackFlow = false;

// …in the open handler, around the push:
if (mounted) setState(() => _inFeedbackFlow = true);
await rootNavigatorKey.currentState?.push(/* annotator route */);
if (mounted) setState(() => _inFeedbackFlow = false);
```

```dart
// …and in build. IgnorePointer matters: an Opacity of 0 still absorbs taps,
// so a merely invisible FAB keeps swallowing touches over the annotator —
// including on the toolbar, if it parked there.
IgnorePointer(
  ignoring: _capturing || _inFeedbackFlow,
  child: AnimatedOpacity(
    opacity: (_capturing || _inFeedbackFlow) ? 0.0 : restingOpacity,
    /* … */
  ),
)
```

`await` the push. Without it the flag never clears and the trigger is gone for
the rest of the session.

### Make the trigger legible against an unknown background

It parks over arbitrary app content, so translucency reads as a smudge rather
than a control. A translucent fill *and* a low resting opacity compound: at
`primary.withValues(alpha: 0.9)` inside an `AnimatedOpacity` of `0.55` the mark
picks up whatever is behind it and stops looking like a button at all.

Use a **solid** fill, keep the resting opacity high enough to read (~0.7), and
give it a real shadow so it separates from the content it covers.

## Mount the trigger ABOVE the navigator — the `rootNavigatorKey` gotcha (CRITICAL)

The FAB lives in `MaterialApp.builder`, whose `BuildContext` sits **above** the `Navigator`. Calling `Navigator.of(context).push(...)` from there throws *"Navigator operation requested with a context that does not include a Navigator."* Route through a `GlobalKey<NavigatorState>` set on `MaterialApp.navigatorKey` instead:

```dart
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

// On the app:
MaterialApp(navigatorKey: rootNavigatorKey, /* ... */);

// Push the annotator from inside MaterialApp.builder's subtree:
rootNavigatorKey.currentState?.push(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => FeedbackAnnotatorScreen(screenshot: bytes),
  ),
);
```

This is the Flutter analog of the web widget's "mount at the root" rule, and it's the single most common Flutter wiring bug. Do **not** reach for `context.mounted` + `Navigator.of(context)` here — that context never has a Navigator.

## Debug-gate the trigger (don't ship it to everyone)

```dart
if (kDebugMode) const DebugFeedbackButton(),
```

`kDebugMode` is the Flutter analog of RN's `__DEV__` gate — the button never compiles into a release build. For a beta/internal channel that needs it in profile/release builds, gate on a `--dart-define` flag instead:

```dart
const _feedbackEnabled = bool.fromEnvironment('FEEDBACK'); // flutter run --dart-define=FEEDBACK=true
if (kDebugMode || _feedbackEnabled) const DebugFeedbackButton(),
```

## The draggable FAB

A small circular `Material` button positioned with a `GestureDetector(onPanUpdate:)` that updates a `Positioned` offset, clamped to the screen so it can't be dragged off-edge:

```dart
onPanUpdate: (d) => setState(() {
  _pos = Offset(
    (_pos.dx + d.delta.dx).clamp(0.0, size.width - fab),
    (_pos.dy + d.delta.dy).clamp(40.0, size.height - fab), // keep clear of the status bar
  );
}),
```

Theme it with the app's accent color — the reference uses a 44px circular `Material` at ~0.9 opacity with a `bug_report_rounded` icon, started at `Offset(12, 120)` (left edge, below the status bar). The `clamp` lower bound of `40.0` keeps it from being dragged up under the status bar. (Flutter analog of RN's `PanResponder` + `Animated.ValueXY`.)

### ⚠️ Keep the whole circle on screen — never tuck it off the edge

It is tempting to park the resting button a little way *off* the edge so it reads
as a grab-tab rather than a control competing with the app's own buttons. Don't.
A circle sliced by the viewport is indistinguishable from a rendering bug, and
that is exactly how users report it — "the feedback button looks weird", not "the
feedback button is tucked". Nudging the glyph back into the visible half to escape
the crop makes it worse: now the icon is off-centre in a half-circle.

Rest it **fully on screen**, ~10pt in from the edge, and use opacity (≈0.7 at
rest, 1.0 while dragging) to keep it out of the way. Opacity is the right lever
for "this is a tool, not a control"; geometry is not.

**Re-park against the current screen on every build that is not a drag.** The
saved position outlives the layout that produced it — an old off-edge value, or a
window since resized smaller, otherwise strands the button outside the viewport
with no way to drag it back:

```dart
final stored = _position ?? Offset(0, screen.height * 0.55);
// Skipped mid-drag, or it snaps back from under the finger.
final position = _dragging ? stored : _park(stored, screen);
```

## The optional annotator — `CustomPainter` canvas

A full-screen editor over the captured image. Tools: **pen** (freehand polyline), **arrow** (a sensible *default* tool — "point at the bug"), **text**, **rectangle**, **ellipse** — the last two with optional translucent fill. Key patterns:

- **Match the canvas coordinate space to the captured image (load-bearing).** Decode the screenshot's intrinsic size first (`ui.instantiateImageCodec` → `frame.image.width / height`) to get its aspect, then render the `Image.memory(..., fit: BoxFit.fill)` + `CustomPaint` inside an `AspectRatio(aspectRatio: imgW / imgH)`, and put the `GestureDetector` inside that *same* box. This makes a drag's `localPosition` map 1:1 to the exported PNG's pixels. Skip it and annotations land in the wrong place after export.
- **One `_Anno` model + an `_isBoxTool()` helper** unify how drag events build each tool: arrow/rect/oval store `[start, end]` (a bounding box), pen accumulates a polyline, text is a single tap anchor.
  ```dart
  bool _isBoxTool(AnnoTool t) =>
      t == AnnoTool.arrow || t == AnnoTool.rect || t == AnnoTool.oval;
  ```
- **Inline text is a real `TextField` positioned on the canvas — NEVER a dialog or prompt** (the Flutter analog of the web "no `prompt()`" rule). Place it at the tap point via a `Positioned`, focus it with a post-frame callback, and commit on `onSubmitted`.
- **Fold the fill choice into one compact `PopupMenuButton`** (Rectangle / Rectangle · filled / Ellipse / Ellipse · filled) so the toolbar stays tight instead of sprouting four separate buttons.
- **Export at high resolution from a dedicated boundary.** Wrap the image + `CustomPaint` in their *own* `RepaintBoundary` (a separate `_exportKey`). Before capturing:
  1. `_commitText()` to flush any in-progress label into the annotation list, then
  2. `await WidgetsBinding.instance.endOfFrame` so the live `TextField` is gone from the tree, then
  3. `boundary.toImage(pixelRatio: 2.0)` → `toByteData(format: ui.ImageByteFormat.png)`.

  Skipping the commit + `endOfFrame` bakes the live editing `TextField` (cursor and all) into the exported PNG.
- A tappable color palette, **two-stage undo**, and **clear all** round out the toolbar. Undo cancels an in-progress (mid-edit) text label first; only if there's none does it pop the last committed annotation — so a half-typed label can be undone without deleting finished marks.
- **Submit UX**: gate the Submit/Cancel buttons on a `_saving` bool (disable both, swap Submit for a spinner) to block double-submits; on success show a floating `SnackBar` via `ScaffoldMessenger.maybeOf(context)` (`maybeOf`, **not** `of`, so a missing messenger never throws) and pop the route.

The `CustomPainter` draws each annotation by type: pen → `Path` of line segments (a degenerate **single tap** is drawn as a filled `drawCircle` dot so a tap still leaves a mark); arrow → line plus two short head strokes via `Offset.fromDirection`; rect/oval → `Rect.fromPoints(start, end)` with an optional translucent fill paint *behind* the stroke; text → a `TextPainter` with a drop shadow for contrast on any background.

Put the drawing `GestureDetector` over a `Positioned.fill` with `behavior: HitTestBehavior.opaque` so drags register anywhere on the canvas, including fully transparent regions — without `opaque`, taps over transparent areas fall through and the tools feel dead.

## Delivery — keep credentials and trust decisions server-side

A Flutter bundle is extractable. Never embed GitHub or Linear credentials. Use the authenticated backend contract in [api-route.md](api-route.md). Core sends text only. When Media is enabled, use the private upload flow in [storage-strategy.md](storage-strategy.md):

1. The app requests an authorized attachment ID/object key from the backend.
2. It captures and annotates the PNG, shows a removable preview, and uploads it to that exact key.
3. It submits bounded text, route/app context, and the attachment ID.
4. The backend verifies the user, tenant, App Check/attestation if used, quota, attachment ownership/type/size, and idempotency key before creating the issue.

App Check is defense in depth, not user authentication or rate limiting. Monitor mode can help rollout, but production enforcement should be a deliberate launch step after real devices are verified. A debug/beta UI gate does not protect the public function.

For GitHub, prefer a repository-restricted App with Issues read/write; a fine-grained server token is an explicit small-bridge trade-off, never a classic PAT. For Linear, use the scoped server-only setup in [linear.md](linear.md). All destination and label routing remains server-owned.

If multiple surfaces share an inbox, use a server-controlled source label and `[app]` title prefix. Verify labels when authorized. GitHub may retry without labels only after confirmed pre-creation label failure; never apply this as a generic Linear retry strategy.

## Offline draft durability — optional and private

Do not automatically write screenshots and notes permanently to the documents directory or log report contents. That creates a second, unmanaged copy of sensitive feedback.

If offline drafts are a product requirement:

- use the app's encrypted/private draft store;
- generate opaque filenames;
- never log note text or full filesystem paths in production;
- show pending drafts to the user with delete/retry controls;
- delete local media after confirmed submission or after a documented expiry;
- keep drafts scoped to the signed-in user and clear them on sign-out.

For local developer iteration, a debug-only explicit "save locally" action is acceptable. Keep it out of release builds and never treat it as the production delivery guarantee.

## Diagnostics and context — optional

Route name and app version are usually sufficient. Device details, logs, and user identity start off. If enabled, follow [diagnostics.md](diagnostics.md):

- derive user identity server-side;
- use a scrubbed, bounded log buffer only after opt-in;
- keep sensitive diagnostics in private attachment storage, not the issue body;
- clear diagnostic state on submit/cancel/user change.

## Native permissions

The `RepaintBoundary` screenshot needs **no permission** (it's in-process). You only need usage strings if you *add* native capture: `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` / `NSPhotoLibraryUsageDescription` in `ios/Runner/Info.plist` and the matching `<uses-permission>` entries in `AndroidManifest.xml`. Missing strings = silent failures or App Store rejection.

## Shipping fixes to the widget (OTA)

Dart-only widget tweaks can ship over-the-air with **Shorebird** (`shorebird patch`) instead of a new TestFlight/Play build — but only if the installed build was compiled with the Shorebird engine. Changes that touch native code or add a plugin always require a new store build. (Flutter analog of the RN `eas update` rule.)

Optional Flutter extensions:

- [speech-dictation.md](speech-dictation.md) for disclosed speech-to-text;
- [screenshot-gesture-trigger.md](screenshot-gesture-trigger.md) for an opt-in, signal-only screenshot shortcut.

## What NOT to do (Flutter)

- **Never** put a GitHub token or App private key in the app bundle — issue creation is server-side only.
- Don't call `Navigator.of(context)` from inside `MaterialApp.builder` — that context has no Navigator; push through a `navigatorKey`.
- Don't bake the live editing `TextField` into the export — `_commitText()` then `await WidgetsBinding.instance.endOfFrame` before `toImage`.
- Don't use a dialog/prompt for annotator text — inline `TextField` on the canvas.
- Don't ship the trigger unguarded — gate on `kDebugMode` (or a `--dart-define` beta flag).
- Don't upload base64 or arbitrary URLs to the bridge — use authorized storage and send an opaque attachment ID.
- Don't rely on App Check, a debug flag, or a hidden trigger as endpoint authorization.
- Don't reach for DOM/web APIs (`getDisplayMedia`, `elementFromPoint`, `html2canvas`) — they don't exist in Flutter.
- Don't capture at `pixelRatio: 1.0` on HiDPI screens — use `devicePixelRatio` (capture) and a fixed `2.0` (export).
