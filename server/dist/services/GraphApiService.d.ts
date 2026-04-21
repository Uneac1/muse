import { MailMessage } from '../types';
export declare class GraphApiService {
    fetchMails(accessToken: string, mailbox: string, top?: number, proxyId?: number): Promise<Partial<MailMessage>[]>;
    deleteMail(accessToken: string, mailId: string, proxyId?: number): Promise<void>;
    deleteAllMails(accessToken: string, mailbox: string, proxyId?: number): Promise<void>;
}
//# sourceMappingURL=GraphApiService.d.ts.map