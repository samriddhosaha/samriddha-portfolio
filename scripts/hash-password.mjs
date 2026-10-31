// npm run hash-password -- "my password"   -> value for ADMIN_PASSWORD_HASH
import { hashPassword } from '../lib/auth.js';

const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error('usage: npm run hash-password -- "<password of 12+ chars>"'); process.exit(1); }
console.log(hashPassword(pw));
