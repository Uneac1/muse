import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, ChevronDown, LoaderCircle, MessageSquareText, PanelRightOpen, Plus, SendHorizonal, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi, osApi } from '../../lib/api';
import { getChatToolDetails, getChatToolExecutions, getChatUiActions } from '../../lib/aiChatResult';
import { buildMuseCopilotMessage, getMuseAccountHealth, getMuseCopilotConfig, getMuseRouteContext, sortMuseAccounts } from '../../lib/museCopilot';
import type { AgentRuntimeView, AiAccount, AiChatResult, AiMessage } from '../../types';

const THREAD_KEY = 'muse.copilot.thread-map';
const CHAT_TIMEOUT_MS = 45000;

function readThreadMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
      const threadId: number = globalThis.Number(value);
      if (Number.isFinite(threadId) && threadId > 0) acc[key] = threadId;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeThreadMap(value: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(value));
  } catch {
    // Storage quota or privacy mode should not break the assistant panel.
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MuseCopilot({ open, onOpenChange }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const config = useMemo(() => getMuseCopilotConfig(location.pathname), [location.pathname]);
  const routeContext = useMemo<Record<string, string>>(() => getMuseRouteContext(location.pathname, location.search), [location.pathname, location.search]);
  const routeScopeKey = useMemo(() => {
    if (location.pathname !== '/newspaper/read') return location.pathname;
    return `${location.pathname}:${routeContext.article_url || 'preview'}`;
  }, [location.pathname, routeContext.article_url]);
  const [accounts, setAccounts] = useState<AiAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [lastActionSummary, setLastActionSummary] = useState<string | null>(null);
  const [lastChatResult, setLastChatResult] = useState<AiChatResult | null>(null);
  const [runtimeView, setRuntimeView] = useState<AgentRuntimeView | null>(null);
  const [threadMap, setThreadMap] = useState<Record<string, number>>(() => readThreadMap());
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const orderedAccounts = useMemo(() => sortMuseAccounts(accounts), [accounts]);
  const activeAccounts = useMemo(() => orderedAccounts.filter((item) => getMuseAccountHealth(item) === 'active'), [orderedAccounts]);
  const selectedAccount = useMemo(
    () => orderedAccounts.find((item) => item.id === selectedAccountId) || activeAccounts[0] || orderedAccounts[0] || null,
    [orderedAccounts, activeAccounts, selectedAccountId]
  );
  const threadKey = useMemo(
    () => `${routeScopeKey}:${selectedAccount?.id || 'default'}`,
    [routeScopeKey, selectedAccount?.id]
  );
  const currentThreadId = Number.isFinite(threadMap[threadKey]) ? threadMap[threadKey] : null;
  const lastToolExecutions = getChatToolExecutions(lastChatResult);
  const lastToolDetails = getChatToolDetails(lastChatResult);
  const sessionLabel = lastChatResult?.chatSession
    ? `${lastChatResult.chatSession.accountName} · ${lastChatResult.chatSession.model}`
    : selectedAccount
      ? `${selectedAccount.name} · ${selectedAccount.model}`
      : '未选择 AI 账号';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    osApi.getAgentRuntime()
      .then((result) => {
        if (!cancelled) setRuntimeView(result || null);
      })
      .catch(() => {
        if (!cancelled) setRuntimeView(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, location.pathname, location.search]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadAccounts = async () => {
      try {
        setLoadingAccounts(true);
        const result = await aiApi.listAccounts();
        if (cancelled) return;
        const nextAccounts = sortMuseAccounts(Array.isArray(result) ? result : []);
        setAccounts(nextAccounts);
        const firstHealthy = nextAccounts.find((item) => getMuseAccountHealth(item) === 'active') || nextAccounts[0] || null;
        setSelectedAccountId((current) => {
          if (current && nextAccounts.some((item) => item.id === current)) {
            const currentAccount = nextAccounts.find((item) => item.id === current);
            if (currentAccount && getMuseAccountHealth(currentAccount) === 'active') return current;
          }
          return firstHealthy?.id || null;
        });
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || '加载 AI 账号失败');
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    };

    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!selectedAccount || !currentThreadId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        setLoadingMessages(true);
        const result = await aiApi.getMessages(currentThreadId);
        if (!cancelled) setMessages(Array.isArray(result) ? result : []);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error.message || '加载模型对话失败');
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    };

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [open, selectedAccount, currentThreadId]);

  const handleResetThread = () => {
    const nextMap = { ...threadMap };
    delete nextMap[threadKey];
    setThreadMap(nextMap);
    writeThreadMap(nextMap);
    setMessages([]);
    toast.success(`已为 ${config.title} 开启新对话`);
  };

  const handleSend = async (text?: string) => {
    const nextDraft = (text ?? draft).trim();
    if (!nextDraft) return;
    if (!selectedAccount) {
      toast.error('请先在 AI 对话页面启用至少一个 AI 账号');
      return;
    }

    try {
      setSending(true);
      const result = await withTimeout(aiApi.chat(selectedAccount.id, {
        thread_id: currentThreadId,
        message: buildMuseCopilotMessage(location.pathname, nextDraft, routeContext),
        runtime_context: {
          path: location.pathname,
          section: config.title,
          routeContext,
          globalMonitor: false,
          autoExecute: false,
        },
      }), CHAT_TIMEOUT_MS, '模型会话超时未返回，请检查当前模型、代理或账号状态。');
      setLastChatResult(result);
      try {
        setRuntimeView(await osApi.getAgentRuntime());
      } catch {
        setRuntimeView(null);
      }

      const nextThreadId = result.thread.id;
      const nextMap = { ...threadMap, [threadKey]: nextThreadId };
      setThreadMap(nextMap);
      writeThreadMap(nextMap);
      setDraft('');
      const nextMessages = await withTimeout(aiApi.getMessages(nextThreadId), 12000, 'AI 已返回，但消息列表刷新超时。');
      setMessages(Array.isArray(nextMessages) ? nextMessages : []);

      const toolExecutions = getChatToolExecutions(result);
      if (toolExecutions) {
        const summary = `已执行 ${toolExecutions} 次共享运行时动作，正在刷新关联区块数据。`;
        setLastActionSummary(summary);
        window.dispatchEvent(
          new CustomEvent('muse-copilot-action', {
            detail: { path: location.pathname, executions: toolExecutions },
          })
        );
        toast.success(`已执行 ${toolExecutions} 次共享运行时动作`);
      }
      if (result.fallbackAccount) {
        toast.success(`主账号失败，已自动切到 ${result.fallbackAccount.name} · ${result.fallbackAccount.model}`);
      }
      if (result.degradedReason) {
        toast.info(result.degradedReason);
      }

      const openAction = getChatUiActions(result).find((action) => action.type === 'open_path' && action.path);
      if (openAction) {
        setTimeout(() => navigate(openAction.path), 300);
      }
    } catch (error: any) {
      toast.error(error.message || '发送到模型会话失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-3 rounded-full border border-cyan-400/35 bg-zinc-950 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_50px_rgba(8,145,178,0.28)] transition hover:bg-zinc-900 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
      >
        <Bot className="h-4 w-4" />
        <span>{config.title} 对话</span>
        <PanelRightOpen className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]">
          <button type="button" aria-label="关闭模型会话面板" className="absolute inset-0 h-full w-full cursor-default" onClick={() => onOpenChange(false)} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${config.title} 对话`}
            className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    原生对话 + 后台运行时
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{config.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{config.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <select
                    value={selectedAccount?.id || ''}
                    onChange={(event) => setSelectedAccountId(Number(event.target.value))}
                    className="w-full appearance-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-9 text-sm text-zinc-900 outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {loadingAccounts && <option>加载账号中...</option>}
                    {!loadingAccounts && accounts.length === 0 && <option value="">暂无 AI 账号</option>}
                    {orderedAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.model} · {getMuseAccountHealth(account) === 'active' ? '可用' : getMuseAccountHealth(account) === 'inactive' ? '停用' : '异常'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
                <button
                  type="button"
                  onClick={handleResetThread}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  <Plus className="h-4 w-4" />
                  新对话
                </button>
              </div>
            </div>

            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              {lastActionSummary && (
                <div className="mt-4 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-800 dark:text-cyan-200">
                  {lastActionSummary}
                </div>
              )}
              {selectedAccount && getMuseAccountHealth(selectedAccount) !== 'active' && (
                <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
                  当前账号最近诊断异常，但系统仍会尝试自动切换到后备账号继续完成本轮模型会话。
                </div>
              )}
              {lastChatResult?.fallbackAccount && (
                <div className="mt-4 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-800 dark:text-cyan-200">
                  本轮已自动切换到后备账号 {lastChatResult.fallbackAccount.name} · {lastChatResult.fallbackAccount.model} 继续执行。
                </div>
              )}
              {lastChatResult?.degradedReason && (
                <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
                  {lastChatResult.degradedReason}
                </div>
              )}
              {lastToolDetails.length ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">最近动作</div>
                  <div className="mt-3 space-y-2">
                    {lastToolDetails.slice(0, 4).map((item, index) => (
                      <div key={`${item.tool}-${index}`} className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${item.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.tool}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">{item.target || item.error || '执行完成'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {runtimeView ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">后台运行时</div>
                  <div className="mt-2">模式：{runtimeView.mode}</div>
                  <div>焦点：{runtimeView.currentFocusPath || location.pathname}</div>
                  <div>记忆整理：{runtimeView.compactionState}</div>
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {!selectedAccount ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                    <MessageSquareText className="mx-auto h-8 w-8 text-zinc-400" />
                    <div className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">还没有可用 AI 账号</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">先去 AI 对话页面启用至少一个可用账号，这里就能直接和对应模型原生对话。</div>
                  </div>
                </div>
              ) : loadingMessages ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-[24px] bg-zinc-100 dark:bg-zinc-900" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50/70 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                    <Bot className="mx-auto h-8 w-8 text-cyan-500" />
                    <div className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">当前页面还没有开始模型会话</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">主聊天区保持模型原生回复风格；后台运行时只在需要时补充页面事实、共享记忆和工具动作。</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isUser = message.role === 'user';
                    const content = message.content;

                    return (
                      <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-[24px] px-4 py-3 ${isUser ? 'bg-zinc-950 text-white dark:bg-cyan-500 dark:text-zinc-950' : 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>
                          <div className={`mb-2 text-[11px] uppercase tracking-[0.18em] ${isUser ? 'text-white/65 dark:text-zinc-900/65' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {isUser ? 'You' : lastChatResult?.responseMeta?.accountName || config.title}
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-6">{content || message.content}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messageEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="rounded-[28px] border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <textarea
                  rows={4}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!sending) void handleSend();
                    }
                  }}
                  placeholder={`直接对 ${config.title} 对应模型说目标，比如“检查这个页面的问题并自己处理”`}
                  className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    {selectedAccount
                      ? `${sessionLabel}${getMuseAccountHealth(selectedAccount) === 'active' ? '' : ' · 不可用'}`
                      : '未选择 AI 账号'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim() || !selectedAccount}
                    className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
                  >
                    {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                    {sending ? '发送中...' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
