import { Account, PaginatedResponse, ImportRequest, ImportResult } from '../types';
export declare class AccountModel {
    list(page?: number, pageSize?: number, search?: string): PaginatedResponse<Account>;
    getById(id: number): Account | undefined;
    create(data: Partial<Account>): Account;
    update(id: number, data: Partial<Account>): Account | undefined;
    delete(id: number): boolean;
    batchDelete(ids: number[]): number;
    importPreview(req: ImportRequest): {
        newItems: any[];
        duplicates: any[];
        errors: string[];
    };
    importConfirm(req: ImportRequest & {
        mode: 'skip' | 'overwrite';
    }): ImportResult;
    import(req: ImportRequest): ImportResult;
    export(ids?: number[], separator?: string, format?: string[]): string;
    updateSyncTime(id: number): void;
    updateTokenRefreshTime(id: number, newRefreshToken?: string): void;
    markError(id: number): void;
    getAll(): Account[];
}
//# sourceMappingURL=Account.d.ts.map