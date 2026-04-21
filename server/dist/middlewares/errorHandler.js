"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = __importDefault(require("../utils/logger"));
async function errorHandler(ctx, next) {
    try {
        await next();
    }
    catch (err) {
        const status = err.status || 500;
        const message = err.message || 'Internal Server Error';
        logger_1.default.error(`[${status}] ${ctx.method} ${ctx.url} - ${message}`);
        ctx.status = status;
        ctx.body = { code: status, data: null, message };
    }
}
//# sourceMappingURL=errorHandler.js.map