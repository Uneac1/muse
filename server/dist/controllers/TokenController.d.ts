import type { Context } from 'koa';
export declare class TokenController {
    constructor();
    private normalizeProvider;
    private normalizeSessionFormat;
    private normalizeAuthMethod;
    private buildView;
    private normalizePayload;
    private validateAccount;
    private enrichPayload;
    listAccounts(ctx: Context): Promise<void>;
    createAccount(ctx: Context): Promise<void>;
    updateAccount(ctx: Context): Promise<void>;
    deleteAccount(ctx: Context): Promise<void>;
    syncAccount(ctx: Context): Promise<void>;
    syncAll(ctx: Context): Promise<void>;
}
//# sourceMappingURL=TokenController.d.ts.map