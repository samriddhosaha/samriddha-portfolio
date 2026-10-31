CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_post_idx` ON `comments` (`post_id`,`status`);--> statement-breakpoint
CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`recipients` integer NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`slug` text,
	`body_md` text DEFAULT '' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`media` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`update_type` text,
	`thread_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`publish_at` integer NOT NULL,
	`expires_at` integer,
	`highlight_id` text,
	`bg` text,
	`reading_minutes` integer,
	`toc` text DEFAULT '[]' NOT NULL,
	`link_preview` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `posts_feed_idx` ON `posts` (`status`,`publish_at`);--> statement-breakpoint
CREATE INDEX `posts_kind_idx` ON `posts` (`kind`);--> statement-breakpoint
CREATE INDEX `posts_thread_idx` ON `posts` (`thread_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`post_id` text NOT NULL,
	`visitor` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `visitor`, `emoji`)
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);