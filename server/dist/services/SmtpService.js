"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmtpService = void 0;
const OAuthService_1 = require("./OAuthService");
const oauthService = new OAuthService_1.OAuthService();
class SmtpService {
    createTransport(options) {
        // nodemailer is already present in the workspace lockfile/node_modules.
        const nodemailer = require('nodemailer');
        return nodemailer.createTransport(options);
    }
    getEffectiveProvider(account) {
        const email = (account.email || '').toLowerCase();
        if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com'))
            return 'qq';
        if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'))
            return 'gmail';
        return account.provider;
    }
    async sendMail(account, data, proxyId) {
        const provider = this.getEffectiveProvider(account);
        const commonMail = {
            from: account.email,
            to: data.to,
            cc: data.cc,
            bcc: data.bcc,
            subject: data.subject,
            text: data.text,
            html: data.html,
            attachments: (data.attachments || []).map((attachment) => ({
                filename: attachment.filename,
                content: attachment.contentBase64 ? Buffer.from(attachment.contentBase64, 'base64') : undefined,
                contentType: attachment.contentType,
            })),
        };
        if (provider === 'qq') {
            if (!account.password)
                throw new Error('QQ account missing SMTP auth code');
            const transport = this.createTransport({
                host: 'smtp.qq.com',
                port: 465,
                secure: true,
                auth: {
                    user: account.email,
                    pass: account.password,
                },
            });
            await transport.sendMail(commonMail);
            return;
        }
        if (provider === 'gmail') {
            if (!account.client_id || !account.client_secret || !account.refresh_token) {
                throw new Error('Gmail authorization is incomplete. Please reconnect Gmail.');
            }
            const token = await oauthService.refreshGoogleToken(account.client_id, account.client_secret, account.refresh_token, proxyId);
            const transport = this.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: account.email,
                    clientId: account.client_id,
                    clientSecret: account.client_secret,
                    refreshToken: account.refresh_token,
                    accessToken: token.access_token,
                },
            });
            await transport.sendMail(commonMail);
            return;
        }
        if (provider === 'custom') {
            if (!account.password)
                throw new Error('Custom mailbox missing SMTP password');
            if (!account.custom_smtp_host)
                throw new Error('Custom mailbox missing SMTP host');
            const transport = this.createTransport({
                host: account.custom_smtp_host,
                port: account.custom_smtp_port || 465,
                secure: Boolean(account.custom_smtp_secure ?? 1),
                auth: {
                    user: account.email,
                    pass: account.password,
                },
            });
            await transport.sendMail(commonMail);
            return;
        }
        throw new Error('Current provider send support is not configured yet. Please use Gmail, QQ or custom SMTP mailboxes for sending.');
    }
}
exports.SmtpService = SmtpService;
//# sourceMappingURL=SmtpService.js.map