import type { AiAccount, AiConnectionTestResult, AiMessage, AiProvider, AiThread } from '../types';
export declare class AiAccountModel {
    list(): AiAccount[];
    getById(id: number): AiAccount | undefined;
    create(data: Partial<AiAccount>): AiAccount;
    update(id: number, data: Partial<AiAccount>): AiAccount | undefined;
    delete(id: number): boolean;
    markStatus(id: number, status: AiAccount['status']): void;
    demoteUnavailable(id: number, reason: string): void;
    updateLastUsed(id: number): void;
    updateDiagnostics(id: number, result: AiConnectionTestResult): void;
    getProviderDefaults(provider: AiProvider): {
        baseUrl: string;
        model: string;
    };
}
export declare class AiThreadModel {
    listByAccount(accountId: number): AiThread[];
    getById(id: number): AiThread | undefined;
    create(accountId: number, title: string): AiThread;
    touch(id: number): void;
    rename(id: number, title: string): AiThread | undefined;
    delete(id: number): boolean;
    deleteByAccount(accountId: number): number;
}
export declare class AiMessageModel {
    listByThread(threadId: number): AiMessage[];
    create(threadId: number, role: AiMessage['role'], content: string): AiMessage;
}
//# sourceMappingURL=AiChat.d.ts.map