# Screenshot Annotator Component

Create `ScreenshotAnnotator.tsx` alongside the feedback widget. This is a full-screen canvas-based annotation editor.

**Props**: `{ imageData: string; onSave: (annotatedBase64: string) => void; onCancel: () => void }`

**Tools**: Select & Move, Freehand Draw, Line, Rectangle, Circle, Arrow, Text

## Text Tool — NEVER use `prompt()` or `window.prompt()`

When the user clicks with the text tool, render an `<input>` element positioned directly on top of the canvas at the click coordinates. The input should be styled to match the current color and font size (`strokeWidth * 6`). On Enter, commit the text as an annotation. On Escape, cancel.

### Critical implementation details

1. **Positioning**: The canvas is centered inside a flex container. Calculate the input position relative to the container by measuring the canvas offset within it:
```typescript
const canvasRect = canvas.getBoundingClientRect();
const containerRect = canvas.parentElement!.getBoundingClientRect();
setTextInput({
  x, // annotation coordinate (unscaled)
  y,
  canvasX: canvasRect.left - containerRect.left + (x * scale),
  canvasY: canvasRect.top - containerRect.top + (y * scale),
});
```

2. **Focus**: The input MUST be focused automatically. `autoFocus` is unreliable — use `requestAnimationFrame` in a `useEffect`:
```typescript
useEffect(() => {
  if (textInput) {
    requestAnimationFrame(() => textInputRef.current?.focus());
  }
}, [textInput]);
```

3. **Event propagation**: The input MUST stop mousedown/pointerdown propagation, otherwise clicks inside the input bubble to the canvas's `onMouseDown` which calls `commitTextInput()` and immediately destroys the input:
```typescript
onMouseDown={(e) => e.stopPropagation()}
onPointerDown={(e) => e.stopPropagation()}
onKeyDown={(e) => {
  e.stopPropagation(); // prevent undo/redo shortcuts from firing
  if (e.key === "Enter") commitTextInput();
  if (e.key === "Escape") { setTextInput(null); setTextValue(""); }
}}
```

4. **Do NOT use `onBlur={commitTextInput}`** — this causes the input to self-destruct when focus shifts even briefly (e.g., during re-render). Commit only via Enter or clicking elsewhere on the canvas.

5. **Styling**: Use `bg-transparent` (NOT a colored background). Add `textShadow` for visibility on any background:
```typescript
style={{
  color,
  backgroundColor: "transparent",
  textShadow: isLightColor(color)
    ? "0 0 2px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.5)"
    : "0 0 2px rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.3)",
}}
```

## Custom Color Picker — 6 presets + "pick any color" swatch

Render 6 preset color circles (red, blue, green, yellow, white, black). Add a 7th swatch with a dashed border and "+" icon that triggers `<input type="color">`.

**CRITICAL**: The `<input type="color">` MUST use `opacity-0` positioned behind the button — NOT `className="hidden"` / `display:none`. When the input is `display:none`, the browser's native color picker dialog opens detached from the button position (floats to top-left corner). With `opacity-0` the input remains in the layout and the picker anchors correctly.

```typescript
// Correct — color picker opens at the button
<div className="relative w-5 h-5">
  <button
    className="absolute inset-0 rounded-full border-2 border-dashed border-gray-500 hover:border-gray-300 flex items-center justify-center z-10"
    style={{ backgroundColor: isCustomColor ? color : "transparent" }}
    onClick={() => colorInputRef.current?.click()}
  >
    <PlusIcon size={12} />
  </button>
  <input
    ref={colorInputRef}
    type="color"
    value={color}
    onChange={(e) => setColor(e.target.value)}
    className="absolute inset-0 opacity-0 cursor-pointer"
    style={{ width: "20px", height: "20px" }}
  />
</div>

// WRONG — picker floats to wrong position
<input type="color" className="hidden" />
```

**Do NOT use `conic-gradient` rainbow background** — it looks garish at small swatch sizes. Use a clean dashed-border circle with "+" icon. When a custom (non-preset) color is active, fill the swatch with that color.

## Tool-specific cursors — use dual-stroke SVG for visibility

**CRITICAL**: Cursor SVG must be visible on BOTH light and dark backgrounds. Use a thick dark outer stroke + thin light inner stroke:

```typescript
const PENCIL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' fill='none' stroke='black' stroke-width='3'/%3E%3Cpath d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 2 22, crosshair`;
```

**NEVER use a single white or single dark stroke** — white disappears on light screenshots, dark disappears on dark screenshots. Always use the dual-stroke outline pattern.

```typescript
const CURSOR_MAP: Record<Tool, string> = {
  select: 'default',
  draw: PENCIL_CURSOR,
  line: 'crosshair',
  rect: 'crosshair',
  circle: 'crosshair',
  arrow: 'crosshair',
  text: 'text',
};
```

## Select & Move Annotations — CRITICAL (commonly missed)

These three features are frequently omitted. Verify ALL are implemented:

### 1. Selection visual indicator

When the user clicks an annotation in Select mode, show a **dashed blue bounding box** around it. Implement a `getAnnotationBounds(annotation)` function that returns `{ x, y, w, h }` for all tool types:
- `rect`/`circle`: use `x, y, width, height`
- `line`/`arrow`: use `min/max` of `x1,y1,x2,y2`
- `text`: estimate from `x, y - fontSize, text.length * fontSize * 0.6, fontSize`
- `draw`: compute min/max of all points

Render the indicator in `redraw()` AFTER drawing the annotation:
```typescript
if (ann.id === selectedId) {
  ctx.save();
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  const bounds = getAnnotationBounds(ann);
  if (bounds) ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
  ctx.restore();
}
```

Add `selectedId` to `redraw` useCallback deps.

### 2. Delete selected annotation

Delete/Backspace key removes the selected annotation. **Push deleted annotation to the undo stack** so Ctrl+Z restores it:

```typescript
const deleteSelected = () => {
  if (!selectedId) return;
  const deleted = annotations.find((a) => a.id === selectedId);
  if (deleted) {
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setUndone((prev) => [deleted, ...prev]); // ← enables undo
  }
  setSelectedId(null);
};
```

Also add a Trash icon button in the toolbar (enabled only when `selectedId` is set).

### 3. Drag to move

When clicking with Select tool: if hit test finds an annotation, set `selectedId` AND start drag. If nothing hit, clear `selectedId`.

- Hit testing with 10px tolerance margin

## Stroke Width Control — CRITICAL (commonly missed)

`lineWidth` MUST be `useState` (NOT a constant). Add a range slider (1-12) in the toolbar between colors and undo/redo. Show a numeric readout:

```tsx
<input type="range" min={1} max={12} value={lineWidth}
  onChange={(e) => setLineWidth(Number(e.target.value))} />
```

## Full-resolution Export

- Canvas displays the image scaled to fit the viewport
- When saving, scale all annotations up to the original image dimensions
- Use a temporary off-screen canvas at full resolution for export

## Other Features

- Undo/redo with Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
- Canvas maintains image aspect ratio
- Use fully opaque `bg-black` background (not `bg-black/90`)
- Include `canvasSize` in `redraw` useCallback deps to prevent black canvas bug
- Skip annotator on mobile — add images directly
