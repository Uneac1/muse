import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authApi, oauthApi } from '../../lib/api';
import type { AiAccount, AiProvider } from '../../types';

const GEMINI_OAUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever';

const PROVIDER_PRESETS: Record<AiProvider, { label: string; baseUrl: string; model: string; hint: string; protocol: string; fallback?: string }> = {
  chatgpt: {
    label: 'ChatGPT',
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-4o-mini',
    hint: '按你的 AnyRouter 网关预填，可直接配置 GPT 系列模型。',
    protocol: 'OpenAI Chat Completions',
  },
  codex: {
    label: 'Codex',
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-5-codex',
    hint: '按 AnyRouter 文档预填，默认走 OpenAI Responses，更适合 Codex/代理式编程。',
    protocol: 'OpenAI Responses',
  },
  claude: {
    label: 'Claude',
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
    hint: '按 AnyRouter 文档预填，默认走 Anthropic Messages。遇到网络问题可切备用网关。',
    protocol: 'Anthropic Messages',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
  },
  claude_code: {
    label: 'Claude Code',
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
    hint: '按 AnyRouter 的 Claude Code 使用方式预填，Base URL 不带 /v1。',
    protocol: 'Anthropic Messages',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
  },
  anthropic_compatible: {
    label: 'Anthropic兼容',
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
    hint: '适合任意 Anthropic Messages 风格网关，AnyRouter 可直接使用。',
    protocol: 'Anthropic Messages',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    hint: '支持 API Key，也支持 Google OAuth 授权登录。',
    protocol: 'Gemini GenerateContent',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: 'DeepSeek 官方 API，默认 `deepseek-chat`。',
    protocol: 'OpenAI Chat Completions',
  },
  openai_compatible: {
    label: 'OpenAI兼容',
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-4o-mini',
    hint: '默认按 AnyRouter 预填，也兼容其他 OpenAI 风格网关。',
    protocol: 'OpenAI Chat Completions',
  },
};

function getDefaultForm() {
  return {
    provider: 'chatgpt' as AiProvider,
    auth_mode: 'api_key' as AiAccount['auth_mode'],
    name: '',
    api_key: '',
    base_url: PROVIDER_PRESETS.chatgpt.baseUrl,
    model: PROVIDER_PRESETS.chatgpt.model,
    priority_rank: 1,
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_refresh_token: '',
    oauth_email: '',
    oauth_project_id: '',
    system_prompt: '',
    remark: '',
  };
}

interface Props {
  open: boolean;
  account: AiAccount | null;
  onClose: () => void;
  onSave: (data: Partial<AiAccount>) => Promise<void>;
}

