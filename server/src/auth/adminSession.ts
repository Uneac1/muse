import crypto from 'crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, { email: string; expiresAt: number }>();

export function createAdminSession(email: string) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    email,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function isValidAdminSession(token: string) {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}
