import db from '../database';
import type { AiAccount, AiConnectionTestResult, AiMessage, AiProvider, AiThread } from '../types';

const DEFAULTS: Record<AiProvider, { baseUrl: string; model: string }> = {
  chatgpt: {
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-4o-mini',
  },
  codex: {
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-5-codex',
  },
  claude: {
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
  },
  claude_code: {
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
  },
  anthropic_compatible: {
    baseUrl: 'https://anyrouter.top',
    model: 'claude-opus-4-6',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openai_compatible: {
    baseUrl: 'https://anyrouter.top/v1',
    model: 'gpt-4o-mini',
  },
};

export class AiAccountModel {
  list(): AiAccount[] {
    return db.prepare('SELECT * FROM ai_accounts ORDER BY priority_rank ASC, updated_at DESC, id DESC').all() as AiAccount[];
  }

  getById(id: number): AiAccount | undefined {
    return db.prepare('SELECT * FROM ai_accounts WHERE id = ?').get(id) as AiAccount | undefined;
  }

  create(data: Partial<AiAccount>): AiAccount {
    const provider = (data.provider || 'chatgpt') as AiProvider;
    const defaults = DEFAULTS[provider];
    const result = db.prepare(`
      INSERT INTO ai_accounts (
        provider, auth_mode, name, api_key, base_url, model, priority_rank,
        oauth_client_id, oauth_client_secret, oauth_refresh_token, oauth_email, oauth_project_id,
        system_prompt, remark, status,
        last_test_status, available_models, transport_hint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      provider,
      data.auth_mode || 'api_key',
      data.name || '',
      data.api_key || '',
      data.base_url || defaults.baseUrl,
      data.model || defaults.model,
      data.priority_rank || 1,
      data.oauth_client_id || '',
      data.oauth_client_secret || '',
      data.oauth_refresh_token || '',
      data.oauth_email || '',
      data.oauth_project_id || '',
      data.system_prompt || '',
      data.remark || '',
      data.status || 'active',
      'never',
      '[]',
      'unknown'
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<AiAccount>): AiAccount | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    const provider = (data.provider || current.provider) as AiProvider;
    const defaults = DEFAULTS[provider];
    const payload = {
      provider,
      auth_mode: data.auth_mode ?? current.auth_mode,
      name: data.name ?? current.name,
      api_key: data.api_key ?? current.api_key,
      base_url: data.base_url ?? (current.base_url || defaults.baseUrl),
      model: data.model ?? (current.model || defaults.model),
      priority_rank: data.priority_rank ?? current.priority_rank ?? 1,
      oauth_client_id: data.oauth_client_id ?? current.oauth_client_id,
      oauth_client_secret: data.oauth_client_secret ?? current.oauth_client_secret,
      oauth_refresh_token: data.oauth_refresh_token ?? current.oauth_refresh_token,
      oauth_email: data.oauth_email ?? current.oauth_email,
      oauth_project_id: data.oauth_project_id ?? current.oauth_project_id,
      system_prompt: data.system_prompt ?? current.system_prompt,
      remark: data.remark ?? current.remark,
      status: data.status ?? current.status,
    };

    db.prepare(`
      UPDATE ai_accounts
      SET provider = ?, auth_mode = ?, name = ?, api_key = ?, base_url = ?, model = ?, priority_rank = ?, oauth_client_id = ?, oauth_client_secret = ?, oauth_refresh_token = ?, oauth_email = ?, oauth_project_id = ?, system_prompt = ?, remark = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.provider,
      payload.auth_mode,
      payload.name,
      payload.api_key,
      payload.base_url,
      payload.model,
      payload.priority_rank,
      payload.oauth_client_id,
      payload.oauth_client_secret,
      payload.oauth_refresh_token,
      payload.oauth_email,
      payload.oauth_project_id,
      payload.system_prompt,
      payload.remark,
      payload.status,
      id
    );

    return this.getById(id);
  }

  delete(id: number): boolean {
    const result = db.prepare('DELETE FROM ai_accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  markStatus(id: number, status: AiAccount['status']) {
    db.prepare('UPDATE ai_accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  }

  updateLastUsed(id: number) {
    db.prepare(`
      UPDATE ai_accounts
      SET last_used_at = CURRENT_TIMESTAMP, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  updateDiagnostics(id: number, result: AiConnectionTestResult) {
    db.prepare(`
      UPDATE ai_accounts
      SET
        last_tested_at = CURRENT_TIMESTAMP,
        last_test_status = ?,
        last_test_latency_ms = ?,
        last_http_status = ?,
        last_error = ?,
        last_response_preview = ?,
        available_models = ?,
        last_models_synced_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_models_synced_at END,
        transport_hint = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.ok ? 'success' : 'failed',
      Math.round(result.latencyMs),
      result.status,
      result.ok ? '' : result.message,
      result.preview || '',
      JSON.stringify(result.models || []),
      result.models.length > 0 ? 1 : 0,
      result.transport || 'unknown',
      result.ok ? 'active' : 'error',
      id
    );
  }

  getProviderDefaults(provider: AiProvider) {
    return DEFAULTS[provider];
  }
}

export class AiThreadModel {
  listByAccount(accountId: number): AiThread[] {
    return db.prepare(`
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM ai_messages m
          WHERE m.thread_id = t.id
        ) AS message_count,
        (
          SELECT MAX(created_at)
          FROM ai_messages m
          WHERE m.thread_id = t.id
        ) AS last_message_at,
        COALESCE((
          SELECT substr(m.content, 1, 90)
          FROM ai_messages m
          WHERE m.thread_id = t.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ), '') AS last_message_excerpt
      FROM ai_threads t
      WHERE t.account_id = ?
      ORDER BY COALESCE(last_message_at, t.updated_at) DESC, t.id DESC
    `).all(accountId) as AiThread[];
  }

  getById(id: number): AiThread | undefined {
    return db.prepare(`
      SELECT
        t.*,
        (
          SELECT COUNT(*)
          FROM ai_messages m
          WHERE m.thread_id = t.id
        ) AS message_count,
        (
          SELECT MAX(created_at)
          FROM ai_messages m
          WHERE m.thread_id = t.id
        ) AS last_message_at,
        COALESCE((
          SELECT substr(m.content, 1, 90)
          FROM ai_messages m
          WHERE m.thread_id = t.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ), '') AS last_message_excerpt
      FROM ai_threads t
      WHERE t.id = ?
    `).get(id) as AiThread | undefined;
  }

  create(accountId: number, title: string): AiThread {
    const result = db.prepare(`
      INSERT INTO ai_threads (account_id, title)
      VALUES (?, ?)
    `).run(accountId, title || '新对话');
    return this.getById(result.lastInsertRowid as number)!;
  }

  touch(id: number) {
    db.prepare('UPDATE ai_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  delete(id: number): boolean {
    const result = db.prepare('DELETE FROM ai_threads WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export class AiMessageModel {
  listByThread(threadId: number): AiMessage[] {
    return db.prepare(`
      SELECT *
      FROM ai_messages
      WHERE thread_id = ?
      ORDER BY id ASC
    `).all(threadId) as AiMessage[];
  }

  create(threadId: number, role: AiMessage['role'], content: string): AiMessage {
    const result = db.prepare(`
      INSERT INTO ai_messages (thread_id, role, content)
      VALUES (?, ?, ?)
    `).run(threadId, role, content);
    return db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(result.lastInsertRowid as number) as AiMessage;
  }
}
