import type { Context } from 'koa';
export declare class AiController {
    constructor();
    private normalizeProvider;
    private validateAccount;
    listAccounts(ctx: Context): Promise<void>;
    createAccount(ctx: Context): Promise<void>;
    updateAccount(ctx: Context): Promise<void>;
    deleteAccount(ctx: Context): Promise<void>;
    getAccountDiagnostics(ctx: Context): Promise<void>;
    testAccount(ctx: Context): Promise<void>;
    listThreads(ctx: Context): Promise<void>;
    getMessages(ctx: Context): Promise<void>;
    deleteThread(ctx: Context): Promise<void>;
    chat(ctx: Context): Promise<void>;
}
//# sourceMappingURL=AiController.d.ts.map