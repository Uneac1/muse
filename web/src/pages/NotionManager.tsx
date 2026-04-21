import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookOpen,
  Database,
  Edit3,
  ExternalLink,
  FileText,
  Layers3,
  NotebookPen,
  RefreshCw,
  Save,
  Search,
  Unplug,
  Users,
  X,
} from 'lucide-react';
import { integrationApi } from '../lib/api';
import { timeAgo } from '../lib/utils';
import type {
  NotionDatabaseContent,
  NotionDatabaseSummary,
  NotionInsights,
  NotionIntegrationData,
  NotionPageContent,
  NotionPageSummary,
  NotionReadableBlock,
} from '../types';

const emptyState: NotionIntegrationData = {
  connected: false,
  tokenMasked: '',
  lastSyncAt: null,
  bot: null,
  users: [],
  blocks: [],
  pages: [],
  databases: [],
  metrics: {
    pageCount: 0,
    databaseCount: 0,
    userCount: 0,
    archivedPageCount: 0,
    pageWithDatabaseParentCount: 0,
  },
};

const emptyInsights: NotionInsights = {
  totalBlocks: 0,
  blockTypeCounts: [],
  pageBlockCounts: [],
  recentEditedPages: [],
  sampledPages: 0,
};

function ResourceList({
  title,
  items,
  emptyText,
  kind,
  onOpenPage,
  onOpenDatabase,
  openingPageId,
  openingDatabaseId,
}: {
  title: string;
  items: Array<NotionPageSummary | NotionDatabaseSummary>;
  emptyText: string;
  kind: '页面' | '数据库';
  onOpenPage?: (page: NotionPageSummary) => void;
  onOpenDatabase?: (database: NotionDatabaseSummary) => void;
  openingPageId?: string | null;
  openingDatabaseId?: string | null;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{items.length} 条记录</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-background/40 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      {kind}
                    </span>
                    {item.parent?.type && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        {item.parent.type}
                      </span>
                    )}
                    {'archived' in item && item.archived && (
                      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-300">
                        archived
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    更新于 {new Date(item.last_edited_time).toLocaleString('zh-CN')}
                  </p>
                  {'propertiesPreview' in item && item.propertiesPreview && Object.keys(item.propertiesPreview).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(item.propertiesPreview).map(([key, value]) => (
                        <span key={key} className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {kind === '页面' && onOpenPage && (
                    <button
                      onClick={() => onOpenPage(item as NotionPageSummary)}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <BookOpen className="h-4 w-4" />
                      {openingPageId === item.id ? '读取中...' : '阅读'}
                    </button>
                  )}
                  {kind === '数据库' && onOpenDatabase && (
                    <button
                      onClick={() => onOpenDatabase(item as NotionDatabaseSummary)}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Database className="h-4 w-4" />
                      {openingDatabaseId === item.id ? '读取中...' : '查看条目'}
                    </button>
                  )}
                  <button
                    onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    打开 Notion
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function blockLabel(type: string) {
  const labels: Record<string, string> = {
    paragraph: '段落',
    heading_1: '标题 1',
    heading_2: '标题 2',
    heading_3: '标题 3',
    bulleted_list_item: '无序列表',
    numbered_list_item: '有序列表',
    to_do: '待办',
    toggle: '折叠',
    quote: '引用',
    callout: '提示',
    code: '代码',
    image: '图片',
    video: '视频',
    file: '文件',
    bookmark: '书签',
    child_page: '子页面',
    child_database: '子数据库',
    divider: '分割线',
  };
  return labels[type] || type;
}

const editableBlockTypes = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'quote',
  'callout',
  'code',
]);

function collectBlockChanges(blocks: NotionReadableBlock[], drafts: Record<string, string>) {
  const changes: { id: string; type: string; text: string }[] = [];
  const walk = (items: NotionReadableBlock[]) => {
    for (const block of items) {
      if (editableBlockTypes.has(block.type) && drafts[block.id] !== undefined && drafts[block.id] !== block.text) {
        changes.push({ id: block.id, type: block.type, text: drafts[block.id] });
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return changes;
}

function buildBlockDrafts(blocks: NotionReadableBlock[]) {
  const drafts: Record<string, string> = {};
  const walk = (items: NotionReadableBlock[]) => {
    for (const block of items) {
      if (editableBlockTypes.has(block.type)) drafts[block.id] = block.text;
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
  return drafts;
}

function renderBlock(
  block: NotionReadableBlock,
  depth = 0,
  editMode = false,
  drafts: Record<string, string> = {},
  onDraftChange?: (id: string, value: string) => void
) {
  const text = block.text || block.url || (block.has_children ? '包含子内容' : '');
  const isHeading = ['heading_1', 'heading_2', 'heading_3'].includes(block.type);
  const isCode = block.type === 'code';
  const isDivider = block.type === 'divider';
  const canEdit = editableBlockTypes.has(block.type);
  const draftText = drafts[block.id] ?? block.text;

  return (
    <div key={block.id} className={depth ? 'ml-4 border-l border-border pl-4' : ''}>
      <div className="rounded-2xl border border-border bg-background/55 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
            {blockLabel(block.type)}
          </span>
          {block.language && (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-600 dark:text-sky-300">
              {block.language}
            </span>
          )}
          {typeof block.checked === 'boolean' && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
              {block.checked ? '已完成' : '未完成'}
            </span>
          )}
        </div>
        {editMode && canEdit ? (
          <textarea
            value={draftText}
            onChange={(event) => onDraftChange?.(block.id, event.target.value)}
            rows={isCode ? 8 : Math.max(3, Math.min(10, draftText.split('\n').length + 1))}
            className={`w-full resize-y rounded-xl border border-border bg-background/80 p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${
              isCode ? 'font-mono' : ''
            }`}
            placeholder="输入 Notion 内容块文本"
          />
        ) : editMode && !canEdit && !isDivider ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-3 text-sm text-muted-foreground">
            这个 {blockLabel(block.type)} 块暂不支持在软件内编辑，请打开 Notion 原页面编辑。
          </div>
        ) : isDivider ? (
          <div className="my-3 h-px bg-border" />
        ) : isCode ? (
          <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">
            <code>{text || '// 空代码块'}</code>
          </pre>
        ) : (
          <p className={`${isHeading ? 'text-xl font-bold text-foreground' : 'whitespace-pre-wrap text-sm leading-6 text-foreground'}`}>
            {text || '空内容块'}
          </p>
        )}
        {block.url && block.url !== text && (
          <button
            onClick={() => window.open(block.url, '_blank', 'noopener,noreferrer')}
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            打开资源
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {block.children && block.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {block.children.map((child) => renderBlock(child, depth + 1, editMode, drafts, onDraftChange))}
        </div>
      )}
    </div>
  );
}

export default function NotionManager() {
  const [data, setData] = useState<NotionIntegrationData>(emptyState);
  const [insights, setInsights] = useState<NotionInsights>(emptyInsights);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resourceQuery, setResourceQuery] = useState('');
  const deferredQuery = useDeferredValue(resourceQuery);
  const [openingPageId, setOpeningPageId] = useState<string | null>(null);
  const [openingDatabaseId, setOpeningDatabaseId] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<NotionPageContent | null>(null);
  const [databaseContent, setDatabaseContent] = useState<NotionDatabaseContent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [blockDrafts, setBlockDrafts] = useState<Record<string, string>>({});
  const [articleDrawerOpen, setArticleDrawerOpen] = useState(false);

  const loadInsights = async () => {
    try {
      setInsightsLoading(true);
      setInsights(await integrationApi.getNotionInsights());
    } catch (err: any) {
      toast.error(err.message || '加载 Notion 洞察失败');
    } finally {
      setInsightsLoading(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const summary = await integrationApi.getNotion();
      setData(summary);
      if (summary.connected) {
        void loadInsights();
      } else {
        setInsights(emptyInsights);
      }
    } catch (err: any) {
      toast.error(err.message || '加载 Notion 信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    if (!token.trim()) {
      toast.error('请先输入 Notion integration token');
      return;
    }
    try {
      setSubmitting(true);
      const result = await integrationApi.connectNotion(token.trim());
      setData(result);
      setToken('');
      toast.success('Notion 已连接');
      void loadInsights();
    } catch (err: any) {
      toast.error(err.message || '连接 Notion 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    try {
      setSubmitting(true);
      const result = await integrationApi.syncNotion();
      setData(result);
      setPageContent(null);
      setDatabaseContent(null);
      setBlockDrafts({});
      setEditMode(false);
      await loadInsights();
      toast.success('Notion 数据已同步');
    } catch (err: any) {
      toast.error(err.message || '同步 Notion 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('确定断开 Notion 连接吗？')) return;
    try {
      setSubmitting(true);
      await integrationApi.disconnectNotion();
      setData(emptyState);
      setInsights(emptyInsights);
      setPageContent(null);
      setDatabaseContent(null);
      setBlockDrafts({});
      setEditMode(false);
      toast.success('Notion 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 Notion 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openPage = async (page: NotionPageSummary) => {
    try {
      setOpeningPageId(page.id);
      setEditMode(false);
      const content = await integrationApi.getNotionPageContent(page.id);
      setPageContent(content);
      setDatabaseContent(null);
      setBlockDrafts(buildBlockDrafts(content.blocks));
    } catch (err: any) {
      toast.error(err.message || '读取 Notion 页面内容失败');
    } finally {
      setOpeningPageId(null);
    }
  };

  const openDatabase = async (database: NotionDatabaseSummary) => {
    try {
      setOpeningDatabaseId(database.id);
      const content = await integrationApi.getNotionDatabaseContent(database.id);
      setDatabaseContent(content);
      setPageContent(null);
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message || '读取 Notion 数据库内容失败');
    } finally {
      setOpeningDatabaseId(null);
    }
  };

  const savePageEdits = async () => {
    if (!pageContent) return;
    const changes = collectBlockChanges(pageContent.blocks, blockDrafts);
    if (changes.length === 0) {
      setEditMode(false);
      toast.info('没有需要保存的修改');
      return;
    }

    try {
      setSavingEdits(true);
      await Promise.all(
        changes.map((change) =>
          integrationApi.updateNotionBlock(change.id, {
            type: change.type,
            text: change.text,
          })
        )
      );
      const refreshed = await integrationApi.getNotionPageContent(pageContent.page.id);
      setPageContent(refreshed);
      setBlockDrafts(buildBlockDrafts(refreshed.blocks));
      setEditMode(false);
      void loadInsights();
      toast.success(`已保存 ${changes.length} 个 Notion 内容块`);
    } catch (err: any) {
      toast.error(err.message || '保存 Notion 修改失败');
    } finally {
      setSavingEdits(false);
    }
  };

  const cancelPageEdits = () => {
    if (!pageContent) return;
    setBlockDrafts(buildBlockDrafts(pageContent.blocks));
    setEditMode(false);
  };

  const filteredPages = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return data.pages;
    return data.pages.filter((item) =>
      [
        item.title,
        item.parent?.type || '',
        item.parent?.database_id || '',
        item.parent?.page_id || '',
        ...Object.keys(item.propertiesPreview || {}),
        ...Object.values(item.propertiesPreview || {}),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.pages, deferredQuery]);

  const filteredDatabases = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return data.databases;
    return data.databases.filter((item) =>
      [item.title, item.description || '', item.parent?.type || '', ...Object.keys(item.properties || {})]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.databases, deferredQuery]);

  const previewPages = useMemo(() => filteredPages.slice(0, 12), [filteredPages]);
  const previewDatabases = useMemo(() => filteredDatabases.slice(0, 12), [filteredDatabases]);
  const visibleUsers = useMemo(() => data.users.slice(0, 12), [data.users]);

  const statCards = [
    { icon: BookOpen, label: '页面总数', value: data.metrics.pageCount, tone: 'from-sky-500/25 to-cyan-500/10' },
    { icon: Database, label: '数据库总数', value: data.metrics.databaseCount, tone: 'from-orange-500/25 to-amber-500/10' },
    { icon: Users, label: '成员总数', value: data.metrics.userCount, tone: 'from-emerald-500/25 to-lime-500/10' },
    { icon: Layers3, label: '块总数', value: insights.totalBlocks || (insightsLoading ? '...' : 0), tone: 'from-violet-500/25 to-fuchsia-500/10' },
    { icon: FileText, label: '归档页面', value: data.metrics.archivedPageCount, tone: 'from-slate-500/25 to-zinc-500/10' },
    {
      icon: NotebookPen,
      label: '连接状态',
      value: data.connected ? '已连接' : '未连接',
      tone: 'from-slate-500/25 to-zinc-500/10',
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.14),transparent_35%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                <NotebookPen className="h-3.5 w-3.5" />
                Notion 管理页面
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">首屏更快，数据更全，页面和数据库都能在这里直接管理</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                页面现在先加载 Notion 工作区总览，再异步补齐块洞察。你能在这里查看全部可见页面、全部数据库、成员、块类型分布、页面正文，还能直接编辑支持的块内容。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => window.open('https://www.notion.so/login', '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                登录 Notion
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={() => window.open('https://www.notion.so/profile/integrations', '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                创建 Integration
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {statCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * index }}
            className="glass-card p-5"
          >
            <div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br p-3 ${card.tone}`}>
              <card.icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.55fr]">
        <section className="space-y-6">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Token 管理</h2>
                <p className="text-sm text-muted-foreground">按 `.env.example` 默认读取，也支持页面里手动覆盖和同步。</p>
              </div>
              {data.connected && (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                  已连接
                </span>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Notion integration token</span>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴新的 Notion integration token。保存后会覆盖当前正在使用的 token。"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">当前 Token 状态</p>
                <p className="mt-2">已保存状态：{data.connected ? `已连接，当前显示为 ${data.tokenMasked}` : '尚未保存 Token'}</p>
                <p className="mt-2">最后同步：{data.lastSyncAt ? timeAgo(data.lastSyncAt) : '暂无'}</p>
                <p className="mt-2">配置来源：优先读取 `.env.example`，如果有 `.env` 会按字段覆盖。</p>
                <p className="mt-2">你只要把需要读取的页面或数据库共享给 integration，这里就能直接展示。</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={connect}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <NotebookPen className="h-4 w-4" />
                  连接并读取
                </button>
                <button
                  onClick={sync}
                  disabled={!data.connected || submitting}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
                  强制同步
                </button>
                <button
                  onClick={disconnect}
                  disabled={!data.connected || submitting}
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Unplug className="h-4 w-4" />
                  断开连接
                </button>
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">工作区总览</h2>
                <p className="text-sm text-muted-foreground">先显示快数据，深度块统计会在后面异步补齐。</p>
              </div>
              {loading && <span className="text-sm text-muted-foreground">加载中...</span>}
            </div>

            {data.bot ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bot</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{data.bot.name || 'Notion Integration Bot'}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {data.bot.bot?.workspace_name || '未返回工作区名称'}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Workspace Shape</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{data.metrics.pageWithDatabaseParentCount}</div>
                  <div className="mt-1 text-sm text-muted-foreground">篇页面直接挂在数据库下面</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                连接 Notion 后，这里会显示你的 integration Bot 信息。
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">资源检索</h2>
              <p className="text-sm text-muted-foreground">同时筛选页面标题、父级、属性名、属性值和数据库结构。</p>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={resourceQuery}
                onChange={(e) => setResourceQuery(e.target.value)}
                placeholder="搜索 Notion 资源"
                className="w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">内容块洞察</h2>
              <p className="text-sm text-muted-foreground">首屏之后异步拉取，减少等待；结果覆盖当前可见全部页面。</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {insights.blockTypeCounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground md:col-span-2">
                  {loading || insightsLoading ? '正在分析 Notion 内容块...' : '暂无内容块数据。'}
                </div>
              ) : (
                insights.blockTypeCounts.slice(0, 12).map((item) => (
                  <div key={item.type} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{blockLabel(item.type)}</span>
                      <span className="text-sm text-muted-foreground">{item.count}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">成员列表</h2>
              <p className="text-sm text-muted-foreground">先显示前 12 个成员，完整数量见统计卡。</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {visibleUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground md:col-span-2">
                  暂无成员数据。
                </div>
              ) : (
                visibleUsers.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{user.person?.email || user.type}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <ResourceList
            title="文章预览 / 最近 12 篇"
            items={previewPages}
            kind="页面"
            onOpenPage={openPage}
            openingPageId={openingPageId}
            emptyText={loading ? '正在加载 Notion 页面...' : '连接并同步后，这里会显示全部可访问的页面。'}
          />

          <div className="glass-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">全部文章 / 页面库</h2>
                <p className="text-sm text-muted-foreground">当前筛选命中 {filteredPages.length} 篇。点“阅读”在应用内直接打开正文。</p>
              </div>
              <button
                onClick={() => setArticleDrawerOpen(true)}
                disabled={filteredPages.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                查看全部文章
                <BookOpen className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ResourceList
            title="全部数据库"
            items={previewDatabases}
            kind="数据库"
            onOpenDatabase={openDatabase}
            openingDatabaseId={openingDatabaseId}
            emptyText={loading ? '正在加载 Notion 数据库...' : '连接并同步后，这里会显示全部可访问的数据库。'}
          />

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">数据库属性结构</h2>
              <p className="text-sm text-muted-foreground">展示每个数据库的 property schema。</p>
            </div>
            <div className="mt-4 space-y-3">
              {filteredDatabases.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                  暂无数据库属性可展示。
                </div>
              ) : (
                filteredDatabases.map((db) => (
                  <div key={db.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold text-foreground">{db.title}</h3>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{db.propertyCount || 0} properties</span>
                    </div>
                    {db.description && <p className="mt-2 text-sm text-muted-foreground">{db.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(db.properties || {}).map(([name, prop]) => (
                        <span key={name} className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          {name}:{prop.type}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">最重页面排行</h2>
              <p className="text-sm text-muted-foreground">按内容块数量排序，方便你快速定位大页面。</p>
            </div>
            <div className="mt-4 space-y-3">
              {insights.pageBlockCounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                  {insightsLoading ? '正在统计页面块数量...' : '暂无页面块统计。'}
                </div>
              ) : (
                insights.pageBlockCounts.slice(0, 10).map((item) => (
                  <div key={item.pageId} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{item.title}</div>
                        <div className="text-sm text-muted-foreground">{item.pageId}</div>
                      </div>
                      <div className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                        {item.count} blocks
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">最近更新页面</h2>
              <p className="text-sm text-muted-foreground">优先显示最近被编辑过的页面，便于快速回到活跃内容。</p>
            </div>
            <div className="mt-4 space-y-3">
              {insights.recentEditedPages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                  {loading || insightsLoading ? '正在整理最近编辑页面...' : '暂无最近编辑页面。'}
                </div>
              ) : (
                insights.recentEditedPages.slice(0, 12).map((item) => (
                  <div key={item.pageId} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{item.title}</div>
                        <div className="text-sm text-muted-foreground">{new Date(item.lastEditedTime).toLocaleString('zh-CN')}</div>
                      </div>
                      <button
                        onClick={() => {
                          const match = data.pages.find((page) => page.id === item.pageId);
                          if (match) void openPage(match);
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                      >
                        阅读
                        <BookOpen className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {pageContent && (
        <div className="fixed inset-0 z-50 bg-background/75 p-4 backdrop-blur-xl">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    Notion 文章阅读器
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{pageContent.page.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    更新于 {new Date(pageContent.page.last_edited_time).toLocaleString('zh-CN')} · {pageContent.blocks.length} 个顶层内容块
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editMode ? (
                    <>
                      <button
                        onClick={savePageEdits}
                        disabled={savingEdits}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {savingEdits ? '保存中...' : '保存修改'}
                      </button>
                      <button
                        onClick={cancelPageEdits}
                        disabled={savingEdits}
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                      >
                        取消编辑
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditMode(true)}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                      编辑
                    </button>
                  )}
                  <button
                    onClick={() => window.open(pageContent.page.url, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    打开 Notion
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setPageContent(null);
                      setEditMode(false);
                      setBlockDrafts({});
                    }}
                    disabled={savingEdits}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    关闭
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {pageContent.blocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-16 text-center text-sm text-muted-foreground">
                  这个页面暂无可读取内容，或 Notion integration 没有该页面子块权限。
                </div>
              ) : (
                <div className="space-y-3">
                  {pageContent.blocks.map((block) =>
                    renderBlock(block, 0, editMode, blockDrafts, (id, value) =>
                      setBlockDrafts((current) => ({ ...current, [id]: value }))
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {databaseContent && (
        <div className="fixed inset-0 z-50 bg-background/75 p-4 backdrop-blur-xl">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="border-b border-border p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    <Database className="h-3.5 w-3.5" />
                    Notion 数据库浏览器
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{databaseContent.database.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    共 {databaseContent.rows.length} 条记录 · 更新于 {new Date(databaseContent.database.last_edited_time).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => window.open(databaseContent.database.url, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    打开 Notion
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDatabaseContent(null)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    关闭
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {databaseContent.rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-16 text-center text-sm text-muted-foreground">
                  这个数据库暂无条目，或 integration 没有查询权限。
                </div>
              ) : (
                <div className="space-y-3">
                  {databaseContent.rows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-border bg-background/45 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-foreground">{row.title}</h3>
                            {row.archived && (
                              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-300">
                                archived
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            创建于 {new Date(row.created_time).toLocaleString('zh-CN')} · 更新于 {new Date(row.last_edited_time).toLocaleString('zh-CN')}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(row.properties).map(([key, value]) => (
                              <span key={key} className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => window.open(row.url, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          打开行页面
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {articleDrawerOpen && (
        <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm">
          <button
            aria-label="关闭全部文章抽屉背景"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setArticleDrawerOpen(false)}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    全部文章抽屉
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">全部文章 / 页面库</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    共 {filteredPages.length} 篇，跟随上方搜索条件实时筛选。点“阅读”在应用内打开，点“打开 Notion”跳到原页面。
                  </p>
                </div>
                <button
                  onClick={() => setArticleDrawerOpen(false)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  关闭
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="space-y-3">
                {filteredPages.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-background/45 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-foreground">{item.title}</h3>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            页面
                          </span>
                          {item.parent?.type && (
                            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                              {item.parent.type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          更新于 {new Date(item.last_edited_time).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => openPage(item)}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <BookOpen className="h-4 w-4" />
                          {openingPageId === item.id ? '读取中...' : '阅读'}
                        </button>
                        <button
                          onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                        >
                          打开 Notion
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </div>
  );
}
