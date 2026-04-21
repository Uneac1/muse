import { AccountModel } from '../models/Account';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { MailCacheModel } from '../models/MailCache';
import { PersonalActionStateModel, PersonalMemoryModel, PersonalOsRuleModel } from '../models/PersonalOS';
import { ProxyModel } from '../models/Proxy';
import { TokenAccountModel } from '../models/TokenAccount';
import { IntegrationService } from './IntegrationService';
import { NewspaperService } from './NewspaperService';
import type {
  ActionCenterItem,
  CloudflareIntegrationData,
  CommandCenterItem,
  GitHubIntegrationData,
  NewspaperBriefing,
  NotionIntegrationData,
  PersonalEntityLink,
  PersonalEntityView,
  PersonalMemoryView,
  PersonalOsRuleView,
  PersonalOsWorkspace,
  PersonalRuleTriggerType,
} from '../types';

const accountModel = new AccountModel();
const mailModel = new MailCacheModel();
const proxyModel = new ProxyModel();
const tokenModel = new TokenAccountModel();
const integrationTokenModel = new IntegrationTokenModel();
const ruleModel = new PersonalOsRuleModel();
const memoryModel = new PersonalMemoryModel();
const actionStateModel = new PersonalActionStateModel();
const integrationService = new IntegrationService();
const newspaperService = new NewspaperService();

type TokenView = ReturnType<TokenAccountModel['list']>[number] & { provider_label: string; snapshot: any };
type IntegrationSnapshot = {
  github: GitHubIntegrationData | null;
  cloudflare: CloudflareIntegrationData | null;
  notion: NotionIntegrationData | null;
};

const VALID_RULE_SCOPES = new Set<PersonalOsRuleView['scope']>(['today', 'inbox', 'alert']);
const VALID_RULE_TRIGGER_TYPES = new Set<PersonalRuleTriggerType>([
  'token_low_remaining_pct',
  'account_error',
  'proxy_failed',
  'keyword_in_news',
  'github_repo_activity',
  'subscription_expiring_days',
]);

class PersonalOSValidationError extends Error {
  statusCode = 400;
}

export class PersonalOSService {
  private workspaceCache: { expiresAt: number; value: PersonalOsWorkspace } | null = null;
  private inflightWorkspace: Promise<PersonalOsWorkspace> | null = null;
  private readonly moduleCommands: CommandCenterItem[] = [
    { id: 'cmd-today', kind: 'open', title: '打开 Today', subtitle: '查看今日优先级和异常', path: '/today', keywords: ['today', 'dashboard', 'priority', '异常'] },
    { id: 'cmd-inbox', kind: 'open', title: '打开 Inbox', subtitle: '统一待处理队列', path: '/inbox', keywords: ['inbox', '待处理', 'action'] },
    { id: 'cmd-entities', kind: 'open', title: '打开 Entity View', subtitle: '查看实体关联', path: '/entities', keywords: ['entity', 'domain', 'repository', 'project'] },
    { id: 'cmd-rules', kind: 'open', title: '打开 Rules', subtitle: '自动化规则中心', path: '/rules', keywords: ['rules', 'automation', '提醒'] },
    { id: 'cmd-memory', kind: 'open', title: '打开 Memory', subtitle: '个人上下文与沉淀', path: '/memory', keywords: ['memory', 'note', 'context'] },
    { id: 'cmd-accounts', kind: 'open', title: '打开邮箱管理', subtitle: '查看账户、授权和邮件缓存', path: '/accounts', keywords: ['accounts', 'email', 'mail', '邮箱', '账户'] },
    { id: 'cmd-github', kind: 'open', title: '打开 GitHub', subtitle: '查看仓库、PR、Issue 和 release', path: '/github', keywords: ['github', 'repo', 'pull request', 'issue', '仓库', 'pr'] },
    { id: 'cmd-cloudflare', kind: 'open', title: '打开 Cloudflare', subtitle: '查看域名、DNS、Pages 与规则', path: '/cloudflare', keywords: ['cloudflare', 'domain', 'dns', 'zone', 'pages', '域名'] },
    { id: 'cmd-notion', kind: 'open', title: '打开 Notion', subtitle: '查看页面、数据库和知识库变化', path: '/notion', keywords: ['notion', 'docs', 'page', 'database', '知识库'] },
    { id: 'cmd-tokens', kind: 'open', title: '打开 Token 管理', subtitle: '查看额度、到期与同步情况', path: '/tokens', keywords: ['token', 'quota', 'usage', '额度'] },
    { id: 'cmd-ai', kind: 'open', title: '打开 AI 对话', subtitle: '查看 AI 账号、线程和诊断', path: '/ai', keywords: ['ai', 'chat', 'assistant', 'llm'] },
    { id: 'cmd-newspaper', kind: 'open', title: '打开报纸', subtitle: '查看外部信号与内容流', path: '/newspaper', keywords: ['newspaper', 'news', 'article', '报纸', '新闻'] },
    { id: 'cmd-proxy', kind: 'open', title: '打开代理设置', subtitle: '查看代理状态与默认出口', path: '/proxy', keywords: ['proxy', 'network', '代理'] },
    { id: 'cmd-subscriptions', kind: 'open', title: '打开订阅管理', subtitle: '查看订阅与节点状态', path: '/subscriptions', keywords: ['subscription', 'misub', '订阅', '节点'] },
  ];

