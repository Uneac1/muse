import { Context } from 'koa';
import { config } from '../config';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { IntegrationService } from '../services/IntegrationService';
import { YmailService } from '../services/YmailService';
import { fail, success } from '../utils/response';

const model = new IntegrationTokenModel();
const service = new IntegrationService();
const ymailService = new YmailService();

function emptyGitHubState() {
  return {
    connected: false,
    tokenMasked: '',
    lastSyncAt: null,
    profile: null,
    repos: [],
    starred: [],
    orgs: [],
    gists: [],
    events: [],
    issues: [],
    pulls: [],
    releases: [],
    branches: [],
  };
}

function emptyCloudflareState() {
  return {
    connected: false,
    tokenMasked: '',
    lastSyncAt: null,
    user: null,
    accounts: [],
    zones: [],
    zoneDetails: [],
    pagesProjects: [],
    workerScripts: [],
    rulesets: [],
  };
}

function emptyNotionState() {
  return {
    connected: false,
    tokenMasked: '',
    lastSyncAt: null,
    bot: null,
    users: [],
    pages: [],
    databases: [],
    metrics: {
      pageCount: 0,
      databaseCount: 0,
      userCount: 0,
      archivedPageCount: 0,
      pageWithDatabaseParentCount: 0,
    },
  };
}

function emptyMiSubState() {
  return {
    connected: false,
    baseUrl: config.defaultMiSubUrl,
    passwordMasked: config.defaultMiSubPassword ? `${config.defaultMiSubPassword[0] || ''}${'*'.repeat(Math.max(config.defaultMiSubPassword.length - 2, 1))}${config.defaultMiSubPassword.slice(-1)}` : '',
    lastSyncAt: null,
    misubs: [],
    profiles: [],
    settings: null,
  };
}

function emptyYmailState() {
  return {
    connected: false,
    tokenMasked: '',
    lastSyncAt: null,
    siteUrl: config.ymailSiteUrl,
    apiBaseUrl: config.ymailApiBaseUrl,
    openSettings: null,
    statistics: null,
    addresses: [],
    addressCount: 0,
  };
}

