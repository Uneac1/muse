import { Context } from 'koa';
export declare class PersonalOSController {
    workspace: (ctx: Context) => Promise<void>;
    search: (ctx: Context) => Promise<void>;
    listRules: (ctx: Context) => Promise<void>;
    createRule: (ctx: Context) => Promise<void>;
    updateRule: (ctx: Context) => Promise<void>;
    deleteRule: (ctx: Context) => Promise<void>;
    setActionState: (ctx: Context) => Promise<void>;
    listMemory: (ctx: Context) => Promise<void>;
    createMemory: (ctx: Context) => Promise<void>;
    updateMemory: (ctx: Context) => Promise<void>;
    deleteMemory: (ctx: Context) => Promise<void>;
}
//# sourceMappingURL=PersonalOSController.d.ts.map