import db from './index';

function tableSql(name: string): string {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(name) as { sql?: string } | undefined;
  return row?.sql || '';
}

function rebuildMailCacheTable() {
  db.exec(`
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

    INSERT OR IGNORE INTO mail_cache_new (
      id, account_id, mailbox, mail_id, sender, sender_name, recipients, subject,
      text_content, html_content, attachments, mail_date, is_read, cached_at
    )
    SELECT
      id, account_id, mailbox, mail_id, sender, sender_name, COALESCE(recipients, ''), subject,
      text_content, html_content, COALESCE(attachments, '[]'), mail_date, is_read, cached_at
    FROM mail_cache;

    DROP TABLE mail_cache;
    ALTER TABLE mail_cache_new RENAME TO mail_cache;

    CREATE INDEX IF NOT EXISTS idx_mail_cache_account ON mail_cache(account_id, mailbox);
    CREATE INDEX IF NOT EXISTS idx_mail_cache_date ON mail_cache(mail_date DESC);
  `);
}

function ensureIntegrationTokensTableSupportsProviders() {
  const sql = tableSql('integration_tokens');
  if (!sql || (sql.includes(`'notion'`) && sql.includes(`'ymail'`) && sql.includes(`'misub'`))) return;

  db.exec(`
    ALTER TABLE integration_tokens RENAME TO integration_tokens_old;

    CREATE TABLE integration_tokens (
      provider TEXT PRIMARY KEY CHECK(provider IN ('github', 'cloudflare', 'notion', 'misub', 'ymail')),
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
  db.exec(`
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
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_accounts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'chatgpt' CHECK(provider IN ('chatgpt','codex','claude','claude_code','anthropic_compatible','gemini','deepseek','openai_compatible')),
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

export function runMigrations() {
  db.exec(`
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
    db.exec(`ALTER TABLE accounts ADD COLUMN token_refreshed_at DATETIME`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN mode TEXT NOT NULL DEFAULT 'long_term' CHECK(mode IN ('temporary','long_term'))`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_imap_host TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_imap_port INTEGER DEFAULT 993`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_host TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_port INTEGER DEFAULT 465`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_smtp_secure INTEGER DEFAULT 1`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN custom_domain TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE proxies ADD COLUMN is_enabled INTEGER DEFAULT 1`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE mail_cache ADD COLUMN recipients TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE mail_cache ADD COLUMN attachments TEXT DEFAULT '[]'`);
  } catch {
    // 字段已存在则忽略
  }

  // 新增 remark 备注字段
  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN remark TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN provider TEXT NOT NULL DEFAULT 'microsoft' CHECK(provider IN ('microsoft','gmail','qq'))`);
  } catch {
    // 字段已存在则忽略
  }

  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN client_secret TEXT DEFAULT ''`);
  } catch {
    // 字段已存在则忽略
  }

  // 标签系统
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS account_tags (
      account_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (account_id, tag_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_tokens (
      provider TEXT PRIMARY KEY CHECK(provider IN ('github', 'cloudflare', 'notion', 'misub', 'ymail')),
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

    CREATE TABLE IF NOT EXISTS ai_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'chatgpt' CHECK(provider IN ('chatgpt','codex','claude','claude_code','anthropic_compatible','gemini','deepseek','openai_compatible')),
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
      snapshot_json TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_token_accounts_provider ON token_accounts(provider, updated_at DESC);
  `);

  ensureIntegrationTokensTableSupportsProviders();

  const aiAccountsSql = tableSql('ai_accounts');
  if (
    aiAccountsSql &&
    (
      !aiAccountsSql.includes(`'claude'`) ||
      !aiAccountsSql.includes(`'claude_code'`) ||
      !aiAccountsSql.includes(`'anthropic_compatible'`) ||
      !aiAccountsSql.includes('auth_mode TEXT') ||
      !aiAccountsSql.includes('priority_rank INTEGER') ||
      !aiAccountsSql.includes('oauth_refresh_token TEXT')
    )
  ) {
    rebuildAiAccountsTable();
  }

  const accountTableSql = tableSql('accounts');

  if (
    accountTableSql &&
    (
      !accountTableSql.includes(`'qq'`) ||
      !accountTableSql.includes(`mode TEXT`) ||
      !accountTableSql.includes(`custom_imap_host`) ||
      !accountTableSql.includes(`custom_smtp_host`)
    )
  ) {
    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
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
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  if (tableSql('mail_cache').includes('accounts_old')) {
    db.pragma('foreign_keys = OFF');
    try {
      rebuildMailCacheTable();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  const mailCacheSql = tableSql('mail_cache');
  if (
    mailCacheSql &&
    (
      !mailCacheSql.includes(`'Sent'`) ||
      !mailCacheSql.includes(`recipients TEXT`) ||
      !mailCacheSql.includes(`attachments TEXT`)
    )
  ) {
    db.pragma('foreign_keys = OFF');
    try {
      rebuildMailCacheTable();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  if (tableSql('account_tags').includes('accounts_old')) {
    db.pragma('foreign_keys = OFF');
    try {
      rebuildAccountTagsTable();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  const tokenAccountsSql = tableSql('token_accounts');
  if (
    tokenAccountsSql &&
    (
      !tokenAccountsSql.includes('session_format TEXT') ||
      !tokenAccountsSql.includes('auth_method TEXT') ||
      !tokenAccountsSql.includes('external_account_id TEXT') ||
      !tokenAccountsSql.includes('analytics_url TEXT') ||
      !tokenAccountsSql.includes('session_payload TEXT') ||
      !tokenAccountsSql.includes('access_token TEXT') ||
      !tokenAccountsSql.includes('refresh_token TEXT') ||
      !tokenAccountsSql.includes('api_key TEXT') ||
      !tokenAccountsSql.includes('snapshot_json TEXT')
    )
  ) {
    db.pragma('foreign_keys = OFF');
    try {
      rebuildTokenAccountsTable();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  db.exec(`
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
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_tested_at DATETIME`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_test_status TEXT NOT NULL DEFAULT 'never' CHECK(last_test_status IN ('success','failed','never'))`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_test_latency_ms INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_http_status INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_error TEXT NOT NULL DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_response_preview TEXT NOT NULL DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN available_models TEXT NOT NULL DEFAULT '[]'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN last_models_synced_at DATETIME`);
  } catch {}
  try {
    db.exec(`ALTER TABLE ai_accounts ADD COLUMN transport_hint TEXT NOT NULL DEFAULT 'unknown'`);
  } catch {}

  const rulesCount = (db.prepare('SELECT COUNT(*) as c FROM personal_os_rules').get() as { c: number }).c;
  if (rulesCount === 0) {
    db.prepare(`
      INSERT INTO personal_os_rules (name, description, scope, trigger_type, config_json, is_enabled)
      VALUES
      ('Token 低余额预警', '当 token 余额低于阈值时进入 Today 和 Inbox', 'today', 'token_low_remaining_pct', ?, 1),
      ('邮箱异常进入异常中心', '账户状态为 error 时直接进入异常中心', 'alert', 'account_error', '{}', 1),
      ('报纸关键词进今日面板', '命中特定关键词的新闻直接放进 Today', 'today', 'keyword_in_news', ?, 1)
    `).run(JSON.stringify({ thresholdPct: 20 }), JSON.stringify({ keyword: 'ai' }));
  }

  const memoryCount = (db.prepare('SELECT COUNT(*) as c FROM personal_memory').get() as { c: number }).c;
  if (memoryCount === 0) {
    db.prepare(`
      INSERT INTO personal_memory (title, content, kind, tags_json, source, is_pinned, is_resolved)
      VALUES
      ('Muse 的真实定位', 'Muse 不是邮箱工具，也不是信息聚合器，而是个人操作系统。产品优化方向应该优先聚合下一步，而不是继续横向堆模块。', 'preference', '["定位","产品"]', 'system', 1, 0),
      ('默认工作原则', '优先减少切换、降低遗漏、把异常和下一步放到统一行动层。', 'note', '["工作流","优先级"]', 'system', 1, 0)
    `).run();
  }
}
