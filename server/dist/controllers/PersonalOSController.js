"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalOSController = void 0;
const PersonalOSService_1 = require("../services/PersonalOSService");
const response_1 = require("../utils/response");
const service = new PersonalOSService_1.PersonalOSService();
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
}
exports.PersonalOSController = PersonalOSController;
//# sourceMappingURL=PersonalOSController.js.map