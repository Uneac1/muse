import { ProxyService } from './ProxyService';
import logger from '../utils/logger';
import { config } from '../config';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';

const proxyService = new ProxyService();
const GOOGLE_MAIL_SCOPE = 'https://mail.google.com/';
const GOOGLE_IDENTITY_SCOPE = 'openid email';
const ipv4HttpsAgent = new https.Agent({ family: 4 });
const execFileAsync = promisify(execFile);
const GOOGLE_API_HOST_RE = /^https:\/\/(?:oauth2|www)\.googleapis\.com\//;

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}

interface TokenResult {
  access_token: string;
  refresh_token?: string;  // 新增：微软返回的新 refresh_token
  id_token?: string;
  has_mail_scope?: boolean;
  expires_in: number;
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

export class OAuthService {
  private createResponse(status: number, body: string): FetchLikeResponse {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  }

  private async powershellRequest(
    method: 'GET' | 'POST',
    url: string,
    body = '',
    headers: Record<string, string> = {},
  ): Promise<FetchLikeResponse> {
    const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{}
if ($env:REQ_HEADERS) {
  $parsed = $env:REQ_HEADERS | ConvertFrom-Json
  foreach ($prop in $parsed.PSObject.Properties) {
    $headers[$prop.Name] = [string]$prop.Value
  }
}
$params = @{
  Uri = $env:REQ_URL
  Method = $env:REQ_METHOD
  Headers = $headers
  UseBasicParsing = $true
}
if ($env:REQ_METHOD -eq 'POST') {
  $params.Body = $env:REQ_BODY
  if (-not $headers.ContainsKey('Content-Type')) {
    $params.ContentType = 'application/x-www-form-urlencoded'
  }
}
try {
  $response = Invoke-WebRequest @params
  $status = [int]$response.StatusCode
  $content = [string]$response.Content
} catch {
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $content = $reader.ReadToEnd()
    } elseif ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $content = [string]$_.ErrorDetails.Message
    } else {
      $content = [string]$_.Exception.Message
    }
  } else {
    throw
  }
}
$result = @{ status = $status; body = $content } | ConvertTo-Json -Compress
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($result))
`;

    const env = {
      ...process.env,
      REQ_METHOD: method,
      REQ_URL: url,
      REQ_BODY: body,
      REQ_HEADERS: JSON.stringify(headers),
    };

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      env,
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    const encoded = stdout.trim().split(/\r?\n/).pop() || '';
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const result = JSON.parse(decoded) as { status: number; body: string };
    return this.createResponse(result.status, result.body || '');
  }

  private async postForm(url: string, body: string, proxyId?: number): Promise<any> {
    const { agent, dispatcher, type } = proxyService.getAgent(proxyId);

    try {
      if (!type && process.platform === 'win32' && GOOGLE_API_HOST_RE.test(url)) {
        return this.powershellRequest('POST', url, body, { 'Content-Type': 'application/x-www-form-urlencoded' });
      }

      const nodefetch = require('node-fetch');

      if (type === 'socks5' && agent) {
        return nodefetch(url, {
          method: 'POST',
          agent,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
      }

      if (type === 'http' && dispatcher) {
        const { fetch: undiciFetch } = require('undici');
        const opts: any = {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          dispatcher,
        };
        return undiciFetch(url, opts);
      }

      return nodefetch(url, {
        method: 'POST',
        agent: ipv4HttpsAgent,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err: any) {
      if (process.platform === 'win32' && GOOGLE_API_HOST_RE.test(url)) {
        logger.warn(`Node POST failed for ${url}, retrying with PowerShell: ${err.message || 'Unknown error'}`);
        return this.powershellRequest('POST', url, body, { 'Content-Type': 'application/x-www-form-urlencoded' });
      }
      throw new Error(`POST ${url} failed: ${err.message || 'Unknown error'}`);
    }
  }

  private async getJson(url: string, accessToken: string, proxyId?: number): Promise<any> {
    const { agent, dispatcher, type } = proxyService.getAgent(proxyId);

    try {
      if (!type && process.platform === 'win32' && GOOGLE_API_HOST_RE.test(url)) {
        return this.powershellRequest('GET', url, '', {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        });
      }

      const nodefetch = require('node-fetch');

      if (type === 'socks5' && agent) {
        return nodefetch(url, {
          agent,
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
      }

      if (type === 'http' && dispatcher) {
        const { fetch: undiciFetch } = require('undici');
        const opts: any = {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          dispatcher,
        };
        return undiciFetch(url, opts);
      }

      return nodefetch(url, {
        agent: ipv4HttpsAgent,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      if (process.platform === 'win32' && GOOGLE_API_HOST_RE.test(url)) {
        logger.warn(`Node GET failed for ${url}, retrying with PowerShell: ${err.message || 'Unknown error'}`);
        return this.powershellRequest('GET', url, '', {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        });
      }
      throw new Error(`GET ${url} failed: ${err.message || 'Unknown error'}`);
    }
  }

  async refreshGraphToken(clientId: string, refreshToken: string, proxyId?: number): Promise<TokenResult> {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://graph.microsoft.com/.default offline_access',
    }).toString();
    const response = await this.postForm('https://login.microsoftonline.com/common/oauth2/v2.0/token', body, proxyId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const hasMailScope = data.scope?.includes('Mail.Read') ?? false;
    const hasNewRefreshToken = !!data.refresh_token;
    const tokenChanged = data.refresh_token && data.refresh_token !== refreshToken;
    logger.info(`Graph token refreshed, has_mail_scope: ${hasMailScope}, has_new_rt: ${hasNewRefreshToken}, rt_changed: ${tokenChanged}`);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,  // 新增
      has_mail_scope: hasMailScope,
      expires_in: data.expires_in,
    };
  }

  async refreshImapToken(clientId: string, refreshToken: string, proxyId?: number): Promise<TokenResult> {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
    }).toString();
    const response = await this.postForm('https://login.microsoftonline.com/common/oauth2/v2.0/token', body, proxyId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IMAP token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const hasNewRefreshToken = !!data.refresh_token;
    const tokenChanged = data.refresh_token && data.refresh_token !== refreshToken;
    logger.info(`IMAP token refreshed, has_new_rt: ${hasNewRefreshToken}, rt_changed: ${tokenChanged}`);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,  // 新增
      expires_in: data.expires_in,
    };
  }

  createGoogleAuthorizationUrl(
    clientId: string,
    state: string,
    loginHint?: string,
    options?: { redirectUri?: string; scope?: string; prompt?: string }
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: options?.redirectUri || config.googleOAuthRedirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: options?.prompt || 'consent',
      include_granted_scopes: 'true',
      scope: options?.scope || `${GOOGLE_MAIL_SCOPE} ${GOOGLE_IDENTITY_SCOPE}`,
      state,
    });
    if (loginHint) params.set('login_hint', loginHint);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeGoogleAuthorizationCode(
    clientId: string,
    clientSecret: string,
    code: string,
    proxyId?: number,
    redirectUri?: string
  ): Promise<TokenResult> {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri || config.googleOAuthRedirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const response = await this.postForm('https://oauth2.googleapis.com/token', body, proxyId);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google OAuth exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      expires_in: data.expires_in,
    };
  }

  async refreshGoogleToken(clientId: string, clientSecret: string, refreshToken: string, proxyId?: number): Promise<TokenResult> {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const response = await this.postForm('https://oauth2.googleapis.com/token', body, proxyId);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  }

  async fetchGoogleUserEmail(accessToken: string, proxyId?: number): Promise<string> {
    const response = await this.getJson('https://www.googleapis.com/oauth2/v2/userinfo', accessToken, proxyId);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google userinfo fetch failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.email || '';
  }

  extractEmailFromGoogleIdToken(idToken?: string): string {
    const payload = decodeJwtPayload(idToken);
    return payload?.email || '';
  }
}
