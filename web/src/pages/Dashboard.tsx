import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Inbox, AlertTriangle, RefreshCw, Globe, Activity, Tags, ShieldCheck, Database } from 'lucide-react';
import { dashboardApi } from '../lib/api';
import type { DashboardStats } from '../types';
import { StatCard } from '../components/dashboard/StatCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { RecentMails } from '../components/dashboard/RecentMails';
import { readCacheState, writeCache } from '../lib/localCache';
import {
  CommandHero,
  EmptyState,
  ErrorState,
  FilterChips,
  InlineProgress,
  SegmentedControl,
  StatusTimeline,
} from '../components/layout/ControlCenter';

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
  const [focus, setFocus] = useState('all');
  const [density, setDensity] = useState('comfortable');

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="md3-skeleton h-28 flex-1 rounded-[14px]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="md3-skeleton h-36 rounded-[14px]" />
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
      <div className="space-y-6">
        <ErrorState
          title="Dashboard 加载失败"
          description={error}
          action={
          <button
            onClick={() => fetchStats()}
            className="md3-state-layer inline-flex items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
          }
        />
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
      <div className="muse-section-heading gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h2>
        </div>
        <span className="text-xs text-muted-foreground">{items.length} groups</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState title="暂无数据" description="同步后这里会显示分布和占比。" />
        ) : (
          items.map((item: any) => (
            <div key={`${title}-${item[nameKey]}`} className="interactive-list-row p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate pr-2 font-medium text-foreground">{item[nameKey] || 'unknown'}</span>
                <span className="shrink-0 text-muted-foreground">{item.count}</span>
              </div>
              <InlineProgress value={item.count} max={Math.max(1, total)} className="mt-3" />
            </div>
          ))
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="dashboard-page mx-auto w-full max-w-[1560px] space-y-6">
      <CommandHero
        eyebrow="System Overview"
        title="muse-Mail 仪表盘"
        description="统一查看邮箱、代理、集成入口与本地缓存健康度。统计块、分布面板和最近邮件都使用同一套动态 surface。"
        actions={
          <>
            <button
              onClick={() => fetchStats(true)}
              disabled={refreshing}
              className="md3-state-layer inline-flex items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <SegmentedControl
              value={density}
              onChange={setDensity}
              items={[
                { key: 'compact', label: 'Compact' },
                { key: 'comfortable', label: 'Comfort' },
              ]}
            />
          </>
        }
        stats={
          <StatusTimeline
            items={[
              { label: 'Command Center online', meta: `${stats.activeAccounts} active mailboxes`, state: 'done' },
              { label: 'Proxy mesh', meta: `${stats.activeProxies}/${stats.totalProxies} online`, state: stats.activeProxies ? 'done' : 'warning' },
              { label: 'Cache warm', meta: `${stats.totalInboxMails + stats.totalJunkMails} cached mails`, state: 'active' },
            ]}
          />
        }
      />

      <FilterChips
        value={focus}
        onChange={setFocus}
        items={[
          { key: 'all', label: '全部', count: stats.totalAccounts },
          { key: 'mail', label: 'Mail', count: stats.totalInboxMails },
          { key: 'proxy', label: 'Proxy', count: stats.activeProxies },
          { key: 'risk', label: 'Risk', count: stats.errorAccounts + stats.expiringTokens },
        ]}
      />

      {/* Stat Cards - 4 columns */}
      <div className={`dashboard-stat-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${density === 'compact' ? 'gap-3' : 'gap-4'}`}>
        {statCards.map((card, i) => (
          <StatCard key={card.label} {...card} delay={i * 0.08} />
        ))}
      </div>

      <div className="dashboard-stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Database} label="缓存总邮件" value={stats.totalInboxMails + stats.totalJunkMails} sub={`Inbox ${stats.totalInboxMails} / Junk ${stats.totalJunkMails}`} color="#06B6D4" delay={0.32} />
        <StatCard icon={AlertTriangle} label="异常账户" value={stats.errorAccounts} sub="需要检查授权或网络" color="#EF4444" delay={0.4} />
        <StatCard icon={RefreshCw} label="Token待刷新" value={stats.expiringTokens} sub="超过 60 天未刷新" color="#F97316" delay={0.48} />
        <StatCard icon={Users} label="未使用邮箱" value={stats.unusedAccounts} sub="尚无 token 刷新记录" color="#8B5CF6" delay={0.56} />
      </div>

      {/* Bottom Panels: Quick Actions + Recent Mails */}
      <div className="dashboard-panel-grid grid grid-cols-1 gap-6 lg:grid-cols-2">
        <QuickActions stats={stats} />
        <RecentMails mails={stats.recentMails} />
      </div>

      <div className="dashboard-panel-grid grid grid-cols-1 gap-6 lg:grid-cols-2">
        {renderDistributionPanel('邮箱 Provider 分布', stats.providerStats, 'provider', Tags, stats.totalAccounts)}
        {renderDistributionPanel('邮箱状态分布', stats.statusStats, 'status', ShieldCheck, stats.totalAccounts)}
      </div>

      <div className="dashboard-panel-grid grid grid-cols-1 gap-6 lg:grid-cols-2">
        {renderDistributionPanel('代理状态分布', stats.proxyStatusStats, 'status', Activity, stats.totalProxies)}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="muse-section-heading gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">邮件量 Top 账户</h2>
              <p className="mt-1 text-sm text-muted-foreground">按 Inbox + Junk 缓存数量排序，快速定位重度账户。</p>
            </div>
            <span className="md3-chip shrink-0">{stats.topMailAccounts.length} accounts</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {stats.topMailAccounts.length === 0 ? (
              <EmptyState title="暂无缓存邮件" description="同步邮箱后会显示邮件量最高的账号。" />
            ) : (
              stats.topMailAccounts.map((item) => (
                <div key={item.account_id} className="interactive-list-row p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{item.email}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Inbox {item.inbox_count} · Junk {item.junk_count}</div>
                    </div>
                    <div className="shrink-0 text-xl font-semibold text-foreground">{item.total_count}</div>
                  </div>
                  <InlineProgress value={item.total_count} max={Math.max(1, stats.topMailAccounts[0]?.total_count || 1)} className="mt-3" />
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
