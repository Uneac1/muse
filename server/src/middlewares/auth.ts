import { Context, Next } from 'koa';
import crypto from 'crypto';
import { config } from '../config';
import { isValidAdminSession } from '../auth/adminSession';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function authMiddleware(ctx: Context, next: Next) {
  if (!config.accessPassword && !(config.adminGoogleClientId && config.adminGoogleClientSecret)) return next();
  if (ctx.path === '/api/auth/login' || ctx.path === '/api/auth/check' || ctx.path === '/api/auth/google/authorize') return next();
  if (ctx.path === '/api/oauth/status') return next();
  if (ctx.path === '/api/oauth/openai/authorize') return next();
  if (ctx.path === '/api/oauth/linuxdo/callback') return next();
  if (ctx.path === '/api/oauth/google/callback') return next();
  if (ctx.path === '/api/oauth/openai/callback') return next();
  if (ctx.path === '/api/auth/google/callback') return next();
  if (ctx.path.startsWith('/api/crs/v1/')) return next();
  if (!ctx.path.startsWith('/api')) return next();

  const token = ctx.get('Authorization')?.replace('Bearer ', '');
  const passwordToken = config.accessPassword ? hashPassword(config.accessPassword) : '';
  const valid = !!token && (token === passwordToken || isValidAdminSession(token));
  if (!valid) {
    ctx.status = 401;
    ctx.body = {
      code: 401,
      data: null,
      message: 'Unauthorized',
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    };
    return;
  }
  return next();
}
