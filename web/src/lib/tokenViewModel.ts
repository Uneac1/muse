import type { SemanticTone } from '../components/ui/primitives';
import type { PersonalTokenAiPlan, TokenAccountView, TokenAnalyticsSnapshot } from '../types';

export type TokenTabKey = 'usage' | 'review' | 'raw';
export type TokenRangeKey = '7d' | '30d' | 'custom';
export type TokenGroupingKey = 'day' | 'week' | 'month';

export const TOKEN_TAB_OPTIONS: Array<{ key: TokenTabKey; label: string }> = [
  { key: 'usage', label: '使用情况' },
  { key: 'review', label: '代码审查' },
  { key: 'raw', label: '原始数据' },
];

export const TOKEN_RANGE_OPTIONS: Array<{ key: TokenRangeKey; label: string }> = [
  { key: '7d', label: '7天' },
  { key: '30d', label: '1个月' },
  { key: 'custom', label: '自定义' },
];

export const TOKEN_GROUPING_OPTIONS: Array<{ key: TokenGroupingKey; label: string }> = [
  { key: 'day', label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];

export function formatTime(value?: string | null) {
  if (!value) return '尚未同步';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function parseRaw(snapshot: TokenAnalyticsSnapshot | null) {
  if (!snapshot?.textDigest) return null;
  try {
    return JSON.parse(snapshot.textDigest) as Record<string, any>;
  } catch {
    return null;
  }
}

function snapshotCards(snapshot?: TokenAnalyticsSnapshot | null) {
  return Array.isArray(snapshot?.cards) ? snapshot.cards : [];
}

function snapshotUsageSections(snapshot?: TokenAnalyticsSnapshot | null) {
  return Array.isArray(snapshot?.usageSections) ? snapshot.usageSections : [];
}

function snapshotRawSignals(snapshot?: TokenAnalyticsSnapshot | null) {
  return Array.isArray(snapshot?.rawSignals) ? snapshot.rawSignals : [];
}

export function remainPct(used?: number | null) {
  if (typeof used !== 'number') return null;
  return Math.max(0, 100 - Math.round(used));
}

export function valueText(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value == null || value === '') return '—';
  return String(value);
}

export function isReauthRequired(message?: string | null) {
  return /重新走一次 OAuth 授权/i.test(message || '');
}

export function inferFailureKindFromMessage(message?: string | null) {
  const text = message || '';
  if (!text) return 'none';
  if (isReauthRequired(text)) return 'reauth_required';
  if (/OpenAI 同步前校准内置代理失败|内置代理|mihomo|ECONNREFUSED 127\.0\.0\.1|Spawn EPERM|controller unavailable|local proxy/i.test(text)) {
    return 'proxy_recoverable';
  }
  if (/unsupported_country_region_territory|Country, region, or territory not supported|身份验证错误|unknown_error|forbidden|403|402|deactivated_workspace|workspace_member_credits_depleted|refresh_token_reused|refresh token 已经被使用过/i.test(text)) {
    return 'provider_blocked';
  }
  if (/fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|network|socket|timed out/i.test(text)) {
    return 'network_transient';
  }
  return 'unknown';
}

export function humanizeSyncIssue(account: TokenAccountView) {
  if (!account.last_error) return '';
  const hasSnapshot = Boolean(snapshotCards(account.snapshot).length || snapshotUsageSections(account.snapshot).length);
  const failureKind = account.last_failure_kind && account.last_failure_kind !== 'unknown'
    ? account.last_failure_kind
    : inferFailureKindFromMessage(account.last_error);
  if (failureKind === 'reauth_required') return '授权已失效，已暂停自动同步，重新 OAuth 后会自动恢复。';
  if (failureKind === 'proxy_recoverable') return hasSnapshot ? '内置代理正在自动恢复，当前先显示上次抓到的官方额度。' : '内置代理正在自动恢复，这个账号会按退避时间自动重试。';
  if (failureKind === 'provider_blocked') return hasSnapshot ? '当前出口被平台限制，已保留上次抓到的官方额度；建议换节点后再刷新。' : '当前账号被平台风控、地区限制或工作区额度策略拒绝，建议换节点或检查工作区状态。';
  if (failureKind === 'network_transient') return hasSnapshot ? '网络抖动，当前先显示上次抓到的官方额度，系统会自动退避后重试。' : '网络抖动，系统会自动退避后重试。';
  return account.last_error;
}

export function getPrimaryQuotaCard(account: TokenAccountView) {
  const cards = snapshotCards(account.snapshot);
  return (
    cards.find((card) => card.key === 'five_hour') ||
    cards.find((card) => /5\s*小时|5-hour/i.test(card.label)) ||
    cards[0] ||
    null
  );
}

export function getWeeklyQuotaCard(account: TokenAccountView) {
  const cards = snapshotCards(account.snapshot);
  return (
    cards.find((card) => card.key === 'weekly') ||
    cards.find((card) => /每周|weekly/i.test(card.label)) ||
    null
  );
}

function getQuotaSortRank(account: TokenAccountView) {
  const weekly = getWeeklyQuotaCard(account)?.remainingPct;
  if (weekly === 0) return 2;
  if (weekly == null) return 1;
  return 0;
}

function getQuotaSortValue(account: TokenAccountView) {
  const quotaCard = getPrimaryQuotaCard(account);
  if (typeof quotaCard?.remainingPct === 'number') return quotaCard.remainingPct;
  return -1;
}

function getQuotaResetSortValue(account: TokenAccountView) {
  const quotaCard = getPrimaryQuotaCard(account);
  if (!quotaCard?.resetAt) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(quotaCard.resetAt).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function sortTokenAccounts(accounts: TokenAccountView[]) {
  return [...accounts].sort((left, right) => {
    const rankDiff = getQuotaSortRank(left) - getQuotaSortRank(right);
    if (rankDiff !== 0) return rankDiff;
    const quotaDiff = getQuotaSortValue(right) - getQuotaSortValue(left);
    if (quotaDiff !== 0) return quotaDiff;
    const resetDiff = getQuotaResetSortValue(left) - getQuotaResetSortValue(right);
    if (resetDiff !== 0) return resetDiff;
    return right.id - left.id;
  });
}

export function quotaToneFromPercent(value?: number | null): SemanticTone {
  if (value == null) return 'neutral';
  if (value <= 0) return 'danger';
  if (value < 35) return 'warning';
  return 'success';
}

export function tokenCardTone(toneName?: string): { tone: SemanticTone; barClass: string } {
  if (toneName === 'red') return { tone: 'danger', barClass: 'bg-destructive' };
  if (toneName === 'green') return { tone: 'success', barClass: 'bg-[color:var(--success)]' };
  if (toneName === 'amber') return { tone: 'warning', barClass: 'bg-accent' };
  if (toneName === 'blue') return { tone: 'primary', barClass: 'bg-primary' };
  return { tone: 'neutral', barClass: 'bg-muted-foreground' };
}

export function buildTokenQuotaCardView(card: TokenAnalyticsSnapshot['cards'][number]) {
  const { tone, barClass } = tokenCardTone(card.tone);
  const percent = typeof card.remainingPct === 'number' ? Math.max(0, Math.min(100, card.remainingPct)) : 0;
  return {
    tone,
    barClass,
    percent,
    percentLabel: card.remainingPct == null ? '—' : `${card.remainingPct}%`,
    remainingText: card.remainingText,
    resetLabel: card.resetLabel,
  };
}

export function buildTokenAccountCardView(item: TokenAccountView, selectedId: number | null) {
  const quotaCard = getPrimaryQuotaCard(item);
  const weeklyCard = getWeeklyQuotaCard(item);
  const weeklyZero = weeklyCard?.remainingPct === 0;

  return {
    isSelected: selectedId === item.id,
    quotaCard,
    weeklyCard,
    weeklyZero,
    quotaValue: quotaCard?.remainingPct == null ? '—' : `${quotaCard.remainingPct}%`,
    weeklyValue: weeklyCard?.remainingPct == null ? '—' : `${weeklyCard.remainingPct}%`,
    quotaTone: quotaToneFromPercent(quotaCard?.remainingPct),
    weeklyTone: weeklyZero ? 'danger' as SemanticTone : quotaToneFromPercent(weeklyCard?.remainingPct),
    resetLabel: quotaCard?.resetLabel || '重置时间：尚未同步',
    syncIssue: humanizeSyncIssue(item),
    needsReauth: item.provider === 'openai_codex' && isReauthRequired(item.last_error),
  };
}

export function buildTokenPageView(accounts: TokenAccountView[], selectedId: number | null) {
  const sortedAccounts = sortTokenAccounts(accounts);
  return {
    totalCards: accounts.reduce((sum, item) => sum + snapshotCards(item.snapshot).length, 0),
    activeAccounts: accounts.filter((item) => item.status === 'active').length,
    sortedAccounts,
    selectedAccount: sortedAccounts.find((item) => item.id === selectedId) || sortedAccounts[0] || null,
  };
}

export function buildTokenDetailView(account: TokenAccountView | null) {
  const snapshot = account?.snapshot || null;
  const raw = parseRaw(snapshot);
  return {
    raw,
    snapshot,
    title: snapshot?.pageTitle || account?.name || '',
    metaTags: account ? [
      `账号：${account.name}`,
      `方式：${account.auth_method}`,
      `最近同步：${formatTime(account.last_synced_at)}`,
    ] : [],
    balanceCards: snapshotCards(snapshot).map((card) => ({
      key: card.key,
      label: card.label,
      ...buildTokenQuotaCardView(card),
    })),
    accountStats: [
      { label: 'Plan', value: raw?.plan_type },
      { label: 'Allowed', value: raw?.rate_limit?.allowed },
      { label: 'Account ID', value: raw?.account_id || account?.external_account_id },
      { label: 'Email', value: raw?.email || account?.login_hint },
    ],
    creditStats: [
      { label: 'Primary Remain', value: remainPct(raw?.rate_limit?.primary_window?.used_percent) },
      { label: 'Weekly Remain', value: remainPct(raw?.rate_limit?.secondary_window?.used_percent) },
      { label: 'Has Credits', value: raw?.credits?.has_credits },
      { label: 'Unlimited', value: raw?.credits?.unlimited },
      { label: 'Balance', value: raw?.credits?.balance },
      { label: 'Spend Control', value: raw?.spend_control?.reached ? 'Reached' : raw?.spend_control?.reached === false ? 'OK' : '—' },
    ],
    rateLimitReachedText: valueText(raw?.rate_limit_reached_type?.type),
    reviewStats: [
      { label: 'Code Review', value: raw?.code_review_rate_limit ? '已返回结构' : '当前为 null' },
      { label: 'Additional Limits', value: raw?.additional_rate_limits ? '已返回结构' : '当前为空' },
      { label: 'threads', value: '—', hint: '当前官方额度接口未返回最近 30 天趋势' },
      { label: 'turns', value: '—', hint: '当前官方额度接口未返回最近 30 天趋势' },
    ],
    skillsNotice: 'Skills from your repositories are only visible to workspace admins。当前快照没有技能明细，所以这里保留官方版位和状态提示。',
    rawSignalsText: snapshotRawSignals(snapshot).join(' / '),
    rawJsonText: JSON.stringify(raw || snapshot?.textDigest || '暂无快照', null, 2),
  };
}

export function buildTokenAiPlanView(plan: PersonalTokenAiPlan | null, accounts: TokenAccountView[]) {
  if (!plan) return null;
  return {
    accountName: plan.accountName,
    model: plan.model,
    summary: plan.summary,
    suggestions: plan.suggestions.map((item, index) => {
      const target = accounts.find((entry) => entry.id === item.target_id);
      const badges: Array<{ tone: SemanticTone; label: string }> = [];
      if (item.status) badges.push({ tone: item.status === 'active' ? 'success' : item.status === 'inactive' ? 'neutral' : 'danger', label: `状态: ${item.status}` });
      if (item.auto_sync_enabled !== undefined) badges.push({ tone: item.auto_sync_enabled ? 'primary' : 'warning', label: item.auto_sync_enabled ? '开启自动同步' : '停止自动同步' });
      return {
        key: `${item.target_id}-${index}`,
        targetLabel: target?.name || `账号 #${item.target_id}`,
        badges,
        note: item.note,
        reason: item.reason,
      };
    }),
  };
}
