import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { AccountModel } from '../models/Account';
import { AiAccountModel } from '../models/AiChat';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { ProxyModel } from '../models/Proxy';
import { TokenAccountModel } from '../models/TokenAccount';
import { config } from '../config';
import { MailService } from './MailService';
import { DashboardService } from './DashboardService';
import { IntegrationService } from './IntegrationService';
import { agentAutonomyService } from './AgentAutonomyService';
import { PersonalOSService } from './PersonalOSService';
import { ProxyService } from './ProxyService';
import { TokenQuotaService } from './TokenQuotaService';
import { YmailService } from './YmailService';
import type { MailMessage, NotionReadableBlock } from '../types';
import type { NewspaperService } from './NewspaperService';

type MuseToolCall = {
  tool: string;
  args?: Record<string, any>;
};

export type MuseUiAction = {
  type: 'open_path';
  path: string;
  label?: string;
};

export type MuseToolExecution = {
  call: MuseToolCall;
  ok: boolean;
  result?: any;
  error?: string;
  uiAction?: MuseUiAction;
};

const accountModel = new AccountModel();
const aiAccountModel = new AiAccountModel();
const integrationTokenModel = new IntegrationTokenModel();
const proxyModel = new ProxyModel();
const tokenAccountModel = new TokenAccountModel();
const dashboardService = new DashboardService();
const integrationService = new IntegrationService();
const mailService = new MailService();
const osService = new PersonalOSService();
const proxyService = new ProxyService();
const tokenQuotaService = new TokenQuotaService();
const ymailService = new YmailService();
let newspaperServiceSingleton: NewspaperService | null = null;
const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = findWorkspaceRoot();
const TEXT_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.env',
  '.css', '.scss', '.sass', '.html', '.xml', '.sql', '.sh', '.ps1', '.bat', '.cmd',
  '.mjs', '.cjs', '.lock', '.gitignore', '.npmrc', '.editorconfig',
]);
const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', 'coverage', 'tmp',
]);
const COMMAND_ALLOWLIST = [
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'node',
  'git',
  'tsc',
  'vite',
  'vitest',
];
const COMMAND_DENYLIST = /(Remove-Item|rd\s|rmdir\s|del\s|erase\s|format\s|shutdown\s|restart-computer|stop-computer|git\s+reset\s+--hard|git\s+checkout\s+--|\bmv\b|\bmove-item\b)/i;
const SUPPORTED_MUSE_TOOLS = [
  'muse.workspace_summary',
  'muse.refresh_workspace',
  'muse.search',
  'workspace.summary',
  'workspace.list_files',
  'workspace.read_file',
  'workspace.search',
  'workspace.write_file',
  'workspace.replace_in_file',
  'workspace.run_command',
  'dashboard.summary',
  'muse.open',
  'accounts.list',
  'accounts.create',
  'accounts.update',
  'accounts.delete',
  'entities.list',
  'agent.autonomy.state',
  'agent.autonomy.run',
  'agent.profile.list',
  'agent.profile.upsert',
  'agent.skills.list',
  'memory.list',
  'memory.create',
  'memory.update',
  'memory.delete',
  'ai_accounts.list',
  'ai_accounts.create',
  'ai_accounts.update',
  'ai_accounts.test',
  'ai_accounts.delete',
  'tokens.list',
  'tokens.create',
  'tokens.update',
  'tokens.sync',
  'tokens.sync_all',
  'tokens.delete',
  'proxy.list',
  'proxy.create',
  'proxy.update',
  'proxy.test',
  'proxy.set_default',
  'proxy.set_enabled',
  'proxy.delete',
  'github.summary',
  'cloudflare.summary',
  'notion.summary',
  'notion.search',
  'notion.page.read',
  'notion.article.brief',
  'subscriptions.summary',
  'ymail.summary',
  'linuxdo.summary',
  'integrations.sync',
  'integrations.disconnect',
  'ymail.address.create',
  'ymail.address.delete',
  'ymail.inbox.clear',
  'ymail.sent.clear',
  'newspaper.summary',
  'newspaper.briefing.insight',
  'newspaper.article.read',
  'newspaper.article.insight',
  'mail.recent',
  'mail.refresh_recent',
  'mail.search_cached',
  'action.set_state',
] as const;
const SUPPORTED_MUSE_TOOL_SET = new Set<string>(SUPPORTED_MUSE_TOOLS);
const TOOL_ALIAS_MAP = new Map<string, string>([
  ['action.refresh_workspace', 'muse.refresh_workspace'],
  ['action.workspace_summary', 'muse.workspace_summary'],
  ['action.summary', 'muse.workspace_summary'],
  ['workspace.refresh', 'muse.refresh_workspace'],
  ['workspace.refresh_summary', 'muse.refresh_workspace'],
  ['workspace.list', 'workspace.list_files'],
  ['workspace.read', 'workspace.read_file'],
  ['workspace.write', 'workspace.write_file'],
  ['workspace.replace', 'workspace.replace_in_file'],
  ['workspace.run', 'workspace.run_command'],
  ['command.run', 'workspace.run_command'],
  ['mail.refresh', 'mail.refresh_recent'],
  ['mail.list_recent', 'mail.recent'],
  ['mail.search', 'mail.search_cached'],
  ['memory.upsert', 'memory.create'],
  ['agent.autonomy.status', 'agent.autonomy.state'],
]);

function normalizeToolName(tool: unknown) {
  return String(tool || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/:+/g, '.');
}

function suggestMuseTools(tool: string) {
  const normalized = normalizeToolName(tool);
  const stem = normalized.split('.').slice(0, 2).join('.');
  const direct = SUPPORTED_MUSE_TOOLS.filter((item) => item.startsWith(stem));
  if (direct.length > 0) return direct.slice(0, 6);
  return SUPPORTED_MUSE_TOOLS.filter((item) => item.includes(normalized.split('.').pop() || normalized)).slice(0, 6);
}

function findWorkspaceRoot() {
  let current = path.resolve(__dirname, '..', '..', '..');
  for (let i = 0; i < 6; i += 1) {
    const serverDir = path.join(current, 'server');
    const webDir = path.join(current, 'web');
    if (fs.existsSync(serverDir) && fs.existsSync(webDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), '..');
}

function normalizeWorkspaceInput(value: unknown) {
  return String(value || '.').replace(/\\/g, '/').trim() || '.';
}

function resolveWorkspacePath(input: unknown, options?: { allowMissing?: boolean }) {
  const normalized = normalizeWorkspaceInput(input);
  const candidate = path.resolve(WORKSPACE_ROOT, normalized);
  const relative = path.relative(WORKSPACE_ROOT, candidate);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    if (!options?.allowMissing && !fs.existsSync(candidate)) {
      throw new Error(`workspace path not found: ${normalized}`);
    }
    return {
      absolute: candidate,
      relative: relative || '.',
    };
  }
  throw new Error(`path escapes workspace: ${normalized}`);
}

function isProbablyTextFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(ext)) return true;
  const base = path.basename(filePath).toLowerCase();
  return ['package.json', 'tsconfig.json', 'vite.config.ts', 'README', 'Dockerfile', 'Makefile'].includes(base);
}

function buildWorkspaceSummary() {
  const topEntries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .slice(0, 20)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
    }));

  return {
    root: WORKSPACE_ROOT,
    topEntries,
    hasServer: fs.existsSync(path.join(WORKSPACE_ROOT, 'server')),
    hasWeb: fs.existsSync(path.join(WORKSPACE_ROOT, 'web')),
    packageFiles: ['package.json', 'server/package.json', 'web/package.json']
      .filter((item) => fs.existsSync(path.join(WORKSPACE_ROOT, item))),
  };
}

function listWorkspaceEntries(inputPath: unknown, depth: number, limit: number) {
  const resolved = resolveWorkspacePath(inputPath);
  const entries: Array<{ path: string; type: 'file' | 'dir'; size: number }> = [];

  const walk = (currentPath: string, currentDepth: number) => {
    if (entries.length >= limit) return;
    const stat = fs.statSync(currentPath);
    const relative = path.relative(WORKSPACE_ROOT, currentPath).replace(/\\/g, '/') || '.';
    entries.push({
      path: relative,
      type: stat.isDirectory() ? 'dir' : 'file',
      size: stat.isFile() ? stat.size : 0,
    });
    if (!stat.isDirectory() || currentDepth >= depth) return;

    for (const child of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entries.length >= limit) break;
      if (SKIP_DIRECTORIES.has(child.name)) continue;
      walk(path.join(currentPath, child.name), currentDepth + 1);
    }
  };

  walk(resolved.absolute, 0);
  return {
    root: resolved.relative,
    entries,
  };
}

