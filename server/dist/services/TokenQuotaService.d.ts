import type { TokenAccount, TokenAnalyticsSnapshot, TokenProvider } from '../types';
export declare class TokenQuotaService {
    getDefaultAnalyticsUrl(provider: TokenProvider): string;
    getDefaultUserAgent(): string;
    syncAccount(account: TokenAccount): Promise<TokenAnalyticsSnapshot>;
}
//# sourceMappingURL=TokenQuotaService.d.ts.map