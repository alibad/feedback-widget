import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  redactFeedback,
  feedbackMediaReferences,
  type FeedbackInput,
} from './feedback-contract.ts';
import type { FeedbackEnv } from './feedback-server.ts';

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_REPORT_BYTES = 25 * 1024 * 1024;
const DAY = 86400;
const uuid = z.uuid();
const kinds = ['image', 'video', 'audio', 'file', 'diagnostics'];
type MediaRow = {
  id: string;
  owner_hash: string;
  object_key: string;
  kind: string;
  mime: string;
  size: number;
  submission_id: string | null;
  expires_at: number;
};
const hashActor = (actor: string, env: FeedbackEnv) =>
  createHmac('sha256', env.FEEDBACK_HASH_SECRET!)
    .update('media-owner:' + actor)
    .digest('hex');
export const mediaActor = (request: Request) =>
  request.headers.get('oai-authenticated-user-id') ||
  request.headers.get('oai-authenticated-user-email');
const fail = (status: number, code: string) =>
  Response.json(
    { success: false, code },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

export function mediaConfigured(env: FeedbackEnv) {
  return Boolean(
    env.DB &&
    env.MEDIA &&
    env.FEEDBACK_REVIEWER_EMAILS?.trim() &&
    (env.FEEDBACK_HASH_SECRET?.length ?? 0) >= 32,
  );
}

export function mediaOriginAllowed(request: Request, local = false) {
  const origins = [
    'https://feedback.humanquest.net',
    'https://feedback-widget.albertine.chatgpt.site',
  ];
  if (local) origins.push('http://localhost:3000');
  return (
    origins.includes(request.headers.get('origin') ?? '') &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  );
}

export async function readMediaBytes(request: Request, max = MAX_MEDIA_BYTES) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max))
    throw new Error('payload_too_large');
  if (!request.body) throw new Error('invalid_request');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        throw new Error('payload_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new Error('invalid_request');
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export const diagnosticsSchema = z
  .object({
    viewport: z
      .object({
        width: z.number().int().min(1).max(20000),
        height: z.number().int().min(1).max(20000),
        dpr: z.number().min(0.1).max(10),
      })
      .strict()
      .optional(),
    client: z
      .object({
        browser: z.enum(['Chrome', 'Firefox', 'Safari', 'Edge', 'Other']),
        appVersion: z.literal('13.0.0'),
      })
      .strict()
      .optional(),
    console: z
      .array(
        z
          .object({
            level: z.enum(['warn', 'error']),
            message: z.string().max(500),
            at: z.string().datetime(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    network: z
      .array(
        z
          .object({
            method: z.enum([
              'GET',
              'POST',
              'PUT',
              'PATCH',
              'DELETE',
              'HEAD',
              'OPTIONS',
            ]),
            path: z.enum(['/']),
            status: z.number().int().min(0).max(599),
            durationMs: z.number().min(0).max(600000),
            at: z.string().datetime(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export function validateMedia(
  bytes: Uint8Array,
  rawMime: string,
  kind: string,
): { bytes: Uint8Array; mime: string } {
  const mime = rawMime.split(';')[0].trim().toLowerCase();
  if (!kinds.includes(kind) || bytes.length > MAX_MEDIA_BYTES || !bytes.length)
    throw new Error('invalid_file');
  const starts = (...signature: number[]) =>
    signature.every((n, i) => bytes[i] === n);
  const ascii = (start: number, end: number) =>
    new TextDecoder().decode(bytes.slice(start, end));
  if (kind === 'diagnostics' && mime === 'application/json') {
    if (bytes.length > 24000) throw new Error('invalid_file');
    const parsed = diagnosticsSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (parsed.console)
      parsed.console = parsed.console.map((x) => ({
        ...x,
        message: redactFeedback(x.message),
      }));
    if (
      !Object.values(parsed).some((value) =>
        Array.isArray(value) ? value.length : Boolean(value),
      )
    )
      throw new Error('invalid_file');
    return {
      bytes: new TextEncoder().encode(JSON.stringify(parsed, null, 2)),
      mime,
    };
  }
  if (kind === 'file' && mime === 'text/plain') {
    if (bytes.length > 100000) throw new Error('invalid_file');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('invalid_file');
    return { bytes: new TextEncoder().encode(redactFeedback(text)), mime };
  }
  const image =
    kind === 'image' &&
    ((mime === 'image/png' && starts(137, 80, 78, 71, 13, 10, 26, 10)) ||
      (mime === 'image/jpeg' && starts(255, 216, 255)) ||
      (mime === 'image/webp' &&
        ascii(0, 4) === 'RIFF' &&
        ascii(8, 12) === 'WEBP'));
  const video =
    kind === 'video' &&
    ((mime === 'video/webm' && starts(26, 69, 223, 163)) ||
      (mime === 'video/mp4' && ascii(4, 8) === 'ftyp'));
  const audio =
    kind === 'audio' &&
    ((mime === 'audio/webm' && starts(26, 69, 223, 163)) ||
      (['audio/mp4', 'audio/x-m4a'].includes(mime) && ascii(4, 8) === 'ftyp') ||
      (mime === 'audio/ogg' && ascii(0, 4) === 'OggS') ||
      (mime === 'audio/wav' &&
        ascii(0, 4) === 'RIFF' &&
        ascii(8, 12) === 'WAVE'));
  if (!(image || video || audio)) throw new Error('invalid_file');
  return { bytes, mime };
}

async function quota(env: FeedbackEnv, key: string, max: number, now: number) {
  return Boolean(
    await env
      .DB!.prepare(
        `INSERT INTO feedback_budgets (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
      )
      .bind(key, now + 2 * DAY, max)
      .first(),
  );
}

export async function cleanupExpiredMedia(env: FeedbackEnv, now: number) {
  if (!env.MEDIA || !env.DB) return;
  const rows = await env.DB.prepare(
    "UPDATE feedback_media SET submission_id = '__deleting__' WHERE id IN (SELECT id FROM feedback_media WHERE expires_at <= ? LIMIT 30) AND expires_at <= ? RETURNING id, object_key",
  )
    .bind(now, now)
    .all<{ id: string; object_key: string }>();
  for (const row of rows.results) {
    await env.MEDIA.delete(row.object_key);
    await env.DB.prepare(
      'DELETE FROM feedback_media WHERE id = ? AND expires_at <= ?',
    )
      .bind(row.id, now)
      .run();
  }
}

export async function uploadFeedbackMedia(
  request: Request,
  env: FeedbackEnv,
  local = false,
) {
  const actor = mediaActor(request);
  if (!actor) return fail(401, 'unauthorized');
  if (!mediaOriginAllowed(request, local)) return fail(403, 'forbidden');
  if (!mediaConfigured(env)) return fail(503, 'setup_required');
  const now = Math.floor(Date.now() / 1000);
  const owner = hashActor(actor, env);
  try {
    await cleanupExpiredMedia(env, now);
    await env
      .DB!.prepare('DELETE FROM feedback_budgets WHERE expires_at < ?')
      .bind(now)
      .run();
    const ip = hashActor(
      request.headers.get('cf-connecting-ip') ?? 'unknown',
      env,
    );
    if (
      !(await quota(
        env,
        `upload-user:${owner}:${Math.floor(now / 3600)}`,
        12,
        now,
      )) ||
      !(await quota(
        env,
        `upload-ip:${ip}:${Math.floor(now / 3600)}`,
        24,
        now,
      )) ||
      !(await quota(env, `upload-global:${Math.floor(now / DAY)}`, 50, now))
    )
      return fail(429, 'rate_limited');
    const kind = request.headers.get('x-feedback-kind') ?? '';
    let media;
    try {
      media = validateMedia(
        await readMediaBytes(request),
        request.headers.get('content-type') ?? '',
        kind,
      );
    } catch (error) {
      return fail(
        error instanceof Error && error.message === 'payload_too_large'
          ? 413
          : 400,
        'invalid_file',
      );
    }
    const id = randomUUID();
    const objectKey = 'feedback/' + id;
    try {
      await env
        .DB!.prepare(
          'INSERT INTO feedback_media (id,owner_hash,object_key,kind,mime,size,expires_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          owner,
          objectKey,
          kind,
          media.mime,
          media.bytes.length,
          now + DAY,
        )
        .run();
      // Persist the cleanup key before storage I/O: a lost upload response
      // must not leave an untracked private object behind.
      await env.MEDIA!.put(objectKey, media.bytes, {
        httpMetadata: { contentType: media.mime },
      });
    } catch {
      await env
        .DB!.prepare(
          "UPDATE feedback_media SET expires_at = 0, submission_id = '__deleting__' WHERE id = ?",
        )
        .bind(id)
        .run();
      throw new Error('upload_store_failed');
    }
    return Response.json(
      { success: true, id, size: media.bytes.length },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return fail(503, 'upload_failed');
  }
}

export async function claimFeedbackMedia(
  env: FeedbackEnv,
  actor: string,
  input: FeedbackInput,
  submissionId: string,
  now: number,
) {
  const refs = feedbackMediaReferences(input);
  if (!refs.length) return;
  if (!mediaConfigured(env)) throw new Error('invalid_attachments');
  if (refs.length > 8 || new Set(refs.map((r) => r.id)).size !== refs.length)
    throw new Error('invalid_attachments');
  const owner = hashActor(actor, env);
  let total = 0;
  for (const ref of refs) {
    const row = await env
      .DB!.prepare(
        'SELECT * FROM feedback_media WHERE id = ? AND owner_hash = ? AND expires_at > ? AND submission_id IS NULL',
      )
      .bind(ref.id, owner, now)
      .first<MediaRow>();
    if (!row || row.kind !== ref.kind) throw new Error('invalid_attachments');
    total += row.size;
  }
  if (total > MAX_REPORT_BYTES) throw new Error('invalid_attachments');
  try {
    for (const ref of refs) {
      const row = await env
        .DB!.prepare(
          'UPDATE feedback_media SET submission_id = ?, expires_at = ? WHERE id = ? AND owner_hash = ? AND expires_at > ? AND submission_id IS NULL RETURNING id',
        )
        .bind(submissionId, now + 7 * DAY, ref.id, owner, now)
        .first();
      if (!row) throw new Error('invalid_attachments');
    }
  } catch {
    await releaseFeedbackMedia(env, submissionId, now);
    throw new Error('invalid_attachments');
  }
}

export async function releaseFeedbackMedia(
  env: FeedbackEnv,
  submissionId: string,
  now: number,
) {
  if (env.MEDIA && env.DB)
    await env.DB.prepare(
      'UPDATE feedback_media SET submission_id = NULL, expires_at = ? WHERE submission_id = ?',
    )
      .bind(now + DAY, submissionId)
      .run();
}

export async function getMediaRecord(
  request: Request,
  env: FeedbackEnv,
  id: string,
) {
  const actor = mediaActor(request);
  if (!actor || !uuid.safeParse(id).success || !mediaConfigured(env))
    return null;
  const record = await env
    .DB!.prepare('SELECT * FROM feedback_media WHERE id = ? AND expires_at > ?')
    .bind(id, Math.floor(Date.now() / 1000))
    .first<MediaRow>();
  if (!record) return null;
  const reviewerEmail = (
    request.headers.get('oai-authenticated-user-email') ?? ''
  )
    .trim()
    .toLowerCase();
  const reviewers = env
    .FEEDBACK_REVIEWER_EMAILS!.split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return record.owner_hash === hashActor(actor, env) ||
    (reviewerEmail && reviewers.includes(reviewerEmail))
    ? record
    : null;
}

export async function readFeedbackMedia(
  request: Request,
  env: FeedbackEnv,
  id: string,
) {
  if (!mediaActor(request)) return fail(401, 'unauthorized');
  try {
    const record = await getMediaRecord(request, env, id);
    if (!record) return fail(404, 'not_found');
    let range: { offset: number; length: number } | undefined;
    const requested = request.headers.get('range');
    if (requested) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(requested);
      const suffix = match && !match[1] ? Number(match[2]) : 0;
      const start = match
        ? match[1]
          ? Number(match[1])
          : Math.max(0, record.size - suffix)
        : NaN;
      const end = match
        ? match[1] && match[2]
          ? Math.min(Number(match[2]), record.size - 1)
          : record.size - 1
        : NaN;
      if (
        !match ||
        (!match[1] && !suffix) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= record.size ||
        end < start
      )
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${record.size}`,
            'Cache-Control': 'private, no-store',
          },
        });
      range = { offset: start, length: end - start + 1 };
    }
    const object = await env.MEDIA!.get(
      record.object_key,
      range ? { range } : undefined,
    );
    if (!object) return fail(404, 'not_found');
    const extensions: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'video/webm': 'webm',
      'video/mp4': 'mp4',
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'text/plain': 'txt',
      'application/json': 'json',
    };
    return new Response(object.body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': record.mime,
        'Content-Length': String(range?.length ?? object.size),
        'Accept-Ranges': 'bytes',
        ...(range
          ? {
              'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${record.size}`,
            }
          : {}),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Disposition': `${record.kind === 'file' || record.kind === 'diagnostics' ? 'attachment' : 'inline'}; filename="feedback-${record.kind}.${extensions[record.mime] ?? 'bin'}"`,
      },
    });
  } catch {
    return fail(503, 'attachment_unavailable');
  }
}

export async function deleteFeedbackMedia(
  request: Request,
  env: FeedbackEnv,
  id: string,
  local = false,
) {
  const actor = mediaActor(request);
  if (!actor) return fail(401, 'unauthorized');
  if (!mediaOriginAllowed(request, local)) return fail(403, 'forbidden');
  if (!mediaConfigured(env) || !uuid.safeParse(id).success)
    return fail(404, 'not_found');
  try {
    // A durable tombstone prevents concurrent claiming and retains the object
    // key for cleanup if the storage deletion fails.
    const row = await env
      .DB!.prepare(
        "UPDATE feedback_media SET submission_id = '__deleting__', expires_at = 0 WHERE id = ? AND owner_hash = ? AND submission_id IS NULL RETURNING object_key",
      )
      .bind(id, hashActor(actor, env))
      .first<{ object_key: string }>();
    if (!row) return fail(404, 'not_found');
    await env.MEDIA!.delete(row.object_key);
    await env
      .DB!.prepare(
        "DELETE FROM feedback_media WHERE id = ? AND submission_id = '__deleting__'",
      )
      .bind(id)
      .run();
    return Response.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return fail(503, 'attachment_unavailable');
  }
}
