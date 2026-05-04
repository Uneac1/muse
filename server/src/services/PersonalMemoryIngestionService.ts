import db from '../database';
import { config } from '../config';
import { AiAccountModel } from '../models/AiChat';
import { IntegrationTokenModel } from '../models/IntegrationToken';
import { PersonalMemoryModel } from '../models/PersonalOS';
import type { AiAccount, AiMessage, MiSubIntegrationData, NotionIntegrationData, NotionPageSummary, NotionReadableBlock, PersonalMemoryIngestionConfig, PersonalMemoryIngestionRun, PersonalMemoryIngestionState, PersonalMemoryView, YmailIntegrationData } from '../types';
import logger from '../utils/logger';
import { IntegrationService } from './IntegrationService';
import { PersonalOSService } from './PersonalOSService';
import { YmailService } from './YmailService';

const aiAccountModel = new AiAccountModel();
const integrationTokenModel = new IntegrationTokenModel();
const memoryModel = new PersonalMemoryModel();
const integrationService = new IntegrationService();
const ymailService = new YmailService();
const osService = new PersonalOSService();

type MemoryCandidate = {
  title: string;
  content: string;
  kind: PersonalMemoryView['kind'];
  tags: string[];
  source: string;
  entity_type: string;
  entity_key: string;
  is_pinned?: number;
};

function addHours(hours: number) {
  return new Date(Date.now() + Math.max(1, Math.min(168, Math.floor(Number(hours) || 6))) * 60 * 60 * 1000).toISOString();
}

function readJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function stripPunctuation(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

function clipText(value: string, limit: number) {
  const normalized = normalizeText(value);
  return normalized.length > limit ? `${normalized.slice(0, Math.max(1, limit - 1))}…` : normalized;
}

function parseJsonLoose<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    }
    throw new Error('invalid ai json');
  }
}

