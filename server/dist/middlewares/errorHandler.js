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
        if (err.stack)
            logger_1.default.error(err.stack);
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
//# sourceMappingURL=errorHandler.js.map