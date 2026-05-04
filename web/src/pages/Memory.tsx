import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpenText,
  BrainCircuit,
  CheckCircle2,
  Database,
  Plus,
  RefreshCw,
  Sparkles,
  Wand2,
  Workflow,
} from 'lucide-react';
import { osApi } from '../lib/api';
import { useOsWorkspace } from '../components/os/useOsWorkspace';
import type { AgentRuntimeMemoryState, PersonalMemoryAiPlan, PersonalMemoryIngestionState } from '../types';

export default function Memory() {
  const { data, loading, error, reload } = useOsWorkspace();
  const [saving, setSaving] = useState(false);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [runtimeMemory, setRuntimeMemory] = useState<AgentRuntimeMemoryState | null>(null);
  const [ingestion, setIngestion] = useState<PersonalMemoryIngestionState | null>(null);
  const [aiPlan, setAiPlan] = useState<PersonalMemoryAiPlan | null>(null);
  const [operationError, setOperationError] = useState('');
  const [focus, setFocus] = useState('把今天 Inbox、报纸、账号异常里值得长期保留的偏好、项目、风险和约束整理成 AI 记忆。');

  const pinned = useMemo(() => data?.memory.filter((item) => item.is_pinned) || [], [data]);
  const activeMemory = useMemo(() => data?.memory.filter((item) => !item.is_resolved) || [], [data]);

  const loadRuntimeState = async () => {
    try {
      const [memoryState, ingestionState] = await Promise.all([
        osApi.getAgentMemoryState(),
        osApi.getMemoryIngestion(),
      ]);
      setRuntimeMemory(memoryState);
      setIngestion(ingestionState);
      setOperationError('');
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'AI 记忆状态加载失败');
    }
  };

  useEffect(() => {
    loadRuntimeState();
  }, []);

  const runAiMemoryPlan = async () => {
    setAiPlanning(true);
    setOperationError('');
    try {
      const plan = await osApi.aiManageMemory({ focus });
      setAiPlan(plan);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'AI 记忆整理失败');
    } finally {
      setAiPlanning(false);
    }
  };

  const applyAiPlan = async () => {
    if (!aiPlan?.suggestions.length) return;
    setAiApplying(true);
    setOperationError('');
    try {
      await osApi.applyAiMemoryPlan({ suggestions: aiPlan.suggestions });
      setAiPlan(null);
      await Promise.all([reload(), loadRuntimeState()]);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'AI 记忆写入失败');
    } finally {
      setAiApplying(false);
    }
  };

  const runIngestion = async () => {
    setSaving(true);
    setOperationError('');
    try {
      const next = await osApi.runMemoryIngestion();
      setIngestion(next);
      await reload();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : '记忆摄取运行失败');
    } finally {
      setSaving(false);
    }
  };

  const compactMemory = async () => {
    setSaving(true);
    setOperationError('');
    try {
      const next = await osApi.compactAgentMemory();
      setRuntimeMemory(next);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'AI 记忆压缩失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">正在加载 AI 记忆...</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">{error || '加载失败'}</div>;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-16">
      <section className="rounded-[28px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)] px-3 py-1 text-xs text-muted-foreground">
              <BrainCircuit className="h-3.5 w-3.5" />
              AI Memory
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">AI 的长期记忆库</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Memory 记录的是 AI 会在 Today、Inbox、报纸导读和执行流程里复用的长期记忆：偏好、项目背景、风险、约束和已经确认的判断。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await osApi.createMemory({
                    title: '新的 AI 记忆',
                    content: '记录一条 AI 下次整理汇报时必须记住的偏好、项目背景、风险或约束。',
                    kind: 'preference',
                    tags: ['AI记忆'],
                    source: 'manual',
                    is_pinned: 1,
                  });
                  await reload();
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              手动写入 AI 记忆
            </button>
            <button
              disabled={saving}
              onClick={runIngestion}
              className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)] px-4 py-2 text-sm disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              立即摄取
            </button>
          </div>
        </div>
      </section>

      {operationError && (
        <div className="flex items-start gap-3 rounded-[18px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{operationError}</span>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Database} label="AI 记忆总数" value={`${activeMemory.length}`} />
        <MetricTile icon={Sparkles} label="置顶记忆" value={`${pinned.length}`} />
        <MetricTile icon={BrainCircuit} label="Runtime 长期记忆" value={`${runtimeMemory?.totals.active.longTerm ?? 0}`} />
        <MetricTile icon={Archive} label="待压缩事件" value={`${runtimeMemory?.totals.pendingCompaction ?? 0}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
                <Wand2 className="h-5 w-5" />
                AI 整理记忆
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">让真实 AI 从当前工作区里提出要新增、更新或归档的记忆。</p>
            </div>
            <button
              disabled={aiPlanning}
              onClick={runAiMemoryPlan}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {aiPlanning ? 'AI 整理中' : '生成 AI 记忆计划'}
            </button>
          </div>
          <textarea
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            className="mt-4 min-h-24 w-full rounded-[18px] border border-[color:var(--outline-variant)] bg-background p-4 text-sm leading-6 outline-none focus:border-primary"
          />
          {aiPlan && (
            <div className="mt-5 rounded-[18px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{aiPlan.summary}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {aiPlan.accountName} · {aiPlan.model}{aiPlan.usedFallback ? ` · 已自动切换 AI 账号：${aiPlan.fallbackReason || '原账号不可用'}` : ''}
                  </div>
                </div>
                <button
                  disabled={aiApplying || aiPlan.suggestions.length === 0}
                  onClick={applyAiPlan}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)] px-4 py-2 text-sm disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  应用全部
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {aiPlan.suggestions.map((item, index) => (
                  <div key={`${item.type}-${item.target_id || index}-${item.title}`} className="rounded-[16px] border border-[color:var(--outline-variant)] bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-1 text-[11px] uppercase text-muted-foreground">{item.type}</span>
                      <span className="rounded-full bg-secondary px-2 py-1 text-[11px] uppercase text-muted-foreground">{item.kind}</span>
                    </div>
                    <div className="mt-3 font-medium text-foreground">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.content}</p>
                    <p className="mt-3 text-xs text-muted-foreground">原因：{item.reason}</p>
                  </div>
                ))}
                {aiPlan.suggestions.length === 0 && (
                  <div className="rounded-[16px] border border-[color:var(--outline-variant)] p-4 text-sm text-muted-foreground">
                    AI 没有发现需要写入或更新的记忆。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
                  <Database className="h-5 w-5" />
                  AI 记忆摄取
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">把工作区信号沉淀为 AI 后续可用的记忆。</p>
              </div>
              <button
                disabled={saving}
                onClick={loadRuntimeState}
                className="rounded-2xl border border-[color:var(--outline-variant)] px-3 py-2 text-sm disabled:opacity-60"
              >
                刷新
              </button>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <InfoRow label="状态" value={ingestion?.config.enabled ? '已启用' : '未启用'} />
              <InfoRow label="焦点" value={ingestion?.config.focus || '未配置'} />
              <InfoRow label="最近运行" value={ingestion?.latestRun?.summary || '暂无记录'} />
              <InfoRow label="下次运行" value={ingestion?.config.nextRunAt || '未计划'} />
            </div>
          </div>

          <div className="rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
                  <Archive className="h-5 w-5" />
                  Runtime 记忆压缩
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">把短期事件压缩成更稳定的 AI 长期记忆。</p>
              </div>
              <button
                disabled={saving}
                onClick={compactMemory}
                className="rounded-2xl border border-[color:var(--outline-variant)] px-3 py-2 text-sm disabled:opacity-60"
              >
                压缩
              </button>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <InfoRow label="短期记忆" value={`${runtimeMemory?.totals.active.shortTerm ?? 0}`} />
              <InfoRow label="长期记忆" value={`${runtimeMemory?.totals.active.longTerm ?? 0}`} />
              <InfoRow label="技能记忆" value={`${runtimeMemory?.totals.active.skills ?? 0}`} />
              <InfoRow label="画像记忆" value={`${runtimeMemory?.totals.active.profile ?? 0}`} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
            <BookOpenText className="h-5 w-5" />
            已写入的 AI 记忆
          </h2>
          <span className="text-sm text-muted-foreground">{data.memory.length} 条</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.memory.map((item) => (
            <div key={item.id} className="min-w-0 rounded-[24px] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.kind} · {item.source}</div>
                </div>
                <button
                  onClick={async () => {
                    await osApi.updateMemory(item.id, { is_pinned: item.is_pinned ? 0 : 1 });
                    await reload();
                  }}
                  className="rounded-2xl border border-border px-4 py-2 text-sm"
                >
                  {item.is_pinned ? '取消置顶' : '置顶'}
                </button>
              </div>
              <div className="mt-4 text-sm leading-6 text-muted-foreground">{item.content}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
              <Workflow className="h-5 w-5" />
              规则会影响 AI 记忆进入 Today 的方式
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Rules 是 AI 记忆和 Today 汇报的触发条件，不是普通笔记。</p>
          </div>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await osApi.createRule({
                name: '新 AI 记忆规则',
                description: '命中特定新闻、邮件或账号状态时进入 AI 记忆候选。',
                scope: 'today',
                trigger_type: 'keyword_in_news',
                config: { keyword: 'security' },
                is_enabled: 1,
              });
              await reload();
              setSaving(false);
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--outline-variant)] px-4 py-2 text-sm disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            新增规则
          </button>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.rules.map((rule) => (
            <div key={rule.id} className="min-w-0 rounded-[24px] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-medium text-foreground">{rule.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{rule.description}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">{rule.trigger_type} · {rule.scope}</div>
                </div>
                <button
                  onClick={async () => {
                    await osApi.updateRule(rule.id, { is_enabled: rule.is_enabled ? 0 : 1 });
                    await reload();
                  }}
                  className="rounded-2xl border border-border px-4 py-2 text-sm"
                >
                  {rule.is_enabled ? '停用' : '启用'}
                </button>
              </div>
              <pre className="mt-4 max-h-52 overflow-auto rounded-[18px] bg-background p-4 text-xs text-muted-foreground">{JSON.stringify(rule.config, null, 2)}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-4 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-[color:var(--surface-container-low)] p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-foreground">{value}</div>
    </div>
  );
}
