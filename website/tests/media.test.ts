import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  uploadFeedbackMedia,
  readFeedbackMedia,
  deleteFeedbackMedia,
  validateMedia,
  claimFeedbackMedia,
  cleanupExpiredMedia,
  MAX_MEDIA_BYTES,
} from '../lib/feedback-media.ts';
import { handleFeedback, type FeedbackEnv } from '../lib/feedback-server.ts';
import {
  normalizeFeedback,
  renderFeedbackIssue,
  type FeedbackInput,
} from '../lib/feedback-contract.ts';

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1kAAAAASUVORK5CYII=',
    'base64',
  ),
);
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const folder = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(folder)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(file, folder), 'utf8'));
  const prepare = (sql: string, values: (string | number)[] = []): unknown => ({
    bind: (...next: (string | number)[]) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => {
      sqlite.prepare(sql).run(...values);
      return { success: true };
    },
  });
  const db = {
    prepare,
    batch: async (statements: { run: () => Promise<unknown> }[]) =>
      Promise.all(statements.map((s) => s.run())),
  } as unknown as D1Database;
  const objects = new Map<string, Uint8Array>();
  let failDelete = false;
  const bucket = {
    put: async (key: string, value: Uint8Array) => {
      objects.set(key, value);
    },
    get: async (
      key: string,
      options?: { range: { offset: number; length: number } },
    ) => {
      const value = objects.get(key);
      return value
        ? {
            body: options?.range
              ? value.slice(
                  options.range.offset,
                  options.range.offset + options.range.length,
                )
              : value,
            size: value.length,
          }
        : null;
    },
    delete: async (key: string) => {
      if (failDelete) throw new Error('synthetic storage outage');
      objects.delete(key);
    },
  } as unknown as R2Bucket;
  const env: FeedbackEnv = {
    DB: db,
    MEDIA: bucket,
    FEEDBACK_REVIEWER_EMAILS: 'maintainer@example.test',
    FEEDBACK_HASH_SECRET: 'synthetic-only-test-hash-value-123456789',
    GITHUB_APP_ID: '123',
    GITHUB_APP_INSTALLATION_ID: '456',
    GITHUB_APP_PRIVATE_KEY: 'PRIVATE KEY synthetic fixture',
  };
  return {
    sqlite,
    env,
    objects,
    setFailDelete: (v: boolean) => {
      failDelete = v;
    },
  };
}
function req(
  method = 'POST',
  actor: string | null = 'reporter-a',
  headers: Record<string, string> = {},
  bytes: Uint8Array = png,
) {
  return new Request('https://feedback.humanquest.net/api/feedback/media', {
    method,
    headers: {
      origin: 'https://feedback.humanquest.net',
      'content-type': 'image/png',
      'x-feedback-kind': 'image',
      ...(actor ? { 'oai-authenticated-user-id': actor } : {}),
      ...headers,
    },
    ...(method === 'POST' ? { body: Uint8Array.from(bytes).buffer } : {}),
  });
}
function report(id?: string): FeedbackInput {
  return {
    title: 'Synthetic media test',
    description: 'This is an offline synthetic media test.',
    category: 'bug',
    consent: true,
    idempotencyKey: randomUUID(),
    ...(id ? { captures: [{ attachmentId: id }] } : {}),
  };
}
async function uploaded(f: ReturnType<typeof fixture>) {
  const r = await uploadFeedbackMedia(req(), f.env);
  assert.equal(r.status, 201);
  return ((await r.json()) as { id: string }).id;
}

