import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Layers3,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { integrationApi } from '../lib/api';
import { isIntegrationCacheFresh, readIntegrationCache, shouldShowInitialLoading, writeIntegrationCache } from '../lib/integrationCache';
import type { MiSubIntegrationData, MiSubProfile, MiSubSettings, MiSubSubscription, MiSubUserInfo } from '../types';
import { timeAgo } from '../lib/utils';

const DEFAULT_URL = 'https://misub.y130.icu/';
const DEFAULT_PASSWORD = 'y130';

const emptyState: MiSubIntegrationData = {
  connected: false,
  baseUrl: DEFAULT_URL,
  passwordMasked: '',
  lastSyncAt: null,
  misubs: [],
  profiles: [],
  settings: null,
};
const MISUB_CACHE_KEY = 'muse.integration.misub';
const cachedMiSub = readIntegrationCache<MiSubIntegrationData>(MISUB_CACHE_KEY);

function SectionCard({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function formatBytes(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : size < 10 ? 2 : 1)} ${units[index]}`;
}

function formatExpire(expire?: number | null) {
  if (!expire) return { label: '-', danger: false };
  const target = expire > 10_000_000_000 ? expire : expire * 1000;
  const diff = target - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: `已过期 ${Math.abs(days)} 天`, danger: true };
  if (days === 0) return { label: '今天到期', danger: true };
  if (days <= 3) return { label: `${days} 天内到期`, danger: true };
  return { label: `${days} 天后到期`, danger: false };
}

function formatUsage(userInfo?: MiSubUserInfo | null) {
  if (!userInfo) {
    return { total: '-', used: '-', remaining: '-', percent: 0, expireLabel: '-', danger: false };
  }
  const used = (userInfo.upload || 0) + (userInfo.download || 0);
  const total = userInfo.total || 0;
  const remaining = Math.max(total - used, 0);
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const expire = formatExpire(userInfo.expire);
  return {
    total: formatBytes(total),
    used: formatBytes(used),
    remaining: formatBytes(remaining),
    percent,
    expireLabel: expire.label,
    danger: expire.danger || percent >= 90,
  };
}

function generateId(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_URL;
  return (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/\/+$/, '');
}

export default function SubscriptionManager() {
  const [activePanel, setActivePanel] = useState<'subscriptions' | 'profiles' | 'settings'>('subscriptions');
  const [data, setData] = useState<MiSubIntegrationData>(cachedMiSub.value || emptyState);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [loading, setLoading] = useState(shouldShowInitialLoading(cachedMiSub.value));
  const [submitting, setSubmitting] = useState(false);
  const [subsSaving, setSubsSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [nodeRefreshingIds, setNodeRefreshingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedSubIds, setExpandedSubIds] = useState<string[]>([]);
  const [expandedProfileIds, setExpandedProfileIds] = useState<string[]>([]);
  const [subQuery, setSubQuery] = useState('');
  const [profileQuery, setProfileQuery] = useState('');
  const [draftMisubs, setDraftMisubs] = useState<MiSubSubscription[]>([]);
  const [draftProfiles, setDraftProfiles] = useState<MiSubProfile[]>([]);
  const [draftSettings, setDraftSettings] = useState<MiSubSettings | null>(null);
  const [baselineMisubs, setBaselineMisubs] = useState<MiSubSubscription[]>([]);
  const [baselineProfiles, setBaselineProfiles] = useState<MiSubProfile[]>([]);
  const [baselineSettings, setBaselineSettings] = useState<MiSubSettings | null>(null);

  const hydrate = (next: MiSubIntegrationData) => {
    writeIntegrationCache(MISUB_CACHE_KEY, next);
    setData(next);
    setBaseUrl(next.baseUrl || DEFAULT_URL);
    setDraftMisubs(next.misubs || []);
    setDraftProfiles(next.profiles || []);
    setDraftSettings(next.settings || null);
    setBaselineMisubs(next.misubs || []);
    setBaselineProfiles(next.profiles || []);
    setBaselineSettings(next.settings || null);
    setSelectedIds([]);
  };

  const load = async () => {
    try {
      setLoading(shouldShowInitialLoading(cachedMiSub.value));
      const result = await integrationApi.getMiSub();
      hydrate(result);
    } catch (err: any) {
      toast.error(err.message || '加载 MiSub 失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isIntegrationCacheFresh<MiSubIntegrationData>(MISUB_CACHE_KEY)) return;
    load();
  }, []);

  const dataDirty = useMemo(
    () => JSON.stringify(draftMisubs) !== JSON.stringify(baselineMisubs) || JSON.stringify(draftProfiles) !== JSON.stringify(baselineProfiles),
    [draftMisubs, draftProfiles, baselineMisubs, baselineProfiles]
  );

  const settingsDirty = useMemo(
    () => JSON.stringify(draftSettings) !== JSON.stringify(baselineSettings),
    [draftSettings, baselineSettings]
  );

  const normalizedBaseUrl = useMemo(() => normalizeBaseUrl(baseUrl), [baseUrl]);

  const filteredMisubs = useMemo(() => {
    const q = subQuery.trim().toLowerCase();
    if (!q) return draftMisubs;
    return draftMisubs.filter((item) =>
      [item.name, item.url, item.exclude || '', item.status || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [draftMisubs, subQuery]);

  const filteredProfiles = useMemo(() => {
    const q = profileQuery.trim().toLowerCase();
    if (!q) return draftProfiles;
    return draftProfiles.filter((profile) =>
      [profile.name, profile.customId || '', profile.subConverter || '', profile.subConfig || '', profile.subscriptions.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [draftProfiles, profileQuery]);

  const visibleSubs = filteredMisubs;
  const visibleProfiles = filteredProfiles;
  const query = subQuery;
  const setQuery = setSubQuery;

  const stats = useMemo(() => {
    const enabledCount = draftMisubs.filter((item) => item.enabled).length;
    const totalNodes = draftMisubs.reduce((sum, item) => sum + (item.nodeCount || 0), 0);
    const expiringSoon = draftMisubs.filter((item) => {
      const expire = item.userInfo?.expire;
      if (!expire) return false;
      const target = expire > 10_000_000_000 ? expire : expire * 1000;
      return target - Date.now() <= 3 * 24 * 60 * 60 * 1000;
    }).length;
    const totalTraffic = draftMisubs.reduce((sum, item) => sum + (item.userInfo?.total || 0), 0);
    const usedTraffic = draftMisubs.reduce((sum, item) => sum + ((item.userInfo?.upload || 0) + (item.userInfo?.download || 0)), 0);
    return {
      total: draftMisubs.length,
      enabledCount,
      totalNodes,
      expiringSoon,
      totalTraffic: formatBytes(totalTraffic),
      usedTraffic: formatBytes(usedTraffic),
    };
  }, [draftMisubs]);

  const generatedLinks = useMemo(() => {
    if (!draftSettings) return [];
    const root = normalizedBaseUrl.replace(/\/+$/, '');
    const primary = draftSettings.mytoken ? `${root}/${draftSettings.mytoken}` : '';
    return draftProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      link: draftSettings.profileToken ? `${root}/${draftSettings.profileToken}/${profile.customId || profile.id}` : '',
      primary,
    }));
  }, [draftProfiles, draftSettings, normalizedBaseUrl]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch (err: any) {
      toast.error(err.message || `复制${label}失败`);
    }
  };

  const connect = async () => {
    if (!baseUrl.trim()) return toast.error('请先输入 MiSub 地址');
    if (!password.trim()) return toast.error('请先输入 MiSub 密码');
    try {
      setSubmitting(true);
      const next = await integrationApi.connectMiSub({ baseUrl: normalizedBaseUrl, password: password.trim() });
      hydrate(next);
      toast.success('MiSub 已连接');
    } catch (err: any) {
      toast.error(err.message || '连接 MiSub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    try {
      setSubmitting(true);
      const next = await integrationApi.syncMiSub();
      hydrate(next);
      toast.success('MiSub 数据已同步');
    } catch (err: any) {
      toast.error(err.message || '同步 MiSub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('确定断开 MiSub 连接吗？')) return;
    try {
      setSubmitting(true);
      await integrationApi.disconnectMiSub();
      hydrate({ ...emptyState, baseUrl: normalizedBaseUrl });
      setPassword(DEFAULT_PASSWORD);
      toast.success('MiSub 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 MiSub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const saveData = async () => {
    try {
      setSubsSaving(true);
      const next = await integrationApi.saveMiSubData({ misubs: draftMisubs, profiles: draftProfiles });
      hydrate(next);
      toast.success('MiSub 订阅和分组已保存');
    } catch (err: any) {
      toast.error(err.message || '保存 MiSub 订阅数据失败');
    } finally {
      setSubsSaving(false);
    }
  };

  const saveSettings = async () => {
    if (!draftSettings) return;
    try {
      setSettingsSaving(true);
      const next = await integrationApi.saveMiSubSettings(draftSettings);
      hydrate(next);
      toast.success('MiSub 设置已保存');
    } catch (err: any) {
      toast.error(err.message || '保存 MiSub 设置失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateSubscription = (id: string, patch: Partial<MiSubSubscription>) => {
    setDraftMisubs((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateProfile = (id: string, patch: Partial<MiSubProfile>) => {
    setDraftProfiles((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const refreshNode = async (item: MiSubSubscription) => {
    try {
      setNodeRefreshingIds((prev) => [...prev, item.id]);
      const result = await integrationApi.updateMiSubNodeCount({ url: item.url });
      updateSubscription(item.id, { nodeCount: result.count, userInfo: result.userInfo || null });
      toast.success(`已刷新 ${item.name} 的节点信息`);
    } catch (err: any) {
      toast.error(err.message || `刷新 ${item.name} 节点失败`);
    } finally {
      setNodeRefreshingIds((prev) => prev.filter((id) => id !== item.id));
    }
  };

  const refreshSelectedNodes = async () => {
    if (selectedIds.length === 0) return toast.error('请先选择要刷新的订阅');
    try {
      setSubmitting(true);
      const results = await integrationApi.batchUpdateMiSubNodes(selectedIds);
      setDraftMisubs((prev) =>
        prev.map((item) => {
          const matched = results.find((result) => result.id === item.id);
          if (!matched || typeof matched.nodeCount !== 'number') return item;
          return { ...item, nodeCount: matched.nodeCount };
        })
      );
      await sync();
      toast.success(`已批量刷新 ${results.filter((item) => item.success).length} 条订阅`);
    } catch (err: any) {
      toast.error(err.message || '批量刷新节点失败');
    } finally {
      setSubmitting(false);
    }
  };

  const addSubscription = () => {
    setDraftMisubs((prev) => [
      { id: generateId('misub'), name: `新订阅 ${prev.length + 1}`, url: '', enabled: true, exclude: '', status: 'unchecked', nodeCount: 0, userInfo: null },
      ...prev,
    ]);
  };

  const addProfile = () => {
    setDraftProfiles((prev) => [
      ...prev,
      { id: generateId('profile'), name: `新分组 ${prev.length + 1}`, enabled: true, subscriptions: [], manualNodes: [], customId: '', subConverter: '', subConfig: '', expiresAt: '', prefixSettings: { enableManualNodes: null, enableSubscriptions: null, manualNodePrefix: '' } },
    ]);
  };

  const removeSubscription = (id: string) => {
    if (!confirm('确定删除这个 MiSub 订阅吗？')) return;
    setDraftMisubs((prev) => prev.filter((item) => item.id !== id));
    setDraftProfiles((prev) => prev.map((profile) => ({ ...profile, subscriptions: profile.subscriptions.filter((subId) => subId !== id) })));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const removeProfile = (id: string) => {
    if (!confirm('确定删除这个订阅分组吗？')) return;
    setDraftProfiles((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleExpandedSub = (id: string) => {
    setExpandedSubIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleExpandedProfile = (id: string) => {
    setExpandedProfileIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_left,rgba(59,130,246,0.10),transparent_28%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-600 dark:text-sky-300">
                <Globe className="h-3.5 w-3.5" />
                MiSub 原生控制台
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">muse-Mail 内部直接管理 MiSub</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                现在不是嵌网页，而是直接登录 MiSub 后台接口，把订阅源、分组、节点统计和系统设置拉进 muse-Mail。你可以在这里直接编辑并回写到 MiSub。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => copyText(password, '密码')} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                <Copy className="h-4 w-4" />
                复制密码
              </button>
              <button onClick={() => window.open(normalizedBaseUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <ExternalLink className="h-4 w-4" />
                打开 MiSub
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <SectionCard
        title="连接配置"
        sub={data.connected ? `当前已连接到 ${data.baseUrl}，上次同步 ${data.lastSyncAt ? timeAgo(data.lastSyncAt) : '-'}` : '填入 MiSub 地址和密码，连接后即可在 muse-Mail 内直接双向编辑。'}
        action={<div className="flex flex-wrap gap-2"><button onClick={connect} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"><KeyRound className="h-4 w-4" />{data.connected ? '重新登录校验' : '连接 MiSub'}</button><button onClick={sync} disabled={submitting || !data.connected} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"><RefreshCw className="h-4 w-4" />同步全部</button><button onClick={disconnect} disabled={submitting || !data.connected} className="inline-flex items-center gap-2 rounded-md border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-60"><Trash2 className="h-4 w-4" />断开</button></div>}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_0.75fr_0.65fr]">
          <label className="space-y-2"><span className="text-sm font-medium text-foreground">MiSub 地址</span><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={DEFAULT_URL} /></label>
          <label className="space-y-2"><span className="text-sm font-medium text-foreground">管理密码</span><div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-border bg-background/60 py-3 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={DEFAULT_PASSWORD} /></div></label>
          <div className="space-y-2 rounded-2xl border border-border bg-background/50 p-4 text-sm text-muted-foreground"><div>连接状态：<span className={data.connected ? 'font-semibold text-emerald-600' : 'font-semibold text-zinc-500'}>{data.connected ? '已连接' : '未连接'}</span></div><div>地址归一化：<span className="font-medium text-foreground">{normalizedBaseUrl}</span></div><div>服务端密码显示：<span className="font-medium text-foreground">{data.passwordMasked || '未保存'}</span></div></div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[{ icon: Globe, label: '订阅总数', value: stats.total, sub: `${stats.enabledCount} 条启用`, tone: 'from-sky-500/25 to-cyan-500/10' }, { icon: Waypoints, label: '节点总量', value: stats.totalNodes, sub: '按 live 节点统计', tone: 'from-violet-500/25 to-fuchsia-500/10' }, { icon: Layers3, label: '订阅分组', value: draftProfiles.length, sub: '可直接在此编排', tone: 'from-emerald-500/25 to-lime-500/10' }, { icon: ShieldCheck, label: '近期到期', value: stats.expiringSoon, sub: '3 天内到期订阅', tone: 'from-orange-500/25 to-amber-500/10' }, { icon: Link2, label: '总流量', value: stats.totalTraffic, sub: `已用 ${stats.usedTraffic}`, tone: 'from-indigo-500/25 to-blue-500/10' }].map((card, index) => (<motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }} className="glass-card p-5"><div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br p-3 ${card.tone}`}><card.icon className="h-5 w-5 text-foreground" /></div><div className="text-sm text-muted-foreground">{card.label}</div><div className="mt-1 text-2xl font-bold text-foreground">{card.value}</div><div className="mt-1 text-xs text-muted-foreground">{card.sub}</div></motion.div>))}
      </div>

      <div className="rounded-2xl border border-border bg-background p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { key: 'subscriptions' as const, label: '订阅源', sub: `${draftMisubs.length} 条`, dirty: dataDirty },
              { key: 'profiles' as const, label: '分组链接', sub: `${draftProfiles.length} 组`, dirty: dataDirty },
              { key: 'settings' as const, label: 'MiSub 设置', sub: settingsDirty ? '有改动' : '已同步', dirty: settingsDirty },
            ].map((panel) => (
              <button
                key={panel.key}
                onClick={() => setActivePanel(panel.key)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  activePanel === panel.key
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background/40 hover:bg-secondary/70'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{panel.label}</span>
                  {panel.dirty && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">未保存</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{panel.sub}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {activePanel === 'subscriptions' && (
              <>
                <button onClick={addSubscription} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"><Plus className="h-4 w-4" />新增订阅</button>
                <button onClick={refreshSelectedNodes} disabled={submitting || selectedIds.length === 0} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"><RefreshCw className="h-4 w-4" />批量刷新节点</button>
                <button onClick={saveData} disabled={subsSaving || !dataDirty} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"><Save className="h-4 w-4" />保存订阅 / 分组</button>
              </>
            )}
            {activePanel === 'profiles' && (
              <>
                <button onClick={addProfile} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"><Plus className="h-4 w-4" />新增分组</button>
                <button onClick={saveData} disabled={subsSaving || !dataDirty} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"><Save className="h-4 w-4" />保存订阅 / 分组</button>
              </>
            )}
            {activePanel === 'settings' && (
              <button onClick={saveSettings} disabled={settingsSaving || !draftSettings || !settingsDirty} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"><Settings2 className="h-4 w-4" />保存设置</button>
            )}
          </div>
        </div>
      </div>

      {activePanel === 'subscriptions' && <SectionCard title="订阅源总表" sub="这里改的是 MiSub 的真实订阅数据。输入修改先进入草稿区，点击“保存订阅 / 分组”后会整体回写到 MiSub；单条刷新和批量刷新会直接打到 MiSub。">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-md"><SearchBox value={subQuery} onChange={setSubQuery} placeholder="搜索订阅名称、URL、排除规则、状态..." /></div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded-full px-3 py-1 font-medium ${dataDirty ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`}>{dataDirty ? '有未保存改动' : '已与 MiSub 对齐'}</span>
              <span className="text-muted-foreground">已选择 <span className="font-semibold text-foreground">{selectedIds.length}</span> 条，当前共 <span className="font-semibold text-foreground">{filteredMisubs.length}</span> 条结果</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/35 p-3 text-xs leading-5 text-muted-foreground">
            这里不是假数据。你在本页编辑名称、URL、排除规则、启停状态后，点击“保存订阅 / 分组”就会把最新草稿回写到 MiSub。单条“刷新”和“批量刷新节点”属于即时操作，会直接请求 MiSub 实时更新节点统计。
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-background/35">
            {loading ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">加载中...</div> : filteredMisubs.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">没有匹配的订阅源</div> : <>
              <div className="border-b border-border bg-secondary/35 px-4 py-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visibleSubs.length > 0 && visibleSubs.every((item) => selectedIds.includes(item.id))}
                      onChange={(e) => setSelectedIds(e.target.checked ? visibleSubs.map((item) => item.id) : [])}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    全选当前结果
                  </label>
                  <span>双列紧凑视图</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 2xl:grid-cols-2">
                {filteredMisubs.map((item) => {
                  const usage = formatUsage(item.userInfo);
                  const refreshing = nodeRefreshingIds.includes(item.id);
                  const expanded = expandedSubIds.includes(item.id);
                  return (
                    <div key={item.id} className="rounded-2xl border border-border/80 bg-background/55 p-4">
                      <div className="hidden grid-cols-[36px_minmax(0,1fr)_88px_120px_120px_88px] gap-3 xl:grid xl:items-center">
                        <div className="flex items-start justify-center">
                          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${item.enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-300'}`}>{item.enabled ? '启用' : '停用'}</span>
                            <div className="truncate font-medium text-foreground">{item.name || '未命名订阅'}</div>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{item.url || '未填写订阅地址'}</div>
                          <div className="mt-1 truncate text-[11px] text-muted-foreground">{item.exclude || '无排除规则'}</div>
                        </div>
                        <div className="text-sm font-semibold text-foreground">{item.nodeCount ?? 0}</div>
                        <div className="text-xs text-muted-foreground">
                          <div>{usage.used} / {usage.total}</div>
                          <div className={usage.danger ? 'text-rose-600' : ''}>剩余 {usage.remaining}</div>
                        </div>
                        <div className={`text-xs ${usage.danger ? 'text-rose-600' : 'text-muted-foreground'}`}>{usage.expireLabel}</div>
                        <button onClick={() => toggleExpandedSub(item.id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {expanded ? '收起' : '编辑'}
                        </button>
                      </div>

                      <div className="space-y-3 xl:hidden">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">{item.name || '未命名订阅'}</div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">{item.url || '未填写订阅地址'}</div>
                              </div>
                              <button onClick={() => toggleExpandedSub(item.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground">
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {expanded ? '收起' : '编辑'}
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className={`rounded-full px-2 py-1 font-medium ${item.enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-300'}`}>{item.enabled ? '启用' : '停用'}</span>
                              <span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">{item.status || 'unchecked'}</span>
                              <span className="text-muted-foreground">节点 {item.nodeCount ?? 0}</span>
                              <span className={usage.danger ? 'text-rose-600' : 'text-muted-foreground'}>{usage.expireLabel}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 hidden xl:grid xl:grid-cols-4 xl:gap-3">
                        <div className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">节点<div className="mt-1 text-sm font-semibold text-foreground">{item.nodeCount ?? 0}</div></div>
                        <div className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">流量<div className="mt-1 text-sm font-semibold text-foreground">{usage.used} / {usage.total}</div></div>
                        <div className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">账户<div className="mt-1 truncate text-sm font-semibold text-foreground">{item.userInfo?.username || '-'}</div></div>
                        <div className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">状态<div className={`mt-1 inline-flex rounded-full px-2 py-1 font-medium ${item.status === 'success' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : item.status === 'error' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : 'bg-secondary text-secondary-foreground'}`}>{item.status || 'unchecked'}</div></div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => refreshNode(item)} disabled={refreshing || !item.url} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />刷新</button>
                        <button onClick={() => copyText(item.url, '订阅链接')} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><Copy className="h-3.5 w-3.5" />复制</button>
                      </div>

                      {expanded && (
                        <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-background/60 p-4 xl:grid-cols-[1fr_1fr_0.8fr_auto]">
                          <div className="space-y-2">
                            <label className="space-y-1">
                              <span className="text-xs font-medium text-muted-foreground">订阅名称</span>
                              <input value={item.name} onChange={(e) => updateSubscription(item.id, { name: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="订阅名称" />
                            </label>
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <input type="checkbox" checked={item.enabled} onChange={(e) => updateSubscription(item.id, { enabled: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                              启用该订阅
                            </label>
                          </div>
                          <div className="space-y-2">
                            <label className="space-y-1">
                              <span className="text-xs font-medium text-muted-foreground">订阅地址</span>
                              <input value={item.url} onChange={(e) => updateSubscription(item.id, { url: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="订阅 URL" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-medium text-muted-foreground">排除规则</span>
                              <input value={item.exclude || ''} onChange={(e) => updateSubscription(item.id, { exclude: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="排除规则 / exclude" />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                            <div className="rounded-xl border border-border bg-background/50 p-3">节点<div className="mt-1 text-sm font-semibold text-foreground">{item.nodeCount ?? 0}</div></div>
                            <div className="rounded-xl border border-border bg-background/50 p-3">状态<div className="mt-1 text-sm font-semibold text-foreground">{item.status || 'unchecked'}</div></div>
                            <div className="rounded-xl border border-border bg-background/50 p-3">流量<div className="mt-1 text-sm font-semibold text-foreground">{usage.used} / {usage.total}</div></div>
                            <div className="rounded-xl border border-border bg-background/50 p-3">账户<div className="mt-1 truncate text-sm font-semibold text-foreground">{item.userInfo?.username || '-'}</div></div>
                          </div>
                          <div className="flex flex-row gap-2 xl:flex-col">
                            <button onClick={() => refreshNode(item)} disabled={refreshing || !item.url} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />刷新</button>
                            <button onClick={() => copyText(item.url, '订阅链接')} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><Copy className="h-3.5 w-3.5" />复制</button>
                            <button onClick={() => removeSubscription(item.id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-500/30 px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="h-3.5 w-3.5" />删除</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>}
          </div>
        </div>
      </SectionCard>}

      {activePanel === 'profiles' && <SectionCard title="分组与输出链接" sub="这里直接编辑 MiSub Profiles。每个分组可选中哪些订阅源、设置 customId、覆写 subConverter / subConfig，并生成当前可用的推导链接。">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.1fr]"><SearchBox value={profileQuery} onChange={setProfileQuery} placeholder="搜索分组名、customId、订阅引用..." /><div className="rounded-2xl border border-border bg-background/40 p-4 text-sm text-muted-foreground"><div>默认订阅 Token：<span className="font-medium text-foreground">{draftSettings?.mytoken || '-'}</span></div><div className="mt-1">分组 Token：<span className="font-medium text-foreground">{draftSettings?.profileToken || '-'}</span></div>{generatedLinks[0]?.primary && <div className="mt-2 flex items-center gap-2"><span className="truncate">默认订阅直链：<span className="font-medium text-foreground">{generatedLinks[0].primary}</span></span><button className="text-primary" onClick={() => copyText(generatedLinks[0].primary, '默认订阅链接')}>复制</button></div>}</div></div>
          <div className="overflow-hidden rounded-2xl border border-border bg-background/35">
            {filteredProfiles.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">没有匹配的分组</div> : <>
              <div className="hidden grid-cols-[minmax(0,1fr)_160px_90px_minmax(0,1fr)_150px_88px] gap-3 border-b border-border bg-secondary/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground xl:grid">
                <div>分组</div>
                <div>Custom ID</div>
                <div>订阅数</div>
                <div>推导链接</div>
                <div>操作</div>
                <div>展开</div>
              </div>
              <div className="divide-y divide-border">
                {filteredProfiles.map((profile) => {
                  const generated = generatedLinks.find((item) => item.id === profile.id);
                  const expanded = expandedProfileIds.includes(profile.id);
                  return (
                    <div key={profile.id} className="px-4 py-3">
                      <div className="hidden grid-cols-[minmax(0,1fr)_160px_90px_minmax(0,1fr)_150px_88px] gap-3 xl:grid xl:items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${profile.enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-300'}`}>{profile.enabled ? '启用' : '停用'}</span>
                            <div className="truncate font-medium text-foreground">{profile.name || '未命名分组'}</div>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{profile.subConverter || '未单独设置 subConverter'}</div>
                        </div>
                        <div className="truncate text-sm text-foreground">{profile.customId || '-'}</div>
                        <div className="text-sm font-semibold text-foreground">{profile.subscriptions.length}</div>
                        <button className="truncate text-left text-xs text-primary" onClick={() => generated?.link && copyText(generated.link, `${profile.name} 分组链接`)}>{generated?.link || '未生成链接'}</button>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => generated?.link && copyText(generated.link, `${profile.name} 分组链接`)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><Copy className="h-3.5 w-3.5" />复制</button>
                          <button onClick={() => removeProfile(profile.id)} className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="h-3.5 w-3.5" />删除</button>
                        </div>
                        <button onClick={() => toggleExpandedProfile(profile.id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {expanded ? '收起' : '编辑'}
                        </button>
                      </div>

                      <div className="space-y-3 xl:hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{profile.name || '未命名分组'}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className={`rounded-full px-2 py-1 font-medium ${profile.enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-300'}`}>{profile.enabled ? '启用' : '停用'}</span>
                              <span className="text-muted-foreground">订阅 {profile.subscriptions.length} 条</span>
                              <span className="text-muted-foreground">ID {profile.customId || '-'}</span>
                            </div>
                          </div>
                          <button onClick={() => toggleExpandedProfile(profile.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground">
                            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {expanded ? '收起' : '编辑'}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="mt-3 space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4">
                          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_auto]">
                            <div className="space-y-2">
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">分组名称</span>
                                <input value={profile.name} onChange={(e) => updateProfile(profile.id, { name: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="分组名称" />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">Custom ID</span>
                                <input value={profile.customId || ''} onChange={(e) => updateProfile(profile.id, { customId: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="customId（可选）" />
                              </label>
                            </div>
                            <div className="space-y-2">
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">subConverter</span>
                                <input value={profile.subConverter || ''} onChange={(e) => updateProfile(profile.id, { subConverter: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="分组专属 subConverter" />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">subConfig</span>
                                <input value={profile.subConfig || ''} onChange={(e) => updateProfile(profile.id, { subConfig: e.target.value })} className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="分组专属 subConfig" />
                              </label>
                            </div>
                            <div className="flex flex-row gap-2 xl:flex-col">
                              <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={profile.enabled} onChange={(e) => updateProfile(profile.id, { enabled: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                                启用
                              </label>
                              <button onClick={() => generated?.link && copyText(generated.link, `${profile.name} 分组链接`)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"><Copy className="h-3.5 w-3.5" />复制链接</button>
                              <button onClick={() => removeProfile(profile.id)} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-500/30 px-2.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="h-3.5 w-3.5" />删除分组</button>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                              <span className="font-medium text-foreground">包含订阅源</span>
                              <span className="text-muted-foreground">{profile.subscriptions.length} 条已选</span>
                              {generated?.link && <button className="truncate text-primary" onClick={() => copyText(generated.link, `${profile.name} 分组链接`)}>{generated.link}</button>}
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {draftMisubs.map((subscription) => {
                                const selected = profile.subscriptions.includes(subscription.id);
                                return (
                                  <label key={subscription.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border bg-background/50 hover:bg-secondary/60'}`}>
                                    <input type="checkbox" checked={selected} onChange={(e) => { const next = e.target.checked ? [...profile.subscriptions, subscription.id] : profile.subscriptions.filter((id) => id !== subscription.id); updateProfile(profile.id, { subscriptions: next }); }} className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-foreground">{subscription.name}</div>
                                      <div className="truncate text-xs text-muted-foreground">{subscription.url}</div>
                                      <div className="mt-1 text-xs text-muted-foreground">节点 {subscription.nodeCount ?? 0}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>}
          </div>
        </div>
      </SectionCard>}

      {activePanel === 'settings' && <SectionCard title="MiSub 设置" sub="这里直接管理 MiSub 的基础输出设置、SubConverter、模板、命名和通知阈值。保存后会直接回写到 MiSub 后台。">
        {!draftSettings ? <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">连接 MiSub 后即可编辑设置</div> : <div className="space-y-4"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="space-y-2"><span className="text-sm font-medium text-foreground">FileName</span><input value={draftSettings.FileName || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, FileName: e.target.value } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="space-y-2"><span className="text-sm font-medium text-foreground">mytoken</span><input value={draftSettings.mytoken || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, mytoken: e.target.value } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="space-y-2"><span className="text-sm font-medium text-foreground">profileToken</span><input value={draftSettings.profileToken || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, profileToken: e.target.value } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="space-y-2"><span className="text-sm font-medium text-foreground">subConverter</span><input value={draftSettings.subConverter || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, subConverter: e.target.value } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="space-y-2"><span className="text-sm font-medium text-foreground">subConfig</span><input value={draftSettings.subConfig || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, subConfig: e.target.value } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div><div className="grid grid-cols-1 gap-4 md:grid-cols-4"><label className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-foreground"><input type="checkbox" checked={!!draftSettings.prependSubName} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, prependSubName: e.target.checked } : prev))} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />前置订阅名</label><label className="space-y-2"><span className="text-sm font-medium text-foreground">到期提醒天数</span><input type="number" value={draftSettings.NotifyThresholdDays ?? 0} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, NotifyThresholdDays: Number(e.target.value) } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="space-y-2"><span className="text-sm font-medium text-foreground">流量提醒阈值 %</span><input type="number" value={draftSettings.NotifyThresholdPercent ?? 0} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, NotifyThresholdPercent: Number(e.target.value) } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><div className="rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground"><div>存储模式</div><div className="mt-1 text-base font-semibold text-foreground">{draftSettings.storageType || '-'}</div></div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><label className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-foreground"><input type="checkbox" checked={!!draftSettings.prefixConfig?.enableManualNodes} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, prefixConfig: { ...prev.prefixConfig, enableManualNodes: e.target.checked } } : prev))} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />手动节点前缀</label><label className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm text-foreground"><input type="checkbox" checked={!!draftSettings.prefixConfig?.enableSubscriptions} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, prefixConfig: { ...prev.prefixConfig, enableSubscriptions: e.target.checked } } : prev))} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />订阅源前缀</label><label className="space-y-2"><span className="text-sm font-medium text-foreground">manualNodePrefix</span><input value={draftSettings.prefixConfig?.manualNodePrefix || ''} onChange={(e) => setDraftSettings((prev) => (prev ? { ...prev, prefixConfig: { ...prev.prefixConfig, manualNodePrefix: e.target.value } } : prev))} className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div><details className="rounded-xl border border-border/70 bg-background/60 p-3"><summary className="cursor-pointer text-sm font-medium text-foreground">查看设置完整 JSON</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(draftSettings, null, 2)}</pre></details></div>}
      </SectionCard>}
    </div>
  );
}
