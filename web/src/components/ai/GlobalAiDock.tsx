import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { aiApi, osApi } from '../../lib/api';
import { getChatToolDetails, getChatToolExecutions, getChatUiActions } from '../../lib/aiChatResult';
import { buildMuseCopilotMessage, getMuseAccountHealth, getMuseCopilotConfig, getMuseRouteContext, sortMuseAccounts } from '../../lib/museCopilot';
import type { AgentRuntimeEvent, AiAccount, AiChatResult } from '../../types';

const THREAD_KEY = 'muse.global-dock.thread-map';

function readThreadMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
      const threadId = Number(value);
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
    // Ignore storage failures in the lightweight dock.
  }
}

function clipLine(value: string, limit = 72) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function isNoiseEvent(event: AgentRuntimeEvent) {
  const text = `${event.title} ${event.detail} ${event.eventType} ${event.source}`.toLowerCase();
  return event.source === 'frontend.page_observer'
    || event.eventType === 'mode_change'
    || text.includes('failed to fetch dynamically imported module')
    || text.includes('chunkloaderror')
    || text.includes('loading chunk')
    || text.includes('window_error')
    || text.includes('unhandled')
    || text.includes('render')
    || text.includes('runtime_probe')
    || event.source.startsWith('api:');
}

function pickAssistantText(events: AgentRuntimeEvent[]) {
  for (const event of events) {
    if (isNoiseEvent(event)) continue;
    const assistantMessage = clipLine(String(event.content?.assistantMessage || ''), 72);
    if (assistantMessage) return assistantMessage;
    if (event.scope === 'chat' && /assistant|reply|chat/.test(`${event.eventType} ${event.source}`.toLowerCase())) {
      const detail = clipLine(event.detail, 72);
      if (detail) return detail;
    }
  }
  return '';
}

function pickActionText(events: AgentRuntimeEvent[]) {
  const actionEvent = events.find((event) => (
    (event.scope === 'tool' || event.scope === 'task' || event.scope === 'recovery')
    && !isNoiseEvent(event)
    && !/fail|error|exception|reject/i.test(`${event.title} ${event.detail} ${event.eventType}`)
  ));
  if (!actionEvent) return '';
  return clipLine(actionEvent.detail || actionEvent.title, 60);
}

function pickModelText(events: AgentRuntimeEvent[], selectedAccount: AiAccount | null) {
  for (const event of events) {
    if (isNoiseEvent(event)) continue;
    const accountName = String(event.content?.accountName || '').trim();
    const model = String(event.content?.model || '').trim();
    if (accountName && model) return `${accountName} · ${model}`;
    if (model) return model;
  }
  if (!selectedAccount) return '当前模型：未接入账号';
  return `${selectedAccount.name || selectedAccount.provider} · ${selectedAccount.model}`;
}

