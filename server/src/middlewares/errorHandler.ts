import { Context, Next } from 'koa';
import logger from '../utils/logger';

export async function errorHandler(ctx: Context, next: Next) {
  try {
    await next();
  } catch (err: any) {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    logger.error(`[${status}] ${ctx.method} ${ctx.url} - ${message}`);
    if (err.stack) logger.error(err.stack);
    ctx.status = status;
    if (ctx.path.startsWith('/api/crs/v1/')) {
      ctx.body = {
        error: {
          message,
          type: status >= 500 ? 'server_error' : 'invalid_request_error',
          code: err.code || err.name || null,
        },
      };
      return;
    }
    ctx.body = {
      code: status,
      data: null,
      message,
      ok: false,
      error: {
        code: err.code || err.name || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
        message,
        details: err.details,
      },
    };
  }
}
