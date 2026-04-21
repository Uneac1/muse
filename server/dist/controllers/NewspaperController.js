"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewspaperController = void 0;
const NewspaperService_1 = require("../services/NewspaperService");
const response_1 = require("../utils/response");
const newspaperService = new NewspaperService_1.NewspaperService();
class NewspaperController {
    async briefing(ctx) {
        const refresh = String(ctx.query.refresh || '').toLowerCase() === 'true' || String(ctx.query.refresh || '') === '1';
        const limit = Number(ctx.query.limit || 5);
        const data = await newspaperService.getBriefing({ refresh, limit });
        (0, response_1.success)(ctx, data);
    }
    async article(ctx) {
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
        (0, response_1.success)(ctx, data);
    }
}
exports.NewspaperController = NewspaperController;
//# sourceMappingURL=NewspaperController.js.map