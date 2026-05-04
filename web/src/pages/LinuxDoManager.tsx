import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BadgeCheck, ExternalLink, RefreshCw, Shield, Unplug, UserRound, Zap } from 'lucide-react';
import { StatBlock as StatCard } from '../components/ui/patterns';
import { integrationApi, oauthApi } from '../lib/api';
import { isIntegrationCacheFresh, readIntegrationCache, shouldShowInitialLoading, writeIntegrationCache } from '../lib/integrationCache';
import type { LinuxDoIntegrationData } from '../types';

const LINUXDO_CACHE_KEY = 'muse.integration.linuxdo';
const cachedLinuxDo = readIntegrationCache<LinuxDoIntegrationData>(LINUXDO_CACHE_KEY);

const emptyState: LinuxDoIntegrationData = {
  connected: false,
  clientConfigured: false,
  tokenMasked: '',
  lastSyncAt: null,
  expiresAt: null,
  scopes: [],
  user: null,
};

function normalizeLinuxDoData(value?: Partial<LinuxDoIntegrationData> | null): LinuxDoIntegrationData {
  return {
    ...emptyState,
    ...(value || {}),
    scopes: Array.isArray(value?.scopes) ? value.scopes : [],
    user: value?.user || null,
  };
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '暂无';
}

export default function LinuxDoManager() {
  const [data, setData] = useState<LinuxDoIntegrationData>(normalizeLinuxDoData(cachedLinuxDo.value));
  const [loading, setLoading] = useState(shouldShowInitialLoading(cachedLinuxDo.value));
  const [submitting, setSubmitting] = useState(false);

  const load = async (force = false) => {
    try {
      if (!force) setLoading(shouldShowInitialLoading(cachedLinuxDo.value));
      const result = force ? await integrationApi.syncLinuxDo() : await integrationApi.getLinuxDo();
      const normalized = normalizeLinuxDoData(result);
      writeIntegrationCache(LINUXDO_CACHE_KEY, normalized);
      setData(normalized);
    } catch (err: any) {
      toast.error(err.message || '加载 Linux.do 信息失败');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (isIntegrationCacheFresh<LinuxDoIntegrationData>(LINUXDO_CACHE_KEY)) return;
    load();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'linuxdo-oauth-success') {
        toast.success(`Linux.do 授权完成：@${payload.username || 'user'}`);
        setSubmitting(false);
        void load(true);
      }

      if (payload.type === 'linuxdo-oauth-error') {
        toast.error(payload.error || 'Linux.do OAuth 失败');
        setSubmitting(false);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connect = async () => {
    try {
      setSubmitting(true);
      const result = await oauthApi.linuxDoAuthorize();
      const popup = window.open(result.url, 'linuxdo-oauth', 'width=680,height=800');
      if (!popup) {
        setSubmitting(false);
        toast.error('浏览器拦截了授权弹窗');
      }
    } catch (err: any) {
      setSubmitting(false);
      toast.error(err.message || '拉起 Linux.do 授权失败');
    }
  };

  const disconnect = async () => {
    try {
      setSubmitting(true);
      await integrationApi.disconnectLinuxDo();
      writeIntegrationCache(LINUXDO_CACHE_KEY, emptyState);
      setData(emptyState);
      toast.success('Linux.do 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 Linux.do 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const trustLabel = useMemo(() => {
    const level = data.user?.trust_level;
    if (typeof level !== 'number') return '未获取';
    return `TL${level}`;
  }, [data.user?.trust_level]);

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(132,204,22,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_32%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-500/20 bg-lime-500/10 px-3 py-1 text-xs font-medium text-lime-700 dark:text-lime-300">
                <Shield className="h-3.5 w-3.5" />
                Linux.do Connect
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Linux.do 登录接入</h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                这不是把 GitHub token 塞进 `.env` 的旁门左道，而是走 Linux.do Connect 官方 OAuth2。
                授权成功后，会把 access token、refresh token、过期时间和用户信息一起落库，后续报纸和别的模块都能复用。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={connect}
                disabled={submitting || !data.clientConfigured}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {data.connected ? '重新授权' : '连接 Linux.do'}
              </button>
              <button
                onClick={() => {
                  setSubmitting(true);
                  void load(true);
                }}
                disabled={submitting || !data.connected}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                同步
              </button>
              <button
                onClick={disconnect}
                disabled={submitting || !data.connected}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                断开
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {!data.clientConfigured && (
        <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-800 dark:text-amber-200">
          当前还没配置 `LINUX_DO_CLIENT_ID` 和 `LINUX_DO_CLIENT_SECRET`。先去 Linux.do Connect 申请应用，把回调地址填成你现在的
          ` /api/oauth/linuxdo/callback `，再把 Client ID / Secret 写进 [C:\Users\1\Desktop\muse\Muse\.env](C:\Users\1\Desktop\muse\Muse\.env)。
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="glass-card h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            <StatCard variant="panel" label="状态" value={data.connected ? '已连接' : '未连接'} note={data.connected ? 'OAuth 会话已落库' : '等待授权'} />
            <StatCard variant="panel" label="信任等级" value={trustLabel} note="Linux.do trust level" />
            <StatCard variant="panel" label="用户名" value={data.user ? `@${data.user.username}` : '暂无'} note={data.user?.name || '授权后自动读取'} />
            <StatCard variant="panel" label="Scope" value={data.scopes.length || 0} note={data.scopes.join(', ') || '未返回'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">当前授权身份</h2>
              </div>
              {!data.user ? (
                <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                  还没有 Linux.do 会话。点上面的按钮拉起官方授权。
                </div>
              ) : (
                <div className="mt-4 rounded-[24px] border border-border bg-background/45 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    {data.user.avatar_url ? (
                      <img src={data.user.avatar_url} alt={data.user.username} className="h-16 w-16 rounded-2xl border border-border object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border text-lg font-semibold text-muted-foreground">
                        {data.user.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="text-xl font-semibold text-foreground">{data.user.name || data.user.username}</div>
                      <div className="text-sm text-muted-foreground">@{data.user.username}</div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">TL{data.user.trust_level}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${data.user.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'}`}>
                          {data.user.active ? 'active' : 'inactive'}
                        </span>
                        {data.user.silenced ? <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 dark:text-rose-300">silenced</span> : null}
                      </div>
                    </div>
                  </div>
                  {data.user.email && <div className="mt-4 text-sm text-muted-foreground">{data.user.email}</div>}
                </div>
              )}
            </div>

            <div className="glass-card p-5">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">会话状态</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-border bg-background/45 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Token</div>
                  <div className="mt-2 font-mono text-foreground">{data.tokenMasked || '未授权'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background/45 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last Sync</div>
                  <div className="mt-2 text-foreground">{formatDate(data.lastSyncAt)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background/45 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Expires At</div>
                  <div className="mt-2 text-foreground">{formatDate(data.expiresAt)}</div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={() => window.open('https://connect.linux.do', '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary">
                    打开 Connect
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => window.open('https://linux.do', '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary">
                    打开论坛
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
