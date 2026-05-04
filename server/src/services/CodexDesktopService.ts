import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import db from '../database';
import { TokenAccountModel } from '../models/TokenAccount';
import { OpenAIAccountService } from './OpenAIAccountService';
import { refreshOpenAITokenAccount } from './TokenAccountRefreshService';
import type {
  CodexActivationEvent,
  CodexDesktopAutoSwitchDeferred,
  CodexDesktopActivationResult,
  CodexDesktopSettings,
  CodexDesktopStatus,
  CodexTokenSnapshotPoint,
  CodexUsageHistory,
  CodexUsageHistoryPoint,
  TokenAccount,
  TokenAnalyticsSnapshot,
} from '../types';

const tokenAccountModel = new TokenAccountModel();
const openAIAccountService = new OpenAIAccountService();
const AUTO_SWITCH_COOLDOWN_MS = 10 * 60 * 1000;
const AUTO_SWITCH_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;
const AUTO_SWITCH_MIN_IMPROVEMENT_PCT = 10;
const AUTO_SWITCH_THRESHOLD_BUFFER_PCT = 5;
const AUTO_SWITCH_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const AUTO_SWITCH_MAX_ATTEMPTS = 2;
const ACTIVE_ACCOUNT_MARKER_FILE = 'muse-codex-active-account.json';
const LOCAL_USAGE_CACHE_TTL_MS = 2 * 60 * 1000;

function decodeJwtPayload(token?: string): Record<string, any> | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function asIsoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeReadJson(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
  } catch {
    return {};
  }
}

function quotaValue(snapshot: TokenAnalyticsSnapshot | null | undefined, key: 'five_hour' | 'weekly') {
  const cards = snapshot?.cards || [];
  const card = key === 'five_hour'
    ? cards.find((item) => item.key === 'five_hour' || /5\s*小时|5-hour/i.test(item.label))
    : cards.find((item) => item.key === 'weekly' || /每周|weekly/i.test(item.label));
  return typeof card?.remainingPct === 'number' ? card.remainingPct : null;
}

function roundPct(value: number) {
  return Math.round(value * 100) / 100;
}

function parseSnapshot(raw?: string): TokenAnalyticsSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenAnalyticsSnapshot;
  } catch {
    return null;
  }
}

function normalizedStamp(value?: string | null) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFreshStamp(value?: string | null, maxAgeMs = AUTO_SWITCH_SNAPSHOT_MAX_AGE_MS) {
  const stamp = normalizedStamp(value);
  return stamp > 0 && Date.now() - stamp <= maxAgeMs;
}

function isRecentTimestamp(value?: string | null, windowMs = AUTO_SWITCH_COOLDOWN_MS) {
  const stamp = normalizedStamp(value);
  return stamp > 0 && Date.now() - stamp < windowMs;
}