type NotionPageDraft = {
  page: NotionPageSummary;
  text: string;
  propertyHints: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export class PersonalMemoryIngestionService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private aiChatService: any = null;

  ensureConfig(): PersonalMemoryIngestionConfig {
    this.markStaleRunsFailed();
    const existing = db.prepare('SELECT * FROM personal_memory_ingestion_config WHERE id = 1').get() as any;
    if (!existing) {
      db.prepare(`
        INSERT INTO personal_memory_ingestion_config (id, enabled, account_id, interval_hours, focus, next_run_at)
        VALUES (1, 1, NULL, 6, ?, ?)
      `).run('记忆库优先沉淀 Notion 文章提炼，其次记录我的操作习惯和 Muse 的关键改动；其他来源只保留会长期复用的上下文。', addHours(6));
      return this.ensureConfig();
    }

    return {
      enabled: !!existing.enabled,
      accountId: existing.account_id ?? null,
      intervalHours: Number(existing.interval_hours || 6),
      focus: existing.focus || '',
      lastRunAt: existing.last_run_at || null,
      nextRunAt: existing.next_run_at || null,
      updatedAt: existing.updated_at || null,
    };
  }

  updateConfig(input: Partial<PersonalMemoryIngestionConfig>): PersonalMemoryIngestionState {
    const current = this.ensureConfig();
    const intervalHours = Math.max(1, Math.min(168, Math.floor(Number(input.intervalHours ?? current.intervalHours) || 6)));
    const enabled = input.enabled ?? current.enabled;
    const accountId = input.accountId === undefined ? current.accountId : (input.accountId ? Number(input.accountId) : null);
    const focus = String(input.focus ?? current.focus ?? '').trim();
    const nextRunAt = enabled ? addHours(intervalHours) : current.nextRunAt;

    db.prepare(`
      UPDATE personal_memory_ingestion_config
      SET enabled = ?, account_id = ?, interval_hours = ?, focus = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(enabled ? 1 : 0, accountId, intervalHours, focus, nextRunAt);

    return this.getState();
  }

  listRuns(limit = 10): PersonalMemoryIngestionRun[] {
    return db.prepare('SELECT * FROM personal_memory_ingestion_runs ORDER BY started_at DESC, id DESC LIMIT ?').all(limit).map((row: any) => ({
      id: row.id,
      status: row.status,
      accountId: row.account_id ?? null,
      mode: row.mode || 'heuristic',
      focus: row.focus || '',
      summary: row.summary || '',
      sources: readJsonArray(row.sources_json),
      createdCount: Number(row.created_count || 0),
      updatedCount: Number(row.updated_count || 0),
      resolvedCount: Number(row.resolved_count || 0),
      error: row.error || '',
      startedAt: row.started_at,
      finishedAt: row.finished_at || null,
    }));
  }

  getState(): PersonalMemoryIngestionState {
    return {
      config: this.ensureConfig(),
      latestRun: this.listRuns(1)[0] || null,
      history: this.listRuns(10),
      running: this.running,
    };
  }

  private createRun(accountId: number | null, focus: string) {
    const result = db.prepare('INSERT INTO personal_memory_ingestion_runs (status, account_id, focus) VALUES (?, ?, ?)').run('success', accountId, focus);
    return Number(result.lastInsertRowid);
  }

  private markStaleRunsFailed() {
    db.prepare(`
      UPDATE personal_memory_ingestion_runs
      SET status = 'failed',
          summary = CASE WHEN summary = '' THEN '上次自动记忆抽取中断，已在下次读取状态时自动标记失败。' ELSE summary END,
          error = CASE WHEN error = '' THEN 'run interrupted before finish' ELSE error END,
          finished_at = CURRENT_TIMESTAMP
      WHERE finished_at IS NULL
        AND started_at < DATETIME('now', '-5 minutes')
    `).run();
  }

  private finishRun(id: number, payload: {
    status: PersonalMemoryIngestionRun['status'];
    mode?: PersonalMemoryIngestionRun['mode'];
    summary?: string;
    sources?: string[];
    createdCount?: number;
    updatedCount?: number;
    resolvedCount?: number;
    error?: string;
  }) {
    db.prepare(`
      UPDATE personal_memory_ingestion_runs
      SET status = ?, mode = ?, summary = ?, sources_json = ?, created_count = ?, updated_count = ?, resolved_count = ?, error = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.status,
      payload.mode || 'heuristic',
      payload.summary || '',
      JSON.stringify(payload.sources || []),
      payload.createdCount || 0,
      payload.updatedCount || 0,
      payload.resolvedCount || 0,
      payload.error || '',
      id
    );
  }

  private dedupeTags(tags: string[]) {
    return [...new Set(tags.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
  }

  private buildCandidateKey(item: Pick<MemoryCandidate, 'source' | 'entity_type' | 'entity_key'>) {
    return `${item.source}:${item.entity_type}:${item.entity_key}`;
  }

  private pickExistingMemory(candidate: MemoryCandidate, memory: PersonalMemoryView[]) {
    return memory.find((item) =>
      item.source === candidate.source
      && item.entity_type === candidate.entity_type
      && item.entity_key === candidate.entity_key
    );
  }

  private async loadYmailIntegration(): Promise<YmailIntegrationData | null> {
    const record = integrationTokenModel.get('ymail') || (config.defaultYmailAdminPassword
      ? {
          provider: 'ymail' as const,
          token: config.defaultYmailAdminPassword,
          updated_at: new Date().toISOString(),
        }
      : null);

    if (!record) return null;
    try {
      return await withTimeout(ymailService.fetchIntegrationData(record), 1500, 'Ymail integration');
    } catch (error: any) {
      logger.warn(`Memory ingestion could not load Ymail: ${error.message || error}`);
      return null;
    }
  }

  private async loadMiSubIntegration(): Promise<MiSubIntegrationData | null> {
    const record = integrationTokenModel.get('misub');
    if (!record) return null;
    try {
      return await withTimeout(integrationService.fetchMiSubData(record), 1500, 'MiSub integration');
    } catch (error: any) {
      logger.warn(`Memory ingestion could not load MiSub: ${error.message || error}`);
      return null;
    }
  }

  private async loadNotionIntegration(): Promise<NotionIntegrationData | null> {
    const record = integrationTokenModel.get('notion') || (config.defaultNotionToken
      ? {
          provider: 'notion' as const,
          token: config.defaultNotionToken,
          updated_at: new Date().toISOString(),
        }
      : null);

    if (!record) return null;
    try {
      return await withTimeout(integrationService.fetchNotionData(record), 1500, 'Notion integration');
    } catch (error: any) {
      logger.warn(`Memory ingestion could not load Notion: ${error.message || error}`);
      return null;
    }
  }

  private summarizeNotionBlocks(blocks: NotionReadableBlock[], limit = 3) {
    const snippets: string[] = [];
    const visit = (items: NotionReadableBlock[]) => {
      for (const item of items) {
        const text = normalizeText(String(item.text || ''));
        if (text) snippets.push(text);
        if (snippets.length >= limit) return;
        if (item.children?.length) visit(item.children);
        if (snippets.length >= limit) return;
      }
    };

    visit(blocks);
    return snippets.slice(0, limit).join(' / ');
  }

  private getAiChatService() {
    if (!this.aiChatService) {
      const { AiChatService } = require('./AiChatService') as { AiChatService: new () => any };
      this.aiChatService = new AiChatService();
    }
    return this.aiChatService;
  }

  private getHealthyAiAccounts() {
    return aiAccountModel.list()
      .filter((item) =>
        item.status !== 'inactive'
        && item.last_test_status === 'success'
        && (item.api_key || item.auth_mode === 'google_oauth')
      )
      .sort((a, b) => (a.priority_rank ?? Number.MAX_SAFE_INTEGER) - (b.priority_rank ?? Number.MAX_SAFE_INTEGER));
  }

  private pickAiAccount(accountId?: number | null) {
    const healthy = this.getHealthyAiAccounts();
    if (!accountId) return healthy[0] || null;
    return healthy.find((item) => item.id === Number(accountId)) || healthy[0] || null;
  }

  private summarizeNotionBlocksForAi(blocks: NotionReadableBlock[], limit = 18) {
    const snippets: string[] = [];
    const visit = (items: NotionReadableBlock[]) => {
      for (const item of items) {
        const text = normalizeText(String(item.text || ''));
        if (text) snippets.push(text);
        if (snippets.length >= limit) return;
        if (item.children?.length) visit(item.children);
        if (snippets.length >= limit) return;
      }
    };

    visit(blocks);
    return snippets.slice(0, limit).join('\n');
  }

  private async buildNotionDrafts(notion: NotionIntegrationData, notionRecord: { token: string }) {
    const drafts: NotionPageDraft[] = [];
    const selectedPages = [...notion.pages]
      .sort((a, b) => new Date(b.last_edited_time || 0).getTime() - new Date(a.last_edited_time || 0).getTime())
      .sort((a, b) => {
        const score = (title: string) => /muse|workflow|memory|today|inbox|规则|自动|发布|迭代|版本/i.test(title || '') ? 1 : 0;
        return score(b.title || '') - score(a.title || '');
      });

    const concurrency = 4;
    for (let index = 0; index < selectedPages.length; index += concurrency) {
      const chunk = selectedPages.slice(index, index + concurrency);
      const results = await Promise.all(chunk.map(async (page) => {
        let text = '';
        try {
          const pageContent = await withTimeout(
            integrationService.fetchNotionPageContent(notionRecord as any, page.id),
            3000,
            `Notion page ${page.id}`
          );
          text = this.summarizeNotionBlocksForAi(pageContent.blocks, 18);
        } catch (error: any) {
          logger.warn(`Memory ingestion could not load Notion page ${page.id}: ${error.message || error}`);
        }

        const propertyHints = Object.entries(page.propertiesPreview || {})
          .slice(0, 4)
          .map(([key, value]) => `${key}:${String(value)}`)
          .join(' / ');

        const draft = {
          page,
          text: text || `页面《${page.title}》暂无可提炼正文，保留标题和属性。`,
          propertyHints,
        };

        return this.shouldKeepNotionDraft(draft) ? draft : null;
      }));

      drafts.push(...results.filter((item): item is NotionPageDraft => !!item));
    }

    return drafts;
  }

  private cleanNotionTitle(title: string) {
    const normalized = normalizeText(title)
      .replace(/^Notion 提炼：/i, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/复制打开抖音，看看/gi, '')
      .replace(/\b[A-Z]{2,5}:\/\s*\d{2}\/\d{2}.*$/i, '')
      .replace(/[|｜]+/g, ' ')
      .trim();
    return clipText(normalized || '未命名页面', 40);
  }

  private isGenericNotionTitle(title: string) {
    const cleaned = this.cleanNotionTitle(title);
    const compact = cleaned.replace(/\s+/g, '');
    if (!compact) return true;
    if (/^untitled page$/i.test(cleaned)) return true;
    if (/^[A-Z][A-Z0-9_-]{2,24}$/.test(cleaned)) return true;
    if (/^(title|font|font_style|inline_config|can_copy|contact_email|phone_number|description|theme|color|icon|cover)$/i.test(cleaned)) return true;
    if (/^\d{1,6}$/.test(compact)) return true;
    if (/^\d+(\.\d+)?$/.test(compact)) return true;
    return false;
  }

  private isLowSignalNotionText(text: string) {
    const normalized = normalizeText(text);
    if (!normalized) return true;
    if (normalized.includes('暂无可提炼正文')) return true;
    if (/^\[?(sync-block|table|column|callout|toggle)/i.test(normalized)) return true;
    const sentenceCount = this.getNotionSentences(normalized, 6).length;
    if (sentenceCount === 0 && normalized.length < 24) return true;
    return false;
  }

  private shouldKeepNotionDraft(draft: NotionPageDraft) {
    const pool = `${draft.page.title} ${draft.propertyHints} ${draft.text}`;
    const strategic = /muse|workflow|memory|today|inbox|规则|自动|发布|迭代|版本|产品|习惯|流程/i.test(pool);
    if (strategic) return true;
    if (this.isGenericNotionTitle(draft.page.title)) return false;
    if (this.isLowSignalNotionText(draft.text)) return false;
    if (this.cleanNotionTitle(draft.page.title).length < 4) return false;
    if (this.getNotionSentences(draft.text, 4).length < 2) return false;
    return true;
  }

  private getNotionSentences(text: string, limit = 4) {
    return text
      .split(/[\n。！？!?\r；;]+/)
      .map((item) => normalizeText(item))
      .filter((item) => item && item.length >= 6 && !this.isMessyNotionSentence(item))
      .slice(0, limit);
  }

  private classifyNotionPageType(draft: NotionPageDraft, sentences: string[]) {
    const cleanedTitle = this.cleanNotionTitle(draft.page.title);
    const compact = cleanedTitle.replace(/\s+/g, '');
    const pool = `${cleanedTitle} ${draft.propertyHints} ${sentences.join(' ')}`;
    if (/^\d+$/.test(compact) || /^untitled page$/i.test(cleanedTitle) || compact.length < 3) return 'weak';
    if (/梦|昨天|今天|醒来|睡|回到了小时候|又遇到你/.test(pool)) return 'journal';
    if (/“|”|摘录|引用|说过|我说|她说|他说|问我/.test(pool)) return 'excerpt';
    if (sentences.length <= 1) return 'short';
    return 'article';
  }

  private inferNotionRelation(draft: NotionPageDraft) {
    const pool = `${draft.page.title} ${draft.propertyHints} ${draft.text}`.toLowerCase();
    if (/muse|改动|迭代|版本|功能|产品|today|inbox|memory|workflow|规则|自动/.test(pool)) {
      return '这条记忆偏向 Muse 改动或产品判断，后续改版时可直接复用。';
    }
    if (/习惯|偏好|流程|步骤|操作|工作流|自动化/.test(pool)) {
      return '这条记忆偏向你的操作习惯或工作流，可作为后续执行默认项。';
    }
    return '这条记忆属于 Notion 文章观点沉淀，后续检索时应优先作为文章摘要使用。';
  }

  private isMessyNotionSentence(text: string) {
    const normalized = normalizeText(text);
    if (!normalized) return true;
    if (/https?:\/\//i.test(normalized)) return true;
    if (/复制打开抖音|图文作品|极速版|作品】|v\.douyin\.com/i.test(normalized)) return true;
    if (/\[?(sync-block|table|column|callout|toggle)/i.test(normalized)) return true;
    if ((normalized.match(/[0-9]/g) || []).length >= 12) return true;
    if ((normalized.match(/[a-z]{1,4}\d{4,}/gi) || []).length >= 2) return true;
    if ((normalized.match(/[【】[\]{}<>]/g) || []).length >= 4) return true;
    return false;
  }

  private buildStructuredNotionContent(draft: NotionPageDraft, input?: {
    core?: string;
    action?: string;
    relation?: string;
  }) {
    const sentences = this.getNotionSentences(draft.text, 4);
    const cleanedTitle = this.cleanNotionTitle(draft.page.title);
    const pageType = this.classifyNotionPageType(draft, sentences);
    const fallbackCore = pageType === 'weak'
      ? '这是一条标题信息较弱的 Notion 页面，当前先保留为待补充文章记忆。'
      : pageType === 'journal'
        ? clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》的日常记录。`, 56)
        : pageType === 'excerpt'
          ? clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》保留的摘录或引用。`, 56)
          : pageType === 'short'
            ? clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》的短记。`, 56)
            : (sentences[0]
                ? clipText(sentences[0], 56)
                : `这篇文章主要围绕《${cleanedTitle}》展开，当前先保留为可回看的文章线索。`);
    const actionSentence = sentences.find((item) => /建议|应该|可以|先|再|步骤|方法|做法|需要|适合|用于/.test(item));
    const fallbackAction = actionSentence
      ? clipText(actionSentence, 56)
      : pageType === 'weak'
        ? '后续应补全原文信息，再决定是否保留为长期记忆。'
        : pageType === 'journal'
          ? '后续可结合时间线或上下文，把这条记录补成更完整的经历记忆。'
          : pageType === 'excerpt'
            ? '后续可补上这段摘录为什么重要，以及你准备怎么用它。'
            : pageType === 'short'
              ? `后续可围绕《${clipText(cleanedTitle, 24)}》补充背景、结论和下一步。`
              : `后续可围绕《${clipText(cleanedTitle, 24)}》继续补充要点、动作和判断。`;
    const fallbackRelation = this.inferNotionRelation(draft);

    const core = clipText(input?.core || fallbackCore, 64);
    const action = clipText(input?.action || fallbackAction, 64);
    const relation = clipText(input?.relation || fallbackRelation, 72);

    return `核心观点：${core} 可执行点：${action} 关联：${relation}`;
  }

  private parseStructuredNotionContent(raw: string) {
    const content = normalizeText(raw);
    const core = content.match(/核心观点[:：]\s*(.+?)(?=可执行点[:：]|关联[:：]|$)/)?.[1]?.trim() || '';
    const action = content.match(/可执行点[:：]\s*(.+?)(?=关联[:：]|$)/)?.[1]?.trim() || '';
    const relation = content.match(/关联[:：]\s*(.+?)$/)?.[1]?.trim() || '';
    return { core, action, relation };
  }

  private heuristicNotionCandidate(draft: NotionPageDraft): MemoryCandidate {
    const relation = draft.propertyHints
      ? `${this.inferNotionRelation(draft)} 属性线索：${clipText(draft.propertyHints, 42)}`
      : this.inferNotionRelation(draft);
    return {
      title: `Notion 提炼：${this.cleanNotionTitle(draft.page.title)}`,
      content: this.buildStructuredNotionContent(draft, { relation }),
      kind: /muse|改动|迭代|版本|workflow|today|inbox|规则|自动/i.test(`${draft.page.title} ${draft.text}`) ? 'project' : 'note',
      tags: this.dedupeTags(['notion', 'article', 'extract', 'memory']),
      source: 'auto:notion',
      entity_type: 'notion_page',
      entity_key: draft.page.id,
      is_pinned: 1,
    };
  }

  private normalizeAiNotionCandidate(input: any, fallback: NotionPageDraft): MemoryCandidate {
    const title = `Notion 提炼：${this.cleanNotionTitle(String(input?.title || fallback.page.title || '未命名页面'))}`;
    const parsedContent = this.parseStructuredNotionContent(String(input?.content || ''));
    const content = this.buildStructuredNotionContent(fallback, parsedContent);
    const kind = ['note', 'project', 'risk', 'preference'].includes(String(input?.kind)) ? input.kind as PersonalMemoryView['kind'] : this.heuristicNotionCandidate(fallback).kind;
    const tags = this.dedupeTags(
      Array.isArray(input?.tags)
        ? input.tags.map((item: any) => String(item))
        : ['notion', 'article', 'extract']
    );

    return {
      title,
      content,
      kind,
      tags,
      source: 'auto:notion',
      entity_type: 'notion_page',
      entity_key: fallback.page.id,
      is_pinned: input?.is_pinned ? 1 : 1,
    };
  }

  private isLowQualityNotionExtraction(candidate: MemoryCandidate, draft: NotionPageDraft) {
    const content = normalizeText(candidate.content);
    const source = normalizeText(draft.text);
    if (!content) return true;

    if (content.length > 260) return true;
    if (!/核心观点[:：].+可执行点[:：].+关联[:：]/.test(content)) return true;

    const normalizedContent = stripPunctuation(content);
    const normalizedSource = stripPunctuation(source);

    if (normalizedContent && normalizedSource.includes(normalizedContent) && normalizedContent.length >= 40) {
      return true;
    }

    if (normalizedContent && normalizedSource) {
      const overlap = normalizedContent
        .split('')
        .filter((char) => normalizedSource.includes(char))
        .length;
      const ratio = overlap / Math.max(normalizedContent.length, 1);
      if (ratio > 0.92 && normalizedContent.length >= 50) {
        return true;
      }
    }

    return /已纳入记忆库|保留标题和属性|暂无可提炼正文|文章提炼[:：]/.test(content);
  }

  private async buildNotionCandidatesWithAi(drafts: NotionPageDraft[], account: AiAccount) {
    const results: MemoryCandidate[] = [];
    const batchSize = 5;

    for (let index = 0; index < drafts.length; index += batchSize) {
      const chunk = drafts.slice(index, index + batchSize);
      const history: AiMessage[] = [
        {
          id: 0,
          thread_id: 0,
          role: 'user',
          content: [
            '请把以下 Notion 文章页面提炼成记忆库条目。',
            '返回 JSON：{"items":[{"pageId":"...","title":"...","content":"...","kind":"note|project|risk|preference","tags":["..."],"is_pinned":1}]}',
            '要求：每个页面都必须返回一条；优先提炼核心观点、方法、操作习惯或 Muse 改动；不要输出 markdown。',
            '禁止大段复述原文，禁止直接复制句子；content 必须严格输出为单行结构：核心观点：... 可执行点：... 关联：...',
            '核心观点聚焦文章真正要表达的判断；可执行点写成后续可以怎么做；关联说明它和 Notion 文章、操作习惯或 Muse 改动的关系。整条控制在 60-180 个中文字符。',
            JSON.stringify(chunk.map((item) => ({
              pageId: item.page.id,
              title: item.page.title,
              propertyHints: item.propertyHints,
              text: item.text.slice(0, 5000),
            }))),
          ].join('\n\n'),
          created_at: new Date().toISOString(),
        },
      ];

      const raw = await this.getAiChatService().sendMessage({
        ...account,
        system_prompt: [
          account.system_prompt?.trim() || '',
          '你负责把 Notion 文章提炼为 Memory 条目。记忆库主要保存：Notion 文章提炼、用户操作习惯、Muse 改动。',
        ].filter(Boolean).join('\n\n'),
      }, history);

      const parsed = parseJsonLoose<{ items?: any[] }>(raw);
      const byId = new Map(chunk.map((item) => [item.page.id, item]));
      const normalized = Array.isArray(parsed?.items) ? parsed.items : [];

      for (const item of normalized) {
        const fallback = byId.get(String(item?.pageId || ''));
        if (!fallback) continue;
        const candidate = this.normalizeAiNotionCandidate(item, fallback);
        results.push(this.isLowQualityNotionExtraction(candidate, fallback)
          ? this.heuristicNotionCandidate(fallback)
          : candidate);
        byId.delete(fallback.page.id);
      }

      for (const draft of byId.values()) {
        results.push(this.heuristicNotionCandidate(draft));
      }
    }

    return results;
  }

  private async buildCandidates() {
    const workspace = await osService.getWorkspace();
    const [notion, ymail, misub] = await Promise.all([
      this.loadNotionIntegration(),
      this.loadYmailIntegration(),
      this.loadMiSubIntegration(),
    ]);
    const candidates: MemoryCandidate[] = [];

    const notionRecord = integrationTokenModel.get('notion') || (config.defaultNotionToken
      ? {
          provider: 'notion' as const,
          token: config.defaultNotionToken,
          updated_at: new Date().toISOString(),
        }
      : null);

    if (notion && notionRecord) {
      const notionDrafts = await this.buildNotionDrafts(notion, notionRecord);
      candidates.push(...notionDrafts.map((item) => this.heuristicNotionCandidate(item)));
    }

    for (const item of workspace.inbox
      .filter((entry) => (entry.severity === 'critical' || entry.severity === 'high') && entry.source !== 'memory')
      .slice(0, 8)) {
      candidates.push({
          title: item.title,
          content: `${item.summary} 下一步：${item.actionLabel}（${item.actionPath}）`,
          kind: item.severity === 'critical' ? 'risk' : 'project',
          tags: this.dedupeTags([item.source, item.entityType, item.severity, 'habit']),
          source: `auto:${item.source}`,
          entity_type: item.entityType || 'inbox',
          entity_key: item.entityKey || item.id,
          is_pinned: item.severity === 'critical' ? 1 : 0,
        });
    }

    for (const item of workspace.inbox
      .filter((entry) =>
        entry.source !== 'memory'
        && ['notion', 'github', 'news', 'ai', 'tokens'].includes(entry.source)
        && ['critical', 'high', 'medium'].includes(entry.severity)
      )
      .slice(0, 10)) {
      candidates.push({
        title: `${item.source.toUpperCase()} 变化：${item.title}`,
        content: `${item.summary} 下一步：${item.actionLabel}（${item.actionPath}）`,
        kind: item.source === 'ai' || item.severity === 'high' || item.severity === 'critical'
          ? 'risk'
          : item.source === 'notion'
            ? 'note'
            : 'project',
        tags: this.dedupeTags([item.source, item.entityType, item.severity, 'context']),
        source: `auto:${item.source}`,
        entity_type: item.entityType || 'inbox',
        entity_key: `${item.entityKey || item.id}:context`,
        is_pinned: item.source === 'notion' || item.source === 'ai' ? 1 : 0,
      });
    }

    if (ymail) {
      for (const address of [...ymail.addresses]
        .filter((item) => Number(item.mail_count || 0) > 0)
        .sort((a, b) => Number(b.mail_count || 0) - Number(a.mail_count || 0))
        .slice(0, 4)) {
        candidates.push({
          title: `Ymail 地址活跃：${address.address || address.name}`,
          content: `这个临时邮箱当前累计 ${Number(address.mail_count || 0)} 封收件，适合作为正在使用的验证入口或注册上下文保留。`,
          kind: 'project',
          tags: this.dedupeTags(['ymail', 'temp-mail', 'auto']),
          source: 'auto:ymail',
          entity_type: 'ymail_address',
          entity_key: String(address.id),
        });
      }
    }

    const linuxdoRecord = integrationTokenModel.get('linuxdo');
    if (linuxdoRecord) {
      try {
        const linuxdo = await integrationService.fetchLinuxDoData(linuxdoRecord);
        if (linuxdo.connected && linuxdo.user) {
          candidates.push({
            title: `Linux.do 身份：@${linuxdo.user.username}`,
            content: `当前 Linux.do 已接入，账号信任等级 TL${linuxdo.user.trust_level}。这个身份可用于社区反馈、内容发布和上下文联动。`,
            kind: 'preference',
            tags: this.dedupeTags(['linuxdo', 'identity', 'community', 'auto']),
            source: 'auto:linuxdo',
            entity_type: 'linuxdo_user',
            entity_key: String(linuxdo.user.id),
          });
        }
      } catch (error: any) {
        logger.warn(`Memory ingestion could not load Linux.do: ${error.message || error}`);
      }
    }

    if (misub) {
      const now = Date.now();
      for (const subscription of misub.misubs.filter((item) => {
        const expire = Number(item.userInfo?.expire || 0);
        if (!Number.isFinite(expire) || expire <= 0) return false;
        const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
        return expiresAt - now <= 7 * 24 * 60 * 60 * 1000;
      }).slice(0, 4)) {
        const expire = Number(subscription.userInfo?.expire || 0);
        const expiresAt = expire > 10_000_000_000 ? expire : expire * 1000;
        const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
        candidates.push({
          title: `订阅到期提醒：${subscription.name || subscription.url}`,
          content: daysLeft < 0 ? `该订阅已过期 ${Math.abs(daysLeft)} 天。` : `该订阅将在 ${Math.max(daysLeft, 0)} 天内到期，建议提前续费或迁移。`,
          kind: 'risk',
          tags: this.dedupeTags(['misub', 'subscription', 'expiry', 'auto']),
          source: 'auto:misub',
          entity_type: 'subscription',
          entity_key: subscription.id || subscription.url,
          is_pinned: 1,
        });
      }
    }

    for (const memory of workspace.memory
      .filter((item) => item.source === 'manual' && /习惯|偏好|不要|优先|流程|Muse/i.test(`${item.title} ${item.content}`))
      .slice(0, 4)) {
      candidates.push({
        title: `操作习惯：${memory.title}`,
        content: memory.content,
        kind: memory.kind === 'risk' ? 'risk' : 'preference',
        tags: this.dedupeTags([...memory.tags, 'habit', 'manual-memory']),
        source: 'auto:habit',
        entity_type: 'habit',
        entity_key: String(memory.id),
        is_pinned: memory.is_pinned ? 1 : 0,
      });
    }

    return candidates;
  }

  private applyHeuristics(memory: PersonalMemoryView[], candidates: MemoryCandidate[]) {
    let createdCount = 0;
    let updatedCount = 0;
    let resolvedCount = 0;
    const candidateKeys = new Set(candidates.map((item) => this.buildCandidateKey(item)));

    for (const candidate of candidates) {
      const existing = this.pickExistingMemory(candidate, memory);
      const nextTitle = normalizeText(candidate.title);
      const nextContent = normalizeText(candidate.content);
      const nextTags = this.dedupeTags(candidate.tags);

      if (!existing) {
        memoryModel.create({
          title: nextTitle,
          content: nextContent,
          kind: candidate.kind,
          tags: nextTags,
          source: candidate.source,
          entity_type: candidate.entity_type,
          entity_key: candidate.entity_key,
          is_pinned: candidate.is_pinned ?? 0,
          is_resolved: 0,
          last_reviewed_at: new Date().toISOString(),
        });
        createdCount += 1;
        continue;
      }

      const currentTags = this.dedupeTags(existing.tags || []);
      const changed =
        normalizeText(existing.title) !== nextTitle
        || normalizeText(existing.content) !== nextContent
        || JSON.stringify(currentTags) !== JSON.stringify(nextTags)
        || Number(existing.is_pinned || 0) !== Number(candidate.is_pinned ?? existing.is_pinned ?? 0)
        || Number(existing.is_resolved || 0) !== 0;

      if (changed) {
        memoryModel.update(existing.id, {
          title: nextTitle,
          content: nextContent,
          kind: candidate.kind,
          tags: nextTags,
          is_pinned: candidate.is_pinned ?? existing.is_pinned ?? 0,
          is_resolved: 0,
          last_reviewed_at: new Date().toISOString(),
        });
        updatedCount += 1;
      }
    }

    for (const item of memory.filter((entry) => entry.source.startsWith('auto:') && !entry.is_resolved)) {
      const key = this.buildCandidateKey({ source: item.source, entity_type: item.entity_type, entity_key: item.entity_key });
      if (!candidateKeys.has(key)) {
        memoryModel.update(item.id, {
          is_resolved: 1,
          is_pinned: 0,
          last_reviewed_at: new Date().toISOString(),
        });
        resolvedCount += 1;
      }
    }

    return { createdCount, updatedCount, resolvedCount };
  }

  async runNow(options?: { force?: boolean }) {
    if (this.running) return this.getState();
    const cfg = this.ensureConfig();
    if (!options?.force && !cfg.enabled) return this.getState();

    const runId = this.createRun(cfg.accountId, cfg.focus);
    this.running = true;
    try {
      const before = memoryModel.list();
      const candidates = await this.buildCandidates();
      const heuristic = this.applyHeuristics(before, candidates);
      osService.invalidateWorkspace();

      let mode: PersonalMemoryIngestionRun['mode'] = 'heuristic';
      let summary = `已自动摄取 ${candidates.length} 个候选源，新增 ${heuristic.createdCount} 条、更新 ${heuristic.updatedCount} 条、归档 ${heuristic.resolvedCount} 条。`;
      let error = '';

      const selectedAiAccount = cfg.accountId ? aiAccountModel.getById(cfg.accountId) : null;
      const hasHealthyAiAccount = selectedAiAccount
        ? selectedAiAccount.status !== 'inactive'
          && selectedAiAccount.last_test_status === 'success'
          && (selectedAiAccount.api_key || selectedAiAccount.auth_mode === 'google_oauth')
        : aiAccountModel.list().some((item) =>
            item.status !== 'inactive'
            && item.last_test_status === 'success'
            && (item.api_key || item.auth_mode === 'google_oauth')
          );

      if (hasHealthyAiAccount) {
        try {
          const plan = await withTimeout(
            osService.planMemoryWithAi({
              accountId: cfg.accountId ?? undefined,
              focus: [cfg.focus, '优先整理 source 以 auto: 开头的记忆，合并重复项并把值得长期保留的内容置顶。'].filter(Boolean).join('\n'),
            }),
            5000,
            'Memory AI refinement'
          );
          const result = osService.applyMemoryAiPlan({ suggestions: plan.suggestions });
          osService.invalidateWorkspace();
          mode = 'ai';
          summary = `${summary} AI 又补充整理了 ${result.applied} 条建议。`;
        } catch (aiError: any) {
          error = aiError.message || 'AI 整理失败';
          summary = `${summary} AI 整理未执行成功，已保留启发式结果。`;
        }
      } else {
        summary = `${summary} 未发现最近诊断成功的 AI 账号，已跳过 AI 精修以避免后台超时。`;
      }

      this.finishRun(runId, {
        status: 'success',
        mode,
        summary,
        sources: [...new Set(candidates.map((item) => item.source.replace(/^auto:/, '')))],
        createdCount: heuristic.createdCount,
        updatedCount: heuristic.updatedCount,
        resolvedCount: heuristic.resolvedCount,
        error,
      });
      db.prepare('UPDATE personal_memory_ingestion_config SET last_run_at = CURRENT_TIMESTAMP, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(addHours(cfg.intervalHours));
    } catch (error: any) {
      this.finishRun(runId, {
        status: 'failed',
        summary: '本轮自动记忆摄取失败。',
        error: error.message || 'Memory ingestion failed',
      });
      db.prepare('UPDATE personal_memory_ingestion_config SET last_run_at = CURRENT_TIMESTAMP, next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(addHours(cfg.intervalHours));
      throw error;
    } finally {
      this.running = false;
    }

    return this.getState();
  }

  start() {
    if (this.timer) return;
    this.ensureConfig();
    this.timer = setInterval(() => {
      const cfg = this.ensureConfig();
      if (!cfg.enabled || !cfg.nextRunAt || this.running) return;
      if (new Date(cfg.nextRunAt).getTime() > Date.now()) return;
      this.runNow().catch((error) => logger.warn(`Personal memory ingestion failed: ${error.message || error}`));
    }, 60 * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const personalMemoryIngestionService = new PersonalMemoryIngestionService();
