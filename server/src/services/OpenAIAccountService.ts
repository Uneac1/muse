import crypto from 'crypto';
import type { TokenAnalyticsSnapshot, TokenQuotaCard, TokenUsageSection } from '../types';
import { ProxyService } from './ProxyService';
import { proxyKernelService } from './ProxyKernelService';

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_WHAM_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const OPENAI_DEFAULT_SCOPE = 'openid profile email offline_access';
const OPENAI_REFRESH_SCOPE = 'openid profile email';
const OPENAI_CODEX_SIMPLIFIED_FLOW = 'true';
const OPENAI_ID_TOKEN_ADD_ORGANIZATIONS = 'true';
const proxyService = new ProxyService();

export interface OpenAIAuthSession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface OpenAITokenInfo {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  expiresAt: number;
  email: string;
  chatgptAccountId: string;
}

interface WhamWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
}

interface WhamUsageResponse {
  rate_limit?: {
    primary_window?: WhamWindow;
    secondary_window?: WhamWindow;
  };
}

function decodeJwtPayload(token?: string): Record<string, any> | null {
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function encodeBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildResetLabelFromSeconds(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '未解析到重置时间';
  const now = Date.now();
  const target = new Date(now + Math.max(0, seconds) * 1000);
  return `重置时间：${target.toLocaleString('zh-CN', { hour12: false })}`;
}

function buildWindowCard(key: string, label: string, usedPercent?: number | null, resetAfterSeconds?: number | null, tone: TokenQuotaCard['tone'] = 'slate'): TokenQuotaCard | null {
  if (usedPercent == null && resetAfterSeconds == null) return null;
  const safeUsed = usedPercent == null ? null : Math.max(0, Math.min(100, Math.round(usedPercent)));
  const remaining = safeUsed == null ? null : Math.max(0, 100 - safeUsed);

  return {
    key,
    label,
    remainingPct: remaining,
    remainingText: remaining == null ? '未解析到剩余额度' : `${remaining}% 剩余`,
    resetAt: resetAfterSeconds == null ? null : new Date(Date.now() + Math.max(0, resetAfterSeconds) * 1000).toISOString(),
    resetLabel: buildResetLabelFromSeconds(resetAfterSeconds),
    tone,
  };
}

export class OpenAIAccountService {
  createSession(redirectUri: string) {
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(64).toString('hex');
    const codeChallenge = encodeBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());

    const params = new URLSearchParams({
      client_id: OPENAI_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      codex_cli_simplified_flow: OPENAI_CODEX_SIMPLIFIED_FLOW,
      id_token_add_organizations: OPENAI_ID_TOKEN_ADD_ORGANIZATIONS,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: OPENAI_DEFAULT_SCOPE,
      state,
    });

    return {
      authUrl: `${OPENAI_AUTHORIZE_URL}?${params.toString()}`,
      session: {
        state,
        codeVerifier,
        redirectUri,
        createdAt: Date.now(),
      } satisfies OpenAIAuthSession,
    };
  }

  async exchangeCode(code: string, session: OpenAIAuthSession): Promise<OpenAITokenInfo> {
    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OPENAI_CLIENT_ID,
      code,
      redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier,
    });

    return this.requestToken(payload);
  }

  async refreshToken(refreshToken: string): Promise<OpenAITokenInfo> {
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OPENAI_CLIENT_ID,
      scope: OPENAI_REFRESH_SCOPE,
    });

    return this.requestToken(payload, refreshToken);
  }

  parseTokenInfo(accessToken?: string, refreshToken?: string, idToken?: string): Partial<OpenAITokenInfo> {
    const idClaims = decodeJwtPayload(idToken);
    const accessClaims = decodeJwtPayload(accessToken);

    return {
      accessToken: accessToken || '',
      refreshToken: refreshToken || '',
      idToken: idToken || '',
      email: String(idClaims?.email || ''),
      chatgptAccountId: String(
        idClaims?.['https://api.openai.com/auth']?.chatgpt_account_id ||
        accessClaims?.['https://api.openai.com/auth']?.chatgpt_account_id ||
        ''
      ),
      expiresAt: Number(accessClaims?.exp || 0),
      expiresIn: Number(accessClaims?.exp ? Math.max(0, accessClaims.exp - Math.floor(Date.now() / 1000)) : 0),
    };
  }

  async fetchWhamSnapshot(sourceUrl: string, accessToken: string, explicitAccountId?: string): Promise<TokenAnalyticsSnapshot> {
    const claims = decodeJwtPayload(accessToken);
    const accountId =
      explicitAccountId ||
      String(claims?.['https://api.openai.com/auth']?.chatgpt_account_id || '');

    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'muse-mail/openai-wham',
    };
    if (accountId) {
      headers['chatgpt-account-id'] = accountId;
    }

    const response = await this.performRequest(OPENAI_WHAM_USAGE_URL, {
      method: 'GET',
      headers,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI 官方额度接口失败：${response.status} ${raw || response.statusText}`);
    }

    let data: WhamUsageResponse;
    try {
      data = JSON.parse(raw) as WhamUsageResponse;
    } catch {
      throw new Error('OpenAI 官方额度接口返回了无法解析的内容');
    }

    const primary = data.rate_limit?.primary_window;
    const secondary = data.rate_limit?.secondary_window;
    const cards = [
      buildWindowCard('five_hour', '5 小时使用限额', primary?.used_percent, primary?.reset_after_seconds ?? this.secondsUntil(primary?.reset_at), 'red'),
      buildWindowCard('weekly', '每周使用限额', secondary?.used_percent, secondary?.reset_after_seconds ?? this.secondsUntil(secondary?.reset_at), 'green'),
    ].filter(Boolean) as TokenQuotaCard[];

    const usageSections: TokenUsageSection[] = cards.length
      ? [{
          title: '官方额度详情',
          subtitle: accountId ? `ChatGPT Account ID: ${accountId}` : '已通过 OpenAI OAuth / Refresh Token 获取官方额度',
          series: cards.map((card) => ({
            label: card.label,
            color: card.tone === 'red' ? '#ef4444' : '#22c55e',
            points: [{
              label: '当前',
              value: card.remainingPct,
              hint: card.resetLabel,
            }],
          })),
        }]
      : [];

    if (!cards.length) {
      throw new Error('OpenAI 官方额度接口已返回数据，但未解析到 5 小时或每周额度窗口');
    }

    return {
      sourceUrl,
      finalUrl: OPENAI_WHAM_USAGE_URL,
      pageTitle: 'Codex 分析',
      fetchedAt: new Date().toISOString(),
      cards,
      usageSections,
      rangeLabels: [],
      legends: ['官方接口', 'Codex'],
      rawSignals: ['wham usage api', accountId ? `chatgpt-account-id:${accountId}` : ''],
      textDigest: raw.slice(0, 4000),
    };
  }

  private secondsUntil(timestamp?: number) {
    if (!timestamp) return null;
    return Math.max(0, timestamp - Math.floor(Date.now() / 1000));
  }

  private async requestToken(payload: URLSearchParams, fallbackRefreshToken = ''): Promise<OpenAITokenInfo> {
    const response = await this.performRequest(OPENAI_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    const raw = await response.text();
    if (!response.ok) {
      if (raw.includes('unsupported_country_region_territory')) {
        throw new Error('OpenAI 当前拒绝了这条网络出口（unsupported_country_region_territory）。请先在 Muse 的代理设置里配置并启用可用代理，再重试 OpenAI 授权。');
      }
      if (raw.includes('refresh_token_reused')) {
        throw new Error(`OpenAI 官方拒绝刷新：refresh_token_reused。系统会保留自动同步并在退避后重试；如果持续失败，再重新 OAuth 授权。`);
      }
      throw new Error(`OpenAI token 请求失败：${response.status} ${raw || response.statusText}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('OpenAI token 响应无法解析');
    }

    const info = this.parseTokenInfo(parsed.access_token, parsed.refresh_token || fallbackRefreshToken, parsed.id_token);
    return {
      accessToken: String(parsed.access_token || ''),
      refreshToken: String(parsed.refresh_token || fallbackRefreshToken || ''),
      idToken: String(parsed.id_token || ''),
      expiresIn: Number(parsed.expires_in || info.expiresIn || 0),
      expiresAt: Number(info.expiresAt || Math.floor(Date.now() / 1000) + Number(parsed.expires_in || 0)),
      email: String(info.email || ''),
      chatgptAccountId: String(info.chatgptAccountId || ''),
    };
  }

  private async performRequest(url: string, options: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) {
    const { agent, dispatcher, type, proxy, recoveryError } = await proxyService.resolveAgent();
    const headers = options.headers || {};
    const targetHost = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    const proxyLabel = proxy ? `${proxy.name || proxy.host}:${proxy.port} (${proxy.type})` : '直连';

    if (recoveryError) {
      throw new Error(`OpenAI 同步前校准内置代理失败：${recoveryError}`);
    }

    if (proxy?.name === 'Muse 内置代理内核') {
      try {
        await proxyKernelService.ensureOpenAiProxyReady();
      } catch (error) {
        throw new Error(`OpenAI 同步前校准内置代理失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      if (type === 'socks5' && agent) {
        const nodefetch = require('node-fetch');
        return nodefetch(url, {
          method: options.method,
          headers,
          body: options.body,
          agent,
        });
      }

      if (type === 'http' && dispatcher) {
        const { fetch: undiciFetch } = require('undici');
        return undiciFetch(url, {
          method: options.method,
          headers,
          body: options.body,
          dispatcher,
        });
      }

      return fetch(url, {
        method: options.method,
        headers,
        body: options.body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI 网络请求失败：${targetHost}，出口：${proxyLabel}，原因：${message}`);
    }
  }
}
