import { AccountModel } from '../models/Account';
import { MailCacheModel } from '../models/MailCache';
import { ProxyModel } from '../models/Proxy';
import { DashboardStats } from '../types';

const accountModel = new AccountModel();
const cacheModel = new MailCacheModel();
const proxyModel = new ProxyModel();
const DASHBOARD_CACHE_TTL_MS = 15 * 1000;

export class DashboardService {
  private cachedStats: DashboardStats | null = null;
  private cachedAt = 0;

  getStats(): DashboardStats {
    const now = Date.now();
    if (this.cachedStats && now - this.cachedAt < DASHBOARD_CACHE_TTL_MS) {
      return this.cachedStats;
    }

    const accounts = accountModel.getAll();
    const proxies = proxyModel.list();
    const recentMails = cacheModel.getRecentSummary(5);
    const mailboxCounts = cacheModel.countGroupedByMailbox();
    const inboxCountsByAccount = new Map(cacheModel.countGroupedByAccount('INBOX').map((item) => [item.account_id, item.count]));
    const junkCountsByAccount = new Map(cacheModel.countGroupedByAccount('Junk').map((item) => [item.account_id, item.count]));
    const mailboxCountMap = new Map(mailboxCounts.map((item) => [item.mailbox, item.count]));

    const accountStats = accounts.map(acc => ({
      account_id: acc.id,
      email: acc.email,
      inbox_count: inboxCountsByAccount.get(acc.id) || 0,
      junk_count: junkCountsByAccount.get(acc.id) || 0,
    }));

    const groupCount = <T extends Record<string, any>>(items: T[], key: keyof T) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const value = String(item[key] || 'unknown');
        map.set(value, (map.get(value) || 0) + 1);
      }
      return [...map.entries()].map(([name, count]) => ({ [String(key)]: name, count })) as any[];
    };

    const topMailAccounts = accountStats
      .map(item => ({ ...item, total_count: item.inbox_count + item.junk_count }))
      .sort((a, b) => b.total_count - a.total_count)
      .slice(0, 10);

    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    const stats = {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'active').length,
      totalInboxMails: mailboxCountMap.get('INBOX') || 0,
      totalJunkMails: mailboxCountMap.get('Junk') || 0,
      totalProxies: proxies.length,
      activeProxies: proxies.filter(p => p.status === 'active').length,
      providerStats: groupCount(accounts, 'provider'),
      statusStats: groupCount(accounts, 'status'),
      proxyStatusStats: groupCount(proxies, 'status'),
      recentMails,
      accountStats,
      topMailAccounts,
      expiringTokens: accounts.filter(a => {
        if (!a.token_refreshed_at) return false;
        return (now - new Date(a.token_refreshed_at).getTime()) > sixtyDaysMs;
      }).length,
      errorAccounts: accounts.filter(a => a.status === 'error').length,
      unusedAccounts: accounts.filter(a => !a.token_refreshed_at).length,
    };

    this.cachedStats = stats;
    this.cachedAt = now;
    return stats;
  }
}
