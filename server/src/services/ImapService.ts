import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import { MailMessage, AccountProvider } from '../types';
import logger from '../utils/logger';

export class ImapService {
  private getAddressText(value: any): string {
    if (!value) return '';
    if (Array.isArray(value)) {
      return value.map((item) => item?.text || '').filter(Boolean).join(', ');
    }
    return value.text || '';
  }

  private getImapConfig(provider: AccountProvider, mailbox: string, custom?: { host?: string; port?: number }) {
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

  private async openMailbox(imap: Imap, mailboxes: string[], readOnly: boolean): Promise<string> {
    let lastError: Error | null = null;

    for (const mailbox of mailboxes) {
      try {
        await new Promise<void>((res, rej) => {
          imap.openBox(mailbox, readOnly, (err) => (err ? rej(err) : res()));
        });
        return mailbox;
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error('Unable to open mailbox');
  }

  generateAuthString(email: string, accessToken: string): string {
    const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
  }

  fetchMails(
    email: string,
    auth: { xoauth2?: string; password?: string },
    mailbox = 'INBOX',
    top = 50,
    provider: AccountProvider = 'microsoft',
    custom?: { host?: string; port?: number },
  ): Promise<Partial<MailMessage>[]> {
    return new Promise((resolve, reject) => {
      const imapConfig = this.getImapConfig(provider, mailbox, custom);
      const imap = new Imap({
        user: email,
        password: auth.password || '',
        xoauth2: auth.xoauth2,
        host: imapConfig.host,
        port: imapConfig.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      } as any);

      const emailList: Partial<MailMessage>[] = [];
      let messageCount = 0;
      let processedCount = 0;

      imap.once('ready', async () => {
        try {
          await this.openMailbox(imap, imapConfig.mailboxes, true);

          const results: number[] = await new Promise((res, rej) => {
            imap.search(['ALL'], (err, results) => {
              if (err) return rej(err);
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
              simpleParser(stream as any)
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
                .catch((err) => logger.error(`Error parsing email: ${err.message}`))
                .finally(() => {
                  processedCount++;
                  if (processedCount === messageCount) imap.end();
                });
            });
          });

          f.once('error', (err) => {
            logger.error(`IMAP fetch error: ${err.message}`);
            reject(err);
            imap.end();
          });
        } catch (err: any) {
          logger.error(`IMAP ready error: ${err.message}`);
          reject(err);
          imap.end();
        }
      });

      imap.once('error', (err: Error) => {
        logger.error(`IMAP connection error: ${err.message}`);
        reject(err);
      });

      imap.once('end', () => {
        logger.info(`IMAP fetched ${emailList.length} mails`);
        resolve(emailList);
      });

      imap.connect();
    });
  }

  clearMailbox(
    email: string,
    auth: { xoauth2?: string; password?: string },
    mailbox = 'INBOX',
    provider: AccountProvider = 'microsoft',
    custom?: { host?: string; port?: number },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const imapConfig = this.getImapConfig(provider, mailbox, custom);
      const imap = new Imap({
        user: email,
        password: auth.password || '',
        xoauth2: auth.xoauth2,
        host: imapConfig.host,
        port: imapConfig.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      } as any);

      imap.once('ready', async () => {
        try {
          await this.openMailbox(imap, imapConfig.mailboxes, false);

          const results: number[] = await new Promise((res, rej) => {
            imap.search(['ALL'], (err, results) => (err ? rej(err) : res(results)));
          });

          if (results.length === 0) {
            imap.end();
            return;
          }

          await new Promise<void>((res, rej) => {
            imap.addFlags(results, ['\\Deleted'], (err) => (err ? rej(err) : res()));
          });

          await new Promise<void>((res, rej) => {
            imap.expunge((err) => (err ? rej(err) : res()));
          });

          logger.info(`IMAP cleared ${results.length} mails from ${mailbox}`);
          imap.end();
        } catch (err: any) {
          logger.error(`IMAP clear error: ${err.message}`);
          reject(err);
          imap.end();
        }
      });

      imap.once('error', (err: Error) => reject(err));
      imap.once('end', () => resolve());
      imap.connect();
    });
  }
}
