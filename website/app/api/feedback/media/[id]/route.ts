import { env } from 'cloudflare:workers';
import { readFeedbackMedia, deleteFeedbackMedia } from '@/lib/feedback-media';
import type { FeedbackEnv } from '@/lib/feedback-server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return readFeedbackMedia(
    request,
    env as unknown as FeedbackEnv,
    (await context.params).id,
  );
}
export async function DELETE(request: Request, context: Context) {
  return deleteFeedbackMedia(
    request,
    env as unknown as FeedbackEnv,
    (await context.params).id,
    import.meta.env.DEV,
  );
}
