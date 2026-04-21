import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Inbox, AlertTriangle, RefreshCw, Globe, Activity, Tags, ShieldCheck, Database } from 'lucide-react';
import { dashboardApi } from '../lib/api';
import type { DashboardStats } from '../types';
import { StatCard } from '../components/dashboard/StatCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { RecentMails } from '../components/dashboard/RecentMails';
import { readCacheState, writeCache } from '../lib/localCache';

const DASHBOARD_CACHE_KEY = 'muse.dashboard.stats';
const DASHBOARD_CACHE_MAX_AGE_MS = 60 * 1000;

export default function Dashboard() {
  const cacheState = readCacheState<DashboardStats>(DASHBOARD_CACHE_KEY, DASHBOARD_CACHE_MAX_AGE_MS);
  const cachedStats = cacheState.value;
  const hasCachedStats = cachedStats !== null;
  const [stats, setStats] = useState<DashboardStats | null>(cachedStats);
  const [loading, setLoading] = useState(!cachedStats);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (!hasCachedStats) setLoading(true);
      setError(null);
      const data = await dashboardApi.stats();
      setStats(data);
      writeCache(DASHBOARD_CACHE_KEY, data);
    } catch (err: any) {
      setError(err.message || '加载仪表盘数据失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasCachedStats]);

  useEffect(() => {
    if (cacheState.isStale || !cachedStats) {
      fetchStats();
    }
  }, [fetchStats]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 rounded bg-secondary animate-pulse" />
          <div className="h-9 w-20 rounded bg-secondary animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5 h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card h-80 animate-pulse" />
          <div className="glass-card h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
          <p className="text-lg font-medium text-foreground mb-1">加载失败</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => fetchStats()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      icon: Users,
      label: '邮箱总数',
      value: stats.totalAccounts,
      sub: `${stats.activeAccounts} 个活跃`,
      color: '#3B82F6',
    },
    {
      icon: Inbox,
      label: '收件箱邮件',
      value: stats.totalInboxMails,
      color: '#22C55E',
    },
    {
      icon: AlertTriangle,
      label: '垃圾箱邮件',
      value: stats.totalJunkMails,
      color: '#F59E0B',
    },
    {
      icon: Globe,
      label: '代理在线数',
      value: stats.activeProxies,
      sub: `共 ${stats.totalProxies} 个代理`,
      color: '#8B5CF6',
    },
  ];

  const renderDistributionPanel = (
    title: string,
    items: any[],
    nameKey: 'provider' | 'status',
    Icon: typeof Tags,
    total: number,
  ) => (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          items.map((item: any) => (
            <div key={`${title}-${item[nameKey]}`} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{item[nameKey] || 'unknown'}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-secondary">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (item.count / Math.max(1, total)) * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">muse-Mail 仪表盘</h1>
          <p className="text-sm text-muted-foreground mt-0.5">统一查看邮箱、代理、集成入口与本地缓存健康度</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </motion.div>

      {/* Stat Cards - 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <StatCard key={card.label} {...card} delay={i * 0.08} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Database} label="缓存总邮件" value={stats.totalInboxMails + stats.totalJunkMails} sub={`Inbox ${stats.totalInboxMails} / Junk ${stats.totalJunkMails}`} color="#06B6D4" delay={0.32} />
        <StatCard icon={AlertTriangle} label="异常账户" value={stats.errorAccounts} sub="需要检查授权或网络" color="#EF4444" delay={0.4} />
        <StatCard icon={RefreshCw} label="Token待刷新" value={stats.expiringTokens} sub="超过 60 天未刷新" color="#F97316" delay={0.48} />
        <StatCard icon={Users} label="未使用邮箱" value={stats.unusedAccounts} sub="尚无 token 刷新记录" color="#8B5CF6" delay={0.56} />
      </div>

      {/* Bottom Panels: Quick Actions + Recent Mails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickActions stats={stats} />
        <RecentMails mails={stats.recentMails} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {renderDistributionPanel('邮箱 Provider 分布', stats.providerStats, 'provider', Tags, stats.totalAccounts)}
        {renderDistributionPanel('邮箱状态分布', stats.statusStats, 'status', ShieldCheck, stats.totalAccounts)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {renderDistributionPanel('代理状态分布', stats.proxyStatusStats, 'status', Activity, stats.totalProxies)}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">邮件量 Top 账户</h2>
            <p className="text-sm text-muted-foreground">按 Inbox + Junk 缓存数量排序，快速定位重度账户。</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {stats.topMailAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无缓存邮件</div>
            ) : (
              stats.topMailAccounts.map((item) => (
                <div key={item.account_id} className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{item.email}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Inbox {item.inbox_count} · Junk {item.junk_count}</div>
                    </div>
                    <div className="text-xl font-semibold text-foreground">{item.total_count}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
