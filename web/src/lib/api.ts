import type {
  ApiResponse,
  PaginatedResponse,
  Account,
  MailMessage,
  Proxy,
  CrsRelayStatus,
  CrsRelayTestResult,
  ImportRequest,
  ImportResult,
  ExportRequest,
  DashboardStats,
  ProxyTestResult,
  ProxyKernelStatus,
  FetchMailsResult,
  SendMailRequest,
  Tag,
  ImportPreviewResult,
  GoogleOAuthAuthorizeResult,
  OpenAILaunchAuthorizeResult,
  OpenAIOAuthResult,
  OAuthProviderStatus,
  AuthCheckResult,
  AdminOAuthAuthorizeResult,
  GitHubIntegrationData,
  LinuxDoIntegrationData,
  CloudflareIntegrationData,
  NotionIntegrationData,
  NotionInsights,
  NotionPageContent,
  NotionReadableBlock,
  NotionDatabaseContent,
  MiSubBatchUpdateResult,
  MiSubAiAnalysis,
  MiSubAiInspectionConfig,
  MiSubAiInspectionState,
  MiSubIntegrationData,
  MiSubProfile,
  MiSubSettings,
  MiSubSubscription,
  YmailIntegrationData,
  YmailAddressCredential,
  YmailMailListResult,
  YmailAddressSummary,
  AiAccount,
  AiThread,
  AiMessage,
  AiRuntimeContext,
  AiChatResult,
  AiAccountDiagnostics,
  AiConnectionTestResult,
  NewspaperBriefing,
  NewspaperBriefingAiInsight,
  NewspaperHealth,
  NewspaperArticleDetail,
  NewspaperAiInsight,
  CodexFreeImportResult,
  TokenAccountView,
  PersonalOsWorkspace,
  CommandCenterItem,
  PersonalOsRuleView,
  AgentAutonomyState,
  AgentRuntimeActivityState,
  AgentRuntimeEvent,
  AgentRuntimeMemoryState,
  AgentRuntimeView,
  AgentIncidentReportInput,
  AgentIncidentReportResult,
  AgentProfileMemory,
  AgentSkillJournalView,
  PersonalMemoryView,
  PersonalMemoryAiPlan,
  PersonalMemoryAiSuggestion,
  PersonalMemoryIngestionState,
  PersonalAccountAiPlan,
  PersonalAccountAiSuggestion,
  PersonalProxyAiPlan,
  PersonalProxyAiSuggestion,
  PersonalTokenAiPlan,
  PersonalTokenAiSuggestion,
  CodexDesktopState,
  CodexDesktopSettings,
  CodexDesktopActivationResult,
  CodexDesktopAutoSwitchDeferred,
  CodexUsageHistory,
  OpenTeamsStatus,
} from '../types';
import { reportRuntimeIncident } from './runtimeIncidentReporter';

const API_BASE = '/api';
const inflightGetRequests = new Map<string, Promise<any>>();

