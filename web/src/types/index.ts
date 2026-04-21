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
  | 'openai_compatible';
export type TokenProvider = 'openai_codex' | 'claude' | 'claude_code';
export type TokenSessionFormat = 'cookie_header' | 'cookie_json' | 'netscape';
export type TokenAuthMethod = 'session' | 'oauth' | 'manual' | 'api';

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
export interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
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
  source: string;
  sourceUrl?: string;
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
  status: 'ok' | 'failed';
  itemCount: number;
  error?: string;
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
  publishedAt: string | null;
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
  originalContent: string;
  translatedContent: string;
  extractedAt: string;
  translationMode: 'live' | 'fallback';
}

export interface ProxyTestResult {
  ip: string;
  latency: number;
  status: 'active' | 'failed';
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

export interface AuthCheckResult {
  required: boolean;
  googleOAuthEnabled?: boolean;
}

export interface AdminOAuthAuthorizeResult {
  url: string;
  state: string;
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

export interface AiChatResult {
  thread: AiThread;
  userMessage: AiMessage;
  assistantMessage: AiMessage;
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
  created_at: string;
  updated_at: string;
  snapshot: TokenAnalyticsSnapshot | null;
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
