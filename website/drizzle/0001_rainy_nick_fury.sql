CREATE TABLE `feedback_media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`submission_id` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_media_expiry` ON `feedback_media` (`expires_at`);