function readWorkspaceFile(inputPath: unknown, startLine: number, endLine: number, maxChars: number) {
  const resolved = resolveWorkspacePath(inputPath);
  if (!isProbablyTextFile(resolved.absolute)) {
    throw new Error(`file is not a supported text file: ${resolved.relative}`);
  }
  const raw = fs.readFileSync(resolved.absolute, 'utf8');
  const lines = raw.split(/\r?\n/);
  const start = Math.max(1, startLine || 1);
  const end = Math.min(lines.length, Math.max(start, endLine || start + 199));
  const excerpt = lines.slice(start - 1, end).join('\n');
  return {
    path: resolved.relative,
    totalLines: lines.length,
    startLine: start,
    endLine: end,
    content: clip(excerpt, maxChars),
  };
}

function searchWorkspaceText(query: string, inputPath: unknown, limit: number) {
  const resolved = resolveWorkspacePath(inputPath || '.');
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) throw new Error('query is required');
  const matches: Array<{ path: string; line: number; text: string }> = [];

  const walk = (currentPath: string) => {
    if (matches.length >= limit) return;
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(currentPath, { withFileTypes: true })) {
        if (matches.length >= limit) break;
        if (SKIP_DIRECTORIES.has(child.name)) continue;
        walk(path.join(currentPath, child.name));
      }
      return;
    }
    if (!isProbablyTextFile(currentPath) || stat.size > 512 * 1024) return;
    const raw = fs.readFileSync(currentPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= limit) break;
      if (lines[index].toLowerCase().includes(normalizedQuery)) {
        matches.push({
          path: path.relative(WORKSPACE_ROOT, currentPath).replace(/\\/g, '/'),
          line: index + 1,
          text: clip(lines[index].trim(), 240),
        });
      }
    }
  };

  walk(resolved.absolute);
  return {
    root: resolved.relative,
    query,
    matches,
  };
}

function writeWorkspaceFile(inputPath: unknown, content: unknown, mode: string) {
  const resolved = resolveWorkspacePath(inputPath, { allowMissing: true });
  const nextContent = String(content ?? '');
  const parentDir = path.dirname(resolved.absolute);
  if (!parentDir.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`path escapes workspace: ${resolved.relative}`);
  }
  fs.mkdirSync(parentDir, { recursive: true });

  let previous = '';
  if (fs.existsSync(resolved.absolute)) {
    if (!isProbablyTextFile(resolved.absolute)) {
      throw new Error(`file is not a supported text file: ${resolved.relative}`);
    }
    previous = fs.readFileSync(resolved.absolute, 'utf8');
  }

  const normalizedMode = String(mode || 'overwrite').trim().toLowerCase();
  const finalContent =
    normalizedMode === 'append'
      ? `${previous}${nextContent}`
      : normalizedMode === 'prepend'
        ? `${nextContent}${previous}`
        : nextContent;

  fs.writeFileSync(resolved.absolute, finalContent, 'utf8');
  return {
    path: resolved.relative,
    mode: normalizedMode,
    bytes: Buffer.byteLength(finalContent, 'utf8'),
    changed: previous !== finalContent,
  };
}

function replaceInWorkspaceFile(inputPath: unknown, search: unknown, replace: unknown, replaceAll: boolean) {
  const resolved = resolveWorkspacePath(inputPath);
  if (!isProbablyTextFile(resolved.absolute)) {
    throw new Error(`file is not a supported text file: ${resolved.relative}`);
  }
  const searchText = String(search || '');
  if (!searchText) throw new Error('search is required');
  const replaceText = String(replace ?? '');
  const raw = fs.readFileSync(resolved.absolute, 'utf8');
  const occurrences = raw.split(searchText).length - 1;
  if (!occurrences) throw new Error('search text not found');
  const finalContent = replaceAll ? raw.split(searchText).join(replaceText) : raw.replace(searchText, replaceText);
  fs.writeFileSync(resolved.absolute, finalContent, 'utf8');
  return {
    path: resolved.relative,
    occurrences,
    replaced: replaceAll ? occurrences : 1,
  };
}

async function runWorkspaceCommand(command: unknown, cwd: unknown, timeoutMs: number) {
  const commandText = String(command || '').trim();
  if (!commandText) throw new Error('command is required');
  if (COMMAND_DENYLIST.test(commandText)) {
    throw new Error('command blocked by workspace safety policy');
  }
  const firstToken = commandText.split(/\s+/)[0]?.toLowerCase();
  if (!COMMAND_ALLOWLIST.includes(firstToken)) {
    throw new Error(`command is not allowlisted: ${firstToken}`);
  }

  const resolvedCwd = resolveWorkspacePath(cwd || '.');
  const result = await execFileAsync(
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoLogo', '-NoProfile', '-Command', commandText],
    {
      cwd: resolvedCwd.absolute,
      timeout: Math.max(1_000, Math.min(timeoutMs || 60_000, 180_000)),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    }
  );

  return {
    command: commandText,
    cwd: resolvedCwd.relative,
    stdout: clip(result.stdout || '', 12000),
    stderr: clip(result.stderr || '', 8000),
    ok: true,
  };
}

function getNewspaperService(): NewspaperService {
  if (!newspaperServiceSingleton) {
    newspaperServiceSingleton = require('./NewspaperService').newspaperService as NewspaperService;
  }
  return newspaperServiceSingleton;
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
}

function clip(value: unknown, max = 500) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalizeSearchText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchQuery(value: unknown) {
  return normalizeSearchText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function flattenNotionBlocks(blocks: NotionReadableBlock[], depth = 0): Array<NotionReadableBlock & { depth: number }> {
  const result: Array<NotionReadableBlock & { depth: number }> = [];
  for (const block of blocks || []) {
    result.push({ ...block, depth });
    if (Array.isArray(block.children) && block.children.length > 0) {
      result.push(...flattenNotionBlocks(block.children, depth + 1));
    }
  }
  return result;
}

function buildNotionTextExcerpt(blocks: NotionReadableBlock[], maxLength = 3200) {
  const lines = flattenNotionBlocks(blocks)
    .map((block) => block.text?.trim())
    .filter(Boolean) as string[];
  return clip(lines.join('\n'), maxLength);
}

function buildNotionOutline(blocks: NotionReadableBlock[], limit = 8) {
  return flattenNotionBlocks(blocks)
    .filter((block) => block.type.includes('heading') || ['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle', 'quote', 'callout'].includes(block.type))
    .map((block) => ({
      type: block.type,
      depth: block.depth,
      text: clip(block.text, 180),
    }))
    .filter((item) => item.text)
    .slice(0, limit);
}

function toFlag(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(text);
}

function sanitizeMail(mail: MailMessage) {
  return {
    id: mail.id,
    account_id: mail.account_id,
    account_email: (mail as any).account_email || '',
    mailbox: mail.mailbox,
    sender: mail.sender,
    sender_name: mail.sender_name,
    recipients: mail.recipients,
    subject: mail.subject,
    text_preview: clip(mail.text_content, 700),
    mail_date: mail.mail_date,
    cached_at: mail.cached_at,
    attachment_count: Array.isArray(mail.attachments) ? mail.attachments.length : 0,
  };
}

function sanitizeAccount(account: any) {
  return {
    id: account.id,
    provider: account.provider,
    mode: account.mode,
    email: account.email,
    custom_domain: account.custom_domain,
    remark: account.remark,
    status: account.status,
    last_synced_at: account.last_synced_at,
    token_refreshed_at: account.token_refreshed_at,
    updated_at: account.updated_at,
    tags: account.tags || [],
  };
}

function sanitizeAiAccount(account: any) {
  return {
    id: account.id,
    provider: account.provider,
    auth_mode: account.auth_mode,
    name: account.name,
    base_url: account.base_url,
    model: account.model,
    priority_rank: account.priority_rank,
    oauth_email: account.oauth_email,
    oauth_project_id: account.oauth_project_id,
    status: account.status,
    last_test_status: account.last_test_status,
    last_http_status: account.last_http_status,
    last_error: account.last_error,
    transport_hint: account.transport_hint,
    updated_at: account.updated_at,
  };
}

function sanitizeProxy(proxy: any) {
  return {
    id: proxy.id,
    name: proxy.name,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    is_default: !!proxy.is_default,
    is_enabled: !!proxy.is_enabled,
    status: proxy.status,
    last_tested_at: proxy.last_tested_at,
    last_test_ip: proxy.last_test_ip,
  };
}

function sanitizeTokenAccount(account: any) {
  return {
    id: account.id,
    provider: account.provider,
    provider_label: tokenAccountModel.getProviderLabel(account.provider),
    auth_method: account.auth_method,
    name: account.name,
    login_hint: account.login_hint,
    status: account.status,
    auto_sync_enabled: account.auto_sync_enabled,
    last_synced_at: account.last_synced_at,
    last_error: account.last_error,
    updated_at: account.updated_at,
    snapshot: (() => {
      try {
        return account.snapshot_json ? JSON.parse(account.snapshot_json) : null;
      } catch {
        return null;
      }
    })(),
  };
}

function getMaskedText(value?: string | null) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

const REDACTED_VALUE = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|password|passphrase|secret|client[_-]?secret|session[_-]?payload|cookie|credential|private[_-]?key)/i;

