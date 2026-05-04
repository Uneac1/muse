import type { AgentAutonomyConfig, AgentAutonomyRun, AgentCapabilityWeight, AgentProfileMemory, AgentRecoveryIncident, AgentRuntimeEvent, AgentRuntimeSnapshot, AgentSkillJournal, AgentSkillJournalView, PersonalActionState, PersonalMemoryView, PersonalOsRuleView } from '../types';
export declare class PersonalOsRuleModel {
    list(): PersonalOsRuleView[];
    getById(id: number): PersonalOsRuleView | undefined;
    create(data: Partial<PersonalOsRuleView>): PersonalOsRuleView;
    update(id: number, data: Partial<PersonalOsRuleView>): PersonalOsRuleView | undefined;
    delete(id: number): boolean;
    markTriggered(id: number): void;
    private toView;
}
export declare class PersonalActionStateModel {
    list(): PersonalActionState[];
    mapByActionId(): Map<string, PersonalActionState>;
    upsert(actionId: string, status: PersonalActionState['status'], note?: string): PersonalActionState;
    clear(actionId: string): boolean;
}
export declare class PersonalMemoryModel {
    list(): PersonalMemoryView[];
    getById(id: number): PersonalMemoryView | undefined;
    create(data: Partial<PersonalMemoryView>): PersonalMemoryView;
    update(id: number, data: Partial<PersonalMemoryView>): PersonalMemoryView | undefined;
    delete(id: number): boolean;
    private toView;
}
export declare class AgentProfileMemoryModel {
    list(): AgentProfileMemory[];
    getByKey(key: string): AgentProfileMemory | undefined;
    upsert(data: {
        key: string;
        value: string;
        category?: AgentProfileMemory['category'];
        confidence?: number;
        source?: string;
        lastObservedAt?: string | null;
    }): AgentProfileMemory;
}
export declare class AgentSkillJournalModel {
    private toView;
    list(limit?: number): AgentSkillJournalView[];
    findByPattern(pattern: string): AgentSkillJournal | undefined;
    remember(data: {
        category: AgentSkillJournal['category'];
        title: string;
        summary: string;
        pattern: string;
        score?: number;
        evidence?: string[];
        lastUsedAt?: string | null;
    }): AgentSkillJournalView;
}
export declare class AgentAutonomyConfigModel {
    get(): AgentAutonomyConfig;
    update(input: Partial<AgentAutonomyConfig>): AgentAutonomyConfig;
}
export declare class AgentAutonomyRunModel {
    list(limit?: number): AgentAutonomyRun[];
    create(): number;
    finish(id: number, payload: {
        status: AgentAutonomyRun['status'];
        summary?: string;
        actions?: string[];
        backupPath?: string;
        error?: string;
    }): void;
}
export declare class AgentRuntimeSnapshotModel {
    list(limit?: number): AgentRuntimeSnapshot[];
    create(payload: Omit<AgentRuntimeSnapshot, 'id' | 'createdAt'>): AgentRuntimeSnapshot;
}
export declare class AgentRecoveryIncidentModel {
    list(limit?: number): AgentRecoveryIncident[];
    getByFingerprint(fingerprint: string): AgentRecoveryIncident | undefined;
    upsert(payload: {
        category: AgentRecoveryIncident['category'];
        severity: AgentRecoveryIncident['severity'];
        status: AgentRecoveryIncident['status'];
        title: string;
        detail: string;
        fingerprint: string;
        recoveryAction?: string;
        recoveryResult?: string;
        metadata?: Record<string, any>;
        resolvedAt?: string | null;
    }): AgentRecoveryIncident;
}
export declare class AgentCapabilityWeightModel {
    list(limit?: number): AgentCapabilityWeight[];
    getByCapability(capability: string): AgentCapabilityWeight | undefined;
    remember(payload: {
        capability: string;
        outcome: AgentCapabilityWeight['lastOutcome'];
        summary: string;
        source?: string;
    }): AgentCapabilityWeight;
}
export declare class AgentRuntimeEventModel {
    private toView;
    list(params?: {
        layer?: AgentRuntimeEvent['layer'];
        scope?: AgentRuntimeEvent['scope'];
        status?: AgentRuntimeEvent['status'];
        limit?: number;
    }): AgentRuntimeEvent[];
    count(params?: {
        layer?: AgentRuntimeEvent['layer'];
        scope?: AgentRuntimeEvent['scope'];
        status?: AgentRuntimeEvent['status'];
    }): number;
    findRecentActive(params: {
        source: string;
        scope?: AgentRuntimeEvent['scope'];
        eventType?: string;
        title?: string;
        layer?: AgentRuntimeEvent['layer'];
        path?: string;
        withinSeconds?: number;
    }): AgentRuntimeEvent | null;
    create(payload: {
        layer?: AgentRuntimeEvent['layer'];
        scope?: AgentRuntimeEvent['scope'];
        source: string;
        eventType: string;
        title: string;
        detail?: string;
        content?: Record<string, any>;
        confidence?: number;
        shared?: boolean;
        status?: AgentRuntimeEvent['status'];
        originRefs?: string[];
        compactedAt?: string | null;
    }): AgentRuntimeEvent;
    archive(ids: number[]): number;
}
//# sourceMappingURL=PersonalOS.d.ts.map