function normalizeIdentity(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function hashToken(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function sameIdentity(left?: string | null, right?: string | null) {
  return normalizeIdentity(left) !== '' && normalizeIdentity(left) === normalizeIdentity(right);
}

type ActiveAccountMarker = {
  tokenAccountId: number;
  externalAccountId: string;
  loginHint: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  idTokenHash: string;
  createdAt: string;
};

type MatchResult = {
  account: TokenAccount | null;
  source: 'marker_token' | 'marker_identity' | 'token_hash' | 'identity_pair' | 'external_account_id' | 'email' | 'none';
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
  ambiguous: boolean;
  notes: string[];
};

export class CodexDesktopService {
  private localUsageCache = new Map<string, { createdAt: number; value: CodexUsageHistoryPoint[] }>();
  private localUsageRefreshes = new Set<string>();

  defaultCodexHome() {
    return path.join(os.homedir(), '.codex');
  }

  getSettings(): CodexDesktopSettings {
    const existing = db.prepare('SELECT * FROM codex_desktop_settings WHERE id = 1').get() as CodexDesktopSettings | undefined;
    if (existing) {
      return {
        ...existing,
        codex_home: existing.codex_home || this.defaultCodexHome(),
        auto_switch_launch_mode: existing.auto_switch_launch_mode || 'activate_only',
      };
    }
    db.prepare(`
      INSERT INTO codex_desktop_settings (id, codex_home, auto_switch_enabled, auto_switch_launch_mode, low_5h_threshold_pct)
      VALUES (1, ?, 0, 'activate_only', 15)
    `).run(this.defaultCodexHome());
    return this.getSettings();
  }

  updateSettings(input: Partial<CodexDesktopSettings>): CodexDesktopSettings {
    const current = this.getSettings();
    const codexHome = String(input.codex_home || current.codex_home || this.defaultCodexHome()).trim();
    const threshold = Math.max(1, Math.min(99, Number(input.low_5h_threshold_pct ?? current.low_5h_threshold_pct ?? 15)));
    const rawAutoSwitch = input.auto_switch_enabled as any;
    const autoSwitch = rawAutoSwitch === undefined
      ? (current.auto_switch_enabled ? 1 : 0)
      : (rawAutoSwitch === 1 || rawAutoSwitch === true ? 1 : 0);
    const rawLaunchMode = String(input.auto_switch_launch_mode || current.auto_switch_launch_mode || 'activate_only');
    const launchMode: CodexDesktopSettings['auto_switch_launch_mode'] = rawLaunchMode === 'activate_and_open'
      ? 'activate_and_open'
      : 'activate_only';
    db.prepare(`
      UPDATE codex_desktop_settings
      SET codex_home = ?, auto_switch_enabled = ?, auto_switch_launch_mode = ?, low_5h_threshold_pct = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(codexHome, autoSwitch, launchMode, threshold);
    return this.getSettings();
  }

  getStatus(): CodexDesktopStatus {
    const settings = this.getSettings();
    const codexHome = settings.codex_home || this.defaultCodexHome();
    const authPath = path.join(codexHome, 'auth.json');
    const markerPath = path.join(codexHome, ACTIVE_ACCOUNT_MARKER_FILE);
    const sessionsPath = path.join(codexHome, 'sessions');
    const archivedSessionsPath = path.join(codexHome, 'archived_sessions');
    const auth = safeReadJson(authPath);
    const tokens = auth.tokens || {};
    const claims = decodeJwtPayload(tokens.access_token);
    const currentAccountId = String(
      tokens.account_id ||
      claims?.['https://api.openai.com/auth']?.chatgpt_account_id ||
      ''
    );
    const currentEmail = String(
      claims?.['https://api.openai.com/profile']?.email ||
      claims?.email ||
      ''
    );
    const marker = this.readActiveMarker(markerPath);
    const matched = this.findMatchingAccount(
      currentAccountId,
      currentEmail,
      tokens.access_token,
      tokens.refresh_token,
      tokens.id_token,
      marker
    );
    const lastActivation = db.prepare(`
      SELECT * FROM codex_activation_events
      ORDER BY id DESC
      LIMIT 1
    `).get() as CodexActivationEvent | undefined;
    const autoSwitchPolicy = this.buildAutoSwitchPolicyStatus(settings, matched);

    return {
      codexHome,
      authPath,
      sessionsPath,
      archivedSessionsPath,
      authExists: fs.existsSync(authPath),
      sessionsExists: fs.existsSync(sessionsPath),
      archivedSessionsExists: fs.existsSync(archivedSessionsPath),
      authMode: String(auth.auth_mode || ''),
      currentAccountId,
      currentEmail,
      matchedTokenAccountId: matched.account?.id || null,
      matchedTokenAccountName: matched.account?.name || '',
      matchSource: matched.source,
      matchConfidence: matched.confidence,
      matchAmbiguous: matched.ambiguous,
      matchNotes: matched.notes,
      lastActivation: lastActivation || null,
      autoSwitchPolicy,
    };
  }

  listCodexAccounts() {
    return tokenAccountModel.list().filter((account) =>
      account.provider === 'openai_codex' &&
      (account.auth_method === 'oauth' || account.auth_method === 'manual')
    );
  }

  async activate(tokenAccountId: number, options?: { strategy?: string; launch?: boolean; restartExisting?: boolean }): Promise<CodexDesktopActivationResult> {
    const account = tokenAccountModel.getById(tokenAccountId);
    if (!account) throw new Error('Codex token account not found');
    if (account.provider !== 'openai_codex' || !['oauth', 'manual'].includes(account.auth_method)) {
      throw new Error('第一版 Codex Desktop 切换只支持 OpenAI Codex OAuth / Refresh Token 账号');
    }

    const settings = this.getSettings();
    const codexHome = settings.codex_home || this.defaultCodexHome();
    const authPath = path.join(codexHome, 'auth.json');
    const markerPath = path.join(codexHome, ACTIVE_ACCOUNT_MARKER_FILE);
    let backupAuthPath = '';
    let backupMarkerPath = '';

    try {
      const refreshed = await this.refreshAccountForActivation(account);
      this.assertActivationIdentity(account, refreshed);
      const activeAccount = tokenAccountModel.update(account.id, {
        ...account,
        access_token: refreshed.accessToken || account.access_token,
        refresh_token: refreshed.refreshToken || account.refresh_token,
        id_token: refreshed.idToken || account.id_token,
        login_hint: account.login_hint || refreshed.email || '',
        external_account_id: refreshed.chatgptAccountId || account.external_account_id,
        status: 'active',
      })!;

      backupAuthPath = this.writeAuthFile(codexHome, activeAccount);
      backupMarkerPath = this.writeActiveMarker(markerPath, activeAccount);
      const verification = this.getStatus();
      const verificationError = this.activationVerificationError(verification, activeAccount.id);
      if (verificationError) {
        this.restoreFileFromBackup(authPath, backupAuthPath);
        this.restoreFileFromBackup(markerPath, backupMarkerPath);
        throw new Error(verificationError);
      }
      const launched = options?.launch ? this.launchCodexApp({ restartExisting: options.restartExisting !== false }) : false;
      const event = this.recordEvent({
        tokenAccountId: account.id,
        strategy: options?.strategy || 'manual',
        status: 'success',
        codexHome,
        backupAuthPath,
        error: '',
      });

      return {
        status: this.getStatus(),
        event,
        account: null,
        launched,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordEvent({
        tokenAccountId: account.id,
        strategy: options?.strategy || 'manual',
        status: 'error',
        codexHome,
        backupAuthPath,
        error: message,
      });
      throw error;
    }
  }

  async rotate(strategy: 'next' | 'best', options?: { launch?: boolean; strategyLabel?: string }) {
    const account = this.pickRotationAccount(strategy);
    if (!account) throw new Error('没有可用于轮换的 Codex OAuth / Refresh Token 账号');
    return this.activate(account.id, { strategy: options?.strategyLabel || strategy, launch: options?.launch });
  }

  async autoSwitchIfNeeded() {
    const settings = this.getSettings();
    if (!settings.auto_switch_enabled) return null;

    const status = this.getStatus();
    if (!status.matchedTokenAccountId) return null;
    if (!['exact', 'high'].includes(status.matchConfidence)) return null;
    const current = tokenAccountModel.getById(status.matchedTokenAccountId);
    if (!current) return null;
    const currentUnavailable = this.isCurrentAccountUnavailableForAutoSwitch(current);
    const lastActivation = db.prepare(`
      SELECT * FROM codex_activation_events
      WHERE status = 'success'
      ORDER BY id DESC
      LIMIT 1
    `).get() as CodexActivationEvent | undefined;
    if (!currentUnavailable && isRecentTimestamp(lastActivation?.created_at)) return null;
    if (!currentUnavailable && !isFreshStamp(current.last_synced_at)) return null;
    const snapshot = parseSnapshot(current?.snapshot_json);
    const fiveHour = quotaValue(snapshot, 'five_hour');
    const weekly = quotaValue(snapshot, 'weekly');
    const fiveHourLow = typeof fiveHour === 'number' && fiveHour < settings.low_5h_threshold_pct;
    const weeklyEmpty = typeof weekly === 'number' && weekly <= 0;
    if (!currentUnavailable && !fiveHourLow && !weeklyEmpty) return null;
    const excludedIds = this.recentFailedAutoSwitchAccountIds();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < AUTO_SWITCH_MAX_ATTEMPTS; attempt += 1) {
      const account = this.pickAutoSwitchAccount(
        status.matchedTokenAccountId,
        settings.low_5h_threshold_pct,
        { force: currentUnavailable, excludeIds: excludedIds }
      );
      if (!account) break;
      excludedIds.add(account.id);
      if (this.isCodexAppRunning()) {
        return this.deferAutoSwitch(status.matchedTokenAccountId, account.id);
      }
      try {
        return await this.activate(account.id, {
          strategy: 'auto',
          launch: settings.auto_switch_launch_mode === 'activate_and_open',
          restartExisting: false,
        });
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  private deferAutoSwitch(currentTokenAccountId: number, candidateTokenAccountId: number): CodexDesktopAutoSwitchDeferred {
    return {
      deferred: true,
      reason: 'protected_running_session',
      queuedAt: new Date().toISOString(),
      currentTokenAccountId,
      candidateTokenAccountId,
      nextCheck: 'next_auto_sync',
    };
  }

  private buildAutoSwitchPolicyStatus(
    settings: CodexDesktopSettings,
    matched: MatchResult
  ): CodexDesktopStatus['autoSwitchPolicy'] {
    let userInterventionReason: CodexDesktopStatus['autoSwitchPolicy']['userInterventionReason'] = 'none';
    if (matched.ambiguous) {
      userInterventionReason = 'identity_ambiguous';
    } else if (!matched.account) {
      userInterventionReason = 'no_trusted_current_account';
    } else if (!['exact', 'high'].includes(matched.confidence)) {
      userInterventionReason = 'low_confidence_match';
    }
    return {
      enabled: settings.auto_switch_enabled === 1,
      low5hThresholdPct: settings.low_5h_threshold_pct,
      failureCooldownMinutes: Math.ceil(AUTO_SWITCH_FAILURE_COOLDOWN_MS / 60_000),
      maxAttempts: AUTO_SWITCH_MAX_ATTEMPTS,
      protectedRunning: this.isCodexAppRunning(),
      recentFailedCandidateIds: [...this.recentFailedAutoSwitchAccountIds()],
      userInterventionReason,
    };
  }

  restore(activationEventId: number) {
    const event = db.prepare('SELECT * FROM codex_activation_events WHERE id = ?').get(activationEventId) as CodexActivationEvent | undefined;
    if (!event) throw new Error('activation event not found');
    if (!event.backup_auth_path || !fs.existsSync(event.backup_auth_path)) {
      throw new Error('这个激活事件没有可恢复的 auth.json 备份');
    }
    const settings = this.getSettings();
    const codexHome = settings.codex_home || this.defaultCodexHome();
    const authPath = path.join(codexHome, 'auth.json');
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.copyFileSync(event.backup_auth_path, authPath);
    const restored = this.recordEvent({
      tokenAccountId: event.token_account_id || null,
      strategy: 'restore',
      status: 'restored',
      codexHome,
      backupAuthPath: event.backup_auth_path,
      error: '',
    });
    return { status: this.getStatus(), event: restored };
  }

  getUsageHistory(rangeDays = 30): CodexUsageHistory {
    const days = Math.max(1, Math.min(180, Number(rangeDays) || 30));
    const rows = db.prepare(`
      SELECT s.id, s.token_account_id, s.snapshot_json, s.created_at, a.name AS account_name
      FROM token_account_snapshots s
      JOIN (
        SELECT token_account_id, DATE(created_at) AS snapshot_date, MAX(id) AS latest_id
        FROM token_account_snapshots
        WHERE created_at >= DATETIME('now', ?)
        GROUP BY token_account_id, DATE(created_at)
      ) latest ON latest.latest_id = s.id
      JOIN token_accounts a ON a.id = s.token_account_id
      ORDER BY s.created_at ASC
    `).all(`-${days} days`) as Array<{ id: number; token_account_id: number; snapshot_json: string; created_at: string; account_name: string }>;

    return {
      tokenSnapshots: rows.map((row) => {
        const snapshot = parseSnapshot(row.snapshot_json);
        return {
          id: row.id,
          token_account_id: row.token_account_id,
          account_name: row.account_name,
          created_at: row.created_at,
          fiveHourRemainingPct: quotaValue(snapshot, 'five_hour'),
          weeklyRemainingPct: quotaValue(snapshot, 'weekly'),
        } satisfies CodexTokenSnapshotPoint;
      }),
      localUsage: this.getCachedLocalUsage(days),
      weeklyTrend: this.buildWeeklyTrend(rows, this.listCodexAccounts()),
    };
  }

  private async refreshAccountForActivation(account: TokenAccount) {
    if (account.refresh_token) {
      return refreshOpenAITokenAccount(account);
    }
    const parsed = openAIAccountService.parseTokenInfo(account.access_token, account.refresh_token, account.id_token);
    if (!parsed.accessToken) throw new Error('账号缺少 access_token / refresh_token，无法激活到 Codex Desktop');
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken || '',
      idToken: parsed.idToken || '',
      expiresAt: parsed.expiresAt || 0,
      expiresIn: parsed.expiresIn || 0,
      email: parsed.email || '',
      chatgptAccountId: parsed.chatgptAccountId || account.external_account_id || '',
    };
  }

  private writeAuthFile(codexHome: string, account: TokenAccount) {
    const authPath = path.join(codexHome, 'auth.json');
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    const backupPath = fs.existsSync(authPath)
      ? path.join(path.dirname(authPath), `auth.json.bak-muse-codex-${asIsoStamp()}`)
      : '';
    if (backupPath) fs.copyFileSync(authPath, backupPath);

    const existing = safeReadJson(authPath);
    const next = {
      ...existing,
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      muse: {
        token_account_id: account.id,
        login_hint: account.login_hint || '',
        external_account_id: account.external_account_id || '',
        updated_at: new Date().toISOString(),
      },
      tokens: {
        ...(existing.tokens || {}),
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        id_token: account.id_token,
        account_id: account.external_account_id,
      },
      last_refresh: new Date().toISOString(),
    };

    const tempPath = `${authPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, authPath);
    return backupPath;
  }

  private pickRotationAccount(strategy: 'next' | 'best') {
    const accounts = this.listCodexAccounts()
      .filter((account) => account.status !== 'error')
      .filter((account) => this.isSafeForRuleBasedSwitch(account));
    if (!accounts.length) return null;
    const currentId = this.getStatus().matchedTokenAccountId;
    if (strategy === 'next') {
      const ordered = this.sortRotationCandidates(accounts);
      const index = ordered.findIndex((account) => account.id === currentId);
      return ordered[(index + 1 + ordered.length) % ordered.length];
    }

    return this.sortRotationCandidates(accounts)[0] || null;
  }

  private isCurrentAccountUnavailableForAutoSwitch(account: TokenAccount) {
    if (account.status === 'error') return true;
    const retryAt = normalizedStamp(account.next_retry_at);
    const retryBlocked = retryAt > Date.now();
    if (!retryBlocked) return false;
    return account.last_failure_kind === 'reauth_required' ||
      account.last_failure_kind === 'provider_blocked' ||
      account.last_failure_kind === 'unknown';
  }

  private recentFailedAutoSwitchAccountIds() {
    const minutes = Math.max(1, Math.ceil(AUTO_SWITCH_FAILURE_COOLDOWN_MS / 60_000));
    const rows = db.prepare(`
      SELECT token_account_id
      FROM codex_activation_events
      WHERE strategy = 'auto'
        AND status = 'error'
        AND token_account_id IS NOT NULL
        AND created_at >= DATETIME('now', ?)
    `).all(`-${minutes} minutes`) as Array<{ token_account_id: number | null }>;
    return new Set(rows.map((row) => Number(row.token_account_id)).filter((id) => Number.isFinite(id) && id > 0));
  }

  private pickAutoSwitchAccount(currentId: number, thresholdPct: number, options?: { force?: boolean; excludeIds?: Set<number> }) {
    const current = tokenAccountModel.getById(currentId);
    const currentSnapshot = parseSnapshot(current?.snapshot_json);
    const currentFiveHour = quotaValue(currentSnapshot, 'five_hour');
    const currentWeekly = quotaValue(currentSnapshot, 'weekly');
    const minimumFiveHour = Math.max(thresholdPct + AUTO_SWITCH_THRESHOLD_BUFFER_PCT, 0);
    const candidates = this.listCodexAccounts()
      .filter((account) => account.id !== currentId)
      .filter((account) => !options?.excludeIds?.has(account.id))
      .filter((account) => account.status === 'active' && account.auto_sync_enabled === 1)
      .filter((account) => this.isSafeForRuleBasedSwitch(account))
      .filter((account) => isFreshStamp(account.last_synced_at))
      .map((account) => {
        const snapshot = parseSnapshot(account.snapshot_json);
        return {
          account,
          fiveHour: quotaValue(snapshot, 'five_hour'),
          weekly: quotaValue(snapshot, 'weekly'),
          syncedAt: normalizedStamp(account.last_synced_at || account.updated_at),
        };
      })
      .filter((item) => typeof item.weekly === 'number' && item.weekly > 0)
      .filter((item) => typeof item.fiveHour === 'number' && item.fiveHour >= minimumFiveHour)
      .filter((item) => {
        if (options?.force) return true;
        if (typeof currentWeekly === 'number' && currentWeekly <= 0) return true;
        if (typeof currentFiveHour === 'number') {
          return (item.fiveHour ?? -1) >= currentFiveHour + AUTO_SWITCH_MIN_IMPROVEMENT_PCT;
        }
        return true;
      });

    if (!candidates.length) return null;

    return [...candidates]
      .sort((left, right) => {
        const fiveHourDelta = (right.fiveHour ?? -1) - (left.fiveHour ?? -1);
        if (fiveHourDelta !== 0) return fiveHourDelta;
        const weeklyDelta = (right.weekly ?? -1) - (left.weekly ?? -1);
        if (weeklyDelta !== 0) return weeklyDelta;
        return right.syncedAt - left.syncedAt;
      })[0]?.account || null;
  }

  private activationVerificationError(verification: CodexDesktopStatus, expectedAccountId: number) {
    const trustedSources = new Set(['marker_token', 'marker_identity', 'token_hash', 'identity_pair']);
    const trustedConfidence = verification.matchConfidence === 'exact' || verification.matchConfidence === 'high';
    if (
      verification.matchedTokenAccountId === expectedAccountId &&
      trustedConfidence &&
      trustedSources.has(verification.matchSource) &&
      !verification.matchAmbiguous
    ) {
      return '';
    }
    return `切换校验失败：目标账号 #${expectedAccountId} 已写入 auth.json，但当前识别结果为 #${verification.matchedTokenAccountId || 'none'} (${verification.matchSource}/${verification.matchConfidence}${verification.matchAmbiguous ? '/ambiguous' : ''})`;
  }

  private readActiveMarker(markerPath: string): ActiveAccountMarker | null {
    const raw = safeReadJson(markerPath);
    const tokenAccountId = Number(raw.tokenAccountId);
    if (!Number.isFinite(tokenAccountId) || tokenAccountId <= 0) return null;
    return {
      tokenAccountId,
      externalAccountId: String(raw.externalAccountId || ''),
      loginHint: String(raw.loginHint || ''),
      accessTokenHash: String(raw.accessTokenHash || ''),
      refreshTokenHash: String(raw.refreshTokenHash || ''),
      idTokenHash: String(raw.idTokenHash || ''),
      createdAt: String(raw.createdAt || ''),
    };
  }

  private writeActiveMarker(markerPath: string, account: TokenAccount) {
    const backupPath = fs.existsSync(markerPath)
      ? path.join(path.dirname(markerPath), `${ACTIVE_ACCOUNT_MARKER_FILE}.bak-muse-codex-${asIsoStamp()}`)
      : '';
    if (backupPath) fs.copyFileSync(markerPath, backupPath);
    const marker: ActiveAccountMarker = {
      tokenAccountId: account.id,
      externalAccountId: account.external_account_id || '',
      loginHint: account.login_hint || '',
      accessTokenHash: hashToken(account.access_token),
      refreshTokenHash: hashToken(account.refresh_token),
      idTokenHash: hashToken(account.id_token),
      createdAt: new Date().toISOString(),
    };
    const tempPath = `${markerPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tempPath, JSON.stringify(marker, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, markerPath);
    return backupPath;
  }

  private restoreFileFromBackup(targetPath: string, backupPath: string) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(backupPath, targetPath);
      return;
    }
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  }

  private assertActivationIdentity(
    account: TokenAccount,
    refreshed: {
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
      email?: string;
      chatgptAccountId?: string;
    }
  ) {
    const expectedAccountId = String(account.external_account_id || '').trim();
    const expectedEmail = normalizeIdentity(account.login_hint || account.name);
    const actualAccountId = String(refreshed.chatgptAccountId || '').trim();
    const actualEmail = normalizeIdentity(refreshed.email);
    const mismatches: string[] = [];

    if (expectedAccountId && actualAccountId && expectedAccountId !== actualAccountId) {
      mismatches.push(`account_id ${expectedAccountId} -> ${actualAccountId}`);
    }
    if (expectedEmail && actualEmail && expectedEmail !== actualEmail) {
      mismatches.push(`email ${expectedEmail} -> ${actualEmail}`);
    }

    if (mismatches.length) {
      throw new Error(`账号身份校验失败，已阻止切换：${mismatches.join('; ')}`);
    }
  }

  private findMarkedAccount(
    accounts: TokenAccount[],
    marker: ActiveAccountMarker | null | undefined,
    current: {
      accountId: string;
      email: string;
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
    }
  ): MatchResult | null {
    if (!marker) return null;
    const account = accounts.find((item) => item.id === marker.tokenAccountId);
    if (!account) {
      return {
        account: null,
        source: 'none',
        confidence: 'none',
        ambiguous: false,
        notes: [`marker_missing_account:${marker.tokenAccountId}`],
      };
    }

    const currentAccessHash = hashToken(current.accessToken);
    const currentRefreshHash = hashToken(current.refreshToken);
    const currentIdHash = hashToken(current.idToken);
    const tokenVerified =
      (marker.accessTokenHash && marker.accessTokenHash === currentAccessHash) ||
      (marker.refreshTokenHash && marker.refreshTokenHash === currentRefreshHash) ||
      (marker.idTokenHash && marker.idTokenHash === currentIdHash);
    if (tokenVerified) {
      return {
        account,
        source: 'marker_token',
        confidence: 'exact',
        ambiguous: false,
        notes: [],
      };
    }

    const identityVerified =
      current.accountId &&
      marker.externalAccountId &&
      current.accountId === marker.externalAccountId &&
      current.email &&
      sameIdentity(current.email, marker.loginHint);
    if (identityVerified) {
      return {
        account,
        source: 'marker_identity',
        confidence: 'high',
        ambiguous: false,
        notes: [],
      };
    }

    return null;
  }

  private isSafeForRuleBasedSwitch(account: TokenAccount) {
    const accounts = this.listCodexAccounts();
    const externalAccountId = String(account.external_account_id || '').trim();
    const loginHint = normalizeIdentity(account.login_hint || account.name);
    const sameExternalId = externalAccountId
      ? accounts.filter((item) => item.id !== account.id && item.external_account_id === externalAccountId).length
      : 0;
    const sameLoginHint = loginHint
      ? accounts.filter((item) => item.id !== account.id && normalizeIdentity(item.login_hint || item.name) === loginHint).length
      : 0;
    return sameExternalId === 0 || sameLoginHint === 0;
  }

  private sortRotationCandidates(accounts: TokenAccount[]) {
    return [...accounts].sort((left, right) => {
      const leftSnapshot = parseSnapshot(left.snapshot_json);
      const rightSnapshot = parseSnapshot(right.snapshot_json);
      const leftWeekly = quotaValue(leftSnapshot, 'weekly');
      const rightWeekly = quotaValue(rightSnapshot, 'weekly');
      const leftRank = leftWeekly === 0 ? 2 : leftWeekly == null ? 1 : 0;
      const rightRank = rightWeekly === 0 ? 2 : rightWeekly == null ? 1 : 0;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (quotaValue(rightSnapshot, 'five_hour') ?? -1) - (quotaValue(leftSnapshot, 'five_hour') ?? -1);
    });
  }

  private findMatchingAccount(
    accountId: string,
    email: string,
    accessToken?: string,
    refreshToken?: string,
    idToken?: string,
    marker?: ActiveAccountMarker | null
  ): MatchResult {
    const notes: string[] = [];
    const accounts = this.listCodexAccounts();
    const markerMatch = this.findMarkedAccount(accounts, marker, {
      accountId,
      email,
      accessToken,
      refreshToken,
      idToken,
    });
    if (markerMatch) return markerMatch;

    const accessHash = hashToken(accessToken);
    const refreshHash = hashToken(refreshToken);
    const idHash = hashToken(idToken);
    const tokenMatches = accounts.filter((account) => {
      if (accessHash && hashToken(account.access_token) === accessHash) return true;
      if (refreshHash && hashToken(account.refresh_token) === refreshHash) return true;
      if (idHash && hashToken(account.id_token) === idHash) return true;
      return false;
    });
    if (tokenMatches.length === 1) {
      return { account: tokenMatches[0], source: 'token_hash', confidence: 'exact', ambiguous: false, notes };
    }
    if (tokenMatches.length > 1) {
      notes.push(`token_hash_collision:${tokenMatches.map((item) => item.id).join(',')}`);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const accountIdAndEmailMatches = accountId && normalizedEmail
      ? accounts.filter((account) =>
        account.external_account_id === accountId &&
        (
          account.login_hint.trim().toLowerCase() === normalizedEmail ||
          account.name.trim().toLowerCase() === normalizedEmail
        )
      )
      : [];
    if (accountIdAndEmailMatches.length === 1) {
      return { account: accountIdAndEmailMatches[0], source: 'identity_pair', confidence: 'high', ambiguous: false, notes };
    }
    if (accountIdAndEmailMatches.length > 1) {
      notes.push(`identity_pair_ambiguous:${accountIdAndEmailMatches.map((item) => item.id).join(',')}`);
    }

    const accountIdMatches = accountId
      ? accounts.filter((account) => account.external_account_id === accountId)
      : [];
    if (accountIdMatches.length === 1) {
      return { account: accountIdMatches[0], source: 'external_account_id', confidence: 'medium', ambiguous: false, notes };
    }
    if (accountIdMatches.length > 1) {
      notes.push(`external_account_id_ambiguous:${accountIdMatches.map((item) => item.id).join(',')}`);
    }

    const emailMatches = normalizedEmail
      ? accounts.filter((account) =>
        account.login_hint.trim().toLowerCase() === normalizedEmail ||
        account.name.trim().toLowerCase() === normalizedEmail
      )
      : [];
    if (emailMatches.length === 1) {
      return { account: emailMatches[0], source: 'email', confidence: 'low', ambiguous: false, notes };
    }
    if (emailMatches.length > 1) {
      notes.push(`email_ambiguous:${emailMatches.map((item) => item.id).join(',')}`);
    }

    return {
      account: null,
      source: 'none',
      confidence: 'none',
      ambiguous: notes.some((item) => item.includes('ambiguous') || item.includes('collision')),
      notes,
    };
  }

  private launchCodexApp(options?: { restartExisting?: boolean }) {
    if (options?.restartExisting !== false) {
      this.closeExistingCodexApps();
    }
    const child = spawn('codex', ['app'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    child.unref();
    return true;
  }

  private isCodexAppRunning() {
    if (process.platform === 'win32') {
      for (const imageName of ['Codex.exe', 'OpenAI.Codex.exe', 'codex.exe']) {
        try {
          const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${imageName}`], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 3000,
          });
          if (output.toLowerCase().includes(imageName.toLowerCase())) return true;
        } catch {
          // Process detection is best-effort; failure falls through to no running match.
        }
      }
      return false;
    }

    try {
      execFileSync('pgrep', ['-f', 'codex app|Codex'], {
        stdio: 'ignore',
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private closeExistingCodexApps() {
    if (process.platform === 'win32') {
      for (const imageName of ['Codex.exe', 'OpenAI.Codex.exe', 'codex.exe']) {
        try {
          execFileSync('taskkill', ['/F', '/T', '/IM', imageName], {
            stdio: 'ignore',
            windowsHide: true,
            timeout: 5000,
          });
        } catch {
          // Missing process is fine; this is only a best-effort pre-launch cleanup.
        }
      }
      return;
    }

    try {
      execFileSync('pkill', ['-f', 'codex app|Codex'], {
        stdio: 'ignore',
        timeout: 5000,
      });
    } catch {
      // Missing process is fine; this is only a best-effort pre-launch cleanup.
    }
  }

  private recordEvent(input: {
    tokenAccountId: number | null;
    strategy: string;
    status: 'success' | 'error' | 'restored';
    codexHome: string;
    backupAuthPath: string;
    error: string;
  }) {
    const result = db.prepare(`
      INSERT INTO codex_activation_events (token_account_id, strategy, status, codex_home, backup_auth_path, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.tokenAccountId, input.strategy, input.status, input.codexHome, input.backupAuthPath, input.error);
    return db.prepare('SELECT * FROM codex_activation_events WHERE id = ?').get(result.lastInsertRowid) as CodexActivationEvent;
  }

  private buildWeeklyTrend(
    rows: Array<{ token_account_id: number; snapshot_json: string; created_at: string }>,
    currentAccounts: TokenAccount[] = []
  ) {
    const byDate = new Map<string, Map<number, { createdAt: string; weeklyRemainingPct: number }>>();

    const addPoint = (tokenAccountId: number, snapshotJson: string, createdAt: string) => {
      const snapshot = parseSnapshot(snapshotJson);
      const weekly = quotaValue(snapshot, 'weekly');
      if (weekly == null) return;
      const date = String(createdAt || new Date().toISOString()).slice(0, 10);
      const accountsForDate = byDate.get(date) || new Map<number, { createdAt: string; weeklyRemainingPct: number }>();
      const existing = accountsForDate.get(tokenAccountId);
      if (!existing || createdAt >= existing.createdAt) {
        accountsForDate.set(tokenAccountId, {
          createdAt,
          weeklyRemainingPct: weekly,
        });
      }
      byDate.set(date, accountsForDate);
    };

    for (const row of rows) {
      addPoint(row.token_account_id, row.snapshot_json, row.created_at);
    }

    if (!byDate.size) {
      for (const account of currentAccounts) {
        if (!account.snapshot_json) continue;
        addPoint(account.id, account.snapshot_json, account.last_synced_at || account.updated_at || new Date().toISOString());
      }
    }

    let previousTotal: number | null = null;
    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, accountsForDate]) => {
        const values = [...accountsForDate.values()].map((item) => item.weeklyRemainingPct);
        const totalWeeklyRemainingPct = roundPct(values.reduce((sum, value) => sum + value, 0));
        const dailyUsedPct = previousTotal == null ? 0 : roundPct(Math.max(0, previousTotal - totalWeeklyRemainingPct));
        previousTotal = totalWeeklyRemainingPct;
        return {
          date,
          totalWeeklyRemainingPct,
          dailyUsedPct,
          accountCount: values.length,
          zeroWeeklyAccountCount: values.filter((value) => value === 0).length,
        };
      });
  }

  private getCachedLocalUsage(rangeDays: number): CodexUsageHistoryPoint[] {
    const codexHome = this.getSettings().codex_home || this.defaultCodexHome();
    const cacheKey = `${codexHome}:${rangeDays}`;
    const cached = this.localUsageCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < LOCAL_USAGE_CACHE_TTL_MS) {
      return cached.value;
    }
    this.refreshLocalUsageCache(cacheKey, codexHome, rangeDays);
    return cached?.value || [];
  }

  private refreshLocalUsageCache(cacheKey: string, codexHome: string, rangeDays: number) {
    if (this.localUsageRefreshes.has(cacheKey)) return;
    this.localUsageRefreshes.add(cacheKey);
    setTimeout(() => {
      try {
        const value = this.scanLocalUsage(codexHome, rangeDays);
        this.localUsageCache.set(cacheKey, { createdAt: Date.now(), value });
      } finally {
        this.localUsageRefreshes.delete(cacheKey);
      }
    }, 0);
  }

  private scanLocalUsage(codexHome: string, rangeDays: number): CodexUsageHistoryPoint[] {
    const roots = [path.join(codexHome, 'sessions'), path.join(codexHome, 'archived_sessions')];
    const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, CodexUsageHistoryPoint>();

    const ensureDay = (date: string) => {
      const current = byDate.get(date) || {
        date,
        sessionCount: 0,
        fileCount: 0,
        byteCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        estimated: false,
      };
      byDate.set(date, current);
      return current;
    };

    const addUsage = (
      date: string,
      usage: {
        input_tokens?: number;
        output_tokens?: number;
        cached_input_tokens?: number;
        reasoning_output_tokens?: number;
        total_tokens?: number;
      }
    ) => {
      const current = ensureDay(date);
      current.inputTokens += Number(usage.input_tokens || 0);
      current.outputTokens += Number(usage.output_tokens || 0);
      current.cachedInputTokens += Number(usage.cached_input_tokens || 0);
      current.reasoningOutputTokens += Number(usage.reasoning_output_tokens || 0);
      current.totalTokens += Number(usage.total_tokens || 0);
    };

    const scanTokenCounts = (filePath: string) => {
      let previousTotal: Record<string, number> | null = null;
      let parsedAny = false;
      try {
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (!line.includes('"token_count"')) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event?.payload?.type !== 'token_count') continue;
          const timestamp = event.timestamp ? new Date(event.timestamp) : null;
          if (!timestamp || Number.isNaN(timestamp.getTime()) || timestamp.getTime() < since) continue;
          const date = timestamp.toISOString().slice(0, 10);
          const total = event.payload?.info?.total_token_usage;
          const last = event.payload?.info?.last_token_usage;
          if (total && typeof total.total_tokens === 'number') {
            if (previousTotal) {
              addUsage(date, {
                input_tokens: Math.max(0, Number(total.input_tokens || 0) - Number(previousTotal.input_tokens || 0)),
                output_tokens: Math.max(0, Number(total.output_tokens || 0) - Number(previousTotal.output_tokens || 0)),
                cached_input_tokens: Math.max(0, Number(total.cached_input_tokens || 0) - Number(previousTotal.cached_input_tokens || 0)),
                reasoning_output_tokens: Math.max(0, Number(total.reasoning_output_tokens || 0) - Number(previousTotal.reasoning_output_tokens || 0)),
                total_tokens: Math.max(0, Number(total.total_tokens || 0) - Number(previousTotal.total_tokens || 0)),
              });
            } else if (last && typeof last.total_tokens === 'number') {
              addUsage(date, last);
            } else {
              addUsage(date, total);
            }
            previousTotal = total;
            parsedAny = true;
          } else if (last && typeof last.total_tokens === 'number') {
            addUsage(date, last);
            parsedAny = true;
          }
        }
      } catch {
        return false;
      }
      return parsedAny;
    };

    const visit = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < since) continue;
        const date = stat.mtime.toISOString().slice(0, 10);
        const current = ensureDay(date);
        current.fileCount += 1;
        current.sessionCount += entry.name.endsWith('.jsonl') ? 1 : 0;
        current.byteCount += stat.size;
        if (entry.name.endsWith('.jsonl') && !scanTokenCounts(fullPath)) {
          current.estimated = true;
        }
      }
    };

    try {
      roots.forEach(visit);
    } catch {
      return [];
    }

    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  }
}

export const codexDesktopService = new CodexDesktopService();
