import { Context } from 'koa';
import { newspaperService } from '../services/NewspaperService';
import { fail, success } from '../utils/response';

export class NewspaperController {
  constructor() {
    this.health = this.health.bind(this);
    this.briefing = this.briefing.bind(this);
    this.article = this.article.bind(this);
    this.articleStream = this.articleStream.bind(this);
    this.insight = this.insight.bind(this);
    this.briefingInsight = this.briefingInsight.bind(this);
  }

  async health(ctx: Context) {
    success(ctx, newspaperService.getHealth());
  }

  async briefing(ctx: Context) {
    const refresh = String(ctx.query.refresh || '').toLowerCase() === 'true' || String(ctx.query.refresh || '') === '1';
    const limit = Number(ctx.query.limit || 5);
    const data = await newspaperService.getBriefing({ refresh, limit });
    success(ctx, data);
  }

  async article(ctx: Context) {
    const url = String(ctx.query.url || '').trim();
    if (!url) {
      fail(ctx, 'Article url is required', 400);
      return;
    }
    const data = await newspaperService.getArticleDetail({
      url,
      source: String(ctx.query.source || ''),
      sourceUrl: String(ctx.query.sourceUrl || ''),
      commentUrl: String(ctx.query.commentUrl || ''),
      publishedAt: String(ctx.query.publishedAt || '') || null,
      title: String(ctx.query.title || ''),
      titleZh: String(ctx.query.titleZh || ''),
      summary: String(ctx.query.summary || ''),
      summaryZh: String(ctx.query.summaryZh || ''),
    });
    success(ctx, data);
  }

  async articleStream(ctx: Context) {
    const url = String(ctx.query.url || '').trim();
    if (!url) {
      fail(ctx, 'Article url is required', 400);
      return;
    }

    ctx.respond = false;
    ctx.req.setTimeout(0);
    ctx.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (event: string, data: unknown) => {
      ctx.res.write(`event: ${event}\n`);
      ctx.res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of newspaperService.streamArticleRead({
        url,
        source: String(ctx.query.source || ''),
        sourceUrl: String(ctx.query.sourceUrl || ''),
        commentUrl: String(ctx.query.commentUrl || ''),
        publishedAt: String(ctx.query.publishedAt || '') || null,
        title: String(ctx.query.title || ''),
        titleZh: String(ctx.query.titleZh || ''),
        summary: String(ctx.query.summary || ''),
        summaryZh: String(ctx.query.summaryZh || ''),
      })) {
        write(event.type, event);
      }
    } catch (error: any) {
      write('error', { type: 'error', message: error?.message || 'Article stream failed' });
    } finally {
      ctx.res.end();
    }
  }

  async insight(ctx: Context) {
    const body = (ctx.request as any).body || {};
    const url = String(body.url || '').trim();
    if (!url) {
      fail(ctx, 'Article url is required', 400);
      return;
    }
    const data = await newspaperService.generateArticleInsight({
      url,
      source: String(body.source || ''),
      sourceUrl: String(body.sourceUrl || ''),
      commentUrl: String(body.commentUrl || ''),
      publishedAt: String(body.publishedAt || '') || null,
      title: String(body.title || ''),
      titleZh: String(body.titleZh || ''),
      summary: String(body.summary || ''),
      summaryZh: String(body.summaryZh || ''),
      accountId: body.accountId ? Number(body.accountId) : null,
    });
    success(ctx, data);
  }

  async briefingInsight(ctx: Context) {
    const body = (ctx.request as any).body || {};
    const data = await newspaperService.generateBriefingInsight({
      accountId: body.accountId ? Number(body.accountId) : null,
      limit: body.limit ? Number(body.limit) : undefined,
      refresh: !!body.refresh,
      query: String(body.query || ''),
    });
    success(ctx, data);
  }
}
