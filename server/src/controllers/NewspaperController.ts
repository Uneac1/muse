import { Context } from 'koa';
import { NewspaperService } from '../services/NewspaperService';
import { success } from '../utils/response';

const newspaperService = new NewspaperService();

export class NewspaperController {
  async briefing(ctx: Context) {
    const refresh = String(ctx.query.refresh || '').toLowerCase() === 'true' || String(ctx.query.refresh || '') === '1';
    const limit = Number(ctx.query.limit || 5);
    const data = await newspaperService.getBriefing({ refresh, limit });
    success(ctx, data);
  }

  async article(ctx: Context) {
    const url = String(ctx.query.url || '').trim();
    const data = await newspaperService.getArticleDetail({
      url,
      source: String(ctx.query.source || ''),
      sourceUrl: String(ctx.query.sourceUrl || ''),
      publishedAt: String(ctx.query.publishedAt || '') || null,
      title: String(ctx.query.title || ''),
      titleZh: String(ctx.query.titleZh || ''),
      summary: String(ctx.query.summary || ''),
      summaryZh: String(ctx.query.summaryZh || ''),
    });
    success(ctx, data);
  }
}
