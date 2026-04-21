"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminSession = createAdminSession;
exports.isValidAdminSession = isValidAdminSession;
const crypto_1 = __importDefault(require("crypto"));
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
function createAdminSession(email) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    sessions.set(token, {
        email,
        expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
}
function isValidAdminSession(token) {
    const session = sessions.get(token);
    if (!session)
        return false;
    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return false;
    }
    return true;
}
//# sourceMappingURL=adminSession.js.map