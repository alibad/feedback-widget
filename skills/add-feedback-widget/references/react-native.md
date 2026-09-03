# React Native / Expo Feedback Widget

The entry skill targets web by default. React Native has no DOM or browser Screen Capture API, and GitHub/Linear credentials must never enter the app bundle. Use this reference for native UI/capture while keeping the entry skill's security, backend, storage, and verification rules. Select the destination through [issue-providers.md](issue-providers.md); [linear.md](linear.md) applies equally to the native server bridge.

## When this applies — detect the platform first

React Native / Expo if `package.json` has `react-native` and/or `expo`, there's an `app.json` / `app.config.js`, and there is **no** Next.js / `app/` web router. In a mixed monorepo, build each platform separately; they can share the server contract and configured tracker inbox.

## Web concept → React Native equivalent

| Web (rest of skill) | React Native | Notes |
|---|---|---|
| DevTools element select (`elementFromPoint`) | ✗ none | No DOM. Drop element-select entirely |
| `getDisplayMedia` screenshot | `react-native-view-shot` (capture a ref) and/or `expo-image-picker` | No Screen Capture API on RN |
| html2canvas / canvas annotator | ✗ skip | Use the OS screenshot + photo upload instead |
| `getUserMedia` + `MediaRecorder` voice | `expo-av` (record) + `expo-speech-recognition` (on-device transcribe) | |
| File drop zone | `expo-document-picker` | |
| Page HTML snapshot | recent in-app **logs** + route + device/app meta | No HTML; capture JS console buffer instead |
| Server issue adapter → GitHub/Linear | **backend bridge** (app holds NO secrets) | See "Delivery" below |
| `Permissions-Policy` header | native `Info.plist` / `AndroidManifest` usage strings via config plugins | |

## Delivery — the app must NOT create issues directly (CRITICAL)

A mobile bundle is extractable. **Never embed GitHub or Linear credentials in a React Native app.** Issue creation happens server-side. Two patterns, in order of preference:

1. **Backend bridge (recommended).** The app authenticates to a server endpoint that holds the selected tracker's credentials. Media uses the private/authorized flow in `storage-strategy.md`; the bridge receives opaque attachment IDs, not arbitrary URLs.
   - **Reuse the web `references/api-route.md` route** if the project already has one — it accepts a generic feedback payload and creates the issue. The app adds `source: 'app'` and authorized attachment IDs, never raw media URLs.
   - Or a **Cloud Function** (Firebase `functions/`) that ports the same logic.
2. **Email fallback (optional).** Use only when the user asked for it and the host already has a protected server-side transactional path. Do not send directly from client credentials or treat email as durable retry storage.
   - Email-only feedback does not create a tracker issue. Disclose the fallback and never silently copy a report to a different destination.

### Multi-surface labeling (when one inbox serves web + app)

Every issue gets `feedback` + a **`source:*`** label and a `[source]` title prefix so issues stay filterable by origin:

- Labels: configured `feedback` + `source:app` (or `source:web`) + a category; Linear uses validated label UUIDs, not GitHub label names.
- Title: `[app] <Category>: <short summary>` — e.g. `[app] Bug: settings reset after relaunch`.
- A shared private inbox is a useful default, but preserve an existing per-product repository decision. Never route customer data to a public repository without explicit approval.
- A GitHub retry without labels is allowed only after a confirmed pre-creation label validation failure. Do not retry arbitrary 422s or uncertain Linear creates. Verify labels during authorized setup.

## The floating bubble

A draggable FAB rendered once near the app root (inside the navigation/theme providers so `usePathname()` and theme work).

- **Draggable** via `PanResponder` + `Animated.ValueXY`; persist the last position to `AsyncStorage` (`@feedback_bubble_pos`) and restore on mount.
- **Long-press to hide** → confirm with the project's dialog (NOT `Alert.alert` if a themed dialog exists) → persist `@feedback_bubble_hidden`; offer a re-enable toggle in Settings/Profile.
- Render it once, globally — not per screen.

## Beta-gate the bubble (don't ship it to everyone)

```ts
// lib/feedback/bubbleVisibility.ts
export const FEEDBACK_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_FEEDBACK === '1';
```

Set `EXPO_PUBLIC_FEEDBACK=1` only in the intended beta/internal build profile. Production store builds ship without the bubble unless explicitly enabled. This flag controls UI only: the backend still requires authorization, validation, and rate limiting.

## The modal — KEYBOARD AVOIDANCE (the #1 RN feedback bug)

