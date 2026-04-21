"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const OAuthService_1 = require("../services/OAuthService");
const OpenAIAccountService_1 = require("../services/OpenAIAccountService");
const response_1 = require("../utils/response");
const config_1 = require("../config");
const oauthService = new OAuthService_1.OAuthService();
const openAIAccountService = new OpenAIAccountService_1.OpenAIAccountService();
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const OPENAI_STATE_TTL_MS = 30 * 60 * 1000;
const pendingGoogleStates = new Map();
const pendingOpenAIStates = new Map();
function cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, value] of pendingGoogleStates.entries()) {
        if (now - value.createdAt > GOOGLE_STATE_TTL_MS) {
            pendingGoogleStates.delete(state);
        }
    }
    for (const [state, value] of pendingOpenAIStates.entries()) {
        if (now - value.session.createdAt > OPENAI_STATE_TTL_MS) {
            pendingOpenAIStates.delete(state);
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
    <title>Google OAuth 完成</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b1020; color: #f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
      .card { width:min(460px, 92vw); padding:24px; border-radius:20px; background:rgba(15, 23, 42, 0.92); box-shadow:0 20px 60px rgba(0,0,0,.35); }
      h1 { margin:0 0 10px; font-size:20px; }
      p { margin:0; color:#cbd5e1; line-height:1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Gmail 授权已完成</h1>
      <p>这个窗口会把授权结果发送回 muse-Mail，然后自动关闭。</p>
    </div>
    <script>
      const payload = ${serialized};
      const targetOrigin = ${serializedTargetOrigin};
      if (window.opener) {
        window.opener.postMessage(payload, targetOrigin || '*');
      }
      setTimeout(() => window.close(), 1200);
    </script>
  </body>
</html>`;
}
class OAuthController {
    async authorizeOpenAI(ctx) {
        cleanupExpiredStates();
        const appOrigin = ctx.get('Origin') || config_1.config.webAppOrigin;
        const redirectUri = config_1.config.openaiOAuthRedirectUri;
        const { authUrl, session } = openAIAccountService.createSession(redirectUri);
        pendingOpenAIStates.set(session.state, { session, appOrigin });
        (0, response_1.success)(ctx, { url: authUrl, state: session.state });
    }
    async openaiCallback(ctx) {
        cleanupExpiredStates();
        const { code, state, error, error_description } = ctx.query;
        if (error) {
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'openai-oauth-error',
                error: error_description || error,
            }, config_1.config.webAppOrigin);
            return;
        }
        if (!code || !state) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'openai-oauth-error',
                error: 'Missing code or state',
            }, config_1.config.webAppOrigin);
            return;
        }
        const pending = pendingOpenAIStates.get(state);
        pendingOpenAIStates.delete(state);
        if (!pending) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'openai-oauth-error',
                error: 'OAuth state expired or invalid',
            }, config_1.config.webAppOrigin);
            return;
        }
        try {
            const token = await openAIAccountService.exchangeCode(code, pending.session);
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'openai-oauth-success',
                provider: 'openai_codex',
                email: token.email,
                external_account_id: token.chatgptAccountId,
                access_token: token.accessToken,
                refresh_token: token.refreshToken,
                id_token: token.idToken,
            }, pending.appOrigin);
        }
        catch (err) {
            ctx.status = 500;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({ type: 'openai-oauth-error', error: err.message || 'OpenAI OAuth failed' }, pending.appOrigin);
        }
    }
    async authorizeGoogle(ctx) {
        cleanupExpiredStates();
        const { client_id, client_secret, login_hint, scope, prompt } = ctx.request.body;
        const clientId = String(client_id || config_1.config.googleClientId || '').trim();
        const clientSecret = String(client_secret || config_1.config.googleClientSecret || '').trim();
        if (!clientId || !clientSecret) {
            return (0, response_1.fail)(ctx, 'google oauth client is not configured', 400);
        }
        const state = crypto_1.default.randomBytes(24).toString('hex');
        pendingGoogleStates.set(state, {
            clientId,
            clientSecret,
            loginHint: login_hint,
            appOrigin: ctx.get('Origin') || config_1.config.webAppOrigin,
            createdAt: Date.now(),
        });
        const url = oauthService.createGoogleAuthorizationUrl(clientId, state, login_hint, {
            scope: scope ? String(scope) : undefined,
            prompt: prompt ? String(prompt) : undefined,
        });
        (0, response_1.success)(ctx, { url, state });
    }
    async googleCallback(ctx) {
        cleanupExpiredStates();
        const { code, state, error, error_description } = ctx.query;
        if (error) {
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-error',
                error: error_description || error,
            }, config_1.config.webAppOrigin);
            return;
        }
        if (!code || !state) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-error',
                error: 'Missing code or state',
            }, config_1.config.webAppOrigin);
            return;
        }
        const pending = pendingGoogleStates.get(state);
        pendingGoogleStates.delete(state);
        if (!pending) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-error',
                error: 'OAuth state expired or invalid',
            }, config_1.config.webAppOrigin);
            return;
        }
        try {
            const token = await oauthService.exchangeGoogleAuthorizationCode(pending.clientId, pending.clientSecret, code);
            if (!token.refresh_token) {
                throw new Error('Google did not return refresh_token. Please retry with consent.');
            }
            let email = oauthService.extractEmailFromGoogleIdToken(token.id_token) || pending.loginHint || '';
            if (!email) {
                try {
                    email = await oauthService.fetchGoogleUserEmail(token.access_token);
                }
                catch (err) {
                    email = pending.loginHint || '';
                }
            }
            if (!email) {
                throw new Error('Google OAuth succeeded, but failed to determine account email.');
            }
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-success',
                provider: 'gmail',
                email,
                refresh_token: token.refresh_token,
            }, pending.appOrigin);
        }
        catch (err) {
            ctx.status = 500;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-error',
                error: err.message || 'Google OAuth failed',
            }, pending.appOrigin);
        }
    }
}
exports.OAuthController = OAuthController;
//# sourceMappingURL=OAuthController.js.map