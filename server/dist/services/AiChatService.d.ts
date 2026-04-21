import type { AiAccount, AiConnectionTestResult, AiMessage } from '../types';
export declare class AiChatService {
    private getGeminiAuth;
    testConnection(account: AiAccount): Promise<AiConnectionTestResult>;
    sendMessage(account: AiAccount, history: AiMessage[]): Promise<string>;
    private sendOpenAiCompatible;
    private sendResponses;
    private sendAnthropic;
    private sendGemini;
    private fetchOpenAiModels;
    private fetchGeminiModels;
    private fetchAnthropicModels;
    private request;
    private requestJson;
    private powershellRequest;
}
//# sourceMappingURL=AiChatService.d.ts.map