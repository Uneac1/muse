import { Context } from 'koa';
import { MailService } from '../services/MailService';
import { MailCacheModel } from '../models/MailCache';
import { success, fail } from '../utils/response';

const mailService = new MailService();
const cacheModel = new MailCacheModel();

export class MailController {
  async fetch(ctx: Context) {
    const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body as any;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    try {
      const result = await mailService.fetchMails(account_id, mailbox, proxy_id);
      success(ctx, result);
    } catch (err: any) {
      fail(ctx, `Failed to fetch mails: ${err.message}`);
    }
  }

  async fetchNew(ctx: Context) {
    const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body as any;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    try {
      const result = await mailService.fetchMails(account_id, mailbox, proxy_id, 1);
      success(ctx, result.mails[0] || null);
    } catch (err: any) {
      fail(ctx, `Failed to fetch new mail: ${err.message}`);
    }
  }

  async clear(ctx: Context) {
    const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body as any;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    try {
      await mailService.clearMailbox(account_id, mailbox, proxy_id);
      cacheModel.clearByAccount(account_id, mailbox);
      success(ctx, { message: '邮件正在清空中...' });
    } catch (err: any) {
      fail(ctx, `Failed to clear mailbox: ${err.message}`);
    }
  }

  async cached(ctx: Context) {
    const { account_id, mailbox = 'INBOX', page = '1', pageSize = '50' } = ctx.query as Record<string, string>;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    const data = cacheModel.getByAccount(parseInt(account_id), mailbox, parseInt(page), parseInt(pageSize));
    success(ctx, data);
  }

  async search(ctx: Context) {
    const { account_id, mailbox = 'INBOX', query = '', page = '1', pageSize = '50' } = ctx.query as Record<string, string>;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    if (!query.trim()) return fail(ctx, 'query is required', 400);

    try {
      const data = await mailService.searchCachedMails(
        parseInt(account_id, 10),
        mailbox,
        query.trim(),
        parseInt(page, 10),
        parseInt(pageSize, 10)
      );
      success(ctx, data);
    } catch (err: any) {
      fail(ctx, `Failed to search mails: ${err.message}`);
    }
  }

  async recent(ctx: Context) {
    const { limit = '5' } = ctx.query as Record<string, string>;
    try {
      const data = await mailService.getRecentMails(parseInt(limit, 10) || 5);
      success(ctx, data);
    } catch (err: any) {
      fail(ctx, `Failed to get recent mails: ${err.message}`);
    }
  }

  async refreshRecent(ctx: Context) {
    const { limit = 5, proxy_id } = ctx.request.body as any;
    try {
      const data = await mailService.refreshRecentMails(Number(limit) || 5, proxy_id);
      success(ctx, data);
    } catch (err: any) {
      fail(ctx, `Failed to refresh recent mails: ${err.message}`);
    }
  }

  async send(ctx: Context) {
    const { account_id, to, subject, text, html, proxy_id } = ctx.request.body as any;
    if (!account_id) return fail(ctx, 'account_id is required', 400);
    if (!to) return fail(ctx, 'to is required', 400);
    if (!subject) return fail(ctx, 'subject is required', 400);

    try {
      await mailService.sendMail(account_id, { to, subject, text, html }, proxy_id);
      success(ctx, { message: '邮件发送成功' });
    } catch (err: any) {
      fail(ctx, `Failed to send mail: ${err.message}`);
    }
  }
}
