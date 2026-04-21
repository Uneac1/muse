import db from '../database';
import { MailMessage } from '../types';

export class MailCacheModel {
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
    const offset = (page - 1) * pageSize;
    const total = (db.prepare('SELECT COUNT(*) as c FROM mail_cache WHERE account_id = ? AND mailbox = ?').get(accountId, mailbox) as any).c;
    const list = db.prepare('SELECT * FROM mail_cache WHERE account_id = ? AND mailbox = ? ORDER BY mail_date DESC LIMIT ? OFFSET ?')
      .all(accountId, mailbox, pageSize, offset)
      .map((mail) => this.mapMail(mail));
    return { list, total, page, pageSize };
  }

  upsert(accountId: number, mailbox: string, mails: Partial<MailMessage>[]) {
    const stmt = db.prepare(`
      INSERT INTO mail_cache (account_id, mailbox, mail_id, sender, sender_name, recipients, subject, text_content, html_content, attachments, mail_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
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
          mail.mail_id || '',
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
    return db.prepare('SELECT mc.*, a.email as account_email FROM mail_cache mc JOIN accounts a ON mc.account_id = a.id ORDER BY mc.mail_date DESC LIMIT ?')
      .all(limit)
      .map((mail) => this.mapMail(mail));
  }

  getRecentSummary(limit = 5): MailMessage[] {
    return db.prepare(`
      SELECT
        mc.id,
        mc.account_id,
        mc.mailbox,
        mc.mail_id,
        mc.sender,
        mc.sender_name,
        mc.recipients,
        mc.subject,
        '' as text_content,
        '' as html_content,
        mc.mail_date,
        mc.is_read,
        mc.cached_at,
        a.email as account_email
      FROM mail_cache mc
      JOIN accounts a ON mc.account_id = a.id
      ORDER BY mc.mail_date DESC
      LIMIT ?
    `)
      .all(limit)
      .map((mail) => this.mapMail(mail));
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
    const offset = (page - 1) * pageSize;
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
      .all(accountId, mailbox, like, like, like, like, like, pageSize, offset)
      .map((mail) => this.mapMail(mail));

    return { list, total, page, pageSize };
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
