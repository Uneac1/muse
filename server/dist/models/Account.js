"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountModel = void 0;
const database_1 = __importDefault(require("../database"));
const Tag_1 = require("./Tag");
const tagModel = new Tag_1.TagModel();
const VALID_PROVIDERS = ['microsoft', 'gmail', 'qq', 'custom'];
function inferProvider(record) {
    const provider = (record.provider || '').toLowerCase();
    if (provider)
        return provider;
    const email = (record.email || '').toLowerCase();
    if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com'))
        return 'qq';
    if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'))
        return 'gmail';
    if (record.custom_imap_host || record.custom_smtp_host)
        return 'custom';
    return 'microsoft';
}
function validateImportRecord(record, line) {
    if (!record.email)
        return `Line ${line}: missing required field email`;
    if (!VALID_PROVIDERS.includes(record.provider)) {
        return `Line ${line}: invalid provider`;
    }
    if (record.provider === 'qq') {
        if (!record.password)
            return `Line ${line}: qq requires password`;
        return null;
    }
    if (record.provider === 'custom') {
        if (!record.password)
            return `Line ${line}: custom mailbox requires password`;
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
class AccountModel {
    list(page = 1, pageSize = 20, search = '') {
        const offset = (page - 1) * pageSize;
        let where = '';
        const params = [];
        if (search) {
            where = 'WHERE email LIKE ?';
            params.push(`%${search}%`);
        }
        const total = database_1.default.prepare(`SELECT COUNT(*) as c FROM accounts ${where}`).get(...params).c;
        const list = database_1.default.prepare(`SELECT * FROM accounts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
        const listWithTags = list.map(acc => ({
            ...acc,
            tags: tagModel.getTagsByAccountId(acc.id),
        }));
        return { list: listWithTags, total, page, pageSize };
    }
    getById(id) {
        const acc = database_1.default.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        if (!acc)
            return undefined;
        return { ...acc, tags: tagModel.getTagsByAccountId(acc.id) };
    }
    create(data) {
        const stmt = database_1.default.prepare(`
      INSERT INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(data.provider || 'microsoft', data.mode || 'long_term', data.email, data.password || '', data.client_id || '', data.client_secret || '', data.refresh_token || '', data.custom_imap_host || '', data.custom_imap_port || 993, data.custom_smtp_host || '', data.custom_smtp_port || 465, data.custom_smtp_secure ?? 1, data.custom_domain || '', data.remark || '');
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const fields = [];
        const values = [];
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
        if (fields.length === 0)
            return this.getById(id);
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        database_1.default.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }
    delete(id) {
        const result = database_1.default.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        return result.changes > 0;
    }
    batchDelete(ids) {
        const placeholders = ids.map(() => '?').join(',');
        const result = database_1.default.prepare(`DELETE FROM accounts WHERE id IN (${placeholders})`).run(...ids);
        return result.changes;
    }
    importPreview(req) {
        const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'] } = req;
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const newItems = [];
        const duplicates = [];
        const errors = [];
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(separator);
            const record = {};
            format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });
            record.provider = inferProvider(record);
            const validationError = validateImportRecord(record, i + 1);
            if (validationError) {
                errors.push(validationError);
                continue;
            }
            const existing = database_1.default.prepare('SELECT id FROM accounts WHERE email = ?').get(record.email);
            const item = { line: i + 1, ...record };
            if (existing)
                duplicates.push(item);
            else
                newItems.push(item);
        }
        return { newItems, duplicates, errors };
    }
    importConfirm(req) {
        const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'], mode } = req;
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let imported = 0, skipped = 0;
        const errors = [];
        const insertStmt = database_1.default.prepare(`
      INSERT OR IGNORE INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const updateStmt = database_1.default.prepare(`
      UPDATE accounts
      SET provider = ?, mode = ?, password = ?, client_id = ?, client_secret = ?, refresh_token = ?,
          custom_imap_host = ?, custom_imap_port = ?, custom_smtp_host = ?, custom_smtp_port = ?, custom_smtp_secure = ?, custom_domain = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `);
        const transaction = database_1.default.transaction(() => {
            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].split(separator);
                const record = {};
                format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });
                record.provider = inferProvider(record);
                const validationError = validateImportRecord(record, i + 1);
                if (validationError) {
                    errors.push(validationError);
                    continue;
                }
                const existing = database_1.default.prepare('SELECT id FROM accounts WHERE email = ?').get(record.email);
                if (existing) {
                    if (mode === 'overwrite') {
                        updateStmt.run(record.provider, record.mode || 'long_term', record.password || '', record.client_id || '', record.client_secret || '', record.refresh_token || '', record.custom_imap_host || '', record.custom_imap_port || 993, record.custom_smtp_host || '', record.custom_smtp_port || 465, record.custom_smtp_secure || 1, record.custom_domain || '', record.email);
                        imported++;
                    }
                    else {
                        skipped++;
                    }
                }
                else {
                    insertStmt.run(record.provider, record.mode || 'long_term', record.email, record.password || '', record.client_id || '', record.client_secret || '', record.refresh_token || '', record.custom_imap_host || '', record.custom_imap_port || 993, record.custom_smtp_host || '', record.custom_smtp_port || 465, record.custom_smtp_secure || 1, record.custom_domain || '');
                    imported++;
                }
            }
        });
        transaction();
        return { imported, skipped, errors };
    }
    import(req) {
        const { content, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'] } = req;
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let imported = 0, skipped = 0;
        const errors = [];
        const insertStmt = database_1.default.prepare(`
      INSERT OR IGNORE INTO accounts (
        provider, mode, email, password, client_id, client_secret, refresh_token,
        custom_imap_host, custom_imap_port, custom_smtp_host, custom_smtp_port, custom_smtp_secure, custom_domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const transaction = database_1.default.transaction(() => {
            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].split(separator);
                const record = {};
                format.forEach((field, idx) => { record[field] = (parts[idx] || '').trim(); });
                record.provider = inferProvider(record);
                const validationError = validateImportRecord(record, i + 1);
                if (validationError) {
                    errors.push(validationError);
                    continue;
                }
                const result = insertStmt.run(record.provider, record.mode || 'long_term', record.email, record.password || '', record.client_id || '', record.client_secret || '', record.refresh_token || '', record.custom_imap_host || '', record.custom_imap_port || 993, record.custom_smtp_host || '', record.custom_smtp_port || 465, record.custom_smtp_secure || 1, record.custom_domain || '');
                if (result.changes > 0)
                    imported++;
                else
                    skipped++;
            }
        });
        transaction();
        return { imported, skipped, errors };
    }
    export(ids, separator = '----', format = ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token']) {
        let accounts;
        if (ids && ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            accounts = database_1.default.prepare(`SELECT * FROM accounts WHERE id IN (${placeholders})`).all(...ids);
        }
        else {
            accounts = database_1.default.prepare('SELECT * FROM accounts').all();
        }
        return accounts.map(acc => format.map(f => acc[f] || '').join(separator)).join('\n');
    }
    updateSyncTime(id) {
        database_1.default.prepare('UPDATE accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }
    updateTokenRefreshTime(id, newRefreshToken) {
        if (newRefreshToken) {
            database_1.default.prepare('UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, refresh_token = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(newRefreshToken, 'active', id);
        }
        else {
            database_1.default.prepare('UPDATE accounts SET token_refreshed_at = CURRENT_TIMESTAMP, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run('active', id);
        }
    }
    markError(id) {
        database_1.default.prepare('UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('error', id);
    }
    getAll() {
        return database_1.default.prepare('SELECT * FROM accounts ORDER BY id DESC').all();
    }
}
exports.AccountModel = AccountModel;
//# sourceMappingURL=Account.js.map