import { createHmac, randomUUID } from 'node:crypto';
import {
  claimFeedbackMedia,
  releaseFeedbackMedia,
  mediaConfigured,
  cleanupExpiredMedia,
} from './feedback-media.ts';
import {
  feedbackSchema,
  normalizeFeedback,
  renderFeedbackIssue,
} from './feedback-contract.ts';

const BODY_LIMIT = 20_000;
const RETENTION_SECONDS = 30 * 86400;
const origins = new Set([
  'https://feedback.humanquest.net',
  'https://feedback-widget.albertine.chatgpt.site',
]);

export interface FeedbackEnv {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  FEEDBACK_REVIEWER_EMAILS?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  FEEDBACK_HASH_SECRET?: string;
}

type SubmitIssue = (issue: { title: string; body: string }) => Promise<string>;
type Dependencies = {
  createIssue: SubmitIssue;
  now?: () => number;
  local?: boolean;
};
type Receipt = {
  key: string;
  payload_hash: string;
  submission_id: string;
  state: string;
  issue_url: string | null;
};

export function feedbackConfigured(env: FeedbackEnv) {
  return Boolean(
    env.DB &&
    /^\d+$/.test(env.GITHUB_APP_ID ?? '') &&
    /^\d+$/.test(env.GITHUB_APP_INSTALLATION_ID ?? '') &&
    env.GITHUB_APP_PRIVATE_KEY?.includes('PRIVATE KEY') &&
    (env.FEEDBACK_HASH_SECRET?.length ?? 0) >= 32,
  );
}

export function feedbackActor(request: Request) {
  // These headers are stripped/replaced by Sites dispatch, never supplied by UI.
  return (
    request.headers.get('oai-authenticated-user-id') ||
    request.headers.get('oai-authenticated-user-email')
  );
}

function json(
  status: number,
  body: object,
  extra: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extra },
  });
}

function error(status: number, code: string, extra = {}) {
  return json(
    status,
    { success: false, code, ...extra },
    status === 429 ? { 'Retry-After': '3600' } : {},
  );
}

