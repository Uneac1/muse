import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useMailStore } from '../../stores/mails';
import { MailList } from '../mail/MailList';
import { MailContent } from '../mail/MailContent';
import type { Account, MailMessage, MailboxType } from '../../types';
import ComposeMailDialog from './ComposeMailDialog';
import { useState } from 'react';
import { mailApi } from '../../lib/api';
import { toast } from 'sonner';

interface MailViewerDialogProps {
  open: boolean;
  accountId: number;
  accountEmail: string;
  initialMailbox: MailboxType;
  accounts: Account[];
  onClose: () => void;
}

export function MailViewerDialog({
  open,
  accountId,
  accountEmail,
  initialMailbox,
  accounts,
  onClose,
}: MailViewerDialogProps) {
  const { setCurrentAccount, setMailbox, fetchCachedMails, selectedMail } = useMailStore();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<{ to?: string; subject?: string; text?: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentAccount(accountId);
      setMailbox(initialMailbox);
      fetchCachedMails(accountId, initialMailbox);
    }
  }, [open, accountId, initialMailbox, setCurrentAccount, setMailbox, fetchCachedMails]);

  if (!open) return null;

  const buildReplyDraft = (mail: MailMessage) => ({
    to: mail.sender,
    subject: mail.subject?.startsWith('Re:') ? mail.subject : `Re: ${mail.subject || '(无主题)'}`,
    text: `\n\n---- 原始邮件 ----\nFrom: ${mail.sender_name || mail.sender}\nDate: ${new Date(mail.mail_date).toLocaleString('zh-CN')}\nSubject: ${mail.subject || '(无主题)'}\n\n${mail.text_content || ''}`,
  });

  const buildForwardDraft = (mail: MailMessage) => ({
    subject: mail.subject?.startsWith('Fwd:') ? mail.subject : `Fwd: ${mail.subject || '(无主题)'}`,
    text: `\n\n---- 转发邮件 ----\nFrom: ${mail.sender_name || mail.sender}\nTo: ${mail.recipients || '-'}\nDate: ${new Date(mail.mail_date).toLocaleString('zh-CN')}\nSubject: ${mail.subject || '(无主题)'}\n\n${mail.text_content || ''}`,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[80vh] bg-background rounded-lg shadow-xl flex flex-col overflow-hidden animate-[slideUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">邮件查看</h2>
            <p className="text-sm text-muted-foreground">{accountEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">关闭</span>
          </button>
        </div>

        {/* Content: Two-column layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Mail list */}
          <div className="w-[320px] shrink-0 border-r border-border bg-card overflow-hidden">
            <MailList accountId={accountId} />
          </div>

          {/* Right: Mail content */}
          <div className="flex-1 overflow-hidden bg-background">
            <MailContent
              mail={selectedMail}
              onReply={(mail) => {
                setComposeDraft(buildReplyDraft(mail));
                setComposeOpen(true);
              }}
              onForward={(mail) => {
                setComposeDraft(buildForwardDraft(mail));
                setComposeOpen(true);
              }}
            />
          </div>
        </div>
      </div>
      <ComposeMailDialog
        open={composeOpen}
        accounts={accounts}
        initialAccountId={accountId}
        initialDraft={composeDraft}
        sending={sending}
        onClose={() => setComposeOpen(false)}
        onSend={async (data) => {
          setSending(true);
          try {
            await mailApi.send(data);
            toast.success('邮件发送成功');
            setComposeOpen(false);
          } catch (err: any) {
            toast.error(err.message || '发送失败');
          } finally {
            setSending(false);
          }
        }}
      />
    </div>
  );
}
