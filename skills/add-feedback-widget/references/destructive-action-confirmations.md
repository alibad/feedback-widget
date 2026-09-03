# Destructive Action Confirmations

## Problem

Voice notes and video recordings take real user effort to create. Accidentally tapping a delete button destroys work that can't be recovered. Native `confirm()` dialogs are ugly, unthemeable, and break dark mode.

## Solution

Use the project's existing `ConfirmDialog` or `AlertDialog` component (NEVER `confirm()`). Show a danger-variant dialog when the user clicks delete on recordings.

## Implementation

### Local state for confirmation dialogs

```typescript
const [confirmDeleteAudio, setConfirmDeleteAudio] = useState(false);
const [confirmDeleteVideo, setConfirmDeleteVideo] = useState(false);
```

### Delete buttons trigger the dialog (not the action)

```tsx
{/* Audio preview */}
<button onClick={() => setConfirmDeleteAudio(true)}>
  <Trash2 size={16} />
</button>

{/* Video preview */}
<button onClick={() => setConfirmDeleteVideo(true)}>
  <Trash2 size={14} /> Remove recording
</button>
```

### ConfirmDialog components (render inside `#feedback-widget-root`)

```tsx
<ConfirmDialog
  isOpen={confirmDeleteAudio}
  onClose={() => setConfirmDeleteAudio(false)}
  onConfirm={() => { store.removeAudio(); setConfirmDeleteAudio(false); }}
  title="Delete Voice Note?"
  message="This voice note will be permanently removed. You can re-record a new one."
  confirmText="Delete"
  variant="danger"
/>

<ConfirmDialog
  isOpen={confirmDeleteVideo}
  onClose={() => setConfirmDeleteVideo(false)}
  onConfirm={() => { store.removeVideo(); setConfirmDeleteVideo(false); }}
  title="Delete Recording?"
  message="This screen recording will be permanently removed. You can record a new one."
  confirmText="Delete"
  variant="danger"
/>
```

## What Does NOT Need Confirmation

- Removing a screenshot from a capture (small, quick to re-capture)
- Removing element info from a capture (can re-select instantly)
- Removing file attachments (still on disk)
- Closing/minimizing the feedback dialog (state is preserved via minimize)

## Key Rules

1. **NEVER use `confirm()`** — use the project's dialog component
2. **Only confirm for recordings** — voice notes and video take effort to create
3. **Use danger variant** — red styling makes the destructive nature clear
4. **Concise message** — reassure the user they can re-record
5. **Check what the project has** — look for `ConfirmDialog`, `AlertDialog`, or shadcn `AlertDialog` before creating a new one
