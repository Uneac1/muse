import { TokenAccountModel } from '../models/TokenAccount';
import type { CommandCenterItem, PersonalAccountAiPlan, PersonalAccountAiSuggestion, PersonalMemoryAiPlan, PersonalMemoryAiSuggestion, PersonalProxyAiPlan, PersonalProxyAiSuggestion, PersonalMemoryView, PersonalOsRuleView, PersonalOsWorkspace, PersonalTokenAiPlan, PersonalTokenAiSuggestion } from '../types';
type TokenView = ReturnType<TokenAccountModel['list']>[number] & {
    provider_label: string;
    snapshot: any;
};
export declare class PersonalOSService {
    private workspaceCache;
    private inflightWorkspace;
    private aiChatService;
    private readonly moduleCommands;
    getWorkspace(): Promise<PersonalOsWorkspace>;
    private getAiChatService;
    private buildWorkspace;
    search(query: string): Promise<CommandCenterItem[]>;
    listRules(): PersonalOsRuleView[];
    createRule(data: Partial<PersonalOsRuleView>): PersonalOsRuleView;
    updateRule(id: number, data: Partial<PersonalOsRuleView>): PersonalOsRuleView | undefined;
    deleteRule(id: number): boolean;
    setActionState(actionId: string, status: 'active' | 'done' | 'muted', note?: string): import("../types").PersonalActionState | {
        action_id: string;
        status: "active";
        note: string;
        cleared: boolean;
    };
    listMemory(): PersonalMemoryView[];
    createMemory(data: Partial<PersonalMemoryView>): PersonalMemoryView;
    updateMemory(id: number, data: Partial<PersonalMemoryView>): PersonalMemoryView | undefined;
    deleteMemory(id: number): boolean;
    planMemoryWithAi(input?: {
        accountId?: number | null;
        focus?: string | null;
    }): Promise<PersonalMemoryAiPlan>;
    applyMemoryAiPlan(input: {
        suggestions?: PersonalMemoryAiSuggestion[];
    }): {
        applied: number;
        memory: PersonalMemoryView[];
    };
    planAccountsWithAi(input?: {
        accountId?: number | null;
        focus?: string | null;
    }): Promise<PersonalAccountAiPlan>;
    applyAccountAiPlan(input: {
        suggestions?: PersonalAccountAiSuggestion[];
    }): {
        applied: number;
        accounts: import("../types").Account[];
    };
    planProxiesWithAi(input?: {
        accountId?: number | null;
        focus?: string | null;
    }): Promise<PersonalProxyAiPlan>;
    applyProxyAiPlan(input: {
        suggestions?: PersonalProxyAiSuggestion[];
    }): {
        applied: number;
        proxies: import("../types").Proxy[];
    };
    planTokensWithAi(input?: {
        accountId?: number | null;
        focus?: string | null;
    }): Promise<PersonalTokenAiPlan>;
    applyTokenAiPlan(input: {
        suggestions?: PersonalTokenAiSuggestion[];
    }): {
        applied: number;
        accounts: TokenView[];
    };
    private loadIntegrations;
    private collectBaseActions;
    private evaluateRules;
    private buildEntities;
    private buildCommandCenter;
    private buildTodaySummary;
    private buildTodayPriorities;
    private buildTodayHighlights;
    private buildTodayNextStep;
    private buildNewspaperReaderPath;
    private parseJson;
    private weight;
    private todayWeight;
    private todayHighlightWeight;
    private safe;
    private dedupeActionItems;
    private applyActionStates;
    private invalidateWorkspaceCache;
    invalidateWorkspace(): void;
    private pickAiAccount;
    private listAiAccountCandidates;
    private rankAiAccounts;
    private getAiAccountRankScore;
    private isKnownBrokenAiFallbackCandidate;
    private sendStructuredAiPrompt;
    private shouldRetryAiAccount;
    private shouldRetrySameAiAccount;
    private getAiRetryDelayMs;
    private describeAiFallbackReason;
    private normalizeAiPromptError;
    private sleep;
    private buildMemoryManagerPrompt;
    private buildAccountManagerPrompt;
    private buildProxyManagerPrompt;
    private buildTokenManagerPrompt;
    private normalizeAiSuggestion;
    private normalizeAiAccountSuggestion;
    private normalizeAiProxySuggestion;
    private normalizeAiTokenSuggestion;
    private ensureTagByName;
    private buildAccountRemark;
    private listTokenAccountViews;
    private normalizeRuleConfigForTrigger;
    private filterCommands;
    private dedupeCommands;
    private normalizeRuleInput;
}
export {};
//# sourceMappingURL=PersonalOSService.d.ts.map