  async getWorkspace(): Promise<PersonalOsWorkspace> {
    if (this.workspaceCache && this.workspaceCache.expiresAt > Date.now()) {
      return this.workspaceCache.value;
    }

    if (this.inflightWorkspace) {
      return this.inflightWorkspace;
    }

    this.inflightWorkspace = this.buildWorkspace();
    try {
      const workspace = await this.inflightWorkspace;
      this.workspaceCache = {
        value: workspace,
        expiresAt: Date.now() + 30 * 1000,
      };
      return workspace;
    } finally {
      this.inflightWorkspace = null;
    }
  }

  private async buildWorkspace(): Promise<PersonalOsWorkspace> {
    const [rules, memory, actionStates, newspaper, integrations] = await Promise.all([
      Promise.resolve(ruleModel.list()),
      Promise.resolve(memoryModel.list()),
      Promise.resolve(actionStateModel.mapByActionId()),
      this.safe(() => newspaperService.getBriefing({ limit: 6 }), null),
      this.loadIntegrations(),
    ]);

    const accounts = accountModel.getAll();
    const proxies = proxyModel.list();
    const tokenAccounts: TokenView[] = tokenModel.list().map((item) => ({
      ...item,
      provider_label: tokenModel.getProviderLabel(item.provider),
      snapshot: this.parseJson(item.snapshot_json, null),
    }));
    const recentMails = mailModel.getRecentSummary(12);

    const derivedItems = this.collectBaseActions({
      accounts,
      proxies,
      tokenAccounts,
      recentMails,
      newspaper,
      integrations,
      memory,
    });
    const ruleItems = this.evaluateRules(rules, { tokenAccounts, accounts, proxies, newspaper, integrations });
    const allItems = this.applyActionStates(this.dedupeActionItems([...derivedItems, ...ruleItems]), actionStates);
    const inbox = allItems
      .filter((item) => item.status !== 'done' && item.status !== 'muted')
      .sort((a, b) => this.weight(b) - this.weight(a));
    const alerts = inbox.filter((item) => item.type === 'alert' || item.severity === 'critical').slice(0, 12);
    const priorities = inbox.filter((item) => item.severity === 'critical' || item.severity === 'high').slice(0, 6);
    const highlights = inbox.filter((item) => item.type === 'update').slice(0, 6);
    const entities = this.buildEntities({ accounts, tokenAccounts, recentMails, integrations, inbox });
    const commandCenter = this.buildCommandCenter({ accounts, tokenAccounts, integrations, entities, memory });

    return {
      generatedAt: new Date().toISOString(),
      today: {
        headline: priorities[0]?.title || '今天没有新的高危事项',
        summary: this.buildTodaySummary(priorities, alerts, highlights),
        questions: [
          { key: 'must_do', label: '必须现在处理什么？', answer: priorities[0]?.title || '目前没有立即阻塞项，优先处理 Inbox 中的高优先级动作。' },
          { key: 'account_risks', label: '哪几个账户异常？', answer: alerts.slice(0, 2).map((item) => item.title).join('；') || '暂无明显账户级异常。' },
          { key: 'signal_changes', label: '今天有什么重要变化？', answer: highlights.slice(0, 2).map((item) => item.title).join('；') || '新闻、邮件和集成状态暂无关键变化。' },
          { key: 'next_step', label: '我下一步点哪里？', answer: priorities[0]?.actionPath || '/inbox' },
        ],
        priorities,
        anomalies: alerts,
        highlights,
      },
      inbox: inbox.slice(0, 50),
      alerts,
      entities,
      rules,
      memory,
      commandCenter,
      stats: {
        inboxCount: inbox.length,
        alertCount: alerts.length,
        entityCount: entities.length,
        pinnedMemoryCount: memory.filter((item) => item.is_pinned).length,
        ruleCount: rules.length,
      },
    };
  }

