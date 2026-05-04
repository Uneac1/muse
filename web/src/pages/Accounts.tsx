import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAccountStore } from '../stores/accounts';
import { useTagStore } from '../stores/tags';
import { mailApi, osApi } from '../lib/api';
import type { Account, MailMessage, MailboxType, PersonalAccountAiPlan } from '../types';
import AccountToolbar from '../components/accounts/AccountToolbar';
import AccountTable, { getDefaultVisibleColumns, COLUMN_STORAGE_KEY } from '../components/accounts/AccountTable';
import EditAccountDialog from '../components/accounts/EditAccountDialog';
import ImportDialog from '../components/accounts/ImportDialog';
import PasteImportDialog from '../components/accounts/PasteImportDialog';
import { MailViewerDialog } from '../components/accounts/MailViewerDialog';
import BackupRestore from '../components/accounts/BackupRestore';
import RecentMailPanel from '../components/accounts/RecentMailPanel';
import ComposeMailDialog from '../components/accounts/ComposeMailDialog';
import { readCache, writeCache } from '../lib/localCache';
import { CheckCircle2, Sparkles, Wand2 } from 'lucide-react';

const RECENT_MAILS_CACHE_KEY = 'muse.accounts.recent-mails';

export default function Accounts() {
  const {
    accounts, loading, selectedIds, searchQuery, pagination,
    fetchAccounts, createAccount, updateAccount, deleteAccount, batchDelete,
    exportAccounts, setSelectedIds, setSearchQuery, setPage, setPageSize,
  } = useAccountStore();

  const { tags, fetchTags, createTag, deleteTag, setAccountTags } = useTagStore();

  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [mailViewAccount, setMailViewAccount] = useState<Account | null>(null);
  const [mailViewMailbox, setMailViewMailbox] = useState<MailboxType>('INBOX');
  const [mailViewOpen, setMailViewOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(getDefaultVisibleColumns);
  const [recentMails, setRecentMails] = useState<MailMessage[]>(() => readCache<MailMessage[]>(RECENT_MAILS_CACHE_KEY)?.value || []);
  const [recentLoading, setRecentLoading] = useState(() => recentMails.length === 0);
  const [recentRefreshing, setRecentRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeAccountId, setComposeAccountId] = useState<number | null>(null);
  const [composeDraft, setComposeDraft] = useState<{ to?: string; cc?: string; bcc?: string; subject?: string; text?: string } | null>(null);
  const [sendingMail, setSendingMail] = useState(false);
  const [aiPlan, setAiPlan] = useState<PersonalAccountAiPlan | null>(null);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const recentMailsRequestRef = useRef<Promise<void> | null>(null);

  const handleColumnsChange = (cols: string[]) => {
    setVisibleColumns(cols);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(cols));
  };

  const sendableAccounts = useMemo(
    () => accounts.filter((account) => account.provider === 'gmail' || account.provider === 'qq' || account.provider === 'custom'),
    [accounts]
  );
  const accountSignals = useMemo(() => {
    const active = accounts.filter((account) => account.status === 'active').length;
    const error = accounts.filter((account) => account.status === 'error').length;
    const tagged = accounts.filter((account) => (account.tags || []).length > 0).length;
    return [
      { label: '当前页账户', value: accounts.length, meta: `${pagination.total} total` },
      { label: '正常', value: active, meta: `${Math.max(0, accounts.length - active)} need review` },
      { label: '异常', value: error, meta: error ? '需要处理' : 'clear' },
      { label: '可发信', value: sendableAccounts.length, meta: `${tagged} tagged` },
    ];
  }, [accounts, pagination.total, sendableAccounts.length]);

  const loadRecentMails = async (refresh = false, silent = false) => {
    if (!refresh && recentMailsRequestRef.current) {
      return recentMailsRequestRef.current;
    }

    if (refresh) {
      setRecentRefreshing(true);
    } else if (!silent) {
      setRecentLoading(true);
    }

    const request = (async () => {
      try {
        const data = refresh
          ? await mailApi.refreshRecent({ limit: 5 })
          : await mailApi.recent({ limit: 5 });
        setRecentMails(data);
        writeCache(RECENT_MAILS_CACHE_KEY, data);
      } catch (e: any) {
        if (refresh || !silent) {
          toast.error(e.message || '加载最近邮件失败');
        }
      } finally {
        if (refresh) {
          setRecentRefreshing(false);
        } else if (!silent) {
          setRecentLoading(false);
        }
        if (!refresh) {
          recentMailsRequestRef.current = null;
        }
      }
    })();

    if (!refresh) {
      recentMailsRequestRef.current = request;
    }
    return request;
  };

  useEffect(() => {
    Promise.all([
      fetchAccounts({ silent: true }),
      fetchTags(),
      loadRecentMails(),
    ]);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      loadRecentMails(false, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handleEdit = (account: Account) => {
    setEditAccount(account);
    setEditOpen(true);
  };

  const handleSave = async (data: Partial<Account>) => {
    try {
      if (editAccount) {
        await updateAccount(editAccount.id, data);
        toast.success('邮箱已更新');
      } else {
        await createAccount(data);
        toast.success('邮箱已添加');
      }
    } catch (e: any) {
      toast.error(e.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该邮箱吗？')) return;
    try {
      await deleteAccount(id);
      toast.success('已删除');
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 个邮箱吗？`)) return;
    try {
      await batchDelete(selectedIds);
      toast.success(`已删除 ${selectedIds.length} 个邮箱`);
    } catch (e: any) {
      toast.error(e.message || '批量删除失败');
    }
  };

  const handleDeleteAll = async () => {
    const allIds = accounts.map(a => a.id);
    if (allIds.length === 0) return;
    if (!confirm(`确定要删除当前页全部 ${allIds.length} 个邮箱吗？`)) return;
    try {
      await batchDelete(allIds);
      toast.success('已全部删除');
    } catch (e: any) {
      toast.error(e.message || '删除失败');
    }
  };


  const handleExport = async (ids?: number[]) => {
    try {
      const content = await exportAccounts({ ids, separator: '----', format: ['provider', 'email', 'password', 'client_id', 'client_secret', 'refresh_token'] });
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accounts_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch (e: any) {
      toast.error(e.message || '导出失败');
    }
  };

  const handleViewMail = (account: Account, mailbox: MailboxType) => {
    setMailViewAccount(account);
    setMailViewMailbox(mailbox);
    setMailViewOpen(true);
  };

  const handleOpenRecentMail = (mail: MailMessage) => {
    const account = accounts.find((item) => item.id === mail.account_id);
    if (!account) {
      toast.error('未找到对应邮箱账户');
      return;
    }
    setMailViewAccount(account);
    setMailViewMailbox(mail.mailbox || 'INBOX');
    setMailViewOpen(true);
  };

  const handleCompose = (accountId?: number | null) => {
    setComposeAccountId(accountId || sendableAccounts[0]?.id || null);
    setComposeDraft(null);
    setComposeOpen(true);
  };

  const handleSendMail = async (data: { account_id: number; to: string; cc?: string; bcc?: string; subject: string; text: string; attachments?: any[] }) => {
    setSendingMail(true);
    try {
      await mailApi.send(data);
      toast.success('邮件发送成功');
      setComposeOpen(false);
      await fetchAccounts();
      await loadRecentMails(true);
    } catch (e: any) {
      toast.error(e.message || '发送邮件失败');
    } finally {
      setSendingMail(false);
    }
  };

  const handleToggleTag = async (accountId: number, tagId: number) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    const currentTagIds = (account.tags || []).map(t => t.id);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId];
    try {
      await setAccountTags(accountId, newTagIds);
      await fetchAccounts();
    } catch (e: any) {
      toast.error(e.message || '标签操作失败');
    }
  };

  const handleCreateTag = async (name: string) => {
    try {
      await createTag(name);
    } catch (e: any) {
      toast.error(e.message || '创建标签失败');
    }
  };

  const handleAiPlan = async () => {
    setAiPlanning(true);
    try {
      const plan = await osApi.aiManageAccounts({
        focus: '检查邮箱账号的状态、长期/临时用途、最近同步、标签和异常，提出需要更新的模式、状态、备注或标签。',
      });
      setAiPlan(plan);
      toast.success('AI 已生成邮箱账号治理建议');
    } catch (e: any) {
      toast.error(e.message || 'AI 邮箱账号治理失败');
    } finally {
      setAiPlanning(false);
    }
  };

  const handleApplyAiPlan = async () => {
    if (!aiPlan?.suggestions.length) return;
    setAiApplying(true);
    try {
      await osApi.applyAiAccountPlan({ suggestions: aiPlan.suggestions });
      setAiPlan(null);
      await Promise.all([fetchAccounts(), fetchTags()]);
      toast.success('AI 邮箱账号治理建议已应用');
    } catch (e: any) {
      toast.error(e.message || '应用 AI 建议失败');
    } finally {
      setAiApplying(false);
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    try {
      await deleteTag(tagId);
      await fetchAccounts();
    } catch (e: any) {
      toast.error(e.message || '删除标签失败');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);

  return (
    <div className="account-workbench mx-auto w-full max-w-[1640px] space-y-6">
      <div className="account-notice rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-100">
        <div className="font-medium">临时邮箱现在走独立的 Ymail 控制台。</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sky-800/80 dark:text-sky-200/80">
          <span>自动创建、回收、收件查看和凭证管理都已经拆到独立流程里。</span>
          <Link to="/ymail" className="rounded-md border border-sky-500/30 px-2.5 py-1 text-xs font-medium hover:bg-sky-500/10">
            打开 Ymail 临时邮箱
          </Link>
        </div>
      </div>
      {/* Header */}
      <div className="account-hero-strip flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="account-eyebrow">Mail Command Surface</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">邮箱管理</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">muse-Mail 当前共管理 {pagination.total} 个邮箱账户，支持导入、同步、写信、看信和批量处置。</p>
          <div className="account-hero-metrics mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {accountSignals.map((item) => (
              <div key={item.label} className="rounded-[18px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)]/72 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="account-hero-actions flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          <BackupRestore />
          <button
            onClick={() => { setEditAccount(null); setEditOpen(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            新增邮箱
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <AccountToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCount={selectedIds.length}
        onFileImport={() => setImportOpen(true)}
        onPasteImport={() => setPasteOpen(true)}
        onExportSelected={() => handleExport(selectedIds)}
        onExportAll={() => handleExport()}
        onDeleteSelected={handleDeleteSelected}
        onDeleteAll={handleDeleteAll}
        visibleColumns={visibleColumns}
        onColumnsChange={handleColumnsChange}
      />

      <RecentMailPanel
        mails={recentMails}
        loading={recentLoading}
        refreshing={recentRefreshing}
        onRefresh={() => loadRecentMails(true)}
        onCompose={() => handleCompose()}
        onOpenMail={handleOpenRecentMail}
      />

      <section className="account-ai-panel rounded-[24px] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              <Wand2 className="h-5 w-5 text-blue-500" />
              AI 邮箱账号治理
            </div>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              接 `/os/accounts/ai-manage`：让 AI 根据同步状态、用途、异常和标签给出账号模式、状态、备注和标签建议。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleAiPlan}
              disabled={aiPlanning || loading || accounts.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Sparkles className={`h-4 w-4 ${aiPlanning ? 'animate-pulse' : ''}`} />
              {aiPlanning ? 'AI 分析中' : '生成 AI 治理建议'}
            </button>
            {aiPlan && (
              <button
                onClick={handleApplyAiPlan}
                disabled={aiApplying || aiPlan.suggestions.length === 0}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                应用全部建议
              </button>
            )}
          </div>
        </div>
        {aiPlan && (
          <div className="mt-4 rounded-[20px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{aiPlan.summary}</div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {aiPlan.accountName} · {aiPlan.model}{aiPlan.usedFallback ? ` · 已自动切换 AI 账号：${aiPlan.fallbackReason || '原账号不可用'}` : ''}
                </div>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{aiPlan.suggestions.length} 条建议</div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {aiPlan.suggestions.map((suggestion, index) => {
                const target = accounts.find((item) => item.id === suggestion.target_id);
                return (
                  <div key={`${suggestion.target_id}-${index}`} className="rounded-[18px] border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex flex-wrap gap-2">
                      {suggestion.mode && <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">模式：{suggestion.mode}</span>}
                      {suggestion.status && <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">状态：{suggestion.status}</span>}
                      {(suggestion.tag_names || []).map((tag) => <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">#{tag}</span>)}
                    </div>
                    <div className="mt-3 font-medium text-zinc-900 dark:text-zinc-100">{target?.email || `账号 #${suggestion.target_id}`}</div>
                    {suggestion.remark && <div className="mt-2 text-zinc-600 dark:text-zinc-300">{suggestion.remark}</div>}
                    <div className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">原因：{suggestion.reason}</div>
                  </div>
                );
              })}
              {aiPlan.suggestions.length === 0 && (
                <div className="rounded-[18px] border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 xl:col-span-2">
                  AI 没有发现需要更新的邮箱账号。
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Table */}
      <div className="account-table-shell rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <AccountTable
          accounts={accounts}
          selectedIds={selectedIds}
          onSelectIds={setSelectedIds}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewMail={handleViewMail}
          loading={loading}
          visibleColumns={visibleColumns}
          tags={tags}
          onToggleTag={handleToggleTag}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span>每页</span>
            <select
              value={pagination.pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>条</span>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <span className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400">
              {pagination.page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <EditAccountDialog
        open={editOpen}
        account={editAccount}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
        tags={tags}
        accountTagIds={editAccount ? (editAccount.tags || []).map(t => t.id) : []}
        onTagToggle={editAccount ? (tagId) => handleToggleTag(editAccount.id, tagId) : undefined}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={() => fetchAccounts()} />
      <PasteImportDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onImport={() => fetchAccounts()} />
      {mailViewAccount && (
        <MailViewerDialog
          open={mailViewOpen}
          accountId={mailViewAccount.id}
          accountEmail={mailViewAccount.email}
          initialMailbox={mailViewMailbox}
          accounts={accounts}
          onClose={() => setMailViewOpen(false)}
        />
      )}
      <ComposeMailDialog
        open={composeOpen}
        accounts={accounts}
        initialAccountId={composeAccountId}
        initialDraft={composeDraft}
        sending={sendingMail}
        onClose={() => setComposeOpen(false)}
        onSend={handleSendMail}
      />
    </div>
  );
}
