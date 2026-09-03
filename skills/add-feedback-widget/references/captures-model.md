# Unified Captures Model

## Overview

Instead of separate `screenshots[]` and `pinpointData` fields, the feedback store uses a single `captures[]` array. Each capture can hold element info, a screenshot, or both — and either part can be removed independently.

This design ensures:
- Users can select multiple elements (not just one)
- Each selection's element info and screenshot are linked in the tracker issue
- Users can remove a screenshot without losing the element info, or vice versa
- Standalone screenshots (from Screenshot button, upload, paste) also live in captures

## Data Model

```typescript
export interface FeedbackCapture {
  id: string;
  elementInfo?: string;        // e.g. "<button#submit.primary> 120×40 — "Save""
  position?: { x: number; y: number };
  screenshot?: string;         // transient draft data URI/object URL; never persist
  attachmentId?: string;       // server-authorized upload reference, when used
}
```

## Store Actions

```typescript
// Create a capture with element info, returns its id
addCapture: (capture: Omit<FeedbackCapture, 'id'>) => string;

// Link a screenshot to an existing capture (after async screen capture)
addScreenshotToCapture: (id: string, screenshot: string) => void;

// Convenience: create a standalone capture with just a screenshot
addScreenshot: (screenshot: string) => void;

// Remove by index
removeCapture: (index: number) => void;

// Remove just the screenshot — auto-deletes capture if both gone
removeCaptureScreenshot: (id: string) => void;

// Remove just the element info — auto-deletes capture if both gone
removeCaptureElement: (id: string) => void;
```

## ID Generation

Use a simple counter + timestamp to ensure uniqueness within a session:

```typescript
let captureIdCounter = 0;
function nextCaptureId(): string {
  return `cap_${++captureIdCounter}_${Date.now()}`;
}
```

## Auto-cleanup on removal

When removing one part, filter out captures where both parts are gone:

```typescript
removeCaptureScreenshot: (id) =>
  set((state) => ({
    captures: state.captures
      .map((c) => (c.id === id ? { ...c, screenshot: undefined, attachmentId: undefined } : c))
      .filter((c) => c.elementInfo || c.screenshot || c.attachmentId),
  })),
```

## Usage Patterns

Removing a screenshot also removes its pending attachment reference and revokes any object URL. Cancel pending uploads or mark them for cleanup so a removed image is never sent later. Preserve captures with a remaining attachment when removing element metadata. Ignore late capture/recording callbacks after cancel, close, unmount, or a new draft by checking a session generation ID before writing state.

### Element Select click
```typescript
const captureId = store.addCapture({ elementInfo, position: { x, y } });
// ... async screenshot capture ...
store.addScreenshotToCapture(captureId, croppedScreenshot);
// If screenshot is cancelled, element info still exists in the capture
```

### Pinpoint click
```typescript
const captureId = store.addCapture({ elementInfo, position: { x, y } });
// ... inject marker, capture screenshot ...
store.addScreenshotToCapture(captureId, screenshot);
```

### Screenshot button / Upload / Paste
```typescript
store.addScreenshot(base64); // standalone capture, no element info
```

## Rendering in Dialog

Each capture renders as a card:

```
┌──────────────────────────────────────────┐
│ 🖱️ <button#submit.primary> 120×40    ✕ │  ← element info row (removable)
├──────────────────────────────────────────┤
│ [screenshot thumbnail]                 ✕ │  ← screenshot row (removable)
└──────────────────────────────────────────┘
```

- Element info row: blue `MousePointer` icon + code info + X button
- Screenshot row: thumbnail (click for lightbox) + X button
- Either row can be independently removed
- If a capture has only one part, it renders as a single row — no border separator needed

## API payload boundary

Submit captures as an array (not separate screenshots/pinpointData). Core sends metadata only. Media mode should prefer an opaque `attachmentId`; use a bounded data URI only when the selected server upload path accepts it.

```typescript
body: JSON.stringify({
  captures: state.captures.map((c) => ({
    elementInfo: c.elementInfo,
    position: c.position,
    attachmentId: c.attachmentId,
  })),
  // ... other fields
})
```

## Issue Rendering

Each capture renders as a numbered selection with linked context:

```markdown
## Selections & Screenshots

### Selection 1
**Element:** `<button#submit.primary> 120×40 — "Save"`
**Position:** (450, 320)
![Capture 1](uploaded-url)

### Selection 2
**Element:** `<div#header.nav> 1200×60`

### Selection 3
![Capture 3](uploaded-url)
```

This makes it clear which screenshots correspond to which element selections. Resolve attachment IDs to reviewer-authorized links on the server; do not let the client supply issue URLs.
