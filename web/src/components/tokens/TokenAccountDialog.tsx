import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { oauthApi } from '../../lib/api';
import type { TokenAccountView, TokenAuthMethod, TokenProvider, TokenSessionFormat } from '../../types';

const PROVIDER_PRESETS: Record<TokenProvider, { label: string; analyticsUrl: string }> = {
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

const SESSION_FORMAT_OPTIONS: Array<{ value: TokenSessionFormat; label: string }> = [
  { value: 'cookie_header', label: 'Cookie Header' },
  { value: 'cookie_json', label: 'Cookie JSON' },
  { value: 'netscape', label: 'Netscape 导出' },
];

const OPENAI_METHOD_OPTIONS: Array<{ value: TokenAuthMethod; label: string }> = [
  { value: 'oauth', label: 'OAuth 授权' },
  { value: 'manual', label: 'Refresh Token' },
  { value: 'api', label: 'API 账号' },
  { value: 'session', label: 'Cookie / Session' },
];

function getDefaultForm() {
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

interface Props {
  open: boolean;
  account: TokenAccountView | null;
  onClose: () => void;
  onSave: (payload: Partial<TokenAccountView>) => Promise<void>;
}

export default function TokenAccountDialog({ open, account, onClose, onSave }: Props) {
  const [form, setForm] = useState(getDefaultForm);
  const [saving, setSaving] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
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
      });
    } else {
      setForm(getDefaultForm());
    }
  }, [open, account]);

  useEffect(() => {
    if (!open) return;

    const handleMessage = async (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'openai-oauth-error') {
        setOauthPending(false);
        toast.error(payload.error || 'OpenAI OAuth 失败');
        return;
      }

      if (payload.type !== 'openai-oauth-success') return;
      setOauthPending(false);

      const next = {
        ...form,
        provider: 'openai_codex' as TokenProvider,
        auth_method: 'oauth' as TokenAuthMethod,
        name: form.name || payload.email || 'OpenAI Codex',
        login_hint: payload.email || form.login_hint,
        external_account_id: payload.external_account_id || '',
        access_token: payload.access_token || '',
        refresh_token: payload.refresh_token || '',
        id_token: payload.id_token || '',
      };

      setForm(next);

      try {
        setSaving(true);
        await onSave(next);
        toast.success('OpenAI OAuth 账号已添加');
        onClose();
      } catch (error: any) {
        toast.error(error.message || 'OpenAI OAuth 账号保存失败');
      } finally {
        setSaving(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [form, onClose, onSave, open]);

  const preset = useMemo(() => PROVIDER_PRESETS[form.provider], [form.provider]);
  const isOpenAI = form.provider === 'openai_codex';
  const currentMethod = isOpenAI ? form.auth_method : 'session';

  if (!open) return null;

  const handleProviderChange = (provider: TokenProvider) => {
    setForm((current) => ({
      ...current,
      provider,
      auth_method: provider === 'openai_codex' ? current.auth_method : 'session',
      analytics_url: PROVIDER_PRESETS[provider].analyticsUrl,
      name: account ? current.name : current.name || PROVIDER_PRESETS[provider].label,
    }));
  };

  const handleOpenAIOAuth = async () => {
    try {
      setOauthPending(true);
      const result = await oauthApi.openaiAuthorize();
      const popup = window.open(result.url, 'muse-openai-oauth', 'width=620,height=780,noopener=false');
      if (!popup) {
        setOauthPending(false);
        toast.error('浏览器拦截了授权窗口，请允许弹窗后重试');
      }
    } catch (error: any) {
      setOauthPending(false);
      toast.error(error.message || '无法启动 OpenAI OAuth');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-[28px] border border-zinc-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-600 dark:text-cyan-400">Account Intake</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{account ? '编辑额度账号' : '新增额度账号'}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">OpenAI 现在支持 OAuth 授权、Refresh Token 导入、API 账号和 Cookie Session 四种接入方式。</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            关闭
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">供应商</label>
            <select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value as TokenProvider)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {Object.entries(PROVIDER_PRESETS).map(([value, item]) => (
                <option key={value} value={value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">账号名称</label>
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="例如：OpenAI 主号 / Claude 团队号"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>

        {isOpenAI && (
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">接入方式</label>
            <div className="grid gap-2 md:grid-cols-4">
              {OPENAI_METHOD_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setForm((current) => ({ ...current, auth_method: item.value }))}
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    currentMethod === item.value
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-3xl border border-cyan-200/70 bg-cyan-50/80 p-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-100">
          <div className="font-medium">{preset.label} 默认分析页</div>
          <div className="mt-1 break-all text-cyan-800/80 dark:text-cyan-100/80">{preset.analyticsUrl}</div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">登录标识</label>
            <input
              value={form.login_hint}
              onChange={(e) => setForm((current) => ({ ...current, login_hint: e.target.value }))}
              placeholder="邮箱 / 备注 / 团队名"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">官方分析页 URL</label>
            <input
              value={form.analytics_url}
              onChange={(e) => setForm((current) => ({ ...current, analytics_url: e.target.value }))}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>

        {currentMethod === 'oauth' && (
          <div className="mt-4 rounded-[24px] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">OpenAI OAuth 授权</div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">点击后会打开 OpenAI 官方授权页，成功后会自动把 access token、refresh token 和 ChatGPT account id 带回 muse。</p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">如果你当前网络出口被 OpenAI 地域风控拦截，请先去“代理设置”启用默认代理，OpenAI token 交换会自动复用它。</p>
            <button
              onClick={handleOpenAIOAuth}
              disabled={oauthPending || saving}
              className="mt-4 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
            >
              {oauthPending ? '授权窗口已打开...' : '打开 OpenAI 授权'}
            </button>
            {(form.refresh_token || form.access_token) && (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                已收到 OAuth 返回的 token，保存后即可参与官方额度刷新。
              </div>
            )}
          </div>
        )}

        {currentMethod === 'manual' && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Refresh Token</label>
              <textarea
                value={form.refresh_token}
                onChange={(e) => setForm((current) => ({ ...current, refresh_token: e.target.value }))}
                rows={5}
                placeholder="粘贴 OpenAI refresh_token。保存时后端会自动换取 access_token / id_token 并补全账号信息。"
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
          </div>
        )}

        {currentMethod === 'api' && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Model Provider</label>
              <input
                value={form.api_model_provider}
                onChange={(e) => setForm((current) => ({ ...current, api_model_provider: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Model</label>
              <input
                value={form.api_model}
                onChange={(e) => setForm((current) => ({ ...current, api_model: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Base URL</label>
              <input
                value={form.api_base_url}
                onChange={(e) => setForm((current) => ({ ...current, api_base_url: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Wire API</label>
              <select
                value={form.api_wire_api}
                onChange={(e) => setForm((current) => ({ ...current, api_wire_api: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <option value="responses">responses</option>
                <option value="chat">chat</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Reasoning Effort</label>
              <select
                value={form.api_reasoning_effort}
                onChange={(e) => setForm((current) => ({ ...current, api_reasoning_effort: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">API Key</label>
              <textarea
                value={form.api_key}
                onChange={(e) => setForm((current) => ({ ...current, api_key: e.target.value }))}
                rows={4}
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
          </div>
        )}

        {currentMethod === 'session' && (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">会话格式</label>
                <select
                  value={form.session_format}
                  onChange={(e) => setForm((current) => ({ ...current, session_format: e.target.value as TokenSessionFormat }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {SESSION_FORMAT_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">User-Agent</label>
                <input
                  value={form.user_agent}
                  onChange={(e) => setForm((current) => ({ ...current, user_agent: e.target.value }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Cookie / Session 内容</label>
              <textarea
                value={form.session_payload}
                onChange={(e) => setForm((current) => ({ ...current, session_payload: e.target.value }))}
                rows={7}
                placeholder="可粘贴 Cookie Header、Chrome 导出的 Cookie JSON，或 Netscape cookie 文件内容。"
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>
          </>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">备注</label>
          <input
            value={form.note}
            onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
            placeholder="记录套餐、用途、有效期、来源等"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || oauthPending || !canSave}
            className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
          >
            {saving ? '保存中...' : account ? '保存修改' : '添加账号'}
          </button>
        </div>
      </div>
    </div>
  );
}
