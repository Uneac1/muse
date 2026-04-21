"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const OAuthService_1 = require("../services/OAuthService");
const adminSession_1 = require("../auth/adminSession");
const response_1 = require("../utils/response");
const oauthService = new OAuthService_1.OAuthService();
const GOOGLE_LOGIN_SCOPE = 'openid email profile';
const ADMIN_GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const pendingAdminStates = new Map();
function cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, value] of pendingAdminStates.entries()) {
        if (now - value.createdAt > ADMIN_GOOGLE_STATE_TTL_MS) {
            pendingAdminStates.delete(state);
        }
    }
}
function renderCallbackHtml(payload, targetOrigin) {
    const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
    const serializedTargetOrigin = JSON.stringify(targetOrigin);
    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>后台登录完成</title>
  </head>
  <body>
    <script>
      const payload = ${serialized};
      const targetOrigin = ${serializedTargetOrigin};
      if (window.opener) {
        window.opener.postMessage(payload, targetOrigin || '*');
      }
      setTimeout(() => window.close(), 1200);
    </script>
    <p>后台登录处理中，窗口会自动关闭。</p>
  </body>
</html>`;
}
class AuthController {
    async login(ctx) {
        const { password } = ctx.request.body;
        if (!config_1.config.accessPassword) {
            return (0, response_1.success)(ctx, { token: '', required: false });
        }
        if (password !== config_1.config.accessPassword) {
            return (0, response_1.fail)(ctx, 'Invalid password', 401);
        }
        const token = crypto_1.default.createHash('sha256').update(password).digest('hex');
        (0, response_1.success)(ctx, { token, required: true });
    }
    async check(ctx) {
        const googleOAuthEnabled = !!config_1.config.adminGoogleClientId && !!config_1.config.adminGoogleClientSecret;
        (0, response_1.success)(ctx, {
            required: !!config_1.config.accessPassword || googleOAuthEnabled,
            googleOAuthEnabled,
        });
    }
    async authorizeGoogle(ctx) {
        cleanupExpiredStates();
        if (!config_1.config.adminGoogleClientId || !config_1.config.adminGoogleClientSecret) {
            return (0, response_1.fail)(ctx, 'Admin Google OAuth is not configured', 400);
        }
        const state = crypto_1.default.randomBytes(24).toString('hex');
        pendingAdminStates.set(state, {
            appOrigin: ctx.get('Origin') || config_1.config.webAppOrigin,
            createdAt: Date.now(),
        });
        const url = oauthService.createGoogleAuthorizationUrl(config_1.config.adminGoogleClientId, state, undefined, {
            redirectUri: config_1.config.adminGoogleOAuthRedirectUri,
            scope: GOOGLE_LOGIN_SCOPE,
            prompt: 'select_account',
        });
        (0, response_1.success)(ctx, { url, state });
    }
    async googleCallback(ctx) {
        cleanupExpiredStates();
        const { code, state, error, error_description } = ctx.query;
        if (error) {
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'admin-google-auth-error',
                error: error_description || error,
            }, config_1.config.webAppOrigin);
            return;
        }
        if (!code || !state) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'admin-google-auth-error',
                error: 'Missing code or state',
            }, config_1.config.webAppOrigin);
            return;
        }
        const pending = pendingAdminStates.get(state);
        pendingAdminStates.delete(state);
        if (!pending) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'admin-google-auth-error',
                error: 'OAuth state expired or invalid',
            }, config_1.config.webAppOrigin);
            return;
        }
        try {
            const token = await oauthService.exchangeGoogleAuthorizationCode(config_1.config.adminGoogleClientId, config_1.config.adminGoogleClientSecret, code, undefined, config_1.config.adminGoogleOAuthRedirectUri);
            const email = oauthService.extractEmailFromGoogleIdToken(token.id_token) ||
                await oauthService.fetchGoogleUserEmail(token.access_token);
            if (!email) {
                throw new Error('Unable to determine Google account email');
            }
            if (config_1.config.adminAllowedEmails.length > 0 && !config_1.config.adminAllowedEmails.includes(email.toLowerCase())) {
                throw new Error(`Email ${email} is not allowed to access admin`);
            }
            const adminToken = (0, adminSession_1.createAdminSession)(email);
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'admin-google-auth-success',
                email,
                token: adminToken,
            }, pending.appOrigin);
        }
        catch (err) {
            ctx.status = 500;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'admin-google-auth-error',
                error: err.message || 'Google admin auth failed',
            }, pending.appOrigin);
        }
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map