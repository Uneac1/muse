import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useProxyStore } from '../stores/proxy';
import type { MiSubIntegrationData, Proxy, ProxyKernelSource, ProxyKernelStatus } from '../types';
import ProxyTable from '../components/proxy/ProxyTable';
import ProxyForm from '../components/proxy/ProxyForm';
import { proxyKernelApi } from '../lib/api';
import { readIntegrationCache } from '../lib/integrationCache';

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
  const [fallbackSources, setFallbackSources] = useState<ProxyKernelSource[]>([]);

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
      await fetchProxies();
      toast.success('内置代理内核已启动，并已切到默认代理');
    } catch (e: any) {
      toast.error(e.message || '启动内置代理内核失败');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">代理设置</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">管理 SOCKS5 / HTTP 代理，用于邮件收发</p>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          添加代理
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">内置代理内核</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Muse server 已内置 `mihomo`，直接把 MiSub 分组/订阅链接转换成可用的本地代理端口。选好链接后直接启动即可。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!kernel?.installed && (
              <button
                onClick={handleDownloadKernel}
                disabled={kernelBusy}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                下载核心
              </button>
            )}
            <button
              onClick={handleStartKernel}
              disabled={kernelBusy || !kernelSourceKey}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              启动
            </button>
            <button
              onClick={handleStopKernel}
              disabled={kernelBusy || !kernel?.running}
              className="px-4 py-2 text-sm rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20 disabled:opacity-50 transition-colors"
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
            <div className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{kernel?.sourceLabel || '未选择'}</div>
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

          {kernel?.lastError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {kernel.lastError}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
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
