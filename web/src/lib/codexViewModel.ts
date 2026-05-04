import type { SemanticTone } from '../components/ui/primitives';
import type { CodexDesktopState, CodexUsageHistory, TokenAccountView, TokenQuotaCard } from '../types';

export type CodexQuotaKind = 'five_hour' | 'weekly';

export interface CodexAccountView {
  account: TokenAccountView;
  fiveHour: TokenQuotaCard | null;
  weekly: TokenQuotaCard | null;
  isActive: boolean;
}

export interface CodexPrimaryTask {
  tone: SemanticTone;
  headline: string;
  summary: string;
  action: 'rotate_best' | 'activate_best' | 'open_tokens' | 'toggle_auto_switch' | 'refresh';
  actionLabel: string;
  secondaryLabel?: string;
  facts: Array<{ label: string; value: string; tone?: SemanticTone }>;
}

export interface CodexTokenBreakdownTrendPoint {
  date: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningOutputTokens: number;
}

export function formatTime(value?: string | null) {
  if (!value) return '尚未记录';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized).toLocaleString('zh-CN', { hour12: false });
}

export function compactPath(value?: string) {
  if (!value) return '未设置';
  return value.replace(/^C:\\Users\\[^\\]+/i, '~');
}

export function bytesText(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function tokenText(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

export function getQuotaCard(account: TokenAccountView | null, kind: CodexQuotaKind): TokenQuotaCard | null {
  const cards = account?.snapshot?.cards || [];
  if (kind === 'five_hour') {
    return cards.find((card) => card.key === 'five_hour' || /5\s*小时|5-hour/i.test(card.label)) || null;
  }
  return cards.find((card) => card.key === 'weekly' || /每周|weekly/i.test(card.label)) || null;
}

export function quotaText(card: TokenQuotaCard | null) {
  if (!card) return '未同步';
  return typeof card.remainingPct === 'number' ? `${card.remainingPct}%` : card.remainingText || '未解析';
}

export function quotaTone(card: TokenQuotaCard | null): SemanticTone {
  const pct = card?.remainingPct;
  if (typeof pct !== 'number') return 'neutral';
  if (pct < 15) return 'danger';
  if (pct < 35) return 'warning';
  return 'success';
}

export function weeklyRemaining(account: TokenAccountView | null) {
  return getQuotaCard(account, 'weekly')?.remainingPct ?? null;
}

export function fiveHourRemaining(account: TokenAccountView | null) {
  return getQuotaCard(account, 'five_hour')?.remainingPct ?? null;
}

const OPENAI_OFFICIAL_REFRESH_REJECTED =
  /OpenAI 官方拒绝刷新|refresh_token_reused|unsupported_country_region_territory|workspace_member_credits_depleted|deactivated_workspace|forbidden|身份验证错误|unknown_error/i;

export function isOpenAiOfficialRefreshRejected(account: TokenAccountView | null) {
  if (!account) return false;
  if (account.last_failure_kind === 'provider_blocked') return true;
  return OPENAI_OFFICIAL_REFRESH_REJECTED.test(account.last_error || '');
}

export function totalEligibleFiveHourRemaining(accounts: TokenAccountView[]) {
  let total = 0;
  let count = 0;
  let excludedWeeklyZero = 0;
  let excludedOfficialRejected = 0;
  let excludedNoFiveHour = 0;
  for (const account of accounts) {
    if (isOpenAiOfficialRefreshRejected(account)) {
      excludedOfficialRejected += 1;
      continue;
    }
    const weekly = weeklyRemaining(account);
    if (typeof weekly === 'number' && weekly <= 0) {
      excludedWeeklyZero += 1;
      continue;
    }
    const fiveHour = fiveHourRemaining(account);
    if (typeof fiveHour !== 'number') {
      excludedNoFiveHour += 1;
      continue;
    }
    total += fiveHour;
    count += 1;
  }
  return { total, count, excludedWeeklyZero, excludedOfficialRejected, excludedNoFiveHour };
}

function timestampMs(value?: string | null) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getRetryBlockInfo(account?: TokenAccountView | null, now = Date.now()) {
  const retryAt = timestampMs(account?.next_retry_at);
  const blocked = retryAt > now;
  return {
    blocked,
    retryAt,
    retryLabel: blocked ? formatTime(account?.next_retry_at) : '',
  };
}

export function isTokenAccountRetryBlocked(account?: TokenAccountView | null, now = Date.now()) {
  return getRetryBlockInfo(account, now).blocked;
}

function compareRemaining(a: number | null, b: number | null) {
  return (b ?? -1) - (a ?? -1);
}

export function buildCodexViewModel(state: CodexDesktopState | null, history: CodexUsageHistory | null) {
  const accounts = state?.accounts || [];
  const activeAccount = accounts.find((account) => account.id === state?.status.matchedTokenAccountId) || null;
  const accountViews: CodexAccountView[] = accounts.map((account) => ({
    account,
    fiveHour: getQuotaCard(account, 'five_hour'),
    weekly: getQuotaCard(account, 'weekly'),
    isActive: account.id === state?.status.matchedTokenAccountId,
  }));
  const latestLocalUsage = history?.localUsage?.slice(-1)[0] || null;
  const quotaTrendPoints = (history?.weeklyTrend || []).slice(-14).map((point) => ({
    date: point.date,
    weeklyRemaining: point.totalWeeklyRemainingPct,
    weeklyUsed: point.dailyUsedPct,
  }));
  const sessionTokenTrendPoints = (history?.localUsage || []).slice(-14).map((point) => ({
    date: point.date,
    totalTokens: point.totalTokens,
    inputTokens: point.inputTokens,
    outputTokens: point.outputTokens + point.reasoningOutputTokens,
  }));
  const tokenBreakdownTrendPoints: CodexTokenBreakdownTrendPoint[] = (history?.localUsage || []).slice(-14).map((point) => ({
    date: point.date,
    totalTokens: point.totalTokens,
    inputTokens: point.inputTokens,
    outputTokens: point.outputTokens,
    cachedInputTokens: point.cachedInputTokens,
    reasoningOutputTokens: point.reasoningOutputTokens,
  }));
  const latestTokenBreakdown = tokenBreakdownTrendPoints[tokenBreakdownTrendPoints.length - 1] || null;
  const threshold = state?.settings.low_5h_threshold_pct ?? 20;
  const rankedAccountViews = [...accountViews].sort((left, right) => {
    const fiveHourDelta = compareRemaining(fiveHourRemaining(left.account), fiveHourRemaining(right.account));
    if (fiveHourDelta !== 0) return fiveHourDelta;
    return compareRemaining(weeklyRemaining(left.account), weeklyRemaining(right.account));
  });
  const bestReplacement = rankedAccountViews.find((item) =>
    !item.isActive &&
    item.account.status !== 'error' &&
    !isTokenAccountRetryBlocked(item.account)
  ) || null;
  const activeFiveHourRemaining = fiveHourRemaining(activeAccount);
  const activeWeeklyRemaining = weeklyRemaining(activeAccount);
  const totalFiveHour = totalEligibleFiveHourRemaining(accounts);

  let primaryTask: CodexPrimaryTask;
  if (!accounts.length) {
    primaryTask = {
      tone: 'warning',
      headline: '先补入可切换的 Codex 账号',
      summary: '当前账号池为空，页面上的切换、巡检和恢复能力都无法形成闭环。先去 Token 管理录入 OpenAI Codex OAuth 或 Refresh Token 账号。',
      action: 'open_tokens',
      actionLabel: '去 Token 管理',
      facts: [
        { label: '账号池', value: '0 个候选账号', tone: 'warning' },
        { label: 'auth.json', value: state?.status.authExists ? '已存在' : '缺失' },
        { label: '自动切换', value: state?.settings.auto_switch_enabled ? '已开启' : '未开启' },
      ],
    };
  } else if (state?.status.matchAmbiguous) {
    primaryTask = {
      tone: 'warning',
      headline: '当前账号匹配有歧义，先人工确认账号',
      summary: '后端识别到 auth.json 可能对应多个账号。这里不会自动绑定或自动轮换，请在下方账号池中确认要激活的账号。',
      action: 'refresh',
      actionLabel: '刷新状态',
      secondaryLabel: '禁止自动绑定',
      facts: [
        { label: '当前识别', value: state.status.currentEmail || state.status.currentAccountId || '未识别', tone: 'warning' },
        { label: '匹配来源', value: state.status.matchSource },
        { label: '歧义线索', value: state.status.matchNotes[0] || '后端已标记歧义', tone: 'warning' },
      ],
    };
  } else if (!activeAccount) {
    primaryTask = {
      tone: 'warning',
      headline: '先让当前 auth.json 对应到账号池',
      summary: bestReplacement
        ? `目前能读到本机登录状态，但没有和账号池成功匹配。优先激活候选账号“${bestReplacement.account.name}”，把切换链路校正回来。`
        : '目前能读到本机登录状态，但没有和账号池成功匹配。先刷新状态，确认后端是否能识别当前账号。 ',
      action: bestReplacement ? 'activate_best' : 'refresh',
      actionLabel: bestReplacement ? `激活 ${bestReplacement.account.name}` : '刷新状态',
      facts: [
        { label: '当前识别', value: state?.status.currentEmail || state?.status.currentAccountId || '未识别', tone: 'warning' },
        { label: '最佳候选', value: bestReplacement?.account.name || '暂无其他候选' },
        { label: '账号池', value: `${accounts.length} 个可切换账号` },
      ],
    };
  } else if (typeof activeFiveHourRemaining === 'number' && activeFiveHourRemaining <= threshold) {
    primaryTask = {
      tone: quotaTone(activeAccount ? getQuotaCard(activeAccount, 'five_hour') : null),
      headline: '当前账号 5 小时额度偏低，先处理切换',
      summary: bestReplacement
        ? `当前激活账号只剩 ${activeFiveHourRemaining}% 5 小时额度。建议优先执行按规则切换，把 Codex 切到剩余额度更高的账号。`
        : `当前激活账号只剩 ${activeFiveHourRemaining}% 5 小时额度，但账号池里没有更好的替补。先刷新或补充账号。`,
      action: bestReplacement ? 'rotate_best' : 'refresh',
      actionLabel: bestReplacement ? '按规则切换' : '刷新状态',
      secondaryLabel: bestReplacement ? `候选 ${bestReplacement.account.name}` : '暂无替补',
      facts: [
        { label: '当前 5 小时', value: `${activeFiveHourRemaining}%`, tone: quotaTone(getQuotaCard(activeAccount, 'five_hour')) },
        { label: '切换阈值', value: `${threshold}%` },
        { label: '最佳候选', value: bestReplacement ? `${bestReplacement.account.name} · ${quotaText(bestReplacement.fiveHour)}` : '暂无其他候选' },
      ],
    };
  } else if (typeof activeWeeklyRemaining === 'number' && activeWeeklyRemaining <= 15) {
    primaryTask = {
      tone: quotaTone(activeAccount ? getQuotaCard(activeAccount, 'weekly') : null),
      headline: '当前账号周额度吃紧，优先确认替补',
      summary: bestReplacement
        ? `当前激活账号周额度只剩 ${activeWeeklyRemaining}%。建议尽快切换到剩余周额度更高的账号，避免在后续任务中途触发阻塞。`
        : `当前激活账号周额度只剩 ${activeWeeklyRemaining}%，但账号池暂时没有更好的替补。先刷新快照并准备补货。`,
      action: bestReplacement ? 'rotate_best' : 'refresh',
      actionLabel: bestReplacement ? '切到更稳账号' : '刷新快照',
      facts: [
        { label: '当前周额度', value: `${activeWeeklyRemaining}%`, tone: quotaTone(getQuotaCard(activeAccount, 'weekly')) },
        { label: '账号池', value: `${accounts.length} 个可切换账号` },
        { label: '自动切换', value: state?.settings.auto_switch_enabled ? '已开启' : '未开启' },
      ],
    };
  } else if (!state?.settings.auto_switch_enabled) {
    primaryTask = {
      tone: 'primary',
      headline: '当前账号可继续使用，下一步是补齐自动切换',
      summary: `当前激活账号状态稳定，但低额度自动切换仍然关闭。建议开启自动轮换，让后端在 5 小时额度低于 ${threshold}% 时自动接手。`,
      action: 'toggle_auto_switch',
      actionLabel: '开启自动切换',
      facts: [
        { label: '当前账号', value: activeAccount.name },
        { label: '当前 5 小时', value: quotaText(getQuotaCard(activeAccount, 'five_hour')), tone: quotaTone(getQuotaCard(activeAccount, 'five_hour')) },
        { label: '切换阈值', value: `${threshold}%` },
      ],
    };
  } else {
    primaryTask = {
      tone: 'success',
      headline: '当前账号可继续跑，首要任务是保持观察',
      summary: '首屏不需要再做切换动作。优先保持当前账号，观察额度与会话趋势；只有出现低额度或同步异常时再介入。',
      action: 'refresh',
      actionLabel: '刷新状态',
      facts: [
        { label: '当前账号', value: activeAccount.name, tone: 'success' },
        { label: '当前 5 小时', value: quotaText(getQuotaCard(activeAccount, 'five_hour')), tone: quotaTone(getQuotaCard(activeAccount, 'five_hour')) },
        { label: '自动切换', value: state?.settings.auto_switch_enabled ? '已开启' : '未开启' },
      ],
    };
  }

  return {
    accounts,
    activeAccount,
    activeFiveHour: getQuotaCard(activeAccount, 'five_hour'),
    activeWeekly: getQuotaCard(activeAccount, 'weekly'),
    totalFiveHour,
    accountViews,
    bestReplacement,
    latestLocalUsage,
    latestTokenBreakdown,
    primaryTask,
    quotaTrendPoints,
    sessionTokenTrendPoints,
    tokenBreakdownTrendPoints,
  };
}
