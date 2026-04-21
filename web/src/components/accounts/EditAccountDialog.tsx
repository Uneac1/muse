import { useState, useEffect } from 'react';
import type { Account, Tag, AccountProvider } from '../../types';
import { oauthApi } from '../../lib/api';

const DEFAULT_GMAIL_CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID || '';
const DEFAULT_GMAIL_CLIENT_SECRET = import.meta.env.VITE_GMAIL_CLIENT_SECRET || '';

function getDefaultForm() {
  return {
    provider: 'microsoft' as AccountProvider,
    mode: 'long_term' as 'temporary' | 'long_term',
    email: '',
    password: '',
    client_id: '',
    client_secret: '',
    refresh_token: '',
    custom_imap_host: '',
    custom_imap_port: 993,
    custom_smtp_host: '',
    custom_smtp_port: 465,
    custom_smtp_secure: 1,
    custom_domain: '',
    remark: '',
  };
}

interface Props {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSave: (data: Partial<Account>) => Promise<void>;
  tags?: Tag[];
  accountTagIds?: number[];
  onTagToggle?: (tagId: number) => void;
  onCreateTag?: (name: string, color?: string) => Promise<void>;
  onDeleteTag?: (tagId: number) => void;
}

export default function EditAccountDialog({ open, account, onClose, onSave, tags = [], accountTagIds = [], onTagToggle, onCreateTag, onDeleteTag }: Props) {
  const [form, setForm] = useState(getDefaultForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);
  const isQq = form.provider === 'qq';
  const isGmail = form.provider === 'gmail';
  const isCustom = form.provider === 'custom';
  const gmailAuthorized = Boolean(form.refresh_token);

  useEffect(() => {
    if (account) {
      setForm({
        provider: account.provider || 'microsoft',
        mode: account.mode || 'long_term',
        email: account.email,
        password: account.password,
        client_id: account.client_id,
        client_secret: account.client_secret || '',
        refresh_token: account.refresh_token,
        custom_imap_host: account.custom_imap_host || '',
        custom_imap_port: account.custom_imap_port || 993,
        custom_smtp_host: account.custom_smtp_host || '',
        custom_smtp_port: account.custom_smtp_port || 465,
        custom_smtp_secure: account.custom_smtp_secure ?? 1,
        custom_domain: account.custom_domain || '',
        remark: account.remark || '',
      });
    } else {
      setForm(getDefaultForm());
    }
    setShowPassword(false);
    setShowClientSecret(false);
  }, [account, open]);

  const handleProviderChange = (provider: AccountProvider) => {
    setForm(prev => {
      if (provider !== 'gmail') {
        return { ...prev, provider };
      }

      return {
        ...prev,
        provider,
        client_id: prev.client_id || DEFAULT_GMAIL_CLIENT_ID,
        client_secret: prev.client_secret || DEFAULT_GMAIL_CLIENT_SECRET,
      };
    });
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const allowedOrigins = new Set([
        window.location.origin,
        `${window.location.protocol}//${window.location.hostname}:3000`,
      ]);
      if (!allowedOrigins.has(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'google-oauth-success') {
        setForm(prev => ({
          ...prev,
          provider: 'gmail',
          email: data.email || prev.email,
          refresh_token: data.refresh_token || prev.refresh_token,
        }));
        setOauthLoading(false);
        alert('Gmail OAuth 授权成功，刷新令牌已自动回填。');
      }

      if (data.type === 'google-oauth-error') {
        setOauthLoading(false);
        alert(`Gmail OAuth 失败: ${data.error || '未知错误'}`);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleOAuth = async () => {
    if (!form.client_id || !form.client_secret) {
      alert('请先填写 Google 的 Client ID 和 Client Secret。');
      return;
    }

    setOauthLoading(true);
    try {
      const result = await oauthApi.googleAuthorize({
        client_id: form.client_id,
        client_secret: form.client_secret,
        login_hint: form.email || undefined,
      });

      const popup = window.open(result.url, 'gmail-oauth', 'width=640,height=760');
      if (!popup) {
        setOauthLoading(false);
        alert('浏览器拦截了弹窗，请允许弹窗后重试。');
      }
    } catch (err: any) {
      setOauthLoading(false);
      alert(`创建 Google 授权链接失败: ${err.message || '未知错误'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_0.2s_ease-out]" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 animate-[slideUp_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          {account ? '编辑邮箱' : '新增邮箱'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">邮箱提供商</label>
            <select
              value={form.provider}
              onChange={e => handleProviderChange(e.target.value as AccountProvider)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="microsoft">Microsoft / Outlook</option>
              <option value="gmail">Google / Gmail</option>
              <option value="qq">QQ 邮箱</option>
              <option value="custom">自定义域名邮箱</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">邮箱模式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: 'long_term' }))}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  form.mode === 'long_term'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                长期邮箱
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: 'temporary' }))}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  form.mode === 'temporary'
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                临时邮箱
              </button>
            </div>
          </div>
          {isCustom && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">自定义域名</label>
              <input
                type="text"
                value={form.custom_domain}
                onChange={e => setForm(f => ({ ...f, custom_domain: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="mail.example.com / example.com"
              />
            </div>
          )}
          {!isGmail && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">邮箱地址</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@outlook.com / user@custommail.com"
              />
            </div>
          )}
          {!isGmail && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{isQq ? 'IMAP 授权码' : isCustom ? '邮箱密码 / 授权码' : '密码'}</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={isQq ? '填写 QQ 邮箱开启 IMAP 服务后生成的授权码' : isCustom ? '填写域名邮箱的 IMAP/SMTP 密码或授权码' : '密码'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {isQq && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  QQ 邮箱请填写 IMAP/SMTP 服务授权码，不是登录密码。
                </p>
              )}
              {isCustom && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  自定义域名邮箱会直接使用你填写的 IMAP / SMTP 配置，不走微软或 Gmail OAuth。
                </p>
              )}
            </div>
          )}
          {!isQq && !isGmail && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">客户端 ID</label>
              <input
                type="text"
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={isGmail ? 'Google OAuth Client ID' : 'Azure App Client ID'}
              />
            </div>
          )}
          {isGmail && (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Gmail 授权接入</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  不需要手动填写邮箱、密码、Client ID、Secret 或 Refresh Token。点击下面按钮完成 Google 授权后会自动回填。
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white/80 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-zinc-900/40 dark:text-blue-300">
                <span>{gmailAuthorized ? `已授权: ${form.email || 'Gmail 账号'}` : '尚未完成 Gmail 授权'}</span>
                <button
                  type="button"
                  onClick={handleGoogleOAuth}
                  disabled={oauthLoading}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {oauthLoading ? '授权中...' : gmailAuthorized ? '重新授权' : '连接 Gmail'}
                </button>
              </div>
            </div>
          )}
          {isGmail && false && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">客户端 Secret</label>
              <div className="relative">
                <input
                  type={showClientSecret ? 'text' : 'password'}
                  value={form.client_secret}
                  onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Google OAuth Client Secret"
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  aria-label={showClientSecret ? '隐藏客户端 Secret' : '显示客户端 Secret'}
                >
                  {showClientSecret ? '藏' : '显'}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Gmail 刷新 access token 时需要同时使用 client secret。</p>
            </div>
          )}
          {!isQq && !isGmail && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">刷新令牌</label>
              <textarea
                value={form.refresh_token}
                onChange={e => setForm(f => ({ ...f, refresh_token: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder={isGmail ? 'Google Refresh Token' : 'Refresh Token'}
              />
            </div>
          )}
          {isQq && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
              QQ 邮箱使用 IMAP 直连，不需要填写 Client ID、Client Secret 或 Refresh Token。
            </div>
          )}
          {isCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">IMAP Host</label>
                <input
                  type="text"
                  value={form.custom_imap_host}
                  onChange={e => setForm(f => ({ ...f, custom_imap_host: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="imap.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">IMAP Port</label>
                <input
                  type="number"
                  value={form.custom_imap_port}
                  onChange={e => setForm(f => ({ ...f, custom_imap_port: Number(e.target.value) || 993 }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={form.custom_smtp_port}
                  onChange={e => setForm(f => ({ ...f, custom_smtp_port: Number(e.target.value) || 465 }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={form.custom_smtp_host}
                  onChange={e => setForm(f => ({ ...f, custom_smtp_host: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(form.custom_smtp_secure)}
                    onChange={e => setForm(f => ({ ...f, custom_smtp_secure: e.target.checked ? 1 : 0 }))}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                  />
                  SMTP 使用 SSL / TLS
                </label>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">备注</label>
            <input
              type="text"
              value={form.remark}
              onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="可选备注信息"
            />
          </div>
          {/* 标签管理 */}
          {account && tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">标签</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const isSelected = accountTagIds.includes(tag.id);
                  return (
                    <div key={tag.id} className="group/tag relative inline-flex">
                      <button
                        type="button"
                        onClick={() => onTagToggle?.(tag.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'border-transparent'
                            : 'hover:border-zinc-400 dark:hover:border-zinc-500'
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color }
                            : { color: tag.color, borderColor: tag.color, backgroundColor: tag.color + '18' }
                        }
                      >
                        {tag.name}
                        {isSelected && <span className="ml-0.5">✓</span>}
                      </button>
                      {onDeleteTag && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确定要删除标签"${tag.name}"吗？`)) {
                              onDeleteTag(tag.id);
                            }
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white opacity-0 group-hover/tag:opacity-100 hover:bg-red-600 transition-opacity flex items-center justify-center text-xs"
                          title="删除标签"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* 新建标签 */}
          {account && onCreateTag && (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTagName.trim()) {
                      e.preventDefault();
                      onCreateTag(newTagName.trim());
                      setNewTagName('');
                    }
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="新建标签，回车确认"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTagName.trim()) {
                      onCreateTag(newTagName.trim());
                      setNewTagName('');
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                >
                  添加
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving || (
                isGmail
                  ? !form.email || !form.refresh_token
                  : isCustom
                    ? !form.email || !form.password || !form.custom_imap_host
                    : !form.email || (isQq ? !form.password : !form.client_id || !form.refresh_token)
              )
            }
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
