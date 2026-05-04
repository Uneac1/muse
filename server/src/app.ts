import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import path from 'path';
import fs from 'fs';
import { loggerMiddleware } from './middlewares/logger';
import { errorHandler } from './middlewares/errorHandler';
import { authMiddleware } from './middlewares/auth';
import { apiEnvelopeMiddleware } from './middlewares/apiEnvelope';
import router from './routes';

const app = new Koa();
const parseBody = bodyParser({
  jsonLimit: '64mb',
  formLimit: '64mb',
  textLimit: '64mb',
});

// 中间件
app.use(errorHandler);
app.use(loggerMiddleware);
app.use(async (ctx, next) => {
  if (ctx.path.startsWith('/api/crs/v1/')) {
    await next();
    return;
  }
  await parseBody(ctx, next);
});
app.use(authMiddleware);
app.use(apiEnvelopeMiddleware);

// API 路由
app.use(router.routes());
app.use(router.allowedMethods());
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith('/api')) {
    await next();
    return;
  }

  if (ctx.body !== undefined) return;
  ctx.status = ctx.status === 404 ? 404 : ctx.status || 404;
  ctx.body = {
    code: ctx.status,
    data: null,
    message: `API route not found: ${ctx.method} ${ctx.path}`,
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `API route not found: ${ctx.method} ${ctx.path}`,
    },
  };
});

// 前端静态资源
const distPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(distPath)) {
  const indexPath = path.join(distPath, 'index.html');

  // 显式兜底 SPA 路由，避免生产态 smoke 直接命中客户端路由时返回 404。
  app.use(async (ctx, next) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      await next();
      return;
    }

    if (ctx.path.startsWith('/api') || ctx.path.includes('.')) {
      await next();
      return;
    }

    if (fs.existsSync(indexPath)) {
      ctx.type = 'html';
      ctx.body = fs.createReadStream(indexPath);
      return;
    }

    await next();
  });

  app.use(serve(distPath, {
    maxage: 365 * 24 * 60 * 60 * 1000,
    gzip: true,
    setHeaders: (res, filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('/index.html') || normalized.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return;
      }

      if (/\/assets\/.+-[A-Za-z0-9_-]+\.(js|css)$/.test(normalized)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=300');
    },
  }));
}

export default app;
