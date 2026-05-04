import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  CompactList,
  ControlPanel,
  KeyValueGrid,
  MetricCard,
} from '../layout/ControlCenter';
import { Button, StatusTag, Surface, Switch, TextInput } from '../ui/primitives';
import { crsApi } from '../../lib/api';
import type { CrsRelayStatus } from '../../types';

const DEFAULT_CRS_FORM = {
  enabled: false,
  name: 'Muse CRS',
  upstreamBaseUrl: 'https://api.openai.com/v1',
  upstreamApiKey: '',
  publicApiKey: '',
  defaultModel: 'gpt-5.5',
  timeoutMs: 120000,
  enabledSources: ['oauth'] as Array<'oauth' | 'token_api' | 'ai_api' | 'manual'>,
};

type CrsSource = CrsRelayStatus['enabledSources'][number];

const SOURCE_OPTIONS: Array<{ key: CrsSource; label: string; hint: string }> = [
  { key: 'oauth', label: 'Codex 账号池', hint: '与「Token 管理」里的 OpenAI Codex OAuth / Refresh Token 是同一批账号' },
  { key: 'token_api', label: 'Token API 池', hint: 'Token 表里的 API Key 账号' },
  { key: 'ai_api', label: 'AI API 池', hint: 'AI 账号池里的 OpenAI-compatible Key' },
  { key: 'manual', label: '手动上游', hint: 'CRS 表单里填写的上游 Key' },
];

function sourceLabel(candidate: CrsRelayStatus['candidates'][number]) {
  if (candidate.sourceType === 'oauth') return 'Codex OAuth';
  if (candidate.sourceType === 'token_api') return 'Token API';
  if (candidate.sourceType === 'ai_api') return 'AI 账号';
  return '手动上游';
}

