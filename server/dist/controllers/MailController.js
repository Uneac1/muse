"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailController = void 0;
const MailService_1 = require("../services/MailService");
const MailCache_1 = require("../models/MailCache");
const response_1 = require("../utils/response");
const mailService = new MailService_1.MailService();
const cacheModel = new MailCache_1.MailCacheModel();
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
        const data = cacheModel.getByAccount(parseInt(account_id), mailbox, parseInt(page), parseInt(pageSize));
        (0, response_1.success)(ctx, data);
    }
    async search(ctx) {
        const { account_id, mailbox = 'INBOX', query = '', page = '1', pageSize = '50' } = ctx.query;
        if (!account_id)
            return (0, response_1.fail)(ctx, 'account_id is required', 400);
        if (!query.trim())
            return (0, response_1.fail)(ctx, 'query is required', 400);
        try {
            const data = await mailService.searchCachedMails(parseInt(account_id, 10), mailbox, query.trim(), parseInt(page, 10), parseInt(pageSize, 10));
            (0, response_1.success)(ctx, data);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to search mails: ${err.message}`);
        }
    }
    async recent(ctx) {
        const { limit = '5' } = ctx.query;
        try {
            const data = await mailService.getRecentMails(parseInt(limit, 10) || 5);
            (0, response_1.success)(ctx, data);
        }
        catch (err) {
            (0, response_1.fail)(ctx, `Failed to get recent mails: ${err.message}`);
        }
    }
    async refreshRecent(ctx) {
        const { limit = 5, proxy_id } = ctx.request.body;
        try {
            const data = await mailService.refreshRecentMails(Number(limit) || 5, proxy_id);
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