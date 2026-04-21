import { Context } from 'koa';
import crypto from 'crypto';
import http from 'http';
import { OAuthService } from '../services/OAuthService';
import { OpenAIAccountService, type OpenAIAuthSession } from '../services/OpenAIAccountService';
import { success, fail } from '../utils/response';
import { config } from '../config';

const oauthService = new OAuthService();
const openAIAccountService = new OpenAIAccountService();
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const OPENAI_STATE_TTL_MS = 30 * 60 * 1000;
const OPENAI_LOCAL_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const pendingGoogleStates = new Map<string, { clientId: string; clientSecret: string; loginHint?: string; appOrigin: string; createdAt: number }>();
const pendingOpenAIStates = new Map<string, { session: OpenAIAuthSession; appOrigin: string }>();
let openAILocalServerStarted = false;

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

function renderCallbackHtml(payload: Record<string, any>, targetOrigin: string) {
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

function ensureOpenAILocalCallbackServer() {
  if (openAILocalServerStarted) return;

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', OPENAI_LOCAL_REDIRECT_URI);
      if (requestUrl.pathname !== '/auth/callback') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      cleanupExpiredStates();

      const code = requestUrl.searchParams.get('code') || '';
      const state = requestUrl.searchParams.get('state') || '';
      const error = requestUrl.searchParams.get('error') || '';
      const errorDescription = requestUrl.searchParams.get('error_description') || '';

      if (error) {
        const html = renderCallbackHtml(
          { type: 'openai-oauth-error', error: errorDescription || error },
          config.webAppOrigin
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      const pending = pendingOpenAIStates.get(state);
      pendingOpenAIStates.delete(state);
      if (!pending || !code) {
        const html = renderCallbackHtml(
          { type: 'openai-oauth-error', error: 'OAuth state expired or invalid' },
          config.webAppOrigin
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      try {
        const token = await openAIAccountService.exchangeCode(code, pending.session);
        const html = renderCallbackHtml(
          {
            type: 'openai-oauth-success',
            provider: 'openai_codex',
            email: token.email,
            external_account_id: token.chatgptAccountId,
            access_token: token.accessToken,
            refresh_token: token.refreshToken,
            id_token: token.idToken,
          },
          pending.appOrigin
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err: any) {
        const html = renderCallbackHtml(
          { type: 'openai-oauth-error', error: err.message || 'OpenAI OAuth failed' },
          pending.appOrigin
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      }
    } catch (err: any) {
      res.statusCode = 500;
      res.end(err.message || 'OAuth callback failed');
    }
  });

  server.listen(1455, '127.0.0.1');
  openAILocalServerStarted = true;
}

export class OAuthController {
  async authorizeOpenAI(ctx: Context) {
    cleanupExpiredStates();
    const appOrigin = ctx.get('Origin') || config.webAppOrigin;
    ensureOpenAILocalCallbackServer();
    const redirectUri = OPENAI_LOCAL_REDIRECT_URI;
    const { authUrl, session } = openAIAccountService.createSession(redirectUri);
    pendingOpenAIStates.set(session.state, { session, appOrigin });
    success(ctx, { url: authUrl, state: session.state });
  }

  async authorizeGoogle(ctx: Context) {
    cleanupExpiredStates();
    const { client_id, client_secret, login_hint, scope, prompt } = ctx.request.body as any;
    const clientId = String(client_id || config.adminGoogleClientId || '').trim();
    const clientSecret = String(client_secret || config.adminGoogleClientSecret || '').trim();
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
      ctx.status = 500;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'google-oauth-error',
        error: err.message || 'Google OAuth failed',
      }, pending.appOrigin);
    }
  }
}
