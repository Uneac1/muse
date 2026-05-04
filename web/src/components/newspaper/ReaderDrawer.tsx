import { ExternalLink, Languages, Bot, Loader2, RefreshCw, Sparkles, X, MessageSquare, Image as ImageIcon } from 'lucide-react';
import type { AiAccount, NewspaperAiInsight, NewspaperArticleDetail } from '../../types';

function timeLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '时间未知';
}

function compactReplyMeta(label: string, count?: number) {
  if (!count) return null;
  return `${label} ${count}`;
}

function normalizeParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function statusChipTone(status: NewspaperArticleDetail['fulltextStatus']) {
  if (status === 'ready') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'recovering' || status === 'pending') return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (status === 'partial') return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300';
}

function statusChipText(kind: 'fulltext' | 'image' | 'reply' | 'translation', status: NewspaperArticleDetail['fulltextStatus']) {
  if (status === 'ready') return '已就绪';
  if (status === 'failed') return kind === 'translation' ? '翻译失败' : '未获取';
  if (status === 'partial') {
    if (kind === 'fulltext') return '摘要预览';
    if (kind === 'translation') return '导读预览';
    return '部分可读';
  }
  if (status === 'recovering') return '恢复中';
  if (kind === 'image' || kind === 'reply') return '待补全';
  if (kind === 'translation') return '待翻译';
  return '待抓取';
}

function detailModuleCopy(article: NewspaperArticleDetail) {
  return [
    { label: '正文', status: article.fulltextStatus, text: statusChipText('fulltext', article.fulltextStatus) },
    { label: '图片', status: article.imageStatus, text: statusChipText('image', article.imageStatus) },
    { label: '评论', status: article.replyStatus, text: statusChipText('reply', article.replyStatus) },
    { label: '翻译', status: article.translationStatus, text: statusChipText('translation', article.translationStatus) },
  ];
}

export type ReaderDrawerPayload = {
  url: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  title: string;
  titleZh: string;
  summary: string;
  summaryZh: string;
};

type Props = {
  open: boolean;
  payload: ReaderDrawerPayload | null;
  article: NewspaperArticleDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  aiInsight: NewspaperAiInsight | null;
  aiLoading: boolean;
  aiError: string | null;
  aiAccounts: AiAccount[];
  selectedAccountId: number | '';
  activeAiAccount: AiAccount | null;
  onClose: () => void;
  onRefreshArticle: () => void;
  onRefreshInsight: () => void;
  onSelectAccount: (value: number | '') => void;
};

