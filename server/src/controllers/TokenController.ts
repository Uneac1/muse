import type { Context } from 'koa';
import { TokenAccountModel } from '../models/TokenAccount';
import { TokenQuotaService } from '../services/TokenQuotaService';
import { OpenAIAccountService } from '../services/OpenAIAccountService';
import type { TokenAccount, TokenAccountView, TokenAuthMethod, TokenProvider, TokenSessionFormat } from '../types';
import { fail, success } from '../utils/response';

const model = new TokenAccountModel();
const service = new TokenQuotaService();
const openAIAccountService = new OpenAIAccountService();
const PROVIDERS: TokenProvider[] = ['openai_codex', 'claude', 'claude_code'];
const SESSION_FORMATS: TokenSessionFormat[] = ['cookie_header', 'cookie_json', 'netscape'];
const AUTH_METHODS: TokenAuthMethod[] = ['session', 'oauth', 'manual', 'api'];

export class TokenController {
  constructor() {
    this.listAccounts = this.listAccounts.bind(this);
    this.createAccount = this.createAccount.bind(this);
    this.updateAccount = this.updateAccount.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.syncAccount = this.syncAccount.bind(this);
    this.syncAll = this.syncAll.bind(this);
  }

  private normalizeProvider(input: any): TokenProvider {
    const provider = String(input || 'openai_codex').toLowerCase() as TokenProvider;
    return PROVIDERS.includes(provider) ? provider : 'openai_codex';
  }

  private normalizeSessionFormat(input: any): TokenSessionFormat {
    const format = String(input || 'cookie_header').toLowerCase() as TokenSessionFormat;
    return SESSION_FORMATS.includes(format) ? format : 'cookie_header';
  }

  private normalizeAuthMethod(input: any, provider: TokenProvider): TokenAuthMethod {
    const fallback = provider === 'openai_codex' ? 'oauth' : 'session';
    const method = String(input || fallback).toLowerCase() as TokenAuthMethod;
    return AUTH_METHODS.includes(method) ? method : fallback;
  }

  private buildView(account: TokenAccount): TokenAccountView {
    let snapshot = null;
    if (account.snapshot_json) {
      try {
        snapshot = JSON.parse(account.snapshot_json);
      } catch {
        snapshot = null;
      }
    }

    const { snapshot_json, ...rest } = account;

    return {
      ...rest,
      provider_label: model.getProviderLabel(account.provider),
      snapshot,
    };
  }

  private normalizePayload(body: any): Partial<TokenAccount> {
    const provider = this.normalizeProvider(body.provider);
    const status: TokenAccount['status'] = body.status === 'inactive' ? 'inactive' : 'active';
    return {
      provider,
      auth_method: this.normalizeAuthMethod(body.auth_method, provider),
      name: String(body.name || '').trim(),
      session_format: this.normalizeSessionFormat(body.session_format),
      login_hint: String(body.login_hint || '').trim(),
      external_account_id: String(body.external_account_id || '').trim(),
      analytics_url: String(body.analytics_url || service.getDefaultAnalyticsUrl(provider)).trim(),
      session_payload: String(body.session_payload || '').trim(),
      access_token: String(body.access_token || '').trim(),
      refresh_token: String(body.refresh_token || '').trim(),
      id_token: String(body.id_token || '').trim(),
      user_agent: String(body.user_agent || service.getDefaultUserAgent()).trim(),
      api_key: String(body.api_key || '').trim(),
      api_base_url: String(body.api_base_url || '').trim(),
      api_model: String(body.api_model || '').trim(),
      api_model_provider: String(body.api_model_provider || '').trim(),
      api_reasoning_effort: String(body.api_reasoning_effort || '').trim(),
      api_wire_api: String(body.api_wire_api || '').trim(),
      note: String(body.note || '').trim(),
      status,
      auto_sync_enabled: body.auto_sync_enabled === 0 || body.auto_sync_enabled === false ? 0 : 1,
    };
  }

