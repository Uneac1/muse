import { useState } from 'react';
import { RefreshCw, Trash2, Inbox, AlertTriangle, Send, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMailStore } from '../../stores/mails';
import { MailCard } from './MailCard';
import { MailSkeleton } from './MailSkeleton';
import type { MailMessage, MailboxType } from '../../types';
import { toast } from 'sonner';

interface MailListProps {
  accountId: number | null;
}

export function MailList({ accountId }: MailListProps) {
  const {
    currentMailbox,
    setMailbox,
    mails,
    selectedMail,
    selectMail,
    loading,
    fetchMails,
    fetchCachedMails,
    searchCachedMails,
    clearMailbox,
  } = useMailStore();
  const [query, setQuery] = useState('');

  const handleFetchNew = async () => {
    if (!accountId) return;
    try {
      await fetchMails(accountId, currentMailbox);
      toast.success('邮件收取完成');
    } catch (e: any) {
      toast.error(e.message || '收取邮件失败');
    }
  };

  const handleClear = async () => {
    if (!accountId) return;
    if (!confirm(`确定要清空${currentMailbox === 'INBOX' ? '收件箱' : '垃圾箱'}吗？`)) return;
    try {
      await clearMailbox(accountId, currentMailbox);
      toast.success('清空完成');
    } catch (e: any) {
      toast.error(e.message || '清空失败');
    }
  };

  const handleTabChange = (box: MailboxType) => {
    setMailbox(box);
    setQuery('');
    if (accountId) {
      fetchCachedMails(accountId, box);
    }
  };

  if (!accountId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">请先选择邮箱账户</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => handleTabChange('INBOX')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
            currentMailbox === 'INBOX'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Inbox className="h-3.5 w-3.5" />
          收件箱
        </button>
        <button
          onClick={() => handleTabChange('Junk')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
            currentMailbox === 'Junk'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          垃圾箱
        </button>
        <button
          onClick={() => handleTabChange('Sent')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
            currentMailbox === 'Sent'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Send className="h-3.5 w-3.5" />
          已发送
        </button>
      </div>

      {/* Actions */}
      <div className="border-b border-border p-2 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={async (event) => {
              if (event.key === 'Enter' && accountId) {
                if (query.trim()) {
                  await searchCachedMails(accountId, currentMailbox, query.trim());
                } else {
                  await fetchCachedMails(accountId, currentMailbox);
                }
              }
            }}
            placeholder="搜索发件人、收件人、主题、正文"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
        <button
          onClick={handleFetchNew}
          disabled={loading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          收取邮件
        </button>
        <button
          onClick={handleClear}
          disabled={loading || mails.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </button>
        </div>
      </div>

      {/* Mail list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <MailSkeleton />
        ) : mails.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">暂无邮件</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {mails.map((mail: MailMessage) => (
              <MailCard
                key={mail.id}
                mail={mail}
                isSelected={selectedMail?.id === mail.id}
                onClick={() => selectMail(mail)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
