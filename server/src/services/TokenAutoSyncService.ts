import { TokenAccountModel } from '../models/TokenAccount';
import type { CodexDesktopActivationResult, CodexDesktopAutoSwitchDeferred, TokenAccount, TokenSyncFailureKind } from '../types';
import logger from '../utils/logger';
import { codexDesktopService } from './CodexDesktopService';
import { proxyKernelService } from './ProxyKernelService';
import { TokenQuotaService } from './TokenQuotaService';

const AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const AUTO_SYNC_STALE_MS = 60 * 1000;
const AUTO_SYNC_STARTUP_DELAY_MS = 15 * 1000;

export type AutoSyncSummary = {
  running: boolean;
  synced: number;
  failed: number;
  skipped: number;
  recoveryTriggered: boolean;
  recoveryMessage?: string;
  delayedAccounts: number[];
  pausedAccounts: number[];
  codexAutoSwitch?: CodexDesktopActivationResult | CodexDesktopAutoSwitchDeferred | { error: string } | null;
};

const tokenAccountModel = new TokenAccountModel();
const tokenQuotaService = new TokenQuotaService();

function parseTimestamp(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isReauthRequiredError(message: string) {
  return /重新走一次 OAuth 授权|invalid_request_error/i.test(message);
}

function classifyFailure(message: string): TokenSyncFailureKind {
  if (isReauthRequiredError(message)) return 'reauth_required';
  if (/OpenAI 同步前校准内置代理失败|内置代理|mihomo|ECONNREFUSED 127\.0\.0\.1|Spawn EPERM|controller unavailable|local proxy/i.test(message)) {
    return 'proxy_recoverable';
  }
  if (/unsupported_country_region_territory|Country, region, or territory not supported|身份验证错误|unknown_error|forbidden|403|402|deactivated_workspace|workspace_member_credits_depleted|refresh_token_reused|refresh token 已经被使用过/i.test(message)) {
    return 'provider_blocked';
  }
  if (/fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|network|socket|timed out/i.test(message)) {
    return 'network_transient';
  }
  return 'unknown';
}

function computeBackoffMs(kind: TokenSyncFailureKind, failureCount: number) {
  const safeCount = Math.max(1, failureCount);
  if (kind === 'proxy_recoverable') return Math.min(20, safeCount * 3) * 60 * 1000;
  if (kind === 'network_transient') return Math.min(60, safeCount * 5) * 60 * 1000;
  if (kind === 'provider_blocked') return Math.min(30, safeCount) * 60 * 1000;
  if (kind === 'unknown') return Math.min(90, safeCount * 10) * 60 * 1000;
  return 0;
}

function computeNextRetryAt(kind: TokenSyncFailureKind, failureCount: number) {
  if (kind === 'reauth_required') return null;
  const backoffMs = computeBackoffMs(kind, failureCount);
  if (!backoffMs) return null;
  return new Date(Date.now() + backoffMs).toISOString();
}

function canKeepSnapshotAvailable(account: TokenAccount, kind: TokenSyncFailureKind, message: string) {
  if (!account.snapshot_json) return false;
  if (kind === 'proxy_recoverable' || kind === 'network_transient') return true;
  if (kind === 'provider_blocked') {
    return /unsupported_country_region_territory|Country, region, or territory not supported|身份验证错误|unknown_error/i.test(message);
  }
  return false;
}

export class TokenAutoSyncService {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private runningPromise: Promise<AutoSyncSummary> | null = null;

  private getLastTouchAt(account: TokenAccount) {
    if (account.last_synced_at) return parseTimestamp(account.last_synced_at);
    return account.status === 'error' ? parseTimestamp(account.updated_at) : 0;
  }

  private shouldSync(account: TokenAccount, force = false) {
    if (account.auto_sync_enabled !== 1) return false;
    if (account.status === 'inactive') return false;
    if (!force && account.next_retry_at && parseTimestamp(account.next_retry_at) > Date.now()) return false;
    if (force) return true;
    const lastTouchAt = this.getLastTouchAt(account);
    if (!lastTouchAt) return true;
    return Date.now() - lastTouchAt >= AUTO_SYNC_STALE_MS;
  }

  private async triggerProxyRecovery(summary: AutoSyncSummary) {
    if (summary.recoveryTriggered) return;
    summary.recoveryTriggered = true;
    summary.recoveryMessage = '内置代理正在自动恢复并重试';
    try {
      await proxyKernelService.ensureOpenAiProxyReady();
    } catch (error) {
      logger.warn(`Proxy recovery trigger failed during token auto sync: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async triggerCodexAutoSwitch(summary: AutoSyncSummary) {
    try {
      summary.codexAutoSwitch = await codexDesktopService.autoSwitchIfNeeded();
    } catch (error: any) {
      summary.codexAutoSwitch = { error: error?.message || 'Codex 自动切换失败' };
      logger.warn(`Codex auto switch failed after token auto sync: ${error?.message || error}`);
    }
  }

  private async run(force = false): Promise<AutoSyncSummary> {
    const accounts = tokenAccountModel.list();
    const targets = accounts.filter((account) => this.shouldSync(account, force));
    const summary: AutoSyncSummary = {
      running: false,
      synced: 0,
      failed: 0,
      skipped: Math.max(0, accounts.length - targets.length),
      recoveryTriggered: false,
      delayedAccounts: [],
      pausedAccounts: [],
    };
    const hasOpenAiTargets = targets.some((account) => account.provider === 'openai_codex');

    if (hasOpenAiTargets) {
      try {
        const kernelStatus = await proxyKernelService.getStatus();
        if (
          kernelStatus.installed &&
          (
            !kernelStatus.running ||
            kernelStatus.health === 'recovering' ||
            kernelStatus.health === 'degraded' ||
            kernelStatus.health === 'failed'
          )
        ) {
          await this.triggerProxyRecovery(summary);
        }
      } catch (error) {
        logger.warn(`Token auto sync preflight kernel status failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const account of targets) {
      try {
        const snapshot = await tokenQuotaService.syncAccount(account);
        tokenAccountModel.saveSyncResult(account.id, 'active', '', snapshot, {
          next_retry_at: null,
          failure_count: 0,
          last_failure_kind: 'none',
        });
        summary.synced += 1;
      } catch (error: any) {
        const message = error?.message || '自动同步失败';
        const failureKind = classifyFailure(message);
        const failureCount = Number(account.failure_count || 0) + 1;
        const nextRetryAt = computeNextRetryAt(failureKind, failureCount);

        const preserveAvailable = canKeepSnapshotAvailable(account, failureKind, message);
        tokenAccountModel.saveSyncResult(account.id, preserveAvailable ? 'active' : 'error', message, null, {
          next_retry_at: nextRetryAt,
          failure_count: failureCount,
          last_failure_kind: failureKind,
        });

        if (failureKind === 'reauth_required') {
          tokenAccountModel.update(account.id, {
            ...account,
            status: 'error',
            last_error: message,
            auto_sync_enabled: 0,
            next_retry_at: null,
            failure_count: failureCount,
            last_failure_kind: failureKind,
          });
          summary.pausedAccounts.push(account.id);
        } else if (failureKind === 'proxy_recoverable') {
          await this.triggerProxyRecovery(summary);
          summary.delayedAccounts.push(account.id);
        } else if (failureKind !== 'none') {
          summary.delayedAccounts.push(account.id);
        }

        summary.failed += 1;
        logger.warn(`Token auto sync failed for ${account.provider}:${account.name}#${account.id} [${failureKind}]: ${message}`);
      }
    }

    if (!summary.recoveryTriggered && summary.delayedAccounts.length > 0 && hasOpenAiTargets) {
      try {
        const kernelStatus = await proxyKernelService.getStatus();
        if (kernelStatus.running && (kernelStatus.health === 'recovering' || kernelStatus.health === 'degraded')) {
          summary.recoveryTriggered = true;
          summary.recoveryMessage = '内置代理正在自动恢复并重试';
        }
      } catch (error) {
        logger.warn(`Token auto sync postflight kernel status failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.triggerCodexAutoSwitch(summary);

    return summary;
  }

  async syncNow(options?: { force?: boolean }) {
    if (this.runningPromise) return this.runningPromise;
    this.runningPromise = this.run(Boolean(options?.force))
      .catch((error) => {
        logger.warn(`Token auto sync crashed: ${error?.message || error}`);
        throw error;
      })
      .finally(() => {
        this.runningPromise = null;
      });
    return this.runningPromise;
  }

  isRunning() {
    return Boolean(this.runningPromise);
  }

  start() {
    if (this.timer) return;
    this.startupTimer = setTimeout(() => {
      this.syncNow().catch((error) => logger.warn(`Initial token auto sync failed: ${error?.message || error}`));
    }, AUTO_SYNC_STARTUP_DELAY_MS);
    this.timer = setInterval(() => {
      this.syncNow().catch((error) => logger.warn(`Scheduled token auto sync failed: ${error?.message || error}`));
    }, AUTO_SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    this.startupTimer = null;
    this.timer = null;
  }
}

export const tokenAutoSyncService = new TokenAutoSyncService();
