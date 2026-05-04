import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Bot,
  CirclePlus,
  Database,
  KeyRound,
  MessageSquareText,
  Pencil,
  RefreshCw,
  SendHorizonal,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../lib/api';
import type { AiAccount, AiAccountDiagnostics, AiChatResult, AiConnectionTestResult, AiMessage, AiProvider, AiThread } from '../types';
import AiAccountDialog from '../components/ai/AiAccountDialog';

const PROVIDER_META: Record<AiProvider, { label: string; surface: string }> = {
  chatgpt: { label: 'ChatGPT', surface: 'from-emerald-500/20 via-emerald-400/8 to-transparent' },
  codex: { label: 'Codex', surface: 'from-cyan-500/25 via-sky-400/10 to-transparent' },
  claude: { label: 'Claude', surface: 'from-rose-500/20 via-orange-400/10 to-transparent' },
  claude_code: { label: 'Claude Code', surface: 'from-rose-500/25 via-amber-400/10 to-transparent' },
  anthropic_compatible: { label: 'Anthropic兼容', surface: 'from-red-500/20 via-orange-400/10 to-transparent' },
  gemini: { label: 'Gemini', surface: 'from-fuchsia-500/20 via-pink-400/10 to-transparent' },
  deepseek: { label: 'DeepSeek', surface: 'from-amber-500/20 via-orange-400/10 to-transparent' },
  mimo: { label: 'MiMo', surface: 'from-lime-500/20 via-emerald-400/10 to-transparent' },
  openai_compatible: { label: 'OpenAI兼容', surface: 'from-indigo-500/20 via-blue-400/10 to-transparent' },
};

const PROVIDER_GUIDE: Record<AiProvider, { protocol: string; recommendedBaseUrl: string; recommendedModel: string; fallback?: string; docs: string[] }> = {
  chatgpt: {
    protocol: 'OpenAI Chat Completions',
    recommendedBaseUrl: 'https://anyrouter.top/v1',
    recommendedModel: 'gpt-4o-mini',
    docs: ['AnyRouter 的 OpenAI 风格账号建议使用 /v1 地址。', '适合日常聊天、图文问答和常规助手场景。'],
  },
  codex: {
    protocol: 'OpenAI Responses',
    recommendedBaseUrl: 'https://anyrouter.top/v1',
    recommendedModel: 'gpt-5-codex',
    docs: ['已按 AnyRouter 的 Codex 用法接到 Responses API。', '适合代码、终端代理和多步执行场景。'],
  },
  claude: {
    protocol: 'Anthropic Messages',
    recommendedBaseUrl: 'https://anyrouter.top',
    recommendedModel: 'claude-opus-4-6',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
    docs: ['Claude/Claude Code 走 AnyRouter 时，Base URL 默认不带 /v1。', '如果主链路网络不稳，可切备用端点后重新测试。'],
  },
  claude_code: {
    protocol: 'Anthropic Messages',
    recommendedBaseUrl: 'https://anyrouter.top',
    recommendedModel: 'claude-opus-4-6',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
    docs: ['这是按你贴的 Claude Code 说明接法做的。', '后端已按 Anthropic Messages 发送，不再误用 OpenAI 协议。'],
  },
  anthropic_compatible: {
    protocol: 'Anthropic Messages',
    recommendedBaseUrl: 'https://anyrouter.top',
    recommendedModel: 'claude-opus-4-6',
    fallback: 'https://pmpjfbhq.cn-nb1.rainapp.top',
    docs: ['适合任意 Anthropic Messages 兼容中转。', '如果你的镜像域名不同，直接改 Base URL 即可。'],
  },
  gemini: {
    protocol: 'Gemini GenerateContent',
    recommendedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    recommendedModel: 'gemini-2.5-flash',
    docs: ['Gemini 仍使用 Google 原生模型接口格式。', '测试连接会拉取 models 列表并缓存到本地。'],
  },
  deepseek: {
    protocol: 'OpenAI Chat Completions',
    recommendedBaseUrl: 'https://api.deepseek.com/v1',
    recommendedModel: 'deepseek-chat',
    docs: ['DeepSeek 官方风格继续走 OpenAI Chat Completions。', '如果你也通过 AnyRouter 转 DeepSeek，可改成 AnyRouter /v1 地址。'],
  },
  mimo: {
    protocol: 'OpenAI Chat Completions',
    recommendedBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    recommendedModel: 'mimo-v2.5-pro',
    fallback: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    docs: ['MiMo 的 Dedicated Base URL 默认使用 OpenAI 兼容 /v1。', '模型名按接口实际返回的小写 ID 保存，避免大小写导致上游拒绝。'],
  },
  openai_compatible: {
    protocol: 'OpenAI Chat Completions',
    recommendedBaseUrl: 'https://anyrouter.top/v1',
    recommendedModel: 'gpt-4o-mini',
    docs: ['适合自定义 OpenAI 风格中转。', '测试连接会直接探测 /models，并显示真实 HTTP 状态和响应预览。'],
  },
};

