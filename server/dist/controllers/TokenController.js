"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenController = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const TokenAccount_1 = require("../models/TokenAccount");
const TokenQuotaService_1 = require("../services/TokenQuotaService");
const OpenAIAccountService_1 = require("../services/OpenAIAccountService");
const TokenAutoSyncService_1 = require("../services/TokenAutoSyncService");
const TokenAccountRefreshService_1 = require("../services/TokenAccountRefreshService");
const response_1 = require("../utils/response");
const model = new TokenAccount_1.TokenAccountModel();
const service = new TokenQuotaService_1.TokenQuotaService();
const openAIAccountService = new OpenAIAccountService_1.OpenAIAccountService();
const PROVIDERS = ['openai_codex', 'claude', 'claude_code'];
const SESSION_FORMATS = ['cookie_header', 'cookie_json', 'netscape'];
const AUTH_METHODS = ['session', 'oauth', 'manual', 'api'];
const DEFAULT_CODEX_FREE_DIR = path_1.default.join(os_1.default.homedir(), 'Desktop', 'muse', 'free');
function isReauthRequiredError(message) {
    return /重新走一次 OAuth 授权|invalid_request_error/i.test(message);
}
function classifySyncError(message) {
    if (isReauthRequiredError(message))
        return 'reauth_required';
    if (/内置代理|mihomo|ECONNREFUSED 127\.0\.0\.1|校准内置代理失败/i.test(message))
        return 'proxy_recoverable';
    if (/unsupported_country_region_territory|forbidden|403|402|身份验证错误|unknown_error|deactivated_workspace|workspace_member_credits_depleted|refresh_token_reused|refresh token 已经被使用过/i.test(message))
        return 'provider_blocked';
    if (/fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(message))
        return 'network_transient';
    return 'unknown';
}
function canKeepSnapshotAvailable(account, kind, message) {
    if (!account.snapshot_json)
        return false;
    if (kind === 'proxy_recoverable' || kind === 'network_transient')
        return true;
    if (kind === 'provider_blocked') {
        return /unsupported_country_region_territory|Country, region, or territory not supported|身份验证错误|unknown_error/i.test(message);
    }
    return false;
}
class TokenController {
    constructor() {
        this.listAccounts = this.listAccounts.bind(this);
        this.createAccount = this.createAccount.bind(this);
        this.updateAccount = this.updateAccount.bind(this);
        this.deleteAccount = this.deleteAccount.bind(this);
        this.syncAccount = this.syncAccount.bind(this);
        this.syncAll = this.syncAll.bind(this);
        this.autoSync = this.autoSync.bind(this);
        this.importCodexFree = this.importCodexFree.bind(this);
    }
    normalizeProvider(input) {
        const provider = String(input || 'openai_codex').toLowerCase();
        return PROVIDERS.includes(provider) ? provider : 'openai_codex';
    }
    normalizeSessionFormat(input) {
        const format = String(input || 'cookie_header').toLowerCase();
        return SESSION_FORMATS.includes(format) ? format : 'cookie_header';
    }
    normalizeAuthMethod(input, provider) {
        const fallback = provider === 'openai_codex' ? 'oauth' : 'session';
        const method = String(input || fallback).toLowerCase();
        return AUTH_METHODS.includes(method) ? method : fallback;
    }
    buildView(account) {
        let snapshot = null;
        if (account.snapshot_json) {
            try {
                snapshot = JSON.parse(account.snapshot_json);
            }
            catch {
                snapshot = null;
            }
        }
        const { snapshot_json, ...rest } = account;
        const normalizedFailureKind = rest.last_error && (!rest.last_failure_kind || rest.last_failure_kind === 'unknown')
            ? classifySyncError(rest.last_error)
            : rest.last_failure_kind;
        return {
            ...rest,
            last_failure_kind: normalizedFailureKind,
            provider_label: model.getProviderLabel(account.provider),
            snapshot,
        };
    }
    normalizePayload(body) {
        const provider = this.normalizeProvider(body.provider);
        const status = body.status === 'inactive' ? 'inactive' : 'active';
        return {
            provider,
            auth_method: this.normalizeAuthMethod(body.auth_method, provider),
            name: String(body.name || '').trim(),
            session_format: this.normalizeSessionFormat(body.session_format),
            login_hint: String(body.login_hint || '').trim(),
            external_account_id: String(body.external_account_id || '').trim(),
            analytics_url: String(body.analytics_url || service.getDefaultAnalyticsUrl(provider)).trim(),
            session_payload: String(body.session_payload || '').trim(),
            access_token: String(body.access_token || '').trim(),
            refresh_token: String(body.refresh_token || '').trim(),
            id_token: String(body.id_token || '').trim(),
            user_agent: String(body.user_agent || service.getDefaultUserAgent()).trim(),
            api_key: String(body.api_key || '').trim(),
            api_base_url: String(body.api_base_url || '').trim(),
            api_model: String(body.api_model || '').trim(),
            api_model_provider: String(body.api_model_provider || '').trim(),
            api_reasoning_effort: String(body.api_reasoning_effort || '').trim(),
            api_wire_api: String(body.api_wire_api || '').trim(),
            note: String(body.note || '').trim(),
            status,
            auto_sync_enabled: body.auto_sync_enabled === 0 || body.auto_sync_enabled === false ? 0 : 1,
        };
    }
    validateAccount(payload) {
        if (!payload.name?.trim())
            return 'name is required';
        if (!payload.analytics_url?.trim())
            return 'analytics_url is required';
        if (payload.auth_method === 'api') {
            if (!payload.api_base_url?.trim())
                return 'api_base_url is required';
            if (!payload.api_key?.trim())
                return 'api_key is required';
            return null;
        }
        if (payload.auth_method === 'oauth' || payload.auth_method === 'manual') {
            if (!payload.refresh_token?.trim() && !payload.access_token?.trim()) {
                return 'refresh_token or access_token is required';
            }
            return null;
        }
        if (!payload.session_payload?.trim())
            return 'session_payload is required';
        return null;
    }
    async enrichPayload(payload) {
        if (payload.provider !== 'openai_codex')
            return payload;
        if ((payload.auth_method === 'oauth' || payload.auth_method === 'manual') && payload.refresh_token?.trim()) {
            const current = payload.id ? model.getById(Number(payload.id)) : undefined;
            const token = current && current.refresh_token === payload.refresh_token
                ? await (0, TokenAccountRefreshService_1.refreshOpenAITokenAccount)(current)
                : await openAIAccountService.refreshToken(payload.refresh_token);
            return {
                ...payload,
                access_token: token.accessToken,
                refresh_token: token.refreshToken || payload.refresh_token,
                id_token: token.idToken,
                login_hint: payload.login_hint || token.email || '',
                external_account_id: payload.external_account_id || token.chatgptAccountId || '',
                name: payload.name || token.email || 'OpenAI Codex',
                status: 'active',
                auto_sync_enabled: 1,
            };
        }
        if ((payload.auth_method === 'oauth' || payload.auth_method === 'manual') && payload.access_token?.trim()) {
            const info = openAIAccountService.parseTokenInfo(payload.access_token, payload.refresh_token, payload.id_token);
            return {
                ...payload,
                login_hint: payload.login_hint || String(info.email || ''),
                external_account_id: payload.external_account_id || String(info.chatgptAccountId || ''),
                name: payload.name || String(info.email || '') || 'OpenAI Codex',
                status: 'active',
                auto_sync_enabled: 1,
            };
        }
        return payload;
    }
    findExistingCodexAccount(input) {
        const email = input.email.trim().toLowerCase();
        const externalAccountId = input.externalAccountId.trim();
        const refreshToken = input.refreshToken.trim();
        return model.list().find((account) => {
            if (account.provider !== 'openai_codex')
                return false;
            if (externalAccountId && account.external_account_id === externalAccountId)
                return true;
            if (email && [account.login_hint, account.name].some((value) => value.trim().toLowerCase() === email))
                return true;
            if (refreshToken && account.refresh_token === refreshToken)
                return true;
            return false;
        });
    }
    parseCodexCredentialFile(filePath) {
        const content = fs_1.default.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
        const raw = JSON.parse(content);
        const accessToken = String(raw.access_token || raw.tokens?.access_token || '').trim();
        const refreshToken = String(raw.refresh_token || raw.tokens?.refresh_token || '').trim();
        const idToken = String(raw.id_token || raw.tokens?.id_token || '').trim();
        const parsed = openAIAccountService.parseTokenInfo(accessToken, refreshToken, idToken);
        const email = String(raw.oauth_email || raw.email || raw.outlook_email || parsed.email || '').trim();
        const externalAccountId = String(raw.account_id ||
            raw.external_account_id ||
            raw.tokens?.account_id ||
            parsed.chatgptAccountId ||
            '').trim();
        return {
            raw,
            accessToken,
            refreshToken,
            idToken,
            email,
            externalAccountId,
        };
    }
    async listAccounts(ctx) {
        (0, response_1.success)(ctx, model.list().map((item) => this.buildView(item)));
    }
    async createAccount(ctx) {
        const payload = await this.enrichPayload(this.normalizePayload(ctx.request.body));
        const error = this.validateAccount(payload);
        if (error)
            return (0, response_1.fail)(ctx, error, 400);
        (0, response_1.success)(ctx, this.buildView(model.create(payload)));
    }
    async updateAccount(ctx) {
        const id = Number(ctx.params.id);
        const current = model.getById(id);
        if (!current)
            return (0, response_1.fail)(ctx, 'token account not found', 404);
        const payload = await this.enrichPayload({ ...current, ...this.normalizePayload({ ...current, ...ctx.request.body }) });
        const error = this.validateAccount(payload);
        if (error)
            return (0, response_1.fail)(ctx, error, 400);
        const updated = model.update(id, payload);
        if (!updated)
            return (0, response_1.fail)(ctx, 'token account not found', 404);
        (0, response_1.success)(ctx, this.buildView(updated));
    }
    async deleteAccount(ctx) {
        const id = Number(ctx.params.id);
        const deleted = model.delete(id);
        if (!deleted)
            return (0, response_1.fail)(ctx, 'token account not found', 404);
        (0, response_1.success)(ctx, { deleted: true });
    }
    async syncAccount(ctx) {
        const id = Number(ctx.params.id);
        const account = model.getById(id);
        if (!account)
            return (0, response_1.fail)(ctx, 'token account not found', 404);
        try {
            const snapshot = await service.syncAccount(account);
            model.saveSyncResult(id, 'active', '', snapshot, {
                next_retry_at: null,
                failure_count: 0,
                last_failure_kind: 'none',
            });
            (0, response_1.success)(ctx, this.buildView(model.getById(id)));
        }
        catch (error) {
            const message = error.message || '同步失败';
            const failureKind = classifySyncError(message);
            const preserveAvailable = canKeepSnapshotAvailable(account, failureKind, message);
            model.saveSyncResult(id, preserveAvailable ? 'active' : 'error', message, null, {
                next_retry_at: failureKind === 'reauth_required' ? null : new Date(Date.now() + 60 * 1000).toISOString(),
                failure_count: Number(account.failure_count || 0) + 1,
                last_failure_kind: failureKind,
            });
            if (isReauthRequiredError(message)) {
                model.update(id, {
                    ...account,
                    status: 'error',
                    last_error: message,
                    auto_sync_enabled: 0,
                    next_retry_at: null,
                    failure_count: Number(account.failure_count || 0) + 1,
                    last_failure_kind: failureKind,
                });
            }
            (0, response_1.success)(ctx, this.buildView(model.getById(id)));
        }
    }
    async syncAll(ctx) {
        const results = [];
        for (const account of model.list()) {
            try {
                const snapshot = await service.syncAccount(account);
                model.saveSyncResult(account.id, 'active', '', snapshot, {
                    next_retry_at: null,
                    failure_count: 0,
                    last_failure_kind: 'none',
                });
            }
            catch (error) {
                const message = error.message || '同步失败';
                const failureKind = classifySyncError(message);
                const preserveAvailable = canKeepSnapshotAvailable(account, failureKind, message);
                model.saveSyncResult(account.id, preserveAvailable ? 'active' : 'error', message, null, {
                    next_retry_at: failureKind === 'reauth_required' ? null : new Date(Date.now() + 60 * 1000).toISOString(),
                    failure_count: Number(account.failure_count || 0) + 1,
                    last_failure_kind: failureKind,
                });
                if (isReauthRequiredError(message)) {
                    model.update(account.id, {
                        ...account,
                        status: 'error',
                        last_error: message,
                        auto_sync_enabled: 0,
                        next_retry_at: null,
                        failure_count: Number(account.failure_count || 0) + 1,
                        last_failure_kind: failureKind,
                    });
                }
            }
            const updated = model.getById(account.id);
            if (updated) {
                results.push(this.buildView(updated));
            }
        }
        (0, response_1.success)(ctx, results);
    }
    async autoSync(ctx) {
        try {
            const summary = await TokenAutoSyncService_1.tokenAutoSyncService.syncNow();
            (0, response_1.success)(ctx, {
                ...summary,
                running: TokenAutoSyncService_1.tokenAutoSyncService.isRunning(),
                accounts: model.list().map((item) => this.buildView(item)),
            });
        }
        catch (error) {
            (0, response_1.success)(ctx, {
                running: false,
                synced: 0,
                failed: 1,
                skipped: 0,
                recoveryTriggered: false,
                delayedAccounts: [],
                pausedAccounts: [],
                error: error?.message || '自动同步失败',
                accounts: model.list().map((item) => this.buildView(item)),
            });
        }
    }
    async importCodexFree(ctx) {
        const body = (ctx.request.body || {});
        const directory = path_1.default.resolve(String(body.directory || DEFAULT_CODEX_FREE_DIR));
        const mode = body.mode === 'skip' ? 'skip' : 'upsert';
        if (!fs_1.default.existsSync(directory) || !fs_1.default.statSync(directory).isDirectory()) {
            return (0, response_1.fail)(ctx, `Codex 凭证目录不存在：${directory}`, 400);
        }
        const files = fs_1.default.readdirSync(directory)
            .filter((name) => name.toLowerCase().endsWith('.json'))
            .map((name) => path_1.default.join(directory, name));
        const errors = [];
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        for (const filePath of files) {
            const fileName = path_1.default.basename(filePath);
            try {
                const parsed = this.parseCodexCredentialFile(filePath);
                if (!parsed.accessToken && !parsed.refreshToken) {
                    skipped += 1;
                    errors.push(`${fileName}: 缺少 access_token / refresh_token`);
                    continue;
                }
                const existing = this.findExistingCodexAccount({
                    email: parsed.email,
                    externalAccountId: parsed.externalAccountId,
                    refreshToken: parsed.refreshToken,
                });
                const payload = {
                    provider: 'openai_codex',
                    auth_method: 'oauth',
                    name: parsed.email || fileName.replace(/\.json$/i, ''),
                    session_format: 'cookie_header',
                    login_hint: parsed.email,
                    external_account_id: parsed.externalAccountId,
                    analytics_url: service.getDefaultAnalyticsUrl('openai_codex'),
                    access_token: parsed.accessToken,
                    refresh_token: parsed.refreshToken,
                    id_token: parsed.idToken,
                    user_agent: service.getDefaultUserAgent(),
                    note: [
                        `free:${fileName}`,
                        parsed.raw.type ? `type:${String(parsed.raw.type)}` : '',
                        parsed.raw.expired ? `expired:${String(parsed.raw.expired)}` : '',
                    ].filter(Boolean).join(' | '),
                    status: 'active',
                    auto_sync_enabled: 1,
                    last_error: '',
                    next_retry_at: null,
                    failure_count: 0,
                    last_failure_kind: 'none',
                };
                if (existing) {
                    if (mode === 'skip') {
                        skipped += 1;
                        continue;
                    }
                    model.update(existing.id, { ...existing, ...payload });
                    updated += 1;
                }
                else {
                    model.create(payload);
                    imported += 1;
                }
            }
            catch (error) {
                skipped += 1;
                errors.push(`${fileName}: ${error?.message || '解析失败'}`);
            }
        }
        (0, response_1.success)(ctx, {
            directory,
            scanned: files.length,
            imported,
            updated,
            skipped,
            errors,
            accounts: model.list().map((item) => this.buildView(item)),
        });
    }
}
exports.TokenController = TokenController;
//# sourceMappingURL=TokenController.js.map