export default function AiAccountDialog({ open, account, onClose, onSave }: Props) {
  const [form, setForm] = useState(getDefaultForm);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [serverGoogleOAuthEnabled, setServerGoogleOAuthEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        provider: account.provider,
        auth_mode: account.auth_mode || 'api_key',
        name: account.name,
        api_key: account.api_key,
        base_url: account.base_url,
        model: account.model,
        priority_rank: account.priority_rank || 1,
        oauth_client_id: account.oauth_client_id || '',
        oauth_client_secret: account.oauth_client_secret || '',
        oauth_refresh_token: account.oauth_refresh_token || '',
        oauth_email: account.oauth_email || '',
        oauth_project_id: account.oauth_project_id || '',
        system_prompt: account.system_prompt,
        remark: account.remark,
      });
    } else {
      setForm(getDefaultForm());
    }
    setShowKey(false);
  }, [open, account]);

  useEffect(() => {
    if (!open) return;
    authApi.check()
      .then((result) => setServerGoogleOAuthEnabled(!!result.googleOAuthEnabled))
      .catch(() => setServerGoogleOAuthEnabled(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'google-oauth-success') {
        setForm((current) => ({
          ...current,
          auth_mode: 'google_oauth',
          oauth_refresh_token: payload.refresh_token || current.oauth_refresh_token,
          oauth_email: payload.email || current.oauth_email,
          name: current.name || payload.email || current.name,
        }));
        setOauthLoading(false);
        toast.success(`Google 授权完成${payload.email ? `：${payload.email}` : ''}`);
      }

      if (payload.type === 'google-oauth-error') {
        setOauthLoading(false);
        toast.error(payload.error || 'Google OAuth 失败');
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  const preset = PROVIDER_PRESETS[form.provider];
  const isGemini = form.provider === 'gemini';
  const supportsGoogleOAuth = isGemini;
  const isGoogleOAuth = isGemini && form.auth_mode === 'google_oauth';
  const needsManualGoogleClient = isGoogleOAuth && !serverGoogleOAuthEnabled;
  const canSave = form.name.trim() && form.model.trim() && (
    isGoogleOAuth
      ? (!needsManualGoogleClient || (form.oauth_client_id.trim() && form.oauth_client_secret.trim())) && form.oauth_refresh_token.trim() && form.oauth_project_id.trim()
      : form.api_key.trim()
  );

  const authSummary = useMemo(() => {
    if (!supportsGoogleOAuth) return '当前供应商使用 API Key / Session 风格接入。';
    if (isGoogleOAuth) {
      return form.oauth_email
        ? `当前已绑定 Google OAuth 账号：${form.oauth_email}`
        : serverGoogleOAuthEnabled
          ? '当前使用 Google OAuth 模式，服务端已托管 Google 应用配置。'
          : '当前使用 Google OAuth 模式，等待授权回调或填写 refresh token。';
    }
    return '当前使用 API Key 模式。Gemini 也支持切到 Google OAuth。';
  }, [form.oauth_email, isGoogleOAuth, serverGoogleOAuthEnabled, supportsGoogleOAuth]);

  if (!open) return null;

  const handleProviderChange = (provider: AiProvider) => {
    const next = PROVIDER_PRESETS[provider];
    setForm((current) => ({
      ...current,
      provider,
      auth_mode: provider === 'gemini' ? current.auth_mode : 'api_key',
      base_url: next.baseUrl,
      model: next.model,
      name: account ? current.name : current.name || next.label,
      api_key: provider === 'gemini' ? current.api_key : current.api_key,
    }));
  };

  const launchGoogleOAuth = async () => {
    if (!serverGoogleOAuthEnabled && (!form.oauth_client_id.trim() || !form.oauth_client_secret.trim())) {
      toast.error('先填写 Google OAuth Client ID 和 Client Secret');
      return;
    }

    setOauthLoading(true);
    try {
      const result = await oauthApi.googleAuthorize({
        client_id: form.oauth_client_id.trim() || undefined,
        client_secret: form.oauth_client_secret.trim() || undefined,
        login_hint: form.oauth_email.trim() || undefined,
        scope: GEMINI_OAUTH_SCOPE,
        prompt: 'consent',
      });

      const popup = window.open(result.url, 'gemini-google-oauth', 'width=640,height=760');
      if (!popup) {
        setOauthLoading(false);
        toast.error('浏览器拦截了授权窗口，请允许弹窗后重试');
        return;
      }
    } catch (error: any) {
      setOauthLoading(false);
      toast.error(error.message || '发起 Google OAuth 失败');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 animate-[fadeIn_0.2s_ease-out]" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-[28px] border border-zinc-200/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 animate-[slideUp_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-600 dark:text-cyan-400">AI Account</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{account ? '编辑 AI 账号' : '新增 AI 账号'}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">把不同供应商账号接入到 muse-Mail，用同一个工作台切换对话，也把首选备选次序管起来。</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
            关闭
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">供应商</label>
            <select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {Object.entries(PROVIDER_PRESETS).map(([key, item]) => (
                <option key={key} value={key}>{item.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">账号名称</label>
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="例如：主力 Codex / 备选 Gemini"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">优先级</label>
            <select
              value={form.priority_rank}
              onChange={(e) => setForm((current) => ({ ...current, priority_rank: Number(e.target.value) }))}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value={1}>1 - 首选</option>
              <option value={2}>2 - 备选</option>
              <option value={3}>3 - 次选</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-cyan-200/70 bg-cyan-50/80 p-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/20 dark:text-cyan-100">
          <div className="font-medium">{preset.label} 预设</div>
          <div className="mt-1 text-cyan-800/80 dark:text-cyan-100/80">{preset.hint}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-2xl border border-cyan-200/70 bg-white/70 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
              协议：{preset.protocol}
            </div>
            <div className="rounded-2xl border border-cyan-200/70 bg-white/70 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
              默认地址：{preset.baseUrl}
            </div>
            {preset.fallback && (
              <div className="rounded-2xl border border-cyan-200/70 bg-white/70 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100 md:col-span-2">
                AnyRouter 备用地址：{preset.fallback}
              </div>
            )}
          </div>
        </div>

        {supportsGoogleOAuth && (
          <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">认证方式</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{authSummary}</div>
              </div>
              <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950">
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, auth_mode: 'api_key' }))}
                  className={`rounded-xl px-3 py-2 text-sm ${!isGoogleOAuth ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950' : 'text-zinc-600 dark:text-zinc-300'}`}
                >
                  API Key
                </button>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, auth_mode: 'google_oauth' }))}
                  className={`rounded-xl px-3 py-2 text-sm ${isGoogleOAuth ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950' : 'text-zinc-600 dark:text-zinc-300'}`}
                >
                  Google OAuth
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {!isGoogleOAuth && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(e) => setForm((current) => ({ ...current, api_key: e.target.value }))}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
          )}

          {isGoogleOAuth && (
            <div className="space-y-4 rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              {needsManualGoogleClient ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Google Client ID</label>
                    <input
                      value={form.oauth_client_id}
                      onChange={(e) => setForm((current) => ({ ...current, oauth_client_id: e.target.value }))}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                      placeholder="Google OAuth Desktop Client ID"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Google Client Secret</label>
                    <input
                      value={form.oauth_client_secret}
                      onChange={(e) => setForm((current) => ({ ...current, oauth_client_secret: e.target.value }))}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                      placeholder="Google OAuth Desktop Client Secret"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-zinc-950 dark:text-emerald-300">
                  服务端已配置 Google OAuth 应用，直接点下方按钮授权即可，不需要再手填 Client ID / Secret。
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Google Cloud Project ID</label>
                  <input
                    value={form.oauth_project_id}
                    onChange={(e) => setForm((current) => ({ ...current, oauth_project_id: e.target.value }))}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                    placeholder="用于 x-goog-user-project"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">授权邮箱</label>
                  <input
                    value={form.oauth_email}
                    onChange={(e) => setForm((current) => ({ ...current, oauth_email: e.target.value }))}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                    placeholder="可选，用于 login_hint"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Google Refresh Token</label>
                <textarea
                  value={form.oauth_refresh_token}
                  onChange={(e) => setForm((current) => ({ ...current, oauth_refresh_token: e.target.value }))}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900"
                  placeholder="点击下方按钮拉起 Google OAuth，回调后会自动填入。也可以手工粘贴 refresh_token。"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  授权 scope：`cloud-platform` + `generative-language.retriever`
                </div>
                <button
                  type="button"
                  onClick={launchGoogleOAuth}
                  disabled={oauthLoading}
                  className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {oauthLoading ? '等待授权回调...' : '发起 Google OAuth 授权'}
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Base URL</label>
              <input
                value={form.base_url}
                onChange={(e) => setForm((current) => ({ ...current, base_url: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder={preset.baseUrl}
              />
              {preset.fallback && (
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  如主地址链路不稳，可改成：{preset.fallback}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">模型</label>
              <input
                value={form.model}
                onChange={(e) => setForm((current) => ({ ...current, model: e.target.value }))}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder={preset.model}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">系统提示词</label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => setForm((current) => ({ ...current, system_prompt: e.target.value }))}
              rows={4}
              className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="例如：你是我的代码助手，回答时尽量给出可执行方案。"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">备注</label>
            <input
              value={form.remark}
              onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="可记录使用场景、配额或团队归属"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-2xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
          >
            {saving ? '保存中...' : account ? '保存修改' : '添加账号'}
          </button>
        </div>
      </div>
    </div>
  );
}
