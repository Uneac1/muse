import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Cloud,
  Code2,
  ExternalLink,
  Globe,
  Layers3,
  Network,
  RefreshCw,
  Route,
  Shield,
  Unplug,
  UserCircle2,
  Waypoints,
} from 'lucide-react';
import { EmptyState, SearchBox, SectionCard } from '../components/ui/patterns';
import { integrationApi } from '../lib/api';
import { isIntegrationCacheFresh, readIntegrationCache, shouldShowInitialLoading, writeIntegrationCache } from '../lib/integrationCache';
import { timeAgo } from '../lib/utils';
import type {
  CloudflareDnsRecord,
  CloudflareIntegrationData,
  CloudflarePagesProject,
  CloudflareRuleset,
  CloudflareWorkerScript,
  CloudflareZone,
} from '../types';

const emptyState: CloudflareIntegrationData = {
  connected: false,
  tokenMasked: '',
  lastSyncAt: null,
  user: null,
  accounts: [],
  zones: [],
  zoneDetails: [],
  pagesProjects: [],
  workerScripts: [],
  rulesets: [],
};
const CLOUDFLARE_CACHE_KEY = 'muse.integration.cloudflare';
const cachedCloudflare = readIntegrationCache<CloudflareIntegrationData>(CLOUDFLARE_CACHE_KEY);

