"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiChatService = void 0;
const child_process_1 = require("child_process");
const https_1 = __importDefault(require("https"));
const util_1 = require("util");
const OAuthService_1 = require("./OAuthService");
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const ipv4HttpsAgent = new https_1.default.Agent({ family: 4 });
const oauthService = new OAuthService_1.OAuthService();
function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, '');
}
function joinUrl(base, path) {
    return `${normalizeBaseUrl(base)}${path.startsWith('/') ? path : `/${path}`}`;
}
function isAnthropicProvider(provider) {
    return provider === 'claude' || provider === 'claude_code' || provider === 'anthropic_compatible';
}
function isResponsesProvider(provider) {
    return provider === 'codex';
}
function getModelListEndpoint(account) {
    if (account.provider === 'gemini') {
        return account.auth_mode === 'google_oauth'
            ? normalizeBaseUrl(account.base_url)
            : `${normalizeBaseUrl(account.base_url)}?key=${encodeURIComponent(account.api_key)}`;
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
function formatError(error) {
    const parts = [error?.message, error?.cause?.message, error?.code].filter(Boolean);
    return parts.join(' | ') || 'Unknown error';
}
class AiChatService {
    async getGeminiAuth(account) {
        if (account.auth_mode === 'google_oauth') {
            const clientId = account.oauth_client_id || config_1.config.adminGoogleClientId;
            const clientSecret = account.oauth_client_secret || config_1.config.adminGoogleClientSecret;
            if (!clientId || !clientSecret) {
                throw new Error('Gemini Google OAuth client is not configured');
            }
            const token = await oauthService.refreshGoogleToken(clientId, clientSecret, account.oauth_refresh_token);
            return {
                endpointBase: normalizeBaseUrl(account.base_url),
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token.access_token}`,
                    ...(account.oauth_project_id ? { 'x-goog-user-project': account.oauth_project_id } : {}),
                },
            };
        }
        return {
            endpointBase: `${normalizeBaseUrl(account.base_url)}?key=${encodeURIComponent(account.api_key)}`,
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
    async sendMessage(account, history) {
        if (account.provider === 'gemini') {
            return this.sendGemini(account, history);
        }
        if (isAnthropicProvider(account.provider)) {
            return this.sendAnthropic(account, history);
        }
        if (isResponsesProvider(account.provider)) {
            return this.sendResponses(account, history);
        }
        return this.sendOpenAiCompatible(account, history);
    }
    async sendOpenAiCompatible(account, history) {
        const messages = [];
        if (account.system_prompt.trim()) {
            messages.push({ role: 'system', content: account.system_prompt.trim() });
        }
        for (const item of history) {
            messages.push({ role: item.role, content: item.content });
        }
        const payload = JSON.stringify({
            model: account.model,
            messages,
            temperature: 0.7,
        });
        const response = await this.requestJson(joinUrl(account.base_url, '/chat/completions'), {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
        }, payload);
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(detail);
        }
        const content = parseOpenAiContent(json?.choices?.[0]?.message?.content);
        if (!content) {
            throw new Error('AI 未返回可用内容');
        }
        return content;
    }
    async sendResponses(account, history) {
        const input = [];
        if (account.system_prompt.trim()) {
            input.push({
                role: 'system',
                content: [{ type: 'input_text', text: account.system_prompt.trim() }],
            });
        }
        for (const item of history) {
            input.push({
                role: item.role,
                content: [{ type: 'input_text', text: item.content }],
            });
        }
        const response = await this.requestJson(joinUrl(account.base_url, '/responses'), {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${account.api_key}`,
        }, JSON.stringify({
            model: account.model,
            input,
            temperature: 0.7,
        }));
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(detail);
        }
        const content = parseResponsesText(json);
        if (!content) {
            throw new Error('Codex / Responses API 未返回可用内容');
        }
        return content;
    }
    async sendAnthropic(account, history) {
        const messages = history.map((item) => ({
            role: item.role,
            content: [{ type: 'text', text: item.content }],
        }));
        const response = await this.requestJson(joinUrl(account.base_url, '/v1/messages'), {
            'Content-Type': 'application/json',
            'x-api-key': account.api_key,
            'anthropic-version': '2023-06-01',
        }, JSON.stringify({
            model: account.model,
            max_tokens: 4096,
            system: account.system_prompt.trim() || undefined,
            messages,
        }));
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(detail);
        }
        const content = parseAnthropicText(json);
        if (!content) {
            throw new Error('Anthropic Messages 未返回可用内容');
        }
        return content;
    }
    async sendGemini(account, history) {
        const contents = history.map((item) => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }],
        }));
        const auth = await this.getGeminiAuth(account);
        const endpoint = account.auth_mode === 'google_oauth'
            ? `${auth.endpointBase}/${encodeURIComponent(account.model)}:generateContent`
            : `${normalizeBaseUrl(account.base_url)}/${encodeURIComponent(account.model)}:generateContent?key=${encodeURIComponent(account.api_key)}`;
        const response = await this.requestJson(endpoint, auth.headers, JSON.stringify({
            contents,
            systemInstruction: account.system_prompt.trim()
                ? { parts: [{ text: account.system_prompt.trim() }] }
                : undefined,
            generationConfig: {
                temperature: 0.7,
            },
        }));
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(detail);
        }
        const content = parseGeminiText(json);
        if (!content) {
            throw new Error('Gemini 未返回可用内容');
        }
        return content;
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
                : json?.error?.message || json?.message || `${response.status} ${response.statusText || ''}`.trim(),
        };
    }
    async fetchGeminiModels(account) {
        const auth = await this.getGeminiAuth(account);
        const endpoint = account.auth_mode === 'google_oauth'
            ? normalizeBaseUrl(account.base_url)
            : `${normalizeBaseUrl(account.base_url)}?key=${encodeURIComponent(account.api_key)}`;
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
            endpoint: `${normalizeBaseUrl(account.base_url)}?key=***`,
            models,
            preview: raw.slice(0, 800),
            message: response.ok
                ? 'ok'
                : json?.error?.message || json?.message || `${response.status} ${response.statusText || ''}`.trim(),
        };
    }
    async fetchAnthropicModels(account) {
        const endpoint = joinUrl(account.base_url, '/v1/models');
        const response = await this.request('GET', endpoint, {
            'Content-Type': 'application/json',
            'x-api-key': account.api_key,
            'anthropic-version': '2023-06-01',
        });
        const raw = await response.text();
        const json = raw ? JSON.parse(raw) : {};
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
                : json?.error?.message || json?.message || `${response.status} ${response.statusText || ''}`.trim(),
        };
    }
    async request(method, url, headers, body) {
        try {
            const nodeFetch = require('node-fetch');
            const response = await nodeFetch(url, {
                method,
                agent: ipv4HttpsAgent,
                headers,
                body,
            });
            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                transport: 'node-fetch',
                text: () => response.text(),
                json: () => response.json(),
            };
        }
        catch (error) {
            const detail = formatError(error);
            logger_1.default.warn(`AI fetch failed for ${method} ${url}, trying PowerShell fallback: ${detail}`);
            if (process.platform !== 'win32') {
                throw new Error(`AI request failed: ${detail}`);
            }
            try {
                return await this.powershellRequest(method, url, headers, body || '');
            }
            catch (fallbackError) {
                throw new Error(`AI request failed: ${detail}; PowerShell fallback failed: ${formatError(fallbackError)}`);
            }
        }
    }
    async requestJson(url, headers, body) {
        return this.request('POST', url, headers, body);
    }
    async powershellRequest(method, url, headers, body) {
        const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$headers = @{}
if ($env:REQ_HEADERS) {
  $parsed = $env:REQ_HEADERS | ConvertFrom-Json
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
  $params.Body = $env:REQ_BODY
  $params.ContentType = 'application/json'
}
try {
  $response = Invoke-WebRequest @params
  $status = [int]$response.StatusCode
  $content = [string]$response.Content
} catch {
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $content = $reader.ReadToEnd()
    } elseif ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $content = [string]$_.ErrorDetails.Message
    } else {
      $content = [string]$_.Exception.Message
    }
  } else {
    throw
  }
}
$result = @{ status = $status; body = $content } | ConvertTo-Json -Compress
Write-Output ([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($result)))
`;
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
            env: {
                ...process.env,
                REQ_METHOD: method,
                REQ_URL: url,
                REQ_BODY: body,
                REQ_HEADERS: JSON.stringify(headers),
            },
            windowsHide: true,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
        });
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