function redactSensitiveString(value: string) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED_VALUE}`)
    .replace(/((?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|client[_-]?secret|session[_-]?payload|cookie)=)[^&\s"]+/gi, `$1${REDACTED_VALUE}`)
    .replace(/("(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|client[_-]?secret|session[_-]?payload|cookie)"\s*:\s*")[^"]*(")/gi, `$1${REDACTED_VALUE}$2`);
}

function redactSensitivePayload(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED_VALUE;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveString(value);
  if (typeof value !== 'object') return value;
  if (depth > 8) return '[truncated]';

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitivePayload(item, key, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([itemKey, itemValue]) => [
      itemKey,
      redactSensitivePayload(itemValue, itemKey, depth + 1),
    ])
  );
}

function sanitizeToolCall(call: MuseToolCall): MuseToolCall {
  return {
    tool: call.tool,
    args: redactSensitivePayload(call.args || {}) as Record<string, any>,
  };
}

function sanitizeToolExecution(execution: MuseToolExecution): MuseToolExecution {
  return {
    ...execution,
    call: sanitizeToolCall(execution.call),
    result: redactSensitivePayload(execution.result),
    error: execution.error ? redactSensitiveString(execution.error) : undefined,
  };
}

function normalizeAppPath(input: unknown) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('path is required');

  let value = raw;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      value = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      throw new Error('invalid app url');
    }
  }

  value = value.replace(/\\/g, '/').trim();
  if (!value) throw new Error('path is required');
  if (!value.startsWith('/')) {
    value = `/${value.replace(/^\/+/, '')}`;
  }
  value = value.replace(/\/{2,}/g, '/');

  if (!/^\/[A-Za-z0-9/_\-?=#&.%]*$/.test(value)) {
    throw new Error('path contains unsupported characters');
  }

  return value;
}

export class AiMuseToolService {
  getToolNames() {
    return [...SUPPORTED_MUSE_TOOLS];
  }

  private getGitHubRecord() {
    return integrationTokenModel.get('github') || (config.defaultGitHubToken
      ? {
          provider: 'github' as const,
          token: config.defaultGitHubToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getCloudflareRecord() {
    return integrationTokenModel.get('cloudflare') || (config.defaultCloudflareToken
      ? {
          provider: 'cloudflare' as const,
          token: config.defaultCloudflareToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getNotionRecord() {
    return integrationTokenModel.get('notion') || (config.defaultNotionToken
      ? {
          provider: 'notion' as const,
          token: config.defaultNotionToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getMiSubRecord() {
    return integrationTokenModel.get('misub') || (config.defaultMiSubUrl && config.defaultMiSubPassword
      ? {
          provider: 'misub' as const,
          token: integrationService.buildMiSubRecordPayload(config.defaultMiSubUrl, config.defaultMiSubPassword),
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getYmailRecord() {
    return integrationTokenModel.get('ymail') || (config.defaultYmailAdminPassword
      ? {
          provider: 'ymail' as const,
          token: config.defaultYmailAdminPassword,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  getSystemPrompt() {
    return `
你可以使用一组共享运行时工具来读取页面、检索记忆、执行工作区动作和控制集成。

工具协议：
1. 需要读取真实数据、执行动作或打开页面时，直接使用原生工具调用
2. 工具结果回来后，直接基于真实结果回答用户
3. 不要把工具调用写成文本、代码块、JSON 指令或伪协议

偏好：
- 统一收件箱相关问题优先使用 mail.recent；它表示所有激活邮箱账号的最新 5 条聚合邮件
- 在 /newspaper/read 语境下，泛指“这篇文章”“当前文章”“这篇讲了什么”时，先调用 newspaper.article.read 读取全文，再决定是否需要 newspaper.article.insight