export default function CloudflareManager() {
  const [data, setData] = useState<CloudflareIntegrationData>(cachedCloudflare.value || emptyState);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(shouldShowInitialLoading(cachedCloudflare.value));
  const [submitting, setSubmitting] = useState(false);
  const [zoneQuery, setZoneQuery] = useState('');
  const [dnsQuery, setDnsQuery] = useState('');
  const [pagesQuery, setPagesQuery] = useState('');
  const [workersQuery, setWorkersQuery] = useState('');
  const [rulesQuery, setRulesQuery] = useState('');

  const load = async () => {
    try {
      setLoading(shouldShowInitialLoading(cachedCloudflare.value));
      const result = await integrationApi.getCloudflare();
      writeIntegrationCache(CLOUDFLARE_CACHE_KEY, result);
      setData(result);
    } catch (err: any) {
      toast.error(err.message || '加载 Cloudflare 信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isIntegrationCacheFresh<CloudflareIntegrationData>(CLOUDFLARE_CACHE_KEY)) return;
    load();
  }, []);

  const connect = async () => {
    if (!token.trim()) {
      toast.error('请先输入 Cloudflare API Token');
      return;
    }
    try {
      setSubmitting(true);
      const result = await integrationApi.connectCloudflare(token.trim());
      writeIntegrationCache(CLOUDFLARE_CACHE_KEY, result);
      setData(result);
      setToken('');
      toast.success('Cloudflare 已连接');
    } catch (err: any) {
      toast.error(err.message || '连接 Cloudflare 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    try {
      setSubmitting(true);
      const result = await integrationApi.syncCloudflare();
      writeIntegrationCache(CLOUDFLARE_CACHE_KEY, result);
      setData(result);
      toast.success('Cloudflare 数据已同步');
    } catch (err: any) {
      toast.error(err.message || '同步 Cloudflare 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('确定断开 Cloudflare 连接吗？')) return;
    try {
      setSubmitting(true);
      await integrationApi.disconnectCloudflare();
      writeIntegrationCache(CLOUDFLARE_CACHE_KEY, emptyState);
      setData(emptyState);
      toast.success('Cloudflare 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 Cloudflare 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const allDnsRecords = useMemo(
    () => data.zoneDetails.flatMap((detail) => detail.records),
    [data.zoneDetails]
  );

  const filteredZones = useMemo(() => {
    const q = zoneQuery.trim().toLowerCase();
    if (!q) return data.zones;
    return data.zones.filter((zone) =>
      [zone.name, zone.status, zone.type, zone.name_servers.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.zones, zoneQuery]);

  const filteredDnsRecords = useMemo(() => {
    const q = dnsQuery.trim().toLowerCase();
    if (!q) return allDnsRecords;
    return allDnsRecords.filter((record) =>
      [record.zone_name, record.type, record.name, record.content, record.comment || '', ...(record.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [allDnsRecords, dnsQuery]);

  const filteredPages = useMemo(() => {
    const q = pagesQuery.trim().toLowerCase();
    if (!q) return data.pagesProjects;
    return data.pagesProjects.filter((project) =>
      [project.name, project.subdomain, project.production_branch, project.domains.join(' '), project.latest_deployment?.url || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.pagesProjects, pagesQuery]);

  const filteredWorkers = useMemo(() => {
    const q = workersQuery.trim().toLowerCase();
    if (!q) return data.workerScripts;
    return data.workerScripts.filter((worker) =>
      [worker.id, worker.tag || '', worker.usage_model || '', worker.etag || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.workerScripts, workersQuery]);

  const filteredRulesets = useMemo(() => {
    const q = rulesQuery.trim().toLowerCase();
    if (!q) return data.rulesets;
    return data.rulesets.filter((ruleset) =>
      [ruleset.name, ruleset.description || '', ruleset.kind, ruleset.phase, ruleset.version, ...(ruleset.rules || []).map((rule) => `${rule.action} ${rule.expression || ''} ${rule.description || ''}`)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.rulesets, rulesQuery]);

  const zoneDetailsMap = useMemo(
    () => new Map(data.zoneDetails.map((detail) => [detail.zoneId, detail])),
    [data.zoneDetails]
  );

  const statCards = [
    { icon: Globe, label: '域名数量', value: data.zones.length, tone: 'from-sky-500/25 to-cyan-500/10' },
    { icon: Network, label: 'DNS 记录', value: allDnsRecords.length, tone: 'from-indigo-500/25 to-blue-500/10' },
    { icon: Layers3, label: 'Pages 项目', value: data.pagesProjects.length, tone: 'from-orange-500/25 to-amber-500/10' },
    { icon: Code2, label: 'Workers', value: data.workerScripts.length, tone: 'from-emerald-500/25 to-lime-500/10' },
    { icon: Route, label: 'Rulesets', value: data.rulesets.length, tone: 'from-violet-500/25 to-fuchsia-500/10' },
    { icon: Waypoints, label: '代理记录', value: allDnsRecords.filter((record) => record.proxied).length, tone: 'from-cyan-500/25 to-sky-500/10' },
  ];

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_left,rgba(59,130,246,0.12),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-600 dark:text-orange-300">
                <Cloud className="h-3.5 w-3.5" />
                Cloudflare 控制台
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">DNS、Pages、Workers、Rules 一屏管理</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                这里会尽可能拉取 Token 可访问的所有 Cloudflare 资产；如果某个模块权限不足，会保留其它模块正常显示。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => window.open('https://dash.cloudflare.com/login', '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                登录 Cloudflare
                <ExternalLink className="h-4 w-4" />
              </button>
              <button onClick={() => window.open('https://dash.cloudflare.com/profile/api-tokens', '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                创建 API Token
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {statCards.map((card, index) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }} className="glass-card p-5">
            <div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br p-3 ${card.tone}`}>
              <card.icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <div className="space-y-6">
          <SectionCard title="Token 管理" sub="新增、替换、同步或断开 Cloudflare Token。">
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Cloudflare API Token</span>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴新的 Cloudflare API Token。保存后会覆盖当前正在使用的 Token。"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">当前 Token 状态</p>
                <p className="mt-2">已保存状态：{data.connected ? `已连接，当前显示为 ${data.tokenMasked}` : '尚未保存 Token'}</p>
                <p className="mt-2">最后同步：{data.lastSyncAt ? timeAgo(data.lastSyncAt) : '暂无'}</p>
                <p className="mt-3">建议权限：`User Read`、`Account Read`、`Zone Read`、`DNS Read`、`Pages Read`、`Workers Read`、`Rulesets Read`。</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={connect} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  <Cloud className="h-4 w-4" />
                  连接并获取信息
                </button>
                <button onClick={sync} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
                  刷新同步
                </button>
                <button onClick={disconnect} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                  <Unplug className="h-4 w-4" />
                  断开连接
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="账户与账户组" sub="当前 Token 可访问的用户和账户。">
            {data.user ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">User</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{data.user.email}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{[data.user.first_name, data.user.last_name].filter(Boolean).join(' ') || data.user.username || '未提供姓名'}</div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {data.accounts.map((account) => (
                    <div key={account.id} className="rounded-xl border border-border bg-background/40 p-4">
                      <div className="font-medium text-foreground">{account.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{account.type} · {account.id}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState text={loading ? '正在加载账户信息...' : '连接 Cloudflare 后，这里会显示用户和账户信息。'} />
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="域名列表" sub={`${filteredZones.length} / ${data.zones.length} 个域名`} action={<div className="w-full md:w-80"><SearchBox value={zoneQuery} onChange={setZoneQuery} placeholder="搜索域名、状态、Name Server" /></div>}>
            <div className="space-y-3">
              {filteredZones.length === 0 ? (
                <EmptyState text={loading ? '正在加载 Cloudflare 域名...' : '暂无匹配域名。'} />
              ) : (
                filteredZones.map((zone: CloudflareZone) => {
                  const detail = zoneDetailsMap.get(zone.id);
                  return (
                    <div key={zone.id} className="rounded-2xl border border-border bg-background/40 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">{zone.name}</h3>
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{zone.type}</span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${zone.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>{zone.status}</span>
                            {zone.paused && <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">paused</span>}
                            {!!zone.development_mode && <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-300">dev mode</span>}
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">DNS 记录<div className="mt-1 text-lg font-semibold text-foreground">{detail?.dnsRecordCount ?? 0}</div></div>
                            <div className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">代理记录<div className="mt-1 text-lg font-semibold text-foreground">{detail?.proxiedRecordCount ?? 0}</div></div>
                            <div className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">最近修改<div className="mt-1 text-sm font-medium text-foreground">{new Date(zone.modified_on).toLocaleString('zh-CN')}</div></div>
                          </div>
                          <div className="text-sm text-muted-foreground">Name Servers: {zone.name_servers.join(', ') || '暂无'}</div>
                        </div>
                        <button onClick={() => window.open(`https://dash.cloudflare.com/?to=/:account/${zone.name}`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                          打开后台
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          <SectionCard title="完整 DNS 表" sub={`${filteredDnsRecords.length} / ${allDnsRecords.length} 条记录`} action={<div className="w-full md:w-80"><SearchBox value={dnsQuery} onChange={setDnsQuery} placeholder="搜索 DNS 类型、名称、内容、备注" /></div>}>
            {filteredDnsRecords.length === 0 ? (
              <EmptyState text={loading ? '正在加载 DNS 记录...' : '暂无 DNS 记录或当前 Token 缺少 DNS Read 权限。'} />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-background/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Zone</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Content</th>
                      <th className="px-4 py-3">TTL</th>
                      <th className="px-4 py-3">Proxy</th>
                      <th className="px-4 py-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredDnsRecords.map((record: CloudflareDnsRecord) => (
                      <tr key={record.id} className="bg-background/30">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{record.zone_name}</td>
                        <td className="px-4 py-3"><span className="rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">{record.type}</span></td>
                        <td className="max-w-[240px] truncate px-4 py-3 text-foreground">{record.name}</td>
                        <td className="max-w-[380px] truncate px-4 py-3 text-muted-foreground">{record.content}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{record.ttl === 1 ? 'Auto' : record.ttl}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {record.proxied === undefined ? '-' : (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${record.proxied ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>
                              {record.proxied ? 'proxied' : 'dns only'}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{record.modified_on ? new Date(record.modified_on).toLocaleString('zh-CN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Pages 项目" sub={`${filteredPages.length} / ${data.pagesProjects.length} 个项目`} action={<div className="w-full md:w-80"><SearchBox value={pagesQuery} onChange={setPagesQuery} placeholder="搜索 Pages 项目、域名、分支" /></div>}>
            {filteredPages.length === 0 ? (
              <EmptyState text={loading ? '正在加载 Pages 项目...' : '暂无 Pages 项目或当前 Token 缺少 Pages Read 权限。'} />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredPages.map((project: CloudflarePagesProject) => (
                  <div key={project.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{project.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">branch: {project.production_branch || '-'}</div>
                      </div>
                      <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-600 dark:text-orange-300">Pages</span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div>Subdomain: {project.subdomain || '-'}</div>
                      <div>Domains: {project.domains?.join(', ') || '-'}</div>
                      <div>Latest: {project.latest_deployment?.latest_stage?.status || project.latest_deployment?.environment || '-'}</div>
                    </div>
                    {project.latest_deployment?.url && (
                      <button onClick={() => window.open(project.latest_deployment!.url, '_blank', 'noopener,noreferrer')} className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                        打开部署
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Workers 脚本" sub={`${filteredWorkers.length} / ${data.workerScripts.length} 个脚本`} action={<div className="w-full md:w-80"><SearchBox value={workersQuery} onChange={setWorkersQuery} placeholder="搜索 Worker 名称、Tag、模式" /></div>}>
            {filteredWorkers.length === 0 ? (
              <EmptyState text={loading ? '正在加载 Workers...' : '暂无 Worker 脚本或当前 Token 缺少 Workers Read 权限。'} />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredWorkers.map((worker: CloudflareWorkerScript) => (
                  <div key={worker.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{worker.id}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{worker.usage_model || 'standard'} · {worker.tag || 'no tag'}</div>
                      </div>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">Worker</span>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      修改于 {worker.modified_on ? new Date(worker.modified_on).toLocaleString('zh-CN') : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Rules / Rulesets" sub={`${filteredRulesets.length} / ${data.rulesets.length} 个规则集`} action={<div className="w-full md:w-80"><SearchBox value={rulesQuery} onChange={setRulesQuery} placeholder="搜索规则集、阶段、表达式" /></div>}>
            {filteredRulesets.length === 0 ? (
              <EmptyState text={loading ? '正在加载 Rulesets...' : '暂无 Rulesets 或当前 Token 缺少 Rulesets Read 权限。'} />
            ) : (
              <div className="space-y-3">
                {filteredRulesets.map((ruleset: CloudflareRuleset) => (
                  <div key={ruleset.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{ruleset.name}</h3>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{ruleset.kind}</span>
                      <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-300">{ruleset.phase}</span>
                      <span className="text-xs text-muted-foreground">v{ruleset.version}</span>
                    </div>
                    {ruleset.description && <p className="mt-2 text-sm text-muted-foreground">{ruleset.description}</p>}
                    <div className="mt-3 text-xs text-muted-foreground">更新于 {ruleset.last_updated ? new Date(ruleset.last_updated).toLocaleString('zh-CN') : '-'}</div>
                    {ruleset.rules && ruleset.rules.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {ruleset.rules.slice(0, 6).map((rule, index) => (
                          <div key={rule.id || index} className="rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">{rule.action}</span>
                              <span>{rule.enabled === false ? 'disabled' : 'enabled'}</span>
                              {rule.description && <span>{rule.description}</span>}
                            </div>
                            {rule.expression && <div className="mt-2 break-all font-mono">{rule.expression}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