  async search(query: string): Promise<CommandCenterItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) {
      if (this.workspaceCache && this.workspaceCache.expiresAt > Date.now()) {
        return this.workspaceCache.value.commandCenter.slice(0, 20);
      }
      return this.moduleCommands.slice(0, 20);
    }

    const staticMatches = this.filterCommands(this.moduleCommands, q);
    if (staticMatches.length >= 5 && !this.workspaceCache) {
      return staticMatches.slice(0, 20);
    }

    const workspace = await this.getWorkspace();

    return this.dedupeCommands([...staticMatches, ...this.filterCommands(workspace.commandCenter, q)]).slice(0, 20);
  }

  listRules() {
    return ruleModel.list();
  }

  createRule(data: Partial<PersonalOsRuleView>) {
    const created = ruleModel.create(this.normalizeRuleInput(data));
    this.invalidateWorkspaceCache();
    return created;
  }

  updateRule(id: number, data: Partial<PersonalOsRuleView>) {
    const updated = ruleModel.update(id, this.normalizeRuleInput(data, true));
    this.invalidateWorkspaceCache();
    return updated;
  }

  deleteRule(id: number) {
    const deleted = ruleModel.delete(id);
    this.invalidateWorkspaceCache();
    return deleted;
  }

  setActionState(actionId: string, status: 'active' | 'done' | 'muted', note = '') {
    if (status === 'active') {
      actionStateModel.clear(actionId);
      this.invalidateWorkspaceCache();
      return { action_id: actionId, status, note: '', cleared: true };
    }

    const updated = actionStateModel.upsert(actionId, status, note);
    this.invalidateWorkspaceCache();
    return updated;
  }

  listMemory() {
    return memoryModel.list();
  }

  createMemory(data: Partial<PersonalMemoryView>) {
    const created = memoryModel.create(data);
    this.invalidateWorkspaceCache();
    return created;
  }

  updateMemory(id: number, data: Partial<PersonalMemoryView>) {
    const updated = memoryModel.update(id, data);
    this.invalidateWorkspaceCache();
    return updated;
  }

  deleteMemory(id: number) {
    const deleted = memoryModel.delete(id);
    this.invalidateWorkspaceCache();
    return deleted;
  }

  private async loadIntegrations(): Promise<IntegrationSnapshot> {
    const githubRecord = integrationTokenModel.get('github');
    const cloudflareRecord = integrationTokenModel.get('cloudflare');
    const notionRecord = integrationTokenModel.get('notion');

    const [github, cloudflare, notion] = await Promise.all([
      githubRecord ? this.safe(() => integrationService.fetchGitHubData(githubRecord), null) : Promise.resolve(null),
      cloudflareRecord ? this.safe(() => integrationService.fetchCloudflareData(cloudflareRecord), null) : Promise.resolve(null),
      notionRecord ? this.safe(() => integrationService.fetchNotionData(notionRecord), null) : Promise.resolve(null),
    ]);

    return { github, cloudflare, notion };
  }

  private collectBaseActions(input: {
    accounts: ReturnType<AccountModel['getAll']>;
    proxies: ReturnType<ProxyModel['list']>;
    tokenAccounts: TokenView[];
    recentMails: ReturnType<MailCacheModel['getRecentSummary']>;
    newspaper: NewspaperBriefing | null;
    integrations: IntegrationSnapshot;
    memory: PersonalMemoryView[];
  }): ActionCenterItem[] {
    const items: ActionCenterItem[] = [];
    const now = Date.now();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    for (const account of input.accounts.filter((item) => item.status === 'error')) {
      items.push({
        id: `account-error-${account.id}`,
        title: `${account.email} 授权异常`,
        summary: '邮箱状态为 error，需要检查 token、密码或 IMAP/SMTP 配置。',
        source: 'accounts',
        type: 'alert',
        severity: 'critical',
        entityType: 'account',
        entityKey: account.email,
        actionLabel: '打开邮箱',
        actionPath: `/accounts?search=${encodeURIComponent(account.email)}`,
        occurredAt: account.updated_at,
      });
    }

    for (const proxy of input.proxies.filter((item) => item.status === 'failed' || !item.is_enabled)) {
      items.push({
        id: `proxy-${proxy.id}`,
        title: `${proxy.name || proxy.host}:${proxy.port} 代理异常`,
        summary: proxy.is_enabled ? '代理最近测试失败，建议复测或切换默认代理。' : '代理已禁用，确认是否仍影响关键账户。',
        source: 'proxy',
        type: 'alert',
        severity: proxy.status === 'failed' ? 'high' : 'medium',
        entityType: 'proxy',
        entityKey: String(proxy.id),
        actionLabel: '查看代理',
        actionPath: '/proxy',
        occurredAt: proxy.last_tested_at,
      });
    }

    for (const token of input.tokenAccounts.filter((item) => item.status === 'error')) {
      items.push({
        id: `token-error-${token.id}`,
        title: `${token.name || token.provider_label} Token 异常`,
        summary: token.last_error || '同步失败或认证异常，需要检查 session / API 配置。',
        source: 'tokens',
        type: 'alert',
        severity: 'critical',
        entityType: 'token',
        entityKey: String(token.id),
        actionLabel: '查看 Token',
        actionPath: '/tokens',
        occurredAt: token.updated_at,
      });
    }

    for (const token of input.tokenAccounts.filter((item) => {
      const card = item.snapshot?.cards?.find((entry: any) => typeof entry.remainingPct === 'number');
      return typeof card?.remainingPct === 'number' && card.remainingPct <= 20;
    })) {
      const quota = token.snapshot.cards.find((entry: any) => typeof entry.remainingPct === 'number');
      items.push({
        id: `token-low-${token.id}`,
        title: `${token.name || token.provider_label} 额度偏低`,
        summary: `${quota?.label || '剩余额度'} 仅剩 ${quota?.remainingText || `${quota?.remainingPct}%`}。`,
        source: 'tokens',
        type: 'urgent',
        severity: quota?.remainingPct <= 10 ? 'critical' : 'high',
        entityType: 'token',
        entityKey: String(token.id),
        actionLabel: '处理 Token',
        actionPath: '/tokens',
        occurredAt: token.last_synced_at,
      });
    }

    for (const account of input.accounts.filter((item) => item.token_refreshed_at && now - new Date(item.token_refreshed_at).getTime() > sixtyDaysMs)) {
      items.push({
        id: `account-stale-${account.id}`,
        title: `${account.email} 长时间未刷新`,
        summary: '超过 60 天未刷新 token，建议尽快检查授权是否还能用。',
        source: 'accounts',
        type: 'urgent',
        severity: 'high',
        entityType: 'account',
        entityKey: account.email,
        actionLabel: '打开账户',
        actionPath: `/accounts?search=${encodeURIComponent(account.email)}`,
        occurredAt: account.token_refreshed_at,
      });
    }

    for (const mail of input.recentMails.slice(0, 5)) {
      items.push({
        id: `mail-${mail.id}`,
        title: `新邮件：${mail.subject || '(无主题)'}`,
        summary: `${mail.account_email || '未知账户'} · ${mail.sender_name || mail.sender || '未知发件人'}`,
        source: 'mail',
        type: 'update',
        severity: 'medium',
        entityType: 'account',
        entityKey: mail.account_email || String(mail.account_id),
        actionLabel: '查看邮件',
        actionPath: `/accounts?search=${encodeURIComponent(mail.account_email || '')}`,
        occurredAt: mail.mail_date,
      });
    }

    if (input.integrations.github) {
      for (const pr of input.integrations.github.pulls.slice(0, 4)) {
        items.push({
          id: `github-pr-${pr.id}`,
          title: `GitHub 待处理 PR #${pr.number}`,
          summary: `${pr.repo_full_name} · ${pr.title}`,
          source: 'github',
          type: 'urgent',
          severity: pr.draft ? 'medium' : 'high',
          entityType: 'repository',
          entityKey: pr.repo_full_name,
          actionLabel: '打开 GitHub',
          actionPath: '/github',
          occurredAt: pr.updated_at,
        });
      }
      for (const issue of input.integrations.github.issues.slice(0, 4)) {
        items.push({
          id: `github-issue-${issue.id}`,
          title: `GitHub Issue #${issue.number}`,
          summary: `${issue.repo_full_name} · ${issue.title}`,
          source: 'github',
          type: 'update',
          severity: issue.comments > 0 ? 'high' : 'medium',
          entityType: 'repository',
          entityKey: issue.repo_full_name,
          actionLabel: '查看仓库',
          actionPath: '/github',
          occurredAt: issue.updated_at,
        });
      }
    }

    if (input.integrations.cloudflare) {
      for (const zone of input.integrations.cloudflare.zones.filter((item) => item.status !== 'active' || item.paused).slice(0, 4)) {
        items.push({
          id: `cloudflare-zone-${zone.id}`,
          title: `${zone.name} Cloudflare 风险变更`,
          summary: zone.paused ? '当前处于暂停状态。' : `Zone 状态为 ${zone.status}。`,
          source: 'cloudflare',
          type: 'alert',
          severity: zone.status !== 'active' ? 'critical' : 'high',
          entityType: 'domain',
          entityKey: zone.name,
          actionLabel: '查看域名',
          actionPath: '/cloudflare',
          occurredAt: zone.modified_on,
        });
      }
    }

    if (input.integrations.notion) {
      for (const page of input.integrations.notion.pages.slice(0, 4)) {
        items.push({
          id: `notion-page-${page.id}`,
          title: `Notion 最近编辑：${page.title}`,
          summary: '来自个人知识库的最新编辑内容，可沉淀为上下文或任务。',
          source: 'notion',
          type: 'update',
          severity: 'low',
          entityType: 'project',
          entityKey: page.title,
          actionLabel: '打开 Notion',
          actionPath: '/notion',
          occurredAt: page.last_edited_time,
        });
      }
    }

    if (input.newspaper) {
      for (const article of input.newspaper.sections.flatMap((section) => section.items.slice(0, 1)).slice(0, 4)) {
        items.push({
          id: `news-${article.url}`,
          title: article.titleZh || article.title,
          summary: `${article.source} · ${article.summaryZh || article.summary}`,
          source: 'news',
          type: 'update',
          severity: article.matchedKeywords.length >= 2 ? 'high' : 'medium',
          entityType: 'news',
          entityKey: article.url,
          actionLabel: '打开报纸',
          actionPath: '/newspaper',
          occurredAt: article.publishedAt,
        });
      }
    }

    for (const note of input.memory.filter((item) => item.is_pinned && !item.is_resolved).slice(0, 4)) {
      items.push({
        id: `memory-${note.id}`,
        title: `记忆提醒：${note.title}`,
        summary: note.content.slice(0, 80),
        source: 'memory',
        type: 'update',
        severity: note.kind === 'risk' ? 'high' : 'medium',
        entityType: note.entity_type || 'memory',
        entityKey: note.entity_key || String(note.id),
        actionLabel: '查看记忆',
        actionPath: '/memory',
        occurredAt: note.updated_at,
      });
    }

    return items;
  }

  private evaluateRules(
    rules: PersonalOsRuleView[],
    context: { tokenAccounts: TokenView[]; accounts: any[]; proxies: any[]; newspaper: NewspaperBriefing | null; integrations: IntegrationSnapshot }
  ): ActionCenterItem[] {
    const items: ActionCenterItem[] = [];

    for (const rule of rules.filter((item) => item.is_enabled)) {
      if (rule.trigger_type === 'token_low_remaining_pct') {
        const threshold = Number(rule.config.thresholdPct ?? 20);
        let hit = false;
        for (const token of context.tokenAccounts) {
          const card = token.snapshot?.cards?.find((entry: any) => typeof entry.remainingPct === 'number');
          if (typeof card?.remainingPct === 'number' && card.remainingPct <= threshold) {
            hit = true;
            items.push({
              id: `rule-${rule.id}-token-${token.id}`,
              title: `${rule.name} 命中`,
              summary: `${token.name || token.provider_label} 低于阈值 ${threshold}%`,
              source: 'rules',
              type: 'rule',
              severity: card.remainingPct <= Math.max(10, threshold / 2) ? 'critical' : 'high',
              entityType: 'token',
              entityKey: String(token.id),
              actionLabel: '查看 Token',
              actionPath: '/tokens',
              occurredAt: token.last_synced_at,
              metadata: { ruleId: rule.id },
            });
          }
        }
        if (hit) ruleModel.markTriggered(rule.id);
      }

      if (rule.trigger_type === 'account_error') {
        let hit = false;
        for (const account of context.accounts.filter((item) => item.status === 'error')) {
          hit = true;
          items.push({
            id: `rule-${rule.id}-account-${account.id}`,
            title: `${rule.name} 命中`,
            summary: `${account.email} 当前为异常状态`,
            source: 'rules',
            type: 'rule',
            severity: 'critical',
            entityType: 'account',
            entityKey: account.email,
            actionLabel: '查看账户',
            actionPath: `/accounts?search=${encodeURIComponent(account.email)}`,
            occurredAt: account.updated_at,
            metadata: { ruleId: rule.id },
          });
        }
        if (hit) ruleModel.markTriggered(rule.id);
      }

      if (rule.trigger_type === 'proxy_failed') {
        let hit = false;
        for (const proxy of context.proxies.filter((item) => item.status === 'failed')) {
          hit = true;
          items.push({
            id: `rule-${rule.id}-proxy-${proxy.id}`,
            title: `${rule.name} 命中`,
            summary: `${proxy.name || proxy.host}:${proxy.port} 最近测试失败`,
            source: 'rules',
            type: 'rule',
            severity: 'high',
            entityType: 'proxy',
            entityKey: String(proxy.id),
            actionLabel: '查看代理',
            actionPath: '/proxy',
            occurredAt: proxy.last_tested_at,
            metadata: { ruleId: rule.id },
          });
        }
        if (hit) ruleModel.markTriggered(rule.id);
      }

      if (rule.trigger_type === 'keyword_in_news' && context.newspaper) {
        const keyword = String(rule.config.keyword || '').trim().toLowerCase();
        if (!keyword) continue;
        const matches = context.newspaper.sections.flatMap((section) => section.items).filter((item) =>
          [item.title, item.titleZh, item.summary, item.summaryZh].join(' ').toLowerCase().includes(keyword)
        ).slice(0, 4);
        for (const article of matches) {
          items.push({
            id: `rule-${rule.id}-news-${article.url}`,
            title: `${rule.name} 命中`,
            summary: `新闻关键词 “${keyword}” 出现在 ${article.titleZh || article.title}`,
            source: 'rules',
            type: 'rule',
            severity: 'medium',
            entityType: 'news',
            entityKey: article.url,
            actionLabel: '查看报纸',
            actionPath: '/newspaper',
            occurredAt: article.publishedAt,
            metadata: { ruleId: rule.id },
          });
        }
        if (matches.length) ruleModel.markTriggered(rule.id);
      }

      if (rule.trigger_type === 'github_repo_activity' && context.integrations.github) {
        const repoName = String(rule.config.repo || '').trim().toLowerCase();
        if (!repoName) continue;
        const matches = context.integrations.github.repos.filter((item) => item.full_name.toLowerCase().includes(repoName)).slice(0, 3);
        for (const repo of matches) {
          items.push({
            id: `rule-${rule.id}-repo-${repo.id}`,
            title: `${rule.name} 命中`,
            summary: `${repo.full_name} 最近有仓库动态`,
            source: 'rules',
            type: 'rule',
            severity: 'medium',
            entityType: 'repository',
            entityKey: repo.full_name,
            actionLabel: '打开 GitHub',
            actionPath: '/github',
            occurredAt: repo.updated_at,
            metadata: { ruleId: rule.id },
          });
        }
        if (matches.length) ruleModel.markTriggered(rule.id);
      }
    }

    return items;
  }

  private buildEntities(input: {
    accounts: ReturnType<AccountModel['getAll']>;
    tokenAccounts: TokenView[];
    recentMails: ReturnType<MailCacheModel['getRecentSummary']>;
    integrations: IntegrationSnapshot;
    inbox: ActionCenterItem[];
  }): PersonalEntityView[] {
    const entities: PersonalEntityView[] = [];

    for (const account of input.accounts.slice(0, 20)) {
      const domain = account.email.split('@')[1] || '';
      const links: PersonalEntityLink[] = [
        { kind: 'account', label: '邮箱', value: account.email, path: `/accounts?search=${encodeURIComponent(account.email)}`, status: account.status, updatedAt: account.updated_at },
      ];
      if (domain) {
        links.push({ kind: 'domain', label: '域名', value: domain, path: '/cloudflare', status: 'linked', updatedAt: account.updated_at });
      }
      const relatedMail = input.recentMails.find((item) => item.account_email === account.email);
      if (relatedMail) {
        links.push({ kind: 'mail', label: '最近邮件', value: relatedMail.subject || '(无主题)', path: `/accounts?search=${encodeURIComponent(account.email)}`, updatedAt: relatedMail.mail_date });
      }
      const relatedTokens = input.tokenAccounts.filter((item) => (item.login_hint || '').includes(account.email) || (item.name || '').includes(account.email));
      for (const token of relatedTokens.slice(0, 2)) {
        links.push({ kind: 'token', label: 'Token', value: token.name || token.provider_label, path: '/tokens', status: token.status, updatedAt: token.updated_at });
      }

      const relatedActionIds = input.inbox.filter((item) => item.entityKey === account.email).map((item) => item.id);
      entities.push({
        id: `entity-account-${account.id}`,
        type: 'account',
        name: account.email,
        description: account.remark || `Provider: ${account.provider}`,
        health: account.status === 'error' ? 'critical' : relatedActionIds.length ? 'watch' : 'healthy',
        links,
        relatedActionIds,
      });
    }

    if (input.integrations.github) {
      for (const repo of input.integrations.github.repos.slice(0, 12)) {
        const relatedActionIds = input.inbox.filter((item) => item.entityKey === repo.full_name).map((item) => item.id);
        entities.push({
          id: `entity-repo-${repo.id}`,
          type: 'repository',
          name: repo.full_name,
          description: repo.description || 'GitHub repository',
          health: relatedActionIds.length ? 'watch' : 'healthy',
          links: [
            { kind: 'github', label: '仓库', value: repo.full_name, path: '/github', updatedAt: repo.updated_at },
            ...(repo.language ? [{ kind: 'language', label: '语言', value: repo.language, path: '/github' }] : []),
          ],
          relatedActionIds,
        });
      }
    }

    if (input.integrations.cloudflare) {
      for (const zone of input.integrations.cloudflare.zones.slice(0, 12)) {
        const relatedActionIds = input.inbox.filter((item) => item.entityKey === zone.name).map((item) => item.id);
        entities.push({
          id: `entity-domain-${zone.id}`,
          type: 'domain',
          name: zone.name,
          description: `Cloudflare Zone · ${zone.status}`,
          health: zone.status === 'active' && !zone.paused ? (relatedActionIds.length ? 'watch' : 'healthy') : 'critical',
          links: [
            { kind: 'cloudflare', label: 'Zone', value: zone.name, path: '/cloudflare', status: zone.status, updatedAt: zone.modified_on },
            { kind: 'ns', label: 'Name Servers', value: (zone.name_servers || []).join(', '), path: '/cloudflare' },
          ],
          relatedActionIds,
        });
      }
    }

    return entities.slice(0, 48);
  }

  private buildCommandCenter(input: {
    accounts: ReturnType<AccountModel['getAll']>;
    tokenAccounts: TokenView[];
    integrations: IntegrationSnapshot;
    entities: PersonalEntityView[];
    memory: PersonalMemoryView[];
  }): CommandCenterItem[] {
    const items: CommandCenterItem[] = [...this.moduleCommands];

    for (const account of input.accounts.slice(0, 20)) {
      items.push({ id: `account-${account.id}`, kind: 'search', title: account.email, subtitle: `邮箱账户 · ${account.provider}`, path: `/accounts?search=${encodeURIComponent(account.email)}`, keywords: ['email', 'account', account.provider, account.email] });
    }
    for (const token of input.tokenAccounts.slice(0, 15)) {
      items.push({ id: `token-${token.id}`, kind: 'search', title: token.name || token.provider_label, subtitle: `Token 账户 · ${token.provider_label}`, path: '/tokens', keywords: ['token', token.provider_label, token.name || '', token.login_hint || ''] });
    }
    for (const entity of input.entities.slice(0, 20)) {
      items.push({ id: entity.id, kind: 'search', title: entity.name, subtitle: `${entity.type} · ${entity.description}`, path: '/entities', keywords: [entity.type, entity.name, entity.description, ...entity.links.map((item) => item.value)] });
    }
    for (const note of input.memory.slice(0, 15)) {
      items.push({ id: `memory-${note.id}`, kind: 'search', title: note.title, subtitle: `Memory · ${note.kind}`, path: '/memory', keywords: ['memory', note.kind, note.title, note.content, ...note.tags] });
    }
    if (input.integrations.notion) {
      for (const page of input.integrations.notion.pages.slice(0, 12)) {
        items.push({ id: `notion-${page.id}`, kind: 'search', title: page.title, subtitle: 'Notion 页面', path: '/notion', keywords: ['notion', 'page', page.title] });
      }
    }
    if (input.integrations.github) {
      for (const repo of input.integrations.github.repos.slice(0, 12)) {
        items.push({ id: `repo-${repo.id}`, kind: 'search', title: repo.full_name, subtitle: 'GitHub 仓库', path: '/github', keywords: ['github', 'repo', repo.full_name, repo.language || ''] });
      }
    }

    return items.slice(0, 120);
  }

  private buildTodaySummary(priorities: ActionCenterItem[], alerts: ActionCenterItem[], highlights: ActionCenterItem[]) {
    const firstPriority = priorities[0]?.title || '暂无必须立即处理的动作';
    const alertSummary = alerts.length ? `异常 ${alerts.length} 项` : '无明显异常';
    const highlightSummary = highlights[0]?.title || '没有新的重点动态';
    return `${firstPriority}；${alertSummary}；${highlightSummary}。`;
  }

  private parseJson<T>(raw: string, fallback: T): T {
    try {
      return raw ? JSON.parse(raw) as T : fallback;
    } catch {
      return fallback;
    }
  }

  private weight(item: ActionCenterItem) {
    const severityMap = { critical: 400, high: 300, medium: 200, low: 100 };
    const typeMap = { urgent: 40, alert: 30, rule: 20, update: 10 };
    const occurredAt = item.occurredAt ? new Date(item.occurredAt).getTime() / 1e10 : 0;
    return severityMap[item.severity] + typeMap[item.type] + occurredAt;
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private dedupeActionItems(items: ActionCenterItem[]) {
    const seen = new Map<string, ActionCenterItem>();
    for (const item of items) {
      const key = [item.entityType, item.entityKey, item.actionPath, item.severity].join(':');
      const existing = seen.get(key);
      if (!existing || this.weight(item) > this.weight(existing)) {
        seen.set(key, item);
      }
    }
    return [...seen.values()];
  }

  private applyActionStates(
    items: ActionCenterItem[],
    states: Map<string, { status: 'active' | 'done' | 'muted'; note: string; updated_at: string }>
  ): ActionCenterItem[] {
    return items.map((item) => {
      const state = states.get(item.id);
      if (!state) return { ...item, status: 'active' };
      return {
        ...item,
        status: state.status,
        stateNote: state.note,
        stateUpdatedAt: state.updated_at,
      };
    });
  }

  private invalidateWorkspaceCache() {
    this.workspaceCache = null;
  }

  private filterCommands(items: CommandCenterItem[], query: string) {
    return items.filter((item) => [item.title, item.subtitle, ...item.keywords].join(' ').toLowerCase().includes(query));
  }

  private dedupeCommands(items: CommandCenterItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  private normalizeRuleInput(data: Partial<PersonalOsRuleView>, partial = false): Partial<PersonalOsRuleView> {
    const normalized: Partial<PersonalOsRuleView> = { ...data };
    if (!partial && !normalized.trigger_type) {
      normalized.trigger_type = 'account_error';
    }

    if (normalized.scope !== undefined && !VALID_RULE_SCOPES.has(normalized.scope)) {
      throw new PersonalOSValidationError(`Invalid rule scope: ${normalized.scope}`);
    }

    if (normalized.trigger_type !== undefined && !VALID_RULE_TRIGGER_TYPES.has(normalized.trigger_type)) {
      throw new PersonalOSValidationError(`Invalid rule trigger_type: ${normalized.trigger_type}`);
    }

    if (
      normalized.config !== undefined &&
      (normalized.config === null || Array.isArray(normalized.config) || typeof normalized.config !== 'object')
    ) {
      throw new PersonalOSValidationError('Rule config must be an object');
    }

    return normalized;
  }
}