function formatTime(value?: string | null, withYear = false) {
  if (!value) return '尚未记录';
  return new Date(value).toLocaleString('zh-CN', {
    year: withYear ? 'numeric' : undefined,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withYear ? '2-digit' : undefined,
  });
}

function getStatusLabel(status: AiAccount['status']) {
  if (status === 'active') return '可用';
  if (status === 'inactive') return '停用';
  return '异常';
}

function getReadableStatus(account: AiAccount) {
  if (account.last_test_status === 'never') return '未验证';
  return getStatusLabel(account.status);
}

function getAuthLabel(account: AiAccount) {
  if (account.provider === 'gemini' && account.auth_mode === 'google_oauth') {
    return 'Google OAuth';
  }
  return 'API Key';
}

function maskKey(value?: string) {
  if (!value) return '未填写';
  if (value.length <= 10) return `${value.slice(0, 3)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function parseModels(raw?: string) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function InfoCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: any }) {
  return (
    <div className="rounded-[24px] border border-zinc-200/70 bg-white/70 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
      <div className="mt-3 text-xs uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  );
}

export default function AiStudio() {
  const [accounts, setAccounts] = useState<AiAccount[]>([]);
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [accountDetails, setAccountDetails] = useState<AiAccountDiagnostics | null>(null);
  const [lastTest, setLastTest] = useState<AiConnectionTestResult | null>(null);
  const [lastChatResult, setLastChatResult] = useState<AiChatResult | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [testingAccount, setTestingAccount] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AiAccount | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );
  const selectedThread = useMemo(
    () => threads.find((item) => item.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );
  const selectedGuide = selectedAccount ? PROVIDER_GUIDE[selectedAccount.provider] : null;

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const data = await aiApi.listAccounts();
      setAccounts(data);
      setSelectedAccountId((current) => {
        if (current && data.some((item) => item.id === current)) return current;
        return data[0]?.id || null;
      });
    } catch (error: any) {
      toast.error(error.message || '加载 AI 账号失败');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchDetails = async (accountId: number) => {
    setLoadingDetails(true);
    try {
      const detail = await aiApi.getAccount(accountId);
      setAccountDetails(detail);
    } catch (error: any) {
      toast.error(error.message || '加载 AI 诊断详情失败');
      setAccountDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchThreads = async (accountId: number, preferredThreadId?: number | null) => {
    setLoadingThreads(true);
    try {
      const data = await aiApi.listThreads(accountId);
      setThreads(data);
      setSelectedThreadId((current) => {
        const next = preferredThreadId ?? current;
        if (next && data.some((item) => item.id === next)) return next;
        return data[0]?.id || null;
      });
    } catch (error: any) {
      toast.error(error.message || '加载对话列表失败');
      setThreads([]);
      setSelectedThreadId(null);
    } finally {
      setLoadingThreads(false);
    }
  };

  const fetchMessages = async (threadId: number) => {
    setLoadingMessages(true);
    try {
      setMessages(await aiApi.getMessages(threadId));
    } catch (error: any) {
      toast.error(error.message || '加载消息失败');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setThreads([]);
      setMessages([]);
      setSelectedThreadId(null);
      setAccountDetails(null);
      return;
    }
    fetchThreads(selectedAccountId);
    fetchDetails(selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedThreadId);
  }, [selectedThreadId]);

  const handleSaveAccount = async (payload: Partial<AiAccount>) => {
    try {
      if (editingAccount) {
        await aiApi.updateAccount(editingAccount.id, payload);
        toast.success('AI 账号已更新');
      } else {
        const created = await aiApi.createAccount(payload);
        setSelectedAccountId(created.id);
        toast.success('AI 账号已添加');
      }
      await fetchAccounts();
      if (selectedAccountId) await fetchDetails(selectedAccountId);
    } catch (error: any) {
      toast.error(error.message || '保存 AI 账号失败');
      throw error;
    }
  };

  const handleDeleteAccount = async (account: AiAccount) => {
    if (!confirm(`确定删除 AI 账号“${account.name}”吗？该账号下的所有对话也会一起删除。`)) return;
    try {
      await aiApi.deleteAccount(account.id);
      const nextAccounts = accounts.filter((item) => item.id !== account.id);
      setAccounts(nextAccounts);
      setAccountDetails(null);
      setLastTest(null);
      if (selectedAccountId === account.id) {
        setSelectedAccountId(nextAccounts[0]?.id || null);
      }
      toast.success('AI 账号已删除');
    } catch (error: any) {
      toast.error(error.message || '删除 AI 账号失败');
    }
  };

  const handleDeleteThread = async (thread: AiThread) => {
    if (!confirm(`确定删除对话“${thread.title}”吗？`)) return;
    try {
      await aiApi.deleteThread(thread.id);
      const nextThreads = threads.filter((item) => item.id !== thread.id);
      setThreads(nextThreads);
      if (selectedThreadId === thread.id) {
        setSelectedThreadId(nextThreads[0]?.id || null);
      }
      toast.success('对话已删除');
    } catch (error: any) {
      toast.error(error.message || '删除对话失败');
    }
  };

  const handleRenameThread = async (thread: AiThread) => {
    const title = prompt('新的对话标题', thread.title)?.trim();
    if (!title || title === thread.title) return;
    try {
      const updated = await aiApi.updateThread(thread.id, { title });
      setThreads((current) => current.map((item) => item.id === thread.id ? updated : item));
      toast.success('对话已重命名');
    } catch (error: any) {
      toast.error(error.message || '重命名失败');
    }
  };

  const handleClearThreads = async () => {
    if (!selectedAccountId) return;
    if (!confirm('确定清空当前账号下的所有对话吗？')) return;
    try {
      const result = await aiApi.clearThreads(selectedAccountId);
      setThreads([]);
      setMessages([]);
      setSelectedThreadId(null);
      toast.success(`已清空 ${result.deleted} 个对话`);
    } catch (error: any) {
      toast.error(error.message || '清空对话失败');
    }
  };

  const handleTestAccount = async () => {
    if (!selectedAccountId) return;
    setTestingAccount(true);
    try {
      const result = await aiApi.testAccount(selectedAccountId);
      setLastTest(result);
      await fetchAccounts();
      await fetchDetails(selectedAccountId);
      if (result.ok) toast.success(result.message || '连接测试成功');
      else toast.error(result.message || '连接测试失败');
    } catch (error: any) {
      toast.error(error.message || '连接测试失败');
    } finally {
      setTestingAccount(false);
    }
  };

  const handleSend = async () => {
    if (!selectedAccountId) {
      toast.error('请先添加一个 AI 账号');
      return;
    }
    const message = draft.trim();
    if (!message) return;

    setSending(true);
    try {
      const result = await aiApi.chat(selectedAccountId, {
        thread_id: selectedThreadId,
        message,
      });
      setLastChatResult(result);
      setDraft('');
      await fetchAccounts();
      await fetchThreads(selectedAccountId, result.thread.id);
      setSelectedThreadId(result.thread.id);
      await fetchMessages(result.thread.id);
      await fetchDetails(selectedAccountId);
    } catch (error: any) {
      toast.error(error.message || '发送消息失败');
    } finally {
      setSending(false);
    }
  };

  const totalMessages = threads.reduce((sum, item) => sum + item.message_count, 0);
  const modelCache = accountDetails?.availableModels || parseModels(selectedAccount?.available_models);

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[24px] border border-zinc-200/70 bg-white/95 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 md:p-6"
      >
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              AI Control Surface
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">AI 账号池、会话和诊断合并成一个操作台</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              左侧选账号，中间对话，右侧诊断与模型探针。MiMo、Gemini、Codex、Claude 和 OpenAI 兼容网关都按同一套状态面板管理。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoCard label="AI账号" value={accounts.length} icon={KeyRound} />
            <InfoCard label="当前对话数" value={threads.length} icon={MessageSquareText} />
            <InfoCard label="消息总数" value={totalMessages} icon={Bot} />
            <InfoCard label="模型缓存数" value={modelCache.length} icon={Database} />
          </div>
        </div>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_260px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">AI 账号池</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">切换账号就像切换邮箱，但信息更完整。</p>
            </div>
            <button
              onClick={() => {
                setEditingAccount(null);
                setDialogOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-zinc-950 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
            >
              <CirclePlus className="h-4 w-4" />
              新增
            </button>
          </div>

          <div className="space-y-3">
            {loadingAccounts ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-32 animate-pulse rounded-[24px] bg-zinc-100 dark:bg-zinc-900" />
              ))
            ) : accounts.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                还没有 AI 账号，先添加一个开始。
              </div>
            ) : (
              accounts.map((account) => {
                const meta = PROVIDER_META[account.provider];
                const active = account.id === selectedAccountId;
                return (
                  <div
                    key={account.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAccountId(account.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAccountId(account.id);
                      }
                    }}
                    className={`group relative w-full overflow-hidden rounded-[24px] border p-4 text-left transition ${
                      active
                        ? 'border-cyan-400 bg-zinc-950 text-white shadow-[0_16px_48px_rgba(8,145,178,0.18)] dark:bg-zinc-900'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/70 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${meta.surface} ${active ? 'opacity-100' : 'opacity-70'}`} />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-xs uppercase tracking-[0.26em] ${active ? 'text-cyan-200' : 'text-zinc-400 dark:text-zinc-500'}`}>{meta.label}</div>
                          <div className="mt-2 text-lg font-semibold">{account.name}</div>
                        </div>
                        <div className={`rounded-full px-2.5 py-1 text-xs ${active ? 'bg-white/10 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'}`}>
                          P{account.priority_rank || 1} · {getReadableStatus(account)}
                        </div>
                      </div>

                      <div className={`mt-4 space-y-1 text-sm ${active ? 'text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        <div>模型：{account.model}</div>
                        <div>认证：{getAuthLabel(account)}</div>
                        <div>最近测试：{formatTime(account.last_tested_at)}</div>
                        <div>传输链路：{account.transport_hint || 'unknown'}</div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className={`text-xs ${active ? 'text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'}`}>
                          {account.base_url.replace(/^https?:\/\//, '')}
                        </div>
                        <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAccount(account);
                              setDialogOpen(true);
                            }}
                            className={`rounded-full p-2 ${active ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAccount(account);
                            }}
                            className={`rounded-full p-2 ${active ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">会话列表</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{selectedAccount ? `${selectedAccount.name} 的历史对话` : '选择账号后显示'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearThreads}
                disabled={!selectedAccountId || threads.length === 0}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                清空
              </button>
              <button
                onClick={() => {
                  setSelectedThreadId(null);
                  setMessages([]);
                }}
                disabled={!selectedAccountId}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                新对话
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {!selectedAccountId ? (
              <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                先在左侧选择一个 AI 账号。
              </div>
            ) : loadingThreads ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-[22px] bg-zinc-100 dark:bg-zinc-900" />
              ))
            ) : threads.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                当前账号还没有历史对话，发第一条消息后会自动生成。
              </div>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.id}
                  className={`group rounded-[24px] border p-4 transition ${
                    thread.id === selectedThreadId
                      ? 'border-cyan-400 bg-cyan-50/70 dark:border-cyan-700 dark:bg-cyan-950/20'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-zinc-700'
                  }`}
                >
                  <button onClick={() => setSelectedThreadId(thread.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{thread.title}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{thread.last_message_excerpt || '暂无摘要'}</div>
                      </div>
                      <div className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{thread.message_count} 条</div>
                    </div>
                  </button>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">{formatTime(thread.last_message_at || thread.updated_at)}</div>
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <button
                        onClick={() => handleRenameThread(thread)}
                        title="重命名"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteThread(thread)}
                        title="删除"
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[28px] border border-zinc-200/70 bg-white/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="border-b border-zinc-200/70 px-5 py-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-zinc-400 dark:text-zinc-500">Conversation Deck</div>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{selectedThread?.title || '新对话'}</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {selectedAccount
                      ? `当前账号：${selectedAccount.name} · ${PROVIDER_META[selectedAccount.provider].label} · ${selectedAccount.model}`
                      : '请先在左侧添加或选择一个 AI 账号'}
                  </p>
                  {lastChatResult?.responseMeta && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                        实际响应：{lastChatResult.responseMeta.accountName} · {lastChatResult.responseMeta.model}
                      </span>
                      <span className="rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                        {lastChatResult.responseMeta.protocol}
                      </span>
                      {lastChatResult.fallbackAccount && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                          自动切换 AI 账号：{lastChatResult.fallbackAccount.name} · {lastChatResult.fallbackAccount.model}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {selectedAccount && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestAccount}
                      disabled={testingAccount}
                      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      <Activity className={`h-4 w-4 ${testingAccount ? 'animate-spin' : ''}`} />
                      {testingAccount ? '测试中...' : '测试连接'}
                    </button>
                    <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      {getReadableStatus(selectedAccount)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {!selectedAccount ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-md rounded-[28px] border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
                    <Bot className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                    <h3 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">先连接一个 AI 账号</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">左侧已经支持 ChatGPT、Codex、Claude、Claude Code、Anthropic 兼容、Gemini、DeepSeek 和 OpenAI 兼容接口，下面还会展示诊断和模型探测结果。</p>
                  </div>
                </div>
              ) : loadingMessages ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className={`h-24 animate-pulse rounded-[24px] ${index % 2 === 0 ? 'bg-zinc-100 dark:bg-zinc-900' : 'bg-cyan-50 dark:bg-cyan-950/20'}`} />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-lg rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50/60 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
                    <MessageSquareText className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                    <h3 className="mt-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">从这里开始第一轮对话</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">当前账号的系统提示词、模型和网关信息会和诊断面板同步显示。遇到问题不用再盲查。</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => {
                    const isUser = message.role === 'user';
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] rounded-[28px] px-5 py-4 shadow-sm ${
                          isUser
                            ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950'
                            : 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
                        }`}>
                          <div className={`mb-2 text-xs uppercase tracking-[0.22em] ${isUser ? 'text-white/70 dark:text-zinc-900/70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {isUser ? 'You' : PROVIDER_META[selectedAccount.provider].label}
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                          <div className={`mt-3 text-[11px] ${isUser ? 'text-white/60 dark:text-zinc-900/60' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {formatTime(message.created_at)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-zinc-200/70 px-5 py-4 dark:border-zinc-800">
              <div className="rounded-[28px] border border-zinc-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-zinc-950">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!sending) handleSend();
                    }
                  }}
                  rows={4}
                  placeholder={selectedAccount ? `向 ${selectedAccount.name} 发送消息，Enter 发送，Shift + Enter 换行` : '请先添加或选择一个 AI 账号'}
                  className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    {selectedAccount
                      ? `当前使用 ${PROVIDER_META[selectedAccount.provider].label} · ${selectedAccount.model} · ${selectedAccount.transport_hint || 'unknown'}`
                      : '未选择 AI 账号'}
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={sending || !selectedAccount || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
                  >
                    {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                    {sending ? '发送中...' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">诊断中心</h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">把账号配置、连通性、状态和错误原样摊开。</p>
                </div>
                {loadingDetails && <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />}
              </div>

              {!selectedAccount ? (
                <div className="rounded-[24px] border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  选择一个账号后这里会展示完整诊断。
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoCard label="测试状态" value={getReadableStatus(selectedAccount)} icon={ShieldCheck} />
                    <InfoCard label="HTTP状态" value={selectedAccount.last_http_status ?? '--'} sub={`最近测试 ${formatTime(selectedAccount.last_tested_at)}`} icon={Server} />
                    <InfoCard label="延迟" value={selectedAccount.last_test_latency_ms ? `${selectedAccount.last_test_latency_ms} ms` : '--'} icon={Activity} />
                    <InfoCard label="模型缓存" value={modelCache.length} sub={`最后同步 ${formatTime(selectedAccount.last_models_synced_at)}`} icon={Database} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ['账号名称', selectedAccount.name],
                      ['供应商', PROVIDER_META[selectedAccount.provider].label],
                      ['认证方式', getAuthLabel(selectedAccount)],
                      ['请求协议', selectedGuide?.protocol || '--'],
                      ['当前模型', selectedAccount.model],
                      ['优先级', `${selectedAccount.priority_rank || 1}`],
                      ['Base URL', selectedAccount.base_url],
                      ['API Key', maskKey(selectedAccount.api_key)],
                      ['传输方式', selectedAccount.transport_hint || 'unknown'],
                      ['创建时间', formatTime(selectedAccount.created_at, true)],
                      ['最后使用', formatTime(selectedAccount.last_used_at, true)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[20px] border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">{label}</div>
                        <div className="mt-2 break-all text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">系统提示词</div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{selectedAccount.system_prompt || '未设置'}</div>
                    </div>
                    <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">备注</div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">{selectedAccount.remark || '未填写'}</div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">最近错误</div>
                    <div className="mt-3 whitespace-pre-wrap break-all text-sm leading-6 text-zinc-700 dark:text-zinc-300">{selectedAccount.last_error || '暂无'}</div>
                  </div>

                  <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">最近响应预览</div>
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-zinc-700 dark:text-zinc-300">{selectedAccount.last_response_preview || '暂无'}</pre>
                  </div>

                  {selectedGuide && (
                    <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">AnyRouter 接入说明</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          推荐地址：{selectedGuide.recommendedBaseUrl}
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          推荐模型：{selectedGuide.recommendedModel}
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          协议：{selectedGuide.protocol}
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          备用地址：{selectedGuide.fallback || '当前无预设备用地址'}
                        </div>
                      </div>
                      {selectedAccount.provider === 'gemini' && selectedAccount.auth_mode === 'google_oauth' && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            OAuth 邮箱：{selectedAccount.oauth_email || '未记录'}
                          </div>
                          <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            Project ID：{selectedAccount.oauth_project_id || '未填写'}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 space-y-2">
                        {selectedGuide.docs.map((item) => (
                          <div key={item} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-zinc-200/70 bg-white/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">模型与探针结果</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">可用模型、探针 endpoint、响应摘要都放在这里。</p>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">最近测试结论</div>
                  <div className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    {lastTest?.message || selectedAccount?.last_error || '尚未执行连接测试'}
                  </div>
                  {lastTest && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">endpoint: {lastTest.endpoint}</div>
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">transport: {lastTest.transport}</div>
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">模型缓存列表</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">{modelCache.length} 个</div>
                  </div>
                  <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-auto">
                    {modelCache.length === 0 ? (
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">还没有拉到模型列表，先点“测试连接”。</div>
                    ) : (
                      modelCache.map((model) => (
                        <span key={model} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                          {model}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">最近探针原始预览</div>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-zinc-700 dark:text-zinc-300">
                    {lastTest?.preview || selectedAccount?.last_response_preview || '暂无'}
                  </pre>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>

      <AiAccountDialog
        open={dialogOpen}
        account={editingAccount}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveAccount}
      />
    </div>
  );
}
