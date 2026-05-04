import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import db from '../database';
import { config } from '../config';
import { AiAccountModel } from '../models/AiChat';
import {
  AgentAutonomyConfigModel,
  AgentAutonomyRunModel,
  AgentCapabilityWeightModel,
  AgentProfileMemoryModel,
  AgentRecoveryIncidentModel,
  AgentRuntimeEventModel,
  AgentRuntimeSnapshotModel,
  AgentSkillJournalModel,
} from '../models/PersonalOS';
import type {
  AgentAutonomyConfig,
  AgentAutonomyState,
  AgentIncidentReportInput,
  AgentIncidentReportResult,
  AgentRecoveryIncident,
  AgentProfileMemory,
  AgentRuntimeActivityState,
  AgentRuntimeEvent,
  AgentRuntimeMemoryState,
  AgentRuntimeView,
  AgentSkillJournalView,
  AiRuntimeContext,
} from '../types';
import logger from '../utils/logger';
import { newspaperService } from './NewspaperService';
import { personalMemoryIngestionService } from './PersonalMemoryIngestionService';
import { proxyKernelService } from './ProxyKernelService';

const autonomyConfigModel = new AgentAutonomyConfigModel();
const autonomyRunModel = new AgentAutonomyRunModel();
const runtimeSnapshotModel = new AgentRuntimeSnapshotModel();
const recoveryIncidentModel = new AgentRecoveryIncidentModel();
const capabilityWeightModel = new AgentCapabilityWeightModel();
const runtimeEventModel = new AgentRuntimeEventModel();
const profileModel = new AgentProfileMemoryModel();
const skillModel = new AgentSkillJournalModel();
const aiAccountModel = new AiAccountModel();
const AUTO_COMPACTION_THRESHOLD = 60;
const AUTO_COMPACTION_COOLDOWN_MS = 2 * 60 * 1000;
const AUTONOMY_PROXY_STATUS_TIMEOUT_MS = 5000;
const AUTONOMY_PROXY_RECOVERY_TIMEOUT_MS = 15000;
const AUTONOMY_MEMORY_RECOVERY_TIMEOUT_MS = 20000;

function addHours(hours: number) {
  return new Date(Date.now() + Math.max(1, Math.min(168, Math.floor(Number(hours) || 6))) * 60 * 60 * 1000).toISOString();
}

function clipText(value: unknown, limit: number) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function normalizePattern(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function clipStack(value: unknown, limit: number) {
  return String(value || '').trim().slice(0, Math.max(0, limit));
}

function isCompactionNoiseEvent(event: AgentRuntimeEvent) {
  if (event.source === 'agent.compactor') return true;
  if (event.eventType === 'memory_compaction') return true;
  if (event.eventType === 'mode_change') return true;
  return false;
}

function buildCompactionGroupKey(event: AgentRuntimeEvent) {
  const path = String(event.content?.path || '').trim().toLowerCase();
  return normalizePattern(`${event.scope}:${event.source}:${event.eventType}:${event.title}:${path}`);
}

function chooseCompactionLayer(event: AgentRuntimeEvent, sampleSize: number): AgentRuntimeEvent['layer'] | null {
  const path = String(event.content?.path || '').trim();
  const toolCount = Array.isArray(event.content?.tools) ? event.content.tools.length : 0;
  const detail = normalizePattern(`${event.title} ${event.detail || ''} ${JSON.stringify(event.content || {})}`);

  if (event.scope === 'recovery' || event.scope === 'tool') {
    return 'long_term';
  }

  if (event.scope === 'page') {
    if (toolCount > 0 || sampleSize >= 2 || event.source === 'chat.runtime_context') {
      return 'short_term';
    }
    return null;
  }

  if (event.scope === 'chat') {
    if (toolCount > 0 || sampleSize >= 2) return 'short_term';
    if (detail.includes('plan') || detail.includes('结论') || detail.includes('修复') || detail.includes('恢复')) {
      return 'short_term';
    }
    return null;
  }

  if (event.scope === 'global') {
    if (sampleSize >= 2 || toolCount > 0) return 'long_term';
    return null;
  }

  return 'short_term';
}

function shouldArchiveLowValueMemory(event: AgentRuntimeEvent) {
  if (event.source !== 'agent.compactor') return false;
  const count = Number(event.content?.count || 0);
  const tools = Array.isArray(event.content?.tools) ? event.content.tools.length : 0;
  const latestContent = event.content?.latestContent || {};
  const userMessage = normalizePattern(String(latestContent.userMessage || ''));
  const assistantMessage = normalizePattern(String(latestContent.assistantMessage || ''));

  if (event.scope === 'page' && count <= 1 && tools === 0) {
    return true;
  }

  if (event.scope === 'chat') {
    if (!userMessage || event.title === '空消息') return true;
    if (count <= 1 && assistantMessage.length < 16 && tools === 0) return true;
  }

  return false;
}

function stripLegacyRuntimeWrapper(message: string) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\r/g, '');
  if (!normalized.startsWith('[Muse Section Context]')) {
    return raw;
  }
  const inlineTaskSplit = normalized.split(/\[Task\]/i);
  if (inlineTaskSplit.length > 1) {
    return inlineTaskSplit.slice(1).join('[Task]').trim();
  }
  const inlineUserSplit = normalized.split(/\b(?:user|message)\s*:/i);
  if (inlineUserSplit.length > 1) {
    return inlineUserSplit.slice(1).join(' ').trim();
  }
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const contentStart = lines.findIndex((line) => (
    line.startsWith('[Task]') ||
    line.startsWith('用户') ||
    /^user\s*:/i.test(line) ||
    /^message\s*:/i.test(line)
  ));
  if (contentStart >= 0) {
    const sliced = lines.slice(contentStart).join('\n').trim();
    return sliced
      .replace(/^\[Task\]\s*/i, '')
      .replace(/^用户\s*[:：]?\s*/i, '')
      .replace(/^user\s*:\s*/i, '')
      .replace(/^message\s*:\s*/i, '')
      .trim();
  }
  return '';
}

