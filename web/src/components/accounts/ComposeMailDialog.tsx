import { useEffect, useMemo, useState } from 'react';
import type { Account, MailAttachment } from '../../types';

interface ComposeDraft {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
}

interface ComposeMailDialogProps {
  open: boolean;
  accounts: Account[];
  initialAccountId?: number | null;
  initialDraft?: ComposeDraft | null;
  sending: boolean;
  onClose: () => void;
  onSend: (data: {
    account_id: number;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    attachments?: MailAttachment[];
  }) => Promise<void>;
}

function isSendSupported(account: Account) {
  return account.provider === 'gmail' || account.provider === 'qq' || account.provider === 'custom';
}

async function filesToAttachments(files: FileList | null): Promise<MailAttachment[]> {
  if (!files || files.length === 0) return [];

  const readers = Array.from(files).map((file) => new Promise<MailAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const contentBase64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  }));

  return Promise.all(readers);
}

export default function ComposeMailDialog({
  open,
  accounts,
  initialAccountId,
  initialDraft,
  sending,
  onClose,
  onSend,
}: ComposeMailDialogProps) {
  const availableAccounts = useMemo(() => accounts.filter(isSendSupported), [accounts]);
  const [accountId, setAccountId] = useState<number>(0);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferred = availableAccounts.find((account) => account.id === initialAccountId) || availableAccounts[0];
    setAccountId(preferred?.id || 0);
    setTo(initialDraft?.to || '');
    setCc(initialDraft?.cc || '');
    setBcc(initialDraft?.bcc || '');
    setSubject(initialDraft?.subject || '');
    setText(initialDraft?.text || '');
    setAttachments([]);
    setAttachmentError('');
  }, [open, initialAccountId, initialDraft, availableAccounts]);

  if (!open) return null;

  const disabled = sending || !accountId || !to.trim() || !subject.trim() || !text.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_0.2s_ease-out]" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">发送邮件</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              支持 Gmail、QQ 和自定义域名邮箱发信，也可以直接从邮件详情里回复或转发。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            关闭
          </button>
        </div>

        {availableAccounts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            当前没有可发信账户。先添加并授权 Gmail，添加 QQ 授权码邮箱，或配置自定义域名邮箱的 SMTP。
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">发件账户</label>
              <select
                value={accountId}
                onChange={(event) => setAccountId(Number(event.target.value))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} · {account.provider} · {account.mode === 'temporary' ? '临时' : '长期'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">收件人</label>
                <input
                  type="text"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">抄送</label>
                <input
                  type="text"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="可选，多个邮箱用逗号分隔"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">密送</label>
                <input
                  type="text"
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  placeholder="可选，多个邮箱用逗号分隔"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">主题</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="输入邮件主题"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">正文</label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={10}
                placeholder="写点什么。"
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">附件</label>
              <input
                type="file"
                multiple
                onChange={async (event) => {
                  try {
                    setAttachmentError('');
                    const next = await filesToAttachments(event.target.files);
                    setAttachments(next);
                  } catch (err: any) {
                    setAttachmentError(err.message || '附件读取失败');
                  }
                }}
                className="w-full rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:file:bg-zinc-700 dark:hover:file:bg-zinc-600"
              />
              {attachmentError && <p className="mt-1 text-xs text-red-500">{attachmentError}</p>}
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span key={`${attachment.filename}-${attachment.size}`} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {attachment.filename} {attachment.size ? `· ${(attachment.size / 1024).toFixed(1)} KB` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSend({
                  account_id: accountId,
                  to: to.trim(),
                  cc: cc.trim() || undefined,
                  bcc: bcc.trim() || undefined,
                  subject: subject.trim(),
                  text: text.trim(),
                  attachments,
                })}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? '发送中...' : '发送邮件'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