function qs(params?: Record<string, any>): string {
  if (!params) return '';
  return Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

function localizeApiError(url: string, status: number, statusText: string, message?: string) {
  const detail = message?.trim();

  if (status === 404 && url.includes('/newspaper/briefing-insight')) {
    return 'AI 总编台接口不存在。当前运行中的后端还是旧版本，请重启 server 后再试。';
  }

  if (status === 404 && url.includes('/newspaper/health')) {
    return '报纸 AI 自检接口不存在。当前运行中的后端还是旧版本，请重启 server 后再试。';
  }

  if (status === 404 && url.includes('/newspaper/insight')) {
    return 'AI 导读接口不存在。当前运行中的后端还是旧版本，请重启 server 后再试。';
  }

  if (status === 404 && url.includes('/newspaper/article')) {
    return '阅读详情接口不存在。当前运行中的后端还是旧版本，请重启 server 后再试。';
  }

  if (detail) {
    return `${status} ${statusText}：${detail}`;
  }

  return `Request failed: ${status} ${statusText}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isCacheableGet = method === 'GET';
  const dedupeKey = isCacheableGet ? `${method}:${url}` : null;
  const shouldReportIncident = !url.includes('/os/agent/incidents');

  if (dedupeKey && inflightGetRequests.has(dedupeKey)) {
    return inflightGetRequests.get(dedupeKey) as Promise<T>;
  }

  const execute = async (): Promise<T> => {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    } catch (error: any) {
      const detail = error?.message || 'fetch failed';
      if (shouldReportIncident) {
        void reportRuntimeIncident({
          title: '前端 API 网络请求失败',
          detail: `${method} ${url}\n\n${detail}`,
          severity: 'watch',
          source: `api:${method} ${url}`,
          kind: 'api_error',
        });
      }
      throw new Error(`网络请求失败：${detail}。请确认前端代理与后端服务都已重启，并查看 AI 账号诊断里的最近错误。`);
    }

    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new Event('auth-required'));
      throw new Error('Unauthorized');
    }

    const raw = await res.text();
    let json: ApiResponse<T>;

    try {
      json = JSON.parse(raw) as ApiResponse<T>;
    } catch {
      if (res.status === 500 && /internal server error/i.test(raw || res.statusText)) {
        throw new Error('后端服务未启动或 Vite 代理目标不可达。请先启动 server，或检查 VITE_DEV_PROXY_TARGET 是否指向正确端口。');
      }
      throw new Error(raw || `${res.status} ${res.statusText}`);
    }

    if (json.code !== 200) {
      if (shouldReportIncident) {
        void reportRuntimeIncident({
          title: '前端 API 业务请求失败',
          detail: `${method} ${url}\n\n${json.message || `${res.status} ${res.statusText}`}`,
          severity: res.status >= 500 ? 'critical' : 'watch',
          source: `api:${method} ${url}`,
          kind: 'api_error',
          metadata: {
            status: res.status,
            statusText: res.statusText,
            code: json.code,
          },
        });
      }
      if (res.status >= 400) {
        throw new Error(localizeApiError(url, res.status, res.statusText, json.message));
      }
      throw new Error(json.message ? `code ${json.code}：${json.message}` : `Request failed: code ${json.code}`);
    }
    return json.data;
  };

  const promise = execute();
  if (dedupeKey) {
    const cleanup = () => {
      if (inflightGetRequests.get(dedupeKey) === promise) {
        inflightGetRequests.delete(dedupeKey);
      }
    };
    inflightGetRequests.set(dedupeKey, promise);
    promise.then(cleanup, cleanup);
  }

  return promise;
}

export const accountApi = {
  list: (params?: { page?: number; pageSize?: number; search?: string }) =>
    request<PaginatedResponse<Account>>(`/accounts?${qs(params)}`),
  create: (data: Partial<Account>) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Account>) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ deleted: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  batchDelete: (ids: number[]) =>
    request<{ deleted: number }>('/accounts/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  import: (data: ImportRequest) =>
    request<ImportResult>('/accounts/import', { method: 'POST', body: JSON.stringify(data) }),
  importPreview: (data: ImportRequest) =>
    request<ImportPreviewResult>('/accounts/import-preview', { method: 'POST', body: JSON.stringify(data) }),
  importConfirm: (data: ImportRequest & { mode: 'skip' | 'overwrite' }) =>
    request<ImportResult>('/accounts/import-confirm', { method: 'POST', body: JSON.stringify(data) }),
  export: (data: ExportRequest) =>
    request<{ content: string; count: number }>('/accounts/export', { method: 'POST', body: JSON.stringify(data) }),
};

export const mailApi = {
  fetch: (data: { account_id: number; mailbox: string; proxy_id?: number }) =>
    request<FetchMailsResult>('/mails/fetch', { method: 'POST', body: JSON.stringify(data) }),
  fetchNew: (data: { account_id: number; mailbox: string; proxy_id?: number }) =>
    request<MailMessage | null>('/mails/fetch-new', { method: 'POST', body: JSON.stringify(data) }),
  unified: (params?: { page?: number; pageSize?: number }) =>
    request<PaginatedResponse<MailMessage>>(`/mails/unified?${qs(params)}`),
  recent: (params?: { limit?: number }) =>
    request<MailMessage[]>(`/mails/recent?${qs(params)}`),
  refreshRecent: (data?: { limit?: number; proxy_id?: number }) =>
    request<MailMessage[]>('/mails/recent/refresh', { method: 'POST', body: JSON.stringify(data || {}) }),
  send: (data: SendMailRequest & { proxy_id?: number }) =>
    request<{ message: string }>('/mails/send', { method: 'POST', body: JSON.stringify(data) }),
  search: (params: { account_id: number; mailbox: string; query: string; page?: number; pageSize?: number }) =>
    request<PaginatedResponse<MailMessage>>(`/mails/search?${qs(params)}`),
  cached: (params: { account_id: number; mailbox: string; page?: number; pageSize?: number }) =>
    request<PaginatedResponse<MailMessage>>(`/mails/cached?${qs(params)}`),
  clear: (data: { account_id: number; mailbox: string; proxy_id?: number }) =>
    request<{ message: string }>('/mails/clear', { method: 'DELETE', body: JSON.stringify(data) }),
};

export const proxyApi = {
  list: () => request<Proxy[]>('/proxies'),
  create: (data: Partial<Proxy>) =>
    request<Proxy>('/proxies', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Proxy>) =>
    request<Proxy>(`/proxies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ deleted: boolean }>(`/proxies/${id}`, { method: 'DELETE' }),
  test: (id: number) =>
    request<ProxyTestResult>(`/proxies/${id}/test`, { method: 'POST' }),
  setDefault: (id: number) =>
    request<Proxy>(`/proxies/${id}/default`, { method: 'PUT' }),
  setEnabled: (id: number, enabled: boolean) =>
    request<Proxy>(`/proxies/${id}/enabled`, { method: 'PUT', body: JSON.stringify({ enabled }) }),
};

