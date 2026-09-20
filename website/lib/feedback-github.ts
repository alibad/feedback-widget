import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { FeedbackEnv } from './feedback-server';

export async function createGitHubFeedback(
  env: FeedbackEnv,
  issue: { title: string; body: string },
) {
  const appAuth = createAppAuth({
    appId: env.GITHUB_APP_ID!,
    privateKey: env.GITHUB_APP_PRIVATE_KEY!,
    installationId: Number(env.GITHUB_APP_INSTALLATION_ID),
  });
  const auth = await appAuth({
    type: 'installation',
    repositoryNames: ['feedback-widget'],
    permissions: { issues: 'write' },
  });
  const github = new Octokit({
    auth: auth.token,
    request: { timeout: 12000 },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  });
  const result = await github.issues.create({
    owner: 'alibad',
    repo: 'feedback-widget',
    ...issue,
  });
  return result.data.html_url;
}
