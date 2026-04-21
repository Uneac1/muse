import type { CommandCenterItem, PersonalMemoryView, PersonalOsRuleView, PersonalOsWorkspace } from '../types';
export declare class PersonalOSService {
    private workspaceCache;
    private inflightWorkspace;
    private readonly moduleCommands;
    getWorkspace(): Promise<PersonalOsWorkspace>;
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
    private loadIntegrations;
    private collectBaseActions;
    private evaluateRules;
    private buildEntities;
    private buildCommandCenter;
    private buildTodaySummary;
    private parseJson;
    private weight;
    private safe;
    private dedupeActionItems;
    private applyActionStates;
    private invalidateWorkspaceCache;
    private filterCommands;
    private dedupeCommands;
    private normalizeRuleInput;
}
//# sourceMappingURL=PersonalOSService.d.ts.map