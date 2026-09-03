# Select Element Implementation

## Overview

DevTools-like element inspector for web feedback. In Core mode it records bounded, non-sensitive element metadata only. When Media mode and safe storage are configured, it can also capture a cropped screenshot.

Users hover over page elements to see a highlight and summary, then click to select. Never collect form values, password/payment content, hidden text, or content inside `[data-feedback-private]`. Prefer stable app-provided identifiers (`data-testid`, component/route labels) over long class lists or copied text.

## Split Button UI

Select and Pinpoint share a single split button. Clicking the main area activates the current mode. A small chevron dropdown toggles between modes.

```
┌──────────────────┬────┐
│ 🖱️ Select       │ ▾  │   ← Default mode
└──────────────────┴────┘

Dropdown (on chevron click):
┌──────────────────────────┐
│ 🖱️ Select Element       │  ← highlighted
│ ⊕ Pinpoint              │
├──────────────────────────┤
│ Esc to cancel           │
└──────────────────────────┘
```

**Select is the default element-targeting mode** because it provides structured context. A screenshot is conditional on Media mode; metadata selection itself needs no storage.

If file upload features are disabled, the split button becomes a simple "Select" button (no dropdown, no Pinpoint option).

### Local state (widget component, not store)

```typescript
const [selectToolMode, setSelectToolMode] = useState<'select' | 'pinpoint'>('select');
const [selectDropdownOpen, setSelectDropdownOpen] = useState(false);
const [hoveredElement, setHoveredElement] = useState<{
  rect: DOMRect;
  tag: string;
  info: string;
  dims: string;
} | null>(null);
const selectDropdownRef = useRef<HTMLDivElement>(null);
```

Close dropdown on outside click:
```typescript
useEffect(() => {
  if (!selectDropdownOpen) return;
  const handler = (e: MouseEvent) => {
    if (selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) {
      setSelectDropdownOpen(false);
    }
  };
  document.addEventListener('pointerdown', handler);
  return () => document.removeEventListener('pointerdown', handler);
}, [selectDropdownOpen]);
```

## Element Select Overlay

Full-screen overlay with `cursor: crosshair`. On hover, highlight elements with an outline and info tooltip. On click, capture safe element metadata; Media mode may then add a cropped screenshot.

Define project-appropriate sanitizers. At minimum, reject long/hash-like classes and normalize whitespace/control characters:

```typescript
const sanitizeElementLabel = (value: string | null | undefined) =>
  (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const excluded = '[data-feedback-private], [data-feedback-mask], input, textarea, select, [contenteditable]';
const isExcludedTarget = (target: Element | null) => !target ||
  target.matches('html, body') || !!target.closest('#feedback-widget-root') ||
  !!target.closest(excluded) || !!target.querySelector(excluded);

// This attribute is app-authored static copy, not user content. Apply the
// host's redactor to it too. Never derive a label from arbitrary textContent,
// DOM IDs/classes, form values, or an ancestor containing private content.
const safeLabel = (target: Element) =>
  sanitizeElementLabel(redactFeedbackText(target.getAttribute('data-feedback-label') ?? ''));
```

```typescript
const handleElementSelectMove = (e: React.PointerEvent) => {
  const overlay = document.getElementById('feedback-element-select-overlay');
  if (overlay) overlay.style.pointerEvents = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
  if (overlay) overlay.style.pointerEvents = '';

  // Skip non-elements, widget internals, and private regions.
  if (isExcludedTarget(target)) {
    setHoveredElement(null);
    return;
  }

  const rect = target.getBoundingClientRect();
  const tag = target.tagName.toLowerCase();
  const info = `<${tag}> ${safeLabel(target)}`;
  const dims = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

  setHoveredElement({ rect, tag, info, dims });
};
```

### Highlight rendering

```tsx
{hoveredElement && (
  <>
    {/* Blue highlight box */}
    <div
      className="pointer-events-none fixed border-2 border-blue-500 bg-blue-500/10 rounded-sm transition-all duration-75"
      style={{
        left: hoveredElement.rect.left,
        top: hoveredElement.rect.top,
        width: hoveredElement.rect.width,
        height: hoveredElement.rect.height,
      }}
    />
    {/* Info tooltip below element (flip to top if near viewport bottom) */}
    <div
      className="pointer-events-none fixed bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-md shadow-lg flex items-center gap-2 max-w-xs"
      style={{
        left: hoveredElement.rect.left,
        top:
          hoveredElement.rect.bottom + 60 > window.innerHeight
            ? hoveredElement.rect.top - 32
            : hoveredElement.rect.bottom + 4,
      }}
    >
      <span className="font-mono text-blue-300">{hoveredElement.info}</span>
      <span className="text-gray-400">{hoveredElement.dims}</span>
    </div>
  </>
)}
```

### Instruction banner

