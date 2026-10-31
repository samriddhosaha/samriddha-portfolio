// zod schemas for every API input. Limits are documented in docs/02-feed-architecture.md.
import { z } from 'zod';

export const EMOJI = ['❤️', '👏', '🔥', '💡'];
export const KINDS = ['post', 'story', 'article', 'update'];
export const UPDATE_TYPES = ['job', 'project', 'cert', 'talk', 'learning', 'life'];
export const BG_PRESETS = ['ink', 'vermilion', 'green', 'paper', 'dusk', 'ember'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

export const tag = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,29}$/, 'tags: lowercase letters, digits, dashes');
const id = z.string().regex(/^[a-z0-9]{6,32}$/);
const trimmed = (max) => z.string().trim().max(max);

export const mediaItem = z.object({
  provider: z.enum(['cloudinary', 'local', 'static']),
  type: z.enum(['image', 'video']),
  id: z.string().min(1).max(300).regex(/^[A-Za-z0-9/_.-]+$/, 'bad media id'),
  w: z.number().int().positive().max(20000).optional(),
  h: z.number().int().positive().max(20000).optional(),
  alt: trimmed(300).default(''),
  caption: trimmed(300).optional(),
}).superRefine((m, ctx) => {
  if (m.type === 'image' && !m.alt) ctx.addIssue({ code: 'custom', path: ['alt'], message: 'alt text is required for images' });
  if (m.provider === 'static' && !m.id.startsWith('/assets/')) ctx.addIssue({ code: 'custom', path: ['id'], message: 'static media must live under /assets/' });
  if (m.provider === 'local' && !/^[a-z0-9]{16}\.(jpg|png|webp|mp4|webm)$/.test(m.id)) ctx.addIssue({ code: 'custom', path: ['id'], message: 'bad local media id' });
});

export const postInput = z.object({
  kind: z.enum(KINDS),
  status: z.enum(['draft', 'published']).default('published'),
  title: trimmed(160).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80).optional(),
  bodyMd: z.string().max(60000).default(''),
  media: z.array(mediaItem).max(12).default([]),
  tags: z.array(tag).max(10).default([]),
  updateType: z.enum(UPDATE_TYPES).optional(),
  threadId: id.optional(),
  pinned: z.boolean().default(false),
  publishAt: z.number().int().positive().optional(), // epoch ms; future = scheduled
  expiresInHours: z.number().min(1).max(24 * 30).optional(), // stories
  highlightId: id.optional(),
  newHighlight: trimmed(40).optional(),
  bg: z.enum(BG_PRESETS).optional(),
}).superRefine((p, ctx) => {
  const bad = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  const videos = p.media.filter((m) => m.type === 'video').length;
  if (p.kind !== 'article' && videos > 1) bad('media', 'only one video per item');
  if (p.kind === 'article') { if (!p.title) bad('title', 'articles need a title'); if (p.bodyMd.trim().length < 20) bad('bodyMd', 'article body is too short'); }
  if (p.kind === 'post' && !p.bodyMd.trim() && !p.media.length) bad('bodyMd', 'a post needs text or media');
  if (p.kind === 'post' && p.bodyMd.length > 1000) bad('bodyMd', 'posts are limited to 1000 characters; use an article');
  if (p.kind === 'update') { if (!p.updateType) bad('updateType', 'updates need a type'); if (!p.bodyMd.trim()) bad('bodyMd', 'an update needs text'); if (!p.title) bad('title', 'updates need a headline'); }
  if (p.kind === 'story') { if (!p.media.length && !p.bodyMd.trim()) bad('bodyMd', 'a story needs media or text'); if (p.media.length > 1) bad('media', 'one media item per story'); if (p.bodyMd.length > 280) bad('bodyMd', 'story text is limited to 280 characters'); }
});

export const reactInput = z.object({ id, emoji: z.enum(EMOJI) });
export const commentInput = z.object({
  postId: id,
  name: z.string().trim().min(1, 'name is required').max(60),
  body: z.string().trim().min(2, 'comment is too short').max(1000),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});
export const subscribeInput = z.object({ email: z.string().trim().toLowerCase().email().max(200), website: z.string().max(0).optional() });
export const tokenInput = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) });
export const loginInput = z.object({ password: z.string().min(1).max(200) });
export const feedQuery = z.object({
  tab: z.enum(['all', 'posts', 'stories', 'newsletter', 'journey']).default('all'),
  tag: tag.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().regex(/^\d+_[a-z0-9]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export const uploadSignInput = z.object({
  type: z.enum([...IMAGE_TYPES, ...VIDEO_TYPES]),
  size: z.number().int().positive(),
}).superRefine((u, ctx) => {
  const max = IMAGE_TYPES.includes(u.type) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (u.size > max) ctx.addIssue({ code: 'custom', path: ['size'], message: `file too large (max ${max / 1024 / 1024} MB)` });
});
export const sendInput = z.object({ postId: id, mode: z.enum(['test', 'send']) });
export const moderateInput = z.object({ id, status: z.enum(['approved', 'rejected', 'pending']) });
export const previewInput = z.object({ md: z.string().max(60000), kind: z.enum(KINDS) });
