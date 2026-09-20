CREATE TABLE `feedback_budgets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_budgets_expires_at` ON `feedback_budgets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `feedback_submissions` (
	`key` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`submission_id` text NOT NULL,
	`state` text NOT NULL,
	`issue_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_submissions_created_at` ON `feedback_submissions` (`created_at`);