A bottom-sheet `Modal` does **not** move out of the way of the keyboard on its own. On iOS the keyboard is an overlay and slides **over** the sheet, hiding the text input, attach row, and the **Send** button — users literally can't see what they type or submit. Always wrap the sheet:

```tsx
import { Modal, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

<Modal visible={open} animationType="slide" transparent onRequestClose={close}>
  <KeyboardAvoidingView
    style={styles.overlay}                               // { flex: 1, justifyContent: 'flex-end' }
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}  // Android resizes via adjustResize
  >
    <View style={styles.sheet}>                          // { maxHeight: '88%', paddingBottom: 24 + insets.bottom }
      <ScrollView keyboardShouldPersistTaps="handled">   // taps on Send/attach work without a dismiss
        {/* category chips, <TextInput multiline>, attach buttons, Submit */}
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

- `behavior="padding"` on iOS, `undefined` on Android (Android's `adjustResize` already resizes the window).
- `keyboardShouldPersistTaps="handled"` so the first tap on a button isn't swallowed by keyboard dismissal.
- Use `useSafeAreaInsets()` for bottom padding (home indicator) and respect the notch.

## Native capture (replaces web screenshot/video/voice)

- **Photos / screenshots**: `expo-image-picker` (`launchImageLibraryAsync` / `launchCameraAsync`). The OS screenshot (power+volume) is pixel-perfect — let users attach from the camera roll. Optionally auto-capture the current screen with `react-native-view-shot` (`captureRef`). No annotator.
- **Voice notes**: `expo-av` `Audio.Recording` for the clip; `expo-speech-recognition` for on-device transcription that drops into the text box. Commit the transcript on `end`, not on every partial (avoids `TextInput` flicker).
- **Files**: `expo-document-picker` (`getDocumentAsync`).
- **Upload**: request a server-authorized opaque object key/attachment ID, upload within the authenticated user's tenant prefix, and send only the attachment ID to the bridge. Keep storage private by default. Do not use original filenames as keys or accept a client-provided URL.

## Diagnostics & context to attach

Mobile has no HTML snapshot — capture the equivalents:

- **Recent in-app logs**: optional and off by default. Reuse an existing scrubbed log buffer or collect only during an explicitly enabled feedback session; redact and bound it.
- **Device / app meta**: `expo-constants` / `expo-application` (app version + build number), `Platform.OS` + `Platform.Version`, device model (`expo-device`), screen size.
- **Route**: `usePathname()` from `expo-router` — the screen the user was on.
- **User**: derive identity server-side. Do not send or render client-provided email/IDs unless the product explicitly needs them.

Map only approved, redacted fields into the issue. Sensitive diagnostics use private attachment storage and retention, not the issue body.

## Native permissions

Declare usage strings via Expo config plugins in `app.json` (camera, microphone, speech recognition, photo library). Example: the `expo-speech-recognition` plugin's `microphonePermission` / `speechRecognitionPermission`, and `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` in `ios.infoPlist`. Missing strings = silent permission failures or App Store rejection.

## Shipping fixes to the widget (OTA)

Widget tweaks are usually **JS-only**, so they can ship over-the-air with `eas update` **instead of a new TestFlight/Play build** — but only if:

1. `expo-updates` is installed and configured (`updates.url` + `runtimeVersion` in app config, a `channel` per EAS build profile), **and**
2. the installed build was compiled **with** `expo-updates`. A build made before OTA was set up can never receive updates — only the first build that bundles `expo-updates` onward is OTA-capable.

If OTA isn't configured, a JS-only widget fix still requires a new native build. Adding a native capture dependency always requires a new build.

## What NOT to do (React Native)

- **Never** put a GitHub App private key or PAT in the app bundle — issue creation is server-side only.
- Don't reach for `getDisplayMedia`, `html2canvas`, `elementFromPoint`, or any DOM API — they don't exist in RN.
- Don't forget `KeyboardAvoidingView` around the feedback sheet — it's the most common RN feedback bug.
- Don't ship the bubble unguarded to production — gate on `__DEV__ || EXPO_PUBLIC_FEEDBACK === '1'`.
- Don't silently fall back to email or another tracker; use the configured GitHub/Linear adapter via the bridge with `source:app`.
- Don't commit transcripts on every partial speech result — commit once on `end` to avoid `TextInput` flicker.
- Don't upload base64 to the bridge — use the authorized storage flow and send opaque attachment IDs.
- Don't rely on App Check, a beta flag, or a hidden bubble as endpoint authorization — validate the user and enforce quotas server-side.
