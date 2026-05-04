import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useProxyStore } from '../stores/proxy';
import type { MiSubIntegrationData, PersonalProxyAiPlan, Proxy, ProxyKernelSource, ProxyKernelStatus } from '../types';
import ProxyTable from '../components/proxy/ProxyTable';
import ProxyForm from '../components/proxy/ProxyForm';
import { osApi, proxyKernelApi } from '../lib/api';
import { readIntegrationCache } from '../lib/integrationCache';
import { CheckCircle2, Globe2, Plus, Power, RefreshCw, Server, Sparkles, Wand2 } from 'lucide-react';

const MISUB_CACHE_KEY = 'muse.integration.misub';

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/\/+$/, '');
}

function buildSourcesFromMiSubCache(cached: MiSubIntegrationData | null): ProxyKernelSource[] {
  if (!cached?.connected) return [];
  const root = normalizeBaseUrl(cached.baseUrl || '');
  const profileToken = cached.settings?.profileToken || '';

  const profiles = (cached.profiles || [])
    .map((profile) => ({
      key: `profile:${profile.id}`,
      label: `分组 · ${profile.name}`,
      url: profileToken ? `${root}/${profileToken}/${profile.customId || profile.id}` : '',
      kind: 'profile' as const,
    }))
    .filter((item) => item.url);

  const subscriptions = (cached.misubs || [])
    .map((item) => ({
      key: `subscription:${item.id}`,
      label: `订阅 · ${item.name}`,
      url: item.url,
      kind: 'subscription' as const,
    }))
    .filter((item) => item.url);

  return [...profiles, ...subscriptions];
}

