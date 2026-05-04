import type { Context } from 'koa';
import { TokenAccountModel } from '../models/TokenAccount';
import { codexDesktopService } from '../services/CodexDesktopService';
import type { TokenAccount, TokenAccountView } from '../types';
import { fail, success } from '../utils/response';

const tokenAccountModel = new TokenAccountModel();

export class CodexController {
  constructor() {
    this.status = this.status.bind(this);
    this.activate = this.activate.bind(this);
    this.rotate = this.rotate.bind(this);
    this.autoSwitchCheck = this.autoSwitchCheck.bind(this);
    this.restore = this.restore.bind(this);
    this.getSettings = this.getSettings.bind(this);
    this.updateSettings = this.updateSettings.bind(this);
    this.history = this.history.bind(this);
  }

  private buildTokenAccountView(account: TokenAccount): TokenAccountView {
    let snapshot = null;
    if (account.snapshot_json) {
      try {
        snapshot = JSON.parse(account.snapshot_json);
      } catch {
        snapshot = null;
      }
    }
    const { snapshot_json, ...rest } = account;
    return {
      ...rest,
      provider_label: tokenAccountModel.getProviderLabel(account.provider),
      snapshot,
    };
  }

  async status(ctx: Context) {
    const accounts = codexDesktopService.listCodexAccounts().map((account) => this.buildTokenAccountView(account));
    success(ctx, {
      status: codexDesktopService.getStatus(),
      settings: codexDesktopService.getSettings(),
      accounts,
    });
  }

  async activate(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const tokenAccountId = Number(body.tokenAccountId);
      if (!Number.isFinite(tokenAccountId)) return fail(ctx, 'tokenAccountId is required', 400);
      const result = await codexDesktopService.activate(tokenAccountId, { strategy: 'manual', launch: !!body.launch });
      const updated = tokenAccountModel.getById(tokenAccountId);
      success(ctx, {
        ...result,
        account: updated ? this.buildTokenAccountView(updated) : null,
      });
    } catch (error: any) {
      fail(ctx, error?.message || 'Codex 账号激活失败', 500);
    }
  }

  async rotate(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const strategy = body.strategy === 'next' ? 'next' : 'best';
      const result = await codexDesktopService.rotate(strategy, { launch: !!body.launch });
      success(ctx, result);
    } catch (error: any) {
      fail(ctx, error?.message || 'Codex 账号轮换失败', 500);
    }
  }

  async autoSwitchCheck(ctx: Context) {
    try {
      const result = await codexDesktopService.autoSwitchIfNeeded();
      const accounts = codexDesktopService.listCodexAccounts().map((account) => this.buildTokenAccountView(account));
      success(ctx, {
        autoSwitch: result,
        status: codexDesktopService.getStatus(),
        settings: codexDesktopService.getSettings(),
        accounts,
      });
    } catch (error: any) {
      fail(ctx, error?.message || 'Codex 自动切换检测失败', 500);
    }
  }

  async restore(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      const activationEventId = Number(body.activationEventId);
      if (!Number.isFinite(activationEventId)) return fail(ctx, 'activationEventId is required', 400);
      success(ctx, codexDesktopService.restore(activationEventId));
    } catch (error: any) {
      fail(ctx, error?.message || 'Codex auth.json 恢复失败', 500);
    }
  }

  async getSettings(ctx: Context) {
    success(ctx, codexDesktopService.getSettings());
  }

  async updateSettings(ctx: Context) {
    try {
      success(ctx, codexDesktopService.updateSettings(ctx.request.body as any));
    } catch (error: any) {
      fail(ctx, error?.message || 'Codex 设置保存失败', 500);
    }
  }

  async history(ctx: Context) {
    const rangeDays = Number(ctx.query.rangeDays || 30);
    success(ctx, codexDesktopService.getUsageHistory(rangeDays));
  }
}