export const proxyKernelApi = {
  status: () => request<ProxyKernelStatus>('/proxy-kernel/status'),
  download: () => request<ProxyKernelStatus>('/proxy-kernel/download', { method: 'POST', body: JSON.stringify({}) }),
  start: (data: { sourceKey: string; sourceUrl?: string; sourceLabel?: string; mixedPort?: number; socksPort?: number; httpPort?: number }) =>
    request<ProxyKernelStatus>('/proxy-kernel/start', { method: 'POST', body: JSON.stringify(data) }),
  stop: () => request<ProxyKernelStatus>('/proxy-kernel/stop', { method: 'POST', body: JSON.stringify({}) }),
  select: (data: { groupName: string; target: string }) =>
    request<ProxyKernelStatus>('/proxy-kernel/select', { method: 'POST', body: JSON.stringify(data) }),
  testOpenAi: (data: { groupName: string; target: string }) =>
    request<{ ok: boolean; groupName: string; target: string; original: string; message: string }>('/proxy-kernel/test-openai', { method: 'POST', body: JSON.stringify(data) }),
};

export const crsApi = {
  status: () => request<CrsRelayStatus>('/crs/status'),
  update: (data: {
    enabled?: boolean;
    name?: string;
    upstreamBaseUrl?: string;
    upstreamApiKey?: string;
    publicApiKey?: string;
    defaultModel?: string;
    timeoutMs?: number;
    enabledSources?: Array<'oauth' | 'token_api' | 'ai_api' | 'manual'>;
  }) => request<CrsRelayStatus>('/crs/config', { method: 'PUT', body: JSON.stringify(data) }),
  rotateKey: () => request<CrsRelayStatus>('/crs/rotate-key', { method: 'POST', body: JSON.stringify({}) }),
  test: () => request<CrsRelayTestResult>('/crs/test', { method: 'POST', body: JSON.stringify({}) }),
};

export const dashboardApi = {
  stats: () => request<DashboardStats>('/dashboard/stats'),
};

export const authApi = {
  check: () => request<AuthCheckResult>('/auth/check'),
  login: (password: string) =>
    request<{ token: string; required: boolean }>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  googleAuthorize: () =>
    request<AdminOAuthAuthorizeResult>('/auth/google/authorize', { method: 'POST', body: JSON.stringify({}) }),
};

