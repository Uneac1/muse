import type { Context } from 'koa';
import { AiAccountModel, AiMessageModel, AiThreadModel } from '../models/AiChat';
import { AiChatService } from '../services/AiChatService';
import { agentAutonomyService } from '../services/AgentAutonomyService';
import type { AiAccount, AiProvider, AiRuntimeContext } from '../types';
import { config } from '../config';
import { buildAiChatResult } from '../utils/aiChatResult';
import { fail, success } from '../utils/response';

const accountModel = new AiAccountModel();
const threadModel = new AiThreadModel();
const messageModel = new AiMessageModel();
const chatService = new AiChatService();

const PROVIDERS: AiProvider[] = [
  'chatgpt',
  'codex',
  'claude',
  'claude_code',
  'anthropic_compatible',
  'gemini',
  'deepseek',
  'mimo',
  'openai_compatible',
];

function normalizeModelName(model: string) {
  return String(model || '').trim().toLowerCase().replace(/^models\//, '');
}

function inferProvider(provider: AiProvider, model: string): AiProvider {
  const normalizedModel = normalizeModelName(model);

  if (normalizedModel.startsWith('gemini')) {
    return 'gemini';
  }

  if (normalizedModel.includes('claude') || normalizedModel.includes('anthropic')) {
    if (provider === 'claude' || provider === 'claude_code' || provider === 'anthropic_compatible') {
      return provider;
    }
    return 'anthropic_compatible';
  }

  if (normalizedModel.includes('codex') || /^gpt-5(?:[.-]|$)/i.test(normalizedModel)) {
    return 'codex';
  }

  if (normalizedModel.startsWith('deepseek')) {
    return 'deepseek';
  }

  if (normalizedModel.startsWith('mimo')) {
    return 'mimo';
  }

  return provider;
}

function normalizeBaseUrlForProvider(baseUrl: string, provider: AiProvider, defaults: { baseUrl: string }) {
  const sanitized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!sanitized) return defaults.baseUrl;

  if (provider === 'gemini') {
    if (/generativelanguage\.googleapis\.com/i.test(sanitized)) {
      if (/\/models$/i.test(sanitized)) return sanitized;
      if (/\/v\d+(?:beta)?$/i.test(sanitized)) return `${sanitized}/models`;
      return defaults.baseUrl;
    }
    return sanitized;
  }

  if (provider === 'claude' || provider === 'claude_code' || provider === 'anthropic_compatible') {
    return sanitized.replace(/\/v1$/i, '') || defaults.baseUrl;
  }

  if (/\/v1$/i.test(sanitized)) {
    return sanitized;
  }

  return `${sanitized}/v1`;
}

function makeTitle(message: string) {
  const plain = message.replace(/\s+/g, ' ').trim();
  if (!plain) return '新对话';
  return plain.length > 30 ? `${plain.slice(0, 30)}...` : plain;
}

function getChatFailoverRank(account: AiAccount) {
  const name = String(account.name || '').trim().toLowerCase();
  if (account.provider === 'gemini' || name.includes('gemini')) return 0;
  if (name === 'any') return 1;
  if (name === 'anydl') return 2;
  return 10;
}

function orderChatFallbacks(accounts: AiAccount[], excludeId: number) {
  return accounts
    .filter((item) => item.id !== excludeId && item.status !== 'inactive')
    .sort((left, right) => {
      const rankGap = getChatFailoverRank(left) - getChatFailoverRank(right);
      if (rankGap !== 0) return rankGap;
      const leftHealth = left.status === 'active' ? 0 : 1;
      const rightHealth = right.status === 'active' ? 0 : 1;
      if (leftHealth !== rightHealth) return leftHealth - rightHealth;
      const priorityGap = (left.priority_rank || 999) - (right.priority_rank || 999);
      if (priorityGap !== 0) return priorityGap;
      return left.id - right.id;
    });
}

function shouldAttemptFailover(message: string) {
  return /400|401|403|404|502|fetch failed|AI request failed|EPROTO|SSL|TLS|handshake|PowerShell fallback failed|1m\s*上下文|systeminstruction|system_instruction|systemInstruction|Invalid JSON payload|Bad Gateway|unsupported|已下线|PERMISSION_DENIED|SERVICE_DISABLED|AccessDenied|Current user is in debt|in debt|未提供令牌|User location is not supported|Not Found|Bad Request|high demand|try again later|temporar/i.test(message || '');
}

