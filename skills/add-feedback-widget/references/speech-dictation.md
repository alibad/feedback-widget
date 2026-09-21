# Speech-to-Text Transcription

Speech transcription turns the reporter's voice into editable text in the note
field. It is distinct from [voice-notes.md](voice-notes.md), which records an
audio file and uploads it. A polished widget may offer both, but label them as
different actions: **Transcribe** fills the text box; **Voice note** attaches
audio.

Enable transcription only when requested. Recognition may use a browser, OS,
or vendor speech service, so disclose that before listening. Do not retain or
attach recognition audio unless the reporter separately records a voice note.

## Experience contract

- Typing remains the guaranteed path. Unsupported recognition, denied
  permission, no speech, offline service, or an unexpected stop never blocks
  the form.
- Capture the existing note as a prefix when listening starts. Interim and
  final results append to that prefix and never replace typed content.
- Show interim words in the text area while the person is speaking. A mic with
  no visible text looks broken.
- Keep the text editable. If the person types while recognition is running,
  stop recognition before accepting the edit so the next partial result cannot
  overwrite their change.
- Show a persistent listening state with a red dot, `Listening…` copy, and a
  one-click **Stop listening** action. Announce state and errors with
  `aria-live="polite"`.
- Keep the active stop control visually compact. Preserve a 44px or larger tap
  target, but render only a 14–16px stop square inside an approximately 30–32px
  subtle active surface. Do not swap a mic for a precomposed `stop_circle`
  glyph or inflate the entire field suffix: the recording state must not take
  over the text box.
- On a browser-initiated end after silence, keep the text and show **Resume
  transcription**. Do not silently discard the last partial result or loop
  endlessly trying to restart a denied service.
- Stop recognition on close, reset, review, submit, unmount, and before starting
  another microphone feature. Voice recording and transcription are one-at-a-
  time capabilities.
- Enforce the note's character limit as results arrive. Stop cleanly at the
  limit and explain that the existing transcript is safe.
- Before submit, review the transcript as ordinary report text. Send no separate
  `transcript` field unless the backend contract explicitly needs one.

Suggested disclosure:

> Transcription may use your browser or device speech service. Audio is not
> attached; only the text you review is submitted.

## Web: Web Speech API with a safe fallback

The Web Speech API is not supported consistently across browsers. Feature-
detect both constructor names and keep the button disabled or marked
unavailable when neither exists:

```ts
type RecognitionConstructor = new () => Recognition;

const RecognitionApi =
  window.SpeechRecognition ?? window.webkitSpeechRecognition;

if (!RecognitionApi) {
  showStatus(
    "Live transcription is not supported in this browser. You can still type or add a voice note.",
  );
  return;
}
```

Do not preflight microphone access with `navigator.permissions.query()`. Start
recognition directly from the reporter's click and handle its result or error.
Some browsers process recognition remotely; do not describe it as on-device
unless the selected engine guarantees that.

### Preserve the prefix and render partial results

Web Speech result events can contain both final and interim alternatives. Keep
the prefix and final words in refs so React renders do not reset the session:

```ts
const prefixRef = useRef("");
const finalRef = useRef("");
const recognitionRef = useRef<Recognition | null>(null);

function startTranscription() {
  const RecognitionApi = getRecognitionConstructor();
  if (!RecognitionApi) return showUnsupported();

  const recognition = new RecognitionApi();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = document.documentElement.lang || navigator.language;

  prefixRef.current = noteRef.current.trimEnd();
  finalRef.current = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const words = event.results[i]?.[0]?.transcript ?? "";
      if (event.results[i]?.isFinal) {
        finalRef.current = `${finalRef.current} ${words}`.trim();
      } else {
        interim += words;
      }
    }

    const spoken = `${finalRef.current} ${interim}`.trim();
    const next = [prefixRef.current, spoken].filter(Boolean).join(" ");
    setNoteBounded(next); // updates noteRef and state; stops at the limit
  };

  recognition.onerror = (event) => {
    stopTranscription({ silent: true });
    showStatus(messageForRecognitionError(event.error));
  };

  recognition.onend = () => {
    recognitionRef.current = null;
    setListening(false);
    if (!stoppedByReporterRef.current) {
      showStatus(
        "Transcription paused after a quiet moment. Tap Resume transcription to continue.",
      );
    }
  };

  recognition.start();
  recognitionRef.current = recognition;
  setListening(true);
}
```

When the person resumes, capture the entire current note as the new prefix.
This prevents duplication and makes multiple short dictation sessions reliable.

### Error copy

Map errors to useful, non-blocking messages:

| Error | Message/behavior |
|---|---|
| `not-allowed`, `service-not-allowed` | Microphone/speech access was not allowed; typing and voice-note alternatives remain. |
| `no-speech` | No speech was detected; keep the text and offer Resume. |
| `audio-capture` | No microphone is available; keep typing usable. |
| `network` | The speech service is offline; preserve the draft. |
| unexpected/unknown | Recognition stopped; preserve text and offer Resume. |

`abort` after the widget itself calls `stop()` is not an error to show.

### Cleanup and concurrency

`stopTranscription()` should mark the end as intentional before calling
`recognition.stop()`, clear the ref, and update the listening state. Call it
from every close/reset/unmount path. Starting a voice note stops transcription;
starting transcription stops or disables voice recording. Do not allow two
browser microphone consumers to compete.

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

Dictation is not the same configuration as voice commands:

| | Commands | Dictation |
|---|---|---|
| `partialResults` | `false` | **`true`** |
| `onDevice` | often `true` | follow the disclosed privacy/availability policy |
| `listenMode` | `confirmation` | **`dictation`** |
| `pauseFor` | about 2s | **about 4s** |
| `listenFor` | about 8s | **about 2min** |

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

Check the installed package API before copying option syntax; it changes across
versions. Capture `_noteController.text.trim()` before starting and append every
running result to that prefix. Move the cursor to the end after each update.

Put the mic in or immediately beside the note field. Change the hint to
`Listening…`, use a conventional red active state, and preserve manual typing.
In Flutter, prefer `Icons.stop_rounded` at 14–16 logical pixels inside a
separate 44px `IconButton` tap target. Avoid `Icons.stop_circle_rounded`: its
built-in disc reads dramatically larger than the idle mic, especially inside a
`TextField.suffixIcon`.

Permissions:

- iOS: `NSMicrophoneUsageDescription` and
  `NSSpeechRecognitionUsageDescription`; missing the second can crash first use.
- Android: `RECORD_AUDIO`.

Pure Dart changes on top of an existing configured plugin may ship through the
app's code-push mechanism. Adding the plugin or native permission declarations
requires a new store build.

## Verification

Test at least:

1. typed prefix + interim + final results;
2. stop and resume without duplicated words;
3. typing during listening stops recognition before applying the edit;
4. denial, unsupported browser, no-speech, network error, and unexpected end;
5. character-limit stop;
6. close/reset/unmount cleanup;
7. transcription and voice note cannot run simultaneously;
8. review contains exactly the visible text and no hidden audio/transcript field.