export const tagApi = {
  list: () => request<Tag[]>('/tags'),
  create: (data: { name: string; color?: string }) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; color?: string }) =>
    request<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ deleted: boolean }>(`/tags/${id}`, { method: 'DELETE' }),
  setAccountTags: (accountId: number, tagIds: number[]) =>
    request<{ account_id: number; tag_ids: number[] }>(
      `/accounts/${accountId}/tags`,
      { method: 'POST', body: JSON.stringify({ tag_ids: tagIds }) }
    ),
};

export const oauthApi = {
  status: () =>
    request<OAuthProviderStatus>('/oauth/status'),
  linuxDoAuthorize: () =>
    request<{ url: string; state: string }>('/oauth/linuxdo/authorize', { method: 'POST', body: JSON.stringify({}) }),
  openaiAuthorize: () =>
    request<{ url: string; state: string }>('/oauth/openai/authorize', { method: 'POST', body: JSON.stringify({}) }),
  openaiLaunch: () =>
    request<OpenAILaunchAuthorizeResult>('/oauth/openai/launch', { method: 'POST', body: JSON.stringify({}) }),
  openaiResetSession: () =>
    request<{ reset: boolean; profileDir: string }>('/oauth/openai/reset-session', { method: 'POST', body: JSON.stringify({}) }),
  openaiResult: (state: string) =>
    request<OpenAIOAuthResult>(`/oauth/openai/result?${qs({ state })}`),
  googleAuthorize: (data: { client_id?: string; client_secret?: string; login_hint?: string; scope?: string; prompt?: string }) =>
    request<GoogleOAuthAuthorizeResult>('/oauth/google/authorize', { method: 'POST', body: JSON.stringify(data) }),
};

