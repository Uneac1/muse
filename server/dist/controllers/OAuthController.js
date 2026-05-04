"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const OAuthService_1 = require("../services/OAuthService");
const OpenAIAccountService_1 = require("../services/OpenAIAccountService");
const LinuxDoConnectService_1 = require("../services/LinuxDoConnectService");
const response_1 = require("../utils/response");
const config_1 = require("../config");
const IntegrationToken_1 = require("../models/IntegrationToken");
const oauthService = new OAuthService_1.OAuthService();
const openAIAccountService = new OpenAIAccountService_1.OpenAIAccountService();
const linuxDoConnectService = new LinuxDoConnectService_1.LinuxDoConnectService();
const integrationTokenModel = new IntegrationToken_1.IntegrationTokenModel();
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const LINUXDO_STATE_TTL_MS = 10 * 60 * 1000;
const OPENAI_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const pendingGoogleStates = new Map();
const pendingLinuxDoStates = new Map();
const pendingOpenAIStates = new Map();
const completedOpenAIStates = new Map();
const serverRoot = path_1.default.resolve(__dirname, '../..');
const OPENAI_LOCAL_CALLBACK_PORT = 1455;
const OPENAI_LOCAL_CALLBACK_PATH = '/auth/callback';
const OPENAI_LOCAL_REDIRECT_URI = `http://localhost:${OPENAI_LOCAL_CALLBACK_PORT}${OPENAI_LOCAL_CALLBACK_PATH}`;
const OPENAI_CALLBACK_OWNER_FILE = path_1.default.join(serverRoot, 'data', 'openai-oauth-callback-owner.json');
let openaiCallbackServer = null;
let openaiCallbackServerPromise = null;
function cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, value] of pendingGoogleStates.entries()) {
        if (now - value.createdAt > GOOGLE_STATE_TTL_MS) {
            pendingGoogleStates.delete(state);
        }
    }
    for (const [state, value] of pendingLinuxDoStates.entries()) {
        if (now - value.createdAt > LINUXDO_STATE_TTL_MS) {
            pendingLinuxDoStates.delete(state);
        }
    }
    for (const [state, value] of pendingOpenAIStates.entries()) {
        if (now - value.session.createdAt > OPENAI_STATE_TTL_MS) {
            pendingOpenAIStates.delete(state);
        }
    }
    for (const [state, value] of completedOpenAIStates.entries()) {
        if (now - value.createdAt > OPENAI_STATE_TTL_MS) {
            completedOpenAIStates.delete(state);
        }
    }
}
function renderCallbackHtml(payload, targetOrigin) {
    const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
    const serializedTargetOrigin = JSON.stringify(targetOrigin);
    const title = payload.type === 'linuxdo-oauth-success'
        ? 'Linux.do 授权已完成'
        : payload.type === 'linuxdo-oauth-error'
            ? 'Linux.do 授权失败'
            : payload.type === 'openai-oauth-success'
                ? 'OpenAI 授权已完成'
                : payload.type === 'openai-oauth-error'
                    ? 'OpenAI 授权失败'
                    : payload.type === 'google-oauth-error'
                        ? 'Google OAuth 失败'
                        : 'Google OAuth 完成';
    const description = payload.type === 'linuxdo-oauth-success'
        ? '这个窗口会把 Linux.do 授权结果发送回 muse-Mail，然后自动关闭。'
        : payload.type === 'openai-oauth-success'
            ? '这个窗口会把 OpenAI 授权结果发送回 muse-Mail，然后自动关闭。'
            : payload.type === 'linuxdo-oauth-error'
                ? 'Linux.do 授权没有完成，你可以关闭窗口后回到 muse-Mail 查看错误。'
                : payload.type === 'openai-oauth-error'
                    ? 'OpenAI 授权没有完成，你可以关闭窗口后回到 muse-Mail 查看错误。'
                    : payload.type === 'google-oauth-error'
                        ? 'Google 授权没有完成，你可以关闭窗口后回到 muse-Mail 查看错误。'
                        : '这个窗口会把授权结果发送回 muse-Mail，然后自动关闭。';
    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b1020; color: #f8fafc; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
      .card { width:min(460px, 92vw); padding:24px; border-radius:20px; background:rgba(15, 23, 42, 0.92); box-shadow:0 20px 60px rgba(0,0,0,.35); }
      h1 { margin:0 0 10px; font-size:20px; }
      p { margin:0; color:#cbd5e1; line-height:1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${description}</p>
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
    constructor() {
        this.getStatus = this.getStatus.bind(this);
        this.authorizeOpenAI = this.authorizeOpenAI.bind(this);
        this.launchOpenAI = this.launchOpenAI.bind(this);
        this.openaiResult = this.openaiResult.bind(this);
        this.openaiCallback = this.openaiCallback.bind(this);
        this.authorizeGoogle = this.authorizeGoogle.bind(this);
        this.googleCallback = this.googleCallback.bind(this);
    }
    writeOpenAICallbackOwnerFile() {
        fs_1.default.mkdirSync(path_1.default.dirname(OPENAI_CALLBACK_OWNER_FILE), { recursive: true });
        fs_1.default.writeFileSync(OPENAI_CALLBACK_OWNER_FILE, JSON.stringify({ pid: process.pid, port: OPENAI_LOCAL_CALLBACK_PORT, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    }
    clearOpenAICallbackOwnerFile() {
        if (fs_1.default.existsSync(OPENAI_CALLBACK_OWNER_FILE)) {
            fs_1.default.rmSync(OPENAI_CALLBACK_OWNER_FILE, { force: true });
        }
    }
    tryRecoverOpenAICallbackPort() {
        try {
            let ownerPid = 0;
            if (fs_1.default.existsSync(OPENAI_CALLBACK_OWNER_FILE)) {
                const raw = fs_1.default.readFileSync(OPENAI_CALLBACK_OWNER_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                ownerPid = Number(parsed?.pid || 0);
            }
            if (!ownerPid) {
                const output = (0, child_process_1.execFileSync)('netstat', ['-ano'], { encoding: 'utf8' });
                const line = output
                    .split(/\r?\n/)
                    .find((item) => item.includes(`:${OPENAI_LOCAL_CALLBACK_PORT}`) && item.includes('LISTENING'));
                if (line) {
                    const matched = line.trim().match(/(\d+)\s*$/);
                    ownerPid = Number(matched?.[1] || 0);
                }
            }
            if (!ownerPid || ownerPid === process.pid)
                return false;
            process.kill(ownerPid);
            return true;
        }
        catch {
            return false;
        }
    }
    createOpenAISession(ctx) {
        cleanupExpiredStates();
        const appOrigin = ctx.get('Origin') || config_1.config.webAppOrigin;
        const redirectUri = OPENAI_LOCAL_REDIRECT_URI;
        const { authUrl, session } = openAIAccountService.createSession(redirectUri);
        pendingOpenAIStates.set(session.state, { session, appOrigin });
        return { authUrl, session };
    }
    async ensureOpenAICallbackServer() {
        if (openaiCallbackServer?.listening)
            return;
        if (openaiCallbackServerPromise) {
            await openaiCallbackServerPromise;
            return;
        }
        const bindServer = (allowRecover) => new Promise((resolve, reject) => {
            const server = http_1.default.createServer((req, res) => {
                void this.handleLocalOpenAICallback(req, res);
            });
            server.once('error', (error) => {
                server.close();
                if (error.code === 'EADDRINUSE' && allowRecover && this.tryRecoverOpenAICallbackPort()) {
                    setTimeout(() => {
                        bindServer(false).then(resolve).catch(reject);
                    }, 500);
                    return;
                }
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`OpenAI 本地回调端口 ${OPENAI_LOCAL_CALLBACK_PORT} 已被占用，请先释放后重试`));
                    return;
                }
                reject(error);
            });
            server.listen(OPENAI_LOCAL_CALLBACK_PORT, '127.0.0.1', () => {
                openaiCallbackServer = server;
                this.writeOpenAICallbackOwnerFile();
                resolve();
            });
        });
        openaiCallbackServerPromise = bindServer(true).finally(() => {
            openaiCallbackServerPromise = null;
        });
        await openaiCallbackServerPromise;
    }
    async handleLocalOpenAICallback(req, res) {
        try {
            const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${OPENAI_LOCAL_CALLBACK_PORT}`);
            if (requestUrl.pathname !== OPENAI_LOCAL_CALLBACK_PATH) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found');
                return;
            }
            const result = await this.finalizeOpenAICallback({
                code: requestUrl.searchParams.get('code') || undefined,
                state: requestUrl.searchParams.get('state') || undefined,
                error: requestUrl.searchParams.get('error') || undefined,
                error_description: requestUrl.searchParams.get('error_description') || undefined,
            });
            res.writeHead(result.status, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderCallbackHtml(result.payload, result.targetOrigin));
        }
        catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderCallbackHtml({ type: 'openai-oauth-error', error: error?.message || 'OpenAI OAuth failed' }, config_1.config.webAppOrigin));
        }
    }
    async finalizeOpenAICallback(query) {
        cleanupExpiredStates();
        const { code, state, error, error_description } = query;
        if (error) {
            const errorState = String(state || crypto_1.default.randomBytes(8).toString('hex'));
            const payload = {
                type: 'openai-oauth-error',
                error: error_description || error,
            };
            completedOpenAIStates.set(errorState, {
                createdAt: Date.now(),
                payload,
            });
            return {
                status: 200,
                payload,
                targetOrigin: config_1.config.webAppOrigin,
            };
        }
        if (!code || !state) {
            return {
                status: 400,
                payload: {
                    type: 'openai-oauth-error',
                    error: 'Missing code or state',
                },
                targetOrigin: config_1.config.webAppOrigin,
            };
        }
        const pending = pendingOpenAIStates.get(state);
        pendingOpenAIStates.delete(state);
        if (!pending) {
            return {
                status: 400,
                payload: {
                    type: 'openai-oauth-error',
                    error: 'OAuth state expired or invalid',
                },
                targetOrigin: config_1.config.webAppOrigin,
            };
        }
        try {
            const token = await openAIAccountService.exchangeCode(code, pending.session);
            const payload = {
                type: 'openai-oauth-success',
                provider: 'openai_codex',
                email: token.email,
                external_account_id: token.chatgptAccountId,
                access_token: token.accessToken,
                refresh_token: token.refreshToken,
                id_token: token.idToken,
            };
            completedOpenAIStates.set(state, {
                createdAt: Date.now(),
                payload,
            });
            return {
                status: 200,
                payload,
                targetOrigin: pending.appOrigin,
            };
        }
        catch (err) {
            const payload = {
                type: 'openai-oauth-error',
                error: err.message || 'OpenAI OAuth failed',
            };
            completedOpenAIStates.set(state, {
                createdAt: Date.now(),
                payload,
            });
            return {
                status: 500,
                payload,
                targetOrigin: pending.appOrigin,
            };
        }
    }
    async launchOpenAISystemBrowser(authUrl) {
        const child = (0, child_process_1.spawn)('explorer.exe', [authUrl], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
        });
        child.unref();
    }
    async getStatus(ctx) {
        (0, response_1.success)(ctx, {
            googleConfigured: !!config_1.config.googleClientId && !!config_1.config.googleClientSecret,
            googleProjectId: config_1.config.googleProjectId || '',
            openaiConfigured: true,
            linuxDoConfigured: linuxDoConnectService.isConfigured(),
        });
    }
    async authorizeLinuxDo(ctx) {
        cleanupExpiredStates();
        if (!linuxDoConnectService.isConfigured()) {
            return (0, response_1.fail)(ctx, 'linux.do connect is not configured', 400);
        }
        const state = linuxDoConnectService.createState();
        pendingLinuxDoStates.set(state, {
            appOrigin: ctx.get('Origin') || config_1.config.webAppOrigin,
            createdAt: Date.now(),
        });
        (0, response_1.success)(ctx, { url: linuxDoConnectService.createAuthorizationUrl(state), state });
    }
    async authorizeOpenAI(ctx) {
        try {
            await this.ensureOpenAICallbackServer();
            const { authUrl, session } = this.createOpenAISession(ctx);
            (0, response_1.success)(ctx, { url: authUrl, state: session.state });
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '创建 OpenAI 授权链接失败', 500);
        }
    }
    async launchOpenAI(ctx) {
        try {
            await this.ensureOpenAICallbackServer();
            const { authUrl, session } = this.createOpenAISession(ctx);
            await this.launchOpenAISystemBrowser(authUrl);
            (0, response_1.success)(ctx, { state: session.state, launchMode: 'system-browser' });
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '启动系统浏览器里的 OpenAI 授权失败', 500);
        }
    }
    async resetOpenAISession(ctx) {
        try {
            if (openaiCallbackServer?.listening) {
                await new Promise((resolve) => openaiCallbackServer?.close(() => resolve()));
                openaiCallbackServer = null;
                openaiCallbackServerPromise = null;
            }
            pendingOpenAIStates.clear();
            completedOpenAIStates.clear();
            this.clearOpenAICallbackOwnerFile();
            (0, response_1.success)(ctx, {
                reset: true,
                profileDir: '',
            });
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '重置 OpenAI 授权登录态失败', 500);
        }
    }
    async openaiResult(ctx) {
        cleanupExpiredStates();
        const state = String(ctx.query.state || '').trim();
        if (!state) {
            return (0, response_1.fail)(ctx, 'state is required', 400);
        }
        const completed = completedOpenAIStates.get(state);
        if (completed) {
            return (0, response_1.success)(ctx, { status: 'completed', ...completed.payload });
        }
        if (pendingOpenAIStates.has(state)) {
            return (0, response_1.success)(ctx, { status: 'pending' });
        }
        return (0, response_1.success)(ctx, { status: 'expired' });
    }
    async openaiCallback(ctx) {
        const result = await this.finalizeOpenAICallback(ctx.query);
        ctx.status = result.status;
        ctx.type = 'html';
        ctx.body = renderCallbackHtml(result.payload, result.targetOrigin);
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
            console.error('Google OAuth callback failed:', err);
            ctx.status = 500;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'google-oauth-error',
                error: err.message || 'Google OAuth failed',
            }, pending.appOrigin);
        }
    }
    async linuxDoCallback(ctx) {
        cleanupExpiredStates();
        const { code, state, error, error_description } = ctx.query;
        if (error) {
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'linuxdo-oauth-error',
                error: error_description || error,
            }, config_1.config.webAppOrigin);
            return;
        }
        if (!code || !state) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'linuxdo-oauth-error',
                error: 'Missing code or state',
            }, config_1.config.webAppOrigin);
            return;
        }
        const pending = pendingLinuxDoStates.get(state);
        pendingLinuxDoStates.delete(state);
        if (!pending) {
            ctx.status = 400;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'linuxdo-oauth-error',
                error: 'OAuth state expired or invalid',
            }, config_1.config.webAppOrigin);
            return;
        }
        try {
            const token = await linuxDoConnectService.exchangeCode(code);
            const user = await linuxDoConnectService.fetchCurrentUser(token.access_token);
            const sessionRecord = linuxDoConnectService.buildSessionRecord(token, user);
            integrationTokenModel.upsert('linuxdo', JSON.stringify(sessionRecord));
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'linuxdo-oauth-success',
                provider: 'linuxdo',
                username: user.username,
                trust_level: user.trust_level,
                avatar_url: user.avatar_url,
            }, pending.appOrigin);
        }
        catch (err) {
            ctx.status = 500;
            ctx.type = 'html';
            ctx.body = renderCallbackHtml({
                type: 'linuxdo-oauth-error',
                error: err.message || 'Linux.do OAuth failed',
            }, pending.appOrigin);
        }
    }
}
exports.OAuthController = OAuthController;
//# sourceMappingURL=OAuthController.js.map