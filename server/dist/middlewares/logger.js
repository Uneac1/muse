"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggerMiddleware = loggerMiddleware;
const logger_1 = __importDefault(require("../utils/logger"));
async function loggerMiddleware(ctx, next) {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger_1.default.info(`${ctx.method} ${ctx.url} ${ctx.status} - ${ms}ms`);
}
//# sourceMappingURL=logger.js.map