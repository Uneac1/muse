"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenAccountModel = void 0;
const database_1 = __importDefault(require("../database"));
const PROVIDER_LABELS = {
    openai_codex: 'OpenAI Codex',
    claude: 'Claude',
    claude_code: 'Claude Code',
};
class TokenAccountModel {
    list() {
        return database_1.default.prepare('SELECT * FROM token_accounts ORDER BY updated_at DESC, id DESC').all();
    }
    getById(id) {
        return database_1.default.prepare('SELECT * FROM token_accounts WHERE id = ?').get(id);
    }
    create(data) {
        const result = database_1.default.prepare(`
      INSERT INTO token_accounts (
        provider, auth_method, name, session_format, login_hint, external_account_id,
        analytics_url, session_payload, access_token, refresh_token, id_token, user_agent,
        api_key, api_base_url, api_model, api_model_provider, api_reasoning_effort, api_wire_api,
        note, status, auto_sync_enabled, next_retry_at, failure_count, last_failure_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.provider || 'openai_codex', data.auth_method || 'session', data.name || '', data.session_format || 'cookie_header', data.login_hint || '', data.external_account_id || '', data.analytics_url || '', data.session_payload || '', data.access_token || '', data.refresh_token || '', data.id_token || '', data.user_agent || '', data.api_key || '', data.api_base_url || '', data.api_model || '', data.api_model_provider || '', data.api_reasoning_effort || '', data.api_wire_api || '', data.note || '', data.status || 'inactive', data.auto_sync_enabled ?? 1, data.next_retry_at ?? null, data.failure_count ?? 0, data.last_failure_kind ?? 'none');
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const current = this.getById(id);
        if (!current)
            return undefined;
        database_1.default.prepare(`
      UPDATE token_accounts
      SET
        provider = ?,
        auth_method = ?,
        name = ?,
        session_format = ?,
        login_hint = ?,
        external_account_id = ?,
        analytics_url = ?,
        session_payload = ?,
        access_token = ?,
        refresh_token = ?,
        id_token = ?,
        user_agent = ?,
        api_key = ?,
        api_base_url = ?,
        api_model = ?,
        api_model_provider = ?,
        api_reasoning_effort = ?,
        api_wire_api = ?,
        note = ?,
        status = ?,
        auto_sync_enabled = ?,
        last_error = ?,
        next_retry_at = ?,
        failure_count = ?,
        last_failure_kind = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.provider ?? current.provider, data.auth_method ?? current.auth_method, data.name ?? current.name, data.session_format ?? current.session_format, data.login_hint ?? current.login_hint, data.external_account_id ?? current.external_account_id, data.analytics_url ?? current.analytics_url, data.session_payload ?? current.session_payload, data.access_token ?? current.access_token, data.refresh_token ?? current.refresh_token, data.id_token ?? current.id_token, data.user_agent ?? current.user_agent, data.api_key ?? current.api_key, data.api_base_url ?? current.api_base_url, data.api_model ?? current.api_model, data.api_model_provider ?? current.api_model_provider, data.api_reasoning_effort ?? current.api_reasoning_effort, data.api_wire_api ?? current.api_wire_api, data.note ?? current.note, data.status ?? current.status, data.auto_sync_enabled ?? current.auto_sync_enabled, data.last_error ?? current.last_error, Object.prototype.hasOwnProperty.call(data, 'next_retry_at') ? data.next_retry_at : current.next_retry_at, data.failure_count ?? current.failure_count, data.last_failure_kind ?? current.last_failure_kind, id);
        return this.getById(id);
    }
    delete(id) {
        return database_1.default.prepare('DELETE FROM token_accounts WHERE id = ?').run(id).changes > 0;
    }
    saveSyncResult(id, status, lastError, snapshot, meta) {
        database_1.default.prepare(`
      UPDATE token_accounts
      SET
        status = ?,
        last_error = ?,
        next_retry_at = ?,
        failure_count = ?,
        last_failure_kind = ?,
        last_synced_at = CASE WHEN ? IS NULL THEN last_synced_at ELSE CURRENT_TIMESTAMP END,
        snapshot_json = CASE WHEN ? IS NULL THEN snapshot_json ELSE ? END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, lastError, meta?.next_retry_at ?? null, meta?.failure_count ?? 0, meta?.last_failure_kind ?? 'none', snapshot ? 1 : null, snapshot ? 1 : null, snapshot ? JSON.stringify(snapshot) : '', id);
        if (snapshot) {
            database_1.default.prepare(`
        INSERT INTO token_account_snapshots (token_account_id, snapshot_json)
        VALUES (?, ?)
      `).run(id, JSON.stringify(snapshot));
        }
    }
    getProviderLabel(provider) {
        return PROVIDER_LABELS[provider];
    }
}
exports.TokenAccountModel = TokenAccountModel;
//# sourceMappingURL=TokenAccount.js.map