export function ReaderDrawer(props: Props) {
  const { open, payload, article, loading, refreshing, error, aiInsight, aiLoading, aiError, aiAccounts, selectedAccountId, activeAiAccount, onClose, onRefreshArticle, onRefreshInsight, onSelectAccount } = props;
  if (!open) return null;

  const originalParagraphs = normalizeParagraphs(article?.originalContent || '');
  const translatedParagraphs = normalizeParagraphs(article?.translatedContent || '');
  const rowCount = Math.max(originalParagraphs.length, translatedParagraphs.length);
  const paragraphPairs = Array.from({ length: rowCount }, (_, index) => ({ original: originalParagraphs[index] || '', translated: translatedParagraphs[index] || '' }));
  const insightSections = aiInsight ? [
    { title: '关键信号', items: aiInsight.takeaways },
    { title: '潜在风险', items: aiInsight.risks },
    { title: '值得追问', items: aiInsight.questions },
    { title: '建议动作', items: aiInsight.actions },
  ] : [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[920px] overflow-y-auto border-l border-border bg-white shadow-2xl md:w-[82vw]">
        <div className="sticky top-0 z-10 border-b border-border bg-white px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">报纸阅读抽屉</div>
              <div className="mt-1 line-clamp-1 text-lg font-semibold text-foreground">{article?.titleZh || payload?.titleZh || payload?.title || '阅读中'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onRefreshArticle} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40 disabled:opacity-50">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新正文
              </button>
              {payload?.url ? <a href={payload.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40">原站<ExternalLink className="h-4 w-4" /></a> : null}
              <button onClick={onClose} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">关闭<X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-4 md:p-6">
          {article ? <div className="rounded-[20px] border border-border bg-white p-4"><div className="flex flex-wrap gap-2 text-[11px]">{detailModuleCopy(article).map((item) => <span key={item.label} className={`rounded-full border px-2.5 py-1.5 ${statusChipTone(item.status)}`}>{item.label}：{item.text}</span>)}<span className="rounded-full border border-border px-2.5 py-1.5 text-muted-foreground">{article.source}</span><span className="rounded-full border border-border px-2.5 py-1.5 text-muted-foreground">{timeLabel(article.publishedAt)}</span></div><div className="mt-3 text-sm leading-7 text-muted-foreground">{error || article.statusMessage || (loading ? '阅读数据正在同步。' : '阅读数据已同步到当前抽屉。')}</div>{article.nextRetryAt ? <div className="mt-1 text-xs text-muted-foreground">下次自动重试：{timeLabel(article.nextRetryAt)}</div> : null}</div> : null}
          {article ? <>
            <section className="space-y-4 rounded-[24px] border border-border bg-white p-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary"><Languages className="h-3.5 w-3.5" />双语阅读模式</div>
              <div className="space-y-2"><h2 className="text-3xl font-bold tracking-tight text-foreground">{article.titleZh || article.title}</h2><div className="reader-font-en text-[16px] leading-8 text-muted-foreground">{article.title}</div></div>
              <div className="rounded-[20px] border border-border bg-slate-50 p-4"><div className="reader-kicker">中文导读</div><div className="reader-font-zh mt-3 text-[15px] leading-8 text-foreground">{article.summaryZh || article.summary || '当前只有标题与基础摘要。'}</div>{article.summary ? <div className="mt-3 text-xs leading-6 text-muted-foreground">原标题摘要：{article.summary}</div> : null}</div>
            </section>
            <section className="space-y-4 rounded-[24px] border border-border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /><div className="reader-kicker">AI 导读</div></div><div className="mt-1 text-sm text-muted-foreground">自动使用 AI 账号池里的可用账号，结合正文和讨论区生成中文导读。</div></div><div className="flex flex-wrap items-center gap-2"><select value={selectedAccountId} onChange={(e) => onSelectAccount(e.target.value ? Number(e.target.value) : '')} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"><option value="">默认 AI 账号</option>{aiAccounts.map((account) => <option key={account.id} value={account.id}>{account.name || account.provider} · {account.model}</option>)}</select><button onClick={onRefreshInsight} disabled={aiLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50">{aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}重新生成</button></div></div>
              <div className="flex flex-wrap gap-2 text-[11px]"><span className="rounded-full border border-border bg-slate-50 px-3 py-1.5 text-muted-foreground">AI 账号池</span><span className="rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-foreground">{activeAiAccount ? `${activeAiAccount.name || activeAiAccount.provider} · ${activeAiAccount.model}` : '未检测到可用 AI 账号'}</span></div>
              {aiError ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{aiError}</div> : null}
              {aiInsight ? <div className="grid gap-4 xl:grid-cols-2"><div className="rounded-[20px] border border-border bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{aiInsight.accountName} · {aiInsight.model}</div><div className="mt-3 reader-font-zh text-[15px] leading-8 text-foreground">{aiInsight.summary}</div></div><div className="grid gap-4 md:grid-cols-2">{insightSections.map(({ title, items }) => <div key={title} className="rounded-[20px] border border-border bg-slate-50 p-4"><div className="reader-kicker">{title}</div><div className="mt-3 space-y-2 text-sm leading-7 text-foreground">{items.map((item, index) => <div key={`${title}-${index}`}>{index + 1}. {item}</div>)}</div></div>)}</div></div> : <div className="rounded-[20px] border border-dashed border-border bg-slate-50 px-4 py-6 text-sm text-muted-foreground">{aiLoading ? 'AI 正在基于当前正文生成导读。' : 'AI 导读会在正文或摘要可用后生成。'}</div>}
            </section>
            {(article.coverImage || article.images.length > 0) ? <section className="space-y-3 rounded-[24px] border border-border bg-white p-5"><div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><div className="reader-kicker">原文图片</div></div>{article.coverImage ? <div className="overflow-hidden rounded-[20px] border border-border bg-muted/20"><img src={article.coverImage} alt={article.titleZh || article.title} className="h-auto max-h-[420px] w-full object-cover" loading="lazy" /></div> : null}{article.images.length > 1 ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{article.images.slice(article.coverImage ? 1 : 0, 7).map((image, index) => <a key={`${image.url}-${index}`} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[18px] border border-border bg-white transition hover:border-primary/30"><img src={image.url} alt={image.alt || `${article.title} image ${index + 1}`} className="h-44 w-full object-cover" loading="lazy" /><div className="px-3 py-2 text-xs text-muted-foreground">{image.alt || `原文图片 ${index + 1}`}</div></a>)}</div> : null}</section> : null}
            <div className="grid gap-5 xl:grid-cols-2"><div className="reader-column overflow-hidden bg-white"><div className="border-b border-border/70 px-5 py-4"><div className="reader-kicker">原文</div><div className="mt-1 reader-font-en text-sm text-muted-foreground">左侧保留原文，便于对照阅读。</div></div><div className="space-y-0 px-3 py-3 md:px-5">{paragraphPairs.length === 0 ? <div className="p-4 text-sm text-muted-foreground">当前还没有可读正文，只展示已有标题与摘要。</div> : paragraphPairs.map((pair, index) => <div key={`en-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0"><div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div><p className="reader-paragraph-en">{pair.original || '暂无原文段落'}</p></div>)}</div></div><div className="reader-column overflow-hidden bg-white"><div className="border-b border-border/70 px-5 py-4"><div className="reader-kicker">中文</div><div className="mt-1 reader-font-zh text-sm text-muted-foreground">右侧保持中文主视图，优先连续阅读体验。</div></div><div className="space-y-0 px-3 py-3 md:px-5">{paragraphPairs.length === 0 ? <div className="p-4 text-sm text-muted-foreground">当前还没有完整中文正文。</div> : paragraphPairs.map((pair, index) => <div key={`zh-${index}`} className="border-b border-border/50 px-2 py-4 last:border-b-0"><div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{String(index + 1).padStart(2, '0')}</div><p className="reader-paragraph-zh">{pair.translated || '暂无对应中文段落'}</p></div>)}</div></div></div>
            <section className="space-y-4 rounded-[24px] border border-border bg-white p-5"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><div className="reader-kicker">回复与讨论</div><span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{article.replyCount} 条</span></div>{article.replies.length === 0 ? <div className="rounded-[20px] border border-dashed border-border bg-slate-50 px-4 py-6 text-sm text-muted-foreground">当前没有拿到讨论区内容。</div> : <div className="space-y-3">{article.replies.map((reply) => <div key={reply.id} className="rounded-[20px] border border-border bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-3">{reply.avatarUrl ? <img src={reply.avatarUrl} alt={reply.author} className="h-10 w-10 rounded-full object-cover" loading="lazy" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">{reply.author.slice(0, 1)}</div>}<div className="min-w-0"><div className="text-sm font-medium text-foreground">{reply.author} {reply.authorHandle ? <span className="text-muted-foreground">{reply.authorHandle}</span> : null}</div><div className="text-xs text-muted-foreground">{timeLabel(reply.publishedAt)}{[compactReplyMeta('赞', reply.likeCount), compactReplyMeta('回复', reply.replyCount)].filter(Boolean).join(' · ') ? ` · ${[compactReplyMeta('赞', reply.likeCount), compactReplyMeta('回复', reply.replyCount)].filter(Boolean).join(' · ')}` : ''}</div></div>{reply.url ? <a href={reply.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">原帖定位<ExternalLink className="h-3.5 w-3.5" /></a> : null}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><div className="reader-kicker">中文回复</div><div className="reader-font-zh mt-2 text-sm leading-7 text-foreground">{reply.contentZh || '暂无'}</div></div><div><div className="reader-kicker">Original Reply</div><div className="reader-font-en mt-2 text-sm leading-7 text-muted-foreground">{reply.content || 'No reply content'}</div></div></div></div>)}</div>}</section>
          </> : loading ? <div className="flex h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在准备阅读视图</div> : <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error || '文章加载失败'}</div>}
        </div>
      </aside>
    </>
  );
}
