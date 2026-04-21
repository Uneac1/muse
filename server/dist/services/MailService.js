"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const Account_1 = require("../models/Account");
const MailCache_1 = require("../models/MailCache");
const OAuthService_1 = require("./OAuthService");
const GraphApiService_1 = require("./GraphApiService");
const ImapService_1 = require("./ImapService");
const SmtpService_1 = require("./SmtpService");
const logger_1 = __importDefault(require("../utils/logger"));
const accountModel = new Account_1.AccountModel();
const cacheModel = new MailCache_1.MailCacheModel();
const oauthService = new OAuthService_1.OAuthService();
const graphService = new GraphApiService_1.GraphApiService();
const imapService = new ImapService_1.ImapService();
const smtpService = new SmtpService_1.SmtpService();
class MailService {
    getEffectiveProvider(account) {
        const email = account.email.toLowerCase();
        if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com'))
            return 'qq';
        if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'))
            return 'gmail';
        return account.provider;
    }
    async fetchCustomMails(accountId, mailbox, top) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        if (!account.password)
            throw new Error('Custom mailbox missing password');
        if (!account.custom_imap_host)
            throw new Error('Custom mailbox missing IMAP host');
        const mails = await imapService.fetchMails(account.email, { password: account.password }, mailbox, top, 'custom', { host: account.custom_imap_host, port: account.custom_imap_port });
        cacheModel.upsert(accountId, mailbox, mails);
        accountModel.updateSyncTime(accountId);
        accountModel.update(accountId, { status: 'active' });
        return { mails: mails, total: mails.length, protocol: 'imap', cached: false };
    }
    async fetchQqMails(accountId, mailbox, top) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        if (!account.password)
            throw new Error('QQ account missing password');
        const mails = await imapService.fetchMails(account.email, { password: account.password }, mailbox, top, 'qq');
        cacheModel.upsert(accountId, mailbox, mails);
        accountModel.updateSyncTime(accountId);
        accountModel.update(accountId, { status: 'active' });
        return { mails: mails, total: mails.length, protocol: 'imap', cached: false };
    }
    async fetchMicrosoftMails(accountId, mailbox, proxyId, top) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        try {
            const token = await oauthService.refreshGraphToken(account.client_id, account.refresh_token, proxyId);
            accountModel.updateTokenRefreshTime(accountId, token.refresh_token);
            if (token.has_mail_scope) {
                const mails = await graphService.fetchMails(token.access_token, mailbox, top, proxyId);
                cacheModel.upsert(accountId, mailbox, mails);
                accountModel.updateSyncTime(accountId);
                return { mails: mails, total: mails.length, protocol: 'graph', cached: false };
            }
            logger_1.default.warn(`Graph API no Mail.Read scope for ${account.email}, falling back to IMAP`);
        }
        catch (err) {
            logger_1.default.warn(`Graph API failed for ${account.email}: ${err.message}, falling back to IMAP`);
        }
        const freshAccount = accountModel.getById(accountId);
        const refreshToken = freshAccount?.refresh_token || account.refresh_token;
        const token = await oauthService.refreshImapToken(account.client_id, refreshToken, proxyId);
        accountModel.updateTokenRefreshTime(accountId, token.refresh_token);
        const authString = imapService.generateAuthString(account.email, token.access_token);
        const mails = await imapService.fetchMails(account.email, { xoauth2: authString }, mailbox, top, 'microsoft');
        cacheModel.upsert(accountId, mailbox, mails);
        accountModel.updateSyncTime(accountId);
        return { mails: mails, total: mails.length, protocol: 'imap', cached: false };
    }
    async fetchGmailMails(accountId, mailbox, proxyId, top) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        if (!account.client_id || !account.client_secret || !account.refresh_token || account.refresh_token.length < 20) {
            throw new Error('Gmail authorization is incomplete or expired. Please reconnect Gmail from the account editor.');
        }
        const token = await oauthService.refreshGoogleToken(account.client_id, account.client_secret, account.refresh_token, proxyId);
        accountModel.updateTokenRefreshTime(accountId, token.refresh_token);
        const authString = imapService.generateAuthString(account.email, token.access_token);
        const mails = await imapService.fetchMails(account.email, { xoauth2: authString }, mailbox, top, 'gmail');
        cacheModel.upsert(accountId, mailbox, mails);
        accountModel.updateSyncTime(accountId);
        return { mails: mails, total: mails.length, protocol: 'imap', cached: false };
    }
    async fetchMails(accountId, mailbox, proxyId, top = 50) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        const provider = this.getEffectiveProvider(account);
        try {
            if (provider === 'qq') {
                return await this.fetchQqMails(accountId, mailbox, top);
            }
            if (provider === 'custom') {
                return await this.fetchCustomMails(accountId, mailbox, top);
            }
            if (provider === 'gmail') {
                return await this.fetchGmailMails(accountId, mailbox, proxyId, top);
            }
            return await this.fetchMicrosoftMails(accountId, mailbox, proxyId, top);
        }
        catch (err) {
            logger_1.default.error(`Mail fetch failed for ${account.email}: ${err.message}`);
            accountModel.markError(accountId);
            const cached = cacheModel.getByAccount(accountId, mailbox, 1, top);
            if (cached.list.length > 0) {
                return { mails: cached.list, total: cached.total, protocol: provider === 'microsoft' ? 'graph' : 'imap', cached: true };
            }
            throw new Error(`Mail fetch failed: ${err.message}`);
        }
    }
    async clearMailbox(accountId, mailbox, proxyId) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        const provider = this.getEffectiveProvider(account);
        if (provider === 'qq') {
            if (!account.password)
                throw new Error('QQ account missing password');
            await imapService.clearMailbox(account.email, { password: account.password }, mailbox, 'qq');
            return;
        }
        if (provider === 'custom') {
            if (!account.password)
                throw new Error('Custom mailbox missing password');
            if (!account.custom_imap_host)
                throw new Error('Custom mailbox missing IMAP host');
            await imapService.clearMailbox(account.email, { password: account.password }, mailbox, 'custom', { host: account.custom_imap_host, port: account.custom_imap_port });
            return;
        }
        if (provider === 'gmail') {
            if (!account.client_secret)
                throw new Error('Gmail account missing client_secret');
            const token = await oauthService.refreshGoogleToken(account.client_id, account.client_secret, account.refresh_token, proxyId);
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
        }
        catch (err) {
            logger_1.default.warn(`Graph delete failed for ${account.email}: ${err.message}, trying IMAP`);
        }
        // 回退 IMAP 删除
        const freshAccount = accountModel.getById(accountId);
        const refreshToken = freshAccount?.refresh_token || account.refresh_token;
        const token = await oauthService.refreshImapToken(account.client_id, refreshToken, proxyId);
        accountModel.updateTokenRefreshTime(accountId, token.refresh_token);
        const authString = imapService.generateAuthString(account.email, token.access_token);
        await imapService.clearMailbox(account.email, { xoauth2: authString }, mailbox, 'microsoft');
    }
    async getRecentMails(limit = 5) {
        return cacheModel.getRecent(limit);
    }
    async searchCachedMails(accountId, mailbox, query, page = 1, pageSize = 50) {
        return cacheModel.search(accountId, mailbox, query, page, pageSize);
    }
    async refreshRecentMails(limit = 5, proxyId) {
        const accounts = accountModel.getAll().filter((account) => account.status !== 'inactive');
        for (const account of accounts) {
            try {
                await this.fetchMails(account.id, 'INBOX', proxyId, 1);
            }
            catch (err) {
                // Best-effort background refresh. Individual account failures should not block the recent feed.
            }
        }
        return cacheModel.getRecent(limit);
    }
    async sendMail(accountId, data, proxyId) {
        const account = accountModel.getById(accountId);
        if (!account)
            throw new Error('Account not found');
        await smtpService.sendMail(account, data, proxyId);
        accountModel.update(accountId, { status: 'active' });
    }
}
exports.MailService = MailService;
//# sourceMappingURL=MailService.js.map