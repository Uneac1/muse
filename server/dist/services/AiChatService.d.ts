import type { AiAccount, AiConnectionTestResult, AiMessage, AiRuntimeContext } from '../types';
type MuseUiAction = {
    type: 'open_path';
    path: string;
    label?: string;
};
type MuseToolCall = {
    tool: string;
    args?: Record<string, any>;
};
type MuseToolExecutionDetail = {
    tool: string;
    ok: boolean;
    error?: string;
    target?: string;
};
type NativeToolResult = {
    content: string;
    calls: MuseToolCall[];
    native: boolean;
    responseMeta: AiResponseMeta;
};
type AiResponseMeta = {
    provider: AiAccount['provider'];
    protocol: AiProtocol;
    model: string;
    accountId: number;
    accountName: string;
};
type AiProtocol = 'gemini' | 'anthropic' | 'responses' | 'openai';
export declare class AiChatService {
    private getGeminiAuth;
    testConnection(account: AiAccount): Promise<AiConnectionTestResult>;
    private sendMessageOnce;
    private sendNativeToolMessageOnce;
    sendMessage(account: AiAccount, history: AiMessage[]): Promise<{
        content: string;
        responseMeta: AiResponseMeta;
    }>;
    sendNativeToolMessage(account: AiAccount, history: AiMessage[]): Promise<NativeToolResult>;
    private toToolExecutionDetails;
    sendModelSessionMessage(account: AiAccount, history: AiMessage[], runtimeContext?: AiRuntimeContext | null): Promise<{
        content: string;
        actions: MuseUiAction[];
        toolExecutions: number;
        toolDetails: MuseToolExecutionDetail[];
        responseMeta: AiResponseMeta;
        degradedReason?: string;
        runtimeEventRefs: string[];
    }>;
    sendMuseControlledMessage(account: AiAccount, history: AiMessage[], runtimeContext?: AiRuntimeContext | null): Promise<{
        content: string;
        actions: MuseUiAction[];
        toolExecutions: number;
        toolDetails: MuseToolExecutionDetail[];
        responseMeta: AiResponseMeta;
        degradedReason?: string;
        runtimeEventRefs: string[];
    }>;
    private sendOpenAiCompatible;
    private sendResponses;
    private sendAnthropic;
    private sendGemini;
    private fetchOpenAiModels;
    private fetchGeminiModels;
    private fetchAnthropicModels;
    private request;
    private performNodeRequest;
    private requestJson;
    private powershellRequest;
}
export {};
//# sourceMappingURL=AiChatService.d.ts.map