  private validateAccount(payload: Partial<TokenAccount>) {
    if (!payload.name?.trim()) return 'name is required';
    if (!payload.analytics_url?.trim()) return 'analytics_url is required';
    if (payload.auth_method === 'api') {
      if (!payload.api_base_url?.trim()) return 'api_base_url is required';
      if (!payload.api_key?.trim()) return 'api_key is required';
      return null;
    }
    if (payload.auth_method === 'oauth' || payload.auth_method === 'manual') {
      if (!payload.refresh_token?.trim() && !payload.access_token?.trim()) {
        return 'refresh_token or access_token is required';
      }
      return null;
    }
    if (!payload.session_payload?.trim()) return 'session_payload is required';
    return null;
  }

  private async enrichPayload(payload: Partial<TokenAccount>) {
    if (payload.provider !== 'openai_codex') return payload;

    if ((payload.auth_method === 'oauth' || payload.auth_method === 'manual') && payload.refresh_token?.trim()) {
      const token = await openAIAccountService.refreshToken(payload.refresh_token);
      return {
        ...payload,
        access_token: token.accessToken,
        refresh_token: token.refreshToken || payload.refresh_token,
        id_token: token.idToken,
        login_hint: payload.login_hint || token.email || '',
        external_account_id: payload.external_account_id || token.chatgptAccountId || '',
        name: payload.name || token.email || 'OpenAI Codex',
      };
    }

    if ((payload.auth_method === 'oauth' || payload.auth_method === 'manual') && payload.access_token?.trim()) {
      const info = openAIAccountService.parseTokenInfo(payload.access_token, payload.refresh_token, payload.id_token);
      return {
        ...payload,
        login_hint: payload.login_hint || String(info.email || ''),
        external_account_id: payload.external_account_id || String(info.chatgptAccountId || ''),
        name: payload.name || String(info.email || '') || 'OpenAI Codex',
      };
    }

    return payload;
  }

  async listAccounts(ctx: Context) {
    success(ctx, model.list().map((item) => this.buildView(item)));
  }

  async createAccount(ctx: Context) {
    const payload = await this.enrichPayload(this.normalizePayload(ctx.request.body as any));
    const error = this.validateAccount(payload);
    if (error) return fail(ctx, error, 400);
    success(ctx, this.buildView(model.create(payload)));
  }

  async updateAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const current = model.getById(id);
    if (!current) return fail(ctx, 'token account not found', 404);

    const payload = await this.enrichPayload({ ...current, ...this.normalizePayload({ ...current, ...(ctx.request.body as any) }) });
    const error = this.validateAccount(payload);
    if (error) return fail(ctx, error, 400);

    const updated = model.update(id, payload);
    if (!updated) return fail(ctx, 'token account not found', 404);
    success(ctx, this.buildView(updated));
  }

  async deleteAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const deleted = model.delete(id);
    if (!deleted) return fail(ctx, 'token account not found', 404);
    success(ctx, { deleted: true });
  }

  async syncAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const account = model.getById(id);
    if (!account) return fail(ctx, 'token account not found', 404);

    try {
      const snapshot = await service.syncAccount(account);
      model.saveSyncResult(id, 'active', '', snapshot);
      success(ctx, this.buildView(model.getById(id)!));
    } catch (error: any) {
      model.saveSyncResult(id, 'error', error.message || '同步失败', null);
      fail(ctx, error.message || '同步官方额度失败', 500);
    }
  }

  async syncAll(ctx: Context) {
    const results: TokenAccountView[] = [];

    for (const account of model.list()) {
      try {
        const snapshot = await service.syncAccount(account);
        model.saveSyncResult(account.id, 'active', '', snapshot);
      } catch (error: any) {
        model.saveSyncResult(account.id, 'error', error.message || '同步失败', null);
      }

      const updated = model.getById(account.id);
      if (updated) {
        results.push(this.buildView(updated));
      }
    }

    success(ctx, results);
  }
}
