# Troubleshooting

## Screen or microphone access is denied without a prompt

**Error:** `NotAllowedError: Permission denied` without the browser ever showing a permission dialog.

**Cause:** The final response or embedding page may set `Permissions-Policy: display-capture=()` or `microphone=()`. Empty parens block every origin. A cross-origin iframe can also be missing the matching `allow` permission.

**Solution:** For selected features only, allow `display-capture=(self)` and/or `microphone=(self)` while preserving every unrelated directive. Screen capture does not need `camera`. Inspect production/CDN headers and iframe policy. See `permissions-policy.md`.

---

## `permissions.query` returns "denied" even when mic is allowed

**Error:** Code checks `navigator.permissions.query({ name: 'microphone' })` and gets `state: 'denied'`, so it returns early before calling `getUserMedia`.

**Cause:** `permissions.query` for microphone returns stale/incorrect state in many browsers.

**Solution:** Remove ALL `permissions.query` pre-checks for media devices. Just call `getUserMedia({ audio: true })` directly in a try/catch.

---

## Screenshot captures wrong viewport / shifted content

**Error:** Screenshot shows content from the top of the page instead of current scroll position.

**Cause:** Using html2canvas or similar DOM-to-canvas libraries.

**Solution:** Replace with native Screen Capture API (`getDisplayMedia`). See `screenshot-capture.md`.

---

## Widget UI appears in screenshots

**Error:** Feedback trigger button, "Continue feedback" pill, or recording indicator visible in captured screenshots.

**Cause:** `#feedback-widget-root` is still visible during the native screen capture.

**Solution:** Hide `#feedback-widget-root` via `display: none` before calling `getDisplayMedia`, restore after. Use `withWidgetHidden()` wrapper. See `screenshot-visibility.md`.

---

## Uploaded video/audio files are corrupt

**Error:** Video or audio uploads produce files that are either tiny (e.g., 15 bytes) or won't play.

**Cause:** Server-side code strips the `data:` URI prefix using regex like `^data:[^,]+,`. This breaks on MIME types with commas in parameters — e.g., `data:video/webm;codecs=vp9,opus;base64,...`.

**Solution:** Use the strict decoder in [storage-strategy.md](storage-strategy.md), which splits on `;base64,` and validates metadata/base64. Reject a missing marker; do not fall back to permissive decoding. Enforce decoded size and file signature limits.

---

## Dialog blocks the page during video recording

**Error:** User starts recording but the feedback dialog stays open, covering the page.

**Cause:** Using only `withWidgetHidden()` around `getDisplayMedia`. This hides momentarily for the share picker but the dialog reappears immediately.

**Solution:** Minimize the dialog before requesting `getDisplayMedia` directly from the click. Keep the recording/stop indicator visible. Restore the dialog on normal stop; a late callback after cancellation must not reopen a discarded draft.

---

## Recording fails on Safari

**Error:** `getDisplayMedia` throws or is undefined on Safari.

**Cause:** Safari has limited/inconsistent Screen Capture API support.

**Solution:** Fail gracefully with a toast error. Users can upload a screen recording from their gallery instead. On mobile Safari, hide screenshot/recording buttons entirely.

---

## GitHub issue body too long (65536 chars)

**Error:** GitHub API returns 422 because the issue body exceeds 65,536 characters.

**Cause:** Full-page screenshots as base64 data URIs are millions of characters.

**Solution:** Never inline media in the issue. Store it through the selected access policy and link to a server-controlled reviewer route or approved delivery URL. Add client-side compression before upload:

```typescript
async function compressImage(base64: string, maxWidth = 1920, quality = 0.92): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64;
  });
}
```

---

## Firebase Storage bucket not found

**Error:** `Error: Bucket not found` when uploading to Firebase Storage.

**Cause:** Firebase Storage hasn't been enabled in the Firebase Console, or `storageBucket` is missing from the admin SDK config.

**Solution:**
1. Enable Storage in Firebase Console (choose a region)
2. Add `storageBucket` to the admin app initialization:
   ```typescript
   initializeApp({
     credential: cert({...}),
     storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
   })
   ```
3. Confirm the server identity can write to the private feedback prefix and that the reviewer route can authorize reads

---

## Private Firebase Storage object returns 403

**Error:** Uploaded file URL returns 403 Forbidden.

**Cause:** A private object is being opened directly without an authorized delivery path. This is expected for private storage.

**Solution:** Keep the object private. Serve it through an authenticated reviewer endpoint or mint a short-lived signed/download-token URL after authorization. Do not widen the entire `feedback/` path to public read just to remove the 403.
