"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const koa_bodyparser_1 = __importDefault(require("koa-bodyparser"));
const koa_static_1 = __importDefault(require("koa-static"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = require("./middlewares/logger");
const errorHandler_1 = require("./middlewares/errorHandler");
const auth_1 = require("./middlewares/auth");
const apiEnvelope_1 = require("./middlewares/apiEnvelope");
const routes_1 = __importDefault(require("./routes"));
const app = new koa_1.default();
const parseBody = (0, koa_bodyparser_1.default)({
    jsonLimit: '64mb',
    formLimit: '64mb',
    textLimit: '64mb',
});
// 中间件
app.use(errorHandler_1.errorHandler);
app.use(logger_1.loggerMiddleware);
app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/crs/v1/')) {
        await next();
        return;
    }
    await parseBody(ctx, next);
});
app.use(auth_1.authMiddleware);
app.use(apiEnvelope_1.apiEnvelopeMiddleware);
// API 路由
app.use(routes_1.default.routes());
app.use(routes_1.default.allowedMethods());
app.use(async (ctx, next) => {
    if (!ctx.path.startsWith('/api')) {
        await next();
        return;
    }
    if (ctx.body !== undefined)
        return;
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
const distPath = path_1.default.resolve(__dirname, '../../web/dist');
if (fs_1.default.existsSync(distPath)) {
    const indexPath = path_1.default.join(distPath, 'index.html');
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
        if (fs_1.default.existsSync(indexPath)) {
            ctx.type = 'html';
            ctx.body = fs_1.default.createReadStream(indexPath);
            return;
        }
        await next();
    });
    app.use((0, koa_static_1.default)(distPath, {
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
exports.default = app;
//# sourceMappingURL=app.js.map