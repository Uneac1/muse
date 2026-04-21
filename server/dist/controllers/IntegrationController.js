"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationController = void 0;
const config_1 = require("../config");
const IntegrationToken_1 = require("../models/IntegrationToken");
const IntegrationService_1 = require("../services/IntegrationService");
const YmailService_1 = require("../services/YmailService");
const response_1 = require("../utils/response");
const model = new IntegrationToken_1.IntegrationTokenModel();
const service = new IntegrationService_1.IntegrationService();
const ymailService = new YmailService_1.YmailService();
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
        baseUrl: config_1.config.defaultMiSubUrl,
        passwordMasked: config_1.config.defaultMiSubPassword ? `${config_1.config.defaultMiSubPassword[0] || ''}${'*'.repeat(Math.max(config_1.config.defaultMiSubPassword.length - 2, 1))}${config_1.config.defaultMiSubPassword.slice(-1)}` : '',
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
        siteUrl: config_1.config.ymailSiteUrl,
        apiBaseUrl: config_1.config.ymailApiBaseUrl,
        openSettings: null,
        statistics: null,
        addresses: [],
        addressCount: 0,
    };
}
class IntegrationController {
    getGitHubRecord() {
        return model.get('github') || (config_1.config.defaultGitHubToken
            ? {
                provider: 'github',
                token: config_1.config.defaultGitHubToken,
                updated_at: new Date().toISOString(),
            }
            : undefined);
    }
    getCloudflareRecord() {
        return model.get('cloudflare') || (config_1.config.defaultCloudflareToken
            ? {
                provider: 'cloudflare',
                token: config_1.config.defaultCloudflareToken,
                updated_at: new Date().toISOString(),
            }
            : undefined);
    }
    getNotionRecord() {
        return model.get('notion') || (config_1.config.defaultNotionToken
            ? {
                provider: 'notion',
                token: config_1.config.defaultNotionToken,
                updated_at: new Date().toISOString(),
            }
            : undefined);
    }
    getMiSubRecord() {
        return model.get('misub') || (config_1.config.defaultMiSubUrl && config_1.config.defaultMiSubPassword
            ? {
                provider: 'misub',
                token: service.buildMiSubRecordPayload(config_1.config.defaultMiSubUrl, config_1.config.defaultMiSubPassword),
                updated_at: new Date().toISOString(),
            }
            : undefined);
    }
    getYmailRecord() {
        return model.get('ymail') || (config_1.config.defaultYmailAdminPassword
            ? {
                provider: 'ymail',
                token: config_1.config.defaultYmailAdminPassword,
                updated_at: new Date().toISOString(),
            }
            : undefined);
    }
    getGitHub = async (ctx) => {
        const record = this.getGitHubRecord();
        if (!record)
            return (0, response_1.success)(ctx, emptyGitHubState());
        try {
            (0, response_1.success)(ctx, await service.fetchGitHubData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 GitHub 信息失败', 500);
        }
    };
    connectGitHub = async (ctx) => {
        const { token } = ctx.request.body;
        if (!token?.trim())
            return (0, response_1.fail)(ctx, 'GitHub token is required', 400);
        try {
            const record = model.upsert('github', token.trim());
            (0, response_1.success)(ctx, await service.fetchGitHubData(record, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '连接 GitHub 失败', 500);
        }
    };
    syncGitHub = async (ctx) => {
        const record = this.getGitHubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'GitHub 尚未连接', 400);
        try {
            const updated = model.upsert('github', record.token);
            (0, response_1.success)(ctx, await service.fetchGitHubData(updated, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '同步 GitHub 失败', 500);
        }
    };
    disconnectGitHub = async (ctx) => {
        model.delete('github');
        (0, response_1.success)(ctx, { disconnected: true });
    };
    getCloudflare = async (ctx) => {
        const record = this.getCloudflareRecord();
        if (!record)
            return (0, response_1.success)(ctx, emptyCloudflareState());
        try {
            (0, response_1.success)(ctx, await service.fetchCloudflareData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Cloudflare 信息失败', 500);
        }
    };
    connectCloudflare = async (ctx) => {
        const { token } = ctx.request.body;
        if (!token?.trim())
            return (0, response_1.fail)(ctx, 'Cloudflare token is required', 400);
        try {
            const record = model.upsert('cloudflare', token.trim());
            (0, response_1.success)(ctx, await service.fetchCloudflareData(record, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '连接 Cloudflare 失败', 500);
        }
    };
    syncCloudflare = async (ctx) => {
        const record = this.getCloudflareRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Cloudflare 尚未连接', 400);
        try {
            const updated = model.upsert('cloudflare', record.token);
            (0, response_1.success)(ctx, await service.fetchCloudflareData(updated, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '同步 Cloudflare 失败', 500);
        }
    };
    disconnectCloudflare = async (ctx) => {
        model.delete('cloudflare');
        (0, response_1.success)(ctx, { disconnected: true });
    };
    getNotion = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.success)(ctx, emptyNotionState());
        try {
            (0, response_1.success)(ctx, await service.fetchNotionData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Notion 信息失败', 500);
        }
    };
    connectNotion = async (ctx) => {
        const { token } = ctx.request.body;
        if (!token?.trim())
            return (0, response_1.fail)(ctx, 'Notion token is required', 400);
        try {
            const record = model.upsert('notion', token.trim());
            (0, response_1.success)(ctx, await service.fetchNotionData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '连接 Notion 失败', 500);
        }
    };
    syncNotion = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Notion 尚未连接', 400);
        try {
            const updated = model.upsert('notion', record.token);
            (0, response_1.success)(ctx, await service.fetchNotionData(updated, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '同步 Notion 失败', 500);
        }
    };
    getNotionInsights = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Notion 尚未连接', 400);
        try {
            (0, response_1.success)(ctx, await service.fetchNotionInsights(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Notion 洞察失败', 500);
        }
    };
    getNotionPageContent = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Notion 尚未连接', 400);
        const { pageId } = ctx.params;
        if (!pageId)
            return (0, response_1.fail)(ctx, 'Notion page id is required', 400);
        try {
            (0, response_1.success)(ctx, await service.fetchNotionPageContent(record, pageId));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Notion 页面内容失败', 500);
        }
    };
    getNotionDatabaseContent = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Notion 尚未连接', 400);
        const { databaseId } = ctx.params;
        if (!databaseId)
            return (0, response_1.fail)(ctx, 'Notion database id is required', 400);
        try {
            (0, response_1.success)(ctx, await service.fetchNotionDatabaseContent(record, databaseId));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Notion 数据库内容失败', 500);
        }
    };
    updateNotionBlock = async (ctx) => {
        const record = this.getNotionRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Notion 尚未连接', 400);
        const { blockId } = ctx.params;
        const { type, text } = ctx.request.body;
        if (!blockId)
            return (0, response_1.fail)(ctx, 'Notion block id is required', 400);
        if (!type)
            return (0, response_1.fail)(ctx, 'Notion block type is required', 400);
        if (typeof text !== 'string')
            return (0, response_1.fail)(ctx, 'Notion block text is required', 400);
        try {
            (0, response_1.success)(ctx, await service.updateNotionBlock(record, blockId, type, text));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '更新 Notion 内容块失败', 500);
        }
    };
    disconnectNotion = async (ctx) => {
        model.delete('notion');
        (0, response_1.success)(ctx, { disconnected: true });
    };
    getMiSub = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.success)(ctx, emptyMiSubState());
        try {
            (0, response_1.success)(ctx, await service.fetchMiSubData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 MiSub 信息失败', 500);
        }
    };
    connectMiSub = async (ctx) => {
        const { baseUrl, password } = ctx.request.body;
        if (!baseUrl?.trim())
            return (0, response_1.fail)(ctx, 'MiSub baseUrl is required', 400);
        if (!password?.trim())
            return (0, response_1.fail)(ctx, 'MiSub password is required', 400);
        try {
            const validated = await service.validateMiSubCredentials(baseUrl.trim(), password.trim());
            const record = model.upsert('misub', service.buildMiSubRecordPayload(baseUrl.trim(), password.trim()));
            (0, response_1.success)(ctx, { ...validated, lastSyncAt: record.updated_at });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '连接 MiSub 失败', 500);
        }
    };
    syncMiSub = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'MiSub 尚未连接', 400);
        try {
            const updated = model.upsert('misub', record.token);
            (0, response_1.success)(ctx, await service.fetchMiSubData(updated, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '同步 MiSub 失败', 500);
        }
    };
    saveMiSubData = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'MiSub 尚未连接', 400);
        const { misubs, profiles } = ctx.request.body;
        if (!Array.isArray(misubs) || !Array.isArray(profiles)) {
            return (0, response_1.fail)(ctx, 'MiSub misubs / profiles 必须为数组', 400);
        }
        try {
            (0, response_1.success)(ctx, await service.saveMiSubData(record, misubs, profiles));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '保存 MiSub 数据失败', 500);
        }
    };
    saveMiSubSettings = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'MiSub 尚未连接', 400);
        const settings = ctx.request.body;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return (0, response_1.fail)(ctx, 'MiSub settings 必须为对象', 400);
        }
        try {
            (0, response_1.success)(ctx, await service.saveMiSubSettings(record, settings));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '保存 MiSub 设置失败', 500);
        }
    };
    updateMiSubNodeCount = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'MiSub 尚未连接', 400);
        const { url, fetchProxy, plusAsSpace } = ctx.request.body;
        if (!url?.trim())
            return (0, response_1.fail)(ctx, 'MiSub subscription url is required', 400);
        try {
            (0, response_1.success)(ctx, await service.updateMiSubNodeCount(record, url.trim(), fetchProxy?.trim(), !!plusAsSpace));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '刷新 MiSub 节点数失败', 500);
        }
    };
    batchUpdateMiSubNodes = async (ctx) => {
        const record = this.getMiSubRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'MiSub 尚未连接', 400);
        const { subscriptionIds } = ctx.request.body;
        if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
            return (0, response_1.fail)(ctx, 'MiSub subscriptionIds is required', 400);
        }
        try {
            (0, response_1.success)(ctx, await service.batchUpdateMiSubNodes(record, subscriptionIds));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '批量刷新 MiSub 节点失败', 500);
        }
    };
    disconnectMiSub = async (ctx) => {
        model.delete('misub');
        (0, response_1.success)(ctx, { disconnected: true });
    };
    getYmail = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.success)(ctx, emptyYmailState());
        try {
            (0, response_1.success)(ctx, await ymailService.fetchIntegrationData(record));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Ymail 信息失败', 500);
        }
    };
    connectYmail = async (ctx) => {
        const body = ctx.request.body;
        const password = String(body.password || body.token || '').trim();
        if (!password)
            return (0, response_1.fail)(ctx, 'Ymail admin password is required', 400);
        try {
            await ymailService.validateAdminPassword(password);
            const record = model.upsert('ymail', password);
            (0, response_1.success)(ctx, await ymailService.fetchIntegrationData(record, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '连接 Ymail 失败', 500);
        }
    };
    syncYmail = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        try {
            await ymailService.validateAdminPassword(record.token);
            const updated = model.upsert('ymail', record.token);
            (0, response_1.success)(ctx, await ymailService.fetchIntegrationData(updated, { force: true }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '同步 Ymail 失败', 500);
        }
    };
    listYmailAddresses = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const { limit, offset, query, sort_by, sort_order } = ctx.query;
        try {
            (0, response_1.success)(ctx, await ymailService.listAddresses(record.token, {
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined,
                query,
                sortBy: sort_by,
                sortOrder: sort_order,
            }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Ymail 地址失败', 500);
        }
    };
    createYmailAddress = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const { name, domain, enablePrefix, enableRandomSubdomain } = ctx.request.body;
        if (!name?.trim())
            return (0, response_1.fail)(ctx, 'Ymail address name is required', 400);
        if (!domain?.trim())
            return (0, response_1.fail)(ctx, 'Ymail domain is required', 400);
        try {
            const created = await ymailService.createAddress(record.token, {
                name: name.trim(),
                domain: domain.trim(),
                enablePrefix,
                enableRandomSubdomain,
            });
            ymailService.invalidateIntegrationData(record);
            (0, response_1.success)(ctx, created);
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '创建 Ymail 地址失败', 500);
        }
    };
    getYmailAddressCredential = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        try {
            const credential = await ymailService.showAddressCredential(record.token, id);
            const settings = credential.jwt ? await ymailService.fetchMailboxSettings(credential.jwt) : {};
            (0, response_1.success)(ctx, {
                ...credential,
                address: settings?.address || credential.address || '',
            });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '获取 Ymail 地址凭证失败', 500);
        }
    };
    getYmailAddressMails = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        const { limit, offset } = ctx.query;
        try {
            (0, response_1.success)(ctx, await ymailService.fetchAddressMailbox(record, id, {
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined,
            }));
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '加载 Ymail 邮件失败', 500);
        }
    };
    deleteYmailMail = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        const mailId = Number(ctx.params.mailId);
        if (!Number.isFinite(id) || !Number.isFinite(mailId))
            return (0, response_1.fail)(ctx, 'Invalid Ymail id', 400);
        try {
            const credential = await ymailService.showAddressCredential(record.token, id);
            await ymailService.deleteMail(credential.jwt, mailId);
            ymailService.invalidateAddressMails(record, id);
            (0, response_1.success)(ctx, { deleted: true });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '删除 Ymail 邮件失败', 500);
        }
    };
    clearYmailInbox = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        try {
            await ymailService.clearInbox(record.token, id);
            ymailService.invalidateIntegrationData(record);
            ymailService.invalidateAddressMails(record, id);
            (0, response_1.success)(ctx, { cleared: true });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '清空 Ymail 收件箱失败', 500);
        }
    };
    clearYmailSent = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        try {
            await ymailService.clearSentItems(record.token, id);
            ymailService.invalidateIntegrationData(record);
            ymailService.invalidateAddressMails(record, id);
            (0, response_1.success)(ctx, { cleared: true });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '清空 Ymail 发件箱失败', 500);
        }
    };
    deleteYmailAddress = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        try {
            await ymailService.deleteAddress(record.token, id);
            ymailService.invalidateIntegrationData(record);
            (0, response_1.success)(ctx, { deleted: true });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '删除 Ymail 地址失败', 500);
        }
    };
    resetYmailAddressPassword = async (ctx) => {
        const record = this.getYmailRecord();
        if (!record)
            return (0, response_1.fail)(ctx, 'Ymail 尚未连接', 400);
        const id = Number(ctx.params.id);
        const { password } = ctx.request.body;
        if (!Number.isFinite(id))
            return (0, response_1.fail)(ctx, 'Invalid Ymail address id', 400);
        if (!password?.trim())
            return (0, response_1.fail)(ctx, 'Ymail new password is required', 400);
        try {
            await ymailService.resetAddressPassword(record.token, id, password.trim());
            ymailService.invalidateIntegrationData(record);
            (0, response_1.success)(ctx, { updated: true });
        }
        catch (err) {
            (0, response_1.fail)(ctx, err.message || '重置 Ymail 密码失败', 500);
        }
    };
    disconnectYmail = async (ctx) => {
        model.delete('ymail');
        (0, response_1.success)(ctx, { disconnected: true });
    };
}
exports.IntegrationController = IntegrationController;
//# sourceMappingURL=IntegrationController.js.map