export type IntegrationProvider = 'github' | 'cloudflare' | 'notion' | 'misub' | 'ymail' | 'linuxdo';

export type AccountProvider = 'microsoft' | 'gmail' | 'qq' | 'custom';
export type MailboxType = 'INBOX' | 'Junk' | 'Sent';
export type AiProvider =
  | 'chatgpt'
  | 'codex'
  | 'claude'
  | 'claude_code'
  | 'anthropic_compatible'
  | 'gemini'
  | 'deepseek'
  | 'mimo'
  | 'openai_compatible';
export type TokenProvider = 'openai_codex' | 'claude' | 'claude_code';
export type TokenSessionFormat = 'cookie_header' | 'cookie_json' | 'netscape';
export type TokenAuthMethod = 'session' | 'oauth' | 'manual' | 'api';
export type ProxyKernelHealth = 'healthy' | 'recovering' | 'degraded' | 'failed';
export type TokenSyncFailureKind =
  | 'none'
  | 'reauth_required'
  | 'proxy_recoverable'
  | 'network_transient'
  | 'provider_blocked'
  | 'unknown';

// ============ 账户 ============
export interface Account {
  id: number;
  provider: AccountProvider;
  mode?: 'temporary' | 'long_term';
  email: string;
  password: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  custom_imap_host?: string;
  custom_imap_port?: number;
  custom_smtp_host?: string;
  custom_smtp_port?: number;
  custom_smtp_secure?: number;
  custom_domain?: string;
  remark: string;
  status: 'active' | 'inactive' | 'error';
  last_synced_at: string | null;
  token_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

// ============ 标签 ============
export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

// ============ 邮件 ============
export interface MailMessage {
  id: number;
  account_id: number;
  mailbox: MailboxType;
  mail_id: string;
  sender: string;
  sender_name: string;
  recipients?: string;
  subject: string;
  text_content: string;
  html_content: string;
  mail_date: string;
  is_read: boolean;
  cached_at: string;
  account_email?: string;
  attachments?: MailAttachment[];
  source?: 'mail' | 'temporary';
  mailboxType?: 'mail' | 'temporary';
}

export interface MailAttachment {
  filename: string;
  contentType?: string;
  size?: number;
  contentBase64?: string;
}

// ============ 代理 ============
export interface Proxy {
  id: number;
  name: string;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username: string;
  password: string;
  is_default: boolean;
  is_enabled: boolean;
  last_tested_at: string | null;
  last_test_ip: string;
  status: 'untested' | 'active' | 'failed';
  created_at: string;
}

// ============ API ============
export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  ok: boolean;
  error?: ApiErrorPayload | null;
  meta?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportRequest {
  content: string;
  separator: string;
  format: string[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ImportPreviewResult {
  newItems: { line: number; email: string; [key: string]: any }[];
  duplicates: { line: number; email: string; [key: string]: any }[];
  errors: string[];
}

export interface ExportRequest {
  ids?: number[];
  separator?: string;
  format?: string[];
}

export interface DashboardStats {
  totalAccounts: number;
  activeAccounts: number;
  totalInboxMails: number;
  totalJunkMails: number;
  totalProxies: number;
  activeProxies: number;
  providerStats: { provider: string; count: number }[];
  statusStats: { status: string; count: number }[];
  proxyStatusStats: { status: string; count: number }[];
  recentMails: MailMessage[];
  accountStats: {
    account_id: number;
    email: string;
    inbox_count: number;
    junk_count: number;
  }[];
  topMailAccounts: {
    account_id: number;
    email: string;
    inbox_count: number;
    junk_count: number;
    total_count: number;
  }[];
  expiringTokens: number;
  errorAccounts: number;
  unusedAccounts: number;
}

export interface NewspaperArticle {
  title: string;
  titleZh: string;
  url: string;
  summary: string;
  summaryZh: string;
  aiCardStatus?: 'ready' | 'pending' | 'failed' | 'retrying';
  aiCardError?: string;
  readerStateKey?: string;
  detailStatus?: 'partial' | 'ready' | 'recovering' | 'failed';
  source: string;
  sourceUrl?: string;
  commentUrl?: string;
  domain: string;
  publishedAt: string | null;
  score: number;
  rank: number;
  freshnessLabel: string;
  freshnessLabelEn: string;
  matchedKeywords: string[];
}

export interface NewspaperTopic {
  zh: string;
  en: string;
}

export interface NewspaperSourceStatus {
  name: string;
  url: string;
  status: 'ok' | 'stale' | 'failed' | 'recovering';
  itemCount: number;
  error?: string;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  nextRetryAt?: string | null;
}

export interface NewspaperSection {
  id: string;
  emoji: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  topics: NewspaperTopic[];
  accent: string;
  status: 'ok' | 'partial' | 'empty';
  sourceCount: number;
  totalSources: number;
  totalItems: number;
  sources: NewspaperSourceStatus[];
  failedSources: string[];
  items: NewspaperArticle[];
}

export interface NewspaperBriefing {
  generatedAt: string;
  cacheTtlMinutes: number;
  totalItems: number;
  totalSources: number;
  sections: NewspaperSection[];
}

export interface NewspaperArticleDetail {
  url: string;
  source: string;
  domain: string;
  sourceUrl?: string;
  commentUrl?: string;
  publishedAt: string | null;
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
  coverImage?: string;
  images: NewspaperImage[];
  originalContent: string;
  translatedContent: string;
  replies: NewspaperReply[];
  replyCount: number;
  extractedAt: string;
  translationMode: 'live' | 'fallback';
  fulltextStatus: 'pending' | 'partial' | 'ready' | 'failed' | 'recovering';
  imageStatus: 'pending' | 'partial' | 'ready' | 'failed' | 'recovering';
  replyStatus: 'pending' | 'partial' | 'ready' | 'failed' | 'recovering';
  translationStatus: 'pending' | 'partial' | 'ready' | 'failed' | 'recovering';
  statusMessage?: string;
  nextRetryAt?: string | null;
}

export interface NewspaperImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  source: 'cover' | 'content';
}

export interface NewspaperReply {
  id: string;
  author: string;
  authorHandle?: string;
  avatarUrl?: string;
  publishedAt: string | null;
  content: string;
  contentZh: string;
  likeCount?: number;
  replyCount?: number;
  url?: string;
}

export interface NewspaperAiInsight {
  accountId: number;
  accountName: string;
  model: string;
  status: 'ready' | 'degraded';
  degradedReason?: string | null;
  summary: string;
  takeaways: string[];
  risks: string[];
  questions: string[];
  actions: string[];
  generatedAt: string;
}

export interface NewspaperSectionAiInsight {
  sectionId: string;
  title: string;
  summary: string;
  topSignals: string[];
}

export interface NewspaperBriefingAiInsight {
  accountId: number;
  accountName: string;
  model: string;
  headline: string;
  summary: string;
  highlights: string[];
  watchlist: string[];
  opportunities: string[];
  sections: NewspaperSectionAiInsight[];
  coverage?: {
    totalSections: number;
    coveredSections: number;
    totalHighlights: number;
    totalSources: number;
  };
  generatedAt: string;
}

export interface NewspaperHealth {
  ok: boolean;
  featureVersion: string;
  generatedAt: string;
  capabilities: {
    briefing: boolean;
    articleReader: boolean;
    articleInsight: boolean;
    briefingInsight: boolean;
    images: boolean;
    replies: boolean;
    aiAccountPool: boolean;
  };
  ai: {
    activeAccountCount: number;
    defaultAccountId: number | null;
    defaultAccountName: string;
    defaultModel: string;
  };
}

export interface ProxyTestResult {
  ip: string;
  latency: number;
  status: 'active' | 'failed';
}

export interface ProxyKernelSource {
  key: string;
  label: string;
  url: string;
  kind: 'profile' | 'subscription';
}

export interface ProxyKernelGroup {
  name: string;
  type: string;
  now: string;
  all: string[];
}

export interface ProxyKernelStatus {
  installed: boolean;
  version: string;
  binaryPath: string;
  running: boolean;
  pid: number | null;
  lastError: string;
  sourceKey: string;
  sourceLabel: string;
  sourceUrl: string;
  mixedPort: number;
  socksPort: number;
  httpPort: number;
  previousDefaultProxyId: number | null;
  openAiGroupName: string;
  openAiNodeName: string;
  updatedAt: string | null;
  health: ProxyKernelHealth;
  lastSuccessfulNode: string;
  lastSuccessfulAt: string | null;
  recoveryState: string;
  lastRecoveryError: string;
  availableSources: ProxyKernelSource[];
  proxyGroups: ProxyKernelGroup[];
}

export interface CrsRelayStatus {
  enabled: boolean;
  name: string;
  upstreamBaseUrl: string;
  upstreamApiKeyMasked: string;
  publicApiKeyMasked: string;
  defaultModel: string;
  timeoutMs: number;
  enabledSources: Array<'oauth' | 'token_api' | 'ai_api' | 'manual'>;
  updatedAt: string | null;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | 'never';
  lastError: string;
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
    sourceType: 'oauth' | 'token_api' | 'ai_api' | 'manual';
    id: number | string;
    name: string;
    model: string;
    baseUrl: string;
    status: string;
  }>;
}

export interface CrsRelayTestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  endpoint: string;
  preview: string;
}

