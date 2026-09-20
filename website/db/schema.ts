import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// No report text, account identifiers, emails, or raw IP addresses are stored.
export const feedbackSubmissions = sqliteTable(
  'feedback_submissions',
  {
    key: text('key').primaryKey(),
    payloadHash: text('payload_hash').notNull(),
    submissionId: text('submission_id').notNull(),
    state: text('state').notNull(),
    issueUrl: text('issue_url'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('feedback_submissions_created_at').on(table.createdAt)],
);

export const feedbackBudgets = sqliteTable(
  'feedback_budgets',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('feedback_budgets_expires_at').on(table.expiresAt)],
);

export const feedbackMedia = sqliteTable(
  'feedback_media',
  {
    id: text('id').primaryKey(),
    ownerHash: text('owner_hash').notNull(),
    objectKey: text('object_key').notNull(),
    kind: text('kind').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    submissionId: text('submission_id'),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('feedback_media_expiry').on(table.expiresAt)],
);
