import { Context } from 'koa';
export declare class MailController {
    fetch(ctx: Context): Promise<void>;
    fetchNew(ctx: Context): Promise<void>;
    clear(ctx: Context): Promise<void>;
    cached(ctx: Context): Promise<void>;
    search(ctx: Context): Promise<void>;
    recent(ctx: Context): Promise<void>;
    refreshRecent(ctx: Context): Promise<void>;
    send(ctx: Context): Promise<void>;
}
//# sourceMappingURL=MailController.d.ts.map