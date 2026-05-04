import { Account } from '../types';
import { OAuthService } from './OAuthService';
import { config } from '../config';

const oauthService = new OAuthService();

export class SmtpService {
  private resolveGmailCredentials(account: Account) {
    return {
      clientId: String(account.client_id || config.googleClientId || '').trim(),
      clientSecret: String(account.client_secret || config.googleClientSecret || '').trim(),
      refreshToken: String(account.refresh_token || '').trim(),
    };
  }

  private createTransport(options: any) {
    // nodemailer is already present in the workspace lockfile/node_modules.
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport(options);
  }

  private getEffectiveProvider(account: Account) {
    const email = (account.email || '').toLowerCase();
    if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com')) return 'qq';
    if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) return 'gmail';
    return account.provider;
  }

  async sendMail(
    account: Account,
    data: { to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string; attachments?: any[] },
    proxyId?: number
  ) {
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
      if (!account.password) throw new Error('QQ account missing SMTP auth code');

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
      const gmail = this.resolveGmailCredentials(account);
      if (!gmail.clientId || !gmail.clientSecret || !gmail.refreshToken) {
        throw new Error('Gmail authorization is incomplete. Please reconnect Gmail.');
      }

      const token = await oauthService.refreshGoogleToken(gmail.clientId, gmail.clientSecret, gmail.refreshToken, proxyId);
      const transport = this.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: account.email,
          clientId: gmail.clientId,
          clientSecret: gmail.clientSecret,
          refreshToken: gmail.refreshToken,
          accessToken: token.access_token,
        },
      });

      await transport.sendMail(commonMail);
      return;
    }

    if (provider === 'custom') {
      if (!account.password) throw new Error('Custom mailbox missing SMTP password');
      if (!account.custom_smtp_host) throw new Error('Custom mailbox missing SMTP host');

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
