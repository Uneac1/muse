import { Context } from 'koa';
import { AccountModel } from '../models/Account';
import { TagModel } from '../models/Tag';
import { config } from '../config';
import { success, fail } from '../utils/response';

const model = new AccountModel();
const tagModel = new TagModel();

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export class AccountController {
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

  private normalizeProvider(body: any): string {
    const email = String(body.email || '').toLowerCase();
    if (email.endsWith('@qq.com') || email.endsWith('@vip.qq.com') || email.endsWith('@foxmail.com')) return 'qq';
    if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) return 'gmail';
    if (body.custom_imap_host || body.custom_smtp_host) return 'custom';

    const explicitProvider = String(body.provider || '').toLowerCase();
    if (explicitProvider) return explicitProvider;

    return 'microsoft';
  }

  private resolveGmailCredentials(body: any) {
    return {
      client_id: String(body.client_id || config.googleClientId || '').trim(),
      client_secret: String(body.client_secret || config.googleClientSecret || '').trim(),
      refresh_token: String(body.refresh_token || '').trim(),
    };
  }

  private validateAccountPayload(body: any, provider: string, isPartial = false): string | null {
    const gmailCredentials = provider === 'gmail' ? this.resolveGmailCredentials(body) : null;

    if (!isPartial) {
      if (!body.email) {
        return 'Missing required field: email';
      }

      if (provider === 'qq') {
        if (!body.password) return 'Missing required fields: email, password';
      } else if (provider === 'gmail') {
        if (!gmailCredentials?.refresh_token || !gmailCredentials.client_id) {
          return 'Missing required fields: email, client_id, refresh_token';
        }
      } else if (!body.client_id || !body.refresh_token) {
        return 'Missing required fields: email, client_id, refresh_token';
      }
    }

    if (!['microsoft', 'gmail', 'qq', 'custom'].includes(provider)) {
      return 'provider must be microsoft, gmail, qq or custom';
    }

    if (provider === 'gmail') {
      const hasClientSecret = isPartial
        ? body.client_secret !== undefined
          ? !!gmailCredentials?.client_secret
          : true
        : !!gmailCredentials?.client_secret;
      if (!hasClientSecret) return 'Gmail account requires client_secret';
    }

    if (provider === 'qq') {
      const hasPassword = isPartial ? body.password !== undefined ? !!body.password : true : !!body.password;
      if (!hasPassword) return 'QQ account requires password (IMAP auth code)';
    }

    if (provider === 'custom') {
      const hasPassword = isPartial ? body.password !== undefined ? !!body.password : true : !!body.password;
      if (!hasPassword) return 'Custom mailbox requires password';
      const hasCustomIncoming = isPartial
        ? body.custom_imap_host !== undefined ? !!body.custom_imap_host : true
        : !!body.custom_imap_host;
      if (!hasCustomIncoming) return 'Custom mailbox requires custom_imap_host';
    }

    return null;
  }

  async list(ctx: Context) {
    const { page = '1', pageSize = '20', search = '' } = ctx.query as Record<string, string>;
    const safePage = parsePositiveInt(page, 1);
    const safePageSize = clamp(parsePositiveInt(pageSize, 20), 1, 100);
    const data = model.list(safePage, safePageSize, search);
    success(ctx, data);
  }

  async create(ctx: Context) {
    const body = ctx.request.body as any;
    const provider = this.normalizeProvider(body);
    const payload = provider === 'gmail'
      ? { ...body, ...this.resolveGmailCredentials(body), provider }
      : { ...body, provider };
    const validationError = this.validateAccountPayload(payload, provider);
    if (validationError) return fail(ctx, validationError, 400);

    try {
      const account = model.create(payload);
      success(ctx, account);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) return fail(ctx, 'Email already exists', 409);
      throw err;
    }
  }

  async update(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const body = ctx.request.body as any;
    const current = model.getById(id);
    if (!current) return fail(ctx, 'Account not found', 404);

    const provider = this.normalizeProvider({ ...current, ...body });
    const mergedBody = { ...current, ...body };
    const payload = provider === 'gmail'
      ? { ...mergedBody, ...this.resolveGmailCredentials(mergedBody), provider }
      : { ...mergedBody, provider };
    const validationError = this.validateAccountPayload(payload, provider, true);
    if (validationError) return fail(ctx, validationError, 400);

    const updatePayload = provider === 'gmail'
      ? { ...body, ...this.resolveGmailCredentials(mergedBody), provider }
      : { ...body, provider };
    const account = model.update(id, updatePayload);
    if (!account) return fail(ctx, 'Account not found', 404);
    success(ctx, account);
  }

  async delete(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const deleted = model.delete(id);
    if (!deleted) return fail(ctx, 'Account not found', 404);
    success(ctx, { deleted: true });
  }

  async batchDelete(ctx: Context) {
    const { ids } = ctx.request.body as any;
    if (!Array.isArray(ids) || ids.length === 0) return fail(ctx, 'ids must be a non-empty array', 400);
    const deleted = model.batchDelete(ids);
    success(ctx, { deleted });
  }

  async import(ctx: Context) {
    const body = ctx.request.body as any;
    if (!body.content) return fail(ctx, 'content is required', 400);
    const result = model.import(body);
    success(ctx, result);
  }

  async export(ctx: Context) {
    const body = ctx.request.body as any;
    const content = model.export(body.ids, body.separator, body.format);
    success(ctx, { content, count: content.split('\n').filter(Boolean).length });
  }

  async setTags(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const { tag_ids } = ctx.request.body as any;
    if (!Array.isArray(tag_ids)) return fail(ctx, 'tag_ids must be an array', 400);
    tagModel.setAccountTags(id, tag_ids);
    success(ctx, { account_id: id, tag_ids });
  }

  async importPreview(ctx: Context) {
    const body = ctx.request.body as any;
    if (!body.content) return fail(ctx, 'content is required', 400);
    const result = model.importPreview(body);
    success(ctx, result);
  }

  async importConfirm(ctx: Context) {
    const body = ctx.request.body as any;
    if (!body.content) return fail(ctx, 'content is required', 400);
    if (!['skip', 'overwrite'].includes(body.mode)) return fail(ctx, 'mode must be skip or overwrite', 400);
    const result = model.importConfirm(body);
    success(ctx, result);
  }
}
