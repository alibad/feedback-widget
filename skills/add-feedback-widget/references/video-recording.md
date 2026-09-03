# Video Recording Implementation

## Overview

Screen recording with optional mic audio, using the same Screen Capture API as screenshots. Instead of grabbing one frame, we pipe the MediaStream into a `MediaRecorder` for up to 60 seconds.

**Desktop only** — mobile browsers don't support `getDisplayMedia`. Mobile users can upload a screen recording from their gallery.

## Recording flow

```typescript
const MAX_RECORDING_SECONDS = 60;

const startRecording = async () => {
  // CRITICAL: Minimize the dialog FIRST so user can see and interact
  // with the page during the entire recording. withWidgetHidden() alone
  // only hides momentarily for the getDisplayMedia prompt.
  store.minimize();

  try {
    // 1. Request directly from the click. Keep a visible stop indicator.
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        // @ts-expect-error -- preferCurrentTab is Chrome-only
        preferCurrentTab: true,
    });
    recordingStreamRef.current = displayStream;

    // 2. Optionally add mic audio
    // CRITICAL: Just call getUserMedia directly — NEVER pre-check with
    // navigator.permissions.query (returns stale/wrong state).
    // Also check Permissions-Policy header — see references/permissions-policy.md
    const tracks: MediaStreamTrack[] = [...displayStream.getVideoTracks()];
    if (includeMicrophone) { // explicit unchecked-by-default UI choice
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getTracks().forEach((track) => {
          displayStream.addTrack(track); // cleanup owns it immediately
          tracks.push(track);
        });
      } catch {
        // Mic denied — record without audio and accurately disclose this.
      }
    }

    const combinedStream = new MediaStream(tracks);
    recordingStreamRef.current = combinedStream;

    // 3. Handle browser "Stop sharing" button
    displayStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopRecording();
    });

    // 4. Set up MediaRecorder
    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].find((type) => MediaRecorder.isTypeSupported(type));

    const recorder = mimeType
      ? new MediaRecorder(combinedStream, { mimeType })
      : new MediaRecorder(combinedStream);
    mediaRecorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      const url = URL.createObjectURL(blob);
      store.setVideoBlob(blob);
      store.setVideoUrl(url);
      store.restore();
    };

    recorder.start(1000); // 1s chunks
    store.setIsRecording(true);
    store.setRecordingSeconds(0);

    // 5. Countdown timer with auto-stop
    let elapsed = 0;
    recordingTimerRef.current = setInterval(() => {
      elapsed += 1;
      store.setRecordingSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        stopRecording();
      }
    }, 1000);
  } catch {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    store.restore();
    toast.error('Recording cancelled or not supported');
  }
};
```

## Stop recording

```typescript
const stopRecording = () => {
  if (mediaRecorderRef.current?.state !== 'inactive') {
    mediaRecorderRef.current?.stop();
  }
  if (recordingTimerRef.current) {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }
  if (recordingStreamRef.current) {
    recordingStreamRef.current.getTracks().forEach((t) => t.stop());
    recordingStreamRef.current = null;
  }
  store.setIsRecording(false);
};
```

## Store fields

```typescript
// State
videoBlob: Blob | null;
videoUrl: string | null;   // Object URL for preview
isRecording: boolean;
recordingSeconds: number;

// Actions
setVideoBlob: (blob: Blob | null) => void;
setVideoUrl: (url: string | null) => void;
setIsRecording: (val: boolean) => void;
setRecordingSeconds: (val: number) => void;
removeVideo: () => void;  // Revokes object URL + clears state
```

Remember to revoke `videoUrl` via `URL.revokeObjectURL()` in `close()`, `reset()`, `removeVideo()`, and after successful submit.

## Floating recording indicator

While recording, show a floating pill at bottom-right with:
- Pulsing red dot (recording indicator)
- Countdown timer showing remaining time (e.g., "0:42")
- Shrinking progress bar
- Stop button

The recording indicator replaces the minimized pill while recording is active.

## Video preview

After recording stops, show inline `<video>` element with native controls in the feedback dialog. Include:
- **Download link** — `<a href={videoUrl} download="screen-recording.webm">` so users can save the recording locally
- **Delete button** — must use `ConfirmDialog` (NOT `confirm()`) since recordings take effort to create. Accidental deletion is frustrating

## UX copy

- Button label: `Record`; show the 60-second limit in supporting copy and the active countdown
- Countdown shows remaining time, not elapsed
- When timer hits 10s, the progress bar turns visually shorter (natural urgency)
- Auto-stop message: recording just saves silently, no "limit reached" toast

## Upload boundary

Recordings usually exceed comfortable JSON/serverless body limits. Use the authorized direct-upload flow in [storage-strategy.md](storage-strategy.md), then send an opaque attachment ID. Keep storage private by default and never accept a client-provided media URL.

## Browser support

Same as screenshots:
- **Chrome/Edge**: Full support with preferCurrentTab
- **Firefox**: Works, user picks from tab list
- **Safari**: Unreliable — hide Record button or let it fail gracefully
- **Mobile**: NOT SUPPORTED — no Record button on mobile

## Key rules

1. **Minimize dialog before recording** — request `getDisplayMedia` directly from the click, then keep a visible recording/stop indicator; do not hide it for the recording
2. **Handle "Stop sharing" browser button** — listen for `ended` event on video track
3. **Auto-stop at 60 seconds** — countdown timer with `clearInterval` cleanup
4. **Always stop all tracks** — in `stopRecording`, `useEffect` cleanup, and component unmount
5. **Revoke object URLs** — prevent memory leaks in close/reset/removeVideo
6. **Microphone off by default** — request separately only after an explicit choice, so denial doesn't kill recording
7. **NEVER pre-check mic with `permissions.query`** — just call getUserMedia directly (see `references/voice-notes.md`)
8. **Check Permissions-Policy header** — must be `microphone=(self)` not `microphone=()` (see `references/permissions-policy.md`)
9. **Capability-gated** — render only when `getDisplayMedia`, `MediaRecorder`, and the layout/input experience are supported
10. **Review before submit** — the chosen surface may include unrelated or sensitive information
