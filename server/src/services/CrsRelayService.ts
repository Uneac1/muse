import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import fetch, { Headers } from 'node-fetch';
import type { Context } from 'koa';
import { AiAccountModel } from '../models/AiChat';
import { TokenAccountModel } from '../models/TokenAccount';
import { refreshOpenAITokenAccount } from './TokenAccountRefreshService';
import { ProxyService } from './ProxyService';
import type { TokenAccount } from '../types';

export interface CrsRelayConfig {
  enabled: boolean;
  name: string;
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  publicApiKey: string;
  defaultModel: string;
  timeoutMs: number;
  enabledSources: CrsRelaySource[];
  updatedAt: string | null;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | 'never';
  lastError: string;
}

export interface CrsRelayStatus extends Omit<CrsRelayConfig, 'upstreamApiKey' | 'publicApiKey'> {
  upstreamApiKeyMasked: string;
  publicApiKeyMasked: string;
  relayBaseUrl: string;
  codexConfig: {
    path: string;
    mode: 'crs' | 'normal' | 'missing';
    backupPath: string;
    lastSyncedAt: string | null;
  };
  candidateCount: number;
  candidates: Array<{
    source: 'ai' | 'token' | 'manual';
    sourceType: CrsRelaySource;
    id: number | string;
    name: string;
    model: string;
    baseUrl: string;
    status: string;
  }>;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'crs-relay.json');
const CRS_ENV_KEY = 'MUSE_CRS_API_KEY';
const CRS_PROVIDER_ID = 'muse_crs';
const CRS_CONFIG_STATE_FILE = 'muse-crs-config-state.json';
const CHATGPT_CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_CLI_USER_AGENT = 'codex_cli_rs/0.125.0';
const CODEX_UNSUPPORTED_FIELDS = [
  'user',
  'metadata',
  'prompt_cache_retention',
  'safety_identifier',
  'stream_options',
  'max_output_tokens',
  'max_completion_tokens',
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
];
const aiAccountModel = new AiAccountModel();
const tokenAccountModel = new TokenAccountModel();
const proxyService = new ProxyService();
let codexOauthCursor = 0;
const CANDIDATE_FAILURE_COOLDOWN_MS = 60 * 1000;
const CANDIDATE_AUTH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const CANDIDATE_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000;
const CANDIDATE_SERVER_FAILURE_COOLDOWN_MS = 30 * 1000;
const MAX_CANDIDATE_ATTEMPTS_PER_REQUEST = 4;
const candidateFailureUntil = new Map<string, number>();
const CANDIDATE_CACHE_TTL_MS = 1500;
const CRS_MAX_BODY_BYTES = 64 * 1024 * 1024;
let configCache: { mtimeMs: number; value: CrsRelayConfig } | null = null;
let candidateCache: { expiresAt: number; configKey: string; value: CrsCandidate[] } | null = null;

export type CrsRelaySource = 'oauth' | 'token_api' | 'ai_api' | 'manual';
const ALL_CRS_SOURCES: CrsRelaySource[] = ['oauth', 'token_api', 'ai_api', 'manual'];
const DEFAULT_CRS_SOURCES: CrsRelaySource[] = ['oauth'];

type CrsCandidate = {
  source: 'ai' | 'token' | 'manual';
  sourceType: CrsRelaySource;
  id: number | string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  status: string;
  priority: number;
  authKind: 'api_key' | 'openai_codex_oauth';
  accountId?: string;
  tokenAccount?: TokenAccount;
};

function candidateFailureKey(candidate: CrsCandidate, model = candidate.model, endpoint = '') {
  return [
    candidate.source,
    candidate.id,
    String(model || candidate.model || '').trim() || 'default',
    String(endpoint || '').trim() || 'any',
  ].join(':');
}

function crsConfigCacheKey(config: CrsRelayConfig) {
  return [
    config.enabledSources.join(','),
    config.defaultModel,
    config.upstreamBaseUrl,
    config.upstreamApiKey ? 'manual-key' : '',
    config.name,
  ].join('|');
}

function invalidateCrsRuntimeCaches() {
  configCache = null;
  candidateCache = null;
}

function candidateFailureCooldownMs(status?: number) {
  if (status === 401 || status === 403) return CANDIDATE_AUTH_FAILURE_COOLDOWN_MS;
  if (status === 429) return CANDIDATE_RATE_LIMIT_COOLDOWN_MS;
  if (status && status >= 500) return CANDIDATE_SERVER_FAILURE_COOLDOWN_MS;
  return CANDIDATE_FAILURE_COOLDOWN_MS;
}

function pruneCandidateFailures(now = Date.now()) {
  for (const [key, until] of candidateFailureUntil.entries()) {
    if (until <= now) candidateFailureUntil.delete(key);
  }
}

function setCandidateFailure(key: string, status?: number) {
  const now = Date.now();
  pruneCandidateFailures(now);
  candidateFailureUntil.set(key, now + candidateFailureCooldownMs(status));
}

async function readIncomingBody(ctx: Context): Promise<Buffer> {
  const state = ctx.state as any;
  if (Buffer.isBuffer(state.crsRawBody)) return state.crsRawBody;

  if (ctx.request.body !== undefined && ctx.request.body !== null) {
    const raw = typeof ctx.request.body === 'string'
      ? Buffer.from(ctx.request.body)
      : Buffer.from(JSON.stringify(ctx.request.body));
    state.crsRawBody = raw;
    return raw;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of ctx.req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > CRS_MAX_BODY_BYTES) {
      const error: any = new Error('CRS request body exceeds 64mb limit');
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks);
  state.crsRawBody = raw;
  return raw;
}

