import type { Context } from 'koa';
import { crsRelayService } from '../services/CrsRelayService';
import { fail, success } from '../utils/response';

export class CrsRelayController {
  constructor() {
    this.status = this.status.bind(this);
    this.update = this.update.bind(this);
    this.rotateKey = this.rotateKey.bind(this);
    this.test = this.test.bind(this);
    this.proxy = this.proxy.bind(this);
  }

  status(ctx: Context) {
    success(ctx, crsRelayService.ensureRuntimeConfig());
  }

  update(ctx: Context) {
    try {
      success(ctx, crsRelayService.updateConfig(ctx.request.body as any));
    } catch (error: any) {
      fail(ctx, error?.message || 'CRS 配置保存失败', 400);
    }
  }

  rotateKey(ctx: Context) {
    success(ctx, crsRelayService.rotatePublicKey());
  }

  async test(ctx: Context) {
    try {
      success(ctx, await crsRelayService.test());
    } catch (error: any) {
      fail(ctx, error?.message || 'CRS 上游测试失败', 502);
    }
  }

  async proxy(ctx: Context) {
    const suffix = String(ctx.params.path || ctx.params[0] || '');
    await crsRelayService.proxy(ctx, suffix);
  }
}
