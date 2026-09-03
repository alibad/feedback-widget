# Secure Media Storage

Media is optional. Core mode works without it. Before enabling media, choose access, upload, retention, and cleanup behavior with the user. Read [security-and-privacy.md](security-and-privacy.md).

## Prefer the host's storage

Detect existing Vercel Blob, Azure Blob, Firebase Storage, Supabase Storage, S3/R2, Cloudinary, or another established service. Reuse its server client, naming conventions, access checks, and lifecycle policy.

Do not install a storage provider merely to unlock feedback media unless the user explicitly asks for that expansion.

Detection is not authorization to change a bucket/container to public access.

## Access models

Choose one deliberately:

### Private reviewer route — recommended

1. Upload under an opaque server-generated object key.
2. Keep the bucket/container private.
3. Store an attachment record containing object key, reporter/tenant, issue/submission ID, size, MIME, and expiry.
4. Put an admin/reviewer URL in the tracker issue.
5. The route authenticates the reviewer, authorizes access, and streams or redirects to a short-lived signed URL.

This is the safest durable option when reviewers can sign in to the host app.

### Expiring signed link

Use when the issue only needs temporary debugging access. Prefer linking to an app route that can mint a fresh link; embedding the signed provider URL directly makes the issue stale when it expires.

### Public unlisted object

Use only after explicit approval and disclosure. Require high-entropy keys, no directory listing, safe `Content-Type`, `Content-Disposition: attachment` for non-images, and automatic deletion. Anyone with the URL can access it, even when the tracker destination is private.

Never default to `makePublic()`, `{ access: 'public' }`, public-read ACLs, public buckets, or permissive storage rules.

## Upload patterns

### Small media through the feedback route

Accept a bounded data URI or multipart part, validate it, upload server-side, then discard it. Set a route body limit that accounts for base64 expansion.

Use a strict decoder:

```typescript
function decodeDataUri(value: string): { mime: string; bytes: Buffer } {
  const marker = ';base64,';
  const index = value.indexOf(marker);
  if (!value.startsWith('data:') || index < 6) {
    throw new Error('invalid_data_uri');
  }

  const metadata = value.slice(5, index).toLowerCase();
  const [mime, ...parameters] = metadata.split(';');
  const encoded = value.slice(index + marker.length);
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) {
    throw new Error('invalid_mime');
  }
  if (!/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('invalid_base64');
  }

  // Parameters such as codecs=vp9,opus are metadata only. Validate/allowlist
  // them separately if the selected media policy uses them.
  if (parameters.some((parameter) => !/^[a-z0-9_.+-]+=[a-z0-9,._+-]+$/i.test(parameter))) {
    throw new Error('invalid_media_parameter');
  }

  return { mime, bytes: Buffer.from(encoded, 'base64') };
}
```

Check decoded size and magic bytes after decoding. MIME text from the client is not proof of file type.

### Larger media through authorized direct upload

For recordings or serverless body limits:

1. The authenticated backend validates desired type and maximum size.
2. It generates a short-lived upload authorization scoped to one opaque key.
3. The client uploads directly.
4. The submit route accepts an attachment ID, not a URL.
5. The server verifies that the object exists, belongs to this reporter/tenant, is within policy, and has not already been consumed.

Never accept a client-provided bucket key or arbitrary remote URL.

## Validation policy

Start narrow and expand only when needed:

| Capability | Suggested types |
|---|---|
| Screenshot | PNG, JPEG, WebP |
| Voice | WebM/Opus, M4A/AAC as produced by supported clients |
| Screen recording | WebM or MP4 as produced by supported clients |
| Documents | Omit by default; allowlist specific types only when requested |

Reject SVG and HTML by default. Generate the storage key with a UUID; do not use the client filename as a path. Sanitize the original name only for display, clamp its length, and store it as metadata.

Enforce per-file and combined limits on the server. Client checks are only early feedback.

## Image processing

Compress ordinary screenshots client-side for UX, then validate again server-side:

```typescript
async function compressImage(dataUri: string, maxDimension = 1920, quality = 0.82) {
  const image = await loadImage(dataUri);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
```

Preserve PNG only when transparency or small UI text materially benefits from it. Strip metadata when re-encoding. Cropped screenshots still go through storage; they are never inlined into the tracker issue.

## Provider adaptation

Use the provider's private upload primitive:

- **Vercel Blob:** use private access when available for the account/project; otherwise require explicit approval before public blobs.
- **Azure Blob:** private container; use a server route or short-lived user-delegation/account SAS.
- **Firebase Storage:** Admin SDK upload to a private path; use Firebase download-token behavior only if its bearer-link semantics are accepted. Do not call `makePublic()`.
- **Supabase Storage:** private bucket plus authenticated/signed download.
- **S3/R2:** no public-read ACL; use an authorization route or short-lived presigned access.
- **Cloudinary:** use authenticated/private delivery when available; public delivery requires the same explicit trade-off.

Match the project's existing initialization. Never create a second admin SDK instance when one exists.

## Transaction and cleanup

Treat submission as a small transaction:

1. Validate the report.
2. Upload/claim all attachments.
3. Create the issue.
4. Persist the issue-to-attachment mapping.

If creation definitely failed, delete unclaimed uploads or enqueue cleanup. If creation succeeded but mapping persistence failed, or its outcome is uncertain, preserve attachments and the durable reservation for reconciliation; do not delete media already referenced by an issue or blindly create a second issue. Add a lifecycle rule for genuinely unclaimed objects. On authorized deletion requests, remove objects and the mapping according to product policy.

## Retention

Choose and document a retention window. Media and raw diagnostics should generally expire sooner than the tracker issue. Prefer provider lifecycle rules over best-effort application timers. The completion report must state visibility and retention.
