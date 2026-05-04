"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRuntimeEventModel = exports.AgentCapabilityWeightModel = exports.AgentRecoveryIncidentModel = exports.AgentRuntimeSnapshotModel = exports.AgentAutonomyRunModel = exports.AgentAutonomyConfigModel = exports.AgentSkillJournalModel = exports.AgentProfileMemoryModel = exports.PersonalMemoryModel = exports.PersonalActionStateModel = exports.PersonalOsRuleModel = void 0;
const database_1 = __importDefault(require("../database"));
function parseJson(value, fallback) {
    try {
        return JSON.parse(value || '');
    }
    catch {
        return fallback;
    }
}
class PersonalOsRuleModel {
    list() {
        return database_1.default
            .prepare('SELECT * FROM personal_os_rules ORDER BY is_enabled DESC, updated_at DESC, id DESC')
            .all()
            .map((row) => this.toView(row));
    }
    getById(id) {
        const row = database_1.default.prepare('SELECT * FROM personal_os_rules WHERE id = ?').get(id);
        return row ? this.toView(row) : undefined;
    }
    create(data) {
        const result = database_1.default.prepare(`
      INSERT INTO personal_os_rules (name, description, scope, trigger_type, config_json, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.name || '新规则', data.description || '', data.scope || 'inbox', data.trigger_type || 'account_error', JSON.stringify(data.config || {}), data.is_enabled ?? 1);
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const current = this.getById(id);
        if (!current)
            return undefined;
        database_1.default.prepare(`
      UPDATE personal_os_rules
      SET
        name = ?,
        description = ?,
        scope = ?,
        trigger_type = ?,
        config_json = ?,
        is_enabled = ?,
        last_triggered_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.name ?? current.name, data.description ?? current.description, data.scope ?? current.scope, data.trigger_type ?? current.trigger_type, JSON.stringify(data.config ?? current.config), data.is_enabled ?? current.is_enabled, data.last_triggered_at ?? current.last_triggered_at, id);
        return this.getById(id);
    }
    delete(id) {
        return database_1.default.prepare('DELETE FROM personal_os_rules WHERE id = ?').run(id).changes > 0;
    }
    markTriggered(id) {
        database_1.default.prepare('UPDATE personal_os_rules SET last_triggered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }
    toView(row) {
        const { config_json, ...rest } = row;
        return {
            ...rest,
            config: parseJson(config_json, {}),
        };
    }
}
exports.PersonalOsRuleModel = PersonalOsRuleModel;
class PersonalActionStateModel {
    list() {
        return database_1.default.prepare('SELECT * FROM personal_action_states ORDER BY updated_at DESC').all();
    }
    mapByActionId() {
        return new Map(this.list().map((item) => [item.action_id, item]));
    }
    upsert(actionId, status, note = '') {
        database_1.default.prepare(`
      INSERT INTO personal_action_states (action_id, status, note, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(action_id) DO UPDATE SET
        status = excluded.status,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `).run(actionId, status, note);
        return database_1.default.prepare('SELECT * FROM personal_action_states WHERE action_id = ?').get(actionId);
    }
    clear(actionId) {
        return database_1.default.prepare('DELETE FROM personal_action_states WHERE action_id = ?').run(actionId).changes > 0;
    }
}
exports.PersonalActionStateModel = PersonalActionStateModel;
class PersonalMemoryModel {
    list() {
        return database_1.default
            .prepare('SELECT * FROM personal_memory ORDER BY is_pinned DESC, updated_at DESC, id DESC')
            .all()
            .map((row) => this.toView(row));
    }
    getById(id) {
        const row = database_1.default.prepare('SELECT * FROM personal_memory WHERE id = ?').get(id);
        return row ? this.toView(row) : undefined;
    }
    create(data) {
        const result = database_1.default.prepare(`
      INSERT INTO personal_memory (
        title, content, kind, tags_json, source, entity_type, entity_key, is_pinned, is_resolved, last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.title || '新记忆', data.content || '', data.kind || 'note', JSON.stringify(data.tags || []), data.source || 'manual', data.entity_type || '', data.entity_key || '', data.is_pinned ?? 0, data.is_resolved ?? 0, data.last_reviewed_at || null);
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const current = this.getById(id);
        if (!current)
            return undefined;
        database_1.default.prepare(`
      UPDATE personal_memory
      SET
        title = ?,
        content = ?,
        kind = ?,
        tags_json = ?,
        source = ?,
        entity_type = ?,
        entity_key = ?,
        is_pinned = ?,
        is_resolved = ?,
        last_reviewed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.title ?? current.title, data.content ?? current.content, data.kind ?? current.kind, JSON.stringify(data.tags ?? current.tags), data.source ?? current.source, data.entity_type ?? current.entity_type, data.entity_key ?? current.entity_key, data.is_pinned ?? current.is_pinned, data.is_resolved ?? current.is_resolved, data.last_reviewed_at ?? current.last_reviewed_at, id);
        return this.getById(id);
    }
    delete(id) {
        return database_1.default.prepare('DELETE FROM personal_memory WHERE id = ?').run(id).changes > 0;
    }
    toView(row) {
        const { tags_json, ...rest } = row;
        return {
            ...rest,
            tags: parseJson(tags_json, []),
        };
    }
}
exports.PersonalMemoryModel = PersonalMemoryModel;
class AgentProfileMemoryModel {
    list() {
        return database_1.default.prepare('SELECT * FROM agent_profile_memory ORDER BY confidence DESC, updated_at DESC, id DESC').all();
    }
    getByKey(key) {
        return database_1.default.prepare('SELECT * FROM agent_profile_memory WHERE key = ?').get(key);
    }
    upsert(data) {
        const current = this.getByKey(data.key);
        const confidence = Math.max(0.05, Math.min(1, Number(data.confidence ?? current?.confidence ?? 0.6)));
        database_1.default.prepare(`
      INSERT INTO agent_profile_memory (key, value, category, confidence, source, last_observed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        confidence = excluded.confidence,
        source = excluded.source,
        last_observed_at = excluded.last_observed_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(data.key, data.value, data.category || current?.category || 'preference', confidence, data.source || current?.source || 'manual', data.lastObservedAt || current?.last_observed_at || new Date().toISOString());
        return this.getByKey(data.key);
    }
}
exports.AgentProfileMemoryModel = AgentProfileMemoryModel;
class AgentSkillJournalModel {
    toView(row) {
        return {
            ...row,
            evidence: parseJson(row.evidence_json, []),
        };
    }
    list(limit = 20) {
        return database_1.default
            .prepare('SELECT * FROM agent_skill_journal ORDER BY score DESC, updated_at DESC, id DESC LIMIT ?')
            .all(limit)
            .map((row) => this.toView(row));
    }
    findByPattern(pattern) {
        return database_1.default.prepare('SELECT * FROM agent_skill_journal WHERE pattern = ?').get(pattern);
    }
    remember(data) {
        const current = this.findByPattern(data.pattern);
        const score = Math.max(0.05, Math.min(1, Number(data.score ?? current?.score ?? 0.6)));
        const normalizeEvidence = (value) => {
            const text = String(value || '').trim();
            if (!text)
                return '';
            if (!text.startsWith('[Muse Section Context]'))
                return text;
            const taskSplit = text.split(/\[Task\]/i);
            if (taskSplit.length > 1)
                return taskSplit.slice(1).join('[Task]').trim();
            const userSplit = text.split(/\b(?:user|message)\s*:/i);
            if (userSplit.length > 1)
                return userSplit.slice(1).join(' ').trim();
            return '';
        };
        const nextEvidence = [...new Set([...(current ? parseJson(current.evidence_json, []) : []), ...(data.evidence || [])])]
            .map((item) => normalizeEvidence(item))
            .filter(Boolean)
            .slice(0, 8);
        database_1.default.prepare(`
      INSERT INTO agent_skill_journal (category, title, summary, pattern, score, evidence_json, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(pattern) DO UPDATE SET
        category = excluded.category,
        title = excluded.title,
        summary = excluded.summary,
        score = excluded.score,
        evidence_json = excluded.evidence_json,
        last_used_at = excluded.last_used_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(data.category, data.title, data.summary, data.pattern, score, JSON.stringify(nextEvidence), data.lastUsedAt || new Date().toISOString());
        return this.list(50).find((item) => item.pattern === data.pattern);
    }
}
exports.AgentSkillJournalModel = AgentSkillJournalModel;
class AgentAutonomyConfigModel {
    get() {
        const row = database_1.default.prepare('SELECT * FROM agent_autonomy_config WHERE id = 1').get();
        if (!row) {
            throw new Error('agent autonomy config not initialized');
        }
        return {
            enabled: !!row.enabled,
            intervalHours: Number(row.interval_hours || 6),
            executionMode: row.execution_mode || 'observe_only',
            memoryIngestionEnabled: !!row.memory_ingestion_enabled,
            ruleAutomationEnabled: !!row.rule_automation_enabled,
            profileLearningEnabled: !!row.profile_learning_enabled,
            skillLearningEnabled: !!row.skill_learning_enabled,
            backupEnabled: !!row.backup_enabled,
            backupDir: row.backup_dir || '',
            backupRetentionCount: Number(row.backup_retention_count || 7),
            lastRunAt: row.last_run_at || null,
            nextRunAt: row.next_run_at || null,
            lastCompactedAt: row.last_compacted_at || null,
            updatedAt: row.updated_at || null,
        };
    }
    update(input) {
        const current = this.get();
        database_1.default.prepare(`
      UPDATE agent_autonomy_config
      SET enabled = ?,
          interval_hours = ?,
          execution_mode = ?,
          memory_ingestion_enabled = ?,
          rule_automation_enabled = ?,
          profile_learning_enabled = ?,
          skill_learning_enabled = ?,
          backup_enabled = ?,
          backup_dir = ?,
          backup_retention_count = ?,
          last_run_at = ?,
          next_run_at = ?,
          last_compacted_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run((input.enabled ?? current.enabled) ? 1 : 0, input.intervalHours ?? current.intervalHours, input.executionMode ?? current.executionMode, (input.memoryIngestionEnabled ?? current.memoryIngestionEnabled) ? 1 : 0, (input.ruleAutomationEnabled ?? current.ruleAutomationEnabled) ? 1 : 0, (input.profileLearningEnabled ?? current.profileLearningEnabled) ? 1 : 0, (input.skillLearningEnabled ?? current.skillLearningEnabled) ? 1 : 0, (input.backupEnabled ?? current.backupEnabled) ? 1 : 0, input.backupDir ?? current.backupDir, input.backupRetentionCount ?? current.backupRetentionCount, input.lastRunAt ?? current.lastRunAt, input.nextRunAt ?? current.nextRunAt, input.lastCompactedAt ?? current.lastCompactedAt);
        return this.get();
    }
}
exports.AgentAutonomyConfigModel = AgentAutonomyConfigModel;
class AgentAutonomyRunModel {
    list(limit = 10) {
        return database_1.default.prepare('SELECT * FROM agent_autonomy_runs ORDER BY started_at DESC, id DESC LIMIT ?').all(limit).map((row) => ({
            id: row.id,
            status: row.status,
            summary: row.summary || '',
            actions: parseJson(row.actions_json, []),
            backupPath: row.backup_path || '',
            error: row.error || '',
            startedAt: row.started_at,
            finishedAt: row.finished_at || null,
        }));
    }
    create() {
        const result = database_1.default.prepare('INSERT INTO agent_autonomy_runs (status) VALUES (?)').run('success');
        return Number(result.lastInsertRowid);
    }
    finish(id, payload) {
        database_1.default.prepare(`
      UPDATE agent_autonomy_runs
      SET status = ?, summary = ?, actions_json = ?, backup_path = ?, error = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payload.status, payload.summary || '', JSON.stringify(payload.actions || []), payload.backupPath || '', payload.error || '', id);
    }
}
exports.AgentAutonomyRunModel = AgentAutonomyRunModel;
class AgentRuntimeSnapshotModel {
    list(limit = 10) {
        return database_1.default.prepare('SELECT * FROM agent_runtime_snapshots ORDER BY created_at DESC, id DESC LIMIT ?').all(limit).map((row) => ({
            id: row.id,
            status: row.status,
            summary: row.summary || '',
            aiHealthyCount: Number(row.ai_healthy_count || 0),
            aiTotalCount: Number(row.ai_total_count || 0),
            proxyHealthy: !!row.proxy_healthy,
            proxyMode: row.proxy_mode || 'unknown',
            memoryHealthy: !!row.memory_healthy,
            ruleHealthy: !!row.rule_healthy,
            newspaperHealthy: !!row.newspaper_healthy,
            systemLoad: Number(row.system_load || 0),
            memoryUsagePct: Number(row.memory_usage_pct || 0),
            anomalies: parseJson(row.anomalies_json, []),
            recoveries: parseJson(row.recoveries_json, []),
            metadata: parseJson(row.metadata_json, {}),
            createdAt: row.created_at,
        }));
    }
    create(payload) {
        database_1.default.prepare(`
      INSERT INTO agent_runtime_snapshots (
        status, summary, ai_healthy_count, ai_total_count, proxy_healthy, proxy_mode,
        memory_healthy, rule_healthy, newspaper_healthy, system_load, memory_usage_pct,
        anomalies_json, recoveries_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.status, payload.summary || '', payload.aiHealthyCount || 0, payload.aiTotalCount || 0, payload.proxyHealthy ? 1 : 0, payload.proxyMode || 'unknown', payload.memoryHealthy ? 1 : 0, payload.ruleHealthy ? 1 : 0, payload.newspaperHealthy ? 1 : 0, payload.systemLoad || 0, payload.memoryUsagePct || 0, JSON.stringify(payload.anomalies || []), JSON.stringify(payload.recoveries || []), JSON.stringify(payload.metadata || {}));
        return this.list(1)[0];
    }
}
exports.AgentRuntimeSnapshotModel = AgentRuntimeSnapshotModel;
class AgentRecoveryIncidentModel {
    list(limit = 20) {
        return database_1.default.prepare('SELECT * FROM agent_recovery_incidents ORDER BY detected_at DESC, id DESC LIMIT ?').all(limit).map((row) => ({
            id: row.id,
            category: row.category,
            severity: row.severity,
            status: row.status,
            title: row.title || '',
            detail: row.detail || '',
            fingerprint: row.fingerprint || '',
            recoveryAction: row.recovery_action || '',
            recoveryResult: row.recovery_result || '',
            metadata: parseJson(row.metadata_json, {}),
            detectedAt: row.detected_at,
            resolvedAt: row.resolved_at || null,
            updatedAt: row.updated_at,
        }));
    }
    getByFingerprint(fingerprint) {
        const row = database_1.default.prepare('SELECT * FROM agent_recovery_incidents WHERE fingerprint = ?').get(fingerprint);
        if (!row)
            return undefined;
        return this.list(100).find((item) => item.fingerprint === fingerprint);
    }
    upsert(payload) {
        const current = this.getByFingerprint(payload.fingerprint);
        database_1.default.prepare(`
      INSERT INTO agent_recovery_incidents (
        category, severity, status, title, detail, fingerprint,
        recovery_action, recovery_result, metadata_json, detected_at, resolved_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(fingerprint) DO UPDATE SET
        category = excluded.category,
        severity = excluded.severity,
        status = excluded.status,
        title = excluded.title,
        detail = excluded.detail,
        recovery_action = excluded.recovery_action,
        recovery_result = excluded.recovery_result,
        metadata_json = excluded.metadata_json,
        resolved_at = excluded.resolved_at,
        updated_at = CURRENT_TIMESTAMP
    `).run(payload.category, payload.severity, payload.status, payload.title, payload.detail, payload.fingerprint, payload.recoveryAction || current?.recoveryAction || '', payload.recoveryResult || current?.recoveryResult || '', JSON.stringify(payload.metadata || current?.metadata || {}), payload.resolvedAt ?? current?.resolvedAt ?? null);
        return this.getByFingerprint(payload.fingerprint);
    }
}
exports.AgentRecoveryIncidentModel = AgentRecoveryIncidentModel;
class AgentCapabilityWeightModel {
    list(limit = 20) {
        return database_1.default.prepare('SELECT * FROM agent_capability_weights ORDER BY weight DESC, updated_at DESC, id DESC LIMIT ?').all(limit).map((row) => ({
            id: row.id,
            capability: row.capability,
            weight: Number(row.weight || 0),
            successCount: Number(row.success_count || 0),
            failureCount: Number(row.failure_count || 0),
            neutralCount: Number(row.neutral_count || 0),
            lastOutcome: row.last_outcome || 'neutral',
            lastSummary: row.last_summary || '',
            source: row.source || 'system',
            updatedAt: row.updated_at,
        }));
    }
    getByCapability(capability) {
        return this.list(100).find((item) => item.capability === capability);
    }
    remember(payload) {
        const current = this.getByCapability(payload.capability);
        const successCount = (current?.successCount || 0) + (payload.outcome === 'success' ? 1 : 0);
        const failureCount = (current?.failureCount || 0) + (payload.outcome === 'failed' ? 1 : 0);
        const neutralCount = (current?.neutralCount || 0) + (payload.outcome === 'neutral' ? 1 : 0);
        const total = successCount + failureCount + neutralCount;
        const rawWeight = total > 0
            ? ((successCount + (payload.outcome === 'success' ? 0.25 : 0)) / Math.max(1, total))
            : (current?.weight || 0.5);
        const weight = Math.max(0.05, Math.min(0.99, Number(rawWeight.toFixed(2))));
        database_1.default.prepare(`
      INSERT INTO agent_capability_weights (
        capability, weight, success_count, failure_count, neutral_count, last_outcome, last_summary, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(capability) DO UPDATE SET
        weight = excluded.weight,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        neutral_count = excluded.neutral_count,
        last_outcome = excluded.last_outcome,
        last_summary = excluded.last_summary,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `).run(payload.capability, weight, successCount, failureCount, neutralCount, payload.outcome, payload.summary || '', payload.source || current?.source || 'autonomy');
        return this.getByCapability(payload.capability);
    }
}
exports.AgentCapabilityWeightModel = AgentCapabilityWeightModel;
class AgentRuntimeEventModel {
    toView(row) {
        return {
            id: Number(row.id),
            layer: row.layer || 'raw',
            scope: row.scope || 'global',
            source: row.source || 'system',
            eventType: row.event_type || 'observation',
            title: row.title || '',
            detail: row.detail || '',
            content: parseJson(row.content_json, {}),
            confidence: Number(row.confidence || 0.5),
            shared: !!row.shared,
            status: row.status || 'active',
            originRefs: parseJson(row.origin_refs_json, []),
            compactedAt: row.compacted_at || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    list(params) {
        const clauses = [];
        const values = [];
        if (params?.layer) {
            clauses.push('layer = ?');
            values.push(params.layer);
        }
        if (params?.scope) {
            clauses.push('scope = ?');
            values.push(params.scope);
        }
        if (params?.status) {
            clauses.push('status = ?');
            values.push(params.status);
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        values.push(Math.max(1, Math.min(500, Number(params?.limit || 50))));
        return database_1.default.prepare(`
      SELECT * FROM agent_runtime_events
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...values).map((row) => this.toView(row));
    }
    count(params) {
        const clauses = [];
        const values = [];
        if (params?.layer) {
            clauses.push('layer = ?');
            values.push(params.layer);
        }
        if (params?.scope) {
            clauses.push('scope = ?');
            values.push(params.scope);
        }
        if (params?.status) {
            clauses.push('status = ?');
            values.push(params.status);
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const row = database_1.default.prepare(`
      SELECT COUNT(*) AS count
      FROM agent_runtime_events
      ${where}
    `).get(...values);
        return Number(row?.count || 0);
    }
    findRecentActive(params) {
        const clauses = ['status = ?'];
        const values = ['active'];
        if (params.layer) {
            clauses.push('layer = ?');
            values.push(params.layer);
        }
        if (params.scope) {
            clauses.push('scope = ?');
            values.push(params.scope);
        }
        if (params.source) {
            clauses.push('source = ?');
            values.push(params.source);
        }
        if (params.eventType) {
            clauses.push('event_type = ?');
            values.push(params.eventType);
        }
        if (params.title) {
            clauses.push('title = ?');
            values.push(params.title);
        }
        const withinSeconds = Math.max(1, Math.min(3600, Number(params.withinSeconds || 30)));
        clauses.push(`created_at >= DATETIME('now', '-' || ? || ' seconds')`);
        values.push(withinSeconds);
        const rows = database_1.default.prepare(`
      SELECT *
      FROM agent_runtime_events
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT 12
    `).all(...values);
        const pathValue = String(params.path || '').trim();
        return rows
            .map((row) => this.toView(row))
            .find((row) => {
            if (!pathValue)
                return true;
            return String(row.content?.path || '').trim() === pathValue;
        }) || null;
    }
    create(payload) {
        const result = database_1.default.prepare(`
      INSERT INTO agent_runtime_events (
        layer, scope, source, event_type, title, detail, content_json, confidence,
        shared, status, origin_refs_json, compacted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(payload.layer || 'raw', payload.scope || 'global', payload.source || 'system', payload.eventType || 'observation', payload.title || '', payload.detail || '', JSON.stringify(payload.content || {}), Math.max(0.05, Math.min(1, Number(payload.confidence ?? 0.5))), payload.shared === false ? 0 : 1, payload.status || 'active', JSON.stringify(payload.originRefs || []), payload.compactedAt || null);
        return this.list({ limit: 1 }).find((item) => item.id === Number(result.lastInsertRowid));
    }
    archive(ids) {
        const normalized = [...new Set(ids.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0))];
        if (normalized.length === 0)
            return 0;
        const placeholders = normalized.map(() => '?').join(', ');
        const result = database_1.default.prepare(`
      UPDATE agent_runtime_events
      SET status = 'archived',
          compacted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(...normalized);
        return result.changes;
    }
}
exports.AgentRuntimeEventModel = AgentRuntimeEventModel;
//# sourceMappingURL=PersonalOS.js.map