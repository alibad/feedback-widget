# Speech Dictation (mobile)

Distinct from [voice-notes.md](voice-notes.md), which records an **audio file**
and uploads it. This turns speech into **text in the note field**, so the report
arrives as a searchable GitHub or Linear issue rather than an attachment
somebody has to listen to.

Enable dictation only when requested. It may use an OS/vendor speech service,
so disclose whether recognition is on-device or may send audio for processing.

## Why

Dictation can make reporting easier when typing is inconvenient. Keep text input
available and preserve anything the reporter has already written.

## Flutter

Reuse the app's existing speech engine. If none exists, adding a native speech
dependency and platform permissions is a separate product/dependency decision.

```dart
abstract interface class FeedbackDictation {
  bool get isListening;
  Future<bool> start({
    required void Function(String words) onWords,
    required void Function(String message) onError,
    required void Function(bool listening) onListeningChanged,
  });
  Future<void> stop();
}
```

### The settings that matter

Dictation is **not** the same configuration as voice *commands*, and copying the
command settings gives a bad experience:

| | Commands | Dictation |
|---|---|---|
| `partialResults` | `false` | **`true`** — words must appear while speaking, or people assume it is broken and stop |
| `onDevice` | often `true` | choose from the app's privacy/availability policy; cloud recognition may improve prose but can transmit audio |
| `listenMode` | `confirmation` | **`dictation`** |
| `pauseFor` | ~2s | **~4s** — people pause mid-sentence to think |
| `listenFor` | ~8s | **~2min** |

```dart
listenOptions: speech.SpeechListenOptions(
  partialResults: true,
  onDevice: feedbackSpeechPolicy.onDevice,
  cancelOnError: false,
  listenMode: speech.ListenMode.dictation,
  pauseFor: const Duration(seconds: 4),
  listenFor: const Duration(minutes: 2),
),
```

Check the installed package API before copying constructor/option syntax; it has
changed across versions.

## Append, never replace

```dart
_dictationPrefix = _noteController.text.trim();
await dictation.start(
  onWords: (words) {
    final prefix = _dictationPrefix;
    _noteController.text = prefix.isEmpty ? words : '$prefix $words';
    _noteController.selection =
        TextSelection.collapsed(offset: _noteController.text.length);
  },
  ...
);
```

Partial results arrive as the **whole running transcript**, so assigning
`controller.text = words` directly would wipe anything already typed the instant
someone taps the mic. Capture the prefix once at start.

Also move the cursor to the end, or the field scrolls back to the top mid-speech.

## Never a dead end

Every failure path must still leave the person able to type:

```dart
if (!_initialized) {
  onError('Dictation is unavailable on this device. Type your report.');
  return false;   // the text field is untouched and still focused
}
```

Denied microphone permission, no speech engine, offline, or cloud recognition
being unavailable — all of these are a
snackbar and a working text field, never a blocked dialog. The mic is a
shortcut; typing is the guarantee.

## UI

Put the mic in the note field's `suffixIcon`, not as a separate button — it
belongs to the field it fills.

```dart
suffixIcon: IconButton(
  onPressed: _submitting ? null : _toggleDictation,
  tooltip: _listening ? 'Stop dictating' : 'Speak your report',
  icon: Icon(
    _listening ? Icons.stop_circle_rounded : Icons.mic_rounded,
    color: _listening ? Colors.redAccent : Colors.white70,
  ),
),
```

Change the hint to `'Listening…'` while active. Red while recording is the one
piece of colour convention nobody has to learn.

## Permissions and disclosure

| | |
|---|---|
| iOS | `NSMicrophoneUsageDescription` **and** `NSSpeechRecognitionUsageDescription` — missing the second one crashes on first use, not at review |
| Android | `RECORD_AUDIO` |

Request permission only after the user taps the mic. Before first use, state
whether recognition stays on-device or may be processed by the platform speech
service. Do not retain or attach recognition audio unless the user separately
records a voice note.

## This ships over the air

Pure Dart changes on top of an existing, already-configured plugin may ship by
the app's code-push mechanism. Adding the plugin, permissions, or native config
requires a new store build — as does the native shortcut in
[screenshot-gesture-trigger.md](screenshot-gesture-trigger.md).
