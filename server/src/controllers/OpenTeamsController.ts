import type { Context } from 'koa';
import { openTeamsService } from '../services/OpenTeamsService';
import { fail, success } from '../utils/response';

export class OpenTeamsController {
  constructor() {
    this.status = this.status.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
  }

  async status(ctx: Context) {
    success(ctx, await openTeamsService.getStatus());
  }

  async start(ctx: Context) {
    try {
      success(ctx, await openTeamsService.start());
    } catch (error: any) {
      fail(ctx, error?.message || 'OpenTeams 启动失败', 500);
    }
  }

  async stop(ctx: Context) {
    try {
      success(ctx, await openTeamsService.stop());
    } catch (error: any) {
      fail(ctx, error?.message || 'OpenTeams 停止失败', 500);
    }
  }
}
