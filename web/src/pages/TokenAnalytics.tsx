import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CirclePlus, Database, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import TokenAccountDialog from '../components/tokens/TokenAccountDialog';
import { tokenApi } from '../lib/api';
import type { TokenAccountView, TokenAnalyticsSnapshot } from '../types';

type TabKey = 'usage' | 'review' | 'raw';
type RangeKey = '7d' | '30d' | 'custom';
type GroupingKey = 'day' | 'week' | 'month';

function formatTime(value?: string | null) {
  if (!value) return '尚未同步';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function parseRaw(snapshot: TokenAnalyticsSnapshot | null) {
  if (!snapshot?.textDigest) return null;
  try {
    return JSON.parse(snapshot.textDigest) as Record<string, any>;
  } catch {
    return null;
  }
}

function remainPct(used?: number | null) {
  if (typeof used !== 'number') return null;
  return Math.max(0, 100 - Math.round(used));
}

function valueText(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value == null || value === '') return '—';
  return String(value);
}

function tone(toneName?: string) {
  if (toneName === 'red') return ['text-red-600 dark:text-red-300', 'bg-red-500'];
  if (toneName === 'green') return ['text-emerald-600 dark:text-emerald-300', 'bg-emerald-500'];
  if (toneName === 'amber') return ['text-amber-600 dark:text-amber-300', 'bg-amber-500'];
  if (toneName === 'blue') return ['text-sky-600 dark:text-sky-300', 'bg-sky-500'];
  return ['text-zinc-700 dark:text-zinc-200', 'bg-zinc-500'];
}