export default function CrsRelayPanel() {
  const [crs, setCrs] = useState<CrsRelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState(DEFAULT_CRS_FORM);
  const visiblePublicKey = form.publicApiKey.trim();

  const codexOauthCandidates = useMemo(
    () => (crs?.candidates || []).filter((candidate) => candidate.source === 'token').length,
    [crs?.candidates],
  );

  const load = async () => {
    setLoading(true);
    try {
      const status = await crsApi.status();
      setCrs(status);
      setForm({
        enabled: status.enabled,
        name: status.name || DEFAULT_CRS_FORM.name,
        upstreamBaseUrl: status.upstreamBaseUrl || DEFAULT_CRS_FORM.upstreamBaseUrl,
        upstreamApiKey: '',
        publicApiKey: '',
        defaultModel: status.defaultModel ?? '',
        timeoutMs: status.timeoutMs || DEFAULT_CRS_FORM.timeoutMs,
        enabledSources: status.enabledSources?.length ? status.enabledSources : DEFAULT_CRS_FORM.enabledSources,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => toast.error('加载 CRS 转发配置失败'));
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const next = await crsApi.update(form);
      setCrs(next);
      setForm((current) => ({ ...current, upstreamApiKey: '', publicApiKey: '' }));
      toast.success('CRS 配置已保存');
    } catch (error: any) {
      toast.error(error.message || '保存 CRS 配置失败');
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = async () => {
    if (!confirm('确定要轮换 CRS 对外 API Key 吗？旧 key 会立即失效。')) return;
    try {
      setSaving(true);
      const next = await crsApi.rotateKey();
      setCrs(next);
      toast.success('CRS API Key 已轮换');
    } catch (error: any) {
      toast.error(error.message || '轮换 CRS API Key 失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      setTesting(true);
      const result = await crsApi.test();
      if (result.ok) toast.success(`CRS 上游可用 · ${result.latencyMs}ms`);
      else toast.error(`CRS 上游返回 ${result.status}`);
      await load();
    } catch (error: any) {
      toast.error(error.message || 'CRS 上游测试失败');
      await load().catch(() => undefined);
    } finally {
      setTesting(false);
    }
  };

  const copy = async (value: string, label: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`已复制 ${label}`);
  };

  const toggleSource = (source: CrsSource) => {
    setForm((current) => {
      const selected = new Set(current.enabledSources || []);
      if (selected.has(source)) selected.delete(source);
      else selected.add(source);
      const enabledSources = Array.from(selected);
      return {
        ...current,
        enabledSources: enabledSources.length ? enabledSources : ['oauth'],
      };
    });
  };

  return (
    <ControlPanel
      title="Codex CRS 转发"
      eyebrow={<span className="inline-flex items-center gap-2"><KeyRound className="h-3.5 w-3.5" /> Single Key Relay</span>}
      meta="把 Codex OAuth 账号池收束成一个 OpenAI-compatible 入口，Codex Desktop 只需要配置一个 Muse CRS key。"
      action={<StatusTag tone={crs?.enabled ? 'success' : 'neutral'}>{loading ? '加载中' : crs?.enabled ? '已启用' : '未启用'}</StatusTag>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="候选账号" value={crs?.candidateCount ?? 0} meta={`${codexOauthCandidates} 个（与 Token 管理同源）`} />
            <MetricCard label="启用来源" value={form.enabledSources.length} meta={form.enabledSources.join(' / ')} />
            <MetricCard label="默认模型" value={form.defaultModel || '未设置'} meta="Codex 请求缺省模型" />
            <MetricCard label="Codex 配置" value={crs?.codexConfig?.mode === 'crs' ? 'CRS' : crs?.codexConfig?.mode === 'normal' ? '正常' : '缺失'} meta={crs?.codexConfig?.path || 'config.toml'} />
          </div>

          <Surface className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                aria-label="CRS 名称"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: (event.target as HTMLInputElement).value }))}
              />
              <TextInput
                aria-label="默认模型"
                value={form.defaultModel}
                placeholder="gpt-5.5"
                onChange={(event) => setForm((current) => ({ ...current, defaultModel: (event.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <TextInput
                aria-label="上游 Base URL"
                value={form.upstreamBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => setForm((current) => ({ ...current, upstreamBaseUrl: (event.target as HTMLInputElement).value }))}
              />
              <TextInput
                aria-label="超时毫秒"
                type="number"
                value={form.timeoutMs}
                onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number((event.target as HTMLInputElement).value) }))}
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <TextInput
                aria-label="上游 API Key"
                type="password"
                value={form.upstreamApiKey}
                placeholder={crs?.upstreamApiKeyMasked || '可选，优先使用 Codex OAuth 池'}
                onChange={(event) => setForm((current) => ({ ...current, upstreamApiKey: (event.target as HTMLInputElement).value }))}
              />
              <TextInput
                aria-label="自定义 CRS API Key"
                type="password"
                value={form.publicApiKey}
                placeholder={crs?.publicApiKeyMasked || '留空则保持当前 key'}
                onChange={(event) => setForm((current) => ({ ...current, publicApiKey: (event.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-3 text-sm text-muted-foreground">
                <Switch
                  checked={form.enabled}
                  disabled={saving}
                  onChange={() => setForm((current) => ({ ...current, enabled: !current.enabled }))}
                  aria-label="启用 CRS 转发"
                />
                启用 CRS 转发
              </label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleSource(item.key)}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      form.enabledSources.includes(item.key)
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background/70 text-muted-foreground hover:bg-secondary'
                    }`}
                    title={item.hint}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => load()} disabled={loading || saving} variant="secondary">
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button onClick={test} disabled={testing || !crs?.relayBaseUrl || !crs?.candidateCount} variant="secondary">
                  <ShieldCheck className="h-4 w-4" />
                  测试 CRS
                </Button>
                <Button onClick={rotateKey} disabled={saving} variant="outlined">
                  <RotateCcw className="h-4 w-4" />
                  轮换 Key
                </Button>
                <Button onClick={save} disabled={saving} variant="primary">
                  <CheckCircle2 className="h-4 w-4" />
                  保存
                </Button>
              </div>
            </div>
          </Surface>
        </div>

        <aside className="space-y-4">
          <Surface selected tone="primary" className="p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Codex Desktop 接入</div>
            <div className="mt-3 space-y-3 text-sm">
              <button
                onClick={() => copy(crs?.relayBaseUrl || '', 'Base URL')}
                disabled={!crs?.relayBaseUrl}
                className="w-full rounded-md border border-border bg-background/70 p-3 text-left disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Base URL</span>
                  <Copy className="h-3.5 w-3.5" />
                </div>
                <code className="mt-1 block break-all text-xs">{crs?.relayBaseUrl || '/api/crs/v1'}</code>
              </button>
              <button
                onClick={() => copy(`Bearer ${visiblePublicKey}`, 'Authorization')}
                disabled={!visiblePublicKey}
                className="w-full rounded-md border border-border bg-background/70 p-3 text-left disabled:opacity-50"
                title={visiblePublicKey ? '复制当前输入的完整 CRS Key' : '完整 Key 已隐藏；可输入自定义 Key 后复制，或使用已同步的 MUSE_CRS_API_KEY'}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Authorization</span>
                  <Copy className="h-3.5 w-3.5" />
                </div>
                <code className="mt-1 block break-all text-xs">Bearer {visiblePublicKey || crs?.publicApiKeyMasked || 'cr_...'}</code>
              </button>
            </div>
          </Surface>

          <Surface className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Routing</div>
                <div className="mt-1 text-sm font-medium text-foreground">候选来源</div>
              </div>
              <StatusTag>{crs?.candidateCount ?? 0}</StatusTag>
            </div>
            <CompactList className="max-h-64 space-y-2 overflow-auto">
              {(crs?.candidates || []).length === 0 ? (
                <Surface className="border-dashed p-4 text-xs text-muted-foreground">
                  还没有可用候选。优先添加 OpenAI Codex OAuth / Refresh Token 账号。
                </Surface>
              ) : crs?.candidates.map((candidate) => (
                <Surface key={`${candidate.source}-${candidate.id}`} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{candidate.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{candidate.baseUrl}</div>
                    </div>
                    <StatusTag tone={candidate.status === 'active' ? 'success' : 'neutral'}>{sourceLabel(candidate)}</StatusTag>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{candidate.model}</span>
                    <span>{candidate.source}:{candidate.id}</span>
                  </div>
                </Surface>
              ))}
            </CompactList>
          </Surface>

          <KeyValueGrid
            columns={2}
            items={[
              { label: '状态', value: crs?.enabled ? '已启用' : '未启用' },
              { label: '来源', value: form.enabledSources.join(', ') },
              { label: '更新', value: crs?.updatedAt || '暂无' },
              { label: '配置', value: crs?.codexConfig?.lastSyncedAt || '未同步' },
            ]}
          />
          {crs?.lastError ? (
            <Surface tone="danger" selected className="p-3 text-sm">
              {crs.lastError}
            </Surface>
          ) : null}
        </aside>
      </div>
    </ControlPanel>
  );
}
