import { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';

interface Props {
  open: boolean;
  googleOAuthEnabled?: boolean;
  onSuccess: () => void;
}

export function LoginDialog({ open, googleOAuthEnabled = false, onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const allowedOrigins = new Set([
        window.location.origin,
        `${window.location.protocol}//${window.location.hostname}:3000`,
      ]);
      if (!allowedOrigins.has(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'admin-google-auth-success') {
        localStorage.setItem('auth_token', data.token);
        setOauthLoading(false);
        setError('');
        onSuccess();
      }

      if (data.type === 'admin-google-auth-error') {
        setOauthLoading(false);
        setError(data.error || 'Google 登录失败');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSuccess]);

  if (!open) return null;

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(password);
      if (res.token) {
        localStorage.setItem('auth_token', res.token);
      }
      onSuccess();
    } catch {
      setError('密码错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setOauthLoading(true);
    setError('');
    try {
      const res = await authApi.googleAuthorize();
      const popup = window.open(res.url, 'muse-admin-google-login', 'width=560,height=720');
      if (!popup) {
        setOauthLoading(false);
        setError('浏览器拦截了登录弹窗，请允许弹窗后重试');
      }
    } catch (err: any) {
      setOauthLoading(false);
      setError(err.message || 'Google 登录初始化失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-[slideUp_0.2s_ease-out]">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">访问验证</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">可用密码登录，或使用 OAuth 登录后台</p>
        </div>
        <div className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400"
              placeholder="请输入访问密码"
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>
          <button
            onClick={handleLogin}
            disabled={loading || !password.trim()}
            className="w-full py-2.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? '验证中...' : '密码登录'}
          </button>
          {googleOAuthEnabled && (
            <button
              onClick={handleGoogleLogin}
              disabled={oauthLoading}
              className="w-full py-2.5 text-sm rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {oauthLoading ? 'OAuth 登录中...' : 'Google OAuth 登录'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