function maskSecret(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeOpenAiBaseUrl(value: string) {
  const base = normalizeBaseUrl(value);
  if (!base) return '';
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function joinUrl(base: string, suffix: string) {
  return `${normalizeBaseUrl(base)}/${suffix.replace(/^\/+/, '')}`;
}

function isOpenAiCompatibleAiProvider(provider: string) {
  return ['chatgpt', 'codex', 'deepseek', 'mimo', 'openai_compatible'].includes(provider);
}

function isCodexClientHeader(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('codex_cli_rs/')
    || normalized.includes('codex_vscode/')
    || normalized.includes('codex_app/')
    || normalized.includes('codex_chatgpt_desktop/')
    || normalized.includes('codex ');
}

function normalizeCodexModel(model: string) {
  const normalized = String(model || '').trim().toLowerCase();
  if (!normalized) return 'gpt-5.4';
  if (normalized.includes('gpt-5.5')) return 'gpt-5.5';
  if (normalized.includes('gpt-5.4-mini')) return 'gpt-5.4-mini';
  if (normalized.includes('gpt-5.4')) return 'gpt-5.4';
  if (normalized.includes('gpt-5.3-codex-spark')) return 'gpt-5.3-codex-spark';
  if (normalized.includes('gpt-5.3') || normalized.includes('codex')) return 'gpt-5.3-codex';
  if (normalized.includes('gpt-5.2')) return 'gpt-5.2';
  if (normalized.includes('gpt-5')) return 'gpt-5.4';
  return String(model || '').trim();
}

function defaultConfig(): CrsRelayConfig {
  return {
    enabled: false,
    name: 'Muse CRS',
    upstreamBaseUrl: 'https://api.openai.com/v1',
    upstreamApiKey: '',
    publicApiKey: `cr_${crypto.randomBytes(24).toString('hex')}`,
    defaultModel: '',
    timeoutMs: 120000,
    enabledSources: normalizeSources(process.env.CRS_ENABLED_SOURCES || DEFAULT_CRS_SOURCES),
    updatedAt: null,
    lastTestAt: null,
    lastTestStatus: 'never',
    lastError: '',
  };
}

function readJsonFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function normalizeSources(value: unknown): CrsRelaySource[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const enabled = raw
    .map((item) => String(item || '').trim())
    .filter((item): item is CrsRelaySource => ALL_CRS_SOURCES.includes(item as CrsRelaySource));
  return enabled.length ? Array.from(new Set(enabled)) : DEFAULT_CRS_SOURCES;
}

function sourceEnabled(config: CrsRelayConfig, source: CrsRelaySource) {
  return normalizeSources(config.enabledSources).includes(source);
}

function normalizedTime(value?: string | null) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldSkipTokenCandidate(account: TokenAccount) {
  if (account.next_retry_at && normalizedTime(account.next_retry_at) > Date.now()) return true;
  if (account.last_failure_kind === 'provider_blocked' || account.last_failure_kind === 'reauth_required') return true;
  return /refresh_token_reused|unsupported_country_region_territory|workspace_member_credits_depleted|deactivated_workspace/i.test(account.last_error || '');
}

function parseSnapshot(raw?: string | null): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function quotaRemaining(snapshot: any, key: 'five_hour' | 'weekly'): number | null {
  const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
  const card = key === 'five_hour'
    ? cards.find((item: any) => item?.key === 'five_hour' || /5\s*小时|5-hour/i.test(String(item?.label || '')))
    : cards.find((item: any) => item?.key === 'weekly' || /每周|weekly/i.test(String(item?.label || '')));
  const pct = card?.remainingPct;
  return typeof pct === 'number' ? pct : null;
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function asIsoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readTextFile(filePath: string) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function writeTextFileAtomic(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, value, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function splitTomlHeader(content: string) {
  const match = content.match(/^\[/m);
  const index = match?.index ?? -1;
  if (index < 0) return { header: content, rest: '' };
  return {
    header: content.slice(0, index),
    rest: content.slice(index),
  };
}

function setTopLevelTomlKey(content: string, key: string, tomlValue: string) {
  const { header, rest } = splitTomlHeader(content);
  const line = `${key} = ${tomlValue}`;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nextHeader = new RegExp(`^${escaped}\\s*=.*$`, 'm').test(header)
    ? header.replace(new RegExp(`^${escaped}\\s*=.*$`, 'm'), line)
    : `${line}\r\n${header}`;
  return `${nextHeader}${rest}`;
}

function removeTopLevelTomlKey(content: string, key: string) {
  const { header, rest } = splitTomlHeader(content);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `${header.replace(new RegExp(`^${escaped}\\s*=.*\\r?\\n?`, 'm'), '')}${rest}`;
}

function removeTomlKeyLines(content: string, keys: string[]) {
  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return content
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*(?:${escaped})\\s*=`).test(line))
    .join('\r\n');
}

function removeTomlBlock(content: string, blockName: string) {
  const target = `[${blockName}]`;
  const lines = content.split(/\r?\n/);
  const next: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === target) {
      skipping = true;
      continue;
    }
    if (skipping && /^\[.+\]$/.test(trimmed)) {
      skipping = false;
    }
    if (!skipping) next.push(line);
  }
  return next.join('\r\n');
}

function isCrsCodexConfig(content: string) {
  const { header } = splitTomlHeader(content);
  return new RegExp(`^model_provider\\s*=\\s*["']${CRS_PROVIDER_ID}["']`, 'm').test(header)
    || /^\[model_providers\.muse_crs\]/m.test(content);
}

function upsertEnvFileKey(filePath: string, key: string, value: string) {
  const line = `${key}=${value}`;
  const content = readTextFile(filePath);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = new RegExp(`^${escaped}=.*$`, 'm').test(content)
    ? content.replace(new RegExp(`^${escaped}=.*$`, 'm'), line)
    : `${content.replace(/\s*$/, '')}${content.trim() ? '\r\n' : ''}${line}\r\n`;
  writeTextFileAtomic(filePath, next);
}

function repoRootFromDataDir() {
  return path.resolve(DATA_DIR, '..', '..');
}

function tomlString(value: string) {
  return JSON.stringify(String(value ?? ''));
}

export class CrsRelayService {
  private lastRuntimeSyncAt = 0;
  private lastRuntimeSyncKey = '';

  getConfig(): CrsRelayConfig {
    const mtimeMs = fs.existsSync(CONFIG_PATH) ? fs.statSync(CONFIG_PATH).mtimeMs : 0;
    if (configCache && configCache.mtimeMs === mtimeMs) {
      return configCache.value;
    }

    const raw = {
      ...defaultConfig(),
      ...readJsonFile(CONFIG_PATH),
    };
    const value = {
      ...raw,
      enabledSources: normalizeSources(raw.enabledSources),
      lastError: sourceEnabled(raw, 'ai_api') || sourceEnabled(raw, 'token_api') || sourceEnabled(raw, 'manual')
        ? String(raw.lastError || '')
        : '',
      lastTestStatus: sourceEnabled(raw, 'ai_api') || sourceEnabled(raw, 'token_api') || sourceEnabled(raw, 'manual')
        ? raw.lastTestStatus
        : 'never',
    };
    configCache = { mtimeMs, value };
    return value;
  }

  getStatus(origin: string | null = ''): CrsRelayStatus {
    const config = this.getConfig();
    const candidates = this.listCandidates(config);
    const { upstreamApiKey, publicApiKey, ...rest } = config;
    const fallbackOrigin = process.env.SERVER_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const safeOrigin = String(origin || fallbackOrigin).replace(/\/+$/, '');
    return {
      ...rest,
      upstreamApiKeyMasked: maskSecret(upstreamApiKey),
      publicApiKeyMasked: maskSecret(publicApiKey),
      relayBaseUrl: `${safeOrigin}/api/crs/v1`,
      codexConfig: this.getCodexConfigStatus(),
      candidateCount: candidates.length,
      candidates: candidates.map((item) => ({
        source: item.source,
        sourceType: item.sourceType,
        id: item.id,
        name: item.name,
        model: item.model,
        baseUrl: item.baseUrl,
        status: item.status,
      })),
    };
  }

  ensureRuntimeConfig(origin: string | null = ''): CrsRelayStatus {
    const config = this.getConfig();
    const safeOrigin = origin || this.getStatusOrigin();
    const syncKey = [
      config.enabled ? '1' : '0',
      config.name,
      config.publicApiKey,
      config.defaultModel,
      config.timeoutMs,
      normalizeSources(config.enabledSources).join(','),
      safeOrigin,
    ].join('|');
    const recentlySynced = this.lastRuntimeSyncKey === syncKey && Date.now() - this.lastRuntimeSyncAt < 5 * 60 * 1000;
    if (recentlySynced) return this.getStatus(safeOrigin);

    if (config.enabled) {
      this.syncRuntimeConfig(config, safeOrigin, false);
    } else if (config.publicApiKey) {
      this.writeCrsEnv(config, false);
    }
    this.lastRuntimeSyncAt = Date.now();
    this.lastRuntimeSyncKey = syncKey;
    return this.getStatus(safeOrigin);
  }

  updateConfig(input: Partial<CrsRelayConfig>): CrsRelayStatus {
    const current = this.getConfig();
    const next: CrsRelayConfig = {
      ...current,
      enabled: input.enabled === undefined ? current.enabled : input.enabled === true || (input.enabled as any) === 1,
      name: String(input.name ?? current.name ?? 'Muse CRS').trim() || 'Muse CRS',
      upstreamBaseUrl: normalizeBaseUrl(String(input.upstreamBaseUrl ?? current.upstreamBaseUrl)),
      upstreamApiKey: String(input.upstreamApiKey ?? current.upstreamApiKey).trim(),
      publicApiKey: String(input.publicApiKey ?? current.publicApiKey).trim() || current.publicApiKey || defaultConfig().publicApiKey,
      defaultModel: String(input.defaultModel ?? current.defaultModel ?? '').trim(),
      timeoutMs: Math.max(10000, Math.min(600000, Number(input.timeoutMs ?? current.timeoutMs) || 120000)),
      enabledSources: normalizeSources((input as any).enabledSources ?? current.enabledSources),
      updatedAt: new Date().toISOString(),
      lastError: '',
      lastTestStatus: 'never',
    };
    writeJsonFile(CONFIG_PATH, next);
    invalidateCrsRuntimeCaches();
    this.syncRuntimeConfig(next, this.getStatusOrigin(), true);
    return this.getStatus();
  }

  rotatePublicKey() {
    const current = this.getConfig();
    const next = {
      ...current,
      publicApiKey: `cr_${crypto.randomBytes(24).toString('hex')}`,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(CONFIG_PATH, {
      ...next,
    });
    invalidateCrsRuntimeCaches();
    this.syncRuntimeConfig(next, this.getStatusOrigin(), true);
    return this.getStatus();
  }

  validatePublicKey(ctx: Context, config = this.getConfig()) {
    const bearer = ctx.get('Authorization').replace(/^Bearer\s+/i, '').trim();
    const apiKey = ctx.get('x-api-key').trim();
    const token = bearer || apiKey;
    return !!config.publicApiKey && token === config.publicApiKey;
  }

  buildTargetUrl(config: CrsRelayConfig, suffix: string, query = '') {
    const base = normalizeOpenAiBaseUrl(config.upstreamBaseUrl);
    const normalizedSuffix = suffix.replace(/^\/+/, '');
    return `${base}/${normalizedSuffix}${query ? `?${query}` : ''}`;
  }

  async test() {
    const config = this.getConfig();
    const candidates = this.listCandidates(config);
    if (!candidates.length) throw new Error('CRS has no usable candidates');
    const started = Date.now();
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const runtimeCandidate = await this.prepareCandidate(candidate);
        if (!runtimeCandidate.apiKey) throw new Error('missing access token');

        if (runtimeCandidate.authKind === 'openai_codex_oauth') {
          this.updateTestResult(true, '');
          return {
            ok: true,
            status: 200,
            latencyMs: Date.now() - started,
            endpoint: 'openai_codex_oauth',
            preview: `${runtimeCandidate.name} token is ready`,
          };
        }

        const target = joinUrl(runtimeCandidate.baseUrl, 'models');
        const headers = new Headers({
          Authorization: `Bearer ${runtimeCandidate.apiKey}`,
          Accept: 'application/json',
        });
        const res = await this.fetchWithMuseProxy(target, {
          method: 'GET',
          headers,
          timeout: Math.min(config.timeoutMs, 30000),
        });
        const preview = await res.text();
        if (!res.ok) {
          errors.push(`${runtimeCandidate.source}:${runtimeCandidate.id} -> ${res.status}: ${preview.slice(0, 500)}`);
          continue;
        }
        this.updateTestResult(true, '');
        return {
          ok: true,
          status: res.status,
          latencyMs: Date.now() - started,
          endpoint: target,
          preview: preview.slice(0, 1000),
        };
      } catch (error: any) {
        errors.push(`${candidate.source}:${candidate.id} -> ${error?.message || 'request failed'}`);
      }
    }

    const message = errors.join('\n').slice(0, 4000) || 'CRS upstream test failed';
    this.updateTestResult(false, message);
    throw new Error(message);
  }

  async proxy(ctx: Context, suffix: string) {
    const config = this.getConfig();
    if (!config.enabled) {
      ctx.status = 503;
      ctx.body = { error: { message: 'Muse CRS is disabled', type: 'service_unavailable' } };
      return;
    }
    if (!this.validatePublicKey(ctx, config)) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Invalid CRS API key', type: 'authentication_error' } };
      return;
    }
    const normalizedSuffix = suffix.replace(/^\/+/, '');
    if (normalizedSuffix === 'models' && ctx.method.toUpperCase() === 'GET') {
      this.proxyModels(ctx, config);
      return;
    }
    if (normalizedSuffix === 'chat/completions' && ctx.method.toUpperCase() === 'POST') {
      await this.proxyChatCompletions(ctx, config);
      return;
    }
    if (normalizedSuffix === 'responses' && ctx.method.toUpperCase() === 'POST') {
      await this.proxyResponses(ctx, config);
      return;
    }

    if (!config.upstreamBaseUrl || !config.upstreamApiKey) {
      ctx.status = 422;
      ctx.body = { error: { message: 'CRS upstream is not configured', type: 'invalid_request_error' } };
      return;
    }

    const target = this.buildTargetUrl(config, suffix, ctx.querystring);
    const headers = new Headers();
    for (const [key, value] of Object.entries(ctx.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length', 'authorization'].includes(lower)) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    headers.set('authorization', `Bearer ${config.upstreamApiKey}`);

    const rawBody = ['GET', 'HEAD'].includes(ctx.method.toUpperCase())
      ? Buffer.alloc(0)
      : await readIncomingBody(ctx);
    const body = rawBody.length ? rawBody : undefined;

    const upstream = await this.fetchWithMuseProxy(target, {
      method: ctx.method,
      headers,
      body,
      timeout: config.timeoutMs,
    } as any);

    ctx.status = upstream.status;
    upstream.headers.forEach((value: string, key: string) => {
      if (['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      ctx.set(key, value);
    });
    ctx.body = upstream.body;
  }

  private listCandidates(config = this.getConfig()): CrsCandidate[] {
    const cacheKey = crsConfigCacheKey(config);
    const now = Date.now();
    if (candidateCache && candidateCache.configKey === cacheKey && candidateCache.expiresAt > now) {
      return candidateCache.value;
    }

    const candidates: CrsCandidate[] = [];

    if (sourceEnabled(config, 'ai_api')) {
      for (const account of aiAccountModel.list()) {
        if (!account.api_key || !account.base_url || account.status === 'inactive') continue;
        if (!isOpenAiCompatibleAiProvider(account.provider)) continue;
        candidates.push({
          source: 'ai',
          sourceType: 'ai_api',
          id: account.id,
          name: account.name || `${account.provider}-${account.id}`,
          apiKey: account.api_key,
          baseUrl: normalizeOpenAiBaseUrl(account.base_url),
          model: account.model || config.defaultModel || 'gpt-4o-mini',
          status: account.status,
          priority: Number(account.priority_rank || 5) + 20,
          authKind: 'api_key',
        });
      }
    }

    for (const account of tokenAccountModel.list()) {
      if (account.status === 'inactive') continue;
      if (shouldSkipTokenCandidate(account)) continue;
      if (sourceEnabled(config, 'oauth') && account.provider === 'openai_codex' && ['oauth', 'manual'].includes(account.auth_method) && (account.access_token || account.refresh_token)) {
        candidates.push({
          source: 'token',
          sourceType: 'oauth',
          id: account.id,
          name: account.name || account.login_hint || `codex-${account.id}`,
          apiKey: account.access_token,
          baseUrl: normalizeOpenAiBaseUrl(account.api_base_url || 'https://api.openai.com/v1'),
          model: account.api_model || config.defaultModel || 'gpt-5.5',
          status: account.status,
          priority: account.status === 'active' ? 1 : 4,
          authKind: 'openai_codex_oauth',
          accountId: account.external_account_id,
          tokenAccount: account,
        });
        continue;
      }

      if (sourceEnabled(config, 'token_api') && account.api_key && account.api_base_url) {
        candidates.push({
          source: 'token',
          sourceType: 'token_api',
          id: account.id,
          name: account.name || `${account.provider}-${account.id}`,
          apiKey: account.api_key,
          baseUrl: normalizeOpenAiBaseUrl(account.api_base_url),
          model: account.api_model || config.defaultModel || 'gpt-5.5',
          status: account.status,
          priority: account.status === 'active' ? 10 : 16,
          authKind: 'api_key',
        });
      }
    }

    if (sourceEnabled(config, 'manual') && config.upstreamApiKey && config.upstreamBaseUrl) {
      candidates.push({
        source: 'manual',
        sourceType: 'manual',
        id: 'manual',
        name: config.name || 'Manual upstream',
        apiKey: config.upstreamApiKey,
        baseUrl: normalizeOpenAiBaseUrl(config.upstreamBaseUrl),
        model: config.defaultModel || 'gpt-5.5',
        status: 'active',
        priority: 30,
        authKind: 'api_key',
      });
    }

    const value = candidates
      .filter((item) => item.baseUrl && (item.apiKey || item.authKind === 'openai_codex_oauth'))
      .sort((left, right) => {
        if (left.status !== right.status) {
          if (left.status === 'active') return -1;
          if (right.status === 'active') return 1;
        }
        return left.priority - right.priority;
      });
    candidateCache = { configKey: cacheKey, expiresAt: now + CANDIDATE_CACHE_TTL_MS, value };
    return value;
  }

  private async prepareCandidate(candidate: CrsCandidate): Promise<CrsCandidate> {
    if (candidate.authKind !== 'openai_codex_oauth' || !candidate.tokenAccount) return candidate;
    const token = await refreshOpenAITokenAccount(candidate.tokenAccount);
    return {
      ...candidate,
      apiKey: token.accessToken || candidate.apiKey,
      accountId: token.chatgptAccountId || candidate.accountId,
      status: 'active',
    };
  }

  private proxyModels(ctx: Context, config: CrsRelayConfig) {
    const candidates = this.listCandidates(config);
    const models = new Map<string, any>();
    const addModel = (id: string, ownedBy = 'muse-crs') => {
      const normalized = String(id || '').trim();
      if (!normalized || models.has(normalized)) return;
      models.set(normalized, {
        id: normalized,
        object: 'model',
        created: 0,
        owned_by: ownedBy,
      });
    };

    addModel('gpt-5.5');
    addModel(config.defaultModel);
    for (const candidate of candidates) {
      addModel(candidate.model, `${candidate.source}:${candidate.id}`);
    }

    ctx.status = 200;
    ctx.body = {
      object: 'list',
      data: [...models.values()],
      models: [...models.keys()].map((slug, index) => ({
        slug,
        display_name: slug.toUpperCase(),
        description: 'Muse CRS routed model',
        priority: index,
        default_reasoning_level: 'medium',
        supported_reasoning_levels: [
          { effort: 'low', description: 'Fast responses with lighter reasoning' },
          { effort: 'medium', description: 'Balanced reasoning' },
          { effort: 'high', description: 'Deeper reasoning' },
          { effort: 'xhigh', description: 'Extra high reasoning' },
        ],
        shell_type: 'shell_command',
        visibility: 'list',
        supported_in_api: true,
      })),
    };
  }

  private async proxyChatCompletions(ctx: Context, config: CrsRelayConfig) {
    await this.proxyOpenAiJsonEndpoint(ctx, config, 'chat/completions');
  }

  private async proxyResponses(ctx: Context, config: CrsRelayConfig) {
    await this.proxyOpenAiJsonEndpoint(ctx, config, 'responses');
  }

  private async proxyOpenAiJsonEndpoint(ctx: Context, config: CrsRelayConfig, endpointSuffix: 'chat/completions' | 'responses') {
    let originalPayload: Record<string, any>;
    try {
      originalPayload = await this.readJsonPayload(ctx);
    } catch (error: any) {
      ctx.status = 400;
      ctx.body = { error: { message: error?.message || 'Invalid JSON request body', type: 'invalid_request_error' } };
      return;
    }
    const requestedModel = String(originalPayload.model || '').trim();
    const orderedCandidates = this.orderRuntimeCandidates(this.listCandidates(config), requestedModel, endpointSuffix);
    const candidates = orderedCandidates.slice(0, Math.max(1, Math.min(MAX_CANDIDATE_ATTEMPTS_PER_REQUEST, orderedCandidates.length)));
    if (!candidates.length) {
      ctx.status = 422;
      ctx.body = { error: { message: 'CRS has no usable OpenAI-compatible accounts', type: 'invalid_request_error' } };
      return;
    }

    const errors: string[] = [];

    for (const candidate of candidates) {
      const model = originalPayload.model || candidate.model || config.defaultModel || 'gpt-5.5';
      let runtimeCandidate: CrsCandidate;
      try {
        runtimeCandidate = await this.prepareCandidate(candidate);
        if (!runtimeCandidate.apiKey) {
          throw new Error('missing access token');
        }
      } catch (error: any) {
        errors.push(`${candidate.source}:${candidate.id} ${model} -> ${error?.message || 'candidate prepare failed'}`);
        candidateFailureUntil.set(candidateFailureKey(candidate, model, endpointSuffix), Date.now() + CANDIDATE_FAILURE_COOLDOWN_MS);
        continue;
      }

      const endpointAttempts = endpointSuffix === 'responses'
        ? (['responses', 'chat/completions'] as const)
        : (['chat/completions'] as const);

      for (const targetSuffix of endpointAttempts) {
        try {
          const failureKey = candidateFailureKey(candidate, model, targetSuffix);
          const payload = targetSuffix === 'chat/completions' && endpointSuffix === 'responses'
            ? this.buildChatPayloadFromResponsePayload(originalPayload, model)
            : {
                ...originalPayload,
                model,
              };
          const oauthCodex = runtimeCandidate.authKind === 'openai_codex_oauth' && targetSuffix === 'responses';
          const target = oauthCodex ? CHATGPT_CODEX_RESPONSES_URL : joinUrl(runtimeCandidate.baseUrl, targetSuffix);
          const forwardPayload = oauthCodex ? this.buildCodexOAuthPayload(payload, model) : payload;
          const headers = oauthCodex
            ? this.buildCodexOAuthHeaders(ctx, runtimeCandidate, forwardPayload)
            : this.buildForwardHeaders(ctx, runtimeCandidate);
          const upstreamTimeoutMs = (oauthCodex || targetSuffix === 'responses')
            ? Math.max(config.timeoutMs, 120000)
            : Math.min(config.timeoutMs, 20000);
          const upstream = await this.fetchWithMuseProxy(target, {
            method: 'POST',
            headers,
            body: JSON.stringify(forwardPayload),
            timeout: upstreamTimeoutMs,
          });

          if (!upstream.ok) {
            const raw = await upstream.text().catch(() => '');
            const detail = raw.slice(0, 500) || `${upstream.status} ${upstream.statusText}`;
            errors.push(`${candidate.source}:${candidate.id} ${model} -> ${upstream.status}: ${detail}`);
            candidateFailureUntil.set(failureKey, Date.now() + CANDIDATE_FAILURE_COOLDOWN_MS);
            continue;
          }

          if (endpointSuffix === 'responses' && targetSuffix === 'chat/completions') {
            const json = await upstream.json().catch(() => null);
            if (!json) {
              errors.push(`${candidate.source}:${candidate.id} ${model} -> invalid chat completion JSON`);
              candidateFailureUntil.set(failureKey, Date.now() + CANDIDATE_FAILURE_COOLDOWN_MS);
              continue;
            }
            ctx.status = 200;
            ctx.set('content-type', 'application/json');
            ctx.set('x-muse-crs-source', `${runtimeCandidate.source}:${runtimeCandidate.id}`);
            ctx.set('x-muse-crs-model', String(model));
            ctx.set('x-muse-crs-compat', 'responses-via-chat-completions');
            candidateFailureUntil.delete(failureKey);
            ctx.body = this.buildResponsePayloadFromChatCompletion(json, model);
            return;
          }

          ctx.status = upstream.status;
          upstream.headers.forEach((value: string, key: string) => {
            if (['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
            ctx.set(key, value);
          });
          if (runtimeCandidate.authKind === 'openai_codex_oauth' && targetSuffix === 'responses') {
            ctx.set('content-type', 'text/event-stream; charset=utf-8');
            ctx.set('cache-control', 'no-cache');
          }
          ctx.set('x-muse-crs-source', `${runtimeCandidate.source}:${runtimeCandidate.id}`);
          ctx.set('x-muse-crs-model', String(model));
          candidateFailureUntil.delete(failureKey);
          ctx.body = upstream.body;
          return;
        } catch (error: any) {
          errors.push(`${candidate.source}:${candidate.id} ${model} -> ${error?.message || 'request failed'}`);
          candidateFailureUntil.set(candidateFailureKey(candidate, model, targetSuffix), Date.now() + CANDIDATE_FAILURE_COOLDOWN_MS);
        }
      }
    }

    const message = errors.join('\n').slice(0, 4000) || 'All CRS candidates failed';
    this.updateTestResult(false, message);
    ctx.status = 502;
    ctx.body = {
      error: {
        message,
        type: 'upstream_error',
      },
    };
  }

  private orderRuntimeCandidates(candidates: CrsCandidate[], requestedModel = '', endpoint = '') {
    const now = Date.now();
    const available = candidates.filter((candidate) => {
      const key = candidateFailureKey(candidate, requestedModel || candidate.model, endpoint);
      return (candidateFailureUntil.get(key) || 0) <= now;
    });

    const scored = available.map((candidate) => {
      const snapshot = parseSnapshot(candidate.tokenAccount?.snapshot_json);
      const weekly = quotaRemaining(snapshot, 'weekly');
      const fiveHour = quotaRemaining(snapshot, 'five_hour');
      const syncedAt = candidate.tokenAccount?.last_synced_at ? new Date(candidate.tokenAccount.last_synced_at).getTime() : 0;
      const fresh = syncedAt > 0 && (Date.now() - syncedAt) <= 30 * 60 * 1000;
      const weeklyOk = weekly == null || weekly > 0;
      const baseScore = Number.isFinite(candidate.priority) ? (100 - candidate.priority) : 0;
      const score =
        (weeklyOk ? 1000 : -1000)
        + (fresh ? 100 : 0)
        + (typeof fiveHour === 'number' ? fiveHour : 0)
        + baseScore;
      return { candidate, score, weeklyOk };
    });

    const positive = scored.filter((item) => item.weeklyOk).sort((a, b) => b.score - a.score).map((item) => item.candidate);
    const fallback = scored.filter((item) => !item.weeklyOk).sort((a, b) => b.score - a.score).map((item) => item.candidate);
    const merged = [...positive, ...fallback];
    if (merged.length === 0) return candidates;

    // Keep OAuth candidates balanced when multiple have similar score.
    const codexOauth = merged.filter((item) => item.authKind === 'openai_codex_oauth');
    const rest = merged.filter((item) => item.authKind !== 'openai_codex_oauth');
    if (codexOauth.length <= 1) return merged;
    const start = codexOauthCursor % codexOauth.length;
    codexOauthCursor = (codexOauthCursor + 1) % codexOauth.length;
    return [...codexOauth.slice(start), ...codexOauth.slice(0, start), ...rest];
  }

  private buildForwardHeaders(ctx: Context, candidate: CrsCandidate) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(ctx.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length', 'authorization'].includes(lower)) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    headers.set('authorization', `Bearer ${candidate.apiKey}`);
    if (candidate.authKind === 'openai_codex_oauth' && candidate.accountId) {
      headers.set('chatgpt-account-id', candidate.accountId);
    }
    headers.set('content-type', 'application/json');
    return headers;
  }

  private buildCodexOAuthHeaders(ctx: Context, candidate: CrsCandidate, payload: Record<string, any>) {
    const headers = new Headers();
    const allowed = new Set([
      'accept-language',
      'content-type',
      'conversation_id',
      'openai-beta',
      'user-agent',
      'originator',
      'session_id',
      'x-codex-turn-state',
      'x-codex-turn-metadata',
    ]);
    for (const [key, value] of Object.entries(ctx.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (!allowed.has(lower)) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }

    headers.set('authorization', `Bearer ${candidate.apiKey}`);
    headers.set('content-type', 'application/json');
    headers.set('accept', 'text/event-stream');
    headers.set('openai-beta', headers.get('openai-beta') || 'responses=experimental');
    headers.set('originator', headers.get('originator') || 'codex_cli_rs');
    if (!isCodexClientHeader(headers.get('user-agent') || '')) {
      headers.set('user-agent', CODEX_CLI_USER_AGENT);
    }
    if (candidate.accountId) {
      headers.set('chatgpt-account-id', candidate.accountId);
    }

    const sessionSeed = String(
      headers.get('session_id')
      || headers.get('conversation_id')
      || payload.prompt_cache_key
      || crypto.createHash('sha256').update(JSON.stringify(payload).slice(0, 4096)).digest('hex')
    ).trim();
    const isolatedSession = `muse-crs-${candidate.id}-${sessionSeed}`.slice(0, 180);
    headers.set('session_id', isolatedSession);
    headers.set('conversation_id', isolatedSession);
    return headers;
  }

  private buildCodexOAuthPayload(payload: Record<string, any>, model: string) {
    const next: Record<string, any> = { ...payload };
    next.model = normalizeCodexModel(String(payload.model || model || 'gpt-5.4'));
    next.store = false;
    next.stream = true;
    if (!String(next.instructions || '').trim()) {
      next.instructions = 'You are a helpful coding assistant.';
    }
    for (const field of CODEX_UNSUPPORTED_FIELDS) {
      delete next[field];
    }
    if (typeof next.input === 'string') {
      next.input = next.input.trim()
        ? [{ type: 'message', role: 'user', content: next.input }]
        : [];
    } else if (Array.isArray(next.input)) {
      const systemTexts: string[] = [];
      next.input = next.input
        .map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          if (item.role === 'system') {
            const text = this.extractResponseInputText(item.content);
            if (text) systemTexts.push(text);
            return null;
          }
          if (item.role === 'tool') {
            const callId = String(item.call_id || item.tool_call_id || item.id || '').trim();
            return callId
              ? { type: 'function_call_output', call_id: callId.startsWith('fc') ? callId : `fc_${callId.replace(/^call_/, '')}`, output: this.extractResponseInputText(item.content || item.output) }
              : { ...item, role: 'user' };
          }
          if (!item.type && item.role) {
            return { type: 'message', ...item };
          }
          return item;
        })
        .filter(Boolean);
      if (systemTexts.length) {
        next.instructions = `${systemTexts.join('\n\n')}\n\n${next.instructions || ''}`.trim();
      }
    } else if (!Array.isArray(next.input)) {
      next.input = [];
    }
    return next;
  }

  private async readJsonPayload(ctx: Context) {
    if (ctx.request.body && typeof ctx.request.body === 'object' && !Buffer.isBuffer(ctx.request.body)) {
      return ctx.request.body as Record<string, any>;
    }

    const raw = await readIncomingBody(ctx);
    const text = raw.toString('utf8').trim();
    if (!text) return {};
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON request body must be an object');
    }
    return parsed as Record<string, any>;
  }

  private async fetchWithMuseProxy(url: string, options: { method: string; headers: Headers; body?: string | Buffer; timeout: number }) {
    const transport = await proxyService.resolveAgent();
    if (transport.type === 'http' && transport.dispatcher) {
      const { fetch: undiciFetch } = require('undici');
      return undiciFetch(url, {
        method: options.method,
        headers: Object.fromEntries(options.headers.entries()),
        body: options.body,
        dispatcher: transport.dispatcher,
        signal: AbortSignal.timeout(options.timeout),
      });
    }

    return fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      agent: transport.type === 'socks5' && transport.agent ? transport.agent : undefined,
      timeout: options.timeout,
    } as any);
  }

  private buildChatPayloadFromResponsePayload(payload: Record<string, any>, model: string) {
    const messages: Array<{ role: string; content: string }> = [];
    const instructions = String(payload.instructions || payload.system || '').trim();
    if (instructions) messages.push({ role: 'system', content: instructions });

    const input = payload.input;
    if (typeof input === 'string') {
      messages.push({ role: 'user', content: input });
    } else if (Array.isArray(input)) {
      for (const item of input) {
        const role = ['system', 'assistant', 'user', 'developer'].includes(String(item?.role))
          ? String(item.role === 'developer' ? 'system' : item.role)
          : 'user';
        const content = this.extractResponseInputText(item?.content ?? item);
        if (content) messages.push({ role, content });
      }
    }

    if (!messages.length) messages.push({ role: 'user', content: '' });

    const reasoningEffort = this.extractReasoningEffort(payload);

    return {
      model,
      messages,
      temperature: payload.temperature,
      top_p: payload.top_p,
      max_tokens: payload.max_output_tokens ?? payload.max_tokens,
      reasoning_effort: reasoningEffort || undefined,
      stream: false,
    };
  }

  private extractReasoningEffort(payload: Record<string, any>) {
    const nested = String(payload?.reasoning?.effort || '').trim().toLowerCase();
    const direct = String((payload as any)?.reasoning_effort || '').trim().toLowerCase();
    const value = nested || direct;
    if (!value) return '';
    if (['low', 'medium', 'high'].includes(value)) return value;
    if (value === 'minimal') return 'low';
    if (value === 'max' || value === 'xhigh') return 'high';
    return '';
  }

  private extractResponseInputText(value: any): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          if (typeof part?.content === 'string') return part.content;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (typeof value?.text === 'string') return value.text;
    if (typeof value?.content === 'string') return value.content;
    return '';
  }

  private buildResponsePayloadFromChatCompletion(chat: any, model: string) {
    const choice = Array.isArray(chat?.choices) ? chat.choices[0] : null;
    const text = String(choice?.message?.content ?? choice?.text ?? '');
    const id = typeof chat?.id === 'string' ? chat.id : `resp_${crypto.randomBytes(12).toString('hex')}`;
    const createdAt = Number(chat?.created || Math.floor(Date.now() / 1000));

    return {
      id,
      object: 'response',
      created_at: createdAt,
      status: 'completed',
      model: chat?.model || model,
      output: [
        {
          id: `msg_${crypto.randomBytes(12).toString('hex')}`,
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text,
              annotations: [],
            },
          ],
        },
      ],
      output_text: text,
      usage: chat?.usage || null,
    };
  }

  private updateTestResult(success: boolean, error: string) {
    const current = this.getConfig();
    writeJsonFile(CONFIG_PATH, {
      ...current,
      lastTestAt: new Date().toISOString(),
      lastTestStatus: success ? 'success' : 'failed',
      lastError: error,
    });
    invalidateCrsRuntimeCaches();
  }

  private getCodexHome() {
    return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  }

  private getCodexConfigPath() {
    return path.join(this.getCodexHome(), 'config.toml');
  }

  private getCodexStatePath() {
    return path.join(this.getCodexHome(), CRS_CONFIG_STATE_FILE);
  }

  private getStatusOrigin() {
    return process.env.SERVER_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
  }

  private getCodexConfigStatus(): CrsRelayStatus['codexConfig'] {
    const configPath = this.getCodexConfigPath();
    const state = readJsonFile(this.getCodexStatePath());
    if (!fs.existsSync(configPath)) {
      return {
        path: configPath,
        mode: 'missing',
        backupPath: String(state.normalBackupPath || ''),
        lastSyncedAt: String(state.lastSyncedAt || '') || null,
      };
    }
    return {
      path: configPath,
      mode: isCrsCodexConfig(readTextFile(configPath)) ? 'crs' : 'normal',
      backupPath: String(state.normalBackupPath || ''),
      lastSyncedAt: String(state.lastSyncedAt || '') || null,
    };
  }

  private syncRuntimeConfig(config: CrsRelayConfig, origin: string, persistUserEnv = false) {
    this.writeCrsEnv(config, persistUserEnv);
    this.syncCodexConfig(config, origin);
  }

  private writeCrsEnv(config: CrsRelayConfig, persistUserEnv = false) {
    if (!config.publicApiKey) return;
    process.env[CRS_ENV_KEY] = config.publicApiKey;
    try {
      upsertEnvFileKey(path.join(repoRootFromDataDir(), '.env'), CRS_ENV_KEY, config.publicApiKey);
      upsertEnvFileKey(path.join(repoRootFromDataDir(), '.env'), 'CRS_ENABLED_SOURCES', normalizeSources(config.enabledSources).join(','));
    } catch {
      // .env sync is best-effort; config.toml and crs-relay.json remain authoritative for runtime.
    }
    if (!persistUserEnv) return;
    try {
      if (process.platform === 'win32') {
        const { execFileSync } = require('child_process');
        execFileSync('powershell.exe', [
          '-NoProfile',
          '-Command',
          `[Environment]::SetEnvironmentVariable('${CRS_ENV_KEY}', '${config.publicApiKey.replace(/'/g, "''")}', 'User')`,
        ], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
      }
    } catch {
      // User-level env sync is best-effort; the project .env is still updated.
    }
  }

  private syncCodexConfig(config: CrsRelayConfig, origin: string) {
    const configPath = this.getCodexConfigPath();
    const statePath = this.getCodexStatePath();
    const state = readJsonFile(statePath);
    const current = readTextFile(configPath);

    if (config.enabled) {
      let normalBackupPath = String(state.normalBackupPath || '');
      if ((!normalBackupPath || !fs.existsSync(normalBackupPath)) && current && !isCrsCodexConfig(current)) {
        normalBackupPath = `${configPath}.bak-muse-normal-${asIsoStamp()}`;
        fs.copyFileSync(configPath, normalBackupPath);
      }

      const relayBaseUrl = `${String(origin || this.getStatusOrigin()).replace(/\/+$/, '')}/api/crs/v1`;
      const model = config.defaultModel || 'gpt-5.5';
      let next = current;
      next = removeTomlBlock(next, 'model_providers.muse_crs');
      next = removeTomlKeyLines(next, ['base_url', 'env_key', 'wire_api']);
      next = setTopLevelTomlKey(next, 'preferred_auth_method', '"apikey"');
      next = setTopLevelTomlKey(next, 'model_provider', tomlString(CRS_PROVIDER_ID));
      next = setTopLevelTomlKey(next, 'model', tomlString(model));
      next = next.trimEnd();
      next += `\r\n\r\n[model_providers.${CRS_PROVIDER_ID}]\r\n`;
      next += `name = ${tomlString(config.name || 'Muse CRS')}\r\n`;
      next += `base_url = ${tomlString(relayBaseUrl)}\r\n`;
      next += `env_key = ${tomlString(CRS_ENV_KEY)}\r\n`;
      next += 'wire_api = "responses"\r\n';
      writeTextFileAtomic(configPath, `${next.trimEnd()}\r\n`);
      writeJsonFile(statePath, {
        normalBackupPath,
        mode: 'crs',
        lastSyncedAt: new Date().toISOString(),
      });
      return;
    }

    const normalBackupPath = String(state.normalBackupPath || '');
    if (normalBackupPath && fs.existsSync(normalBackupPath)) {
      let restored = readTextFile(normalBackupPath);
      restored = removeTomlBlock(restored, 'model_providers.muse_crs');
      restored = removeTopLevelTomlKey(restored, 'model_provider');
      restored = removeTomlKeyLines(restored, ['base_url', 'env_key', 'wire_api']);
      restored = setTopLevelTomlKey(restored, 'preferred_auth_method', '"chatgpt"');
      writeTextFileAtomic(configPath, `${restored.trimEnd()}\r\n`);
      writeJsonFile(statePath, {
        normalBackupPath,
        mode: 'normal',
        lastSyncedAt: new Date().toISOString(),
      });
      return;
    }

    if (!current) return;
    let next = current;
    next = removeTomlBlock(next, 'model_providers.muse_crs');
    next = removeTopLevelTomlKey(next, 'model_provider');
    next = removeTomlKeyLines(next, ['base_url', 'env_key', 'wire_api']);
    next = setTopLevelTomlKey(next, 'preferred_auth_method', '"chatgpt"');
    writeTextFileAtomic(configPath, `${next.trimEnd()}\r\n`);
    writeJsonFile(statePath, {
      normalBackupPath: '',
      mode: 'normal',
      lastSyncedAt: new Date().toISOString(),
    });
  }
}

export const crsRelayService = new CrsRelayService();
