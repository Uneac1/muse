"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.fail = fail;
function success(ctx, data, message) {
    ctx.status = 200;
    ctx.body = { code: 200, data, message: message || 'ok' };
}
function fail(ctx, message, code = 500) {
    ctx.status = code;
    ctx.body = { code, data: null, message };
}
//# sourceMappingURL=response.js.map