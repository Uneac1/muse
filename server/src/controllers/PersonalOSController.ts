import { Context } from 'koa';
import { PersonalOSService } from '../services/PersonalOSService';
import { fail, success } from '../utils/response';

const service = new PersonalOSService();

export class PersonalOSController {
  workspace = async (ctx: Context) => {
    try {
      success(ctx, await service.getWorkspace());
    } catch (err: any) {
      fail(ctx, err.message || '加载个人操作系统失败', 500);
    }
  };

  search = async (ctx: Context) => {
    try {
      success(ctx, await service.search(String(ctx.query.q || '')));
    } catch (err: any) {
      fail(ctx, err.message || '全局搜索失败', 500);
    }
  };

  listRules = async (ctx: Context) => success(ctx, service.listRules());
  createRule = async (ctx: Context) => {
    try {
      success(ctx, service.createRule((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Create rule failed', err.statusCode || 500);
    }
  };
  updateRule = async (ctx: Context) => {
    try {
      const id = Number(ctx.params.id);
      if (!Number.isFinite(id)) return fail(ctx, 'Invalid rule id', 400);
      const item = service.updateRule(id, (ctx.request.body as any) || {});
      if (!item) return fail(ctx, 'Rule not found', 404);
      success(ctx, item);
    } catch (err: any) {
      fail(ctx, err.message || 'Update rule failed', err.statusCode || 500);
    }
  };
  deleteRule = async (ctx: Context) => {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid rule id', 400);
    success(ctx, { deleted: service.deleteRule(id) });
  };

  setActionState = async (ctx: Context) => {
    const { actionId, status, note } = (ctx.request.body as { actionId?: string; status?: string; note?: string }) || {};
    if (!actionId?.trim()) return fail(ctx, 'actionId is required', 400);
    if (!status || !['active', 'done', 'muted'].includes(status)) return fail(ctx, 'Invalid action status', 400);
    success(ctx, service.setActionState(actionId.trim(), status as 'active' | 'done' | 'muted', note || ''));
  };

  listMemory = async (ctx: Context) => success(ctx, service.listMemory());
  createMemory = async (ctx: Context) => success(ctx, service.createMemory((ctx.request.body as any) || {}));
  updateMemory = async (ctx: Context) => {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid memory id', 400);
    const item = service.updateMemory(id, (ctx.request.body as any) || {});
    if (!item) return fail(ctx, 'Memory not found', 404);
    success(ctx, item);
  };
  deleteMemory = async (ctx: Context) => {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid memory id', 400);
    success(ctx, { deleted: service.deleteMemory(id) });
  };
}
