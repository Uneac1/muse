import { FetchMailsResult } from '../types';
export declare class MailService {
    private forEachWithConcurrency;
    private resolveGmailCredentials;
    private getEffectiveProvider;
    private fetchCustomMails;
    private fetchQqMails;
    private fetchMicrosoftMails;
    private fetchGmailMails;
    fetchMails(accountId: number, mailbox: string, proxyId?: number, top?: number): Promise<FetchMailsResult>;
    clearMailbox(accountId: number, mailbox: string, proxyId?: number): Promise<void>;
    getRecentMails(limit?: number): Promise<import("../types").MailMessage[]>;
    searchCachedMails(accountId: number, mailbox: string, query: string, page?: number, pageSize?: number): Promise<{
        list: import("../types").MailMessage[];
        total: any;
        page: number;
        pageSize: number;
    }>;
    refreshRecentMails(limit?: number, proxyId?: number): Promise<import("../types").MailMessage[]>;
    sendMail(accountId: number, data: {
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        text?: string;
        html?: string;
        attachments?: any[];
    }, proxyId?: number): Promise<void>;
}
//# sourceMappingURL=MailService.d.ts.map