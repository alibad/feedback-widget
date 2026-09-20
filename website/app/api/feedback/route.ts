import { env } from 'cloudflare:workers';
import { handleFeedback, type FeedbackEnv } from '@/lib/feedback-server';
import { createGitHubFeedback } from '@/lib/feedback-github';

export const dynamic = 'force-dynamic';

function handle(request: Request) {
  const configuration = env as unknown as FeedbackEnv;
  return handleFeedback(request, configuration, {
    local: import.meta.env.DEV,
    createIssue: (issue) => createGitHubFeedback(configuration, issue),
  });
}

export const GET = handle;
export const POST = handle;
