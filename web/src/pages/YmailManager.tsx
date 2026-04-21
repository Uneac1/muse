import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BadgePlus, Copy, ExternalLink, Eye, KeyRound, Mail, MailPlus, RefreshCw, Search, ShieldCheck, Trash2, Unplug } from 'lucide-react';
import { integrationApi } from '../lib/api';
import { isIntegrationCacheFresh, readIntegrationCache, shouldShowInitialLoading, writeIntegrationCache } from '../lib/integrationCache';
import { timeAgo } from '../lib/utils';
import type { YmailAddressCredential, YmailAddressSummary, YmailIntegrationData, YmailMailSummary } from '../types';

const emptyState: YmailIntegrationData = {
  connected: false,
  tokenMasked: '',
  lastSyncAt: null,
  siteUrl: 'https://ymail.y130.icu',
  apiBaseUrl: 'https://ymail-api.y130.icu',
  openSettings: null,
  statistics: null,
  addresses: [],
  addressCount: 0,
};
const YMAIL_CACHE_KEY = 'muse.integration.ymail';
const cachedYmail = readIntegrationCache<YmailIntegrationData>(YMAIL_CACHE_KEY);
const initialYmailAddress = cachedYmail.value?.addresses?.[0] || null;

type YmailMailCache = {
  jwt?: string;
  address?: string;
  results?: YmailMailSummary[];
  count?: number;
};

function ymailMailCacheKey(id: number) {
  return `muse.integration.ymail.mails.${id}`;
}

