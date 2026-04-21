interface TokenResult {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    has_mail_scope?: boolean;
    expires_in: number;
}
export declare class OAuthService {
    private createResponse;
    private powershellRequest;
    private postForm;
    private getJson;
    refreshGraphToken(clientId: string, refreshToken: string, proxyId?: number): Promise<TokenResult>;
    refreshImapToken(clientId: string, refreshToken: string, proxyId?: number): Promise<TokenResult>;
    createGoogleAuthorizationUrl(clientId: string, state: string, loginHint?: string, options?: {
        redirectUri?: string;
        scope?: string;
        prompt?: string;
    }): string;
    exchangeGoogleAuthorizationCode(clientId: string, clientSecret: string, code: string, proxyId?: number, redirectUri?: string): Promise<TokenResult>;
    refreshGoogleToken(clientId: string, clientSecret: string, refreshToken: string, proxyId?: number): Promise<TokenResult>;
    fetchGoogleUserEmail(accessToken: string, proxyId?: number): Promise<string>;
    extractEmailFromGoogleIdToken(idToken?: string): string;
}
export {};
//# sourceMappingURL=OAuthService.d.ts.map