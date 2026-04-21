"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const adminSession_1 = require("../auth/adminSession");
function hashPassword(password) {
    return crypto_1.default.createHash('sha256').update(password).digest('hex');
}
async function authMiddleware(ctx, next) {
    if (!config_1.config.accessPassword && !(config_1.config.adminGoogleClientId && config_1.config.adminGoogleClientSecret))
        return next();
    if (ctx.path === '/api/auth/login' || ctx.path === '/api/auth/check' || ctx.path === '/api/auth/google/authorize')
        return next();
    if (ctx.path === '/api/oauth/openai/authorize')
        return next();
    if (ctx.path === '/api/oauth/google/callback')
        return next();
    if (ctx.path === '/api/oauth/openai/callback')
        return next();
    if (ctx.path === '/api/auth/google/callback')
        return next();
    if (!ctx.path.startsWith('/api'))
        return next();
    const token = ctx.get('Authorization')?.replace('Bearer ', '');
    const passwordToken = config_1.config.accessPassword ? hashPassword(config_1.config.accessPassword) : '';
    const valid = !!token && (token === passwordToken || (0, adminSession_1.isValidAdminSession)(token));
    if (!valid) {
        ctx.status = 401;
        ctx.body = { code: 401, data: null, message: 'Unauthorized' };
        return;
    }
    return next();
}
//# sourceMappingURL=auth.js.map