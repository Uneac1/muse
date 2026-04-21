import type { Context } from 'koa';
import { proxyKernelService } from '../services/ProxyKernelService';
import { fail, success } from '../utils/response';

export class ProxyKernelController {
  async status(ctx: Context) {
    success(ctx, await proxyKernelService.getStatus());
  }

  async download(ctx: Context) {
    try {
      success(ctx, await proxyKernelService.downloadLatestCore());
    } catch (error: any) {
      fail(ctx, error.message || '下载 mihomo 失败', 500);
    }
  }

  async start(ctx: Context) {
    try {
      const body = ctx.request.body as any;
      if (!body?.sourceKey) return fail(ctx, 'sourceKey is required', 400);
      success(ctx, await proxyKernelService.startKernel(body));
    } catch (error: any) {
      fail(ctx, error.message || '启动内置代理内核失败', 500);
    }
  }

  async stop(ctx: Context) {
    try {
      success(ctx, await proxyKernelService.stopKernel());
    } catch (error: any) {
      fail(ctx, error.message || '停止内置代理内核失败', 500);
    }
  }
}
