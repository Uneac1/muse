import { Context, Next } from 'koa';

function isPlainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isApiEnvelope(value: Record<string, any>) {
  return typeof value.code === 'number' && Object.prototype.hasOwnProperty.call(value, 'data');
}

function shouldSkipEnvelope(ctx: Context) {
  if (!ctx.path.startsWith('/api')) return true;
  if (ctx.path.startsWith('/api/crs/v1/')) return true;
  if (ctx.body === undefined || ctx.body === null) return true;
  if (!isPlainObject(ctx.body)) return true;

  const type = String(ctx.type || '').toLowerCase();
  return type.includes('text/event-stream') || type.includes('html') || type.includes('octet-stream');
}

function errorCode(status: number, body?: Record<string, any>) {
  if (typeof body?.error?.code === 'string') return body.error.code;
  if (typeof body?.code === 'string') return body.code;
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'REQUEST_ERROR';
}

export async function apiEnvelopeMiddleware(ctx: Context, next: Next) {
  await next();

  if (shouldSkipEnvelope(ctx)) return;

  const status = ctx.status || 200;
  const body = ctx.body as Record<string, any>;
  const envelope = isApiEnvelope(body)
    ? body
    : {
        code: status >= 400 ? status : 200,
        data: status >= 400 ? null : body,
        message: body.message,
      };

  const code = typeof envelope.code === 'number' ? envelope.code : status;
  const ok = status < 400 && code === 200;
  const message = typeof envelope.message === 'string' && envelope.message.trim()
    ? envelope.message
    : ok
      ? 'ok'
      : 'Request failed';

  ctx.body = {
    code,
    data: Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : null,
    message,
    ok,
    error: ok
      ? null
      : {
          code: errorCode(status, envelope),
          message,
          details: envelope.error?.details ?? envelope.details,
        },
    meta: envelope.meta,
  };
}