export interface FetchMailsResult {
  mails: MailMessage[];
  total: number;
  protocol: 'graph' | 'imap';
  cached: boolean;
}

export interface SendMailRequest {
  account_id: number;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
}

export interface GoogleOAuthAuthorizeResult {
  url: string;
  state: string;
}

export interface OpenAILaunchAuthorizeResult {
  state: string;
  launchMode: 'proxy-browser' | 'system-browser';
}

export interface OpenAIOAuthResult {
  status: 'pending' | 'completed' | 'expired';
  type?: 'openai-oauth-success' | 'openai-oauth-error';
  provider?: string;
  email?: string;
  external_account_id?: string;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

export interface OAuthProviderStatus {
  googleConfigured: boolean;
  googleProjectId: string;
  openaiConfigured: boolean;
  linuxDoConfigured?: boolean;
}

export interface AuthCheckResult {
  required: boolean;
  googleOAuthEnabled?: boolean;
}

export interface AdminOAuthAuthorizeResult {
  url: string;
  state: string;
}

export interface PersonalAccountAiSuggestion {
  type: 'update';
  target_id: number;
  mode?: 'temporary' | 'long_term';
  status?: 'active' | 'inactive' | 'error';
  remark?: string;
  tag_names?: string[];
  reason: string;
}

export interface PersonalAccountAiPlan {
  requestedAccountId?: number | null;
  requestedAccountName?: string;
  accountId: number;
  accountName: string;
  model: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  generatedAt: string;
  summary: string;
  suggestions: PersonalAccountAiSuggestion[];
}

export interface PersonalProxyAiSuggestion {
  type: 'update';
  target_id: number;
  name?: string;
  is_enabled?: number;
  is_default?: number;
  reason: string;
}

export interface PersonalProxyAiPlan {
  requestedAccountId?: number | null;
  requestedAccountName?: string;
  accountId: number;
  accountName: string;
  model: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  generatedAt: string;
  summary: string;
  suggestions: PersonalProxyAiSuggestion[];
}

export interface PersonalTokenAiSuggestion {
  type: 'update';
  target_id: number;
  status?: 'active' | 'inactive' | 'error';
  auto_sync_enabled?: number;
  note?: string;
  reason: string;
}

export interface PersonalTokenAiPlan {
  requestedAccountId?: number | null;
  requestedAccountName?: string;
  accountId: number;
  accountName: string;
  model: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  generatedAt: string;
  summary: string;
  suggestions: PersonalTokenAiSuggestion[];
}

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  public_repos: number;
  public_gists?: number;
  followers: number;
  following: number;
  total_private_repos?: number;
  owned_private_repos?: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  archived?: boolean;
  fork?: boolean;
  visibility?: string;
  default_branch?: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count?: number;
  language: string | null;
  updated_at: string;
  pushed_at?: string;
}

