import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAccountStore } from '../stores/accounts';
import { useTagStore } from '../stores/tags';
import { mailApi } from '../lib/api';
import type { Account, MailMessage, MailboxType } from '../types';
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

  const handleColumnsChange = (cols: string[]) => {
    setVisibleColumns(cols);
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(cols));
  };

  const sendableAccounts = useMemo(
    () => accounts.filter((account) => account.provider === 'gmail' || account.provider === 'qq' || account.provider === 'custom'),
    [accounts]
  );

  const loadRecentMails = async (refresh = false) => {
    if (refresh) {
      setRecentRefreshing(true);
    } else {
      setRecentLoading(true);
    }

    try {
      const data = refresh
        ? await mailApi.refreshRecent({ limit: 5 })
        : await mailApi.recent({ limit: 5 });
      setRecentMails(data);
      writeCache(RECENT_MAILS_CACHE_KEY, data);
    } catch (e: any) {
      toast.error(e.message || '加载最近邮件失败');
    } finally {
      if (refresh) {
        setRecentRefreshing(false);
      } else {
        setRecentLoading(false);
      }
    }
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
      loadRecentMails(true);
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
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-100">
        <div className="font-medium">临时邮箱现在走独立的 Ymail 控制台。</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sky-800/80 dark:text-sky-200/80">
          <span>自动创建、回收、收件查看和凭证管理都已经拆到独立流程里。</span>
          <Link to="/ymail" className="rounded-md border border-sky-500/30 px-2.5 py-1 text-xs font-medium hover:bg-sky-500/10">
            打开 Ymail 临时邮箱
          </Link>
        </div>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">邮箱管理</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">muse-Mail 当前共管理 {pagination.total} 个邮箱账户</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
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
        <div className="flex items-center justify-between">
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
          <div className="flex items-center gap-1">
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
