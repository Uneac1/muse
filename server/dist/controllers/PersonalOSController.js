"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalOSController = void 0;
const PersonalOSService_1 = require("../services/PersonalOSService");
const AgentAutonomyService_1 = require("../services/AgentAutonomyService");
const PersonalMemoryIngestionService_1 = require("../services/PersonalMemoryIngestionService");
const response_1 = require("../utils/response");
const service = new PersonalOSService_1.PersonalOSService();
function getAiManageErrorStatus(err) {
    if (err?.statusCode)
        return err.statusCode;
    const message = String(err?.message || err || '').toLowerCase();
    if ([
        'quota',
        'rate limit',
        'too many requests',
        'resource exhausted',
        'user location is not supported',
        'not supported for the api use',
        '未返回可用内容',
        'no usable content',
        'empty response',
        'invalid json payload',
        'etimedout',
        'econnreset',
        'econnrefused',
        'fetch failed',
        'powershell fallback failed',
        'accessdenied',
        'current user is in debt',
        'unauthorized',
        'forbidden',
        'invalid token',
        '未提供令牌',
        '无效的令牌',
    ].some((pattern) => message.includes(pattern))) {
        return 400;
    }
    return 500;
}
class PersonalOSController {
    workspace = async (ctx) => {
        try {
            (0, response_1.success)(ctx, await service.getWorkspace());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载个人操作系统失败', 500);
        }
    };
    search = async (ctx) => {
        try {
            (0, response_1.success)(ctx, await service.search(String(ctx.query.q || '')));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '全局搜索失败', 500);
        }
    };
    listRules = async (ctx) => (0, response_1.success)(ctx, service.listRules());
    createRule = async (ctx) => {
        try {
            (0, response_1.success)(ctx, service.createRule(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Create rule failed', err.statusCode || 500);
        }
    };
    updateRule = async (ctx) => {
        try {
            const id = Number(ctx.params.id);
            if (!Number.isFinite(id))
                return (0, response_1.fail)(ctx, 'Invalid rule id', 400);
            const item = service.updateRule(id, ctx.request.body || {});
            if (!item)
                return (0, response_1.fail)(ctx, 'Rule not found', 404);
            (0, response_1.success)(ctx, item);
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Update rule failed', err.statusCode || 500);
        }
    };
    deleteRule = async (ctx) => {
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid rule id', 400);
        (0, response_1.success)(ctx, { deleted: service.deleteRule(id) });
    };
    setActionState = async (ctx) => {
        const { actionId, status, note } = ctx.request.body || {};
        if (!actionId?.trim())
            return (0, response_1.fail)(ctx, 'actionId is required', 400);
        if (!status || !['active', 'done', 'muted'].includes(status))
            return (0, response_1.fail)(ctx, 'Invalid action status', 400);
        (0, response_1.success)(ctx, service.setActionState(actionId.trim(), status, note || ''));
    };
    listMemory = async (ctx) => (0, response_1.success)(ctx, service.listMemory());
    createMemory = async (ctx) => (0, response_1.success)(ctx, service.createMemory(ctx.request.body || {}));
    updateMemory = async (ctx) => {
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid memory id', 400);
        const item = service.updateMemory(id, ctx.request.body || {});
        if (!item)
            return (0, response_1.fail)(ctx, 'Memory not found', 404);
        (0, response_1.success)(ctx, item);
    };
    deleteMemory = async (ctx) => {
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid memory id', 400);
        (0, response_1.success)(ctx, { deleted: service.deleteMemory(id) });
    };
    aiManageMemory = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            (0, response_1.success)(ctx, await service.planMemoryWithAi(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'AI memory manage failed', getAiManageErrorStatus(err));
        }
    };
    applyAiMemoryPlan = async (ctx) => {
        try {
            (0, response_1.success)(ctx, service.applyMemoryAiPlan(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Apply AI memory plan failed', err.statusCode || 500);
        }
    };
    aiManageAccounts = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            (0, response_1.success)(ctx, await service.planAccountsWithAi(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'AI accounts manage failed', getAiManageErrorStatus(err));
        }
    };
    applyAiAccountPlan = async (ctx) => {
        try {
            (0, response_1.success)(ctx, service.applyAccountAiPlan(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Apply AI account plan failed', err.statusCode || 500);
        }
    };
    aiManageProxies = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            (0, response_1.success)(ctx, await service.planProxiesWithAi(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'AI proxies manage failed', getAiManageErrorStatus(err));
        }
    };
    applyAiProxyPlan = async (ctx) => {
        try {
            (0, response_1.success)(ctx, service.applyProxyAiPlan(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Apply AI proxy plan failed', err.statusCode || 500);
        }
    };
    aiManageTokens = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            (0, response_1.success)(ctx, await service.planTokensWithAi(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'AI tokens manage failed', getAiManageErrorStatus(err));
        }
    };
    applyAiTokenPlan = async (ctx) => {
        try {
            (0, response_1.success)(ctx, service.applyTokenAiPlan(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Apply AI token plan failed', err.statusCode || 500);
        }
    };
    getMemoryIngestionState = async (ctx) => {
        try {
            (0, response_1.success)(ctx, PersonalMemoryIngestionService_1.personalMemoryIngestionService.getState());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load memory ingestion state failed', err.statusCode || 500);
        }
    };
    updateMemoryIngestionConfig = async (ctx) => {
        try {
            (0, response_1.success)(ctx, PersonalMemoryIngestionService_1.personalMemoryIngestionService.updateConfig(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Update memory ingestion config failed', err.statusCode || 500);
        }
    };
    runMemoryIngestionNow = async (ctx) => {
        try {
            (0, response_1.success)(ctx, await PersonalMemoryIngestionService_1.personalMemoryIngestionService.runNow({ force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Run memory ingestion failed', err.statusCode || 500);
        }
    };
    getAgentAutonomyState = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.getState());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent autonomy state failed', err.statusCode || 500);
        }
    };
    getAgentRuntimeView = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.getRuntimeView());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent runtime failed', err.statusCode || 500);
        }
    };
    getAgentMemoryState = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.getMemoryState());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent memory failed', err.statusCode || 500);
        }
    };
    getAgentActivityState = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.getActivityState());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent activity failed', err.statusCode || 500);
        }
    };
    listAgentEvents = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.listEvents(Number(ctx.query.limit || 80)));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent events failed', err.statusCode || 500);
        }
    };
    createAgentEvent = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            if (!String(body.source || '').trim())
                return (0, response_1.fail)(ctx, 'source is required', 400);
            if (!String(body.eventType || '').trim())
                return (0, response_1.fail)(ctx, 'eventType is required', 400);
            if (!String(body.title || '').trim())
                return (0, response_1.fail)(ctx, 'title is required', 400);
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.logEvent(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Create agent event failed', err.statusCode || 500);
        }
    };
    updateAgentExecutionMode = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.updateExecutionMode(body.mode));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Update agent mode failed', err.statusCode || 500);
        }
    };
    compactAgentMemory = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.compactRuntimeMemory());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Compact agent memory failed', err.statusCode || 500);
        }
    };
    updateAgentAutonomyConfig = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.updateConfig(ctx.request.body || {}));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Update agent autonomy config failed', err.statusCode || 500);
        }
    };
    runAgentAutonomyNow = async (ctx) => {
        try {
            (0, response_1.success)(ctx, await AgentAutonomyService_1.agentAutonomyService.runNow({ force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Run agent autonomy failed', err.statusCode || 500);
        }
    };
    listAgentProfile = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.listProfile());
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent profile failed', err.statusCode || 500);
        }
    };
    upsertAgentProfile = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            if (!String(body.key || '').trim())
                return (0, response_1.fail)(ctx, 'key is required', 400);
            if (!String(body.value || '').trim())
                return (0, response_1.fail)(ctx, 'value is required', 400);
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.upsertProfileMemory(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Update agent profile failed', err.statusCode || 500);
        }
    };
    listAgentSkills = async (ctx) => {
        try {
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.listSkills(Number(ctx.query.limit || 20)));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Load agent skills failed', err.statusCode || 500);
        }
    };
    reportAgentIncident = async (ctx) => {
        try {
            const body = ctx.request.body || {};
            if (!String(body.title || '').trim())
                return (0, response_1.fail)(ctx, 'title is required', 400);
            if (!String(body.detail || '').trim())
                return (0, response_1.fail)(ctx, 'detail is required', 400);
            (0, response_1.success)(ctx, AgentAutonomyService_1.agentAutonomyService.reportIncident(body));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || 'Report agent incident failed', err.statusCode || 500);
        }
    };
}
exports.PersonalOSController = PersonalOSController;
//# sourceMappingURL=PersonalOSController.js.map