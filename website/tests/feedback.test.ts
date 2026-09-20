import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { handleFeedback, type FeedbackEnv } from '../lib/feedback-server.ts';
import {
  feedbackSchema,
  normalizeFeedback,
  redactFeedback,
  renderFeedbackIssue,
} from '../lib/feedback-contract.ts';

// Real SQLite validates SQL and uniqueness; only the external provider is mocked.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0000_tidy_vindicator.sql', import.meta.url),
      'utf8',
    ),
  );
  const prepare = (sql: string, values: (string | number)[] = []): unknown => ({
    bind: (...next: (string | number)[]) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    run: async () => {
      sqlite.prepare(sql).run(...values);
      return { success: true };
    },
  });
  const db = {
    prepare,
    batch: async (statements: { run: () => Promise<unknown> }[]) =>
      Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;
  const env: FeedbackEnv = {
    DB: db,
    GITHUB_APP_ID: '123',
    GITHUB_APP_INSTALLATION_ID: '456',
    GITHUB_APP_PRIVATE_KEY: 'PRIVATE KEY synthetic fixture',
    FEEDBACK_HASH_SECRET: 'synthetic-test-hmac-value-only-123456789',
  };
  const sent: { title: string; body: string }[] = [];
  const deps = {
    createIssue: async (issue: { title: string; body: string }) => {
      sent.push(issue);
      return 'https://github.com/alibad/feedback-widget/issues/123';
    },
  };
  return { sqlite, env, sent, deps };
}

function payload(extra = {}) {
  return {
    title: 'A synthetic test report',
    description: 'Expected an accessible feedback dialog.',
    category: 'bug',
    consent: true,
    idempotencyKey: randomUUID(),
    ...extra,
  };
}
function request(
  body: unknown = payload(),
  overrides: Record<string, string | null> = {},
) {
  const headers = new Headers({
    Origin: 'https://feedback.humanquest.net',
    'Content-Type': 'application/json',
    'oai-authenticated-user-id': 'synthetic-actor',
    'cf-connecting-ip': '192.0.2.1',
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  return new Request('https://feedback.humanquest.net/api/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('valid report is delivered, redacted, and stored without text or identity', async () => {
  const f = fixture();
  const response = await handleFeedback(
    request(
      payload({
        description:
          'Email synthetic@example.com; token ghp_FAKE1234567890abcdef only.',
      }),
    ),
    f.env,
    f.deps,
  );
  assert.equal(response.status, 201);
  assert.equal(f.sent.length, 1);
  assert.ok(!f.sent[0].body.includes('synthetic@example.com'));
  assert.ok(!f.sent[0].body.includes('ghp_FAKE'));
  const stored = JSON.stringify(
    f.sqlite.prepare('SELECT * FROM feedback_submissions').all(),
  );
  assert.ok(!stored.includes('synthetic-actor'));
  assert.ok(!stored.includes('Expected an accessible'));
  f.sqlite.close();
});

for (const [name, headers, status] of [
  ['missing auth', { 'oai-authenticated-user-id': null }, 401],
  ['wrong origin', { Origin: 'https://attacker.invalid' }, 403],
  ['missing origin', { Origin: null }, 403],
  ['cross-site browser', { 'sec-fetch-site': 'cross-site' }, 403],
  ['wrong content type', { 'Content-Type': 'text/plain' }, 415],
] as const)
  test(name, async () => {
    const f = fixture();
    assert.equal(
      (await handleFeedback(request(payload(), headers), f.env, f.deps)).status,
      status,
    );
    assert.equal(f.sent.length, 0);
    f.sqlite.close();
  });

for (const invalid of [
  { consent: false },
  { category: 'malicious' },
  { owner: 'another-repo' },
  { title: 'x' },
  { description: 'x' },
  { description: 'x'.repeat(4001) },
  { title: 'x'.repeat(121) },
  { idempotencyKey: 'not-a-uuid' },
  { captures: [{ elementInfo: '' }] },
  { diagnostics: {} },
  { email: 'fake@example.com' },
])
  test(`closed schema rejects ${Object.keys(invalid)[0]} (${JSON.stringify(invalid).length})`, async () => {
    const f = fixture();
    assert.equal(
      (await handleFeedback(request(payload(invalid)), f.env, f.deps)).status,
      400,
    );
    assert.equal(f.sent.length, 0);
    f.sqlite.close();
  });

test('server secrets missing fail closed', async () => {
  const f = fixture();
  delete f.env.GITHUB_APP_PRIVATE_KEY;
  const response = await handleFeedback(request(), f.env, f.deps);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('PRIVATE_KEY'));
  assert.equal(f.sent.length, 0);
  f.sqlite.close();
});

test('oversize bodies are rejected with or without content-length', async () => {
  const f = fixture();
  for (const headers of [{}, { 'Content-Length': '25000' }] as Record<
    string,
    string | null
  >[]) {
    assert.equal(
      (
        await handleFeedback(
          request(payload({ description: 'x'.repeat(25000) }), headers),
          f.env,
          f.deps,
        )
      ).status,
      413,
    );
  }
  assert.equal(f.sent.length, 0);
  f.sqlite.close();
});

test('completed retries reuse receipt and changed payload conflicts', async () => {
  const f = fixture();
  const body = payload();
  const first = await handleFeedback(request(body), f.env, f.deps);
  const next = await handleFeedback(request(body), f.env, f.deps);
  assert.equal(next.status, 200);
  assert.deepEqual(await first.json(), await next.json());
  assert.equal(
    (
      await handleFeedback(
        request({ ...body, title: 'Changed title' }),
        f.env,
        f.deps,
      )
    ).status,
    409,
  );
  assert.equal(f.sent.length, 1);
  f.sqlite.close();
});

test('concurrent sends reserve only one issue', async () => {
  const f = fixture();
  const body = payload();
  await Promise.all([
    handleFeedback(request(body), f.env, f.deps),
    handleFeedback(request(body), f.env, f.deps),
  ]);
  assert.equal(f.sent.length, 1);
  f.sqlite.close();
});

test('uncertain delivery stays reserved across retries', async () => {
  const f = fixture();
  const body = payload();
  let calls = 0;
  const deps = {
    createIssue: async () => {
      calls++;
      throw new Error('network lost after create');
    },
  };
  assert.equal((await handleFeedback(request(body), f.env, deps)).status, 409);
  assert.equal((await handleFeedback(request(body), f.env, deps)).status, 409);
  assert.equal(calls, 1);
  f.sqlite.close();
});

test('definitive provider rejection permits safe retry without leaking error', async () => {
  const f = fixture();
  const body = payload();
  const response = await handleFeedback(request(body), f.env, {
    createIssue: async () => {
      throw Object.assign(new Error('sensitive provider detail'), {
        status: 403,
      });
    },
  });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('sensitive'));
  assert.equal(
    (await handleFeedback(request(body), f.env, f.deps)).status,
    201,
  );
  f.sqlite.close();
});

