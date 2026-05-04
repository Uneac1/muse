import { Context } from 'koa';
export declare class OAuthController {
    constructor();
    private writeOpenAICallbackOwnerFile;
    private clearOpenAICallbackOwnerFile;
    private tryRecoverOpenAICallbackPort;
    private createOpenAISession;
    private ensureOpenAICallbackServer;
    private handleLocalOpenAICallback;
    private finalizeOpenAICallback;
    private launchOpenAISystemBrowser;
    getStatus(ctx: Context): Promise<void>;
    authorizeLinuxDo(ctx: Context): Promise<void>;
    authorizeOpenAI(ctx: Context): Promise<void>;
    launchOpenAI(ctx: Context): Promise<void>;
    resetOpenAISession(ctx: Context): Promise<void>;
    openaiResult(ctx: Context): Promise<void>;
    openaiCallback(ctx: Context): Promise<void>;
    authorizeGoogle(ctx: Context): Promise<void>;
    googleCallback(ctx: Context): Promise<void>;
    linuxDoCallback(ctx: Context): Promise<void>;
}
//# sourceMappingURL=OAuthController.d.ts.map