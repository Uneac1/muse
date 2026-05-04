import { Context } from 'koa';
import crypto from 'crypto';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { OAuthService } from '../services/OAuthService';
import { OpenAIAccountService, type OpenAIAuthSession } from '../services/OpenAIAccountService';
import { LinuxDoConnectService } from '../services/LinuxDoConnectService';
import { success, fail } from '../utils/response';
import { config } from '../config';
import { IntegrationTokenModel } from '../models/IntegrationToken';

const oauthService = new OAuthService();
const openAIAccountService = new OpenAIAccountService();
const linuxDoConnectService = new LinuxDoConnectService();
const integrationTokenModel = new IntegrationTokenModel();
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const LINUXDO_STATE_TTL_MS = 10 * 60 * 1000;
const OPENAI_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const pendingGoogleStates = new Map<string, { clientId: string; clientSecret: string; loginHint?: string; appOrigin: string; createdAt: number }>();
const pendingLinuxDoStates = new Map<string, { appOrigin: string; createdAt: number }>();
const pendingOpenAIStates = new Map<string, { session: OpenAIAuthSession; appOrigin: string }>();
const completedOpenAIStates = new Map<string, { createdAt: number; payload: Record<string, any> }>();
const serverRoot = path.resolve(__dirname, '../..');
const OPENAI_LOCAL_CALLBACK_PORT = 1455;
const OPENAI_LOCAL_CALLBACK_PATH = '/auth/callback';
const OPENAI_LOCAL_REDIRECT_URI = `http://localhost:${OPENAI_LOCAL_CALLBACK_PORT}${OPENAI_LOCAL_CALLBACK_PATH}`;
const OPENAI_CALLBACK_OWNER_FILE = path.join(serverRoot, 'data', 'openai-oauth-callback-owner.json');
let openaiCallbackServer: http.Server | null = null;
let openaiCallbackServerPromise: Promise<void> | null = null;

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

