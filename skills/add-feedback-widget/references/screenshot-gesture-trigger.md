# Screenshot-Signal Shortcut (Flutter)

This optional Flutter feature notices the OS screenshot event and offers to start a feedback report. It is useful for internal/beta users, but it changes app-wide behavior and adds native code.

## Consent model

Do not interpret every screenshot as a report request by default. Screenshots may be personal, instructional, or unrelated to feedback.

Enable this shortcut only when:

- the app owner explicitly requested it;
- the user has seen a clear explanation and opted in (or the feature is confined to an explicitly disclosed internal/debug build);
- a visible setting can disable it;
- a signal opens a lightweight **"Report this screen?"** confirmation; app capture starts only after confirmation;
- repeated signals are debounced and ignored while feedback UI is active.

The manual feedback trigger remains the guaranteed path.

## Use the signal, never the screenshot file

Never read the system screenshot or request photo/media-library access for this shortcut. On confirmation, capture the app's own view through its existing `RepaintBoundary`.

This avoids unrelated gallery access and produces a frame without status-bar/system overlays. Still show the captured image for review and removal before submit.

## Choose native integration deliberately

Before adding a package, inspect its current release, publisher, source, license, iOS Swift Package Manager support, Android API behavior, maintenance, and compatibility with the project's Flutter/Dart/iOS targets. Do not copy a stale version pin from this reference.

Prefer an implementation that:

- uses `UIApplication.userDidTakeScreenshotNotification` on iOS;
- uses Android's native screen-capture callback on API 34+;
- becomes a no-op on older Android versions rather than requesting broad photo/media permission;
- emits only an event and never a file path;
- supports the project's iOS dependency manager.

A small project-owned platform channel is reasonable when it avoids an unmaintained package. Either choice adds native code and requires a store build.

Run the iOS release build and Android release build before committing. Recent Flutter releases prefer Swift Package Manager; a plugin that forces CocoaPods into an SPM-only app is a meaningful architecture change, not a harmless dependency addition.

## Isolate the platform watcher

Wrap native integration so tests and unsupported platforms use a no-op:

```dart
abstract interface class ScreenshotWatcher {
  Future<bool> start(VoidCallback onScreenshot);
  Future<void> stop();
}

class NoopScreenshotWatcher implements ScreenshotWatcher {
  const NoopScreenshotWatcher();
  @override
  Future<bool> start(VoidCallback onScreenshot) async => false;
  @override
  Future<void> stop() async {}
}
```

The real watcher owns exactly one subscription, catches platform failures, cancels on dispose, and never throws into the app lifecycle.

## Gate every event

```dart
void onScreenshotSignal() {
  if (!mounted) return;
  if (!ref.read(feedbackScreenshotShortcutEnabledProvider)) return;
  if (!ref.read(feedbackButtonVisibleProvider)) return;
  if (feedbackOverlayActive.value || _confirming || _cooldownActive) return;
  unawaited(_offerFeedbackCapture());
}
```

Required gates:

- feature opt-in is on;
- feedback itself has not been hidden/disabled;
- no feedback/annotator/confirmation is already active;
- debounce/cooldown prevents duplicate OS events;
- current route is not marked sensitive (`feedbackCaptureAllowed == false`).

After confirmation, set the overlay-active flag before capture so a second event cannot nest annotators. Clear it in `finally`.

## Test-environment trap

Native event channels do not exist under `flutter test`. Some plugins report `MissingPluginException` while the stream is being activated, before a subscription's `onError` can handle it. Select the no-op provider before constructing or listening to the plugin:

```dart
bool get underFlutterTest =>
    !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

final screenshotWatcherProvider = Provider<ScreenshotWatcher>((ref) {
  if (kIsWeb || underFlutterTest) return const NoopScreenshotWatcher();
  if (defaultTargetPlatform != TargetPlatform.iOS &&
      defaultTargetPlatform != TargetPlatform.android) {
    return const NoopScreenshotWatcher();
  }
  return PlatformScreenshotWatcher();
});
```

Defensive `try/catch` inside `start()` is still useful, but it may not prevent a services-library error emitted during stream activation.

## Platform expectations

- iOS reports after the screenshot and exposes no screenshot file through this notification.
- Android API 34+ has a native screenshot callback. Older-version workarounds based on media-library observation may require sensitive permission and should be disabled by default.
- Screen recording and every OEM/device combination are not guaranteed to produce a signal.
- No signal is not an error; the manual trigger remains available.

## Delivery and verification

This cannot ship through Dart-only code push. Adding or changing native integration requires a new signed store build.

Test with a fake watcher and assert:

- opted-in signal opens only the confirmation;
- declining performs no capture;
- confirming captures the app view and opens a removable preview;
- disabled/hidden feedback, sensitive routes, active overlays, and rapid duplicate signals do nothing;
- disposal cancels the watcher;
- the normal Flutter widget test suite produces no platform-channel errors.