function scheduleIdleTask(task: () => void) {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => task(), { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(task, 350);
  return () => globalThis.clearTimeout(id);
}

function SectionCard({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="glass-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

export default function YmailManager() {
  const [data, setData] = useState<YmailIntegrationData>(cachedYmail.value || emptyState);
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(shouldShowInitialLoading(cachedYmail.value));
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [addresses, setAddresses] = useState<YmailAddressSummary[]>(cachedYmail.value?.addresses || []);
  const [selectedAddress, setSelectedAddress] = useState<YmailAddressSummary | null>(initialYmailAddress);
  const initialMailCache = initialYmailAddress ? readIntegrationCache<YmailMailCache>(ymailMailCacheKey(initialYmailAddress.id), 60 * 1000).value : null;
  const [credential, setCredential] = useState<YmailAddressCredential | null>(initialMailCache?.jwt ? { jwt: initialMailCache.jwt, address: initialMailCache.address } : null);
  const [mails, setMails] = useState<YmailMailSummary[]>(initialMailCache?.results || []);
  const [mailCount, setMailCount] = useState(initialMailCache?.count || 0);
  const [selectedMail, setSelectedMail] = useState<YmailMailSummary | null>(initialMailCache?.results?.[0] || null);
  const [mailLoading, setMailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', domain: '', enablePrefix: true, enableRandomSubdomain: false });

  const applyData = (result: YmailIntegrationData) => {
    writeIntegrationCache(YMAIL_CACHE_KEY, result);
    setData(result);
    setAddresses(result.addresses || []);
    setSelectedAddress((prev) => (prev ? result.addresses.find((item) => item.id === prev.id) || result.addresses[0] || null : result.addresses[0] || null));
  };

  const load = async () => {
    try {
      setLoading(shouldShowInitialLoading(cachedYmail.value));
      const result = await integrationApi.getYmail();
      applyData(result);
      setCreateForm((prev) => ({ ...prev, domain: prev.domain || result.openSettings?.domains?.[0] || '', enablePrefix: result.openSettings?.prefix ? true : prev.enablePrefix }));
    } catch (err: any) {
      toast.error(err.message || '加载 Ymail 失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAddresses = async (searchQuery = query) => {
    if (!data.connected) return;
    try {
      const result = await integrationApi.listYmailAddresses({ limit: 50, offset: 0, query: searchQuery.trim() || undefined });
      setAddresses(result.results || []);
      setSelectedAddress((prev) => (prev ? result.results.find((item) => item.id === prev.id) || result.results[0] || null : result.results[0] || null));
    } catch (err: any) {
      toast.error(err.message || '加载远端地址失败');
    }
  };

  useEffect(() => {
    if (isIntegrationCacheFresh<YmailIntegrationData>(YMAIL_CACHE_KEY)) return;
    load();
  }, []);

  useEffect(() => {
    if (!selectedAddress || !data.connected) return;
    let cancelled = false;
    const cacheKey = ymailMailCacheKey(selectedAddress.id);
    const cachedMails = readIntegrationCache<YmailMailCache>(cacheKey, 60 * 1000).value;

    if (cachedMails) {
      setCredential((prev) => (prev?.jwt === cachedMails.jwt ? prev : { ...(prev || {}), jwt: cachedMails.jwt || '', address: cachedMails.address || '' }));
      setMails(cachedMails.results || []);
      setMailCount(cachedMails.count || 0);
      setSelectedMail((prev) => (prev ? cachedMails.results?.find((item) => item.id === prev.id) || cachedMails.results?.[0] || null : cachedMails.results?.[0] || null));
      if (!autoRefresh) return () => {
        cancelled = true;
      };
    }

    const fetchMails = async () => {
      try {
        setMailLoading(!cachedMails);
        const result = await integrationApi.getYmailAddressMails(selectedAddress.id, { limit: 20, offset: 0 });
        if (cancelled) return;
        writeIntegrationCache(cacheKey, result);
        setCredential((prev) => (prev?.jwt === result.jwt ? prev : { ...(prev || {}), jwt: result.jwt, address: result.address }));
        setMails(result.results || []);
        setMailCount(result.count || 0);
        setSelectedMail((prev) => (prev ? result.results.find((item) => item.id === prev.id) || result.results[0] || null : result.results[0] || null));
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || '读取邮箱邮件失败');
      } finally {
        if (!cancelled) setMailLoading(false);
      }
    };
    const cancelIdleFetch = cachedMails ? () => undefined : scheduleIdleTask(fetchMails);
    if (!autoRefresh) return () => {
      cancelled = true;
      cancelIdleFetch();
    };
    const timer = window.setInterval(fetchMails, 20000);
    return () => {
      cancelled = true;
      cancelIdleFetch();
      window.clearInterval(timer);
    };
  }, [selectedAddress?.id, data.connected, autoRefresh]);

  const connect = async () => {
    if (!adminPassword.trim()) return toast.error('请先输入 ymail 管理后台密码');
    try {
      setSubmitting(true);
      const result = await integrationApi.connectYmail(adminPassword.trim());
      applyData(result);
      setCreateForm((prev) => ({ ...prev, domain: result.openSettings?.domains?.[0] || prev.domain }));
      setAdminPassword('');
      toast.success('Ymail 后台已连接');
    } catch (err: any) {
      toast.error(err.message || '连接 Ymail 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    try {
      setSubmitting(true);
      const result = await integrationApi.syncYmail();
      applyData(result);
      toast.success('Ymail 数据已同步');
    } catch (err: any) {
      toast.error(err.message || '同步 Ymail 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('确定断开 ymail 后台吗？')) return;
    try {
      setSubmitting(true);
      await integrationApi.disconnectYmail();
      writeIntegrationCache(YMAIL_CACHE_KEY, emptyState);
      setData(emptyState);
      setAddresses([]);
      setSelectedAddress(null);
      setCredential(null);
      setMails([]);
      setSelectedMail(null);
      toast.success('Ymail 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 Ymail 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const createAddress = async () => {
    if (!createForm.name.trim() || !createForm.domain.trim()) return toast.error('请填写地址名和域名');
    try {
      setSubmitting(true);
      const result = await integrationApi.createYmailAddress(createForm);
      setCredential(result);
      await sync();
      toast.success('临时邮箱已创建');
    } catch (err: any) {
      toast.error(err.message || '创建临时邮箱失败');
    } finally {
      setSubmitting(false);
    }
  };

  const revealCredential = async (id: number) => {
    try {
      const result = await integrationApi.getYmailAddressCredential(id);
      setCredential(result);
      toast.success('凭证已加载');
    } catch (err: any) {
      toast.error(err.message || '获取凭证失败');
    }
  };

  const recycleAddress = async (id: number) => {
    if (!confirm('确定回收这个临时邮箱吗？这会直接删除远端地址。')) return;
    try {
      setSubmitting(true);
      await integrationApi.deleteYmailAddress(id);
      if (selectedAddress?.id === id) {
        setSelectedAddress(null);
        setCredential(null);
        setMails([]);
        setSelectedMail(null);
      }
      await loadAddresses();
      await load();
      toast.success('临时邮箱已回收');
    } catch (err: any) {
      toast.error(err.message || '回收临时邮箱失败');
    } finally {
      setSubmitting(false);
    }
  };

  const clearInbox = async (id: number) => {
    if (!confirm('确定清空这个地址的收件箱吗？')) return;
    try {
      await integrationApi.clearYmailInbox(id);
      if (selectedAddress?.id === id) {
        const result = await integrationApi.getYmailAddressMails(id, { limit: 20, offset: 0 });
        writeIntegrationCache(ymailMailCacheKey(id), result);
        setMails(result.results || []);
        setMailCount(result.count || 0);
        setSelectedMail(result.results[0] || null);
      }
      toast.success('收件箱已清空');
    } catch (err: any) {
      toast.error(err.message || '清空收件箱失败');
    }
  };

  const resetPassword = async (id: number) => {
    if (!newPassword.trim()) return toast.error('请先输入新密码');
    try {
      await integrationApi.resetYmailAddressPassword(id, newPassword.trim());
      setNewPassword('');
      toast.success('远端地址密码已重置');
    } catch (err: any) {
      toast.error(err.message || '重置密码失败');
    }
  };

  const removeMail = async (mailId: number) => {
    if (!selectedAddress) return;
    if (!confirm('确定删除这封邮件吗？')) return;
    try {
      await integrationApi.deleteYmailMail(selectedAddress.id, mailId);
      const result = await integrationApi.getYmailAddressMails(selectedAddress.id, { limit: 20, offset: 0 });
      writeIntegrationCache(ymailMailCacheKey(selectedAddress.id), result);
      setMails(result.results || []);
      setMailCount(result.count || 0);
      setSelectedMail(result.results[0] || null);
      toast.success('邮件已删除');
    } catch (err: any) {
      toast.error(err.message || '删除邮件失败');
    }
  };

  const visibleAddresses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return addresses;
    return addresses.filter((item) => [item.name, item.address, item.source_meta, item.id, item.created_at, item.updated_at].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [addresses, query]);

  const stats = data.statistics || {};
  const domainOptions = data.openSettings?.domains || [];

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_left,rgba(249,115,22,0.14),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                <MailPlus className="h-3.5 w-3.5" />
                Ymail 临时邮箱中心
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">自动创建、回收、看信、管凭证，一页拉通</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                这里按 ymail 的真实协议接入，不伪装成普通 IMAP 账号。支持管理员连接、远端地址列表、凭证查看、临时邮箱创建、回收、清空收件箱和邮件实时轮询。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => window.open(data.siteUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                打开 ymail 站点
                <ExternalLink className="h-4 w-4" />
              </button>
              <button onClick={() => window.open(`${data.siteUrl}/admin`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                打开后台
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="已连接" value={data.connected ? '是' : '否'} hint={data.connected ? `上次同步 ${data.lastSyncAt ? timeAgo(data.lastSyncAt) : '刚刚'}` : '等待输入后台密码'} />
        <StatCard label="远端地址数" value={data.addressCount} hint="来自 ymail /admin/address" />
        <StatCard label="邮件总量" value={stats.mailCount || 0} hint="平台统计" />
        <StatCard label="7天活跃地址" value={stats.activeAddressCount7days || 0} hint="平台统计" />
        <StatCard label="30天活跃地址" value={stats.activeAddressCount30days || 0} hint="平台统计" />
        <StatCard label="当前选中邮件" value={mailCount} hint={selectedAddress ? `当前地址 ${selectedAddress.name}` : '先选择一个地址'} />
      </div>

      <SectionCard
        title="后台接入"
        sub="这里填 ymail 管理后台密码。连接成功后，下面所有地址管理和收件查看都会直接走远端 API。"
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={sync} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50">
              <RefreshCw className="h-4 w-4" />
              同步
            </button>
            <button onClick={disconnect} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50">
              <Unplug className="h-4 w-4" />
              断开
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">Ymail 管理后台密码</div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder={data.connected ? `当前已连接：${data.tokenMasked}` : '输入 ymail admin 密码'} className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
              <button onClick={connect} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <ShieldCheck className="h-4 w-4" />
                连接并校验
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-muted-foreground md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="font-medium text-foreground">API 基址</div>
                <div className="mt-1 break-all">{data.apiBaseUrl}</div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="font-medium text-foreground">站点地址</div>
                <div className="mt-1 break-all">{data.siteUrl}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">远端开关与站点能力</div>
            {data.openSettings ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {[
                  ['版本', data.openSettings.version || '-'],
                  ['域名', (data.openSettings.domains || []).join(', ') || '-'],
                  ['允许创建', data.openSettings.enableUserCreateEmail ? '是' : '否'],
                  ['允许发信', data.openSettings.enableSendMail ? '是' : '否'],
                  ['地址密码', data.openSettings.enableAddressPassword ? '是' : '否'],
                  ['随机子域', (data.openSettings.randomSubdomainDomains || []).join(', ') || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-background/60 p-3">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="mt-1 font-medium text-foreground break-all">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="连接后这里会展示 ymail 站点配置。" />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="自动创建临时邮箱" sub="创建动作直接走 ymail /admin/new_address。创建成功后会返回登录 JWT，并自动刷新远端地址列表。">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={data.openSettings?.disableCustomAddressName ? '该站点禁用了自定义名称' : '输入邮箱名前缀，如 promo2026'} disabled={!!data.openSettings?.disableCustomAddressName} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60" />
          <select value={createForm.domain} onChange={(e) => setCreateForm((prev) => ({ ...prev, domain: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20">
            <option value="">选择域名</option>
            {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
          <button onClick={createAddress} disabled={!data.connected || submitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <BadgePlus className="h-4 w-4" />
            创建
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2">
            <input type="checkbox" checked={createForm.enablePrefix} onChange={(e) => setCreateForm((prev) => ({ ...prev, enablePrefix: e.target.checked }))} />
            启用前缀
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2">
            <input type="checkbox" checked={createForm.enableRandomSubdomain} onChange={(e) => setCreateForm((prev) => ({ ...prev, enableRandomSubdomain: e.target.checked }))} />
            启用随机子域名
          </label>
        </div>
        {credential && (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
            <div className="font-medium text-foreground">最近一次创建/查看到的凭证</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/20 bg-background/70 p-3">
                <div className="text-muted-foreground">邮箱地址</div>
                <div className="mt-1 break-all font-medium text-foreground">{credential.address || '需进入邮箱后读取'}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-background/70 p-3">
                <div className="text-muted-foreground">JWT 凭证</div>
                <div className="mt-1 break-all font-medium text-foreground">{credential.jwt}</div>
              </div>
              {credential.password && (
                <div className="rounded-xl border border-emerald-500/20 bg-background/70 p-3">
                  <div className="text-muted-foreground">地址密码</div>
                  <div className="mt-1 break-all font-medium text-foreground">{credential.password}</div>
                </div>
              )}
              {credential.loginUrl && (
                <div className="rounded-xl border border-emerald-500/20 bg-background/70 p-3">
                  <div className="text-muted-foreground">直达登录链接</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="break-all font-medium text-foreground">{credential.loginUrl}</span>
                    <button onClick={() => navigator.clipboard.writeText(credential.loginUrl || '')} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"><Copy className="h-3.5 w-3.5" />复制</button>
                    <button onClick={() => window.open(credential.loginUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"><ExternalLink className="h-3.5 w-3.5" />打开</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="远端临时邮箱列表" sub={`当前显示 ${visibleAddresses.length} 个地址，远端总数 ${data.addressCount}`} action={<button onClick={() => loadAddresses()} disabled={!data.connected} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"><RefreshCw className="h-4 w-4" />刷新列表</button>}>
          <div className="space-y-4">
            <SearchBox value={query} onChange={setQuery} placeholder="按名称、来源、ID 过滤地址" />
            {loading ? <EmptyState text="正在读取远端地址..." /> : visibleAddresses.length === 0 ? <EmptyState text="当前没有远端临时地址。" /> : (
              <div className="space-y-3">
                {visibleAddresses.map((item) => {
                  const active = selectedAddress?.id === item.id;
                  return (
                    <button key={item.id} onClick={() => setSelectedAddress(item)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background/60 hover:border-primary/40 hover:bg-secondary/40'}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-base font-semibold text-foreground">{item.name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">ID {item.id}{item.source_meta ? ` · 来源 ${item.source_meta}` : ''}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border px-2 py-1">收件 {item.mail_count || 0}</span>
                            <span className="rounded-full border border-border px-2 py-1">发件 {item.send_count || 0}</span>
                            {item.created_at && <span className="rounded-full border border-border px-2 py-1">创建于 {timeAgo(item.created_at)}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={(e) => { e.stopPropagation(); revealCredential(item.id); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Eye className="h-3.5 w-3.5" />凭证</button>
                          <button onClick={(e) => { e.stopPropagation(); clearInbox(item.id); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"><Mail className="h-3.5 w-3.5" />清空收件箱</button>
                          <button onClick={(e) => { e.stopPropagation(); recycleAddress(item.id); }} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />回收</button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="地址详情与危险操作" sub="显示当前选中地址的最新凭证、重置密码和登录链接。">
          {!selectedAddress ? <EmptyState text="先在左侧选择一个远端地址。" /> : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-lg font-semibold text-foreground">{selectedAddress.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">远端 ID {selectedAddress.id}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border bg-background/60 p-3"><div className="text-muted-foreground">收件数</div><div className="mt-1 font-semibold text-foreground">{selectedAddress.mail_count || 0}</div></div>
                  <div className="rounded-xl border border-border bg-background/60 p-3"><div className="text-muted-foreground">发件数</div><div className="mt-1 font-semibold text-foreground">{selectedAddress.send_count || 0}</div></div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">邮箱凭证</div>
                  <button onClick={() => revealCredential(selectedAddress.id)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"><Eye className="h-4 w-4" />读取</button>
                </div>
                {credential ? (
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="rounded-xl border border-border bg-background/60 p-3"><div className="text-muted-foreground">地址</div><div className="mt-1 break-all font-medium text-foreground">{credential.address || '等待读取'}</div></div>
                    <div className="rounded-xl border border-border bg-background/60 p-3"><div className="text-muted-foreground">JWT</div><div className="mt-1 break-all font-medium text-foreground">{credential.jwt}</div></div>
                    {credential.loginUrl && <div className="flex flex-wrap gap-2">
                      <button onClick={() => navigator.clipboard.writeText(credential.jwt)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"><Copy className="h-4 w-4" />复制 JWT</button>
                      <button onClick={() => window.open(credential.loginUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"><ExternalLink className="h-4 w-4" />打开邮箱</button>
                    </div>}
                  </div>
                ) : <EmptyState text="点击上方“读取”即可获取该地址的 JWT 凭证。" />}
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-sm font-medium text-foreground">重置远端密码</div>
                <div className="mt-3 flex gap-2">
                  <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="输入新的地址密码" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <button onClick={() => resetPassword(selectedAddress.id)} className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600"><KeyRound className="h-4 w-4" />重置</button>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="最近邮件" sub={selectedAddress ? `${selectedAddress.name} · 自动刷新 ${autoRefresh ? '开启' : '关闭'}` : '先选择地址再看邮件'} action={<label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />自动刷新</label>}>
          {!selectedAddress ? <EmptyState text="先选择地址。" /> : mailLoading ? <EmptyState text="正在读取远端邮件..." /> : mails.length === 0 ? <EmptyState text="当前没有邮件。" /> : (
            <div className="space-y-3">
              {mails.map((item) => {
                const active = selectedMail?.id === item.id;
                return (
                  <button key={item.id} onClick={() => setSelectedMail(item)} className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-primary bg-primary/5' : 'border-border bg-background/60 hover:border-primary/40 hover:bg-secondary/40'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{item.subject || '(无主题)'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.from || item.to || '未知发件人'}</div>
                        <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.text || item.html || JSON.stringify(item.raw || {})}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeMail(item.id); }} className="shrink-0 rounded-md border border-red-500/30 p-2 text-red-600 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="邮件正文与原始数据" sub="尽量展示可读内容；如果结构不固定，会把原始 JSON 一起摊开。">
          {!selectedMail ? <EmptyState text="选中一封邮件后，这里显示正文。" /> : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="text-xl font-semibold text-foreground">{selectedMail.subject || '(无主题)'}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {selectedMail.from && <span className="rounded-full border border-border px-2 py-1">发件人 {selectedMail.from}</span>}
                  {selectedMail.to && <span className="rounded-full border border-border px-2 py-1">收件人 {selectedMail.to}</span>}
                  {selectedMail.created_at && <span className="rounded-full border border-border px-2 py-1">{timeAgo(selectedMail.created_at)}</span>}
                </div>
              </div>
              {selectedMail.text && <div className="rounded-2xl border border-border bg-background/60 p-4"><div className="mb-2 text-sm font-medium text-foreground">文本内容</div><pre className="whitespace-pre-wrap break-words text-sm text-foreground">{selectedMail.text}</pre></div>}
              {selectedMail.html && <div className="rounded-2xl border border-border bg-background/60 p-4"><div className="mb-2 text-sm font-medium text-foreground">HTML 内容</div><div className="max-h-[320px] overflow-auto rounded-xl border border-border bg-background/70 p-3 text-sm" dangerouslySetInnerHTML={{ __html: selectedMail.html }} /></div>}
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="mb-2 text-sm font-medium text-foreground">原始 JSON</div>
                <pre className="max-h-[420px] overflow-auto rounded-xl bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(selectedMail, null, 2)}</pre>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
