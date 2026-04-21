import type { MailMessage } from '../../types';

interface RecentMailPanelProps {
  mails: MailMessage[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onCompose: () => void;
  onOpenMail: (mail: MailMessage) => void;
}

function formatMailTime(value: string) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getSenderLabel(mail: MailMessage) {
  return mail.sender_name?.trim() || mail.sender?.trim() || '未知发件人';
}

export default function RecentMailPanel({
  mails,
  loading,
  refreshing,
  onRefresh,
  onCompose,
  onOpenMail,
}: RecentMailPanelProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">最近邮件</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            显示全部邮箱最近 5 条邮件，自动轮询更新，并标明来源邮箱。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            自动刷新 30 秒
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {refreshing ? '刷新中...' : '立即刷新'}
          </button>
          <button
            type="button"
            onClick={onCompose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            写邮件
          </button>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-3 h-3 w-64 rounded bg-zinc-100 dark:bg-zinc-900" />
                <div className="mt-2 h-3 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
              </div>
            ))}
          </div>
        ) : mails.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">还没有最近邮件，点“立即刷新”先同步一次。</p>
          </div>
        ) : (
          mails.map((mail) => (
            <button
              key={`${mail.account_id}-${mail.id}-${mail.mail_id}`}
              type="button"
              onClick={() => onOpenMail(mail)}
              className="block w-full px-5 py-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-950/40"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {mail.account_email || `账户 #${mail.account_id}`}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {mail.mailbox}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{getSenderLabel(mail)}</span>
                    {mail.sender && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">&lt;{mail.sender}&gt;</span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {mail.subject || '(无主题)'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {(mail.text_content || mail.html_content || '').replace(/\s+/g, ' ').trim() || '暂无预览内容'}
                  </p>
                </div>
                <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatMailTime(mail.mail_date || mail.cached_at)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
