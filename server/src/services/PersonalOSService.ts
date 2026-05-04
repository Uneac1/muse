import { AccountModel } from '../models/Account';
import { AiAccountModel } from '../models/AiChat';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { MailCacheModel } from '../models/MailCache';
import { PersonalActionStateModel, PersonalMemoryModel, PersonalOsRuleModel } from '../models/PersonalOS';
import { ProxyModel } from '../models/Proxy';
import { TagModel } from '../models/Tag';
import { TokenAccountModel } from '../models/TokenAccount';
import { config } from '../config';
import { IntegrationService } from './IntegrationService';
import { YmailService } from './YmailService';
import type { AiChatService } from './AiChatService';
import type { NewspaperService } from './NewspaperService';
import type {
  ActionCenterItem,
  AiMessage,
  CloudflareIntegrationData,
  CommandCenterItem,
  GitHubIntegrationData,
  LinuxDoIntegrationData,
  MiSubIntegrationData,
  NewspaperBriefing,
  NotionIntegrationData,
  PersonalAccountAiPlan,
  PersonalAccountAiSuggestion,
  PersonalMemory,
  PersonalMemoryAiPlan,
  PersonalMemoryAiSuggestion,
  PersonalProxyAiPlan,
  PersonalProxyAiSuggestion,
  PersonalEntityLink,
  PersonalEntityView,
  PersonalMemoryView,
  PersonalOsRuleView,
  PersonalOsWorkspace,
  PersonalRuleTriggerType,
  PersonalTokenAiPlan,
  PersonalTokenAiSuggestion,
  YmailIntegrationData,
} from '../types';

const accountModel = new AccountModel();
const aiAccountModel = new AiAccountModel();
const mailModel = new MailCacheModel();
const proxyModel = new ProxyModel();
const tokenModel = new TokenAccountModel();
const integrationTokenModel = new IntegrationTokenModel();
const ruleModel = new PersonalOsRuleModel();
const memoryModel = new PersonalMemoryModel();
const actionStateModel = new PersonalActionStateModel();
const tagModel = new TagModel();
const integrationService = new IntegrationService();
const ymailService = new YmailService();
let newspaperServiceSingleton: NewspaperService | null = null;

function getNewspaperService(): NewspaperService {
  if (!newspaperServiceSingleton) {
    newspaperServiceSingleton = require('./NewspaperService').newspaperService as NewspaperService;
  }
  return newspaperServiceSingleton;
}

type TokenView = ReturnType<TokenAccountModel['list']>[number] & { provider_label: string; snapshot: any };
type IntegrationSnapshot = {
  github: GitHubIntegrationData | null;
  cloudflare: CloudflareIntegrationData | null;
  notion: NotionIntegrationData | null;
  misub: MiSubIntegrationData | null;
  linuxdo: LinuxDoIntegrationData | null;
  ymail: YmailIntegrationData | null;
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

const VALID_MEMORY_KINDS = new Set<PersonalMemory['kind']>(['note', 'project', 'risk', 'preference']);

function parseJsonLoose<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
    throw new Error('invalid ai json');
  }
}