export interface GitHubOrganization {
  id: number;
  login: string;
  avatar_url: string;
  description?: string | null;
  url: string;
}

export interface GitHubGist {
  id: string;
  html_url: string;
  description: string | null;
  public: boolean;
  updated_at: string;
  files: Record<string, { filename: string; language: string | null }>;
}

export interface GitHubEvent {
  id: string;
  type: string;
  repo: { name: string; url: string };
  created_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  comments: number;
  labels: { id: number; name: string; color: string }[];
  user: { login: string; avatar_url: string };
  repo_full_name: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  head: { ref: string };
  base: { ref: string };
  repo_full_name: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  repo_full_name: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: { sha: string; url: string };
  repo_full_name: string;
}

export interface GitHubIntegrationData {
  connected: boolean;
  tokenMasked: string;
  lastSyncAt: string | null;
  profile: GitHubProfile | null;
  repos: GitHubRepository[];
  starred: GitHubRepository[];
  orgs: GitHubOrganization[];
  gists: GitHubGist[];
  events: GitHubEvent[];
  issues: GitHubIssue[];
  pulls: GitHubPullRequest[];
  releases: GitHubRelease[];
  branches: GitHubBranch[];
}

export interface LinuxDoUser {
  id: number;
  username: string;
  name: string;
  active: boolean;
  trust_level: number;
  email?: string;
  avatar_url?: string;
  silenced?: boolean;
}

export interface LinuxDoIntegrationData {
  connected: boolean;
  clientConfigured: boolean;
  tokenMasked: string;
  lastSyncAt: string | null;
  expiresAt: string | null;
  scopes: string[];
  user: LinuxDoUser | null;
}

export interface CloudflareUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export interface CloudflareAccountInfo {
  id: string;
  name: string;
  type: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  type: string;
  paused: boolean;
  development_mode?: number;
  original_name_servers?: string[];
  name_servers: string[];
  created_on: string;
  modified_on: string;
}

export interface CloudflareDnsRecord {
  id: string;
  zone_id: string;
  zone_name: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  proxiable?: boolean;
  priority?: number;
  ttl: number;
  comment?: string | null;
  tags?: string[];
  created_on?: string;
  modified_on?: string;
}

export interface CloudflareZoneDetail {
  zoneId: string;
  dnsRecordCount: number;
  proxiedRecordCount: number;
  records: CloudflareDnsRecord[];
}

export interface CloudflarePagesProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  production_branch: string;
  created_on: string;
  latest_deployment?: {
    id: string;
    environment: string;
    url: string;
    created_on: string;
    latest_stage?: {
      name: string;
      status: string;
      ended_on?: string;
    };
  };
}

export interface CloudflareWorkerScript {
  id: string;
  tag?: string;
  created_on?: string;
  modified_on?: string;
  usage_model?: string;
  etag?: string;
}

export interface CloudflareRuleset {
  id: string;
  zone_id?: string;
  account_id?: string;
  name: string;
  description?: string;
  kind: string;
  phase: string;
  version: string;
  last_updated: string;
  rules?: {
    id?: string;
    action: string;
    expression?: string;
    description?: string;
    enabled?: boolean;
  }[];
}

export interface CloudflareIntegrationData {
  connected: boolean;
  tokenMasked: string;
  lastSyncAt: string | null;
  user: CloudflareUser | null;
  accounts: CloudflareAccountInfo[];
  zones: CloudflareZone[];
  zoneDetails: CloudflareZoneDetail[];
  pagesProjects: CloudflarePagesProject[];
  workerScripts: CloudflareWorkerScript[];
  rulesets: CloudflareRuleset[];
}

export interface NotionBot {
  object: string;
  id: string;
  name: string | null;
  type: string;
  avatar_url: string | null;
  bot?: {
    owner?: {
      type?: string;
      workspace?: boolean;
    };
    workspace_name?: string | null;
  };
}

