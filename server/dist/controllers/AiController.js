"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const AiChat_1 = require("../models/AiChat");
const AiChatService_1 = require("../services/AiChatService");
const config_1 = require("../config");
const response_1 = require("../utils/response");
const accountModel = new AiChat_1.AiAccountModel();
const threadModel = new AiChat_1.AiThreadModel();
const messageModel = new AiChat_1.AiMessageModel();
const chatService = new AiChatService_1.AiChatService();
const PROVIDERS = [
    'chatgpt',
    'codex',
    'claude',
    'claude_code',
    'anthropic_compatible',
    'gemini',
    'deepseek',
    'openai_compatible',
];
function makeTitle(message) {
    const plain = message.replace(/\s+/g, ' ').trim();
    if (!plain)
        return '新对话';
    return plain.length > 30 ? `${plain.slice(0, 30)}...` : plain;
}
class AiController {
    constructor() {
        this.listAccounts = this.listAccounts.bind(this);
        this.createAccount = this.createAccount.bind(this);
        this.updateAccount = this.updateAccount.bind(this);
        this.deleteAccount = this.deleteAccount.bind(this);
        this.getAccountDiagnostics = this.getAccountDiagnostics.bind(this);
        this.testAccount = this.testAccount.bind(this);
        this.listThreads = this.listThreads.bind(this);
        this.getMessages = this.getMessages.bind(this);
        this.deleteThread = this.deleteThread.bind(this);
        this.chat = this.chat.bind(this);
    }
    normalizeProvider(input) {
        const provider = String(input || 'chatgpt').toLowerCase();
        return PROVIDERS.includes(provider) ? provider : 'chatgpt';
    }
    validateAccount(body) {
        if (!body.name)
            return 'name is required';
        if (!body.model)
            return 'model is required';
        const provider = this.normalizeProvider(body.provider);
        if (!PROVIDERS.includes(provider))
            return 'invalid provider';
        const authMode = String(body.auth_mode || 'api_key');
        if (provider === 'gemini' && authMode === 'google_oauth') {
            if (!body.oauth_refresh_token)
                return 'oauth_refresh_token is required';
            if (!body.oauth_project_id)
                return 'oauth_project_id is required';
            if (!body.oauth_client_id && !config_1.config.adminGoogleClientId)
                return 'oauth_client_id is required';
            if (!body.oauth_client_secret && !config_1.config.adminGoogleClientSecret)
                return 'oauth_client_secret is required';
        }
        else if (!body.api_key) {
            return 'api_key is required';
        }
        if (provider !== 'gemini' && !body.base_url)
            return 'base_url is required';
        return null;
    }
    async listAccounts(ctx) {
        (0, response_1.success)(ctx, accountModel.list());
    }
    async createAccount(ctx) {
        const body = ctx.request.body;
        const provider = this.normalizeProvider(body.provider);
        const defaults = accountModel.getProviderDefaults(provider);
        const payload = {
            ...body,
            provider,
            auth_mode: body.auth_mode || 'api_key',
            base_url: body.base_url || defaults.baseUrl,
            model: body.model || defaults.model,
            priority_rank: Number(body.priority_rank || 1) || 1,
        };
        const error = this.validateAccount(payload);
        if (error)
            return (0, response_1.fail)(ctx, error, 400);
        (0, response_1.success)(ctx, accountModel.create(payload));
    }
    async updateAccount(ctx) {
        const id = Number(ctx.params.id);
        const current = accountModel.getById(id);
        if (!current)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        const body = ctx.request.body;
        const provider = this.normalizeProvider(body.provider || current.provider);
        const defaults = accountModel.getProviderDefaults(provider);
        const payload = {
            ...current,
            ...body,
            provider,
            auth_mode: body.auth_mode || current.auth_mode || 'api_key',
            base_url: body.base_url || current.base_url || defaults.baseUrl,
            model: body.model || current.model || defaults.model,
            priority_rank: Number(body.priority_rank || current.priority_rank || 1) || 1,
        };
        const error = this.validateAccount(payload);
        if (error)
            return (0, response_1.fail)(ctx, error, 400);
        const updated = accountModel.update(id, payload);
        if (!updated)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        (0, response_1.success)(ctx, updated);
    }
    async deleteAccount(ctx) {
        const id = Number(ctx.params.id);
        const deleted = accountModel.delete(id);
        if (!deleted)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        (0, response_1.success)(ctx, { deleted: true });
    }
    async getAccountDiagnostics(ctx) {
        const id = Number(ctx.params.id);
        const account = accountModel.getById(id);
        if (!account)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        let availableModels = [];
        try {
            availableModels = JSON.parse(account.available_models || '[]');
        }
        catch {
            availableModels = [];
        }
        (0, response_1.success)(ctx, {
            account,
            availableModels,
            modelCount: availableModels.length,
            supportsModelListing: account.provider !== 'gemini' || availableModels.length > 0,
            providerLabel: account.provider,
        });
    }
    async testAccount(ctx) {
        const id = Number(ctx.params.id);
        const account = accountModel.getById(id);
        if (!account)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        const result = await chatService.testConnection(account);
        accountModel.updateDiagnostics(id, result);
        (0, response_1.success)(ctx, result);
    }
    async listThreads(ctx) {
        const accountId = Number(ctx.query.account_id);
        if (!accountId)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        (0, response_1.success)(ctx, threadModel.listByAccount(accountId));
    }
    async getMessages(ctx) {
        const threadId = Number(ctx.params.id);
        const thread = threadModel.getById(threadId);
        if (!thread)
            return (0, response_1.fail)(ctx, 'AI thread not found', 404);
        (0, response_1.success)(ctx, messageModel.listByThread(threadId));
    }
    async deleteThread(ctx) {
        const id = Number(ctx.params.id);
        const deleted = threadModel.delete(id);
        if (!deleted)
            return (0, response_1.fail)(ctx, 'AI thread not found', 404);
        (0, response_1.success)(ctx, { deleted: true });
    }
    async chat(ctx) {
        const accountId = Number(ctx.params.id);
        const body = ctx.request.body;
        const account = accountModel.getById(accountId);
        if (!account)
            return (0, response_1.fail)(ctx, 'AI account not found', 404);
        if (!body.message || !String(body.message).trim())
            return (0, response_1.fail)(ctx, 'message is required', 400);
        let thread = body.thread_id ? threadModel.getById(Number(body.thread_id)) : undefined;
        if (thread && thread.account_id !== accountId) {
            return (0, response_1.fail)(ctx, 'thread does not belong to the account', 400);
        }
        if (!thread) {
            thread = threadModel.create(accountId, makeTitle(body.message));
        }
        const userMessage = messageModel.create(thread.id, 'user', String(body.message).trim());
        try {
            const history = messageModel.listByThread(thread.id);
            const answer = await chatService.sendMessage(account, history);
            const assistantMessage = messageModel.create(thread.id, 'assistant', answer);
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
                    }
                    catch {
                        return [];
                    }
                })(),
                preview: answer.slice(0, 400),
                message: 'chat ok',
            });
            (0, response_1.success)(ctx, {
                thread: threadModel.getById(thread.id),
                userMessage,
                assistantMessage,
            });
        }
        catch (error) {
            accountModel.markStatus(accountId, 'error');
            (0, response_1.fail)(ctx, error.message || 'AI 对话失败', 500);
        }
    }
}
exports.AiController = AiController;
//# sourceMappingURL=AiController.js.map