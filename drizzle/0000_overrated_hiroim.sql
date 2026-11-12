CREATE TABLE `file_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`revision` integer NOT NULL,
	`document` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_files` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`cursor_x` real,
	`cursor_y` real,
	`last_seen` integer NOT NULL
);
