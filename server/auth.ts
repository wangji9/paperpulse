import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const AVATAR_PALETTE = [
  '#4F46E5',
  '#0F766E',
  '#0369A1',
  '#B45309',
  '#BE123C',
  '#4338CA',
  '#15803D',
];

export function pickAvatarColor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}
