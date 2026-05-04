import { Context } from 'koa';
import { PersonalOSService } from '../services/PersonalOSService';
import { agentAutonomyService } from '../services/AgentAutonomyService';
import { personalMemoryIngestionService } from '../services/PersonalMemoryIngestionService';
import { fail, success } from '../utils/response';

const service = new PersonalOSService();

function getAiManageErrorStatus(err: any) {
  if (err?.statusCode) return err.statusCode;
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

  aiManageMemory = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as { accountId?: number | null; focus?: string | null }) || {};
      success(ctx, await service.planMemoryWithAi(body));
    } catch (err: any) {
      fail(ctx, err.message || 'AI memory manage failed', getAiManageErrorStatus(err));
    }
  };

  applyAiMemoryPlan = async (ctx: Context) => {
    try {
      success(ctx, service.applyMemoryAiPlan((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Apply AI memory plan failed', err.statusCode || 500);
    }
  };

  aiManageAccounts = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as { accountId?: number | null; focus?: string | null }) || {};
      success(ctx, await service.planAccountsWithAi(body));
    } catch (err: any) {
      fail(ctx, err.message || 'AI accounts manage failed', getAiManageErrorStatus(err));
    }
  };

  applyAiAccountPlan = async (ctx: Context) => {
    try {
      success(ctx, service.applyAccountAiPlan((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Apply AI account plan failed', err.statusCode || 500);
    }
  };

  aiManageProxies = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as { accountId?: number | null; focus?: string | null }) || {};
      success(ctx, await service.planProxiesWithAi(body));
    } catch (err: any) {
      fail(ctx, err.message || 'AI proxies manage failed', getAiManageErrorStatus(err));
    }
  };

  applyAiProxyPlan = async (ctx: Context) => {
    try {
      success(ctx, service.applyProxyAiPlan((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Apply AI proxy plan failed', err.statusCode || 500);
    }
  };

  aiManageTokens = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as { accountId?: number | null; focus?: string | null }) || {};
      success(ctx, await service.planTokensWithAi(body));
    } catch (err: any) {
      fail(ctx, err.message || 'AI tokens manage failed', getAiManageErrorStatus(err));
    }
  };

  applyAiTokenPlan = async (ctx: Context) => {
    try {
      success(ctx, service.applyTokenAiPlan((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Apply AI token plan failed', err.statusCode || 500);
    }
  };

  getMemoryIngestionState = async (ctx: Context) => {
    try {
      success(ctx, personalMemoryIngestionService.getState());
    } catch (err: any) {
      fail(ctx, err.message || 'Load memory ingestion state failed', err.statusCode || 500);
    }
  };

  updateMemoryIngestionConfig = async (ctx: Context) => {
    try {
      success(ctx, personalMemoryIngestionService.updateConfig((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Update memory ingestion config failed', err.statusCode || 500);
    }
  };

  runMemoryIngestionNow = async (ctx: Context) => {
    try {
      success(ctx, await personalMemoryIngestionService.runNow({ force: true }));
    } catch (err: any) {
      fail(ctx, err.message || 'Run memory ingestion failed', err.statusCode || 500);
    }
  };

  getAgentAutonomyState = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.getState());
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent autonomy state failed', err.statusCode || 500);
    }
  };

  getAgentRuntimeView = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.getRuntimeView());
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent runtime failed', err.statusCode || 500);
    }
  };

  getAgentMemoryState = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.getMemoryState());
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent memory failed', err.statusCode || 500);
    }
  };

  getAgentActivityState = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.getActivityState());
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent activity failed', err.statusCode || 500);
    }
  };

  listAgentEvents = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.listEvents(Number(ctx.query.limit || 80)));
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent events failed', err.statusCode || 500);
    }
  };

  createAgentEvent = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as any) || {};
      if (!String(body.source || '').trim()) return fail(ctx, 'source is required', 400);
      if (!String(body.eventType || '').trim()) return fail(ctx, 'eventType is required', 400);
      if (!String(body.title || '').trim()) return fail(ctx, 'title is required', 400);
      success(ctx, agentAutonomyService.logEvent(body));
    } catch (err: any) {
      fail(ctx, err.message || 'Create agent event failed', err.statusCode || 500);
    }
  };

  updateAgentExecutionMode = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as any) || {};
      success(ctx, agentAutonomyService.updateExecutionMode(body.mode));
    } catch (err: any) {
      fail(ctx, err.message || 'Update agent mode failed', err.statusCode || 500);
    }
  };

  compactAgentMemory = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.compactRuntimeMemory());
    } catch (err: any) {
      fail(ctx, err.message || 'Compact agent memory failed', err.statusCode || 500);
    }
  };

  updateAgentAutonomyConfig = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.updateConfig((ctx.request.body as any) || {}));
    } catch (err: any) {
      fail(ctx, err.message || 'Update agent autonomy config failed', err.statusCode || 500);
    }
  };

  runAgentAutonomyNow = async (ctx: Context) => {
    try {
      success(ctx, await agentAutonomyService.runNow({ force: true }));
    } catch (err: any) {
      fail(ctx, err.message || 'Run agent autonomy failed', err.statusCode || 500);
    }
  };

  listAgentProfile = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.listProfile());
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent profile failed', err.statusCode || 500);
    }
  };

  upsertAgentProfile = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as any) || {};
      if (!String(body.key || '').trim()) return fail(ctx, 'key is required', 400);
      if (!String(body.value || '').trim()) return fail(ctx, 'value is required', 400);
      success(ctx, agentAutonomyService.upsertProfileMemory(body));
    } catch (err: any) {
      fail(ctx, err.message || 'Update agent profile failed', err.statusCode || 500);
    }
  };

  listAgentSkills = async (ctx: Context) => {
    try {
      success(ctx, agentAutonomyService.listSkills(Number(ctx.query.limit || 20)));
    } catch (err: any) {
      fail(ctx, err.message || 'Load agent skills failed', err.statusCode || 500);
    }
  };

  reportAgentIncident = async (ctx: Context) => {
    try {
      const body = (ctx.request.body as any) || {};
      if (!String(body.title || '').trim()) return fail(ctx, 'title is required', 400);
      if (!String(body.detail || '').trim()) return fail(ctx, 'detail is required', 400);
      success(ctx, agentAutonomyService.reportIncident(body));
    } catch (err: any) {
      fail(ctx, err.message || 'Report agent incident failed', err.statusCode || 500);
    }
  };
}