async function boundedBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT))
    throw new Error('payload_too_large');
  if (!request.body) throw new Error('invalid_request');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw new Error('payload_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function budget(
  db: D1Database,
  key: string,
  limit: number,
  expires: number,
) {
  const row = await db
    .prepare(`INSERT INTO feedback_budgets (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(key, expires, limit)
    .first();
  return Boolean(row);
}

function existingReceipt(row: Receipt, hash: string) {
  if (row.payload_hash !== hash) return error(409, 'idempotency_conflict');
  if (row.state === 'complete' && row.issue_url)
    return json(200, {
      success: true,
      submissionId: row.submission_id,
      issueUrl: row.issue_url,
    });
  return error(409, 'submission_pending', { submissionId: row.submission_id });
}

export async function handleFeedback(
  request: Request,
  env: FeedbackEnv,
  dependencies: Dependencies,
) {
  if (request.method === 'GET')
    return json(200, {
      authenticated: Boolean(feedbackActor(request)),
      available: feedbackConfigured(env),
      mediaAvailable: mediaConfigured(env),
    });
  if (request.method !== 'POST') return error(405, 'method_not_allowed');
  const actor = feedbackActor(request);
  if (!actor) return error(401, 'unauthorized');
  const origin = request.headers.get('origin');
  if (
    !origin ||
    (!origins.has(origin) &&
      !(dependencies.local && origin === 'http://localhost:3000'))
  )
    return error(403, 'forbidden');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return error(403, 'forbidden');
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    return error(415, 'invalid_request');
  if (!feedbackConfigured(env)) return error(503, 'setup_required');
  const db = env.DB!;
  const hash = (value: string) =>
    createHmac('sha256', env.FEEDBACK_HASH_SECRET!).update(value).digest('hex');
  const now = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
  try {
    await cleanupExpiredMedia(env, now);
    // Authenticated attempts, including invalid payloads, consume durable quotas.
    // Opportunistic TTL cleanup on traffic; never keep report bodies in D1.
    await db.batch([
      db.prepare('DELETE FROM feedback_budgets WHERE expires_at < ?').bind(now),
      db
        .prepare('DELETE FROM feedback_submissions WHERE created_at < ?')
        .bind(now - RETENTION_SECONDS),
    ]);
    const hour = Math.floor(now / 3600);
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (
      !(await budget(
        db,
        hash(`attempt-user:${actor}:${hour}`),
        30,
        now + 7200,
      )) ||
      !(await budget(db, hash(`attempt-ip:${ip}:${hour}`), 60, now + 7200))
    )
      return error(429, 'rate_limited');
    let raw: unknown;
    try {
      raw = await boundedBody(request);
    } catch (failure) {
      return error(
        failure instanceof Error && failure.message === 'payload_too_large'
          ? 413
          : 400,
        failure instanceof Error && failure.message === 'payload_too_large'
          ? 'payload_too_large'
          : 'invalid_request',
      );
    }
    const parsed = feedbackSchema.safeParse(raw);
    if (!parsed.success) return error(400, 'invalid_request');
    const normalized = normalizeFeedback(parsed.data);
    if (normalized.title.length < 3 || normalized.description.length < 10)
      return error(400, 'invalid_request');
    const payloadHash = hash(JSON.stringify(normalized));
    const key = hash(
      `github:alibad/feedback-widget:${actor}:${parsed.data.idempotencyKey}`,
    );
    const existing = await db
      .prepare('SELECT * FROM feedback_submissions WHERE key = ?')
      .bind(key)
      .first<Receipt>();
    if (existing) return existingReceipt(existing, payloadHash);
    if (
      !(await budget(db, hash(`send-user:${actor}:${hour}`), 3, now + 7200)) ||
      !(await budget(db, hash(`send-ip:${ip}:${hour}`), 10, now + 7200)) ||
      !(await budget(
        db,
        hash(`send-global:${Math.floor(now / 86400)}`),
        50,
        now + 172800,
      ))
    )
      return error(429, 'rate_limited');
    const submissionId = randomUUID();
    const reserved = await db
      .prepare(`INSERT INTO feedback_submissions (key, payload_hash, submission_id, state, created_at)
      VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(key) DO NOTHING RETURNING key`)
      .bind(key, payloadHash, submissionId, now)
      .first();
    if (!reserved) {
      const raced = await db
        .prepare('SELECT * FROM feedback_submissions WHERE key = ?')
        .bind(key)
        .first<Receipt>();
      return raced
        ? existingReceipt(raced, payloadHash)
        : error(503, 'submission_failed');
    }
    try {
      await claimFeedbackMedia(env, actor, parsed.data, submissionId, now);
    } catch {
      await db
        .prepare('DELETE FROM feedback_submissions WHERE key = ?')
        .bind(key)
        .run();
      return error(400, 'invalid_attachments');
    }
    try {
      const issueUrl = await dependencies.createIssue(
        renderFeedbackIssue(normalized, submissionId),
      );
      if (
        !/^https:\/\/github\.com\/alibad\/feedback-widget\/issues\/[1-9]\d*$/.test(
          issueUrl,
        )
      )
        throw new Error('invalid_receipt');
      await db
        .prepare(
          "UPDATE feedback_submissions SET state = 'complete', issue_url = ? WHERE key = ?",
        )
        .bind(issueUrl, key)
        .run();
      return json(201, { success: true, submissionId, issueUrl });
    } catch (failure) {
      const status =
        typeof failure === 'object' && failure !== null && 'status' in failure
          ? Number(failure.status)
          : 0;
      // Only a definitive rejection is retryable. Timeouts/5xx and receipt-store
      // failure remain reserved: the provider may already have created an issue.
      if ([400, 401, 403, 404, 422, 429].includes(status)) {
        await releaseFeedbackMedia(env, submissionId, now);
        await db
          .prepare('DELETE FROM feedback_submissions WHERE key = ?')
          .bind(key)
          .run();
        console.warn('feedback_provider_rejected', { submissionId, status });
        return error(502, 'submission_failed', { submissionId });
      }
      console.warn('feedback_outcome_uncertain', { submissionId });
      return error(409, 'submission_pending', { submissionId });
    }
  } catch {
    console.warn('feedback_boundary_unavailable');
    return error(503, 'submission_failed');
  }
}