约束：
- 不要编造状态、文件内容或外部结果
- 不要泄露 API Key、refresh token、password、client_secret
`.trim();
  }

  private normalizeCall(call: MuseToolCall): MuseToolCall {
    const normalized = normalizeToolName(call.tool);
    if (SUPPORTED_MUSE_TOOL_SET.has(normalized)) {
      return {
        tool: normalized,
        args: call.args && typeof call.args === 'object' ? call.args : {},
      };
    }
    const alias = TOOL_ALIAS_MAP.get(normalized);
    if (alias) {
      return {
        tool: alias,
        args: call.args && typeof call.args === 'object' ? call.args : {},
      };
    }
    const suggestions = suggestMuseTools(normalized);
    throw new Error(`Unsupported Muse tool: ${call.tool}${suggestions.length ? `; similar tools: ${suggestions.join(', ')}` : ''}`);
  }

  async executeCalls(calls: MuseToolCall[], userMessage = ''): Promise<MuseToolExecution[]> {
    const results: MuseToolExecution[] = [];
    for (const call of calls) {
      try {
        const normalizedCall = this.normalizeCall(call);
        results.push(await this.executeCall(normalizedCall));
      } catch (error: any) {
        results.push({
          call: sanitizeToolCall(call),
          ok: false,
          error: redactSensitiveString(error?.message || 'Muse tool failed'),
        });
      }
    }
    return results;
  }

  formatResultsForModel(results: MuseToolExecution[]) {
    const safeResults = results.map(sanitizeToolExecution);
    return [
      '共享运行时工具已执行。请基于以下真实结果回答用户；如果包含 uiAction，说明页面跳转请求已经发出。',
      JSON.stringify(safeResults, null, 2),
    ].join('\n');
  }

  formatFallbackAnswer(results: MuseToolExecution[]) {
    const lines = ['共享运行时工具已执行，但当前 AI 模型暂时不可用，我先把已完成的结果返回：'];
    for (const item of results) {
      if (!item.ok) {
        lines.push(`- ${item.call.tool} 失败：${item.error || 'unknown error'}`);
        continue;
      }
      if (item.uiAction?.type === 'open_path') {
        lines.push(`- 已请求打开 ${item.uiAction.label || item.uiAction.path}：${item.uiAction.path}`);
      } else if (item.call.tool === 'mail.recent') {
        const mails = Array.isArray(item.result) ? item.result : [];
        lines.push(`- 最近邮件 ${mails.length} 封：${mails.slice(0, 5).map((mail: any) => mail.subject || '(无主题)').join('；') || '暂无缓存邮件'}`);
      } else if (item.call.tool === 'notion.search') {
        const pages = Array.isArray(item.result?.pages) ? item.result.pages : [];
        const databases = Array.isArray(item.result?.databases) ? item.result.databases : [];
        if (pages.length === 0 && databases.length === 0) {
          lines.push(`- Notion 搜索未找到匹配结果：${item.result?.query || item.call.args?.query || ''}`.trim());
          continue;
        }
        lines.push(`- Notion 搜索「${item.result?.query || item.call.args?.query || ''}」命中 ${pages.length} 个页面、${databases.length} 个数据库。`);
        if (pages.length > 0) {
          lines.push(...pages.slice(0, 5).map((page: any, index: number) => {
            const edited = page?.last_edited_time ? ` · 最近编辑 ${String(page.last_edited_time).slice(0, 10)}` : '';
            return `  ${index + 1}. ${page?.title || '(无标题)'}${edited}`;
          }));
        }
        if (databases.length > 0) {
          lines.push(`  数据库：${databases.slice(0, 3).map((database: any) => database?.title || '(无标题数据库)').join('；')}`);
        }
      } else if (item.call.tool === 'notion.page.read') {
        const page = item.result?.page;
        if (!page) {
          lines.push('- Notion 页面正文读取完成，但没有返回页面详情。');
          continue;
        }
        lines.push(`- 已读取 Notion 页面《${page.title || '(无标题)'}》：共 ${item.result?.blockCount || 0} 个内容块。`);
        if (Array.isArray(item.result?.outline) && item.result.outline.length > 0) {
          lines.push(`  结构：${item.result.outline.slice(0, 5).map((entry: any) => entry?.text || '').filter(Boolean).join('；') || '暂无结构化标题'}`);
        }
        if (item.result?.textExcerpt) {
          lines.push(`  摘要：${clip(item.result.textExcerpt, 220)}`);
        }
      } else if (item.call.tool === 'notion.article.brief') {
        const article = item.result?.article;
        if (!article) {
          lines.push('- Notion 导读已生成，但没有返回文章详情。');
          continue;
        }
        lines.push(`- 已生成 Notion 页面《${article.title || '(无标题)'}》的导读。`);
        if (article?.summary) {
          lines.push(`  速读：${clip(article.summary, 220)}`);
        }
        if (Array.isArray(article?.keyPoints) && article.keyPoints.length > 0) {
          lines.push(`  关键点：${article.keyPoints.slice(0, 4).map((point: any) => typeof point === 'string' ? point : point?.text || '').filter(Boolean).join('；')}`);
        }
        if (Array.isArray(article?.readingHints) && article.readingHints.length > 0) {
          lines.push(`  阅读建议：${article.readingHints.slice(0, 3).join('；')}`);
        }
        if (!article?.summary && article?.openingParagraph) {
          lines.push(`  开头：${clip(article.openingParagraph, 180)}`);
        }
      } else if (item.call.tool === 'newspaper.article.read') {
        const article = item.result?.article;
        if (!article) {
          lines.push('- 当前新闻文章已读取，但没有返回正文详情。');
          continue;
        }
        lines.push(`- 已读取新闻文章《${article.titleZh || article.title || '(无标题)'}》。`);
        if (article.summaryZh || article.summary) {
          lines.push(`  摘要：${clip(article.summaryZh || article.summary, 220)}`);
        }
        if (article.fulltextStatus !== 'ready') {
          lines.push(`  正文状态：${article.statusMessage || article.fulltextStatus}`);
        }
        if (article.replyCount) {
          lines.push(`  讨论：${article.replyCount} 条回复`);
        }
        if (Array.isArray(article.images) && article.images.length > 0) {
          lines.push(`  图片：${article.images.length} 张`);
        }
      } else if (item.call.tool === 'newspaper.article.insight') {
        const article = item.result?.article;
        const insight = item.result?.insight;
        if (!article || !insight) {
          lines.push('- 当前新闻文章导读已生成，但没有返回完整结果。');
          continue;
        }
        lines.push(`- 已生成新闻文章《${article.titleZh || article.title || '(无标题)'}》的导读。`);
        if (insight.summary) {
          lines.push(`  导读：${clip(insight.summary, 220)}`);
        }
        if (Array.isArray(insight.takeaways) && insight.takeaways.length > 0) {
          lines.push(`  关键信号：${insight.takeaways.slice(0, 3).join('；')}`);
        }
        if (Array.isArray(insight.actions) && insight.actions.length > 0) {
          lines.push(`  建议动作：${insight.actions.slice(0, 3).join('；')}`);
        }
      } else if (item.call.tool === 'newspaper.briefing.insight') {
        const insight = item.result?.insight;
        if (!insight) {
          lines.push('- 报纸总编视角已生成，但没有返回摘要。');
          continue;
        }
        lines.push(`- 已生成报纸总编摘要：${clip(insight.headline || insight.summary, 120)}`);
        if (Array.isArray(insight.watchlist) && insight.watchlist.length > 0) {
          lines.push(`  关注点：${insight.watchlist.slice(0, 3).join('；')}`);
        }
        if (Array.isArray(insight.opportunities) && insight.opportunities.length > 0) {
          lines.push(`  机会：${insight.opportunities.slice(0, 3).join('；')}`);
        }
      } else if (item.call.tool === 'muse.workspace_summary') {
        lines.push(`- 工作台：${item.result?.summary || item.result?.headline || '已读取'}`);
      } else if (item.call.tool === 'workspace.summary') {
        lines.push(`- 已读取工作区摘要：根目录 ${item.result?.root || WORKSPACE_ROOT}`);
      } else if (item.call.tool === 'workspace.read_file') {
        lines.push(`- 已读取文件 ${item.result?.path || ''} 第 ${item.result?.startLine || '?'}-${item.result?.endLine || '?'} 行。`);
      } else if (item.call.tool === 'workspace.search') {
        lines.push(`- 已搜索工作区，命中 ${item.result?.matches?.length || 0} 条。`);
      } else if (item.call.tool === 'workspace.write_file' || item.call.tool === 'workspace.replace_in_file') {
        lines.push(`- 已修改文件 ${item.result?.path || ''}。`);
      } else if (item.call.tool === 'workspace.run_command') {
        lines.push(`- 已执行命令 ${item.result?.command || ''}。`);
      } else if (Array.isArray(item.result)) {
        lines.push(`- ${item.call.tool} 返回 ${item.result.length} 条结果。`);
      } else {
        lines.push(`- ${item.call.tool} 已完成。`);
      }
    }
    return lines.join('\n');
  }

  private async executeCall(call: MuseToolCall): Promise<MuseToolExecution> {
    const args = call.args || {};

    if (call.tool === 'muse.workspace_summary') {
      const workspace = await osService.getWorkspace();
      return {
        call,
        ok: true,
        result: {
          generatedAt: workspace.generatedAt,
          headline: workspace.today.headline,
          summary: workspace.today.summary,
          stats: workspace.stats,
          priorities: workspace.today.priorities.slice(0, 8),
          alerts: workspace.alerts.slice(0, 8),
          memory: workspace.memory.slice(0, 8),
        },
      };
    }

    if (call.tool === 'muse.refresh_workspace') {
      osService.invalidateWorkspace();
      const workspace = await osService.getWorkspace();
      return {
        call,
        ok: true,
        result: {
          generatedAt: workspace.generatedAt,
          headline: workspace.today.headline,
          summary: workspace.today.summary,
          stats: workspace.stats,
        },
      };
    }

    if (call.tool === 'muse.search') {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query is required');
      return { call, ok: true, result: await osService.search(query) };
    }

    if (call.tool === 'workspace.summary') {
      return { call, ok: true, result: buildWorkspaceSummary() };
    }

    if (call.tool === 'workspace.list_files') {
      return {
        call,
        ok: true,
        result: listWorkspaceEntries(
          args.path || '.',
          clampNumber(args.depth, 0, 5, 2),
          clampNumber(args.limit, 1, 200, 80)
        ),
      };
    }

    if (call.tool === 'workspace.read_file') {
      return {
        call,
        ok: true,
        result: readWorkspaceFile(
          args.path,
          clampNumber(args.start_line, 1, 200000, 1),
          clampNumber(args.end_line, 1, 200000, 220),
          clampNumber(args.max_chars, 200, 20000, 12000)
        ),
      };
    }

    if (call.tool === 'workspace.search') {
      return {
        call,
        ok: true,
        result: searchWorkspaceText(
          String(args.query || ''),
          args.path || '.',
          clampNumber(args.limit, 1, 100, 20)
        ),
      };
    }

    if (call.tool === 'workspace.write_file') {
      return {
        call,
        ok: true,
        result: writeWorkspaceFile(args.path, args.content, String(args.mode || 'overwrite')),
      };
    }

    if (call.tool === 'workspace.replace_in_file') {
      return {
        call,
        ok: true,
        result: replaceInWorkspaceFile(args.path, args.search, args.replace, toFlag(args.all)),
      };
    }

    if (call.tool === 'workspace.run_command') {
      return {
        call,
        ok: true,
        result: await runWorkspaceCommand(
          args.command,
          args.cwd || '.',
          clampNumber(args.timeout_ms, 1000, 180000, 60000)
        ),
      };
    }

    if (call.tool === 'dashboard.summary') {
      const stats = dashboardService.getStats();
      return {
        call,
        ok: true,
        result: {
          totalAccounts: stats.totalAccounts,
          activeAccounts: stats.activeAccounts,
          totalInboxMails: stats.totalInboxMails,
          totalJunkMails: stats.totalJunkMails,
          totalProxies: stats.totalProxies,
          activeProxies: stats.activeProxies,
          expiringTokens: stats.expiringTokens,
          errorAccounts: stats.errorAccounts,
          unusedAccounts: stats.unusedAccounts,
          providerStats: stats.providerStats,
          statusStats: stats.statusStats,
          proxyStatusStats: stats.proxyStatusStats,
          topMailAccounts: stats.topMailAccounts.slice(0, 8),
          recentMails: stats.recentMails.map(sanitizeMail),
        },
      };
    }

    if (call.tool === 'muse.open') {
      const path = normalizeAppPath(args.path || args.pathname || args.url || args.route || args.target);
      return {
        call,
        ok: true,
        result: { opened: path, label: args.label || '' },
        uiAction: { type: 'open_path', path, label: args.label || path },
      };
    }

    if (call.tool === 'accounts.list') {
      const pageSize = clampNumber(args.pageSize, 1, 100, 20);
      const data = accountModel.list(1, pageSize, String(args.search || ''));
      return { call, ok: true, result: { ...data, list: data.list.map(sanitizeAccount) } };
    }

    if (call.tool === 'accounts.create') {
      const email = String(args.email || '').trim();
      if (!email) throw new Error('email is required');
      const created = accountModel.create({
        provider: String(args.provider || 'microsoft') as any,
        mode: String(args.mode || 'long_term') as any,
        email,
        password: String(args.password || ''),
        client_id: String(args.client_id || ''),
        client_secret: String(args.client_secret || ''),
        refresh_token: String(args.refresh_token || ''),
        custom_imap_host: String(args.custom_imap_host || ''),
        custom_imap_port: args.custom_imap_port ? Number(args.custom_imap_port) : undefined,
        custom_smtp_host: String(args.custom_smtp_host || ''),
        custom_smtp_port: args.custom_smtp_port ? Number(args.custom_smtp_port) : undefined,
        custom_smtp_secure: args.custom_smtp_secure === undefined ? undefined : (toFlag(args.custom_smtp_secure, true) ? 1 : 0),
        custom_domain: String(args.custom_domain || ''),
        remark: String(args.remark || ''),
      });
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeAccount(created) };
    }

    if (call.tool === 'accounts.update') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = accountModel.update(id, {
        provider: args.provider,
        mode: args.mode,
        email: args.email,
        password: args.password,
        client_id: args.client_id,
        client_secret: args.client_secret,
        refresh_token: args.refresh_token,
        remark: args.remark,
        status: args.status,
        token_refreshed_at: args.token_refreshed_at,
        custom_imap_host: args.custom_imap_host,
        custom_imap_port: args.custom_imap_port === undefined ? undefined : Number(args.custom_imap_port),
        custom_smtp_host: args.custom_smtp_host,
        custom_smtp_port: args.custom_smtp_port === undefined ? undefined : Number(args.custom_smtp_port),
        custom_smtp_secure: args.custom_smtp_secure === undefined ? undefined : (toFlag(args.custom_smtp_secure, true) ? 1 : 0),
        custom_domain: args.custom_domain,
      });
      if (!updated) throw new Error('account not found');
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeAccount(updated) };
    }

    if (call.tool === 'accounts.delete') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const deleted = accountModel.delete(id);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { deleted } };
    }

    if (call.tool === 'entities.list') {
      const limit = clampNumber(args.limit, 1, 50, 20);
      const workspace = await osService.getWorkspace();
      return { call, ok: true, result: workspace.entities.slice(0, limit) };
    }

    if (call.tool === 'agent.autonomy.state') {
      return { call, ok: true, result: agentAutonomyService.getState() };
    }

    if (call.tool === 'agent.autonomy.run') {
      return { call, ok: true, result: await agentAutonomyService.runNow({ force: true }) };
    }

    if (call.tool === 'agent.profile.list') {
      return { call, ok: true, result: agentAutonomyService.listProfile() };
    }

    if (call.tool === 'agent.profile.upsert') {
      const key = String(args.key || '').trim();
      const value = String(args.value || '').trim();
      if (!key || !value) throw new Error('key and value are required');
      return {
        call,
        ok: true,
        result: agentAutonomyService.upsertProfileMemory({
          key,
          value,
          category: args.category,
          confidence: args.confidence === undefined ? undefined : Number(args.confidence),
          source: 'ai',
        }),
      };
    }

    if (call.tool === 'agent.skills.list') {
      return { call, ok: true, result: agentAutonomyService.listSkills(clampNumber(args.limit, 1, 30, 12)) };
    }

    if (call.tool === 'memory.list') {
      const limit = clampNumber(args.limit, 1, 50, 20);
      const pinnedOnly = toFlag(args.pinned_only);
      const list = osService.listMemory()
        .filter((item) => !pinnedOnly || !!item.is_pinned)
        .slice(0, limit);
      return { call, ok: true, result: list };
    }

    if (call.tool === 'memory.update') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = osService.updateMemory(id, {
        title: args.title,
        content: args.content,
        kind: args.kind,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        source: args.source,
        entity_type: args.entity_type,
        entity_key: args.entity_key,
        is_pinned: args.is_pinned === undefined ? undefined : (toFlag(args.is_pinned) ? 1 : 0),
        is_resolved: args.is_resolved === undefined ? undefined : (toFlag(args.is_resolved) ? 1 : 0),
        last_reviewed_at: args.last_reviewed_at,
      });
      if (!updated) throw new Error('memory not found');
      return { call, ok: true, result: updated };
    }

    if (call.tool === 'memory.delete') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      return { call, ok: true, result: { deleted: osService.deleteMemory(id) } };
    }

    if (call.tool === 'ai_accounts.list') {
      return { call, ok: true, result: aiAccountModel.list().map(sanitizeAiAccount) };
    }

    if (call.tool === 'ai_accounts.create') {
      const created = aiAccountModel.create({
        provider: args.provider,
        auth_mode: args.auth_mode,
        name: String(args.name || ''),
        api_key: String(args.api_key || ''),
        base_url: String(args.base_url || ''),
        model: String(args.model || ''),
        priority_rank: Number(args.priority_rank || 1) || 1,
        oauth_client_id: String(args.oauth_client_id || ''),
        oauth_client_secret: String(args.oauth_client_secret || ''),
        oauth_refresh_token: String(args.oauth_refresh_token || ''),
        oauth_email: String(args.oauth_email || ''),
        oauth_project_id: String(args.oauth_project_id || ''),
        system_prompt: String(args.system_prompt || ''),
        remark: String(args.remark || ''),
        status: String(args.status || 'active') as any,
      });
      return { call, ok: true, result: sanitizeAiAccount(created) };
    }

    if (call.tool === 'ai_accounts.update') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = aiAccountModel.update(id, {
        provider: args.provider,
        auth_mode: args.auth_mode,
        name: args.name,
        api_key: args.api_key,
        base_url: args.base_url,
        model: args.model,
        priority_rank: args.priority_rank === undefined ? undefined : Number(args.priority_rank),
        oauth_client_id: args.oauth_client_id,
        oauth_client_secret: args.oauth_client_secret,
        oauth_refresh_token: args.oauth_refresh_token,
        oauth_email: args.oauth_email,
        oauth_project_id: args.oauth_project_id,
        system_prompt: args.system_prompt,
        remark: args.remark,
        status: args.status,
      });
      if (!updated) throw new Error('AI account not found');
      return { call, ok: true, result: sanitizeAiAccount(updated) };
    }

    if (call.tool === 'ai_accounts.test') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const account = aiAccountModel.getById(id);
      if (!account) throw new Error('AI account not found');
      const { AiChatService } = require('./AiChatService');
      const result = await new AiChatService().testConnection(account);
      aiAccountModel.updateDiagnostics(id, result);
      return { call, ok: true, result };
    }

    if (call.tool === 'ai_accounts.delete') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      return { call, ok: true, result: { deleted: aiAccountModel.delete(id) } };
    }

    if (call.tool === 'tokens.list') {
      return { call, ok: true, result: tokenAccountModel.list().map(sanitizeTokenAccount) };
    }

    if (call.tool === 'tokens.create') {
      const created = tokenAccountModel.create({
        provider: args.provider,
        auth_method: args.auth_method,
        name: String(args.name || ''),
        session_format: args.session_format,
        login_hint: String(args.login_hint || ''),
        external_account_id: String(args.external_account_id || ''),
        analytics_url: String(args.analytics_url || ''),
        session_payload: String(args.session_payload || ''),
        access_token: String(args.access_token || ''),
        refresh_token: String(args.refresh_token || ''),
        id_token: String(args.id_token || ''),
        user_agent: String(args.user_agent || ''),
        api_key: String(args.api_key || ''),
        api_base_url: String(args.api_base_url || ''),
        api_model: String(args.api_model || ''),
        api_model_provider: String(args.api_model_provider || ''),
        api_reasoning_effort: String(args.api_reasoning_effort || ''),
        api_wire_api: String(args.api_wire_api || ''),
        note: String(args.note || ''),
        status: String(args.status || 'inactive') as any,
        auto_sync_enabled: toFlag(args.auto_sync_enabled, true) ? 1 : 0,
      });
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeTokenAccount(created) };
    }

    if (call.tool === 'tokens.update') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = tokenAccountModel.update(id, {
        provider: args.provider,
        auth_method: args.auth_method,
        name: args.name,
        session_format: args.session_format,
        login_hint: args.login_hint,
        external_account_id: args.external_account_id,
        analytics_url: args.analytics_url,
        session_payload: args.session_payload,
        access_token: args.access_token,
        refresh_token: args.refresh_token,
        id_token: args.id_token,
        user_agent: args.user_agent,
        api_key: args.api_key,
        api_base_url: args.api_base_url,
        api_model: args.api_model,
        api_model_provider: args.api_model_provider,
        api_reasoning_effort: args.api_reasoning_effort,
        api_wire_api: args.api_wire_api,
        note: args.note,
        status: args.status,
        auto_sync_enabled: args.auto_sync_enabled === undefined ? undefined : (toFlag(args.auto_sync_enabled) ? 1 : 0),
      });
      if (!updated) throw new Error('token account not found');
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeTokenAccount(updated) };
    }

    if (call.tool === 'tokens.sync') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const account = tokenAccountModel.getById(id);
      if (!account) throw new Error('token account not found');
      const snapshot = await tokenQuotaService.syncAccount(account);
      tokenAccountModel.saveSyncResult(id, 'active', '', snapshot);
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeTokenAccount(tokenAccountModel.getById(id)!) };
    }

    if (call.tool === 'tokens.sync_all') {
      const results = [];
      for (const item of tokenAccountModel.list()) {
        try {
          const snapshot = await tokenQuotaService.syncAccount(item);
          tokenAccountModel.saveSyncResult(item.id, 'active', '', snapshot);
        } catch (error: any) {
          tokenAccountModel.saveSyncResult(item.id, 'error', error?.message || 'sync failed', null);
        }
        const updated = tokenAccountModel.getById(item.id);
        if (updated) results.push(sanitizeTokenAccount(updated));
      }
      osService.invalidateWorkspace();
      return { call, ok: true, result: results };
    }

    if (call.tool === 'tokens.delete') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const deleted = tokenAccountModel.delete(id);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { deleted } };
    }

    if (call.tool === 'proxy.list') {
      return { call, ok: true, result: proxyModel.list().map(sanitizeProxy) };
    }

    if (call.tool === 'proxy.create') {
      const created = proxyModel.create({
        name: String(args.name || ''),
        type: String(args.type || 'http') as any,
        host: String(args.host || ''),
        port: Number(args.port),
        username: String(args.username || ''),
        password: String(args.password || ''),
        is_default: toFlag(args.is_default),
        is_enabled: args.is_enabled === undefined ? true : toFlag(args.is_enabled, true),
      });
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeProxy(created) };
    }

    if (call.tool === 'proxy.update') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = proxyModel.update(id, {
        name: args.name,
        type: args.type,
        host: args.host,
        port: args.port === undefined ? undefined : Number(args.port),
        username: args.username,
        password: args.password,
        is_default: args.is_default === undefined ? undefined : toFlag(args.is_default),
        is_enabled: args.is_enabled === undefined ? undefined : toFlag(args.is_enabled),
      });
      if (!updated) throw new Error('proxy not found');
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeProxy(updated) };
    }

    if (call.tool === 'proxy.test') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const proxy = proxyModel.getById(id);
      if (!proxy) throw new Error('proxy not found');
      const result = await proxyService.testProxy(proxy);
      proxyModel.updateTestResult(id, result.ip, result.status);
      osService.invalidateWorkspace();
      return { call, ok: true, result };
    }

    if (call.tool === 'proxy.set_default') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = proxyModel.setDefault(id);
      if (!updated) throw new Error('proxy not found');
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeProxy(updated) };
    }

    if (call.tool === 'proxy.set_enabled') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const updated = proxyModel.setEnabled(id, toFlag(args.enabled, true));
      if (!updated) throw new Error('proxy not found');
      osService.invalidateWorkspace();
      return { call, ok: true, result: sanitizeProxy(updated) };
    }

    if (call.tool === 'proxy.delete') {
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      const deleted = proxyModel.delete(id);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { deleted } };
    }

    if (call.tool === 'github.summary') {
      const record = this.getGitHubRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, repos: [], pulls: [], issues: [] } };
      }
      const data = await integrationService.fetchGitHubData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          tokenMasked: getMaskedText(data.tokenMasked),
          lastSyncAt: data.lastSyncAt,
          profile: data.profile ? {
            login: data.profile.login,
            name: data.profile.name,
            public_repos: data.profile.public_repos,
            followers: data.profile.followers,
            following: data.profile.following,
          } : null,
          repoCount: data.repos.length,
          pullCount: data.pulls.length,
          issueCount: data.issues.length,
          releaseCount: data.releases.length,
          repos: data.repos.slice(0, 10),
          pulls: data.pulls.slice(0, 10),
          issues: data.issues.slice(0, 10),
          releases: data.releases.slice(0, 10),
        },
      };
    }

    if (call.tool === 'cloudflare.summary') {
      const record = this.getCloudflareRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, zones: [], pagesProjects: [] } };
      }
      const data = await integrationService.fetchCloudflareData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          tokenMasked: getMaskedText(data.tokenMasked),
          lastSyncAt: data.lastSyncAt,
          user: data.user ? { email: data.user.email, username: data.user.username } : null,
          accountCount: data.accounts.length,
          zoneCount: data.zones.length,
          pagesProjectCount: data.pagesProjects.length,
          workerScriptCount: data.workerScripts.length,
          rulesetCount: data.rulesets.length,
          zones: data.zones.slice(0, 12),
          pagesProjects: data.pagesProjects.slice(0, 12),
          workerScripts: data.workerScripts.slice(0, 12),
        },
      };
    }

    if (call.tool === 'notion.summary') {
      const record = this.getNotionRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, pages: [], databases: [] } };
      }
      const data = await integrationService.fetchNotionData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          tokenMasked: getMaskedText(data.tokenMasked),
          lastSyncAt: data.lastSyncAt,
          bot: data.bot ? { id: data.bot.id, name: data.bot.name } : null,
          metrics: data.metrics,
          pages: data.pages.slice(0, 12),
          databases: data.databases.slice(0, 12),
        },
      };
    }

    if (call.tool === 'notion.search') {
      const record = this.getNotionRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, query: String(args.query || ''), pages: [], databases: [] } };
      }

      const query = String(args.query || '').trim();
      const limit = clampNumber(args.limit, 1, 20, 8);
      const includeDatabases = toFlag(args.include_databases, true);
      const data = await integrationService.fetchNotionData(record);
      const tokens = tokenizeSearchQuery(query);

      const scoreItem = (haystacks: unknown[]) => {
        const normalizedHaystack = haystacks.map((item) => normalizeSearchText(item)).filter(Boolean);
        if (!tokens.length) return 1;
        let score = 0;
        for (const token of tokens) {
          if (normalizedHaystack.some((value) => value === token)) score += 8;
          else if (normalizedHaystack.some((value) => value.includes(token))) score += 3;
        }
        return score;
      };

      const pages = data.pages
        .map((page) => ({
          ...page,
          score: scoreItem([
            page.title,
            page.url,
            page.parent?.type,
            Object.keys(page.propertiesPreview || {}).join(' '),
            Object.values(page.propertiesPreview || {}).join(' '),
          ]),
        }))
        .filter((page) => page.score > 0)
        .sort((a, b) => b.score - a.score || new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime())
        .slice(0, limit)
        .map(({ score, ...page }) => page);

      const databases = includeDatabases
        ? data.databases
            .map((database) => ({
              ...database,
              score: scoreItem([
                database.title,
                database.description,
                database.url,
                Object.keys(database.properties || {}).join(' '),
              ]),
            }))
            .filter((database) => database.score > 0)
            .sort((a, b) => b.score - a.score || new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime())
            .slice(0, limit)
            .map(({ score, ...database }) => database)
        : [];

      return {
        call,
        ok: true,
        result: {
          connected: true,
          query,
          totalPages: data.pages.length,
          totalDatabases: data.databases.length,
          pages,
          databases,
        },
      };
    }

    if (call.tool === 'notion.page.read') {
      const record = this.getNotionRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, page: null, blocks: [] } };
      }

      let pageId = String(args.pageId || '').trim();
      if (!pageId) {
        const query = String(args.query || '').trim();
        if (!query) throw new Error('pageId or query is required');
        const data = await integrationService.fetchNotionData(record);
        const tokens = tokenizeSearchQuery(query);
        const match = data.pages
          .map((page) => ({
            page,
            score: tokens.reduce((sum, token) => {
              const title = normalizeSearchText(page.title);
              const preview = normalizeSearchText(Object.values(page.propertiesPreview || {}).join(' '));
              if (title === token) return sum + 8;
              if (title.includes(token)) return sum + 4;
              if (preview.includes(token)) return sum + 2;
              return sum;
            }, 0),
          }))
          .sort((a, b) => b.score - a.score || new Date(b.page.last_edited_time).getTime() - new Date(a.page.last_edited_time).getTime())[0];
        if (!match?.page?.id || match.score <= 0) throw new Error('未找到匹配的 Notion 页面');
        pageId = match.page.id;
      }

      const content = await integrationService.fetchNotionPageContent(record, pageId);
      const flattenedBlocks = flattenNotionBlocks(content.blocks);

      return {
        call,
        ok: true,
        result: {
          connected: true,
          page: content.page,
          blockCount: flattenedBlocks.length,
          outline: buildNotionOutline(content.blocks, 10),
          textExcerpt: buildNotionTextExcerpt(content.blocks, 3600),
          blocks: flattenedBlocks.slice(0, 80).map((block) => ({
            id: block.id,
            type: block.type,
            text: clip(block.text, 240),
            depth: block.depth,
            has_children: block.has_children,
          })),
        },
      };
    }

    if (call.tool === 'notion.article.brief') {
      const record = this.getNotionRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, article: null } };
      }

      let pageId = String(args.pageId || '').trim();
      if (!pageId) {
        const query = String(args.query || '').trim();
        if (!query) throw new Error('pageId or query is required');
        const data = await integrationService.fetchNotionData(record);
        const tokens = tokenizeSearchQuery(query);
        const bestPage = data.pages
          .map((page) => ({
            page,
            score: tokens.reduce((sum, token) => {
              const combined = normalizeSearchText([page.title, Object.values(page.propertiesPreview || {}).join(' ')].join(' '));
              if (combined.includes(token)) return sum + 3;
              return sum;
            }, 0),
          }))
          .sort((a, b) => b.score - a.score || new Date(b.page.last_edited_time).getTime() - new Date(a.page.last_edited_time).getTime())[0];
        if (!bestPage?.page?.id || bestPage.score <= 0) throw new Error('未找到适合生成导读的 Notion 页面');
        pageId = bestPage.page.id;
      }

      const focus = String(args.focus || '').trim();
      const content = await integrationService.fetchNotionPageContent(record, pageId);
      const flattenedBlocks = flattenNotionBlocks(content.blocks);
      const paragraphBlocks = flattenedBlocks
        .filter((block) => block.text?.trim())
        .map((block) => block.text.trim());

      return {
        call,
        ok: true,
        result: {
          connected: true,
          article: {
            id: content.page.id,
            title: content.page.title,
            url: content.page.url,
            lastEditedAt: content.page.last_edited_time,
            focus: focus || null,
            propertyPreview: content.page.propertiesPreview || {},
            readingHints: [
              '先看标题和大纲，判断文章试图解决什么问题。',
              '再看关键段落和列表项，抓住作者的结论、方法和例子。',
              '最后结合 focus 角度，输出适合当前任务的导读、摘要或推荐读法。',
            ],
            outline: buildNotionOutline(content.blocks, 12),
            keyPoints: paragraphBlocks.slice(0, 6).map((text, index) => ({
              index: index + 1,
              text: clip(text, 220),
            })),
            openingParagraph: paragraphBlocks[0] ? clip(paragraphBlocks[0], 320) : '',
            excerptText: buildNotionTextExcerpt(content.blocks, 4200),
            blockCount: flattenedBlocks.length,
          },
        },
      };
    }

    if (call.tool === 'subscriptions.summary') {
      const record = this.getMiSubRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, misubs: [], profiles: [] } };
      }
      const data = await integrationService.fetchMiSubData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          baseUrl: data.baseUrl,
          passwordMasked: data.passwordMasked,
          lastSyncAt: data.lastSyncAt,
          subscriptionCount: data.misubs.length,
          profileCount: data.profiles.length,
          settings: data.settings,
          misubs: data.misubs.slice(0, 20),
          profiles: data.profiles.slice(0, 20),
        },
      };
    }

    if (call.tool === 'ymail.summary') {
      const record = this.getYmailRecord();
      if (!record) {
        return { call, ok: true, result: { connected: false, addresses: [] } };
      }
      const data = await ymailService.fetchIntegrationData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          tokenMasked: getMaskedText(data.tokenMasked),
          lastSyncAt: data.lastSyncAt,
          siteUrl: data.siteUrl,
          apiBaseUrl: data.apiBaseUrl,
          addressCount: data.addressCount,
          statistics: data.statistics,
          addresses: data.addresses.slice(0, 20),
        },
      };
    }

    if (call.tool === 'linuxdo.summary') {
      const record = integrationTokenModel.get('linuxdo');
      if (!record) {
        return {
          call,
          ok: true,
          result: {
            connected: false,
            clientConfigured: !!config.linuxDoClientId && !!config.linuxDoClientSecret,
            user: null,
            scopes: [],
          },
        };
      }
      const data = await integrationService.fetchLinuxDoData(record);
      return {
        call,
        ok: true,
        result: {
          connected: data.connected,
          clientConfigured: data.clientConfigured,
          tokenMasked: getMaskedText(data.tokenMasked),
          lastSyncAt: data.lastSyncAt,
          expiresAt: data.expiresAt,
          scopes: data.scopes,
          user: data.user ? {
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            active: data.user.active,
            trust_level: data.user.trust_level,
            avatar_url: data.user.avatar_url,
            silenced: data.user.silenced,
          } : null,
        },
      };
    }

    if (call.tool === 'integrations.sync') {
      const provider = String(args.provider || '').trim().toLowerCase();
      if (!provider) throw new Error('provider is required');

      if (provider === 'github') {
        const record = this.getGitHubRecord();
        if (!record) throw new Error('GitHub 尚未连接');
        const updated = integrationTokenModel.upsert('github', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await integrationService.fetchGitHubData(updated, { force: true }) };
      }

      if (provider === 'cloudflare') {
        const record = this.getCloudflareRecord();
        if (!record) throw new Error('Cloudflare 尚未连接');
        const updated = integrationTokenModel.upsert('cloudflare', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await integrationService.fetchCloudflareData(updated, { force: true }) };
      }

      if (provider === 'notion') {
        const record = this.getNotionRecord();
        if (!record) throw new Error('Notion 尚未连接');
        const updated = integrationTokenModel.upsert('notion', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await integrationService.fetchNotionData(updated, { force: true }) };
      }

      if (provider === 'misub') {
        const record = this.getMiSubRecord();
        if (!record) throw new Error('MiSub 尚未连接');
        const updated = integrationTokenModel.upsert('misub', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await integrationService.fetchMiSubData(updated, { force: true }) };
      }

      if (provider === 'ymail') {
        const record = this.getYmailRecord();
        if (!record) throw new Error('Ymail 尚未连接');
        await ymailService.validateAdminPassword(record.token);
        const updated = integrationTokenModel.upsert('ymail', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await ymailService.fetchIntegrationData(updated, { force: true }) };
      }

      if (provider === 'linuxdo') {
        const record = integrationTokenModel.get('linuxdo');
        if (!record) throw new Error('Linux.do 尚未连接');
        const updated = integrationTokenModel.upsert('linuxdo', record.token);
        osService.invalidateWorkspace();
        return { call, ok: true, result: await integrationService.fetchLinuxDoData(updated, { force: true }) };
      }

      throw new Error(`unsupported integration provider: ${provider}`);
    }

    if (call.tool === 'integrations.disconnect') {
      const provider = String(args.provider || '').trim().toLowerCase();
      if (!provider) throw new Error('provider is required');
      if (!['github', 'cloudflare', 'notion', 'misub', 'ymail', 'linuxdo'].includes(provider)) {
        throw new Error(`unsupported integration provider: ${provider}`);
      }
      osService.invalidateWorkspace();
      return { call, ok: true, result: { disconnected: integrationTokenModel.delete(provider as any) } };
    }

    if (call.tool === 'ymail.address.create') {
      const record = this.getYmailRecord();
      if (!record) throw new Error('Ymail 尚未连接');
      const name = String(args.name || '').trim();
      const domain = String(args.domain || '').trim();
      if (!name || !domain) throw new Error('name and domain are required');
      const result = await ymailService.createAddress(record.token, {
        name,
        domain,
        enablePrefix: toFlag(args.enablePrefix, true),
        enableRandomSubdomain: toFlag(args.enableRandomSubdomain),
      });
      ymailService.invalidateIntegrationData(record);
      osService.invalidateWorkspace();
      return { call, ok: true, result };
    }

    if (call.tool === 'ymail.address.delete') {
      const record = this.getYmailRecord();
      if (!record) throw new Error('Ymail 尚未连接');
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      await ymailService.deleteAddress(record.token, id);
      ymailService.invalidateIntegrationData(record);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { deleted: true, id } };
    }

    if (call.tool === 'ymail.inbox.clear') {
      const record = this.getYmailRecord();
      if (!record) throw new Error('Ymail 尚未连接');
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      await ymailService.clearInbox(record.token, id);
      ymailService.invalidateIntegrationData(record);
      ymailService.invalidateAddressMails(record, id);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { cleared: true, box: 'inbox', id } };
    }

    if (call.tool === 'ymail.sent.clear') {
      const record = this.getYmailRecord();
      if (!record) throw new Error('Ymail 尚未连接');
      const id = Number(args.id);
      if (!id) throw new Error('id is required');
      await ymailService.clearSentItems(record.token, id);
      ymailService.invalidateIntegrationData(record);
      ymailService.invalidateAddressMails(record, id);
      osService.invalidateWorkspace();
      return { call, ok: true, result: { cleared: true, box: 'sent', id } };
    }

    if (call.tool === 'newspaper.summary') {
      const limit = clampNumber(args.limit, 1, 12, 6);
      const briefing = await getNewspaperService().getBriefing({ limit });
      return {
        call,
        ok: true,
        result: {
          generatedAt: briefing.generatedAt,
          totalItems: briefing.totalItems,
          totalSources: briefing.totalSources,
          sections: briefing.sections.map((section) => ({
            id: section.id,
            title: section.title,
            titleEn: section.titleEn,
            status: section.status,
            totalItems: section.totalItems,
            failedSources: section.failedSources,
            items: section.items.slice(0, limit),
          })),
        },
      };
    }

    if (call.tool === 'newspaper.briefing.insight') {
      const insight = await getNewspaperService().generateBriefingInsight({
        query: String(args.query || '').trim(),
        limit: clampNumber(args.limit, 1, 12, 6),
      });
      return {
        call,
        ok: true,
        result: {
          insight: {
            accountId: insight.accountId,
            accountName: insight.accountName,
            model: insight.model,
            headline: insight.headline,
            summary: insight.summary,
            watchlist: insight.watchlist,
            opportunities: insight.opportunities,
            sections: insight.sections,
            generatedAt: insight.generatedAt,
          },
        },
      };
    }

    if (call.tool === 'newspaper.article.read') {
      const url = String(args.url || '').trim();
      if (!url) throw new Error('url is required');
      const seed = {
        url,
        source: String(args.source || '').trim(),
        sourceUrl: String(args.sourceUrl || '').trim(),
        publishedAt: String(args.publishedAt || '').trim() || null,
        title: String(args.title || '').trim(),
        titleZh: String(args.titleZh || '').trim(),
        summary: String(args.summary || '').trim(),
        summaryZh: String(args.summaryZh || '').trim(),
      };
      const article = await getNewspaperService().getArticleDetail(seed);
      return {
        call,
        ok: true,
        result: {
          article: {
            url: article.url,
            source: article.source,
            domain: article.domain,
            sourceUrl: article.sourceUrl,
            publishedAt: article.publishedAt,
            title: article.title,
            titleZh: article.titleZh,
            summary: clip(article.summary, 600),
            summaryZh: clip(article.summaryZh, 600),
            originalContent: clip(article.originalContent, 12000),
            translatedContent: clip(article.translatedContent, 12000),
            coverImage: article.coverImage,
            images: (article.images || []).slice(0, 8),
            replies: (article.replies || []).slice(0, 8),
            replyCount: article.replyCount,
            extractedAt: article.extractedAt,
            translationMode: article.translationMode,
            fulltextStatus: article.fulltextStatus,
            imageStatus: article.imageStatus,
            replyStatus: article.replyStatus,
            translationStatus: article.translationStatus,
            statusMessage: article.statusMessage,
            nextRetryAt: article.nextRetryAt,
          },
        },
      };
    }

    if (call.tool === 'newspaper.article.insight') {
      const url = String(args.url || '').trim();
      if (!url) throw new Error('url is required');
      const seed = {
        url,
        source: String(args.source || '').trim(),
        sourceUrl: String(args.sourceUrl || '').trim(),
        publishedAt: String(args.publishedAt || '').trim() || null,
        title: String(args.title || '').trim(),
        titleZh: String(args.titleZh || '').trim(),
        summary: String(args.summary || '').trim(),
        summaryZh: String(args.summaryZh || '').trim(),
      };
      const [article, insight] = await Promise.all([
        getNewspaperService().getArticleDetail(seed),
        getNewspaperService().generateArticleInsight(seed),
      ]);
      return {
        call,
        ok: true,
        result: {
          article: {
            url: article.url,
            source: article.source,
            title: article.title,
            titleZh: article.titleZh,
            summary: clip(article.summary, 400),
            summaryZh: clip(article.summaryZh, 400),
            replyCount: article.replyCount,
            extractedAt: article.extractedAt,
          },
          insight: {
            accountId: insight.accountId,
            accountName: insight.accountName,
            model: insight.model,
            summary: insight.summary,
            takeaways: insight.takeaways,
            risks: insight.risks,
            questions: insight.questions,
            actions: insight.actions,
            generatedAt: insight.generatedAt,
          },
        },
      };
    }

    if (call.tool === 'mail.recent') {
      const limit = clampNumber(args.limit, 1, 30, 5);
      return {
        call,
        ok: true,
        result: (await mailService.getRecentMails(limit)).map(sanitizeMail),
      };
    }

    if (call.tool === 'mail.refresh_recent') {
      const limit = clampNumber(args.limit, 1, 20, 5);
      const proxyId = args.proxy_id === undefined || args.proxy_id === null ? undefined : Number(args.proxy_id);
      return { call, ok: true, result: (await mailService.refreshRecentMails(limit, proxyId)).map(sanitizeMail) };
    }

    if (call.tool === 'mail.search_cached') {
      const accountId = Number(args.account_id);
      if (!accountId) throw new Error('account_id is required');
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query is required');
      const pageSize = clampNumber(args.pageSize, 1, 20, 10);
      const data = await mailService.searchCachedMails(accountId, String(args.mailbox || 'INBOX'), query, 1, pageSize);
      return { call, ok: true, result: { ...data, list: data.list.map(sanitizeMail) } };
    }

    if (call.tool === 'memory.create') {
      const title = String(args.title || '').trim();
      const content = String(args.content || '').trim();
      if (!title || !content) throw new Error('title and content are required');
      return {
        call,
        ok: true,
        result: osService.createMemory({
          title,
          content,
          kind: ['note', 'project', 'risk', 'preference'].includes(args.kind) ? args.kind : 'note',
          tags: Array.isArray(args.tags) ? args.tags.map(String).slice(0, 10) : ['ai'],
          source: 'ai',
          entity_type: String(args.entity_type || ''),
          entity_key: String(args.entity_key || ''),
          is_pinned: args.is_pinned ? 1 : 0,
        }),
      };
    }

    if (call.tool === 'action.set_state') {
      const actionId = String(args.action_id || '').trim();
      if (!actionId) throw new Error('action_id is required');
      const status = ['done', 'muted', 'active'].includes(args.status) ? args.status : 'done';
      return { call, ok: true, result: osService.setActionState(actionId, status, String(args.note || 'AI 操作')) };
    }

    throw new Error(`Unsupported Muse tool: ${call.tool}`);
  }
}