function Stat({ label, value, hint }: { label: string; value: unknown; hint?: string }) {
  return (
    <div className="rounded-[22px] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{valueText(value)}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  );
}

export default function TokenAnalytics() {
  const [accounts, setAccounts] = useState<TokenAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TokenAccountView | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>('usage');
  const [range, setRange] = useState<RangeKey>('7d');
  const [grouping, setGrouping] = useState<GroupingKey>('day');

  const totalCards = useMemo(() => accounts.reduce((sum, item) => sum + (item.snapshot?.cards.length || 0), 0), [accounts]);
  const activeAccounts = useMemo(() => accounts.filter((item) => item.status === 'active').length, [accounts]);
  const account = useMemo(() => accounts.find((item) => item.id === selectedId) || accounts[0] || null, [accounts, selectedId]);
  const snapshot = account?.snapshot || null;
  const raw = useMemo(() => parseRaw(snapshot), [snapshot]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await tokenApi.listAccounts();
      setAccounts(list);
      setSelectedId((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id || null));
    } catch (error: any) {
      toast.error(error.message || '加载额度账号失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (payload: Partial<TokenAccountView>) => {
    try {
      if (editingAccount) {
        await tokenApi.updateAccount(editingAccount.id, payload);
        toast.success('额度账号已更新');
      } else {
        await tokenApi.createAccount(payload);
        toast.success('额度账号已添加');
      }
      await load();
    } catch (error: any) {
      toast.error(error.message || '保存额度账号失败');
      throw error;
    }
  };

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      await tokenApi.syncAccount(id);
      await load();
      toast.success('同步完成');
    } catch (error: any) {
      toast.error(error.message || '同步失败');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      await tokenApi.syncAll();
      await load();
      toast.success('全部账号已同步');
    } catch (error: any) {
      toast.error(error.message || '批量同步失败');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDelete = async (item: TokenAccountView) => {
    if (!confirm(`确定删除额度账号“${item.name}”吗？`)) return;
    try {
      await tokenApi.deleteAccount(item.id);
      await load();
      toast.success('已删除');
    } catch (error: any) {
      toast.error(error.message || '删除失败');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-zinc-200/70 bg-white/90 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/70 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
              <BarChart3 className="h-3.5 w-3.5" />
              Token Analytics
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">官方额度与分析工作台</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">把你已经同步到的官方字段全量展开：余额窗口、账户状态、代码审查、credits、spend control、产品活动占位区、原始快照都在这里。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="账号数" value={accounts.length} />
            <Stat label="活跃账号" value={activeAccounts} />
            <Stat label="快照卡片" value={totalCards} />
            <button
              onClick={() => {
                setEditingAccount(null);
                setDialogOpen(true);
              }}
              className="rounded-[22px] bg-zinc-950 px-4 py-4 text-left text-white transition hover:bg-zinc-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
            >
              <div className="inline-flex items-center gap-2 text-sm font-medium"><CirclePlus className="h-4 w-4" />新增账号</div>
              <div className="mt-2 text-xs opacity-75">OAuth / API / 手动 / Session</div>
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">账户管理</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">压缩成紧凑视图，一行最多 5 个账户。</div>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || loading || accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 ${syncingAll ? 'animate-spin' : ''}`} />
            全部同步
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, idx) => <div key={idx} className="h-36 animate-pulse rounded-[24px] bg-zinc-100 dark:bg-zinc-900" />)}
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">还没有额度账号，先新增一个。</div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {accounts.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-[24px] border p-3 text-left transition ${account?.id === item.id ? 'border-cyan-300 bg-cyan-50/80 dark:border-cyan-700 dark:bg-cyan-950/20' : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">{item.provider_label}</div>
                      <div className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{item.name}</div>
                    </div>
                    <div className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{item.status}</div>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <div>同步：{formatTime(item.last_synced_at)}</div>
                    <div>方式：{item.auth_method}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleSync(item.id);
                      }}
                      disabled={syncingId === item.id}
                      className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncingId === item.id ? 'animate-spin' : ''}`} />
                      同步
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingAccount(item);
                        setDialogOpen(true);
                      }}
                      className="rounded-xl border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      编辑
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(item);
                      }}
                      className="rounded-xl border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {item.last_error && <div className="mt-2 line-clamp-2 rounded-2xl border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{item.last_error}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
          {!account ? (
            <section className="rounded-[28px] border border-dashed border-zinc-300 bg-white/90 p-10 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-400">先新增并选中一个额度账号。</section>
          ) : (
            <>
              <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-zinc-400 dark:text-zinc-500">{account.provider_label}</div>
                    <h2 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{snapshot?.pageTitle || account.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">账号：{account.name}</span>
                      <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">方式：{account.auth_method}</span>
                      <span className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">最近同步：{formatTime(account.last_synced_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['usage', '使用情况'],
                        ['review', '代码审查'],
                        ['raw', '原始数据'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setTab(key as TabKey)}
                          className={`rounded-2xl px-4 py-2.5 text-sm transition ${tab === key ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950' : 'border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        ['7d', '7天'],
                        ['30d', '1个月'],
                        ['custom', '自定义'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setRange(key as RangeKey)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${range === key ? 'border-zinc-950 bg-zinc-950 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-zinc-950' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
                        >
                          {label}
                        </button>
                      ))}

                      <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                        <span>分组方式：</span>
                        <div className="flex items-center gap-1">
                          {[
                            ['day', '天'],
                            ['week', '周'],
                            ['month', '月'],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => setGrouping(key as GroupingKey)}
                              className={`rounded-full px-2 py-0.5 transition ${grouping === key ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {tab !== 'raw' && (
                <>
                  <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                    <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">余额</div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      {(snapshot?.cards || []).length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 xl:col-span-2">当前账号还没有同步到额度卡片。</div>
                      ) : snapshot?.cards.map((card) => {
                        const [textClass, barClass] = tone(card.tone);
                        return (
                          <div key={card.key} className="rounded-[24px] border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-sm text-zinc-500 dark:text-zinc-400">{card.label}</div>
                            <div className={`mt-2 text-3xl font-semibold ${textClass}`}>{card.remainingPct == null ? '—' : `${card.remainingPct}%`}</div>
                            <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{card.remainingText}</div>
                            <div className="mt-4 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className={`h-3 rounded-full ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, card.remainingPct || 0))}%` }} /></div>
                            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{card.resetLabel}</div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">官方账户状态</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Stat label="Plan" value={raw?.plan_type} />
                        <Stat label="Allowed" value={raw?.rate_limit?.allowed} />
                        <Stat label="Account ID" value={raw?.account_id || account.external_account_id} />
                        <Stat label="Email" value={raw?.email || account.login_hint} />
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Credits 与风控</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Stat label="Primary Remain" value={remainPct(raw?.rate_limit?.primary_window?.used_percent)} />
                        <Stat label="Weekly Remain" value={remainPct(raw?.rate_limit?.secondary_window?.used_percent)} />
                        <Stat label="Has Credits" value={raw?.credits?.has_credits} />
                        <Stat label="Unlimited" value={raw?.credits?.unlimited} />
                        <Stat label="Balance" value={raw?.credits?.balance} />
                        <Stat label="Spend Control" value={raw?.spend_control?.reached ? 'Reached' : raw?.spend_control?.reached === false ? 'OK' : '—'} />
                      </div>
                      <div className="mt-3 rounded-[22px] border border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                        rate_limit_reached_type：{valueText(raw?.rate_limit_reached_type?.type)}
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">使用详情</div>
                      <div className="mt-4 space-y-3">
                        {(snapshot?.usageSections || []).length > 0 ? snapshot?.usageSections.map((section) => (
                          <div key={section.title} className="rounded-[22px] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{section.title}</div>
                            {section.subtitle && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{section.subtitle}</div>}
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {section.series.map((series) => (
                                <div key={series.label} className="rounded-[18px] border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/70">
                                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{series.label}</div>
                                  <div className="mt-3 space-y-2">
                                    {series.points.map((point) => (
                                      <div key={`${series.label}-${point.label}`} className="flex items-start justify-between gap-3 text-sm">
                                        <div className="text-zinc-500 dark:text-zinc-400">{point.label}</div>
                                        <div className="text-right">
                                          <div className="font-medium text-zinc-950 dark:text-zinc-50">{point.value == null ? '—' : point.value}</div>
                                          {point.hint && <div className="text-xs text-zinc-500 dark:text-zinc-400">{point.hint}</div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )) : <div className="rounded-[22px] border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">当前快照没有结构化使用序列。</div>}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">代码审查 / 产品活动 / 技能</div>
                      <div className="mt-4 space-y-3">
                        <Stat label="Code Review" value={raw?.code_review_rate_limit ? '已返回结构' : '当前为 null'} />
                        <Stat label="Additional Limits" value={raw?.additional_rate_limits ? '已返回结构' : '当前为空'} />
                        <Stat label="threads" value="—" hint="当前官方额度接口未返回最近 30 天趋势" />
                        <Stat label="turns" value="—" hint="当前官方额度接口未返回最近 30 天趋势" />
                        <div className="rounded-[22px] border border-zinc-200 bg-zinc-50/70 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                          Skills from your repositories are only visible to workspace admins。当前快照没有技能明细，所以这里保留官方版位和状态提示。
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {tab === 'raw' && (
                <section className="space-y-6">
                  <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                    <div className="flex items-center gap-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50"><Database className="h-5 w-5" />官方原始快照</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Stat label="Source URL" value={snapshot?.sourceUrl} />
                      <Stat label="Final URL" value={snapshot?.finalUrl} />
                      <Stat label="Fetched At" value={formatTime(snapshot?.fetchedAt || null)} />
                      <Stat label="Signals" value={snapshot?.rawSignals.join(' / ')} />
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
                    <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">结构化 JSON</div>
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">{JSON.stringify(raw || snapshot?.textDigest || '暂无快照', null, 2)}</pre>
                  </div>
                </section>
              )}
            </>
          )}
      </section>

      <TokenAccountDialog open={dialogOpen} account={editingAccount} onClose={() => setDialogOpen(false)} onSave={handleSave} />
    </div>
  );
}
