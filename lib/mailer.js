// Email via Resend's HTTP API. Outside production without a key, messages are appended to .data/outbox.jsonl (used by e2e tests).
import fs from 'node:fs';
import { isProd } from './util.js';

export const mailConfigured = () => !!process.env.RESEND_API_KEY || !isProd();
const from = () => process.env.MAIL_FROM || 'Samriddha Saha <onboarding@resend.dev>';

// messages: [{to, subject, html, text, headers?}]
export async function sendMail(messages) {
  if (!process.env.RESEND_API_KEY) {
    if (isProd()) throw new Error('RESEND_API_KEY is not set');
    fs.mkdirSync('.data', { recursive: true });
    fs.appendFileSync('.data/outbox.jsonl', messages.map((m) => JSON.stringify({ ...m, at: Date.now() })).join('\n') + '\n');
    return;
  }
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100).map((m) => ({ from: from(), to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }))),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
