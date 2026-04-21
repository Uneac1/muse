import crypto from 'crypto';
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../config';
import type {
  IntegrationTokenRecord,
  YmailAddressCredential,
  YmailAddressSummary,
  YmailIntegrationData,
  YmailMailSummary,
  YmailOpenSettings,
  YmailStatistics,
} from '../types';

interface YmailRequestOptions {
  method?: string;
  body?: unknown;
  adminPassword?: string;
  jwt?: string;
}

interface YmailAddressListResponse {
  results?: YmailAddressSummary[];
  count?: number;
  [key: string]: any;
}

interface YmailMailListResponse {
  results?: YmailMailSummary[];
  count?: number;
  [key: string]: any;
}

export class YmailService {
  private dispatcher = new Agent({
    connect: {
      family: 4,
      rejectUnauthorized: false,
    },
  });

  private fingerprint = crypto
    .createHash('sha256')
    .update('muse-mail-ymail')
    .digest('hex')
    .slice(0, 32);

  private maskToken(token: string): string {
    if (!token) return '';
    if (token.length <= 8) return `${token.slice(0, 2)}***`;
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private buildHeaders(options: YmailRequestOptions = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-lang': 'zh',
      'x-fingerprint': this.fingerprint,
    };

    if (options.adminPassword) {
      headers['x-admin-auth'] = options.adminPassword;
    }

    if (options.jwt) {
      headers.Authorization = `Bearer ${options.jwt}`;
    }

    return headers;
  }

  private async request<T>(path: string, options: YmailRequestOptions = {}): Promise<T> {
    const url = `${config.ymailApiBaseUrl}${path}`;
    const response = await undiciFetch(url, {
      dispatcher: this.dispatcher,
      method: options.method || 'GET',
      headers: this.buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const parsed = contentType.includes('application/json') && text
      ? JSON.parse(text)
      : this.tryParseJson(text);

    if (response.status >= 300) {
      const message =
        typeof parsed === 'string'
          ? parsed
          : parsed?.message || parsed?.error || text || response.statusText;
      throw new Error(`Ymail request failed: ${response.status} ${message}`);
    }

    return parsed as T;
  }

  private tryParseJson(text: string): any {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async fetchOpenSettings(): Promise<YmailOpenSettings> {
    return this.request<YmailOpenSettings>('/open_api/settings');
  }

  async validateAdminPassword(adminPassword: string): Promise<void> {
    await this.request('/open_api/admin_login', {
      method: 'POST',
      body: {
        password: this.sha256(adminPassword),
      },
    });
  }

  async fetchStatistics(adminPassword: string): Promise<YmailStatistics> {
    return this.request<YmailStatistics>('/admin/statistics', { adminPassword });
  }

  async listAddresses(
    adminPassword: string,
    params: { limit?: number; offset?: number; query?: string; sortBy?: string; sortOrder?: string } = {}
  ): Promise<{ results: YmailAddressSummary[]; count: number }> {
    const search = new URLSearchParams();
    search.set('limit', String(params.limit ?? 50));
    search.set('offset', String(params.offset ?? 0));
    if (params.query) search.set('query', params.query);
    if (params.sortBy) search.set('sort_by', params.sortBy);
    if (params.sortOrder) search.set('sort_order', params.sortOrder);

    const result = await this.request<YmailAddressListResponse>(`/admin/address?${search.toString()}`, { adminPassword });
    return {
      results: Array.isArray(result?.results) ? result.results : [],
      count: Number(result?.count || 0),
    };
  }

  async createAddress(
    adminPassword: string,
    data: { name: string; domain: string; enablePrefix?: boolean; enableRandomSubdomain?: boolean }
  ): Promise<YmailAddressCredential> {
    const result = await this.request<YmailAddressCredential & { jwt: string }>('/admin/new_address', {
      method: 'POST',
      adminPassword,
      body: {
        enablePrefix: data.enablePrefix ?? true,
        enableRandomSubdomain: data.enableRandomSubdomain ?? false,
        name: data.name,
        domain: data.domain,
      },
    });

    return {
      ...result,
      loginUrl: result?.jwt ? `${config.ymailSiteUrl}/?jwt=${encodeURIComponent(result.jwt)}` : '',
    };
  }

  async showAddressCredential(adminPassword: string, id: number): Promise<YmailAddressCredential> {
    const result = await this.request<{ jwt: string }>(`/admin/show_password/${id}`, { adminPassword });
    return {
      jwt: result.jwt,
      loginUrl: result?.jwt ? `${config.ymailSiteUrl}/?jwt=${encodeURIComponent(result.jwt)}` : '',
    };
  }

  async deleteAddress(adminPassword: string, id: number): Promise<void> {
    await this.request(`/admin/delete_address/${id}`, { method: 'DELETE', adminPassword });
  }

  async clearInbox(adminPassword: string, id: number): Promise<void> {
    await this.request(`/admin/clear_inbox/${id}`, { method: 'DELETE', adminPassword });
  }

  async clearSentItems(adminPassword: string, id: number): Promise<void> {
    await this.request(`/admin/clear_sent_items/${id}`, { method: 'DELETE', adminPassword });
  }

  async resetAddressPassword(adminPassword: string, id: number, password: string): Promise<void> {
    await this.request(`/admin/address/${id}/reset_password`, {
      method: 'POST',
      adminPassword,
      body: { password },
    });
  }

  async fetchMailboxSettings(jwt: string): Promise<{ address?: string; [key: string]: any }> {
    return this.request('/api/settings', { jwt });
  }

  async fetchAddressMails(jwt: string, params: { limit?: number; offset?: number } = {}): Promise<{ results: YmailMailSummary[]; count: number }> {
    const search = new URLSearchParams();
    search.set('limit', String(params.limit ?? 20));
    search.set('offset', String(params.offset ?? 0));
    const result = await this.request<YmailMailListResponse>(`/api/mails?${search.toString()}`, { jwt });
    return {
      results: Array.isArray(result?.results) ? result.results : [],
      count: Number(result?.count || 0),
    };
  }

  async deleteMail(jwt: string, mailId: number): Promise<void> {
    await this.request(`/api/mails/${mailId}`, { method: 'DELETE', jwt });
  }

  async fetchIntegrationData(record: IntegrationTokenRecord): Promise<YmailIntegrationData> {
    const [openSettings, statistics, addresses] = await Promise.all([
      this.fetchOpenSettings(),
      this.fetchStatistics(record.token),
      this.listAddresses(record.token, { limit: 50, offset: 0 }),
    ]);

    return {
      connected: true,
      tokenMasked: this.maskToken(record.token),
      lastSyncAt: record.updated_at,
      siteUrl: config.ymailSiteUrl,
      apiBaseUrl: config.ymailApiBaseUrl,
      openSettings,
      statistics,
      addresses: addresses.results,
      addressCount: addresses.count,
    };
  }
}
