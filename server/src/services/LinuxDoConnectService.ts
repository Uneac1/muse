import crypto from 'crypto';
import { config } from '../config';
import type { LinuxDoUser } from '../types';

const AUTHORIZE_ENDPOINT = 'https://connect.linux.do/oauth2/authorize';
const TOKEN_ENDPOINTS = [
  'https://connect.linux.do/oauth2/token',
  'https://connect.linuxdo.org/oauth2/token',
];
const USERINFO_ENDPOINTS = [
  'https://connect.linux.do/api/user',
  'https://connect.linuxdo.org/api/user',
];

export interface LinuxDoTokenPayload {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface LinuxDoSessionRecord {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string[];
  expiresAt: string | null;
  user: LinuxDoUser | null;
}

export class LinuxDoConnectService {
  createAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.linuxDoClientId,
      redirect_uri: config.linuxDoOAuthRedirectUri,
      scope: 'profile',
      state,
    });
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
  }

  createState() {
    return crypto.randomBytes(24).toString('hex');
  }

  isConfigured() {
    return !!config.linuxDoClientId && !!config.linuxDoClientSecret;
  }

  async exchangeCode(code: string): Promise<LinuxDoTokenPayload> {
    return this.requestToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.linuxDoOAuthRedirectUri,
    }).toString());
  }

  async refreshToken(refreshToken: string): Promise<LinuxDoTokenPayload> {
    return this.requestToken(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString());
  }

  async fetchCurrentUser(accessToken: string): Promise<LinuxDoUser> {
    let lastError: Error | null = null;
    for (const endpoint of USERINFO_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'User-Agent': 'muse-mail-linuxdo/1.0',
          },
        });
        if (!res.ok) {
          throw new Error(`Linux.do userinfo failed: ${res.status} ${await res.text()}`);
        }
        return await res.json() as LinuxDoUser;
      } catch (error: any) {
        lastError = error;
      }
    }
    throw lastError || new Error('Linux.do userinfo request failed');
  }

  buildSessionRecord(token: LinuxDoTokenPayload, user: LinuxDoUser | null): LinuxDoSessionRecord {
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: token.token_type || 'Bearer',
      scope: String(token.scope || '')
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      user,
    };
  }

  parseSessionRecord(payload: string): LinuxDoSessionRecord | null {
    try {
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object' || !parsed.accessToken) return null;
      return {
        accessToken: String(parsed.accessToken),
        refreshToken: parsed.refreshToken ? String(parsed.refreshToken) : undefined,
        tokenType: String(parsed.tokenType || 'Bearer'),
        scope: Array.isArray(parsed.scope) ? parsed.scope.map((item: unknown) => String(item)) : [],
        expiresAt: parsed.expiresAt ? String(parsed.expiresAt) : null,
        user: parsed.user || null,
      };
    } catch {
      return null;
    }
  }

  private async requestToken(body: string): Promise<LinuxDoTokenPayload> {
    const basic = Buffer.from(`${config.linuxDoClientId}:${config.linuxDoClientSecret}`).toString('base64');
    let lastError: Error | null = null;

    for (const endpoint of TOKEN_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'muse-mail-linuxdo/1.0',
          },
          body,
        });
        if (!res.ok) {
          throw new Error(`Linux.do token exchange failed: ${res.status} ${await res.text()}`);
        }
        return await res.json() as LinuxDoTokenPayload;
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError || new Error('Linux.do token exchange failed');
  }
}
