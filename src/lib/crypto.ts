// ============================================================
// Arvest Private Banking — Field-level encryption
// AES-256-GCM for data that must be recoverable (card PANs).
// Data that must NOT be recoverable (PINs) is bcrypt-hashed
// elsewhere. Key source: CARD_ENCRYPTION_KEY env (base64, 16/24/32
// bytes, or any passphrase ≥ 16 chars stretched via scrypt).
// ============================================================
import crypto from 'crypto';

function loadKey(): Buffer {
  const raw = process.env.CARD_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CARD_ENCRYPTION_KEY is required in production.');
    }
    return crypto.scryptSync('arvest-dev-only-card-key', 'arvest-card-salt', 32);
  }
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43 && raw.length % 4 === 0) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw.length >= 16) return crypto.scryptSync(raw, 'arvest-card-salt', 32);
  throw new Error('CARD_ENCRYPTION_KEY is invalid (use base64/hex 32-byte key or passphrase ≥ 16 chars).');
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptField(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(parts[1], 'base64');
  const data = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function maskCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/** Luhn-valid card number for the given network (demo issuance). */
export function generateCardNumber(network: string): string {
  const prefixes: Record<string, string> = {
    VISA: '4',
    MASTERCARD: '53',
    AMEX: '37',
    DISCOVER: '6011',
  };
  const prefix = prefixes[network] ?? '4';
  const len = network === 'AMEX' ? 15 : 16;
  let body = prefix;
  while (body.length < len - 1) body += crypto.randomInt(0, 10).toString();
  // compute Luhn check digit
  let sum = 0;
  let dbl = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let d = Number.parseInt(body[i], 10);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    dbl = !dbl;
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return body + check.toString();
}

export function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 12) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number.parseInt(digits[i], 10);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    dbl = !dbl;
    sum += d;
  }
  return sum % 10 === 0;
}

export function detectNetwork(num: string): string {
  const d = num.replace(/\D/g, '');
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'MASTERCARD';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^(6011|65|64[4-9])/.test(d)) return 'DISCOVER';
  return 'VISA';
}
