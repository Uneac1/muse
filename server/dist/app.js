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
const routes_1 = __importDefault(require("./routes"));
const app = new koa_1.default();
// 中间件
app.use(errorHandler_1.errorHandler);
app.use(logger_1.loggerMiddleware);
app.use((0, koa_bodyparser_1.default)({ jsonLimit: '10mb' }));
app.use(auth_1.authMiddleware);
// API 路由
app.use(routes_1.default.routes());
app.use(routes_1.default.allowedMethods());
// 前端静态资源
const distPath = path_1.default.resolve(__dirname, '../../web/dist');
if (fs_1.default.existsSync(distPath)) {
    app.use((0, koa_static_1.default)(distPath, { maxage: 365 * 24 * 60 * 60 * 1000, gzip: true }));
    // SPA fallback
    app.use(async (ctx) => {
        if (!ctx.path.startsWith('/api') && !ctx.path.includes('.')) {
            const indexPath = path_1.default.join(distPath, 'index.html');
            if (fs_1.default.existsSync(indexPath)) {
                ctx.type = 'html';
                ctx.body = fs_1.default.createReadStream(indexPath);
            }
        }
    });
}
exports.default = app;
//# sourceMappingURL=app.js.map