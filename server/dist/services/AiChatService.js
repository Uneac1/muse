"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiChatService = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const OAuthService_1 = require("./OAuthService");
const ProxyService_1 = require("./ProxyService");
const AgentAutonomyService_1 = require("./AgentAutonomyService");
const MailService_1 = require("./MailService");
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const ipv4HttpsAgent = new https_1.default.Agent({ family: 4 });
const oauthService = new OAuthService_1.OAuthService();
const proxyService = new ProxyService_1.ProxyService();
const mailService = new MailService_1.MailService();
let museToolService = null;
const POWERSHELL_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const REQUEST_TIMEOUT_MS = 45000;
function getMuseToolService() {
    if (!museToolService) {
        const { AiMuseToolService } = require('./AiMuseToolService');
        museToolService = new AiMuseToolService();
    }
    return museToolService;
}
function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, '');
}
function joinUrl(base, path) {
    return `${normalizeBaseUrl(base)}${path.startsWith('/') ? path : `/${path}`}`;
}
function stripQuery(url) {
    return url.split('?')[0];
}
function getGeminiApiPrefix(baseUrl) {
    const sanitized = stripQuery(normalizeBaseUrl(baseUrl));
    if (/\/v\d+(?:beta)?\/models$/i.test(sanitized)) {
        return sanitized.replace(/\/models$/i, '');
    }
    if (/\/v\d+(?:beta)?$/i.test(sanitized)) {
        return sanitized;
    }
    if (/\/models$/i.test(sanitized)) {
        return sanitized.replace(/\/models$/i, '');
    }
    return sanitized;
}
function getGeminiModelsEndpoint(baseUrl) {
    const apiPrefix = getGeminiApiPrefix(baseUrl);
    return `${apiPrefix}/models`;
}
function getGeminiGenerateEndpoint(baseUrl, model) {
    const apiPrefix = getGeminiApiPrefix(baseUrl);
    const normalizedModel = model.startsWith('models/') ? model.slice('models/'.length) : model;
    return `${apiPrefix}/models/${encodeURIComponent(normalizedModel)}:generateContent`;
}
function isAnthropicProvider(provider) {
    return provider === 'claude' || provider === 'claude_code' || provider === 'anthropic_compatible';
}
function isResponsesProvider(provider) {
    return provider === 'codex';
}
function normalizeModelName(model) {
    return model.trim().toLowerCase().replace(/^models\//, '');
}
function getSystemPrompt(account) {
    return String(account.system_prompt || '').trim();
}
function buildIdentityPrompt(account) {
    const protocol = inferProtocol(account.provider, account.model);
    const providerLabel = account.provider === 'anthropic_compatible'
        ? 'Anthropic-compatible'
        : account.provider === 'claude'
            ? 'Claude'
            : account.provider === 'claude_code'
                ? 'Claude Code'
                : account.provider === 'gemini'
                    ? 'Gemini'
                    : account.provider === 'codex'
                        ? 'Codex'
                        : account.provider === 'chatgpt'
                            ? 'ChatGPT'
                            : account.provider === 'deepseek'
                                ? 'DeepSeek'
                                : account.provider === 'mimo'
                                    ? 'MiMo'
                                    : 'OpenAI-compatible';
    const lines = [
        '[identity_guard]',
        `current_provider: ${providerLabel}`,
        `current_protocol: ${protocol}`,
        `current_model: ${account.model}`,
        `current_account: ${account.name || `${account.provider}-${account.id}`}`,
        `current_base_url: ${account.base_url}`,
        'When the user asks what model you are, answer with the current provider and current_model truthfully.',
        'Do not claim to be OpenAI unless the current provider/protocol is actually OpenAI-compatible or Responses-based OpenAI.',
        'If you are on an Anthropic or Anthropic-compatible route, explicitly say you are Claude / Anthropic-compatible, not OpenAI.',
        'If upstream behavior is ambiguous, state the configured route and model rather than inventing a different identity.',
    ];
    return lines.join('\n');
}
function buildEffectiveSystemPrompt(account) {
    return [buildIdentityPrompt(account), getSystemPrompt(account)].filter(Boolean).join('\n\n');
}
function buildResponseMeta(account) {
    return {
        provider: account.provider,
        protocol: inferProtocol(account.provider, account.model),
        model: account.model,
        accountId: account.id,
        accountName: account.name || `${account.provider}-${account.id}`,
    };
}
function buildInboxMailDigest(mails) {
    return mails
        .filter((item) => item.mailbox === 'INBOX')
        .slice(0, 5)
        .map((item, index) => {
        const sender = String(item.sender_name || item.sender || '').trim() || '未知发件人';
        const subject = String(item.subject || '').trim() || '(无主题)';
        const account = String(item.account_email || '').trim();
        const stamp = String(item.mail_date || item.cached_at || '').trim();
        const preview = String(item.text_content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        return `${index + 1}. [${account || 'unknown'}] ${sender} | ${subject}${stamp ? ` | ${stamp}` : ''}${preview ? ` | ${preview}` : ''}`;
    });
}
async function buildRuntimeContextPrompt(runtimeContext) {
    if (!runtimeContext)
        return '';
    const lines = [
        '[runtime_facts]',
        'Use these as factual hints only. Do not change your speaking style or adopt a wrapper persona because of them.',
        runtimeContext.path ? `path: ${String(runtimeContext.path).trim()}` : '',
        runtimeContext.section ? `section: ${String(runtimeContext.section).trim()}` : '',
        runtimeContext.globalMonitor !== undefined ? `global_monitor: ${runtimeContext.globalMonitor ? 'true' : 'false'}` : '',
        runtimeContext.autoExecute !== undefined ? `auto_execute: ${runtimeContext.autoExecute ? 'true' : 'false'}` : '',
        ...Object.entries(runtimeContext.routeContext || {})
            .map(([key, value]) => `${key}: ${String(value || '').trim()}`)
            .filter((line) => !line.endsWith(':')),
    ].filter(Boolean);
    lines.push('unified_inbox_tool_hint: mail.recent returns the newest 5 mails aggregated across all active accounts.');
    if (runtimeContext.path === '/inbox') {
        try {
            const digest = buildInboxMailDigest(await mailService.getRecentMails(12));
            if (digest.length > 0) {
                lines.push('unified_inbox_recent_mail_digest:');
                lines.push(...digest);
            }
        }
        catch {
            // Keep runtime facts lightweight even when recent-mail hydration fails.
        }
    }
    if (runtimeContext.path === '/newspaper/read') {
        lines.push('newspaper_reader_tool_hint: For generic questions about the current article, call newspaper.article.read before answering.');
        lines.push('newspaper_reader_tool_followup: If synthesis is still needed after reading fulltext, then call newspaper.article.insight.');
    }
    return lines.join('\n');
}
function inferProtocol(provider, model) {
    const normalizedModel = normalizeModelName(model);
    if (normalizedModel.startsWith('gemini')) {
        return 'gemini';
    }
    if (normalizedModel.includes('claude') || normalizedModel.includes('anthropic')) {
        return 'anthropic';
    }
    if (normalizedModel.includes('codex') || /^gpt-5(?:[.-]|$)/i.test(normalizedModel)) {
        return 'responses';
    }
    if (provider === 'gemini') {
        return 'gemini';
    }
    if (isAnthropicProvider(provider)) {
        return 'anthropic';
    }
    if (isResponsesProvider(provider)) {
        return 'responses';
    }
    return 'openai';
}
function normalizeProtocolBaseUrl(protocol, baseUrl) {
    const sanitized = normalizeBaseUrl(baseUrl);
    if (protocol === 'anthropic') {
        return sanitized.replace(/\/v1$/i, '');
    }
    if (protocol === 'openai' || protocol === 'responses') {
        if (/\/v1$/i.test(sanitized)) {
            return sanitized;
        }
        if (/generativelanguage\.googleapis\.com/i.test(sanitized)) {
            return 'https://anyrouter.top/v1';
        }
        return `${sanitized}/v1`;
    }
    return sanitized;
}
function getModelListEndpoint(account) {
    if (account.provider === 'gemini') {
        const endpoint = getGeminiModelsEndpoint(account.base_url);
        return account.auth_mode === 'google_oauth'
            ? endpoint
            : `${endpoint}?key=${encodeURIComponent(account.api_key)}`;
    }
    if (isAnthropicProvider(account.provider)) {
        return joinUrl(account.base_url, '/v1/models');
    }
    return joinUrl(account.base_url, '/models');
}
function parseOpenAiContent(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
            if (typeof part === 'string')
                return part;
            if (part?.type === 'text')
                return part.text || '';
            return '';
        })
            .join('\n')
            .trim();
    }
    return '';
}
function parseGeminiText(json) {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts))
        return '';
    return parts.map((part) => part?.text || '').join('\n').trim();
}
function parseAnthropicText(json) {
    const content = json?.content;
    if (!Array.isArray(content))
        return '';
    return content
        .map((part) => (part?.type === 'text' ? part?.text || '' : ''))
        .join('\n')
        .trim();
}
function parseResponsesText(json) {
    const output = json?.output;
    if (!Array.isArray(output))
        return '';
    const chunks = [];
    for (const item of output) {
        if (Array.isArray(item?.content)) {
            for (const part of item.content) {
                if (part?.type === 'output_text' && part?.text) {
                    chunks.push(part.text);
                }
            }
        }
    }
    if (chunks.length > 0) {
        return chunks.join('\n').trim();
    }
    return parseOpenAiContent(json?.output_text);
}
function buildNativeRuntimeToolDefinition(toolNames) {
    return {
        type: 'function',
        name: 'shared_runtime_tool',
        description: 'Execute one shared runtime tool action. Use this when you need to inspect, navigate, read current data, or modify files, accounts, memory, workspace, integrations, or runtime state. You may call it multiple times in one turn when the task needs navigation plus data retrieval plus analysis.',
        strict: true,
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                tool: {
                    type: 'string',
                    enum: toolNames,
                    description: 'Exact shared runtime tool name to execute, such as muse.open, mail.recent, newspaper.article.read, workspace.search, workspace.read_file, proxy.test, memory.create, or integrations.sync.',
                },
                args: {
                    type: 'object',
                    description: 'Arguments for the selected shared runtime tool. For muse.open, pass args.path as an app route like /inbox, /proxy, or /newspaper/read?... . pathname, url, route, and target are also accepted.',
                    additionalProperties: true,
                },
            },
            required: ['tool'],
        },
    };
}
function parseNativeToolPayload(raw) {
    if (!raw)
        return null;
    if (typeof raw === 'object') {
        const item = raw;
        if (!item?.tool)
            return null;
        const nestedArgsCandidates = [
            item.args,
            item.arguments,
            item.parameters,
            item.input,
        ].filter((value) => value && typeof value === 'object');
        const topLevelArgs = Object.fromEntries(Object.entries(item).filter(([key]) => !['tool', 'args', 'arguments', 'parameters', 'input'].includes(key)));
        const mergedArgs = nestedArgsCandidates.reduce((acc, current) => ({ ...acc, ...current }), { ...(topLevelArgs && typeof topLevelArgs === 'object' ? topLevelArgs : {}) });
        return {
            tool: String(item.tool),
            args: mergedArgs,
        };
    }
    if (typeof raw !== 'string')
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.tool)
            return null;
        return {
            tool: String(parsed.tool),
            args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
        };
    }
    catch {
        return null;
    }
}
function parseOpenAiNativeToolCalls(json) {
    const toolCalls = Array.isArray(json?.choices?.[0]?.message?.tool_calls)
        ? json.choices[0].message.tool_calls
        : [];
    const calls = [];
    for (const item of toolCalls) {
        if (item?.type !== 'function')
            continue;
        const parsed = parseNativeToolPayload(item?.function?.arguments);
        if (parsed)
            calls.push(parsed);
    }
    return calls.slice(0, 5);
}
function parseResponsesNativeToolCalls(json) {
    const output = Array.isArray(json?.output) ? json.output : [];
    const calls = [];
    for (const item of output) {
        if (item?.type !== 'function_call')
            continue;
        const parsed = parseNativeToolPayload(item.arguments);
        if (parsed)
            calls.push(parsed);
    }
    return calls.slice(0, 5);
}
function formatGeminiError(json, fallback) {
    const error = json?.error;
    const details = Array.isArray(error?.details) ? error.details : [];
    const info = details.find((item) => item?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo');
    const localized = details.find((item) => item?.['@type'] === 'type.googleapis.com/google.rpc.LocalizedMessage');
    const message = localized?.message || error?.message || fallback;
    const reason = info?.reason || '';
    const projectId = info?.metadata?.consumer?.replace(/^projects\//, '') || info?.metadata?.containerInfo || '';
    const service = info?.metadata?.service || 'generativelanguage.googleapis.com';
    if (reason === 'SERVICE_DISABLED') {
        const consoleUrl = projectId
            ? `https://console.developers.google.com/apis/api/${service}/overview?project=${projectId}`
            : `https://console.developers.google.com/apis/api/${service}/overview`;
        return `Gemini API 还没有在项目 ${projectId || '当前 Google Cloud 项目'} 中启用。请先打开 ${consoleUrl} 启用 API，等待几分钟生效后再重试。`;
    }
    if (reason === 'API_KEY_INVALID') {
        return 'Gemini API Key 无效。请确认你填写的是当前项目可用的 Google AI Studio / Google Cloud API Key。';
    }
    if (reason === 'PERMISSION_DENIED') {
        return `Gemini 权限不足：${message}`;
    }
    return message;
}
function formatGatewayError(json, fallback) {
    const message = json?.error?.message ||
        json?.message ||
        json?.Message ||
        json?.error ||
        '';
    const code = json?.Code || json?.code || '';
    if (message && code) {
        return `${code}: ${message}`;
    }
    if (message) {
        return String(message);
    }
    return fallback;
}
function formatError(error) {
    const parts = [error?.message, error?.cause?.message, error?.code].filter(Boolean);
    return parts.join(' | ') || 'Unknown error';
}
function isProxyTransportError(error) {
    const message = String(error?.message || '').toLowerCase();
    const causeMessage = String(error?.cause?.message || '').toLowerCase();
    const code = String(error?.code || error?.cause?.code || '').toUpperCase();
    const detail = `${message} ${causeMessage} ${code}`.trim();
    return [
        'econrefused',
        'econnreset',
        'ehostunreach',
        'enetunreach',
        'etimedout',
        'eproto',
        'ssl',
        'tls',
        'handshake',
        'proxy',
        'connect refused',
    ].some((pattern) => detail.includes(pattern));
}
function getProxyOriginParts(value) {
    try {
        const parsed = new URL(value);
        return {
            hostname: parsed.hostname.toLowerCase(),
            port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
        };
    }
    catch {
        return null;
    }
}
function shouldStripProxyEnv(envValue, failedProxy) {
    if (!envValue || !failedProxy?.host || !failedProxy?.port) {
        return false;
    }
    const current = getProxyOriginParts(envValue);
    if (!current)
        return false;
    return current.hostname === String(failedProxy.host).toLowerCase()
        && current.port === Number(failedProxy.port);
}
function parseAvailableModels(raw) {
    try {
        const data = JSON.parse(raw || '[]');
        return Array.isArray(data) ? data.map((item) => String(item)).filter(Boolean) : [];
    }
    catch {
        return [];
    }
}
function dedupeModels(models) {
    const seen = new Set();
    return models.filter((item) => {
        const normalized = normalizeModelName(item);
        if (!normalized || seen.has(normalized))
            return false;
        seen.add(normalized);
        return true;
    });
}
function rankGeminiModel(model) {
    const normalized = normalizeModelName(model);
    if (normalized === 'gemini-2.5-flash')
        return 0;
    if (normalized === 'gemini-2.5-flash-lite')
        return 1;
    if (normalized === 'gemini-2.0-flash')
        return 2;
    if (normalized === 'gemini-2.0-flash-001')
        return 3;
    if (normalized === 'gemini-2.0-flash-lite')
        return 4;
    if (normalized === 'gemini-2.0-flash-lite-001')
        return 5;
    if (normalized === 'gemini-2.5-pro')
        return 6;
    return 100;
}
function getModelFamily(model) {
    const normalized = normalizeModelName(model);
    if (normalized.startsWith('models/'))
        return getModelFamily(normalized.replace(/^models\//, ''));
    if (normalized.startsWith('gemini'))
        return 'gemini';
    if (normalized.startsWith('claude') || normalized.includes('anthropic'))
        return 'claude';
    if (normalized.includes('codex'))
        return 'codex';
    if (/^gpt[-.0-9a-z]*/i.test(normalized))
        return 'gpt';
    if (normalized.startsWith('deepseek'))
        return 'deepseek';
    if (normalized.startsWith('mimo'))
        return 'mimo';
    return 'other';
}
function buildModelCandidates(account) {
    const currentModel = String(account.model || '').trim();
    const availableModels = parseAvailableModels(account.available_models);
    const unique = dedupeModels([currentModel, ...availableModels]);
    const currentFamily = getModelFamily(currentModel);
    const sameFamily = unique.filter((model) => getModelFamily(model) === currentFamily);
    const crossFamily = unique.filter((model) => getModelFamily(model) !== currentFamily);
    if (account.provider === 'gemini' || String(account.name || '').toLowerCase().includes('gemini')) {
        return [...sameFamily, ...crossFamily].sort((left, right) => {
            const rankGap = rankGeminiModel(left) - rankGeminiModel(right);
            if (rankGap !== 0)
                return rankGap;
            if (normalizeModelName(left) === normalizeModelName(currentModel))
                return -1;
            if (normalizeModelName(right) === normalizeModelName(currentModel))
                return 1;
            return left.localeCompare(right);
        });
    }
    if (/^any(dl)?$/i.test(String(account.name || '').trim())) {
        const familyPreference = currentFamily === 'claude'
            ? [
                'claude-opus-4-7',
                'claude-opus-4-6',
                'claude-opus-4-5-20251101',
                'claude-sonnet-4-5-20250929',
                'claude-sonnet-4-20250514',
                'claude-3-7-sonnet-20250219',
                'claude-3-5-sonnet-20241022',
                'claude-3-5-haiku-20241022',
            ]
            : currentFamily === 'codex' || currentFamily === 'gpt'
                ? [
                    'gpt-5.3-codex',
                    'gpt-5-codex',
                ]
                : currentFamily === 'gemini'
                    ? [
                        'gemini-2.5-pro',
                        'gemini-2.5-flash',
                        'gemini-2.0-flash',
                    ]
                    : [];
        const familyLockedPool = sameFamily.length ? [...sameFamily] : unique;
        return [...familyLockedPool].sort((left, right) => {
            const leftIndex = familyPreference.indexOf(normalizeModelName(left));
            const rightIndex = familyPreference.indexOf(normalizeModelName(right));
            if (leftIndex !== rightIndex) {
                return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
            }
            if (normalizeModelName(left) === normalizeModelName(currentModel))
                return -1;
            if (normalizeModelName(right) === normalizeModelName(currentModel))
                return 1;
            return left.localeCompare(right);
        });
    }
    if (isAnthropicProvider(account.provider) && sameFamily.length) {
        return [...sameFamily].sort((left, right) => {
            if (normalizeModelName(left) === normalizeModelName(currentModel))
                return -1;
            if (normalizeModelName(right) === normalizeModelName(currentModel))
                return 1;
            return left.localeCompare(right);
        });
    }
    return sameFamily.length ? [...sameFamily, ...crossFamily] : unique;
}
function findAnthropicFallbackModel(account, failedModel) {
    const availableModels = parseAvailableModels(account.available_models);
    const familyPrefix = failedModel.startsWith('claude-opus')
        ? 'claude-opus'
        : failedModel.startsWith('claude-sonnet')
            ? 'claude-sonnet'
            : failedModel.startsWith('claude-3')
                ? 'claude-3'
                : 'claude';
    const rankedCandidates = [
        ...availableModels.filter((item) => item !== failedModel && item.startsWith(familyPrefix)),
        ...availableModels.filter((item) => item !== failedModel && item.startsWith('claude-opus')),
        ...availableModels.filter((item) => item !== failedModel && item.startsWith('claude-sonnet')),
        ...availableModels.filter((item) => item !== failedModel && item.startsWith('claude-3')),
    ];
    return rankedCandidates[0] || '';
}
function findGeminiFallbackModel(account, failedModel) {
    const availableModels = parseAvailableModels(account.available_models)
        .map((item) => item.replace(/^models\//, ''));
    const current = failedModel.replace(/^models\//, '');
    const rankedCandidates = [
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-001',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash-lite-001',
        'gemini-2.5-pro',
    ];
    return rankedCandidates.find((item) => item !== current && availableModels.includes(item)) || '';
}
function shouldRetryGeminiWithFallback(detail) {
    return /timeout|timed out|deadline|unavailable|overloaded|429|503|etimedout|econnreset|connect etimedout/i.test(detail);
}
class AiChatService {
    async getGeminiAuth(account) {
        if (account.auth_mode === 'google_oauth') {
            const clientId = account.oauth_client_id || config_1.config.googleClientId;
            const clientSecret = account.oauth_client_secret || config_1.config.googleClientSecret;
            if (!clientId || !clientSecret) {
                throw new Error('Gemini Google OAuth client is not configured');
            }
            const token = await oauthService.refreshGoogleToken(clientId, clientSecret, account.oauth_refresh_token);
            return {
                endpointBase: getGeminiApiPrefix(account.base_url),
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.access_token}`,
                    ...((account.oauth_project_id || config_1.config.googleProjectId) ? { 'x-goog-user-project': account.oauth_project_id || config_1.config.googleProjectId } : {}),
                },
            };
        }
        return {
            endpointBase: `${getGeminiApiPrefix(account.base_url)}?key=${encodeURIComponent(account.api_key)}`,
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }
    async testConnection(account) {
        const startedAt = Date.now();
        try {
            const result = account.provider === 'gemini'
                ? await this.fetchGeminiModels(account)
                : isAnthropicProvider(account.provider)
                    ? await this.fetchAnthropicModels(account)
                    : await this.fetchOpenAiModels(account);
            return {
                ok: result.ok,
                status: result.status,
                latencyMs: Date.now() - startedAt,
                transport: result.transport,
                endpoint: result.endpoint,
                modelCount: result.models.length,
                models: result.models,
                preview: result.preview,
                message: result.ok
                    ? `连接成功，检测到 ${result.models.length} 个模型`
                    : result.message,
            };
        }
        catch (error) {
            return {
                ok: false,
                status: null,
                latencyMs: Date.now() - startedAt,
                transport: 'unknown',
                endpoint: account.provider === 'gemini'
                    ? `${normalizeBaseUrl(account.base_url)}?key=***`
                    : getModelListEndpoint(account),
                modelCount: 0,
                models: [],
                preview: '',
                message: formatError(error),
            };
        }
    }
    async sendMessageOnce(account, history) {
        const protocol = inferProtocol(account.provider, account.model);
        if (protocol === 'gemini') {
            return this.sendGemini(account, history);
        }
        if (protocol === 'anthropic') {
            return this.sendAnthropic(account, history);
        }
        if (protocol === 'responses') {
            return this.sendResponses(account, history);
        }
        return this.sendOpenAiCompatible(account, history);
    }
    async sendNativeToolMessageOnce(account, history) {
        const protocol = inferProtocol(account.provider, account.model);
        if (account.provider === 'mimo') {
            return {
                ...(await this.sendMessageOnce(account, history)),
                calls: [],
                native: false,
            };
        }
        if (protocol === 'responses') {
            return this.sendResponses(account, history, true);
        }
        if (protocol === 'openai') {
            return this.sendOpenAiCompatible(account, history, true);
        }
        return {
            ...(await this.sendMessageOnce(account, history)),
            calls: [],
            native: false,
        };
    }
    async sendMessage(account, history) {
        const candidates = buildModelCandidates(account).slice(0, 16);
        const failures = [];
        const lockedFamily = getModelFamily(account.model);
        for (const model of candidates) {
            if (lockedFamily !== 'other' && getModelFamily(model) !== lockedFamily) {
                failures.push(`${model}: skipped because family ${getModelFamily(model)} does not match locked family ${lockedFamily}`);
                continue;
            }
            const candidate = model === account.model ? account : { ...account, model };
            try {
                const result = await this.sendMessageOnce(candidate, history);
                if (model !== account.model) {
                    logger_1.default.warn(`AI account ${account.id} succeeded with fallback model ${model} instead of ${account.model}`);
                }
                return result;
            }
            catch (error) {
                failures.push(`${model}: ${formatError(error)}`);
            }
        }
        throw new Error(`all models failed for ${account.name || account.provider}: ${failures.slice(0, 6).join(' | ')}`);
    }
    async sendNativeToolMessage(account, history) {
        const candidates = buildModelCandidates(account).slice(0, 16);
        const failures = [];
        const lockedFamily = getModelFamily(account.model);
        for (const model of candidates) {
            if (lockedFamily !== 'other' && getModelFamily(model) !== lockedFamily) {
                failures.push(`${model}: skipped because family ${getModelFamily(model)} does not match locked family ${lockedFamily}`);
                continue;
            }
            const candidate = model === account.model ? account : { ...account, model };
            try {
                const result = await this.sendNativeToolMessageOnce(candidate, history);
                if (model !== account.model) {
                    logger_1.default.warn(`AI account ${account.id} succeeded with fallback model ${model} instead of ${account.model}`);
                }
                return result;
            }
            catch (error) {
                failures.push(`${model}: ${formatError(error)}`);
            }
        }
        throw new Error(`all models failed for ${account.name || account.provider}: ${failures.slice(0, 6).join(' | ')}`);
    }
    toToolExecutionDetails(results) {
        return results.map((item) => ({
            tool: item.call.tool,
            ok: !!item.ok,
            ...(item.error ? { error: item.error } : {}),
            ...(item.uiAction?.path ? { target: item.uiAction.path } : {}),
        }));
    }
    async sendModelSessionMessage(account, history, runtimeContext) {
        const museToolService = getMuseToolService();
        const runtimeContextPrompt = await buildRuntimeContextPrompt(runtimeContext);
        const implicitMemoryPrompt = AgentAutonomyService_1.agentAutonomyService.buildImplicitChatContext({
            userMessage: [...history].reverse().find((item) => item.role === 'user')?.content || '',
            runtimeContext,
        });
        const toolAccount = {
            ...account,
            system_prompt: [
                getSystemPrompt(account),
                implicitMemoryPrompt,
                runtimeContextPrompt,
                'You are the configured upstream model on this account. Keep your native reply style. Use shared runtime tools only when they materially help answer the user. If the task needs navigation plus reading data plus synthesis, you may call tools more than once in the same turn.',
                museToolService.getSystemPrompt(),
            ].filter(Boolean).join('\n\n'),
        };
        const latestUserMessage = [...history].reverse().find((item) => item.role === 'user')?.content || '';
        const effectiveHistory = latestUserMessage.trim() ? history : [
            ...history,
            {
                id: 0,
                thread_id: history[0]?.thread_id || 0,
                role: 'user',
                content: '.',
                created_at: new Date().toISOString(),
            },
        ];
        const maxToolRounds = 3;
        const aggregatedResults = [];
        let finalContent = '';
        let latestResponseMeta = null;
        let roundHistory = [...effectiveHistory];
        let pendingRound = await this.sendNativeToolMessage(toolAccount, roundHistory);
        for (let roundIndex = 0; roundIndex < maxToolRounds; roundIndex += 1) {
            latestResponseMeta = pendingRound.responseMeta;
            const assistantContent = pendingRound.content;
            const calls = pendingRound.calls;
            if (calls.length === 0) {
                finalContent = assistantContent;
                break;
            }
            const results = await museToolService.executeCalls(calls, latestUserMessage);
            aggregatedResults.push(...results);
            roundHistory = [
                ...roundHistory,
                {
                    id: 0,
                    thread_id: history[0]?.thread_id || 0,
                    role: 'assistant',
                    content: assistantContent || '[tool_call]',
                    created_at: new Date().toISOString(),
                },
                {
                    id: 0,
                    thread_id: history[0]?.thread_id || 0,
                    role: 'user',
                    content: museToolService.formatResultsForModel(results),
                    created_at: new Date().toISOString(),
                },
            ];
            if (roundIndex === maxToolRounds - 1) {
                break;
            }
            pendingRound = await this.sendNativeToolMessage(toolAccount, roundHistory);
        }
        if (aggregatedResults.length === 0) {
            return {
                content: finalContent,
                actions: [],
                toolExecutions: 0,
                toolDetails: [],
                responseMeta: latestResponseMeta || pendingRound.responseMeta,
                runtimeEventRefs: [],
            };
        }
        if (!String(finalContent || '').trim()) {
            const finalAnswer = await this.sendMessage({
                ...toolAccount,
                system_prompt: `${toolAccount.system_prompt}\n\n工具结果已经给出。现在直接回答用户，不要再次输出工具调用。`,
            }, roundHistory);
            finalContent = finalAnswer.content;
            latestResponseMeta = finalAnswer.responseMeta;
        }
        const actions = aggregatedResults.map((item) => item.uiAction).filter(Boolean);
        const runtimeEventRefs = [];
        if (runtimeContext?.path) {
            const event = AgentAutonomyService_1.agentAutonomyService.logEvent({
                layer: 'raw',
                scope: 'page',
                source: 'chat.runtime_context',
                eventType: 'page_observation',
                title: runtimeContext.section || runtimeContext.path,
                detail: `当前模型在 ${runtimeContext.path} 上下文中完成了一轮响应。`,
                content: {
                    path: runtimeContext.path,
                    section: runtimeContext.section || '',
                    tools: aggregatedResults.map((item) => item.call.tool),
                    model: account.model,
                    provider: account.provider,
                },
                confidence: 0.78,
            });
            runtimeEventRefs.push(String(event.id));
        }
        const toolDetails = this.toToolExecutionDetails(aggregatedResults);
        for (const detail of toolDetails) {
            const event = AgentAutonomyService_1.agentAutonomyService.logEvent({
                layer: 'raw',
                scope: 'tool',
                source: 'chat.tool_execution',
                eventType: detail.ok ? 'tool_success' : 'tool_failure',
                title: detail.tool,
                detail: detail.target || detail.error || (detail.ok ? '执行完成' : '执行失败'),
                content: {
                    tool: detail.tool,
                    ok: detail.ok,
                    target: detail.target || '',
                    error: detail.error || '',
                    path: runtimeContext?.path || '',
                },
                confidence: detail.ok ? 0.86 : 0.68,
            });
            runtimeEventRefs.push(String(event.id));
        }
        return {
            content: finalContent,
            actions,
            toolExecutions: aggregatedResults.length,
            toolDetails,
            responseMeta: latestResponseMeta || pendingRound.responseMeta,
            runtimeEventRefs,
        };
    }
    async sendMuseControlledMessage(account, history, runtimeContext) {
        return this.sendModelSessionMessage(account, history, runtimeContext);
    }
    async sendOpenAiCompatible(account, history, enableNativeTools = false) {
        const baseUrl = normalizeProtocolBaseUrl('openai', account.base_url);
        const toolNames = enableNativeTools ? getMuseToolService().getToolNames() : [];
        const messages = [];
        const systemPrompt = buildEffectiveSystemPrompt(account);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        for (const item of history) {
            messages.push({ role: item.role, content: item.content });
        }
        const payload = JSON.stringify({
            model: account.model,
            messages,
            temperature: 0.7,
            ...(enableNativeTools ? {
                tools: [buildNativeRuntimeToolDefinition(toolNames)],
                tool_choice: 'auto',
            } : {}),
        });
        const response = await this.requestJson(joinUrl(baseUrl, '/chat/completions'), {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
        }, payload);
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = formatGeminiError(json, `${response.status} ${response.statusText}`);
            throw new Error(detail);
        }
        const content = parseOpenAiContent(json?.choices?.[0]?.message?.content);
        if (enableNativeTools) {
            const calls = parseOpenAiNativeToolCalls(json);
            if (calls.length > 0 || content) {
                return {
                    content,
                    calls,
                    native: true,
                    responseMeta: buildResponseMeta(account),
                };
            }
            throw new Error('AI 未返回可用内容');
        }
        if (!content) {
            throw new Error('AI 未返回可用内容');
        }
        return {
            content,
            responseMeta: buildResponseMeta(account),
        };
    }
    async sendResponses(account, history, enableNativeTools = false) {
        const baseUrl = normalizeProtocolBaseUrl('responses', account.base_url);
        const toolNames = enableNativeTools ? getMuseToolService().getToolNames() : [];
        const input = history.map((item) => ({
            role: item.role,
            content: item.content,
        }));
        const endpoint = joinUrl(baseUrl, '/responses');
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
        };
        const payload = JSON.stringify({
            model: account.model,
            instructions: buildEffectiveSystemPrompt(account) || undefined,
            input,
            temperature: 0.7,
            ...(enableNativeTools ? {
                tools: [buildNativeRuntimeToolDefinition(toolNames)],
                tool_choice: 'auto',
            } : {}),
        });
        let response = await this.requestJson(endpoint, headers, payload);
        let raw = await response.text();
        let json = null;
        try {
            json = raw ? JSON.parse(raw) : null;
        }
        catch { }
        if (!response.ok && response.transport !== 'powershell' && [400, 401, 403, 502].includes(response.status)) {
            logger_1.default.warn(`Responses endpoint failed through ${response.transport} for account ${account.id}, retrying PowerShell direct: ${raw.slice(0, 300) || response.status}`);
            response = await this.powershellRequest('POST', endpoint, headers, payload, (await proxyService.resolveAgent()).proxy);
            raw = await response.text();
            try {
                json = raw ? JSON.parse(raw) : null;
            }
            catch {
                json = null;
            }
        }
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || raw.slice(0, 800) || `${response.status} ${response.statusText}`;
            if (response.status === 400 || response.status === 404 || /not found|unsupported|unknown endpoint|invalid url/i.test(detail)) {
                logger_1.default.warn(`Responses endpoint failed for account ${account.id}, trying chat completions fallback: ${detail}`);
                return this.sendOpenAiCompatible(account, history, enableNativeTools);
            }
            throw new Error(detail);
        }
        const content = parseResponsesText(json);
        if (enableNativeTools) {
            const calls = parseResponsesNativeToolCalls(json);
            if (calls.length > 0 || content) {
                return {
                    content,
                    calls,
                    native: true,
                    responseMeta: buildResponseMeta(account),
                };
            }
            throw new Error('Codex / Responses API 未返回可用内容');
        }
        if (!content) {
            throw new Error('Codex / Responses API 未返回可用内容');
        }
        return {
            content,
            responseMeta: buildResponseMeta(account),
        };
    }
    async sendAnthropic(account, history, modelOverride) {
        const baseUrl = normalizeProtocolBaseUrl('anthropic', account.base_url);
        const model = modelOverride || account.model;
        const messages = history.map((item) => ({
            role: item.role,
            content: [{ type: 'text', text: item.content }],
        }));
        const response = await this.requestJson(joinUrl(baseUrl, '/v1/messages'), {
            'Content-Type': 'application/json',
            'x-api-key': account.api_key,
            'anthropic-version': '2023-06-01',
        }, JSON.stringify({
            model,
            max_tokens: 4096,
            system: buildEffectiveSystemPrompt({ ...account, model }) || undefined,
            messages,
        }));
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            if (!modelOverride && /1m\s*上下文|1m\s*context/i.test(detail)) {
                const fallbackModel = findAnthropicFallbackModel(account, model);
                if (fallbackModel) {
                    logger_1.default.warn(`Anthropic model ${model} rejected by upstream, retrying with fallback model ${fallbackModel}`);
                    return this.sendAnthropic(account, history, fallbackModel);
                }
            }
            throw new Error(detail);
        }
        const content = parseAnthropicText(json);
        if (!content) {
            throw new Error('Anthropic Messages 未返回可用内容');
        }
        return {
            content,
            responseMeta: buildResponseMeta({ ...account, model }),
        };
    }
    async sendGemini(account, history, modelOverride) {
        const model = modelOverride || account.model;
        const contents = history.map((item) => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }],
        }));
        const systemPrompt = buildEffectiveSystemPrompt({ ...account, model });
        if (systemPrompt) {
            contents.unshift({
                role: 'user',
                parts: [{ text: `System instructions:\n${systemPrompt}` }],
            });
        }
        const auth = await this.getGeminiAuth(account);
        const endpoint = account.auth_mode === 'google_oauth'
            ? getGeminiGenerateEndpoint(auth.endpointBase, model)
            : `${getGeminiGenerateEndpoint(account.base_url, model)}?key=${encodeURIComponent(account.api_key)}`;
        try {
            const response = await this.requestJson(endpoint, auth.headers, JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.7,
                },
            }));
            const json = await response.json().catch(() => null);
            if (!response.ok) {
                const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
                if (!modelOverride && shouldRetryGeminiWithFallback(detail)) {
                    const fallbackModel = findGeminiFallbackModel(account, model);
                    if (fallbackModel) {
                        logger_1.default.warn(`Gemini model ${model} failed, retrying with fallback model ${fallbackModel}: ${detail}`);
                        return this.sendGemini(account, history, fallbackModel);
                    }
                }
                throw new Error(detail);
            }
            const content = parseGeminiText(json);
            if (!content) {
                throw new Error('Gemini 未返回可用内容');
            }
            return {
                content,
                responseMeta: buildResponseMeta({ ...account, model }),
            };
        }
        catch (error) {
            const detail = formatError(error);
            if (!modelOverride && shouldRetryGeminiWithFallback(detail)) {
                const fallbackModel = findGeminiFallbackModel(account, model);
                if (fallbackModel) {
                    logger_1.default.warn(`Gemini request for model ${model} threw ${detail}, retrying with fallback model ${fallbackModel}`);
                    return this.sendGemini(account, history, fallbackModel);
                }
            }
            throw error;
        }
    }
    async fetchOpenAiModels(account) {
        const endpoint = joinUrl(account.base_url, '/models');
        const response = await this.request('GET', endpoint, {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
        });
        const raw = await response.text();
        const json = raw ? JSON.parse(raw) : {};
        const models = Array.isArray(json?.data)
            ? json.data.map((item) => item?.id).filter(Boolean)
            : [];
        return {
            ok: response.ok,
            status: response.status,
            transport: response.transport,
            endpoint,
            models,
            preview: raw.slice(0, 800),
            message: response.ok
                ? 'ok'
                : formatGatewayError(json, `${response.status} ${response.statusText || ''}`.trim()),
        };
    }
    async fetchGeminiModels(account) {
        const auth = await this.getGeminiAuth(account);
        const endpoint = account.auth_mode === 'google_oauth'
            ? getGeminiModelsEndpoint(account.base_url)
            : `${getGeminiModelsEndpoint(account.base_url)}?key=${encodeURIComponent(account.api_key)}`;
        const response = await this.request('GET', endpoint, auth.headers);
        const raw = await response.text();
        const json = raw ? JSON.parse(raw) : {};
        const models = Array.isArray(json?.models)
            ? json.models.map((item) => item?.name || item?.displayName).filter(Boolean)
            : [];
        return {
            ok: response.ok,
            status: response.status,
            transport: response.transport,
            endpoint: `${getGeminiModelsEndpoint(account.base_url)}?key=***`,
            models,
            preview: raw.slice(0, 800),
            message: response.ok
                ? 'ok'
                : json?.error?.message || json?.message || `${response.status} ${response.statusText || ''}`.trim(),
        };
    }
    async fetchAnthropicModels(account) {
        const endpoint = joinUrl(account.base_url, '/v1/models');
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
            'x-api-key': account.api_key,
            'anthropic-version': '2023-06-01',
        };
        let response = await this.request('GET', endpoint, headers);
        let raw = await response.text();
        let json = raw ? JSON.parse(raw) : {};
        if (!response.ok && response.status === 401 && /未提供令牌|missing token/i.test(raw)) {
            const proxyTransport = proxyService.getAgent();
            logger_1.default.warn(`Anthropic model listing likely lost auth through proxy for ${endpoint}, retrying direct PowerShell request`);
            response = await this.powershellRequest('GET', endpoint, headers, '', proxyTransport.proxy);
            raw = await response.text();
            json = raw ? JSON.parse(raw) : {};
        }
        const models = Array.isArray(json?.data)
            ? json.data.map((item) => item?.id || item?.name || item?.display_name).filter(Boolean)
            : [];
        return {
            ok: response.ok,
            status: response.status,
            transport: response.transport,
            endpoint,
            models,
            preview: raw.slice(0, 800),
            message: response.ok
                ? 'ok'
                : formatGatewayError(json, `${response.status} ${response.statusText || ''}`.trim()),
        };
    }
    async request(method, url, headers, body) {
        const proxyTransport = await proxyService.resolveAgent();
        try {
            return await this.performNodeRequest(method, url, headers, body, proxyTransport);
        }
        catch (error) {
            const detail = formatError(error);
            if (proxyTransport.type && isProxyTransportError(error)) {
                logger_1.default.warn(`AI fetch failed through proxy for ${method} ${url}, retrying direct: ${detail}`);
                if (proxyTransport.proxy?.id) {
                    proxyService.markFailed(proxyTransport.proxy.id);
                }
                try {
                    return await this.performNodeRequest(method, url, headers, body);
                }
                catch (directError) {
                    logger_1.default.warn(`AI direct retry failed for ${method} ${url}, trying PowerShell fallback: ${formatError(directError)}`);
                }
            }
            else {
                logger_1.default.warn(`AI fetch failed for ${method} ${url}, trying PowerShell fallback: ${detail}`);
            }
            if (process.platform !== 'win32') {
                throw new Error(`AI request failed: ${detail}`);
            }
            try {
                return await this.powershellRequest(method, url, headers, body || '', proxyTransport.proxy);
            }
            catch (fallbackError) {
                throw new Error(`AI request failed: ${detail}; PowerShell fallback failed: ${formatError(fallbackError)}`);
            }
        }
    }
    async performNodeRequest(method, url, headers, body, transport) {
        const nodeFetch = require('node-fetch');
        let response;
        if (transport?.type === 'http' && transport.dispatcher) {
            const { fetch: undiciFetch } = require('undici');
            response = await undiciFetch(url, {
                method,
                headers,
                body,
                dispatcher: transport.dispatcher,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        }
        else {
            response = await nodeFetch(url, {
                method,
                agent: transport?.type === 'socks5' && transport.agent ? transport.agent : ipv4HttpsAgent,
                headers,
                body,
                timeout: REQUEST_TIMEOUT_MS,
            });
        }
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            transport: transport?.type === 'http'
                ? 'http-proxy'
                : transport?.type === 'socks5'
                    ? 'socks5-proxy'
                    : 'node-fetch',
            text: () => response.text(),
            json: () => response.json(),
        };
    }
    async requestJson(url, headers, body) {
        return this.request('POST', url, headers, body);
    }
    async powershellRequest(method, url, headers, body, failedProxy) {
        const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{}
if ($env:REQ_HEADERS_FILE -and (Test-Path $env:REQ_HEADERS_FILE)) {
  $parsed = (Get-Content -LiteralPath $env:REQ_HEADERS_FILE -Raw) | ConvertFrom-Json
  foreach ($prop in $parsed.PSObject.Properties) {
    $headers[$prop.Name] = [string]$prop.Value
  }
}
$params = @{
  Uri = $env:REQ_URL
  Method = $env:REQ_METHOD
  Headers = $headers
  UseBasicParsing = $true
}
if ($env:REQ_METHOD -eq 'POST') {
  $bodyText = ''
  if ($env:REQ_BODY_FILE -and (Test-Path $env:REQ_BODY_FILE)) {
    $bodyText = Get-Content -LiteralPath $env:REQ_BODY_FILE -Raw
  }
  $params.Body = [System.Text.Encoding]::UTF8.GetBytes($bodyText)
  $params.ContentType = 'application/json; charset=utf-8'
}
try {
  $response = Invoke-WebRequest @params
  $status = [int]$response.StatusCode
  $content = [string]$response.Content
} catch {
  $response = $_.Exception.Response
  if ($response) {
    if ($response.GetType().FullName -eq 'System.Net.Http.HttpResponseMessage') {
      $status = [int]$response.StatusCode
      if ($response.Content) {
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      } elseif ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $content = [string]$_.ErrorDetails.Message
      } else {
        $content = [string]$_.Exception.Message
      }
    } else {
      $status = [int]$response.StatusCode
      $stream = $response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
      } elseif ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $content = [string]$_.ErrorDetails.Message
      } else {
        $content = [string]$_.Exception.Message
      }
    }
  } else {
    throw
  }
}
$result = @{ status = $status; body = $content } | ConvertTo-Json -Compress
Write-Output ([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($result)))
`;
        const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'muse-ai-'));
        const bodyFile = path_1.default.join(tmpDir, 'body.json');
        const headersFile = path_1.default.join(tmpDir, 'headers.json');
        fs_1.default.writeFileSync(bodyFile, body || '', 'utf8');
        fs_1.default.writeFileSync(headersFile, JSON.stringify(headers), 'utf8');
        const env = {
            ...process.env,
            REQ_METHOD: method,
            REQ_URL: url,
            REQ_BODY_FILE: bodyFile,
            REQ_HEADERS_FILE: headersFile,
        };
        for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
            if (shouldStripProxyEnv(env[key], failedProxy)) {
                delete env[key];
            }
        }
        let stdout = '';
        try {
            const result = await execFileAsync(POWERSHELL_EXE, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
                env: {
                    ...env,
                },
                windowsHide: true,
                timeout: 60000,
                maxBuffer: 1024 * 1024,
            });
            stdout = result.stdout;
        }
        finally {
            fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
        const encoded = stdout.trim().split(/\r?\n/).pop() || '';
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const result = JSON.parse(decoded);
        return {
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            statusText: '',
            transport: 'powershell',
            text: async () => result.body || '',
            json: async () => JSON.parse(result.body || '{}'),
        };
    }
}
exports.AiChatService = AiChatService;
//# sourceMappingURL=AiChatService.js.map