import db from '../database';
import { MailMessage } from '../types';

export class MailCacheModel {
  private clampPage(page = 1): number {
    return Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
  }

  private clampPageSize(pageSize = 50, max = 100): number {
    return Math.max(1, Math.min(Number.isFinite(pageSize) ? Math.trunc(pageSize) : 50, max));
  }

  private normalizeMailId(mail: Partial<MailMessage>) {
    const explicitMailId = String(mail.mail_id || '').trim();
    if (explicitMailId) return explicitMailId;

    const sender = String(mail.sender || '').trim();
    const subject = String(mail.subject || '').trim();
    const mailDate = String(mail.mail_date || '').trim();
    const recipients = String(mail.recipients || '').trim();
    return `fallback:${sender}|${subject}|${mailDate}|${recipients}`;
  }

  private mapMail(mail: any): MailMessage {
    return {
      ...mail,
      attachments: this.parseAttachments(mail.attachments),
    } as MailMessage;
  }

  private parseAttachments(raw: unknown) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return [];
    }
  }

  getByAccount(accountId: number, mailbox: string, page = 1, pageSize = 50) {
    const normalizedPage = this.clampPage(page);
    const normalizedPageSize = this.clampPageSize(pageSize);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const total = (db.prepare('SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as any).c;
    const list = db.prepare('SELECT * FROM mail_cache WHERE account_id = ? AND mailbox = ? ORDER BY mail_date DESC LIMIT ? OFFSET ?')
      .all(accountId, mailbox, normalizedPageSize, offset)
      .map((mail) => this.mapMail(mail));
    return { list, total, page: normalizedPage, pageSize: normalizedPageSize };
  }

  upsert(accountId: number, mailbox: string, mails: Partial<MailMessage>[]) {
    const stmt = db.prepare(`
      INSERT INTO mail_cache (account_id, mailbox, mail_id, sender, sender_name, recipients, subject, text_content, html_content, attachments, mail_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, mailbox, mail_id) DO UPDATE SET
        sender = excluded.sender,
        sender_name = excluded.sender_name,
        recipients = excluded.recipients,
        subject = excluded.subject,
        text_content = excluded.text_content,
        html_content = excluded.html_content,
        attachments = excluded.attachments,
        mail_date = excluded.mail_date,
        cached_at = CURRENT_TIMESTAMP
    `);
    const transaction = db.transaction(() => {
      for (const mail of mails) {
        stmt.run(
          accountId,
          mailbox,
          this.normalizeMailId(mail),
          mail.sender || '',
          mail.sender_name || '',
          mail.recipients || '',
          mail.subject || '',
          mail.text_content || '',
          mail.html_content || '',
          JSON.stringify(mail.attachments || []),
          mail.mail_date || null
        );
      }
    });
    transaction();
  }

  clearByAccount(accountId: number, mailbox: string) {
    db.prepare('DELETE FROM mail_cache WHERE account_id = ? AND mailbox = ?').run(accountId, mailbox);
  }

  getRecent(limit = 5): MailMessage[] {
    return db.prepare(`
      SELECT *
      FROM (
        SELECT
          mc.*,
          a.email as account_email,
          ROW_NUMBER() OVER (
            PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
            ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
          ) as rn
        FROM mail_cache mc
        JOIN accounts a ON mc.account_id = a.id
      )
      WHERE rn = 1
      ORDER BY COALESCE(mail_date, cached_at) DESC, id DESC
      LIMIT ?
    `)
      .all(limit)
      .map((mail) => this.mapMail(mail));
  }

  getRecentSummary(limit = 5): MailMessage[] {
    return db.prepare(`
      SELECT *
      FROM (
        SELECT
          mc.id,
          mc.account_id,
          mc.mailbox,
          mc.mail_id,
          mc.sender,
          mc.sender_name,
          mc.recipients,
          mc.subject,
          SUBSTR(COALESCE(mc.text_content, ''), 1, 280) as text_content,
          '' as html_content,
          '[]' as attachments,
          mc.mail_date,
          mc.is_read,
          mc.cached_at,
          a.email as account_email,
          ROW_NUMBER() OVER (
            PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
            ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
          ) as rn
        FROM mail_cache mc
        JOIN accounts a ON mc.account_id = a.id
      )
      WHERE rn = 1
      ORDER BY COALESCE(mail_date, cached_at) DESC, id DESC
      LIMIT ?
    `)
      .all(limit)
      .map((mail) => this.mapMail(mail));
  }

  getUnified(page = 1, pageSize = 100) {
    const normalizedPage = this.clampPage(page);
    const normalizedPageSize = this.clampPageSize(pageSize, 100);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const total = (db.prepare(`
      SELECT COUNT(*) as c
      FROM (
        SELECT 1
        FROM (
          SELECT
            ROW_NUMBER() OVER (
              PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
              ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
            ) as rn
          FROM mail_cache mc
        )
        WHERE rn = 1
      )
    `).get() as any).c;

    const list = db.prepare(`
      SELECT *
      FROM (
        SELECT
          mc.*,
          a.email as account_email,
          ROW_NUMBER() OVER (
            PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
            ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
          ) as rn
        FROM mail_cache mc
        JOIN accounts a ON mc.account_id = a.id
      )
      WHERE rn = 1
      ORDER BY COALESCE(mail_date, cached_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `)
      .all(normalizedPageSize, offset)
      .map((mail) => this.mapMail(mail));

    return {
      list,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  getUnifiedSummary(page = 1, pageSize = 100) {
    const normalizedPage = this.clampPage(page);
    const normalizedPageSize = this.clampPageSize(pageSize, 100);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const total = (db.prepare(`
      SELECT COUNT(*) as c
      FROM (
        SELECT 1
        FROM (
          SELECT
            ROW_NUMBER() OVER (
              PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
              ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
            ) as rn
          FROM mail_cache mc
        )
        WHERE rn = 1
      )
    `).get() as any).c;

    const list = db.prepare(`
      SELECT *
      FROM (
        SELECT
          mc.id,
          mc.account_id,
          mc.mailbox,
          mc.mail_id,
          mc.sender,
          mc.sender_name,
          mc.recipients,
          mc.subject,
          SUBSTR(COALESCE(mc.text_content, ''), 1, 1000) as text_content,
          '' as html_content,
          '[]' as attachments,
          mc.mail_date,
          mc.is_read,
          mc.cached_at,
          a.email as account_email,
          ROW_NUMBER() OVER (
            PARTITION BY mc.account_id, mc.mailbox, mc.mail_id
            ORDER BY COALESCE(mc.mail_date, mc.cached_at) DESC, mc.id DESC
          ) as rn
        FROM mail_cache mc
        JOIN accounts a ON mc.account_id = a.id
      )
      WHERE rn = 1
      ORDER BY COALESCE(mail_date, cached_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `)
      .all(normalizedPageSize, offset)
      .map((mail) => this.mapMail(mail));

    return {
      list,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  getRecentByAccounts(accountIds: number[], limit = 5): MailMessage[] {
    if (accountIds.length === 0) return [];
    const placeholders = accountIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT mc.*, a.email as account_email
      FROM mail_cache mc
      JOIN accounts a ON mc.account_id = a.id
      WHERE mc.account_id IN (${placeholders})
      ORDER BY mc.mail_date DESC
      LIMIT ?
    `).all(...accountIds, limit).map((mail) => this.mapMail(mail));
  }

  search(accountId: number, mailbox: string, query: string, page = 1, pageSize = 50) {
    const normalizedPage = this.clampPage(page);
    const normalizedPageSize = this.clampPageSize(pageSize);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const like = `%${query}%`;
    const total = (db.prepare(`
      SELECT COUNT(*) as c
      FROM mail_cache
      WHERE account_id = ? AND mailbox = ?
        AND (sender LIKE ? OR sender_name LIKE ? OR recipients LIKE ? OR subject LIKE ? OR text_content LIKE ?)
    `).get(accountId, mailbox, like, like, like, like, like) as any).c;

    const list = db.prepare(`
      SELECT *
      FROM mail_cache
      WHERE account_id = ? AND mailbox = ?
        AND (sender LIKE ? OR sender_name LIKE ? OR recipients LIKE ? OR subject LIKE ? OR text_content LIKE ?)
      ORDER BY mail_date DESC
      LIMIT ? OFFSET ?
    `)
      .all(accountId, mailbox, like, like, like, like, like, normalizedPageSize, offset)
      .map((mail) => this.mapMail(mail));

    return { list, total, page: normalizedPage, pageSize: normalizedPageSize };
  }

  countByAccount(accountId: number, mailbox: string): number {
    return (db.prepare('SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as any).c;
  }

  countGroupedByAccount(mailbox: string): Array<{ account_id: number; count: number }> {
    return db.prepare(`
      SELECT account_id, COUNT(*) as count
      FROM mail_cache
      WHERE mailbox = ?
      GROUP BY account_id
    `).all(mailbox) as Array<{ account_id: number; count: number }>;
  }

  countGroupedByMailbox(): Array<{ mailbox: string; count: number }> {
    return db.prepare(`
      SELECT mailbox, COUNT(*) as count
      FROM mail_cache
      GROUP BY mailbox
    `).all() as Array<{ mailbox: string; count: number }>;
  }

  countAll(mailbox: string): number {
    return (db.prepare('SELECT COUNT(*) as c FROM mail_cache WHERE mailbox = ?').get(mailbox) as any).c;
  }
}
