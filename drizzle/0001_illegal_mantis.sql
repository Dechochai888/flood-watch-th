ALTER TABLE `flood_reports` ADD `report_type` text DEFAULT 'flood' NOT NULL;--> statement-breakpoint
ALTER TABLE `flood_reports` ADD `contact_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `flood_reports` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `flood_reports` ADD `help_needs` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `flood_reports` ADD `delete_secret_hash` text;