import db from '../database';
import { Account, PaginatedResponse, ImportRequest, ImportResult } from '../types';
import { TagModel } from './Tag';

const tagModel = new TagModel();
const VALID_PROVIDERS = ['microsoft', 'gmail', 'qq', 'custom'] as const;

function inferProvider(record: Record<string, string>): string {
  const provider = (record.provider || '').toLowerCase();
  if (provider) return provider;

  const email = (record.email || '').toLowerCase();
  if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com')) return 'qq';
  if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) return 'gmail';
  if (record.custom_imap_host || record.custom_smtp_host) return 'custom';
  return 'microsoft';
}

function validateImportRecord(record: Record<string, string>, line: number): string | null {
  if (!record.email) return `Line ${line}: missing required field email`;

  if (!VALID_PROVIDERS.includes(record.provider as any)) {
    return `Line ${line}: invalid provider`;
  }

  if (record.provider === 'qq') {
    if (!record.password) return `Line ${line}: qq requires password`;
    return null;
  }

  if (record.provider === 'custom') {
    if (!record.password) return `Line ${line}: custom mailbox requires password`;
    if (!record.custom_imap_host && !record.custom_smtp_host) {
      return `Line ${line}: custom mailbox requires custom_imap_host or custom_smtp_host`;
    }
    return null;
  }

  if (!record.client_id || !record.refresh_token) {
    return `Line ${line}: missing required fields`;
  }

  if (record.provider === 'gmail' && !record.client_secret) {
    return `Line ${line}: gmail requires client_secret`;
  }

  return null;
}

export class AccountModel {
  list(page = 1, pageSize = 20, search = ''): PaginatedResponse<Account> {
    const offset = (page - 1) * pageSize;
    let where = '';
    const params: any[] = [];
    if (search) {
      where = 'WHERE email LIKE ?';
      params.push(`%${search}%`);
    }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM accounts ${where}`).get(...params) as any).c;
    const list = db.prepare(`SELECT * FROM accounts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as Account[];
    const listWithTags = list.map(acc => ({
      ...acc,
      tags: tagModel.getTagsByAccountId(acc.id),
    }));
    return { list: listWithTags, total, page, pageSize };
  }

  getById(id: number): Account | undefined {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
    if (!acc) return undefined;
    return { ...acc, tags: tagModel.getTagsByAccountId(acc.id) } as any;
  }

  create(data: Partial<Account>): Account {
    const stmt = db.prepare(`
      INSERT INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.provider || 'microsoft',
      data.mode || 'long_term',
      data.email,
      data.password || '',
      data.client_id || '',
      data.client_secret || '',
      data.refresh_token || '',
      data.custom_imap_host || '',
      data.custom_imap_port || 993,
      data.custom_smtp_host || '',
      data.custom_smtp_port || 465,
      data.custom_smtp_secure ?? 1,
      data.custom_domain || '',
      data.remark || '',
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<Account>): Account | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if ([
        'provider', 'mode', 'email', 'password', 'client_id', 'client_secret', 'refresh_token', 'remark',
        'status', 'token_refreshed_at', 'custom_imap_host', 'custom_imap_port',
        'custom_smtp_host', 'custom_smtp_port', 'custom_smtp_secure', 'custom_domain'
      ].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (fields.length === 0) return this.getById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  batchDelete(ids: number[]): number {
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM accounts WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }

  importPreview(req: ImportRequest): { newItems: any[]; duplicates: any[]; errors: string[] } {
    const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'] } = req;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newItems: any[] = [];
    const duplicates: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(separator);
      const record: Record<string, string> = {};
      format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });

      record.provider = inferProvider(record);

      const validationError = validateImportRecord(record, i + 1);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(record.email);
      const item = { line: i + 1, ...record };
      if (existing) duplicates.push(item);
      else newItems.push(item);
    }

    return { newItems, duplicates, errors };
  }

  importConfirm(req: ImportRequest & { mode: 'skip' | 'overwrite' }): ImportResult {
    const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'], mode } = req;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let imported = 0, skipped = 0;
    const errors: string[] = [];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE accounts
      SET provider = ?, mode = ?, password = ?, client_id = ?, client_secret = ?, refresh_token = ?,
          custom_imap_host = ?, custom_imap_port = ?, custom_smtp_host = ?, custom_smtp_port = ?, custom_smtp_secure = ?, custom_domain = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `);

    const transaction = db.transaction(() => {
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(separator);
        const record: Record<string, string> = {};
        format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });

        record.provider = inferProvider(record);

        const validationError = validateImportRecord(record, i + 1);
        if (validationError) {
          errors.push(validationError);
          continue;
        }

        const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(record.email);
        if (existing) {
          if (mode === 'overwrite') {
            updateStmt.run(
              record.provider,
              record.mode || 'long_term',
              record.password || '',
              record.client_id || '',
              record.client_secret || '',
              record.refresh_token || '',
              record.custom_imap_host || '',
              record.custom_imap_port || 993,
              record.custom_smtp_host || '',
              record.custom_smtp_port || 465,
              record.custom_smtp_secure || 1,
              record.custom_domain || '',
              record.email
            );
            imported++;
          } else {
            skipped++;
          }
        } else {
          insertStmt.run(
            record.provider,
            record.mode || 'long_term',
            record.email,
            record.password || '',
            record.client_id || '',
            record.client_secret || '',
            record.refresh_token || '',
            record.custom_imap_host || '',
            record.custom_imap_port || 993,
            record.custom_smtp_host || '',
            record.custom_smtp_port || 465,
            record.custom_smtp_secure || 1,
            record.custom_domain || ''
          );
          imported++;
        }
      }
    });
    transaction();
    return { imported, skipped, errors };
  }

  import(req: ImportRequest): ImportResult {
    const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'] } = req;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let imported = 0, skipped = 0;
    const errors: string[] = [];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = db.transaction(() => {
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split(separator);
        const record: Record<string, string> = {};
        format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });

        record.provider = inferProvider(record);

        const validationError = validateImportRecord(record, i + 1);
        if (validationError) {
          errors.push(validationError);
          continue;
        }
        const result = insertStmt.run(
          record.provider,
          record.mode || 'long_term',
          record.email,
          record.password || '',
          record.client_id || '',
          record.client_secret || '',
          record.refresh_token || '',
          record.custom_imap_host || '',
          record.custom_imap_port || 993,
          record.custom_smtp_host || '',
          record.custom_smtp_port || 465,
          record.custom_smtp_secure || 1,
          record.custom_domain || ''
        );
        if (result.changes > 0) imported++;
        else skipped++;
      }
    });
    transaction();
    return { imported, skipped, errors };
  }

  export(ids?: number[], separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token']): string {
    let accounts: Account[];
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      accounts = db.prepare(`SELECT * FROM accounts WHERE id IN (${placeholders})`).all(...ids) as Account[];
    } else {
      accounts = db.prepare('SELECT * FROM accounts').all() as Account[];
    }
    return accounts.map(acc => format.map(f => (acc as any)[f] || '').join(separator)).join('\n');
  }

  updateSyncTime(id: number) {
    db.prepare('UPDATE accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  updateTokenRefreshTime(id: number, newRefreshToken?: string) {
    if (newRefreshToken) {
      db.prepare('UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newRefreshToken, 'active', id);
    } else {
      db.prepare('UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('active', id);
    }
  }

  markError(id: number) {
    db.prepare('UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('error', id);
  }

  getAll(): Account[] {
    return db.prepare('SELECT * FROM accounts ORDER BY id DESC').all() as Account[];
  }
}
