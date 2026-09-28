CREATE TABLE `safe_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`path` text NOT NULL,
	`delete_secret_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_safe_routes_created_at` ON `safe_routes` (`created_at`);