export class IntegrationController {
  private getGitHubRecord() {
    return model.get('github') || (config.defaultGitHubToken
      ? {
          provider: 'github' as const,
          token: config.defaultGitHubToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getCloudflareRecord() {
    return model.get('cloudflare') || (config.defaultCloudflareToken
      ? {
          provider: 'cloudflare' as const,
          token: config.defaultCloudflareToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getNotionRecord() {
    return model.get('notion') || (config.defaultNotionToken
      ? {
          provider: 'notion' as const,
          token: config.defaultNotionToken,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getMiSubRecord() {
    return model.get('misub') || (config.defaultMiSubUrl && config.defaultMiSubPassword
      ? {
          provider: 'misub' as const,
          token: service.buildMiSubRecordPayload(config.defaultMiSubUrl, config.defaultMiSubPassword),
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  private getYmailRecord() {
    return model.get('ymail') || (config.defaultYmailAdminPassword
      ? {
          provider: 'ymail' as const,
          token: config.defaultYmailAdminPassword,
          updated_at: new Date().toISOString(),
        }
      : undefined);
  }

  getGitHub = async (ctx: Context) => {
    const record = this.getGitHubRecord();
    if (!record) return success(ctx, emptyGitHubState());

    try {
      success(ctx, await service.fetchGitHubData(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 GitHub 信息失败', 500);
    }
  };

  connectGitHub = async (ctx: Context) => {
    const { token } = ctx.request.body as { token?: string };
    if (!token?.trim()) return fail(ctx, 'GitHub token is required', 400);

    try {
      const record = model.upsert('github', token.trim());
      success(ctx, await service.fetchGitHubData(record, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '连接 GitHub 失败', 500);
    }
  };

  syncGitHub = async (ctx: Context) => {
    const record = this.getGitHubRecord();
    if (!record) return fail(ctx, 'GitHub 尚未连接', 400);

    try {
      const updated = model.upsert('github', record.token);
      success(ctx, await service.fetchGitHubData(updated, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '同步 GitHub 失败', 500);
    }
  };

  disconnectGitHub = async (ctx: Context) => {
    model.delete('github');
    success(ctx, { disconnected: true });
  };

  getCloudflare = async (ctx: Context) => {
    const record = this.getCloudflareRecord();
    if (!record) return success(ctx, emptyCloudflareState());

    try {
      success(ctx, await service.fetchCloudflareData(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Cloudflare 信息失败', 500);
    }
  };

  connectCloudflare = async (ctx: Context) => {
    const { token } = ctx.request.body as { token?: string };
    if (!token?.trim()) return fail(ctx, 'Cloudflare token is required', 400);

    try {
      const record = model.upsert('cloudflare', token.trim());
      success(ctx, await service.fetchCloudflareData(record, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '连接 Cloudflare 失败', 500);
    }
  };

  syncCloudflare = async (ctx: Context) => {
    const record = this.getCloudflareRecord();
    if (!record) return fail(ctx, 'Cloudflare 尚未连接', 400);

    try {
      const updated = model.upsert('cloudflare', record.token);
      success(ctx, await service.fetchCloudflareData(updated, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '同步 Cloudflare 失败', 500);
    }
  };

  disconnectCloudflare = async (ctx: Context) => {
    model.delete('cloudflare');
    success(ctx, { disconnected: true });
  };

  getNotion = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return success(ctx, emptyNotionState());

    try {
      success(ctx, await service.fetchNotionData(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Notion 信息失败', 500);
    }
  };

  connectNotion = async (ctx: Context) => {
    const { token } = ctx.request.body as { token?: string };
    if (!token?.trim()) return fail(ctx, 'Notion token is required', 400);

    try {
      const record = model.upsert('notion', token.trim());
      success(ctx, await service.fetchNotionData(record));
    } catch (err: any) {
      fail(ctx, err.message || '连接 Notion 失败', 500);
    }
  };

  syncNotion = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return fail(ctx, 'Notion 尚未连接', 400);

    try {
      const updated = model.upsert('notion', record.token);
      success(ctx, await service.fetchNotionData(updated, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '同步 Notion 失败', 500);
    }
  };

  getNotionInsights = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return fail(ctx, 'Notion 尚未连接', 400);

    try {
      success(ctx, await service.fetchNotionInsights(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Notion 洞察失败', 500);
    }
  };

  getNotionPageContent = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return fail(ctx, 'Notion 尚未连接', 400);

    const { pageId } = ctx.params;
    if (!pageId) return fail(ctx, 'Notion page id is required', 400);

    try {
      success(ctx, await service.fetchNotionPageContent(record, pageId));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Notion 页面内容失败', 500);
    }
  };

  getNotionDatabaseContent = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return fail(ctx, 'Notion 尚未连接', 400);

    const { databaseId } = ctx.params;
    if (!databaseId) return fail(ctx, 'Notion database id is required', 400);

    try {
      success(ctx, await service.fetchNotionDatabaseContent(record, databaseId));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Notion 数据库内容失败', 500);
    }
  };

  updateNotionBlock = async (ctx: Context) => {
    const record = this.getNotionRecord();
    if (!record) return fail(ctx, 'Notion 尚未连接', 400);

    const { blockId } = ctx.params;
    const { type, text } = ctx.request.body as { type?: string; text?: string };
    if (!blockId) return fail(ctx, 'Notion block id is required', 400);
    if (!type) return fail(ctx, 'Notion block type is required', 400);
    if (typeof text !== 'string') return fail(ctx, 'Notion block text is required', 400);

    try {
      success(ctx, await service.updateNotionBlock(record, blockId, type, text));
    } catch (err: any) {
      fail(ctx, err.message || '更新 Notion 内容块失败', 500);
    }
  };

  disconnectNotion = async (ctx: Context) => {
    model.delete('notion');
    success(ctx, { disconnected: true });
  };

  getMiSub = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return success(ctx, emptyMiSubState());

    try {
      success(ctx, await service.fetchMiSubData(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 MiSub 信息失败', 500);
    }
  };

  connectMiSub = async (ctx: Context) => {
    const { baseUrl, password } = ctx.request.body as { baseUrl?: string; password?: string };
    if (!baseUrl?.trim()) return fail(ctx, 'MiSub baseUrl is required', 400);
    if (!password?.trim()) return fail(ctx, 'MiSub password is required', 400);

    try {
      const validated = await service.validateMiSubCredentials(baseUrl.trim(), password.trim());
      const record = model.upsert('misub', service.buildMiSubRecordPayload(baseUrl.trim(), password.trim()));
      success(ctx, { ...validated, lastSyncAt: record.updated_at });
    } catch (err: any) {
      fail(ctx, err.message || '连接 MiSub 失败', 500);
    }
  };

  syncMiSub = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return fail(ctx, 'MiSub 尚未连接', 400);

    try {
      const updated = model.upsert('misub', record.token);
      success(ctx, await service.fetchMiSubData(updated, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '同步 MiSub 失败', 500);
    }
  };

  saveMiSubData = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return fail(ctx, 'MiSub 尚未连接', 400);

    const { misubs, profiles } = ctx.request.body as { misubs?: any[]; profiles?: any[] };
    if (!Array.isArray(misubs) || !Array.isArray(profiles)) {
      return fail(ctx, 'MiSub misubs / profiles 必须为数组', 400);
    }

    try {
      success(ctx, await service.saveMiSubData(record, misubs, profiles));
    } catch (err: any) {
      fail(ctx, err.message || '保存 MiSub 数据失败', 500);
    }
  };

  saveMiSubSettings = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return fail(ctx, 'MiSub 尚未连接', 400);

    const settings = ctx.request.body as Record<string, any>;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return fail(ctx, 'MiSub settings 必须为对象', 400);
    }

    try {
      success(ctx, await service.saveMiSubSettings(record, settings as any));
    } catch (err: any) {
      fail(ctx, err.message || '保存 MiSub 设置失败', 500);
    }
  };

  updateMiSubNodeCount = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return fail(ctx, 'MiSub 尚未连接', 400);

    const { url, fetchProxy, plusAsSpace } = ctx.request.body as {
      url?: string;
      fetchProxy?: string;
      plusAsSpace?: boolean;
    };
    if (!url?.trim()) return fail(ctx, 'MiSub subscription url is required', 400);

    try {
      success(ctx, await service.updateMiSubNodeCount(record, url.trim(), fetchProxy?.trim(), !!plusAsSpace));
    } catch (err: any) {
      fail(ctx, err.message || '刷新 MiSub 节点数失败', 500);
    }
  };

  batchUpdateMiSubNodes = async (ctx: Context) => {
    const record = this.getMiSubRecord();
    if (!record) return fail(ctx, 'MiSub 尚未连接', 400);

    const { subscriptionIds } = ctx.request.body as { subscriptionIds?: string[] };
    if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
      return fail(ctx, 'MiSub subscriptionIds is required', 400);
    }

    try {
      success(ctx, await service.batchUpdateMiSubNodes(record, subscriptionIds));
    } catch (err: any) {
      fail(ctx, err.message || '批量刷新 MiSub 节点失败', 500);
    }
  };

  disconnectMiSub = async (ctx: Context) => {
    model.delete('misub');
    success(ctx, { disconnected: true });
  };

  getYmail = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return success(ctx, emptyYmailState());

    try {
      success(ctx, await ymailService.fetchIntegrationData(record));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Ymail 信息失败', 500);
    }
  };

  connectYmail = async (ctx: Context) => {
    const body = ctx.request.body as { token?: string; password?: string };
    const password = String(body.password || body.token || '').trim();
    if (!password) return fail(ctx, 'Ymail admin password is required', 400);

    try {
      await ymailService.validateAdminPassword(password);
      const record = model.upsert('ymail', password);
      success(ctx, await ymailService.fetchIntegrationData(record, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '连接 Ymail 失败', 500);
    }
  };

  syncYmail = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    try {
      await ymailService.validateAdminPassword(record.token);
      const updated = model.upsert('ymail', record.token);
      success(ctx, await ymailService.fetchIntegrationData(updated, { force: true }));
    } catch (err: any) {
      fail(ctx, err.message || '同步 Ymail 失败', 500);
    }
  };

  listYmailAddresses = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const { limit, offset, query, sort_by, sort_order } = ctx.query as Record<string, string>;

    try {
      success(ctx, await ymailService.listAddresses(record.token, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        query,
        sortBy: sort_by,
        sortOrder: sort_order,
      }));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Ymail 地址失败', 500);
    }
  };

  createYmailAddress = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const { name, domain, enablePrefix, enableRandomSubdomain } = ctx.request.body as {
      name?: string;
      domain?: string;
      enablePrefix?: boolean;
      enableRandomSubdomain?: boolean;
    };

    if (!name?.trim()) return fail(ctx, 'Ymail address name is required', 400);
    if (!domain?.trim()) return fail(ctx, 'Ymail domain is required', 400);

    try {
      const created = await ymailService.createAddress(record.token, {
        name: name.trim(),
        domain: domain.trim(),
        enablePrefix,
        enableRandomSubdomain,
      });
      ymailService.invalidateIntegrationData(record);
      success(ctx, created);
    } catch (err: any) {
      fail(ctx, err.message || '创建 Ymail 地址失败', 500);
    }
  };

  getYmailAddressCredential = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);

    try {
      const credential = await ymailService.showAddressCredential(record.token, id);
      const settings = credential.jwt ? await ymailService.fetchMailboxSettings(credential.jwt) : {};
      success(ctx, {
        ...credential,
        address: settings?.address || credential.address || '',
      });
    } catch (err: any) {
      fail(ctx, err.message || '获取 Ymail 地址凭证失败', 500);
    }
  };

  getYmailAddressMails = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);

    const { limit, offset } = ctx.query as Record<string, string>;

    try {
      success(ctx, await ymailService.fetchAddressMailbox(record, id, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      }));
    } catch (err: any) {
      fail(ctx, err.message || '加载 Ymail 邮件失败', 500);
    }
  };

  deleteYmailMail = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    const mailId = Number(ctx.params.mailId);
    if (!Number.isFinite(id) || !Number.isFinite(mailId)) return fail(ctx, 'Invalid Ymail id', 400);

    try {
      const credential = await ymailService.showAddressCredential(record.token, id);
      await ymailService.deleteMail(credential.jwt, mailId);
      ymailService.invalidateAddressMails(record, id);
      success(ctx, { deleted: true });
    } catch (err: any) {
      fail(ctx, err.message || '删除 Ymail 邮件失败', 500);
    }
  };

  clearYmailInbox = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);

    try {
      await ymailService.clearInbox(record.token, id);
      ymailService.invalidateIntegrationData(record);
      ymailService.invalidateAddressMails(record, id);
      success(ctx, { cleared: true });
    } catch (err: any) {
      fail(ctx, err.message || '清空 Ymail 收件箱失败', 500);
    }
  };

  clearYmailSent = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);

    try {
      await ymailService.clearSentItems(record.token, id);
      ymailService.invalidateIntegrationData(record);
      ymailService.invalidateAddressMails(record, id);
      success(ctx, { cleared: true });
    } catch (err: any) {
      fail(ctx, err.message || '清空 Ymail 发件箱失败', 500);
    }
  };

  deleteYmailAddress = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);

    try {
      await ymailService.deleteAddress(record.token, id);
      ymailService.invalidateIntegrationData(record);
      success(ctx, { deleted: true });
    } catch (err: any) {
      fail(ctx, err.message || '删除 Ymail 地址失败', 500);
    }
  };

  resetYmailAddressPassword = async (ctx: Context) => {
    const record = this.getYmailRecord();
    if (!record) return fail(ctx, 'Ymail 尚未连接', 400);

    const id = Number(ctx.params.id);
    const { password } = ctx.request.body as { password?: string };
    if (!Number.isFinite(id)) return fail(ctx, 'Invalid Ymail address id', 400);
    if (!password?.trim()) return fail(ctx, 'Ymail new password is required', 400);

    try {
      await ymailService.resetAddressPassword(record.token, id, password.trim());
      ymailService.invalidateIntegrationData(record);
      success(ctx, { updated: true });
    } catch (err: any) {
      fail(ctx, err.message || '重置 Ymail 密码失败', 500);
    }
  };

  disconnectYmail = async (ctx: Context) => {
    model.delete('ymail');
    success(ctx, { disconnected: true });
  };
}
