import { Context } from 'koa';
import crypto from 'crypto';
import { config } from '../config';
import { OAuthService } from '../services/OAuthService';
import { createAdminSession } from '../auth/adminSession';
import { success, fail } from '../utils/response';

const oauthService = new OAuthService();
const GOOGLE_LOGIN_SCOPE = 'openid email profile';
const ADMIN_GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;
const pendingAdminStates = new Map<string, { appOrigin: string; createdAt: number }>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, value] of pendingAdminStates.entries()) {
    if (now - value.createdAt > ADMIN_GOOGLE_STATE_TTL_MS) {
      pendingAdminStates.delete(state);
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

export class AuthController {
  async login(ctx: Context) {
    const { password } = ctx.request.body as any;
    if (!config.accessPassword) {
      return success(ctx, { token: '', required: false });
    }
    if (password !== config.accessPassword) {
      return fail(ctx, 'Invalid password', 401);
    }
    const token = crypto.createHash('sha256').update(password).digest('hex');
    success(ctx, { token, required: true });
  }

  async check(ctx: Context) {
    const googleOAuthEnabled = !!config.adminGoogleClientId && !!config.adminGoogleClientSecret;
    success(ctx, {
      required: !!config.accessPassword || googleOAuthEnabled,
      googleOAuthEnabled,
    });
  }

  async authorizeGoogle(ctx: Context) {
    cleanupExpiredStates();
    if (!config.adminGoogleClientId || !config.adminGoogleClientSecret) {
      return fail(ctx, 'Admin Google OAuth is not configured', 400);
    }

    const state = crypto.randomBytes(24).toString('hex');
    pendingAdminStates.set(state, {
      appOrigin: ctx.get('Origin') || config.webAppOrigin,
      createdAt: Date.now(),
    });

    const url = oauthService.createGoogleAuthorizationUrl(
      config.adminGoogleClientId,
      state,
      undefined,
      {
        redirectUri: config.adminGoogleOAuthRedirectUri,
        scope: GOOGLE_LOGIN_SCOPE,
        prompt: 'select_account',
      }
    );

    success(ctx, { url, state });
  }

  async googleCallback(ctx: Context) {
    cleanupExpiredStates();
    const { code, state, error, error_description } = ctx.query as Record<string, string>;

    if (error) {
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'admin-google-auth-error',
        error: error_description || error,
      }, config.webAppOrigin);
      return;
    }

    if (!code || !state) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'admin-google-auth-error',
        error: 'Missing code or state',
      }, config.webAppOrigin);
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
      }, config.webAppOrigin);
      return;
    }

    try {
      const token = await oauthService.exchangeGoogleAuthorizationCode(
        config.adminGoogleClientId,
        config.adminGoogleClientSecret,
        code,
        undefined,
        config.adminGoogleOAuthRedirectUri
      );
      const email =
        oauthService.extractEmailFromGoogleIdToken(token.id_token) ||
        await oauthService.fetchGoogleUserEmail(token.access_token);

      if (!email) {
        throw new Error('Unable to determine Google account email');
      }

      if (config.adminAllowedEmails.length > 0 && !config.adminAllowedEmails.includes(email.toLowerCase())) {
        throw new Error(`Email ${email} is not allowed to access admin`);
      }

      const adminToken = createAdminSession(email);
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'admin-google-auth-success',
        email,
        token: adminToken,
      }, pending.appOrigin);
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'html';
      ctx.body = renderCallbackHtml({
        type: 'admin-google-auth-error',
        error: err.message || 'Google admin auth failed',
      }, pending.appOrigin);
    }
  }
}
