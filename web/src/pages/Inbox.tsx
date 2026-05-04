import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Inbox as InboxIcon, Mail, RefreshCw, Search } from 'lucide-react';
import { mailApi } from '../lib/api';
import type { MailMessage } from '../types';

function formatTime(value?: string | null) {
  if (!value) return '未知时间';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTemporary(mail: MailMessage) {
  return mail.source === 'temporary' || mail.mailboxType === 'temporary' || mail.mail_id?.startsWith('ymail:') || mail.account_id < 0;
}

export default function Inbox() {
  const [mails, setMails] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'mail' | 'temporary'>('all');

  const load = async () => {
    setError('');
    setRefreshing(true);
    try {
      const result = await mailApi.unified({ page: 1, pageSize: 200 });
      setMails(result.list || []);
    } catch (err: any) {
      setError(err?.message || '收件箱加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const indexedMails = useMemo(() => mails.map((mail) => {
    const temporary = isTemporary(mail);
    const htmlText = stripHtml(mail.html_content || '');
    const preview = (mail.text_content || htmlText || '(无正文)').slice(0, 260);
    const searchText = [
      mail.account_email,
      mail.sender,
      mail.sender_name,
      mail.recipients,
      mail.subject,
      mail.text_content,
      htmlText,
    ].join(' ').toLowerCase();

    return { mail, temporary, preview, searchText };
  }), [mails]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return indexedMails.filter(({ temporary, searchText }) => {
      if (source === 'mail' && temporary) return false;
      if (source === 'temporary' && !temporary) return false;
      if (!q) return true;
      return searchText.includes(q);
    });
  }, [indexedMails, query, source]);

  const regularCount = useMemo(() => indexedMails.filter((item) => !item.temporary).length, [indexedMails]);
  const temporaryCount = indexedMails.length - regularCount;

  return (
    <div className="inbox-page mx-auto w-full max-w-[1500px] space-y-6">
      <section className="inbox-hero rounded-[28px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-5 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)] px-3 py-1 text-xs text-muted-foreground">
              <InboxIcon className="h-3.5 w-3.5" />
              Unified Mail Inbox
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Inbox 是所有邮箱邮件</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              这里聚合长期邮箱缓存和 Ymail 临时邮箱收件箱，不再展示动作队列。动作队列仍由 Today 负责承接。
            </p>
          </div>
          <div className="inbox-summary-grid grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">全部邮件</div>
              <div className="mt-1 text-2xl font-semibold">{mails.length}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">长期邮箱</div>
              <div className="mt-1 text-2xl font-semibold">{regularCount}</div>
            </div>
            <div className="rounded-[18px] border border-[color:var(--outline-variant)] p-4">
              <div className="text-xs text-muted-foreground">临时邮箱</div>
              <div className="mt-1 text-2xl font-semibold">{temporaryCount}</div>
            </div>
          </div>
        </div>

        <div className="inbox-toolbar mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索发件人、主题、正文、收件地址"
              className="w-full rounded-[14px] border border-[color:var(--outline-variant)] bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="inbox-source-tabs inline-flex w-full rounded-[14px] border border-[color:var(--outline-variant)] bg-background p-1 sm:w-auto">
            {[
              ['all', '全部'],
              ['mail', '长期邮箱'],
              ['temporary', '临时邮箱'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSource(key as typeof source)}
                className={`rounded-[10px] px-3 py-2 text-sm ${source === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--outline-variant)] px-4 py-3 text-sm">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <a href="/ymail" className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--outline-variant)] px-4 py-3 text-sm">
            临时邮箱管理
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-[20px] bg-secondary" />)}
        </div>
      ) : error ? (
        <div className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[color:var(--outline-variant)] p-10 text-center text-sm text-muted-foreground">当前筛选没有邮件。</div>
      ) : (
        <div className="inbox-list overflow-hidden rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)]">
          {filtered.map(({ mail, temporary, preview }) => (
            <article key={mail.mail_id || mail.id} className="inbox-mail-row border-b border-[color:var(--outline-variant)] p-4 last:border-b-0 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${temporary ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary'}`}>
                      <Mail className="h-3.5 w-3.5" />
                      {temporary ? '临时邮箱' : '长期邮箱'}
                    </span>
                    <span className="min-w-0 break-all">{mail.account_email || '未知账号'}</span>
                    <span className="shrink-0">{formatTime(mail.mail_date || mail.cached_at)}</span>
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-foreground">{mail.subject || '(无主题)'}</h2>
                  <div className="mt-1 break-words text-sm text-muted-foreground">
                    {mail.sender_name || mail.sender || '未知发件人'} → {mail.recipients || mail.account_email || '未知收件人'}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-foreground/80">{preview}</p>
                </div>
                {mail.sender && /https?:\/\//i.test(mail.sender) && (
                  <a href={mail.sender} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[12px] border border-[color:var(--outline-variant)] px-3 py-2 text-sm">
                    打开
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
