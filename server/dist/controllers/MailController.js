"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailController = void 0;
const MailService_1 = require("../services/MailService");
const YmailService_1 = require("../services/YmailService");
const MailCache_1 = require("../models/MailCache");
const IntegrationToken_1 = require("../models/IntegrationToken");
const response_1 = require("../utils/response");
const mailService = new MailService_1.MailService();
const cacheModel = new MailCache_1.MailCacheModel();
const ymailService = new YmailService_1.YmailService();
const integrationTokenModel = new IntegrationToken_1.IntegrationTokenModel();
const TEMPORARY_MAIL_CACHE_TTL_MS = 60 * 1000;
const TEMPORARY_MAIL_ADDRESS_LIMIT = 40;
const TEMPORARY_MAILS_PER_ADDRESS = 20;
const TEMPORARY_MAIL_CONCURRENCY = 4;
const MAX_MAIL_PAGE_SIZE = 100;
const MAX_UNIFIED_REGULAR_MAILS = 1000;
let temporaryMailCache = null;
let temporaryMailInflight = null;
function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function clampPageSize(value, fallback) {
    return Math.max(1, Math.min(parsePositiveInt(value, fallback), MAX_MAIL_PAGE_SIZE));
}
async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            try {
                results[currentIndex] = { status: 'fulfilled', value: await mapper(items[currentIndex]) };
            }
            catch (reason) {
                results[currentIndex] = { status: 'rejected', reason };
            }
        }
    });
    await Promise.all(workers);
    return results;
}
class MailController {
    async fetch(ctx) {
        const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        try {
            const result = await mailService.fetchMails(account_id, mailbox, proxy_id);
            (0, response_1.success)(ctx, result);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to fetch mails: ${err.message}`);
        }
    }
    async fetchNew(ctx) {
        const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        try {
            const result = await mailService.fetchMails(account_id, mailbox, proxy_id, 1);
            (0, response_1.success)(ctx, result.mails[0] || null);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to fetch new mail: ${err.message}`);
        }
    }
    async clear(ctx) {
        const { account_id, mailbox = 'INBOX', proxy_id } = ctx.request.body;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        try {
            await mailService.clearMailbox(account_id, mailbox, proxy_id);
            cacheModel.clearByAccount(account_id, mailbox);
            (0, response_1.success)(ctx, { message: '邮件正在清空中...' });
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to clear mailbox: ${err.message}`);
        }
    }
    async cached(ctx) {
        const { account_id, mailbox = 'INBOX', page = '1', pageSize = '50' } = ctx.query;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        const data = cacheModel.getByAccount(parsePositiveInt(account_id, 0), mailbox, parsePositiveInt(page, 1), clampPageSize(pageSize, 50));
        (0, response_1.success)(ctx, data);
    }
    async unified(ctx) {
        const { page = '1', pageSize = '100' } = ctx.query;
        const normalizedPage = parsePositiveInt(page, 1);
        const normalizedPageSize = clampPageSize(pageSize, 100);
        const regularLimit = Math.min(normalizedPage * normalizedPageSize, MAX_UNIFIED_REGULAR_MAILS);
        const regular = cacheModel.getUnifiedSummary(1, regularLimit);
        const regularList = regular.list.map((mail) => ({
            ...mail,
            source: 'mail',
            mailboxType: 'mail',
        }));
        const temporary = await this.getTemporaryMails();
        const merged = [...regularList, ...temporary].sort((a, b) => {
            const at = new Date(a.mail_date || a.cached_at || 0).getTime();
            const bt = new Date(b.mail_date || b.cached_at || 0).getTime();
            return bt - at;
        });
        const offset = (normalizedPage - 1) * normalizedPageSize;
        (0, response_1.success)(ctx, {
            list: merged.slice(offset, offset + normalizedPageSize),
            total: merged.length,
            page: normalizedPage,
            pageSize: normalizedPageSize,
        });
    }
    async getTemporaryMails() {
        if (temporaryMailCache && temporaryMailCache.expiresAt > Date.now()) {
            return temporaryMailCache.mails;
        }
        if (temporaryMailInflight)
            return temporaryMailInflight;
        const record = integrationTokenModel.get('ymail');
        if (!record)
            return [];
        temporaryMailInflight = (async () => {
            const integration = await ymailService.fetchIntegrationData(record);
            const addresses = Array.isArray(integration.addresses) ? integration.addresses.slice(0, TEMPORARY_MAIL_ADDRESS_LIMIT) : [];
            const results = await mapWithConcurrency(addresses, TEMPORARY_MAIL_CONCURRENCY, async (address) => {
                const mailbox = await ymailService.fetchAddressMailbox(record, Number(address.id), {
                    limit: TEMPORARY_MAILS_PER_ADDRESS,
                    offset: 0,
                });
                return mailbox.results.map((mail) => this.mapTemporaryMail(address.id, mailbox.address || address.address || address.name, mail));
            });
            const mails = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
            temporaryMailCache = {
                expiresAt: Date.now() + TEMPORARY_MAIL_CACHE_TTL_MS,
                mails,
            };
            return mails;
        })();
        try {
            return await temporaryMailInflight;
        }
        catch {
            return [];
        }
        finally {
            temporaryMailInflight = null;
        }
    }
    mapTemporaryMail(addressId, address, mail) {
        const id = Number(mail.id || 0);
        return {
            id: -Math.abs(addressId * 1_000_000 + id),
            account_id: -Math.abs(addressId),
            mailbox: 'INBOX',
            mail_id: `ymail:${addressId}:${id || mail.created_at || mail.subject || ''}`,
            sender: String(mail.from || ''),
            sender_name: String(mail.from || ''),
            recipients: String(mail.to || address || ''),
            subject: String(mail.subject || '(无主题)'),
            text_content: String(mail.text || ''),
            html_content: String(mail.html || ''),
            attachments: [],
            mail_date: String(mail.created_at || ''),
            is_read: false,
            cached_at: String(mail.created_at || new Date().toISOString()),
            account_email: address || '临时邮箱',
            source: 'temporary',
            mailboxType: 'temporary',
        };
    }
    async search(ctx) {
        const { account_id, mailbox = 'INBOX', query = '', page = '1', pageSize = '50' } = ctx.query;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        if (!query.trim())
            return (0, response_1.fail)(ctx, 'query is required', 400);
        try {
            const data = await mailService.searchCachedMails(parseInt(account_id, 10), mailbox, query.trim(), parsePositiveInt(page, 1), clampPageSize(pageSize, 50));
            (0, response_1.success)(ctx, data);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to search mails: ${err.message}`);
        }
    }
    async recent(ctx) {
        const { limit = '5' } = ctx.query;
        try {
            const data = await mailService.getRecentMails(Math.min(parsePositiveInt(limit, 5), 20));
            (0, response_1.success)(ctx, data);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to get recent mails: ${err.message}`);
        }
    }
    async refreshRecent(ctx) {
        const { limit = 5, proxy_id } = ctx.request.body;
        try {
            const data = await mailService.refreshRecentMails(Math.min(parsePositiveInt(limit, 5), 20), proxy_id);
            (0, response_1.success)(ctx, data);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to refresh recent mails: ${err.message}`);
        }
    }
    async send(ctx) {
        const { account_id, to, subject, text, html, proxy_id } = ctx.request.body;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        if (!to)
            return (0, response_1.fail)(ctx, 'to is required', 400);
        if (!subject)
            return (0, response_1.fail)(ctx, 'subject is required', 400);
        try {
            await mailService.sendMail(account_id, { to, subject, text, html }, proxy_id);
            (0, response_1.success)(ctx, { message: '邮件发送成功' });
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to send mail: ${err.message}`);
        }
    }
}
exports.MailController = MailController;
//# sourceMappingURL=MailController.js.map