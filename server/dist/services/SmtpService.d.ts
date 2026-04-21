import { Account } from '../types';
export declare class SmtpService {
    private createTransport;
    private getEffectiveProvider;
    sendMail(account: Account, data: {
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        text?: string;
        html?: string;
        attachments?: any[];
    }, proxyId?: number): Promise<void>;
}
//# sourceMappingURL=SmtpService.d.ts.map