export class PersonalOSService {
  private workspaceCache: { expiresAt: number; value: PersonalOsWorkspace } | null = null;
  private inflightWorkspace: Promise<PersonalOsWorkspace> | null = null;
  private aiChatService: AiChatService | null = null;
  private readonly moduleCommands: CommandCenterItem[] = [
    { id: 'cmd-today', kind: 'open', title: '打开 Today', subtitle: '查看今日优先级和异常', path: '/today', keywords: ['today', 'dashboard', 'priority', '异常'] },
    { id: 'cmd-inbox', kind: 'open', title: '打开 Inbox', subtitle: '查看全部邮箱聚合邮件', path: '/inbox', keywords: ['inbox', 'mail', 'email', '邮箱', '邮件'] },
    { id: 'cmd-memory', kind: 'open', title: '打开 Memory & Rules', subtitle: '个人上下文、规则与自动化', path: '/memory', keywords: ['memory', 'rules', 'automation', 'note', 'context', '提醒'] },
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

  private getAiChatService() {
    if (!this.aiChatService) {
      const { AiChatService } = require('./AiChatService') as { AiChatService: new () => AiChatService };
      this.aiChatService = new AiChatService();
    }
    return this.aiChatService;
  }

  private async buildWorkspace(): Promise<PersonalOsWorkspace> {
    const [rules, memory, actionStates, newspaper, integrations] = await Promise.all([
      Promise.resolve(ruleModel.list()),
      Promise.resolve(memoryModel.list()),
      Promise.resolve(actionStateModel.mapByActionId()),
      Promise.resolve(getNewspaperService().getCachedBriefing(6)),
      this.loadIntegrations(),
    ]);

    const accounts = accountModel.getAll();
    const aiAccounts = aiAccountModel.list();
    const proxies = proxyModel.list();
    const tokenAccounts: TokenView[] = tokenModel.list().map((item) => ({
      ...item,
      provider_label: tokenModel.getProviderLabel(item.provider),
      snapshot: this.parseJson(item.snapshot_json, null),
    }));
    const recentMails = mailModel.getRecentSummary(20);
    const unifiedInboxRecentMails = recentMails.slice(0, 5);

    const derivedItems = this.collectBaseActions({
      accounts,
      aiAccounts,
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
    const priorities = this.buildTodayPriorities(inbox);
    const highlights = this.buildTodayHighlights(inbox);
    const nextAction = priorities[0] || highlights[0] || inbox[0] || null;
    const entities = this.buildEntities({ accounts, tokenAccounts, recentMails, integrations, inbox });
    const commandCenter = this.buildCommandCenter({ accounts, tokenAccounts, integrations, entities, memory });

    return {
      generatedAt: new Date().toISOString(),
      today: {
        headline: nextAction?.title || '今天先从 Inbox、报纸和 Notion 开始',
        summary: this.buildTodaySummary(priorities, alerts, highlights),
        questions: [
          { key: 'must_do', label: '必须现在处理什么？', answer: nextAction?.title || '先看 Inbox、报纸和 Notion，把今天的主线抓出来。' },
          { key: 'account_risks', label: '哪几个账户异常？', answer: alerts.slice(0, 2).map((item) => item.title).join('；') || '暂无明显账户级异常。' },
          { key: 'signal_changes', label: '今天有什么重要变化？', answer: highlights.slice(0, 2).map((item) => item.title).join('；') || '新闻、邮件和集成状态暂无关键变化。' },
          { key: 'next_step', label: '我下一步点哪里？', answer: this.buildTodayNextStep(nextAction) },
        ],
        priorities,
        anomalies: alerts,
        highlights,
      },
      inbox: inbox.slice(0, 50),
      recentMails: unifiedInboxRecentMails,
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

  async planMemoryWithAi(input?: { accountId?: number | null; focus?: string | null }): Promise<PersonalMemoryAiPlan> {
    const workspace = await this.getWorkspace();
    const history: AiMessage[] = [
      {
        id: 0,
        thread_id: 0,
        role: 'user',
        content: this.buildMemoryManagerPrompt(workspace.memory, workspace.inbox, input?.focus || ''),
        created_at: new Date().toISOString(),
      },
    ];

    const prompt = [
      '你是 Muse 的记忆管理器，只负责整理个人记忆。',
      '输出必须是 JSON，对现有记忆进行去重、归类、补标题、补标签、标记过期或已完成。',
      '不要输出 markdown，不要解释，不要包裹代码块。',
      'suggestions 最多返回 8 条，reason 要简短明确。',
      'type 只能是 create、update、resolve。',
      'update / resolve 必须带 target_id；create 不要带 target_id。',
    ].join('\n');
    const { account, raw, requestedAccount, fallbackReason } = await this.sendStructuredAiPrompt(input?.accountId, history, prompt);
    const parsed = parseJsonLoose<{ summary?: string; suggestions?: any[] }>(raw);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((item) => this.normalizeAiSuggestion(item)).filter(Boolean) as PersonalMemoryAiSuggestion[]
      : [];

    return {
      requestedAccountId: requestedAccount?.id ?? input?.accountId ?? null,
      requestedAccountName: requestedAccount ? (requestedAccount.name || requestedAccount.provider) : undefined,
      accountId: account.id,
      accountName: account.name || account.provider,
      model: account.model,
      usedFallback: !!requestedAccount && requestedAccount.id !== account.id,
      fallbackReason,
      generatedAt: new Date().toISOString(),
      summary: String(parsed?.summary || 'AI 已完成一轮记忆整理建议。').trim(),
      suggestions: suggestions.slice(0, 8),
    };
  }

  applyMemoryAiPlan(input: { suggestions?: PersonalMemoryAiSuggestion[] }) {
    const suggestions = Array.isArray(input?.suggestions) ? input.suggestions : [];
    let applied = 0;

    for (const suggestion of suggestions.slice(0, 20)) {
      const normalized = this.normalizeAiSuggestion(suggestion);
      if (!normalized) continue;

      if (normalized.type === 'create') {
        memoryModel.create({
          title: normalized.title,
          content: normalized.content,
          kind: normalized.kind,
          tags: normalized.tags,
          source: 'ai-manager',
          entity_type: normalized.entity_type,
          entity_key: normalized.entity_key,
          is_pinned: normalized.is_pinned ?? 0,
          is_resolved: normalized.is_resolved ?? 0,
          last_reviewed_at: new Date().toISOString(),
        });
        applied += 1;
        continue;
      }

      const targetId = Number(normalized.target_id);
      if (!Number.isFinite(targetId)) continue;
      const current = memoryModel.getById(targetId);
      if (!current) continue;

      if (normalized.type === 'resolve') {
        memoryModel.update(targetId, {
          is_resolved: 1,
          last_reviewed_at: new Date().toISOString(),
        });
        applied += 1;
        continue;
      }

      memoryModel.update(targetId, {
        title: normalized.title || current.title,
        content: normalized.content || current.content,
        kind: normalized.kind || current.kind,
        tags: normalized.tags?.length ? normalized.tags : current.tags,
        entity_type: normalized.entity_type ?? current.entity_type,
        entity_key: normalized.entity_key ?? current.entity_key,
        is_pinned: normalized.is_pinned ?? current.is_pinned,
        is_resolved: normalized.is_resolved ?? current.is_resolved,
        last_reviewed_at: new Date().toISOString(),
      });
      applied += 1;
    }

    this.invalidateWorkspaceCache();
    return {
      applied,
      memory: memoryModel.list(),
    };
  }

  async planAccountsWithAi(input?: { accountId?: number | null; focus?: string | null }): Promise<PersonalAccountAiPlan> {
    const accounts = accountModel.getAll();
    const history: AiMessage[] = [
      {
        id: 0,
        thread_id: 0,
        role: 'user',
        content: this.buildAccountManagerPrompt(accounts, input?.focus || ''),
        created_at: new Date().toISOString(),
      },
    ];

    const prompt = [
      '你是 Muse 的邮箱账户管理器，只负责整理邮箱账户元数据，不要编造不存在的凭证。',
      '输出必须是 JSON，不要输出 markdown，不要解释，不要包裹代码块。',
      'suggestions 最多返回 12 条。',
      'type 只能是 update。',
      '每条 suggestion 都必须带 target_id。',
      '只能更新 mode、status、remark、tag_names 这四类字段，不要输出 email、password、refresh_token、client_id、client_secret。',
      'tag_names 只保留 1 到 4 个短标签，优先表达 provider、用途、状态或域名。',
      'remark 要短、清晰、便于人工筛选，避免废话。',
      '只有在确实能提升管理效率时才给建议，不要为了凑数改每一条账户。',
    ].join('\n');

    const { account, raw, requestedAccount, fallbackReason } = await this.sendStructuredAiPrompt(input?.accountId, history, prompt);
    const parsed = parseJsonLoose<{ summary?: string; suggestions?: any[] }>(raw);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((item) => this.normalizeAiAccountSuggestion(item)).filter(Boolean) as PersonalAccountAiSuggestion[]
      : [];

    return {
      requestedAccountId: requestedAccount?.id ?? input?.accountId ?? null,
      requestedAccountName: requestedAccount ? (requestedAccount.name || requestedAccount.provider) : undefined,
      accountId: account.id,
      accountName: account.name || account.provider,
      model: account.model,
      usedFallback: !!requestedAccount && requestedAccount.id !== account.id,
      fallbackReason,
      generatedAt: new Date().toISOString(),
      summary: String(parsed?.summary || 'AI 已完成一轮邮箱账户整理建议。').trim(),
      suggestions: suggestions.slice(0, 12),
    };
  }

  applyAccountAiPlan(input: { suggestions?: PersonalAccountAiSuggestion[] }) {
    const suggestions = Array.isArray(input?.suggestions) ? input.suggestions : [];
    const existingTags = tagModel.list();
    let applied = 0;

    for (const suggestion of suggestions.slice(0, 20)) {
      const normalized = this.normalizeAiAccountSuggestion(suggestion);
      if (!normalized) continue;

      const current = accountModel.getById(normalized.target_id);
      if (!current) continue;

      const nextPayload: Record<string, any> = {};
      if (normalized.mode && normalized.mode !== current.mode) nextPayload.mode = normalized.mode;
      if (normalized.status && normalized.status !== current.status) nextPayload.status = normalized.status;
      if (normalized.remark !== undefined && normalized.remark !== current.remark) nextPayload.remark = normalized.remark;

      if (Object.keys(nextPayload).length > 0) {
        accountModel.update(current.id, nextPayload);
        applied += 1;
      }

      if (Array.isArray(normalized.tag_names)) {
        const nextTagIds = normalized.tag_names
          .map((name) => this.ensureTagByName(name, existingTags))
          .filter((id): id is number => Number.isFinite(id));
        const currentTagIds = (current.tags || []).map((tag) => tag.id).sort((a: number, b: number) => a - b);
        const sortedNext = [...new Set(nextTagIds)].sort((a, b) => a - b);
        if (JSON.stringify(currentTagIds) !== JSON.stringify(sortedNext)) {
          tagModel.setAccountTags(current.id, sortedNext);
          applied += 1;
        }
      }
    }

    this.invalidateWorkspaceCache();
    return {
      applied,
      accounts: accountModel.getAll(),
    };
  }

  async planProxiesWithAi(input?: { accountId?: number | null; focus?: string | null }): Promise<PersonalProxyAiPlan> {
    const proxies = proxyModel.list();
    const history: AiMessage[] = [
      {
        id: 0,
        thread_id: 0,
        role: 'user',
        content: this.buildProxyManagerPrompt(proxies, input?.focus || ''),
        created_at: new Date().toISOString(),
      },
    ];

    const prompt = [
      '你是 Muse 的代理治理器，只负责整理代理元数据和启停优先级。',
      '输出必须是 JSON，不要输出 markdown，不要解释，不要包裹代码块。',
      'suggestions 最多返回 10 条。',
      'type 只能是 update，且必须带 target_id。',
      '只能更新 name、is_enabled、is_default，不要输出 host、port、username、password。',
      '只有在确实提升可用性和维护效率时才提建议，不要为了凑数乱改。',
    ].join('\n');

    const { account, raw, requestedAccount, fallbackReason } = await this.sendStructuredAiPrompt(input?.accountId, history, prompt);
    const parsed = parseJsonLoose<{ summary?: string; suggestions?: any[] }>(raw);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((item) => this.normalizeAiProxySuggestion(item)).filter(Boolean) as PersonalProxyAiSuggestion[]
      : [];

    return {
      requestedAccountId: requestedAccount?.id ?? input?.accountId ?? null,
      requestedAccountName: requestedAccount ? (requestedAccount.name || requestedAccount.provider) : undefined,
      accountId: account.id,
      accountName: account.name || account.provider,
      model: account.model,
      usedFallback: !!requestedAccount && requestedAccount.id !== account.id,
      fallbackReason,
      generatedAt: new Date().toISOString(),
      summary: String(parsed?.summary || 'AI 已完成一轮代理治理建议。').trim(),
      suggestions: suggestions.slice(0, 10),
    };
  }

  applyProxyAiPlan(input: { suggestions?: PersonalProxyAiSuggestion[] }) {
    const suggestions = Array.isArray(input?.suggestions) ? input.suggestions : [];
    let applied = 0;

    for (const suggestion of suggestions.slice(0, 20)) {
      const normalized = this.normalizeAiProxySuggestion(suggestion);
      if (!normalized) continue;

      const current = proxyModel.getById(normalized.target_id);
      if (!current) continue;

      if (normalized.name !== undefined && normalized.name !== current.name) {
        proxyModel.update(current.id, { name: normalized.name });
        applied += 1;
      }

      if (normalized.is_enabled !== undefined && Number(current.is_enabled) !== Number(normalized.is_enabled)) {
        proxyModel.setEnabled(current.id, !!normalized.is_enabled);
        applied += 1;
      }

      if (normalized.is_default && !current.is_default) {
        proxyModel.setDefault(current.id);
        applied += 1;
      }
    }

    this.invalidateWorkspaceCache();
    return {
      applied,
      proxies: proxyModel.list(),
    };
  }

  async planTokensWithAi(input?: { accountId?: number | null; focus?: string | null }): Promise<PersonalTokenAiPlan> {
    const accounts = this.listTokenAccountViews();
    const history: AiMessage[] = [
      {
        id: 0,
        thread_id: 0,
        role: 'user',
        content: this.buildTokenManagerPrompt(accounts, input?.focus || ''),
        created_at: new Date().toISOString(),
      },
    ];

    const prompt = [
      '你是 Muse 的额度账号治理器，只负责整理账号管理字段，不要编造不存在的 token 或配额。',
      '输出必须是 JSON，不要输出 markdown，不要解释，不要包裹代码块。',
      'suggestions 最多返回 12 条。',
      'type 只能是 update，且必须带 target_id。',
      '只能更新 status、auto_sync_enabled、note，不要输出 access_token、refresh_token、session_payload、api_key。',
      '优先处理异常账号、重授权账号、缺失备注账号和自动同步策略。',
    ].join('\n');

    const { account, raw, requestedAccount, fallbackReason } = await this.sendStructuredAiPrompt(input?.accountId, history, prompt);
    const parsed = parseJsonLoose<{ summary?: string; suggestions?: any[] }>(raw);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.map((item) => this.normalizeAiTokenSuggestion(item)).filter(Boolean) as PersonalTokenAiSuggestion[]
      : [];

    return {
      requestedAccountId: requestedAccount?.id ?? input?.accountId ?? null,
      requestedAccountName: requestedAccount ? (requestedAccount.name || requestedAccount.provider) : undefined,
      accountId: account.id,
      accountName: account.name || account.provider,
      model: account.model,
      usedFallback: !!requestedAccount && requestedAccount.id !== account.id,
      fallbackReason,
      generatedAt: new Date().toISOString(),
      summary: String(parsed?.summary || 'AI 已完成一轮额度账号治理建议。').trim(),
      suggestions: suggestions.slice(0, 12),
    };
  }

  applyTokenAiPlan(input: { suggestions?: PersonalTokenAiSuggestion[] }) {
    const suggestions = Array.isArray(input?.suggestions) ? input.suggestions : [];
    let applied = 0;

    for (const suggestion of suggestions.slice(0, 20)) {
      const normalized = this.normalizeAiTokenSuggestion(suggestion);
      if (!normalized) continue;

      const current = tokenModel.getById(normalized.target_id);
      if (!current) continue;

      const payload: Record<string, any> = {};
      if (normalized.status && normalized.status !== current.status) payload.status = normalized.status;
      if (normalized.note !== undefined && normalized.note !== current.note) payload.note = normalized.note;
      if (normalized.auto_sync_enabled !== undefined && Number(normalized.auto_sync_enabled) !== Number(current.auto_sync_enabled)) {
        payload.auto_sync_enabled = normalized.auto_sync_enabled;
      }

      if (Object.keys(payload).length > 0) {
        tokenModel.update(current.id, payload);
        applied += 1;
      }
    }

    this.invalidateWorkspaceCache();
    return {
      applied,
      accounts: this.listTokenAccountViews(),
    };
  }

  private async loadIntegrations(): Promise<IntegrationSnapshot> {
    const githubRecord = integrationTokenModel.get('github');
    const cloudflareRecord = integrationTokenModel.get('cloudflare');
    const notionRecord = integrationTokenModel.get('notion');
    const misubRecord = integrationTokenModel.get('misub');
    const linuxdoRecord = integrationTokenModel.get('linuxdo');
    const ymailRecord = integrationTokenModel.get('ymail') || (config.defaultYmailAdminPassword
      ? {
          provider: 'ymail' as const,
          token: config.defaultYmailAdminPassword,
          updated_at: new Date().toISOString(),
        }
      : null);

    const [github, cloudflare, notion, misub, linuxdo, ymail] = await Promise.all([
      githubRecord ? this.safe(() => integrationService.fetchGitHubData(githubRecord), null, 1200) : Promise.resolve(null),
      cloudflareRecord ? this.safe(() => integrationService.fetchCloudflareData(cloudflareRecord), null, 1200) : Promise.resolve(null),
      notionRecord ? this.safe(() => integrationService.fetchNotionData(notionRecord), null, 1200) : Promise.resolve(null),
      misubRecord ? this.safe(() => integrationService.fetchMiSubData(misubRecord), null, 1200) : Promise.resolve(null),
      linuxdoRecord ? this.safe(() => integrationService.fetchLinuxDoData(linuxdoRecord), null, 1200) : Promise.resolve(null),
      ymailRecord ? this.safe(() => ymailService.fetchIntegrationData(ymailRecord), null, 1200) : Promise.resolve(null),
    ]);

    return { github, cloudflare, notion, misub, linuxdo, ymail };
  }

  private collectBaseActions(input: {
    accounts: ReturnType<AccountModel['getAll']>;
    aiAccounts: ReturnType<AiAccountModel['list']>;
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

    for (const account of input.aiAccounts.filter((item) =>
      item.status === 'error' || (item.status !== 'inactive' && item.last_test_status === 'failed')
    )) {
      const statusHint = account.last_http_status ? `HTTP ${account.last_http_status}` : '最近诊断失败';
      items.push({
        id: `ai-account-error-${account.id}`,
        title: `${account.name || account.provider} AI 账号异常`,
        summary: account.last_error || `${statusHint}，建议检查令牌、代理或模型配置。`,
        source: 'ai',
        type: 'alert',
        severity: account.last_http_status === 401 || account.last_http_status === 403 ? 'critical' : 'high',
        entityType: 'ai_account',
        entityKey: String(account.id),
        actionLabel: '查看 AI',
        actionPath: '/ai',
        occurredAt: account.last_tested_at || account.updated_at,
      });
    }

    for (const account of input.aiAccounts.filter((item) =>
      item.status === 'active' && item.last_test_status === 'never'
    ).slice(0, 2)) {
      items.push({
        id: `ai-account-pending-${account.id}`,
        title: `${account.name || account.provider} AI 账号待诊断`,
        summary: `模型 ${account.model} 还没完成连通性测试，建议先验证，避免运行时才暴露问题。`,
        source: 'ai',
        type: 'update',
        severity: 'medium',
        entityType: 'ai_account',
        entityKey: String(account.id),
        actionLabel: '查看 AI',
        actionPath: '/ai',
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
      for (const release of input.integrations.github.releases.slice(0, 3)) {
        items.push({
          id: `github-release-${release.id}`,
          title: `GitHub 发布：${release.name || release.tag_name}`,
          summary: `${release.repo_full_name} · ${release.prerelease ? '预发布' : '正式发布'}版本 ${release.tag_name}`,
          source: 'github',
          type: 'update',
          severity: release.prerelease ? 'medium' : 'high',
          entityType: 'repository',
          entityKey: release.repo_full_name,
          actionLabel: '打开 GitHub',
          actionPath: '/github',
          occurredAt: release.published_at || release.created_at,
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
        const editedAt = page.last_edited_time ? new Date(page.last_edited_time).getTime() : 0;
        const isFresh = editedAt > 0 && now - editedAt <= 3 * 24 * 60 * 60 * 1000;
        const isStrategic = /muse|workflow|memory|today|inbox|规则|自动|发布|迭代|版本/i.test(page.title || '');
        items.push({
          id: `notion-page-${page.id}`,
          title: `Notion 最近编辑：${page.title}`,
          summary: '来自个人知识库的最新编辑内容，可沉淀为上下文或任务。',
          source: 'notion',
          type: isFresh || isStrategic ? 'urgent' : 'update',
          severity: isStrategic ? 'high' : isFresh ? 'medium' : 'low',
          entityType: 'project',
          entityKey: page.title,
          actionLabel: '打开 Notion',
          actionPath: '/notion',
          occurredAt: page.last_edited_time,
        });
      }
    }

    if (input.integrations.linuxdo?.connected && input.integrations.linuxdo.user) {
      const expiresAt = input.integrations.linuxdo.expiresAt ? new Date(input.integrations.linuxdo.expiresAt).getTime() : 0;
      const hoursLeft = expiresAt ? Math.round((expiresAt - now) / (60 * 60 * 1000)) : null;

      if (hoursLeft !== null && hoursLeft <= 72) {
        items.push({
          id: `linuxdo-expiring-${input.integrations.linuxdo.user.id}`,
          title: `Linux.do 会话即将过期`,
          summary: `@${input.integrations.linuxdo.user.username} 的 OAuth 会话预计 ${Math.max(hoursLeft, 0)} 小时内到期。`,
          source: 'linuxdo',
          type: 'urgent',
          severity: hoursLeft <= 24 ? 'high' : 'medium',
          entityType: 'linuxdo',
          entityKey: String(input.integrations.linuxdo.user.id),
          actionLabel: '打开 Linux.do',
          actionPath: '/linuxdo',
          occurredAt: input.integrations.linuxdo.expiresAt,
        });
      } else {
        items.push({
          id: `linuxdo-profile-${input.integrations.linuxdo.user.id}`,
          title: `Linux.do 已连接 @${input.integrations.linuxdo.user.username}`,
          summary: `当前信任等级 TL${input.integrations.linuxdo.user.trust_level}，可作为社区身份与反馈信号入口。`,
          source: 'linuxdo',
          type: 'update',
          severity: 'low',
          entityType: 'linuxdo',
          entityKey: String(input.integrations.linuxdo.user.id),
          actionLabel: '打开 Linux.do',
          actionPath: '/linuxdo',
          occurredAt: input.integrations.linuxdo.lastSyncAt,
        });
      }
    }

    if (input.integrations.ymail) {
      const hotAddresses = [...input.integrations.ymail.addresses]
        .sort((a, b) => {
          const mailA = Number(a.mail_count || 0);
          const mailB = Number(b.mail_count || 0);
          if (mailA !== mailB) return mailB - mailA;
          return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
        })
        .slice(0, 4);

      for (const address of hotAddresses) {
        items.push({
          id: `ymail-address-${address.id}`,
          title: `Ymail 地址：${address.address || address.name}`,
          summary: `累计 ${Number(address.mail_count || 0)} 封收件，最近同步 ${address.updated_at || address.created_at || '未知'}。`,
          source: 'ymail',
          type: Number(address.mail_count || 0) > 0 ? 'update' : 'alert',
          severity: Number(address.mail_count || 0) >= 5 ? 'high' : 'medium',
          entityType: 'ymail_address',
          entityKey: String(address.id),
          actionLabel: '打开 Ymail',
          actionPath: '/ymail',
          occurredAt: address.updated_at || address.created_at || null,
        });
      }
    }

    if (input.integrations.misub) {
      const expiringSubscriptions = input.integrations.misub.misubs.filter((item) => {
        const expire = Number(item.userInfo?.expire || 0);
        if (!Number.isFinite(expire) || expire <= 0) return false;
        const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
        return expiresAt - now <= 7 * 24 * 60 * 60 * 1000;
      }).slice(0, 4);

      for (const subscription of expiringSubscriptions) {
        const expire = Number(subscription.userInfo?.expire || 0);
        const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
        const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
        items.push({
          id: `misub-expiring-${subscription.id}`,
          title: `${subscription.name || subscription.url} 即将到期`,
          summary: daysLeft < 0 ? `已过期 ${Math.abs(daysLeft)} 天。` : `${Math.max(daysLeft, 0)} 天内到期，建议续费或替换。`,
          source: 'subscriptions',
          type: 'urgent',
          severity: daysLeft <= 1 ? 'critical' : 'high',
          entityType: 'subscription',
          entityKey: subscription.id || subscription.url,
          actionLabel: '打开订阅',
          actionPath: '/subscriptions',
          occurredAt: new Date(expiresAt).toISOString(),
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
          type: article.matchedKeywords.length >= 2 ? 'urgent' : 'update',
          severity: article.matchedKeywords.length >= 2 ? 'high' : 'medium',
          entityType: 'news',
          entityKey: article.url,
          actionLabel: '阅读文章',
          actionPath: this.buildNewspaperReaderPath(article),
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
            actionLabel: '阅读文章',
            actionPath: this.buildNewspaperReaderPath(article),
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

      if (rule.trigger_type === 'subscription_expiring_days' && context.integrations.misub) {
        const days = Number(rule.config.days ?? 3);
        const thresholdDays = Number.isFinite(days) ? Math.max(1, Math.round(days)) : 3;
        const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const matches = context.integrations.misub.misubs.filter((item) => {
          const expire = Number(item.userInfo?.expire || 0);
          if (!Number.isFinite(expire) || expire <= 0) return false;
          const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
          return expiresAt - now <= thresholdMs;
        }).slice(0, 8);

        for (const subscription of matches) {
          const expire = Number(subscription.userInfo?.expire || 0);
          const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
          const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
          const isExpired = daysLeft < 0;
          items.push({
            id: `rule-${rule.id}-subscription-${subscription.id}`,
            title: `${rule.name} 命中`,
            summary: `${subscription.name || subscription.url} ${isExpired ? `已过期 ${Math.abs(daysLeft)} 天` : `${Math.max(daysLeft, 0)} 天内到期`}`,
            source: 'rules',
            type: 'rule',
            severity: isExpired ? 'critical' : daysLeft <= 1 ? 'high' : 'medium',
            entityType: 'subscription',
            entityKey: subscription.id || subscription.url,
            actionLabel: '查看订阅',
            actionPath: '/subscriptions',
            occurredAt: new Date(expiresAt).toISOString(),
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

  private buildTodayPriorities(inbox: ActionCenterItem[]) {
    const preferredSources = new Set(['mail', 'news', 'notion']);
    const preferredPaths = new Set(['/inbox', '/newspaper', '/notion']);
    const focusCandidates = inbox.filter((item) => preferredSources.has(item.source) || preferredPaths.has(item.actionPath));
    if (focusCandidates.length > 0) {
      return [...focusCandidates]
        .sort((a, b) => this.todayWeight(b, preferredSources, preferredPaths) - this.todayWeight(a, preferredSources, preferredPaths))
        .slice(0, 6);
    }

    const fallbackCandidates = inbox.filter((item) => item.source !== 'tokens');
    if (fallbackCandidates.length > 0) {
      return [...fallbackCandidates]
        .sort((a, b) => this.todayWeight(b, preferredSources, preferredPaths) - this.todayWeight(a, preferredSources, preferredPaths))
        .slice(0, 6);
    }

    return [...inbox]
      .sort((a, b) => this.todayWeight(b, preferredSources, preferredPaths) - this.todayWeight(a, preferredSources, preferredPaths))
      .slice(0, 6);
  }

  private buildTodayHighlights(inbox: ActionCenterItem[]) {
    const preferredSources = new Set(['mail', 'news', 'notion']);
    const preferredPaths = new Set(['/inbox', '/newspaper', '/notion']);
    const focusItems = inbox
      .filter((item) => preferredSources.has(item.source) || preferredPaths.has(item.actionPath))
      .sort((a, b) => this.todayHighlightWeight(b, preferredSources) - this.todayHighlightWeight(a, preferredSources))
      .slice(0, 6);
    if (focusItems.length > 0) return focusItems;
    return inbox
      .filter((item) => item.type === 'update' && item.source !== 'tokens' && item.source !== 'memory')
      .sort((a, b) => this.todayHighlightWeight(b, preferredSources) - this.todayHighlightWeight(a, preferredSources))
      .slice(0, 6);
  }

  private buildTodayNextStep(item: ActionCenterItem | null) {
    if (!item) return '/inbox';
    if (item.source === 'mail') return '/inbox';
    if (item.source === 'news') return item.actionPath || '/newspaper';
    if (item.source === 'notion') return '/notion';
    if (item.actionPath === '/tokens') return '/inbox';
    return item.actionPath || '/inbox';
  }

  private buildNewspaperReaderPath(input: {
    url: string;
    source?: string;
    sourceUrl?: string;
    publishedAt?: string | null;
    title?: string;
    titleZh?: string;
    summary?: string;
    summaryZh?: string;
  }) {
    const params = new URLSearchParams();
    params.set('url', input.url);
    if (input.source) params.set('source', input.source);
    if (input.sourceUrl) params.set('sourceUrl', input.sourceUrl);
    if (input.publishedAt) params.set('publishedAt', input.publishedAt);
    if (input.title) params.set('title', input.title);
    if (input.titleZh) params.set('titleZh', input.titleZh);
    if (input.summary) params.set('summary', input.summary);
    if (input.summaryZh) params.set('summaryZh', input.summaryZh);
    return `/newspaper/read?${params.toString()}`;
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

  private todayWeight(item: ActionCenterItem, preferredSources: Set<string>, preferredPaths: Set<string>) {
    let score = this.weight(item);
    if (preferredSources.has(item.source)) score += 500;
    if (preferredPaths.has(item.actionPath)) score += 260;
    if (item.source === 'mail') score += 120;
    if (item.actionPath === '/inbox') score += 100;
    if (item.source === 'news') score += 100;
    if (item.source === 'notion') score += 90;
    if (item.source === 'tokens') score -= 420;
    if (item.actionPath === '/tokens') score -= 160;
    return score;
  }

  private todayHighlightWeight(item: ActionCenterItem, preferredSources: Set<string>) {
    let score = this.weight(item);
    if (preferredSources.has(item.source)) score += 320;
    if (item.source === 'mail') score += 120;
    if (item.source === 'news') score += 110;
    if (item.source === 'notion') score += 100;
    if (item.source === 'tokens') score -= 300;
    return score;
  }

  private async safe<T>(fn: () => Promise<T>, fallback: T, timeoutMs = 8000): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } catch {
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
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

  invalidateWorkspace() {
    this.invalidateWorkspaceCache();
  }

  private pickAiAccount(accountId?: number | null) {
    const accounts = this.listAiAccountCandidates(accountId);
    const selected = accounts[0];
    if (!selected) {
      throw new PersonalOSValidationError('没有可用的 AI 账号，请先在 AI 页面配置并测试至少一个可用账号。');
    }
    return selected;
  }

  private listAiAccountCandidates(accountId?: number | null) {
    const allAccounts = aiAccountModel.list();
    const configured = allAccounts.filter((item) => item.status !== 'inactive' && (item.api_key || item.auth_mode === 'google_oauth'));
    const ranked = this.rankAiAccounts(configured.filter((item) => !this.isKnownBrokenAiFallbackCandidate(item)));
    const fallbackSafeRanked = ranked.length > 0 ? ranked : this.rankAiAccounts(configured);

    if (!accountId) {
      return fallbackSafeRanked;
    }

    const preferredId = Number(accountId);
    const requested = allAccounts.find((item) => item.id === preferredId);
    if (requested && requested.status === 'inactive') {
      throw new PersonalOSValidationError('所选 AI 账号已停用，请先在 AI 页面启用或改用其他可用账号。');
    }
    if (requested && !(requested.api_key || requested.auth_mode === 'google_oauth')) {
      throw new PersonalOSValidationError('所选 AI 账号未完成认证配置，请先在 AI 页面补全密钥或 OAuth。');
    }

    const preferred = configured.find((item) => item.id === preferredId);
    if (!preferred) {
      return fallbackSafeRanked;
    }

    return [preferred, ...fallbackSafeRanked.filter((item) => item.id !== preferredId)];
  }

  private rankAiAccounts<T extends {
    id: number;
    status?: string | null;
    last_test_status?: string | null;
    priority_rank?: number | null;
  }>(accounts: T[]) {
    return [...accounts].sort((a, b) => {
      const scoreA = this.getAiAccountRankScore(a);
      const scoreB = this.getAiAccountRankScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB;
      const priorityA = Number.isFinite(Number(a.priority_rank)) ? Number(a.priority_rank) : Number.MAX_SAFE_INTEGER;
      const priorityB = Number.isFinite(Number(b.priority_rank)) ? Number(b.priority_rank) : Number.MAX_SAFE_INTEGER;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.id - b.id;
    });
  }

  private getAiAccountRankScore(account: { status?: string | null; last_test_status?: string | null }) {
    if (account.last_test_status === 'success') return 0;
    if (account.status === 'active') return 1;
    return 2;
  }

  private isKnownBrokenAiFallbackCandidate(account: {
    status?: string | null;
    last_test_status?: string | null;
    last_error?: string | null;
    last_response_preview?: string | null;
  }) {
    if (account.last_test_status === 'success') return false;

    const detail = `${account.last_error || ''} ${account.last_response_preview || ''}`.toLowerCase();
    if (!detail.trim()) return false;

    return [
      'current user is in debt',
      'accessdenied',
      '403 forbidden',
      'forbidden',
      'invalid api key',
      'api key invalid',
      'invalid token',
      'unauthorized',
      '未提供令牌',
      '无效的令牌',
      '令牌无效',
      'billing',
      '欠费',
    ].some((pattern) => detail.includes(pattern));
  }

  private async sendStructuredAiPrompt(
    accountId: number | null | undefined,
    history: AiMessage[],
    prompt: string,
  ): Promise<{
    account: any;
    raw: string;
    requestedAccount: any;
    fallbackReason: string;
  }> {
    const candidates = this.listAiAccountCandidates(accountId);
    if (candidates.length === 0) {
      throw new PersonalOSValidationError('没有可用的 AI 账号，请先在 AI 页面启用并测试通过至少一个账号。');
    }
    const requestedAccount = candidates[0] || null;
    let lastError: unknown = null;
    let fallbackReason = '';

    candidateLoop:
    for (let index = 0; index < candidates.length; index += 1) {
      const account = candidates[index];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const aiResult = await this.getAiChatService().sendMessage({
            ...account,
            system_prompt: [account.system_prompt?.trim() || '', prompt].filter(Boolean).join('\n\n'),
          }, history);
          const raw = typeof aiResult === 'string'
            ? aiResult
            : typeof aiResult?.content === 'string'
            ? aiResult.content
            : String((aiResult as any)?.content?.content || '');

          return { account, raw, requestedAccount, fallbackReason };
        } catch (error) {
          lastError = error;
          const delayMs = this.getAiRetryDelayMs(error);
          if (attempt === 0 && this.shouldRetrySameAiAccount(error) && delayMs > 0) {
            await this.sleep(Math.min(delayMs, 6000));
            continue;
          }
          if (!fallbackReason && requestedAccount && requestedAccount.id !== account.id) {
            fallbackReason = this.describeAiFallbackReason(error);
          } else if (!fallbackReason && requestedAccount && requestedAccount.id === account.id && index < candidates.length - 1) {
            fallbackReason = this.describeAiFallbackReason(error);
          }
          if (!this.shouldRetryAiAccount(error) || index === candidates.length - 1) {
            throw this.normalizeAiPromptError(error, requestedAccount, index < candidates.length - 1);
          }
          continue candidateLoop;
        }
      }
    }

    throw this.normalizeAiPromptError(lastError, requestedAccount, candidates.length > 1);
  }

  private shouldRetryAiAccount(error: unknown) {
    const message = String((error as any)?.message || error || '').toLowerCase();
    if (!message) return false;

    return [
      'quota exceeded',
      'rate limit',
      'too many requests',
      'invalid api key',
      'api key invalid',
      'invalid token',
      '无效的令牌',
      '未提供令牌',
      '令牌无效',
      'invalid authentication',
      'unauthorized',
      'permission denied',
      '权限不足',
      'service disabled',
      'resource exhausted',
      'exceeded your current quota',
      'high demand',
      'try again later',
      'temporarily unavailable',
      'overloaded',
      'accessdenied',
      'current user is in debt',
      'forbidden',
      'etimedout',
      'econnreset',
      'econnrefused',
      'fetch failed',
      'network',
      'socket hang up',
      'powershell fallback failed',
      'invalid json payload',
      'user location is not supported',
      'location is not supported',
      'not supported for the api use',
      '未返回可用内容',
      'no usable content',
      'empty response',
      '429',
      '401',
      '403',
      '400',
    ].some((pattern) => message.includes(pattern));
  }

  private shouldRetrySameAiAccount(error: unknown) {
    const message = String((error as any)?.message || error || '').toLowerCase();
    if (!message) return false;

    return [
      'quota exceeded',
      'rate limit',
      'too many requests',
      'resource exhausted',
      'exceeded your current quota',
      'high demand',
      'try again later',
      'temporarily unavailable',
      'overloaded',
      'please retry in',
      'retry in',
      'etimedout',
      'econnreset',
      'econnrefused',
      'fetch failed',
      'network',
      'socket hang up',
      'powershell fallback failed',
      'invalid json payload',
      '429',
      '400',
    ].some((pattern) => message.includes(pattern));
  }

  private getAiRetryDelayMs(error: unknown) {
    const message = String((error as any)?.message || error || '');
    const match = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    if (!match) return 0;
    const seconds = Number(match[1]);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.ceil(seconds * 1000);
  }

  private describeAiFallbackReason(error: unknown) {
    const message = String((error as any)?.message || error || '').trim();
    if (!message) return '首选账号请求失败，已切换到后备账号。';

    const compact = message.replace(/\s+/g, ' ');
    if (compact.length <= 120) {
      return `首选账号请求失败：${compact}`;
    }
    return `首选账号请求失败：${compact.slice(0, 117)}...`;
  }

  private normalizeAiPromptError(error: unknown, requestedAccount?: { name?: string | null } | null, hasFallbackCandidate = false) {
    if (error instanceof PersonalOSValidationError) {
      return error;
    }

    const message = String((error as any)?.message || error || '').trim();
    const compact = message.replace(/\s+/g, ' ');
    const accountLabel = requestedAccount?.name || '当前 AI 账号';

    if (this.shouldRetrySameAiAccount(error)) {
      return new PersonalOSValidationError(`${accountLabel} 当前触发配额或限流，稍后再试。${compact ? `详情：${compact.slice(0, 160)}` : ''}`.trim());
    }

    if (hasFallbackCandidate && this.shouldRetryAiAccount(error)) {
      return new PersonalOSValidationError(`可自动切换的后备 AI 账号也不可用。${compact ? `详情：${compact.slice(0, 160)}` : '请先在 AI 页面修复账号后再试。'}`);
    }
    if (this.shouldRetryAiAccount(error)) {
      return new PersonalOSValidationError(`${accountLabel} 当前不可用，稍后重试或切换 AI 账号。${compact ? `详情：${compact.slice(0, 160)}` : ''}`.trim());
    }

    return error instanceof Error ? error : new Error(message || 'AI 请求失败');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildMemoryManagerPrompt(memory: PersonalMemoryView[], inbox: ActionCenterItem[], focus: string) {
    const memoryDigest = memory.slice(0, 30).map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      kind: item.kind,
      tags: item.tags,
      source: item.source,
      entity_type: item.entity_type,
      entity_key: item.entity_key,
      is_pinned: item.is_pinned,
      is_resolved: item.is_resolved,
      updated_at: item.updated_at,
    }));
    const inboxDigest = inbox.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      severity: item.severity,
      entityType: item.entityType,
      entityKey: item.entityKey,
    }));

    return [
      '请根据下面的 Memory 和记事上下文，生成记忆整理建议。',
      '这套记忆库的主要职责：1. 提炼 Notion 文章；2. 沉淀用户的操作习惯；3. 记录 Muse 的关键改动与产品判断。',
      '目标：优先整理 Notion 文章提炼，其次维护操作习惯和 Muse 改动；去重、补全标题、合并相似项、把已完成/已过期内容标记为 resolve、把值得长期保留的内容置顶。',
      focus ? `本次关注点：${focus}` : '',
      '返回 JSON 格式：{"summary":"...","suggestions":[{"type":"create|update|resolve","target_id":1,"title":"...","content":"...","kind":"note|project|risk|preference","tags":["a"],"is_pinned":0,"is_resolved":0,"entity_type":"","entity_key":"","reason":"..."}]}',
      '如果某条记忆内容很弱但没有足够依据删除，就不要处理。',
      '如果输入里出现 Notion 页面、文章、摘要或观点，请优先把它们整理成可复用提炼，而不是泛化成普通待办。',
      '如果输入里出现用户的固定操作方式、偏好、禁忌、工作流约束，请保留为长期习惯记忆。',
      '如果输入里出现 Muse 的结构改动、产品定位或实现决策，请保留为项目/产品记忆。',
      `现有记忆：${JSON.stringify(memoryDigest)}`,
      `当前待办上下文：${JSON.stringify(inboxDigest)}`,
    ].filter(Boolean).join('\n\n');
  }

  private buildAccountManagerPrompt(accounts: ReturnType<AccountModel['getAll']>, focus: string) {
    const digest = accounts.slice(0, 80).map((item) => ({
      id: item.id,
      provider: item.provider,
      mode: item.mode,
      email: item.email,
      remark: item.remark,
      status: item.status,
      custom_domain: item.custom_domain,
      custom_imap_host: item.custom_imap_host,
      custom_smtp_host: item.custom_smtp_host,
      tags: (item.tags || []).map((tag) => tag.name),
      last_synced_at: item.last_synced_at,
      token_refreshed_at: item.token_refreshed_at,
      updated_at: item.updated_at,
    }));

    return [
      '请根据下面的邮箱账户清单，生成账户治理建议。',
      '目标：减少人工整理成本，让账号更容易筛选、分组和维护。',
      '允许处理的内容只有：mode、status、remark、tag_names。',
      '不要编造账号凭证，不要建议修改 email、password、refresh_token、client_id、client_secret。',
      '优先做这些事：补全用途备注、统一标签、把明显闲置或异常的账户标记状态、让 custom 域名账户更容易识别。',
      focus ? `本次关注点：${focus}` : '',
      '返回 JSON 格式：{"summary":"...","suggestions":[{"type":"update","target_id":1,"mode":"temporary|long_term","status":"active|inactive|error","remark":"...","tag_names":["a","b"],"reason":"..."}]}',
      `当前账户：${JSON.stringify(digest)}`,
    ].filter(Boolean).join('\n\n');
  }

  private buildProxyManagerPrompt(proxies: ReturnType<ProxyModel['list']>, focus: string) {
    const digest = proxies.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      host: item.host,
      port: item.port,
      status: item.status,
      is_default: item.is_default,
      is_enabled: item.is_enabled,
      last_test_ip: item.last_test_ip,
      last_tested_at: item.last_tested_at,
    }));

    return [
      '请根据下面的代理列表，生成代理治理建议。',
      '目标：减少无效代理、明确默认出口、补齐清晰命名，降低人工巡检成本。',
      '允许处理的内容只有：name、is_enabled、is_default。',
      focus ? `本次关注点：${focus}` : '',
      '返回 JSON 格式：{"summary":"...","suggestions":[{"type":"update","target_id":1,"name":"...","is_enabled":1,"is_default":0,"reason":"..."}]}',
      `当前代理：${JSON.stringify(digest)}`,
    ].filter(Boolean).join('\n\n');
  }

  private buildTokenManagerPrompt(accounts: ReturnType<PersonalOSService['listTokenAccountViews']>, focus: string) {
    const digest = accounts.map((item) => ({
      id: item.id,
      provider: item.provider,
      provider_label: item.provider_label,
      name: item.name,
      auth_method: item.auth_method,
      status: item.status,
      auto_sync_enabled: item.auto_sync_enabled,
      note: item.note,
      login_hint: item.login_hint,
      last_synced_at: item.last_synced_at,
      last_error: item.last_error,
      cards: (item.snapshot as any)?.cards?.map((card: any) => ({
        key: card.key,
        label: card.label,
        remainingPct: card.remainingPct,
      })) || [],
    }));

    return [
      '请根据下面的额度账号清单，生成账号治理建议。',
      '目标：减少无效自动同步、明确异常账号、补齐运维备注，让额度页更容易管理。',
      '允许处理的内容只有：status、auto_sync_enabled、note。',
      focus ? `本次关注点：${focus}` : '',
      '返回 JSON 格式：{"summary":"...","suggestions":[{"type":"update","target_id":1,"status":"active|inactive|error","auto_sync_enabled":1,"note":"...","reason":"..."}]}',
      `当前额度账号：${JSON.stringify(digest)}`,
    ].filter(Boolean).join('\n\n');
  }

  private normalizeAiSuggestion(input: any): PersonalMemoryAiSuggestion | null {
    const type = ['create', 'update', 'resolve'].includes(String(input?.type)) ? String(input.type) as PersonalMemoryAiSuggestion['type'] : null;
    if (!type) return null;

    const kind = VALID_MEMORY_KINDS.has(input?.kind) ? input.kind : 'note';
    const title = String(input?.title || '').trim();
    const content = String(input?.content || '').trim();
    const targetId = input?.target_id === undefined || input?.target_id === null ? undefined : Number(input.target_id);

    if (type !== 'create' && !Number.isFinite(targetId)) return null;
    if (type !== 'resolve' && (!title || !content)) return null;

    return {
      type,
      ...(Number.isFinite(targetId) ? { target_id: targetId } : {}),
      title: title || '待整理记忆',
      content: content || '这条记忆建议标记为已解决。',
      kind,
      tags: Array.isArray(input?.tags) ? input.tags.map((item: any) => String(item).trim()).filter(Boolean).slice(0, 8) : [],
      ...(input?.is_pinned === undefined ? {} : { is_pinned: input.is_pinned ? 1 : 0 }),
      ...(type === 'resolve'
        ? { is_resolved: 1 }
        : input?.is_resolved === undefined
          ? {}
          : { is_resolved: input.is_resolved ? 1 : 0 }),
      entity_type: String(input?.entity_type || '').trim(),
      entity_key: String(input?.entity_key || '').trim(),
      reason: String(input?.reason || '').trim() || 'AI 建议更新这条记忆。',
    };
  }

  private normalizeAiAccountSuggestion(input: any): PersonalAccountAiSuggestion | null {
    if (String(input?.type) !== 'update') return null;

    const targetId = Number(input?.target_id);
    if (!Number.isFinite(targetId)) return null;

    const mode = ['temporary', 'long_term'].includes(String(input?.mode))
      ? String(input.mode) as PersonalAccountAiSuggestion['mode']
      : undefined;
    const status = ['active', 'inactive', 'error'].includes(String(input?.status))
      ? String(input.status) as PersonalAccountAiSuggestion['status']
      : undefined;
    const remark = input?.remark === undefined ? undefined : String(input.remark || '').trim().slice(0, 120);
    const tagNames: string[] | undefined = Array.isArray(input?.tag_names)
      ? [...new Set<string>(input.tag_names.map((item: any) => String(item || '').trim()).filter(Boolean))].slice(0, 4)
      : undefined;

    if (!mode && !status && remark === undefined && !tagNames) return null;

    return {
      type: 'update',
      target_id: targetId,
      ...(mode ? { mode } : {}),
      ...(status ? { status } : {}),
      ...(remark !== undefined ? { remark } : {}),
      ...(tagNames ? { tag_names: tagNames } : {}),
      reason: String(input?.reason || '').trim() || 'AI 建议整理这条邮箱账户元数据。',
    };
  }

  private normalizeAiProxySuggestion(input: any): PersonalProxyAiSuggestion | null {
    if (String(input?.type) !== 'update') return null;
    const targetId = Number(input?.target_id);
    if (!Number.isFinite(targetId)) return null;

    const name = input?.name === undefined ? undefined : String(input.name || '').trim().slice(0, 120);
    const isEnabled = input?.is_enabled === undefined ? undefined : (input.is_enabled ? 1 : 0);
    const isDefault = input?.is_default === undefined ? undefined : (input.is_default ? 1 : 0);
    if (name === undefined && isEnabled === undefined && isDefault === undefined) return null;

    return {
      type: 'update',
      target_id: targetId,
      ...(name !== undefined ? { name } : {}),
      ...(isEnabled !== undefined ? { is_enabled: isEnabled } : {}),
      ...(isDefault !== undefined ? { is_default: isDefault } : {}),
      reason: String(input?.reason || '').trim() || 'AI 建议整理这条代理配置。',
    };
  }

  private normalizeAiTokenSuggestion(input: any): PersonalTokenAiSuggestion | null {
    if (String(input?.type) !== 'update') return null;
    const targetId = Number(input?.target_id);
    if (!Number.isFinite(targetId)) return null;

    const status = ['active', 'inactive', 'error'].includes(String(input?.status))
      ? String(input.status) as PersonalTokenAiSuggestion['status']
      : undefined;
    const autoSync = input?.auto_sync_enabled === undefined ? undefined : (input.auto_sync_enabled ? 1 : 0);
    const note = input?.note === undefined ? undefined : String(input.note || '').trim().slice(0, 160);
    if (!status && autoSync === undefined && note === undefined) return null;

    return {
      type: 'update',
      target_id: targetId,
      ...(status ? { status } : {}),
      ...(autoSync !== undefined ? { auto_sync_enabled: autoSync } : {}),
      ...(note !== undefined ? { note } : {}),
      reason: String(input?.reason || '').trim() || 'AI 建议整理这条额度账号配置。',
    };
  }

  private ensureTagByName(name: string, existingTags: ReturnType<TagModel['list']>) {
    const normalized = String(name || '').trim();
    if (!normalized) return null;
    const existing = existingTags.find((item) => item.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) return existing.id;
    const created = tagModel.create(normalized);
    existingTags.push(created);
    return created.id;
  }

  private buildAccountRemark(account: ReturnType<AccountModel['getAll']>[number]) {
    if (account.custom_domain) return `自定义域名邮箱 ${account.custom_domain}`;
    if (account.provider === 'qq') return 'QQ 邮箱账户';
    if (account.provider === 'gmail') return 'Gmail 邮箱账户';
    if (account.provider === 'custom') {
      const host = account.custom_imap_host || account.custom_smtp_host || '自定义服务';
      return `自定义邮箱 ${host}`;
    }
    return 'Microsoft 邮箱账户';
  }

  private listTokenAccountViews(): TokenView[] {
    return tokenModel.list().map((item) => ({
      ...item,
      provider_label: tokenModel.getProviderLabel(item.provider),
      snapshot: this.parseJson<TokenView['snapshot']>(item.snapshot_json, null),
    }));
  }

  private normalizeRuleConfigForTrigger(triggerType: PersonalRuleTriggerType, input: Record<string, any>) {
    if (triggerType === 'token_low_remaining_pct') {
      const threshold = Number(input?.thresholdPct);
      return { thresholdPct: Number.isFinite(threshold) ? Math.min(100, Math.max(1, Math.round(threshold))) : 20 };
    }

    if (triggerType === 'keyword_in_news') {
      return { keyword: String(input?.keyword || '').trim() || 'ai' };
    }

    if (triggerType === 'github_repo_activity') {
      return { repo: String(input?.repo || '').trim() || 'repo' };
    }

    if (triggerType === 'subscription_expiring_days') {
      const days = Number(input?.days);
      return { days: Number.isFinite(days) ? Math.max(1, Math.round(days)) : 3 };
    }

    return {};
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
