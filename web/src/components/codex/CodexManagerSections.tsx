import { ArrowRight, BarChart3, Clock3, PanelRightOpen, RefreshCw, RotateCcw, Settings2, ShieldAlert, ShieldCheck, TerminalSquare, ToggleRight, WalletCards } from 'lucide-react';
import { Button, Slider, StatusTag, Surface, Switch, TextInput, toneTextClass } from '../ui/primitives';
import {
  compactPath,
  formatTime,
  getRetryBlockInfo,
  quotaText,
  quotaTone,
  type CodexAccountView,
  type CodexPrimaryTask,
} from '../../lib/codexViewModel';
import type { CodexDesktopState, TokenAccountView, TokenQuotaCard } from '../../types';

export function CodexFocusBar({
  task,
  busy,
  onRunPrimary,
  onRefresh,
  onRotateNext,
}: {
  task: CodexPrimaryTask;
  busy: boolean;
  onRunPrimary: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onRotateNext: () => void | Promise<void>;
}) {
  return (
    <Surface className="p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <TerminalSquare className="h-3.5 w-3.5" />
            Codex
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-foreground">{task.headline}</div>
          <div className="mt-1 line-clamp-1 text-sm text-muted-foreground">{task.summary}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button onClick={onRunPrimary} disabled={busy} variant={task.action === 'open_tokens' ? 'filled' : 'primary'} className="px-3 py-2 text-xs">
            {task.action === 'rotate_best' ? <ShieldCheck className="h-4 w-4" /> : task.action === 'activate_best' || task.action === 'open_tokens' ? <ArrowRight className="h-4 w-4" /> : task.action === 'toggle_auto_switch' ? <ToggleRight className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {task.actionLabel}
          </Button>
          <Button onClick={onRefresh} disabled={busy} className="px-3 py-2 text-xs">
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button onClick={onRotateNext} disabled={busy} variant="quiet" className="px-3 py-2 text-xs">
            <RotateCcw className="h-4 w-4" />
            下一个
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        {task.facts.map((item) => (
          <StatusTag key={item.label} tone={item.tone || 'neutral'} className="gap-2">
            <span className="opacity-70">{item.label}</span>
            <span>{item.value}</span>
          </StatusTag>
        ))}
        {task.secondaryLabel ? (
          <StatusTag tone="warning" className="gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            {task.secondaryLabel}
          </StatusTag>
        ) : null}
      </div>
    </Surface>
  );
}

export function CodexAutomationPanel({
  state,
  activeAccount,
  activeFiveHour,
  activeWeekly,
  totalFiveHour,
  backoffProtectionEnabled,
  busy,
  onToggleBackoff,
  onToggleAutoSwitch,
  onSetLaunchMode,
  onUpdateThreshold,
  onSaveThreshold,
  onRestoreLast,
  onOpenCrs,
  autoSwitchReasonLabel,
}: {
  state: CodexDesktopState;
  activeAccount: TokenAccountView | null;
  activeFiveHour: TokenQuotaCard | null;
  activeWeekly: TokenQuotaCard | null;
  totalFiveHour: number;
  backoffProtectionEnabled: boolean;
  busy: string | null;
  onToggleBackoff: () => void;
  onToggleAutoSwitch: () => void | Promise<void>;
  onSetLaunchMode: (mode: CodexDesktopState['settings']['auto_switch_launch_mode']) => void | Promise<void>;
  onUpdateThreshold: (value: number) => void;
  onSaveThreshold: () => void | Promise<void>;
  onRestoreLast: () => void | Promise<void>;
  onOpenCrs: () => void;
  autoSwitchReasonLabel: (reason: CodexDesktopState['status']['autoSwitchPolicy']['userInterventionReason']) => string;
}) {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            CRS 自动切换
          </div>
          <div className="mt-1 truncate text-base font-semibold text-foreground">
            {activeAccount?.name || state.status.currentEmail || state.status.matchedTokenAccountName || '未匹配账号池'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag tone={state.settings.auto_switch_enabled ? 'success' : 'warning'}>
            {state.settings.auto_switch_enabled ? '自动切换开启' : '自动切换关闭'}
          </StatusTag>
          <Button onClick={onOpenCrs} variant="outlined" className="px-3 py-2 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            高级
          </Button>
        </div>
      </div>
      <div className="grid divide-y divide-border text-sm lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(420px,1.2fr)] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">当前账号</div>
          <div className="mt-2 truncate font-medium text-foreground">
            {activeAccount?.login_hint || state.status.currentEmail || state.status.currentAccountId || 'auth.json 未识别登录标识'}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><span className="text-muted-foreground">5 小时 </span><span className={`font-semibold ${toneTextClass(quotaTone(activeFiveHour))}`}>{quotaText(activeFiveHour)}</span></span>
            <span><span className="text-muted-foreground">周额度 </span><span className={`font-semibold ${toneTextClass(quotaTone(activeWeekly))}`}>{quotaText(activeWeekly)}</span></span>
            <span><span className="text-muted-foreground">总池 </span>{totalFiveHour}%</span>
          </div>
        </div>
        <div className="min-w-0 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">本机状态</div>
              <div className="mt-2 truncate text-xs text-muted-foreground">{compactPath(state.status.codexHome)}</div>
            </div>
            <Button onClick={onRestoreLast} disabled={!!busy || !state.status.lastActivation?.backup_auth_path} className="shrink-0 px-3 py-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              恢复
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>auth：<span className={state.status.authExists ? 'text-primary' : 'text-destructive'}>{state.status.authExists ? '存在' : '缺失'}</span></span>
            <span>sessions：<span className={state.status.sessionsExists ? 'text-primary' : 'text-destructive'}>{state.status.sessionsExists ? '保留' : '未找到'}</span></span>
            <span>快照：{formatTime(activeAccount?.snapshot?.fetchedAt)}</span>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto text-[11px] uppercase tracking-[0.16em] text-muted-foreground">低额度切换</div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              退避
              <Switch checked={backoffProtectionEnabled} onChange={onToggleBackoff} aria-label="切换退避保护" />
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              自动
              <Switch checked={Boolean(state.settings.auto_switch_enabled)} disabled={busy === 'settings'} onChange={onToggleAutoSwitch} aria-label="切换自动低额度轮换" />
            </label>
            <Button onClick={() => onSetLaunchMode('activate_only')} disabled={busy === 'auto-switch-launch-mode'} variant={state.settings.auto_switch_launch_mode === 'activate_only' ? 'primary' : 'secondary'} className="px-3 py-2 text-xs">仅激活</Button>
            <Button onClick={() => onSetLaunchMode('activate_and_open')} disabled={busy === 'auto-switch-launch-mode'} variant={state.settings.auto_switch_launch_mode === 'activate_and_open' ? 'primary' : 'secondary'} className="px-3 py-2 text-xs">打开</Button>
          </div>
          <div className="mt-2 grid grid-cols-[auto_minmax(120px,1fr)_72px_auto] items-center gap-2">
            <span className="text-xs text-muted-foreground">阈值</span>
            <Slider min={1} max={99} value={state.settings.low_5h_threshold_pct} onChange={onUpdateThreshold} className="w-full" />
            <TextInput type="number" min={1} max={99} value={state.settings.low_5h_threshold_pct} onChange={(event) => onUpdateThreshold(Number(event.target.value))} className="w-[72px] px-2 py-1 text-xs" />
            <Button onClick={onSaveThreshold} disabled={busy === 'threshold'} variant="primary" className="px-3 py-2 text-xs">保存</Button>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            运行保护：{state.status.autoSwitchPolicy.protectedRunning ? '已延后' : '未拦截'} · 人工介入：{autoSwitchReasonLabel(state.status.autoSwitchPolicy.userInterventionReason)}
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function CodexAccountRows({
  accountViews,
  accountsCount,
  ambiguousAccountIds,
  busy,
  activatingAccountId,
  onActivate,
  onOpenTokens,
}: {
  accountViews: CodexAccountView[];
  accountsCount: number;
  ambiguousAccountIds: Set<number>;
  busy: string | null;
  activatingAccountId: number | null;
  onActivate: (account: TokenAccountView, launch?: boolean) => void | Promise<void>;
  onOpenTokens: () => void;
}) {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <WalletCards className="h-3.5 w-3.5" />
            账户管理
          </div>
          <div className="mt-1 text-base font-semibold text-foreground">账户管理</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusTag>{accountsCount} 个账号</StatusTag>
          <Button onClick={onOpenTokens} variant="outlined" className="px-3 py-2 text-xs">
            完整管理
            <PanelRightOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="hidden border-b border-border bg-secondary/35 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground xl:grid xl:grid-cols-[minmax(220px,1.25fr)_110px_110px_minmax(160px,0.8fr)_minmax(280px,1fr)]">
        <div>账号</div>
        <div>5 小时</div>
        <div>周额度</div>
        <div>同步</div>
        <div className="text-right">动作</div>
      </div>
      <div className="divide-y divide-border">
        {accountViews.map(({ account, fiveHour, weekly, isActive }) => {
          const retry = getRetryBlockInfo(account);
          return (
            <div key={account.id} className={`grid gap-3 px-4 py-3 text-sm xl:grid-cols-[minmax(220px,1.25fr)_110px_110px_minmax(160px,0.8fr)_minmax(280px,1fr)] xl:items-center ${isActive ? 'bg-primary/5' : 'bg-card/60'}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-foreground">{account.name}</span>
                  {isActive ? <StatusTag tone="primary">当前</StatusTag> : null}
                  {retry.blocked ? <StatusTag tone="warning">退避</StatusTag> : null}
                  {ambiguousAccountIds.has(account.id) ? <StatusTag tone="warning">歧义</StatusTag> : null}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{account.login_hint || account.external_account_id || account.auth_method}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground xl:hidden">5 小时</div>
                <div className={`font-semibold ${toneTextClass(quotaTone(fiveHour))}`}>{quotaText(fiveHour)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground xl:hidden">周额度</div>
                <div className={`font-semibold ${toneTextClass(quotaTone(weekly))}`}>{quotaText(weekly)}</div>
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                <div className="truncate">{formatTime(account.last_synced_at)}</div>
                {retry.blocked ? <div className="truncate text-accent">下次 {retry.retryLabel}</div> : null}
              </div>
              <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                <Button onClick={() => onActivate(account, true)} disabled={!!busy || retry.blocked} variant={isActive ? 'secondary' : 'primary'} className="px-3 py-2 text-xs">
                  {isActive ? '打开' : '切换并打开'}
                </Button>
                <Button onClick={() => onActivate(account)} disabled={!!busy || isActive || retry.blocked || activatingAccountId === account.id} className="px-3 py-2 text-xs">
                  仅激活
                </Button>
              </div>
              {account.last_error ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive xl:col-span-5">
                  {account.last_error}
                </div>
              ) : null}
            </div>
          );
        })}
        {!accountViews.length ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            还没有可切换的 Codex OAuth 账号。
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

export function CodexUtilityBar({
  totalFiveHour,
  accountsCount,
  trendDays,
  historyLoaded,
  onOpenTokens,
  onOpenAnalytics,
  onOpenRoadmap,
}: {
  totalFiveHour: number;
  accountsCount: number;
  trendDays: number;
  historyLoaded: boolean;
  onOpenTokens: () => void;
  onOpenAnalytics: () => void;
  onOpenRoadmap: () => void;
}) {
  return (
    <Surface className="p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusTag tone="primary">总 5 小时 {totalFiveHour}%</StatusTag>
          <StatusTag>{accountsCount} 个账号</StatusTag>
          <StatusTag>{historyLoaded ? `${trendDays} 天趋势` : '趋势未加载'}</StatusTag>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenTokens} variant="outlined" className="px-3 py-2 text-xs">
            <WalletCards className="h-3.5 w-3.5" />
            Token 明细
          </Button>
          <Button onClick={onOpenAnalytics} variant="outlined" className="px-3 py-2 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            趋势
          </Button>
          <Button onClick={onOpenRoadmap} variant="quiet" className="px-3 py-2 text-xs">
            <Clock3 className="h-3.5 w-3.5" />
            路线图
          </Button>
        </div>
      </div>
    </Surface>
  );
}
