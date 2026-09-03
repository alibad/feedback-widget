# Screenshot Capture Implementation

## Use the Native Screen Capture API when Media mode is enabled

**NEVER use html2canvas or any DOM-to-canvas library.** These re-render the DOM to canvas, which breaks `position: fixed` elements (navbars), scroll position, backdrop-blur, CSS transforms, and more.

Use the browser's **Screen Capture API** (`navigator.mediaDevices.getDisplayMedia`) after a direct user action. It captures the surface the user chooses, which may be a tab, window, or screen. Explain that they should choose the current tab and always show a removable preview before submit.

## Core capture function

```typescript
const captureNativeScreenshot = async (): Promise<string> => {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('capture_unsupported');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' } as MediaTrackConstraints,
    // @ts-expect-error -- preferCurrentTab is Chrome-only, not in TS types yet
    preferCurrentTab: true,
  });
  const video = document.createElement('video');
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('capture_missing_track');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!video.videoWidth || !video.videoHeight) throw new Error('capture_empty_frame');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
};
```

## Screenshot button flow

```typescript
const captureScreenshot = async () => {
  // Minimize dialog so it's not in the screenshot
  store.minimize();
  try {
    // withWidgetHidden() hides trigger button + minimized pill during capture
    const imageData = await withWidgetHidden(() => captureNativeScreenshot());
    store.restore();
    if (isMobile) {
      store.addScreenshot(imageData);
    } else {
      setAnnotatingImg(imageData); // Open annotation editor
    }
  } catch (error) {
    store.restore();
    if ((error as DOMException)?.name !== 'AbortError') {
      toast.error('Screenshot was not added. You can still send text feedback.');
    }
  }
};
```

See `screenshot-visibility.md` for the `withWidgetHidden()` implementation. `minimize()` hides the dialog for the duration; `withWidgetHidden()` also hides the trigger button and minimized pill during the actual capture moment.

## How it works

1. `getDisplayMedia` asks the browser to share the screen
2. `preferCurrentTab: true` is only a hint in supporting Chromium browsers; the user remains in control of the chosen surface
3. `displaySurface: 'browser'` hints to capture a browser tab (not window or screen)
4. We feed the stream into a `<video>` element, draw one frame to canvas, then stop the stream
5. Result: a PNG of the selected surface, shown to the reporter for review/removal

## Why this is better than html2canvas

| Issue | html2canvas | Screen Capture API |
|---|---|---|
| `position: fixed` navbar | Renders at wrong position when scrolled | Captures actual pixels — always correct |
| Scroll position | Crop math breaks, captures wrong viewport | Captures what user actually sees |
| `backdrop-blur` | Not supported, renders wrong | Perfect |
| CSS transforms | Often broken | Perfect |
| Custom fonts | Sometimes missing | Perfect |
| Performance | Slow (re-renders entire DOM) | Fast (native browser capture) |
| Dependencies | Requires html2canvas-pro npm package | Zero dependencies — built into browser |

## Browser support

- **Chrome/Edge**: Full support with `preferCurrentTab` (one-click capture)
- **Firefox**: Supported but no `preferCurrentTab` (user must select tab from picker)
- **Safari**: Limited support — user may need to use Upload instead
- **Mobile browsers**: NOT SUPPORTED — use file upload on mobile (see `mobile-experience.md`)

## Tradeoff

The browser always controls the picker and may let the reporter choose another tab, window, or screen. Do not imply the widget can silently capture the current page. For element cropping, verify the captured dimensions/surface are plausible and let the reporter discard an incorrect crop.

## Key rules

1. **Always minimize the dialog before capture** — `store.minimize()` so it doesn't appear in the screenshot
2. **Always restore after capture** — `store.restore()` in both success and catch paths
3. **Always stop the video track** — `track.stop()` to release the capture stream
4. **On mobile, skip entirely** — use file upload button instead (Screen Capture API not available)
5. **Preview before submit** — the chosen surface may contain unrelated or sensitive information
6. **Mask private regions where app-generated capture supports it** — browser-level screen capture cannot reliably redact pixels after the fact