```tsx
<div className="absolute top-4 left-1/2 -translate-x-1/2 bg-bg-surface border border-border rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3">
  <MousePointer size={16} className="text-blue-500" />
  <span className="text-sm text-text">Hover to inspect, click to select an element</span>
  <button onClick={cancel} className="text-text-muted hover:text-text ml-2 cursor-pointer">
    <X size={16} />
  </button>
</div>
```

## Element click and optional cropped screenshot

When the user clicks an element:

```typescript
const handleElementSelectClick = async (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const overlay = document.getElementById('feedback-element-select-overlay');
  if (overlay) overlay.style.pointerEvents = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
  if (overlay) overlay.style.pointerEvents = '';

  if (isExcludedTarget(target)) {
    store.setIsElementSelecting(false);
    store.restore();
    setHoveredElement(null);
    return;
  }

  const rect = target.getBoundingClientRect();
  // Build bounded app-authored metadata, not arbitrary page text.
  const tag = target.tagName.toLowerCase();
  const text = safeLabel(target);
  const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  const elementInfo = `<${tag}> ${dims}${text ? ` — "${text}"` : ''}`;

  // Create capture with element info immediately (unified captures model)
  const captureId = store.addCapture({ elementInfo, position: { x: e.clientX, y: e.clientY } });
  store.setIsElementSelecting(false);
  setHoveredElement(null);

  // Core stops here. Media mode may add a cropped screenshot after a user
  // gesture, disclosure, masking, and storage configuration.
  if (mediaPolicy.elementScreenshotsEnabled) {
    try {
      const cropped = await withWidgetHidden(async () => {
        const fullScreenshot = await captureNativeScreenshot();
        return cropToElement(fullScreenshot, rect);
      });
      store.addScreenshotToCapture(captureId, cropped);
    } catch {
      // Permission denial/cancellation keeps the metadata-only capture.
    }
  }

  store.restore();
};
```

## Cropping to Element Bounds

Crop a full-page screenshot to an element's bounding rect, accounting for device pixel ratio on HiDPI displays:

```typescript
const cropToElement = (base64: string, rect: DOMRect): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Scale factor accounts for HiDPI (retina) displays
      const scaleX = img.width / window.innerWidth;
      const scaleY = img.height / window.innerHeight;
      const padding = 8; // px of context around element

      const cropLeft = Math.max(0, (rect.left - padding) * scaleX);
      const cropTop = Math.max(0, (rect.top - padding) * scaleY);
      const cropWidth = Math.min((rect.width + padding * 2) * scaleX, img.width - cropLeft);
      const cropHeight = Math.min((rect.height + padding * 2) * scaleY, img.height - cropTop);

      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      canvas.getContext('2d')!.drawImage(
        img,
        cropLeft, cropTop, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = base64;
  });
};
```

## Store Integration (Unified Captures Model)

```typescript
// Core — always included
isElementSelecting: boolean;
setIsElementSelecting: (val: boolean) => void;

// Uses unified captures[] — see captures-model.md
addCapture: (capture: Omit<FeedbackCapture, 'id'>) => string;
addScreenshotToCapture: (id: string, screenshot: string) => void;
```

Element select creates a capture with `addCapture({ elementInfo, position })`, then links the cropped screenshot via `addScreenshotToCapture(id, cropped)`. If screenshot capture fails, the element info still exists in the capture.

Clear `isElementSelecting: false` in `close()`, `reset()`, and `submitFeedback()`.

## Screenshot storage boundary

Even cropped element screenshots go through the chosen storage path. A 50KB PNG becomes roughly 68KB when base64-encoded, leaving no safe room in a GitHub issue body once report text and metadata are included.

When Media mode is configured, upload the cropped screenshot through [storage-strategy.md](storage-strategy.md). Prefer a private reviewer route; do not assume a public object URL. Without configured storage, capture metadata only and do not generate or send screenshot bytes.

## Key rules

1. **Select is the default mode** — always initialize `selectToolMode` to `'select'`
2. **Set `pointer-events: none` on overlay** before `elementFromPoint` — same pattern as pinpoint
3. **Skip `<html>`, `<body>`, `#feedback-widget-root`** — these aren't useful targets
4. **Scale crop coordinates for HiDPI** — `img.width / window.innerWidth` gives the device pixel ratio
5. **Add 8px padding** around the cropped element for visual context
6. **Fail gracefully** — if screenshot is cancelled, element info is still captured
7. **Handle ESC key** — dismiss the overlay and restore the dialog
8. **Hide minimized pill and trigger** during element selection (same as pinpoint)
9. **Element info in tooltip** — show tag, bounded app-authored label, and dimensions; do not copy arbitrary IDs/classes or descendant text
10. **Element info in dialog** — show captured element info with `MousePointer` icon (blue, not red like Pinpoint's `Crosshair`)
11. **Private regions stay private** — skip `[data-feedback-private]`, form controls, and sensitive screens; sanitize labels and dynamic class names
12. **Accessible exit** — Escape cancels, the instruction banner is announced, and focus returns to the invoking control
