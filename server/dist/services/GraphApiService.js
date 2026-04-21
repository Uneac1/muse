"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphApiService = void 0;
const ProxyService_1 = require("./ProxyService");
const logger_1 = __importDefault(require("../utils/logger"));
const proxyService = new ProxyService_1.ProxyService();
class GraphApiService {
    async fetchMails(accessToken, mailbox, top = 50, proxyId) {
        const folder = mailbox === 'Junk' ? 'junkemail' : mailbox === 'Sent' ? 'sentitems' : 'inbox';
        const { agent, dispatcher, type } = proxyService.getAgent(proxyId);
        const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$top=${top}`;
        let response;
        if (type === 'socks5' && agent) {
            const nodefetch = require('node-fetch');
            response = await nodefetch(url, {
                agent,
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            });
        }
        else {
            const { fetch: undiciFetch } = require('undici');
            const opts = {
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            };
            if (dispatcher)
                opts.dispatcher = dispatcher;
            response = await undiciFetch(url, opts);
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Graph API fetch failed: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        const emails = (data.value || []).map((item) => ({
            mail_id: item.id,
            sender: item.from?.emailAddress?.address || '',
            sender_name: item.from?.emailAddress?.name || '',
            recipients: (item.toRecipients || []).map((recipient) => recipient?.emailAddress?.address).filter(Boolean).join(', '),
            subject: item.subject || '',
            text_content: item.bodyPreview || '',
            html_content: item.body?.content || '',
            mail_date: item.createdDateTime || '',
            attachments: (item.attachments || []).map((attachment) => ({
                filename: attachment.name || 'attachment',
                contentType: attachment.contentType || '',
                size: attachment.size || 0,
            })),
        }));
        logger_1.default.info(`Graph API fetched ${emails.length} mails from ${folder}`);
        return emails;
    }
    async deleteMail(accessToken, mailId, proxyId) {
        const { agent, dispatcher, type } = proxyService.getAgent(proxyId);
        const url = `https://graph.microsoft.com/v1.0/me/messages/${mailId}`;
        if (type === 'socks5' && agent) {
            const nodefetch = require('node-fetch');
            await nodefetch(url, { method: 'DELETE', agent, headers: { Authorization: `Bearer ${accessToken}` } });
        }
        else {
            const { fetch: undiciFetch } = require('undici');
            const opts = { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } };
            if (dispatcher)
                opts.dispatcher = dispatcher;
            await undiciFetch(url, opts);
        }
    }
    async deleteAllMails(accessToken, mailbox, proxyId) {
        const mails = await this.fetchMails(accessToken, mailbox, 10000, proxyId);
        const batchSize = 10;
        for (let i = 0; i < mails.length; i += batchSize) {
            const batch = mails.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(m => this.deleteMail(accessToken, m.mail_id, proxyId)));
        }
        logger_1.default.info(`Deleted ${mails.length} mails from ${mailbox}`);
    }
}
exports.GraphApiService = GraphApiService;
//# sourceMappingURL=GraphApiService.js.map