export interface NotionUser {
  object: string;
  id: string;
  name: string;
  type: string;
  person?: {
    email?: string;
  };
  avatar_url?: string | null;
}

export interface NotionParentRef {
  type?: string;
  database_id?: string;
  page_id?: string;
  workspace?: boolean;
}

export interface NotionPageSummary {
  object: string;
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  title: string;
  parent: NotionParentRef;
  icon?: any;
  archived?: boolean;
  propertyCount?: number;
  propertiesPreview?: Record<string, string>;
}

export interface NotionDatabaseSummary {
  object: string;
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  title: string;
  parent: NotionParentRef;
  description?: string;
  propertyCount?: number;
  properties?: Record<string, { id?: string; name?: string; type?: string }>;
}

export interface NotionBlockSummary {
  object: string;
  id: string;
  type: string;
  has_children: boolean;
  created_time: string;
  last_edited_time: string;
  parentPageId: string;
}

export interface NotionReadableBlock {
  object: string;
  id: string;
  type: string;
  text: string;
  has_children: boolean;
  created_time: string;
  last_edited_time: string;
  url?: string;
  language?: string;
  checked?: boolean;
  children?: NotionReadableBlock[];
}

export interface NotionPageContent {
  page: NotionPageSummary;
  blocks: NotionReadableBlock[];
}

export interface NotionIntegrationData {
  connected: boolean;
  tokenMasked: string;
  lastSyncAt: string | null;
  bot: NotionBot | null;
  users: NotionUser[];
  blocks: NotionBlockSummary[];
  pages: NotionPageSummary[];
  databases: NotionDatabaseSummary[];
  metrics: {
    pageCount: number;
    databaseCount: number;
    userCount: number;
    archivedPageCount: number;
    pageWithDatabaseParentCount: number;
  };
}

export interface NotionInsights {
  totalBlocks: number;
  blockTypeCounts: { type: string; count: number }[];
  pageBlockCounts: { pageId: string; title: string; count: number }[];
  recentEditedPages: { pageId: string; title: string; lastEditedTime: string }[];
  sampledPages: number;
}

export interface NotionDatabaseRow {
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  title: string;
  properties: Record<string, string>;
}

export interface NotionDatabaseContent {
  database: NotionDatabaseSummary;
  rows: NotionDatabaseRow[];
}

export interface MiSubUserInfo {
  upload: number;
  download: number;
  total: number;
  expire: number;
  username?: string;
  plan?: string;
}

export interface MiSubSubscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  exclude: string;
  status?: string;
  nodeCount?: number;
  userInfo?: MiSubUserInfo | null;
}

export interface MiSubProfilePrefixSettings {
  enableManualNodes?: boolean | null;
  enableSubscriptions?: boolean | null;
  manualNodePrefix?: string;
}

export interface MiSubProfile {
  id: string;
  name: string;
  enabled: boolean;
  subscriptions: string[];
  manualNodes: string[];
  customId?: string;
  subConverter?: string;
  subConfig?: string;
  expiresAt?: string;
  prefixSettings?: MiSubProfilePrefixSettings;
}

export interface MiSubSettings {
  FileName: string;
  mytoken: string;
  profileToken: string;
  subConverter: string;
  subConfig: string;
  prependSubName?: boolean;
  prefixConfig?: MiSubProfilePrefixSettings;
  NotifyThresholdDays?: number;
  NotifyThresholdPercent?: number;
  storageType?: string;
  [key: string]: any;
}

export interface MiSubBatchUpdateResult {
  id: string;
  success: boolean;
  nodeCount?: number;
  error?: string;
}

export interface MiSubIntegrationData {
  connected: boolean;
  baseUrl: string;
  passwordMasked: string;
  lastSyncAt: string | null;
  misubs: MiSubSubscription[];
  profiles: MiSubProfile[];
  settings: MiSubSettings | null;
}

export type MiSubAiActionType = 'subscription_patch' | 'profile_patch' | 'profile_create' | 'profile_delete';

export interface MiSubAiAction {
  type: MiSubAiActionType;
  id?: string;
  reason: string;
  patch?: Record<string, any>;
  profile?: Partial<MiSubProfile>;
}

export interface MiSubAiAnalysis {
  account: {
    id: number;
    name: string;
    provider: string;
    model: string;
  };
  goal: string;
  summary: string;
  findings: string[];
  actions: MiSubAiAction[];
  raw: string;
  sourceMode?: 'ai' | 'heuristic';
  fallbackReason?: string;
}

export interface MiSubAiInspectionConfig {
  enabled: boolean;
  accountId: number | null;
  intervalHours: number;
  goal: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string | null;
}

