import { CloudflareIntegrationData, GitHubIntegrationData, IntegrationTokenRecord, MiSubBatchUpdateResult, MiSubIntegrationData, MiSubProfile, MiSubSettings, MiSubSubscription, NotionDatabaseContent, NotionIntegrationData, NotionInsights, NotionPageContent, NotionReadableBlock } from '../types';
export declare class IntegrationService {
    private cache;
    private inflight;
    private maskToken;
    private fetchJson;
    private fetchGitHubPaged;
    private fetchCloudflarePaged;
    private safeRequest;
    private cacheKey;
    private getCached;
    private setCached;
    private withCache;
    private mapWithConcurrency;
    private notionHeaders;
    private extractRichText;
    private summarizeNotionPage;
    private summarizeNotionDatabase;
    private fetchGitHubRepoExtras;
    private summarizeNotionBlock;
    private searchNotionAll;
    private fetchNotionBlockChildrenAll;
    private extractNotionBlockText;
    private summarizeNotionPropertyValue;
    private summarizeReadableNotionBlock;
    private notionEditableBlockTypes;
    private buildNotionBlockUpdatePayload;
    private fetchReadableNotionBlocks;
    private fetchNotionPageBlocks;
    private summarizeNotionDatabaseRow;
    private queryNotionDatabaseAll;
    private fetchCloudflareZoneDetails;
    private fetchCloudflarePagesProjects;
    private fetchCloudflareWorkerScripts;
    private fetchCloudflareRulesets;
    fetchGitHubData(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<GitHubIntegrationData>;
    fetchCloudflareData(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<CloudflareIntegrationData>;
    fetchNotionData(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<NotionIntegrationData>;
    fetchNotionInsights(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<NotionInsights>;
    fetchNotionPageContent(record: IntegrationTokenRecord, pageId: string): Promise<NotionPageContent>;
    fetchNotionDatabaseContent(record: IntegrationTokenRecord, databaseId: string): Promise<NotionDatabaseContent>;
    updateNotionBlock(record: IntegrationTokenRecord, blockId: string, type: string, text: string): Promise<NotionReadableBlock>;
    private normalizeMiSubBaseUrl;
    private parseMiSubRecord;
    private serializeMiSubRecord;
    private maskPassword;
    private loginMiSub;
    private fetchMiSubJson;
    validateMiSubCredentials(baseUrl: string, password: string): Promise<MiSubIntegrationData>;
    fetchMiSubData(record: IntegrationTokenRecord, options?: {
        force?: boolean;
    }): Promise<MiSubIntegrationData>;
    saveMiSubData(record: IntegrationTokenRecord, misubs: MiSubSubscription[], profiles: MiSubProfile[]): Promise<MiSubIntegrationData>;
    saveMiSubSettings(record: IntegrationTokenRecord, settings: MiSubSettings): Promise<MiSubIntegrationData>;
    updateMiSubNodeCount(record: IntegrationTokenRecord, url: string, fetchProxy?: string, plusAsSpace?: boolean): Promise<{
        count: number;
        userInfo: MiSubSubscription['userInfo'];
    }>;
    batchUpdateMiSubNodes(record: IntegrationTokenRecord, subscriptionIds: string[]): Promise<MiSubBatchUpdateResult[]>;
    buildMiSubRecordPayload(baseUrl: string, password: string): string;
}
//# sourceMappingURL=IntegrationService.d.ts.map