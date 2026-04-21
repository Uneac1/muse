import { Context } from 'koa';
export declare class AuthController {
    login(ctx: Context): Promise<void>;
    check(ctx: Context): Promise<void>;
    authorizeGoogle(ctx: Context): Promise<void>;
    googleCallback(ctx: Context): Promise<void>;
}
//# sourceMappingURL=AuthController.d.ts.map