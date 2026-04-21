import type { TokenAnalyticsSnapshot } from '../types';
export interface OpenAIAuthSession {
    state: string;
    codeVerifier: string;
    redirectUri: string;
    createdAt: number;
}
export interface OpenAITokenInfo {
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
    expiresAt: number;
    email: string;
    chatgptAccountId: string;
}
export declare class OpenAIAccountService {
    createSession(redirectUri: string): {
        authUrl: string;
        session: {
            state: string;
            codeVerifier: string;
            redirectUri: string;
            createdAt: number;
        };
    };
    exchangeCode(code: string, session: OpenAIAuthSession): Promise<OpenAITokenInfo>;
    refreshToken(refreshToken: string): Promise<OpenAITokenInfo>;
    parseTokenInfo(accessToken?: string, refreshToken?: string, idToken?: string): Partial<OpenAITokenInfo>;
    fetchWhamSnapshot(sourceUrl: string, accessToken: string, explicitAccountId?: string): Promise<TokenAnalyticsSnapshot>;
    private secondsUntil;
    private requestToken;
    private performRequest;
}
//# sourceMappingURL=OpenAIAccountService.d.ts.map