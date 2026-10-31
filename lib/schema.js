// Drizzle schema (SQLite / libSQL). Timestamps are epoch milliseconds. JSON columns hold validated arrays/objects.
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['post', 'story', 'article', 'update'] }).notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  title: text('title'),
  slug: text('slug').unique(),
  bodyMd: text('body_md').notNull().default(''),
  bodyHtml: text('body_html').notNull().default(''),
  excerpt: text('excerpt').notNull().default(''),
  media: text('media').notNull().default('[]'), // [{provider,type,id,w,h,alt,caption}]
  tags: text('tags').notNull().default('[]'), // ["sql","power-bi"]
  updateType: text('update_type', { enum: ['job', 'project', 'cert', 'talk', 'learning', 'life'] }),
  threadId: text('thread_id'), // root post id when part of a thread
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  publishAt: integer('publish_at').notNull(), // future = scheduled
  expiresAt: integer('expires_at'), // stories only; null = never
  highlightId: text('highlight_id'),
  bg: text('bg'), // text-story background preset key
  readingMinutes: integer('reading_minutes'),
  toc: text('toc').notNull().default('[]'),
  linkPreview: text('link_preview'), // {url,title,description,site}
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('posts_feed_idx').on(t.status, t.publishAt), index('posts_kind_idx').on(t.kind), index('posts_thread_idx').on(t.threadId)]);

export const highlights = sqliteTable('highlights', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const reactions = sqliteTable('reactions', {
  postId: text('post_id').notNull(),
  visitor: text('visitor').notNull(), // HMAC of the anonymous visitor cookie
  emoji: text('emoji').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.postId, t.visitor, t.emoji] })]);

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('comments_post_idx').on(t.postId, t.status)]);

export const subscribers = sqliteTable('subscribers', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  status: text('status', { enum: ['pending', 'active', 'unsubscribed'] }).notNull().default('pending'),
  token: text('token').notNull(), // confirm + unsubscribe token
  createdAt: integer('created_at').notNull(),
  confirmedAt: integer('confirmed_at'),
});

export const issues = sqliteTable('issues', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  kind: text('kind', { enum: ['test', 'send'] }).notNull(),
  recipients: integer('recipients').notNull(),
  sentAt: integer('sent_at').notNull(),
});

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
});
