// Media URLs, upload signing (Cloudinary) and the dev-only disk adapter.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isProd } from './util.js';

const cloud = () => process.env.CLOUDINARY_CLOUD_NAME || '';
export const provider = () => (process.env.CLOUDINARY_API_SECRET && cloud() ? 'cloudinary' : !isProd() ? 'local' : null);

const cdn = (m, t) => `https://res.cloudinary.com/${cloud()}/${m.type}/upload/${t}/${m.id}`;
// Resized, format-negotiated delivery URL for images; poster frame for videos.
export function mediaSrc(m, w = 960) {
  if (m.provider === 'cloudinary') return m.type === 'video' ? `${cdn(m, `so_0,w_${w},q_auto`)}.jpg` : cdn(m, `f_auto,q_auto,w_${w}`);
  if (m.provider === 'local') return `/api/media/${m.id}`;
  return m.id; // static: a path under /assets/
}
export const videoSrc = (m) => (m.provider === 'cloudinary' ? `${cdn(m, 'q_auto')}.mp4` : m.provider === 'local' ? `/api/media/${m.id}` : m.id);
export function mediaSrcset(m) {
  if (m.provider !== 'cloudinary' || m.type !== 'image') return '';
  return [480, 960, 1600].filter((w) => !m.w || w <= m.w * 1.2 || w === 480).map((w) => `${mediaSrc(m, w)} ${w}w`).join(', ');
}
export const ogImage = (m) => (m.provider === 'cloudinary' && m.type === 'image' ? cdn(m, 'f_jpg,q_auto,w_1200,h_630,c_fill') : m.provider === 'cloudinary' ? mediaSrc(m, 1200) : null);

// Is this URL one we would host? Used to restrict <img>/<video> in rendered markdown.
export function allowedMediaUrl(u) {
  if (typeof u !== 'string') return false;
  if (u.startsWith('/api/media/') || u.startsWith('/assets/')) return !u.includes('..');
  return cloud() !== '' && u.startsWith(`https://res.cloudinary.com/${cloud()}/`);
}

export function signUpload(resourceType) {
  const params = { allowed_formats: resourceType === 'image' ? 'jpg,png,webp' : 'mp4,webm', folder: 'feed', timestamp: Math.floor(Date.now() / 1000) };
  // Incoming transformation: strip EXIF/GPS metadata from the stored original.
  if (resourceType === 'image') params.transformation = 'fl_strip_profile';
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const signature = createHash('sha1').update(toSign + process.env.CLOUDINARY_API_SECRET).digest('hex');
  return { provider: 'cloudinary', url: `https://api.cloudinary.com/v1_1/${cloud()}/${resourceType}/upload`, fields: { ...params, api_key: process.env.CLOUDINARY_API_KEY, signature } };
}

// ---- dev-only disk adapter (never used in production) ----
const DIR = path.resolve('.data/uploads');
const MAGIC = [
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
  ['mp4', (b) => b.subarray(4, 8).toString() === 'ftyp'],
  ['webm', (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))],
];
export const sniff = (buf) => MAGIC.find(([, test]) => test(buf))?.[0] || null;
export function saveLocal(buf) {
  const ext = sniff(buf);
  if (!ext) return null;
  fs.mkdirSync(DIR, { recursive: true });
  const name = randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(DIR, name), buf);
  return { name, type: ['mp4', 'webm'].includes(ext) ? 'video' : 'image' };
}
export function readLocal(name) {
  if (!/^[a-z0-9]{16}\.(jpg|png|webp|mp4|webm)$/.test(name)) return null;
  try { return fs.readFileSync(path.join(DIR, name)); } catch { return null; }
}
export const LOCAL_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' };
