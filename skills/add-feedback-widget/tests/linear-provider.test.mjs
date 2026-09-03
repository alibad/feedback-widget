import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLinearProvider, verifyLinearWebhook } from '../assets/linear-provider.mjs';

// Synthetic fixtures only. No environment reads or live network requests.
const TEAM = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const ISSUE = '33333333-3333-4333-8333-333333333333';
const config = { authType: 'api-key', token: 'test-only-not-a-credential', teamId: TEAM };
const report = { title: 'Settings do not save', description: 'Synthetic report for an offline test.' };
const issue = { id: ISSUE, identifier: 'TEST-1', url: 'https://linear.app/example/issue/TEST-1/settings' };
const success = () => ({ data: { issueCreate: { success: true, issue } } });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const isError = (code, uncertain) => error => error.code === code && error.uncertain === uncertain;

for (const authType of ['api-key', 'oauth']) {
  test(`${authType}: fixed endpoint, correct authorization, variables, configured routing`, async () => {
    let calls = 0;
    const provider = createLinearProvider({ ...config, authType, projectId: PROJECT }, {
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(url, 'https://api.linear.app/graphql');
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.headers.Authorization, authType === 'oauth' ? `Bearer ${config.token}` : config.token);
        const payload = JSON.parse(options.body);
        assert.match(payload.query, /IssueCreateInput!/);
        assert.deepEqual(payload.variables.input, { ...report, teamId: TEAM, projectId: PROJECT });
        return response(success());
      },
    });
    assert.deepEqual(await provider.createIssue(report), {
      provider: 'linear', id: ISSUE, displayId: 'TEST-1', url: issue.url,
    });
    assert.equal(calls, 1);
  });
}

test('mutating caller configuration cannot change destination or labels later', async () => {
  const mutable = { ...config, labelIds: [PROJECT] };
  const provider = createLinearProvider(mutable, { fetchImpl: async (_, options) => {
    const input = JSON.parse(options.body).variables.input;
    assert.equal(input.teamId, TEAM);
    assert.deepEqual(input.labelIds, [PROJECT]);
    return response(success());
  } });
  mutable.teamId = ISSUE;
  mutable.labelIds[0] = ISSUE;
  await provider.createIssue(report);
});

test('client routing fields and invalid report shapes fail before network', async () => {
  const provider = createLinearProvider(config, { fetchImpl: () => assert.fail('network must not run') });
  for (const input of [null, {}, { ...report, teamId: PROJECT }, { ...report, token: 'x' },
    { ...report, labelIds: [] }, { ...report, title: 'x\ny' }, { ...report, title: 'x'.repeat(121) },
    { ...report, description: 'x'.repeat(10001) }, { ...report, description: ' ' }]) {
    await assert.rejects(provider.createIssue(input), isError('invalid_request', false));
  }
});

test('malformed credentials and destination configuration fail closed', () => {
  for (const candidate of [{ ...config, token: '' }, { ...config, token: 'x\ny' },
    { ...config, teamId: 'TEAM' }, { ...config, projectId: 'not-a-uuid' },
    { ...config, authType: 'guess' }, { ...config, labelIds: ['not-a-uuid'] },
    { ...config, labelIds: Array(21).fill(PROJECT) }]) {
    assert.throws(() => createLinearProvider(candidate), isError('setup_required', false));
  }
});

for (const [status, code, uncertain] of [[401, 'provider_unauthorized', false],
  [403, 'provider_unauthorized', false], [429, 'provider_rate_limited', false],
  [500, 'provider_failed', true]]) {
  test(`HTTP ${status}: bounded error, one attempt, no provider text leakage`, async () => {
    let calls = 0;
    const provider = createLinearProvider(config, { fetchImpl: async () => {
      calls++;
      return response({ message: config.token }, status);
    } });
    await assert.rejects(provider.createIssue(report), isError(code, uncertain));
    assert.equal(calls, 1);
  });
}

for (const [name, body] of [
  ['GraphQL partial success', { ...success(), errors: [{ message: config.token }] }],
  ['false success', { data: { issueCreate: { success: false } } }],
  ['missing receipt', { data: { issueCreate: { success: true } } }],
  ['untrusted URL', { data: { issueCreate: { success: true, issue: { ...issue, url: 'https://example.com/issue/TEST-1' } } } }],
  ['credential URL', { data: { issueCreate: { success: true, issue: { ...issue, url: 'https://linear.app/example/issue/TEST-1?token=example' } } } }],
]) {
  test(`${name}: do not retry an uncertain create`, async () => {
    let calls = 0;
    const provider = createLinearProvider(config, { fetchImpl: async () => { calls++; return response(body); } });
    await assert.rejects(provider.createIssue(report), isError('delivery_uncertain', true));
    assert.equal(calls, 1);
  });
}

test('transport errors and malformed JSON are uncertain and sanitized', async () => {
  for (const fetchImpl of [async () => { throw new Error(config.token); },
    async () => new Response('not json', { status: 200 })]) {
    const provider = createLinearProvider(config, { fetchImpl });
    await assert.rejects(provider.createIssue(report), error => {
      assert.equal(error.message.includes(config.token), false);
      return isError('delivery_uncertain', true)(error);
    });
  }
});

const NOW = 1700000000000;
const secret = 'synthetic-webhook-signing-secret';
const sign = raw => createHmac('sha256', secret).update(raw).digest('hex');
const raw = Buffer.from(JSON.stringify({ type: 'Issue', action: 'update', webhookTimestamp: NOW }));

test('webhook accepts a valid raw-body signature and fresh timestamp', () => {
  assert.deepEqual(verifyLinearWebhook(raw, sign(raw), secret, NOW), JSON.parse(raw));
});

test('webhook rejects malformed/missing signatures without throwing', () => {
  for (const signature of [null, '', 'abcd', 'z'.repeat(64), '0'.repeat(64), sign(raw).slice(1)]) {
    assert.equal(verifyLinearWebhook(raw, signature, secret, NOW), null);
  }
  assert.equal(verifyLinearWebhook(raw, sign(raw), '', NOW), null);
  assert.equal(verifyLinearWebhook(raw, sign(raw), secret, NaN), null);
});

test('webhook verifies bytes before JSON and rejects body tampering', () => {
  const changed = Buffer.from(raw.toString().replace('update', 'remove'));
  assert.equal(verifyLinearWebhook(changed, sign(raw), secret, NOW), null);
});

test('webhook rejects stale, future, missing and nonnumeric timestamps', () => {
  for (const webhookTimestamp of [NOW - 60001, NOW + 60001, undefined, null, '1700000000000']) {
    const body = Buffer.from(JSON.stringify({ webhookTimestamp }));
    assert.equal(verifyLinearWebhook(body, sign(body), secret, NOW), null);
  }
});

test('webhook rejects oversized, malformed and non-object bodies', () => {
  for (const body of [Buffer.alloc(1024 * 1024 + 1), Buffer.from('not json'), Buffer.from('null'), Buffer.from('[]')]) {
    assert.equal(verifyLinearWebhook(body, sign(body), secret, NOW), null);
  }
});
