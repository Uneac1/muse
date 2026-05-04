import type { MiSubAiAction, MiSubAiAnalysis, MiSubIntegrationData, MiSubProfile, MiSubSubscription } from '../types';

export const DEFAULT_MISUB_AI_GOAL = '周期巡检 MiSub：发现快过期、高流量、异常订阅、空分组、重复分组、低价值订阅，并给出保守整理建议';

function parseJsonLoose(raw: string) {
  const trimmed = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('AI 未返回合法 JSON');
  }
}

function uniqueStrings(values: any[]) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

export function buildMiSubAiPrompt(data: MiSubIntegrationData, goal?: string) {
  return `
你是 MiSub 订阅整理专家。请根据当前订阅源、流量、到期、分组结构，输出一个“可执行但保守”的整理方案。

要求：
1. 只返回 JSON，不要解释，不要 markdown，不要代码块。
2. 动作必须保守，优先：重命名、启停、优化 exclude、整理 profile 命名/customId/subConverter/subConfig、重排 subscriptions、创建新 profile、删除空 profile。
3. 不要修改订阅 URL，不要删除 subscription。
4. 如果信息不足，不要编造。
5. findings 最多 10 条，actions 最多 12 条。

JSON 结构：
{
  "summary": "一句话总结",
  "findings": ["发现1", "发现2"],
  "actions": [
    {"type":"subscription_patch","id":"subscription-id","reason":"为什么这么改","patch":{"name":"新名字","enabled":true,"exclude":"排除规则"}},
    {"type":"profile_patch","id":"profile-id","reason":"为什么这么改","patch":{"name":"新分组名","enabled":true,"customId":"custom-id","subConverter":"","subConfig":"","subscriptions":["sub-id-1","sub-id-2"]}},
    {"type":"profile_create","reason":"为什么新增","profile":{"name":"新分组","enabled":true,"customId":"","subConverter":"","subConfig":"","subscriptions":["sub-id-1"]}},
    {"type":"profile_delete","id":"profile-id","reason":"为什么删除"}
  ]
}

整理目标：
${String(goal || DEFAULT_MISUB_AI_GOAL).trim()}

当前 MiSub 数据：
${JSON.stringify({
    stats: {
      subscriptionCount: data.misubs.length,
      enabledSubscriptionCount: data.misubs.filter((item) => item.enabled).length,
      profileCount: data.profiles.length,
    },
    subscriptions: data.misubs.map((item: MiSubSubscription) => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
      url: item.url,
      exclude: item.exclude || '',
      status: item.status || '',
      nodeCount: item.nodeCount || 0,
      userInfo: item.userInfo || null,
    })),
    profiles: data.profiles.map((item: MiSubProfile) => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
      customId: item.customId || '',
      subConverter: item.subConverter || '',
      subConfig: item.subConfig || '',
      subscriptions: item.subscriptions || [],
      manualNodes: item.manualNodes || [],
    })),
    settings: {
      mytoken: data.settings?.mytoken || '',
      profileToken: data.settings?.profileToken || '',
      subConverter: data.settings?.subConverter || '',
      subConfig: data.settings?.subConfig || '',
    },
  })}
`.trim();
}

export function normalizeMiSubAiAnalysis(raw: string, account: any, goal: string, data: { misubs: any[]; profiles: any[] }): MiSubAiAnalysis {
  const parsed = parseJsonLoose(raw);
  const subscriptionIds = new Set((data.misubs || []).map((item) => String(item.id)));
  const profileIds = new Set((data.profiles || []).map((item) => String(item.id)));
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];

  const normalizedActions = actions.map((item: any): MiSubAiAction | null => {
    const type = String(item?.type || '').trim();
    const reason = String(item?.reason || '').trim() || 'AI 建议调整';
    if (type === 'subscription_patch') {
      const id = String(item?.id || '').trim();
      if (!subscriptionIds.has(id)) return null;
      const patch: Record<string, any> = {};
      if (typeof item?.patch?.name === 'string') patch.name = item.patch.name.trim();
      if (typeof item?.patch?.enabled === 'boolean') patch.enabled = item.patch.enabled;
      if (typeof item?.patch?.exclude === 'string') patch.exclude = item.patch.exclude;
      return Object.keys(patch).length > 0 ? { type, id, reason, patch } : null;
    }
    if (type === 'profile_patch') {
      const id = String(item?.id || '').trim();
      if (!profileIds.has(id)) return null;
      const patch: Record<string, any> = {};
      if (typeof item?.patch?.name === 'string') patch.name = item.patch.name.trim();
      if (typeof item?.patch?.enabled === 'boolean') patch.enabled = item.patch.enabled;
      if (typeof item?.patch?.customId === 'string') patch.customId = item.patch.customId.trim();
      if (typeof item?.patch?.subConverter === 'string') patch.subConverter = item.patch.subConverter;
      if (typeof item?.patch?.subConfig === 'string') patch.subConfig = item.patch.subConfig;
      if (Array.isArray(item?.patch?.subscriptions)) patch.subscriptions = uniqueStrings(item.patch.subscriptions).filter((subId) => subscriptionIds.has(subId));
      return Object.keys(patch).length > 0 ? { type, id, reason, patch } : null;
    }
    if (type === 'profile_create') {
      const profile = item?.profile || {};
      const name = String(profile.name || '').trim();
      if (!name) return null;
      return {
        type,
        reason,
        profile: {
          name,
          enabled: typeof profile.enabled === 'boolean' ? profile.enabled : true,
          customId: typeof profile.customId === 'string' ? profile.customId.trim() : '',
          subConverter: typeof profile.subConverter === 'string' ? profile.subConverter : '',
          subConfig: typeof profile.subConfig === 'string' ? profile.subConfig : '',
          subscriptions: uniqueStrings(profile.subscriptions).filter((subId) => subscriptionIds.has(subId)),
          manualNodes: [],
        },
      };
    }
    if (type === 'profile_delete') {
      const id = String(item?.id || '').trim();
      if (!profileIds.has(id)) return null;
      return { type, id, reason };
    }
    return null;
  }).filter(Boolean).slice(0, 12) as MiSubAiAction[];

  return {
    account: {
      id: account.id,
      name: account.name,
      provider: account.provider,
      model: account.model,
    },
    goal,
    summary: String(parsed?.summary || 'AI 已完成 MiSub 订阅整理分析').trim(),
    findings: (Array.isArray(parsed?.findings) ? parsed.findings : []).map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 10),
    actions: normalizedActions,
    raw,
    sourceMode: 'ai',
  };
}
