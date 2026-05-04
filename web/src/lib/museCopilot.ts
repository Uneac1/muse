import type { AiAccount } from '../types';

export type MuseCopilotRouteConfig = {
  title: string;
  summary: string;
};

export function getMuseAccountHealth(account: AiAccount): 'active' | 'inactive' | 'error' {
  if (account.status === 'inactive') return 'inactive';
  if (account.status === 'active' || account.last_test_status === 'success') return 'active';
  return 'error';
}

function getMuseAccountRank(account: AiAccount) {
  const health = getMuseAccountHealth(account) === 'active' ? 0 : getMuseAccountHealth(account) === 'error' ? 1 : 2;
  const name = String(account.name || '').trim().toLowerCase();
  const providerRank = account.provider === 'gemini' || name.includes('gemini')
    ? 0
    : name === 'any'
      ? 1
      : name === 'anydl'
        ? 2
        : 9;
  return { health, providerRank };
}

export function sortMuseAccounts(accounts: AiAccount[]) {
  return [...accounts].sort((left, right) => {
    const leftRank = getMuseAccountRank(left);
    const rightRank = getMuseAccountRank(right);
    if (leftRank.providerRank !== rightRank.providerRank) return leftRank.providerRank - rightRank.providerRank;
    if (leftRank.health !== rightRank.health) return leftRank.health - rightRank.health;
    return (left.priority_rank || 999) - (right.priority_rank || 999) || left.id - right.id;
  });
}

const DEFAULT_CONFIG: MuseCopilotRouteConfig = {
  title: 'Muse',
  summary: '当前页面上下文',
};

const ROUTE_CONFIG: Record<string, MuseCopilotRouteConfig> = {
  '/today': { title: 'Today', summary: 'Today 页面上下文' },
  '/inbox': { title: 'Inbox', summary: 'Inbox 页面上下文' },
  '/rules': { title: 'Memory & Rules', summary: 'Memory & Rules 页面上下文' },
  '/memory': { title: 'Memory & Rules', summary: 'Memory & Rules 页面上下文' },
  '/dashboard': { title: '统计仪表盘', summary: '统计仪表盘页面上下文' },
  '/accounts': { title: '邮箱管理', summary: '邮箱管理页面上下文' },
  '/ai': { title: 'AI Studio', summary: 'AI Studio 页面上下文' },
  '/tokens': { title: 'Token 管理', summary: 'Token 管理页面上下文' },
  '/proxy': { title: '代理设置', summary: '代理设置页面上下文' },
  '/subscriptions': { title: '订阅管理', summary: '订阅管理页面上下文' },
  '/newspaper': { title: '报纸', summary: '报纸页面上下文' },
  '/newspaper/read': { title: '报纸阅读器', summary: '报纸阅读器页面上下文' },
  '/cloudflare': { title: 'Cloudflare 管理', summary: 'Cloudflare 页面上下文' },
  '/github': { title: 'GitHub', summary: 'GitHub 页面上下文' },
  '/linuxdo': { title: 'Linux.do', summary: 'Linux.do 页面上下文' },
  '/notion': { title: 'Notion', summary: 'Notion 页面上下文' },
  '/ymail': { title: 'Ymail 临时邮箱', summary: 'Ymail 页面上下文' },
};

export function getMuseCopilotConfig(pathname: string): MuseCopilotRouteConfig {
  const exact = ROUTE_CONFIG[pathname];
  if (exact) return exact;

  const prefix = Object.keys(ROUTE_CONFIG)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(`${route}/`));

  return prefix ? ROUTE_CONFIG[prefix] : DEFAULT_CONFIG;
}

export function getMuseRouteContext(pathname: string, search: string): Record<string, string> {
  if (pathname !== '/newspaper/read') return {};
  const params = new URLSearchParams(search);
  return {
    article_url: params.get('url') || '',
    article_source: params.get('source') || '',
    article_source_url: params.get('sourceUrl') || '',
    article_published_at: params.get('publishedAt') || '',
    article_title: params.get('title') || '',
    article_title_zh: params.get('titleZh') || '',
    article_summary: params.get('summary') || '',
    article_summary_zh: params.get('summaryZh') || '',
  };
}

export function buildMuseCopilotMessage(pathname: string, userMessage: string, context?: Record<string, string>, options?: { mode?: 'global_monitor'; autoExecute?: boolean }) {
  return String(userMessage || '').trim();
}