function renderCallbackHtml(payload: Record<string, any>, targetOrigin: string) {
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

export class OAuthController {
  constructor() {
    this.getStatus = this.getStatus.bind(this);
    this.authorizeOpenAI = this.authorizeOpenAI.bind(this);
    this.launchOpenAI = this.launchOpenAI.bind(this);
    this.openaiResult = this.openaiResult.bind(this);
    this.openaiCallback = this.openaiCallback.bind(this);
    this.authorizeGoogle = this.authorizeGoogle.bind(this);
    this.googleCallback = this.googleCallback.bind(this);
  }

  private writeOpenAICallbackOwnerFile() {
    fs.mkdirSync(path.dirname(OPENAI_CALLBACK_OWNER_FILE), { recursive: true });
    fs.writeFileSync(
      OPENAI_CALLBACK_OWNER_FILE,
      JSON.stringify({ pid: process.pid, port: OPENAI_LOCAL_CALLBACK_PORT, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  }

  private clearOpenAICallbackOwnerFile() {
    if (fs.existsSync(OPENAI_CALLBACK_OWNER_FILE)) {
      fs.rmSync(OPENAI_CALLBACK_OWNER_FILE, { force: true });
    }
  }

  private tryRecoverOpenAICallbackPort(): boolean {
    try {
      let ownerPid = 0;
      if (fs.existsSync(OPENAI_CALLBACK_OWNER_FILE)) {
        const raw = fs.readFileSync(OPENAI_CALLBACK_OWNER_FILE, 'utf8');
        const parsed = JSON.parse(raw) as { pid?: number };
        ownerPid = Number(parsed?.pid || 0);
      }
      if (!ownerPid) {
        const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
        const line = output
          .split(/\r?\n/)
          .find((item) => item.includes(`:${OPENAI_LOCAL_CALLBACK_PORT}`) && item.includes('LISTENING'));
        if (line) {
          const matched = line.trim().match(/(\d+)\s*$/);
          ownerPid = Number(matched?.[1] || 0);
        }
      }
      if (!ownerPid || ownerPid === process.pid) return false;
      process.kill(ownerPid);
      return true;
    } catch {
      return false;
    }
  }

  private createOpenAISession(ctx: Context) {
    cleanupExpiredStates();
    const appOrigin = ctx.get('Origin') || config.webAppOrigin;
    const redirectUri = OPENAI_LOCAL_REDIRECT_URI;
    const { authUrl, session } = openAIAccountService.createSession(redirectUri);
    pendingOpenAIStates.set(session.state, { session, appOrigin });
    return { authUrl, session };
  }

  private async ensureOpenAICallbackServer() {
    if (openaiCallbackServer?.listening) return;
    if (openaiCallbackServerPromise) {
      await openaiCallbackServerPromise;
      return;
    }

    const bindServer = (allowRecover: boolean) => new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handleLocalOpenAICallback(req, res);
      });

      server.once('error', (error: NodeJS.ErrnoException) => {
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

  private async handleLocalOpenAICallback(req: IncomingMessage, res: ServerResponse) {
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
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        renderCallbackHtml(
          { type: 'openai-oauth-error', error: error?.message || 'OpenAI OAuth failed' },
          config.webAppOrigin
        )
      );
    }
  }

  private async finalizeOpenAICallback(query: Record<string, string | undefined>) {
    cleanupExpiredStates();
    const { code, state, error, error_description } = query;

    if (error) {
      const errorState = String(state || crypto.randomBytes(8).toString('hex'));
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
        targetOrigin: config.webAppOrigin,
      };
    }

    if (!code || !state) {
      return {
        status: 400,
        payload: {
          type: 'openai-oauth-error',
          error: 'Missing code or state',
        },
        targetOrigin: config.webAppOrigin,
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
        targetOrigin: config.webAppOrigin,
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
    } catch (err: any) {
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

  private async launchOpenAISystemBrowser(authUrl: string) {
    const child = spawn('explorer.exe', [authUrl], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
  }

  async getStatus(ctx: Context) {
    success(ctx, {
      googleConfigured: !!config.googleClientId && !!config.googleClientSecret,
      googleProjectId: config.googleProjectId || '',
      openaiConfigured: true,
      linuxDoConfigured: linuxDoConnectService.isConfigured(),
    });
  }

  async authorizeLinuxDo(ctx: Context) {
    cleanupExpiredStates();
    if (!linuxDoConnectService.isConfigured()) {
      return fail(ctx, 'linux.do connect is not configured', 400);
    }

    const state = linuxDoConnectService.createState();
    pendingLinuxDoStates.set(state, {
      appOrigin: ctx.get('Origin') || config.webAppOrigin,
      createdAt: Date.now(),
    });
    success(ctx, { url: linuxDoConnectService.createAuthorizationUrl(state), state });
  }

  async authorizeOpenAI(ctx: Context) {
    try {
      await this.ensureOpenAICallbackServer();
      const { authUrl, session } = this.createOpenAISession(ctx);
      success(ctx, { url: authUrl, state: session.state });
    } catch (error: any) {
      fail(ctx, error.message || '创建 OpenAI 授权链接失败', 500);
    }
  }

  async launchOpenAI(ctx: Context) {
    try {
      await this.ensureOpenAICallbackServer();
      const { authUrl, session } = this.createOpenAISession(ctx);
      await this.launchOpenAISystemBrowser(authUrl);
      success(ctx, { state: session.state, launchMode: 'system-browser' });
    } catch (error: any) {
      fail(ctx, error.message || '启动系统浏览器里的 OpenAI 授权失败', 500);
    }
  }

  async resetOpenAISession(ctx: Context) {
    try {
      if (openaiCallbackServer?.listening) {
        await new Promise<void>((resolve) => openaiCallbackServer?.close(() => resolve()));
        openaiCallbackServer = null;
        openaiCallbackServerPromise = null;
      }

      pendingOpenAIStates.clear();
      completedOpenAIStates.clear();
      this.clearOpenAICallbackOwnerFile();
      success(ctx, {
        reset: true,
        profileDir: '',
      });
    } catch (error: any) {
      fail(ctx, error.message || '重置 OpenAI 授权登录态失败', 500);
    }
  }

  async openaiResult(ctx: Context) {
    cleanupExpiredStates();
    const state = String(ctx.query.state || '').trim();
    if (!state) {
      return fail(ctx, 'state is required', 400);
    }

    const completed = completedOpenAIStates.get(state);
    if (completed) {
      return success(ctx, { status: 'completed', ...completed.payload });
    }

    if (pendingOpenAIStates.has(state)) {
      return success(ctx, { status: 'pending' });
    }

    return success(ctx, { status: 'expired' });
  }

  async openaiCallback(ctx: Context) {
    const result = await this.finalizeOpenAICallback(ctx.query as Record<string, string>);
    ctx.status = result.status;
    ctx.type = 'html';
    ctx.body = renderCallbackHtml(result.payload, result.targetOrigin);
  }

  async authorizeGoogle(ctx: Context) {
    cleanupExpiredStates();
    const { client_id, client_secret, login_hint, scope, prompt } = ctx.request.body as any;
    const clientId = String(client_id || config.googleClientId || '').trim();
    const clientSecret = String(client_secret || config.googleClientSecret || '').trim();
    if (!clientId || !clientSecret) {
      return fail(ctx, 'google oauth client is not configured', 400);
    }

    const state = crypto.randomBytes(24).toString('hex');
    pendingGoogleStates.set(state, {
      clientId,
      clientSecret,
      loginHint: login_hint,
      appOrigin: ctx.get('Origin') || config.webAppOrigin,
      createdAt: Date.now(),
    });

    const url = oauthService.createGoogleAuthorizationUrl(clientId, state, login_hint, {
      scope: scope ? String(scope) : undefined,
      prompt: prompt ? String(prompt) : undefined,
    });
    success(ctx, { url, state });
  }

  async googleCallback(ctx: Context) {
    cleanupExpiredStates();
    const { code, state, error, error_description } = ctx.query as Record<string, string>;

    if (error) {
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'google-oauth-error',
        error: error_description || error,
      }, config.webAppOrigin);
      return;
    }

    if (!code || !state) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'google-oauth-error',
        error: 'Missing code or state',
      }, config.webAppOrigin);
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
      }, config.webAppOrigin);
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
        } catch (err: any) {
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
    } catch (err: any) {
      console.error('Google OAuth callback failed:', err);
      ctx.status = 500;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'google-oauth-error',
        error: err.message || 'Google OAuth failed',
      }, pending.appOrigin);
    }
  }

  async linuxDoCallback(ctx: Context) {
    cleanupExpiredStates();
    const { code, state, error, error_description } = ctx.query as Record<string, string>;

    if (error) {
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'linuxdo-oauth-error',
        error: error_description || error,
      }, config.webAppOrigin);
      return;
    }

    if (!code || !state) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'linuxdo-oauth-error',
        error: 'Missing code or state',
      }, config.webAppOrigin);
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
      }, config.webAppOrigin);
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
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'linuxdo-oauth-error',
        error: err.message || 'Linux.do OAuth failed',
      }, pending.appOrigin);
    }
  }
}
