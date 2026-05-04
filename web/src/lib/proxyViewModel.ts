import type { MiSubIntegrationData, PersonalProxyAiPlan, Proxy, ProxyKernelSource, ProxyKernelStatus } from '../types';
import type { SemanticTone } from '../components/ui/primitives';

export function normalizeProxyBaseUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/\/+$/, '');
}

export function buildProxySourcesFromMiSubCache(cached: MiSubIntegrationData | null): ProxyKernelSource[] {
  if (!cached?.connected) return [];
  const root = normalizeProxyBaseUrl(cached.baseUrl || '');
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

export function buildProxyKernelSelection(status: ProxyKernelStatus, fallbackSources: ProxyKernelSource[]) {
  const firstGroup = status.proxyGroups?.[0];
  const activeGroupName = status.openAiGroupName || firstGroup?.name || '';
  const activeGroup = status.proxyGroups?.find((item) => item.name === activeGroupName) || firstGroup;
  const visibleSources = status.availableSources.length ? status.availableSources : fallbackSources;

  return {
    visibleSources,
    sourceKey: status.sourceKey || visibleSources[0]?.key || '',
    groupName: activeGroup?.name || '',
    nodeName: status.openAiNodeName || activeGroup?.now || activeGroup?.all?.[0] || '',
  };
}

export function getProxyKernelVisibleSources(kernel: ProxyKernelStatus | null, fallbackSources: ProxyKernelSource[]) {
  return kernel?.availableSources?.length ? kernel.availableSources : fallbackSources;
}

export function getProxyKernelSelectedGroup(kernel: ProxyKernelStatus | null, selectedGroupName: string) {
  return kernel?.proxyGroups?.find((item) => item.name === selectedGroupName) || null;
}

export function buildProxyKernelStats(kernel: ProxyKernelStatus | null, loading: boolean) {
  return [
    { label: '状态', value: loading ? '加载中...' : kernel?.running ? '运行中' : kernel?.installed ? '已安装未启动' : '未安装' },
    { label: '版本', value: kernel?.version || '—' },
    { label: 'Mixed Port', value: kernel?.mixedPort || '—' },
    { label: '来源', value: kernel?.sourceLabel || '未选择' },
  ];
}

export function buildOpenAiProbeView(message: string, ok: boolean | null): { message: string; tone: SemanticTone } | null {
  if (!message) return null;
  return {
    message,
    tone: ok ? 'success' : 'danger',
  };
}

export function buildProxyAiPlanView(plan: PersonalProxyAiPlan | null, proxies: Proxy[]) {
  if (!plan) return null;
  return {
    accountName: plan.accountName,
    model: plan.model,
    summary: plan.summary,
    suggestions: plan.suggestions.map((item, index) => {
      const proxy = proxies.find((entry) => entry.id === item.target_id);
      const badges: Array<{ tone: SemanticTone; label: string }> = [];
      if (item.name) badges.push({ tone: 'primary', label: `名称: ${item.name}` });
      if (item.is_enabled !== undefined) badges.push({ tone: item.is_enabled ? 'success' : 'warning', label: item.is_enabled ? '启用' : '禁用' });
      if (item.is_default) badges.push({ tone: 'accent', label: '设为默认' });

      return {
        key: `${item.target_id}-${index}`,
        targetLabel: proxy?.name || (proxy ? `${proxy.host}:${proxy.port}` : `代理 #${item.target_id}`),
        badges,
        reason: item.reason,
      };
    }),
  };
}
