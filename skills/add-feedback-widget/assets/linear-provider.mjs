// Server-only building block, not an authenticated HTTP endpoint.
// The caller owns tenant authorization, redaction and durable idempotency.
import { createHmac, timingSafeEqual } from 'node:crypto';

const ENDPOINT = 'https://api.linear.app/graphql';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATION = `mutation FeedbackIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`;

export class LinearDeliveryError extends Error {
  constructor(code, uncertain = false) {
    super(code);
    this.name = 'LinearDeliveryError';
    this.code = code;
    this.uncertain = uncertain;
  }
}

function serverOnly() {
  if (typeof window !== 'undefined') throw new LinearDeliveryError('server_only');
}

function validText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 &&
    Array.from(value).length <= limit;
}

export function createLinearProvider(config, { fetchImpl = globalThis.fetch } = {}) {
  serverOnly();
  if (!config || !['api-key', 'oauth'].includes(config.authType) ||
      typeof config.token !== 'string' || !config.token.trim() ||
      config.token.length > 4096 || /\s/.test(config.token) ||
      !UUID.test(config.teamId ?? '') || typeof fetchImpl !== 'function') {
    throw new LinearDeliveryError('setup_required');
  }
  for (const key of ['projectId', 'stateId']) {
    if (config[key] !== undefined && !UUID.test(config[key])) {
      throw new LinearDeliveryError('setup_required');
    }
  }
  if (config.labelIds !== undefined && (!Array.isArray(config.labelIds) ||
      config.labelIds.length > 20 || config.labelIds.some(id => typeof id !== 'string' || !UUID.test(id)))) {
    throw new LinearDeliveryError('setup_required');
  }
  const routing = {
    teamId: config.teamId,
    ...(config.projectId ? { projectId: config.projectId } : {}),
    ...(config.stateId ? { stateId: config.stateId } : {}),
    ...(config.labelIds ? { labelIds: [...config.labelIds] } : {}),
  };
  const authorization = config.authType === 'oauth' ? `Bearer ${config.token}` : config.token;

  return Object.freeze({
    async createIssue(report) {
      serverOnly();
      if (!report || Object.keys(report).some(key => !['title', 'description'].includes(key)) ||
          !validText(report.title, 120) || !validText(report.description, 10000) ||
          /[\r\n\u0000-\u001f\u007f]/.test(report.title)) {
        throw new LinearDeliveryError('invalid_request');
      }
      let response;
      let body;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authorization },
          body: JSON.stringify({ query: MUTATION, variables: { input: { ...report, ...routing } } }),
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        // No automatic retries. A lost response may follow a successful create.
        if (response.status === 401 || response.status === 403) {
          throw new LinearDeliveryError('provider_unauthorized');
        }
        if (response.status === 429) throw new LinearDeliveryError('provider_rate_limited');
        if (!response.ok) throw new LinearDeliveryError('provider_failed', true);
        body = await response.json();
      } catch (error) {
        if (error instanceof LinearDeliveryError) throw error;
        // Never pass through fetch/provider error messages or token-bearing context.
        throw new LinearDeliveryError('delivery_uncertain', true);
      }
      const result = body?.data?.issueCreate;
      const issue = result?.issue;
      if ((body?.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length > 0)) ||
          result?.success !== true || !issue || typeof issue.id !== 'string' || !UUID.test(issue.id) ||
          !validText(issue.identifier, 100) || typeof issue.url !== 'string' || issue.url.length > 2048) {
        throw new LinearDeliveryError('delivery_uncertain', true);
      }
      let url;
      try { url = new URL(issue.url); } catch { throw new LinearDeliveryError('delivery_uncertain', true); }
      if (url.protocol !== 'https:' || url.hostname !== 'linear.app' || url.port ||
          url.username || url.password || url.search || url.hash || !url.pathname.includes('/issue/')) {
        throw new LinearDeliveryError('delivery_uncertain', true);
      }
      return { provider: 'linear', id: issue.id, displayId: issue.identifier, url: url.href };
    },
  });
}

// Returns a verified payload, not authorization to notify or access its tenant.
export function verifyLinearWebhook(rawBody, signature, secret, now = Date.now()) {
  serverOnly();
  if (!Buffer.isBuffer(rawBody) || rawBody.length > 1024 * 1024 ||
      typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature) ||
      typeof secret !== 'string' || !secret || !Number.isFinite(now)) return null;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  if (!timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isFinite(payload.webhookTimestamp) ||
        Math.abs(now - payload.webhookTimestamp) > 60000) return null;
    return payload;
  } catch { return null; }
}
