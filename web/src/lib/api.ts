import type {
  ApiResponse,
  PaginatedResponse,
  Account,
  MailMessage,
  Proxy,
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
  AuthCheckResult,
  AdminOAuthAuthorizeResult,
  GitHubIntegrationData,
  CloudflareIntegrationData,
  NotionIntegrationData,
  NotionInsights,
  NotionPageContent,
  NotionReadableBlock,
  NotionDatabaseContent,
  MiSubBatchUpdateResult,
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
  AiChatResult,
  AiAccountDiagnostics,
  AiConnectionTestResult,
  NewspaperBriefing,
  NewspaperArticleDetail,
  TokenAccountView,
  PersonalOsWorkspace,
  CommandCenterItem,
  PersonalOsRuleView,
  PersonalMemoryView,
} from '../types';

const API_BASE = '/api';
const inflightGetRequests = new Map<string, Promise<any>>();

function qs(params?: Record<string, any>): string {
  if (!params) return '';
  return Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isCacheableGet = method === 'GET';
  const dedupeKey = isCacheableGet ? `${method}:${url}` : null;

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

    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

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
      throw new Error(raw || `${res.status} ${res.statusText}`);
    }

    if (json.code !== 200) throw new Error(json.message || `Request failed: ${json.code}`);
    return json.data;
  };

  const promise = execute();
  if (dedupeKey) {
    inflightGetRequests.set(dedupeKey, promise);
    promise.finally(() => {
      if (inflightGetRequests.get(dedupeKey) === promise) {
        inflightGetRequests.delete(dedupeKey);
      }
    });
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
  status: () => request<ProxyKernelStatus>('/proxy-kernel'),
  download: () => request<ProxyKernelStatus>('/proxy-kernel/download', { method: 'POST', body: JSON.stringify({}) }),
  start: (data: { sourceKey: string; mixedPort?: number; socksPort?: number; httpPort?: number }) =>
    request<ProxyKernelStatus>('/proxy-kernel/start', { method: 'POST', body: JSON.stringify(data) }),
  stop: () => request<ProxyKernelStatus>('/proxy-kernel/stop', { method: 'POST', body: JSON.stringify({}) }),
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
  openaiAuthorize: () =>
    request<{ url: string; state: string }>('/oauth/openai/authorize', { method: 'POST', body: JSON.stringify({}) }),
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
  deleteThread: (threadId: number) =>
    request<{ deleted: boolean }>(`/ai/threads/${threadId}`, { method: 'DELETE' }),
  chat: (accountId: number, data: { thread_id?: number | null; message: string }) =>
    request<AiChatResult>(`/ai/accounts/${accountId}/chat`, { method: 'POST', body: JSON.stringify(data) }),
};

export const newspaperApi = {
  briefing: (params?: { refresh?: boolean; limit?: number }) =>
    request<NewspaperBriefing>(`/newspaper/briefing?${qs(params)}`),
  article: (params: { url: string; source?: string; sourceUrl?: string; publishedAt?: string; title?: string; titleZh?: string; summary?: string; summaryZh?: string }) =>
    request<NewspaperArticleDetail>(`/newspaper/article?${qs(params)}`),
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
};
