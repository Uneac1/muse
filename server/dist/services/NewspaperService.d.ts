import type { NewspaperArticleDetail, NewspaperBriefing } from '../types';
interface ArticleSeed {
    url: string;
    source?: string;
    sourceUrl?: string;
    publishedAt?: string | null;
    title?: string;
    titleZh?: string;
    summary?: string;
    summaryZh?: string;
}
export declare class NewspaperService {
    private cache;
    private cacheExpiresAt;
    private inflight;
    private sourceCache;
    private translationCache;
    private detailCache;
    getBriefing(options?: {
        refresh?: boolean;
        limit?: number;
    }): Promise<NewspaperBriefing>;
    private warmBriefingInBackground;
    getArticleDetail(seed: ArticleSeed): Promise<NewspaperArticleDetail>;
    private buildFallbackArticleDetail;
    private sliceBriefing;
    private buildBriefing;
    private buildSection;
    private deduplicateItems;
    private fetchSourceItems;
    private fetchSourceXml;
    private shouldUseWindowsFeedFallback;
    private fetchFeedViaPowerShell;
    private parseFeed;
    private scoreArticle;
    private translateArticles;
    private translateArticlesFast;
    private fastTranslateText;
    private translateLongText;
    private translateText;
    private translateTextDetailed;
    private translateWithGoogleApi;
    private translateViaPowerShell;
    private pickChineseDisplayText;
    private localizeText;
    private localizeKeyword;
    private looksChinese;
    private extractBlocks;
    private extractTag;
    private extractLink;
    private normalizeDate;
    private extractDomain;
    private firstNonEmpty;
    private stripTags;
    private decodeEntities;
    private fetchArticleHtml;
    private extractMetaContent;
    private extractReadableContent;
    private extractElementsByTag;
    private extractElementsByClassHint;
    private htmlToText;
    private cleanArticleText;
    private chunkText;
    private escapeRegExp;
}
export {};
//# sourceMappingURL=NewspaperService.d.ts.map