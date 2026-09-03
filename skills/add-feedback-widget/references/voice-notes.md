# Voice Notes Implementation

## Overview

Audio-only recording via `getUserMedia({ audio: true })`. Unlike video recording, this does NOT use `getDisplayMedia` — no screen capture involved, so it works on **both desktop and mobile**.

The dialog stays open during audio recording (no need to minimize since there's no screen capture).

## Recording flow

```typescript
const MAX_AUDIO_RECORDING_SECONDS = 600; // 10 minutes

const startAudioRecording = async () => {
  try {
    // CRITICAL: Just call getUserMedia directly. NEVER pre-check with
    // navigator.permissions.query — it returns stale/wrong state.
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStreamRef.current = micStream; // own tracks before recorder construction

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

    const recorder = new MediaRecorder(micStream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      micStream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      store.setAudioBlob(blob);
      store.setAudioUrl(url);
    };

    recorder.start(1000);
    audioRecorderRef.current = recorder;
    audioStreamRef.current = micStream;
    store.setIsAudioRecording(true);
    store.setRecordingSeconds(0);

    // Countdown timer with auto-stop
    let elapsed = 0;
    audioTimerRef.current = setInterval(() => {
      elapsed += 1;
      store.setRecordingSeconds(elapsed);
      if (elapsed >= MAX_AUDIO_RECORDING_SECONDS) {
        stopAudioRecording();
      }
    }, 1000);
  } catch {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    store.setIsAudioRecording(false);
    toast.error('Audio recording is unavailable. You can still type your report.');
  }
};
```

## Stop audio recording

```typescript
const stopAudioRecording = () => {
  if (audioRecorderRef.current?.state !== 'inactive') {
    audioRecorderRef.current?.stop();
  }
  if (audioTimerRef.current) {
    clearInterval(audioTimerRef.current);
    audioTimerRef.current = null;
  }
  if (audioStreamRef.current) {
    audioStreamRef.current.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
  }
  store.setIsAudioRecording(false);
};
```

## Store fields

```typescript
// State
audioBlob: Blob | null;
audioUrl: string | null;   // Object URL for preview
isAudioRecording: boolean;
recordingSeconds: number;  // Shared with video (only one records at a time)

// Actions
setAudioBlob: (blob: Blob | null) => void;
setAudioUrl: (url: string | null) => void;
setIsAudioRecording: (val: boolean) => void;
removeAudio: () => void;  // Revokes object URL + clears state
```

Remember to revoke `audioUrl` via `URL.revokeObjectURL()` in `close()`, `reset()`, `removeAudio()`, and after successful submit.

## UI — Inline recording indicator

While recording audio, show an inline indicator inside the dialog (NOT floating — dialog stays open):
- Pulsing red dot
- Countdown timer showing remaining time (e.g., "9:42")
- Shrinking progress bar
- Stop button

## Audio preview

After recording stops, show inline `<audio>` element with native controls. Include a delete button to re-record.

## UX copy

- Desktop button label: `Voice (10m)` — sets expectation upfront
- Mobile button label: `Voice Note (10m)` — more descriptive for touch
- Countdown shows remaining time, not elapsed
- Auto-stop at 10 minutes — recording saves silently

## Microphone permission — CRITICAL

**NEVER use `navigator.permissions.query({ name: 'microphone' })` to pre-check.**

This API returns stale/incorrect state in many browsers. It may report `denied` even when the user has explicitly allowed microphone access in site settings. If you pre-check and get `denied`, you'll skip `getUserMedia` entirely and the user will never see a permission prompt.

**Correct approach:** Just call `getUserMedia({ audio: true })` directly inside a try/catch:
- If permission is needed, the browser shows the prompt
- If already granted, it succeeds immediately
- If truly denied, it throws `NotAllowedError`

**Also check `Permissions-Policy` header** — see `references/permissions-policy.md`. If the server sends `Permissions-Policy: microphone=()`, the browser will silently block `getUserMedia` without any prompt.

## Upload boundary

Use [storage-strategy.md](storage-strategy.md). For small clips that fit the verified route limit, a bounded server upload is acceptable. Otherwise request an authorized attachment ID, upload directly to its fixed private key, and send the ID with the report. Do not send arbitrary URLs or expose a public object by default.

## Browser support

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Works (getUserMedia is well-supported across all browsers)
- **Mobile browsers**: commonly supported, but feature-detect `getUserMedia` and `MediaRecorder` and keep text feedback available

## Key rules

1. **Dialog stays open** — no minimize needed (no screen capture involved)
2. **NEVER pre-check with permissions.query** — just call getUserMedia directly
3. **Check Permissions-Policy header** — `microphone=(self)` not `microphone=()`
4. **Auto-stop at 10 minutes** — countdown timer with `clearInterval` cleanup
5. **Always stop all tracks** — in stopAudioRecording, useEffect cleanup, and component unmount
6. **Revoke object URLs** — prevent memory leaks in close/reset/removeAudio
7. **Works on mobile** — show Voice Note button on mobile (unlike screenshot/video)
8. **Separate state from video** — `audioBlob`/`audioUrl` are independent from `videoBlob`/`videoUrl`
9. **Disclose and preview** — recording starts only from the user's tap, shows a persistent recording state, and remains removable before submit
10. **One recorder at a time** — stop/disable screen recording while voice recording is active and vice versa
