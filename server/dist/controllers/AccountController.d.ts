import { Context } from 'koa';
export declare class AccountController {
    constructor();
    private normalizeProvider;
    private resolveGmailCredentials;
    private validateAccountPayload;
    list(ctx: Context): Promise<void>;
    create(ctx: Context): Promise<void>;
    update(ctx: Context): Promise<void>;
    delete(ctx: Context): Promise<void>;
    batchDelete(ctx: Context): Promise<void>;
    import(ctx: Context): Promise<void>;
    export(ctx: Context): Promise<void>;
    setTags(ctx: Context): Promise<void>;
    importPreview(ctx: Context): Promise<void>;
    importConfirm(ctx: Context): Promise<void>;
}
//# sourceMappingURL=AccountController.d.ts.map