export const integrationApi = {
  getGitHub: () => request<GitHubIntegrationData>('/integrations/github'),
  connectGitHub: (token: string) =>
    request<GitHubIntegrationData>('/integrations/github/connect', { method: 'POST', body: JSON.stringify({ token }) }),
  syncGitHub: () =>
    request<GitHubIntegrationData>('/integrations/github/sync', { method: 'POST' }),
  disconnectGitHub: () =>
    request<{ disconnected: boolean }>('/integrations/github', { method: 'DELETE' }),

  getLinuxDo: () => request<LinuxDoIntegrationData>('/integrations/linuxdo'),
  syncLinuxDo: () =>
    request<LinuxDoIntegrationData>('/integrations/linuxdo/sync', { method: 'POST' }),
  disconnectLinuxDo: () =>
    request<{ disconnected: boolean }>('/integrations/linuxdo', { method: 'DELETE' }),

  getCloudflare: () => request<CloudflareIntegrationData>('/integrations/cloudflare'),
  connectCloudflare: (token: string) =>
    request<CloudflareIntegrationData>('/integrations/cloudflare/connect', { method: 'POST', body: JSON.stringify({ token }) }),
  syncCloudflare: () =>
    request<CloudflareIntegrationData>('/integrations/cloudflare/sync', { method: 'POST' }),
  disconnectCloudflare: () =>
    request<{ disconnected: boolean }>('/integrations/cloudflare', { method: 'DELETE' }),

  getNotion: () => request<NotionIntegrationData>('/integrations/notion'),
  connectNotion: (token: string) =>
    request<NotionIntegrationData>('/integrations/notion/connect', { method: 'POST', body: JSON.stringify({ token }) }),
  syncNotion: () =>
    request<NotionIntegrationData>('/integrations/notion/sync', { method: 'POST' }),
  getNotionInsights: () =>
    request<NotionInsights>('/integrations/notion/insights'),
  getNotionPageContent: (pageId: string) =>
    request<NotionPageContent>(`/integrations/notion/pages/${encodeURIComponent(pageId)}/content`),
  getNotionDatabaseContent: (databaseId: string) =>
    request<NotionDatabaseContent>(`/integrations/notion/databases/${encodeURIComponent(databaseId)}/content`),
  updateNotionBlock: (blockId: string, data: { type: string; text: string }) =>
    request<NotionReadableBlock>(`/integrations/notion/blocks/${encodeURIComponent(blockId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  disconnectNotion: () =>
    request<{ disconnected: boolean }>('/integrations/notion', { method: 'DELETE' }),

  getMiSub: () => request<MiSubIntegrationData>('/integrations/misub'),
  connectMiSub: (data: { baseUrl: string; password: string }) =>
    request<MiSubIntegrationData>('/integrations/misub/connect', { method: 'POST', body: JSON.stringify(data) }),
  syncMiSub: () =>
    request<MiSubIntegrationData>('/integrations/misub/sync', { method: 'POST' }),
  saveMiSubData: (data: { misubs: MiSubSubscription[]; profiles: MiSubProfile[] }) =>
    request<MiSubIntegrationData>('/integrations/misub/data', { method: 'POST', body: JSON.stringify(data) }),
  saveMiSubSettings: (settings: MiSubSettings) =>
    request<MiSubIntegrationData>('/integrations/misub/settings', { method: 'POST', body: JSON.stringify(settings) }),
  updateMiSubNodeCount: (data: { url: string; fetchProxy?: string; plusAsSpace?: boolean }) =>
    request<{ count: number; userInfo: MiSubSubscription['userInfo'] }>('/integrations/misub/node-count', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  batchUpdateMiSubNodes: (subscriptionIds: string[]) =>
    request<MiSubBatchUpdateResult[]>('/integrations/misub/batch-update-nodes', {
      method: 'POST',
      body: JSON.stringify({ subscriptionIds }),
    }),
  analyzeMiSubWithAi: (data: { accountId: number; goal?: string }) =>
    request<MiSubAiAnalysis>('/integrations/misub/ai/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMiSubAiInspection: () =>
    request<MiSubAiInspectionState>('/integrations/misub/ai/inspection'),
  updateMiSubAiInspection: (data: Partial<MiSubAiInspectionConfig>) =>
    request<MiSubAiInspectionState>('/integrations/misub/ai/inspection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  runMiSubAiInspection: () =>
    request<MiSubAiInspectionState>('/integrations/misub/ai/inspection/run', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  disconnectMiSub: () =>
    request<{ disconnected: boolean }>('/integrations/misub', { method: 'DELETE' }),

  getYmail: () => request<YmailIntegrationData>('/integrations/ymail'),
  connectYmail: (password: string) =>
    request<YmailIntegrationData>('/integrations/ymail/connect', { method: 'POST', body: JSON.stringify({ password }) }),
  syncYmail: () =>
    request<YmailIntegrationData>('/integrations/ymail/sync', { method: 'POST' }),
  listYmailAddresses: (params?: { limit?: number; offset?: number; query?: string; sort_by?: string; sort_order?: string }) =>
    request<{ results: YmailAddressSummary[]; count: number }>(`/integrations/ymail/addresses?${qs(params)}`),
  createYmailAddress: (data: { name: string; domain: string; enablePrefix?: boolean; enableRandomSubdomain?: boolean }) =>
    request<YmailAddressCredential>('/integrations/ymail/addresses', { method: 'POST', body: JSON.stringify(data) }),
  getYmailAddressCredential: (id: number) =>
    request<YmailAddressCredential>(`/integrations/ymail/addresses/${id}/credential`),
  getYmailAddressMails: (id: number, params?: { limit?: number; offset?: number }) =>
    request<YmailMailListResult>(`/integrations/ymail/addresses/${id}/mails?${qs(params)}`),
  deleteYmailMail: (id: number, mailId: number) =>
    request<{ deleted: boolean }>(`/integrations/ymail/addresses/${id}/mails/${mailId}`, { method: 'DELETE' }),
  clearYmailInbox: (id: number) =>
    request<{ cleared: boolean }>(`/integrations/ymail/addresses/${id}/inbox`, { method: 'DELETE' }),
  clearYmailSent: (id: number) =>
    request<{ cleared: boolean }>(`/integrations/ymail/addresses/${id}/sent`, { method: 'DELETE' }),
  resetYmailAddressPassword: (id: number, password: string) =>
    request<{ updated: boolean }>(`/integrations/ymail/addresses/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteYmailAddress: (id: number) =>
    request<{ deleted: boolean }>(`/integrations/ymail/addresses/${id}`, { method: 'DELETE' }),
  disconnectYmail: () =>
    request<{ disconnected: boolean }>('/integrations/ymail', { method: 'DELETE' }),
};

export const aiApi = {
  listAccounts: () => request<AiAccount[]>('/ai/accounts'),
  getAccount: (id: number) =>
    request<AiAccountDiagnostics>(`/ai/accounts/${id}`),
  createAccount: (data: Partial<AiAccount>) =>
    request<AiAccount>('/ai/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: Partial<AiAccount>) =>
    request<AiAccount>(`/ai/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) =>
    request<{ deleted: boolean }>(`/ai/accounts/${id}`, { method: 'DELETE' }),
  testAccount: (id: number) =>
    request<AiConnectionTestResult>(`/ai/accounts/${id}/test`, { method: 'POST', body: JSON.stringify({}) }),
  listThreads: (accountId: number) =>
    request<AiThread[]>(`/ai/threads?${qs({ account_id: accountId })}`),
  getMessages: (threadId: number) =>
    request<AiMessage[]>(`/ai/threads/${threadId}/messages`),
  updateThread: (threadId: number, data: { title: string }) =>
    request<AiThread>(`/ai/threads/${threadId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteThread: (threadId: number) =>
    request<{ deleted: boolean }>(`/ai/threads/${threadId}`, { method: 'DELETE' }),
  clearThreads: (accountId: number) =>
    request<{ deleted: number }>(`/ai/accounts/${accountId}/threads`, { method: 'DELETE' }),
  chat: (accountId: number, data: { thread_id?: number | null; message: string; runtime_context?: AiRuntimeContext }) =>
    request<AiChatResult>(`/ai/accounts/${accountId}/chat`, { method: 'POST', body: JSON.stringify(data) }),
};

export const newspaperApi = {
  health: () =>
    request<NewspaperHealth>('/newspaper/health'),
  briefing: (params?: { refresh?: boolean; limit?: number }) =>
    request<NewspaperBriefing>(`/newspaper/briefing?${qs(params)}`),
  article: (params: { url: string; source?: string; sourceUrl?: string; commentUrl?: string; publishedAt?: string; title?: string; titleZh?: string; summary?: string; summaryZh?: string }) =>
    request<NewspaperArticleDetail>(`/newspaper/article?${qs(params)}`),
  insight: (data: { url: string; source?: string; sourceUrl?: string; commentUrl?: string; publishedAt?: string; title?: string; titleZh?: string; summary?: string; summaryZh?: string; accountId?: number | null }) =>
    request<NewspaperAiInsight>('/newspaper/insight', { method: 'POST', body: JSON.stringify(data) }),
  briefingInsight: (data?: { accountId?: number | null; limit?: number; refresh?: boolean; query?: string }) =>
    request<NewspaperBriefingAiInsight>('/newspaper/briefing-insight', { method: 'POST', body: JSON.stringify(data || {}) }),
};

export const tokenApi = {
  listAccounts: () => request<TokenAccountView[]>('/tokens/accounts'),
  createAccount: (data: Partial<TokenAccountView>) =>
    request<TokenAccountView>('/tokens/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: Partial<TokenAccountView>) =>
    request<TokenAccountView>(`/tokens/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) =>
    request<{ deleted: boolean }>(`/tokens/accounts/${id}`, { method: 'DELETE' }),
  syncAccount: (id: number) =>
    request<TokenAccountView>(`/tokens/accounts/${id}/sync`, { method: 'POST' }),
  syncAll: () =>
    request<TokenAccountView[]>('/tokens/sync', { method: 'POST' }),
  autoSync: () =>
    request<{
      running: boolean;
      synced: number;
      failed: number;
      skipped: number;
      recoveryTriggered: boolean;
      recoveryMessage?: string;
      codexAutoSwitch?: CodexDesktopActivationResult | CodexDesktopAutoSwitchDeferred | { error: string } | null;
      delayedAccounts: number[];
      pausedAccounts: number[];
      accounts: TokenAccountView[];
    }>('/tokens/auto-sync', { method: 'POST' }),
  importCodexFree: (data?: { directory?: string; mode?: 'skip' | 'upsert' }) =>
    request<CodexFreeImportResult>('/tokens/codex/free/import', { method: 'POST', body: JSON.stringify(data || {}) }),
  };

export const codexApi = {
  status: () => request<CodexDesktopState>('/codex/desktop/status'),
  activate: (data: { tokenAccountId: number; launch?: boolean }) =>
    request<CodexDesktopActivationResult>('/codex/desktop/activate', { method: 'POST', body: JSON.stringify(data) }),
  rotate: (data: { strategy: 'next' | 'best'; launch?: boolean }) =>
    request<CodexDesktopActivationResult>('/codex/desktop/rotate', { method: 'POST', body: JSON.stringify(data) }),
  autoSwitchCheck: () =>
    request<CodexDesktopState & { autoSwitch: CodexDesktopActivationResult | CodexDesktopAutoSwitchDeferred | null }>('/codex/desktop/auto-switch/check', { method: 'POST' }),
  restore: (activationEventId: number) =>
    request<{ status: CodexDesktopState['status']; event: CodexDesktopActivationResult['event'] }>('/codex/desktop/restore', {
      method: 'POST',
      body: JSON.stringify({ activationEventId }),
    }),
  getSettings: () => request<CodexDesktopSettings>('/codex/settings'),
  updateSettings: (data: Partial<CodexDesktopSettings>) =>
    request<CodexDesktopSettings>('/codex/settings', { method: 'PUT', body: JSON.stringify(data) }),
  history: (rangeDays = 30) => request<CodexUsageHistory>(`/codex/usage/history?${qs({ rangeDays })}`),
};

export const openTeamsApi = {
  status: () => request<OpenTeamsStatus>('/openteams/status'),
  start: () => request<OpenTeamsStatus>('/openteams/start', { method: 'POST', body: JSON.stringify({}) }),
  stop: () => request<OpenTeamsStatus>('/openteams/stop', { method: 'POST', body: JSON.stringify({}) }),
};

export const osApi = {
  workspace: () => request<PersonalOsWorkspace>('/os/workspace'),
  search: (q: string) => request<CommandCenterItem[]>(`/os/search?${qs({ q })}`),
  listRules: () => request<PersonalOsRuleView[]>('/os/rules'),
  createRule: (data: Partial<PersonalOsRuleView>) =>
    request<PersonalOsRuleView>('/os/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id: number, data: Partial<PersonalOsRuleView>) =>
    request<PersonalOsRuleView>(`/os/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (id: number) =>
    request<{ deleted: boolean }>(`/os/rules/${id}`, { method: 'DELETE' }),
  setActionState: (data: { actionId: string; status: 'active' | 'done' | 'muted'; note?: string }) =>
    request<{ action_id: string; status: 'active' | 'done' | 'muted'; note?: string }>('/os/actions/state', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listMemory: () => request<PersonalMemoryView[]>('/os/memory'),
  createMemory: (data: Partial<PersonalMemoryView>) =>
    request<PersonalMemoryView>('/os/memory', { method: 'POST', body: JSON.stringify(data) }),
  updateMemory: (id: number, data: Partial<PersonalMemoryView>) =>
    request<PersonalMemoryView>(`/os/memory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMemory: (id: number) =>
    request<{ deleted: boolean }>(`/os/memory/${id}`, { method: 'DELETE' }),
  aiManageMemory: (data?: { accountId?: number | null; focus?: string }) =>
    request<PersonalMemoryAiPlan>('/os/memory/ai-manage', { method: 'POST', body: JSON.stringify(data || {}) }),
  applyAiMemoryPlan: (data: { suggestions: PersonalMemoryAiSuggestion[] }) =>
    request<{ applied: number; memory: PersonalMemoryView[] }>('/os/memory/ai-apply', { method: 'POST', body: JSON.stringify(data) }),
  aiManageAccounts: (data?: { accountId?: number | null; focus?: string }) =>
    request<PersonalAccountAiPlan>('/os/accounts/ai-manage', { method: 'POST', body: JSON.stringify(data || {}) }),
  applyAiAccountPlan: (data: { suggestions: PersonalAccountAiSuggestion[] }) =>
    request<{ applied: number; accounts: Account[] }>('/os/accounts/ai-apply', { method: 'POST', body: JSON.stringify(data) }),
  aiManageProxies: (data?: { accountId?: number | null; focus?: string }) =>
    request<PersonalProxyAiPlan>('/os/proxies/ai-manage', { method: 'POST', body: JSON.stringify(data || {}) }),
  applyAiProxyPlan: (data: { suggestions: PersonalProxyAiSuggestion[] }) =>
    request<{ applied: number; proxies: Proxy[] }>('/os/proxies/ai-apply', { method: 'POST', body: JSON.stringify(data) }),
  aiManageTokens: (data?: { accountId?: number | null; focus?: string }) =>
    request<PersonalTokenAiPlan>('/os/tokens/ai-manage', { method: 'POST', body: JSON.stringify(data || {}) }),
  applyAiTokenPlan: (data: { suggestions: PersonalTokenAiSuggestion[] }) =>
    request<{ applied: number; accounts: TokenAccountView[] }>('/os/tokens/ai-apply', { method: 'POST', body: JSON.stringify(data) }),
  getMemoryIngestion: () => request<PersonalMemoryIngestionState>('/os/memory/ingestion'),
  updateMemoryIngestion: (data: { enabled?: boolean; accountId?: number | null; intervalHours?: number; focus?: string }) =>
    request<PersonalMemoryIngestionState>('/os/memory/ingestion', { method: 'POST', body: JSON.stringify(data) }),
  runMemoryIngestion: () =>
    request<PersonalMemoryIngestionState>('/os/memory/ingestion/run', { method: 'POST', body: JSON.stringify({}) }),
  getAgentAutonomyState: () => request<AgentAutonomyState>('/os/agent/autonomy'),
  updateAgentAutonomyConfig: (data: {
    enabled?: boolean;
    intervalHours?: number;
    memoryIngestionEnabled?: boolean;
    ruleAutomationEnabled?: boolean;
    profileLearningEnabled?: boolean;
    skillLearningEnabled?: boolean;
    backupEnabled?: boolean;
    backupDir?: string;
    backupRetentionCount?: number;
  }) => request<AgentAutonomyState>('/os/agent/autonomy', { method: 'POST', body: JSON.stringify(data) }),
  runAgentAutonomyNow: () =>
    request<AgentAutonomyState>('/os/agent/autonomy/run', { method: 'POST', body: JSON.stringify({}) }),
  getAgentRuntime: () => request<AgentRuntimeView>('/os/agent/runtime'),
  getAgentMemoryState: () => request<AgentRuntimeMemoryState>('/os/agent/memory'),
  getAgentActivityState: () => request<AgentRuntimeActivityState>('/os/agent/activity'),
  listAgentEvents: (limit = 80) => request<AgentRuntimeEvent[]>(`/os/agent/events?${qs({ limit })}`),
  createAgentEvent: (data: {
    layer?: AgentRuntimeEvent['layer'];
    scope?: AgentRuntimeEvent['scope'];
    source: string;
    eventType: string;
    title: string;
    detail?: string;
    content?: Record<string, any>;
    confidence?: number;
    shared?: boolean;
    originRefs?: string[];
  }) => request<AgentRuntimeEvent>('/os/agent/events', { method: 'POST', body: JSON.stringify(data) }),
  updateAgentExecutionMode: (mode: 'observe_only' | 'guided_execute' | 'full_execute') =>
    request<AgentRuntimeView>('/os/agent/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
  compactAgentMemory: () =>
    request<AgentRuntimeMemoryState>('/os/agent/memory/compact', { method: 'POST', body: JSON.stringify({}) }),
  reportAgentIncident: (data: AgentIncidentReportInput) =>
    request<AgentIncidentReportResult>('/os/agent/incidents', { method: 'POST', body: JSON.stringify(data) }),
  listAgentProfile: () => request<AgentProfileMemory[]>('/os/agent/profile'),
  upsertAgentProfile: (data: {
    key: string;
    value: string;
    category?: AgentProfileMemory['category'];
    confidence?: number;
    source?: string;
  }) => request<AgentProfileMemory>('/os/agent/profile', { method: 'POST', body: JSON.stringify(data) }),
  listAgentSkills: (limit = 20) => request<AgentSkillJournalView[]>(`/os/agent/skills?${qs({ limit })}`),
};
