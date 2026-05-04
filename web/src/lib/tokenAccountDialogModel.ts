import type { OpenAIOAuthResult, TokenAccountView, TokenAuthMethod, TokenProvider, TokenSessionFormat } from '../types';

export const PROVIDER_PRESETS: Record<TokenProvider, { label: string; analyticsUrl: string }> = {
  openai_codex: {
    label: 'OpenAI Codex',
    analyticsUrl: 'https://chatgpt.com/codex/cloud/settings/analytics',
  },
  claude: {
    label: 'Claude',
    analyticsUrl: 'https://claude.ai/settings/billing',
  },
  claude_code: {
    label: 'Claude Code',
    analyticsUrl: 'https://claude.ai/settings/billing',
  },
};

export const SESSION_FORMAT_OPTIONS: Array<{ value: TokenSessionFormat; label: string }> = [
  { value: 'cookie_header', label: 'Cookie Header' },
  { value: 'cookie_json', label: 'Cookie JSON' },
  { value: 'netscape', label: 'Netscape 导出' },
];

export const OPENAI_METHOD_OPTIONS: Array<{ value: TokenAuthMethod; label: string }> = [
  { value: 'oauth', label: 'OAuth 授权' },
  { value: 'manual', label: 'Refresh Token' },
  { value: 'api', label: 'API 账号' },
  { value: 'session', label: 'Cookie / Session' },
];

export type TokenAccountForm = ReturnType<typeof getDefaultTokenForm>;

export function getDefaultTokenForm() {
  return {
    provider: 'openai_codex' as TokenProvider,
    auth_method: 'oauth' as TokenAuthMethod,
    name: '',
    session_format: 'cookie_header' as TokenSessionFormat,
    login_hint: '',
    external_account_id: '',
    analytics_url: PROVIDER_PRESETS.openai_codex.analyticsUrl,
    session_payload: '',
    access_token: '',
    refresh_token: '',
    id_token: '',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    api_key: '',
    api_base_url: 'https://api.openai.com/v1',
    api_model: 'gpt-5-codex',
    api_model_provider: 'openai',
    api_reasoning_effort: 'medium',
    api_wire_api: 'responses',
    note: '',
    auto_sync_enabled: 1,
  };
}

export function tokenAccountToForm(account: TokenAccountView): TokenAccountForm {
  return {
    provider: account.provider,
    auth_method: account.auth_method,
    name: account.name,
    session_format: account.session_format,
    login_hint: account.login_hint,
    external_account_id: account.external_account_id,
    analytics_url: account.analytics_url,
    session_payload: account.session_payload,
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    id_token: account.id_token,
    user_agent: account.user_agent,
    api_key: account.api_key,
    api_base_url: account.api_base_url,
    api_model: account.api_model,
    api_model_provider: account.api_model_provider,
    api_reasoning_effort: account.api_reasoning_effort,
    api_wire_api: account.api_wire_api,
    note: account.note,
    auto_sync_enabled: account.auto_sync_enabled,
  };
}

export function applyProviderPreset(current: TokenAccountForm, provider: TokenProvider, editing: boolean): TokenAccountForm {
  return {
    ...current,
    provider,
    auth_method: provider === 'openai_codex' ? current.auth_method : 'session',
    analytics_url: PROVIDER_PRESETS[provider].analyticsUrl,
    name: editing ? current.name : current.name || PROVIDER_PRESETS[provider].label,
  };
}

export function applyOpenAiOAuthResult(form: TokenAccountForm, result: Partial<OpenAIOAuthResult>): TokenAccountForm {
  return {
    ...form,
    provider: 'openai_codex',
    auth_method: 'oauth',
    name: form.name || result.email || 'OpenAI Codex',
    login_hint: result.email || form.login_hint,
    external_account_id: result.external_account_id || '',
    access_token: result.access_token || '',
    refresh_token: result.refresh_token || '',
    id_token: result.id_token || '',
  };
}

export function getTokenDialogView(form: TokenAccountForm, account: TokenAccountView | null, oauthPending: boolean, oauthState: string) {
  const isOpenAI = form.provider === 'openai_codex';
  const currentMethod = isOpenAI ? form.auth_method : 'session';
  const canSave =
    !!form.name.trim() &&
    !!form.analytics_url.trim() &&
    (
      currentMethod === 'api'
        ? !!form.api_key.trim() && !!form.api_base_url.trim()
        : currentMethod === 'oauth' || currentMethod === 'manual'
          ? !!form.refresh_token.trim() || !!form.access_token.trim()
          : !!form.session_payload.trim()
    );

  return {
    preset: PROVIDER_PRESETS[form.provider],
    isOpenAI,
    currentMethod,
    canSave,
    title: account ? '编辑额度账号' : '新增额度账号',
    submitLabel: account ? '保存修改' : '添加账号',
    savingLabel: '保存中...',
    oauthButtonLabel: oauthPending ? '等待授权完成...' : '在当前浏览器打开授权',
    oauthStatePreview: oauthState ? `${oauthState.slice(0, 12)}...` : '',
    hasOAuthToken: Boolean(form.refresh_token || form.access_token),
  };
}

export function buildOpenAiPopupFeatures(screenX: number, outerWidth: number, screenY: number, outerHeight: number) {
  const width = 720;
  const height = 840;
  const left = Math.max(0, Math.round(screenX + (outerWidth - width) / 2));
  const top = Math.max(0, Math.round(screenY + (outerHeight - height) / 2));
  return [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
}
