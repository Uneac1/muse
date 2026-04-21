import { MailMessage, AccountProvider } from '../types';
export declare class ImapService {
    private getAddressText;
    private getImapConfig;
    private openMailbox;
    generateAuthString(email: string, accessToken: string): string;
    fetchMails(email: string, auth: {
        xoauth2?: string;
        password?: string;
    }, mailbox?: string, top?: number, provider?: AccountProvider, custom?: {
        host?: string;
        port?: number;
    }): Promise<Partial<MailMessage>[]>;
    clearMailbox(email: string, auth: {
        xoauth2?: string;
        password?: string;
    }, mailbox?: string, provider?: AccountProvider, custom?: {
        host?: string;
        port?: number;
    }): Promise<void>;
}
//# sourceMappingURL=ImapService.d.ts.map