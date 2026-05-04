import db from '../database';
import { config } from '../config';
import { AiAccountModel } from '../models/AiChat';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { AiChatService } from './AiChatService';
import { IntegrationService } from './IntegrationService';
import { buildMiSubAiPrompt, DEFAULT_MISUB_AI_GOAL, normalizeMiSubAiAnalysis } from './MiSubAiShared';
import logger from '../utils/logger';
import type { MiSubAiInspectionConfig, MiSubAiInspectionRun, MiSubAiInspectionState } from '../types';

const aiAccountModel = new AiAccountModel();
const integrationTokenModel = new IntegrationTokenModel();
const aiChatService = new AiChatService();
const integrationService = new IntegrationService();

function addHours(hours: number) {
  return new Date(Date.now() + Math.max(1, Math.min(168, Math.floor(Number(hours) || 24))) * 60 * 60 * 1000).toISOString();
}

function readJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class MiSubAiInspectionService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  ensureConfig(): MiSubAiInspectionConfig {
    const existing = db.prepare('SELECT * FROM misub_ai_inspection_config WHERE id = 1').get() as any;
    if (!existing) {
      db.prepare(`
        INSERT INTO misub_ai_inspection_config (id, enabled, account_id, interval_hours, goal, next_run_at)
        VALUES (1, 0, NULL, 24, ?, ?)
      `).run(DEFAULT_MISUB_AI_GOAL, addHours(24));
      return this.ensureConfig();
    }
    return {
      enabled: !!existing.enabled,
      accountId: existing.account_id ?? null,
      intervalHours: Number(existing.interval_hours || 24),
      goal: existing.goal || DEFAULT_MISUB_AI_GOAL,
      lastRunAt: existing.last_run_at || null,
      nextRunAt: existing.next_run_at || null,
      updatedAt: existing.updated_at || null,
    };
  }

  updateConfig(input: Partial<MiSubAiInspectionConfig>): MiSubAiInspectionState {
    const current = this.ensureConfig();
    const intervalHours = Math.max(1, Math.min(168, Math.floor(Number(input.intervalHours ?? current.intervalHours) || 24)));
    const enabled = input.enabled ?? current.enabled;
    const accountId = input.accountId === undefined ? current.accountId : (input.accountId ? Number(input.accountId) : null);
    const goal = String(input.goal ?? current.goal ?? DEFAULT_MISUB_AI_GOAL).trim() || DEFAULT_MISUB_AI_GOAL;
    const nextRunAt = enabled ? addHours(intervalHours) : current.nextRunAt;
    db.prepare(`
      UPDATE misub_ai_inspection_config
      SET enabled = ?, account_id = ?, interval_hours = ?, goal = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(enabled ? 1 : 0, accountId, intervalHours, goal, nextRunAt);
    return this.getState();
  }

  getState(): MiSubAiInspectionState {
    return {
      config: this.ensureConfig(),
      latestRun: this.listRuns(1)[0] || null,
      history: this.listRuns(10),
      running: this.running,
    };
  }

  listRuns(limit = 10): MiSubAiInspectionRun[] {
    return db.prepare('SELECT * FROM misub_ai_inspection_runs ORDER BY started_at DESC, id DESC LIMIT ?').all(limit).map((row: any) => ({
      id: row.id,
      status: row.status,
      accountId: row.account_id ?? null,
      goal: row.goal || '',
      summary: row.summary || '',
      findings: readJsonArray(row.findings_json),
      actions: readJsonArray(row.actions_json),
      raw: row.raw || '',
      error: row.error || '',
      startedAt: row.started_at,
      finishedAt: row.finished_at || null,
    }));
  }

  private createRun(status: MiSubAiInspectionRun['status'], accountId: number | null, goal: string) {
    const result = db.prepare('INSERT INTO misub_ai_inspection_runs (status, account_id, goal) VALUES (?, ?, ?)').run(status, accountId, goal);
    return Number(result.lastInsertRowid);
  }

  private finishRun(id: number, payload: { status: MiSubAiInspectionRun['status']; summary?: string; findings?: any[]; actions?: any[]; raw?: string; error?: string }) {
    db.prepare(`
      UPDATE misub_ai_inspection_runs
      SET status = ?, summary = ?, findings_json = ?, actions_json = ?, raw = ?, error = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.status,
      payload.summary || '',
      JSON.stringify(payload.findings || []),
      JSON.stringify(payload.actions || []),
      payload.raw || '',
      payload.error || '',
      id
    );
  }

  async runNow(options?: { force?: boolean }): Promise<MiSubAiInspectionState> {
    if (this.running) return this.getState();
    const cfg = this.ensureConfig();
    if (!options?.force && !cfg.enabled) return this.getState();
    if (!cfg.accountId) throw new Error('请先选择 AI 账号');
    const preferredAccount = aiAccountModel.getById(cfg.accountId);
    if (!preferredAccount) throw new Error('AI 账号不存在');
    if (preferredAccount.status === 'inactive') throw new Error('AI 账号已停用');
    const candidateAccounts = [
      preferredAccount,
      ...aiAccountModel.list().filter((item) => item.id !== preferredAccount.id && item.status !== 'inactive'),
    ];
    const record = integrationTokenModel.get('misub') || (config.defaultMiSubUrl && config.defaultMiSubPassword
      ? {
          provider: 'misub' as const,
          token: integrationService.buildMiSubRecordPayload(config.defaultMiSubUrl, config.defaultMiSubPassword),
          updated_at: new Date().toISOString(),
        }
      : undefined);
    if (!record) throw new Error('MiSub 尚未连接');

    const runId = this.createRun('success', cfg.accountId, cfg.goal);
    this.running = true;
    try {
      const data = await integrationService.fetchMiSubData(record, { force: true });
      const prompt = buildMiSubAiPrompt(data, cfg.goal);
      let lastError: any = null;
      let usedAccount = preferredAccount;
      let raw = '';
      for (const account of candidateAccounts) {
        try {
          const aiResult = await aiChatService.sendMessage(account, [{
            id: 0,
            thread_id: 0,
            role: 'user',
            content: prompt,
            created_at: new Date().toISOString(),
          }]);
          raw = typeof aiResult === 'string'
            ? aiResult
            : typeof aiResult?.content === 'string'
            ? aiResult.content
            : String((aiResult as any)?.content?.content || '');
          usedAccount = account;
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error;
          logger.warn(`MiSub AI inspection account ${account.name} failed: ${error.message || error}`);
        }
      }
      if (lastError && !raw) {
        throw new Error(lastError.message || String(lastError) || '所有可用 AI 账号都无法完成 MiSub 巡检');
      }
      const analysis = normalizeMiSubAiAnalysis(raw, usedAccount, cfg.goal, data);
      this.finishRun(runId, {
        status: 'success',
        summary: analysis.summary,
        findings: analysis.findings,
        actions: analysis.actions,
        raw: analysis.raw,
      });
      db.prepare('UPDATE misub_ai_inspection_config SET last_run_at = CURRENT_TIMESTAMP, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(addHours(cfg.intervalHours));
    } catch (error: any) {
      this.finishRun(runId, { status: 'failed', error: error.message || 'MiSub AI 巡检失败' });
      db.prepare('UPDATE misub_ai_inspection_config SET last_run_at = CURRENT_TIMESTAMP, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(addHours(cfg.intervalHours));
      throw error;
    } finally {
      this.running = false;
    }
    return this.getState();
  }

  start() {
    if (this.timer) return;
    this.ensureConfig();
    this.timer = setInterval(() => {
      const cfg = this.ensureConfig();
      if (!cfg.enabled || !cfg.nextRunAt || this.running) return;
      if (new Date(cfg.nextRunAt).getTime() > Date.now()) return;
      this.runNow().catch((error) => logger.warn(`MiSub AI inspection failed: ${error.message || error}`));
    }, 60 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const miSubAiInspectionService = new MiSubAiInspectionService();
