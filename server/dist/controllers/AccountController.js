"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountController = void 0;
const Account_1 = require("../models/Account");
const Tag_1 = require("../models/Tag");
const response_1 = require("../utils/response");
const model = new Account_1.AccountModel();
const tagModel = new Tag_1.TagModel();
class AccountController {
    constructor() {
        this.list = this.list.bind(this);
        this.create = this.create.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.batchDelete = this.batchDelete.bind(this);
        this.import = this.import.bind(this);
        this.export = this.export.bind(this);
        this.setTags = this.setTags.bind(this);
        this.importPreview = this.importPreview.bind(this);
        this.importConfirm = this.importConfirm.bind(this);
    }
    normalizeProvider(body) {
        const email = String(body.email || '').toLowerCase();
        if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com'))
            return 'qq';
        if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'))
            return 'gmail';
        if (body.custom_imap_host || body.custom_smtp_host)
            return 'custom';
        const explicitProvider = String(body.provider || '').toLowerCase();
        if (explicitProvider)
            return explicitProvider;
        return 'microsoft';
    }
    validateAccountPayload(body, provider, isPartial = false) {
        if (!isPartial) {
            if (!body.email) {
                return 'Missing required field: email';
            }
            if (provider === 'qq') {
                if (!body.password)
                    return 'Missing required fields: email, password';
            }
            else if (!body.client_id || !body.refresh_token) {
                return 'Missing required fields: email, client_id, refresh_token';
            }
        }
        if (!['microsoft', 'gmail', 'qq', 'custom'].includes(provider)) {
            return 'provider must be microsoft, gmail, qq or custom';
        }
        if (provider === 'gmail') {
            const hasClientSecret = isPartial ? body.client_secret !== undefined ? !!body.client_secret : true : !!body.client_secret;
            if (!hasClientSecret)
                return 'Gmail account requires client_secret';
        }
        if (provider === 'qq') {
            const hasPassword = isPartial ? body.password !== undefined ? !!body.password : true : !!body.password;
            if (!hasPassword)
                return 'QQ account requires password (IMAP auth code)';
        }
        if (provider === 'custom') {
            const hasPassword = isPartial ? body.password !== undefined ? !!body.password : true : !!body.password;
            if (!hasPassword)
                return 'Custom mailbox requires password';
            const hasCustomIncoming = isPartial
                ? body.custom_imap_host !== undefined ? !!body.custom_imap_host : true
                : !!body.custom_imap_host;
            if (!hasCustomIncoming)
                return 'Custom mailbox requires custom_imap_host';
        }
        return null;
    }
    async list(ctx) {
        const { page = '1', pageSize = '20', search = '' } = ctx.query;
        const data = model.list(parseInt(page), parseInt(pageSize), search);
        (0, response_1.success)(ctx, data);
    }
    async create(ctx) {
        const body = ctx.request.body;
        const provider = this.normalizeProvider(body);
        const validationError = this.validateAccountPayload(body, provider);
        if (validationError)
            return (0, response_1.fail)(ctx, validationError, 400);
        try {
            const account = model.create({ ...body, provider });
            (0, response_1.success)(ctx, account);
        }
        catch (err) {
            if (err.message?.includes('UNIQUE'))
                return (0, response_1.fail)(ctx, 'Email already exists', 409);
            throw err;
        }
    }
    async update(ctx) {
        const id = parseInt(ctx.params.id);
        const body = ctx.request.body;
        const current = model.getById(id);
        if (!current)
            return (0, response_1.fail)(ctx, 'Account not found', 404);
        const provider = this.normalizeProvider({ ...current, ...body });
        const validationError = this.validateAccountPayload({ ...current, ...body }, provider, true);
        if (validationError)
            return (0, response_1.fail)(ctx, validationError, 400);
        const account = model.update(id, { ...body, provider });
        if (!account)
            return (0, response_1.fail)(ctx, 'Account not found', 404);
        (0, response_1.success)(ctx, account);
    }
    async delete(ctx) {
        const id = parseInt(ctx.params.id);
        const deleted = model.delete(id);
        if (!deleted)
            return (0, response_1.fail)(ctx, 'Account not found', 404);
        (0, response_1.success)(ctx, { deleted: true });
    }
    async batchDelete(ctx) {
        const { ids } = ctx.request.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return (0, response_1.fail)(ctx, 'ids must be a non-empty array', 400);
        const deleted = model.batchDelete(ids);
        (0, response_1.success)(ctx, { deleted });
    }
    async import(ctx) {
        const body = ctx.request.body;
        if (!body.content)
            return (0, response_1.fail)(ctx, 'content is required', 400);
        const result = model.import(body);
        (0, response_1.success)(ctx, result);
    }
    async export(ctx) {
        const body = ctx.request.body;
        const content = model.export(body.ids, body.separator, body.format);
        (0, response_1.success)(ctx, { content, count: content.split('\n').filter(Boolean).length });
    }
    async setTags(ctx) {
        const id = parseInt(ctx.params.id);
        const { tag_ids } = ctx.request.body;
        if (!Array.isArray(tag_ids))
            return (0, response_1.fail)(ctx, 'tag_ids must be an array', 400);
        tagModel.setAccountTags(id, tag_ids);
        (0, response_1.success)(ctx, { account_id: id, tag_ids });
    }
    async importPreview(ctx) {
        const body = ctx.request.body;
        if (!body.content)
            return (0, response_1.fail)(ctx, 'content is required', 400);
        const result = model.importPreview(body);
        (0, response_1.success)(ctx, result);
    }
    async importConfirm(ctx) {
        const body = ctx.request.body;
        if (!body.content)
            return (0, response_1.fail)(ctx, 'content is required', 400);
        if (!['skip', 'overwrite'].includes(body.mode))
            return (0, response_1.fail)(ctx, 'mode must be skip or overwrite', 400);
        const result = model.importConfirm(body);
        (0, response_1.success)(ctx, result);
    }
}
exports.AccountController = AccountController;
//# sourceMappingURL=AccountController.js.map