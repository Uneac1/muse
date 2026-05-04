import { AccountModel } from '../models/Account';
import { MailCacheModel } from '../models/MailCache';
import { OAuthService } from './OAuthService';
import { GraphApiService } from './GraphApiService';
import { ImapService } from './ImapService';
import { SmtpService } from './SmtpService';
import { Account, FetchMailsResult } from '../types';
import logger from '../utils/logger';
import { config } from '../config';

const accountModel = new AccountModel();
const cacheModel = new MailCacheModel();
const oauthService = new OAuthService();
const graphService = new GraphApiService();
const imapService = new ImapService();
const smtpService = new SmtpService();
const REFRESH_RECENT_ACCOUNT_LIMIT = 100;
const REFRESH_RECENT_CONCURRENCY = 3;

export class MailService {
  private async forEachWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    });
    await Promise.all(runners);
  }

  private resolveGmailCredentials(account: { client_id: string; client_secret: string; refresh_token: string }) {
    return {
      clientId: String(account.client_id || config.googleClientId || '').trim(),
      clientSecret: String(account.client_secret || config.googleClientSecret || '').trim(),
      refreshToken: String(account.refresh_token || '').trim(),
    };
  }

  private getEffectiveProvider(account: { provider: string; email: string }) {
    const email = account.email.toLowerCase();
    if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com')) return 'qq';
    if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) return 'gmail';
    return account.provider;
  }

  private async fetchCustomMails(account: Account, mailbox: string, top: number): Promise<FetchMailsResult> {
    if (!account.password) throw new Error('Custom mailbox missing password');
    if (!account.custom_imap_host) throw new Error('Custom mailbox missing IMAP host');

    const mails = await imapService.fetchMails(
      account.email,
      { password: account.password },
      mailbox,
      top,
      'custom',
      { host: account.custom_imap_host, port: account.custom_imap_port }
    );
    cacheModel.upsert(account.id, mailbox, mails);
    accountModel.updateSyncTime(account.id);
    accountModel.update(account.id, { status: 'active' });
    return { mails: mails as any, total: mails.length, protocol: 'imap', cached: false };
  }

  private async fetchQqMails(account: Account, mailbox: string, top: number): Promise<FetchMailsResult> {
    if (!account.password) throw new Error('QQ account missing password');

    const mails = await imapService.fetchMails(account.email, { password: account.password }, mailbox, top, 'qq');
    cacheModel.upsert(account.id, mailbox, mails);
    accountModel.updateSyncTime(account.id);
    accountModel.update(account.id, { status: 'active' });
    return { mails: mails as any, total: mails.length, protocol: 'imap', cached: false };
  }

  private async fetchMicrosoftMails(account: Account, mailbox: string, proxyId: number | undefined, top: number): Promise<FetchMailsResult> {
    try {
      const token = await oauthService.refreshGraphToken(account.client_id, account.refresh_token, proxyId);
      accountModel.updateTokenRefreshTime(account.id, token.refresh_token);

      if (token.has_mail_scope) {
        const mails = await graphService.fetchMails(token.access_token, mailbox, top, proxyId);
        cacheModel.upsert(account.id, mailbox, mails);
        accountModel.updateSyncTime(account.id);
        return { mails: mails as any, total: mails.length, protocol: 'graph', cached: false };
      }
      logger.warn(`Graph API no Mail.Read scope for ${account.email}, falling back to IMAP`);
    } catch (err: any) {
      logger.warn(`Graph API failed for ${account.email}: ${err.message}, falling back to IMAP`);
    }

    const freshAccount = accountModel.getByIdBasic(account.id);
    const refreshToken = freshAccount?.refresh_token || account.refresh_token;
    const token = await oauthService.refreshImapToken(account.client_id, refreshToken, proxyId);
    accountModel.updateTokenRefreshTime(account.id, token.refresh_token);

    const authString = imapService.generateAuthString(account.email, token.access_token);
    const mails = await imapService.fetchMails(account.email, { xoauth2: authString }, mailbox, top, 'microsoft');
    cacheModel.upsert(account.id, mailbox, mails);
    accountModel.updateSyncTime(account.id);
    return { mails: mails as any, total: mails.length, protocol: 'imap', cached: false };
  }

  private async fetchGmailMails(account: Account, mailbox: string, proxyId: number | undefined, top: number): Promise<FetchMailsResult> {
    const gmail = this.resolveGmailCredentials(account);
    if (!gmail.clientId || !gmail.clientSecret || !gmail.refreshToken || gmail.refreshToken.length < 20) {
      throw new Error('Gmail authorization is incomplete or expired. Please reconnect Gmail from the account editor.');
    }

    const token = await oauthService.refreshGoogleToken(gmail.clientId, gmail.clientSecret, gmail.refreshToken, proxyId);
    accountModel.updateTokenRefreshTime(account.id, token.refresh_token);

    const authString = imapService.generateAuthString(account.email, token.access_token);
    const mails = await imapService.fetchMails(account.email, { xoauth2: authString }, mailbox, top, 'gmail');
    cacheModel.upsert(account.id, mailbox, mails);
    accountModel.updateSyncTime(account.id);
    return { mails: mails as any, total: mails.length, protocol: 'imap', cached: false };
  }

  async fetchMails(accountId: number, mailbox: string, proxyId?: number, top = 50): Promise<FetchMailsResult> {
    const account = accountModel.getByIdBasic(accountId);
    if (!account) throw new Error('Account not found');
    const provider = this.getEffectiveProvider(account);

    try {
      if (provider === 'qq') {
        return await this.fetchQqMails(account, mailbox, top);
      }
      if (provider === 'custom') {
        return await this.fetchCustomMails(account, mailbox, top);
      }
      if (provider === 'gmail') {
        return await this.fetchGmailMails(account, mailbox, proxyId, top);
      }
      return await this.fetchMicrosoftMails(account, mailbox, proxyId, top);
    } catch (err: any) {
      logger.error(`Mail fetch failed for ${account.email}: ${err.message}`);
      accountModel.markError(accountId);
      const cached = cacheModel.getByAccount(accountId, mailbox, 1, top);
      if (cached.list.length > 0) {
        return { mails: cached.list, total: cached.total, protocol: provider === 'microsoft' ? 'graph' : 'imap', cached: true };
      }
      throw new Error(`Mail fetch failed: ${err.message}`);
    }
  }

  async clearMailbox(accountId: number, mailbox: string, proxyId?: number): Promise<void> {
    const account = accountModel.getByIdBasic(accountId);
    if (!account) throw new Error('Account not found');
    const provider = this.getEffectiveProvider(account);

    if (provider === 'qq') {
      if (!account.password) throw new Error('QQ account missing password');
      await imapService.clearMailbox(account.email, { password: account.password }, mailbox, 'qq');
      return;
    }

    if (provider === 'custom') {
      if (!account.password) throw new Error('Custom mailbox missing password');
      if (!account.custom_imap_host) throw new Error('Custom mailbox missing IMAP host');
      await imapService.clearMailbox(
        account.email,
        { password: account.password },
        mailbox,
        'custom',
        { host: account.custom_imap_host, port: account.custom_imap_port }
      );
      return;
    }

    if (provider === 'gmail') {
      const gmail = this.resolveGmailCredentials(account);
      if (!gmail.clientId || !gmail.clientSecret || !gmail.refreshToken) {
        throw new Error('Gmail account missing OAuth credentials');
      }
      const token = await oauthService.refreshGoogleToken(gmail.clientId, gmail.clientSecret, gmail.refreshToken, proxyId);
      accountModel.updateTokenRefreshTime(accountId, token.refresh_token);
      const authString = imapService.generateAuthString(account.email, token.access_token);
      await imapService.clearMailbox(account.email, { xoauth2: authString }, mailbox, 'gmail');
      return;
    }

    // 尝试 Graph API 删除
    try {
      const token = await oauthService.refreshGraphToken(account.client_id, account.refresh_token, proxyId);
      accountModel.updateTokenRefreshTime(accountId, token.refresh_token);

      if (token.has_mail_scope) {
        await graphService.deleteAllMails(token.access_token, mailbox, proxyId);
        return;
      }
    } catch (err: any) {
      logger.warn(`Graph delete failed for ${account.email}: ${err.message}, trying IMAP`);
    }

    // 回退 IMAP 删除
    const freshAccount = accountModel.getByIdBasic(accountId);
    const refreshToken = freshAccount?.refresh_token || account.refresh_token;

    const token = await oauthService.refreshImapToken(account.client_id, refreshToken, proxyId);
    accountModel.updateTokenRefreshTime(accountId, token.refresh_token);

    const authString = imapService.generateAuthString(account.email, token.access_token);
    await imapService.clearMailbox(account.email, { xoauth2: authString }, mailbox, 'microsoft');
  }

  async getRecentMails(limit = 5) {
    return cacheModel.getRecentSummary(Math.max(1, Math.min(Math.trunc(limit) || 5, 20)));
  }

  async searchCachedMails(accountId: number, mailbox: string, query: string, page = 1, pageSize = 50) {
    return cacheModel.search(accountId, mailbox, query, page, Math.max(1, Math.min(Math.trunc(pageSize) || 50, 100)));
  }

  async refreshRecentMails(limit = 5, proxyId?: number) {
    const accounts = accountModel
      .getAllBasic()
      .filter((account) => account.status !== 'inactive')
      .slice(0, REFRESH_RECENT_ACCOUNT_LIMIT);

    await this.forEachWithConcurrency(accounts, REFRESH_RECENT_CONCURRENCY, async (account) => {
      try {
        await this.fetchMails(account.id, 'INBOX', proxyId, 1);
      } catch (err) {
        // Best-effort background refresh. Individual account failures should not block the recent feed.
      }
    });

    return this.getRecentMails(limit);
  }

  async sendMail(
    accountId: number,
    data: { to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string; attachments?: any[] },
    proxyId?: number
  ) {
    const account = accountModel.getByIdBasic(accountId);
    if (!account) throw new Error('Account not found');

    await smtpService.sendMail(account, data, proxyId);
    accountModel.update(accountId, { status: 'active' });
  }
}