export default function ProxySettings() {
  const { proxies, loading, fetchProxies, createProxy, updateProxy, deleteProxy, testProxy, setDefault, setEnabled } = useProxyStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Proxy | null>(null);
  const [kernel, setKernel] = useState<ProxyKernelStatus | null>(null);
  const [kernelLoading, setKernelLoading] = useState(true);
  const [kernelBusy, setKernelBusy] = useState(false);
  const [kernelSourceKey, setKernelSourceKey] = useState('');
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const [selectedNodeName, setSelectedNodeName] = useState('');
  const [openAiProbe, setOpenAiProbe] = useState<{ ok: boolean; message: string; groupName: string; target: string } | null>(null);
  const [fallbackSources, setFallbackSources] = useState<ProxyKernelSource[]>([]);
  const [aiPlan, setAiPlan] = useState<PersonalProxyAiPlan | null>(null);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const activeProxies = useMemo(() => proxies.filter((item) => item.is_enabled).length, [proxies]);
  const proxyGroups = useMemo(() => kernel?.proxyGroups || [], [kernel]);
  const selectedGroup = useMemo(
    () => proxyGroups.find((group) => group.name === selectedGroupName) || proxyGroups.find((group) => group.name === kernel?.openAiGroupName) || proxyGroups[0],
    [kernel?.openAiGroupName, proxyGroups, selectedGroupName],
  );

  const loadKernelStatus = async () => {
    setKernelLoading(true);
    try {
      const status = await proxyKernelApi.status();
      setKernel(status);
      const cachedMiSub = readIntegrationCache<MiSubIntegrationData>(MISUB_CACHE_KEY).value || null;
      const nextFallbackSources = buildSourcesFromMiSubCache(cachedMiSub);
      setFallbackSources(nextFallbackSources);
      const visibleSources = status.availableSources.length ? status.availableSources : nextFallbackSources;
      setKernelSourceKey(status.sourceKey || visibleSources[0]?.key || '');
      setSelectedGroupName(status.openAiGroupName || status.proxyGroups[0]?.name || '');
      setSelectedNodeName(status.openAiNodeName || status.proxyGroups[0]?.now || status.proxyGroups[0]?.all?.[0] || '');
    } finally {
      setKernelLoading(false);
    }
  };

  useEffect(() => {
    fetchProxies().catch(() => toast.error('加载代理列表失败'));
    loadKernelStatus().catch(() => toast.error('加载内置代理内核失败'));
  }, [fetchProxies]);

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (proxy: Proxy) => {
    setEditing(proxy);
    setFormOpen(true);
  };

  const handleSave = async (data: Partial<Proxy>) => {
    try {
      if (editing) {
        await updateProxy(editing.id, data);
        toast.success('代理已更新');
      } else {
        await createProxy(data);
        toast.success('代理已添加');
      }
    } catch (e: any) {
      toast.error(e.message || '操作失败');
      throw e;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该代理吗？')) return;
    try {
      await deleteProxy(id);
      toast.success('代理已删除');
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    }
  };

  const handleTest = async (id: number) => {
    const result = await testProxy(id);
    if (result.status === 'active') {
      toast.success(`测试成功 · IP: ${result.ip} · 延迟: ${result.latency}ms`);
    } else {
      toast.error('代理连接失败');
    }
    return result;
  };

  const handleSetDefault = async (id: number) => {
    try {
      await setDefault(id);
      toast.success('已设为默认代理');
    } catch (e: any) {
      toast.error(e.message || '设置失败');
    }
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      await setEnabled(id, enabled);
      toast.success(enabled ? '代理已启用' : '代理已禁用');
    } catch (e: any) {
      toast.error(e.message || '切换失败');
    }
  };

  const handleDownloadKernel = async () => {
    try {
      setKernelBusy(true);
      const next = await proxyKernelApi.download();
      setKernel(next);
      const visibleSources = next.availableSources.length ? next.availableSources : fallbackSources;
      setKernelSourceKey(next.sourceKey || visibleSources[0]?.key || '');
      toast.success(`mihomo 已下载：${next.version || 'latest'}`);
    } catch (e: any) {
      toast.error(e.message || '下载内置代理核心失败');
    } finally {
      setKernelBusy(false);
    }
  };

  const handleStartKernel = async () => {
    if (!kernelSourceKey) {
      toast.error('先选择一个 MiSub 订阅或分组链接');
      return;
    }
    try {
      setKernelBusy(true);
      const visibleSources = kernel?.availableSources?.length ? kernel.availableSources : fallbackSources;
      const selectedSource = visibleSources.find((item) => item.key === kernelSourceKey);
      const next = await proxyKernelApi.start({
        sourceKey: kernelSourceKey,
        sourceUrl: selectedSource?.url,
        sourceLabel: selectedSource?.label,
      });
      setKernel(next);
      setSelectedGroupName(next.openAiGroupName || next.proxyGroups[0]?.name || '');
      setSelectedNodeName(next.openAiNodeName || next.proxyGroups[0]?.now || next.proxyGroups[0]?.all?.[0] || '');
      await fetchProxies();
      toast.success('内置代理内核已启动，并已切到默认代理');
    } catch (e: any) {
      toast.error(e.message || '启动内置代理内核失败');
    } finally {
      setKernelBusy(false);
    }
  };

  const handleSelectNode = async () => {
    const groupName = selectedGroup?.name || selectedGroupName;
    const target = selectedNodeName || selectedGroup?.now || '';
    if (!groupName || !target) {
      toast.error('先选择代理组和节点');
      return;
    }
    try {
      setKernelBusy(true);
      const next = await proxyKernelApi.select({ groupName, target });
      setKernel(next);
      setSelectedGroupName(groupName);
      setSelectedNodeName(target);
      toast.success(`已切换 ${groupName} -> ${target}`);
    } catch (e: any) {
      toast.error(e.message || '切换节点失败');
    } finally {
      setKernelBusy(false);
    }
  };

  const handleTestOpenAi = async () => {
    const groupName = selectedGroup?.name || selectedGroupName;
    const target = selectedNodeName || selectedGroup?.now || '';
    if (!groupName || !target) {
      toast.error('先选择代理组和节点');
      return;
    }
    try {
      setKernelBusy(true);
      const result = await proxyKernelApi.testOpenAi({ groupName, target });
      setOpenAiProbe(result);
      if (result.ok) {
        toast.success(result.message || `OpenAI 路由可用：${target}`);
      } else {
        toast.error(result.message || `OpenAI 路由不可用：${target}`);
      }
    } catch (e: any) {
      toast.error(e.message || 'OpenAI 路由测试失败');
    } finally {
      setKernelBusy(false);
    }
  };

  const handleStopKernel = async () => {
    try {
      setKernelBusy(true);
      const next = await proxyKernelApi.stop();
      setKernel(next);
      await fetchProxies();
      toast.success('内置代理内核已停止');
    } catch (e: any) {
      toast.error(e.message || '停止内置代理内核失败');
    } finally {
      setKernelBusy(false);
    }
  };

  const handleAiPlan = async () => {
    try {
      setAiPlanning(true);
      const result = await osApi.aiManageProxies({
        focus: '检查代理启用状态、默认出口、OpenAI 可用性和错误代理，给出可直接应用的代理治理建议。',
      });
      setAiPlan(result);
      toast.success('AI 代理治理建议已生成');
    } catch (e: any) {
      toast.error(e.message || '生成 AI 代理治理建议失败');
    } finally {
      setAiPlanning(false);
    }
  };

  const handleApplyAiPlan = async () => {
    if (!aiPlan?.suggestions.length) return;
    try {
      setAiApplying(true);
      await osApi.applyAiProxyPlan({ suggestions: aiPlan.suggestions });
      await fetchProxies();
      toast.success('AI 代理建议已应用');
    } catch (e: any) {
      toast.error(e.message || '应用 AI 代理建议失败');
    } finally {
      setAiApplying(false);
    }
  };

  return (
    <div className="proxy-workbench mx-auto w-full max-w-[1560px] space-y-6">
      <section className="rounded-[28px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)] px-3 py-1 text-xs text-muted-foreground">
            <Globe2 className="h-3.5 w-3.5" />
            Proxy Control Surface
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">代理链路和内置 mihomo 统一控制</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">上方负责启动 MiSub/mihomo，本地代理列表只保留节点、测试、默认出口这些具体操作。</p>
        </div>
          <div className="grid w-full grid-cols-1 gap-3 text-sm sm:grid-cols-3 xl:max-w-md">
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">代理</div>
              <div className="mt-1 text-2xl font-semibold">{proxies.length}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">启用</div>
              <div className="mt-1 text-2xl font-semibold">{activeProxies}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">内核</div>
              <div className="mt-1 text-lg font-semibold">{kernel?.running ? '运行' : kernel?.installed ? '待机' : '未装'}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="proxy-kernel-panel rounded-[24px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">内置代理内核</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">Muse server 已内置 `mihomo`，直接把 MiSub 分组/订阅链接转换成可用的本地代理端口。选好链接后直接启动即可。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            {!kernel?.installed && (
              <button
                onClick={handleDownloadKernel}
                disabled={kernelBusy}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-auto"
              >
                <Server className="mr-2 inline h-4 w-4" />下载核心
              </button>
            )}
            <button
                onClick={handleStartKernel}
                disabled={kernelBusy || !kernelSourceKey}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              <Power className="mr-2 inline h-4 w-4" />启动
            </button>
            <button
              onClick={handleStopKernel}
              disabled={kernelBusy || !kernel?.running}
              className="w-full rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20 sm:w-auto"
            >
              停止
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">状态</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {kernelLoading ? '加载中...' : kernel?.running ? '运行中' : kernel?.installed ? '已安装未启动' : '未安装'}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">版本</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{kernel?.version || '—'}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">Mixed Port</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{kernel?.mixedPort || '—'}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">来源</div>
            <div className="mt-2 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{kernel?.sourceLabel || '未选择'}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">健康</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{kernel?.health || 'unknown'}</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{kernel?.recoveryState || '未进入恢复流程'}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">OpenAI 组</div>
            <div className="mt-2 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">{kernel?.openAiGroupName || selectedGroup?.name || '—'}</div>
            <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">当前节点：{kernel?.openAiNodeName || selectedGroup?.now || '—'}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">上次可用节点</div>
            <div className="mt-2 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{kernel?.lastSuccessfulNode || '—'}</div>
            <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{kernel?.lastSuccessfulAt || '暂无成功记录'}</div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">MiSub 订阅 / 分组链接</label>
            <select
              value={kernelSourceKey}
              onChange={(e) => setKernelSourceKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">选择一个分组或订阅链接</option>
              {((kernel?.availableSources?.length ? kernel.availableSources : fallbackSources) || []).map((source) => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </select>
          </div>

          {!kernel?.availableSources?.length && fallbackSources.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              当前分组列表来自订阅管理本地缓存，因为后端还没有保存 `misub` 连接记录。
            </div>
          )}

          {kernel?.sourceUrl && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-3 text-xs text-zinc-500 dark:text-zinc-400 break-all">
              当前链接：{kernel.sourceUrl}
            </div>
          )}

          {proxyGroups.length > 0 && (
            <div className="grid gap-3 rounded-[18px] border border-zinc-200 p-4 dark:border-zinc-800 md:grid-cols-[1fr,1fr,auto]">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">代理组</label>
                <select
                  value={selectedGroup?.name || ''}
                  onChange={(e) => {
                    const nextGroup = proxyGroups.find((group) => group.name === e.target.value);
                    setSelectedGroupName(e.target.value);
                    setSelectedNodeName(nextGroup?.now || nextGroup?.all?.[0] || '');
                    setOpenAiProbe(null);
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {proxyGroups.map((group) => (
                    <option key={group.name} value={group.name}>{group.name} · {group.type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">节点</label>
                <select
                  value={selectedNodeName || selectedGroup?.now || ''}
                  onChange={(e) => {
                    setSelectedNodeName(e.target.value);
                    setOpenAiProbe(null);
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {(selectedGroup?.all || []).map((node) => (
                    <option key={node} value={node}>{node}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                <button
                  disabled={kernelBusy || !kernel?.running}
                  onClick={handleSelectNode}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-auto"
                >
                  选择节点
                </button>
                <button
                  disabled={kernelBusy || !kernel?.running}
                  onClick={handleTestOpenAi}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
                >
                  测 OpenAI
                </button>
              </div>
            </div>
          )}

          {openAiProbe && (
            <div className={`rounded-lg border p-3 text-sm ${openAiProbe.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'}`}>
              {openAiProbe.message || `${openAiProbe.groupName} -> ${openAiProbe.target}`}
            </div>
          )}

          {kernel?.lastError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {kernel.lastError}
            </div>
          )}

          {kernel?.lastRecoveryError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              恢复失败：{kernel.lastRecoveryError}
            </div>
          )}
        </div>
      </div>

      <div className="proxy-ai-panel rounded-[24px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5" />
              AI Proxy Governance
            </div>
            <h2 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">AI 代理治理</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">接入 `/os/proxies/ai-manage`，让 AI 根据当前代理状态给出启停、默认出口和修复建议，确认后再应用。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleAiPlan} disabled={aiPlanning} className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 disabled:opacity-50">
              <Wand2 className="h-4 w-4" />
              生成建议
            </button>
            <button onClick={handleApplyAiPlan} disabled={aiApplying || !aiPlan?.suggestions.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              应用全部
            </button>
          </div>
        </div>
        {aiPlan ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">{aiPlan.accountName} · {aiPlan.model}</div>
              <p className="mt-2 leading-6">{aiPlan.summary}</p>
              {aiPlan.usedFallback && <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">已自动切换 AI 账号：{aiPlan.fallbackReason || '原账号不可用'}</p>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {aiPlan.suggestions.length === 0 ? <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">AI 没有给出需要应用的代理修改。</div> : aiPlan.suggestions.map((suggestion, index) => (
                <div key={`${suggestion.target_id}-${index}`} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">代理 #{suggestion.target_id}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {suggestion.name && <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">命名：{suggestion.name}</span>}
                    {suggestion.is_enabled != null && <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{suggestion.is_enabled ? '启用' : '禁用'}</span>}
                    {suggestion.is_default != null && <span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{suggestion.is_default ? '设为默认' : '取消默认'}</span>}
                  </div>
                  <p className="mt-3 text-zinc-500 dark:text-zinc-400">{suggestion.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">还没有生成 AI 代理治理建议。</div>
        )}
      </div>

      <div className="proxy-list-panel rounded-[24px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">本地代理列表</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">手动代理、mihomo 默认出口和邮件收发代理都在这里验证。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button onClick={() => loadKernelStatus()} className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
              <RefreshCw className="h-4 w-4" />
              刷新内核
            </button>
            <button onClick={handleAdd} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              添加代理
            </button>
          </div>
        </div>
        <ProxyTable
          proxies={proxies}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTest={handleTest}
          onSetDefault={handleSetDefault}
          onToggleEnabled={handleToggleEnabled}
        />
      </div>

      <ProxyForm
        open={formOpen}
        proxy={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