function normalizeLearnedUserMessage(message: string) {
  return stripLegacyRuntimeWrapper(message)
    .replace(/^(\[Task\]|user|message)\s*:\s*/i, '')
    .trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function validateSqliteSnapshot(filePath: string) {
  const snapshotDb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const result = snapshotDb.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${String(result)}`);
    }
  } finally {
    snapshotDb.close();
  }
}

type LearnedSignal = {
  key: string;
  value: string;
  category: AgentProfileMemory['category'];
  confidence: number;
};

type RuntimeHealthState = {
  aiHealthyCount: number;
  aiTotalCount: number;
  proxyHealthy: boolean;
  proxyMode: string;
  memoryHealthy: boolean;
  ruleHealthy: boolean;
  newspaperHealthy: boolean;
  systemLoad: number;
  memoryUsagePct: number;
  anomalies: Array<{
    category: AgentRecoveryIncident['category'];
    severity: AgentRecoveryIncident['severity'];
    title: string;
    detail: string;
    fingerprint: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
};

export class AgentAutonomyService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private autoCompacting = false;

  ensureConfig(): AgentAutonomyConfig {
    this.markStaleRunsFailed();
    this.compactRuntimeMemoryIfNeeded();
    return autonomyConfigModel.get();
  }

  updateConfig(input: Partial<AgentAutonomyConfig>): AgentAutonomyState {
    const current = this.ensureConfig();
    const intervalHours = Math.max(1, Math.min(168, Math.floor(Number(input.intervalHours ?? current.intervalHours) || 6)));
    const enabled = input.enabled ?? current.enabled;
    const nextRunAt = enabled ? addHours(intervalHours) : null;
    autonomyConfigModel.update({
      ...input,
      intervalHours,
      enabled,
      nextRunAt,
    });
    return this.getState();
  }

  listProfile() {
    return profileModel.list();
  }

  upsertProfileMemory(input: {
    key: string;
    value: string;
    category?: AgentProfileMemory['category'];
    confidence?: number;
    source?: string;
  }) {
    return profileModel.upsert({
      ...input,
      lastObservedAt: new Date().toISOString(),
    });
  }

  listSkills(limit = 20) {
    return skillModel.list(limit);
  }

  reportIncident(input: AgentIncidentReportInput): AgentIncidentReportResult {
    const detail = clipStack(input.detail, 4000) || '前端上报了空错误详情。';
    const title = clipText(input.title || '前端运行时异常', 120);
    const source = clipText(input.source || 'frontend.runtime', 80);
    const kind = input.kind || 'runtime_probe';
    const fingerprint = clipText(
      input.fingerprint || normalizePattern(`frontend:${kind}:${title}:${detail.slice(0, 240)}`),
      255,
    );
    const current = recoveryIncidentModel.getByFingerprint(fingerprint);
    const occurrenceCount = Number(current?.metadata?.occurrenceCount || 0) + 1;
    const metadata = {
      ...(current?.metadata || {}),
      ...(input.metadata || {}),
      source,
      kind,
      channel: 'frontend',
      occurrenceCount,
      lastReportedAt: new Date().toISOString(),
    };
    const incident = recoveryIncidentModel.upsert({
      category: 'integration',
      severity: input.severity || (kind === 'render' ? 'critical' : 'watch'),
      status: kind === 'render' ? 'failed' : 'open',
      title,
      detail,
      fingerprint,
      recoveryAction: 'record_frontend_runtime_incident',
      recoveryResult: '已写入自治事故账本，等待后续真实修复链消费。',
      metadata,
      resolvedAt: null,
    });
    const capability = capabilityWeightModel.remember({
      capability: 'frontend_runtime_observability',
      outcome: 'success',
      summary: `${title} 已进入自治事故账本，来源 ${source}，累计 ${occurrenceCount} 次。`,
      source: 'frontend_runtime',
    });

    skillModel.remember({
      category: kind === 'render' ? 'recovery' : 'automation',
      title: `前端异常沉淀 · ${title}`,
      summary: `前端运行时异常已被捕获并写入账本，来源 ${source}，类型 ${kind}。`,
      pattern: `frontend:${fingerprint}`,
      score: kind === 'render' ? 0.88 : 0.72,
      evidence: [title, source, kind, detail.slice(0, 180)].filter(Boolean),
      lastUsedAt: new Date().toISOString(),
    });

    this.logEvent({
      layer: 'raw',
      scope: 'recovery',
      source,
      eventType: kind,
      title,
      detail,
      content: metadata,
      confidence: kind === 'render' ? 0.92 : 0.76,
      originRefs: [`incident:${incident.id}`],
    });

    return { incident, capability };
  }

  getState(): AgentAutonomyState {
    this.pruneLegacySkillNoise();
    const cfg = this.ensureConfig();
    const sanitizeRun = (run: ReturnType<AgentAutonomyRunModel['list']>[number] | null) => {
      if (!run) return null;
      return {
        ...run,
        actions: Array.isArray(run.actions)
          ? run.actions.filter((action) => !String(action || '').toLowerCase().includes('rule_automation'))
          : [],
      };
    };
    const latestRun = sanitizeRun(autonomyRunModel.list(1)[0] || null);
    const history = autonomyRunModel.list(10).map((run) => sanitizeRun(run)!);
    return {
      config: cfg,
      latestRun,
      history,
      running: this.running,
      profile: this.listProfile(),
      skills: this.listSkills(20),
      latestSnapshot: runtimeSnapshotModel.list(1)[0] || null,
      recentIncidents: recoveryIncidentModel.list(12).filter((item) => item.category !== 'rules'),
      capabilityWeights: capabilityWeightModel.list(12).filter((item) => item.capability !== 'rule_automation'),
      automationHealth: {
        memoryIngestionEnabled: cfg.memoryIngestionEnabled,
        ruleAutomationEnabled: cfg.ruleAutomationEnabled,
        backupEnabled: cfg.backupEnabled,
      },
    };
  }

  logEvent(input: {
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
  }) {
    const scope = input.scope || 'global';
    const layer = input.layer || 'raw';
    const title = clipText(input.title, 160);
    const normalizedContent = input.content || {};
    const path = String(normalizedContent?.path || '').trim();
    const shouldDedupe =
      layer === 'raw' &&
      (
        input.source === 'frontend.page_observer' ||
        (scope === 'page' && path)
      );
    if (shouldDedupe) {
      const recent = runtimeEventModel.findRecentActive({
        layer,
        scope,
        source: input.source,
        eventType: input.eventType,
        title,
        path,
        withinSeconds: input.source === 'frontend.page_observer' ? 45 : 20,
      });
      if (recent) {
        return recent;
      }
    }
    const created = runtimeEventModel.create({
      layer,
      scope,
      source: input.source,
      eventType: input.eventType,
      title,
      detail: clipStack(input.detail, 4000),
      content: normalizedContent,
      confidence: input.confidence,
      shared: input.shared,
      originRefs: input.originRefs,
    });
    this.compactRuntimeMemoryIfNeeded();
    return created;
  }

  listEvents(limit = 80) {
    return runtimeEventModel.list({ limit: Math.max(1, Math.min(200, limit)) });
  }

  getMemoryState(): AgentRuntimeMemoryState {
    this.pruneLegacySkillNoise();
    const raw = runtimeEventModel.list({ layer: 'raw', status: 'active', limit: 80 });
    const shortTerm = runtimeEventModel.list({ layer: 'short_term', status: 'active', limit: 40 });
    const longTerm = runtimeEventModel.list({ layer: 'long_term', status: 'active', limit: 40 });
    const skills = this.listSkills(24);
    const profile = this.listProfile();
    const activeRaw = runtimeEventModel.count({ layer: 'raw', status: 'active' });
    const activeShortTerm = runtimeEventModel.count({ layer: 'short_term', status: 'active' });
    const activeLongTerm = runtimeEventModel.count({ layer: 'long_term', status: 'active' });
    const archivedRaw = runtimeEventModel.count({ layer: 'raw', status: 'archived' });
    const archivedShortTerm = runtimeEventModel.count({ layer: 'short_term', status: 'archived' });
    const archivedLongTerm = runtimeEventModel.count({ layer: 'long_term', status: 'archived' });
    return {
      raw,
      shortTerm,
      longTerm,
      skills,
      profile,
      totals: {
        active: {
          raw: activeRaw,
          shortTerm: activeShortTerm,
          longTerm: activeLongTerm,
          skills: skills.length,
          profile: profile.length,
        },
        archived: {
          raw: archivedRaw,
          shortTerm: archivedShortTerm,
          longTerm: archivedLongTerm,
        },
        cumulative: {
          raw: activeRaw + archivedRaw,
          shortTerm: activeShortTerm + archivedShortTerm,
          longTerm: activeLongTerm + archivedLongTerm,
          skills: skills.length,
          profile: profile.length,
        },
        pendingCompaction: activeRaw,
      },
    };
  }

  getActivityState(): AgentRuntimeActivityState {
    this.pruneLegacySkillNoise();
    return {
      runs: autonomyRunModel.list(12),
      incidents: recoveryIncidentModel.list(12).filter((item) => item.category !== 'rules'),
      capabilityWeights: capabilityWeightModel.list(12).filter((item) => item.capability !== 'rule_automation'),
      recentEvents: this.listEvents(30),
    };
  }

  getRuntimeView(): AgentRuntimeView {
    this.pruneLegacySkillNoise();
    const cfg = this.ensureConfig();
    const recentEvents = this.listEvents(40);
    const memory = this.getMemoryState();
    const lastCompactedAtMs = cfg.lastCompactedAt ? new Date(cfg.lastCompactedAt).getTime() : 0;
    const inCooldown = lastCompactedAtMs > 0 && (Date.now() - lastCompactedAtMs < AUTO_COMPACTION_COOLDOWN_MS);
    const nextCompactionAt = inCooldown ? new Date(lastCompactedAtMs + AUTO_COMPACTION_COOLDOWN_MS).toISOString() : null;
    const compactionState = memory.totals.pendingCompaction >= AUTO_COMPACTION_THRESHOLD
      ? (inCooldown ? 'cooldown' : 'pending')
      : 'idle';
    const pageFamiliarityMap = new Map<string, {
      path: string;
      observations: number;
      toolTouches: number;
      confidence: number;
      lastObservedAt: string | null;
    }>();
    for (const event of recentEvents) {
      const path = String(event.content?.path || '').trim();
      if (!path) continue;
      const current = pageFamiliarityMap.get(path) || {
        path,
        observations: 0,
        toolTouches: 0,
        confidence: 0,
        lastObservedAt: null,
      };
      current.observations += 1;
      if (event.scope === 'tool' || Array.isArray(event.content?.tools)) {
        current.toolTouches += Array.isArray(event.content?.tools) ? event.content.tools.length : 1;
      }
      current.confidence = Math.max(0.05, Math.min(1, Number(((current.observations * 0.08) + (current.toolTouches * 0.12)).toFixed(2))));
      current.lastObservedAt = event.createdAt;
      pageFamiliarityMap.set(path, current);
    }
    const currentFocusPath = recentEvents.find((item) => item.scope === 'page' && item.content?.path)?.content?.path || null;
    return {
      mode: cfg.executionMode,
      running: this.running,
      currentFocusPath,
      observationLoop: 'background',
      latestSnapshot: runtimeSnapshotModel.list(1)[0] || null,
      pageFamiliarity: [...pageFamiliarityMap.values()].sort((left, right) => right.confidence - left.confidence).slice(0, 12),
      recentEvents: recentEvents.slice(0, 12),
      memoryTotals: memory.totals,
      lastCompactedAt: cfg.lastCompactedAt,
      nextCompactionAt,
      compactionState,
    };
  }

  updateExecutionMode(mode: AgentAutonomyConfig['executionMode']) {
    const allowed = ['observe_only', 'guided_execute', 'full_execute'];
    const nextMode = allowed.includes(String(mode)) ? mode : 'observe_only';
    autonomyConfigModel.update({
      executionMode: nextMode,
      nextRunAt: addHours(this.ensureConfig().intervalHours),
    });
    this.logEvent({
      layer: 'raw',
      scope: 'global',
      source: 'agent.runtime',
      eventType: 'mode_change',
      title: `自治模式切换为 ${nextMode}`,
      detail: `Agent runtime execution mode changed to ${nextMode}.`,
      content: { mode: nextMode },
      confidence: 0.98,
    });
    return this.getRuntimeView();
  }

  compactRuntimeMemory() {
    const rawEvents = runtimeEventModel.list({ layer: 'raw', status: 'active', limit: 200 });
    const groups = new Map<string, AgentRuntimeEvent[]>();
    for (const event of rawEvents) {
      const key = buildCompactionGroupKey(event);
      const bucket = groups.get(key) || [];
      bucket.push(event);
      groups.set(key, bucket);
    }

    const archivedIds: number[] = [];
    let createdEntries = 0;
    let skippedEntries = 0;
    for (const [, events] of groups) {
      const sorted = [...events].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      const latest = sorted[0];
      archivedIds.push(...sorted.map((item) => item.id));
      if (isCompactionNoiseEvent(latest)) {
        skippedEntries += 1;
        continue;
      }
      const targetLayer = chooseCompactionLayer(latest, sorted.length);
      if (!targetLayer) {
        skippedEntries += 1;
        continue;
      }
      const relatedIds = sorted.map((item) => String(item.id));
      const detail = sorted.length > 1
        ? `已从 ${sorted.length} 条原始记录中提炼：${latest.detail || latest.title}`
        : (latest.detail || latest.title);
      runtimeEventModel.create({
        layer: targetLayer,
        scope: latest.scope,
        source: 'agent.compactor',
        eventType: `compact:${latest.eventType}`,
        title: latest.title,
        detail,
        content: {
          latestContent: latest.content,
          count: sorted.length,
          path: latest.content?.path || '',
          tools: latest.content?.tools || [],
        },
        confidence: Math.max(0.55, Math.min(0.98, Number((0.45 + (sorted.length * 0.08)).toFixed(2)))),
        shared: true,
        originRefs: relatedIds,
      });
      createdEntries += 1;
    }

    const lowValueMemoryIds = [
      ...runtimeEventModel.list({ layer: 'short_term', status: 'active', limit: 200 }),
      ...runtimeEventModel.list({ layer: 'long_term', status: 'active', limit: 120 }),
    ]
      .filter((event) => shouldArchiveLowValueMemory(event))
      .map((event) => event.id);

    const archived = runtimeEventModel.archive(archivedIds);
    const prunedMemory = runtimeEventModel.archive(lowValueMemoryIds);
    autonomyConfigModel.update({
      lastCompactedAt: new Date().toISOString(),
    });
    this.logEvent({
      layer: 'raw',
      scope: 'global',
      source: 'agent.compactor',
      eventType: 'memory_compaction',
      title: '运行时记忆已整理',
      detail: `已归档 ${archived} 条原始记录，生成 ${createdEntries} 条记忆，跳过 ${skippedEntries} 组低价值事件，并清理 ${prunedMemory} 条旧低价值记忆。`,
      content: { archived, processed: rawEvents.length, createdEntries, skippedEntries, prunedMemory },
      confidence: 0.92,
    });
    return this.getMemoryState();
  }

  buildImplicitChatContext(input: {
    userMessage: string;
    runtimeContext?: AiRuntimeContext | null;
  }) {
    this.pruneLegacySkillNoise();
    const query = normalizePattern(input.userMessage || '');
    const path = String(input.runtimeContext?.path || '').trim();
    const sections = [
      ...runtimeEventModel.list({ layer: 'long_term', status: 'active', limit: 24 }),
      ...runtimeEventModel.list({ layer: 'short_term', status: 'active', limit: 24 }),
    ].filter((item) => {
      const haystack = normalizePattern(`${item.title} ${item.detail} ${JSON.stringify(item.content || {})}`);
      if (path && String(item.content?.path || '') === path) return true;
      if (!query) return false;
      return haystack.includes(query) || query.includes(normalizePattern(item.title));
    }).slice(0, 6);

    const profile = profileModel.list().slice(0, 4).map((item) => `${item.key}: ${item.value}`);
    const memoryLines = sections.map((item) => `- [${item.layer}/${item.scope}] ${item.title}: ${clipText(item.detail || item.title, 180)}`);
    const parts = [
      profile.length > 0 ? ['[shared_profile]', ...profile].join('\n') : '',
      memoryLines.length > 0 ? ['[shared_memory]', ...memoryLines].join('\n') : '',
    ].filter(Boolean);
    return parts.join('\n\n');
  }

  private pruneLegacySkillNoise() {
    const rows = db.prepare(`
      SELECT id, category, title, summary, pattern, score, evidence_json, last_used_at
      FROM agent_skill_journal
      WHERE summary LIKE '%[Muse Section Context]%'
         OR evidence_json LIKE '%[Muse Section Context]%'
    `).all() as Array<{
      id: number;
      category: AgentSkillJournalView['category'];
      title: string;
      summary: string;
      pattern: string;
      score: number;
      evidence_json: string;
      last_used_at: string | null;
    }>;
    for (const row of rows) {
      const cleanedSummary = row.summary.replace(/\[Muse Section Context\][\s\S]*?(?=“|$)/g, '').trim();
      let evidence: string[] = [];
      try {
        evidence = JSON.parse(row.evidence_json || '[]');
      } catch {
        evidence = [];
      }
      const cleanedEvidence = evidence
        .map((item) => normalizeLearnedUserMessage(String(item || '')))
        .filter(Boolean)
        .slice(0, 8);
      if (!cleanedSummary && cleanedEvidence.length === 0) {
        db.prepare('DELETE FROM agent_skill_journal WHERE id = ?').run(row.id);
        continue;
      }
      db.prepare(`
        UPDATE agent_skill_journal
        SET summary = ?,
            evidence_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        cleanedSummary || row.summary,
        JSON.stringify(cleanedEvidence),
        row.id,
      );
    }
  }

  private compactRuntimeMemoryIfNeeded() {
    if (this.autoCompacting) return;
    const cfg = autonomyConfigModel.get();
    const pendingRaw = runtimeEventModel.count({ layer: 'raw', status: 'active' });
    const lastCompactedAt = cfg.lastCompactedAt ? new Date(cfg.lastCompactedAt).getTime() : 0;
    if (pendingRaw < AUTO_COMPACTION_THRESHOLD) return;
    if (Date.now() - lastCompactedAt < AUTO_COMPACTION_COOLDOWN_MS) return;
    this.autoCompacting = true;
    try {
      this.compactRuntimeMemory();
    } finally {
      this.autoCompacting = false;
    }
  }

  private resolveBackupDir(configValue: string) {
    return path.resolve(path.dirname(config.dbPath), configValue || './agent-backups');
  }

  private async createBackupSnapshot(cfg: AgentAutonomyConfig) {
    const targetDir = this.resolveBackupDir(cfg.backupDir);
    fs.mkdirSync(targetDir, { recursive: true });
    const fileName = `agent-autonomy-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const snapshotPath = path.join(targetDir, fileName);
    await db.backup(snapshotPath);
    validateSqliteSnapshot(snapshotPath);
    this.trimBackups(targetDir, cfg.backupRetentionCount);
    return snapshotPath;
  }

  private markStaleRunsFailed() {
    db.prepare(`
      UPDATE agent_autonomy_runs
      SET status = 'failed',
          summary = CASE WHEN summary = '' THEN '上次自治运行中断，已在下次读取状态时自动标记失败。' ELSE summary END,
          error = CASE WHEN error = '' THEN 'run interrupted before finish' ELSE error END,
          finished_at = CURRENT_TIMESTAMP
      WHERE finished_at IS NULL
        AND started_at < DATETIME('now', '-1 minutes')
    `).run();
  }

  private trimBackups(targetDir: string, retentionCount: number) {
    const keep = Math.max(1, Math.min(30, Math.floor(Number(retentionCount) || 7)));
    const snapshots = fs.readdirSync(targetDir)
      .filter((name) => name.endsWith('.db'))
      .map((name) => ({
        name,
        path: path.join(targetDir, name),
        mtime: fs.statSync(path.join(targetDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    snapshots.slice(keep).forEach((item) => fs.rmSync(item.path, { force: true }));
  }

  private inferProfileSignals(message: string): LearnedSignal[] {
    const text = normalizeLearnedUserMessage(String(message || ''));
    const signals: LearnedSignal[] = [];

    if (/(不和我汇报|不要问我|不要找我|自己推进|自己做|默认直接进入执行态|自主推进|不要频繁确认)/.test(text)) {
      signals.push({
        key: 'execution_style',
        value: '高自治执行：默认自己拆解、实施、排障、验证，不把本可自处理的工作甩回给用户。',
        category: 'preference',
        confidence: 0.98,
      });
    }

    if (/(提示词太多|太多了.*提示词|提示词别太多|别太多.*提示词|变笨了|变死了|别太啰嗦)/.test(text)) {
      signals.push({
        key: 'prompt_density',
        value: '偏好短提示、低负担、动作优先的 agent 行为，而不是重说明书式提示。',
        category: 'cognitive_style',
        confidence: 0.94,
      });
    }

    if (/(跨会话|持久记忆|共同成长|越用越聪明|自行演化能力|长短期记忆)/.test(text)) {
      signals.push({
        key: 'memory_expectation',
        value: '希望 Muse 具备跨会话长短期记忆、用户模型沉淀、能力自进化和经验复用。',
        category: 'goal',
        confidence: 0.99,
      });
    }

    if (/(持久化知识存储|记住用户习惯|历史问题处理方案|长期使用|自我改进|运行越久越强|越运行越强)/.test(text)) {
      signals.push({
        key: 'runtime_growth_expectation',
        value: '希望 Muse 作为长期运行的 Agent runtime，持续积累用户习惯、历史处理方案和可复用知识，运行越久越强。',
        category: 'goal',
        confidence: 0.99,
      });
    }

    if (/(监控服务器状态|系统异常|自己修复|自我修复|自愈|自动修复|异常时自己修复)/.test(text)) {
      signals.push({
        key: 'self_heal_expectation',
        value: '期望 Muse 持续监控服务与系统异常，在检测到报错、退化或故障时自主排查、自主修复并验证结果。',
        category: 'goal',
        confidence: 0.98,
      });
    }

    if (/(自动进行任务|自动任务|自治运行时|agent runtime|自主能力不够|权限也不够)/i.test(text)) {
      signals.push({
        key: 'autonomy_runtime_expectation',
        value: '期望 Muse 具备更强自治执行能力和更完整执行权限，能长期自动运行任务而不是等待逐条指令。',
        category: 'goal',
        confidence: 0.97,
      });
    }

    if (/(不要.*规则|不是.*规则|有思考能力.*不是.*规则|别再.*规则|规则冒充智能)/.test(text)) {
      signals.push({
        key: 'reasoning_over_rules',
        value: '明确偏好有思考和自愈能力的 Agent runtime，不接受用规则模板或规则执行冒充智能。',
        category: 'preference',
        confidence: 0.99,
      });
    }

    if (/(Hermes Agent|Hermes)/i.test(text)) {
      signals.push({
        key: 'desired_agent_archetype',
        value: '目标形态接近 Hermes Agent：能持续记忆、自动化运行、沉淀技能，并跨会话与用户共同成长。',
        category: 'goal',
        confidence: 0.96,
      });
    }

    if (/(能调用所有能调用的|调用所有能调用的)/.test(text)) {
      signals.push({
        key: 'tooling_expectation',
        value: '期望 agent 默认把可调用工具视为执行面，而不是只输出文字。',
        category: 'constraint',
        confidence: 0.92,
      });
    }

    return signals;
  }

  private rememberWorkflowPattern(input: {
    userMessage: string;
    toolDetails?: Array<{ tool: string; ok: boolean; error?: string; target?: string }>;
    fallbackAccountName?: string | null;
  }) {
    const learnedUserMessage = normalizeLearnedUserMessage(input.userMessage);
    const tools = Array.isArray(input.toolDetails)
      ? input.toolDetails.filter((item) => item?.tool).map((item) => item.tool)
      : [];
    const hasFailures = Array.isArray(input.toolDetails) && input.toolDetails.some((item) => item && item.ok === false);
    const recoveryMode = hasFailures || !!input.fallbackAccountName;
    if (!recoveryMode && tools.length === 0 && learnedUserMessage.length < 12) {
      return null;
    }
    const pattern = normalizePattern(tools.length > 0 ? tools.join(' -> ') : 'conversation_only');
    const title = recoveryMode
      ? `恢复链: ${tools.slice(0, 3).join(' -> ') || 'fallback'}`
      : tools.length > 0
      ? `执行链: ${tools.slice(0, 3).join(' -> ')}`
      : '纯对话偏好沉淀';
    const summary = recoveryMode
      ? `用户请求“${clipText(learnedUserMessage || input.userMessage, 80)}”时，系统出现异常或切换后备账号，并执行了恢复链路。`
      : tools.length > 0
      ? `用户请求“${clipText(learnedUserMessage || input.userMessage, 80)}”时，系统实际走了 ${tools.length} 个工具节点。`
      : `用户请求“${clipText(learnedUserMessage || input.userMessage, 80)}”主要体现偏好信号，没有触发工具执行。`;
    const evidence = [
      clipText(learnedUserMessage || input.userMessage, 120),
      ...(input.fallbackAccountName ? [`fallback:${input.fallbackAccountName}`] : []),
      ...tools.slice(0, 6),
    ];

    return skillModel.remember({
      category: recoveryMode ? 'recovery' : tools.length > 0 ? 'workflow' : 'tool_pattern',
      title,
      summary,
      pattern,
      score: recoveryMode ? 0.95 : tools.length > 0 ? 0.9 : 0.55,
      evidence,
      lastUsedAt: new Date().toISOString(),
    });
  }

  private getSystemLoad() {
    const cpus = Math.max(1, os.cpus().length || 1);
    return Number((os.loadavg()[0] / cpus).toFixed(2));
  }

  private getMemoryUsagePct() {
    const total = Math.max(1, os.totalmem());
    return Number((((total - os.freemem()) / total) * 100).toFixed(1));
  }

  private inferOverallStatus(health: RuntimeHealthState) {
    if (health.anomalies.some((item) => item.severity === 'critical')) return 'critical' as const;
    if (health.anomalies.length > 0) return 'watch' as const;
    return 'healthy' as const;
  }

  private async collectRuntimeHealth(): Promise<RuntimeHealthState> {
    const [proxyStatus, memoryState] = await Promise.all([
      withTimeout(proxyKernelService.getStatus(), AUTONOMY_PROXY_STATUS_TIMEOUT_MS, 'Proxy kernel status').catch((error) => {
        logger.warn(`Autonomy could not read proxy kernel status: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }),
      Promise.resolve(personalMemoryIngestionService.getState()),
    ]);

    const aiAccounts = aiAccountModel.list();
    const healthyAi = aiAccounts.filter((item) => item.status === 'active');
    const newspaperHealth = newspaperService.getHealth();
    const latestMemoryRun = memoryState.latestRun;

    const anomalies: RuntimeHealthState['anomalies'] = [];
    if (healthyAi.length === 0 && aiAccounts.length > 0) {
      anomalies.push({
        category: 'ai',
        severity: 'critical',
        title: 'AI 账号池全部不可用',
        detail: '当前没有任何 active 状态的 AI 账号，自动执行会失去真实模型支持。',
        fingerprint: 'ai:no-healthy-accounts',
        metadata: {
          accounts: aiAccounts.map((item) => ({
            id: item.id,
            name: item.name || item.provider,
            provider: item.provider,
            status: item.status,
            lastError: item.last_error || '',
          })),
        },
      });
    }

    if (proxyStatus && !proxyStatus.running && (proxyStatus.availableSources?.length || 0) > 0) {
      anomalies.push({
        category: 'proxy',
        severity: 'critical',
        title: '内置代理内核未运行',
        detail: '代理内核当前未运行，但仍存在可自动恢复的 MiSub 来源。',
        fingerprint: 'proxy:kernel-down',
        metadata: {
          sourceCount: proxyStatus.availableSources.length,
          lastError: proxyStatus.lastError || '',
        },
      });
    }

    if (latestMemoryRun?.status === 'failed') {
      anomalies.push({
        category: 'memory',
        severity: 'watch',
        title: '长期记忆摄取最近失败',
        detail: latestMemoryRun.error || latestMemoryRun.summary || '最近一次记忆摄取失败。',
        fingerprint: 'memory:latest-run-failed',
        metadata: {
          latestRunId: latestMemoryRun.id,
          finishedAt: latestMemoryRun.finishedAt,
        },
      });
    }

    const systemLoad = this.getSystemLoad();
    const memoryUsagePct = this.getMemoryUsagePct();

    if (systemLoad >= 0.92 || memoryUsagePct >= 92) {
      anomalies.push({
        category: 'server',
        severity: 'critical',
        title: '宿主机资源压力过高',
        detail: `当前系统负载 ${systemLoad}，内存占用 ${memoryUsagePct}% ，已经接近异常阈值。`,
        fingerprint: 'server:resource-pressure-critical',
        metadata: { systemLoad, memoryUsagePct },
      });
    } else if (systemLoad >= 0.78 || memoryUsagePct >= 85) {
      anomalies.push({
        category: 'server',
        severity: 'watch',
        title: '宿主机资源压力偏高',
        detail: `当前系统负载 ${systemLoad}，内存占用 ${memoryUsagePct}% ，建议继续观察。`,
        fingerprint: 'server:resource-pressure-watch',
        metadata: { systemLoad, memoryUsagePct },
      });
    }

    return {
      aiHealthyCount: healthyAi.length,
      aiTotalCount: aiAccounts.length,
      proxyHealthy: !!proxyStatus?.running,
      proxyMode: proxyStatus?.running ? 'kernel' : 'degraded',
      memoryHealthy: latestMemoryRun ? latestMemoryRun.status !== 'failed' : true,
      ruleHealthy: true,
      newspaperHealthy: !!newspaperHealth.ok,
      systemLoad,
      memoryUsagePct,
      anomalies,
      metadata: {
        proxy: proxyStatus ? {
          running: proxyStatus.running,
          sourceLabel: proxyStatus.sourceLabel,
          sourceCount: proxyStatus.availableSources?.length || 0,
          lastError: proxyStatus.lastError || '',
        } : null,
        newspaper: newspaperHealth,
        memoryLatestRun: latestMemoryRun,
      },
    };
  }

  private async attemptSelfHeal(health: RuntimeHealthState) {
    const recoveries: string[] = [];
    const handledFingerprints = new Set<string>();

    for (const anomaly of health.anomalies) {
      if (handledFingerprints.has(anomaly.fingerprint)) continue;
      handledFingerprints.add(anomaly.fingerprint);

      let recoveryAction = '';
      let recoveryResult = '';
      let status: AgentRecoveryIncident['status'] = 'open';

      try {
        if (anomaly.fingerprint === 'proxy:kernel-down') {
          recoveryAction = 'auto_bootstrap_proxy_kernel';
          const nextStatus = await withTimeout(
            proxyKernelService.ensureKernelBootstrapped(),
            AUTONOMY_PROXY_RECOVERY_TIMEOUT_MS,
            'Proxy kernel recovery',
          );
          if (nextStatus?.running) {
            status = 'resolved';
            recoveryResult = 'Muse 已自动重启内置代理内核并恢复默认代理接管。';
            recoveries.push('proxy_kernel_recovered');
            capabilityWeightModel.remember({
              capability: 'proxy_recovery',
              outcome: 'success',
              summary: recoveryResult,
            });
          } else {
            status = 'failed';
            recoveryResult = '尝试自动启动内置代理内核，但当前仍未恢复运行。';
            capabilityWeightModel.remember({
              capability: 'proxy_recovery',
              outcome: 'failed',
              summary: recoveryResult,
            });
          }
        } else if (anomaly.fingerprint === 'memory:latest-run-failed') {
          recoveryAction = 'rerun_memory_ingestion';
          const state = await withTimeout(
            personalMemoryIngestionService.runNow({ force: true }),
            AUTONOMY_MEMORY_RECOVERY_TIMEOUT_MS,
            'Memory ingestion recovery',
          );
          if (state.latestRun?.status === 'success') {
            status = 'resolved';
            recoveryResult = 'Muse 已自动重跑长期记忆摄取并恢复成功。';
            recoveries.push('memory_ingestion_recovered');
            capabilityWeightModel.remember({
              capability: 'memory_ingestion',
              outcome: 'success',
              summary: recoveryResult,
            });
          } else {
            status = 'failed';
            recoveryResult = '自动重跑长期记忆摄取后仍未恢复。';
            capabilityWeightModel.remember({
              capability: 'memory_ingestion',
              outcome: 'failed',
              summary: recoveryResult,
            });
          }
        } else if (anomaly.category === 'ai') {
          recoveryAction = 'record_ai_pool_failure';
          status = 'failed';
          recoveryResult = '当前没有可自动修复的有效 AI 凭证，已记录为待外部恢复。';
          capabilityWeightModel.remember({
            capability: 'ai_reliability',
            outcome: 'failed',
            summary: recoveryResult,
          });
        } else if (anomaly.category === 'server') {
          recoveryAction = 'record_resource_pressure';
          status = anomaly.severity === 'critical' ? 'failed' : 'open';
          recoveryResult = anomaly.severity === 'critical'
            ? '检测到宿主机资源压力过高，当前仅完成告警留档。'
            : '检测到宿主机资源压力偏高，已纳入自治监控。';
          capabilityWeightModel.remember({
            capability: 'runtime_stability',
            outcome: anomaly.severity === 'critical' ? 'failed' : 'neutral',
            summary: recoveryResult,
          });
        }
      } catch (error) {
        status = 'failed';
        recoveryResult = error instanceof Error ? error.message : String(error);
        capabilityWeightModel.remember({
          capability: anomaly.category === 'proxy'
            ? 'proxy_recovery'
            : anomaly.category === 'memory'
            ? 'memory_ingestion'
            : anomaly.category === 'ai'
            ? 'ai_reliability'
            : 'runtime_stability',
          outcome: 'failed',
          summary: recoveryResult,
        });
      }

      recoveryIncidentModel.upsert({
        category: anomaly.category,
        severity: anomaly.severity,
        status,
        title: anomaly.title,
        detail: anomaly.detail,
        fingerprint: anomaly.fingerprint,
        recoveryAction,
        recoveryResult,
        metadata: anomaly.metadata,
        resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
      });

      if (recoveryAction && recoveryResult) {
        skillModel.remember({
          category: status === 'resolved' ? 'recovery' : 'automation',
          title: `${anomaly.title} · ${recoveryAction}`,
          summary: recoveryResult,
          pattern: `${anomaly.fingerprint}:${recoveryAction}`,
          score: status === 'resolved' ? 0.95 : status === 'failed' ? 0.35 : 0.6,
          evidence: [anomaly.title, recoveryAction, recoveryResult].filter(Boolean),
          lastUsedAt: new Date().toISOString(),
        });
      }
    }

    return recoveries;
  }

  async learnFromConversation(input: {
    userMessage: string;
    assistantMessage?: string;
    toolDetails?: Array<{ tool: string; ok: boolean; error?: string; target?: string }>;
    fallbackAccountName?: string | null;
    runtimeContext?: AiRuntimeContext | null;
    accountName?: string | null;
    provider?: string | null;
    model?: string | null;
  }) {
    const cfg = this.ensureConfig();
    const actions: string[] = [];

    this.logEvent({
      layer: 'raw',
      scope: 'chat',
      source: 'chat.session',
      eventType: 'conversation',
      title: clipText(input.userMessage || '空消息', 120),
      detail: clipText(input.assistantMessage || '模型未返回正文', 260),
      content: {
        userMessage: input.userMessage,
        assistantMessage: input.assistantMessage || '',
        path: input.runtimeContext?.path || '',
        section: input.runtimeContext?.section || '',
        provider: input.provider || '',
        model: input.model || '',
        accountName: input.accountName || '',
        fallbackAccountName: input.fallbackAccountName || '',
      },
      confidence: 0.74,
    });

    if (input.runtimeContext?.path) {
      this.logEvent({
        layer: 'raw',
        scope: 'page',
        source: 'chat.runtime_context',
        eventType: 'page_observation',
        title: input.runtimeContext.section || input.runtimeContext.path,
        detail: `模型在 ${input.runtimeContext.path} 页面完成一次对话观察。`,
        content: {
          path: input.runtimeContext.path,
          section: input.runtimeContext.section || '',
          routeContext: input.runtimeContext.routeContext || {},
        },
        confidence: 0.72,
      });
    }

    for (const tool of input.toolDetails || []) {
      this.logEvent({
        layer: 'raw',
        scope: 'tool',
        source: 'chat.tool_execution',
        eventType: tool.ok ? 'tool_success' : 'tool_failure',
        title: tool.tool,
        detail: tool.target || tool.error || (tool.ok ? '执行完成' : '执行失败'),
        content: {
          tool: tool.tool,
          ok: tool.ok,
          target: tool.target || '',
          error: tool.error || '',
          path: input.runtimeContext?.path || '',
          tools: [tool.tool],
        },
        confidence: tool.ok ? 0.88 : 0.68,
      });
    }

    if (cfg.profileLearningEnabled) {
      const signals = this.inferProfileSignals(input.userMessage);
      for (const signal of signals) {
        profileModel.upsert({
          key: signal.key,
          value: signal.value,
          category: signal.category,
          confidence: signal.confidence,
          source: 'chat_learning',
          lastObservedAt: new Date().toISOString(),
        });
        actions.push(`profile:${signal.key}`);
      }
    }

    if (cfg.skillLearningEnabled) {
      const learnedSkill = this.rememberWorkflowPattern(input);
      if (learnedSkill?.pattern) {
        actions.push(`skill:${learnedSkill.pattern}`);
      }
    }

    return {
      actions,
      profile: this.listProfile(),
      skills: this.listSkills(10),
    };
  }

  async runNow(options?: { force?: boolean }) {
    if (this.running) return this.getState();
    const cfg = this.ensureConfig();
    if (!options?.force && !cfg.enabled) return this.getState();

    const runId = autonomyRunModel.create();
    this.running = true;
    let backupPath = '';
    const actions: string[] = [];
    this.logEvent({
      layer: 'raw',
      scope: 'task',
      source: 'agent.runtime',
      eventType: 'autonomy_run_started',
      title: '后台自治开始运行',
      detail: `Agent runtime started in ${cfg.executionMode} mode.`,
      content: { mode: cfg.executionMode, force: !!options?.force },
      confidence: 0.93,
    });

    try {
      const beforeHealth = await this.collectRuntimeHealth();
      if (beforeHealth.anomalies.length > 0) {
        actions.push(...beforeHealth.anomalies.map((item) => `anomaly:${item.fingerprint}`));
      }

      const recoveries = await this.attemptSelfHeal(beforeHealth);
      actions.push(...recoveries);

      if (cfg.memoryIngestionEnabled) {
        try {
          await withTimeout(personalMemoryIngestionService.runNow({ force: true }), 20000, 'Agent memory ingestion');
          actions.push('memory_ingestion');
          capabilityWeightModel.remember({
            capability: 'memory_ingestion',
            outcome: 'success',
            summary: '自治运行完成长期记忆自动摄取。',
          });
        } catch (error: any) {
          const detail = error?.message || String(error);
          actions.push('memory_ingestion_timeout');
          recoveryIncidentModel.upsert({
            category: 'memory',
            severity: 'watch',
            status: 'failed',
            title: '自治中的长期记忆摄取超时',
            detail,
            fingerprint: 'autonomy:memory-ingestion-timeout',
            recoveryAction: 'continue_without_blocking',
            recoveryResult: '主自治循环已跳过慢任务，避免整轮自治被阻塞。',
            metadata: { detail },
          });
          capabilityWeightModel.remember({
            capability: 'memory_ingestion',
            outcome: 'failed',
            summary: detail,
          });
        }
      }

      if (cfg.backupEnabled) {
        try {
          backupPath = await withTimeout(this.createBackupSnapshot(cfg), 12000, 'Agent backup snapshot');
          actions.push('backup_snapshot');
          capabilityWeightModel.remember({
            capability: 'backup_resilience',
            outcome: 'success',
            summary: '自治运行完成数据库快照备份。',
          });
        } catch (error: any) {
          const detail = error?.message || String(error);
          actions.push('backup_snapshot_failed');
          capabilityWeightModel.remember({
            capability: 'backup_resilience',
            outcome: 'failed',
            summary: detail,
          });
        }
      }

      const afterHealth = await this.collectRuntimeHealth();
      const latestSnapshot = runtimeSnapshotModel.create({
        status: this.inferOverallStatus(afterHealth),
        summary: afterHealth.anomalies.length === 0
          ? `Agent runtime healthy. ${recoveries.length} recoveries executed, ${afterHealth.aiHealthyCount}/${afterHealth.aiTotalCount} AI accounts healthy.`
          : `Agent runtime detected ${afterHealth.anomalies.length} anomalies with ${recoveries.length} recovery actions.`,
        aiHealthyCount: afterHealth.aiHealthyCount,
        aiTotalCount: afterHealth.aiTotalCount,
        proxyHealthy: afterHealth.proxyHealthy,
        proxyMode: afterHealth.proxyMode,
        memoryHealthy: afterHealth.memoryHealthy,
        ruleHealthy: afterHealth.ruleHealthy,
        newspaperHealthy: afterHealth.newspaperHealthy,
        systemLoad: afterHealth.systemLoad,
        memoryUsagePct: afterHealth.memoryUsagePct,
        anomalies: afterHealth.anomalies.map((item) => item.title),
        recoveries,
        metadata: afterHealth.metadata,
      });
      actions.push(`runtime_snapshot:${latestSnapshot.status}`);
      capabilityWeightModel.remember({
        capability: 'runtime_stability',
        outcome: latestSnapshot.status === 'critical' ? 'failed' : latestSnapshot.status === 'watch' ? 'neutral' : 'success',
        summary: latestSnapshot.summary,
      });

      autonomyRunModel.finish(runId, {
        status: 'success',
        summary: `Agent autonomy completed ${actions.length} actions and persisted runtime snapshot ${latestSnapshot.id}.`,
        actions,
        backupPath,
      });
      autonomyConfigModel.update({
        lastRunAt: new Date().toISOString(),
        nextRunAt: addHours(cfg.intervalHours),
      });
      this.logEvent({
        layer: 'raw',
        scope: 'task',
        source: 'agent.runtime',
        eventType: 'autonomy_run_finished',
        title: '后台自治运行完成',
        detail: `Agent autonomy completed ${actions.length} actions successfully.`,
        content: { actions, backupPath, runId },
        confidence: 0.95,
      });
    } catch (error: any) {
      capabilityWeightModel.remember({
        capability: 'runtime_stability',
        outcome: 'failed',
        summary: error.message || 'Agent autonomy run failed',
      });
      autonomyRunModel.finish(runId, {
        status: 'failed',
        summary: 'Agent autonomy run failed.',
        actions,
        backupPath,
        error: error.message || 'Agent autonomy run failed',
      });
      autonomyConfigModel.update({
        lastRunAt: new Date().toISOString(),
        nextRunAt: addHours(cfg.intervalHours),
      });
      this.logEvent({
        layer: 'raw',
        scope: 'task',
        source: 'agent.runtime',
        eventType: 'autonomy_run_failed',
        title: '后台自治运行失败',
        detail: error.message || 'Agent autonomy run failed',
        content: { actions, backupPath, runId },
        confidence: 0.86,
      });
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
      this.runNow().catch((error) => logger.warn(`Agent autonomy run failed: ${error.message || error}`));
    }, 60 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const agentAutonomyService = new AgentAutonomyService();
