# Mobile Experience

**Scope: the web widget on a small screen.** This is responsive web layout for a browser on a phone. It does not govern a React Native or Flutter app — for those read [platform-baselines.md](platform-baselines.md), then [react-native.md](react-native.md) or [flutter.md](flutter.md). The two have different floors on purpose, and the voice-note row below is a web row.

Use `(pointer: coarse)` to choose touch-friendly interaction, and viewport/safe-area checks for layout. It is not a security boundary or a complete mobile detector. Feature-detect media APIs separately.

## Mobile Detection

```typescript
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const check = () => setCoarse(window.matchMedia('(pointer: coarse)').matches);
    check();
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener('change', check);
    return () => mq.removeEventListener('change', check);
  }, []);
  return coarse;
}
```

## What Changes on Mobile

| Feature | Desktop | Mobile | Why |
|---|---|---|---|
| Dialog | Centered card with backdrop | Full-screen | More space, no awkward floating card |
| Screenshot capture | Native Screen Capture API + annotator | Hidden — user uploads from gallery | Screen Capture API not supported on mobile browsers |
| Annotator | Full canvas editor (7 tools) | Skipped entirely | Canvas mouse events don't translate to touch |
| Pinpoint | Crosshair overlay + elementFromPoint | Hidden | No hover cursor on touch devices |
| Image upload | Unified drop zone (handles images + files) | Single "Add Screenshot or Photo" button | One clear action, opens camera roll |
| Drop zone | Visible with drag-and-drop | Hidden (use file picker buttons instead) | No drag-and-drop on mobile |
| Voice notes | `Voice (10m)` button | `Voice Note (10m)` button | Works on mobile — getUserMedia is supported |
| File attachments | Via unified drop zone | "Attach File" button (opens native picker) | Works on mobile |
| Screen recording | `Record (60s)` button | Hidden | getDisplayMedia not supported on mobile |
| Clipboard paste | Global paste handler | Same, plus hint in textarea placeholder | Guide user: "you can paste screenshots here too" |
| Selected text | User pastes/quotes intentionally | Same | Do not monitor page selection globally |
| Delete buttons on thumbnails | Show on hover | Always visible | No hover state on touch |
| Touch targets | Default | Min 44px (`min-h-11`) | Apple HIG minimum |
| Minimize button | Show | Hidden | Full-screen dialog, nowhere to minimize to |
| Close button | 16px icon, `p-1` | 20px icon, `p-2` | Easier to tap |
| Submit button | Default | `min-h-12 text-base` | Bigger tap target |
| Safe areas | N/A | `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)` | Notch and home bar |

## Key Implementation Rules

1. **Feature-detect capture** — hide screen-capture controls when `getDisplayMedia` is unavailable; uploaded images remain the fallback
2. **Use pointer events for custom gestures**, while preserving native selection, scrolling, and assistive technology behavior
3. **Skip the desktop annotator for coarse-pointer layouts** unless the project has a tested touch annotator; add images to `captures[]` directly
4. **Full-screen dialog** — use `fixed inset-0` with flex column layout, `overflow-y-auto` for scrolling
5. **Safe area padding** — use `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` via inline styles (not Tailwind, unless project has safe-area plugin)

## Mobile "Add Image" Button

Replace the three desktop buttons (Screenshot, Pinpoint, Upload) with one:

```tsx
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  className="w-full flex items-center justify-center gap-2 min-h-12 rounded-xl bg-bg-elevated border border-dashed border-border text-sm active:border-primary active:bg-primary/5"
>
  <ImagePlus size={18} />
  Add Screenshot or Photo
</button>
```

This opens the native file picker which on iOS/Android shows camera roll, take photo, or browse files.

## Conditional Rendering Pattern

```tsx
{isMobile ? (
  <MobileOnlyUI />
) : (
  <DesktopOnlyUI />  // Screenshot, Pinpoint, Upload buttons, drop zone
)}
```

Keep shared state/validation intact and branch the interaction UI using capability and layout signals, not user-agent strings.
