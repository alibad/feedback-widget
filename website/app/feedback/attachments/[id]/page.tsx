import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { getMediaRecord, mediaActor } from '@/lib/feedback-media';
import type { FeedbackEnv } from '@/lib/feedback-server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Private feedback attachment',
  description:
    'Sign-in is required to review this private feedback attachment.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Private feedback attachment',
    description: 'Sign-in required. This attachment is not public.',
    images: [],
  },
  twitter: {
    title: 'Private feedback attachment',
    description: 'Sign-in required. This attachment is not public.',
    images: [],
  },
};
export default async function AttachmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = new Request(
    'https://feedback.humanquest.net/feedback/attachments/' +
      encodeURIComponent(id),
    { headers: await headers() },
  );
  if (!mediaActor(request))
    return (
      <main className="attachment-page wrap">
        <h1>Private feedback attachment</h1>
        <p>
          Sign in as the reporter or an authorized maintainer to open this file.
        </p>
        <a
          className="action action-primary"
          href={
            '/signin-with-chatgpt?return_to=' +
            encodeURIComponent('/feedback/attachments/' + id)
          }
          target="_top"
        >
          Sign in with ChatGPT
        </a>
      </main>
    );
  const record = await getMediaRecord(
    request,
    env as unknown as FeedbackEnv,
    id,
  );
  if (!record)
    return (
      <main className="attachment-page wrap">
        <h1>Attachment unavailable</h1>
        <p>
          It may have expired, or your account does not have access. Media is
          private and expires after seven days.
        </p>
        <a className="text-link" href="/">
          Back to Feedback Widget
        </a>
      </main>
    );
  const source = '/api/feedback/media/' + id;
  return (
    <main className="attachment-page wrap">
      <h1>Private feedback attachment</h1>
      <p>
        Visible only to the reporter and configured maintainer. Expires{' '}
        {new Date(record.expires_at * 1000).toISOString().slice(0, 10)}.
      </p>
      {record.kind === 'image' ? (
        <img src={source} alt="Reporter-submitted feedback capture" />
      ) : record.kind === 'video' ? (
        <video src={source} controls />
      ) : record.kind === 'audio' ? (
        <audio src={source} controls />
      ) : null}
      <a className="action action-primary" href={source} download>
        Download attachment
      </a>
      <a className="text-link" href="/">
        Back to Feedback Widget
      </a>
    </main>
  );
}