export interface MiSubAiInspectionRun {
  id: number;
  status: 'success' | 'failed' | 'skipped';
  accountId: number | null;
  goal: string;
  summary: string;
  findings: string[];
  actions: MiSubAiAction[];
  raw: string;
  error: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface MiSubAiInspectionState {
  config: MiSubAiInspectionConfig;
  latestRun: MiSubAiInspectionRun | null;
  history: MiSubAiInspectionRun[];
  running: boolean;
}

export interface YmailOpenSettings {
  title: string;
  announcement?: string;
  alwaysShowAnnouncement?: boolean;
  prefix?: string;
  addressRegex?: string;
  minAddressLen?: number;
  maxAddressLen?: number;
  defaultDomains?: string[];
  domains: string[];
  randomSubdomainDomains?: string[];
  domainLabels?: string[];
  needAuth?: boolean;
  enableUserCreateEmail?: boolean;
  disableAnonymousUserCreateEmail?: boolean;
  disableCustomAddressName?: boolean;
  enableUserDeleteEmail?: boolean;
  enableAutoReply?: boolean;
  enableIndexAbout?: boolean;
  enableWebhook?: boolean;
  isS3Enabled?: boolean;
  enableSendMail?: boolean;
  version?: string;
  showGithub?: boolean;
  disableAdminPasswordCheck?: boolean;
  enableAddressPassword?: boolean;
  statusUrl?: string;
  enableGlobalTurnstileCheck?: boolean;
}

export interface YmailStatistics {
  userCount?: number;
  addressCount?: number;
  mailCount?: number;
  sendMailCount?: number;
  activeAddressCount7days?: number;
  activeAddressCount30days?: number;
  [key: string]: any;
}

export interface YmailAddressSummary {
  id: number;
  name: string;
  address?: string;
  created_at?: string;
  updated_at?: string;
  mail_count?: number;
  send_count?: number;
  source_meta?: string;
  [key: string]: any;
}

export interface YmailAddressCredential {
  jwt: string;
  password?: string;
  address?: string;
  loginUrl?: string;
}

export interface YmailMailSummary {
  id: number;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  created_at?: string;
  raw?: Record<string, any>;
  [key: string]: any;
}

export interface YmailMailListResult {
  jwt: string;
  address: string;
  results: YmailMailSummary[];
  count: number;
}

export interface YmailIntegrationData {
  connected: boolean;
  tokenMasked: string;
  lastSyncAt: string | null;
  siteUrl: string;
  apiBaseUrl: string;
  openSettings: YmailOpenSettings | null;
  statistics: YmailStatistics | null;
  addresses: YmailAddressSummary[];
  addressCount: number;
}

export interface AiAccount {
  id: number;
  provider: AiProvider;
  auth_mode: 'api_key' | 'google_oauth';
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  priority_rank: number;
  oauth_client_id: string;
  oauth_client_secret: string;
  oauth_refresh_token: string;
  oauth_email: string;
  oauth_project_id: string;
  system_prompt: string;
  remark: string;
  status: 'active' | 'inactive' | 'error';
  last_used_at: string | null;
  last_tested_at: string | null;
  last_test_status: 'success' | 'failed' | 'never';
  last_test_latency_ms: number | null;
  last_http_status: number | null;
  last_error: string;
  last_response_preview: string;
  available_models: string;
  last_models_synced_at: string | null;
  transport_hint: string;
  created_at: string;
  updated_at: string;
}

export interface AiThread {
  id: number;
  account_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number;
  last_message_excerpt: string;
}

export interface AiMessage {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AiRuntimeContext {
  path?: string;
  section?: string;
  routeContext?: Record<string, string>;
  globalMonitor?: boolean;
  autoExecute?: boolean;
}

export interface AiChatResult {
  thread: AiThread;
  userMessage: AiMessage;
  assistantMessage: AiMessage;
  chatSession?: {
    threadId: number;
    accountId: number;
    accountName: string;
    provider: AiProvider;
    model: string;
  };
  agentRuntime?: {
    mode: AgentAutonomyConfig['executionMode'];
    observationLoop: AgentRuntimeView['observationLoop'];
    currentFocusPath: string | null;
    runtimeEventRefs: string[];
  };
  uiActions?: Array<{ type: 'open_path'; path: string; label?: string }>;
  toolExecutions?: number;
  toolDetails?: Array<{ tool: string; ok: boolean; error?: string; target?: string }>;
  degradedReason?: string;
  runtimeEventRefs?: string[];
  // Legacy aliases kept for compatibility while the frontend finishes migrating.
  museActions?: Array<{ type: 'open_path'; path: string; label?: string }>;
  museToolExecutions?: number;
  museToolDetails?: Array<{ tool: string; ok: boolean; error?: string; target?: string }>;
  responseMeta?: {
    provider: AiProvider;
    protocol: 'gemini' | 'anthropic' | 'responses' | 'openai';
    model: string;
    accountId: number;
    accountName: string;
  };
  fallbackAccount?: {
    id: number;
    name: string;
    provider: AiProvider;
    model: string;
  };
}

export interface TokenQuotaCard {
  key: string;
  label: string;
  remainingPct: number | null;
  remainingText: string;
  resetAt: string | null;
  resetLabel: string;
  tone: 'red' | 'green' | 'amber' | 'blue' | 'slate';
}

export interface TokenUsagePoint {
  label: string;
  value: number | null;
  hint?: string;
}

export interface TokenUsageSeries {
  label: string;
  color?: string;
  points: TokenUsagePoint[];
}

export interface TokenUsageSection {
  title: string;
  subtitle?: string;
  series: TokenUsageSeries[];
}

export interface TokenAnalyticsSnapshot {
  sourceUrl: string;
  finalUrl: string;
  pageTitle: string;
  fetchedAt: string;
  cards: TokenQuotaCard[];
  usageSections: TokenUsageSection[];
  rangeLabels: string[];
  legends: string[];
  rawSignals: string[];
  textDigest: string;
}

export interface TokenAccountView {
  id: number;
  provider: TokenProvider;
  provider_label: string;
  auth_method: TokenAuthMethod;
  name: string;
  session_format: TokenSessionFormat;
  login_hint: string;
  external_account_id: string;
  analytics_url: string;
  session_payload: string;
  access_token: string;
  refresh_token: string;
  id_token: string;
  user_agent: string;
  api_key: string;
  api_base_url: string;
  api_model: string;
  api_model_provider: string;
  api_reasoning_effort: string;
  api_wire_api: string;
  note: string;
  status: 'active' | 'inactive' | 'error';
  auto_sync_enabled: number;
  last_synced_at: string | null;
  last_error: string;
  next_retry_at: string | null;
  failure_count: number;
  last_failure_kind: TokenSyncFailureKind;
  created_at: string;
  updated_at: string;
  snapshot: TokenAnalyticsSnapshot | null;
}

export interface CodexFreeImportResult {
  directory: string;
  scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  accounts: TokenAccountView[];
}

export interface CodexDesktopSettings {
  id: number;
  codex_home: string;
  auto_switch_enabled: number;
  auto_switch_launch_mode: 'activate_only' | 'activate_and_open';
  low_5h_threshold_pct: number;
  updated_at: string;
}

export interface CodexActivationEvent {
  id: number;
  token_account_id: number | null;
  strategy: 'manual' | 'next' | 'best' | 'auto' | 'restore';
  status: 'success' | 'error' | 'restored';
  codex_home: string;
  backup_auth_path: string;
  error: string;
  created_at: string;
}

export interface CodexDesktopStatus {
  codexHome: string;
  authPath: string;
  sessionsPath: string;
  archivedSessionsPath: string;
  authExists: boolean;
  sessionsExists: boolean;
  archivedSessionsExists: boolean;
  authMode: string;
  currentAccountId: string;
  currentEmail: string;
  matchedTokenAccountId: number | null;
  matchedTokenAccountName: string;
  matchSource: 'marker_token' | 'marker_identity' | 'token_hash' | 'identity_pair' | 'external_account_id' | 'email' | 'none';
  matchConfidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
  matchAmbiguous: boolean;
  matchNotes: string[];
  lastActivation: CodexActivationEvent | null;
  autoSwitchPolicy: CodexAutoSwitchPolicyStatus;
}

export interface CodexAutoSwitchPolicyStatus {
  enabled: boolean;
  low5hThresholdPct: number;
  failureCooldownMinutes: number;
  maxAttempts: number;
  protectedRunning: boolean;
  recentFailedCandidateIds: number[];
  userInterventionReason: 'none' | 'identity_ambiguous' | 'low_confidence_match' | 'no_trusted_current_account';
}

export interface CodexDesktopState {
  status: CodexDesktopStatus;
  settings: CodexDesktopSettings;
  accounts: TokenAccountView[];
}

export interface CodexDesktopActivationResult {
  status: CodexDesktopStatus;
  event: CodexActivationEvent;
  account: TokenAccountView | null;
  launched: boolean;
}

export interface CodexDesktopAutoSwitchDeferred {
  deferred: true;
  reason: 'protected_running_session';
  queuedAt: string;
  currentTokenAccountId: number;
  candidateTokenAccountId: number;
  nextCheck: 'next_auto_sync';
}

export interface CodexUsageHistoryPoint {
  date: string;
  sessionCount: number;
  fileCount: number;
  byteCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  estimated: boolean;
}

export interface CodexTokenSnapshotPoint {
  id: number;
  token_account_id: number;
  account_name: string;
  created_at: string;
  fiveHourRemainingPct: number | null;
  weeklyRemainingPct: number | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
  estimated?: boolean;
}

export interface CodexWeeklyTrendPoint {
  date: string;
  totalWeeklyRemainingPct: number;
  dailyUsedPct: number;
  accountCount: number;
  zeroWeeklyAccountCount: number;
}

export interface CodexUsageHistory {
  tokenSnapshots: CodexTokenSnapshotPoint[];
  localUsage: CodexUsageHistoryPoint[];
  weeklyTrend: CodexWeeklyTrendPoint[];
}

export interface AiAccountDiagnostics {
  account: AiAccount;
  availableModels: string[];
  modelCount: number;
  supportsModelListing: boolean;
  providerLabel: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  transport: string;
  endpoint: string;
  modelCount: number;
  models: string[];
  preview: string;
  message: string;
}

export type PersonalRuleTriggerType =
  | 'token_low_remaining_pct'
  | 'account_error'
  | 'proxy_failed'
  | 'keyword_in_news'
  | 'github_repo_activity'
  | 'subscription_expiring_days';

export interface PersonalOsRuleView {
  id: number;
  name: string;
  description: string;
  scope: 'today' | 'inbox' | 'alert';
  trigger_type: PersonalRuleTriggerType;
  config: Record<string, any>;
  is_enabled: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalRuleAiSuggestion {
  type: 'create' | 'update' | 'delete';
  target_id?: number;
  name: string;
  description: string;
  scope: 'today' | 'inbox' | 'alert';
  trigger_type: PersonalRuleTriggerType;
  config: Record<string, any>;
  is_enabled: number;
  reason: string;
}

export interface PersonalMemoryView {
  id: number;
  title: string;
  content: string;
  kind: 'note' | 'project' | 'risk' | 'preference';
  tags: string[];
  source: string;
  entity_type: string;
  entity_key: string;
  is_pinned: number;
  is_resolved: number;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalMemoryAiSuggestion {
  type: 'create' | 'update' | 'resolve';
  target_id?: number;
  title: string;
  content: string;
  kind: 'note' | 'project' | 'risk' | 'preference';
  tags: string[];
  is_pinned?: number;
  is_resolved?: number;
  entity_type: string;
  entity_key: string;
  reason: string;
}

export interface PersonalMemoryAiPlan {
  requestedAccountId?: number | null;
  requestedAccountName?: string;
  accountId: number;
  accountName: string;
  model: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  generatedAt: string;
  summary: string;
  suggestions: PersonalMemoryAiSuggestion[];
}

export interface PersonalMemoryIngestionConfig {
  enabled: boolean;
  accountId: number | null;
  intervalHours: number;
  focus: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string | null;
}

export interface PersonalMemoryIngestionRun {
  id: number;
  status: 'success' | 'failed' | 'skipped';
  accountId: number | null;
  mode: 'heuristic' | 'ai';
  focus: string;
  summary: string;
  sources: string[];
  createdCount: number;
  updatedCount: number;
  resolvedCount: number;
  error: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface PersonalMemoryIngestionState {
  config: PersonalMemoryIngestionConfig;
  latestRun: PersonalMemoryIngestionRun | null;
  history: PersonalMemoryIngestionRun[];
  running: boolean;
}

export interface PersonalRuleAiPlan {
  requestedAccountId?: number | null;
  requestedAccountName?: string;
  accountId: number;
  accountName: string;
  model: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  generatedAt: string;
  summary: string;
  suggestions: PersonalRuleAiSuggestion[];
}

export interface PersonalRuleAutomationConfig {
  enabled: boolean;
  accountId: number | null;
  intervalHours: number;
  focus: string;
  autoApplyEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string | null;
}

export interface PersonalRuleAutomationRun {
  id: number;
  status: 'success' | 'failed' | 'skipped';
  accountId: number | null;
  focus: string;
  summary: string;
  suggestions: PersonalRuleAiSuggestion[];
  appliedCount: number;
  error: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface PersonalRuleAutomationState {
  config: PersonalRuleAutomationConfig;
  latestRun: PersonalRuleAutomationRun | null;
  history: PersonalRuleAutomationRun[];
  running: boolean;
}

export interface AgentProfileMemory {
  id: number;
  key: string;
  value: string;
  category: 'preference' | 'cognitive_style' | 'habit' | 'goal' | 'constraint';
  confidence: number;
  source: string;
  last_observed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSkillJournalView {
  id: number;
  category: 'tool_pattern' | 'workflow' | 'automation' | 'recovery';
  title: string;
  summary: string;
  pattern: string;
  score: number;
  evidence: string[];
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentAutonomyConfig {
  enabled: boolean;
  intervalHours: number;
  executionMode: 'observe_only' | 'guided_execute' | 'full_execute';
  memoryIngestionEnabled: boolean;
  ruleAutomationEnabled: boolean;
  profileLearningEnabled: boolean;
  skillLearningEnabled: boolean;
  backupEnabled: boolean;
  backupDir: string;
  backupRetentionCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastCompactedAt: string | null;
  updatedAt: string | null;
}

export interface AgentAutonomyRun {
  id: number;
  status: 'success' | 'failed' | 'skipped';
  summary: string;
  actions: string[];
  backupPath: string;
  error: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface AgentRuntimeSnapshot {
  id: number;
  status: 'healthy' | 'watch' | 'critical';
  summary: string;
  aiHealthyCount: number;
  aiTotalCount: number;
  proxyHealthy: boolean;
  proxyMode: string;
  memoryHealthy: boolean;
  ruleHealthy: boolean;
  newspaperHealthy: boolean;
  systemLoad: number;
  memoryUsagePct: number;
  anomalies: string[];
  recoveries: string[];
  metadata: Record<string, any>;
  createdAt: string;
}

export interface AgentRecoveryIncident {
  id: number;
  category: 'ai' | 'proxy' | 'memory' | 'rules' | 'server' | 'integration';
  severity: 'watch' | 'critical';
  status: 'open' | 'resolved' | 'failed';
  title: string;
  detail: string;
  fingerprint: string;
  recoveryAction: string;
  recoveryResult: string;
  metadata: Record<string, any>;
  detectedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface AgentCapabilityWeight {
  id: number;
  capability: string;
  weight: number;
  successCount: number;
  failureCount: number;
  neutralCount: number;
  lastOutcome: 'success' | 'failed' | 'neutral';
  lastSummary: string;
  source: string;
  updatedAt: string;
}

export interface AgentRuntimeEvent {
  id: number;
  layer: 'raw' | 'short_term' | 'long_term' | 'skill';
  scope: 'global' | 'page' | 'tool' | 'chat' | 'recovery' | 'task';
  source: string;
  eventType: string;
  title: string;
  detail: string;
  content: Record<string, any>;
  confidence: number;
  shared: boolean;
  status: 'active' | 'archived';
  originRefs: string[];
  compactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuntimeMemoryState {
  raw: AgentRuntimeEvent[];
  shortTerm: AgentRuntimeEvent[];
  longTerm: AgentRuntimeEvent[];
  skills: AgentSkillJournalView[];
  profile: AgentProfileMemory[];
  totals: {
    active: {
      raw: number;
      shortTerm: number;
      longTerm: number;
      skills: number;
      profile: number;
    };
    archived: {
      raw: number;
      shortTerm: number;
      longTerm: number;
    };
    cumulative: {
      raw: number;
      shortTerm: number;
      longTerm: number;
      skills: number;
      profile: number;
    };
    pendingCompaction: number;
  };
}

export interface AgentRuntimeActivityState {
  runs: AgentAutonomyRun[];
  incidents: AgentRecoveryIncident[];
  capabilityWeights: AgentCapabilityWeight[];
  recentEvents: AgentRuntimeEvent[];
}

export interface AgentRuntimePageFamiliarity {
  path: string;
  observations: number;
  toolTouches: number;
  confidence: number;
  lastObservedAt: string | null;
}

export interface AgentRuntimeView {
  mode: AgentAutonomyConfig['executionMode'];
  running: boolean;
  currentFocusPath: string | null;
  observationLoop: 'background';
  latestSnapshot: AgentRuntimeSnapshot | null;
  pageFamiliarity: AgentRuntimePageFamiliarity[];
  recentEvents: AgentRuntimeEvent[];
  memoryTotals: AgentRuntimeMemoryState['totals'];
  lastCompactedAt: string | null;
  nextCompactionAt: string | null;
  compactionState: 'idle' | 'pending' | 'cooldown';
}

export interface AgentIncidentReportInput {
  title: string;
  detail: string;
  fingerprint?: string;
  severity?: AgentRecoveryIncident['severity'];
  source?: string;
  kind?: 'render' | 'window_error' | 'unhandled_rejection' | 'api_error' | 'runtime_probe';
  metadata?: Record<string, any>;
}

export interface AgentIncidentReportResult {
  incident: AgentRecoveryIncident;
  capability: AgentCapabilityWeight;
}

export interface AgentAutonomyState {
  config: AgentAutonomyConfig;
  latestRun: AgentAutonomyRun | null;
  history: AgentAutonomyRun[];
  running: boolean;
  profile: AgentProfileMemory[];
  skills: AgentSkillJournalView[];
  latestSnapshot: AgentRuntimeSnapshot | null;
  recentIncidents: AgentRecoveryIncident[];
  capabilityWeights: AgentCapabilityWeight[];
  automationHealth: {
    memoryIngestionEnabled: boolean;
    ruleAutomationEnabled: boolean;
    backupEnabled: boolean;
  };
}

export interface ActionCenterItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  type: 'urgent' | 'alert' | 'update' | 'rule';
  severity: 'critical' | 'high' | 'medium' | 'low';
  entityType: string;
  entityKey: string;
  actionLabel: string;
  actionPath: string;
  occurredAt: string | null;
  status?: 'active' | 'done' | 'muted';
  stateNote?: string;
  stateUpdatedAt?: string;
  metadata?: Record<string, any>;
}

export interface TodayQuestion {
  key: 'must_do' | 'account_risks' | 'signal_changes' | 'next_step';
  label: string;
  answer: string;
}

export interface TodayFocus {
  headline: string;
  summary: string;
  questions: TodayQuestion[];
  priorities: ActionCenterItem[];
  anomalies: ActionCenterItem[];
  highlights: ActionCenterItem[];
}

export interface PersonalEntityLink {
  kind: string;
  label: string;
  value: string;
  path: string;
  status?: string;
  updatedAt?: string | null;
}

export interface PersonalEntityView {
  id: string;
  type: 'account' | 'domain' | 'project' | 'repository';
  name: string;
  description: string;
  health: 'healthy' | 'watch' | 'critical';
  links: PersonalEntityLink[];
  relatedActionIds: string[];
}

export interface CommandCenterItem {
  id: string;
  kind: 'open' | 'search' | 'copy' | 'sync';
  title: string;
  subtitle: string;
  path: string;
  keywords: string[];
}

export interface PersonalOsWorkspace {
  generatedAt: string;
  today: TodayFocus;
  inbox: ActionCenterItem[];
  recentMails: MailMessage[];
  alerts: ActionCenterItem[];
  entities: PersonalEntityView[];
  rules: PersonalOsRuleView[];
  memory: PersonalMemoryView[];
  commandCenter: CommandCenterItem[];
  stats: {
    inboxCount: number;
    alertCount: number;
    entityCount: number;
    pinnedMemoryCount: number;
    ruleCount: number;
  };
}

export type OpenTeamsDependencyStatus = 'ready' | 'missing';
export type OpenTeamsProcessStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface OpenTeamsStatus {
  status: OpenTeamsProcessStatus;
  sourceRoot: string;
  frontendUrl: string;
  backendUrl: string;
  frontendPort: number;
  backendPort: number;
  frontendPid: number | null;
  backendPid: number | null;
  frontendReady: boolean;
  backendReady: boolean;
  dependencies: {
    source: OpenTeamsDependencyStatus;
    frontendNodeModules: OpenTeamsDependencyStatus;
    rootNodeModules: OpenTeamsDependencyStatus;
    corepack: OpenTeamsDependencyStatus;
    cargo: OpenTeamsDependencyStatus;
  };
  commands: {
    install: string;
    prepare: string;
    dev: string;
  };
  lastError: string;
  updatedAt: string;
}
