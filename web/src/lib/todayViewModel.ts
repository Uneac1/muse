import type { ActionCenterItem, PersonalOsWorkspace, TodayFocus } from '../types';

const fallbackToday: TodayFocus = {
  headline: 'Today',
  summary: '',
  questions: [],
  priorities: [],
  anomalies: [],
  highlights: [],
};

export function buildTodayViewModel(data: PersonalOsWorkspace | null) {
  const sourceToday = data?.today || fallbackToday;
  const today = {
    headline: sourceToday.headline || 'Today',
    summary: sourceToday.summary || '',
    questions: Array.isArray(sourceToday.questions) ? sourceToday.questions : [],
    priorities: Array.isArray(sourceToday.priorities) ? sourceToday.priorities : [],
    highlights: Array.isArray(sourceToday.highlights) ? sourceToday.highlights : [],
  };
  const stats = {
    inboxCount: data?.stats?.inboxCount || 0,
    alertCount: data?.stats?.alertCount || 0,
    pinnedMemoryCount: data?.stats?.pinnedMemoryCount || 0,
    entityCount: data?.stats?.entityCount || 0,
  };
  const alerts = Array.isArray(data?.alerts) ? data.alerts.slice(0, 5) : [];
  const highlights = today.highlights.slice(0, 6);
  const highlightedAction: ActionCenterItem | undefined = today.priorities[0];
  const immediateLoad = stats.inboxCount + stats.alertCount;

  return {
    today,
    stats,
    alerts,
    highlights,
    highlightedAction,
    immediateLoad,
    focusState: highlightedAction ? '有明确下一步' : '当前平稳',
    focusSummary: highlightedAction?.summary || today.summary || '当前没有新的压顶动作，继续从 Inbox 与异常面板向下推进。',
    heroDescription: today.summary || '把当前最该处理的动作、异常和记忆压进同一张操作台。',
  };
}
