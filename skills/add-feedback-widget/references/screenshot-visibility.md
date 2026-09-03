# Screenshot Visibility — Hiding Widget During Capture

## Problem

When using the native Screen Capture API (`getDisplayMedia`), it captures actual screen pixels — including any visible feedback widget UI. This means the trigger button, "Continue feedback" pill, element select overlay tooltip, and recording indicators all appear in screenshots.

## Solution

Hide `#feedback-widget-root` before capturing, restore after:

```typescript
async function withWidgetHidden<T>(fn: () => Promise<T>): Promise<T> {
  const root = document.getElementById('feedback-widget-root');
  const previousDisplay = root?.style.display;
  if (root) root.style.display = 'none';
  try {
    // Invoke immediately so getDisplayMedia retains the click's activation.
    // captureNativeScreenshot waits for paint after acquiring the stream.
    return await fn();
  } finally {
    if (root) root.style.display = previousDisplay ?? '';
  }
}
```

## Where to Apply

Use `withWidgetHidden()` in ALL capture flows:

### Element Select click
```typescript
const cropped = await withWidgetHidden(async () => {
  const fullScreenshot = await captureNativeScreenshot();
  return cropToElement(fullScreenshot, rect);
});
store.addScreenshotToCapture(captureId, cropped);
```

### Pinpoint click
```typescript
// Marker is injected OUTSIDE the widget root, so it stays visible
const base64 = await withWidgetHidden(() => captureNativeScreenshot());
```

### Screenshot button
```typescript
const imageData = await withWidgetHidden(() => captureNativeScreenshot());
```

### Video recording start
Video recording uses `getDisplayMedia` for the stream, NOT a snapshot. The floating recording indicator SHOULD be visible during recording (it's useful UX). So do NOT use `withWidgetHidden` for video — just minimize the dialog before recording starts.

## Key Rules

1. **Always wrap `captureNativeScreenshot()` in `withWidgetHidden()`** — never call it directly
2. **Preserve user activation** — request the stream immediately; wait for paint only after the browser grants it, before copying pixels
3. **Always restore** — use try/finally to ensure display is restored even if capture is cancelled
4. **The pinpoint marker is NOT inside `#feedback-widget-root`** — it's injected directly on `document.body`, so it stays visible (which is correct)
5. **Do NOT hide for video recording** — the recording indicator should be visible while recording
6. **Preserve prior inline style** — restore the original `display` value, not an assumed empty string