export function GlobalAiDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const config = useMemo(() => getMuseCopilotConfig(location.pathname), [location.pathname]);
  const routeContext = useMemo(
    () => getMuseRouteContext(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const [accounts, setAccounts] = useState<AiAccount[]>([]);
  const [events, setEvents] = useState<AgentRuntimeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [lastChatResult, setLastChatResult] = useState<AiChatResult | null>(null);
  const [threadMap, setThreadMap] = useState<Record<string, number>>(() => readThreadMap());

  const orderedAccounts = useMemo(() => sortMuseAccounts(accounts), [accounts]);
  const selectedAccount = useMemo(
    () => orderedAccounts.find((item) => getMuseAccountHealth(item) === 'active') || orderedAccounts[0] || null,
    [orderedAccounts],
  );
  const contentEvents = useMemo(
    () => events.filter((event) => !isNoiseEvent(event)),
    [events],
  );
  const routeScopeKey = useMemo(() => {
    if (location.pathname !== '/newspaper/read') return location.pathname;
    return `${location.pathname}:${routeContext.article_url || 'preview'}`;
  }, [location.pathname, routeContext.article_url]);
  const threadKey = useMemo(
    () => `${routeScopeKey}:${selectedAccount?.id || 'default'}`,
    [routeScopeKey, selectedAccount?.id],
  );
  const currentThreadId = Number.isFinite(threadMap[threadKey]) ? threadMap[threadKey] : null;
  const lastToolExecutions = getChatToolExecutions(lastChatResult);
  const lastToolDetails = getChatToolDetails(lastChatResult);

  useEffect(() => {
    let cancelled = false;
    aiApi.listAccounts()
      .then((result) => {
        if (!cancelled) setAccounts(sortMuseAccounts(Array.isArray(result) ? result : []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeFeed = async () => {
      setLoading(true);
      try {
        const recentEvents = await osApi.listAgentEvents(18);
        if (!cancelled) {
          setEvents(Array.isArray(recentEvents) ? recentEvents : []);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRuntimeFeed();
    const timer = window.setInterval(() => {
      void loadRuntimeFeed();
    }, 9000);
    const handleAction = () => {
      void loadRuntimeFeed();
    };
    window.addEventListener('muse-copilot-action', handleAction as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('muse-copilot-action', handleAction as EventListener);
    };
  }, [location.pathname, location.search]);

  const loadRuntimeFeed = async () => {
    setLoading(true);
    try {
      const recentEvents = await osApi.listAgentEvents(18);
      setEvents(Array.isArray(recentEvents) ? recentEvents : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || !selectedAccount || sending) return;

    try {
      setSending(true);
      const result = await aiApi.chat(selectedAccount.id, {
        thread_id: currentThreadId,
        message: buildMuseCopilotMessage(location.pathname, message, routeContext),
        runtime_context: {
          path: location.pathname,
          section: config.title,
          routeContext,
          globalMonitor: false,
          autoExecute: false,
        },
      });
      setLastChatResult(result);

      const nextMap = { ...threadMap, [threadKey]: result.thread.id };
      setThreadMap(nextMap);
      writeThreadMap(nextMap);
      setDraft('');

      const toolExecutions = getChatToolExecutions(result);
      if (toolExecutions) {
        window.dispatchEvent(
          new CustomEvent('muse-copilot-action', {
            detail: { path: location.pathname, executions: toolExecutions },
          })
        );
      }

      const openAction = getChatUiActions(result).find((action) => action.type === 'open_path' && action.path);
      if (openAction) {
        window.setTimeout(() => navigate(openAction.path), 250);
      }
      await loadRuntimeFeed();
    } catch {
      // Errors are surfaced by the shared API layer.
    } finally {
      setSending(false);
    }
  };

  const outputText = pickAssistantText(contentEvents) || 'AI 暂时还没有新回复';
  const modelText = pickModelText(contentEvents, selectedAccount);
  const actionText = lastToolDetails[0]?.tool || pickActionText(contentEvents) || '等待下一步动作';

  return (
    <div data-ai-ignore="true" className="global-ai-dock">
      <div className="flex items-start gap-2 font-medium text-[color:var(--on-dark)]">
        {loading ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--accent-teal,#5db8a6)]" /> : null}
        <span>{outputText}</span>
      </div>
      <div className="mt-2 grid gap-1 text-[color:var(--on-dark-soft)]">
        <div>模型：{modelText}</div>
        <div>动作：{actionText}</div>
        {lastToolExecutions ? <div>工具：本轮调用 {lastToolExecutions} 次</div> : null}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[8px] bg-[color:var(--surface-dark-soft)] px-3 py-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder={selectedAccount ? `和 ${config.title} 对话` : '先在 AI 页面接入账号'}
          disabled={!selectedAccount || sending}
          className="min-w-0 flex-1 bg-transparent p-0 text-[12px] leading-5 text-[color:var(--on-dark)] outline-none placeholder:text-[color:var(--on-dark-soft)] disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!draft.trim() || !selectedAccount || sending}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)] text-white disabled:cursor-not-allowed disabled:bg-[color:var(--surface-dark-elevated)] disabled:text-[color:var(--on-dark-soft)]"
          aria-label="发送 AI 消息"
        >
          {sending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