test('per-user rate limit is durable and returns retry guidance', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++)
    assert.equal((await handleFeedback(request(), f.env, f.deps)).status, 201);
  const response = await handleFeedback(request(), f.env, f.deps);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '3600');
  assert.equal(f.sent.length, 3);
  f.sqlite.close();
});

test('per-IP quota applies across users', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await handleFeedback(
          request(payload(), { 'oai-authenticated-user-id': `actor-${i}` }),
          f.env,
          f.deps,
        )
      ).status,
      201,
    );
  assert.equal(
    (
      await handleFeedback(
        request(payload(), { 'oai-authenticated-user-id': 'another' }),
        f.env,
        f.deps,
      )
    ).status,
    429,
  );
  f.sqlite.close();
});

test('global daily quota bounds distributed abuse', async () => {
  const f = fixture();
  for (let i = 0; i < 50; i++)
    assert.equal(
      (
        await handleFeedback(
          request(payload(), {
            'oai-authenticated-user-id': `actor-${i}`,
            'cf-connecting-ip': `192.0.2.${i}`,
          }),
          f.env,
          f.deps,
        )
      ).status,
      201,
    );
  assert.equal(
    (
      await handleFeedback(
        request(payload(), {
          'oai-authenticated-user-id': 'actor-51',
          'cf-connecting-ip': '192.0.2.51',
        }),
        f.env,
        f.deps,
      )
    ).status,
    429,
  );
  f.sqlite.close();
});

test('retention cleanup expires old receipts and budgets', async () => {
  const f = fixture();
  f.sqlite
    .prepare(
      "INSERT INTO feedback_submissions VALUES ('old', 'hash', 'id', 'complete', NULL, 1)",
    )
    .run();
  f.sqlite.prepare("INSERT INTO feedback_budgets VALUES ('old', 1, 1)").run();
  await handleFeedback(request(), f.env, f.deps);
  assert.equal(
    f.sqlite
      .prepare("SELECT * FROM feedback_submissions WHERE key = 'old'")
      .get(),
    undefined,
  );
  assert.equal(
    f.sqlite.prepare("SELECT * FROM feedback_budgets WHERE key = 'old'").get(),
    undefined,
  );
  f.sqlite.close();
});

test('redaction handles secrets, headers, queries, email, and mentions', () => {
  const value =
    'Authorization: Bearer synthetic-token\nCookie: a=b\nAPI_KEY=synthetic-secret\nhttps://example.invalid/?token=synthetic-value\nfixture@example.com @someone\n-----BEGIN PRIVATE KEY-----\nsynthetic key\n-----END PRIVATE KEY-----';
  const redacted = redactFeedback(value);
  for (const secret of [
    'synthetic-token',
    'a=b',
    'synthetic-secret',
    'synthetic-value',
    'fixture@example.com',
    '@someone',
    'synthetic key',
  ])
    assert.ok(!redacted.includes(secret));
});

test('markdown remains literal and site context is server-owned', () => {
  const input = feedbackSchema.parse(
    payload({
      description: '```\n@someone [click](https://example.invalid)\n```',
    }),
  );
  const rendered = renderFeedbackIssue(normalizeFeedback(input), randomUUID());
  assert.ok(rendered.body.includes('````text'));
  assert.ok(!rendered.body.includes('@someone'));
  assert.ok(rendered.body.includes('https://feedback.humanquest.net/'));
});

test('status response contains no identity or secret', async () => {
  const f = fixture();
  const response = await handleFeedback(
    new Request('https://feedback.humanquest.net/api/feedback'),
    f.env,
    f.deps,
  );
  assert.deepEqual(await response.json(), {
    authenticated: false,
    available: true,
    mediaAvailable: false,
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  f.sqlite.close();
});
