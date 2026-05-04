import { Context } from 'koa';
export declare class NewspaperController {
    constructor();
    health(ctx: Context): Promise<void>;
    briefing(ctx: Context): Promise<void>;
    article(ctx: Context): Promise<void>;
    articleStream(ctx: Context): Promise<void>;
    insight(ctx: Context): Promise<void>;
    briefingInsight(ctx: Context): Promise<void>;
}
//# sourceMappingURL=NewspaperController.d.ts.map