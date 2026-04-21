import type { PersonalActionState, PersonalMemoryView, PersonalOsRuleView } from '../types';
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
//# sourceMappingURL=PersonalOS.d.ts.map