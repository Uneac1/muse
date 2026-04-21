import type { IntegrationTokenRecord, YmailAddressCredential, YmailAddressSummary, YmailIntegrationData, YmailMailSummary, YmailOpenSettings, YmailStatistics } from '../types';
export declare class YmailService {
    private cache;
    private inflight;
    private dispatcher;
    private fingerprint;
    private maskToken;
    private sha256;
    private cacheKey;
    private getCached;
    private setCached;
    private withCache;
    invalidateIntegrationData(record: IntegrationTokenRecord): void;
    invalidateAddressMails(record: IntegrationTokenRecord, id: number): void;
    private buildHeaders;
    private request;
    private tryParseJson;
    fetchOpenSettings(): Promise<YmailOpenSettings>;
    validateAdminPassword(adminPassword: string): Promise<void>;
    fetchStatistics(adminPassword: string): Promise<YmailStatistics>;
    listAddresses(adminPassword: string, params?: {
        limit?: number;
        offset?: number;
        query?: string;
        sortBy?: string;
        sortOrder?: string;
    }): Promise<{
        results: YmailAddressSummary[];
        count: number;
    }>;
    createAddress(adminPassword: string, data: {
        name: string;
        domain: string;
        enablePrefix?: boolean;
        enableRandomSubdomain?: boolean;
    }): Promise<YmailAddressCredential>;
    showAddressCredential(adminPassword: string, id: number): Promise<YmailAddressCredential>;
    deleteAddress(adminPassword: string, id: number): Promise<void>;
    clearInbox(adminPassword: string, id: number): Promise<void>;
    clearSentItems(adminPassword: string, id: number): Promise<void>;
    resetAddressPassword(adminPassword: string, id: number, password: string): Promise<void>;
    fetchMailboxSettings(jwt: string): Promise<{
        address?: string;
        [key: string]: any;
    }>;
    fetchAddressMails(jwt: string, params?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        results: YmailMailSummary[];
        count: number;
    }>;
    deleteMail(jwt: string, mailId: number): Promise<void>;
    fetchAddressMailbox(record: IntegrationTokenRecord, id: number, params?: {
        limit?: number;
        offset?: number;
    }, options?: {
        force?: boolean;
    }): Promise<{
        jwt: string;
        address: string;
        results: YmailMailSummary[];
        count: number;
    }>;
    fetchIntegrationData(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<YmailIntegrationData>;
}
//# sourceMappingURL=YmailService.d.ts.map