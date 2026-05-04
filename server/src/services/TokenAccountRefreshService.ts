import { TokenAccountModel } from '../models/TokenAccount';
import type { TokenAccount } from '../types';
import { OpenAIAccountService } from './OpenAIAccountService';
import type { OpenAITokenInfo } from './OpenAIAccountService';

const tokenAccountModel = new TokenAccountModel();
const openAIAccountService = new OpenAIAccountService();
const refreshLocks = new Map<number, Promise<OpenAITokenInfo>>();

function getReusableOpenAITokenInfo(account: TokenAccount): OpenAITokenInfo | null {
  const parsed = openAIAccountService.parseTokenInfo(account.access_token, account.refresh_token, account.id_token);
  if (!parsed.accessToken) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(parsed.expiresAt || 0);
  if (expiresAt && expiresAt - nowSeconds <= 300) return null;

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken || account.refresh_token || '',
    idToken: parsed.idToken || account.id_token || '',
    expiresAt,
    expiresIn: Number(parsed.expiresIn || Math.max(0, expiresAt - nowSeconds)),
    email: parsed.email || account.login_hint || '',
    chatgptAccountId: parsed.chatgptAccountId || account.external_account_id || '',
  };
}

export async function refreshOpenAITokenAccount(account: TokenAccount, forceRefresh = false): Promise<OpenAITokenInfo> {
  const existing = refreshLocks.get(account.id);
  if (existing) return existing;

  const promise = (async () => {
    const latest = tokenAccountModel.getById(account.id) || account;
    const reusable = forceRefresh ? null : getReusableOpenAITokenInfo(latest);
    if (reusable) return reusable;

    const refreshToken = latest.refresh_token || account.refresh_token;
    if (!refreshToken) {
      const parsed = openAIAccountService.parseTokenInfo(latest.access_token, latest.refresh_token, latest.id_token);
      if (!parsed.accessToken) throw new Error('账号缺少 access_token / refresh_token，无法刷新 OpenAI 账号');
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken || '',
        idToken: parsed.idToken || '',
        expiresAt: parsed.expiresAt || 0,
        expiresIn: parsed.expiresIn || 0,
        email: parsed.email || '',
        chatgptAccountId: parsed.chatgptAccountId || latest.external_account_id || '',
      };
    }

    const token = await openAIAccountService.refreshToken(refreshToken);
    tokenAccountModel.update(account.id, {
      ...latest,
      access_token: token.accessToken || latest.access_token,
      refresh_token: token.refreshToken || refreshToken,
      id_token: token.idToken || latest.id_token,
      login_hint: latest.login_hint || token.email || '',
      external_account_id: token.chatgptAccountId || latest.external_account_id,
      status: 'active',
      auto_sync_enabled: 1,
      last_error: '',
      next_retry_at: null,
      failure_count: 0,
      last_failure_kind: 'none',
    });
    return token;
  })().finally(() => {
    if (refreshLocks.get(account.id) === promise) {
      refreshLocks.delete(account.id);
    }
  });

  refreshLocks.set(account.id, promise);
  return promise;
}
