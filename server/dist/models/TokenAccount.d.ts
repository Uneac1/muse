import type { TokenAccount, TokenAnalyticsSnapshot, TokenProvider } from '../types';
export declare class TokenAccountModel {
    list(): TokenAccount[];
    getById(id: number): TokenAccount | undefined;
    create(data: Partial<TokenAccount>): TokenAccount;
    update(id: number, data: Partial<TokenAccount>): TokenAccount | undefined;
    delete(id: number): boolean;
    saveSyncResult(id: number, status: TokenAccount['status'], lastError: string, snapshot: TokenAnalyticsSnapshot | null): void;
    getProviderLabel(provider: TokenProvider): string;
}
//# sourceMappingURL=TokenAccount.d.ts.map