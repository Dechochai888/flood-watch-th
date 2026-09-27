CREATE TABLE `flood_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`severity` text NOT NULL,
	`water_depth` integer NOT NULL,
	`description` text NOT NULL,
	`area_name` text DEFAULT '' NOT NULL,
	`image_key` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_flood_reports_created_at` ON `flood_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_flood_reports_severity_created_at` ON `flood_reports` (`severity`,`created_at`);