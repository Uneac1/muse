import { IntegrationProvider, IntegrationTokenRecord } from '../types';
export declare class IntegrationTokenModel {
    get(provider: IntegrationProvider): IntegrationTokenRecord | undefined;
    upsert(provider: IntegrationProvider, token: string): IntegrationTokenRecord;
    delete(provider: IntegrationProvider): boolean;
}
//# sourceMappingURL=IntegrationToken.d.ts.map