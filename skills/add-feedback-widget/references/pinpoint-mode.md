# Pinpoint Mode Implementation

## Overview

Pinpoint mode lets users click on a specific UI element to report. It captures element metadata (tag, id, classes) and takes a screenshot with a visible crosshair marker at the clicked position.

## Flow

1. User clicks "Pinpoint" button → overlay covers viewport, custom crosshair cursor follows mouse
2. User clicks an element → element info captured, crosshair marker injected into DOM
3. Native screenshot captured with marker visible → marker removed → screenshot added to feedback

## Live crosshair overlay

```tsx
{store.isPinpointing && (
  <div
    id="feedback-pinpoint-overlay"
    className="fixed inset-0 z-99999"
    style={{ cursor: 'none' }}
    onClick={handlePinpointClick}
    onPointerMove={(e) => setPinpointCursor({ x: e.clientX, y: e.clientY })}
    onPointerLeave={() => setPinpointCursor(null)}
  >
    {pinpointCursor && (
      <svg
        className="pointer-events-none fixed"
        style={{ left: pinpointCursor.x - 24, top: pinpointCursor.y - 24, width: 48, height: 48 }}
        viewBox="0 0 48 48"
      >
        <circle cx="24" cy="24" r="18" fill="none" stroke="#EF4444" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="3" fill="#EF4444" />
        <line x1="24" y1="2" x2="24" y2="14" stroke="#EF4444" strokeWidth="2.5" />
        <line x1="24" y1="34" x2="24" y2="46" stroke="#EF4444" strokeWidth="2.5" />
        <line x1="2" y1="24" x2="14" y2="24" stroke="#EF4444" strokeWidth="2.5" />
        <line x1="34" y1="24" x2="46" y2="24" stroke="#EF4444" strokeWidth="2.5" />
      </svg>
    )}

    {/* Instruction banner */}
    <div className="absolute top-4 left-1/2 -translate-x-1/2 ...">
      Click on the element you want to report
      <button onClick={cancel}>✕</button>
    </div>
  </div>
)}
```

## Click handler

```typescript
const handlePinpointClick = async (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const clickX = e.clientX;
  const clickY = e.clientY;

  // 1. Detect element under click (hide overlay's pointer-events first)
  const overlay = document.getElementById('feedback-pinpoint-overlay');
  if (overlay) overlay.style.pointerEvents = 'none';
  const target = document.elementFromPoint(clickX, clickY) as HTMLElement;
  if (overlay) overlay.style.pointerEvents = '';

  // Reuse isExcludedTarget/safeLabel from element-select.md.
  if (isExcludedTarget(target)) {
    store.setIsPinpointing(false);
    store.restore();
    toast.error('This area is excluded from feedback capture.');
    return;
  }

  // 2. Build element selector string
  const elementInfo = target
    ? `<${target.tagName.toLowerCase()}> ${safeLabel(target)}`
    : 'unknown';

  // 3. Create capture with element info (unified captures model) and close overlay
  const captureId = store.addCapture({ elementInfo, position: { x: clickX, y: clickY } });
  store.setIsPinpointing(false);

  // 4. Inject visible crosshair marker into DOM
  const marker = document.createElement('div');
  marker.id = 'feedback-pinpoint-marker';
  marker.style.cssText = `position:fixed;left:${clickX - 24}px;top:${clickY - 24}px;z-index:99998;pointer-events:none;`;
  marker.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="18" fill="rgba(239,68,68,0.15)" stroke="#EF4444" stroke-width="2.5"/>
    <circle cx="24" cy="24" r="3" fill="#EF4444"/>
    <line x1="24" y1="2" x2="24" y2="14" stroke="#EF4444" stroke-width="2.5"/>
    <line x1="24" y1="34" x2="24" y2="46" stroke="#EF4444" stroke-width="2.5"/>
    <line x1="2" y1="24" x2="14" y2="24" stroke="#EF4444" stroke-width="2.5"/>
    <line x1="34" y1="24" x2="46" y2="24" stroke="#EF4444" stroke-width="2.5"/>
  </svg>`;
  document.body.appendChild(marker);

  // 5. Request capture directly in the click handler; capture waits for paint
  // after the browser grants the stream, preserving user activation.
  try {
    // withWidgetHidden() hides trigger button + minimized pill during capture
    const base64 = await withWidgetHidden(() => captureNativeScreenshot());
    store.addScreenshotToCapture(captureId, base64);
  } catch {
    // Screenshot cancelled — element info is still captured in the capture
  } finally {
    marker.remove();
    store.restore();
  }
};
```

## Key rules

- **Marker uses `position: fixed`** — since the native Screen Capture API captures actual screen pixels, fixed positioning works correctly (unlike html2canvas which mishandles it)
- **Always set `pointer-events: none` on overlay before `elementFromPoint`** — otherwise you detect the overlay div, not the page element
- **Always remove marker after capture** — in both success and catch paths
- **Always call `store.restore()`** — to re-open the feedback dialog after capture
- **Exclude private regions** — do not target or capture `[data-feedback-private]`; browser-level capture cannot safely redact arbitrary pixels

## Pinpoint is desktop-only

On mobile (touch devices), pinpoint mode is hidden because:
- No hover cursor on touch devices (no visual crosshair feedback)
- `elementFromPoint` is unreliable with touch
- The Screen Capture API is not available on mobile
