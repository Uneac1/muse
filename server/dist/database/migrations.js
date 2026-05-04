"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const index_1 = __importDefault(require("./index"));
function tableSql(name) {
    const row = index_1.default.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(name);
    return row?.sql || '';
}
function rebuildMailCacheTable() {
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS mail_cache_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      mailbox TEXT NOT NULL DEFAULT 'INBOX' CHECK(mailbox IN ('INBOX','Junk','Sent')),
      mail_id TEXT DEFAULT '',
      sender TEXT DEFAULT '',
      sender_name TEXT DEFAULT '',
      recipients TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      text_content TEXT DEFAULT '',
      html_content TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      mail_date DATETIME,
      is_read INTEGER DEFAULT 0,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    INSERT OR REPLACE INTO mail_cache_new (
      id, account_id, mailbox, mail_id, sender, sender_name, recipients, subject,
      text_content, html_content, attachments, mail_date, is_read, cached_at
    )
    SELECT
      id,
      account_id,
      mailbox,
      CASE
        WHEN TRIM(COALESCE(mail_id, '')) != '' THEN TRIM(mail_id)
        ELSE 'fallback:' || COALESCE(sender, '') || '|' || COALESCE(subject, '') || '|' || COALESCE(mail_date, '') || '|' || COALESCE(recipients, '')
      END,
      sender,
      sender_name,
      COALESCE(recipients, ''),
      subject,
      text_content,
      html_content,
      COALESCE(attachments, '[]'),
      mail_date,
      is_read,
      cached_at
    FROM mail_cache;

    DROP TABLE mail_cache;
    ALTER TABLE mail_cache_new RENAME TO mail_cache;

    CREATE INDEX IF NOT EXISTS idx_mail_cache_account ON mail_cache(account_id, mailbox);
    CREATE INDEX IF NOT EXISTS idx_mail_cache_date ON mail_cache(mail_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_cache_message ON mail_cache(account_id, mailbox, mail_id);
  `);
}
function ensureMailCacheUniqueMessageIndex() {
    index_1.default.exec(`
    UPDATE mail_cache
    SET mail_id = 'fallback:' || COALESCE(sender, '') || '|' || COALESCE(subject, '') || '|' || COALESCE(mail_date, '') || '|' || COALESCE(recipients, '')
    WHERE TRIM(COALESCE(mail_id, '')) = '';

    DELETE FROM mail_cache
    WHERE id NOT IN (
      SELECT keep_id
      FROM (
        SELECT MAX(id) AS keep_id
        FROM mail_cache
        GROUP BY account_id, mailbox, mail_id
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_cache_message ON mail_cache(account_id, mailbox, mail_id);
  `);
}
function ensureIntegrationTokensTableSupportsProviders() {
    const sql = tableSql('integration_tokens');
    if (!sql || (sql.includes(`'notion'`) && sql.includes(`'ymail'`) && sql.includes(`'misub'`) && sql.includes(`'linuxdo'`)))
        return;
    index_1.default.exec(`
    ALTER TABLE integration_tokens RENAME TO integration_tokens_old;

    CREATE TABLE integration_tokens (
      provider TEXT PRIMARY KEY CHECK(provider IN ('github', 'cloudflare', 'notion', 'misub', 'ymail', 'linuxdo')),
      token TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO integration_tokens (provider, token, updated_at)
    SELECT provider, token, updated_at
    FROM integration_tokens_old;

    DROP TABLE integration_tokens_old;
  `);
}
function rebuildAccountTagsTable() {
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS account_tags_new (
      account_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (account_id, tag_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    INSERT OR IGNORE INTO account_tags_new (account_id, tag_id)
    SELECT account_id, tag_id
    FROM account_tags;

    DROP TABLE account_tags;
    ALTER TABLE account_tags_new RENAME TO account_tags;
  `);
}
function rebuildTokenAccountsTable() {
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS token_accounts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('openai_codex','claude','claude_code')),
      auth_method TEXT NOT NULL DEFAULT 'session' CHECK(auth_method IN ('session','oauth','manual','api')),
      name TEXT NOT NULL,
      session_format TEXT NOT NULL DEFAULT 'cookie_header' CHECK(session_format IN ('cookie_header','cookie_json','netscape')),
      login_hint TEXT NOT NULL DEFAULT '',
      external_account_id TEXT NOT NULL DEFAULT '',
      analytics_url TEXT NOT NULL DEFAULT '',
      session_payload TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      id_token TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      api_base_url TEXT NOT NULL DEFAULT '',
      api_model TEXT NOT NULL DEFAULT '',
      api_model_provider TEXT NOT NULL DEFAULT '',
      api_reasoning_effort TEXT NOT NULL DEFAULT '',
      api_wire_api TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','error')),
      auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at DATETIME,
      last_error TEXT NOT NULL DEFAULT '',
      next_retry_at DATETIME,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failure_kind TEXT NOT NULL DEFAULT 'none',
      snapshot_json TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    DROP TABLE IF EXISTS token_accounts;
    ALTER TABLE token_accounts_new RENAME TO token_accounts;

    CREATE INDEX IF NOT EXISTS idx_token_accounts_provider ON token_accounts(provider, updated_at DESC);
  `);
}
function rebuildAiAccountsTable() {
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS ai_accounts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'chatgpt' CHECK(provider IN ('chatgpt','codex','claude','claude_code','anthropic_compatible','gemini','deepseek','mimo','openai_compatible')),
      auth_mode TEXT NOT NULL DEFAULT 'api_key' CHECK(auth_mode IN ('api_key','google_oauth')),
      name TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      priority_rank INTEGER NOT NULL DEFAULT 1,
      oauth_client_id TEXT NOT NULL DEFAULT '',
      oauth_client_secret TEXT NOT NULL DEFAULT '',
      oauth_refresh_token TEXT NOT NULL DEFAULT '',
      oauth_email TEXT NOT NULL DEFAULT '',
      oauth_project_id TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
      last_used_at DATETIME,
      last_tested_at DATETIME,
      last_test_status TEXT NOT NULL DEFAULT 'never' CHECK(last_test_status IN ('success','failed','never')),
      last_test_latency_ms INTEGER,
      last_http_status INTEGER,
      last_error TEXT NOT NULL DEFAULT '',
      last_response_preview TEXT NOT NULL DEFAULT '',
      available_models TEXT NOT NULL DEFAULT '[]',
      last_models_synced_at DATETIME,
      transport_hint TEXT NOT NULL DEFAULT 'unknown',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO ai_accounts_new (
      id, provider, auth_mode, name, api_key, base_url, model, priority_rank, oauth_client_id, oauth_client_secret, oauth_refresh_token, oauth_email, oauth_project_id, system_prompt, remark, status,
      last_used_at, last_tested_at, last_test_status, last_test_latency_ms, last_http_status,
      last_error, last_response_preview, available_models, last_models_synced_at, transport_hint,
      created_at, updated_at
    )
    SELECT
      id, provider, 'api_key', name, api_key, base_url, model, 1, '', '', '', '', '', system_prompt, remark, status,
      last_used_at, last_tested_at, last_test_status, last_test_latency_ms, last_http_status,
      last_error, last_response_preview, available_models, last_models_synced_at, transport_hint,
      created_at, updated_at
    FROM ai_accounts;

    DROP TABLE ai_accounts;
    ALTER TABLE ai_accounts_new RENAME TO ai_accounts;

    CREATE INDEX IF NOT EXISTS idx_ai_accounts_provider ON ai_accounts(provider, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_threads_account ON ai_threads(account_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages(thread_id, id ASC);
  `);
}
function ensureDefaultMimoAiAccount() {
    const mimoBootstrapEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.MIMO_BOOTSTRAP_ENABLED || '').trim().toLowerCase());
    if (!mimoBootstrapEnabled)
        return;
    const apiKey = String(process.env.MIMO_API_KEY || '').trim();
    if (!apiKey)
        return;
    const baseUrl = String(process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1').trim();
    const model = String(process.env.MIMO_MODEL || 'mimo-v2.5-pro').trim();
    const name = String(process.env.MIMO_ACCOUNT_NAME || 'MiMo').trim();
    const remark = String(process.env.MIMO_REMARK || 'Dedicated MiMo token plan, OpenAI-compatible endpoint.').trim();
    const existing = index_1.default.prepare(`
    SELECT id
    FROM ai_accounts
    WHERE provider = 'mimo' OR LOWER(name) = LOWER(?)
    ORDER BY provider = 'mimo' DESC, id ASC
    LIMIT 1
  `).get(name);
    if (existing) {
        index_1.default.prepare(`
      UPDATE ai_accounts
      SET provider = 'mimo',
          auth_mode = 'api_key',
          name = ?,
          api_key = ?,
          base_url = ?,
          model = ?,
          remark = CASE WHEN TRIM(COALESCE(remark, '')) = '' THEN ? ELSE remark END,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, apiKey, baseUrl, model, remark, existing.id);
        return;
    }
    index_1.default.prepare(`
    INSERT INTO ai_accounts (
      provider, auth_mode, name, api_key, base_url, model, priority_rank,
      system_prompt, remark, status, last_test_status, available_models, transport_hint
    ) VALUES ('mimo', 'api_key', ?, ?, ?, ?, 2, '', ?, 'active', 'never', '[]', 'unknown')
  `).run(name, apiKey, baseUrl, model, remark);
}
function runMigrations() {
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'microsoft' CHECK(provider IN ('microsoft','gmail','qq','custom')),
      mode TEXT NOT NULL DEFAULT 'long_term' CHECK(mode IN ('temporary','long_term')),
      email TEXT NOT NULL,
      password TEXT DEFAULT '',
      client_id TEXT NOT NULL,
      client_secret TEXT DEFAULT '',
      refresh_token TEXT NOT NULL,
      custom_imap_host TEXT DEFAULT '',
      custom_imap_port INTEGER DEFAULT 993,
      custom_smtp_host TEXT DEFAULT '',
      custom_smtp_port INTEGER DEFAULT 465,
      custom_smtp_secure INTEGER DEFAULT 1,
      custom_domain TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
      last_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);

    CREATE TABLE IF NOT EXISTS proxies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL CHECK(type IN ('socks5','http')),
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT DEFAULT '',
      password TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      last_tested_at DATETIME,
      last_test_ip TEXT DEFAULT '',
      status TEXT DEFAULT 'untested' CHECK(status IN ('untested','active','failed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mail_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      mailbox TEXT NOT NULL DEFAULT 'INBOX' CHECK(mailbox IN ('INBOX','Junk','Sent')),
      mail_id TEXT DEFAULT '',
      sender TEXT DEFAULT '',
      sender_name TEXT DEFAULT '',
      recipients TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      text_content TEXT DEFAULT '',
      html_content TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      mail_date DATETIME,
      is_read INTEGER DEFAULT 0,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mail_cache_account ON mail_cache(account_id, mailbox);
    CREATE INDEX IF NOT EXISTS idx_mail_cache_date ON mail_cache(mail_date DESC);
  `);
    // 新增 token_refreshed_at 字段（兼容已有数据库）
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN token_refreshed_at DATETIME`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN mode TEXT NOT NULL DEFAULT 'long_term' CHECK(mode IN ('temporary','long_term'))`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_imap_host TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_imap_port INTEGER DEFAULT 993`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_host TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_port INTEGER DEFAULT 465`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_secure INTEGER DEFAULT 1`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN custom_domain TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE proxies ADD COLUMN is_enabled INTEGER DEFAULT 1`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE mail_cache ADD COLUMN recipients TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE mail_cache ADD COLUMN attachments TEXT DEFAULT '[]'`);
    }
    catch {
        // 字段已存在则忽略
    }
    // 新增 remark 备注字段
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN remark TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN provider TEXT NOT NULL DEFAULT 'microsoft' CHECK(provider IN ('microsoft','gmail','qq'))`);
    }
    catch {
        // 字段已存在则忽略
    }
    try {
        index_1.default.exec(`ALTER TABLE accounts ADD COLUMN client_secret TEXT DEFAULT ''`);
    }
    catch {
        // 字段已存在则忽略
    }
    // 标签系统
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS account_tags (
      account_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (account_id, tag_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS integration_tokens (
      provider TEXT PRIMARY KEY CHECK(provider IN ('github', 'cloudflare', 'notion', 'misub', 'ymail', 'linuxdo')),
      token TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_os_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT 'inbox' CHECK(scope IN ('today','inbox','alert')),
      trigger_type TEXT NOT NULL CHECK(trigger_type IN (
        'token_low_remaining_pct',
        'account_error',
        'proxy_failed',
        'keyword_in_news',
        'github_repo_activity',
        'subscription_expiring_days'
      )),
      config_json TEXT NOT NULL DEFAULT '{}',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      last_triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','project','risk','preference')),
      tags_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'manual',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_key TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_resolved INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_action_states (
      action_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','muted')),
      note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS misub_ai_inspection_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      account_id INTEGER,
      interval_hours INTEGER NOT NULL DEFAULT 24,
      goal TEXT NOT NULL DEFAULT '',
      last_run_at DATETIME,
      next_run_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS misub_ai_inspection_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
      account_id INTEGER,
      goal TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      findings_json TEXT NOT NULL DEFAULT '[]',
      actions_json TEXT NOT NULL DEFAULT '[]',
      raw TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS personal_memory_ingestion_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      account_id INTEGER,
      interval_hours INTEGER NOT NULL DEFAULT 6,
      focus TEXT NOT NULL DEFAULT '',
      last_run_at DATETIME,
      next_run_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_memory_ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
      account_id INTEGER,
      mode TEXT NOT NULL DEFAULT 'heuristic' CHECK(mode IN ('heuristic','ai')),
      focus TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      sources_json TEXT NOT NULL DEFAULT '[]',
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      resolved_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS personal_rule_automation_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      account_id INTEGER,
      interval_hours INTEGER NOT NULL DEFAULT 6,
      focus TEXT NOT NULL DEFAULT '',
      auto_apply_enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at DATETIME,
      next_run_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS personal_rule_automation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
      account_id INTEGER,
      focus TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      suggestions_json TEXT NOT NULL DEFAULT '[]',
      applied_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS agent_profile_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'preference' CHECK(category IN ('preference','cognitive_style','habit','goal','constraint')),
      confidence REAL NOT NULL DEFAULT 0.6,
      source TEXT NOT NULL DEFAULT 'manual',
      last_observed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_skill_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'workflow' CHECK(category IN ('tool_pattern','workflow','automation','recovery')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      pattern TEXT NOT NULL UNIQUE,
      score REAL NOT NULL DEFAULT 0.6,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_autonomy_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_hours INTEGER NOT NULL DEFAULT 6,
      execution_mode TEXT NOT NULL DEFAULT 'observe_only' CHECK(execution_mode IN ('observe_only','guided_execute','full_execute')),
      memory_ingestion_enabled INTEGER NOT NULL DEFAULT 1,
      rule_automation_enabled INTEGER NOT NULL DEFAULT 0,
      profile_learning_enabled INTEGER NOT NULL DEFAULT 1,
      skill_learning_enabled INTEGER NOT NULL DEFAULT 1,
      backup_enabled INTEGER NOT NULL DEFAULT 1,
      backup_dir TEXT NOT NULL DEFAULT './data/agent-backups',
      backup_retention_count INTEGER NOT NULL DEFAULT 7,
      last_run_at DATETIME,
      next_run_at DATETIME,
      last_compacted_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_autonomy_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
      summary TEXT NOT NULL DEFAULT '',
      actions_json TEXT NOT NULL DEFAULT '[]',
      backup_path TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS agent_runtime_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'healthy' CHECK(status IN ('healthy','watch','critical')),
      summary TEXT NOT NULL DEFAULT '',
      ai_healthy_count INTEGER NOT NULL DEFAULT 0,
      ai_total_count INTEGER NOT NULL DEFAULT 0,
      proxy_healthy INTEGER NOT NULL DEFAULT 0,
      proxy_mode TEXT NOT NULL DEFAULT 'unknown',
      memory_healthy INTEGER NOT NULL DEFAULT 0,
      rule_healthy INTEGER NOT NULL DEFAULT 0,
      newspaper_healthy INTEGER NOT NULL DEFAULT 0,
      system_load REAL NOT NULL DEFAULT 0,
      memory_usage_pct REAL NOT NULL DEFAULT 0,
      anomalies_json TEXT NOT NULL DEFAULT '[]',
      recoveries_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_recovery_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'server' CHECK(category IN ('ai','proxy','memory','rules','server','integration')),
      severity TEXT NOT NULL DEFAULT 'watch' CHECK(severity IN ('watch','critical')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','failed')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      fingerprint TEXT NOT NULL UNIQUE,
      recovery_action TEXT NOT NULL DEFAULT '',
      recovery_result TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_capability_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      neutral_count INTEGER NOT NULL DEFAULT 0,
      last_outcome TEXT NOT NULL DEFAULT 'neutral' CHECK(last_outcome IN ('success','failed','neutral')),
      last_summary TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'system',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layer TEXT NOT NULL DEFAULT 'raw' CHECK(layer IN ('raw','short_term','long_term','skill')),
      scope TEXT NOT NULL DEFAULT 'global' CHECK(scope IN ('global','page','tool','chat','recovery','task')),
      source TEXT NOT NULL DEFAULT 'system',
      event_type TEXT NOT NULL DEFAULT 'observation',
      title TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL DEFAULT '{}',
      confidence REAL NOT NULL DEFAULT 0.5,
      shared INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      origin_refs_json TEXT NOT NULL DEFAULT '[]',
      compacted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runtime_events_layer_created
      ON agent_runtime_events(layer, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runtime_events_scope_created
      ON agent_runtime_events(scope, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'chatgpt' CHECK(provider IN ('chatgpt','codex','claude','claude_code','anthropic_compatible','gemini','deepseek','mimo','openai_compatible')),
      auth_mode TEXT NOT NULL DEFAULT 'api_key' CHECK(auth_mode IN ('api_key','google_oauth')),
      name TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      priority_rank INTEGER NOT NULL DEFAULT 1,
      oauth_client_id TEXT NOT NULL DEFAULT '',
      oauth_client_secret TEXT NOT NULL DEFAULT '',
      oauth_refresh_token TEXT NOT NULL DEFAULT '',
      oauth_email TEXT NOT NULL DEFAULT '',
      oauth_project_id TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
      last_used_at DATETIME,
      last_tested_at DATETIME,
      last_test_status TEXT NOT NULL DEFAULT 'never' CHECK(last_test_status IN ('success','failed','never')),
      last_test_latency_ms INTEGER,
      last_http_status INTEGER,
      last_error TEXT NOT NULL DEFAULT '',
      last_response_preview TEXT NOT NULL DEFAULT '',
      available_models TEXT NOT NULL DEFAULT '[]',
      last_models_synced_at DATETIME,
      transport_hint TEXT NOT NULL DEFAULT 'unknown',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '新对话',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES ai_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (thread_id) REFERENCES ai_threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_threads_account ON ai_threads(account_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages(thread_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS token_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('openai_codex','claude','claude_code')),
      auth_method TEXT NOT NULL DEFAULT 'session' CHECK(auth_method IN ('session','oauth','manual','api')),
      name TEXT NOT NULL,
      session_format TEXT NOT NULL DEFAULT 'cookie_header' CHECK(session_format IN ('cookie_header','cookie_json','netscape')),
      login_hint TEXT NOT NULL DEFAULT '',
      external_account_id TEXT NOT NULL DEFAULT '',
      analytics_url TEXT NOT NULL DEFAULT '',
      session_payload TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      id_token TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      api_base_url TEXT NOT NULL DEFAULT '',
      api_model TEXT NOT NULL DEFAULT '',
      api_model_provider TEXT NOT NULL DEFAULT '',
      api_reasoning_effort TEXT NOT NULL DEFAULT '',
      api_wire_api TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive','error')),
      auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at DATETIME,
      last_error TEXT NOT NULL DEFAULT '',
      next_retry_at DATETIME,
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failure_kind TEXT NOT NULL DEFAULT 'none',
      snapshot_json TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_token_accounts_provider ON token_accounts(provider, updated_at DESC);

    CREATE TABLE IF NOT EXISTS codex_desktop_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      codex_home TEXT NOT NULL DEFAULT '',
      auto_switch_enabled INTEGER NOT NULL DEFAULT 0,
      auto_switch_launch_mode TEXT NOT NULL DEFAULT 'activate_only' CHECK(auto_switch_launch_mode IN ('activate_only','activate_and_open')),
      low_5h_threshold_pct INTEGER NOT NULL DEFAULT 15,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS codex_activation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_account_id INTEGER,
      strategy TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL CHECK(status IN ('success','error','restored')),
      codex_home TEXT NOT NULL DEFAULT '',
      backup_auth_path TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_account_id) REFERENCES token_accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS token_account_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_account_id INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_account_id) REFERENCES token_accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_codex_activation_events_created ON codex_activation_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_account_snapshots_account_created ON token_account_snapshots(token_account_id, created_at DESC);
  `);
    ensureIntegrationTokensTableSupportsProviders();
    const aiAccountsSql = tableSql('ai_accounts');
    if (aiAccountsSql &&
        (!aiAccountsSql.includes(`'claude'`) ||
            !aiAccountsSql.includes(`'claude_code'`) ||
            !aiAccountsSql.includes(`'anthropic_compatible'`) ||
            !aiAccountsSql.includes(`'mimo'`) ||
            !aiAccountsSql.includes('auth_mode TEXT') ||
            !aiAccountsSql.includes('priority_rank INTEGER') ||
            !aiAccountsSql.includes('oauth_refresh_token TEXT'))) {
        rebuildAiAccountsTable();
    }
    ensureDefaultMimoAiAccount();
    const accountTableSql = tableSql('accounts');
    if (accountTableSql &&
        (!accountTableSql.includes(`'qq'`) ||
            !accountTableSql.includes(`mode TEXT`) ||
            !accountTableSql.includes(`custom_imap_host`) ||
            !accountTableSql.includes(`custom_smtp_host`))) {
        index_1.default.pragma('foreign_keys = OFF');
        try {
            index_1.default.exec(`
        ALTER TABLE accounts RENAME TO accounts_old;

        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL DEFAULT 'microsoft' CHECK(provider IN ('microsoft','gmail','qq','custom')),
          mode TEXT NOT NULL DEFAULT 'long_term' CHECK(mode IN ('temporary','long_term')),
          email TEXT NOT NULL,
          password TEXT DEFAULT '',
          client_id TEXT NOT NULL DEFAULT '',
          client_secret TEXT DEFAULT '',
          refresh_token TEXT NOT NULL DEFAULT '',
          custom_imap_host TEXT DEFAULT '',
          custom_imap_port INTEGER DEFAULT 993,
          custom_smtp_host TEXT DEFAULT '',
          custom_smtp_port INTEGER DEFAULT 465,
          custom_smtp_secure INTEGER DEFAULT 1,
          custom_domain TEXT DEFAULT '',
          status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
          last_synced_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          token_refreshed_at DATETIME,
          remark TEXT DEFAULT ''
        );

        INSERT INTO accounts (
          id, provider, mode, email, password, client_id, client_secret, refresh_token,
          custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain,
          status, last_synced_at, created_at, updated_at, token_refreshed_at, remark
        )
        SELECT
          id, provider, COALESCE(mode, 'long_term'), email, password, COALESCE(client_id, ''), COALESCE(client_secret, ''), COALESCE(refresh_token, ''),
          COALESCE(custom_imap_host, ''), COALESCE(custom_imap_port, 993), COALESCE(custom_smtp_host, ''), COALESCE(custom_smtp_port, 465), COALESCE(custom_smtp_secure, 1), COALESCE(custom_domain, ''),
          status, last_synced_at, created_at, updated_at, token_refreshed_at, remark
        FROM accounts_old;

        DROP TABLE accounts_old;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
      `);
        }
        finally {
            index_1.default.pragma('foreign_keys = ON');
        }
    }
    if (tableSql('mail_cache').includes('accounts_old')) {
        index_1.default.pragma('foreign_keys = OFF');
        try {
            rebuildMailCacheTable();
        }
        finally {
            index_1.default.pragma('foreign_keys = ON');
        }
    }
    const mailCacheSql = tableSql('mail_cache');
    if (mailCacheSql &&
        (!mailCacheSql.includes(`'Sent'`) ||
            !mailCacheSql.includes(`recipients TEXT`) ||
            !mailCacheSql.includes(`attachments TEXT`))) {
        index_1.default.pragma('foreign_keys = OFF');
        try {
            rebuildMailCacheTable();
        }
        finally {
            index_1.default.pragma('foreign_keys = ON');
        }
    }
    ensureMailCacheUniqueMessageIndex();
    if (tableSql('account_tags').includes('accounts_old')) {
        index_1.default.pragma('foreign_keys = OFF');
        try {
            rebuildAccountTagsTable();
        }
        finally {
            index_1.default.pragma('foreign_keys = ON');
        }
    }
    const tokenAccountsSql = tableSql('token_accounts');
    if (tokenAccountsSql &&
        (!tokenAccountsSql.includes('session_format TEXT') ||
            !tokenAccountsSql.includes('auth_method TEXT') ||
            !tokenAccountsSql.includes('external_account_id TEXT') ||
            !tokenAccountsSql.includes('analytics_url TEXT') ||
            !tokenAccountsSql.includes('session_payload TEXT') ||
            !tokenAccountsSql.includes('access_token TEXT') ||
            !tokenAccountsSql.includes('refresh_token TEXT') ||
            !tokenAccountsSql.includes('api_key TEXT') ||
            !tokenAccountsSql.includes('snapshot_json TEXT'))) {
        index_1.default.pragma('foreign_keys = OFF');
        try {
            rebuildTokenAccountsTable();
        }
        finally {
            index_1.default.pragma('foreign_keys = ON');
        }
    }
    index_1.default.exec(`
    UPDATE accounts
    SET provider = 'gmail', updated_at = CURRENT_TIMESTAMP
    WHERE provider != 'gmail'
      AND (lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com');

    UPDATE accounts
    SET provider = 'qq', updated_at = CURRENT_TIMESTAMP
    WHERE provider != 'qq'
      AND (
        lower(email) LIKE '%@qq.com'
        OR lower(email) LIKE '%@vip.qq.com'
        OR lower(email) LIKE '%@foxmail.com'
      );
  `);
    ensureIntegrationTokensTableSupportsProviders();
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_tested_at DATETIME`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_test_status TEXT NOT NULL DEFAULT 'never' CHECK(last_test_status IN ('success','failed','never'))`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_test_latency_ms INTEGER`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_http_status INTEGER`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_error TEXT NOT NULL DEFAULT ''`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_response_preview TEXT NOT NULL DEFAULT ''`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN available_models TEXT NOT NULL DEFAULT '[]'`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN last_models_synced_at DATETIME`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE ai_accounts ADD COLUMN transport_hint TEXT NOT NULL DEFAULT 'unknown'`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE token_accounts ADD COLUMN next_retry_at DATETIME`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE token_accounts ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE token_accounts ADD COLUMN last_failure_kind TEXT NOT NULL DEFAULT 'none'`);
    }
    catch { }
    try {
        index_1.default.exec(`ALTER TABLE codex_desktop_settings ADD COLUMN auto_switch_launch_mode TEXT NOT NULL DEFAULT 'activate_only' CHECK(auto_switch_launch_mode IN ('activate_only','activate_and_open'))`);
    }
    catch { }
    index_1.default.exec(`
    CREATE TABLE IF NOT EXISTS codex_desktop_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      codex_home TEXT NOT NULL DEFAULT '',
      auto_switch_enabled INTEGER NOT NULL DEFAULT 0,
      auto_switch_launch_mode TEXT NOT NULL DEFAULT 'activate_only' CHECK(auto_switch_launch_mode IN ('activate_only','activate_and_open')),
      low_5h_threshold_pct INTEGER NOT NULL DEFAULT 15,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS codex_activation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_account_id INTEGER,
      strategy TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL CHECK(status IN ('success','error','restored')),
      codex_home TEXT NOT NULL DEFAULT '',
      backup_auth_path TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_account_id) REFERENCES token_accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS token_account_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_account_id INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_account_id) REFERENCES token_accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_codex_activation_events_created ON codex_activation_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_account_snapshots_account_created ON token_account_snapshots(token_account_id, created_at DESC);
  `);
    const codexSettings = index_1.default.prepare('SELECT id FROM codex_desktop_settings WHERE id = 1').get();
    if (!codexSettings?.id) {
        index_1.default.prepare(`
      INSERT INTO codex_desktop_settings (id, codex_home, auto_switch_enabled, auto_switch_launch_mode, low_5h_threshold_pct)
      VALUES (1, '', 0, 'activate_only', 15)
    `).run();
    }
    const rulesCount = index_1.default.prepare('SELECT COUNT(*) as c FROM personal_os_rules').get().c;
    if (rulesCount === 0) {
        index_1.default.prepare(`
      INSERT INTO personal_os_rules (name, description, scope, trigger_type, config_json, is_enabled)
      VALUES
      ('Token 低余额预警', '当 token 余额低于阈值时进入 Today 和 Inbox', 'today', 'token_low_remaining_pct', ?, 1),
      ('邮箱异常进入异常中心', '账户状态为 error 时直接进入异常中心', 'alert', 'account_error', '{}', 1),
      ('报纸关键词进今日面板', '命中特定关键词的新闻直接放进 Today', 'today', 'keyword_in_news', ?, 1)
    `).run(JSON.stringify({ thresholdPct: 20 }), JSON.stringify({ keyword: 'ai' }));
    }
    const memoryCount = index_1.default.prepare('SELECT COUNT(*) as c FROM personal_memory').get().c;
    if (memoryCount === 0) {
        index_1.default.prepare(`
      INSERT INTO personal_memory (title, content, kind, tags_json, source, is_pinned, is_resolved)
      VALUES
      ('Muse 的真实定位', 'Muse 不是邮箱工具，也不是信息聚合器，而是个人操作系统。产品优化方向应该优先聚合下一步，而不是继续横向堆模块。', 'preference', '["定位","产品"]', 'system', 1, 0),
      ('默认工作原则', '优先减少切换、降低遗漏、把异常和下一步放到统一行动层。', 'note', '["工作流","优先级"]', 'system', 1, 0)
    `).run();
    }
    const memoryIngestionConfig = index_1.default.prepare('SELECT id FROM personal_memory_ingestion_config WHERE id = 1').get();
    if (!memoryIngestionConfig?.id) {
        index_1.default.prepare(`
      INSERT INTO personal_memory_ingestion_config (id, enabled, account_id, interval_hours, focus, next_run_at)
      VALUES (1, 1, NULL, 6, '优先从 Today / Inbox / Ymail / Linux.do / 订阅变化里提炼长期记忆，去重后保留真正有复用价值的上下文。', DATETIME('now', '+6 hours'))
    `).run();
    }
    const ruleAutomationConfig = index_1.default.prepare('SELECT id FROM personal_rule_automation_config WHERE id = 1').get();
    if (!ruleAutomationConfig?.id) {
        index_1.default.prepare(`
      INSERT INTO personal_rule_automation_config (id, enabled, account_id, interval_hours, focus, auto_apply_enabled, next_run_at)
      VALUES (1, 1, NULL, 6, '持续清理规则噪音，补齐可用性和高价值动态规则，自动应用低风险规则建议。', 1, DATETIME('now', '+6 hours'))
    `).run();
    }
    const agentAutonomyConfig = index_1.default.prepare('SELECT id FROM agent_autonomy_config WHERE id = 1').get();
    if (!agentAutonomyConfig?.id) {
        index_1.default.prepare(`
      INSERT INTO agent_autonomy_config (
        id, enabled, interval_hours, memory_ingestion_enabled, rule_automation_enabled,
        profile_learning_enabled, skill_learning_enabled, backup_enabled, backup_dir,
        backup_retention_count, next_run_at
      )
      VALUES (1, 1, 6, 1, 0, 1, 1, 1, './data/agent-backups', 7, DATETIME('now', '+6 hours'))
    `).run();
    }
    const agentProfileCount = index_1.default.prepare('SELECT COUNT(*) as c FROM agent_profile_memory').get().c;
    if (agentProfileCount === 0) {
        index_1.default.prepare(`
      INSERT INTO agent_profile_memory (key, value, category, confidence, source, last_observed_at)
      VALUES
      ('execution_style', '默认进入执行态，优先自己判断、自己推进、自己验证。', 'preference', 0.95, 'system', CURRENT_TIMESTAMP),
      ('communication_style', '少汇报、多推进；输出以结果和验证为中心，避免把分析工作甩给用户。', 'preference', 0.92, 'system', CURRENT_TIMESTAMP),
      ('agent_goal', 'Muse 要像可持续进化的 Hermes Agent：跨会话记忆、自动化、能力沉淀、越用越聪明。', 'goal', 0.98, 'system', CURRENT_TIMESTAMP)
    `).run();
    }
    const capabilityWeightColumns = index_1.default.prepare(`PRAGMA table_info('agent_capability_weights')`).all();
    if (!capabilityWeightColumns.some((column) => column.name === 'neutral_count')) {
        index_1.default.prepare(`ALTER TABLE agent_capability_weights ADD COLUMN neutral_count INTEGER NOT NULL DEFAULT 0`).run();
    }
    const autonomyConfigColumns = index_1.default.prepare(`PRAGMA table_info('agent_autonomy_config')`).all();
    if (!autonomyConfigColumns.some((column) => column.name === 'execution_mode')) {
        index_1.default.prepare(`ALTER TABLE agent_autonomy_config ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'observe_only'`).run();
    }
    if (!autonomyConfigColumns.some((column) => column.name === 'last_compacted_at')) {
        index_1.default.prepare(`ALTER TABLE agent_autonomy_config ADD COLUMN last_compacted_at DATETIME`).run();
    }
    const capabilityWeightsCount = index_1.default.prepare('SELECT COUNT(*) as c FROM agent_capability_weights').get().c;
    if (capabilityWeightsCount === 0) {
        index_1.default.prepare(`
      INSERT INTO agent_capability_weights (capability, weight, success_count, failure_count, neutral_count, last_outcome, last_summary, source, updated_at)
      VALUES
      ('ai_reliability', 0.68, 1, 0, 0, 'success', '优先维持 AI 账号池可用性与模型切换能力。', 'system', CURRENT_TIMESTAMP),
      ('proxy_recovery', 0.72, 1, 0, 0, 'success', '优先保障内置代理内核运行和 OpenAI 通路恢复。', 'system', CURRENT_TIMESTAMP),
      ('memory_ingestion', 0.66, 1, 0, 0, 'success', '优先保障长期记忆自动沉淀链路稳定。', 'system', CURRENT_TIMESTAMP),
      ('rule_automation', 0.18, 0, 0, 1, 'neutral', '规则自动化仅作为兼容层保留，不作为主智能链。', 'system', CURRENT_TIMESTAMP),
      ('backup_resilience', 0.7, 1, 0, 0, 'success', '优先保障自治备份和状态快照留存。', 'system', CURRENT_TIMESTAMP)
    `).run();
    }
    index_1.default.prepare(`
    UPDATE agent_capability_weights
    SET neutral_count = 1
    WHERE capability = 'rule_automation'
      AND neutral_count = 0
      AND success_count = 0
      AND failure_count = 0
      AND last_outcome = 'neutral'
  `).run();
}
//# sourceMappingURL=migrations.js.map