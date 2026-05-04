import { useEffect, useMemo, useState } from 'react';
import type { Account, MailAttachment } from '../../types';
import { Button, FieldLabel, SelectInput, StatusTag, TextArea, TextInput } from '../ui/primitives';

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
          <Button
            variant="outlined"
            type="button"
            onClick={onClose}
          >
            关闭
          </Button>
        </div>

        {availableAccounts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            当前没有可发信账户。先添加并授权 Gmail，添加 QQ 授权码邮箱，或配置自定义域名邮箱的 SMTP。
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <div>
              <FieldLabel>发件账户</FieldLabel>
              <SelectInput
                variant="outlined"
                value={accountId}
                onChange={(event) => setAccountId(Number(event.target.value))}
                aria-label="发件账户"
                className="w-full"
              >
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} · {account.provider} · {account.mode === 'temporary' ? '临时' : '长期'}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>收件人</FieldLabel>
                <TextInput
                  variant="outlined"
                  type="text"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="recipient@example.com"
                  aria-label="收件人"
                  className="w-full"
                />
              </div>
              <div>
                <FieldLabel>抄送</FieldLabel>
                <TextInput
                  variant="outlined"
                  type="text"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="可选，多个邮箱用逗号分隔"
                  aria-label="抄送"
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>密送</FieldLabel>
                <TextInput
                  variant="outlined"
                  type="text"
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  placeholder="可选，多个邮箱用逗号分隔"
                  aria-label="密送"
                  className="w-full"
                />
              </div>
              <div>
                <FieldLabel>主题</FieldLabel>
                <TextInput
                  variant="outlined"
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="输入邮件主题"
                  aria-label="主题"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <FieldLabel>正文</FieldLabel>
              <TextArea
                variant="outlined"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={10}
                placeholder="写点什么。"
                aria-label="正文"
                className="w-full resize-none"
              />
            </div>

            <div>
              <FieldLabel>附件</FieldLabel>
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
                    <StatusTag key={`${attachment.filename}-${attachment.size}`}>
                      {attachment.filename} {attachment.size ? `· ${(attachment.size / 1024).toFixed(1)} KB` : ''}
                    </StatusTag>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outlined"
                type="button"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                variant="filled"
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
              >
                {sending ? '发送中...' : '发送邮件'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
