import { env } from 'cloudflare:workers';
import { uploadFeedbackMedia } from '@/lib/feedback-media';
import type { FeedbackEnv } from '@/lib/feedback-server';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return uploadFeedbackMedia(
    request,
    env as unknown as FeedbackEnv,
    import.meta.env.DEV,
  );
}