test('image upload stays private to reporter and configured maintainer', async () => {
  const f = fixture();
  const id = await uploaded(f);
  assert.equal(
    (await readFeedbackMedia(req('GET', null), f.env, id)).status,
    401,
  );
  assert.equal(
    (await readFeedbackMedia(req('GET', 'reporter-b'), f.env, id)).status,
    404,
  );
  const own = await readFeedbackMedia(req('GET'), f.env, id);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
  assert.equal(
    (
      await readFeedbackMedia(
        req('GET', 'maintainer-id', {
          'oai-authenticated-user-email': 'maintainer@example.test',
        }),
        f.env,
        id,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await readFeedbackMedia(
        req('GET', 'wrong-id', {
          'oai-authenticated-user-email': 'not-maintainer@example.test',
        }),
        f.env,
        id,
      )
    ).status,
    404,
  );
  f.sqlite.close();
});
test('uploads enforce authentication and same-origin', async () => {
  const f = fixture();
  assert.equal(
    (await uploadFeedbackMedia(req('POST', null), f.env)).status,
    401,
  );
  assert.equal(
    (
      await uploadFeedbackMedia(
        req('POST', 'reporter-a', { origin: 'https://attacker.invalid' }),
        f.env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await uploadFeedbackMedia(
        req('POST', 'reporter-a', { 'sec-fetch-site': 'cross-site' }),
        f.env,
      )
    ).status,
    403,
  );
  assert.equal(f.objects.size, 0);
  f.sqlite.close();
});
test('missing reviewer or storage fails closed', async () => {
  const f = fixture();
  delete f.env.FEEDBACK_REVIEWER_EMAILS;
  assert.equal((await uploadFeedbackMedia(req(), f.env)).status, 503);
  assert.equal(f.objects.size, 0);
  f.sqlite.close();
});
test('MIME signatures and bounded file kinds reject active content', () => {
  for (const [mime, kind] of [
    ['image/png', 'image'],
    ['image/svg+xml', 'image'],
    ['text/html', 'file'],
    ['application/pdf', 'file'],
    ['video/webm', 'video'],
  ])
    assert.throws(() =>
      validateMedia(
        new TextEncoder().encode('<script>bad</script>'),
        mime,
        kind,
      ),
    );
  assert.equal(validateMedia(png, 'image/png', 'image').mime, 'image/png');
  assert.throws(() =>
    validateMedia(new Uint8Array(MAX_MEDIA_BYTES + 1), 'image/png', 'image'),
  );
});
test('streamed upload size limits hold without trusting content-length', async () => {
  const f = fixture();
  const r = await uploadFeedbackMedia(
    req('POST', 'reporter-a', {}, new Uint8Array(MAX_MEDIA_BYTES + 1)),
    f.env,
  );
  assert.equal(r.status, 413);
  assert.equal(f.objects.size, 0);
  f.sqlite.close();
});
test('plain-text files and diagnostics are redacted and schema bounded', () => {
  const enc = new TextEncoder(),
    dec = new TextDecoder();
  const result = validateMedia(
    enc.encode('Contact sample@example.test\nAuthorization: Bearer synthetic'),
    'text/plain',
    'file',
  );
  assert.ok(!dec.decode(result.bytes).includes('sample@example.test'));
  const diag = validateMedia(
    enc.encode(
      JSON.stringify({
        console: [
          {
            level: 'error',
            message: 'Cookie: synthetic-private',
            at: new Date().toISOString(),
          },
        ],
      }),
    ),
    'application/json',
    'diagnostics',
  );
  assert.ok(!dec.decode(diag.bytes).includes('synthetic-private'));
  for (const data of [
    { cookies: 'private' },
    {
      network: [
        {
          method: 'GET',
          path: '/account',
          status: 200,
          durationMs: 1,
          at: new Date().toISOString(),
        },
      ],
    },
    {},
  ])
    assert.throws(() =>
      validateMedia(
        enc.encode(JSON.stringify(data)),
        'application/json',
        'diagnostics',
      ),
    );
});
test('reporter cannot claim another reporter attachment or wrong media kind', async () => {
  const f = fixture();
  const id = await uploaded(f);
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(() =>
    claimFeedbackMedia(f.env, 'reporter-b', report(id), randomUUID(), now),
  );
  await assert.rejects(() =>
    claimFeedbackMedia(
      f.env,
      'reporter-a',
      { ...report(), videoAttachmentId: id },
      randomUUID(),
      now,
    ),
  );
  f.sqlite.close();
});
test('claim prevents reuse, duplicate references, and deletion of submitted media', async () => {
  const f = fixture();
  const id = await uploaded(f);
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(() =>
    claimFeedbackMedia(
      f.env,
      'reporter-a',
      { ...report(id), captures: [{ attachmentId: id }, { attachmentId: id }] },
      randomUUID(),
      now,
    ),
  );
  await claimFeedbackMedia(f.env, 'reporter-a', report(id), randomUUID(), now);
  await assert.rejects(() =>
    claimFeedbackMedia(f.env, 'reporter-a', report(id), randomUUID(), now),
  );
  assert.equal(
    (await deleteFeedbackMedia(req('DELETE'), f.env, id)).status,
    404,
  );
  assert.equal(f.objects.size, 1);
  f.sqlite.close();
});
test('expired media is inaccessible and cleaned on later traffic', async () => {
  const f = fixture();
  const id = await uploaded(f);
  f.sqlite.prepare('UPDATE feedback_media SET expires_at=0 WHERE id=?').run(id);
  assert.equal((await readFeedbackMedia(req('GET'), f.env, id)).status, 404);
  await cleanupExpiredMedia(f.env, Math.floor(Date.now() / 1000));
  assert.equal(f.objects.size, 0);
  assert.equal(
    f.sqlite.prepare('SELECT count(*) n FROM feedback_media').get()?.n,
    0,
  );
  f.sqlite.close();
});
test('failed object deletion leaves recoverable tombstone and blocks claims', async () => {
  const f = fixture();
  const id = await uploaded(f);
  f.setFailDelete(true);
  assert.equal(
    (await deleteFeedbackMedia(req('DELETE'), f.env, id)).status,
    503,
  );
  assert.equal(f.objects.size, 1);
  assert.equal((await readFeedbackMedia(req('GET'), f.env, id)).status, 404);
  await assert.rejects(() =>
    claimFeedbackMedia(
      f.env,
      'reporter-a',
      report(id),
      randomUUID(),
      Math.floor(Date.now() / 1000),
    ),
  );
  f.setFailDelete(false);
  await cleanupExpiredMedia(f.env, Math.floor(Date.now() / 1000));
  assert.equal(f.objects.size, 0);
  f.sqlite.close();
});
test('aggregate attachment budget is enforced', async () => {
  const f = fixture();
  const ids = [await uploaded(f), await uploaded(f), await uploaded(f)];
  f.sqlite.prepare('UPDATE feedback_media SET size=?').run(10 * 1024 * 1024);
  await assert.rejects(() =>
    claimFeedbackMedia(
      f.env,
      'reporter-a',
      { ...report(), captures: ids.map((id) => ({ attachmentId: id })) },
      randomUUID(),
      Math.floor(Date.now() / 1000),
    ),
  );
  f.sqlite.close();
});
test('private links are fixed-origin UUIDs; selected labels cannot inject markdown', () => {
  const id = randomUUID();
  const issue = renderFeedbackIssue(
    normalizeFeedback({
      ...report(id),
      captures: [
        {
          attachmentId: id,
          elementInfo: '[click](https://attacker.invalid) ` @everyone',
        },
      ],
    }),
    randomUUID(),
  );
  assert.ok(issue.body.includes(`/feedback/attachments/${id}`));
  assert.ok(issue.body.includes('`[click](https://attacker.invalid)'));
  assert.ok(!issue.body.includes('@everyone'));
  assert.ok(!issue.body.includes('reporter-a'));
});
test('media submission attaches privately, deduplicates retries, and keeps bodies out of D1', async () => {
  const f = fixture();
  const id = await uploaded(f);
  const payload = report(id);
  let sends = 0;
  const createIssue = async () => {
    sends++;
    return 'https://github.com/alibad/feedback-widget/issues/123';
  };
  const request = () =>
    new Request('https://feedback.humanquest.net/api/feedback', {
      method: 'POST',
      headers: {
        origin: 'https://feedback.humanquest.net',
        'content-type': 'application/json',
        'oai-authenticated-user-id': 'reporter-a',
      },
      body: JSON.stringify(payload),
    });
  assert.equal(
    (await handleFeedback(request(), f.env, { createIssue })).status,
    201,
  );
  assert.equal(
    (await handleFeedback(request(), f.env, { createIssue })).status,
    200,
  );
  assert.equal(sends, 1);
  const rows = JSON.stringify(
    f.sqlite.prepare('SELECT * FROM feedback_media').all(),
  );
  assert.ok(!rows.includes('reporter-a'));
  assert.ok(!rows.includes(payload.description));
  f.sqlite.close();
});
test('authenticated byte ranges support private media seeking', async () => {
  const f = fixture();
  const id = await uploaded(f);
  const r = await readFeedbackMedia(
    req('GET', 'reporter-a', { range: 'bytes=0-7' }),
    f.env,
    id,
  );
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-length'), '8');
  assert.equal((await r.arrayBuffer()).byteLength, 8);
  assert.equal(
    (
      await readFeedbackMedia(
        req('GET', 'reporter-b', { range: 'bytes=0-7' }),
        f.env,
        id,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await readFeedbackMedia(
        req('GET', 'reporter-a', { range: 'bytes=999999-' }),
        f.env,
        id,
      )
    ).status,
    416,
  );
  f.sqlite.close();
});

test('concurrent claim gives one submission exclusive ownership', async () => {
  const f = fixture();
  const id = await uploaded(f);
  const now = Math.floor(Date.now() / 1000);
  const results = await Promise.allSettled([
    claimFeedbackMedia(f.env, 'reporter-a', report(id), randomUUID(), now),
    claimFeedbackMedia(f.env, 'reporter-a', report(id), randomUUID(), now),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  f.sqlite.close();
});
