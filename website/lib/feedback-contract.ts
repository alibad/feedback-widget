import { z } from 'zod';

export const feedbackCategories = {
  bug: 'Bug report',
  feature: 'Feature request',
  'ui-ux': 'Design / usability',
  general: 'General feedback',
} as const;

export const feedbackSchema = z
  .object({
    // Optional by contract: the description carries the report, and a summary
    // can be derived from it. Requiring both asks for the same thing twice,
    // and that is where reports get abandoned.
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().min(10).max(4000),
    category: z.enum(['bug', 'feature', 'ui-ux', 'general']),
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
    captures: z
      .array(
        z
          .object({
            elementInfo: z.string().max(300).optional(),
            position: z
              .object({
                x: z.number().finite().min(0).max(20000),
                y: z.number().finite().min(0).max(20000),
              })
              .strict()
              .optional(),
            attachmentId: z.uuid().optional(),
          })
          .strict()
          .refine((c) => Boolean(c.elementInfo || c.attachmentId)),
      )
      .max(8)
      .optional(),
    videoAttachmentId: z.uuid().optional(),
    audioAttachmentId: z.uuid().optional(),
    attachments: z
      .array(z.object({ id: z.uuid() }).strict())
      .max(5)
      .optional(),
    diagnosticsAttachmentId: z.uuid().optional(),
  })
  .strict();

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackAccessSchema = z.object({
  authenticated: z.boolean(),
  available: z.boolean(),
  mediaAvailable: z.boolean().optional(),
});
export const feedbackResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    issueUrl: z
      .string()
      .regex(
        /^https:\/\/github\.com\/alibad\/feedback-widget\/issues\/[1-9]\d*$/,
      ),
    submissionId: z.uuid(),
  }),
  z.object({
    success: z.literal(false),
    code: z.string(),
    submissionId: z.uuid().optional(),
  }),
]);

// Defense in depth, not a promise to recognize every secret. Reporters review
// public text and any explicitly enabled private diagnostics before sending.
export function redactFeedback(value: string) {
  return value
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,
      '[private key removed]',
    )
    .replace(
      /\b(?:Authorization|Cookie|Set-Cookie)\s*[:=][^\r\n]*/gi,
      '[sensitive header removed]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, '[token removed]')
    .replace(
      /\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,})\b/g,
      '[token removed]',
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[token removed]',
    )
    .replace(
      /([?&](?:token|code|key|secret|password|email|session)=)[^\s&#]+/gi,
      '$1[removed]',
    )
    .replace(
      /\b(?:[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|PRIVATE_KEY|SECRET|PASSWORD)|api[-_ ]?key|password|secret)\s*[:=]\s*[^\r\n]+/gi,
      '[secret removed]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      '',
    )
    .replace(/@/g, '＠')
    .trim();
}

/**
 * The summary, or one made from the report when the reporter left it blank.
 *
 * A title can be derived from a description; a description cannot be derived
 * from a title, which is why the requirement sits on the description and this
 * exists. Takes the first sentence or line, whichever ends sooner, so the
 * derived summary reads like a summary rather than a truncated paragraph.
 */
export function deriveTitle(title: string | undefined, description: string) {
  const flatten = (value: string) =>
    redactFeedback(value)
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
  const given = flatten(title ?? '');
  if (given.length >= 3) return given.slice(0, 120);
  const firstLine = redactFeedback(description).split(/\r?\n/, 1)[0] ?? '';
  const sentence = firstLine.split(/(?<=[.!?])\s/, 1)[0] ?? firstLine;
  const summary = flatten(sentence || firstLine);
  if (summary.length <= 120) return summary;
  // Cut on a word boundary so the issue list does not fill with half-words.
  const cut = summary.slice(0, 120);
  const space = cut.lastIndexOf(' ');
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function normalizeFeedback(input: FeedbackInput) {
  return {
    title: deriveTitle(input.title, input.description),
    description: redactFeedback(input.description).slice(0, 4000),
    category: input.category,
    ...(input.captures?.length
      ? {
          captures: input.captures.map((c) => ({
            ...(c.elementInfo
              ? {
                  elementInfo: redactFeedback(c.elementInfo)
                    .replace(/[\r\n`]/g, ' ')
                    .slice(0, 300),
                }
              : {}),
            ...(c.position ? { position: c.position } : {}),
            ...(c.attachmentId ? { attachmentId: c.attachmentId } : {}),
          })),
        }
      : {}),
    ...(input.videoAttachmentId
      ? { videoAttachmentId: input.videoAttachmentId }
      : {}),
    ...(input.audioAttachmentId
      ? { audioAttachmentId: input.audioAttachmentId }
      : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.diagnosticsAttachmentId
      ? { diagnosticsAttachmentId: input.diagnosticsAttachmentId }
      : {}),
  };
}

export function renderFeedbackIssue(
  input: ReturnType<typeof normalizeFeedback>,
  submissionId: string,
) {
  const longest = Math.max(
    2,
    ...(input.description.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(longest + 1);
  const refs = feedbackMediaReferences(input);
  const media = refs.length
    ? '\n\n## Private attachments\n\n' +
      refs
        .map(
          (ref, i) =>
            `- [${ref.kind} ${i + 1}](https://feedback.humanquest.net/feedback/attachments/${ref.id})`,
        )
        .join('\n') +
      '\n\nOnly the reporter and configured maintainer can open these attachments. Access expires after seven days.'
    : '';
  const selections = input.captures
    ?.filter((c) => c.elementInfo)
    .map(
      (c, i) =>
        `- Selection ${i + 1}: \`${c.elementInfo}\`${c.position ? ` (viewport ${Math.round(c.position.x)}, ${Math.round(c.position.y)})` : ''}`,
    )
    .join('\n');
  return {
    title:
      `[feedback] ${feedbackCategories[input.category]}: ${input.title}`.slice(
        0,
        180,
      ),
    body: `Feedback about the Feedback Widget skill or its website.\n\n**Category:** ${feedbackCategories[input.category]}\n**Page:** Feedback Widget homepage\n**Source:** https://feedback.humanquest.net/\n\n## Report\n\n${fence}text\n${input.description}\n${fence}${selections ? '\n\n## Selected elements\n\n' + selections : ''}${media}\n\nSubmitted with explicit consent to publish report text. Account details are not included. Media and diagnostics are private, not embedded in this issue.\n\n<!-- feedback-submission-id: ${submissionId} -->`,
  };
}

export function feedbackMediaReferences(
  input: Pick<
    FeedbackInput,
    | 'captures'
    | 'videoAttachmentId'
    | 'audioAttachmentId'
    | 'attachments'
    | 'diagnosticsAttachmentId'
  >,
) {
  return [
    ...(input.captures ?? []).flatMap((c) =>
      c.attachmentId ? [{ id: c.attachmentId, kind: 'image' }] : [],
    ),
    ...(input.videoAttachmentId
      ? [{ id: input.videoAttachmentId, kind: 'video' }]
      : []),
    ...(input.audioAttachmentId
      ? [{ id: input.audioAttachmentId, kind: 'audio' }]
      : []),
    ...(input.attachments ?? []).map((a) => ({ id: a.id, kind: 'file' })),
    ...(input.diagnosticsAttachmentId
      ? [{ id: input.diagnosticsAttachmentId, kind: 'diagnostics' }]
      : []),
  ];
}
