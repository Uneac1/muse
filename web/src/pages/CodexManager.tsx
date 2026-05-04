import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  Activity,
  BarChart3,
  Clock3,
  ExternalLink,
  RotateCcw,
  Settings2,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ControlPage,
  ControlPanel,
  KeyValueGrid,
  SectionHeader,
} from '../components/layout/ControlCenter';
import type { CodexTokenManagementHandle } from '../components/codex/CodexTokenManagement';
import { Button, Slider, StatusTag, Surface, Switch, TextInput, toneTextClass } from '../components/ui/primitives';
import { codexApi } from '../lib/api';
import {
  buildCodexViewModel,
  bytesText,
  compactPath,
  formatTime,
  getRetryBlockInfo,
  tokenText,
} from '../lib/codexViewModel';
import type { CodexDesktopState, CodexUsageHistory, TokenAccountView } from '../types';

const AUTO_SWITCH_CHECK_INTERVAL_MS = 60_000;
const LazyCrsRelayPanel = lazy(() => import('../components/codex/CrsRelayPanel'));
const LazyCodexTokenManagement = lazy(() => import('../components/codex/CodexTokenManagement'));

function MiniLineChart({
  points,
  series,
  emptyText,
  suffix = '',
}: {
  points: Array<Record<string, any>>;
  series: Array<{ key: string; label: string; color: string }>;
  emptyText: string;
  suffix?: string;
}) {
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 28, bottom: 34, left: 46 };
  const values = points.flatMap((point) => series.map((item) => Number(point[item.key] || 0)));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (points.length <= 1 ? plotWidth : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - ((value - min) / span) * plotHeight;

  if (!points.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-[14px] border border-dashed border-border text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-background/60 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img">
        {[0, 0.5, 1].map((ratio) => {
          const lineY = padding.top + plotHeight * ratio;
          const label = Math.round(max - span * ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} stroke="currentColor" className="text-border" strokeWidth="1" />
              <text x={padding.left - 8} y={lineY + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{label}{suffix}</text>
            </g>
          );
        })}
        {series.map((item) => {
          const pathPoints = points.map((point, index) => `${x(index)},${y(Number(point[item.key] || 0))}`).join(' ');
          return (
            <g key={item.key}>
              <polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={pathPoints} />
              {points.map((point, index) => (
                <circle key={`${item.key}-${point.date}`} cx={x(index)} cy={y(Number(point[item.key] || 0))} r="3.5" fill={item.color} />
              ))}
            </g>
          );
        })}
        {points.map((point, index) => (
          <text key={point.date} x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[11px]">
            {String(point.date).slice(5)}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const roadmap = [
  {
    title: '批量注册',
    steps: ['准备长期邮箱/临时邮箱', '配置代理出口', '人工确认 OpenAI 注册链路', 'OAuth token 入库'],
    risk: '容易触发平台风控，第一版只保留步骤。',
  },
  {
    title: '巡检与补货',
    steps: ['定时同步额度', '筛出低额/失效账号', '标记待重登', '人工补充新账号'],
    risk: '补货不自动创建账号，避免把 Muse 变成高风险注册器。',
  },
  {
    title: 'NewAPI / CLIProxyAPI',
    steps: ['定义外部池字段', '映射账号状态', '只同步脱敏状态', '再考虑写回'],
    risk: '第三方池格式差异大，后续单独做适配。',
  },
];

function parseAmbiguousAccountIds(notes: string[]) {
  const ids = new Set<number>();
  notes.forEach((note) => {
    const match = note.match(/(?:ambiguous|collision):([0-9,]+)/i);
    if (!match) return;
    match[1].split(',').forEach((value) => {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    });
  });
  return ids;
}

function retryBlockMessage(account: TokenAccountView) {
  const retry = getRetryBlockInfo(account);
  if (!retry.blocked) return '';
  return `${account.name} 已进入退避保护，请在 ${retry.retryLabel} 后重试；当前页面输入不会被清空，也不会重复发起请求。`;
}

function autoSwitchReasonLabel(reason: CodexDesktopState['status']['autoSwitchPolicy']['userInterventionReason']) {
  if (reason === 'identity_ambiguous') return '身份歧义，等待确认';
  if (reason === 'low_confidence_match') return '低置信匹配，等待确认';
  if (reason === 'no_trusted_current_account') return '未识别可信当前账号';
  return '无需用户介入';
}

function LazyPanelFallback() {
  return (
    <div className="grid gap-4">
      <div className="h-20 animate-pulse rounded-md bg-secondary/70" />
      <div className="h-64 animate-pulse rounded-md bg-secondary/50" />
    </div>
  );
}

export default function CodexManager() {
  const [state, setState] = useState<CodexDesktopState | null>(null);
  const [history, setHistory] = useState<CodexUsageHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [backoffProtectionEnabled, setBackoffProtectionEnabled] = useState(true);
  const lastAutoSwitchNoticeKey = useRef('');
  const historyRequestId = useRef(0);
  const tokenManagementRef = useRef<CodexTokenManagementHandle>(null);
  const tokensSectionRef = useRef<HTMLElement>(null);
  const crsSectionRef = useRef<HTMLElement>(null);
  const analyticsSectionRef = useRef<HTMLElement>(null);
  const roadmapSectionRef = useRef<HTMLElement>(null);
  const view = useMemo(() => buildCodexViewModel(state, history), [state, history]);
  const ambiguousAccountIds = useMemo(() => parseAmbiguousAccountIds(state?.status.matchNotes || []), [state?.status.matchNotes]);
  const retryBlockedAccounts = useMemo(
    () => view.accountViews.filter((item) => getRetryBlockInfo(item.account).blocked),
    [view.accountViews]
  );

  const loadHistory = async (silent = true) => {
    const requestId = ++historyRequestId.current;
    if (!silent) setHistoryLoading(true);
    try {
      const nextHistory = await codexApi.history(30);
      if (historyRequestId.current === requestId) {
        setHistory(nextHistory);
      }
    } catch (error: any) {
      if (!silent) toast.error(error.message || '加载 Codex 趋势失败');
    } finally {
      if (historyRequestId.current === requestId) setHistoryLoading(false);
    }
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const nextState = await codexApi.status();
      setState(nextState);
      if (history) void loadHistory(true);
    } catch (error: any) {
      toast.error(error.message || '加载 Codex 区块失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    void loadHistory(false);
  }, []);

  useEffect(() => {
    if (!state?.settings.auto_switch_enabled) return undefined;
    let cancelled = false;

    const check = async () => {
      if (cancelled || busy || document.hidden) return;
      try {
        const next = await codexApi.autoSwitchCheck();
        if (cancelled) return;
        setState({
          status: next.status,
          settings: next.settings,
          accounts: next.accounts,
        });
        void loadHistory(true);

        if (next.autoSwitch && 'deferred' in next.autoSwitch) {
          const noticeKey = `deferred:${next.autoSwitch.currentTokenAccountId}:${next.autoSwitch.candidateTokenAccountId}`;
          if (lastAutoSwitchNoticeKey.current !== noticeKey) {
            lastAutoSwitchNoticeKey.current = noticeKey;
            toast.info('Codex 正在运行，自动切换已延后到下一轮检测');
          }
        } else if (next.autoSwitch && 'event' in next.autoSwitch) {
          const noticeKey = `switched:${next.autoSwitch.event.id}`;
          if (lastAutoSwitchNoticeKey.current !== noticeKey) {
            lastAutoSwitchNoticeKey.current = noticeKey;
            toast.success('已自动切换 Codex CRS 转发账号');
          }
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.warning(error.message || 'Codex 自动切换检测失败');
        }
      }
    };

    const timer = window.setInterval(check, AUTO_SWITCH_CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) void check();
    };
    const onFocus = () => {
      void check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [busy, state?.settings.auto_switch_enabled]);

  const activate = async (accountId: number, launch = false) => {
    const account = state?.accounts.find((item) => item.id === accountId);
    if (account && backoffProtectionEnabled) {
      const message = retryBlockMessage(account);
      if (message) {
        toast.warning(message);
        return;
      }
    }
    setBusy(`${accountId}:${launch ? 'launch' : 'activate'}`);
    try {
      await codexApi.activate({ tokenAccountId: accountId, launch });
      toast.success(launch ? '已切换账号并尝试打开 Codex CRS 转发' : '已切换 Codex CRS 转发账号');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || '账号激活失败');
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (strategy: 'next' | 'best') => {
    if (state?.status.matchAmbiguous) {
      toast.warning('当前账号匹配有歧义，请先在账号池中手动确认要激活的账号；不会自动绑定。');
      return;
    }
    const eligible = view.accountViews.filter((item) => item.account.status !== 'error' && (!backoffProtectionEnabled || !getRetryBlockInfo(item.account).blocked));
    const eligibleAlternatives = eligible.filter((item) => !item.isActive);
    const target = strategy === 'best'
      ? view.bestReplacement?.account || null
      : (() => {
        const currentIndex = eligible.findIndex((item) => item.isActive);
        if (!eligibleAlternatives.length) return null;
        if (currentIndex < 0) return eligibleAlternatives[0].account;
        return eligible[(currentIndex + 1) % eligible.length]?.account || eligibleAlternatives[0].account;
      })();
    if (!target || (backoffProtectionEnabled && getRetryBlockInfo(target).blocked)) {
      toast.warning('当前没有可轮换账号：候选账号可能已异常或处于退避保护，请稍后重试。');
      return;
    }
    await activate(target.id);
  };

  const toggleAutoSwitch = async () => {
    if (!state) return;
    setBusy('settings');
    try {
      const next = await codexApi.updateSettings({
        ...state.settings,
        auto_switch_enabled: state.settings.auto_switch_enabled ? 0 : 1,
      });
      setState({ ...state, settings: next });
      toast.success(next.auto_switch_enabled ? '低额度自动切换已开启' : '低额度自动切换已关闭');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || '保存设置失败');
    } finally {
      setBusy(null);
    }
  };

  const updateThreshold = async (value: number) => {
    if (!state) return;
    const threshold = Math.max(1, Math.min(99, value));
    setState({ ...state, settings: { ...state.settings, low_5h_threshold_pct: threshold } });
  };

  const saveThreshold = async () => {
    if (!state) return;
    setBusy('threshold');
    try {
      const next = await codexApi.updateSettings(state.settings);
      setState({ ...state, settings: next });
      toast.success('自动切换阈值已保存');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || '保存阈值失败');
    } finally {
      setBusy(null);
    }
  };

  const updateAutoSwitchLaunchMode = async (mode: CodexDesktopState['settings']['auto_switch_launch_mode']) => {
    if (!state || state.settings.auto_switch_launch_mode === mode) return;
    setBusy('auto-switch-launch-mode');
    try {
      const next = await codexApi.updateSettings({
        ...state.settings,
        auto_switch_launch_mode: mode,
      });
      setState({ ...state, settings: next });
      toast.success(mode === 'activate_and_open' ? '自动切换将激活并打开 Codex CRS 转发' : '自动切换将仅激活账号');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || '保存自动切换动作失败');
    } finally {
      setBusy(null);
    }
  };

  const restoreLast = async () => {
    const eventId = state?.status.lastActivation?.id;
    if (!eventId) return;
    setBusy('restore');
    try {
      await codexApi.restore(eventId);
      toast.success('已从最近一次备份恢复 auth.json');
      await load(true);
    } catch (error: any) {
      toast.error(error.message || '恢复失败');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !state) {
    return (
      <div className="grid gap-4">
        <div className="h-24 animate-pulse rounded-[18px] bg-secondary/70" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-56 animate-pulse rounded-[18px] bg-secondary/60 lg:col-span-2" />
          <div className="h-56 animate-pulse rounded-[18px] bg-secondary/50" />
        </div>
      </div>
    );
  }

  const scrollToSection = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const excludedFromTotalFiveHour =
    view.totalFiveHour.excludedWeeklyZero +
    view.totalFiveHour.excludedOfficialRejected +
    view.totalFiveHour.excludedNoFiveHour;

  return (
    <ControlPage>
      <section ref={crsSectionRef} className="scroll-mt-6">
        <Suspense fallback={<LazyPanelFallback />}>
          <LazyCrsRelayPanel />
        </Suspense>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <ControlPanel
          title="低额度自动切换"
          eyebrow="Automation"
          meta={`低于 ${state.settings.low_5h_threshold_pct}% 时触发候选账号判断`}
          action={
            <Button onClick={() => scrollToSection(tokensSectionRef)} variant="outlined" className="px-3 py-2 text-xs">
              <Settings2 className="h-4 w-4" />
              账户管理
            </Button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Surface className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  自动切换
                  <Switch checked={Boolean(state.settings.auto_switch_enabled)} disabled={busy === 'settings'} onChange={toggleAutoSwitch} aria-label="切换自动低额度轮换" />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  退避保护
                  <Switch checked={backoffProtectionEnabled} onChange={() => setBackoffProtectionEnabled((current) => !current)} aria-label="切换退避保护" />
                </label>
                <Button onClick={() => updateAutoSwitchLaunchMode('activate_only')} disabled={busy === 'auto-switch-launch-mode'} variant={state.settings.auto_switch_launch_mode === 'activate_only' ? 'primary' : 'secondary'} className="px-3 py-2 text-xs">仅激活</Button>
                <Button onClick={() => updateAutoSwitchLaunchMode('activate_and_open')} disabled={busy === 'auto-switch-launch-mode'} variant={state.settings.auto_switch_launch_mode === 'activate_and_open' ? 'primary' : 'secondary'} className="px-3 py-2 text-xs">激活并打开</Button>
              </div>
              <div className="mt-4 grid grid-cols-[auto_minmax(120px,1fr)_76px_auto] items-center gap-3">
                <span className="text-xs text-muted-foreground">阈值</span>
                <Slider min={1} max={99} value={state.settings.low_5h_threshold_pct} onChange={updateThreshold} className="w-full" />
                <TextInput type="number" min={1} max={99} value={state.settings.low_5h_threshold_pct} onChange={(event) => updateThreshold(Number(event.target.value))} className="w-[76px] px-2 py-1 text-xs" />
                <Button onClick={saveThreshold} disabled={busy === 'threshold'} variant="primary" className="px-3 py-2 text-xs">保存</Button>
              </div>
            </Surface>
            <div className="grid gap-3">
              <Surface className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">总额度</div>
                    <div className="mt-2 text-3xl font-semibold text-foreground">{view.totalFiveHour.total}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      5 小时总池 · {view.totalFiveHour.count} 个账号计入
                    </div>
                  </div>
                  <StatusTag tone={view.totalFiveHour.total > 0 ? 'primary' : 'warning'}>
                    {excludedFromTotalFiveHour} 个排除
                  </StatusTag>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
                  <div className="rounded-md border border-border bg-background/60 px-2 py-2">
                    <div className="font-semibold text-foreground">{view.totalFiveHour.excludedWeeklyZero}</div>
                    周额度 0
                  </div>
                  <div className="rounded-md border border-border bg-background/60 px-2 py-2">
                    <div className="font-semibold text-foreground">{view.totalFiveHour.excludedOfficialRejected}</div>
                    官方拒绝
                  </div>
                  <div className="rounded-md border border-border bg-background/60 px-2 py-2">
                    <div className="font-semibold text-foreground">{view.totalFiveHour.excludedNoFiveHour}</div>
                    未同步
                  </div>
                </div>
              </Surface>
              <KeyValueGrid
                columns={2}
                items={[
                  { label: '策略状态', value: state.status.autoSwitchPolicy.enabled ? '已启用' : '已关闭' },
                  { label: '运行保护', value: state.status.autoSwitchPolicy.protectedRunning ? '已延后' : '未拦截' },
                  { label: '人工介入', value: autoSwitchReasonLabel(state.status.autoSwitchPolicy.userInterventionReason) },
                  { label: '失败冷却', value: `${state.status.autoSwitchPolicy.failureCooldownMinutes} 分钟` },
                ]}
              />
            </div>
          </div>
        </ControlPanel>

        <ControlPanel
          title="本机状态"
          eyebrow="Local"
          meta={compactPath(state.status.codexHome)}
          action={
            <Button onClick={restoreLast} disabled={!!busy || !state.status.lastActivation?.backup_auth_path} variant="outlined" className="px-3 py-2 text-xs">
              <RotateCcw className="h-4 w-4" />
              恢复备份
            </Button>
          }
        >
          <KeyValueGrid
            columns={2}
            items={[
              { label: '当前账号', value: view.activeAccount?.name || state.status.currentEmail || '未匹配' },
              { label: '登录标识', value: view.activeAccount?.login_hint || state.status.currentAccountId || '未识别' },
              { label: 'auth.json', value: <span className={state.status.authExists ? 'text-primary' : 'text-destructive'}>{state.status.authExists ? '存在' : '缺失'}</span> },
              { label: 'sessions', value: <span className={state.status.sessionsExists ? 'text-primary' : 'text-destructive'}>{state.status.sessionsExists ? '保留' : '未找到'}</span> },
              { label: '快照时间', value: formatTime(view.activeAccount?.snapshot?.fetchedAt) },
              { label: '匹配来源', value: state.status.matchSource || '未识别' },
            ]}
          />
        </ControlPanel>
      </section>

      {state.status.matchAmbiguous ? (
        <Surface tone="warning" selected className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldAlert className="h-4 w-4 text-accent" />
                账号匹配有歧义，已停止自动绑定
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                当前 auth.json 的身份线索可能命中多个账号。请在账号池中手动选择要激活的账号；刷新和查看状态不会改写本机登录文件。
              </div>
              {state.status.matchNotes.length ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  后端线索：{state.status.matchNotes.join(' / ')}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              {view.accounts
                .filter((account) => ambiguousAccountIds.size === 0 || ambiguousAccountIds.has(account.id))
                .slice(0, 4)
                .map((account) => (
                  <Button
                    key={account.id}
                    onClick={() => activate(account.id)}
                    disabled={!!busy || getRetryBlockInfo(account).blocked}
                    className="px-3 py-2 text-xs"
                  >
                    确认 {account.name}
                  </Button>
                ))}
            </div>
          </div>
        </Surface>
      ) : null}

      {retryBlockedAccounts.length ? (
        <Surface tone="warning" selected className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock3 className="h-4 w-4 text-accent" />
                {retryBlockedAccounts.length} 个账号处于退避保护
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                页面会保留当前阈值等输入，并阻止这些账号重复发起切换请求。到达下次重试时间后刷新状态即可继续。
              </div>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground lg:min-w-64">
              {retryBlockedAccounts.slice(0, 3).map(({ account }) => (
                <div key={account.id} className="rounded-md border border-border bg-background/60 px-3 py-2">
                  {account.name} · 下次重试 {getRetryBlockInfo(account).retryLabel}
                </div>
              ))}
            </div>
          </div>
          <label className="mt-3 inline-flex items-center gap-3 text-sm text-muted-foreground">
            <Switch
              checked={backoffProtectionEnabled}
              onChange={() => setBackoffProtectionEnabled((current) => !current)}
              aria-label="启用退避保护"
            />
            启用退避保护（关闭后可手动强制切换）
          </label>
        </Surface>
      ) : null}

      <SectionHeader
        title="详细配置"
        eyebrow="Page sections"
        meta="下方区块全部留在页面内，不再使用抽屉覆盖层。"
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => scrollToSection(tokensSectionRef)} variant="outlined" className="px-3 py-2 text-xs">
              <WalletCards className="h-4 w-4" />
              Token
            </Button>
            <Button onClick={() => scrollToSection(crsSectionRef)} variant="outlined" className="px-3 py-2 text-xs">
              <Settings2 className="h-4 w-4" />
              CRS
            </Button>
            <Button onClick={() => scrollToSection(analyticsSectionRef)} variant="outlined" className="px-3 py-2 text-xs">
              <BarChart3 className="h-4 w-4" />
              趋势
            </Button>
            <Button onClick={() => scrollToSection(roadmapSectionRef)} variant="quiet" className="px-3 py-2 text-xs">
              <Clock3 className="h-4 w-4" />
              路线图
            </Button>
          </div>
        }
      />

      <section ref={tokensSectionRef} className="scroll-mt-6">
        <Suspense fallback={<LazyPanelFallback />}>
          <LazyCodexTokenManagement
            ref={tokenManagementRef}
            activeAccountId={state.status.matchedTokenAccountId}
            activatingAccountId={busy && /^\d+:/.test(busy) ? Number(busy.split(':')[0]) : null}
            onActivateAccount={(account, launch) => activate(account.id, launch)}
            onAccountsChanged={() => load(true)}
          />
        </Suspense>
      </section>

      <section ref={analyticsSectionRef} className="scroll-mt-6">
        <section className="grid gap-4 xl:grid-cols-2">
          <ControlPanel
            title="额度趋势"
            eyebrow="Trend"
            meta={historyLoading ? '正在读取趋势数据' : '按 Token 同步快照'}
            action={<BarChart3 className="h-5 w-5 text-primary" />}
          >
              <MiniLineChart
                points={view.quotaTrendPoints}
                suffix="%"
                emptyText="还没有额度快照。同步 Token 后会开始沉淀趋势。"
                series={[
                  { key: 'weeklyRemaining', label: '总周额度剩余', color: 'var(--primary)' },
                  { key: 'weeklyUsed', label: '每日周额度减少', color: 'var(--destructive)' },
                ]}
              />
          </ControlPanel>

          <ControlPanel
            title="使用趋势"
            eyebrow="Usage"
            meta={historyLoading ? '正在读取本地 session' : '按 session token_count'}
            action={<Activity className="h-5 w-5 text-primary" />}
          >
            <div className="mt-4 space-y-3">
              <MiniLineChart
                points={view.sessionTokenTrendPoints}
                emptyText="没有读到 session token_count，切换功能不受影响。"
                series={[
                  { key: 'totalTokens', label: '总 tokens', color: 'var(--primary)' },
                  { key: 'inputTokens', label: '输入 tokens', color: 'var(--accent)' },
                  { key: 'outputTokens', label: '输出 + reasoning', color: 'var(--destructive)' },
                ]}
              />
              {view.latestLocalUsage && (
                <div className="pt-2 text-xs text-muted-foreground">
                  今日 session：{view.latestLocalUsage.sessionCount} 会话 · {tokenText(view.latestLocalUsage.totalTokens)} tokens · {bytesText(view.latestLocalUsage.byteCount)}
                </div>
              )}
            </div>
          </ControlPanel>
        </section>
      </section>

      <section ref={roadmapSectionRef} className="scroll-mt-6">
        <ControlPanel title="后续路线图" eyebrow="Roadmap" action={<Clock3 className="h-5 w-5 text-muted-foreground" />}>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {roadmap.map((item) => (
              <Surface key={item.title}>
                <div className="font-medium text-foreground">{item.title}</div>
                <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {item.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
                </ol>
                <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent">
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {item.risk}
                </div>
              </Surface>
            ))}
          </div>
        </ControlPanel>
      </section>

    </ControlPage>
  );
}
