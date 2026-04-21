"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImapService = void 0;
const node_imap_1 = __importDefault(require("node-imap"));
const mailparser_1 = require("mailparser");
const logger_1 = __importDefault(require("../utils/logger"));
class ImapService {
    getAddressText(value) {
        if (!value)
            return '';
        if (Array.isArray(value)) {
            return value.map((item) => item?.text || '').filter(Boolean).join(', ');
        }
        return value.text || '';
    }
    getImapConfig(provider, mailbox, custom) {
        if (provider === 'custom') {
            return {
                host: custom?.host || '',
                port: custom?.port || 993,
                mailboxes: mailbox === 'Junk'
                    ? ['Spam', 'Junk', 'Bulk Mail', '垃圾箱', '垃圾邮件']
                    : mailbox === 'Sent'
                        ? ['Sent', 'Sent Messages', 'Sent Items', '已发送']
                        : ['INBOX'],
            };
        }
        if (provider === 'gmail') {
            return {
                host: 'imap.gmail.com',
                port: 993,
                mailboxes: [
                    mailbox === 'Junk'
                        ? '[Gmail]/Spam'
                        : mailbox === 'Sent'
                            ? '[Gmail]/Sent Mail'
                            : 'INBOX',
                ],
            };
        }
        if (provider === 'qq') {
            return {
                host: 'imap.qq.com',
                port: 993,
                mailboxes: mailbox === 'Junk'
                    ? ['Spam', 'Junk', 'Bulk Mail', '垃圾箱', '垃圾邮件']
                    : mailbox === 'Sent'
                        ? ['Sent Messages', 'Sent', '已发送']
                        : ['INBOX'],
            };
        }
        return {
            host: 'outlook.office365.com',
            port: 993,
            mailboxes: [mailbox === 'Sent' ? 'Sent' : mailbox],
        };
    }
    async openMailbox(imap, mailboxes, readOnly) {
        let lastError = null;
        for (const mailbox of mailboxes) {
            try {
                await new Promise((res, rej) => {
                    imap.openBox(mailbox, readOnly, (err) => (err ? rej(err) : res()));
                });
                return mailbox;
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error('Unable to open mailbox');
    }
    generateAuthString(email, accessToken) {
        const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
        return Buffer.from(authString).toString('base64');
    }
    fetchMails(email, auth, mailbox = 'INBOX', top = 50, provider = 'microsoft', custom) {
        return new Promise((resolve, reject) => {
            const imapConfig = this.getImapConfig(provider, mailbox, custom);
            const imap = new node_imap_1.default({
                user: email,
                password: auth.password || '',
                xoauth2: auth.xoauth2,
                host: imapConfig.host,
                port: imapConfig.port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
            });
            const emailList = [];
            let messageCount = 0;
            let processedCount = 0;
            imap.once('ready', async () => {
                try {
                    await this.openMailbox(imap, imapConfig.mailboxes, true);
                    const results = await new Promise((res, rej) => {
                        imap.search(['ALL'], (err, results) => {
                            if (err)
                                return rej(err);
                            const sliced = results.slice(-Math.min(top, results.length));
                            res(sliced);
                        });
                    });
                    if (results.length === 0) {
                        imap.end();
                        return;
                    }
                    messageCount = results.length;
                    const f = imap.fetch(results, { bodies: '' });
                    f.on('message', (msg) => {
                        msg.on('body', (stream) => {
                            (0, mailparser_1.simpleParser)(stream)
                                .then((mail) => {
                                emailList.push({
                                    mail_id: mail.messageId || '',
                                    sender: mail.from?.text || '',
                                    sender_name: mail.from?.value?.[0]?.name || '',
                                    recipients: this.getAddressText(mail.to),
                                    subject: mail.subject || '',
                                    text_content: mail.text || '',
                                    html_content: mail.html || '',
                                    mail_date: mail.date?.toISOString() || '',
                                    attachments: (mail.attachments || []).map((attachment) => ({
                                        filename: attachment.filename || 'attachment',
                                        contentType: attachment.contentType || '',
                                        size: attachment.size || 0,
                                    })),
                                });
                            })
                                .catch((err) => logger_1.default.error(`Error parsing email: ${err.message}`))
                                .finally(() => {
                                processedCount++;
                                if (processedCount === messageCount)
                                    imap.end();
                            });
                        });
                    });
                    f.once('error', (err) => {
                        logger_1.default.error(`IMAP fetch error: ${err.message}`);
                        reject(err);
                        imap.end();
                    });
                }
                catch (err) {
                    logger_1.default.error(`IMAP ready error: ${err.message}`);
                    reject(err);
                    imap.end();
                }
            });
            imap.once('error', (err) => {
                logger_1.default.error(`IMAP connection error: ${err.message}`);
                reject(err);
            });
            imap.once('end', () => {
                logger_1.default.info(`IMAP fetched ${emailList.length} mails`);
                resolve(emailList);
            });
            imap.connect();
        });
    }
    clearMailbox(email, auth, mailbox = 'INBOX', provider = 'microsoft', custom) {
        return new Promise((resolve, reject) => {
            const imapConfig = this.getImapConfig(provider, mailbox, custom);
            const imap = new node_imap_1.default({
                user: email,
                password: auth.password || '',
                xoauth2: auth.xoauth2,
                host: imapConfig.host,
                port: imapConfig.port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
            });
            imap.once('ready', async () => {
                try {
                    await this.openMailbox(imap, imapConfig.mailboxes, false);
                    const results = await new Promise((res, rej) => {
                        imap.search(['ALL'], (err, results) => (err ? rej(err) : res(results)));
                    });
                    if (results.length === 0) {
                        imap.end();
                        return;
                    }
                    await new Promise((res, rej) => {
                        imap.addFlags(results, ['\\Deleted'], (err) => (err ? rej(err) : res()));
                    });
                    await new Promise((res, rej) => {
                        imap.expunge((err) => (err ? rej(err) : res()));
                    });
                    logger_1.default.info(`IMAP cleared ${results.length} mails from ${mailbox}`);
                    imap.end();
                }
                catch (err) {
                    logger_1.default.error(`IMAP clear error: ${err.message}`);
                    reject(err);
                    imap.end();
                }
            });
            imap.once('error', (err) => reject(err));
            imap.once('end', () => resolve());
            imap.connect();
        });
    }
}
exports.ImapService = ImapService;
//# sourceMappingURL=ImapService.js.map