function isHardUnavailable(message: string) {
  return /401|403|AccessDenied|Current user is in debt|in debt|未提供令牌|User location is not supported|SERVICE_DISABLED|PERMISSION_DENIED|已下线/i.test(message || '');
}

function maskSecret(value: string) {
  if (!value) return '';
  if (value.length <= 10) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function looksMaskedSecret(value: unknown) {
  const text = String(value || '').trim();
  return !text || text.includes('...');
}

function sanitizeAiAccount(account: AiAccount) {
  return {
    ...account,
    api_key: maskSecret(account.api_key || ''),
    oauth_client_secret: maskSecret(account.oauth_client_secret || ''),
    oauth_refresh_token: maskSecret(account.oauth_refresh_token || ''),
    api_key_configured: !!account.api_key,
    oauth_client_secret_configured: !!account.oauth_client_secret,
    oauth_refresh_token_configured: !!account.oauth_refresh_token,
  };
}

function scheduleConversationLearning(input: {
  userMessage: string;
  assistantMessage: string;
  toolDetails?: Array<{ tool: string; ok: boolean; error?: string; target?: string }>;
  fallbackAccountName?: string | null;
  runtimeContext?: AiRuntimeContext | null;
  accountName?: string | null;
  provider?: string | null;
  model?: string | null;
}) {
  setTimeout(() => {
    agentAutonomyService.learnFromConversation(input).catch(() => {});
  }, 0);
}

export class AiController {
  constructor() {
    this.listAccounts = this.listAccounts.bind(this);
    this.createAccount = this.createAccount.bind(this);
    this.updateAccount = this.updateAccount.bind(this);
    this.deleteAccount = this.deleteAccount.bind(this);
    this.getAccountDiagnostics = this.getAccountDiagnostics.bind(this);
    this.testAccount = this.testAccount.bind(this);
    this.listThreads = this.listThreads.bind(this);
    this.getMessages = this.getMessages.bind(this);
    this.updateThread = this.updateThread.bind(this);
    this.deleteThread = this.deleteThread.bind(this);
    this.clearThreads = this.clearThreads.bind(this);
    this.chat = this.chat.bind(this);
  }

  private normalizeProvider(input: any): AiProvider {
    const provider = String(input || 'chatgpt').toLowerCase() as AiProvider;
    return PROVIDERS.includes(provider) ? provider : 'chatgpt';
  }

  private validateAccount(body: any) {
    if (!body.name) return 'name is required';
    if (!body.model) return 'model is required';

    const provider = this.normalizeProvider(body.provider);
    if (!PROVIDERS.includes(provider)) return 'invalid provider';
    const authMode = String(body.auth_mode || 'api_key');

    if (provider === 'gemini' && authMode === 'google_oauth') {
      if (!body.oauth_refresh_token) return 'oauth_refresh_token is required';
      if (!body.oauth_project_id && !config.googleProjectId) return 'oauth_project_id is required';
      if (!body.oauth_client_id && !config.googleClientId) return 'oauth_client_id is required';
      if (!body.oauth_client_secret && !config.googleClientSecret) return 'oauth_client_secret is required';
    } else if (!body.api_key) {
      return 'api_key is required';
    }

    if (provider !== 'gemini' && !body.base_url) return 'base_url is required';
    return null;
  }

  async listAccounts(ctx: Context) {
    success(ctx, accountModel.list().map(sanitizeAiAccount));
  }

  async createAccount(ctx: Context) {
    const body = ctx.request.body as any;
    const requestedProvider = this.normalizeProvider(body.provider);
    const provider = inferProvider(requestedProvider, body.model || '');
    const defaults = accountModel.getProviderDefaults(provider);
    const payload = {
      ...body,
      provider,
      auth_mode: body.auth_mode || 'api_key',
      base_url: normalizeBaseUrlForProvider(body.base_url || defaults.baseUrl, provider, defaults),
      model: body.model || defaults.model,
      priority_rank: Number(body.priority_rank || 1) || 1,
    };
    const error = this.validateAccount(payload);
    if (error) return fail(ctx, error, 400);
    success(ctx, sanitizeAiAccount(accountModel.create(payload)));
  }

  async updateAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const current = accountModel.getById(id);
    if (!current) return fail(ctx, 'AI account not found', 404);

    const body = ctx.request.body as any;
    const requestedProvider = this.normalizeProvider(body.provider || current.provider);
    const provider = inferProvider(requestedProvider, body.model || current.model || '');
    const defaults = accountModel.getProviderDefaults(provider);
    const payload = {
      ...current,
      ...body,
      provider,
      auth_mode: body.auth_mode || current.auth_mode || 'api_key',
      base_url: normalizeBaseUrlForProvider(body.base_url || current.base_url || defaults.baseUrl, provider, defaults),
      model: body.model || current.model || defaults.model,
      priority_rank: Number(body.priority_rank || current.priority_rank || 1) || 1,
    };
    if (looksMaskedSecret(body.api_key)) payload.api_key = current.api_key;
    if (looksMaskedSecret(body.oauth_client_secret)) payload.oauth_client_secret = current.oauth_client_secret;
    if (looksMaskedSecret(body.oauth_refresh_token)) payload.oauth_refresh_token = current.oauth_refresh_token;
    const error = this.validateAccount(payload);
    if (error) return fail(ctx, error, 400);

    const updated = accountModel.update(id, payload);
    if (!updated) return fail(ctx, 'AI account not found', 404);
    success(ctx, sanitizeAiAccount(updated));
  }

  async deleteAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const deleted = accountModel.delete(id);
    if (!deleted) return fail(ctx, 'AI account not found', 404);
    success(ctx, { deleted: true });
  }

  async getAccountDiagnostics(ctx: Context) {
    const id = Number(ctx.params.id);
    const account = accountModel.getById(id);
    if (!account) return fail(ctx, 'AI account not found', 404);

    let availableModels: string[] = [];
    try {
      availableModels = JSON.parse(account.available_models || '[]');
    } catch {
      availableModels = [];
    }

    success(ctx, {
      account: sanitizeAiAccount(account),
      availableModels,
      modelCount: availableModels.length,
      supportsModelListing: account.provider !== 'gemini' || availableModels.length > 0,
      providerLabel: account.provider,
    });
  }

  async testAccount(ctx: Context) {
    const id = Number(ctx.params.id);
    const account = accountModel.getById(id);
    if (!account) return fail(ctx, 'AI account not found', 404);

    const result = await chatService.testConnection(account);
    accountModel.updateDiagnostics(id, result);
    if (!result.ok && isHardUnavailable(result.message || result.preview || '')) {
      accountModel.demoteUnavailable(id, result.message || '账号不可用，已自动降权');
    }
    success(ctx, result);
  }

  async listThreads(ctx: Context) {
    const accountId = Number((ctx.query as Record<string, string>).account_id);
    if (!accountId) return fail(ctx, 'account_id is required', 400);
    success(ctx, threadModel.listByAccount(accountId));
  }

  async getMessages(ctx: Context) {
    const threadId = Number(ctx.params.id);
    const thread = threadModel.getById(threadId);
    if (!thread) return fail(ctx, 'AI thread not found', 404);
    success(ctx, messageModel.listByThread(threadId));
  }

  async updateThread(ctx: Context) {
    const id = Number(ctx.params.id);
    const thread = threadModel.getById(id);
    if (!thread) return fail(ctx, 'AI thread not found', 404);

    const title = String((ctx.request.body as any)?.title || '').trim();
    if (!title) return fail(ctx, 'title is required', 400);

    const updated = threadModel.rename(id, title);
    if (!updated) return fail(ctx, 'AI thread not found', 404);
    success(ctx, updated);
  }

  async deleteThread(ctx: Context) {
    const id = Number(ctx.params.id);
    const deleted = threadModel.delete(id);
    if (!deleted) return fail(ctx, 'AI thread not found', 404);
    success(ctx, { deleted: true });
  }

  async clearThreads(ctx: Context) {
    const accountId = Number(ctx.params.id);
    const account = accountModel.getById(accountId);
    if (!account) return fail(ctx, 'AI account not found', 404);
    const deleted = threadModel.deleteByAccount(accountId);
    success(ctx, { deleted });
  }

  async chat(ctx: Context) {
    const accountId = Number(ctx.params.id);
    const body = ctx.request.body as any;
    const account = accountModel.getById(accountId);
    if (!account) return fail(ctx, 'AI account not found', 404);
    const runtimeContext = (((body.runtime_context || body.runtimeContext) as AiRuntimeContext | undefined) || undefined);
    const rawMessage = String(body.message || '');
    const normalizedMessage = rawMessage.trim();
    if (!normalizedMessage && !runtimeContext) return fail(ctx, 'message is required', 400);

    let thread = body.thread_id ? threadModel.getById(Number(body.thread_id)) : undefined;
    if (thread && thread.account_id !== accountId) {
      return fail(ctx, 'thread does not belong to the account', 400);
    }

    if (!thread) {
      thread = threadModel.create(accountId, makeTitle(normalizedMessage || runtimeContext?.section || runtimeContext?.path || '新对话'));
    }

    const userMessage = messageModel.create(thread.id, 'user', normalizedMessage);
    const tryFallbacks = async () => {
      const fallbacks = orderChatFallbacks(accountModel.list(), accountId);
      for (const fallback of fallbacks) {
        try {
          const history = messageModel.listByThread(thread.id);
          const answer = await chatService.sendModelSessionMessage(fallback, history, runtimeContext);
          const assistantMessage = messageModel.create(thread.id, 'assistant', answer.content);
          threadModel.touch(thread.id);
          accountModel.updateLastUsed(fallback.id);
          accountModel.updateDiagnostics(fallback.id, {
            ok: true,
            status: 200,
            latencyMs: 0,
            transport: fallback.transport_hint || 'unknown',
            endpoint: `${fallback.base_url}`,
            modelCount: 0,
            models: (() => {
              try {
                return JSON.parse(fallback.available_models || '[]');
              } catch {
                return [];
              }
            })(),
            preview: answer.content.slice(0, 400),
            message: 'chat ok',
          });
          scheduleConversationLearning({
            userMessage: normalizedMessage,
            assistantMessage: assistantMessage.content,
            toolDetails: answer.toolDetails,
            fallbackAccountName: fallback.name || fallback.provider,
            runtimeContext,
            accountName: fallback.name,
            provider: fallback.provider,
            model: fallback.model,
          });
          return buildAiChatResult({
            thread: threadModel.getById(thread.id)!,
            userMessage,
            assistantMessage,
            answer,
            runtimeView: agentAutonomyService.getRuntimeView(),
            fallbackAccount: {
              id: fallback.id,
              name: fallback.name,
              provider: fallback.provider,
              model: fallback.model,
            },
            degradedReason: `主账号当前不可用，已自动切换到 ${fallback.name || fallback.provider} · ${fallback.model} 继续响应。`,
          });
        } catch {
          continue;
        }
      }
      return null;
    };

    if (account.status === 'inactive' || account.status === 'error') {
      const fallbackResult = await tryFallbacks();
      if (fallbackResult) return success(ctx, fallbackResult);
      if (account.status === 'inactive') {
        return fail(ctx, 'AI account is disabled and no fallback account is available', 400);
      }
    }

    try {
      const history = messageModel.listByThread(thread.id);
      const answer = await chatService.sendModelSessionMessage(account, history, runtimeContext);
      const assistantMessage = messageModel.create(thread.id, 'assistant', answer.content);
      threadModel.touch(thread.id);
      accountModel.updateLastUsed(accountId);
      accountModel.updateDiagnostics(accountId, {
        ok: true,
        status: 200,
        latencyMs: 0,
        transport: account.transport_hint || 'unknown',
        endpoint: `${account.base_url}`,
        modelCount: 0,
        models: (() => {
          try {
            return JSON.parse(account.available_models || '[]');
          } catch {
            return [];
          }
        })(),
        preview: answer.content.slice(0, 400),
        message: 'chat ok',
      });
      scheduleConversationLearning({
        userMessage: normalizedMessage,
        assistantMessage: assistantMessage.content,
        toolDetails: answer.toolDetails,
        runtimeContext,
        accountName: account.name,
        provider: account.provider,
        model: account.model,
      });
      success(ctx, buildAiChatResult({
        thread: threadModel.getById(thread.id)!,
        userMessage,
        assistantMessage,
        answer,
        runtimeView: agentAutonomyService.getRuntimeView(),
      }));
    } catch (error: any) {
      accountModel.markStatus(accountId, 'error');
      accountModel.updateDiagnostics(accountId, {
        ok: false,
        status: null,
        latencyMs: 0,
        transport: account.transport_hint || 'unknown',
        endpoint: account.base_url,
        modelCount: 0,
        models: [],
        preview: '',
        message: error.message || 'AI 对话失败',
      });
      if (isHardUnavailable(error.message || '')) {
        accountModel.demoteUnavailable(accountId, error.message || '账号不可用，已自动降权');
      }
      if (shouldAttemptFailover(error.message || '')) {
        const fallbackResult = await tryFallbacks();
        if (fallbackResult) return success(ctx, fallbackResult);
      }
      fail(ctx, error.message || 'AI 对话失败', 502);
    }
  }
}
