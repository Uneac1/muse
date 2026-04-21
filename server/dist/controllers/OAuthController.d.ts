import { Context } from 'koa';
export declare class OAuthController {
    authorizeOpenAI(ctx: Context): Promise<void>;
    openaiCallback(ctx: Context): Promise<void>;
    authorizeGoogle(ctx: Context): Promise<void>;
    googleCallback(ctx: Context): Promise<void>;
}
//# sourceMappingURL=OAuthController.d.ts.map