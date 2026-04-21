import { MailMessage } from '../types';
export declare class MailCacheModel {
    private mapMail;
    private parseAttachments;
    getByAccount(accountId: number, mailbox: string, page?: number, pageSize?: number): {
        list: MailMessage[];
        total: any;
        page: number;
        pageSize: number;
    };
    upsert(accountId: number, mailbox: string, mails: Partial<MailMessage>[]): void;
    clearByAccount(accountId: number, mailbox: string): void;
    getRecent(limit?: number): MailMessage[];
    getRecentSummary(limit?: number): MailMessage[];
    getRecentByAccounts(accountIds: number[], limit?: number): MailMessage[];
    search(accountId: number, mailbox: string, query: string, page?: number, pageSize?: number): {
        list: MailMessage[];
        total: any;
        page: number;
        pageSize: number;
    };
    countByAccount(accountId: number, mailbox: string): number;
    countGroupedByAccount(mailbox: string): Array<{
        account_id: number;
        count: number;
    }>;
    countGroupedByMailbox(): Array<{
        mailbox: string;
        count: number;
    }>;
    countAll(mailbox: string): number;
}
//# sourceMappingURL=MailCache.d.ts.map